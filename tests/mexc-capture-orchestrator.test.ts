import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createBrokerRawLedgerState } from '../lib/server/broker-raw-ledger'
import {
  BrokerCapturePersistenceError,
  buildBrokerCapturePageRpcArguments,
  commitBrokerCapturePageWithClient,
} from '../lib/server/broker-capture-persistence'
import {
  applyMexcCapturedPage,
  MexcCaptureOrchestratorError,
  type MexcCapturedPageInput,
} from '../lib/server/mexc-capture-orchestrator'
import { MexcOracleError } from '../lib/server/mexc-oracles'
import { createMexcPageCheckpoint } from '../lib/server/mexc-pagination'
import { createMexcSyncScope, type MexcSyncScopeInput } from '../lib/server/mexc-sync-scope'
import {
  executeMexcPrivateReadWorkUnit,
  MexcTransportError,
  type MexcPrivateCapabilityId,
  type MexcTransportCaptureBinding,
  type MexcWireResponse,
} from '../lib/server/mexc-transport'

const DAY_MS = 24 * 60 * 60 * 1_000
const BUCKET_START = Date.UTC(2025, 9, 8)
const WINDOW_START = BUCKET_START - 2 * DAY_MS
const WINDOW_END = BUCKET_START + DAY_MS
const SERVER_TIME = WINDOW_END
const EVENT_TIME = BUCKET_START + 12 * 60 * 60 * 1_000
const CHECKPOINT_KEY = new TextEncoder().encode('0123456789abcdef0123456789abcdef')
const CREDENTIALS = Object.freeze({ apiKey: 'fixture-api-key', secretKey: 'fixture-secret-key' })

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function uuid(value: string) {
  const hash = digest(value)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

const ACCOUNT = Object.freeze({
  digestAlgorithm: 'hmac-sha256' as const,
  digestContractVersion: 'equora-tcj-v1' as const,
  purpose: 'broker_account_identity_v1' as const,
  keyVersion: 'v1',
  digest: digest('capture-account'),
  verificationStatus: 'unverified_reference' as const,
})
const RUN_REFERENCE = Object.freeze({ referenceType: 'sync_run_id_v1' as const, value: uuid('run') })
const WORK_UNIT_REFERENCE = Object.freeze({ referenceType: 'capture_work_unit_id_v1' as const, value: uuid('work-unit') })
const CONNECTION_ACCOUNT_ID = uuid('connection-account')
const REQUEST_RESULT_REFERENCE = Object.freeze({
  referenceType: 'provider_request_result_id_v1' as const,
  value: uuid('request-result'),
})
const REQUEST_AUTHORIZATION_ID = uuid('request-authorization')

function responseAt(url: string, body: BodyInit | null, init: ResponseInit = {}) {
  const response = new Response(body, init)
  Object.defineProperty(response, 'url', { configurable: true, value: url })
  Object.defineProperty(response, 'redirected', { configurable: true, value: false })
  return response
}

function success(url: string, data: unknown) {
  return responseAt(url, JSON.stringify({ success: true, code: 0, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    orderId: '123',
    positionId: '456',
    symbol: 'BTC_USDT',
    side: 1,
    positionMode: 1,
    state: 3,
    category: 1,
    orderType: 1,
    vol: '2.5000',
    dealVol: '2.5000',
    price: '100.1250',
    dealAvgPrice: '100.1250',
    takerFee: '-0.0100',
    makerFee: '0',
    profit: '1.5000',
    feeCurrency: 'USDT',
    createTime: EVENT_TIME,
    updateTime: EVENT_TIME + 1_000,
    ...overrides,
  }
}

function syncScope(overrides: Partial<MexcSyncScopeInput> = {}): MexcSyncScopeInput {
  return Object.freeze({
    providerCode: 'mexc',
    accountIdentity: ACCOUNT,
    brokerAccountId: uuid('broker-account'),
    syncActivationId: uuid('activation'),
    activationGeneration: 1,
    capabilityId: 'historical_orders_v1',
    instrumentScope: Object.freeze({
      scopeType: 'mexc_futures_symbol_v1',
      symbol: 'BTC_USDT',
      positionType: null,
    }),
    providerContractVersion: 'mexc_futures_contract_v1',
    adapterVersion: 'v57_61_0',
    sourceChannel: 'provider_api_observation',
    profileId: 'mexc_futures_rest',
    profileVersion: 'v1',
    laneId: 'incremental_fast_6h',
    requestWindow: Object.freeze({ startTimeMs: WINDOW_START, endTimeMs: WINDOW_END }),
    bucket: Object.freeze({ startTimeMs: BUCKET_START, endTimeMs: BUCKET_START + DAY_MS }),
    boundaryPolicyVersion: 'mexc_provider_unverified_overlap_v1',
    boundarySemantics: 'provider_unverified',
    overlapPolicy: 'minimum_72h_v1',
    scopeGeneration: 1,
    stabilityGeneration: 1,
    coverageBasis: 'provider_observed',
    coveragePolicy: 'provider_observed_best_effort',
    scopeCompleteness: 'unverified',
    stabilityStatus: 'not_observed',
    digestVersion: 'equora-tcj-v1',
    ...overrides,
  })
}

async function authenticWireResponse(
  capabilityId: MexcPrivateCapabilityId,
  data: unknown,
  options: Readonly<{
    scopeInput?: MexcSyncScopeInput
    query?: Record<string, unknown>
    binding?: Partial<MexcTransportCaptureBinding>
    withoutBinding?: boolean
  }> = {},
): Promise<MexcWireResponse> {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    return url.endsWith('/api/v1/contract/ping') ? success(url, SERVER_TIME) : success(url, data)
  }))
  const scopeInput = options.scopeInput ?? syncScope({
    capabilityId,
    instrumentScope: {
      scopeType: 'mexc_futures_symbol_v1',
      symbol: 'BTC_USDT',
      positionType: capabilityId === 'historical_positions_v1' || capabilityId === 'funding_records_v1' ? 1 : null,
    },
  })
  const scope = createMexcSyncScope(scopeInput)
  const query = options.query ?? {
    symbol: 'BTC_USDT',
    start_time: WINDOW_START,
    end_time: WINDOW_END,
    page_num: 1,
    page_size: 20,
    ...(capabilityId === 'historical_positions_v1' || capabilityId === 'funding_records_v1'
      ? { position_type: 1 }
      : {}),
  }
  const captureBinding: MexcTransportCaptureBinding = Object.freeze({
    bindingVersion: 'mexc-transport-capture-binding-v1',
    accountIdentity: scope.accountIdentity,
    brokerAccountId: scope.brokerAccountId,
    connectionAccountId: CONNECTION_ACCOUNT_ID,
    syncActivationId: scope.syncActivationId,
    activationGeneration: scope.activationGeneration,
    scopeDigest: scope.scopeDigest,
    workUnitReference: WORK_UNIT_REFERENCE,
    runReference: RUN_REFERENCE,
    requestResultReference: REQUEST_RESULT_REFERENCE,
    requestSequence: 1,
    ...options.binding,
  })
  const result = await executeMexcPrivateReadWorkUnit([
    options.withoutBinding ? { capabilityId, query } : { capabilityId, query, captureBinding },
  ], options.withoutBinding
    ? () => CREDENTIALS
    : () => Object.freeze({
        credentials: CREDENTIALS,
        accountIdentity: captureBinding.accountIdentity,
        brokerAccountId: captureBinding.brokerAccountId,
        connectionAccountId: captureBinding.connectionAccountId,
        syncActivationId: captureBinding.syncActivationId,
        activationGeneration: captureBinding.activationGeneration,
      }), options.withoutBinding
        ? undefined
        : async (context) => Object.freeze({
            status: 'request_authorized' as const,
            requestAuthorizationId: REQUEST_AUTHORIZATION_ID,
            sendDeadlineAt: new Date(SERVER_TIME + 5_000).toISOString(),
            workUnitId: context.workUnitId,
            requestSequence: context.requestSequence,
            capabilityId: context.capabilityId,
            scopeDigest: context.scopeDigest,
            credentialReference: Object.freeze({
              id: uuid('credential'),
              keyVersion: 'test_v1',
            }),
            authorityBlocked: true as const,
          }),
      options.withoutBinding
        ? undefined
        : Object.freeze({ absoluteDeadlineAtMs: SERVER_TIME + 60_000 }),
    )
  const outcome = result.outcomes[0]
  if (!outcome || outcome.status !== 'wire_succeeded') throw new Error('Expected authentic successful fixture response')
  return outcome.response
}

function captureInput(wireResponse: MexcWireResponse, overrides: Partial<MexcCapturedPageInput> = {}): MexcCapturedPageInput {
  const checkpoint = createMexcPageCheckpoint('historical_orders_v1', {
    symbol: 'BTC_USDT',
    startTime: WINDOW_START,
    endTime: WINDOW_END,
    pageNumber: 1,
    pageSize: 20,
  }, CHECKPOINT_KEY)
  return Object.freeze({
    syncScope: syncScope(),
    checkpoint,
    checkpointIntegrityKey: CHECKPOINT_KEY,
    ledgerState: createBrokerRawLedgerState('mexc', ACCOUNT),
    expectedLedgerGeneration: 0,
    wireResponse,
    runReference: RUN_REFERENCE,
    requestResultReference: REQUEST_RESULT_REFERENCE,
    requestSequence: 1,
    ...overrides,
  })
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(SERVER_TIME)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('closed MEXC capture orchestrator', () => {
  it('commits one authentic Body→Oracle→Pagination→Raw-Ledger page atomically', async () => {
    const wireResponse = await authenticWireResponse('historical_orders_v1', [order()])
    const result = applyMexcCapturedPage(captureInput(wireResponse))

    expect(result).toMatchObject({
      orchestratorVersion: 'mexc-capture-orchestrator-v1',
      status: 'page_committed',
      authorityBlocked: true,
      pageTransition: {
        action: 'stop_terminal',
        scopeCompleteness: 'unverified',
        checkpoint: { terminalEvidence: 'short_bare_array', authorityBlocked: true },
      },
      rawLedgerTransition: {
        counts: { insertedRawEvents: 1, firstObservations: 1, repeatedObservations: 0 },
        authorityBlocked: true,
      },
    })
    expect(result.pageObservation.rawBodyDigest).toEqual(wireResponse.rawBodyDigest)
    expect(result.rawLedgerTransition!.pageObservation.rawBodyDigest).toEqual(wireResponse.rawBodyDigest)
    expect(result.rawLedgerTransition!.pageObservation.scopeDigest).toEqual(result.syncScope.scopeDigest)
    expect(result.rawLedgerTransition!.pageObservation.observedAtUs).toBe(wireResponse.responseReceivedAtUs)
    expect(result.rawLedgerTransition!.state.rawEvents[0]).toMatchObject({
      externalEventId: '123',
      eventType: 'order',
      providerOccurredAtUs: String(BigInt(EVENT_TIME) * BigInt(1_000)),
      authorityBlocked: true,
    })
    expect(result.rawLedgerTransition!.state.rawEvents[0]!.rawPayload)
      .toBe(result.oracleResult.records[0])
  })

  it('rejects spread/reflection Wire-Response forgeries before either state can advance', async () => {
    const authentic = await authenticWireResponse('historical_orders_v1', [order()])
    const originalInput = captureInput(authentic)
    const forged = Object.freeze({ ...authentic })

    expect(() => applyMexcCapturedPage({ ...originalInput, wireResponse: forged } as never))
      .toThrowError(MexcTransportError)
    expect(originalInput.checkpoint.totalSuccessfulPages).toBe(0)
    expect(originalInput.ledgerState.ledgerGeneration).toBe(0)
  })

  it('rejects an authentic private preview response without a capture-purpose binding', async () => {
    const unbound = await authenticWireResponse('historical_orders_v1', [], { withoutBinding: true })

    expect(() => applyMexcCapturedPage(captureInput(unbound))).toThrowError(MexcCaptureOrchestratorError)
  })

  it('rejects normative scope/checkpoint drift before consuming the authentic response', async () => {
    const authentic = await authenticWireResponse('historical_orders_v1', [order()])
    const originalInput = captureInput(authentic)
    const mismatchingScope = syncScope({
      instrumentScope: { scopeType: 'mexc_futures_symbol_v1', symbol: 'ETH_USDT', positionType: null },
    })

    expect(() => applyMexcCapturedPage({ ...originalInput, syncScope: mismatchingScope }))
      .toThrowError(MexcCaptureOrchestratorError)
    expect(originalInput.checkpoint.totalSuccessfulPages).toBe(0)
    expect(originalInput.ledgerState.ledgerGeneration).toBe(0)
  })

  it('rejects provider records outside the requested scope without creating raw events', async () => {
    const authentic = await authenticWireResponse('historical_orders_v1', [order({ symbol: 'ETH_USDT' })])
    const originalInput = captureInput(authentic)

    expect(() => applyMexcCapturedPage(originalInput)).toThrowError(MexcOracleError)
    expect(originalInput.checkpoint.totalSuccessfulPages).toBe(0)
    expect(originalInput.ledgerState.rawEvents).toHaveLength(0)
  })

  it('binds the request sequence to the authenticated checkpoint attempt count', async () => {
    const authentic = await authenticWireResponse('historical_orders_v1', [order()])
    const originalInput = captureInput(authentic)

    expect(() => applyMexcCapturedPage({ ...originalInput, requestSequence: 2 }))
      .toThrowError(MexcCaptureOrchestratorError)
    expect(originalInput.ledgerState.ledgerGeneration).toBe(0)
  })

  it('rejects an authentic empty Orders response in an Executions capture context', async () => {
    const authentic = await authenticWireResponse('historical_orders_v1', [])
    const executionScope = syncScope({ capabilityId: 'historical_executions_v3' })
    const executionCheckpoint = createMexcPageCheckpoint('historical_executions_v3', {
      symbol: 'BTC_USDT',
      startTime: WINDOW_START,
      endTime: WINDOW_END,
      pageNumber: 1,
      pageSize: 20,
    }, CHECKPOINT_KEY)

    expect(() => applyMexcCapturedPage(captureInput(authentic, {
      syncScope: executionScope,
      checkpoint: executionCheckpoint,
    }))).toThrowError(MexcCaptureOrchestratorError)
  })

  it.each([
    ['symbol', { symbol: 'ETH_USDT' }],
    ['window start', { start_time: WINDOW_START + 1 }],
    ['window end', { end_time: WINDOW_END - 1 }],
    ['page', { page_num: 2 }],
    ['page size', { page_size: 19 }],
  ])('rejects authentic same-capability response from a different %s request', async (_label, queryOverride) => {
    const query = {
      symbol: 'BTC_USDT',
      start_time: WINDOW_START,
      end_time: WINDOW_END,
      page_num: 1,
      page_size: 20,
      ...queryOverride,
    }
    const authentic = await authenticWireResponse('historical_orders_v1', [], { query })

    expect(() => applyMexcCapturedPage(captureInput(authentic))).toThrowError(MexcCaptureOrchestratorError)
  })

  it('rejects cross-account purpose substitution despite an otherwise identical request', async () => {
    const otherAccount = Object.freeze({ ...ACCOUNT, digest: digest('other-account') })
    const otherScope = syncScope({ accountIdentity: otherAccount, brokerAccountId: uuid('other-broker-account') })
    const authentic = await authenticWireResponse('historical_orders_v1', [], { scopeInput: otherScope })

    expect(() => applyMexcCapturedPage(captureInput(authentic))).toThrowError(MexcCaptureOrchestratorError)
  })

  it.each([
    ['scope digest', {
      scopeDigest: Object.freeze({
        ...createMexcSyncScope(syncScope()).scopeDigest,
        digest: digest('other-scope-digest'),
      }),
    }],
    ['run reference', {
      runReference: Object.freeze({
        referenceType: 'sync_run_id_v1' as const,
        value: uuid('other-run'),
      }),
    }],
    ['request-result reference', {
      requestResultReference: Object.freeze({
        referenceType: 'provider_request_result_id_v1' as const,
        value: uuid('other-request-result'),
      }),
    }],
    ['request sequence', { requestSequence: 2 }],
    ['broker account', { brokerAccountId: uuid('other-bound-broker-account') }],
    ['activation id', { syncActivationId: uuid('other-bound-activation') }],
    ['activation generation', { activationGeneration: 2 }],
  ] satisfies readonly (readonly [string, Partial<MexcTransportCaptureBinding>])[])(
    'rejects authentic response with only mismatching capture-binding %s',
    async (_label, binding) => {
      const authentic = await authenticWireResponse('historical_orders_v1', [], { binding })

      expect(() => applyMexcCapturedPage(captureInput(authentic))).toThrowError(MexcCaptureOrchestratorError)
    },
  )

  it('consumes each authentic capture response at most once in the current process', async () => {
    const authentic = await authenticWireResponse('historical_orders_v1', [order()])
    const input = captureInput(authentic)
    expect(applyMexcCapturedPage(input).status).toBe('page_committed')

    expect(() => applyMexcCapturedPage(input)).toThrowError(/bereits verbraucht/)
  })

  it('binds the captured result to the exact originating authentic Wire Response object', async () => {
    const firstWireResponse = await authenticWireResponse('historical_orders_v1', [order()])
    const capturedPage = applyMexcCapturedPage(captureInput(firstWireResponse))
    const secondWireResponse = await authenticWireResponse('historical_orders_v1', [order()])

    expect(() => buildBrokerCapturePageRpcArguments({
      requestAuthorizationId: REQUEST_AUTHORIZATION_ID,
      leaseToken: uuid('lease-token'),
      integrityKey: CHECKPOINT_KEY,
      integrityKeyVersion: 'test_v1',
      expectedWorkUnitRowVersion: 7,
      wireResponse: secondWireResponse,
      capturedPage,
    })).toThrowError(/Ursprungsrelation/)
  })

  it('carries a canonical empty Funding page through both terminal contracts without authority', async () => {
    const fundingScope = syncScope({
      capabilityId: 'funding_records_v1',
      instrumentScope: { scopeType: 'mexc_futures_symbol_v1', symbol: 'BTC_USDT', positionType: 1 },
    })
    const authentic = await authenticWireResponse('funding_records_v1', {
      currentPage: 1,
      pageSize: 20,
      totalCount: 0,
      totalPage: 0,
      resultList: [],
    }, { scopeInput: fundingScope })
    const fundingCheckpoint = createMexcPageCheckpoint('funding_records_v1', {
      symbol: 'BTC_USDT',
      startTime: WINDOW_START,
      endTime: WINDOW_END,
      pageNumber: 1,
      pageSize: 20,
      positionType: 1,
    }, CHECKPOINT_KEY)
    const result = applyMexcCapturedPage(captureInput(authentic, {
      syncScope: fundingScope,
      checkpoint: fundingCheckpoint,
    }))

    expect(result).toMatchObject({
      status: 'page_committed',
      oracleResult: { status: 'blocked_funding_authority', page: { totalCount: 0, totalPage: 0 } },
      pageTransition: {
        action: 'stop_terminal',
        checkpoint: { terminalEvidence: 'canonical_empty_page', authorityBlocked: true },
      },
      rawLedgerTransition: {
        counts: { insertedRawEvents: 0, firstObservations: 0, repeatedObservations: 0 },
        authorityBlocked: true,
      },
    })
  })

  it('rejects an authentic empty Funding response from another position type', async () => {
    const fundingScope = syncScope({
      capabilityId: 'funding_records_v1',
      instrumentScope: { scopeType: 'mexc_futures_symbol_v1', symbol: 'BTC_USDT', positionType: 1 },
    })
    const authentic = await authenticWireResponse('funding_records_v1', {
      currentPage: 1,
      pageSize: 20,
      totalCount: 0,
      totalPage: 0,
      resultList: [],
    }, {
      scopeInput: fundingScope,
      query: {
        symbol: 'BTC_USDT',
        position_type: 2,
        start_time: WINDOW_START,
        end_time: WINDOW_END,
        page_num: 1,
        page_size: 20,
      },
    })
    const fundingCheckpoint = createMexcPageCheckpoint('funding_records_v1', {
      symbol: 'BTC_USDT',
      startTime: WINDOW_START,
      endTime: WINDOW_END,
      pageNumber: 1,
      pageSize: 20,
      positionType: 1,
    }, CHECKPOINT_KEY)

    expect(() => applyMexcCapturedPage(captureInput(authentic, {
      syncScope: fundingScope,
      checkpoint: fundingCheckpoint,
    }))).toThrowError(MexcCaptureOrchestratorError)
  })

  it('serializes an authentic committed page into the closed server-only RPC contract', async () => {
    // The static MAC vector authenticates request duration, so its monotonic clock input must be deterministic.
    vi.spyOn(performance, 'now').mockReturnValue(1_000)
    const wireResponse = await authenticWireResponse('historical_orders_v1', [order()])
    const capturedPage = applyMexcCapturedPage(captureInput(wireResponse))
    const args = buildBrokerCapturePageRpcArguments({
      requestAuthorizationId: REQUEST_AUTHORIZATION_ID,
      leaseToken: uuid('lease-token'),
      integrityKey: CHECKPOINT_KEY,
      integrityKeyVersion: 'test_v1',
      expectedWorkUnitRowVersion: 7,
      wireResponse,
      capturedPage,
    })
    expect(args.p_transition_mac).toBe('6fa53931bf1da17bb8f8be9b714c3193611dbe3891c0eca782ffd221e8e6c137')
    expect(args).toMatchObject({
      p_request_authorization_id: REQUEST_AUTHORIZATION_ID,
      p_work_unit_id: uuid('work-unit'),
      p_expected_run_id: RUN_REFERENCE.value,
      p_expected_broker_account_id: syncScope().brokerAccountId,
      p_expected_connection_account_id: CONNECTION_ACCOUNT_ID,
      p_expected_sync_activation_id: syncScope().syncActivationId,
      p_expected_activation_generation: 1,
      p_transition_mac_version: 'equora-broker-capture-transition-hmac-sha256-v1',
      p_transition_integrity_key_version: 'test_v1',
      p_transition_mac: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_lease_token: uuid('lease-token'),
      p_expected_work_unit_row_version: 7,
      p_expected_checkpoint_mac: capturedPage.commitPrecondition.expectedCheckpointMac,
      p_expected_ledger_generation: 0,
      p_request_result_id: REQUEST_RESULT_REFERENCE.value,
      p_request_sequence: 1,
      p_method: 'GET',
      p_request_origin: 'https://api.mexc.com',
      p_request_path: '/api/v1/private/order/list/history_orders',
      p_transport_contract_version: 'mexc-readonly-transport-v1',
      p_http_status: 200,
      p_provider_status_class: 'success',
      p_scope_completeness: 'unverified',
      p_raw_body_digest: wireResponse.rawBodyDigest.digest,
      p_raw_body_bytes: wireResponse.rawBodyBytes,
      p_page_observation_digest: capturedPage.rawLedgerTransition!.pageObservation.pageObservationDigest.digest,
    })
    expect(Buffer.from(args.p_raw_body_base64, 'base64').toString('utf8')).toBe(
      JSON.stringify({ success: true, code: 0, data: [order()] }),
    )
    expect(args.p_next_checkpoint).toEqual(capturedPage.pageTransition.checkpoint)
    expect(args.p_events).toHaveLength(1)
    expect(args.p_events[0]).toMatchObject({
      accountIdentityDigest: ACCOUNT.digest,
      eventIndex: 0,
      eventType: 'order',
      externalEventId: '123',
      identityStatus: 'stable_provider_id',
      occurrence: 'first_observation',
      providerCode: 'mexc',
      providerRevision: null,
      providerRevisionAuthority: 'unverified',
      revisionDiscriminator: 'payload_hash_fallback',
    })
    expect(JSON.parse(args.p_events[0]!.rawPayloadJson as string)).toMatchObject({ orderId: '123', symbol: 'BTC_USDT' })

    expect(() => buildBrokerCapturePageRpcArguments({
      requestAuthorizationId: REQUEST_AUTHORIZATION_ID,
      leaseToken: uuid('lease-token'),
      integrityKey: CHECKPOINT_KEY,
      integrityKeyVersion: 'test_v1',
      expectedWorkUnitRowVersion: 7,
      wireResponse,
      capturedPage: { ...capturedPage } as never,
    })).toThrowError(/Orchestratorprovenienz/)

    expect(() => buildBrokerCapturePageRpcArguments({
      requestAuthorizationId: REQUEST_AUTHORIZATION_ID,
      leaseToken: uuid('lease-token'),
      integrityKey: CHECKPOINT_KEY,
      integrityKeyVersion: 'test_v1',
      expectedWorkUnitRowVersion: Number.MAX_SAFE_INTEGER,
      wireResponse,
      capturedPage,
    })).toThrowError(/expectedWorkUnitRowVersion/)
  })

  it('accepts only a database result that exactly matches the authentic capture transition', async () => {
    const wireResponse = await authenticWireResponse('historical_orders_v1', [order()])
    const capturedPage = applyMexcCapturedPage(captureInput(wireResponse))
    const input = {
      requestAuthorizationId: REQUEST_AUTHORIZATION_ID,
      leaseToken: uuid('lease-token'),
      integrityKey: CHECKPOINT_KEY,
      integrityKeyVersion: 'test_v1',
      expectedWorkUnitRowVersion: 7,
      wireResponse,
      capturedPage,
    }
    const rpc = vi.fn(async (_name: string, _args: unknown) => ({
      data: {
        status: 'page_committed',
        requestResultId: REQUEST_RESULT_REFERENCE.value,
        workUnitRowVersion: 8,
        ledgerGeneration: 1,
        insertedRawEvents: 1,
        repeatedObservations: 0,
        observations: 1,
        scopeCompleteness: 'unverified',
        authorityBlocked: true,
      },
      error: null,
    }))

    await expect(commitBrokerCapturePageWithClient({ rpc } as never, input)).resolves.toMatchObject({
      status: 'page_committed',
      workUnitRowVersion: 8,
      ledgerGeneration: 1,
      insertedRawEvents: 1,
      observations: 1,
      authorityBlocked: true,
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0]?.[0]).toBe('equora_commit_broker_capture_page_v2')

    const forgedRpc = vi.fn(async (_name: string, _args: unknown) => ({
      data: {
        status: 'page_committed',
        requestResultId: REQUEST_RESULT_REFERENCE.value,
        workUnitRowVersion: 8,
        ledgerGeneration: 1,
        insertedRawEvents: 0,
        repeatedObservations: 1,
        observations: 1,
        scopeCompleteness: 'unverified',
        authorityBlocked: true,
      },
      error: null,
    }))
    await expect(commitBrokerCapturePageWithClient({ rpc: forgedRpc } as never, input))
      .rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it.each([
    'CAPTURE_TRANSITION_MAC_MISMATCH',
    'CAPTURE_POLICY_NOT_CURRENT',
    'CAPTURE_HEALTH_BLOCKED',
    'CAPTURE_REQUEST_AUTHORIZATION_INVALID',
    'CAPTURE_ACCOUNT_LEASE_CAS_MISMATCH',
    'CAPTURE_PAGE_REPLAY_MISMATCH',
    'CAPTURE_PARENT_AUTHORITY_MISSING',
    'CAPTURE_PARENT_AUTHORITY_INVALID',
    'CAPTURE_ACCOUNT_LEASE_INVALID',
    'CAPTURE_PAGE_REPLAY_RACE',
    'SCHEDULER_PARENT_LOCK_TIMEOUT',
    'SCHEDULER_PARENT_STATEMENT_TIMEOUT',
  ] as const)('maps database capture rejection %s to a closed code without SQL details', async (databaseCode) => {
    const wireResponse = await authenticWireResponse('historical_orders_v1', [order()])
    const capturedPage = applyMexcCapturedPage(captureInput(wireResponse))
    const rpc = vi.fn(async (_name: string, _args: unknown) => ({
      data: null,
      error: { message: `P0001: ${databaseCode} internal tenant detail` },
    }))

    const rejection = commitBrokerCapturePageWithClient({ rpc } as never, {
      requestAuthorizationId: REQUEST_AUTHORIZATION_ID,
      leaseToken: uuid('lease-token'),
      integrityKey: CHECKPOINT_KEY,
      integrityKeyVersion: 'test_v1',
      expectedWorkUnitRowVersion: 7,
      wireResponse,
      capturedPage,
    })
    await expect(rejection).rejects.toBeInstanceOf(BrokerCapturePersistenceError)
    await expect(rejection).rejects.toMatchObject({
      code: databaseCode,
      message: 'Der atomare Broker-Page-Commit wurde von der Datenbank abgelehnt.',
    })
  })

  it('keeps unknown Page database codes generic and sanitized', async () => {
    const wireResponse = await authenticWireResponse('historical_orders_v1', [order()])
    const capturedPage = applyMexcCapturedPage(captureInput(wireResponse))
    const rpc = vi.fn(async (_name: string, _args: unknown) => ({
      data: null,
      error: { message: 'P0001: CAPTURE_FUTURE_CODE internal tenant detail' },
    }))

    await expect(commitBrokerCapturePageWithClient({ rpc } as never, {
      requestAuthorizationId: REQUEST_AUTHORIZATION_ID,
      leaseToken: uuid('lease-token'),
      integrityKey: CHECKPOINT_KEY,
      integrityKeyVersion: 'test_v1',
      expectedWorkUnitRowVersion: 7,
      wireResponse,
      capturedPage,
    })).rejects.toMatchObject({
      code: 'database_error',
      message: 'Der atomare Broker-Page-Commit ist fehlgeschlagen; es wurden keine Teilergebnisse akzeptiert.',
    })
  })

  it('maps malformed checkpoint MAC input to its closed database code', async () => {
    const wireResponse = await authenticWireResponse('historical_orders_v1', [order()])
    const capturedPage = applyMexcCapturedPage(captureInput(wireResponse))
    const rpc = vi.fn(async (_name: string, _args: unknown) => ({
      data: null,
      error: { message: 'P0001: CAPTURE_CHECKPOINT_MAC_INVALID internal checkpoint detail' },
    }))

    await expect(commitBrokerCapturePageWithClient({ rpc } as never, {
      requestAuthorizationId: REQUEST_AUTHORIZATION_ID,
      leaseToken: uuid('lease-token'),
      integrityKey: CHECKPOINT_KEY,
      integrityKeyVersion: 'test_v1',
      expectedWorkUnitRowVersion: 7,
      wireResponse,
      capturedPage,
    })).rejects.toMatchObject({
      code: 'CAPTURE_CHECKPOINT_MAC_INVALID',
      message: 'Der atomare Broker-Page-Commit wurde von der Datenbank abgelehnt.',
    })
  })

  it.each([
    { sqlState: '55P03', timeoutCode: 'CAPTURE_LOCK_TIMEOUT' },
    { sqlState: '57014', timeoutCode: 'CAPTURE_STATEMENT_TIMEOUT' },
  ] as const)('maps resumable database timeout $sqlState to $timeoutCode', async ({ sqlState, timeoutCode }) => {
    const wireResponse = await authenticWireResponse('historical_orders_v1', [order()])
    const capturedPage = applyMexcCapturedPage(captureInput(wireResponse))
    const rpc = vi.fn(async (_name: string, _args: unknown) => ({
      data: null,
      error: { code: sqlState, message: 'localized database timeout without a stable message' },
    }))

    await expect(commitBrokerCapturePageWithClient({ rpc } as never, {
      requestAuthorizationId: REQUEST_AUTHORIZATION_ID,
      leaseToken: uuid('lease-token'),
      integrityKey: CHECKPOINT_KEY,
      integrityKeyVersion: 'test_v1',
      expectedWorkUnitRowVersion: 7,
      wireResponse,
      capturedPage,
    })).rejects.toMatchObject({
      code: timeoutCode,
      message: 'Der atomare Broker-Page-Commit wurde von der Datenbank abgelehnt.',
    })
  })
})

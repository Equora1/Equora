import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createBrokerRawLedgerState } from '../lib/server/broker-raw-ledger'
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
const REQUEST_RESULT_REFERENCE = Object.freeze({
  referenceType: 'provider_request_result_id_v1' as const,
  value: uuid('request-result'),
})

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
    syncActivationId: scope.syncActivationId,
    activationGeneration: scope.activationGeneration,
    scopeDigest: scope.scopeDigest,
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
        syncActivationId: captureBinding.syncActivationId,
        activationGeneration: captureBinding.activationGeneration,
      }))
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
})

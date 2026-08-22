import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  BROKER_OPERATOR_COMMAND_POLICY_V2,
  BROKER_OPERATOR_COMMAND_RPC_V2,
  BrokerMultibrokerPersistenceError,
  PROVIDER_CAPTURE_PAGE_COMMIT_RPC_V2,
  PROVIDER_CAPTURE_REQUEST_AUTHORIZATION_RPC_V2,
  PROVIDER_PAGE_COMMIT_POLICY_V2,
  PROVIDER_REQUEST_AUTHORITY_POLICY_V2,
  applyBrokerOperatorCommandV2WithClient,
  authorizeProviderCaptureRequestV2WithClient,
  commitProviderCapturePageV2WithClient,
  type BrokerOperatorCommandV2,
  type ProviderPageCommitV2,
  type ProviderRequestAuthorizationV2,
} from '@/lib/server/broker-multibroker-persistence'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)
const D = 'd'.repeat(64)

function frozen<T extends Record<string, unknown>>(value: T): Readonly<T> {
  for (const entry of Object.values(value)) {
    if (entry && typeof entry === 'object') Object.freeze(entry)
  }
  return Object.freeze(value)
}

function operatorInput(): BrokerOperatorCommandV2 {
  return frozen({
    commandId: 'a3000000-0000-4000-8000-000000000001',
    enrollmentId: 'a3000000-0000-4000-8000-000000000002',
    action: 'enroll' as const,
    userId: 'a3000000-0000-4000-8000-000000000003',
    brokerAccountId: 'a3000000-0000-4000-8000-000000000004',
    contractPins: Object.freeze({
      providerCode: 'mexc',
      providerContractVersion: 'mexc_futures_contract_v1',
      capabilityId: 'historical_orders_v1',
      capabilityContractVersion: 'mexc_historical_orders_capability_v1',
    }),
    expectedGeneration: 0,
    commandDigest: A,
  })
}

function requestInput(): ProviderRequestAuthorizationV2 {
  return frozen({
    requestAuthorizationId: 'a3000000-0000-4000-8000-000000000005',
    enrollmentId: 'a3000000-0000-4000-8000-000000000002',
    expectedEnrollmentGeneration: 2,
    workUnitId: 'a3000000-0000-4000-8000-000000000006',
    expectedWorkUnitRowVersion: 1,
    requestSequence: 1,
    expectedCheckpointRowVersion: 0,
    expectedCheckpointGeneration: 0,
    expectedCheckpointMac: A,
    pageScopeDigest: B,
    queryDigest: C,
    requestPlanDigest: D,
    sendDeadlineAt: '2099-08-21T12:00:00.123456Z',
  })
}

function pageInput(): ProviderPageCommitV2 {
  return frozen({
    pageCommitId: 'a3000000-0000-4000-8000-000000000007',
    requestAuthorizationId: 'a3000000-0000-4000-8000-000000000005',
    workUnitId: 'a3000000-0000-4000-8000-000000000006',
    expectedEnrollmentGeneration: 2,
    expectedWorkUnitRowVersion: 1,
    expectedCheckpointRowVersion: 0,
    expectedCheckpointGeneration: 0,
    expectedCheckpointMac: A,
    requestSequence: 1,
    requestPlanDigest: D,
    rawEnvelope: Object.freeze({
      providerCode: 'mexc',
      providerContractVersion: 'mexc_futures_contract_v1',
      capabilityId: 'historical_orders_v1',
      capabilityContractVersion: 'mexc_historical_orders_capability_v1',
      queryContractVersion: 'mexc_historical_orders_query_v1',
      cursorContractVersion: 'mexc_page_number_cursor_v1',
      responseContractVersion: 'mexc_historical_orders_response_v1',
      rawEnvelopeContractVersion: 'equora_provider_raw_envelope_v2' as const,
      normalizationContractVersion: 'blocked_pending_versioned_normalization' as const,
      requestPlanDigest: D,
      requestSequence: 1,
      pageSequence: 0,
      rawBodyDigest: B,
      responseDigest: C,
      observedAtUtc: '2026-08-21T12:00:00.123456Z',
    }),
    rawEnvelopeDigest: A,
    responseDigest: C,
    nextCheckpointPayload: Object.freeze({
      pageSequence: 1,
      cursor: null,
    }),
    nextCheckpointMac: B,
    nextCheckpointStatus: 'continue' as const,
    scopeCompleteness: 'unverified' as const,
  })
}

function rpcClient(data: unknown, error: { message?: string; code?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  return { client: { rpc } as never, rpc }
}

function expectCode(error: unknown, code: BrokerMultibrokerPersistenceError['code']) {
  expect(error).toBeInstanceOf(BrokerMultibrokerPersistenceError)
  expect((error as BrokerMultibrokerPersistenceError).code).toBe(code)
}

describe('provider-neutral MB3 persistence seam', () => {
  it('submits an exact operator command without default runtime activation', async () => {
    const input = operatorInput()
    const { client, rpc } = rpcClient({
      status: 'operator_command_applied',
      commandId: input.commandId,
      enrollmentId: input.enrollmentId,
      providerCode: input.contractPins.providerCode,
      capabilityId: input.contractPins.capabilityId,
      runtimeState: 'suspended',
      generation: 1,
      authorityEpoch: 1,
      runtimeDefaultedActive: false,
    })
    await expect(applyBrokerOperatorCommandV2WithClient(client, input)).resolves.toMatchObject({
      runtimeState: 'suspended', runtimeDefaultedActive: false,
    })
    expect(rpc).toHaveBeenCalledWith(BROKER_OPERATOR_COMMAND_RPC_V2, expect.objectContaining({
      p_command_policy_version: BROKER_OPERATOR_COMMAND_POLICY_V2,
      p_expected_generation: 0,
      p_provider_code: 'mexc',
    }))
  })

  it('submits a bounded request authority without credentials or request payload', async () => {
    const input = requestInput()
    const { client, rpc } = rpcClient({
      status: 'request_authorized', requestAuthorizationId: input.requestAuthorizationId,
      workUnitId: input.workUnitId, requestSequence: 1,
      authorizationAttempt: 1,
      sendDeadlineAt: '2099-08-21T12:00:00.123456+00:00', authorityBlocked: true,
    })
    await authorizeProviderCaptureRequestV2WithClient(client, input)
    const [, body] = rpc.mock.calls[0]
    expect(rpc).toHaveBeenCalledWith(PROVIDER_CAPTURE_REQUEST_AUTHORIZATION_RPC_V2, expect.objectContaining({
      p_policy_version: PROVIDER_REQUEST_AUTHORITY_POLICY_V2,
    }))
    expect(JSON.stringify(body)).not.toMatch(/credential|api.?key|secret|raw.?body/i)
  })

  it('commits only the provider-observed envelope and preserves all downstream non-authorities', async () => {
    const input = pageInput()
    const { client, rpc } = rpcClient({
      status: 'page_committed', pageCommitId: input.pageCommitId,
      requestAuthorizationId: input.requestAuthorizationId,
      workUnitId: 'a3000000-0000-4000-8000-000000000006', requestSequence: 1,
      checkpointGeneration: 1, checkpointStatus: 'continue',
      scopeCompleteness: 'unverified', normalizationAuthority: 'none',
      reconciliationAuthority: 'none', approvalAuthority: 'none', importAuthority: 'none',
    })
    await expect(commitProviderCapturePageV2WithClient(client, input)).resolves.toMatchObject({
      normalizationAuthority: 'none', reconciliationAuthority: 'none',
      approvalAuthority: 'none', importAuthority: 'none',
    })
    expect(rpc).toHaveBeenCalledWith(PROVIDER_CAPTURE_PAGE_COMMIT_RPC_V2, expect.objectContaining({
      p_commit_policy_version: PROVIDER_PAGE_COMMIT_POLICY_V2,
      p_expected_work_unit_id: input.workUnitId,
    }))
  })

  it('accepts a second provider through the versioned opaque-scalar cursor contract', async () => {
    const base = pageInput()
    const input = Object.freeze({
      ...base,
      rawEnvelope: Object.freeze({
        ...base.rawEnvelope,
        providerCode: 'synthetic',
        providerContractVersion: 'synthetic_readonly_contract_v1',
        capabilityId: 'synthetic_history_v1',
        capabilityContractVersion: 'synthetic_history_capability_v1',
        queryContractVersion: 'synthetic_history_query_v1',
        cursorContractVersion: 'equora_opaque_scalar_cursor_v1',
        responseContractVersion: 'synthetic_history_response_v1',
        observedAtUtc: '2026-08-21T12:00:00Z',
      }),
      nextCheckpointPayload: Object.freeze({
        pageSequence: 1,
        cursor: 'opaque-next-page-token',
      }),
    }) as ProviderPageCommitV2
    const { client, rpc } = rpcClient({
      status: 'page_committed', pageCommitId: input.pageCommitId,
      requestAuthorizationId: input.requestAuthorizationId,
      workUnitId: input.workUnitId, requestSequence: 1,
      checkpointGeneration: 1, checkpointStatus: 'continue',
      scopeCompleteness: 'unverified', normalizationAuthority: 'none',
      reconciliationAuthority: 'none', approvalAuthority: 'none', importAuthority: 'none',
    })
    await expect(commitProviderCapturePageV2WithClient(client, input)).resolves.toMatchObject({
      checkpointStatus: 'continue',
    })
    expect(rpc).toHaveBeenCalledWith(PROVIDER_CAPTURE_PAGE_COMMIT_RPC_V2, expect.objectContaining({
      p_next_checkpoint_payload: { pageSequence: 1, cursor: 'opaque-next-page-token' },
    }))
  })

  it('dispatches cursor validation by version and rejects unsupported scalar shapes before RPC', async () => {
    const base = pageInput()
    const cases = [
      Object.freeze({
        ...base,
        nextCheckpointPayload: Object.freeze({ pageSequence: 1, cursor: 'not-null' }),
      }),
      Object.freeze({
        ...base,
        rawEnvelope: Object.freeze({
          ...base.rawEnvelope,
          cursorContractVersion: 'equora_opaque_scalar_cursor_v1',
        }),
        nextCheckpointPayload: Object.freeze({ pageSequence: 1, cursor: '' }),
      }),
      Object.freeze({
        ...base,
        rawEnvelope: Object.freeze({
          ...base.rawEnvelope,
          cursorContractVersion: 'unregistered_cursor_v1',
        }),
      }),
    ]
    const { client, rpc } = rpcClient(null)
    for (const candidate of cases) {
      await expect(commitProviderCapturePageV2WithClient(client, candidate as ProviderPageCommitV2))
        .rejects.toMatchObject({ code: 'invalid_input' })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects operator results that contradict the requested transition or epoch', async () => {
    const input = operatorInput()
    for (const patch of [
      { runtimeState: 'active', authorityEpoch: 1 },
      { runtimeState: 'suspended', authorityEpoch: 2 },
    ]) {
      const { client } = rpcClient({
        status: 'operator_command_applied', commandId: input.commandId,
        enrollmentId: input.enrollmentId, providerCode: input.contractPins.providerCode,
        capabilityId: input.contractPins.capabilityId, runtimeState: patch.runtimeState,
        generation: 1, authorityEpoch: patch.authorityEpoch, runtimeDefaultedActive: false,
      })
      await expect(applyBrokerOperatorCommandV2WithClient(client, input))
        .rejects.toMatchObject({ code: 'database_result_invalid' })
    }
  })

  it('rejects a foreign work unit in the page-commit result', async () => {
    const input = pageInput()
    const { client } = rpcClient({
      status: 'page_committed', pageCommitId: input.pageCommitId,
      requestAuthorizationId: input.requestAuthorizationId,
      workUnitId: 'a3000000-0000-4000-8000-000000000099', requestSequence: 1,
      checkpointGeneration: 1, checkpointStatus: 'continue',
      scopeCompleteness: 'unverified', normalizationAuthority: 'none',
      reconciliationAuthority: 'none', approvalAuthority: 'none', importAuthority: 'none',
    })
    await expect(commitProviderCapturePageV2WithClient(client, input))
      .rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it('rejects cross-binding between envelope and outer request plan', async () => {
    const input = pageInput()
    const invalid = Object.freeze({
      ...input,
      rawEnvelope: Object.freeze({ ...input.rawEnvelope, requestPlanDigest: A }),
    })
    const { client, rpc } = rpcClient(null)
    await expect(commitProviderCapturePageV2WithClient(client, invalid)).rejects.toMatchObject({ code: 'invalid_input' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects page-sequence drift, terminal advancement and secret-bearing envelope extras', async () => {
    const base = pageInput()
    const cases = [
      Object.freeze({
        ...base,
        rawEnvelope: Object.freeze({ ...base.rawEnvelope, pageSequence: 1 }),
      }),
      Object.freeze({
        ...base,
        nextCheckpointPayload: Object.freeze({ pageSequence: 2, cursor: null }),
      }),
      Object.freeze({
        ...base,
        nextCheckpointStatus: 'complete' as const,
        nextCheckpointPayload: Object.freeze({ pageSequence: 1, cursor: null }),
      }),
      Object.freeze({
        ...base,
        rawEnvelope: Object.freeze({ ...base.rawEnvelope, apiSecret: 'secret-sentinel' }),
      }),
    ]
    const { client, rpc } = rpcClient(null)
    for (const candidate of cases) {
      await expect(commitProviderCapturePageV2WithClient(client, candidate as ProviderPageCommitV2))
        .rejects.toMatchObject({ code: 'invalid_input' })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects contradictory raw completeness and over-precise observation timestamps before RPC', async () => {
    const base = pageInput()
    const cases = [
      Object.freeze({ ...base, nextCheckpointStatus: 'continue' as const, scopeCompleteness: 'partial' as const }),
      Object.freeze({ ...base, nextCheckpointStatus: 'blocked' as const, scopeCompleteness: 'unverified' as const }),
      Object.freeze({
        ...base,
        rawEnvelope: Object.freeze({ ...base.rawEnvelope, observedAtUtc: '2026-08-21T12:00:00.1234567Z' }),
      }),
    ]
    const { client, rpc } = rpcClient(null)
    for (const candidate of cases) {
      await expect(commitProviderCapturePageV2WithClient(client, candidate as ProviderPageCommitV2))
        .rejects.toMatchObject({ code: 'invalid_input' })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects mutable, proxied and accessor-bearing authority inputs before RPC', async () => {
    const mutable = { ...operatorInput() }
    const proxy = new Proxy(operatorInput(), {})
    const accessor = Object.freeze(Object.defineProperties({}, {
      ...Object.fromEntries(Object.entries(operatorInput()).map(([key, value]) => [key, {
        value, enumerable: true, configurable: false, writable: false,
      }])),
      commandDigest: { get: () => A, enumerable: true, configurable: false },
    }))
    const { client, rpc } = rpcClient(null)
    for (const value of [mutable, proxy, accessor]) {
      await expect(applyBrokerOperatorCommandV2WithClient(client, value as BrokerOperatorCommandV2))
        .rejects.toMatchObject({ code: 'invalid_input' })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects sparse, subclassed and caller-method-bearing checkpoint cursors', async () => {
    class UnsafeArray extends Array<unknown> {}
    const sparse = new Array(2)
    sparse[1] = 'x'
    Object.freeze(sparse)
    const subclassed = Object.freeze(new UnsafeArray('x'))
    const withOwnMap = ['x']
    Object.defineProperty(withOwnMap, 'map', { value: () => ['tampered'], enumerable: true })
    Object.freeze(withOwnMap)
    const { client, rpc } = rpcClient(null)
    for (const value of [sparse, subclassed, withOwnMap]) {
      const candidate = Object.freeze({
        ...pageInput(),
        nextCheckpointPayload: Object.freeze({ pageSequence: 1, cursor: value }),
      })
      await expect(commitProviderCapturePageV2WithClient(client, candidate as unknown as ProviderPageCommitV2))
        .rejects.toMatchObject({ code: 'invalid_input' })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects impossible calendar timestamps before RPC', async () => {
    const candidate = Object.freeze({ ...requestInput(), sendDeadlineAt: '2099-02-30T12:00:00.0000000Z' })
    const { client, rpc } = rpcClient(null)
    await expect(authorizeProviderCaptureRequestV2WithClient(client, candidate))
      .rejects.toMatchObject({ code: 'invalid_input' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fails closed when the additive database contract is absent', async () => {
    const { client } = rpcClient(null, { code: '42883', message: 'function does not exist' })
    await expect(applyBrokerOperatorCommandV2WithClient(client, operatorInput()))
      .rejects.toMatchObject({ code: 'schema_unavailable' })
  })

  it('sanitizes database authority failures without reflecting payload text', async () => {
    const { client } = rpcClient(null, { code: 'P0001', message: 'MB3_REQUEST_AUTH_REPLAY_MISMATCH secret-sentinel' })
    try {
      await authorizeProviderCaptureRequestV2WithClient(client, requestInput())
      throw new Error('expected rejection')
    } catch (error) {
      expectCode(error, 'database_rejected')
      expect((error as Error).message).not.toContain('secret-sentinel')
    }
  })

  it('snapshots database data fields once and rejects stateful accessors', async () => {
    const input = operatorInput()
    const result: Record<string, unknown> = {
      status: 'operator_command_applied', commandId: input.commandId,
      enrollmentId: input.enrollmentId, providerCode: 'mexc',
      capabilityId: 'historical_orders_v1', runtimeState: 'suspended',
      generation: 1, authorityEpoch: 1, runtimeDefaultedActive: false,
    }
    Object.defineProperty(result, 'providerCode', {
      get: () => 'secret-sentinel', enumerable: true, configurable: true,
    })
    const { client } = rpcClient(result)
    await expect(applyBrokerOperatorCommandV2WithClient(client, input))
      .rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it('rejects unknown result fields rather than forwarding them', async () => {
    const input = requestInput()
    const { client } = rpcClient({
      status: 'request_authorized', requestAuthorizationId: input.requestAuthorizationId,
      workUnitId: input.workUnitId, requestSequence: 1,
      authorizationAttempt: 1,
      sendDeadlineAt: input.sendDeadlineAt, authorityBlocked: true,
      credential: 'secret-sentinel',
    })
    await expect(authorizeProviderCaptureRequestV2WithClient(client, input))
      .rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it('compares returned database deadlines at full microsecond precision', async () => {
    const input = requestInput()
    const { client } = rpcClient({
      status: 'request_authorized', requestAuthorizationId: input.requestAuthorizationId,
      workUnitId: input.workUnitId, requestSequence: input.requestSequence,
      authorizationAttempt: 1,
      sendDeadlineAt: '2099-08-21T12:00:00.123457+00:00', authorityBlocked: true,
    })
    await expect(authorizeProviderCaptureRequestV2WithClient(client, input))
      .rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it('contains no provider transport, credential, cron or import dependency', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/server/broker-multibroker-persistence.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"].*(mexc-transport|central-network|credential|cron|trade-import)/)
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/)
  })

  it('is not wired into product control flow during MB3', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/server/broker-multibroker-persistence.ts'), 'utf8')
    const productFiles = ['app/api/internal/broker-capture/route.ts', 'lib/server/broker-capture-runtime.ts']
    for (const file of productFiles) {
      expect(readFileSync(resolve(process.cwd(), file), 'utf8')).not.toContain('broker-multibroker-persistence')
    }
    expect(source).toContain('remain unreferenced by Product Control-Flow in MB3')
  })

  it('pins four private MEXC capabilities without creating runtime enrollment defaults', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/schema-patch-v57.61.0-multibroker-mb3.sql'), 'utf8')
    const registryValues = sql.match(/insert into public\.broker_provider_capability_contracts_v2[\s\S]*?on conflict do nothing;/)?.[0]
    expect(registryValues).toBeDefined()
    expect(registryValues?.match(/\('mexc','mexc_futures_contract_v1'/g)).toHaveLength(4)
    expect(registryValues).toContain("'blocked_pending_versioned_normalization'")
    const migrationSetup = sql.split('create or replace function public.equora_apply_broker_operator_command_v2')[0]
    expect(migrationSetup).not.toContain('insert into public.broker_runtime_enrollments_v2')
    expect(sql).toContain("'suspended',1")
  })

  it('locks runtime registry authority through the operator-owned helper without direct runtime SELECT', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/schema-patch-v57.61.0-multibroker-mb3.sql'), 'utf8')
    expect(sql).toContain('create or replace function public.equora_lock_provider_capability_contract_v2')
    expect(sql).toContain('for share of contract_row;')
    expect(sql.match(/from public\.equora_lock_provider_capability_contract_v2\(/g)).toHaveLength(2)
    expect(sql).toContain("'equora_broker_runtime_v2',\n      'public.broker_provider_capability_contracts_v2','select'")
    const concurrency = readFileSync(resolve(process.cwd(), 'tests/sql/run-multibroker-mb3-concurrency.ps1'), 'utf8')
    expect(concurrency).toContain('MB3_REQUEST_AUTH_CAPABILITY_INVALID')
    expect(concurrency).toContain('MB3_PAGE_COMMIT_CAPABILITY_INVALID')
    expect(concurrency).toContain('Registry authority drift')
  })

  it('serializes global runtime IDs and refreshes deadline authority after every blocking boundary', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/schema-patch-v57.61.0-multibroker-mb3.sql'), 'utf8')
    const concurrency = readFileSync(resolve(process.cwd(), 'tests/sql/run-multibroker-mb3-concurrency.ps1'), 'utf8')
    const requestStart = sql.indexOf('create or replace function public.equora_authorize_provider_capture_request_v2')
    const requestEnd = sql.indexOf('alter function public.equora_authorize_provider_capture_request_v2', requestStart)
    const requestSql = sql.slice(requestStart, requestEnd)
    const requestIdGuard = requestSql.indexOf("'equora-mb3-runtime-object-id:' || p_request_authorization_id::text")
    const requestReplayRead = requestSql.indexOf('select * into v_existing')
    const requestGuardClock = requestSql.indexOf('v_now := clock_timestamp();', requestIdGuard)
    const replayStart = requestSql.indexOf('if v_is_replay then')
    const replayAuthorizationLock = requestSql.indexOf('for share;', replayStart)
    const replayClock = requestSql.indexOf('v_now := clock_timestamp();', replayAuthorizationLock)
    const replayReturn = requestSql.indexOf('return jsonb_build_object(', replayClock)
    const expiryCleanup = requestSql.indexOf('update public.broker_capture_request_authorizations_v2')
    const authorizationInsert = requestSql.indexOf('insert into public.broker_capture_request_authorizations_v2 (')
    const insertClock = requestSql.lastIndexOf('v_now := clock_timestamp();', authorizationInsert)
    const postAuthorizationInsertClock = requestSql.indexOf('v_now := clock_timestamp();', authorizationInsert)
    const requestReceiptInsert = requestSql.indexOf('insert into public.broker_runtime_authority_receipts_v2 (')
    expect(requestStart).toBeGreaterThanOrEqual(0)
    expect(requestEnd).toBeGreaterThan(requestStart)
    expect(requestIdGuard).toBeGreaterThanOrEqual(0)
    expect(requestReplayRead).toBeGreaterThan(requestIdGuard)
    expect(requestGuardClock).toBeGreaterThan(requestIdGuard)
    expect(requestReplayRead).toBeGreaterThan(requestGuardClock)
    expect(replayAuthorizationLock).toBeGreaterThan(replayStart)
    expect(replayClock).toBeGreaterThan(replayAuthorizationLock)
    expect(replayReturn).toBeGreaterThan(replayClock)
    expect(insertClock).toBeGreaterThan(expiryCleanup)
    expect(authorizationInsert).toBeGreaterThan(insertClock)
    expect(postAuthorizationInsertClock).toBeGreaterThan(authorizationInsert)
    expect(requestReceiptInsert).toBeGreaterThan(postAuthorizationInsertClock)
    const pageStart = sql.indexOf('create or replace function public.equora_commit_provider_capture_page_v2')
    const pageEnd = sql.indexOf('alter function public.equora_commit_provider_capture_page_v2', pageStart)
    const pageSql = sql.slice(pageStart, pageEnd)
    const pageFirstIdGuard = pageSql.indexOf("'equora-mb3-runtime-object-id:' || least(")
    const pageSecondIdGuard = pageSql.indexOf("'equora-mb3-runtime-object-id:' || greatest(")
    const pageReplayRead = pageSql.indexOf('select * into v_existing')
    const pageInsert = pageSql.indexOf('insert into public.broker_capture_page_commits_v2 (')
    const postPageInsertClock = pageSql.indexOf('v_now := clock_timestamp();', pageInsert)
    const checkpointUpdate = pageSql.indexOf('update public.broker_capture_checkpoints_v2', pageInsert)
    expect(pageStart).toBeGreaterThanOrEqual(0)
    expect(pageEnd).toBeGreaterThan(pageStart)
    expect(pageFirstIdGuard).toBeGreaterThanOrEqual(0)
    expect(pageSecondIdGuard).toBeGreaterThan(pageFirstIdGuard)
    expect(pageReplayRead).toBeGreaterThan(pageSecondIdGuard)
    expect(postPageInsertClock).toBeGreaterThan(pageInsert)
    expect(checkpointUpdate).toBeGreaterThan(postPageInsertClock)
    expect(pageSql).toContain('or p_page_commit_id = p_request_authorization_id')
    expect(sql).toContain("raise exception 'MB3_REQUEST_AUTH_DEADLINE_EXPIRED'")
    expect(sql).toContain('public.equora_validate_provider_cursor_v1')
    expect(sql).toContain("'equora_opaque_scalar_cursor_v1'")
    expect(sql).toContain("(\\.[0-9]{1,6})?Z$")
    expect(sql).toContain('Re-sample immediately before the first durable effect')
    expect(concurrency).toContain('mb3_request_deadline_locker')
    expect(concurrency).toContain('mb3_page_deadline_locker')
    expect(concurrency).toContain('mb3_replay_authorization_deadline_locker')
    expect(concurrency).toContain('Request deadline-after-lock produced durable effects')
    expect(concurrency).toContain('Page deadline-after-lock produced durable effects')
    expect(concurrency).toContain('Replay deadline-after-authorization-lock produced durable effects')
    expect(concurrency).toContain('mb3_request_id_guard_blocker')
    expect(concurrency).toContain('mb3_page_id_guard_blocker')
    expect(concurrency).toContain('mb3_cross_action_id_guard_blocker')
    expect(concurrency).toContain('Cross-work-unit request-ID guard produced durable effects')
    expect(concurrency).toContain('Cross-work-unit Page-ID guard produced durable effects')
    expect(concurrency).toContain('Cross-action Receipt-ID guard produced durable effects')
    expect(concurrency).toContain('mb3_request_user_fk_wait_blocker')
    expect(concurrency).toContain('mb3_page_user_fk_wait_blocker')
    expect(concurrency).toContain('Request auth.users FK wait produced durable effects')
    expect(concurrency).toContain('Page auth.users FK wait produced durable effects')
  })

  it('pins complete authority-role attributes and the exact RLS policy set', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/schema-patch-v57.61.0-multibroker-mb3.sql'), 'utf8')
    for (const attribute of [
      'rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolcanlogin', 'rolinherit',
      'rolreplication', 'rolconnlimit', 'rolvaliduntil',
      'rolbypassrls', 'rolconfig',
    ]) expect(sql).toContain(`v_role.${attribute}`)
    expect(sql).toContain('from pg_authid')
    expect(sql).toContain('and rolpassword is not null')
    expect(sql).toContain("v_expected_rls_policy_count integer := 20")
    expect(sql).toContain("'243eefe064eb0b748f1ee4ac6f6522051d366473ad69e964577ce81ca15ebd02'")
    const drift = readFileSync(resolve(process.cwd(), 'tests/sql/run-multibroker-mb3-drift.ps1'), 'utf8')
    expect(drift).toContain('Runtime role attribute drift')
    expect(drift).toContain('Tenant select policy drift')
    expect(drift).toContain('Runtime lock policy drift')
    expect(drift).toContain('Registry lock helper ACL drift')
    expect(sql).toContain("raise exception 'MB3_FUNCTION_SIGNATURE_DRIFT'")
    expect(sql).toContain('procedure_row.oid not in (')
    expect(drift).toContain('Additional authority RPC overload drift')
    expect(drift).toContain("procedure_row.proname in ('equora_lock_provider_capability_contract_v2','equora_apply_broker_operator_command_v2','equora_authorize_provider_capture_request_v2','equora_commit_provider_capture_page_v2')")
  })

  it('rejects additional PUBLIC policies across every locked source-table family', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/schema-patch-v57.61.0-multibroker-mb3.sql'), 'utf8')
    const drift = readFileSync(resolve(process.cwd(), 'tests/sql/run-multibroker-mb3-drift.ps1'), 'utf8')
    expect(sql).toContain("'public'::name = any(roles)")
    for (const policy of [
      'mb3_unexpected_public_accounts_update',
      'mb3_unexpected_public_activations_update',
      'mb3_unexpected_public_scopes_update',
      'mb3_unexpected_public_work_units_update',
      'mb3_unexpected_public_keys_update',
    ]) expect(drift).toContain(policy)
  })

  it('keeps mutable generations as immutable receipt snapshots rather than parent FK keys', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/schema-patch-v57.61.0-multibroker-mb3.sql'), 'utf8')
    expect(sql).toContain('constraint broker_runtime_enrollments_v2_identity_unique')
    for (const constraint of [
      'broker_operator_control_receipts_v2_enrollment_fkey',
      'broker_capture_request_auth_v2_enrollment_fkey',
      'broker_capture_page_commits_v2_enrollment_fkey',
      'broker_runtime_authority_receipts_v2_enrollment_fkey',
    ]) {
      const block = sql.match(new RegExp(`constraint ${constraint}[\\s\\S]*?on delete restrict`))?.[0]
      expect(block, constraint).toBeDefined()
      expect(block, constraint).not.toMatch(/resulting_generation|enrollment_generation|, generation/)
    }
    const integration = readFileSync(resolve(process.cwd(), 'tests/sql/multibroker-mb3.integration.sql'), 'utf8')
    expect(integration).toContain('set constraints all immediate;')
  })

  it('keeps all six SQL gates local and leaves the production deployment chain unchanged', () => {
    const runners = [
      'fresh', 'upgrade', 'compatibility', 'partial-failure', 'drift', 'concurrency',
    ]
    for (const runner of runners) {
      const source = readFileSync(resolve(process.cwd(), `tests/sql/run-multibroker-mb3-${runner}.ps1`), 'utf8')
      expect(source).toContain('multibroker-mb3-test-lib.ps1')
      expect(source).not.toMatch(/supabase\.(co|com)|api\.mexc\.com|vercel\.com/i)
    }
    const productionDeploy = readFileSync(resolve(process.cwd(), 'supabase/deploy-v57.61.0.sql'), 'utf8')
    expect(productionDeploy).not.toContain('schema-patch-v57.61.0-multibroker-mb3.sql')
    expect(productionDeploy).not.toContain('equora_multibroker_mb3_v1')
  })

  it('keeps the manifest validator reproducible before and after the candidate commit', () => {
    const validator = readFileSync(
      resolve(process.cwd(), 'scripts/validate-multibroker-mb3-manifest.mjs'),
      'utf8',
    )
    expect(validator).toContain('function committedCandidatePaths(head)')
    expect(validator).toContain("git(['diff', '--no-renames', '--name-only', '-z', BASELINE, head])")
    expect(validator).toContain(
      'new Set([...candidateStatusPaths(), ...committedCandidatePaths(head)])',
    )
    expect(validator).toContain("git(['merge-base', head, BASELINE])")
    expect(validator).not.toContain("git(['rev-parse', 'HEAD']).trim() !== BASELINE")

    const scopeBlock = validator.match(/const CANDIDATE_SCOPE = Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1]
    const scopeConstants = new Map(
      [...validator.matchAll(/const (EVIDENCE_PATH|MANIFEST_PATH|VALIDATOR_PATH) = '([^']+)'/g)]
        .map((match) => [match[1], match[2]]),
    )
    const candidatePaths = (scopeBlock ?? '').split('\n').map((line) => line.trim().replace(/,$/, ''))
      .filter(Boolean)
      .map((entry) => entry.startsWith("'") ? entry.slice(1, -1) : scopeConstants.get(entry))
      .filter((entry): entry is string => entry !== undefined)
    expect(candidatePaths).toHaveLength(16)

    const repositories: string[] = []
    const runGit = (cwd: string, args: string[]) => execFileSync(
      'git', args, { cwd, encoding: 'utf8', windowsHide: true },
    ).trim()
    const write = (cwd: string, path: string, value: string) => {
      const absolute = join(cwd, ...path.split('/'))
      mkdirSync(dirname(absolute), { recursive: true })
      writeFileSync(absolute, value, 'utf8')
    }
    const init = (baselineFiles: Record<string, string>) => {
      const cwd = mkdtempSync(join(tmpdir(), 'equora-mb3-scope-'))
      repositories.push(cwd)
      runGit(cwd, ['init', '--quiet'])
      runGit(cwd, ['config', 'user.email', 'mb3-scope@example.invalid'])
      runGit(cwd, ['config', 'user.name', 'MB3 Scope Test'])
      runGit(cwd, ['config', 'diff.renames', 'true'])
      for (const [path, value] of Object.entries(baselineFiles)) write(cwd, path, value)
      runGit(cwd, ['add', '--all'])
      runGit(cwd, ['commit', '--quiet', '-m', 'baseline'])
      return { cwd, baseline: runGit(cwd, ['rev-parse', 'HEAD']) }
    }
    const commit = (cwd: string, message: string) => {
      runGit(cwd, ['add', '--all'])
      runGit(cwd, ['commit', '--quiet', '-m', message])
    }
    const diffPaths = (cwd: string, baseline: string, renameMode: '--no-renames' | '-M') => (
      execFileSync(
        'git', ['diff', renameMode, '--name-only', '-z', baseline, 'HEAD'],
        { cwd, encoding: 'utf8', windowsHide: true },
      ).split('\0').filter(Boolean).sort()
    )

    try {
      const exact = init({ 'outside/modified.txt': 'before', 'outside/deleted.txt': 'delete' })
      candidatePaths.forEach((path, index) => write(exact.cwd, path, `candidate-${index}`))
      commit(exact.cwd, 'exact candidate scope')
      expect(diffPaths(exact.cwd, exact.baseline, '--no-renames')).toEqual([...candidatePaths].sort())

      write(exact.cwd, 'outside/added.txt', 'add')
      write(exact.cwd, 'outside/modified.txt', 'after')
      unlinkSync(join(exact.cwd, 'outside', 'deleted.txt'))
      commit(exact.cwd, 'out of scope add modify delete')
      const outOfScope = diffPaths(exact.cwd, exact.baseline, '--no-renames')
      expect(outOfScope).toEqual(expect.arrayContaining([
        'outside/added.txt', 'outside/deleted.txt', 'outside/modified.txt',
      ]))
      expect(outOfScope).not.toEqual([...candidatePaths].sort())

      const incoming = init({ 'outside/rename-source.txt': 'identical rename payload' })
      const incomingTarget = join(incoming.cwd, ...candidatePaths[0].split('/'))
      mkdirSync(dirname(incomingTarget), { recursive: true })
      renameSync(join(incoming.cwd, 'outside', 'rename-source.txt'), incomingTarget)
      candidatePaths.slice(1).forEach((path, index) => write(incoming.cwd, path, `candidate-${index}`))
      commit(incoming.cwd, 'out of scope to candidate rename')
      expect(diffPaths(incoming.cwd, incoming.baseline, '-M')).toEqual([...candidatePaths].sort())
      const incomingNoRenames = diffPaths(incoming.cwd, incoming.baseline, '--no-renames')
      expect(incomingNoRenames).toContain('outside/rename-source.txt')
      expect(incomingNoRenames).not.toEqual([...candidatePaths].sort())

      const outgoing = init({ [candidatePaths[0]]: 'identical rename payload' })
      const outgoingTarget = join(outgoing.cwd, 'outside', 'rename-target.txt')
      mkdirSync(dirname(outgoingTarget), { recursive: true })
      renameSync(join(outgoing.cwd, ...candidatePaths[0].split('/')), outgoingTarget)
      candidatePaths.slice(1).forEach((path, index) => write(outgoing.cwd, path, `candidate-${index}`))
      commit(outgoing.cwd, 'candidate to out of scope rename')
      const outgoingNoRenames = diffPaths(outgoing.cwd, outgoing.baseline, '--no-renames')
      expect(outgoingNoRenames).toEqual(expect.arrayContaining([
        candidatePaths[0], 'outside/rename-target.txt',
      ]))
      expect(outgoingNoRenames).not.toEqual([...candidatePaths].sort())
    } finally {
      for (const repository of repositories) rmSync(repository, { recursive: true, force: true })
    }
  })
})

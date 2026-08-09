import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  BROKER_CAPTURE_CLAIM_POLICY_VERSION,
  BROKER_CAPTURE_CLAIM_RPC,
  BROKER_CAPTURE_FAILURE_POLICY_VERSION,
  BROKER_CAPTURE_FAILURE_RPC,
  BROKER_CAPTURE_REQUEST_AUTHORIZATION_RPC,
  BrokerCaptureControlError,
  authorizeBrokerCaptureRequestWithClient,
  claimBrokerCaptureWorkUnitWithClient,
  recordBrokerCaptureFailureWithClient,
  type BrokerCaptureClaimInput,
  type BrokerCaptureFailureInput,
  type BrokerCaptureRequestAuthorizationInput,
} from '../lib/server/broker-capture-control'

const WORK_UNIT_ID = '870d4b00-c275-48f1-aa02-9712c6ce1190'
const CLAIM_REQUEST_ID = '81000000-0000-4000-8000-000000000001'
const CLAIM_LEASE_TOKEN = '91000000-0000-4000-8000-000000000001'
const OUTCOME_ID = '82000000-0000-4000-8000-000000000001'
const REQUEST_AUTHORIZATION_ID = '83000000-0000-4000-8000-000000000001'
const REQUEST_STARTED_AT = '2026-08-07T10:00:00.000Z'
const SHA256 = 'b'.repeat(64)
const PAGE_SCOPE_DIGEST = 'a'.repeat(64)
const EXPECTED_CHECKPOINT_MAC = '1'.repeat(64)
const NEXT_CHECKPOINT_MAC = '2'.repeat(64)

function checkpoint(overrides: Record<string, unknown> = {}) {
  return {
    checkpointVersion: 'mexc-page-checkpoint-v1',
    checkpointMacVersion: 'mexc-page-checkpoint-hmac-sha256-v1',
    checkpointMac: EXPECTED_CHECKPOINT_MAC,
    budgetProfileId: 'mexc-history-page-budget-v1',
    budgetProfileDigest: 'aba71711421cebbff9f7ab4f8c761865aac36dffc91adc3d7468b6e632ab56aa',
    capabilityId: 'historical_orders_v1',
    scope: {
      symbol: 'BTC_USDT',
      startTime: 1_759_708_800_000,
      endTime: 1_759_968_000_000,
      pageNumber: 1,
      pageSize: 20,
    },
    scopeDigest: PAGE_SCOPE_DIGEST,
    status: 'ready',
    reason: 'initialized',
    workUnitSequence: 1,
    nextPageNumber: 1,
    unitSuccessfulPages: 0,
    unitRequestAttempts: 0,
    unitRawEvents: 0,
    unitResponseBytes: 0,
    unitElapsedMs: 0,
    unitRetryCount: 0,
    unitBackoffMs: 0,
    totalSuccessfulPages: 0,
    totalRequestAttempts: 0,
    totalRawEvents: 0,
    totalResponseBytes: 0,
    totalElapsedMs: 0,
    authorityBlocked: true,
    terminalEvidence: 'none',
    lastCursor: null,
    lastPageFingerprint: null,
    seenPageFingerprints: [],
    orderedProviderIdentitySequenceDigest: '3'.repeat(64),
    lastErrorCode: null,
    suggestedBackoffMs: null,
    retryNotBeforeMs: null,
    ...overrides,
  }
}

const claimInput: BrokerCaptureClaimInput = Object.freeze({
  workUnitId: WORK_UNIT_ID,
  expectedWorkUnitRowVersion: 0,
  claimRequestId: CLAIM_REQUEST_ID,
  leaseToken: CLAIM_LEASE_TOKEN,
})

function claimResult(overrides: Record<string, unknown> = {}) {
  return {
    status: 'claimed',
    authorityBlocked: true,
    claimPolicyVersion: BROKER_CAPTURE_CLAIM_POLICY_VERSION,
    claimRequestId: CLAIM_REQUEST_ID,
    workUnitId: WORK_UNIT_ID,
    workUnitRowVersion: 1,
    attempt: 1,
    maxAttempts: 8,
    requestSequence: 1,
    leaseExpiresAt: '2026-08-06T12:00:45.000Z',
    runId: 'bcba2551-2100-480b-a6fc-3ccd14c65be5',
    scopeId: '28000000-0000-4000-8000-000000000001',
    brokerAccountId: '14c6b264-99b8-4c74-a882-135b88e9d100',
    connectionAccountId: 'b34b98ae-a682-44de-a1bc-21ca75888d45',
    syncActivationId: 'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
    activationGeneration: 1,
    providerCode: 'mexc',
    providerContractVersion: 'mexc_futures_contract_v1',
    adapterVersion: 'v57_61_0',
    profileId: 'mexc_futures_rest',
    profileVersion: 'v1',
    capabilityId: 'historical_orders_v1',
    endpointId: 'historical_orders_v1',
    instrumentSymbol: 'BTC_USDT',
    positionType: null,
    requestStartMs: 1_759_708_800_000,
    requestEndMs: 1_759_968_000_000,
    scopeDigest: SHA256,
    pageScopeDigest: PAGE_SCOPE_DIGEST,
    accountIdentityDigest: '8'.repeat(64),
    accountIdentityKeyVersion: 'v1',
    checkpoint: checkpoint(),
    checkpointMac: EXPECTED_CHECKPOINT_MAC,
    expectedLedgerGeneration: 0,
    credentialReference: Object.freeze({
      id: '11000000-0000-4000-8000-000000000001',
      keyVersion: 'test_v1',
    }),
    integrityKeyReference: Object.freeze({
      id: '13000000-0000-4000-8000-000000000001',
      keyVersion: 'test_v1',
    }),
    ...overrides,
  }
}

function retryInput(overrides: Partial<BrokerCaptureFailureInput> = {}): BrokerCaptureFailureInput {
  return Object.freeze({
    requestAuthorizationId: REQUEST_AUTHORIZATION_ID,
    requestStartedAt: REQUEST_STARTED_AT,
    workUnitId: WORK_UNIT_ID,
    expectedWorkUnitRowVersion: 1,
    outcomeId: OUTCOME_ID,
    leaseToken: CLAIM_LEASE_TOKEN,
    requestSequence: 1,
    expectedCheckpointMac: EXPECTED_CHECKPOINT_MAC,
    capabilityId: 'historical_orders_v1',
    pageScopeDigest: PAGE_SCOPE_DIGEST,
    failureCode: 'rate_limited',
    httpStatus: 429,
    responseBytes: 128,
    requestDurationMs: 10,
    ...overrides,
  })
}

const requestAuthorizationInput: BrokerCaptureRequestAuthorizationInput = Object.freeze({
  workUnitId: WORK_UNIT_ID,
  expectedWorkUnitRowVersion: 1,
  requestSequence: 1,
  expectedCheckpointMac: EXPECTED_CHECKPOINT_MAC,
  leaseToken: CLAIM_LEASE_TOKEN,
  requestAuthorizationId: REQUEST_AUTHORIZATION_ID,
})

function requestAuthorizationResult(overrides: Record<string, unknown> = {}) {
  return {
    status: 'request_authorized',
    requestAuthorizationId: REQUEST_AUTHORIZATION_ID,
    sendDeadlineAt: '2099-08-07T10:00:05.000Z',
    workUnitId: WORK_UNIT_ID,
    workUnitRowVersion: 1,
    requestSequence: 1,
    syncActivationId: 'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
    activationGeneration: 1,
    seriesRowVersion: 4,
    authorityEpoch: 3,
    capabilityId: 'historical_orders_v1',
    scopeDigest: SHA256,
    pageScopeDigest: PAGE_SCOPE_DIGEST,
    credentialReference: Object.freeze({
      id: '11000000-0000-4000-8000-000000000001',
      keyVersion: 'test_v1',
    }),
    authorityBlocked: true,
    ...overrides,
  }
}

function retryResult(overrides: Record<string, unknown> = {}) {
  return {
    status: 'retry_pending',
    authorityBlocked: true,
    outcomeId: OUTCOME_ID,
    workUnitId: WORK_UNIT_ID,
    workUnitRowVersion: 2,
    attempt: 1,
    requestSequence: 1,
    failureCode: 'rate_limited',
    failureClass: 'provider',
    retryNotBefore: '2026-08-06T12:00:30.000Z',
    terminalReason: null,
    checkpoint: checkpoint({
      checkpointMac: NEXT_CHECKPOINT_MAC,
      status: 'retry_pending',
      reason: 'retry_scheduled',
      unitRequestAttempts: 1,
      unitResponseBytes: 128,
      unitElapsedMs: 1010,
      unitRetryCount: 1,
      unitBackoffMs: 1000,
      totalRequestAttempts: 1,
      totalResponseBytes: 128,
      totalElapsedMs: 1010,
      lastErrorCode: 'rate_limited',
      suggestedBackoffMs: 1000,
      retryNotBeforeMs: Date.parse('2026-08-06T12:00:30.000Z'),
    }),
    checkpointMac: NEXT_CHECKPOINT_MAC,
    runStatus: 'running',
    ...overrides,
  }
}

describe('broker capture control adapter', () => {
  it('serializes an exact claim request and accepts only opaque key references', async () => {
    const rpc = vi.fn(async () => ({ data: claimResult(), error: null }))

    const result = await claimBrokerCaptureWorkUnitWithClient({ rpc } as never, claimInput)

    expect(rpc).toHaveBeenCalledExactlyOnceWith(BROKER_CAPTURE_CLAIM_RPC, {
      p_work_unit_id: WORK_UNIT_ID,
      p_expected_work_unit_row_version: 0,
      p_claim_request_id: CLAIM_REQUEST_ID,
      p_lease_token: CLAIM_LEASE_TOKEN,
      p_claim_policy_version: BROKER_CAPTURE_CLAIM_POLICY_VERSION,
    })
    expect(result).toMatchObject({
      status: 'claimed',
      authorityBlocked: true,
      credentialReference: { id: '11000000-0000-4000-8000-000000000001' },
      integrityKeyReference: { id: '13000000-0000-4000-8000-000000000001' },
    })
    expect(result).not.toHaveProperty('apiKey')
    expect(result).not.toHaveProperty('secretKey')
    expect(result).not.toHaveProperty('encryptedPayload')
    expect(result).not.toHaveProperty('integrityKey')
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.checkpoint)).toBe(true)
    expect(Object.isFrozen(result.checkpoint.scope)).toBe(true)
  })

  it('keeps claim and failure page-size bounds capability-coherent after database commits', async () => {
    const executionScope = {
      symbol: 'BTC_USDT',
      startTime: 1_759_708_800_000,
      endTime: 1_759_968_000_000,
      pageNumber: 1,
      pageSize: 1000,
    }
    const executionClaimRpc = vi.fn(async () => ({
      data: claimResult({
        capabilityId: 'historical_executions_v3',
        endpointId: 'historical_executions_v3',
        checkpoint: checkpoint({
          capabilityId: 'historical_executions_v3',
          scope: executionScope,
        }),
      }),
      error: null,
    }))
    const executionClaim = await claimBrokerCaptureWorkUnitWithClient(
      { rpc: executionClaimRpc } as never,
      claimInput,
    )
    expect(executionClaim.checkpoint.scope.pageSize).toBe(1000)

    const baseRetryResult = retryResult()
    const executionFailureRpc = vi.fn(async () => ({
      data: {
        ...baseRetryResult,
        checkpoint: {
          ...baseRetryResult.checkpoint,
          capabilityId: 'historical_executions_v3',
          scope: executionScope,
        },
      },
      error: null,
    }))
    const executionFailure = await recordBrokerCaptureFailureWithClient(
      { rpc: executionFailureRpc } as never,
      retryInput({ capabilityId: 'historical_executions_v3' }),
    )
    expect(executionFailure.checkpoint.scope.pageSize).toBe(1000)

    const oversizedExecution = vi.fn(async () => ({
      data: claimResult({
        capabilityId: 'historical_executions_v3',
        endpointId: 'historical_executions_v3',
        checkpoint: checkpoint({
          capabilityId: 'historical_executions_v3',
          scope: { ...executionScope, pageSize: 1001 },
        }),
      }),
      error: null,
    }))
    await expect(claimBrokerCaptureWorkUnitWithClient({ rpc: oversizedExecution } as never, claimInput))
      .rejects.toMatchObject({ code: 'database_result_invalid' })

    const oversizedOrders = vi.fn(async () => ({
      data: claimResult({
        checkpoint: checkpoint({
          scope: { ...executionScope, pageSize: 101 },
        }),
      }),
      error: null,
    }))
    await expect(claimBrokerCaptureWorkUnitWithClient({ rpc: oversizedOrders } as never, claimInput))
      .rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it('rejects a forged claim result, extra secret fields and row-version drift', async () => {
    const withSecret = vi.fn(async () => ({ data: claimResult({ secretKey: 'must-not-cross-boundary' }), error: null }))
    await expect(claimBrokerCaptureWorkUnitWithClient({ rpc: withSecret } as never, claimInput))
      .rejects.toMatchObject({ code: 'database_result_invalid' })

    const rowVersionDrift = vi.fn(async () => ({ data: claimResult({ workUnitRowVersion: 0 }), error: null }))
    await expect(claimBrokerCaptureWorkUnitWithClient({ rpc: rowVersionDrift } as never, claimInput))
      .rejects.toMatchObject({ code: 'database_result_invalid' })

    const checkpointDrift = vi.fn(async () => ({
      data: claimResult({ checkpoint: checkpoint({ totalRequestAttempts: 1 }) }),
      error: null,
    }))
    await expect(claimBrokerCaptureWorkUnitWithClient({ rpc: checkpointDrift } as never, claimInput))
      .rejects.toMatchObject({ code: 'database_result_invalid' })

    const digestDomainConfusion = vi.fn(async () => ({
      data: claimResult({ pageScopeDigest: SHA256 }),
      error: null,
    }))
    await expect(claimBrokerCaptureWorkUnitWithClient({ rpc: digestDomainConfusion } as never, claimInput))
      .rejects.toMatchObject({ code: 'database_result_invalid' })

    const nestedScopeDrift = vi.fn(async () => ({
      data: claimResult({
        checkpoint: checkpoint({
          scope: {
            symbol: 'ETH_USDT',
            startTime: 1_759_708_800_000,
            endTime: 1_759_968_000_000,
            pageNumber: 1,
            pageSize: 20,
          },
        }),
      }),
      error: null,
    }))
    await expect(claimBrokerCaptureWorkUnitWithClient({ rpc: nestedScopeDrift } as never, claimInput))
      .rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it('maps closed database codes without reflecting database details', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: 'P0001', message: 'CONTROL_RETRY_NOT_DUE provider-internal detail' },
    }))

    const rejection = claimBrokerCaptureWorkUnitWithClient({ rpc } as never, claimInput)
    await expect(rejection).rejects.toBeInstanceOf(BrokerCaptureControlError)
    await expect(rejection).rejects.toMatchObject({ code: 'CONTROL_RETRY_NOT_DUE' })
    await expect(rejection).rejects.not.toThrow(/provider-internal/)
  })

  it.each([
    'CONTROL_ACCOUNT_LEASE_BUSY',
    'CONTROL_ACCOUNT_LEASE_DRIFT',
  ] as const)('maps reachable Claim rejection %s exactly and sanitized', async (databaseCode) => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: `P0001: ${databaseCode} internal account detail` },
    }))
    await expect(claimBrokerCaptureWorkUnitWithClient({ rpc } as never, claimInput))
      .rejects.toMatchObject({
        code: databaseCode,
        message: 'Die Broker-Capture-Kontrolltransaktion wurde von der Datenbank abgelehnt.',
      })
  })

  it('maps the reachable Permit account-Lease rejection exactly and sanitized', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'P0001: REQUEST_AUTH_ACCOUNT_LEASE_INVALID internal account detail' },
    }))
    await expect(authorizeBrokerCaptureRequestWithClient(
      { rpc } as never,
      requestAuthorizationInput,
    )).rejects.toMatchObject({
      code: 'REQUEST_AUTH_ACCOUNT_LEASE_INVALID',
      message: 'Die Broker-Capture-Kontrolltransaktion wurde von der Datenbank abgelehnt.',
    })
  })

  it.each([
    'FAILURE_PARENT_AUTHORITY_MISSING',
    'FAILURE_PARENT_AUTHORITY_INVALID',
    'FAILURE_ACCOUNT_LEASE_INVALID',
    'SCHEDULER_PARENT_LOCK_TIMEOUT',
    'SCHEDULER_PARENT_STATEMENT_TIMEOUT',
  ] as const)('maps reachable Failure rejection %s exactly and sanitized', async (databaseCode) => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: `P0001: ${databaseCode} internal failure detail` },
    }))
    await expect(recordBrokerCaptureFailureWithClient({ rpc } as never, retryInput()))
      .rejects.toMatchObject({
        code: databaseCode,
        message: 'Die Broker-Capture-Kontrolltransaktion wurde von der Datenbank abgelehnt.',
      })
  })

  it('keeps unknown Control database codes generic and sanitized', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'P0001: FAILURE_FUTURE_CODE internal failure detail' },
    }))
    await expect(recordBrokerCaptureFailureWithClient({ rpc } as never, retryInput()))
      .rejects.toMatchObject({
        code: 'database_error',
        message: 'Die Broker-Capture-Kontrolltransaktion ist ohne akzeptiertes Teilergebnis fehlgeschlagen.',
      })
  })

  it('consumes an exact request permit before credential loading', async () => {
    const rpc = vi.fn(async () => ({ data: requestAuthorizationResult(), error: null }))
    const result = await authorizeBrokerCaptureRequestWithClient(
      { rpc } as never,
      requestAuthorizationInput,
    )

    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      BROKER_CAPTURE_REQUEST_AUTHORIZATION_RPC,
      {
        p_work_unit_id: WORK_UNIT_ID,
        p_expected_work_unit_row_version: 1,
        p_request_sequence: 1,
        p_expected_checkpoint_mac: EXPECTED_CHECKPOINT_MAC,
        p_lease_token: CLAIM_LEASE_TOKEN,
        p_request_authorization_id: REQUEST_AUTHORIZATION_ID,
      },
    )
    expect(result).toMatchObject({
      status: 'request_authorized',
      authorityBlocked: true,
      credentialReference: { id: '11000000-0000-4000-8000-000000000001' },
    })
    expect(Object.isFrozen(result)).toBe(true)

    const forged = vi.fn(async () => ({
      data: requestAuthorizationResult({ workUnitId: CLAIM_REQUEST_ID }),
      error: null,
    }))
    await expect(authorizeBrokerCaptureRequestWithClient(
      { rpc: forged } as never,
      requestAuthorizationInput,
    )).rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it('maps PostgreSQL lock and statement timeouts to stable fail-closed codes', async () => {
    for (const [sqlState, code] of [
      ['55P03', 'CONTROL_LOCK_TIMEOUT'],
      ['57014', 'CONTROL_STATEMENT_TIMEOUT'],
    ] as const) {
      const rpc = vi.fn(async () => ({ data: null, error: { code: sqlState, message: 'internal detail' } }))
      await expect(claimBrokerCaptureWorkUnitWithClient({ rpc } as never, claimInput))
        .rejects.toMatchObject({ code })
    }
  })

  it('serializes sanitized retry outcomes without raw body or provider-message channels', async () => {
    const input = retryInput()
    const rpc = vi.fn(async () => ({ data: retryResult(), error: null }))

    const result = await recordBrokerCaptureFailureWithClient({ rpc } as never, input)

    expect(rpc).toHaveBeenCalledExactlyOnceWith(BROKER_CAPTURE_FAILURE_RPC, {
      p_request_authorization_id: REQUEST_AUTHORIZATION_ID,
      p_request_started_at: REQUEST_STARTED_AT,
      p_work_unit_id: WORK_UNIT_ID,
      p_expected_work_unit_row_version: 1,
      p_outcome_id: OUTCOME_ID,
      p_lease_token: CLAIM_LEASE_TOKEN,
      p_request_sequence: 1,
      p_expected_checkpoint_mac: EXPECTED_CHECKPOINT_MAC,
      p_expected_capability_id: 'historical_orders_v1',
      p_expected_page_scope_digest: PAGE_SCOPE_DIGEST,
      p_failure_code: 'rate_limited',
      p_http_status: 429,
      p_response_bytes: 128,
      p_request_duration_ms: 10,
      p_failure_policy_version: BROKER_CAPTURE_FAILURE_POLICY_VERSION,
    })
    const serialized = JSON.stringify(rpc.mock.calls[0])
    expect(serialized).not.toMatch(/rawBody|rawPayload|providerMessage|apiKey|secretKey|encryptedPayload/i)
    expect(result).toEqual(retryResult())
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('rejects malformed failure metrics and bindings before invoking the database', async () => {
    const rpc = vi.fn()

    await expect(recordBrokerCaptureFailureWithClient({ rpc } as never, retryInput({
      responseBytes: 65_537,
    }))).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(recordBrokerCaptureFailureWithClient({ rpc } as never, retryInput({
      expectedCheckpointMac: 'not-a-digest',
    }))).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(recordBrokerCaptureFailureWithClient({ rpc } as never, retryInput({
      pageScopeDigest: 'not-a-digest',
    }))).rejects.toMatchObject({ code: 'invalid_input' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('accepts only an exact terminal outcome binding', async () => {
    const input = retryInput({
      expectedWorkUnitRowVersion: 3,
      outcomeId: '82000000-0000-4000-8000-000000000002',
      leaseToken: '91000000-0000-4000-8000-000000000002',
      requestSequence: 2,
      expectedCheckpointMac: '3'.repeat(64),
      failureCode: 'invalid_credential',
      httpStatus: 401,
      responseBytes: 64,
      requestDurationMs: 20,
    })
    const data = retryResult({
      status: 'terminal_failed',
      outcomeId: input.outcomeId,
      workUnitRowVersion: 4,
      attempt: 2,
      requestSequence: 2,
      failureCode: 'invalid_credential',
      failureClass: 'authority',
      retryNotBefore: null,
      terminalReason: 'non_retryable_failure',
      checkpoint: checkpoint({
        checkpointMac: '4'.repeat(64),
        status: 'partial_failed',
        reason: 'non_retryable_failure',
        unitRequestAttempts: 2,
        unitResponseBytes: 192,
        unitElapsedMs: 1030,
        unitRetryCount: 1,
        unitBackoffMs: 1000,
        totalRequestAttempts: 2,
        totalResponseBytes: 192,
        totalElapsedMs: 1030,
        lastErrorCode: 'invalid_credential',
      }),
      checkpointMac: '4'.repeat(64),
      runStatus: 'failed',
    })
    const rpc = vi.fn(async () => ({ data, error: null }))

    await expect(recordBrokerCaptureFailureWithClient({ rpc } as never, input)).resolves.toEqual(data)

    const crossRunData = { ...data, status: 'partial_failed' }
    const crossRunRpc = vi.fn(async () => ({ data: crossRunData, error: null }))
    await expect(recordBrokerCaptureFailureWithClient({ rpc: crossRunRpc } as never, input))
      .resolves.toEqual(crossRunData)

    const forgedRpc = vi.fn(async () => ({ data: { ...data, runStatus: 'running' }, error: null }))
    await expect(recordBrokerCaptureFailureWithClient({ rpc: forgedRpc } as never, input))
      .rejects.toMatchObject({ code: 'database_result_invalid' })

    const forgedClass = vi.fn(async () => ({ data: { ...data, failureClass: 'transport' }, error: null }))
    await expect(recordBrokerCaptureFailureWithClient({ rpc: forgedClass } as never, input))
      .rejects.toMatchObject({ code: 'database_result_invalid' })
  })
})

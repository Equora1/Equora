import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  automaticCaptureActivated: vi.fn(),
  captureEnvironmentReady: vi.fn(),
  recover: vi.fn(),
  findYielded: vi.fn(),
  continueYielded: vi.fn(),
  findFinalization: vi.fn(),
  finalize: vi.fn(),
  findClaimable: vi.fn(),
  materialize: vi.fn(),
  claim: vi.fn(),
  authorize: vi.fn(),
  failure: vi.fn(),
  release: vi.fn(),
  renew: vi.fn(),
  loadMaterial: vi.fn(),
  resumeLedger: vi.fn(),
  applyPage: vi.fn(),
  commitPage: vi.fn(),
  decrypt: vi.fn(),
  execute: vi.fn(),
}))

vi.mock('@/lib/server/mexc-runtime', () => ({
  isMexcAutomaticCaptureActivated: mocks.automaticCaptureActivated,
  isMexcCaptureEnvironmentReady: mocks.captureEnvironmentReady,
}))
vi.mock('@/lib/server/broker-capture-scheduler', () => ({
  continueYieldedBrokerCaptureWorkUnit: mocks.continueYielded,
  materializeNextDueBrokerCapture: mocks.materialize,
  recoverExpiredBrokerCaptureLeases: mocks.recover,
  releaseBrokerCaptureLease: mocks.release,
  renewBrokerCaptureLease: mocks.renew,
}))
vi.mock('@/lib/server/broker-runtime-control', () => ({
  finalizeBrokerCaptureScope: mocks.finalize,
  findClaimableBrokerCaptureWorkUnit: mocks.findClaimable,
  findPendingBrokerCaptureScopeFinalization: mocks.findFinalization,
  findPendingYieldedBrokerCaptureWorkUnit: mocks.findYielded,
  loadBrokerCaptureMaterial: mocks.loadMaterial,
}))
vi.mock('@/lib/server/broker-capture-control', () => ({
  authorizeBrokerCaptureRequest: mocks.authorize,
  claimBrokerCaptureWorkUnit: mocks.claim,
  recordBrokerCaptureFailure: mocks.failure,
}))
vi.mock('@/lib/server/broker-raw-ledger', () => ({
  resumeBrokerRawLedgerState: mocks.resumeLedger,
}))
vi.mock('@/lib/server/mexc-capture-orchestrator', () => ({
  applyMexcClaimedPage: mocks.applyPage,
}))
vi.mock('@/lib/server/broker-capture-persistence', () => ({
  commitBrokerCapturePage: mocks.commitPage,
}))
vi.mock('@/lib/server/broker-secret-store', () => ({
  decryptBrokerCredentials: mocks.decrypt,
}))
vi.mock('@/lib/server/mexc-transport', () => ({
  executeMexcPrivateReadWorkUnit: mocks.execute,
  MexcTransportError: class MexcTransportError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly httpStatus?: number,
    ) {
      super(message)
      this.name = 'MexcTransportError'
    }
  },
}))

import { runMexcCaptureCycle } from '../lib/server/mexc-capture-runtime'
import { MexcTransportError } from '../lib/server/mexc-transport'
import type { BrokerCaptureYieldContinuationResult } from '../lib/server/broker-capture-scheduler'

const WORK_UNIT_ID = '10000000-0000-4000-8000-000000000001'
const NOW = 1_760_000_000_000
const SHA256 = 'a'.repeat(64)

function continuationResult(
  overrides: Partial<BrokerCaptureYieldContinuationResult> = {},
): BrokerCaptureYieldContinuationResult {
  return Object.freeze({
    status: 'continued' as const,
    requestId: '18000000-0000-4000-8000-000000000001',
    predecessorWorkUnitId: WORK_UNIT_ID,
    successorWorkUnitId: '19000000-0000-4000-8000-000000000001',
    runId: '20000000-0000-4000-8000-000000000002',
    scopeId: '30000000-0000-4000-8000-000000000003',
    continuationGeneration: 2,
    crossRequestReplay: false,
    authorityBlocked: true as const,
    ...overrides,
  })
}

function checkpoint(
  status: 'ready' | 'continue' | 'yielded' | 'terminal_observed' = 'ready',
) {
  const reason = status === 'ready' ? 'initialized'
    : status === 'continue' ? 'full_page'
      : status === 'yielded' ? 'work_unit_budget_reached'
        : 'empty_page'
  return {
    checkpointVersion: 'mexc-page-checkpoint-v1',
    checkpointMacVersion: 'mexc-page-checkpoint-hmac-sha256-v1',
    checkpointMac: 'b'.repeat(64),
    budgetProfileId: 'mexc-history-page-budget-v1',
    budgetProfileDigest: 'c'.repeat(64),
    capabilityId: 'historical_orders_v1',
    scope: { symbol: 'BTC_USDT', startTime: NOW - 86_400_000, endTime: NOW, pageNumber: 1, pageSize: 20 },
    scopeDigest: 'd'.repeat(64), status,
    reason,
    workUnitSequence: 1, nextPageNumber: 1, unitSuccessfulPages: 0,
    unitRequestAttempts: 0, unitRawEvents: 0, unitResponseBytes: 0,
    unitElapsedMs: 0, unitRetryCount: 0, unitBackoffMs: 0,
    totalSuccessfulPages: 0, totalRequestAttempts: 0, totalRawEvents: 0,
    totalResponseBytes: 0, totalElapsedMs: 0, authorityBlocked: true,
    terminalEvidence: status === 'terminal_observed' ? 'empty_page' : 'none',
    lastCursor: null, lastPageFingerprint: null, seenPageFingerprints: [],
    orderedProviderIdentitySequenceDigest: 'e'.repeat(64), lastErrorCode: null,
    suggestedBackoffMs: null, retryNotBeforeMs: null,
  }
}

function claimResult() {
  return {
    status: 'claimed', authorityBlocked: true, claimPolicyVersion: 'broker-capture-claim-policy-v1',
    claimRequestId: '11000000-0000-4000-8000-000000000001', workUnitId: WORK_UNIT_ID,
    workUnitRowVersion: 1, attempt: 1, maxAttempts: 8, requestSequence: 0,
    leaseExpiresAt: new Date(NOW + 45_000).toISOString(),
    runId: '12000000-0000-4000-8000-000000000001', scopeId: '13000000-0000-4000-8000-000000000001',
    brokerAccountId: '14000000-0000-4000-8000-000000000001',
    connectionAccountId: '15000000-0000-4000-8000-000000000001',
    syncActivationId: '16000000-0000-4000-8000-000000000001', activationGeneration: 1,
    providerCode: 'mexc', providerContractVersion: 'mexc_futures_contract_v1', adapterVersion: 'v57_61_0',
    profileId: 'mexc_futures_rest', profileVersion: 'v1', capabilityId: 'historical_orders_v1',
    endpointId: 'historical_orders_v1', instrumentSymbol: 'BTC_USDT', positionType: null,
    requestStartMs: NOW - 86_400_000, requestEndMs: NOW, scopeDigest: SHA256,
    pageScopeDigest: 'd'.repeat(64), accountIdentityDigest: 'f'.repeat(64),
    accountIdentityKeyVersion: 'v1', checkpoint: checkpoint(), checkpointMac: 'b'.repeat(64),
    expectedLedgerGeneration: 0,
    credentialReference: { id: '17000000-0000-4000-8000-000000000001', keyVersion: 'key_v1' },
    integrityKeyReference: { id: '18000000-0000-4000-8000-000000000001', keyVersion: 'ik_v1' },
  }
}

function setupClaimableCycle(leaseExpiresAtMs = NOW + 45_000) {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  mocks.findYielded.mockResolvedValue({
    status: 'no_pending', workUnitId: null,
    workUnitRowVersion: null, authorityBlocked: true,
  })
  mocks.findFinalization.mockResolvedValue({
    status: 'no_pending', requestAuthorizationId: null, authorityBlocked: true,
  })
  mocks.findClaimable.mockResolvedValue({
    status: 'claimable', workUnitId: WORK_UNIT_ID,
    workUnitRowVersion: 0, authorityBlocked: true,
  })
  const claim = { ...claimResult(), leaseExpiresAt: new Date(leaseExpiresAtMs).toISOString() }
  mocks.claim.mockResolvedValue(claim)
  mocks.resumeLedger.mockReturnValue({ generation: 0 })
  mocks.authorize.mockImplementation(async (input) => ({
    status: 'request_authorized',
    requestAuthorizationId: input.requestAuthorizationId,
    sendDeadlineAt: new Date(NOW + 5_000).toISOString(),
    workUnitId: WORK_UNIT_ID,
    workUnitRowVersion: input.expectedWorkUnitRowVersion,
    requestSequence: input.requestSequence,
    syncActivationId: claim.syncActivationId,
    activationGeneration: 1,
    seriesRowVersion: 1,
    authorityEpoch: 1,
    capabilityId: claim.capabilityId,
    scopeDigest: SHA256,
    pageScopeDigest: 'd'.repeat(64),
    credentialReference: claim.credentialReference,
    authorityBlocked: true,
  }))
  mocks.loadMaterial.mockImplementation(async (requestAuthorizationId) => ({
    requestAuthorizationId,
    userId: '22000000-0000-4000-8000-000000000001',
    brokerAccountId: claim.brokerAccountId,
    connectionAccountId: claim.connectionAccountId,
    syncActivationId: claim.syncActivationId,
    activationGeneration: 1,
    providerCode: 'mexc',
    encryptedPayload: 'encrypted',
    credentialReference: claim.credentialReference,
    integrityKeyReference: claim.integrityKeyReference,
    integrityKeyBase64: Buffer.alloc(32, 7).toString('base64'),
    sendDeadlineAt: new Date(NOW + 5_000).toISOString(),
    authorityBlocked: true,
  }))
  mocks.decrypt.mockReturnValue({ apiKey: 'read-key', secretKey: 'read-secret' })
  mocks.execute.mockImplementation(async (requests, loadCredentials, authorizeRequest) => {
    const request = requests[0]
    const requestSequence = request.captureBinding.requestSequence
    const permit = await authorizeRequest({
      capabilityId: request.capabilityId,
      scopeDigest: SHA256,
      workUnitId: WORK_UNIT_ID,
      requestSequence,
    })
    await loadCredentials(permit.credentialReference)
    return {
      serverTime: NOW,
      outcomes: [{
        capabilityId: claim.capabilityId,
        status: 'wire_succeeded',
        response: { data: [] },
      }],
    }
  })
  return claim
}

function mockCommittedCheckpointSequence(
  statuses: Array<'continue' | 'yielded' | 'terminal_observed'>,
) {
  let generation = 0
  mocks.applyPage.mockImplementation(() => {
    const nextCheckpoint = checkpoint(statuses[generation]!)
    generation += 1
    nextCheckpoint.totalRequestAttempts = generation
    nextCheckpoint.nextPageNumber = generation + 1
    return {
      status: 'page_committed',
      rawLedgerTransition: { state: { generation } },
      pageTransition: { checkpoint: nextCheckpoint },
    }
  })
  mocks.commitPage.mockImplementation(async (input) => ({
    workUnitRowVersion: input.expectedWorkUnitRowVersion + 1,
    ledgerGeneration: generation,
  }))
}

describe('MEXC capture runtime restart ordering', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    mocks.automaticCaptureActivated.mockReturnValue(true)
    mocks.captureEnvironmentReady.mockReturnValue(true)
    mocks.recover.mockResolvedValue({
      status: 'no_expired', requestId: 'ignored', inspectedCount: 0,
      requeuedCount: 0, uncertainEgressCount: 0, outcomeDerivedCount: 0,
      authorityBlocked: true,
    })
  })

  it('remains completely inert while automatic capture is disabled', async () => {
    mocks.automaticCaptureActivated.mockReturnValue(false)

    await expect(runMexcCaptureCycle()).resolves.toEqual({
      status: 'disabled', workUnitId: null, pagesCommitted: 0,
      scopeFinalized: false, failureCode: null, authorityBlocked: true,
    })
    expect(mocks.recover).not.toHaveBeenCalled()
    expect(mocks.findYielded).not.toHaveBeenCalled()
  })

  it('recovers leases and consumes a durable yielded predecessor before claiming new work', async () => {
    mocks.findYielded.mockResolvedValue({
      status: 'pending', workUnitId: WORK_UNIT_ID,
      workUnitRowVersion: 7, authorityBlocked: true,
    })
    mocks.continueYielded.mockResolvedValue(continuationResult({
      status: 'scope_exhausted', successorWorkUnitId: null,
      continuationGeneration: 8,
    }))

    await expect(runMexcCaptureCycle()).resolves.toEqual({
      status: 'failed', workUnitId: WORK_UNIT_ID, pagesCommitted: 0,
      scopeFinalized: false, failureCode: 'SCOPE_BUDGET_EXHAUSTED',
      authorityBlocked: true,
    })
    expect(mocks.recover).toHaveBeenCalledWith(expect.objectContaining({ batchLimit: 10 }))
    expect(mocks.continueYielded).toHaveBeenCalledWith(expect.objectContaining({
      predecessorWorkUnitId: WORK_UNIT_ID,
      expectedPredecessorRowVersion: 7,
    }))
    expect(mocks.recover.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findYielded.mock.invocationCallOrder[0]!,
    )
    expect(mocks.findYielded.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.continueYielded.mock.invocationCallOrder[0]!,
    )
    expect(mocks.findFinalization).not.toHaveBeenCalled()
    expect(mocks.findClaimable).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('re-enters the enrollment-filtered finder after creating a yielded successor', async () => {
    mocks.findYielded.mockResolvedValue({
      status: 'pending', workUnitId: WORK_UNIT_ID,
      workUnitRowVersion: 7, authorityBlocked: true,
    })
    mocks.continueYielded.mockResolvedValue(continuationResult())
    mocks.findClaimable.mockResolvedValue({
      status: 'no_claimable', workUnitId: null,
      workUnitRowVersion: null, authorityBlocked: true,
    })

    await expect(runMexcCaptureCycle()).resolves.toMatchObject({ status: 'idle', workUnitId: null })
    expect(mocks.findClaimable).toHaveBeenCalledOnce()
    expect(mocks.claim).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('does not treat Scheduler materialization as Claim authority', async () => {
    mocks.findYielded.mockResolvedValue({ status: 'no_pending', workUnitId: null, workUnitRowVersion: null, authorityBlocked: true })
    mocks.findFinalization.mockResolvedValue({ status: 'no_pending', requestAuthorizationId: null, authorityBlocked: true })
    mocks.findClaimable
      .mockResolvedValueOnce({ status: 'no_claimable', workUnitId: null, workUnitRowVersion: null, authorityBlocked: true })
      .mockResolvedValueOnce({ status: 'no_claimable', workUnitId: null, workUnitRowVersion: null, authorityBlocked: true })
    mocks.materialize.mockResolvedValue({ status: 'scheduled', workUnitId: WORK_UNIT_ID, authorityBlocked: true })

    await expect(runMexcCaptureCycle()).resolves.toMatchObject({ status: 'idle', workUnitId: null })
    expect(mocks.findClaimable).toHaveBeenCalledTimes(2)
    expect(mocks.claim).not.toHaveBeenCalled()
  })

  it('finalizes a terminal scope before finding or materializing new work', async () => {
    mocks.findYielded.mockResolvedValue({ status: 'no_pending', workUnitId: null, workUnitRowVersion: null, authorityBlocked: true })
    mocks.findFinalization.mockResolvedValue({
      status: 'pending', requestAuthorizationId: '21000000-0000-4000-8000-000000000099',
      authorityBlocked: true,
    })
    mocks.finalize.mockResolvedValue({ status: 'scope_finalized', authorityBlocked: true })

    await expect(runMexcCaptureCycle()).resolves.toEqual({
      status: 'captured', workUnitId: null, pagesCommitted: 0,
      scopeFinalized: true, failureCode: null, authorityBlocked: true,
    })
    expect(mocks.finalize).toHaveBeenCalledWith(expect.objectContaining({
      requestAuthorizationId: '21000000-0000-4000-8000-000000000099',
    }))
    expect(mocks.findClaimable).not.toHaveBeenCalled()
    expect(mocks.materialize).not.toHaveBeenCalled()
  })

  it('releases a claimed lease before starting a page beyond the planning boundary', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(NOW).mockReturnValue(NOW + 220_000)
    mocks.findYielded.mockResolvedValue({ status: 'no_pending', workUnitId: null, workUnitRowVersion: null, authorityBlocked: true })
    mocks.findFinalization.mockResolvedValue({ status: 'no_pending', requestAuthorizationId: null, authorityBlocked: true })
    mocks.findClaimable.mockResolvedValue({ status: 'claimable', workUnitId: WORK_UNIT_ID, workUnitRowVersion: 0, authorityBlocked: true })
    mocks.claim.mockResolvedValue(claimResult())
    mocks.resumeLedger.mockReturnValue({ generation: 0 })
    mocks.release.mockResolvedValue({ status: 'released', authorityBlocked: true })

    await expect(runMexcCaptureCycle()).resolves.toEqual({
      status: 'released', workUnitId: WORK_UNIT_ID, pagesCommitted: 0,
      scopeFinalized: false, failureCode: null, authorityBlocked: true,
    })
    expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({
      workUnitId: WORK_UNIT_ID,
      releaseReason: 'worker_budget_yield',
    }))
    expect(mocks.authorize).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('completes one enrolled claim-authorize-GET-commit-finalize cycle', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    mocks.findYielded.mockResolvedValue({ status: 'no_pending', workUnitId: null, workUnitRowVersion: null, authorityBlocked: true })
    mocks.findFinalization.mockResolvedValue({ status: 'no_pending', requestAuthorizationId: null, authorityBlocked: true })
    mocks.findClaimable
      .mockResolvedValueOnce({ status: 'no_claimable', workUnitId: null, workUnitRowVersion: null, authorityBlocked: true })
      .mockResolvedValueOnce({ status: 'claimable', workUnitId: WORK_UNIT_ID, workUnitRowVersion: 0, authorityBlocked: true })
    mocks.materialize.mockResolvedValue({ status: 'scheduled', workUnitId: WORK_UNIT_ID, authorityBlocked: true })
    const claim = claimResult()
    mocks.claim.mockResolvedValue(claim)
    mocks.resumeLedger.mockReturnValue({ generation: 0 })
    mocks.authorize.mockResolvedValue({
      status: 'request_authorized', requestAuthorizationId: '21000000-0000-4000-8000-000000000001',
      sendDeadlineAt: new Date(NOW + 5_000).toISOString(), workUnitId: WORK_UNIT_ID,
      workUnitRowVersion: 1, requestSequence: 1, syncActivationId: claim.syncActivationId,
      activationGeneration: 1, seriesRowVersion: 1, authorityEpoch: 1,
      capabilityId: 'historical_orders_v1', scopeDigest: SHA256, pageScopeDigest: 'd'.repeat(64),
      credentialReference: claim.credentialReference, authorityBlocked: true,
    })
    mocks.loadMaterial.mockResolvedValue({
      requestAuthorizationId: '21000000-0000-4000-8000-000000000001', userId: '22000000-0000-4000-8000-000000000001',
      brokerAccountId: claim.brokerAccountId, connectionAccountId: claim.connectionAccountId,
      syncActivationId: claim.syncActivationId, activationGeneration: 1, providerCode: 'mexc',
      encryptedPayload: 'encrypted', credentialReference: claim.credentialReference,
      integrityKeyReference: claim.integrityKeyReference, integrityKeyBase64: Buffer.alloc(32, 7).toString('base64'),
      sendDeadlineAt: new Date(NOW + 5_000).toISOString(), authorityBlocked: true,
    })
    mocks.decrypt.mockReturnValue({ apiKey: 'read-key', secretKey: 'read-secret' })
    mocks.execute.mockImplementation(async (requests, loadCredentials, authorizeRequest) => {
      const request = requests[0]
      const permit = await authorizeRequest({
        capabilityId: request.capabilityId, scopeDigest: SHA256,
        workUnitId: WORK_UNIT_ID, requestSequence: 1,
      })
      await loadCredentials(permit.credentialReference)
      return { serverTime: NOW, outcomes: [{
        capabilityId: 'historical_orders_v1', status: 'wire_succeeded', response: { data: [] },
      }] }
    })
    const terminalCheckpoint = checkpoint('terminal_observed')
    mocks.applyPage.mockReturnValue({
      status: 'page_committed', rawLedgerTransition: { state: { generation: 1 } },
      pageTransition: { checkpoint: terminalCheckpoint },
    })
    mocks.commitPage.mockResolvedValue({ workUnitRowVersion: 2, ledgerGeneration: 1 })
    mocks.finalize.mockResolvedValue({ status: 'scope_finalized', authorityBlocked: true })

    await expect(runMexcCaptureCycle()).resolves.toEqual({
      status: 'captured', workUnitId: WORK_UNIT_ID, pagesCommitted: 1,
      scopeFinalized: true, failureCode: null, authorityBlocked: true,
    })
    expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(mocks.authorize.mock.invocationCallOrder[0]!)
    expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(mocks.loadMaterial.mock.invocationCallOrder[0]!)
    expect(mocks.loadMaterial.mock.invocationCallOrder[0]).toBeLessThan(mocks.commitPage.mock.invocationCallOrder[0]!)
    expect(mocks.commitPage.mock.invocationCallOrder[0]).toBeLessThan(mocks.finalize.mock.invocationCallOrder[0]!)
  })

  it('records a bound transport failure and returns its sanitized failure code', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    mocks.findYielded.mockResolvedValue({ status: 'no_pending', workUnitId: null, workUnitRowVersion: null, authorityBlocked: true })
    mocks.findFinalization.mockResolvedValue({ status: 'no_pending', requestAuthorizationId: null, authorityBlocked: true })
    mocks.findClaimable.mockResolvedValue({ status: 'claimable', workUnitId: WORK_UNIT_ID, workUnitRowVersion: 0, authorityBlocked: true })
    const claim = claimResult()
    mocks.claim.mockResolvedValue(claim)
    mocks.resumeLedger.mockReturnValue({ generation: 0 })
    mocks.authorize.mockResolvedValue({
      status: 'request_authorized', requestAuthorizationId: '21000000-0000-4000-8000-000000000002',
      sendDeadlineAt: new Date(NOW + 5_000).toISOString(), workUnitId: WORK_UNIT_ID,
      workUnitRowVersion: 1, requestSequence: 1, syncActivationId: claim.syncActivationId,
      activationGeneration: 1, seriesRowVersion: 1, authorityEpoch: 1,
      capabilityId: 'historical_orders_v1', scopeDigest: SHA256, pageScopeDigest: 'd'.repeat(64),
      credentialReference: claim.credentialReference, authorityBlocked: true,
    })
    mocks.execute.mockImplementation(async (requests, _loadCredentials, authorizeRequest) => {
      const request = requests[0]
      await authorizeRequest({
        capabilityId: request.capabilityId, scopeDigest: SHA256,
        workUnitId: WORK_UNIT_ID, requestSequence: 1,
      })
      throw new MexcTransportError('timeout', 'sanitized timeout')
    })
    mocks.failure.mockResolvedValue({ failureCode: 'timeout' })

    await expect(runMexcCaptureCycle()).resolves.toEqual({
      status: 'failed', workUnitId: WORK_UNIT_ID, pagesCommitted: 0,
      scopeFinalized: false, failureCode: 'timeout', authorityBlocked: true,
    })
    expect(mocks.failure).toHaveBeenCalledWith(expect.objectContaining({
      requestAuthorizationId: '21000000-0000-4000-8000-000000000002',
      failureCode: 'timeout',
    }))
    expect(mocks.loadMaterial).not.toHaveBeenCalled()
    expect(mocks.commitPage).not.toHaveBeenCalled()
  })

  it('renews first and carries the renewed row version through two committed pages', async () => {
    setupClaimableCycle(NOW + 10_000)
    mocks.renew.mockResolvedValue({
      status: 'renewed', workUnitRowVersion: 2,
      leaseExpiresAt: new Date(NOW + 60_000).toISOString(),
      authorityBlocked: true,
    })
    mockCommittedCheckpointSequence(['continue', 'terminal_observed'])
    mocks.finalize.mockResolvedValue({ status: 'scope_finalized', authorityBlocked: true })

    await expect(runMexcCaptureCycle()).resolves.toEqual({
      status: 'captured', workUnitId: WORK_UNIT_ID, pagesCommitted: 2,
      scopeFinalized: true, failureCode: null, authorityBlocked: true,
    })
    expect(mocks.renew).toHaveBeenCalledWith(expect.objectContaining({
      workUnitId: WORK_UNIT_ID,
      expectedWorkUnitRowVersion: 1,
    }))
    expect(mocks.authorize.mock.calls.map(([input]) => input.expectedWorkUnitRowVersion))
      .toEqual([2, 3])
    expect(mocks.commitPage.mock.calls.map(([input]) => input.expectedWorkUnitRowVersion))
      .toEqual([2, 3])
    expect(mocks.finalize).toHaveBeenCalledOnce()
    expect(mocks.release).not.toHaveBeenCalled()
  })

  it('continues a yielded page with the post-commit row version', async () => {
    setupClaimableCycle()
    mockCommittedCheckpointSequence(['yielded'])
    mocks.continueYielded.mockResolvedValue(continuationResult())

    await expect(runMexcCaptureCycle()).resolves.toEqual({
      status: 'captured', workUnitId: WORK_UNIT_ID, pagesCommitted: 1,
      scopeFinalized: false, failureCode: null, authorityBlocked: true,
    })
    expect(mocks.continueYielded).toHaveBeenCalledWith(expect.objectContaining({
      predecessorWorkUnitId: WORK_UNIT_ID,
      expectedPredecessorRowVersion: 2,
    }))
    expect(mocks.release).not.toHaveBeenCalled()
  })

  it('reports immediate yielded scope exhaustion with restart-equivalent failure semantics', async () => {
    setupClaimableCycle()
    mockCommittedCheckpointSequence(['yielded'])
    mocks.continueYielded.mockResolvedValue(continuationResult({
      status: 'scope_exhausted', successorWorkUnitId: null,
      continuationGeneration: 19,
    }))

    await expect(runMexcCaptureCycle()).resolves.toEqual({
      status: 'failed', workUnitId: WORK_UNIT_ID, pagesCommitted: 1,
      scopeFinalized: false, failureCode: 'SCOPE_BUDGET_EXHAUSTED',
      authorityBlocked: true,
    })
    expect(mocks.continueYielded).toHaveBeenCalledWith(expect.objectContaining({
      predecessorWorkUnitId: WORK_UNIT_ID,
      expectedPredecessorRowVersion: 2,
    }))
    expect(mocks.release).not.toHaveBeenCalled()
  })

  it('releases cooperatively after exactly three continuing pages', async () => {
    setupClaimableCycle()
    mockCommittedCheckpointSequence(['continue', 'continue', 'continue'])
    mocks.release.mockResolvedValue({ status: 'released', authorityBlocked: true })

    await expect(runMexcCaptureCycle()).resolves.toEqual({
      status: 'released', workUnitId: WORK_UNIT_ID, pagesCommitted: 3,
      scopeFinalized: false, failureCode: null, authorityBlocked: true,
    })
    expect(mocks.commitPage).toHaveBeenCalledTimes(3)
    expect(mocks.release).toHaveBeenCalledOnce()
    expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({
      workUnitId: WORK_UNIT_ID,
      expectedWorkUnitRowVersion: 4,
      releaseReason: 'worker_budget_yield',
    }))
  })

  it('releases authority after a committed page returns an unknown checkpoint state', async () => {
    setupClaimableCycle()
    const invalidCheckpoint = {
      ...checkpoint('continue'),
      status: 'future_unknown_state',
      reason: 'CHECKPOINT_STATE_INVALID',
    }
    mocks.applyPage.mockReturnValue({
      status: 'page_committed',
      rawLedgerTransition: { state: { generation: 1 } },
      pageTransition: { checkpoint: invalidCheckpoint },
    })
    mocks.commitPage.mockResolvedValue({ workUnitRowVersion: 2, ledgerGeneration: 1 })
    mocks.release.mockResolvedValue({ status: 'released', authorityBlocked: true })

    await expect(runMexcCaptureCycle()).resolves.toEqual({
      status: 'failed', workUnitId: WORK_UNIT_ID, pagesCommitted: 1,
      scopeFinalized: false, failureCode: 'CHECKPOINT_STATE_INVALID',
      authorityBlocked: true,
    })
    expect(mocks.release).toHaveBeenCalledOnce()
    expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({
      expectedWorkUnitRowVersion: 2,
      releaseReason: 'authority_invalidated',
    }))
  })

  it('releases an active lease when an unexpected runtime error escapes', async () => {
    setupClaimableCycle()
    const runtimeError = new Error('synthetic runtime failure')
    mocks.execute.mockRejectedValue(runtimeError)
    mocks.release.mockResolvedValue({ status: 'released', authorityBlocked: true })

    await expect(runMexcCaptureCycle()).rejects.toBe(runtimeError)
    expect(mocks.release).toHaveBeenCalledOnce()
    expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({
      expectedWorkUnitRowVersion: 1,
      releaseReason: 'authority_invalidated',
    }))
    expect(mocks.commitPage).not.toHaveBeenCalled()
  })

  it('preserves the original runtime error when defensive lease release also fails', async () => {
    setupClaimableCycle()
    const runtimeError = new Error('original runtime failure')
    mocks.execute.mockRejectedValue(runtimeError)
    mocks.release.mockRejectedValue(new Error('synthetic release failure'))

    await expect(runMexcCaptureCycle()).rejects.toBe(runtimeError)
    expect(mocks.release).toHaveBeenCalledOnce()
    expect(mocks.commitPage).not.toHaveBeenCalled()
  })
})

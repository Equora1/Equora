import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  BROKER_CAPTURE_SCHEDULER_DATABASE_ERROR_CODES,
  BROKER_CAPTURE_CONTINUE_YIELDED_RPC,
  BROKER_CAPTURE_LEASE_POLICY_VERSION,
  BROKER_CAPTURE_MATERIALIZE_RPC,
  BROKER_CAPTURE_RECOVER_EXPIRED_RPC,
  BROKER_CAPTURE_RELEASE_LEASE_RPC,
  BROKER_CAPTURE_RENEW_LEASE_RPC,
  BROKER_CAPTURE_SCHEDULE_CONTRACT_VERSION,
  BrokerCaptureSchedulerError,
  continueYieldedBrokerCaptureWorkUnitWithClient,
  materializeNextDueBrokerCaptureWithClient,
  recoverExpiredBrokerCaptureLeasesWithClient,
  releaseBrokerCaptureLeaseWithClient,
  renewBrokerCaptureLeaseWithClient,
} from '../lib/server/broker-capture-scheduler'

const REQUEST_ID = '81000000-0000-4000-8000-000000000001'
const WORK_UNIT_ID = '870d4b00-c275-48f1-aa02-9712c6ce1190'
const SUCCESSOR_ID = '870d4b00-c275-48f1-aa02-9712c6ce1191'
const LEASE_TOKEN = '91000000-0000-4000-8000-000000000001'
const OCCURRENCE_ID = '82000000-0000-4000-8000-000000000001'
const RUN_ID = '83000000-0000-4000-8000-000000000001'
const SCOPE_ID = '84000000-0000-4000-8000-000000000001'
const LANE_ID = '85000000-0000-4000-8000-000000000001'
const DIGEST = 'a'.repeat(64)

function client(data: unknown, error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) }
}

describe('inaktive brokerneutrale Scheduler-Control-Plane', () => {
  it('materialisiert ausschließlich über den geschlossenen service RPC', async () => {
    const rpcClient = client({
      status: 'scheduled', requestId: REQUEST_ID, occurrenceId: OCCURRENCE_ID,
      runId: RUN_ID, scopeId: SCOPE_ID, workUnitId: WORK_UNIT_ID,
      laneStateId: LANE_ID, dueGeneration: 1,
      scheduledDueAt: '2026-08-07T10:00:00.000Z', bucketCount: 7,
      bucketSetDigest: DIGEST, authorityBlocked: true,
    })
    const result = await materializeNextDueBrokerCaptureWithClient(rpcClient as never, { requestId: REQUEST_ID })
    expect(result.status).toBe('scheduled')
    expect(result.bucketCount).toBe(7)
    expect(rpcClient.rpc).toHaveBeenCalledWith(BROKER_CAPTURE_MATERIALIZE_RPC, {
      p_request_id: REQUEST_ID,
      p_schedule_contract_version: BROKER_CAPTURE_SCHEDULE_CONTRACT_VERSION,
    })
  })

  it('akzeptiert einen vollständig leeren no_due-Vertrag', async () => {
    const rpcClient = client({
      status: 'no_due', requestId: REQUEST_ID, occurrenceId: null, runId: null,
      scopeId: null, workUnitId: null, laneStateId: null, dueGeneration: null,
      scheduledDueAt: null, bucketCount: 0, bucketSetDigest: null,
      authorityBlocked: true,
    })
    await expect(materializeNextDueBrokerCaptureWithClient(rpcClient as never, { requestId: REQUEST_ID }))
      .resolves.toMatchObject({ status: 'no_due', bucketCount: 0 })
  })

  it('rejects no_due with residual identity and scheduled with empty authority fields', async () => {
    const noDueWithOccurrence = client({
      status: 'no_due', requestId: REQUEST_ID, occurrenceId: OCCURRENCE_ID,
      runId: null, scopeId: null, workUnitId: null, laneStateId: null,
      dueGeneration: null, scheduledDueAt: null, bucketCount: 0,
      bucketSetDigest: null, authorityBlocked: true,
    })
    await expect(materializeNextDueBrokerCaptureWithClient(
      noDueWithOccurrence as never, { requestId: REQUEST_ID },
    )).rejects.toMatchObject({ code: 'database_result_invalid' })

    const scheduledWithoutIdentity = client({
      status: 'scheduled', requestId: REQUEST_ID, occurrenceId: null,
      runId: RUN_ID, scopeId: SCOPE_ID, workUnitId: WORK_UNIT_ID,
      laneStateId: LANE_ID, dueGeneration: 1,
      scheduledDueAt: '2026-08-07T10:00:00.000Z', bucketCount: 7,
      bucketSetDigest: DIGEST, authorityBlocked: true,
    })
    await expect(materializeNextDueBrokerCaptureWithClient(
      scheduledWithoutIdentity as never, { requestId: REQUEST_ID },
    )).rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it('verwirft unvollständige Bucketgruppen und geheimes Ergebnis-Material', async () => {
    const incomplete = client({
      status: 'scheduled', requestId: REQUEST_ID, occurrenceId: OCCURRENCE_ID,
      runId: RUN_ID, scopeId: SCOPE_ID, workUnitId: WORK_UNIT_ID,
      laneStateId: LANE_ID, dueGeneration: 1,
      scheduledDueAt: '2026-08-07T10:00:00.000Z', bucketCount: 7,
      bucketSetDigest: null, authorityBlocked: true,
    })
    await expect(materializeNextDueBrokerCaptureWithClient(incomplete as never, { requestId: REQUEST_ID }))
      .rejects.toMatchObject({ code: 'database_result_invalid' })

    const secret = client({
      status: 'no_due', requestId: REQUEST_ID, occurrenceId: null, runId: null,
      scopeId: null, workUnitId: null, laneStateId: null, dueGeneration: null,
      scheduledDueAt: null, bucketCount: 0, bucketSetDigest: null,
      authorityBlocked: true, leaseToken: LEASE_TOKEN,
    })
    await expect(materializeNextDueBrokerCaptureWithClient(secret as never, { requestId: REQUEST_ID }))
      .rejects.toBeInstanceOf(BrokerCaptureSchedulerError)
  })

  it('erneuert ein Lease mit CAS und versionierter Policy', async () => {
    const rpcClient = client({
      status: 'renewed', requestId: REQUEST_ID, workUnitId: WORK_UNIT_ID,
      workUnitRowVersion: 5, leaseEpoch: 2,
      leaseExpiresAt: '2026-08-07T10:00:45.000Z', recoveryState: 'none',
      authorityBlocked: true,
    })
    await expect(renewBrokerCaptureLeaseWithClient(rpcClient as never, {
      workUnitId: WORK_UNIT_ID, expectedWorkUnitRowVersion: 4,
      leaseToken: LEASE_TOKEN, requestId: REQUEST_ID,
    })).resolves.toMatchObject({ status: 'renewed', workUnitRowVersion: 5, leaseEpoch: 2 })
    expect(rpcClient.rpc).toHaveBeenCalledWith(BROKER_CAPTURE_RENEW_LEASE_RPC, expect.objectContaining({
      p_lease_policy_version: BROKER_CAPTURE_LEASE_POLICY_VERSION,
    }))
  })

  it('modelliert Release mit Permit ohne Outcome als uncertain_egress', async () => {
    const rpcClient = client({
      status: 'recovery_pending', requestId: REQUEST_ID, workUnitId: WORK_UNIT_ID,
      workUnitRowVersion: 5, leaseEpoch: 2, leaseExpiresAt: null,
      recoveryState: 'uncertain_egress', authorityBlocked: true,
    })
    const result = await releaseBrokerCaptureLeaseWithClient(rpcClient as never, {
      workUnitId: WORK_UNIT_ID, expectedWorkUnitRowVersion: 4,
      leaseToken: LEASE_TOKEN, requestId: REQUEST_ID,
      releaseReason: 'cooperative_shutdown',
    })
    expect(result).toMatchObject({ status: 'recovery_pending', recoveryState: 'uncertain_egress' })
    expect(rpcClient.rpc).toHaveBeenCalledWith(BROKER_CAPTURE_RELEASE_LEASE_RPC, expect.objectContaining({
      p_release_reason: 'cooperative_shutdown',
    }))
  })

  it('rejects every mixed Lease status group', async () => {
    const input = {
      workUnitId: WORK_UNIT_ID, expectedWorkUnitRowVersion: 4,
      leaseToken: LEASE_TOKEN, requestId: REQUEST_ID,
    } as const
    const renewedWithoutExpiry = client({
      status: 'renewed', requestId: REQUEST_ID, workUnitId: WORK_UNIT_ID,
      workUnitRowVersion: 5, leaseEpoch: 2, leaseExpiresAt: null,
      recoveryState: 'none', authorityBlocked: true,
    })
    await expect(renewBrokerCaptureLeaseWithClient(
      renewedWithoutExpiry as never, input,
    )).rejects.toMatchObject({ code: 'database_result_invalid' })

    for (const result of [
      {
        status: 'released', leaseExpiresAt: null,
        recoveryState: 'uncertain_egress',
      },
      {
        status: 'recovery_pending', leaseExpiresAt: null,
        recoveryState: 'none',
      },
      {
        status: 'released', leaseExpiresAt: '2026-08-07T10:00:45.000Z',
        recoveryState: 'none',
      },
    ] as const) {
      await expect(releaseBrokerCaptureLeaseWithClient(client({
        ...result, requestId: REQUEST_ID, workUnitId: WORK_UNIT_ID,
        workUnitRowVersion: 5, leaseEpoch: 2, authorityBlocked: true,
      }) as never, {
        ...input, releaseReason: 'cooperative_shutdown',
      })).rejects.toMatchObject({ code: 'database_result_invalid' })
    }
  })

  it('lehnt unbekannte Releasegründe vor jedem RPC ab', async () => {
    const rpcClient = client(null)
    await expect(releaseBrokerCaptureLeaseWithClient(rpcClient as never, {
      workUnitId: WORK_UNIT_ID, expectedWorkUnitRowVersion: 4,
      leaseToken: LEASE_TOKEN, requestId: REQUEST_ID,
      releaseReason: 'force_retry' as never,
    })).rejects.toMatchObject({ code: 'invalid_input' })
    expect(rpcClient.rpc).not.toHaveBeenCalled()
  })

  it('erzeugt einen Yield-Successor nur über den idempotenten Continuation-RPC', async () => {
    const rpcClient = client({
      status: 'continued', requestId: REQUEST_ID,
      predecessorWorkUnitId: WORK_UNIT_ID, successorWorkUnitId: SUCCESSOR_ID,
      runId: RUN_ID, scopeId: SCOPE_ID, continuationGeneration: 2,
      crossRequestReplay: false,
      authorityBlocked: true,
    })
    await expect(continueYieldedBrokerCaptureWorkUnitWithClient(rpcClient as never, {
      predecessorWorkUnitId: WORK_UNIT_ID,
      expectedPredecessorRowVersion: 5,
      requestId: REQUEST_ID,
    })).resolves.toMatchObject({ status: 'continued', successorWorkUnitId: SUCCESSOR_ID })
    expect(rpcClient.rpc).toHaveBeenCalledWith(BROKER_CAPTURE_CONTINUE_YIELDED_RPC, expect.any(Object))
  })

  it('rejects inconsistent Continuation successor groups in both directions', async () => {
    const input = {
      predecessorWorkUnitId: WORK_UNIT_ID,
      expectedPredecessorRowVersion: 5,
      requestId: REQUEST_ID,
    } as const
    for (const result of [
      { status: 'continued', successorWorkUnitId: null },
      { status: 'scope_exhausted', successorWorkUnitId: SUCCESSOR_ID },
    ] as const) {
      await expect(continueYieldedBrokerCaptureWorkUnitWithClient(client({
        ...result, requestId: REQUEST_ID,
        predecessorWorkUnitId: WORK_UNIT_ID, runId: RUN_ID, scopeId: SCOPE_ID,
        continuationGeneration: 2, crossRequestReplay: false,
        authorityBlocked: true,
      }) as never, input)).rejects.toMatchObject({ code: 'database_result_invalid' })
    }
  })

  it('accepts canonical generation nineteen and rejects impossible generation twenty', async () => {
    const input = {
      predecessorWorkUnitId: WORK_UNIT_ID,
      expectedPredecessorRowVersion: 19,
      requestId: REQUEST_ID,
    } as const
    const result = {
      status: 'continued', requestId: REQUEST_ID,
      predecessorWorkUnitId: WORK_UNIT_ID, successorWorkUnitId: SUCCESSOR_ID,
      runId: RUN_ID, scopeId: SCOPE_ID, continuationGeneration: 19,
      crossRequestReplay: false,
      authorityBlocked: true,
    } as const
    await expect(continueYieldedBrokerCaptureWorkUnitWithClient(
      client(result) as never,
      input,
    )).resolves.toMatchObject({ continuationGeneration: 19 })
    await expect(continueYieldedBrokerCaptureWorkUnitWithClient(
      client({ ...result, continuationGeneration: 20 }) as never,
      input,
    )).rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it('accepts the explicit cross-request replay shape and rejects a missing replay discriminator', async () => {
    const input = {
      predecessorWorkUnitId: WORK_UNIT_ID,
      expectedPredecessorRowVersion: 5,
      requestId: REQUEST_ID,
    } as const
    const result = {
      status: 'continued', requestId: REQUEST_ID,
      predecessorWorkUnitId: WORK_UNIT_ID, successorWorkUnitId: SUCCESSOR_ID,
      runId: RUN_ID, scopeId: SCOPE_ID, continuationGeneration: 2,
      crossRequestReplay: true, authorityBlocked: true,
    } as const
    await expect(continueYieldedBrokerCaptureWorkUnitWithClient(
      client(result) as never,
      input,
    )).resolves.toMatchObject({ crossRequestReplay: true })
    const { crossRequestReplay: _omitted, ...missingDiscriminator } = result
    await expect(continueYieldedBrokerCaptureWorkUnitWithClient(
      client(missingDiscriminator) as never,
      input,
    )).rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it('validiert bounded Restart-Recovery und geschlossene Countsumme', async () => {
    const rpcClient = client({
      status: 'recovered', requestId: REQUEST_ID, inspectedCount: 3,
      requeuedCount: 1, uncertainEgressCount: 1, outcomeDerivedCount: 1,
      authorityBlocked: true,
    })
    await expect(recoverExpiredBrokerCaptureLeasesWithClient(rpcClient as never, {
      requestId: REQUEST_ID, batchLimit: 10,
    })).resolves.toMatchObject({ status: 'recovered', inspectedCount: 3 })
    expect(rpcClient.rpc).toHaveBeenCalledWith(BROKER_CAPTURE_RECOVER_EXPIRED_RPC, {
      p_request_id: REQUEST_ID,
      p_batch_limit: 10,
      p_lease_policy_version: BROKER_CAPTURE_LEASE_POLICY_VERSION,
    })

    await expect(recoverExpiredBrokerCaptureLeasesWithClient(client(null) as never, {
      requestId: REQUEST_ID, batchLimit: 26,
    })).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('rejects inconsistent Recovery status and count groups', async () => {
    const input = { requestId: REQUEST_ID, batchLimit: 10 } as const
    for (const result of [
      {
        status: 'recovered', inspectedCount: 0, requeuedCount: 0,
        uncertainEgressCount: 0, outcomeDerivedCount: 0,
      },
      {
        status: 'no_expired', inspectedCount: 1, requeuedCount: 1,
        uncertainEgressCount: 0, outcomeDerivedCount: 0,
      },
      {
        status: 'recovered', inspectedCount: 3, requeuedCount: 1,
        uncertainEgressCount: 1, outcomeDerivedCount: 0,
      },
      {
        status: 'recovered', inspectedCount: 2, requeuedCount: 1,
        uncertainEgressCount: 1, outcomeDerivedCount: 1,
      },
    ] as const) {
      await expect(recoverExpiredBrokerCaptureLeasesWithClient(client({
        ...result, requestId: REQUEST_ID, authorityBlocked: true,
      }) as never, input)).rejects.toMatchObject({ code: 'database_result_invalid' })
    }
  })

  it('maps only the closed Scheduler SQL-code set and never reflects DB details', async () => {
    for (const code of BROKER_CAPTURE_SCHEDULER_DATABASE_ERROR_CODES) {
      const secretDetail = 'provider-internal secret detail'
      await expect(materializeNextDueBrokerCaptureWithClient(
        client(null, { message: `${code}: ${secretDetail}`, details: secretDetail }) as never,
        { requestId: REQUEST_ID },
      )).rejects.toMatchObject({
        code,
        message: 'Die Broker-Capture-Schedulertransaktion wurde von der Datenbank abgelehnt.',
      })
    }

    for (const error of [
      { message: 'SCHEDULER_FUTURE_CODE: provider-internal secret detail' },
      { message: 'raw database provider-internal secret detail' },
      { message: 42 },
      { details: 'provider-internal secret detail' },
      'provider-internal secret detail',
    ]) {
      await expect(materializeNextDueBrokerCaptureWithClient(
        client(null, error) as never, { requestId: REQUEST_ID },
      )).rejects.toMatchObject({
        code: 'database_error',
        message: 'Die Broker-Capture-Schedulertransaktion ist fehlgeschlagen.',
      })
    }
  })
})

import 'server-only'

import { randomUUID } from 'node:crypto'
import {
  claimBrokerCaptureWorkUnit,
  authorizeBrokerCaptureRequest,
  recordBrokerCaptureFailure,
  type BrokerCaptureClaimResult,
} from '@/lib/server/broker-capture-control'
import {
  continueYieldedBrokerCaptureWorkUnit,
  materializeNextDueBrokerCapture,
  recoverExpiredBrokerCaptureLeases,
  releaseBrokerCaptureLease,
  renewBrokerCaptureLease,
} from '@/lib/server/broker-capture-scheduler'
import {
  finalizeBrokerCaptureScope,
  findClaimableBrokerCaptureWorkUnit,
  findPendingBrokerCaptureScopeFinalization,
  findPendingYieldedBrokerCaptureWorkUnit,
  loadBrokerCaptureMaterial,
} from '@/lib/server/broker-runtime-control'
import { resumeBrokerRawLedgerState } from '@/lib/server/broker-raw-ledger'
import { applyMexcClaimedPage } from '@/lib/server/mexc-capture-orchestrator'
import { commitBrokerCapturePage } from '@/lib/server/broker-capture-persistence'
import { decryptBrokerCredentials } from '@/lib/server/broker-secret-store'
import {
  executeMexcPrivateReadWorkUnit,
  MexcTransportError,
  type MexcPrivateReadWorkUnit,
  type MexcTransportCaptureBinding,
} from '@/lib/server/mexc-transport'
import type { MexcPageCheckpoint } from '@/lib/server/mexc-pagination'
import {
  isMexcAutomaticCaptureActivated,
  isMexcCaptureEnvironmentReady,
} from '@/lib/server/mexc-runtime'

const MAX_PAGES_PER_INVOCATION = 3
const INVOCATION_BUDGET_MS = 240_000
const EGRESS_COMPLETION_RESERVE_MS = 30_000
const RELEASE_MARGIN_MS = 20_000
const RENEW_MARGIN_MS = 15_000

export type MexcCaptureCycleResult = Readonly<{
  status: 'disabled' | 'idle' | 'captured' | 'failed' | 'released'
  workUnitId: string | null
  pagesCommitted: number
  scopeFinalized: boolean
  failureCode: string | null
  authorityBlocked: true
}>

function captureBinding(
  claim: BrokerCaptureClaimResult,
  requestResultId: string,
  requestSequence: number,
): MexcTransportCaptureBinding {
  return Object.freeze({
    bindingVersion: 'mexc-transport-capture-binding-v1',
    accountIdentity: Object.freeze({
      digestAlgorithm: 'hmac-sha256',
      digestContractVersion: 'equora-tcj-v1',
      purpose: 'broker_account_identity_v1',
      keyVersion: claim.accountIdentityKeyVersion,
      digest: claim.accountIdentityDigest,
      verificationStatus: 'unverified_reference',
    }),
    brokerAccountId: claim.brokerAccountId,
    connectionAccountId: claim.connectionAccountId,
    syncActivationId: claim.syncActivationId,
    activationGeneration: claim.activationGeneration,
    scopeDigest: Object.freeze({
      digestAlgorithm: 'sha256',
      digestContractVersion: 'equora-tcj-v1',
      domain: 'sync_scope',
      digest: claim.scopeDigest,
    }),
    workUnitReference: Object.freeze({
      referenceType: 'capture_work_unit_id_v1',
      value: claim.workUnitId,
    }),
    runReference: Object.freeze({
      referenceType: 'sync_run_id_v1',
      value: claim.runId,
    }),
    requestResultReference: Object.freeze({
      referenceType: 'provider_request_result_id_v1',
      value: requestResultId,
    }),
    requestSequence,
  })
}

function workUnitRequest(
  claim: BrokerCaptureClaimResult,
  checkpoint: MexcPageCheckpoint,
  binding: MexcTransportCaptureBinding,
): MexcPrivateReadWorkUnit {
  const query = {
    symbol: checkpoint.scope.symbol,
    start_time: checkpoint.scope.startTime,
    end_time: checkpoint.scope.endTime,
    page_num: checkpoint.nextPageNumber,
    page_size: checkpoint.scope.pageSize,
    ...('positionType' in checkpoint.scope
      ? { position_type: checkpoint.scope.positionType }
      : {}),
  }
  return Object.freeze({ capabilityId: claim.capabilityId, query: Object.freeze(query), captureBinding: binding })
}

async function releaseCurrentLease(
  claim: BrokerCaptureClaimResult,
  rowVersion: number,
  leaseToken: string,
  releaseReason: 'cooperative_shutdown' | 'worker_budget_yield' | 'authority_invalidated',
) {
  return releaseBrokerCaptureLease({
    workUnitId: claim.workUnitId,
    expectedWorkUnitRowVersion: rowVersion,
    leaseToken,
    requestId: randomUUID(),
    releaseReason,
  })
}

export async function runMexcCaptureCycle(): Promise<MexcCaptureCycleResult> {
  if (!isMexcAutomaticCaptureActivated()) {
    return Object.freeze({
      status: 'disabled', workUnitId: null, pagesCommitted: 0,
      scopeFinalized: false, failureCode: null, authorityBlocked: true,
    })
  }
  if (!isMexcCaptureEnvironmentReady()) {
    throw new Error('MEXC_CAPTURE_RUNTIME_CONFIGURATION_INVALID')
  }

  const invocationStartedAt = Date.now()
  const invocationDeadlineAtMs = invocationStartedAt + INVOCATION_BUDGET_MS
  const brokerEgressDeadlineAtMs = invocationDeadlineAtMs - EGRESS_COMPLETION_RESERVE_MS
  await recoverExpiredBrokerCaptureLeases({ requestId: randomUUID(), batchLimit: 10 })
  const pendingYield = await findPendingYieldedBrokerCaptureWorkUnit()
  let recoveredYieldCandidate: Readonly<{
    status: 'claimable'
    workUnitId: string
    workUnitRowVersion: number
    authorityBlocked: true
  }> | null = null
  if (pendingYield.status === 'pending') {
    const continuation = await continueYieldedBrokerCaptureWorkUnit({
      predecessorWorkUnitId: pendingYield.workUnitId!,
      expectedPredecessorRowVersion: pendingYield.workUnitRowVersion!,
      requestId: randomUUID(),
    })
    if (continuation.status === 'scope_exhausted') {
      return Object.freeze({
        status: 'failed', workUnitId: pendingYield.workUnitId, pagesCommitted: 0,
        scopeFinalized: false, failureCode: 'SCOPE_BUDGET_EXHAUSTED',
        authorityBlocked: true,
      })
    }
    const rediscoveredSuccessor = await findClaimableBrokerCaptureWorkUnit()
    if (rediscoveredSuccessor.status === 'no_claimable') {
      return Object.freeze({
        status: 'idle', workUnitId: null, pagesCommitted: 0,
        scopeFinalized: false, failureCode: null, authorityBlocked: true,
      })
    }
    recoveredYieldCandidate = Object.freeze({
      status: 'claimable',
      workUnitId: rediscoveredSuccessor.workUnitId!,
      workUnitRowVersion: rediscoveredSuccessor.workUnitRowVersion!,
      authorityBlocked: true,
    })
  }
  const pendingFinalization = await findPendingBrokerCaptureScopeFinalization()
  if (pendingFinalization.status === 'pending') {
    await finalizeBrokerCaptureScope({
      requestAuthorizationId: pendingFinalization.requestAuthorizationId!,
      requestId: randomUUID(),
    })
    return Object.freeze({
      status: 'captured', workUnitId: null, pagesCommitted: 0,
      scopeFinalized: true, failureCode: null, authorityBlocked: true,
    })
  }
  let candidate = recoveredYieldCandidate ?? await findClaimableBrokerCaptureWorkUnit()
  if (candidate.status === 'no_claimable') {
    const materialized = await materializeNextDueBrokerCapture({ requestId: randomUUID() })
    if (materialized.status === 'scheduled') {
      // The scheduler result is never Claim authority. Re-enter through the
      // enrollment-filtered runtime finder so a disabled or mismatched
      // enrollment cannot progress from materialization to Claim.
      candidate = await findClaimableBrokerCaptureWorkUnit()
      if (candidate.status === 'no_claimable') {
        return Object.freeze({
          status: 'idle', workUnitId: null, pagesCommitted: 0,
          scopeFinalized: false, failureCode: null, authorityBlocked: true,
        })
      }
    } else {
      return Object.freeze({
        status: 'idle', workUnitId: null, pagesCommitted: 0,
        scopeFinalized: false, failureCode: null, authorityBlocked: true,
      })
    }
  }

  const leaseToken = randomUUID()
  const claim = await claimBrokerCaptureWorkUnit({
    workUnitId: candidate.workUnitId!,
    expectedWorkUnitRowVersion: candidate.workUnitRowVersion!,
    claimRequestId: randomUUID(),
    leaseToken,
  })
  let currentRowVersion = claim.workUnitRowVersion
  let currentCheckpoint = claim.checkpoint
  let expectedLedgerGeneration = claim.expectedLedgerGeneration
  let leaseExpiresAtMs = Date.parse(claim.leaseExpiresAt)
  let ledgerState = resumeBrokerRawLedgerState('mexc', {
    digestAlgorithm: 'hmac-sha256',
    digestContractVersion: 'equora-tcj-v1',
    purpose: 'broker_account_identity_v1',
    keyVersion: claim.accountIdentityKeyVersion,
    digest: claim.accountIdentityDigest,
    verificationStatus: 'unverified_reference',
  }, expectedLedgerGeneration)
  let pagesCommitted = 0

  try {
    for (let pageIndex = 0; pageIndex < MAX_PAGES_PER_INVOCATION; pageIndex += 1) {
      if (Date.now() + RELEASE_MARGIN_MS >= invocationDeadlineAtMs) {
        await releaseCurrentLease(claim, currentRowVersion, leaseToken, 'worker_budget_yield')
        return Object.freeze({
          status: 'released', workUnitId: claim.workUnitId, pagesCommitted,
          scopeFinalized: false, failureCode: null, authorityBlocked: true,
        })
      }
      if (leaseExpiresAtMs <= Date.now() + RENEW_MARGIN_MS) {
        const renewed = await renewBrokerCaptureLease({
          workUnitId: claim.workUnitId,
          expectedWorkUnitRowVersion: currentRowVersion,
          leaseToken,
          requestId: randomUUID(),
        })
        currentRowVersion = renewed.workUnitRowVersion
        leaseExpiresAtMs = Date.parse(renewed.leaseExpiresAt!)
      }

      const requestAuthorizationId = randomUUID()
      const requestResultId = randomUUID()
      const requestSequence = currentCheckpoint.totalRequestAttempts + 1
      const binding = captureBinding(claim, requestResultId, requestSequence)
      let authorization: Awaited<ReturnType<typeof authorizeBrokerCaptureRequest>> | null = null
      let integrityKey: Uint8Array | null = null
      let integrityKeyVersion: string | null = null
      const requestStartedAt = new Date().toISOString()
      const requestStartedAtMs = Date.now()

      try {
        const transportResult = await executeMexcPrivateReadWorkUnit([
          workUnitRequest(claim, currentCheckpoint, binding),
        ], async (credentialReference) => {
          if (!authorization) throw new MexcTransportError('transport_contract_violation', 'Credentialload ohne Request-Authorization.')
          const material = await loadBrokerCaptureMaterial(authorization.requestAuthorizationId)
          if (
            credentialReference?.id !== material.credentialReference.id
            || credentialReference.keyVersion !== material.credentialReference.keyVersion
            || Date.parse(material.sendDeadlineAt) <= Date.now()
          ) throw new MexcTransportError('transport_contract_violation', 'Credentialmaterial verletzt die Permit-Bindung.')
          const credentials = decryptBrokerCredentials(
            material.encryptedPayload,
            material.userId,
            material.providerCode,
            material.credentialReference.keyVersion,
          )
          const key = Buffer.from(material.integrityKeyBase64, 'base64')
          if (key.byteLength < 32 || key.byteLength > 64) {
            key.fill(0)
            throw new MexcTransportError('transport_contract_violation', 'Integrity-Key-Material verletzt den Vertrag.')
          }
          integrityKey = key
          integrityKeyVersion = material.integrityKeyReference.keyVersion
          return Object.freeze({
            credentials,
            accountIdentity: binding.accountIdentity,
            brokerAccountId: material.brokerAccountId,
            connectionAccountId: material.connectionAccountId,
            syncActivationId: material.syncActivationId,
            activationGeneration: material.activationGeneration,
          })
        }, async (context) => {
          authorization = await authorizeBrokerCaptureRequest({
            workUnitId: claim.workUnitId,
            expectedWorkUnitRowVersion: currentRowVersion,
            requestSequence,
            expectedCheckpointMac: currentCheckpoint.checkpointMac,
            leaseToken,
            requestAuthorizationId,
          })
          if (
            context.capabilityId !== authorization.capabilityId
            || context.scopeDigest !== authorization.scopeDigest
            || context.workUnitId !== authorization.workUnitId
            || context.requestSequence !== authorization.requestSequence
          ) throw new MexcTransportError('transport_contract_violation', 'Request-Authorization widerspricht dem Transportkontext.')
          return Object.freeze({
            status: authorization.status,
            requestAuthorizationId: authorization.requestAuthorizationId,
            sendDeadlineAt: authorization.sendDeadlineAt,
            workUnitId: authorization.workUnitId,
            requestSequence: authorization.requestSequence,
            capabilityId: authorization.capabilityId,
            scopeDigest: authorization.scopeDigest,
            credentialReference: authorization.credentialReference,
            authorityBlocked: true,
          })
        }, { absoluteDeadlineAtMs: brokerEgressDeadlineAtMs })

        const completedAuthorization = authorization as Awaited<ReturnType<typeof authorizeBrokerCaptureRequest>> | null
        const completedIntegrityKey = integrityKey as Uint8Array | null
        const completedIntegrityKeyVersion = integrityKeyVersion as string | null
        const outcome = transportResult.outcomes[0]!
        if (outcome.status === 'failed') throw outcome.error
        if (!completedAuthorization || !completedIntegrityKey || !completedIntegrityKeyVersion) {
          throw new MexcTransportError('transport_contract_violation', 'Erfolgreicher Wire-Read besitzt kein gebundenes Laufzeitmaterial.')
        }
        const capturedPage = applyMexcClaimedPage({
          claim,
          checkpoint: currentCheckpoint,
          checkpointIntegrityKey: completedIntegrityKey,
          ledgerState,
          expectedLedgerGeneration,
          wireResponse: outcome.response,
          requestResultReference: Object.freeze({
            referenceType: 'provider_request_result_id_v1', value: requestResultId,
          }),
          requestSequence,
        })
        if (capturedPage.status !== 'page_committed' || !capturedPage.rawLedgerTransition) {
          throw new MexcTransportError('malformed_response', 'MEXC-Page konnte nicht als atomare Ledgertransition abgeschlossen werden.')
        }
        const committed = await commitBrokerCapturePage({
          requestAuthorizationId: completedAuthorization.requestAuthorizationId,
          leaseToken,
          integrityKey: completedIntegrityKey,
          integrityKeyVersion: completedIntegrityKeyVersion,
          expectedWorkUnitRowVersion: currentRowVersion,
          wireResponse: outcome.response,
          capturedPage,
        })
        pagesCommitted += 1
        currentRowVersion = committed.workUnitRowVersion
        expectedLedgerGeneration = committed.ledgerGeneration
        currentCheckpoint = capturedPage.pageTransition.checkpoint
        ledgerState = capturedPage.rawLedgerTransition.state
        completedIntegrityKey.fill(0)
        integrityKey = null

        if (currentCheckpoint.status === 'terminal_observed') {
          await finalizeBrokerCaptureScope({
            requestAuthorizationId: completedAuthorization.requestAuthorizationId,
            requestId: randomUUID(),
          })
          return Object.freeze({
            status: 'captured', workUnitId: claim.workUnitId, pagesCommitted,
            scopeFinalized: true, failureCode: null, authorityBlocked: true,
          })
        }
        if (currentCheckpoint.status === 'yielded') {
          const continuation = await continueYieldedBrokerCaptureWorkUnit({
            predecessorWorkUnitId: claim.workUnitId,
            expectedPredecessorRowVersion: currentRowVersion,
            requestId: randomUUID(),
          })
          if (continuation.status === 'scope_exhausted') {
            return Object.freeze({
              status: 'failed', workUnitId: claim.workUnitId, pagesCommitted,
              scopeFinalized: false, failureCode: 'SCOPE_BUDGET_EXHAUSTED',
              authorityBlocked: true,
            })
          }
          return Object.freeze({
            status: 'captured', workUnitId: claim.workUnitId, pagesCommitted,
            scopeFinalized: false, failureCode: null, authorityBlocked: true,
          })
        }
        if (currentCheckpoint.status !== 'continue') {
          // This branch is defensive: the page state machine should only emit
          // continue, yielded or terminal_observed. If a future/invalid state
          // crosses that boundary after a committed page, relinquish authority
          // explicitly instead of returning with a live lease.
          await releaseCurrentLease(
            claim, currentRowVersion, leaseToken, 'authority_invalidated',
          )
          return Object.freeze({
            status: 'failed', workUnitId: claim.workUnitId, pagesCommitted,
            scopeFinalized: false, failureCode: currentCheckpoint.reason,
            authorityBlocked: true,
          })
        }
      } catch (error) {
        const failedIntegrityKey = integrityKey as Uint8Array | null
        const failedAuthorization = authorization as Awaited<ReturnType<typeof authorizeBrokerCaptureRequest>> | null
        failedIntegrityKey?.fill(0)
        if (error instanceof MexcTransportError && failedAuthorization) {
          const failure = await recordBrokerCaptureFailure({
            requestAuthorizationId: failedAuthorization.requestAuthorizationId,
            requestStartedAt,
            workUnitId: claim.workUnitId,
            expectedWorkUnitRowVersion: currentRowVersion,
            outcomeId: randomUUID(),
            leaseToken,
            requestSequence,
            expectedCheckpointMac: currentCheckpoint.checkpointMac,
            capabilityId: claim.capabilityId,
            pageScopeDigest: claim.pageScopeDigest,
            failureCode: error.code,
            httpStatus: error.httpStatus,
            responseBytes: 0,
            requestDurationMs: Math.max(0, Date.now() - requestStartedAtMs),
          })
          return Object.freeze({
            status: 'failed', workUnitId: claim.workUnitId, pagesCommitted,
            scopeFinalized: false, failureCode: failure.failureCode,
            authorityBlocked: true,
          })
        }
        throw error
      }
    }

    await releaseCurrentLease(claim, currentRowVersion, leaseToken, 'worker_budget_yield')
    return Object.freeze({
      status: 'released', workUnitId: claim.workUnitId, pagesCommitted,
      scopeFinalized: false, failureCode: null, authorityBlocked: true,
    })
  } catch (error) {
    try {
      await releaseCurrentLease(claim, currentRowVersion, leaseToken, 'authority_invalidated')
    } catch {
      // Recovery owns an uncertain or concurrently invalidated lease. The
      // original sanitized error remains the runtime outcome.
    }
    throw error
  }
}

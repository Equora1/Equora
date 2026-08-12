import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { MEXC_PAGE_BUDGET_PROFILE_V1 } from '@/lib/server/mexc-pagination'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const BROKER_CAPTURE_MATERIALIZE_RPC = 'equora_materialize_next_due_broker_capture_v1' as const
export const BROKER_CAPTURE_RENEW_LEASE_RPC = 'equora_renew_broker_capture_lease_v1' as const
export const BROKER_CAPTURE_RELEASE_LEASE_RPC = 'equora_release_broker_capture_lease_v1' as const
export const BROKER_CAPTURE_CONTINUE_YIELDED_RPC = 'equora_continue_yielded_broker_capture_work_unit_v1' as const
export const BROKER_CAPTURE_RECOVER_EXPIRED_RPC = 'equora_recover_expired_broker_capture_leases_v1' as const
export const BROKER_CAPTURE_SCHEDULE_CONTRACT_VERSION = 'broker-capture-schedule-v1' as const
export const BROKER_CAPTURE_LEASE_POLICY_VERSION = 'lease-control-v1' as const

export type BrokerCaptureReleaseReason =
  | 'cooperative_shutdown'
  | 'worker_budget_yield'
  | 'authority_invalidated'
  | 'recovery_handoff'

export type BrokerCaptureMaterializationResult = Readonly<{
  status: 'scheduled' | 'no_due'
  requestId: string
  occurrenceId: string | null
  runId: string | null
  scopeId: string | null
  workUnitId: string | null
  laneStateId: string | null
  dueGeneration: number | null
  scheduledDueAt: string | null
  bucketCount: number
  bucketSetDigest: string | null
  authorityBlocked: true
}>

export type BrokerCaptureLeaseMutationInput = Readonly<{
  workUnitId: string
  expectedWorkUnitRowVersion: number
  leaseToken: string
  requestId: string
}>

export type BrokerCaptureLeaseResult = Readonly<{
  status: 'renewed' | 'released' | 'recovery_pending'
  requestId: string
  workUnitId: string
  workUnitRowVersion: number
  leaseEpoch: number
  leaseExpiresAt: string | null
  recoveryState: 'none' | 'uncertain_egress'
  authorityBlocked: true
}>

export type BrokerCaptureYieldContinuationInput = Readonly<{
  predecessorWorkUnitId: string
  expectedPredecessorRowVersion: number
  requestId: string
}>

export type BrokerCaptureYieldContinuationResult = Readonly<{
  status: 'continued' | 'scope_exhausted'
  requestId: string
  predecessorWorkUnitId: string
  successorWorkUnitId: string | null
  runId: string
  scopeId: string
  continuationGeneration: number
  crossRequestReplay: boolean
  authorityBlocked: true
}>

export type BrokerCaptureRecoveryInput = Readonly<{
  requestId: string
  batchLimit: number
}>

export type BrokerCaptureRecoveryResult = Readonly<{
  status: 'recovered' | 'no_expired'
  requestId: string
  inspectedCount: number
  requeuedCount: number
  uncertainEgressCount: number
  outcomeDerivedCount: number
  authorityBlocked: true
}>

export const BROKER_CAPTURE_SCHEDULER_DATABASE_ERROR_CODES = [
  'SCHEDULER_INVALID_INPUT',
  'SCHEDULER_REQUEST_DRIFT',
  'SCHEDULER_AUTHORITY_BLOCKED',
  'SCHEDULER_RUNTIME_ENROLLMENT_INVALID',
  'SCHEDULER_IDENTITY_INVALID_INPUT',
  'SCHEDULER_IDENTITY_NOT_ACTIVE',
  'SCHEDULER_SCOPE_WINDOW_INVALID',
  'SCHEDULER_LOCK_TIMEOUT',
  'SCHEDULER_STATEMENT_TIMEOUT',
  'SCHEDULER_PARENT_LOCK_TIMEOUT',
  'SCHEDULER_PARENT_STATEMENT_TIMEOUT',
  'LEASE_INVALID_INPUT',
  'LEASE_REQUEST_DRIFT',
  'LEASE_WORK_UNIT_NOT_FOUND',
  'LEASE_WORK_UNIT_CAS_MISMATCH',
  'LEASE_TOKEN_INVALID',
  'LEASE_AUTHORITY_BLOCKED',
  'LEASE_RENEW_LIMIT_REACHED',
  'LEASE_PERMIT_IN_FLIGHT',
  'LEASE_ACCOUNT_SLOT_CAS_MISMATCH',
  'LEASE_LOCK_TIMEOUT',
  'LEASE_STATEMENT_TIMEOUT',
  'CONTINUATION_INVALID_INPUT',
  'CONTINUATION_REQUEST_DRIFT',
  'CONTINUATION_NOT_YIELDED',
  'CONTINUATION_AUTHORITY_BLOCKED',
  'CONTINUATION_REPLAY_RACE',
  'CONTINUATION_LOCK_TIMEOUT',
  'CONTINUATION_STATEMENT_TIMEOUT',
  'RECOVERY_INVALID_INPUT',
  'RECOVERY_REQUEST_DRIFT',
  'RECOVERY_ACCOUNT_LEASE_DRIFT',
  'RECOVERY_ACCOUNT_LEASE_CAS_MISMATCH',
  'RECOVERY_LOCK_TIMEOUT',
  'RECOVERY_STATEMENT_TIMEOUT',
] as const

export type BrokerCaptureSchedulerDatabaseErrorCode =
  typeof BROKER_CAPTURE_SCHEDULER_DATABASE_ERROR_CODES[number]

type SchedulerErrorCode =
  | 'invalid_input'
  | 'database_error'
  | 'database_result_invalid'
  | BrokerCaptureSchedulerDatabaseErrorCode

export class BrokerCaptureSchedulerError extends Error {
  constructor(public readonly code: SchedulerErrorCode, message: string) {
    super(message)
    this.name = 'BrokerCaptureSchedulerError'
  }
}

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const RELEASE_REASONS = new Set<BrokerCaptureReleaseReason>([
  'cooperative_shutdown',
  'worker_budget_yield',
  'authority_invalidated',
  'recovery_handoff',
])
const SCHEDULER_DATABASE_ERROR_CODE_SET =
  new Set<BrokerCaptureSchedulerDatabaseErrorCode>(
    BROKER_CAPTURE_SCHEDULER_DATABASE_ERROR_CODES,
  )
const FORBIDDEN_RESULT_KEY = /(?:secret|plaintext|privatekey|apikey|credentialmaterial|leasetoken)/i

function fail(code: SchedulerErrorCode, message: string): never {
  throw new BrokerCaptureSchedulerError(code, message)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('database_result_invalid', `${label} ist kein geschlossenes Objekt.`)
  }
  return value as Record<string, unknown>
}

function exactKeys(value: unknown, expected: readonly string[], label: string) {
  const object = record(value, label)
  const actual = Object.keys(object).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('database_result_invalid', `${label} enthält unbekannte oder fehlende Felder.`)
  }
  if (actual.some((key) => FORBIDDEN_RESULT_KEY.test(key))) {
    fail('database_result_invalid', `${label} enthält verbotenes Schlüsselmaterial.`)
  }
  return object
}

function inputExactKeys(value: unknown, expected: readonly string[], label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('invalid_input', `${label} ist kein Objekt.`)
  }
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('invalid_input', `${label} enthält unbekannte oder fehlende Felder.`)
  }
}

function uuid(value: unknown, label: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail('invalid_input', `${label} ist keine kanonische UUID.`)
  }
  return value
}

function integer(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('invalid_input', `${label} liegt außerhalb des erlaubten Integerbereichs.`)
  }
  return value as number
}

function resultInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('database_result_invalid', `${label} liegt außerhalb des Ergebnisvertrags.`)
  }
  return value as number
}

function resultUuid(value: unknown, label: string, nullable = false) {
  if (value === null && nullable) return null
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail('database_result_invalid', `${label} ist keine kanonische Ergebnis-UUID.`)
  }
  return value as string
}

function resultDigest(value: unknown, label: string, nullable = false) {
  if (value === null && nullable) return null
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail('database_result_invalid', `${label} ist kein SHA-256-Digest.`)
  }
  return value as string
}

function resultTimestamp(value: unknown, label: string, nullable = false) {
  if (value === null && nullable) return null
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    fail('database_result_invalid', `${label} ist kein ISO-Zeitstempel.`)
  }
  return value as string
}

function databaseFailure(error: unknown) {
  if (!error) return
  const message = typeof error === 'object' && error !== null && 'message' in error
    && typeof (error as { message: unknown }).message === 'string'
    ? (error as { message: string }).message
    : ''
  const known = message.match(/\b(?:SCHEDULER|LEASE|CONTINUATION|RECOVERY)_[A-Z_]+\b/)?.[0]
  if (known && SCHEDULER_DATABASE_ERROR_CODE_SET.has(
    known as BrokerCaptureSchedulerDatabaseErrorCode,
  )) {
    fail(
      known as BrokerCaptureSchedulerDatabaseErrorCode,
      'Die Broker-Capture-Schedulertransaktion wurde von der Datenbank abgelehnt.',
    )
  }
  fail('database_error', 'Die Broker-Capture-Schedulertransaktion ist fehlgeschlagen.')
}

function validateMaterializationResult(requestId: string, value: unknown): BrokerCaptureMaterializationResult {
  const result = exactKeys(value, [
    'authorityBlocked', 'bucketCount', 'bucketSetDigest', 'dueGeneration',
    'laneStateId', 'occurrenceId', 'requestId', 'runId', 'scheduledDueAt',
    'scopeId', 'status', 'workUnitId',
  ], 'Materialisierungs-Ergebnis')
  if (!['scheduled', 'no_due'].includes(result.status as string)
    || result.requestId !== requestId || result.authorityBlocked !== true) {
    fail('database_result_invalid', 'Materialisierungs-Ergebnis widerspricht dem Vertrag.')
  }
  const empty = result.status === 'no_due'
  const occurrenceId = resultUuid(result.occurrenceId, 'occurrenceId', true)
  const runId = resultUuid(result.runId, 'runId', true)
  const scopeId = resultUuid(result.scopeId, 'scopeId', true)
  const workUnitId = resultUuid(result.workUnitId, 'workUnitId', true)
  const laneStateId = resultUuid(result.laneStateId, 'laneStateId', true)
  const dueGeneration = result.dueGeneration === null ? null
    : resultInteger(result.dueGeneration, 1, Number.MAX_SAFE_INTEGER, 'dueGeneration')
  const scheduledDueAt = resultTimestamp(result.scheduledDueAt, 'scheduledDueAt', true)
  const bucketCount = resultInteger(result.bucketCount, 0, 31, 'bucketCount')
  const bucketSetDigest = resultDigest(result.bucketSetDigest, 'bucketSetDigest', true)
  const nullable = [occurrenceId, runId, scopeId, workUnitId, laneStateId, dueGeneration, scheduledDueAt, bucketSetDigest]
  if (empty ? nullable.some((entry) => entry !== null) || bucketCount !== 0
    : nullable.some((entry) => entry === null) || bucketCount < 1 || bucketCount > 31) {
    fail('database_result_invalid', 'Materialisierungs-Ergebnis besitzt inkonsistente Resultatgruppen.')
  }
  return Object.freeze({
    status: result.status as BrokerCaptureMaterializationResult['status'], requestId,
    occurrenceId, runId, scopeId, workUnitId, laneStateId, dueGeneration,
    scheduledDueAt, bucketCount, bucketSetDigest, authorityBlocked: true,
  })
}

function validateLeaseResult(
  input: BrokerCaptureLeaseMutationInput,
  expected: readonly BrokerCaptureLeaseResult['status'][],
  value: unknown,
): BrokerCaptureLeaseResult {
  const result = exactKeys(value, [
    'authorityBlocked', 'leaseEpoch', 'leaseExpiresAt', 'recoveryState',
    'requestId', 'status', 'workUnitId', 'workUnitRowVersion',
  ], 'Lease-Ergebnis')
  if (!expected.includes(result.status as BrokerCaptureLeaseResult['status'])
    || result.requestId !== input.requestId || result.workUnitId !== input.workUnitId
    || result.authorityBlocked !== true) {
    fail('database_result_invalid', 'Lease-Ergebnis widerspricht dem Vertrag.')
  }
  const workUnitRowVersion = resultInteger(
    result.workUnitRowVersion, input.expectedWorkUnitRowVersion + 1,
    input.expectedWorkUnitRowVersion + 1, 'workUnitRowVersion',
  )
  const leaseEpoch = resultInteger(result.leaseEpoch, 1, Number.MAX_SAFE_INTEGER, 'leaseEpoch')
  const leaseExpiresAt = resultTimestamp(result.leaseExpiresAt, 'leaseExpiresAt', true)
  if (!['none', 'uncertain_egress'].includes(result.recoveryState as string)
    || (result.status === 'renewed' && (leaseExpiresAt === null || result.recoveryState !== 'none'))
    || (result.status !== 'renewed' && leaseExpiresAt !== null)
    || (result.status === 'recovery_pending') !== (result.recoveryState === 'uncertain_egress')) {
    fail('database_result_invalid', 'Lease-Ergebnis besitzt inkonsistente Zustandsfelder.')
  }
  return Object.freeze({
    status: result.status as BrokerCaptureLeaseResult['status'], requestId: input.requestId,
    workUnitId: input.workUnitId, workUnitRowVersion, leaseEpoch, leaseExpiresAt,
    recoveryState: result.recoveryState as BrokerCaptureLeaseResult['recoveryState'], authorityBlocked: true,
  })
}

export async function materializeNextDueBrokerCaptureWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: Readonly<{ requestId: string }>,
) {
  inputExactKeys(input, ['requestId'], 'Materialisierungs-Input')
  const requestId = uuid(input.requestId, 'requestId')
  const { data, error } = await client.rpc(BROKER_CAPTURE_MATERIALIZE_RPC, {
    p_request_id: requestId,
    p_schedule_contract_version: BROKER_CAPTURE_SCHEDULE_CONTRACT_VERSION,
  })
  databaseFailure(error)
  return validateMaterializationResult(requestId, data)
}

export function materializeNextDueBrokerCapture(input: Readonly<{ requestId: string }>) {
  return materializeNextDueBrokerCaptureWithClient(createSupabaseServerClient(), input)
}

function validateLeaseInput(input: BrokerCaptureLeaseMutationInput) {
  inputExactKeys(input, ['expectedWorkUnitRowVersion', 'leaseToken', 'requestId', 'workUnitId'], 'Lease-Input')
  uuid(input.workUnitId, 'workUnitId')
  uuid(input.leaseToken, 'leaseToken')
  uuid(input.requestId, 'requestId')
  integer(input.expectedWorkUnitRowVersion, 0, Number.MAX_SAFE_INTEGER - 1, 'expectedWorkUnitRowVersion')
}

export async function renewBrokerCaptureLeaseWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: BrokerCaptureLeaseMutationInput,
) {
  validateLeaseInput(input)
  const { data, error } = await client.rpc(BROKER_CAPTURE_RENEW_LEASE_RPC, {
    p_work_unit_id: input.workUnitId,
    p_expected_work_unit_row_version: input.expectedWorkUnitRowVersion,
    p_lease_token: input.leaseToken,
    p_request_id: input.requestId,
    p_lease_policy_version: BROKER_CAPTURE_LEASE_POLICY_VERSION,
  })
  databaseFailure(error)
  return validateLeaseResult(input, ['renewed'], data)
}

export function renewBrokerCaptureLease(input: BrokerCaptureLeaseMutationInput) {
  return renewBrokerCaptureLeaseWithClient(createSupabaseServerClient(), input)
}

export async function releaseBrokerCaptureLeaseWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: BrokerCaptureLeaseMutationInput & Readonly<{ releaseReason: BrokerCaptureReleaseReason }>,
) {
  inputExactKeys(input, [
    'expectedWorkUnitRowVersion', 'leaseToken', 'releaseReason', 'requestId', 'workUnitId',
  ], 'Release-Input')
  validateLeaseInput({
    workUnitId: input.workUnitId,
    expectedWorkUnitRowVersion: input.expectedWorkUnitRowVersion,
    leaseToken: input.leaseToken,
    requestId: input.requestId,
  })
  if (!RELEASE_REASONS.has(input.releaseReason)) fail('invalid_input', 'releaseReason ist nicht erlaubt.')
  const { data, error } = await client.rpc(BROKER_CAPTURE_RELEASE_LEASE_RPC, {
    p_work_unit_id: input.workUnitId,
    p_expected_work_unit_row_version: input.expectedWorkUnitRowVersion,
    p_lease_token: input.leaseToken,
    p_request_id: input.requestId,
    p_release_reason: input.releaseReason,
    p_lease_policy_version: BROKER_CAPTURE_LEASE_POLICY_VERSION,
  })
  databaseFailure(error)
  return validateLeaseResult(input, ['released', 'recovery_pending'], data)
}

export function releaseBrokerCaptureLease(
  input: BrokerCaptureLeaseMutationInput & Readonly<{ releaseReason: BrokerCaptureReleaseReason }>,
) {
  return releaseBrokerCaptureLeaseWithClient(createSupabaseServerClient(), input)
}

export async function continueYieldedBrokerCaptureWorkUnitWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: BrokerCaptureYieldContinuationInput,
) {
  inputExactKeys(input, ['expectedPredecessorRowVersion', 'predecessorWorkUnitId', 'requestId'], 'Continuation-Input')
  uuid(input.predecessorWorkUnitId, 'predecessorWorkUnitId')
  uuid(input.requestId, 'requestId')
  integer(input.expectedPredecessorRowVersion, 0, Number.MAX_SAFE_INTEGER, 'expectedPredecessorRowVersion')
  const { data, error } = await client.rpc(BROKER_CAPTURE_CONTINUE_YIELDED_RPC, {
    p_predecessor_work_unit_id: input.predecessorWorkUnitId,
    p_expected_predecessor_row_version: input.expectedPredecessorRowVersion,
    p_request_id: input.requestId,
    p_lease_policy_version: BROKER_CAPTURE_LEASE_POLICY_VERSION,
  })
  databaseFailure(error)
  const result = exactKeys(data, [
    'authorityBlocked', 'continuationGeneration', 'crossRequestReplay',
    'predecessorWorkUnitId', 'requestId', 'runId', 'scopeId', 'status',
    'successorWorkUnitId',
  ], 'Continuation-Ergebnis')
  if (!['continued', 'scope_exhausted'].includes(result.status as string)
    || result.requestId !== input.requestId
    || result.predecessorWorkUnitId !== input.predecessorWorkUnitId
    || typeof result.crossRequestReplay !== 'boolean'
    || (result.crossRequestReplay === true && result.status !== 'continued')
    || result.authorityBlocked !== true) {
    fail('database_result_invalid', 'Continuation-Ergebnis widerspricht dem Vertrag.')
  }
  const successorWorkUnitId = resultUuid(result.successorWorkUnitId, 'successorWorkUnitId', true)
  if ((result.status === 'scope_exhausted') !== (successorWorkUnitId === null)) {
    fail('database_result_invalid', 'Continuation-Ergebnis besitzt inkonsistente Successor-Felder.')
  }
  return Object.freeze({
    status: result.status as BrokerCaptureYieldContinuationResult['status'],
    requestId: input.requestId,
    predecessorWorkUnitId: input.predecessorWorkUnitId,
    successorWorkUnitId,
    runId: resultUuid(result.runId, 'runId'),
    scopeId: resultUuid(result.scopeId, 'scopeId'),
    continuationGeneration: resultInteger(
      result.continuationGeneration,
      0,
      MEXC_PAGE_BUDGET_PROFILE_V1.maxWorkUnitsPerScope - 1,
      'continuationGeneration',
    ),
    crossRequestReplay: result.crossRequestReplay,
    authorityBlocked: true as const,
  })
}

export function continueYieldedBrokerCaptureWorkUnit(input: BrokerCaptureYieldContinuationInput) {
  return continueYieldedBrokerCaptureWorkUnitWithClient(createSupabaseServerClient(), input)
}

export async function recoverExpiredBrokerCaptureLeasesWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: BrokerCaptureRecoveryInput,
) {
  inputExactKeys(input, ['batchLimit', 'requestId'], 'Recovery-Input')
  uuid(input.requestId, 'requestId')
  integer(input.batchLimit, 1, 25, 'batchLimit')
  const { data, error } = await client.rpc(BROKER_CAPTURE_RECOVER_EXPIRED_RPC, {
    p_request_id: input.requestId,
    p_batch_limit: input.batchLimit,
    p_lease_policy_version: BROKER_CAPTURE_LEASE_POLICY_VERSION,
  })
  databaseFailure(error)
  const result = exactKeys(data, [
    'authorityBlocked', 'inspectedCount', 'requestId', 'requeuedCount',
    'outcomeDerivedCount', 'status', 'uncertainEgressCount',
  ], 'Recovery-Ergebnis')
  if (!['recovered', 'no_expired'].includes(result.status as string)
    || result.requestId !== input.requestId || result.authorityBlocked !== true) {
    fail('database_result_invalid', 'Recovery-Ergebnis widerspricht dem Vertrag.')
  }
  const inspectedCount = resultInteger(result.inspectedCount, 0, input.batchLimit, 'inspectedCount')
  const requeuedCount = resultInteger(result.requeuedCount, 0, inspectedCount, 'requeuedCount')
  const uncertainEgressCount = resultInteger(result.uncertainEgressCount, 0, inspectedCount, 'uncertainEgressCount')
  const outcomeDerivedCount = resultInteger(result.outcomeDerivedCount, 0, inspectedCount, 'outcomeDerivedCount')
  if (requeuedCount + uncertainEgressCount + outcomeDerivedCount !== inspectedCount
    || (result.status === 'no_expired') !== (inspectedCount === 0)) {
    fail('database_result_invalid', 'Recovery-Ergebnis besitzt inkonsistente Counts.')
  }
  return Object.freeze({
    status: result.status as BrokerCaptureRecoveryResult['status'], requestId: input.requestId,
    inspectedCount, requeuedCount, uncertainEgressCount, outcomeDerivedCount,
    authorityBlocked: true as const,
  })
}

export function recoverExpiredBrokerCaptureLeases(input: BrokerCaptureRecoveryInput) {
  return recoverExpiredBrokerCaptureLeasesWithClient(createSupabaseServerClient(), input)
}

import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { MexcPageCheckpoint, MexcPagedCapabilityId } from '@/lib/server/mexc-pagination'
import type { MexcTransportErrorCode } from '@/lib/server/mexc-transport'

export const BROKER_CAPTURE_CLAIM_RPC = 'equora_claim_broker_capture_work_unit_v2' as const
export const BROKER_CAPTURE_REQUEST_AUTHORIZATION_RPC = 'equora_authorize_broker_capture_request_v1' as const
export const BROKER_CAPTURE_FAILURE_RPC = 'equora_record_broker_capture_failure_v2' as const
export const BROKER_CAPTURE_CLAIM_POLICY_VERSION = 'broker-capture-claim-v1' as const
export const BROKER_CAPTURE_FAILURE_POLICY_VERSION = 'broker-capture-failure-policy-v1' as const

const BROKER_CAPTURE_CLAIM_PROVENANCE = new WeakSet<object>()

export type BrokerCaptureClaimInput = Readonly<{
  workUnitId: string
  expectedWorkUnitRowVersion: number
  claimRequestId: string
  leaseToken: string
}>

export type BrokerCaptureClaimResult = Readonly<{
  status: 'claimed'
  authorityBlocked: true
  claimPolicyVersion: typeof BROKER_CAPTURE_CLAIM_POLICY_VERSION
  claimRequestId: string
  workUnitId: string
  workUnitRowVersion: number
  attempt: number
  maxAttempts: number
  requestSequence: number
  leaseExpiresAt: string
  runId: string
  scopeId: string
  brokerAccountId: string
  connectionAccountId: string
  syncActivationId: string
  activationGeneration: number
  providerCode: 'mexc'
  providerContractVersion: string
  adapterVersion: string
  profileId: string
  profileVersion: string
  capabilityId: MexcPagedCapabilityId
  endpointId: string
  instrumentSymbol: string
  positionType: number | null
  requestStartMs: number
  requestEndMs: number
  scopeDigest: string
  pageScopeDigest: string
  accountIdentityDigest: string
  accountIdentityKeyVersion: string
  checkpoint: MexcPageCheckpoint
  checkpointMac: string
  expectedLedgerGeneration: number
  credentialReference: Readonly<{ id: string; keyVersion: string }>
  integrityKeyReference: Readonly<{ id: string; keyVersion: string }>
}>

export type BrokerCaptureFailureInput = Readonly<{
  requestAuthorizationId: string
  requestStartedAt: string
  workUnitId: string
  expectedWorkUnitRowVersion: number
  outcomeId: string
  leaseToken: string
  requestSequence: number
  expectedCheckpointMac: string
  capabilityId: MexcPagedCapabilityId
  pageScopeDigest: string
  failureCode: MexcTransportErrorCode
  httpStatus: number | null
  responseBytes: number
  requestDurationMs: number
}>

export type BrokerCaptureRequestAuthorizationInput = Readonly<{
  workUnitId: string
  expectedWorkUnitRowVersion: number
  requestSequence: number
  expectedCheckpointMac: string
  leaseToken: string
  requestAuthorizationId: string
}>

export type BrokerCaptureRequestAuthorizationResult = Readonly<{
  status: 'request_authorized'
  requestAuthorizationId: string
  sendDeadlineAt: string
  workUnitId: string
  workUnitRowVersion: number
  requestSequence: number
  syncActivationId: string
  activationGeneration: number
  seriesRowVersion: number
  authorityEpoch: number
  capabilityId: MexcPagedCapabilityId
  scopeDigest: string
  pageScopeDigest: string
  credentialReference: Readonly<{ id: string; keyVersion: string }>
  authorityBlocked: true
}>

export type BrokerCaptureFailureResult = Readonly<{
  status: 'retry_pending' | 'partial_failed' | 'terminal_failed'
  authorityBlocked: true
  outcomeId: string
  workUnitId: string
  workUnitRowVersion: number
  attempt: number
  requestSequence: number
  failureCode: MexcTransportErrorCode
  failureClass: 'transport' | 'provider' | 'authority' | 'contract' | 'resource' | 'timeout'
  retryNotBefore: string | null
  terminalReason:
    | 'claim_attempt_budget_reached'
    | 'failure_budget_reached'
    | 'retry_budget_reached'
    | 'provider_retry_deferred'
    | 'non_retryable_failure'
    | 'response_exceeds_remaining_budget'
    | null
  checkpoint: MexcPageCheckpoint
  checkpointMac: string
  runStatus: 'running' | 'partial' | 'failed'
}>

export const BROKER_CAPTURE_CONTROL_DATABASE_ERROR_CODES = [
  'CONTROL_INVALID_INPUT',
  'CONTROL_WORK_UNIT_NOT_FOUND',
  'CONTROL_WORK_UNIT_CAS_MISMATCH',
  'CONTROL_CLAIM_REPLAY_MISMATCH',
  'CONTROL_WORK_UNIT_NOT_CLAIMABLE',
  'CONTROL_RETRY_NOT_DUE',
  'CONTROL_ATTEMPT_BUDGET_EXHAUSTED',
  'CONTROL_RUN_INVALID',
  'CONTROL_SCOPE_INVALID',
  'CONTROL_HEALTH_BLOCKED',
  'CONTROL_POLICY_NOT_CURRENT',
  'CONTROL_REQUEST_AUTHORIZATION_INVALID',
  'CONTROL_ACTIVATION_INACTIVE',
  'CONTROL_ACTIVATION_NOT_CURRENT',
  'CONTROL_CONNECTION_INACTIVE',
  'CONTROL_CREDENTIAL_INACTIVE',
  'CONTROL_INTEGRITY_KEY_INACTIVE',
  'CONTROL_PROVIDER_BLOCKED',
  'CONTROL_RUNTIME_ENROLLMENT_INVALID',
  'CONTROL_PERMISSION_EVIDENCE_INVALID',
  'CONTROL_CHECKPOINT_INVALID',
  'CONTROL_REQUEST_OUTCOME_CONFLICT',
  'CONTROL_FAILURE_REPLAY_MISMATCH',
  'CONTROL_LEASE_INVALID',
  'CONTROL_OUTCOME_CONFLICT',
  'CONTROL_ACCOUNT_LEASE_BUSY',
  'CONTROL_ACCOUNT_LEASE_DRIFT',
  'CONTROL_LOCK_TIMEOUT',
  'CONTROL_STATEMENT_TIMEOUT',
  'REQUEST_AUTH_INVALID_INPUT',
  'REQUEST_AUTH_ALREADY_CONSUMED',
  'REQUEST_AUTH_WORK_UNIT_NOT_FOUND',
  'REQUEST_AUTH_WORK_UNIT_CAS_MISMATCH',
  'REQUEST_AUTH_RUN_INVALID',
  'REQUEST_AUTH_ACTIVATION_NOT_CURRENT',
  'REQUEST_AUTH_HEALTH_BLOCKED',
  'REQUEST_AUTH_CONNECTION_INACTIVE',
  'REQUEST_AUTH_CREDENTIAL_INACTIVE',
  'REQUEST_AUTH_INTEGRITY_KEY_INACTIVE',
  'REQUEST_AUTH_ACCOUNT_INACTIVE',
  'REQUEST_AUTH_PROVIDER_BLOCKED',
  'REQUEST_AUTH_RUNTIME_ENROLLMENT_INVALID',
  'REQUEST_AUTH_SCOPE_INVALID',
  'REQUEST_AUTH_POLICY_NOT_CURRENT',
  'REQUEST_AUTH_TIME_AUTHORITY_EXPIRED',
  'REQUEST_AUTH_ACCOUNT_LEASE_INVALID',
  'REQUEST_AUTH_LOCK_TIMEOUT',
  'REQUEST_AUTH_STATEMENT_TIMEOUT',
  'FAILURE_PARENT_AUTHORITY_MISSING',
  'FAILURE_PARENT_AUTHORITY_INVALID',
  'FAILURE_ACCOUNT_LEASE_INVALID',
  'SCHEDULER_PARENT_LOCK_TIMEOUT',
  'SCHEDULER_PARENT_STATEMENT_TIMEOUT',
] as const

type BrokerCaptureControlDatabaseErrorCode =
  typeof BROKER_CAPTURE_CONTROL_DATABASE_ERROR_CODES[number]

type BrokerCaptureControlErrorCode =
  | 'invalid_input'
  | 'database_error'
  | 'database_result_invalid'
  | BrokerCaptureControlDatabaseErrorCode

export class BrokerCaptureControlError extends Error {
  constructor(
    public readonly code: BrokerCaptureControlErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'BrokerCaptureControlError'
  }
}

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const VERSION_PATTERN = /^[a-z][a-z0-9_.-]{0,126}$/
const MEXC_PAGED_CAPABILITY_IDS = new Set<MexcPagedCapabilityId>([
  'historical_orders_v1',
  'historical_executions_v3',
  'historical_positions_v1',
  'funding_records_v1',
])
const TRANSPORT_FAILURE_CODES = new Set<MexcTransportErrorCode>([
  'transport_contract_violation',
  'invalid_query',
  'invalid_provider_time',
  'invalid_credential',
  'ip_not_allowed',
  'permission_missing',
  'rate_limited',
  'provider_busy',
  'maintenance',
  'invalid_request',
  'unsupported_contract',
  'unknown_provider_error',
  'provider_unavailable',
  'timeout',
  'response_too_large',
  'malformed_response',
])
const FAILURE_CLASSES: Readonly<Record<MexcTransportErrorCode, BrokerCaptureFailureResult['failureClass']>> = Object.freeze({
  transport_contract_violation: 'contract',
  invalid_query: 'contract',
  invalid_provider_time: 'contract',
  invalid_credential: 'authority',
  ip_not_allowed: 'authority',
  permission_missing: 'authority',
  rate_limited: 'provider',
  provider_busy: 'provider',
  maintenance: 'provider',
  invalid_request: 'contract',
  unsupported_contract: 'contract',
  unknown_provider_error: 'provider',
  provider_unavailable: 'provider',
  timeout: 'timeout',
  response_too_large: 'resource',
  malformed_response: 'contract',
})
const DATABASE_CODES = new Set<BrokerCaptureControlDatabaseErrorCode>(
  BROKER_CAPTURE_CONTROL_DATABASE_ERROR_CODES,
)

function fail(code: BrokerCaptureControlErrorCode, message: string): never {
  throw new BrokerCaptureControlError(code, message)
}

function pagedCapability(value: unknown, label: string): MexcPagedCapabilityId {
  if (typeof value !== 'string' || !MEXC_PAGED_CAPABILITY_IDS.has(value as MexcPagedCapabilityId)) {
    fail('database_result_invalid', `${label} ist keine freigegebene MEXC-Paging-Capability.`)
  }
  return value as MexcPagedCapabilityId
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const FORBIDDEN_RESULT_KEYS = new Set([
  'apikey',
  'secretkey',
  'encryptedpayload',
  'integritykey',
  'keymaterial',
  'leasetoken',
  'providersecret',
])
const CHECKPOINT_KEYS = Object.freeze([
  'authorityBlocked',
  'budgetProfileDigest',
  'budgetProfileId',
  'capabilityId',
  'checkpointMac',
  'checkpointMacVersion',
  'checkpointVersion',
  'lastCursor',
  'lastErrorCode',
  'lastPageFingerprint',
  'nextPageNumber',
  'orderedProviderIdentitySequenceDigest',
  'reason',
  'retryNotBeforeMs',
  'scope',
  'scopeDigest',
  'seenPageFingerprints',
  'status',
  'suggestedBackoffMs',
  'terminalEvidence',
  'totalElapsedMs',
  'totalRawEvents',
  'totalRequestAttempts',
  'totalResponseBytes',
  'totalSuccessfulPages',
  'unitBackoffMs',
  'unitElapsedMs',
  'unitRawEvents',
  'unitRequestAttempts',
  'unitResponseBytes',
  'unitRetryCount',
  'unitSuccessfulPages',
  'workUnitSequence',
])
const TERMINAL_REASONS = new Set<NonNullable<BrokerCaptureFailureResult['terminalReason']>>([
  'claim_attempt_budget_reached',
  'failure_budget_reached',
  'retry_budget_reached',
  'provider_retry_deferred',
  'non_retryable_failure',
  'response_exceeds_remaining_budget',
])
const CHECKPOINT_STATUS_REASONS = Object.freeze({
  ready: new Set(['initialized', 'resumed_same_work_unit', 'continued_in_new_work_unit']),
  continue: new Set(['page_committed']),
  retry_pending: new Set(['retry_scheduled']),
  yielded: new Set(['work_unit_budget_reached', 'scope_budget_reached']),
  terminal_observed: new Set([
    'terminal_short_bare_array',
    'terminal_provider_page_metadata',
    'terminal_canonical_empty_page',
  ]),
  partial_failed: new Set([
    'non_retryable_failure',
    'retry_budget_reached',
    'failure_budget_reached',
    'claim_attempt_budget_reached',
    'provider_retry_deferred',
    'response_exceeds_remaining_budget',
    'provider_page_number_limit_reached',
    'cursor_progress_violation',
  ]),
  loop_blocked: new Set(['repeated_page_without_cursor_progress']),
})

function containsForbiddenResultKey(value: unknown, state = { nodes: 0 }, depth = 0): boolean {
  state.nodes += 1
  if (state.nodes > 10_000 || depth > 32) return true
  if (Array.isArray(value)) {
    return value.some((item) => containsForbiddenResultKey(item, state, depth + 1))
  }
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, item]) => (
    FORBIDDEN_RESULT_KEYS.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase())
    || containsForbiddenResultKey(item, state, depth + 1)
  ))
}

function freezeJson(value: unknown, state = { nodes: 0 }, depth = 0): unknown {
  state.nodes += 1
  if (state.nodes > 10_000 || depth > 32) {
    fail('database_result_invalid', 'Datenbankergebnis überschreitet das geschlossene JSON-Budget.')
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('database_result_invalid', 'Datenbankergebnis enthält eine unsichere Zahl.')
    return value
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => freezeJson(item, state, depth + 1)))
  }
  if (!isRecord(value)) fail('database_result_invalid', 'Datenbankergebnis enthält einen ungültigen JSON-Wert.')
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, freezeJson(item, state, depth + 1)]),
  ))
}

function checkpointResult(
  value: unknown,
  expectedMac: unknown,
  capabilityId: unknown,
  scopeDigest: unknown,
): MexcPageCheckpoint {
  exactKeys(value, CHECKPOINT_KEYS, 'Checkpoint')
  const canonicalCapabilityId = pagedCapability(capabilityId, 'capabilityId')
  if (
    containsForbiddenResultKey(value)
    || value.checkpointVersion !== 'mexc-page-checkpoint-v1'
    || value.checkpointMacVersion !== 'mexc-page-checkpoint-hmac-sha256-v1'
    || value.budgetProfileId !== 'mexc-history-page-budget-v1'
    || value.budgetProfileDigest !== 'aba71711421cebbff9f7ab4f8c761865aac36dffc91adc3d7468b6e632ab56aa'
    || value.checkpointMac !== expectedMac
    || typeof value.checkpointMac !== 'string'
    || !SHA256_PATTERN.test(value.checkpointMac)
    || value.capabilityId !== canonicalCapabilityId
    || value.scopeDigest !== scopeDigest
    || value.authorityBlocked !== true
    || !isRecord(value.scope)
    || !Array.isArray(value.seenPageFingerprints)
  ) fail('database_result_invalid', 'Checkpoint widerspricht dem geschlossenen Capture-Control-Vertrag.')
  const statusReasons = typeof value.status === 'string'
    ? CHECKPOINT_STATUS_REASONS[value.status as keyof typeof CHECKPOINT_STATUS_REASONS]
    : undefined
  if (!statusReasons || typeof value.reason !== 'string' || !statusReasons.has(value.reason)) {
    fail('database_result_invalid', 'Checkpointstatus und Grund widersprechen sich.')
  }
  const scope = value.scope
  const requiresPositionType = canonicalCapabilityId === 'historical_positions_v1'
    || canonicalCapabilityId === 'funding_records_v1'
  exactKeys(
    scope,
    requiresPositionType
      ? ['symbol', 'startTime', 'endTime', 'pageNumber', 'pageSize', 'positionType']
      : ['symbol', 'startTime', 'endTime', 'pageNumber', 'pageSize'],
    'Checkpoint-Scope',
  )
  if (
    typeof scope.symbol !== 'string'
    || !/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(scope.symbol)
    || (requiresPositionType && scope.positionType !== 1 && scope.positionType !== 2)
  ) fail('database_result_invalid', 'Checkpoint-Scope ist ungültig.')
  resultSafeInteger(scope.startTime, 0, Number.MAX_SAFE_INTEGER, 'checkpoint.scope.startTime')
  resultSafeInteger(scope.endTime, 0, Number.MAX_SAFE_INTEGER, 'checkpoint.scope.endTime')
  resultSafeInteger(scope.pageNumber, 1, 10_000, 'checkpoint.scope.pageNumber')
  resultSafeInteger(
    scope.pageSize,
    1,
    canonicalCapabilityId === 'historical_executions_v3' ? 1000 : 100,
    'checkpoint.scope.pageSize',
  )
  if (value.seenPageFingerprints.some((item) => typeof item !== 'string' || !SHA256_PATTERN.test(item))) {
    fail('database_result_invalid', 'Checkpoint enthält ungültige Page-Fingerprints.')
  }
  if (value.lastCursor !== null) {
    exactKeys(value.lastCursor, ['providerId', 'providerTime'], 'Checkpoint-Cursor')
    if (typeof value.lastCursor.providerId !== 'string' || !/^(?:0|[1-9]\d{0,39})$/.test(value.lastCursor.providerId)) {
      fail('database_result_invalid', 'Checkpoint-Cursor besitzt keine gültige Provider-ID.')
    }
    resultSafeInteger(value.lastCursor.providerTime, 0, Number.MAX_SAFE_INTEGER, 'checkpoint.lastCursor.providerTime')
  }
  if (
    !['none', 'short_bare_array', 'provider_page_metadata', 'canonical_empty_page'].includes(value.terminalEvidence as string)
    || (value.lastErrorCode !== null && !TRANSPORT_FAILURE_CODES.has(value.lastErrorCode as MexcTransportErrorCode))
    || (value.suggestedBackoffMs !== null && !Number.isSafeInteger(value.suggestedBackoffMs))
    || (value.retryNotBeforeMs !== null && !Number.isSafeInteger(value.retryNotBeforeMs))
  ) fail('database_result_invalid', 'Checkpoint enthält ungültige Statusmetadaten.')
  for (const key of [
    'nextPageNumber',
    'totalElapsedMs',
    'totalRawEvents',
    'totalRequestAttempts',
    'totalResponseBytes',
    'totalSuccessfulPages',
    'unitBackoffMs',
    'unitElapsedMs',
    'unitRawEvents',
    'unitRequestAttempts',
    'unitResponseBytes',
    'unitRetryCount',
    'unitSuccessfulPages',
    'workUnitSequence',
  ] as const) resultSafeInteger(value[key], 0, Number.MAX_SAFE_INTEGER, `checkpoint.${key}`)
  return freezeJson(value) as MexcPageCheckpoint
}

function exactKeys(value: unknown, expected: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail('database_result_invalid', `${label} ist kein Objekt.`)
  const actual = Object.keys(value).sort()
  const normalizedExpected = [...expected].sort()
  if (
    actual.length !== normalizedExpected.length
    || actual.some((key, index) => key !== normalizedExpected[index])
  ) fail('database_result_invalid', `${label} enthält unerwartete Felder.`)
}

function inputExactKeys(value: unknown, expected: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail('invalid_input', `${label} ist kein Objekt.`)
  const actual = Object.keys(value).sort()
  const normalizedExpected = [...expected].sort()
  if (
    actual.length !== normalizedExpected.length
    || actual.some((key, index) => key !== normalizedExpected[index])
  ) fail('invalid_input', `${label} enthält unerwartete Felder.`)
}

function uuid(value: unknown, label: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail('invalid_input', `${label} ist keine kanonische UUID.`)
  }
  return value
}

function safeInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('invalid_input', `${label} liegt außerhalb des sicheren Ganzzahlbereichs.`)
  }
  return value as number
}

function resultSafeInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('database_result_invalid', `${label} liegt außerhalb des sicheren Ganzzahlbereichs.`)
  }
  return value as number
}

function isoTimestamp(value: unknown, label: string, result = false) {
  const errorCode = result ? 'database_result_invalid' : 'invalid_input'
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) {
    fail(errorCode, `${label} ist kein ISO-Zeitstempel.`)
  }
  return value
}

function nullableSafeInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (value === null) return null
  return safeInteger(value, minimum, maximum, label)
}

function frozenReference(value: unknown, label: string) {
  exactKeys(value, ['id', 'keyVersion'], label)
  if (typeof value.id !== 'string' || !UUID_PATTERN.test(value.id)) {
    fail('database_result_invalid', `${label}.id ist ungültig.`)
  }
  if (typeof value.keyVersion !== 'string' || !VERSION_PATTERN.test(value.keyVersion)) {
    fail('database_result_invalid', `${label}.keyVersion ist ungültig.`)
  }
  return Object.freeze({ id: value.id, keyVersion: value.keyVersion })
}

function databaseErrorCode(message: string | undefined, structuredCode: string | undefined) {
  if (structuredCode === '55P03') return 'CONTROL_LOCK_TIMEOUT'
  if (structuredCode === '57014') return 'CONTROL_STATEMENT_TIMEOUT'
  const match = message?.match(
    /\b(?:CONTROL|REQUEST_AUTH|FAILURE|SCHEDULER_PARENT)_[A-Z_]+\b/,
  )
  const code = match?.[0] as BrokerCaptureControlDatabaseErrorCode | undefined
  return code && DATABASE_CODES.has(code) ? code : null
}

function databaseFailure(error: { message?: string; code?: string } | null) {
  if (!error) return
  const code = databaseErrorCode(error.message, error.code)
  if (code) fail(code, 'Die Broker-Capture-Kontrolltransaktion wurde von der Datenbank abgelehnt.')
  fail('database_error', 'Die Broker-Capture-Kontrolltransaktion ist ohne akzeptiertes Teilergebnis fehlgeschlagen.')
}

function validateClaimResult(input: BrokerCaptureClaimInput, value: unknown): BrokerCaptureClaimResult {
  exactKeys(value, [
    'accountIdentityDigest',
    'accountIdentityKeyVersion',
    'activationGeneration',
    'adapterVersion',
    'attempt',
    'authorityBlocked',
    'brokerAccountId',
    'capabilityId',
    'checkpoint',
    'checkpointMac',
    'claimPolicyVersion',
    'claimRequestId',
    'connectionAccountId',
    'credentialReference',
    'endpointId',
    'expectedLedgerGeneration',
    'instrumentSymbol',
    'integrityKeyReference',
    'leaseExpiresAt',
    'maxAttempts',
    'pageScopeDigest',
    'positionType',
    'profileId',
    'profileVersion',
    'providerCode',
    'providerContractVersion',
    'requestEndMs',
    'requestSequence',
    'requestStartMs',
    'runId',
    'scopeDigest',
    'scopeId',
    'status',
    'syncActivationId',
    'workUnitId',
    'workUnitRowVersion',
  ], 'Claim-Ergebnis')

  if (containsForbiddenResultKey(value)) {
    fail('database_result_invalid', 'Claim-Ergebnis enthaelt verbotenes Schluesselmaterial.')
  }

  const credentialReference = frozenReference(value.credentialReference, 'credentialReference')
  const integrityKeyReference = frozenReference(value.integrityKeyReference, 'integrityKeyReference')
  const checkpoint = checkpointResult(
    value.checkpoint,
    value.checkpointMac,
    value.capabilityId,
    value.pageScopeDigest,
  )
  if (
    value.status !== 'claimed'
    || value.authorityBlocked !== true
    || value.claimPolicyVersion !== BROKER_CAPTURE_CLAIM_POLICY_VERSION
    || value.claimRequestId !== input.claimRequestId
    || value.workUnitId !== input.workUnitId
    || typeof value.providerCode !== 'string'
    || value.providerCode !== 'mexc'
    || typeof value.instrumentSymbol !== 'string'
    || !value.instrumentSymbol
    || (value.positionType !== null && !Number.isSafeInteger(value.positionType))
    || typeof value.providerContractVersion !== 'string'
    || !VERSION_PATTERN.test(value.providerContractVersion)
    || typeof value.adapterVersion !== 'string'
    || !VERSION_PATTERN.test(value.adapterVersion)
    || typeof value.profileId !== 'string'
    || !VERSION_PATTERN.test(value.profileId)
    || typeof value.profileVersion !== 'string'
    || !VERSION_PATTERN.test(value.profileVersion)
    || typeof value.capabilityId !== 'string'
    || !VERSION_PATTERN.test(value.capabilityId)
    || typeof value.endpointId !== 'string'
    || !VERSION_PATTERN.test(value.endpointId)
    || typeof value.scopeDigest !== 'string'
    || !SHA256_PATTERN.test(value.scopeDigest)
    || typeof value.pageScopeDigest !== 'string'
    || !SHA256_PATTERN.test(value.pageScopeDigest)
    || typeof value.accountIdentityDigest !== 'string'
    || !SHA256_PATTERN.test(value.accountIdentityDigest)
    || typeof value.accountIdentityKeyVersion !== 'string'
    || !VERSION_PATTERN.test(value.accountIdentityKeyVersion)
    || typeof value.checkpointMac !== 'string'
    || !SHA256_PATTERN.test(value.checkpointMac)
  ) fail('database_result_invalid', 'Claim-Ergebnis widerspricht dem geschlossenen Capture-Control-Vertrag.')

  for (const [label, candidate] of [
    ['runId', value.runId],
    ['scopeId', value.scopeId],
    ['brokerAccountId', value.brokerAccountId],
    ['connectionAccountId', value.connectionAccountId],
    ['syncActivationId', value.syncActivationId],
  ] as const) {
    if (typeof candidate !== 'string' || !UUID_PATTERN.test(candidate)) {
      fail('database_result_invalid', `${label} ist im Claim-Ergebnis ungültig.`)
    }
  }

  resultSafeInteger(
    value.workUnitRowVersion,
    input.expectedWorkUnitRowVersion + 1,
    input.expectedWorkUnitRowVersion + 1,
    'workUnitRowVersion',
  )
  resultSafeInteger(value.attempt, 1, 8, 'attempt')
  resultSafeInteger(value.maxAttempts, value.attempt as number, 8, 'maxAttempts')
  resultSafeInteger(value.requestSequence, 1, Number.MAX_SAFE_INTEGER, 'requestSequence')
  resultSafeInteger(value.activationGeneration, 1, Number.MAX_SAFE_INTEGER, 'activationGeneration')
  resultSafeInteger(value.requestStartMs, 0, Number.MAX_SAFE_INTEGER, 'requestStartMs')
  resultSafeInteger(value.requestEndMs, 0, Number.MAX_SAFE_INTEGER, 'requestEndMs')
  resultSafeInteger(value.expectedLedgerGeneration, 0, Number.MAX_SAFE_INTEGER, 'expectedLedgerGeneration')
  if (
    checkpoint.status !== 'ready'
    && checkpoint.status !== 'continue'
  ) fail('database_result_invalid', 'Claim-Checkpoint ist nicht requestfähig.')
  if (
    checkpoint.scope.symbol !== value.instrumentSymbol
    || checkpoint.scope.startTime !== value.requestStartMs
    || checkpoint.scope.endTime !== value.requestEndMs
    || ('positionType' in checkpoint.scope ? checkpoint.scope.positionType : null) !== value.positionType
  ) fail('database_result_invalid', 'Claim-Checkpoint ist nicht an den autoritativen Request-Scope gebunden.')
  if (checkpoint.totalRequestAttempts + 1 !== value.requestSequence) {
    fail('database_result_invalid', 'Claim-Sequenz folgt dem Checkpoint nicht exakt.')
  }
  const leaseExpiresAt = isoTimestamp(value.leaseExpiresAt, 'leaseExpiresAt', true)

  const result = Object.freeze({
    ...(value as unknown as BrokerCaptureClaimResult),
    checkpoint,
    credentialReference,
    integrityKeyReference,
    leaseExpiresAt,
  })
  BROKER_CAPTURE_CLAIM_PROVENANCE.add(result)
  return result
}

export function inspectBrokerCaptureClaimResult(value: BrokerCaptureClaimResult) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || !Object.isFrozen(value)
    || !BROKER_CAPTURE_CLAIM_PROVENANCE.has(value)
    || value.status !== 'claimed'
    || value.authorityBlocked !== true
  ) fail('database_result_invalid', 'Claim-Ergebnis besitzt keine authentische Capture-Control-Provenienz.')
  return value
}

function validateFailureInput(input: BrokerCaptureFailureInput) {
  inputExactKeys(input, [
    'capabilityId',
    'expectedWorkUnitRowVersion',
    'expectedCheckpointMac',
    'failureCode',
    'httpStatus',
    'leaseToken',
    'outcomeId',
    'pageScopeDigest',
    'requestAuthorizationId',
    'requestDurationMs',
    'requestSequence',
    'requestStartedAt',
    'responseBytes',
    'workUnitId',
  ], 'Failure-Input')
  uuid(input.workUnitId, 'workUnitId')
  uuid(input.outcomeId, 'outcomeId')
  uuid(input.leaseToken, 'leaseToken')
  uuid(input.requestAuthorizationId, 'requestAuthorizationId')
  isoTimestamp(input.requestStartedAt, 'requestStartedAt')
  safeInteger(input.expectedWorkUnitRowVersion, 0, Number.MAX_SAFE_INTEGER - 1, 'expectedWorkUnitRowVersion')
  safeInteger(input.requestSequence, 1, Number.MAX_SAFE_INTEGER, 'requestSequence')
  if (!MEXC_PAGED_CAPABILITY_IDS.has(input.capabilityId)) fail('invalid_input', 'capabilityId ist ungültig.')
  if (!SHA256_PATTERN.test(input.pageScopeDigest)) fail('invalid_input', 'pageScopeDigest ist ungültig.')
  if (!SHA256_PATTERN.test(input.expectedCheckpointMac)) fail('invalid_input', 'expectedCheckpointMac ist ungültig.')
  if (!TRANSPORT_FAILURE_CODES.has(input.failureCode)) fail('invalid_input', 'failureCode ist unbekannt.')
  nullableSafeInteger(input.httpStatus, 100, 599, 'httpStatus')
  safeInteger(input.responseBytes, 0, 65536, 'responseBytes')
  safeInteger(input.requestDurationMs, 0, 60000, 'requestDurationMs')
}

function validateFailureResult(input: BrokerCaptureFailureInput, value: unknown): BrokerCaptureFailureResult {
  exactKeys(value, [
    'attempt',
    'authorityBlocked',
    'checkpoint',
    'checkpointMac',
    'failureClass',
    'failureCode',
    'outcomeId',
    'requestSequence',
    'retryNotBefore',
    'runStatus',
    'status',
    'terminalReason',
    'workUnitId',
    'workUnitRowVersion',
  ], 'Failure-Ergebnis')
  const checkpoint = checkpointResult(
    value.checkpoint,
    value.checkpointMac,
    input.capabilityId,
    input.pageScopeDigest,
  )
  const retryNotBefore = value.retryNotBefore === null
    ? null
    : isoTimestamp(value.retryNotBefore, 'retryNotBefore', true)
  const terminalReason = value.terminalReason === null
    ? null
    : typeof value.terminalReason === 'string' && TERMINAL_REASONS.has(
      value.terminalReason as NonNullable<BrokerCaptureFailureResult['terminalReason']>,
    )
      ? value.terminalReason as NonNullable<BrokerCaptureFailureResult['terminalReason']>
      : fail('database_result_invalid', 'Failure-Ergebnis besitzt keinen zulässigen Terminalgrund.')
  if (
    !['retry_pending', 'partial_failed', 'terminal_failed'].includes(value.status as string)
    || value.authorityBlocked !== true
    || value.outcomeId !== input.outcomeId
    || value.workUnitId !== input.workUnitId
    || value.failureCode !== input.failureCode
    || value.failureClass !== FAILURE_CLASSES[input.failureCode]
    || !['running', 'partial', 'failed'].includes(value.runStatus as string)
    || value.checkpointMac === input.expectedCheckpointMac
    || (value.status === 'retry_pending' && (
      value.runStatus !== 'running'
      || terminalReason !== null
      || retryNotBefore === null
      || checkpoint.status !== 'retry_pending'
      || checkpoint.reason !== 'retry_scheduled'
      || checkpoint.retryNotBeforeMs !== Date.parse(retryNotBefore)
    ))
    || (value.status !== 'retry_pending' && (
      terminalReason === null
      || retryNotBefore !== null
      || checkpoint.status !== 'partial_failed'
      || checkpoint.reason !== terminalReason
      || checkpoint.retryNotBeforeMs !== null
      || checkpoint.suggestedBackoffMs !== null
    ))
    || (value.status === 'partial_failed' && !['partial', 'failed'].includes(value.runStatus as string))
    || (value.status === 'terminal_failed' && !['partial', 'failed'].includes(value.runStatus as string))
    || checkpoint.totalRequestAttempts !== input.requestSequence
    || (terminalReason === 'response_exceeds_remaining_budget'
      ? checkpoint.lastErrorCode !== null
      : checkpoint.lastErrorCode !== input.failureCode)
  ) fail('database_result_invalid', 'Failure-Ergebnis widerspricht dem geschlossenen Capture-Control-Vertrag.')
  resultSafeInteger(
    value.workUnitRowVersion,
    input.expectedWorkUnitRowVersion + 1,
    input.expectedWorkUnitRowVersion + 1,
    'workUnitRowVersion',
  )
  resultSafeInteger(value.attempt, 1, 8, 'attempt')
  resultSafeInteger(value.requestSequence, input.requestSequence, input.requestSequence, 'requestSequence')
  return Object.freeze({
    ...(value as unknown as BrokerCaptureFailureResult),
    checkpoint,
    retryNotBefore,
    terminalReason,
  })
}

export async function claimBrokerCaptureWorkUnitWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: BrokerCaptureClaimInput,
): Promise<BrokerCaptureClaimResult> {
  inputExactKeys(input, [
    'claimRequestId',
    'expectedWorkUnitRowVersion',
    'leaseToken',
    'workUnitId',
  ], 'Claim-Input')
  const workUnitId = uuid(input.workUnitId, 'workUnitId')
  const claimRequestId = uuid(input.claimRequestId, 'claimRequestId')
  const leaseToken = uuid(input.leaseToken, 'leaseToken')
  const expectedWorkUnitRowVersion = safeInteger(
    input.expectedWorkUnitRowVersion,
    0,
    Number.MAX_SAFE_INTEGER - 1,
    'expectedWorkUnitRowVersion',
  )
  const { data, error } = await client.rpc(BROKER_CAPTURE_CLAIM_RPC, {
    p_work_unit_id: workUnitId,
    p_expected_work_unit_row_version: expectedWorkUnitRowVersion,
    p_claim_request_id: claimRequestId,
    p_lease_token: leaseToken,
    p_claim_policy_version: BROKER_CAPTURE_CLAIM_POLICY_VERSION,
  })
  databaseFailure(error)
  return validateClaimResult(input, data)
}

export async function claimBrokerCaptureWorkUnit(
  input: BrokerCaptureClaimInput,
): Promise<BrokerCaptureClaimResult> {
  return claimBrokerCaptureWorkUnitWithClient(createSupabaseServerClient(), input)
}

function validateRequestAuthorizationResult(
  input: BrokerCaptureRequestAuthorizationInput,
  value: unknown,
): BrokerCaptureRequestAuthorizationResult {
  exactKeys(value, [
    'activationGeneration',
    'authorityBlocked',
    'authorityEpoch',
    'capabilityId',
    'credentialReference',
    'pageScopeDigest',
    'requestAuthorizationId',
    'requestSequence',
    'scopeDigest',
    'sendDeadlineAt',
    'seriesRowVersion',
    'status',
    'syncActivationId',
    'workUnitId',
    'workUnitRowVersion',
  ], 'Request-Authorization-Ergebnis')
  if (containsForbiddenResultKey(value)) {
    fail('database_result_invalid', 'Request-Authorization enthaelt verbotenes Schluesselmaterial.')
  }
  const credentialReference = frozenReference(
    value.credentialReference,
    'credentialReference',
  )
  const sendDeadlineAt = isoTimestamp(value.sendDeadlineAt, 'sendDeadlineAt', true)
  if (
    value.status !== 'request_authorized'
    || value.authorityBlocked !== true
    || value.requestAuthorizationId !== input.requestAuthorizationId
    || value.workUnitId !== input.workUnitId
    || value.workUnitRowVersion !== input.expectedWorkUnitRowVersion
    || value.requestSequence !== input.requestSequence
    || typeof value.syncActivationId !== 'string'
    || !UUID_PATTERN.test(value.syncActivationId)
    || typeof value.scopeDigest !== 'string'
    || !SHA256_PATTERN.test(value.scopeDigest)
    || typeof value.pageScopeDigest !== 'string'
    || !SHA256_PATTERN.test(value.pageScopeDigest)
    || !MEXC_PAGED_CAPABILITY_IDS.has(value.capabilityId as MexcPagedCapabilityId)
  ) fail('database_result_invalid', 'Request-Authorization widerspricht dem geschlossenen Vertrag.')
  resultSafeInteger(value.activationGeneration, 1, Number.MAX_SAFE_INTEGER, 'activationGeneration')
  resultSafeInteger(value.seriesRowVersion, 0, Number.MAX_SAFE_INTEGER, 'seriesRowVersion')
  resultSafeInteger(value.authorityEpoch, 0, Number.MAX_SAFE_INTEGER, 'authorityEpoch')
  if (Date.parse(sendDeadlineAt) <= Date.now() - 1_000) {
    fail('database_result_invalid', 'Request-Authorization ist bereits abgelaufen.')
  }
  return Object.freeze({
    ...(value as unknown as BrokerCaptureRequestAuthorizationResult),
    credentialReference,
    sendDeadlineAt,
  })
}

export async function authorizeBrokerCaptureRequestWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: BrokerCaptureRequestAuthorizationInput,
): Promise<BrokerCaptureRequestAuthorizationResult> {
  inputExactKeys(input, [
    'expectedCheckpointMac',
    'expectedWorkUnitRowVersion',
    'leaseToken',
    'requestAuthorizationId',
    'requestSequence',
    'workUnitId',
  ], 'Request-Authorization-Input')
  uuid(input.workUnitId, 'workUnitId')
  uuid(input.leaseToken, 'leaseToken')
  uuid(input.requestAuthorizationId, 'requestAuthorizationId')
  safeInteger(
    input.expectedWorkUnitRowVersion,
    0,
    Number.MAX_SAFE_INTEGER,
    'expectedWorkUnitRowVersion',
  )
  safeInteger(input.requestSequence, 1, Number.MAX_SAFE_INTEGER, 'requestSequence')
  if (!SHA256_PATTERN.test(input.expectedCheckpointMac)) {
    fail('invalid_input', 'expectedCheckpointMac ist ungueltig.')
  }
  const { data, error } = await client.rpc(BROKER_CAPTURE_REQUEST_AUTHORIZATION_RPC, {
    p_work_unit_id: input.workUnitId,
    p_expected_work_unit_row_version: input.expectedWorkUnitRowVersion,
    p_request_sequence: input.requestSequence,
    p_expected_checkpoint_mac: input.expectedCheckpointMac,
    p_lease_token: input.leaseToken,
    p_request_authorization_id: input.requestAuthorizationId,
  })
  databaseFailure(error)
  return validateRequestAuthorizationResult(input, data)
}

export async function authorizeBrokerCaptureRequest(
  input: BrokerCaptureRequestAuthorizationInput,
): Promise<BrokerCaptureRequestAuthorizationResult> {
  return authorizeBrokerCaptureRequestWithClient(createSupabaseServerClient(), input)
}

export async function recordBrokerCaptureFailureWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: BrokerCaptureFailureInput,
): Promise<BrokerCaptureFailureResult> {
  validateFailureInput(input)
  const { data, error } = await client.rpc(BROKER_CAPTURE_FAILURE_RPC, {
    p_request_authorization_id: input.requestAuthorizationId,
    p_request_started_at: input.requestStartedAt,
    p_work_unit_id: input.workUnitId,
    p_expected_work_unit_row_version: input.expectedWorkUnitRowVersion,
    p_outcome_id: input.outcomeId,
    p_lease_token: input.leaseToken,
    p_request_sequence: input.requestSequence,
    p_expected_checkpoint_mac: input.expectedCheckpointMac,
    p_expected_capability_id: input.capabilityId,
    p_expected_page_scope_digest: input.pageScopeDigest,
    p_failure_code: input.failureCode,
    p_http_status: input.httpStatus,
    p_response_bytes: input.responseBytes,
    p_request_duration_ms: input.requestDurationMs,
    p_failure_policy_version: BROKER_CAPTURE_FAILURE_POLICY_VERSION,
  })
  databaseFailure(error)
  return validateFailureResult(input, data)
}

export async function recordBrokerCaptureFailure(
  input: BrokerCaptureFailureInput,
): Promise<BrokerCaptureFailureResult> {
  return recordBrokerCaptureFailureWithClient(createSupabaseServerClient(), input)
}

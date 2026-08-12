import 'server-only'

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import {
  isEquoraTcjDigest,
  type EquoraTcjDigest,
} from '@/lib/server/equora-tcj'
import type {
  MexcHistoryOracleScope,
  MexcOracleStatus,
  MexcPositionOracleScope,
} from '@/lib/server/mexc-oracles'
import {
  MEXC_MAX_RESPONSE_BYTES,
  MEXC_TRANSPORT_ERROR_POLICY,
  type MexcTransportErrorCode,
} from '@/lib/server/mexc-transport'

export const MEXC_PAGE_CHECKPOINT_VERSION = 'mexc-page-checkpoint-v1' as const
export const MEXC_PAGE_CHECKPOINT_MAC_VERSION = 'mexc-page-checkpoint-hmac-sha256-v1' as const

export const MEXC_PAGE_BUDGET_PROFILE_V1 = Object.freeze({
  profileId: 'mexc-history-page-budget-v1',
  maxSuccessfulPagesPerWorkUnit: 5,
  maxRequestAttemptsPerWorkUnit: 7,
  maxRawEventsPerWorkUnit: 1_000,
  maxResponseBytesPerWorkUnit: 5 * MEXC_MAX_RESPONSE_BYTES,
  maxElapsedMsPerWorkUnit: 60_000,
  maxRetriesPerWorkUnit: 2,
  retryBackoffMs: Object.freeze([1_000, 5_000] as const),
  maxWorkUnitsPerScope: 20,
  maxSuccessfulPagesPerScope: 100,
  maxRawEventsPerScope: 100_000,
  maxResponseBytesPerScope: 100 * MEXC_MAX_RESPONSE_BYTES,
  maxElapsedMsPerScope: 20 * 60_000,
} as const)

export type MexcPagedCapabilityId =
  | 'historical_orders_v1'
  | 'historical_executions_v3'
  | 'historical_positions_v1'
  | 'funding_records_v1'

export type MexcPageScope = MexcHistoryOracleScope | MexcPositionOracleScope

export type MexcPageBudgetProfile = Readonly<{
  profileId: string
  maxSuccessfulPagesPerWorkUnit: number
  maxRequestAttemptsPerWorkUnit: number
  maxRawEventsPerWorkUnit: number
  maxResponseBytesPerWorkUnit: number
  maxElapsedMsPerWorkUnit: number
  maxRetriesPerWorkUnit: number
  retryBackoffMs: readonly number[]
  maxWorkUnitsPerScope: number
  maxSuccessfulPagesPerScope: number
  maxRawEventsPerScope: number
  maxResponseBytesPerScope: number
  maxElapsedMsPerScope: number
}>

export type MexcCheckpointIntegrityKey = Uint8Array

export type MexcProviderPageEvidence = Readonly<{
  currentPage: number
  pageSize: number
  totalCount: number
  totalPage: number
}>

export type MexcPageObservation = Readonly<{
  capabilityId: MexcPagedCapabilityId
  requestPageNumber: number
  shape: 'bare_array_v1' | 'page_object_v1'
  oracleStatus: MexcOracleStatus
  recordCount: number
  orderedProviderIds: readonly string[]
  orderedProviderTimes: readonly number[]
  rawBodyDigest: EquoraTcjDigest<'raw_response_body'>
  rawBodyBytes: number
  requestDurationMs: number
  providerPage: MexcProviderPageEvidence | null
  cursor: Readonly<{ providerTime: number; providerId: string }> | null
  pageFingerprint: string
}>

export type MexcPageCheckpointStatus =
  | 'ready'
  | 'continue'
  | 'retry_pending'
  | 'yielded'
  | 'terminal_observed'
  | 'partial_failed'
  | 'loop_blocked'

export type MexcPageCheckpointReason =
  | 'initialized'
  | 'page_committed'
  | 'terminal_short_bare_array'
  | 'terminal_provider_page_metadata'
  | 'terminal_canonical_empty_page'
  | 'work_unit_budget_reached'
  | 'scope_budget_reached'
  | 'retry_scheduled'
  | 'retry_budget_reached'
  | 'failure_budget_reached'
  | 'claim_attempt_budget_reached'
  | 'provider_retry_deferred'
  | 'non_retryable_failure'
  | 'provider_page_number_limit_reached'
  | 'cursor_progress_violation'
  | 'repeated_page_without_cursor_progress'
  | 'response_exceeds_remaining_budget'
  | 'resumed_same_work_unit'
  | 'continued_in_new_work_unit'

export type MexcPageCheckpoint = Readonly<{
  checkpointVersion: typeof MEXC_PAGE_CHECKPOINT_VERSION
  checkpointMacVersion: typeof MEXC_PAGE_CHECKPOINT_MAC_VERSION
  checkpointMac: string
  budgetProfileId: string
  budgetProfileDigest: string
  capabilityId: MexcPagedCapabilityId
  scope: MexcPageScope
  scopeDigest: string
  status: MexcPageCheckpointStatus
  reason: MexcPageCheckpointReason
  workUnitSequence: number
  nextPageNumber: number
  unitSuccessfulPages: number
  unitRequestAttempts: number
  unitRawEvents: number
  unitResponseBytes: number
  unitElapsedMs: number
  unitRetryCount: number
  unitBackoffMs: number
  totalSuccessfulPages: number
  totalRequestAttempts: number
  totalRawEvents: number
  totalResponseBytes: number
  totalElapsedMs: number
  authorityBlocked: boolean
  terminalEvidence: 'none' | 'short_bare_array' | 'provider_page_metadata' | 'canonical_empty_page'
  lastCursor: Readonly<{ providerTime: number; providerId: string }> | null
  lastPageFingerprint: string | null
  seenPageFingerprints: readonly string[]
  orderedProviderIdentitySequenceDigest: string
  lastErrorCode: MexcTransportErrorCode | null
  suggestedBackoffMs: number | null
  retryNotBeforeMs: number | null
}>

export type MexcPageTransition = Readonly<{
  checkpoint: MexcPageCheckpoint
  action: 'request_next_page' | 'retry_after_backoff' | 'yield' | 'stop_terminal' | 'stop_blocked'
  scopeCompleteness: 'unverified' | 'partial'
}>

export class MexcPaginationError extends Error {
  constructor(
    public readonly code:
      | 'invalid_capability'
      | 'invalid_scope'
      | 'invalid_budget_profile'
      | 'invalid_integrity_key'
      | 'invalid_page_observation'
      | 'checkpoint_mismatch'
      | 'invalid_transition',
    message: string,
  ) {
    super(message)
    this.name = 'MexcPaginationError'
  }
}

const BOUNDED_BACKOFF_ERRORS = new Set<MexcTransportErrorCode>([
  'rate_limited',
  'provider_busy',
  'provider_unavailable',
  'timeout',
])

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const PROVIDER_ID_PATTERN = /^(?:0|[1-9]\d{0,39})$/
const SYMBOL_PATTERN = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/
const MAX_HISTORY_WINDOW_MS = 31 * 24 * 60 * 60 * 1000
const CHECKPOINT_STATUS_REASONS = Object.freeze({
  ready: Object.freeze(['initialized', 'resumed_same_work_unit', 'continued_in_new_work_unit']),
  continue: Object.freeze(['page_committed']),
  retry_pending: Object.freeze(['retry_scheduled']),
  yielded: Object.freeze([
    'work_unit_budget_reached',
    'scope_budget_reached',
  ]),
  terminal_observed: Object.freeze([
    'terminal_short_bare_array',
    'terminal_provider_page_metadata',
    'terminal_canonical_empty_page',
  ]),
  partial_failed: Object.freeze([
    'non_retryable_failure',
    'retry_budget_reached',
    'failure_budget_reached',
    'claim_attempt_budget_reached',
    'provider_retry_deferred',
    'response_exceeds_remaining_budget',
    'provider_page_number_limit_reached',
    'cursor_progress_violation',
  ]),
  loop_blocked: Object.freeze(['repeated_page_without_cursor_progress']),
} satisfies Record<MexcPageCheckpointStatus, readonly MexcPageCheckpointReason[]>)

function fail(code: MexcPaginationError['code'], message: string): never {
  throw new MexcPaginationError(code, message)
}

function digestParts(parts: readonly (string | number | boolean | null)[]) {
  const hash = createHash('sha256')
  for (const part of parts) {
    const value = part === null ? '<null>' : String(part)
    hash.update(`${Buffer.byteLength(value, 'utf8')}:`)
    hash.update(value)
    hash.update('|')
  }
  return hash.digest('hex')
}

function validatedIntegrityKey(input: MexcCheckpointIntegrityKey) {
  if (!(input instanceof Uint8Array) || input.byteLength < 32 || input.byteLength > 64) {
    fail('invalid_integrity_key', 'MEXC-Checkpoint-Integritätsschlüssel muss 32 bis 64 Byte besitzen.')
  }
  return Buffer.from(input)
}

function assertSafeInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('invalid_page_observation', `${label} liegt außerhalb des freigegebenen Integerbereichs.`)
  }
  return value as number
}

function assertCheckpointInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('checkpoint_mismatch', `${label} liegt außerhalb des freigegebenen Checkpointbereichs.`)
  }
  return value as number
}

function assertPagedCapability(value: unknown): asserts value is MexcPagedCapabilityId {
  if (![
    'historical_orders_v1',
    'historical_executions_v3',
    'historical_positions_v1',
    'funding_records_v1',
  ].includes(value as string)) fail('invalid_capability', 'Unbekannte MEXC-Paging-Capability.')
}

function validateScope(capabilityId: MexcPagedCapabilityId, input: MexcPageScope): MexcPageScope {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_scope', 'MEXC-Paging-Scope fehlt.')
  const record = input as Readonly<Record<string, unknown>>
  const requiresPositionType = capabilityId === 'historical_positions_v1' || capabilityId === 'funding_records_v1'
  const expectedKeys = ['endTime', 'pageNumber', 'pageSize', 'startTime', 'symbol', ...(requiresPositionType ? ['positionType'] : [])].sort()
  const actualKeys = Object.keys(record).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail('invalid_scope', 'MEXC-Paging-Scope enthält fehlende oder capabilityfremde Felder.')
  }
  if (typeof record.symbol !== 'string' || !SYMBOL_PATTERN.test(record.symbol)) fail('invalid_scope', 'MEXC-Paging-Symbol ist ungültig.')
  const startTime = record.startTime
  const endTime = record.endTime
  if (
    !Number.isSafeInteger(startTime)
    || !Number.isSafeInteger(endTime)
    || (startTime as number) < 1_000_000_000_000
    || (endTime as number) > 9_999_999_999_999
    || (startTime as number) > (endTime as number)
    || (endTime as number) - (startTime as number) > MAX_HISTORY_WINDOW_MS
  ) fail('invalid_scope', 'MEXC-Paging-Zeitfenster ist ungültig.')
  const pageNumber = assertSafeInteger(record.pageNumber, 1, 10_000, 'scope.pageNumber')
  const maximumPageSize = capabilityId === 'historical_executions_v3' ? 1000 : 100
  const pageSize = assertSafeInteger(record.pageSize, 1, maximumPageSize, 'scope.pageSize')
  const historyScope: MexcHistoryOracleScope = Object.freeze({
    symbol: record.symbol,
    startTime: startTime as number,
    endTime: endTime as number,
    pageNumber,
    pageSize,
  })
  if (!requiresPositionType) return historyScope
  if (record.positionType !== 1 && record.positionType !== 2) fail('invalid_scope', 'MEXC-Paging-Position-Type ist ungültig.')
  return Object.freeze({ ...historyScope, positionType: record.positionType })
}

function scopeDigest(
  capabilityId: MexcPagedCapabilityId,
  scope: MexcPageScope,
  budgetProfileId: string,
  budgetProfileDigest: string,
) {
  return digestParts([
    'mexc-page-scope-v1',
    capabilityId,
    scope.symbol,
    scope.startTime,
    scope.endTime,
    scope.pageNumber,
    scope.pageSize,
    'positionType' in scope ? scope.positionType : null,
    budgetProfileId,
    budgetProfileDigest,
  ])
}

function validateBudgetProfile(input: MexcPageBudgetProfile): MexcPageBudgetProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_budget_profile', 'MEXC-Page-Budgetprofil fehlt.')
  const expectedKeys = [
    'maxElapsedMsPerScope',
    'maxElapsedMsPerWorkUnit',
    'maxRawEventsPerScope',
    'maxRawEventsPerWorkUnit',
    'maxRequestAttemptsPerWorkUnit',
    'maxResponseBytesPerScope',
    'maxResponseBytesPerWorkUnit',
    'maxRetriesPerWorkUnit',
    'maxSuccessfulPagesPerScope',
    'maxSuccessfulPagesPerWorkUnit',
    'maxWorkUnitsPerScope',
    'profileId',
    'retryBackoffMs',
  ].sort()
  const actualKeys = Object.keys(input).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail('invalid_budget_profile', 'MEXC-Page-Budgetprofil enthält unbekannte oder fehlende Felder.')
  }
  if (typeof input.profileId !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(input.profileId)) {
    fail('invalid_budget_profile', 'MEXC-Page-Budgetprofil besitzt keine gültige ID.')
  }
  const integerFields = [
    ['maxSuccessfulPagesPerWorkUnit', input.maxSuccessfulPagesPerWorkUnit, 1, 100],
    ['maxRequestAttemptsPerWorkUnit', input.maxRequestAttemptsPerWorkUnit, 1, 200],
    ['maxRawEventsPerWorkUnit', input.maxRawEventsPerWorkUnit, 1, 100_000],
    ['maxResponseBytesPerWorkUnit', input.maxResponseBytesPerWorkUnit, MEXC_MAX_RESPONSE_BYTES, 100 * MEXC_MAX_RESPONSE_BYTES],
    ['maxElapsedMsPerWorkUnit', input.maxElapsedMsPerWorkUnit, 1_000, 30 * 60_000],
    ['maxRetriesPerWorkUnit', input.maxRetriesPerWorkUnit, 0, 10],
    ['maxWorkUnitsPerScope', input.maxWorkUnitsPerScope, 1, 1_000],
    ['maxSuccessfulPagesPerScope', input.maxSuccessfulPagesPerScope, 1, 10_000],
    ['maxRawEventsPerScope', input.maxRawEventsPerScope, 1, 10_000_000],
    ['maxResponseBytesPerScope', input.maxResponseBytesPerScope, MEXC_MAX_RESPONSE_BYTES, 1_000 * MEXC_MAX_RESPONSE_BYTES],
    ['maxElapsedMsPerScope', input.maxElapsedMsPerScope, 1_000, 24 * 60 * 60_000],
  ] as const
  for (const [label, value, minimum, maximum] of integerFields) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      fail('invalid_budget_profile', `${label} liegt außerhalb des freigegebenen Bereichs.`)
    }
  }
  if (input.maxRequestAttemptsPerWorkUnit < input.maxSuccessfulPagesPerWorkUnit) {
    fail('invalid_budget_profile', 'Requestbudget darf nicht kleiner als das Pagebudget sein.')
  }
  if (input.maxSuccessfulPagesPerScope < input.maxSuccessfulPagesPerWorkUnit) {
    fail('invalid_budget_profile', 'Scope-Pagebudget darf nicht kleiner als das Work-Unit-Budget sein.')
  }
  if (input.maxRawEventsPerScope < input.maxRawEventsPerWorkUnit || input.maxResponseBytesPerScope < input.maxResponseBytesPerWorkUnit) {
    fail('invalid_budget_profile', 'Scopebudget darf nicht kleiner als das Work-Unit-Budget sein.')
  }
  if (input.maxElapsedMsPerScope < input.maxElapsedMsPerWorkUnit) {
    fail('invalid_budget_profile', 'Scope-Zeitbudget darf nicht kleiner als das Work-Unit-Zeitbudget sein.')
  }
  if (!Array.isArray(input.retryBackoffMs) || input.retryBackoffMs.length !== input.maxRetriesPerWorkUnit) {
    fail('invalid_budget_profile', 'Retry-Backoffprofil stimmt nicht mit dem Retrybudget überein.')
  }
  let previous = -1
  for (const backoff of input.retryBackoffMs) {
    if (!Number.isSafeInteger(backoff) || backoff < 0 || backoff > 60_000 || backoff <= previous) {
      fail('invalid_budget_profile', 'Retry-Backoffwerte müssen streng zunehmend und begrenzt sein.')
    }
    previous = backoff
  }
  return Object.freeze({ ...input, retryBackoffMs: Object.freeze([...input.retryBackoffMs]) })
}

function budgetProfileDigest(budget: MexcPageBudgetProfile) {
  return digestParts([
    'mexc-page-budget-v1',
    budget.profileId,
    budget.maxSuccessfulPagesPerWorkUnit,
    budget.maxRequestAttemptsPerWorkUnit,
    budget.maxRawEventsPerWorkUnit,
    budget.maxResponseBytesPerWorkUnit,
    budget.maxElapsedMsPerWorkUnit,
    budget.maxRetriesPerWorkUnit,
    ...budget.retryBackoffMs,
    budget.maxWorkUnitsPerScope,
    budget.maxSuccessfulPagesPerScope,
    budget.maxRawEventsPerScope,
    budget.maxResponseBytesPerScope,
    budget.maxElapsedMsPerScope,
  ])
}

function trustedNowMs() {
  const now = Date.now()
  if (!Number.isSafeInteger(now) || now < 1_000_000_000_000 || now > 9_999_999_999_999) {
    fail('invalid_transition', 'Vertrauenswürdige Serverzeit für MEXC-Retry ist ungültig.')
  }
  return now
}

function checkpointMac(
  checkpoint: Omit<MexcPageCheckpoint, 'checkpointMac'>,
  integrityKey: MexcCheckpointIntegrityKey,
) {
  const mac = createHmac('sha256', validatedIntegrityKey(integrityKey))
  const parts = [
    checkpoint.checkpointVersion,
    checkpoint.checkpointMacVersion,
    checkpoint.budgetProfileId,
    checkpoint.budgetProfileDigest,
    checkpoint.capabilityId,
    checkpoint.scopeDigest,
    checkpoint.status,
    checkpoint.reason,
    checkpoint.workUnitSequence,
    checkpoint.nextPageNumber,
    checkpoint.unitSuccessfulPages,
    checkpoint.unitRequestAttempts,
    checkpoint.unitRawEvents,
    checkpoint.unitResponseBytes,
    checkpoint.unitElapsedMs,
    checkpoint.unitRetryCount,
    checkpoint.unitBackoffMs,
    checkpoint.totalSuccessfulPages,
    checkpoint.totalRequestAttempts,
    checkpoint.totalRawEvents,
    checkpoint.totalResponseBytes,
    checkpoint.totalElapsedMs,
    checkpoint.authorityBlocked,
    checkpoint.terminalEvidence,
    checkpoint.lastCursor?.providerTime ?? null,
    checkpoint.lastCursor?.providerId ?? null,
    checkpoint.lastPageFingerprint,
    checkpoint.orderedProviderIdentitySequenceDigest,
    checkpoint.lastErrorCode,
    checkpoint.suggestedBackoffMs,
    checkpoint.retryNotBeforeMs,
    ...checkpoint.seenPageFingerprints,
  ] as const
  for (const part of parts) {
    const value = part === null ? '<null>' : String(part)
    mac.update(`${Buffer.byteLength(value, 'utf8')}:`)
    mac.update(value)
    mac.update('|')
  }
  return mac.digest('hex')
}

function sealCheckpoint(
  input: Omit<MexcPageCheckpoint, 'checkpointMac'>,
  integrityKey: MexcCheckpointIntegrityKey,
): MexcPageCheckpoint {
  const frozenInput = Object.freeze({
    ...input,
    scope: Object.freeze({ ...input.scope }),
    lastCursor: input.lastCursor ? Object.freeze({ ...input.lastCursor }) : null,
    seenPageFingerprints: Object.freeze([...input.seenPageFingerprints]),
  })
  return Object.freeze({ ...frozenInput, checkpointMac: checkpointMac(frozenInput, integrityKey) })
}

function assertCheckpoint(
  checkpoint: MexcPageCheckpoint,
  budget: MexcPageBudgetProfile,
  integrityKey: MexcCheckpointIntegrityKey,
) {
  validatedIntegrityKey(integrityKey)
  if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
    fail('checkpoint_mismatch', 'MEXC-Checkpoint fehlt.')
  }
  const expectedKeys = [
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
  ].sort()
  const actualKeys = Object.keys(checkpoint).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail('checkpoint_mismatch', 'MEXC-Checkpoint enthält unbekannte oder fehlende Felder.')
  }
  if (
    checkpoint.checkpointVersion !== MEXC_PAGE_CHECKPOINT_VERSION
    || checkpoint.checkpointMacVersion !== MEXC_PAGE_CHECKPOINT_MAC_VERSION
  ) {
    fail('checkpoint_mismatch', 'MEXC-Checkpointversion ist ungültig.')
  }
  if (typeof checkpoint.budgetProfileId !== 'string' || checkpoint.budgetProfileId !== budget.profileId) {
    fail('checkpoint_mismatch', 'MEXC-Budgetprofil stimmt nicht mit dem Checkpoint überein.')
  }
  if (
    typeof checkpoint.budgetProfileDigest !== 'string'
    || !SHA256_PATTERN.test(checkpoint.budgetProfileDigest)
    || checkpoint.budgetProfileDigest !== budgetProfileDigest(budget)
  ) {
    fail('checkpoint_mismatch', 'MEXC-Budgetprofilinhalt stimmt nicht mit dem Checkpoint überein.')
  }
  if (![
    'historical_orders_v1',
    'historical_executions_v3',
    'historical_positions_v1',
    'funding_records_v1',
  ].includes(checkpoint.capabilityId)) fail('checkpoint_mismatch', 'MEXC-Checkpoint-Capability ist ungültig.')
  const canonicalScope = validateScope(checkpoint.capabilityId, checkpoint.scope)
  if (typeof checkpoint.scopeDigest !== 'string' || !SHA256_PATTERN.test(checkpoint.scopeDigest)) {
    fail('checkpoint_mismatch', 'MEXC-Checkpoint-Scopesignatur ist ungültig.')
  }
  if (scopeDigest(
    checkpoint.capabilityId,
    canonicalScope,
    budget.profileId,
    checkpoint.budgetProfileDigest,
  ) !== checkpoint.scopeDigest) {
    fail('checkpoint_mismatch', 'MEXC-Scopesignatur stimmt nicht mit dem Checkpoint überein.')
  }
  if (!Object.prototype.hasOwnProperty.call(CHECKPOINT_STATUS_REASONS, checkpoint.status)) {
    fail('checkpoint_mismatch', 'MEXC-Checkpointstatus ist ungültig.')
  }
  const allowedReasons = CHECKPOINT_STATUS_REASONS[checkpoint.status] as readonly MexcPageCheckpointReason[]
  if (!allowedReasons.includes(checkpoint.reason)) {
    fail('checkpoint_mismatch', 'MEXC-Checkpointstatus und Reason widersprechen sich.')
  }
  if (checkpoint.authorityBlocked !== true) {
    fail('checkpoint_mismatch', 'MEXC-Page-Checkpoint darf keine Import- oder Finanzautorität erteilen.')
  }
  const workUnitSequence = assertCheckpointInteger(
    checkpoint.workUnitSequence,
    1,
    budget.maxWorkUnitsPerScope,
    'workUnitSequence',
  )
  const nextPageNumber = assertCheckpointInteger(checkpoint.nextPageNumber, 1, 10_001, 'nextPageNumber')
  const unitSuccessfulPages = assertCheckpointInteger(
    checkpoint.unitSuccessfulPages,
    0,
    budget.maxSuccessfulPagesPerWorkUnit,
    'unitSuccessfulPages',
  )
  const unitRequestAttempts = assertCheckpointInteger(
    checkpoint.unitRequestAttempts,
    0,
    budget.maxRequestAttemptsPerWorkUnit,
    'unitRequestAttempts',
  )
  const unitRawEvents = assertCheckpointInteger(
    checkpoint.unitRawEvents,
    0,
    budget.maxRawEventsPerWorkUnit,
    'unitRawEvents',
  )
  const unitResponseBytes = assertCheckpointInteger(
    checkpoint.unitResponseBytes,
    0,
    budget.maxResponseBytesPerWorkUnit + MEXC_MAX_RESPONSE_BYTES,
    'unitResponseBytes',
  )
  const unitElapsedMs = assertCheckpointInteger(
    checkpoint.unitElapsedMs,
    0,
    budget.maxElapsedMsPerWorkUnit + 60_000,
    'unitElapsedMs',
  )
  const unitRetryCount = assertCheckpointInteger(
    checkpoint.unitRetryCount,
    0,
    budget.maxRetriesPerWorkUnit,
    'unitRetryCount',
  )
  const maximumUnitBackoffMs = budget.retryBackoffMs.reduce((sum, value) => sum + value, 0)
  const unitBackoffMs = assertCheckpointInteger(checkpoint.unitBackoffMs, 0, maximumUnitBackoffMs, 'unitBackoffMs')
  const totalSuccessfulPages = assertCheckpointInteger(
    checkpoint.totalSuccessfulPages,
    0,
    budget.maxSuccessfulPagesPerScope,
    'totalSuccessfulPages',
  )
  const totalRequestAttempts = assertCheckpointInteger(
    checkpoint.totalRequestAttempts,
    0,
    budget.maxRequestAttemptsPerWorkUnit * workUnitSequence,
    'totalRequestAttempts',
  )
  const totalRawEvents = assertCheckpointInteger(
    checkpoint.totalRawEvents,
    0,
    budget.maxRawEventsPerScope,
    'totalRawEvents',
  )
  const totalResponseBytes = assertCheckpointInteger(
    checkpoint.totalResponseBytes,
    0,
    budget.maxResponseBytesPerScope + MEXC_MAX_RESPONSE_BYTES,
    'totalResponseBytes',
  )
  const totalElapsedMs = assertCheckpointInteger(
    checkpoint.totalElapsedMs,
    0,
    budget.maxElapsedMsPerScope + 60_000,
    'totalElapsedMs',
  )
  if (
    unitSuccessfulPages > totalSuccessfulPages
    || unitRequestAttempts > totalRequestAttempts
    || unitRawEvents > totalRawEvents
    || unitResponseBytes > totalResponseBytes
    || unitElapsedMs > totalElapsedMs
    || unitBackoffMs > unitElapsedMs
    || totalRequestAttempts < totalSuccessfulPages
    || unitRequestAttempts < unitSuccessfulPages
    || totalSuccessfulPages > workUnitSequence * budget.maxSuccessfulPagesPerWorkUnit
    || nextPageNumber !== canonicalScope.pageNumber + totalSuccessfulPages
  ) fail('checkpoint_mismatch', 'MEXC-Checkpointzähler oder Pagefortschritt widersprechen sich.')
  const expectedUnitBackoffMs = budget.retryBackoffMs
    .slice(0, unitRetryCount)
    .reduce((sum, value) => sum + value, 0)
  if (unitBackoffMs !== expectedUnitBackoffMs) {
    fail('checkpoint_mismatch', 'MEXC-Checkpoint-Retrycount und Backoffsumme widersprechen sich.')
  }
  if (!Array.isArray(checkpoint.seenPageFingerprints)) {
    fail('checkpoint_mismatch', 'MEXC-Checkpoint-Pagefingerprints fehlen.')
  }
  if (
    checkpoint.seenPageFingerprints.length !== totalSuccessfulPages
    || new Set(checkpoint.seenPageFingerprints).size !== checkpoint.seenPageFingerprints.length
    || checkpoint.seenPageFingerprints.some((value) => typeof value !== 'string' || !SHA256_PATTERN.test(value))
  ) fail('checkpoint_mismatch', 'MEXC-Checkpoint-Pagefingerprints widersprechen den erfolgreichen Pages.')
  const expectedLastPageFingerprint = totalSuccessfulPages === 0
    ? null
    : checkpoint.seenPageFingerprints[checkpoint.seenPageFingerprints.length - 1]!
  if (checkpoint.lastPageFingerprint !== expectedLastPageFingerprint) {
    fail('checkpoint_mismatch', 'MEXC-Checkpoint besitzt keinen konsistenten letzten Pagefingerprint.')
  }
  if (
    typeof checkpoint.orderedProviderIdentitySequenceDigest !== 'string'
    || !SHA256_PATTERN.test(checkpoint.orderedProviderIdentitySequenceDigest)
  ) fail('checkpoint_mismatch', 'MEXC-Checkpoint besitzt keinen gültigen Provider-Identitätssequenzdigest.')
  if (checkpoint.lastCursor !== null) {
    if (typeof checkpoint.lastCursor !== 'object' || Array.isArray(checkpoint.lastCursor)) {
      fail('checkpoint_mismatch', 'MEXC-Checkpoint-Cursor ist ungültig.')
    }
    const cursorKeys = Object.keys(checkpoint.lastCursor).sort()
    if (cursorKeys.join('|') !== 'providerId|providerTime') {
      fail('checkpoint_mismatch', 'MEXC-Checkpoint-Cursor enthält unbekannte oder fehlende Felder.')
    }
    assertCheckpointInteger(checkpoint.lastCursor.providerTime, 1_000_000_000_000, 9_999_999_999_999, 'lastCursor.providerTime')
    if (typeof checkpoint.lastCursor.providerId !== 'string' || !PROVIDER_ID_PATTERN.test(checkpoint.lastCursor.providerId)) {
      fail('checkpoint_mismatch', 'MEXC-Checkpoint-Cursor besitzt keine gültige Provider-ID.')
    }
  }
  if ((totalRawEvents === 0) !== (checkpoint.lastCursor === null)) {
    fail('checkpoint_mismatch', 'MEXC-Checkpoint-Cursor widerspricht dem Eventcount.')
  }
  if (
    checkpoint.lastErrorCode !== null
    && !Object.prototype.hasOwnProperty.call(MEXC_TRANSPORT_ERROR_POLICY, checkpoint.lastErrorCode)
  ) fail('checkpoint_mismatch', 'MEXC-Checkpoint besitzt eine unbekannte Fehlerklasse.')
  if (
    checkpoint.suggestedBackoffMs !== null
    && (!Number.isSafeInteger(checkpoint.suggestedBackoffMs) || !budget.retryBackoffMs.includes(checkpoint.suggestedBackoffMs))
  ) fail('checkpoint_mismatch', 'MEXC-Checkpoint besitzt einen ungültigen Retry-Backoff.')
  if (checkpoint.retryNotBeforeMs !== null) {
    assertCheckpointInteger(checkpoint.retryNotBeforeMs, 1_000_000_000_000, 9_999_999_999_999, 'retryNotBeforeMs')
  }
  if (checkpoint.status === 'retry_pending') {
    if (
      checkpoint.retryNotBeforeMs === null
      || checkpoint.suggestedBackoffMs === null
      || checkpoint.lastErrorCode === null
      || !BOUNDED_BACKOFF_ERRORS.has(checkpoint.lastErrorCode)
    ) fail('checkpoint_mismatch', 'MEXC-Retry-Checkpoint besitzt keine vollständige Backoffevidenz.')
  } else if (checkpoint.retryNotBeforeMs !== null || checkpoint.suggestedBackoffMs !== null) {
    fail('checkpoint_mismatch', 'Nur retry_pending darf einen offenen Backoff besitzen.')
  }
  const boundedFailureReason = checkpoint.reason === 'retry_scheduled'
    || checkpoint.reason === 'retry_budget_reached'
    || checkpoint.reason === 'failure_budget_reached'
    || checkpoint.reason === 'claim_attempt_budget_reached'
    || checkpoint.reason === 'resumed_same_work_unit'
  if (boundedFailureReason) {
    if (checkpoint.lastErrorCode === null || !BOUNDED_BACKOFF_ERRORS.has(checkpoint.lastErrorCode)) {
      fail('checkpoint_mismatch', 'MEXC-Checkpoint besitzt keine passende bounded-backoff Fehlerklasse.')
    }
  } else if (checkpoint.reason === 'provider_retry_deferred') {
    if (checkpoint.lastErrorCode !== 'maintenance') {
      fail('checkpoint_mismatch', 'MEXC-Maintenance-Checkpoint besitzt keine passende Fehlerklasse.')
    }
  } else if (checkpoint.reason === 'non_retryable_failure') {
    if (
      checkpoint.lastErrorCode === null
      || checkpoint.lastErrorCode === 'maintenance'
      || BOUNDED_BACKOFF_ERRORS.has(checkpoint.lastErrorCode)
    ) fail('checkpoint_mismatch', 'MEXC-Checkpoint besitzt keine passende nicht-retrybare Fehlerklasse.')
  } else if (checkpoint.lastErrorCode !== null) {
    fail('checkpoint_mismatch', 'MEXC-Checkpointstatus darf keine Fehlerklasse tragen.')
  }
  const expectedTerminalEvidence = checkpoint.reason === 'terminal_short_bare_array'
    ? 'short_bare_array'
    : checkpoint.reason === 'terminal_provider_page_metadata'
      ? 'provider_page_metadata'
      : checkpoint.reason === 'terminal_canonical_empty_page'
        ? 'canonical_empty_page'
        : 'none'
  if (checkpoint.terminalEvidence !== expectedTerminalEvidence) {
    fail('checkpoint_mismatch', 'MEXC-Checkpoint-Terminalevidenz widerspricht dem Status.')
  }
  if (typeof checkpoint.checkpointMac !== 'string' || !SHA256_PATTERN.test(checkpoint.checkpointMac)) {
    fail('checkpoint_mismatch', 'MEXC-Checkpoint-MAC ist ungültig.')
  }
  const { checkpointMac: providedMac, ...unsigned } = checkpoint
  const expectedMac = checkpointMac(unsigned, integrityKey)
  if (!timingSafeEqual(Buffer.from(expectedMac, 'hex'), Buffer.from(providedMac, 'hex'))) {
    fail('checkpoint_mismatch', 'MEXC-Checkpoint wurde verändert.')
  }
}

function expectedOracleStatus(capabilityId: MexcPagedCapabilityId, status: MexcOracleStatus, recordCount: number) {
  if (capabilityId === 'historical_orders_v1' || capabilityId === 'historical_executions_v3') {
    return status === 'valid_read_preview_only'
  }
  if (capabilityId === 'historical_positions_v1') {
    return recordCount === 0
      ? status === 'valid_read_preview_only'
      : status === 'blocked_unobserved_position_items'
  }
  return status === 'blocked_funding_authority'
}

function validateProviderPage(input: MexcProviderPageEvidence, requestPageNumber: number, recordCount: number) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('invalid_page_observation', 'MEXC-Fundingpage besitzt keine Page-Evidenz.')
  }
  const expectedKeys = ['currentPage', 'pageSize', 'totalCount', 'totalPage']
  const actualKeys = Object.keys(input).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail('invalid_page_observation', 'MEXC-Fundingpage enthält unbekannte oder fehlende Felder.')
  }
  const currentPage = assertSafeInteger(input.currentPage, 1, 10_000, 'providerPage.currentPage')
  const pageSize = assertSafeInteger(input.pageSize, 1, 100, 'providerPage.pageSize')
  const totalCount = assertSafeInteger(input.totalCount, 0, 2_147_483_647, 'providerPage.totalCount')
  const totalPage = assertSafeInteger(input.totalPage, 0, 2_147_483_647, 'providerPage.totalPage')
  if (currentPage !== requestPageNumber || recordCount > pageSize || totalCount < recordCount) {
    fail('invalid_page_observation', 'MEXC-Fundingpage widerspricht Request oder Recordcount.')
  }
  const expectedTotalPage = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize)
  const canonicalEmptyPage = totalCount === 0 && totalPage === 0 && currentPage === 1 && recordCount === 0
  if (totalPage !== expectedTotalPage || (!canonicalEmptyPage && currentPage > totalPage)) {
    fail('invalid_page_observation', 'MEXC-Fundingpage besitzt widersprüchliche Gesamtseiten.')
  }
  const expectedRecordCount = canonicalEmptyPage
    ? 0
    : currentPage < totalPage
      ? pageSize
      : totalCount - pageSize * (totalPage - 1)
  if (recordCount !== expectedRecordCount) {
    fail('invalid_page_observation', 'MEXC-Fundingpage-Recordcount widerspricht den Provider-Page-Metadaten.')
  }
  return Object.freeze({ currentPage, pageSize, totalCount, totalPage })
}

export function createMexcPageObservation(input: Omit<MexcPageObservation, 'cursor' | 'pageFingerprint'>): MexcPageObservation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('invalid_page_observation', 'MEXC-Page-Observation fehlt.')
  }
  const expectedKeys = [
    'capabilityId',
    'oracleStatus',
    'orderedProviderIds',
    'orderedProviderTimes',
    'providerPage',
    'rawBodyBytes',
    'rawBodyDigest',
    'recordCount',
    'requestDurationMs',
    'requestPageNumber',
    'shape',
  ].sort()
  const actualKeys = Object.keys(input).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail('invalid_page_observation', 'MEXC-Page-Observation enthält unbekannte oder fehlende Felder.')
  }
  assertPagedCapability(input.capabilityId)
  const requestPageNumber = assertSafeInteger(input.requestPageNumber, 1, 10_000, 'requestPageNumber')
  const recordCount = assertSafeInteger(input.recordCount, 0, 100_000, 'recordCount')
  const rawBodyBytes = assertSafeInteger(input.rawBodyBytes, 1, MEXC_MAX_RESPONSE_BYTES, 'rawBodyBytes')
  const requestDurationMs = assertSafeInteger(input.requestDurationMs, 0, 60_000, 'requestDurationMs')
  if (!isEquoraTcjDigest(input.rawBodyDigest, 'raw_response_body')) {
    fail('invalid_page_observation', 'MEXC-Page besitzt keinen gültigen Raw-Body-Digest.')
  }
  const rawBodyDigest = Object.freeze({ ...input.rawBodyDigest })
  if (!Array.isArray(input.orderedProviderIds) || !Array.isArray(input.orderedProviderTimes)) {
    fail('invalid_page_observation', 'MEXC-Page-Identitäten und -Zeiten müssen Arrays sein.')
  }
  if (input.orderedProviderIds.length !== recordCount || input.orderedProviderTimes.length !== recordCount) {
    fail('invalid_page_observation', 'MEXC-Page-Identitäten und -Zeiten stimmen nicht mit dem Recordcount überein.')
  }
  if (new Set(input.orderedProviderIds).size !== recordCount) fail('invalid_page_observation', 'MEXC-Page enthält doppelte Provider-IDs.')
  for (const providerId of input.orderedProviderIds) {
    if (typeof providerId !== 'string' || !PROVIDER_ID_PATTERN.test(providerId)) {
      fail('invalid_page_observation', 'MEXC-Page enthält eine ungültige Provider-ID.')
    }
  }
  for (let index = 0; index < input.orderedProviderTimes.length; index += 1) {
    const timestamp = input.orderedProviderTimes[index]
    assertSafeInteger(timestamp, 1_000_000_000_000, 9_999_999_999_999, `orderedProviderTimes[${index}]`)
    if (index > 0 && timestamp! > input.orderedProviderTimes[index - 1]!) {
      fail('invalid_page_observation', 'MEXC-Pagezeiten sind nicht nichtzunehmend sortiert.')
    }
  }
  if (!expectedOracleStatus(input.capabilityId, input.oracleStatus, recordCount)) {
    fail('invalid_page_observation', 'MEXC-Page-Oracle-Status passt nicht zur Capability.')
  }
  const expectedShape = input.capabilityId === 'funding_records_v1' ? 'page_object_v1' : 'bare_array_v1'
  if (input.shape !== expectedShape) fail('invalid_page_observation', 'MEXC-Page-Shape passt nicht zur Capability.')
  const providerPage = input.shape === 'page_object_v1'
    ? validateProviderPage(input.providerPage!, requestPageNumber, recordCount)
    : null
  if (input.shape === 'bare_array_v1' && input.providerPage !== null) {
    fail('invalid_page_observation', 'Bare-Array-Page darf keine erfundene Provider-Page-Evidenz besitzen.')
  }
  const cursor = recordCount === 0
    ? null
    : Object.freeze({
        providerTime: input.orderedProviderTimes[recordCount - 1]!,
        providerId: input.orderedProviderIds[recordCount - 1]!,
      })
  const pageFingerprint = digestParts([
    'mexc-page-fingerprint-v1',
    input.capabilityId,
    rawBodyDigest.digestAlgorithm,
    rawBodyDigest.digestContractVersion,
    rawBodyDigest.domain,
    rawBodyDigest.digest,
    cursor?.providerTime ?? null,
    cursor?.providerId ?? null,
  ])
  return Object.freeze({
    ...input,
    rawBodyDigest,
    requestPageNumber,
    recordCount,
    rawBodyBytes,
    requestDurationMs,
    orderedProviderIds: Object.freeze([...input.orderedProviderIds]),
    orderedProviderTimes: Object.freeze([...input.orderedProviderTimes]),
    providerPage,
    cursor,
    pageFingerprint,
  })
}

function validateRecordedObservation(input: MexcPageObservation) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('invalid_page_observation', 'MEXC-Page-Observation fehlt.')
  }
  const expectedKeys = [
    'capabilityId',
    'cursor',
    'oracleStatus',
    'orderedProviderIds',
    'orderedProviderTimes',
    'pageFingerprint',
    'providerPage',
    'rawBodyBytes',
    'rawBodyDigest',
    'recordCount',
    'requestDurationMs',
    'requestPageNumber',
    'shape',
  ].sort()
  const actualKeys = Object.keys(input).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail('invalid_page_observation', 'MEXC-Page-Observation enthält unbekannte oder fehlende Felder.')
  }
  const canonical = createMexcPageObservation({
    capabilityId: input.capabilityId,
    requestPageNumber: input.requestPageNumber,
    shape: input.shape,
    oracleStatus: input.oracleStatus,
    recordCount: input.recordCount,
    orderedProviderIds: input.orderedProviderIds,
    orderedProviderTimes: input.orderedProviderTimes,
    rawBodyDigest: input.rawBodyDigest,
    rawBodyBytes: input.rawBodyBytes,
    requestDurationMs: input.requestDurationMs,
    providerPage: input.providerPage,
  })
  const cursorMatches = input.cursor === null
    ? canonical.cursor === null
    : Boolean(input.cursor)
      && typeof input.cursor === 'object'
      && !Array.isArray(input.cursor)
      && canonical.cursor !== null
      && input.cursor.providerTime === canonical.cursor.providerTime
      && input.cursor.providerId === canonical.cursor.providerId
      && Object.keys(input.cursor).sort().join('|') === 'providerId|providerTime'
  if (input.pageFingerprint !== canonical.pageFingerprint || !cursorMatches) {
    fail('invalid_page_observation', 'MEXC-Page-Cursor oder Fingerprint wurde verändert.')
  }
  return canonical
}

export function createMexcPageCheckpoint(
  capabilityId: MexcPagedCapabilityId,
  scopeInput: MexcPageScope,
  integrityKey: MexcCheckpointIntegrityKey,
  budgetInput: MexcPageBudgetProfile = MEXC_PAGE_BUDGET_PROFILE_V1,
): MexcPageCheckpoint {
  assertPagedCapability(capabilityId)
  const budget = validateBudgetProfile(budgetInput)
  const profileDigest = budgetProfileDigest(budget)
  const scope = validateScope(capabilityId, scopeInput)
  if (scope.pageSize > budget.maxRawEventsPerWorkUnit) {
    fail('invalid_budget_profile', 'Work-Unit-Eventbudget ist kleiner als eine zulässige Providerpage.')
  }
  return sealCheckpoint({
    checkpointVersion: MEXC_PAGE_CHECKPOINT_VERSION,
    checkpointMacVersion: MEXC_PAGE_CHECKPOINT_MAC_VERSION,
    budgetProfileId: budget.profileId,
    budgetProfileDigest: profileDigest,
    capabilityId,
    scope,
    scopeDigest: scopeDigest(capabilityId, scope, budget.profileId, profileDigest),
    status: 'ready',
    reason: 'initialized',
    workUnitSequence: 1,
    nextPageNumber: scope.pageNumber,
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
    orderedProviderIdentitySequenceDigest: digestParts(['mexc-ordered-provider-identity-sequence-v1', capabilityId]),
    lastErrorCode: null,
    suggestedBackoffMs: null,
    retryNotBeforeMs: null,
  }, integrityKey)
}

function activeCheckpoint(checkpoint: MexcPageCheckpoint) {
  if (checkpoint.status !== 'ready' && checkpoint.status !== 'continue') {
    fail('invalid_transition', `MEXC-Checkpointstatus ${checkpoint.status} erlaubt keinen Page-Request.`)
  }
}

function scopeBudgetReached(checkpoint: MexcPageCheckpoint, budget: MexcPageBudgetProfile) {
  return checkpoint.totalSuccessfulPages >= budget.maxSuccessfulPagesPerScope
    || checkpoint.totalRawEvents >= budget.maxRawEventsPerScope
    || checkpoint.totalResponseBytes >= budget.maxResponseBytesPerScope
    || checkpoint.totalElapsedMs >= budget.maxElapsedMsPerScope
}

function unitBudgetReached(checkpoint: MexcPageCheckpoint, budget: MexcPageBudgetProfile) {
  return checkpoint.unitSuccessfulPages >= budget.maxSuccessfulPagesPerWorkUnit
    || checkpoint.unitRequestAttempts >= budget.maxRequestAttemptsPerWorkUnit
    || checkpoint.unitRawEvents >= budget.maxRawEventsPerWorkUnit
    || checkpoint.unitResponseBytes >= budget.maxResponseBytesPerWorkUnit
    || checkpoint.unitElapsedMs >= budget.maxElapsedMsPerWorkUnit
}

function terminalEvidence(observation: MexcPageObservation, pageSize: number) {
  if (observation.shape === 'bare_array_v1' && observation.recordCount < pageSize) {
    return 'short_bare_array'
  }
  if (observation.providerPage) {
    if (
      observation.providerPage.currentPage === 1
      && observation.providerPage.totalCount === 0
      && observation.providerPage.totalPage === 0
      && observation.recordCount === 0
    ) return 'canonical_empty_page'
    if (observation.providerPage.totalPage > 0 && observation.providerPage.currentPage >= observation.providerPage.totalPage) {
      return 'provider_page_metadata'
    }
  }
  return 'none'
}

export function recordMexcPage(
  checkpoint: MexcPageCheckpoint,
  observation: MexcPageObservation,
  integrityKey: MexcCheckpointIntegrityKey,
  budgetInput: MexcPageBudgetProfile = MEXC_PAGE_BUDGET_PROFILE_V1,
): MexcPageTransition {
  const budget = validateBudgetProfile(budgetInput)
  assertCheckpoint(checkpoint, budget, integrityKey)
  activeCheckpoint(checkpoint)
  observation = validateRecordedObservation(observation)
  if (observation.capabilityId !== checkpoint.capabilityId || observation.requestPageNumber !== checkpoint.nextPageNumber) {
    fail('invalid_transition', 'MEXC-Page gehört nicht zum erwarteten Capability-/Page-Checkpoint.')
  }
  if (observation.recordCount > checkpoint.scope.pageSize) fail('invalid_page_observation', 'MEXC-Page überschreitet die angefragte Pagegröße.')
  for (const timestamp of observation.orderedProviderTimes) {
    if (timestamp < checkpoint.scope.startTime || timestamp > checkpoint.scope.endTime) {
      fail('invalid_page_observation', 'MEXC-Page enthält einen Timestamp außerhalb des fixierten Scopes.')
    }
  }
  if (observation.providerPage && observation.providerPage.pageSize !== checkpoint.scope.pageSize) {
    fail('invalid_page_observation', 'MEXC-Provider-Pagegröße weicht vom fixierten Scope ab.')
  }

  const unitRequestAttempts = checkpoint.unitRequestAttempts + 1
  const totalRequestAttempts = checkpoint.totalRequestAttempts + 1
  const unitResponseBytes = checkpoint.unitResponseBytes + observation.rawBodyBytes
  const totalResponseBytes = checkpoint.totalResponseBytes + observation.rawBodyBytes
  const unitElapsedMs = checkpoint.unitElapsedMs + observation.requestDurationMs
  const totalElapsedMs = checkpoint.totalElapsedMs + observation.requestDurationMs
  const exceedsRemainingBudget =
    unitRequestAttempts > budget.maxRequestAttemptsPerWorkUnit
    || unitResponseBytes > budget.maxResponseBytesPerWorkUnit
    || unitElapsedMs > budget.maxElapsedMsPerWorkUnit
    || totalResponseBytes > budget.maxResponseBytesPerScope
    || totalElapsedMs > budget.maxElapsedMsPerScope
    || checkpoint.unitRawEvents + observation.recordCount > budget.maxRawEventsPerWorkUnit
    || checkpoint.totalRawEvents + observation.recordCount > budget.maxRawEventsPerScope
  if (exceedsRemainingBudget) {
    const blocked = sealCheckpoint({
      ...checkpoint,
      status: 'partial_failed',
      reason: 'response_exceeds_remaining_budget',
      unitRequestAttempts,
      totalRequestAttempts,
      unitResponseBytes,
      totalResponseBytes,
      unitElapsedMs,
      totalElapsedMs,
      lastErrorCode: null,
      suggestedBackoffMs: null,
    }, integrityKey)
    return Object.freeze({ checkpoint: blocked, action: 'stop_blocked', scopeCompleteness: 'partial' })
  }

  const repeatedCursor = checkpoint.lastCursor !== null
    && observation.cursor !== null
    && checkpoint.lastCursor.providerTime === observation.cursor.providerTime
    && checkpoint.lastCursor.providerId === observation.cursor.providerId
  if (repeatedCursor || checkpoint.seenPageFingerprints.includes(observation.pageFingerprint)) {
    const loop = sealCheckpoint({
      ...checkpoint,
      status: 'loop_blocked',
      reason: 'repeated_page_without_cursor_progress',
      unitRequestAttempts,
      totalRequestAttempts,
      unitResponseBytes,
      totalResponseBytes,
      unitElapsedMs,
      totalElapsedMs,
      lastErrorCode: null,
      suggestedBackoffMs: null,
    }, integrityKey)
    return Object.freeze({ checkpoint: loop, action: 'stop_blocked', scopeCompleteness: 'partial' })
  }

  if (
    checkpoint.lastCursor !== null
    && observation.orderedProviderTimes.length > 0
    && observation.orderedProviderTimes[0]! > checkpoint.lastCursor.providerTime
  ) {
    const blocked = sealCheckpoint({
      ...checkpoint,
      status: 'partial_failed',
      reason: 'cursor_progress_violation',
      unitRequestAttempts,
      totalRequestAttempts,
      unitResponseBytes,
      totalResponseBytes,
      unitElapsedMs,
      totalElapsedMs,
      lastErrorCode: null,
      suggestedBackoffMs: null,
      retryNotBeforeMs: null,
    }, integrityKey)
    return Object.freeze({ checkpoint: blocked, action: 'stop_blocked', scopeCompleteness: 'partial' })
  }

  const terminal = terminalEvidence(observation, checkpoint.scope.pageSize)
  const committed = sealCheckpoint({
    ...checkpoint,
    status: terminal === 'none' ? 'continue' : 'terminal_observed',
    reason: terminal === 'short_bare_array'
      ? 'terminal_short_bare_array'
      : terminal === 'provider_page_metadata'
        ? 'terminal_provider_page_metadata'
        : terminal === 'canonical_empty_page'
          ? 'terminal_canonical_empty_page'
          : 'page_committed',
    nextPageNumber: checkpoint.nextPageNumber + 1,
    unitSuccessfulPages: checkpoint.unitSuccessfulPages + 1,
    unitRequestAttempts,
    unitRawEvents: checkpoint.unitRawEvents + observation.recordCount,
    unitResponseBytes,
    unitElapsedMs,
    totalSuccessfulPages: checkpoint.totalSuccessfulPages + 1,
    totalRequestAttempts,
    totalRawEvents: checkpoint.totalRawEvents + observation.recordCount,
    totalResponseBytes,
    totalElapsedMs,
    authorityBlocked: true,
    terminalEvidence: terminal,
    lastCursor: observation.cursor ?? checkpoint.lastCursor,
    lastPageFingerprint: observation.pageFingerprint,
    seenPageFingerprints: [...checkpoint.seenPageFingerprints, observation.pageFingerprint],
    orderedProviderIdentitySequenceDigest: digestParts([
      'mexc-ordered-provider-identity-sequence-v1',
      checkpoint.orderedProviderIdentitySequenceDigest,
      ...observation.orderedProviderIds,
    ]),
    lastErrorCode: null,
    suggestedBackoffMs: null,
    retryNotBeforeMs: null,
  }, integrityKey)

  if (terminal !== 'none') {
    return Object.freeze({ checkpoint: committed, action: 'stop_terminal', scopeCompleteness: 'unverified' })
  }
  if (committed.nextPageNumber > 10_000) {
    const blocked = sealCheckpoint({
      ...committed,
      status: 'partial_failed',
      reason: 'provider_page_number_limit_reached',
    }, integrityKey)
    return Object.freeze({ checkpoint: blocked, action: 'stop_blocked', scopeCompleteness: 'partial' })
  }
  if (scopeBudgetReached(committed, budget)) {
    const yielded = sealCheckpoint({ ...committed, status: 'yielded', reason: 'scope_budget_reached' }, integrityKey)
    return Object.freeze({ checkpoint: yielded, action: 'yield', scopeCompleteness: 'partial' })
  }
  if (unitBudgetReached(committed, budget)) {
    const scopeExhausted = committed.workUnitSequence >= budget.maxWorkUnitsPerScope
    const yielded = sealCheckpoint({
      ...committed,
      status: 'yielded',
      reason: scopeExhausted ? 'scope_budget_reached' : 'work_unit_budget_reached',
    }, integrityKey)
    return Object.freeze({ checkpoint: yielded, action: 'yield', scopeCompleteness: 'partial' })
  }
  return Object.freeze({ checkpoint: committed, action: 'request_next_page', scopeCompleteness: 'unverified' })
}

export function recordMexcPageFailure(
  checkpoint: MexcPageCheckpoint,
  failure: Readonly<{
    errorCode: MexcTransportErrorCode
    requestDurationMs: number
    responseBodyBytes: number
  }>,
  integrityKey: MexcCheckpointIntegrityKey,
  budgetInput: MexcPageBudgetProfile = MEXC_PAGE_BUDGET_PROFILE_V1,
): MexcPageTransition {
  const budget = validateBudgetProfile(budgetInput)
  assertCheckpoint(checkpoint, budget, integrityKey)
  activeCheckpoint(checkpoint)
  if (!Object.prototype.hasOwnProperty.call(MEXC_TRANSPORT_ERROR_POLICY, failure.errorCode)) {
    fail('invalid_page_observation', 'Unbekannte MEXC-Transportfehlerklasse.')
  }
  const requestDurationMs = assertSafeInteger(failure.requestDurationMs, 0, 60_000, 'failure.requestDurationMs')
  const responseBodyBytes = assertSafeInteger(failure.responseBodyBytes, 0, MEXC_MAX_RESPONSE_BYTES, 'failure.responseBodyBytes')
  const unitRequestAttempts = checkpoint.unitRequestAttempts + 1
  const totalRequestAttempts = checkpoint.totalRequestAttempts + 1
  const unitResponseBytes = checkpoint.unitResponseBytes + responseBodyBytes
  const totalResponseBytes = checkpoint.totalResponseBytes + responseBodyBytes
  const unitElapsedMs = checkpoint.unitElapsedMs + requestDurationMs
  const totalElapsedMs = checkpoint.totalElapsedMs + requestDurationMs
  if (
    unitResponseBytes > budget.maxResponseBytesPerWorkUnit
    || totalResponseBytes > budget.maxResponseBytesPerScope
  ) {
    const blocked = sealCheckpoint({
      ...checkpoint,
      status: 'partial_failed',
      reason: 'response_exceeds_remaining_budget',
      unitRequestAttempts,
      unitResponseBytes,
      unitElapsedMs,
      totalRequestAttempts,
      totalResponseBytes,
      totalElapsedMs,
      lastErrorCode: null,
      suggestedBackoffMs: null,
      retryNotBeforeMs: null,
    }, integrityKey)
    return Object.freeze({ checkpoint: blocked, action: 'stop_blocked', scopeCompleteness: 'partial' })
  }
  const retryable = BOUNDED_BACKOFF_ERRORS.has(failure.errorCode)
  const deferred = failure.errorCode === 'maintenance'
  const nextRetryIndex = checkpoint.unitRetryCount
  const backoff = budget.retryBackoffMs[nextRetryIndex] ?? null
  const retryAllowed = retryable
    && backoff !== null
    && checkpoint.unitRetryCount < budget.maxRetriesPerWorkUnit
    && unitRequestAttempts < budget.maxRequestAttemptsPerWorkUnit
    && unitResponseBytes < budget.maxResponseBytesPerWorkUnit
    && unitElapsedMs + (backoff ?? 0) < budget.maxElapsedMsPerWorkUnit
    && totalResponseBytes < budget.maxResponseBytesPerScope
    && totalElapsedMs + (backoff ?? 0) < budget.maxElapsedMsPerScope

  if (retryAllowed) {
    const retryNotBeforeMs = trustedNowMs() + backoff
    const retry = sealCheckpoint({
      ...checkpoint,
      status: 'retry_pending',
      reason: 'retry_scheduled',
      unitRequestAttempts,
      unitResponseBytes,
      unitElapsedMs: unitElapsedMs + backoff,
      unitRetryCount: checkpoint.unitRetryCount + 1,
      unitBackoffMs: checkpoint.unitBackoffMs + backoff,
      totalRequestAttempts,
      totalResponseBytes,
      totalElapsedMs: totalElapsedMs + backoff,
      lastErrorCode: failure.errorCode,
      suggestedBackoffMs: backoff,
      retryNotBeforeMs,
    }, integrityKey)
    return Object.freeze({ checkpoint: retry, action: 'retry_after_backoff', scopeCompleteness: 'partial' })
  }

  const status: MexcPageCheckpointStatus = 'partial_failed'
  const failureBudgetReached = retryable && (
    unitRequestAttempts >= budget.maxRequestAttemptsPerWorkUnit
    || unitResponseBytes >= budget.maxResponseBytesPerWorkUnit
    || unitElapsedMs >= budget.maxElapsedMsPerWorkUnit
    || totalResponseBytes >= budget.maxResponseBytesPerScope
    || totalElapsedMs >= budget.maxElapsedMsPerScope
  )
  const stopped = sealCheckpoint({
    ...checkpoint,
    status,
    reason: deferred
      ? 'provider_retry_deferred'
      : failureBudgetReached
        ? 'failure_budget_reached'
        : retryable
          ? 'retry_budget_reached'
          : 'non_retryable_failure',
    unitRequestAttempts,
    unitResponseBytes,
    unitElapsedMs,
    totalRequestAttempts,
    totalResponseBytes,
    totalElapsedMs,
    lastErrorCode: failure.errorCode,
    suggestedBackoffMs: null,
    retryNotBeforeMs: null,
  }, integrityKey)
  return Object.freeze({ checkpoint: stopped, action: 'stop_blocked', scopeCompleteness: 'partial' })
}

export function resumeMexcPageCheckpoint(
  checkpoint: MexcPageCheckpoint,
  expectedCheckpointMac: string,
  integrityKey: MexcCheckpointIntegrityKey,
  budgetInput: MexcPageBudgetProfile = MEXC_PAGE_BUDGET_PROFILE_V1,
): MexcPageCheckpoint {
  const budget = validateBudgetProfile(budgetInput)
  assertCheckpoint(checkpoint, budget, integrityKey)
  if (typeof expectedCheckpointMac !== 'string' || !SHA256_PATTERN.test(expectedCheckpointMac)) {
    fail('checkpoint_mismatch', 'Erwarteter MEXC-Checkpoint-MAC ist ungültig.')
  }
  if (!timingSafeEqual(Buffer.from(checkpoint.checkpointMac, 'hex'), Buffer.from(expectedCheckpointMac, 'hex'))) {
    fail('checkpoint_mismatch', 'Erwarteter und tatsächlicher MEXC-Checkpoint stimmen nicht überein.')
  }
  if (checkpoint.status === 'retry_pending') {
    if (checkpoint.retryNotBeforeMs === null || trustedNowMs() < checkpoint.retryNotBeforeMs) {
      fail('invalid_transition', 'MEXC-Retry darf nicht vor dem serverseitigen Not-before-Zeitpunkt fortgesetzt werden.')
    }
    return sealCheckpoint({
      ...checkpoint,
      status: 'ready',
      reason: 'resumed_same_work_unit',
      suggestedBackoffMs: null,
      retryNotBeforeMs: null,
    }, integrityKey)
  }
  if (checkpoint.status !== 'yielded') fail('invalid_transition', 'Nur yielded oder retry_pending Checkpoints sind resumable.')
  if (checkpoint.reason === 'scope_budget_reached' || scopeBudgetReached(checkpoint, budget)) {
    fail('invalid_transition', 'Ein ausgeschöpfter Scope darf nicht als neue Work Unit fortgesetzt werden.')
  }
  if (checkpoint.workUnitSequence >= budget.maxWorkUnitsPerScope) {
    fail('invalid_transition', 'MEXC-Scope besitzt kein weiteres Work-Unit-Budget.')
  }
  return sealCheckpoint({
    ...checkpoint,
    status: 'ready',
    reason: 'continued_in_new_work_unit',
    workUnitSequence: checkpoint.workUnitSequence + 1,
    unitSuccessfulPages: 0,
    unitRequestAttempts: 0,
    unitRawEvents: 0,
    unitResponseBytes: 0,
    unitElapsedMs: 0,
    unitRetryCount: 0,
    unitBackoffMs: 0,
    lastErrorCode: null,
    suggestedBackoffMs: null,
    retryNotBeforeMs: null,
  }, integrityKey)
}

export function verifyMexcPageCheckpoint(
  checkpoint: MexcPageCheckpoint,
  integrityKey: MexcCheckpointIntegrityKey,
  budgetInput: MexcPageBudgetProfile = MEXC_PAGE_BUDGET_PROFILE_V1,
) {
  const budget = validateBudgetProfile(budgetInput)
  assertCheckpoint(checkpoint, budget, integrityKey)
  return true
}

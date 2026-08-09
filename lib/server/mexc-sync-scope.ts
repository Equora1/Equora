import 'server-only'

import {
  BROKER_RAW_CAPTURE_PROVIDER_PROFILES,
  type BrokerAccountIdentityReference,
} from '@/lib/server/broker-raw-ledger'
import {
  digestEquoraTcj,
  tcjBytes,
  tcjEnum,
  tcjInstant,
  tcjInteger,
  tcjNull,
  tcjObject,
  tcjString,
  type EquoraTcjDigest,
  type EquoraTcjValue,
} from '@/lib/server/equora-tcj'
import type { MexcPagedCapabilityId } from '@/lib/server/mexc-pagination'

export const MEXC_SYNC_SCOPE_VERSION = 'mexc-sync-scope-v1' as const

export type MexcSyncLaneId =
  | 'onboarding_once'
  | 'incremental_fast_6h'
  | 'rolling_audit_7d_daily'
  | 'rolling_audit_28d_weekly'

export type MexcSyncOverlapPolicy =
  | 'bounded_available_history_v1'
  | 'minimum_72h_v1'
  | 'closed_bucket_full_window_v1'

export type MexcSyncScopeInput = Readonly<{
  providerCode: 'mexc'
  accountIdentity: BrokerAccountIdentityReference
  brokerAccountId: string
  syncActivationId: string
  activationGeneration: number
  capabilityId: MexcPagedCapabilityId
  instrumentScope: Readonly<{
    scopeType: 'mexc_futures_symbol_v1'
    symbol: string
    positionType: 1 | 2 | null
  }>
  providerContractVersion: 'mexc_futures_contract_v1'
  adapterVersion: 'v57_61_0'
  sourceChannel: 'provider_api_observation'
  profileId: 'mexc_futures_rest'
  profileVersion: 'v1'
  laneId: MexcSyncLaneId
  requestWindow: Readonly<{
    startTimeMs: number
    endTimeMs: number
  }>
  bucket: Readonly<{
    startTimeMs: number
    endTimeMs: number
  }>
  boundaryPolicyVersion: 'mexc_provider_unverified_overlap_v1'
  boundarySemantics: 'provider_unverified'
  overlapPolicy: MexcSyncOverlapPolicy
  scopeGeneration: number
  stabilityGeneration: number
  coverageBasis: 'provider_observed'
  coveragePolicy: 'provider_observed_best_effort'
  scopeCompleteness: 'unverified' | 'partial'
  stabilityStatus: 'not_observed' | 'invalidated'
  digestVersion: 'equora-tcj-v1'
}>

export type MexcSyncScope = Readonly<MexcSyncScopeInput & {
  scopeVersion: typeof MEXC_SYNC_SCOPE_VERSION
  endpointId: string
  stabilityBucketDigest: EquoraTcjDigest<'stability_bucket_identity'>
  scopeDigest: EquoraTcjDigest<'sync_scope'>
  authorityBlocked: true
}>

export type MexcAuthoritySyncScopeInput = Readonly<{
  providerCode: 'mexc'
  accountIdentity: BrokerAccountIdentityReference
  brokerAccountId: string
  syncActivationId: string
  activationGeneration: number
  capabilityId: MexcPagedCapabilityId
  instrumentScope: Readonly<{
    scopeType: 'mexc_futures_symbol_v1'
    symbol: string
    positionType: 1 | 2 | null
  }>
  providerContractVersion: 'mexc_futures_contract_v1'
  adapterVersion: 'v57_61_0'
  profileId: 'mexc_futures_rest'
  profileVersion: 'v1'
  requestWindow: Readonly<{ startTimeMs: number; endTimeMs: number }>
  scopeDigest: string
}>

export type MexcAuthoritySyncScope = Readonly<Omit<MexcAuthoritySyncScopeInput, 'scopeDigest'> & {
  scopeVersion: 'broker-request-scope-v2'
  sourceChannel: 'provider_api_observation'
  endpointId: string
  scopeDigest: EquoraTcjDigest<'sync_scope'>
  authorityBlocked: true
}>

export type MexcCaptureScope = MexcSyncScope | MexcAuthoritySyncScope

export class MexcSyncScopeError extends Error {
  constructor(
    public readonly code:
      | 'invalid_structure'
      | 'invalid_identity'
      | 'invalid_profile'
      | 'invalid_instrument'
      | 'invalid_window'
      | 'invalid_lane'
      | 'invalid_status',
    message: string,
  ) {
    super(message)
    this.name = 'MexcSyncScopeError'
  }
}

const PROFILE = BROKER_RAW_CAPTURE_PROVIDER_PROFILES.mexc
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SYMBOL_PATTERN = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/
const DAY_MS = 24 * 60 * 60 * 1_000
const MAX_HISTORY_WINDOW_MS = 31 * DAY_MS

const LANE_POLICY = Object.freeze({
  onboarding_once: Object.freeze({ overlapPolicy: 'bounded_available_history_v1' as const, minimumSpanMs: 0, exactUtcDays: null }),
  incremental_fast_6h: Object.freeze({ overlapPolicy: 'minimum_72h_v1' as const, minimumSpanMs: 72 * 60 * 60 * 1_000, exactUtcDays: null }),
  rolling_audit_7d_daily: Object.freeze({ overlapPolicy: 'closed_bucket_full_window_v1' as const, minimumSpanMs: 0, exactUtcDays: 7 }),
  rolling_audit_28d_weekly: Object.freeze({ overlapPolicy: 'closed_bucket_full_window_v1' as const, minimumSpanMs: 0, exactUtcDays: 28 }),
})

function fail(code: MexcSyncScopeError['code'], message: string): never {
  throw new MexcSyncScopeError(code, message)
}

function exactKeys(input: object, expected: readonly string[], label: string) {
  const actual = Object.keys(input).sort()
  const canonicalExpected = [...expected].sort()
  if (actual.length !== canonicalExpected.length || actual.some((key, index) => key !== canonicalExpected[index])) {
    fail('invalid_structure', `${label} enthält unbekannte oder fehlende Felder.`)
  }
}

function safeInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('invalid_structure', `${label} liegt außerhalb des zulässigen Integerbereichs.`)
  }
  return value as number
}

function uuid(value: unknown, label: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) fail('invalid_identity', `${label} ist keine kanonische UUID.`)
  return value
}

function validateAccountIdentity(input: BrokerAccountIdentityReference) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('invalid_identity', 'Account-Identity-Referenz fehlt.')
  }
  exactKeys(
    input,
    ['digest', 'digestAlgorithm', 'digestContractVersion', 'keyVersion', 'purpose', 'verificationStatus'],
    'Account-Identity-Referenz',
  )
  if (
    input.digestAlgorithm !== 'hmac-sha256'
    || input.digestContractVersion !== 'equora-tcj-v1'
    || input.purpose !== 'broker_account_identity_v1'
    || input.verificationStatus !== 'unverified_reference'
    || typeof input.keyVersion !== 'string'
    || !/^[a-z][a-z0-9_]{0,62}$/.test(input.keyVersion)
    || typeof input.digest !== 'string'
    || !SHA256_PATTERN.test(input.digest)
  ) fail('invalid_identity', 'Account-Identity-Referenz verletzt den geschlossenen G1-Vertrag.')
  return Object.freeze({ ...input })
}

function validateInstrument(capabilityId: MexcPagedCapabilityId, input: MexcSyncScopeInput['instrumentScope']) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('invalid_instrument', 'Instrument-Scope fehlt.')
  }
  exactKeys(input, ['positionType', 'scopeType', 'symbol'], 'Instrument-Scope')
  if (input.scopeType !== 'mexc_futures_symbol_v1' || typeof input.symbol !== 'string' || !SYMBOL_PATTERN.test(input.symbol)) {
    fail('invalid_instrument', 'Instrument-Scope verletzt den MEXC-v1-Vertrag.')
  }
  const requiresPositionType = capabilityId === 'historical_positions_v1' || capabilityId === 'funding_records_v1'
  if (requiresPositionType ? input.positionType !== 1 && input.positionType !== 2 : input.positionType !== null) {
    fail('invalid_instrument', 'Position-Type passt nicht zur MEXC-Capability.')
  }
  return Object.freeze({ ...input })
}

function validateWindow(input: MexcSyncScopeInput['requestWindow']) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_window', 'Abruffenster fehlt.')
  exactKeys(input, ['endTimeMs', 'startTimeMs'], 'Abruffenster')
  const startTimeMs = safeInteger(input.startTimeMs, 1_000_000_000_000, 9_999_999_999_999, 'requestWindow.startTimeMs')
  const endTimeMs = safeInteger(input.endTimeMs, 1_000_000_000_000, 9_999_999_999_999, 'requestWindow.endTimeMs')
  if (startTimeMs > endTimeMs || endTimeMs - startTimeMs > MAX_HISTORY_WINDOW_MS) {
    fail('invalid_window', 'Abruffenster ist nicht geschlossen oder überschreitet 31 Tage.')
  }
  return Object.freeze({ startTimeMs, endTimeMs })
}

function validateBucket(input: MexcSyncScopeInput['bucket'], requestWindow: MexcSyncScopeInput['requestWindow']) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_window', 'Stabilitätsbucket fehlt.')
  exactKeys(input, ['endTimeMs', 'startTimeMs'], 'Stabilitätsbucket')
  const startTimeMs = safeInteger(input.startTimeMs, 1_000_000_000_000, 9_999_999_999_999, 'bucket.startTimeMs')
  const endTimeMs = safeInteger(input.endTimeMs, 1_000_000_000_000, 9_999_999_999_999, 'bucket.endTimeMs')
  if (
    startTimeMs % DAY_MS !== 0
    || endTimeMs - startTimeMs !== DAY_MS
    || requestWindow.startTimeMs > startTimeMs
    || requestWindow.endTimeMs < endTimeMs - 1
  ) fail('invalid_window', 'Stabilitätsbucket ist kein vollständig abgedecktes unveränderliches UTC-Tagessegment.')
  return Object.freeze({ startTimeMs, endTimeMs })
}

function instantFromMs(value: number) {
  return tcjInstant(String(BigInt(value) * BigInt(1_000)))
}

function digestValue(value: EquoraTcjDigest): EquoraTcjValue {
  return tcjObject([
    ['digest_algorithm', tcjEnum(value.digestAlgorithm)],
    ['digest_contract_version', tcjString(value.digestContractVersion)],
    ['domain', tcjEnum(value.domain)],
    ['digest', tcjBytes(value.digest)],
  ])
}

function accountIdentityValue(value: BrokerAccountIdentityReference) {
  return tcjObject([
    ['digest_algorithm', tcjString(value.digestAlgorithm)],
    ['digest_contract_version', tcjString(value.digestContractVersion)],
    ['purpose', tcjEnum(value.purpose)],
    ['key_version', tcjString(value.keyVersion)],
    ['digest', tcjBytes(value.digest)],
    ['verification_status', tcjEnum(value.verificationStatus)],
  ])
}

export function createMexcSyncScope(input: MexcSyncScopeInput): MexcSyncScope {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_structure', 'MEXC Sync Scope fehlt.')
  exactKeys(input, [
    'accountIdentity',
    'activationGeneration',
    'adapterVersion',
    'boundaryPolicyVersion',
    'boundarySemantics',
    'brokerAccountId',
    'bucket',
    'capabilityId',
    'coverageBasis',
    'coveragePolicy',
    'digestVersion',
    'instrumentScope',
    'laneId',
    'overlapPolicy',
    'profileId',
    'profileVersion',
    'providerCode',
    'providerContractVersion',
    'requestWindow',
    'scopeCompleteness',
    'scopeGeneration',
    'sourceChannel',
    'stabilityGeneration',
    'stabilityStatus',
    'syncActivationId',
  ], 'MEXC Sync Scope')

  const accountIdentity = validateAccountIdentity(input.accountIdentity)
  const brokerAccountId = uuid(input.brokerAccountId, 'brokerAccountId')
  const syncActivationId = uuid(input.syncActivationId, 'syncActivationId')
  const activationGeneration = safeInteger(input.activationGeneration, 1, 2_147_483_647, 'activationGeneration')
  const scopeGeneration = safeInteger(input.scopeGeneration, 1, 2_147_483_647, 'scopeGeneration')
  const stabilityGeneration = safeInteger(input.stabilityGeneration, 1, 2_147_483_647, 'stabilityGeneration')

  if (input.providerCode !== 'mexc' || !Object.prototype.hasOwnProperty.call(PROFILE.capabilities, input.capabilityId)) {
    fail('invalid_profile', 'Provider oder Capability gehört nicht zum geschlossenen MEXC-v1-Profil.')
  }
  const capability = PROFILE.capabilities[input.capabilityId]
  if (
    input.providerContractVersion !== PROFILE.providerContractVersion
    || input.adapterVersion !== PROFILE.adapterVersion
    || input.sourceChannel !== 'provider_api_observation'
    || input.profileId !== PROFILE.sourceProfileId
    || input.profileVersion !== PROFILE.sourceProfileVersion
    || input.boundaryPolicyVersion !== 'mexc_provider_unverified_overlap_v1'
    || input.boundarySemantics !== 'provider_unverified'
    || input.coverageBasis !== 'provider_observed'
    || input.coveragePolicy !== 'provider_observed_best_effort'
    || input.digestVersion !== 'equora-tcj-v1'
  ) fail('invalid_profile', 'MEXC Sync Scope besitzt abweichende Profil- oder Policyversionen.')

  if (!Object.prototype.hasOwnProperty.call(LANE_POLICY, input.laneId)) fail('invalid_lane', 'MEXC Sync Scope besitzt keine freigegebene API-Lane.')
  const lanePolicy = LANE_POLICY[input.laneId]
  if (input.overlapPolicy !== lanePolicy.overlapPolicy) fail('invalid_lane', 'Lane und Overlap-Policy widersprechen sich.')

  const instrumentScope = validateInstrument(input.capabilityId, input.instrumentScope)
  const requestWindow = validateWindow(input.requestWindow)
  const bucket = validateBucket(input.bucket, requestWindow)
  const requestSpanMs = requestWindow.endTimeMs - requestWindow.startTimeMs
  if (requestSpanMs < lanePolicy.minimumSpanMs) {
    fail('invalid_lane', 'Abruffenster unterschreitet die konservative Mindestspanne der gewählten Lane.')
  }
  if (
    lanePolicy.exactUtcDays !== null
    && (
      requestWindow.startTimeMs % DAY_MS !== 0
      || (requestWindow.endTimeMs + 1) % DAY_MS !== 0
      || requestSpanMs + 1 !== lanePolicy.exactUtcDays * DAY_MS
    )
  ) {
    fail('invalid_lane', 'Auditlane benötigt exakt die geforderte Anzahl vollständig ausgerichteter UTC-Tage.')
  }
  if (input.scopeCompleteness !== 'unverified' && input.scopeCompleteness !== 'partial') {
    fail('invalid_status', 'G1 Sync Scope darf keine positive Vollständigkeit behaupten.')
  }
  if (input.stabilityStatus !== 'not_observed' && input.stabilityStatus !== 'invalidated') {
    fail('invalid_status', 'G1 Sync Scope darf keine positive Stabilität behaupten.')
  }
  if (input.stabilityStatus === 'invalidated' && input.scopeCompleteness !== 'partial') {
    fail('invalid_status', 'Invalidierte Stabilität benötigt einen partiellen Scope.')
  }

  const positionTypeValue = instrumentScope.positionType === null
    ? tcjNull()
    : tcjInteger(String(instrumentScope.positionType))
  const stabilityBucketValue = tcjObject([
    ['identity_contract', tcjEnum('stability_bucket_identity_v1')],
    ['provider', tcjEnum('mexc')],
    ['account_identity', accountIdentityValue(accountIdentity)],
    ['broker_account_id', tcjString(brokerAccountId)],
    ['sync_activation_id', tcjString(syncActivationId)],
    ['activation_generation', tcjInteger(String(activationGeneration))],
    ['capability_id', tcjString(input.capabilityId)],
    ['instrument_scope', tcjObject([
      ['scope_type', tcjEnum(instrumentScope.scopeType)],
      ['symbol', tcjString(instrumentScope.symbol)],
      ['position_type', positionTypeValue],
    ])],
    ['provider_contract_version', tcjString(input.providerContractVersion)],
    ['adapter_version', tcjString(input.adapterVersion)],
    ['profile_id', tcjString(input.profileId)],
    ['profile_version', tcjString(input.profileVersion)],
    ['boundary_policy_version', tcjString(input.boundaryPolicyVersion)],
    ['bucket_start', instantFromMs(bucket.startTimeMs)],
    ['bucket_end', instantFromMs(bucket.endTimeMs)],
    ['digest_version', tcjString(input.digestVersion)],
  ])
  const stabilityBucketDigest = digestEquoraTcj('stability_bucket_identity', stabilityBucketValue)
  const scopeValue = tcjObject([
    ['scope_contract', tcjString(MEXC_SYNC_SCOPE_VERSION)],
    ['stability_bucket_identity', stabilityBucketValue],
    ['stability_bucket_digest', digestValue(stabilityBucketDigest)],
    ['source_channel', tcjEnum(input.sourceChannel)],
    ['lane_id', tcjEnum(input.laneId)],
    ['request_window', tcjObject([
      ['start_time', instantFromMs(requestWindow.startTimeMs)],
      ['end_time', instantFromMs(requestWindow.endTimeMs)],
    ])],
    ['boundary_semantics', tcjEnum(input.boundarySemantics)],
    ['overlap_policy', tcjEnum(input.overlapPolicy)],
    ['scope_generation', tcjInteger(String(scopeGeneration))],
  ])
  const scopeDigest = digestEquoraTcj('sync_scope', scopeValue)

  return Object.freeze({
    ...input,
    accountIdentity,
    brokerAccountId,
    syncActivationId,
    activationGeneration,
    instrumentScope,
    requestWindow,
    bucket,
    scopeGeneration,
    stabilityGeneration,
    scopeVersion: MEXC_SYNC_SCOPE_VERSION,
    endpointId: capability.endpointId,
    stabilityBucketDigest,
    scopeDigest,
    authorityBlocked: true,
  })
}

export function createMexcAuthoritySyncScope(
  input: MexcAuthoritySyncScopeInput,
): MexcAuthoritySyncScope {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('invalid_structure', 'Autoritativer MEXC Request Scope fehlt.')
  }
  exactKeys(input, [
    'accountIdentity',
    'activationGeneration',
    'adapterVersion',
    'brokerAccountId',
    'capabilityId',
    'instrumentScope',
    'profileId',
    'profileVersion',
    'providerCode',
    'providerContractVersion',
    'requestWindow',
    'scopeDigest',
    'syncActivationId',
  ], 'Autoritativer MEXC Request Scope')
  const accountIdentity = validateAccountIdentity(input.accountIdentity)
  const brokerAccountId = uuid(input.brokerAccountId, 'brokerAccountId')
  const syncActivationId = uuid(input.syncActivationId, 'syncActivationId')
  const activationGeneration = safeInteger(
    input.activationGeneration,
    1,
    2_147_483_647,
    'activationGeneration',
  )
  if (
    input.providerCode !== 'mexc'
    || input.providerContractVersion !== PROFILE.providerContractVersion
    || input.adapterVersion !== PROFILE.adapterVersion
    || input.profileId !== PROFILE.sourceProfileId
    || input.profileVersion !== PROFILE.sourceProfileVersion
    || !Object.prototype.hasOwnProperty.call(PROFILE.capabilities, input.capabilityId)
    || typeof input.scopeDigest !== 'string'
    || !SHA256_PATTERN.test(input.scopeDigest)
  ) fail('invalid_profile', 'Autoritativer MEXC Request Scope verletzt die gepinnten Profile.')
  const instrumentScope = validateInstrument(input.capabilityId, input.instrumentScope)
  const requestWindow = validateWindow(input.requestWindow)
  return Object.freeze({
    ...input,
    accountIdentity,
    brokerAccountId,
    syncActivationId,
    activationGeneration,
    instrumentScope,
    requestWindow,
    scopeVersion: 'broker-request-scope-v2',
    sourceChannel: 'provider_api_observation',
    endpointId: PROFILE.capabilities[input.capabilityId].endpointId,
    scopeDigest: Object.freeze({
      digestAlgorithm: 'sha256',
      digestContractVersion: 'equora-tcj-v1',
      domain: 'sync_scope',
      digest: input.scopeDigest,
    }),
    authorityBlocked: true,
  })
}

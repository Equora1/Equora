import 'server-only'

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { isProxy } from 'node:util/types'
import { computeCanonicalBrokerValueDigest, type CanonicalJsonValue } from '@/lib/server/broker-core-contracts'
import { canonicalizeBrokerEgressIpSet } from '@/lib/server/broker-ip-address'
import {
  OKX_EEA_DEMO_ORIGIN,
  OKX_PROFILE_CAPABILITY_DIGESTS,
  OKX_PROFILE_DIGEST,
  OKX_PROFILE_ID,
  OKX_PROFILE_VERSION,
  OKX_PROVIDER_CONTRACT_VERSION,
  OkxCandidateError,
  createOkxMinimalProbeResponseInspector,
  type OkxAccountConfigRecord,
  type OkxInspectedProbeResponse,
  type OkxMinimalProbeCapabilityId,
} from '@/lib/server/providers/okx-readonly-adapter'

export const inspectOkxSyntheticMinimalProbeResponse = createOkxMinimalProbeResponseInspector(isProxy)

const NATIVE_FUNCTION_CALL = (() => undefined).call

export type OkxCandidateRuntimeMode = 'off' | 'synthetic_test'

export type OkxSyntheticAuthority = Readonly<{
  authorityContractVersion: 'equora-okx-synthetic-probe-authority-v1'
  authorityDigest: string
  accountConnectionId: string
  setupCommandId: string
  setupRowVersion: number
  environment: 'demo'
  regionProfileId: 'okx-eea-demo-v1'
  httpsOrigin: typeof OKX_EEA_DEMO_ORIGIN
  providerContractVersion: typeof OKX_PROVIDER_CONTRACT_VERSION
  profileId: typeof OKX_PROFILE_ID
  profileVersion: typeof OKX_PROFILE_VERSION
  profileDigest: typeof OKX_PROFILE_DIGEST
  identityKeyVersion: string
  expectedAccountIdentityDigest: string
  permissionAttestationDigest: string
  expectedProviderProjectionDigest: string
  authorizedEgressIpSet: readonly string[]
  authorizedEgressIpSetDigest: string
  accountMfaAttested: true
  accountMfaAttestationDigest: string
  incidentStatus: 'clear'
  incidentClearAttestationDigest: string
  windowStartMs: string
  windowEndMs: string
  absoluteDeadlineAt: string
  maximumRequests: 3
  maximumTotalResponseBytes: 1_048_576
  maximumDurationMs: 15_000
  maximumParallelRequests: 1
  maximumRetries: 0
}>

export type OkxSyntheticPermit = Readonly<{
  permitId: string
  accountConnectionId: string
  setupCommandId: string
  setupRowVersion: number
  identityKeyVersion: string
  permissionAttestationSha256: string
  expectedProviderPermAndIpProjectionSha256: string
  expectedAccountIdentitySha256: string
  authorizedEgressIpSetSha256: string
  accountMfaAttestationSha256: string
  incidentClearAttestationSha256: string
  authorityGeneration: 1 | 2 | 3
  predecessorResponseEvidenceSha256: string | null
  observedProviderPermAndIpProjectionSha256: string | null
  observedAccountIdentitySha256: string | null
  requestId: 'probe_account_config' | 'probe_account_instruments' | 'probe_fills_history'
  requestSequence: 1 | 2 | 3
  capabilityId: OkxMinimalProbeCapabilityId
  capabilityDescriptorSha256: string
  providerContractVersion: typeof OKX_PROVIDER_CONTRACT_VERSION
  profileDigestSha256: typeof OKX_PROFILE_DIGEST
  authoritySnapshotSha256: string
  environment: 'demo'
  httpsOrigin: typeof OKX_EEA_DEMO_ORIGIN
  port: 443
  method: 'GET'
  pathWithCanonicalQuery: string
  headerNameSetSha256: string
  requestDescriptorSha256: string
  windowStartMs: string
  windowEndMs: string
  responseByteLimit: number
  requestTimeoutMs: 4_000
  totalRequestBudget: 3
  totalResponseByteBudget: 1_048_576
  issuedAt: string
  deadlineAt: string
  state: 'issued_unconsumed'
  consumptionCount: 0
}>

export type OkxSyntheticPermitIssueRequest = Readonly<{
  issueContractVersion: 'equora-okx-synthetic-permit-issue-transition-v2'
  authority: OkxSyntheticAuthority
  authorityGeneration: 2 | 3
  requestId: 'probe_account_instruments' | 'probe_fills_history'
  requestSequence: 2 | 3
  capabilityId: 'okx_account_instruments_swap_v1' | 'okx_fills_history_swap_v1'
  predecessorResponseEvidenceDigest: string
  observedProviderProjectionDigest: string
  observedAccountIdentityDigest: string
  predecessorResponseReceivedAt: string
  predecessorPermitReceipt: OkxSyntheticPermitReceipt
}>

export type OkxSyntheticPermitReceipt = Readonly<{
  receiptContractVersion: 'equora-okx-synthetic-permit-receipt-v2'
  permitId: string
  permitSha256: string
  authoritySnapshotSha256: string
  requestId: OkxSyntheticPermit['requestId']
  requestSequence: OkxSyntheticPermit['requestSequence']
  state: 'consumed'
  consumptionCount: 1
  consumedAt: string
  transactionId: string
}>

export interface OkxSyntheticPermitControlPlane {
  issuePermitForAcceptedTransition(request: OkxSyntheticPermitIssueRequest): Promise<OkxSyntheticPermit>
  consumePermitAtomically(permit: OkxSyntheticPermit): Promise<OkxSyntheticPermitReceipt>
}

export interface OkxTrustedClock {
  nowEpochMs(): number
}

export type OkxSyntheticResponse = Readonly<{
  transportKind: 'synthetic_fixture_no_network'
  requestId: OkxSyntheticPermit['requestId']
  requestSequence: OkxSyntheticPermit['requestSequence']
  capabilityId: OkxMinimalProbeCapabilityId
  httpStatus: number
  rawBody: readonly number[]
  requestStartedAt: string
  responseReceivedAt: string
}>

export type OkxSyntheticProbeInput = Readonly<{
  runtimeMode: OkxCandidateRuntimeMode
  authority: OkxSyntheticAuthority
  identityKeyMaterial: Uint8Array
  initialPermit: OkxSyntheticPermit
  responses: readonly OkxSyntheticResponse[]
}>

export type OkxSyntheticProbeResult = Readonly<{
  resultContractVersion: 'equora-okx-synthetic-probe-result-v1'
  status: 'synthetic_pass'
  runtimeMode: 'synthetic_test'
  transportKind: 'synthetic_fixture_no_network'
  providerCode: 'okx'
  providerContractVersion: typeof OKX_PROVIDER_CONTRACT_VERSION
  profileDigest: typeof OKX_PROFILE_DIGEST
  accountClass: 'main' | 'subaccount'
  positionMode: 'net_mode' | 'long_short_mode'
  providerReportedReadOnlyObserved: true
  providerReportedIpSetMatched: true
  accountIdentityMatched: true
  selectedInstrumentCount: number
  observedFillCount: number
  observedResponseBytes: number
  responseEvidenceDigests: readonly [string, string, string]
  permitsConsumed: 3
  connectionActivated: false
  credentialsPersisted: false
  captureStarted: false
  importStarted: false
  providerSupportedClaim: false
  productionReadyClaim: false
  commercialUseAuthorizedClaim: false
}>

const RUNTIME_DISABLED_MESSAGE = 'OKX-Kandidatenruntime ist außerhalb eines expliziten synthetischen Tests deaktiviert.'
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const CANONICAL_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const CLOSED_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const WINDOW_MAX_MS = BigInt(7 * 24 * 60 * 60 * 1_000)
export const OKX_SYNTHETIC_HEADER_NAME_SET_DIGEST = '5dec9bbc6c65308d45898d56823142782b77dbac08d479d63d1b264cdd76e466'

const AUTHORITY_KEYS = [
  'authorityContractVersion', 'authorityDigest', 'accountConnectionId', 'setupCommandId', 'setupRowVersion',
  'environment', 'regionProfileId', 'httpsOrigin', 'providerContractVersion', 'profileId', 'profileVersion',
  'profileDigest', 'identityKeyVersion', 'expectedAccountIdentityDigest', 'permissionAttestationDigest',
  'expectedProviderProjectionDigest', 'authorizedEgressIpSet', 'authorizedEgressIpSetDigest',
  'accountMfaAttested', 'accountMfaAttestationDigest', 'incidentStatus', 'incidentClearAttestationDigest',
  'windowStartMs', 'windowEndMs', 'absoluteDeadlineAt', 'maximumRequests', 'maximumTotalResponseBytes',
  'maximumDurationMs', 'maximumParallelRequests', 'maximumRetries',
] as const
const AUTHORITY_DIGEST_INPUT_KEYS = AUTHORITY_KEYS.filter((key) => key !== 'authorityDigest')

const PERMIT_KEYS = [
  'permitId', 'accountConnectionId', 'setupCommandId', 'setupRowVersion', 'identityKeyVersion',
  'permissionAttestationSha256', 'expectedProviderPermAndIpProjectionSha256', 'expectedAccountIdentitySha256',
  'authorizedEgressIpSetSha256', 'accountMfaAttestationSha256', 'incidentClearAttestationSha256',
  'authorityGeneration', 'predecessorResponseEvidenceSha256', 'observedProviderPermAndIpProjectionSha256',
  'observedAccountIdentitySha256', 'requestId', 'requestSequence', 'capabilityId', 'capabilityDescriptorSha256',
  'providerContractVersion', 'profileDigestSha256', 'authoritySnapshotSha256', 'environment', 'httpsOrigin', 'port',
  'method', 'pathWithCanonicalQuery', 'headerNameSetSha256', 'requestDescriptorSha256', 'windowStartMs',
  'windowEndMs', 'responseByteLimit', 'requestTimeoutMs', 'totalRequestBudget', 'totalResponseByteBudget',
  'issuedAt', 'deadlineAt', 'state', 'consumptionCount',
] as const

function assertClosedRecord(value: unknown, expected: readonly string[], code: 'aggregate_contract_rejected' | 'permit_rejected' | 'budget_rejected') {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) {
    throw new OkxCandidateError(code, 'OKX-Runtimeobjekt besitzt keine geschlossene Datenform.')
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new OkxCandidateError(code, 'OKX-Runtimeobjekt besitzt keine geschlossene Datenform.')
  }
  const symbolKeys = Object.getOwnPropertySymbols(value)
  if (symbolKeys.length > 0) {
    throw new OkxCandidateError(code, 'OKX-Runtimeobjekt besitzt keine geschlossene Datenform.')
  }
  const ownKeys = Object.getOwnPropertyNames(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of ownKeys) {
    const descriptorValue = descriptors[key]
    if (!descriptorValue?.enumerable || !('value' in descriptorValue) || descriptorValue.value === undefined) {
      throw new OkxCandidateError(code, 'OKX-Runtimeobjekt besitzt keine geschlossene Datenform.')
    }
  }
  const actual = ownKeys.toSorted()
  const required = [...expected].toSorted()
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new OkxCandidateError(code, 'OKX-Runtimeobjekt besitzt keine geschlossene Datenform.')
  }
}

function assertClosedCallable(
  value: unknown,
  code: 'aggregate_contract_rejected' | 'permit_rejected',
): asserts value is (...args: never[]) => unknown {
  if (typeof value !== 'function' || isProxy(value) || Object.getOwnPropertySymbols(value).length > 0) {
    throw new OkxCandidateError(code, 'OKX-Runtimeport besitzt keine geschlossene Callable-Form.')
  }
  const allowedOwnNames = new Set(['length', 'name', 'prototype'])
  const ownNames = Object.getOwnPropertyNames(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (ownNames.some((name) => !allowedOwnNames.has(name) || !('value' in descriptors[name]))) {
    throw new OkxCandidateError(code, 'OKX-Runtimeport besitzt keine geschlossene Callable-Form.')
  }
}

function assertClosedArray(value: unknown, code: 'aggregate_contract_rejected' | 'budget_rejected') {
  if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype
    || Object.getOwnPropertySymbols(value).length > 0) {
    throw new OkxCandidateError(code, 'OKX-Runtimeliste besitzt keine geschlossene Datenform.')
  }
  const names = Object.getOwnPropertyNames(value)
  const expectedNames = ['length', ...Array.from({ length: value.length }, (_entry, index) => String(index))]
  if (names.length !== expectedNames.length || names.some((name) => !expectedNames.includes(name))) {
    throw new OkxCandidateError(code, 'OKX-Runtimeliste besitzt keine geschlossene Datenform.')
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (!lengthDescriptor || lengthDescriptor.enumerable || !('value' in lengthDescriptor)
    || lengthDescriptor.value !== value.length) {
    throw new OkxCandidateError(code, 'OKX-Runtimeliste besitzt keine geschlossene Datenform.')
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptorValue = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptorValue?.enumerable || !('value' in descriptorValue) || descriptorValue.value === undefined) {
      throw new OkxCandidateError(code, 'OKX-Runtimeliste besitzt keine geschlossene Datenform.')
    }
  }
}

const REQUESTS = Object.freeze([
  Object.freeze({
    requestId: 'probe_account_config' as const,
    requestSequence: 1 as const,
    capabilityId: 'okx_account_config_v1' as const,
    responseByteLimit: 65_536,
  }),
  Object.freeze({
    requestId: 'probe_account_instruments' as const,
    requestSequence: 2 as const,
    capabilityId: 'okx_account_instruments_swap_v1' as const,
    responseByteLimit: 1_048_576,
  }),
  Object.freeze({
    requestId: 'probe_fills_history' as const,
    requestSequence: 3 as const,
    capabilityId: 'okx_fills_history_swap_v1' as const,
    responseByteLimit: 262_144,
  }),
])

function canonicalUtcInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_UTC_PATTERN.test(value)) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function threeCalendarMonthsBefore(nowMs: number) {
  const now = new Date(nowMs)
  const targetMonthIndex = now.getUTCFullYear() * 12 + now.getUTCMonth() - 3
  const targetYear = Math.floor(targetMonthIndex / 12)
  const targetMonth = targetMonthIndex - targetYear * 12
  const finalDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return Date.UTC(
    targetYear,
    targetMonth,
    Math.min(now.getUTCDate(), finalDay),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds(),
  )
}

function validHistoryWindow(windowStartMs: unknown, windowEndMs: unknown, nowMs: number) {
  if (typeof windowStartMs !== 'string' || typeof windowEndMs !== 'string'
    || !/^\d{13}$/.test(windowStartMs) || !/^\d{13}$/.test(windowEndMs)) return false
  const start = BigInt(windowStartMs)
  const end = BigInt(windowEndMs)
  return start <= end
    && end - start <= WINDOW_MAX_MS
    && Number(end) <= nowMs
    && Number(start) >= threeCalendarMonthsBefore(nowMs)
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_PATTERN.test(value)
}

function constantTimeEqual(left: unknown, right: unknown) {
  if (!isSha256(left) || !isSha256(right)) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

function canonicalIpSet(input: readonly string[]) {
  assertClosedArray(input, 'aggregate_contract_rejected')
  const normalized = canonicalizeBrokerEgressIpSet(input, 'synthetic_documentation')
  if (!normalized) {
    throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Egress-IP-Authority ist nicht kanonisch.')
  }
  return normalized
}

export function computeOkxAuthorizedEgressIpSetDigest(input: readonly string[]) {
  return createHash('sha256').update(canonicalIpSet(input).join(','), 'utf8').digest('hex')
}

export function computeOkxProviderProjectionDigest(permission: 'read_only', input: readonly string[]) {
  return computeCanonicalBrokerValueDigest({
    perm: permission,
    ip: canonicalIpSet(input).join(','),
  })
}

export function computeOkxAccountIdentityDigest(identityKeyMaterial: Uint8Array, uid: string) {
  assertClosedIdentityKey(identityKeyMaterial)
  if (!/^[1-9][0-9]*$/.test(uid)) {
    throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Kontoidentitätsmaterial ist ungültig.')
  }
  const message = [
    'equora:okx-account-identity:v1',
    'okx',
    'demo',
    'okx-eea-demo-v1',
    uid,
  ].join('\0')
  return createHmac('sha256', identityKeyMaterial).update(message, 'utf8').digest('hex')
}

function authorityDigestInput(authority: OkxSyntheticAuthority) {
  const { authorityDigest: _authorityDigest, ...input } = authority
  return input as unknown as CanonicalJsonValue
}

function assertAuthorityScalarClaims(
  authority: Omit<OkxSyntheticAuthority, 'authorityDigest'>,
) {
  if (authority.authorityContractVersion !== 'equora-okx-synthetic-probe-authority-v1'
    || typeof authority.accountConnectionId !== 'string' || !CLOSED_IDENTIFIER_PATTERN.test(authority.accountConnectionId)
    || typeof authority.setupCommandId !== 'string' || !CLOSED_IDENTIFIER_PATTERN.test(authority.setupCommandId)
    || !Number.isSafeInteger(authority.setupRowVersion) || authority.setupRowVersion < 1
    || authority.environment !== 'demo' || authority.regionProfileId !== 'okx-eea-demo-v1'
    || authority.httpsOrigin !== OKX_EEA_DEMO_ORIGIN
    || authority.providerContractVersion !== OKX_PROVIDER_CONTRACT_VERSION
    || authority.profileId !== OKX_PROFILE_ID || authority.profileVersion !== OKX_PROFILE_VERSION
    || authority.profileDigest !== OKX_PROFILE_DIGEST
    || typeof authority.identityKeyVersion !== 'string' || !CLOSED_IDENTIFIER_PATTERN.test(authority.identityKeyVersion)
    || !isSha256(authority.expectedAccountIdentityDigest)
    || !isSha256(authority.permissionAttestationDigest)
    || !isSha256(authority.expectedProviderProjectionDigest)
    || !isSha256(authority.authorizedEgressIpSetDigest)
    || authority.accountMfaAttested !== true || !isSha256(authority.accountMfaAttestationDigest)
    || authority.incidentStatus !== 'clear' || !isSha256(authority.incidentClearAttestationDigest)
    || typeof authority.windowStartMs !== 'string' || !/^\d{13}$/.test(authority.windowStartMs)
    || typeof authority.windowEndMs !== 'string' || !/^\d{13}$/.test(authority.windowEndMs)
    || !canonicalUtcInstant(authority.absoluteDeadlineAt)
    || authority.maximumRequests !== 3 || authority.maximumTotalResponseBytes !== 1_048_576
    || authority.maximumDurationMs !== 15_000 || authority.maximumParallelRequests !== 1
    || authority.maximumRetries !== 0) {
    throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Synthetic-Authority wurde fail-closed blockiert.')
  }
}

export function computeOkxSyntheticAuthorityDigest(authority: Omit<OkxSyntheticAuthority, 'authorityDigest'>) {
  assertClosedRecord(authority, AUTHORITY_DIGEST_INPUT_KEYS, 'aggregate_contract_rejected')
  assertAuthorityScalarClaims(authority)
  canonicalIpSet(authority.authorizedEgressIpSet)
  return computeCanonicalBrokerValueDigest(authority as unknown as CanonicalJsonValue)
}

function requestPath(capabilityId: OkxMinimalProbeCapabilityId, authority: OkxSyntheticAuthority) {
  if (capabilityId === 'okx_account_config_v1') return '/api/v5/account/config'
  if (capabilityId === 'okx_account_instruments_swap_v1') return '/api/v5/account/instruments?instType=SWAP'
  return `/api/v5/trade/fills-history?begin=${authority.windowStartMs}&end=${authority.windowEndMs}&instType=SWAP&limit=10`
}

function requestQuery(capabilityId: OkxMinimalProbeCapabilityId, authority: OkxSyntheticAuthority) {
  if (capabilityId === 'okx_account_config_v1') return Object.freeze({})
  if (capabilityId === 'okx_account_instruments_swap_v1') return Object.freeze({ instType: 'SWAP' })
  return Object.freeze({
    begin: authority.windowStartMs,
    end: authority.windowEndMs,
    instType: 'SWAP',
    limit: '10',
  })
}

function permitAuthoritySnapshotDigest(
  authority: OkxSyntheticAuthority,
  transition: Readonly<{
    authorityGeneration: 1 | 2 | 3
    predecessorResponseEvidenceDigest: string | null
    observedProviderProjectionDigest: string | null
    observedAccountIdentityDigest: string | null
  }>,
) {
  return computeCanonicalBrokerValueDigest({
    account_connection_id: authority.accountConnectionId,
    setup_command_id: authority.setupCommandId,
    setup_row_version: authority.setupRowVersion,
    identity_key_version: authority.identityKeyVersion,
    permission_attestation_sha256: authority.permissionAttestationDigest,
    expected_provider_perm_and_ip_projection_sha256: authority.expectedProviderProjectionDigest,
    expected_account_identity_sha256: authority.expectedAccountIdentityDigest,
    authorized_egress_ip_set_sha256: authority.authorizedEgressIpSetDigest,
    account_mfa_attestation_sha256: authority.accountMfaAttestationDigest,
    incident_clear_attestation_sha256: authority.incidentClearAttestationDigest,
    authority_generation: transition.authorityGeneration,
    predecessor_response_evidence_sha256: transition.predecessorResponseEvidenceDigest,
    observed_provider_perm_and_ip_projection_sha256: transition.observedProviderProjectionDigest,
    observed_account_identity_sha256: transition.observedAccountIdentityDigest,
  })
}

function permitRequestDescriptorDigest(
  authority: OkxSyntheticAuthority,
  request: (typeof REQUESTS)[number],
) {
  return computeCanonicalBrokerValueDigest({
    request_id: request.requestId,
    request_sequence: request.requestSequence,
    capability_id: request.capabilityId,
    method: 'GET',
    https_origin: authority.httpsOrigin,
    port: 443,
    environment: authority.environment,
    path_with_canonical_query: requestPath(request.capabilityId, authority),
    header_name_set_sha256: OKX_SYNTHETIC_HEADER_NAME_SET_DIGEST,
    window_start_ms: authority.windowStartMs,
    window_end_ms: authority.windowEndMs,
    response_byte_limit: request.responseByteLimit,
    request_timeout_ms: 4_000,
    total_request_budget: 3,
    total_response_byte_budget: 1_048_576,
    deadline_at: authority.absoluteDeadlineAt,
  })
}

export function computeOkxSyntheticPermitAuthoritySnapshotDigest(
  authority: OkxSyntheticAuthority,
  transition: Parameters<typeof permitAuthoritySnapshotDigest>[1],
) {
  return permitAuthoritySnapshotDigest(authority, transition)
}

export function computeOkxSyntheticPermitRequestDescriptorDigest(
  authority: OkxSyntheticAuthority,
  requestSequence: 1 | 2 | 3,
) {
  const request = REQUESTS[requestSequence - 1]
  return permitRequestDescriptorDigest(authority, request)
}

function validateAuthority(authority: OkxSyntheticAuthority, nowMs: number) {
  assertClosedRecord(authority, AUTHORITY_KEYS, 'aggregate_contract_rejected')
  assertAuthorityScalarClaims(authority)
  if (!isSha256(authority.authorityDigest)) {
    throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Synthetic-Authority wurde fail-closed blockiert.')
  }
  const canonicalAuthorityIpSet = canonicalIpSet(authority.authorizedEgressIpSet)
  const canonicalAuthorityIpSetDigest = createHash('sha256').update(canonicalAuthorityIpSet.join(','), 'utf8').digest('hex')
  if (!constantTimeEqual(authority.authorityDigest, computeCanonicalBrokerValueDigest(authorityDigestInput(authority)))
    || !constantTimeEqual(authority.authorizedEgressIpSetDigest, canonicalAuthorityIpSetDigest)
    || !validHistoryWindow(authority.windowStartMs, authority.windowEndMs, nowMs)
    || nowMs >= Date.parse(authority.absoluteDeadlineAt)) {
    throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Synthetic-Authority wurde fail-closed blockiert.')
  }
}

function snapshotAuthorityInput(authority: OkxSyntheticAuthority) {
  assertClosedRecord(authority, AUTHORITY_KEYS, 'aggregate_contract_rejected')
  const authorizedEgressIpSet = Object.freeze([...canonicalIpSet(authority.authorizedEgressIpSet)])
  return Object.freeze({
    ...authority,
    authorizedEgressIpSet,
  }) as OkxSyntheticAuthority
}

function snapshotPermitInput(permit: OkxSyntheticPermit) {
  assertClosedRecord(permit, PERMIT_KEYS, 'permit_rejected')
  return Object.freeze({ ...permit }) as OkxSyntheticPermit
}

function snapshotReceiptInput(receipt: OkxSyntheticPermitReceipt) {
  assertClosedRecord(receipt, [
    'receiptContractVersion', 'permitId', 'permitSha256', 'authoritySnapshotSha256', 'requestId', 'requestSequence', 'state',
    'consumptionCount', 'consumedAt', 'transactionId',
  ], 'permit_rejected')
  return Object.freeze({ ...receipt }) as OkxSyntheticPermitReceipt
}

function snapshotResponseInput(response: OkxSyntheticResponse) {
  assertClosedRecord(response, [
    'transportKind', 'requestId', 'requestSequence', 'capabilityId', 'httpStatus', 'rawBody',
    'requestStartedAt', 'responseReceivedAt',
  ], 'aggregate_contract_rejected')
  assertClosedArray(response.rawBody, 'aggregate_contract_rejected')
  const rawBody = Object.freeze(response.rawBody.map((byte) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Synthetic-Response enthält ungültige Wirebytes.')
    }
    return byte
  }))
  return Object.freeze({ ...response, rawBody }) as OkxSyntheticResponse
}

function validatePermit(
  permit: OkxSyntheticPermit,
  authority: OkxSyntheticAuthority,
  request: (typeof REQUESTS)[number],
  predecessorResponseEvidenceDigest: string | null,
  observedProviderProjectionDigest: string | null,
  observedAccountIdentityDigest: string | null,
  predecessorResponseReceivedAt: string | null,
  nowMs: number,
) {
  assertClosedRecord(permit, PERMIT_KEYS, 'permit_rejected')
  const transition = {
    authorityGeneration: request.requestSequence,
    predecessorResponseEvidenceDigest,
    observedProviderProjectionDigest,
    observedAccountIdentityDigest,
  } as const
  if (typeof permit.permitId !== 'string' || !CLOSED_IDENTIFIER_PATTERN.test(permit.permitId)
    || permit.accountConnectionId !== authority.accountConnectionId
    || permit.setupCommandId !== authority.setupCommandId || permit.setupRowVersion !== authority.setupRowVersion
    || permit.identityKeyVersion !== authority.identityKeyVersion
    || permit.permissionAttestationSha256 !== authority.permissionAttestationDigest
    || permit.expectedProviderPermAndIpProjectionSha256 !== authority.expectedProviderProjectionDigest
    || permit.expectedAccountIdentitySha256 !== authority.expectedAccountIdentityDigest
    || permit.authorizedEgressIpSetSha256 !== authority.authorizedEgressIpSetDigest
    || permit.accountMfaAttestationSha256 !== authority.accountMfaAttestationDigest
    || permit.incidentClearAttestationSha256 !== authority.incidentClearAttestationDigest
    || permit.authorityGeneration !== request.requestSequence
    || permit.requestId !== request.requestId || permit.requestSequence !== request.requestSequence
    || permit.capabilityId !== request.capabilityId
    || permit.capabilityDescriptorSha256 !== OKX_PROFILE_CAPABILITY_DIGESTS[request.capabilityId]
    || permit.providerContractVersion !== OKX_PROVIDER_CONTRACT_VERSION
    || permit.profileDigestSha256 !== OKX_PROFILE_DIGEST
    || !constantTimeEqual(permit.authoritySnapshotSha256, permitAuthoritySnapshotDigest(authority, transition))
    || permit.environment !== authority.environment || permit.httpsOrigin !== authority.httpsOrigin
    || permit.port !== 443 || permit.method !== 'GET'
    || permit.pathWithCanonicalQuery !== requestPath(request.capabilityId, authority)
    || permit.headerNameSetSha256 !== OKX_SYNTHETIC_HEADER_NAME_SET_DIGEST
    || !constantTimeEqual(permit.requestDescriptorSha256, permitRequestDescriptorDigest(authority, request))
    || permit.windowStartMs !== authority.windowStartMs || permit.windowEndMs !== authority.windowEndMs
    || permit.predecessorResponseEvidenceSha256 !== predecessorResponseEvidenceDigest
    || permit.observedProviderPermAndIpProjectionSha256 !== observedProviderProjectionDigest
    || permit.observedAccountIdentitySha256 !== observedAccountIdentityDigest
    || request.requestSequence === 1 && (permit.predecessorResponseEvidenceSha256 !== null
      || permit.observedProviderPermAndIpProjectionSha256 !== null || permit.observedAccountIdentitySha256 !== null)
    || request.requestSequence > 1 && (!isSha256(permit.predecessorResponseEvidenceSha256)
      || !isSha256(permit.observedProviderPermAndIpProjectionSha256)
      || !isSha256(permit.observedAccountIdentitySha256)
      || predecessorResponseReceivedAt === null
      || Date.parse(permit.issuedAt) < Date.parse(predecessorResponseReceivedAt))
    || permit.responseByteLimit !== request.responseByteLimit || permit.requestTimeoutMs !== 4_000
    || permit.totalRequestBudget !== 3 || permit.totalResponseByteBudget !== 1_048_576
    || !canonicalUtcInstant(permit.issuedAt) || !canonicalUtcInstant(permit.deadlineAt)
    || Date.parse(permit.issuedAt) > nowMs || nowMs >= Date.parse(permit.deadlineAt)
    || permit.deadlineAt !== authority.absoluteDeadlineAt
    || permit.state !== 'issued_unconsumed' || permit.consumptionCount !== 0) {
    throw new OkxCandidateError('permit_rejected', 'OKX-Synthetic-Permit wurde fail-closed blockiert.')
  }
}

function validateReceipt(receipt: OkxSyntheticPermitReceipt, permit: OkxSyntheticPermit, nowMs: number) {
  assertClosedRecord(receipt, [
    'receiptContractVersion', 'permitId', 'permitSha256', 'authoritySnapshotSha256', 'requestId', 'requestSequence', 'state',
    'consumptionCount', 'consumedAt', 'transactionId',
  ], 'permit_rejected')
  if (receipt.receiptContractVersion !== 'equora-okx-synthetic-permit-receipt-v2'
    || receipt.permitId !== permit.permitId
    || !constantTimeEqual(
      receipt.permitSha256,
      computeCanonicalBrokerValueDigest(permit as unknown as CanonicalJsonValue),
    )
    || receipt.authoritySnapshotSha256 !== permit.authoritySnapshotSha256
    || receipt.requestId !== permit.requestId || receipt.requestSequence !== permit.requestSequence
    || receipt.state !== 'consumed' || receipt.consumptionCount !== 1
    || !canonicalUtcInstant(receipt.consumedAt) || Date.parse(receipt.consumedAt) > nowMs
    || Date.parse(receipt.consumedAt) < Date.parse(permit.issuedAt)
    || Date.parse(receipt.consumedAt) >= Date.parse(permit.deadlineAt)
    || typeof receipt.transactionId !== 'string' || !CLOSED_IDENTIFIER_PATTERN.test(receipt.transactionId)) {
    throw new OkxCandidateError('permit_rejected', 'OKX-Synthetic-Permit-Receipt ist nicht gebunden.')
  }
}

function responseEvidence(response: OkxSyntheticResponse) {
  assertClosedArray(response.rawBody, 'budget_rejected')
  if (response.rawBody.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new OkxCandidateError('budget_rejected', 'OKX-Synthetic-Response enthält ungültige Wirebytes.')
  }
  const rawBody = Uint8Array.from(response.rawBody)
  return Object.freeze({
    requestId: response.requestId,
    requestSequence: response.requestSequence,
    capabilityId: response.capabilityId,
    rawResponseBytes: rawBody.byteLength,
    rawResponseSha256: createHash('sha256').update(rawBody).digest('hex'),
    requestStartedAt: response.requestStartedAt,
    responseReceivedAt: response.responseReceivedAt,
  })
}

export function computeOkxSyntheticResponseEvidenceDigest(response: OkxSyntheticResponse) {
  return computeCanonicalBrokerValueDigest(responseEvidence(response) as unknown as CanonicalJsonValue)
}

function validateResponseTransport(
  response: OkxSyntheticResponse,
  request: (typeof REQUESTS)[number],
  permit: OkxSyntheticPermit,
  previousReceivedAt: string | null,
  trustedNowMs: number,
  permitConsumedAt: string,
) {
  assertClosedRecord(response, [
    'transportKind', 'requestId', 'requestSequence', 'capabilityId', 'httpStatus', 'rawBody',
    'requestStartedAt', 'responseReceivedAt',
  ], 'budget_rejected')
  if (response.transportKind !== 'synthetic_fixture_no_network'
    || response.requestId !== request.requestId || response.requestSequence !== request.requestSequence
    || response.capabilityId !== request.capabilityId
    || !Number.isInteger(response.httpStatus)
    || !canonicalUtcInstant(response.requestStartedAt) || !canonicalUtcInstant(response.responseReceivedAt)
    || Date.parse(response.requestStartedAt) < Date.parse(permit.issuedAt)
    || Date.parse(response.requestStartedAt) < Date.parse(permitConsumedAt)
    || Date.parse(response.responseReceivedAt) < Date.parse(response.requestStartedAt)
    || Date.parse(response.responseReceivedAt) - Date.parse(response.requestStartedAt) > 4_000
    || Date.parse(response.responseReceivedAt) > trustedNowMs
    || Date.parse(response.responseReceivedAt) >= Date.parse(permit.deadlineAt)
    || previousReceivedAt !== null && Date.parse(response.requestStartedAt) < Date.parse(previousReceivedAt)
    || response.rawBody.length > request.responseByteLimit) {
    throw new OkxCandidateError('budget_rejected', 'OKX-Synthetic-Transportevidenz verletzt Sequenz oder Budget.')
  }
  return responseEvidence(response)
}

function providerIpSet(record: OkxAccountConfigRecord) {
  return canonicalIpSet(record.ip.split(','))
}

function validateObservedAccountAuthority(
  authority: OkxSyntheticAuthority,
  identityKeyMaterial: Uint8Array,
  account: OkxInspectedProbeResponse,
) {
  if (account.capabilityId !== 'okx_account_config_v1') {
    throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Accountbootstrap fehlt.')
  }
  const accountRecord = account.records[0]
  const observedIpSet = providerIpSet(accountRecord)
  const expectedIpSet = canonicalIpSet(authority.authorizedEgressIpSet)
  const observedProviderProjectionDigest = computeOkxProviderProjectionDigest('read_only', observedIpSet)
  const observedAccountIdentityDigest = computeOkxAccountIdentityDigest(identityKeyMaterial, accountRecord.uid)
  if (observedIpSet.length !== expectedIpSet.length
    || observedIpSet.some((entry, index) => entry !== expectedIpSet[index])
    || !constantTimeEqual(observedProviderProjectionDigest, authority.expectedProviderProjectionDigest)
    || !constantTimeEqual(observedAccountIdentityDigest, authority.expectedAccountIdentityDigest)) {
    throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Permission-, IP- oder Kontoidentitätsbindung ist abgewichen.')
  }
  return Object.freeze({
    accountRecord,
    observedProviderProjectionDigest,
    observedAccountIdentityDigest,
  })
}

function validateAggregate(
  authority: OkxSyntheticAuthority,
  identityKeyMaterial: Uint8Array,
  inspected: readonly OkxInspectedProbeResponse[],
) {
  const account = inspected[0]
  const instruments = inspected[1]
  const fills = inspected[2]
  if (account?.capabilityId !== 'okx_account_config_v1'
    || instruments?.capabilityId !== 'okx_account_instruments_swap_v1'
    || fills?.capabilityId !== 'okx_fills_history_swap_v1') {
    throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Probeaggregate besitzt nicht exakt die drei gebundenen Responses.')
  }
  const { accountRecord } = validateObservedAccountAuthority(authority, identityKeyMaterial, account)
  const selectedInstrumentIds = new Set(instruments.selected.map((record) => record.instId))
  for (const fill of fills.records) {
    if (!selectedInstrumentIds.has(fill.instId)
      || accountRecord.posMode === 'net_mode' && fill.posSide !== 'net'
      || accountRecord.posMode === 'long_short_mode' && fill.posSide === 'net') {
      throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Fillreferenz oder Positionsmodus ist inkonsistent.')
    }
  }
  return Object.freeze({
    accountClass: accountRecord.uid === accountRecord.mainUid ? 'main' as const : 'subaccount' as const,
    positionMode: accountRecord.posMode,
    selectedInstrumentCount: instruments.selected.length,
    observedFillCount: fills.records.length,
  })
}

export function resolveOkxCandidateRuntimeMode(input: Readonly<{
  nodeEnv: string | undefined
  configuredMode: string | undefined
}>): OkxCandidateRuntimeMode {
  return input.nodeEnv === 'test' && input.configuredMode === 'synthetic_test' ? 'synthetic_test' : 'off'
}

function readTrustedNow(nowEpochMs: () => number, previousNowMs: number | null) {
  const nowMs = nowEpochMs()
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || previousNowMs !== null && nowMs < previousNowMs) {
    throw new OkxCandidateError('runtime_disabled', RUNTIME_DISABLED_MESSAGE)
  }
  return nowMs
}

function assertClosedIdentityKey(value: unknown): asserts value is Uint8Array {
  if (value === null || typeof value !== 'object' || isProxy(value) || !(value instanceof Uint8Array)
    || Object.getPrototypeOf(value) !== Uint8Array.prototype || Object.getOwnPropertySymbols(value).length > 0) {
    throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Synthetic-Identitätsschlüssel fehlt.')
  }
  const names = Object.getOwnPropertyNames(value)
  if (names.length !== 32) {
    throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Synthetic-Identitätsschlüssel besitzt keine geschlossene Datenform.')
  }
  for (let index = 0; index < names.length; index += 1) {
    const descriptorValue = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptorValue?.enumerable || !('value' in descriptorValue)
      || !Number.isInteger(descriptorValue.value) || descriptorValue.value < 0 || descriptorValue.value > 255) {
      throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Synthetic-Identitätsschlüssel besitzt keine geschlossene Datenform.')
    }
  }
}

export async function runOkxSyntheticCandidateProbe(
  input: OkxSyntheticProbeInput,
  dependencies: Readonly<{
    trustedClock: OkxTrustedClock
    permitControlPlane: OkxSyntheticPermitControlPlane
  }>,
): Promise<OkxSyntheticProbeResult> {
  assertClosedRecord(input, ['runtimeMode', 'authority', 'identityKeyMaterial', 'initialPermit', 'responses'], 'aggregate_contract_rejected')
  if (process.env.NODE_ENV !== 'test' || input.runtimeMode !== 'synthetic_test'
    || resolveOkxCandidateRuntimeMode({
      nodeEnv: process.env.NODE_ENV,
      configuredMode: input.runtimeMode,
    }) !== 'synthetic_test') {
    throw new OkxCandidateError('runtime_disabled', RUNTIME_DISABLED_MESSAGE)
  }
  assertClosedRecord(dependencies, ['trustedClock', 'permitControlPlane'], 'aggregate_contract_rejected')
  if (!dependencies.trustedClock || !dependencies.permitControlPlane) {
    throw new OkxCandidateError('runtime_disabled', RUNTIME_DISABLED_MESSAGE)
  }
  assertClosedRecord(dependencies.trustedClock, ['nowEpochMs'], 'aggregate_contract_rejected')
  assertClosedRecord(
    dependencies.permitControlPlane,
    ['issuePermitForAcceptedTransition', 'consumePermitAtomically'],
    'aggregate_contract_rejected',
  )
  const trustedNowFunction = dependencies.trustedClock.nowEpochMs
  const issuePermitFunction = dependencies.permitControlPlane.issuePermitForAcceptedTransition
  const consumePermitFunction = dependencies.permitControlPlane.consumePermitAtomically
  assertClosedCallable(trustedNowFunction, 'aggregate_contract_rejected')
  assertClosedCallable(issuePermitFunction, 'aggregate_contract_rejected')
  assertClosedCallable(consumePermitFunction, 'aggregate_contract_rejected')
  assertClosedIdentityKey(input.identityKeyMaterial)
  assertClosedArray(input.responses, 'aggregate_contract_rejected')
  if (input.responses.length !== 3) {
    throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Synthetic-Probe benötigt exakt drei Responses.')
  }

  const nowEpochMs = () => NATIVE_FUNCTION_CALL.call(
    trustedNowFunction,
    dependencies.trustedClock,
  ) as number
  const consumePermitAtomically = (permit: OkxSyntheticPermit) => NATIVE_FUNCTION_CALL.call(
    consumePermitFunction,
    dependencies.permitControlPlane,
    permit,
  ) as Promise<OkxSyntheticPermitReceipt>
  const issuePermitForAcceptedTransition = (request: OkxSyntheticPermitIssueRequest) => NATIVE_FUNCTION_CALL.call(
    issuePermitFunction,
    dependencies.permitControlPlane,
    request,
  ) as Promise<OkxSyntheticPermit>
  const identityKey = Uint8Array.from(input.identityKeyMaterial)
  const authority = snapshotAuthorityInput(input.authority)
  const responses = Object.freeze(input.responses.map(snapshotResponseInput))
  const initialPermit = snapshotPermitInput(input.initialPermit)
  try {
    let nowMs = readTrustedNow(nowEpochMs, null)
    validateAuthority(authority, nowMs)

    const inspected: OkxInspectedProbeResponse[] = []
    const evidenceDigests: string[] = []
    let predecessorResponseEvidenceDigest: string | null = null
    let observedProviderProjectionDigest: string | null = null
    let observedAccountIdentityDigest: string | null = null
    let previousReceivedAt: string | null = null
    let firstStartedAt: string | null = null
    let totalBytes = 0
    let permit = initialPermit

    for (let index = 0; index < REQUESTS.length; index += 1) {
      const request = REQUESTS[index]
      const response = responses[index]
      nowMs = readTrustedNow(nowEpochMs, nowMs)
      validatePermit(
        permit,
        authority,
        request,
        predecessorResponseEvidenceDigest,
        observedProviderProjectionDigest,
        observedAccountIdentityDigest,
        previousReceivedAt,
        nowMs,
      )
      const receivedReceipt = await consumePermitAtomically(permit)
      const receipt = snapshotReceiptInput(receivedReceipt)
      nowMs = readTrustedNow(nowEpochMs, nowMs)
      validatePermit(
        permit,
        authority,
        request,
        predecessorResponseEvidenceDigest,
        observedProviderProjectionDigest,
        observedAccountIdentityDigest,
        previousReceivedAt,
        nowMs,
      )
      validateReceipt(receipt, permit, nowMs)
      const evidence = validateResponseTransport(response, request, permit, previousReceivedAt, nowMs, receipt.consumedAt)
      const evidenceDigest = computeCanonicalBrokerValueDigest(evidence as unknown as CanonicalJsonValue)
      totalBytes += evidence.rawResponseBytes
      if (totalBytes > authority.maximumTotalResponseBytes) {
        throw new OkxCandidateError('budget_rejected', 'OKX-Synthetic-Probe überschreitet das Gesamtbytebudget.')
      }
      firstStartedAt ??= response.requestStartedAt
      previousReceivedAt = response.responseReceivedAt
      if (Date.parse(response.responseReceivedAt) - Date.parse(firstStartedAt) > authority.maximumDurationMs) {
        throw new OkxCandidateError('budget_rejected', 'OKX-Synthetic-Probe überschreitet das Gesamtdauerbudget.')
      }
      const inspectedResponse = inspectOkxSyntheticMinimalProbeResponse({
        capabilityId: request.capabilityId,
        httpStatus: response.httpStatus,
        rawBody: response.rawBody,
        canonicalQuery: requestQuery(request.capabilityId, authority),
      })
      if (index === 0) {
        const observed = validateObservedAccountAuthority(authority, identityKey, inspectedResponse)
        observedProviderProjectionDigest = observed.observedProviderProjectionDigest
        observedAccountIdentityDigest = observed.observedAccountIdentityDigest
      }
      inspected.push(inspectedResponse)
      evidenceDigests.push(evidenceDigest)
      predecessorResponseEvidenceDigest = evidenceDigest
      if (index < REQUESTS.length - 1) {
        const nextRequest = REQUESTS[index + 1]
        if ((nextRequest.requestSequence !== 2 && nextRequest.requestSequence !== 3)
          || (nextRequest.requestId !== 'probe_account_instruments' && nextRequest.requestId !== 'probe_fills_history')
          || (nextRequest.capabilityId !== 'okx_account_instruments_swap_v1'
            && nextRequest.capabilityId !== 'okx_fills_history_swap_v1')
          || !observedProviderProjectionDigest || !observedAccountIdentityDigest || !previousReceivedAt) {
          throw new OkxCandidateError('permit_rejected', 'OKX-Synthetic-Permittransition fehlt.')
        }
        const issuedPermit = await issuePermitForAcceptedTransition(Object.freeze({
          issueContractVersion: 'equora-okx-synthetic-permit-issue-transition-v2',
          authority,
          authorityGeneration: nextRequest.requestSequence,
          requestId: nextRequest.requestId,
          requestSequence: nextRequest.requestSequence,
          capabilityId: nextRequest.capabilityId,
          predecessorResponseEvidenceDigest,
          observedProviderProjectionDigest,
          observedAccountIdentityDigest,
          predecessorResponseReceivedAt: previousReceivedAt,
          predecessorPermitReceipt: receipt,
        }))
        permit = snapshotPermitInput(issuedPermit)
      }
    }

    const aggregate = validateAggregate(authority, identityKey, inspected)
    if (evidenceDigests.length !== 3) throw new OkxCandidateError('aggregate_contract_rejected', 'OKX-Evidenzaggregate ist unvollständig.')
    return Object.freeze({
      resultContractVersion: 'equora-okx-synthetic-probe-result-v1',
      status: 'synthetic_pass',
      runtimeMode: 'synthetic_test',
      transportKind: 'synthetic_fixture_no_network',
      providerCode: 'okx',
      providerContractVersion: OKX_PROVIDER_CONTRACT_VERSION,
      profileDigest: OKX_PROFILE_DIGEST,
      accountClass: aggregate.accountClass,
      positionMode: aggregate.positionMode,
      providerReportedReadOnlyObserved: true,
      providerReportedIpSetMatched: true,
      accountIdentityMatched: true,
      selectedInstrumentCount: aggregate.selectedInstrumentCount,
      observedFillCount: aggregate.observedFillCount,
      observedResponseBytes: totalBytes,
      responseEvidenceDigests: Object.freeze(evidenceDigests) as unknown as readonly [string, string, string],
      permitsConsumed: 3,
      connectionActivated: false,
      credentialsPersisted: false,
      captureStarted: false,
      importStarted: false,
      providerSupportedClaim: false,
      productionReadyClaim: false,
      commercialUseAuthorizedClaim: false,
    })
  } finally {
    identityKey.fill(0)
  }
}

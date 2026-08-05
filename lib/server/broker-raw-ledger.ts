import 'server-only'

import {
  digestEquoraTcj,
  encodeEquoraTcj,
  isEquoraTcjDigest,
  tcjBytes,
  tcjEnum,
  tcjFromMexcJson,
  tcjInstant,
  tcjInteger,
  tcjNull,
  tcjObject,
  tcjOrderedArray,
  tcjString,
  type EquoraTcjDigest,
} from '@/lib/server/equora-tcj'
import {
  isMexcJsonObject,
  type MexcJsonObject,
} from '@/lib/server/mexc-json'

export const BROKER_RAW_LEDGER_VERSION = 'broker-raw-ledger-v1' as const

const MEXC_RAW_CAPTURE_CAPABILITIES = Object.freeze({
  historical_orders_v1: Object.freeze({ endpointId: 'historical_orders_v1', eventType: 'order' as const }),
  historical_executions_v3: Object.freeze({ endpointId: 'historical_executions_v3', eventType: 'execution' as const }),
  historical_positions_v1: Object.freeze({ endpointId: 'historical_positions_v1', eventType: 'position' as const }),
  funding_records_v1: Object.freeze({ endpointId: 'funding_records_v1', eventType: 'funding' as const }),
})

export const BROKER_RAW_CAPTURE_PROVIDER_PROFILES = Object.freeze({
  mexc: Object.freeze({
    sourceChannel: 'provider_api_observation' as const,
    sourceProfileId: 'mexc_futures_rest' as const,
    sourceProfileVersion: 'v1' as const,
    providerContractVersion: 'mexc_futures_contract_v1' as const,
    adapterVersion: 'v57_61_0' as const,
    providerRevisionAuthority: 'unverified_only' as const,
    capabilities: MEXC_RAW_CAPTURE_CAPABILITIES,
  }),
})

export type BrokerRawProviderCode = keyof typeof BROKER_RAW_CAPTURE_PROVIDER_PROFILES

export type BrokerRawEventType =
  | 'order'
  | 'execution'
  | 'position'
  | 'funding'
  | 'account_financial_event'
  | 'contract_metadata'

export type BrokerRawSourceChannel = 'provider_api_observation'

export type BrokerAccountIdentityReference = Readonly<{
  digestAlgorithm: 'hmac-sha256'
  digestContractVersion: 'equora-tcj-v1'
  purpose: 'broker_account_identity_v1'
  keyVersion: string
  digest: string
  verificationStatus: 'unverified_reference'
}>

export type BrokerRunReference = Readonly<{
  referenceType: 'sync_run_id_v1'
  value: string
}>

export type BrokerRequestResultReference = Readonly<{
  referenceType: 'provider_request_result_id_v1'
  value: string
}>

export type BrokerRawPageEventInput = Readonly<{
  eventType: BrokerRawEventType
  identityStatus: 'stable_provider_id' | 'blocked_identity'
  externalEventId: string | null
  providerRevision: string | null
  providerRevisionAuthority: 'unverified' | 'provider_stable'
  providerOccurredAtUs: string | null
  providerOrderTimeMs: number | null
  payload: MexcJsonObject
}>

export type BrokerRawProviderPageEvidence = Readonly<{
  currentPage: number
  pageSize: number
  totalCount: number
  totalPage: number
}>

export type BrokerRawPageInput = Readonly<{
  providerCode: string
  accountIdentity: BrokerAccountIdentityReference
  sourceChannel: BrokerRawSourceChannel
  sourceProfileId: string
  sourceProfileVersion: string
  providerContractVersion: string
  adapterVersion: string
  capabilityId: string
  endpointId: string
  scopeDigest: EquoraTcjDigest<'sync_scope'>
  runReference: BrokerRunReference
  requestResultReference: BrokerRequestResultReference
  requestSequence: number
  requestPageNumber: number
  requestScope: Readonly<{
    symbol: string
    startTimeMs: number
    endTimeMs: number
    pageSize: number
    positionType: 1 | 2 | null
  }>
  rawBodyDigest: EquoraTcjDigest<'raw_response_body'>
  rawBodyBytes: number
  responseClassification:
    | 'valid_read_preview_only'
    | 'blocked_unobserved_position_items'
    | 'blocked_funding_authority'
  scopeCompleteness: 'unverified' | 'partial'
  terminalEvidence: 'none' | 'short_bare_array' | 'provider_page_metadata' | 'canonical_empty_page'
  providerPage: BrokerRawProviderPageEvidence | null
  cursor: Readonly<{ providerTimeMs: number; providerId: string }> | null
  observedAtUs: string
  events: readonly BrokerRawPageEventInput[]
}>

export type BrokerRawEventRecord = Readonly<{
  membershipKey: string
  providerCode: BrokerRawProviderCode
  accountIdentity: BrokerAccountIdentityReference
  eventType: BrokerRawEventType
  identityStatus: BrokerRawPageEventInput['identityStatus']
  externalEventId: string | null
  providerRevision: string | null
  providerRevisionAuthority: BrokerRawPageEventInput['providerRevisionAuthority']
  revisionDiscriminator: 'provider_revision' | 'payload_hash_fallback' | 'blocked_payload_fingerprint'
  revisionDiscriminatorValue: string
  revisionSequence: number
  providerOccurredAtUs: string | null
  rawPayload: MexcJsonObject
  rawEventContentDigest: EquoraTcjDigest<'raw_event_content'>
  providerContractVersion: string
  endpointId: string
  firstObservedAtUs: string
  authorityBlocked: true
}>

export type BrokerPageObservationRecord = Readonly<{
  pageObservationDigest: EquoraTcjDigest<'page_observation'>
  providerCode: BrokerRawProviderCode
  accountIdentity: BrokerAccountIdentityReference
  sourceChannel: BrokerRawSourceChannel
  sourceProfileId: string
  sourceProfileVersion: string
  providerContractVersion: string
  adapterVersion: string
  capabilityId: string
  endpointId: string
  scopeDigest: EquoraTcjDigest<'sync_scope'>
  runReference: BrokerRunReference
  requestResultReference: BrokerRequestResultReference
  requestSequence: number
  requestPageNumber: number
  requestScope: BrokerRawPageInput['requestScope']
  rawBodyDigest: EquoraTcjDigest<'raw_response_body'>
  rawBodyBytes: number
  responseClassification: BrokerRawPageInput['responseClassification']
  scopeCompleteness: BrokerRawPageInput['scopeCompleteness']
  terminalEvidence: BrokerRawPageInput['terminalEvidence']
  providerPage: BrokerRawProviderPageEvidence | null
  cursor: BrokerRawPageInput['cursor']
  observedAtUs: string
  orderedRawEventContentDigests: readonly EquoraTcjDigest<'raw_event_content'>[]
  authorityBlocked: true
}>

export type BrokerRawEventObservationRecord = Readonly<{
  rawEventMembershipKey: string
  pageObservationDigest: EquoraTcjDigest<'page_observation'>
  runReference: BrokerRunReference
  requestResultReference: BrokerRequestResultReference
  eventIndex: number
  observedAtUs: string
  occurrence: 'first_observation' | 'repeated_observation'
  observationDigest: EquoraTcjDigest<'raw_event_observation'>
  authorityBlocked: true
}>

const RAW_LEDGER_STATE_BRAND: unique symbol = Symbol('broker_raw_ledger_state')
const RAW_LEDGER_STATE_PROVENANCE = new WeakSet<object>()

export type BrokerRawLedgerState = Readonly<{
  [RAW_LEDGER_STATE_BRAND]: true
  ledgerVersion: typeof BROKER_RAW_LEDGER_VERSION
  ledgerGeneration: number
  providerCode: BrokerRawProviderCode
  accountIdentity: BrokerAccountIdentityReference
  rawEvents: readonly BrokerRawEventRecord[]
  pageObservations: readonly BrokerPageObservationRecord[]
  rawEventObservations: readonly BrokerRawEventObservationRecord[]
  authorityBlocked: true
}>

export type BrokerRawPageTransition = Readonly<{
  state: BrokerRawLedgerState
  pageObservation: BrokerPageObservationRecord
  insertedRawEvents: readonly BrokerRawEventRecord[]
  observations: readonly BrokerRawEventObservationRecord[]
  counts: Readonly<{
    insertedRawEvents: number
    firstObservations: number
    repeatedObservations: number
  }>
  scopeCompleteness: 'unverified' | 'partial'
  authorityBlocked: true
}>

export class BrokerRawLedgerError extends Error {
  constructor(
    public readonly code:
      | 'invalid_account_identity'
      | 'invalid_state'
      | 'generation_mismatch'
      | 'invalid_page'
      | 'duplicate_request_result'
      | 'duplicate_page_event'
      | 'identity_content_collision'
      | 'resource_budget_exceeded',
    message: string,
  ) {
    super(message)
    this.name = 'BrokerRawLedgerError'
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const PROFILE_CODE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/
const EXTERNAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const PROVIDER_REVISION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const CANONICAL_INTEGER_PATTERN = /^-?(?:0|[1-9]\d*)$/
const MAX_PAGE_EVENTS = 1_000
const MAX_RAW_BODY_BYTES = 65_536
const MAX_PAGE_CANONICAL_PAYLOAD_BYTES = MAX_RAW_BODY_BYTES * 8
const MAX_LEDGER_PAGES = 100
const MAX_LEDGER_RAW_EVENTS = 100_000
const MAX_LEDGER_EVENT_OBSERVATIONS = 100_000
const MAX_HISTORY_WINDOW_MS = 31 * 24 * 60 * 60 * 1_000
const SYMBOL_PATTERN = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/

const EVENT_TYPES = new Set<BrokerRawEventType>([
  'order',
  'execution',
  'position',
  'funding',
  'account_financial_event',
  'contract_metadata',
])

const SOURCE_CHANNELS = new Set<BrokerRawSourceChannel>(['provider_api_observation'])

function fail(code: BrokerRawLedgerError['code'], message: string): never {
  throw new BrokerRawLedgerError(code, message)
}

function exactKeys(input: object, expected: readonly string[], code: BrokerRawLedgerError['code'], label: string) {
  const actual = Object.keys(input).sort()
  const canonicalExpected = [...expected].sort()
  if (actual.length !== canonicalExpected.length || actual.some((key, index) => key !== canonicalExpected[index])) {
    fail(code, `${label} enthält unbekannte oder fehlende Felder.`)
  }
}

function validProfileCode(value: unknown, label: string) {
  if (typeof value !== 'string' || !PROFILE_CODE_PATTERN.test(value)) fail('invalid_page', `${label} ist ungültig.`)
  return value
}

function validProviderCode(value: unknown): BrokerRawProviderCode {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    fail('invalid_page', 'providerCode ist ungültig.')
  }
  if (!Object.prototype.hasOwnProperty.call(BROKER_RAW_CAPTURE_PROVIDER_PROFILES, value)) {
    fail('invalid_page', 'providerCode besitzt kein freigegebenes Raw-Capture-Providerprofil.')
  }
  return value as BrokerRawProviderCode
}

function validDigest(value: unknown, code: BrokerRawLedgerError['code'], label: string) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) fail(code, `${label} ist kein SHA-256-Hexdigest.`)
  return value
}

function validTcjDigest<Domain extends EquoraTcjDigest['domain']>(
  value: unknown,
  domain: Domain,
  label: string,
): EquoraTcjDigest<Domain> {
  if (!isEquoraTcjDigest(value, domain)) fail('invalid_page', `${label} verletzt den equora-tcj-v1-Digestvertrag.`)
  return Object.freeze({ ...value })
}

function validOpaqueReference<Type extends BrokerRunReference['referenceType'] | BrokerRequestResultReference['referenceType']>(
  input: unknown,
  referenceType: Type,
  label: string,
): Readonly<{ referenceType: Type; value: string }> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_page', `${label} fehlt.`)
  exactKeys(input, ['referenceType', 'value'], 'invalid_page', label)
  const reference = input as { referenceType?: unknown; value?: unknown }
  if (reference.referenceType !== referenceType || typeof reference.value !== 'string' || !UUID_PATTERN.test(reference.value)) {
    fail('invalid_page', `${label} besitzt keinen gültigen opaken Referenzvertrag.`)
  }
  return Object.freeze({ referenceType, value: reference.value })
}

function validSafeInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('invalid_page', `${label} liegt außerhalb des freigegebenen Integerbereichs.`)
  }
  return value as number
}

function validInstantUs(value: unknown, nullable: boolean, label: string): string | null {
  if (nullable && value === null) return null
  if (
    typeof value !== 'string'
    || value.length > 30
    || !CANONICAL_INTEGER_PATTERN.test(value)
    || value === '-0'
  ) fail('invalid_page', `${label} ist kein kanonischer Unix-Mikrosekundenwert.`)
  return value as string
}

function validateAccountIdentity(input: BrokerAccountIdentityReference): BrokerAccountIdentityReference {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('invalid_account_identity', 'Brokerkonto-Identitätsreferenz fehlt.')
  }
  exactKeys(
    input,
    ['digest', 'digestAlgorithm', 'digestContractVersion', 'keyVersion', 'purpose', 'verificationStatus'],
    'invalid_account_identity',
    'Brokerkonto-Identitätsreferenz',
  )
  if (
    input.digestAlgorithm !== 'hmac-sha256'
    || input.digestContractVersion !== 'equora-tcj-v1'
    || input.verificationStatus !== 'unverified_reference'
  ) {
    fail('invalid_account_identity', 'Brokerkonto-Identitätsreferenz besitzt keine zulässigen Digestmetadaten.')
  }
  if (input.purpose !== 'broker_account_identity_v1') {
    fail('invalid_account_identity', 'Brokerkonto-Identitätsreferenz besitzt einen unbekannten Purpose.')
  }
  if (typeof input.keyVersion !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(input.keyVersion)) {
    fail('invalid_account_identity', 'Brokerkonto-Identitätsreferenz besitzt keine gültige Keyversion.')
  }
  validDigest(input.digest, 'invalid_account_identity', 'Brokerkonto-Identitätsdigest')
  return Object.freeze({ ...input })
}

function validateEvent(input: BrokerRawPageEventInput): BrokerRawPageEventInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_page', 'Raw Page Event fehlt.')
  exactKeys(
    input,
    [
      'eventType',
      'externalEventId',
      'identityStatus',
      'payload',
      'providerOccurredAtUs',
      'providerOrderTimeMs',
      'providerRevision',
      'providerRevisionAuthority',
    ],
    'invalid_page',
    'Raw Page Event',
  )
  if (!EVENT_TYPES.has(input.eventType)) fail('invalid_page', 'Raw Page Event besitzt einen unbekannten Eventtyp.')
  if (input.identityStatus !== 'stable_provider_id' && input.identityStatus !== 'blocked_identity') {
    fail('invalid_page', 'Raw Page Event besitzt einen unbekannten Identitätsstatus.')
  }
  if (
    input.identityStatus === 'stable_provider_id'
    && (typeof input.externalEventId !== 'string' || !EXTERNAL_ID_PATTERN.test(input.externalEventId))
  ) {
    fail('invalid_page', 'Raw Page Event besitzt trotz Stable-Status keine stabile externe ID.')
  }
  if (input.identityStatus === 'blocked_identity' && input.externalEventId !== null) {
    fail('invalid_page', 'Blocked-Identity-Event darf keine scheinbar stabile externe ID tragen.')
  }
  if (
    input.providerRevision !== null
    && (typeof input.providerRevision !== 'string' || !PROVIDER_REVISION_PATTERN.test(input.providerRevision))
  ) fail('invalid_page', 'Raw Page Event besitzt eine ungültige Providerrevision.')
  if (input.providerRevisionAuthority !== 'unverified' && input.providerRevisionAuthority !== 'provider_stable') {
    fail('invalid_page', 'Raw Page Event besitzt eine unbekannte Providerrevisionsauthority.')
  }
  if (input.providerRevisionAuthority === 'provider_stable' && input.providerRevision === null) {
    fail('invalid_page', 'Provider-stable Revision benötigt einen belegten Revisionswert.')
  }
  if (input.identityStatus === 'blocked_identity' && input.providerRevisionAuthority !== 'unverified') {
    fail('invalid_page', 'Blocked-Identity-Event darf keine stabile Providerrevision behaupten.')
  }
  const providerOccurredAtUs = validInstantUs(input.providerOccurredAtUs, true, 'providerOccurredAtUs')
  const providerOrderTimeMs = input.providerOrderTimeMs === null
    ? null
    : validSafeInteger(input.providerOrderTimeMs, 1_000_000_000_000, 9_999_999_999_999, 'providerOrderTimeMs')
  if (!isMexcJsonObject(input.payload)) {
    fail('invalid_page', 'Raw Page Event Payload muss ein lossless JSON-Objekt sein.')
  }
  const payload = input.payload
  return Object.freeze({
    eventType: input.eventType,
    identityStatus: input.identityStatus,
    externalEventId: input.externalEventId,
    providerRevision: input.providerRevision,
    providerRevisionAuthority: input.providerRevisionAuthority,
    providerOccurredAtUs,
    providerOrderTimeMs,
    payload: payload as MexcJsonObject,
  })
}

function validateCursor(input: BrokerRawPageInput['cursor']) {
  if (input === null) return null
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_page', 'Raw Page Cursor ist ungültig.')
  exactKeys(input, ['providerId', 'providerTimeMs'], 'invalid_page', 'Raw Page Cursor')
  const providerTimeMs = validSafeInteger(input.providerTimeMs, 1_000_000_000_000, 9_999_999_999_999, 'cursor.providerTimeMs')
  if (typeof input.providerId !== 'string' || !EXTERNAL_ID_PATTERN.test(input.providerId)) {
    fail('invalid_page', 'Raw Page Cursor besitzt keine gültige Provider-ID.')
  }
  return Object.freeze({ providerTimeMs, providerId: input.providerId })
}

function validateRequestScope(capabilityId: string, input: BrokerRawPageInput['requestScope']) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_page', 'Raw Page Requestscope fehlt.')
  exactKeys(input, ['endTimeMs', 'pageSize', 'positionType', 'startTimeMs', 'symbol'], 'invalid_page', 'Raw Page Requestscope')
  if (typeof input.symbol !== 'string' || !SYMBOL_PATTERN.test(input.symbol)) {
    fail('invalid_page', 'Raw Page Requestscope besitzt ein ungültiges Symbol.')
  }
  const startTimeMs = validSafeInteger(input.startTimeMs, 1_000_000_000_000, 9_999_999_999_999, 'requestScope.startTimeMs')
  const endTimeMs = validSafeInteger(input.endTimeMs, 1_000_000_000_000, 9_999_999_999_999, 'requestScope.endTimeMs')
  if (startTimeMs > endTimeMs || endTimeMs - startTimeMs > MAX_HISTORY_WINDOW_MS) {
    fail('invalid_page', 'Raw Page Requestscope besitzt ein ungültiges Zeitfenster.')
  }
  const maximumPageSize = capabilityId === 'historical_executions_v3' ? 1_000 : 100
  const pageSize = validSafeInteger(input.pageSize, 1, maximumPageSize, 'requestScope.pageSize')
  const needsPositionType = capabilityId === 'historical_positions_v1' || capabilityId === 'funding_records_v1'
  if (needsPositionType ? input.positionType !== 1 && input.positionType !== 2 : input.positionType !== null) {
    fail('invalid_page', 'Raw Page Requestscope besitzt einen capabilityfremden Position-Type.')
  }
  return Object.freeze({
    symbol: input.symbol,
    startTimeMs,
    endTimeMs,
    pageSize,
    positionType: input.positionType,
  })
}

function validateProviderPage(
  input: BrokerRawPageInput['providerPage'],
  requestPageNumber: number,
  requestPageSize: number,
  recordCount: number,
) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('invalid_page', 'Funding Raw Page benötigt Provider-Page-Metadaten.')
  }
  exactKeys(input, ['currentPage', 'pageSize', 'totalCount', 'totalPage'], 'invalid_page', 'Provider-Page-Metadaten')
  const currentPage = validSafeInteger(input.currentPage, 1, 10_000, 'providerPage.currentPage')
  const pageSize = validSafeInteger(input.pageSize, 1, 100, 'providerPage.pageSize')
  const totalCount = validSafeInteger(input.totalCount, 0, 2_147_483_647, 'providerPage.totalCount')
  const totalPage = validSafeInteger(input.totalPage, 0, 2_147_483_647, 'providerPage.totalPage')
  const expectedTotalPage = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize)
  const canonicalEmpty = totalCount === 0 && totalPage === 0 && currentPage === 1 && recordCount === 0
  if (
    currentPage !== requestPageNumber
    || pageSize !== requestPageSize
    || recordCount > pageSize
    || totalCount < recordCount
    || totalPage !== expectedTotalPage
    || (!canonicalEmpty && currentPage > totalPage)
  ) fail('invalid_page', 'Provider-Page-Metadaten widersprechen Request oder Eventcount.')
  const expectedRecordCount = canonicalEmpty
    ? 0
    : currentPage < totalPage
      ? pageSize
      : totalCount - pageSize * (totalPage - 1)
  if (recordCount !== expectedRecordCount) {
    fail('invalid_page', 'Funding Raw Page Eventcount widerspricht den Provider-Page-Metadaten.')
  }
  return Object.freeze({ currentPage, pageSize, totalCount, totalPage })
}

function validatePage(input: BrokerRawPageInput): BrokerRawPageInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_page', 'Raw Page Input fehlt.')
  exactKeys(input, [
    'accountIdentity',
    'adapterVersion',
    'capabilityId',
    'cursor',
    'endpointId',
    'events',
    'observedAtUs',
    'providerCode',
    'providerPage',
    'providerContractVersion',
    'rawBodyBytes',
    'rawBodyDigest',
    'requestPageNumber',
    'requestResultReference',
    'requestScope',
    'requestSequence',
    'responseClassification',
    'runReference',
    'scopeCompleteness',
    'scopeDigest',
    'sourceChannel',
    'sourceProfileId',
    'sourceProfileVersion',
    'terminalEvidence',
  ], 'invalid_page', 'Raw Page Input')
  const providerCode = validProviderCode(input.providerCode)
  const accountIdentity = validateAccountIdentity(input.accountIdentity)
  if (!SOURCE_CHANNELS.has(input.sourceChannel)) fail('invalid_page', 'Raw Page besitzt einen unbekannten Source Channel.')
  const sourceProfileId = validProfileCode(input.sourceProfileId, 'sourceProfileId')
  const sourceProfileVersion = validProfileCode(input.sourceProfileVersion, 'sourceProfileVersion')
  const providerContractVersion = validProfileCode(input.providerContractVersion, 'providerContractVersion')
  const adapterVersion = validProfileCode(input.adapterVersion, 'adapterVersion')
  const capabilityId = validProfileCode(input.capabilityId, 'capabilityId')
  const providerProfile = BROKER_RAW_CAPTURE_PROVIDER_PROFILES[providerCode]
  if (
    input.sourceChannel !== providerProfile.sourceChannel
    || sourceProfileId !== providerProfile.sourceProfileId
    || sourceProfileVersion !== providerProfile.sourceProfileVersion
    || providerContractVersion !== providerProfile.providerContractVersion
    || adapterVersion !== providerProfile.adapterVersion
  ) {
    fail('invalid_page', 'Raw Page Provenienz stimmt nicht mit dem freigegebenen Providerprofil ueberein.')
  }
  if (!Object.prototype.hasOwnProperty.call(providerProfile.capabilities, capabilityId)) {
    fail('invalid_page', 'Raw Page besitzt eine unbekannte historische Capability.')
  }
  const endpointId = validProfileCode(input.endpointId, 'endpointId')
  const capabilityProfile = providerProfile.capabilities[
    capabilityId as keyof typeof providerProfile.capabilities
  ]
  if (endpointId !== capabilityProfile.endpointId) {
    fail('invalid_page', 'Raw Page Endpoint stimmt nicht mit der Capability des Providerprofils ueberein.')
  }
  const scopeDigest = validTcjDigest(input.scopeDigest, 'sync_scope', 'scopeDigest')
  const runReference = validOpaqueReference(input.runReference, 'sync_run_id_v1', 'runReference')
  const requestResultReference = validOpaqueReference(
    input.requestResultReference,
    'provider_request_result_id_v1',
    'requestResultReference',
  )
  const requestSequence = validSafeInteger(input.requestSequence, 1, 10_000, 'requestSequence')
  const requestPageNumber = validSafeInteger(input.requestPageNumber, 1, 10_000, 'requestPageNumber')
  const requestScope = validateRequestScope(capabilityId, input.requestScope)
  const rawBodyDigest = validTcjDigest(input.rawBodyDigest, 'raw_response_body', 'rawBodyDigest')
  const rawBodyBytes = validSafeInteger(input.rawBodyBytes, 1, MAX_RAW_BODY_BYTES, 'rawBodyBytes')
  if (![
    'valid_read_preview_only',
    'blocked_unobserved_position_items',
    'blocked_funding_authority',
  ].includes(input.responseClassification)) fail('invalid_page', 'Raw Page besitzt eine unbekannte Responseklassifikation.')
  if (input.scopeCompleteness !== 'unverified' && input.scopeCompleteness !== 'partial') {
    fail('invalid_page', 'Raw Page darf keine positive Scopevollständigkeit behaupten.')
  }
  if (!['none', 'short_bare_array', 'provider_page_metadata', 'canonical_empty_page'].includes(input.terminalEvidence)) {
    fail('invalid_page', 'Raw Page besitzt eine unbekannte Terminalevidenz.')
  }
  const cursor = validateCursor(input.cursor)
  const observedAtUs = validInstantUs(input.observedAtUs, false, 'observedAtUs')!
  if (!Array.isArray(input.events) || input.events.length > MAX_PAGE_EVENTS) {
    fail('invalid_page', 'Raw Page überschreitet das Eventbudget.')
  }
  const validatedEvents: BrokerRawPageEventInput[] = []
  let canonicalPayloadBytes = 0
  const maximumCanonicalPayloadBytes = Math.min(
    MAX_PAGE_CANONICAL_PAYLOAD_BYTES,
    rawBodyBytes * 8 + 1_024,
  )
  for (const inputEvent of input.events) {
    const event = validateEvent(inputEvent)
    canonicalPayloadBytes += Buffer.byteLength(encodeEquoraTcj(tcjFromMexcJson(event.payload)), 'utf8')
    if (canonicalPayloadBytes > maximumCanonicalPayloadBytes) {
      fail('resource_budget_exceeded', 'Raw Page Payloads überschreiten das gebundene kanonische Pagebudget.')
    }
    validatedEvents.push(event)
  }
  const events = Object.freeze(validatedEvents)
  if (
    providerProfile.providerRevisionAuthority === 'unverified_only'
    && events.some((event) => event.providerRevisionAuthority !== 'unverified')
  ) {
    fail('invalid_page', 'Providerprofil belegt keine stabile Providerrevisionsauthority.')
  }
  if (events.length > requestScope.pageSize) fail('invalid_page', 'Raw Page überschreitet die angefragte Pagegröße.')
  const providerPage = capabilityId === 'funding_records_v1'
    ? validateProviderPage(input.providerPage, requestPageNumber, requestScope.pageSize, events.length)
    : null
  if (capabilityId !== 'funding_records_v1' && input.providerPage !== null) {
    fail('invalid_page', 'Bare-Array-Capability darf keine Provider-Page-Metadaten behaupten.')
  }
  const canonicalEmptyFunding = capabilityId === 'funding_records_v1'
    && providerPage?.currentPage === 1
    && providerPage.totalCount === 0
    && providerPage.totalPage === 0
    && events.length === 0
  const expectedTerminalEvidence = capabilityId !== 'funding_records_v1'
    ? events.length < requestScope.pageSize
      ? 'short_bare_array'
      : 'none'
    : canonicalEmptyFunding
      ? 'canonical_empty_page'
      : providerPage!.totalPage > 0 && providerPage!.currentPage >= providerPage!.totalPage
        ? 'provider_page_metadata'
        : 'none'
  if (input.terminalEvidence !== expectedTerminalEvidence) {
    fail('invalid_page', 'Raw Page Terminalevidenz widerspricht Capability, Eventcount oder Provider-Page-Metadaten.')
  }
  const expectedEventType = capabilityProfile.eventType
  if (events.some((event) => event.eventType !== expectedEventType)) {
    fail('invalid_page', 'Raw Page Eventtyp passt nicht zur Capability.')
  }
  const expectedClassification = capabilityId === 'funding_records_v1'
    ? 'blocked_funding_authority'
    : capabilityId === 'historical_positions_v1' && events.length > 0
      ? 'blocked_unobserved_position_items'
      : 'valid_read_preview_only'
  if (input.responseClassification !== expectedClassification) {
    fail('invalid_page', 'Raw Page Responseklassifikation passt nicht zu Capability und Inhalt.')
  }
  if (events.length === 0 && cursor !== null) fail('invalid_page', 'Leere Raw Page darf keinen erfundenen Eventcursor besitzen.')
  if (
    events.length > 0
    && cursor === null
    && (input.scopeCompleteness !== 'partial' || events.some((event) => event.identityStatus !== 'blocked_identity'))
  ) fail('invalid_page', 'Nichtleere Raw Page ohne stabilen Cursor muss vollständig blocked_identity/partial bleiben.')
  for (let index = 0; index < events.length; index += 1) {
    const orderTime = events[index]!.providerOrderTimeMs
    if (cursor !== null && orderTime === null) {
      fail('invalid_page', 'Raw Page mit Cursor benötigt für jedes Event eine belegte Provider-Orderzeit.')
    }
    if (
      index > 0
      && orderTime !== null
      && events[index - 1]!.providerOrderTimeMs !== null
      && orderTime > events[index - 1]!.providerOrderTimeMs!
    ) fail('invalid_page', 'Raw Page Events sind nicht newest-first nach Provider-Orderzeit sortiert.')
    if (orderTime !== null && (orderTime < requestScope.startTimeMs || orderTime > requestScope.endTimeMs)) {
      fail('invalid_page', 'Raw Page Eventorderzeit liegt außerhalb des fixierten Requestscopes.')
    }
  }
  if (
    events.length > 0
    && cursor !== null
    && (
      events[events.length - 1]!.identityStatus !== 'stable_provider_id'
      || cursor.providerId !== events[events.length - 1]!.externalEventId
    )
  ) fail('invalid_page', 'Raw Page Cursor stimmt nicht mit dem letzten Event überein.')
  if (
    events.length > 0
    && cursor !== null
    && cursor.providerTimeMs !== events[events.length - 1]!.providerOrderTimeMs
  ) fail('invalid_page', 'Raw Page Cursorzeit stimmt nicht mit dem letzten Event überein.')
  return Object.freeze({
    providerCode,
    accountIdentity,
    sourceChannel: input.sourceChannel,
    sourceProfileId,
    sourceProfileVersion,
    providerContractVersion,
    adapterVersion,
    capabilityId,
    endpointId,
    scopeDigest,
    runReference,
    requestResultReference,
    requestSequence,
    requestPageNumber,
    requestScope,
    rawBodyDigest,
    rawBodyBytes,
    responseClassification: input.responseClassification,
    scopeCompleteness: input.scopeCompleteness,
    terminalEvidence: input.terminalEvidence,
    providerPage,
    cursor,
    observedAtUs,
    events,
  })
}

function compositeKey(parts: readonly string[]) {
  return parts.map((part) => `${Buffer.byteLength(part, 'utf8')}:${part}`).join('|')
}

function sameTcjDigest(left: EquoraTcjDigest, right: EquoraTcjDigest) {
  return left.digestAlgorithm === right.digestAlgorithm
    && left.digestContractVersion === right.digestContractVersion
    && left.domain === right.domain
    && left.digest === right.digest
}

function tcjDigestValue(value: EquoraTcjDigest) {
  return tcjObject([
    ['digest_algorithm', tcjEnum(value.digestAlgorithm)],
    ['digest_contract_version', tcjString(value.digestContractVersion)],
    ['domain', tcjEnum(value.domain)],
    ['digest', tcjBytes(value.digest)],
  ])
}

function rawEventContentDigest(page: BrokerRawPageInput, event: BrokerRawPageEventInput) {
  return digestEquoraTcj('raw_event_content', tcjObject([
    ['provider', tcjEnum(page.providerCode)],
    ['provider_contract_version', tcjString(page.providerContractVersion)],
    ['endpoint_id', tcjString(page.endpointId)],
    ['event_type', tcjEnum(event.eventType)],
    ['identity_status', tcjEnum(event.identityStatus)],
    ['external_event_id', event.externalEventId === null ? tcjNull() : tcjString(event.externalEventId)],
    ['provider_revision_authority', tcjEnum(event.providerRevisionAuthority)],
    ['provider_revision', event.providerRevision === null ? tcjNull() : tcjString(event.providerRevision)],
    ['provider_occurred_at', event.providerOccurredAtUs === null ? tcjNull() : tcjInstant(event.providerOccurredAtUs)],
    ['payload', tcjFromMexcJson(event.payload)],
  ]))
}

function eventMembership(
  page: BrokerRawPageInput,
  event: BrokerRawPageEventInput,
  contentDigest: EquoraTcjDigest<'raw_event_content'>,
) {
  const revisionDiscriminator = event.identityStatus === 'blocked_identity'
    ? 'blocked_payload_fingerprint'
    : event.providerRevisionAuthority !== 'provider_stable'
      ? 'payload_hash_fallback'
      : 'provider_revision'
  const revisionDiscriminatorValue = revisionDiscriminator === 'provider_revision'
    ? event.providerRevision!
    : contentDigest.digest
  const membershipKey = compositeKey([
    page.providerCode,
    page.accountIdentity.digestAlgorithm,
    page.accountIdentity.digestContractVersion,
    page.accountIdentity.purpose,
    page.accountIdentity.keyVersion,
    page.accountIdentity.digest,
    event.eventType,
    event.externalEventId ?? '<blocked_identity>',
    revisionDiscriminator,
    revisionDiscriminatorValue,
  ])
  return Object.freeze({ revisionDiscriminator, revisionDiscriminatorValue, membershipKey })
}

function pageObservationDigest(
  page: BrokerRawPageInput,
  stagedEvents: readonly Readonly<{
    event: BrokerRawPageEventInput
    contentDigest: EquoraTcjDigest<'raw_event_content'>
    membershipKey: string
    revisionDiscriminator: 'provider_revision' | 'payload_hash_fallback' | 'blocked_payload_fingerprint'
    revisionDiscriminatorValue: string
  }>[],
) {
  const cursorValue = page.cursor === null
    ? tcjNull()
    : tcjObject([
        ['provider_time_ms', tcjInteger(String(page.cursor.providerTimeMs))],
        ['provider_id', tcjString(page.cursor.providerId)],
      ])
  const providerPageValue = page.providerPage === null
    ? tcjNull()
    : tcjObject([
        ['current_page', tcjInteger(String(page.providerPage.currentPage))],
        ['page_size', tcjInteger(String(page.providerPage.pageSize))],
        ['total_count', tcjInteger(String(page.providerPage.totalCount))],
        ['total_page', tcjInteger(String(page.providerPage.totalPage))],
      ])
  return digestEquoraTcj('page_observation', tcjObject([
    ['observation_kind', tcjEnum('provider_page')],
    ['scope_digest', tcjDigestValue(page.scopeDigest)],
    ['request', tcjObject([
      ['provider', tcjEnum(page.providerCode)],
      ['capability_id', tcjString(page.capabilityId)],
      ['endpoint_id', tcjString(page.endpointId)],
      ['request_page_number', tcjInteger(String(page.requestPageNumber))],
      ['symbol', tcjString(page.requestScope.symbol)],
      ['start_time_ms', tcjInteger(String(page.requestScope.startTimeMs))],
      ['end_time_ms', tcjInteger(String(page.requestScope.endTimeMs))],
      ['page_size', tcjInteger(String(page.requestScope.pageSize))],
      ['position_type', page.requestScope.positionType === null
        ? tcjNull()
        : tcjInteger(String(page.requestScope.positionType))],
      ['source_channel', tcjEnum(page.sourceChannel)],
      ['source_profile_id', tcjString(page.sourceProfileId)],
      ['source_profile_version', tcjString(page.sourceProfileVersion)],
      ['provider_contract_version', tcjString(page.providerContractVersion)],
      ['adapter_version', tcjString(page.adapterVersion)],
    ])],
    ['page', tcjObject([
      ['raw_body_digest', tcjDigestValue(page.rawBodyDigest)],
      ['raw_body_bytes', tcjInteger(String(page.rawBodyBytes))],
      ['cursor', cursorValue],
      ['provider_page', providerPageValue],
      ['response_classification', tcjEnum(page.responseClassification)],
      ['scope_completeness', tcjEnum(page.scopeCompleteness)],
      ['terminal_evidence', tcjEnum(page.terminalEvidence)],
    ])],
    ['events', tcjOrderedArray(stagedEvents.map((item) => tcjObject([
      ['identity', tcjObject([
        ['event_type', tcjEnum(item.event.eventType)],
        ['identity_status', tcjEnum(item.event.identityStatus)],
        ['external_event_id', item.event.externalEventId === null ? tcjNull() : tcjString(item.event.externalEventId)],
        ['provider_order_time_ms', item.event.providerOrderTimeMs === null
          ? tcjNull()
          : tcjInteger(String(item.event.providerOrderTimeMs))],
        ['revision_discriminator', tcjEnum(item.revisionDiscriminator)],
        ['revision_discriminator_value', tcjString(item.revisionDiscriminatorValue)],
      ])],
      ['raw_event_content_digest', tcjDigestValue(item.contentDigest)],
    ])))],
  ]))
}

function rawEventObservationDigest(
  pageDigest: EquoraTcjDigest<'page_observation'>,
  rawEventContentDigest: EquoraTcjDigest<'raw_event_content'>,
  runReference: BrokerRunReference,
  requestResultReference: BrokerRequestResultReference,
  eventIndex: number,
  occurrence: BrokerRawEventObservationRecord['occurrence'],
) {
  return digestEquoraTcj('raw_event_observation', tcjObject([
    ['observation_kind', tcjEnum('raw_event_on_page')],
    ['page_observation_digest', tcjDigestValue(pageDigest)],
    ['raw_event_content_digest', tcjDigestValue(rawEventContentDigest)],
    ['run_reference', tcjObject([
      ['reference_type', tcjEnum(runReference.referenceType)],
      ['value', tcjString(runReference.value)],
    ])],
    ['request_result_reference', tcjObject([
      ['reference_type', tcjEnum(requestResultReference.referenceType)],
      ['value', tcjString(requestResultReference.value)],
    ])],
    ['event_index', tcjInteger(String(eventIndex))],
    ['occurrence', tcjEnum(occurrence)],
  ]))
}

function freezeState(input: Omit<BrokerRawLedgerState, typeof RAW_LEDGER_STATE_BRAND>): BrokerRawLedgerState {
  const state = {
    ...input,
    rawEvents: Object.freeze([...input.rawEvents]),
    pageObservations: Object.freeze([...input.pageObservations]),
    rawEventObservations: Object.freeze([...input.rawEventObservations]),
  } as Omit<BrokerRawLedgerState, typeof RAW_LEDGER_STATE_BRAND> & {
    [RAW_LEDGER_STATE_BRAND]: true
  }
  Object.defineProperty(state, RAW_LEDGER_STATE_BRAND, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  })
  const frozen = Object.freeze(state) as BrokerRawLedgerState
  RAW_LEDGER_STATE_PROVENANCE.add(frozen)
  return frozen
}

function assertState(input: BrokerRawLedgerState) {
  if (
    !input
    || typeof input !== 'object'
    || Array.isArray(input)
    || !RAW_LEDGER_STATE_PROVENANCE.has(input)
    || !Object.isFrozen(input)
    || input[RAW_LEDGER_STATE_BRAND] !== true
    || input.ledgerVersion !== BROKER_RAW_LEDGER_VERSION
    || input.authorityBlocked !== true
    || !Number.isSafeInteger(input.ledgerGeneration)
    || input.ledgerGeneration < 0
    || input.pageObservations.length !== input.ledgerGeneration
    || !Object.isFrozen(input.rawEvents)
    || !Object.isFrozen(input.pageObservations)
    || !Object.isFrozen(input.rawEventObservations)
    || input.pageObservations.length > MAX_LEDGER_PAGES
    || input.rawEvents.length > MAX_LEDGER_RAW_EVENTS
    || input.rawEventObservations.length > MAX_LEDGER_EVENT_OBSERVATIONS
  ) fail('invalid_state', 'Broker Raw Ledger State ist ungültig.')

  const expectedKeys = [
    'accountIdentity',
    'authorityBlocked',
    'ledgerGeneration',
    'ledgerVersion',
    'pageObservations',
    'providerCode',
    'rawEventObservations',
    'rawEvents',
  ].sort()
  const actualKeys = Object.keys(input).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail('invalid_state', 'Broker Raw Ledger State besitzt unbekannte oder fehlende Felder.')
  }

  const scopedAccount = (account: BrokerAccountIdentityReference) => (
    account.digestAlgorithm === input.accountIdentity.digestAlgorithm
    && account.digestContractVersion === input.accountIdentity.digestContractVersion
    && account.purpose === input.accountIdentity.purpose
    && account.keyVersion === input.accountIdentity.keyVersion
    && account.digest === input.accountIdentity.digest
    && account.verificationStatus === input.accountIdentity.verificationStatus
  )
  if (input.rawEvents.some((record) => (
    !Object.isFrozen(record)
    || record.authorityBlocked !== true
    || record.providerCode !== input.providerCode
    || !scopedAccount(record.accountIdentity)
    || !isEquoraTcjDigest(record.rawEventContentDigest, 'raw_event_content')
  ))) fail('invalid_state', 'Broker Raw Ledger enthält ein ungültiges Raw Event.')
  if (input.pageObservations.some((record) => (
    !Object.isFrozen(record)
    || record.authorityBlocked !== true
    || record.providerCode !== input.providerCode
    || !scopedAccount(record.accountIdentity)
    || !isEquoraTcjDigest(record.scopeDigest, 'sync_scope')
    || !isEquoraTcjDigest(record.rawBodyDigest, 'raw_response_body')
    || !isEquoraTcjDigest(record.pageObservationDigest, 'page_observation')
  ))) fail('invalid_state', 'Broker Raw Ledger enthält eine ungültige Page Observation.')
  if (new Set(input.pageObservations.map((record) => record.requestResultReference.value)).size !== input.pageObservations.length) {
    fail('invalid_state', 'Broker Raw Ledger enthält doppelte Request Results.')
  }
  const memberships = new Set(input.rawEvents.map((record) => record.membershipKey))
  const pageDigests = new Set(input.pageObservations.map((record) => record.pageObservationDigest.digest))
  if (input.rawEventObservations.some((record) => (
    !Object.isFrozen(record)
    || record.authorityBlocked !== true
    || !memberships.has(record.rawEventMembershipKey)
    || !pageDigests.has(record.pageObservationDigest.digest)
    || record.runReference.referenceType !== 'sync_run_id_v1'
    || !UUID_PATTERN.test(record.runReference.value)
    || record.requestResultReference.referenceType !== 'provider_request_result_id_v1'
    || !UUID_PATTERN.test(record.requestResultReference.value)
    || !isEquoraTcjDigest(record.pageObservationDigest, 'page_observation')
    || !isEquoraTcjDigest(record.observationDigest, 'raw_event_observation')
  ))) fail('invalid_state', 'Broker Raw Ledger enthält eine ungültige Event Observation.')
}

export function createBrokerRawLedgerState(
  providerCodeInput: string,
  accountIdentityInput: BrokerAccountIdentityReference,
): BrokerRawLedgerState {
  const providerCode = validProviderCode(providerCodeInput)
  const accountIdentity = validateAccountIdentity(accountIdentityInput)
  return freezeState({
    ledgerVersion: BROKER_RAW_LEDGER_VERSION,
    ledgerGeneration: 0,
    providerCode,
    accountIdentity,
    rawEvents: [],
    pageObservations: [],
    rawEventObservations: [],
    authorityBlocked: true,
  })
}

export function applyBrokerRawPage(
  state: BrokerRawLedgerState,
  expectedLedgerGeneration: number,
  pageInput: BrokerRawPageInput,
): BrokerRawPageTransition {
  assertState(state)
  if (!Number.isSafeInteger(expectedLedgerGeneration) || expectedLedgerGeneration !== state.ledgerGeneration) {
    fail('generation_mismatch', 'Broker Raw Ledger Generation wurde parallel oder veraltet fortgesetzt.')
  }
  const page = validatePage(pageInput)
  if (
    page.providerCode !== state.providerCode
    || page.accountIdentity.digestAlgorithm !== state.accountIdentity.digestAlgorithm
    || page.accountIdentity.digestContractVersion !== state.accountIdentity.digestContractVersion
    || page.accountIdentity.purpose !== state.accountIdentity.purpose
    || page.accountIdentity.keyVersion !== state.accountIdentity.keyVersion
    || page.accountIdentity.digest !== state.accountIdentity.digest
    || page.accountIdentity.verificationStatus !== state.accountIdentity.verificationStatus
  ) fail('invalid_page', 'Raw Page gehört nicht zum Brokerkonto-Scope des Ledgers.')
  if (state.pageObservations.some((item) => item.requestResultReference.value === page.requestResultReference.value)) {
    fail('duplicate_request_result', 'Provider Request Result wurde bereits atomar verarbeitet.')
  }
  if (
    state.pageObservations.length >= MAX_LEDGER_PAGES
    || state.rawEventObservations.length + page.events.length > MAX_LEDGER_EVENT_OBSERVATIONS
  ) fail('resource_budget_exceeded', 'Broker Raw Ledger hat sein transientes Scopebudget erreicht.')

  const existingByMembership = new Map(state.rawEvents.map((item) => [item.membershipKey, item] as const))
  const stagedEvents = page.events.map((event) => {
    const contentDigest = rawEventContentDigest(page, event)
    const membership = eventMembership(page, event, contentDigest)
    return Object.freeze({ event, contentDigest, ...membership })
  })
  if (new Set(stagedEvents.map((item) => item.membershipKey)).size !== stagedEvents.length) {
    fail('duplicate_page_event', 'Raw Page enthält dieselbe Eventmembership mehrfach.')
  }
  const newMembershipCount = stagedEvents.filter((item) => !existingByMembership.has(item.membershipKey)).length
  if (state.rawEvents.length + newMembershipCount > MAX_LEDGER_RAW_EVENTS) {
    fail('resource_budget_exceeded', 'Broker Raw Ledger hat sein Raw-Event-Budget erreicht.')
  }
  for (const staged of stagedEvents) {
    const existing = existingByMembership.get(staged.membershipKey)
    if (
      existing
      && (
        !sameTcjDigest(existing.rawEventContentDigest, staged.contentDigest)
        || existing.providerOccurredAtUs !== staged.event.providerOccurredAtUs
      )
    ) fail('identity_content_collision', 'Stabile Providerrevision kollidiert mit anderem Raw Event Content.')
  }

  const pageDigest = pageObservationDigest(page, stagedEvents)
  const insertedRawEvents: BrokerRawEventRecord[] = []
  const observations: BrokerRawEventObservationRecord[] = []
  const stagedRawEvents = [...state.rawEvents]
  const eventGroupCounts = new Map<string, number>()
  for (const item of state.rawEvents) {
    const group = compositeKey([item.eventType, item.externalEventId ?? item.rawEventContentDigest.digest])
    eventGroupCounts.set(group, Math.max(eventGroupCounts.get(group) ?? 0, item.revisionSequence))
  }

  for (let eventIndex = 0; eventIndex < stagedEvents.length; eventIndex += 1) {
    const staged = stagedEvents[eventIndex]!
    let rawEvent = existingByMembership.get(staged.membershipKey)
    const occurrence = rawEvent ? 'repeated_observation' : 'first_observation'
    if (!rawEvent) {
      const group = compositeKey([
        staged.event.eventType,
        staged.event.externalEventId ?? staged.contentDigest.digest,
      ])
      const revisionSequence = (eventGroupCounts.get(group) ?? 0) + 1
      eventGroupCounts.set(group, revisionSequence)
      rawEvent = Object.freeze({
        membershipKey: staged.membershipKey,
        providerCode: page.providerCode,
        accountIdentity: page.accountIdentity,
        eventType: staged.event.eventType,
        identityStatus: staged.event.identityStatus,
        externalEventId: staged.event.externalEventId,
        providerRevision: staged.event.providerRevision,
        providerRevisionAuthority: staged.event.providerRevisionAuthority,
        revisionDiscriminator: staged.revisionDiscriminator,
        revisionDiscriminatorValue: staged.revisionDiscriminatorValue,
        revisionSequence,
        providerOccurredAtUs: staged.event.providerOccurredAtUs,
        rawPayload: staged.event.payload,
        rawEventContentDigest: staged.contentDigest,
        providerContractVersion: page.providerContractVersion,
        endpointId: page.endpointId,
        firstObservedAtUs: page.observedAtUs,
        authorityBlocked: true as const,
      })
      existingByMembership.set(staged.membershipKey, rawEvent)
      stagedRawEvents.push(rawEvent)
      insertedRawEvents.push(rawEvent)
    }
    observations.push(Object.freeze({
      rawEventMembershipKey: rawEvent.membershipKey,
      pageObservationDigest: pageDigest,
      runReference: page.runReference,
      requestResultReference: page.requestResultReference,
      eventIndex,
      observedAtUs: page.observedAtUs,
      occurrence,
      observationDigest: rawEventObservationDigest(
        pageDigest,
        rawEvent.rawEventContentDigest,
        page.runReference,
        page.requestResultReference,
        eventIndex,
        occurrence,
      ),
      authorityBlocked: true as const,
    }))
  }

  const pageObservation: BrokerPageObservationRecord = Object.freeze({
    pageObservationDigest: pageDigest,
    providerCode: page.providerCode,
    accountIdentity: page.accountIdentity,
    sourceChannel: page.sourceChannel,
    sourceProfileId: page.sourceProfileId,
    sourceProfileVersion: page.sourceProfileVersion,
    providerContractVersion: page.providerContractVersion,
    adapterVersion: page.adapterVersion,
    capabilityId: page.capabilityId,
    endpointId: page.endpointId,
    scopeDigest: page.scopeDigest,
    runReference: page.runReference,
    requestResultReference: page.requestResultReference,
    requestSequence: page.requestSequence,
    requestPageNumber: page.requestPageNumber,
    requestScope: page.requestScope,
    rawBodyDigest: page.rawBodyDigest,
    rawBodyBytes: page.rawBodyBytes,
    responseClassification: page.responseClassification,
    scopeCompleteness: page.scopeCompleteness,
    terminalEvidence: page.terminalEvidence,
    providerPage: page.providerPage,
    cursor: page.cursor,
    observedAtUs: page.observedAtUs,
    orderedRawEventContentDigests: Object.freeze(stagedEvents.map((item) => item.contentDigest)),
    authorityBlocked: true,
  })
  const nextState = freezeState({
    ledgerVersion: BROKER_RAW_LEDGER_VERSION,
    ledgerGeneration: state.ledgerGeneration + 1,
    providerCode: state.providerCode,
    accountIdentity: state.accountIdentity,
    rawEvents: stagedRawEvents,
    pageObservations: [...state.pageObservations, pageObservation],
    rawEventObservations: [...state.rawEventObservations, ...observations],
    authorityBlocked: true,
  })
  return Object.freeze({
    state: nextState,
    pageObservation,
    insertedRawEvents: Object.freeze(insertedRawEvents),
    observations: Object.freeze(observations),
    counts: Object.freeze({
      insertedRawEvents: insertedRawEvents.length,
      firstObservations: observations.filter((item) => item.occurrence === 'first_observation').length,
      repeatedObservations: observations.filter((item) => item.occurrence === 'repeated_observation').length,
    }),
    scopeCompleteness: page.scopeCompleteness,
    authorityBlocked: true,
  })
}

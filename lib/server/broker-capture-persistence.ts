import 'server-only'

import { createHmac } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  encodeEquoraTcj,
  tcjBoolean,
  tcjJsonNumber,
  tcjNull,
  tcjObject,
  tcjOrderedArray,
  tcjString,
  type EquoraTcjValue,
} from '@/lib/server/equora-tcj'
import {
  inspectMexcCapturedPageResultForWireResponse,
  type MexcCapturedPageResult,
} from '@/lib/server/mexc-capture-orchestrator'
import {
  isMexcJsonArray,
  isMexcJsonNumber,
  isMexcJsonObject,
  type MexcJsonValue,
} from '@/lib/server/mexc-json'
import {
  inspectMexcWireResponse,
  type MexcWireResponse,
} from '@/lib/server/mexc-transport'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const BROKER_CAPTURE_PAGE_COMMIT_RPC = 'equora_commit_broker_capture_page_v1' as const
export const BROKER_CAPTURE_TRANSITION_MAC_VERSION = 'equora-broker-capture-transition-hmac-sha256-v1' as const

export type BrokerCapturePageCommitInput = Readonly<{
  leaseToken: string
  integrityKey: Uint8Array
  integrityKeyVersion: string
  expectedWorkUnitRowVersion: number
  wireResponse: MexcWireResponse
  capturedPage: MexcCapturedPageResult
}>

export type BrokerCapturePageCommitResult = Readonly<{
  status: 'page_committed'
  requestResultId: string
  workUnitRowVersion: number
  ledgerGeneration: number
  insertedRawEvents: number
  repeatedObservations: number
  observations: number
  scopeCompleteness: 'unverified' | 'partial'
  authorityBlocked: true
}>

export type BrokerCapturePageRpcArguments = Readonly<{
  p_work_unit_id: string
  p_expected_run_id: string
  p_expected_broker_account_id: string
  p_expected_connection_account_id: string
  p_expected_sync_activation_id: string
  p_expected_activation_generation: number
  p_expected_scope_digest: string
  p_transition_mac_version: typeof BROKER_CAPTURE_TRANSITION_MAC_VERSION
  p_transition_integrity_key_version: string
  p_transition_mac: string
  p_lease_token: string
  p_expected_work_unit_row_version: number
  p_expected_checkpoint_mac: string
  p_expected_ledger_generation: number
  p_request_result_id: string
  p_request_sequence: number
  p_method: 'GET'
  p_request_origin: string
  p_request_path: string
  p_request_query: Readonly<Record<string, string>>
  p_transport_contract_version: string
  p_request_started_at: string
  p_response_received_at: string
  p_request_duration_ms: number
  p_http_status: number
  p_provider_status_class: 'success'
  p_response_classification: string
  p_raw_body_base64: string
  p_raw_body_digest: string
  p_raw_body_bytes: number
  p_page_observation_digest: string
  p_page_metadata: Readonly<Record<string, unknown>>
  p_scope_completeness: 'unverified' | 'partial'
  p_next_checkpoint: Readonly<Record<string, unknown>>
  p_next_checkpoint_mac: string
  p_next_checkpoint_status: string
  p_next_checkpoint_reason: string
  p_next_page_number: number
  p_events: readonly Readonly<Record<string, unknown>>[]
}>

type BrokerCapturePersistenceErrorCode =
  | 'invalid_input'
  | 'capture_not_committable'
  | 'capture_binding_mismatch'
  | 'capture_transition_mismatch'
  | 'database_error'
  | 'database_result_invalid'
  | 'CAPTURE_INVALID_INPUT'
  | 'CAPTURE_INVALID_DIGEST'
  | 'CAPTURE_INVALID_SHAPE'
  | 'CAPTURE_RESOURCE_BUDGET_EXCEEDED'
  | 'CAPTURE_LOCK_TIMEOUT'
  | 'CAPTURE_STATEMENT_TIMEOUT'
  | 'CAPTURE_RPC_DEADLINE_EXCEEDED'
  | 'CAPTURE_WORK_UNIT_NOT_FOUND'
  | 'CAPTURE_PURPOSE_BINDING_MISMATCH'
  | 'CAPTURE_LEASE_INVALID'
  | 'CAPTURE_WORK_UNIT_CAS_MISMATCH'
  | 'CAPTURE_SCOPE_MISMATCH'
  | 'CAPTURE_RUN_INVALID'
  | 'CAPTURE_ACTIVATION_INACTIVE'
  | 'CAPTURE_ACTIVATION_NOT_CURRENT'
  | 'CAPTURE_CONNECTION_INACTIVE'
  | 'CAPTURE_CREDENTIAL_INACTIVE'
  | 'CAPTURE_INTEGRITY_KEY_INVALID'
  | 'CAPTURE_TRANSITION_MAC_MISMATCH'
  | 'CAPTURE_CHECKPOINT_MAC_INVALID'
  | 'CAPTURE_CHECKPOINT_MAC_MISMATCH'
  | 'CAPTURE_ACCOUNT_IDENTITY_INACTIVE'
  | 'CAPTURE_LEDGER_CAS_MISMATCH'
  | 'CAPTURE_PROVIDER_BLOCKED'
  | 'CAPTURE_READONLY_CONTRACT_MISMATCH'
  | 'CAPTURE_TRANSPORT_CONTRACT_MISMATCH'
  | 'CAPTURE_REQUEST_RESULT_REPLAY'
  | 'CAPTURE_REQUEST_QUERY_MISMATCH'
  | 'CAPTURE_RAW_BODY_INVALID'
  | 'CAPTURE_RAW_BODY_DIGEST_MISMATCH'
  | 'CAPTURE_BODY_ENVELOPE_MISMATCH'
  | 'CAPTURE_BODY_EVENT_MISMATCH'
  | 'CAPTURE_NEXT_CHECKPOINT_MISMATCH'
  | 'CAPTURE_PAGE_METADATA_MISMATCH'
  | 'CAPTURE_PAGE_DIGEST_MISMATCH'
  | 'CAPTURE_EVENT_SHAPE_INVALID'
  | 'CAPTURE_EVENT_CONTRACT_MISMATCH'
  | 'CAPTURE_LEDGER_OCCURRENCE_MISMATCH'
  | 'CAPTURE_IDENTITY_COLLISION'
  | 'CAPTURE_OBSERVATION_DIGEST_MISMATCH'
  | 'CAPTURE_COUNT_MISMATCH'

export class BrokerCapturePersistenceError extends Error {
  constructor(
    public readonly code: BrokerCapturePersistenceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'BrokerCapturePersistenceError'
  }
}

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const INTEGRITY_KEY_VERSION_PATTERN = /^[a-z][a-z0-9_]{0,62}$/
const CANONICAL_INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/
const MAX_SERIALIZED_NODES = 100_000
const MAX_TRANSITION_DEPTH = 64
const BROKER_CAPTURE_TRANSITION_DOMAIN = 'equora-broker-capture-transition-v1'

const DATABASE_CODES = new Set<BrokerCapturePersistenceErrorCode>([
  'CAPTURE_INVALID_INPUT',
  'CAPTURE_INVALID_DIGEST',
  'CAPTURE_INVALID_SHAPE',
  'CAPTURE_RESOURCE_BUDGET_EXCEEDED',
  'CAPTURE_LOCK_TIMEOUT',
  'CAPTURE_STATEMENT_TIMEOUT',
  'CAPTURE_RPC_DEADLINE_EXCEEDED',
  'CAPTURE_WORK_UNIT_NOT_FOUND',
  'CAPTURE_PURPOSE_BINDING_MISMATCH',
  'CAPTURE_LEASE_INVALID',
  'CAPTURE_WORK_UNIT_CAS_MISMATCH',
  'CAPTURE_SCOPE_MISMATCH',
  'CAPTURE_RUN_INVALID',
  'CAPTURE_ACTIVATION_INACTIVE',
  'CAPTURE_ACTIVATION_NOT_CURRENT',
  'CAPTURE_CONNECTION_INACTIVE',
  'CAPTURE_CREDENTIAL_INACTIVE',
  'CAPTURE_INTEGRITY_KEY_INVALID',
  'CAPTURE_TRANSITION_MAC_MISMATCH',
  'CAPTURE_CHECKPOINT_MAC_INVALID',
  'CAPTURE_CHECKPOINT_MAC_MISMATCH',
  'CAPTURE_ACCOUNT_IDENTITY_INACTIVE',
  'CAPTURE_LEDGER_CAS_MISMATCH',
  'CAPTURE_PROVIDER_BLOCKED',
  'CAPTURE_READONLY_CONTRACT_MISMATCH',
  'CAPTURE_TRANSPORT_CONTRACT_MISMATCH',
  'CAPTURE_REQUEST_RESULT_REPLAY',
  'CAPTURE_REQUEST_QUERY_MISMATCH',
  'CAPTURE_RAW_BODY_INVALID',
  'CAPTURE_RAW_BODY_DIGEST_MISMATCH',
  'CAPTURE_BODY_ENVELOPE_MISMATCH',
  'CAPTURE_BODY_EVENT_MISMATCH',
  'CAPTURE_NEXT_CHECKPOINT_MISMATCH',
  'CAPTURE_PAGE_METADATA_MISMATCH',
  'CAPTURE_PAGE_DIGEST_MISMATCH',
  'CAPTURE_EVENT_SHAPE_INVALID',
  'CAPTURE_EVENT_CONTRACT_MISMATCH',
  'CAPTURE_LEDGER_OCCURRENCE_MISMATCH',
  'CAPTURE_IDENTITY_COLLISION',
  'CAPTURE_OBSERVATION_DIGEST_MISMATCH',
  'CAPTURE_COUNT_MISMATCH',
])

function fail(code: BrokerCapturePersistenceErrorCode, message: string): never {
  throw new BrokerCapturePersistenceError(code, message)
}

function exactKeys(input: object, expected: readonly string[], label: string) {
  const actual = Object.keys(input).sort()
  const canonicalExpected = [...expected].sort()
  if (actual.length !== canonicalExpected.length || actual.some((key, index) => key !== canonicalExpected[index])) {
    fail('invalid_input', `${label} enthält unbekannte oder fehlende Felder.`)
  }
}

function uuid(value: unknown, label: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) fail('invalid_input', `${label} ist keine kanonische UUID.`)
  return value
}

function safeInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('invalid_input', `${label} liegt außerhalb des zulässigen Integerbereichs.`)
  }
  return value as number
}

function integrityKey(value: unknown) {
  if (!(value instanceof Uint8Array) || value.byteLength < 32 || value.byteLength > 64) {
    fail('invalid_input', 'Capture-Integritätsschlüssel muss 32 bis 64 Byte besitzen.')
  }
  return Buffer.from(value)
}

function integrityKeyVersion(value: unknown) {
  if (typeof value !== 'string' || !INTEGRITY_KEY_VERSION_PATTERN.test(value)) {
    fail('invalid_input', 'Capture-Integritätsschlüsselversion ist ungültig.')
  }
  return value
}

function transitionJsonToTcj(
  value: unknown,
  state: { nodes: number },
  depth = 0,
): EquoraTcjValue {
  state.nodes += 1
  if (state.nodes > MAX_SERIALIZED_NODES || depth > MAX_TRANSITION_DEPTH) {
    fail('capture_transition_mismatch', 'Capture Transition überschreitet das kanonische Arbeitsbudget.')
  }
  if (value === null) return tcjNull()
  if (typeof value === 'boolean') return tcjBoolean(value)
  if (typeof value === 'string') return tcjString(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('capture_transition_mismatch', 'Capture Transition enthält eine ungültige Zahl.')
    return tcjJsonNumber(String(value))
  }
  if (Array.isArray(value)) {
    return tcjOrderedArray(value.map((item) => transitionJsonToTcj(item, state, depth + 1)))
  }
  if (value && typeof value === 'object') {
    return tcjObject(Object.entries(value).map(([key, item]) => [
      key,
      transitionJsonToTcj(item, state, depth + 1),
    ] as const))
  }
  return fail('capture_transition_mismatch', 'Capture Transition enthält einen nicht kanonisierbaren Wert.')
}

function captureTransitionMac(
  unsignedArguments: Readonly<Record<string, unknown>>,
  key: Uint8Array,
) {
  const encoded = encodeEquoraTcj(transitionJsonToTcj(unsignedArguments, { nodes: 0 }))
  return createHmac('sha256', key)
    .update(BROKER_CAPTURE_TRANSITION_DOMAIN, 'utf8')
    .update(Buffer.from([0]))
    .update(encoded, 'utf8')
    .digest('hex')
}

function unixMicrosecondsToIso(value: string, label: string) {
  if (!CANONICAL_INTEGER_PATTERN.test(value)) fail('capture_transition_mismatch', `${label} ist kein kanonischer Unix-Mikrosekundenwert.`)
  const microseconds = BigInt(value)
  const milliseconds = microseconds / BigInt(1_000)
  const microsecondRemainder = microseconds % BigInt(1_000)
  const numericMilliseconds = Number(milliseconds)
  if (!Number.isSafeInteger(numericMilliseconds)) fail('capture_transition_mismatch', `${label} liegt außerhalb des sicheren Datumsbereichs.`)
  const iso = new Date(numericMilliseconds).toISOString()
  return `${iso.slice(0, -1)}${microsecondRemainder.toString().padStart(3, '0')}Z`
}

function stringifyMexcJsonLossless(
  value: MexcJsonValue,
  state: { nodes: number },
): string {
  state.nodes += 1
  if (state.nodes > MAX_SERIALIZED_NODES) fail('capture_transition_mismatch', 'Raw Payload überschreitet das Serialisierungsbudget.')
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return JSON.stringify(value)
  if (isMexcJsonNumber(value)) return value.lexeme
  if (isMexcJsonArray(value)) return `[${value.map((item) => stringifyMexcJsonLossless(item, state)).join(',')}]`
  if (isMexcJsonObject(value)) {
    const keys = Object.keys(value).sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')))
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stringifyMexcJsonLossless(value[key]!, state)}`).join(',')}}`
  }
  return fail('capture_transition_mismatch', 'Raw Payload enthält einen nicht serialisierbaren Wert.')
}

function sameDigest(
  left: { digestAlgorithm: string; digestContractVersion: string; domain: string; digest: string },
  right: { digestAlgorithm: string; digestContractVersion: string; domain: string; digest: string },
) {
  return left.digestAlgorithm === right.digestAlgorithm
    && left.digestContractVersion === right.digestContractVersion
    && left.domain === right.domain
    && left.digest === right.digest
}

function pageMetadata(result: MexcCapturedPageResult) {
  const observation = result.rawLedgerTransition!.pageObservation
  return Object.freeze({
    requestPageNumber: observation.requestPageNumber,
    requestScope: observation.requestScope,
    terminalEvidence: observation.terminalEvidence,
    providerPage: observation.providerPage,
    cursor: observation.cursor,
    orderedRawEventContentDigests: observation.orderedRawEventContentDigests.map((digest) => Object.freeze({ ...digest })),
    authorityBlocked: true,
  })
}

function serializedEvents(result: MexcCapturedPageResult) {
  const transition = result.rawLedgerTransition!
  const records = new Map(transition.state.rawEvents.map((event) => [event.membershipKey, event] as const))
  const indexes = new Set<number>()
  const events = transition.observations.map((observation) => {
    const event = records.get(observation.rawEventMembershipKey)
    if (!event) fail('capture_transition_mismatch', 'Observation besitzt kein zugehöriges Raw Event.')
    if (indexes.has(observation.eventIndex)) fail('capture_transition_mismatch', 'Observation besitzt einen doppelten Eventindex.')
    indexes.add(observation.eventIndex)
    if (
      observation.requestResultReference.value !== transition.pageObservation.requestResultReference.value
      || observation.runReference.value !== transition.pageObservation.runReference.value
      || !sameDigest(observation.pageObservationDigest, transition.pageObservation.pageObservationDigest)
    ) fail('capture_transition_mismatch', 'Observation widerspricht der gebundenen Page Observation.')

    return Object.freeze({
      accountIdentityDigest: event.accountIdentity.digest,
      digestAlgorithm: event.rawEventContentDigest.digestAlgorithm,
      digestContractVersion: event.rawEventContentDigest.digestContractVersion,
      endpointId: event.endpointId,
      eventIndex: observation.eventIndex,
      eventType: event.eventType,
      externalEventId: event.externalEventId,
      firstObservedAtUs: event.firstObservedAtUs,
      identityStatus: event.identityStatus,
      membershipKey: event.membershipKey,
      observationDigest: observation.observationDigest.digest,
      observedAtUs: observation.observedAtUs,
      occurrence: observation.occurrence,
      pageObservationDigest: observation.pageObservationDigest.digest,
      providerCode: event.providerCode,
      providerContractVersion: event.providerContractVersion,
      providerOccurredAtUs: event.providerOccurredAtUs,
      providerRevision: event.providerRevision,
      providerRevisionAuthority: event.providerRevisionAuthority,
      rawEventContentDigest: event.rawEventContentDigest.digest,
      rawPayloadJson: stringifyMexcJsonLossless(event.rawPayload, { nodes: 0 }),
      revisionDiscriminator: event.revisionDiscriminator,
      revisionDiscriminatorValue: event.revisionDiscriminatorValue,
    })
  })
  if (indexes.size !== transition.observations.length || [...indexes].some((value) => value < 0 || value >= events.length)) {
    fail('capture_transition_mismatch', 'Observation-Eventindizes bilden keine geschlossene Page.')
  }
  return Object.freeze(events.sort((left, right) => left.eventIndex - right.eventIndex))
}

export function buildBrokerCapturePageRpcArguments(input: BrokerCapturePageCommitInput): BrokerCapturePageRpcArguments {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_input', 'Broker Capture Commit Input fehlt.')
  exactKeys(input, [
    'capturedPage',
    'expectedWorkUnitRowVersion',
    'integrityKey',
    'integrityKeyVersion',
    'leaseToken',
    'wireResponse',
  ], 'Broker Capture Commit Input')
  const leaseToken = uuid(input.leaseToken, 'leaseToken')
  const transitionIntegrityKey = integrityKey(input.integrityKey)
  const transitionIntegrityKeyVersion = integrityKeyVersion(input.integrityKeyVersion)
  const wireResponse = inspectMexcWireResponse(input.wireResponse)
  const capturedPage = inspectMexcCapturedPageResultForWireResponse(input.capturedPage, wireResponse)
  const expectedWorkUnitRowVersion = safeInteger(input.expectedWorkUnitRowVersion, 0, Number.MAX_SAFE_INTEGER - 1, 'expectedWorkUnitRowVersion')

  if (capturedPage.status !== 'page_committed' || capturedPage.rawLedgerTransition === null) {
    fail('capture_not_committable', 'Nur eine vollständig abgeleitete Page darf persistiert werden.')
  }
  const binding = wireResponse.captureBinding
  if (binding === null) fail('capture_binding_mismatch', 'Persistierbare Brokerpage benötigt eine private Capture Binding.')
  const transition = capturedPage.rawLedgerTransition
  const page = transition.pageObservation
  const nextCheckpoint = capturedPage.pageTransition.checkpoint
  if (
    binding.brokerAccountId !== capturedPage.syncScope.brokerAccountId
    || binding.workUnitReference.value !== capturedPage.commitPrecondition.workUnitId
    || binding.runReference.value !== capturedPage.commitPrecondition.runId
    || binding.brokerAccountId !== capturedPage.commitPrecondition.brokerAccountId
    || binding.connectionAccountId !== capturedPage.commitPrecondition.connectionAccountId
    || binding.syncActivationId !== capturedPage.commitPrecondition.syncActivationId
    || binding.activationGeneration !== capturedPage.commitPrecondition.activationGeneration
    || binding.scopeDigest.digest !== capturedPage.commitPrecondition.scopeDigest
    || binding.syncActivationId !== capturedPage.syncScope.syncActivationId
    || binding.activationGeneration !== capturedPage.syncScope.activationGeneration
    || binding.requestResultReference.value !== page.requestResultReference.value
    || binding.runReference.value !== page.runReference.value
    || binding.requestSequence !== page.requestSequence
    || !sameDigest(binding.scopeDigest, capturedPage.syncScope.scopeDigest)
    || !sameDigest(page.scopeDigest, capturedPage.syncScope.scopeDigest)
    || !sameDigest(page.rawBodyDigest, wireResponse.rawBodyDigest)
    || page.rawBodyBytes !== wireResponse.rawBodyBytes
    || transition.state.ledgerGeneration !== capturedPage.commitPrecondition.expectedLedgerGeneration + 1
    || transition.counts.insertedRawEvents + transition.counts.repeatedObservations !== transition.observations.length
    || page.observedAtUs !== wireResponse.responseReceivedAtUs
    || transition.observations.some((observation) => observation.observedAtUs !== wireResponse.responseReceivedAtUs)
  ) fail('capture_binding_mismatch', 'Capture Result, Wire Response und Persistenzbindung widersprechen sich.')

  if (
    !Object.isFrozen(capturedPage.commitPrecondition)
    || !UUID_PATTERN.test(capturedPage.commitPrecondition.workUnitId)
    || !UUID_PATTERN.test(capturedPage.commitPrecondition.runId)
    || !UUID_PATTERN.test(capturedPage.commitPrecondition.brokerAccountId)
    || !UUID_PATTERN.test(capturedPage.commitPrecondition.connectionAccountId)
    || !UUID_PATTERN.test(capturedPage.commitPrecondition.syncActivationId)
    || !Number.isSafeInteger(capturedPage.commitPrecondition.activationGeneration)
    || capturedPage.commitPrecondition.activationGeneration < 1
    || !SHA256_PATTERN.test(capturedPage.commitPrecondition.scopeDigest)
    || !SHA256_PATTERN.test(capturedPage.commitPrecondition.expectedCheckpointMac)
    || !Number.isSafeInteger(capturedPage.commitPrecondition.expectedLedgerGeneration)
    || capturedPage.commitPrecondition.expectedLedgerGeneration < 0
    || !SHA256_PATTERN.test(nextCheckpoint.checkpointMac)
  ) fail('capture_transition_mismatch', 'Capture Commit Precondition ist ungültig.')

  const url = new URL(wireResponse.request.url)
  const unsignedArguments = Object.freeze({
    p_work_unit_id: capturedPage.commitPrecondition.workUnitId,
    p_expected_run_id: capturedPage.commitPrecondition.runId,
    p_expected_broker_account_id: capturedPage.commitPrecondition.brokerAccountId,
    p_expected_connection_account_id: capturedPage.commitPrecondition.connectionAccountId,
    p_expected_sync_activation_id: capturedPage.commitPrecondition.syncActivationId,
    p_expected_activation_generation: capturedPage.commitPrecondition.activationGeneration,
    p_expected_scope_digest: capturedPage.commitPrecondition.scopeDigest,
    p_transition_mac_version: BROKER_CAPTURE_TRANSITION_MAC_VERSION,
    p_transition_integrity_key_version: transitionIntegrityKeyVersion,
    p_lease_token: leaseToken,
    p_expected_work_unit_row_version: expectedWorkUnitRowVersion,
    p_expected_checkpoint_mac: capturedPage.commitPrecondition.expectedCheckpointMac,
    p_expected_ledger_generation: capturedPage.commitPrecondition.expectedLedgerGeneration,
    p_request_result_id: binding.requestResultReference.value,
    p_request_sequence: binding.requestSequence,
    p_method: wireResponse.request.method,
    p_request_origin: url.origin,
    p_request_path: wireResponse.request.path,
    p_request_query: Object.freeze({ ...wireResponse.request.query }),
    p_transport_contract_version: wireResponse.request.contractVersion,
    p_request_started_at: unixMicrosecondsToIso(wireResponse.requestStartedAtUs, 'requestStartedAtUs'),
    p_response_received_at: unixMicrosecondsToIso(wireResponse.responseReceivedAtUs, 'responseReceivedAtUs'),
    p_request_duration_ms: wireResponse.requestDurationMs,
    p_http_status: wireResponse.httpStatus,
    p_provider_status_class: 'success',
    p_response_classification: page.responseClassification,
    p_raw_body_base64: wireResponse.rawBodyBase64,
    p_raw_body_digest: wireResponse.rawBodyDigest.digest,
    p_raw_body_bytes: wireResponse.rawBodyBytes,
    p_page_observation_digest: page.pageObservationDigest.digest,
    p_page_metadata: pageMetadata(capturedPage),
    p_scope_completeness: transition.scopeCompleteness,
    p_next_checkpoint: nextCheckpoint as unknown as Readonly<Record<string, unknown>>,
    p_next_checkpoint_mac: nextCheckpoint.checkpointMac,
    p_next_checkpoint_status: nextCheckpoint.status,
    p_next_checkpoint_reason: nextCheckpoint.reason,
    p_next_page_number: nextCheckpoint.nextPageNumber,
    p_events: serializedEvents(capturedPage),
  })
  let transitionMac: string
  try {
    transitionMac = captureTransitionMac(unsignedArguments, transitionIntegrityKey)
  } finally {
    transitionIntegrityKey.fill(0)
  }
  return Object.freeze({
    ...unsignedArguments,
    p_transition_mac: transitionMac,
  })
}

function databaseErrorCode(message: string | undefined, structuredCode: string | undefined) {
  if (structuredCode === '55P03') return 'CAPTURE_LOCK_TIMEOUT'
  if (structuredCode === '57014') return 'CAPTURE_STATEMENT_TIMEOUT'
  const match = message?.match(/\bCAPTURE_[A-Z_]+\b/)
  const code = match?.[0] as BrokerCapturePersistenceErrorCode | undefined
  return code && DATABASE_CODES.has(code) ? code : null
}

function validateDatabaseResult(
  input: BrokerCapturePageCommitInput,
  value: unknown,
): BrokerCapturePageCommitResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('database_result_invalid', 'Page-Commit lieferte kein geschlossenes Ergebnis.')
  }
  exactKeys(value, [
    'authorityBlocked',
    'insertedRawEvents',
    'ledgerGeneration',
    'observations',
    'repeatedObservations',
    'requestResultId',
    'scopeCompleteness',
    'status',
    'workUnitRowVersion',
  ], 'Page-Commit Ergebnis')
  const result = value as Record<string, unknown>
  const transition = input.capturedPage.rawLedgerTransition!
  const expectedRequestResultId = transition.pageObservation.requestResultReference.value
  if (
    result.status !== 'page_committed'
    || result.requestResultId !== expectedRequestResultId
    || result.authorityBlocked !== true
    || result.scopeCompleteness !== transition.scopeCompleteness
    || result.workUnitRowVersion !== input.expectedWorkUnitRowVersion + 1
    || result.ledgerGeneration !== input.capturedPage.commitPrecondition.expectedLedgerGeneration + 1
    || result.insertedRawEvents !== transition.counts.insertedRawEvents
    || result.repeatedObservations !== transition.counts.repeatedObservations
    || result.observations !== transition.observations.length
  ) fail('database_result_invalid', 'Page-Commit Ergebnis widerspricht der authentischen Capture Transition.')
  return Object.freeze(result as unknown as BrokerCapturePageCommitResult)
}

export async function commitBrokerCapturePageWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: BrokerCapturePageCommitInput,
): Promise<BrokerCapturePageCommitResult> {
  const args = buildBrokerCapturePageRpcArguments(input)
  const { data, error } = await client.rpc(BROKER_CAPTURE_PAGE_COMMIT_RPC, args)
  if (error) {
    const code = databaseErrorCode(error.message, error.code)
    if (code) fail(code, 'Der atomare Broker-Page-Commit wurde von der Datenbank abgelehnt.')
    fail('database_error', 'Der atomare Broker-Page-Commit ist fehlgeschlagen; es wurden keine Teilergebnisse akzeptiert.')
  }
  return validateDatabaseResult(input, data)
}

export async function commitBrokerCapturePage(
  input: BrokerCapturePageCommitInput,
): Promise<BrokerCapturePageCommitResult> {
  return commitBrokerCapturePageWithClient(createSupabaseServerClient(), input)
}

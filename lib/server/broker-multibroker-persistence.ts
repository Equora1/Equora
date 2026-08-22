import { isProxy } from 'node:util/types'
import { Buffer } from 'node:buffer'
import type { SupabaseClient } from '@supabase/supabase-js'

export const BROKER_OPERATOR_COMMAND_RPC_V2 = 'equora_apply_broker_operator_command_v2' as const
export const PROVIDER_CAPTURE_REQUEST_AUTHORIZATION_RPC_V2 = 'equora_authorize_provider_capture_request_v2' as const
export const PROVIDER_CAPTURE_PAGE_COMMIT_RPC_V2 = 'equora_commit_provider_capture_page_v2' as const

export const BROKER_OPERATOR_COMMAND_POLICY_V2 = 'equora_provider_operator_command_v2' as const
export const PROVIDER_REQUEST_AUTHORITY_POLICY_V2 = 'equora_provider_request_authority_v2' as const
export const PROVIDER_PAGE_COMMIT_POLICY_V2 = 'equora_provider_page_commit_v2' as const

export type ProviderOperatorAction = 'enroll' | 'resume' | 'suspend' | 'revoke'

export type ProviderContractPinsV2 = Readonly<{
  providerCode: string
  providerContractVersion: string
  capabilityId: string
  capabilityContractVersion: string
}>

export type BrokerOperatorCommandV2 = Readonly<{
  commandId: string
  enrollmentId: string
  action: ProviderOperatorAction
  userId: string
  brokerAccountId: string
  contractPins: ProviderContractPinsV2
  expectedGeneration: number
  commandDigest: string
}>

export type ProviderRequestAuthorizationV2 = Readonly<{
  requestAuthorizationId: string
  enrollmentId: string
  expectedEnrollmentGeneration: number
  workUnitId: string
  expectedWorkUnitRowVersion: number
  requestSequence: number
  expectedCheckpointRowVersion: number
  expectedCheckpointGeneration: number
  expectedCheckpointMac: string
  pageScopeDigest: string
  queryDigest: string
  requestPlanDigest: string
  sendDeadlineAt: string
}>

export type ProviderRawEnvelopeV2 = Readonly<{
  providerCode: string
  providerContractVersion: string
  capabilityId: string
  capabilityContractVersion: string
  queryContractVersion: string
  cursorContractVersion: string
  responseContractVersion: string
  rawEnvelopeContractVersion: 'equora_provider_raw_envelope_v2'
  normalizationContractVersion: 'blocked_pending_versioned_normalization'
  requestPlanDigest: string
  requestSequence: number
  pageSequence: number
  rawBodyDigest: string
  responseDigest: string
  observedAtUtc: string
}>

export type ProviderPageCommitV2 = Readonly<{
  pageCommitId: string
  requestAuthorizationId: string
  workUnitId: string
  expectedEnrollmentGeneration: number
  expectedWorkUnitRowVersion: number
  expectedCheckpointRowVersion: number
  expectedCheckpointGeneration: number
  expectedCheckpointMac: string
  requestSequence: number
  requestPlanDigest: string
  rawEnvelope: ProviderRawEnvelopeV2
  rawEnvelopeDigest: string
  responseDigest: string
  nextCheckpointPayload: Readonly<{
    pageSequence: number
    cursor: string | number | null
  }>
  nextCheckpointMac: string
  nextCheckpointStatus: 'continue' | 'complete' | 'partial' | 'blocked'
  scopeCompleteness: 'unverified' | 'partial' | 'failed'
}>

export type BrokerOperatorCommandResultV2 = Readonly<{
  status: 'operator_command_applied'
  commandId: string
  enrollmentId: string
  providerCode: string
  capabilityId: string
  runtimeState: 'suspended' | 'active' | 'revoked'
  generation: number
  authorityEpoch: number
  runtimeDefaultedActive: false
}>

export type ProviderRequestAuthorizationResultV2 = Readonly<{
  status: 'request_authorized'
  requestAuthorizationId: string
  workUnitId: string
  requestSequence: number
  authorizationAttempt: number
  sendDeadlineAt: string
  authorityBlocked: true
}>

export type ProviderPageCommitResultV2 = Readonly<{
  status: 'page_committed'
  pageCommitId: string
  requestAuthorizationId: string
  workUnitId: string
  requestSequence: number
  checkpointGeneration: number
  checkpointStatus: 'continue' | 'complete' | 'partial' | 'blocked'
  scopeCompleteness: 'unverified' | 'partial' | 'failed'
  normalizationAuthority: 'none'
  reconciliationAuthority: 'none'
  approvalAuthority: 'none'
  importAuthority: 'none'
}>

export type BrokerMultibrokerPersistenceErrorCode =
  | 'invalid_input'
  | 'schema_unavailable'
  | 'database_rejected'
  | 'database_error'
  | 'database_result_invalid'

export class BrokerMultibrokerPersistenceError extends Error {
  constructor(
    public readonly code: BrokerMultibrokerPersistenceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'BrokerMultibrokerPersistenceError'
  }
}

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const VERSION_PATTERN = /^[a-z][a-z0-9_.-]{0,126}$/
const PROVIDER_PATTERN = /^[a-z][a-z0-9_]{0,62}$/
const MAX_JSON_DEPTH = 32
const MAX_JSON_NODES = 10_000

function fail(code: BrokerMultibrokerPersistenceErrorCode, message: string): never {
  throw new BrokerMultibrokerPersistenceError(code, message)
}

function frozenDataObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || !Object.isFrozen(value)
    || Object.getOwnPropertySymbols(value).length !== 0
  ) fail('invalid_input', `${label} muss ein eingefrorenes, unverfälschtes Datenobjekt sein.`)

  const descriptors = Object.getOwnPropertyDescriptors(value)
  const actualKeys = Object.keys(descriptors).sort()
  const canonicalExpected = [...expectedKeys].sort()
  if (
    actualKeys.length !== canonicalExpected.length
    || actualKeys.some((key, index) => key !== canonicalExpected[index])
  ) fail('invalid_input', `${label} enthält unbekannte oder fehlende Felder.`)

  const snapshot: Record<string, unknown> = {}
  for (const key of canonicalExpected) {
    const descriptor = descriptors[key]
    if (
      !descriptor
      || !('value' in descriptor)
      || descriptor.get
      || descriptor.set
      || !descriptor.enumerable
      || descriptor.configurable
      || descriptor.writable
    ) fail('invalid_input', `${label}.${key} ist kein unveränderliches Datenfeld.`)
    snapshot[key] = descriptor.value
  }
  return Object.freeze(snapshot)
}

function uuid(value: unknown, label: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail('invalid_input', `${label} ist keine kanonische UUID.`)
  }
  return value
}

function digest(value: unknown, label: string) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail('invalid_input', `${label} ist kein SHA-256-Digest.`)
  }
  return value
}

function version(value: unknown, label: string) {
  if (typeof value !== 'string' || !VERSION_PATTERN.test(value)) {
    fail('invalid_input', `${label} ist keine kanonische Vertragsversion.`)
  }
  return value
}

function safeInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('invalid_input', `${label} liegt außerhalb des zulässigen Integerbereichs.`)
  }
  return value as number
}

function utcTicks100ns(value: unknown, allowZeroOffset = false): bigint | null {
  if (typeof value !== 'string') return null
  const zone = allowZeroOffset ? '(?:Z|\\+00:00)' : 'Z'
  const match = new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d{1,7}))?${zone}$`).exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second, fraction = ''] = match
  const epochSecondMs = Date.UTC(
    Number(year), Number(month) - 1, Number(day),
    Number(hour), Number(minute), Number(second), 0,
  )
  const roundtrip = Number.isFinite(epochSecondMs) ? new Date(epochSecondMs) : null
  if (
    !roundtrip
    || roundtrip.getUTCFullYear() !== Number(year)
    || roundtrip.getUTCMonth() + 1 !== Number(month)
    || roundtrip.getUTCDate() !== Number(day)
    || roundtrip.getUTCHours() !== Number(hour)
    || roundtrip.getUTCMinutes() !== Number(minute)
    || roundtrip.getUTCSeconds() !== Number(second)
  ) return null
  return BigInt(epochSecondMs / 1_000) * BigInt(10_000_000)
    + BigInt(fraction.padEnd(7, '0') || '0')
}

function isoUtc(value: unknown, label: string, future = false, maxFractionDigits = 7) {
  if (typeof value !== 'string') fail('invalid_input', `${label} ist kein kanonischer UTC-Zeitstempel.`)
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?Z$/.exec(value)
  if (!match || (match[7]?.length ?? 0) > maxFractionDigits) {
    fail('invalid_input', `${label} ist kein kanonischer UTC-Zeitstempel.`)
  }
  const [, year, month, day, hour, minute, second] = match
  const timestamp = Date.parse(value)
  const roundtrip = Number.isFinite(timestamp) ? new Date(timestamp) : null
  if (
    !roundtrip
    || roundtrip.getUTCFullYear() !== Number(year)
    || roundtrip.getUTCMonth() + 1 !== Number(month)
    || roundtrip.getUTCDate() !== Number(day)
    || roundtrip.getUTCHours() !== Number(hour)
    || roundtrip.getUTCMinutes() !== Number(minute)
    || roundtrip.getUTCSeconds() !== Number(second)
    || utcTicks100ns(value) === null
    || (future && timestamp <= Date.now() - 1_000)
  ) {
    fail('invalid_input', `${label} ist zeitlich ungültig.`)
  }
  return value
}

function checkpointCursor(
  cursorContractVersion: string,
  cursor: unknown,
): string | number | null {
  if (cursorContractVersion === 'mexc_page_number_cursor_v1') {
    if (cursor !== null) fail('invalid_input', 'MEXC-Page-Number-Cursor muss null bleiben.')
    return null
  }
  if (cursorContractVersion !== 'equora_opaque_scalar_cursor_v1') {
    fail('invalid_input', 'Checkpoint-Cursor-Vertrag wird nicht unterstützt.')
  }
  if (cursor === null) return null
  if (typeof cursor === 'string') {
    if (Buffer.byteLength(cursor, 'utf8') < 1 || Buffer.byteLength(cursor, 'utf8') > 1024) {
      fail('invalid_input', 'Opaque Checkpoint-Cursor ist leer oder zu groß.')
    }
    return cursor
  }
  if (typeof cursor === 'number' && Number.isSafeInteger(cursor)) return cursor
  fail('invalid_input', 'Opaque Checkpoint-Cursor ist kein kanonischer Skalar.')
}

function frozenDataArray(value: unknown, label: string): readonly unknown[] {
  if (
    !Array.isArray(value)
    || isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || !Object.isFrozen(value)
  ) fail('invalid_input', `${label} muss ein eingefrorenes, unverfälschtes Array sein.`)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const expectedKeys = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  const actualKeys = [
    ...Object.getOwnPropertyNames(descriptors),
    ...Object.getOwnPropertySymbols(descriptors),
  ]
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) fail('invalid_input', `${label} ist nicht dicht oder enthält unbekannte Felder.`)
  const snapshot: unknown[] = []
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)]
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      fail('invalid_input', `${label}[${index}] ist kein unveränderliches Datenfeld.`)
    }
    snapshot.push(descriptor.value)
  }
  return Object.freeze(snapshot)
}

function validateJson(
  value: unknown,
  state: { nodes: number },
  depth = 0,
): unknown {
  state.nodes += 1
  if (state.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
    fail('invalid_input', 'Checkpointpayload überschreitet das kanonische Arbeitsbudget.')
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid_input', 'Checkpointpayload enthält eine ungültige Zahl.')
    return value
  }
  if (Array.isArray(value)) {
    const source = frozenDataArray(value, 'Checkpointarray')
    const snapshot: unknown[] = []
    for (let index = 0; index < source.length; index += 1) {
      snapshot.push(validateJson(source[index], state, depth + 1))
    }
    return Object.freeze(snapshot)
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    const snapshot = frozenDataObject(value, keys, 'Checkpointobjekt')
    return Object.freeze(Object.fromEntries(
      keys.sort().map((key) => [key, validateJson(snapshot[key], state, depth + 1)]),
    ))
  }
  return fail('invalid_input', 'Checkpointpayload enthält einen nicht kanonisierbaren Wert.')
}

function validateContractPins(value: unknown) {
  const pins = frozenDataObject(value, [
    'capabilityContractVersion',
    'capabilityId',
    'providerCode',
    'providerContractVersion',
  ], 'Contractpins')
  if (typeof pins.providerCode !== 'string' || !PROVIDER_PATTERN.test(pins.providerCode)) {
    fail('invalid_input', 'providerCode ist ungültig.')
  }
  return Object.freeze({
    providerCode: pins.providerCode,
    providerContractVersion: version(pins.providerContractVersion, 'providerContractVersion'),
    capabilityId: version(pins.capabilityId, 'capabilityId'),
    capabilityContractVersion: version(pins.capabilityContractVersion, 'capabilityContractVersion'),
  })
}

function validateOperatorInput(input: BrokerOperatorCommandV2) {
  const snapshot = frozenDataObject(input, [
    'action', 'brokerAccountId', 'commandDigest', 'commandId', 'contractPins',
    'enrollmentId', 'expectedGeneration', 'userId',
  ], 'Operatorcommand')
  if (!['enroll', 'resume', 'suspend', 'revoke'].includes(String(snapshot.action))) {
    fail('invalid_input', 'Operatoraction ist nicht registriert.')
  }
  return Object.freeze({
    commandId: uuid(snapshot.commandId, 'commandId'),
    enrollmentId: uuid(snapshot.enrollmentId, 'enrollmentId'),
    action: snapshot.action as ProviderOperatorAction,
    userId: uuid(snapshot.userId, 'userId'),
    brokerAccountId: uuid(snapshot.brokerAccountId, 'brokerAccountId'),
    contractPins: validateContractPins(snapshot.contractPins),
    expectedGeneration: safeInteger(snapshot.expectedGeneration, 0, Number.MAX_SAFE_INTEGER - 1, 'expectedGeneration'),
    commandDigest: digest(snapshot.commandDigest, 'commandDigest'),
  })
}

function validateRequestAuthorizationInput(input: ProviderRequestAuthorizationV2) {
  const snapshot = frozenDataObject(input, [
    'enrollmentId', 'expectedCheckpointGeneration', 'expectedCheckpointMac',
    'expectedCheckpointRowVersion', 'expectedEnrollmentGeneration',
    'expectedWorkUnitRowVersion', 'pageScopeDigest', 'queryDigest',
    'requestAuthorizationId', 'requestPlanDigest', 'requestSequence',
    'sendDeadlineAt', 'workUnitId',
  ], 'Requestauthority')
  return Object.freeze({
    requestAuthorizationId: uuid(snapshot.requestAuthorizationId, 'requestAuthorizationId'),
    enrollmentId: uuid(snapshot.enrollmentId, 'enrollmentId'),
    expectedEnrollmentGeneration: safeInteger(snapshot.expectedEnrollmentGeneration, 1, Number.MAX_SAFE_INTEGER, 'expectedEnrollmentGeneration'),
    workUnitId: uuid(snapshot.workUnitId, 'workUnitId'),
    expectedWorkUnitRowVersion: safeInteger(snapshot.expectedWorkUnitRowVersion, 0, Number.MAX_SAFE_INTEGER - 1, 'expectedWorkUnitRowVersion'),
    requestSequence: safeInteger(snapshot.requestSequence, 1, Number.MAX_SAFE_INTEGER, 'requestSequence'),
    expectedCheckpointRowVersion: safeInteger(snapshot.expectedCheckpointRowVersion, 0, Number.MAX_SAFE_INTEGER - 1, 'expectedCheckpointRowVersion'),
    expectedCheckpointGeneration: safeInteger(snapshot.expectedCheckpointGeneration, 0, Number.MAX_SAFE_INTEGER - 1, 'expectedCheckpointGeneration'),
    expectedCheckpointMac: digest(snapshot.expectedCheckpointMac, 'expectedCheckpointMac'),
    pageScopeDigest: digest(snapshot.pageScopeDigest, 'pageScopeDigest'),
    queryDigest: digest(snapshot.queryDigest, 'queryDigest'),
    requestPlanDigest: digest(snapshot.requestPlanDigest, 'requestPlanDigest'),
    sendDeadlineAt: isoUtc(snapshot.sendDeadlineAt, 'sendDeadlineAt', true, 6),
  })
}

function validateRawEnvelope(value: unknown) {
  const snapshot = frozenDataObject(value, [
    'capabilityContractVersion', 'capabilityId', 'cursorContractVersion',
    'normalizationContractVersion', 'observedAtUtc', 'providerCode',
    'providerContractVersion', 'queryContractVersion', 'rawBodyDigest',
    'rawEnvelopeContractVersion', 'requestPlanDigest', 'requestSequence',
    'responseContractVersion', 'responseDigest', 'pageSequence',
  ], 'Raw Envelope')
  if (snapshot.rawEnvelopeContractVersion !== 'equora_provider_raw_envelope_v2') {
    fail('invalid_input', 'Raw-Envelope-Vertrag ist nicht v2.')
  }
  if (snapshot.normalizationContractVersion !== 'blocked_pending_versioned_normalization') {
    fail('invalid_input', 'Raw Envelope darf keine Normalisierungsautorität tragen.')
  }
  if (typeof snapshot.providerCode !== 'string' || !PROVIDER_PATTERN.test(snapshot.providerCode)) {
    fail('invalid_input', 'Raw Envelope providerCode ist ungültig.')
  }
  return Object.freeze({
    providerCode: snapshot.providerCode,
    providerContractVersion: version(snapshot.providerContractVersion, 'raw.providerContractVersion'),
    capabilityId: version(snapshot.capabilityId, 'raw.capabilityId'),
    capabilityContractVersion: version(snapshot.capabilityContractVersion, 'raw.capabilityContractVersion'),
    queryContractVersion: version(snapshot.queryContractVersion, 'raw.queryContractVersion'),
    cursorContractVersion: version(snapshot.cursorContractVersion, 'raw.cursorContractVersion'),
    responseContractVersion: version(snapshot.responseContractVersion, 'raw.responseContractVersion'),
    rawEnvelopeContractVersion: snapshot.rawEnvelopeContractVersion,
    normalizationContractVersion: snapshot.normalizationContractVersion,
    requestPlanDigest: digest(snapshot.requestPlanDigest, 'raw.requestPlanDigest'),
    requestSequence: safeInteger(snapshot.requestSequence, 1, Number.MAX_SAFE_INTEGER, 'raw.requestSequence'),
    pageSequence: safeInteger(snapshot.pageSequence, 0, Number.MAX_SAFE_INTEGER - 1, 'raw.pageSequence'),
    rawBodyDigest: digest(snapshot.rawBodyDigest, 'raw.rawBodyDigest'),
    responseDigest: digest(snapshot.responseDigest, 'raw.responseDigest'),
    observedAtUtc: isoUtc(snapshot.observedAtUtc, 'raw.observedAtUtc', false, 6),
  })
}

function validatePageCommitInput(input: ProviderPageCommitV2) {
  const snapshot = frozenDataObject(input, [
    'expectedCheckpointGeneration', 'expectedCheckpointMac',
    'expectedCheckpointRowVersion', 'expectedEnrollmentGeneration',
    'expectedWorkUnitRowVersion', 'nextCheckpointMac',
    'nextCheckpointPayload', 'nextCheckpointStatus', 'pageCommitId',
    'rawEnvelope', 'rawEnvelopeDigest', 'requestAuthorizationId',
    'requestPlanDigest', 'requestSequence', 'responseDigest',
    'scopeCompleteness', 'workUnitId',
  ], 'Page Commit')
  if (!['continue', 'complete', 'partial', 'blocked'].includes(String(snapshot.nextCheckpointStatus))) {
    fail('invalid_input', 'nextCheckpointStatus ist ungültig.')
  }
  if (!['unverified', 'partial', 'failed'].includes(String(snapshot.scopeCompleteness))) {
    fail('invalid_input', 'scopeCompleteness ist ungültig.')
  }
  const completenessIsBound = (
    (['continue', 'complete'].includes(String(snapshot.nextCheckpointStatus)) && snapshot.scopeCompleteness === 'unverified')
    || (snapshot.nextCheckpointStatus === 'partial' && snapshot.scopeCompleteness === 'partial')
    || (snapshot.nextCheckpointStatus === 'blocked' && snapshot.scopeCompleteness === 'failed')
  )
  if (!completenessIsBound) fail('invalid_input', 'Checkpointstatus und Raw-Completeness widersprechen sich.')
  const rawEnvelope = validateRawEnvelope(snapshot.rawEnvelope)
  const requestSequence = safeInteger(snapshot.requestSequence, 1, Number.MAX_SAFE_INTEGER, 'requestSequence')
  const requestPlanDigest = digest(snapshot.requestPlanDigest, 'requestPlanDigest')
  const responseDigest = digest(snapshot.responseDigest, 'responseDigest')
  const nextCheckpoint = frozenDataObject(
    snapshot.nextCheckpointPayload,
    ['cursor', 'pageSequence'],
    'Next Checkpoint Payload',
  )
  const nextPageSequence = safeInteger(
    nextCheckpoint.pageSequence,
    0,
    Number.MAX_SAFE_INTEGER,
    'nextCheckpoint.pageSequence',
  )
  const cursor = checkpointCursor(rawEnvelope.cursorContractVersion, nextCheckpoint.cursor)
  const expectedNextPageSequence = snapshot.nextCheckpointStatus === 'continue'
    ? rawEnvelope.pageSequence + 1
    : rawEnvelope.pageSequence
  if (
    rawEnvelope.requestSequence !== requestSequence
    || rawEnvelope.requestSequence !== rawEnvelope.pageSequence + 1
    || rawEnvelope.requestPlanDigest !== requestPlanDigest
    || rawEnvelope.responseDigest !== responseDigest
    || nextPageSequence !== expectedNextPageSequence
  ) fail('invalid_input', 'Raw Envelope widerspricht der Page-Commit-Bindung.')
  return Object.freeze({
    pageCommitId: uuid(snapshot.pageCommitId, 'pageCommitId'),
    requestAuthorizationId: uuid(snapshot.requestAuthorizationId, 'requestAuthorizationId'),
    workUnitId: uuid(snapshot.workUnitId, 'workUnitId'),
    expectedEnrollmentGeneration: safeInteger(snapshot.expectedEnrollmentGeneration, 1, Number.MAX_SAFE_INTEGER, 'expectedEnrollmentGeneration'),
    expectedWorkUnitRowVersion: safeInteger(snapshot.expectedWorkUnitRowVersion, 0, Number.MAX_SAFE_INTEGER - 1, 'expectedWorkUnitRowVersion'),
    expectedCheckpointRowVersion: safeInteger(snapshot.expectedCheckpointRowVersion, 0, Number.MAX_SAFE_INTEGER - 1, 'expectedCheckpointRowVersion'),
    expectedCheckpointGeneration: safeInteger(snapshot.expectedCheckpointGeneration, 0, Number.MAX_SAFE_INTEGER - 1, 'expectedCheckpointGeneration'),
    expectedCheckpointMac: digest(snapshot.expectedCheckpointMac, 'expectedCheckpointMac'),
    requestSequence,
    requestPlanDigest,
    rawEnvelope,
    rawEnvelopeDigest: digest(snapshot.rawEnvelopeDigest, 'rawEnvelopeDigest'),
    responseDigest,
    nextCheckpointPayload: Object.freeze({ pageSequence: nextPageSequence, cursor }),
    nextCheckpointMac: digest(snapshot.nextCheckpointMac, 'nextCheckpointMac'),
    nextCheckpointStatus: snapshot.nextCheckpointStatus as ProviderPageCommitV2['nextCheckpointStatus'],
    scopeCompleteness: snapshot.scopeCompleteness as ProviderPageCommitV2['scopeCompleteness'],
  })
}

function databaseFailure(error: { message?: string; code?: string } | null) {
  if (!error) return
  const message = error.message ?? ''
  if (
    error.code === '42883'
    || error.code === 'PGRST202'
    || /function .* does not exist|schema cache/i.test(message)
  ) fail('schema_unavailable', 'Der additive MB3-v2-Datenbankvertrag ist nicht installiert; Runtime bleibt geschlossen.')
  if (/\bMB3_[A-Z0-9_]+\b/.test(message)) {
    fail('database_rejected', 'Die MB3-Authority-Transaktion wurde von der Datenbank abgelehnt.')
  }
  fail('database_error', 'Die MB3-Transaktion ist ohne akzeptiertes Teilergebnis fehlgeschlagen.')
}

function resultObject(value: unknown, expected: readonly string[], label: string) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.getOwnPropertySymbols(value).length !== 0
  ) {
    fail('database_result_invalid', `${label} ist kein Datenobjekt.`)
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const actual = Object.keys(descriptors).sort()
  const canonicalExpected = [...expected].sort()
  if (actual.length !== canonicalExpected.length || actual.some((key, index) => key !== canonicalExpected[index])) {
    fail('database_result_invalid', `${label} besitzt unbekannte oder fehlende Felder.`)
  }
  const snapshot: Record<string, unknown> = {}
  for (const key of canonicalExpected) {
    const descriptor = descriptors[key]
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      fail('database_result_invalid', `${label}.${key} ist kein Datenfeld.`)
    }
    snapshot[key] = descriptor.value
  }
  return Object.freeze(snapshot)
}

function validateOperatorResult(input: ReturnType<typeof validateOperatorInput>, value: unknown): BrokerOperatorCommandResultV2 {
  const result = resultObject(value, [
    'authorityEpoch', 'capabilityId', 'commandId', 'enrollmentId', 'generation',
    'providerCode', 'runtimeDefaultedActive', 'runtimeState', 'status',
  ], 'Operatorresultat')
  const expectedState = input.action === 'resume' ? 'active'
    : input.action === 'revoke' ? 'revoked'
      : 'suspended'
  if (
    result.status !== 'operator_command_applied'
    || result.commandId !== input.commandId
    || result.enrollmentId !== input.enrollmentId
    || result.providerCode !== input.contractPins.providerCode
    || result.capabilityId !== input.contractPins.capabilityId
    || result.runtimeState !== expectedState
    || !Number.isSafeInteger(result.generation)
    || result.generation !== input.expectedGeneration + 1
    || !Number.isSafeInteger(result.authorityEpoch)
    || result.authorityEpoch !== input.expectedGeneration + 1
    || result.runtimeDefaultedActive !== false
  ) fail('database_result_invalid', 'Operatorresultat widerspricht dem Command.')
  return Object.freeze({ ...(result as BrokerOperatorCommandResultV2) })
}

function validateRequestResult(input: ReturnType<typeof validateRequestAuthorizationInput>, value: unknown): ProviderRequestAuthorizationResultV2 {
  const result = resultObject(value, [
    'authorityBlocked', 'authorizationAttempt', 'requestAuthorizationId', 'requestSequence',
    'sendDeadlineAt', 'status', 'workUnitId',
  ], 'Requestauthority-Resultat')
  if (
    result.status !== 'request_authorized'
    || result.requestAuthorizationId !== input.requestAuthorizationId
    || result.workUnitId !== input.workUnitId
    || result.requestSequence !== input.requestSequence
    || !Number.isSafeInteger(result.authorizationAttempt)
    || (result.authorizationAttempt as number) < 1
    || utcTicks100ns(result.sendDeadlineAt, true) === null
    || utcTicks100ns(result.sendDeadlineAt, true) !== utcTicks100ns(input.sendDeadlineAt)
    || result.authorityBlocked !== true
  ) fail('database_result_invalid', 'Requestauthority-Resultat widerspricht dem Input.')
  return Object.freeze({ ...(result as ProviderRequestAuthorizationResultV2) })
}

function validatePageResult(input: ReturnType<typeof validatePageCommitInput>, value: unknown): ProviderPageCommitResultV2 {
  const result = resultObject(value, [
    'approvalAuthority', 'checkpointGeneration', 'checkpointStatus',
    'importAuthority', 'normalizationAuthority', 'pageCommitId',
    'reconciliationAuthority', 'requestAuthorizationId', 'requestSequence',
    'scopeCompleteness', 'status', 'workUnitId',
  ], 'Page-Commit-Resultat')
  if (
    result.status !== 'page_committed'
    || result.pageCommitId !== input.pageCommitId
    || result.requestAuthorizationId !== input.requestAuthorizationId
    || result.workUnitId !== input.workUnitId
    || result.requestSequence !== input.requestSequence
    || result.checkpointGeneration !== input.expectedCheckpointGeneration + 1
    || result.checkpointStatus !== input.nextCheckpointStatus
    || result.scopeCompleteness !== input.scopeCompleteness
    || result.normalizationAuthority !== 'none'
    || result.reconciliationAuthority !== 'none'
    || result.approvalAuthority !== 'none'
    || result.importAuthority !== 'none'
    || typeof result.workUnitId !== 'string'
    || !UUID_PATTERN.test(result.workUnitId)
  ) fail('database_result_invalid', 'Page-Commit-Resultat erweitert oder verletzt den gebundenen Vertrag.')
  return Object.freeze({ ...(result as ProviderPageCommitResultV2) })
}

// MB3 seams remain unreferenced by Product Control-Flow in MB3 and cannot
// discover credentials, Supabase clients or transports.
export async function applyBrokerOperatorCommandV2WithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: BrokerOperatorCommandV2,
) {
  const command = validateOperatorInput(input)
  const { data, error } = await client.rpc(BROKER_OPERATOR_COMMAND_RPC_V2, {
    p_command_id: command.commandId,
    p_enrollment_id: command.enrollmentId,
    p_action: command.action,
    p_user_id: command.userId,
    p_broker_account_id: command.brokerAccountId,
    p_provider_code: command.contractPins.providerCode,
    p_provider_contract_version: command.contractPins.providerContractVersion,
    p_capability_id: command.contractPins.capabilityId,
    p_capability_contract_version: command.contractPins.capabilityContractVersion,
    p_expected_generation: command.expectedGeneration,
    p_command_policy_version: BROKER_OPERATOR_COMMAND_POLICY_V2,
    p_command_digest: command.commandDigest,
  })
  databaseFailure(error)
  return validateOperatorResult(command, data)
}

export async function authorizeProviderCaptureRequestV2WithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: ProviderRequestAuthorizationV2,
) {
  const authority = validateRequestAuthorizationInput(input)
  const { data, error } = await client.rpc(PROVIDER_CAPTURE_REQUEST_AUTHORIZATION_RPC_V2, {
    p_request_authorization_id: authority.requestAuthorizationId,
    p_enrollment_id: authority.enrollmentId,
    p_expected_enrollment_generation: authority.expectedEnrollmentGeneration,
    p_work_unit_id: authority.workUnitId,
    p_expected_work_unit_row_version: authority.expectedWorkUnitRowVersion,
    p_request_sequence: authority.requestSequence,
    p_expected_checkpoint_row_version: authority.expectedCheckpointRowVersion,
    p_expected_checkpoint_generation: authority.expectedCheckpointGeneration,
    p_expected_checkpoint_mac: authority.expectedCheckpointMac,
    p_page_scope_digest: authority.pageScopeDigest,
    p_query_digest: authority.queryDigest,
    p_request_plan_digest: authority.requestPlanDigest,
    p_send_deadline_at: authority.sendDeadlineAt,
    p_policy_version: PROVIDER_REQUEST_AUTHORITY_POLICY_V2,
  })
  databaseFailure(error)
  return validateRequestResult(authority, data)
}

export async function commitProviderCapturePageV2WithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: ProviderPageCommitV2,
) {
  const commit = validatePageCommitInput(input)
  const { data, error } = await client.rpc(PROVIDER_CAPTURE_PAGE_COMMIT_RPC_V2, {
    p_page_commit_id: commit.pageCommitId,
    p_request_authorization_id: commit.requestAuthorizationId,
    p_expected_work_unit_id: commit.workUnitId,
    p_expected_enrollment_generation: commit.expectedEnrollmentGeneration,
    p_expected_work_unit_row_version: commit.expectedWorkUnitRowVersion,
    p_expected_checkpoint_row_version: commit.expectedCheckpointRowVersion,
    p_expected_checkpoint_generation: commit.expectedCheckpointGeneration,
    p_expected_checkpoint_mac: commit.expectedCheckpointMac,
    p_request_sequence: commit.requestSequence,
    p_request_plan_digest: commit.requestPlanDigest,
    p_raw_envelope: commit.rawEnvelope,
    p_raw_envelope_digest: commit.rawEnvelopeDigest,
    p_response_digest: commit.responseDigest,
    p_next_checkpoint_payload: commit.nextCheckpointPayload,
    p_next_checkpoint_mac: commit.nextCheckpointMac,
    p_next_checkpoint_status: commit.nextCheckpointStatus,
    p_scope_completeness: commit.scopeCompleteness,
    p_commit_policy_version: PROVIDER_PAGE_COMMIT_POLICY_V2,
  })
  databaseFailure(error)
  return validatePageResult(commit, data)
}

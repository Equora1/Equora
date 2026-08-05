import 'server-only'

import { createHmac } from 'node:crypto'
import {
  digestEquoraRawResponseBody,
  isEquoraTcjDigest,
  type EquoraTcjDigest,
} from '@/lib/server/equora-tcj'
import {
  getMexcJsonIntegerLexeme,
  isMexcJsonNumber,
  parseMexcJson,
  type MexcJsonValue,
} from '@/lib/server/mexc-json'

export const MEXC_API_ORIGIN = 'https://api.mexc.com' as const
export const MEXC_TRANSPORT_CONTRACT_VERSION = 'mexc-readonly-transport-v1' as const
export const MEXC_MAX_RESPONSE_BYTES = 64 * 1024
export const MEXC_MAX_CLOCK_SKEW_MS = 60_000

const MEXC_WIRE_RESPONSE_PROVENANCE = new WeakSet<object>()

const REQUEST_TIMEOUT_MS = 12_000
const MAX_HISTORY_WINDOW_MS = 31 * 24 * 60 * 60 * 1000

export const MEXC_READ_CAPABILITIES = Object.freeze({
  server_time_v1: Object.freeze({ method: 'GET', path: '/api/v1/contract/ping', auth: 'public' }),
  contract_metadata_v1: Object.freeze({ method: 'GET', path: '/api/v1/contract/detail/country', auth: 'public' }),
  historical_orders_v1: Object.freeze({ method: 'GET', path: '/api/v1/private/order/list/history_orders', auth: 'private' }),
  historical_executions_v3: Object.freeze({ method: 'GET', path: '/api/v1/private/order/list/order_deals/v3', auth: 'private' }),
  historical_positions_v1: Object.freeze({ method: 'GET', path: '/api/v1/private/position/list/history_positions', auth: 'private' }),
  funding_records_v1: Object.freeze({ method: 'GET', path: '/api/v1/private/position/funding_records', auth: 'private' }),
} as const)

export type MexcReadCapabilityId = keyof typeof MEXC_READ_CAPABILITIES
export type MexcPrivateCapabilityId = Exclude<MexcReadCapabilityId, 'server_time_v1' | 'contract_metadata_v1'>
export type MexcPublicCapabilityId = Extract<MexcReadCapabilityId, 'server_time_v1' | 'contract_metadata_v1'>
export type MexcCredentials = Readonly<{ apiKey: string; secretKey: string }>
export type MexcBoundCredentialContext = Readonly<{
  credentials: MexcCredentials
  accountIdentity: MexcTransportCaptureBinding['accountIdentity']
  brokerAccountId: string
  syncActivationId: string
  activationGeneration: number
}>
export type MexcCredentialLoader = () =>
  | MexcCredentials
  | MexcBoundCredentialContext
  | Promise<MexcCredentials | MexcBoundCredentialContext>

export type MexcTransportErrorCode =
  | 'transport_contract_violation'
  | 'invalid_query'
  | 'invalid_provider_time'
  | 'invalid_credential'
  | 'ip_not_allowed'
  | 'permission_missing'
  | 'rate_limited'
  | 'provider_busy'
  | 'maintenance'
  | 'invalid_request'
  | 'unsupported_contract'
  | 'unknown_provider_error'
  | 'provider_unavailable'
  | 'timeout'
  | 'response_too_large'
  | 'malformed_response'

export class MexcTransportError extends Error {
  constructor(
    public readonly code: MexcTransportErrorCode,
    message: string,
    public readonly httpStatus: number | null = null,
    public readonly providerCode: string | null = null,
  ) {
    super(message)
    this.name = 'MexcTransportError'
  }
}

export type MexcPreparedRequest = Readonly<{
  capabilityId: MexcReadCapabilityId
  contractVersion: typeof MEXC_TRANSPORT_CONTRACT_VERSION
  method: 'GET'
  auth: 'public' | 'private'
  path: string
  query: Readonly<Record<string, string>>
  queryString: string
  url: string
}>

export type MexcTransportCaptureBinding = Readonly<{
  bindingVersion: 'mexc-transport-capture-binding-v1'
  accountIdentity: Readonly<{
    digestAlgorithm: 'hmac-sha256'
    digestContractVersion: 'equora-tcj-v1'
    purpose: 'broker_account_identity_v1'
    keyVersion: string
    digest: string
    verificationStatus: 'unverified_reference'
  }>
  brokerAccountId: string
  syncActivationId: string
  activationGeneration: number
  scopeDigest: EquoraTcjDigest<'sync_scope'>
  runReference: Readonly<{
    referenceType: 'sync_run_id_v1'
    value: string
  }>
  requestResultReference: Readonly<{
    referenceType: 'provider_request_result_id_v1'
    value: string
  }>
  requestSequence: number
}>

export type MexcWireResponse = Readonly<{
  request: MexcPreparedRequest
  captureBinding: MexcTransportCaptureBinding | null
  data: MexcJsonValue
  rawBodyDigest: EquoraTcjDigest<'raw_response_body'>
  rawBodyBytes: number
  requestDurationMs: number
  requestStartedAtUs: string
  responseReceivedAtUs: string
  httpStatus: number
}>

export type MexcPrivateReadWorkUnit = Readonly<{
  capabilityId: MexcPrivateCapabilityId
  query: unknown
  captureBinding?: MexcTransportCaptureBinding
}>

export type MexcPrivateReadWorkUnitResult = Readonly<{
  serverTime: number
  outcomes: readonly MexcPrivateReadOutcome[]
}>

export type MexcPrivateReadOutcome = Readonly<{
  capabilityId: MexcPrivateCapabilityId
  status: 'wire_succeeded'
  response: MexcWireResponse
}> | Readonly<{
  capabilityId: MexcPrivateCapabilityId
  status: 'failed'
  error: MexcTransportError
}>

export const MEXC_TRANSPORT_ERROR_POLICY = Object.freeze({
  transport_contract_violation: Object.freeze({ retry: 'never' }),
  invalid_query: Object.freeze({ retry: 'never' }),
  invalid_provider_time: Object.freeze({ retry: 'never_automatically' }),
  invalid_credential: Object.freeze({ retry: 'after_user_correction' }),
  ip_not_allowed: Object.freeze({ retry: 'after_user_correction' }),
  permission_missing: Object.freeze({ retry: 'after_user_correction' }),
  rate_limited: Object.freeze({ retry: 'bounded_backoff' }),
  provider_busy: Object.freeze({ retry: 'bounded_backoff' }),
  maintenance: Object.freeze({ retry: 'later' }),
  invalid_request: Object.freeze({ retry: 'never' }),
  unsupported_contract: Object.freeze({ retry: 'never' }),
  unknown_provider_error: Object.freeze({ retry: 'never_automatically' }),
  provider_unavailable: Object.freeze({ retry: 'bounded_backoff' }),
  timeout: Object.freeze({ retry: 'bounded_backoff' }),
  response_too_large: Object.freeze({ retry: 'never_automatically' }),
  malformed_response: Object.freeze({ retry: 'after_classification' }),
} satisfies Record<MexcTransportErrorCode, Readonly<{ retry: string }>>)

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(input: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(input).sort()
  const canonicalExpected = [...expected].sort()
  return actual.length === canonicalExpected.length && actual.every((key, index) => key === canonicalExpected[index])
}

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const CANONICAL_US_PATTERN = /^(?:0|[1-9]\d{15})$/

function canonicalAccountIdentity(input: unknown): MexcTransportCaptureBinding['accountIdentity'] {
  if (
    !isRecord(input)
    || !hasExactKeys(input, ['digest', 'digestAlgorithm', 'digestContractVersion', 'keyVersion', 'purpose', 'verificationStatus'])
    || input.digestAlgorithm !== 'hmac-sha256'
    || input.digestContractVersion !== 'equora-tcj-v1'
    || input.purpose !== 'broker_account_identity_v1'
    || input.verificationStatus !== 'unverified_reference'
    || typeof input.keyVersion !== 'string'
    || !/^[a-z][a-z0-9_]{0,62}$/.test(input.keyVersion)
    || typeof input.digest !== 'string'
    || !SHA256_PATTERN.test(input.digest)
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC Account-Identity verletzt den geschlossenen Metadatenvertrag.')
  return Object.freeze({ ...input }) as MexcTransportCaptureBinding['accountIdentity']
}

function canonicalCaptureBinding(input: unknown): MexcTransportCaptureBinding {
  if (!isRecord(input) || !hasExactKeys(input, [
    'accountIdentity',
    'activationGeneration',
    'bindingVersion',
    'brokerAccountId',
    'requestResultReference',
    'requestSequence',
    'runReference',
    'scopeDigest',
    'syncActivationId',
  ])) throw new MexcTransportError('transport_contract_violation', 'MEXC Capture Binding besitzt unbekannte oder fehlende Felder.')
  const accountIdentity = canonicalAccountIdentity(input.accountIdentity)
  const runReference = input.runReference
  const requestResultReference = input.requestResultReference
  if (
    input.bindingVersion !== 'mexc-transport-capture-binding-v1'
    || typeof input.brokerAccountId !== 'string'
    || !UUID_PATTERN.test(input.brokerAccountId)
    || typeof input.syncActivationId !== 'string'
    || !UUID_PATTERN.test(input.syncActivationId)
    || !Number.isSafeInteger(input.activationGeneration)
    || (input.activationGeneration as number) < 1
    || (input.activationGeneration as number) > 2_147_483_647
    || !isEquoraTcjDigest(input.scopeDigest, 'sync_scope')
    || !isRecord(runReference)
    || !hasExactKeys(runReference, ['referenceType', 'value'])
    || runReference.referenceType !== 'sync_run_id_v1'
    || typeof runReference.value !== 'string'
    || !UUID_PATTERN.test(runReference.value)
    || !isRecord(requestResultReference)
    || !hasExactKeys(requestResultReference, ['referenceType', 'value'])
    || requestResultReference.referenceType !== 'provider_request_result_id_v1'
    || typeof requestResultReference.value !== 'string'
    || !UUID_PATTERN.test(requestResultReference.value)
    || !Number.isSafeInteger(input.requestSequence)
    || (input.requestSequence as number) < 1
    || (input.requestSequence as number) > 2_147_483_647
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC Capture Binding verletzt den geschlossenen Metadatenvertrag.')

  return Object.freeze({
    bindingVersion: 'mexc-transport-capture-binding-v1',
    accountIdentity,
    brokerAccountId: input.brokerAccountId,
    syncActivationId: input.syncActivationId,
    activationGeneration: input.activationGeneration as number,
    scopeDigest: Object.freeze({ ...input.scopeDigest }) as EquoraTcjDigest<'sync_scope'>,
    runReference: Object.freeze({ ...runReference }) as MexcTransportCaptureBinding['runReference'],
    requestResultReference: Object.freeze({ ...requestResultReference }) as MexcTransportCaptureBinding['requestResultReference'],
    requestSequence: input.requestSequence as number,
  })
}

function assertExactKeys(query: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) {
  const allowed = new Set([...required, ...optional])
  const keys = Object.keys(query)
  const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(query, key))
  const unknown = keys.filter((key) => !allowed.has(key))
  if (missing.length || unknown.length) {
    throw new MexcTransportError('invalid_query', 'MEXC-Query entspricht nicht dem freigegebenen Capabilityvertrag.')
  }
}

function canonicalSymbol(value: unknown) {
  if (typeof value !== 'string') throw new MexcTransportError('invalid_query', 'MEXC-Symbol fehlt oder ist ungültig.')
  const symbol = value.trim().toUpperCase()
  if (!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol)) {
    throw new MexcTransportError('invalid_query', 'MEXC-Symbol liegt außerhalb des freigegebenen Formats.')
  }
  return symbol
}

function canonicalInteger(value: unknown, label: string, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new MexcTransportError('invalid_query', `${label} liegt außerhalb des freigegebenen Bereichs.`)
  }
  return String(value)
}

function canonicalUnixMs(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1_000_000_000_000 || (value as number) > 9_999_999_999_999) {
    throw new MexcTransportError('invalid_query', `${label} muss ein gültiger Unix-Millisekundenwert sein.`)
  }
  return String(value)
}

function canonicalProviderId(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value) || value.length > 40) {
    throw new MexcTransportError('invalid_query', 'MEXC-Position-ID liegt außerhalb des freigegebenen Formats.')
  }
  return value.replace(/^0+(?=\d)/, '')
}

function canonicalStates(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.some((item) => !Number.isInteger(item) || item < 1 || item > 5)) {
    throw new MexcTransportError('invalid_query', 'MEXC-Orderstatus liegt außerhalb des freigegebenen Bereichs.')
  }
  const states = [...new Set(value as number[])].sort((left, right) => left - right)
  if (states.length !== value.length) {
    throw new MexcTransportError('invalid_query', 'MEXC-Orderstatus darf keine Duplikate enthalten.')
  }
  return states.join(',')
}

function assertHistoryWindow(query: Record<string, unknown>) {
  const startTime = Number(canonicalUnixMs(query.start_time, 'start_time'))
  const endTime = Number(canonicalUnixMs(query.end_time, 'end_time'))
  if (startTime > endTime || endTime - startTime > MAX_HISTORY_WINDOW_MS) {
    throw new MexcTransportError('invalid_query', 'MEXC-Zeitfenster ist ungültig oder größer als 31 Tage.')
  }
  return { start_time: String(startTime), end_time: String(endTime) }
}

function canonicalQuery(capabilityId: MexcReadCapabilityId, input: unknown): Record<string, string> {
  if (!isRecord(input)) throw new MexcTransportError('invalid_query', 'MEXC-Query muss ein geschlossenes Objekt sein.')

  if (capabilityId === 'server_time_v1') {
    assertExactKeys(input, [])
    return {}
  }

  if (capabilityId === 'contract_metadata_v1') {
    assertExactKeys(input, ['symbol'])
    return { symbol: canonicalSymbol(input.symbol) }
  }

  if (capabilityId === 'historical_orders_v1') {
    assertExactKeys(input, ['symbol', 'start_time', 'end_time', 'page_num', 'page_size'], ['states', 'category'])
    const window = assertHistoryWindow(input)
    const query: Record<string, string> = {
      symbol: canonicalSymbol(input.symbol),
      ...window,
      page_num: canonicalInteger(input.page_num, 'page_num', 1, 10_000),
      page_size: canonicalInteger(input.page_size, 'page_size', 1, 100),
    }
    if (input.states !== undefined) query.states = canonicalStates(input.states)
    if (input.category !== undefined) query.category = canonicalInteger(input.category, 'category', 1, 4)
    return query
  }

  const positionQuery = capabilityId === 'historical_positions_v1' || capabilityId === 'funding_records_v1'
  assertExactKeys(
    input,
    positionQuery
      ? ['symbol', 'position_type', 'start_time', 'end_time', 'page_num', 'page_size']
      : ['symbol', 'start_time', 'end_time', 'page_num', 'page_size'],
    capabilityId === 'funding_records_v1' ? ['position_id'] : [],
  )
  const window = assertHistoryWindow(input)
  const query: Record<string, string> = {
    symbol: canonicalSymbol(input.symbol),
    ...window,
    page_num: canonicalInteger(input.page_num, 'page_num', 1, 10_000),
    page_size: canonicalInteger(input.page_size, 'page_size', 1, capabilityId === 'historical_executions_v3' ? 1000 : 100),
  }
  if (positionQuery) query.position_type = canonicalInteger(input.position_type, 'position_type', 1, 2)
  if (capabilityId === 'funding_records_v1' && input.position_id !== undefined) query.position_id = canonicalProviderId(input.position_id)
  return query
}

function sortedQuery(query: Readonly<Record<string, string>>) {
  return Object.entries(query)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

export function prepareMexcRequest(capabilityId: MexcReadCapabilityId, query: unknown): MexcPreparedRequest {
  const capability = MEXC_READ_CAPABILITIES[capabilityId]
  if (!capability) throw new MexcTransportError('transport_contract_violation', 'Unbekannte MEXC-Read-Capability.')
  if (capability.method !== 'GET' || !capability.path.startsWith('/api/v1/')) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Capability verletzt die GET-/Pfadgrenze.')
  }

  const normalizedQuery = canonicalQuery(capabilityId, query)
  const queryString = sortedQuery(normalizedQuery)
  const url = `${MEXC_API_ORIGIN}${capability.path}${queryString ? `?${queryString}` : ''}`
  const parsedUrl = new URL(url)
  if (parsedUrl.protocol !== 'https:' || parsedUrl.origin !== MEXC_API_ORIGIN || parsedUrl.pathname !== capability.path) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Origin oder -Pfad liegt außerhalb der Allowlist.')
  }

  return Object.freeze({
    capabilityId,
    contractVersion: MEXC_TRANSPORT_CONTRACT_VERSION,
    method: 'GET',
    auth: capability.auth,
    path: capability.path,
    query: Object.freeze(normalizedQuery),
    queryString,
    url,
  })
}

function validateCredentials(credentials: MexcCredentials) {
  const apiKey = credentials.apiKey.trim()
  const secretKey = credentials.secretKey.trim()
  if (apiKey.length < 8 || apiKey.length > 256 || secretKey.length < 8 || secretKey.length > 256) {
    throw new MexcTransportError('invalid_credential', 'MEXC-Zugangsdaten sind ungültig.')
  }
  return { apiKey, secretKey }
}

function sameAccountIdentity(
  left: MexcTransportCaptureBinding['accountIdentity'],
  right: MexcTransportCaptureBinding['accountIdentity'],
) {
  return left.digestAlgorithm === right.digestAlgorithm
    && left.digestContractVersion === right.digestContractVersion
    && left.purpose === right.purpose
    && left.keyVersion === right.keyVersion
    && left.digest === right.digest
    && left.verificationStatus === right.verificationStatus
}

function isBoundCredentialContext(
  input: MexcCredentials | MexcBoundCredentialContext,
): input is MexcBoundCredentialContext {
  return isRecord(input) && Object.prototype.hasOwnProperty.call(input, 'credentials')
}

function resolveCredentialMaterial(
  input: MexcCredentials | MexcBoundCredentialContext,
  captureBindings: readonly (MexcTransportCaptureBinding | null)[],
) {
  const requiresBoundContext = captureBindings.some((binding) => binding !== null)
  if (!requiresBoundContext) {
    return validateCredentials(isBoundCredentialContext(input) ? input.credentials : input)
  }
  if (!isBoundCredentialContext(input)) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC Capture benötigt einen credentialgebundenen Account-/Aktivierungskontext.')
  }
  if (
    !hasExactKeys(input, ['accountIdentity', 'activationGeneration', 'brokerAccountId', 'credentials', 'syncActivationId'])
    || !isRecord(input.credentials)
    || !isRecord(input.accountIdentity)
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC Capture benötigt einen credentialgebundenen Account-/Aktivierungskontext.')

  const accountIdentity = canonicalAccountIdentity(input.accountIdentity)
  if (
    typeof input.brokerAccountId !== 'string'
    || !UUID_PATTERN.test(input.brokerAccountId)
    || typeof input.syncActivationId !== 'string'
    || !UUID_PATTERN.test(input.syncActivationId)
    || !Number.isSafeInteger(input.activationGeneration)
    || (input.activationGeneration as number) < 1
    || (input.activationGeneration as number) > 2_147_483_647
  ) throw new MexcTransportError('transport_contract_violation', 'Credentialgebundener MEXC Account-/Aktivierungskontext ist ungültig.')
  for (const binding of captureBindings) {
    if (
      binding !== null
      && (
        !sameAccountIdentity(binding.accountIdentity, accountIdentity)
        || binding.brokerAccountId !== input.brokerAccountId
        || binding.syncActivationId !== input.syncActivationId
        || binding.activationGeneration !== input.activationGeneration
      )
    ) throw new MexcTransportError('transport_contract_violation', 'MEXC Capture Binding widerspricht dem credentialgebundenen Account-/Aktivierungskontext.')
  }
  return validateCredentials(input.credentials as MexcCredentials)
}

export function createMexcSignature(apiKey: string, secretKey: string, requestTime: number, queryString: string) {
  if (!Number.isSafeInteger(requestTime) || requestTime < 1_000_000_000_000) {
    throw new MexcTransportError('invalid_provider_time', 'MEXC-Requestzeit ist ungültig.')
  }
  return createHmac('sha256', secretKey).update(`${apiKey}${requestTime}${queryString}`).digest('hex')
}

function parseContentLength(response: Response) {
  const raw = response.headers.get('content-length')
  if (raw == null) return null
  if (!/^[0-9]+$/.test(raw)) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC Content-Length ist ungültig.', response.status)
  }
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed)) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC Content-Length ist ungültig.', response.status)
  }
  return parsed
}

async function readBoundedBody(response: Response, maximumBytes: number) {
  const contentLength = parseContentLength(response)
  const contentEncoding = response.headers.get('content-encoding')?.trim().toLowerCase() ?? ''
  if (contentEncoding && contentEncoding !== 'identity') {
    throw new MexcTransportError(
      'transport_contract_violation',
      'MEXC hat trotz angeforderter Identity-Kodierung eine komprimierte Antwort geliefert.',
      response.status,
    )
  }
  if (contentLength !== null && contentLength > maximumBytes) {
    throw new MexcTransportError('response_too_large', 'MEXC-Antwort überschreitet das erlaubte Größenlimit.', response.status)
  }
  if (!response.body) throw new MexcTransportError('malformed_response', 'MEXC-Antwort enthält keinen Body.', response.status)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximumBytes) {
      await reader.cancel().catch(() => undefined)
      throw new MexcTransportError('response_too_large', 'MEXC-Antwort überschreitet das erlaubte Größenlimit.', response.status)
    }
    chunks.push(value)
  }

  if (contentLength !== null && contentLength !== total) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC Content-Length stimmt nicht mit dem Body überein.', response.status)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function classifyHttpFailure(status: number) {
  if (status === 401) return new MexcTransportError('invalid_credential', 'MEXC hat den Lesezugriff abgelehnt.', status)
  if (status === 403) return new MexcTransportError('permission_missing', 'MEXC-Leserechte fehlen für diese Capability.', status)
  if (status === 429) return new MexcTransportError('rate_limited', 'MEXC begrenzt den Lesezugriff vorübergehend.', status)
  if (status === 503) return new MexcTransportError('provider_busy', 'MEXC ist vorübergehend ausgelastet.', status)
  return new MexcTransportError('provider_unavailable', 'MEXC ist für diesen Leseabruf nicht verfügbar.', status)
}

function classifyProviderFailure(payload: Record<string, unknown>, status: number) {
  const providerCode = typeof payload.code === 'string'
    ? payload.code
    : isMexcJsonNumber(payload.code)
      ? payload.code.lexeme
      : null
  if (providerCode === null) return new MexcTransportError('malformed_response', 'MEXC meldet einen Fehler ohne Provider-Code.', status)
  if (['401', '402', '602'].includes(providerCode)) return new MexcTransportError('invalid_credential', 'MEXC hat den Lesezugriff abgelehnt.', status, providerCode)
  if (providerCode === '406') return new MexcTransportError('ip_not_allowed', 'Die aktuelle IP-Adresse ist bei MEXC nicht freigegeben.', status, providerCode)
  if (providerCode === '511' || /^(70[1-4])$/.test(providerCode)) return new MexcTransportError('permission_missing', 'MEXC-Leserechte fehlen für diese Capability.', status, providerCode)
  if (providerCode === '510') return new MexcTransportError('rate_limited', 'MEXC begrenzt den Lesezugriff vorübergehend.', status, providerCode)
  if (['500', '501', '801'].includes(providerCode)) return new MexcTransportError('provider_busy', 'MEXC ist vorübergehend ausgelastet.', status, providerCode)
  if (providerCode === '604') return new MexcTransportError('maintenance', 'MEXC befindet sich für diese Capability in Wartung.', status, providerCode)
  if (['513', '600'].includes(providerCode)) return new MexcTransportError('invalid_request', 'MEXC hat den freigegebenen Request als ungültig abgelehnt.', status, providerCode)
  if (providerCode === '601') return new MexcTransportError('malformed_response', 'MEXC hat eine nicht vertragsgemäße Antwort gemeldet.', status, providerCode)
  if (['1001', '1002'].includes(providerCode)) return new MexcTransportError('unsupported_contract', 'Der angefragte MEXC-Vertrag wird nicht unterstützt.', status, providerCode)
  return new MexcTransportError('unknown_provider_error', 'MEXC meldet einen unbekannten Fehler für diese Lesecapability.', status, providerCode)
}

function parseEnvelope(
  body: Uint8Array,
  response: Response,
  request: MexcPreparedRequest,
  captureBinding: MexcTransportCaptureBinding | null,
  requestDurationMs: number,
  requestStartedAtUs: string,
  responseReceivedAtUs: string,
): MexcWireResponse {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    throw new MexcTransportError('malformed_response', 'MEXC-Antwort ist kein JSON.', response.status)
  }

  let rawText: string
  try {
    rawText = new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    throw new MexcTransportError('malformed_response', 'MEXC-Antwort ist kein gültiges UTF-8.', response.status)
  }
  let payload: unknown
  try {
    payload = parseMexcJson(rawText)
  } catch {
    throw new MexcTransportError('malformed_response', 'MEXC-Antwort enthält ungültiges JSON.', response.status)
  }
  if (!isRecord(payload)) {
    throw new MexcTransportError('malformed_response', 'MEXC-Antwort verletzt den freigegebenen Envelopevertrag.', response.status)
  }
  const providerCode = typeof payload.code === 'string'
    ? payload.code
    : isMexcJsonNumber(payload.code)
      ? payload.code.lexeme
      : null
  if (payload.success === false || (providerCode !== null && providerCode !== '0')) {
    throw classifyProviderFailure(payload, response.status)
  }
  if (payload.success !== true || !isMexcJsonNumber(payload.code) || payload.code.lexeme !== '0' || !Object.prototype.hasOwnProperty.call(payload, 'data') || payload.data == null) {
    throw new MexcTransportError('malformed_response', 'MEXC-Antwort verletzt den freigegebenen Envelopevertrag.', response.status, providerCode)
  }

  const wireResponse = Object.freeze({
    request,
    captureBinding,
    data: payload.data as MexcJsonValue,
    rawBodyDigest: digestEquoraRawResponseBody(body),
    rawBodyBytes: body.byteLength,
    requestDurationMs,
    requestStartedAtUs,
    responseReceivedAtUs,
    httpStatus: response.status,
  })
  MEXC_WIRE_RESPONSE_PROVENANCE.add(wireResponse)
  return wireResponse
}

function inspectPreparedRequest(request: MexcPreparedRequest) {
  if (
    !isRecord(request)
    || !Object.isFrozen(request)
    || !hasExactKeys(request, ['auth', 'capabilityId', 'contractVersion', 'method', 'path', 'query', 'queryString', 'url'])
    || !isRecord(request.query)
    || !Object.isFrozen(request.query)
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC-Wire-Request besitzt keine geschlossene kanonische Struktur.')

  const capability = MEXC_READ_CAPABILITIES[request.capabilityId]
  const queryString = sortedQuery(request.query)
  const expectedUrl = `${MEXC_API_ORIGIN}${capability?.path ?? ''}${queryString ? `?${queryString}` : ''}`
  if (
    !capability
    || request.contractVersion !== MEXC_TRANSPORT_CONTRACT_VERSION
    || request.method !== capability.method
    || request.auth !== capability.auth
    || request.path !== capability.path
    || Object.values(request.query).some((value) => typeof value !== 'string')
    || request.queryString !== queryString
    || request.url !== expectedUrl
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC-Wire-Request weicht vom kanonischen Capabilityvertrag ab.')
}

function sameCaptureBinding(left: MexcTransportCaptureBinding, right: MexcTransportCaptureBinding) {
  return left.bindingVersion === right.bindingVersion
    && left.accountIdentity.digestAlgorithm === right.accountIdentity.digestAlgorithm
    && left.accountIdentity.digestContractVersion === right.accountIdentity.digestContractVersion
    && left.accountIdentity.purpose === right.accountIdentity.purpose
    && left.accountIdentity.keyVersion === right.accountIdentity.keyVersion
    && left.accountIdentity.digest === right.accountIdentity.digest
    && left.accountIdentity.verificationStatus === right.accountIdentity.verificationStatus
    && left.brokerAccountId === right.brokerAccountId
    && left.syncActivationId === right.syncActivationId
    && left.activationGeneration === right.activationGeneration
    && left.scopeDigest.digestAlgorithm === right.scopeDigest.digestAlgorithm
    && left.scopeDigest.digestContractVersion === right.scopeDigest.digestContractVersion
    && left.scopeDigest.domain === right.scopeDigest.domain
    && left.scopeDigest.digest === right.scopeDigest.digest
    && left.runReference.referenceType === right.runReference.referenceType
    && left.runReference.value === right.runReference.value
    && left.requestResultReference.referenceType === right.requestResultReference.referenceType
    && left.requestResultReference.value === right.requestResultReference.value
    && left.requestSequence === right.requestSequence
}

export function inspectMexcWireResponse(response: MexcWireResponse): MexcWireResponse {
  if (
    !response
    || typeof response !== 'object'
    || Array.isArray(response)
    || !Object.isFrozen(response)
    || !MEXC_WIRE_RESPONSE_PROVENANCE.has(response)
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC-Wire-Response besitzt keine authentische Transportprovenienz.')
  const expectedKeys = [
    'captureBinding',
    'data',
    'httpStatus',
    'rawBodyBytes',
    'rawBodyDigest',
    'request',
    'requestDurationMs',
    'requestStartedAtUs',
    'responseReceivedAtUs',
  ].sort()
  const actualKeys = Object.keys(response).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Wire-Response besitzt unbekannte oder fehlende Felder.')
  }
  inspectPreparedRequest(response.request)
  if (response.captureBinding !== null) {
    if (
      !Object.isFrozen(response.captureBinding)
      || !Object.isFrozen(response.captureBinding.accountIdentity)
      || !Object.isFrozen(response.captureBinding.scopeDigest)
      || !Object.isFrozen(response.captureBinding.runReference)
      || !Object.isFrozen(response.captureBinding.requestResultReference)
    ) {
      throw new MexcTransportError('transport_contract_violation', 'MEXC Capture Binding ist nicht unveränderlich.')
    }
    const canonicalBinding = canonicalCaptureBinding(response.captureBinding)
    if (!sameCaptureBinding(response.captureBinding, canonicalBinding)) {
      throw new MexcTransportError('transport_contract_violation', 'MEXC Capture Binding weicht vom kanonischen Vertrag ab.')
    }
  }
  if (
    !isEquoraTcjDigest(response.rawBodyDigest, 'raw_response_body')
    || !Number.isSafeInteger(response.rawBodyBytes)
    || response.rawBodyBytes < 1
    || response.rawBodyBytes > MEXC_MAX_RESPONSE_BYTES
    || !Number.isSafeInteger(response.requestDurationMs)
    || response.requestDurationMs < 0
    || response.requestDurationMs > 60_000
    || !Number.isSafeInteger(response.httpStatus)
    || response.httpStatus < 200
    || response.httpStatus > 299
    || typeof response.requestStartedAtUs !== 'string'
    || !CANONICAL_US_PATTERN.test(response.requestStartedAtUs)
    || typeof response.responseReceivedAtUs !== 'string'
    || !CANONICAL_US_PATTERN.test(response.responseReceivedAtUs)
    || BigInt(response.responseReceivedAtUs) < BigInt(response.requestStartedAtUs)
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC-Wire-Response verletzt den authentischen Metadatenvertrag.')
  return response
}

function assertResponseUrl(request: MexcPreparedRequest, response: Response) {
  if ((response.status >= 300 && response.status < 400) || response.redirected) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Redirects sind nicht erlaubt.', response.status)
  }
  if (!response.url) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Antwort enthält keine prüfbare finale URL.', response.status)
  }
  let finalUrl: URL
  try {
    finalUrl = new URL(response.url)
  } catch {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Antwort enthält eine ungültige finale URL.', response.status)
  }
  if (finalUrl.href !== new URL(request.url).href) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Antwort stammt nicht von der vorbereiteten finalen URL.', response.status)
  }
}

function isRedirectTransportFailure(error: unknown) {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (`${current.name} ${current.message}`.toLowerCase().includes('redirect')) return true
    current = (current as Error & { cause?: unknown }).cause
  }
  return false
}

async function executePreparedRequest(
  request: MexcPreparedRequest,
  headers: HeadersInit,
  captureBinding: MexcTransportCaptureBinding | null = null,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const requestStartedAtMs = Date.now()
  const startedAt = performance.now()
  try {
    const requestHeaders = new Headers(headers)
    requestHeaders.set('Accept-Encoding', 'identity')
    const response = await fetch(request.url, {
      method: 'GET',
      headers: requestHeaders,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    })
    assertResponseUrl(request, response)
    const body = await readBoundedBody(response, MEXC_MAX_RESPONSE_BYTES)
    if (!response.ok) throw classifyHttpFailure(response.status)
    const requestDurationMs = Math.ceil(Math.max(0, performance.now() - startedAt))
    if (requestDurationMs > 60_000) throw new MexcTransportError('timeout', 'Der MEXC-Leseabruf überschreitet das messbare Zeitbudget.')
    const responseReceivedAtMs = Date.now()
    if (responseReceivedAtMs < requestStartedAtMs) {
      throw new MexcTransportError('transport_contract_violation', 'Die lokale Transportuhr ist während des MEXC-Leseabrufs zurückgesprungen.')
    }
    return parseEnvelope(
      body,
      response,
      request,
      captureBinding,
      requestDurationMs,
      String(BigInt(requestStartedAtMs) * BigInt(1_000)),
      String(BigInt(responseReceivedAtMs) * BigInt(1_000)),
    )
  } catch (error) {
    if (error instanceof MexcTransportError) throw error
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new MexcTransportError('timeout', 'Der MEXC-Leseabruf hat das Zeitlimit überschritten.')
    }
    if (isRedirectTransportFailure(error)) {
      throw new MexcTransportError('transport_contract_violation', 'MEXC-Redirects sind nicht erlaubt.')
    }
    throw new MexcTransportError('provider_unavailable', 'Der MEXC-Leseabruf konnte nicht hergestellt werden.')
  } finally {
    clearTimeout(timeout)
  }
}

export async function executeMexcPublicRead(capabilityId: MexcPublicCapabilityId, query: unknown) {
  const request = prepareMexcRequest(capabilityId, query)
  if (request.auth !== 'public') throw new MexcTransportError('transport_contract_violation', 'Private MEXC-Capability wurde als öffentlich aufgerufen.')
  return executePreparedRequest(request, { Accept: 'application/json' })
}

async function executeMexcPrivateRead(
  request: MexcPreparedRequest,
  requestTime: number,
  credentials: MexcCredentials,
  captureBinding: MexcTransportCaptureBinding | null,
) {
  if (request.auth !== 'private') throw new MexcTransportError('transport_contract_violation', 'Öffentliche MEXC-Capability wurde als privat aufgerufen.')
  const signature = createMexcSignature(credentials.apiKey, credentials.secretKey, requestTime, request.queryString)
  return executePreparedRequest(request, {
    Accept: 'application/json',
    ApiKey: credentials.apiKey,
    'Request-Time': String(requestTime),
    Signature: signature,
    'Recv-Window': '10000',
  }, captureBinding)
}

async function readMexcServerTime() {
  let response: MexcWireResponse
  try {
    response = await executeMexcPublicRead('server_time_v1', {})
  } catch (error) {
    if (error instanceof MexcTransportError && error.code === 'malformed_response') {
      throw new MexcTransportError('invalid_provider_time', 'MEXC-Serverzeit fehlt oder verletzt den Zeitvertrag.')
    }
    throw error
  }
  const serverTime = response.data
  const serverTimeLexeme = getMexcJsonIntegerLexeme(serverTime)
  const serverTimeValue = serverTimeLexeme === null ? Number.NaN : Number(serverTimeLexeme)
  if (
    !Number.isSafeInteger(serverTimeValue)
    || serverTimeValue < 1_000_000_000_000
    || Math.abs(serverTimeValue - Date.now()) > MEXC_MAX_CLOCK_SKEW_MS
  ) {
    throw new MexcTransportError('invalid_provider_time', 'MEXC-Serverzeit ist ungültig oder unplausibel.')
  }
  return serverTimeValue
}

export async function executeMexcPrivateReadWorkUnit(
  workUnits: readonly MexcPrivateReadWorkUnit[],
  loadCredentials: MexcCredentialLoader,
): Promise<MexcPrivateReadWorkUnitResult> {
  if (!workUnits.length || workUnits.length > 6) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Work-Unit enthält keine zulässige Anzahl an Lesecapabilities.')
  }

  const preparedRequests = workUnits.map((workUnit) => {
    if (!isRecord(workUnit) || !hasExactKeys(workUnit, workUnit.captureBinding === undefined
      ? ['capabilityId', 'query']
      : ['capabilityId', 'query', 'captureBinding'])) {
      throw new MexcTransportError('transport_contract_violation', 'MEXC-Work-Unit besitzt unbekannte oder fehlende Felder.')
    }
    const request = prepareMexcRequest(workUnit.capabilityId as MexcReadCapabilityId, workUnit.query)
    if (request.auth !== 'private') {
      throw new MexcTransportError('transport_contract_violation', 'Öffentliche MEXC-Capability wurde in eine private Work-Unit aufgenommen.')
    }
    const captureBinding = workUnit.captureBinding === undefined ? null : canonicalCaptureBinding(workUnit.captureBinding)
    return Object.freeze({ request, captureBinding })
  })

  const serverTime = await readMexcServerTime()
  const credentials = resolveCredentialMaterial(
    await loadCredentials(),
    preparedRequests.map(({ captureBinding }) => captureBinding),
  )
  const outcomes = await Promise.all(preparedRequests.map(async ({ request, captureBinding }): Promise<MexcPrivateReadOutcome> => {
    try {
      const response = await executeMexcPrivateRead(request, serverTime, credentials, captureBinding)
      return Object.freeze({ capabilityId: request.capabilityId as MexcPrivateCapabilityId, status: 'wire_succeeded', response })
    } catch (error) {
      if (error instanceof MexcTransportError) {
        return Object.freeze({ capabilityId: request.capabilityId as MexcPrivateCapabilityId, status: 'failed', error })
      }
      throw error
    }
  }))
  return Object.freeze({ serverTime, outcomes: Object.freeze(outcomes) })
}

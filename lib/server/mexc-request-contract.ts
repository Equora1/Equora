import 'server-only'

import {
  isMexcJsonNumber,
  parseMexcJson,
  type MexcJsonValue,
} from '@/lib/server/mexc-json'

export const MEXC_API_ORIGIN = 'https://api.mexc.com' as const
export const MEXC_TRANSPORT_CONTRACT_VERSION = 'mexc-readonly-transport-v1' as const
export const MEXC_MAX_RESPONSE_BYTES = 64 * 1024
export const MEXC_REQUEST_TIMEOUT_MS = 12_000

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

export function canonicalMexcQuery(capabilityId: MexcReadCapabilityId, input: unknown): Readonly<Record<string, string>> {
  if (!isRecord(input)) throw new MexcTransportError('invalid_query', 'MEXC-Query muss ein geschlossenes Objekt sein.')

  if (capabilityId === 'server_time_v1') {
    assertExactKeys(input, [])
    return Object.freeze({})
  }

  if (capabilityId === 'contract_metadata_v1') {
    assertExactKeys(input, ['symbol'])
    return Object.freeze({ symbol: canonicalSymbol(input.symbol) })
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
    return Object.freeze(query)
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
  return Object.freeze(query)
}

export function canonicalMexcCaptureQueryProfile(
  capabilityId: MexcReadCapabilityId,
  input: unknown,
): Readonly<Record<string, string>> {
  const canonicalQuery = canonicalMexcQuery(capabilityId, input)
  const stableQuery = Object.fromEntries(
    Object.entries(canonicalQuery).filter(([key]) => key !== 'page_num'),
  )
  return Object.freeze(stableQuery)
}

export function parseCanonicalMexcQuery(
  capabilityId: MexcReadCapabilityId,
  input: unknown,
): Readonly<Record<string, string>> {
  if (!isRecord(input) || Object.values(input).some((value) => typeof value !== 'string')) {
    throw new MexcTransportError('invalid_query', 'Kanonische MEXC-Query muss ausschließlich Stringwerte enthalten.')
  }
  const numericFields = new Set(['start_time', 'end_time', 'page_num', 'page_size', 'position_type', 'category'])
  const raw: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (key === 'states') {
      if (!/^\d(?:,\d)*$/.test(value as string)) {
        throw new MexcTransportError('invalid_query', 'Kanonischer MEXC-Orderstatus ist ungültig.')
      }
      raw[key] = (value as string).split(',').map(Number)
    } else if (numericFields.has(key)) {
      if (!/^(?:0|[1-9]\d*)$/.test(value as string)) {
        throw new MexcTransportError('invalid_query', 'Kanonischer MEXC-Integerwert ist ungültig.')
      }
      raw[key] = Number(value)
    } else {
      raw[key] = value
    }
  }
  const parsed = canonicalMexcQuery(capabilityId, raw)
  if (canonicalMexcQueryString(input as Readonly<Record<string, string>>) !== canonicalMexcQueryString(parsed)) {
    throw new MexcTransportError('invalid_query', 'MEXC-Query ist nicht bereits kanonisch.')
  }
  return parsed
}

export function canonicalMexcQueryString(query: Readonly<Record<string, string>>) {
  return Object.entries(query)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

function preparedRequestFromCanonicalQuery(
  capabilityId: MexcReadCapabilityId,
  normalizedQuery: Readonly<Record<string, string>>,
): MexcPreparedRequest {
  const capability = MEXC_READ_CAPABILITIES[capabilityId]
  if (!capability) throw new MexcTransportError('transport_contract_violation', 'Unbekannte MEXC-Read-Capability.')
  if (capability.method !== 'GET' || !capability.path.startsWith('/api/v1/')) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Capability verletzt die GET-/Pfadgrenze.')
  }

  const queryString = canonicalMexcQueryString(normalizedQuery)
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
    query: normalizedQuery,
    queryString,
    url,
  })
}

export function prepareMexcRequest(capabilityId: MexcReadCapabilityId, query: unknown): MexcPreparedRequest {
  return preparedRequestFromCanonicalQuery(capabilityId, canonicalMexcQuery(capabilityId, query))
}

export function prepareCanonicalMexcRequest(
  capabilityId: MexcReadCapabilityId,
  canonicalQuery: unknown,
): MexcPreparedRequest {
  return preparedRequestFromCanonicalQuery(capabilityId, parseCanonicalMexcQuery(capabilityId, canonicalQuery))
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

export function parseMexcResponseEnvelope(body: Uint8Array, httpStatus: number): MexcJsonValue {
  let rawText: string
  try {
    rawText = new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    throw new MexcTransportError('malformed_response', 'MEXC-Antwort ist kein gültiges UTF-8.', httpStatus)
  }
  let payload: unknown
  try {
    payload = parseMexcJson(rawText)
  } catch {
    throw new MexcTransportError('malformed_response', 'MEXC-Antwort enthält ungültiges JSON.', httpStatus)
  }
  if (!isRecord(payload)) {
    throw new MexcTransportError('malformed_response', 'MEXC-Antwort verletzt den freigegebenen Envelopevertrag.', httpStatus)
  }
  const providerCode = typeof payload.code === 'string'
    ? payload.code
    : isMexcJsonNumber(payload.code)
      ? payload.code.lexeme
      : null
  if (payload.success === false || (providerCode !== null && providerCode !== '0')) {
    throw classifyProviderFailure(payload, httpStatus)
  }
  if (payload.success !== true
    || !isMexcJsonNumber(payload.code)
    || payload.code.lexeme !== '0'
    || !Object.prototype.hasOwnProperty.call(payload, 'data')
    || payload.data == null) {
    throw new MexcTransportError(
      'malformed_response',
      'MEXC-Antwort verletzt den freigegebenen Envelopevertrag.',
      httpStatus,
      providerCode,
    )
  }
  return payload.data as MexcJsonValue
}

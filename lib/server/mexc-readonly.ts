import 'server-only'

import {
  executeMexcPrivateReadWorkUnit,
  MexcTransportError,
  type MexcCredentialLoader,
  type MexcPrivateCapabilityId,
  type MexcPrivateReadOutcome,
  type MexcWireResponse,
} from '@/lib/server/mexc-transport'
import { getMexcJsonIntegerLexeme } from '@/lib/server/mexc-json'
import { MexcOracleError, validateMexcCapabilityData } from '@/lib/server/mexc-oracles'
import type { EquoraTcjDigest } from '@/lib/server/equora-tcj'

type MexcRecord = Record<string, unknown>

export type MexcPreviewScope = Readonly<{
  symbol: string
  startTime: number
  endTime: number
  pageNumber?: number
  pageSize?: number
}>

export type MexcReadResult = {
  orders: MexcRecord[]
  executions: MexcRecord[]
  serverTime: number
  scope: Required<MexcPreviewScope>
  responseShapes: {
    orders: 'bare_array_v1'
    executions: 'bare_array_v1'
  }
  rawBodyDigests: {
    orders: EquoraTcjDigest<'raw_response_body'>
    executions: EquoraTcjDigest<'raw_response_body'>
  }
}

export class MexcReadError extends Error {
  public readonly publicMessage: string
  public readonly providerCode: string | null
  public readonly errorCode: string

  constructor(publicMessage: string, providerCode?: string | number | null, errorCode = 'mexc_read_failed') {
    super(publicMessage)
    this.name = 'MexcReadError'
    this.publicMessage = publicMessage
    this.providerCode = providerCode == null ? null : String(providerCode)
    this.errorCode = errorCode
  }
}

function stringValue(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  const integerLexeme = getMexcJsonIntegerLexeme(value)
  if (integerLexeme !== null) return integerLexeme
  return ''
}

function mapTransportError(error: MexcTransportError) {
  const messages: Partial<Record<MexcTransportError['code'], string>> = {
    invalid_credential: 'MEXC hat den Lesezugriff abgelehnt. Bitte API-Schlüssel und Secret Key prüfen.',
    ip_not_allowed: 'Die aktuelle IP-Adresse ist bei MEXC nicht für diesen Leseabruf freigegeben.',
    permission_missing: 'Für diesen Abruf fehlt bei MEXC die Leseberechtigung „View Order Details“.',
    rate_limited: 'MEXC begrenzt den Lesezugriff vorübergehend. Es wurden keine leeren Ergebnisse angenommen.',
    provider_busy: 'MEXC ist vorübergehend ausgelastet. Es wurde kein erfolgreicher Leerabruf gespeichert.',
    maintenance: 'MEXC befindet sich für diese Lesecapability in Wartung.',
    invalid_request: 'MEXC hat den freigegebenen Leseabruf als ungültig abgelehnt.',
    unsupported_contract: 'Der angefragte MEXC-Vertrag wird nicht unterstützt.',
    unknown_provider_error: 'MEXC hat einen unbekannten Providerfehler gemeldet. Es erfolgt kein automatischer Retry.',
    invalid_provider_time: 'MEXC hat keine gültige Serverzeit geliefert. Der private Abruf wurde nicht gestartet.',
    invalid_query: 'Der MEXC-Abrufscope entspricht nicht dem freigegebenen Read-only-Vertrag.',
    response_too_large: 'Die MEXC-Antwort überschreitet das sichere Größenlimit.',
    malformed_response: 'MEXC hat eine nicht vertragsgemäße Antwort geliefert. Es wurden keine leeren Daten angenommen.',
    timeout: 'Die MEXC-Leseantwort hat zu lange gedauert. Es wurde kein erfolgreicher Leerabruf gespeichert.',
    transport_contract_violation: 'Der MEXC-Read-only-Transport hat einen nicht erlaubten Request blockiert.',
  }
  return new MexcReadError(
    messages[error.code] ?? 'Die MEXC-Leseverbindung ist derzeit nicht verfügbar.',
    error.providerCode,
    error.code,
  )
}

function mapOracleError(error: MexcOracleError) {
  const messages: Record<MexcOracleError['code'], string> = {
    invalid_scope: 'Der interne MEXC-Oracle wurde mit einem ungültigen Capabilityscope aufgerufen.',
    malformed_response: 'MEXC hat Datensätze geliefert, die den capabilitybezogenen Feldvertrag verletzen.',
    scope_violation: 'MEXC hat mindestens einen Datensatz außerhalb des angefragten Symbol- oder Zeitfensters geliefert.',
    ordering_violation: 'MEXC hat Datensätze außerhalb der erwarteten nichtzunehmenden Reihenfolge geliefert.',
  }
  return new MexcReadError(messages[error.code], null, error.code)
}

function requireSucceededOutcome(
  outcome: MexcPrivateReadOutcome | undefined,
  capabilityId: MexcPrivateCapabilityId,
): MexcWireResponse {
  if (!outcome || outcome.capabilityId !== capabilityId) {
    throw new MexcReadError(
      'Die MEXC-Work-Unit hat keine vollständige capabilitybezogene Vorschauantwort geliefert.',
      null,
      'malformed_response',
    )
  }
  if (outcome.status === 'failed') throw outcome.error
  return outcome.response
}

export async function readMexcFuturesPreview(
  loadCredentials: MexcCredentialLoader,
  scope?: MexcPreviewScope,
): Promise<MexcReadResult> {
  if (!scope || typeof scope !== 'object') {
    throw new MexcReadError(
      'Der alte ungescopte MEXC-Vorschauabruf ist gesperrt. G1 verlangt Symbol und geschlossenes Zeitfenster.',
      null,
      'scope_required',
    )
  }
  if (typeof scope.symbol !== 'string') {
    throw new MexcReadError('Der MEXC-Vorschauabruf besitzt keinen gültigen Symbolscope.', null, 'invalid_scope')
  }

  const normalizedScope: Required<MexcPreviewScope> = {
    symbol: scope.symbol.trim().toUpperCase(),
    startTime: scope.startTime,
    endTime: scope.endTime,
    pageNumber: scope.pageNumber ?? 1,
    pageSize: scope.pageSize ?? 20,
  }
  const ordersQuery = {
    symbol: normalizedScope.symbol,
    start_time: normalizedScope.startTime,
    end_time: normalizedScope.endTime,
    page_num: normalizedScope.pageNumber,
    page_size: normalizedScope.pageSize,
  }
  const executionsQuery = { ...ordersQuery }

  try {
    const { serverTime, outcomes } = await executeMexcPrivateReadWorkUnit([
      { capabilityId: 'historical_orders_v1', query: ordersQuery },
      { capabilityId: 'historical_executions_v3', query: executionsQuery },
    ], loadCredentials)
    const ordersResponse = requireSucceededOutcome(outcomes[0], 'historical_orders_v1')
    const executionsResponse = requireSucceededOutcome(outcomes[1], 'historical_executions_v3')
    const oracleScope = {
      symbol: normalizedScope.symbol,
      startTime: normalizedScope.startTime,
      endTime: normalizedScope.endTime,
      pageNumber: normalizedScope.pageNumber,
      pageSize: normalizedScope.pageSize,
    }
    const ordersPage = validateMexcCapabilityData('historical_orders_v1', ordersResponse.data, oracleScope)
    const executionsPage = validateMexcCapabilityData('historical_executions_v3', executionsResponse.data, oracleScope)

    return {
      orders: [...ordersPage.records] as MexcRecord[],
      executions: [...executionsPage.records] as MexcRecord[],
      serverTime,
      scope: normalizedScope,
      responseShapes: { orders: 'bare_array_v1', executions: 'bare_array_v1' },
      rawBodyDigests: { orders: ordersResponse.rawBodyDigest, executions: executionsResponse.rawBodyDigest },
    }
  } catch (error) {
    if (error instanceof MexcReadError) throw error
    if (error instanceof MexcOracleError) throw mapOracleError(error)
    if (error instanceof MexcTransportError) throw mapTransportError(error)
    throw new MexcReadError('Die MEXC-Leseverbindung konnte nicht geprüft werden.')
  }
}

export function getMexcRecordId(record: MexcRecord, kind: 'order' | 'execution') {
  const resolved = kind === 'order' ? stringValue(record.orderId) : stringValue(record.id)
  if (!/^[0-9]+$/.test(resolved)) {
    throw new MexcReadError('MEXC-Datensatz besitzt keine belastbare Provider-ID.', null, 'missing_provider_id')
  }
  return resolved.replace(/^0+(?=\d)/, '')
}

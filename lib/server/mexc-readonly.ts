import 'server-only'

import { createHmac } from 'node:crypto'

const MEXC_CONTRACT_BASE_URL = 'https://contract.mexc.com'
const REQUEST_TIMEOUT_MS = 12_000
const MAX_PREVIEW_ORDERS = 20
const MAX_SYMBOLS_FOR_EXECUTIONS = 5

type MexcRecord = Record<string, unknown>

type MexcResponse<T> = {
  success?: boolean
  code?: number | string
  message?: string
  data?: T
}

export type MexcReadResult = {
  orders: MexcRecord[]
  executions: MexcRecord[]
  serverTime: number
}

export class MexcReadError extends Error {
  public readonly publicMessage: string
  public readonly providerCode: string | null

  constructor(publicMessage: string, providerCode?: string | number | null) {
    super(publicMessage)
    this.name = 'MexcReadError'
    this.publicMessage = publicMessage
    this.providerCode = providerCode == null ? null : String(providerCode)
  }
}

function isRecord(value: unknown): value is MexcRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toRecordArray(value: unknown): MexcRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  if (!isRecord(value)) return []

  const possibleLists = [value.resultList, value.list, value.rows]
  for (const list of possibleLists) {
    if (Array.isArray(list)) return list.filter(isRecord)
  }
  return []
}

function stringValue(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function sortedQuery(params: Record<string, string | number | undefined>) {
  return Object.entries(params)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => null) as T | null
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new MexcReadError('MEXC hat den Zugriff abgelehnt. Bitte API-Schlüssel, Secret Key und Leserechte prüfen.', response.status)
      }
      throw new MexcReadError('MEXC ist gerade nicht erreichbar. Bitte die Verbindung später erneut prüfen.', response.status)
    }
    if (payload == null) {
      throw new MexcReadError('MEXC hat keine lesbare Antwort geliefert.')
    }
    return payload
  } catch (error) {
    if (error instanceof MexcReadError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MexcReadError('Die Antwort von MEXC hat zu lange gedauert. Bitte erneut versuchen.')
    }
    throw new MexcReadError('Die Verbindung zu MEXC konnte nicht hergestellt werden.')
  } finally {
    clearTimeout(timer)
  }
}

async function getMexcServerTime() {
  const payload = await fetchJson<MexcResponse<number>>(`${MEXC_CONTRACT_BASE_URL}/api/v1/contract/ping`)
  const serverTime = typeof payload.data === 'number' ? payload.data : Date.now()
  return Number.isFinite(serverTime) ? serverTime : Date.now()
}

async function signedGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  credentials: { apiKey: string; secretKey: string },
  requestTime: number,
) {
  const query = sortedQuery(params)
  const signatureTarget = `${credentials.apiKey}${requestTime}${query}`
  const signature = createHmac('sha256', credentials.secretKey).update(signatureTarget).digest('hex')
  const url = `${MEXC_CONTRACT_BASE_URL}${path}${query ? `?${query}` : ''}`

  const payload = await fetchJson<MexcResponse<T>>(url, {
    method: 'GET',
    headers: {
      ApiKey: credentials.apiKey,
      'Request-Time': String(requestTime),
      Signature: signature,
      'Content-Type': 'application/json',
      'Recv-Window': '15000',
    },
  })

  if (payload.success === false) {
    const code = payload.code ?? null
    const providerMessage = typeof payload.message === 'string' ? payload.message.toLowerCase() : ''
    const authProblem = providerMessage.includes('signature')
      || providerMessage.includes('api key')
      || providerMessage.includes('permission')
      || String(code) === '401'
      || String(code) === '403'

    throw new MexcReadError(
      authProblem
        ? 'MEXC konnte den Schlüssel nicht als lesenden Zugang bestätigen. Bitte Schlüssel, Secret und Futures-Leserechte prüfen.'
        : 'MEXC konnte die Daten nicht bereitstellen. Bitte die Verbindung erneut prüfen.',
      code,
    )
  }

  return payload.data
}

export async function readMexcFuturesPreview(credentials: { apiKey: string; secretKey: string }): Promise<MexcReadResult> {
  const serverTime = await getMexcServerTime()
  const localOffset = serverTime - Date.now()
  const currentRequestTime = () => Date.now() + localOffset

  const orderData = await signedGet<unknown>(
    '/api/v1/private/order/list/history_orders',
    { page_num: 1, page_size: MAX_PREVIEW_ORDERS },
    credentials,
    currentRequestTime(),
  )
  const orders = toRecordArray(orderData)

  const symbols = Array.from(new Set(
    orders
      .map((order) => stringValue(order.symbol))
      .filter(Boolean),
  )).slice(0, MAX_SYMBOLS_FOR_EXECUTIONS)

  const executionGroups = await Promise.all(symbols.map(async (symbol) => {
    try {
      const executionData = await signedGet<unknown>(
        '/api/v1/private/order/list/order_deals',
        { symbol, page_num: 1, page_size: 20 },
        credentials,
        currentRequestTime(),
      )
      return toRecordArray(executionData)
    } catch (error) {
      if (error instanceof MexcReadError) return []
      throw error
    }
  }))

  return {
    orders,
    executions: executionGroups.flat(),
    serverTime,
  }
}

export function getMexcRecordId(record: MexcRecord, kind: 'order' | 'execution') {
  const candidates = kind === 'order'
    ? [record.orderId, record.externalOid, record.id]
    : [record.id, record.orderId]
  const resolved = candidates.map(stringValue).find(Boolean)
  return resolved || `${kind}-${stringValue(record.symbol)}-${stringValue(record.timestamp ?? record.updateTime ?? record.createTime)}`
}

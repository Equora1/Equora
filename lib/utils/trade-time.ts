import type { Trade } from '@/lib/types/trade'

const TRADE_TIME_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
export const DEFAULT_TRADE_TIMEZONE = 'Europe/Berlin'

const TRADE_DATE_KEY_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  timeZone: DEFAULT_TRADE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

type TradeTimeWindow = {
  key: string
  label: string
  startMinute: number
  endMinute: number
}

const SESSION_WINDOWS: TradeTimeWindow[] = [
  { key: 'asia', label: 'Asia / Tokyo', startMinute: 0, endMinute: 8 * 60 },
  { key: 'london', label: 'London', startMinute: 8 * 60, endMinute: 13 * 60 + 30 },
  { key: 'new-york', label: 'New York', startMinute: 13 * 60 + 30, endMinute: 22 * 60 },
]

const KILL_ZONE_WINDOWS: TradeTimeWindow[] = [
  { key: 'asia-open', label: 'Asia Open', startMinute: 0, endMinute: 2 * 60 },
  { key: 'london-open', label: 'London Open', startMinute: 8 * 60, endMinute: 10 * 60 },
  { key: 'new-york-open', label: 'New York Open', startMinute: 14 * 60 + 30, endMinute: 16 * 60 + 30 },
  { key: 'london-close', label: 'London Close', startMinute: 16 * 60, endMinute: 18 * 60 },
]

function resolveTradeTimeParts(value?: string | null, timeZone = DEFAULT_TRADE_TIMEZONE) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const formatter = new Intl.DateTimeFormat('de-DE', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '')
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null

  return {
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
  }
}

function resolveWindowLabel(value: string | null | undefined, windows: TradeTimeWindow[], fallback: string, timeZone = DEFAULT_TRADE_TIMEZONE) {
  const parts = resolveTradeTimeParts(value, timeZone)
  if (!parts) return fallback
  const match = windows.find((window) => parts.minuteOfDay >= window.startMinute && parts.minuteOfDay < window.endMinute)
  return match?.label ?? fallback
}

export function resolveTradeOccurredAt(trade: Pick<Trade, 'tradeOccurredAt' | 'capturedAt' | 'createdAt' | 'date'>) {
  return trade.tradeOccurredAt ?? trade.capturedAt ?? trade.createdAt ?? trade.date
}

export function resolveTradeOccurredAtFromRow(row: { captured_at?: string | null; created_at?: string | null }) {
  return row.captured_at ?? row.created_at ?? new Date().toISOString()
}

export function getTradeDateKey(value?: string | null) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const parts = TRADE_DATE_KEY_FORMATTER.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return year && month && day ? `${year}-${month}-${day}` : null
}

export function getTradeHourInTimezone(value?: string | null, timeZone = DEFAULT_TRADE_TIMEZONE) {
  return resolveTradeTimeParts(value, timeZone)?.hour ?? null
}

export function deriveTradeSessionLabel(value?: string | null, timeZone = DEFAULT_TRADE_TIMEZONE) {
  return resolveWindowLabel(value, SESSION_WINDOWS, 'Overnight', timeZone)
}

export function deriveTradeKillZoneLabel(value?: string | null, timeZone = DEFAULT_TRADE_TIMEZONE) {
  return resolveWindowLabel(value, KILL_ZONE_WINDOWS, 'Kein Kernfenster', timeZone)
}

export function formatTradeTimeInputValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localTime.toISOString().slice(0, 16)
}

export function resolveTradeTimeInputToIso(value: string | null | undefined, fallbackIso: string) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return fallbackIso

  if (TRADE_TIME_INPUT_PATTERN.test(trimmed)) {
    const localDate = new Date(trimmed)
    if (!Number.isNaN(localDate.getTime())) return localDate.toISOString()
  }

  const direct = new Date(trimmed)
  return Number.isNaN(direct.getTime()) ? fallbackIso : direct.toISOString()
}

export function formatTradeTimeLabel(value?: string | null, locale = 'de-DE') {
  if (!value) return 'Nicht gesetzt'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Nicht gesetzt'
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

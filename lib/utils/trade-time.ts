import type { Trade } from '@/lib/types/trade'

const TRADE_TIME_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const ZONED_TRADE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/i
export const DEFAULT_TRADE_TIMEZONE = 'Europe/Berlin'

const TRADE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: DEFAULT_TRADE_TIMEZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

function calendarMilliseconds(year: number, month: number, day: number, hour: number, minute: number, second = 0) {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, 0)
  if (year < 1 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute
    || date.getUTCSeconds() !== second) return null
  return date.getTime()
}

function zonedInstantMilliseconds(value: string) {
  const match = ZONED_TRADE_TIME_PATTERN.exec(value)
  if (!match || calendarMilliseconds(+match[1], +match[2], +match[3], +match[4], +match[5], +(match[6] ?? 0)) === null) return null
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) ? milliseconds : null
}

function berlinCalendarParts(milliseconds: number) {
  const parts = TRADE_TIME_FORMATTER.formatToParts(new Date(milliseconds))
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

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
  const milliseconds = zonedInstantMilliseconds(value)
  if (milliseconds === null) return ''
  const p = berlinCalendarParts(milliseconds)
  const pad = (part: number, length = 2) => String(part).padStart(length, '0')
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

export function resolveTradeTimeInputToIso(value: string | null | undefined, fallbackIso: string, originalIso?: string | null) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return fallbackIso

  const match = TRADE_TIME_INPUT_PATTERN.exec(trimmed)
  if (!match) {
    const milliseconds = zonedInstantMilliseconds(trimmed)
    if (milliseconds !== null) return new Date(milliseconds).toISOString()
    throw new Error('Bitte ein gültiges Datum mit Uhrzeit angeben.')
  }

  const wallMilliseconds = calendarMilliseconds(+match[1], +match[2], +match[3], +match[4], +match[5])
  if (wallMilliseconds === null) throw new Error('Bitte ein gültiges Datum mit Uhrzeit angeben.')

  // The owned stored instant is the only disambiguation for an unchanged edit.
  // Preserve its seconds too: datetime-local displays only minute precision.
  if (originalIso && formatTradeTimeInputValue(originalIso) === trimmed) return originalIso

  // Obtain Berlin's offsets on both sides of a possible DST transition, then
  // round-trip every candidate. This rejects gaps and detects both fold instants.
  const offsets = new Set<number>()
  for (const delta of [-36, 0, 36]) {
    const sample = wallMilliseconds + delta * 3_600_000
    const p = berlinCalendarParts(sample)
    const calendar = calendarMilliseconds(p.year, p.month, p.day, p.hour, p.minute, p.second)
    if (calendar !== null) offsets.add(calendar - sample)
  }
  const candidates = [...offsets].map((offset) => new Date(wallMilliseconds - offset).toISOString())
    .filter((iso) => formatTradeTimeInputValue(iso) === trimmed)
  if (candidates.length === 0) throw new Error('Diese Uhrzeit gibt es wegen der Zeitumstellung in Berlin nicht. Bitte eine andere Uhrzeit wählen.')
  if (candidates.length !== 1) throw new Error('Diese Uhrzeit kommt bei der Zeitumstellung in Berlin zweimal vor. Bitte eine eindeutige Uhrzeit wählen.')
  return candidates[0]
}

export function getTradeTimeInputError(value: string | null | undefined, originalIso?: string | null) {
  try {
    resolveTradeTimeInputToIso(value, '', originalIso)
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : 'Bitte die Trade-Zeit prüfen.'
  }
}

export function formatTradeTimeLabel(value?: string | null, locale = 'de-DE') {
  if (!value) return 'Nicht gesetzt'
  const milliseconds = zonedInstantMilliseconds(value)
  if (milliseconds === null) return 'Nicht gesetzt'
  return new Intl.DateTimeFormat(locale, {
    timeZone: DEFAULT_TRADE_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(milliseconds))
}

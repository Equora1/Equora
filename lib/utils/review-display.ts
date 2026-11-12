import type { Trade } from '@/lib/types/trade'
import { getDateKeyFromDate, normalizeTradeDate } from '@/lib/utils/calendar'
import { DEFAULT_TRADE_TIMEZONE, getTradeDateKey, resolveTradeOccurredAt } from '@/lib/utils/trade-time'

const savedDate = new Intl.DateTimeFormat('de-DE', { timeZone: DEFAULT_TRADE_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' })
const savedDay = new Intl.DateTimeFormat('de-DE', { timeZone: DEFAULT_TRADE_TIMEZONE, weekday: 'short', day: '2-digit', month: '2-digit' })
const calendarDay = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

export function formatReviewSavedDate(value: string) { return savedDate.format(new Date(value)) }
export function formatReviewSavedDay(value: string) { return savedDay.format(new Date(value)) }

/** A calendar key is a written day, not an instant in the machine's timezone. */
export function formatReviewCalendarDay(dateKey: string) {
  return calendarDay.format(new Date(`${dateKey}T12:00:00Z`))
}

export function buildReviewTitle(label: string, referenceDateKey: string) {
  const [year, month, day] = referenceDateKey.split('-')
  return `Review ${label} · ${day}.${month}.${year}`
}

/** Stored instants use the Journal timezone; legacy civil date labels keep their written day. */
export function getReviewTradeDateKey(trade: Trade) {
  const value = resolveTradeOccurredAt(trade)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) return value
  }
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const key = getTradeDateKey(value)
    if (key) return key
  }
  return getDateKeyFromDate(normalizeTradeDate(value))
}

export function getLatestReviewDateKey(trades: Trade[], referenceDateKey: string) {
  return trades.map(getReviewTradeDateKey).sort().at(-1) ?? referenceDateKey
}

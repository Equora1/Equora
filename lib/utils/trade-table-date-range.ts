import { getTradeDateKey } from '@/lib/utils/trade-time'

export type TradeTableDateRange = { dateFrom: string; dateTo: string }
export type TradeTableDatePreset = 'today' | 'last-seven-days' | 'this-month'

function isCalendarDate(value: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function getTradeTableDateRangeError({ dateFrom, dateTo }: TradeTableDateRange) {
  if ((dateFrom && !isCalendarDate(dateFrom)) || (dateTo && !isCalendarDate(dateTo))) {
    return 'Bitte gültige Datumswerte eingeben.'
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return 'Das Von-Datum muss vor oder am Bis-Datum liegen.'
  }
  return null
}

export function createTradeTableDateRange(preset: TradeTableDatePreset, now = new Date()): TradeTableDateRange {
  const today = getTradeDateKey(now.toISOString())!
  if (preset === 'today') return { dateFrom: today, dateTo: today }
  if (preset === 'this-month') return { dateFrom: `${today.slice(0, 7)}-01`, dateTo: today }

  // Subtract calendar days, avoiding 23/25-hour days at Berlin clock changes.
  const start = new Date(`${today}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() - 6)
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: today }
}

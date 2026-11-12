import { getTradeDateKey, resolveTradeTimeInputToIso } from '@/lib/utils/trade-time'

/** Calendar arithmetic, not elapsed 24-hour blocks (Berlin has 23/25-hour days). */
export function shiftJournalDay(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  if (!Number.isInteger(days) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) {
    throw new Error('JOURNAL_DAY_INVALID')
  }
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function startOfJournalDay(dateKey: string) {
  return new Date(resolveTradeTimeInputToIso(`${dateKey}T00:00`, ''))
}

/** Inclusive endpoints retain the existing Review/drilldown storage contract. */
export function journalPeriodEndingOn(reference: Date, days: number) {
  const lastDay = getTradeDateKey(reference.toISOString())
  if (!lastDay || !Number.isSafeInteger(days) || days < 1) throw new Error('JOURNAL_PERIOD_INVALID')
  const firstDay = shiftJournalDay(lastDay, 1 - days)
  const start = startOfJournalDay(firstDay)
  const end = new Date(startOfJournalDay(shiftJournalDay(lastDay, 1)).getTime() - 1)
  const previousStart = startOfJournalDay(shiftJournalDay(firstDay, -days))
  const previousEnd = new Date(start.getTime() - 1)
  return { start, end, previousStart, previousEnd }
}

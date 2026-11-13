import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { FilterState } from '@/lib/types/trade'

export const MIN_ANALYTICS_SAMPLE_SIZE = 5
export const MIN_ANALYTICS_BUCKET_SIZE = 3

export type AnalyticsEvidenceState = 'empty' | 'untrusted' | 'insufficient' | 'descriptive'
export type AnalyticsBucketTone = 'green' | 'red' | 'neutral'

export function hasSufficientAnalyticsBucketEvidence(trades: number) {
  return trades >= MIN_ANALYTICS_BUCKET_SIZE
}

export function getAnalyticsBucketTone(trades: number, tone: AnalyticsBucketTone): AnalyticsBucketTone {
  return hasSufficientAnalyticsBucketEvidence(trades) ? tone : 'neutral'
}

export function getAnalyticsBucketEvidenceLabel(trades: number, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  return hasSufficientAnalyticsBucketEvidence(trades)
    ? text('Deskriptiv', 'Historical results')
    : text(`Zu wenig Daten: ${trades}/${MIN_ANALYTICS_BUCKET_SIZE}`, `Too few trades: ${trades}/${MIN_ANALYTICS_BUCKET_SIZE}`)
}

export function getAnalyticsEvidenceState(matchedTrades: number, trustedTrades: number): AnalyticsEvidenceState {
  if (matchedTrades === 0) return 'empty'
  if (trustedTrades === 0) return 'untrusted'
  if (trustedTrades < MIN_ANALYTICS_SAMPLE_SIZE) return 'insufficient'
  return 'descriptive'
}

export function getAnalyticsScopeLabels(filters: FilterState, locale: JournalLocale = 'de', accountLabel = filters.account) {
  const text = journalText(locale)
  const labels: string[] = []

  if (filters.setup !== 'Alle') labels.push(`Setup: ${filters.setup}`)
  if (filters.dateFrom) labels.push(text(`Von: ${filters.dateFrom}`, `From: ${filters.dateFrom}`))
  if (filters.dateTo) labels.push(text(`Bis: ${filters.dateTo}`, `To: ${filters.dateTo}`))
  if (filters.account !== 'Alle') labels.push(text(`Konto: ${accountLabel}`, `Account: ${accountLabel}`))
  if (filters.session !== 'Alle') labels.push(`Session: ${filters.session}`)
  if (filters.concept !== 'Alle') labels.push(text(`Konzept: ${filters.concept}`, `Concept: ${filters.concept}`))
  if (filters.quality !== 'Alle') labels.push(text(`Qualität: ${filters.quality}`, `Quality: ${filters.quality}`))
  if (filters.emotion !== 'Alle') labels.push(`Emotion: ${filters.emotion}`)

  return labels
}

export function getAnalyticsPeriodLabel(filters: Pick<FilterState, 'dateFrom' | 'dateTo'>, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  if (filters.dateFrom && filters.dateTo) return text(`${filters.dateFrom} bis ${filters.dateTo}`, `${filters.dateFrom} to ${filters.dateTo}`)
  if (filters.dateFrom) return text(`ab ${filters.dateFrom}`, `from ${filters.dateFrom}`)
  if (filters.dateTo) return text(`bis ${filters.dateTo}`, `through ${filters.dateTo}`)
  return text('Gesamter Journalzeitraum', 'Entire journal period')
}

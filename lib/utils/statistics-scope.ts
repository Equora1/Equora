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

export function getAnalyticsBucketEvidenceLabel(trades: number) {
  return hasSufficientAnalyticsBucketEvidence(trades)
    ? 'Deskriptiv'
    : `Zu wenig Daten: ${trades}/${MIN_ANALYTICS_BUCKET_SIZE}`
}

export function getAnalyticsEvidenceState(matchedTrades: number, trustedTrades: number): AnalyticsEvidenceState {
  if (matchedTrades === 0) return 'empty'
  if (trustedTrades === 0) return 'untrusted'
  if (trustedTrades < MIN_ANALYTICS_SAMPLE_SIZE) return 'insufficient'
  return 'descriptive'
}

export function getAnalyticsScopeLabels(filters: FilterState) {
  const labels: string[] = []

  if (filters.setup !== 'Alle') labels.push(`Setup: ${filters.setup}`)
  if (filters.dateFrom) labels.push(`Von: ${filters.dateFrom}`)
  if (filters.dateTo) labels.push(`Bis: ${filters.dateTo}`)
  if (filters.account !== 'Alle') labels.push(`Konto: ${filters.account}`)
  if (filters.session !== 'Alle') labels.push(`Session: ${filters.session}`)
  if (filters.concept !== 'Alle') labels.push(`Konzept: ${filters.concept}`)
  if (filters.quality !== 'Alle') labels.push(`Qualität: ${filters.quality}`)
  if (filters.emotion !== 'Alle') labels.push(`Emotion: ${filters.emotion}`)

  return labels
}

export function getAnalyticsPeriodLabel(filters: Pick<FilterState, 'dateFrom' | 'dateTo'>) {
  if (filters.dateFrom && filters.dateTo) return `${filters.dateFrom} bis ${filters.dateTo}`
  if (filters.dateFrom) return `ab ${filters.dateFrom}`
  if (filters.dateTo) return `bis ${filters.dateTo}`
  return 'Gesamter Journalzeitraum'
}

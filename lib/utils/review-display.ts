import { journalNumberLocale, type JournalLocale } from '@/lib/i18n/journal'
import { REVIEW_PERIOD_OPTIONS, type ReviewPeriodPreset } from '@/lib/utils/review-types'
import type { Trade } from '@/lib/types/trade'
import { getDateKeyFromDate, normalizeTradeDate } from '@/lib/utils/calendar'
import { DEFAULT_TRADE_TIMEZONE, getTradeDateKey, resolveTradeOccurredAt } from '@/lib/utils/trade-time'

const savedDate = {
  de: new Intl.DateTimeFormat('de-DE', { timeZone: DEFAULT_TRADE_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }),
  en: new Intl.DateTimeFormat('en-GB', { timeZone: DEFAULT_TRADE_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }),
}

export function formatReviewSavedDate(value: string, locale: JournalLocale = 'de') {
  return savedDate[locale].format(new Date(value))
}

export function formatReviewSavedDay(value: string) {
  return new Intl.DateTimeFormat('de-DE', { timeZone: DEFAULT_TRADE_TIMEZONE, weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(value))
}

export function formatReviewTimelineDay(value: string, locale: JournalLocale) {
  const date = new Date(value)
  const weekday = new Intl.DateTimeFormat(journalNumberLocale[locale], { timeZone: DEFAULT_TRADE_TIMEZONE, weekday: 'short' }).format(date)
  const day = new Intl.DateTimeFormat(journalNumberLocale[locale], { timeZone: DEFAULT_TRADE_TIMEZONE, day: '2-digit', month: '2-digit' }).format(date)
  return { weekday, day }
}

/** A calendar key is a written day, not an instant in the machine's timezone. */
export function formatReviewCalendarDay(dateKey: string, locale: JournalLocale = 'de') {
  return new Intl.DateTimeFormat(journalNumberLocale[locale], { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    .format(new Date(`${dateKey}T12:00:00Z`))
}

export function buildReviewTitle(label: string, referenceDateKey: string, locale: JournalLocale = 'de') {
  const [year, month, day] = referenceDateKey.split('-')
  if (locale === 'en') {
    const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${referenceDateKey}T12:00:00Z`))
    return `Review · ${label} · ${date}`
  }
  return `Review ${label} · ${day}.${month}.${year}`
}

export function getReviewPeriodOptionLabel(period: ReviewPeriodPreset, locale: JournalLocale) {
  const option = REVIEW_PERIOD_OPTIONS.find((entry) => entry.key === period)
  if (!option) return 'Review'
  return locale === 'en' ? `${option.days} days` : option.label
}

const englishWeekdays: Readonly<Record<string, string>> = {
  Montag: 'Monday',
  Dienstag: 'Tuesday',
  Mittwoch: 'Wednesday',
  Donnerstag: 'Thursday',
  Freitag: 'Friday',
  Samstag: 'Saturday',
  Sonntag: 'Sunday',
}

export function formatReviewWeekday(weekday: string, locale: JournalLocale) {
  return locale === 'en' && Object.hasOwn(englishWeekdays, weekday) ? englishWeekdays[weekday] : weekday
}

const englishReviewAnswers: Readonly<Record<string, string>> = {
  Ja: 'Yes',
  Nein: 'No',
  Teilweise: 'Partly',
}

const englishReviewStates: Readonly<Record<string, string>> = {
  Fokussiert: 'Focused',
  Geduldig: 'Patient',
  Impulsiv: 'Too quick',
  Unscharf: 'Unclear',
  Müde: 'Tired',
  Gejagt: 'Under pressure',
}

export function formatReviewAnswer(value: string, locale: JournalLocale) {
  return locale === 'en' && Object.hasOwn(englishReviewAnswers, value) ? englishReviewAnswers[value] : value
}

export function formatReviewState(value: string, locale: JournalLocale) {
  return locale === 'en' && Object.hasOwn(englishReviewStates, value) ? englishReviewStates[value] : value
}

// These labels identify computed signals in review logic. Only their display changes.
const englishSignalLabels: Readonly<Record<string, string>> = {
  'Bestes Setup': 'Best setup',
  'Stärkster Markt': 'Strongest market',
  'Sauberste Session': 'Strongest session',
  'Bester Tag-Cluster': 'Best-performing tag',
  'Noch kein Lead-Cluster': 'No leading pattern yet',
  'Schwächstes Setup': 'Weakest setup',
  'Härtester Handelstag': 'Weakest weekday',
  'Negativer Tag-Trigger': 'Tag linked to losses',
  'Verlustserie': 'Losing streak',
  'Tag-Abdeckung': 'Tag coverage',
  'Tag-Radar': 'Tag overview',
  'Stärkster Tag': 'Strongest tag',
  'Prozess-Anker': 'Process tag',
  'Warn-Tag': 'Tag to review',
  'Wiederholer bei Verlusten': 'Recurring tag in losses',
  'Stärkste Tag-Kombi': 'Strongest tag combination',
  'Aufsteiger-Tag': 'Improving tag',
  'Kippender Tag': 'Declining tag',
  'Neuer Warn-Tag': 'New tag to review',
  'Prozess-Quote': 'Process tag rate',
  'Tag-Drift': 'Tag changes',
  'Tag-Kombis': 'Tag combinations',
  'Beste Kombi': 'Best combination',
  'Warn-Kombi': 'Combination to review',
  'Wiederkehrende Kombi': 'Recurring combination',
  'Volatile Kombi': 'Variable combination',
  'Fehlercluster': 'Recurring mistakes',
  'Häufigster Fehler-Tag': 'Most common mistake tag',
  'Fehler-Familie': 'Related mistakes',
  'Härteste Verlust-Kombi': 'Worst loss combination',
  'Blinde Verluste': 'Untagged losses',
  'Regelspur': 'Rule adherence',
  'Replizierbarkeit': 'Repeatability',
  'Dominanter Zustand': 'Most common mindset',
  'Letzter Lerneffekt': 'Latest takeaway',
}

export function getReviewSignalLabel(label: string, locale: JournalLocale) {
  return locale === 'en' && Object.hasOwn(englishSignalLabels, label) ? englishSignalLabels[label] : label
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

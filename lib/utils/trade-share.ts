import { journalText, type JournalLocale } from '@/lib/i18n/journal'

export type SharedTradeShareMode = 'review' | 'vault' | 'both'
export type SharedTradeVisibility = 'anonymous' | 'named'
export type SharedTradeStatus = 'pending' | 'reviewed' | 'featured' | 'rejected' | 'revoked'

export function getTradeShareModeLabel(mode: SharedTradeShareMode | string | null | undefined, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  switch (mode) {
    case 'review':
      return text('Nur Feedback', 'Feedback only')
    case 'vault':
      return text('Nur Sammlung', 'Collection only')
    case 'both':
      return text('Feedback und Sammlung', 'Feedback and collection')
    default:
      return text('Nicht gesetzt', 'Not set')
  }
}

export function getTradeShareVisibilityLabel(visibility: SharedTradeVisibility | string | null | undefined, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  switch (visibility) {
    case 'anonymous':
      return text('Anonym', 'Anonymous')
    case 'named':
      return text('Mit Namen', 'With name')
    default:
      return text('Unbekannt', 'Unknown')
  }
}

export function getTradeShareStatusLabel(status: SharedTradeStatus | string | null | undefined, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  switch (status) {
    case 'pending':
      return text('Wartet auf Review', 'Awaiting review')
    case 'reviewed':
      return text('Gesehen', 'Reviewed')
    case 'featured':
      return text('Hervorgehoben', 'Featured')
    case 'rejected':
      return text('Nicht freigegeben', 'Not approved')
    case 'revoked':
      return text('Zurückgezogen', 'Withdrawn')
    default:
      return text('Offen', 'Open')
  }
}

export const coachLearningCategories = [
  'Entry Timing',
  'Risk Management',
  'Trade Management',
  'Psychology',
  'Context Read',
  'A-Setup Execution',
  'Process Discipline',
] as const

const germanCategories = new Map<string, string>([
  ['Entry Timing', 'Einstiegszeitpunkt'],
  ['Risk Management', 'Risikomanagement'],
  ['Trade Management', 'Trade-Management'],
  ['Psychology', 'Psychologie'],
  ['Context Read', 'Marktkontext'],
  ['A-Setup Execution', 'A-Setup ausgeführt'],
  ['Process Discipline', 'Regeltreue'],
])

export function getTradeShareResultLabel(result: string | null, locale: JournalLocale) {
  if (!result) return '—'
  if (locale === 'de') return result
  switch (result) {
    case 'Gewinner': return 'Win'
    case 'Verlierer': return 'Loss'
    case 'Breakeven': return 'Break-even'
    case 'Offen': return 'Open'
    default: return result
  }
}

export function getTradeShareCategoryLabel(category: string | null | undefined, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  const value = category?.trim()
  if (!value) return text('Noch nicht kategorisiert', 'Uncategorised')
  return locale === 'de' ? (germanCategories.get(value) ?? value) : value
}

export function splitDraftItems(rawValue: string) {
  return rawValue
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function joinDraftItems(items: string[] | null | undefined) {
  return (items ?? []).join('\n')
}

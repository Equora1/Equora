export type SharedTradeShareMode = 'review' | 'vault' | 'both'
export type SharedTradeVisibility = 'anonymous' | 'named'
export type SharedTradeStatus = 'pending' | 'reviewed' | 'featured' | 'rejected' | 'revoked'

export function getTradeShareModeLabel(mode: SharedTradeShareMode | string | null | undefined) {
  switch (mode) {
    case 'review':
      return 'Review only'
    case 'vault':
      return 'Vault only'
    case 'both':
      return 'Review + Vault'
    default:
      return 'Nicht gesetzt'
  }
}

export function getTradeShareVisibilityLabel(visibility: SharedTradeVisibility | string | null | undefined) {
  switch (visibility) {
    case 'anonymous':
      return 'Anonym'
    case 'named':
      return 'Mit Namen'
    default:
      return 'Unbekannt'
  }
}

export function getTradeShareStatusLabel(status: SharedTradeStatus | string | null | undefined) {
  switch (status) {
    case 'pending':
      return 'Wartet auf Review'
    case 'reviewed':
      return 'Gesehen'
    case 'featured':
      return 'Featured'
    case 'rejected':
      return 'Nicht freigegeben'
    case 'revoked':
      return 'Vom User zurückgezogen'
    default:
      return 'Offen'
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

export function getTradeShareCategoryLabel(category: string | null | undefined) {
  return category?.trim() || 'Noch nicht kategorisiert'
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

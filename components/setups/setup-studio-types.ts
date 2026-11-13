import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { SavedSetupMedia, SetupImageRole } from '@/lib/types/setup'

export type DraftSetupMedia = SavedSetupMedia & {
  tempId: string
  previewUrl: string
  file?: File
  persisted: boolean
}

export type DraftSetup = {
  id?: string | null
  title: string
  category: string
  description: string
  entry: string
  exit: string
  invalidation: string
  playbook: string
  checklist: string
  mistakes: string
  isArchived: boolean
  isMaster: boolean
  sortOrder: number
  media: DraftSetupMedia[]
  linkedTradeIds: string[]
}

export type TradeLinkOption = {
  id: string
  label: string
  meta: string
}

export type StudioView = 'active' | 'master' | 'archive'

export const defaultCategories = ['SMC', 'Breakout', 'Price Action', 'Momentum', 'Mean Reversion', 'Trend', 'Custom']

export const mediaRoleOptions: Array<{ value: SetupImageRole; label: string; en: string }> = [
  { value: 'example', label: 'Beispiel', en: 'Example' },
  { value: 'best-practice', label: 'Saubere Ausführung', en: 'Good execution' },
  { value: 'mistake', label: 'Fehlerbild', en: 'Mistake example' },
]

export function getSetupImageRoleLabel(role: string | null | undefined, locale: JournalLocale) {
  const option = mediaRoleOptions.find((item) => item.value === role)
  return journalText(locale)(option?.label ?? 'Beispiel', option?.en ?? 'Example')
}

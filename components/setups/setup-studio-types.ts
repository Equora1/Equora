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

export const mediaRoleOptions: Array<{ value: SetupImageRole; label: string }> = [
  { value: 'example', label: 'Beispiel' },
  { value: 'best-practice', label: 'Saubere Ausführung' },
  { value: 'mistake', label: 'Fehlerbild' },
]

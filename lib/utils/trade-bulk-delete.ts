import { journalText, type JournalLocale } from '@/lib/i18n/journal'

const maxTradeCount = 10_000
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export function normalizeTradeDeleteSelection(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxTradeCount) return null

  const ids = new Set<string>()
  for (const id of value) {
    if (typeof id !== 'string' || !uuidPattern.test(id)) return null
    ids.add(id.toLowerCase())
  }
  if (ids.size !== value.length) return null
  return [...ids].sort()
}

export function formatTradeDeleteConfirmation(count: number, locale: JournalLocale) {
  return journalText(locale)(`LÖSCHEN ${count}`, `DELETE ${count}`)
}

export type TradeBulkDeleteResult =
  | { status: 'deleted'; message: string }
  | { status: 'rejected' | 'refresh'; message: string }

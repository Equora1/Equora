import { getTradeCurrencyStatus, type TradeCurrency } from '@/lib/utils/currency'

export type CurrencyCorrectionScope = 'all' | 'missing'
export type CurrencyCorrectionRow = { id: string; account_currency: string | null }
export type CurrencyCorrectionSummary = {
  total: number
  changes: number
  missing: number
  replacements: number
  alreadyCorrect: number
}

export function planTradeCurrencyCorrection(rows: CurrencyCorrectionRow[], currency: TradeCurrency, scope: CurrencyCorrectionScope) {
  const changes = rows.filter(row => row.account_currency !== currency
    && (scope === 'all' || getTradeCurrencyStatus(row.account_currency) === 'missing'))
  const missing = changes.filter(row => getTradeCurrencyStatus(row.account_currency) === 'missing').length
  const summary: CurrencyCorrectionSummary = {
    total: rows.length,
    changes: changes.length,
    missing,
    replacements: changes.length - missing,
    alreadyCorrect: rows.filter(row => row.account_currency === currency).length,
  }
  // Separate exact old values so every update can compare-and-set its currency.
  const groups = new Map<string | null, string[]>()
  for (const row of changes) {
    const ids = groups.get(row.account_currency) ?? []
    ids.push(row.id)
    groups.set(row.account_currency, ids)
  }
  const batches: Array<{ previous: string | null; ids: string[] }> = []
  for (const [previous, ids] of groups) {
    for (let offset = 0; offset < ids.length; offset += 100) {
      batches.push({ previous, ids: ids.slice(offset, offset + 100) })
    }
  }
  return { summary, batches }
}

import { getTradeCurrencyStatus, type TradeCurrency } from '@/lib/utils/currency'
import { findJournalFuturesContract } from '@/lib/utils/journal-futures'

export type CurrencyCorrectionScope = 'all' | 'missing'
export type CurrencyCorrectionRow = { id: string; account_currency: string | null; market?: string; instrument_type?: string | null }
export type CurrencyCorrectionSummary = {
  total: number
  changes: number
  missing: number
  replacements: number
  alreadyCorrect: number
  futuresRequiringEditor?: number
}

export function planTradeCurrencyCorrection(rows: CurrencyCorrectionRow[], currency: TradeCurrency, scope: CurrencyCorrectionScope) {
  const requested = rows.filter(row => row.account_currency !== currency
    && (scope === 'all' || getTradeCurrencyStatus(row.account_currency) === 'missing'))
  const changes = requested.filter(row => !findJournalFuturesContract(row.market, row.instrument_type))
  const futuresRequiringEditor = requested.length - changes.length
  const missing = changes.filter(row => getTradeCurrencyStatus(row.account_currency) === 'missing').length
  const summary: CurrencyCorrectionSummary = {
    total: rows.length,
    changes: changes.length,
    missing,
    replacements: changes.length - missing,
    alreadyCorrect: rows.filter(row => row.account_currency === currency).length,
    ...(futuresRequiringEditor ? { futuresRequiringEditor } : {}),
  }
  // Compare both the previous currency and the classification used for eligibility.
  const groups = new Map<string, { row: CurrencyCorrectionRow; ids: string[] }>()
  for (const row of changes) {
    const key = JSON.stringify([row.account_currency, row.market, row.instrument_type])
    const group = groups.get(key) ?? { row, ids: [] }
    group.ids.push(row.id)
    groups.set(key, group)
  }
  const batches: Array<{ previous: string | null; market?: string; instrumentType?: string | null; ids: string[] }> = []
  for (const { row, ids } of groups.values()) {
    for (let offset = 0; offset < ids.length; offset += 100) {
      batches.push({ previous: row.account_currency, market: row.market, instrumentType: row.instrument_type, ids: ids.slice(offset, offset + 100) })
    }
  }
  return { summary, batches }
}

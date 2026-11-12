import { createDefaultTradeTableFilters, type TradeTableFilters, type TradeTableSort } from '@/lib/utils/trade-table'

const sortValues: TradeTableSort[] = ['newest', 'oldest', 'pnl-desc', 'pnl-asc', 'r-desc', 'r-asc', 'market-asc', 'setup-asc']
const enumValues = {
  tagging: ['Alle', 'Getaggt', 'Ungetaggt'], outcome: ['Alle', 'Gewinner', 'Verlierer', 'Breakeven'],
  direction: ['Alle', 'Long', 'Short', 'Neutral'], status: ['Alle', 'Offen', 'Geschlossen', 'Unvollständig', 'Vollständig'],
  currencyCheck: ['Alle', 'Prüfen', 'Fehlt', 'Nicht unterstützt'],
}

export function parseTradeTableQuery(params: URLSearchParams) {
  const filters = createDefaultTradeTableFilters()
  for (const key of Object.keys(filters) as Array<keyof TradeTableFilters>) {
    if (key === 'requiredTags') continue
    const value = params.get(key)
    if (value === null) continue
    if (key in enumValues && !(enumValues[key as keyof typeof enumValues] as string[]).includes(value)) continue
    Object.assign(filters, { [key]: value })
  }
  const legacyTags = (params.get('tags') ?? '').split(',').map(tag => tag.trim()).filter(Boolean)
  filters.requiredTags = Array.from(new Set([...params.getAll('requiredTag'), ...legacyTags])).filter(Boolean)
  const rawSort = params.get('sort') as TradeTableSort
  const sort = sortValues.includes(rawSort) ? rawSort : 'newest'
  const rawPage = params.get('page') ?? '1'
  const page = /^\d+$/.test(rawPage) && Number.isSafeInteger(Number(rawPage)) && Number(rawPage) > 0 ? Number(rawPage) : 1
  return { filters, sort, page, reviewOnly: params.get('reviewOnly') === '1' }
}

export function buildTradeTableHref(current: string, state: {
  filters: TradeTableFilters; sort: TradeTableSort; page: number; reviewOnly: boolean; tradeId?: string
}) {
  const params = new URLSearchParams(current)
  const defaults = createDefaultTradeTableFilters()
  for (const key of Object.keys(defaults) as Array<keyof TradeTableFilters>) {
    if (key === 'requiredTags') continue
    params.delete(key)
    const value = state.filters[key]
    if (value !== defaults[key]) params.set(key, value)
  }
  params.delete('tags')
  params.delete('requiredTag')
  for (const tag of state.filters.requiredTags) params.append('requiredTag', tag)
  params.delete('sort')
  if (state.sort !== 'newest') params.set('sort', state.sort)
  params.set('page', String(state.page))
  params.delete('reviewOnly')
  if (state.reviewOnly) params.set('reviewOnly', '1')
  for (const key of ['tradeId', 'editTradeId', 'closeTradeId', 'capture']) params.delete(key)
  if (state.tradeId) params.set('tradeId', state.tradeId)
  return `/trades?${params.toString()}`
}

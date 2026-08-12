import type { FilterState, Trade } from '@/lib/types/trade'
import { getTradeAccountLabel } from '@/lib/utils/account-context'
import { getTradeDateKey, resolveTradeOccurredAt } from '@/lib/utils/trade-time'

export function filterTrades(trades: Trade[], filters: FilterState) {
  const dateFrom = filters.dateFrom.trim()
  const dateTo = filters.dateTo.trim()
  const hasDateScope = Boolean(dateFrom || dateTo)

  return trades.filter((trade) => {
    const accountMatch = filters.account === 'Alle' || getTradeAccountLabel(trade) === filters.account
    const sessionMatch = filters.session === 'Alle' || trade.session === filters.session
    const conceptMatch = filters.concept === 'Alle' || trade.concept === filters.concept
    const qualityMatch = filters.quality === 'Alle' || trade.quality === filters.quality
    const emotionMatch = filters.emotion === 'Alle' || trade.emotion === filters.emotion
    const setupMatch = filters.setup === 'Alle' || trade.setup === filters.setup
    const tradeDateKey = hasDateScope ? getTradeDateKey(resolveTradeOccurredAt(trade)) : null
    const dateMatch = !hasDateScope || Boolean(
      tradeDateKey
      && (!dateFrom || tradeDateKey >= dateFrom)
      && (!dateTo || tradeDateKey <= dateTo),
    )

    return accountMatch && sessionMatch && conceptMatch && qualityMatch && emotionMatch && setupMatch && dateMatch
  })
}

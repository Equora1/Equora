import type { FilterState, Trade } from '@/lib/types/trade'
export function filterTrades(trades: Trade[], filters: FilterState) {
  return trades.filter((trade) => {
    const sessionMatch = filters.session === 'Alle' || trade.session === filters.session
    const conceptMatch = filters.concept === 'Alle' || trade.concept === filters.concept
    const qualityMatch = filters.quality === 'Alle' || trade.quality === filters.quality
    const emotionMatch = filters.emotion === 'Alle' || trade.emotion === filters.emotion
    const setupMatch = filters.setup === 'Alle' || trade.setup === filters.setup
    return sessionMatch && conceptMatch && qualityMatch && emotionMatch && setupMatch
  })
}

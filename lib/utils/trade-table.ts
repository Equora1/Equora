import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'

export type TradeTableFilters = {
  search: string
  market: string
  setup: string
  session: string
  concept: string
  quality: string
  emotion: string
  tag: string
  weekday: string
  tagging: 'Alle' | 'Getaggt' | 'Ungetaggt'
  requiredTags: string[]
  outcome: 'Alle' | 'Gewinner' | 'Verlierer' | 'Breakeven'
  direction: 'Alle' | 'Long' | 'Short' | 'Neutral'
  status: 'Alle' | 'Offen' | 'Geschlossen' | 'Unvollständig' | 'Vollständig'
}

export type TradeTableSort =
  | 'newest'
  | 'oldest'
  | 'pnl-desc'
  | 'pnl-asc'
  | 'r-desc'
  | 'r-asc'
  | 'market-asc'
  | 'setup-asc'

export const TRADE_TABLE_WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

export type TradeTableSummary = {
  totalTrades: number
  winners: number
  losers: number
  breakeven: number
  netPnL: number
  averageR: number
  winnerRate: number
}

function hasDefinedPnL(trade: Trade) {
  return trade.netPnL !== undefined && trade.netPnL !== null
}

export function getTradeWeekdayLabel(trade: Trade) {
  const date = new Date(trade.createdAt ?? trade.date)
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(date)
}

export function buildTradeTagMap(tradeTags: TradeTag[]) {
  return tradeTags.reduce<Record<string, string[]>>((accumulator, tag) => {
    accumulator[tag.trade_id] ??= []
    if (!accumulator[tag.trade_id].includes(tag.tag)) {
      accumulator[tag.trade_id].push(tag.tag)
    }
    return accumulator
  }, {})
}

export function createDefaultTradeTableFilters(): TradeTableFilters {
  return {
    search: '',
    market: 'Alle',
    setup: 'Alle',
    session: 'Alle',
    concept: 'Alle',
    quality: 'Alle',
    emotion: 'Alle',
    tag: 'Alle',
    weekday: 'Alle',
    tagging: 'Alle',
    requiredTags: [],
    outcome: 'Alle',
    direction: 'Alle',
    status: 'Alle',
  }
}

export function filterTradeTableRows(trades: Trade[], tradeTagMap: Record<string, string[]>, filters: TradeTableFilters) {
  const searchTerm = filters.search.trim().toLowerCase()

  return trades.filter((trade) => {
    const tags = tradeTagMap[trade.id] ?? []
    const matchesSearch =
      !searchTerm ||
      [trade.market, trade.setup, trade.emotion, trade.session, trade.concept, trade.result, trade.r, getTradeWeekdayLabel(trade), ...tags]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(searchTerm))

    const matchesOutcome =
      filters.outcome === 'Alle' ||
      (filters.outcome === 'Gewinner' && (trade.netPnL ?? 0) > 0) ||
      (filters.outcome === 'Verlierer' && (trade.netPnL ?? 0) < 0) ||
      (filters.outcome === 'Breakeven' && hasDefinedPnL(trade) && trade.netPnL === 0)

    const matchesDirection =
      filters.direction === 'Alle' ||
      (filters.direction === 'Long' && trade.direction === 'long') ||
      (filters.direction === 'Short' && trade.direction === 'short') ||
      (filters.direction === 'Neutral' && trade.direction === 'neutral')

    const matchesWeekday = filters.weekday === 'Alle' || getTradeWeekdayLabel(trade) === filters.weekday
    const matchesStatus =
      filters.status === 'Alle' ||
      (filters.status === 'Offen' && trade.captureResult === 'open') ||
      (filters.status === 'Geschlossen' && trade.captureStatus === 'complete' && trade.captureResult !== 'open') ||
      (filters.status === 'Unvollständig' && trade.captureStatus === 'incomplete') ||
      (filters.status === 'Vollständig' && trade.captureStatus === 'complete')
    const matchesTagging =
      filters.tagging === 'Alle' ||
      (filters.tagging === 'Getaggt' && tags.length > 0) ||
      (filters.tagging === 'Ungetaggt' && tags.length === 0)
    const matchesRequiredTags = filters.requiredTags.length === 0 || filters.requiredTags.every((tag) => tags.includes(tag))

    return (
      matchesSearch &&
      (filters.market === 'Alle' || trade.market === filters.market) &&
      (filters.setup === 'Alle' || trade.setup === filters.setup) &&
      (filters.session === 'Alle' || trade.session === filters.session) &&
      (filters.concept === 'Alle' || trade.concept === filters.concept) &&
      (filters.quality === 'Alle' || trade.quality === filters.quality) &&
      (filters.emotion === 'Alle' || trade.emotion === filters.emotion) &&
      (filters.tag === 'Alle' || tags.includes(filters.tag)) &&
      matchesWeekday &&
      matchesTagging &&
      matchesRequiredTags &&
      matchesOutcome &&
      matchesDirection &&
      matchesStatus
    )
  })
}

export function sortTradeTableRows(trades: Trade[], sort: TradeTableSort) {
  const rows = [...trades]

  rows.sort((left, right) => {
    switch (sort) {
      case 'oldest':
        return (new Date(left.createdAt ?? left.date).getTime() || 0) - (new Date(right.createdAt ?? right.date).getTime() || 0)
      case 'pnl-desc':
        return (right.netPnL ?? 0) - (left.netPnL ?? 0)
      case 'pnl-asc':
        return (left.netPnL ?? 0) - (right.netPnL ?? 0)
      case 'r-desc':
        return (right.rValue ?? 0) - (left.rValue ?? 0)
      case 'r-asc':
        return (left.rValue ?? 0) - (right.rValue ?? 0)
      case 'market-asc':
        return left.market.localeCompare(right.market, 'de')
      case 'setup-asc':
        return left.setup.localeCompare(right.setup, 'de')
      case 'newest':
      default:
        return (new Date(right.createdAt ?? right.date).getTime() || 0) - (new Date(left.createdAt ?? left.date).getTime() || 0)
    }
  })

  return rows
}

export function summarizeTrades(trades: Trade[]): TradeTableSummary {
  const pnlKnownTrades = trades.filter((trade) => hasDefinedPnL(trade))
  const winners = pnlKnownTrades.filter((trade) => (trade.netPnL ?? 0) > 0).length
  const losers = pnlKnownTrades.filter((trade) => (trade.netPnL ?? 0) < 0).length
  const breakeven = pnlKnownTrades.filter((trade) => trade.netPnL === 0).length
  const netPnL = pnlKnownTrades.reduce((sum, trade) => sum + (trade.netPnL ?? 0), 0)
  const averageR = trades.length ? trades.reduce((sum, trade) => sum + (trade.rValue ?? 0), 0) / trades.length : 0

  return {
    totalTrades: trades.length,
    winners,
    losers,
    breakeven,
    netPnL,
    averageR,
    winnerRate: pnlKnownTrades.length ? (winners / pnlKnownTrades.length) * 100 : 0,
  }
}

export function countActiveTradeTableFilters(filters: TradeTableFilters) {
  let count = 0

  if (filters.search.trim().length > 0) count += 1
  if (filters.requiredTags.length > 0) count += 1

  const singularValues = [
    filters.market,
    filters.setup,
    filters.session,
    filters.concept,
    filters.quality,
    filters.emotion,
    filters.tag,
    filters.weekday,
    filters.tagging,
    filters.outcome,
    filters.direction,
    filters.status,
  ]

  count += singularValues.filter((value) => value !== 'Alle').length

  return count
}

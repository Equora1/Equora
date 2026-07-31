export type TradeTag = {
  id: string
  trade_id: string
  tag: string
  created_at: string
}

export type TagStat = {
  tag: string
  totalTrades: number
  winRate: number
  avgR: number
  netPnL: number
  profitFactor: number
}

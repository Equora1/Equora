import type { Trade } from '@/lib/types/trade'
import {
  calculateAverageR,
  calculateProfitFactor,
  calculateWinRate,
  formatCurrency,
  formatRMultiple,
  parseTradingNumber,
  parseR,
} from '@/lib/utils/calculations'

function getTradePnL(trade: Trade): number | null {
  if (trade.netPnL !== undefined && trade.netPnL !== null) return trade.netPnL
  return parseTradingNumber(trade.result)
}

function getTradesWithResolvedPnL(trades: Trade[]) {
  return trades.filter((trade) => getTradePnL(trade) !== null)
}

function getTradeRValue(trade: Trade): number {
  return trade.rValue ?? parseR(trade.r)
}

function sortTradesChronologically(trades: Trade[]) {
  return [...trades].sort((a, b) => new Date(a.createdAt ?? a.date).getTime() - new Date(b.createdAt ?? b.date).getTime())
}

function buildStreaks(trades: Trade[]) {
  let currentWinStreak = 0
  let currentLossStreak = 0
  let longestWinStreak = 0
  let longestLossStreak = 0

  for (const trade of sortTradesChronologically(getTradesWithResolvedPnL(trades))) {
    const pnl = getTradePnL(trade)
    if (pnl === null) continue

    if (pnl > 0) {
      currentWinStreak += 1
      currentLossStreak = 0
    } else if (pnl < 0) {
      currentLossStreak += 1
      currentWinStreak = 0
    }

    longestWinStreak = Math.max(longestWinStreak, currentWinStreak)
    longestLossStreak = Math.max(longestLossStreak, currentLossStreak)
  }

  return { currentWinStreak, currentLossStreak, longestWinStreak, longestLossStreak }
}

function calculateMaxDrawdown(trades: Trade[]) {
  let cumulative = 0
  let peak = 0
  let maxDrawdown = 0

  for (const trade of sortTradesChronologically(getTradesWithResolvedPnL(trades))) {
    const pnl = getTradePnL(trade)
    if (pnl === null) continue
    cumulative += pnl
    peak = Math.max(peak, cumulative)
    maxDrawdown = Math.min(maxDrawdown, cumulative - peak)
  }

  return Math.abs(maxDrawdown)
}

export function getWinningTrades(trades: Trade[]) {
  return getTradesWithResolvedPnL(trades).filter((trade) => (getTradePnL(trade) ?? 0) > 0)
}

export function getLosingTrades(trades: Trade[]) {
  return getTradesWithResolvedPnL(trades).filter((trade) => (getTradePnL(trade) ?? 0) < 0)
}

export function getGrossProfit(trades: Trade[]) {
  return getWinningTrades(trades).reduce((sum, trade) => sum + (getTradePnL(trade) ?? 0), 0)
}

export function getGrossLoss(trades: Trade[]) {
  return getLosingTrades(trades).reduce((sum, trade) => sum + (getTradePnL(trade) ?? 0), 0)
}

export function getCoreMetrics(trades: Trade[]) {
  const resolvedTrades = getTradesWithResolvedPnL(trades)
  const winners = getWinningTrades(resolvedTrades)
  const losers = getLosingTrades(resolvedTrades)
  const breakeven = resolvedTrades.length - winners.length - losers.length
  const grossProfit = getGrossProfit(trades)
  const grossLoss = getGrossLoss(trades)
  const netPnL = grossProfit + grossLoss
  const averageR = calculateAverageR(trades.map((trade) => getTradeRValue(trade)))
  const avgWinner = winners.length ? grossProfit / winners.length : 0
  const avgLoser = losers.length ? grossLoss / losers.length : 0
  const expectancy = resolvedTrades.length ? netPnL / resolvedTrades.length : 0
  const expectancyR = trades.length ? trades.reduce((sum, trade) => sum + getTradeRValue(trade), 0) / trades.length : 0

  return {
    totalTrades: trades.length,
    winners: winners.length,
    losers: losers.length,
    breakeven,
    winRate: calculateWinRate(resolvedTrades.length, winners.length),
    averageR,
    profitFactor: calculateProfitFactor(grossProfit, grossLoss),
    netPnL,
    grossProfit,
    grossLoss,
    avgWinner,
    avgLoser,
    expectancy,
    expectancyR,
    maxDrawdown: calculateMaxDrawdown(trades),
    largestWin: winners.length ? Math.max(...winners.map((trade) => getTradePnL(trade) ?? 0)) : 0,
    largestLoss: losers.length ? Math.min(...losers.map((trade) => getTradePnL(trade) ?? 0)) : 0,
    resolvedTrades: resolvedTrades.length,
    ...buildStreaks(trades),
  }
}

export function groupTradesBySetup(trades: Trade[]) {
  return trades.reduce<Record<string, Trade[]>>((accumulator, trade) => {
    ;(accumulator[trade.setup] ||= []).push(trade)
    return accumulator
  }, {})
}

export function buildConceptPerformance(trades: Trade[]) {
  const grouped = groupTradesBySetup(trades)
  return Object.entries(grouped).map(([setup, setupTrades]) => {
    const metrics = getCoreMetrics(setupTrades)
    return {
      concept: setup,
      winRate: `${metrics.winRate.toFixed(0)}%`,
      pnl: formatCurrency(metrics.netPnL),
      avgR: formatRMultiple(metrics.averageR),
      tone: metrics.netPnL >= 0 ? ('green' as const) : ('red' as const),
    }
  })
}

export function findBestMarket(trades: Trade[]) {
  const grouped = trades.reduce<Record<string, number>>((accumulator, trade) => {
    accumulator[trade.market] = (accumulator[trade.market] || 0) + (getTradePnL(trade) ?? 0)
    return accumulator
  }, {})

  return Object.entries(grouped).sort((a, b) => b[1] - a[1])[0]
}

export function findBestEmotion(trades: Trade[]) {
  const grouped = trades.reduce<Record<string, Trade[]>>((accumulator, trade) => {
    ;(accumulator[trade.emotion] ||= []).push(trade)
    return accumulator
  }, {})

  return Object.entries(grouped)
    .map(([emotion, emotionTrades]) => ({
      emotion,
      winRate: getCoreMetrics(emotionTrades).winRate,
      totalTrades: emotionTrades.length,
    }))
    .sort((a, b) => b.winRate - a.winRate)[0]
}

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
import { deriveTradeKillZoneLabel, deriveTradeSessionLabel, getTradeHourInTimezone, resolveTradeOccurredAt } from '@/lib/utils/trade-time'
import { resolveMonetaryScope, type MonetaryScope } from '@/lib/utils/currency'
import { MIN_ANALYTICS_BUCKET_SIZE } from '@/lib/utils/statistics-scope'

export type TimeWindowPerformanceRow = {
  key: string
  label: string
  trades: number
  winRate: number
  netPnL: number
  averageR: number | null
  rCount: number
  tone: 'green' | 'red' | 'neutral'
  currency: MonetaryScope['currency']
}

export type TimeWindowPerformance = {
  rows: TimeWindowPerformanceRow[]
  coveredTrades: number
  missingTrades: number
  bestWindow: TimeWindowPerformanceRow | null
  weakestWindow: TimeWindowPerformanceRow | null
  monetaryScope: MonetaryScope
}

export type SessionPerformanceRow = {
  key: string
  label: string
  trades: number
  winRate: number
  netPnL: number
  averageR: number | null
  rCount: number
  tone: 'green' | 'red' | 'neutral'
  currency: MonetaryScope['currency']
}

export type SessionPerformance = {
  rows: SessionPerformanceRow[]
  bestRow: SessionPerformanceRow | null
  weakestRow: SessionPerformanceRow | null
  monetaryScope: MonetaryScope
}

export type DrawdownPhase = {
  key: string
  startAt: string
  endAt: string
  recoveredAt: string | null
  depth: number
  tradeCount: number
  durationDays: number
  status: 'open' | 'recovered'
}

export type DrawdownProfile = {
  phases: DrawdownPhase[]
  maxDepth: number
  currentDepth: number
  longestDurationDays: number
  longestTradeCount: number
  phaseCount: number
  recoveredPhaseCount: number
  activePhase: DrawdownPhase | null
  deepestPhase: DrawdownPhase | null
  longestPhase: DrawdownPhase | null
  monetaryScope: MonetaryScope
}

export type StreakTodayStatus = 'win' | 'loss' | 'breakeven' | 'open' | 'no-trade'

export type StreakMetrics = {
  currentWinStreak: number
  currentLossStreak: number
  longestWinStreak: number
  longestLossStreak: number
  latestOutcome: 'win' | 'loss' | 'breakeven' | null
  todayStatus: StreakTodayStatus
  todayTrades: number
  todayWins: number
  todayLosses: number
  todayBreakeven: number
  todayOpenTrades: number
}

const TIME_WINDOWS = [
  { key: 'pre', label: 'Vor 08 Uhr', startHour: 0, endHour: 8 },
  { key: 'morning-open', label: '08–10 Uhr', startHour: 8, endHour: 10 },
  { key: 'late-morning', label: '10–12 Uhr', startHour: 10, endHour: 12 },
  { key: 'midday', label: '12–14 Uhr', startHour: 12, endHour: 14 },
  { key: 'afternoon', label: '14–16 Uhr', startHour: 14, endHour: 16 },
  { key: 'late', label: 'Ab 16 Uhr', startHour: 16, endHour: 24 },
] as const


function getTradePnL(trade: Trade): number | null {
  if (trade.netPnL !== undefined && trade.netPnL !== null) return trade.netPnL
  return parseTradingNumber(trade.result)
}

function getTradesWithResolvedPnL(trades: Trade[]) {
  return trades.filter((trade) => getTradePnL(trade) !== null)
}

function resolvePnLCurrencyScope(trades: Trade[]) {
  return resolveMonetaryScope(getTradesWithResolvedPnL(trades).map((trade) => trade.accountCurrency))
}

function getTradeRValue(trade: Trade): number {
  return trade.rValue ?? parseR(trade.r)
}

function getTradeRValueOrNull(trade: Trade): number | null {
  if (trade.rValue !== null && trade.rValue !== undefined && Number.isFinite(trade.rValue)) return trade.rValue
  const rawR = typeof trade.r === 'string' ? trade.r.trim() : trade.r
  if (rawR === null || rawR === undefined || rawR === '') return null
  const parsed = parseR(rawR)
  return Number.isFinite(parsed) ? parsed : null
}

function getAverageDocumentedR(trades: Trade[]): { averageR: number | null; rCount: number } {
  const rValues = trades
    .map((trade) => getTradeRValueOrNull(trade))
    .filter((value): value is number => value !== null)
  if (!rValues.length) return { averageR: null, rCount: 0 }
  return { averageR: rValues.reduce((sum, value) => sum + value, 0) / rValues.length, rCount: rValues.length }
}

function sortTradesChronologically(trades: Trade[]) {
  return [...trades].sort((a, b) => new Date(resolveTradeOccurredAt(a)).getTime() - new Date(resolveTradeOccurredAt(b)).getTime())
}

function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildStreakMetrics(trades: Trade[], today = new Date()): StreakMetrics {
  let currentWinStreak = 0
  let currentLossStreak = 0
  let longestWinStreak = 0
  let longestLossStreak = 0
  let latestOutcome: StreakMetrics['latestOutcome'] = null

  for (const trade of sortTradesChronologically(getTradesWithResolvedPnL(trades))) {
    const pnl = getTradePnL(trade)
    if (pnl === null) continue

    if (pnl > 0) {
      currentWinStreak += 1
      currentLossStreak = 0
      latestOutcome = 'win'
    } else if (pnl < 0) {
      currentLossStreak += 1
      currentWinStreak = 0
      latestOutcome = 'loss'
    } else {
      currentWinStreak = 0
      currentLossStreak = 0
      latestOutcome = 'breakeven'
    }

    longestWinStreak = Math.max(longestWinStreak, currentWinStreak)
    longestLossStreak = Math.max(longestLossStreak, currentLossStreak)
  }

  const todayKey = toLocalDateKey(today)
  const todaysTrades = trades.filter((trade) => toLocalDateKey(resolveTradeOccurredAt(trade)) === todayKey)
  const todayWins = todaysTrades.filter((trade) => (getTradePnL(trade) ?? 0) > 0).length
  const todayLosses = todaysTrades.filter((trade) => (getTradePnL(trade) ?? 0) < 0).length
  const todayBreakeven = todaysTrades.filter((trade) => getTradePnL(trade) === 0).length
  const todayOpenTrades = todaysTrades.filter((trade) => trade.captureResult === 'open' || getTradePnL(trade) === null).length
  const todayStatus: StreakTodayStatus = todayWins > 0
    ? 'win'
    : todayLosses > 0
      ? 'loss'
      : todayBreakeven > 0
        ? 'breakeven'
        : todayOpenTrades > 0
          ? 'open'
          : 'no-trade'

  return {
    currentWinStreak,
    currentLossStreak,
    longestWinStreak,
    longestLossStreak,
    latestOutcome,
    todayStatus,
    todayTrades: todaysTrades.length,
    todayWins,
    todayLosses,
    todayBreakeven,
    todayOpenTrades,
  }
}

function calculateMaxDrawdown(trades: Trade[]) {
  return buildDrawdownProfile(trades).maxDepth
}

function getDayDifference(startAt: string, endAt: string) {
  const start = new Date(startAt)
  const end = new Date(endAt)
  const diff = end.getTime() - start.getTime()

  if (Number.isNaN(diff) || diff <= 0) return 0
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function buildDrawdownProfile(trades: Trade[]): DrawdownProfile {
  const phases: DrawdownPhase[] = []
  const monetaryScope = resolvePnLCurrencyScope(trades)
  const chronologicalTrades = monetaryScope.isComparable
    ? sortTradesChronologically(getTradesWithResolvedPnL(trades))
    : []

  let cumulative = 0
  let peak = 0
  let activePhase: DrawdownPhase | null = null

  for (const trade of chronologicalTrades) {
    const pnl = getTradePnL(trade)
    if (pnl === null) continue

    const occurredAt = resolveTradeOccurredAt(trade)
    cumulative += pnl
    const underwater = cumulative < peak

    if (underwater) {
      if (!activePhase) {
        activePhase = {
          key: `drawdown-${phases.length + 1}`,
          startAt: occurredAt,
          endAt: occurredAt,
          recoveredAt: null,
          depth: peak - cumulative,
          tradeCount: 1,
          durationDays: 0,
          status: 'open',
        }
      } else {
        activePhase.endAt = occurredAt
        activePhase.tradeCount += 1
        activePhase.depth = Math.max(activePhase.depth, peak - cumulative)
        activePhase.durationDays = getDayDifference(activePhase.startAt, occurredAt)
      }
    } else if (activePhase) {
      activePhase.endAt = occurredAt
      activePhase.tradeCount += 1
      activePhase.recoveredAt = occurredAt
      activePhase.durationDays = getDayDifference(activePhase.startAt, occurredAt)
      activePhase.status = 'recovered'
      phases.push(activePhase)
      activePhase = null
    }

    peak = Math.max(peak, cumulative)
  }

  if (activePhase) {
    phases.push({
      ...activePhase,
      durationDays: getDayDifference(activePhase.startAt, activePhase.endAt),
      status: 'open',
    })
  }

  const deepestPhase = phases.length ? [...phases].sort((a, b) => b.depth - a.depth || b.tradeCount - a.tradeCount)[0] : null
  const longestPhase = phases.length ? [...phases].sort((a, b) => b.durationDays - a.durationDays || b.tradeCount - a.tradeCount || b.depth - a.depth)[0] : null

  return {
    phases,
    maxDepth: deepestPhase?.depth ?? 0,
    currentDepth: activePhase ? Math.max(0, peak - cumulative) : 0,
    longestDurationDays: longestPhase?.durationDays ?? 0,
    longestTradeCount: longestPhase?.tradeCount ?? 0,
    phaseCount: phases.length,
    recoveredPhaseCount: phases.filter((phase) => phase.status === 'recovered').length,
    activePhase: phases.find((phase) => phase.status === 'open') ?? null,
    deepestPhase,
    longestPhase,
    monetaryScope,
  }
}

export function getWinningTrades(trades: Trade[]) {
  return getTradesWithResolvedPnL(trades).filter((trade) => (getTradePnL(trade) ?? 0) > 0)
}

export function getLosingTrades(trades: Trade[]) {
  return getTradesWithResolvedPnL(trades).filter((trade) => (getTradePnL(trade) ?? 0) < 0)
}

export function getGrossProfit(trades: Trade[]) {
  return resolvePnLCurrencyScope(trades).isComparable
    ? getWinningTrades(trades).reduce((sum, trade) => sum + (getTradePnL(trade) ?? 0), 0)
    : 0
}

export function getGrossLoss(trades: Trade[]) {
  return resolvePnLCurrencyScope(trades).isComparable
    ? getLosingTrades(trades).reduce((sum, trade) => sum + (getTradePnL(trade) ?? 0), 0)
    : 0
}

export function getCoreMetrics(trades: Trade[]) {
  const resolvedTrades = getTradesWithResolvedPnL(trades)
  const monetaryScope = resolvePnLCurrencyScope(trades)
  const winners = getWinningTrades(resolvedTrades)
  const losers = getLosingTrades(resolvedTrades)
  const breakeven = resolvedTrades.length - winners.length - losers.length
  const grossProfit = monetaryScope.isComparable ? getGrossProfit(trades) : 0
  const grossLoss = monetaryScope.isComparable ? getGrossLoss(trades) : 0
  const netPnL = grossProfit + grossLoss
  const averageR = calculateAverageR(trades.map((trade) => getTradeRValue(trade)))
  const avgWinner = monetaryScope.isComparable && winners.length ? grossProfit / winners.length : 0
  const avgLoser = monetaryScope.isComparable && losers.length ? grossLoss / losers.length : 0
  const expectancy = monetaryScope.isComparable && resolvedTrades.length ? netPnL / resolvedTrades.length : 0
  const expectancyR = trades.length ? trades.reduce((sum, trade) => sum + getTradeRValue(trade), 0) / trades.length : 0

  return {
    totalTrades: trades.length,
    winners: winners.length,
    losers: losers.length,
    breakeven,
    winRate: calculateWinRate(resolvedTrades.length, winners.length),
    averageR,
    profitFactor: monetaryScope.isComparable ? calculateProfitFactor(grossProfit, grossLoss) : 0,
    netPnL,
    grossProfit,
    grossLoss,
    avgWinner,
    avgLoser,
    expectancy,
    expectancyR,
    maxDrawdown: calculateMaxDrawdown(trades),
    largestWin: monetaryScope.isComparable && winners.length ? Math.max(...winners.map((trade) => getTradePnL(trade) ?? 0)) : 0,
    largestLoss: monetaryScope.isComparable && losers.length ? Math.min(...losers.map((trade) => getTradePnL(trade) ?? 0)) : 0,
    resolvedTrades: resolvedTrades.length,
    monetaryScope,
    currency: monetaryScope.currency,
    ...buildStreakMetrics(trades),
  }
}

export function groupTradesBySetup(trades: Trade[]) {
  return trades.reduce<Record<string, Trade[]>>((accumulator, trade) => {
    ;(accumulator[trade.setup] ||= []).push(trade)
    return accumulator
  }, {})
}

export function buildConceptPerformance(trades: Trade[]) {
  const monetaryScope = resolvePnLCurrencyScope(trades)
  if (!monetaryScope.isComparable) return []
  const grouped = groupTradesBySetup(trades)
  return Object.entries(grouped).map(([setup, setupTrades]) => {
    const metrics = getCoreMetrics(setupTrades)
    return {
      concept: setup,
      winRate: `${metrics.winRate.toFixed(0)}%`,
      pnl: formatCurrency(metrics.netPnL, 0, monetaryScope.currency),
      avgR: formatRMultiple(metrics.averageR),
      tone: metrics.netPnL >= 0 ? ('green' as const) : ('red' as const),
    }
  })
}

export function findBestMarket(trades: Trade[]) {
  if (!resolvePnLCurrencyScope(trades).isComparable) return undefined
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


export function buildTimeWindowPerformance(trades: Trade[]): TimeWindowPerformance {
  const monetaryScope = resolvePnLCurrencyScope(trades)
  const rows = TIME_WINDOWS.map((window) => {
    const windowTrades = getTradesWithResolvedPnL(trades).filter((trade) => {
      const occurredAt = resolveTradeOccurredAt(trade)
      const date = new Date(occurredAt)
      if (Number.isNaN(date.getTime())) return false
      const hour = getTradeHourInTimezone(occurredAt)
      if (hour === null) return false
      return hour >= window.startHour && hour < window.endHour
    })

    const metrics = getCoreMetrics(windowTrades)
    const { averageR, rCount } = getAverageDocumentedR(windowTrades)

    return {
      key: window.key,
      label: window.label,
      trades: windowTrades.length,
      winRate: metrics.winRate,
      netPnL: monetaryScope.isComparable ? metrics.netPnL : 0,
      averageR,
      rCount,
      tone: !monetaryScope.isComparable || windowTrades.length < MIN_ANALYTICS_BUCKET_SIZE ? 'neutral' as const : metrics.netPnL > 0 ? 'green' as const : metrics.netPnL < 0 ? 'red' as const : 'neutral' as const,
      currency: monetaryScope.currency,
    }
  })

  const coveredTrades = rows.reduce((sum, row) => sum + row.trades, 0)
  const missingTrades = Math.max(0, getTradesWithResolvedPnL(trades).length - coveredTrades)
  const populatedRows = rows.filter((row) => row.trades >= MIN_ANALYTICS_BUCKET_SIZE)
  const bestWindow = monetaryScope.isComparable && populatedRows.length ? [...populatedRows].sort((a, b) => b.netPnL - a.netPnL || b.winRate - a.winRate)[0] : null
  const weakestWindow = monetaryScope.isComparable && populatedRows.length ? [...populatedRows].sort((a, b) => a.netPnL - b.netPnL || a.winRate - b.winRate)[0] : null

  return {
    rows,
    coveredTrades,
    missingTrades,
    bestWindow,
    weakestWindow,
    monetaryScope,
  }
}


function buildLabelPerformance(trades: Trade[], labels: string[], getLabel: (trade: Trade) => string): SessionPerformance {
  const monetaryScope = resolvePnLCurrencyScope(trades)
  const rows = labels.map((label) => {
    const bucketTrades = getTradesWithResolvedPnL(trades).filter((trade) => getLabel(trade) === label)
    const metrics = getCoreMetrics(bucketTrades)
    const { averageR, rCount } = getAverageDocumentedR(bucketTrades)

    return {
      key: label,
      label,
      trades: bucketTrades.length,
      winRate: metrics.winRate,
      netPnL: monetaryScope.isComparable ? metrics.netPnL : 0,
      averageR,
      rCount,
      tone: !monetaryScope.isComparable || bucketTrades.length < MIN_ANALYTICS_BUCKET_SIZE ? 'neutral' as const : metrics.netPnL > 0 ? 'green' as const : metrics.netPnL < 0 ? 'red' as const : 'neutral' as const,
      currency: monetaryScope.currency,
    }
  })

  const populatedRows = rows.filter((row) => row.trades >= MIN_ANALYTICS_BUCKET_SIZE)
  const bestRow = monetaryScope.isComparable && populatedRows.length ? [...populatedRows].sort((a, b) => b.netPnL - a.netPnL || b.winRate - a.winRate)[0] : null
  const weakestRow = monetaryScope.isComparable && populatedRows.length ? [...populatedRows].sort((a, b) => a.netPnL - b.netPnL || a.winRate - b.winRate)[0] : null

  return {
    rows,
    bestRow,
    weakestRow,
    monetaryScope,
  }
}

export function buildSessionPerformance(trades: Trade[]): SessionPerformance {
  return buildLabelPerformance(trades, ['Asia / Tokyo', 'London', 'New York', 'Overnight'], (trade) => deriveTradeSessionLabel(resolveTradeOccurredAt(trade)))
}

export function buildKillZonePerformance(trades: Trade[]): SessionPerformance {
  return buildLabelPerformance(trades, ['Asia Open', 'London Open', 'New York Open', 'London Close', 'Kein Kernfenster'], (trade) => deriveTradeKillZoneLabel(resolveTradeOccurredAt(trade)))
}

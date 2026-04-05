import type { Trade } from '@/lib/types/trade'

export type CalendarDaySummary = {
  dateKey: string
  day: number
  month: number
  year: number
  tradeCount: number
  netPnL: number
  setups: string[]
  markets: string[]
  openTradeCount: number
  incompleteTradeCount: number
  screenshotTradeCount: number
  closedTradeCount: number
  riskTradeCount: number
  plannedRiskAmount: number
  stopRiskAmount: number
  marginUsed: number
  maxLeverage: number | null
  maxActualRiskPercent: number | null
  accountRiskTradeCount: number
}

const germanMonthMap: Record<string, number> = {
  jan: 0,
  januar: 0,
  feb: 1,
  februar: 1,
  mär: 2,
  maerz: 2,
  märz: 2,
  mar: 2,
  apr: 3,
  april: 3,
  mai: 4,
  jun: 5,
  juni: 5,
  jul: 6,
  juli: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  okt: 9,
  oktober: 9,
  nov: 10,
  november: 10,
  dez: 11,
  dezember: 11,
}

export function normalizeTradeDate(date: string): Date {
  const direct = new Date(date)
  if (!Number.isNaN(direct.getTime())) return direct

  const match = date.trim().match(/^(\d{1,2})\s+([A-Za-zÄÖÜäöüß\.]+)\s+(\d{4})$/)
  if (match) {
    const day = Number(match[1])
    const monthKey = match[2].replace('.', '').toLowerCase()
    const year = Number(match[3])
    const month = germanMonthMap[monthKey]
    if (month !== undefined) return new Date(year, month, day)
  }

  return new Date(2026, 2, 1)
}

export function getDateKeyFromDate(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()

  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function hasScreenshot(trade: Trade) {
  return Boolean(trade.screenshotUrl || (trade.screenshotUrls?.length ?? 0) > 0 || (trade.screenshotCount ?? 0) > 0)
}

function isOpenTrade(trade: Trade) {
  return trade.captureResult === 'open'
}

function isIncompleteTrade(trade: Trade) {
  return trade.captureStatus === 'incomplete' || trade.isComplete === false
}

export function buildCalendarSummary(trades: Trade[]): CalendarDaySummary[] {
  const grouped = trades.reduce<Record<string, CalendarDaySummary>>((acc, trade) => {
    const tradeDate = normalizeTradeDate(trade.createdAt ?? trade.date)
    const year = tradeDate.getFullYear()
    const month = tradeDate.getMonth()
    const day = tradeDate.getDate()
    const dateKey = getDateKeyFromDate(tradeDate)

    if (!acc[dateKey]) {
      acc[dateKey] = {
        dateKey,
        day,
        month,
        year,
        tradeCount: 0,
        netPnL: 0,
        setups: [],
        markets: [],
        openTradeCount: 0,
        incompleteTradeCount: 0,
        screenshotTradeCount: 0,
        closedTradeCount: 0,
        riskTradeCount: 0,
        plannedRiskAmount: 0,
        stopRiskAmount: 0,
        marginUsed: 0,
        maxLeverage: null,
        maxActualRiskPercent: null,
        accountRiskTradeCount: 0,
      }
    }

    const summary = acc[dateKey]
    summary.tradeCount += 1
    summary.netPnL += trade.netPnL ?? 0
    if (trade.setup) summary.setups.push(trade.setup)
    if (trade.market) summary.markets.push(trade.market)
    if (isOpenTrade(trade)) summary.openTradeCount += 1
    if (isIncompleteTrade(trade)) summary.incompleteTradeCount += 1
    if (hasScreenshot(trade)) summary.screenshotTradeCount += 1
    if (!isOpenTrade(trade)) summary.closedTradeCount += 1

    const hasRiskContext =
      trade.plannedRiskAmount !== null && trade.plannedRiskAmount !== undefined
      || trade.riskAmount !== null && trade.riskAmount !== undefined
      || trade.marginUsed !== null && trade.marginUsed !== undefined
      || trade.leverage !== null && trade.leverage !== undefined
      || trade.actualRiskPercent !== null && trade.actualRiskPercent !== undefined
      || trade.riskPercent !== null && trade.riskPercent !== undefined

    if (hasRiskContext) summary.riskTradeCount += 1
    summary.plannedRiskAmount += Math.abs(trade.plannedRiskAmount ?? 0)
    summary.stopRiskAmount += Math.abs(trade.riskAmount ?? 0)
    summary.marginUsed += Math.abs(trade.marginUsed ?? 0)
    if (trade.leverage !== null && trade.leverage !== undefined) {
      summary.maxLeverage = summary.maxLeverage === null ? trade.leverage : Math.max(summary.maxLeverage, trade.leverage)
    }
    if (trade.actualRiskPercent !== null && trade.actualRiskPercent !== undefined) {
      summary.accountRiskTradeCount += 1
      summary.maxActualRiskPercent = summary.maxActualRiskPercent === null
        ? trade.actualRiskPercent
        : Math.max(summary.maxActualRiskPercent, trade.actualRiskPercent)
    }
    return acc
  }, {})

  return Object.values(grouped)
    .map((summary) => ({
      ...summary,
      setups: Array.from(new Set(summary.setups)).slice(0, 3),
      markets: Array.from(new Set(summary.markets)).slice(0, 4),
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

export function buildMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingWeekday = (firstDay.getDay() + 6) % 7
  const cells: Array<{ day: number | null }> = []

  for (let i = 0; i < startingWeekday; i += 1) cells.push({ day: null })
  for (let day = 1; day <= daysInMonth; day += 1) cells.push({ day })
  while (cells.length % 7 !== 0) cells.push({ day: null })

  return cells
}

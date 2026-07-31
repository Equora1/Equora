import type { Trade } from '@/lib/types/trade'
import { resolveTradeOccurredAt } from '@/lib/utils/trade-time'
import { getTrustedTrades } from '@/lib/utils/trade-trust'

const SVG_WIDTH = 600
const SVG_HEIGHT = 240
const PADDING_X = 18
const PADDING_Y = 22

type ChartPoint = { x: number; y: number; value: number }

type ChartScale = {
  min: number
  max: number
  span: number
  usableWidth: number
  usableHeight: number
}

function sortTradesChronologically(trades: Trade[]) {
  return [...trades].sort((a, b) => new Date(resolveTradeOccurredAt(a)).getTime() - new Date(resolveTradeOccurredAt(b)).getTime())
}

function buildChartScale(values: number[]): ChartScale {
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const span = max - min || 1

  return {
    min,
    max,
    span,
    usableWidth: SVG_WIDTH - PADDING_X * 2,
    usableHeight: SVG_HEIGHT - PADDING_Y * 2,
  }
}

function projectValueToY(value: number, scale: ChartScale) {
  return SVG_HEIGHT - PADDING_Y - ((value - scale.min) / scale.span) * scale.usableHeight
}

function buildChartPoints(values: number[]): ChartPoint[] {
  if (!values.length) return []

  const scale = buildChartScale(values)

  return values.map((value, index) => ({
    value,
    x: PADDING_X + (index / Math.max(values.length - 1, 1)) * scale.usableWidth,
    y: projectValueToY(value, scale),
  }))
}

function buildPath(points: ChartPoint[]) {
  if (!points.length) return ''
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
}

export function buildEquitySeries(trades: Trade[]) {
  const sorted = sortTradesChronologically(getTrustedTrades(trades))
  let cumulative = 0
  const values = sorted.map((trade) => {
    cumulative += trade.netPnL ?? 0
    return cumulative
  })
  const points = buildChartPoints(values)

  return {
    points,
    linePath: buildPath(points),
    areaPath: points.length
      ? `${buildPath(points)} L ${points[points.length - 1]?.x.toFixed(2)} ${SVG_HEIGHT - PADDING_Y} L ${points[0]?.x.toFixed(2)} ${SVG_HEIGHT - PADDING_Y} Z`
      : '',
    latestValue: values.at(-1) ?? 0,
    totalPoints: points.length,
  }
}

export function buildPnLSeries(trades: Trade[]) {
  const sorted = sortTradesChronologically(getTrustedTrades(trades))
  const values = sorted.map((trade) => trade.netPnL ?? 0)
  const points = buildChartPoints(values)

  return {
    points,
    linePath: buildPath(points),
    latestValue: values.at(-1) ?? 0,
    totalPoints: points.length,
  }
}

export function buildDrawdownSeries(trades: Trade[]) {
  const sorted = sortTradesChronologically(getTrustedTrades(trades))
  let cumulative = 0
  let peak = 0

  const values = sorted.map((trade) => {
    cumulative += trade.netPnL ?? 0
    peak = Math.max(peak, cumulative)
    return cumulative - peak
  })

  const points = buildChartPoints(values)
  const scale = buildChartScale(values)
  const zeroLineY = projectValueToY(0, scale)

  return {
    points,
    linePath: buildPath(points),
    areaPath: points.length
      ? `${buildPath(points)} L ${points[points.length - 1]?.x.toFixed(2)} ${zeroLineY.toFixed(2)} L ${points[0]?.x.toFixed(2)} ${zeroLineY.toFixed(2)} Z`
      : '',
    latestValue: Math.abs(values.at(-1) ?? 0),
    deepestValue: Math.max(0, ...values.map((value) => Math.abs(value))),
    totalPoints: points.length,
    zeroLineY,
  }
}

export const chartFrame = { width: SVG_WIDTH, height: SVG_HEIGHT, baselineY: SVG_HEIGHT - PADDING_Y }

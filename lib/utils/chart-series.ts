import type { Trade } from '@/lib/types/trade'
import { getTrustedTrades } from '@/lib/utils/trade-trust'

const SVG_WIDTH = 600
const SVG_HEIGHT = 240
const PADDING_X = 18
const PADDING_Y = 22

type ChartPoint = { x: number; y: number; value: number }

function sortTradesChronologically(trades: Trade[]) {
  return [...trades].sort((a, b) => new Date(a.createdAt ?? a.date).getTime() - new Date(b.createdAt ?? b.date).getTime())
}

function buildChartPoints(values: number[]): ChartPoint[] {
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const usableWidth = SVG_WIDTH - PADDING_X * 2
  const usableHeight = SVG_HEIGHT - PADDING_Y * 2

  return values.map((value, index) => ({
    value,
    x: PADDING_X + (index / Math.max(values.length - 1, 1)) * usableWidth,
    y: SVG_HEIGHT - PADDING_Y - ((value - min) / span) * usableHeight,
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

export const chartFrame = { width: SVG_WIDTH, height: SVG_HEIGHT, baselineY: SVG_HEIGHT - PADDING_Y }

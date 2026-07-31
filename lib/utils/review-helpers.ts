import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { formatTradeDateLabel } from '@/lib/utils/date-format'
import { resolveTradeOccurredAt } from '@/lib/utils/trade-time'
import type { ReviewTone, ReviewTradeDrilldown } from '@/lib/utils/review-types'

export const PROCESS_TAG_KEYWORDS = ['geduldig', 'diszipliniert', 'regelkonform', 'a-setup', 'fokus', 'ruhig', 'sauber', 'plan', 'geduldig gewartet']
export const WEEKDAY_ORDER = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
export const ERROR_TAG_KEYWORDS = [
  'fomo',
  'revenge',
  'overtrade',
  'overtrading',
  'impulsiv',
  'regelbruch',
  'zu früh',
  'zu spaet',
  'zu spät',
  'forcing',
  'jagen',
  'unsauber',
  'müde',
  'muede',
  'tilt',
  'angst',
]

export function buildTradesHref(drilldown: ReviewTradeDrilldown) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(drilldown)) {
    if (value === undefined || value === null) continue

    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','))
      continue
    }

    if (typeof value === 'string' && value.trim().length === 0) continue
    params.set(key, String(value))
  }

  const query = params.toString()
  return query ? `/trades?${query}` : '/trades'
}

export function parseTagPair(pair: string) {
  return pair
    .split(' + ')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function sortTradesChronologically(trades: Trade[]) {
  return [...trades].sort((a, b) => new Date(resolveTradeOccurredAt(a)).getTime() - new Date(resolveTradeOccurredAt(b)).getTime())
}

export function isTradeInRange(trade: Trade, start: Date, end: Date) {
  const tradeTime = new Date(resolveTradeOccurredAt(trade)).getTime()
  return tradeTime >= start.getTime() && tradeTime <= end.getTime()
}

export function buildWindowLabel(start: Date, end: Date) {
  return `${formatTradeDateLabel(start)} bis ${formatTradeDateLabel(end)}`
}

export function clampNumber(value: number, fractionDigits = 1) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : '0.0'
}

export function shortenReviewText(value: string, maxLength = 120) {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 1).replace(/\s+$/g, '')}…`
}

export function formatDelta(delta: number, suffix = '') {
  if (!Number.isFinite(delta) || delta === 0) return `±0${suffix}`
  return `${delta > 0 ? '+' : ''}${clampNumber(delta)}${suffix}`
}

export function getWeekdayLabel(trade: Trade) {
  const value = new Date(resolveTradeOccurredAt(trade))
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(value)
}

export function normalizeTag(tag: string) {
  return tag.trim().toLowerCase()
}

export function hasKeywordMatch(tag: string, keywords: string[]) {
  const normalized = normalizeTag(tag)
  return keywords.some((keyword) => normalized.includes(keyword))
}

export function getToneFromPnL(netPnL: number): ReviewTone {
  if (netPnL > 0) return 'emerald'
  if (netPnL < 0) return 'red'
  return 'orange'
}

export function groupTradesByKey(trades: Trade[], getKey: (trade: Trade) => string) {
  return trades.reduce<Record<string, Trade[]>>((accumulator, trade) => {
    const key = getKey(trade) || '—'
    ;(accumulator[key] ||= []).push(trade)
    return accumulator
  }, {})
}

export function buildTradeTagMap(tradeTags: TradeTag[]) {
  return tradeTags.reduce<Record<string, string[]>>((accumulator, tag) => {
    ;(accumulator[tag.trade_id] ||= []).push(tag.tag)
    return accumulator
  }, {})
}

export function buildTagPairStats(trades: Trade[], tradeTags: TradeTag[]) {
  const tagMap = buildTradeTagMap(tradeTags)
  const grouped: Record<string, Trade[]> = {}

  for (const trade of trades) {
    const tags = Array.from(new Set(tagMap[trade.id] ?? [])).sort((left, right) => left.localeCompare(right, 'de'))
    if (tags.length < 2) continue

    for (let index = 0; index < tags.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < tags.length; nextIndex += 1) {
        const pairKey = `${tags[index]} + ${tags[nextIndex]}`
        ;(grouped[pairKey] ||= []).push(trade)
      }
    }
  }

  return Object.entries(grouped).map(([pair, pairTrades]) => ({
    pair,
    trades: pairTrades,
    metrics: getCoreMetrics(pairTrades),
  }))
}

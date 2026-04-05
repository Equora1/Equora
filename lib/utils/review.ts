import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import type { TagStat, TradeTag } from '@/lib/types/tag'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'
import { formatTradeDateLabel } from '@/lib/utils/date-format'
import { buildTagStats } from '@/lib/utils/tag-analytics'

type ReviewTone = 'emerald' | 'red' | 'orange'

type ReviewStat = {
  label: string
  value: string
  hint: string
  tone: ReviewTone
}

type ReviewSignal = {
  label: string
  value: string
  detail: string
  href?: string
}

type ReviewNoteMoment = {
  title: string
  meta: string
  body: string
}

type ReviewTagRadarItem = {
  label: string
  value: string
  detail: string
  tone: ReviewTone
  href?: string
}

type ReviewTagComparisonItem = {
  label: string
  value: string
  detail: string
  tone: ReviewTone
  href?: string
}

type ReviewTagCombinationItem = {
  label: string
  value: string
  detail: string
  tone: ReviewTone
  href?: string
}

type ReviewTagHeatmapCell = {
  weekday: string
  tag: string
  tradeCount: number
  netPnL: number
  intensity: number
  tone: ReviewTone
  href?: string
}

type ReviewTagHeatmap = {
  weekdays: string[]
  tags: string[]
  cells: ReviewTagHeatmapCell[]
}

type ReviewLayerSnapshot = {
  reviewedTrades: number
  totalTrades: number
  coverage: number
  summary: string
  headline: string
  highlights: ReviewTagRadarItem[]
  checklist: string[]
  latestLesson: string | null
}

export type ReviewPeriodPreset = '7d' | '14d' | '30d' | '90d'

export const REVIEW_PERIOD_OPTIONS: { key: ReviewPeriodPreset; label: string; hint: string; days: number }[] = [
  { key: '7d', label: '7 Tage', hint: 'Wochenfokus', days: 7 },
  { key: '14d', label: '14 Tage', hint: 'Zwei Wochen', days: 14 },
  { key: '30d', label: '30 Tage', hint: 'Monatsblick', days: 30 },
  { key: '90d', label: '90 Tage', hint: 'Quartalsmuster', days: 90 },
]


export function getReviewPeriodPresetLabel(snapshotLike: { periodPreset: ReviewPeriodPreset; periodPresetLabel?: string | null }) {
  const explicitLabel = snapshotLike.periodPresetLabel?.trim()
  if (explicitLabel) return explicitLabel
  return REVIEW_PERIOD_OPTIONS.find((option) => option.key === snapshotLike.periodPreset)?.label ?? 'Review'
}

export type ReviewSnapshot = {
  periodPreset: ReviewPeriodPreset
  periodPresetLabel: string
  periodLabel: string
  previousPeriodLabel: string
  periodStart: string
  periodEnd: string
  sourceLabel: string
  headline: string
  summary: string
  stats: ReviewStat[]
  topPerformers: ReviewSignal[]
  weakSpots: ReviewSignal[]
  patterns: string[]
  playbook: string[]
  noteMoments: ReviewNoteMoment[]
  tagRadar: ReviewTagRadarItem[]
  errorClusters: ReviewSignal[]
  tagDrift: ReviewTagComparisonItem[]
  tagCombinations: ReviewTagCombinationItem[]
  tagHeatmap: ReviewTagHeatmap
  reviewLayer: ReviewLayerSnapshot
  sessionDraft: {
    tradeIds: string[]
    tradeCount: number
    visibleTradeCount: number
    netPnL: number
    averageR: number
    winRate: number
    winners: number
    losers: number
    breakeven: number
    topTags: string[]
    bestTradeId: string | null
    worstTradeId: string | null
  }
}

export type ReviewSnapshotCollection = Record<ReviewPeriodPreset, ReviewSnapshot>

type ReviewTradeDrilldown = {
  search?: string
  market?: string
  setup?: string
  session?: string
  concept?: string
  quality?: string
  emotion?: string
  tag?: string
  tags?: string[]
  weekday?: string
  tagging?: 'Getaggt' | 'Ungetaggt'
  outcome?: 'Gewinner' | 'Verlierer' | 'Breakeven'
  direction?: 'Long' | 'Short' | 'Neutral'
  reviewFocus?: string
}

function buildTradesHref(drilldown: ReviewTradeDrilldown) {
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

function parseTagPair(pair: string) {
  return pair
    .split(' + ')
    .map((part) => part.trim())
    .filter(Boolean)
}

type TagComparison = {
  tag: string
  current: TagStat | null
  previous: TagStat | null
  pnlDelta: number
  winRateDelta: number
  tradeDelta: number
}

const PROCESS_TAG_KEYWORDS = ['geduldig', 'diszipliniert', 'regelkonform', 'a-setup', 'fokus', 'ruhig', 'sauber', 'plan', 'geduldig gewartet']
const WEEKDAY_ORDER = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

const ERROR_TAG_KEYWORDS = [
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

function sortTradesChronologically(trades: Trade[]) {
  return [...trades].sort((a, b) => new Date(a.createdAt ?? a.date).getTime() - new Date(b.createdAt ?? b.date).getTime())
}

function isTradeInRange(trade: Trade, start: Date, end: Date) {
  const tradeTime = new Date(trade.createdAt ?? trade.date).getTime()
  return tradeTime >= start.getTime() && tradeTime <= end.getTime()
}

function buildWindowLabel(start: Date, end: Date) {
  return `${formatTradeDateLabel(start)} bis ${formatTradeDateLabel(end)}`
}

function clampNumber(value: number, fractionDigits = 1) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : '0.0'
}

function shortenReviewText(value: string, maxLength = 120) {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 1).replace(/\s+$/g, '')}…`
}

function formatDelta(delta: number, suffix = '') {
  if (!Number.isFinite(delta) || delta === 0) return `±0${suffix}`
  return `${delta > 0 ? '+' : ''}${clampNumber(delta)}${suffix}`
}

function getWeekdayLabel(trade: Trade) {
  const value = new Date(trade.createdAt ?? trade.date)
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(value)
}

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase()
}

function hasKeywordMatch(tag: string, keywords: string[]) {
  const normalized = normalizeTag(tag)
  return keywords.some((keyword) => normalized.includes(keyword))
}

function getToneFromPnL(netPnL: number): ReviewTone {
  if (netPnL > 0) return 'emerald'
  if (netPnL < 0) return 'red'
  return 'orange'
}

function groupTradesByKey(trades: Trade[], getKey: (trade: Trade) => string) {
  return trades.reduce<Record<string, Trade[]>>((accumulator, trade) => {
    const key = getKey(trade) || '—'
    ;(accumulator[key] ||= []).push(trade)
    return accumulator
  }, {})
}

function buildTradeTagMap(tradeTags: TradeTag[]) {
  return tradeTags.reduce<Record<string, string[]>>((accumulator, tag) => {
    ;(accumulator[tag.trade_id] ||= []).push(tag.tag)
    return accumulator
  }, {})
}

function buildTagPairStats(trades: Trade[], tradeTags: TradeTag[]) {
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

function getTagCoverage(trades: Trade[], tradeTags: TradeTag[]) {
  if (!trades.length) return 0
  const taggedTradeIds = new Set(tradeTags.map((tag) => tag.trade_id))
  return (trades.filter((trade) => taggedTradeIds.has(trade.id)).length / trades.length) * 100
}

function getProcessTagShare(trades: Trade[], tradeTags: TradeTag[]) {
  if (!trades.length) return 0
  const tagMap = buildTradeTagMap(tradeTags)
  const processTaggedTrades = trades.filter((trade) => (tagMap[trade.id] ?? []).some((tag) => hasKeywordMatch(tag, PROCESS_TAG_KEYWORDS)))
  return (processTaggedTrades.length / trades.length) * 100
}

function buildTagComparisons(currentTags: TradeTag[], previousTags: TradeTag[], tradesCurrent: Trade[], tradesPrevious: Trade[]) {
  const currentStats = buildTagStats(tradesCurrent, currentTags)
  const previousStats = buildTagStats(tradesPrevious, previousTags)
  const currentMap = new Map(currentStats.map((item) => [normalizeTag(item.tag), item]))
  const previousMap = new Map(previousStats.map((item) => [normalizeTag(item.tag), item]))
  const allTags = new Set([...currentMap.keys(), ...previousMap.keys()])

  return Array.from(allTags).map<TagComparison>((key) => {
    const current = currentMap.get(key) ?? null
    const previous = previousMap.get(key) ?? null

    return {
      tag: current?.tag ?? previous?.tag ?? key,
      current,
      previous,
      pnlDelta: (current?.netPnL ?? 0) - (previous?.netPnL ?? 0),
      winRateDelta: (current?.winRate ?? 0) - (previous?.winRate ?? 0),
      tradeDelta: (current?.totalTrades ?? 0) - (previous?.totalTrades ?? 0),
    }
  })
}

function getBestAndWorstBucket(trades: Trade[], getKey: (trade: Trade) => string) {
  const grouped = Object.entries(groupTradesByKey(trades, getKey)).map(([key, bucketTrades]) => ({
    key,
    trades: bucketTrades,
    metrics: getCoreMetrics(bucketTrades),
  }))

  if (!grouped.length) return { best: null, worst: null }

  const ranked = grouped.sort((a, b) => {
    if (b.metrics.netPnL === a.metrics.netPnL) return b.metrics.winRate - a.metrics.winRate
    return b.metrics.netPnL - a.metrics.netPnL
  })

  return {
    best: ranked[0] ?? null,
    worst: [...ranked].reverse()[0] ?? null,
  }
}

function getPeriodWindows(trades: Trade[], preset: ReviewPeriodPreset) {
  const chronological = sortTradesChronologically(trades)
  const latestTrade = chronological[chronological.length - 1]
  const latestTradeDate = latestTrade ? new Date(latestTrade.createdAt ?? latestTrade.date) : new Date()
  const currentEnd = new Date(latestTradeDate)
  currentEnd.setHours(23, 59, 59, 999)

  const presetConfig = REVIEW_PERIOD_OPTIONS.find((item) => item.key === preset) ?? REVIEW_PERIOD_OPTIONS[0]
  const currentStart = new Date(currentEnd)
  currentStart.setDate(currentEnd.getDate() - (presetConfig.days - 1))
  currentStart.setHours(0, 0, 0, 0)

  const previousEnd = new Date(currentStart)
  previousEnd.setMilliseconds(-1)

  const previousStart = new Date(currentStart)
  previousStart.setDate(currentStart.getDate() - presetConfig.days)

  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    presetConfig,
  }
}

function buildSummary(statsCurrent: ReturnType<typeof getCoreMetrics>, statsPrevious: ReturnType<typeof getCoreMetrics>) {
  const pnlDelta = statsCurrent.netPnL - statsPrevious.netPnL
  const winRateDelta = statsCurrent.winRate - statsPrevious.winRate
  const pfDelta =
    Number.isFinite(statsCurrent.profitFactor) && Number.isFinite(statsPrevious.profitFactor)
      ? statsCurrent.profitFactor - statsPrevious.profitFactor
      : 0

  return [
    {
      label: 'Net P&L',
      value: formatCurrency(statsCurrent.netPnL),
      hint: `${formatDelta(pnlDelta, ' €')} vs. Vorperiode`,
      tone: statsCurrent.netPnL >= 0 ? ('emerald' as const) : ('red' as const),
    },
    {
      label: 'Win Rate',
      value: `${clampNumber(statsCurrent.winRate)}%`,
      hint: `${formatDelta(winRateDelta, ' pp')} bei ${statsCurrent.totalTrades} Trades`,
      tone: statsCurrent.winRate >= 50 ? ('emerald' as const) : ('orange' as const),
    },
    {
      label: 'Profit Factor',
      value: statsCurrent.profitFactor === Infinity ? '∞' : clampNumber(statsCurrent.profitFactor, 2),
      hint: `${formatDelta(pfDelta)} vs. Vorperiode`,
      tone: statsCurrent.profitFactor >= 1.5 ? ('emerald' as const) : statsCurrent.profitFactor >= 1 ? ('orange' as const) : ('red' as const),
    },
    {
      label: 'Expectancy',
      value: formatCurrency(statsCurrent.expectancy),
      hint: `${formatRMultiple(statsCurrent.expectancyR)} je Trade`,
      tone: statsCurrent.expectancy >= 0 ? ('emerald' as const) : ('red' as const),
    },
    {
      label: 'Max Drawdown',
      value: formatCurrency(-statsCurrent.maxDrawdown),
      hint: `${statsCurrent.longestLossStreak}er Verlustserie im Zeitraum`,
      tone: statsCurrent.maxDrawdown <= Math.max(Math.abs(statsCurrent.netPnL) * 0.35, 1) ? ('orange' as const) : ('red' as const),
    },
  ]
}

function buildHeadline(
  tradesCurrent: Trade[],
  statsCurrent: ReturnType<typeof getCoreMetrics>,
  tradeDrift: ReviewTagComparisonItem[],
  errorClusters: ReviewSignal[]
) {
  if (!tradesCurrent.length) {
    return {
      headline: 'Noch keine Trades im aktuellen Review-Zeitraum',
      summary: 'Sobald Trades einlaufen, verdichtet Equora die Woche zu Mustern, Warnsignalen und nächsten Aktionen.',
    }
  }

  const slippingTag = tradeDrift.find((item) => item.label === 'Kippender Tag')
  const mainErrorCluster = errorClusters[0]

  if (statsCurrent.netPnL > 0 && statsCurrent.profitFactor >= 1.5) {
    return {
      headline: 'Die Woche lief sauber über Prozess statt Aktionismus',
      summary: `Du hast ${statsCurrent.totalTrades} Trades mit ${clampNumber(statsCurrent.winRate)}% Trefferquote und ${formatCurrency(statsCurrent.netPnL)} abgeschlossen.${slippingTag ? ` Beobachte trotzdem ${slippingTag.value}, damit der grüne Lauf nicht kippt.` : ''}`,
    }
  }

  if (statsCurrent.netPnL < 0 || statsCurrent.profitFactor < 1) {
    return {
      headline: 'Die Woche zeigt Reibung, aber sie ist lesbar',
      summary: `Der Datensatz markiert klar, wo Prozess und Selektivität nachgeschärft werden müssen. Aktuell stehen ${formatCurrency(statsCurrent.netPnL)} und ein Profit Factor von ${statsCurrent.profitFactor === Infinity ? '∞' : clampNumber(statsCurrent.profitFactor, 2)} im Raum.${mainErrorCluster ? ` Größter Hebel aktuell: ${mainErrorCluster.value}.` : ''}`,
    }
  }

  return {
    headline: 'Die Woche ist solide, aber noch nicht maximal scharf',
    summary: `Es gibt eine brauchbare Basis mit ${statsCurrent.totalTrades} Trades. Jetzt geht es darum, die stärksten Cluster konsequenter zu handeln und das Rauschen zu entfernen.${tradeDrift[0] ? ` Auffällig im Vergleich: ${tradeDrift[0].value}.` : ''}`,
  }
}

function buildTopPerformers(tradesCurrent: Trade[], tradeTags: TradeTag[]): ReviewSignal[] {
  const bestSetup = getBestAndWorstBucket(tradesCurrent, (trade) => trade.setup).best
  const bestMarket = getBestAndWorstBucket(tradesCurrent, (trade) => trade.market).best
  const bestSession = getBestAndWorstBucket(tradesCurrent, (trade) => trade.session).best
  const positiveTags = buildTagStats(tradesCurrent, tradeTags)
    .filter((tag) => tag.totalTrades > 0)
    .sort((a, b) => b.netPnL - a.netPnL)

  const items = [
    bestSetup
      ? {
          label: 'Bestes Setup',
          value: bestSetup.key,
          detail: `${formatCurrency(bestSetup.metrics.netPnL)} · ${clampNumber(bestSetup.metrics.winRate)}% Win Rate · ${formatRMultiple(bestSetup.metrics.averageR)}`,
          href: buildTradesHref({ setup: bestSetup.key, reviewFocus: `Review Drilldown · Bestes Setup: ${bestSetup.key}` }),
        }
      : null,
    bestMarket
      ? {
          label: 'Stärkster Markt',
          value: bestMarket.key,
          detail: `${formatCurrency(bestMarket.metrics.netPnL)} bei ${bestMarket.metrics.totalTrades} Trades.`,
          href: buildTradesHref({ market: bestMarket.key, reviewFocus: `Review Drilldown · Stärkster Markt: ${bestMarket.key}` }),
        }
      : null,
    bestSession
      ? {
          label: 'Sauberste Session',
          value: bestSession.key,
          detail: `${bestSession.metrics.profitFactor === Infinity ? '∞' : clampNumber(bestSession.metrics.profitFactor, 2)} PF und ${formatCurrency(bestSession.metrics.netPnL)} im Zeitraum.`,
          href: buildTradesHref({ session: bestSession.key, reviewFocus: `Review Drilldown · Sauberste Session: ${bestSession.key}` }),
        }
      : null,
    positiveTags[0]
      ? {
          label: 'Bester Tag-Cluster',
          value: positiveTags[0].tag,
          detail: `${formatCurrency(positiveTags[0].netPnL)} · ${clampNumber(positiveTags[0].winRate)}% Win Rate in ${positiveTags[0].totalTrades} Trades.`,
          href: buildTradesHref({ tag: positiveTags[0].tag, reviewFocus: `Review Drilldown · Bester Tag-Cluster: ${positiveTags[0].tag}` }),
        }
      : null,
  ].filter(Boolean) as ReviewSignal[]

  return items.length
    ? items
    : [{ label: 'Noch kein Lead-Cluster', value: 'Warte auf Daten', detail: 'Sobald Trades im Zeitraum liegen, markiert Equora hier die stärksten Muster.' }]
}

function buildWeakSpots(tradesCurrent: Trade[], tradeTags: TradeTag[]): ReviewSignal[] {
  const worstSetup = getBestAndWorstBucket(tradesCurrent, (trade) => trade.setup).worst
  const worstWeekday = getBestAndWorstBucket(tradesCurrent, getWeekdayLabel).worst
  const negativeTags = buildTagStats(tradesCurrent, tradeTags)
    .filter((tag) => tag.totalTrades > 0)
    .sort((a, b) => a.netPnL - b.netPnL)
  const metrics = getCoreMetrics(tradesCurrent)
  const tagCoverage = getTagCoverage(tradesCurrent, tradeTags)

  const items = [
    worstSetup
      ? {
          label: 'Schwächstes Setup',
          value: worstSetup.key,
          detail: `${formatCurrency(worstSetup.metrics.netPnL)} · ${clampNumber(worstSetup.metrics.winRate)}% Win Rate.`,
          href: buildTradesHref({ setup: worstSetup.key, reviewFocus: `Review Drilldown · Schwächstes Setup: ${worstSetup.key}` }),
        }
      : null,
    worstWeekday
      ? {
          label: 'Härtester Handelstag',
          value: worstWeekday.key,
          detail: `${formatCurrency(worstWeekday.metrics.netPnL)} an diesem Wochentag.`,
          href: buildTradesHref({ weekday: worstWeekday.key, reviewFocus: `Review Drilldown · Härtester Handelstag: ${worstWeekday.key}` }),
        }
      : null,
    negativeTags[0]
      ? {
          label: 'Negativer Tag-Trigger',
          value: negativeTags[0].tag,
          detail: `${formatCurrency(negativeTags[0].netPnL)} über ${negativeTags[0].totalTrades} markierte Trades.`,
          href: buildTradesHref({ tag: negativeTags[0].tag, outcome: 'Verlierer', reviewFocus: `Review Drilldown · Negativer Tag-Trigger: ${negativeTags[0].tag}` }),
        }
      : null,
    metrics.longestLossStreak > 1
      ? {
          label: 'Verlustserie',
          value: `${metrics.longestLossStreak} in Folge`,
          detail: 'Hier lohnt sich ein klarer Cooldown- oder Größen-Trigger im Regelwerk.',
        }
      : null,
    tradesCurrent.length > 0 && tagCoverage < 70
      ? {
          label: 'Tag-Abdeckung',
          value: `${clampNumber(tagCoverage)}%`,
          detail: 'Zu viele Trades laufen noch ohne Kontext-Tags durchs Journal. Das schwächt Review und Musterlogik.',
        }
      : null,
  ].filter(Boolean) as ReviewSignal[]

  return items.length
    ? items
    : [{ label: 'Noch kein Warnsignal', value: 'Datenbasis zu klein', detail: 'Mit mehr Trades erkennt Equora hier die Stellen, an denen Prozess oder Timing kippen.' }]
}

function buildPatterns(tradesCurrent: Trade[], tradeTags: TradeTag[], tradesPrevious: Trade[], previousTags: TradeTag[]): string[] {
  const patterns: string[] = []
  const aSetups = tradesCurrent.filter((trade) => trade.quality === 'A-Setup')
  const nonASetups = tradesCurrent.filter((trade) => trade.quality !== 'A-Setup')
  const aMetrics = getCoreMetrics(aSetups)
  const nonAMetrics = getCoreMetrics(nonASetups)
  const tagStats = buildTagStats(tradesCurrent, tradeTags)
  const tagCoverage = getTagCoverage(tradesCurrent, tradeTags)
  const tagPairs = buildTagPairStats(tradesCurrent, tradeTags)
    .filter((pair) => pair.metrics.totalTrades > 0)
    .sort((left, right) => right.metrics.netPnL - left.metrics.netPnL)
  const comparisons = buildTagComparisons(tradeTags, previousTags, tradesCurrent, tradesPrevious)
  const slippingTag = [...comparisons]
    .filter((item) => item.current)
    .sort((left, right) => left.pnlDelta - right.pnlDelta)[0]

  if (aSetups.length && nonASetups.length) {
    patterns.push(`A-Setups lieferten ${formatCurrency(aMetrics.netPnL)} bei ${clampNumber(aMetrics.winRate)}% Win Rate, der Rest ${formatCurrency(nonAMetrics.netPnL)}.`)
  }

  const patienceTag = tagStats.find((tag) => hasKeywordMatch(tag.tag, PROCESS_TAG_KEYWORDS))
  if (patienceTag) {
    patterns.push(`Tag „${patienceTag.tag}“ zeigt ${formatCurrency(patienceTag.netPnL)} und wirkt wie ein brauchbarer Prozess-Anker.`)
  }

  const dangerTag = [...tagStats].sort((a, b) => a.netPnL - b.netPnL)[0]
  if (dangerTag && dangerTag.netPnL < 0) {
    patterns.push(`Tag „${dangerTag.tag}“ kostet aktuell ${formatCurrency(dangerTag.netPnL)}. Das ist kein Etikett mehr, sondern ein Warnschild.`)
  }

  const bestWeekday = getBestAndWorstBucket(tradesCurrent, getWeekdayLabel).best
  if (bestWeekday) {
    patterns.push(`${bestWeekday.key} war der stärkste Wochentag mit ${formatCurrency(bestWeekday.metrics.netPnL)}.`)
  }

  if (tagPairs[0]) {
    patterns.push(`Die Tag-Kombi „${tagPairs[0].pair}“ markiert aktuell ${formatCurrency(tagPairs[0].metrics.netPnL)} in ${tagPairs[0].metrics.totalTrades} Trades.`)
  }

  if (slippingTag?.current && slippingTag.pnlDelta < 0) {
    patterns.push(`Gegenüber der Vorperiode ist „${slippingTag.tag}“ um ${formatCurrency(slippingTag.pnlDelta)} abgekippt. Das ist Drift, kein Zufall.`)
  }

  if (tradesCurrent.length > 0 && tagCoverage < 70) {
    patterns.push(`Nur ${clampNumber(tagCoverage)}% der Trades tragen Tags. Mehr Kontext-Tags würden Review und Compare deutlich schärfer machen.`)
  }

  return patterns.length
    ? patterns
    : ['Noch zu wenig Daten für belastbare Muster. Mit mehr Trades werden Setups, Tage und Tags deutlich aussagekräftiger.']
}

function buildPlaybook(tradesCurrent: Trade[], tradeTags: TradeTag[], tradesPrevious: Trade[], previousTags: TradeTag[]): string[] {
  const actions: string[] = []
  const metrics = getCoreMetrics(tradesCurrent)
  const worstTag = buildTagStats(tradesCurrent, tradeTags).sort((a, b) => a.netPnL - b.netPnL)[0]
  const bestSetup = getBestAndWorstBucket(tradesCurrent, (trade) => trade.setup).best
  const tagCoverage = getTagCoverage(tradesCurrent, tradeTags)
  const comparisons = buildTagComparisons(tradeTags, previousTags, tradesCurrent, tradesPrevious)
  const slippingTag = [...comparisons].sort((left, right) => left.pnlDelta - right.pnlDelta)[0]
  const losingPairs = buildTagPairStats(tradesCurrent.filter((trade) => (trade.netPnL ?? 0) < 0), tradeTags).sort((left, right) => {
    if (right.trades.length === left.trades.length) return left.metrics.netPnL - right.metrics.netPnL
    return right.trades.length - left.trades.length
  })

  if (bestSetup) {
    actions.push(`Mehr Gewicht auf ${bestSetup.key}: aktuell der sauberste Cluster mit ${formatCurrency(bestSetup.metrics.netPnL)}.`)
  }

  if (worstTag && worstTag.netPnL < 0) {
    actions.push(`Vor jedem Entry Trigger gegen „${worstTag.tag}“ einbauen. Erst Regelcheck, dann Order.`)
  }

  if (slippingTag?.current && slippingTag.pnlDelta < 0) {
    actions.push(`„${slippingTag.tag}“ ist gegenüber der Vorperiode um ${formatCurrency(slippingTag.pnlDelta)} abgerutscht. Dieses Tag vor dem Entry bewusst gegenprüfen.`)
  }

  if (losingPairs[0] && losingPairs[0].trades.length >= 2) {
    actions.push(`Die Verlust-Kombi „${losingPairs[0].pair}“ ist ein klarer Alarm. Für diese Paarung einen No-Trade- oder Size-Down-Trigger definieren.`)
  }

  if (metrics.longestLossStreak >= 2) {
    actions.push(`Nach ${metrics.longestLossStreak} Verlusten in Folge automatisch Cooldown oder halbe Positionsgröße.`)
  }

  if (metrics.averageR < 0.5) {
    actions.push('Gewinner aktiver managen: Teilgewinnstruktur prüfen und nicht zu früh Luft abdrehen.')
  }

  if (tradesCurrent.length > 0 && tagCoverage < 80) {
    actions.push('Jeden Trade mit mindestens einem Prozess-Tag und einem Fehler- oder Kontext-Tag markieren. Sonst bleibt die Review-Logik halb blind.')
  }

  return actions.length
    ? actions.slice(0, 4)
    : ['Die nächste Woche kann auf demselben Prozess laufen. Fokus: Selektivität halten und nur A-Setups aggressiver spielen.']
}

function buildTagRadar(tradesCurrent: Trade[], tradeTags: TradeTag[]): ReviewTagRadarItem[] {
  const stats = buildTagStats(tradesCurrent, tradeTags).filter((tag) => tag.totalTrades > 0)
  if (!stats.length) {
    return [
      {
        label: 'Tag-Radar',
        value: 'Noch keine Tag-Daten',
        detail: 'Sobald Trades im Zeitraum sauber getaggt sind, markiert Equora hier Prozess-Anker, Wiederholungsfehler und starke Kombinationen.',
        tone: 'orange',
      },
    ]
  }

  const tagPairs = buildTagPairStats(tradesCurrent, tradeTags)
    .filter((pair) => pair.metrics.totalTrades > 0)
    .sort((left, right) => right.metrics.netPnL - left.metrics.netPnL)
  const losingTradeIds = new Set(tradesCurrent.filter((trade) => (trade.netPnL ?? 0) < 0).map((trade) => trade.id))
  const repeatLossMap = tradeTags
    .filter((tag) => losingTradeIds.has(tag.trade_id))
    .reduce<Record<string, number>>((accumulator, tag) => {
      accumulator[tag.tag] = (accumulator[tag.tag] ?? 0) + 1
      return accumulator
    }, {})
  const repeatLossEntry = Object.entries(repeatLossMap).sort((left, right) => right[1] - left[1])[0]
  const processAnchor = stats.filter((tag) => hasKeywordMatch(tag.tag, PROCESS_TAG_KEYWORDS)).sort((left, right) => right.netPnL - left.netPnL)[0]
  const bestTag = [...stats].sort((left, right) => right.netPnL - left.netPnL)[0]
  const worstTag = [...stats].sort((left, right) => left.netPnL - right.netPnL)[0]

  return [
    bestTag
      ? {
          label: 'Stärkster Tag',
          value: bestTag.tag,
          detail: `${formatCurrency(bestTag.netPnL)} · ${clampNumber(bestTag.winRate)}% Win Rate in ${bestTag.totalTrades} Trades.`,
          tone: 'emerald',
          href: buildTradesHref({ tag: bestTag.tag, reviewFocus: `Review Drilldown · Stärkster Tag: ${bestTag.tag}` }),
        }
      : null,
    processAnchor
      ? {
          label: 'Prozess-Anker',
          value: processAnchor.tag,
          detail: `${formatCurrency(processAnchor.netPnL)} und PF ${processAnchor.profitFactor === Infinity ? '∞' : clampNumber(processAnchor.profitFactor, 2)}. Diesen Zustand willst du replizieren.`,
          tone: 'emerald',
          href: buildTradesHref({ tag: processAnchor.tag, reviewFocus: `Review Drilldown · Prozess-Anker: ${processAnchor.tag}` }),
        }
      : null,
    worstTag && worstTag.netPnL < 0
      ? {
          label: 'Warn-Tag',
          value: worstTag.tag,
          detail: `${formatCurrency(worstTag.netPnL)} über ${worstTag.totalTrades} markierte Trades.`,
          tone: 'red',
          href: buildTradesHref({ tag: worstTag.tag, outcome: 'Verlierer', reviewFocus: `Review Drilldown · Warn-Tag: ${worstTag.tag}` }),
        }
      : null,
    repeatLossEntry
      ? {
          label: 'Wiederholer bei Verlusten',
          value: repeatLossEntry[0],
          detail: `Tauchte ${repeatLossEntry[1]}× in Verlusttrades auf und verdient einen Vor-Entry-Check.`,
          tone: repeatLossEntry[1] >= 2 ? 'red' : 'orange',
          href: buildTradesHref({ tag: repeatLossEntry[0], outcome: 'Verlierer', reviewFocus: `Review Drilldown · Wiederholer bei Verlusten: ${repeatLossEntry[0]}` }),
        }
      : null,
    tagPairs[0]
      ? {
          label: 'Stärkste Tag-Kombi',
          value: tagPairs[0].pair,
          detail: `${formatCurrency(tagPairs[0].metrics.netPnL)} in ${tagPairs[0].metrics.totalTrades} Trades.`,
          tone: tagPairs[0].metrics.netPnL >= 0 ? 'emerald' : 'orange',
          href: buildTradesHref({ tags: parseTagPair(tagPairs[0].pair), reviewFocus: `Review Drilldown · Stärkste Tag-Kombi: ${tagPairs[0].pair}` }),
        }
      : null,
  ].filter(Boolean).slice(0, 4) as ReviewTagRadarItem[]
}

function buildErrorClusters(tradesCurrent: Trade[], tradeTags: TradeTag[]): ReviewSignal[] {
  const losingTrades = tradesCurrent.filter((trade) => (trade.netPnL ?? 0) < 0)
  if (!losingTrades.length) {
    return [{ label: 'Fehlercluster', value: 'Noch kein Verlustmuster', detail: 'Wenn Verlusttrades auftauchen, verdichtet Equora hier die wiederkehrenden Fehler-Tags und Kombinationen.' }]
  }

  const lossTags = buildTagStats(losingTrades, tradeTags)
  const tagMap = buildTradeTagMap(tradeTags)
  const worstLossTag = [...lossTags].sort((left, right) => {
    if (right.totalTrades === left.totalTrades) return left.netPnL - right.netPnL
    return right.totalTrades - left.totalTrades
  })[0]
  const errorTaggedTrades = losingTrades.filter((trade) => (tagMap[trade.id] ?? []).some((tag) => hasKeywordMatch(tag, ERROR_TAG_KEYWORDS)))
  const errorMetrics = getCoreMetrics(errorTaggedTrades)
  const lossPairs = buildTagPairStats(losingTrades, tradeTags).sort((left, right) => {
    if (right.trades.length === left.trades.length) return left.metrics.netPnL - right.metrics.netPnL
    return right.trades.length - left.trades.length
  })
  const untaggedLosses = losingTrades.filter((trade) => !(tagMap[trade.id] ?? []).length).length

  const items = [
    worstLossTag
      ? {
          label: 'Häufigster Fehler-Tag',
          value: worstLossTag.tag,
          detail: `${worstLossTag.totalTrades} Verlusttrades · ${formatCurrency(worstLossTag.netPnL)} im roten Bereich.`,
          href: buildTradesHref({ tag: worstLossTag.tag, outcome: 'Verlierer', reviewFocus: `Review Drilldown · Häufigster Fehler-Tag: ${worstLossTag.tag}` }),
        }
      : null,
    errorTaggedTrades.length
      ? {
          label: 'Fehler-Familie',
          value: 'Prozessbruch-Tags',
          detail: `${formatCurrency(errorMetrics.netPnL)} über ${errorTaggedTrades.length} Verlusttrades mit FOMO-, Revenge- oder Regelbruch-Mustern.`,
        }
      : null,
    lossPairs[0]
      ? {
          label: 'Härteste Verlust-Kombi',
          value: lossPairs[0].pair,
          detail: `${lossPairs[0].trades.length} Trades · ${formatCurrency(lossPairs[0].metrics.netPnL)} zusammen.`,
          href: buildTradesHref({ tags: parseTagPair(lossPairs[0].pair), outcome: 'Verlierer', reviewFocus: `Review Drilldown · Härteste Verlust-Kombi: ${lossPairs[0].pair}` }),
        }
      : null,
    untaggedLosses > 0
      ? {
          label: 'Blinde Verluste',
          value: `${untaggedLosses} ungetaggt`,
          detail: 'Ein Teil der Verlusttrades trägt noch keine Fehler- oder Kontext-Tags. Damit versickert Review-Wissen im Dunkeln.',
          href: buildTradesHref({ outcome: 'Verlierer', tagging: 'Ungetaggt', reviewFocus: 'Review Drilldown · Blinde Verluste' }),
        }
      : null,
  ].filter(Boolean) as ReviewSignal[]

  return items.length ? items : [{ label: 'Fehlercluster', value: 'Noch unscharf', detail: 'Mit mehr Verlusttrades und sauberem Tagging wird hier sichtbar, welche Muster wieder zuschlagen.' }]
}

function buildTagCombinations(tradesCurrent: Trade[], tradeTags: TradeTag[]): ReviewTagCombinationItem[] {
  const pairs = buildTagPairStats(tradesCurrent, tradeTags).filter((pair) => pair.metrics.totalTrades > 0)

  if (!pairs.length) {
    return [
      {
        label: 'Tag-Kombis',
        value: 'Noch zu wenig Daten',
        detail: 'Sobald Trades mit mehreren Tags im Review-Zeitraum liegen, verdichtet Equora hier die stärksten und gefährlichsten Kombinationen.',
        tone: 'orange',
      },
    ]
  }

  const bestPair = [...pairs].sort((left, right) => {
    if (right.metrics.netPnL === left.metrics.netPnL) return right.metrics.winRate - left.metrics.winRate
    return right.metrics.netPnL - left.metrics.netPnL
  })[0]
  const worstPair = [...pairs].sort((left, right) => {
    if (left.metrics.netPnL === right.metrics.netPnL) return left.metrics.winRate - right.metrics.winRate
    return left.metrics.netPnL - right.metrics.netPnL
  })[0]
  const mostRepeatedPair = [...pairs].sort((left, right) => {
    if (right.metrics.totalTrades === left.metrics.totalTrades) return right.metrics.netPnL - left.metrics.netPnL
    return right.metrics.totalTrades - left.metrics.totalTrades
  })[0]
  const unstablePair = [...pairs]
    .filter((pair) => pair.metrics.totalTrades >= 2)
    .sort((left, right) => {
      const leftScore = left.metrics.winRate - Math.abs(left.metrics.averageR) * 10
      const rightScore = right.metrics.winRate - Math.abs(right.metrics.averageR) * 10
      return leftScore - rightScore
    })[0]

  return [
    bestPair
      ? {
          label: 'Beste Kombi',
          value: bestPair.pair,
          detail: `${formatCurrency(bestPair.metrics.netPnL)} · ${clampNumber(bestPair.metrics.winRate)}% Win Rate in ${bestPair.metrics.totalTrades} Trades.`,
          tone: getToneFromPnL(bestPair.metrics.netPnL),
          href: buildTradesHref({ tags: parseTagPair(bestPair.pair), reviewFocus: `Review Drilldown · Beste Kombi: ${bestPair.pair}` }),
        }
      : null,
    worstPair && worstPair.metrics.netPnL < 0
      ? {
          label: 'Warn-Kombi',
          value: worstPair.pair,
          detail: `${formatCurrency(worstPair.metrics.netPnL)} bei ${worstPair.metrics.totalTrades} Trades. Diese Paarung kippt aktuell zuverlässig rot.`,
          tone: 'red',
          href: buildTradesHref({ tags: parseTagPair(worstPair.pair), outcome: 'Verlierer', reviewFocus: `Review Drilldown · Warn-Kombi: ${worstPair.pair}` }),
        }
      : null,
    mostRepeatedPair
      ? {
          label: 'Wiederkehrende Kombi',
          value: mostRepeatedPair.pair,
          detail: `${mostRepeatedPair.metrics.totalTrades} Trades · PF ${mostRepeatedPair.metrics.profitFactor === Infinity ? '∞' : clampNumber(mostRepeatedPair.metrics.profitFactor, 2)}.`,
          tone: getToneFromPnL(mostRepeatedPair.metrics.netPnL),
          href: buildTradesHref({ tags: parseTagPair(mostRepeatedPair.pair), reviewFocus: `Review Drilldown · Wiederkehrende Kombi: ${mostRepeatedPair.pair}` }),
        }
      : null,
    unstablePair && unstablePair.metrics.totalTrades >= 2
      ? {
          label: 'Volatile Kombi',
          value: unstablePair.pair,
          detail: `${clampNumber(unstablePair.metrics.winRate)}% Win Rate bei ${formatRMultiple(unstablePair.metrics.averageR)} im Schnitt. Gute Kandidatin für einen Vor-Entry-Check.`,
          tone: unstablePair.metrics.netPnL < 0 ? 'orange' : getToneFromPnL(unstablePair.metrics.netPnL),
          href: buildTradesHref({ tags: parseTagPair(unstablePair.pair), reviewFocus: `Review Drilldown · Volatile Kombi: ${unstablePair.pair}` }),
        }
      : null,
  ].filter(Boolean).slice(0, 4) as ReviewTagCombinationItem[]
}

function buildTagHeatmap(tradesCurrent: Trade[], tradeTags: TradeTag[]): ReviewTagHeatmap {
  const topTags = buildTagStats(tradesCurrent, tradeTags)
    .sort((left, right) => {
      if (right.totalTrades === left.totalTrades) return right.netPnL - left.netPnL
      return right.totalTrades - left.totalTrades
    })
    .slice(0, 5)
    .map((item) => item.tag)

  if (!topTags.length) {
    return {
      weekdays: WEEKDAY_ORDER,
      tags: [],
      cells: [],
    }
  }

  const tagMap = buildTradeTagMap(tradeTags)
  const rawCells = WEEKDAY_ORDER.flatMap((weekday) =>
    topTags.map((tag) => {
      const cellTrades = tradesCurrent.filter((trade) => getWeekdayLabel(trade) === weekday && (tagMap[trade.id] ?? []).includes(tag))
      const metrics = getCoreMetrics(cellTrades)

      return {
        weekday,
        tag,
        tradeCount: cellTrades.length,
        netPnL: metrics.netPnL,
        href: cellTrades.length ? buildTradesHref({ tag, weekday, reviewFocus: `Review Drilldown · Heatmap: ${weekday} × ${tag}` }) : undefined,
      }
    })
  )

  const maxTradeCount = Math.max(...rawCells.map((cell) => cell.tradeCount), 1)

  return {
    weekdays: WEEKDAY_ORDER,
    tags: topTags,
    cells: rawCells.map((cell) => ({
      ...cell,
      intensity: cell.tradeCount > 0 ? cell.tradeCount / maxTradeCount : 0,
      tone: getToneFromPnL(cell.netPnL),
    })),
  }
}


function normalizeReviewValue(value: string | null | undefined) {
  const clean = value?.trim()
  if (!clean || clean === '—') return ''
  return clean
}

function buildReviewLayerSnapshot(tradesCurrent: Trade[]): ReviewLayerSnapshot {
  const reviewedTrades = tradesCurrent.filter((trade) =>
    Boolean(
      normalizeReviewValue(trade.ruleCheck) ||
      normalizeReviewValue(trade.reviewRepeatability) ||
      normalizeReviewValue(trade.reviewState) ||
      normalizeReviewValue(trade.reviewLesson)
    )
  )
  const totalTrades = tradesCurrent.length
  const coverage = totalTrades ? (reviewedTrades.length / totalTrades) * 100 : 0

  const countValues = (values: (string | null | undefined)[]) => {
    const map = new Map<string, number>()
    for (const value of values.map(normalizeReviewValue).filter(Boolean)) {
      map.set(value, (map.get(value) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }

  const ruleCounts = countValues(reviewedTrades.map((trade) => trade.ruleCheck))
  const repeatCounts = countValues(reviewedTrades.map((trade) => trade.reviewRepeatability))
  const stateCounts = countValues(reviewedTrades.map((trade) => trade.reviewState || trade.emotion))

  const ruleYes = ruleCounts.find(([value]) => value === 'Ja')?.[1] ?? 0
  const ruleNo = ruleCounts.find(([value]) => value === 'Nein')?.[1] ?? 0
  const repeatYes = repeatCounts.find(([value]) => value === 'Ja')?.[1] ?? 0
  const repeatNo = repeatCounts.find(([value]) => value === 'Nein')?.[1] ?? 0
  const dominantState = stateCounts[0]

  const latestLessonTrade = [...reviewedTrades]
    .filter((trade) => normalizeReviewValue(trade.reviewLesson))
    .sort((a, b) => new Date(b.createdAt ?? b.date).getTime() - new Date(a.createdAt ?? a.date).getTime())[0]
  const latestLesson = normalizeReviewValue(latestLessonTrade?.reviewLesson) || null

  const highlights: ReviewTagRadarItem[] = []

  if (ruleCounts.length) {
    const tone = ruleNo > ruleYes ? 'red' as const : ruleYes >= Math.max(1, ruleNo) ? 'emerald' as const : 'orange' as const
    const href = buildTradesHref({ reviewFocus: `Review Layer · Regelkonformität ${ruleCounts[0][0]}` })
    highlights.push({
      label: 'Regelspur',
      value: `${ruleYes}/${reviewedTrades.length || 1} Ja`,
      detail: ruleNo > 0
        ? `${ruleNo} Trades wurden im Review klar als nicht regelkonform markiert.`
        : 'Die meisten gesetzten Reviews zeigen einen sauberen Regelpfad.',
      tone,
      href,
    })
  }

  if (repeatCounts.length) {
    const tone = repeatYes >= Math.max(1, repeatNo) ? 'emerald' as const : repeatNo > 0 ? 'orange' as const : 'orange' as const
    highlights.push({
      label: 'Replizierbarkeit',
      value: repeatCounts[0][0],
      detail: repeatYes > 0
        ? `${repeatYes} Trades würdest du in ähnlicher Form wieder nehmen.`
        : repeatNo > 0
          ? `${repeatNo} Trades sollen so ausdrücklich nicht wiederkommen.`
          : 'Noch kein klares Wiederholungsmuster im Review-Layer.',
      tone,
      href: buildTradesHref({ reviewFocus: `Review Layer · Replizierbarkeit ${repeatCounts[0][0]}` }),
    })
  }

  if (dominantState) {
    const stateTone = ['Impulsiv', 'Unscharf', 'Müde', 'Gejagt'].includes(dominantState[0]) ? 'red' as const : ['Geduldig', 'Fokussiert'].includes(dominantState[0]) ? 'emerald' as const : 'orange' as const
    highlights.push({
      label: 'Dominanter Zustand',
      value: dominantState[0],
      detail: `${dominantState[1]} Review-Trades tragen dieses Zustandsmuster.`,
      tone: stateTone,
      href: buildTradesHref({ reviewFocus: `Review Layer · Zustand ${dominantState[0]}` }),
    })
  }

  if (latestLesson) {
    highlights.push({
      label: 'Letzter Lerneffekt',
      value: 'Kurz notiert',
      detail: shortenReviewText(latestLesson, 120),
      tone: 'orange',
      href: latestLessonTrade ? buildTradesHref({ search: latestLessonTrade.market, reviewFocus: 'Review Layer · Letzter Lerneffekt' }) : undefined,
    })
  }

  const headline = !totalTrades
    ? 'Noch keine Review-Signale im Zeitraum'
    : coverage >= 70
      ? 'Der Review-Layer liefert schon belastbare Verhaltenstrends'
      : coverage >= 35
        ? 'Der Review-Layer zeigt erste Verhaltensmuster'
        : 'Der Review-Layer ist noch punktuell, aber schon nützlich'

  const summary = !totalTrades
    ? 'Sobald Trades im Zeitraum liegen, verdichtet Equora hier Regelspur, Replizierbarkeit, Zustand und Lerneffekte.'
    : reviewedTrades.length === 0
      ? 'Noch kein Trade im Zeitraum wurde im Review-Layer nachgezogen. Genau dort werden aus Fakten echte Verhaltenssignale.'
      : `${reviewedTrades.length} von ${totalTrades} Trades tragen Review-Signale. ${ruleNo > 0 ? `${ruleNo} Trades fallen klar als Regelbruch auf.` : repeatYes > 0 ? `${repeatYes} Trades sehen nach replizierbarem Kernmaterial aus.` : 'Der Layer zeigt erste Muster für Verhalten statt nur Ergebnis.'}`

  const checklist = [
    coverage < 70 ? 'Offene Trades im Edit-Flow kurz mit Review-Signalen nachziehen' : null,
    ruleNo > 0 ? `Regelbruch-Setups aus ${ruleNo} Trades vor dem nächsten Entry aktiv gegenprüfen` : null,
    repeatYes > 0 ? `${repeatYes} replizierbare Trades als Referenz offen halten` : null,
    dominantState ? `Vor dem Open auf Zustand „${dominantState[0]}“ achten` : null,
    latestLesson ? shortenReviewText(latestLesson, 100) : null,
  ].filter(Boolean) as string[]

  return {
    reviewedTrades: reviewedTrades.length,
    totalTrades,
    coverage,
    summary,
    headline,
    highlights: highlights.slice(0, 4),
    checklist: Array.from(new Set(checklist)).slice(0, 4),
    latestLesson,
  }
}

function buildTagDrift(tradesCurrent: Trade[], currentTags: TradeTag[], tradesPrevious: Trade[], previousTags: TradeTag[]): ReviewTagComparisonItem[] {
  const comparisons = buildTagComparisons(currentTags, previousTags, tradesCurrent, tradesPrevious)
  const tagCoverageCurrent = getTagCoverage(tradesCurrent, currentTags)
  const tagCoveragePrevious = getTagCoverage(tradesPrevious, previousTags)
  const processShareCurrent = getProcessTagShare(tradesCurrent, currentTags)
  const processSharePrevious = getProcessTagShare(tradesPrevious, previousTags)
  const strongestImprover = [...comparisons]
    .filter((item) => item.current && item.current.totalTrades > 0)
    .sort((left, right) => {
      if (right.pnlDelta === left.pnlDelta) return right.winRateDelta - left.winRateDelta
      return right.pnlDelta - left.pnlDelta
    })[0]
  const biggestSlipper = [...comparisons]
    .filter((item) => item.current && item.current.totalTrades > 0)
    .sort((left, right) => {
      if (left.pnlDelta === right.pnlDelta) return left.winRateDelta - right.winRateDelta
      return left.pnlDelta - right.pnlDelta
    })[0]
  const newWarning = [...comparisons]
    .filter((item) => item.current && !item.previous && (item.current?.netPnL ?? 0) < 0)
    .sort((left, right) => (left.current?.netPnL ?? 0) - (right.current?.netPnL ?? 0))[0]

  const items = [
    strongestImprover
      ? {
          label: 'Aufsteiger-Tag',
          value: strongestImprover.tag,
          detail: `${formatDelta(strongestImprover.pnlDelta, ' €')} und ${formatDelta(strongestImprover.winRateDelta, ' pp')} zur Vorperiode.`,
          tone: strongestImprover.pnlDelta >= 0 ? ('emerald' as const) : ('orange' as const),
          href: buildTradesHref({ tag: strongestImprover.tag, reviewFocus: `Review Drilldown · Aufsteiger-Tag: ${strongestImprover.tag}` }),
        }
      : null,
    biggestSlipper
      ? {
          label: 'Kippender Tag',
          value: biggestSlipper.tag,
          detail: `${formatDelta(biggestSlipper.pnlDelta, ' €')} gegenüber der Vorperiode.`,
          tone: biggestSlipper.pnlDelta < 0 ? ('red' as const) : ('orange' as const),
          href: buildTradesHref({ tag: biggestSlipper.tag, reviewFocus: `Review Drilldown · Kippender Tag: ${biggestSlipper.tag}` }),
        }
      : null,
    newWarning
      ? {
          label: 'Neuer Warn-Tag',
          value: newWarning.tag,
          detail: `${formatCurrency(newWarning.current?.netPnL ?? 0)} ohne Vorperioden-Historie. Frischer Störsender im System.`,
          tone: 'red',
          href: buildTradesHref({ tag: newWarning.tag, outcome: 'Verlierer', reviewFocus: `Review Drilldown · Neuer Warn-Tag: ${newWarning.tag}` }),
        }
      : null,
    tradesCurrent.length > 0
      ? {
          label: 'Prozess-Quote',
          value: `${clampNumber(processShareCurrent)}%`,
          detail: `${formatDelta(processShareCurrent - processSharePrevious, ' pp')} vs. Vorperiode · Tag-Abdeckung ${clampNumber(tagCoverageCurrent)}%.`,
          tone: processShareCurrent >= processSharePrevious ? ('emerald' as const) : ('orange' as const),
        }
      : null,
    tradesCurrent.length > 0
      ? {
          label: 'Tag-Abdeckung',
          value: `${clampNumber(tagCoverageCurrent)}%`,
          detail: `${formatDelta(tagCoverageCurrent - tagCoveragePrevious, ' pp')} im Periodenvergleich.`,
          tone: tagCoverageCurrent >= 80 ? ('emerald' as const) : tagCoverageCurrent >= 60 ? ('orange' as const) : ('red' as const),
        }
      : null,
  ].filter(Boolean) as ReviewTagComparisonItem[]

  return items.length
    ? items.slice(0, 4)
    : [
        {
          label: 'Tag-Drift',
          value: 'Noch keine Vergleichsdaten',
          detail: 'Sobald zwei Perioden sinnvoll befüllt sind, markiert Equora hier Aufsteiger, kippende Tags und Prozess-Drift.',
          tone: 'orange',
        },
      ]
}

function buildNoteMoments(notes: DailyNoteRow[], currentStart: Date, currentEnd: Date): ReviewNoteMoment[] {
  return notes
    .filter((note) => {
      const noteTime = new Date(note.trade_date)
      return noteTime >= currentStart && noteTime <= currentEnd
    })
    .slice(0, 3)
    .map((note) => ({
      title: note.title ?? 'Tagesnotiz',
      meta: `${formatTradeDateLabel(note.trade_date)} · Mood: ${note.mood ?? '—'} · Fokus: ${note.focus ?? '—'}`,
      body: note.note ?? 'Keine Notiz hinterlegt.',
    }))
}

export function buildReviewSnapshot(
  trades: Trade[],
  tradeTags: TradeTag[],
  dailyNotes: DailyNoteRow[],
  source: 'supabase' | 'mock',
  options?: { preset?: ReviewPeriodPreset }
): ReviewSnapshot {
  const preset = options?.preset ?? '7d'
  const { currentStart, currentEnd, previousStart, previousEnd, presetConfig } = getPeriodWindows(trades, preset)
  const tradesCurrent = trades.filter((trade) => isTradeInRange(trade, currentStart, currentEnd))
  const tradesPrevious = trades.filter((trade) => isTradeInRange(trade, previousStart, previousEnd))
  const currentTradeIds = new Set(tradesCurrent.map((trade) => trade.id))
  const previousTradeIds = new Set(tradesPrevious.map((trade) => trade.id))
  const tagsCurrent = tradeTags.filter((tag) => currentTradeIds.has(tag.trade_id))
  const tagsPrevious = tradeTags.filter((tag) => previousTradeIds.has(tag.trade_id))
  const metricsCurrent = getCoreMetrics(tradesCurrent)
  const metricsPrevious = getCoreMetrics(tradesPrevious)
  const errorClusters = buildErrorClusters(tradesCurrent, tagsCurrent)
  const tagDrift = buildTagDrift(tradesCurrent, tagsCurrent, tradesPrevious, tagsPrevious)
  const { headline, summary } = buildHeadline(tradesCurrent, metricsCurrent, tagDrift, errorClusters)
  const rankedTrades = [...tradesCurrent].sort((left, right) => (right.netPnL ?? 0) - (left.netPnL ?? 0))
  const topTags = buildTagStats(tradesCurrent, tagsCurrent)
    .sort((left, right) => right.totalTrades - left.totalTrades || right.netPnL - left.netPnL)
    .slice(0, 5)
    .map((item) => item.tag)

  return {
    periodPreset: preset,
    periodPresetLabel: presetConfig.label,
    periodLabel: buildWindowLabel(currentStart, currentEnd),
    previousPeriodLabel: buildWindowLabel(previousStart, previousEnd),
    periodStart: currentStart.toISOString(),
    periodEnd: currentEnd.toISOString(),
    sourceLabel: source === 'supabase' ? 'Live-Review' : 'Demo-Review',
    headline,
    summary,
    stats: buildSummary(metricsCurrent, metricsPrevious),
    topPerformers: buildTopPerformers(tradesCurrent, tagsCurrent),
    weakSpots: buildWeakSpots(tradesCurrent, tagsCurrent),
    patterns: buildPatterns(tradesCurrent, tagsCurrent, tradesPrevious, tagsPrevious),
    playbook: buildPlaybook(tradesCurrent, tagsCurrent, tradesPrevious, tagsPrevious),
    noteMoments: buildNoteMoments(dailyNotes, currentStart, currentEnd),
    tagRadar: buildTagRadar(tradesCurrent, tagsCurrent),
    errorClusters,
    tagDrift,
    tagCombinations: buildTagCombinations(tradesCurrent, tagsCurrent),
    tagHeatmap: buildTagHeatmap(tradesCurrent, tagsCurrent),
    reviewLayer: buildReviewLayerSnapshot(tradesCurrent),
    sessionDraft: {
      tradeIds: tradesCurrent.map((trade) => trade.id),
      tradeCount: metricsCurrent.totalTrades,
      visibleTradeCount: metricsCurrent.totalTrades,
      netPnL: metricsCurrent.netPnL,
      averageR: metricsCurrent.averageR,
      winRate: metricsCurrent.winRate,
      winners: metricsCurrent.winners,
      losers: metricsCurrent.losers,
      breakeven: metricsCurrent.breakeven,
      topTags,
      bestTradeId: rankedTrades[0]?.id ?? null,
      worstTradeId: rankedTrades[rankedTrades.length - 1]?.id ?? null,
    },
  }
}


export function buildReviewSnapshots(
  trades: Trade[],
  tradeTags: TradeTag[],
  dailyNotes: DailyNoteRow[],
  source: 'supabase' | 'mock'
): ReviewSnapshotCollection {
  return REVIEW_PERIOD_OPTIONS.reduce((accumulator, option) => {
    accumulator[option.key] = buildReviewSnapshot(trades, tradeTags, dailyNotes, source, { preset: option.key })
    return accumulator
  }, {} as ReviewSnapshotCollection)
}

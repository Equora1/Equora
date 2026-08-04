import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'
import { formatTradeDateLabel } from '@/lib/utils/date-format'
import { buildTagStats } from '@/lib/utils/tag-analytics'
import { buildTagPairStats, buildTradesHref, clampNumber, formatDelta, getWeekdayLabel, hasKeywordMatch, PROCESS_TAG_KEYWORDS } from '@/lib/utils/review-helpers'
import type { ReviewNoteMoment, ReviewSignal, ReviewTagComparisonItem } from '@/lib/utils/review-types'
import { buildTagComparisons, getBestAndWorstBucket, getTagCoverage } from '@/lib/utils/review-builder-shared'

export function buildSummary(statsCurrent: ReturnType<typeof getCoreMetrics>, statsPrevious: ReturnType<typeof getCoreMetrics>) {
  const pnlDelta = statsCurrent.netPnL - statsPrevious.netPnL
  const periodsComparable = statsCurrent.monetaryScope.isComparable
    && statsPrevious.monetaryScope.isComparable
    && statsCurrent.currency === statsPrevious.currency
  const winRateDelta = statsCurrent.winRate - statsPrevious.winRate
  const pfDelta =
    Number.isFinite(statsCurrent.profitFactor) && Number.isFinite(statsPrevious.profitFactor)
      ? statsCurrent.profitFactor - statsPrevious.profitFactor
      : 0

  return [
    {
      label: 'P&L',
      value: statsCurrent.monetaryScope.isComparable ? formatCurrency(statsCurrent.netPnL, 0, statsCurrent.currency) : 'Gesperrt',
      hint: periodsComparable ? `${formatCurrency(pnlDelta, 0, statsCurrent.currency)} vs. Vorperiode` : 'Währungen nicht vergleichbar',
      tone: statsCurrent.monetaryScope.isComparable && statsCurrent.netPnL >= 0 ? ('emerald' as const) : ('orange' as const),
    },
    {
      label: 'Win Rate',
      value: `${clampNumber(statsCurrent.winRate)}%`,
      hint: `${formatDelta(winRateDelta, ' pp')} bei ${statsCurrent.totalTrades} Trades`,
      tone: statsCurrent.winRate >= 50 ? ('emerald' as const) : ('orange' as const),
    },
    {
      label: 'Profit Factor',
      value: statsCurrent.monetaryScope.isComparable ? statsCurrent.profitFactor === Infinity ? '∞' : clampNumber(statsCurrent.profitFactor, 2) : 'Gesperrt',
      hint: periodsComparable ? `${formatDelta(pfDelta)} vs. Vorperiode` : 'Keine währungsreine Basis',
      tone: statsCurrent.monetaryScope.isComparable && statsCurrent.profitFactor >= 1.5 ? ('emerald' as const) : ('orange' as const),
    },
    {
      label: 'Erwartung',
      value: statsCurrent.monetaryScope.isComparable ? formatCurrency(statsCurrent.expectancy, 0, statsCurrent.currency) : 'Gesperrt',
      hint: `${formatRMultiple(statsCurrent.expectancyR)} je Trade`,
      tone: statsCurrent.expectancy >= 0 ? ('emerald' as const) : ('red' as const),
    },
    {
      label: 'Max. Drawdown',
      value: statsCurrent.monetaryScope.isComparable ? formatCurrency(-statsCurrent.maxDrawdown, 0, statsCurrent.currency) : 'Gesperrt',
      hint: `${statsCurrent.longestLossStreak}er Verlustserie im Zeitraum`,
      tone: statsCurrent.maxDrawdown <= Math.max(Math.abs(statsCurrent.netPnL) * 0.35, 1) ? ('orange' as const) : ('red' as const),
    },
  ]
}

export function buildHeadline(
  tradesCurrent: Trade[],
  statsCurrent: ReturnType<typeof getCoreMetrics>,
  tradeDrift: ReviewTagComparisonItem[],
  errorClusters: ReviewSignal[]
) {
  const money = (value: number) => formatCurrency(value, 0, statsCurrent.currency)
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
      summary: `Du hast ${statsCurrent.totalTrades} Trades mit ${clampNumber(statsCurrent.winRate)}% Trefferquote und ${money(statsCurrent.netPnL)} abgeschlossen.${slippingTag ? ` Beobachte trotzdem ${slippingTag.value}, damit der grüne Lauf nicht kippt.` : ''}`,
    }
  }

  if (statsCurrent.netPnL < 0 || statsCurrent.profitFactor < 1) {
    return {
      headline: 'Die Woche zeigt Reibung, aber sie ist lesbar',
      summary: `Der Datensatz markiert klar, wo Prozess und Selektivität nachgeschärft werden müssen. Aktuell stehen ${money(statsCurrent.netPnL)} und ein Profit Factor von ${statsCurrent.profitFactor === Infinity ? '∞' : clampNumber(statsCurrent.profitFactor, 2)} im Raum.${mainErrorCluster ? ` Größter Hebel aktuell: ${mainErrorCluster.value}.` : ''}`,
    }
  }

  return {
    headline: 'Die Woche ist solide, aber noch nicht maximal scharf',
    summary: `Es gibt eine brauchbare Basis mit ${statsCurrent.totalTrades} Trades. Jetzt geht es darum, die stärksten Cluster konsequenter zu handeln und das Rauschen zu entfernen.${tradeDrift[0] ? ` Auffällig im Vergleich: ${tradeDrift[0].value}.` : ''}`,
  }
}

export function buildTopPerformers(tradesCurrent: Trade[], tradeTags: TradeTag[]): ReviewSignal[] {
  const currency = getCoreMetrics(tradesCurrent).currency
  const money = (value: number) => formatCurrency(value, 0, currency)
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
          detail: `${money(bestSetup.metrics.netPnL)} · ${clampNumber(bestSetup.metrics.winRate)}% Win Rate · ${formatRMultiple(bestSetup.metrics.averageR)}`,
          href: buildTradesHref({ setup: bestSetup.key, reviewFocus: `Review Drilldown · Bestes Setup: ${bestSetup.key}` }),
        }
      : null,
    bestMarket
      ? {
          label: 'Stärkster Markt',
          value: bestMarket.key,
          detail: `${money(bestMarket.metrics.netPnL)} bei ${bestMarket.metrics.totalTrades} Trades.`,
          href: buildTradesHref({ market: bestMarket.key, reviewFocus: `Review Drilldown · Stärkster Markt: ${bestMarket.key}` }),
        }
      : null,
    bestSession
      ? {
          label: 'Sauberste Session',
          value: bestSession.key,
          detail: `${bestSession.metrics.profitFactor === Infinity ? '∞' : clampNumber(bestSession.metrics.profitFactor, 2)} PF und ${money(bestSession.metrics.netPnL)} im Zeitraum.`,
          href: buildTradesHref({ session: bestSession.key, reviewFocus: `Review Drilldown · Sauberste Session: ${bestSession.key}` }),
        }
      : null,
    positiveTags[0]
      ? {
          label: 'Bester Tag-Cluster',
          value: positiveTags[0].tag,
          detail: `${money(positiveTags[0].netPnL)} · ${clampNumber(positiveTags[0].winRate)}% Win Rate in ${positiveTags[0].totalTrades} Trades.`,
          href: buildTradesHref({ tag: positiveTags[0].tag, reviewFocus: `Review Drilldown · Bester Tag-Cluster: ${positiveTags[0].tag}` }),
        }
      : null,
  ].filter(Boolean) as ReviewSignal[]

  return items.length
    ? items
    : [{ label: 'Noch kein Lead-Cluster', value: 'Warte auf Daten', detail: 'Sobald Trades im Zeitraum liegen, markiert Equora hier die stärksten Muster.' }]
}

export function buildWeakSpots(tradesCurrent: Trade[], tradeTags: TradeTag[]): ReviewSignal[] {
  const currency = getCoreMetrics(tradesCurrent).currency
  const money = (value: number) => formatCurrency(value, 0, currency)
  const worstSetup = getBestAndWorstBucket(tradesCurrent, (trade) => trade.setup).worst
  const worstWeekday = getBestAndWorstBucket(tradesCurrent, getWeekdayLabel).worst
  const negativeTags = buildTagStats(tradesCurrent, tradeTags)
    .filter((tag) => tag.totalTrades > 0)
    .sort((a, b) => a.netPnL - b.netPnL)
  const metrics = getCoreMetrics(tradesCurrent)
  const tagCoverage = getTagCoverage(tradesCurrent, tradeTags)

  const hasMeaningfulWeakSetup = Boolean(
    worstSetup && (worstSetup.metrics.netPnL < 0 || worstSetup.metrics.averageR < 0 || worstSetup.metrics.winRate < 50)
  )
  const hasMeaningfulWeakDay = Boolean(worstWeekday && worstWeekday.metrics.netPnL < 0)
  const negativeTagLead = negativeTags.find((tag) => tag.netPnL < 0)

  const items = [
    hasMeaningfulWeakSetup && worstSetup
      ? {
          label: 'Schwächstes Setup',
          value: worstSetup.key,
          detail: `${money(worstSetup.metrics.netPnL)} · ${clampNumber(worstSetup.metrics.winRate)}% Win Rate.`,
          href: buildTradesHref({ setup: worstSetup.key, reviewFocus: `Review Drilldown · Schwächstes Setup: ${worstSetup.key}` }),
        }
      : null,
    hasMeaningfulWeakDay && worstWeekday
      ? {
          label: 'Härtester Handelstag',
          value: worstWeekday.key,
          detail: `${money(worstWeekday.metrics.netPnL)} an diesem Wochentag.`,
          href: buildTradesHref({ weekday: worstWeekday.key, reviewFocus: `Review Drilldown · Härtester Handelstag: ${worstWeekday.key}` }),
        }
      : null,
    negativeTagLead
      ? {
          label: 'Negativer Tag-Trigger',
          value: negativeTagLead.tag,
          detail: `${money(negativeTagLead.netPnL)} über ${negativeTagLead.totalTrades} markierte Trades.`,
          href: buildTradesHref({ tag: negativeTagLead.tag, outcome: 'Verlierer', reviewFocus: `Review Drilldown · Negativer Tag-Trigger: ${negativeTagLead.tag}` }),
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

  return items
}

export function buildPatterns(tradesCurrent: Trade[], tradeTags: TradeTag[], tradesPrevious: Trade[], previousTags: TradeTag[]): string[] {
  const patterns: string[] = []
  const currency = getCoreMetrics(tradesCurrent).currency
  const money = (value: number) => formatCurrency(value, 0, currency)
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
    patterns.push(`A-Setups lieferten ${money(aMetrics.netPnL)} bei ${clampNumber(aMetrics.winRate)}% Win Rate, der Rest ${money(nonAMetrics.netPnL)}.`)
  }

  const patienceTag = tagStats.find((tag) => hasKeywordMatch(tag.tag, PROCESS_TAG_KEYWORDS))
  if (patienceTag) {
    patterns.push(`Tag „${patienceTag.tag}“ zeigt ${money(patienceTag.netPnL)} und wirkt wie ein brauchbarer Prozess-Anker.`)
  }

  const dangerTag = [...tagStats].sort((a, b) => a.netPnL - b.netPnL)[0]
  if (dangerTag && dangerTag.netPnL < 0) {
    patterns.push(`Tag „${dangerTag.tag}“ kostet aktuell ${money(dangerTag.netPnL)}. Das ist kein Etikett mehr, sondern ein Warnschild.`)
  }

  const bestWeekday = getBestAndWorstBucket(tradesCurrent, getWeekdayLabel).best
  if (bestWeekday) {
    patterns.push(`${bestWeekday.key} war der stärkste Wochentag mit ${money(bestWeekday.metrics.netPnL)}.`)
  }

  if (tagPairs[0]) {
    patterns.push(`Die Tag-Kombi „${tagPairs[0].pair}“ markiert aktuell ${money(tagPairs[0].metrics.netPnL)} in ${tagPairs[0].metrics.totalTrades} Trades.`)
  }

  if (slippingTag?.current && slippingTag.pnlDelta < 0) {
    patterns.push(`Gegenüber der Vorperiode ist „${slippingTag.tag}“ um ${money(slippingTag.pnlDelta)} abgekippt. Das ist Drift, kein Zufall.`)
  }

  if (tradesCurrent.length > 0 && tagCoverage < 70) {
    patterns.push(`Nur ${clampNumber(tagCoverage)}% der Trades tragen Tags. Mehr Kontext-Tags würden Review und Compare deutlich schärfer machen.`)
  }

  return patterns.length
    ? patterns
    : ['Noch zu wenig Daten für belastbare Muster. Mit mehr Trades werden Setups, Tage und Tags deutlich aussagekräftiger.']
}

export function buildPlaybook(tradesCurrent: Trade[], tradeTags: TradeTag[], tradesPrevious: Trade[], previousTags: TradeTag[]): string[] {
  const actions: string[] = []
  const metrics = getCoreMetrics(tradesCurrent)
  const money = (value: number) => formatCurrency(value, 0, metrics.currency)
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
    actions.push(`Mehr Gewicht auf ${bestSetup.key}: aktuell der sauberste Cluster mit ${money(bestSetup.metrics.netPnL)}.`)
  }

  if (worstTag && worstTag.netPnL < 0) {
    actions.push(`Vor jedem Entry Trigger gegen „${worstTag.tag}“ einbauen. Erst Regelcheck, dann Order.`)
  }

  if (slippingTag?.current && slippingTag.pnlDelta < 0) {
    actions.push(`„${slippingTag.tag}“ ist gegenüber der Vorperiode um ${money(slippingTag.pnlDelta)} abgerutscht. Dieses Tag vor dem Entry bewusst gegenprüfen.`)
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


export function buildNoteMoments(notes: DailyNoteRow[], currentStart: Date, currentEnd: Date): ReviewNoteMoment[] {
  return notes
    .filter((note) => {
      const noteTime = new Date(note.trade_date)
      return noteTime >= currentStart && noteTime <= currentEnd
    })
    .slice(0, 3)
    .map((note) => ({
      title: note.title ?? 'Review-Notiz',
      meta: `${formatTradeDateLabel(note.trade_date)} · Mood: ${note.mood ?? '—'} · Fokus: ${note.focus ?? '—'}`,
      body: note.note ?? 'Keine Notiz hinterlegt.',
    }))
}

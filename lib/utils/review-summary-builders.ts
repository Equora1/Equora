import { journalNumberLocale, journalText, type JournalLocale } from '@/lib/i18n/journal'
import { formatReviewWeekday } from '@/lib/utils/review-display'
import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'
import { formatTradeDateLabel } from '@/lib/utils/date-format'
import { getTradeDateKey } from '@/lib/utils/trade-time'
import { buildTagStats } from '@/lib/utils/tag-analytics'
import { buildTagPairStats, buildTradesHref, clampNumber, formatDelta, getWeekdayLabel, hasKeywordMatch, PROCESS_TAG_KEYWORDS } from '@/lib/utils/review-helpers'
import type { ReviewNoteMoment, ReviewSignal, ReviewTagComparisonItem } from '@/lib/utils/review-types'
import { buildTagComparisons, getBestAndWorstBucket, getTagCoverage } from '@/lib/utils/review-builder-shared'

export function buildSummary(statsCurrent: ReturnType<typeof getCoreMetrics>, statsPrevious: ReturnType<typeof getCoreMetrics>, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  const number = (value: number) => value.toLocaleString(journalNumberLocale[locale], { maximumFractionDigits: 1 })
  const money = (value: number) => formatCurrency(value, 0, statsCurrent.currency, locale)
  const pnlDelta = statsCurrent.netPnL - statsPrevious.netPnL
  const periodsComparable = statsCurrent.monetaryScope.isComparable
    && statsPrevious.monetaryScope.isComparable
    && statsCurrent.currency === statsPrevious.currency
  const winRateDelta = statsCurrent.winRate - statsPrevious.winRate
  const roundedWinRateDelta = Math.round(winRateDelta * 10) / 10
  const winRateChange = !statsCurrent.resolvedTrades ? text('Noch kein Ergebnis vorhanden.', 'No trade results yet.')
    : !statsPrevious.resolvedTrades ? text('Kein Vergleichswert vorhanden.', 'No previous result to compare.')
    : roundedWinRateDelta === 0 ? text('Unverändert zur Vorperiode (gerundet).', 'Unchanged from the previous period (rounded).')
    : text(
        `${number(Math.abs(roundedWinRateDelta))} Prozentpunkte ${roundedWinRateDelta < 0 ? 'weniger' : 'mehr'} · vorher ${number(statsPrevious.winRate)} %`,
        `${number(Math.abs(roundedWinRateDelta))} percentage points ${roundedWinRateDelta < 0 ? 'lower' : 'higher'} · previously ${number(statsPrevious.winRate)}%`,
      )
  const pfDelta =
    Number.isFinite(statsCurrent.profitFactor) && Number.isFinite(statsPrevious.profitFactor)
      ? statsCurrent.profitFactor - statsPrevious.profitFactor
      : 0

  return [
    {
      label: 'P&L',
      value: statsCurrent.monetaryScope.isComparable ? money(statsCurrent.netPnL) : text('Gesperrt', 'Unavailable'),
      hint: periodsComparable ? text(`${money(pnlDelta)} vs. Vorperiode`, `${money(pnlDelta)} vs. previous period`) : text('Währungen nicht vergleichbar', 'Currencies cannot be compared'),
      tone: statsCurrent.monetaryScope.isComparable && statsCurrent.netPnL >= 0 ? ('emerald' as const) : ('orange' as const),
    },
    {
      label: text('Winrate', 'Win rate'),
      value: statsCurrent.resolvedTrades ? text(`${number(statsCurrent.winRate)} %`, `${number(statsCurrent.winRate)}%`) : '—',
      hint: winRateChange,
      basis: text(`${statsCurrent.winners} ${statsCurrent.winners === 1 ? 'Gewinn' : 'Gewinne'} · ${statsCurrent.resolvedTrades} Trades mit Ergebnis${statsCurrent.totalTrades !== statsCurrent.resolvedTrades ? ` · ${statsCurrent.totalTrades} insgesamt` : ''}`, `${statsCurrent.winners} ${statsCurrent.winners === 1 ? 'win' : 'wins'} · ${statsCurrent.resolvedTrades} ${statsCurrent.resolvedTrades === 1 ? 'trade' : 'trades'} with a result${statsCurrent.totalTrades !== statsCurrent.resolvedTrades ? ` · ${statsCurrent.totalTrades} total` : ''}`),
      tone: statsCurrent.winRate >= 50 ? ('emerald' as const) : ('orange' as const),
    },
    {
      label: 'Profit Factor',
      value: statsCurrent.monetaryScope.isComparable ? statsCurrent.profitFactor === Infinity ? '∞' : clampNumber(statsCurrent.profitFactor, 2) : text('Gesperrt', 'Unavailable'),
      hint: periodsComparable ? text(`${formatDelta(pfDelta)} vs. Vorperiode`, `${formatDelta(pfDelta)} vs. previous period`) : text('Keine währungsreine Basis', 'A single currency is required'),
      tone: statsCurrent.monetaryScope.isComparable && statsCurrent.profitFactor >= 1.5 ? ('emerald' as const) : ('orange' as const),
    },
    {
      label: text('Erwartung', 'Expectancy'),
      value: statsCurrent.monetaryScope.isComparable ? money(statsCurrent.expectancy) : text('Gesperrt', 'Unavailable'),
      hint: text(`${formatRMultiple(statsCurrent.expectancyR, 2, locale)} · ${statsCurrent.rCount} von ${statsCurrent.totalTrades} Trades mit Ergebnis-R`, `${formatRMultiple(statsCurrent.expectancyR, 2, locale)} · R recorded for ${statsCurrent.rCount} of ${statsCurrent.totalTrades} trades`),
      tone: statsCurrent.expectancy >= 0 ? ('emerald' as const) : ('red' as const),
    },
    {
      label: 'Max. Drawdown',
      value: statsCurrent.monetaryScope.isComparable ? money(-statsCurrent.maxDrawdown) : text('Gesperrt', 'Unavailable'),
      hint: text(`${statsCurrent.longestLossStreak}er Verlustserie im Zeitraum`, `Longest losing streak: ${statsCurrent.longestLossStreak}`),
      tone: statsCurrent.maxDrawdown <= Math.max(Math.abs(statsCurrent.netPnL) * 0.35, 1) ? ('orange' as const) : ('red' as const),
    },
  ]
}

export function buildHeadline(
  tradesCurrent: Trade[],
  statsCurrent: ReturnType<typeof getCoreMetrics>,
  tradeDrift: ReviewTagComparisonItem[],
  errorClusters: ReviewSignal[],
  locale: JournalLocale = 'de',
) {
  const text = journalText(locale)
  const money = (value: number) => formatCurrency(value, 0, statsCurrent.currency, locale)
  if (!tradesCurrent.length) {
    return {
      headline: text('Noch keine Trades im aktuellen Review-Zeitraum', 'No trades in this review period'),
      summary: text('Sobald Trades einlaufen, verdichtet Equora die Woche zu Mustern, Warnsignalen und nächsten Aktionen.', 'Add trades to see patterns and next steps.'),
    }
  }

  const slippingTag = tradeDrift.find((item) => item.label === 'Kippender Tag')
  const mainErrorCluster = errorClusters[0]

  if (statsCurrent.netPnL > 0 && statsCurrent.profitFactor >= 1.5) {
    return {
      headline: text('Die Woche lief sauber über Prozess statt Aktionismus', 'Positive P&L and a strong profit factor'),
      summary: text(`Du hast ${statsCurrent.totalTrades} Trades mit ${clampNumber(statsCurrent.winRate)}% Trefferquote und ${money(statsCurrent.netPnL)} abgeschlossen.${slippingTag ? ` Beobachte trotzdem ${slippingTag.value}, damit der grüne Lauf nicht kippt.` : ''}`, `${statsCurrent.totalTrades} closed trades, ${clampNumber(statsCurrent.winRate)}% win rate and ${money(statsCurrent.netPnL)} net P&L.${slippingTag ? ` Review the change in ${slippingTag.value}.` : ''}`),
    }
  }

  if (statsCurrent.netPnL < 0 || statsCurrent.profitFactor < 1) {
    return {
      headline: text('Die Woche zeigt Reibung, aber sie ist lesbar', 'Review what held back results'),
      summary: text(`Der Datensatz markiert klar, wo Prozess und Selektivität nachgeschärft werden müssen. Aktuell stehen ${money(statsCurrent.netPnL)} und ein Profit Factor von ${statsCurrent.profitFactor === Infinity ? '∞' : clampNumber(statsCurrent.profitFactor, 2)} im Raum.${mainErrorCluster ? ` Größter Hebel aktuell: ${mainErrorCluster.value}.` : ''}`, `Net P&L was ${money(statsCurrent.netPnL)}. Profit factor was ${statsCurrent.profitFactor === Infinity ? '∞' : clampNumber(statsCurrent.profitFactor, 2)}.${mainErrorCluster ? ` Start by reviewing ${mainErrorCluster.value}.` : ''}`),
    }
  }

  return {
    headline: text('Die Woche ist solide, aber noch nicht maximal scharf', 'Review which setups worked best'),
    summary: text(`Es gibt eine brauchbare Basis mit ${statsCurrent.totalTrades} Trades. Jetzt geht es darum, die stärksten Cluster konsequenter zu handeln und das Rauschen zu entfernen.${tradeDrift[0] ? ` Auffällig im Vergleich: ${tradeDrift[0].value}.` : ''}`, `Compare what worked across ${statsCurrent.totalTrades} trades.${tradeDrift[0] ? ` Review the change in ${tradeDrift[0].value}.` : ''}`),
  }
}

export function buildTopPerformers(tradesCurrent: Trade[], tradeTags: TradeTag[], locale: JournalLocale = 'de'): ReviewSignal[] {
  const text = journalText(locale)
  const currency = getCoreMetrics(tradesCurrent).currency
  const money = (value: number) => formatCurrency(value, 0, currency, locale)
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
          detail: text(`${money(bestSetup.metrics.netPnL)} · ${clampNumber(bestSetup.metrics.winRate)}% Trefferquote · ${formatRMultiple(bestSetup.metrics.averageR, 2, locale)}`, `${money(bestSetup.metrics.netPnL)} · ${clampNumber(bestSetup.metrics.winRate)}% win rate · ${formatRMultiple(bestSetup.metrics.averageR, 2, locale)}`),
          href: buildTradesHref({ setup: bestSetup.key, reviewFocus: `Review Drilldown · Bestes Setup: ${bestSetup.key}` }),
        }
      : null,
    bestMarket
      ? {
          label: 'Stärkster Markt',
          value: bestMarket.key,
          detail: text(`${money(bestMarket.metrics.netPnL)} bei ${bestMarket.metrics.totalTrades} Trades.`, `${money(bestMarket.metrics.netPnL)} across ${bestMarket.metrics.totalTrades} trades.`),
          href: buildTradesHref({ market: bestMarket.key, reviewFocus: `Review Drilldown · Stärkster Markt: ${bestMarket.key}` }),
        }
      : null,
    bestSession
      ? {
          label: 'Sauberste Session',
          value: bestSession.key,
          detail: text(`${bestSession.metrics.profitFactor === Infinity ? '∞' : clampNumber(bestSession.metrics.profitFactor, 2)} PF und ${money(bestSession.metrics.netPnL)} im Zeitraum.`, `Profit factor ${bestSession.metrics.profitFactor === Infinity ? '∞' : clampNumber(bestSession.metrics.profitFactor, 2)} and ${money(bestSession.metrics.netPnL)} in this period.`),
          href: buildTradesHref({ session: bestSession.key, reviewFocus: `Review Drilldown · Sauberste Session: ${bestSession.key}` }),
        }
      : null,
    positiveTags[0]
      ? {
          label: 'Bester Tag-Cluster',
          value: positiveTags[0].tag,
          detail: text(`${money(positiveTags[0].netPnL)} · ${clampNumber(positiveTags[0].winRate)}% Trefferquote in ${positiveTags[0].totalTrades} Trades.`, `${money(positiveTags[0].netPnL)} · ${clampNumber(positiveTags[0].winRate)}% win rate across ${positiveTags[0].totalTrades} trades.`),
          href: buildTradesHref({ tag: positiveTags[0].tag, reviewFocus: `Review Drilldown · Bester Tag-Cluster: ${positiveTags[0].tag}` }),
        }
      : null,
  ].filter(Boolean) as ReviewSignal[]

  return items.length
    ? items
    : [{ label: 'Noch kein Lead-Cluster', value: text('Warte auf Daten', 'Waiting for trades'), detail: text('Sobald Trades im Zeitraum liegen, markiert Equora hier die stärksten Muster.', 'The strongest patterns will appear here as you add trades.') }]
}

export function buildWeakSpots(tradesCurrent: Trade[], tradeTags: TradeTag[], locale: JournalLocale = 'de'): ReviewSignal[] {
  const text = journalText(locale)
  const currency = getCoreMetrics(tradesCurrent).currency
  const money = (value: number) => formatCurrency(value, 0, currency, locale)
  const worstSetup = getBestAndWorstBucket(tradesCurrent, (trade) => trade.setup).worst
  const worstWeekday = getBestAndWorstBucket(tradesCurrent, getWeekdayLabel).worst
  const negativeTags = buildTagStats(tradesCurrent, tradeTags)
    .filter((tag) => tag.totalTrades > 0)
    .sort((a, b) => a.netPnL - b.netPnL)
  const metrics = getCoreMetrics(tradesCurrent)
  const tagCoverage = getTagCoverage(tradesCurrent, tradeTags)

  const hasMeaningfulWeakSetup = Boolean(
    worstSetup && (worstSetup.metrics.netPnL < 0 || (worstSetup.metrics.averageR !== null && worstSetup.metrics.averageR < 0) || worstSetup.metrics.winRate < 50)
  )
  const hasMeaningfulWeakDay = Boolean(worstWeekday && worstWeekday.metrics.netPnL < 0)
  const negativeTagLead = negativeTags.find((tag) => tag.netPnL < 0)

  const items = [
    hasMeaningfulWeakSetup && worstSetup
      ? {
          label: 'Schwächstes Setup',
          value: worstSetup.key,
          detail: text(`${money(worstSetup.metrics.netPnL)} · ${clampNumber(worstSetup.metrics.winRate)}% Trefferquote.`, `${money(worstSetup.metrics.netPnL)} · ${clampNumber(worstSetup.metrics.winRate)}% win rate.`),
          href: buildTradesHref({ setup: worstSetup.key, reviewFocus: `Review Drilldown · Schwächstes Setup: ${worstSetup.key}` }),
        }
      : null,
    hasMeaningfulWeakDay && worstWeekday
      ? {
          label: 'Härtester Handelstag',
          value: formatReviewWeekday(worstWeekday.key, locale),
          detail: text(`${money(worstWeekday.metrics.netPnL)} an diesem Wochentag.`, `${money(worstWeekday.metrics.netPnL)} on this weekday.`),
          href: buildTradesHref({ weekday: worstWeekday.key, reviewFocus: `Review Drilldown · Härtester Handelstag: ${worstWeekday.key}` }),
        }
      : null,
    negativeTagLead
      ? {
          label: 'Negativer Tag-Trigger',
          value: negativeTagLead.tag,
          detail: text(`${money(negativeTagLead.netPnL)} über ${negativeTagLead.totalTrades} markierte Trades.`, `${money(negativeTagLead.netPnL)} across ${negativeTagLead.totalTrades} tagged trades.`),
          href: buildTradesHref({ tag: negativeTagLead.tag, outcome: 'Verlierer', reviewFocus: `Review Drilldown · Negativer Tag-Trigger: ${negativeTagLead.tag}` }),
        }
      : null,
    metrics.longestLossStreak > 1
      ? {
          label: 'Verlustserie',
          value: text(`${metrics.longestLossStreak} in Folge`, `${metrics.longestLossStreak} in a row`),
          detail: text('Lege in deinen Regeln fest, wann du eine Handelspause einlegst oder deine Positionsgröße reduzierst.', 'Set a rule for when to take a break or reduce position size.'),
        }
      : null,
    tradesCurrent.length > 0 && tagCoverage < 70
      ? {
          label: 'Tag-Abdeckung',
          value: `${clampNumber(tagCoverage)}%`,
          detail: text('Zu viele Trades laufen noch ohne Kontext-Tags durchs Journal. Das schwächt Review und Musterlogik.', 'Add context tags to more trades so patterns are easier to see.'),
        }
      : null,
  ].filter(Boolean) as ReviewSignal[]

  return items
}

export function buildPatterns(tradesCurrent: Trade[], tradeTags: TradeTag[], tradesPrevious: Trade[], previousTags: TradeTag[], locale: JournalLocale = 'de'): string[] {
  const text = journalText(locale)
  const patterns: string[] = []
  const currency = getCoreMetrics(tradesCurrent).currency
  const money = (value: number) => formatCurrency(value, 0, currency, locale)
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
    patterns.push(text(`A-Setups lieferten ${money(aMetrics.netPnL)} bei ${clampNumber(aMetrics.winRate)}% Trefferquote, der Rest ${money(nonAMetrics.netPnL)}.`, `A setups returned ${money(aMetrics.netPnL)} with a ${clampNumber(aMetrics.winRate)}% win rate. Other setups returned ${money(nonAMetrics.netPnL)}.`))
  }

  const patienceTag = tagStats.find((tag) => hasKeywordMatch(tag.tag, PROCESS_TAG_KEYWORDS))
  if (patienceTag) {
    patterns.push(text(`Tag „${patienceTag.tag}“ zeigt ${money(patienceTag.netPnL)} im gewählten Zeitraum. Prüfe den Ablauf dahinter, bevor du daraus eine Regel ableitest.`, `Trades tagged “${patienceTag.tag}” returned ${money(patienceTag.netPnL)} in this period. Review those trades before drawing a rule from them.`))
  }

  const dangerTag = [...tagStats].sort((a, b) => a.netPnL - b.netPnL)[0]
  if (dangerTag && dangerTag.netPnL < 0) {
    patterns.push(text(`Tag „${dangerTag.tag}“ kostet aktuell ${money(dangerTag.netPnL)}. Das ist kein Etikett mehr, sondern ein Warnschild.`, `Review trades tagged “${dangerTag.tag}”. They returned ${money(dangerTag.netPnL)} in this period.`))
  }

  const bestWeekday = getBestAndWorstBucket(tradesCurrent, getWeekdayLabel).best
  if (bestWeekday) {
    patterns.push(text(`${bestWeekday.key} war der stärkste Wochentag mit ${money(bestWeekday.metrics.netPnL)}.`, `The best weekday was ${formatReviewWeekday(bestWeekday.key, locale)} at ${money(bestWeekday.metrics.netPnL)}.`))
  }

  if (tagPairs[0]) {
    patterns.push(text(`Die Tag-Kombi „${tagPairs[0].pair}“ markiert aktuell ${money(tagPairs[0].metrics.netPnL)} in ${tagPairs[0].metrics.totalTrades} Trades.`, `Trades with “${tagPairs[0].pair}” returned ${money(tagPairs[0].metrics.netPnL)} across ${tagPairs[0].metrics.totalTrades} trades.`))
  }

  if (slippingTag?.current && slippingTag.pnlDelta < 0) {
    patterns.push(text(`Gegenüber der Vorperiode ist „${slippingTag.tag}“ um ${money(slippingTag.pnlDelta)} abgekippt. Das ist Drift, kein Zufall.`, `P&L for “${slippingTag.tag}” changed by ${money(slippingTag.pnlDelta)} from the previous period.`))
  }

  if (tradesCurrent.length > 0 && tagCoverage < 70) {
    patterns.push(text(`Nur ${clampNumber(tagCoverage)}% der Trades tragen Tags. Mehr Kontext-Tags würden Review und Compare deutlich schärfer machen.`, `${clampNumber(tagCoverage)}% of trades have tags. Add more context to improve comparisons.`))
  }

  return patterns.length
    ? patterns
    : [text('Noch zu wenig Daten für belastbare Muster. Mit mehr Trades werden Setups, Tage und Tags deutlich aussagekräftiger.', 'There are too few trades to identify reliable patterns across setups, days and tags.')]
}

export function buildPlaybook(tradesCurrent: Trade[], tradeTags: TradeTag[], tradesPrevious: Trade[], previousTags: TradeTag[], locale: JournalLocale = 'de'): string[] {
  const text = journalText(locale)
  const actions: string[] = []
  const metrics = getCoreMetrics(tradesCurrent)
  const money = (value: number) => formatCurrency(value, 0, metrics.currency, locale)
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
    actions.push(text(`Mehr Gewicht auf ${bestSetup.key}: aktuell der sauberste Cluster mit ${money(bestSetup.metrics.netPnL)}.`, `Review ${bestSetup.key}, the strongest setup in this period at ${money(bestSetup.metrics.netPnL)}.`))
  }

  if (worstTag && worstTag.netPnL < 0) {
    actions.push(text(`Vor jedem Entry Trigger gegen „${worstTag.tag}“ einbauen. Erst Regelcheck, dann Order.`, `Check for “${worstTag.tag}” and review your rules before entering.`))
  }

  if (slippingTag?.current && slippingTag.pnlDelta < 0) {
    actions.push(text(`„${slippingTag.tag}“ ist gegenüber der Vorperiode um ${money(slippingTag.pnlDelta)} abgerutscht. Dieses Tag vor dem Entry bewusst gegenprüfen.`, `P&L for “${slippingTag.tag}” changed by ${money(slippingTag.pnlDelta)}. Review this tag before the next entry.`))
  }

  if (losingPairs[0] && losingPairs[0].trades.length >= 2) {
    actions.push(text(`Die Verlust-Kombi „${losingPairs[0].pair}“ ist ein klarer Alarm. Lege für diese Kombination fest, wann du auf einen Einstieg verzichtest oder die Positionsgröße reduzierst.`, `Review the losses tagged “${losingPairs[0].pair}”. Set a rule for when to skip an entry or reduce size.`))
  }

  if (metrics.longestLossStreak >= 2) {
    actions.push(text(`Nach ${metrics.longestLossStreak} Verlusten in Folge eine Handelspause oder die halbe Positionsgröße nach deiner vorher festgelegten Regel.`, `After ${metrics.longestLossStreak} losses in a row, follow your rule for a break or smaller position size.`))
  }

  if (metrics.averageR !== null && metrics.averageR < 0.5) {
    actions.push(text('Gewinner aktiver managen: Teilgewinnstruktur prüfen und nicht zu früh Luft abdrehen.', 'Review how you manage winning trades and where you take partial profits.'))
  }

  if (tradesCurrent.length > 0 && tagCoverage < 80) {
    actions.push(text('Jeden Trade mit mindestens einem Prozess-Tag und einem Fehler- oder Kontext-Tag markieren. Sonst bleibt die Review-Logik halb blind.', 'Add a process tag and a mistake or context tag to each trade.'))
  }

  return actions.length
    ? actions.slice(0, 4)
    : [text('Die nächste Woche kann auf demselben Prozess laufen. Fokus: Selektivität halten und nur A-Setups aggressiver spielen.', 'Keep following your process next week and be selective about which setups you trade.')]
}


export function buildNoteMoments(notes: DailyNoteRow[], currentStart: Date, currentEnd: Date, locale: JournalLocale = 'de'): ReviewNoteMoment[] {
  const text = journalText(locale)
  return notes
    .filter((note) => {
      // trade_date is a written calendar day, not a UTC midnight instant.
      const firstDay = getTradeDateKey(currentStart.toISOString())!
      const lastDay = getTradeDateKey(currentEnd.toISOString())!
      return note.trade_date >= firstDay && note.trade_date <= lastDay
    })
    .slice(0, 3)
    .map((note) => ({
      title: note.title ?? 'Review-Notiz',
      meta: text(`${formatTradeDateLabel(note.trade_date, locale)} · Mood: ${note.mood ?? '—'} · Fokus: ${note.focus ?? '—'}`, `${formatTradeDateLabel(note.trade_date, locale)} · Mood: ${note.mood ?? '—'} · Focus: ${note.focus ?? '—'}`),
      body: note.note ?? 'Keine Notiz hinterlegt.',
    }))
}

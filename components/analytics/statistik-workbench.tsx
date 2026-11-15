'use client'

import { journalNumberLocale, journalText, type JournalLocale } from '@/lib/i18n/journal'
import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { DEFAULT_TRADE_TIMEZONE } from '@/lib/utils/trade-time'
import { formatRMultiple } from '@/lib/utils/calculations'
import { useMemo, useState, type ReactNode } from 'react'
import { CompareAndConquer } from '@/components/analytics/compare-and-conquer'
import { FilterDeck } from '@/components/analytics/filter-deck'
import { TagInsights } from '@/components/analytics/tag-insights'
import { DrawdownCurveCard } from '@/components/analytics/drawdown-curve-card'
import { EquityCurveCard } from '@/components/dashboard/equity-curve-card'
import { PnlCurveCard } from '@/components/dashboard/pnl-curve-card'
import type { FilterState, Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { buildDrawdownProfile, buildKillZonePerformance, buildSessionPerformance, buildTimeWindowPerformance, findBestEmotion, findBestMarket, getCoreMetrics, type DrawdownPhase, type SessionPerformanceRow, type TimeWindowPerformanceRow } from '@/lib/utils/analytics'
import { filterTrades } from '@/lib/utils/filters'
import { buildTagStats } from '@/lib/utils/tag-analytics'
import { getTradeTrustSummary, getTrustedTrades } from '@/lib/utils/trade-trust'
import { buildSetupPerformanceRows, type SetupPerformanceRow } from '@/lib/utils/setup-analytics'
import { getSetupPerformanceDisplay } from '@/lib/utils/setup-performance-display'
import { buildAccountContexts, getTradeAccountDisplayLabels, getTradeAccountLabel } from '@/lib/utils/account-context'
import { formatMoney, getMonetaryScopeMessage } from '@/lib/utils/currency'
import {
  getAnalyticsEvidenceState,
  getAnalyticsBucketEvidenceLabel,
  getAnalyticsBucketTone,
  getAnalyticsPeriodLabel,
  getAnalyticsScopeLabels,
  hasSufficientAnalyticsBucketEvidence,
  MIN_ANALYTICS_BUCKET_SIZE,
  MIN_ANALYTICS_SAMPLE_SIZE,
} from '@/lib/utils/statistics-scope'

const defaultFilters: FilterState = {
  account: 'Alle',
  session: 'Alle',
  concept: 'Alle',
  quality: 'Alle',
  emotion: 'Alle',
  setup: 'Alle',
  dateFrom: '',
  dateTo: '',
}

type DeepDiveMode = 'compare' | 'tags'
type StatistikLayer = 'rhythm' | 'setups' | 'psychology' | 'drawdown' | 'curves' | 'deepdive'

function normalizeStatistikLayer(value: string | null): StatistikLayer {
  if (value === 'rhythm' || value === 'setups' || value === 'psychology' || value === 'drawdown' || value === 'curves' || value === 'deepdive') return value
  return 'rhythm'
}

function getUniqueValues(values: string[]) {
  return Array.from(new Set(values.filter((value) => value && value !== '—'))).sort((a, b) => a.localeCompare(b, 'de'))
}

function formatCurrency(value: number, currency: string | null | undefined, locale: JournalLocale) {
  return formatMoney(value, currency, 0, locale)
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function formatDepthCurrency(value: number, currency: string | null | undefined, locale: JournalLocale) {
  return formatMoney(-Math.abs(value), currency, 0, locale)
}

function formatRowMoney(value: number, trades: number, currency: string | null | undefined, locale: JournalLocale) {
  const text = journalText(locale)
  if (!trades) return '—'
  return currency ? formatCurrency(value, currency, locale) : text('Gesperrt', 'Unavailable')
}

function formatAverageR(value: number | null, trades: number, rCount: number | undefined, locale: JournalLocale) {
  const text = journalText(locale)
  if (!trades) return '—'
  if (value === null || !Number.isFinite(value)) return text('R offen', 'R missing')
  if (rCount !== undefined && rCount === 0) return text('R offen', 'R missing')
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`
}

function formatDayLabel(days: number, locale: JournalLocale) {
  const text = journalText(locale)
  if (days <= 0) return 'intraday'
  return text(`${days} ${days === 1 ? 'Tag' : 'Tage'}`, `${days} ${days === 1 ? 'day' : 'days'}`)
}

function formatCompactDayLabel(days: number, locale: JournalLocale) {
  const text = journalText(locale)
  if (days <= 0) return 'intraday'
  return text(`${days}T`, `${days}d`)
}

function formatPhaseDate(value: string | null, locale: JournalLocale) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString(journalNumberLocale[locale], { day: '2-digit', month: '2-digit', timeZone: DEFAULT_TRADE_TIMEZONE })
}

function describePhaseRange(phase: DrawdownPhase, locale: JournalLocale) {
  const text = journalText(locale)
  if (phase.status === 'open') return text(`seit ${formatPhaseDate(phase.startAt, locale)} offen`, `Open since ${formatPhaseDate(phase.startAt, locale)}`)
  return text(`${formatPhaseDate(phase.startAt, locale)} bis ${formatPhaseDate(phase.recoveredAt, locale)}`, `${formatPhaseDate(phase.startAt, locale)} to ${formatPhaseDate(phase.recoveredAt, locale)}`)
}

function getCurrentStreakLabel(currentWinStreak: number, currentLossStreak: number, locale: JournalLocale) {
  const text = journalText(locale)
  if (currentLossStreak > 0) return text(`${currentLossStreak} rote Trades in Folge`, `${currentLossStreak} losing ${currentLossStreak === 1 ? 'trade' : 'trades'} in a row`)
  if (currentWinStreak > 0) return text(`${currentWinStreak} grüne Trades in Folge`, `${currentWinStreak} winning ${currentWinStreak === 1 ? 'trade' : 'trades'} in a row`)
  return text('Gerade kein Lauf', 'No active streak')
}

function getCurrentStreakDetail(currentWinStreak: number, currentLossStreak: number, locale: JournalLocale) {
  const text = journalText(locale)
  if (currentLossStreak >= 2) return text('Historisch laufende Verlustserie in der gewählten Auswahl.', 'The selected trades end with a losing streak.')
  if (currentLossStreak === 1) return text('Der letzte belastbare Trade war negativ.', 'The last trade included was a loss.')
  if (currentWinStreak >= 3) return text('Historisch laufende Gewinnserie in der gewählten Auswahl.', 'The selected trades end with a winning streak.')
  if (currentWinStreak > 0) return text('Der letzte belastbare Trade war positiv.', 'The last trade included was a win.')
  return text('Noch keine Serie.', 'No streak yet.')
}

function getTodayStatusLabel(status: string, locale: JournalLocale) {
  const text = journalText(locale)
  if (status === 'win') return text('Grün', 'Profit')
  if (status === 'loss') return text('Rot', 'Loss')
  if (status === 'breakeven') return text('Flat', 'Break-even')
  if (status === 'open') return text('Offen', 'Open')
  return text('Kein Trade', 'No trades')
}

function getStreakGuardrail(currentWinStreak: number, currentLossStreak: number, longestLossStreak: number, locale: JournalLocale) {
  const text = journalText(locale)
  if (currentLossStreak >= 2) return text('Aktuell überwiegt eine Verlustserie.', 'The selected trades end with a losing streak.')
  if (longestLossStreak >= 3) return text(`Historisch lag die längste Verlustserie bei ${longestLossStreak} Trades.`, `The longest losing streak was ${longestLossStreak} trades.`)
  if (currentWinStreak >= 3) return text('Aktuell liegt eine Gewinnserie vor.', 'The selected trades end with a winning streak.')
  return text('Keine auffällige Serie in der gewählten Auswahl.', 'No notable streak in the selected trades.')
}


const englishTimeWindowLabels: Readonly<Record<string, string>> = {
  pre: 'Before 08:00',
  'morning-open': '08:00–10:00',
  'late-morning': '10:00–12:00',
  midday: '12:00–14:00',
  afternoon: '14:00–16:00',
  late: 'From 16:00',
}

function formatTimeWindowLabel(row: TimeWindowPerformanceRow, locale: JournalLocale) {
  return locale === 'en' ? englishTimeWindowLabels[row.key] ?? row.label : row.label
}

function getTimeWindowSummaryLead(bestWindow: TimeWindowPerformanceRow | null, weakestWindow: TimeWindowPerformanceRow | null, locale: JournalLocale) {
  const text = journalText(locale)
  if (bestWindow && weakestWindow && bestWindow.key !== weakestWindow.key) {
    return text(`${formatTimeWindowLabel(bestWindow, locale)} war historisch stärker; ${formatTimeWindowLabel(weakestWindow, locale)} schwächer.`, `${formatTimeWindowLabel(bestWindow, locale)} had the highest P&L. ${formatTimeWindowLabel(weakestWindow, locale)} had the lowest.`)
  }

  if (bestWindow) return text(`${formatTimeWindowLabel(bestWindow, locale)} war historisch das stärkste ausreichend besetzte Fenster.`, `${formatTimeWindowLabel(bestWindow, locale)} had the highest P&L among windows with enough trades.`)
  return text(`Je Zeitfenster sind mindestens ${MIN_ANALYTICS_BUCKET_SIZE} Trades nötig.`, `Each time window needs at least ${MIN_ANALYTICS_BUCKET_SIZE} trades.`)
}

function getTimeWindowSummaryDetail(bestWindow: TimeWindowPerformanceRow | null, weakestWindow: TimeWindowPerformanceRow | null, locale: JournalLocale) {
  const text = journalText(locale)
  if (bestWindow && weakestWindow && bestWindow.key !== weakestWindow.key) {
    return text(`Stärkstes Fenster: ${formatCurrency(bestWindow.netPnL, bestWindow.currency, locale)} bei ${bestWindow.winRate.toFixed(0)}% Trefferquote. Schwächstes Fenster: ${formatCurrency(weakestWindow.netPnL, weakestWindow.currency, locale)}.`, `Highest: ${formatCurrency(bestWindow.netPnL, bestWindow.currency, locale)} with a ${bestWindow.winRate.toFixed(0)}% win rate. Lowest: ${formatCurrency(weakestWindow.netPnL, weakestWindow.currency, locale)}.`)
  }

  if (bestWindow) return text(`${formatCurrency(bestWindow.netPnL, bestWindow.currency, locale)} bei ${bestWindow.winRate.toFixed(0)}% Trefferquote.`, `${formatCurrency(bestWindow.netPnL, bestWindow.currency, locale)} with a ${bestWindow.winRate.toFixed(0)}% win rate.`)
  return text('Mehr Daten nötig.', 'More trades needed.')
}

function getTimeWindowGuardrail(weakestWindow: TimeWindowPerformanceRow | null, locale: JournalLocale) {
  const text = journalText(locale)
  if (!weakestWindow) return text('Zu wenig Daten für einen historischen Zeitfenstervergleich.', 'Too few trades to compare time windows.')
  if (weakestWindow.netPnL < 0) return text(`${formatTimeWindowLabel(weakestWindow, locale)} hatte in der gewählten Auswahl das schwächste historische Ergebnis.`, `${formatTimeWindowLabel(weakestWindow, locale)} had the lowest P&L in the selected trades.`)
  return text(`${formatTimeWindowLabel(weakestWindow, locale)} hatte in der gewählten Auswahl das niedrigste historische Ergebnis.`, `${formatTimeWindowLabel(weakestWindow, locale)} had the lowest P&L in the selected trades.`)
}


function getDrawdownLead(profile: ReturnType<typeof buildDrawdownProfile>, locale: JournalLocale) {
  const text = journalText(locale)
  if (profile.activePhase) return text(`Aktuell läuft noch eine Delle von ${formatDepthCurrency(profile.currentDepth, profile.monetaryScope.currency, locale)}.`, `Current drawdown from the peak: ${formatDepthCurrency(profile.currentDepth, profile.monetaryScope.currency, locale)}.`)
  if (profile.deepestPhase) return text(`Tiefste Delle im aktuellen Fenster: ${formatDepthCurrency(profile.maxDepth, profile.monetaryScope.currency, locale)}.`, `Deepest drawdown in this period: ${formatDepthCurrency(profile.maxDepth, profile.monetaryScope.currency, locale)}.`)
  return text('Noch wenig P&L-Daten.', 'Too few P&L results to assess drawdown.')
}

function getDrawdownDetail(profile: ReturnType<typeof buildDrawdownProfile>, locale: JournalLocale) {
  const text = journalText(locale)
  if (profile.activePhase) {
    return text(`Offen seit ${formatPhaseDate(profile.activePhase.startAt, locale)} über ${profile.activePhase.tradeCount} Trades. Tiefster Punkt bisher: ${formatDepthCurrency(profile.activePhase.depth, profile.monetaryScope.currency, locale)}.`, `Open since ${formatPhaseDate(profile.activePhase.startAt, locale)} across ${profile.activePhase.tradeCount} trades. Lowest point so far: ${formatDepthCurrency(profile.activePhase.depth, profile.monetaryScope.currency, locale)}.`)
  }

  if (profile.longestPhase) {
    return text(`Längste Erholungsphase: ${formatDayLabel(profile.longestPhase.durationDays, locale)} über ${profile.longestPhase.tradeCount} Trades.`, `Longest recovery: ${formatDayLabel(profile.longestPhase.durationDays, locale)} across ${profile.longestPhase.tradeCount} trades.`)
  }

  return text('Mehr Daten nötig.', 'More trades needed.')
}

function getDrawdownGuardrail(profile: ReturnType<typeof buildDrawdownProfile>, locale: JournalLocale) {
  const text = journalText(locale)
  if (profile.activePhase && profile.activePhase.tradeCount >= 2) {
    return text('In der gewählten Auswahl besteht eine offene Drawdown-Phase.', 'The selected trades end below the previous peak.')
  }

  if (profile.longestPhase && profile.longestPhase.durationDays >= 3) {
    return text(`Die längste historische Erholung dauerte ${formatDayLabel(profile.longestPhase.durationDays, locale)}.`, `The longest recovery took ${formatDayLabel(profile.longestPhase.durationDays, locale)}.`)
  }

  if (profile.phaseCount >= 3) {
    return text('In der gewählten Auswahl traten mehrere Drawdown-Phasen auf.', 'The selected trades show several drawdowns.')
  }

  return text('Keine auffällige Drawdown-Serie in der gewählten Auswahl.', 'No notable drawdown pattern in the selected trades.')
}

function pickDrawdownHighlights(profile: ReturnType<typeof buildDrawdownProfile>) {
  const highlights: DrawdownPhase[] = []

  const pushUnique = (phase: DrawdownPhase | null) => {
    if (!phase || highlights.some((item) => item.key === phase.key)) return
    highlights.push(phase)
  }

  pushUnique(profile.activePhase)
  pushUnique(profile.deepestPhase)
  pushUnique(profile.longestPhase)

  for (const phase of [...profile.phases].reverse()) {
    pushUnique(phase)
    if (highlights.length >= 3) break
  }

  return highlights.slice(0, 3)
}

function getBucketSummaryLead(bestRow: SessionPerformanceRow | null, weakestRow: SessionPerformanceRow | null, fallback: string, locale: JournalLocale) {
  const text = journalText(locale)
  if (bestRow && weakestRow && bestRow.key !== weakestRow.key) {
    return text(`${bestRow.label} war historisch stärker; ${weakestRow.label} schwächer.`, `${bestRow.label} had the highest P&L. ${weakestRow.label} had the lowest.`)
  }

  if (bestRow) return text(`${bestRow.label} war historisch am stärksten.`, `${bestRow.label} had the highest P&L.`)
  return fallback
}

function getBucketSummaryDetail(bestRow: SessionPerformanceRow | null, weakestRow: SessionPerformanceRow | null, fallback: string, locale: JournalLocale) {
  const text = journalText(locale)
  if (bestRow && weakestRow && bestRow.key !== weakestRow.key) {
    return text(`Stärkster Block: ${formatCurrency(bestRow.netPnL, bestRow.currency, locale)} bei ${bestRow.winRate.toFixed(0)}% Trefferquote. Schwächster Block: ${formatCurrency(weakestRow.netPnL, weakestRow.currency, locale)}.`, `Highest: ${formatCurrency(bestRow.netPnL, bestRow.currency, locale)} with a ${bestRow.winRate.toFixed(0)}% win rate. Lowest: ${formatCurrency(weakestRow.netPnL, weakestRow.currency, locale)}.`)
  }

  if (bestRow) return text(`${formatCurrency(bestRow.netPnL, bestRow.currency, locale)} bei ${bestRow.winRate.toFixed(0)}% Trefferquote.`, `${formatCurrency(bestRow.netPnL, bestRow.currency, locale)} with a ${bestRow.winRate.toFixed(0)}% win rate.`)
  return fallback
}


export function StatistikWorkbench({ trades, tradeTags, setupTitles, initialLayer, initialSetup }: { trades: Trade[]; tradeTags: TradeTag[]; setupTitles: string[]; initialLayer?: string; initialSetup?: string }) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const [filters, setFilters] = useState(() => ({ ...defaultFilters, setup: initialSetup || 'Alle' }))
  const [deepDiveMode, setDeepDiveMode] = useState<DeepDiveMode>('compare')
  const [activeLayer, setActiveLayer] = useState<StatistikLayer>(() => normalizeStatistikLayer(initialLayer ?? null))
  const [showFilters, setShowFilters] = useState(false)
  const [showQuality, setShowQuality] = useState(false)

  const filteredTrades = useMemo(() => filterTrades(trades, filters), [filters, trades])
  const trustedTrades = useMemo(() => getTrustedTrades(filteredTrades), [filteredTrades])
  const trustSummary = useMemo(() => getTradeTrustSummary(filteredTrades), [filteredTrades])
  const accountLabels = useMemo(() => getTradeAccountDisplayLabels(trades, locale), [trades, locale])
  const accountDisplayLabel = accountLabels.get(filters.account) ?? filters.account
  const scopeLabels = useMemo(() => getAnalyticsScopeLabels(filters, locale, accountDisplayLabel), [filters, locale, accountDisplayLabel])
  const scopePeriodLabel = useMemo(() => getAnalyticsPeriodLabel(filters, locale), [filters, locale])
  const evidenceState = getAnalyticsEvidenceState(filteredTrades.length, trustedTrades.length)
  const resetEvaluation = () => setFilters(defaultFilters)
  const filteredTradeIds = useMemo(() => new Set(trustedTrades.map((trade) => trade.id)), [trustedTrades])
  const filteredTags = useMemo(() => tradeTags.filter((item) => filteredTradeIds.has(item.trade_id)), [filteredTradeIds, tradeTags])
  const bestMarket = useMemo(() => evidenceState === 'descriptive' ? findBestMarket(trustedTrades) : undefined, [evidenceState, trustedTrades])
  const bestEmotion = useMemo(() => evidenceState === 'descriptive' ? findBestEmotion(trustedTrades) : undefined, [evidenceState, trustedTrades])
  const tagStats = useMemo(() => buildTagStats(trustedTrades, filteredTags), [trustedTrades, filteredTags])
  const filterOptions = useMemo(
    () => ({
      accounts: getUniqueValues(trades.map((trade) => getTradeAccountLabel(trade))),
      sessions: getUniqueValues(trades.map((trade) => trade.session)),
      concepts: getUniqueValues(trades.map((trade) => trade.concept)),
      qualities: getUniqueValues(trades.map((trade) => trade.quality)),
      emotions: getUniqueValues(trades.map((trade) => trade.emotion)),
      setups: getUniqueValues([...setupTitles, ...trades.map((trade) => trade.setup)]),
    }),
    [setupTitles, trades],
  )
  const accountContexts = useMemo(() => buildAccountContexts(trustedTrades), [trustedTrades])
  const activeAccount = filters.account === 'Alle' ? null : accountContexts.find((account) => account.label === filters.account) ?? null
  const metrics = useMemo(() => getCoreMetrics(trustedTrades), [trustedTrades])
  const timeWindowPerformance = useMemo(() => buildTimeWindowPerformance(trustedTrades), [trustedTrades])
  const sessionPerformance = useMemo(() => buildSessionPerformance(trustedTrades), [trustedTrades])
  const killZonePerformance = useMemo(() => buildKillZonePerformance(trustedTrades), [trustedTrades])
  const drawdownProfile = useMemo(() => buildDrawdownProfile(trustedTrades), [trustedTrades])
  const setupPerformanceRows = useMemo(() => buildSetupPerformanceRows(setupTitles, trustedTrades), [setupTitles, trustedTrades])
  const canCompareSetupMoney = metrics.monetaryScope.isComparable
  const displaySetupRows = canCompareSetupMoney
    ? setupPerformanceRows
    : [...setupPerformanceRows].sort((left, right) => left.title.localeCompare(right.title, journalNumberLocale[locale]))
  const comparableSetups = canCompareSetupMoney
    ? setupPerformanceRows.filter((row) => row.currency === metrics.currency && row.trades >= MIN_ANALYTICS_BUCKET_SIZE)
    : []
  const setupBestRow = comparableSetups[0] ?? null
  const setupWeakestRow = [...comparableSetups].sort((left, right) => left.netPnL - right.netPnL || right.trades - left.trades)[0] ?? null

  return (
    <div lang={locale} className="space-y-10">
      <section className="rounded-[26px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.32)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-white">{text('Filter', 'Filters')}</span>
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/65 transition hover:border-orange-300/25 hover:text-orange-100"
            aria-expanded={showFilters}
          >
            {showFilters ? text('Filter ausblenden', 'Hide filters') : text('Filter anzeigen', 'Show filters')}
          </button>
        </div>
        <div className="mt-4 rounded-2xl border border-orange-300/15 bg-black/20 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-orange-200/65">{text('Deine Auswahl', 'Your selection')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(scopeLabels.length ? scopeLabels : [text('Gesamtes Journal', 'Entire journal')]).map((label) => (
                  <span key={label} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
              <span>{text(`${filteredTrades.length} passend`, `${filteredTrades.length} matched`)}</span>
              <span aria-hidden="true">·</span>
              <span>{text(`${trustedTrades.length} berücksichtigt`, `${trustedTrades.length} included`)}</span>
              {scopeLabels.length ? (
                <button
                  type="button"
                  onClick={resetEvaluation}
                  className="rounded-full border border-orange-300/20 bg-orange-400/10 px-3 py-1.5 text-orange-100 transition hover:border-orange-300/40"
                >
                  {text('Auswertung zurücksetzen', 'Reset analysis')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {showFilters ? (
          <div className="mt-4">
            <FilterDeck locale={locale} accountLabels={accountLabels} filters={filters} options={filterOptions} onChange={setFilters} onReset={resetEvaluation} />
          </div>
        ) : null}
      </section>

      {evidenceState === 'empty' || evidenceState === 'untrusted' ? (
        <section className="rounded-[30px] border border-orange-300/20 bg-orange-300/[0.07] p-7 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.24em] text-orange-200/65">{text('Keine auswertbare Stichprobe', 'No trades available to analyse')}</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            {evidenceState === 'empty'
              ? text('Keine Trades passen zu deinen Filtern.', 'No trades match your filters.')
              : text('Für diese Auswahl fehlen abgeschlossene Trades mit auswertbaren Ergebnisangaben.', 'The selection has no completed trades with usable results.')}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/60">
            {text('Es werden keine Trefferquote, Erwartung, Rankings oder Strategieaussagen angezeigt. Die Journalhistorie bleibt unverändert.', 'Win rate, expectancy and rankings require completed trades with usable results.')}
          </p>
          {scopeLabels.length ? (
            <button
              type="button"
              onClick={resetEvaluation}
              className="mt-5 rounded-full border border-orange-300/30 bg-orange-400/15 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-300/50"
            >
              {text('Auswertung zurücksetzen', 'Reset analysis')}
            </button>
          ) : null}
        </section>
      ) : (
      <>

      <section className="rounded-[30px] border border-orange-400/15 bg-white/5 p-7 shadow-2xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <h2 className="eq-display text-2xl text-orange-300">{text('Statistik', 'Statistics')}</h2>
            <p className="mt-2 text-sm leading-6 text-white/55">{text('Ergebnisse deiner ausgewählten Trades. Ändere oben die Filter, um Zeiträume oder Setups zu vergleichen.', 'Results for the selected trades. Use the filters to compare periods or setups.')}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowQuality((current) => !current)}
            className="w-fit rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/60 transition hover:border-orange-300/25 hover:text-orange-100"
            aria-expanded={showQuality}
          >
            {showQuality ? text('Qualität ausblenden', 'Hide data quality') : text('Qualität anzeigen', 'Show data quality')}
          </button>
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-3">
          <MetricCard label="P&L" value={metrics.monetaryScope.isComparable ? formatCurrency(metrics.netPnL, metrics.currency, locale) : text('Gesperrt', 'Unavailable')} detail={activeAccount ? accountDisplayLabel : text(`${trustedTrades.length} Trades`, `${trustedTrades.length} trades`)} tone={metrics.monetaryScope.isComparable ? 'text-emerald-300' : 'text-orange-200'} />
          <MetricCard label={text('Trefferquote', 'Win rate')} value={formatPercent(metrics.winRate)} detail={activeAccount ? text(`${activeAccount.trades} Konto-Trades`, `${activeAccount.trades} trades in this account`) : bestEmotion ? bestEmotion.emotion : text(`${trustedTrades.length} berücksichtigte Trades`, `${trustedTrades.length} trades included`)} tone="text-white" />
          <MetricCard label={text('Ø Ergebnis in R', 'Average result in R')} value={formatRMultiple(metrics.expectancyR, 2, locale)} detail={text(`${metrics.rCount} von ${trustedTrades.length} Abschlüssen mit R-Wert`, `R recorded for ${metrics.rCount} of ${trustedTrades.length} closed trades`)} tone="text-orange-200" />
        </div>

        {!metrics.monetaryScope.isComparable && metrics.monetaryScope.kind !== 'empty' ? (
          <div className="mt-5 rounded-2xl border border-orange-300/25 bg-orange-300/10 px-4 py-3 text-sm leading-6 text-orange-100">
            {getMonetaryScopeMessage(metrics.monetaryScope, locale)} {text('Nicht-monetäre Kennzahlen bleiben sichtbar; P&L-Summen, Kurven und Rankings sind deaktiviert.', 'Win rate and R are still available. P&L totals, charts and rankings require a single supported currency.')}
          </div>
        ) : null}

        {showQuality ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <TrustTile label={text('Berücksichtigt', 'Included')} value={`${trustSummary.trustedTrades}/${trustSummary.totalTrades}`} tone="text-emerald-300" />
            <TrustTile label={text('Unvollständig', 'Incomplete')} value={String(trustSummary.incompleteTrades)} tone="text-emerald-200" />
            <TrustTile label={text('Ohne P&L', 'No P&L')} value={String(trustSummary.completeWithoutPnL)} tone="text-orange-100/85" />
          </div>
        ) : null}
      </section>

      {evidenceState === 'insufficient' ? (
        <section className="rounded-[28px] border border-sky-300/20 bg-sky-300/[0.06] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-sky-200/70">{text('Kleine Datengrundlage', 'Small sample')}</p>
          <h3 className="mt-3 text-xl font-semibold text-white">{text('Für Vergleiche liegen noch zu wenige Trades vor.', 'Too few trades for comparisons.')}</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/60">
            {text(
              `Aktuell liegen ${trustedTrades.length} berücksichtigte Trades vor. Zeitraum: ${scopePeriodLabel}. Ab ${MIN_ANALYTICS_SAMPLE_SIZE} belastbaren Trades werden historische Vergleiche angezeigt; daraus folgt weiterhin keine Strategie- oder Ausführungsempfehlung.`,
              `${trustedTrades.length} trades included · ${scopePeriodLabel}. Historical comparisons require at least ${MIN_ANALYTICS_SAMPLE_SIZE} trades with usable results.`,
            )}
          </p>
        </section>
      ) : (
      <>

      <section className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_14px_42px_rgba(0,0,0,0.26)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h3 className="eq-display text-xl text-white">{text('Auswertung', 'Analysis')}</h3>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-2xl lg:justify-end">
            <LayerButton active={activeLayer === 'rhythm'} onClick={() => setActiveLayer('rhythm')}>{text('Zeiten', 'Trading times')}</LayerButton>
            <LayerButton active={activeLayer === 'setups'} onClick={() => setActiveLayer('setups')}>Setups</LayerButton>
            <LayerButton active={activeLayer === 'psychology'} onClick={() => setActiveLayer('psychology')}>{text('Psyche', 'Psychology')}</LayerButton>
            <LayerButton active={activeLayer === 'drawdown'} onClick={() => setActiveLayer('drawdown')}>Drawdown</LayerButton>
            <LayerButton active={activeLayer === 'curves'} onClick={() => setActiveLayer('curves')}>{text('Kurven', 'Charts')}</LayerButton>
            <LayerButton active={activeLayer === 'deepdive'} onClick={() => setActiveLayer('deepdive')}>{text('Mehr', 'More')}</LayerButton>
          </div>
        </div>
      </section>

      {activeLayer === 'rhythm' ? (
      <>
      <section className="rounded-[28px] border border-orange-400/16 bg-orange-400/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h3 className="text-xl font-semibold text-white">{text('Zeitfenster', 'Time windows')}</h3>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 lg:max-w-sm">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Signal</p>
            <EvidenceCaption locale={locale} trades={trustedTrades.length} period={scopePeriodLabel} />
            <p className="mt-2 text-lg font-semibold text-orange-100">{getTimeWindowSummaryLead(timeWindowPerformance.bestWindow, timeWindowPerformance.weakestWindow, locale)}</p>
            <p className="mt-2 text-sm leading-6 text-white/55">{getTimeWindowSummaryDetail(timeWindowPerformance.bestWindow, timeWindowPerformance.weakestWindow, locale)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-3">
          {timeWindowPerformance.rows.map((row) => (
            <TimeWindowCard locale={locale} key={row.key} row={row} />
          ))}
        </div>

        <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Historische Einordnung', 'Historical context')}</p>
          <h4 className="mt-3 text-2xl font-semibold text-white">{getTimeWindowGuardrail(timeWindowPerformance.weakestWindow, locale)}</h4>
          <p className="mt-3 text-sm leading-7 text-white/60">
            {text(`Ausgewertet: ${timeWindowPerformance.coveredTrades} Trades mit Uhrzeit (Berlin).`, `${timeWindowPerformance.coveredTrades} trades with a recorded time (Berlin).`)}{' '}
            {timeWindowPerformance.missingTrades > 0
              ? text(`${timeWindowPerformance.missingTrades} Trades noch ohne Uhrzeit.`, `${timeWindowPerformance.missingTrades} trades have no time recorded.`)
              : text('Uhrzeiten vollständig.', 'All trade times are present.')}
          </p>
        </div>
      </section>


      <section className="grid gap-6 xl:grid-cols-2">
        <InsightBucketSection
            locale={locale}
          eyebrow="Sessions"
          title="Sessions"
          subtitle=""
          focusLabel="Signal"
          lead={getBucketSummaryLead(sessionPerformance.bestRow, sessionPerformance.weakestRow, text('Noch kein klares Session-Muster.', 'Too few trades to compare sessions.'), locale)}
          detail={getBucketSummaryDetail(sessionPerformance.bestRow, sessionPerformance.weakestRow, text('Mehr Trades schärfen das Signal.', 'Add more trades to compare the sessions.'), locale)}
          rows={sessionPerformance.rows}
          evidenceLabel={text(`${trustedTrades.length} berücksichtigte Trades · ${scopePeriodLabel}`, `${trustedTrades.length} trades included · ${scopePeriodLabel}`)}
        />
        <InsightBucketSection
            locale={locale}
          eyebrow="Kill Zones"
          title="Kill Zones"
          subtitle=""
          focusLabel="Signal"
          lead={getBucketSummaryLead(killZonePerformance.bestRow, killZonePerformance.weakestRow, text('Noch kein klares Kill-Zone-Muster.', 'Too few trades to compare kill zones.'), locale)}
          detail={getBucketSummaryDetail(killZonePerformance.bestRow, killZonePerformance.weakestRow, text('Aus Uhrzeiten abgeleitet.', 'Based on Berlin trade times.'), locale)}
          rows={killZonePerformance.rows}
          evidenceLabel={text(`${trustedTrades.length} berücksichtigte Trades · ${scopePeriodLabel}`, `${trustedTrades.length} trades included · ${scopePeriodLabel}`)}
        />
      </section>
      </>
      ) : null}

      {activeLayer === 'setups' ? (
      <section className="rounded-[28px] border border-orange-400/16 bg-orange-400/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h3 className="text-xl font-semibold text-white">Setups</h3>
            <p className="mt-2 text-sm leading-6 text-white/55">{text('Historische Unterschiede zwischen ausreichend besetzten Setups.', 'Historical results for setups with enough trades to compare.')}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 lg:max-w-sm">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Signal</p>
            <EvidenceCaption locale={locale} trades={trustedTrades.length} period={scopePeriodLabel} />
            <p className="mt-2 text-lg font-semibold text-orange-100">{canCompareSetupMoney
              ? getSetupSummaryLead(setupBestRow, setupWeakestRow, locale)
              : text('Für den Setup-Vergleich müssen die Ergebnisse in derselben Währung vorliegen.', 'Setup P&L can only be compared when results use the same currency.')}</p>
            <p className="mt-2 text-sm leading-6 text-white/55">{canCompareSetupMoney ? getSetupSummaryDetail(setupBestRow, setupWeakestRow, locale) : getMonetaryScopeMessage(metrics.monetaryScope, locale)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {displaySetupRows.length ? (
            displaySetupRows.map((row) => <SetupPerformanceRowCard locale={locale} key={row.title} row={row} />)
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/55">{text('Noch keine Setup-Daten.', 'No setup data yet.')}</div>
          )}
        </div>
      </section>
      ) : null}

      {activeLayer === 'psychology' ? (
      <section className="rounded-[28px] border border-emerald-400/18 bg-emerald-400/[0.06] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h3 className="text-xl font-semibold text-white">Streaks</h3>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 lg:max-w-sm">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Signal</p>
            <EvidenceCaption locale={locale} trades={trustedTrades.length} period={scopePeriodLabel} />
            <p className="mt-2 text-lg font-semibold text-emerald-200">{getCurrentStreakLabel(metrics.currentWinStreak, metrics.currentLossStreak, locale)}</p>
            <p className="mt-2 text-sm leading-6 text-white/55">{getCurrentStreakDetail(metrics.currentWinStreak, metrics.currentLossStreak, locale)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-5">
          <MetricCard
            label={text('Gewinnserie aktuell', 'Current winning streak')}
            value={String(metrics.currentWinStreak)}
            detail={metrics.currentWinStreak > 0 ? text('Trades hintereinander im Plus', 'Winning trades in a row') : text('Keine aktive Gewinnserie', 'No active winning streak')}
            tone="text-emerald-300"
          />
          <MetricCard
            label={text('Verlustserie aktuell', 'Current losing streak')}
            value={String(metrics.currentLossStreak)}
            detail={metrics.currentLossStreak > 0 ? text('Trades hintereinander im Minus', 'Losing trades in a row') : text('Keine aktive Verlustserie', 'No active losing streak')}
            tone={metrics.currentLossStreak >= 2 ? 'text-red-300' : 'text-white'}
          />
          <MetricCard
            label={text('Längste Gewinnserie', 'Longest winning streak')}
            value={String(metrics.longestWinStreak)}
            detail={text('Bester Lauf', 'Best streak')}
            tone="text-orange-200"
          />
          <MetricCard
            label={text('Längste Verlustserie', 'Longest losing streak')}
            value={String(metrics.longestLossStreak)}
            detail={text('Härteste Druckphase', 'Longest run of losses')}
            tone={metrics.longestLossStreak >= 2 ? 'text-red-300' : 'text-white'}
          />
          <MetricCard
            label={text('Heute', 'Today')}
            value={getTodayStatusLabel(metrics.todayStatus, locale)}
            detail={metrics.todayTrades ? `${metrics.todayTrades} Trade${metrics.todayTrades === 1 ? '' : 's'}` : text('Noch kein Trade', 'No trades yet')}
            tone={metrics.todayStatus === 'win' ? 'text-emerald-300' : metrics.todayStatus === 'loss' ? 'text-red-300' : 'text-white'}
          />
        </div>

        <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Historische Einordnung', 'Historical context')}</p>
          <h4 className="mt-3 text-2xl font-semibold text-white">{getStreakGuardrail(metrics.currentWinStreak, metrics.currentLossStreak, metrics.longestLossStreak, locale)}</h4>
          <p className="mt-3 text-sm leading-7 text-white/60">
            Max Drawdown: {formatCurrency(-metrics.maxDrawdown, metrics.currency, locale)}.
          </p>
        </div>
      </section>
      ) : null}

      {activeLayer === 'drawdown' ? (
      <section className="rounded-[28px] border border-sky-400/18 bg-sky-400/[0.06] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h3 className="text-xl font-semibold text-white">Drawdown</h3>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 lg:max-w-sm">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Signal</p>
            <EvidenceCaption locale={locale} trades={trustedTrades.length} period={scopePeriodLabel} />
            <p className="mt-2 text-lg font-semibold text-sky-100">{getDrawdownLead(drawdownProfile, locale)}</p>
            <p className="mt-2 text-sm leading-6 text-white/55">{getDrawdownDetail(drawdownProfile, locale)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-5">
          <MetricCard
            label={text('Tiefste Delle', 'Deepest drawdown')}
            value={formatDepthCurrency(drawdownProfile.maxDepth, drawdownProfile.monetaryScope.currency, locale)}
            detail={drawdownProfile.deepestPhase ? text(`${describePhaseRange(drawdownProfile.deepestPhase, locale)} · ${drawdownProfile.deepestPhase.tradeCount} Trades`, `${describePhaseRange(drawdownProfile.deepestPhase, locale)} · ${drawdownProfile.deepestPhase.tradeCount} trades`) : text('Noch keine belastbare Drawdown-Phase', 'No drawdown to report yet')}
            tone="text-sky-200"
          />
          <MetricCard
            label={text('Aktuelle Delle', 'Current drawdown')}
            value={drawdownProfile.activePhase ? formatDepthCurrency(drawdownProfile.currentDepth, drawdownProfile.monetaryScope.currency, locale) : metrics.monetaryScope.isComparable ? formatCurrency(0, metrics.currency, locale) : text('Gesperrt', 'Unavailable')}
            detail={drawdownProfile.activePhase ? text(`Offen seit ${formatPhaseDate(drawdownProfile.activePhase.startAt, locale)}`, `Open since ${formatPhaseDate(drawdownProfile.activePhase.startAt, locale)}`) : text('Keine offene Delle', 'No open drawdown')}
            tone={drawdownProfile.activePhase ? 'text-red-300' : 'text-white'}
          />
          <MetricCard
            label={text('Längste Erholung', 'Longest recovery')}
            value={formatCompactDayLabel(drawdownProfile.longestDurationDays, locale)}
            detail={drawdownProfile.longestPhase ? text(`${drawdownProfile.longestPhase.tradeCount} Trades bis zurück zum Hoch`, `${drawdownProfile.longestPhase.tradeCount} trades to regain the peak`) : text('Noch keine Erholung', 'No recovery yet')}
            tone="text-orange-200"
          />
          <MetricCard
            label={text('Dellen im Fenster', 'Drawdowns in this period')}
            value={String(drawdownProfile.phaseCount)}
            detail={drawdownProfile.phaseCount > 0 ? text(`${drawdownProfile.recoveredPhaseCount} bereits erholt`, `${drawdownProfile.recoveredPhaseCount} recovered`) : text('Noch keine Delle', 'No drawdown yet')}
            tone="text-white"
          />
        </div>

        {pickDrawdownHighlights(drawdownProfile).length > 0 ? (
          <div className="mt-6 grid gap-5 xl:grid-cols-3">
            {pickDrawdownHighlights(drawdownProfile).map((phase, index) => (
              <DrawdownPhaseCard locale={locale}
                key={phase.key}
                phase={phase}
                currency={drawdownProfile.monetaryScope.currency}
                title={
                  phase.status === 'open'
                    ? text('Offene Delle', 'Open drawdown')
                    : drawdownProfile.deepestPhase?.key === phase.key
                      ? text('Tiefste Delle', 'Deepest drawdown')
                      : drawdownProfile.longestPhase?.key === phase.key
                        ? text('Längste Erholung', 'Longest recovery')
                        : text(`Letzte Phase ${index + 1}`, `Recent drawdown ${index + 1}`)
                }
              />
            ))}
          </div>
        ) : null}

        <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Historische Einordnung', 'Historical context')}</p>
          <h4 className="mt-3 text-2xl font-semibold text-white">{getDrawdownGuardrail(drawdownProfile, locale)}</h4>
          <p className="mt-3 text-sm leading-7 text-white/60">
            {text(`Drawdown-Phasen im aktuellen Fenster: ${drawdownProfile.phaseCount}.`, `Drawdowns in this period: ${drawdownProfile.phaseCount}.`)} {drawdownProfile.activePhase ? text(`Aktuelle Delle seit ${formatPhaseDate(drawdownProfile.activePhase.startAt, locale)}.`, `Current drawdown began on ${formatPhaseDate(drawdownProfile.activePhase.startAt, locale)}.`) : text('Keine offene Delle.', 'No open drawdown.')}
          </p>
        </div>
      </section>
      ) : null}

      {activeLayer === 'curves' ? (
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.40)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h3 className="text-xl font-semibold text-white">{text('Kurven', 'Charts')}</h3>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 lg:max-w-sm">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Signal</p>
            <EvidenceCaption locale={locale} trades={trustedTrades.length} period={scopePeriodLabel} />
            <p className="mt-2 text-lg font-semibold text-white">Equity</p>
            <p className="mt-2 text-sm leading-6 text-white/55">{text('P&L und Drawdown', 'P&L and drawdown')}</p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <EquityCurveCard locale={locale} trades={trustedTrades} />
          <PnlCurveCard locale={locale} trades={trustedTrades} />
          <DrawdownCurveCard locale={locale} trades={trustedTrades} />
        </div>
      </section>
      ) : null}

      {activeLayer === 'deepdive' ? (
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.40)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-white">{text('Mehr', 'More')}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <ToggleButton active={deepDiveMode === 'compare'} onClick={() => setDeepDiveMode('compare')}>
              {text('Vergleiche', 'Compare')}
            </ToggleButton>
            <ToggleButton active={deepDiveMode === 'tags'} onClick={() => setDeepDiveMode('tags')}>
              Tags
            </ToggleButton>
          </div>
        </div>

        <div className="mt-5">
          {deepDiveMode === 'compare' ? <CompareAndConquer locale={locale} trades={trustedTrades} tradeTags={filteredTags} /> : <TagInsights locale={locale} rows={tagStats.slice(0, 8)} />}
        </div>
      </section>
      ) : null}
      </>
      )}
      </>
      )}
    </div>
  )
}


function getSetupSummaryLead(bestRow: SetupPerformanceRow | null, weakestRow: SetupPerformanceRow | null, locale: JournalLocale) {
  const text = journalText(locale)
  if (bestRow && weakestRow && bestRow.title !== weakestRow.title) return text(`${bestRow.title} war historisch stärker; ${weakestRow.title} schwächer.`, `${bestRow.title} had the highest P&L. ${weakestRow.title} had the lowest.`)
  if (bestRow) return text(`${bestRow.title} war historisch vorne.`, `${bestRow.title} had the highest P&L.`)
  return text(`Je Setup sind mindestens ${MIN_ANALYTICS_BUCKET_SIZE} Trades nötig.`, `Each setup needs at least ${MIN_ANALYTICS_BUCKET_SIZE} trades.`)
}

function getSetupSummaryDetail(bestRow: SetupPerformanceRow | null, weakestRow: SetupPerformanceRow | null, locale: JournalLocale) {
  const text = journalText(locale)
  if (bestRow && weakestRow && bestRow.title !== weakestRow.title) {
    const best = getSetupPerformanceDisplay(bestRow, locale)
    return text(`${best.pnl} bei ${best.winRate} Trefferquote. PF ${best.profitFactor}. Schwächstes Setup: ${getSetupPerformanceDisplay(weakestRow, locale).pnl}.`, `${best.pnl} with a ${best.winRate} win rate and a profit factor of ${best.profitFactor}. Lowest setup P&L: ${getSetupPerformanceDisplay(weakestRow, locale).pnl}.`)
  }
  if (bestRow) {
    const best = getSetupPerformanceDisplay(bestRow, locale)
    return text(`${best.pnl} bei ${best.winRate} Trefferquote. PF ${best.profitFactor}.`, `${best.pnl} with a ${best.winRate} win rate and a profit factor of ${best.profitFactor}.`)
  }
  return text('Erst verknüpfte Trades machen die Karte scharf.', 'Link trades to setups to compare their results.')
}

function formatProfitFactor(value: number) {
  if (value === Infinity) return '∞'
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

function SetupPerformanceRowCard({ row, locale }: { row: SetupPerformanceRow; locale: JournalLocale }) {
  const text = journalText(locale)
  const display = getSetupPerformanceDisplay(row, locale)
  const hasEvidence = hasSufficientAnalyticsBucketEvidence(row.trades)
  const evidenceTone = getAnalyticsBucketTone(row.trades, row.tone)
  const toneClass = evidenceTone === 'green'
    ? 'border-emerald-400/24 bg-emerald-400/[0.06]'
    : evidenceTone === 'red'
      ? 'border-red-400/22 bg-red-400/[0.055]'
      : 'border-white/10 bg-black/18'
  const pnlClass = evidenceTone === 'green' ? 'text-emerald-200' : evidenceTone === 'red' ? 'text-red-200' : 'text-white'

  return (
    <div className={`rounded-[22px] border px-5 py-4 ${toneClass}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-white">{row.title}</p>
            <span className="rounded-full border border-white/10 bg-black/14 px-3 py-1 text-xs text-white/58">{text(`${row.trades} Trades`, `${row.trades} ${row.trades === 1 ? 'trade' : 'trades'}`)}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-white/55">
            {hasEvidence
              ? text(`Historische Stichprobe mit ${text(`${row.trades} Trades`, `${row.trades} ${row.trades === 1 ? 'trade' : 'trades'}`)} in der gewählten Auswahl.`, `Based on ${row.trades} selected trades.`)
              : text(`${getAnalyticsBucketEvidenceLabel(row.trades, locale)} Trades. Rohwerte sind nur Einzelbeobachtungen.`, `${getAnalyticsBucketEvidenceLabel(row.trades, locale)}. These are individual observations.`)}
          </p>
          {hasEvidence ? (
            <p className="mt-1 text-xs leading-5 text-white/38">
              {row.bestSession !== '—'
                ? text(`Historische Sessionverteilung: höherer Wert ${row.bestSession}${row.weakestSession !== '—' && row.weakestSession !== row.bestSession ? ` · niedrigerer Wert ${row.weakestSession}` : ''}. `, `Session results: higher in ${row.bestSession}${row.weakestSession !== '—' && row.weakestSession !== row.bestSession ? ` · lower in ${row.weakestSession}` : ''}. `)
                : text('Sessionvergleich: zu wenig Daten je Session. ', 'Too few trades to compare sessions. ')}
              {text(`Risiko dokumentiert: ${row.riskCoverage}%`, `Risk recorded: ${row.riskCoverage}%`)}
            </p>
          ) : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-5 xl:min-w-[640px] xl:text-right">
          <InlineMetric label="P&L" value={display.pnl} valueClassName={pnlClass} />
          <InlineMetric label={text('Trefferquote', 'Win rate')} value={hasEvidence ? display.winRate : '—'} />
          <InlineMetric label="PF" value={hasEvidence ? display.profitFactor : '—'} />
          <InlineMetric label="Ø R" value={hasEvidence && row.averageR !== null ? formatRMultiple(row.averageR, 2, locale) : hasEvidence ? text('R offen', 'R missing') : '—'} />
          <InlineMetric label={text('Datengrundlage', 'Sample size')} value={getAnalyticsBucketEvidenceLabel(row.trades, locale)} small />
        </div>
      </div>
    </div>
  )
}

function LayerButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${active ? 'border-orange-300/40 bg-orange-400/15 text-orange-100' : 'border-white/10 bg-black/20 text-white/72 hover:border-white/20 hover:text-white'}`}
    >
      {children}
    </button>
  )
}

function TrustTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{label}</p>
      <p className={`mt-2 text-base font-semibold ${tone}`}>{value}</p>
    </div>
  )
}

function EvidenceCaption({ trades, period, locale }: { trades: number; period: string; locale: JournalLocale }) {
  const text = journalText(locale)
  return <p className="mt-1 text-[11px] leading-5 text-white/42">{text(`${trades} belastbare Trades · ${period}`, `${trades} trades included · ${period}`)}</p>
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-black/22 p-5">
      <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">{label}</p>
      <p className={`mt-4 whitespace-nowrap text-3xl font-semibold tracking-tight tabular-nums ${tone}`}>{value}</p>
      <p className="mt-4 text-sm leading-6 text-white/50">{detail}</p>
    </div>
  )
}

function SignalCard({ eyebrow, title, detail, tone }: { eyebrow: string; title: string; detail: string; tone: 'green' | 'red' | 'orange' }) {
  const toneClass = tone === 'green'
    ? 'border-emerald-400/20 bg-emerald-400/10'
    : tone === 'red'
      ? 'border-red-400/18 bg-red-400/8'
      : 'border-orange-400/18 bg-orange-400/8'

  return (
    <div className={`rounded-[28px] border p-5 ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-[0.28em] text-white/40">{eyebrow}</p>
      <h3 className="mt-4 text-2xl font-semibold leading-tight text-white">{title}</h3>
      <p className="mt-4 text-sm leading-7 text-white/70">{detail}</p>
    </div>
  )
}


function TimeWindowCard({ row, locale }: { row: TimeWindowPerformanceRow; locale: JournalLocale }) {
  const text = journalText(locale)
  const hasEvidence = hasSufficientAnalyticsBucketEvidence(row.trades)
  const evidenceTone = getAnalyticsBucketTone(row.trades, row.tone)
  const toneClass = evidenceTone === 'green'
    ? 'border-emerald-400/18 bg-emerald-400/10'
    : evidenceTone === 'red'
      ? 'border-red-400/18 bg-red-400/8'
      : 'border-white/10 bg-black/25'

  return (
    <div className={`rounded-[22px] border p-5 ${toneClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">{formatTimeWindowLabel(row, locale)}</p>
          <p className="mt-3 whitespace-nowrap text-3xl font-semibold tracking-tight tabular-nums text-white">{formatRowMoney(row.netPnL, row.trades, row.currency, locale)}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-black/16 px-3 py-1 text-xs text-white/60">
          {text(`${row.trades} Trades`, `${row.trades} ${row.trades === 1 ? 'trade' : 'trades'}`)}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
        <InlineMetric label={text('Trefferquote', 'Win rate')} value={hasEvidence ? `${row.winRate.toFixed(0)}%` : '—'} />
        <InlineMetric label="Ø R" value={hasEvidence ? formatAverageR(row.averageR, row.trades, row.rCount, locale) : '—'} />
        <InlineMetric label={text('Datengrundlage', 'Sample size')} value={getAnalyticsBucketEvidenceLabel(row.trades, locale)} small />
      </div>
    </div>
  )
}

function DrawdownPhaseCard({ title, phase, currency, locale }: { title: string; phase: DrawdownPhase; currency: string | null; locale: JournalLocale }) {
  const text = journalText(locale)
  const toneClass = phase.status === 'open'
    ? 'border-red-400/18 bg-red-400/8'
    : 'border-white/10 bg-black/25'

  return (
    <div className={`rounded-[24px] border p-5 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{formatDepthCurrency(phase.depth, currency, locale)}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-black/16 px-3 py-1 text-xs text-white/60">
          {phase.status === 'open' ? text('offen', 'open') : text('erholt', 'recovered')}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Zeitraum', 'Period')}</p>
          <p className="mt-2 text-sm font-semibold text-white">{describePhaseRange(phase, locale)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Dauer', 'Duration')}</p>
          <p className="mt-2 text-sm font-semibold text-white">{formatDayLabel(phase.durationDays, locale)} · {text(`${phase.tradeCount} Trades`, `${phase.tradeCount} ${phase.tradeCount === 1 ? 'trade' : 'trades'}`)}</p>
        </div>
      </div>
    </div>
  )
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        active
          ? 'border-orange-400/30 bg-orange-400/15 text-orange-100'
          : 'border-white/10 bg-black/20 text-white/60 hover:border-white/20 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}


function InsightBucketSection({
  locale,
  eyebrow,
  title,
  subtitle,
  focusLabel,
  lead,
  detail,
  rows,
  evidenceLabel,
}: {
  eyebrow: string
  title: string
  subtitle: string
  locale: JournalLocale
  focusLabel: string
  lead: string
  detail: string
  rows: SessionPerformanceRow[]
  evidenceLabel: string
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">{eyebrow}</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{title}</h3>
          {subtitle ? <p className="mt-2 text-sm leading-6 text-white/58">{subtitle}</p> : null}
        </div>
        <div className="max-w-xl lg:text-right">
          <p className="text-[10px] uppercase tracking-[0.24em] text-orange-100/45">{focusLabel}</p>
          <p className="mt-1 text-[11px] leading-5 text-white/42">{evidenceLabel}</p>
          <p className="mt-2 text-lg font-semibold leading-7 text-orange-50">{lead}</p>
          <p className="mt-1 text-sm leading-6 text-white/56">{detail}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {rows.map((row) => (
          <InsightBucketCard locale={locale} key={row.key} row={row} />
        ))}
      </div>
    </section>
  )
}

function InsightBucketCard({ row, locale }: { row: SessionPerformanceRow; locale: JournalLocale }) {
  const text = journalText(locale)
  const hasEvidence = hasSufficientAnalyticsBucketEvidence(row.trades)
  const evidenceTone = getAnalyticsBucketTone(row.trades, row.tone)
  const toneClass = evidenceTone === 'green'
    ? 'border-emerald-400/24 bg-emerald-400/[0.06]'
    : evidenceTone === 'red'
      ? 'border-red-400/22 bg-red-400/[0.055]'
      : 'border-white/10 bg-black/18'
  const pnlClass = evidenceTone === 'green' ? 'text-emerald-200' : evidenceTone === 'red' ? 'text-red-200' : 'text-white'

  return (
    <div className={`rounded-[22px] border px-5 py-4 ${toneClass}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[10px] uppercase tracking-[0.28em] text-white/38">{row.label}</p>
            <span className="rounded-full border border-white/10 bg-black/14 px-3 py-1 text-xs text-white/58">
              {text(`${row.trades} Trades`, `${row.trades} ${row.trades === 1 ? 'trade' : 'trades'}`)}
            </span>
          </div>
          <p className={`mt-3 whitespace-nowrap text-2xl font-semibold tracking-tight tabular-nums ${pnlClass}`}>{formatRowMoney(row.netPnL, row.trades, row.currency, locale)}</p>
        </div>

        <div className="grid min-w-[210px] grid-cols-3 gap-5 text-right">
          <InlineMetric label={text('Trefferquote', 'Win rate')} value={hasEvidence ? `${row.winRate.toFixed(0)}%` : '—'} />
          <InlineMetric label="Ø R" value={hasEvidence ? formatAverageR(row.averageR, row.trades, row.rCount, locale) : '—'} />
          <InlineMetric label={text('Datengrundlage', 'Sample size')} value={getAnalyticsBucketEvidenceLabel(row.trades, locale)} small />
        </div>
      </div>
    </div>
  )
}

function InlineMetric({ label, value, valueClassName = 'text-white', small = false }: { label: string; value: string; valueClassName?: string; small?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/34">{label}</p>
      <p className={`mt-2 ${small ? 'text-sm leading-5' : 'whitespace-nowrap text-lg'} font-semibold tabular-nums ${valueClassName}`}>{value}</p>
    </div>
  )
}

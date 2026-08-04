'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { CompareAndConquer } from '@/components/analytics/compare-and-conquer'
import { FilterDeck } from '@/components/analytics/filter-deck'
import { TagInsights } from '@/components/analytics/tag-insights'
import { DrawdownCurveCard } from '@/components/analytics/drawdown-curve-card'
import { EquityCurveCard } from '@/components/dashboard/equity-curve-card'
import { PnlCurveCard } from '@/components/dashboard/pnl-curve-card'
import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { buildConceptPerformance, buildDrawdownProfile, buildKillZonePerformance, buildSessionPerformance, buildTimeWindowPerformance, findBestEmotion, findBestMarket, getCoreMetrics, type DrawdownPhase, type SessionPerformanceRow, type TimeWindowPerformanceRow } from '@/lib/utils/analytics'
import { filterTrades } from '@/lib/utils/filters'
import { buildTagStats } from '@/lib/utils/tag-analytics'
import { getTradeTrustSummary, getTrustedTrades } from '@/lib/utils/trade-trust'
import { buildSetupPerformanceRows, type SetupPerformanceRow } from '@/lib/utils/setup-analytics'
import { buildAccountContexts, getTradeAccountLabel } from '@/lib/utils/account-context'
import { formatMoney, getMonetaryScopeMessage } from '@/lib/utils/currency'

const defaultFilters = { account: 'Alle', session: 'Alle', concept: 'Alle', quality: 'Alle', emotion: 'Alle', setup: 'Alle' }

type DeepDiveMode = 'compare' | 'tags'
type StatistikLayer = 'rhythm' | 'setups' | 'psychology' | 'drawdown' | 'curves' | 'deepdive'

function normalizeStatistikLayer(value: string | null): StatistikLayer {
  if (value === 'rhythm' || value === 'setups' || value === 'psychology' || value === 'drawdown' || value === 'curves' || value === 'deepdive') return value
  return 'rhythm'
}

function getUniqueValues(values: string[]) {
  return Array.from(new Set(values.filter((value) => value && value !== '—'))).sort((a, b) => a.localeCompare(b, 'de'))
}

function formatCurrency(value: number, currency?: string | null) {
  return formatMoney(value, currency)
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function formatDepthCurrency(value: number, currency?: string | null) {
  return formatMoney(-Math.abs(value), currency)
}

function formatRowMoney(value: number, trades: number, currency?: string | null) {
  if (!trades) return '—'
  return currency ? formatCurrency(value, currency) : 'Gesperrt'
}

function formatAverageR(value: number | null, trades: number, rCount?: number) {
  if (!trades) return '—'
  if (value === null || !Number.isFinite(value)) return 'R offen'
  if (rCount !== undefined && rCount === 0) return 'R offen'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`
}

function formatDayLabel(days: number) {
  if (days <= 0) return 'intraday'
  return `${days} ${days === 1 ? 'Tag' : 'Tage'}`
}

function formatCompactDayLabel(days: number) {
  if (days <= 0) return 'intraday'
  return `${days}T`
}

function formatPhaseDate(value: string | null) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function describePhaseRange(phase: DrawdownPhase) {
  if (phase.status === 'open') return `seit ${formatPhaseDate(phase.startAt)} offen`
  return `${formatPhaseDate(phase.startAt)} bis ${formatPhaseDate(phase.recoveredAt)}`
}

function getCurrentStreakLabel(currentWinStreak: number, currentLossStreak: number) {
  if (currentLossStreak > 0) return `${currentLossStreak} rote Trades in Folge`
  if (currentWinStreak > 0) return `${currentWinStreak} grüne Trades in Folge`
  return 'Gerade kein Lauf'
}

function getCurrentStreakDetail(currentWinStreak: number, currentLossStreak: number) {
  if (currentLossStreak >= 2) return 'Tilt-Risiko.'
  if (currentLossStreak === 1) return 'Kurz bremsen.'
  if (currentWinStreak >= 3) return 'Lauf schützen.'
  if (currentWinStreak > 0) return 'Standard halten.'
  return 'Noch keine Serie.'
}

function getTodayStatusLabel(status: string) {
  if (status === 'win') return 'Grün'
  if (status === 'loss') return 'Rot'
  if (status === 'breakeven') return 'Flat'
  if (status === 'open') return 'Offen'
  return 'Kein Trade'
}

function getStreakGuardrail(currentWinStreak: number, currentLossStreak: number, longestLossStreak: number) {
  if (currentLossStreak >= 2) return 'Cooldown oder kleiner.'
  if (longestLossStreak >= 3) return `Dein harter Schutzpunkt liegt spätestens bei ${longestLossStreak} Verlusten in Folge. Guardrail vorher ziehen.`
  if (currentWinStreak >= 3) return 'Gewinnserie schützen.'
  return 'Bestes Setup handeln.'
}


function getTimeWindowSummaryLead(bestWindow: TimeWindowPerformanceRow | null, weakestWindow: TimeWindowPerformanceRow | null) {
  if (bestWindow && weakestWindow && bestWindow.key !== weakestWindow.key) {
    return `${bestWindow.label} ist stark. ${weakestWindow.label} kostet.`
  }

  if (bestWindow) return `${bestWindow.label} ist aktuell am stärksten.`
  return 'Noch wenig Zeitdaten.'
}

function getTimeWindowSummaryDetail(bestWindow: TimeWindowPerformanceRow | null, weakestWindow: TimeWindowPerformanceRow | null) {
  if (bestWindow && weakestWindow && bestWindow.key !== weakestWindow.key) {
    return `Stärkstes Fenster: ${formatCurrency(bestWindow.netPnL, bestWindow.currency)} bei ${bestWindow.winRate.toFixed(0)}% Winrate. Schwächstes Fenster: ${formatCurrency(weakestWindow.netPnL, weakestWindow.currency)}.`
  }

  if (bestWindow) return `${formatCurrency(bestWindow.netPnL, bestWindow.currency)} bei ${bestWindow.winRate.toFixed(0)}% Winrate.`
  return 'Mehr Daten nötig.'
}

function getTimeWindowGuardrail(weakestWindow: TimeWindowPerformanceRow | null) {
  if (!weakestWindow) return 'Mehr Daten nötig.'
  if (weakestWindow.netPnL < 0) return `Im Fenster ${weakestWindow.label} nur A-Setups handeln oder Größe bewusst kleiner halten.`
  return `Auch in ${weakestWindow.label} Qualität vor Frequenz.`
}


function getDrawdownLead(profile: ReturnType<typeof buildDrawdownProfile>) {
  if (profile.activePhase) return `Aktuell läuft noch eine Delle von ${formatDepthCurrency(profile.currentDepth, profile.monetaryScope.currency)}.`
  if (profile.deepestPhase) return `Tiefste Delle im aktuellen Fenster: ${formatDepthCurrency(profile.maxDepth, profile.monetaryScope.currency)}.`
  return 'Noch wenig P&L-Daten.'
}

function getDrawdownDetail(profile: ReturnType<typeof buildDrawdownProfile>) {
  if (profile.activePhase) {
    return `Offen seit ${formatPhaseDate(profile.activePhase.startAt)} über ${profile.activePhase.tradeCount} Trades. Tiefster Punkt bisher: ${formatDepthCurrency(profile.activePhase.depth, profile.monetaryScope.currency)}.`
  }

  if (profile.longestPhase) {
    return `Längste Erholungsphase: ${formatDayLabel(profile.longestPhase.durationDays)} über ${profile.longestPhase.tradeCount} Trades.`
  }

  return 'Mehr Daten nötig.'
}

function getDrawdownGuardrail(profile: ReturnType<typeof buildDrawdownProfile>) {
  if (profile.activePhase && profile.activePhase.tradeCount >= 2) {
    return 'Offene Delle. Tempo runter.'
  }

  if (profile.longestPhase && profile.longestPhase.durationDays >= 3) {
    return `Deine längste Erholung dauerte ${formatDayLabel(profile.longestPhase.durationDays)}. Guardrails früher ziehen, bevor eine kleine Delle lang wird.`
  }

  if (profile.phaseCount >= 3) {
    return 'Mehrere Dellen. Früher bremsen.'
  }

  return 'Kein Drawdown-Alarm.'
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

function getBucketSummaryLead(bestRow: SessionPerformanceRow | null, weakestRow: SessionPerformanceRow | null, fallback: string) {
  if (bestRow && weakestRow && bestRow.key !== weakestRow.key) {
    return `${bestRow.label} ist stark. ${weakestRow.label} kostet.`
  }

  if (bestRow) return `${bestRow.label} ist aktuell am stärksten.`
  return fallback
}

function getBucketSummaryDetail(bestRow: SessionPerformanceRow | null, weakestRow: SessionPerformanceRow | null, fallback: string) {
  if (bestRow && weakestRow && bestRow.key !== weakestRow.key) {
    return `Stärkster Block: ${formatCurrency(bestRow.netPnL, bestRow.currency)} bei ${bestRow.winRate.toFixed(0)}% Winrate. Schwächster Block: ${formatCurrency(weakestRow.netPnL, weakestRow.currency)}.`
  }

  if (bestRow) return `${formatCurrency(bestRow.netPnL, bestRow.currency)} bei ${bestRow.winRate.toFixed(0)}% Winrate.`
  return fallback
}


export function StatistikWorkbench({ trades, tradeTags, setupTitles, initialLayer, initialSetup }: { trades: Trade[]; tradeTags: TradeTag[]; setupTitles: string[]; initialLayer?: string; initialSetup?: string }) {
  const [filters, setFilters] = useState(() => ({ ...defaultFilters, setup: initialSetup || 'Alle' }))
  const [deepDiveMode, setDeepDiveMode] = useState<DeepDiveMode>('compare')
  const [activeLayer, setActiveLayer] = useState<StatistikLayer>(() => normalizeStatistikLayer(initialLayer ?? null))
  const [showFilters, setShowFilters] = useState(false)
  const [showQuality, setShowQuality] = useState(false)

  const filteredTrades = useMemo(() => filterTrades(trades, filters), [filters, trades])
  const trustedTrades = useMemo(() => getTrustedTrades(filteredTrades), [filteredTrades])
  const trustSummary = useMemo(() => getTradeTrustSummary(filteredTrades), [filteredTrades])
  const filteredTradeIds = useMemo(() => new Set(trustedTrades.map((trade) => trade.id)), [trustedTrades])
  const filteredTags = useMemo(() => tradeTags.filter((item) => filteredTradeIds.has(item.trade_id)), [filteredTradeIds, tradeTags])
  const conceptPerformance = useMemo(() => buildConceptPerformance(trustedTrades), [trustedTrades])
  const bestMarket = useMemo(() => findBestMarket(trustedTrades), [trustedTrades])
  const bestEmotion = useMemo(() => findBestEmotion(trustedTrades), [trustedTrades])
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
  const setupBestRow = setupPerformanceRows.find((row) => row.trades > 0) ?? null
  const setupWeakestRow = [...setupPerformanceRows].filter((row) => row.trades > 0).sort((left, right) => left.netPnL - right.netPnL || right.trades - left.trades)[0] ?? null

  const strongestConcept = conceptPerformance.find((row) => row.tone === 'green')
  const weakestConcept = conceptPerformance.find((row) => row.tone === 'red' || row.pnl.trim().startsWith('-'))
  const strongestTag = tagStats.find((row) => row.netPnL > 0)
  const weakestTag = tagStats.find((row) => row.netPnL < 0)
  const negativeEmotion = useMemo(() => {
    if (!metrics.monetaryScope.isComparable) return undefined
    const emotionRows = Object.entries(
      trustedTrades.reduce<Record<string, number>>((acc, trade) => {
        const key = trade.emotion || '—'
        acc[key] = (acc[key] ?? 0) + (trade.netPnL ?? 0)
        return acc
      }, {}),
    )
      .filter(([emotion, pnl]) => emotion !== '—' && pnl < 0)
      .sort((a, b) => a[1] - b[1])
    return emotionRows[0]
  }, [metrics.monetaryScope.isComparable, trustedTrades])

  const strongestSignal = strongestConcept
    ? { title: strongestConcept.concept, detail: `${strongestConcept.pnl} · ${strongestConcept.winRate} Winrate` }
    : bestMarket
      ? { title: bestMarket[0], detail: `${formatCurrency(bestMarket[1], metrics.currency)} im aktuellen Fenster` }
      : { title: 'Noch kein Muster', detail: 'Mehr Daten helfen.' }

  const frictionSignal = weakestConcept
    ? { title: weakestConcept.concept, detail: `${weakestConcept.pnl} · ${weakestConcept.winRate} Winrate` }
    : weakestTag
      ? { title: weakestTag.tag, detail: `${formatCurrency(weakestTag.netPnL, metrics.currency)} · ${weakestTag.totalTrades} Trades` }
      : negativeEmotion
        ? { title: negativeEmotion[0], detail: `${formatCurrency(negativeEmotion[1], metrics.currency)} im aktuellen Fenster` }
        : { title: 'Noch kein Warnmuster', detail: 'Noch kein klares Negativmuster.' }

  const nextStep = strongestConcept
    ? `Mehr Gewicht auf ${strongestConcept.concept} legen und die Ausreißer außen halten.`
    : strongestTag
      ? `Das Muster rund um „${strongestTag.tag}“ weiter beobachten und nur mit sauberem Kontext wiederholen.`
      : bestEmotion
        ? `${bestEmotion.emotion} bewusst halten, solange die Trefferquote dort stabil bleibt.`
        : 'Noch wenig Daten. Weiter sauber erfassen.'

  return (
    <div className="space-y-10">
      <section className="rounded-[26px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.32)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-white">Filter</span>
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/65 transition hover:border-orange-300/25 hover:text-orange-100"
            aria-expanded={showFilters}
          >
            {showFilters ? 'Filter ausblenden' : 'Filter anzeigen'}
          </button>
        </div>
        {showFilters ? (
          <div className="mt-4">
            <FilterDeck filters={filters} options={filterOptions} onChange={setFilters} onReset={() => setFilters(defaultFilters)} />
          </div>
        ) : null}
      </section>

      <section className="rounded-[30px] border border-orange-400/15 bg-white/5 p-7 shadow-2xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <h2 className="eq-display text-2xl text-orange-300">Statistik</h2>
            <p className="mt-2 text-sm leading-6 text-white/55">Wann du stark bist. Wo du zahlst. Was du weglässt.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowQuality((current) => !current)}
            className="w-fit rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/60 transition hover:border-orange-300/25 hover:text-orange-100"
            aria-expanded={showQuality}
          >
            {showQuality ? 'Qualität ausblenden' : 'Qualität anzeigen'}
          </button>
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-3">
          <MetricCard label="P&L" value={metrics.monetaryScope.isComparable ? formatCurrency(metrics.netPnL, metrics.currency) : 'Gesperrt'} detail={activeAccount ? activeAccount.label : `${trustedTrades.length} Trades`} tone={metrics.monetaryScope.isComparable ? 'text-emerald-300' : 'text-orange-200'} />
          <MetricCard label="Winrate" value={formatPercent(metrics.winRate)} detail={activeAccount ? `${activeAccount.trades} Konto-Trades` : bestEmotion ? bestEmotion.emotion : '—'} tone="text-white" />
          <MetricCard label="Erwartung" value={`${metrics.expectancyR >= 0 ? '+' : ''}${metrics.expectancyR.toFixed(2)}R`} detail={bestMarket ? bestMarket[0] : '—'} tone="text-orange-200" />
        </div>

        {!metrics.monetaryScope.isComparable && metrics.monetaryScope.kind !== 'empty' ? (
          <div className="mt-5 rounded-2xl border border-orange-300/25 bg-orange-300/10 px-4 py-3 text-sm leading-6 text-orange-100">
            {getMonetaryScopeMessage(metrics.monetaryScope)} Nicht-monetäre Kennzahlen bleiben sichtbar; P&amp;L-Summen, Kurven und Rankings sind deaktiviert.
          </div>
        ) : null}

        {showQuality ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <TrustTile label="Belastbar" value={`${trustSummary.trustedTrades}/${trustSummary.totalTrades}`} tone="text-emerald-300" />
            <TrustTile label="Offen" value={String(trustSummary.incompleteTrades)} tone="text-emerald-200" />
            <TrustTile label="Ohne P&L" value={String(trustSummary.completeWithoutPnL)} tone="text-orange-100/85" />
          </div>
        ) : null}
      </section>


      <section className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_14px_42px_rgba(0,0,0,0.26)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h3 className="eq-display text-xl text-white">Auswertung</h3>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-2xl lg:justify-end">
            <LayerButton active={activeLayer === 'rhythm'} onClick={() => setActiveLayer('rhythm')}>Zeiten</LayerButton>
            <LayerButton active={activeLayer === 'setups'} onClick={() => setActiveLayer('setups')}>Setups</LayerButton>
            <LayerButton active={activeLayer === 'psychology'} onClick={() => setActiveLayer('psychology')}>Psyche</LayerButton>
            <LayerButton active={activeLayer === 'drawdown'} onClick={() => setActiveLayer('drawdown')}>Drawdown</LayerButton>
            <LayerButton active={activeLayer === 'curves'} onClick={() => setActiveLayer('curves')}>Kurven</LayerButton>
            <LayerButton active={activeLayer === 'deepdive'} onClick={() => setActiveLayer('deepdive')}>Mehr</LayerButton>
          </div>
        </div>
      </section>

      {activeLayer === 'rhythm' ? (
      <>
      <section className="rounded-[28px] border border-orange-400/16 bg-orange-400/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h3 className="text-xl font-semibold text-white">Zeitfenster</h3>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 lg:max-w-sm">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Signal</p>
            <p className="mt-2 text-lg font-semibold text-orange-100">{getTimeWindowSummaryLead(timeWindowPerformance.bestWindow, timeWindowPerformance.weakestWindow)}</p>
            <p className="mt-2 text-sm leading-6 text-white/55">{getTimeWindowSummaryDetail(timeWindowPerformance.bestWindow, timeWindowPerformance.weakestWindow)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-3">
          {timeWindowPerformance.rows.map((row) => (
            <TimeWindowCard key={row.key} row={row} />
          ))}
        </div>

        <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Regel</p>
          <h4 className="mt-3 text-2xl font-semibold text-white">{getTimeWindowGuardrail(timeWindowPerformance.weakestWindow)}</h4>
          <p className="mt-3 text-sm leading-7 text-white/60">
            Ausgewertet: {timeWindowPerformance.coveredTrades} Trades mit Uhrzeit. {timeWindowPerformance.missingTrades > 0 ? `${timeWindowPerformance.missingTrades} Trades noch ohne Uhrzeit.` : 'Uhrzeiten vollständig.'}
          </p>
        </div>
      </section>


      <section className="grid gap-6 xl:grid-cols-2">
        <InsightBucketSection
          eyebrow="Sessions"
          title="Sessions"
          subtitle=""
          focusLabel="Signal"
          lead={getBucketSummaryLead(sessionPerformance.bestRow, sessionPerformance.weakestRow, 'Noch kein klares Session-Muster.')}
          detail={getBucketSummaryDetail(sessionPerformance.bestRow, sessionPerformance.weakestRow, 'Mehr Trades schärfen das Signal.')}
          rows={sessionPerformance.rows}
        />
        <InsightBucketSection
          eyebrow="Kill Zones"
          title="Kill Zones"
          subtitle=""
          focusLabel="Signal"
          lead={getBucketSummaryLead(killZonePerformance.bestRow, killZonePerformance.weakestRow, 'Noch kein klares Kill-Zone-Muster.')}
          detail={getBucketSummaryDetail(killZonePerformance.bestRow, killZonePerformance.weakestRow, 'Aus Uhrzeiten abgeleitet.')}
          rows={killZonePerformance.rows}
        />
      </section>
      </>
      ) : null}

      {activeLayer === 'setups' ? (
      <section className="rounded-[28px] border border-orange-400/16 bg-orange-400/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h3 className="text-xl font-semibold text-white">Setups</h3>
            <p className="mt-2 text-sm leading-6 text-white/55">Welche Regel trägt. Welche Regel bremst.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 lg:max-w-sm">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Signal</p>
            <p className="mt-2 text-lg font-semibold text-orange-100">{getSetupSummaryLead(setupBestRow, setupWeakestRow)}</p>
            <p className="mt-2 text-sm leading-6 text-white/55">{getSetupSummaryDetail(setupBestRow, setupWeakestRow)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {setupPerformanceRows.length ? (
            setupPerformanceRows.map((row) => <SetupPerformanceRowCard key={row.title} row={row} />)
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/55">Noch keine Setup-Daten.</div>
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
            <p className="mt-2 text-lg font-semibold text-emerald-200">{getCurrentStreakLabel(metrics.currentWinStreak, metrics.currentLossStreak)}</p>
            <p className="mt-2 text-sm leading-6 text-white/55">{getCurrentStreakDetail(metrics.currentWinStreak, metrics.currentLossStreak)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-5">
          <MetricCard
            label="Gewinnserie aktuell"
            value={String(metrics.currentWinStreak)}
            detail={metrics.currentWinStreak > 0 ? 'Trades hintereinander im Plus' : 'Keine aktive Gewinnserie'}
            tone="text-emerald-300"
          />
          <MetricCard
            label="Verlustserie aktuell"
            value={String(metrics.currentLossStreak)}
            detail={metrics.currentLossStreak > 0 ? 'Trades hintereinander im Minus' : 'Keine aktive Verlustserie'}
            tone={metrics.currentLossStreak >= 2 ? 'text-red-300' : 'text-white'}
          />
          <MetricCard
            label="Längste Gewinnserie"
            value={String(metrics.longestWinStreak)}
            detail="Bester Lauf"
            tone="text-orange-200"
          />
          <MetricCard
            label="Längste Verlustserie"
            value={String(metrics.longestLossStreak)}
            detail="Härteste Druckphase"
            tone={metrics.longestLossStreak >= 2 ? 'text-red-300' : 'text-white'}
          />
          <MetricCard
            label="Heute"
            value={getTodayStatusLabel(metrics.todayStatus)}
            detail={metrics.todayTrades ? `${metrics.todayTrades} Trade${metrics.todayTrades === 1 ? '' : 's'}` : 'Noch kein Trade'}
            tone={metrics.todayStatus === 'win' ? 'text-emerald-300' : metrics.todayStatus === 'loss' ? 'text-red-300' : 'text-white'}
          />
        </div>

        <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Regel</p>
          <h4 className="mt-3 text-2xl font-semibold text-white">{getStreakGuardrail(metrics.currentWinStreak, metrics.currentLossStreak, metrics.longestLossStreak)}</h4>
          <p className="mt-3 text-sm leading-7 text-white/60">
            Max Drawdown: {formatCurrency(-metrics.maxDrawdown, metrics.currency)}.
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
            <p className="mt-2 text-lg font-semibold text-sky-100">{getDrawdownLead(drawdownProfile)}</p>
            <p className="mt-2 text-sm leading-6 text-white/55">{getDrawdownDetail(drawdownProfile)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-5">
          <MetricCard
            label="Tiefste Delle"
            value={formatDepthCurrency(drawdownProfile.maxDepth, drawdownProfile.monetaryScope.currency)}
            detail={drawdownProfile.deepestPhase ? `${describePhaseRange(drawdownProfile.deepestPhase)} · ${drawdownProfile.deepestPhase.tradeCount} Trades` : 'Noch keine belastbare Drawdown-Phase'}
            tone="text-sky-200"
          />
          <MetricCard
            label="Aktuelle Delle"
            value={drawdownProfile.activePhase ? formatDepthCurrency(drawdownProfile.currentDepth, drawdownProfile.monetaryScope.currency) : metrics.monetaryScope.isComparable ? formatCurrency(0, metrics.currency) : 'Gesperrt'}
            detail={drawdownProfile.activePhase ? `Offen seit ${formatPhaseDate(drawdownProfile.activePhase.startAt)}` : 'Keine offene Delle'}
            tone={drawdownProfile.activePhase ? 'text-red-300' : 'text-white'}
          />
          <MetricCard
            label="Längste Erholung"
            value={formatCompactDayLabel(drawdownProfile.longestDurationDays)}
            detail={drawdownProfile.longestPhase ? `${drawdownProfile.longestPhase.tradeCount} Trades bis zurück zum Hoch` : 'Noch keine Erholung'}
            tone="text-orange-200"
          />
          <MetricCard
            label="Dellen im Fenster"
            value={String(drawdownProfile.phaseCount)}
            detail={drawdownProfile.phaseCount > 0 ? `${drawdownProfile.recoveredPhaseCount} bereits erholt` : 'Noch keine Delle'}
            tone="text-white"
          />
        </div>

        {pickDrawdownHighlights(drawdownProfile).length > 0 ? (
          <div className="mt-6 grid gap-5 xl:grid-cols-3">
            {pickDrawdownHighlights(drawdownProfile).map((phase, index) => (
              <DrawdownPhaseCard
                key={phase.key}
                phase={phase}
                currency={drawdownProfile.monetaryScope.currency}
                title={
                  phase.status === 'open'
                    ? 'Offene Delle'
                    : drawdownProfile.deepestPhase?.key === phase.key
                      ? 'Tiefste Delle'
                      : drawdownProfile.longestPhase?.key === phase.key
                        ? 'Längste Erholung'
                        : `Letzte Phase ${index + 1}`
                }
              />
            ))}
          </div>
        ) : null}

        <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Regel</p>
          <h4 className="mt-3 text-2xl font-semibold text-white">{getDrawdownGuardrail(drawdownProfile)}</h4>
          <p className="mt-3 text-sm leading-7 text-white/60">
            Drawdown-Phasen im aktuellen Fenster: {drawdownProfile.phaseCount}. {drawdownProfile.activePhase ? `Aktuelle Delle seit ${formatPhaseDate(drawdownProfile.activePhase.startAt)}.` : 'Keine offene Delle.'}
          </p>
        </div>
      </section>
      ) : null}

      {activeLayer === 'curves' ? (
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.40)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h3 className="text-xl font-semibold text-white">Kurven</h3>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 lg:max-w-sm">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Signal</p>
            <p className="mt-2 text-lg font-semibold text-white">Equity</p>
            <p className="mt-2 text-sm leading-6 text-white/55">P&L und Drawdown</p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <EquityCurveCard trades={trustedTrades} />
          <PnlCurveCard trades={trustedTrades} />
          <DrawdownCurveCard trades={trustedTrades} />
        </div>
      </section>
      ) : null}

      {activeLayer === 'deepdive' ? (
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.40)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-white">Mehr</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <ToggleButton active={deepDiveMode === 'compare'} onClick={() => setDeepDiveMode('compare')}>
              Vergleiche
            </ToggleButton>
            <ToggleButton active={deepDiveMode === 'tags'} onClick={() => setDeepDiveMode('tags')}>
              Tags
            </ToggleButton>
          </div>
        </div>

        <div className="mt-5">
          {deepDiveMode === 'compare' ? <CompareAndConquer trades={trustedTrades} tradeTags={filteredTags} /> : <TagInsights rows={tagStats.slice(0, 8)} />}
        </div>
      </section>
      ) : null}
    </div>
  )
}


function getSetupSummaryLead(bestRow: SetupPerformanceRow | null, weakestRow: SetupPerformanceRow | null) {
  if (bestRow && weakestRow && bestRow.title !== weakestRow.title) return `${bestRow.title} trägt. ${weakestRow.title} prüfen.`
  if (bestRow) return `${bestRow.title} ist aktuell vorne.`
  return 'Noch kein Setup-Signal.'
}

function getSetupSummaryDetail(bestRow: SetupPerformanceRow | null, weakestRow: SetupPerformanceRow | null) {
  if (bestRow && weakestRow && bestRow.title !== weakestRow.title) return `${formatCurrency(bestRow.netPnL, bestRow.currency)} bei ${bestRow.winRate.toFixed(0)}% Winrate. PF ${formatProfitFactor(bestRow.profitFactor)}. Schwächstes Setup: ${formatCurrency(weakestRow.netPnL, weakestRow.currency)}.`
  if (bestRow) return `${formatCurrency(bestRow.netPnL, bestRow.currency)} bei ${bestRow.winRate.toFixed(0)}% Winrate. PF ${formatProfitFactor(bestRow.profitFactor)}.`
  return 'Erst verknüpfte Trades machen die Karte scharf.'
}

function formatProfitFactor(value: number) {
  if (value === Infinity) return '∞'
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

function SetupPerformanceRowCard({ row }: { row: SetupPerformanceRow }) {
  const toneClass = row.tone === 'green'
    ? 'border-emerald-400/24 bg-emerald-400/[0.06]'
    : row.tone === 'red'
      ? 'border-red-400/22 bg-red-400/[0.055]'
      : 'border-white/10 bg-black/18'
  const pnlClass = row.tone === 'green' ? 'text-emerald-200' : row.tone === 'red' ? 'text-red-200' : 'text-white'

  return (
    <div className={`rounded-[22px] border px-5 py-4 ${toneClass}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-white">{row.title}</p>
            <span className="rounded-full border border-white/10 bg-black/14 px-3 py-1 text-xs text-white/58">{row.trades} Trades</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-white/55">{row.statusHint}</p>
          {row.trades > 0 ? (
            <p className="mt-1 text-xs leading-5 text-white/38">Stark: {row.bestSession} · Prüfen: {row.weakestSession} · Risiko: {row.riskCoverage}%</p>
          ) : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-5 xl:min-w-[640px] xl:text-right">
          <InlineMetric label="P&L" value={formatRowMoney(row.netPnL, row.trades, row.currency)} valueClassName={pnlClass} />
          <InlineMetric label="Winrate" value={row.trades > 0 ? `${row.winRate.toFixed(0)}%` : '—'} />
          <InlineMetric label="PF" value={row.trades > 0 ? formatProfitFactor(row.profitFactor) : '—'} />
          <InlineMetric label="Ø R" value={row.trades > 0 && row.riskCoverage > 0 ? `${row.averageR >= 0 ? '+' : ''}${row.averageR.toFixed(2)}R` : row.trades > 0 ? 'R offen' : '—'} />
          <InlineMetric label="Status" value={row.statusLabel} small />
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


function TimeWindowCard({ row }: { row: TimeWindowPerformanceRow }) {
  const toneClass = row.tone === 'green'
    ? 'border-emerald-400/18 bg-emerald-400/10'
    : row.tone === 'red'
      ? 'border-red-400/18 bg-red-400/8'
      : 'border-white/10 bg-black/25'

  return (
    <div className={`rounded-[22px] border p-5 ${toneClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">{row.label}</p>
          <p className="mt-3 whitespace-nowrap text-3xl font-semibold tracking-tight tabular-nums text-white">{formatRowMoney(row.netPnL, row.trades, row.currency)}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-black/16 px-3 py-1 text-xs text-white/60">
          {row.trades} Trades
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
        <InlineMetric label="Winrate" value={row.trades > 0 ? `${row.winRate.toFixed(0)}%` : '—'} />
        <InlineMetric label="Ø R" value={formatAverageR(row.averageR, row.trades, row.rCount)} />
      </div>
    </div>
  )
}

function DrawdownPhaseCard({ title, phase, currency }: { title: string; phase: DrawdownPhase; currency: string | null }) {
  const toneClass = phase.status === 'open'
    ? 'border-red-400/18 bg-red-400/8'
    : 'border-white/10 bg-black/25'

  return (
    <div className={`rounded-[24px] border p-5 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{formatDepthCurrency(phase.depth, currency)}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-black/16 px-3 py-1 text-xs text-white/60">
          {phase.status === 'open' ? 'offen' : 'erholt'}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Zeitraum</p>
          <p className="mt-2 text-sm font-semibold text-white">{describePhaseRange(phase)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Dauer</p>
          <p className="mt-2 text-sm font-semibold text-white">{formatDayLabel(phase.durationDays)} · {phase.tradeCount} Trades</p>
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
  eyebrow,
  title,
  subtitle,
  focusLabel,
  lead,
  detail,
  rows,
}: {
  eyebrow: string
  title: string
  subtitle: string
  focusLabel: string
  lead: string
  detail: string
  rows: SessionPerformanceRow[]
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
          <p className="mt-2 text-lg font-semibold leading-7 text-orange-50">{lead}</p>
          <p className="mt-1 text-sm leading-6 text-white/56">{detail}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {rows.map((row) => (
          <InsightBucketCard key={row.key} row={row} />
        ))}
      </div>
    </section>
  )
}

function InsightBucketCard({ row }: { row: SessionPerformanceRow }) {
  const toneClass = row.tone === 'green'
    ? 'border-emerald-400/24 bg-emerald-400/[0.06]'
    : row.tone === 'red'
      ? 'border-red-400/22 bg-red-400/[0.055]'
      : 'border-white/10 bg-black/18'
  const pnlClass = row.tone === 'green' ? 'text-emerald-200' : row.tone === 'red' ? 'text-red-200' : 'text-white'

  return (
    <div className={`rounded-[22px] border px-5 py-4 ${toneClass}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[10px] uppercase tracking-[0.28em] text-white/38">{row.label}</p>
            <span className="rounded-full border border-white/10 bg-black/14 px-3 py-1 text-xs text-white/58">
              {row.trades} Trades
            </span>
          </div>
          <p className={`mt-3 whitespace-nowrap text-2xl font-semibold tracking-tight tabular-nums ${pnlClass}`}>{formatRowMoney(row.netPnL, row.trades, row.currency)}</p>
        </div>

        <div className="grid min-w-[210px] grid-cols-2 gap-5 text-right">
          <InlineMetric label="Winrate" value={row.trades > 0 ? `${row.winRate.toFixed(0)}%` : '—'} />
          <InlineMetric label="Ø R" value={formatAverageR(row.averageR, row.trades, row.rCount)} />
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

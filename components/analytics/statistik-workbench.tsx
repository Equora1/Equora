'use client'

import { useMemo, useState } from 'react'
import { CompareAndConquer } from '@/components/analytics/compare-and-conquer'
import { EdgeFinder } from '@/components/analytics/edge-finder'
import { FilterDeck } from '@/components/analytics/filter-deck'
import { TagInsights } from '@/components/analytics/tag-insights'
import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { buildConceptPerformance, findBestEmotion, findBestMarket, getCoreMetrics } from '@/lib/utils/analytics'
import { filterTrades } from '@/lib/utils/filters'
import { buildTagStats } from '@/lib/utils/tag-analytics'
import { getTradeTrustSummary, getTrustedTrades } from '@/lib/utils/trade-trust'

const defaultFilters = { session: 'Alle', concept: 'Alle', quality: 'Alle', emotion: 'Alle', setup: 'Alle' }

function getUniqueValues(values: string[]) {
  return Array.from(new Set(values.filter((value) => value && value !== '—'))).sort((a, b) => a.localeCompare(b, 'de'))
}

export function StatistikWorkbench({ trades, tradeTags, setupTitles }: { trades: Trade[]; tradeTags: TradeTag[]; setupTitles: string[] }) {
  const [filters, setFilters] = useState(defaultFilters)
  const filteredTrades = useMemo(() => filterTrades(trades, filters), [filters, trades])
  const trustedTrades = useMemo(() => getTrustedTrades(filteredTrades), [filteredTrades])
  const trustSummary = useMemo(() => getTradeTrustSummary(filteredTrades), [filteredTrades])
  const filteredTradeIds = useMemo(() => new Set(trustedTrades.map((trade) => trade.id)), [trustedTrades])
  const filteredTags = useMemo(() => tradeTags.filter((item) => filteredTradeIds.has(item.trade_id)), [filteredTradeIds, tradeTags])
  const conceptPerformance = useMemo(() => buildConceptPerformance(trustedTrades), [trustedTrades])
  const bestMarket = useMemo(() => findBestMarket(trustedTrades), [trustedTrades])
  const bestEmotion = useMemo(() => findBestEmotion(trustedTrades), [trustedTrades])
  const tagStats = useMemo(() => buildTagStats(trustedTrades, filteredTags), [trustedTrades, filteredTags])
  const filterOptions = useMemo(() => ({ sessions: getUniqueValues(trades.map((trade) => trade.session)), concepts: getUniqueValues(trades.map((trade) => trade.concept)), qualities: getUniqueValues(trades.map((trade) => trade.quality)), emotions: getUniqueValues(trades.map((trade) => trade.emotion)), setups: getUniqueValues([...setupTitles, ...trades.map((trade) => trade.setup)]) }), [setupTitles, trades])
  const metrics = useMemo(() => getCoreMetrics(trustedTrades), [trustedTrades])

  const weakestRow = conceptPerformance[conceptPerformance.length - 1]
  const strongestTag = tagStats[0]
  const riskiestTag = [...tagStats].sort((a, b) => a.netPnL - b.netPnL)[0]
  const weakestEmotion = Object.entries(trustedTrades.reduce<Record<string, number>>((acc, trade) => { acc[trade.emotion] = (acc[trade.emotion] ?? 0) + (trade.netPnL ?? 0); return acc }, {})).sort((a, b) => a[1] - b[1])[0]

  const topPerformer = [
    { label: 'Bester Markt', value: bestMarket?.[0] ?? '—', detail: bestMarket ? `${bestMarket[1].toFixed(0)} €` : 'Keine Daten' },
    { label: 'Beste Emotion', value: bestEmotion?.emotion ?? '—', detail: bestEmotion ? `${bestEmotion.winRate.toFixed(0)}% Winrate bei ${bestEmotion.totalTrades} Trades` : 'Keine Daten' },
  ]

  const weakSpots = [
    { label: 'Schwächstes Konzept', value: weakestRow?.concept ?? '—', detail: weakestRow ? `${weakestRow.pnl} · ${weakestRow.winRate} Winrate` : 'Keine Daten' },
    { label: 'Tag mit Reibung', value: riskiestTag?.tag ?? '—', detail: riskiestTag ? `${riskiestTag.netPnL.toFixed(0)} € · ${riskiestTag.totalTrades} Trades` : 'Keine Daten' },
    { label: 'Kritische Emotion', value: weakestEmotion?.[0] ?? '—', detail: weakestEmotion ? `${weakestEmotion[1].toFixed(0)} € Net P&L im Filterfenster` : 'Keine Daten' },
    { label: 'Max Drawdown', value: `${metrics.maxDrawdown.toFixed(0)} €`, detail: `${metrics.longestLossStreak}er Verlustserie als bisheriger Peak` },
  ]

  const patternFinder = [
    `${filteredTrades.filter((trade) => trade.quality === 'A-Setup').length} A-Setups sind aktuell sichtbar, davon ${trustedTrades.filter((trade) => trade.quality === 'A-Setup').length} mit belastbarer P&L.`,
    bestMarket ? `${bestMarket[0]} führt mit ${bestMarket[1].toFixed(0)} € Net P&L.` : 'Noch kein Markt mit klarer Kante erkennbar.',
    `Expectancy im Trust-Fenster: ${metrics.expectancy.toFixed(0)} € pro belastbarem Trade und ${metrics.expectancyR.toFixed(2)}R.`,
    strongestTag ? `Tag „${strongestTag.tag}“ ist gerade einer der stärksten Cluster.` : 'Sobald mehr Tags vorliegen, wird Compare & Conquer granularer.',
  ]

  return <div className="space-y-6"><FilterDeck filters={filters} options={filterOptions} onChange={setFilters} onReset={() => setFilters(defaultFilters)} /><div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/5 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">Datenbasis der Auswertung</p><h3 className="mt-2 text-lg font-semibold text-white">Die Statistik rechnet nur mit belastbaren P&amp;L-Trades</h3><p className="mt-2 max-w-3xl text-sm text-white/60">Quick Captures und vollständige Trades ohne belastbares Net P&amp;L bleiben sichtbar im Journal, werden hier aber bewusst nicht als harte Analysegrundlage behandelt.</p></div><div className="grid gap-3 sm:grid-cols-3"><TrustTile label="Belastbar" value={`${trustSummary.trustedTrades} / ${trustSummary.totalTrades}`} tone="text-emerald-300" /><TrustTile label="Kurz erfasst" value={String(trustSummary.incompleteTrades)} tone="text-emerald-200" /><TrustTile label="Ohne P&amp;L" value={String(trustSummary.completeWithoutPnL)} tone="text-orange-100/85" /></div></div></div><EdgeFinder topPerformer={topPerformer} weakSpots={weakSpots} patternFinder={patternFinder} conceptPerformance={conceptPerformance} activeLabel={`${trustedTrades.length} belastbar / ${filteredTrades.length} Trades aktiv`} /><CompareAndConquer trades={trustedTrades} tradeTags={filteredTags} /><TagInsights rows={tagStats} /></div>
}

function TrustTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3"><p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{label}</p><p className={`mt-2 text-base font-semibold ${tone}`}>{value}</p></div>
}


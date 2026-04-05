'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'
import { SectionHeader } from '@/components/layout/section-header'
import { AppIcon } from '@/components/ui/app-icon'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import type { Trade } from '@/lib/types/trade'
import { formatCurrency, formatPartialExitCoverageLabel, formatPlainNumber, getPartialExitPlanInfo } from '@/lib/utils/calculations'
import { buildCalendarSummary, getDateKeyFromDate, normalizeTradeDate } from '@/lib/utils/calendar'

const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

type CalendarNote = { id: string; dateKey: string; title: string; note: string; mood: string; focus: string }

export function CalendarOverview({ trades, dailyNotes = [] }: { trades: Trade[]; dailyNotes?: CalendarNote[] }) {
  const today = new Date(2026, 3, 3)
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(getDateKeyFromDate(today))

  const summaries = useMemo(() => buildCalendarSummary(trades), [trades])
  const monthSummaries = useMemo(
    () => summaries.filter((item) => item.year === year && item.month === month),
    [summaries, year, month],
  )
  const positiveDays = monthSummaries.filter((item) => item.netPnL > 0).length
  const negativeDays = monthSummaries.filter((item) => item.netPnL < 0).length
  const screenshotDays = monthSummaries.filter((item) => item.screenshotTradeCount > 0).length
  const riskDays = monthSummaries.filter((item) => item.riskTradeCount > 0).length
  const openTradesInMonth = monthSummaries.reduce((sum, item) => sum + item.openTradeCount, 0)
  const strongestDay = monthSummaries.reduce((best, item) => (!best || item.netPnL > best.netPnL ? item : best), monthSummaries[0])
  const highestMonthRiskPercent = monthSummaries.reduce((best, item) => item.maxActualRiskPercent !== null && item.maxActualRiskPercent !== undefined ? Math.max(best, item.maxActualRiskPercent) : best, 0)

  useEffect(() => {
    if (monthSummaries.some((item) => item.dateKey === selectedDateKey)) return
    setSelectedDateKey(monthSummaries[monthSummaries.length - 1]?.dateKey ?? null)
  }, [monthSummaries, selectedDateKey])

  const selectedSummary = monthSummaries.find((item) => item.dateKey === selectedDateKey)
  const selectedTrades = useMemo(() => {
    if (!selectedDateKey) return []
    return trades.filter(
      (trade) => getDateKeyFromDate(normalizeTradeDate(trade.createdAt ?? trade.date)) === selectedDateKey,
    )
  }, [selectedDateKey, trades])
  const selectedNote = useMemo(
    () => dailyNotes.find((note) => note.dateKey === selectedDateKey),
    [dailyNotes, selectedDateKey],
  )
  const selectedNetPnL = selectedTrades.reduce((sum, trade) => sum + (trade.netPnL ?? 0), 0)
  const selectedAvgR = selectedTrades.length
    ? selectedTrades.reduce((sum, trade) => sum + (trade.rValue ?? 0), 0) / selectedTrades.length
    : 0
  const selectedSetups = Array.from(new Set(selectedSummary?.setups ?? []))
  const selectedScreenshots = selectedTrades.filter((trade) => trade.screenshotUrl)
  const selectedPlannedRisk = selectedTrades.reduce((sum, trade) => sum + Math.abs(trade.plannedRiskAmount ?? 0), 0)
  const selectedStopRisk = selectedTrades.reduce((sum, trade) => sum + Math.abs(trade.riskAmount ?? 0), 0)
  const selectedMarginUsed = selectedTrades.reduce((sum, trade) => sum + Math.abs(trade.marginUsed ?? 0), 0)
  const selectedHighestLeverage = selectedTrades.reduce((best, trade) => trade.leverage !== null && trade.leverage !== undefined ? Math.max(best, trade.leverage) : best, 0)
  const selectedRiskCoverageCount = selectedTrades.filter((trade) => trade.actualRiskPercent !== null && trade.actualRiskPercent !== undefined).length
  const selectedRiskCoverageLabel = selectedTrades.length ? `${selectedRiskCoverageCount}/${selectedTrades.length}` : '0/0'
  const selectedHighestRiskPercent = selectedTrades.reduce((best, trade) => trade.actualRiskPercent !== null && trade.actualRiskPercent !== undefined ? Math.max(best, trade.actualRiskPercent) : best, 0)
  const featuredTrade = selectedScreenshots[0] ?? selectedTrades[0]
  const featuredTradeStatus = featuredTrade
    ? featuredTrade.captureResult === 'open'
      ? 'Offen'
      : featuredTrade.captureStatus === 'incomplete' || featuredTrade.isComplete === false
        ? 'Unvollständig'
        : 'Geschlossen'
    : null
  const featuredEntry = featuredTrade ? (featuredTrade as Trade & { entry?: string | number | null }).entry : null
  const featuredPartialPlan = featuredTrade ? getPartialExitPlanInfo({ exit: featuredTrade.effectiveExit ?? null, partialExits: featuredTrade.partialExits ?? [] }) : null
  const featuredPartialLabel = featuredPartialPlan && featuredPartialPlan.count ? formatPartialExitCoverageLabel(featuredPartialPlan.coveredPercent, featuredPartialPlan.remainderPercent) : null
  const remainingScreenshotTrades = selectedScreenshots.filter((trade) => trade.id !== featuredTrade?.id)

  function goPrevMonth() {
    if (month === 0) {
      setMonth(11)
      setYear((prev) => prev - 1)
    } else {
      setMonth((prev) => prev - 1)
    }
  }

  function goNextMonth() {
    if (month === 11) {
      setMonth(0)
      setYear((prev) => prev + 1)
    } else {
      setMonth((prev) => prev + 1)
    }
  }

  return (
    <div className="space-y-6">
      <FuturisticCard glow="orange" className="p-5">
        <SectionHeader
          eyebrow="Kalenderansicht"
          title="Tage statt Zahlenstreifen"
          copy="Der Kalender zeigt jetzt nicht nur Monatssummen, sondern auch wo Risiko bereits sauber mitgeführt wurde. Tagesarbeit zuerst, dann Review und Risikorahmen."
          badge={`${monthSummaries.length} aktive Tage`}
        />

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-orange-400/15 bg-black/25 p-5">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Monatsrahmen</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={goPrevMonth} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60 transition hover:border-white/14 hover:text-white/80">Zurück</button>
              <div className="rounded-full border border-orange-400/20 bg-orange-400/10 px-4 py-2 text-sm text-orange-100/90">
                {monthNames[month]} {year}
              </div>
              <button onClick={goNextMonth} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60 transition hover:border-white/14 hover:text-white/80">Weiter</button>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/58">
              Lies den Monat jetzt mehr wie einen Handelsfilm: welche Tage waren aktiv, welche Trades sind noch offen und an welchen Tagen ist Risiko bereits belastbar mitgeführt.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/55">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{positiveDays} grüne Tage</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{negativeDays} rote Tage</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{riskDays} Tage mit Risk-Kontext</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{screenshotDays} Tage mit Bildern</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <CalendarHighlightTile label="Aktive Tage" value={String(monthSummaries.length)} detail="mit mindestens einem Trade" icon="calendar" tone="orange" />
            <CalendarHighlightTile label="Offene Trades" value={String(openTradesInMonth)} detail="im sichtbaren Monat" icon="spark" tone="emerald" />
            <CalendarHighlightTile label="Risk-Tage" value={String(riskDays)} detail="mit Margin, Hebel oder Kontorisiko" icon="focus" tone="orange" />
            <CalendarHighlightTile label="Höchstes Kontorisiko" value={highestMonthRiskPercent ? `${formatPlainNumber(highestMonthRiskPercent, 2)}%` : '—'} detail={highestMonthRiskPercent ? 'maximal im sichtbaren Monat' : strongestDay ? `${String(strongestDay.day).padStart(2, '0')}. ${monthNames[strongestDay.month]} als stärkster Tag` : 'Noch kein Kontorisiko hinterlegt'} icon="cost" tone={highestMonthRiskPercent > 1 ? 'red' : 'orange'} />
          </div>
        </div>
      </FuturisticCard>

      <FuturisticCard className="p-5">
        <CalendarGrid year={year} month={month} summaries={summaries} selectedDateKey={selectedDateKey} onSelectDay={setSelectedDateKey} />
      </FuturisticCard>

      <FuturisticCard glow={selectedNetPnL > 0 ? 'emerald' : selectedNetPnL < 0 ? 'red' : 'none'} className="p-5">
        <SectionHeader
          eyebrow="Tagesdetail"
          title={selectedSummary ? `${String(selectedSummary.day).padStart(2, '0')}. ${monthNames[selectedSummary.month]} ${selectedSummary.year}` : 'Kein Handelstag ausgewählt'}
          copy={selectedSummary ? 'Ein Handelstag wird jetzt ruhiger gelesen: breite Boxen untereinander statt schmaler Kassenzettel. Erst Überblick, dann Risiko, dann einzelne Trades.' : 'Wähle einen aktiven Tag aus, um Kennzahlen, Tagesnotiz und Trades gemeinsam zu sehen.'}
          badge={selectedSummary ? `${selectedSummary.tradeCount} Trades` : '0 Trades'}
        />

        {selectedSummary ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-orange-400/15 bg-black/25 p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Tagesfokus</p>
                  <h3 className="mt-3 text-lg font-semibold text-orange-100/90">{featuredTrade ? featuredTrade.market || featuredTrade.setup || 'Fokus-Trade des Tages' : 'Kein Fokus-Trade vorhanden'}</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/58">{featuredTrade ? 'Der Tag startet mit einem breiten Überblick statt mit kleinen Kassenzetteln: Screenshot, Kernfakten und die wichtigsten Wege liegen jetzt ruhig untereinander.' : 'Sobald an diesem Tag ein Trade liegt, tauchen hier Screenshot und Kernfakten als schneller Tagesanker auf.'}</p>
                </div>
                {featuredTrade ? (
                  <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40">
                    {featuredTradeStatus ? <span className={`rounded-full border px-2 py-1 ${featuredTradeStatus === 'Offen' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : featuredTradeStatus === 'Unvollständig' ? 'border-orange-400/20 bg-orange-400/10 text-orange-100/90' : 'border-white/10 bg-white/5 text-white/55'}`}>{featuredTradeStatus}</span> : null}
                    {featuredTrade.direction ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{featuredTrade.direction}</span> : null}
                    {featuredTrade.setup ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{featuredTrade.setup}</span> : null}
                  </div>
                ) : null}
              </div>

              {featuredTrade ? (
                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                  <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/30">
                    {featuredTrade.screenshotUrl ? (
                      <SetupImageLightbox
                        src={featuredTrade.screenshotUrl}
                        alt={`${featuredTrade.market || 'Trade'} Screenshot`}
                        badge={featuredTrade.setup || 'Tagesbild'}
                        caption={featuredTrade.date}
                        hint="Klick für Großansicht"
                        className="rounded-none"
                        imageClassName="h-72 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-72 items-center justify-center text-sm text-white/35">Kein Screenshot für den Fokus-Trade</div>
                    )}
                  </div>

                  <div className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Kernfakten</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <MetricTile label="Asset" value={featuredTrade.market || '—'} tone="neutral" />
                      <MetricTile label="Session" value={featuredTrade.session || '—'} tone="neutral" />
                      <MetricTile label="Entry" value={featuredEntry !== undefined && featuredEntry !== null ? String(featuredEntry) : '—'} tone="neutral" />
                      <MetricTile label={featuredPartialPlan?.count ? 'Ø Exit' : 'Net P&L'} value={featuredPartialPlan?.count && featuredPartialPlan.effectiveExit !== null ? formatPlainNumber(featuredPartialPlan.effectiveExit, 4) : featuredTrade.netPnL !== undefined && featuredTrade.netPnL !== null ? `${featuredTrade.netPnL >= 0 ? '+' : ''}${featuredTrade.netPnL.toFixed(2)} €` : '—'} tone={featuredPartialPlan?.count ? 'orange' : featuredTrade.netPnL === undefined || featuredTrade.netPnL === null ? 'neutral' : featuredTrade.netPnL >= 0 ? 'emerald' : 'red'} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">Konzept: {featuredTrade.concept || '—'}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">Qualität: {featuredTrade.quality || '—'}</span>
                      {featuredPartialLabel ? <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-orange-100/90">{featuredPartialLabel}</span> : null}
                      {featuredPartialPlan?.summary ? <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{featuredPartialPlan.summary}</span> : null}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={`/trades?tradeId=${encodeURIComponent(featuredTrade.id)}`} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition hover:border-white/15 hover:text-white/90">Zum Trade</Link>
                      <Link href="/trades" className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-xs text-orange-100/90 transition hover:border-orange-400/30 hover:bg-orange-400/15">Zum Workspace</Link>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Tag im Überblick</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricTile label="Net P&amp;L" value={`${selectedNetPnL >= 0 ? '+' : ''}${selectedNetPnL.toFixed(0)} €`} tone={selectedNetPnL >= 0 ? 'emerald' : 'red'} />
                <MetricTile label="Ø R" value={`${selectedAvgR >= 0 ? '+' : ''}${selectedAvgR.toFixed(2)}R`} tone={selectedAvgR >= 0 ? 'emerald' : 'red'} />
                <MetricTile label="Offen" value={String(selectedSummary.openTradeCount)} tone={selectedSummary.openTradeCount ? 'emerald' : 'neutral'} />
                <MetricTile label="Bilder" value={String(selectedSummary.screenshotTradeCount)} tone={selectedSummary.screenshotTradeCount ? 'orange' : 'neutral'} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/58">
                {selectedSetups.length ? selectedSetups.map((setup) => <span key={setup} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{setup}</span>) : <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">Kein Setup hinterlegt</span>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/daily-note?date=${selectedDateKey}`} className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-xs text-orange-100/90 transition hover:border-orange-400/30 hover:bg-orange-400/15">Tagesnotiz öffnen</Link>
                <Link href={`/review?date=${selectedDateKey}`} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition hover:border-white/15 hover:text-white/90">Tagesreview öffnen</Link>
                <Link href="/review" className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition hover:border-white/15 hover:text-white/90">Wochenreview</Link>
              </div>
            </div>

            <div className="rounded-3xl border border-orange-400/15 bg-black/25 p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Risikorahmen des Tages</p>
                  <h3 className="mt-3 text-lg font-semibold text-orange-100/90">Nicht nur P&amp;L, sondern gebundenes Risiko lesen</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">Hier siehst du, wie viel Risiko an diesem Tag wirklich mitgeführt wurde. Margin, Hebel und Kontorisiko sitzen jetzt in breiteren Karten statt in schmalen Schlitzen.</p>
                </div>
                <Link href={selectedTrades.length ? `/trades?reviewTradeIds=${encodeURIComponent(selectedTrades.map((trade) => trade.id).join(','))}&reviewFocus=${encodeURIComponent(`Risk-Check · ${selectedDateKey}`)}` : '/trades'} className="shrink-0 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-xs text-orange-100/90 transition hover:border-orange-400/30 hover:bg-orange-400/15">Risk-Check im Workspace</Link>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <MetricTile label="Geplantes Risiko" value={selectedPlannedRisk ? formatCurrency(selectedPlannedRisk, 0) : '—'} tone={selectedPlannedRisk ? 'orange' : 'neutral'} />
                <MetricTile label="Stop-Risiko" value={selectedStopRisk ? formatCurrency(selectedStopRisk, 0) : '—'} tone={selectedStopRisk ? 'red' : 'neutral'} />
                <MetricTile label="Gebundene Margin" value={selectedMarginUsed ? formatCurrency(selectedMarginUsed, 0) : '—'} tone={selectedMarginUsed ? 'orange' : 'neutral'} />
                <MetricTile label="Höchster Hebel" value={selectedHighestLeverage ? `${formatPlainNumber(selectedHighestLeverage, 2)}x` : '—'} tone={selectedHighestLeverage > 1 ? 'orange' : 'neutral'} />
                <MetricTile label="Kontorisiko" value={selectedRiskCoverageCount ? `${selectedRiskCoverageCount}/${selectedTrades.length} Trades mit Konto-Risiko` : 'Noch kein Kontorisiko'} tone={selectedRiskCoverageCount ? 'emerald' : 'neutral'} />
                <MetricTile label="Max. Konto-Risiko" value={selectedHighestRiskPercent ? `${formatPlainNumber(selectedHighestRiskPercent, 2)}%` : '—'} tone={selectedHighestRiskPercent ? (selectedHighestRiskPercent > 1 ? 'red' : 'orange') : 'neutral'} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/58">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{selectedSummary.riskTradeCount} Trades mit Risk-Kontext</span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{selectedHighestRiskPercent ? `max ${formatPlainNumber(selectedHighestRiskPercent, 2)}% Konto` : 'Kein Kontorisiko ableitbar'}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{selectedSummary.marginUsed ? `${formatPlainNumber(selectedSummary.marginUsed, 0)} € Margin im Tag` : 'Noch keine Margin im Tag erfasst'}</span>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Trades des Tages</p>
                  <p className="mt-2 text-sm text-white/58">Hier geht es nur noch um Navigation: welcher Trade liegt an diesem Tag und was ist der nächste sinnvolle Schritt.</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/60">{selectedTrades.length} Einträge</span>
              </div>

              <div className="mt-3 space-y-3">
                {selectedTrades.map((trade) => {
                  const hasImage = Boolean(trade.screenshotUrl || (trade.screenshotCount ?? 0) > 0 || (trade.screenshotUrls?.length ?? 0) > 0)
                  const isOpen = trade.captureResult === 'open'
                  const isIncomplete = trade.captureStatus === 'incomplete' || trade.isComplete === false
                  const actionHref = isOpen
                    ? `/trades?tradeId=${encodeURIComponent(trade.id)}&closeTradeId=${encodeURIComponent(trade.id)}#trade-editor`
                    : isIncomplete
                      ? `/trades?tradeId=${encodeURIComponent(trade.id)}&editTradeId=${encodeURIComponent(trade.id)}#trade-editor`
                      : `/trades?tradeId=${encodeURIComponent(trade.id)}`

                  return (
                    <div key={trade.id} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-white">{trade.market || 'Unbenannter Trade'}</p>
                          {trade.direction ? <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">{trade.direction}</span> : null}
                          <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${isOpen ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : isIncomplete ? 'border border-orange-400/20 bg-orange-400/10 text-orange-100/90' : 'border border-white/10 bg-white/[0.03] text-white/60'}`}>
                            {isOpen ? 'Offen' : isIncomplete ? 'Unvollständig' : 'Geschlossen'}
                          </span>
                          {hasImage ? <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-orange-100/90">Bild</span> : null}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-white/52">
                          <span>Setup: {trade.setup || '—'}</span>
                          <span>Session: {trade.session || '—'}</span>
                          <span>P&amp;L: {trade.netPnL === undefined || trade.netPnL === null ? '—' : `${trade.netPnL >= 0 ? '+' : ''}${trade.netPnL.toFixed(2)} €`}</span>
                          <span>Risk: {trade.actualRiskPercent !== null && trade.actualRiskPercent !== undefined ? `${formatPlainNumber(trade.actualRiskPercent, 2)}% Konto` : trade.marginUsed ? `${formatPlainNumber(trade.marginUsed, 0)} € Margin` : 'noch dünn'}</span>
                          {trade.partialExitCoveragePercent ? <span>TP: {formatPartialExitCoverageLabel(trade.partialExitCoveragePercent, trade.partialExitRemainderPercent ?? null)}</span> : null}
                        </div>
                      </div>

                      <div className="flex flex-col items-stretch gap-2 md:w-40">
                        <Link href={`/trades?tradeId=${encodeURIComponent(trade.id)}`} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-xs text-white/65 transition hover:border-white/15 hover:text-white/85">Zum Trade</Link>
                        <Link href={actionHref} className="rounded-2xl border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-center text-xs text-orange-100/90 transition hover:border-orange-400/30 hover:bg-orange-400/15">{isOpen ? 'Schließen' : isIncomplete ? 'Vervollständigen' : 'Ansehen'}</Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className={`rounded-3xl border p-5 ${selectedNote ? 'border-orange-400/15 bg-black/25' : 'border-white/10 bg-black/20'}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Tagesnotiz</p>
                  <h3 className={`mt-3 text-lg font-semibold ${selectedNote ? 'text-orange-100/90' : 'text-white/82'}`}>{selectedNote?.title ?? 'Optionaler Tageskontext'}</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
                    {selectedNote?.note ?? 'Die Tagesnotiz bleibt bewusst optional. Sie hilft nur dann, wenn du einem Handelstag kurz Kontext geben willst, etwa warum du ausgesetzt hast oder welche Leitplanke heute galt.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40">
                  {selectedNote ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Stimmung: {selectedNote.mood ?? '—'}</span> : null}
                  {selectedNote ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Fokus: {selectedNote.focus ?? '—'}</span> : null}
                  <Link href={`/daily-note?date=${selectedDateKey}`} className={`rounded-full px-3 py-2 text-xs transition ${selectedNote ? 'border border-orange-400/20 bg-orange-400/10 text-orange-100/85 hover:border-orange-400/35 hover:bg-orange-400/15' : 'border border-white/10 bg-white/[0.03] text-white/75 hover:border-white/15 hover:text-white/90'}`}>
                    {selectedNote ? 'bearbeiten' : 'optional notieren'}
                  </Link>
                </div>
              </div>
            </div>

            {remainingScreenshotTrades.length ? (
              <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Bildstreifen des Tages</p>
                    <p className="mt-2 text-sm text-white/58">Weitere Screenshots dieses Tages als schnelle Review-Spur. Der wichtigste Screenshot sitzt schon oben im Tagesfokus.</p>
                  </div>
                  <Link href={selectedScreenshots[0] ? `/trades?tradeId=${encodeURIComponent(selectedScreenshots[0].id)}` : '/trades'} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/65 transition hover:border-white/15 hover:text-white/85">Zum Workspace</Link>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {remainingScreenshotTrades.slice(0, 3).map((trade) => (
                    <div key={trade.id} className="space-y-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
                      <SetupImageLightbox
                        src={trade.screenshotUrl!}
                        alt={`${trade.market} Screenshot`}
                        badge={trade.setup || 'Trade-Screenshot'}
                        caption={trade.date}
                        hint="Klick für Großansicht"
                        className="rounded-xl"
                        imageClassName="h-32 w-full rounded-xl object-cover"
                      />
                      <Link href={`/trades?tradeId=${encodeURIComponent(trade.id)}`} className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/70 transition hover:border-white/15 hover:text-white/90">Zum Trade</Link>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </FuturisticCard>
    </div>
  )
}

function CalendarHighlightTile({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string
  value: string
  detail: string
  tone: 'emerald' | 'red' | 'orange'
  icon: 'spark' | 'scan' | 'calendar' | 'trades' | 'focus' | 'cost'
}) {
  const toneClasses = tone === 'emerald'
    ? 'border-emerald-400/15 bg-black/20 text-emerald-300'
    : tone === 'red'
      ? 'border-red-400/15 bg-black/20 text-red-300'
      : 'border-orange-400/15 bg-black/20 text-orange-100/90'

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClasses}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{label}</p>
        <AppIcon name={icon} className="h-4 w-4 text-white/45" />
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-white/48">{detail}</p>
    </div>
  )
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'red' | 'orange' | 'neutral' }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-300' : tone === 'red' ? 'text-red-300' : tone === 'orange' ? 'text-orange-100/90' : 'text-white'

  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <p className={`mt-2 break-words text-base font-semibold leading-snug sm:text-lg ${toneClass}`}>{value}</p>
    </div>
  )
}

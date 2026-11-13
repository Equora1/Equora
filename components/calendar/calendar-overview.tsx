'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalNumberLocale, journalText } from '@/lib/i18n/journal'
import { summarizeTradeR } from '@/lib/utils/trade-r'
import { formatRMultiple } from '@/lib/utils/calculations'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'
import { SectionHeader } from '@/components/layout/section-header'
import { AppIcon } from '@/components/ui/app-icon'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import type { Trade } from '@/lib/types/trade'
import { formatCurrency, formatPartialExitCoverageLabel, formatPlainNumber, getPartialExitPlanInfo } from '@/lib/utils/calculations'
import { buildCalendarSummary, getCalendarFeaturedResult, getCalendarTradeDay, calendarDateKey } from '@/lib/utils/calendar'
import { getMonetaryScopeMessage, resolveMonetaryScope } from '@/lib/utils/currency'



export function CalendarOverview({
  trades,
  initialYear,
  initialMonth,
  todayDateKey,
  initialDateKey,
}: {
  trades: Trade[]
  initialYear: number
  initialMonth: number
  todayDateKey: string
  initialDateKey?: string | null
}) {
  const router = useRouter()
  const locale = useJournalLocale()
  const text = journalText(locale)
  const [todayYear, todayMonth] = todayDateKey.split('-').map(Number)
  const year = initialYear
  const month = initialMonth
  const [pickedDate, setSelectedDateKey] = useState<string | null>(initialDateKey ?? null)
  const [isMonthPending, startMonthTransition] = useTransition()

  const summaries = useMemo(() => buildCalendarSummary(trades), [trades])
  const monthSummaries = useMemo(
    () => summaries.filter((item) => item.year === year && item.month === month),
    [summaries, year, month],
  )
  const monthTrades = useMemo(() => trades.filter((trade) => {
    return getCalendarTradeDay(trade)?.startsWith(calendarDateKey(year, month, 1).slice(0, 7))
  }), [month, trades, year])
  const monthMonetaryScope = useMemo(() => resolveMonetaryScope(
    monthTrades.filter((trade) => trade.netPnL !== null && trade.netPnL !== undefined).map((trade) => trade.accountCurrency),
  ), [monthTrades])
  const positiveDays = monthSummaries.filter((item) => item.monetaryScope.isComparable && item.netPnL > 0).length
  const negativeDays = monthSummaries.filter((item) => item.monetaryScope.isComparable && item.netPnL < 0).length
  const screenshotDays = monthSummaries.filter((item) => item.screenshotTradeCount > 0).length
  const riskDays = monthSummaries.filter((item) => item.riskTradeCount > 0).length
  const openTradesInMonth = monthSummaries.reduce((sum, item) => sum + item.openTradeCount, 0)
  const comparableMonthSummaries = monthSummaries.filter((item) => item.monetaryScope.isComparable)
  const strongestDay = monthMonetaryScope.isComparable
    ? comparableMonthSummaries.reduce((best, item) => (!best || item.netPnL > best.netPnL ? item : best), comparableMonthSummaries[0])
    : undefined
  const highestMonthRiskPercent = monthSummaries.reduce((best, item) => item.maxActualRiskPercent !== null && item.maxActualRiskPercent !== undefined ? Math.max(best, item.maxActualRiskPercent) : best, 0)

  const monthKey = calendarDateKey(year, month, 1).slice(0, 7)
  const selectedDateKey = pickedDate?.startsWith(monthKey)
    ? pickedDate
    : year === todayYear && month === todayMonth - 1
      ? todayDateKey
      : monthSummaries.at(-1)?.dateKey ?? null
  const formatDate = (key: string) => new Intl.DateTimeFormat(journalNumberLocale[locale], {
    dateStyle: 'long', timeZone: 'UTC',
  }).format(new Date(key + 'T12:00:00Z'))
  const monthLabel = new Intl.DateTimeFormat(journalNumberLocale[locale], {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(monthKey + '-01T12:00:00Z'))

  const selectedSummary = monthSummaries.find((item) => item.dateKey === selectedDateKey)
  const selectedTrades = useMemo(() => {
    if (!selectedDateKey) return []
    return trades.filter(
      (trade) => getCalendarTradeDay(trade) === selectedDateKey,
    )
  }, [selectedDateKey, trades])
  const selectedNetPnL = selectedTrades.reduce((sum, trade) => sum + (trade.netPnL ?? 0), 0)
  const selectedMonetaryScope = resolveMonetaryScope(
    selectedTrades
      .filter((trade) => trade.netPnL !== null && trade.netPnL !== undefined || trade.plannedRiskAmount || trade.riskAmount || trade.marginUsed)
      .map((trade) => trade.accountCurrency),
  )
  const selectedAvgR = summarizeTradeR(selectedTrades).averageR
  const selectedSetups = Array.from(new Set(selectedSummary?.setups ?? []))
  const selectedScreenshots = selectedTrades.filter((trade) => trade.screenshotUrl)
  const selectedPlannedRisk = selectedTrades.reduce((sum, trade) => sum + Math.abs(trade.plannedRiskAmount ?? 0), 0)
  const selectedStopRisk = selectedTrades.reduce((sum, trade) => sum + Math.abs(trade.riskAmount ?? 0), 0)
  const selectedMarginUsed = selectedTrades.reduce((sum, trade) => sum + Math.abs(trade.marginUsed ?? 0), 0)
  const selectedHighestLeverage = selectedTrades.reduce((best, trade) => trade.leverage !== null && trade.leverage !== undefined ? Math.max(best, trade.leverage) : best, 0)
  const selectedRiskCoverageCount = selectedTrades.filter((trade) => trade.actualRiskPercent !== null && trade.actualRiskPercent !== undefined).length
  const selectedHighestRiskPercent = selectedTrades.reduce((best, trade) => trade.actualRiskPercent !== null && trade.actualRiskPercent !== undefined ? Math.max(best, trade.actualRiskPercent) : best, 0)
  const featuredTrade = selectedScreenshots[0] ?? selectedTrades[0]
  const featuredResult = featuredTrade ? getCalendarFeaturedResult(featuredTrade, locale) : null
  const featuredTradeStatus = featuredTrade
    ? featuredTrade.captureResult === 'open'
      ? 'open'
      : featuredTrade.captureStatus === 'incomplete' || featuredTrade.isComplete === false
        ? 'incomplete'
        : 'closed'
    : null
  const featuredEntry = featuredTrade ? (featuredTrade as Trade & { entry?: string | number | null }).entry : null
  const featuredPartialPlan = featuredTrade ? getPartialExitPlanInfo({ exit: featuredTrade.effectiveExit ?? null, partialExits: featuredTrade.partialExits ?? [] }) : null
  const featuredPartialLabel = featuredPartialPlan && featuredPartialPlan.count ? formatPartialExitCoverageLabel(featuredPartialPlan.coveredPercent, featuredPartialPlan.remainderPercent, featuredPartialPlan.hasOpenRemainder, locale) : null
  const remainingScreenshotTrades = selectedScreenshots.filter((trade) => trade.id !== featuredTrade?.id)
  const selectedTradeIdsParam = selectedTrades.map((trade) => trade.id).join('|')
  const selectedTradesHref = selectedTrades.length
    ? `/trades?reviewTradeIds=${encodeURIComponent(selectedTradeIdsParam)}&tradeId=${encodeURIComponent(selectedTrades[0].id)}&reviewFocus=${encodeURIComponent(text(`Kalender · ${selectedDateKey}`, `Calendar · ${selectedDateKey}`))}#trade-detail`
    : '/trades'

  function navigateToMonth(targetYear: number, targetMonth: number) {
    const normalizedDate = new Date(Date.UTC(targetYear, targetMonth, 1))
    const monthKey = `${normalizedDate.getUTCFullYear()}-${String(normalizedDate.getUTCMonth() + 1).padStart(2, '0')}`
    startMonthTransition(() => {
      router.push(`/kalender?month=${monthKey}`)
    })
  }

  function goPrevMonth() {
    navigateToMonth(year, month - 1)
  }

  function goNextMonth() {
    navigateToMonth(year, month + 1)
  }

  function goToday() {
    setSelectedDateKey(todayDateKey)
    navigateToMonth(todayYear, todayMonth - 1)
  }

  return (
    <div lang={locale} className="space-y-6">
      <FuturisticCard glow="orange" className="p-5">
        <SectionHeader
          eyebrow={text('Kalender', 'Calendar')}
          title={text('Monat', 'Month')}
          badge={text(`${monthSummaries.length} aktive Tage`, `${monthSummaries.length} active ${monthSummaries.length === 1 ? 'day' : 'days'}`)}
        />
        <p className="mb-5 text-sm leading-6 text-white/60">{text('Wähle einen Tag, um Trades und Ergebnisse zu sehen. Der Kalender verwendet Berliner Zeit.', 'Choose a month and day to view trades and daily results. Days use Berlin time.')}</p>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-orange-400/15 bg-black/25 p-5">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Monatsrahmen', 'Month')}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={goPrevMonth} disabled={isMonthPending} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60 transition hover:border-white/14 hover:text-white/80 disabled:cursor-wait disabled:opacity-50">{text('Zurück', 'Previous')}</button>
              <div className="rounded-full border border-orange-400/20 bg-orange-400/10 px-4 py-2 text-sm text-orange-100/90">
                {monthLabel}
              </div>
              <button onClick={goNextMonth} disabled={isMonthPending} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60 transition hover:border-white/14 hover:text-white/80 disabled:cursor-wait disabled:opacity-50">{text('Weiter', 'Next')}</button>
              <button onClick={goToday} disabled={isMonthPending} className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-xs text-orange-100/90 transition hover:border-orange-400/30 hover:bg-orange-400/15 disabled:cursor-wait disabled:opacity-50">{isMonthPending ? text('Lädt…', 'Loading…') : text('Heute', 'Today')}</button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/55">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{text(`${positiveDays} grüne Tage`, `${positiveDays} profitable ${positiveDays === 1 ? 'day' : 'days'}`)}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{text(`${negativeDays} rote Tage`, `${negativeDays} losing ${negativeDays === 1 ? 'day' : 'days'}`)}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{text(`${riskDays} Tage mit Risikoangaben`, `${riskDays} ${riskDays === 1 ? 'day' : 'days'} with risk recorded`)}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{text(`${screenshotDays} Tage mit Bildern`, `${screenshotDays} ${screenshotDays === 1 ? 'day' : 'days'} with images`)}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <CalendarHighlightTile label={text('Aktive Tage', 'Active days')} value={String(monthSummaries.length)} detail={text('mit Trade', 'with trades')} icon="calendar" tone="orange" />
            <CalendarHighlightTile label={text('Offene Trades', 'Open trades')} value={String(openTradesInMonth)} detail={text('im Monat', 'this month')} icon="spark" tone="emerald" />
            <CalendarHighlightTile label={text('Risk-Tage', 'Days with risk data')} value={String(riskDays)} detail={text('mit Risiko', 'with risk recorded')} icon="focus" tone="orange" />
            <CalendarHighlightTile label={text('Höchstes Kontorisiko', 'Highest account risk')} value={highestMonthRiskPercent ? `${formatPlainNumber(highestMonthRiskPercent, 2, locale)}%` : '—'} detail={highestMonthRiskPercent ? text('maximal im sichtbaren Monat', 'highest this month') : strongestDay ? text(`${formatDate(strongestDay.dateKey)} als stärkster Tag`, `Best day: ${formatDate(strongestDay.dateKey)}`) : monthMonetaryScope.kind === 'mixed' || monthMonetaryScope.kind === 'unknown' ? text('Stärkster Geld-Tag wegen Währungen gesperrt', 'Daily P&L cannot be compared across currencies') : text('Noch kein Kontorisiko hinterlegt', 'No account risk recorded')} icon="cost" tone={highestMonthRiskPercent > 1 ? 'red' : 'orange'} />
          </div>
        </div>
      </FuturisticCard>

      <FuturisticCard className="p-5">
        <CalendarGrid locale={locale} todayDateKey={todayDateKey} year={year} month={month} summaries={summaries} selectedDateKey={selectedDateKey} onSelectDay={setSelectedDateKey} />
      </FuturisticCard>

      <FuturisticCard glow={selectedMonetaryScope.isComparable && selectedNetPnL > 0 ? 'emerald' : selectedMonetaryScope.isComparable && selectedNetPnL < 0 ? 'red' : 'none'} className="p-5">
        <SectionHeader
          eyebrow={text('Tag', 'Day')}
          title={selectedSummary ? formatDate(selectedSummary.dateKey) : text('Kein Handelstag', 'No trades for this day')}
          badge={selectedSummary ? `${selectedSummary.tradeCount} ${selectedSummary.tradeCount === 1 ? 'Trade' : 'Trades'}` : '0 Trades'}
        />

        {selectedDateKey && !selectedSummary ? (
          <Link href={`/daily-note?date=${selectedDateKey}`} className="text-sm text-orange-100 underline">
            {text('Tagesnotiz öffnen', 'Open daily note')}
          </Link>
        ) : null}

        {selectedSummary ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-orange-400/15 bg-black/25 p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Trade</p>
                  <h3 className="mt-3 text-lg font-semibold text-orange-100/90">{featuredTrade ? featuredTrade.market || featuredTrade.setup || 'Fokus-Trade des Tages' : 'Kein Fokus-Trade vorhanden'}</h3>
                </div>
                {featuredTrade ? (
                  <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40">
                    {featuredTradeStatus ? <span className={`rounded-full border px-2 py-1 ${featuredTradeStatus === 'open' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : featuredTradeStatus === 'incomplete' ? 'border-orange-400/20 bg-orange-400/10 text-orange-100/90' : 'border-white/10 bg-white/5 text-white/55'}`}>{featuredTradeStatus === 'open' ? text('Offen', 'Open') : featuredTradeStatus === 'incomplete' ? text('Unvollständig', 'Incomplete') : text('Geschlossen', 'Closed')}</span> : null}
                    {featuredTrade.direction ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{featuredTrade.direction}</span> : null}
                    {featuredTrade.setup ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{featuredTrade.setup}</span> : null}
                  </div>
                ) : null}
              </div>

              {featuredTrade ? (
                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                  <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/30">
                    {featuredTrade.screenshotUrl ? (
                      <SetupImageLightbox locale={locale}
                        src={featuredTrade.screenshotUrl}
                        alt={`${featuredTrade.market || 'Trade'} Screenshot`}
                        badge={featuredTrade.setup || 'Tagesbild'}
                        caption={featuredTrade.date}
                        hint={text('Klick für Großansicht', 'Enlarge')}
                        className="rounded-none"
                        imageClassName="h-72 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-72 items-center justify-center text-sm text-white/35">{text('Kein Bild', 'No image')}</div>
                    )}
                  </div>

                  <div className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Kernfakten', 'Trade details')}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <MetricTile label="Asset" value={featuredTrade.market || '—'} tone="neutral" />
                      <MetricTile label="Session" value={featuredTrade.session || '—'} tone="neutral" />
                      <MetricTile label="Entry" value={featuredEntry !== undefined && featuredEntry !== null ? String(featuredEntry) : '—'} tone="neutral" />
                      <MetricTile label={featuredResult!.label} value={featuredResult!.value} tone={featuredPartialPlan?.count ? 'orange' : featuredTrade.netPnL === undefined || featuredTrade.netPnL === null ? 'neutral' : featuredTrade.netPnL >= 0 ? 'emerald' : 'red'} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">Konzept: {featuredTrade.concept || '—'}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{text('Qualität:', 'Quality:')} {featuredTrade.quality || '—'}</span>
                      {featuredPartialLabel ? <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-orange-100/90">{featuredPartialLabel}</span> : null}
                      {featuredPartialPlan?.summary ? <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{featuredPartialPlan.summary}</span> : null}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={`/trades?tradeId=${encodeURIComponent(featuredTrade.id)}#trade-detail`} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition hover:border-white/15 hover:text-white/90">Trade</Link>
                      <Link href={selectedTradesHref} className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-xs text-orange-100/90 transition hover:border-orange-400/30 hover:bg-orange-400/15">{text('Trades des Tages', 'Trades for this day')}</Link>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Tag im Überblick', 'Daily overview')}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricTile label="P&amp;L" value={selectedMonetaryScope.isComparable ? formatCurrency(selectedNetPnL, 0, selectedMonetaryScope.currency, locale) : text('Gesperrt', 'Unavailable')} tone={selectedMonetaryScope.isComparable ? selectedNetPnL >= 0 ? 'emerald' : 'red' : 'neutral'} />
                <MetricTile label="Ø R" value={formatRMultiple(selectedAvgR, 2, locale)} tone={selectedAvgR === null ? 'neutral' : selectedAvgR >= 0 ? 'emerald' : 'red'} />
                <MetricTile label={text('Offen', 'Open')} value={String(selectedSummary.openTradeCount)} tone={selectedSummary.openTradeCount ? 'emerald' : 'neutral'} />
                <MetricTile label={text('Bilder', 'Images')} value={String(selectedSummary.screenshotTradeCount)} tone={selectedSummary.screenshotTradeCount ? 'orange' : 'neutral'} />
              </div>
              {!selectedMonetaryScope.isComparable && selectedMonetaryScope.kind !== 'empty' ? <p className="mt-3 text-xs leading-5 text-orange-100/80">{getMonetaryScopeMessage(selectedMonetaryScope, locale)}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/58">
                {selectedSetups.length ? selectedSetups.map((setup) => <span key={setup} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{setup}</span>) : <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{text('Kein Setup hinterlegt', 'No setup recorded')}</span>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/daily-note?date=${selectedDateKey}`} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition hover:border-white/15 hover:text-white/90">{text('Tagesnotiz', 'Daily note')}</Link>
                <Link href="/review" className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70 transition hover:border-white/15 hover:text-white/90">{text('Woche', 'Week')}</Link>
                <Link href={selectedTradesHref} className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-xs text-orange-100/90 transition hover:border-orange-400/30 hover:bg-orange-400/15">{text('Trades anzeigen', 'View trades')}</Link>
              </div>
            </div>

            <div className="rounded-3xl border border-orange-400/15 bg-black/25 p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Risikorahmen des Tages', 'Risk for this day')}</p>
                  <h3 className="mt-3 text-lg font-semibold text-orange-100/90">{text('Risiko', 'Risk')}</h3>
                </div>
                <Link href={selectedTrades.length ? `/trades?reviewTradeIds=${encodeURIComponent(selectedTrades.map((trade) => trade.id).join(','))}&reviewFocus=${encodeURIComponent(`Risk-Check · ${selectedDateKey}`)}` : '/trades'} className="shrink-0 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-xs text-orange-100/90 transition hover:border-orange-400/30 hover:bg-orange-400/15">{text('Risk-Check', 'Review risk')}</Link>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <MetricTile label={text('Geplantes Risiko', 'Planned risk')} value={selectedPlannedRisk ? selectedMonetaryScope.isComparable ? formatCurrency(selectedPlannedRisk, 0, selectedMonetaryScope.currency, locale) : text('Gesperrt', 'Unavailable') : '—'} tone={selectedPlannedRisk && selectedMonetaryScope.isComparable ? 'orange' : 'neutral'} />
                <MetricTile label={text('Stop-Risiko', 'Stop risk')} value={selectedStopRisk ? selectedMonetaryScope.isComparable ? formatCurrency(selectedStopRisk, 0, selectedMonetaryScope.currency, locale) : text('Gesperrt', 'Unavailable') : '—'} tone={selectedStopRisk && selectedMonetaryScope.isComparable ? 'red' : 'neutral'} />
                <MetricTile label={text('Gebundene Margin', 'Margin used')} value={selectedMarginUsed ? selectedMonetaryScope.isComparable ? formatCurrency(selectedMarginUsed, 0, selectedMonetaryScope.currency, locale) : text('Gesperrt', 'Unavailable') : '—'} tone={selectedMarginUsed && selectedMonetaryScope.isComparable ? 'orange' : 'neutral'} />
                <MetricTile label={text('Höchster Hebel', 'Highest leverage')} value={selectedHighestLeverage ? `${formatPlainNumber(selectedHighestLeverage, 2, locale)}x` : '—'} tone={selectedHighestLeverage > 1 ? 'orange' : 'neutral'} />
                <MetricTile label={text('Kontorisiko', 'Account risk')} value={selectedRiskCoverageCount ? text(`${selectedRiskCoverageCount}/${selectedTrades.length} Trades mit Konto-Risiko`, `Account risk recorded for ${selectedRiskCoverageCount}/${selectedTrades.length} trades`) : text('Noch kein Kontorisiko', 'No account risk recorded')} tone={selectedRiskCoverageCount ? 'emerald' : 'neutral'} />
                <MetricTile label={text('Max. Konto-Risiko', 'Max. account risk')} value={selectedHighestRiskPercent ? `${formatPlainNumber(selectedHighestRiskPercent, 2, locale)}%` : '—'} tone={selectedHighestRiskPercent ? (selectedHighestRiskPercent > 1 ? 'red' : 'orange') : 'neutral'} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/58">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{text(`${selectedSummary.riskTradeCount} Trades mit Risikoangaben`, `${selectedSummary.riskTradeCount} ${selectedSummary.riskTradeCount === 1 ? 'trade' : 'trades'} with risk recorded`)}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{selectedHighestRiskPercent ? text(`max. ${formatPlainNumber(selectedHighestRiskPercent, 2, locale)}% vom Konto`, `max. ${formatPlainNumber(selectedHighestRiskPercent, 2, locale)}% of account`) : text('Kein Kontorisiko ableitbar', 'Account risk unavailable')}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{selectedSummary.marginUsed ? selectedMonetaryScope.isComparable ? text(`${formatCurrency(selectedSummary.marginUsed, 0, selectedMonetaryScope.currency, locale)} Margin im Tag`, `${formatCurrency(selectedSummary.marginUsed, 0, selectedMonetaryScope.currency, locale)} margin for this day`) : text('Margin-Summe gesperrt', 'Margin total unavailable') : text('Noch keine Margin im Tag erfasst', 'No margin recorded')}</span>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Trades des Tages', 'Trades for this day')}</p>
                  
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/60">{text(`${selectedTrades.length} ${selectedTrades.length === 1 ? 'Eintrag' : 'Einträge'}`, `${selectedTrades.length} ${selectedTrades.length === 1 ? 'entry' : 'entries'}`)}</span>
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
                          <p className="text-sm font-semibold text-white">{trade.market || text('Unbenannter Trade', 'Unnamed trade')}</p>
                          {trade.direction ? <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">{trade.direction}</span> : null}
                          <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${isOpen ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : isIncomplete ? 'border border-orange-400/20 bg-orange-400/10 text-orange-100/90' : 'border border-white/10 bg-white/[0.03] text-white/60'}`}>
                            {isOpen ? text('Offen', 'Open') : isIncomplete ? text('Unvollständig', 'Incomplete') : text('Geschlossen', 'Closed')}
                          </span>
                          {hasImage ? <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-orange-100/90">{text('Bild', 'Image')}</span> : null}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-white/52">
                          <span>Setup: {trade.setup || '—'}</span>
                          <span>Session: {trade.session || '—'}</span>
                          <span>P&amp;L: {trade.netPnL === undefined || trade.netPnL === null ? '—' : formatCurrency(trade.netPnL, 2, trade.accountCurrency, locale)}</span>
                          <span>{text('Risiko:', 'Risk:')} {trade.actualRiskPercent !== null && trade.actualRiskPercent !== undefined ? text(`${formatPlainNumber(trade.actualRiskPercent, 2, locale)}% vom Konto`, `${formatPlainNumber(trade.actualRiskPercent, 2, locale)}% of account`) : trade.marginUsed ? `${formatCurrency(trade.marginUsed, 0, trade.accountCurrency, locale)} Margin` : '—'}</span>
                          {trade.partialExitCoveragePercent ? <span>TP: {formatPartialExitCoverageLabel(trade.partialExitCoveragePercent, trade.partialExitRemainderPercent ?? null, trade.partialExitHasOpenRemainder, locale)}</span> : null}
                        </div>
                      </div>

                      <div className="flex flex-col items-stretch gap-2 md:w-40">
                        <Link href={`/trades?tradeId=${encodeURIComponent(trade.id)}#trade-detail`} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-xs text-white/65 transition hover:border-white/15 hover:text-white/85">Trade</Link>
                        <Link href={actionHref} className="rounded-2xl border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-center text-xs text-orange-100/90 transition hover:border-orange-400/30 hover:bg-orange-400/15">{isOpen ? text('Schließen', 'Close') : isIncomplete ? text('Vervollständigen', 'Complete') : text('Ansehen', 'View')}</Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {remainingScreenshotTrades.length ? (
              <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Bilder', 'Images')}</p>
                  </div>
                  <Link href={selectedScreenshots[0] ? `/trades?tradeId=${encodeURIComponent(selectedScreenshots[0].id)}#trade-detail` : '/trades'} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/65 transition hover:border-white/15 hover:text-white/85">Trades</Link>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {remainingScreenshotTrades.slice(0, 3).map((trade) => (
                    <div key={trade.id} className="space-y-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
                      <SetupImageLightbox locale={locale}
                        src={trade.screenshotUrl!}
                        alt={`${trade.market} Screenshot`}
                        badge={trade.setup || text('Trade-Screenshot', 'Trade screenshot')}
                        caption={trade.date}
                        hint={text('Klick für Großansicht', 'Enlarge')}
                        className="rounded-xl"
                        imageClassName="h-32 w-full rounded-xl object-cover"
                      />
                      <Link href={`/trades?tradeId=${encodeURIComponent(trade.id)}#trade-detail`} className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/70 transition hover:border-white/15 hover:text-white/90">Trade</Link>
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

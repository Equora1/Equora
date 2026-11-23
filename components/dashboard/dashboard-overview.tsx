import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { ReactNode } from 'react'
import Link from 'next/link'
import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { EquityCurveCard } from '@/components/dashboard/equity-curve-card'
import { RecentTradesCard } from '@/components/dashboard/recent-trades-card'
import { DashboardDetails } from '@/components/dashboard/dashboard-details'
import { StatsGrid } from '@/components/dashboard/stats-grid'
import { TodaySummaryCard } from '@/components/dashboard/today-summary-card'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { formatCurrency, formatPlainNumber, formatRMultiple } from '@/lib/utils/calculations'
import {
  buildDashboardMetricModel,
  getDashboardMoneyLockReason,
  resolveDashboardDataState,
  scopeDashboardTrades,
  type DashboardAvailability,
  type DashboardSearchParams,
} from '@/lib/utils/dashboard'
import { getBerlinTodayDateKey } from '@/lib/utils/daily-notes'
import { getTradeTrustSummary } from '@/lib/utils/trade-trust'

type DashboardOverviewProps = {
  trades: Trade[]
  dailyNotes: DailyNoteRow[]
  source: 'supabase' | 'mock'
  availability: DashboardAvailability
  locale?: JournalLocale
  params?: DashboardSearchParams
  today?: string
  checkIn?: ReactNode
}

export function DashboardOverview({ trades: allTrades, dailyNotes, source, availability, locale = 'de',
  params = {}, today = getBerlinTodayDateKey(), checkIn }: DashboardOverviewProps) {
  const text = journalText(locale)
  const dataState = resolveDashboardDataState({ source, availability, tradeCount: allTrades.length })
  if (dataState === 'unavailable' || dataState === 'unauthenticated') {
    return <UnavailableDashboard state={dataState} locale={locale} />
  }

  const scope = scopeDashboardTrades(allTrades, params, today, locale)
  const { trades } = scope
  const { trustedTrades, metrics, monetaryScope, moneyComparable, documentedR, evidenceState } = buildDashboardMetricModel(trades)
  const hasDescriptiveSample = evidenceState === 'descriptive'
  const moneyLockReason = getDashboardMoneyLockReason({
    scopeKind: monetaryScope.kind,
    trustedTradeCount: trustedTrades.length,
  }, locale)
  const metricItems = [
    {
      label: text('Netto-P&L', 'Net P&L'),
      value: trustedTrades.length && moneyComparable
        ? formatCurrency(metrics.netPnL, 0, metrics.currency, locale)
        : '—',
      hint: moneyComparable ? text(`${metrics.resolvedTrades} ${metrics.resolvedTrades === 1 ? 'abgeschlossener Trade' : 'abgeschlossene Trades'}`, `${metrics.resolvedTrades} closed ${metrics.resolvedTrades === 1 ? 'trade' : 'trades'}`) : moneyLockReason ?? text('Keine Ergebnisse', 'No results'),
      tone: hasDescriptiveSample && moneyComparable && metrics.netPnL !== 0
        ? (metrics.netPnL > 0 ? 'positive' : 'negative')
        : 'gold',
    },
    {
      label: text('Winrate', 'Win rate'),
      value: metrics.resolvedTrades ? `${formatPlainNumber(metrics.winRate, 0, locale)}%` : '—',
      hint: metrics.resolvedTrades
        ? text(`${metrics.winners} Gewinner · ${metrics.losers} Verlierer · ${metrics.breakeven} Break-even`, `${metrics.winners} ${metrics.winners === 1 ? 'win' : 'wins'} · ${metrics.losers} ${metrics.losers === 1 ? 'loss' : 'losses'} · ${metrics.breakeven} break-even`)
        : text('Noch keine belastbare Basis', 'No reliable results yet'),
      tone: 'neutral',
    },
    {
      label: 'Profit Factor',
      value: metrics.resolvedTrades && metrics.losers && moneyComparable
        ? formatPlainNumber(metrics.profitFactor, 2, locale)
        : '—',
      hint: moneyLockReason
        ? moneyLockReason
        : metrics.resolvedTrades && !metrics.losers
          ? text('Keine Verlusttrades', 'No losing trades')
          : text('Gewinne im Verhältnis zu Verlusten', 'Total wins divided by total losses'),
      tone: 'neutral',
    },
    {
      label: text('Ø dokumentiertes R', 'Average recorded R'),
      value: documentedR.averageR !== null ? formatRMultiple(documentedR.averageR, 2, locale) : '—',
      hint: text(
        `${documentedR.documentedCount} von ${documentedR.eligibleCount} mit erfasstem R`,
        `${documentedR.documentedCount} of ${documentedR.eligibleCount} with recorded R`,
      ),
      tone: hasDescriptiveSample && documentedR.averageR !== null
        ? documentedR.averageR > 0
          ? 'positive'
          : documentedR.averageR < 0
            ? 'negative'
            : 'neutral'
        : 'neutral',
    },
    {
      label: text('Ø Ergebnis je Abschluss', 'Average P&L per closed trade'),
      value: metrics.resolvedTrades && moneyComparable
        ? formatCurrency(metrics.expectancy, 0, metrics.currency, locale)
        : '—',
      hint: text('Bisheriges Nettoergebnis je berücksichtigtem Abschluss', 'Net result per closed trade included in the totals'),
      tone: hasDescriptiveSample && moneyComparable && metrics.expectancy !== 0
        ? (metrics.expectancy > 0 ? 'positive' : 'negative')
        : 'neutral',
    },
  ] as const

  return (
    <div lang={locale} className="min-w-0 space-y-5 xl:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{text('Trading-Übersicht', 'Trading overview')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {checkIn}
          <Link href="/trades?focus=ledger#ledger-capture" className="inline-flex min-h-10 items-center rounded-xl border border-[#c8823a]/45 bg-[#f0a855] px-3.5 py-2 text-sm font-semibold text-[#1b1006] hover:bg-[#ffc57d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]">
            {text('Trade erfassen', 'Log a trade')}
          </Link>
        </div>
      </div>
      {dataState === 'demo' ? <DemoDataBanner locale={locale} /> : null}
      <DashboardFilters scope={scope} locale={locale} />
      <StatsGrid items={metricItems.slice(0, 3)} />
      {evidenceState === 'insufficient' && <p className="text-xs text-white/60">{text('Kleine Stichprobe', 'Small sample')}</p>}
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(270px,1fr)]">
        <EquityCurveCard trades={trades} locale={locale} monetaryScope={monetaryScope} />
        <RecentTradesCard trades={trades.slice(0, 5)} locale={locale} />
      </div>

      <DashboardDetails trades={trades} trustedTrades={trustedTrades} metrics={metrics} moneyComparable={moneyComparable} locale={locale} today={today} />
      <details className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3">
        <summary className="cursor-pointer py-1 text-sm font-medium text-white/80">{text('Weitere Kennzahlen und Datenqualität', 'More metrics and data quality')}</summary>
        <div className="mt-4 space-y-4">
          <StatsGrid items={metricItems.slice(3)} />
          <DataQualityCard trades={trades} locale={locale} />
          <TodaySummaryCard trades={allTrades} dailyNotes={dailyNotes} locale={locale} />
        </div>
      </details>
    </div>
  )
}

function DashboardFilters({ scope, locale }: { scope: ReturnType<typeof scopeDashboardTrades>; locale: JournalLocale }) {
  const text = journalText(locale)
  const control = 'min-h-10 w-full min-w-0 rounded-lg border border-white/15 bg-[#171412] px-2.5 py-1.5 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]'
  return (
    <form action="/dashboard" method="get" className="grid grid-cols-2 items-end gap-2 rounded-2xl border border-white/10 bg-[#151210] p-3 sm:flex sm:flex-wrap sm:gap-3">
      <label className="min-w-0 text-xs text-white/70 sm:w-40">
        {text('Zeitraum', 'Period')}
        <select name="period" defaultValue={scope.period} className={`mt-1 block ${control}`}>
          <option value="all">{text('Gesamter Verlauf', 'All time')}</option>
          <option value="7">{text('Letzte 7 Tage', 'Last 7 days')}</option>
          <option value="30">{text('Letzte 30 Tage', 'Last 30 days')}</option>
          <option value="90">{text('Letzte 90 Tage', 'Last 90 days')}</option>
        </select>
      </label>
      <label className="min-w-0 text-xs text-white/70 sm:w-44">
        {text('Konto', 'Account')}
        <select name="account" defaultValue={scope.account} className={`mt-1 block ${control}`}>
          <option value="">{text('Alle Konten', 'All accounts')}</option>
          {!scope.isKnownAccount && <option value={scope.account} disabled>{text('Konto nicht verfügbar', 'Account unavailable')}</option>}
          {scope.accounts.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <button type="submit" className="col-span-2 min-h-10 rounded-lg border border-[#c8823a]/40 bg-[#c8823a]/10 px-3 text-sm font-medium text-[#f3bd7f] hover:bg-[#c8823a]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]">
        {text('Anwenden', 'Apply')}
      </button>
    </form>
  )
}

function DataQualityCard({ trades, locale }: { trades: Trade[]; locale: JournalLocale }) {
  const text = journalText(locale)
  const trust = getTradeTrustSummary(trades)
  const coverage = Math.round(trust.trustedCoverage)
  const statusRows = [
    { label: text('Berücksichtigt', 'Included'), value: trust.trustedTrades, tone: 'text-emerald-300' },
    { label: text('Offen', 'Open'), value: trust.openTrades, tone: 'text-[#e8b978]' },
    { label: text('Unvollständig', 'Incomplete'), value: trust.incompleteTrades, tone: 'text-[#e8b978]' },
    { label: text('Ohne P&L', 'No P&L'), value: trust.completeWithoutPnL, tone: 'text-white/70' },
    { label: text('Währung fehlt', 'Currency missing'), value: trust.missingCurrencyTrades, tone: 'text-red-300' },
    { label: text('Konflikt', 'Conflicting data'), value: trust.conflictingTrades, tone: 'text-red-300' },
  ]

  return (
    <FuturisticCard className="h-full p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eq-eyebrow">{text('Datenqualität', 'Data quality')}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{text('Welche Trades zählen?', 'Which trades count?')}</h2>
        </div>
        <span className="eq-pill-soft px-3 py-1.5 text-xs tabular-nums">{coverage}%</span>
      </div>

      <div
        className="mt-6 h-2 overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-label={text('Anteil der für Kennzahlen berücksichtigten Trades', 'Share of trades included in the metrics')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={coverage}
      >
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#9f6428,#f0a855)]"
          style={{ width: `${coverage}%` }}
        />
      </div>
      <p className="mt-3 text-xs leading-5 text-white/60">
        {text(
          'Offene Trades und Einträge mit fehlenden oder widersprüchlichen Angaben zählen nicht mit. Geldbeträge werden zusätzlich nur bei vergleichbaren Währungen zusammengefasst.',
          'Metrics exclude open trades and trades with missing or conflicting information. P&L is only added up when the currencies are comparable.',
        )}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {statusRows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/60">{row.label}</p>
            <p className={`mt-2 text-xl font-semibold tabular-nums ${row.tone}`}>{row.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-[#c8823a]/15 bg-[#c8823a]/[0.05] px-4 py-3">
        <p className="text-xs leading-5 text-[#d8b98f]">
          {trust.needsAttention
            ? text(`${trust.needsAttention} ${trust.needsAttention === 1 ? 'Eintrag' : 'Einträge'} noch prüfen.`, `${trust.needsAttention} ${trust.needsAttention === 1 ? 'trade needs' : 'trades need'} a check.`)
            : trades.length
              ? text('Bei den sichtbaren Einträgen wurden keine offenen Datenlücken erkannt.', 'The trades shown have no outstanding data issues.')
              : text('Noch keine Trades vorhanden.', 'No trades yet.')}
        </p>
      </div>
    </FuturisticCard>
  )
}

function DemoDataBanner({ locale }: { locale: JournalLocale }) {
  const text = journalText(locale)
  return (
    <FuturisticCard glow="orange" className="border-[#c8823a]/25 bg-[#c8823a]/[0.07] px-3 py-2" role="status">
      <p className="text-xs font-medium text-[#f3bd7f]">{text('Demo-Daten · Beispieltrades', 'Demo data · sample trades')}</p>
    </FuturisticCard>
  )
}

function UnavailableDashboard({ state, locale }: { state: 'unavailable' | 'unauthenticated'; locale: JournalLocale }) {
  const text = journalText(locale)
  const unavailable = state === 'unavailable'

  return (
    <FuturisticCard lang={locale} glow="orange" className="p-6 sm:p-8" role="alert">
      <p className="eq-eyebrow">{text('Übersicht', 'Overview')}</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        {unavailable ? text('Performance-Daten konnten nicht geladen werden', 'Performance data could not be loaded') : text('Sitzung nicht verfügbar', 'Session unavailable')}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
        {unavailable
          ? text('Equora zeigt bewusst keine leeren oder geschätzten Kennzahlen an. Bitte lade die Ansicht später erneut.', 'Please reload the dashboard later. Equora only shows metrics when the data is available.')
          : text('Bitte melde dich erneut an, um dein Journal und deine Ergebnisse zu sehen.', 'Please sign in again to see your journal and results.')}
      </p>
    </FuturisticCard>
  )
}

import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { EquityCurveCard } from '@/components/dashboard/equity-curve-card'
import { RecentTradesCard } from '@/components/dashboard/recent-trades-card'
import { SimpleStartCard } from '@/components/dashboard/simple-start-card'
import { StatsGrid } from '@/components/dashboard/stats-grid'
import { TodaySummaryCard } from '@/components/dashboard/today-summary-card'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { formatCurrency, formatPlainNumber, formatRMultiple } from '@/lib/utils/calculations'
import {
  buildDashboardMetricModel,
  getDashboardMoneyLockReason,
  resolveDashboardDataState,
  type DashboardAvailability,
} from '@/lib/utils/dashboard'
import { MIN_ANALYTICS_SAMPLE_SIZE } from '@/lib/utils/statistics-scope'
import { getTradeTrustSummary } from '@/lib/utils/trade-trust'

type DashboardOverviewProps = {
  trades: Trade[]
  dailyNotes: DailyNoteRow[]
  source: 'supabase' | 'mock'
  availability: DashboardAvailability
  locale?: JournalLocale
}

export function DashboardOverview({ trades, dailyNotes, source, availability, locale = 'de' }: DashboardOverviewProps) {
  const text = journalText(locale)
  const dataState = resolveDashboardDataState({ source, availability, tradeCount: trades.length })
  if (dataState === 'unavailable' || dataState === 'unauthenticated') {
    return <UnavailableDashboard state={dataState} locale={locale} />
  }

  const { trustedTrades, metrics, moneyComparable, documentedR, evidenceState } = buildDashboardMetricModel(trades)
  const hasDescriptiveSample = evidenceState === 'descriptive'
  const moneyLockReason = getDashboardMoneyLockReason({
    scopeKind: metrics.monetaryScope.kind,
    trustedTradeCount: trustedTrades.length,
  }, locale)
  const evidenceLabel = evidenceState === 'descriptive'
    ? text('Bisherige Ergebnisse', 'Results so far')
    : evidenceState === 'empty'
      ? text('Noch keine Datengrundlage', 'No trade data yet')
      : evidenceState === 'untrusted'
        ? text('Noch keine auswertbaren Abschlüsse', 'No closed trades to analyse yet')
        : text(`Kleine Stichprobe · ${trustedTrades.length}/${MIN_ANALYTICS_SAMPLE_SIZE}`, `Small sample · ${trustedTrades.length}/${MIN_ANALYTICS_SAMPLE_SIZE}`)
  const metricItems = [
    {
      label: text('Netto P&L', 'Net P&L'),
      value: trustedTrades.length && moneyComparable
        ? formatCurrency(metrics.netPnL, 0, metrics.currency, locale)
        : trustedTrades.length
          ? text('Gesperrt', 'Unavailable')
          : '—',
      hint: moneyComparable ? text(`${metrics.resolvedTrades} belastbare Abschlüsse`, `${metrics.resolvedTrades} closed ${metrics.resolvedTrades === 1 ? 'trade' : 'trades'} with reliable results`) : moneyLockReason ?? text('Keine monetären Abschlüsse', 'No closed trades with P&L'),
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
          ? text('Keine Verlusttrades für einen Quotienten', 'No losing trades to calculate a ratio')
          : text('Bruttogewinn zu Bruttoverlust', 'Gross profit divided by gross loss'),
      tone: 'neutral',
    },
    {
      label: text('Ø dokumentiertes R', 'Average recorded R'),
      value: documentedR.averageR !== null ? formatRMultiple(documentedR.averageR, 2, locale) : '—',
      hint: text(
        `${documentedR.documentedCount} von ${documentedR.eligibleCount} belastbaren Trades mit realisiertem oder manuell dokumentiertem R`,
        `${documentedR.documentedCount} of ${documentedR.eligibleCount} reliable trades have realised or manually recorded R`,
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
    <div lang={locale} className="space-y-5 xl:space-y-6">
      {dataState === 'demo' ? <DemoDataBanner locale={locale} /> : null}
      <SimpleStartCard
        tradeCount={trades.length}
        trustedTradeCount={trustedTrades.length}
        evidenceLabel={evidenceLabel}
        locale={locale}
      />
      <TodaySummaryCard trades={trades} dailyNotes={dailyNotes} locale={locale} />
      <StatsGrid items={metricItems} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.65fr)]">
        <EquityCurveCard trades={trades} locale={locale} />
        <DataQualityCard trades={trades} locale={locale} />
      </div>

      <RecentTradesCard trades={trades.slice(0, 7)} locale={locale} />
    </div>
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
    <FuturisticCard glow="orange" className="border-[#c8823a]/25 bg-[#c8823a]/[0.07] px-5 py-4" role="status">
      <p className="text-sm font-semibold text-[#f3bd7f]">{text('Demo-Daten aktiv', 'Demo data')}</p>
      <p className="mt-1 text-xs leading-5 text-white/70">
        {text('Alle sichtbaren Trades und Kennzahlen sind Beispiele. Sie stellen keine reale Konto- oder Trading-Performance dar.', 'These trades and metrics are examples. They do not reflect real account or trading performance.')}
      </p>
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

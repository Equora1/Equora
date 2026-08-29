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
}

export function DashboardOverview({ trades, dailyNotes, source, availability }: DashboardOverviewProps) {
  const dataState = resolveDashboardDataState({ source, availability, tradeCount: trades.length })
  if (dataState === 'unavailable' || dataState === 'unauthenticated') {
    return <UnavailableDashboard state={dataState} />
  }

  const { trustedTrades, metrics, moneyComparable, documentedR, evidenceState } = buildDashboardMetricModel(trades)
  const hasDescriptiveSample = evidenceState === 'descriptive'
  const moneyLockReason = getDashboardMoneyLockReason({
    scopeKind: metrics.monetaryScope.kind,
    trustedTradeCount: trustedTrades.length,
  })
  const evidenceLabel = evidenceState === 'descriptive'
    ? 'Deskriptive Auswertung'
    : evidenceState === 'empty'
      ? 'Noch keine Datengrundlage'
      : evidenceState === 'untrusted'
        ? 'Keine belastbaren Abschlüsse'
        : `Kleine Stichprobe · ${trustedTrades.length}/${MIN_ANALYTICS_SAMPLE_SIZE}`
  const metricItems = [
    {
      label: 'Netto P&L',
      value: trustedTrades.length && moneyComparable
        ? formatCurrency(metrics.netPnL, 0, metrics.currency)
        : trustedTrades.length
          ? 'Gesperrt'
          : '—',
      hint: moneyComparable ? `${metrics.resolvedTrades} belastbare Abschlüsse` : moneyLockReason ?? 'Keine monetären Abschlüsse',
      tone: hasDescriptiveSample && moneyComparable && metrics.netPnL !== 0
        ? (metrics.netPnL > 0 ? 'positive' : 'negative')
        : 'gold',
    },
    {
      label: 'Win Rate',
      value: metrics.resolvedTrades ? `${formatPlainNumber(metrics.winRate, 0)}%` : '—',
      hint: metrics.resolvedTrades
        ? `${metrics.winners} Gewinner · ${metrics.losers} Verlierer · ${metrics.breakeven} Break-even`
        : 'Noch keine belastbare Basis',
      tone: 'neutral',
    },
    {
      label: 'Profit Factor',
      value: metrics.resolvedTrades && metrics.losers && moneyComparable
        ? formatPlainNumber(metrics.profitFactor, 2)
        : '—',
      hint: moneyLockReason
        ? moneyLockReason
        : metrics.resolvedTrades && !metrics.losers
          ? 'Keine Verlusttrades für einen Quotienten'
          : 'Bruttogewinn zu Bruttoverlust',
      tone: 'neutral',
    },
    {
      label: 'Ø dokumentiertes R',
      value: documentedR.averageR !== null ? formatRMultiple(documentedR.averageR) : '—',
      hint: `${documentedR.documentedCount} von ${documentedR.eligibleCount} belastbaren Trades mit realisiertem oder manuell dokumentiertem R`,
      tone: hasDescriptiveSample && documentedR.averageR !== null
        ? documentedR.averageR > 0
          ? 'positive'
          : documentedR.averageR < 0
            ? 'negative'
            : 'neutral'
        : 'neutral',
    },
    {
      label: 'Expectancy',
      value: metrics.resolvedTrades && moneyComparable
        ? formatCurrency(metrics.expectancy, 0, metrics.currency)
        : '—',
      hint: 'Durchschnitt je belastbarem Abschluss',
      tone: hasDescriptiveSample && moneyComparable && metrics.expectancy !== 0
        ? (metrics.expectancy > 0 ? 'positive' : 'negative')
        : 'neutral',
    },
  ] as const

  return (
    <div className="space-y-5 xl:space-y-6">
      {dataState === 'demo' ? <DemoDataBanner /> : null}
      <SimpleStartCard
        tradeCount={trades.length}
        trustedTradeCount={trustedTrades.length}
        evidenceLabel={evidenceLabel}
      />
      <TodaySummaryCard trades={trades} dailyNotes={dailyNotes} />
      <StatsGrid items={metricItems} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.65fr)]">
        <EquityCurveCard trades={trades} />
        <DataQualityCard trades={trades} />
      </div>

      <RecentTradesCard trades={trades.slice(0, 7)} />
    </div>
  )
}

function DataQualityCard({ trades }: { trades: Trade[] }) {
  const trust = getTradeTrustSummary(trades)
  const coverage = Math.round(trust.trustedCoverage)
  const statusRows = [
    { label: 'Belastbar', value: trust.trustedTrades, tone: 'text-emerald-300' },
    { label: 'Offen', value: trust.openTrades, tone: 'text-[#e8b978]' },
    { label: 'Unvollständig', value: trust.incompleteTrades, tone: 'text-[#e8b978]' },
    { label: 'Ohne P&L', value: trust.completeWithoutPnL, tone: 'text-white/70' },
    { label: 'Währung fehlt', value: trust.missingCurrencyTrades, tone: 'text-red-300' },
    { label: 'Konflikt', value: trust.conflictingTrades, tone: 'text-red-300' },
  ]

  return (
    <FuturisticCard className="h-full p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eq-eyebrow">Datenqualität</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Vertrauensstatus</h2>
        </div>
        <span className="eq-pill-soft px-3 py-1.5 text-xs tabular-nums">{coverage}%</span>
      </div>

      <div
        className="mt-6 h-2 overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-label="Anteil belastbarer Trades"
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
        Kennzahlen verwenden ausschließlich belastbare Abschlüsse. Offene oder widersprüchliche Datensätze werden nicht still eingerechnet.
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
            ? `${trust.needsAttention} Eintrag${trust.needsAttention === 1 ? '' : 'e'} brauchen noch eine Prüfung.`
            : trades.length
              ? 'Alle sichtbaren Einträge erfüllen den aktuellen Vertrauensvertrag.'
              : 'Noch keine Trades vorhanden.'}
        </p>
      </div>
    </FuturisticCard>
  )
}

function DemoDataBanner() {
  return (
    <FuturisticCard glow="orange" className="border-[#c8823a]/25 bg-[#c8823a]/[0.07] px-5 py-4" role="status">
      <p className="text-sm font-semibold text-[#f3bd7f]">Demo-Daten aktiv</p>
      <p className="mt-1 text-xs leading-5 text-white/70">
        Alle sichtbaren Trades und Kennzahlen sind Beispiele. Sie stellen keine reale Konto- oder Trading-Performance dar.
      </p>
    </FuturisticCard>
  )
}

function UnavailableDashboard({ state }: { state: 'unavailable' | 'unauthenticated' }) {
  const unavailable = state === 'unavailable'

  return (
    <FuturisticCard glow="orange" className="p-6 sm:p-8" role="alert">
      <p className="eq-eyebrow">Performance Center</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        {unavailable ? 'Performance-Daten konnten nicht geladen werden' : 'Sitzung nicht verfügbar'}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
        {unavailable
          ? 'Equora zeigt bewusst keine leeren oder geschätzten Kennzahlen an. Bitte lade die Ansicht später erneut.'
          : 'Equora zeigt ohne verifizierte Sitzung keine Journal- oder Performancewerte an.'}
      </p>
    </FuturisticCard>
  )
}

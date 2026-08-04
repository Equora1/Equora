import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'
import { buildStreakMetrics, getCoreMetrics } from '@/lib/utils/analytics'
import { resolveTradeOccurredAt } from '@/lib/utils/trade-time'
import { getTrustedTrades } from '@/lib/utils/trade-trust'

export function TodaySummaryCard({ trades, dailyNotes }: { trades: Trade[]; dailyNotes: DailyNoteRow[] }) {
  const todayKey = toLocalDateKey(new Date())
  const todaysTrades = trades.filter((trade) => toLocalDateKey(resolveTradeOccurredAt(trade)) === todayKey)
  const trustedToday = getTrustedTrades(todaysTrades)
  const metrics = getCoreMetrics(trustedToday)
  const documentedRCount = trustedToday.filter(hasDocumentedR).length
  const note = dailyNotes.find((entry) => toLocalDateKey(entry.trade_date) === todayKey)
  const headline = buildTodayHeadline(todaysTrades.length, trustedToday.length, metrics.netPnL, metrics.monetaryScope.isComparable)
  const closingLine = buildClosingLine(todaysTrades.length, trustedToday.length, metrics.netPnL, metrics.monetaryScope.isComparable)
  const reviewState = getReviewState(todaysTrades.length, note)
  const streak = buildStreakMetrics(getTrustedTrades(trades))
  const streakLine = buildStreakLine(streak.currentWinStreak, streak.currentLossStreak)

  return (
    <FuturisticCard glow="none" className="p-5 xl:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-[#998a72]">Heute</p>
          <h2 className="eq-display mt-3 text-2xl text-white">{headline}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">{closingLine}</p>
          {streakLine ? (
            <p className="mt-3 inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-medium text-orange-100/85">
              {streakLine}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
          <TodayStat label="Trades" value={String(todaysTrades.length)} detail="heute" />
          <TodayStat
            label="P&L"
            value={trustedToday.length ? metrics.monetaryScope.isComparable ? formatCurrency(metrics.netPnL, 0, metrics.currency) : 'Gesperrt' : '—'}
            detail={trustedToday.length ? (documentedRCount ? `Ø ${formatRMultiple(metrics.averageR)}` : 'R offen') : 'offen'}
            tone={trustedToday.length ? (metrics.netPnL >= 0 ? 'green' : 'red') : 'neutral'}
          />
          <TodayStat
            label="Review"
            value={reviewState.value}
            detail={reviewState.detail}
            tone={reviewState.tone}
          />
        </div>
      </div>
    </FuturisticCard>
  )
}

function TodayStat({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail: string; tone?: 'green' | 'red' | 'neutral' }) {
  const valueClass = tone === 'green' ? 'text-emerald-300' : tone === 'red' ? 'text-red-300' : 'text-white'

  return (
    <div className="rounded-[22px] border border-white/10 bg-black/22 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <p className={`mt-3 whitespace-nowrap text-xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-white/50">{detail}</p>
    </div>
  )
}

function hasDocumentedR(trade: Trade) {
  if (trade.rValue !== null && trade.rValue !== undefined && Number.isFinite(trade.rValue)) return true
  return typeof trade.r === 'string' ? trade.r.trim().length > 0 : trade.r !== null && trade.r !== undefined
}

function buildTodayHeadline(todayTrades: number, trustedTrades: number, netPnL: number, moneyComparable: boolean) {
  if (!todayTrades) return 'Kein Trade heute'
  if (!trustedTrades) return todayTrades === 1 ? '1 Trade offen' : `${todayTrades} Trades offen`
  if (!moneyComparable) return 'Geld-Auswertung gesperrt'
  if (netPnL > 0) return 'Grüner Tag'
  if (netPnL < 0) return 'Roter Tag'
  return 'Neutraler Tag'
}

function buildClosingLine(todayTrades: number, trustedTrades: number, netPnL: number, moneyComparable: boolean) {
  if (!todayTrades) return 'Kein Trade heute. Plan abwarten.'
  if (!trustedTrades) return todayTrades === 1 ? '1 Trade offen. Abschluss ergänzen.' : `${todayTrades} Trades offen. Abschluss ergänzen.`
  if (!moneyComparable) return 'Währungen fehlen oder sind gemischt. P&L wird nicht summiert.'
  if (netPnL > 0) return 'Grüner Tag. Prozess halten und sauber abschließen.'
  if (netPnL < 0) return 'Roter Tag. Kurz prüfen, Druck rausnehmen.'
  return 'Neutraler Tag. Regel prüfen, nicht nachjagen.'
}

function buildStreakLine(currentWinStreak: number, currentLossStreak: number) {
  if (currentLossStreak >= 2) return `${currentLossStreak} rote Trades in Folge. Size prüfen.`
  if (currentLossStreak === 1) return '1 roter Trade. Nächsten Entry sauber planen.'
  if (currentWinStreak >= 3) return `${currentWinStreak} grüne Trades in Folge. Standard halten.`
  if (currentWinStreak > 0) return `${currentWinStreak} grüner Trade${currentWinStreak === 1 ? '' : 's'} in Folge.`
  return ''
}

function getReviewState(todayTrades: number, note: DailyNoteRow | undefined): { value: string; detail: string; tone: 'green' | 'red' | 'neutral' } {
  if (note) {
    return {
      value: 'notiert',
      detail: note.mood?.trim() || note.note?.trim()?.slice(0, 28) || 'fertig',
      tone: 'green',
    }
  }

  if (todayTrades > 0) {
    return { value: 'offen', detail: 'kurz prüfen', tone: 'neutral' }
  }

  return { value: '—', detail: 'kein Trade', tone: 'neutral' }
}

function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

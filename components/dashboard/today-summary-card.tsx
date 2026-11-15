import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'
import { buildStreakMetrics, getCoreMetrics } from '@/lib/utils/analytics'
import { resolveTradeOccurredAt } from '@/lib/utils/trade-time'
import { getTrustedTrades } from '@/lib/utils/trade-trust'

export function TodaySummaryCard({ trades, dailyNotes, locale = 'de' }: { trades: Trade[]; dailyNotes: DailyNoteRow[]; locale?: JournalLocale }) {
  const text = journalText(locale)
  const todayKey = toLocalDateKey(new Date())
  const todaysTrades = trades.filter((trade) => toLocalDateKey(resolveTradeOccurredAt(trade)) === todayKey)
  const trustedToday = getTrustedTrades(todaysTrades)
  const metrics = getCoreMetrics(trustedToday)
  const documentedRCount = metrics.rCount
  const note = dailyNotes.find((entry) => toLocalDateKey(entry.trade_date) === todayKey)
  const headline = buildTodayHeadline(todaysTrades.length, trustedToday.length, metrics.netPnL, metrics.monetaryScope.isComparable, locale)
  const closingLine = buildClosingLine(todaysTrades.length, trustedToday.length, metrics.netPnL, metrics.monetaryScope.isComparable, locale)
  const reviewState = getReviewState(todaysTrades.length, note, locale)
  const streak = buildStreakMetrics(getTrustedTrades(trades))
  const streakLine = buildStreakLine(streak.currentWinStreak, streak.currentLossStreak, locale)

  return (
    <FuturisticCard glow="none" className="p-5 xl:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-[#998a72]">{text('Heute', 'Today')}</p>
          <h2 className="eq-display mt-3 text-2xl text-white">{headline}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">{closingLine}</p>
          {streakLine ? (
            <p className="mt-3 inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-medium text-orange-100/85">
              {streakLine}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
          <TodayStat label="Trades" value={String(todaysTrades.length)} detail={text('heute', 'today')} />
          <TodayStat
            label="P&L"
            value={trustedToday.length ? metrics.monetaryScope.isComparable ? formatCurrency(metrics.netPnL, 0, metrics.currency, locale) : text('Gesperrt', 'Unavailable') : '—'}
            detail={trustedToday.length ? (documentedRCount ? `Ø ${formatRMultiple(metrics.averageR, 2, locale)}` : text('R offen', 'R unavailable')) : text('offen', 'pending')}
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

function buildTodayHeadline(todayTrades: number, trustedTrades: number, netPnL: number, moneyComparable: boolean, locale: JournalLocale) {
  const text = journalText(locale)
  if (!todayTrades) return text('Kein Trade heute', 'No trades today')
  if (!trustedTrades) return text(todayTrades === 1 ? '1 Trade offen' : `${todayTrades} Trades offen`, `${todayTrades} open ${todayTrades === 1 ? 'trade' : 'trades'}`)
  if (!moneyComparable) return text('Geld-Auswertung gesperrt', 'P&L totals unavailable')
  if (netPnL > 0) return text('Grüner Tag', 'Profitable day')
  if (netPnL < 0) return text('Roter Tag', 'Losing day')
  return text('Neutraler Tag', 'Break-even day')
}

function buildClosingLine(todayTrades: number, trustedTrades: number, netPnL: number, moneyComparable: boolean, locale: JournalLocale) {
  const text = journalText(locale)
  if (!todayTrades) return text('Kein Trade heute. Plan abwarten.', 'No trades today. Wait for your setup.')
  if (!trustedTrades) return text(
    todayTrades === 1 ? '1 Trade offen. Abschluss ergänzen.' : `${todayTrades} Trades offen. Abschluss ergänzen.`,
    `${todayTrades} open ${todayTrades === 1 ? 'trade' : 'trades'}. Add the closing details when available.`,
  )
  if (!moneyComparable) return text('Währungen fehlen oder sind gemischt. P&L wird nicht summiert.', 'P&L totals require a common, known currency.')
  if (netPnL > 0) return text('Grüner Tag. Prozess halten und sauber abschließen.', 'Profitable day. Stick to your process and finish as planned.')
  if (netPnL < 0) return text('Roter Tag. Kurz prüfen, Druck rausnehmen.', 'Losing day. Take a moment to review and step back.')
  return text('Neutraler Tag. Regel prüfen, nicht nachjagen.', 'Break-even day. Review your rules before taking another trade.')
}

function buildStreakLine(currentWinStreak: number, currentLossStreak: number, locale: JournalLocale) {
  const text = journalText(locale)
  if (currentLossStreak >= 2) return text(`${currentLossStreak} rote Trades in Folge. Size prüfen.`, `${currentLossStreak} losses in a row. Check your position size.`)
  if (currentLossStreak === 1) return text('1 roter Trade. Nächsten Entry sauber planen.', '1 losing trade. Plan your next entry carefully.')
  if (currentWinStreak >= 3) return text(`${currentWinStreak} grüne Trades in Folge. Standard halten.`, `${currentWinStreak} wins in a row. Stick to your rules.`)
  if (currentWinStreak > 0) return text(`${currentWinStreak} grüner Trade${currentWinStreak === 1 ? '' : 's'} in Folge.`, `${currentWinStreak} ${currentWinStreak === 1 ? 'win' : 'wins'} in a row.`)
  return ''
}

function getReviewState(todayTrades: number, note: DailyNoteRow | undefined, locale: JournalLocale): { value: string; detail: string; tone: 'green' | 'red' | 'neutral' } {
  const text = journalText(locale)
  if (note) {
    return {
      value: text('notiert', 'Recorded'),
      detail: note.mood?.trim() || note.note?.trim()?.slice(0, 28) || text('fertig', 'Complete'),
      tone: 'green',
    }
  }

  if (todayTrades > 0) {
    return { value: text('offen', 'Open'), detail: text('kurz prüfen', 'Take a moment to review'), tone: 'neutral' }
  }

  return { value: '—', detail: text('kein Trade', 'No trades'), tone: 'neutral' }
}

function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

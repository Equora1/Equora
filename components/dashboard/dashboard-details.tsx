import Link from 'next/link'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { journalNumberLocale, journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { Trade } from '@/lib/types/trade'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { calendarDateKey, getCalendarTradeDay } from '@/lib/utils/calendar'
import { formatCurrency, formatPlainNumber } from '@/lib/utils/calculations'
import { formatTradeTimeInputValue } from '@/lib/utils/trade-time'
import { getFinalizedTrades } from '@/lib/utils/trade-trust'
import { resolveTradeMonetaryScope } from '@/lib/utils/currency'

type Metrics = ReturnType<typeof getCoreMetrics>

export function DashboardDetails({ trades, trustedTrades, metrics, moneyComparable, locale, today }: {
  trades: Trade[]
  trustedTrades: Trade[]
  metrics: Metrics
  moneyComparable: boolean
  locale: JournalLocale
  today: string
}) {
  const text = journalText(locale)
  const hours = groupTrades(trustedTrades, (trade) => {
    const timestamp = formatTradeTimeInputValue(trade.tradeOccurredAt)
    return timestamp ? `${timestamp.slice(11, 13)}:00` : null
  })
  const groups = [
    { title: text('Trade-Uhrzeit (Berlin)', 'Trade time (Berlin)'), rows: hours },
    { title: text('Symbole', 'Symbols'), rows: groupTrades(trustedTrades, (trade) => trade.market.trim() || null) },
    { title: text('Setups', 'Setups'), rows: groupTrades(trustedTrades, (trade) => trade.setup.trim() || null) },
  ]

  return (
    <section className="space-y-3" aria-label={text('Weitere Auswertungen', 'Further analysis')}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <DashboardCalendar trades={trades} trustedTrades={trustedTrades} locale={locale} today={today} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <FuturisticCard className="p-4 sm:p-5">
            <h2 className="text-base font-semibold text-white">{text('Maximaler Drawdown', 'Maximum drawdown')}</h2>
            <p className={`mt-2 text-2xl font-semibold tabular-nums ${metrics.maxDrawdown > 0 ? 'text-red-300' : 'text-white'}`}>
              {moneyComparable && metrics.resolvedTrades
                ? formatCurrency(-metrics.maxDrawdown, 0, metrics.currency, locale)
                : '—'}
            </p>
            <p className="mt-1 text-xs text-white/65">{text('Größter Rückgang vom bisherigen Hoch im gewählten Zeitraum.', 'Largest decline from a previous peak in this period.')}</p>
          </FuturisticCard>
          <FuturisticCard className="p-4 sm:p-5">
            <h2 className="text-base font-semibold text-white">{text('Haltedauer', 'Holding time')}</h2>
            <p className="mt-2 text-sm text-white/75">{text('Wert nicht verfügbar', 'Value unavailable')}</p>
            <p className="mt-1 text-xs text-white/65">{text('Dafür sind erfasste Einstiegs- und Ausstiegszeiten nötig.', 'Holding time needs recorded entry and exit times.')}</p>
          </FuturisticCard>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {groups.map(({ title, rows }) => (
          <FuturisticCard className="min-w-0 p-4 sm:p-5" key={title}>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {rows.length ? (
              <ul className="mt-2 divide-y divide-white/10">
                {rows.slice(0, 5).map(([label, bucket]) => {
                  const result = getCoreMetrics(bucket)
                  return (
                    <li key={label} className="flex min-w-0 items-start justify-between gap-2 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-white">{label}</p>
                        <p className="text-xs text-white/65">{result.resolvedTrades} {result.resolvedTrades === 1 ? 'Trade' : 'Trades'}</p>
                      </div>
                      <span className="max-w-[55%] break-words text-right tabular-nums text-white/80">
                        {moneyComparable && result.monetaryScope.isComparable
                          ? formatCurrency(result.netPnL, 0, result.currency, locale)
                          : `${formatPlainNumber(result.winRate, 0, locale)}% ${text('Winrate', 'win rate')}`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : <p className="mt-2 text-sm text-white/65">{text('Keine passenden Abschlüsse', 'No matching closed trades')}</p>}
            {rows.length > 5 && <Link className="mt-2 inline-block text-xs text-[#f3bd7f] hover:underline" href="/statistik">{text('Alle Auswertungen', 'All analyses')}</Link>}
          </FuturisticCard>
        ))}
      </div>
    </section>
  )
}

function groupTrades(trades: Trade[], getGroup: (trade: Trade) => string | null) {
  const groups = new Map<string, Trade[]>()
  for (const trade of trades) {
    const key = getGroup(trade)
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(trade)
    else groups.set(key, [trade])
  }
  return [...groups].sort(([a, first], [b, second]) => second.length - first.length || a.localeCompare(b))
}

function DashboardCalendar({ trades, trustedTrades, locale, today }: {
  trades: Trade[]
  trustedTrades: Trade[]
  locale: JournalLocale
  today: string
}) {
  const text = journalText(locale)
  const days = new Map(groupTrades(trades, getCalendarTradeDay))
  const trustedDays = new Map(groupTrades(trustedTrades, getCalendarTradeDay))
  const month = ([...days.keys()].sort().at(-1) ?? today).slice(0, 7)
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(`${month}-01T12:00:00Z`)
  const offset = (first.getUTCDay() + 6) % 7
  const end = new Date(first)
  end.setUTCMonth(end.getUTCMonth() + 1, 0)
  const monthLabel = new Intl.DateTimeFormat(journalNumberLocale[locale], { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(first)
  const dateLabel = new Intl.DateTimeFormat(journalNumberLocale[locale], { dateStyle: 'medium', timeZone: 'UTC' })
  const weekdays = locale === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

  return (
    <FuturisticCard className="p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <div>
          <h2 className="text-base font-semibold text-white">{text('Handelskalender', 'Trading calendar')}</h2>
          <p className="mt-1 text-xs text-white/65">{monthLabel}</p>
        </div>
        <Link href={`/kalender?month=${month}`} className="text-sm text-[#f3bd7f] hover:underline">{text('Kalender öffnen', 'Open calendar')}</Link>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {weekdays.map((day) => <div key={day} className="text-center text-[11px] text-white/65">{day}</div>)}
        {Array.from({ length: offset }, (_, index) => <div key={`pad-${index}`} aria-hidden />)}
        {Array.from({ length: end.getUTCDate() }, (_, index) => {
          const day = index + 1
          const key = calendarDateKey(year, monthNumber - 1, day)
          const dayTrades = days.get(key)
          if (!dayTrades) return <span key={key} className="grid min-h-8 place-items-center rounded-md bg-white/[0.025] text-xs tabular-nums text-white/60">{day}</span>
          const count = dayTrades.length
          const result = getCoreMetrics(trustedDays.get(key) ?? [])
          const knownResult = result.resolvedTrades > 0 && resolveTradeMonetaryScope(getFinalizedTrades(dayTrades)).isComparable
          const tone = !knownResult || result.netPnL === 0 ? 'bg-[#bca587]' : result.netPnL > 0 ? 'bg-emerald-300' : 'bg-red-300'
          const description = `${dateLabel.format(new Date(`${key}T12:00:00Z`))} · ${count} ${count === 1 ? 'Trade' : 'Trades'}${knownResult ? ` · ${formatCurrency(result.netPnL, 0, result.currency, locale)}` : ''}`
          return (
            <Link key={key} href={`/kalender?month=${month}&day=${key}`} aria-label={description} title={description}
              className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-[#c8823a]/30 bg-[#c8823a]/10 text-xs tabular-nums text-white hover:bg-[#c8823a]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]">
              {day}<span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone}`} />
            </Link>
          )
        })}
      </div>
    </FuturisticCard>
  )
}

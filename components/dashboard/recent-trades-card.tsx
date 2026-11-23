import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { formatJournalTradeDate, formatJournalTradePnL } from '@/lib/i18n/trade-display'
import Link from 'next/link'
import type { Trade } from '@/lib/types/trade'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { getTradeTrustMeta } from '@/lib/utils/trade-trust'

export function RecentTradesCard({ trades, locale = 'de' }: { trades: Trade[]; locale?: JournalLocale }) {
  const text = journalText(locale)
  return (
    <FuturisticCard className="min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">{text('Letzte Trades', 'Recent trades')}</h2>
        <Link href="/trades" className="text-sm text-[#f3bd7f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]">
          {text('Alle Trades', 'All trades')}
        </Link>
      </div>
      {trades.length ? (
        <ul className="mt-3 divide-y divide-white/10">
          {trades.map((trade) => <li key={trade.id}><RecentTradeRow trade={trade} locale={locale} /></li>)}
        </ul>
      ) : <p className="py-8 text-sm text-white/65">{text('Keine Trades für diese Auswahl.', 'No trades match this selection.')}</p>}
    </FuturisticCard>
  )
}

function RecentTradeRow({ trade, locale }: { trade: Trade; locale: JournalLocale }) {
  const text = journalText(locale)
  const trust = getTradeTrustMeta(trade, locale)
  const result = trust.reliable || trust.state === 'missing-currency' ? formatJournalTradePnL(trade, locale) : null
  const amount = trust.reliable ? trade.netPnL : undefined
  const tone = amount && amount < 0 ? 'text-red-300' : amount && amount > 0 ? 'text-emerald-300' : 'text-white/75'
  const direction = trade.direction === 'long' ? 'Long' : trade.direction === 'short' ? 'Short' : null

  return (
    <Link href={`/trades?tradeId=${encodeURIComponent(trade.id)}`}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-start gap-3 rounded-md py-2.5 hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="min-w-0 break-words text-sm font-semibold text-white">{trade.market || text('Symbol fehlt', 'Symbol missing')}</span>
          {direction && <span className="rounded bg-[#c8823a]/10 px-1.5 text-xs text-[#ecc494]">{direction}</span>}
        </p>
        <p className="mt-1 break-words text-xs leading-4 text-white/65">{[formatJournalTradeDate(trade, locale), trade.setup].filter(Boolean).join(' · ')}</p>
      </div>
      <span className={`max-w-[13ch] break-words text-right text-sm font-medium tabular-nums ${tone}`}>{result ?? trust.shortLabel}</span>
    </Link>
  )
}

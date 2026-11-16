import { getJournalLocale } from '@/lib/server/journal-locale'
import { journalText } from '@/lib/i18n/journal'

export default async function TradesLoading() {
  const text = journalText(await getJournalLocale())

  return (
    <div className="space-y-6" role="status">
      <span className="sr-only">{text('Trades werden geladen', 'Loading trades')}</span>
      <div className="h-[540px] animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]" />
      <div className="h-[420px] animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]" />
    </div>
  )
}

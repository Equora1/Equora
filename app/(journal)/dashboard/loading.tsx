import { getJournalLocale } from '@/lib/server/journal-locale'
import { journalText } from '@/lib/i18n/journal'

export default async function DashboardLoading() {
  const text = journalText(await getJournalLocale())

  return (
    <div className="space-y-6" role="status">
      <span className="sr-only">{text('Startseite wird geladen', 'Loading dashboard')}</span>
      <div className="h-40 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]" />
        <div className="h-72 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]" />
      </div>
      <div className="h-80 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]" />
    </div>
  )
}

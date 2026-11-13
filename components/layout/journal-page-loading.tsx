'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'

type JournalPageLoadingProps = {
  compact?: boolean
  title?: string
}

export function JournalPageLoading({
  compact = false,
  title,
}: JournalPageLoadingProps) {
  const text = journalText(useJournalLocale())

  return (
    <div className="space-y-5" role="status">
      <span className="sr-only">{title ?? text('Seite wird geladen', 'Loading page')}</span>
      <div className={`${compact ? 'h-28' : 'h-36'} animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className={`${compact ? 'h-48' : 'h-64'} animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]`} />
        <div className={`${compact ? 'h-48' : 'h-64'} animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]`} />
      </div>
      <div className={`${compact ? 'h-52' : 'h-72'} animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]`} />
    </div>
  )
}

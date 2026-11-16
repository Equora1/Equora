'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'
import dynamic from 'next/dynamic'
import type { SnippingAssistCardProps } from '@/components/trades/snipping-assist-card'

function SnippingAssistPlaceholder() {
  const text = journalText(useJournalLocale())
  return (
    <div className="rounded-3xl border border-white/10 bg-black/24 p-4 text-sm text-white/55">
      <p className="text-xs uppercase tracking-[0.22em] text-white/38">Snipping Assist</p>
      <p className="mt-2">{text('Bildassistent wird geladen …', 'Loading screenshot assistant…')}</p>
    </div>
  )
}

export const SnippingAssistCard = dynamic<SnippingAssistCardProps>(
  () => import('@/components/trades/snipping-assist-card').then((module) => module.SnippingAssistCard),
  {
    ssr: false,
    loading: () => <SnippingAssistPlaceholder />,
  },
)

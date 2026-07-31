'use client'

import dynamic from 'next/dynamic'
import type { SnippingAssistCardProps } from '@/components/trades/snipping-assist-card'

function SnippingAssistPlaceholder() {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/24 p-4 text-sm text-white/55">
      <p className="text-xs uppercase tracking-[0.22em] text-white/38">Snipping Assist</p>
      <p className="mt-2">OCR wird erst geladen, wenn der Bild-Assistent wirklich gerendert wird.</p>
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

'use client'

import { useMemo, useState } from 'react'
import { SectionHeader } from '@/components/layout/section-header'
import { CompareControl } from '@/components/analytics/compare-control'
import { CompareSummary } from '@/components/analytics/compare-summary'
import { CompareTable } from '@/components/analytics/compare-table'
import type { Trade } from '@/lib/types/trade'
import { buildComparison, type CompareDimension, type CompareTradeTag } from '@/lib/utils/compare'

const titleMap: Record<CompareDimension, string> = {
  setup: 'Setup Vergleich',
  session: 'Session Vergleich',
  emotion: 'Emotions Vergleich',
  market: 'Markt Vergleich',
  quality: 'Qualitäts Vergleich',
  concept: 'Konzept Vergleich',
  tag: 'Tag Vergleich',
}

export function CompareAndConquer({ trades, tradeTags = [] }: { trades: Trade[]; tradeTags?: CompareTradeTag[] }) {
  const [dimension, setDimension] = useState<CompareDimension>('setup')
  const rows = useMemo(() => buildComparison(trades, dimension, tradeTags), [trades, dimension, tradeTags])
  const hasRealComparison = rows.length > 1

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.40)] backdrop-blur-xl">
        <SectionHeader
          eyebrow="Compare & Conquer"
          title="Was schlägt was?"
          copy="Vergleiche Kategorien erst dann gegeneinander, wenn wirklich mehr als eine lesbare Spur da ist."
          badge={`${trades.length} Trades in Analyse`}
        />
        <CompareControl value={dimension} onChange={setDimension} />

        {!hasRealComparison ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white/55">
            Für diese Auswahl gibt es noch keinen echten Gegenvergleich. Erst mehr Material, dann klare Sieger und Bremser.
          </div>
        ) : null}
      </section>

      <CompareSummary rows={rows} />
      <CompareTable title={titleMap[dimension]} rows={rows} />
    </div>
  )
}

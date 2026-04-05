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

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.40)] backdrop-blur-xl">
        <SectionHeader
          eyebrow="Compare & Conquer"
          title="Was schlägt was?"
          copy="Vergleiche Setups, Sessions, Emotionen, Märkte, Qualitätsstufen, Konzepte und Tags direkt gegeneinander, statt nur isolierte Kennzahlen anzuschauen."
          badge={`${trades.length} Trades in Analyse`}
        />
        <CompareControl value={dimension} onChange={setDimension} />
      </section>

      <CompareSummary rows={rows} />
      <CompareTable title={titleMap[dimension]} rows={rows} />
    </div>
  )
}

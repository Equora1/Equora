'use client'

import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { useMemo, useState } from 'react'
import { SectionHeader } from '@/components/layout/section-header'
import { CompareControl } from '@/components/analytics/compare-control'
import { CompareSummary } from '@/components/analytics/compare-summary'
import { CompareTable } from '@/components/analytics/compare-table'
import type { Trade } from '@/lib/types/trade'
import { buildComparison, type CompareDimension, type CompareTradeTag } from '@/lib/utils/compare'

const titleMap: Record<CompareDimension, [de: string, en: string]> = {
  setup: ['Setup Vergleich', 'Compare setups'],
  session: ['Session Vergleich', 'Compare sessions'],
  emotion: ['Emotions Vergleich', 'Compare emotions'],
  market: ['Markt Vergleich', 'Compare markets'],
  quality: ['Qualitäts Vergleich', 'Compare trade quality'],
  concept: ['Konzept Vergleich', 'Compare concepts'],
  tag: ['Tag Vergleich', 'Compare tags'],
}

export function CompareAndConquer({ trades, tradeTags = [], locale = 'de' }: { trades: Trade[]; tradeTags?: CompareTradeTag[]; locale?: JournalLocale }) {
  const text = journalText(locale)
  const [dimension, setDimension] = useState<CompareDimension>('setup')
  const rows = useMemo(() => buildComparison(trades, dimension, tradeTags), [trades, dimension, tradeTags])
  const hasRealComparison = rows.length > 1

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.40)] backdrop-blur-xl">
        <SectionHeader
          eyebrow={text('Compare & Conquer', 'Compare trades')}
          title={text('Was schlägt was?', 'Compare results by category')}
          copy={text('Vergleiche Kategorien erst dann gegeneinander, wenn wirklich mehr als eine lesbare Spur da ist.', 'Choose a category such as setup, session or market.')}
          badge={text(`${trades.length} Trades in Analyse`, `${trades.length} trades included`)}
        />
        <CompareControl locale={locale} value={dimension} onChange={setDimension} />

        {!hasRealComparison ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white/55">
            {text('Für diese Auswahl gibt es noch keinen echten Gegenvergleich. Erst mehr Material, dann klare Sieger und Bremser.', 'Add trades in at least two categories to see a comparison.')}
          </div>
        ) : null}
      </section>

      <CompareSummary locale={locale} rows={rows} />
      <CompareTable locale={locale} title={text(...titleMap[dimension])} rows={rows} />
    </div>
  )
}

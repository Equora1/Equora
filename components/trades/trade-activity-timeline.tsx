import type { Trade, TradeDetail } from '@/lib/types/trade'
import {
  buildTradeActivityTimeline,
  type TradeActivityEvidence,
  type TradeActivityTone,
} from '@/lib/utils/trade-activity'

const evidenceLabels: Record<TradeActivityEvidence, string> = {
  recorded: 'Gespeichert',
  derived: 'Abgeleitet',
  manual: 'Manuell',
}

const toneClasses: Record<TradeActivityTone, string> = {
  neutral: 'border-white/15 bg-white/10',
  positive: 'border-emerald-300/35 bg-emerald-300/15',
  caution: 'border-orange-300/40 bg-orange-300/15',
  evidence: 'border-sky-300/35 bg-sky-300/15',
}

export function TradeActivityTimeline({
  trade,
  detail,
  tagCount = 0,
}: {
  trade: Trade
  detail?: TradeDetail
  tagCount?: number
}) {
  const items = buildTradeActivityTimeline(trade, detail, tagCount)

  return (
    <section aria-labelledby="trade-activity-title" className="rounded-[28px] border border-white/10 bg-black/25 p-5 xl:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#b09a7a]">Dokumentationsverlauf</p>
          <h3 id="trade-activity-title" className="mt-2 text-base font-semibold text-white">Trade Activity</h3>
        </div>
        <span className="w-fit rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-white/65">
          Aus Journalfeldern
        </span>
      </div>

      <p className="mt-3 text-xs leading-5 text-white/60">
        Diese Ansicht ordnet gespeicherte und berechnete Journalinformationen. Sie behauptet keine nicht gespeicherten Broker-Fills oder Fill-Zeitpunkte.
      </p>

      <ol className="mt-5 space-y-0">
        {items.map((item, index) => (
          <li key={item.id} className="relative grid grid-cols-[22px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
            {index < items.length - 1 ? <span aria-hidden="true" className="absolute left-[10px] top-5 h-[calc(100%-0.25rem)] w-px bg-white/10" /> : null}
            <span aria-hidden="true" className={`relative z-10 mt-1 h-[21px] w-[21px] rounded-full border ${toneClasses[item.tone]}`} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-white">{item.title}</p>
                <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-white/65">
                  {evidenceLabels[item.evidence]}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-white/55">{item.description}</p>
              {item.meta ? <p className="mt-1 text-xs leading-5 text-white/55">{item.meta}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

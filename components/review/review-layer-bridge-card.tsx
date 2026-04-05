import type { ReactNode } from 'react'
import Link from 'next/link'
import type { ReviewSnapshot } from '@/lib/utils/review'

export function ReviewLayerBridgeCard({ snapshot }: { snapshot: ReviewSnapshot }) {
  const { reviewLayer } = snapshot
  const primary = reviewLayer.highlights[0]
  const secondary = reviewLayer.highlights.slice(1)

  return (
    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,12,12,0.96),rgba(7,7,7,0.96))] p-5">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.22em] text-white/40">Review-Layer</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Verhalten wird jetzt klarer lesbar</h3>
          <p className="mt-3 text-sm leading-6 text-white/62">{reviewLayer.summary}</p>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200">
          {reviewLayer.reviewedTrades}/{reviewLayer.totalTrades} geprüft
        </div>
      </div>

      {primary ? (
        <div className="mt-5 rounded-[26px] border border-white/10 bg-white/[0.035] p-5 lg:p-6">
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] 2xl:items-start">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Wichtigstes Signal</p>
              <p className="mt-3 text-2xl font-semibold text-white">{primary.value}</p>
              <p className="mt-3 text-sm leading-6 text-white/68">{primary.detail}</p>
            </div>
            <LinkOrDiv href={primary.href} className={`rounded-[24px] border p-4 ${getToneClasses(primary.tone)}`}>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/40">{primary.label}</p>
              <p className="mt-2 text-base font-semibold text-white">{primary.value}</p>
              <p className="mt-3 text-sm leading-6 text-white/70">{primary.detail}</p>
            </LinkOrDiv>
          </div>
        </div>
      ) : null}

      {secondary.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {secondary.map((item) => (
            <LinkOrDiv key={`${item.label}-${item.value}`} href={item.href} className={`rounded-[24px] border p-4 ${getToneClasses(item.tone)}`}>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/40">{item.label}</p>
              <p className="mt-2 text-base font-semibold text-white">{item.value}</p>
              <p className="mt-3 text-sm leading-6 text-white/66">{item.detail}</p>
            </LinkOrDiv>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/review?periodPreset=${snapshot.periodPreset}`} className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/72 transition hover:border-white/20 hover:text-white">Review öffnen</Link>
        <Link href="/trades" className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 transition hover:border-emerald-400/35 hover:text-emerald-100">Trades mit Review öffnen</Link>
      </div>

      {reviewLayer.checklist.length ? (
        <div className="mt-4 rounded-[26px] border border-white/10 bg-black/25 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Was daraus jetzt folgt</p>
              <p className="mt-2 text-sm text-white/55">Die nächsten wenigen Schritte aus dem Review-Layer.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {reviewLayer.checklist.map((item) => (
              <div key={item} className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/72">
                {item}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function LinkOrDiv({ href, className, children }: { href?: string; className: string; children: ReactNode }) {
  if (!href) return <div className={className}>{children}</div>
  return <Link href={href} className={`${className} block transition hover:translate-y-[-1px]`}>{children}</Link>
}

function getToneClasses(tone: 'emerald' | 'orange' | 'red') {
  if (tone === 'emerald') return 'border-emerald-400/15 bg-emerald-400/5'
  if (tone === 'red') return 'border-red-400/15 bg-red-400/5'
  return 'border-orange-400/15 bg-orange-400/5'
}

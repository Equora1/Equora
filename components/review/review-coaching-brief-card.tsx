import Link from 'next/link'
import type { ReviewSnapshot } from '@/lib/utils/review'
import { buildReviewCoachingBrief } from '@/lib/utils/review-coaching'

export function ReviewCoachingBriefCard({ snapshot }: { snapshot: ReviewSnapshot }) {
  const brief = buildReviewCoachingBrief(snapshot)

  return (
    <section className="mb-6 rounded-3xl border border-emerald-400/15 bg-[linear-gradient(180deg,rgba(13,22,18,0.96),rgba(7,10,9,0.96))] p-5 shadow-2xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/70">Coaching aus Review</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{brief.headline}</h2>
          <p className="mt-3 text-sm leading-6 text-white/60">{brief.summary}</p>
        </div>
        <Link
          href={`/daily-note?focus=${encodeURIComponent(brief.focus)}`}
          className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100 transition hover:border-emerald-400/35 hover:text-white"
        >
          Fokus in Daily Note tragen
        </Link>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {brief.lanes.map((lane, index) => (
          <div key={lane.label} className={`rounded-[28px] border p-5 ${getToneClasses(lane.tone)}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/40">{lane.label}</p>
                <h3 className="mt-3 text-xl font-semibold text-white">{lane.title}</h3>
              </div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/25 text-sm text-white/75">
                {index + 1}
              </span>
            </div>

            <p className="mt-4 text-sm leading-6 text-white/72">{lane.detail}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              {lane.href ? (
                <Link
                  href={lane.href}
                  className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-white/75 transition hover:border-white/20 hover:text-white"
                >
                  {lane.cta}
                </Link>
              ) : null}
              {lane.label !== 'Testen morgen' ? (
                <Link
                  href={`/daily-note?focus=${encodeURIComponent(brief.focus)}`}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/60 transition hover:border-white/20 hover:text-white/85"
                >
                  Als Tagesfokus merken
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function getToneClasses(tone: 'emerald' | 'orange' | 'red') {
  if (tone === 'emerald') return 'border-emerald-400/15 bg-emerald-400/5'
  if (tone === 'red') return 'border-red-400/15 bg-red-400/5'
  return 'border-orange-400/15 bg-orange-400/5'
}

import Link from 'next/link'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { SectionHeader } from '@/components/layout/section-header'
import { getReviewPeriodPresetLabel, type ReviewSnapshot } from '@/lib/utils/review'
import { buildReviewActionPlan } from '@/lib/utils/review-to-action'
import { buildReviewCoachingBrief } from '@/lib/utils/review-coaching'

export function NextActionCard({ snapshot }: { snapshot: ReviewSnapshot }) {
  const plan = buildReviewActionPlan(snapshot)
  const brief = buildReviewCoachingBrief(snapshot)
  const primaryStep = plan.steps[0]
  const presetLabel = getReviewPeriodPresetLabel(snapshot)

  return (
    <FuturisticCard glow="emerald" className="p-5">
      <SectionHeader
        eyebrow="Nächster Schritt"
        title={plan.headline}
        copy={plan.summary}
        badge={`${presetLabel} · ${plan.watchword}`}
      />

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/6 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/40">Erster Hebel</p>
              <p className="mt-3 text-2xl font-semibold text-white">{primaryStep?.title ?? plan.headline}</p>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/25 text-sm text-white/75">1</span>
          </div>

          <p className="mt-4 text-sm leading-6 text-white/78">{primaryStep?.instruction ?? plan.summary}</p>

          <div className="mt-5 flex flex-wrap gap-2">
            {primaryStep?.href ? (
              <Link href={primaryStep.href} className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 transition hover:border-emerald-400/35 hover:text-emerald-100">
                Drilldown öffnen
              </Link>
            ) : null}
            <Link href={`/daily-note?focus=${encodeURIComponent(plan.dailyFocusSuggestion)}`} className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-white/72 transition hover:border-white/20 hover:text-white">
              Daily Note vorbereiten
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">Coaching für morgen</p>
          <p className="mt-3 text-xl font-semibold text-emerald-200">{brief.focus}</p>
          <p className="mt-3 text-sm leading-6 text-white/60">Nur drei Dinge merken. So bleibt der nächste Schritt klar, leicht und benutzbar.</p>

          <div className="mt-4 space-y-3">
            {brief.lanes.map((lane) => (
              <div key={lane.label} className={`rounded-2xl border px-4 py-4 ${getToneClasses(lane.tone)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-white/40">{lane.label}</p>
                    <p className="mt-2 text-base font-medium text-white">{lane.title}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/72">{lane.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/review?periodPreset=${snapshot.periodPreset}`} className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-white/72 transition hover:border-white/20 hover:text-white">
              Review öffnen
            </Link>
          </div>
        </div>
      </div>
    </FuturisticCard>
  )
}

function getToneClasses(tone: 'emerald' | 'orange' | 'red') {
  if (tone === 'emerald') return 'border-emerald-400/15 bg-emerald-400/5'
  if (tone === 'red') return 'border-red-400/15 bg-red-400/5'
  return 'border-orange-400/15 bg-orange-400/5'
}

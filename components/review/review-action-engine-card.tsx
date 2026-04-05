import Link from 'next/link'
import type { ReactNode } from 'react'
import type { ReviewSnapshot } from '@/lib/utils/review'
import { buildReviewActionPlan } from '@/lib/utils/review-to-action'

export function ReviewActionEngineCard({ snapshot }: { snapshot: ReviewSnapshot }) {
  const plan = buildReviewActionPlan(snapshot)
  const primaryStep = plan.steps[0]
  const supportingSteps = plan.steps.slice(1)

  return (
    <div className="overflow-hidden rounded-[30px] border border-emerald-400/15 bg-[linear-gradient(180deg,rgba(16,24,22,0.98),rgba(7,10,9,0.96))] p-5">
      <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <Link href={`/review?periodPreset=${snapshot.periodPreset}`} className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/72 transition hover:border-white/20 hover:text-white">Review öffnen</Link>
          <Link href={`/trades?reviewFocus=${encodeURIComponent(plan.watchword)}`} className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 transition hover:border-emerald-400/35 hover:text-emerald-100">Passende Trades öffnen</Link>
        </div>
        <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-300/70">Review zu Aktion</p>
        <div className="mt-3 grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] 2xl:items-start">
          <div>
            <h3 className="text-2xl font-semibold text-white">{plan.headline}</h3>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/62">{plan.summary}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
            <div className="rounded-[22px] border border-emerald-400/15 bg-emerald-400/7 p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">Fokus für morgen</p>
              <p className="mt-3 text-sm font-medium leading-6 text-emerald-100">{plan.dailyFocusSuggestion}</p>
              <p className="mt-2 text-xs leading-5 text-white/52">Nimm genau diesen Satz mit in die nächste Daily Note oder in den ersten Trade-Check morgen.</p>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">Watchword</p>
              <p className="mt-3 text-sm font-medium text-white">{plan.watchword}</p>
            </div>
          </div>
        </div>
      </div>

      {primaryStep ? (
        <div className="mt-4 rounded-[28px] border border-emerald-400/18 bg-emerald-400/7 p-5">
          <div className="grid gap-4 2xl:grid-cols-[auto_minmax(0,1fr)_auto] 2xl:items-center">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/25 text-sm font-medium text-white/80">1</span>
              <span className={`rounded-full border px-3 py-1.5 text-xs ${getToneClasses(primaryStep.tone)} text-white/80`}>{primaryStep.lane}</span>
            </div>
            <div className="max-w-3xl">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Erster Hebel</p>
              <h4 className="mt-2 text-xl font-semibold text-white">{primaryStep.title}</h4>
              <p className="mt-3 text-sm leading-6 text-white/75">{primaryStep.instruction}</p>
              <p className="mt-3 text-sm leading-6 text-white/52">{primaryStep.reason}</p>
            </div>
            {primaryStep.href ? (
              <Link href={primaryStep.href} className="inline-flex w-fit rounded-full border border-emerald-300/20 bg-black/25 px-4 py-2 text-sm text-emerald-100 transition hover:border-emerald-300/35 hover:text-white">
                Direkt öffnen
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {supportingSteps.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {supportingSteps.map((step, index) => (
            <LinkOrDiv key={`${step.lane}-${step.title}`} href={step.href} className={`rounded-[24px] border p-4 ${getToneClasses(step.tone)}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-white/40">{step.lane}</p>
                  <p className="mt-2 text-base font-semibold text-white">{step.title}</p>
                </div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/20 text-[11px] text-white/70">{index + 2}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/75">{step.instruction}</p>
              <p className="mt-3 text-xs leading-5 text-white/50">{step.reason}</p>
            </LinkOrDiv>
          ))}
        </div>
      ) : null}

      <div className="mt-5 rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">Pre-Market Check</p>
            <h4 className="mt-2 text-base font-medium text-white">Damit der Impuls morgen noch trägt</h4>
          </div>
          <Link
            href={`/daily-note?focus=${encodeURIComponent(plan.dailyFocusSuggestion)}`}
            className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 transition hover:border-emerald-400/35 hover:text-emerald-100"
          >
            Fokus in Daily Note öffnen
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {plan.checklist.map((item) => (
            <div key={item} className="rounded-[20px] border border-white/10 bg-black/20 p-4">
              <p className="text-sm leading-6 text-white/72">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LinkOrDiv({ href, className, children }: { href?: string; className: string; children: ReactNode }) {
  if (!href) return <div className={className}>{children}</div>
  return (
    <Link href={href} className={`${className} block transition hover:translate-y-[-1px]`}>
      {children}
    </Link>
  )
}

function getToneClasses(tone: 'emerald' | 'orange' | 'red') {
  if (tone === 'emerald') return 'border-emerald-400/15 bg-emerald-400/5'
  if (tone === 'red') return 'border-red-400/15 bg-red-400/5'
  return 'border-orange-400/15 bg-orange-400/5'
}

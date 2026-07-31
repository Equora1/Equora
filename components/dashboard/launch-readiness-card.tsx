import Link from 'next/link'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { SectionHeader } from '@/components/layout/section-header'
import type { DailyNoteRow, SetupRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { getLaunchReadiness, type LaunchStepStatus } from '@/lib/utils/launch-readiness'

export function LaunchReadinessCard({
  source,
  userId,
  trades,
  setups,
  dailyNotes,
}: {
  source: 'supabase' | 'mock'
  userId?: string | null
  trades: Trade[]
  setups: SetupRow[]
  dailyNotes: DailyNoteRow[]
}) {
  const readiness = getLaunchReadiness({ source, userId, trades, setups, dailyNotes })
  const primaryStep = readiness.steps.find((step) => step.status !== 'done') ?? readiness.steps[0]
  const supportSteps = readiness.steps.filter((step) => step.label !== primaryStep?.label)

  return (
    <FuturisticCard glow="emerald" className="p-5">
      <SectionHeader
        eyebrow="Deploy-Status"
        title={readiness.title}
        copy={readiness.copy}
        badge={readiness.badge}
      />

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Kritischer Pfad</p>
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold text-white">{primaryStep?.label ?? readiness.title}</p>
              <p className="mt-3 text-sm leading-6 text-white/60">{primaryStep?.detail ?? 'Erst erfassen, dann vervollständigen, dann im Dashboard wiederfinden. Wenn das sitzt, trägt der Kernfluss.'}</p>
            </div>
            {primaryStep ? (
              <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] ${getStatusClass(primaryStep.status)}`}>
                {getStatusLabel(primaryStep.status)}
              </span>
            ) : null}
          </div>

          {primaryStep?.href && primaryStep.cta ? (
            <div className="mt-5">
              <Link
                href={primaryStep.href}
                className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/78 transition hover:border-white/18 hover:bg-white/[0.06]"
              >
                {primaryStep.cta}
              </Link>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
          {supportSteps.map((step) => (
            <div key={step.label} className="rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{step.label}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{step.value}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] ${getStatusClass(step.status)}`}>
                  {getStatusLabel(step.status)}
                </span>
              </div>

              <p className="mt-3 text-sm text-white/58">{step.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </FuturisticCard>
  )
}

function getStatusClass(status: LaunchStepStatus) {
  switch (status) {
    case 'done':
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
    case 'warning':
      return 'border-orange-400/20 bg-orange-400/10 text-orange-100/90'
    default:
      return 'border-red-400/20 bg-red-400/10 text-red-200'
  }
}

function getStatusLabel(status: LaunchStepStatus) {
  switch (status) {
    case 'done':
      return 'bereit'
    case 'warning':
      return 'als Nächstes'
    default:
      return 'Blocker'
  }
}

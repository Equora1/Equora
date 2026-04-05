import Link from 'next/link'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { SectionHeader } from '@/components/layout/section-header'
import type { DailyNoteRow, SetupRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { getFirstUserOnboarding, type FirstUserStepStatus } from '@/lib/utils/first-user-onboarding'

export function FirstUserGuideCard({
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
  const onboarding = getFirstUserOnboarding({ source, userId, trades, setups, dailyNotes })

  if (!onboarding.showCard) return null

  const nextSteps = onboarding.steps.filter((step) => step.status !== 'done')
  const completedSteps = onboarding.steps.filter((step) => step.status === 'done')

  return (
    <FuturisticCard glow="orange" className="p-5">
      <SectionHeader
        eyebrow="Erster Nutzerpfad"
        title={onboarding.title}
        copy={onboarding.copy}
        badge={`${onboarding.badge} · ${onboarding.completionPercent}%`}
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-[#c8823a]/16 bg-black/35 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-[#f0a855]/78">Nächster sinnvoller Schritt</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">{onboarding.nextActionLabel}</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">Diese Karte zeigt nur den nächsten sinnvollen Schritt. Alles andere bleibt Nebengeräusch, bis der Kernfluss sitzt.</p>

          {onboarding.nextActionHref && onboarding.nextActionCta ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={onboarding.nextActionHref}
                className="inline-flex items-center rounded-full eq-button-secondary px-4 py-2 text-sm font-medium transition hover:opacity-95"
              >
                {onboarding.nextActionCta}
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-full eq-button-ghost px-4 py-2 text-sm transition hover:text-white"
              >
                Dashboard
              </Link>
            </div>
          ) : null}

          {completedSteps.length ? (
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/55">
              {completedSteps.map((step) => (
                <span key={step.label} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
                  {step.label}: erledigt
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Jetzt sichtbar</p>
            <p className="mt-2 text-sm text-white/60">Nur die noch offenen Schritte bleiben hier im Blick.</p>
          </div>

          {nextSteps.map((step) => (
            <div key={step.label} className="eq-card-soft rounded-2xl px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{step.label}</p>
                  <p className="mt-2 text-base font-semibold text-white">{step.value}</p>
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

function getStatusClass(status: FirstUserStepStatus) {
  switch (status) {
    case 'done':
      return 'border-[#c8823a]/20 bg-[#c8823a]/10 text-[#f0a855]'
    case 'current':
      return 'border-[#f0a855]/22 bg-[#f0a855]/12 text-[#fff2df]'
    default:
      return 'border-white/10 bg-white/5 text-white/60'
  }
}

function getStatusLabel(status: FirstUserStepStatus) {
  switch (status) {
    case 'done':
      return 'erledigt'
    case 'current':
      return 'jetzt'
    default:
      return 'später'
  }
}

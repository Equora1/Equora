'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setDailyFocusStatus } from '@/app/actions/daily-notes'
import type { DailyNoteRow } from '@/lib/types/db'
import {
  buildDailyFocusBridge,
  DAILY_FOCUS_STATUS_OPTIONS,
  type DailyFocusStatus,
} from '@/lib/utils/daily-notes'

type FocusBridgeCardProps = {
  dailyNotes: DailyNoteRow[]
  variant?: 'dashboard' | 'workspace'
}

export function FocusBridgeCard({ dailyNotes, variant = 'dashboard' }: FocusBridgeCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusOverride, setStatusOverride] = useState<DailyFocusStatus | null>(null)
  const bridge = useMemo(() => buildDailyFocusBridge(dailyNotes), [dailyNotes])
  const activeStatus = statusOverride ?? bridge.carryStatus
  const isDashboard = variant === 'dashboard'

  const headline = bridge.carryFocus
    ? 'Ein klarer Fokus für heute'
    : bridge.tomorrowFocus
      ? 'Morgen ist schon sauber notiert'
      : 'Noch kein Fokus gesetzt'

  const copy = bridge.carryFocus
    ? 'Nicht mehr Input. Nur ein Satz, der den Tag ruhiger macht.'
    : bridge.tomorrowFocus
      ? 'Der nächste Schritt ist da. Heute musst du ihn nur noch sichtbar halten.'
      : 'Lege in der Daily Note oder im Review einen Fokus fest, damit der nächste Handelstag nicht ohne Leitplanke startet.'

  function applyStatus(status: DailyFocusStatus) {
    startTransition(async () => {
      const result = await setDailyFocusStatus({ tradeDate: bridge.todayDateKey, status })
      setStatusMessage(result.message)
      if (!result.success) return
      setStatusOverride(status)
      router.refresh()
    })
  }

  return (
    <section className={`rounded-3xl border ${isDashboard ? 'border-orange-400/15 bg-black/25 p-5' : 'border-emerald-400/15 bg-emerald-400/[0.04] p-4'}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Fokus-Brücke</p>
          <h2 className={`${isDashboard ? 'mt-2 text-xl' : 'mt-2 text-lg'} font-semibold text-white`}>{headline}</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">{copy}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/daily-note" className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/72 transition hover:border-white/20 hover:text-white">
            Daily Note
          </Link>
          <Link href="/review" className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/72 transition hover:border-white/20 hover:text-white">
            Review
          </Link>
        </div>
      </div>

      <div className={`mt-4 grid gap-4 ${isDashboard ? 'xl:grid-cols-[1.05fr_0.95fr]' : 'lg:grid-cols-[1.05fr_0.95fr]'}`}>
        <div className="rounded-[26px] border border-white/10 bg-black/25 p-4">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Heute halten</p>
          <p className="mt-3 text-lg font-semibold text-emerald-200">{bridge.carryFocus ?? 'Noch kein Fokus aus gestern vorhanden'}</p>
          <p className="mt-2 text-sm leading-6 text-white/58">
            {bridge.carryFocus
              ? `Kommt aus ${bridge.carryDateKey}. Du kannst direkt markieren, wie gut dieser Satz heute getragen hat.`
              : 'Sobald du in der Daily Note einen Fokus für morgen setzt, erscheint er hier am nächsten Tag automatisch.'}
          </p>

          {bridge.carryFocus ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {DAILY_FOCUS_STATUS_OPTIONS.map((option) => {
                const active = activeStatus === option
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={isPending}
                    onClick={() => applyStatus(option)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${active ? getStatusButtonActiveClass(option) : 'border-white/10 bg-white/[0.03] text-white/72 hover:border-white/20 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          ) : null}

          {activeStatus ? (
            <p className={`mt-3 text-sm ${getStatusTextClass(activeStatus)}`}>
              Heute markiert: {activeStatus}
            </p>
          ) : null}
        </div>

        <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Morgen notiert</p>
          <p className="mt-3 text-lg font-semibold text-orange-100">{bridge.tomorrowFocus ?? 'Noch leer'}</p>
          <p className="mt-2 text-sm leading-6 text-white/58">
            {bridge.tomorrowFocus
              ? 'Dieser Satz liegt schon in deiner Daily Note und wird morgen zur sichtbaren Leitplanke.'
              : 'Kein Roman nötig. Ein einziger sauberer Satz reicht.'}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={bridge.carryFocus ? `/daily-note?focus=${encodeURIComponent(bridge.carryFocus)}` : '/daily-note'} className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100 transition hover:border-orange-400/35 hover:text-white">
              Fokus notieren
            </Link>
            <Link href="/trades" className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-white/72 transition hover:border-white/20 hover:text-white">
              Im Workspace sichtbar halten
            </Link>
          </div>
        </div>
      </div>

      {statusMessage ? <p className="mt-3 text-sm text-white/55">{statusMessage}</p> : null}
    </section>
  )
}

function getStatusButtonActiveClass(status: DailyFocusStatus) {
  if (status === 'eingehalten') return 'border-emerald-400/35 bg-emerald-400/15 text-emerald-100'
  if (status === 'teilweise') return 'border-orange-400/35 bg-orange-400/15 text-orange-100'
  return 'border-red-400/35 bg-red-400/15 text-red-100'
}

function getStatusTextClass(status: DailyFocusStatus) {
  if (status === 'eingehalten') return 'text-emerald-300'
  if (status === 'teilweise') return 'text-orange-200'
  return 'text-red-300'
}

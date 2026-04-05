'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { closeTradeEntry } from '@/app/actions/trades'
import { getTradeCaptureResultLabel } from '@/lib/utils/trade-capture'

const closeResultOptions = [
  { value: 'winner', label: getTradeCaptureResultLabel('winner') },
  { value: 'loser', label: getTradeCaptureResultLabel('loser') },
  { value: 'breakeven', label: getTradeCaptureResultLabel('breakeven') },
] as const

export function CloseTradeForm({
  tradeId,
  market,
  setup,
  cancelHref,
}: {
  tradeId: string
  market: string
  setup: string
  cancelHref: string
}) {
  const router = useRouter()
  const [exit, setExit] = useState('')
  const [netPnL, setNetPnL] = useState('')
  const [captureResult, setCaptureResult] = useState<(typeof closeResultOptions)[number]['value']>('winner')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    setStatus('')

    startTransition(async () => {
      const result = await closeTradeEntry({
        tradeId,
        exit,
        netPnL,
        captureResult,
        notes,
      })

      setStatus(result.message)
      if (!result.success) return

      router.push(`/trades?tradeId=${encodeURIComponent(tradeId)}`)
      router.refresh()
    })
  }

  return (
    <section className="rounded-[30px] border border-emerald-400/18 bg-emerald-400/[0.05] p-5 shadow-2xl xl:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/70">Trade schließen</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Offenen Trade mit wenigen Feldern schließen</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            Erst sichern, später sauber schließen. Für {market} · {setup} reichen hier Ergebnis, optional Exit und ein kurzer Satz.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={cancelHref}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
          >
            Zurück
          </a>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="eq-button-primary rounded-2xl px-5 py-3 text-sm font-medium transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? 'Schließt gerade...' : 'Trade schließen'}
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/40">Exit optional</span>
            <input
              value={exit}
              onChange={(event) => setExit(event.target.value)}
              placeholder="z. B. 19845.5"
              className="mt-3 w-full rounded-2xl border border-emerald-400/18 bg-emerald-400/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
            />
          </label>

          <label className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/40">Netto P&amp;L optional</span>
            <input
              value={netPnL}
              onChange={(event) => setNetPnL(event.target.value)}
              placeholder="z. B. 128.50"
              className="mt-3 w-full rounded-2xl border border-emerald-400/18 bg-emerald-400/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
            />
            <p className="mt-2 text-xs text-white/45">Wenn P&amp;L leer bleibt, zählt zuerst dein Ergebnis und der Trade ist trotzdem geschlossen.</p>
          </label>
        </div>

        <label className="block rounded-3xl border border-white/10 bg-black/20 p-5">
          <span className="text-xs uppercase tracking-[0.2em] text-white/40">Ergebnis</span>
          <select
            value={captureResult}
            onChange={(event) => setCaptureResult(event.target.value as (typeof closeResultOptions)[number]['value'])}
            className="mt-3 w-full rounded-2xl border border-emerald-400/18 bg-emerald-400/[0.07] px-4 py-3 text-sm text-white outline-none"
          >
            {closeResultOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-black text-white">
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-3xl border border-white/10 bg-black/18 p-5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Kurzer Abschluss</p>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Ein Satz reicht: Was ist beim Exit passiert?"
            className="mt-3 min-h-[108px] w-full rounded-2xl border border-emerald-400/18 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
          />
        </div>
      </div>

      {status ? <p className="mt-4 text-sm text-white/70">{status}</p> : null}
    </section>
  )
}

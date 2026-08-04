'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { closeTradeEntry } from '@/app/actions/trades'
import type { Trade } from '@/lib/types/trade'
import { formatCurrency, formatPlainNumber } from '@/lib/utils/calculations'
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
  editHref,
  trade,
}: {
  tradeId: string
  market: string
  setup: string
  cancelHref: string
  editHref?: string
  trade?: Trade
}) {
  const router = useRouter()
  const [exit, setExit] = useState('')
  const [netPnL, setNetPnL] = useState('')
  const [captureResult, setCaptureResult] = useState<(typeof closeResultOptions)[number]['value']>('winner')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()

  const managementSummary = trade
    ? [
        { label: 'Bereits realisiert', value: trade.partialExitCoveragePercent ? `${Math.round(trade.partialExitCoveragePercent)}%` : 'Noch nichts' },
        { label: 'Rest offen', value: trade.partialExitRemainderPercent !== null && trade.partialExitRemainderPercent !== undefined ? `${Math.round(trade.partialExitRemainderPercent)}%` : '100%' },
        { label: 'Restgröße', value: trade.partialExitRemainingSize !== null && trade.partialExitRemainingSize !== undefined ? formatPlainNumber(trade.partialExitRemainingSize, 4) : '—' },
        { label: 'Aktueller Stand', value: trade.netPnL !== null && trade.netPnL !== undefined ? formatCurrency(trade.netPnL, 0, trade.accountCurrency) : 'Noch offen' },
      ]
    : []

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
          <h2 className="mt-2 text-2xl font-semibold text-white">{market} · {setup}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={cancelHref}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
          >
            Zurück
          </a>
          {editHref ? (
            <a
              href={editHref}
              className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100/90 transition hover:border-emerald-200/35 hover:bg-emerald-400/15 hover:text-white"
            >
              Trade vervollständigen
            </a>
          ) : null}
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

      {managementSummary.length ? (
        <div className="mt-5 rounded-[28px] border border-white/10 bg-black/18 p-5">
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Stand</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {managementSummary.map((item) => (
              <div key={item.label} className="rounded-3xl border border-white/10 bg-black/20 px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{item.label}</p>
                <p className="mt-2 text-sm font-medium text-white/85">{item.value}</p>
              </div>
            ))}
          </div>
          {editHref ? (
            <div className="mt-4 rounded-3xl border border-emerald-300/16 bg-emerald-400/[0.06] px-4 py-4">
              <div className="mt-3">
                <a
                  href={editHref}
                  className="inline-flex rounded-full border border-emerald-300/25 bg-black/25 px-3 py-2 text-xs text-emerald-100 transition hover:border-emerald-200/40 hover:text-white"
                >
                  Mehr Felder
                </a>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <label className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/40">Finaler Exit / Rest</span>
            <input
              value={exit}
              onChange={(event) => setExit(event.target.value)}
              placeholder="z. B. 19845.5"
              className="mt-3 w-full rounded-2xl border border-emerald-400/18 bg-emerald-400/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
            />
          </label>

          <label className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/40">Netto P&amp;L für den Abschluss</span>
            <input
              value={netPnL}
              onChange={(event) => setNetPnL(event.target.value)}
              placeholder="z. B. 128.50"
              className="mt-3 w-full rounded-2xl border border-emerald-400/18 bg-emerald-400/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
            />
            <p className="mt-2 text-xs text-white/45">Wenn P&amp;L leer bleibt, zählt dein Status und der Trade ist geschlossen.</p>
          </label>
        </div>

        <label className="block rounded-3xl border border-white/10 bg-black/20 p-5">
          <span className="text-xs uppercase tracking-[0.2em] text-white/40">Status</span>
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

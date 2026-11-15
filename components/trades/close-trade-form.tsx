'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { getManualTradeNumberFormatHint } from '@/lib/utils/manual-trade-number'
import { formatJournalTradePnL } from '@/lib/i18n/trade-display'
import { journalText } from '@/lib/i18n/journal'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { closeTradeEntry } from '@/app/actions/trades'
import type { Trade } from '@/lib/types/trade'
import { formatPlainNumber } from '@/lib/utils/calculations'
import { getTradeCaptureResultLabel } from '@/lib/utils/trade-capture'

const closeResults = ['winner', 'loser', 'breakeven'] as const
type CloseResult = (typeof closeResults)[number]

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
  const locale = useJournalLocale()
  const text = journalText(locale)
  const router = useRouter()
  const [exit, setExit] = useState('')
  const [netPnL, setNetPnL] = useState('')
  const [captureResult, setCaptureResult] = useState<CloseResult>('winner')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()

  if ((trade?.partialExits?.length ?? 0) > 0) {
    return <section lang={locale} className="rounded-3xl border border-orange-300/20 bg-black/20 p-5">
      <h2 className="text-xl font-semibold text-white">{text('Teilverkäufe vollständig abschließen', 'Close the remaining position')}</h2>
      <p className="mt-3 text-sm leading-6 text-white/65">{text('Prüfe die einzelnen Ausstiegspreise in der vollständigen Bearbeitung. Der verkürzte Dialog kann Teilverkäufe nicht sicher zuordnen.', 'This trade has partial exits. Open the full editor to check each exit price and close the remaining position.')}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {editHref ? <a href={editHref} className="eq-button-primary rounded-xl px-4 py-3">{text('Trade bearbeiten', 'Edit trade')}</a> : null}
        <a href={cancelHref} className="rounded-xl border border-white/15 px-4 py-3 text-white/70">{text('Zurück', 'Back')}</a>
      </div>
    </section>
  }

  const managementSummary = trade
    ? [
        { label: text('Bereits realisiert', 'Realised so far'), value: trade.partialExitCoveragePercent ? `${Math.round(trade.partialExitCoveragePercent)}%` : text('Noch nichts', 'None yet') },
        { label: text('Rest offen', 'Still open'), value: trade.partialExitRemainderPercent !== null && trade.partialExitRemainderPercent !== undefined ? `${Math.round(trade.partialExitRemainderPercent)}%` : '100%' },
        { label: text('Restgröße', 'Remaining size'), value: trade.partialExitRemainingSize !== null && trade.partialExitRemainingSize !== undefined ? formatPlainNumber(trade.partialExitRemainingSize, 4, locale) : '—' },
        { label: text('Aktueller Stand', 'Current P&L'), value: formatJournalTradePnL(trade, locale) ?? text('Noch offen', 'Pending') },
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
      }, locale)

      setStatus(result.message)
      if (!result.success) return

      router.push(cancelHref)
      router.refresh()
    })
  }

  return (
    <section lang={locale} className="rounded-[30px] border border-emerald-400/18 bg-emerald-400/[0.05] p-5 shadow-2xl xl:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/70">{text('Trade schließen', 'Close trade')}</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{market} · {setup}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={cancelHref}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
          >
            {text('Zurück', 'Back')}
          </a>
          {editHref ? (
            <a
              href={editHref}
              className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100/90 transition hover:border-emerald-200/35 hover:bg-emerald-400/15 hover:text-white"
            >
              {text('Trade vervollständigen', 'Complete trade details')}
            </a>
          ) : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="eq-button-primary rounded-2xl px-5 py-3 text-sm font-medium transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? text('Schließt gerade...', 'Closing…') : text('Trade schließen', 'Close trade')}
          </button>
        </div>
      </div>

      {managementSummary.length ? (
        <div className="mt-5 rounded-[28px] border border-white/10 bg-black/18 p-5">
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">{text('Stand', 'Position summary')}</p>
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
                  {text('Mehr Felder', 'More fields')}
                </a>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <label className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Finaler Exit / Rest', 'Final exit price')}</span>
            <input
              value={exit}
              onChange={(event) => setExit(event.target.value)}
              placeholder={text('z. B. 19845.5', 'e.g. 19845.5')}
              className="mt-3 w-full rounded-2xl border border-emerald-400/18 bg-emerald-400/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
            />
          </label>

          <label className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Netto P&L für den Abschluss', 'Net P&L at close')}</span>
            <input
              value={netPnL}
              inputMode="decimal"
              onChange={(event) => setNetPnL(event.target.value)}
              placeholder={text('z. B. 128,50', 'e.g. 128.50')}
              className="mt-3 w-full rounded-2xl border border-emerald-400/18 bg-emerald-400/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
            />
            <p className="mt-2 text-xs text-white/45">{getManualTradeNumberFormatHint(locale)} {text(
              'Lässt du P&L leer, wird der Trade mit dem gewählten Status geschlossen. Mit einem gültigen P&L-Betrag ergibt sich der Status aus dem Betrag.',
              'Leave P&L blank to close the trade with the outcome you select. If you enter a valid P&L amount, it determines the outcome.',
            )}</p>
          </label>
        </div>

        <label className="block rounded-3xl border border-white/10 bg-black/20 p-5">
          <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Status', 'Outcome')}</span>
          <select
            value={captureResult}
            onChange={(event) => setCaptureResult(event.target.value as CloseResult)}
            className="mt-3 w-full rounded-2xl border border-emerald-400/18 bg-emerald-400/[0.07] px-4 py-3 text-sm text-white outline-none"
          >
            {closeResults.map((result) => (
              <option key={result} value={result} className="bg-black text-white">
                {getTradeCaptureResultLabel(result, locale)}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-3xl border border-white/10 bg-black/18 p-5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">{text('Kurzer Abschluss', 'Closing note')}</p>
          <textarea
            aria-label={text('Kurzer Abschluss', 'Closing note')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder={text('Ein Satz reicht: Was ist beim Exit passiert?', 'What happened at the exit? One sentence is enough.')}
            className="mt-3 min-h-[108px] w-full rounded-2xl border border-emerald-400/18 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
          />
        </div>
      </div>

      {status ? <p role="status" className="mt-4 text-sm text-white/70">{status}</p> : null}
    </section>
  )
}

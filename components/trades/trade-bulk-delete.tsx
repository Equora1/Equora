'use client'

import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { deleteTradeSelection } from '@/app/actions/trades'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { formatTradeDeleteConfirmation, normalizeTradeDeleteSelection } from '@/lib/utils/trade-bulk-delete'

type TradeBulkDeleteProps = {
  tradeIds: string[]
  filtered: boolean
  locale: JournalLocale
  onDeleted: (tradeIds: string[], message: string) => void
  onRefresh: () => void
}

export function TradeBulkDelete({ tradeIds, filtered, locale, onDeleted, onRefresh }: TradeBulkDeleteProps) {
  const text = journalText(locale)
  const dialog = useRef<HTMLDialogElement>(null)
  const inFlight = useRef(false)
  const headingId = useId()
  const descriptionId = useId()
  const confirmationId = useId()
  const [frozenIds, setFrozenIds] = useState<string[]>([])
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const eligibleIds = useMemo(() => normalizeTradeDeleteSelection(tradeIds), [tradeIds])
  const selectionMatches = eligibleIds !== null
    && eligibleIds.length === frozenIds.length
    && eligibleIds.every((id, index) => id === frozenIds[index])
  const confirmationText = formatTradeDeleteConfirmation(frozenIds.length, locale)
  const count = new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-GB').format(frozenIds.length)
  const ready = selectionMatches && confirmation.trim() === confirmationText && !pending && !needsRefresh

  function openDialog() {
    if (!eligibleIds || !dialog.current) return
    setFrozenIds(eligibleIds)
    setConfirmation('')
    setNeedsRefresh(false)
    setMessage(null)
    dialog.current.showModal()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready || inFlight.current) return
    inFlight.current = true
    setPending(true)
    setMessage(null)
    try {
      const result = await deleteTradeSelection({ tradeIds: frozenIds, confirmation: confirmation.trim() }, locale)
      if (result.status === 'deleted') {
        dialog.current?.close()
        onDeleted(frozenIds, result.message)
      } else {
        setMessage(result.message)
        if (result.status === 'refresh') {
          setNeedsRefresh(true)
          onRefresh()
        }
      }
    } catch {
      setNeedsRefresh(true)
      setMessage(text('Das Ergebnis ist unklar. Lade das Journal neu und prüfe die Trades.', 'The result is unclear. Reload the journal and check the trades.'))
      onRefresh()
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={!eligibleIds}
        className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-white/75 transition hover:border-white/25 hover:text-white disabled:opacity-45"
      >
        {text('Treffer löschen', 'Delete matches')}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        onCancel={(event) => { if (inFlight.current) event.preventDefault() }}
        className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-red-400/25 bg-[#191411] p-5 text-orange-50 shadow-2xl backdrop:bg-black/70 sm:p-6"
      >
        <form onSubmit={submit}>
          <h2 id={headingId} className="text-xl font-semibold">
            {frozenIds.length === 1 ? text('1 Trade löschen?', 'Delete 1 trade?') : text(`${count} Trades löschen?`, `Delete ${count} trades?`)}
          </h2>
          <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-white/75">
            {filtered
              ? text('Betroffen sind die Treffer des aktuellen Filters auf allen Seiten.', 'This applies to the current filter matches across all pages.')
              : text('Betroffen sind alle Trades im Journal auf allen Seiten.', 'This applies to all journal trades across all pages.')}
            {' '}
            {text(
              'Die Trades und ihre geteilten Beiträge werden endgültig gelöscht. Zugehörige Anhänge werden zur Bereinigung vorgemerkt.',
              'The trades and their shared posts will be permanently deleted. Their attachments will be queued for cleanup.',
            )}
          </p>
          <label htmlFor={confirmationId} className="mt-4 block text-sm text-white/85">
            {text('Zur Bestätigung eingeben', 'Enter to confirm')} <code className="font-semibold">{confirmationText}</code>
          </label>
          <input
            id={confirmationId}
            autoComplete="off"
            spellCheck={false}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={pending || needsRefresh || !selectionMatches}
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-base text-white outline-none focus:border-orange-300"
          />
          {message || (!selectionMatches && !pending) ? (
            <p role="alert" className="mt-3 text-sm text-red-200">
              {message ?? text('Die Treffer haben sich geändert. Öffne den Dialog erneut.', 'The matches have changed. Open the dialog again.')}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              disabled={pending}
              className="min-h-10 rounded-xl border border-white/15 px-3 text-sm text-white/80 disabled:opacity-45"
            >
              {needsRefresh ? text('Schließen', 'Close') : text('Abbrechen', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={!ready}
              className="min-h-10 rounded-xl border border-red-400/35 bg-red-500/20 px-3 text-sm font-semibold text-red-100 hover:bg-red-500/30 disabled:opacity-45"
            >
              {pending ? text('Löscht …', 'Deleting…') : text('Endgültig löschen', 'Delete permanently')}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}

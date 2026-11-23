'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { loadTradingCheckIn, saveTradingCheckIn } from '@/app/actions/trading-check-in'
import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'
import { tradingCheckInCopy } from '@/lib/i18n/trading-check-in'
import {
  changeCheckInAnswer,
  checkInPhases,
  checkInRatings,
  consumeTradingCheckInLoginCookie,
  getCheckInQuestions,
  hasCheckInContent,
  type CheckInDraft,
  type CheckInPhase,
  type CheckInRating,
  type TradingCheckInDay,
} from '@/lib/utils/trading-check-in'

const emptyDraft: CheckInDraft = { answers: {}, noTrades: false }

const quietButton = 'min-h-10 rounded-xl border border-white/15 px-3 text-sm text-white/80 hover:border-orange-300/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300 disabled:opacity-45'
const actionButton = 'min-h-10 rounded-xl bg-orange-300 px-4 text-sm font-semibold text-[#1b130b] hover:bg-orange-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-45'

type LoginCheckIn = { dateKey: string; initialDay: TradingCheckInDay }

export function TradingCheckInAfterLogin({ dateKey }: { dateKey: string }) {
  const pending = useRef<Promise<LoginCheckIn | null> | null>(null)
  const [prompt, setPrompt] = useState<LoginCheckIn | null>(null)

  useEffect(() => {
    let current = true

    // Retain the request across the extra effect cycle in React Strict Mode.
    pending.current ??= (async () => {
      if (!consumeTradingCheckInLoginCookie(document)) return null
      const result = await loadTradingCheckIn(dateKey)
      if (!result.ok || result.day.before !== null || result.day.after !== null) return null
      return { dateKey, initialDay: result.day }
    })().catch(() => null)

    void pending.current.then((result) => {
      if (current && result && !document.querySelector('dialog[open]')) setPrompt(result)
    })

    return () => { current = false }
  }, [dateKey])

  return prompt && <TradingCheckIn {...prompt} />
}

export function TradingCheckIn({ dateKey, initialDay }: { dateKey: string; initialDay?: TradingCheckInDay }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const pendingSave = useRef(false)
  const [open, setOpen] = useState(Boolean(initialDay))
  const titleId = useId()
  const locale = useJournalLocale()
  const text = journalText(locale)

  useEffect(() => {
    if (initialDay && dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [initialDay])

  return (
    <>
      {!initialDay && <button ref={trigger} type="button" aria-haspopup="dialog" className={quietButton} onClick={() => {
        dialog.current?.showModal()
        setOpen(true)
      }}>
        {text('Trading-Check-in', 'Trading check-in')}
      </button>}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onCancel={(event) => { if (pendingSave.current) event.preventDefault() }}
        onClose={() => { setOpen(false); trigger.current?.focus() }}
        className="m-auto max-h-[calc(100dvh_-_1.5rem)] w-[calc(100%_-_1.5rem)] max-w-md overflow-y-auto rounded-3xl border border-orange-300/20 bg-[#191411] p-4 text-orange-50 shadow-2xl backdrop:bg-black/75 sm:p-6"
      >
        {open && (
          <CheckInDialogContent dateKey={dateKey} titleId={titleId} pendingSave={pendingSave} initialDay={initialDay}
            close={() => dialog.current?.close()} />
        )}
      </dialog>
    </>
  )
}

function CheckInDialogContent({ dateKey, titleId, pendingSave, initialDay, close }: {
  dateKey: string
  titleId: string
  pendingSave: { current: boolean }
  initialDay?: TradingCheckInDay
  close: () => void
}) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const copy = tradingCheckInCopy[locale]
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadTradingCheckIn>> | null>(
    initialDay ? { ok: true, day: initialDay } : null,
  )
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [phase, setPhase] = useState<CheckInPhase | null>(initialDay ? 'before' : null)
  const [draft, setDraft] = useState<CheckInDraft>(emptyDraft)
  const [step, setStep] = useState(0)
  const [editing, setEditing] = useState(Boolean(initialDay))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<'changed' | 'other' | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const day = result?.ok ? result.day : null
  const questions = phase ? getCheckInQuestions(phase, draft) : []
  const question = editing ? questions[step] : undefined
  const phaseLabels = {
    before: text('Vor dem Trading', 'Before trading'),
    after: text('Nach dem Trading', 'After trading'),
  }
  const displayDate = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T00:00:00Z`))

  useEffect(() => {
    if (initialDay && loadAttempt === 0) return
    let ignore = false
    async function load() {
      try {
        const next = await loadTradingCheckIn(dateKey)
        if (!ignore) setResult(next)
      } catch {
        if (!ignore) setResult({ ok: false, reason: 'unavailable' })
      }
    }
    void load()
    return () => { ignore = true }
  }, [dateKey, initialDay, loadAttempt])

  const waiting = result === null
  useEffect(() => { heading.current?.focus() }, [waiting, phase, question, editing])

  function openPhase(nextPhase: CheckInPhase) {
    const existing = day?.[nextPhase]
    setPhase(nextPhase)
    setDraft(existing ?? emptyDraft)
    setStep(0)
    setEditing(!existing)
    setSaved(false)
    setError(null)
  }

  function goBackToPhases() {
    setPhase(null)
    setEditing(false)
    setSaved(false)
    setError(null)
  }

  function reload() {
    goBackToPhases()
    setResult(null)
    setLoadAttempt((attempt) => attempt + 1)
  }

  function answer(value: CheckInRating | null) {
    if (!question) return
    setDraft(changeCheckInAnswer(draft, question, value))
    setStep(step + 1)
  }

  async function save() {
    if (!phase || !day || pendingSave.current) return
    const previous = day[phase]
    if (!previous && !hasCheckInContent(draft)) {
      goBackToPhases()
      return
    }
    pendingSave.current = true
    setSaving(true)
    setError(null)
    try {
      const next = await saveTradingCheckIn({ date: dateKey, phase, draft, previous })
      if (next.ok) {
        setResult({ ok: true, day: { ...day, [phase]: next.value } })
        setDraft(next.value ?? emptyDraft)
        setEditing(false)
        if (next.value) setSaved(true)
        else goBackToPhases()
      } else {
        setError(next.reason === 'changed' ? 'changed' : 'other')
      }
    } catch {
      setError('other')
    } finally {
      pendingSave.current = false
      setSaving(false)
    }
  }

  return (
    <div aria-busy={saving} className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="break-words text-lg font-semibold text-white">{text('Trading-Check-in', 'Trading check-in')}</h2>
          <time dateTime={dateKey} className="text-sm text-white/65">{displayDate}</time>
        </div>
        <button type="button" className={quietButton} onClick={close} disabled={saving}>{text('Schließen', 'Close')}</button>
      </header>

      {waiting && <p role="status" className="text-sm text-white/70">{text('Lädt …', 'Loading…')}</p>}
      {result && !result.ok && (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-orange-100">
            {result.reason === 'signed_out'
              ? text('Melde dich an, um deinen Check-in zu öffnen.', 'Sign in to open your check-in.')
              : text('Der Check-in konnte nicht geladen werden.', 'Could not load your check-in.')}
          </p>
          <button type="button" className={quietButton} onClick={reload}>{text('Erneut laden', 'Reload')}</button>
        </div>
      )}

      {day && !phase && (
        <div className="space-y-2">
          <h3 ref={heading} tabIndex={-1} className="text-sm font-medium text-white/72 outline-none">
            {text('Wann möchtest du einchecken?', 'When would you like to check in?')}
          </h3>
          {checkInPhases.map((item) => {
            const existing = day[item]
            return (
              <button key={item} type="button" onClick={() => openPhase(item)}
                className="flex min-h-12 w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 px-3 py-2 text-left text-sm text-white hover:border-orange-300/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
                <span>{phaseLabels[item]}</span>
                {existing && <span className="text-xs text-orange-200">{existing.noTrades
                  ? text('Keine Trades', 'No trades') : text('Gespeichert', 'Saved')}</span>}
              </button>
            )
          })}
        </div>
      )}

      {day && phase && question && (
        <section className="space-y-4">
          <p className="text-xs text-orange-200">{phaseLabels[phase]} · {step + 1}/{questions.length}</p>
          <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold text-white outline-none">
            {copy[question].question}
          </h3>
          <div className="grid grid-cols-5 justify-items-center gap-1">
            {checkInRatings.map((rating) => (
              <button type="button" key={rating} aria-label={copy[question].scale[rating - 1]}
                aria-pressed={draft.answers[question] === rating} onClick={() => answer(rating)}
                className="h-10 w-10 rounded-full border border-white/20 text-sm font-semibold text-orange-100 hover:border-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300 aria-pressed:border-orange-300 aria-pressed:bg-orange-300 aria-pressed:text-[#1b130b]">
                {rating}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs text-white/66">
            <span>{copy[question].scale[0]}</span><span className="text-right">{copy[question].scale[4]}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={quietButton} onClick={() => answer(null)}>{text('Überspringen', 'Skip')}</button>
            {step > 0 && <button type="button" className={quietButton} onClick={() => setStep(step - 1)}>{text('Zurück', 'Back')}</button>}
            {phase === 'after' && step === 0 && (
              <button type="button" className={quietButton} onClick={() => setDraft({ answers: {}, noTrades: true })}>
                {text('Heute keine Trades', 'No trades today')}
              </button>
            )}
          </div>
        </section>
      )}

      {day && phase && !question && (
        <section className="space-y-4">
          <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold text-white outline-none">{phaseLabels[phase]}</h3>
          {draft.noTrades ? (
            <p className="text-sm text-white/72">{text('Heute keine Trades', 'No trades today')}</p>
          ) : (
            <dl className="space-y-2 text-sm">
              {questions.map((item) => {
                const rating = draft.answers[item]
                return (
                  <div key={item} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                    <dt className="text-white/72">{copy[item].label}</dt>
                    <dd className="text-orange-100">{rating ? copy[item].scale[rating - 1] : text('Übersprungen', 'Skipped')}</dd>
                  </div>
                )
              })}
            </dl>
          )}
          {saved && <p role="status" className="text-sm text-emerald-200">{text('Check-in gespeichert.', 'Check-in saved.')}</p>}
          {error && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-orange-100">{error === 'changed'
                ? text('Die Antworten wurden inzwischen geändert. Lade den aktuellen Stand.', 'The answers changed while you were editing. Reload to see the latest version.')
                : text('Der Check-in konnte nicht gespeichert werden. Versuche es erneut.', 'Could not save your check-in. Try again.')}</p>
              {error === 'changed' && <button type="button" className={quietButton} onClick={reload}>{text('Neu laden', 'Reload')}</button>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {editing && <button type="button" className={actionButton} onClick={() => void save()} disabled={saving || error === 'changed'}>
              {saving ? text('Speichert …', 'Saving…')
                : hasCheckInContent(draft) ? text('Speichern', 'Save')
                : day[phase] ? text('Antworten entfernen', 'Clear answers')
                : text('Fertig', 'Done')}
            </button>}
            <button type="button" className={quietButton} disabled={saving} onClick={() => {
              if (draft.noTrades) setDraft(emptyDraft)
              setEditing(true)
              setStep(0)
              setSaved(false)
              setError(null)
            }}>
              {text('Antworten bearbeiten', 'Edit answers')}
            </button>
            <button type="button" className={quietButton} disabled={saving} onClick={goBackToPhases}>
              {editing ? text('Abbrechen', 'Cancel') : text('Zur Auswahl', 'Back to options')}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

'use client'

import { useMemo, useState, useTransition } from 'react'
import { createSetupSuggestion, promoteSetupSuggestionToMaster, updateSetupSuggestionByAdmin } from '@/app/actions/setup-suggestions'
import type { SavedSetupSuggestion, SetupSuggestionStatus } from '@/lib/types/setup-suggestion'

const statusLabels: Record<SetupSuggestionStatus, string> = {
  pending: 'Offen',
  accepted: 'Übernommen',
  rejected: 'Abgelehnt',
  archived: 'Archiviert',
}

export function SetupSuggestionCard({ suggestions, canManageMaster }: { suggestions: SavedSetupSuggestion[]; canManageMaster: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()
  const pendingSuggestions = useMemo(() => suggestions.filter((item) => item.status === 'pending'), [suggestions])
  const reviewedSuggestions = useMemo(() => suggestions.filter((item) => item.status !== 'pending').slice(0, 6), [suggestions])
  const ownSuggestions = canManageMaster ? suggestions.slice(0, 8) : suggestions.slice(0, 6)

  function handleSubmit(formData: FormData) {
    setStatus('')
    startTransition(async () => {
      const result = await createSetupSuggestion({
        title: String(formData.get('title') ?? ''),
        category: String(formData.get('category') ?? ''),
        description: String(formData.get('description') ?? ''),
        entry: String(formData.get('entry') ?? ''),
        exit: String(formData.get('exit') ?? ''),
        invalidation: String(formData.get('invalidation') ?? ''),
        checklist: String(formData.get('checklist') ?? ''),
        mistakes: String(formData.get('mistakes') ?? ''),
      })
      setStatus(result.message)
      if (result.success) setIsOpen(false)
    })
  }

  function handleAdminUpdate(suggestionId: string, nextStatus: SetupSuggestionStatus, adminNote?: string) {
    setStatus('')
    startTransition(async () => {
      const result = await updateSetupSuggestionByAdmin({ suggestionId, status: nextStatus, adminNote })
      setStatus(result.message)
    })
  }

  function handlePromote(suggestionId: string, adminNote?: string) {
    setStatus('')
    startTransition(async () => {
      const result = await promoteSetupSuggestionToMaster({ suggestionId, adminNote })
      setStatus(result.message)
    })
  }

  return (
    <section className="rounded-[32px] border border-white/10 bg-black/20 p-6 shadow-[0_18px_55px_rgba(0,0,0,0.34)] xl:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[10px] uppercase tracking-[0.26em] text-orange-100/55">Setup-Vorschläge</p>
          <h2 className="eq-display mt-2 text-2xl text-white">Vorschläge</h2>
          <p className="mt-3 text-sm leading-6 text-white/58">
            Reiche ein Muster ein. Offene Vorschläge bleiben Eingang. Übernommene Muster landen in der Master-Bibliothek.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="inline-flex w-fit items-center justify-center rounded-full border border-orange-300/30 bg-orange-400/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-100 transition hover:border-orange-300/50 hover:bg-orange-400/18"
        >
          {isOpen ? 'Schließen' : 'Vorschlagen'}
        </button>
      </div>

      {status ? <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">{status}</p> : null}

      {isOpen ? (
        <form action={handleSubmit} className="mt-6 grid gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field name="title" label="Name" required placeholder="z. B. London Sweep Reclaim" />
            <Field name="category" label="Kategorie" placeholder="z. B. Liquidity, Breakout, Reversal" />
          </div>
          <TextArea name="description" label="Idee" placeholder="Marktphase, Signal, Kontext" />
          <div className="grid gap-4 lg:grid-cols-3">
            <TextArea name="entry" label="Entry" placeholder="Was muss vor dem Entry passieren?" />
            <TextArea name="exit" label="Exit" placeholder="Teilverkauf, Ziel, Management" />
            <TextArea name="invalidation" label="Stop" placeholder="Wann ist das Setup ungültig?" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <TextArea name="checklist" label="Checkliste" placeholder="Eine Zeile pro Punkt" />
            <TextArea name="mistakes" label="Fehler" placeholder="Wann lasse ich es bleiben?" />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex w-fit items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-400/12 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/45 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isPending ? 'Senden …' : 'Vorschlag senden'}
          </button>
        </form>
      ) : null}

      {canManageMaster && pendingSuggestions.length ? (
        <div className="mt-6 rounded-[26px] border border-orange-400/16 bg-orange-400/[0.05] p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-orange-100/55">Eingang</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Offene Vorschläge</h3>
            </div>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">{pendingSuggestions.length} offen</span>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {pendingSuggestions.slice(0, 6).map((suggestion) => (
              <SuggestionTile key={suggestion.id} suggestion={suggestion} onUpdate={handleAdminUpdate} onPromote={handlePromote} isPending={isPending} admin />
            ))}
          </div>
        </div>
      ) : null}

      {canManageMaster && reviewedSuggestions.length ? (
        <details className="group mt-5 rounded-[26px] border border-white/10 bg-white/[0.03] p-5">
          <summary className="cursor-pointer list-none text-sm font-semibold text-white/72">
            Archiv / geprüft <span className="text-white/38">({reviewedSuggestions.length})</span>
          </summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {reviewedSuggestions.map((suggestion) => <SuggestionTile key={suggestion.id} suggestion={suggestion} isPending={isPending} />)}
          </div>
        </details>
      ) : null}

      {!canManageMaster && ownSuggestions.length ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {ownSuggestions.map((suggestion) => <SuggestionTile key={suggestion.id} suggestion={suggestion} isPending={isPending} />)}
        </div>
      ) : null}
    </section>
  )
}

function Field({ name, label, required, placeholder }: { name: string; label: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.22em] text-white/38">{label}</span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-orange-300/45"
      />
    </label>
  )
}

function TextArea({ name, label, placeholder }: { name: string; label: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.22em] text-white/38">{label}</span>
      <textarea
        name={name}
        rows={3}
        placeholder={placeholder}
        className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/25 focus:border-orange-300/45"
      />
    </label>
  )
}

function SuggestionTile({
  suggestion,
  admin = false,
  isPending,
  onUpdate,
  onPromote,
}: {
  suggestion: SavedSetupSuggestion
  admin?: boolean
  isPending: boolean
  onUpdate?: (id: string, status: SetupSuggestionStatus, adminNote?: string) => void
  onPromote?: (id: string, adminNote?: string) => void
}) {
  const [note, setNote] = useState(suggestion.adminNote ?? '')
  const checklistPreview = [...suggestion.checklist, ...suggestion.mistakes].slice(0, 3)

  return (
    <article className="rounded-[24px] border border-white/10 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{statusLabels[suggestion.status]}</p>
          <h4 className="mt-2 text-base font-semibold text-white">{suggestion.title}</h4>
        </div>
        {suggestion.category ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55">{suggestion.category}</span> : null}
      </div>
      {suggestion.description ? <p className="mt-3 text-sm leading-6 text-white/58">{suggestion.description}</p> : null}
      {checklistPreview.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {checklistPreview.map((item) => (
            <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/50">
              {item}
            </span>
          ))}
        </div>
      ) : null}
      {suggestion.adminNote && !admin ? <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-5 text-white/55">Admin: {suggestion.adminNote}</p> : null}
      {admin ? (
        <div className="mt-4 grid gap-3">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder="Kommentar für Nutzer"
            className="w-full resize-y rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-xs leading-5 text-white outline-none transition placeholder:text-white/25 focus:border-orange-300/45"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isPending} onClick={() => onPromote?.(suggestion.id, note)} className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100 disabled:opacity-50">Als Master übernehmen</button>
            <button type="button" disabled={isPending} onClick={() => onUpdate?.(suggestion.id, 'accepted', note)} className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1.5 text-xs text-sky-100 disabled:opacity-50">Markieren</button>
            <button type="button" disabled={isPending} onClick={() => onUpdate?.(suggestion.id, 'rejected', note)} className="rounded-full border border-red-300/20 bg-red-400/10 px-3 py-1.5 text-xs text-red-100 disabled:opacity-50">Ablehnen</button>
            <button type="button" disabled={isPending} onClick={() => onUpdate?.(suggestion.id, 'archived', note)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/62 disabled:opacity-50">Archivieren</button>
          </div>
        </div>
      ) : null}
    </article>
  )
}

'use client'

import { useRef, useState, useTransition } from 'react'
import { setTradeTagsForTrade } from '@/app/actions/trade-tags'

const PRESET_TAGS = [
  'FOMO',
  'Zu früh',
  'News',
  'Overtrade',
  'Regelkonform',
  'Geduldig',
  'Chase',
  'A-Setup',
  'B-Setup',
  'Impulsiv',
  'Diszipliniert',
  'Fokus',
  'Ruhig',
  'Revanche',
]

type TradeTagEditorProps = {
  tradeId: string
  initialTags: string[]
  tagOptions?: string[]
  source: 'supabase' | 'mock'
}

export function TradeTagEditor({ tradeId, initialTags, tagOptions = PRESET_TAGS, source }: TradeTagEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [activeTags, setActiveTags] = useState<string[]>(initialTags)
  const [draftTags, setDraftTags] = useState<string[]>(initialTags)
  const [customInput, setCustomInput] = useState('')
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const presets = [...new Set([...tagOptions, ...PRESET_TAGS])]

  function openEditor() {
    setDraftTags(activeTags)
    setCustomInput('')
    setStatus(null)
    setIsEditing(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function cancelEditor() {
    setDraftTags(activeTags)
    setCustomInput('')
    setStatus(null)
    setIsEditing(false)
  }

  function togglePreset(tag: string) {
    setDraftTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    )
  }

  function addCustomTag() {
    const trimmed = customInput.trim()
    if (!trimmed) return
    if (!draftTags.includes(trimmed)) {
      setDraftTags((current) => [...current, trimmed])
    }
    setCustomInput('')
    inputRef.current?.focus()
  }

  function handleCustomKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      addCustomTag()
    }
    if (event.key === 'Escape') {
      cancelEditor()
    }
  }

  function removeDraftTag(tag: string) {
    setDraftTags((current) => current.filter((t) => t !== tag))
  }

  function handleSave() {
    startTransition(async () => {
      const result = await setTradeTagsForTrade(tradeId, draftTags)
      setStatus({ text: result.message, ok: result.success })
      if (result.success) {
        setActiveTags(result.tags)
        setTimeout(() => {
          setIsEditing(false)
          setStatus(null)
        }, 1200)
      }
    })
  }

  // --- View mode ---
  if (!isEditing) {
    return (
      <div className="group relative rounded-2xl border border-orange-400/15 bg-black/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Trade Tags</p>
          <button
            type="button"
            onClick={openEditor}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55 opacity-0 transition hover:border-orange-400/20 hover:bg-orange-400/10 hover:text-orange-100/80 group-hover:opacity-100"
          >
            Bearbeiten
          </button>
        </div>

        {activeTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activeTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100/85"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={openEditor}
            className="text-sm text-white/35 transition hover:text-white/55"
          >
            Tags hinzufügen…
          </button>
        )}

        {source === 'mock' && (
          <p className="mt-3 text-[11px] text-white/30">Demo-Modus — Tags werden nicht persistiert</p>
        )}
      </div>
    )
  }

  // --- Edit mode ---
  return (
    <div className="rounded-2xl border border-orange-400/25 bg-black/50 p-4 shadow-[0_0_24px_rgba(251,146,60,0.07)]">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Tags bearbeiten</p>
        <button
          type="button"
          onClick={cancelEditor}
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55 transition hover:text-white/80"
        >
          Abbrechen
        </button>
      </div>

      {/* Aktive Draft-Tags */}
      <div className="mb-4 min-h-[2.5rem] rounded-2xl border border-white/8 bg-black/30 px-3 py-2.5">
        {draftTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {draftTags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1.5 rounded-full border border-orange-400/25 bg-orange-400/12 pl-2.5 pr-1.5 py-1 text-xs text-orange-100/90"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeDraftTag(tag)}
                  aria-label={`${tag} entfernen`}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-orange-100/50 transition hover:bg-orange-400/20 hover:text-orange-100"
                >
                  <svg viewBox="0 0 10 10" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M2 2l6 6M8 2l-6 6" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/30">Noch keine Tags gewählt</p>
        )}
      </div>

      {/* Preset-Buttons */}
      <div className="mb-4">
        <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/30">Schnellauswahl</p>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((tag) => {
            const isActive = draftTags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                onClick={() => togglePreset(tag)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                  isActive
                    ? 'border-orange-400/25 bg-orange-400/12 text-orange-100 shadow-[0_0_12px_rgba(251,146,60,0.15)]'
                    : 'border-white/10 bg-black/20 text-white/55 hover:border-white/15 hover:text-white/75'
                }`}
              >
                {tag}
              </button>
            )
          })}
        </div>
      </div>

      {/* Freier Custom-Input */}
      <div className="mb-5">
        <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/30">Eigener Tag</p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={handleCustomKeyDown}
            placeholder="z.B. FOMC-Tag, Reversal …"
            className="flex-1 rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-orange-400/30"
          />
          <button
            type="button"
            onClick={addCustomTag}
            disabled={!customInput.trim()}
            className="rounded-2xl border border-orange-400/20 bg-orange-400/10 px-4 py-2.5 text-xs text-orange-100/80 transition hover:bg-orange-400/18 hover:text-orange-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Hinzufügen
          </button>
        </div>
      </div>

      {/* Footer: Status + Speichern */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-h-[1.25rem]">
          {status && (
            <p className={`text-xs ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {status.text}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-2xl border border-orange-400/30 bg-orange-400 px-5 py-2.5 text-xs font-medium text-black transition hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? 'Wird gespeichert…' : `${draftTags.length} Tag${draftTags.length === 1 ? '' : 's'} speichern`}
        </button>
      </div>
    </div>
  )
}

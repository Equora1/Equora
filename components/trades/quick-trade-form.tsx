'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createQuickTradeEntry, syncTradeMedia } from '@/app/actions/trades'
import { TradeTagSelector } from '@/components/trades/trade-tag-selector'
import { SnippingAssistCard } from '@/components/trades/snipping-assist-card'
import { ChartUploadAdvanced } from '@/components/uploads/chart-upload-advanced'
import { uploadTradeScreenshots } from '@/lib/supabase/storage'
import type { TradeMediaUploadInput } from '@/lib/types/media'
import type { QuickTradeValidationField } from '@/lib/utils/trade-validation'
import { getTradeCaptureResultLabel } from '@/lib/utils/trade-capture'
import {
  getInitialQuickCapturePromptIndex,
  getNextQuickCapturePromptIndex,
  quickCapturePrompts,
} from '@/lib/utils/quick-capture-prompts'

const QUICK_CAPTURE_PREFS_KEY = 'equora.quickCapturePrefs.v56.20'

type QuickCapturePrefs = {
  market?: string
  setup?: string
  tags?: string[]
  tradeState?: 'open' | 'closed'
}

const quickResultOptions = [
  { value: 'winner', label: getTradeCaptureResultLabel('winner') },
  { value: 'loser', label: getTradeCaptureResultLabel('loser') },
  { value: 'breakeven', label: getTradeCaptureResultLabel('breakeven') },
] as const

function dedupeFiles(files: File[]) {
  return Array.from(new Map(files.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file])).values())
}

function normalizeMedia(items: TradeMediaUploadInput[]) {
  return items.map((item, index) => ({ ...item, sortOrder: index, isPrimary: index === 0 }))
}

export function QuickTradeForm({
  markets,
  setups,
  tagOptions,
}: {
  markets: string[]
  setups: string[]
  tagOptions: string[]
}) {
  const router = useRouter()
  const [market, setMarket] = useState(markets[0] ?? '')
  const [setup, setSetup] = useState(setups[0] ?? '')
  const [tradeState, setTradeState] = useState<'open' | 'closed'>('open')
  const [captureResult, setCaptureResult] = useState<(typeof quickResultOptions)[number]['value']>('winner')
  const [notes, setNotes] = useState('')
  const [promptIndex, setPromptIndex] = useState(() => getInitialQuickCapturePromptIndex())
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [snippingFile, setSnippingFile] = useState<File | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [status, setStatus] = useState('')
  const [lastSavedTradeId, setLastSavedTradeId] = useState('')
  const [validationErrors, setValidationErrors] = useState<Partial<Record<QuickTradeValidationField, string>>>({})
  const [isPending, startTransition] = useTransition()

  const pendingFiles = useMemo(() => dedupeFiles([...(snippingFile ? [snippingFile] : []), ...files]), [files, snippingFile])
  const activePrompt = quickCapturePrompts[promptIndex] ?? quickCapturePrompts[0]
  const effectiveCaptureResult: 'winner' | 'loser' | 'breakeven' | 'open' = tradeState === 'open' ? 'open' : captureResult
  const selectedTagHint = useMemo(() => {
    if (selectedTags.length === 0) return 'Tags bleiben optional. Ein oder zwei Tags helfen später beim Review.'
    if (selectedTags.length === 1) return 'Noch ein Tag möglich.'
    return 'Tag-Limit erreicht.'
  }, [selectedTags])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(QUICK_CAPTURE_PREFS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as QuickCapturePrefs
      if (parsed.market) setMarket(parsed.market)
      if (parsed.setup) setSetup(parsed.setup)
      if (Array.isArray(parsed.tags) && parsed.tags.length) setSelectedTags(parsed.tags.slice(0, 2))
      if (parsed.tradeState === 'open' || parsed.tradeState === 'closed') setTradeState(parsed.tradeState)
    } catch {
      // ignore broken local storage state
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const payload: QuickCapturePrefs = {
        market: market.trim() || undefined,
        setup: setup.trim() || undefined,
        tags: selectedTags.length ? selectedTags.slice(0, 2) : undefined,
        tradeState,
      }
      window.localStorage.setItem(QUICK_CAPTURE_PREFS_KEY, JSON.stringify(payload))
    } catch {
      // ignore write failures
    }
  }, [market, setup, selectedTags, tradeState])

  function handleTagChange(nextTags: string[]) {
    setSelectedTags(nextTags.length > 2 ? nextTags.slice(-2) : nextTags)
    setValidationErrors((current) => ({ ...current, tags: undefined }))
  }

  function applySnippingValues(payload: { market?: string; captureResult?: 'winner' | 'loser' | 'breakeven' | 'open' }) {
    if (payload.market) setMarket(payload.market)
    if (payload.captureResult) {
      if (payload.captureResult === 'open') {
        setTradeState('open')
      } else {
        setTradeState('closed')
        setCaptureResult(payload.captureResult)
      }
    }
    setStatus('Snipping-Vorschläge übernommen. Du kannst jetzt direkt speichern.')
  }

  function resetForm() {
    setTradeState('open')
    setCaptureResult('winner')
    setNotes('')
    setSelectedTags([])
    setSnippingFile(null)
    setFiles([])
    setValidationErrors({})
    setPromptIndex((current) => getNextQuickCapturePromptIndex(current))
  }

  const saveLabel = pendingFiles.length ? 'Screenshot sichern' : market.trim() || setup.trim() ? 'Trade schnell sichern' : 'Leeren Capture verhindern'

  function handleSubmit() {
    setStatus('')
    setLastSavedTradeId('')
    setValidationErrors({})

    if (!pendingFiles.length && !market.trim() && !setup.trim() && !notes.trim()) {
      setStatus('Bitte mindestens einen Screenshot sichern oder Asset / Setup kurz benennen.')
      return
    }

    startTransition(async () => {
      const result = await createQuickTradeEntry({
        market,
        setup,
        captureResult: effectiveCaptureResult,
        notes,
        screenshotUrl: '',
        tags: selectedTags,
      })

      if (!result.success) {
        setStatus(result.message)
        if ('fieldErrors' in result && result.fieldErrors) {
          setValidationErrors(result.fieldErrors)
        }
        return
      }

      if (result.tradeId) setLastSavedTradeId(result.tradeId)

      if (pendingFiles.length && result.tradeId && result.mode === 'supabase') {
        try {
          setStatus('Screenshots werden in den Bucket geladen...')
          const uploaded = await uploadTradeScreenshots(result.tradeId, pendingFiles)
          const mediaResult = await syncTradeMedia(result.tradeId, normalizeMedia(uploaded))
          if (!mediaResult.success) {
            setStatus(`${result.message} Screenshot-Sync hakt noch: ${mediaResult.message}`)
            return
          }
          setStatus(`${result.message} ${pendingFiles.length} Screenshot(s) angehängt.`)
        } catch (error) {
          setStatus(`${result.message} Screenshot-Upload hakt noch: ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}`)
          return
        }
      } else {
        if (pendingFiles.length && result.mode !== 'supabase') {
          setStatus(`${result.message} Screenshot-Upload bleibt im Demo-Modus lokal offen.`)
        } else {
          setStatus(result.message)
        }
      }

      resetForm()
      router.refresh()
    })
  }

  return (
    <section className="rounded-[30px] border border-[#c8823a]/16 bg-[#c8823a]/[0.045] p-5 shadow-2xl xl:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[#f0a855]/78">Screenshot-first Capture</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Erst den Screenshot sichern, den Rest später</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Wenn der Screenshot alles zeigt, darf er allein reichen. Asset, Setup und Kontext bleiben hier bewusst optional.</p>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="eq-button-primary rounded-2xl px-5 py-3 text-sm font-medium transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? 'Sichert gerade...' : saveLabel}
        </button>
      </div>

      <div className="mt-5 rounded-3xl border border-white/10 bg-black/18 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Trade-Stand</p>
            <p className="mt-1 text-sm text-white/60">Offen ist der Standard. Einen geschlossenen Trade kannst du hier trotzdem direkt kurz sichern.</p>
          </div>
          <div className="flex rounded-full border border-white/10 bg-black/30 p-1 text-sm">
            {(['open', 'closed'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTradeState(option)}
                className={`rounded-full px-4 py-2 transition ${tradeState === option ? 'bg-[#f0a855] text-black' : 'text-white/60 hover:text-white'}`}
              >
                {option === 'open' ? 'Offen' : 'Geschlossen'}
              </button>
            ))}
          </div>
        </div>
        {tradeState === 'closed' ? (
          <div className="mt-4 rounded-2xl border border-[#c8823a]/14 bg-[#c8823a]/[0.06] p-4">
            <label className="block text-xs uppercase tracking-[0.2em] text-white/40">Ergebnis</label>
            <select
              value={captureResult}
              onChange={(event) => setCaptureResult(event.target.value as (typeof quickResultOptions)[number]['value'])}
              className="mt-3 w-full rounded-2xl border border-[#c8823a]/18 bg-[#c8823a]/[0.07] px-4 py-3 text-sm text-white outline-none"
            >
              {quickResultOptions.map((option) => (
                <option key={option.value} value={option.value} className="bg-black text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="mt-4 text-xs leading-5 text-white/50">Exit und exakte Rechnung kommen erst beim Schließen des Trades. Für den ersten Save reicht der Screenshot.</p>
        )}
      </div>
      <div className="mt-4 rounded-3xl border border-white/10 bg-black/18 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">Screenshot zuerst</p>
            <p className="mt-1 text-sm text-white/60">Der Screenshot ist dein sicherer Anker. Wenn darauf schon alles sichtbar ist, darf der Rest später kommen.</p>
          </div>
          {pendingFiles.length ? <span className="eq-pill-soft px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[#f0a855]">{pendingFiles.length} Bild(er) im Puffer</span> : null}
        </div>
        <div className="mt-4">
          <SnippingAssistCard mode="quick" marketOptions={markets} onApply={applySnippingValues} onFileChange={setSnippingFile} />
        </div>
        <div className="mt-4">
          <ChartUploadAdvanced label="Weitere Screenshots / Chartbilder" onFilesChange={setFiles} />
        </div>
      </div>

      <details className="mt-4 rounded-3xl border border-white/10 bg-black/18 p-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-white">Optionale Felder jetzt oder später ergänzen</summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 rounded-3xl border border-white/10 bg-black/20 p-4">
              <label htmlFor="quick-trade-market" className="block text-xs uppercase tracking-[0.2em] text-white/40">Asset / Markt optional</label>
              <input
                id="quick-trade-market"
                list="quick-market-options"
                value={market}
                onChange={(event) => setMarket(event.target.value)}
                placeholder="z. B. NASDAQ, BTC/USD, EUR/USD"
                className="w-full rounded-2xl border border-[#c8823a]/18 bg-[#c8823a]/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
              />
            </div>

            <div className="space-y-2 rounded-3xl border border-white/10 bg-black/20 p-4">
              <label htmlFor="quick-trade-setup" className="block text-xs uppercase tracking-[0.2em] text-white/40">Grund / Setup optional</label>
              <input
                id="quick-trade-setup"
                list="quick-setup-options"
                value={setup}
                onChange={(event) => setSetup(event.target.value)}
                placeholder="z. B. Sweep, Pullback, Reclaim"
                className="w-full rounded-2xl border border-[#c8823a]/18 bg-[#c8823a]/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
              />
            </div>
          </div>
          <div className="rounded-3xl border border-[#c8823a]/14 bg-[#c8823a]/[0.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#f0a855]/60">Kurzer Kontext</p>
                <p className="mt-1 text-sm text-white/65">Ein Satz reicht. Wenn nichts da steht, speichert der Trade trotzdem sauber.</p>
              </div>
              <button
                type="button"
                onClick={() => setPromptIndex((current) => getNextQuickCapturePromptIndex(current))}
                className="eq-pill-soft px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#f0a855]"
              >
                Neue Frage
              </button>
            </div>
            <p className="mt-3 text-sm font-medium text-white">{activePrompt}</p>
            <textarea
              id="quick-trade-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Ein Satz reicht"
              className="mt-3 min-h-[108px] w-full rounded-2xl border border-[#c8823a]/18 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
            />
          </div>

          <div>
            <TradeTagSelector selectedTags={selectedTags} onChange={handleTagChange} options={tagOptions} />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-white/50">{selectedTagHint}</p>
              <div className="eq-pill-soft px-3 py-1 text-xs">{selectedTags.length}/2 Tags</div>
            </div>
            {validationErrors.tags ? <p className="mt-2 text-xs text-red-300">{validationErrors.tags}</p> : null}
          </div>
        </div>
      </details>

      <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-white/50">
          Gespeichert als <span className="text-[#f0a855]">{tradeState === 'open' ? 'Offen / Unvollständig' : 'Geschlossen in Kurzform'}</span>, damit der Moment zuerst sicher bleibt.
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="eq-button-primary rounded-2xl px-5 py-3 text-sm font-medium transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? 'Schnellerfassung speichert...' : saveLabel}
        </button>
      </div>

      {status ? <p className="mt-4 text-sm text-white/65">{status}</p> : null}
      {lastSavedTradeId ? <p className="mt-2 text-xs text-white/45">Trade-ID gespeichert: {lastSavedTradeId}</p> : null}

      <datalist id="quick-market-options">
        {markets.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      <datalist id="quick-setup-options">
        {setups.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </section>
  )
}

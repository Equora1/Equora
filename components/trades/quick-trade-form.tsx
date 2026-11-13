'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createQuickTradeEntry, syncTradeMedia } from '@/app/actions/trades'
import { requestUncommittedMediaCleanup } from '@/app/actions/media-cleanup'
import { TradeTagSelector } from '@/components/trades/trade-tag-selector'
import { SnippingAssistCard } from '@/components/trades/snipping-assist-dynamic'
import { ChartUploadAdvanced } from '@/components/uploads/chart-upload-advanced'
import { uploadTradeScreenshots } from '@/lib/supabase/storage'
import type { TradeMediaUploadInput } from '@/lib/types/media'
import type { QuickTradeValidationField } from '@/lib/utils/trade-validation'
import { getTradeCaptureResultLabel } from '@/lib/utils/trade-capture'
import {
  getInitialQuickCapturePromptIndex,
  getNextQuickCapturePromptIndex,
  getQuickCapturePrompt,
} from '@/lib/utils/quick-capture-prompts'

const QUICK_CAPTURE_PREFS_KEY = 'equora.quickCapturePrefs.v56.20'

type QuickCapturePrefs = {
  market?: string
  setup?: string
  tags?: string[]
  tradeState?: 'open' | 'closed'
}

const quickResults = ['winner', 'loser', 'breakeven'] as const
type QuickResult = (typeof quickResults)[number]

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
  const locale = useJournalLocale()
  const text = journalText(locale)
  const router = useRouter()
  const [market, setMarket] = useState(markets[0] ?? '')
  const [setup, setSetup] = useState(setups[0] ?? '')
  const [tradeState, setTradeState] = useState<'open' | 'closed'>('open')
  const [captureResult, setCaptureResult] = useState<QuickResult>('winner')
  const [notes, setNotes] = useState('')
  const [promptIndex, setPromptIndex] = useState(0)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [snippingFiles, setSnippingFiles] = useState<File[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [status, setStatus] = useState('')
  const [lastSavedTradeId, setLastSavedTradeId] = useState('')
  const [validationErrors, setValidationErrors] = useState<Partial<Record<QuickTradeValidationField, string>>>({})
  const [isPending, startTransition] = useTransition()

  const pendingFiles = useMemo(() => dedupeFiles([...snippingFiles, ...files]), [files, snippingFiles])
  const activePrompt = getQuickCapturePrompt(promptIndex, locale)
  const effectiveCaptureResult: 'winner' | 'loser' | 'breakeven' | 'open' = tradeState === 'open' ? 'open' : captureResult
  const selectedTagHint = selectedTags.length === 0
    ? text('Tags bleiben optional. Ein oder zwei Tags helfen später beim Review.', 'Add up to two tags to help with your review later.')
    : selectedTags.length === 1
      ? text('Noch ein Tag möglich.', 'You can add one more tag.')
      : text('Tag-Limit erreicht.', 'Two tags selected.')

  useEffect(() => {
    setPromptIndex(getInitialQuickCapturePromptIndex())
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
    setStatus(text('Snipping-Vorschläge übernommen. Du kannst jetzt direkt speichern.', 'Screenshot suggestions applied. Review the details before saving.'))
  }

  function resetForm() {
    setTradeState('open')
    setCaptureResult('winner')
    setNotes('')
    setSelectedTags([])
    setSnippingFiles([])
    setFiles([])
    setValidationErrors({})
    setPromptIndex((current) => getNextQuickCapturePromptIndex(current))
  }

  const saveLabel = pendingFiles.length ? text('Screenshot sichern', 'Save screenshot') : market.trim() || setup.trim() ? text('Trade + Zeit sichern', 'Save trade and time') : text('Markt, Setup oder Screenshot ergänzen', 'Add a market, setup or screenshot')

  function handleSubmit() {
    setStatus('')
    setLastSavedTradeId('')
    setValidationErrors({})

    if (!pendingFiles.length && !market.trim() && !setup.trim() && !notes.trim()) {
      setStatus(text('Bitte mindestens einen Screenshot sichern oder Asset / Setup kurz benennen.', 'Add a screenshot, market or setup first.'))
      return
    }

    startTransition(async () => {
      const result = await createQuickTradeEntry({
        market,
        setup,
        captureResult: effectiveCaptureResult,
        notes,
        capturedAt: new Date().toISOString(),
        screenshotUrl: '',
        tags: selectedTags,
      }, locale)

      if (!result.success) {
        setStatus(result.message)
        if ('fieldErrors' in result && result.fieldErrors) {
          setValidationErrors(result.fieldErrors)
        }
        return
      }

      if (result.tradeId) setLastSavedTradeId(result.tradeId)

      if (pendingFiles.length && result.tradeId && result.mode === 'supabase') {
        let uploaded: TradeMediaUploadInput[] = []
        try {
          setStatus(text('Screenshots werden hochgeladen …', 'Uploading screenshots…'))
          uploaded = await uploadTradeScreenshots(result.tradeId, pendingFiles)
          const mediaResult = await syncTradeMedia(result.tradeId, normalizeMedia(uploaded))
          if (!mediaResult.success) {
            await requestUncommittedMediaCleanup({ kind: 'trade', parentId: result.tradeId, storagePaths: uploaded.map((item) => item.storagePath) })
            setStatus(`${result.message} ${text('Die Screenshots konnten nicht angehängt werden.', 'The screenshots could not be attached.')}`)
            return
          }
          const count = pendingFiles.length
          setStatus(`${result.message} ${text(`${count} Screenshot(s) angehängt.`, `${count} ${count === 1 ? 'screenshot' : 'screenshots'} attached.`)}`)
        } catch {
          if (uploaded.length) {
            await requestUncommittedMediaCleanup({ kind: 'trade', parentId: result.tradeId, storagePaths: uploaded.map((item) => item.storagePath) })
          }
          setStatus(`${result.message} ${text('Die Screenshots konnten nicht hochgeladen werden.', 'The screenshots could not be uploaded.')}`)
          return
        }
      } else {
        if (pendingFiles.length && result.mode !== 'supabase') {
          setStatus(`${result.message} ${text('Im Demo-Modus werden keine Screenshots hochgeladen.', 'Demo mode keeps screenshots on this device.')}`)
        } else {
          setStatus(result.message)
        }
      }

      resetForm()
      router.refresh()
    })
  }

  return (
    <section lang={locale} className="rounded-[30px] border border-[#c8823a]/16 bg-[#c8823a]/[0.045] p-5 shadow-2xl xl:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[#f0a855]/78">{text('Schnellerfassung mit Screenshot', 'Quick entry with a screenshot')}</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{text('Erst den Screenshot sichern, den Rest später', 'Save a screenshot and add details later')}</h2>
          
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="eq-button-primary rounded-2xl px-5 py-3 text-sm font-medium transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? text('Sichert gerade...', 'Saving…') : saveLabel}
        </button>
      </div>

      <div className="mt-5 rounded-3xl border border-white/10 bg-black/18 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">{text('Trade-Stand', 'Trade status')}</p>
            
          </div>
          <div className="flex rounded-full border border-white/10 bg-black/30 p-1 text-sm">
            {(['open', 'closed'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTradeState(option)}
                className={`rounded-full px-4 py-2 transition ${tradeState === option ? 'bg-[#f0a855] text-black' : 'text-white/60 hover:text-white'}`}
              >
                {option === 'open' ? text('Offen', 'Open') : text('Geschlossen', 'Closed')}
              </button>
            ))}
          </div>
        </div>
        {tradeState === 'closed' ? (
          <div className="mt-4 rounded-2xl border border-[#c8823a]/14 bg-[#c8823a]/[0.06] p-4">
            <label className="block text-xs uppercase tracking-[0.2em] text-white/40">{text('Status', 'Outcome')}</label>
            <select
              aria-label={text('Status', 'Outcome')}
              value={captureResult}
              onChange={(event) => setCaptureResult(event.target.value as QuickResult)}
              className="mt-3 w-full rounded-2xl border border-[#c8823a]/18 bg-[#c8823a]/[0.07] px-4 py-3 text-sm text-white outline-none"
            >
              {quickResults.map((result) => (
                <option key={result} value={result} className="bg-black text-white">
                  {getTradeCaptureResultLabel(result, locale)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="mt-4 text-xs leading-5 text-white/50">{text('Exit und exakte Rechnung kommen erst beim Schließen des Trades. Für den ersten Save reicht der Screenshot.', 'Add the exit and final P&L when you close the trade. You can save a screenshot now.')}</p>
        )}
      </div>
      <div className="mt-4 rounded-3xl border border-white/10 bg-black/18 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">{text('Screenshot zuerst', 'Screenshot first')}</p>
            <p className="mt-1 text-sm text-white/60">{text('Der Screenshot ist dein sicherer Anker. Wenn darauf schon alles sichtbar ist, darf der Rest später kommen.', 'Capture the chart or position details now. You can fill in the trade later.')}</p>
          </div>
          {pendingFiles.length ? <span className="eq-pill-soft px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[#f0a855]">{text(`${pendingFiles.length} Bild(er) ausgewählt`, `${pendingFiles.length} ${pendingFiles.length === 1 ? 'image' : 'images'} selected`)}</span> : null}
        </div>
        <div className="mt-4">
          <SnippingAssistCard mode="quick" marketOptions={markets} onApply={applySnippingValues} onFilesChange={setSnippingFiles} />
        </div>
        <div className="mt-4">
          <ChartUploadAdvanced label={text('Weitere Screenshots / Chartbilder', 'More screenshots')} onFilesChange={setFiles} />
        </div>
      </div>

      <details className="mt-4 rounded-3xl border border-white/10 bg-black/18 p-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-white">{text('Optionale Felder jetzt oder später ergänzen', 'Optional details')}</summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 rounded-3xl border border-white/10 bg-black/20 p-4">
              <label htmlFor="quick-trade-market" className="block text-xs uppercase tracking-[0.2em] text-white/40">{text('Asset / Markt optional', 'Market (optional)')}</label>
              <input
                id="quick-trade-market"
                list="quick-market-options"
                value={market}
                onChange={(event) => setMarket(event.target.value)}
                placeholder={text('z. B. NASDAQ, BTC/USD, EUR/USD', 'e.g. NASDAQ, BTC/USD, EUR/USD')}
                className="w-full rounded-2xl border border-[#c8823a]/18 bg-[#c8823a]/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
              />
            </div>

            <div className="space-y-2 rounded-3xl border border-white/10 bg-black/20 p-4">
              <label htmlFor="quick-trade-setup" className="block text-xs uppercase tracking-[0.2em] text-white/40">{text('Grund / Setup optional', 'Setup (optional)')}</label>
              <input
                id="quick-trade-setup"
                list="quick-setup-options"
                value={setup}
                onChange={(event) => setSetup(event.target.value)}
                placeholder={text('z. B. Sweep, Pullback, Reclaim', 'e.g. Sweep, Pullback, Reclaim')}
                className="w-full rounded-2xl border border-[#c8823a]/18 bg-[#c8823a]/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
              />
            </div>
          </div>
          <div className="rounded-3xl border border-[#c8823a]/14 bg-[#c8823a]/[0.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#f0a855]/60">{text('Kurzer Kontext', 'Quick note')}</p>
                <p className="mt-1 text-sm text-white/65">{text('Ein Satz reicht. Wenn nichts da steht, speichert der Trade trotzdem sauber.', 'A sentence is enough. The note is optional.')}</p>
              </div>
              <button
                type="button"
                onClick={() => setPromptIndex((current) => getNextQuickCapturePromptIndex(current))}
                className="eq-pill-soft px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#f0a855]"
              >
                {text('Neue Frage', 'New question')}
              </button>
            </div>
            <p className="mt-3 text-sm font-medium text-white">{activePrompt}</p>
            <textarea
              id="quick-trade-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder={text('Ein Satz reicht', 'One sentence is enough')}
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
          {tradeState === 'open'
            ? text('Der Trade wird offen gespeichert. Fehlende Angaben kannst du später ergänzen.', 'This trade will be saved as open. Add missing details later.')
            : text('Der Trade wird geschlossen mit dem gewählten Status erfasst. Beträge kannst du später ergänzen.', 'This trade will be recorded as closed with the selected outcome. Add amounts later.')}
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="eq-button-primary rounded-2xl px-5 py-3 text-sm font-medium transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? text('Schnellerfassung speichert...', 'Saving quick entry…') : saveLabel}
        </button>
      </div>

      {status ? <p role="status" className="mt-4 text-sm text-white/65">{status}</p> : null}
      {lastSavedTradeId ? <p className="mt-2 text-xs text-white/45">{text('Trade-ID gespeichert:', 'Saved trade ID:')} {lastSavedTradeId}</p> : null}

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

'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'
import { parseTradeFromSnipText, type SnippingCaptureResult, type SnippingParseResult } from '@/lib/utils/snipping-parser'
import {
  preloadSnippingOcrWorker,
  recognizeSnippingImage,
  subscribeSnippingOcrProgress,
  type SnippingOcrProgress,
} from '@/lib/utils/snipping-ocr'

type SnippingApplyPayload = {
  market?: string
  bias?: 'Long' | 'Short'
  entry?: string
  exit?: string
  stopLoss?: string
  takeProfit?: string
  positionSize?: string
  netPnL?: string
  captureResult?: SnippingCaptureResult
}

const defaultOcrProgress: SnippingOcrProgress = {
  phase: 'idle',
  progress: 0,
  status: 'Erster OCR-Start lädt das Sprachmodell einmalig. Danach läuft es deutlich schneller.',
}

export function SnippingAssistCard({
  marketOptions,
  mode = 'full',
  onApply,
  onFileChange,
}: {
  marketOptions: string[]
  mode?: 'full' | 'quick'
  onApply: (payload: SnippingApplyPayload) => void
  onFileChange?: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [status, setStatus] = useState('Win + Shift + S, Positionsbox ausschneiden und hier mit Strg + V einfügen. Der Screenshot bleibt beim Speichern erhalten, auch wenn OCR nur teilweise trifft.')
  const [parsed, setParsed] = useState<SnippingParseResult | null>(null)
  const [ocrProgress, setOcrProgress] = useState<SnippingOcrProgress>(defaultOcrProgress)

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => subscribeSnippingOcrProgress(setOcrProgress), [])

  useEffect(() => {
    let cancelled = false

    async function warmUp() {
      try {
        await preloadSnippingOcrWorker()
      } catch {
        if (!cancelled) {
          setStatus('OCR konnte nicht vorgewärmt werden. Du kannst den Screenshot trotzdem speichern und später manuell ergänzen.')
        }
      }
    }

    const runWarmUp = () => {
      void warmUp()
    }

    const browserWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }

    if (typeof browserWindow.requestIdleCallback === 'function') {
      const idleId = browserWindow.requestIdleCallback(runWarmUp, { timeout: 1500 })

      return () => {
        cancelled = true
        browserWindow.cancelIdleCallback?.(idleId)
      }
    }

    const timeoutId: number = window.setTimeout(runWarmUp, 1200)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    if (!isAnalyzing) return
    if (ocrProgress.phase === 'preparing' || ocrProgress.phase === 'recognizing') {
      setStatus(ocrProgress.status)
    }
  }, [isAnalyzing, ocrProgress])

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const items = event.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const pasted = item.getAsFile()
          if (!pasted) continue
          setFile(pasted)
          onFileChange?.(pasted)
          setParsed(null)
          setStatus('Screenshot erkannt und für den Save vorgemerkt. OCR ist jetzt optional und liefert nur Vorschläge.')
          break
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [onFileChange])

  function selectFile(nextFile: File | null) {
    setFile(nextFile)
    onFileChange?.(nextFile)
    setParsed(null)
    setStatus(nextFile ? 'Screenshot erkannt und für den Save vorgemerkt. OCR ist jetzt optional und liefert nur Vorschläge.' : 'Screenshot entfernt.')
  }

  function handleFileSelection(fileList: FileList | null) {
    if (!fileList?.length) return
    selectFile(fileList[0])
  }

  async function analyzeScreenshot() {
    if (!file) {
      setStatus('Bitte zuerst einen Screenshot einfügen oder hochladen.')
      return
    }

    setIsAnalyzing(true)
    setStatus(
      ocrProgress.phase === 'idle'
        ? 'OCR startet. Das Sprachmodell wird beim ersten Mal einmalig geladen.'
        : ocrProgress.status
    )

    try {
      const text = await recognizeSnippingImage(file)
      const nextParsed = parseTradeFromSnipText(text, marketOptions)
      setParsed(nextParsed)

      const found = [nextParsed.market, nextParsed.entry, nextParsed.exit, nextParsed.netPnL, nextParsed.positionSize].filter(Boolean).length
      setStatus(
        found > 0
          ? `OCR fertig. ${found} Kernfelder als Vorschlag erkannt. Screenshot bleibt in jedem Fall am Trade hängen.`
          : 'OCR fertig, aber nur schwache Vorschläge gefunden. Kein Problem: Der Screenshot bleibt gespeichert und du kannst später manuell ergänzen.'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OCR konnte nicht gestartet werden.'
      setStatus(`Snipping Assist konnte OCR nicht ausführen: ${message}. Der Screenshot kann trotzdem gespeichert werden.`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  function applyDetectedValues() {
    if (!parsed) return
    onApply({
      market: parsed.market,
      bias: parsed.bias,
      entry: parsed.entry,
      exit: parsed.exit,
      stopLoss: parsed.stopLoss,
      takeProfit: parsed.takeProfit,
      positionSize: parsed.positionSize,
      netPnL: parsed.netPnL,
      captureResult: parsed.captureResult,
    })
    setStatus(mode === 'quick' ? 'Vorschläge in die Schnellerfassung übernommen. Den Rest kannst du später veredeln.' : 'Vorschläge in den Voll-Trade übernommen. Jetzt nur noch kurz gegenlesen.')
  }

  const confidenceLabel = parsed ? `${Math.round(parsed.confidence * 100)}% Vorschlags-Fit` : file ? 'Screenshot gesichert' : 'OCR Assist'
  const applyDisabled = !parsed || [parsed.market, parsed.entry, parsed.exit, parsed.netPnL, parsed.positionSize].filter(Boolean).length === 0
  const showProgress = isAnalyzing || ocrProgress.phase === 'preparing'
  const progressWidth = `${Math.max(6, ocrProgress.progress || 0)}%`

  return (
    <section className="rounded-3xl border border-emerald-400/15 bg-black/25 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/70">Snipping Assist</p>
          <h3 className="mt-2 text-lg font-semibold text-white">Screenshot sichern, Werte optional vorschlagen lassen</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            Schneide nur die Positionsbox oder Order-Zeile aus. Equora speichert den Screenshot zuverlässig mit dem Trade. OCR versucht danach Markt,
            Richtung, Entry, Exit, Größe oder P&amp;L vorzuschlagen, aber der Screenshot bleibt auch ohne perfekte Erkennung dein sicherer Anker.
          </p>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100/85">
          {confidenceLabel}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event: ChangeEvent<HTMLInputElement>) => handleFileSelection(event.target.files)}
      />

      <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4 text-sm text-emerald-100/85">
        <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-300/80">Capture zuerst sichern</p>
        <p className="mt-2 leading-6">
          Sobald der Screenshot hier drin ist, wird er beim Trade-Speichern mitgenommen. OCR ist in Equora ein Beschleuniger, kein Eintrittspreis.
        </p>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault()
              setDragActive(false)
              handleFileSelection(event.dataTransfer.files)
            }}
            className={`flex min-h-52 cursor-pointer items-center justify-center rounded-3xl border border-dashed px-4 py-6 text-center text-sm transition ${
              dragActive
                ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100/90'
                : 'border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 to-transparent text-white/45'
            }`}
          >
            {previewUrl ? (
              <div className="space-y-3" onClick={(event) => event.stopPropagation()}>
                <SetupImageLightbox
                  src={previewUrl}
                  alt={file?.name ?? 'Screenshot'}
                  badge="Capture"
                  hint="Klick für Großansicht"
                  stopPropagation
                  className="rounded-2xl"
                  imageClassName="max-h-64 w-full rounded-2xl object-contain bg-black/35"
                />
                <p className="text-xs text-white/45">Der Screenshot ist vorgemerkt. Klick für Großansicht, außerhalb klicken für neues Bild.</p>
              </div>
            ) : (
              <div>
                <p>Bild ziehen, klicken oder Snip mit Strg + V einfügen</p>
                <p className="mt-2 text-xs text-white/35">Am besten nur die Positionszeile oder das Positionspanel ausschneiden.</p>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={analyzeScreenshot}
              disabled={!file || isAnalyzing}
              className="rounded-2xl border border-emerald-400/25 bg-emerald-400 px-4 py-2 text-sm font-medium text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAnalyzing ? (ocrProgress.phase === 'preparing' ? 'Modell lädt...' : 'OCR läuft...') : 'Vorschläge erzeugen'}
            </button>
            <button
              type="button"
              onClick={() => selectFile(null)}
              disabled={!file || isAnalyzing}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Zurücksetzen
            </button>
            <button
              type="button"
              onClick={applyDetectedValues}
              disabled={applyDisabled || isAnalyzing}
              className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100 transition hover:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Vorschläge übernehmen
            </button>
          </div>

          {showProgress ? (
            <div className="mt-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-3">
              <div className="flex items-center justify-between gap-3 text-xs text-emerald-100/80">
                <span>{ocrProgress.status}</span>
                <span>{Math.round(ocrProgress.progress)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-emerald-400 transition-all duration-300" style={{ width: progressWidth }} />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-white/40">Hinweis: Der erste OCR-Start lädt das Sprachmodell einmalig. Danach läuft Snipping Assist deutlich schneller.</p>
          )}

          <p className="mt-3 text-sm text-white/55">{status}</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/35 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <DetectedField label="Markt" value={parsed?.market} />
            <DetectedField label="Richtung" value={parsed?.bias} />
            <DetectedField label="Entry" value={parsed?.entry} />
            <DetectedField label="Exit" value={parsed?.exit} />
            <DetectedField label="Stop" value={parsed?.stopLoss} />
            <DetectedField label="Take Profit" value={parsed?.takeProfit} />
            <DetectedField label="Größe" value={parsed?.positionSize} />
            <DetectedField label="Net P&L" value={parsed?.netPnL} />
          </div>

          {parsed?.hints?.length ? (
            <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">OCR Hinweise</p>
              <ul className="mt-3 space-y-1 text-sm text-white/65">
                {parsed.hints.map((hint) => (
                  <li key={hint}>• {hint}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/58">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">Wie Equora das meint</p>
            <p className="mt-2 leading-6">
              Leere Felder sind kein Fehler. Sie bedeuten nur, dass OCR dafür gerade keinen belastbaren Vorschlag hat. Der Screenshot selbst bleibt trotzdem erhalten und kann später in Ruhe nachgetragen werden.
            </p>
          </div>

          {parsed?.rawText ? (
            <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <summary className="cursor-pointer text-xs uppercase tracking-[0.22em] text-white/45">Erkannten Rohtext anzeigen</summary>
              <pre className="mt-3 whitespace-pre-wrap text-xs leading-5 text-white/55">{parsed.rawText}</pre>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function DetectedField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <p className="mt-2 text-sm text-white">{value?.trim() ? value : '—'}</p>
    </div>
  )
}

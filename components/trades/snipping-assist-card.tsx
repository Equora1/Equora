'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'
import {
  parseTradeFromSnipText,
  type SnippingCaptureResult,
  type SnippingFieldKey,
  type SnippingParseResult,
  type SnippingPlausibilityCheck,
  type SnippingSource,
} from '@/lib/utils/snipping-parser'
import { fingerprintSnippingFile, renameSnippingFile, type SnippingFileRole } from '@/lib/utils/snipping-files'
import {
  recognizeSnippingImage,
  subscribeSnippingOcrProgress,
  type SnippingOcrProgress,
} from '@/lib/utils/snipping-ocr'

export type SnippingApplyPayload = {
  market?: string
  bias?: 'Long' | 'Short'
  entry?: string
  exit?: string
  stopLoss?: string
  takeProfit?: string
  positionSize?: string
  netPnL?: string
  accountSize?: string
  riskPercent?: string
  riskAmount?: string
  leverage?: string
  riskRewardRatio?: string
  captureResult?: SnippingCaptureResult
}

const defaultOcrProgress: SnippingOcrProgress = {
  phase: 'idle',
  progress: 0,
  status: 'Deutsch/Englisch-OCR wird erst beim Analysieren geladen. Danach läuft es deutlich schneller.',
}

export type SnippingAssistCardProps = {
  marketOptions: string[]
  mode?: 'full' | 'quick'
  onApply: (payload: SnippingApplyPayload) => void
  onFilesChange?: (files: File[]) => void
}

type FileFingerprints = Partial<Record<SnippingFileRole, string>>

export function SnippingAssistCard({
  marketOptions,
  mode = 'full',
  onApply,
  onFilesChange,
}: SnippingAssistCardProps) {
  const settingsInputRef = useRef<HTMLInputElement | null>(null)
  const chartInputRef = useRef<HTMLInputElement | null>(null)
  const [settingsFile, setSettingsFile] = useState<File | null>(null)
  const [chartFile, setChartFile] = useState<File | null>(null)
  const [fingerprints, setFingerprints] = useState<FileFingerprints>({})
  const [activePasteRole, setActivePasteRole] = useState<SnippingFileRole>('settings')
  const [dragActive, setDragActive] = useState<SnippingFileRole | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [status, setStatus] = useState('1. Positions-Einstellungen einfügen. 2. Optional den Chart ergänzen. Equora hält Datenquelle und visuellen Kontext getrennt.')
  const [parsed, setParsed] = useState<SnippingParseResult | null>(null)
  const [sourcePreset, setSourcePreset] = useState<SnippingSource>('tradingview-position')
  const [ocrProgress, setOcrProgress] = useState<SnippingOcrProgress>(defaultOcrProgress)

  const settingsPreviewUrl = useMemo(() => (settingsFile ? URL.createObjectURL(settingsFile) : null), [settingsFile])
  const chartPreviewUrl = useMemo(() => (chartFile ? URL.createObjectURL(chartFile) : null), [chartFile])

  useEffect(() => {
    return () => {
      if (settingsPreviewUrl) URL.revokeObjectURL(settingsPreviewUrl)
      if (chartPreviewUrl) URL.revokeObjectURL(chartPreviewUrl)
    }
  }, [chartPreviewUrl, settingsPreviewUrl])

  useEffect(() => subscribeSnippingOcrProgress(setOcrProgress), [])

  useEffect(() => {
    onFilesChange?.([settingsFile, chartFile].filter((file): file is File => Boolean(file)))
  }, [chartFile, onFilesChange, settingsFile])

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
        if (!item.type.startsWith('image/')) continue
        const pasted = item.getAsFile()
        if (!pasted) continue
        const targetRole = activePasteRole === 'settings' && settingsFile ? 'chart' : activePasteRole
        void selectFile(targetRole, pasted)
        event.preventDefault()
        break
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [activePasteRole, settingsFile])

  async function selectFile(role: SnippingFileRole, nextFile: File | null) {
    if (!nextFile) {
      if (role === 'settings') {
        setSettingsFile(null)
        setParsed(null)
      } else {
        setChartFile(null)
      }
      setFingerprints((current) => ({ ...current, [role]: undefined }))
      setStatus(role === 'settings' ? 'Einstellungen-Screenshot entfernt. OCR-Vorschläge wurden zurückgesetzt.' : 'Chart-Screenshot entfernt.')
      return
    }

    if (!nextFile.type.startsWith('image/')) {
      setStatus('Bitte eine Bilddatei verwenden.')
      return
    }

    try {
      const fingerprint = await fingerprintSnippingFile(nextFile)
      const otherRole: SnippingFileRole = role === 'settings' ? 'chart' : 'settings'
      if (fingerprints[otherRole] && fingerprints[otherRole] === fingerprint) {
        setStatus('Doppeltes Bild erkannt. Einstellungen und Chart müssen unterschiedliche Screenshots sein.')
        return
      }

      const renamed = renameSnippingFile(nextFile, role, sourcePreset)
      if (role === 'settings') {
        setSettingsFile(renamed)
        setParsed(null)
        setActivePasteRole('chart')
        setStatus('Einstellungen-Screenshot vorgemerkt. Du kannst jetzt OCR starten oder mit Strg + V den Chart ergänzen.')
      } else {
        setChartFile(renamed)
        setStatus('Chart-Kontext vorgemerkt. OCR liest weiterhin nur den Einstellungen-Screenshot.')
      }
      setFingerprints((current) => ({ ...current, [role]: fingerprint }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bild konnte nicht vorbereitet werden.'
      setStatus(`Screenshot konnte nicht übernommen werden: ${message}`)
    }
  }

  function handleFileSelection(role: SnippingFileRole, fileList: FileList | null) {
    if (!fileList?.length) return
    void selectFile(role, fileList[0])
  }

  async function analyzeScreenshot() {
    if (!settingsFile) {
      setStatus('Bitte zuerst den Einstellungen-Screenshot einfügen. Der Chart allein enthält nicht alle strukturierten Werte.')
      return
    }

    setIsAnalyzing(true)
    setStatus(
      ocrProgress.phase === 'idle'
        ? 'OCR startet. Deutsch und Englisch werden beim ersten Mal einmalig geladen.'
        : ocrProgress.status,
    )

    try {
      const text = await recognizeSnippingImage(settingsFile)
      const nextParsed = parseTradeFromSnipText(text, marketOptions, sourcePreset)
      setParsed(nextParsed)

      const found = [nextParsed.market, nextParsed.entry, nextParsed.stopLoss, nextParsed.takeProfit, nextParsed.positionSize, nextParsed.riskPercent, nextParsed.leverage, nextParsed.netPnL].filter(Boolean).length
      const ending = nextParsed.plausibility === 'critical'
        ? ' Kritische Plausibilitätswarnung: Werte werden nicht automatisch übernommen.'
        : nextParsed.plausibility === 'review'
          ? ' Einige Werte brauchen einen zweiten Blick.'
          : ' Die Grundlogik wirkt plausibel.'
      setStatus(
        found > 0
          ? `OCR fertig. ${found} Kernfelder als Vorschlag erkannt.${ending}`
          : 'OCR fertig, aber nur schwache Vorschläge gefunden. Beide Screenshots können trotzdem am Trade gespeichert werden.',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OCR konnte nicht gestartet werden.'
      setStatus(`Snipping Assist konnte OCR nicht ausführen: ${message}. Die Screenshots können trotzdem gespeichert werden.`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  function applyDetectedValues() {
    if (!parsed || parsed.plausibility === 'critical') return
    onApply({
      market: parsed.market,
      bias: parsed.bias,
      entry: parsed.entry,
      exit: parsed.exit,
      stopLoss: parsed.stopLoss,
      takeProfit: parsed.takeProfit,
      positionSize: parsed.positionSize,
      netPnL: parsed.netPnL,
      accountSize: parsed.accountSize,
      riskPercent: parsed.riskPercent,
      riskAmount: parsed.riskAmount,
      leverage: parsed.leverage,
      riskRewardRatio: parsed.riskRewardRatio,
      captureResult: parsed.captureResult,
    })
    setStatus(mode === 'quick' ? 'Geprüfte Vorschläge in die Schnellerfassung übernommen.' : 'Geprüfte Vorschläge in den Voll-Trade übernommen. Bitte vor dem Speichern noch einmal gegenlesen.')
  }

  function resetAll() {
    setSettingsFile(null)
    setChartFile(null)
    setFingerprints({})
    setParsed(null)
    setActivePasteRole('settings')
    setStatus('Beide Screenshots entfernt.')
  }

  const fileCount = [settingsFile, chartFile].filter(Boolean).length
  const confidenceLabel = parsed
    ? `${Math.round(parsed.confidence * 100)}% Vorschlags-Fit`
    : fileCount
      ? `${fileCount}/2 Bilder vorgemerkt`
      : 'OCR Assist'
  const detectedValueCount = parsed
    ? [parsed.market, parsed.entry, parsed.exit, parsed.stopLoss, parsed.takeProfit, parsed.netPnL, parsed.positionSize, parsed.riskPercent, parsed.leverage].filter(Boolean).length
    : 0
  const applyDisabled = !parsed || detectedValueCount === 0 || parsed.plausibility === 'critical'
  const showProgress = isAnalyzing || ocrProgress.phase === 'preparing'
  const progressWidth = `${Math.max(6, ocrProgress.progress || 0)}%`

  return (
    <section className="rounded-3xl border border-emerald-400/15 bg-black/25 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <TradingViewCaptureMark />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/70">TradingView Zwei-Bild-Import</p>
              <h3 className="mt-1 text-lg font-semibold text-white">Daten aus Einstellungen, Kontext aus dem Chart</h3>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            Der Einstellungen-Screenshot liefert Entry, Stop, Ziel und Risiko. Der optionale Chart-Screenshot hält Marktstruktur und Setup visuell fest. Equora speichert beide getrennt und liest nur die strukturierte Datenquelle per OCR.
          </p>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100/85">
          {confidenceLabel}
        </div>
      </div>

      <div className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-black/25 p-2 sm:grid-cols-2">
        {([
          { value: 'tradingview-position' as const, title: 'TradingView Position', text: 'Optimiert für das Einstellungsfenster des Long-/Short-Tools.' },
          { value: 'generic' as const, title: 'Allgemeiner Screenshot', text: 'Für Order-Zeilen und andere strukturierte Captures.' },
        ]).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setSourcePreset(option.value)
              setParsed(null)
              setStatus(option.value === 'tradingview-position' ? 'TradingView-Preset aktiv. Einstellungen links, Chart rechts ergänzen.' : 'Allgemeines OCR-Preset aktiv. Das erste Bild ist die Datenquelle, das zweite bleibt Kontext.')
            }}
            className={`rounded-2xl border px-4 py-3 text-left transition ${sourcePreset === option.value ? 'border-emerald-400/35 bg-emerald-400/10' : 'border-white/8 bg-white/[0.02] hover:border-white/15'}`}
          >
            <span className="block text-sm font-medium text-white">{option.title}</span>
            <span className="mt-1 block text-xs leading-5 text-white/45">{option.text}</span>
          </button>
        ))}
      </div>

      <input ref={settingsInputRef} type="file" accept="image/*" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => handleFileSelection('settings', event.target.files)} />
      <input ref={chartInputRef} type="file" accept="image/*" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => handleFileSelection('chart', event.target.files)} />

      <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4 text-sm text-emerald-100/85">
        <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-300/80">Sicherer Ablauf</p>
        <p className="mt-2 leading-6">
          Einstellungen sichern → optional Chart ergänzen → OCR prüfen → Plausibilität lesen → Vorschläge übernehmen → Trade speichern.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ScreenshotSlot
          role="settings"
          title="1. Positions-Einstellungen"
          copy="Datenquelle für OCR. Bitte das vollständige Panel inklusive Feldnamen ausschneiden."
          badge="OCR-Daten"
          file={settingsFile}
          previewUrl={settingsPreviewUrl}
          dragActive={dragActive === 'settings'}
          onActivatePaste={() => setActivePasteRole('settings')}
          onClick={() => settingsInputRef.current?.click()}
          onDrop={(files) => handleFileSelection('settings', files)}
          onDragActive={(active) => setDragActive(active ? 'settings' : null)}
          onRemove={() => void selectFile('settings', null)}
        />
        <ScreenshotSlot
          role="chart"
          title="2. Chart-Kontext"
          copy="Optionales Review-Bild mit Marktstruktur, Indikatoren und sichtbarer Position."
          badge="Kontext"
          file={chartFile}
          previewUrl={chartPreviewUrl}
          dragActive={dragActive === 'chart'}
          onActivatePaste={() => setActivePasteRole('chart')}
          onClick={() => chartInputRef.current?.click()}
          onDrop={(files) => handleFileSelection('chart', files)}
          onDragActive={(active) => setDragActive(active ? 'chart' : null)}
          onRemove={() => void selectFile('chart', null)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={analyzeScreenshot}
          disabled={!settingsFile || isAnalyzing}
          className="rounded-2xl border border-emerald-400/25 bg-emerald-400 px-4 py-2 text-sm font-medium text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isAnalyzing ? (ocrProgress.phase === 'preparing' ? 'Modell lädt...' : 'OCR läuft...') : 'Einstellungen analysieren'}
        </button>
        <button
          type="button"
          onClick={applyDetectedValues}
          disabled={applyDisabled || isAnalyzing}
          className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100 transition hover:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {parsed?.plausibility === 'critical' ? 'Kritische Werte nicht übernehmen' : 'Vorschläge übernehmen'}
        </button>
        <button
          type="button"
          onClick={resetAll}
          disabled={!fileCount || isAnalyzing}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Alles zurücksetzen
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
        <p className="mt-3 text-xs text-white/40">Strg + V landet im zuletzt aktivierten Bildfeld. Nach dem ersten Einstellungen-Bild wechselt Equora automatisch zum Chartfeld.</p>
      )}

      <p className="mt-3 text-sm text-white/55">{status}</p>

      <div className="mt-4 rounded-3xl border border-white/10 bg-black/35 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DetectedField label="Markt" value={parsed?.market} confidence={getFieldConfidence(parsed, 'market')} />
          <DetectedField label="Richtung" value={parsed?.bias} confidence={getFieldConfidence(parsed, 'bias')} />
          <DetectedField label="Entry" value={parsed?.entry} confidence={getFieldConfidence(parsed, 'entry')} />
          <DetectedField label="Exit" value={parsed?.exit} confidence={getFieldConfidence(parsed, 'exit')} />
          <DetectedField label="Stop" value={parsed?.stopLoss} confidence={getFieldConfidence(parsed, 'stopLoss')} />
          <DetectedField label="Take Profit" value={parsed?.takeProfit} confidence={getFieldConfidence(parsed, 'takeProfit')} />
          <DetectedField label="Positionsgröße" value={parsed?.positionSize} confidence={getFieldConfidence(parsed, 'positionSize')} />
          <DetectedField label="Kontogröße" value={parsed?.accountSize} confidence={getFieldConfidence(parsed, 'accountSize')} />
          <DetectedField label="Risiko %" value={parsed?.riskPercent ? `${parsed.riskPercent}%` : undefined} confidence={getFieldConfidence(parsed, 'riskPercent')} />
          <DetectedField label="Risikobetrag" value={parsed?.riskAmount} confidence={getFieldConfidence(parsed, 'riskAmount')} />
          <DetectedField label="Hebel" value={parsed?.leverage ? `${parsed.leverage}x` : undefined} confidence={getFieldConfidence(parsed, 'leverage')} />
          <DetectedField label="CRV" value={parsed?.riskRewardRatio ? `${parsed.riskRewardRatio} : 1` : undefined} confidence={getFieldConfidence(parsed, 'riskRewardRatio')} />
          <DetectedField label="P&L" value={parsed?.netPnL} confidence={getFieldConfidence(parsed, 'netPnL')} />
        </div>

        {parsed ? <PlausibilityPanel plausibility={parsed.plausibility} checks={parsed.checks} /> : null}

        {parsed?.hints?.length ? (
          <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">OCR Hinweise</p>
            <ul className="mt-3 space-y-1 text-sm text-white/65">
              {parsed.hints.map((hint) => <li key={hint}>• {hint}</li>)}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/58">
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">Wie Equora das meint</p>
          <p className="mt-2 leading-6">
            Leere Felder sind kein Fehler. Kritische Widersprüche blockieren nur die automatische Übernahme, nicht das Speichern der Bilder. So bleibt ein OCR-Ausrutscher ein Hinweis statt ein falscher Trade.
          </p>
        </div>

        {parsed?.rawText ? (
          <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.22em] text-white/45">Erkannten Rohtext anzeigen</summary>
            <pre className="mt-3 whitespace-pre-wrap text-xs leading-5 text-white/55">{parsed.rawText}</pre>
          </details>
        ) : null}
      </div>
    </section>
  )
}

function ScreenshotSlot({
  role,
  title,
  copy,
  badge,
  file,
  previewUrl,
  dragActive,
  onActivatePaste,
  onClick,
  onDrop,
  onDragActive,
  onRemove,
}: {
  role: SnippingFileRole
  title: string
  copy: string
  badge: string
  file: File | null
  previewUrl: string | null
  dragActive: boolean
  onActivatePaste: () => void
  onClick: () => void
  onDrop: (files: FileList | null) => void
  onDragActive: (active: boolean) => void
  onRemove: () => void
}) {
  return (
    <div
      className={`rounded-3xl border p-3 transition ${role === 'settings' ? 'border-emerald-400/20 bg-emerald-400/[0.045]' : 'border-sky-400/[0.15] bg-sky-400/[0.035]'}`}
      onMouseEnter={onActivatePaste}
      onFocus={onActivatePaste}
    >
      <div className="flex items-start justify-between gap-3 px-1 pb-3">
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="mt-1 text-xs leading-5 text-white/45">{copy}</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/50">{badge}</span>
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onClick()
        }}
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault()
          onDragActive(true)
        }}
        onDragLeave={() => onDragActive(false)}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault()
          onDragActive(false)
          onDrop(event.dataTransfer.files)
        }}
        className={`flex min-h-48 cursor-pointer items-center justify-center rounded-2xl border border-dashed px-4 py-5 text-center text-sm transition ${dragActive ? 'border-emerald-300/[0.45] bg-emerald-400/10' : 'border-white/[0.12] bg-black/25 hover:border-white/25'}`}
      >
        {previewUrl ? (
          <div className="w-full space-y-3" onClick={(event) => event.stopPropagation()}>
            <SetupImageLightbox
              src={previewUrl}
              alt={file?.name ?? title}
              badge={badge}
              hint="Klick für Großansicht"
              stopPropagation
              className="rounded-2xl"
              imageClassName="max-h-56 w-full rounded-2xl bg-black/35 object-contain"
            />
            <div className="flex items-center justify-between gap-2 text-left">
              <p className="min-w-0 truncate text-xs text-white/45">{file?.name}</p>
              <button type="button" onClick={onRemove} className="shrink-0 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-white/60 hover:text-white">Entfernen</button>
            </div>
          </div>
        ) : (
          <div>
            <p>Bild ziehen, klicken oder Feld aktivieren und Strg + V</p>
            <p className="mt-2 text-xs text-white/35">PNG, JPG oder WebP</p>
          </div>
        )}
      </div>
    </div>
  )
}

function PlausibilityPanel({ plausibility, checks }: { plausibility: SnippingParseResult['plausibility']; checks: SnippingPlausibilityCheck[] }) {
  const config = plausibility === 'critical'
    ? { title: 'Kritischer Widerspruch', copy: 'Automatische Übernahme ist blockiert. Werte oder Dezimalstellen manuell prüfen.', className: 'border-rose-400/25 bg-rose-400/[0.08] text-rose-100' }
    : plausibility === 'review'
      ? { title: 'Prüfung nötig', copy: 'Die Daten sind nutzbar, einzelne Werte verdienen einen zweiten Blick.', className: 'border-amber-400/25 bg-amber-400/[0.08] text-amber-100' }
      : { title: 'Grundlogik plausibel', copy: 'Keine harten Widersprüche erkannt. Trotzdem bleiben alle Werte Vorschläge.', className: 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-100' }

  return (
    <div className={`mt-4 rounded-2xl border p-4 ${config.className}`}>
      <p className="text-xs uppercase tracking-[0.22em] opacity-75">Plausibilitätsprüfung</p>
      <p className="mt-2 text-sm font-medium">{config.title}</p>
      <p className="mt-1 text-sm opacity-70">{config.copy}</p>
      {checks.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {checks.map((check) => (
            <div key={check.key} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-white/85">{check.label}</p>
                <span className={`text-[10px] uppercase tracking-[0.14em] ${check.level === 'critical' ? 'text-rose-200' : check.level === 'review' ? 'text-amber-200' : 'text-emerald-200'}`}>
                  {check.level === 'critical' ? 'Kritisch' : check.level === 'review' ? 'Prüfen' : 'Okay'}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-white/55">{check.message}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function getFieldConfidence(parsed: SnippingParseResult | null, key: SnippingFieldKey) {
  return parsed?.fieldConfidence?.[key]
}

function TradingViewCaptureMark() {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10" aria-label="TradingView Import">
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-200" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M4 17V8m5 9V5m5 12v-7m5 7V3" strokeLinecap="round" />
        <path d="M3 20h18" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function DetectedField({ label, value, confidence }: { label: string; value?: string; confidence?: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-sm text-white">{value?.trim() ? value : '—'}</p>
        {value?.trim() && typeof confidence === 'number' ? <span className="text-[10px] text-emerald-200/55">{Math.round(confidence * 100)}%</span> : null}
      </div>
    </div>
  )
}

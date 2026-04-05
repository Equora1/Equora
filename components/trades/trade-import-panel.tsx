'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importTradeCsvEntries } from '@/app/actions/trade-import'
import {
  buildCsvImportDrafts,
  buildCsvImportPreview,
  csvImportFieldDefinitions,
  inferCsvImportMapping,
  parseCsvText,
  type CsvImportFieldKey,
  type CsvImportMapping,
} from '@/lib/utils/trade-import'

const requiredFieldKeys: CsvImportFieldKey[] = ['date', 'market']
const visibleOptionalFieldKeys: CsvImportFieldKey[] = ['netPnL', 'entry', 'exit', 'stopLoss', 'takeProfit', 'direction', 'setup', 'session', 'tags', 'notes', 'fees', 'positionSize', 'instrumentType']

export function TradeImportPanel() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Array<Record<string, string>>>([])
  const [mapping, setMapping] = useState<CsvImportMapping>({})
  const [statusMessage, setStatusMessage] = useState('')
  const [includeCheckRows, setIncludeCheckRows] = useState(true)
  const [isImporting, startImporting] = useTransition()

  const previewRows = useMemo(() => buildCsvImportPreview(rawRows, mapping), [mapping, rawRows])
  const counts = useMemo(() => {
    return previewRows.reduce(
      (acc, row) => {
        acc.total += 1
        if (row.status === 'importable') acc.importable += 1
        if (row.status === 'check') acc.check += 1
        if (row.status === 'skip') acc.skip += 1
        return acc
      },
      { total: 0, importable: 0, check: 0, skip: 0 },
    )
  }, [previewRows])

  const drafts = useMemo(() => buildCsvImportDrafts(previewRows, { includeCheckRows }), [includeCheckRows, previewRows])
  const previewSlice = previewRows.slice(0, 8)

  async function handleFileChange(file: File | null) {
    setStatusMessage('')
    if (!file) {
      setFileName('')
      setHeaders([])
      setRawRows([])
      setMapping({})
      return
    }

    const text = await file.text()
    const parsed = parseCsvText(text)
    setFileName(file.name)
    setHeaders(parsed.headers)
    setRawRows(parsed.rows)
    setMapping(inferCsvImportMapping(parsed.headers))

    if (!parsed.headers.length || !parsed.rows.length) {
      setStatusMessage('Datei gelesen, aber ohne brauchbare Kopfzeile oder Datenzeilen.')
    }
  }

  function handleMappingChange(field: CsvImportFieldKey, header: string) {
    setMapping((current) => ({
      ...current,
      [field]: header || undefined,
    }))
  }

  function handleImport() {
    if (!drafts.length) {
      setStatusMessage('Noch keine importierbaren Zeilen ausgewählt.')
      return
    }

    startImporting(async () => {
      const result = await importTradeCsvEntries({ rows: drafts })
      setStatusMessage(result.message)
      if (!result.success) return

      const params = new URLSearchParams()
      if (result.importedIds?.length) {
        params.set('reviewTradeIds', result.importedIds.join('|'))
        params.set('tradeId', result.importedIds[0])
      }
      params.set('reviewTitle', 'CSV Import')
      params.set('reviewDescription', result.message)
      const chips = [`Neu: ${result.importedCount ?? drafts.length}`]
      if (result.duplicateCount) chips.push(`Dubletten: ${result.duplicateCount}`)
      if (result.skippedCount) chips.push(`Ausgelassen: ${result.skippedCount}`)
      params.set('reviewChips', chips.join('|'))
      router.push(`/trades?${params.toString()}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <label className="flex min-h-[190px] cursor-pointer flex-col justify-between rounded-[28px] border border-dashed border-orange-300/25 bg-black/25 p-5 transition hover:border-orange-300/45 hover:bg-orange-400/[0.05]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Datei wählen</p>
            <h3 className="mt-3 text-2xl font-semibold text-white">CSV direkt ins Workspace holen</h3>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/60">Zieh eine CSV hier hinein oder wähle sie manuell. Equora liest die Datei, schlägt Spalten vor und zeigt vor dem Import eine Vorschau.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-6 text-sm text-white/70">
            <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-4 py-2 text-orange-100">CSV wählen</span>
            <span className="text-white/45">Nur .csv aktuell</span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
          <MetricTile label="Datei" value={fileName || 'Noch keine CSV'} tone={fileName ? 'text-white' : 'text-white/45'} />
          <MetricTile label="Erkannte Spalten" value={headers.length ? String(headers.length) : '0'} tone="text-white" />
          <MetricTile label="Importierbar" value={String(counts.importable)} tone="text-emerald-200" />
          <MetricTile label="Prüfen / Skip" value={`${counts.check} / ${counts.skip}`} tone="text-orange-100" />
        </div>
      </div>

      {statusMessage ? <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/75">{statusMessage}</div> : null}

      {headers.length ? (
        <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Mapping</p>
              <h3 className="mt-2 text-xl font-semibold text-white">So wenig Zuordnung wie möglich</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">Pflichtfelder zuerst. Alles andere bleibt optional und wird nur zugeordnet, wenn es wirklich hilft.</p>
            </div>
            <label className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/75">
              <input type="checkbox" checked={includeCheckRows} onChange={(event) => setIncludeCheckRows(event.target.checked)} className="h-4 w-4 accent-orange-300" />
              Zeilen mit Hinweis trotzdem importieren
            </label>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {csvImportFieldDefinitions
              .filter((field) => requiredFieldKeys.includes(field.key) || visibleOptionalFieldKeys.includes(field.key))
              .map((field) => (
                <label key={field.key} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-white">{field.label}</span>
                    {field.required ? <span className="rounded-full border border-orange-300/20 bg-orange-400/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-orange-100">Pflicht</span> : null}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-white/45">{field.helper}</p>
                  <select
                    value={mapping[field.key] ?? ''}
                    onChange={(event) => handleMappingChange(field.key, event.target.value)}
                    className="mt-3 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none"
                  >
                    <option value="" className="bg-black text-white">Nicht zuordnen</option>
                    {headers.map((header) => (
                      <option key={`${field.key}-${header}`} value={header} className="bg-black text-white">
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
          </div>
        </div>
      ) : null}

      {previewRows.length ? (
        <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Vorschau</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Vor dem Import einmal kurz auf den Chart schauen</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">Die ersten Zeilen zeigen, ob Datum, Markt und Ergebnis sinnvoll gelesen wurden.</p>
            </div>
            <button
              type="button"
              onClick={handleImport}
              disabled={isImporting || !drafts.length}
              className={`rounded-full px-5 py-3 text-sm font-medium transition ${isImporting || !drafts.length ? 'cursor-not-allowed border border-white/10 bg-black/20 text-white/35' : 'border border-orange-300/35 bg-orange-400/15 text-white hover:border-orange-300/55 hover:bg-orange-400/20'}`}
            >
              {isImporting ? 'Import läuft …' : `${drafts.length} Trades importieren`}
            </button>
          </div>

          <div className="mt-5 overflow-x-auto rounded-3xl border border-white/10 bg-black/30">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm text-white/75">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.2em] text-white/35">
                <tr>
                  <th className="px-4 py-3">Zeile</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Datum</th>
                  <th className="px-4 py-3">Markt</th>
                  <th className="px-4 py-3">Kontext</th>
                  <th className="px-4 py-3">Hinweis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {previewSlice.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="px-4 py-3 text-white/45">{row.rowNumber}</td>
                    <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                    <td className="px-4 py-3">{row.normalized.date ? new Date(row.normalized.date).toLocaleDateString('de-DE') : '—'}</td>
                    <td className="px-4 py-3 text-white">{row.normalized.market ?? '—'}</td>
                    <td className="px-4 py-3 text-white/65">
                      {row.normalized.netPnL ? `P&L ${row.normalized.netPnL}` : row.normalized.entry && row.normalized.exit ? `Entry ${row.normalized.entry} → Exit ${row.normalized.exit}` : row.normalized.entry ? `Entry ${row.normalized.entry}` : 'Basisdaten'}
                    </td>
                    <td className="px-4 py-3 text-white/55">{row.issues[0] ?? 'Sieht gut aus.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{label}</p>
      <p className={`mt-2 text-sm font-medium ${tone}`}>{value}</p>
    </div>
  )
}

function StatusPill({ status }: { status: 'importable' | 'check' | 'skip' }) {
  const copy = status === 'importable' ? 'Importierbar' : status === 'check' ? 'Prüfen' : 'Skip'
  const tone = status === 'importable'
    ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
    : status === 'check'
      ? 'border-orange-300/25 bg-orange-400/10 text-orange-100'
      : 'border-white/10 bg-black/20 text-white/45'

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${tone}`}>{copy}</span>
}

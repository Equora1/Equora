export type TradeImportFieldKey =
  | 'date'
  | 'market'
  | 'netPnL'
  | 'entry'
  | 'exit'
  | 'stopLoss'
  | 'takeProfit'
  | 'direction'
  | 'setup'
  | 'session'
  | 'tags'
  | 'notes'
  | 'fees'
  | 'positionSize'
  | 'instrumentType'
  | 'leverage'

export type TradeImportValueSource = 'csv' | 'preset' | 'manual' | 'empty'

export type TradeImportMeta = {
  presetKey?: string | null
  presetLabel?: string | null
  importedAt?: string | null
  fieldSources?: Partial<Record<TradeImportFieldKey, TradeImportValueSource>> | null
  fieldHeaders?: Partial<Record<TradeImportFieldKey, string>> | null
  trustScore?: number | null
  trustLabel?: string | null
  warnings?: string[] | null
}

const IMPORT_META_MARKER = '[EQUORA_IMPORT_META]'

export function extractTradeImportMeta(note: string | null | undefined): { cleanNotes: string; meta: TradeImportMeta | null } {
  const raw = note?.trim() ?? ''
  if (!raw) return { cleanNotes: '', meta: null }

  const markerIndex = raw.lastIndexOf(IMPORT_META_MARKER)
  if (markerIndex === -1) return { cleanNotes: raw, meta: null }

  const metaPayload = raw.slice(markerIndex + IMPORT_META_MARKER.length).trim()
  const cleanNotes = raw.slice(0, markerIndex).trim()

  try {
    const parsed = JSON.parse(metaPayload) as TradeImportMeta
    return { cleanNotes, meta: parsed }
  } catch {
    return { cleanNotes: raw, meta: null }
  }
}

export function appendTradeImportMeta(note: string | null | undefined, meta: TradeImportMeta | null | undefined) {
  const cleanNotes = extractTradeImportMeta(note).cleanNotes.trim()
  if (!meta) return cleanNotes || null

  const hasSources = meta.fieldSources && Object.values(meta.fieldSources).some((value) => value && value !== 'empty')
  if (!hasSources && !meta.presetLabel && !meta.presetKey) {
    return cleanNotes || null
  }

  const compactMeta: TradeImportMeta = {
    presetKey: meta.presetKey ?? null,
    presetLabel: meta.presetLabel ?? null,
    importedAt: meta.importedAt ?? null,
    fieldSources: meta.fieldSources ?? null,
    fieldHeaders: meta.fieldHeaders ?? null,
    trustScore: typeof meta.trustScore === 'number' ? meta.trustScore : null,
    trustLabel: meta.trustLabel ?? null,
    warnings: meta.warnings?.filter(Boolean).slice(0, 8) ?? null,
  }

  return [cleanNotes, `${IMPORT_META_MARKER}${JSON.stringify(compactMeta)}`].filter(Boolean).join('\n\n')
}

const fieldLabels: Array<{ key: TradeImportFieldKey; label: string }> = [
  { key: 'date', label: 'Zeit' },
  { key: 'market', label: 'Markt' },
  { key: 'netPnL', label: 'P&L' },
  { key: 'entry', label: 'Entry' },
  { key: 'exit', label: 'Exit' },
  { key: 'stopLoss', label: 'Stop' },
  { key: 'takeProfit', label: 'TP' },
  { key: 'direction', label: 'Richtung' },
  { key: 'setup', label: 'Setup' },
  { key: 'session', label: 'Session' },
  { key: 'fees', label: 'Gebühren' },
  { key: 'positionSize', label: 'Size' },
  { key: 'instrumentType', label: 'Typ' },
  { key: 'leverage', label: 'Hebel' },
]

export function getTradeImportSourceLabel(source: TradeImportValueSource | null | undefined) {
  if (source === 'csv') return 'Aus Datei übernommen'
  if (source === 'preset') return 'Vom Preset ergänzt'
  if (source === 'manual') return 'Manuell korrigiert'
  return 'Nicht befüllt'
}

export function buildTradeImportSourceFacts(meta: TradeImportMeta | null | undefined) {
  const facts: Array<{ label: string; value: string }> = []

  if (meta?.trustLabel || typeof meta?.trustScore === 'number') {
    facts.push({
      label: 'Import-Vertrauen',
      value: [meta.trustLabel, typeof meta.trustScore === 'number' ? `${meta.trustScore}%` : null]
        .filter(Boolean)
        .join(' · '),
    })
  }

  if (meta?.fieldSources) {
    facts.push(
      ...fieldLabels
        .filter((field) => meta.fieldSources?.[field.key] && meta.fieldSources?.[field.key] !== 'empty')
        .map((field) => {
          const header = meta.fieldHeaders?.[field.key]
          const sourceLabel = getTradeImportSourceLabel(meta.fieldSources?.[field.key])
          return {
            label: field.label,
            value: header ? `${sourceLabel}: ${header}` : sourceLabel,
          }
        }),
    )
  }

  if (meta?.warnings?.length) {
    facts.push(
      ...meta.warnings.slice(0, 6).map((warning, index) => ({
        label: index === 0 ? 'Warnung' : `Warnung ${index + 1}`,
        value: warning,
      })),
    )
  }

  return facts
}

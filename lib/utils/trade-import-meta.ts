import {
  normalizeCsvImportSourceIdentity,
  type CsvImportSourceIdentity,
} from './trade-import'

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

export type TradeImportSourceContext = Readonly<{
  brokerProfile?: string | null
  accountTemplate?: string | null
  accountLabel?: string | null
}>

export type TradeImportMeta = {
  presetKey?: string | null
  presetLabel?: string | null
  importedAt?: string | null
  fieldSources?: Partial<Record<TradeImportFieldKey, TradeImportValueSource>> | null
  fieldHeaders?: Partial<Record<TradeImportFieldKey, string>> | null
  trustScore?: number | null
  trustLabel?: string | null
  warnings?: string[] | null
  sourceIdentity?: CsvImportSourceIdentity | null
  sourceContext?: TradeImportSourceContext | null
  provenance?: 'server_reconstructed' | 'legacy_unverified' | null
}

const IMPORT_META_MARKER = '[EQUORA_IMPORT_META]'
const MAX_META_TEXT_LENGTH = 160
const MAX_WARNING_LENGTH = 240
const VALID_VALUE_SOURCES = new Set<TradeImportValueSource>([
  'csv',
  'preset',
  'manual',
  'empty',
])
const VALID_PROVENANCE = new Set<NonNullable<TradeImportMeta['provenance']>>([
  'server_reconstructed',
  'legacy_unverified',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedText(value: unknown, maxLength = MAX_META_TEXT_LENGTH) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized && normalized.length <= maxLength ? normalized : null
}

function sanitizeFieldSources(value: unknown) {
  if (!isRecord(value)) return null
  const result: Partial<Record<TradeImportFieldKey, TradeImportValueSource>> = {}
  for (const field of fieldLabels) {
    const source = value[field.key]
    if (
      typeof source === 'string' &&
      VALID_VALUE_SOURCES.has(source as TradeImportValueSource)
    ) {
      result[field.key] = source as TradeImportValueSource
    }
  }
  return Object.keys(result).length ? result : null
}

function sanitizeFieldHeaders(value: unknown) {
  if (!isRecord(value)) return null
  const result: Partial<Record<TradeImportFieldKey, string>> = {}
  for (const field of fieldLabels) {
    const header = boundedText(value[field.key], 80)
    if (header) result[field.key] = header
  }
  return Object.keys(result).length ? result : null
}

function sanitizeSourceContext(value: unknown): TradeImportSourceContext | null {
  if (!isRecord(value)) return null
  const context = {
    brokerProfile: boundedText(value.brokerProfile, 80),
    accountTemplate: boundedText(value.accountTemplate, 80),
    accountLabel: boundedText(value.accountLabel, 60),
  }
  return Object.values(context).some(Boolean) ? context : null
}

export function sanitizeTradeImportMeta(value: unknown): TradeImportMeta | null {
  if (!isRecord(value)) return null

  const sourceIdentity = normalizeCsvImportSourceIdentity(
    isRecord(value.sourceIdentity) ? value.sourceIdentity : null,
  )
  const trustScore =
    typeof value.trustScore === 'number' && Number.isFinite(value.trustScore)
      ? Math.max(0, Math.min(100, Math.round(value.trustScore)))
      : null
  const importedAtRaw = boundedText(value.importedAt, 40)
  const importedAt =
    importedAtRaw && !Number.isNaN(Date.parse(importedAtRaw))
      ? new Date(importedAtRaw).toISOString()
      : null
  const warnings = Array.isArray(value.warnings)
    ? value.warnings
        .map((warning) => boundedText(warning, MAX_WARNING_LENGTH))
        .filter((warning): warning is string => Boolean(warning))
        .slice(0, 8)
    : []
  const provenance =
    typeof value.provenance === 'string' &&
    VALID_PROVENANCE.has(
      value.provenance as NonNullable<TradeImportMeta['provenance']>,
    )
      ? (value.provenance as NonNullable<TradeImportMeta['provenance']>)
      : 'legacy_unverified'

  const sanitized: TradeImportMeta = {
    presetKey: boundedText(value.presetKey, 64),
    presetLabel: boundedText(value.presetLabel, 80),
    importedAt,
    fieldSources: sanitizeFieldSources(value.fieldSources),
    fieldHeaders: sanitizeFieldHeaders(value.fieldHeaders),
    trustScore,
    trustLabel: boundedText(value.trustLabel, 80),
    warnings: warnings.length ? warnings : null,
    sourceIdentity,
    sourceContext: sanitizeSourceContext(value.sourceContext),
    provenance,
  }

  return Object.values(sanitized).some(
    (entry) => entry !== null && entry !== undefined,
  )
    ? sanitized
    : null
}

export function extractTradeImportMeta(note: string | null | undefined): { cleanNotes: string; meta: TradeImportMeta | null } {
  const raw = note?.trim() ?? ''
  if (!raw) return { cleanNotes: '', meta: null }

  const markerIndex = raw.lastIndexOf(IMPORT_META_MARKER)
  if (markerIndex === -1) return { cleanNotes: raw, meta: null }

  const metaPayload = raw.slice(markerIndex + IMPORT_META_MARKER.length).trim()
  const cleanNotes = raw.slice(0, markerIndex).trim()

  try {
    return { cleanNotes, meta: sanitizeTradeImportMeta(JSON.parse(metaPayload)) }
  } catch {
    return { cleanNotes, meta: null }
  }
}

export function appendTradeImportMeta(note: string | null | undefined, meta: TradeImportMeta | null | undefined) {
  const cleanNotes = extractTradeImportMeta(note).cleanNotes.trim()
  if (!meta) return cleanNotes || null

  const hasSources = meta.fieldSources && Object.values(meta.fieldSources).some((value) => value && value !== 'empty')
  if (!hasSources && !meta.presetLabel && !meta.presetKey && !meta.sourceIdentity && !meta.sourceContext) {
    return cleanNotes || null
  }

  const compactMeta = sanitizeTradeImportMeta({
    presetKey: meta.presetKey ?? null,
    presetLabel: meta.presetLabel ?? null,
    importedAt: meta.importedAt ?? null,
    fieldSources: meta.fieldSources ?? null,
    fieldHeaders: meta.fieldHeaders ?? null,
    trustScore: typeof meta.trustScore === 'number' ? meta.trustScore : null,
    trustLabel: meta.trustLabel ?? null,
    warnings: meta.warnings?.filter(Boolean).slice(0, 8) ?? null,
    sourceIdentity: meta.sourceIdentity ?? null,
    sourceContext: meta.sourceContext ?? null,
    provenance: meta.provenance ?? 'server_reconstructed',
  })
  if (!compactMeta) return cleanNotes || null

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
      label: 'Import-Plausibilität',
      value: [meta.trustLabel, typeof meta.trustScore === 'number' ? `${meta.trustScore}%` : null]
        .filter(Boolean)
        .join(' · '),
    })
  }

  if (meta?.provenance) {
    facts.push({
      label: 'Provenienzgrenze',
      value:
        meta.provenance === 'server_reconstructed'
          ? 'Serverseitig aus den übermittelten Importwerten rekonstruiert; Originaldatei nicht kryptografisch verifiziert.'
          : 'Ältere Importmetadaten; Originaldatei und Clientvorschau nicht serverseitig verifiziert.',
    })
  }

  if (meta?.sourceIdentity) {
    facts.push({
      label: 'Quellidentität',
      value: `${meta.sourceIdentity.header}: ${meta.sourceIdentity.value}`,
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

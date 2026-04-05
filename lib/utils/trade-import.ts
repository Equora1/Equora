import { normalizeTradeDate } from '@/lib/utils/calendar'
import { normalizeInstrumentType } from '@/lib/utils/calculations'

export type CsvImportFieldKey =
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

export type CsvImportMapping = Partial<Record<CsvImportFieldKey, string>>

export type CsvImportFieldDefinition = {
  key: CsvImportFieldKey
  label: string
  required?: boolean
  helper: string
}

export type ParsedCsvData = {
  delimiter: string
  headers: string[]
  rows: Array<Record<string, string>>
}

export type CsvImportPreviewStatus = 'importable' | 'check' | 'skip'

export type CsvImportPreviewRow = {
  rowNumber: number
  raw: Record<string, string>
  normalized: {
    date: string | null
    market: string | null
    netPnL: string | null
    entry: string | null
    exit: string | null
    stopLoss: string | null
    takeProfit: string | null
    direction: string | null
    setup: string | null
    session: string | null
    tags: string[]
    notes: string | null
    fees: string | null
    positionSize: string | null
    instrumentType: string | null
  }
  issues: string[]
  status: CsvImportPreviewStatus
}

export type CsvImportDraft = {
  rowNumber: number
  date: string
  market: string
  netPnL?: string | null
  entry?: string | null
  exit?: string | null
  stopLoss?: string | null
  takeProfit?: string | null
  direction?: string | null
  setup?: string | null
  session?: string | null
  tags?: string[]
  notes?: string | null
  fees?: string | null
  positionSize?: string | null
  instrumentType?: string | null
}

export const csvImportFieldDefinitions: CsvImportFieldDefinition[] = [
  { key: 'date', label: 'Datum', required: true, helper: 'Pflichtfeld für den Trade-Zeitpunkt.' },
  { key: 'market', label: 'Markt / Symbol', required: true, helper: 'Pflichtfeld für Asset oder Symbol.' },
  { key: 'netPnL', label: 'Netto P&L', helper: 'Hilft beim schnellen Ergebnisbild.' },
  { key: 'entry', label: 'Entry', helper: 'Optionaler Einstiegskurs.' },
  { key: 'exit', label: 'Exit', helper: 'Optionaler Ausstiegskurs.' },
  { key: 'stopLoss', label: 'Stop Loss', helper: 'Optionaler Stop.' },
  { key: 'takeProfit', label: 'Take Profit', helper: 'Optionales Ziel.' },
  { key: 'direction', label: 'Richtung', helper: 'Long, Short oder ähnlich.' },
  { key: 'setup', label: 'Setup', helper: 'Wird sonst auf CSV Import gesetzt.' },
  { key: 'session', label: 'Session', helper: 'Optional für London, New York usw.' },
  { key: 'tags', label: 'Tags', helper: 'Mit Komma, Semikolon oder Pipe getrennt.' },
  { key: 'notes', label: 'Notizen', helper: 'Optionaler Freitext.' },
  { key: 'fees', label: 'Gebühren', helper: 'Optionaler Zahlenwert.' },
  { key: 'positionSize', label: 'Positionsgröße', helper: 'Optionaler Zahlenwert.' },
  { key: 'instrumentType', label: 'Instrument-Typ', helper: 'z. B. Futures, Forex, Crypto.' },
]

const fieldAliases: Record<CsvImportFieldKey, string[]> = {
  date: ['date', 'datum', 'trade date', 'timestamp', 'time', 'open time', 'entry time', 'opened', 'created at'],
  market: ['market', 'markt', 'symbol', 'asset', 'ticker', 'instrument', 'pair', 'produkt'],
  netPnL: ['net pnl', 'netpnl', 'pnl', 'profit', 'realized pnl', 'realised pnl', 'gewinn', 'verlust', 'ergebnis'],
  entry: ['entry', 'entry price', 'buy price', 'open price', 'einstieg'],
  exit: ['exit', 'exit price', 'close price', 'sell price', 'ausstieg'],
  stopLoss: ['stop', 'stop loss', 'sl', 'stoploss'],
  takeProfit: ['tp', 'take profit', 'target', 'ziel'],
  direction: ['direction', 'side', 'richtung', 'long short', 'buy sell', 'trade type'],
  setup: ['setup', 'strategy', 'strategie', 'playbook'],
  session: ['session', 'sesssion', 'trading session'],
  tags: ['tags', 'tag', 'labels', 'label'],
  notes: ['notes', 'note', 'notizen', 'comment', 'kommentar', 'memo'],
  fees: ['fees', 'fee', 'commission', 'gebühren', 'kosten'],
  positionSize: ['size', 'position size', 'qty', 'quantity', 'lots', 'contracts', 'positionsgröße'],
  instrumentType: ['instrument type', 'instrument', 'asset class', 'markt typ', 'typ'],
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[._\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function parseCsvLine(line: string, delimiter: string) {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === delimiter && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  cells.push(current.trim())
  return cells.map((cell) => cell.replace(/^"|"$/g, '').trim())
}

function detectDelimiter(text: string) {
  const probeLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? ''

  const delimiters = [',', ';', '\t', '|']
  const scores = delimiters.map((delimiter) => ({ delimiter, count: probeLine.split(delimiter).length }))
  scores.sort((left, right) => right.count - left.count)
  return scores[0]?.count && scores[0].count > 1 ? scores[0].delimiter : ','
}

export function parseCsvText(text: string): ParsedCsvData {
  const sanitized = text.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(sanitized)
  const lines = sanitized.split(/\r?\n/).filter((line) => line.trim().length > 0)

  if (!lines.length) {
    return { delimiter, headers: [], rows: [] }
  }

  const headers = parseCsvLine(lines[0], delimiter)
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line, delimiter)
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = cells[index] ?? ''
      return acc
    }, {})
  })

  return { delimiter, headers, rows }
}

export function inferCsvImportMapping(headers: string[]): CsvImportMapping {
  const mapping: CsvImportMapping = {}

  for (const definition of csvImportFieldDefinitions) {
    const match = headers.find((header) => {
      const normalized = normalizeHeader(header)
      return fieldAliases[definition.key].some((alias) => normalized === normalizeHeader(alias) || normalized.includes(normalizeHeader(alias)))
    })

    if (match) mapping[definition.key] = match
  }

  return mapping
}

function getMappedValue(row: Record<string, string>, mapping: CsvImportMapping, key: CsvImportFieldKey) {
  const header = mapping[key]
  if (!header) return ''
  return row[header] ?? ''
}

function normalizeDateValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const direct = new Date(trimmed)
  if (!Number.isNaN(direct.getTime())) return direct.toISOString()

  const normalized = normalizeTradeDate(trimmed)
  if (Number.isNaN(normalized.getTime())) return null
  return normalized.toISOString()
}

export function normalizeDirectionValue(value: string) {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  if (['long', 'buy', 'kauf'].includes(trimmed)) return 'Long'
  if (['short', 'sell', 'verkauf'].includes(trimmed)) return 'Short'
  if (trimmed === 'neutral') return 'Neutral'
  return value.trim()
}

export function normalizeInstrumentTypeValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = normalizeInstrumentType(trimmed)
  return normalized === 'unknown' ? trimmed : normalized
}

export function splitTagValue(value: string) {
  return value
    .split(/[|,;]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function hasEnoughContext(normalized: CsvImportPreviewRow['normalized']) {
  return Boolean(
    normalized.netPnL
      || (normalized.entry && normalized.exit)
      || (normalized.entry && normalized.stopLoss && normalized.takeProfit),
  )
}

export function buildCsvImportPreview(rows: Array<Record<string, string>>, mapping: CsvImportMapping): CsvImportPreviewRow[] {
  return rows.map((row, index) => {
    const normalized = {
      date: normalizeDateValue(getMappedValue(row, mapping, 'date')),
      market: getMappedValue(row, mapping, 'market').trim() || null,
      netPnL: getMappedValue(row, mapping, 'netPnL').trim() || null,
      entry: getMappedValue(row, mapping, 'entry').trim() || null,
      exit: getMappedValue(row, mapping, 'exit').trim() || null,
      stopLoss: getMappedValue(row, mapping, 'stopLoss').trim() || null,
      takeProfit: getMappedValue(row, mapping, 'takeProfit').trim() || null,
      direction: normalizeDirectionValue(getMappedValue(row, mapping, 'direction')),
      setup: getMappedValue(row, mapping, 'setup').trim() || null,
      session: getMappedValue(row, mapping, 'session').trim() || null,
      tags: splitTagValue(getMappedValue(row, mapping, 'tags')),
      notes: getMappedValue(row, mapping, 'notes').trim() || null,
      fees: getMappedValue(row, mapping, 'fees').trim() || null,
      positionSize: getMappedValue(row, mapping, 'positionSize').trim() || null,
      instrumentType: normalizeInstrumentTypeValue(getMappedValue(row, mapping, 'instrumentType')),
    }

    const issues: string[] = []
    if (!normalized.date) issues.push('Datum fehlt oder ist nicht lesbar.')
    if (!normalized.market) issues.push('Markt / Symbol fehlt.')
    if (normalized.date && normalized.market && !hasEnoughContext(normalized)) {
      issues.push('Basisdaten vorhanden, aber ohne P&L oder Preiskontext.')
    }

    let status: CsvImportPreviewStatus = 'importable'
    if (!normalized.date || !normalized.market) status = 'skip'
    else if (!hasEnoughContext(normalized)) status = 'check'

    return {
      rowNumber: index + 2,
      raw: row,
      normalized,
      issues,
      status,
    }
  })
}

export function buildCsvImportDrafts(previewRows: CsvImportPreviewRow[], options?: { includeCheckRows?: boolean }) {
  const includeCheckRows = options?.includeCheckRows ?? true

  return previewRows
    .filter((row) => row.status === 'importable' || (includeCheckRows && row.status === 'check'))
    .map<CsvImportDraft>((row) => ({
      rowNumber: row.rowNumber,
      date: row.normalized.date ?? new Date().toISOString(),
      market: row.normalized.market ?? 'Unbekannt',
      netPnL: row.normalized.netPnL,
      entry: row.normalized.entry,
      exit: row.normalized.exit,
      stopLoss: row.normalized.stopLoss,
      takeProfit: row.normalized.takeProfit,
      direction: row.normalized.direction,
      setup: row.normalized.setup,
      session: row.normalized.session,
      tags: row.normalized.tags,
      notes: row.normalized.notes,
      fees: row.normalized.fees,
      positionSize: row.normalized.positionSize,
      instrumentType: row.normalized.instrumentType,
    }))
}

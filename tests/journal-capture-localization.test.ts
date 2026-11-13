import { describe, expect, it } from 'vitest'
import { importDiagnostic, importFieldLabel } from '@/lib/i18n/import-preview'
import { parseTradeFromSnipText } from '@/lib/utils/snipping-parser'
import { buildCsvImportDrafts, buildCsvImportPreview, getCsvImportMappingIssues, parseCsvText } from '@/lib/utils/trade-import'

describe('bilingual capture and preview diagnostics', () => {
  it('reports a conflicting screenshot stop in English without changing the recognised trade values', () => {
    const screenshotText = 'Long Position\nNASDAQ\nEntry Price 100\nStop Price 105\nTake Profit 120'
    const german = parseTradeFromSnipText(screenshotText, ['NASDAQ'], 'tradingview-position')
    const english = parseTradeFromSnipText(screenshotText, ['NASDAQ'], 'tradingview-position', 'en')

    expect(english).toMatchObject({ entry: german.entry, stopLoss: german.stopLoss, bias: german.bias, plausibility: 'critical' })
    expect(english.checks).toContainEqual(expect.objectContaining({
      key: 'stop-direction',
      level: 'critical',
      message: expect.stringContaining('wrong side of the entry'),
    }))
    expect(english.checks.map(({ key, level }) => ({ key, level })))
      .toEqual(german.checks.map(({ key, level }) => ({ key, level })))
  })

  it('translates preview explanations while retaining the original header and import evidence', () => {
    const file = parseCsvText('Zeit,Symbol,Netto\n2026-10-25T02:30:00,NASDAQ,35')
    const mapping = { date: 'Zeit', market: 'Symbol', netPnL: 'Netto' } as const
    const blocked = buildCsvImportPreview(file.rows, mapping)
    expect(blocked[0].status).toBe('skip')
    expect(blocked[0].issues.map((issue) => importDiagnostic(issue, 'en')))
      .toContain('The timestamp has no reliable time zone. Enter the UTC offset used in the export.')
    expect(buildCsvImportDrafts(blocked)).toHaveLength(0)
    expect(importFieldLabel('date', 'Datum', 'en')).toBe('Date and time')

    const [issue] = getCsvImportMappingIssues(file.headers, { ...mapping, entry: 'Netto' })
    expect(importDiagnostic(issue, 'en')).toContain('Column “Netto”')

    const ready = buildCsvImportPreview(file.rows, mapping, 'generic', {}, 60)
    const [draft] = buildCsvImportDrafts(ready)
    expect(draft.date).toBe('2026-10-25T01:30:00.000Z')
    expect(draft.importWarnings).toEqual(ready[0].warnings)
    expect(ready[0].warnings.map((warning) => importDiagnostic(warning, 'en')))
      .toContain('P&L came from the file. Check fees if the exchange reports them separately.')
  })
})

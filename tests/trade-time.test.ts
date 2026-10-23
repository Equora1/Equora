import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  formatTradeTimeInputValue, formatTradeTimeLabel, getTradeDateKey,
  getTradeTimeInputError, resolveTradeTimeInputToIso,
} from '@/lib/utils/trade-time'

const fallback = '2026-01-01T10:11:12.345Z'
const validCases = [
  ['2026-01-01T12:00', '2026-01-01T11:00:00.000Z'],
  ['2026-07-01T12:00', '2026-07-01T10:00:00.000Z'],
  ['2026-01-01T00:15', '2025-12-31T23:15:00.000Z'],
  ['2026-07-01T00:15', '2026-06-30T22:15:00.000Z'],
  ['2024-02-29T12:00', '2024-02-29T11:00:00.000Z'],
  ['2026-03-29T01:59', '2026-03-29T00:59:00.000Z'],
  ['2026-03-29T03:00', '2026-03-29T01:00:00.000Z'],
  ['2026-10-25T01:59', '2026-10-24T23:59:00.000Z'],
  ['2026-10-25T03:00', '2026-10-25T02:00:00.000Z'],
]

describe('Berlin trade wall time and explicit instants', () => {
  it.each(validCases)('%s resolves and renders without runtime-local conversion', (wall, iso) => {
    expect(resolveTradeTimeInputToIso(wall, fallback)).toBe(iso)
    expect(formatTradeTimeInputValue(iso)).toBe(wall)
    expect(getTradeTimeInputError(wall)).toBeUndefined()
  })
  it.each(['2026-02-29T12:00', '2026-04-31T12:00', '2026-13-01T12:00', '2026-01-01T24:00', '2026-01-01T12:60', '0000-01-01T12:00', 'tomorrow', '2026-01-01', '2026-02-30T12:00:00Z', '2026-01-01T12:00:60Z'])('rejects invalid input %s instead of substituting now', value => {
    expect(() => resolveTradeTimeInputToIso(value, fallback)).toThrow()
    expect(getTradeTimeInputError(value)).toContain('gültiges Datum')
  })
  it('rejects a missing spring hour and an ambiguous autumn hour', () => {
    expect(getTradeTimeInputError('2026-03-29T02:30')).toContain('gibt es')
    expect(getTradeTimeInputError('2026-10-25T02:30')).toContain('zweimal')
    // A creation fallback is not an owner-confirmed disambiguation.
    expect(() => resolveTradeTimeInputToIso('2026-10-25T02:30', '2026-10-25T01:30:00Z')).toThrow('zweimal')
  })
  it.each(['2026-10-25T00:30:17.123Z', '2026-10-25T01:30:42.987Z', '2026-01-01T11:00:09.321+00:00'])('preserves the exact stored instant and seconds on unchanged edit: %s', original => {
    const wall = formatTradeTimeInputValue(original)
    expect(resolveTradeTimeInputToIso(wall, fallback, original)).toBe(original)
    expect(getTradeTimeInputError(wall, original)).toBeUndefined()
  })
  it('does not reuse the old fold offset after changing the minute', () => {
    expect(getTradeTimeInputError('2026-10-25T02:31', '2026-10-25T01:30:00Z')).toContain('zweimal')
    expect(resolveTradeTimeInputToIso('2026-10-25T03:30', fallback, '2026-10-25T00:30:00Z')).toBe('2026-10-25T02:30:00.000Z')
  })
  it.each([
    ['2026-10-25T02:30:00+02:00', '2026-10-25T00:30:00.000Z'],
    ['2026-10-25T02:30:00+01:00', '2026-10-25T01:30:00.000Z'],
    ['2026-01-01T12:00:42.123Z', '2026-01-01T12:00:42.123Z'],
  ])('preserves explicit offset meaning for %s', (input, expected) => {
    expect(resolveTradeTimeInputToIso(input, fallback)).toBe(expected)
  })
  it.each(['', '  ', null, undefined])('keeps the existing blank-input fallback contract for %j', input => {
    expect(resolveTradeTimeInputToIso(input, fallback)).toBe(fallback)
  })
  it('keeps the Berlin label and date key consistent across midnight', () => {
    expect(formatTradeTimeLabel('2026-06-30T22:15:00Z')).toContain('00:15')
    expect(getTradeDateKey('2026-06-30T22:15:00Z')).toBe('2026-07-01')
    expect(formatTradeTimeInputValue('invalid')).toBe('')
    expect(formatTradeTimeLabel('invalid')).toBe('Nicht gesetzt')
  })
})

describe('actual utility source under different process timezones', () => {
  const source = readFileSync(fileURLToPath(new URL('../lib/utils/trade-time.ts', import.meta.url)), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
  it.each(['UTC', 'Europe/Berlin', 'America/New_York'])('is deterministic under TZ=%s', timezone => {
    const script = `import * as m from ${JSON.stringify(moduleUrl)};
      const cases=${JSON.stringify(validCases)};
      const originals=['2026-10-25T00:30:17.123Z','2026-10-25T01:30:42.987Z'];
      console.log(JSON.stringify({
        cases:cases.map(([wall])=>m.resolveTradeTimeInputToIso(wall,'${fallback}')),
        restored:originals.map(x=>m.resolveTradeTimeInputToIso(m.formatTradeTimeInputValue(x),'${fallback}',x)),
        spring:m.getTradeTimeInputError('2026-03-29T02:30'),
        autumn:m.getTradeTimeInputError('2026-10-25T02:30'),
        label:m.formatTradeTimeLabel('2026-01-01T11:00:00Z'),
        input:m.formatTradeTimeInputValue('2026-06-30T22:15:00Z'),
        date:m.getTradeDateKey('2026-06-30T22:15:00Z')
      }));`
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ: timezone }, encoding: 'utf8', windowsHide: true, timeout: 10_000,
    }))
    expect(result.cases).toEqual(validCases.map(([, iso]) => iso))
    expect(result.restored).toEqual(['2026-10-25T00:30:17.123Z', '2026-10-25T01:30:42.987Z'])
    expect(result.spring).toContain('gibt es'); expect(result.autumn).toContain('zweimal')
    expect(result.label).toContain('12:00'); expect(result.input).toBe('2026-07-01T00:15'); expect(result.date).toBe('2026-07-01')
  })
})

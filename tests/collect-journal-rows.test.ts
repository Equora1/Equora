import { describe, expect, it } from 'vitest'
import { collectJournalRows, type JournalRowPage } from '@/lib/server/collect-journal-rows'

const row = (id: number) => ({ id: String(id) })
const reply = (data: Array<{ id: string }>, count: number): JournalRowPage<{ id: string }> => ({ data, count, error: null })

describe('complete journal page collection', () => {
  it('reads beyond API limits and validates an empty tail', async () => {
    const all = Array.from({ length: 1203 }, (_, i) => row(i))
    const offsets: number[] = []
    const result = await collectJournalRows(async (from, to) => { offsets.push(from); return reply(all.slice(from, to + 1), all.length) }, 2000)
    expect(result).toEqual(all)
    expect(offsets).toEqual([0, 500, 1000, 1203])
  })
  it('continues when the API caps each response below the requested page size', async () => {
    const all = Array.from({ length: 205 }, (_, i) => row(i))
    const offsets: number[] = []
    expect(await collectJournalRows(async from => { offsets.push(from); return reply(all.slice(from, from + 100), all.length) }, 300)).toEqual(all)
    expect(offsets).toEqual([0, 100, 200, 205])
  })
  it('accepts an exactly empty journal', async () => {
    expect(await collectJournalRows(async () => reply([], 0), 100)).toEqual([])
  })
  it('rejects a later page error rather than returning accumulated trades', async () => {
    await expect(collectJournalRows(async from => from === 0 ? reply([row(1)], 2) : { data: null, count: null, error: { message: 'offline' } }, 100, 1)).rejects.toThrow('JOURNAL_READ_FAILED')
  })
  it('rejects an early empty response despite a positive exact count', async () => {
    await expect(collectJournalRows(async from => reply(from === 0 ? [row(1)] : [], 2), 100)).rejects.toThrow('JOURNAL_READ_INCOMPLETE')
  })
  it('rejects a changing count, including on the empty tail', async () => {
    await expect(collectJournalRows(async from => reply(from === 0 ? [row(1)] : [], from === 0 ? 1 : 2), 100)).rejects.toThrow('JOURNAL_CHANGED_DURING_READ')
  })
  it('rejects repeated IDs across pages', async () => {
    await expect(collectJournalRows(async () => reply([row(1)], 2), 100, 1)).rejects.toThrow('JOURNAL_READ_DUPLICATE_ID')
  })
  it('rejects more rows than the declared count', async () => {
    await expect(collectJournalRows(async () => reply([row(1)], 0), 100)).rejects.toThrow('JOURNAL_READ_INCONSISTENT')
  })
  it('rejects journals beyond the explicit workspace capacity', async () => {
    await expect(collectJournalRows(async () => reply([], 10001), 10000)).rejects.toThrow('JOURNAL_READ_LIMIT_EXCEEDED')
  })
  it('requires an exact nonnegative count', async () => {
    for (const count of [null, -1, 1.2, NaN]) await expect(collectJournalRows(async () => ({ data: [], count, error: null }), 100)).rejects.toThrow('JOURNAL_COUNT_UNAVAILABLE')
  })
  it('rejects a malformed response without rows', async () => {
    await expect(collectJournalRows(async () => ({ data: null, count: 0, error: null }), 100)).rejects.toThrow('JOURNAL_READ_FAILED')
  })
  it('rejects invalid budgets before calling the reader', async () => {
    let calls = 0
    await expect(collectJournalRows(async () => { calls++; return reply([], 0) }, 100, 0)).rejects.toThrow('JOURNAL_READ_OPTIONS_INVALID')
    expect(calls).toBe(0)
  })
})

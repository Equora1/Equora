import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ configured: true, server: true, client: vi.fn(), sign: vi.fn() }))
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: () => mock.configured, hasSupabaseServerEnv: () => mock.server }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mock.client }))
vi.mock('@/lib/supabase/server-auth', () => ({ createSupabaseAuthServerClient: mock.client }))
vi.mock('@/lib/server/media-access', () => ({ signTradeMediaRows: mock.sign }))
vi.mock('@/lib/server/performance', () => ({ measurePerformance: (_name: string, _kind: string, run: () => unknown) => run() }))
vi.mock('@/lib/server/journal', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/server/journal')>(), getJournalSnapshotServer: async () => ({ tradeRows: [], tradeTags: [{ id: 'demo-tag', trade_id: 'a', tag: 'Plan' }], tradeMediaRows: [{ id: 'demo-media', trade_id: 'a' }] }) }))
import { getTradeMediaServer, getTradeTagsServer } from '@/lib/server/trades'

let response: { data: unknown[] | null; count: number | null; error: { message: string } | null }
let filters: Array<[string, string]>
let selectOptions: unknown
let selectColumns: string
beforeEach(() => {
  mock.configured = true; mock.server = true; filters = []; selectOptions = undefined; selectColumns = ''
  response = { data: [], count: 0, error: null }
  const query = { select: (columns: string, options: unknown) => { selectColumns = columns; selectOptions = options; return query }, eq: (key: string, value: string) => { filters.push([key, value]); return query }, order: () => query, then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(response)) }
  mock.client.mockReset().mockReturnValue({ from: () => query })
  mock.sign.mockReset().mockImplementation((_client, rows) => rows)
})

describe('complete detail reads before editing', () => {
  it.each([['tags', getTradeTagsServer], ['media', getTradeMediaServer]] as const)('%s read binds owner and trade and requests an exact count', async (_label, reader) => {
    expect(await reader('a', 'owner', true)).toEqual([])
    expect(filters).toEqual([[_label === 'tags' ? 'trades.user_id' : 'user_id', 'owner'], ['trade_id', 'a']])
    if (_label === 'tags') expect(selectColumns).toBe('id,trade_id,created_at,tag,trades!inner(user_id)')
    expect(selectOptions).toEqual({ count: 'exact' })
  })
  it.each([['tags', getTradeTagsServer], ['media', getTradeMediaServer]] as const)('%s query error is not mistaken for an empty collection', async (_label, reader) => {
    response = { data: null, count: null, error: { message: 'test failure' } }
    await expect(reader('a', 'owner', true)).rejects.toThrow('could not be loaded completely')
  })
  it.each([['tags', getTradeTagsServer], ['media', getTradeMediaServer]] as const)('%s response cannot silently truncate related rows', async (_label, reader) => {
    response = { data: [{ id: 'one' }], count: 2, error: null }
    await expect(reader('a', 'owner', true)).rejects.toThrow('response incomplete')
    response = { data: [], count: null, error: null }
    await expect(reader('a', 'owner', true)).rejects.toThrow('response incomplete')
  })
  it('never substitutes demo data for a configured strict read without owner', async () => {
    await expect(getTradeMediaServer('a', undefined, true)).rejects.toThrow('owner required')
    await expect(getTradeTagsServer('a', undefined, true)).rejects.toThrow('owner required')
    expect(mock.client).not.toHaveBeenCalled()
  })
  it('retains built-in demo reads only when explicitly unconfigured', async () => {
    mock.configured = false
    expect(await getTradeMediaServer('a', undefined, true)).toHaveLength(1)
    expect(await getTradeTagsServer('a', undefined, true)).toHaveLength(1)
    expect(mock.client).not.toHaveBeenCalled()
  })
  it('retains compatibility for existing non-strict callers', async () => {
    response = { data: null, count: null, error: { message: 'test failure' } }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try { expect(await getTradeTagsServer('a', 'owner')).toEqual([]); expect(selectOptions).toBeUndefined() } finally { spy.mockRestore() }
  })
})

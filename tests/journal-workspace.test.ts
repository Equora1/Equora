import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({ configured: true, server: true, client: vi.fn() }))
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: () => mocks.configured, hasSupabaseServerEnv: () => mocks.server }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.client }))
vi.mock('@/lib/supabase/server-auth', () => ({ createSupabaseAuthServerClient: mocks.client }))
vi.mock('@/lib/server/performance', () => ({ measurePerformance: (_name: string, _kind: string, run: () => unknown) => run() }))
vi.mock('@/lib/server/media-access', () => ({ signTradeMediaRows: vi.fn(), signSetupMediaRows: vi.fn() }))
import { getTradesWorkspaceSnapshotServer } from '@/lib/server/journal'

type Row = { id: string; user_id?: string; trade_id?: string; is_master?: boolean; [key: string]: unknown }
type Call = { table: string; columns: string; count?: string; owner?: string; ownerColumn?: string; master?: string; order?: string; from: number; to: number }
let tables: Record<string, Row[]>
let calls: Call[]
let failTable: string | undefined
let legacy: boolean

class Query {
  call: Call
  constructor(table: string) { this.call = { table, columns: '', from: 0, to: 499 } }
  select(columns: string, options: { count?: string }) { this.call.columns = columns; this.call.count = options.count; return this }
  eq(column: string, owner: string) { if (column !== 'user_id' && column !== 'trades.user_id') throw Error('Unexpected scope'); this.call.owner = owner; this.call.ownerColumn = column; return this }
  or(master: string) { this.call.master = master; return this }
  order(column: string) { this.call.order = column; return this }
  range(from: number, to: number) { this.call.from = from; this.call.to = to; return this }
  then(resolve: (reply: unknown) => unknown) {
    calls.push({ ...this.call })
    const c = this.call
    if (c.table === failTable) return Promise.resolve(resolve({ data: null, count: null, error: { message: 'test failure' } }))
    // Actual schema: tags belong to a trade; trade_tags has no user_id column.
    if (c.table === 'trade_tags' && (c.ownerColumn === 'user_id' || /\buser_id\b/.test(c.columns.replace('trades!inner(user_id)', '')))) {
      return Promise.resolve(resolve({ data: null, count: null, error: { message: 'column trade_tags.user_id does not exist' } }))
    }
    if (legacy && ((c.table === 'trades' && c.columns.split(',').includes('import_batch_id')) || (c.table === 'setups' && c.columns.split(',').includes('is_master')))) {
      return Promise.resolve(resolve({ data: null, count: null, error: { message: `column ${c.table === 'trades' ? 'import_batch_id' : 'is_master'} missing` } }))
    }
    const data = (tables[c.table] ?? []).filter(row => c.table === 'trade_tags'
      ? c.ownerColumn === 'trades.user_id' && c.columns.includes('trades!inner(user_id)') && tables.trades.some(trade => trade.id === row.trade_id && trade.user_id === c.owner)
      : c.owner ? row.user_id === c.owner : row.user_id === 'owner-a' || row.is_master === true)
    return Promise.resolve(resolve({ data: data.slice(c.from, Math.min(c.to + 1, c.from + 100)), count: data.length, error: null }))
  }
}

beforeEach(() => {
  mocks.configured = true; mocks.server = true; failTable = undefined; legacy = false; calls = []
  tables = { trades: [], trade_tags: [], setup_trade_links: [], trade_media: [], setups: [] }
  mocks.client.mockReset().mockReturnValue({ from: (table: string) => new Query(table) })
})

describe('whole-journal server workspace wiring', () => {
  it('uses the declared tag columns and binds ownership through the parent trade', async () => {
    const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
    const definition = schema.match(/create table if not exists public\.trade_tags \(([\s\S]*?)\n\);/)![1]
    const columns = [...definition.matchAll(/^\s+([a-z_]+)\s/gm)].map(match => match[1])
    expect(columns).not.toContain('user_id')
    expect(definition).toContain('references public.trades (id)')
    expect((await getTradesWorkspaceSnapshotServer('owner-a')).availability).toBe('ready')
    const query = calls.find(call => call.table === 'trade_tags')!
    expect(query.ownerColumn).toBe('trades.user_id')
    expect(query.columns).toContain('trades!inner(user_id)')
    expect(query.columns.replace(',trades!inner(user_id)', '').split(',').every(column => columns.includes(column))).toBe(true)
  })
  it('loads all owned trades and related tags beyond 1000, excluding other owners', async () => {
    tables.trades = Array.from({ length: 1103 }, (_, i) => ({ id: `t-${i}`, user_id: 'owner-a' }))
    tables.trades.push({ id: 'foreign', user_id: 'owner-b' })
    tables.trade_tags = Array.from({ length: 1103 }, (_, i) => ({ id: `tag-${i}`, trade_id: `t-${i}`, tag: 'Plan' }))
    tables.trade_tags.push({ id: 'foreign-tag', trade_id: 'foreign', tag: 'Hidden' })
    tables.trade_media = [{ id: 'm1', trade_id: 't-1102', user_id: 'owner-a' }, { id: 'm2', trade_id: 't-1102', user_id: 'owner-a' }]
    tables.setups = [{ id: 'owned', user_id: 'owner-a' }, { id: 'shared', user_id: 'owner-b', is_master: true }, { id: 'private', user_id: 'owner-b' }]
    const result = await getTradesWorkspaceSnapshotServer('owner-a')
    expect(result.availability).toBe('ready')
    expect(result.tradeRows).toHaveLength(1103)
    expect(result.tradeTags).toHaveLength(1103)
    expect(result.tradeMediaCounts['t-1102']).toBe(2)
    expect(result.setupRows.map(row => row.id)).toEqual(['owned', 'shared'])
    expect(calls.every(call => call.count === 'exact' && call.order === 'id')).toBe(true)
    expect(calls.filter(call => call.table !== 'setups').every(call => call.owner === 'owner-a')).toBe(true)
  })
  it.each(['trades', 'trade_tags', 'setup_trade_links', 'trade_media', 'setups'])('fails closed on a %s read failure', async table => {
    failTable = table
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await getTradesWorkspaceSnapshotServer('owner-a')
      expect(result.availability).toBe('unavailable')
      expect(result.tradeRows).toEqual([])
      expect(result.tradeTags).toEqual([])
      expect(result.source).toBe('supabase')
    } finally { spy.mockRestore() }
  })
  it('does not access the client without an authenticated owner', async () => {
    expect((await getTradesWorkspaceSnapshotServer()).availability).toBe('unauthenticated')
    expect(mocks.client).not.toHaveBeenCalled()
  })
  it('uses built-in demo data only when the application is explicitly unconfigured', async () => {
    mocks.configured = false
    const result = await getTradesWorkspaceSnapshotServer()
    expect(result.source).toBe('mock')
    expect(result.availability).toBe('ready')
    expect(result.tradeRows).toHaveLength(4)
    expect(mocks.client).not.toHaveBeenCalled()
  })
  it('supports auth-client reads and legacy columns while retaining owner scope', async () => {
    mocks.server = false; legacy = true
    tables.trades = [{ id: 'owned', user_id: 'owner-a' }]
    tables.setups = [{ id: 'own-setup', user_id: 'owner-a' }, { id: 'foreign-setup', user_id: 'owner-b', is_master: true }]
    const result = await getTradesWorkspaceSnapshotServer('owner-a')
    expect(result.availability).toBe('ready')
    expect(result.tradeRows.map(row => row.id)).toEqual(['owned'])
    expect(result.setupRows.map(row => row.id)).toEqual(['own-setup'])
    expect(calls.some(call => call.table === 'trades' && !call.columns.includes('import_batch_id') && call.owner === 'owner-a')).toBe(true)
  })
})

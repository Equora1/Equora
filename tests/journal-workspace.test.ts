import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({ configured: true, server: true, client: vi.fn() }))
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: () => mocks.configured, hasSupabaseServerEnv: () => mocks.server }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.client }))
vi.mock('@/lib/supabase/server-auth', () => ({ createSupabaseAuthServerClient: mocks.client }))
vi.mock('@/lib/server/performance', () => ({ measurePerformance: (_name: string, _kind: string, run: () => unknown) => run() }))
vi.mock('@/lib/server/media-access', () => ({ signTradeMediaRows: vi.fn(), signSetupMediaRows: vi.fn() }))
import { getTradesWorkspaceSnapshotServer, getStatisticsSnapshotServer } from '@/lib/server/journal'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { buildTagStats } from '@/lib/utils/tag-analytics'
import { buildLinkedSetupByTradeId } from '@/lib/utils/trade-setup-links'
import type { TradeRow } from '@/lib/types/db'

type Row = { id: string; user_id?: string; trade_id?: string; is_master?: boolean; [key: string]: unknown }
type Call = { table: string; columns: string; count?: string; owner?: string; ownerColumn?: string; master?: string; order?: string; from: number; to: number }
let tables: Record<string, Row[]>
let calls: Call[]
let failTable: string | undefined
let legacy: boolean
let fault: { table: string; mode: 'later-error' | 'missing-count' | 'early-end' | 'changed-count' | 'duplicate' } | undefined

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
    let page = data.slice(c.from, Math.min(c.to + 1, c.from + 100))
    if (fault?.table === c.table) {
      if (fault.mode === 'missing-count') return Promise.resolve(resolve({ data: page, count: null, error: null }))
      if (c.from > 0) {
        if (fault.mode === 'later-error') return Promise.resolve(resolve({ data: null, count: null, error: { message: 'later page failed' } }))
        if (fault.mode === 'early-end') page = []
        if (fault.mode === 'changed-count') return Promise.resolve(resolve({ data: page, count: data.length + 1, error: null }))
        if (fault.mode === 'duplicate' && page.length) page = [data[0], ...page.slice(1)]
      }
    }
    return Promise.resolve(resolve({ data: page, count: data.length, error: null }))
  }
}

beforeEach(() => {
  mocks.configured = true; mocks.server = true; failTable = undefined; legacy = false; fault = undefined; calls = []
  tables = { trades: [], trade_tags: [], setup_trade_links: [], trade_media: [], setups: [] }
  mocks.client.mockReset().mockReturnValue({ from: (table: string) => new Query(table) })
})

describe('complete statistics snapshot', () => {
  it('includes late-page results, tags, setups and links in the same complete owner scope', async () => {
    tables.trades = Array.from({ length: 1272 }, (_, i) => ({
      id: `t-${i}`, user_id: 'owner-a', created_at: '2026-10-15T12:00:00Z',
      market: 'TEST', setup: 'Test', emotion: null, bias: 'Long', rule_check: null,
      entry: null, stop_loss: null, take_profit: null, exit: null, risk_percent: null,
      net_pnl: i < 1000 ? 1 : -2, r_multiple: i < 1000 ? 1 : -2,
      pnl_mode: 'manual', account_currency: 'EUR', capture_status: 'complete',
      notes: null, screenshot_url: null,
    }))
    tables.trades.push({ id: 'foreign', user_id: 'owner-b', net_pnl: 999999 })
    tables.trade_tags = Array.from({ length: 1272 }, (_, i) => ({ id: `tag-${i}`, trade_id: `t-${i}`, tag: i < 1000 ? 'Early' : 'Late', created_at: '2026-10-15' }))
    tables.trade_tags.push({ id: 'foreign-tag', trade_id: 'foreign', tag: 'Hidden' })
    tables.setup_trade_links = Array.from({ length: 1272 }, (_, i) => ({ id: `link-${i}`, user_id: 'owner-a', trade_id: `t-${i}`, setup_id: `setup-${i % 1103}` }))
    tables.setup_trade_links.push({ id: 'foreign-link', user_id: 'owner-b', trade_id: 't-0' }, { id: 'orphan-link', user_id: 'owner-a', trade_id: 'foreign' })
    tables.setup_trade_links.push(
      { id: 'a-latest', user_id: 'owner-a', trade_id: 't-1271', setup_id: 'setup-1102', created_at: '2026-10-15T12:00:00Z' },
      { id: 'z-older', user_id: 'owner-a', trade_id: 't-1271', setup_id: 'setup-0', created_at: '2026-10-14T12:00:00Z' },
    )
    tables.setups = Array.from({ length: 1103 }, (_, i) => ({ id: `setup-${i}`, title: `Setup ${i}`, user_id: 'owner-a' }))
    tables.setups.push({ id: 'master', user_id: 'owner-b', is_master: true }, { id: 'private', user_id: 'owner-b' })
    const result = await getStatisticsSnapshotServer('owner-a')
    expect(result.availability).toBe('ready')
    expect(result.tradeRows).toHaveLength(1272)
    expect(result.tradeTags).toHaveLength(1272)
    expect(result.setupTradeLinkRows).toHaveLength(1274)
    expect(result.setupTradeLinkRows.some(row => row.id === 'foreign-link' || row.id === 'orphan-link')).toBe(false)
    expect(result.setupRows).toHaveLength(1104)
    expect(result.tradeRows.some(row => row.id === 't-1271')).toBe(true)
    expect(result.setupRows.some(row => row.id === 'private')).toBe(false)
    const linked = buildLinkedSetupByTradeId(result.setupRows, result.setupTradeLinkRows)
    const trades = result.tradeRows.map(row => mapTradeRowToTrade(row as TradeRow, [], linked[row.id] ?? null))
    expect(trades.find(trade => trade.id === 't-1271')?.setup).toBe('Setup 1102')
    expect(getCoreMetrics(trades)).toMatchObject({ totalTrades: 1272, netPnL: 456, winners: 1000, losers: 272, rCount: 1272, averageR: 456 / 1272 })
    expect(buildTagStats(trades, result.tradeTags).find(row => row.tag === 'Late')).toMatchObject({ totalTrades: 272, netPnL: -544, avgR: -2 })
    expect(calls.every(call => call.count === 'exact' && call.order === 'id')).toBe(true)
    expect(calls.some(call => call.table === 'trades' && call.from === 1272)).toBe(true)
    expect(calls.some(call => call.table === 'trade_tags' && call.from === 1272)).toBe(true)
    expect(calls.filter(call => call.table === 'trade_tags').every(call => call.ownerColumn === 'trades.user_id')).toBe(true)
    expect(calls.some(call => call.table === 'trade_media')).toBe(false)
    const list = await getTradesWorkspaceSnapshotServer('owner-a')
    expect(buildLinkedSetupByTradeId(list.setupRows, list.setupTradeLinkRows)['t-1271']).toEqual(linked['t-1271'])
  })

  it.each(['trades', 'trade_tags', 'setup_trade_links', 'setups'])('does not return partial statistics when %s fails', async table => {
    failTable = table
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await getStatisticsSnapshotServer('owner-a')
      expect(result.availability).toBe('unavailable')
      expect(result.tradeRows).toEqual([])
      expect(result.tradeTags).toEqual([])
      expect(result.setupRows).toEqual([])
      expect(result.setupTradeLinkRows).toEqual([])
      expect(result.source).toBe('supabase')
    } finally { spy.mockRestore() }
  })

  it.each(['later-error', 'missing-count', 'early-end', 'changed-count', 'duplicate'] as const)('rejects a %s trade collection', async mode => {
    tables.trades = Array.from({ length: 1203 }, (_, i) => ({ id: `t-${i}`, user_id: 'owner-a' }))
    fault = { table: 'trades', mode }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try { expect((await getStatisticsSnapshotServer('owner-a')).availability).toBe('unavailable') }
    finally { spy.mockRestore() }
  })

  it('rejects failure after the first related-data page', async () => {
    tables.trades = [{ id: 'owned', user_id: 'owner-a' }]
    tables.trade_tags = Array.from({ length: 1103 }, (_, i) => ({ id: `tag-${i}`, trade_id: 'owned', tag: 'Plan' }))
    fault = { table: 'trade_tags', mode: 'later-error' }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await getStatisticsSnapshotServer('owner-a')
      expect(result.availability).toBe('unavailable')
      expect(result.tradeRows).toEqual([])
    } finally { spy.mockRestore() }
  })

  it('reports capacity overflow instead of returning a silently truncated history', async () => {
    tables.trades = Array.from({ length: 10001 }, (_, i) => ({ id: `t-${i}`, user_id: 'owner-a' }))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try { expect((await getStatisticsSnapshotServer('owner-a')).availability).toBe('unavailable') }
    finally { spy.mockRestore() }
  })

  it('retains auth and legacy-column fallback without loading media or notes', async () => {
    mocks.server = false; legacy = true
    tables.trades = [{ id: 'owned', user_id: 'owner-a' }]
    tables.setups = [{ id: 'owned-setup', user_id: 'owner-a' }, { id: 'foreign-setup', user_id: 'owner-b', is_master: true }]
    const result = await getStatisticsSnapshotServer('owner-a')
    expect(result.availability).toBe('ready')
    expect(result.setupRows.map(row => row.id)).toEqual(['owned-setup'])
    expect(calls.some(call => call.table === 'trades' && !call.columns.includes('import_batch_id'))).toBe(true)
    expect(calls.some(call => ['trade_media', 'setup_media', 'daily_notes'].includes(call.table))).toBe(false)
  })

  it('distinguishes authenticated empty, unauthenticated and explicitly unconfigured demo states', async () => {
    const empty = await getStatisticsSnapshotServer('owner-a')
    expect(empty.availability).toBe('ready')
    expect(empty.source).toBe('supabase')
    expect(empty.tradeRows).toEqual([])
    mocks.client.mockClear()
    expect((await getStatisticsSnapshotServer()).availability).toBe('unauthenticated')
    expect(mocks.client).not.toHaveBeenCalled()
    mocks.configured = false
    const demo = await getStatisticsSnapshotServer()
    expect(demo.availability).toBe('ready')
    expect(demo.source).toBe('mock')
    expect(demo.tradeRows).toHaveLength(4)
    expect(demo.tradeMediaRows).toEqual([])
    expect(demo.setupMediaRows).toEqual([])
    expect(demo.dailyNotes).toEqual([])
  })
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

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planTradeCurrencyCorrection, type CurrencyCorrectionRow } from '@/lib/utils/trade-currency-correction'

const mocks = vi.hoisted(() => ({ client: vi.fn(), env: vi.fn(), revalidate: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: mocks.env }))
vi.mock('@/lib/supabase/server-auth', () => ({ createSupabaseAuthServerClient: mocks.client }))
import { previewTradeCurrencyCorrection, applyTradeCurrencyCorrection } from '@/app/actions/trade-currency'

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const selection = { currency: 'USDT', scope: 'all' as const }
type Row = CurrencyCorrectionRow & { user_id: string; net_pnl: number; entry: null; exit: null; r_multiple: null }
function fixture(currencies: Array<string | null>) {
  return currencies.map((account_currency, n): Row => ({ id: id(n), account_currency, user_id: 'owner', net_pnl: n ? -12.34 : 0, entry: null, exit: null, r_multiple: null }))
}

function setup(rows: Row[], options: { user?: string | null; readError?: boolean; failBatch?: number; truncate?: number; beforeWrite?: (rows: Row[], batch: number) => void } = {}) {
  const writes: Array<{ values: unknown; owner: unknown; ids: unknown; previous: unknown }> = []
  let batch = 0
  const from = vi.fn(() => {
    let mutation: Record<string, unknown> | null = null
    const filters: Array<[string, unknown]> = []
    let selectedIds: string[] | undefined
    const matched = () => rows.filter(row => filters.every(([key, value]) => row[key as keyof Row] === value)
      && (!selectedIds || selectedIds.includes(row.id)))
    const query = {
      select: vi.fn(() => {
        if (!mutation) return query
        batch++
        options.beforeWrite?.(rows, batch)
        writes.push({ values: mutation, owner: filters.find(([key]) => key === 'user_id')?.[1], ids: selectedIds, previous: filters.find(([key]) => key === 'account_currency')?.[1] })
        if (options.failBatch === batch) return Promise.resolve({ data: null, error: { message: 'failure' } })
        const selected = matched()
        selected.forEach(row => Object.assign(row, mutation))
        return Promise.resolve({ data: selected.map(row => ({ id: row.id })), error: null })
      }),
      eq: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return query }),
      is: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return query }),
      in: vi.fn((_key: string, values: string[]) => { selectedIds = values; return query }),
      order: vi.fn(() => query),
      range: vi.fn((start: number, end: number) => {
        const selected = matched().sort((a, b) => a.id.localeCompare(b.id))
        return Promise.resolve({ data: options.readError ? null : structuredClone(selected.slice(start, options.truncate === undefined ? end + 1 : start + options.truncate)), count: selected.length, error: options.readError ? { message: 'read failure' } : null })
      }),
      update: vi.fn((values: Record<string, unknown>) => { mutation = values; return query }),
    }
    return query
  })
  const user = options.user === undefined ? 'owner' : options.user
  mocks.client.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: user ? { id: user } : null }, error: null }) }, from })
  return { writes, from }
}
async function preview(input = selection) {
  const result = await previewTradeCurrencyCorrection(input)
  expect(result.success).toBe(true)
  if (!result.success) throw new Error('Preview failed')
  return result
}
beforeEach(() => { vi.clearAllMocks(); mocks.env.mockReturnValue(true) })

describe('currency-only correction planning', () => {
  it('supports all own trades, distinguishes missing from replacements and skips exact USDT', () => {
    const plan = planTradeCurrencyCorrection(fixture([null, '', ' ', 'EUR', 'XYZ', 'USDT']), 'USDT', 'all')
    expect(plan.summary).toEqual({ total: 6, changes: 5, missing: 3, replacements: 2, alreadyCorrect: 1 })
    expect(plan.batches.map(b => b.previous)).toEqual([null, '', ' ', 'EUR', 'XYZ'])
  })
  it('missing-only preserves supported and unsupported existing units', () => {
    expect(planTradeCurrencyCorrection(fixture([null, ' ', 'EUR', 'XYZ', 'USDT']), 'USDT', 'missing').summary)
      .toEqual({ total: 5, changes: 2, missing: 2, replacements: 0, alreadyCorrect: 1 })
  })
  it('keeps every write bounded to 100 exact IDs', () => {
    const rows = fixture(Array(1272).fill(null))
    const batches = planTradeCurrencyCorrection(rows, 'USDT', 'all').batches
    expect(batches).toHaveLength(13)
    expect(batches.every(batch => batch.ids.length <= 100)).toBe(true)
    expect(batches.flatMap(batch => batch.ids)).toEqual(rows.map(row => row.id))
  })
})

describe('authenticated currency-only server actions', () => {
  it('preview performs no writes and reads the entire journal across short API pages', async () => {
    const rows = fixture(Array(1272).fill(null))
    const { writes } = setup(rows, { truncate: 73 })
    expect((await preview()).summary.changes).toBe(1272)
    expect(writes).toEqual([])
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it('changes only currency and preserves all prices, P&L, true zero and missing R', async () => {
    const rows = fixture([null, '', 'EUR', 'USDT'])
    const before = structuredClone(rows)
    const { writes } = setup(rows)
    const { token } = await preview()
    expect(await applyTradeCurrencyCorrection({ ...selection, token, confirmed: true })).toMatchObject({ success: true, saved: 3 })
    expect(writes.every(write => JSON.stringify(write.values) === '{"account_currency":"USDT"}' && write.owner === 'owner')).toBe(true)
    expect(rows).toEqual(before.map(row => ({ ...row, account_currency: 'USDT' })))
    expect(mocks.revalidate).toHaveBeenCalledWith('/review-sessions')
  })
  it('never reads or changes another user’s trades', async () => {
    const rows = fixture([null, null]); rows[1].user_id = 'other'
    setup(rows)
    const { token, summary } = await preview()
    expect(summary.total).toBe(1)
    expect(await applyTradeCurrencyCorrection({ ...selection, token, confirmed: true })).toMatchObject({ success: true, saved: 1 })
    expect(rows[1].account_currency).toBeNull()
  })
  it('limits an individual correction to one owned ID', async () => {
    const rows = fixture([null, null]); setup(rows)
    const input = { ...selection, tradeId: rows[1].id }
    const { token } = await preview(input)
    expect(await applyTradeCurrencyCorrection({ ...input, token, confirmed: true })).toMatchObject({ success: true, saved: 1 })
    expect(rows[0].account_currency).toBeNull()
  })
  it('does not reveal or edit a foreign ID', async () => {
    const rows = fixture([null]); rows[0].user_id = 'other'
    const { writes } = setup(rows)
    expect(await previewTradeCurrencyCorrection({ ...selection, tradeId: rows[0].id })).toMatchObject({ success: false })
    expect(writes).toEqual([])
  })
  it.each(['currency', 'scope', 'tradeId', 'owner', 'add', 'delete', 'previous'])('rejects a stale or rebound preview (%s) before any write', async change => {
    const rows = fixture([null, 'EUR']); const { writes } = setup(rows)
    const { token } = await preview()
    let input = { ...selection, tradeId: undefined as string | undefined }
    if (change === 'currency') input.currency = 'USD'
    if (change === 'scope') input = { ...input, scope: 'missing' as 'all' }
    if (change === 'tradeId') input.tradeId = rows[0].id
    if (change === 'owner') setup(rows, { user: 'other' })
    if (change === 'add') rows.push({ ...rows[0], id: id(99) })
    if (change === 'delete') rows.pop()
    if (change === 'previous') rows[0].account_currency = 'USDC'
    expect(await applyTradeCurrencyCorrection({ ...input, token, confirmed: true })).toMatchObject({ success: false, saved: 0 })
    expect(writes).toEqual([])
  })
  it('does not overwrite a currency changed after revalidation and stops further batches', async () => {
    const rows = fixture([null, 'EUR'])
    const { writes } = setup(rows, { beforeWrite: list => { list[0].account_currency = 'USDC' } })
    const { token } = await preview()
    expect(await applyTradeCurrencyCorrection({ ...selection, token, confirmed: true })).toMatchObject({ success: false, saved: 0 })
    expect(writes).toHaveLength(1)
    expect(rows.map(row => row.account_currency)).toEqual(['USDC', 'EUR'])
  })
  it('reports a confirmed partial outcome without retry or later batches', async () => {
    const rows = fixture(Array(201).fill(null)); const { writes } = setup(rows, { failBatch: 2 })
    const { token } = await preview()
    const result = await applyTradeCurrencyCorrection({ ...selection, token, confirmed: true })
    expect(result).toMatchObject({ success: false, saved: 100 })
    expect(result.message).toContain('nicht bestätigt')
    expect(writes).toHaveLength(2)
    expect(rows.filter(row => row.account_currency === 'USDT')).toHaveLength(100)
  })
  it.each([false, undefined])('requires explicit confirmation (%s)', async confirmed => {
    const { writes } = setup(fixture([null])); const { token } = await preview()
    expect(await applyTradeCurrencyCorrection({ ...selection, token, confirmed: confirmed as boolean })).toMatchObject({ success: false })
    expect(writes).toEqual([])
  })
  it.each(['demo', 'logout', 'read-error', 'incomplete', 'too-many'])('fails closed before writing (%s)', async kind => {
    const rows = fixture(Array(kind === 'too-many' ? 10001 : 2).fill(null))
    const { writes, from } = setup(rows, { user: kind === 'logout' ? null : 'owner', readError: kind === 'read-error', truncate: kind === 'incomplete' ? 0 : undefined })
    if (kind === 'demo') mocks.env.mockReturnValue(false)
    expect(await previewTradeCurrencyCorrection(selection)).toMatchObject({ success: false })
    expect(await applyTradeCurrencyCorrection({ ...selection, token: 'a'.repeat(64), confirmed: true })).toMatchObject({ success: false, saved: 0 })
    expect(writes).toEqual([])
    if (kind === 'logout' || kind === 'demo') expect(from).not.toHaveBeenCalled()
  })
  it.each([{ ...selection, currency: 'JPY' }, { ...selection, scope: 'filtered' }, { ...selection, tradeId: '' }, { ...selection, tradeId: 'not-an-id' }])('rejects invalid selections before authentication (%j)', async input => {
    expect(await previewTradeCurrencyCorrection(input as typeof selection)).toMatchObject({ success: false })
    expect(mocks.client).not.toHaveBeenCalled()
  })
  it('replaying a successful changed preview cannot perform a second write', async () => {
    const { writes } = setup(fixture([null])); const { token } = await preview()
    const input = { ...selection, token, confirmed: true }
    expect(await applyTradeCurrencyCorrection(input)).toMatchObject({ success: true, saved: 1 })
    expect(await applyTradeCurrencyCorrection(input)).toMatchObject({ success: false, saved: 0 })
    expect(writes).toHaveLength(1)
  })
})

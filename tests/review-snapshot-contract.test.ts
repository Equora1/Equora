import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), service: vi.fn(), clientEnv: vi.fn(), serverEnv: vi.fn(), revalidate: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: mocks.clientEnv, hasSupabaseServerEnv: mocks.serverEnv }))
vi.mock('@/lib/supabase/server-auth', () => ({ createSupabaseAuthServerClient: mocks.auth }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: mocks.service }))
import { buildReviewSnapshotSummary, getSavedReviewRState, getSavedReviewRValue, haveComparableReviewCalculations, isCurrentReviewCalculation, REVIEW_CALCULATION_VERSION } from '@/lib/utils/review-snapshot-summary'
import { saveTrustedReviewSnapshot, normalizeReviewTradeIds } from '@/lib/server/review-snapshot-save'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { mapReviewSessionRow } from '@/lib/server/review-sessions'
import { buildReviewSnapshot } from '@/lib/utils/review'
import { saveReviewSession } from '@/app/actions/review-sessions'
import type { TradeRow, ReviewSessionRow } from '@/lib/types/db'

const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id = '00000000-0000-0000-0000-000000000001', sid = '10000000-0000-0000-0000-000000000001'
const base: TradeRow = { id, user_id: owner, created_at: '2026-10-16T12:00:00Z', market: 'TEST', setup: 'Test', emotion: null, bias: 'Long', rule_check: null,
  entry: 100, stop_loss: 90, take_profit: 120, exit: 110, net_pnl: 10, risk_percent: 1, r_multiple: null, notes: null, screenshot_url: null,
  position_size: 2, account_currency: 'EUR', pnl_mode: 'manual', capture_result: 'winner', capture_status: 'complete' }
const input = { title: 'Review', tradeIds: [id], tradeCount: 999, visibleTradeCount: 999, averageR: 999, netPnL: 999, monetaryScopeKind: 'single' as const, currency: 'EUR' as const }
function fake(rows = [base], errorAt = '') {
  const source = JSON.stringify({ version: 'review-source-v2', owner, trades: rows, tags: [] }, null, 2)
  const rpc = vi.fn(async (name: string, args: Record<string, any>) => {
    if (name === 'equora_review_source_v2') return { data: source, error: errorAt === 'source' ? { message: 'source failed' } : null }
    const summary = args.p_summary
    return { data: { id: args.p_session_id, user_id: owner, title: 'Review', calculation_version: summary.calculationVersion,
      r_count: summary.rCount, excluded_r_count: summary.excludedRCount, average_r: summary.averageR, trade_count: summary.tradeCount,
      trade_ids: summary.tradeIds, net_pnl: summary.netPnL, monetary_scope_kind: summary.monetaryScopeKind, currency: summary.currency },
      error: errorAt === 'commit' ? { message: 'REVIEW_SOURCE_CHANGED' } : null }
  })
  return { rpc, source }
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.clientEnv.mockReturnValue(true); mocks.serverEnv.mockReturnValue(true)
  mocks.auth.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: owner } }, error: null }) } })
})

describe('one calculation contract for live drafts and server snapshots', () => {
  it.each([
    ['derived documented R without stored R', {}, 0.5, 1],
    ['documented zero', { net_pnl: 0, capture_result: 'breakeven' }, 0, 1],
    ['negative documented outcome', { net_pnl: -20, capture_result: 'loser' }, -1, 1],
    ['open raw R excluded', { r_multiple: 8, capture_result: 'open' }, null, 0],
    ['incomplete raw R excluded', { r_multiple: 8, capture_status: 'incomplete' }, null, 0],
    ['open remainder excluded', { exit: null, partial_exits: [{ percent: 50, price: 120 }] }, null, 0],
    ['ambiguous closed partial exit excluded', { exit: 117.5, partial_exits: [{ percent: 50, price: 120 }] }, null, 0],
    ['planned R excluded', { net_pnl: null, exit: null, capture_result: 'open' }, null, 0],
  ] as Array<[string, Partial<TradeRow>, number | null, number]>)('%s', (_name, overrides, expected, count) => {
    const trades = [mapTradeRowToTrade({ ...base, ...overrides })]
    const saved = buildReviewSnapshotSummary(trades, [])
    const live = buildReviewSnapshot(trades, [], [], 'supabase', { preset: '7d' }).sessionDraft
    expect(saved.averageR).toBe(expected); expect(saved.rCount).toBe(count)
    expect(saved.excludedRCount).toBe(1 - count)
    expect(live).toEqual(saved)
  })
  it('positive and negative observations average to actual zero', () => {
    const rows = [base, { ...base, id: '00000000-0000-0000-0000-000000000002', net_pnl: -10 }]
    expect(buildReviewSnapshotSummary(rows.map(row => mapTradeRowToTrade(row)), [])).toMatchObject({ averageR: 0, rCount: 2 })
  })
  it.each([null, 'JPY', 'USDT'])('preserves monetary limits for %s', (currency) => {
    const rows = [base, { ...base, id: '00000000-0000-0000-0000-000000000002', account_currency: currency }]
    const summary = buildReviewSnapshotSummary(rows.map(row => mapTradeRowToTrade(row)), [])
    expect(summary.netPnL).toBe(0); expect(summary.currency).toBeNull()
    expect(summary.monetaryScopeKind).toBe(currency === 'USDT' ? 'mixed' : 'unknown')
    expect(summary.bestTradeId).toBeNull(); expect(summary.worstTradeId).toBeNull()
  })
  it('deterministically ranks equal outcomes and excludes foreign tags', () => {
    const other = { ...base, id: '00000000-0000-0000-0000-000000000002' }
    const tags = [{ id:'t',created_at:'',trade_id:id,tag:' B ' },{ id:'t2',created_at:'',trade_id:id,tag:'A' },{ id:'f',created_at:'',trade_id:'foreign',tag:'Ignored' }]
    const summary = buildReviewSnapshotSummary([other, base].map(row => mapTradeRowToTrade(row)), tags)
    expect(summary.topTags).toEqual(['A','B']); expect(summary.bestTradeId).toBe(id); expect(summary.worstTradeId).toBe(id)
  })
})

describe('owner-scoped immutable source transport', () => {
  it('uses mapped outcomes and preserves exact database source text', async () => {
    const client = fake(); await saveTrustedReviewSnapshot(client, owner, sid, [id], { title: 'Review' })
    expect(client.rpc.mock.calls[1]).toEqual(['equora_commit_review_snapshot_v2', expect.objectContaining({ p_user_id: owner, p_source_text: client.source,
      p_summary: expect.objectContaining({ averageR: 0.5, rCount: 1, calculationVersion: REVIEW_CALCULATION_VERSION }) })])
  })
  it.each(['source','commit'])('fails without retry or legacy fallback on %s error', async (where) => {
    const client = fake([base],where); await expect(saveTrustedReviewSnapshot(client,owner,sid,[id],{})).rejects.toThrow()
    expect(client.rpc).toHaveBeenCalledTimes(where==='source'?1:2)
    expect(client.rpc.mock.calls.some(([name])=>name==='equora_save_review_session_v1')).toBe(false)
  })
  it.each([
    { rows: [{...base,user_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}] },
    { rows: [] }, { rows: [base,base] },
  ])('rejects wrong owner or incomplete/duplicate source before commit', async ({rows}) => {
    const client=fake(rows); await expect(saveTrustedReviewSnapshot(client,owner,sid,[id],{})).rejects.toThrow()
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })
  it('rejects tags for a different trade',async()=>{
    const client=fake();client.rpc.mockResolvedValueOnce({data:JSON.stringify({version:'review-source-v2',owner,trades:[base],tags:[{trade_id:'other',tag:'x'}]}),error:null})
    await expect(saveTrustedReviewSnapshot(client,owner,sid,[id],{})).rejects.toThrow('INVALID_REVIEW_TAG_SOURCE');expect(client.rpc).toHaveBeenCalledTimes(1)
  })
  it.each([[],['invalid'],null,Array.from({length:2001},(_,n)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`)].map(value=>[value]))('rejects invalid selection',value=>{expect(()=>normalizeReviewTradeIds(value)).toThrow()})
  it('normalizes UUID case before deduplication',()=>expect(normalizeReviewTradeIds([owner,owner.toUpperCase()])).toEqual([owner]))
})

describe('real save action does not trust client metrics',()=>{
  it('replaces forged client averages and counts with server calculation',async()=>{
    const client=fake();mocks.service.mockReturnValue(client)
    const result=await saveReviewSession(input)
    expect(result.success).toBe(true);expect(result.session).toMatchObject({averageR:0.5,rCount:1,tradeCount:1,calculationVersion:REVIEW_CALCULATION_VERSION})
    expect(client.rpc.mock.calls[1][1].p_summary.averageR).not.toBe(999)
  })
  it('does not create privileged client without authenticated owner',async()=>{
    mocks.auth.mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:null}})}})
    expect((await saveReviewSession(input)).success).toBe(false);expect(mocks.service).not.toHaveBeenCalled()
  })
  it('fails closed when migration/new source RPC is unavailable',async()=>{
    const client=fake([base],'source');mocks.service.mockReturnValue(client)
    expect((await saveReviewSession(input)).success).toBe(false);expect(mocks.revalidate).not.toHaveBeenCalled();expect(client.rpc).toHaveBeenCalledTimes(1)
  })
  it('does not create privileged client on an auth error even if a user object exists',async()=>{
    mocks.auth.mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:owner}},error:{message:'invalid'}})}})
    expect((await saveReviewSession(input)).success).toBe(false);expect(mocks.service).not.toHaveBeenCalled()
  })
  it('rejects malformed scope before obtaining either client',async()=>{
    expect((await saveReviewSession({...input,tradeIds:[null]} as any)).success).toBe(false)
    expect(mocks.auth).not.toHaveBeenCalled();expect(mocks.service).not.toHaveBeenCalled()
  })
  it('does not suggest retry after an ambiguous commit transport failure',async()=>{
    const client=fake();client.rpc.mockImplementationOnce(async()=>({data:client.source,error:null})).mockRejectedValueOnce(new Error('connection lost'))
    mocks.service.mockReturnValue(client)
    const result=await saveReviewSession(input)
    expect(result).toMatchObject({success:false,message:expect.stringContaining('prüfe zuerst die Review-Sammlung')})
    expect(client.rpc).toHaveBeenCalledTimes(2);expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})

describe('historical saved averages are preserved without invented provenance',()=>{
  it.each([0,2,null])('does not classify historical %s as a documented new result',average_r=>{
    const row={id:sid,title:'Old',average_r,trade_count:1} as ReviewSessionRow
    const saved=mapReviewSessionRow(row);expect(saved.averageR).toBeNull();expect(saved.legacyAverageR).toBe(average_r)
    expect(haveComparableReviewCalculations(saved,saved)).toBe(false)
  })
  it('keeps actual documented zero comparable with its count',()=>{
    const r={calculationVersion:REVIEW_CALCULATION_VERSION,averageR:0,rCount:1,excludedRCount:0,tradeCount:1}
    expect(getSavedReviewRValue(r)).toBe(0);expect(haveComparableReviewCalculations(r,r)).toBe(true)
  })
  it('rejects invalid observation metadata despite a matching version label',()=>{
    expect(getSavedReviewRValue({calculationVersion:REVIEW_CALCULATION_VERSION,averageR:0,rCount:2,excludedRCount:0,tradeCount:1})).toBeNull()
  })
  it.each([
    {calculation_version:'unrecognized-version',r_count:1,excluded_r_count:0,average_r:2},
    {calculation_version:REVIEW_CALCULATION_VERSION,r_count:null,excluded_r_count:null,average_r:0},
    {calculation_version:REVIEW_CALCULATION_VERSION,r_count:2,excluded_r_count:0,average_r:2},
    {calculation_version:REVIEW_CALCULATION_VERSION,r_count:0,excluded_r_count:1,average_r:2},
  ])('retains the stored number for an unknown or inconsistent calculation (%j)',fields=>{
    const row={id:sid,title:'Stored',trade_count:1,...fields} as ReviewSessionRow
    const saved=mapReviewSessionRow(row)
    expect(saved.averageR).toBeNull();expect(saved.legacyAverageR).toBe(fields.average_r)
    expect(saved.calculationVerified).toBe(false)
    const normalized={...saved,...getSavedReviewRState(saved)}
    expect(normalized.legacyAverageR).toBe(fields.average_r)
    expect(isCurrentReviewCalculation(normalized)).toBe(false)
    expect(haveComparableReviewCalculations(normalized,normalized)).toBe(false)
  })
  it('does not repair inconsistent zero-observation provenance by clearing its mean',()=>{
    const original={calculationVersion:REVIEW_CALCULATION_VERSION,averageR:2,rCount:0,excludedRCount:1,tradeCount:1}
    const once={...original,...getSavedReviewRState(original)}
    const twice={...once,...getSavedReviewRState(once)}
    expect(twice.averageR).toBeNull();expect(twice.legacyAverageR).toBe(2)
    expect(twice.calculationVerified).toBe(false);expect(isCurrentReviewCalculation(twice)).toBe(false)
  })
  it('keeps a valid empty observation set verified without a fabricated zero',()=>{
    const original={calculationVersion:REVIEW_CALCULATION_VERSION,averageR:null,rCount:0,excludedRCount:1,tradeCount:1}
    const normalized={...original,...getSavedReviewRState(original)}
    expect(isCurrentReviewCalculation(normalized)).toBe(true)
    expect(normalized.averageR).toBeNull();expect(normalized.legacyAverageR).toBeNull()
  })
})

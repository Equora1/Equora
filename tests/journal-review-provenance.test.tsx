import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ client: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }) }))
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: () => true }))
vi.mock('@/lib/supabase/server-auth', () => ({ createSupabaseAuthServerClient: mocks.client }))
vi.mock('@/lib/server/media-cleanup', () => ({ processMediaCleanupForPaths: vi.fn() }))
vi.mock('@/app/actions/trade-currency', () => ({ previewTradeCurrencyCorrection: vi.fn(), applyTradeCurrencyCorrection: vi.fn() }))
vi.mock('@/app/actions/media-cleanup', () => ({ requestUncommittedMediaCleanup: vi.fn() }))
vi.mock('@/app/actions/user-cost-profiles', () => ({ deleteUserCostProfile: vi.fn(), saveUserCostProfile: vi.fn() }))
vi.mock('@/components/trades/snipping-assist-dynamic', () => ({ SnippingAssistCard: () => null }))
import { TradeForm } from '@/components/trades/trade-form'
import { createTradeEntry, updateTradeEntry } from '@/app/actions/trades'
import { hasTradeReview } from '@/lib/utils/review-layer-snapshot'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import type { TradeCaptureInput } from '@/lib/utils/trade-validation'

const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const props = { markets: ['TEST'], setups: ['Test'], emotions: ['Fokussiert', 'Gestresst'], biases: ['Long'], ruleFlags: [], tagOptions: [] }
function hidden(html: string, name: string) {
  const match = html.match(new RegExp('<input[^>]*name="' + name + '"[^>]*value="([^"]*)"'))
  if (!match) throw Error('Missing actual input ' + name)
  return match[1]
}
function values(html: string): TradeCaptureInput {
  const keys = 'market setup emotion bias ruleCheck reviewRepeatability reviewState reviewLesson tradeOccurredAt entry stopLoss takeProfit exit netPnL riskPercent accountSize marginUsed rMultiple pnlMode costProfile brokerProfile instrumentType accountTemplate marketTemplate positionSize pointValue fees exchangeFees fundingFees fundingRateBps fundingIntervals spreadCost slippage accountCurrency cryptoMarketType executionType fundingDirection quoteAsset leverage userCostProfileId notes'.split(' ')
  return { ...Object.fromEntries(keys.map(key => [key, ''])), market: 'TEST', setup: 'Test', bias: 'Long', tradeOccurredAt: '2026-01-01T12:00', netPnL: '35', pnlMode: 'manual', costProfile: 'none', brokerProfile: 'manual', instrumentType: 'crypto', accountCurrency: 'USDT', tags: [], emotion: hidden(html, 'emotion'), reviewState: hidden(html, 'review_state') } as unknown as TradeCaptureInput
}
let row: any, rpc: ReturnType<typeof vi.fn>
beforeEach(() => {
  row = { id, created_at: '2026-01-01T11:00:00Z', captured_at: '2026-01-01T11:00:00Z', notes: '' }
  rpc = vi.fn(async (_name, args) => { Object.assign(row, args.p_trade); return { data: { tradeId: id }, error: null } })
  const tradeQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: async () => ({ data: { ...row }, error: null }) }
  const setupQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: async () => ({ data: null, error: null }) }
  mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: owner } } }) }, rpc, from: (table: string) => table === 'trades' ? tradeQuery : setupQuery })
})

it('actual Create -> read -> unchanged Edit -> action keeps unanswered review and emotion empty', async () => {
  const createHtml = renderToStaticMarkup(<TradeForm {...props} />)
  expect(values(createHtml)).toMatchObject({ emotion: '', reviewState: '' })
  expect((await createTradeEntry(values(createHtml))).success).toBe(true)
  expect(row).toMatchObject({ emotion: null, review_state: null })
  for (let n = 0; n < 2; n++) {
    const html = renderToStaticMarkup(<TradeForm {...props} mode="edit" tradeId={id} initialValues={{ market: 'TEST', setup: 'Test', emotion: row.emotion ?? '', reviewState: row.review_state ?? '', capturedAt: row.captured_at }} />)
    expect((await updateTradeEntry(id, values(html))).success).toBe(true)
    expect(row).toMatchObject({ emotion: null, review_state: null })
    expect(hasTradeReview(mapTradeRowToTrade(row))).toBe(false)
  }
  expect(rpc).toHaveBeenCalledTimes(3)
})
it.each([
  ['Gestresst', '', null],
  ['Gestresst', 'Fokussiert', 'Fokussiert'],
  ['Gestresst', 'Geduldig', 'Geduldig'],
  ['', 'Müde', 'Müde'],
])('preserves legacy emotion %s separately from explicit review %s', async (emotion, reviewState, stored) => {
  const html = renderToStaticMarkup(<TradeForm {...props} mode="edit" tradeId={id} initialValues={{ market: 'TEST', setup: 'Test', emotion, reviewState }} />)
  expect(values(html)).toMatchObject({ emotion, reviewState })
  expect((await updateTradeEntry(id, values(html))).success).toBe(true)
  expect(row.emotion).toBe(emotion || null)
  expect(row.review_state).toBe(stored)
})
it('explicitly clearing a review does not clear a separate legacy emotion or promote it back', async () => {
  Object.assign(row, { emotion: 'Gestresst', review_state: 'Fokussiert' })
  const html = renderToStaticMarkup(<TradeForm {...props} mode="edit" tradeId={id} initialValues={{ emotion: 'Gestresst', reviewState: 'Fokussiert' }} />)
  expect((await updateTradeEntry(id, { ...values(html), reviewState: '' })).success).toBe(true)
  expect(row).toMatchObject({ emotion: 'Gestresst', review_state: null })
  const reloaded = renderToStaticMarkup(<TradeForm {...props} mode="edit" tradeId={id} initialValues={{ emotion: row.emotion, reviewState: row.review_state ?? '' }} />)
  expect(hidden(reloaded, 'review_state')).toBe('')
})

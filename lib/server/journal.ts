import { dailyNotes, setupRows, tradeTags, trades } from '@/lib/data/mock-data'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { DailyNoteRow, SetupMediaRow, SetupRow, TradeMediaRow, TradeRow } from '@/lib/types/db'
import type { TradeTag } from '@/lib/types/tag'
import { normalizeTradeDate } from '@/lib/utils/calendar'

export type JournalSnapshot = { tradeRows: TradeRow[]; tradeMediaRows: TradeMediaRow[]; tradeTags: TradeTag[]; setupRows: SetupRow[]; setupMediaRows: SetupMediaRow[]; dailyNotes: DailyNoteRow[]; source: 'supabase' | 'mock' }

function buildMockTradeRows(): TradeRow[] {
  const pnlModes: Array<TradeRow['pnl_mode']> = ['manual', 'auto', 'override', 'manual']
  const costProfiles: Array<TradeRow['cost_profile']> = ['futures-standard', 'forex-tight', 'futures-standard', 'crypto-perps']
  const brokerProfiles: Array<TradeRow['broker_profile']> = ['tradovate-futures', 'manual', 'tradovate-futures', 'mexc-perps']
  const instrumentTypes: Array<TradeRow['instrument_type']> = ['futures', 'forex', 'futures', 'crypto']
  const accountTemplates: Array<TradeRow['account_template']> = ['us-futures', 'forex-london', 'us-futures', 'crypto-perps']
  const cryptoMarketTypes: Array<TradeRow['crypto_market_type']> = ['manual', 'manual', 'manual', 'perps']
  const quoteAssets: Array<TradeRow['quote_asset']> = [null, null, null, 'USDT']
  const leverages: Array<TradeRow['leverage']> = [null, null, null, '4']
  const executionTypes: Array<TradeRow['execution_type']> = ['manual', 'manual', 'manual', 'maker']
  const fundingDirections: Array<TradeRow['funding_direction']> = ['manual', 'manual', 'manual', 'received']
  const fundingRateBps: Array<TradeRow['funding_rate_bps']> = [null, null, null, '1.25']
  const fundingIntervals: Array<TradeRow['funding_intervals']> = [null, null, null, '2']
  const userCostProfileIds: Array<TradeRow['user_cost_profile_id']> = [null, null, null, 'demo-crypto-profile']
  const accountSizes: Array<TradeRow['account_size']> = ['25000', null, '25000', '12000']
  const marketTemplates: Array<TradeRow['market_template']> = ['nq-future', 'eurusd-london', 'es-future', 'btc-perps']
  const captureStatuses: Array<TradeRow['capture_status']> = ['complete', 'incomplete', 'complete', 'complete']
  const captureResults: Array<TradeRow['capture_result']> = ['winner', 'loser', 'winner', 'winner']

  return trades.map((trade, index) => ({
    id: trade.id,
    user_id: 'demo-user',
    created_at: normalizeTradeDate(trade.date).toISOString(),
    market: trade.market,
    setup: trade.setup,
    emotion: trade.emotion,
    bias: trade.result.startsWith('-') ? 'Short' : 'Long',
    rule_check: trade.id === '13 Mär 2026-EUR/USD' ? 'Zu früher Entry' : trade.id === '11 Mär 2026-BTC/USD' ? 'Kein Regelverstoß' : 'Regelkonform',
    entry: ['22114.5', '1.0844', '22813', '68240'][index] ?? '0',
    stop_loss: ['22082.0', '1.0860', '22792', '67980'][index] ?? '0',
    take_profit: ['22180.0', '1.0828', '22858', '68820'][index] ?? '0',
    exit: ['22168.0', '1.0832', '22841', '68620'][index] ?? null,
    net_pnl: index === 1 ? null : trade.result,
    risk_percent: ['0.5', '0.35', '0.5', '0.75'][index] ?? '0.5',
    account_size: accountSizes[index] ?? null,
    r_multiple: trade.r,
    pnl_mode: pnlModes[index] ?? 'manual',
    cost_profile: costProfiles[index] ?? 'manual',
    broker_profile: brokerProfiles[index] ?? 'manual',
    instrument_type: instrumentTypes[index] ?? 'unknown',
    account_template: accountTemplates[index] ?? 'manual',
    market_template: marketTemplates[index] ?? 'manual',
    position_size: ['2', '100000', '1', '0.35'][index] ?? '1',
    point_value: ['5', '10', '25', null][index] ?? '1',
    fees: ['3.2', '0.8', '2.9', '4.2'][index] ?? '0',
    exchange_fees: ['1.1', '0', '0.9', '0'][index] ?? '0',
    funding_fees: ['0', '0', '0', '-1.4'][index] ?? '0',
    funding_rate_bps: fundingRateBps[index] ?? null,
    funding_intervals: fundingIntervals[index] ?? null,
    spread_cost: ['0', '1.1', '0', '0.7'][index] ?? '0',
    slippage: ['0.9', '0.4', '0.8', '2.1'][index] ?? '0',
    account_currency: ['EUR', 'USD', 'EUR', 'USDT'][index] ?? 'EUR',
    crypto_market_type: cryptoMarketTypes[index] ?? 'manual',
    execution_type: executionTypes[index] ?? 'manual',
    funding_direction: fundingDirections[index] ?? 'manual',
    quote_asset: quoteAssets[index] ?? null,
    leverage: leverages[index] ?? null,
    user_cost_profile_id: userCostProfileIds[index] ?? null,
    capture_status: captureStatuses[index] ?? 'complete',
    capture_result: captureResults[index] ?? null,
    captured_at: normalizeTradeDate(trade.date).toISOString(),
    completed_at: (captureStatuses[index] ?? 'complete') === 'complete' ? normalizeTradeDate(trade.date).toISOString() : null,
    notes: trade.id === '14 Mär 2026-NASDAQ' ? 'Bestätigung abgewartet, Entry sauber, Exit diszipliniert vor Widerstand.' : trade.id === '13 Mär 2026-EUR/USD' ? 'Breakout im Chop zu früh gehandelt. Besser auf Bestätigung warten.' : 'Demo-Trade mit sauberem Kontext und Journaling-Grundlage.',
    screenshot_url: trade.id === '14 Mär 2026-NASDAQ' ? '/trade-screenshots/demo-trade-1.png' : trade.id === '13 Mär 2026-EUR/USD' ? '/trade-screenshots/demo-trade-2.png' : null,
    quality: trade.quality,
    session: trade.session,
    concept: trade.concept,
  }))
}

function buildMockTradeMediaRows(): TradeMediaRow[] {
  return buildMockTradeRows()
    .filter((trade) => trade.screenshot_url)
    .map((trade, index) => ({
      id: `trade-media-${trade.id}`,
      trade_id: trade.id,
      user_id: 'demo-user',
      created_at: trade.created_at,
      storage_path: `demo/${trade.id}-${index}.png`,
      public_url: trade.screenshot_url ?? '',
      file_name: `demo-${index + 1}.png`,
      mime_type: 'image/png',
      byte_size: null,
      sort_order: index,
      is_primary: true,
    }))
}

function buildMockSetupMediaRows(): SetupMediaRow[] {
  return [
    { id: 'setup-media-1', setup_id: 'setup-2', user_id: 'demo-user', created_at: '2026-03-02T08:00:00.000Z', storage_path: 'demo/setup/liquidity-sweep-1.png', public_url: '/setup-images/liquidity-sweep-1.png', file_name: 'liquidity-sweep-1.png', mime_type: 'image/png', byte_size: null, sort_order: 0, is_cover: true, caption: 'Sweep über das Hoch, Reclaim und sauberer Trigger.', media_role: 'best-practice' },
    { id: 'setup-media-2', setup_id: 'setup-2', user_id: 'demo-user', created_at: '2026-03-02T08:01:00.000Z', storage_path: 'demo/setup/liquidity-sweep-2.png', public_url: '/setup-images/liquidity-sweep-2.png', file_name: 'liquidity-sweep-2.png', mime_type: 'image/png', byte_size: null, sort_order: 1, is_cover: false, caption: 'Gegenbeispiel: Sweep ohne Bestätigung.', media_role: 'mistake' },
  ]
}

function getMockSnapshot(): JournalSnapshot { return { tradeRows: buildMockTradeRows(), tradeMediaRows: buildMockTradeMediaRows(), tradeTags, setupRows, setupMediaRows: buildMockSetupMediaRows(), dailyNotes, source: 'mock' } }
function getEmptySnapshot(): JournalSnapshot { return { tradeRows: [], tradeMediaRows: [], tradeTags: [], setupRows: [], setupMediaRows: [], dailyNotes: [], source: 'supabase' } }

export async function getJournalSnapshotServer(userId?: string | null): Promise<JournalSnapshot> {
  if (!hasSupabaseClientEnv()) return getMockSnapshot()

  try {
    const scopedUserId = userId ?? null
    const supabase = scopedUserId && hasSupabaseServerEnv()
      ? createSupabaseServerClient()
      : await createSupabaseAuthServerClient()

    if (!scopedUserId && hasSupabaseServerEnv()) return getEmptySnapshot()
    if (!scopedUserId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) return getEmptySnapshot()
      return getJournalSnapshotServer(user.id)
    }

    const { data: tradeRows, error: tradesError } = await supabase.from('trades').select('*').eq('user_id', scopedUserId).order('created_at', { ascending: false })
    if (tradesError || !tradeRows) {
      console.error('Trades fetch failed, returning empty snapshot:', tradesError?.message ?? 'unknown error')
      return getEmptySnapshot()
    }

    const tradeIds = (tradeRows as TradeRow[]).map((trade: TradeRow) => trade.id)
    const [tagsResponse, tradeMediaResponse, setupsResponse, setupMediaResponse, dailyNotesResponse] = await Promise.all([
      tradeIds.length ? supabase.from('trade_tags').select('*').in('trade_id', tradeIds).order('created_at', { ascending: true }) : Promise.resolve({ data: [], error: null }),
      tradeIds.length ? supabase.from('trade_media').select('*').in('trade_id', tradeIds).order('sort_order', { ascending: true }).order('created_at', { ascending: true }) : Promise.resolve({ data: [], error: null }),
      supabase.from('setups').select('*').eq('user_id', scopedUserId).order('sort_order', { ascending: true }).order('title', { ascending: true }),
      supabase.from('setup_media').select('*').eq('user_id', scopedUserId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('daily_notes').select('*').eq('user_id', scopedUserId).order('trade_date', { ascending: false }),
    ])

    const fallbackSetups: SetupRow[] = Array.from(
      new Map(
        (tradeRows as TradeRow[]).map((trade: TradeRow) => [
          trade.setup,
          {
            id: `setup-${trade.setup}`,
            user_id: scopedUserId,
            title: trade.setup,
            category: trade.concept ?? null,
            description: null,
            playbook: null,
            checklist: [],
            mistakes: [],
            cover_image_url: null,
            sort_order: null,
            is_archived: false,
            updated_at: null,
          } satisfies SetupRow,
        ]),
      ).values(),
    )

    return {
      tradeRows: tradeRows as TradeRow[],
      tradeTags: (tagsResponse.data ?? []) as TradeTag[],
      tradeMediaRows: (tradeMediaResponse.data ?? []) as TradeMediaRow[],
      setupRows: ((setupsResponse.data as SetupRow[] | null) ?? []).length ? ((setupsResponse.data ?? []) as SetupRow[]) : fallbackSetups,
      setupMediaRows: (setupMediaResponse.data ?? []) as SetupMediaRow[],
      dailyNotes: (dailyNotesResponse.data ?? []) as DailyNoteRow[],
      source: 'supabase',
    }
  } catch (error) {
    console.error('Journal snapshot failed:', error instanceof Error ? error.message : 'unknown error')
    return getEmptySnapshot()
  }
}

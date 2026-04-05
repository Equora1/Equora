import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { UserCostProfileRow } from '@/lib/types/db'
import type { SavedUserCostProfile } from '@/lib/types/user-cost-profile'
import {
  normalizeInstrumentType,
  normalizeTradeAccountTemplate,
  normalizeTradeBrokerProfile,
  normalizeTradeCostProfile,
  normalizeTradeCryptoMarketType,
  normalizeTradeExecutionType,
  normalizeTradeFundingDirection,
  normalizeTradeMarketTemplate,
  parseTradingNumber,
} from '@/lib/utils/calculations'

export function mapUserCostProfileRow(
  row: UserCostProfileRow,
  source: 'supabase' | 'mock' = 'supabase',
): SavedUserCostProfile {
  return {
    id: row.id,
    title: row.title,
    defaultAccountTemplate: row.default_account_template ? normalizeTradeAccountTemplate(row.default_account_template) : null,
    defaultMarketTemplate: row.default_market_template ? normalizeTradeMarketTemplate(row.default_market_template) : null,
    brokerProfile: normalizeTradeBrokerProfile(row.broker_profile),
    instrumentType: normalizeInstrumentType(row.instrument_type),
    costProfile: normalizeTradeCostProfile(row.cost_profile),
    accountCurrency: row.account_currency ?? null,
    cryptoMarketType: normalizeTradeCryptoMarketType(row.crypto_market_type),
    executionType: normalizeTradeExecutionType(row.execution_type),
    fundingDirection: normalizeTradeFundingDirection(row.funding_direction),
    quoteAsset: row.quote_asset ?? null,
    leverage: parseTradingNumber(row.leverage),
    pointValue: parseTradingNumber(row.point_value),
    fees: parseTradingNumber(row.fees),
    exchangeFees: parseTradingNumber(row.exchange_fees),
    fundingFees: parseTradingNumber(row.funding_fees),
    fundingRateBps: parseTradingNumber(row.funding_rate_bps),
    fundingIntervals: parseTradingNumber(row.funding_intervals),
    spreadCost: parseTradingNumber(row.spread_cost),
    slippage: parseTradingNumber(row.slippage),
    source,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

export async function getUserCostProfilesServer(userId?: string | null): Promise<SavedUserCostProfile[]> {
  if (!hasSupabaseClientEnv()) return []

  try {
    const scopedUserId = userId ?? null
    const supabase = scopedUserId && hasSupabaseServerEnv()
      ? createSupabaseServerClient()
      : await createSupabaseAuthServerClient()

    if (!scopedUserId && hasSupabaseServerEnv()) return []
    if (!scopedUserId) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.id) return []
      return getUserCostProfilesServer(user.id)
    }

    const { data, error } = await supabase
      .from('user_cost_profiles')
      .select('*')
      .eq('user_id', scopedUserId)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error || !data) {
      console.error('User cost profiles fetch failed:', error)
      return []
    }

    return (data as UserCostProfileRow[]).map((row) => mapUserCostProfileRow(row, 'supabase'))
  } catch (error) {
    console.error('User cost profiles fetch failed:', error)
    return []
  }
}

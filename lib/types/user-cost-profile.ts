import type {
  TradeAccountTemplate,
  TradeBrokerProfile,
  TradeCostProfile,
  TradeCryptoMarketType,
  TradeExecutionType,
  TradeFundingDirection,
  TradeInstrumentType,
  TradeMarketTemplate,
} from '@/lib/types/trade'

export type SavedUserCostProfile = {
  id: string
  title: string
  defaultAccountTemplate: TradeAccountTemplate | null
  defaultMarketTemplate: TradeMarketTemplate | null
  brokerProfile: TradeBrokerProfile
  instrumentType: TradeInstrumentType
  costProfile: TradeCostProfile
  accountCurrency: string | null
  cryptoMarketType: TradeCryptoMarketType
  executionType: TradeExecutionType
  fundingDirection: TradeFundingDirection
  quoteAsset: string | null
  leverage: number | null
  pointValue: number | null
  fees: number | null
  exchangeFees: number | null
  fundingFees: number | null
  fundingRateBps: number | null
  fundingIntervals: number | null
  spreadCost: number | null
  slippage: number | null
  source: 'supabase' | 'mock'
  createdAt: string
}

export type SaveUserCostProfileInput = {
  title: string
  defaultAccountTemplate: TradeAccountTemplate | null
  defaultMarketTemplate: TradeMarketTemplate | null
  brokerProfile: TradeBrokerProfile
  instrumentType: TradeInstrumentType
  costProfile: TradeCostProfile
  accountCurrency?: string | null
  cryptoMarketType?: TradeCryptoMarketType | null
  executionType?: TradeExecutionType | null
  fundingDirection?: TradeFundingDirection | null
  quoteAsset?: string | null
  leverage?: number | null
  pointValue?: number | null
  fees?: number | null
  exchangeFees?: number | null
  fundingFees?: number | null
  fundingRateBps?: number | null
  fundingIntervals?: number | null
  spreadCost?: number | null
  slippage?: number | null
}

export type UpdateUserCostProfileInput = SaveUserCostProfileInput

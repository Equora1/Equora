export type TradeQuality = 'A-Setup' | 'B-Setup' | 'C-Setup'
export type TradeCalculationSource = 'manual' | 'planned' | 'missing'
export type TradePnLSource = 'manual' | 'derived' | 'override' | 'missing'
export type TradePnLMode = 'manual' | 'auto' | 'override'
export type TradeCaptureStatus = 'incomplete' | 'complete'
export type TradeCaptureResult = 'winner' | 'loser' | 'breakeven' | 'open'
export type TradeCostProfile =
  | 'manual'
  | 'user-custom'
  | 'none'
  | 'stocks-light'
  | 'futures-standard'
  | 'forex-tight'
  | 'crypto-swing'
  | 'crypto-spot'
  | 'crypto-perps'
  | 'cfd-standard'
export type TradeInstrumentType = 'stocks' | 'futures' | 'forex' | 'crypto' | 'cfd' | 'unknown'
export type TradeCryptoMarketType = 'manual' | 'spot' | 'perps' | 'margin'
export type TradeExecutionType = 'manual' | 'maker' | 'taker' | 'mixed'
export type TradeFundingDirection = 'manual' | 'paid' | 'received' | 'flat'
export type TradeBrokerProfile =
  | 'manual'
  | 'ibkr-pro'
  | 'trade-republic'
  | 'tradovate-futures'
  | 'ftmo-cfd'
  | 'binance-spot'
  | 'coinbase-spot'
  | 'bybit-spot'
  | 'bybit-perps'
  | 'mexc-spot'
  | 'mexc-perps'
  | 'okx-perps'

export type TradeAccountTemplate =
  | 'manual'
  | 'swing-europe'
  | 'us-futures'
  | 'forex-london'
  | 'crypto-spot'
  | 'crypto-perps'
  | 'prop-index'

export type TradeMarketTemplate =
  | 'manual'
  | 'dax-cfd'
  | 'nq-future'
  | 'es-future'
  | 'eurusd-london'
  | 'btc-spot'
  | 'eth-spot'
  | 'btc-perps'
  | 'eth-perps'
  | 'spy-swing'

export type Trade = {
  id: string
  date: string
  createdAt?: string
  market: string
  setup: string
  result: string
  r: string
  emotion: string
  quality: TradeQuality
  session: string
  concept: string
  netPnL?: number
  autoNetPnL?: number | null
  grossPnL?: number | null
  totalCosts?: number
  fees?: number | null
  exchangeFees?: number | null
  fundingFees?: number | null
  spreadCost?: number | null
  slippage?: number | null
  fundingRateBps?: number | null
  fundingIntervals?: number | null
  rValue?: number
  rMultiple?: number | null
  priceRisk?: number | null
  plannedReward?: number | null
  riskRewardRatio?: number | null
  riskAmount?: number | null
  riskPercent?: number | null
  plannedRiskAmount?: number | null
  actualRiskPercent?: number | null
  exposure?: number | null
  marginUsed?: number | null
  accountSize?: number | null
  partialExits?: Array<{ percent: number; price: number }> | null
  partialExitCoveragePercent?: number | null
  partialExitRemainderPercent?: number | null
  partialExitRealizedSize?: number | null
  partialExitRemainingSize?: number | null
  partialExitHasOpenRemainder?: boolean
  effectiveExit?: number | null
  direction?: 'long' | 'short' | 'neutral'
  rSource?: TradeCalculationSource
  pnlSource?: TradePnLSource
  pnlMode?: TradePnLMode
  costProfile?: TradeCostProfile
  brokerProfile?: TradeBrokerProfile
  accountTemplate?: TradeAccountTemplate
  marketTemplate?: TradeMarketTemplate
  accountCurrency?: string | null
  positionSize?: number | null
  pointValue?: number | null
  instrumentType?: TradeInstrumentType
  cryptoMarketType?: TradeCryptoMarketType | null
  executionType?: TradeExecutionType | null
  fundingDirection?: TradeFundingDirection | null
  quoteAsset?: string | null
  leverage?: number | null
  userCostProfileId?: string | null
  userCostProfileLabel?: string | null
  captureStatus?: TradeCaptureStatus
  captureResult?: TradeCaptureResult | null
  capturedAt?: string
  completedAt?: string | null
  isComplete?: boolean
  screenshotUrl?: string
  screenshotUrls?: string[]
  screenshotCount?: number
  ruleCheck?: string
  reviewRepeatability?: string
  reviewState?: string
  reviewLesson?: string
}

export type TradeDetail = {
  title: string
  date: string
  result: string
  pnl: string
  emotion: string
  setup: string
  quality: TradeQuality
  ruleCheck: string
  lesson: string
  reviewRepeatability?: string
  reviewState?: string
  reviewLesson?: string
  screenshotUrl?: string
  screenshotUrls?: string[]
  screenshotCount?: number
  direction?: string
  riskReward?: string
  riskAmount?: string
  priceRisk?: string
  rSourceLabel?: string
  pnlSourceLabel?: string
  pnlModeLabel?: string
  instrumentLabel?: string
  costLabel?: string
  costProfileLabel?: string
  brokerProfileLabel?: string
  accountTemplateLabel?: string
  marketTemplateLabel?: string
  userCostProfileLabel?: string
  sizeLabel?: string
  marginLabel?: string
  riskPlanLabel?: string
  accountRiskLabel?: string
  partialExitsLabel?: string
  partialExitCoverageLabel?: string
  partialExitRealizedLabel?: string
  partialExitRemainingLabel?: string
  partialExitStateLabel?: string
  effectiveExitLabel?: string
  executionLabel?: string
  cryptoLabel?: string
  captureStatusLabel?: string
  captureTrustLabel?: string
  captureResultLabel?: string
}

export type FilterState = {
  session: string
  concept: string
  quality: string
  emotion: string
  setup: string
}

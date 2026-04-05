import type {
  TradeAccountTemplate,
  TradeBrokerProfile,
  TradeCostProfile,
  TradeCryptoMarketType,
  TradeExecutionType,
  TradeFundingDirection,
  TradeInstrumentType,
  TradeMarketTemplate,
  TradePnLMode,
} from '@/lib/types/trade'
import {
  normalizeTradeAccountTemplate,
  normalizeTradeMarketTemplate,
} from '@/lib/utils/trade-preset-normalizers'

export type TradeAccountTemplatePreset = {
  value: TradeAccountTemplate
  label: string
  description: string
  defaultBrokerProfile: TradeBrokerProfile
  defaultInstrumentType: TradeInstrumentType
  defaultCostProfile: TradeCostProfile
  defaultCurrency: string
  defaultPointValue: number | null
  defaultPnLMode: TradePnLMode
  defaultCryptoMarketType: TradeCryptoMarketType
  defaultExecutionType: TradeExecutionType
  defaultFundingDirection: TradeFundingDirection
  defaultFundingRateBps: number | null
  defaultFundingIntervals: number | null
  defaultMakerFeeBps: number | null
  defaultTakerFeeBps: number | null
  defaultQuoteAsset: string | null
  defaultLeverage: number | null
  focus: string
}

const accountTemplates: Record<TradeAccountTemplate, TradeAccountTemplatePreset> = {
  manual: {
    value: 'manual',
    label: 'Manuell / frei',
    description: 'Kein vorverdrahteter Account. Alles bleibt frei steuerbar.',
    defaultBrokerProfile: 'manual',
    defaultInstrumentType: 'unknown',
    defaultCostProfile: 'manual',
    defaultCurrency: 'EUR',
    defaultPointValue: null,
    defaultPnLMode: 'manual',
    defaultCryptoMarketType: 'manual',
    defaultExecutionType: 'manual',
    defaultFundingDirection: 'manual',
    defaultFundingRateBps: null,
    defaultFundingIntervals: null,
    defaultMakerFeeBps: null,
    defaultTakerFeeBps: null,
    defaultQuoteAsset: null,
    defaultLeverage: null,
    focus: 'Gut für Imports, Backfills oder exotische Produkte.',
  },
  'swing-europe': {
    value: 'swing-europe',
    label: 'Swing Europa',
    description: 'Aktien-/ETF-Account für ruhige Swing-Trades in EUR.',
    defaultBrokerProfile: 'trade-republic',
    defaultInstrumentType: 'stocks',
    defaultCostProfile: 'stocks-light',
    defaultCurrency: 'EUR',
    defaultPointValue: null,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'manual',
    defaultExecutionType: 'manual',
    defaultFundingDirection: 'manual',
    defaultFundingRateBps: null,
    defaultFundingIntervals: null,
    defaultMakerFeeBps: null,
    defaultTakerFeeBps: null,
    defaultQuoteAsset: null,
    defaultLeverage: null,
    focus: 'Für Aktien, ETFs und mittel-lange Haltezeiten.',
  },
  'us-futures': {
    value: 'us-futures',
    label: 'US Futures',
    description: 'Index-/Future-Account mit klarer Punktwert-Logik und Kommissionsblock.',
    defaultBrokerProfile: 'tradovate-futures',
    defaultInstrumentType: 'futures',
    defaultCostProfile: 'futures-standard',
    defaultCurrency: 'USD',
    defaultPointValue: 5,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'manual',
    defaultExecutionType: 'manual',
    defaultFundingDirection: 'manual',
    defaultFundingRateBps: null,
    defaultFundingIntervals: null,
    defaultMakerFeeBps: null,
    defaultTakerFeeBps: null,
    defaultQuoteAsset: null,
    defaultLeverage: null,
    focus: 'Ideal für NQ, ES oder MNQ/MES-ähnliche Setups.',
  },
  'forex-london': {
    value: 'forex-london',
    label: 'Forex London',
    description: 'FX-Account mit engem Spread-Setup rund um EUR/USD & Co.',
    defaultBrokerProfile: 'manual',
    defaultInstrumentType: 'forex',
    defaultCostProfile: 'forex-tight',
    defaultCurrency: 'USD',
    defaultPointValue: 10,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'manual',
    defaultExecutionType: 'manual',
    defaultFundingDirection: 'manual',
    defaultFundingRateBps: null,
    defaultFundingIntervals: null,
    defaultMakerFeeBps: null,
    defaultTakerFeeBps: null,
    defaultQuoteAsset: null,
    defaultLeverage: null,
    focus: 'Für London/NY-Session mit Pip-Wert-Logik.',
  },
  'crypto-spot': {
    value: 'crypto-spot',
    label: 'Crypto Spot',
    description: 'Spot-Krypto-Account mit Coin-Größe, Trading-Fee und Quote-Asset im Fokus.',
    defaultBrokerProfile: 'binance-spot',
    defaultInstrumentType: 'crypto',
    defaultCostProfile: 'crypto-spot',
    defaultCurrency: 'USDT',
    defaultPointValue: null,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'spot',
    defaultExecutionType: 'taker',
    defaultFundingDirection: 'flat',
    defaultFundingRateBps: 0,
    defaultFundingIntervals: 0,
    defaultMakerFeeBps: 10,
    defaultTakerFeeBps: 10,
    defaultQuoteAsset: 'USDT',
    defaultLeverage: 1,
    focus: 'Für BTC, ETH und andere Spot-Trades ohne Funding-Komponente.',
  },
  'crypto-perps': {
    value: 'crypto-perps',
    label: 'Crypto Perps',
    description: 'Perpetual-Futures-Account mit Funding- und Slippage-Fokus.',
    defaultBrokerProfile: 'bybit-perps',
    defaultInstrumentType: 'crypto',
    defaultCostProfile: 'crypto-perps',
    defaultCurrency: 'USDT',
    defaultPointValue: 1,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'perps',
    defaultExecutionType: 'taker',
    defaultFundingDirection: 'paid',
    defaultFundingRateBps: 1.5,
    defaultFundingIntervals: 1,
    defaultMakerFeeBps: 2,
    defaultTakerFeeBps: 5.5,
    defaultQuoteAsset: 'USDT',
    defaultLeverage: 5,
    focus: 'Für Perps, Funding und volatile Execution.',
  },
  'prop-index': {
    value: 'prop-index',
    label: 'Prop Index CFD',
    description: 'Prop-/CFD-Account mit Spread- und Overnight-Fokus.',
    defaultBrokerProfile: 'ftmo-cfd',
    defaultInstrumentType: 'cfd',
    defaultCostProfile: 'cfd-standard',
    defaultCurrency: 'USD',
    defaultPointValue: 1,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'manual',
    defaultExecutionType: 'manual',
    defaultFundingDirection: 'manual',
    defaultFundingRateBps: null,
    defaultFundingIntervals: null,
    defaultMakerFeeBps: null,
    defaultTakerFeeBps: null,
    defaultQuoteAsset: null,
    defaultLeverage: null,
    focus: 'Für DAX, NASDAQ oder Dow als Prop-/CFD-Setup.',
  },
}

export function getTradeAccountTemplatePreset(template?: string | null): TradeAccountTemplatePreset {
  return accountTemplates[normalizeTradeAccountTemplate(template)]
}

export function getAccountTemplateLabel(template?: string | null): string {
  return getTradeAccountTemplatePreset(template).label
}

export type TradeMarketTemplatePreset = {
  value: TradeMarketTemplate
  label: string
  market: string
  description: string
  linkedAccountTemplate: TradeAccountTemplate
  defaultBrokerProfile: TradeBrokerProfile
  defaultInstrumentType: TradeInstrumentType
  defaultCostProfile: TradeCostProfile
  defaultCurrency: string
  defaultPointValue: number | null
  defaultPnLMode: TradePnLMode
  defaultCryptoMarketType: TradeCryptoMarketType
  defaultExecutionType: TradeExecutionType
  defaultFundingDirection: TradeFundingDirection
  defaultFundingRateBps: number | null
  defaultFundingIntervals: number | null
  defaultMakerFeeBps: number | null
  defaultTakerFeeBps: number | null
  defaultQuoteAsset: string | null
  defaultLeverage: number | null
}

const marketTemplates: Record<TradeMarketTemplate, TradeMarketTemplatePreset> = {
  manual: {
    value: 'manual',
    label: 'Kein Markt-Template',
    market: '',
    description: 'Kein Markt-Makro. Werte bleiben frei.',
    linkedAccountTemplate: 'manual',
    defaultBrokerProfile: 'manual',
    defaultInstrumentType: 'unknown',
    defaultCostProfile: 'manual',
    defaultCurrency: 'EUR',
    defaultPointValue: null,
    defaultPnLMode: 'manual',
    defaultCryptoMarketType: 'manual',
    defaultExecutionType: 'manual',
    defaultFundingDirection: 'manual',
    defaultFundingRateBps: null,
    defaultFundingIntervals: null,
    defaultMakerFeeBps: null,
    defaultTakerFeeBps: null,
    defaultQuoteAsset: null,
    defaultLeverage: null,
  },
  'dax-cfd': {
    value: 'dax-cfd',
    label: 'DAX CFD',
    market: 'DAX',
    description: 'CFD-Indextemplate mit Prop-/Spread-Fokus.',
    linkedAccountTemplate: 'prop-index',
    defaultBrokerProfile: 'ftmo-cfd',
    defaultInstrumentType: 'cfd',
    defaultCostProfile: 'cfd-standard',
    defaultCurrency: 'EUR',
    defaultPointValue: 1,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'manual',
    defaultExecutionType: 'manual',
    defaultFundingDirection: 'manual',
    defaultFundingRateBps: null,
    defaultFundingIntervals: null,
    defaultMakerFeeBps: null,
    defaultTakerFeeBps: null,
    defaultQuoteAsset: null,
    defaultLeverage: null,
  },
  'nq-future': {
    value: 'nq-future',
    label: 'NQ Future',
    market: 'NASDAQ',
    description: 'Future-Template für NQ/MNQ mit US-Futures-Logik.',
    linkedAccountTemplate: 'us-futures',
    defaultBrokerProfile: 'tradovate-futures',
    defaultInstrumentType: 'futures',
    defaultCostProfile: 'futures-standard',
    defaultCurrency: 'USD',
    defaultPointValue: 5,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'manual',
    defaultExecutionType: 'manual',
    defaultFundingDirection: 'manual',
    defaultFundingRateBps: null,
    defaultFundingIntervals: null,
    defaultMakerFeeBps: null,
    defaultTakerFeeBps: null,
    defaultQuoteAsset: null,
    defaultLeverage: null,
  },
  'es-future': {
    value: 'es-future',
    label: 'ES Future',
    market: 'S&P 500',
    description: 'Future-Template für ES/MES mit etwas sanfterem Punktwert.',
    linkedAccountTemplate: 'us-futures',
    defaultBrokerProfile: 'tradovate-futures',
    defaultInstrumentType: 'futures',
    defaultCostProfile: 'futures-standard',
    defaultCurrency: 'USD',
    defaultPointValue: 12.5,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'manual',
    defaultExecutionType: 'manual',
    defaultFundingDirection: 'manual',
    defaultFundingRateBps: null,
    defaultFundingIntervals: null,
    defaultMakerFeeBps: null,
    defaultTakerFeeBps: null,
    defaultQuoteAsset: null,
    defaultLeverage: null,
  },
  'eurusd-london': {
    value: 'eurusd-london',
    label: 'EUR/USD London',
    market: 'EUR/USD',
    description: 'FX-Template für den London/NY-Overlap mit engem Spread-Profil.',
    linkedAccountTemplate: 'forex-london',
    defaultBrokerProfile: 'manual',
    defaultInstrumentType: 'forex',
    defaultCostProfile: 'forex-tight',
    defaultCurrency: 'USD',
    defaultPointValue: 10,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'manual',
    defaultExecutionType: 'manual',
    defaultFundingDirection: 'manual',
    defaultFundingRateBps: null,
    defaultFundingIntervals: null,
    defaultMakerFeeBps: null,
    defaultTakerFeeBps: null,
    defaultQuoteAsset: null,
    defaultLeverage: null,
  },
  'btc-spot': {
    value: 'btc-spot',
    label: 'BTC Spot',
    market: 'BTC/USDT',
    description: 'Spot-Template für BTC mit Coin-Größe und ohne Funding-Komponente.',
    linkedAccountTemplate: 'crypto-spot',
    defaultBrokerProfile: 'binance-spot',
    defaultInstrumentType: 'crypto',
    defaultCostProfile: 'crypto-spot',
    defaultCurrency: 'USDT',
    defaultPointValue: null,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'spot',
    defaultExecutionType: 'taker',
    defaultFundingDirection: 'flat',
    defaultFundingRateBps: 0,
    defaultFundingIntervals: 0,
    defaultMakerFeeBps: 10,
    defaultTakerFeeBps: 10,
    defaultQuoteAsset: 'USDT',
    defaultLeverage: 1,
  },
  'eth-spot': {
    value: 'eth-spot',
    label: 'ETH Spot',
    market: 'ETH/USDT',
    description: 'Spot-Template für ETH mit klassischer Coin-Größe.',
    linkedAccountTemplate: 'crypto-spot',
    defaultBrokerProfile: 'binance-spot',
    defaultInstrumentType: 'crypto',
    defaultCostProfile: 'crypto-spot',
    defaultCurrency: 'USDT',
    defaultPointValue: null,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'spot',
    defaultExecutionType: 'taker',
    defaultFundingDirection: 'flat',
    defaultFundingRateBps: 0,
    defaultFundingIntervals: 0,
    defaultMakerFeeBps: 10,
    defaultTakerFeeBps: 10,
    defaultQuoteAsset: 'USDT',
    defaultLeverage: 1,
  },
  'btc-perps': {
    value: 'btc-perps',
    label: 'BTC Perps',
    market: 'BTC/USD',
    description: 'Perps-Template mit Funding und volatiler Ausführung im Blick.',
    linkedAccountTemplate: 'crypto-perps',
    defaultBrokerProfile: 'bybit-perps',
    defaultInstrumentType: 'crypto',
    defaultCostProfile: 'crypto-perps',
    defaultCurrency: 'USDT',
    defaultPointValue: 1,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'perps',
    defaultExecutionType: 'taker',
    defaultFundingDirection: 'paid',
    defaultFundingRateBps: 1.5,
    defaultFundingIntervals: 1,
    defaultMakerFeeBps: 2,
    defaultTakerFeeBps: 5.5,
    defaultQuoteAsset: 'USDT',
    defaultLeverage: 5,
  },
  'eth-perps': {
    value: 'eth-perps',
    label: 'ETH Perps',
    market: 'ETH/USD',
    description: 'Perps-Template für ETH mit Funding-Block und leicht engerem Kostenprofil.',
    linkedAccountTemplate: 'crypto-perps',
    defaultBrokerProfile: 'bybit-perps',
    defaultInstrumentType: 'crypto',
    defaultCostProfile: 'crypto-perps',
    defaultCurrency: 'USDT',
    defaultPointValue: 1,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'perps',
    defaultExecutionType: 'taker',
    defaultFundingDirection: 'paid',
    defaultFundingRateBps: 1.25,
    defaultFundingIntervals: 1,
    defaultMakerFeeBps: 2,
    defaultTakerFeeBps: 5.5,
    defaultQuoteAsset: 'USDT',
    defaultLeverage: 4,
  },
  'spy-swing': {
    value: 'spy-swing',
    label: 'SPY Swing',
    market: 'SPY',
    description: 'Aktien-/ETF-Template für ruhigere Swing-Positionsgrößen.',
    linkedAccountTemplate: 'swing-europe',
    defaultBrokerProfile: 'ibkr-pro',
    defaultInstrumentType: 'stocks',
    defaultCostProfile: 'stocks-light',
    defaultCurrency: 'USD',
    defaultPointValue: null,
    defaultPnLMode: 'auto',
    defaultCryptoMarketType: 'manual',
    defaultExecutionType: 'manual',
    defaultFundingDirection: 'manual',
    defaultFundingRateBps: null,
    defaultFundingIntervals: null,
    defaultMakerFeeBps: null,
    defaultTakerFeeBps: null,
    defaultQuoteAsset: null,
    defaultLeverage: null,
  },
}

export function getTradeMarketTemplatePreset(template?: string | null): TradeMarketTemplatePreset {
  return marketTemplates[normalizeTradeMarketTemplate(template)]
}

export function getMarketTemplateLabel(template?: string | null): string {
  return getTradeMarketTemplatePreset(template).label
}

export const accountTemplateOptions: Array<{ value: TradeAccountTemplate; label: string }> = [
  { value: 'manual', label: 'Manuell / frei' },
  { value: 'swing-europe', label: 'Swing Europa' },
  { value: 'us-futures', label: 'US Futures' },
  { value: 'forex-london', label: 'Forex London' },
  { value: 'crypto-spot', label: 'Crypto Spot' },
  { value: 'crypto-perps', label: 'Crypto Perps' },
  { value: 'prop-index', label: 'Prop Index CFD' },
]

export const marketTemplateOptions: Array<{ value: TradeMarketTemplate; label: string }> = [
  { value: 'manual', label: 'Kein Markt-Template' },
  { value: 'dax-cfd', label: 'DAX CFD' },
  { value: 'nq-future', label: 'NQ Future' },
  { value: 'es-future', label: 'ES Future' },
  { value: 'eurusd-london', label: 'EUR/USD London' },
  { value: 'btc-spot', label: 'BTC Spot' },
  { value: 'eth-spot', label: 'ETH Spot' },
  { value: 'btc-perps', label: 'BTC Perps' },
  { value: 'eth-perps', label: 'ETH Perps' },
  { value: 'spy-swing', label: 'SPY Swing' },
]

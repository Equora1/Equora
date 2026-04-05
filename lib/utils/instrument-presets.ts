import type {
  TradeCostProfile,
  TradeCryptoMarketType,
  TradeExecutionType,
  TradeFundingDirection,
  TradeInstrumentType,
  TradePnLMode,
} from '@/lib/types/trade'
import { normalizeInstrumentType } from '@/lib/utils/trade-preset-normalizers'

export type TradeInstrumentPreset = {
  type: TradeInstrumentType
  label: string
  defaultPointValue: number | null
  defaultCurrency: string
  defaultPnLMode: TradePnLMode
  defaultCostProfile: TradeCostProfile
  sizeHint: string
  helper: string
}

const instrumentPresets: Record<TradeInstrumentType, TradeInstrumentPreset> = {
  stocks: {
    type: 'stocks',
    label: 'Aktie / ETF',
    defaultPointValue: null,
    defaultCurrency: 'EUR',
    defaultPnLMode: 'auto',
    defaultCostProfile: 'stocks-light',
    sizeHint: 'Stückzahl',
    helper: 'Preisbewegung × Stückzahl. Gebühren meist klein, Slippage moderat.',
  },
  futures: {
    type: 'futures',
    label: 'Future',
    defaultPointValue: 5,
    defaultCurrency: 'EUR',
    defaultPnLMode: 'auto',
    defaultCostProfile: 'futures-standard',
    sizeHint: 'Kontrakte',
    helper: 'Preisbewegung × Kontrakte × Punktwert. Ideal für automatische Berechnung.',
  },
  forex: {
    type: 'forex',
    label: 'Forex',
    defaultPointValue: 10,
    defaultCurrency: 'USD',
    defaultPnLMode: 'auto',
    defaultCostProfile: 'forex-tight',
    sizeHint: 'Lots / Units',
    helper: 'Preisbewegung × Size × Pip-Wert. Spread-/Slippage-Kosten sauber mitdenken.',
  },
  crypto: {
    type: 'crypto',
    label: 'Krypto',
    defaultPointValue: null,
    defaultCurrency: 'USDT',
    defaultPnLMode: 'auto',
    defaultCostProfile: 'crypto-spot',
    sizeHint: 'Coins / Contracts',
    helper: 'Preisbewegung × Coin-Größe. Gebühren und Slippage können spürbar sein.',
  },
  cfd: {
    type: 'cfd',
    label: 'CFD',
    defaultPointValue: 1,
    defaultCurrency: 'EUR',
    defaultPnLMode: 'auto',
    defaultCostProfile: 'cfd-standard',
    sizeHint: 'Lots / Units',
    helper: 'Meist Preisbewegung × Size × Punktwert, dazu Brokerkosten und Slippage.',
  },
  unknown: {
    type: 'unknown',
    label: 'Unbekannt / manuell',
    defaultPointValue: null,
    defaultCurrency: 'EUR',
    defaultPnLMode: 'manual',
    defaultCostProfile: 'manual',
    sizeHint: 'manuell',
    helper: 'Wenn die Instrumentlogik unklar ist, lieber Net P&L manuell hinterlegen.',
  },
}

export function getTradeInstrumentPreset(type?: string | null): TradeInstrumentPreset {
  return instrumentPresets[normalizeInstrumentType(type)]
}

export function getInstrumentLabel(type?: string | null): string {
  return getTradeInstrumentPreset(type).label
}

export const instrumentOptions: Array<{ value: TradeInstrumentType; label: string }> = [
  { value: 'stocks', label: 'Aktie / ETF' },
  { value: 'futures', label: 'Future' },
  { value: 'forex', label: 'Forex' },
  { value: 'crypto', label: 'Krypto' },
  { value: 'cfd', label: 'CFD' },
  { value: 'unknown', label: 'Unbekannt / manuell' },
]

export const pnlModes: Array<{ value: TradePnLMode; label: string }> = [
  { value: 'auto', label: 'Automatisch berechnen' },
  { value: 'override', label: 'Automatik + Override' },
  { value: 'manual', label: 'Nur manuell' },
]

export const cryptoMarketTypeOptions: Array<{ value: TradeCryptoMarketType; label: string }> = [
  { value: 'spot', label: 'Spot' },
  { value: 'perps', label: 'Perps' },
  { value: 'margin', label: 'Margin' },
  { value: 'manual', label: 'Manuell' },
]

export const executionTypeOptions: Array<{ value: TradeExecutionType; label: string }> = [
  { value: 'maker', label: 'Maker' },
  { value: 'taker', label: 'Taker' },
  { value: 'mixed', label: 'Gemischt' },
  { value: 'manual', label: 'Manuell' },
]

export const fundingDirectionOptions: Array<{ value: TradeFundingDirection; label: string }> = [
  { value: 'paid', label: 'Bezahlt' },
  { value: 'received', label: 'Erhalten' },
  { value: 'flat', label: 'Kein Funding' },
  { value: 'manual', label: 'Manuell' },
]

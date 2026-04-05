import type { TradeCostProfile } from '@/lib/types/trade'
import { normalizeTradeCostProfile } from '@/lib/utils/trade-preset-normalizers'

export type TradeCostProfilePreset = {
  value: TradeCostProfile
  label: string
  defaultFees: number | null
  defaultExchangeFees: number | null
  defaultFundingFees: number | null
  defaultSpreadCost: number | null
  defaultSlippage: number | null
  description: string
}

const costProfiles: Record<TradeCostProfile, TradeCostProfilePreset> = {
  manual: {
    value: 'manual',
    label: 'Manuell',
    defaultFees: null,
    defaultExchangeFees: null,
    defaultFundingFees: null,
    defaultSpreadCost: null,
    defaultSlippage: null,
    description: 'Kommission, Börsengebühren, Funding, Spread und Slippage frei erfassen.',
  },
  'user-custom': {
    value: 'user-custom',
    label: 'Eigenes Kostenprofil',
    defaultFees: null,
    defaultExchangeFees: null,
    defaultFundingFees: null,
    defaultSpreadCost: null,
    defaultSlippage: null,
    description: 'Vom Nutzer gespeichertes Profil. Werte kommen aus dem Profil selbst statt aus einem starren Preset.',
  },
  none: {
    value: 'none',
    label: 'Keine Kosten',
    defaultFees: 0,
    defaultExchangeFees: 0,
    defaultFundingFees: 0,
    defaultSpreadCost: 0,
    defaultSlippage: 0,
    description: 'Alle Kostenblöcke werden auf null gesetzt.',
  },
  'stocks-light': {
    value: 'stocks-light',
    label: 'Aktie leicht',
    defaultFees: 1,
    defaultExchangeFees: 0.2,
    defaultFundingFees: 0,
    defaultSpreadCost: 0.2,
    defaultSlippage: 0.15,
    description: 'Leichtes Aktien-/ETF-Profil mit kleiner Kommission und moderatem Market-Impact.',
  },
  'futures-standard': {
    value: 'futures-standard',
    label: 'Future Standard',
    defaultFees: 3.4,
    defaultExchangeFees: 1.1,
    defaultFundingFees: 0,
    defaultSpreadCost: 0,
    defaultSlippage: 0.8,
    description: 'Kontraktlastiges Future-Profil mit klar getrennten Commission-/Exchange-Kosten.',
  },
  'forex-tight': {
    value: 'forex-tight',
    label: 'Forex Tight',
    defaultFees: 0.8,
    defaultExchangeFees: 0,
    defaultFundingFees: 0,
    defaultSpreadCost: 1.1,
    defaultSlippage: 0.25,
    description: 'FX-Profil mit engem Spread, kleiner Kommission und wenig Slippage.',
  },
  'crypto-swing': {
    value: 'crypto-swing',
    label: 'Krypto Swing (Legacy)',
    defaultFees: 4.5,
    defaultExchangeFees: 0,
    defaultFundingFees: 1.5,
    defaultSpreadCost: 0.8,
    defaultSlippage: 2.2,
    description: 'Legacy-Krypto-Profil. Für ältere Trades kompatibel, neue Trades besser explizit als Spot oder Perps führen.',
  },
  'crypto-spot': {
    value: 'crypto-spot',
    label: 'Krypto Spot',
    defaultFees: null,
    defaultExchangeFees: 0,
    defaultFundingFees: 0,
    defaultSpreadCost: 0.45,
    defaultSlippage: 1.4,
    description: 'Spot-Krypto ohne Funding. Trading-Fee, Spread und Slippage stehen im Vordergrund.',
  },
  'crypto-perps': {
    value: 'crypto-perps',
    label: 'Krypto Perps',
    defaultFees: null,
    defaultExchangeFees: 0,
    defaultFundingFees: null,
    defaultSpreadCost: 0.35,
    defaultSlippage: 1.2,
    description: 'Perpetual-Futures-Profil mit Funding, Trading-Fee und volatiler Execution.',
  },
  'cfd-standard': {
    value: 'cfd-standard',
    label: 'CFD Standard',
    defaultFees: 0,
    defaultExchangeFees: 0,
    defaultFundingFees: 0.6,
    defaultSpreadCost: 1.4,
    defaultSlippage: 0.9,
    description: 'CFD-Profil mit stärkerem Spread-/Overnight-Charakter statt klassischer Kommission.',
  },
}

export function getTradeCostProfilePreset(profile?: string | null): TradeCostProfilePreset {
  return costProfiles[normalizeTradeCostProfile(profile)]
}

export function getCostProfileLabel(profile?: string | null): string {
  return getTradeCostProfilePreset(profile).label
}

export const costProfileOptions: Array<{ value: TradeCostProfile; label: string }> = [
  { value: 'manual', label: 'Manuell' },
  { value: 'user-custom', label: 'Eigenes Nutzerprofil' },
  { value: 'none', label: 'Keine Kosten' },
  { value: 'stocks-light', label: 'Aktie leicht' },
  { value: 'futures-standard', label: 'Future Standard' },
  { value: 'forex-tight', label: 'Forex Tight' },
  { value: 'crypto-swing', label: 'Krypto Swing (Legacy)' },
  { value: 'crypto-spot', label: 'Krypto Spot' },
  { value: 'crypto-perps', label: 'Krypto Perps' },
  { value: 'cfd-standard', label: 'CFD Standard' },
]

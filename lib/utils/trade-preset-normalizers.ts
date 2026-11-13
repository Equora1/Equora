import { journalText, type JournalLocale } from '@/lib/i18n/journal'
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

function sanitizePresetNumberString(value: string | number): string {
  const stripped = String(value)
    .replace(/[€$£¥%Rr]/g, '')
    .replace(/\s/g, '')
    .trim()

  if (!stripped) return ''

  const hasComma = stripped.includes(',')
  const hasDot = stripped.includes('.')

  if (hasComma && hasDot) {
    const lastComma = stripped.lastIndexOf(',')
    const lastDot = stripped.lastIndexOf('.')

    if (lastComma > lastDot) {
      return stripped.replace(/\./g, '').replace(',', '.')
    }

    return stripped.replace(/,/g, '')
  }

  if (hasComma) {
    return stripped.replace(/\./g, '').replace(',', '.')
  }

  return stripped
}

function parsePresetNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(sanitizePresetNumberString(value))
  return Number.isFinite(numeric) ? numeric : null
}

export function normalizeInstrumentType(value?: string | null): TradeInstrumentType {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'stocks' || normalized === 'stock') return 'stocks'
  if (normalized === 'futures' || normalized === 'future') return 'futures'
  if (normalized === 'forex' || normalized === 'fx') return 'forex'
  if (normalized === 'crypto') return 'crypto'
  if (normalized === 'cfd') return 'cfd'
  return 'unknown'
}

export function normalizeTradeCryptoMarketType(value?: string | null): TradeCryptoMarketType {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'spot' || normalized === 'perps' || normalized === 'margin') return normalized
  return 'manual'
}

export function normalizeTradeExecutionType(value?: string | null): TradeExecutionType {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'maker' || normalized === 'taker' || normalized === 'mixed') return normalized
  return 'manual'
}

export function normalizeTradeFundingDirection(value?: string | null): TradeFundingDirection {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'paid' || normalized === 'received' || normalized === 'flat') return normalized
  return 'manual'
}

export function normalizeTradePnLMode(value?: string | null, explicitPnL?: string | number | null): TradePnLMode {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'manual') return 'manual'
  if (normalized === 'override') return 'override'
  if (normalized === 'auto') return 'auto'
  return parsePresetNumber(explicitPnL) !== null ? 'manual' : 'auto'
}

export function normalizeTradeCostProfile(value?: string | null): TradeCostProfile {
  const normalized = (value ?? '').trim().toLowerCase()
  if (
    normalized === 'manual' ||
    normalized === 'user-custom' ||
    normalized === 'none' ||
    normalized === 'stocks-light' ||
    normalized === 'futures-standard' ||
    normalized === 'forex-tight' ||
    normalized === 'crypto-swing' ||
    normalized === 'crypto-spot' ||
    normalized === 'crypto-perps' ||
    normalized === 'cfd-standard'
  ) {
    return normalized
  }

  return 'manual'
}

export function normalizeTradeBrokerProfile(value?: string | null): TradeBrokerProfile {
  const normalized = (value ?? '').trim().toLowerCase()
  if (
    normalized === 'manual' ||
    normalized === 'ibkr-pro' ||
    normalized === 'trade-republic' ||
    normalized === 'tradovate-futures' ||
    normalized === 'ftmo-cfd' ||
    normalized === 'binance-spot' ||
    normalized === 'coinbase-spot' ||
    normalized === 'bybit-spot' ||
    normalized === 'bybit-perps' ||
    normalized === 'mexc-spot' ||
    normalized === 'mexc-perps' ||
    normalized === 'okx-perps'
  ) {
    return normalized
  }

  return 'manual'
}

export function normalizeTradeAccountTemplate(value?: string | null): TradeAccountTemplate {
  const normalized = (value ?? '').trim().toLowerCase()
  if (
    normalized === 'manual' ||
    normalized === 'swing-europe' ||
    normalized === 'us-futures' ||
    normalized === 'forex-london' ||
    normalized === 'crypto-spot' ||
    normalized === 'crypto-perps' ||
    normalized === 'prop-index'
  ) {
    return normalized
  }

  return 'manual'
}

export function normalizeTradeMarketTemplate(value?: string | null): TradeMarketTemplate {
  const normalized = (value ?? '').trim().toLowerCase()
  if (
    normalized === 'manual' ||
    normalized === 'dax-cfd' ||
    normalized === 'nq-future' ||
    normalized === 'es-future' ||
    normalized === 'eurusd-london' ||
    normalized === 'btc-spot' ||
    normalized === 'eth-spot' ||
    normalized === 'btc-perps' ||
    normalized === 'eth-perps' ||
    normalized === 'spy-swing'
  ) {
    return normalized
  }

  return 'manual'
}

export function getExecutionTypeLabel(value?: string | null, locale: JournalLocale = 'de'): string {
  const text = journalText(locale)
  const normalized = normalizeTradeExecutionType(value)
  if (normalized === 'maker') return 'Maker'
  if (normalized === 'taker') return 'Taker'
  if (normalized === 'mixed') return text('Gemischt', 'Mixed')
  return text('Manuell', 'Manual')
}

export function getFundingDirectionLabel(value?: string | null, locale: JournalLocale = 'de'): string {
  const text = journalText(locale)
  const normalized = normalizeTradeFundingDirection(value)
  if (normalized === 'paid') return text('Funding bezahlt', 'Funding paid')
  if (normalized === 'received') return text('Funding erhalten', 'Funding received')
  if (normalized === 'flat') return text('Kein Funding', 'No funding')
  return text('Funding manuell', 'Manual funding')
}

export function getPnLModeLabel(mode?: string | null, locale: JournalLocale = 'de'): string {
  const text = journalText(locale)
  const normalized = normalizeTradePnLMode(mode)
  if (normalized === 'override') return text('Automatik aktiv · manuell überschrieben', 'Automatic · manually overridden')
  return normalized === 'auto' ? text('P&L Automatik aktiv', 'Automatic P&L') : text('P&L manuell', 'Manual P&L')
}

export function getCryptoMarketTypeLabel(type?: string | null, locale: JournalLocale = 'de'): string {
  const text = journalText(locale)
  const normalized = normalizeTradeCryptoMarketType(type)
  if (normalized === 'spot') return 'Spot'
  if (normalized === 'perps') return 'Perps'
  if (normalized === 'margin') return 'Margin'
  return text('Manuell', 'Manual')
}

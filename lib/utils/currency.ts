import type { Trade } from '@/lib/types/trade'

export const SUPPORTED_TRADE_CURRENCIES = ['EUR', 'USD', 'GBP', 'USDT', 'USDC'] as const

export type TradeCurrency = (typeof SUPPORTED_TRADE_CURRENCIES)[number]
export type MonetaryScopeKind = 'empty' | 'single' | 'mixed' | 'unknown'

export type MonetaryScope = {
  kind: MonetaryScopeKind
  currency: TradeCurrency | null
  currencies: TradeCurrency[]
  knownCount: number
  unknownCount: number
  isComparable: boolean
}

export function normalizeTradeCurrency(value: string | null | undefined): TradeCurrency | null {
  const normalized = value?.trim().toUpperCase() ?? ''
  return (SUPPORTED_TRADE_CURRENCIES as readonly string[]).includes(normalized)
    ? normalized as TradeCurrency
    : null
}

export function resolveMonetaryScope(values: Array<string | null | undefined>): MonetaryScope {
  if (!values.length) {
    return { kind: 'empty', currency: null, currencies: [], knownCount: 0, unknownCount: 0, isComparable: false }
  }

  const normalized = values.map(normalizeTradeCurrency)
  const currencies = Array.from(new Set(normalized.filter((value): value is TradeCurrency => value !== null))).sort()
  const unknownCount = normalized.filter((value) => value === null).length

  if (unknownCount > 0) {
    return {
      kind: 'unknown',
      currency: null,
      currencies,
      knownCount: values.length - unknownCount,
      unknownCount,
      isComparable: false,
    }
  }

  if (currencies.length === 1) {
    return {
      kind: 'single',
      currency: currencies[0] ?? null,
      currencies,
      knownCount: values.length,
      unknownCount: 0,
      isComparable: true,
    }
  }

  return {
    kind: 'mixed',
    currency: null,
    currencies,
    knownCount: values.length,
    unknownCount: 0,
    isComparable: false,
  }
}

export function resolveTradeMonetaryScope(
  trades: Trade[],
  hasMonetaryValue: (trade: Trade) => boolean = (trade) => trade.netPnL !== null && trade.netPnL !== undefined,
) {
  return resolveMonetaryScope(trades.filter(hasMonetaryValue).map((trade) => trade.accountCurrency))
}

export function getMonetaryScopeMessage(scope: MonetaryScope): string {
  if (scope.kind === 'mixed') {
    return `Geld-Auswertung gesperrt: mehrere Währungen (${scope.currencies.join(', ')}) ohne Umrechnungskurs.`
  }
  if (scope.kind === 'unknown') {
    return `Geld-Auswertung gesperrt: ${scope.unknownCount} monetäre${scope.unknownCount === 1 ? 'r Trade hat' : ' Trades haben'} keine unterstützte Währung.`
  }
  if (scope.kind === 'empty') return 'Noch keine monetären Trades für diese Auswertung vorhanden.'
  return `Geld-Auswertung in ${scope.currency}.`
}

export function formatMoney(value: number, currency: string | null | undefined, fractionDigits = 0): string {
  const normalizedCurrency = normalizeTradeCurrency(currency)
  if (!normalizedCurrency || !Number.isFinite(value)) return 'Währung fehlt'

  const formatter = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

  return `${value >= 0 ? '+' : '-'}${formatter.format(Math.abs(value))} ${normalizedCurrency}`
}

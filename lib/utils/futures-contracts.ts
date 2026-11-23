export const futuresContracts = [
  { symbol: 'MNQ', market: 'nasdaq', size: 'Micro', tickSizeCents: 25, tickValueUsdCents: 50 },
  { symbol: 'NQ', market: 'nasdaq', size: 'E-mini', tickSizeCents: 25, tickValueUsdCents: 500 },
  { symbol: 'MGC', market: 'gold', size: 'Micro', tickSizeCents: 10, tickValueUsdCents: 100 },
  { symbol: 'QO', market: 'gold', size: 'E-mini', tickSizeCents: 25, tickValueUsdCents: 1250 },
  { symbol: 'GC', market: 'gold', size: 'Standard', tickSizeCents: 10, tickValueUsdCents: 1000 },
] as const

export type FuturesContract = (typeof futuresContracts)[number]

export type FuturesCalculatorContract = {
  symbol: string
  market: 'nasdaq' | 'sp500' | 'dow' | 'russell' | 'dax' | 'euroStoxx' | 'gold' | 'silver' | 'copper' | 'wti' | 'naturalGas' | 'corn' | 'wheat' | 'soybeans'
  size: 'Micro' | 'E-mini' | 'Mini' | 'Standard'
  tickSize: number
  tickValueCents: number
  currency: 'USD' | 'EUR'
}

// The journal uses the five existing USD contracts above for its saved price-basis checks.
export const futuresCalculatorContracts: readonly FuturesCalculatorContract[] = [
  ...futuresContracts.map(({ symbol, market, size, tickSizeCents, tickValueUsdCents }) => ({
    symbol, market, size, tickSize: tickSizeCents / 100, tickValueCents: tickValueUsdCents, currency: 'USD' as const,
  })),
  { symbol: 'MES', market: 'sp500', size: 'Micro', tickSize: 0.25, tickValueCents: 125, currency: 'USD' },
  { symbol: 'ES', market: 'sp500', size: 'E-mini', tickSize: 0.25, tickValueCents: 1250, currency: 'USD' },
  { symbol: 'MYM', market: 'dow', size: 'Micro', tickSize: 1, tickValueCents: 50, currency: 'USD' },
  { symbol: 'YM', market: 'dow', size: 'E-mini', tickSize: 1, tickValueCents: 500, currency: 'USD' },
  { symbol: 'M2K', market: 'russell', size: 'Micro', tickSize: 0.1, tickValueCents: 50, currency: 'USD' },
  { symbol: 'RTY', market: 'russell', size: 'E-mini', tickSize: 0.1, tickValueCents: 500, currency: 'USD' },
  { symbol: 'FDXS', market: 'dax', size: 'Micro', tickSize: 1, tickValueCents: 100, currency: 'EUR' },
  { symbol: 'FDXM', market: 'dax', size: 'Mini', tickSize: 1, tickValueCents: 500, currency: 'EUR' },
  { symbol: 'FDAX', market: 'dax', size: 'Standard', tickSize: 1, tickValueCents: 2500, currency: 'EUR' },
  { symbol: 'FSXE', market: 'euroStoxx', size: 'Micro', tickSize: 0.5, tickValueCents: 50, currency: 'EUR' },
  { symbol: 'FESX', market: 'euroStoxx', size: 'Standard', tickSize: 1, tickValueCents: 1000, currency: 'EUR' },
  { symbol: 'SIL', market: 'silver', size: 'Micro', tickSize: 0.005, tickValueCents: 500, currency: 'USD' },
  { symbol: 'QI', market: 'silver', size: 'E-mini', tickSize: 0.0125, tickValueCents: 3125, currency: 'USD' },
  { symbol: 'SI', market: 'silver', size: 'Standard', tickSize: 0.005, tickValueCents: 2500, currency: 'USD' },
  { symbol: 'MHG', market: 'copper', size: 'Micro', tickSize: 0.0005, tickValueCents: 125, currency: 'USD' },
  { symbol: 'QC', market: 'copper', size: 'E-mini', tickSize: 0.002, tickValueCents: 2500, currency: 'USD' },
  { symbol: 'HG', market: 'copper', size: 'Standard', tickSize: 0.0005, tickValueCents: 1250, currency: 'USD' },
  { symbol: 'MCL', market: 'wti', size: 'Micro', tickSize: 0.01, tickValueCents: 100, currency: 'USD' },
  { symbol: 'QM', market: 'wti', size: 'E-mini', tickSize: 0.025, tickValueCents: 1250, currency: 'USD' },
  { symbol: 'CL', market: 'wti', size: 'Standard', tickSize: 0.01, tickValueCents: 1000, currency: 'USD' },
  { symbol: 'MNG', market: 'naturalGas', size: 'Micro', tickSize: 0.001, tickValueCents: 100, currency: 'USD' },
  { symbol: 'QG', market: 'naturalGas', size: 'E-mini', tickSize: 0.005, tickValueCents: 1250, currency: 'USD' },
  { symbol: 'NG', market: 'naturalGas', size: 'Standard', tickSize: 0.001, tickValueCents: 1000, currency: 'USD' },
  // CBOT grain prices are quoted in US cents per bushel.
  { symbol: 'MZC', market: 'corn', size: 'Micro', tickSize: 0.5, tickValueCents: 250, currency: 'USD' },
  { symbol: 'XC', market: 'corn', size: 'Mini', tickSize: 0.125, tickValueCents: 125, currency: 'USD' },
  { symbol: 'ZC', market: 'corn', size: 'Standard', tickSize: 0.25, tickValueCents: 1250, currency: 'USD' },
  { symbol: 'MZW', market: 'wheat', size: 'Micro', tickSize: 0.5, tickValueCents: 250, currency: 'USD' },
  { symbol: 'XW', market: 'wheat', size: 'Mini', tickSize: 0.125, tickValueCents: 125, currency: 'USD' },
  { symbol: 'ZW', market: 'wheat', size: 'Standard', tickSize: 0.25, tickValueCents: 1250, currency: 'USD' },
  { symbol: 'MZS', market: 'soybeans', size: 'Micro', tickSize: 0.5, tickValueCents: 250, currency: 'USD' },
  { symbol: 'XK', market: 'soybeans', size: 'Mini', tickSize: 0.125, tickValueCents: 125, currency: 'USD' },
  { symbol: 'ZS', market: 'soybeans', size: 'Standard', tickSize: 0.25, tickValueCents: 1250, currency: 'USD' },
]

function parseDecimal(input: string, locale: JournalLocale, decimals: number): number {
  const separator = locale === 'de' ? ',' : '\\.'
  const parts = new RegExp('^(\\d+)(?:' + separator + '(\\d{1,' + decimals + '}))?$').exec(input)
  if (!parts) return NaN

  const units = Number(parts[1] + (parts[2] ?? '').padEnd(decimals, '0'))
  const scale = 10 ** decimals
  const amount = units / scale
  return asScaledUnits(amount, scale) === units ? amount : NaN
}

export function parseFuturesCalculatorPrice(value: string, locale: JournalLocale, contract: FuturesCalculatorContract): number {
  const tickDecimals = String(contract.tickSize).split('.')[1]?.length ?? 0
  return parseDecimal(value.trim(), locale, Math.max(2, tickDecimals))
}

export function parseFuturesCalculatorInput(value: string, locale: JournalLocale, whole = false): number {
  const input = value.trim()
  if (whole) {
    const count = Number(input)
    return /^\d+$/.test(input) && Number.isSafeInteger(count) ? count : NaN
  }
  return parseDecimal(input, locale, 2)
}

function hasSafePrecision(cents: number): boolean {
  // Leave room for floating-point rounding when scaled units are converted back.
  return Number.isSafeInteger(cents) && Number.isSafeInteger(cents * 2)
}

function asScaledUnits(value: number, scale: number): number | null {
  const units = Math.round(value * scale)
  return hasSafePrecision(units) && units / scale === value ? units : null
}

function asPriceTicks(value: number, contract: FuturesCalculatorContract): number | null {
  const priceScale = 10000
  const price = asScaledUnits(value, priceScale)
  const tick = Math.round(contract.tickSize * priceScale)
  return price !== null && price > 0 && price % tick === 0 ? price / tick : null
}

export function calculateFuturesRisk({ contract, entry, stop, budget, roundTripFee = 0, slippageTicks = 0 }: {
  contract: FuturesCalculatorContract
  entry: number
  stop: number
  budget: number
  roundTripFee?: number
  slippageTicks?: number
}) {
  const entryTicks = asPriceTicks(entry, contract)
  if (entryTicks === null) return { ok: false, reason: 'entry' } as const
  const exitTicks = asPriceTicks(stop, contract)
  if (exitTicks === null) return { ok: false, reason: 'stop' } as const

  const stopTicks = Math.abs(entryTicks - exitTicks)
  if (stopTicks === 0) return { ok: false, reason: 'distance' } as const

  const budgetCents = asScaledUnits(budget, 100)
  if (budgetCents === null || budgetCents <= 0) return { ok: false, reason: 'budget' } as const

  const feeCents = asScaledUnits(roundTripFee, 100)
  if (feeCents === null || feeCents < 0) return { ok: false, reason: 'fee' } as const
  if (!Number.isSafeInteger(slippageTicks) || slippageTicks < 0) return { ok: false, reason: 'slippage' } as const

  const riskPerContractCents = (stopTicks + slippageTicks) * contract.tickValueCents + feeCents
  if (!hasSafePrecision(riskPerContractCents)) return { ok: false, reason: 'costs' } as const

  const contracts = Math.floor(budgetCents / riskPerContractCents)
  return {
    ok: true,
    stopTicks,
    riskPerContract: riskPerContractCents / 100,
    contracts,
    totalRisk: contracts * riskPerContractCents / 100,
  } as const
}
import type { JournalLocale } from '@/lib/i18n/journal'


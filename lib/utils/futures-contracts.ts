export const futuresContracts = [
  { symbol: 'MNQ', market: 'nasdaq', size: 'Micro', tickSizeCents: 25, tickValueUsdCents: 50 },
  { symbol: 'NQ', market: 'nasdaq', size: 'E-mini', tickSizeCents: 25, tickValueUsdCents: 500 },
  { symbol: 'MGC', market: 'gold', size: 'Micro', tickSizeCents: 10, tickValueUsdCents: 100 },
  { symbol: 'QO', market: 'gold', size: 'E-mini', tickSizeCents: 25, tickValueUsdCents: 1250 },
  { symbol: 'GC', market: 'gold', size: 'Standard', tickSizeCents: 10, tickValueUsdCents: 1000 },
] as const

export type FuturesContract = (typeof futuresContracts)[number]

export function parseFuturesCalculatorInput(value: string, locale: JournalLocale, whole = false): number {
  const input = value.trim()
  if (whole) {
    const count = Number(input)
    return /^\d+$/.test(input) && Number.isSafeInteger(count) ? count : NaN
  }
  const pattern = locale === 'de' ? /^(\d+)(?:,(\d{1,2}))?$/ : /^(\d+)(?:\.(\d{1,2}))?$/
  const parts = pattern.exec(input)
  if (!parts) return NaN

  const cents = Number(parts[1] + (parts[2] ?? '').padEnd(2, '0'))
  const amount = cents / 100
  return asCents(amount) === cents ? amount : NaN
}

function hasCentPrecision(cents: number): boolean {
  // Leave room for floating-point rounding when cents are shown as a dollar amount.
  return Number.isSafeInteger(cents) && Number.isSafeInteger(cents * 2)
}

function asCents(value: number): number | null {
  const cents = Math.round(value * 100)
  return hasCentPrecision(cents) && cents / 100 === value ? cents : null
}

function asPriceTicks(value: number, contract: FuturesContract): number | null {
  const cents = asCents(value)
  return cents !== null && cents > 0 && cents % contract.tickSizeCents === 0 ? cents / contract.tickSizeCents : null
}

export function calculateFuturesRisk({ contract, entry, stop, budgetUsd, roundTripFeeUsd = 0, slippageTicks = 0 }: {
  contract: FuturesContract
  entry: number
  stop: number
  budgetUsd: number
  roundTripFeeUsd?: number
  slippageTicks?: number
}) {
  const entryTicks = asPriceTicks(entry, contract)
  if (entryTicks === null) return { ok: false, reason: 'entry' } as const
  const exitTicks = asPriceTicks(stop, contract)
  if (exitTicks === null) return { ok: false, reason: 'stop' } as const

  const stopTicks = Math.abs(entryTicks - exitTicks)
  if (stopTicks === 0) return { ok: false, reason: 'distance' } as const

  const budgetCents = asCents(budgetUsd)
  if (budgetCents === null || budgetCents <= 0) return { ok: false, reason: 'budget' } as const

  const feeCents = asCents(roundTripFeeUsd)
  if (feeCents === null || feeCents < 0) return { ok: false, reason: 'fee' } as const
  if (!Number.isSafeInteger(slippageTicks) || slippageTicks < 0) return { ok: false, reason: 'slippage' } as const

  const riskPerContractCents = (stopTicks + slippageTicks) * contract.tickValueUsdCents + feeCents
  if (!hasCentPrecision(riskPerContractCents)) return { ok: false, reason: 'costs' } as const

  const contracts = Math.floor(budgetCents / riskPerContractCents)
  return {
    ok: true,
    stopTicks,
    riskPerContractUsd: riskPerContractCents / 100,
    contracts,
    totalRiskUsd: contracts * riskPerContractCents / 100,
  } as const
}
import type { JournalLocale } from '@/lib/i18n/journal'


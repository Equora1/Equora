import { getPartialExitPlanInfo, parseTradingNumber } from '@/lib/utils/calculations'

// Application/owner-confirmed price semantics, not proof of a broker execution.
export const WEIGHTED_EXIT_PRICE_BASIS = 'weighted-remainder-v1' as const

export function getExitPriceBasis(exit: string | number | null | undefined, partialExits: Array<{ percent?: string | number | null; price?: string | number | null }> | null | undefined) {
  const plan = getPartialExitPlanInfo({ exit, partialExits: partialExits ?? [] })
  return plan.count > 0 && plan.hasRemainder && parseTradingNumber(exit) !== null
    ? WEIGHTED_EXIT_PRICE_BASIS : null
}

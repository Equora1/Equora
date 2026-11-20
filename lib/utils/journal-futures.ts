import { normalizeTradeCurrency } from '@/lib/utils/currency'
import { futuresContracts } from '@/lib/utils/futures-contracts'
import { journalNumberLocale, journalText, type JournalLocale } from '@/lib/i18n/journal'

const contractRoots = '(MNQ|NQ|MGC|QO|GC)'
const contractSymbol = new RegExp(`^${contractRoots}(?:(?:[FGHJKMNQUVXZ](?:\\d{1,2}|\\d{4}))|(?: (?:0[1-9]|1[0-2])-\\d{2}))?$`)
const continuousSymbol = new RegExp(`^(?:[A-Z0-9_]+:)?${contractRoots}[1-9]\\d*!$`)

function canInferFutures(instrumentType?: string | null) {
  const type = instrumentType?.trim().toLowerCase()
  return !type || type === 'unknown' || type === 'futures'
}

export function findJournalFuturesContract(market?: string | null, instrumentType?: string | null) {
  if (!canInferFutures(instrumentType)) return undefined
  const symbol = contractSymbol.exec(market?.trim().toUpperCase() ?? '')?.[1]
  return futuresContracts.find((contract) => contract.symbol === symbol)
}

export function isContinuousJournalFuturesSymbol(market?: string | null, instrumentType?: string | null) {
  return canInferFutures(instrumentType) && continuousSymbol.test(market?.trim().toUpperCase() ?? '')
}

export function getJournalFuturesDraftInstrument<T extends string>(market: string, selectedType: T, explicitType: boolean) {
  const eligibleType = explicitType ? selectedType : undefined
  return findJournalFuturesContract(market, eligibleType) || isContinuousJournalFuturesSymbol(market, eligibleType)
    ? 'futures' as const : selectedType
}

export function journalFuturesPointValue(contract: (typeof futuresContracts)[number]): number {
  return contract.tickValueUsdCents / contract.tickSizeCents
}

export function applyJournalFuturesTerms<T extends { market: string; instrumentType: string; pointValue: string }>(input: T): T {
  const contract = findJournalFuturesContract(input.market, input.instrumentType)
  if (contract) return { ...input, instrumentType: 'futures', pointValue: String(journalFuturesPointValue(contract)) }
  return isContinuousJournalFuturesSymbol(input.market, input.instrumentType)
    ? { ...input, instrumentType: 'futures' } : input
}

export function hasJournalFuturesPriceBasis(contract: (typeof futuresContracts)[number], currency: string | null | undefined, pointValue: number | null) {
  return normalizeTradeCurrency(currency) === 'USD' && pointValue === journalFuturesPointValue(contract)
}

export function isWholeJournalFuturesSize(size: number | null): size is number {
  return size !== null && Number.isSafeInteger(size) && size > 0
}

export function journalFuturesCountFromPercent(size: number, percent: number): number | null {
  if (!isWholeJournalFuturesSize(size)) return null
  const implied = (percent / 100) * size
  const count = Math.round(implied)
  // Allow floating-point error from storing the percentage of an exact whole count.
  const tolerance = Math.min(1e-6, Math.max(1, count) * Number.EPSILON * 4)
  return isWholeJournalFuturesSize(count) && count <= size && Math.abs(implied - count) <= tolerance ? count : null
}

export function journalFuturesPercentFromCount(size: number | null, count: number | null): number | null {
  if (!isWholeJournalFuturesSize(size) || !isWholeJournalFuturesSize(count) || count > size) return null
  const percent = (count / size) * 100
  return journalFuturesCountFromPercent(size, percent) === count ? percent : null
}

export function getJournalFuturesExitCounts(size: number | null, legs: ReadonlyArray<{ percent: number }>) {
  if (!isWholeJournalFuturesSize(size)) return null
  const counts: number[] = []
  let remaining = size
  for (const { percent } of legs) {
    const count = journalFuturesCountFromPercent(size, percent)
    if (count === null || count > remaining) return null
    counts.push(count)
    remaining -= count
  }
  return { counts, remaining, closed: size - remaining }
}

export function formatJournalFuturesContracts(count: number, locale: JournalLocale) {
  const quantity = new Intl.NumberFormat(journalNumberLocale[locale], { maximumFractionDigits: 0 }).format(count)
  const text = journalText(locale)
  return `${quantity} ${count === 1 ? text('Kontrakt', 'contract') : text('Kontrakte', 'contracts')}`
}

export function getJournalFuturesEditorExits(
  market: string,
  instrumentType: string | null | undefined,
  size: number | null,
  legs: { percent: number; price: number }[],
) {
  const plan = findJournalFuturesContract(market, instrumentType) ? getJournalFuturesExitCounts(size, legs) : null
  if (!legs.length || plan?.remaining !== 0 || legs.some(({ price }) => !Number.isFinite(price) || price <= 0)) return null
  // Only the last fill of a four-leg close belongs in the main exit field of the three-row editor.
  const finalExit = legs.length === 4 ? legs[3].price : null
  return legs.length <= 4 ? { legs: legs.slice(0, 3), finalExit } : null
}

function decimalParts(value: number) {
  const [coefficient, exponent = '0'] = value.toString().split('e')
  const [whole, fractional = ''] = coefficient.split('.')
  return { digits: BigInt(whole + fractional), places: fractional.length - Number(exponent) }
}

export function calculateJournalFuturesNetUsd({
  entry, executions, positionSize, pointValue, direction, costs,
}: {
  entry: number
  executions: ReadonlyArray<{ price: number; count: number }>
  positionSize: number
  pointValue: number
  direction: 'long' | 'short' | 'neutral'
  costs: readonly number[]
}) {
  if (direction === 'neutral' || !isWholeJournalFuturesSize(positionSize) || !isWholeJournalFuturesSize(pointValue)) return null
  const closed = executions.reduce((sum, { count }) => sum + count, 0)
  if (!isWholeJournalFuturesSize(closed) || closed > positionSize ||
    executions.some(({ count }) => !isWholeJournalFuturesSize(count))) return null

  const decimalValues = [entry, ...executions.map(({ price }) => price), ...costs]
  if (!decimalValues.every(Number.isFinite)) return null
  const parts = decimalValues.map(decimalParts)
  const places = Math.max(0, ...parts.map((part) => part.places))
  const scale = BigInt(10) ** BigInt(places)
  const [entryUnits, ...values] = parts.map(({ digits, places: inputPlaces }) => digits * (BigInt(10) ** BigInt(places - inputPlaces)))
  const exitMoves = executions.reduce((sum, { count }, index) => sum + (values[index] - entryUnits) * BigInt(count), BigInt(0))
  const gross = exitMoves * BigInt(direction === 'long' ? pointValue : -pointValue)
  const cost = values.slice(executions.length).reduce((sum, units) => sum + units, BigInt(0))

  // Keep proportional costs exact, then round the net amount once to cents, half away from zero.
  const numerator = (gross * BigInt(positionSize) - cost * BigInt(closed)) * BigInt(100)
  const denominator = scale * BigInt(positionSize)
  const negative = numerator < BigInt(0)
  const magnitude = negative ? -numerator : numerator
  const cents = (BigInt(2) * magnitude + denominator) / (BigInt(2) * denominator)
  const net = cents === BigInt(0) ? 0 : Number(negative ? -cents : cents) / 100
  return Number.isFinite(net) ? net : null
}

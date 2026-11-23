export const forexPairs = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'USD/CAD', 'AUD/USD', 'NZD/USD',
  'EUR/GBP', 'EUR/JPY', 'EUR/CHF', 'EUR/CAD', 'EUR/AUD', 'EUR/NZD',
  'GBP/JPY', 'GBP/CHF', 'GBP/CAD', 'GBP/AUD', 'GBP/NZD',
  'AUD/JPY', 'AUD/CHF', 'AUD/CAD', 'AUD/NZD',
  'NZD/JPY', 'NZD/CHF', 'NZD/CAD', 'CAD/JPY', 'CAD/CHF', 'CHF/JPY',
] as const

export const forexCurrencies = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'] as const
export type ForexPair = (typeof forexPairs)[number]
export type ForexDirection = 'long' | 'short'
export type ForexSizeUnit = 'units' | 'lots'

function parseScaledPositive(value: string, decimalPlaces: number): number | null {
  const parts = /^(\d+)(?:[.,](\d+))?$/.exec(value.trim())
  if (!parts) return null

  const fractional = parts[2] ?? ''
  if (fractional.length > decimalPlaces) return null
  const scaled = Number(parts[1] + fractional.padEnd(decimalPlaces, '0'))
  return Number.isSafeInteger(scaled * 2) && scaled > 0 ? scaled : null
}

export function forexPairDetails(pair: ForexPair) {
  const [base, quote] = pair.split('/')
  const priceDecimals = quote === 'JPY' ? 3 : 5
  return { base, quote, priceDecimals, pipSize: quote === 'JPY' ? 0.01 : 0.0001 }
}

type ForexPositionValues = {
  pipValueUnits: bigint
  grossPnlUnits: bigint
  fractionDigits: number
}

type ForexMoveResult =
  | { ok: false; reason: 'entry' | 'exit' }
  | { ok: true; pips: number; pipettes: number; position: ForexPositionValues | null; positionIssue?: 'size' | 'range' }

export function calculateForexMove({ pair, direction, entry, exit, size = '', sizeUnit = 'units' }: {
  pair: ForexPair
  direction: ForexDirection
  entry: string
  exit: string
  size?: string
  sizeUnit?: ForexSizeUnit
}): ForexMoveResult {
  const { priceDecimals } = forexPairDetails(pair)
  const entryPipettes = parseScaledPositive(entry, priceDecimals)
  if (entryPipettes === null) return { ok: false, reason: 'entry' } as const
  const exitPipettes = parseScaledPositive(exit, priceDecimals)
  if (exitPipettes === null) return { ok: false, reason: 'exit' } as const

  const pipettes = direction === 'long' ? exitPipettes - entryPipettes : entryPipettes - exitPipettes
  const movement = { ok: true, pips: pipettes / 10, pipettes, position: null } as const
  if (!size.trim()) return movement

  // Five decimal places in lots make the smallest accepted size one base unit.
  const units = parseScaledPositive(size, sizeUnit === 'lots' ? 5 : 0)
  if (units === null) return { ...movement, positionIssue: 'size' }

  const gross = pipettes * units
  const valuePerPip = units * 10
  if (!Number.isSafeInteger(gross * 2) || !Number.isSafeInteger(valuePerPip * 2)) {
    return { ...movement, positionIssue: 'range' }
  }

  return {
    ...movement,
    position: { pipValueUnits: BigInt(valuePerPip), grossPnlUnits: BigInt(gross), fractionDigits: priceDecimals },
  }
}

/** The rate is target-currency units for one unit of the pair's quote currency. */
export function convertForexValues(position: ForexPositionValues, input: string): ForexPositionValues | null {
  const rateDigits = 8
  const parsed = parseScaledPositive(input, rateDigits)
  if (parsed === null) return null

  const rateUnits = BigInt(parsed)
  return {
    pipValueUnits: position.pipValueUnits * rateUnits,
    grossPnlUnits: position.grossPnlUnits * rateUnits,
    fractionDigits: position.fractionDigits + rateDigits,
  }
}

export function formatForexAmount(units: bigint, fractionDigits: number, locale: string): string {
  const zero = BigInt(0)
  const negative = units < zero
  const absolute = negative ? -units : units
  const shownDigits = Math.min(fractionDigits, 8)
  const scale = BigInt(10 ** shownDigits)
  const divisor = BigInt(10 ** (fractionDigits - shownDigits))
  const tiny = absolute > zero && absolute < divisor
  // Round positive magnitudes at the decimal midpoint before applying their sign.
  const rounded = tiny ? BigInt(1) : (absolute + divisor / BigInt(2)) / divisor
  const integer = rounded / scale
  const fraction = (rounded % scale).toString().padStart(shownDigits, '0').replace(/0+$/, '').padEnd(2, '0')
  const signedInteger = negative && !tiny ? (integer === zero ? -0 : -integer) : integer
  const parts = new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).formatToParts(signedInteger)
  const formatted = parts.map((part) => part.type === 'fraction' ? fraction : part.value).join('')
  if (!tiny) return formatted
  return (negative ? '−<' : '<') + formatted
}

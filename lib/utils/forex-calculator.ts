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

export type ForexPositionValues = { pipValue: number; grossPnl: number }

export function calculateForexMove({ pair, direction, entry, exit, size = '', sizeUnit = 'units' }: {
  pair: ForexPair
  direction: ForexDirection
  entry: string
  exit: string
  size?: string
  sizeUnit?: ForexSizeUnit
}) {
  const { priceDecimals } = forexPairDetails(pair)
  const entryPipettes = parseScaledPositive(entry, priceDecimals)
  if (entryPipettes === null) return { ok: false, reason: 'entry' } as const
  const exitPipettes = parseScaledPositive(exit, priceDecimals)
  if (exitPipettes === null) return { ok: false, reason: 'exit' } as const

  const pipettes = direction === 'long' ? exitPipettes - entryPipettes : entryPipettes - exitPipettes
  const pips = pipettes / 10
  if (!size.trim()) return { ok: true, pips, pipettes, position: null } as const

  // Five decimal places in lots make the smallest accepted size one base unit.
  const units = parseScaledPositive(size, sizeUnit === 'lots' ? 5 : 0)
  if (units === null) return { ok: false, reason: 'size' } as const

  const gross = pipettes * units
  const valuePerPip = units * 10
  if (!Number.isSafeInteger(gross * 2) || !Number.isSafeInteger(valuePerPip * 2)) {
    return { ok: false, reason: 'range' } as const
  }
  const priceScale = 10 ** priceDecimals
  return {
    ok: true,
    pips,
    pipettes,
    position: { pipValue: valuePerPip / priceScale, grossPnl: gross / priceScale },
  } as const
}

/** The rate is target-currency units for one unit of the pair's quote currency. */
export function convertForexValues(position: ForexPositionValues, input: string): ForexPositionValues | null {
  const parsed = parseScaledPositive(input, 8)
  if (parsed === null) return null

  const rate = parsed / 10 ** 8
  const pipValue = position.pipValue * rate
  const grossPnl = position.grossPnl * rate
  if (!Number.isFinite(pipValue) || !Number.isFinite(grossPnl)) return null
  return { pipValue, grossPnl }
}

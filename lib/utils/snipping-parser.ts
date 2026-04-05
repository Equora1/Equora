export type SnippingCaptureResult = 'winner' | 'loser' | 'breakeven' | 'open'

export type SnippingParseResult = {
  rawText: string
  market?: string
  bias?: 'Long' | 'Short'
  entry?: string
  exit?: string
  stopLoss?: string
  takeProfit?: string
  positionSize?: string
  netPnL?: string
  captureResult?: SnippingCaptureResult
  confidence: number
  hints: string[]
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeText(text: string) {
  return text
    .replace(/[|]/g, 'I')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/\r/g, '')
}

function splitLines(text: string) {
  return normalizeText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseNumberish(raw: string | undefined) {
  if (!raw) return null
  const cleaned = raw
    .replace(/[^0-9,.-]/g, '')
    .replace(/(?!^)-/g, '')
    .trim()

  if (!cleaned) return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized = cleaned

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      normalized = cleaned.replace(/,/g, '')
    }
  } else if (lastComma !== -1) {
    const decimalDigits = cleaned.length - lastComma - 1
    normalized = decimalDigits > 0 && decimalDigits <= 3 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '')
  }

  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : null
}

function formatNumberish(value: number | null) {
  if (value === null) return undefined
  const rounded = Math.abs(value) >= 1000 ? value.toFixed(0) : Math.abs(value) >= 10 ? value.toFixed(2) : value.toFixed(4)
  return rounded.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function extractFromLabel(lines: string[], labels: string[]) {
  for (const label of labels) {
    const labelPattern = escapeRegex(label)
    const exactLine = new RegExp(`${labelPattern}[^0-9+-]*([+-]?[0-9][0-9.,]*)`, 'i')
    const inlineLine = new RegExp(`${labelPattern}[^\n]*?([+-]?[0-9][0-9.,]*)`, 'i')
    for (const line of lines) {
      const exact = line.match(exactLine)
      if (exact?.[1]) return formatNumberish(parseNumberish(exact[1]))
      const inline = line.match(inlineLine)
      if (inline?.[1]) return formatNumberish(parseNumberish(inline[1]))
    }
  }
  return undefined
}

function extractPnL(lines: string[]) {
  for (const line of lines) {
    if (!/(pnl|p&l|profit|gewinn|verlust|realized|realised|net)/i.test(line)) continue
    const matches = line.match(/[+-]?[0-9][0-9.,]*/g)
    if (!matches?.length) continue
    const best = matches
      .map((value) => parseNumberish(value))
      .filter((value): value is number => value !== null)
      .sort((a, b) => Math.abs(b) - Math.abs(a))[0]
    if (best !== undefined) return formatNumberish(best)
  }
  return undefined
}

function detectBias(text: string): 'Long' | 'Short' | undefined {
  if (/(\blong\b|\bbuy\b|\bkauf\b)/i.test(text)) return 'Long'
  if (/(\bshort\b|\bsell\b|\bverkauf\b)/i.test(text)) return 'Short'
  return undefined
}

function detectMarket(rawText: string, marketOptions: string[]) {
  const text = rawText.toUpperCase().replace(/\s+/g, '')
  const normalizedOptions = Array.from(new Set([
    ...marketOptions,
    'NASDAQ',
    'NAS100',
    'NQ',
    'BTC/USD',
    'BTC/USDT',
    'ETH/USD',
    'ETH/USDT',
    'EUR/USD',
    'GBP/USD',
    'XAU/USD',
    'DAX',
    'US30',
  ]))

  const aliases: Array<{ needle: RegExp; value: string }> = [
    { needle: /(BTCUSDT|BTCUSD|XBTUSD)/, value: normalizedOptions.find((option) => /BTC\/(USD|USDT)/i.test(option)) ?? 'BTC/USD' },
    { needle: /(ETHUSDT|ETHUSD)/, value: normalizedOptions.find((option) => /ETH\/(USD|USDT)/i.test(option)) ?? 'ETH/USD' },
    { needle: /(EURUSD)/, value: normalizedOptions.find((option) => /EUR\/USD/i.test(option)) ?? 'EUR/USD' },
    { needle: /(GBPUSD)/, value: normalizedOptions.find((option) => /GBP\/USD/i.test(option)) ?? 'GBP/USD' },
    { needle: /(XAUUSD|GOLD)/, value: normalizedOptions.find((option) => /XAU\/USD/i.test(option)) ?? 'XAU/USD' },
    { needle: /(NAS100|NASDAQ|US100|\bNQ\b)/, value: normalizedOptions.find((option) => /NASDAQ|NAS100/i.test(option)) ?? 'NASDAQ' },
    { needle: /(GER40|DAX|DE40)/, value: normalizedOptions.find((option) => /DAX/i.test(option)) ?? 'DAX' },
  ]

  for (const alias of aliases) {
    if (alias.needle.test(text)) return alias.value
  }

  for (const option of normalizedOptions) {
    const compact = option.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (compact && text.includes(compact)) return option
  }

  return undefined
}

function inferCaptureResult(netPnL?: string): SnippingCaptureResult | undefined {
  const numeric = parseNumberish(netPnL)
  if (numeric === null) return undefined
  if (numeric > 0) return 'winner'
  if (numeric < 0) return 'loser'
  return 'breakeven'
}

export function parseTradeFromSnipText(rawText: string, marketOptions: string[] = []): SnippingParseResult {
  const text = normalizeText(rawText)
  const lines = splitLines(text)
  const hints: string[] = []

  const market = detectMarket(text, marketOptions)
  if (market) hints.push(`Markt erkannt: ${market}`)

  const bias = detectBias(text)
  if (bias) hints.push(`Richtung erkannt: ${bias}`)

  const entry = extractFromLabel(lines, ['avg entry', 'entry', 'open price', 'avg price'])
  const exit = extractFromLabel(lines, ['exit', 'close price', 'closed at', 'avg exit'])
  const stopLoss = extractFromLabel(lines, ['stop loss', 'stop', 'sl'])
  const takeProfit = extractFromLabel(lines, ['take profit', 'target', 'tp'])
  const positionSize = extractFromLabel(lines, ['qty', 'quantity', 'size', 'contracts', 'shares', 'position'])
  const netPnL = extractPnL(lines)
  const captureResult = inferCaptureResult(netPnL)

  const filledCount = [market, bias, entry, exit, stopLoss, takeProfit, positionSize, netPnL].filter(Boolean).length
  const confidence = Math.min(0.95, 0.18 + filledCount * 0.1)

  if (!entry && !exit && !netPnL) {
    hints.push('Tipp: Schneide möglichst nur die Positionsbox oder Order-Zeile aus, dann wird OCR deutlich treffsicherer.')
  }
  if (netPnL) hints.push(`P&L erkannt: ${netPnL}`)
  if (positionSize) hints.push(`Größe erkannt: ${positionSize}`)

  return {
    rawText: text,
    market,
    bias,
    entry,
    exit,
    stopLoss,
    takeProfit,
    positionSize,
    netPnL,
    captureResult,
    confidence,
    hints,
  }
}

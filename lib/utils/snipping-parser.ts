export type SnippingCaptureResult = 'winner' | 'loser' | 'breakeven' | 'open'
export type SnippingSource = 'tradingview-position' | 'generic'
export type SnippingPlausibility = 'good' | 'review' | 'critical'
export type SnippingCheckLevel = 'good' | 'review' | 'critical'

export type SnippingFieldKey =
  | 'market'
  | 'bias'
  | 'entry'
  | 'exit'
  | 'stopLoss'
  | 'takeProfit'
  | 'positionSize'
  | 'netPnL'
  | 'accountSize'
  | 'riskPercent'
  | 'riskAmount'
  | 'leverage'
  | 'riskRewardRatio'

export type SnippingPlausibilityCheck = {
  key: string
  label: string
  level: SnippingCheckLevel
  message: string
}

export type SnippingParseResult = {
  rawText: string
  source: SnippingSource
  market?: string
  bias?: 'Long' | 'Short'
  entry?: string
  exit?: string
  stopLoss?: string
  takeProfit?: string
  positionSize?: string
  netPnL?: string
  accountSize?: string
  riskPercent?: string
  riskAmount?: string
  leverage?: string
  riskRewardRatio?: string
  captureResult?: SnippingCaptureResult
  confidence: number
  fieldConfidence: Partial<Record<SnippingFieldKey, number>>
  hints: string[]
  plausibility: SnippingPlausibility
  checks: SnippingPlausibilityCheck[]
}

type ParserPreset = 'auto' | SnippingSource

type ExtractedNumber = {
  value?: string
  confidence: number
  matchedLabel?: string
}

function normalizeText(text: string) {
  return text
    .replace(/[|]/g, 'I')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/\r/g, '')
}

function normalizeForMatching(text: string) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
}

function splitLines(text: string) {
  return normalizeText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseNumberish(raw: string | undefined, preferGermanThousands = false) {
  if (!raw) return null
  const cleaned = raw
    .replace(/\s/g, '')
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
    normalized = decimalDigits > 0 && decimalDigits <= 4 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '')
  } else if (lastDot !== -1) {
    const groups = cleaned.split('.')
    const finalGroup = groups.at(-1) ?? ''
    if (groups.length > 2 || (preferGermanThousands && finalGroup.length === 3)) normalized = groups.join('')
  }

  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : null
}

function formatNumberish(value: number | null) {
  if (value === null) return undefined
  const absolute = Math.abs(value)
  const rounded = absolute >= 100000 ? value.toFixed(0) : absolute >= 1000 ? value.toFixed(2) : absolute >= 10 ? value.toFixed(3) : value.toFixed(4)
  return rounded.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function extractFirstNumber(raw: string) {
  const match = raw.match(/[+-]?[0-9][0-9\s.,]*/)
  return match?.[0]?.trim()
}

function labelMatches(line: string, label: string) {
  return normalizeForMatching(line).includes(normalizeForMatching(label))
}

function extractLabeledNumber(lines: string[], labels: string[], options?: { preferPercent?: boolean; preferMultiplier?: boolean }): ExtractedNumber {
  for (const label of labels) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (!labelMatches(line, label)) continue

      const normalizedLabel = normalizeForMatching(label)
      const normalizedLine = normalizeForMatching(line)
      const labelIndex = normalizedLine.indexOf(normalizedLabel)
      const tail = labelIndex >= 0 ? line.slice(Math.min(line.length, labelIndex + label.length)) : line
      const candidates = [tail, line, lines[index + 1] ?? '']

      for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
        const candidate = candidates[candidateIndex]
        if (!candidate) continue
        if (options?.preferPercent && !candidate.includes('%') && candidateIndex < 2) continue
        if (options?.preferMultiplier && !/[xX×]/.test(candidate) && candidateIndex < 2) continue

        const rawNumber = extractFirstNumber(candidate)
        const germanLabel = /(einstieg|ausstieg|stop-preis|stopniveau|gewinnziel|zielpreis|gewinnniveau|positionsgroesse|kontogroesse|kontostand|risiko|hebel|kontrakte|menge)/.test(normalizedLabel)
        const value = formatNumberish(parseNumberish(rawNumber, germanLabel))
        if (!value) continue

        const confidence = candidateIndex === 0 ? 0.94 : candidateIndex === 1 ? 0.88 : 0.78
        return { value, confidence, matchedLabel: label }
      }
    }
  }

  return { confidence: 0 }
}

function extractStandaloneRiskPercent(lines: string[]): ExtractedNumber {
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeForMatching(lines[index])
    if (!/(^|\s)(risk|risiko)(\s|:|$)/.test(normalized)) continue
    if (/(reward|chance|ratio|verhaeltnis|amount|betrag|usd|eur)/.test(normalized)) continue
    const candidates = [lines[index], lines[index + 1] ?? '']
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const rawNumber = extractFirstNumber(candidates[candidateIndex])
      const value = formatNumberish(parseNumberish(rawNumber))
      if (value) return { value, confidence: candidateIndex === 0 ? 0.82 : 0.72, matchedLabel: 'risk' }
    }
  }
  return { confidence: 0 }
}

function extractPnL(lines: string[]) {
  for (const line of lines) {
    if (/(take profit|profit level|profit price|target|gewinnziel|gewinnniveau|zielpreis)/i.test(line)) continue
    if (!/(pnl|p&l|realized pnl|realised pnl|net pnl|net profit|net loss|realisierter gewinn|realisierter verlust|verlust)/i.test(line)) continue
    const matches = line.match(/[+-]?[0-9][0-9.,]*/g)
    if (!matches?.length) continue
    const best = matches
      .map((value) => parseNumberish(value))
      .filter((value): value is number => value !== null)
      .sort((a, b) => Math.abs(b) - Math.abs(a))[0]
    if (best !== undefined) return { value: formatNumberish(best), confidence: 0.9 }
  }
  return { value: undefined, confidence: 0 }
}

function detectBias(text: string): { value?: 'Long' | 'Short'; confidence: number } {
  if (/(\blong\b|long position|long-position|\bbuy\b|\bkauf\b)/i.test(text)) return { value: 'Long', confidence: 0.94 }
  if (/(\bshort\b|short position|short-position|\bsell\b|\bverkauf\b)/i.test(text)) return { value: 'Short', confidence: 0.94 }
  return { confidence: 0 }
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
    if (alias.needle.test(text)) return { value: alias.value, confidence: 0.88 }
  }

  for (const option of normalizedOptions) {
    const compact = option.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (compact && text.includes(compact)) return { value: option, confidence: 0.9 }
  }

  return { value: undefined, confidence: 0 }
}

function detectSource(text: string, preset: ParserPreset): SnippingSource {
  if (preset !== 'auto') return preset
  const normalized = normalizeForMatching(text)
  const tradingViewSignals = [
    'account size',
    'kontogroesse',
    'risk/reward',
    'chance-risiko',
    'entry price',
    'einstiegspreis',
    'profit level',
    'gewinnniveau',
    'stop level',
    'long position',
    'short position',
  ]
  const matches = tradingViewSignals.filter((signal) => normalized.includes(signal)).length
  return matches >= 2 ? 'tradingview-position' : 'generic'
}

function inferCaptureResult(netPnL?: string, source?: SnippingSource): SnippingCaptureResult | undefined {
  const numeric = parseNumberish(netPnL)
  if (numeric !== null) {
    if (numeric > 0) return 'winner'
    if (numeric < 0) return 'loser'
    return 'breakeven'
  }
  return source === 'tradingview-position' ? 'open' : undefined
}

function calculateRiskReward(entry?: string, stopLoss?: string, takeProfit?: string, bias?: 'Long' | 'Short') {
  const entryValue = parseNumberish(entry)
  const stopValue = parseNumberish(stopLoss)
  const targetValue = parseNumberish(takeProfit)
  if (entryValue === null || stopValue === null || targetValue === null) return undefined

  const risk = bias === 'Short' ? stopValue - entryValue : entryValue - stopValue
  const reward = bias === 'Short' ? entryValue - targetValue : targetValue - entryValue
  if (risk <= 0 || reward <= 0) return undefined
  return formatNumberish(reward / risk)
}

function makePlausibilityChecks(input: {
  source: SnippingSource
  bias?: 'Long' | 'Short'
  entry?: string
  stopLoss?: string
  takeProfit?: string
  positionSize?: string
  accountSize?: string
  riskPercent?: string
  riskAmount?: string
  leverage?: string
  statedRiskReward?: string
  calculatedRiskReward?: string
}) {
  const checks: SnippingPlausibilityCheck[] = []
  const entry = parseNumberish(input.entry)
  const stop = parseNumberish(input.stopLoss)
  const target = parseNumberish(input.takeProfit)
  const positionSize = parseNumberish(input.positionSize)
  const accountSize = parseNumberish(input.accountSize)
  const riskPercent = parseNumberish(input.riskPercent)
  const riskAmount = parseNumberish(input.riskAmount)
  const leverage = parseNumberish(input.leverage)
  const statedRr = parseNumberish(input.statedRiskReward)
  const calculatedRr = parseNumberish(input.calculatedRiskReward)

  if (input.source === 'tradingview-position') {
    if (entry === null) {
      checks.push({ key: 'entry-missing', label: 'Entry', level: 'review', message: 'Entry wurde nicht sicher erkannt.' })
    }
    if (stop === null) {
      checks.push({ key: 'stop-missing', label: 'Stop', level: 'review', message: 'Stop wurde nicht sicher erkannt.' })
    }
  }

  if (entry !== null && stop !== null && input.bias) {
    const validStop = input.bias === 'Long' ? stop < entry : stop > entry
    checks.push({
      key: 'stop-direction',
      label: 'Stop-Richtung',
      level: validStop ? 'good' : 'critical',
      message: validStop
        ? `Stop liegt für ${input.bias} auf der plausiblen Seite des Entry.`
        : `Stop liegt für ${input.bias} auf der falschen Seite des Entry. Dezimalstellen oder Richtung prüfen.`,
    })
  }

  if (entry !== null && target !== null && input.bias) {
    const validTarget = input.bias === 'Long' ? target > entry : target < entry
    checks.push({
      key: 'target-direction',
      label: 'Ziel-Richtung',
      level: validTarget ? 'good' : 'critical',
      message: validTarget
        ? `Take Profit liegt für ${input.bias} auf der plausiblen Seite des Entry.`
        : `Take Profit liegt für ${input.bias} auf der falschen Seite des Entry. OCR-Wert prüfen.`,
    })
  }

  if (!input.bias && entry !== null && (stop !== null || target !== null)) {
    checks.push({ key: 'bias-missing', label: 'Richtung', level: 'review', message: 'Long/Short fehlt. Ohne Richtung kann Equora Stop und Ziel nicht vollständig prüfen.' })
  }

  if (riskPercent !== null) {
    const level: SnippingCheckLevel = riskPercent <= 0 || riskPercent > 10 ? 'critical' : riskPercent > 3 ? 'review' : 'good'
    const message = riskPercent <= 0
      ? 'Risiko muss größer als 0 % sein.'
      : riskPercent > 10
        ? `${formatNumberish(riskPercent)} % Risiko wirkt unplausibel hoch. Dezimalstelle prüfen.`
        : riskPercent > 3
          ? `${formatNumberish(riskPercent)} % Risiko ist erhöht und sollte bewusst bestätigt werden.`
          : `${formatNumberish(riskPercent)} % Risiko liegt im plausiblen Prüfbereich.`
    checks.push({ key: 'risk-percent', label: 'Risiko', level, message })
  }

  if (leverage !== null) {
    const level: SnippingCheckLevel = leverage <= 0 || leverage > 100 ? 'critical' : leverage > 30 ? 'review' : 'good'
    const message = leverage <= 0
      ? 'Hebel muss größer als 0 sein.'
      : leverage > 100
        ? `${formatNumberish(leverage)}x Hebel wirkt wie ein OCR- oder Eingabefehler.`
        : leverage > 30
          ? `${formatNumberish(leverage)}x Hebel ist sehr hoch und sollte geprüft werden.`
          : `${formatNumberish(leverage)}x Hebel wurde plausibel erkannt.`
    checks.push({ key: 'leverage', label: 'Hebel', level, message })
  }

  if (positionSize !== null && positionSize <= 0) {
    checks.push({ key: 'position-size', label: 'Positionsgröße', level: 'critical', message: 'Positionsgröße muss größer als 0 sein.' })
  }

  if (accountSize !== null && riskAmount !== null && accountSize > 0) {
    const derivedPercent = (riskAmount / accountSize) * 100
    if (riskPercent !== null) {
      const difference = Math.abs(derivedPercent - riskPercent)
      const tolerance = Math.max(0.25, Math.abs(riskPercent) * 0.2)
      checks.push({
        key: 'risk-consistency',
        label: 'Risiko-Abgleich',
        level: difference <= tolerance ? 'good' : 'review',
        message: difference <= tolerance
          ? `Risikobetrag und Kontogröße entsprechen ungefähr ${formatNumberish(derivedPercent)} %.`
          : `Risikobetrag/Kontogröße ergeben ${formatNumberish(derivedPercent)} %, erkannt wurden aber ${formatNumberish(riskPercent)} %.`,
      })
    } else {
      checks.push({ key: 'risk-derived', label: 'Risiko-Abgleich', level: 'good', message: `Aus Kontogröße und Risikobetrag ergeben sich ungefähr ${formatNumberish(derivedPercent)} %.` })
    }
  }

  if (statedRr !== null && calculatedRr !== null) {
    const difference = Math.abs(statedRr - calculatedRr)
    checks.push({
      key: 'rr-consistency',
      label: 'CRV-Abgleich',
      level: difference <= 0.25 ? 'good' : 'review',
      message: difference <= 0.25
        ? `Angegebenes und aus Entry/Stop/Ziel berechnetes CRV stimmen ungefähr überein.`
        : `Angegebenes CRV ${formatNumberish(statedRr)} weicht vom berechneten CRV ${formatNumberish(calculatedRr)} ab.`,
    })
  }

  const plausibility: SnippingPlausibility = checks.some((check) => check.level === 'critical')
    ? 'critical'
    : checks.some((check) => check.level === 'review')
      ? 'review'
      : 'good'

  return { checks, plausibility }
}

export function parseTradeFromSnipText(rawText: string, marketOptions: string[] = [], preset: ParserPreset = 'auto'): SnippingParseResult {
  const text = normalizeText(rawText)
  const lines = splitLines(text)
  const hints: string[] = []
  const source = detectSource(text, preset)
  const fieldConfidence: Partial<Record<SnippingFieldKey, number>> = {}

  const marketResult = detectMarket(text, marketOptions)
  const market = marketResult.value
  if (market) {
    fieldConfidence.market = marketResult.confidence
    hints.push(`Markt erkannt: ${market}`)
  }

  const biasResult = detectBias(text)
  const bias = biasResult.value
  if (bias) {
    fieldConfidence.bias = biasResult.confidence
    hints.push(`Richtung erkannt: ${bias}`)
  }

  const entryResult = extractLabeledNumber(lines, [
    'avg entry', 'entry price', 'entry', 'open price', 'avg price',
    'einstiegspreis', 'einstieg', 'eröffnungspreis', 'eroeffnungspreis',
  ])
  const exitResult = extractLabeledNumber(lines, ['avg exit', 'exit price', 'exit', 'close price', 'closed at', 'ausstiegspreis', 'ausstieg', 'schlusspreis'])
  const stopResult = extractLabeledNumber(lines, ['stop price', 'stop level', 'stop loss', 'stop-loss', 'stop', 'sl', 'stop-preis', 'stopniveau'])
  const targetResult = extractLabeledNumber(lines, ['take profit', 'profit price', 'profit level', 'target price', 'target', 'tp', 'gewinnziel', 'zielpreis', 'gewinnniveau'])
  const sizeResult = extractLabeledNumber(lines, ['position size', 'qty', 'quantity', 'size', 'contracts', 'shares', 'positionsgröße', 'positionsgroesse', 'menge', 'kontrakte'])
  const accountResult = extractLabeledNumber(lines, ['account size', 'account balance', 'kontogröße', 'kontogroesse', 'kontostand'])
  const explicitRiskPercentResult = extractLabeledNumber(lines, ['risk %', 'risk percent', 'risk percentage', 'risiko %', 'risiko prozent'], { preferPercent: true })
  const riskPercentResult = explicitRiskPercentResult.value ? explicitRiskPercentResult : extractStandaloneRiskPercent(lines)
  const riskAmountResult = extractLabeledNumber(lines, ['risk amount', 'risk, usd', 'risk usd', 'risikobetrag', 'risiko betrag'])
  const leverageResult = extractLabeledNumber(lines, ['leverage', 'hebel'], { preferMultiplier: true })
  const rrResult = extractLabeledNumber(lines, ['risk/reward ratio', 'risk reward ratio', 'risk/reward', 'chance-risiko-verhältnis', 'chance-risiko-verhaeltnis', 'crv'])
  const pnlResult = extractPnL(lines)

  const entry = entryResult.value
  const exit = exitResult.value
  const stopLoss = stopResult.value
  const takeProfit = targetResult.value
  const positionSize = sizeResult.value
  const accountSize = accountResult.value
  const riskPercent = riskPercentResult.value
  const riskAmount = riskAmountResult.value
  const leverage = leverageResult.value
  const netPnL = pnlResult.value
  const calculatedRiskReward = calculateRiskReward(entry, stopLoss, takeProfit, bias)
  const riskRewardRatio = rrResult.value ?? calculatedRiskReward

  const extracted: Array<[SnippingFieldKey, ExtractedNumber]> = [
    ['entry', entryResult],
    ['exit', exitResult],
    ['stopLoss', stopResult],
    ['takeProfit', targetResult],
    ['positionSize', sizeResult],
    ['accountSize', accountResult],
    ['riskPercent', riskPercentResult],
    ['riskAmount', riskAmountResult],
    ['leverage', leverageResult],
    ['riskRewardRatio', rrResult],
    ['netPnL', pnlResult],
  ]
  for (const [key, result] of extracted) {
    if (result.value) fieldConfidence[key] = result.confidence
  }
  if (riskRewardRatio && !rrResult.value) fieldConfidence.riskRewardRatio = 0.82

  const { checks, plausibility } = makePlausibilityChecks({
    source,
    bias,
    entry,
    stopLoss,
    takeProfit,
    positionSize,
    accountSize,
    riskPercent,
    riskAmount,
    leverage,
    statedRiskReward: rrResult.value,
    calculatedRiskReward,
  })

  const captureResult = inferCaptureResult(netPnL, source)
  const detectedValues = [market, bias, entry, exit, stopLoss, takeProfit, positionSize, netPnL, accountSize, riskPercent, riskAmount, leverage, riskRewardRatio]
  const confidenceValues = Object.values(fieldConfidence)
  const averageConfidence = confidenceValues.length
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0
  const coverage = Math.min(1, detectedValues.filter(Boolean).length / (source === 'tradingview-position' ? 8 : 6))
  const plausibilityPenalty = plausibility === 'critical' ? 0.18 : plausibility === 'review' ? 0.06 : 0
  const confidence = Math.min(0.97, Math.max(0.12, averageConfidence * 0.72 + coverage * 0.28 - plausibilityPenalty))

  if (source === 'tradingview-position') {
    hints.push('TradingView-Positionsmaske erkannt. Alle Werte bleiben Vorschläge und müssen vor dem Speichern geprüft werden.')
    if (!market) hints.push('Der Markt steht oft nicht im Einstellungsfenster. Falls er fehlt, bitte im Trade-Formular ergänzen.')
    if (entry && stopLoss && takeProfit && riskRewardRatio) hints.push(`CRV abgeleitet: ${riskRewardRatio} : 1`)
  } else if (!entry && !exit && !netPnL) {
    hints.push('Tipp: Schneide möglichst nur die Positionsbox oder Order-Zeile aus, dann wird OCR deutlich treffsicherer.')
  }
  if (netPnL) hints.push(`P&L erkannt: ${netPnL}`)
  if (positionSize) hints.push(`Größe erkannt: ${positionSize}`)
  if (riskPercent) hints.push(`Geplantes Risiko erkannt: ${riskPercent}%`)
  if (leverage) hints.push(`Hebel erkannt: ${leverage}x`)

  return {
    rawText: text,
    source,
    market,
    bias,
    entry,
    exit,
    stopLoss,
    takeProfit,
    positionSize,
    netPnL,
    accountSize,
    riskPercent,
    riskAmount,
    leverage,
    riskRewardRatio,
    captureResult,
    confidence,
    fieldConfidence,
    hints,
    plausibility,
    checks,
  }
}

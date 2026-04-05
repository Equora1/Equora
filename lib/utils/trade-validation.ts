import {
  computeNetPnLFromExecution,
  getTradeBrokerProfilePreset,
  getTradeInstrumentPreset,
  normalizeInstrumentType,
  normalizeTradeBrokerProfile,
  normalizeTradeCryptoMarketType,
  normalizeTradePnLMode,
  parseTradingNumber,
  derivePositionSizeFromMargin,
  deriveEffectiveExitFromPartialExitLegs,
  normalizePartialExitLegs,
} from '@/lib/utils/calculations'

export type TradeCaptureInput = {
  market: string
  setup: string
  emotion: string
  bias: string
  ruleCheck: string
  reviewRepeatability: string
  reviewState: string
  reviewLesson: string
  entry: string
  stopLoss: string
  takeProfit: string
  exit: string
  netPnL: string
  riskPercent: string
  accountSize: string
  marginUsed: string
  rMultiple: string
  pnlMode: string
  costProfile: string
  brokerProfile: string
  instrumentType: string
  accountTemplate: string
  marketTemplate: string
  positionSize: string
  pointValue: string
  fees: string
  exchangeFees: string
  fundingFees: string
  fundingRateBps: string
  fundingIntervals: string
  spreadCost: string
  slippage: string
  accountCurrency: string
  cryptoMarketType: string
  executionType: string
  fundingDirection: string
  quoteAsset: string
  leverage: string
  partialExit1Percent?: string
  partialExit1Price?: string
  partialExit2Percent?: string
  partialExit2Price?: string
  partialExit3Percent?: string
  partialExit3Price?: string
  userCostProfileId: string
  notes: string
  screenshotUrl?: string
  tags: string[]
}

export type TradeValidationField =
  | 'market'
  | 'setup'
  | 'bias'
  | 'entry'
  | 'stopLoss'
  | 'takeProfit'
  | 'exit'
  | 'netPnL'
  | 'riskPercent'
  | 'accountSize'
  | 'marginUsed'
  | 'positionSize'
  | 'pointValue'
  | 'accountCurrency'
  | 'quoteAsset'
  | 'leverage'
  | 'fundingRateBps'
  | 'fundingIntervals'

export type TradeValidationResult = {
  isValid: boolean
  errors: Partial<Record<TradeValidationField, string>>
  normalizedTags: string[]
  normalizedPnLMode: 'manual' | 'auto' | 'override'
  summary: string
}

function addError(
  errors: Partial<Record<TradeValidationField, string>>,
  field: TradeValidationField,
  message: string,
) {
  if (!errors[field]) errors[field] = message
}

function isBlank(value: string | null | undefined) {
  return !value || !value.trim()
}

function isPositive(value: string | number | null | undefined) {
  const numeric = parseTradingNumber(value)
  return numeric !== null && numeric > 0
}

function isNonNegative(value: string | number | null | undefined) {
  const numeric = parseTradingNumber(value)
  return numeric !== null && numeric >= 0
}

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)))
}

export function validateTradeCaptureInput(input: TradeCaptureInput): TradeValidationResult {
  const errors: Partial<Record<TradeValidationField, string>> = {}
  const normalizedTags = normalizeTags(input.tags)
  const normalizedBroker = normalizeTradeBrokerProfile(input.brokerProfile)
  const brokerPreset = getTradeBrokerProfilePreset(normalizedBroker)
  const normalizedInstrumentType = normalizeInstrumentType(input.instrumentType || brokerPreset.defaultInstrumentType)
  const instrumentPreset = getTradeInstrumentPreset(normalizedInstrumentType)
  const basePnLMode = normalizeTradePnLMode(input.pnlMode, input.netPnL)
  const normalizedCryptoMarketType = normalizeTradeCryptoMarketType(input.cryptoMarketType)

  const entry = parseTradingNumber(input.entry)
  const stopLoss = parseTradingNumber(input.stopLoss)
  const takeProfit = parseTradingNumber(input.takeProfit)
  const partialExitRows = [
    { percent: input.partialExit1Percent, price: input.partialExit1Price },
    { percent: input.partialExit2Percent, price: input.partialExit2Price },
    { percent: input.partialExit3Percent, price: input.partialExit3Price },
  ]
  const normalizedPartialExits = normalizePartialExitLegs(partialExitRows)
  const partialCoverage = normalizedPartialExits.reduce((sum, leg) => sum + leg.percent, 0)
  const hasIncompletePartialExitRow = partialExitRows.some((row) => (isBlank(row.percent) && !isBlank(row.price)) || (!isBlank(row.percent) && isBlank(row.price)))
  const effectiveExitValue = deriveEffectiveExitFromPartialExitLegs({
    exit: input.exit,
    partialExits: partialExitRows,
  })
  const exit = effectiveExitValue
  const netPnL = parseTradingNumber(input.netPnL)
  const positionSize = parseTradingNumber(input.positionSize)
  const pointValue = parseTradingNumber(input.pointValue) ?? brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue
  const leverage = parseTradingNumber(input.leverage)
  const riskPercent = parseTradingNumber(input.riskPercent)
  const accountSize = parseTradingNumber(input.accountSize)
  const marginUsed = parseTradingNumber(input.marginUsed)
  const fundingRateBps = parseTradingNumber(input.fundingRateBps)
  const fundingIntervals = parseTradingNumber(input.fundingIntervals)
  const direction = (input.bias ?? '').toLowerCase()
  const isDirectional = direction.includes('long') || direction.includes('short')
  const effectivePositionSize = positionSize ?? derivePositionSizeFromMargin({
    instrumentType: normalizedInstrumentType,
    entry: input.entry,
    marginUsed: input.marginUsed,
    leverage: input.leverage,
    pointValue: input.pointValue,
  })
  const canAutoDerivePnL = basePnLMode === 'manual' && netPnL === null
    ? (() => {
        const fallbackPnL = computeNetPnLFromExecution({
          explicitPnL: null,
          pnlMode: 'auto',
          entry: input.entry,
          exit: effectiveExitValue,
          positionSize: effectivePositionSize,
          pointValue: input.pointValue,
          fees: input.fees,
          exchangeFees: input.exchangeFees,
          fundingFees: input.fundingFees,
          spreadCost: input.spreadCost,
          slippage: input.slippage,
          bias: input.bias,
          instrumentType: input.instrumentType,
          costProfile: input.costProfile,
          brokerProfile: input.brokerProfile,
          cryptoMarketType: input.cryptoMarketType,
          executionType: input.executionType,
          fundingDirection: input.fundingDirection,
          fundingRateBps: input.fundingRateBps,
          fundingIntervals: input.fundingIntervals,
          quoteAsset: input.quoteAsset,
          leverage: input.leverage,
        })
        return fallbackPnL.autoNetPnL !== null || fallbackPnL.netPnL !== null
      })()
    : false
  const normalizedPnLMode = basePnLMode === 'manual' && canAutoDerivePnL ? 'auto' : basePnLMode

  if (isBlank(input.market)) addError(errors, 'market', 'Bitte einen Markt für den Trade angeben.')
  if (isBlank(input.setup)) addError(errors, 'setup', 'Bitte ein Setup für den Trade wählen.')

  if (hasIncompletePartialExitRow) {
    addError(errors, 'exit', 'Jeder Teilprofit braucht Prozent und Exit-Preis gemeinsam.')
  }

  if (partialCoverage > 100.0001) {
    addError(errors, 'exit', 'Teilprofite dürfen zusammen maximal 100% ergeben.')
  }

  if (normalizedPnLMode === 'manual' || normalizedPnLMode === 'override') {
    if (isBlank(input.netPnL) || netPnL === null) {
      addError(errors, 'netPnL', normalizedPnLMode === 'manual'
        ? 'Im manuellen Modus braucht der Trade ein Net-P&L.'
        : 'Für den Override-Modus braucht der Trade ein manuelles Net-P&L.')
    }
  }

  if (normalizedPnLMode === 'auto' || normalizedPnLMode === 'override') {
    if (!isDirectional) addError(errors, 'bias', 'Für automatische Berechnung muss die Richtung Long oder Short sein.')
    if (entry === null) addError(errors, 'entry', 'Für automatische Berechnung wird ein Entry benötigt.')
    if (exit === null) addError(errors, 'exit', 'Für automatische Berechnung wird ein Exit oder ein vollständiger Teilprofit-Plan benötigt.')
    if (effectivePositionSize === null || effectivePositionSize <= 0) {
      addError(errors, 'positionSize', 'Für automatische Berechnung braucht der Trade eine Positionsgröße oder Margin + Hebel.')
      if (!isBlank(input.marginUsed) && (marginUsed === null || marginUsed <= 0)) {
        addError(errors, 'marginUsed', 'Margin bitte als Zahl größer als 0 angeben.')
      }
      if (isBlank(input.positionSize) && !isBlank(input.marginUsed) && (isBlank(input.leverage) || leverage === null || leverage <= 0)) {
        addError(errors, 'leverage', 'Für Margin-Logik bitte einen Hebel größer als 0 angeben.')
      }
    }

    if ((normalizedInstrumentType === 'futures' || normalizedInstrumentType === 'forex' || normalizedInstrumentType === 'cfd') && (!pointValue || pointValue <= 0)) {
      addError(errors, 'pointValue', 'Für Futures, Forex und CFDs wird ein positiver Punkt- oder Pip-Wert benötigt.')
    }

    if (Object.keys(errors).length === 0) {
      const pnlCheck = computeNetPnLFromExecution({
        explicitPnL: input.netPnL,
        pnlMode: normalizedPnLMode,
        entry: input.entry,
        exit: effectiveExitValue,
        positionSize: effectivePositionSize,
        pointValue: input.pointValue,
        fees: input.fees,
        exchangeFees: input.exchangeFees,
        fundingFees: input.fundingFees,
        spreadCost: input.spreadCost,
        slippage: input.slippage,
        bias: input.bias,
        instrumentType: input.instrumentType,
        costProfile: input.costProfile,
        brokerProfile: input.brokerProfile,
        cryptoMarketType: input.cryptoMarketType,
        executionType: input.executionType,
        fundingDirection: input.fundingDirection,
        fundingRateBps: input.fundingRateBps,
        fundingIntervals: input.fundingIntervals,
        quoteAsset: input.quoteAsset,
        leverage: input.leverage,
      })

      if (pnlCheck.autoNetPnL === null && pnlCheck.netPnL === null) {
        addError(errors, 'exit', 'Die automatische P&L-Berechnung hat keine belastbare Grundlage. Prüfe Entry, Exit, Richtung, Size und Punktwert.')
      }
    }
  }

  if (stopLoss !== null && entry !== null && isDirectional) {
    if (direction.includes('long') && stopLoss >= entry) {
      addError(errors, 'stopLoss', 'Bei Long muss der Stop-Loss unter dem Entry liegen.')
    }
    if (direction.includes('short') && stopLoss <= entry) {
      addError(errors, 'stopLoss', 'Bei Short muss der Stop-Loss über dem Entry liegen.')
    }
  }

  if (takeProfit !== null && entry !== null && isDirectional) {
    if (direction.includes('long') && takeProfit <= entry) {
      addError(errors, 'takeProfit', 'Bei Long sollte das Take-Profit über dem Entry liegen.')
    }
    if (direction.includes('short') && takeProfit >= entry) {
      addError(errors, 'takeProfit', 'Bei Short sollte das Take-Profit unter dem Entry liegen.')
    }
  }

  if (riskPercent !== null && (riskPercent <= 0 || riskPercent > 100)) {
    addError(errors, 'riskPercent', 'Das Risiko in Prozent muss zwischen 0 und 100 liegen.')
  }

  if (!isBlank(input.accountSize) && (accountSize === null || accountSize <= 0)) {
    addError(errors, 'accountSize', 'Die Kontogröße ist optional, muss aber als Zahl größer als 0 vorliegen.')
  }

  if (!isBlank(input.marginUsed) && (marginUsed === null || marginUsed <= 0)) {
    addError(errors, 'marginUsed', 'Die Margin muss als Zahl größer als 0 vorliegen.')
  }

  if (!isBlank(input.accountCurrency) && !/^[A-Za-z]{3,6}$/.test(input.accountCurrency.trim())) {
    addError(errors, 'accountCurrency', 'Kontowährung bitte als Kürzel wie EUR, USD oder USDT angeben.')
  }

  if (!isBlank(input.leverage) && (!leverage || leverage <= 0)) {
    addError(errors, 'leverage', 'Der Hebel muss größer als 0 sein.')
  }

  if (normalizedInstrumentType === 'crypto') {
    if (normalizedCryptoMarketType !== 'manual' && isBlank(input.quoteAsset)) {
      addError(errors, 'quoteAsset', 'Für Krypto bitte ein Quote Asset wie USDT oder USD angeben.')
    }

    if (normalizedCryptoMarketType === 'perps') {
      if (!isBlank(input.fundingRateBps) && fundingRateBps === null) {
        addError(errors, 'fundingRateBps', 'Funding-Rate bitte als Zahl in Bps angeben.')
      }
      if (!isBlank(input.fundingIntervals) && (!isNonNegative(input.fundingIntervals) || !Number.isInteger(fundingIntervals ?? 0))) {
        addError(errors, 'fundingIntervals', 'Funding-Intervalle bitte als ganze Zahl ab 0 angeben.')
      }
    }
  }

  const summary = Object.values(errors)[0] ?? (
    basePnLMode === 'manual' && normalizedPnLMode === 'auto'
      ? 'Trade-Check bereit. Net P&L wird aus Entry, Exit sowie Size oder Margin/Hebel hergeleitet.'
      : `Trade-Check bereit. ${normalizedTags.length} Tags sauber erkannt.`
  )

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalizedTags,
    normalizedPnLMode,
    summary,
  }
}


export type QuickTradeCaptureInput = {
  market: string
  setup: string
  captureResult: string
  notes: string
  screenshotUrl?: string
  tags: string[]
}

export type QuickTradeValidationField = 'captureResult' | 'tags'

export type QuickTradeValidationResult = {
  isValid: boolean
  errors: Partial<Record<QuickTradeValidationField, string>>
  normalizedTags: string[]
  normalizedCaptureResult: 'winner' | 'loser' | 'breakeven' | 'open'
  summary: string
}

function addQuickError(
  errors: Partial<Record<QuickTradeValidationField, string>>,
  field: QuickTradeValidationField,
  message: string,
) {
  if (!errors[field]) errors[field] = message
}

function normalizeQuickCaptureResult(value: string) {
  if (value === 'winner' || value === 'loser' || value === 'breakeven' || value === 'open') return value
  return 'open'
}

export function validateQuickTradeCaptureInput(input: QuickTradeCaptureInput): QuickTradeValidationResult {
  const errors: Partial<Record<QuickTradeValidationField, string>> = {}
  const normalizedTags = normalizeTags(input.tags)
  const normalizedCaptureResult = normalizeQuickCaptureResult(input.captureResult)

  if (isBlank(input.captureResult)) addQuickError(errors, 'captureResult', 'Bitte einen Trade-Stand auswählen.')
  if (normalizedTags.length > 2) addQuickError(errors, 'tags', 'Die Schnellerfassung erlaubt aktuell maximal zwei Tags.')

  const summary = Object.values(errors)[0] ?? `Schnellerfassung bereit. ${normalizedTags.length} Tag${normalizedTags.length === 1 ? '' : 's'} im Schnellzugriff gesichert.`

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalizedTags,
    normalizedCaptureResult,
    summary,
  }
}

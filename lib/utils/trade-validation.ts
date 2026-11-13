import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { getManualTradeNumberFormatHint, parseManualTradeNumber } from '@/lib/utils/manual-trade-number'
import {
  computeNetPnLFromExecution,
  getTradeBrokerProfilePreset,
  getTradeInstrumentPreset,
  normalizeInstrumentType,
  normalizeTradeBrokerProfile,
  normalizeTradeCryptoMarketType,
  normalizeTradePnLMode,
  derivePositionSizeFromMargin,
  deriveEffectiveExitFromPartialExitLegs,
  normalizePartialExitLegs,
} from '@/lib/utils/calculations'
import { getTradeTimeInputError } from '@/lib/utils/trade-time'

export type TradeCaptureInput = {
  market: string
  setup: string
  setupId?: string
  emotion: string
  bias: string
  ruleCheck: string
  reviewRepeatability: string
  reviewState: string
  reviewLesson: string
  tradeOccurredAt: string
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
  captureStatus?: 'complete' | 'incomplete'
  captureResult?: 'winner' | 'loser' | 'breakeven' | 'open'
}

export type TradeValidationField =
  | 'market'
  | 'tradeOccurredAt'
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
  | 'rMultiple'
  | 'fees'
  | 'exchangeFees'
  | 'fundingFees'
  | 'spreadCost'
  | 'slippage'

export type TradeValidationResult = {
  isValid: boolean
  errors: Partial<Record<TradeValidationField, string>>
  normalizedTags: string[]
  normalizedPnLMode: 'manual' | 'auto' | 'override'
  normalizedManualPnL: number | null
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

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)))
}

export function validateTradeCaptureInput(input: TradeCaptureInput, originalTradeTimeIso?: string | null, locale: JournalLocale = 'de'): TradeValidationResult {
  const text = journalText(locale)
  const errors: Partial<Record<TradeValidationField, string>> = {}
  const tradeTimeError = getTradeTimeInputError(input.tradeOccurredAt, originalTradeTimeIso, locale)
  if (tradeTimeError) addError(errors, 'tradeOccurredAt', tradeTimeError)
  const normalizedTags = normalizeTags(input.tags)
  const normalizedBroker = normalizeTradeBrokerProfile(input.brokerProfile)
  const brokerPreset = getTradeBrokerProfilePreset(normalizedBroker)
  const normalizedInstrumentType = normalizeInstrumentType(input.instrumentType || brokerPreset.defaultInstrumentType)
  const instrumentPreset = getTradeInstrumentPreset(normalizedInstrumentType)
  const basePnLMode = normalizeTradePnLMode(input.pnlMode, input.netPnL)
  const normalizedCryptoMarketType = normalizeTradeCryptoMarketType(input.cryptoMarketType)

  function readNumber(field: TradeValidationField, value: string | undefined = input[field]) {
    const amount = parseManualTradeNumber(value, locale)
    if (!isBlank(value) && amount === null) addError(errors, field, getManualTradeNumberFormatHint(locale))
    return amount
  }

  const entry = readNumber('entry')
  const stopLoss = readNumber('stopLoss')
  const takeProfit = readNumber('takeProfit')
  const partialExitRows = [
    { percent: input.partialExit1Percent, price: input.partialExit1Price },
    { percent: input.partialExit2Percent, price: input.partialExit2Price },
    { percent: input.partialExit3Percent, price: input.partialExit3Price },
  ]
  const normalizedPartialExits = normalizePartialExitLegs(partialExitRows)
  for (const { percent, price } of partialExitRows) {
    readNumber('exit', percent ?? '')
    readNumber('exit', price ?? '')
  }
  const partialCoverage = normalizedPartialExits.reduce((sum, leg) => sum + leg.percent, 0)
  const hasIncompletePartialExitRow = partialExitRows.some((row) => (isBlank(row.percent) && !isBlank(row.price)) || (!isBlank(row.percent) && isBlank(row.price)))
  const effectiveExitValue = deriveEffectiveExitFromPartialExitLegs({
    exit: readNumber('exit'),
    partialExits: partialExitRows,
  })
  const exit = effectiveExitValue
  const isExplicitAuto = input.pnlMode?.trim().toLowerCase() === 'auto'
  const netPnL = isExplicitAuto ? null : readNumber('netPnL')
  const positionSize = readNumber('positionSize')
  const pointValue = readNumber('pointValue') ?? brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue
  const leverage = readNumber('leverage')
  const riskPercent = readNumber('riskPercent')
  const accountSize = readNumber('accountSize')
  const marginUsed = readNumber('marginUsed')
  const fundingRateBps = readNumber('fundingRateBps')
  const fundingIntervals = readNumber('fundingIntervals')
  for (const field of ['rMultiple', 'fees', 'exchangeFees', 'fundingFees', 'spreadCost', 'slippage'] as const) readNumber(field)
  const direction = (input.bias ?? '').toLowerCase()
  const isDirectional = direction.includes('long') || direction.includes('short')
  const effectivePositionSize = positionSize ?? derivePositionSizeFromMargin({
    instrumentType: normalizedInstrumentType,
    entry: input.entry,
    marginUsed: input.marginUsed,
    leverage: input.leverage,
    pointValue: input.pointValue,
  })
  const canAutoDerivePnL = netPnL === null
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
  const normalizedPnLMode = netPnL === null && canAutoDerivePnL ? 'auto' : basePnLMode

  if (isBlank(input.market)) addError(errors, 'market', text('Bitte einen Markt für den Trade angeben.', 'Enter a market for this trade.'))
  if (isBlank(input.setup)) addError(errors, 'setup', text('Bitte ein Setup für den Trade wählen.', 'Choose a setup for this trade.'))

  if (hasIncompletePartialExitRow) {
    addError(errors, 'exit', text('Jeder Teilprofit braucht Prozent und Exit-Preis gemeinsam.', 'Enter both the percentage and the price for each partial exit.'))
  }

  if (partialCoverage > 100.0001) {
    addError(errors, 'exit', text('Teilprofite dürfen zusammen maximal 100% ergeben.', 'Partial exits cannot add up to more than 100%.'))
  }
  if (normalizedPnLMode === 'auto' || normalizedPnLMode === 'override') {
    if (!isDirectional) addError(errors, 'bias', text('Für automatische Berechnung muss die Richtung Long oder Short sein.', 'Choose Long or Short for automatic calculation.'))
    if (entry === null) addError(errors, 'entry', text('Für automatische Berechnung wird ein Entry benötigt.', 'Enter an entry price for automatic calculation.'))
    if (exit === null) addError(errors, 'exit', text('Für automatische Berechnung wird ein Exit oder ein vollständiger Teilprofit-Plan benötigt.', 'Enter an exit price or partial exits that cover the full position.'))
    if (effectivePositionSize === null || effectivePositionSize <= 0) {
      addError(errors, 'positionSize', text('Für automatische Berechnung braucht der Trade eine Positionsgröße oder Margin + Hebel.', 'Enter a position size, or enter both margin and leverage.'))
      if (!isBlank(input.marginUsed) && (marginUsed === null || marginUsed <= 0)) {
        addError(errors, 'marginUsed', text('Margin bitte als Zahl größer als 0 angeben.', 'Enter a margin greater than 0.'))
      }
      if (isBlank(input.positionSize) && !isBlank(input.marginUsed) && (isBlank(input.leverage) || leverage === null || leverage <= 0)) {
        addError(errors, 'leverage', text('Für Margin-Logik bitte einen Hebel größer als 0 angeben.', 'Enter leverage greater than 0 when using margin.'))
      }
    }

    if ((normalizedInstrumentType === 'futures' || normalizedInstrumentType === 'forex' || normalizedInstrumentType === 'cfd') && (!pointValue || pointValue <= 0)) {
      addError(errors, 'pointValue', text('Für Futures, Forex und CFDs wird ein positiver Punkt- oder Pip-Wert benötigt.', 'Enter a point or pip value greater than 0 for futures, forex and CFDs.'))
    }

    if (Object.keys(errors).length === 0) {
      const pnlCheck = computeNetPnLFromExecution({
        explicitPnL: netPnL,
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
        addError(errors, 'exit', text('Die automatische P&L-Berechnung hat keine belastbare Grundlage. Prüfe Entry, Exit, Richtung, Size und Punktwert.', 'P&L cannot be calculated from these inputs. Check the entry, exit, direction, position size and point value.'))
      }
    }
  }

  if (stopLoss !== null && entry !== null && isDirectional) {
    if (direction.includes('long') && stopLoss >= entry) {
      addError(errors, 'stopLoss', text('Bei Long muss der Stop-Loss unter dem Entry liegen.', 'The stop loss for a long trade must be below the entry price.'))
    }
    if (direction.includes('short') && stopLoss <= entry) {
      addError(errors, 'stopLoss', text('Bei Short muss der Stop-Loss über dem Entry liegen.', 'The stop loss for a short trade must be above the entry price.'))
    }
  }

  if (takeProfit !== null && entry !== null && isDirectional) {
    if (direction.includes('long') && takeProfit <= entry) {
      addError(errors, 'takeProfit', text('Bei Long sollte das Take-Profit über dem Entry liegen.', 'The take profit for a long trade should be above the entry price.'))
    }
    if (direction.includes('short') && takeProfit >= entry) {
      addError(errors, 'takeProfit', text('Bei Short sollte das Take-Profit unter dem Entry liegen.', 'The take profit for a short trade should be below the entry price.'))
    }
  }

  if (riskPercent !== null && (riskPercent <= 0 || riskPercent > 100)) {
    addError(errors, 'riskPercent', text('Das Risiko in Prozent muss zwischen 0 und 100 liegen.', 'Risk must be between 0% and 100%.'))
  }

  if (!isBlank(input.accountSize) && (accountSize === null || accountSize <= 0)) {
    addError(errors, 'accountSize', text('Die Kontogröße ist optional, muss aber als Zahl größer als 0 vorliegen.', 'Account size is optional. If entered, it must be greater than 0.'))
  }

  if (!isBlank(input.marginUsed) && (marginUsed === null || marginUsed <= 0)) {
    addError(errors, 'marginUsed', text('Die Margin muss als Zahl größer als 0 vorliegen.', 'Margin must be greater than 0.'))
  }

  if (!isBlank(input.accountCurrency) && !/^[A-Za-z]{3,6}$/.test(input.accountCurrency.trim())) {
    addError(errors, 'accountCurrency', text('Kontowährung bitte als Kürzel wie EUR, USD oder USDT angeben.', 'Enter a currency code such as EUR, USD or USDT.'))
  }

  if (!isBlank(input.leverage) && (!leverage || leverage <= 0)) {
    addError(errors, 'leverage', text('Der Hebel muss größer als 0 sein.', 'Leverage must be greater than 0.'))
  }

  if (normalizedInstrumentType === 'crypto') {
    if (normalizedCryptoMarketType !== 'manual' && isBlank(input.quoteAsset)) {
      addError(errors, 'quoteAsset', text('Für Krypto bitte ein Quote Asset wie USDT oder USD angeben.', 'For crypto, enter a quote asset such as USDT or USD.'))
    }

    if (normalizedCryptoMarketType === 'perps') {
      if (!isBlank(input.fundingRateBps) && fundingRateBps === null) {
        addError(errors, 'fundingRateBps', text('Funding-Rate bitte als Zahl in Bps angeben.', 'Enter the funding rate in basis points.'))
      }
      if (!isBlank(input.fundingIntervals) && (fundingIntervals === null || fundingIntervals < 0 || !Number.isInteger(fundingIntervals))) {
        addError(errors, 'fundingIntervals', text('Funding-Intervalle bitte als ganze Zahl ab 0 angeben.', 'Enter a whole number of funding intervals, 0 or greater.'))
      }
    }
  }

  const summary = Object.values(errors)[0] ?? (
    basePnLMode !== 'auto' && normalizedPnLMode === 'auto'
      ? text('Trade-Check bereit. P&L bleibt optional und wird aus Entry, Exit sowie Size oder Margin/Hebel hergeleitet.', 'Trade is ready. P&L is optional and can be calculated from prices and position size or margin and leverage.')
      : text(`Trade-Check bereit. ${normalizedTags.length} Tags sauber erkannt.`, `Trade is ready. Tags: ${normalizedTags.length}.`)
  )

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalizedTags,
    normalizedPnLMode,
    normalizedManualPnL: normalizedPnLMode === 'auto' ? null : netPnL,
    summary,
  }
}


export type QuickTradeCaptureInput = {
  market: string
  setup: string
  captureResult: string
  notes: string
  capturedAt?: string
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

export function validateQuickTradeCaptureInput(input: QuickTradeCaptureInput, locale: JournalLocale = 'de'): QuickTradeValidationResult {
  const text = journalText(locale)
  const errors: Partial<Record<QuickTradeValidationField, string>> = {}
  const normalizedTags = normalizeTags(input.tags)
  const normalizedCaptureResult = normalizeQuickCaptureResult(input.captureResult)

  if (isBlank(input.captureResult)) addQuickError(errors, 'captureResult', text('Bitte einen Trade-Stand auswählen.', 'Select a trade status.'))
  if (normalizedTags.length > 2) addQuickError(errors, 'tags', text('Die Schnellerfassung erlaubt aktuell maximal zwei Tags.', 'Quick entry allows up to two tags.'))

  const summary = Object.values(errors)[0] ?? text(`Schnellerfassung bereit. ${normalizedTags.length} Tag${normalizedTags.length === 1 ? '' : 's'} im Schnellzugriff gesichert.`, 'Quick entry is ready.')

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalizedTags,
    normalizedCaptureResult,
    summary,
  }
}

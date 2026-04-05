import type {
  TradeAccountTemplate,
  TradeBrokerProfile,
  TradeCostProfile,
  TradeCryptoMarketType,
  TradeExecutionType,
  TradeFundingDirection,
  TradeInstrumentType,
  TradeMarketTemplate,
  TradePnLMode,
  TradePnLSource,
} from '@/lib/types/trade'

import {
  type TradeBrokerProfilePreset,
  getTradeAccountTemplatePreset,
  getTradeBrokerProfilePreset,
  getTradeCostProfilePreset,
  getTradeInstrumentPreset,
  normalizeInstrumentType,
  normalizeTradeBrokerProfile,
  normalizeTradeCostProfile,
  normalizeTradeCryptoMarketType,
  normalizeTradeExecutionType,
  normalizeTradeFundingDirection,
  normalizeTradePnLMode,
  getPnLModeLabel,
  getCostProfileLabel,
  getCryptoMarketTypeLabel,
  getInstrumentLabel,
  getBrokerProfileLabel,
  getExecutionTypeLabel,
  getFundingDirectionLabel,
  getAccountTemplateLabel,
  getMarketTemplateLabel,
} from '@/lib/utils/trade-presets'

export {
  type TradeAccountTemplatePreset,
  type TradeBrokerProfilePreset,
  type TradeCostProfilePreset,
  type TradeInstrumentPreset,
  type TradeMarketTemplatePreset,
  getTradeAccountTemplatePreset,
  getTradeBrokerProfilePreset,
  getTradeCostProfilePreset,
  getTradeInstrumentPreset,
  getTradeMarketTemplatePreset,
  normalizeTradeAccountTemplate,
  normalizeTradeBrokerProfile,
  normalizeTradeCostProfile,
  normalizeTradeCryptoMarketType,
  normalizeTradeExecutionType,
  normalizeTradeFundingDirection,
  normalizeTradeMarketTemplate,
  normalizeTradePnLMode,
  normalizeInstrumentType,
  getPnLModeLabel,
  getCostProfileLabel,
  getCryptoMarketTypeLabel,
  getInstrumentLabel,
  getBrokerProfileLabel,
  getExecutionTypeLabel,
  getFundingDirectionLabel,
  getAccountTemplateLabel,
  getMarketTemplateLabel,
} from '@/lib/utils/trade-presets'

function sanitizeNumberString(value: string | number): string {
  const stripped = String(value)
    .replace(/[€$£¥%Rr]/g, '')
    .replace(/\s/g, '')
    .trim()

  if (!stripped) return ''

  const hasComma = stripped.includes(',')
  const hasDot = stripped.includes('.')

  if (hasComma && hasDot) {
    const lastComma = stripped.lastIndexOf(',')
    const lastDot = stripped.lastIndexOf('.')

    if (lastComma > lastDot) {
      return stripped.replace(/\./g, '').replace(',', '.')
    }

    return stripped.replace(/,/g, '')
  }

  if (hasComma) {
    return stripped.replace(/\./g, '').replace(',', '.')
  }

  return stripped
}

export function parseTradingNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(sanitizeNumberString(value))
  return Number.isFinite(numeric) ? numeric : null
}

export function parseEuro(value: string | number | null | undefined): number {
  return parseTradingNumber(value) ?? 0
}

export function parseR(value: string | number | null | undefined): number {
  return parseTradingNumber(value) ?? 0
}

export function parsePercent(value: string | number | null | undefined): number | null {
  return parseTradingNumber(value)
}


export type PartialExitLeg = {
  percent: number
  price: number
}

export function normalizePartialExitLegs(entries: Array<{ percent?: string | number | null; price?: string | number | null } | null | undefined>) {
  return entries
    .map((entry) => {
      const percent = parseTradingNumber(entry?.percent)
      const price = parseTradingNumber(entry?.price)
      if (percent === null || price === null || percent <= 0 || price <= 0) return null
      return { percent, price }
    })
    .filter((entry): entry is PartialExitLeg => Boolean(entry))
}

export function deriveEffectiveExitFromPartialExitLegs({
  exit,
  partialExits,
}: {
  exit?: string | number | null
  partialExits?: Array<{ percent?: string | number | null; price?: string | number | null } | null | undefined>
}) {
  const normalized = normalizePartialExitLegs(partialExits ?? [])
  const explicitExit = parseTradingNumber(exit)

  if (!normalized.length) return explicitExit

  const coveredPercent = normalized.reduce((sum, leg) => sum + leg.percent, 0)
  if (coveredPercent > 100.0001) return null

  let weightedSum = normalized.reduce((sum, leg) => sum + (leg.percent * leg.price), 0)
  let totalPercent = coveredPercent

  if (coveredPercent < 100) {
    if (explicitExit === null) return coveredPercent >= 99.999 ? weightedSum / coveredPercent : null
    const remainder = 100 - coveredPercent
    weightedSum += remainder * explicitExit
    totalPercent += remainder
  }

  if (totalPercent <= 0) return explicitExit
  const effectiveExit = weightedSum / totalPercent
  return Number.isFinite(effectiveExit) ? effectiveExit : null
}

export function formatPartialExitSummary(partialExits: Array<{ percent?: string | number | null; price?: string | number | null } | null | undefined>) {
  const normalized = normalizePartialExitLegs(partialExits)
  if (!normalized.length) return ''
  return normalized.map((leg, index) => `TP${index + 1}: ${formatPlainNumber(leg.percent, 0)}% @ ${formatPlainNumber(leg.price, 4)}`).join(' · ')
}

export function getPartialExitPlanInfo({
  exit,
  partialExits,
}: {
  exit?: string | number | null
  partialExits?: Array<{ percent?: string | number | null; price?: string | number | null } | null | undefined>
}) {
  const normalized = normalizePartialExitLegs(partialExits ?? [])
  const coveredPercent = normalized.reduce((sum, leg) => sum + leg.percent, 0)
  const remainderPercent = Math.max(0, Number((100 - coveredPercent).toFixed(4)))
  const effectiveExit = deriveEffectiveExitFromPartialExitLegs({ exit, partialExits: normalized })

  return {
    legs: normalized,
    count: normalized.length,
    coveredPercent: Number(coveredPercent.toFixed(4)),
    remainderPercent,
    hasRemainder: remainderPercent > 0.0001,
    effectiveExit,
    summary: formatPartialExitSummary(normalized),
  }
}

export function formatPartialExitCoverageLabel(coveredPercent: number, remainderPercent?: number | null) {
  if (!Number.isFinite(coveredPercent) || coveredPercent <= 0) return ''
  if ((remainderPercent ?? 0) > 0.0001) return `${formatPlainNumber(coveredPercent, 0)}% gestaffelt · ${formatPlainNumber(remainderPercent ?? 0, 0)}% Rest offen`
  return `${formatPlainNumber(coveredPercent, 0)}% gestaffelt geschlossen`
}

export function getPartialExitSizePlan({
  positionSize,
  partialExits,
}: {
  positionSize?: string | number | null
  partialExits?: Array<{ percent?: string | number | null; price?: string | number | null } | null | undefined>
}) {
  const normalized = normalizePartialExitLegs(partialExits ?? [])
  const coveredPercent = normalized.reduce((sum, leg) => sum + leg.percent, 0)
  const remainderPercent = Math.max(0, Number((100 - coveredPercent).toFixed(4)))
  const resolvedSize = parseTradingNumber(positionSize)

  const realizedSize = resolvedSize !== null ? Number(((resolvedSize * coveredPercent) / 100).toFixed(4)) : null
  const remainingSize = resolvedSize !== null ? Number(((resolvedSize * remainderPercent) / 100).toFixed(4)) : null

  return {
    coveredPercent: Number(coveredPercent.toFixed(4)),
    remainderPercent,
    realizedSize,
    remainingSize,
    hasOpenRemainder: remainderPercent > 0.0001,
  }
}

export function formatPartialExitRealizedLabel(coveredPercent: number, realizedSize?: number | null) {
  if (!Number.isFinite(coveredPercent) || coveredPercent <= 0) return ''
  if (realizedSize === null || realizedSize === undefined) return `${formatPlainNumber(coveredPercent, 0)}% bereits realisiert`
  return `${formatPlainNumber(coveredPercent, 0)}% realisiert · ${formatPlainNumber(realizedSize, 4)} Size`
}

export function formatPartialExitRemainingLabel(remainderPercent: number, remainingSize?: number | null) {
  if (!Number.isFinite(remainderPercent) || remainderPercent <= 0.0001) return ''
  if (remainingSize === null || remainingSize === undefined) return `${formatPlainNumber(remainderPercent, 0)}% Rest noch offen`
  return `${formatPlainNumber(remainderPercent, 0)}% Rest offen · ${formatPlainNumber(remainingSize, 4)} Size`
}

export function formatCurrency(value: number, fractionDigits = 0): string {
  const formatter = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

  return `${value >= 0 ? '+' : '-'}${formatter.format(Math.abs(value))} €`
}

export function formatRMultiple(value: number, fractionDigits = 2): string {
  const formatter = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

  return `${value >= 0 ? '+' : '-'}${formatter.format(Math.abs(value))}R`
}

export function formatPlainNumber(value: number, fractionDigits = 2): string {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export function getTradeDirection(bias?: string | null): 'long' | 'short' | 'neutral' {
  const normalized = (bias ?? '').toLowerCase()
  if (normalized.includes('short')) return 'short'
  if (normalized.includes('long')) return 'long'
  return 'neutral'
}

export function derivePlannedRMultiple({
  entry,
  stopLoss,
  takeProfit,
  bias,
}: {
  entry?: string | number | null
  stopLoss?: string | number | null
  takeProfit?: string | number | null
  bias?: string | null
}): number | null {
  const entryValue = parseTradingNumber(entry)
  const stopValue = parseTradingNumber(stopLoss)
  const takeProfitValue = parseTradingNumber(takeProfit)
  const direction = getTradeDirection(bias)

  if (entryValue === null || stopValue === null || takeProfitValue === null || direction === 'neutral') return null

  const risk = direction === 'short' ? stopValue - entryValue : entryValue - stopValue
  const reward = direction === 'short' ? entryValue - takeProfitValue : takeProfitValue - entryValue

  if (risk <= 0 || reward <= 0) return null

  const rMultiple = reward / risk
  return Number.isFinite(rMultiple) ? rMultiple : null
}

export function deriveRMultiple(args: {
  entry?: string | number | null
  stopLoss?: string | number | null
  takeProfit?: string | number | null
  bias?: string | null
}): number | null {
  return derivePlannedRMultiple(args)
}

export type PnLComputation = {
  netPnL: number | null
  autoNetPnL: number | null
  grossPnL: number | null
  totalCosts: number
  fees: number
  exchangeFees: number
  fundingFees: number
  spreadCost: number
  slippage: number
  priceMove: number | null
  multiplier: number | null
  instrumentType: TradeInstrumentType
  brokerProfile: TradeBrokerProfile
  pnlMode: TradePnLMode
  costProfile: TradeCostProfile
  cryptoMarketType: TradeCryptoMarketType
  executionType: TradeExecutionType
  fundingDirection: TradeFundingDirection
  fundingRateBps: number | null
  fundingIntervals: number | null
  quoteAsset: string | null
  leverage: number | null
  source: TradePnLSource
}

function deriveGrossPnL({
  instrumentType,
  direction,
  entry,
  exit,
  positionSize,
  pointValue,
}: {
  instrumentType: TradeInstrumentType
  direction: 'long' | 'short' | 'neutral'
  entry: number | null
  exit: number | null
  positionSize: number | null
  pointValue: number | null
}): { grossPnL: number | null; priceMove: number | null; multiplier: number | null } {
  if (direction === 'neutral' || entry === null || exit === null || positionSize === null || positionSize <= 0) {
    return { grossPnL: null, priceMove: null, multiplier: null }
  }

  const rawPriceMove = direction === 'short' ? entry - exit : exit - entry
  const multiplier = instrumentType === 'futures' || instrumentType === 'forex' || instrumentType === 'cfd'
    ? pointValue ?? null
    : 1

  if ((instrumentType === 'futures' || instrumentType === 'forex' || instrumentType === 'cfd') && (multiplier === null || multiplier <= 0)) {
    return { grossPnL: null, priceMove: rawPriceMove, multiplier: null }
  }

  const effectiveMultiplier = multiplier ?? 1
  const grossPnL = rawPriceMove * positionSize * effectiveMultiplier

  return {
    grossPnL: Number.isFinite(grossPnL) ? grossPnL : null,
    priceMove: rawPriceMove,
    multiplier: effectiveMultiplier,
  }
}

function resolveCostValue(value: string | number | null | undefined, fallback: number | null): number {
  return parseTradingNumber(value) ?? fallback ?? 0
}

function getExecutionRateBps(executionType: TradeExecutionType, brokerPreset: TradeBrokerProfilePreset): number | null {
  if (executionType === 'maker') return brokerPreset.defaultMakerFeeBps
  if (executionType === 'taker') return brokerPreset.defaultTakerFeeBps
  if (executionType === 'mixed') {
    if (brokerPreset.defaultMakerFeeBps === null && brokerPreset.defaultTakerFeeBps === null) return null
    if (brokerPreset.defaultMakerFeeBps === null) return brokerPreset.defaultTakerFeeBps
    if (brokerPreset.defaultTakerFeeBps === null) return brokerPreset.defaultMakerFeeBps
    return (brokerPreset.defaultMakerFeeBps + brokerPreset.defaultTakerFeeBps) / 2
  }
  return null
}

export function deriveTradeNotional({
  instrumentType,
  entry,
  positionSize,
  pointValue,
}: {
  instrumentType: TradeInstrumentType
  entry: string | number | null | undefined
  positionSize: string | number | null | undefined
  pointValue: string | number | null | undefined
}): number | null {
  const entryValue = parseTradingNumber(entry)
  const sizeValue = parseTradingNumber(positionSize)
  if (entryValue === null || sizeValue === null || sizeValue <= 0) return null
  const point = parseTradingNumber(pointValue)
  const multiplier = instrumentType === 'futures' || instrumentType === 'forex' || instrumentType === 'cfd' ? point ?? 1 : 1
  const notional = Math.abs(entryValue * sizeValue * multiplier)
  return Number.isFinite(notional) ? notional : null
}


export function derivePositionSizeFromMargin({
  instrumentType,
  entry,
  marginUsed,
  leverage,
  pointValue,
}: {
  instrumentType: TradeInstrumentType
  entry: string | number | null | undefined
  marginUsed: string | number | null | undefined
  leverage: string | number | null | undefined
  pointValue: string | number | null | undefined
}): number | null {
  const entryValue = parseTradingNumber(entry)
  const marginValue = parseTradingNumber(marginUsed)
  const leverageValue = parseTradingNumber(leverage)
  const point = parseTradingNumber(pointValue)
  if (entryValue === null || entryValue <= 0 || marginValue === null || marginValue <= 0 || leverageValue === null || leverageValue <= 0) {
    return null
  }
  const multiplier = instrumentType === 'futures' || instrumentType === 'forex' || instrumentType === 'cfd' ? point ?? 1 : 1
  if (multiplier <= 0) return null
  const size = (marginValue * leverageValue) / (entryValue * multiplier)
  return Number.isFinite(size) && size > 0 ? size : null
}

export function deriveMarginUsed({
  instrumentType,
  entry,
  positionSize,
  leverage,
  pointValue,
}: {
  instrumentType: TradeInstrumentType
  entry: string | number | null | undefined
  positionSize: string | number | null | undefined
  leverage: string | number | null | undefined
  pointValue: string | number | null | undefined
}): number | null {
  const leverageValue = parseTradingNumber(leverage)
  if (leverageValue === null || leverageValue <= 0) return null
  const notional = deriveTradeNotional({
    instrumentType,
    entry,
    positionSize,
    pointValue,
  })
  if (notional === null) return null
  const margin = notional / leverageValue
  return Number.isFinite(margin) && margin > 0 ? margin : null
}


export type TradeCostBreakdown = {
  fees: number
  exchangeFees: number
  fundingFees: number
  spreadCost: number
  slippage: number
  totalCosts: number
  executionType: TradeExecutionType
  fundingDirection: TradeFundingDirection
  fundingRateBps: number | null
  fundingIntervals: number | null
}

export function resolveTradeCostBreakdown({
  costProfile,
  brokerProfile,
  instrumentType,
  entry,
  positionSize,
  pointValue,
  fees,
  exchangeFees,
  fundingFees,
  spreadCost,
  slippage,
  cryptoMarketType,
  executionType,
  fundingDirection,
  fundingRateBps,
  fundingIntervals,
}: {
  costProfile?: string | null
  brokerProfile?: string | null
  instrumentType?: string | null
  entry?: string | number | null
  positionSize?: string | number | null
  pointValue?: string | number | null
  cryptoMarketType?: string | null
  executionType?: string | null
  fundingDirection?: string | null
  fundingRateBps?: string | number | null
  fundingIntervals?: string | number | null
  fees?: string | number | null
  exchangeFees?: string | number | null
  fundingFees?: string | number | null
  spreadCost?: string | number | null
  slippage?: string | number | null
}): TradeCostBreakdown {
  const normalizedBroker = normalizeTradeBrokerProfile(brokerProfile)
  const brokerPreset = getTradeBrokerProfilePreset(normalizedBroker)
  const normalizedInstrument = normalizeInstrumentType(instrumentType ?? brokerPreset.defaultInstrumentType)
  const normalizedCryptoMarketType = normalizeTradeCryptoMarketType(cryptoMarketType)
  const normalizedExecutionType = normalizeTradeExecutionType(
    executionType ?? (normalizedInstrument === 'crypto' ? brokerPreset.defaultExecutionType : 'manual'),
  )
  const normalizedFundingDirection = normalizeTradeFundingDirection(
    fundingDirection ?? (normalizedInstrument === 'crypto' ? brokerPreset.defaultFundingDirection : 'manual'),
  )
  const normalizedCostProfile = normalizeTradeCostProfile(costProfile ?? brokerPreset.defaultCostProfile)
  const costPreset = getTradeCostProfilePreset(normalizedCostProfile)
  const notional = deriveTradeNotional({
    instrumentType: normalizedInstrument,
    entry,
    positionSize,
    pointValue,
  })
  const executionRateBps = getExecutionRateBps(normalizedExecutionType, brokerPreset)
  const derivedFees = fees === null || fees === undefined || fees === ''
    ? (notional !== null && executionRateBps !== null ? (notional * executionRateBps) / 10000 : null)
    : null
  const resolvedFees = resolveCostValue(fees, derivedFees ?? brokerPreset.defaultFees ?? costPreset.defaultFees)
  const resolvedExchangeFees = resolveCostValue(
    exchangeFees,
    brokerPreset.defaultExchangeFees ?? costPreset.defaultExchangeFees,
  )
  const normalizedFundingRate = parseTradingNumber(fundingRateBps) ?? brokerPreset.defaultFundingRateBps ?? null
  const normalizedFundingIntervals =
    parseTradingNumber(fundingIntervals) ?? brokerPreset.defaultFundingIntervals ?? (normalizedFundingDirection === 'flat' ? 0 : null)
  const fundingFallback =
    normalizedCryptoMarketType === 'spot' && (fundingFees === null || fundingFees === undefined || fundingFees === '')
      ? 0
      : brokerPreset.defaultFundingFees ?? costPreset.defaultFundingFees
  const derivedFunding =
    fundingFees === null || fundingFees === undefined || fundingFees === ''
      ? (() => {
          if (normalizedInstrument !== 'crypto' || normalizedCryptoMarketType !== 'perps') return null
          if (normalizedFundingDirection === 'flat') return 0
          if (notional === null || normalizedFundingRate === null || normalizedFundingIntervals === null) return null
          const baseFunding = (notional * normalizedFundingRate * normalizedFundingIntervals) / 10000
          if (!Number.isFinite(baseFunding)) return null
          return normalizedFundingDirection === 'received' ? -Math.abs(baseFunding) : Math.abs(baseFunding)
        })()
      : null
  const resolvedFundingFees = resolveCostValue(fundingFees, derivedFunding ?? fundingFallback)
  const resolvedSpreadCost = resolveCostValue(
    spreadCost,
    brokerPreset.defaultSpreadCost ?? costPreset.defaultSpreadCost,
  )
  const resolvedSlippage = resolveCostValue(slippage, brokerPreset.defaultSlippage ?? costPreset.defaultSlippage)

  return {
    fees: resolvedFees,
    exchangeFees: resolvedExchangeFees,
    fundingFees: resolvedFundingFees,
    spreadCost: resolvedSpreadCost,
    slippage: resolvedSlippage,
    totalCosts: resolvedFees + resolvedExchangeFees + resolvedFundingFees + resolvedSpreadCost + resolvedSlippage,
    executionType: normalizedExecutionType,
    fundingDirection: normalizedFundingDirection,
    fundingRateBps: normalizedFundingRate,
    fundingIntervals: normalizedFundingIntervals,
  }
}

export function computeNetPnLFromExecution({
  explicitPnL,
  pnlMode,
  entry,
  exit,
  positionSize,
  pointValue,
  fees,
  exchangeFees,
  fundingFees,
  spreadCost,
  slippage,
  bias,
  instrumentType,
  costProfile,
  brokerProfile,
  cryptoMarketType,
  executionType,
  fundingDirection,
  fundingRateBps,
  fundingIntervals,
  quoteAsset,
  leverage,
}: {
  explicitPnL?: string | number | null
  pnlMode?: string | null
  entry?: string | number | null
  exit?: string | number | null
  positionSize?: string | number | null
  pointValue?: string | number | null
  fees?: string | number | null
  exchangeFees?: string | number | null
  fundingFees?: string | number | null
  spreadCost?: string | number | null
  slippage?: string | number | null
  bias?: string | null
  instrumentType?: string | null
  costProfile?: string | null
  brokerProfile?: string | null
  cryptoMarketType?: string | null
  executionType?: string | null
  fundingDirection?: string | null
  fundingRateBps?: string | number | null
  fundingIntervals?: string | number | null
  quoteAsset?: string | null
  leverage?: string | number | null
}): PnLComputation {
  const manualPnL = parseTradingNumber(explicitPnL)
  const normalizedBroker = normalizeTradeBrokerProfile(brokerProfile)
  const brokerPreset = getTradeBrokerProfilePreset(normalizedBroker)
  const normalizedInstrument = normalizeInstrumentType(instrumentType ?? brokerPreset.defaultInstrumentType)
  const instrumentPreset = getTradeInstrumentPreset(normalizedInstrument)
  const normalizedCryptoMarketType =
    normalizedInstrument === 'crypto'
      ? normalizeTradeCryptoMarketType(cryptoMarketType || brokerPreset.defaultCryptoMarketType)
      : 'manual'
  const normalizedQuoteAsset = normalizedInstrument === 'crypto' ? (quoteAsset?.trim().toUpperCase() || brokerPreset.defaultQuoteAsset || instrumentPreset.defaultCurrency) : null
  const normalizedLeverage = parseTradingNumber(leverage) ?? (normalizedInstrument === 'crypto' ? brokerPreset.defaultLeverage ?? null : null)
  const normalizedMode = normalizeTradePnLMode(pnlMode, explicitPnL)
  const normalizedCostProfile = normalizeTradeCostProfile(
    costProfile ?? brokerPreset.defaultCostProfile ?? instrumentPreset.defaultCostProfile,
  )
  const costPreset = getTradeCostProfilePreset(normalizedCostProfile)
  const costBreakdown = resolveTradeCostBreakdown({
    costProfile: normalizedCostProfile,
    brokerProfile: normalizedBroker,
    instrumentType: normalizedInstrument,
    entry,
    positionSize,
    pointValue,
    fees,
    exchangeFees,
    fundingFees,
    spreadCost,
    slippage,
    cryptoMarketType: normalizedCryptoMarketType,
    executionType,
    fundingDirection,
    fundingRateBps,
    fundingIntervals,
  })
  const totalCosts = costBreakdown.totalCosts

  if (normalizedMode === 'manual') {
    if (manualPnL === null) {
      return {
        netPnL: null,
        autoNetPnL: null,
        grossPnL: null,
        totalCosts,
        fees: costBreakdown.fees,
        exchangeFees: costBreakdown.exchangeFees,
        fundingFees: costBreakdown.fundingFees,
        spreadCost: costBreakdown.spreadCost,
        slippage: costBreakdown.slippage,
        priceMove: null,
        multiplier: null,
        instrumentType: normalizedInstrument,
        brokerProfile: normalizedBroker,
        pnlMode: normalizedMode,
        costProfile: normalizedCostProfile,
        cryptoMarketType: normalizedCryptoMarketType,
        executionType: costBreakdown.executionType,
        fundingDirection: costBreakdown.fundingDirection,
        fundingRateBps: costBreakdown.fundingRateBps,
        fundingIntervals: costBreakdown.fundingIntervals,
        quoteAsset: normalizedQuoteAsset,
        leverage: normalizedLeverage,
        source: 'missing',
      }
    }

    return {
      netPnL: manualPnL,
      autoNetPnL: null,
      grossPnL: totalCosts ? manualPnL + totalCosts : manualPnL,
      totalCosts,
      fees: costBreakdown.fees,
      exchangeFees: costBreakdown.exchangeFees,
      fundingFees: costBreakdown.fundingFees,
      spreadCost: costBreakdown.spreadCost,
      slippage: costBreakdown.slippage,
      priceMove: null,
      multiplier: null,
      instrumentType: normalizedInstrument,
      brokerProfile: normalizedBroker,
      pnlMode: normalizedMode,
      costProfile: normalizedCostProfile,
      cryptoMarketType: normalizedCryptoMarketType,
      executionType: costBreakdown.executionType,
      fundingDirection: costBreakdown.fundingDirection,
      fundingRateBps: costBreakdown.fundingRateBps,
      fundingIntervals: costBreakdown.fundingIntervals,
      quoteAsset: normalizedQuoteAsset,
      leverage: normalizedLeverage,
      source: 'manual',
    }
  }

  const direction = getTradeDirection(bias)
  const entryValue = parseTradingNumber(entry)
  const exitValue = parseTradingNumber(exit)
  const positionSizeValue = parseTradingNumber(positionSize)
  const pointValueNumber = parseTradingNumber(pointValue) ?? brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue
  const gross = deriveGrossPnL({
    instrumentType: normalizedInstrument,
    direction,
    entry: entryValue,
    exit: exitValue,
    positionSize: positionSizeValue,
    pointValue: pointValueNumber,
  })

  if (gross.grossPnL === null) {
    return {
      netPnL: normalizedMode === 'override' && manualPnL !== null ? manualPnL : null,
      autoNetPnL: null,
      grossPnL: null,
      totalCosts,
      fees: costBreakdown.fees,
      exchangeFees: costBreakdown.exchangeFees,
      fundingFees: costBreakdown.fundingFees,
      spreadCost: costBreakdown.spreadCost,
      slippage: costBreakdown.slippage,
      priceMove: gross.priceMove,
      multiplier: gross.multiplier,
      instrumentType: normalizedInstrument,
      brokerProfile: normalizedBroker,
      pnlMode: normalizedMode,
      costProfile: normalizedCostProfile,
      cryptoMarketType: normalizedCryptoMarketType,
      executionType: costBreakdown.executionType,
      fundingDirection: costBreakdown.fundingDirection,
      fundingRateBps: costBreakdown.fundingRateBps,
      fundingIntervals: costBreakdown.fundingIntervals,
      quoteAsset: normalizedQuoteAsset,
      leverage: normalizedLeverage,
      source: normalizedMode === 'override' && manualPnL !== null ? 'override' : 'missing',
    }
  }

  const autoNetPnL = gross.grossPnL - totalCosts
  const safeAutoNet = Number.isFinite(autoNetPnL) ? autoNetPnL : null

  if (normalizedMode === 'override' && manualPnL !== null) {
    return {
      netPnL: manualPnL,
      autoNetPnL: safeAutoNet,
      grossPnL: gross.grossPnL,
      totalCosts,
      fees: costBreakdown.fees,
      exchangeFees: costBreakdown.exchangeFees,
      fundingFees: costBreakdown.fundingFees,
      spreadCost: costBreakdown.spreadCost,
      slippage: costBreakdown.slippage,
      priceMove: gross.priceMove,
      multiplier: gross.multiplier,
      instrumentType: normalizedInstrument,
      brokerProfile: normalizedBroker,
      pnlMode: normalizedMode,
      costProfile: normalizedCostProfile,
      cryptoMarketType: normalizedCryptoMarketType,
      executionType: costBreakdown.executionType,
      fundingDirection: costBreakdown.fundingDirection,
      fundingRateBps: costBreakdown.fundingRateBps,
      fundingIntervals: costBreakdown.fundingIntervals,
      quoteAsset: normalizedQuoteAsset,
      leverage: normalizedLeverage,
      source: 'override',
    }
  }

  return {
    netPnL: safeAutoNet,
    autoNetPnL: safeAutoNet,
    grossPnL: gross.grossPnL,
    totalCosts,
    fees: costBreakdown.fees,
    exchangeFees: costBreakdown.exchangeFees,
    fundingFees: costBreakdown.fundingFees,
    spreadCost: costBreakdown.spreadCost,
    slippage: costBreakdown.slippage,
    priceMove: gross.priceMove,
    multiplier: gross.multiplier,
    instrumentType: normalizedInstrument,
    brokerProfile: normalizedBroker,
    pnlMode: normalizedMode,
    costProfile: normalizedCostProfile,
    cryptoMarketType: normalizedCryptoMarketType,
    executionType: costBreakdown.executionType,
    fundingDirection: costBreakdown.fundingDirection,
    fundingRateBps: costBreakdown.fundingRateBps,
    fundingIntervals: costBreakdown.fundingIntervals,
    quoteAsset: normalizedQuoteAsset,
    leverage: normalizedLeverage,
    source: safeAutoNet === null ? 'missing' : 'derived',
  }
}

export type TradeComputation = {
  netPnL: number | null
  autoNetPnL: number | null
  grossPnL: number | null
  pnlSource: TradePnLSource
  pnlMode: TradePnLMode
  costProfile: TradeCostProfile
  brokerProfile: TradeBrokerProfile
  totalCosts: number
  fees: number
  exchangeFees: number
  fundingFees: number
  spreadCost: number
  slippage: number
  priceMove: number | null
  multiplier: number | null
  rValue: number
  priceRisk: number | null
  plannedReward: number | null
  riskRewardRatio: number | null
  riskAmount: number | null
  riskPercent: number | null
  plannedRiskAmount: number | null
  actualRiskPercent: number | null
  exposure: number | null
  marginUsed: number | null
  accountSize: number | null
  direction: 'long' | 'short' | 'neutral'
  rSource: 'manual' | 'planned' | 'missing'
  instrumentType: TradeInstrumentType
  cryptoMarketType: TradeCryptoMarketType
  executionType: TradeExecutionType
  fundingDirection: TradeFundingDirection
  fundingRateBps: number | null
  fundingIntervals: number | null
  quoteAsset: string | null
  leverage: number | null
  accountCurrency: string | null
  positionSize: number | null
  pointValue: number | null
}

export function computeTradeMetrics({
  pnl,
  pnlMode,
  costProfile,
  brokerProfile,
  rMultiple,
  entry,
  stopLoss,
  takeProfit,
  exit,
  bias,
  instrumentType,
  positionSize,
  pointValue,
  fees,
  exchangeFees,
  fundingFees,
  spreadCost,
  slippage,
  accountCurrency,
  riskPercent,
  accountSize,
  cryptoMarketType,
  executionType,
  fundingDirection,
  fundingRateBps,
  fundingIntervals,
  quoteAsset,
  leverage,
}: {
  pnl?: string | number | null
  pnlMode?: string | null
  costProfile?: string | null
  brokerProfile?: string | null
  rMultiple?: string | number | null
  entry?: string | number | null
  stopLoss?: string | number | null
  takeProfit?: string | number | null
  exit?: string | number | null
  bias?: string | null
  instrumentType?: string | null
  positionSize?: string | number | null
  pointValue?: string | number | null
  fees?: string | number | null
  exchangeFees?: string | number | null
  fundingFees?: string | number | null
  spreadCost?: string | number | null
  slippage?: string | number | null
  accountCurrency?: string | null
  riskPercent?: string | number | null
  accountSize?: string | number | null
  cryptoMarketType?: string | null
  executionType?: string | null
  fundingDirection?: string | null
  fundingRateBps?: string | number | null
  fundingIntervals?: string | number | null
  quoteAsset?: string | null
  leverage?: string | number | null
}): TradeComputation {
  const normalizedBroker = normalizeTradeBrokerProfile(brokerProfile)
  const brokerPreset = getTradeBrokerProfilePreset(normalizedBroker)
  const instrumentPreset = getTradeInstrumentPreset(instrumentType ?? brokerPreset.defaultInstrumentType)
  const pnlComputation = computeNetPnLFromExecution({
    explicitPnL: pnl,
    pnlMode,
    entry,
    exit,
    positionSize,
    pointValue,
    fees,
    exchangeFees,
    fundingFees,
    spreadCost,
    slippage,
    bias,
    instrumentType,
    costProfile,
    brokerProfile,
    cryptoMarketType,
    executionType,
    fundingDirection,
    fundingRateBps,
    fundingIntervals,
    quoteAsset,
    leverage,
  })
  const manualR = parseTradingNumber(rMultiple)
  const plannedR = derivePlannedRMultiple({ entry, stopLoss, takeProfit, bias })
  const direction = getTradeDirection(bias)
  const entryValue = parseTradingNumber(entry)
  const stopValue = parseTradingNumber(stopLoss)
  const takeProfitValue = parseTradingNumber(takeProfit)
  const positionSizeValue = parseTradingNumber(positionSize)
  const pointValueValue = parseTradingNumber(pointValue) ?? brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue
  const riskPercentValue = parseTradingNumber(riskPercent)
  const accountSizeValue = parseTradingNumber(accountSize)
  const exposure = deriveTradeNotional({
    instrumentType: pnlComputation.instrumentType,
    entry,
    positionSize,
    pointValue,
  })
  const marginUsed = deriveMarginUsed({
    instrumentType: pnlComputation.instrumentType,
    entry,
    positionSize,
    leverage: pnlComputation.leverage,
    pointValue,
  })

  const priceRisk =
    entryValue !== null && stopValue !== null && direction !== 'neutral'
      ? direction === 'short'
        ? stopValue - entryValue
        : entryValue - stopValue
      : null

  const normalizedRisk = priceRisk !== null && priceRisk > 0 ? priceRisk : null

  const plannedReward =
    entryValue !== null && takeProfitValue !== null && direction !== 'neutral'
      ? direction === 'short'
        ? entryValue - takeProfitValue
        : takeProfitValue - entryValue
      : null

  const normalizedReward = plannedReward !== null && plannedReward > 0 ? plannedReward : null
  const riskRewardRatio =
    normalizedRisk !== null && normalizedReward !== null ? normalizedReward / normalizedRisk : null

  const effectiveRiskMultiplier =
    pnlComputation.instrumentType === 'futures' || pnlComputation.instrumentType === 'forex' || pnlComputation.instrumentType === 'cfd'
      ? pointValueValue ?? null
      : 1
  const stopRiskAmount =
    normalizedRisk !== null && positionSizeValue !== null && positionSizeValue > 0 && effectiveRiskMultiplier !== null
      ? Math.abs(normalizedRisk * positionSizeValue * effectiveRiskMultiplier)
      : null

  const rValue = manualR ?? plannedR ?? 0
  const rSource = manualR !== null ? 'manual' : plannedR !== null ? 'planned' : 'missing'
  const pnlBasedRiskAmount = pnlComputation.netPnL !== null && rValue !== 0 ? Math.abs(pnlComputation.netPnL / rValue) : null
  const riskAmount = stopRiskAmount ?? pnlBasedRiskAmount
  const plannedRiskAmount =
    accountSizeValue !== null && accountSizeValue > 0 && riskPercentValue !== null && riskPercentValue > 0
      ? (accountSizeValue * riskPercentValue) / 100
      : null
  const actualRiskPercent =
    accountSizeValue !== null && accountSizeValue > 0 && stopRiskAmount !== null
      ? (stopRiskAmount / accountSizeValue) * 100
      : null

  return {
    netPnL: pnlComputation.netPnL,
    autoNetPnL: pnlComputation.autoNetPnL,
    grossPnL: pnlComputation.grossPnL,
    pnlSource: pnlComputation.source,
    pnlMode: pnlComputation.pnlMode,
    costProfile: pnlComputation.costProfile,
    brokerProfile: pnlComputation.brokerProfile,
    totalCosts: pnlComputation.totalCosts,
    fees: pnlComputation.fees,
    exchangeFees: pnlComputation.exchangeFees,
    fundingFees: pnlComputation.fundingFees,
    spreadCost: pnlComputation.spreadCost,
    slippage: pnlComputation.slippage,
    priceMove: pnlComputation.priceMove,
    multiplier: pnlComputation.multiplier,
    rValue,
    priceRisk: normalizedRisk,
    plannedReward: normalizedReward,
    riskRewardRatio: riskRewardRatio && Number.isFinite(riskRewardRatio) ? riskRewardRatio : null,
    riskAmount: riskAmount && Number.isFinite(riskAmount) ? riskAmount : null,
    riskPercent: riskPercentValue !== null && Number.isFinite(riskPercentValue) ? riskPercentValue : null,
    plannedRiskAmount: plannedRiskAmount && Number.isFinite(plannedRiskAmount) ? plannedRiskAmount : null,
    actualRiskPercent: actualRiskPercent && Number.isFinite(actualRiskPercent) ? actualRiskPercent : null,
    exposure: exposure && Number.isFinite(exposure) ? exposure : null,
    marginUsed: marginUsed && Number.isFinite(marginUsed) ? marginUsed : null,
    accountSize: accountSizeValue !== null && Number.isFinite(accountSizeValue) ? accountSizeValue : null,
    direction,
    rSource,
    instrumentType: pnlComputation.instrumentType,
    cryptoMarketType: pnlComputation.cryptoMarketType,
    executionType: pnlComputation.executionType,
    fundingDirection: pnlComputation.fundingDirection,
    fundingRateBps: pnlComputation.fundingRateBps,
    fundingIntervals: pnlComputation.fundingIntervals,
    quoteAsset: pnlComputation.quoteAsset,
    leverage: pnlComputation.leverage,
    accountCurrency: accountCurrency?.trim() || brokerPreset.defaultCurrency || instrumentPreset.defaultCurrency,
    positionSize: positionSizeValue,
    pointValue: pointValueValue,
  }
}

export function calculateWinRate(totalTrades: number, winners: number): number {
  return totalTrades ? (winners / totalTrades) * 100 : 0
}

export function calculateProfitFactor(grossProfit: number, grossLoss: number): number {
  return grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / Math.abs(grossLoss)
}

export function calculateAverageR(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

export function sumPnL(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}

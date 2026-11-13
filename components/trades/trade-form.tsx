'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { getManualTradeNumberFormatHint, parseManualTradeNumber } from '@/lib/utils/manual-trade-number'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createTradeEntry, syncTradeMedia, updateTradeEntry } from '@/app/actions/trades'
import { requestUncommittedMediaCleanup } from '@/app/actions/media-cleanup'
import { deleteUserCostProfile, saveUserCostProfile } from '@/app/actions/user-cost-profiles'
import { SaveTradeCurrencyOnly } from '@/components/trades/trade-currency-correction'
import { TradeTagSelector } from '@/components/trades/trade-tag-selector'
import { SnippingAssistCard } from '@/components/trades/snipping-assist-dynamic'
import { ChartUploadAdvanced } from '@/components/uploads/chart-upload-advanced'
import { uploadTradeScreenshots } from '@/lib/supabase/storage'
import { normalizeTradeCurrency, SUPPORTED_TRADE_CURRENCIES } from '@/lib/utils/currency'
import {
  getTradeAccountTemplatePreset,
  getTradeBrokerProfilePreset,
  getTradeCostProfilePreset,
  getTradeInstrumentPreset,
  getTradeMarketTemplatePreset,
  normalizeInstrumentType,
  deriveEffectiveExitFromPartialExitLegs,
  restoreRemainderExitFromStoredAverage,
  parseTradingNumber,
  buildQuickPnLPreview,
  deriveMarginUsed,
  derivePartialExitPnL,
  derivePositionSizeFromMargin,
  deriveTradeNotional,
  formatCurrency,
  formatPartialExitSummary,
  formatPlainNumber,
  formatRMultiple,
  getPartialExitPlanInfo,
  getPartialExitSizePlan,
  normalizeTradeAccountTemplate,
  normalizeTradeBrokerProfile,
  normalizeTradeCostProfile,
  normalizeTradeCryptoMarketType,
  normalizeTradeExecutionType,
  normalizeTradeFundingDirection,
  normalizeTradeMarketTemplate,
  normalizeTradePnLMode,
  resolveTradeCostBreakdown,
} from '@/lib/utils/calculations'
import type {
  TradeAccountTemplate,
  TradeBrokerProfile,
  TradeCaptureStatus,
  TradeCostProfile,
  TradeCryptoMarketType,
  TradeExecutionType,
  TradeFundingDirection,
  TradeInstrumentType,
  TradeMarketTemplate,
  TradePnLMode,
} from '@/lib/types/trade'
import type { SavedUserCostProfile } from '@/lib/types/user-cost-profile'
import type { TradeMediaItem, TradeMediaUploadInput } from '@/lib/types/media'
import { type TradeCaptureInput, type TradeValidationField, validateTradeCaptureInput } from '@/lib/utils/trade-validation'
import { formatTradeTimeInputValue } from '@/lib/utils/trade-time'
import { WEIGHTED_EXIT_PRICE_BASIS } from '@/lib/utils/trade-exit-basis'
import {
  accountTemplateOptions,
  brokerProfileOptions,
  costProfileOptions,
  cryptoMarketTypeOptions,
  executionTypeOptions,
  fundingDirectionOptions,
  getAccountTemplateLabel,
  getBrokerProfileLabel,
  getCostProfileLabel,
  getCryptoMarketTypeLabel,
  getExecutionTypeLabel,
  getFundingDirectionLabel,
  getInstrumentLabel,
  getMarketTemplateLabel,
  getPnLModeLabel,
  instrumentOptions,
  marketTemplateOptions,
  pnlModes,
} from '@/lib/utils/trade-presets'

const cryptoSpotBrokerProfiles: TradeBrokerProfile[] = ['binance-spot', 'coinbase-spot', 'bybit-spot', 'mexc-spot']
const cryptoPerpsBrokerProfiles: TradeBrokerProfile[] = ['bybit-perps', 'mexc-perps', 'okx-perps']

const USER_COST_PROFILE_STORAGE_KEY = 'equora-user-cost-profiles'
const defaultAccountTemplate: TradeAccountTemplate = 'swing-europe'
const englishSizeHints: Partial<Record<TradeInstrumentType, string>> = {
  stocks: 'shares',
  futures: 'contracts',
  unknown: 'manual',
}

const yesReviewOption = { label: 'Ja', en: 'Yes', value: 'Ja' }
const noReviewOption = { label: 'Nein', en: 'No', value: 'Nein' }
const reviewRuleOptions = [yesReviewOption, { label: 'Teilweise', en: 'Partly', value: 'Teilweise' }, noReviewOption]
const reviewRepeatabilityOptions = [yesReviewOption, { label: 'Mit Anpassung', en: 'With changes', value: 'Mit Anpassung' }, noReviewOption]
const reviewStateOptions = [
  { label: 'Fokussiert', en: 'Focused', value: 'Fokussiert' },
  { label: 'Geduldig', en: 'Patient', value: 'Geduldig' },
  { label: 'Zu schnell', en: 'Too quick', value: 'Impulsiv' },
  { label: 'Nicht klar', en: 'Unclear', value: 'Unscharf' },
  { label: 'Müde', en: 'Tired', value: 'Müde' },
  { label: 'Unter Druck', en: 'Under pressure', value: 'Gejagt' },
]

const reviewLessonSuggestions = [
  { de: 'Früher stoppen', en: 'Stop earlier' },
  { de: 'Entry klarer abwarten', en: 'Wait for a clearer entry' },
  { de: 'Setup enger filtern', en: 'Be more selective about setups' },
  { de: 'Geduld schützen', en: 'Stay patient' },
  { de: 'Regel vor Tempo', en: 'Follow the rules before acting' },
] as const

function getReviewLayerProgress(values: string[], locale: JournalLocale) {
  const text = journalText(locale)
  const completed = values.filter((value) => value.trim()).length
  return {
    completed,
    total: values.length,
    label: completed === values.length
      ? text('Review-Angaben vollständig', 'Review details complete')
      : text(`${completed}/${values.length} Signale gesetzt`, `${completed}/${values.length} review fields filled`),
  }
}

type TradeFormMode = 'create' | 'edit'

type TradeFormInitialValues = Partial<TradeCaptureInput> & {
  exitPriceBasis?: string | null
  setupId?: string
  captureStatus?: TradeCaptureStatus
  partialExit1Percent?: string
  partialExit1Price?: string
  partialExit2Percent?: string
  partialExit2Price?: string
  partialExit3Percent?: string
  partialExit3Price?: string
  screenshotUrls?: string[]
  mediaItems?: TradeMediaItem[]
  createdAt?: string
  capturedAt?: string
}

type SetupOption = { id: string; title: string }

type TradeFormProps = {
  markets: string[]
  setups: string[]
  savedSetupOptions?: SetupOption[]
  emotions: string[]
  biases: string[]
  ruleFlags: string[]
  tagOptions: string[]
  initialUserCostProfiles?: SavedUserCostProfile[]
  mode?: TradeFormMode
  tradeId?: string
  initialValues?: TradeFormInitialValues
  cancelHref?: string
}

function stringifyInitialValue(value: string | number | null | undefined) {
  return value === null || value === undefined ? '' : String(value)
}

function normalizeInitialTags(tags: string[] | undefined) {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)))
}

function getInitialMarginUsed({
  instrumentType,
  entry,
  positionSize,
  pointValue,
  leverage,
}: {
  instrumentType: TradeInstrumentType
  entry?: string | number | null
  positionSize?: string | number | null
  pointValue?: string | number | null
  leverage?: string | number | null
}) {
  const derived = deriveMarginUsed({ instrumentType, entry, positionSize, pointValue, leverage })
  return derived === null ? '' : String(derived)
}

function dedupeFiles(files: File[]) {
  return Array.from(new Map(files.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file])).values())
}

function normalizeTradeMediaItems(items: Array<TradeMediaItem | TradeMediaUploadInput>) {
  return items
    .map((item, index) => ({
      id: 'id' in item ? item.id : `upload-${index}`,
      tradeId: 'tradeId' in item ? item.tradeId : '',
      storagePath: item.storagePath,
      publicUrl: item.publicUrl,
      fileName: item.fileName ?? '',
      mimeType: item.mimeType ?? null,
      byteSize: item.byteSize ?? null,
      sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : index,
      isPrimary: Boolean(item.isPrimary),
      createdAt: 'createdAt' in item ? item.createdAt : null,
    }))
    .filter((item) => item.storagePath && item.publicUrl)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index, isPrimary: index === 0 }))
}

export function TradeForm({
  markets,
  setups,
  savedSetupOptions = [],
  emotions,
  biases,
  ruleFlags,
  tagOptions,
  initialUserCostProfiles = [],
  mode = 'create',
  tradeId,
  initialValues,
  cancelHref,
}: TradeFormProps) {
  const defaultAccountPreset = getTradeAccountTemplatePreset(defaultAccountTemplate)
  const defaultBrokerPreset = getTradeBrokerProfilePreset(defaultAccountPreset.defaultBrokerProfile)
  const defaultInstrumentPreset = getTradeInstrumentPreset(defaultAccountPreset.defaultInstrumentType)
  const defaultCostPreset = getTradeCostProfilePreset(defaultAccountPreset.defaultCostProfile)
  const router = useRouter()
  const locale = useJournalLocale()
  const text = journalText(locale)
  const isEditMode = mode === 'edit'
  const initialAccountTemplate = normalizeTradeAccountTemplate(initialValues?.accountTemplate || defaultAccountTemplate)
  const initialAccountPreset = getTradeAccountTemplatePreset(initialAccountTemplate)
  const initialMarketTemplate = normalizeTradeMarketTemplate(initialValues?.marketTemplate)
  const initialBrokerProfile = normalizeTradeBrokerProfile(initialValues?.brokerProfile || initialAccountPreset.defaultBrokerProfile)
  const initialBrokerPreset = getTradeBrokerProfilePreset(initialBrokerProfile)
  const initialInstrumentType = normalizeInstrumentType(initialValues?.instrumentType || initialBrokerPreset.defaultInstrumentType)
  const initialInstrumentPreset = getTradeInstrumentPreset(initialInstrumentType)
  const initialPnlMode = normalizeTradePnLMode(initialValues?.pnlMode, initialValues?.netPnL)
  const initialCostProfile = initialValues?.userCostProfileId?.trim()
    ? 'user-custom'
    : normalizeTradeCostProfile(initialValues?.costProfile || initialAccountPreset.defaultCostProfile)
  const initialCostPreset = getTradeCostProfilePreset(initialCostProfile)
  const [files, setFiles] = useState<File[]>([])
  const [snippingFiles, setSnippingFiles] = useState<File[]>([])
  const [existingMediaItems] = useState<TradeMediaItem[]>(normalizeTradeMediaItems(initialValues?.mediaItems ?? []))
  const [selectedTags, setSelectedTags] = useState<string[]>(normalizeInitialTags(initialValues?.tags))
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null)
  const status = feedback?.message

  function setStatus(message: string, success = false) {
    setFeedback({ message, success })
  }
  const [validationErrors, setValidationErrors] = useState<Partial<Record<TradeValidationField, string>>>({})
  const [marketValue, setMarketValue] = useState(initialValues?.market?.trim() || markets[0] || '')
  const setupOptionByTitle = useMemo(() => new Map(savedSetupOptions.map((option) => [option.title, option])), [savedSetupOptions])
  const setupOptionById = useMemo(() => new Map(savedSetupOptions.map((option) => [option.id, option])), [savedSetupOptions])
  const [setupValue, setSetupValue] = useState(() => {
    if (initialValues?.setupId && setupOptionById.has(initialValues.setupId)) {
      return setupOptionById.get(initialValues.setupId)?.title ?? initialValues?.setup?.trim() ?? setups[0] ?? ''
    }
    return initialValues?.setup?.trim() || setups[0] || ''
  })
  const [selectedSetupId, setSelectedSetupId] = useState(() => {
    if (initialValues?.setupId && setupOptionById.has(initialValues.setupId)) return initialValues.setupId
    const matched = setupOptionByTitle.get(initialValues?.setup?.trim() || '')
    return matched?.id ?? ''
  })
  const [accountTemplate, setAccountTemplate] = useState<TradeAccountTemplate>(initialAccountTemplate)
  const [marketTemplate, setMarketTemplate] = useState<TradeMarketTemplate>(initialMarketTemplate)
  const [brokerProfile, setBrokerProfile] = useState<TradeBrokerProfile>(initialBrokerProfile)
  const [instrumentType, setInstrumentType] = useState<TradeInstrumentType>(initialInstrumentType)
  const [pnlMode, setPnlMode] = useState<TradePnLMode>(initialPnlMode)
  const [costProfile, setCostProfile] = useState<TradeCostProfile>(initialCostProfile)
  const initialAccountCurrency = isEditMode
    ? initialValues?.accountCurrency?.trim() || ''
    : initialValues?.accountCurrency?.trim() || initialAccountPreset.defaultCurrency || initialBrokerPreset.defaultCurrency || initialInstrumentPreset.defaultCurrency
  const [accountCurrency, setAccountCurrency] = useState(initialAccountCurrency)
  const [cryptoMarketType, setCryptoMarketType] = useState<TradeCryptoMarketType>(normalizeTradeCryptoMarketType(initialValues?.cryptoMarketType || initialAccountPreset.defaultCryptoMarketType))
  const [quoteAsset, setQuoteAsset] = useState(initialValues?.quoteAsset?.trim() || initialAccountPreset.defaultQuoteAsset || initialBrokerPreset.defaultQuoteAsset || '')
  const [leverage, setLeverage] = useState(stringifyInitialValue(initialValues?.leverage ?? initialAccountPreset.defaultLeverage))
  const [tradeOccurredAtValue, setTradeOccurredAtValue] = useState(initialValues?.tradeOccurredAt?.trim() || formatTradeTimeInputValue(initialValues?.capturedAt ?? initialValues?.createdAt))
  const [entryValue, setEntryValue] = useState(stringifyInitialValue(initialValues?.entry))
  const [stopLossValue, setStopLossValue] = useState(stringifyInitialValue(initialValues?.stopLoss))
  const [takeProfitValue, setTakeProfitValue] = useState(stringifyInitialValue(initialValues?.takeProfit))
  const initialPartialExits = [
      { percent: initialValues?.partialExit1Percent, price: initialValues?.partialExit1Price },
      { percent: initialValues?.partialExit2Percent, price: initialValues?.partialExit2Price },
      { percent: initialValues?.partialExit3Percent, price: initialValues?.partialExit3Price },
  ]
  const initialPartialPlan = getPartialExitPlanInfo({ exit: initialValues?.exit, partialExits: initialPartialExits })
  const storedExitBasisKnown = initialValues?.exitPriceBasis === WEIGHTED_EXIT_PRICE_BASIS
  const needsExitBasis = isEditMode && initialPartialPlan.count > 0 && initialPartialPlan.hasRemainder && parseTradingNumber(initialValues?.exit) !== null && !storedExitBasisKnown
  const initialExitValue = storedExitBasisKnown
    ? restoreRemainderExitFromStoredAverage({ exit: initialValues?.exit, partialExits: initialPartialExits })
    : initialValues?.exit
  const [exitBasis, setExitBasis] = useState<'unconfirmed' | 'remainder' | 'average'>(needsExitBasis ? 'unconfirmed' : 'remainder')
  const [exitValue, setExitValue] = useState(needsExitBasis ? '' : stringifyInitialValue(initialExitValue))
  const [partialExit1Percent, setPartialExit1Percent] = useState(stringifyInitialValue(initialValues?.partialExit1Percent))
  const [partialExit1Price, setPartialExit1Price] = useState(stringifyInitialValue(initialValues?.partialExit1Price))
  const [partialExit2Percent, setPartialExit2Percent] = useState(stringifyInitialValue(initialValues?.partialExit2Percent))
  const [partialExit2Price, setPartialExit2Price] = useState(stringifyInitialValue(initialValues?.partialExit2Price))
  const [partialExit3Percent, setPartialExit3Percent] = useState(stringifyInitialValue(initialValues?.partialExit3Percent))
  const [partialExit3Price, setPartialExit3Price] = useState(stringifyInitialValue(initialValues?.partialExit3Price))
  const [positionSizeValue, setPositionSizeValue] = useState(stringifyInitialValue(initialValues?.positionSize))
  const [marginUsedValue, setMarginUsedValue] = useState(getInitialMarginUsed({ instrumentType: initialInstrumentType, entry: initialValues?.entry, positionSize: initialValues?.positionSize, pointValue: initialValues?.pointValue ?? initialAccountPreset.defaultPointValue ?? initialBrokerPreset.defaultPointValue ?? initialInstrumentPreset.defaultPointValue, leverage: initialValues?.leverage ?? initialAccountPreset.defaultLeverage }))
  const [riskPercentValue, setRiskPercentValue] = useState(stringifyInitialValue(initialValues?.riskPercent))
  const [accountSizeValue, setAccountSizeValue] = useState(stringifyInitialValue(initialValues?.accountSize))
  const [executionType, setExecutionType] = useState<TradeExecutionType>(normalizeTradeExecutionType(initialValues?.executionType || initialAccountPreset.defaultExecutionType))
  const [fundingDirection, setFundingDirection] = useState<TradeFundingDirection>(normalizeTradeFundingDirection(initialValues?.fundingDirection || initialAccountPreset.defaultFundingDirection))
  const [fundingRateBps, setFundingRateBps] = useState(stringifyInitialValue(initialValues?.fundingRateBps ?? initialAccountPreset.defaultFundingRateBps))
  const [fundingIntervals, setFundingIntervals] = useState(stringifyInitialValue(initialValues?.fundingIntervals ?? initialAccountPreset.defaultFundingIntervals))
  const [pointValue, setPointValue] = useState(
    stringifyInitialValue(initialValues?.pointValue ?? initialAccountPreset.defaultPointValue ?? initialBrokerPreset.defaultPointValue ?? initialInstrumentPreset.defaultPointValue),
  )
  const [fees, setFees] = useState(stringifyInitialValue(initialValues?.fees ?? initialBrokerPreset.defaultFees ?? initialCostPreset.defaultFees))
  const [exchangeFees, setExchangeFees] = useState(
    stringifyInitialValue(initialValues?.exchangeFees ?? initialBrokerPreset.defaultExchangeFees ?? initialCostPreset.defaultExchangeFees),
  )
  const [fundingFees, setFundingFees] = useState(
    stringifyInitialValue(initialValues?.fundingFees ?? initialBrokerPreset.defaultFundingFees ?? initialCostPreset.defaultFundingFees),
  )
  const [spreadCost, setSpreadCost] = useState(
    stringifyInitialValue(initialValues?.spreadCost ?? initialBrokerPreset.defaultSpreadCost ?? initialCostPreset.defaultSpreadCost),
  )
  const [slippage, setSlippage] = useState(
    stringifyInitialValue(initialValues?.slippage ?? initialBrokerPreset.defaultSlippage ?? initialCostPreset.defaultSlippage),
  )
  const [netPnL, setNetPnL] = useState(stringifyInitialValue(initialValues?.netPnL))
  const [userCostProfiles, setUserCostProfiles] = useState<SavedUserCostProfile[]>(initialUserCostProfiles)
  const [selectedUserCostProfileId, setSelectedUserCostProfileId] = useState(initialValues?.userCostProfileId?.trim() || '')
  const [newProfileTitle, setNewProfileTitle] = useState('')
  const [currencySaving, setCurrencySaving] = useState(false)
  const [noteText, setNoteText] = useState(initialValues?.notes ?? '')
  const [simpleMode, setSimpleMode] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showReflection, setShowReflection] = useState(false)
  const [activeExtraSection, setActiveExtraSection] = useState<'screenshots' | 'tags' | 'notes' | 'snip' | null>(null)
  const [tradeDirection, setTradeDirection] = useState(initialValues?.bias?.trim() || biases[0] || '')
  const [reviewRuleCheck, setReviewRuleCheck] = useState(initialValues?.ruleCheck?.trim() || '')
  const [reviewRepeatability, setReviewRepeatability] = useState(initialValues?.reviewRepeatability?.trim() || '')
  const [reviewState, setReviewState] = useState(initialValues?.reviewState?.trim() || '')
  const [reviewLesson, setReviewLesson] = useState(initialValues?.reviewLesson?.trim() || '')
  const reviewLayerProgress = getReviewLayerProgress([reviewRuleCheck, reviewRepeatability, reviewState, reviewLesson], locale)

  const pendingFiles = useMemo(() => dedupeFiles([...snippingFiles, ...files]), [files, snippingFiles])

  const displayNumber = (value: number, digits = 2) => formatPlainNumber(value, digits, locale)
  const displayMoney = (value: number) => formatCurrency(value, 2, accountCurrency, locale)
  const displayR = (value: number) => formatRMultiple(value, 2, locale)
  const manualNumberHint = getManualTradeNumberFormatHint(locale)

  const brokerPreset = useMemo(() => getTradeBrokerProfilePreset(brokerProfile), [brokerProfile])
  const instrumentPreset = useMemo(() => getTradeInstrumentPreset(instrumentType), [instrumentType])
  const sizeHint = locale === 'en'
    ? englishSizeHints[instrumentType] ?? instrumentPreset.sizeHint
    : instrumentPreset.sizeHint
  const costSummary = useMemo(
    () =>
      resolveTradeCostBreakdown({
        costProfile,
        brokerProfile,
        fees,
        exchangeFees,
        fundingFees,
        fundingRateBps,
        fundingIntervals,
        spreadCost,
        slippage,
        cryptoMarketType,
        instrumentType,
        entry: entryValue,
        positionSize: positionSizeValue || derivePositionSizeFromMargin({ instrumentType, entry: entryValue, marginUsed: marginUsedValue, leverage, pointValue }),
        pointValue,
        executionType,
        fundingDirection,
      }),
    [brokerProfile, costProfile, cryptoMarketType, entryValue, exchangeFees, executionType, fees, fundingDirection, fundingFees, fundingIntervals, fundingRateBps, instrumentType, leverage, marginUsedValue, pointValue, positionSizeValue, slippage, spreadCost],
  )
  const derivedPositionSize = useMemo(() => {
    if (positionSizeValue.trim()) {
      const manual = parseManualTradeNumber(positionSizeValue, locale)
      return manual !== null && manual > 0 ? manual : null
    }
    return derivePositionSizeFromMargin({
      instrumentType,
      entry: parseManualTradeNumber(entryValue, locale),
      marginUsed: parseManualTradeNumber(marginUsedValue, locale),
      leverage: parseManualTradeNumber(leverage, locale),
      pointValue: parseManualTradeNumber(pointValue, locale),
    })
  }, [entryValue, instrumentType, leverage, locale, marginUsedValue, pointValue, positionSizeValue])
  const derivedExposure = useMemo(
    () => deriveTradeNotional({ instrumentType, entry: entryValue, positionSize: derivedPositionSize, pointValue }),
    [derivedPositionSize, entryValue, instrumentType, pointValue],
  )
  const derivedMargin = useMemo(
    () => deriveMarginUsed({ instrumentType, entry: entryValue, positionSize: derivedPositionSize, leverage, pointValue }),
    [derivedPositionSize, entryValue, instrumentType, leverage, pointValue],
  )
  const derivedStopRisk = useMemo(() => {
    const entry = parseManualTradeNumber(entryValue, locale)
    const stop = parseManualTradeNumber(stopLossValue, locale)
    if (entry === null || stop === null || !derivedPositionSize || derivedPositionSize <= 0) return null
    const direction = tradeDirection.toLowerCase().includes('short') ? 'short' : tradeDirection.toLowerCase().includes('long') ? 'long' : 'neutral'
    if (direction === 'neutral') return null
    const priceRisk = direction === 'short' ? stop - entry : entry - stop
    if (!(priceRisk > 0)) return null
    const point = (instrumentType === 'futures' || instrumentType === 'forex' || instrumentType === 'cfd')
      ? parseManualTradeNumber(pointValue, locale) || 1
      : 1
    const amount = Math.abs(priceRisk * derivedPositionSize * point)
    return Number.isFinite(amount) ? amount : null
  }, [derivedPositionSize, entryValue, instrumentType, locale, pointValue, stopLossValue, tradeDirection])
  const partialExitPreview = useMemo(() => {
    const partialExits = [
      { percent: partialExit1Percent, price: partialExit1Price },
      { percent: partialExit2Percent, price: partialExit2Price },
      { percent: partialExit3Percent, price: partialExit3Price },
    ]
    const effectiveExit = deriveEffectiveExitFromPartialExitLegs({
      exit: exitValue,
      partialExits,
    })
    const summary = formatPartialExitSummary(partialExits)
    const plan = getPartialExitPlanInfo({ exit: exitValue, partialExits })
    const sizePlan = getPartialExitSizePlan({ positionSize: derivedPositionSize, partialExits, exit: exitValue })
    const realizedPnL = derivePartialExitPnL({
      instrumentType,
      entry: entryValue,
      bias: tradeDirection,
      positionSize: derivedPositionSize,
      pointValue,
      partialExits,
      totalCosts: costSummary.totalCosts,
    })
    const realizedR = realizedPnL.netPnL !== null && derivedStopRisk !== null && derivedStopRisk > 0
      ? realizedPnL.netPnL / derivedStopRisk
      : null
    return {
      effectiveExit,
      summary,
      coveredPercent: plan.coveredPercent,
      remainderPercent: plan.remainderPercent,
      hasOpenRemainder: sizePlan.hasOpenRemainder,
      realizedSize: sizePlan.realizedSize,
      remainingSize: sizePlan.remainingSize,
      realizedNetPnL: realizedPnL.netPnL,
      realizedR,
    }
  }, [costSummary.totalCosts, derivedPositionSize, derivedStopRisk, entryValue, exitValue, instrumentType, partialExit1Percent, partialExit1Price, partialExit2Percent, partialExit2Price, partialExit3Percent, partialExit3Price, pointValue, tradeDirection])

  const quickPnlPreview = useMemo(() => buildQuickPnLPreview({
    entry: entryValue,
    exit: partialExitPreview.effectiveExit ?? exitValue,
    positionSize: derivedPositionSize,
    pointValue,
    bias: tradeDirection,
    instrumentType,
    totalCosts: costSummary.totalCosts,
  }, locale), [costSummary.totalCosts, derivedPositionSize, entryValue, exitValue, instrumentType, locale, partialExitPreview.effectiveExit, pointValue, tradeDirection])

  const previewInputsValid = [
    entryValue, exitValue, positionSizeValue, pointValue, marginUsedValue, leverage,
    partialExit1Percent, partialExit1Price, partialExit2Percent, partialExit2Price, partialExit3Percent, partialExit3Price,
    fees, exchangeFees, fundingFees, fundingRateBps, fundingIntervals, spreadCost, slippage,
  ].every((value) => !value.trim() || parseManualTradeNumber(value, locale) !== null)
  const calculatedPnL = previewInputsValid ? quickPnlPreview.netPnL : null
  const quickPnlLabel = !previewInputsValid
    ? manualNumberHint
    : calculatedPnL !== null
      ? displayMoney(calculatedPnL)
      : quickPnlPreview.missing.length
        ? `${text('Fehlt:', 'Missing:')} ${quickPnlPreview.missing.join(' · ')}`
        : text('Noch offen', 'Pending')

  const quickRPreview = calculatedPnL !== null && derivedStopRisk !== null && derivedStopRisk > 0
    ? calculatedPnL / derivedStopRisk
    : null

  const quickPnlTone = calculatedPnL !== null
    ? calculatedPnL > 0
      ? 'text-emerald-100'
      : calculatedPnL < 0
        ? 'text-red-100'
        : 'text-white'
    : 'text-white/50'

  const partialExitSize = partialExitPreview.coveredPercent === 0
    ? text('Keine Teilverkäufe', 'No partial exits')
    : partialExitPreview.realizedSize === null
      ? `${displayNumber(partialExitPreview.coveredPercent, 0)}% ${text('ohne Size-Basis', 'with no position size recorded')}`
      : `${displayNumber(partialExitPreview.realizedSize, 4)} ${sizeHint}`
  const partialExitRemaining = partialExitPreview.hasOpenRemainder
    ? partialExitPreview.remainingSize === null
      ? `${displayNumber(partialExitPreview.remainderPercent, 0)}%`
      : `${displayNumber(partialExitPreview.remainingSize, 4)} ${sizeHint}`
    : partialExitPreview.coveredPercent > 0
      ? text('Kein Rest', 'No open remainder')
      : '—'
  const partialExitMoney = partialExitPreview.realizedNetPnL === null
    ? null
    : `${displayMoney(partialExitPreview.realizedNetPnL)}${partialExitPreview.realizedR === null ? '' : ` · ${displayR(partialExitPreview.realizedR)}`}`

  const accountRiskPreview = useMemo(() => {
    const account = parseManualTradeNumber(accountSizeValue, locale)
    if (account === null || account <= 0 || derivedStopRisk === null) return null
    const percent = (derivedStopRisk / account) * 100
    return Number.isFinite(percent) ? percent : null
  }, [accountSizeValue, derivedStopRisk, locale])
  const marketOptions = useMemo(() => {
    const templateMarkets = marketTemplateOptions
      .map((option) => getTradeMarketTemplatePreset(option.value).market)
      .filter(Boolean)
    const merged = new Set([marketValue, ...markets, ...templateMarkets])
    return Array.from(merged).filter(Boolean)
  }, [marketValue, markets])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(USER_COST_PROFILE_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as SavedUserCostProfile[]
      if (!Array.isArray(parsed)) return
      setUserCostProfiles((current: SavedUserCostProfile[]) => {
        const merged = new Map(current.map((profile: SavedUserCostProfile) => [profile.id, profile]))
        parsed.forEach((profile) => {
          if (profile?.id && profile?.title) merged.set(profile.id, profile)
        })
        return Array.from(merged.values())
      })
    } catch {}
  }, [])

  function asFieldValue(value: number | null | undefined) {
    return value === null || value === undefined ? '' : String(value)
  }

  function persistLocalCostProfiles(nextProfiles: SavedUserCostProfile[]) {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(USER_COST_PROFILE_STORAGE_KEY, JSON.stringify(nextProfiles.filter((profile: SavedUserCostProfile) => profile.source === 'mock')))
    } catch {}
  }

  function enforceUserCostProfileDefaultUniqueness(nextProfile: SavedUserCostProfile, collection: SavedUserCostProfile[]) {
    return collection.map((profile) => {
      if (profile.id === nextProfile.id) return nextProfile

      const accountConflict =
        nextProfile.defaultAccountTemplate &&
        profile.defaultAccountTemplate === nextProfile.defaultAccountTemplate
      const marketConflict =
        nextProfile.defaultMarketTemplate &&
        profile.defaultMarketTemplate === nextProfile.defaultMarketTemplate

      if (!accountConflict && !marketConflict) return profile

      return {
        ...profile,
        defaultAccountTemplate: accountConflict ? null : profile.defaultAccountTemplate,
        defaultMarketTemplate: marketConflict ? null : profile.defaultMarketTemplate,
      }
    })
  }

  function findMatchingDefaultUserCostProfile(nextAccountTemplate: TradeAccountTemplate, nextMarketTemplate: TradeMarketTemplate) {
    if (nextMarketTemplate !== 'manual') {
      const marketMatch = userCostProfiles.find((profile: SavedUserCostProfile) => profile.defaultMarketTemplate === nextMarketTemplate)
      if (marketMatch) return marketMatch
    }

    if (nextAccountTemplate !== 'manual') {
      const accountMatch = userCostProfiles.find((profile: SavedUserCostProfile) => profile.defaultAccountTemplate === nextAccountTemplate)
      if (accountMatch) return accountMatch
    }

    return null
  }

  function applyUserCostProfile(
    profile: SavedUserCostProfile,
    options?: { keepTemplates?: boolean; accountTemplate?: TradeAccountTemplate; marketTemplate?: TradeMarketTemplate },
  ) {
    setSelectedUserCostProfileId(profile.id)
    setBrokerProfile(profile.brokerProfile)
    setInstrumentType(profile.instrumentType)
    setCostProfile('user-custom')

    if (options?.keepTemplates) {
      if (options.accountTemplate) setAccountTemplate(options.accountTemplate)
      if (options.marketTemplate !== undefined) setMarketTemplate(options.marketTemplate)
    } else {
      setAccountTemplate('manual')
      setMarketTemplate('manual')
    }

    setAccountCurrency(profile.accountCurrency ?? accountCurrency)
    setPointValue(asFieldValue(profile.pointValue))
    setFees(asFieldValue(profile.fees))
    setExchangeFees(asFieldValue(profile.exchangeFees))
    setFundingFees(asFieldValue(profile.fundingFees))
    setFundingRateBps(asFieldValue(profile.fundingRateBps))
    setFundingIntervals(asFieldValue(profile.fundingIntervals))
    setSpreadCost(asFieldValue(profile.spreadCost))
    setSlippage(asFieldValue(profile.slippage))
    setCryptoMarketType(profile.instrumentType === 'crypto' ? profile.cryptoMarketType : 'manual')
    setExecutionType(profile.instrumentType === 'crypto' ? profile.executionType : 'manual')
    setFundingDirection(profile.instrumentType === 'crypto' ? profile.fundingDirection : 'manual')
    setQuoteAsset(profile.instrumentType === 'crypto' ? profile.quoteAsset ?? '' : '')
    setLeverage(profile.instrumentType === 'crypto' ? asFieldValue(profile.leverage) : '')
  }

  async function handleSaveUserCostProfile() {
    const costFields = { leverage, pointValue, fees, exchangeFees, fundingFees, fundingRateBps, fundingIntervals, spreadCost, slippage }
    const amounts: Record<string, number | null> = {}
    for (const [field, value] of Object.entries(costFields)) {
      const amount = parseManualTradeNumber(value, locale)
      if (value.trim() && amount === null) {
        setStatus(manualNumberHint)
        return
      }
      amounts[field] = amount
    }
    const payload = {
      title: newProfileTitle,
      defaultAccountTemplate: accountTemplate === 'manual' ? null : accountTemplate,
      defaultMarketTemplate: marketTemplate === 'manual' ? null : marketTemplate,
      brokerProfile,
      instrumentType,
      costProfile: 'user-custom' as TradeCostProfile,
      accountCurrency,
      cryptoMarketType,
      executionType,
      fundingDirection,
      quoteAsset,
      leverage: amounts.leverage,
      pointValue: amounts.pointValue,
      fees: amounts.fees,
      exchangeFees: amounts.exchangeFees,
      fundingFees: amounts.fundingFees,
      fundingRateBps: amounts.fundingRateBps,
      fundingIntervals: amounts.fundingIntervals,
      spreadCost: amounts.spreadCost,
      slippage: amounts.slippage,
    }
    const result = await saveUserCostProfile(payload, locale)
    setStatus(result.message, result.success)
    if (!result.success || !result.profile) return
    setUserCostProfiles((current: SavedUserCostProfile[]) => {
      const next = enforceUserCostProfileDefaultUniqueness(
        result.profile!,
        [result.profile!, ...current.filter((profile: SavedUserCostProfile) => profile.id !== result.profile!.id)],
      )
      if (result.profile?.source === 'mock') persistLocalCostProfiles(next)
      return next
    })
    setSelectedUserCostProfileId(result.profile.id)
    setCostProfile('user-custom')
    setNewProfileTitle('')
  }

  async function handleDeleteSelectedUserCostProfile() {
    if (!selectedUserCostProfileId) return
    const result = await deleteUserCostProfile(selectedUserCostProfileId, locale)
    setStatus(result.message, result.success)
    if (!result.success || !result.deletedId) return
    setUserCostProfiles((current: SavedUserCostProfile[]) => {
      const next = current.filter((profile: SavedUserCostProfile) => profile.id !== result.deletedId)
      persistLocalCostProfiles(next)
      return next
    })
    setSelectedUserCostProfileId('')
  }

  function applyCostDefaults(
    nextProfile: TradeCostProfile,
    overrides?: {
      fees?: number | null
      exchangeFees?: number | null
      fundingFees?: number | null
      spreadCost?: number | null
      slippage?: number | null
    },
  ) {
    const preset = getTradeCostProfilePreset(nextProfile)
    setCostProfile(nextProfile)
    setFees(asFieldValue(overrides?.fees ?? preset.defaultFees))
    setExchangeFees(asFieldValue(overrides?.exchangeFees ?? preset.defaultExchangeFees))
    setFundingFees(asFieldValue(overrides?.fundingFees ?? preset.defaultFundingFees))
    setSpreadCost(asFieldValue(overrides?.spreadCost ?? preset.defaultSpreadCost))
    setSlippage(asFieldValue(overrides?.slippage ?? preset.defaultSlippage))
  }

  function applyPresetState({
    nextBrokerProfile,
    nextInstrumentType,
    nextPnLMode,
    nextCostProfile,
    nextCurrency,
    nextPointValue,
    nextCryptoMarketType,
    nextExecutionType,
    nextFundingDirection,
    nextFundingRateBps,
    nextFundingIntervals,
    nextQuoteAsset,
    nextLeverage,
  }: {
    nextBrokerProfile: TradeBrokerProfile
    nextInstrumentType: TradeInstrumentType
    nextPnLMode: TradePnLMode
    nextCostProfile: TradeCostProfile
    nextCurrency?: string | null
    nextPointValue?: number | null
    nextCryptoMarketType?: TradeCryptoMarketType
    nextExecutionType?: TradeExecutionType
    nextFundingDirection?: TradeFundingDirection
    nextFundingRateBps?: number | null
    nextFundingIntervals?: number | null
    nextQuoteAsset?: string | null
    nextLeverage?: number | null
  }) {
    const nextBroker = getTradeBrokerProfilePreset(nextBrokerProfile)
    const nextInstrument = getTradeInstrumentPreset(nextInstrumentType)
    setBrokerProfile(nextBrokerProfile)
    setInstrumentType(nextInstrumentType)
    setPnlMode(nextPnLMode)
    applyCostDefaults(nextCostProfile, {
      fees: nextBroker.defaultFees,
      exchangeFees: nextBroker.defaultExchangeFees,
      fundingFees: nextBroker.defaultFundingFees,
      spreadCost: nextBroker.defaultSpreadCost,
      slippage: nextBroker.defaultSlippage,
    })
    setAccountCurrency(nextCurrency?.trim() || nextBroker.defaultCurrency || nextInstrument.defaultCurrency)
    setPointValue(asFieldValue(nextPointValue ?? nextBroker.defaultPointValue ?? nextInstrument.defaultPointValue))
    setCryptoMarketType(nextInstrumentType === 'crypto' ? nextCryptoMarketType ?? nextBroker.defaultCryptoMarketType : 'manual')
    setExecutionType(nextInstrumentType === 'crypto' ? nextExecutionType ?? nextBroker.defaultExecutionType : 'manual')
    setFundingDirection(nextInstrumentType === 'crypto' ? nextFundingDirection ?? nextBroker.defaultFundingDirection : 'manual')
    setFundingRateBps(nextInstrumentType === 'crypto' ? asFieldValue(nextFundingRateBps ?? nextBroker.defaultFundingRateBps) : '')
    setFundingIntervals(nextInstrumentType === 'crypto' ? asFieldValue(nextFundingIntervals ?? nextBroker.defaultFundingIntervals) : '')
    setQuoteAsset(nextInstrumentType === 'crypto' ? nextQuoteAsset ?? nextBroker.defaultQuoteAsset ?? nextInstrument.defaultCurrency : '')
    setLeverage(nextInstrumentType === 'crypto' ? asFieldValue(nextLeverage ?? nextBroker.defaultLeverage) : '')
    setSelectedUserCostProfileId('')
  }

  function handleAccountTemplateChange(nextTemplate: TradeAccountTemplate) {
    const normalized = normalizeTradeAccountTemplate(nextTemplate)
    const preset = getTradeAccountTemplatePreset(normalized)
    const nextMarketTemplate =
      marketTemplate !== 'manual' && getTradeMarketTemplatePreset(marketTemplate).linkedAccountTemplate !== normalized
        ? 'manual'
        : marketTemplate

    setAccountTemplate(normalized)
    if (nextMarketTemplate !== marketTemplate) {
      setMarketTemplate(nextMarketTemplate)
    }

    applyPresetState({
      nextBrokerProfile: preset.defaultBrokerProfile,
      nextInstrumentType: preset.defaultInstrumentType,
      nextPnLMode: preset.defaultPnLMode,
      nextCostProfile: preset.defaultCostProfile,
      nextCurrency: preset.defaultCurrency,
      nextPointValue: preset.defaultPointValue,
      nextCryptoMarketType: preset.defaultCryptoMarketType,
      nextExecutionType: preset.defaultExecutionType,
      nextFundingDirection: preset.defaultFundingDirection,
      nextFundingRateBps: preset.defaultFundingRateBps,
      nextFundingIntervals: preset.defaultFundingIntervals,
      nextQuoteAsset: preset.defaultQuoteAsset,
      nextLeverage: preset.defaultLeverage,
    })

    const matchedProfile = findMatchingDefaultUserCostProfile(normalized, nextMarketTemplate)
    if (matchedProfile) {
      applyUserCostProfile(matchedProfile, { keepTemplates: true, accountTemplate: normalized, marketTemplate: nextMarketTemplate })
    }
  }

  function handleMarketTemplateChange(nextTemplate: TradeMarketTemplate) {
    const normalized = normalizeTradeMarketTemplate(nextTemplate)
    const preset = getTradeMarketTemplatePreset(normalized)
    setMarketTemplate(normalized)

    if (preset.market) {
      setMarketValue(preset.market)
    }

    if (normalized === 'manual') {
      const fallbackProfile = findMatchingDefaultUserCostProfile(accountTemplate, 'manual')
      if (fallbackProfile) {
        applyUserCostProfile(fallbackProfile, { keepTemplates: true, accountTemplate, marketTemplate: 'manual' })
      }
      return
    }

    setAccountTemplate(preset.linkedAccountTemplate)
    applyPresetState({
      nextBrokerProfile: preset.defaultBrokerProfile,
      nextInstrumentType: preset.defaultInstrumentType,
      nextPnLMode: preset.defaultPnLMode,
      nextCostProfile: preset.defaultCostProfile,
      nextCurrency: preset.defaultCurrency,
      nextPointValue: preset.defaultPointValue,
      nextCryptoMarketType: preset.defaultCryptoMarketType,
      nextExecutionType: preset.defaultExecutionType,
      nextFundingDirection: preset.defaultFundingDirection,
      nextFundingRateBps: preset.defaultFundingRateBps,
      nextFundingIntervals: preset.defaultFundingIntervals,
      nextQuoteAsset: preset.defaultQuoteAsset,
      nextLeverage: preset.defaultLeverage,
    })

    const matchedProfile = findMatchingDefaultUserCostProfile(preset.linkedAccountTemplate, normalized)
    if (matchedProfile) {
      applyUserCostProfile(matchedProfile, {
        keepTemplates: true,
        accountTemplate: preset.linkedAccountTemplate,
        marketTemplate: normalized,
      })
    }
  }

  function handleBrokerProfileChange(nextProfile: TradeBrokerProfile) {
    const previousBroker = getTradeBrokerProfilePreset(brokerProfile)
    const nextBroker = getTradeBrokerProfilePreset(nextProfile)
    setBrokerProfile(normalizeTradeBrokerProfile(nextProfile))
    setAccountTemplate('manual')
    setSelectedUserCostProfileId('')

    if (marketTemplate !== 'manual' && getTradeMarketTemplatePreset(marketTemplate).defaultBrokerProfile !== nextProfile) {
      setMarketTemplate('manual')
    }

    if (
      nextBroker.defaultInstrumentType &&
      (instrumentType === previousBroker.defaultInstrumentType || brokerProfile === 'manual')
    ) {
      setInstrumentType(nextBroker.defaultInstrumentType)
    }

    if (
      costProfile === previousBroker.defaultCostProfile ||
      (brokerProfile === 'manual' && costProfile === instrumentPreset.defaultCostProfile)
    ) {
      applyCostDefaults(nextBroker.defaultCostProfile, {
        fees: nextBroker.defaultFees,
        exchangeFees: nextBroker.defaultExchangeFees,
        fundingFees: nextBroker.defaultFundingFees,
        spreadCost: nextBroker.defaultSpreadCost,
        slippage: nextBroker.defaultSlippage,
      })
    }

    const previousCurrency = previousBroker.defaultCurrency ?? instrumentPreset.defaultCurrency
    const nextCurrency =
      nextBroker.defaultCurrency ?? getTradeInstrumentPreset(nextBroker.defaultInstrumentType ?? instrumentType).defaultCurrency
    if (!accountCurrency || accountCurrency === previousCurrency) {
      setAccountCurrency(nextCurrency)
    }

    const previousPointValue = previousBroker.defaultPointValue ?? instrumentPreset.defaultPointValue
    const nextPointValue =
      nextBroker.defaultPointValue ?? getTradeInstrumentPreset(nextBroker.defaultInstrumentType ?? instrumentType).defaultPointValue
    if (!pointValue || pointValue === String(previousPointValue ?? '')) {
      setPointValue(nextPointValue !== null ? String(nextPointValue) : '')
    }


    if (nextBroker.defaultInstrumentType === 'crypto' || instrumentType === 'crypto') {
      setCryptoMarketType(nextBroker.defaultCryptoMarketType)
      setExecutionType(nextBroker.defaultExecutionType)
      setFundingDirection(nextBroker.defaultFundingDirection)
      setFundingRateBps(asFieldValue(nextBroker.defaultFundingRateBps))
      setFundingIntervals(asFieldValue(nextBroker.defaultFundingIntervals))
      setQuoteAsset(nextBroker.defaultQuoteAsset ?? '')
      setLeverage(asFieldValue(nextBroker.defaultLeverage))
    }
  }

  function handleInstrumentChange(nextType: TradeInstrumentType) {
    const previousPreset = getTradeInstrumentPreset(instrumentType)
    const nextPreset = getTradeInstrumentPreset(nextType)
    const currentBroker = getTradeBrokerProfilePreset(brokerProfile)

    setInstrumentType(nextType)
    setAccountTemplate('manual')
    setSelectedUserCostProfileId('')
    if (marketTemplate !== 'manual' && getTradeMarketTemplatePreset(marketTemplate).defaultInstrumentType !== nextType) {
      setMarketTemplate('manual')
    }

    if (currentBroker.defaultInstrumentType === instrumentType && currentBroker.defaultInstrumentType !== nextType) {
      setBrokerProfile('manual')
    }

    if (!accountCurrency || accountCurrency === (currentBroker.defaultCurrency ?? previousPreset.defaultCurrency)) {
      setAccountCurrency(currentBroker.defaultCurrency ?? nextPreset.defaultCurrency)
    }

    const previousDefaultPointValue = currentBroker.defaultPointValue ?? previousPreset.defaultPointValue
    const nextDefaultPointValue = currentBroker.defaultPointValue ?? nextPreset.defaultPointValue
    if (!pointValue || pointValue === String(previousDefaultPointValue ?? '')) {
      setPointValue(nextDefaultPointValue !== null ? String(nextDefaultPointValue) : '')
    }

    if (brokerProfile === 'manual' && costProfile === previousPreset.defaultCostProfile) {
      applyCostDefaults(nextPreset.defaultCostProfile)
    }

    if (nextType === 'crypto') {
      const inferredCryptoType = cryptoPerpsBrokerProfiles.includes(brokerProfile) ? 'perps' : 'spot'
      setCryptoMarketType(inferredCryptoType)
      setExecutionType(currentBroker.defaultExecutionType)
      setFundingDirection(inferredCryptoType === 'spot' ? 'flat' : currentBroker.defaultFundingDirection)
      setFundingRateBps(asFieldValue(inferredCryptoType === 'spot' ? 0 : currentBroker.defaultFundingRateBps))
      setFundingIntervals(asFieldValue(inferredCryptoType === 'spot' ? 0 : currentBroker.defaultFundingIntervals))
      setQuoteAsset(brokerProfile === 'manual' ? nextPreset.defaultCurrency : currentBroker.defaultQuoteAsset ?? nextPreset.defaultCurrency)
      if (!leverage) {
        setLeverage(asFieldValue(currentBroker.defaultLeverage ?? (inferredCryptoType === 'perps' ? 3 : 1)))
      }
    } else {
      setCryptoMarketType('manual')
      setExecutionType('manual')
      setFundingDirection('manual')
      setFundingRateBps('')
      setFundingIntervals('')
      setQuoteAsset('')
      setLeverage('')
    }
  }

  function handleCostProfileChange(nextProfile: TradeCostProfile) {
    const previousProfile = getTradeCostProfilePreset(costProfile)
    const nextProfilePreset = getTradeCostProfilePreset(nextProfile)
    setCostProfile(normalizeTradeCostProfile(nextProfile))
    setAccountTemplate('manual')
    setSelectedUserCostProfileId('')

    if (!fees || fees === String(previousProfile.defaultFees ?? '')) {
      setFees(asFieldValue(nextProfilePreset.defaultFees))
    }

    if (!exchangeFees || exchangeFees === String(previousProfile.defaultExchangeFees ?? '')) {
      setExchangeFees(asFieldValue(nextProfilePreset.defaultExchangeFees))
    }

    if (!fundingFees || fundingFees === String(previousProfile.defaultFundingFees ?? '')) {
      setFundingFees(asFieldValue(nextProfilePreset.defaultFundingFees))
    }

    if (!spreadCost || spreadCost === String(previousProfile.defaultSpreadCost ?? '')) {
      setSpreadCost(asFieldValue(nextProfilePreset.defaultSpreadCost))
    }

    if (!slippage || slippage === String(previousProfile.defaultSlippage ?? '')) {
      setSlippage(asFieldValue(nextProfilePreset.defaultSlippage))
    }
  }

  function handleCryptoMarketTypeChange(nextType: TradeCryptoMarketType) {
    const normalized = normalizeTradeCryptoMarketType(nextType)
    setCryptoMarketType(normalized)
    setAccountTemplate('manual')
    setSelectedUserCostProfileId('')
    if (marketTemplate !== 'manual') {
      const template = getTradeMarketTemplatePreset(marketTemplate)
      if (template.defaultCryptoMarketType !== normalized) setMarketTemplate('manual')
    }

    if (normalized === 'spot') {
      if (cryptoPerpsBrokerProfiles.includes(brokerProfile)) setBrokerProfile('bybit-spot')
      if (costProfile === 'crypto-perps' || costProfile === 'crypto-swing') applyCostDefaults('crypto-spot')
      if (!quoteAsset) setQuoteAsset('USDT')
      if (!leverage || leverage === '5') setLeverage('1')
      setExecutionType('taker')
      setFundingDirection('flat')
      setFundingRateBps('0')
      setFundingIntervals('0')
      if (!fundingFees || fundingFees === String(getTradeCostProfilePreset(costProfile).defaultFundingFees ?? '')) setFundingFees('0')
    }

    if (normalized === 'perps') {
      if (cryptoSpotBrokerProfiles.includes(brokerProfile)) setBrokerProfile('bybit-perps')
      if (costProfile === 'crypto-spot' || costProfile === 'crypto-swing') applyCostDefaults('crypto-perps')
      if (!quoteAsset) setQuoteAsset('USDT')
      if (!leverage || leverage === '1') setLeverage('3')
      if (executionType === 'manual') setExecutionType('taker')
      if (fundingDirection === 'manual' || fundingDirection === 'flat') setFundingDirection('paid')
      if (!fundingRateBps) setFundingRateBps(asFieldValue(getTradeBrokerProfilePreset('bybit-perps').defaultFundingRateBps))
      if (!fundingIntervals) setFundingIntervals(asFieldValue(getTradeBrokerProfilePreset('bybit-perps').defaultFundingIntervals))
    }
  }

  function handleMarketChange(nextMarket: string) {
    setMarketValue(nextMarket)
    if (marketTemplate !== 'manual' && getTradeMarketTemplatePreset(marketTemplate).market !== nextMarket) {
      setMarketTemplate('manual')
    }
  }

  function setFormFieldValue(name: string, value?: string) {
    if (!value?.trim()) return
    const form = document.getElementById('trade-form') as HTMLFormElement | null
    const field = form?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
    if (!field) return
    field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function applySnippingValues(payload: {
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
  }) {
    if (payload.market) handleMarketChange(payload.market)
    if (payload.bias) setTradeDirection(payload.bias)
    if (payload.entry) setEntryValue(payload.entry)
    if (payload.exit) setExitValue(payload.exit)
    if (payload.stopLoss) setStopLossValue(payload.stopLoss)
    if (payload.takeProfit) setTakeProfitValue(payload.takeProfit)
    if (payload.positionSize) setPositionSizeValue(payload.positionSize)
    if (payload.accountSize) setAccountSizeValue(payload.accountSize)
    if (payload.riskPercent) setRiskPercentValue(payload.riskPercent)
    if (payload.leverage) setLeverage(payload.leverage)
    if (payload.netPnL) {
      setPnlMode('manual')
      setNetPnL(payload.netPnL)
    }
    setStatus(text('Werte aus dem Screenshot übernommen. Prüfe Einstieg, Stop, Risiko und Dezimalstellen.', 'Values copied from the screenshot. Check the entry, stop, risk and decimal places.'))
  }

  function resetEngineState() {
    setValidationErrors({})
    const account = getTradeAccountTemplatePreset(defaultAccountTemplate)
    const broker = getTradeBrokerProfilePreset(account.defaultBrokerProfile)
    const preset = getTradeInstrumentPreset(account.defaultInstrumentType)
    const profilePreset = getTradeCostProfilePreset(account.defaultCostProfile)
    setMarketValue(markets[0] ?? '')
    setTradeDirection(biases[0] || '')
    const nextSetupTitle = setups[0] ?? ''
    setSetupValue(nextSetupTitle)
    setSelectedSetupId(setupOptionByTitle.get(nextSetupTitle)?.id ?? '')
    setAccountTemplate(defaultAccountTemplate)
    setMarketTemplate('manual')
    setBrokerProfile(account.defaultBrokerProfile)
    setInstrumentType(account.defaultInstrumentType)
    setPnlMode(account.defaultPnLMode)
    setCostProfile(account.defaultCostProfile)
    setAccountCurrency(account.defaultCurrency || broker.defaultCurrency || preset.defaultCurrency)
    setPointValue(asFieldValue(account.defaultPointValue ?? broker.defaultPointValue ?? preset.defaultPointValue))
    setCryptoMarketType(account.defaultCryptoMarketType)
    setExecutionType(account.defaultExecutionType)
    setFundingDirection(account.defaultFundingDirection)
    setFundingRateBps(asFieldValue(account.defaultFundingRateBps))
    setFundingIntervals(asFieldValue(account.defaultFundingIntervals))
    setQuoteAsset(account.defaultQuoteAsset ?? '')
    setLeverage(asFieldValue(account.defaultLeverage))
    setFees(asFieldValue(broker.defaultFees ?? profilePreset.defaultFees))
    setExchangeFees(asFieldValue(broker.defaultExchangeFees ?? profilePreset.defaultExchangeFees))
    setFundingFees(asFieldValue(broker.defaultFundingFees ?? profilePreset.defaultFundingFees))
    setSpreadCost(asFieldValue(broker.defaultSpreadCost ?? profilePreset.defaultSpreadCost))
    setSlippage(asFieldValue(broker.defaultSlippage ?? profilePreset.defaultSlippage))
    setNetPnL('')
    setEntryValue('')
    setStopLossValue('')
    setTakeProfitValue('')
    setExitValue('')
    setPartialExit1Percent('')
    setPartialExit1Price('')
    setPartialExit2Percent('')
    setPartialExit2Price('')
    setPartialExit3Percent('')
    setPartialExit3Price('')
    setPositionSizeValue('')
    setMarginUsedValue('')
    setRiskPercentValue('')
    setAccountSizeValue('')
    setSelectedUserCostProfileId('')
    setNewProfileTitle('')
  }

  function handleSetupChange(rawValue: string) {
    setSetupValue(rawValue)
    const matched = setupOptionByTitle.get(rawValue.trim())
    setSelectedSetupId(matched?.id ?? '')
  }

  function applyQuickPnlOverride() {
    if (calculatedPnL === null) return
    setNetPnL(String(calculatedPnL))
    setPnlMode('override')
    setShowAdvanced(true)
  }

  function useQuickPnlAutoMode() {
    setNetPnL('')
    setPnlMode('auto')
  }

  function buildTradePayload(formData: FormData) {
    return {
      market: String(formData.get('market') ?? ''),
      setup: String(formData.get('setup') ?? ''),
      setupId: String(formData.get('setup_id') ?? ''),
      emotion: String(formData.get('emotion') ?? ''),
      bias: String(formData.get('bias') ?? ''),
      ruleCheck: String(formData.get('rule_check') ?? ''),
      reviewRepeatability: String(formData.get('review_repeatability') ?? ''),
      reviewState: String(formData.get('review_state') ?? ''),
      reviewLesson: String(formData.get('review_lesson') ?? ''),
      tradeOccurredAt: String(formData.get('trade_occurred_at') ?? ''),
      entry: entryValue,
      stopLoss: stopLossValue,
      takeProfit: takeProfitValue,
      exit: exitValue,
      netPnL: netPnL,
      riskPercent: riskPercentValue,
      accountSize: accountSizeValue,
      marginUsed: marginUsedValue,
      rMultiple: String(formData.get('r_multiple') ?? ''),
      pnlMode: String(formData.get('pnl_mode') ?? ''),
      costProfile: String(formData.get('cost_profile') ?? ''),
      brokerProfile: String(formData.get('broker_profile') ?? ''),
      instrumentType: String(formData.get('instrument_type') ?? ''),
      accountTemplate: String(formData.get('account_template') ?? ''),
      marketTemplate: String(formData.get('market_template') ?? ''),
      positionSize: positionSizeValue,
      pointValue: String(formData.get('point_value') ?? ''),
      fees: String(formData.get('fees') ?? ''),
      exchangeFees: String(formData.get('exchange_fees') ?? ''),
      fundingFees: String(formData.get('funding_fees') ?? ''),
      fundingRateBps: String(formData.get('funding_rate_bps') ?? ''),
      fundingIntervals: String(formData.get('funding_intervals') ?? ''),
      spreadCost: String(formData.get('spread_cost') ?? ''),
      slippage: String(formData.get('slippage') ?? ''),
      accountCurrency: String(formData.get('account_currency') ?? ''),
      cryptoMarketType: String(formData.get('crypto_market_type') ?? ''),
      executionType: String(formData.get('execution_type') ?? ''),
      fundingDirection: String(formData.get('funding_direction') ?? ''),
      quoteAsset: String(formData.get('quote_asset') ?? ''),
      leverage: String(formData.get('leverage') ?? ''),
      partialExit1Percent,
      partialExit1Price,
      partialExit2Percent,
      partialExit2Price,
      partialExit3Percent,
      partialExit3Price,
      userCostProfileId: String(formData.get('user_cost_profile_id') ?? ''),
      notes: noteText,
      screenshotUrl: '',
      tags: selectedTags,
    }
  }

  function handleSubmit(formData: FormData) {
    if (needsExitBasis && exitBasis === 'unconfirmed') {
      setStatus(text('Bitte kläre zuerst, ob der gespeicherte Ausstiegspreis den letzten Teilverkauf oder den Durchschnitt aller Verkäufe beschreibt.', 'Choose whether the saved exit price is for the final exit or the average of all exits.'))
      return
    }
    const basePayload = buildTradePayload(formData)
    const payload = {
      ...basePayload,
      tradeOccurredAt: basePayload.tradeOccurredAt.trim() || (isEditMode ? '' : new Date().toISOString()),
      // Send the final remainder price. The server action computes the stored average exactly once.
      exit: basePayload.exit,
      notes: basePayload.notes,
    }
    const validation = validateTradeCaptureInput(payload, isEditMode ? initialValues?.capturedAt ?? initialValues?.createdAt : undefined, locale)

    if (!validation.isValid) {
      setValidationErrors(validation.errors)
      setStatus(validation.summary)
      return
    }

    setValidationErrors({})

    startTransition(async () => {
      const currentMediaItems = normalizeTradeMediaItems(existingMediaItems)
      const screenshotUrl = currentMediaItems[0]?.publicUrl ?? initialValues?.screenshotUrl ?? ''

      const result = isEditMode && tradeId
        ? await updateTradeEntry(tradeId, { ...payload, screenshotUrl, tags: validation.normalizedTags }, locale)
        : await createTradeEntry({ ...payload, screenshotUrl, tags: validation.normalizedTags }, locale)

      if (!result.success) {
        setStatus(result.message, result.success)
        if ('fieldErrors' in result && result.fieldErrors) {
          setValidationErrors(result.fieldErrors)
        }
        return
      }

      if (pendingFiles.length && result.tradeId && result.mode === 'supabase') {
        let uploaded: TradeMediaUploadInput[] = []
        try {
          setStatus(text('Screenshots werden hochgeladen …', 'Uploading screenshots…'))
          uploaded = await uploadTradeScreenshots(result.tradeId, pendingFiles, currentMediaItems.length)
          const syncResult = await syncTradeMedia(result.tradeId, normalizeTradeMediaItems([...currentMediaItems, ...uploaded]))
          if (!syncResult.success) {
            await requestUncommittedMediaCleanup({ kind: 'trade', parentId: result.tradeId, storagePaths: uploaded.map((item) => item.storagePath) })
            setStatus(`${result.message} ${text('Screenshots konnten nicht angehängt werden.', 'Could not attach the screenshots.')}`)
            return
          }
          setStatus(`${result.message} ${pendingFiles.length === 1 ? text('Ein Screenshot angehängt.', 'One screenshot attached.') : text(`${pendingFiles.length} Screenshots angehängt.`, `${pendingFiles.length} screenshots attached.`)}`, true)
        } catch {
          if (uploaded.length) {
            await requestUncommittedMediaCleanup({ kind: 'trade', parentId: result.tradeId, storagePaths: uploaded.map((item) => item.storagePath) })
          }
          setStatus(`${result.message} ${text('Der Upload der Screenshots ist fehlgeschlagen.', 'Could not upload the screenshots.')}`)
          return
        }
      } else {
        if (pendingFiles.length && result.mode !== 'supabase') {
          setStatus(`${result.message} ${text('Screenshots werden im Demo-Modus nicht hochgeladen.', 'Screenshots are not uploaded in demo mode.')}`, true)
        } else {
          setStatus(result.message, result.success)
        }
      }

      if (isEditMode && tradeId) {
        router.push(cancelHref ?? `/trades?tradeId=${encodeURIComponent(tradeId)}`)
        router.refresh()
        return
      }

      ;(document.getElementById('trade-form') as HTMLFormElement | null)?.reset()
      setSelectedTags([])
      setNoteText('')
      setFiles([])
      setSnippingFiles([])
      resetEngineState()
    })
  }

  const pnlFieldLabel = pnlMode === 'auto' ? text('Ergebnis · automatisch', 'Automatic P&L') : text('Ergebnis (P&L)', 'Result (P&L)')
  const pnlFieldPlaceholder =
    pnlMode === 'auto' ? text('Automatik', 'Automatic') : text('Zahl eintragen oder leer lassen', 'Enter an amount or leave blank')
  const formEyebrow = ''
  const formTitle = isEditMode ? text('Trade bearbeiten', 'Edit trade') : text('Trade erfassen', 'Log a trade')
  const formCopy = ''
  const submitLabel = isEditMode ? text('Trade aktualisieren', 'Update trade') : text('Trade speichern', 'Save trade')

  return (
    <form
      id="trade-form"
      lang={locale}
      action={handleSubmit}
      className="space-y-6 rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl"
    >
      <fieldset disabled={isPending || currencySaving} className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          {formEyebrow ? <p className="text-xs uppercase tracking-[0.25em] text-white/45">{formEyebrow}</p> : null}
          <h2 className="mt-2 text-2xl font-semibold text-orange-300">{formTitle}</h2>
          {formCopy ? <p className="mt-2 max-w-3xl text-sm text-white/60">{formCopy}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEditMode && cancelHref ? (
            <Link
              href={cancelHref}
              className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/70 transition hover:border-white/20 hover:text-white"
            >
              {text('Zurück', 'Back')}
            </Link>
          ) : null}
          {isEditMode || selectedTags.length || pendingFiles.length + existingMediaItems.length ? (
            <div className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-xs text-orange-100/80">
              {isEditMode
                ? initialValues?.captureStatus === 'incomplete' ? text('Unvollständig', 'Incomplete') : text('Bearbeiten', 'Editing')
                : `${selectedTags.length} Tags · ${pendingFiles.length + existingMediaItems.length} Screenshots`}
            </div>
          ) : null}
        </div>
      </div>

      {Object.keys(validationErrors).length ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
          <p className="text-xs uppercase tracking-[0.2em] text-red-100/70">{text('Trade-Check', 'Check your trade')}</p>
          <p className="mt-2 text-sm font-medium">{status ?? text('Bitte die markierten Eingaben prüfen.', 'Check the highlighted fields.')}</p>
          <ul className="mt-3 space-y-1 text-sm text-red-100/85">
            {Object.entries(validationErrors).map(([field, message]) => (
              <li key={field}>• {message}</li>
            ))}
          </ul>
        </div>
      ) : status ? (
        <div role="status" className={`rounded-2xl border p-4 text-sm ${feedback?.success ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-black/25 text-white/75'}`}>
          {status}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-black/20 p-2">
        <span className="px-2 text-xs uppercase tracking-[0.2em] text-white/35">{text('Ansicht', 'View')}</span>
        <button
          type="button"
          onClick={() => {
            setSimpleMode(true)
            setShowAdvanced(false)
            setShowReflection(false)
          }}
          className={`rounded-full border px-4 py-2 text-sm transition ${simpleMode ? 'border-orange-300/35 bg-orange-400/10 text-orange-100' : 'border-white/10 bg-black/25 text-white/70 hover:border-white/20 hover:text-white'}`}
        >
          {text('Basisangaben', 'Basic details')}
        </button>
        <button
          type="button"
          onClick={() => {
            setSimpleMode(false)
            setShowAdvanced(true)
            if (isEditMode) setShowReflection(true)
          }}
          className={`rounded-full border px-4 py-2 text-sm transition ${!simpleMode ? 'border-orange-300/35 bg-orange-400/10 text-orange-100' : 'border-white/10 bg-black/25 text-white/70 hover:border-white/20 hover:text-white'}`}
        >
          {text('Alle Details', 'All details')}
        </button>
      </div>

      {(pendingFiles.length || existingMediaItems.length || initialValues?.screenshotUrl) ? (
        <div className="rounded-2xl border border-emerald-400/15 bg-black/25 px-4 py-3 text-sm text-emerald-100/80">
          {pendingFiles.length
            ? text(`${pendingFiles.length} neue Screenshots · ${existingMediaItems.length} vorhanden`, `${pendingFiles.length} new ${pendingFiles.length === 1 ? 'screenshot' : 'screenshots'} · ${existingMediaItems.length} existing`)
            : existingMediaItems.length
              ? text(`${existingMediaItems.length} Screenshots vorhanden`, `${existingMediaItems.length} ${existingMediaItems.length === 1 ? 'screenshot' : 'screenshots'} attached`)
              : text('Screenshot vorhanden', 'Screenshot attached')}
        </div>
      ) : null}

      <div className="grid gap-6">
        <div className="space-y-4">
          <input type="hidden" name="notes" value={noteText} />
          <input type="hidden" name="setup_id" value={selectedSetupId} />
          <input type="hidden" name="bias" value={tradeDirection} />
          <div className="grid gap-4 md:grid-cols-2">
            <ControlledDatalistInput
              name="market"
              label={text('Markt', 'Market')}
              listId="trade-market-options"
              options={marketOptions}
              value={marketValue}
              onChange={(event) => handleMarketChange(event.target.value)}
              placeholder={text('z. B. NASDAQ, BTC/USD, EUR/USD', 'e.g. NASDAQ, BTC/USD, EUR/USD')}
            />
            <ControlledInput
              name="trade_occurred_at"
              label={text('Trade-Zeit (Berlin)', 'Trade time (Berlin)')}
              placeholder={text('Zeit anpassen', 'Adjust time')}
              value={tradeOccurredAtValue}
              onChange={(event) => setTradeOccurredAtValue(event.target.value)}
              type="datetime-local"
              helper={text('Berliner Ortszeit, Sommer- und Winterzeit werden berücksichtigt.', 'Use local Berlin time. Daylight saving time is handled automatically.')}
            />
            <ControlledDatalistInput
              name="setup"
              label="Setup"
              listId="trade-setup-options"
              options={setups}
              value={setupValue}
              onChange={(event) => handleSetupChange(event.target.value)}
              placeholder={text('z. B. Liquidity Sweep, Pullback, Reclaim', 'e.g. Liquidity Sweep, Pullback, Reclaim')}
            />
            <div className="rounded-2xl border border-orange-400/15 bg-black/40 p-4">
              <span className="text-xs uppercase tracking-[0.2em] text-white/45">{text('Richtung', 'Direction')}</span>
              <div className="mt-3 flex flex-wrap gap-2">
                {biases.slice(0, 3).map((option) => {
                  const active = tradeDirection === option
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setTradeDirection(option)}
                      className={`rounded-full border px-3 py-2 text-sm transition ${active ? 'border-orange-300/35 bg-orange-400/10 text-orange-100' : 'border-white/10 bg-black/30 text-white/70 hover:border-white/20 hover:text-white'}`}
                    >
                      {option.replace(' / Beobachten', '')}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <section aria-label={text('Ergebnis und Währung', 'P&L and currency')} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="text-sm font-semibold text-white">{text('Ergebnis & Währung', 'P&L & currency')}</h3>
            <p className="text-xs leading-5 text-white/60">{text('Betrag und Währung laut deiner Abrechnung.', 'Use the amount and currency from your statement.')}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <ControlledInput
                  name="net_pnl"
                  label={pnlFieldLabel}
                  placeholder={pnlFieldPlaceholder}
                  value={netPnL}
                  onChange={(event) => setNetPnL(event.target.value)}
                  readOnly={pnlMode === 'auto'}
                  helper={pnlMode === 'auto' ? undefined : manualNumberHint}
                  className={pnlMode === 'auto' ? 'opacity-60' : ''}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] leading-5 text-white/45">
                  {pnlMode !== 'auto' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setNetPnL('')
                        setPnlMode('auto')
                      }}
                      className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-white/60 transition hover:border-white/20 hover:text-white"
                    >
                      {text('Automatik nutzen', 'Calculate automatically')}
                    </button>
                  ) : null}
                  {netPnL ? (
                    <button
                      type="button"
                      onClick={() => setNetPnL('')}
                      className="rounded-full border border-orange-400/15 bg-orange-400/10 px-3 py-1 text-[11px] text-orange-100/80 transition hover:border-orange-300/35 hover:text-white"
                    >
                      {text('Manuellen Wert löschen', 'Clear manual amount')}
                    </button>
                  ) : null}
                </div>
              </div>
              <ControlledSelect
                name="account_currency"
                label={text('Ergebniswährung', 'P&L currency')}
                options={[text('Bitte wählen', 'Select a currency'), ...SUPPORTED_TRADE_CURRENCIES]}
                values={['', ...SUPPORTED_TRADE_CURRENCIES]}
                value={normalizeTradeCurrency(accountCurrency) ?? ''}
                onChange={(event) => setAccountCurrency(event.target.value)}
              />
            </div>
            {accountCurrency && !normalizeTradeCurrency(accountCurrency) ? <p className="text-xs text-orange-100">{text('Die gespeicherte Währung wird nicht unterstützt. Bitte wähle die Währung laut Abrechnung.', 'The saved currency is unsupported. Select the currency from your statement.')}</p> : null}
            {isEditMode && tradeId ? <SaveTradeCurrencyOnly tradeId={tradeId} currency={accountCurrency} disabled={isPending} onBusyChange={setCurrencySaving} /> : null}
          </section>

          {isEditMode ? (
            <>
              <input type="hidden" name="emotion" value={initialValues?.emotion ?? ''} />
              <input type="hidden" name="rule_check" value={reviewRuleCheck} />
              <input type="hidden" name="review_repeatability" value={reviewRepeatability} />
              <input type="hidden" name="review_state" value={reviewState} />
              <input type="hidden" name="review_lesson" value={reviewLesson} />

              <details open={showReflection} className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,10,10,0.96),rgba(7,7,7,0.96))] p-5">
                <summary
                  onClick={(event) => {
                    event.preventDefault()
                    setShowReflection((current) => !current)
                  }}
                  className="list-none cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-white/40">Review</p>
                      <h3 className="mt-2 text-sm font-semibold text-white">{text('Nachbereitung · optional', 'Post-trade review · optional')}</h3>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/60">
                        {showReflection ? text('Schließen', 'Close') : text('Öffnen', 'Open')}
                      </span>
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-100">
                        {reviewLayerProgress.label}
                      </span>
                    </div>
                  </div>
                </summary>
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,0.66fr)_minmax(0,1.34fr)] xl:items-start">
                    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/45">{text('Richtung', 'Direction')}</p>
                      <p className="mt-2 text-base font-medium text-white">{tradeDirection ? text(tradeDirection, tradeDirection.replace(' / Beobachten', ' / Watch')) : text('Noch offen', 'Pending')}</p>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                      <ReviewChipGroup label={text('Regelkonformität', 'Followed the rules')} hint="" value={reviewRuleCheck} onChange={setReviewRuleCheck} tone="red" options={reviewRuleOptions} />
                      <ReviewChipGroup label={text('Wieder so handeln?', 'Would you trade it again?')} hint="" value={reviewRepeatability} onChange={setReviewRepeatability} options={reviewRepeatabilityOptions} />
                    </div>
                  </div>
                  <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] 2xl:items-start">
                    <ReviewChipGroup label={text('Zustand', 'State of mind')} hint="" value={reviewState} onChange={setReviewState} options={reviewStateOptions} />
                    <label className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <span className="text-xs uppercase tracking-[0.2em] text-white/45">{text('Lerneffekt', 'Takeaway')}</span>
                        </div>
                        {reviewLesson.trim() ? <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-white/60">{text('gesetzt', 'Added')}</span> : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {reviewLessonSuggestions.map((suggestion) => {
                          const active = reviewLesson.trim() === suggestion.de || reviewLesson.trim() === suggestion.en
                          return (
                            <button
                              key={suggestion.de}
                              type="button"
                              onClick={() => setReviewLesson(active ? '' : suggestion[locale])}
                              className={`rounded-full border px-3 py-1.5 text-[11px] transition ${active ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-black/25 text-white/60 hover:border-white/20 hover:text-white'}`}
                            >
                              {suggestion[locale]}
                            </button>
                          )
                        })}
                      </div>
                      <textarea
                        name="review_lesson_visible"
                        rows={3}
                        value={reviewLesson}
                        onChange={(event) => setReviewLesson(event.target.value)}
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
                        placeholder={text('Ein Satz reicht', 'One sentence is enough')}
                      />
                    </label>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <>
              <input type="hidden" name="emotion" value={initialValues?.emotion ?? ''} />
              <input type="hidden" name="rule_check" value={initialValues?.ruleCheck ?? ''} />
              <input type="hidden" name="review_repeatability" value={initialValues?.reviewRepeatability ?? ''} />
              <input type="hidden" name="review_state" value={initialValues?.reviewState ?? ''} />
              <input type="hidden" name="review_lesson" value={initialValues?.reviewLesson ?? ''} />
            </>
          )}

          <details open={showAdvanced} className="rounded-3xl border border-white/10 bg-black/25 p-4">
            <summary
              onClick={(event) => {
                event.preventDefault()
                setShowAdvanced((current) => !current)
              }}
              className="list-none cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">Optional</p>
                  <h3 className="mt-2 text-sm font-semibold text-white">{text('Berechnung & Kosten', 'Calculation & costs')}</h3>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/60">
                  {showAdvanced ? text('Schließen', 'Close') : text('Öffnen', 'Open')}
                </span>
              </div>
            </summary>
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
              <ControlledSelect
                name="account_template"
                label={text('Account-Template', 'Account template')}
                options={accountTemplateOptions.map((option) => locale === 'en' ? getAccountTemplateLabel(option.value, locale) : option.label)}
                values={accountTemplateOptions.map((option) => option.value)}
                value={accountTemplate}
                onChange={(event) => handleAccountTemplateChange(event.target.value as TradeAccountTemplate)}
              />
              <ControlledSelect
                name="market_template"
                label={text('Markt-Template', 'Market template')}
                options={marketTemplateOptions.map((option) => locale === 'en' ? getMarketTemplateLabel(option.value, locale) : option.label)}
                values={marketTemplateOptions.map((option) => option.value)}
                value={marketTemplate}
                onChange={(event) => handleMarketTemplateChange(event.target.value as TradeMarketTemplate)}
              />
              <ControlledSelect
                name="broker_profile"
                label={text('Brokerprofil', 'Broker profile')}
                options={brokerProfileOptions.map((option) => locale === 'en' ? getBrokerProfileLabel(option.value, locale) : option.label)}
                values={brokerProfileOptions.map((option) => option.value)}
                value={brokerProfile}
                onChange={(event) => handleBrokerProfileChange(event.target.value as TradeBrokerProfile)}
              />
              <ControlledSelect
                name="instrument_type"
                label={text('Instrumenttyp', 'Instrument type')}
                options={instrumentOptions.map((option) => locale === 'en' ? getInstrumentLabel(option.value, locale) : option.label)}
                values={instrumentOptions.map((option) => option.value)}
                value={instrumentType}
                onChange={(event) => handleInstrumentChange(event.target.value as TradeInstrumentType)}
              />
              <label className="rounded-2xl border border-white/10 bg-black/40 p-4 sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/45">{text('Eigenes Kostenprofil', 'Custom cost profile')}</span>
                <div className="mt-4 space-y-3">
                  <select
                    value={selectedUserCostProfileId}
                    onChange={(event: any) => {
                      const nextId = event.target.value
                      setSelectedUserCostProfileId(nextId)
                      if (!nextId) return
                      const matched = userCostProfiles.find((profile) => profile.id === nextId)
                      if (matched) applyUserCostProfile(matched)
                    }}
                    className="w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none"
                  >
                    <option value="">{text('Kein Nutzerprofil', 'No custom profile')}</option>
                    {userCostProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.title}
                      </option>
                    ))}
                  </select>
                  <input
                    value={newProfileTitle}
                    onChange={(event: any) => setNewProfileTitle(event.target.value)}
                    placeholder={text('Aktuelles Kosten-Setup als Profil speichern', 'Name this cost profile')}
                    className="w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
                  />
                  <div className="grid gap-2 md:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => startTransition(() => { void handleSaveUserCostProfile() })}
                      className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 transition hover:border-emerald-300/40"
                    >
                      {text('Profil sichern', 'Save profile')}
                    </button>
                    <button
                      type="button"
                      disabled={!selectedUserCostProfileId}
                      onClick={() => startTransition(() => { void handleDeleteSelectedUserCostProfile() })}
                      className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200 transition hover:border-red-300/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {text('Profil entfernen', 'Remove profile')}
                    </button>
                    <Link
                      href="/cost-profiles"
                      className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/65 transition hover:border-white/20 hover:text-white"
                    >
                      {text('Profile verwalten', 'Manage profiles')}
                    </Link>
                  </div>
                </div>
                <input type="hidden" name="user_cost_profile_id" value={selectedUserCostProfileId} />
              </label>
              <ControlledSelect
                name="pnl_mode"
                label={text('P&L Modus', 'P&L mode')}
                options={pnlModes.map((option) => locale === 'en' ? getPnLModeLabel(option.value, locale) : option.label)}
                values={pnlModes.map((option) => option.value)}
                value={pnlMode}
                onChange={(event) => setPnlMode(event.target.value as TradePnLMode)}
              />
              <ControlledSelect
                name="cost_profile"
                label={text('Kostenprofil', 'Cost profile')}
                options={costProfileOptions.map((option) => locale === 'en' ? getCostProfileLabel(option.value, locale) : option.label)}
                values={costProfileOptions.map((option) => option.value)}
                value={costProfile}
                onChange={(event) => handleCostProfileChange(event.target.value as TradeCostProfile)}
              />

              <ControlledInput
                name="point_value"
                label={text('Punktwert / Pip-Wert', 'Point or pip value')}
                placeholder={
                  brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue
                    ? `${text('z. B.', 'e.g.')} ${brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue}`
                    : 'optional'
                }
                value={pointValue}
                onChange={(event) => setPointValue(event.target.value)}
              />
              <ControlledInput
                name="position_size"
                label={`${text('Positionsgröße', 'Position size')} (${sizeHint})`}
                placeholder={text('leer lassen, wenn Margin + Hebel reichen', 'Leave blank to calculate from margin and leverage')}
                value={positionSizeValue}
                onChange={(event) => setPositionSizeValue(event.target.value)}
              />
              {instrumentType === 'crypto' ? (
                <>
                  <ControlledSelect
                    name="crypto_market_type"
                    label={text('Krypto-Modus', 'Crypto market type')}
                    options={cryptoMarketTypeOptions.map((option) => locale === 'en' ? getCryptoMarketTypeLabel(option.value, locale) : option.label)}
                    values={cryptoMarketTypeOptions.map((option) => option.value)}
                    value={cryptoMarketType}
                    onChange={(event) => handleCryptoMarketTypeChange(event.target.value as TradeCryptoMarketType)}
                  />
                  <ControlledSelect
                    name="execution_type"
                    label={text('Ausführung', 'Execution type')}
                    options={executionTypeOptions.map((option) => locale === 'en' ? getExecutionTypeLabel(option.value, locale) : option.label)}
                    values={executionTypeOptions.map((option) => option.value)}
                    value={executionType}
                    onChange={(event) => { setExecutionType(normalizeTradeExecutionType(event.target.value)); setSelectedUserCostProfileId('') }}
                  />
                  <ControlledSelect
                    name="funding_direction"
                    label={text('Funding-Richtung', 'Funding direction')}
                    options={fundingDirectionOptions.map((option) => locale === 'en' ? getFundingDirectionLabel(option.value, locale) : option.label)}
                    values={fundingDirectionOptions.map((option) => option.value)}
                    value={fundingDirection}
                    onChange={(event) => { setFundingDirection(normalizeTradeFundingDirection(event.target.value)); setSelectedUserCostProfileId('') }}
                  />
                  <ControlledInput
                    name="funding_rate_bps"
                    label={text('Funding-Rate (bps)', 'Funding rate (bps)')}
                    placeholder={text('z. B. 1,50', 'e.g. 1.50')}
                    value={fundingRateBps}
                    onChange={(event) => { setFundingRateBps(event.target.value); setSelectedUserCostProfileId('') }}
                  />
                  <ControlledInput
                    name="funding_intervals"
                    label={text('Funding-Intervalle', 'Funding periods')}
                    placeholder={text('z. B. 2', 'e.g. 2')}
                    value={fundingIntervals}
                    onChange={(event) => { setFundingIntervals(event.target.value); setSelectedUserCostProfileId('') }}
                  />
                  <ControlledInput
                    name="quote_asset"
                    label={text('Quote Asset', 'Quote asset')}
                    placeholder={text('z. B. USDT', 'e.g. USDT')}
                    value={quoteAsset}
                    onChange={(event) => setQuoteAsset(event.target.value.toUpperCase())}
                  />
                </>
              ) : (
                <>
                  <input type="hidden" name="crypto_market_type" value="manual" />
                  <input type="hidden" name="execution_type" value="manual" />
                  <input type="hidden" name="funding_direction" value="manual" />
                  <input type="hidden" name="funding_rate_bps" value="" />
                  <input type="hidden" name="funding_intervals" value="" />
                  <input type="hidden" name="quote_asset" value="" />
                </>
              )}
              <ControlledInput
                name="fees"
                label={text('Kommission', 'Commission')}
                placeholder={text('z. B. 1,00', 'e.g. 1.00')}
                value={fees}
                onChange={(event) => setFees(event.target.value)}
              />
              <ControlledInput
                name="exchange_fees"
                label={text('Börsengebühren', 'Exchange fees')}
                placeholder={text('z. B. 0,35', 'e.g. 0.35')}
                value={exchangeFees}
                onChange={(event) => setExchangeFees(event.target.value)}
              />
              <ControlledInput
                name="funding_fees"
                label={text('Funding absolut', 'Funding amount')}
                placeholder={text('z. B. 1,20', 'e.g. 1.20')}
                value={fundingFees}
                onChange={(event) => setFundingFees(event.target.value)}
              />
              <ControlledInput
                name="spread_cost"
                label={text('Spread-Kosten', 'Spread cost')}
                placeholder={text('z. B. 0,60', 'e.g. 0.60')}
                value={spreadCost}
                onChange={(event) => setSpreadCost(event.target.value)}
              />
              <ControlledInput
                name="slippage"
                label="Slippage"
                placeholder={text('z. B. 1,50', 'e.g. 1.50')}
                value={slippage}
                onChange={(event) => setSlippage(event.target.value)}
              />
              <FieldInput
                name="r_multiple"
                label="R-Multiple"
                placeholder="optional"
                defaultValue={initialValues?.rMultiple}
              />
              </div>
            <div className="rounded-2xl border border-orange-400/15 bg-orange-400/5 p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoMini label="Account" value={getAccountTemplateLabel(accountTemplate, locale)} />
                <InfoMini label={text('Markt', 'Market')} value={getMarketTemplateLabel(marketTemplate, locale)} />
                <InfoMini label="Broker" value={getBrokerProfileLabel(brokerProfile, locale)} />
                <InfoMini label={text('Kostenprofil', 'Cost profile')} value={getCostProfileLabel(costProfile, locale)} />
                <InfoMini label="Instrument" value={getInstrumentLabel(instrumentType, locale)} />
                <InfoMini label="P&L" value={locale === 'en' ? getPnLModeLabel(pnlMode, locale) : pnlModes.find((option) => option.value === pnlMode)?.label ?? 'Auto'} />
                <InfoMini label={text('Kosten', 'Costs')} value={`${text('Gesamt', 'Total')} ${displayNumber(costSummary.totalCosts)}`} />
                <InfoMini label={text('Hebel', 'Leverage')} value={leverage ? `${leverage}x` : '—'} />
              </div>
            </div>
            </div>
          </details>
        </div>

        <div className="space-y-4">
          <details key={`prices-${simpleMode}`} open={!simpleMode || pnlMode !== 'manual' || needsExitBasis} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <summary className="cursor-pointer text-sm font-medium text-white">{text('Preise & Ausführung', 'Prices & execution')}</summary>
            <p className="mt-3 text-xs leading-5 text-white/60">{manualNumberHint}</p>
            {needsExitBasis ? <div className="mt-4 rounded-2xl border border-orange-300/25 bg-orange-400/5 p-4">
              <label className="block text-sm text-orange-50">
                {text('Gespeicherten Ausstiegspreis prüfen:', 'Check the saved exit price:')} {stringifyInitialValue(initialValues?.exit)}
                <select value={exitBasis} onChange={(event) => {
                  const basis = event.target.value as typeof exitBasis
                  setExitBasis(basis)
                  setExitValue(basis === 'average'
                    ? stringifyInitialValue(restoreRemainderExitFromStoredAverage({ exit: initialValues?.exit, partialExits: initialPartialExits }))
                    : basis === 'remainder' ? stringifyInitialValue(initialValues?.exit) : '')
                }} className="mt-2 w-full rounded-xl border border-white/15 bg-black p-3 text-white">
                  <option value="unconfirmed">{text('Bitte anhand deiner Abrechnung zuordnen', 'Select the price type from your statement')}</option>
                  <option value="remainder">{text('Preis des letzten Verkaufs der Restposition', 'Final exit price for the remaining position')}</option>
                  <option value="average">{text('Durchschnittspreis aller Verkäufe', 'Average price across all exits')}</option>
                </select>
              </label>
              <p className="mt-2 text-xs leading-5 text-white/60">{text('Bei älteren Teilverkäufen ist die Preisart nicht eindeutig hinterlegt. Wähle sie anhand deiner Unterlagen; Equora nimmt keine automatische Zuordnung vor.', 'For this older trade, the exit price type is unclear. Use your statement to select the right one.')}</p>
            </div> : null}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <ControlledInput
                name="entry"
                label="Entry"
                placeholder={text('Entry eingeben', 'Enter entry price')}
                value={entryValue}
                onChange={(event) => setEntryValue(event.target.value)}
              />
              <ControlledInput
                name="stop_loss"
                label="Stop Loss"
                placeholder={text('Stop Loss eingeben', 'Enter stop-loss price')}
                value={stopLossValue}
                onChange={(event) => setStopLossValue(event.target.value)}
              />
              <ControlledInput
                name="take_profit"
                label="Take Profit"
                placeholder={text('Take Profit eingeben', 'Enter take-profit price')}
                value={takeProfitValue}
                onChange={(event) => setTakeProfitValue(event.target.value)}
              />
              <ControlledInput
                name="exit"
                label="Exit"
                placeholder="optional"
                value={exitValue}
                onChange={(event) => setExitValue(event.target.value)}
              />
            </div>
            <div className="mt-4 rounded-2xl border border-orange-400/20 bg-orange-400/5 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-orange-100/60">{text('P&L Vorschau', 'P&L preview')}</p>
                  <p className="mt-1 text-xs text-white/45">{text('Vor dem Speichern. Belastbar erst mit vollständigem Trade.', 'Estimate based on the trade details entered so far.')}</p>
                  <p className={`mt-2 text-2xl font-semibold ${quickPnlTone}`}>{quickPnlLabel}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                      {quickRPreview !== null ? displayR(quickRPreview) : text('R offen', 'R unavailable')}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                      {text('Risiko', 'Risk')} {derivedStopRisk !== null ? `${displayNumber(derivedStopRisk)} ${accountCurrency || ''}`.trim() : text('Stop fehlt', 'Stop required')}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={useQuickPnlAutoMode}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${pnlMode === 'auto' ? 'border-orange-300/35 bg-orange-400/10 text-orange-100' : 'border-white/10 bg-black/20 text-white/60 hover:border-white/20 hover:text-white'}`}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    disabled={calculatedPnL === null}
                    onClick={applyQuickPnlOverride}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/60 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {text('Übernehmen', 'Apply')}
                  </button>
                </div>
              </div>
            </div>
          </details>

            <details className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <summary className="list-none cursor-pointer">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/45">{text('Teilverkäufe', 'Partial exits')}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {partialExitPreview.effectiveExit !== null ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200">{text('Ø Exit', 'Average exit')} {displayNumber(partialExitPreview.effectiveExit, 4)}</span> : null}
                    {partialExitPreview.coveredPercent > 0 ? <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">{displayNumber(partialExitPreview.coveredPercent, 0)}% {text('realisiert', 'realised')}</span> : null}
                    {partialExitPreview.hasOpenRemainder ? <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100/90">{displayNumber(partialExitPreview.remainderPercent, 0)}% {text('Rest', 'remaining')}</span> : null}
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-white/60">
                      <span className="group-open:hidden">{text('Öffnen', 'Open')}</span><span className="hidden group-open:inline">{text('Schließen', 'Close')}</span>
                    </span>
                  </div>
                </div>
              </summary>
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <PartialExitRow label="TP 1" percent={partialExit1Percent} onPercentChange={setPartialExit1Percent} price={partialExit1Price} onPriceChange={setPartialExit1Price} />
                  <PartialExitRow label="TP 2" percent={partialExit2Percent} onPercentChange={setPartialExit2Percent} price={partialExit2Price} onPriceChange={setPartialExit2Price} />
                  <PartialExitRow label="TP 3" percent={partialExit3Percent} onPercentChange={setPartialExit3Percent} price={partialExit3Price} onPriceChange={setPartialExit3Price} />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/65">
                    <p className="uppercase tracking-[0.18em] text-white/35">{text('Realisiert', 'Realised')}</p>
                    <p className="mt-2 text-sm text-white">{partialExitSize}</p>
                    {partialExitMoney !== null ? <p className="mt-2 text-xs text-emerald-200/85">{partialExitMoney}</p> : null}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/65">
                    <p className="uppercase tracking-[0.18em] text-white/35">{text('Rest', 'Remaining position')}</p>
                    <p className="mt-2 text-sm text-white">{partialExitRemaining}</p>
                  </div>
                </div>
              </div>
            </details>

          <details className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">{text('Risiko', 'Risk')}</p>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-white/60">
                <span className="group-open:hidden">{text('Öffnen', 'Open')}</span><span className="hidden group-open:inline">{text('Schließen', 'Close')}</span>
              </span>
            </summary>
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <ControlledInput
                  name="margin_used"
                  label="Margin (optional)"
                  placeholder={text('z. B. 500', 'e.g. 500')}
                  value={marginUsedValue}
                  onChange={(event) => setMarginUsedValue(event.target.value)}
                />
                <ControlledInput
                  name="leverage"
                  label={text('Hebel', 'Leverage')}
                  placeholder={text('z. B. 5', 'e.g. 5')}
                  value={leverage}
                  onChange={(event) => setLeverage(event.target.value)}
                />
                <ControlledInput
                  name="account_size"
                  label={text('Kontogröße (optional)', 'Account size (optional)')}
                  placeholder={text('z. B. 25000', 'e.g. 25000')}
                  value={accountSizeValue}
                  onChange={(event) => setAccountSizeValue(event.target.value)}
                />
                <ControlledInput
                  name="risk_percent"
                  label={text('Geplantes Risiko %', 'Planned risk %')}
                  placeholder={text('z. B. 1', 'e.g. 1')}
                  value={riskPercentValue}
                  onChange={(event) => setRiskPercentValue(event.target.value)}
                />
              </div>
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 px-4 py-4 text-sm text-white/70">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-100/75">{text('Risiko-Kurzblick', 'Risk overview')}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <InfoMini label={text('Abgeleitete Größe', 'Calculated size')} value={derivedPositionSize !== null ? `${displayNumber(derivedPositionSize, 4)} ${sizeHint}` : text('Noch offen', 'Pending')} />
                  <InfoMini label="Exposure" value={derivedExposure !== null ? `${displayNumber(derivedExposure)} ${accountCurrency || ''}`.trim() : text('Noch offen', 'Pending')} />
                  <InfoMini label="Margin" value={derivedMargin !== null ? `${displayNumber(derivedMargin)} ${accountCurrency || ''}`.trim() : text('Noch offen', 'Pending')} />
                  <InfoMini label={text('Stop-Risiko', 'Stop risk')} value={derivedStopRisk !== null ? `${displayNumber(derivedStopRisk)} ${accountCurrency || ''}`.trim() : text('Noch offen', 'Pending')} />
                  <InfoMini label={text('Ø Exit', 'Average exit')} value={partialExitPreview.effectiveExit !== null ? displayNumber(partialExitPreview.effectiveExit, 4) : text('Kein Teilverkauf', 'No partial exit')} />
                  <InfoMini label={text('Realisiert', 'Realised')} value={partialExitMoney ?? partialExitSize} />
                  <InfoMini label={text('Rest offen', 'Remaining position')} value={partialExitRemaining} />
                </div>
              </div>
            </div>
          </details>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-orange-100/60">{text('Zusatz', 'Extras')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'snip' as const, label: text('Bild', 'Image') },
                  { key: 'screenshots' as const, label: 'Uploads' },
                  { key: 'tags' as const, label: 'Tags' },
                  { key: 'notes' as const, label: text('Notiz', 'Note') },
                ].map((section) => {
                  const isActive = activeExtraSection === section.key
                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => setActiveExtraSection((current) => (current === section.key ? null : section.key))}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${isActive ? 'border-orange-400/30 bg-orange-400/10 text-orange-100' : 'border-white/10 bg-black/20 text-white/70 hover:border-white/20 hover:text-white'}`}
                    >
                      {section.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-4">
              {activeExtraSection === 'snip' ? <SnippingAssistCard marketOptions={marketOptions} onApply={applySnippingValues} onFilesChange={setSnippingFiles} /> : null}
              {activeExtraSection === 'screenshots' ? <ChartUploadAdvanced onFilesChange={setFiles} /> : null}
              {activeExtraSection === 'tags' ? <TradeTagSelector selectedTags={selectedTags} onChange={setSelectedTags} options={tagOptions} /> : null}
              {activeExtraSection === 'notes' ? (
                <div className="rounded-2xl border border-orange-400/15 bg-black/40 p-4">
                  <div className="mb-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-orange-100/70">{text('Notiz', 'Note')}</p>
                  </div>
                  <textarea
                    aria-label={text('Notiztext', 'Note text')}
                    rows={5}
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    className="block min-h-[152px] w-full resize-y rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
                    placeholder={text('Kurzer Kontext, Fehler oder Erkenntnis', 'Brief context, mistake or takeaway')}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="h-20" aria-hidden="true" />
          {status ? <p className="text-sm text-white/60">{status}</p> : null}

          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
            <div className="pointer-events-auto flex w-full max-w-5xl items-center justify-end gap-2 rounded-2xl border border-orange-400/35 bg-[rgba(15,12,9,0.92)] px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.38)] backdrop-blur">
              <div className="flex items-center gap-2">
                {cancelHref ? (
                  <Link
                    href={cancelHref}
                    className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white"
                  >
                    {text('Zurück', 'Back')}
                  </Link>
                ) : null}
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl border border-orange-400/30 bg-orange-400 px-4 py-2.5 text-sm font-medium text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isPending ? text('Speichert...', 'Saving…') : submitLabel}
                </button>
              </div>
            </div>
          </div>

          <datalist id="trade-market-options">
            {marketOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <datalist id="trade-setup-options">
            {setups.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
      </div>
      </fieldset>
    </form>
  )
}


type ReviewChipOption = { label: string; en: string; value: string }

function ReviewChipGroup({
  label,
  hint,
  value,
  onChange,
  options,
  tone = 'neutral',
}: {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  options: ReviewChipOption[]
  tone?: 'neutral' | 'red'
}) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const selected = options.find((option) => option.value === value)
  const activeClass = tone === 'red'
    ? 'border-red-300/40 bg-red-400/12 text-red-100'
    : 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100'

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</p>
          {hint ? <p className="mt-2 text-xs text-white/45">{hint}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {value ? <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-white/60">{selected ? text(selected.label, selected.en) : value}</span> : null}
          {value ? (
            <button
              type="button"
              onClick={() => onChange('')}
              className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-white/50 transition hover:border-white/20 hover:text-white"
            >
              {text('Zurücksetzen', 'Clear selection')}
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(active ? '' : option.value)}
              className={`rounded-full border px-3 py-2 text-sm transition ${active ? activeClass : 'border-white/10 bg-black/30 text-white/70 hover:border-white/20 hover:text-white'}`}
            >
              {text(option.label, option.en)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FieldInput({ name, label, placeholder, defaultValue }: { key?: string; name: string; label: string; placeholder: string; defaultValue?: string | number | null }) {
  return (
    <label className="block rounded-2xl border border-orange-400/15 bg-black/40 p-4">
      <span className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</span>
      <input
        name={name}
        type="text"
        className="mt-3 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
        placeholder={placeholder}
        defaultValue={defaultValue ?? ''}
      />
    </label>
  )
}

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p className="mt-2 text-sm text-white/82">{value}</p>
    </div>
  )
}

function ControlledDatalistInput({
  name,
  label,
  listId,
  options,
  value,
  onChange,
  placeholder,
  helper,
}: {
  name: string
  label: string
  listId: string
  options: string[]
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  placeholder: string
  helper?: string
}) {
  return (
    <label className="block rounded-2xl border border-orange-400/15 bg-black/40 p-4">
      <span className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</span>
      <input
        name={name}
        list={listId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="mt-3 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
      />
      {helper ? <span className="mt-2 block text-[11px] leading-5 text-white/45">{helper}</span> : null}
    </label>
  )
}


function PartialExitRow({
  label,
  percent,
  onPercentChange,
  price,
  onPriceChange,
}: {
  label: string
  percent: string
  onPercentChange: (value: string) => void
  price: string
  onPriceChange: (value: string) => void
}) {
  const text = journalText(useJournalLocale())
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">{text('Anteil %', 'Share %')}</span>
          <input value={percent} onChange={(event) => onPercentChange(event.target.value)} placeholder="25" className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
        </label>
        <label>
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">{text('Exit-Preis', 'Exit price')}</span>
          <input value={price} onChange={(event) => onPriceChange(event.target.value)} placeholder="16.00" className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" /><span className="mt-2 block text-[11px] leading-5 text-white/35">{text('Bitte den echten Exit-Preis dieser Teilstufe eintragen.', 'Enter the actual price for this partial exit.')}</span>
        </label>
      </div>
    </div>
  )
}

function ControlledInput({
  name,
  label,
  placeholder,
  value,
  onChange,
  readOnly = false,
  className = '',
  type = 'text',
  helper,
}: {
  name: string
  label: string
  placeholder: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  readOnly?: boolean
  className?: string
  type?: string
  helper?: string
}) {
  return (
    <label className="block rounded-2xl border border-orange-400/15 bg-black/40 p-4">
      <span className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        className={`mt-3 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 ${className}`.trim()}
        placeholder={placeholder}
      />
      {helper ? <span className="mt-2 block text-[11px] leading-5 text-white/45">{helper}</span> : null}
    </label>
  )
}

function FieldSelect({
  name,
  label,
  options,
  values,
  tone = 'orange',
  className = '',
  defaultValue,
}: {
  name: string
  label: string
  options: string[]
  values?: string[]
  tone?: 'orange' | 'red'
  className?: string
  defaultValue?: string | null
}) {
  const classes = tone === 'red' ? 'border-red-400/15 bg-red-400/5' : 'border-orange-400/15 bg-orange-400/5'

  return (
    <label className={`block rounded-2xl border ${classes} p-4 ${className}`.trim()}>
      <span className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</span>
      <select
        name={name}
        className={`mt-3 w-full rounded-2xl border ${classes} px-4 py-3 text-sm text-white outline-none`}
        defaultValue={defaultValue ?? values?.[0] ?? options[0]}
      >
        {options.map((option, index) => (
          <option key={option} value={values?.[index] ?? option} className="bg-slate-950 text-white">
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function ControlledSelect({
  name,
  label,
  options,
  values,
  value,
  onChange,
}: {
  name: string
  label: string
  options: string[]
  values: string[]
  value: string
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void
}) {
  return (
    <label className="block rounded-2xl border border-orange-400/15 bg-black/40 p-4">
      <span className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</span>
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="mt-3 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none"
      >
        {options.map((option, index) => (
          <option key={values[index]} value={values[index]} className="bg-slate-950 text-white">
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

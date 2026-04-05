'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createTradeEntry, syncTradeMedia, updateTradeEntry } from '@/app/actions/trades'
import { deleteUserCostProfile, saveUserCostProfile } from '@/app/actions/user-cost-profiles'
import { TradeTagSelector } from '@/components/trades/trade-tag-selector'
import { SnippingAssistCard } from '@/components/trades/snipping-assist-card'
import { ChartUploadAdvanced } from '@/components/uploads/chart-upload-advanced'
import { uploadTradeScreenshots } from '@/lib/supabase/storage'
import {
  getTradeAccountTemplatePreset,
  getTradeBrokerProfilePreset,
  getTradeCostProfilePreset,
  getTradeInstrumentPreset,
  getTradeMarketTemplatePreset,
  normalizeInstrumentType,
  deriveEffectiveExitFromPartialExitLegs,
  deriveMarginUsed,
  derivePositionSizeFromMargin,
  deriveTradeNotional,
  formatPartialExitSummary,
  formatPlainNumber,
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
import {
  accountTemplateOptions,
  brokerProfileOptions,
  costProfileOptions,
  cryptoMarketTypeOptions,
  executionTypeOptions,
  fundingDirectionOptions,
  instrumentOptions,
  marketTemplateOptions,
  pnlModes,
} from '@/lib/utils/trade-presets'

const cryptoSpotBrokerProfiles: TradeBrokerProfile[] = ['binance-spot', 'coinbase-spot', 'bybit-spot', 'mexc-spot']
const cryptoPerpsBrokerProfiles: TradeBrokerProfile[] = ['bybit-perps', 'mexc-perps', 'okx-perps']

const USER_COST_PROFILE_STORAGE_KEY = 'equora-user-cost-profiles'
const defaultAccountTemplate: TradeAccountTemplate = 'swing-europe'

const reviewRuleOptions = [{ label: 'Ja', value: 'Ja' }, { label: 'Teilweise', value: 'Teilweise' }, { label: 'Nein', value: 'Nein' }]
const reviewRepeatabilityOptions = [{ label: 'Ja', value: 'Ja' }, { label: 'Mit Anpassung', value: 'Mit Anpassung' }, { label: 'Nein', value: 'Nein' }]
const reviewStateOptions = [
  { label: 'Fokussiert', value: 'Fokussiert' },
  { label: 'Geduldig', value: 'Geduldig' },
  { label: 'Zu schnell', value: 'Impulsiv' },
  { label: 'Nicht klar', value: 'Unscharf' },
  { label: 'Müde', value: 'Müde' },
  { label: 'Unter Druck', value: 'Gejagt' },
]

const reviewLessonSuggestions = [
  'Früher stoppen',
  'Entry klarer abwarten',
  'Setup enger filtern',
  'Geduld schützen',
  'Regel vor Tempo',
] as const

function getReviewLayerProgress(values: string[]) {
  const completed = values.filter((value) => value.trim()).length
  return {
    completed,
    total: values.length,
    label: completed === values.length ? 'Review-Snapshot steht' : `${completed}/${values.length} Signale gesetzt`,
  }
}

type TradeFormMode = 'create' | 'edit'

type TradeFormInitialValues = Partial<TradeCaptureInput> & {
  captureStatus?: TradeCaptureStatus
  partialExit1Percent?: string
  partialExit1Price?: string
  partialExit2Percent?: string
  partialExit2Price?: string
  partialExit3Percent?: string
  partialExit3Price?: string
  screenshotUrls?: string[]
  mediaItems?: TradeMediaItem[]
}

type TradeFormProps = {
  markets: string[]
  setups: string[]
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
  const [snippingFile, setSnippingFile] = useState<File | null>(null)
  const [existingMediaItems] = useState<TradeMediaItem[]>(normalizeTradeMediaItems(initialValues?.mediaItems ?? []))
  const [selectedTags, setSelectedTags] = useState<string[]>(normalizeInitialTags(initialValues?.tags))
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState('')
  const [validationErrors, setValidationErrors] = useState<Partial<Record<TradeValidationField, string>>>({})
  const [marketValue, setMarketValue] = useState(initialValues?.market?.trim() || markets[0] || '')
  const [setupValue, setSetupValue] = useState(initialValues?.setup?.trim() || setups[0] || '')
  const [accountTemplate, setAccountTemplate] = useState<TradeAccountTemplate>(initialAccountTemplate)
  const [marketTemplate, setMarketTemplate] = useState<TradeMarketTemplate>(initialMarketTemplate)
  const [brokerProfile, setBrokerProfile] = useState<TradeBrokerProfile>(initialBrokerProfile)
  const [instrumentType, setInstrumentType] = useState<TradeInstrumentType>(initialInstrumentType)
  const [pnlMode, setPnlMode] = useState<TradePnLMode>(initialPnlMode)
  const [costProfile, setCostProfile] = useState<TradeCostProfile>(initialCostProfile)
  const [accountCurrency, setAccountCurrency] = useState(initialValues?.accountCurrency?.trim() || initialAccountPreset.defaultCurrency || initialBrokerPreset.defaultCurrency || initialInstrumentPreset.defaultCurrency)
  const [cryptoMarketType, setCryptoMarketType] = useState<TradeCryptoMarketType>(normalizeTradeCryptoMarketType(initialValues?.cryptoMarketType || initialAccountPreset.defaultCryptoMarketType))
  const [quoteAsset, setQuoteAsset] = useState(initialValues?.quoteAsset?.trim() || initialAccountPreset.defaultQuoteAsset || initialBrokerPreset.defaultQuoteAsset || '')
  const [leverage, setLeverage] = useState(stringifyInitialValue(initialValues?.leverage ?? initialAccountPreset.defaultLeverage))
  const [entryValue, setEntryValue] = useState(stringifyInitialValue(initialValues?.entry))
  const [stopLossValue, setStopLossValue] = useState(stringifyInitialValue(initialValues?.stopLoss))
  const [takeProfitValue, setTakeProfitValue] = useState(stringifyInitialValue(initialValues?.takeProfit))
  const [exitValue, setExitValue] = useState(stringifyInitialValue(initialValues?.exit))
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
  const [simpleMode, setSimpleMode] = useState(!isEditMode)
  const [showAdvanced, setShowAdvanced] = useState(isEditMode ? true : false)
  const [showReflection, setShowReflection] = useState(isEditMode ? true : false)
  const [tradeDirection, setTradeDirection] = useState(initialValues?.bias?.trim() || biases[0] || '')
  const [reviewRuleCheck, setReviewRuleCheck] = useState(initialValues?.ruleCheck?.trim() || '')
  const [reviewRepeatability, setReviewRepeatability] = useState(initialValues?.reviewRepeatability?.trim() || '')
  const [reviewState, setReviewState] = useState(initialValues?.reviewState?.trim() || initialValues?.emotion?.trim() || '')
  const [reviewLesson, setReviewLesson] = useState(initialValues?.reviewLesson?.trim() || '')
  const reviewLayerProgress = getReviewLayerProgress([reviewRuleCheck, reviewRepeatability, reviewState, reviewLesson])

  const pendingFiles = useMemo(() => dedupeFiles([...(snippingFile ? [snippingFile] : []), ...files]), [files, snippingFile])

  const brokerPreset = useMemo(() => getTradeBrokerProfilePreset(brokerProfile), [brokerProfile])
  const instrumentPreset = useMemo(() => getTradeInstrumentPreset(instrumentType), [instrumentType])
  const accountPreset = useMemo(() => getTradeAccountTemplatePreset(accountTemplate), [accountTemplate])
  const activeMarketPreset = useMemo(() => getTradeMarketTemplatePreset(marketTemplate), [marketTemplate])
  const activeCostProfile = useMemo(() => getTradeCostProfilePreset(costProfile), [costProfile])
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
      const manual = Number(positionSizeValue.replace(',', '.'))
      return Number.isFinite(manual) && manual > 0 ? manual : null
    }
    return derivePositionSizeFromMargin({ instrumentType, entry: entryValue, marginUsed: marginUsedValue, leverage, pointValue })
  }, [entryValue, instrumentType, leverage, marginUsedValue, pointValue, positionSizeValue])
  const derivedExposure = useMemo(
    () => deriveTradeNotional({ instrumentType, entry: entryValue, positionSize: derivedPositionSize, pointValue }),
    [derivedPositionSize, entryValue, instrumentType, pointValue],
  )
  const derivedMargin = useMemo(
    () => deriveMarginUsed({ instrumentType, entry: entryValue, positionSize: derivedPositionSize, leverage, pointValue }),
    [derivedPositionSize, entryValue, instrumentType, leverage, pointValue],
  )
  const derivedStopRisk = useMemo(() => {
    const entry = Number(entryValue.replace(',', '.'))
    const stop = Number(stopLossValue.replace(',', '.'))
    if (!Number.isFinite(entry) || !Number.isFinite(stop) || !derivedPositionSize || derivedPositionSize <= 0) return null
    const direction = tradeDirection.toLowerCase().includes('short') ? 'short' : tradeDirection.toLowerCase().includes('long') ? 'long' : 'neutral'
    if (direction === 'neutral') return null
    const priceRisk = direction === 'short' ? stop - entry : entry - stop
    if (!(priceRisk > 0)) return null
    const point = (instrumentType === 'futures' || instrumentType === 'forex' || instrumentType === 'cfd')
      ? Number(pointValue.replace(',', '.')) || 1
      : 1
    const amount = Math.abs(priceRisk * derivedPositionSize * point)
    return Number.isFinite(amount) ? amount : null
  }, [derivedPositionSize, entryValue, instrumentType, pointValue, stopLossValue, tradeDirection])
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
    const sizePlan = getPartialExitSizePlan({ positionSize: derivedPositionSize, partialExits })
    return {
      effectiveExit,
      summary,
      coveredPercent: plan.coveredPercent,
      remainderPercent: plan.remainderPercent,
      hasOpenRemainder: sizePlan.hasOpenRemainder,
      realizedSize: sizePlan.realizedSize,
      remainingSize: sizePlan.remainingSize,
    }
  }, [derivedPositionSize, exitValue, partialExit1Percent, partialExit1Price, partialExit2Percent, partialExit2Price, partialExit3Percent, partialExit3Price])

  const accountRiskPreview = useMemo(() => {
    const account = Number(accountSizeValue.replace(',', '.'))
    if (!Number.isFinite(account) || account <= 0 || derivedStopRisk === null) return null
    const percent = (derivedStopRisk / account) * 100
    return Number.isFinite(percent) ? percent : null
  }, [accountSizeValue, derivedStopRisk])
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
      leverage: leverage.trim() ? Number(leverage.replace(',', '.')) : null,
      pointValue: pointValue.trim() ? Number(pointValue.replace(',', '.')) : null,
      fees: fees.trim() ? Number(fees.replace(',', '.')) : null,
      exchangeFees: exchangeFees.trim() ? Number(exchangeFees.replace(',', '.')) : null,
      fundingFees: fundingFees.trim() ? Number(fundingFees.replace(',', '.')) : null,
      fundingRateBps: fundingRateBps.trim() ? Number(fundingRateBps.replace(',', '.')) : null,
      fundingIntervals: fundingIntervals.trim() ? Number(fundingIntervals.replace(',', '.')) : null,
      spreadCost: spreadCost.trim() ? Number(spreadCost.replace(',', '.')) : null,
      slippage: slippage.trim() ? Number(slippage.replace(',', '.')) : null,
    }
    const result = await saveUserCostProfile(payload)
    setStatus(result.message)
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
    const result = await deleteUserCostProfile(selectedUserCostProfileId)
    setStatus(result.message)
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
  }) {
    if (payload.market) handleMarketChange(payload.market)
    if (payload.bias) setTradeDirection(payload.bias)
    if (payload.entry) setEntryValue(payload.entry)
    if (payload.exit) setExitValue(payload.exit)
    if (payload.stopLoss) setStopLossValue(payload.stopLoss)
    if (payload.takeProfit) setTakeProfitValue(payload.takeProfit)
    if (payload.positionSize) setPositionSizeValue(payload.positionSize)
    if (payload.netPnL) {
      setPnlMode('manual')
      setNetPnL(payload.netPnL)
    }
    setStatus('Snipping-Werte übernommen. Bitte kurz gegenlesen und dann speichern.')
  }

  function resetEngineState() {
    setValidationErrors({})
    const account = getTradeAccountTemplatePreset(defaultAccountTemplate)
    const broker = getTradeBrokerProfilePreset(account.defaultBrokerProfile)
    const preset = getTradeInstrumentPreset(account.defaultInstrumentType)
    const profilePreset = getTradeCostProfilePreset(account.defaultCostProfile)
    setMarketValue(markets[0] ?? '')
    setSetupValue(setups[0] ?? '')
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

  function buildTradePayload(formData: FormData) {
    return {
      market: String(formData.get('market') ?? ''),
      setup: String(formData.get('setup') ?? ''),
      emotion: String(formData.get('emotion') ?? ''),
      bias: String(formData.get('bias') ?? ''),
      ruleCheck: String(formData.get('rule_check') ?? ''),
      reviewRepeatability: String(formData.get('review_repeatability') ?? ''),
      reviewState: String(formData.get('review_state') ?? ''),
      reviewLesson: String(formData.get('review_lesson') ?? ''),
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
      notes: String(formData.get('notes') ?? ''),
      screenshotUrl: '',
      tags: selectedTags,
    }
  }

  function handleSubmit(formData: FormData) {
    const basePayload = buildTradePayload(formData)
    const partialSummary = partialExitPreview.summary
    const noteParts = [basePayload.notes.trim(), partialSummary ? `Teilverkäufe: ${partialSummary}` : ''].filter(Boolean)
    const payload = {
      ...basePayload,
      exit: partialExitPreview.effectiveExit !== null ? String(partialExitPreview.effectiveExit) : basePayload.exit,
      notes: noteParts.join('\n\n'),
    }
    const validation = validateTradeCaptureInput(payload)

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
        ? await updateTradeEntry(tradeId, { ...payload, screenshotUrl, tags: validation.normalizedTags })
        : await createTradeEntry({ ...payload, screenshotUrl, tags: validation.normalizedTags })

      if (!result.success) {
        setStatus(result.message)
        if ('fieldErrors' in result && result.fieldErrors) {
          setValidationErrors(result.fieldErrors)
        }
        return
      }

      if (pendingFiles.length && result.tradeId && result.mode === 'supabase') {
        try {
          setStatus('Screenshots werden in den Storage-Bucket geladen...')
          const uploaded = await uploadTradeScreenshots(result.tradeId, pendingFiles, currentMediaItems.length)
          const syncResult = await syncTradeMedia(result.tradeId, normalizeTradeMediaItems([...currentMediaItems, ...uploaded]))
          if (!syncResult.success) {
            setStatus(`${result.message} Screenshot-Sync hakt noch: ${syncResult.message}`)
            return
          }
          setStatus(`${result.message} ${pendingFiles.length} Screenshot(s) angehängt.`)
        } catch (error) {
          setStatus(`${result.message} Screenshot-Upload hakt noch: ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}`)
          return
        }
      } else {
        if (pendingFiles.length && result.mode !== 'supabase') {
          setStatus(`${result.message} Screenshot-Upload bleibt im Demo-Modus lokal offen.`)
        } else {
          setStatus(result.message)
        }
      }

      if (isEditMode && tradeId) {
        router.push(`/trades?tradeId=${encodeURIComponent(tradeId)}`)
        router.refresh()
        return
      }

      ;(document.getElementById('trade-form') as HTMLFormElement | null)?.reset()
      setSelectedTags([])
      setFiles([])
      setSnippingFile(null)
      resetEngineState()
    })
  }

  const pnlFieldLabel = pnlMode === 'override' ? 'Net P&L manuell' : 'Net P&L'
  const pnlFieldPlaceholder =
    pnlMode === 'auto'
      ? 'wird automatisch berechnet'
      : pnlMode === 'override'
        ? 'optional manuell überschreiben'
        : 'Net P&L eingeben oder leer lassen, wenn Entry/Exit oder Teilverkäufe stehen'
  const engineSummary =
    pnlMode === 'auto'
      ? 'Net P&L wird aus Entry, Exit oder Teilverkäufen, Size sowie Margin/Hebel, Punktwert und Kosten hergeleitet.'
      : pnlMode === 'override'
        ? 'Automatik läuft weiter, aber ein eingetragener Net-P&L-Wert überschreibt das Ergebnis bewusst.'
        : 'Net P&L kann manuell geführt werden. Bleibt das Feld leer und Entry, Exit oder Teilverkäufe sowie Size oder Margin/Hebel sind belastbar, springt der Trade-Check automatisch auf Berechnung um.'
  const formEyebrow = isEditMode ? 'Trade-Vervollständigung' : 'Trade-Erfassung'
  const formTitle = isEditMode ? 'Trade vervollständigen' : 'Neuen Trade eintragen'
  const formCopy = isEditMode
    ? 'Hier werden Schnellerfassungen mit Entry, Exit, Größe, Kosten und sauberen Tags in belastbare Trades verwandelt.'
    : 'Vollständiger Trade-Flow mit zentralem Eingabe-Check, klareren Fehlersignalen und weniger stillen Datenfehlern vor dem Speichern.'
  const submitLabel = isEditMode ? 'Trade aktualisieren' : 'Trade speichern'

  return (
    <form
      id="trade-form"
      action={handleSubmit}
      className="space-y-6 rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/45">{formEyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold text-orange-300">{formTitle}</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/60">
            {formCopy}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEditMode && cancelHref ? (
            <Link
              href={cancelHref}
              className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/70 transition hover:border-white/20 hover:text-white"
            >
              Zurück
            </Link>
          ) : null}
          <div className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-xs text-orange-100/80">
            {isEditMode
              ? `${initialValues?.captureStatus === 'incomplete' ? 'Schnellerfassung' : 'Trade'} · Edit Flow`
              : `${selectedTags.length} Tags · ${pendingFiles.length} neue Uploads · ${existingMediaItems.length} vorhandene Screenshots`}
          </div>
        </div>
      </div>

      {Object.keys(validationErrors).length ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
          <p className="text-xs uppercase tracking-[0.2em] text-red-100/70">Trade-Check</p>
          <p className="mt-2 text-sm font-medium">{status || 'Bitte die markierten Eingaben prüfen.'}</p>
          <ul className="mt-3 space-y-1 text-sm text-red-100/85">
            {Object.entries(validationErrors).map(([field, message]) => (
              <li key={field}>• {message}</li>
            ))}
          </ul>
        </div>
      ) : status ? (
        <div className={`rounded-2xl border p-4 text-sm ${status.toLowerCase().includes('gespeichert') || status.toLowerCase().includes('aktualisiert') || status.toLowerCase().includes('demo-flow aktiv') ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-black/25 text-white/75'}`}>
          {status}
        </div>
      ) : null}

      <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-white/40">Erfassungsmodus</p>
            <h3 className="mt-2 text-lg font-semibold text-white">Weniger Felder im ersten Blick</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Einfacher Modus zeigt nur die wichtigsten Felder. Margin, Hebel und optionales Risiko kommen nach vorn, während Kosten, Broker-Feinschliff und P&amp;L-Engine im ausklappbaren Block bleiben.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !simpleMode
              setSimpleMode(next)
              setShowAdvanced(!next)
              setShowReflection(!next)
            }}
            className={`rounded-full border px-4 py-2 text-sm transition ${simpleMode ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white'}` }
          >
            {simpleMode ? 'Einfacher Modus aktiv' : 'Einfacher Modus aus'}
          </button>
        </div>
      </div>

      {(pendingFiles.length || existingMediaItems.length || initialValues?.screenshotUrl) ? (
        <div className="rounded-2xl border border-emerald-400/15 bg-black/25 px-4 py-3 text-sm text-emerald-100/80">
          {pendingFiles.length
            ? `${pendingFiles.length} neue Screenshot(s) werden hochgeladen.${existingMediaItems.length ? ` Bereits vorhanden: ${existingMediaItems.length}.` : ''}`
            : existingMediaItems.length
              ? `${existingMediaItems.length} vorhandene Screenshot(s) bleiben am Trade hängen, solange du keine neuen anhängst.`
              : 'Vorhandener Screenshot bleibt am Trade hängen, solange du keinen neuen auswählst.'}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.05fr]">
        <div className="space-y-4">
          <SnippingAssistCard marketOptions={marketOptions} onApply={applySnippingValues} onFileChange={setSnippingFile} />
          <div className="grid gap-4 md:grid-cols-2">
            <ControlledDatalistInput
              name="market"
              label="Markt"
              listId="trade-market-options"
              options={marketOptions}
              value={marketValue}
              onChange={(event) => handleMarketChange(event.target.value)}
              placeholder="z. B. NASDAQ, BTC/USD, EUR/USD"
            />
            <ControlledDatalistInput
              name="setup"
              label="Setup"
              listId="trade-setup-options"
              options={setups}
              value={setupValue}
              onChange={(event) => setSetupValue(event.target.value)}
              placeholder="z. B. Liquidity Sweep, Pullback, Reclaim"
            />
          </div>

          {isEditMode ? (
            <>
              <input type="hidden" name="emotion" value={reviewState} />
              <input type="hidden" name="bias" value={tradeDirection} />
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
                      <p className="text-xs uppercase tracking-[0.2em] text-white/40">Review-Layer am Trade</p>
                      <h3 className="mt-2 text-sm font-semibold text-white">Drei klare Urteile und ein kurzer Lerneffekt</h3>
                      <p className="mt-2 text-xs text-white/45">{showReflection ? 'Drei kurze Entscheidungen und ein Satz reichen hier völlig.' : 'eingeklappt für einen ruhigeren Bearbeitungsfluss'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/60">
                        {showReflection ? 'Verbergen' : 'Öffnen'}
                      </span>
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-100">
                        {reviewLayerProgress.label}
                      </span>
                    </div>
                  </div>
                </summary>
                <div className="mt-4 space-y-4">
                  <div className="rounded-[26px] border border-[#c8823a]/16 bg-[#c8823a]/6 p-4">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] xl:items-start">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.22em] text-white/40">Review-Snapshot</p>
                        <p className="mt-2 text-sm leading-6 text-white/65">Der Trade steht schon. Jetzt nur noch kurz einordnen.</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] text-white/55 xl:justify-end">
                        <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1">Richtung bleibt Datenteil</span>
                        <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1">Nur beim späteren Review</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,0.66fr)_minmax(0,1.34fr)] xl:items-start">
                    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/45">Richtung</p>
                      <p className="mt-2 text-base font-medium text-white">{tradeDirection || 'Noch offen'}</p>
                      <p className="mt-2 text-xs leading-5 text-white/45">Bleibt Teil der Trade-Daten und muss hier nicht noch einmal entschieden werden.</p>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                      <ReviewChipGroup label="Regelkonformität" hint="Nicht perfektionieren. Kurz ehrlich markieren." value={reviewRuleCheck} onChange={setReviewRuleCheck} tone="red" options={reviewRuleOptions} />
                      <ReviewChipGroup label="Replizierbar" hint="Würdest du diese Form wieder handeln?" value={reviewRepeatability} onChange={setReviewRepeatability} options={reviewRepeatabilityOptions} />
                    </div>
                  </div>
                  <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] 2xl:items-start">
                    <ReviewChipGroup label="Zustand" hint="Ein Tap reicht. Nur der dominante Zustand zählt." value={reviewState} onChange={setReviewState} options={reviewStateOptions} />
                    <label className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <span className="text-xs uppercase tracking-[0.2em] text-white/45">Lerneffekt</span>
                          <p className="mt-2 text-xs text-white/45">Ein kurzer Satz. Was soll der nächste Trade klarer sehen?</p>
                        </div>
                        {reviewLesson.trim() ? <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-white/60">gesetzt</span> : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {reviewLessonSuggestions.map((suggestion) => {
                          const active = reviewLesson.trim() === suggestion
                          return (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => setReviewLesson(active ? '' : suggestion)}
                              className={`rounded-full border px-3 py-1.5 text-[11px] transition ${active ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-black/25 text-white/60 hover:border-white/20 hover:text-white'}`}
                            >
                              {suggestion}
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
                        placeholder="Ein Satz reicht"
                      />
                    </label>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <>
              <input type="hidden" name="emotion" value={initialValues?.emotion ?? emotions[0] ?? ''} />
              <input type="hidden" name="bias" value={initialValues?.bias ?? biases[0] ?? ''} />
              <input type="hidden" name="rule_check" value={initialValues?.ruleCheck ?? ''} />
              <input type="hidden" name="review_repeatability" value={initialValues?.reviewRepeatability ?? ''} />
              <input type="hidden" name="review_state" value={initialValues?.reviewState ?? initialValues?.emotion ?? ''} />
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
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">Positions-Engine</p>
                  <h3 className="mt-2 text-sm font-semibold text-white">
                    Account-Template, Markt-Template und P&amp;L-Pfad
                  </h3>
                  <p className="mt-2 text-xs text-white/45">{showAdvanced ? 'Feinschliff sichtbar' : 'eingeklappt für den schnellen Flow'}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/60">
                  {showAdvanced ? 'Verbergen' : 'Öffnen'}
                </span>
              </div>
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ControlledSelect
                name="account_template"
                label="Account-Template"
                options={accountTemplateOptions.map((option) => option.label)}
                values={accountTemplateOptions.map((option) => option.value)}
                value={accountTemplate}
                onChange={(event) => handleAccountTemplateChange(event.target.value as TradeAccountTemplate)}
              />
              <ControlledSelect
                name="market_template"
                label="Markt-Template"
                options={marketTemplateOptions.map((option) => option.label)}
                values={marketTemplateOptions.map((option) => option.value)}
                value={marketTemplate}
                onChange={(event) => handleMarketTemplateChange(event.target.value as TradeMarketTemplate)}
              />
              <ControlledSelect
                name="broker_profile"
                label="Brokerprofil"
                options={brokerProfileOptions.map((option) => option.label)}
                values={brokerProfileOptions.map((option) => option.value)}
                value={brokerProfile}
                onChange={(event) => handleBrokerProfileChange(event.target.value as TradeBrokerProfile)}
              />
              <ControlledSelect
                name="instrument_type"
                label="Instrumenttyp"
                options={instrumentOptions.map((option) => option.label)}
                values={instrumentOptions.map((option) => option.value)}
                value={instrumentType}
                onChange={(event) => handleInstrumentChange(event.target.value as TradeInstrumentType)}
              />
              <label className="rounded-2xl border border-white/10 bg-black/40 p-4 sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/45">Eigenes Kostenprofil</span>
                <div className="mt-3 grid gap-3 md:grid-cols-[1.3fr_0.7fr_auto_auto]">
                  <select
                    value={selectedUserCostProfileId}
                    onChange={(event: any) => {
                      const nextId = event.target.value
                      setSelectedUserCostProfileId(nextId)
                      if (!nextId) return
                      const matched = userCostProfiles.find((profile) => profile.id === nextId)
                      if (matched) applyUserCostProfile(matched)
                    }}
                    className="rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none"
                  >
                    <option value="">Kein Nutzerprofil</option>
                    {userCostProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.title}
                      </option>
                    ))}
                  </select>
                  <input
                    value={newProfileTitle}
                    onChange={(event: any) => setNewProfileTitle(event.target.value)}
                    placeholder="aktuelles Setup speichern als…"
                    className="rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
                  />
                  <button
                    type="button"
                    onClick={() => startTransition(() => { void handleSaveUserCostProfile() })}
                    className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 transition hover:border-emerald-300/40"
                  >
                    Profil sichern
                  </button>
                  <button
                    type="button"
                    disabled={!selectedUserCostProfileId}
                    onClick={() => startTransition(() => { void handleDeleteSelectedUserCostProfile() })}
                    className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200 transition hover:border-red-300/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Entfernen
                  </button>
                </div>
                <input type="hidden" name="user_cost_profile_id" value={selectedUserCostProfileId} />
                <p className="mt-2 text-[11px] text-white/40">
                  Speichert deinen Kostenapparat pro User. Praktisch für wiederkehrende Krypto-Setups wie Binance Spot vs. Bybit/OKX Perps.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/cost-profiles"
                    className="inline-flex items-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white/65 transition hover:border-white/20 hover:text-white"
                  >
                    Profile verwalten
                  </Link>
                </div>
              </label>
              <ControlledSelect
                name="pnl_mode"
                label="P&L Modus"
                options={pnlModes.map((option) => option.label)}
                values={pnlModes.map((option) => option.value)}
                value={pnlMode}
                onChange={(event) => setPnlMode(event.target.value as TradePnLMode)}
              />
              <ControlledSelect
                name="cost_profile"
                label="Kostenprofil"
                options={costProfileOptions.map((option) => option.label)}
                values={costProfileOptions.map((option) => option.value)}
                value={costProfile}
                onChange={(event) => handleCostProfileChange(event.target.value as TradeCostProfile)}
              />
              <ControlledInput
                name="account_currency"
                label="Kontowährung"
                placeholder="z. B. EUR"
                value={accountCurrency}
                onChange={(event) => setAccountCurrency(event.target.value.toUpperCase())}
              />
              <ControlledInput
                name="point_value"
                label="Punktwert / Pip-Wert"
                placeholder={
                  brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue
                    ? `z. B. ${brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue}`
                    : 'optional'
                }
                value={pointValue}
                onChange={(event) => setPointValue(event.target.value)}
              />
              <ControlledInput
                name="position_size"
                label={`Positionsgröße (${instrumentPreset.sizeHint})`}
                placeholder="leer lassen, wenn Margin + Hebel reichen"
                value={positionSizeValue}
                onChange={(event) => setPositionSizeValue(event.target.value)}
              />
              {instrumentType === 'crypto' ? (
                <>
                  <ControlledSelect
                    name="crypto_market_type"
                    label="Krypto-Modus"
                    options={cryptoMarketTypeOptions.map((option) => option.label)}
                    values={cryptoMarketTypeOptions.map((option) => option.value)}
                    value={cryptoMarketType}
                    onChange={(event) => handleCryptoMarketTypeChange(event.target.value as TradeCryptoMarketType)}
                  />
                  <ControlledSelect
                    name="execution_type"
                    label="Ausführung"
                    options={executionTypeOptions.map((option) => option.label)}
                    values={executionTypeOptions.map((option) => option.value)}
                    value={executionType}
                    onChange={(event) => { setExecutionType(normalizeTradeExecutionType(event.target.value)); setSelectedUserCostProfileId('') }}
                  />
                  <ControlledSelect
                    name="funding_direction"
                    label="Funding-Richtung"
                    options={fundingDirectionOptions.map((option) => option.label)}
                    values={fundingDirectionOptions.map((option) => option.value)}
                    value={fundingDirection}
                    onChange={(event) => { setFundingDirection(normalizeTradeFundingDirection(event.target.value)); setSelectedUserCostProfileId('') }}
                  />
                  <ControlledInput
                    name="funding_rate_bps"
                    label="Funding-Rate (bps)"
                    placeholder="z. B. 1,50"
                    value={fundingRateBps}
                    onChange={(event) => { setFundingRateBps(event.target.value); setSelectedUserCostProfileId('') }}
                  />
                  <ControlledInput
                    name="funding_intervals"
                    label="Funding-Intervalle"
                    placeholder="z. B. 2"
                    value={fundingIntervals}
                    onChange={(event) => { setFundingIntervals(event.target.value); setSelectedUserCostProfileId('') }}
                  />
                  <ControlledInput
                    name="quote_asset"
                    label="Quote Asset"
                    placeholder="z. B. USDT"
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
                label="Kommission"
                placeholder="z. B. 1,00"
                value={fees}
                onChange={(event) => setFees(event.target.value)}
              />
              <ControlledInput
                name="exchange_fees"
                label="Börsengebühren"
                placeholder="z. B. 0,35"
                value={exchangeFees}
                onChange={(event) => setExchangeFees(event.target.value)}
              />
              <ControlledInput
                name="funding_fees"
                label="Funding absolut"
                placeholder="z. B. 1,20"
                value={fundingFees}
                onChange={(event) => setFundingFees(event.target.value)}
              />
              <ControlledInput
                name="spread_cost"
                label="Spread-Kosten"
                placeholder="z. B. 0,60"
                value={spreadCost}
                onChange={(event) => setSpreadCost(event.target.value)}
              />
              <ControlledInput
                name="slippage"
                label="Slippage"
                placeholder="z. B. 1,50"
                value={slippage}
                onChange={(event) => setSlippage(event.target.value)}
              />
              <FieldInput
                name="r_multiple"
                label="R-Multiple"
                placeholder="R-Multiple eingeben"
                defaultValue={initialValues?.rMultiple}
              />
            </div>
            <div className="mt-4 rounded-2xl border border-orange-400/15 bg-orange-400/5 p-4 text-xs leading-6 text-white/60">
              <p>
                <span className="text-orange-200">Account-Template:</span> {accountPreset.description}
              </p>
              <p className="mt-1">
                <span className="text-orange-200">Markt-Template:</span> {activeMarketPreset.description}
              </p>
              <p className="mt-1">
                <span className="text-orange-200">Brokerprofil:</span> {brokerPreset.description}
              </p>
              <p className="mt-1">
                <span className="text-orange-200">Instrument:</span> {instrumentPreset.helper}
              </p>
              <p className="mt-1">
                <span className="text-orange-200">Kostenprofil:</span> {activeCostProfile.description}
              </p>
              <p className="mt-1">
                <span className="text-orange-200">Kostenblock:</span> Kommission {fees || '0'} · Börse {exchangeFees || '0'} · Funding {fundingFees || '0'} · Spread {spreadCost || '0'} · Slippage {slippage || '0'} · Total {costSummary.totalCosts.toFixed(2)}
              </p>
              {instrumentType === 'crypto' ? (
                <p className="mt-1">
                  <span className="text-orange-200">Krypto-Kontext:</span> {cryptoMarketType === 'spot' ? 'Spot ohne Funding-Logik' : cryptoMarketType === 'perps' ? 'Perps mit Funding-/Hebel-Kontext' : cryptoMarketType === 'margin' ? 'Margin-Setup mit manuellem Augenmaß' : 'frei'} · {executionType === 'maker' ? 'Maker' : executionType === 'taker' ? 'Taker' : executionType === 'mixed' ? 'Gemischt' : 'manuell'} · Funding {fundingDirection === 'paid' ? 'bezahlt' : fundingDirection === 'received' ? 'erhalten' : fundingDirection === 'flat' ? 'flat' : 'manuell'} · {fundingRateBps || '—'} bps · {fundingIntervals || '—'} Intervalle · Quote {quoteAsset || '—'} · Hebel {leverage || '—'}x
                </p>
              ) : null}
              <p className="mt-1">
                <span className="text-orange-200">Engine:</span> {engineSummary}
              </p>
              <p className="mt-1">
                <span className="text-orange-200">Risk-First:</span> Margin {marginUsedValue || '—'} · Hebel {leverage || '—'}x · Konto {accountSizeValue || 'optional'} · Risiko {riskPercentValue || '—'}%
              </p>
              <p className="mt-1 text-[11px] text-white/45">
                Fokus: {accountPreset.focus}{selectedUserCostProfileId ? ' · Nutzerprofil aktiv' : ''}
                {activeMarketPreset.market ? ` · Template-Markt ${activeMarketPreset.market}` : ''}
              </p>
            </div>
          </details>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ControlledInput
              name="entry"
              label="Entry"
              placeholder="Entry eingeben"
              value={entryValue}
              onChange={(event) => setEntryValue(event.target.value)}
            />
            <ControlledInput
              name="stop_loss"
              label="Stop Loss"
              placeholder="Stop Loss eingeben"
              value={stopLossValue}
              onChange={(event) => setStopLossValue(event.target.value)}
            />
            <ControlledInput
              name="take_profit"
              label="Take Profit"
              placeholder="Take Profit eingeben"
              value={takeProfitValue}
              onChange={(event) => setTakeProfitValue(event.target.value)}
            />
            <ControlledInput
              name="exit"
              label="Finaler Exit / Rest"
              placeholder="optional für den Restbestand"
              value={exitValue}
              onChange={(event) => setExitValue(event.target.value)}
            />

            <div className="sm:col-span-2 xl:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/45">Teilverkäufe / Teilprofite</p>
                  <p className="mt-2 text-sm leading-6 text-white/55">Optional. Wenn du skaliert aussteigst, liest Equora jetzt nicht nur den Ø Exit, sondern auch den bereits realisierten und noch offenen Restbestand.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {partialExitPreview.effectiveExit !== null ? <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200">Ø Exit {formatPlainNumber(partialExitPreview.effectiveExit, 4)}</div> : null}
                  {partialExitPreview.coveredPercent > 0 ? <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">{formatPlainNumber(partialExitPreview.coveredPercent, 0)}% realisiert</div> : null}
                  {partialExitPreview.hasOpenRemainder ? <div className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100/90">{formatPlainNumber(partialExitPreview.remainderPercent, 0)}% Rest läuft</div> : null}
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <PartialExitRow label="TP 1" percent={partialExit1Percent} onPercentChange={setPartialExit1Percent} price={partialExit1Price} onPriceChange={setPartialExit1Price} />
                <PartialExitRow label="TP 2" percent={partialExit2Percent} onPercentChange={setPartialExit2Percent} price={partialExit2Price} onPriceChange={setPartialExit2Price} />
                <PartialExitRow label="TP 3" percent={partialExit3Percent} onPercentChange={setPartialExit3Percent} price={partialExit3Price} onPriceChange={setPartialExit3Price} />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/65">
                  <p className="uppercase tracking-[0.18em] text-white/35">Bereits realisiert</p>
                  <p className="mt-2 text-sm text-white">{partialExitPreview.realizedSize !== null ? `${formatPlainNumber(partialExitPreview.realizedSize, 4)} ${instrumentPreset.sizeHint}` : partialExitPreview.coveredPercent > 0 ? `${formatPlainNumber(partialExitPreview.coveredPercent, 0)}% ohne Size-Basis` : 'Noch keine Staffel aktiv'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/65">
                  <p className="uppercase tracking-[0.18em] text-white/35">Restposition</p>
                  <p className="mt-2 text-sm text-white">{partialExitPreview.hasOpenRemainder ? (partialExitPreview.remainingSize !== null ? `${formatPlainNumber(partialExitPreview.remainingSize, 4)} ${instrumentPreset.sizeHint} offen` : `${formatPlainNumber(partialExitPreview.remainderPercent, 0)}% Rest noch offen`) : 'Kein Rest mehr offen'}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-6 text-white/45">{partialExitPreview.summary ? `Aktueller Plan: ${partialExitPreview.summary}` : 'Beispiel: 25% bei 1:1, 50% bei 1:3, Rest laufen lassen.'}</p>
            </div>

            <ControlledInput
              name="margin_used"
              label="Margin (optional)"
              placeholder="z. B. 500"
              value={marginUsedValue}
              onChange={(event) => setMarginUsedValue(event.target.value)}
            />
            <ControlledInput
              name="leverage"
              label="Hebel"
              placeholder="z. B. 5"
              value={leverage}
              onChange={(event) => setLeverage(event.target.value)}
            />
            <ControlledInput
              name="account_size"
              label="Kontogröße (optional)"
              placeholder="z. B. 25000"
              value={accountSizeValue}
              onChange={(event) => setAccountSizeValue(event.target.value)}
            />
            <ControlledInput
              name="risk_percent"
              label="Geplantes Risiko %"
              placeholder="z. B. 1"
              value={riskPercentValue}
              onChange={(event) => setRiskPercentValue(event.target.value)}
            />
            <ControlledInput
              name="net_pnl"
              label={pnlFieldLabel}
              placeholder={pnlFieldPlaceholder}
              value={netPnL}
              onChange={(event) => setNetPnL(event.target.value)}
              readOnly={pnlMode === 'auto'}
              className={pnlMode === 'auto' ? 'opacity-60' : ''}
            />
          </div>
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 px-4 py-4 text-sm text-white/70">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-100/75">Risk-First Kurzblick</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <InfoMini label="Abgeleitete Größe" value={derivedPositionSize !== null ? `${formatPlainNumber(derivedPositionSize, 4)} ${instrumentPreset.sizeHint}` : 'Noch offen'} />
              <InfoMini label="Exposure" value={derivedExposure !== null ? `${formatPlainNumber(derivedExposure, 2)} ${accountCurrency || ''}`.trim() : 'Noch offen'} />
              <InfoMini label="Margin" value={derivedMargin !== null ? `${formatPlainNumber(derivedMargin, 2)} ${accountCurrency || ''}`.trim() : 'Noch offen'} />
              <InfoMini label="Stop-Risiko" value={derivedStopRisk !== null ? `${formatPlainNumber(derivedStopRisk, 2)} ${accountCurrency || ''}`.trim() : 'Mit Entry, Stop und Größe sichtbar'} />
              <InfoMini label="Ø Exit" value={partialExitPreview.effectiveExit !== null ? formatPlainNumber(partialExitPreview.effectiveExit, 4) : 'Kein Teilprofit aktiv'} />
              <InfoMini label="Realisiert" value={partialExitPreview.realizedSize !== null ? `${formatPlainNumber(partialExitPreview.realizedSize, 4)} ${instrumentPreset.sizeHint}` : partialExitPreview.coveredPercent > 0 ? `${formatPlainNumber(partialExitPreview.coveredPercent, 0)}% ohne Size-Basis` : 'Noch offen'} />
              <InfoMini label="Rest offen" value={partialExitPreview.hasOpenRemainder ? (partialExitPreview.remainingSize !== null ? `${formatPlainNumber(partialExitPreview.remainingSize, 4)} ${instrumentPreset.sizeHint}` : `${formatPlainNumber(partialExitPreview.remainderPercent, 0)}%`) : 'Kein Rest'} />
            </div>
            <p className="mt-3 text-xs leading-6 text-white/55">
              {accountRiskPreview !== null
                ? `Aktuell läge das Stop-Risiko bei ${formatPlainNumber(accountRiskPreview, 2)}% vom Konto.`
                : 'Kontogröße bleibt optional. Mit Konto + Risiko % sieht Equora später auch den 1%-Rahmen sauber.'}
            </p>
          </div>
          <ChartUploadAdvanced onFilesChange={setFiles} />
          <TradeTagSelector selectedTags={selectedTags} onChange={setSelectedTags} options={tagOptions} />
          <div className="rounded-2xl border border-orange-400/15 bg-black/40 p-4">
            <div className="mb-3">
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">Trade-Notiz</p>
              <p className="mt-2 text-sm leading-6 text-white/55">Optionaler Kontextblock. Ein kurzer Satz reicht, wenn Trigger, Fehler oder Erkenntnis wichtig waren.</p>
            </div>
            <textarea
              name="notes"
              rows={5}
              defaultValue={initialValues?.notes ?? ''}
              className="block min-h-[152px] w-full resize-y rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
              placeholder="Was war der Kontext, Trigger, Fehler oder die wichtigste Erkenntnis?"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-2xl border border-orange-400/30 bg-orange-400 px-4 py-3 text-sm font-medium text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? 'Speichert...' : submitLabel}
          </button>
          {status ? <p className="text-sm text-white/60">{status}</p> : null}
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
    </form>
  )
}


type ReviewChipOption = { label: string; value: string }

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
          {value ? <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-white/60">{value}</span> : null}
          {value ? (
            <button
              type="button"
              onClick={() => onChange('')}
              className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-white/50 transition hover:border-white/20 hover:text-white"
            >
              Zurücksetzen
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
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FieldInput({ name, label, placeholder, defaultValue }: { key?: string; name: string; label: string; placeholder: string; defaultValue?: string | number | null }) {
  return (
    <label className="rounded-2xl border border-orange-400/15 bg-black/40 p-4">
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
}: {
  name: string
  label: string
  listId: string
  options: string[]
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  placeholder: string
}) {
  return (
    <label className="rounded-2xl border border-orange-400/15 bg-black/40 p-4">
      <span className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</span>
      <input
        name={name}
        list={listId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="mt-3 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
      />
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
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">Anteil %</span>
          <input value={percent} onChange={(event) => onPercentChange(event.target.value)} placeholder="25" className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
        </label>
        <label>
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">Exit</span>
          <input value={price} onChange={(event) => onPriceChange(event.target.value)} placeholder="16.00" className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
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
}: {
  name: string
  label: string
  placeholder: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  readOnly?: boolean
  className?: string
}) {
  return (
    <label className="rounded-2xl border border-orange-400/15 bg-black/40 p-4">
      <span className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</span>
      <input
        name={name}
        type="text"
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        className={`mt-3 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 ${className}`.trim()}
        placeholder={placeholder}
      />
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
    <label className={`rounded-2xl border ${classes} p-4 ${className}`.trim()}>
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
    <label className="rounded-2xl border border-orange-400/15 bg-black/40 p-4">
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


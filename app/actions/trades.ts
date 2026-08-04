'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import {
  getTradeBrokerProfilePreset,
  getTradeCostProfilePreset,
  getTradeInstrumentPreset,
  normalizeInstrumentType,
  normalizeTradeBrokerProfile,
  normalizeTradeCryptoMarketType,
  normalizeTradeCostProfile,
  normalizeTradeExecutionType,
  normalizeTradeFundingDirection,
  normalizeTradePnLMode,
  parseTradingNumber,
  derivePositionSizeFromMargin,
  deriveEffectiveExitFromPartialExitLegs,
  normalizePartialExitLegs,
  computeTradeMetrics,
} from '@/lib/utils/calculations'
import {
  type QuickTradeCaptureInput,
  type TradeCaptureInput as CreateTradeInput,
  validateQuickTradeCaptureInput,
  validateTradeCaptureInput,
} from '@/lib/utils/trade-validation'
import { inferTradeCaptureResultFromPnL } from '@/lib/utils/trade-capture'
import { deriveTradeSessionLabel, resolveTradeTimeInputToIso } from '@/lib/utils/trade-time'
import { appendTradeImportMeta, extractTradeImportMeta } from '@/lib/utils/trade-import-meta'
import type { TradeMediaUploadInput } from '@/lib/types/media'
import { assertOwnedTradeMediaPath } from '@/lib/utils/media-security'
import { processMediaCleanupForPaths } from '@/lib/server/media-cleanup'
import { normalizeTradeCurrency } from '@/lib/utils/currency'

function toNumericField(value: string) {
  return value.trim() ? parseTradingNumber(value) : null
}

function resolveTradePositionSize(input: CreateTradeInput, instrumentType: ReturnType<typeof normalizeInstrumentType>) {
  return toNumericField(input.positionSize)
    ?? derivePositionSizeFromMargin({
      instrumentType,
      entry: input.entry,
      marginUsed: input.marginUsed,
      leverage: input.leverage,
      pointValue: input.pointValue,
    })
}


function resolvePartialExits(input: CreateTradeInput) {
  const normalized = normalizePartialExitLegs([
    { percent: input.partialExit1Percent, price: input.partialExit1Price },
    { percent: input.partialExit2Percent, price: input.partialExit2Price },
    { percent: input.partialExit3Percent, price: input.partialExit3Price },
  ])
  return normalized.length ? normalized : null
}

function resolveEffectiveExit(input: CreateTradeInput) {
  const effectiveExit = deriveEffectiveExitFromPartialExitLegs({
    exit: input.exit,
    partialExits: [
      { percent: input.partialExit1Percent, price: input.partialExit1Price },
      { percent: input.partialExit2Percent, price: input.partialExit2Price },
      { percent: input.partialExit3Percent, price: input.partialExit3Price },
    ],
  })
  return effectiveExit !== null ? String(effectiveExit) : input.exit
}

function resolveLegacyStoredRMultiple(args: {
  input: CreateTradeInput
  normalizedInput: Omit<CreateTradeInput, 'market' | 'setup'> & { takeProfit: string; exit: string; accountSize: string; netPnL: string }
  normalizedPnLMode: 'manual' | 'auto' | 'override'
  normalizedInstrumentType: ReturnType<typeof normalizeInstrumentType>
  normalizedCostProfile: string
  normalizedBrokerProfile: ReturnType<typeof normalizeTradeBrokerProfile>
  resolvedPositionSize: number | null
  brokerPointValue: number | null
  partialExits: ReturnType<typeof resolvePartialExits>
}) {
  const manualR = toNumericField(args.input.rMultiple)
  if (manualR === null) return null

  const metrics = computeTradeMetrics({
    pnl: args.normalizedPnLMode === 'auto' ? null : toNumericField(args.normalizedInput.netPnL),
    pnlMode: args.normalizedPnLMode,
    costProfile: args.normalizedCostProfile,
    brokerProfile: args.normalizedBrokerProfile,
    rMultiple: null,
    entry: args.input.entry,
    stopLoss: args.input.stopLoss,
    takeProfit: args.normalizedInput.takeProfit,
    exit: args.normalizedInput.exit,
    bias: args.input.bias,
    instrumentType: args.normalizedInstrumentType,
    positionSize: args.resolvedPositionSize,
    pointValue: args.brokerPointValue,
    fees: args.input.fees,
    exchangeFees: args.input.exchangeFees,
    fundingFees: args.input.fundingFees,
    spreadCost: args.input.spreadCost,
    slippage: args.input.slippage,
    accountCurrency: args.input.accountCurrency,
    riskPercent: args.input.riskPercent,
    accountSize: args.normalizedInput.accountSize,
    cryptoMarketType: args.input.cryptoMarketType,
    executionType: args.input.executionType,
    fundingDirection: args.input.fundingDirection,
    fundingRateBps: args.input.fundingRateBps,
    fundingIntervals: args.input.fundingIntervals,
    quoteAsset: args.input.quoteAsset,
    leverage: args.input.leverage,
    partialExits: args.partialExits ?? [],
  })

  return metrics.rSource === 'missing' ? manualR : null
}

function revalidateTradeSurfaces() {
  revalidatePath('/dashboard')
  revalidatePath('/trades')
  revalidatePath('/statistik')
  revalidatePath('/kalender')
  revalidatePath('/review')
  revalidatePath('/setups')
}

function normalizeTradeMediaInput(media: TradeMediaUploadInput[]) {
  return Array.from(new Map(
    media
      .filter((item) => item.storagePath?.trim())
      .map((item, index) => [
        item.storagePath,
        {
          storagePath: item.storagePath.trim(),
          publicUrl: '',
          fileName: item.fileName?.trim() || null,
          mimeType: item.mimeType?.trim() || null,
          byteSize: typeof item.byteSize === 'number' ? item.byteSize : null,
          sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : index,
          isPrimary: Boolean(item.isPrimary),
        },
      ]),
  ).values())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index, isPrimary: index === 0 }))
}

function mapAtomicMutationError(message?: string | null) {
  const normalized = message?.toUpperCase() ?? ''
  if (normalized.includes('UNAUTHENTICATED')) return 'Bitte zuerst einloggen.'
  if (normalized.includes('NOT_FOUND_OR_FORBIDDEN')) return 'Eintrag nicht gefunden oder kein Zugriff.'
  if (normalized.includes('INVALID_SETUP')) return 'Das gewählte Setup gehört nicht zu diesem Konto.'
  if (normalized.includes('INVALID_MEDIA_PATH')) return 'Ein Medienpfad ist ungültig oder gehört nicht zu diesem Eintrag.'
  if (normalized.includes('INVALID_CURRENCY') || normalized.includes('CURRENCY_REQUIRED')) return 'Bitte eine unterstützte Kontowährung angeben, bevor Geldbeträge gespeichert werden.'
  if (normalized.includes('PGRST202') || normalized.includes('SCHEMA CACHE')) return 'Die Datenbankmigration v57.60.1 fehlt. Die Änderung wurde nicht gespeichert.'
  return 'Die Änderung konnte nicht atomar gespeichert werden.'
}


async function resolveOwnedSetupSelection(
  supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>,
  userId: string,
  setupId: string | undefined,
  setupTitle: string,
) {
  const normalizedTitle = setupTitle.trim()
  const normalizedSetupId = setupId?.trim() || ''

  if (normalizedSetupId) {
    const { data } = await supabase
      .from('setups')
      .select('id, title')
      .eq('id', normalizedSetupId)
      .eq('user_id', userId)
      .maybeSingle()

    if (data?.id) return { id: data.id as string, title: (data.title as string) ?? normalizedTitle }
  }

  if (!normalizedTitle) return null

  const { data } = await supabase
    .from('setups')
    .select('id, title')
    .eq('title', normalizedTitle)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (data?.id) return { id: data.id as string, title: (data.title as string) ?? normalizedTitle }
  return null
}

export async function createTradeEntry(input: CreateTradeInput) {
  const tradeId = crypto.randomUUID()
  const normalizedInput = { ...input, exit: resolveEffectiveExit(input) }
  const partialExits = resolvePartialExits(input)
  const validation = validateTradeCaptureInput(normalizedInput)

  if (!validation.isValid) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: validation.summary,
      fieldErrors: validation.errors,
    }
  }

  const normalizedSubmittedCurrency = normalizeTradeCurrency(input.accountCurrency)
  if (!normalizedSubmittedCurrency) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: 'Kontowährung fehlt oder wird nicht unterstützt. Erlaubt: EUR, USD, GBP, USDT, USDC.',
      fieldErrors: { accountCurrency: 'Unterstützte Kontowährung auswählen.' },
    }
  }

  input = { ...input, tags: validation.normalizedTags }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: 'demo' as const,
      tradeId,
      message: `Demo-Flow aktiv. ${input.market} · ${input.setup} mit ${input.tags.length} Tags vorbereitet.`,
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, mode: 'supabase' as const, message: 'Bitte zuerst einloggen.' }

    const selectedSetup = await resolveOwnedSetupSelection(supabase, user.id, input.setupId, input.setup)
    const resolvedSetupTitle = selectedSetup?.title ?? (input.setup.trim() || 'Später ergänzen')
    const timestamp = new Date().toISOString()
    const resolvedTradeOccurredAt = resolveTradeTimeInputToIso(input.tradeOccurredAt, timestamp)
    const normalizedBrokerProfile = normalizeTradeBrokerProfile(input.brokerProfile)
    const brokerPreset = getTradeBrokerProfilePreset(normalizedBrokerProfile)
    const normalizedInstrumentType = normalizeInstrumentType(input.instrumentType || brokerPreset.defaultInstrumentType)
    const instrumentPreset = getTradeInstrumentPreset(normalizedInstrumentType)
    const normalizedCostProfile = input.userCostProfileId.trim()
      ? 'user-custom'
      : normalizeTradeCostProfile(input.costProfile || brokerPreset.defaultCostProfile || instrumentPreset.defaultCostProfile)
    const costPreset = getTradeCostProfilePreset(normalizedCostProfile)
    const normalizedPnLMode = validation.normalizedPnLMode
    const normalizedCryptoMarketType = normalizeTradeCryptoMarketType(input.cryptoMarketType)
    const normalizedExecutionType = normalizeTradeExecutionType(input.executionType)
    const normalizedFundingDirection = normalizeTradeFundingDirection(input.fundingDirection)
    const resolvedPositionSize = resolveTradePositionSize(input, normalizedInstrumentType)
    const resolvedStoredRMultiple = resolveLegacyStoredRMultiple({
      input,
      normalizedInput,
      normalizedPnLMode,
      normalizedInstrumentType,
      normalizedCostProfile,
      normalizedBrokerProfile,
      resolvedPositionSize,
      brokerPointValue: toNumericField(input.pointValue) ?? brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue,
      partialExits,
    })
    const resolvedMetrics = computeTradeMetrics({
      pnl: normalizedPnLMode === 'auto' ? null : toNumericField(normalizedInput.netPnL),
      pnlMode: normalizedPnLMode,
      costProfile: normalizedCostProfile,
      brokerProfile: normalizedBrokerProfile,
      rMultiple: resolvedStoredRMultiple,
      entry: input.entry,
      stopLoss: input.stopLoss,
      takeProfit: normalizedInput.takeProfit,
      exit: normalizedInput.exit,
      bias: input.bias,
      instrumentType: normalizedInstrumentType,
      positionSize: resolvedPositionSize,
      pointValue: toNumericField(input.pointValue) ?? brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue,
      fees: input.fees,
      exchangeFees: input.exchangeFees,
      fundingFees: input.fundingFees,
      spreadCost: input.spreadCost,
      slippage: input.slippage,
      accountCurrency: input.accountCurrency,
      riskPercent: input.riskPercent,
      accountSize: normalizedInput.accountSize,
      cryptoMarketType: input.cryptoMarketType,
      executionType: input.executionType,
      fundingDirection: input.fundingDirection,
      fundingRateBps: input.fundingRateBps,
      fundingIntervals: input.fundingIntervals,
      quoteAsset: input.quoteAsset,
      leverage: input.leverage,
      partialExits: partialExits ?? [],
    })
    const requestedCaptureStatus = input.captureStatus === 'incomplete' ? 'incomplete' : 'complete'
    const requestedCaptureResult = input.captureResult === 'winner' || input.captureResult === 'loser' || input.captureResult === 'breakeven' || input.captureResult === 'open'
      ? input.captureResult
      : null
    const resolvedCaptureResult = requestedCaptureResult ?? inferTradeCaptureResultFromPnL(resolvedMetrics.netPnL)

    const tradePayload = {
      id: tradeId,
      user_id: user.id,
      created_at: timestamp,
      market: input.market,
      setup: resolvedSetupTitle,
      emotion: input.emotion || null,
      bias: input.bias || null,
      rule_check: input.ruleCheck || null,
      review_repeatability: input.reviewRepeatability || null,
      review_state: input.reviewState || null,
      review_lesson: input.reviewLesson || null,
      entry: toNumericField(input.entry),
      stop_loss: toNumericField(input.stopLoss),
      take_profit: toNumericField(normalizedInput.takeProfit),
      exit: toNumericField(normalizedInput.exit),
      net_pnl: normalizedPnLMode === 'auto' ? null : toNumericField(normalizedInput.netPnL),
      risk_percent: toNumericField(input.riskPercent),
      account_size: toNumericField(normalizedInput.accountSize),
      partial_exits: partialExits,
      r_multiple: resolvedStoredRMultiple,
      pnl_mode: normalizedPnLMode,
      cost_profile: normalizedCostProfile,
      broker_profile: normalizedBrokerProfile,
      instrument_type: normalizedInstrumentType,
      account_template: input.accountTemplate || 'manual',
      market_template: input.marketTemplate || 'manual',
      position_size: resolvedPositionSize,
      point_value: toNumericField(input.pointValue) ?? brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue,
      fees: toNumericField(input.fees) ?? brokerPreset.defaultFees ?? costPreset.defaultFees,
      exchange_fees: toNumericField(input.exchangeFees) ?? brokerPreset.defaultExchangeFees ?? costPreset.defaultExchangeFees,
      funding_fees: toNumericField(input.fundingFees) ?? brokerPreset.defaultFundingFees ?? costPreset.defaultFundingFees,
      funding_rate_bps: toNumericField(input.fundingRateBps) ?? brokerPreset.defaultFundingRateBps ?? null,
      funding_intervals: toNumericField(input.fundingIntervals) ?? brokerPreset.defaultFundingIntervals ?? null,
      spread_cost: toNumericField(input.spreadCost) ?? brokerPreset.defaultSpreadCost ?? costPreset.defaultSpreadCost,
      slippage: toNumericField(input.slippage) ?? brokerPreset.defaultSlippage ?? costPreset.defaultSlippage,
      account_currency: normalizedSubmittedCurrency,
      crypto_market_type: normalizedInstrumentType === 'crypto' ? normalizedCryptoMarketType : 'manual',
      execution_type: normalizedInstrumentType === 'crypto' ? normalizedExecutionType : 'manual',
      funding_direction: normalizedInstrumentType === 'crypto' ? normalizedFundingDirection : 'manual',
      quote_asset:
        normalizedInstrumentType === 'crypto'
          ? input.quoteAsset.trim().toUpperCase() || brokerPreset.defaultQuoteAsset || instrumentPreset.defaultCurrency
          : null,
      leverage: toNumericField(input.leverage) ?? (normalizedInstrumentType === 'crypto' ? brokerPreset.defaultLeverage ?? null : null),
      user_cost_profile_id: input.userCostProfileId.trim() || null,
      capture_status: requestedCaptureStatus,
      capture_result: resolvedCaptureResult,
      captured_at: resolvedTradeOccurredAt,
      completed_at: requestedCaptureStatus === 'complete' ? timestamp : null,
      notes: normalizedInput.notes || null,
      screenshot_url: null,
      quality: input.tags.includes('A-Setup') ? 'A-Setup' : input.tags.includes('C-Setup') ? 'C-Setup' : 'B-Setup',
      session: deriveTradeSessionLabel(resolvedTradeOccurredAt),
      concept: null,
    }

    const { error: tradeInsertError } = await supabase.rpc('equora_create_trade_v1', {
      p_trade_id: tradeId,
      p_trade: tradePayload,
      p_tags: input.tags,
      p_setup_id: selectedSetup?.id ?? null,
    })
    if (tradeInsertError) return { success: false, mode: 'supabase' as const, message: mapAtomicMutationError(tradeInsertError.message) }

    revalidateTradeSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      tradeId,
      message: `Trade gespeichert: ${input.market} · ${resolvedSetupTitle}.`,
    }
  } catch (error) {
    return { success: false, mode: 'supabase' as const, message: `Trade konnte nicht gespeichert werden. ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}` }
  }
}


export async function updateTradeEntry(tradeId: string, input: CreateTradeInput) {
  const normalizedInput = { ...input, exit: resolveEffectiveExit(input) }
  const partialExits = resolvePartialExits(input)
  const validation = validateTradeCaptureInput(normalizedInput)

  if (!validation.isValid) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      tradeId,
      message: validation.summary,
      fieldErrors: validation.errors,
    }
  }

  const normalizedSubmittedCurrency = normalizeTradeCurrency(input.accountCurrency)
  if (!normalizedSubmittedCurrency) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      tradeId,
      message: 'Kontowährung fehlt oder wird nicht unterstützt. Erlaubt: EUR, USD, GBP, USDT, USDC.',
      fieldErrors: { accountCurrency: 'Unterstützte Kontowährung auswählen.' },
    }
  }

  input = { ...input, tags: validation.normalizedTags }

  if (!tradeId.trim()) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: 'Trade-ID fehlt.',
    }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: 'demo' as const,
      tradeId,
      message: `Demo-Edit-Flow aktiv. ${input.market} · ${input.setup} als vollständiger Trade vorbereitet.`,
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, mode: 'supabase' as const, message: 'Bitte zuerst einloggen.' }

    const selectedSetup = await resolveOwnedSetupSelection(supabase, user.id, input.setupId, input.setup)
    const resolvedSetupTitle = selectedSetup?.title ?? (input.setup.trim() || 'Später ergänzen')

    const { data: existingTrade, error: existingTradeError } = await supabase
      .from('trades')
      .select('id, created_at, captured_at, completed_at, notes')
      .eq('id', tradeId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingTradeError || !existingTrade) {
      return { success: false, mode: 'supabase' as const, message: 'Trade nicht gefunden oder kein Zugriff.' }
    }

    const timestamp = new Date().toISOString()
    const resolvedTradeOccurredAt = resolveTradeTimeInputToIso(input.tradeOccurredAt, existingTrade.captured_at ?? existingTrade.created_at ?? timestamp)
    const normalizedBrokerProfile = normalizeTradeBrokerProfile(input.brokerProfile)
    const brokerPreset = getTradeBrokerProfilePreset(normalizedBrokerProfile)
    const normalizedInstrumentType = normalizeInstrumentType(input.instrumentType || brokerPreset.defaultInstrumentType)
    const instrumentPreset = getTradeInstrumentPreset(normalizedInstrumentType)
    const normalizedCostProfile = input.userCostProfileId.trim()
      ? 'user-custom'
      : normalizeTradeCostProfile(input.costProfile || brokerPreset.defaultCostProfile || instrumentPreset.defaultCostProfile)
    const costPreset = getTradeCostProfilePreset(normalizedCostProfile)
    const normalizedPnLMode = validation.normalizedPnLMode
    const normalizedCryptoMarketType = normalizeTradeCryptoMarketType(input.cryptoMarketType)
    const normalizedExecutionType = normalizeTradeExecutionType(input.executionType)
    const normalizedFundingDirection = normalizeTradeFundingDirection(input.fundingDirection)
    const resolvedPositionSize = resolveTradePositionSize(input, normalizedInstrumentType)
    const resolvedStoredRMultiple = resolveLegacyStoredRMultiple({
      input,
      normalizedInput,
      normalizedPnLMode,
      normalizedInstrumentType,
      normalizedCostProfile,
      normalizedBrokerProfile,
      resolvedPositionSize,
      brokerPointValue: toNumericField(input.pointValue) ?? brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue,
      partialExits,
    })
    const resolvedMetrics = computeTradeMetrics({
      pnl: normalizedPnLMode === 'auto' ? null : toNumericField(normalizedInput.netPnL),
      pnlMode: normalizedPnLMode,
      costProfile: normalizedCostProfile,
      brokerProfile: normalizedBrokerProfile,
      rMultiple: resolvedStoredRMultiple,
      entry: input.entry,
      stopLoss: input.stopLoss,
      takeProfit: normalizedInput.takeProfit,
      exit: normalizedInput.exit,
      bias: input.bias,
      instrumentType: normalizedInstrumentType,
      positionSize: resolvedPositionSize,
      pointValue: toNumericField(input.pointValue) ?? brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue,
      fees: input.fees,
      exchangeFees: input.exchangeFees,
      fundingFees: input.fundingFees,
      spreadCost: input.spreadCost,
      slippage: input.slippage,
      accountCurrency: input.accountCurrency,
      riskPercent: input.riskPercent,
      accountSize: normalizedInput.accountSize,
      cryptoMarketType: input.cryptoMarketType,
      executionType: input.executionType,
      fundingDirection: input.fundingDirection,
      fundingRateBps: input.fundingRateBps,
      fundingIntervals: input.fundingIntervals,
      quoteAsset: input.quoteAsset,
      leverage: input.leverage,
      partialExits: partialExits ?? [],
    })

    const preservedImportMeta = extractTradeImportMeta(existingTrade.notes).meta
    const tradePayload = {
      market: input.market,
      setup: resolvedSetupTitle,
      emotion: input.emotion || null,
      bias: input.bias || null,
      rule_check: input.ruleCheck || null,
      review_repeatability: input.reviewRepeatability || null,
      review_state: input.reviewState || null,
      review_lesson: input.reviewLesson || null,
      entry: toNumericField(input.entry),
      stop_loss: toNumericField(input.stopLoss),
      take_profit: toNumericField(normalizedInput.takeProfit),
      exit: toNumericField(normalizedInput.exit),
      net_pnl: normalizedPnLMode === 'auto' ? null : toNumericField(normalizedInput.netPnL),
      risk_percent: toNumericField(input.riskPercent),
      account_size: toNumericField(normalizedInput.accountSize),
      partial_exits: partialExits,
      r_multiple: resolvedStoredRMultiple,
      pnl_mode: normalizedPnLMode,
      cost_profile: normalizedCostProfile,
      broker_profile: normalizedBrokerProfile,
      instrument_type: normalizedInstrumentType,
      account_template: input.accountTemplate || 'manual',
      market_template: input.marketTemplate || 'manual',
      position_size: resolvedPositionSize,
      point_value: toNumericField(input.pointValue) ?? brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue,
      fees: toNumericField(input.fees) ?? brokerPreset.defaultFees ?? costPreset.defaultFees,
      exchange_fees: toNumericField(input.exchangeFees) ?? brokerPreset.defaultExchangeFees ?? costPreset.defaultExchangeFees,
      funding_fees: toNumericField(input.fundingFees) ?? brokerPreset.defaultFundingFees ?? costPreset.defaultFundingFees,
      funding_rate_bps: toNumericField(input.fundingRateBps) ?? brokerPreset.defaultFundingRateBps ?? null,
      funding_intervals: toNumericField(input.fundingIntervals) ?? brokerPreset.defaultFundingIntervals ?? null,
      spread_cost: toNumericField(input.spreadCost) ?? brokerPreset.defaultSpreadCost ?? costPreset.defaultSpreadCost,
      slippage: toNumericField(input.slippage) ?? brokerPreset.defaultSlippage ?? costPreset.defaultSlippage,
      account_currency: normalizedSubmittedCurrency,
      crypto_market_type: normalizedInstrumentType === 'crypto' ? normalizedCryptoMarketType : 'manual',
      execution_type: normalizedInstrumentType === 'crypto' ? normalizedExecutionType : 'manual',
      funding_direction: normalizedInstrumentType === 'crypto' ? normalizedFundingDirection : 'manual',
      quote_asset:
        normalizedInstrumentType === 'crypto'
          ? input.quoteAsset.trim().toUpperCase() || brokerPreset.defaultQuoteAsset || instrumentPreset.defaultCurrency
          : null,
      leverage: toNumericField(input.leverage) ?? (normalizedInstrumentType === 'crypto' ? brokerPreset.defaultLeverage ?? null : null),
      user_cost_profile_id: input.userCostProfileId.trim() || null,
      capture_status: 'complete',
      capture_result: inferTradeCaptureResultFromPnL(resolvedMetrics.netPnL),
      captured_at: resolvedTradeOccurredAt,
      completed_at: existingTrade.completed_at ?? timestamp,
      notes: appendTradeImportMeta(normalizedInput.notes || null, preservedImportMeta),
      screenshot_url: null,
      quality: input.tags.includes('A-Setup') ? 'A-Setup' : input.tags.includes('C-Setup') ? 'C-Setup' : 'B-Setup',
      session: deriveTradeSessionLabel(resolvedTradeOccurredAt),
      concept: null,
    }

    const { error: tradeUpdateError } = await supabase.rpc('equora_update_trade_v1', {
      p_trade_id: tradeId,
      p_trade: tradePayload,
      p_tags: input.tags,
      p_setup_id: selectedSetup?.id ?? null,
    })
    if (tradeUpdateError) return { success: false, mode: 'supabase' as const, message: mapAtomicMutationError(tradeUpdateError.message) }

    revalidateTradeSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      tradeId,
      message: `Trade aktualisiert: ${input.market} · ${resolvedSetupTitle}.`,
    }
  } catch (error) {
    return { success: false, mode: 'supabase' as const, message: `Trade konnte nicht aktualisiert werden. ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}` }
  }
}


export async function createQuickTradeEntry(input: QuickTradeCaptureInput) {
  const tradeId = crypto.randomUUID()
  const validation = validateQuickTradeCaptureInput(input)

  if (!validation.isValid) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: validation.summary,
      fieldErrors: validation.errors,
    }
  }

  input = { ...input, tags: validation.normalizedTags, captureResult: validation.normalizedCaptureResult }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: 'demo' as const,
      tradeId,
      message: `Demo-Schnellerfassung aktiv. ${input.market} · ${input.setup} als ${input.captureResult} vorgemerkt.`,
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, mode: 'supabase' as const, message: 'Bitte zuerst einloggen.' }

    const timestamp = new Date().toISOString()
    const capturedAt = input.capturedAt?.trim() || timestamp
    const tradePayload = {
      id: tradeId,
      user_id: user.id,
      created_at: timestamp,
      market: input.market.trim() || 'Screenshot Capture',
      setup: input.setup.trim() || 'Später ergänzen',
      emotion: null,
      bias: null,
      rule_check: null,
      entry: null,
      stop_loss: null,
      take_profit: null,
      exit: null,
      net_pnl: null,
      risk_percent: null,
      r_multiple: null,
      pnl_mode: 'auto',
      cost_profile: 'manual',
      broker_profile: 'manual',
      instrument_type: 'unknown',
      account_template: 'manual',
      market_template: 'manual',
      position_size: null,
      point_value: null,
      fees: null,
      exchange_fees: null,
      funding_fees: null,
      funding_rate_bps: null,
      funding_intervals: null,
      spread_cost: null,
      slippage: null,
      account_currency: null,
      crypto_market_type: 'manual',
      execution_type: 'manual',
      funding_direction: 'manual',
      quote_asset: null,
      leverage: null,
      user_cost_profile_id: null,
      capture_status: 'incomplete',
      capture_result: validation.normalizedCaptureResult,
      captured_at: capturedAt,
      completed_at: null,
      notes: input.notes.trim() || null,
      screenshot_url: null,
      quality: input.tags.includes('A-Setup') ? 'A-Setup' : input.tags.includes('C-Setup') ? 'C-Setup' : 'B-Setup',
      session: deriveTradeSessionLabel(capturedAt),
      concept: null,
    }

    const { error: tradeError } = await supabase.rpc('equora_create_trade_v1', {
      p_trade_id: tradeId,
      p_trade: tradePayload,
      p_tags: input.tags,
      p_setup_id: null,
    })
    if (tradeError) return { success: false, mode: 'supabase' as const, message: mapAtomicMutationError(tradeError.message) }

    const quickLabel = validation.normalizedCaptureResult === 'open' ? 'Offener Trade gesichert' : 'Schnellerfassung gespeichert'
    revalidateTradeSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      tradeId,
      message: `${quickLabel}: ${(input.market.trim() || 'Screenshot Capture')} · ${(input.setup.trim() || 'Später ergänzen')}.`,
    }
  } catch (error) {
    return { success: false, mode: 'supabase' as const, message: `Schnellerfassung konnte nicht gespeichert werden. ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}` }
  }
}



type CloseTradeInput = {
  tradeId: string
  exit?: string
  netPnL?: string
  captureResult: 'winner' | 'loser' | 'breakeven'
  notes?: string
}

export async function closeTradeEntry(input: CloseTradeInput) {
  if (!input.tradeId.trim()) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: 'Trade-ID fehlt.',
    }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: 'demo' as const,
      tradeId: input.tradeId,
      message: 'Demo-Flow aktiv. Trade als geschlossen vorgemerkt.',
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, mode: 'supabase' as const, message: 'Bitte zuerst einloggen.' }

    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('id, user_id, market, setup, notes, account_currency')
      .eq('id', input.tradeId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (tradeError || !trade) {
      return { success: false, mode: 'supabase' as const, message: 'Trade nicht gefunden oder kein Zugriff.' }
    }

    const timestamp = new Date().toISOString()
    const tradeImport = extractTradeImportMeta(trade.notes)
    const mergedNotes = appendTradeImportMeta([tradeImport.cleanNotes.trim(), input.notes?.trim()].filter(Boolean).join('\n\n') || null, tradeImport.meta)
    const resolvedNetPnL = toNumericField(input.netPnL ?? '')
    if (resolvedNetPnL !== null && !normalizeTradeCurrency(trade.account_currency)) {
      return { success: false, mode: 'supabase' as const, message: 'Der Trade hat keine unterstützte Kontowährung. Bitte zuerst im vollständigen Edit-Flow eine Währung setzen.' }
    }
    const resolvedPnLMode = normalizeTradePnLMode(undefined, resolvedNetPnL)
    const inferredResult = inferTradeCaptureResultFromPnL(resolvedNetPnL)
    const resolvedCaptureResult = inferredResult && inferredResult !== 'open' ? inferredResult : input.captureResult
    const updatePayload = {
      exit: toNumericField(input.exit ?? ''),
      net_pnl: resolvedNetPnL,
      capture_status: 'complete',
      capture_result: resolvedCaptureResult,
      completed_at: timestamp,
      notes: mergedNotes,
      r_multiple: null,
      pnl_mode: resolvedPnLMode,
    }

    const { error: updateError } = await supabase
      .from('trades')
      .update(updatePayload)
      .eq('id', input.tradeId)
      .eq('user_id', user.id)

    if (updateError) {
      return { success: false, mode: 'supabase' as const, message: `Trade konnte nicht geschlossen werden. ${updateError.message}` }
    }

    revalidateTradeSurfaces()
    const autoResultHint = resolvedCaptureResult !== input.captureResult
      ? ` Status wurde aus P&L als ${resolvedCaptureResult} übernommen.`
      : ''

    return {
      success: true,
      mode: 'supabase' as const,
      tradeId: input.tradeId,
      message: `Trade geschlossen: ${trade.market} · ${trade.setup}.${autoResultHint}`,
    }
  } catch (error) {
    return { success: false, mode: 'supabase' as const, message: `Trade konnte nicht geschlossen werden. ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}` }
  }
}

export async function syncTradeMedia(tradeId: string, media: TradeMediaUploadInput[]) {

  if (!tradeId.trim()) {
    return { success: false, mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const), message: 'Trade-ID fehlt für Screenshots.' }
  }

  const normalizedMedia = normalizeTradeMediaInput(media)

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: 'demo' as const,
      tradeId,
      message: normalizedMedia.length ? `${normalizedMedia.length} Screenshot(s) im Demo-Flow vorgemerkt.` : 'Keine Screenshots zu synchronisieren.',
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, mode: 'supabase' as const, message: 'Bitte zuerst einloggen.' }

    for (const item of normalizedMedia) assertOwnedTradeMediaPath(user.id, tradeId, item.storagePath)

    const { error: syncError } = await supabase.rpc('equora_upsert_trade_media_v1', {
      p_trade_id: tradeId,
      p_media: normalizedMedia.map((item) => ({
        storagePath: item.storagePath,
        fileName: item.fileName,
        mimeType: item.mimeType,
        byteSize: item.byteSize,
        sortOrder: item.sortOrder,
        isPrimary: item.isPrimary,
      })),
    })
    if (syncError) return { success: false, mode: 'supabase' as const, message: mapAtomicMutationError(syncError.message) }

    revalidateTradeSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      tradeId,
      message: normalizedMedia.length
        ? `${normalizedMedia.length} private Screenshot(s) am Trade gespeichert.`
        : 'Keine neuen Screenshots zu synchronisieren.',
    }
  } catch (error) {
    return { success: false, mode: 'supabase' as const, message: `Trade-Medien konnten nicht synchronisiert werden. ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}` }
  }
}


export async function removeTradeMediaItem(tradeId: string, mediaId: string) {
  if (!tradeId.trim() || !mediaId.trim()) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: 'Trade oder Medien-ID fehlt.',
    }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: 'demo' as const,
      tradeId,
      message: 'Demo-Modus: Bild lokal ausgeblendet.',
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, mode: 'supabase' as const, message: 'Bitte zuerst einloggen.' }

    const { data, error: removeError } = await supabase.rpc('equora_remove_trade_media_v1', {
      p_trade_id: tradeId,
      p_media_id: mediaId,
    })
    if (removeError) return { success: false, mode: 'supabase' as const, message: mapAtomicMutationError(removeError.message) }

    const result = (data ?? {}) as { alreadyAbsent?: boolean; storagePath?: string }
    const cleanup = result.storagePath
      ? await processMediaCleanupForPaths([result.storagePath])
      : { completed: 0, pending: 0 }

    revalidateTradeSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      tradeId,
      message: cleanup.pending
        ? 'Bild aus dem Journal entfernt. Die physische Storage-Bereinigung wird erneut versucht.'
        : result.alreadyAbsent
          ? 'Bild war bereits entfernt.'
          : 'Bild sicher aus dem Journal entfernt.',
    }
  } catch (error) {
    return { success: false, mode: 'supabase' as const, message: `Bild konnte nicht gelöscht werden. ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}` }
  }
}

export async function deleteTradeEntry(tradeId: string) {
  if (!tradeId.trim()) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: 'Trade-ID fehlt.',
    }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: 'demo' as const,
      deletedId: tradeId,
      message: 'Demo-Flow aktiv. Trade lokal entfernt.',
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, mode: 'supabase' as const, message: 'Bitte zuerst einloggen.' }

    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('id, market, setup, screenshot_url')
      .eq('id', tradeId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (tradeError || !trade) {
      return { success: false, mode: 'supabase' as const, message: 'Trade nicht gefunden oder kein Zugriff.' }
    }

    const { data, error: deleteError } = await supabase.rpc('equora_delete_trade_v1', { p_trade_id: tradeId })
    if (deleteError) return { success: false, mode: 'supabase' as const, message: mapAtomicMutationError(deleteError.message) }

    const result = (data ?? {}) as { storagePaths?: string[]; alreadyAbsent?: boolean }
    const cleanup = await processMediaCleanupForPaths(result.storagePaths ?? [])

    revalidateTradeSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      deletedId: tradeId,
      message: result.alreadyAbsent
        ? 'Trade war bereits gelöscht.'
        : `Trade gelöscht: ${trade.market} · ${trade.setup}.${cleanup.pending ? ' Die Storage-Bereinigung läuft im Hintergrund weiter.' : ''}`,
    }
  } catch (error) {
    return { success: false, mode: 'supabase' as const, message: `Trade konnte nicht gelöscht werden. ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}` }
  }
}

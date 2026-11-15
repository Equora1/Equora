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
import { getTradeCaptureResultLabel, inferTradeCaptureResultFromPnL } from '@/lib/utils/trade-capture'
import { deriveTradeSessionLabel, getTradeTimeInputError, resolveTradeTimeInputToIso } from '@/lib/utils/trade-time'
import { appendTradeImportMeta, extractTradeImportMeta } from '@/lib/utils/trade-import-meta'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { getManualTradeNumberFormatHint, parseManualTradeNumber } from '@/lib/utils/manual-trade-number'
import type { TradeMediaUploadInput } from '@/lib/types/media'
import { assertOwnedTradeMediaPath } from '@/lib/utils/media-security'
import { processMediaCleanupForPaths } from '@/lib/server/media-cleanup'
import { normalizeTradeCurrency } from '@/lib/utils/currency'
import { getExitPriceBasis } from '@/lib/utils/trade-exit-basis'

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
  normalizedInput: Omit<CreateTradeInput, 'market' | 'setup'> & { takeProfit: string; exit: string; accountSize: string }
  normalizedPnLMode: 'manual' | 'auto' | 'override'
  normalizedManualPnL: number | null
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
    pnl: args.normalizedManualPnL,
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

function mapAtomicMutationError(message?: string | null, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  const normalized = message?.toUpperCase() ?? ''
  if (normalized.includes('UNAUTHENTICATED')) return text('Bitte zuerst einloggen.', 'Sign in first.')
  if (normalized.includes('NOT_FOUND_OR_FORBIDDEN')) return text('Eintrag nicht gefunden oder kein Zugriff.', 'The entry was not found or you do not have access.')
  if (normalized.includes('INVALID_SETUP')) return text('Das gewählte Setup gehört nicht zu diesem Konto.', 'The selected setup does not belong to this account.')
  if (normalized.includes('INVALID_MEDIA_PATH')) return text('Ein Medienpfad ist ungültig oder gehört nicht zu diesem Eintrag.', 'An image is invalid or does not belong to this entry.')
  if (normalized.includes('INVALID_CURRENCY') || normalized.includes('CURRENCY_REQUIRED')) return text('Bitte eine unterstützte Kontowährung angeben, bevor Geldbeträge gespeichert werden.', 'Set a supported account currency before saving amounts.')
  if (normalized.includes('PGRST202') || normalized.includes('SCHEMA CACHE')) return text('Die Datenbankmigration v57.60.1 fehlt. Die Änderung wurde nicht gespeichert.', 'Saving is currently unavailable.')
  return text('Die Änderung konnte nicht atomar gespeichert werden.', 'The change could not be saved.')
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

export async function createTradeEntry(input: CreateTradeInput, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  const tradeId = crypto.randomUUID()
  const validation = validateTradeCaptureInput(input, undefined, locale)

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
      message: text('Kontowährung fehlt oder wird nicht unterstützt. Erlaubt: EUR, USD, GBP, USDT, USDC.', 'Choose a supported account currency: EUR, USD, GBP, USDT or USDC.'),
      fieldErrors: { accountCurrency: text('Unterstützte Kontowährung auswählen.', 'Choose a supported account currency.') },
    }
  }

  input = { ...input, tags: validation.normalizedTags }
  const normalizedInput = { ...input, exit: resolveEffectiveExit(input) }
  const partialExits = resolvePartialExits(input)

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: 'demo' as const,
      tradeId,
      message: text(`Demo-Flow aktiv. ${input.market} · ${input.setup} mit ${input.tags.length} Tags vorbereitet.`, `Trade prepared in demo mode: ${input.market} · ${input.setup}.`),
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, mode: 'supabase' as const, message: text('Bitte zuerst einloggen.', 'Sign in to save the trade.') }

    const selectedSetup = await resolveOwnedSetupSelection(supabase, user.id, input.setupId, input.setup)
    const resolvedSetupTitle = selectedSetup?.title ?? (input.setup.trim() || 'Später ergänzen')
    const timestamp = new Date().toISOString()
    const resolvedTradeOccurredAt = resolveTradeTimeInputToIso(input.tradeOccurredAt, timestamp, undefined, locale)
    const normalizedBrokerProfile = normalizeTradeBrokerProfile(input.brokerProfile)
    const brokerPreset = getTradeBrokerProfilePreset(normalizedBrokerProfile)
    const normalizedInstrumentType = normalizeInstrumentType(input.instrumentType || brokerPreset.defaultInstrumentType)
    const instrumentPreset = getTradeInstrumentPreset(normalizedInstrumentType)
    const normalizedCostProfile = input.userCostProfileId.trim()
      ? 'user-custom'
      : normalizeTradeCostProfile(input.costProfile || brokerPreset.defaultCostProfile || instrumentPreset.defaultCostProfile)
    const costPreset = getTradeCostProfilePreset(normalizedCostProfile)
    const { normalizedPnLMode, normalizedManualPnL } = validation
    const normalizedCryptoMarketType = normalizeTradeCryptoMarketType(input.cryptoMarketType)
    const normalizedExecutionType = normalizeTradeExecutionType(input.executionType)
    const normalizedFundingDirection = normalizeTradeFundingDirection(input.fundingDirection)
    const resolvedPositionSize = resolveTradePositionSize(input, normalizedInstrumentType)
    const resolvedStoredRMultiple = resolveLegacyStoredRMultiple({
      input,
      normalizedInput,
      normalizedPnLMode,
      normalizedManualPnL,
      normalizedInstrumentType,
      normalizedCostProfile,
      normalizedBrokerProfile,
      resolvedPositionSize,
      brokerPointValue: toNumericField(input.pointValue) ?? brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue,
      partialExits,
    })
    const resolvedMetrics = computeTradeMetrics({
      pnl: normalizedManualPnL,
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
      net_pnl: normalizedManualPnL,
      risk_percent: toNumericField(input.riskPercent),
      account_size: toNumericField(normalizedInput.accountSize),
      partial_exits: partialExits,
      exit_price_basis: getExitPriceBasis(input.exit, partialExits),
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

    const { error: tradeInsertError } = await supabase.rpc('equora_create_trade_v2', {
      p_trade_id: tradeId,
      p_trade: tradePayload,
      p_tags: input.tags,
      p_setup_id: selectedSetup?.id ?? null,
    })
    if (tradeInsertError) return { success: false, mode: 'supabase' as const, message: mapAtomicMutationError(tradeInsertError.message, locale) }

    revalidateTradeSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      tradeId,
      message: text(`Trade gespeichert: ${input.market} · ${resolvedSetupTitle}.`, `Trade saved: ${input.market} · ${resolvedSetupTitle}.`),
    }
  } catch {
    return { success: false, mode: 'supabase' as const, message: text('Das Speichern konnte nicht bestätigt werden. Prüfe den Trade, bevor du es erneut versuchst.', 'Saving the trade could not be confirmed. Check your trades before trying again.') }
  }
}


export async function updateTradeEntry(tradeId: string, input: CreateTradeInput, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  // Time validation needs the owned stored instant to preserve an unchanged DST fold.
  const validation = validateTradeCaptureInput({ ...input, tradeOccurredAt: '' }, undefined, locale)

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
      message: text('Kontowährung fehlt oder wird nicht unterstützt. Erlaubt: EUR, USD, GBP, USDT, USDC.', 'Choose a supported account currency: EUR, USD, GBP, USDT or USDC.'),
      fieldErrors: { accountCurrency: text('Unterstützte Kontowährung auswählen.', 'Choose a supported account currency.') },
    }
  }

  input = { ...input, tags: validation.normalizedTags }
  const normalizedInput = { ...input, exit: resolveEffectiveExit(input) }
  const partialExits = resolvePartialExits(input)

  if (!tradeId.trim()) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: text('Trade-ID fehlt.', 'Trade ID is missing.'),
    }
  }

  if (!hasSupabaseClientEnv()) {
    const timeError = getTradeTimeInputError(input.tradeOccurredAt, undefined, locale)
    if (timeError) return { success: false, mode: 'demo' as const, tradeId, message: timeError, fieldErrors: { tradeOccurredAt: timeError } }
    return {
      success: true,
      mode: 'demo' as const,
      tradeId,
      message: text(`Demo-Edit-Flow aktiv. ${input.market} · ${input.setup} als vollständiger Trade vorbereitet.`, `Trade changes prepared in demo mode: ${input.market} · ${input.setup}.`),
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, mode: 'supabase' as const, message: text('Bitte zuerst einloggen.', 'Sign in to save the trade.') }

    const selectedSetup = await resolveOwnedSetupSelection(supabase, user.id, input.setupId, input.setup)
    const resolvedSetupTitle = selectedSetup?.title ?? (input.setup.trim() || 'Später ergänzen')

    const { data: existingTrade, error: existingTradeError } = await supabase
      .from('trades')
      .select('id, created_at, captured_at, completed_at, notes')
      .eq('id', tradeId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingTradeError || !existingTrade) {
      return { success: false, mode: 'supabase' as const, message: text('Trade nicht gefunden oder kein Zugriff.', 'The trade could not be found or you do not have access.') }
    }

    const timestamp = new Date().toISOString()
    const originalTradeTimeIso = existingTrade.captured_at ?? existingTrade.created_at ?? timestamp
    const timeError = getTradeTimeInputError(input.tradeOccurredAt, originalTradeTimeIso, locale)
    if (timeError) return { success: false, mode: 'supabase' as const, tradeId, message: timeError, fieldErrors: { tradeOccurredAt: timeError } }
    const resolvedTradeOccurredAt = resolveTradeTimeInputToIso(input.tradeOccurredAt, originalTradeTimeIso, originalTradeTimeIso, locale)
    const normalizedBrokerProfile = normalizeTradeBrokerProfile(input.brokerProfile)
    const brokerPreset = getTradeBrokerProfilePreset(normalizedBrokerProfile)
    const normalizedInstrumentType = normalizeInstrumentType(input.instrumentType || brokerPreset.defaultInstrumentType)
    const instrumentPreset = getTradeInstrumentPreset(normalizedInstrumentType)
    const normalizedCostProfile = input.userCostProfileId.trim()
      ? 'user-custom'
      : normalizeTradeCostProfile(input.costProfile || brokerPreset.defaultCostProfile || instrumentPreset.defaultCostProfile)
    const costPreset = getTradeCostProfilePreset(normalizedCostProfile)
    const { normalizedPnLMode, normalizedManualPnL } = validation
    const normalizedCryptoMarketType = normalizeTradeCryptoMarketType(input.cryptoMarketType)
    const normalizedExecutionType = normalizeTradeExecutionType(input.executionType)
    const normalizedFundingDirection = normalizeTradeFundingDirection(input.fundingDirection)
    const resolvedPositionSize = resolveTradePositionSize(input, normalizedInstrumentType)
    const resolvedStoredRMultiple = resolveLegacyStoredRMultiple({
      input,
      normalizedInput,
      normalizedPnLMode,
      normalizedManualPnL,
      normalizedInstrumentType,
      normalizedCostProfile,
      normalizedBrokerProfile,
      resolvedPositionSize,
      brokerPointValue: toNumericField(input.pointValue) ?? brokerPreset.defaultPointValue ?? instrumentPreset.defaultPointValue,
      partialExits,
    })
    const resolvedMetrics = computeTradeMetrics({
      pnl: normalizedManualPnL,
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
      net_pnl: normalizedManualPnL,
      risk_percent: toNumericField(input.riskPercent),
      account_size: toNumericField(normalizedInput.accountSize),
      partial_exits: partialExits,
      exit_price_basis: getExitPriceBasis(input.exit, partialExits),
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

    const { error: tradeUpdateError } = await supabase.rpc('equora_update_trade_v2', {
      p_trade_id: tradeId,
      p_trade: tradePayload,
      p_tags: input.tags,
      p_setup_id: selectedSetup?.id ?? null,
    })
    if (tradeUpdateError) return { success: false, mode: 'supabase' as const, message: mapAtomicMutationError(tradeUpdateError.message, locale) }

    revalidateTradeSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      tradeId,
      message: text(`Trade aktualisiert: ${input.market} · ${resolvedSetupTitle}.`, `Trade updated: ${input.market} · ${resolvedSetupTitle}.`),
    }
  } catch {
    return { success: false, mode: 'supabase' as const, message: text('Die Änderung konnte nicht bestätigt werden. Prüfe den Trade, bevor du es erneut versuchst.', 'Updating the trade could not be confirmed. Check the trade before trying again.') }
  }
}


export async function createQuickTradeEntry(input: QuickTradeCaptureInput, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  const tradeId = crypto.randomUUID()
  const validation = validateQuickTradeCaptureInput(input, locale)

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
      message: text(`Demo-Schnellerfassung aktiv. ${input.market} · ${input.setup} als ${input.captureResult} vorgemerkt.`, 'Quick entry prepared in demo mode.'),
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, mode: 'supabase' as const, message: text('Bitte zuerst einloggen.', 'Sign in to save a trade.') }

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
    if (tradeError) return { success: false, mode: 'supabase' as const, message: mapAtomicMutationError(tradeError.message, locale) }

    const quickLabel = validation.normalizedCaptureResult === 'open' ? text('Offener Trade gesichert', 'Open trade saved') : text('Schnellerfassung gespeichert', 'Quick entry saved')
    revalidateTradeSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      tradeId,
      message: `${quickLabel}: ${(input.market.trim() || 'Screenshot Capture')} · ${input.setup.trim() || text('Später ergänzen', 'Add later')}.`,
    }
  } catch {
    return { success: false, mode: 'supabase' as const, message: text('Das Speichern konnte nicht bestätigt werden. Prüfe deine Trades vor einem neuen Versuch.', 'Quick entry could not be confirmed. Check your trades before trying again.') }
  }
}



type CloseTradeInput = {
  tradeId: string
  exit?: string
  netPnL?: string
  captureResult: 'winner' | 'loser' | 'breakeven'
  notes?: string
}

export async function closeTradeEntry(input: CloseTradeInput, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  if (!input.tradeId.trim()) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: text('Trade-ID fehlt.', 'Trade ID is missing.'),
    }
  }

  const submittedPnL = input.netPnL ?? ''
  const resolvedNetPnL = parseManualTradeNumber(submittedPnL, locale)
  const resolvedExit = parseManualTradeNumber(input.exit, locale)
  if ((submittedPnL.trim() && resolvedNetPnL === null) || (input.exit?.trim() && resolvedExit === null)) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: getManualTradeNumberFormatHint(locale),
    }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: 'demo' as const,
      tradeId: input.tradeId,
      message: text('Demo-Flow aktiv. Trade als geschlossen vorgemerkt.', 'Demo mode. The close was prepared without saving a trade.'),
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, mode: 'supabase' as const, message: text('Bitte zuerst einloggen.', 'Sign in to close the trade.') }

    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('id, user_id, market, setup, notes, account_currency, partial_exits')
      .eq('id', input.tradeId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (tradeError || !trade) {
      return { success: false, mode: 'supabase' as const, message: text('Trade nicht gefunden oder kein Zugriff.', 'The trade was not found or you do not have access.') }
    }

    if (Array.isArray(trade.partial_exits) && trade.partial_exits.length > 0) {
      return { success: false, mode: 'supabase' as const, message: text('Dieser Trade enthält Teilverkäufe. Bitte über „Bearbeiten“ die Ausstiegspreise prüfen und die Position vollständig schließen.', 'This trade has partial exits. Check the exit prices in the full editor before closing the position.') }
    }

    const timestamp = new Date().toISOString()
    const tradeImport = extractTradeImportMeta(trade.notes)
    const mergedNotes = appendTradeImportMeta([tradeImport.cleanNotes.trim(), input.notes?.trim()].filter(Boolean).join('\n\n') || null, tradeImport.meta)
    if (resolvedNetPnL !== null && !normalizeTradeCurrency(trade.account_currency)) {
      return { success: false, mode: 'supabase' as const, message: text('Der Trade hat keine unterstützte Kontowährung. Bitte zuerst im vollständigen Edit-Flow eine Währung setzen.', 'This trade needs a supported account currency. Set it in the full editor before saving P&L.') }
    }
    const resolvedPnLMode = normalizeTradePnLMode(undefined, resolvedNetPnL)
    const inferredResult = inferTradeCaptureResultFromPnL(resolvedNetPnL)
    const resolvedCaptureResult = inferredResult && inferredResult !== 'open' ? inferredResult : input.captureResult
    const updatePayload = {
      exit: resolvedExit,
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
      return { success: false, mode: 'supabase' as const, message: text('Der Trade konnte nicht geschlossen werden. Lade ihn neu und prüfe den aktuellen Stand.', 'The trade could not be closed. Reload and check the trade before trying again.') }
    }

    revalidateTradeSurfaces()
    const autoResultHint = resolvedCaptureResult !== input.captureResult
      ? text(` Status wurde aus P&L als ${resolvedCaptureResult} übernommen.`, ` Outcome based on P&L: ${getTradeCaptureResultLabel(resolvedCaptureResult, 'en')}.`)
      : ''

    return {
      success: true,
      mode: 'supabase' as const,
      tradeId: input.tradeId,
      message: text(`Trade geschlossen: ${trade.market} · ${trade.setup}.`, `Trade closed: ${trade.market} · ${trade.setup}.`) + autoResultHint,
    }
  } catch {
    return { success: false, mode: 'supabase' as const, message: text('Der Abschluss konnte nicht bestätigt werden. Lade den Trade neu und prüfe den aktuellen Stand.', 'The close could not be confirmed. Reload and check the trade before trying again.') }
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

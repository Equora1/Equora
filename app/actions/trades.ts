'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  deriveRMultiple,
  getTradeBrokerProfilePreset,
  getTradeCostProfilePreset,
  getTradeInstrumentPreset,
  normalizeInstrumentType,
  normalizeTradeBrokerProfile,
  normalizeTradeCryptoMarketType,
  normalizeTradeCostProfile,
  normalizeTradeExecutionType,
  normalizeTradeFundingDirection,
  parseTradingNumber,
  derivePositionSizeFromMargin,
  deriveEffectiveExitFromPartialExitLegs,
  normalizePartialExitLegs,
} from '@/lib/utils/calculations'
import {
  type QuickTradeCaptureInput,
  type TradeCaptureInput as CreateTradeInput,
  validateQuickTradeCaptureInput,
  validateTradeCaptureInput,
} from '@/lib/utils/trade-validation'
import { inferTradeCaptureResultFromPnL } from '@/lib/utils/trade-capture'
import type { TradeMediaUploadInput } from '@/lib/types/media'

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
      .filter((item) => item.publicUrl?.trim() && item.storagePath?.trim())
      .map((item, index) => [
        item.storagePath,
        {
          storagePath: item.storagePath.trim(),
          publicUrl: item.publicUrl.trim(),
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


function isMissingTradeMediaSchema(message?: string | null) {
  const normalized = message?.toLowerCase() ?? ''
  return normalized.includes('trade_media') && (normalized.includes('schema cache') || normalized.includes('does not exist') || normalized.includes('relation'))
}

function stripUnsupportedTradeColumns<T extends Record<string, unknown>>(payload: T, errorMessage?: string | null) {
  const normalized = errorMessage?.toLowerCase() ?? ''
  const nextPayload = { ...payload }
  let changed = false

  const optionalColumns = ['review_lesson', 'review_repeatability', 'review_state', 'account_size', 'partial_exits'] as const
  for (const column of optionalColumns) {
    if (normalized.includes(`'${column}'`) || normalized.includes(`"${column}"`) || normalized.includes(`column ${column}`)) {
      if (column in nextPayload) {
        delete nextPayload[column]
        changed = true
      }
    }
  }

  return { payload: nextPayload, changed }
}

async function updatePrimaryTradeScreenshot(
  supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>,
  tradeId: string,
  userId: string,
  primaryUrl: string | null,
) {
  const { error } = await supabase.from('trades').update({ screenshot_url: primaryUrl }).eq('id', tradeId).eq('user_id', userId)
  return error
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

    const timestamp = new Date().toISOString()
    const derivedRMultiple = deriveRMultiple({
      entry: input.entry,
      stopLoss: input.stopLoss,
      takeProfit: normalizedInput.takeProfit,
      bias: input.bias,
    })
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

    const tradePayload = {
      id: tradeId,
      user_id: user.id,
      created_at: timestamp,
      market: input.market,
      setup: input.setup,
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
      r_multiple: toNumericField(input.rMultiple) ?? derivedRMultiple ?? null,
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
      account_currency: input.accountCurrency.trim() || brokerPreset.defaultCurrency || instrumentPreset.defaultCurrency,
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
      capture_result: inferTradeCaptureResultFromPnL(normalizedPnLMode === 'auto' ? null : normalizedInput.netPnL),
      captured_at: timestamp,
      completed_at: timestamp,
      notes: normalizedInput.notes || null,
      screenshot_url: input.screenshotUrl?.trim() || null,
      quality: input.tags.includes('A-Setup') ? 'A-Setup' : input.tags.includes('C-Setup') ? 'C-Setup' : 'B-Setup',
      session: null,
      concept: null,
    }

    let tradeInsert = await supabase.from('trades').insert(tradePayload)
    if (tradeInsert.error) {
      const legacyFallback = stripUnsupportedTradeColumns(tradePayload, tradeInsert.error.message)
      if (legacyFallback.changed) {
        tradeInsert = await supabase.from('trades').insert(legacyFallback.payload)
      }
    }
    if (tradeInsert.error) return { success: false, mode: 'supabase' as const, message: `Trade konnte nicht gespeichert werden. ${tradeInsert.error.message}` }

    if (input.tags.length) {
      await supabase.from('trade_tags').insert(
        input.tags.map((tag) => ({ id: crypto.randomUUID(), trade_id: tradeId, tag, created_at: timestamp })),
      )
    }

    revalidateTradeSurfaces()
    return { success: true, mode: 'supabase' as const, tradeId, message: `Trade gespeichert: ${input.market} · ${input.setup}.` }
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

    const { data: existingTrade, error: existingTradeError } = await supabase
      .from('trades')
      .select('id, created_at, captured_at, completed_at')
      .eq('id', tradeId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingTradeError || !existingTrade) {
      return { success: false, mode: 'supabase' as const, message: 'Trade nicht gefunden oder kein Zugriff.' }
    }

    const timestamp = new Date().toISOString()
    const derivedRMultiple = deriveRMultiple({
      entry: input.entry,
      stopLoss: input.stopLoss,
      takeProfit: normalizedInput.takeProfit,
      bias: input.bias,
    })
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

    const tradePayload = {
      market: input.market,
      setup: input.setup,
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
      r_multiple: toNumericField(input.rMultiple) ?? derivedRMultiple ?? null,
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
      account_currency: input.accountCurrency.trim() || brokerPreset.defaultCurrency || instrumentPreset.defaultCurrency,
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
      capture_result: inferTradeCaptureResultFromPnL(normalizedPnLMode === 'auto' ? null : normalizedInput.netPnL),
      captured_at: existingTrade.captured_at ?? existingTrade.created_at ?? timestamp,
      completed_at: existingTrade.completed_at ?? timestamp,
      notes: normalizedInput.notes || null,
      screenshot_url: input.screenshotUrl?.trim() || null,
      quality: input.tags.includes('A-Setup') ? 'A-Setup' : input.tags.includes('C-Setup') ? 'C-Setup' : 'B-Setup',
      session: null,
      concept: null,
    }

    let tradeUpdate = await supabase
      .from('trades')
      .update(tradePayload)
      .eq('id', tradeId)
      .eq('user_id', user.id)

    if (tradeUpdate.error) {
      const legacyFallback = stripUnsupportedTradeColumns(tradePayload, tradeUpdate.error.message)
      if (legacyFallback.changed) {
        tradeUpdate = await supabase
          .from('trades')
          .update(legacyFallback.payload)
          .eq('id', tradeId)
          .eq('user_id', user.id)
      }
    }

    if (tradeUpdate.error) return { success: false, mode: 'supabase' as const, message: `Trade konnte nicht aktualisiert werden. ${tradeUpdate.error.message}` }

    const { error: deleteTagsError } = await supabase.from('trade_tags').delete().eq('trade_id', tradeId)
    if (deleteTagsError) {
      return { success: false, mode: 'supabase' as const, message: 'Trade wurde aktualisiert, aber bestehende Tags konnten nicht ersetzt werden.' }
    }

    if (input.tags.length) {
      const { error: tagInsertError } = await supabase.from('trade_tags').insert(
        input.tags.map((tag) => ({ id: crypto.randomUUID(), trade_id: tradeId, tag, created_at: timestamp })),
      )

      if (tagInsertError) {
        return { success: false, mode: 'supabase' as const, message: 'Trade wurde aktualisiert, aber neue Tags konnten nicht gespeichert werden.' }
      }
    }

    revalidateTradeSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      tradeId,
      message: `Trade aktualisiert: ${input.market} · ${input.setup}.`,
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
      pnl_mode: 'manual',
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
      captured_at: timestamp,
      completed_at: null,
      notes: input.notes.trim() || null,
      screenshot_url: input.screenshotUrl?.trim() || null,
      quality: input.tags.includes('A-Setup') ? 'A-Setup' : input.tags.includes('C-Setup') ? 'C-Setup' : 'B-Setup',
      session: null,
      concept: null,
    }

    const { error: tradeError } = await supabase.from('trades').insert(tradePayload)
    if (tradeError) return { success: false, mode: 'supabase' as const, message: `Schnellerfassung konnte nicht gespeichert werden. ${tradeError.message}` }

    if (input.tags.length) {
      await supabase.from('trade_tags').insert(
        input.tags.map((tag) => ({ id: crypto.randomUUID(), trade_id: tradeId, tag, created_at: timestamp })),
      )
    }

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
      .select('id, user_id, market, setup, notes')
      .eq('id', input.tradeId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (tradeError || !trade) {
      return { success: false, mode: 'supabase' as const, message: 'Trade nicht gefunden oder kein Zugriff.' }
    }

    const timestamp = new Date().toISOString()
    const mergedNotes = [trade.notes?.trim(), input.notes?.trim()].filter(Boolean).join('\n\n') || null
    const resolvedNetPnL = toNumericField(input.netPnL ?? '')
    const inferredResult = inferTradeCaptureResultFromPnL(resolvedNetPnL)
    const resolvedCaptureResult = inferredResult && inferredResult !== 'open' ? inferredResult : input.captureResult
    const updatePayload = {
      exit: toNumericField(input.exit ?? ''),
      net_pnl: resolvedNetPnL,
      capture_status: 'complete',
      capture_result: resolvedCaptureResult,
      completed_at: timestamp,
      notes: mergedNotes,
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
      ? ` Ergebnis wurde aus Netto-P&L als ${resolvedCaptureResult} übernommen.`
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

    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('id, user_id')
      .eq('id', tradeId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (tradeError || !trade) {
      return { success: false, mode: 'supabase' as const, message: 'Trade für Screenshot-Sync nicht gefunden.' }
    }

    const primaryUrl = normalizedMedia[0]?.publicUrl ?? null
    let tradeMediaMissing = false

    const { error: deleteError } = await supabase.from('trade_media').delete().eq('trade_id', tradeId).eq('user_id', user.id)
    if (deleteError) {
      if (isMissingTradeMediaSchema(deleteError.message)) {
        tradeMediaMissing = true
      } else {
        return { success: false, mode: 'supabase' as const, message: `Trade-Medien konnten nicht aktualisiert werden. ${deleteError.message}` }
      }
    }

    if (!tradeMediaMissing && normalizedMedia.length) {
      const rows = normalizedMedia.map((item, index) => ({
        id: crypto.randomUUID(),
        trade_id: tradeId,
        user_id: user.id,
        storage_path: item.storagePath,
        public_url: item.publicUrl,
        file_name: item.fileName,
        mime_type: item.mimeType,
        byte_size: item.byteSize,
        sort_order: index,
        is_primary: index === 0,
      }))

      const { error: insertError } = await supabase.from('trade_media').insert(rows)
      if (insertError) {
        if (isMissingTradeMediaSchema(insertError.message)) {
          tradeMediaMissing = true
        } else {
          return { success: false, mode: 'supabase' as const, message: `Trade-Medien konnten nicht gespeichert werden. ${insertError.message}` }
        }
      }
    }

    const screenshotError = await updatePrimaryTradeScreenshot(supabase, tradeId, user.id, primaryUrl)
    if (screenshotError) {
      return { success: false, mode: 'supabase' as const, message: `Trade-Screenshot konnte nicht aktualisiert werden. ${screenshotError.message}` }
    }

    revalidateTradeSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      tradeId,
      message: tradeMediaMissing
        ? `${normalizedMedia.length ? 1 : 0} Haupt-Screenshot direkt am Trade gespeichert. Für Galerie und Mehrfachbilder bitte noch schema-patch-v56.13.sql ausführen.`
        : normalizedMedia.length
          ? `${normalizedMedia.length} Screenshot(s) am Trade gespeichert.`
          : 'Screenshots entfernt.',
    }
  } catch (error) {
    return { success: false, mode: 'supabase' as const, message: `Trade-Medien konnten nicht synchronisiert werden. ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}` }
  }
}


export async function removeTradeMediaItem(tradeId: string, publicUrl: string) {
  if (!tradeId.trim() || !publicUrl.trim()) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: 'Trade oder Bild-URL fehlt.',
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

    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('id, screenshot_url, market, setup')
      .eq('id', tradeId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (tradeError || !trade) {
      return { success: false, mode: 'supabase' as const, message: 'Trade nicht gefunden oder kein Zugriff.' }
    }

    const { data: mediaRows } = await supabase
      .from('trade_media')
      .select('id, storage_path, public_url, sort_order')
      .eq('trade_id', tradeId)
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    const matchingRows = (mediaRows ?? []).filter((row) => row.public_url === publicUrl)
    const storagePaths = matchingRows.map((row) => row.storage_path).filter(Boolean)

    if (matchingRows.length) {
      const { error: deleteMediaError } = await supabase
        .from('trade_media')
        .delete()
        .eq('trade_id', tradeId)
        .eq('user_id', user.id)
        .eq('public_url', publicUrl)

      if (deleteMediaError) {
        return { success: false, mode: 'supabase' as const, message: `Bild konnte nicht gelöscht werden. ${deleteMediaError.message}` }
      }
    }

    const remainingRows = (mediaRows ?? []).filter((row) => row.public_url !== publicUrl)
    const nextPrimaryUrl = remainingRows[0]?.public_url ?? (trade.screenshot_url === publicUrl ? null : trade.screenshot_url ?? null)

    const screenshotError = await updatePrimaryTradeScreenshot(supabase, tradeId, user.id, nextPrimaryUrl)
    if (screenshotError) {
      return { success: false, mode: 'supabase' as const, message: `Trade-Screenshot konnte nicht aktualisiert werden. ${screenshotError.message}` }
    }

    if (storagePaths.length && hasSupabaseServerEnv()) {
      const serviceSupabase = createSupabaseServerClient()
      await serviceSupabase.storage.from('equora-media').remove(storagePaths)
    }

    revalidateTradeSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      tradeId,
      message: matchingRows.length
        ? `Bild aus ${trade.market} · ${trade.setup} entfernt.`
        : 'Bild aus der Galerie entfernt.',
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

    let storagePaths: string[] = []

    const { data: mediaRows, error: mediaError } = await supabase
      .from('trade_media')
      .select('storage_path')
      .eq('trade_id', tradeId)
      .eq('user_id', user.id)

    if (!mediaError && mediaRows?.length) {
      storagePaths = mediaRows.map((row) => row.storage_path).filter(Boolean)
    }

    await supabase.from('shared_trade_submissions').delete().eq('trade_id', tradeId).eq('user_id', user.id)
    await supabase.from('trade_tags').delete().eq('trade_id', tradeId)
    await supabase.from('trade_media').delete().eq('trade_id', tradeId).eq('user_id', user.id)

    const { error: deleteError } = await supabase.from('trades').delete().eq('id', tradeId).eq('user_id', user.id)
    if (deleteError) {
      return { success: false, mode: 'supabase' as const, message: `Trade konnte nicht gelöscht werden. ${deleteError.message}` }
    }

    if (storagePaths.length && hasSupabaseServerEnv()) {
      const serviceSupabase = createSupabaseServerClient()
      await serviceSupabase.storage.from('equora-media').remove(storagePaths)
    }

    revalidateTradeSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      deletedId: tradeId,
      message: `Trade gelöscht: ${trade.market} · ${trade.setup}.`,
    }
  } catch (error) {
    return { success: false, mode: 'supabase' as const, message: `Trade konnte nicht gelöscht werden. ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}` }
  }
}

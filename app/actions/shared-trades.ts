'use server'

import { journalText, type JournalLocale } from '@/lib/i18n/journal'

import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isEquoraAdminUser } from '@/lib/server/admin'
import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { computeTradeMetrics, parseTradingNumber } from '@/lib/utils/calculations'
import { splitDraftItems, type SharedTradeShareMode, type SharedTradeStatus, type SharedTradeVisibility } from '@/lib/utils/trade-share'
import { extractTradeImportMeta } from '@/lib/utils/trade-import-meta'

function revalidateShareSurfaces() {
  revalidatePath('/share')
  revalidatePath('/trades')
  revalidatePath('/dashboard')
}

function toNumericField(value: string | number | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) return parseTradingNumber(value)
  return null
}

function deriveResultLabel(captureResult: string | null | undefined, netPnl: string | number | null | undefined) {
  if (captureResult === 'winner') return 'Gewinner'
  if (captureResult === 'loser') return 'Verlierer'
  if (captureResult === 'breakeven') return 'Breakeven'
  if (captureResult === 'open') return 'Offen'

  const pnl = toNumericField(netPnl)
  if (pnl === null) return 'Offen'
  if (pnl > 0) return 'Gewinner'
  if (pnl < 0) return 'Verlierer'
  return 'Breakeven'
}

export async function createTradeShareSubmission(input: {
  tradeId: string
  shareMode: SharedTradeShareMode
  visibility: SharedTradeVisibility
  userNote: string
  vaultOptIn: boolean
  submittedByName?: string
}, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  if (!input.tradeId.trim()) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: text('Bitte zuerst einen Trade auswählen.', 'Select a trade first.'),
    }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: true, mode: 'demo' as const, message: text('Demo: Das Teilen wurde simuliert.', 'Demo: sharing simulated.') }
  }
  if (!hasSupabaseServerEnv()) {
    return { success: false, mode: 'supabase' as const, message: text('Teilen ist derzeit nicht verfügbar.', 'Sharing is currently unavailable.') }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { success: false, mode: 'supabase' as const, message: text('Bitte zuerst einloggen.', 'Sign in to manage shared trades.') }

    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', input.tradeId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (tradeError || !trade) {
      return { success: false, mode: 'supabase' as const, message: text('Trade nicht gefunden oder kein Zugriff.', 'The trade is missing or you do not have access.') }
    }

    const { data: tagRows } = await supabase.from('trade_tags').select('tag').eq('trade_id', input.tradeId).order('created_at', { ascending: true })
    const tags = (tagRows ?? []).map((row: { tag: string }) => row.tag)
    const metrics = computeTradeMetrics({
      pnl: trade.net_pnl,
      pnlMode: trade.pnl_mode,
      costProfile: trade.cost_profile,
      brokerProfile: trade.broker_profile,
      rMultiple: trade.r_multiple,
      entry: trade.entry,
      stopLoss: trade.stop_loss,
      takeProfit: trade.take_profit,
      exit: trade.exit,
      bias: trade.bias,
      instrumentType: trade.instrument_type,
      positionSize: trade.position_size,
      pointValue: trade.point_value,
      fees: trade.fees,
      exchangeFees: trade.exchange_fees,
      fundingFees: trade.funding_fees,
      spreadCost: trade.spread_cost,
      slippage: trade.slippage,
      accountCurrency: trade.account_currency,
      riskPercent: trade.risk_percent,
      accountSize: trade.account_size,
      cryptoMarketType: trade.crypto_market_type,
      executionType: trade.execution_type,
      fundingDirection: trade.funding_direction,
      fundingRateBps: trade.funding_rate_bps,
      fundingIntervals: trade.funding_intervals,
      quoteAsset: trade.quote_asset,
      leverage: trade.leverage,
      partialExits: Array.isArray(trade.partial_exits) ? trade.partial_exits : [],
    })
    const timestamp = new Date().toISOString()
    const sanitizedName = input.visibility === 'named' ? input.submittedByName?.trim() || null : null
    const sharedNotes = extractTradeImportMeta(trade.notes).cleanNotes || null
    const sharePayload = {
      user_id: user.id,
      trade_id: trade.id,
      updated_at: timestamp,
      share_mode: input.shareMode,
      visibility: input.visibility,
      status: 'pending',
      user_note: input.userNote.trim() || null,
      vault_opt_in: input.vaultOptIn || input.shareMode === 'vault' || input.shareMode === 'both',
      submitted_by_name: sanitizedName,
      shared_market: trade.market,
      shared_setup: trade.setup,
      shared_result: deriveResultLabel(trade.capture_result, trade.net_pnl),
      shared_r_multiple: metrics.rSource === 'missing' ? null : metrics.rValue,
      shared_net_pnl: metrics.netPnL,
      shared_currency: metrics.accountCurrency,
      shared_capture_status: trade.capture_status ?? null,
      shared_capture_result: trade.capture_result ?? null,
      shared_notes: sharedNotes,
      shared_quality: trade.quality ?? null,
      shared_tags: tags,
      // Private journal media is never copied into a persistent share snapshot.
      // A future reviewed-vault flow must authorize and sign a media id explicitly.
      shared_screenshot_url: null,
      admin_note: null,
      coach_feedback: null,
      learning_category: null,
      review_labels: [],
      coach_strengths: [],
      coach_mistakes: [],
      coach_action: null,
      vault_blurb: null,
      featured_at: null,
      reviewed_at: null,
      reviewed_by: null,
    }

    const { data: existingSubmission } = await supabase
      .from('shared_trade_submissions')
      .select('id')
      .eq('trade_id', trade.id)
      .eq('user_id', user.id)
      .maybeSingle()

    const mutationClient = createSupabaseServerClient()
    if (existingSubmission?.id) {
      const { error: updateError } = await mutationClient
        .from('shared_trade_submissions')
        .update(sharePayload)
        .eq('id', existingSubmission.id)
        .eq('user_id', user.id)

      if (updateError) {
        return { success: false, mode: 'supabase' as const, message: text('Der Trade konnte nicht erneut gesendet werden.', 'Could not resend the trade.') }
      }
    } else {
      const { error: insertError } = await mutationClient.from('shared_trade_submissions').insert({
        id: crypto.randomUUID(),
        created_at: timestamp,
        ...sharePayload,
      })

      if (insertError) {
        return { success: false, mode: 'supabase' as const, message: text('Der Trade konnte nicht gesendet werden.', 'Could not submit the trade.') }
      }
    }

    revalidateShareSurfaces()
    return { success: true, mode: 'supabase' as const, message: text('Der Trade wurde eingereicht.', 'Trade submitted.') }
  } catch {
    return { success: false, mode: 'supabase' as const, message: text('Der Trade konnte nicht gesendet werden.', 'Could not submit the trade.') }
  }
}

export async function revokeTradeShareSubmission(submissionId: string, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  if (!submissionId.trim()) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: text('Wähle zuerst einen Beitrag.', 'Select a submission first.'),
    }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: true, mode: 'demo' as const, message: text('Demo: Das Zurückziehen wurde simuliert.', 'Demo: withdrawal simulated.') }
  }
  if (!hasSupabaseServerEnv()) {
    return { success: false, mode: 'supabase' as const, message: text('Teilen ist derzeit nicht verfügbar.', 'Sharing is currently unavailable.') }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { success: false, mode: 'supabase' as const, message: text('Bitte zuerst einloggen.', 'Sign in to manage shared trades.') }

    const { error } = await createSupabaseServerClient()
      .from('shared_trade_submissions')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', submissionId)
      .eq('user_id', user.id)

    if (error) {
      return { success: false, mode: 'supabase' as const, message: text('Der Beitrag konnte nicht zurückgezogen werden.', 'Could not withdraw the submission.') }
    }

    revalidateShareSurfaces()
    return { success: true, mode: 'supabase' as const, message: text('Der Beitrag wurde zurückgezogen.', 'Submission withdrawn.') }
  } catch {
    return { success: false, mode: 'supabase' as const, message: text('Der Beitrag konnte nicht zurückgezogen werden.', 'Could not withdraw the submission.') }
  }
}

export async function updateSharedTradeSubmissionByAdmin(input: {
  submissionId: string
  status: SharedTradeStatus
  adminNote: string
  coachFeedback: string
  learningCategory: string
  reviewLabels: string
  coachStrengths: string
  coachMistakes: string
  coachAction: string
  vaultBlurb: string
}, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  if (!input.submissionId.trim()) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: text('Wähle zuerst einen Beitrag.', 'Select a submission first.'),
    }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: false,
      mode: 'demo' as const,
      message: text('In der Demo lassen sich Beiträge nicht prüfen.', 'Admin review is unavailable in demo mode.'),
    }
  }
  if (!hasSupabaseServerEnv()) {
    return { success: false, mode: 'supabase' as const, message: text('Teilen ist derzeit nicht verfügbar.', 'Sharing is currently unavailable.') }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!(await isEquoraAdminUser(user))) {
      return { success: false, mode: 'supabase' as const, message: text('Nur Equora Admins können diesen Status ändern.', 'Only Equora admins can change this status.') }
    }

    const timestamp = new Date().toISOString()
    const normalizedStatus = input.status
    const { error } = await createSupabaseServerClient()
      .from('shared_trade_submissions')
      .update({
        status: normalizedStatus,
        admin_note: input.adminNote.trim() || null,
        coach_feedback: input.coachFeedback.trim() || null,
        learning_category: input.learningCategory.trim() || null,
        review_labels: splitDraftItems(input.reviewLabels),
        coach_strengths: splitDraftItems(input.coachStrengths),
        coach_mistakes: splitDraftItems(input.coachMistakes),
        coach_action: input.coachAction.trim() || null,
        vault_blurb: input.vaultBlurb.trim() || null,
        featured_at: normalizedStatus === 'featured' ? timestamp : null,
        reviewed_at: timestamp,
        reviewed_by: user?.email ?? null,
        updated_at: timestamp,
      })
      .eq('id', input.submissionId)

    if (error) {
      return { success: false, mode: 'supabase' as const, message: text('Das Feedback konnte nicht gespeichert werden.', 'Could not save the review.') }
    }

    revalidateShareSurfaces()
    return { success: true, mode: 'supabase' as const, message: text('Feedback gespeichert.', 'Review saved.') }
  } catch {
    return { success: false, mode: 'supabase' as const, message: text('Die Änderungen konnten nicht gespeichert werden.', 'Could not save the review changes.') }
  }
}

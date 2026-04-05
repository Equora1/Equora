'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { isEquoraAdminUser } from '@/lib/server/admin'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { parseTradingNumber } from '@/lib/utils/calculations'
import { splitDraftItems, type SharedTradeShareMode, type SharedTradeStatus, type SharedTradeVisibility } from '@/lib/utils/trade-share'

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
}) {
  if (!input.tradeId.trim()) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: 'Bitte zuerst einen Trade auswählen.',
    }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: true, mode: 'demo' as const, message: 'Demo-Modus: Vault Submission wurde nur lokal simuliert.' }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { success: false, mode: 'supabase' as const, message: 'Bitte zuerst einloggen.' }

    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', input.tradeId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (tradeError || !trade) {
      return { success: false, mode: 'supabase' as const, message: 'Trade nicht gefunden oder kein Zugriff.' }
    }

    const { data: tagRows } = await supabase.from('trade_tags').select('tag').eq('trade_id', input.tradeId).order('created_at', { ascending: true })
    const tags = (tagRows ?? []).map((row: { tag: string }) => row.tag)
    const timestamp = new Date().toISOString()
    const sanitizedName = input.visibility === 'named' ? input.submittedByName?.trim() || null : null
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
      shared_r_multiple: toNumericField(trade.r_multiple),
      shared_net_pnl: toNumericField(trade.net_pnl),
      shared_capture_status: trade.capture_status ?? null,
      shared_capture_result: trade.capture_result ?? null,
      shared_notes: trade.notes ?? null,
      shared_quality: trade.quality ?? null,
      shared_tags: tags,
      shared_screenshot_url: trade.screenshot_url ?? null,
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

    if (existingSubmission?.id) {
      const { error: updateError } = await supabase
        .from('shared_trade_submissions')
        .update(sharePayload)
        .eq('id', existingSubmission.id)
        .eq('user_id', user.id)

      if (updateError) {
        return { success: false, mode: 'supabase' as const, message: 'Trade konnte nicht erneut in die Equora Vault gesendet werden.' }
      }
    } else {
      const { error: insertError } = await supabase.from('shared_trade_submissions').insert({
        id: crypto.randomUUID(),
        created_at: timestamp,
        ...sharePayload,
      })

      if (insertError) {
        return { success: false, mode: 'supabase' as const, message: 'Trade konnte nicht in die Equora Vault gesendet werden.' }
      }
    }

    revalidateShareSurfaces()
    return { success: true, mode: 'supabase' as const, message: 'Trade wurde an Equora Vault / Review übergeben.' }
  } catch {
    return { success: false, mode: 'supabase' as const, message: 'Trade konnte nicht in die Equora Vault gesendet werden.' }
  }
}

export async function revokeTradeShareSubmission(submissionId: string) {
  if (!submissionId.trim()) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: 'Submission-ID fehlt.',
    }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: true, mode: 'demo' as const, message: 'Demo-Modus: Vault Submission wurde als zurückgezogen markiert.' }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { success: false, mode: 'supabase' as const, message: 'Bitte zuerst einloggen.' }

    const { error } = await supabase
      .from('shared_trade_submissions')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', submissionId)
      .eq('user_id', user.id)

    if (error) {
      return { success: false, mode: 'supabase' as const, message: 'Submission konnte nicht zurückgezogen werden.' }
    }

    revalidateShareSurfaces()
    return { success: true, mode: 'supabase' as const, message: 'Submission wurde zurückgezogen.' }
  } catch {
    return { success: false, mode: 'supabase' as const, message: 'Submission konnte nicht zurückgezogen werden.' }
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
}) {
  if (!input.submissionId.trim()) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: 'Submission-ID fehlt.',
    }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: false,
      mode: 'demo' as const,
      message: 'Admin-Zugriff ist noch nicht mit Supabase verbunden.',
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!(await isEquoraAdminUser(user))) {
      return { success: false, mode: 'supabase' as const, message: 'Nur Equora Admins können diesen Status ändern.' }
    }

    const timestamp = new Date().toISOString()
    const normalizedStatus = input.status
    const { error } = await supabase
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
      return { success: false, mode: 'supabase' as const, message: 'Admin-Review konnte nicht gespeichert werden.' }
    }

    revalidateShareSurfaces()
    return { success: true, mode: 'supabase' as const, message: 'Admin-Review gespeichert.' }
  } catch {
    return { success: false, mode: 'supabase' as const, message: 'Admin-Update konnte nicht gespeichert werden.' }
  }
}

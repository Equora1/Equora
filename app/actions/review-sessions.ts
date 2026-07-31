'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { mapReviewSessionRow } from '@/lib/server/review-sessions'
import type { ReviewSessionRow } from '@/lib/types/db'
import type {
  SaveReviewSessionInput,
  SavedReviewSession,
  UpdateReviewSessionInput,
} from '@/lib/types/review-session'

function normalizeLabels(values?: string[]) {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)))
}

function buildMockSession(input: SaveReviewSessionInput): SavedReviewSession {
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    note: input.note?.trim() ?? '',
    createdAt: new Date().toISOString(),
    focusTitle: input.focusTitle ?? null,
    focusDescription: input.focusDescription ?? null,
    chips: Array.from(new Set((input.chips ?? []).map((chip) => chip.trim()).filter(Boolean))),
    labels: normalizeLabels(input.labels),
    tradeIds: Array.from(new Set(input.tradeIds.map((tradeId) => tradeId.trim()).filter(Boolean))),
    tradeCount: Math.max(0, input.tradeCount),
    visibleTradeCount: Math.max(0, input.visibleTradeCount),
    netPnL: input.netPnL ?? 0,
    averageR: input.averageR ?? 0,
    winRate: input.winRate ?? 0,
    winners: input.winners ?? 0,
    losers: input.losers ?? 0,
    breakeven: input.breakeven ?? 0,
    topTags: Array.from(new Set((input.topTags ?? []).map((tag) => tag.trim()).filter(Boolean))),
    bestTradeId: input.bestTradeId ?? null,
    worstTradeId: input.worstTradeId ?? null,
    sessionType: input.sessionType ?? 'spotlight',
    sessionStatus: input.sessionStatus ?? 'open',
    isPinned: Boolean(input.isPinned),
    periodPreset: input.periodPreset ?? null,
    periodLabel: input.periodLabel ?? null,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    source: 'mock',
  }
}

export async function saveReviewSession(
  input: SaveReviewSessionInput,
): Promise<{ success: boolean; message: string; session?: SavedReviewSession }> {
  const title = input.title.trim()
  const tradeIds = Array.from(new Set(input.tradeIds.map((tradeId) => tradeId.trim()).filter(Boolean)))
  const labels = normalizeLabels(input.labels)

  if (!title) {
    return { success: false, message: 'Bitte einen Titel für das Mini-Review vergeben.' }
  }

  if (tradeIds.length === 0) {
    return { success: false, message: 'Es gibt keine Spotlight-Trades zum Speichern.' }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      message: `Demo-Flow aktiv. Mini-Review „${title}“ lokal bereit zum Sichern.`,
      session: buildMockSession({ ...input, title, tradeIds, labels }),
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Bitte zuerst einloggen.' }
    }

    const payload = {
      user_id: user.id,
      title,
      note: input.note?.trim() || null,
      focus_title: input.focusTitle?.trim() || null,
      focus_description: input.focusDescription?.trim() || null,
      chips: Array.from(new Set((input.chips ?? []).map((chip) => chip.trim()).filter(Boolean))),
      labels,
      trade_ids: tradeIds,
      trade_count: Math.max(tradeIds.length, input.tradeCount),
      visible_trade_count: Math.max(0, input.visibleTradeCount),
      net_pnl: input.netPnL ?? 0,
      average_r: input.averageR ?? 0,
      win_rate: input.winRate ?? 0,
      winners: input.winners ?? 0,
      losers: input.losers ?? 0,
      breakeven: input.breakeven ?? 0,
      top_tags: Array.from(new Set((input.topTags ?? []).map((tag) => tag.trim()).filter(Boolean))),
      best_trade_id: input.bestTradeId ?? null,
      worst_trade_id: input.worstTradeId ?? null,
      session_type: input.sessionType ?? 'spotlight',
      session_status: input.sessionStatus ?? 'open',
      is_pinned: Boolean(input.isPinned),
      period_preset: input.periodPreset ?? null,
      period_label: input.periodLabel?.trim() || null,
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
    }

    const { data, error } = await supabase.from('review_sessions').insert(payload).select('*').single()

    if (error || !data) {
      return { success: false, message: 'Mini-Review konnte nicht gespeichert werden.' }
    }

    revalidatePath('/trades')
    revalidatePath('/review')
    revalidatePath('/review-sessions')

    return {
      success: true,
      message: `Mini-Review „${title}“ gespeichert.`,
      session: mapReviewSessionRow(data as ReviewSessionRow, 'supabase'),
    }
  } catch {
    return { success: false, message: 'Mini-Review konnte nicht gespeichert werden.' }
  }
}

export async function updateReviewSession(
  sessionId: string,
  input: UpdateReviewSessionInput,
): Promise<{ success: boolean; message: string; session?: SavedReviewSession }> {
  const title = input.title.trim()

  if (!title) {
    return { success: false, message: 'Bitte einen Titel für das Mini-Review vergeben.' }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: false, message: 'Demo-Flow aktiv. Lokale Sessions werden direkt im Browser aktualisiert.' }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Bitte zuerst einloggen.' }
    }

    const { data, error } = await supabase
      .from('review_sessions')
      .update({
        title,
        note: input.note?.trim() || null,
        labels: normalizeLabels(input.labels),
        session_status: input.sessionStatus ?? 'open',
        is_pinned: Boolean(input.isPinned),
      })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (error || !data) {
      return { success: false, message: 'Mini-Review konnte nicht aktualisiert werden.' }
    }

    revalidatePath('/trades')
    revalidatePath('/review')
    revalidatePath('/review-sessions')

    return {
      success: true,
      message: `Mini-Review „${title}“ aktualisiert.`,
      session: mapReviewSessionRow(data as ReviewSessionRow, 'supabase'),
    }
  } catch {
    return { success: false, message: 'Mini-Review konnte nicht aktualisiert werden.' }
  }
}

export async function deleteReviewSession(
  sessionId: string,
): Promise<{ success: boolean; message: string; deletedId?: string }> {
  if (!sessionId.trim()) {
    return { success: false, message: 'Es wurde keine Session zum Löschen übergeben.' }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: false, message: 'Demo-Flow aktiv. Lokale Sessions werden direkt im Browser entfernt.' }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Bitte zuerst einloggen.' }
    }

    const { error } = await supabase.from('review_sessions').delete().eq('id', sessionId).eq('user_id', user.id)

    if (error) {
      return { success: false, message: 'Mini-Review konnte nicht gelöscht werden.' }
    }

    revalidatePath('/trades')
    revalidatePath('/review')
    revalidatePath('/review-sessions')

    return {
      success: true,
      message: 'Mini-Review gelöscht.',
      deletedId: sessionId,
    }
  } catch {
    return { success: false, message: 'Mini-Review konnte nicht gelöscht werden.' }
  }
}

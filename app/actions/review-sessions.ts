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
import { normalizeTradeCurrency } from '@/lib/utils/currency'

function normalizeLabels(values?: string[]) {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)))
}

function buildMockSession(input: SaveReviewSessionInput): SavedReviewSession {
  const currency = input.monetaryScopeKind === 'single' ? normalizeTradeCurrency(input.currency) : null
  const monetaryScopeKind = input.monetaryScopeKind === 'single' && currency
    ? 'single'
    : input.monetaryScopeKind === 'empty' || input.monetaryScopeKind === 'mixed'
      ? input.monetaryScopeKind
      : 'unknown'

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
    currency,
    monetaryScopeKind,
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
  const currency = input.monetaryScopeKind === 'single' ? normalizeTradeCurrency(input.currency) : null

  if (!hasSupabaseClientEnv() && input.monetaryScopeKind === 'single' && !currency) {
    return { success: false, message: 'Die Review-Session hat keine unterstützte Währung und wurde nicht gespeichert.' }
  }

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

    const sessionId = crypto.randomUUID()
    const meta = {
      title,
      note: input.note?.trim() || null,
      focusTitle: input.focusTitle?.trim() || null,
      focusDescription: input.focusDescription?.trim() || null,
      chips: Array.from(new Set((input.chips ?? []).map((chip) => chip.trim()).filter(Boolean))),
      labels,
      sessionType: input.sessionType ?? 'spotlight',
      sessionStatus: input.sessionStatus ?? 'open',
      isPinned: Boolean(input.isPinned),
      periodPreset: input.periodPreset ?? null,
      periodLabel: input.periodLabel?.trim() || null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
    }

    const { error: saveError } = await supabase.rpc('equora_save_review_session_v1', {
      p_session_id: sessionId,
      p_trade_ids: tradeIds,
      p_meta: meta,
    })

    if (saveError) {
      return { success: false, message: 'Mini-Review konnte nicht aus den serverseitigen Trade-Daten erzeugt werden.' }
    }

    const { data, error } = await supabase
      .from('review_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

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

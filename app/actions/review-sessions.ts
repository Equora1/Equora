'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { normalizeReviewTradeIds, saveTrustedReviewSnapshot, ReviewSnapshotCommitError } from '@/lib/server/review-snapshot-save'
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
    averageR: null,
    legacyAverageR: input.averageR ?? null,
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
  const title = typeof input?.title === 'string' ? input.title.trim() : ''
  if (!Array.isArray(input?.tradeIds) || input.tradeIds.some((id) => typeof id !== 'string')
    || (input.labels !== undefined && (!Array.isArray(input.labels) || input.labels.some((label) => typeof label !== 'string')))) {
    return { success: false, message: 'Die Auswahl konnte nicht gelesen werden. Bitte lade die Ansicht neu.' }
  }
  const tradeIds = Array.from(new Set(input.tradeIds.map((tradeId) => tradeId.trim()).filter(Boolean)))
  const labels = normalizeLabels(input.labels)
  const currency = input.monetaryScopeKind === 'single' ? normalizeTradeCurrency(input.currency) : null

  if (!hasSupabaseClientEnv() && input.monetaryScopeKind === 'single' && !currency) {
    return { success: false, message: 'Die Review-Session hat keine unterstützte Währung und wurde nicht gespeichert.' }
  }

  if (!title) {
    return { success: false, message: 'Bitte einen Titel für das Review vergeben.' }
  }

  if (tradeIds.length === 0) {
    return { success: false, message: 'Es gibt keine ausgewählten Trades zum Speichern.' }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      message: `Demo-Modus: Review „${title}“ lokal bereit zum Sichern.`,
      session: buildMockSession({ ...input, title, tradeIds, labels }),
    }
  }

  try {
    if (!hasSupabaseServerEnv()) return { success: false, message: 'Reviews können derzeit nicht gespeichert werden. Bitte später erneut versuchen.' }
    const selectedIds = normalizeReviewTradeIds(tradeIds)
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
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

    const data = await saveTrustedReviewSnapshot(createSupabaseServerClient(), user.id, sessionId, selectedIds, meta)

    revalidatePath('/trades')
    revalidatePath('/review')
    revalidatePath('/review-sessions')

    return {
      success: true,
      message: `Review „${title}“ gespeichert.`,
      session: mapReviewSessionRow(data as ReviewSessionRow, 'supabase'),
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_REVIEW_SCOPE') return { success: false,
      message: 'Bitte wähle höchstens 2.000 Trades für ein Review aus. Lade die Ansicht neu, falls die Auswahl nicht mehr verfügbar ist.' }
    if (error instanceof ReviewSnapshotCommitError) return { success: false, message: error.sourceChanged
      ? 'Die Trade-Daten wurden inzwischen geändert. Bitte lade das Review neu.'
      : 'Das Speicherergebnis konnte nicht bestätigt werden. Bitte prüfe zuerst die Review-Sammlung.' }
    return { success: false, message: 'Review konnte nicht gespeichert werden. Bitte lade die Ansicht neu und versuche es erneut.' }
  }
}

export async function updateReviewSession(
  sessionId: string,
  input: UpdateReviewSessionInput,
): Promise<{ success: boolean; message: string; session?: SavedReviewSession }> {
  const title = input.title.trim()

  if (!title) {
    return { success: false, message: 'Bitte einen Titel für das Review vergeben.' }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: false, message: 'Demo-Modus: Lokale Reviews werden direkt im Browser aktualisiert.' }
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
      return { success: false, message: 'Review konnte nicht aktualisiert werden.' }
    }

    revalidatePath('/trades')
    revalidatePath('/review')
    revalidatePath('/review-sessions')

    return {
      success: true,
      message: `Review „${title}“ aktualisiert.`,
      session: mapReviewSessionRow(data as ReviewSessionRow, 'supabase'),
    }
  } catch {
    return { success: false, message: 'Review konnte nicht aktualisiert werden.' }
  }
}

export async function deleteReviewSession(
  sessionId: string,
): Promise<{ success: boolean; message: string; deletedId?: string }> {
  if (!sessionId.trim()) {
    return { success: false, message: 'Es wurde keine Session zum Löschen übergeben.' }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: false, message: 'Demo-Modus: Lokale Reviews werden direkt im Browser entfernt.' }
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
      return { success: false, message: 'Review konnte nicht gelöscht werden.' }
    }

    revalidatePath('/trades')
    revalidatePath('/review')
    revalidatePath('/review-sessions')

    return {
      success: true,
      message: 'Review gelöscht.',
      deletedId: sessionId,
    }
  } catch {
    return { success: false, message: 'Review konnte nicht gelöscht werden.' }
  }
}

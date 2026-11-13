'use server'

import { journalText, type JournalLocale } from '@/lib/i18n/journal'

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
  locale: JournalLocale = 'de',
): Promise<{ success: boolean; message: string; session?: SavedReviewSession }> {
  const text = journalText(locale)
  const title = typeof input?.title === 'string' ? input.title.trim() : ''
  if (!Array.isArray(input?.tradeIds) || input.tradeIds.some((id) => typeof id !== 'string')
    || (input.labels !== undefined && (!Array.isArray(input.labels) || input.labels.some((label) => typeof label !== 'string')))) {
    return { success: false, message: text('Die Auswahl konnte nicht gelesen werden. Bitte lade die Ansicht neu.', 'The selection could not be read. Reload the page.') }
  }
  const tradeIds = Array.from(new Set(input.tradeIds.map((tradeId) => tradeId.trim()).filter(Boolean)))
  const labels = normalizeLabels(input.labels)
  const currency = input.monetaryScopeKind === 'single' ? normalizeTradeCurrency(input.currency) : null

  if (!hasSupabaseClientEnv() && input.monetaryScopeKind === 'single' && !currency) {
    return { success: false, message: text('Die Review-Session hat keine unterstützte Währung und wurde nicht gespeichert.', 'Choose a supported currency before saving this review.') }
  }

  if (!title) {
    return { success: false, message: text('Bitte einen Titel für das Review vergeben.', 'Enter a title for the review.') }
  }

  if (tradeIds.length === 0) {
    return { success: false, message: text('Es gibt keine ausgewählten Trades zum Speichern.', 'Select trades before saving a review.') }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      message: text(`Demo-Modus: Review „${title}“ lokal bereit zum Sichern.`, `Demo review “${title}” is ready to save locally.`),
      session: buildMockSession({ ...input, title, tradeIds, labels }),
    }
  }

  try {
    if (!hasSupabaseServerEnv()) return { success: false, message: text('Reviews können derzeit nicht gespeichert werden. Bitte später erneut versuchen.', 'Reviews cannot be saved right now. Try again later.') }
    const selectedIds = normalizeReviewTradeIds(tradeIds)
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, message: text('Bitte zuerst einloggen.', 'Sign in to manage your reviews.') }
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
      message: text(`Review „${title}“ gespeichert.`, `Review “${title}” saved.`),
      session: mapReviewSessionRow(data as ReviewSessionRow, 'supabase'),
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_REVIEW_SCOPE') return { success: false,
      message: text('Bitte wähle höchstens 2.000 Trades für ein Review aus. Lade die Ansicht neu, falls die Auswahl nicht mehr verfügbar ist.', 'Select up to 2,000 trades for a review. Reload the page if the selection is no longer available.') }
    if (error instanceof ReviewSnapshotCommitError) return { success: false, message: error.sourceChanged
      ? text('Die Trade-Daten wurden inzwischen geändert. Bitte lade das Review neu.', 'The trades have changed. Reload the review.')
      : text('Das Speicherergebnis konnte nicht bestätigt werden. Bitte prüfe zuerst die Review-Sammlung.', 'Saving could not be confirmed. Check your review collections first.') }
    return { success: false, message: text('Review konnte nicht gespeichert werden. Bitte lade die Ansicht neu und versuche es erneut.', 'The review could not be saved. Reload the page and try again.') }
  }
}

export async function updateReviewSession(
  sessionId: string,
  input: UpdateReviewSessionInput,
  locale: JournalLocale = 'de',
): Promise<{ success: boolean; message: string; session?: SavedReviewSession }> {
  const text = journalText(locale)
  const title = input.title.trim()

  if (!title) {
    return { success: false, message: text('Bitte einen Titel für das Review vergeben.', 'Enter a title for the review.') }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: false, message: text('Demo-Modus: Lokale Reviews werden direkt im Browser aktualisiert.', 'Demo reviews are updated in your browser.') }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: text('Bitte zuerst einloggen.', 'Sign in to manage your reviews.') }
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
      return { success: false, message: text('Review konnte nicht aktualisiert werden.', 'The review could not be updated.') }
    }

    revalidatePath('/trades')
    revalidatePath('/review')
    revalidatePath('/review-sessions')

    return {
      success: true,
      message: text(`Review „${title}“ aktualisiert.`, `Review “${title}” updated.`),
      session: mapReviewSessionRow(data as ReviewSessionRow, 'supabase'),
    }
  } catch {
    return { success: false, message: text('Review konnte nicht aktualisiert werden.', 'The review could not be updated.') }
  }
}

export async function deleteReviewSession(
  sessionId: string,
  locale: JournalLocale = 'de',
): Promise<{ success: boolean; message: string; deletedId?: string }> {
  const text = journalText(locale)
  if (!sessionId.trim()) {
    return { success: false, message: text('Es wurde keine Session zum Löschen übergeben.', 'Select a review to delete.') }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: false, message: text('Demo-Modus: Lokale Reviews werden direkt im Browser entfernt.', 'Demo reviews are deleted in your browser.') }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: text('Bitte zuerst einloggen.', 'Sign in to manage your reviews.') }
    }

    const { error } = await supabase.from('review_sessions').delete().eq('id', sessionId).eq('user_id', user.id)

    if (error) {
      return { success: false, message: text('Review konnte nicht gelöscht werden.', 'The review could not be deleted.') }
    }

    revalidatePath('/trades')
    revalidatePath('/review')
    revalidatePath('/review-sessions')

    return {
      success: true,
      message: text('Review gelöscht.', 'Review deleted.'),
      deletedId: sessionId,
    }
  } catch {
    return { success: false, message: text('Review konnte nicht gelöscht werden.', 'The review could not be deleted.') }
  }
}

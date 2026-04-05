'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import type { DailyNoteRow } from '@/lib/types/db'
import { composeDailyNoteStorage, parseDailyNoteStorage, type DailyFocusStatus } from '@/lib/utils/daily-notes'

export type SaveDailyNoteInput = {
  tradeDate: string
  title?: string
  note?: string
  mood?: string
  focus?: string
}

export async function saveDailyNote(
  input: SaveDailyNoteInput,
): Promise<{ success: boolean; message: string; note?: DailyNoteRow | null }> {
  const tradeDate = input.tradeDate.trim()
  const title = input.title?.trim() || null
  const visibleNote = input.note?.trim() || null
  const mood = input.mood?.trim() || null
  const focus = input.focus?.trim() || null

  if (!tradeDate) {
    return { success: false, message: 'Bitte zuerst ein Datum für die Daily Note wählen.' }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: false, message: 'Daily Notes werden im Live-Flow mit Supabase gespeichert. Im Demo-Modus bleibt dieser Schritt read-only.' }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Bitte zuerst einloggen.' }
    }

    const { data: existingRow, error: existingError } = await supabase
      .from('daily_notes')
      .select('*')
      .eq('user_id', user.id)
      .eq('trade_date', tradeDate)
      .maybeSingle()

    if (existingError) {
      return { success: false, message: 'Bestehende Daily Note konnte nicht geprüft werden.' }
    }

    const existingMeta = parseDailyNoteStorage(existingRow?.note)
    const note = composeDailyNoteStorage(visibleNote, {
      focusStatus: existingMeta.focusStatus,
      focusReflection: existingMeta.focusReflection,
    })

    const isEffectivelyEmpty = !title && !note && !mood && !focus

    if (isEffectivelyEmpty) {
      if (existingRow?.id) {
        const { error: deleteError } = await supabase.from('daily_notes').delete().eq('id', existingRow.id).eq('user_id', user.id)
        if (deleteError) {
          return { success: false, message: 'Leere Daily Note konnte nicht entfernt werden.' }
        }

        revalidateDailyNotePaths()
        return { success: true, message: `Daily Note für ${tradeDate} entfernt.`, note: null }
      }

      return { success: false, message: 'Bitte mindestens Titel, Fokus, Stimmung oder Notiz eintragen.' }
    }

    if (existingRow?.id) {
      const { data, error } = await supabase
        .from('daily_notes')
        .update({ title, note, mood, focus })
        .eq('id', existingRow.id)
        .eq('user_id', user.id)
        .select('*')
        .single()

      if (error || !data) {
        return { success: false, message: 'Daily Note konnte nicht aktualisiert werden.' }
      }

      revalidateDailyNotePaths()
      return { success: true, message: `Daily Note für ${tradeDate} aktualisiert.`, note: data as DailyNoteRow }
    }

    const { data, error } = await supabase
      .from('daily_notes')
      .insert({
        user_id: user.id,
        trade_date: tradeDate,
        title,
        note,
        mood,
        focus,
      })
      .select('*')
      .single()

    if (error || !data) {
      return { success: false, message: 'Daily Note konnte nicht gespeichert werden.' }
    }

    revalidateDailyNotePaths()
    return { success: true, message: `Daily Note für ${tradeDate} gespeichert.`, note: data as DailyNoteRow }
  } catch {
    return { success: false, message: 'Daily Note konnte nicht gespeichert werden.' }
  }
}

export async function setDailyFocusStatus(
  input: { tradeDate: string; status: DailyFocusStatus; reflection?: string | null },
): Promise<{ success: boolean; message: string; note?: DailyNoteRow | null }> {
  const tradeDate = input.tradeDate.trim()
  const reflection = input.reflection?.trim() || null

  if (!tradeDate) {
    return { success: false, message: 'Bitte zuerst ein Datum für den Fokus-Check wählen.' }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: false, message: 'Fokus-Checks sind im Demo-Modus read-only.' }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Bitte zuerst einloggen.' }
    }

    const { data: existingRow, error: existingError } = await supabase
      .from('daily_notes')
      .select('*')
      .eq('user_id', user.id)
      .eq('trade_date', tradeDate)
      .maybeSingle()

    if (existingError) {
      return { success: false, message: 'Fokus-Status konnte nicht geladen werden.' }
    }

    const parsed = parseDailyNoteStorage(existingRow?.note)
    const note = composeDailyNoteStorage(parsed.visibleNote, {
      focusStatus: input.status,
      focusReflection: reflection ?? parsed.focusReflection,
    })

    if (existingRow?.id) {
      const { data, error } = await supabase
        .from('daily_notes')
        .update({ note })
        .eq('id', existingRow.id)
        .eq('user_id', user.id)
        .select('*')
        .single()

      if (error || !data) {
        return { success: false, message: 'Fokus-Status konnte nicht gespeichert werden.' }
      }

      revalidateDailyNotePaths()
      return { success: true, message: `Fokus für ${tradeDate}: ${input.status}.`, note: data as DailyNoteRow }
    }

    const { data, error } = await supabase
      .from('daily_notes')
      .insert({
        user_id: user.id,
        trade_date: tradeDate,
        note,
      })
      .select('*')
      .single()

    if (error || !data) {
      return { success: false, message: 'Fokus-Status konnte nicht gespeichert werden.' }
    }

    revalidateDailyNotePaths()
    return { success: true, message: `Fokus für ${tradeDate}: ${input.status}.`, note: data as DailyNoteRow }
  } catch {
    return { success: false, message: 'Fokus-Status konnte nicht gespeichert werden.' }
  }
}

export async function deleteDailyNote(
  tradeDate: string,
): Promise<{ success: boolean; message: string }> {
  const normalizedDate = tradeDate.trim()

  if (!normalizedDate) {
    return { success: false, message: 'Bitte zuerst ein Datum übergeben.' }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: false, message: 'Daily Notes sind im Demo-Modus read-only.' }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Bitte zuerst einloggen.' }
    }

    const { error } = await supabase.from('daily_notes').delete().eq('user_id', user.id).eq('trade_date', normalizedDate)

    if (error) {
      return { success: false, message: 'Daily Note konnte nicht gelöscht werden.' }
    }

    revalidateDailyNotePaths()
    return { success: true, message: `Daily Note für ${normalizedDate} gelöscht.` }
  } catch {
    return { success: false, message: 'Daily Note konnte nicht gelöscht werden.' }
  }
}

function revalidateDailyNotePaths() {
  revalidatePath('/dashboard')
  revalidatePath('/review')
  revalidatePath('/kalender')
  revalidatePath('/daily-note')
  revalidatePath('/trades')
}

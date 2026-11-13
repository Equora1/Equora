'use server'

import { journalText, type JournalLocale } from '@/lib/i18n/journal'

import { revalidatePath } from 'next/cache'
import { isEquoraAdminUser } from '@/lib/server/admin'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import type { CreateSetupSuggestionInput, SetupSuggestionStatus } from '@/lib/types/setup-suggestion'

function splitLines(value: string | undefined) {
  return Array.from(
    new Set(
      (value ?? '')
        .split(/\n|,/g)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function revalidateSetupSuggestionSurfaces() {
  revalidatePath('/setups')
}

export async function createSetupSuggestion(input: CreateSetupSuggestionInput, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  const title = input.title.trim()
  if (!title) {
    return { success: false, message: text('Bitte gib deinem Vorschlag einen Namen.', 'Enter a name for your suggestion.') }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: true, message: text(`Demo-Modus: Vorschlag „${title}“ vorbereitet.`, `Demo: suggestion “${title}” prepared.`) }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) return { success: false, message: text('Bitte zuerst einloggen.', 'Sign in to send a suggestion.') }

    const timestamp = new Date().toISOString()
    const { error } = await supabase.from('setup_suggestions').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      created_at: timestamp,
      updated_at: timestamp,
      status: 'pending',
      title,
      category: input.category?.trim() || null,
      description: input.description?.trim() || null,
      entry: input.entry?.trim() || null,
      exit: input.exit?.trim() || null,
      invalidation: input.invalidation?.trim() || null,
      checklist: splitLines(input.checklist),
      mistakes: splitLines(input.mistakes),
      admin_note: null,
      reviewed_at: null,
      reviewed_by: null,
    })

    if (error) {
      const normalized = error.message.toLowerCase()
      if (normalized.includes('setup_suggestions')) {
        return { success: false, message: text('Die Vorschlags-Struktur fehlt noch in Supabase. Bitte `supabase/schema-patch-v57.17.sql` ausführen.', 'Suggestions are currently unavailable.') }
      }
      return { success: false, message: text('Vorschlag konnte nicht gespeichert werden.', 'Could not save the suggestion.') }
    }

    revalidateSetupSuggestionSurfaces()
    return { success: true, message: text('Vorschlag gesendet. Admins können ihn prüfen.', 'Suggestion sent for review.') }
  } catch {
    return { success: false, message: text('Vorschlag konnte nicht gespeichert werden.', 'Could not save the suggestion.') }
  }
}

export async function updateSetupSuggestionByAdmin(input: { suggestionId: string; status: SetupSuggestionStatus; adminNote?: string }, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  if (!input.suggestionId.trim()) return { success: false, message: text('Vorschlag fehlt.', 'Select a suggestion first.') }
  if (!['pending', 'accepted', 'rejected', 'archived'].includes(input.status)) return { success: false, message: text('Status ist ungültig.', 'Choose a valid suggestion status.') }

  if (!hasSupabaseClientEnv()) {
    return { success: false, message: text('Admin-Prüfung braucht Supabase.', 'Reviewing suggestions is unavailable in demo mode.') }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!(await isEquoraAdminUser(user))) {
      return { success: false, message: text('Nur Admins können Vorschläge prüfen.', 'Only admins can review suggestions.') }
    }

    const timestamp = new Date().toISOString()
    const { error } = await supabase
      .from('setup_suggestions')
      .update({
        status: input.status,
        admin_note: input.adminNote?.trim() || null,
        reviewed_at: timestamp,
        reviewed_by: user?.email ?? null,
        updated_at: timestamp,
      })
      .eq('id', input.suggestionId)

    if (error) return { success: false, message: text('Vorschlag konnte nicht aktualisiert werden.', 'Could not update the suggestion.') }

    revalidateSetupSuggestionSurfaces()
    return { success: true, message: text('Vorschlag aktualisiert.', 'Suggestion updated.') }
  } catch {
    return { success: false, message: text('Vorschlag konnte nicht aktualisiert werden.', 'Could not update the suggestion.') }
  }
}


export async function promoteSetupSuggestionToMaster(input: { suggestionId: string; adminNote?: string }, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  if (!input.suggestionId.trim()) return { success: false, message: text('Vorschlag fehlt.', 'Select a suggestion first.') }

  if (!hasSupabaseClientEnv()) {
    return { success: false, message: text('Übernahme braucht Supabase.', 'Publishing suggestions is unavailable in demo mode.') }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!(await isEquoraAdminUser(user))) {
      return { success: false, message: text('Nur Admins können Vorschläge übernehmen.', 'Only admins can add suggestions to the shared library.') }
    }

    const { error: acceptError } = await supabase.rpc('equora_accept_setup_suggestion_v1', {
      p_suggestion_id: input.suggestionId,
      p_admin_note: input.adminNote?.trim() || null,
    })

    if (acceptError) {
      const normalized = acceptError.message.toLowerCase()
      if (normalized.includes('is_master')) {
        return { success: false, message: text('Die Master-Setup-Struktur fehlt noch. Bitte Setup-Patches bis v57.01 ausführen.', 'The shared setup library is currently unavailable.') }
      }
      return { success: false, message: text('Vorschlag und Setup konnten nicht atomar übernommen werden.', 'Could not add the suggestion to the shared library.') }
    }

    revalidateSetupSuggestionSurfaces()
    revalidatePath('/trades')
    revalidatePath('/statistik')
    return { success: true, message: text('Vorschlag als Master-Setup übernommen.', 'Suggestion added to the shared library.') }
  } catch {
    return { success: false, message: text('Vorschlag konnte nicht übernommen werden.', 'Could not publish the suggestion.') }
  }
}

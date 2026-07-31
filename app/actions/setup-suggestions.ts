'use server'

import { revalidatePath } from 'next/cache'
import { isEquoraAdminUser } from '@/lib/server/admin'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import type { SetupSuggestionRow } from '@/lib/types/db'
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

export async function createSetupSuggestion(input: CreateSetupSuggestionInput) {
  const title = input.title.trim()
  if (!title) {
    return { success: false, message: 'Bitte gib deinem Vorschlag einen Namen.' }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: true, message: `Demo-Modus: Vorschlag „${title}“ vorbereitet.` }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) return { success: false, message: 'Bitte zuerst einloggen.' }

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
        return { success: false, message: 'Die Vorschlags-Struktur fehlt noch in Supabase. Bitte `supabase/schema-patch-v57.17.sql` ausführen.' }
      }
      return { success: false, message: 'Vorschlag konnte nicht gespeichert werden.' }
    }

    revalidateSetupSuggestionSurfaces()
    return { success: true, message: 'Vorschlag gesendet. Admins können ihn prüfen.' }
  } catch {
    return { success: false, message: 'Vorschlag konnte nicht gespeichert werden.' }
  }
}

export async function updateSetupSuggestionByAdmin(input: { suggestionId: string; status: SetupSuggestionStatus; adminNote?: string }) {
  if (!input.suggestionId.trim()) return { success: false, message: 'Vorschlag fehlt.' }
  if (!['pending', 'accepted', 'rejected', 'archived'].includes(input.status)) return { success: false, message: 'Status ist ungültig.' }

  if (!hasSupabaseClientEnv()) {
    return { success: false, message: 'Admin-Prüfung braucht Supabase.' }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!(await isEquoraAdminUser(user))) {
      return { success: false, message: 'Nur Admins können Vorschläge prüfen.' }
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

    if (error) return { success: false, message: 'Vorschlag konnte nicht aktualisiert werden.' }

    revalidateSetupSuggestionSurfaces()
    return { success: true, message: 'Vorschlag aktualisiert.' }
  } catch {
    return { success: false, message: 'Vorschlag konnte nicht aktualisiert werden.' }
  }
}


export async function promoteSetupSuggestionToMaster(input: { suggestionId: string; adminNote?: string }) {
  if (!input.suggestionId.trim()) return { success: false, message: 'Vorschlag fehlt.' }

  if (!hasSupabaseClientEnv()) {
    return { success: false, message: 'Übernahme braucht Supabase.' }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!(await isEquoraAdminUser(user))) {
      return { success: false, message: 'Nur Admins können Vorschläge übernehmen.' }
    }

    const { data: suggestionData, error: suggestionError } = await supabase
      .from('setup_suggestions')
      .select('*')
      .eq('id', input.suggestionId)
      .single()

    if (suggestionError || !suggestionData) {
      return { success: false, message: 'Vorschlag konnte nicht geladen werden.' }
    }

    const suggestion = suggestionData as SetupSuggestionRow
    const title = suggestion.title?.trim()
    if (!title) return { success: false, message: 'Vorschlag hat keinen Namen.' }

    const now = new Date().toISOString()
    const { data: lastSetup } = await supabase
      .from('setups')
      .select('sort_order')
      .eq('user_id', user?.id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const sortOrder = ((lastSetup as { sort_order?: number | null } | null)?.sort_order ?? -1) + 1

    const { error: insertError } = await supabase.from('setups').insert({
      id: crypto.randomUUID(),
      user_id: user?.id,
      created_at: now,
      updated_at: now,
      title,
      category: suggestion.category?.trim() || 'Community',
      description: suggestion.description?.trim() || null,
      entry: suggestion.entry?.trim() || null,
      exit: suggestion.exit?.trim() || null,
      invalidation: suggestion.invalidation?.trim() || null,
      playbook: null,
      checklist: suggestion.checklist ?? [],
      mistakes: suggestion.mistakes ?? [],
      cover_image_url: null,
      sort_order: sortOrder,
      is_archived: false,
      is_master: true,
    })

    if (insertError) {
      const normalized = insertError.message.toLowerCase()
      if (normalized.includes('is_master')) {
        return { success: false, message: 'Die Master-Setup-Struktur fehlt noch. Bitte Setup-Patches bis v57.01 ausführen.' }
      }
      return { success: false, message: 'Setup konnte nicht übernommen werden.' }
    }

    const { error: updateError } = await supabase
      .from('setup_suggestions')
      .update({
        status: 'accepted',
        admin_note: input.adminNote?.trim() || 'Als Master-Setup übernommen.',
        reviewed_at: now,
        reviewed_by: user?.email ?? null,
        updated_at: now,
      })
      .eq('id', input.suggestionId)

    if (updateError) return { success: false, message: 'Setup wurde übernommen, der Vorschlagsstatus aber nicht aktualisiert.' }

    revalidateSetupSuggestionSurfaces()
    revalidatePath('/trades')
    revalidatePath('/statistik')
    return { success: true, message: 'Vorschlag als Master-Setup übernommen.' }
  } catch {
    return { success: false, message: 'Vorschlag konnte nicht übernommen werden.' }
  }
}

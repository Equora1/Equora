'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import type { SetupMediaRow, SetupRow } from '@/lib/types/db'
import type { SaveSetupInput, SavedSetup, SavedSetupMedia } from '@/lib/types/setup'

const MEDIA_BUCKET = 'equora-media'


function mapSetupPersistenceError(message: string) {
  const normalized = message.toLowerCase()

  if (
    normalized.includes("could not find the 'category' column of 'setups' in the schema cache")
    || normalized.includes("could not find the 'playbook' column of 'setups' in the schema cache")
    || normalized.includes(`relation "public.setup_media" does not exist`)
    || normalized.includes(`relation "setup_media" does not exist`)
  ) {
    return 'Die Supabase-Struktur für Setups ist veraltet. Bitte in Supabase SQL Editor `supabase/schema-patch-v56.8.sql` ausführen und danach erneut speichern.'
  }

  return message
}


function revalidateSetupSurfaces() {
  revalidatePath('/setups')
  revalidatePath('/trades')
  revalidatePath('/dashboard')
  revalidatePath('/review')
  revalidatePath('/statistik')
}

function normalizeTextArray(values: string[] | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  )
}

function normalizeSetupMediaInput(media: SavedSetupMedia[] | undefined) {
  const items = Array.from(
    new Map(
      (media ?? [])
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
            isCover: Boolean(item.isCover),
            caption: item.caption?.trim() || null,
            mediaRole: item.mediaRole ?? 'example',
          },
        ]),
    ).values(),
  ).sort((left, right) => left.sortOrder - right.sortOrder)

  const hasExplicitCover = items.some((item) => item.isCover)

  return items.map((item, index) => ({
    ...item,
    sortOrder: index,
    isCover: hasExplicitCover ? item.isCover : index === 0,
  }))
}

function buildSavedSetup(row: SetupRow, mediaRows: SetupMediaRow[]): SavedSetup {
  const media = mediaRows
    .map((mediaRow) => ({
      id: mediaRow.id,
      storagePath: mediaRow.storage_path,
      publicUrl: mediaRow.public_url,
      fileName: mediaRow.file_name,
      mimeType: mediaRow.mime_type,
      byteSize: mediaRow.byte_size,
      sortOrder: mediaRow.sort_order ?? 0,
      isCover: Boolean(mediaRow.is_cover),
      caption: mediaRow.caption,
      mediaRole: mediaRow.media_role ?? 'example',
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder)

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    playbook: row.playbook,
    checklist: row.checklist ?? [],
    mistakes: row.mistakes ?? [],
    coverImageUrl: media.find((item) => item.isCover)?.publicUrl ?? row.cover_image_url ?? null,
    isArchived: Boolean(row.is_archived),
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    media,
  }
}

async function fetchSetupWithMedia(supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>, setupId: string, userId: string) {
  const { data: setupRow, error: setupError } = await supabase
    .from('setups')
    .select('*')
    .eq('id', setupId)
    .eq('user_id', userId)
    .single()

  if (setupError || !setupRow) {
    throw new Error(setupError?.message ?? 'Setup konnte nicht geladen werden.')
  }

  const { data: mediaRows } = await supabase
    .from('setup_media')
    .select('*')
    .eq('setup_id', setupId)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  return buildSavedSetup(setupRow as SetupRow, (mediaRows ?? []) as SetupMediaRow[])
}

export async function saveSetupEntry(input: SaveSetupInput) {
  const title = input.title.trim()
  if (!title) {
    return { success: false, mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const), message: 'Bitte gib deinem Setup einen Namen.' }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: 'demo' as const,
      setupId: input.id ?? crypto.randomUUID(),
      message: `Demo-Modus: Setup „${title}“ vorbereitet.`,
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { success: false, mode: 'supabase' as const, message: 'Bitte zuerst einloggen.' }

    const normalizedChecklist = normalizeTextArray(input.checklist)
    const normalizedMistakes = normalizeTextArray(input.mistakes)
    const normalizedMedia = normalizeSetupMediaInput(input.media)
    const coverImageUrl = normalizedMedia.find((item) => item.isCover)?.publicUrl ?? null
    const now = new Date().toISOString()

    let sortOrder = typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder) ? input.sortOrder : 0
    if (!input.id) {
      const { data: lastSetup } = await supabase
        .from('setups')
        .select('sort_order')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      sortOrder = ((lastSetup as { sort_order?: number | null } | null)?.sort_order ?? -1) + 1
    }

    const payload = {
      user_id: user.id,
      title,
      category: input.category.trim() || 'Custom',
      description: input.description?.trim() || null,
      playbook: input.playbook?.trim() || null,
      checklist: normalizedChecklist,
      mistakes: normalizedMistakes,
      cover_image_url: coverImageUrl,
      is_archived: Boolean(input.isArchived),
      sort_order: sortOrder,
      updated_at: now,
    }

    const setupResponse = input.id?.trim()
      ? await supabase.from('setups').update(payload).eq('id', input.id).eq('user_id', user.id).select('*').single()
      : await supabase.from('setups').insert({ id: crypto.randomUUID(), created_at: now, ...payload }).select('*').single()

    if (setupResponse.error || !setupResponse.data) {
      return { success: false, mode: 'supabase' as const, message: `Setup konnte nicht gespeichert werden. ${mapSetupPersistenceError(setupResponse.error?.message ?? '')}`.trim() }
    }

    const setupId = (setupResponse.data as SetupRow).id

    if (input.removedStoragePaths?.length) {
      const removable = input.removedStoragePaths.filter(Boolean)
      if (removable.length) await supabase.storage.from(MEDIA_BUCKET).remove(removable)
    }

    await supabase.from('setup_media').delete().eq('setup_id', setupId).eq('user_id', user.id)

    if (normalizedMedia.length) {
      const rows = normalizedMedia.map((item, index) => ({
        id: crypto.randomUUID(),
        setup_id: setupId,
        user_id: user.id,
        created_at: now,
        storage_path: item.storagePath,
        public_url: item.publicUrl,
        file_name: item.fileName,
        mime_type: item.mimeType,
        byte_size: item.byteSize,
        sort_order: index,
        is_cover: item.isCover,
        caption: item.caption,
        media_role: item.mediaRole,
      }))

      const { error: mediaError } = await supabase.from('setup_media').insert(rows)
      if (mediaError) {
        return { success: false, mode: 'supabase' as const, message: `Setup-Medien konnten nicht gespeichert werden. ${mapSetupPersistenceError(mediaError.message)}` }
      }

      await supabase
        .from('setups')
        .update({ cover_image_url: normalizedMedia.find((item) => item.isCover)?.publicUrl ?? normalizedMedia[0]?.publicUrl ?? null, updated_at: now })
        .eq('id', setupId)
        .eq('user_id', user.id)
    }

    const savedSetup = await fetchSetupWithMedia(supabase, setupId, user.id)
    revalidateSetupSurfaces()
    return { success: true, mode: 'supabase' as const, setupId, setup: savedSetup, message: `Setup gespeichert: ${title}.` }
  } catch (error) {
    return { success: false, mode: 'supabase' as const, message: `Setup konnte nicht gespeichert werden. ${mapSetupPersistenceError(error instanceof Error ? error.message : 'Unbekannter Fehler.')}` }
  }
}

export async function deleteSetupEntry(setupId: string) {
  if (!setupId.trim()) {
    return { success: false, mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const), message: 'Setup-ID fehlt.' }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: true, mode: 'demo' as const, message: 'Demo-Modus: Setup gelöscht.' }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { success: false, mode: 'supabase' as const, message: 'Bitte zuerst einloggen.' }

    const { data: mediaRows } = await supabase.from('setup_media').select('storage_path').eq('setup_id', setupId).eq('user_id', user.id)
    const storagePaths = ((mediaRows ?? []) as Array<{ storage_path: string | null }>).map((row) => row.storage_path).filter(Boolean) as string[]
    if (storagePaths.length) await supabase.storage.from(MEDIA_BUCKET).remove(storagePaths)

    const { error } = await supabase.from('setups').delete().eq('id', setupId).eq('user_id', user.id)
    if (error) return { success: false, mode: 'supabase' as const, message: `Setup konnte nicht gelöscht werden. ${error.message}` }

    revalidateSetupSurfaces()
    return { success: true, mode: 'supabase' as const, message: 'Setup gelöscht.' }
  } catch (error) {
    return { success: false, mode: 'supabase' as const, message: `Setup konnte nicht gelöscht werden. ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}` }
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { isEquoraAdminUser } from '@/lib/server/admin'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import type { SetupMediaRow, SetupRow, SetupTradeLinkRow } from '@/lib/types/db'
import type { SaveSetupInput, SavedSetup, SavedSetupMedia } from '@/lib/types/setup'
import { signSetupMediaRows } from '@/lib/server/media-access'
import { processMediaCleanupForPaths } from '@/lib/server/media-cleanup'
import { assertOwnedSetupMediaPath } from '@/lib/utils/media-security'

function mapSetupPersistenceError(message: string) {
  const normalized = message.toLowerCase()

  if (
    normalized.includes("could not find the 'category' column of 'setups' in the schema cache")
    || normalized.includes("could not find the 'playbook' column of 'setups' in the schema cache")
    || normalized.includes("could not find the 'entry' column of 'setups' in the schema cache")
    || normalized.includes("could not find the 'exit' column of 'setups' in the schema cache")
    || normalized.includes("could not find the 'invalidation' column of 'setups' in the schema cache")
    || normalized.includes("could not find the 'is_master' column of 'setups' in the schema cache")
    || normalized.includes(`relation "public.setup_trade_links" does not exist`)
    || normalized.includes(`relation "setup_trade_links" does not exist`)
    || normalized.includes(`relation "public.setup_media" does not exist`)
    || normalized.includes(`relation "setup_media" does not exist`)
  ) {
    return 'Die Supabase-Struktur für Setups ist veraltet. Bitte die aktuellen Setup-Patches in Supabase einspielen, insbesondere `supabase/schema-patch-v56.56.sql` und `supabase/schema-patch-v57.01.sql`, und danach erneut speichern.'
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
        .filter((item) => item.storagePath?.trim())
        .map((item, index) => [
          item.storagePath,
          {
            storagePath: item.storagePath.trim(),
            publicUrl: '',
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

function buildSavedSetup(row: SetupRow, mediaRows: SetupMediaRow[], linkRows: SetupTradeLinkRow[] = []): SavedSetup {
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
    entry: row.entry,
    exit: row.exit,
    invalidation: row.invalidation,
    playbook: row.playbook,
    checklist: row.checklist ?? [],
    mistakes: row.mistakes ?? [],
    coverImageUrl: media.find((item) => item.isCover)?.publicUrl ?? row.cover_image_url ?? null,
    isArchived: Boolean(row.is_archived),
    isMaster: Boolean(row.is_master),
    userId: row.user_id ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    media,
    linkedTradeIds: Array.from(new Set(linkRows.map((link) => link.trade_id).filter(Boolean))),
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

  const [{ data: mediaRows }, { data: linkRows }] = await Promise.all([
    supabase
      .from('setup_media')
      .select('*')
      .eq('setup_id', setupId)
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('setup_trade_links')
      .select('*')
      .eq('setup_id', setupId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
  ])

  const signedMediaRows = await signSetupMediaRows(supabase, (mediaRows ?? []) as SetupMediaRow[], userId)
  return buildSavedSetup(setupRow as SetupRow, signedMediaRows, (linkRows ?? []) as SetupTradeLinkRow[])
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

    const isAdmin = await isEquoraAdminUser(user)
    const wantsMasterSetup = Boolean(input.isMaster)
    if (wantsMasterSetup && !isAdmin) {
      return { success: false, mode: 'supabase' as const, message: 'Nur Admins können Master-Setups veröffentlichen.' }
    }

    const normalizedChecklist = normalizeTextArray(input.checklist)
    const normalizedMistakes = normalizeTextArray(input.mistakes)
    const normalizedLinkedTradeIds = Array.from(new Set((input.linkedTradeIds ?? []).map((value) => value.trim()).filter(Boolean)))
    const normalizedMedia = normalizeSetupMediaInput(input.media)
    const now = new Date().toISOString()

    const setupId = input.id?.trim() || crypto.randomUUID()
    const { data: existingSetup, error: existingSetupError } = await supabase
      .from('setups')
      .select('id')
      .eq('id', setupId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (existingSetupError) {
      return { success: false, mode: 'supabase' as const, message: 'Der bestehende Setup-Status konnte nicht sicher geprüft werden.' }
    }
    const isUpdate = Boolean(existingSetup)

    let sortOrder = typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder) ? input.sortOrder : 0
    if (!isUpdate) {
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
      entry: input.entry?.trim() || null,
      exit: input.exit?.trim() || null,
      invalidation: input.invalidation?.trim() || null,
      playbook: input.playbook?.trim() || null,
      checklist: normalizedChecklist,
      mistakes: normalizedMistakes,
      cover_image_url: null,
      is_archived: Boolean(input.isArchived),
      sort_order: sortOrder,
      updated_at: now,
      ...(input.isMaster !== undefined ? { is_master: wantsMasterSetup } : {}),
    }

    const { data: previousMediaRows } = isUpdate
      ? await supabase.from('setup_media').select('storage_path').eq('setup_id', setupId).eq('user_id', user.id)
      : { data: [] as Array<{ storage_path: string }> }

    for (const item of normalizedMedia) assertOwnedSetupMediaPath(user.id, setupId, item.storagePath)

    const { error: saveError } = await supabase.rpc('equora_save_setup_v1', {
      p_setup_id: setupId,
      p_setup: payload,
      p_media: normalizedMedia.map((item) => ({
        storagePath: item.storagePath,
        fileName: item.fileName,
        mimeType: item.mimeType,
        byteSize: item.byteSize,
        sortOrder: item.sortOrder,
        isCover: item.isCover,
        caption: item.caption,
        mediaRole: item.mediaRole,
      })),
      p_linked_trade_ids: normalizedLinkedTradeIds,
      p_is_update: isUpdate,
    })

    if (saveError) {
      return { success: false, mode: 'supabase' as const, message: `Setup konnte nicht atomar gespeichert werden. ${mapSetupPersistenceError(saveError.message)}` }
    }

    const activePaths = new Set(normalizedMedia.map((item) => item.storagePath))
    const obsoletePaths = ((previousMediaRows ?? []) as Array<{ storage_path: string }>)
      .map((row) => row.storage_path)
      .filter((path) => path && !activePaths.has(path))
    const cleanup = await processMediaCleanupForPaths(obsoletePaths)

    const savedSetup = await fetchSetupWithMedia(supabase, setupId, user.id)
    revalidateSetupSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      setupId,
      setup: savedSetup,
      message: `Setup gespeichert: ${title}.${cleanup.pending ? ' Die Storage-Bereinigung läuft im Hintergrund weiter.' : ''}`,
    }
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

    const { data, error } = await supabase.rpc('equora_delete_setup_v1', { p_setup_id: setupId })
    if (error) return { success: false, mode: 'supabase' as const, message: 'Setup konnte nicht atomar gelöscht werden.' }
    const result = (data ?? {}) as { storagePaths?: string[]; alreadyAbsent?: boolean }
    const cleanup = await processMediaCleanupForPaths(result.storagePaths ?? [])

    revalidateSetupSurfaces()
    return {
      success: true,
      mode: 'supabase' as const,
      message: result.alreadyAbsent
        ? 'Setup war bereits gelöscht.'
        : `Setup gelöscht.${cleanup.pending ? ' Die Storage-Bereinigung läuft im Hintergrund weiter.' : ''}`,
    }
  } catch (error) {
    return { success: false, mode: 'supabase' as const, message: `Setup konnte nicht gelöscht werden. ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}` }
  }
}

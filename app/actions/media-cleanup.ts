'use server'

import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { hasSupabaseServerEnv } from '@/lib/supabase/config'
import { EQUORA_MEDIA_BUCKET, assertOwnedSetupMediaPath, assertOwnedTradeMediaPath } from '@/lib/utils/media-security'

const MAX_MEDIA_PER_OPERATION = 12
const AMBIGUOUS_FINALIZE_GRACE_MS = 30 * 60 * 1000

async function getOwnedCleanupContext(input: {
  kind: 'trade' | 'setup'
  parentId: string
  storagePaths: string[]
}) {
  const parentId = input.parentId.trim()
  const storagePaths = Array.from(new Set(input.storagePaths.map((path) => path.trim()).filter(Boolean)))
  if (
    !parentId
    || !storagePaths.length
    || storagePaths.length > MAX_MEDIA_PER_OPERATION
    || !hasSupabaseServerEnv()
  ) return null

  const authClient = await createSupabaseAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const parentTable = input.kind === 'trade' ? 'trades' : 'setups'
  const { data: parent, error: parentError } = await authClient
    .from(parentTable)
    .select('id')
    .eq('id', parentId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (parentError || !parent) return null

  for (const path of storagePaths) {
    if (input.kind === 'trade') assertOwnedTradeMediaPath(user.id, parentId, path)
    else assertOwnedSetupMediaPath(user.id, parentId, path)
  }
  return { authClient, userId: user.id, storagePaths }
}

export async function registerPendingMediaUploads(input: {
  kind: 'trade' | 'setup'
  parentId: string
  storagePaths: string[]
}) {
  try {
    const context = await getOwnedCleanupContext(input)
    if (!context) return { success: false, registered: 0 }

    const { data, error } = await context.authClient.rpc('equora_register_media_upload_intents_v1', {
      p_kind: input.kind,
      p_parent_id: input.parentId.trim(),
      p_storage_paths: context.storagePaths,
    })
    const registered = Number(data ?? 0)
    return { success: !error && registered === context.storagePaths.length, registered: error ? 0 : registered }
  } catch {
    return { success: false, registered: 0 }
  }
}

export async function requestUncommittedMediaCleanup(input: {
  kind: 'trade' | 'setup'
  parentId: string
  storagePaths: string[]
}) {
  try {
    const context = await getOwnedCleanupContext(input)
    if (!context) return { success: false, queued: 0 }

    // A browser error cannot prove that the concurrent DB finalization did not
    // commit. Keep (and extend) the grace period so cleanup cannot race that
    // transaction; the worker will re-check both reference tables afterwards.
    const notBefore = new Date(Date.now() + AMBIGUOUS_FINALIZE_GRACE_MS).toISOString()
    const { data, error } = await createSupabaseServerClient()
      .from('media_cleanup_outbox')
      .update({
        last_error: 'ambiguous_finalize_cleanup_requested',
        not_before: notBefore,
      })
      .eq('user_id', context.userId)
      .eq('bucket', EQUORA_MEDIA_BUCKET)
      .is('completed_at', null)
      .in('storage_path', context.storagePaths)
      .select('id')
    if (error) return { success: false, queued: 0 }

    return { success: true, queued: data?.length ?? 0, completed: 0, pending: data?.length ?? 0 }
  } catch {
    return { success: false, queued: 0 }
  }
}

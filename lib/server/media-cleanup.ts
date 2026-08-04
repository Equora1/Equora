import 'server-only'

import { hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EQUORA_MEDIA_BUCKET, isCanonicalOwnedMediaPathForUser } from '@/lib/utils/media-security'

type CleanupResult = {
  completed: number
  pending: number
}

function uniquePaths(paths: string[]) {
  return Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)))
}

export async function processMediaCleanupForPaths(paths: string[]): Promise<CleanupResult> {
  const requestedPaths = uniquePaths(paths)
  if (!requestedPaths.length) return { completed: 0, pending: 0 }
  if (!hasSupabaseServerEnv()) return { completed: 0, pending: requestedPaths.length }

  const supabase = createSupabaseServerClient()
  const { data: jobs, error: jobsError } = await supabase
    .from('media_cleanup_outbox')
    .select('id,user_id,storage_path,attempts')
    .eq('bucket', EQUORA_MEDIA_BUCKET)
    .is('completed_at', null)
    .lte('not_before', new Date().toISOString())
    .in('storage_path', requestedPaths)

  if (jobsError) return { completed: 0, pending: requestedPaths.length }

  let completed = 0
  let pending = 0

  for (const job of jobs ?? []) {
    const path = String(job.storage_path ?? '')
    const userId = String(job.user_id ?? '')
    if (!isCanonicalOwnedMediaPathForUser(userId, path)) {
      await supabase
        .from('media_cleanup_outbox')
        .update({
          attempts: Number(job.attempts ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
          last_error: 'invalid_cleanup_path',
        })
        .eq('id', job.id)
      pending += 1
      continue
    }

    const [tradeReferenceResult, setupReferenceResult] = await Promise.all([
      supabase.from('trade_media').select('id', { count: 'exact', head: true }).eq('storage_path', path),
      supabase.from('setup_media').select('id', { count: 'exact', head: true }).eq('storage_path', path),
    ])

    if (
      tradeReferenceResult.error
      || setupReferenceResult.error
      || tradeReferenceResult.count === null
      || setupReferenceResult.count === null
    ) {
      const referenceError = [tradeReferenceResult.error?.message, setupReferenceResult.error?.message]
        .filter(Boolean)
        .join(' | ')
      await supabase
        .from('media_cleanup_outbox')
        .update({
          attempts: Number(job.attempts ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
          last_error: `reference_check_failed${referenceError ? `: ${referenceError}` : ''}`.slice(0, 500),
        })
        .eq('id', job.id)
      pending += 1
      continue
    }

    if (tradeReferenceResult.count > 0 || setupReferenceResult.count > 0) {
      const { error: completionError } = await supabase
        .from('media_cleanup_outbox')
        .update({ completed_at: new Date().toISOString(), last_error: 'active_reference_preserved' })
        .eq('id', job.id)
      if (completionError) pending += 1
      else completed += 1
      continue
    }

    const { error: storageError } = await supabase.storage.from(EQUORA_MEDIA_BUCKET).remove([path])
    if (storageError) {
      await supabase
        .from('media_cleanup_outbox')
        .update({
          attempts: Number(job.attempts ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
          last_error: storageError.message.slice(0, 500),
        })
        .eq('id', job.id)
      pending += 1
      continue
    }

    const { error: completionError } = await supabase
      .from('media_cleanup_outbox')
      .update({
        attempts: Number(job.attempts ?? 0) + 1,
        last_attempt_at: new Date().toISOString(),
        last_error: null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)
    if (completionError) pending += 1
    else completed += 1
  }

  pending += Math.max(0, requestedPaths.length - (jobs?.length ?? 0))
  return { completed, pending }
}

export async function processPendingMediaCleanup(limit = 50): Promise<CleanupResult> {
  if (!hasSupabaseServerEnv()) return { completed: 0, pending: 0 }
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 100))
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('media_cleanup_outbox')
    .select('storage_path')
    .eq('bucket', EQUORA_MEDIA_BUCKET)
    .is('completed_at', null)
    .lte('not_before', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(boundedLimit)

  if (error) return { completed: 0, pending: boundedLimit }
  const paths = (data ?? []).map((job) => String(job.storage_path ?? '')).filter(Boolean)
  const result = await processMediaCleanupForPaths(paths)
  const { count, error: countError } = await supabase
    .from('media_cleanup_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('bucket', EQUORA_MEDIA_BUCKET)
    .is('completed_at', null)
  return {
    completed: result.completed,
    pending: countError || count === null ? Math.max(result.pending, paths.length) : count,
  }
}

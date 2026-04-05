import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isEquoraAdminUser } from '@/lib/server/admin'
import type { SharedTradeSubmissionRow } from '@/lib/types/db'

function sortByCreatedDesc(rows: SharedTradeSubmissionRow[]) {
  return [...rows].sort((left, right) => {
    const leftTime = new Date(left.created_at ?? 0).getTime()
    const rightTime = new Date(right.created_at ?? 0).getTime()
    return rightTime - leftTime
  })
}

export async function getOwnSharedTradeSubmissionsServer(userId?: string | null): Promise<SharedTradeSubmissionRow[]> {
  if (!hasSupabaseClientEnv()) return []

  try {
    const scopedUserId = userId ?? null
    const supabase = scopedUserId && hasSupabaseServerEnv()
      ? createSupabaseServerClient()
      : await createSupabaseAuthServerClient()

    if (!scopedUserId && hasSupabaseServerEnv()) return []
    if (!scopedUserId) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.id) return []
      return getOwnSharedTradeSubmissionsServer(user.id)
    }

    const { data, error } = await supabase
      .from('shared_trade_submissions')
      .select('*')
      .eq('user_id', scopedUserId)
      .order('created_at', { ascending: false })

    if (error || !data) return []
    return data as SharedTradeSubmissionRow[]
  } catch {
    return []
  }
}

export async function getAdminSharedTradeSubmissionsServer(): Promise<SharedTradeSubmissionRow[]> {
  if (!hasSupabaseClientEnv()) return []

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!(await isEquoraAdminUser(user))) return []

    const { data, error } = await supabase.from('shared_trade_submissions').select('*').order('created_at', { ascending: false })
    if (error || !data) return []
    return data as SharedTradeSubmissionRow[]
  } catch {
    return []
  }
}


export async function getFeaturedSharedTradeSubmissionsServer(): Promise<SharedTradeSubmissionRow[]> {
  if (!hasSupabaseClientEnv()) return []

  try {
    const supabase = await createSupabaseAuthServerClient()
    const { data, error } = await supabase
      .from('shared_trade_submissions')
      .select('*')
      .eq('status', 'featured')
      .eq('vault_opt_in', true)
      .order('featured_at', { ascending: false })
      .order('reviewed_at', { ascending: false })

    if (error || !data) return []
    return data as SharedTradeSubmissionRow[]
  } catch {
    return []
  }
}

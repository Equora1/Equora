import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isEquoraAdminUser } from '@/lib/server/admin'
import type { FeaturedSharedTrade, SharedTradeSubmissionRow } from '@/lib/types/db'

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


export async function getFeaturedSharedTradeSubmissionsServer(): Promise<FeaturedSharedTrade[]> {
  if (!hasSupabaseClientEnv()) return []

  try {
    const supabase = await createSupabaseAuthServerClient()
    const { data, error } = await supabase.rpc('equora_featured_shared_trades_v1')

    if (error || !Array.isArray(data)) return []
    return (data as FeaturedSharedTrade[]).map((row) => ({
      id: row.id,
      status: row.status,
      learning_category: row.learning_category,
      visibility: row.visibility,
      submitted_by_name: row.visibility === 'named' ? row.submitted_by_name : null,
      shared_market: row.shared_market,
      shared_setup: row.shared_setup,
      shared_result: row.shared_result,
      shared_net_pnl: row.shared_net_pnl,
      shared_currency: row.shared_currency,
      shared_r_multiple: row.shared_r_multiple,
      shared_screenshot_url: row.shared_screenshot_url,
      vault_blurb: row.vault_blurb,
      coach_feedback: row.coach_feedback,
      review_labels: row.review_labels,
    }))
  } catch {
    return []
  }
}

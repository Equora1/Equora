import { trades as mockTrades } from '@/lib/data/mock-data'
import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type NavigationMetrics = {
  trades: number
  aSetups: number
  losses: number
}

const emptyMetrics: NavigationMetrics = { trades: 0, aSetups: 0, losses: 0 }

function getMockMetrics(): NavigationMetrics {
  return {
    trades: mockTrades.length,
    aSetups: mockTrades.filter((trade) => trade.quality === 'A-Setup').length,
    losses: mockTrades.filter((trade) => Number(trade.netPnL ?? 0) < 0).length,
  }
}

export async function getNavigationMetricsServer(userId?: string | null): Promise<NavigationMetrics> {
  if (!hasSupabaseClientEnv()) return getMockMetrics()

  try {
    const scopedUserId = userId ?? null
    const supabase = scopedUserId && hasSupabaseServerEnv()
      ? createSupabaseServerClient()
      : await createSupabaseAuthServerClient()

    if (!scopedUserId && hasSupabaseServerEnv()) return emptyMetrics

    let resolvedUserId = scopedUserId
    if (!resolvedUserId) {
      const { data: { user } } = await supabase.auth.getUser()
      resolvedUserId = user?.id ?? null
    }
    if (!resolvedUserId) return emptyMetrics

    const [tradesResponse, aSetupsResponse, lossesResponse] = await Promise.all([
      supabase.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', resolvedUserId),
      supabase.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', resolvedUserId).eq('quality', 'A-Setup'),
      supabase.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', resolvedUserId).lt('net_pnl', 0),
    ])

    if (tradesResponse.error || aSetupsResponse.error || lossesResponse.error) return emptyMetrics

    return {
      trades: tradesResponse.count ?? 0,
      aSetups: aSetupsResponse.count ?? 0,
      losses: lossesResponse.count ?? 0,
    }
  } catch {
    return emptyMetrics
  }
}

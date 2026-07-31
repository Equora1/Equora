import { NextResponse } from 'next/server'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { trades as mockTrades } from '@/lib/data/mock-data'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!hasSupabaseClientEnv()) {
    return NextResponse.json(
      {
        trades: mockTrades.length,
        aSetups: mockTrades.filter((trade) => trade.quality === 'A-Setup').length,
        losses: mockTrades.filter((trade) => trade.result.startsWith('-')).length,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  const supabase = await createSupabaseAuthServerClient()
  const { data, error: claimsError } = await supabase.auth.getClaims()
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null

  if (claimsError || !userId) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const [tradesResponse, aSetupsResponse, lossesResponse] = await Promise.all([
    supabase.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('quality', 'A-Setup'),
    supabase.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', userId).lt('net_pnl', 0),
  ])

  const error = tradesResponse.error ?? aSetupsResponse.error ?? lossesResponse.error
  if (error) {
    console.error('Sidebar overview failed:', error.message)
    return NextResponse.json({ error: 'Kurzüberblick konnte nicht geladen werden.' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } })
  }

  return NextResponse.json(
    {
      trades: tradesResponse.count ?? 0,
      aSetups: aSetupsResponse.count ?? 0,
      losses: lossesResponse.count ?? 0,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

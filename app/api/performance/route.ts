import { NextRequest, NextResponse } from 'next/server'
import { isEquoraAdminUser } from '@/lib/server/admin'
import { clearPerformanceEvents, getPerformanceEvents, recordPerformanceEvent } from '@/lib/server/performance'
import { isPerformanceDiagnosticsEnabled } from '@/lib/server/performance-diagnostics'
import type { PerformanceCategory } from '@/lib/types/performance'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const allowedCategories = new Set<PerformanceCategory>(['auth', 'database', 'transform', 'page', 'client', 'system'])

async function hasPerformanceAccess() {
  if (!isPerformanceDiagnosticsEnabled()) return false
  if (!hasSupabaseClientEnv()) return true

  try {
    const supabase = await createSupabaseAuthServerClient()
    const { data, error } = await supabase.auth.getClaims()
    const claims = data?.claims
    const userId = typeof claims?.sub === 'string' ? claims.sub : null
    if (error || !userId) return false

    return isEquoraAdminUser({
      id: userId,
      email: typeof claims?.email === 'string' ? claims.email : null,
    })
  } catch {
    return false
  }
}

function unavailable() {
  return NextResponse.json({ error: 'Diagnose nicht verfügbar.' }, { status: 404 })
}

export async function GET(request: NextRequest) {
  if (!(await hasPerformanceAccess())) return unavailable()
  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') ?? 200)
  const limit = Number.isFinite(requestedLimit) ? Math.min(300, Math.max(1, Math.floor(requestedLimit))) : 200
  return NextResponse.json({ events: getPerformanceEvents(limit), generatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  if (!(await hasPerformanceAccess())) return unavailable()
  const payload = (await request.json().catch(() => null)) as null | {
    name?: unknown
    category?: unknown
    durationMs?: unknown
    route?: unknown
    meta?: unknown
  }

  if (!payload || typeof payload.name !== 'string' || typeof payload.durationMs !== 'number') {
    return NextResponse.json({ error: 'Ungültige Performance-Messung.' }, { status: 400 })
  }

  const category = typeof payload.category === 'string' && allowedCategories.has(payload.category as PerformanceCategory)
    ? payload.category as PerformanceCategory
    : 'client'

  recordPerformanceEvent({
    name: payload.name.slice(0, 120),
    category,
    durationMs: payload.durationMs,
    status: 'ok',
    route: typeof payload.route === 'string' ? payload.route.slice(0, 160) : undefined,
    meta: payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
      ? payload.meta as Record<string, unknown>
      : undefined,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  if (!(await hasPerformanceAccess())) return unavailable()
  clearPerformanceEvents()
  return NextResponse.json({ ok: true })
}

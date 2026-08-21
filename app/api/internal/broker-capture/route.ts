import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { runBrokerCaptureCycle } from '@/lib/server/broker-capture-runtime'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const header = request.headers.get('authorization')
  if (!secret || secret.length < 16 || !header?.startsWith('Bearer ')) return false
  const provided = header.slice('Bearer '.length)
  const expectedBytes = Buffer.from(secret, 'utf8')
  const providedBytes = Buffer.from(provided, 'utf8')
  return expectedBytes.length === providedBytes.length
    && timingSafeEqual(expectedBytes, providedBytes)
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, code: 'unauthorized' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  try {
    const result = await runBrokerCaptureCycle()
    if (result.status === 'disabled' || result.status === 'runtime_not_configured') {
      return NextResponse.json({
        ok: false,
        code: result.status === 'disabled' ? 'runtime_disabled' : 'runtime_not_configured',
      }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    if (result.status === 'failed') {
      return NextResponse.json({
        ok: false,
        code: 'capture_domain_failed',
        status: result.status,
        failureCode: result.failureCode,
        pagesCommitted: result.pagesCommitted,
        scopeFinalized: result.scopeFinalized,
      }, {
        // The invocation itself completed and durably recorded the domain
        // failure. Keep HTTP 200 to avoid infrastructure retry storms, but
        // never claim ok=true or discard the sanitized failure classification.
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      pagesCommitted: result.pagesCommitted,
      scopeFinalized: result.scopeFinalized,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false, code: 'capture_cycle_failed' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}

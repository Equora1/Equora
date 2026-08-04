import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { processPendingMediaCleanup } from '@/lib/server/media-cleanup'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest) {
  const expected = process.env.EQUORA_MAINTENANCE_SECRET?.trim() ?? ''
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? ''
  if (!expected || !provided) return false
  const expectedHash = createHash('sha256').update(expected).digest()
  const providedHash = createHash('sha256').update(provided).digest()
  return timingSafeEqual(expectedHash, providedHash)
}

async function runCleanup(request: NextRequest) {
  if (!process.env.EQUORA_MAINTENANCE_SECRET?.trim()) {
    return NextResponse.json({ ok: false, error: 'maintenance_not_configured' }, { status: 503 })
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const result = await processPendingMediaCleanup(50)
  return NextResponse.json({ ok: result.pending === 0, ...result })
}

export const POST = runCleanup

export function GET() {
  return NextResponse.json({ ok: false, error: 'method_not_allowed' }, {
    status: 405,
    headers: { Allow: 'POST' },
  })
}

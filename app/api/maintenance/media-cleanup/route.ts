import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { processPendingMediaCleanup } from '@/lib/server/media-cleanup'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest, expectedSecrets: string[]) {
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? ''
  if (!provided) return false
  const providedHash = createHash('sha256').update(provided).digest()
  return expectedSecrets
    .map(secret => timingSafeEqual(createHash('sha256').update(secret).digest(), providedHash))
    .includes(true)
}

async function runCleanup(request: NextRequest) {
  const expectedSecrets = [
    process.env.EQUORA_MAINTENANCE_SECRET,
    process.env.EQUORA_MEDIA_MAINTENANCE_BEARER,
  ].map(secret => secret?.trim() ?? '').filter(Boolean)

  if (expectedSecrets.length === 0) {
    return NextResponse.json({ ok: false, error: 'maintenance_not_configured' }, { status: 503 })
  }
  if (!isAuthorized(request, expectedSecrets)) {
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

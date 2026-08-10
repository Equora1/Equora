import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  hasSupabaseClientEnv: vi.fn(),
  updateSupabaseSession: vi.fn(),
}))

vi.mock('@/lib/supabase/config', () => ({
  hasSupabaseClientEnv: mocks.hasSupabaseClientEnv,
}))

vi.mock('@/lib/supabase/middleware', () => ({
  updateSupabaseSession: mocks.updateSupabaseSession,
}))

import { middleware } from '../middleware'

function request(pathname: string, method = 'GET') {
  return new NextRequest(new URL(pathname, 'https://preview.example.test'), { method })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.hasSupabaseClientEnv.mockReturnValue(true)
  mocks.updateSupabaseSession.mockImplementation(async (incomingRequest: NextRequest) => ({
    response: NextResponse.next({ request: incomingRequest }),
    user: null,
  }))
})

describe('middleware service-authenticated route boundary', () => {
  it('passes the exact broker-capture route to its own bearer authentication', async () => {
    const response = await middleware(request('/api/internal/broker-capture'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('location')).toBeNull()
    expect(mocks.updateSupabaseSession).not.toHaveBeenCalled()
  })

  it('keeps the exact bypass when the broker-capture route has a query string', async () => {
    const response = await middleware(request('/api/internal/broker-capture?source=preview-check'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(mocks.updateSupabaseSession).not.toHaveBeenCalled()
  })

  it.each([
    '/api/internal/broker-capture-extra',
    '/api/internal/broker-capture/child',
    '/api/internal/other',
    '/dashboard',
  ])('does not broaden the bypass to %s', async (pathname) => {
    const response = await middleware(request(pathname))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      `https://preview.example.test/login?next=${encodeURIComponent(pathname)}`,
    )
    expect(mocks.updateSupabaseSession).toHaveBeenCalledTimes(1)
  })

  it.each(['HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'])(
    'does not broaden the exact-path bypass to %s',
    async (method) => {
      const response = await middleware(request('/api/internal/broker-capture', method))

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://preview.example.test/login?next=%2Fapi%2Finternal%2Fbroker-capture',
      )
      expect(mocks.updateSupabaseSession).toHaveBeenCalledTimes(1)
    },
  )
})

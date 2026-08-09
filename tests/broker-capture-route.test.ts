import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activated: vi.fn(),
  environmentReady: vi.fn(),
  runCycle: vi.fn(),
}))

vi.mock('@/lib/server/mexc-runtime', () => ({
  isMexcAutomaticCaptureActivated: mocks.activated,
  isMexcCaptureEnvironmentReady: mocks.environmentReady,
}))
vi.mock('@/lib/server/mexc-capture-runtime', () => ({
  runMexcCaptureCycle: mocks.runCycle,
}))

import { GET } from '../app/api/internal/broker-capture/route'

const SECRET = 'cron-secret-test-value'
const originalSecret = process.env.CRON_SECRET

function request(secret = SECRET) {
  return new Request('http://localhost/api/internal/broker-capture', {
    headers: { Authorization: `Bearer ${secret}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = SECRET
  mocks.activated.mockReturnValue(true)
  mocks.environmentReady.mockReturnValue(true)
})

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalSecret
})

describe('broker capture Cron route contract', () => {
  it('rejects an invalid bearer secret without invoking capture', async () => {
    const response = await GET(request('wrong-secret-value'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ ok: false, code: 'unauthorized' })
    expect(mocks.runCycle).not.toHaveBeenCalled()
  })

  it('returns runtime_disabled while automatic capture is off', async () => {
    mocks.activated.mockReturnValue(false)
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, code: 'runtime_disabled' })
  })

  it('returns runtime_not_configured before invoking capture', async () => {
    mocks.environmentReady.mockReturnValue(false)
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, code: 'runtime_not_configured' })
  })

  it.each(['idle', 'captured', 'released'] as const)(
    'reports the %s domain outcome as an operationally successful invocation',
    async (status) => {
      mocks.runCycle.mockResolvedValue({
        status, workUnitId: null, pagesCommitted: status === 'captured' ? 1 : 0,
        scopeFinalized: status === 'captured', failureCode: null,
        authorityBlocked: true,
      })
      const response = await GET(request())
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ ok: true, status })
    },
  )

  it('keeps a durable domain failure HTTP-successful but explicitly not ok', async () => {
    mocks.runCycle.mockResolvedValue({
      status: 'failed', workUnitId: 'redacted', pagesCommitted: 1,
      scopeFinalized: false, failureCode: 'SCOPE_BUDGET_EXHAUSTED',
      authorityBlocked: true,
    })
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: false,
      code: 'capture_domain_failed',
      status: 'failed',
      failureCode: 'SCOPE_BUDGET_EXHAUSTED',
      pagesCommitted: 1,
      scopeFinalized: false,
    })
  })

  it('sanitizes an unexpected capture exception', async () => {
    mocks.runCycle.mockRejectedValue(new Error('sensitive internal failure'))
    const response = await GET(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ ok: false, code: 'capture_cycle_failed' })
  })
})

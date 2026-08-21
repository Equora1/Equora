import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runCycle: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/server/broker-capture-runtime', () => ({
  runBrokerCaptureCycle: mocks.runCycle,
}))

import { GET } from '../app/api/internal/broker-capture/route'
import {
  BROKER_CAPTURE_RUNTIME_AUTHORITY_VERSION,
  BROKER_CAPTURE_RUNTIME_REGISTRATION_VERSION,
  createBrokerCaptureDispatcher,
  type BrokerCaptureEffectAuthority,
} from '../lib/server/broker-capture-dispatcher'

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
    mocks.runCycle.mockResolvedValue({
      dispatcherContractVersion: 'equora-broker-capture-dispatcher-v6',
      status: 'disabled', providerCode: null, workUnitId: null, pagesCommitted: 0,
      scopeFinalized: false, failureCode: null, authorityBlocked: true,
    })
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, code: 'runtime_disabled' })
  })

  it('returns runtime_not_configured before invoking capture', async () => {
    mocks.runCycle.mockResolvedValue({
      dispatcherContractVersion: 'equora-broker-capture-dispatcher-v6',
      status: 'runtime_not_configured', providerCode: 'mexc', workUnitId: null,
      pagesCommitted: 0, scopeFinalized: false, failureCode: null, authorityBlocked: true,
    })
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, code: 'runtime_not_configured' })
  })

  it.each(['idle', 'captured', 'released'] as const)(
    'reports the %s domain outcome as an operationally successful invocation',
    async (status) => {
      mocks.runCycle.mockResolvedValue({
      dispatcherContractVersion: 'equora-broker-capture-dispatcher-v6',
        providerCode: 'mexc',
        status,
        workUnitId: status === 'idle' ? null : '11111111-1111-4111-8111-111111111111',
        pagesCommitted: status === 'captured' ? 1 : 0,
        scopeFinalized: status === 'captured', failureCode: null,
        authorityBlocked: true,
      })
      const response = await GET(request())
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ ok: true, status })
    },
  )

  it('preserves a real lowercase provider failure through dispatcher and route as a domain outcome', async () => {
    const registration = Object.freeze({
      registrationContractVersion: BROKER_CAPTURE_RUNTIME_REGISTRATION_VERSION,
      providerCode: 'mexc',
      providerContractVersion: 'mexc_contract_v1',
      adapterVersion: 'mexc_adapter_v1',
      failureCodes: Object.freeze(['rate_limited']),
      readRuntimeAuthority: () => Object.freeze({
        authorityContractVersion: BROKER_CAPTURE_RUNTIME_AUTHORITY_VERSION,
        providerCode: 'mexc',
        providerContractVersion: 'mexc_contract_v1',
        adapterVersion: 'mexc_adapter_v1',
        runtimeAuthorityEpoch: 2,
        runtimeConfigurationDigest: 'a'.repeat(64),
        captureActivated: true,
        environmentReady: true,
      }),
      runCaptureCycle: (effectAuthority: BrokerCaptureEffectAuthority) => (
        effectAuthority.runAtEffectBoundary(async () => Object.freeze({
          status: 'failed' as const,
          workUnitId: '11111111-1111-4111-8111-111111111111',
          pagesCommitted: 1,
          scopeFinalized: false,
          failureCode: 'rate_limited',
          authorityBlocked: true as const,
        }))
      ),
    })
    const dispatcher = createBrokerCaptureDispatcher(Object.freeze([registration]))
    mocks.runCycle.mockImplementation(() => dispatcher.runCycle())
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: false,
      code: 'capture_domain_failed',
      status: 'failed',
      failureCode: 'rate_limited',
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { getMexcRecordId, MexcReadError, readMexcFuturesPreview } from '../lib/server/mexc-readonly'
import { digestEquoraRawResponseBody } from '../lib/server/equora-tcj'
import {
  createMexcSignature,
  executeMexcPrivateReadWorkUnit,
  executeMexcPublicRead,
  inspectMexcWireResponse,
  MEXC_API_ORIGIN,
  MEXC_MAX_RESPONSE_BYTES,
  MEXC_READ_CAPABILITIES,
  MEXC_TRANSPORT_ERROR_POLICY,
  MexcTransportError,
  prepareMexcRequest,
  type MexcBoundCredentialContext,
  type MexcPrivateRequestAuthorization,
  type MexcTransportCaptureBinding,
} from '../lib/server/mexc-transport'

const NOW = 1_760_000_000_000
const SCOPE = {
  symbol: 'BTC_USDT',
  startTime: NOW - 10_000_000,
  endTime: NOW,
}
const PRIVATE_QUERY = {
  symbol: 'BTC_USDT',
  start_time: SCOPE.startTime,
  end_time: SCOPE.endTime,
  page_num: 1,
  page_size: 20,
}
const CREDENTIALS = { apiKey: 'api-key-123', secretKey: 'secret-secret' }
const captureBudget = () => Object.freeze({ absoluteDeadlineAtMs: Date.now() + 60_000 })
const jsonNumber = (lexeme: string) => ({ kind: 'mexc_json_number', lexeme })
const CAPTURE_ACCOUNT = Object.freeze({
  digestAlgorithm: 'hmac-sha256' as const,
  digestContractVersion: 'equora-tcj-v1' as const,
  purpose: 'broker_account_identity_v1' as const,
  keyVersion: 'v1',
  digest: 'a'.repeat(64),
  verificationStatus: 'unverified_reference' as const,
})
const CAPTURE_BINDING: MexcTransportCaptureBinding = Object.freeze({
  bindingVersion: 'mexc-transport-capture-binding-v1',
  accountIdentity: CAPTURE_ACCOUNT,
  brokerAccountId: '00000000-0000-4000-a000-000000000001',
  connectionAccountId: '00000000-0000-4000-a000-000000000005',
  syncActivationId: '00000000-0000-4000-a000-000000000002',
  activationGeneration: 1,
  scopeDigest: Object.freeze({
    digestAlgorithm: 'sha256',
    digestContractVersion: 'equora-tcj-v1',
    domain: 'sync_scope',
    digest: 'b'.repeat(64),
  }),
  workUnitReference: Object.freeze({
    referenceType: 'capture_work_unit_id_v1',
    value: '00000000-0000-4000-a000-000000000006',
  }),
  runReference: Object.freeze({
    referenceType: 'sync_run_id_v1',
    value: '00000000-0000-4000-a000-000000000003',
  }),
  requestResultReference: Object.freeze({
    referenceType: 'provider_request_result_id_v1',
    value: '00000000-0000-4000-a000-000000000004',
  }),
  requestSequence: 1,
})

function boundCredentialContext(overrides: Partial<MexcBoundCredentialContext> = {}): MexcBoundCredentialContext {
  return Object.freeze({
    credentials: CREDENTIALS,
    accountIdentity: CAPTURE_ACCOUNT,
    brokerAccountId: CAPTURE_BINDING.brokerAccountId,
    connectionAccountId: CAPTURE_BINDING.connectionAccountId,
    syncActivationId: CAPTURE_BINDING.syncActivationId,
    activationGeneration: CAPTURE_BINDING.activationGeneration,
    ...overrides,
  })
}

function validRequestAuthorization(
  overrides: Partial<MexcPrivateRequestAuthorization> = {},
): MexcPrivateRequestAuthorization {
  return Object.freeze({
    status: 'request_authorized',
    requestAuthorizationId: '00000000-0000-4000-a000-000000000007',
    sendDeadlineAt: new Date(NOW + 5_000).toISOString(),
    workUnitId: CAPTURE_BINDING.workUnitReference.value,
    requestSequence: CAPTURE_BINDING.requestSequence,
    capabilityId: 'historical_orders_v1',
    scopeDigest: CAPTURE_BINDING.scopeDigest.digest,
    credentialReference: Object.freeze({
      id: '00000000-0000-4000-a000-000000000008',
      keyVersion: 'test_v1',
    }),
    authorityBlocked: true,
    ...overrides,
  })
}

function responseAt(url: string, body: BodyInit | null, init: ResponseInit = {}, redirected = false) {
  const response = new Response(body, init)
  Object.defineProperty(response, 'url', { configurable: true, value: url })
  Object.defineProperty(response, 'redirected', { configurable: true, value: redirected })
  return response
}

function jsonResponse(url: string, data: unknown, status = 200, headers: Record<string, string> = {}) {
  return responseAt(url, JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function success(url: string, data: unknown, headers: Record<string, string> = {}) {
  return jsonResponse(url, { success: true, code: 0, data }, 200, headers)
}

function orderRecord(overrides: Record<string, unknown> = {}) {
  return {
    orderId: '123',
    positionId: '456',
    symbol: 'BTC_USDT',
    side: 1,
    positionMode: 1,
    state: 3,
    category: 1,
    orderType: 1,
    vol: '2.5000',
    dealVol: '2.5000',
    price: '100.1250',
    dealAvgPrice: '100.1250',
    takerFee: '-0.0100',
    makerFee: '0',
    profit: '1.5000',
    feeCurrency: 'USDT',
    createTime: NOW - 2_000,
    updateTime: NOW - 1_000,
    ...overrides,
  }
}

function executionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: '789',
    orderId: '123',
    symbol: 'BTC_USDT',
    side: 1,
    positionMode: 1,
    category: 1,
    vol: '2.5000',
    price: '100.1250',
    fee: '-0.0100',
    feeCurrency: 'USDT',
    profit: '1.5000',
    taker: true,
    timestamp: NOW - 1_500,
    ...overrides,
  }
}

function stubFetch(implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(implementation)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('MEXC G1 GET-only transport contract', () => {
  it('registers exactly six immutable GET capabilities on the pinned HTTPS origin', () => {
    expect(Object.keys(MEXC_READ_CAPABILITIES)).toEqual([
      'server_time_v1',
      'contract_metadata_v1',
      'historical_orders_v1',
      'historical_executions_v3',
      'historical_positions_v1',
      'funding_records_v1',
    ])
    expect(Object.values(MEXC_READ_CAPABILITIES).every((capability) => capability.method === 'GET')).toBe(true)
    expect(MEXC_API_ORIGIN).toBe('https://api.mexc.com')
    expect(MEXC_READ_CAPABILITIES.historical_executions_v3.path).toBe('/api/v1/private/order/list/order_deals/v3')
    expect(JSON.stringify(MEXC_READ_CAPABILITIES)).not.toContain('create')
    expect(JSON.stringify(MEXC_READ_CAPABILITIES)).not.toContain('cancel')
    expect(JSON.stringify(MEXC_READ_CAPABILITIES)).not.toContain('withdraw')
  })

  it('rejects unknown capabilities, query keys and injection-shaped symbols before time, fetch or credentials', async () => {
    expect(() => prepareMexcRequest('unknown' as never, {})).toThrowError(MexcTransportError)
    expect(() => prepareMexcRequest('historical_orders_v1', { ...PRIVATE_QUERY, host: 'evil.example' })).toThrowError(/Capabilityvertrag/)
    expect(() => prepareMexcRequest('contract_metadata_v1', { symbol: 'https://evil.example/../BTC_USDT' })).toThrowError(/Symbol/)

    const credentialLoader = vi.fn(() => CREDENTIALS)
    const fetchMock = stubFetch(async () => { throw new Error('must not fetch') })
    await expect(executeMexcPrivateReadWorkUnit([
      { capabilityId: 'historical_orders_v1', query: { symbol: 'BTC_USDT', page_num: 1 } },
    ], credentialLoader)).rejects.toMatchObject({ code: 'invalid_query' })
    expect(credentialLoader).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('canonicalizes the query by ASCII key order and matches a fixed HMAC vector', () => {
    const request = prepareMexcRequest('historical_orders_v1', {
      symbol: 'btc_usdt',
      start_time: 1_759_990_000_000,
      end_time: 1_760_000_000_000,
      page_num: 1,
      page_size: 20,
    })
    expect(request.queryString).toBe('end_time=1760000000000&page_num=1&page_size=20&start_time=1759990000000&symbol=BTC_USDT')
    expect(createMexcSignature('api-key-123', 'secret-secret', 1_759_999_999_999, request.queryString))
      .toBe('e1b596dacd63faed2c9fbb96c5fb74a708a339c1f4cef2e007d484afc39c6890')
  })

  it('pins metadata, position and funding query contracts without legacy aliases', () => {
    expect(prepareMexcRequest('contract_metadata_v1', { symbol: 'btc_usdt' }).query)
      .toEqual({ symbol: 'BTC_USDT' })

    const positionQuery = { ...PRIVATE_QUERY, position_type: 1 }
    expect(prepareMexcRequest('historical_positions_v1', positionQuery).query)
      .toMatchObject({ symbol: 'BTC_USDT', position_type: '1', page_num: '1', page_size: '20' })
    expect(() => prepareMexcRequest('historical_positions_v1', { ...positionQuery, type: 1 }))
      .toThrowError(/Capabilityvertrag/)
    expect(() => prepareMexcRequest('historical_positions_v1', { ...PRIVATE_QUERY, position_type: 3 }))
      .toThrowError(/position_type/)

    expect(prepareMexcRequest('funding_records_v1', { ...positionQuery, position_id: '000456' }).query)
      .toMatchObject({ position_type: '1', position_id: '456' })
    expect(() => prepareMexcRequest('funding_records_v1', { ...positionQuery, position_id: '456x' }))
      .toThrowError(/Position-ID/)
  })

  it.each([301, 302, 303, 307, 308])('forbids HTTP %s redirects and sends only GET with redirect=error', async (status) => {
    const fetchMock = stubFetch(async (input, init) => {
      expect(init?.method).toBe('GET')
      expect(init?.redirect).toBe('error')
      expect(new Headers(init?.headers).get('accept-encoding')).toBe('identity')
      return responseAt(String(input), '', { status, headers: { location: 'https://evil.example/target' } })
    })

    await expect(executeMexcPublicRead('server_time_v1', {})).rejects.toMatchObject({
      code: 'transport_contract_violation',
      httpStatus: status,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    'https://api.mexc.com/api/v1/contract/detail/country',
    'https://sub.api.mexc.com/api/v1/contract/ping',
    'https://api.mexc.com:444/api/v1/contract/ping',
    'http://api.mexc.com/api/v1/contract/ping',
    'https://evil.example/api/v1/contract/ping',
  ])('rejects a mismatching final response URL without a second request: %s', async (finalUrl) => {
    const fetchMock = stubFetch(async () => success(finalUrl, NOW))

    await expect(executeMexcPublicRead('server_time_v1', {})).rejects.toMatchObject({ code: 'transport_contract_violation' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('classifies redirected responses and redirect transport failures as contract violations', async () => {
    const expectedUrl = `${MEXC_API_ORIGIN}/api/v1/contract/ping`
    stubFetch(async () => responseAt(expectedUrl, JSON.stringify({ success: true, code: 0, data: NOW }), {
      headers: { 'content-type': 'application/json' },
    }, true))
    await expect(executeMexcPublicRead('server_time_v1', {})).rejects.toMatchObject({ code: 'transport_contract_violation' })

    const redirectFailure = new TypeError('fetch failed') as TypeError & { cause?: Error }
    redirectFailure.cause = new Error('unexpected redirect')
    stubFetch(async () => { throw redirectFailure })
    await expect(executeMexcPublicRead('server_time_v1', {})).rejects.toMatchObject({ code: 'transport_contract_violation' })
  })

  it('rejects a provider-controlled lookalike object in the envelope code field', async () => {
    stubFetch(async (input) => jsonResponse(String(input), {
      success: true,
      code: { kind: 'mexc_json_number', lexeme: '0' },
      data: NOW,
    }))

    await expect(executeMexcPublicRead('server_time_v1', {})).rejects.toMatchObject({ code: 'malformed_response' })
  })

  it('rejects invalid provider time before credential access or private requests', async () => {
    const credentialLoader = vi.fn(() => CREDENTIALS)
    let privateRequests = 0
    stubFetch(async (input) => {
      const url = String(input)
      if (url.includes('/private/')) privateRequests += 1
      return success(url, String(NOW))
    })

    await expect(readMexcFuturesPreview(credentialLoader, SCOPE)).rejects.toMatchObject({ errorCode: 'invalid_provider_time' })
    expect(credentialLoader).not.toHaveBeenCalled()
    expect(privateRequests).toBe(0)
  })

  it('rejects a provider-controlled number-token lookalike before credential access', async () => {
    const credentialLoader = vi.fn(() => CREDENTIALS)
    stubFetch(async (input) => success(String(input), {
      kind: 'mexc_json_number',
      lexeme: String(NOW),
    }))

    await expect(executeMexcPrivateReadWorkUnit([
      { capabilityId: 'historical_orders_v1', query: PRIVATE_QUERY },
    ], credentialLoader)).rejects.toMatchObject({ code: 'invalid_provider_time' })
    expect(credentialLoader).not.toHaveBeenCalled()
  })

  it('classifies a runtime-invalid preview symbol without fetch or credential access', async () => {
    const credentialLoader = vi.fn(() => CREDENTIALS)
    const fetchMock = stubFetch(async () => { throw new Error('must not fetch') })

    await expect(readMexcFuturesPreview(credentialLoader, { ...SCOPE, symbol: null as never }))
      .rejects.toMatchObject({ errorCode: 'invalid_scope' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(credentialLoader).not.toHaveBeenCalled()
  })

  it.each([null, String(NOW), NOW + 0.5, 1_760_000_000, NOW + 60_001])(
    'rejects implausible provider time %s before loading credentials',
    async (invalidTime) => {
      const credentialLoader = vi.fn(() => CREDENTIALS)
      stubFetch(async (input) => success(String(input), invalidTime))

      await expect(executeMexcPrivateReadWorkUnit([
        { capabilityId: 'historical_orders_v1', query: PRIVATE_QUERY },
      ], credentialLoader)).rejects.toMatchObject({ code: 'invalid_provider_time' })
      expect(credentialLoader).not.toHaveBeenCalled()
    },
  )

  it('binds private reads to validated provider time and loads credentials once after validation', async () => {
    const credentialLoader = vi.fn(() => CREDENTIALS)
    const fetchMock = stubFetch(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/v1/contract/ping')) return success(url, NOW)
      expect(init?.method).toBe('GET')
      expect(new Headers(init?.headers).get('request-time')).toBe(String(NOW))
      expect(new Headers(init?.headers).get('apikey')).toBe(CREDENTIALS.apiKey)
      return success(url, [])
    })

    const result = await executeMexcPrivateReadWorkUnit([
      { capabilityId: 'historical_orders_v1', query: PRIVATE_QUERY },
      { capabilityId: 'historical_executions_v3', query: PRIVATE_QUERY },
    ], credentialLoader)
    expect(result.serverTime).toBe(NOW)
    expect(result.outcomes).toHaveLength(2)
    expect(result.outcomes.every((outcome) => outcome.status === 'wire_succeeded')).toBe(true)
    expect(credentialLoader).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('accepts only immutable Wire Responses with module-private transport provenance', async () => {
    const pingUrl = `${MEXC_API_ORIGIN}/api/v1/contract/ping`
    stubFetch(async () => success(pingUrl, NOW))

    const authentic = await executeMexcPublicRead('server_time_v1', {})
    expect(inspectMexcWireResponse(authentic)).toBe(authentic)
    expect(authentic).toMatchObject({
      captureBinding: null,
      httpStatus: 200,
      rawBodyBytes: expect.any(Number),
      request: { capabilityId: 'server_time_v1', method: 'GET', query: {} },
      requestDurationMs: expect.any(Number),
      requestStartedAtUs: String(BigInt(NOW) * BigInt(1_000)),
      responseReceivedAtUs: String(BigInt(NOW) * BigInt(1_000)),
    })
    expect(Object.isFrozen(authentic)).toBe(true)
    expect(Object.isFrozen(authentic.request)).toBe(true)
    expect(Object.isFrozen(authentic.request.query)).toBe(true)

    expect(() => inspectMexcWireResponse({ ...authentic })).toThrowError(/Transportprovenienz/)
    const reflected = { ...authentic } as Record<PropertyKey, unknown>
    for (const symbol of Object.getOwnPropertySymbols(authentic)) {
      Object.defineProperty(reflected, symbol, Object.getOwnPropertyDescriptor(authentic, symbol)!)
    }
    Object.freeze(reflected)
    expect(() => inspectMexcWireResponse(reflected as never)).toThrowError(/Transportprovenienz/)
  })

  it('rejects a capture-bound request without a single-use permit before credential access', async () => {
    const pingUrl = `${MEXC_API_ORIGIN}/api/v1/contract/ping`
    const fetchMock = stubFetch(async () => success(pingUrl, NOW))
    const credentialLoader = vi.fn(() => boundCredentialContext())

    await expect(executeMexcPrivateReadWorkUnit([
      { capabilityId: 'historical_orders_v1', query: PRIVATE_QUERY, captureBinding: CAPTURE_BINDING },
    ], credentialLoader)).rejects.toMatchObject({ code: 'transport_contract_violation' })
    expect(credentialLoader).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires capture purpose binding to come from the same credential-loader context', async () => {
    const pingUrl = `${MEXC_API_ORIGIN}/api/v1/contract/ping`
    const fetchMock = stubFetch(async () => success(pingUrl, NOW))

    await expect(executeMexcPrivateReadWorkUnit([
      { capabilityId: 'historical_orders_v1', query: PRIVATE_QUERY, captureBinding: CAPTURE_BINDING },
    ], () => CREDENTIALS, async () => validRequestAuthorization(), captureBudget())).rejects.toMatchObject({
      code: 'transport_contract_violation',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['account identity', boundCredentialContext({
      accountIdentity: Object.freeze({ ...CAPTURE_ACCOUNT, digest: 'c'.repeat(64) }),
    })],
    ['broker account', boundCredentialContext({
      brokerAccountId: '00000000-0000-4000-a000-000000000011',
    })],
    ['connection account', boundCredentialContext({
      connectionAccountId: '00000000-0000-4000-a000-000000000013',
    })],
    ['activation id', boundCredentialContext({
      syncActivationId: '00000000-0000-4000-a000-000000000012',
    })],
    ['activation generation', boundCredentialContext({ activationGeneration: 2 })],
  ])('rejects a bound credential context with only mismatching %s', async (_label, credentialContext) => {
    const pingUrl = `${MEXC_API_ORIGIN}/api/v1/contract/ping`
    const fetchMock = stubFetch(async () => success(pingUrl, NOW))

    await expect(executeMexcPrivateReadWorkUnit([
      { capabilityId: 'historical_orders_v1', query: PRIVATE_QUERY, captureBinding: CAPTURE_BINDING },
    ], () => credentialContext, async () => validRequestAuthorization(), captureBudget())).rejects.toMatchObject({
      code: 'transport_contract_violation',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('binds authorization, exact credential generation and private GET in fail-closed order', async () => {
    const events: string[] = []
    const fetchMock = stubFetch(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/v1/contract/ping')) {
        events.push('server-time')
        return success(url, NOW)
      }
      events.push('private-get')
      return success(url, [])
    })
    const authorizeRequest = vi.fn(async () => {
      events.push('request-authorized')
      return validRequestAuthorization()
    })
    const credentialLoader = vi.fn((reference) => {
      events.push('credential-loaded')
      expect(reference).toEqual({
        id: '00000000-0000-4000-a000-000000000008',
        keyVersion: 'test_v1',
      })
      return boundCredentialContext()
    })

    await expect(executeMexcPrivateReadWorkUnit([
      { capabilityId: 'historical_orders_v1', query: PRIVATE_QUERY, captureBinding: CAPTURE_BINDING },
    ], credentialLoader, authorizeRequest, captureBudget())).resolves.toMatchObject({
      outcomes: [{ capabilityId: 'historical_orders_v1', status: 'wire_succeeded' }],
    })
    expect(authorizeRequest).toHaveBeenCalledWith({
      capabilityId: 'historical_orders_v1',
      workUnitId: CAPTURE_BINDING.workUnitReference.value,
      requestSequence: CAPTURE_BINDING.requestSequence,
      scopeDigest: CAPTURE_BINDING.scopeDigest.digest,
    })
    expect(events).toEqual(['request-authorized', 'server-time', 'credential-loaded', 'private-get'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('blocks credential access when the permit expires during the authorized server-time GET', async () => {
    let currentTime = NOW
    vi.mocked(Date.now).mockImplementation(() => currentTime)
    const pingUrl = `${MEXC_API_ORIGIN}/api/v1/contract/ping`
    const fetchMock = stubFetch(async (input) => {
      const url = String(input)
      expect(url).toBe(pingUrl)
      currentTime = NOW + 5_001
      return success(url, currentTime)
    })
    const credentialLoader = vi.fn(() => boundCredentialContext())

    await expect(executeMexcPrivateReadWorkUnit([
      { capabilityId: 'historical_orders_v1', query: PRIVATE_QUERY, captureBinding: CAPTURE_BINDING },
    ], credentialLoader, async () => validRequestAuthorization(), captureBudget())).rejects.toMatchObject({
      code: 'transport_contract_violation',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(credentialLoader).not.toHaveBeenCalled()
  })

  it('blocks credential access when the absolute invocation deadline expires during server-time GET', async () => {
    let currentTime = NOW
    vi.mocked(Date.now).mockImplementation(() => currentTime)
    const pingUrl = `${MEXC_API_ORIGIN}/api/v1/contract/ping`
    const fetchMock = stubFetch(async (input) => {
      const url = String(input)
      expect(url).toBe(pingUrl)
      currentTime = NOW + 1_001
      return success(url, currentTime)
    })
    const credentialLoader = vi.fn(() => boundCredentialContext())

    await expect(executeMexcPrivateReadWorkUnit([
      { capabilityId: 'historical_orders_v1', query: PRIVATE_QUERY, captureBinding: CAPTURE_BINDING },
    ], credentialLoader, async () => validRequestAuthorization({
      sendDeadlineAt: new Date(NOW + 5_000).toISOString(),
    }), { absoluteDeadlineAtMs: NOW + 1_000 })).rejects.toMatchObject({ code: 'timeout' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(credentialLoader).not.toHaveBeenCalled()
  })

  it('rejects an expired or scope-mismatching permit before credential access or private GET', async () => {
    const cases: MexcPrivateRequestAuthorization[] = [
      validRequestAuthorization({ sendDeadlineAt: new Date(NOW).toISOString() }),
      validRequestAuthorization({ scopeDigest: 'c'.repeat(64) }),
    ]

    for (const authorization of cases) {
      const pingUrl = `${MEXC_API_ORIGIN}/api/v1/contract/ping`
      const fetchMock = stubFetch(async () => success(pingUrl, NOW))
      const credentialLoader = vi.fn(() => boundCredentialContext())

      await expect(executeMexcPrivateReadWorkUnit([
        { capabilityId: 'historical_orders_v1', query: PRIVATE_QUERY, captureBinding: CAPTURE_BINDING },
      ], credentialLoader, async () => authorization, captureBudget())).rejects.toMatchObject({
        code: 'transport_contract_violation',
      })
      expect(credentialLoader).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    }
  })

  it('rejects a capture binding whose WorkUnit reference has the wrong reference contract', async () => {
    const pingUrl = `${MEXC_API_ORIGIN}/api/v1/contract/ping`
    const fetchMock = stubFetch(async () => success(pingUrl, NOW))
    const captureBinding = Object.freeze({
      ...CAPTURE_BINDING,
      workUnitReference: Object.freeze({
        referenceType: 'sync_run_id_v1',
        value: CAPTURE_BINDING.workUnitReference.value,
      }),
    })

    await expect(executeMexcPrivateReadWorkUnit([
      { capabilityId: 'historical_orders_v1', query: PRIVATE_QUERY, captureBinding: captureBinding as never },
    ], () => boundCredentialContext())).rejects.toMatchObject({ code: 'transport_contract_violation' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps capability failures explicit instead of substituting an empty response', async () => {
    const credentialLoader = vi.fn(() => CREDENTIALS)
    stubFetch(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/v1/contract/ping')) return success(url, NOW)
      if (url.includes('/history_orders')) return success(url, [])
      if (url.includes('/order_deals/v3')) {
        return jsonResponse(url, { success: false, code: 510, data: null })
      }
      throw new Error('unexpected request')
    })

    const result = await executeMexcPrivateReadWorkUnit([
      { capabilityId: 'historical_orders_v1', query: PRIVATE_QUERY },
      { capabilityId: 'historical_executions_v3', query: PRIVATE_QUERY },
    ], credentialLoader)

    expect(result.outcomes).toMatchObject([
      { capabilityId: 'historical_orders_v1', status: 'wire_succeeded', response: { data: [] } },
      { capabilityId: 'historical_executions_v3', status: 'failed', error: { code: 'rate_limited' } },
    ])
    expect(credentialLoader).toHaveBeenCalledTimes(1)
  })

  it('fails the preview adapter when one required wire outcome fails', async () => {
    stubFetch(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/v1/contract/ping')) return success(url, NOW)
      if (url.includes('/history_orders')) return success(url, [])
      if (url.includes('/order_deals/v3')) return jsonResponse(url, { success: false, code: 510, data: null })
      throw new Error('unexpected request')
    })

    await expect(readMexcFuturesPreview(() => CREDENTIALS, SCOPE))
      .rejects.toMatchObject({ errorCode: 'rate_limited' })
  })

  it('bounds identity bodies with missing, chunked, exact and inconsistent Content-Length', async () => {
    const pingUrl = `${MEXC_API_ORIGIN}/api/v1/contract/ping`

    stubFetch(async () => responseAt(pingUrl, 'x'.repeat(MEXC_MAX_RESPONSE_BYTES + 1), {
      headers: { 'content-type': 'application/json' },
    }))
    await expect(executeMexcPublicRead('server_time_v1', {})).rejects.toMatchObject({ code: 'response_too_large' })

    stubFetch(async () => responseAt(pingUrl, '{"success":true,"code":0,"data":1760000000000}', {
      headers: { 'content-type': 'application/json', 'content-length': '1' },
    }))
    await expect(executeMexcPublicRead('server_time_v1', {})).rejects.toMatchObject({ code: 'transport_contract_violation' })

    const streamedHeaderCases: Record<string, string>[] = [{}, { 'transfer-encoding': 'chunked' }]
    for (const headers of streamedHeaderCases) {
      stubFetch(async () => success(pingUrl, NOW, headers))
      const result = await executeMexcPublicRead('server_time_v1', {})
      expect(result).toMatchObject({ data: jsonNumber(String(NOW)) })
      expect(result.rawBodyDigest).toEqual(digestEquoraRawResponseBody(new TextEncoder().encode(
        JSON.stringify({ success: true, code: 0, data: NOW }),
      )))
    }

    const envelope = JSON.stringify({ success: true, code: 0, data: NOW })
    const exactBody = envelope.padEnd(MEXC_MAX_RESPONSE_BYTES, ' ')
    stubFetch(async () => responseAt(pingUrl, exactBody, {
      headers: { 'content-type': 'application/json', 'content-length': String(MEXC_MAX_RESPONSE_BYTES) },
    }))
    await expect(executeMexcPublicRead('server_time_v1', {})).resolves.toMatchObject({ data: jsonNumber(String(NOW)), rawBodyBytes: MEXC_MAX_RESPONSE_BYTES })
  })

  it('requests identity encoding and rejects every compressed response before JSON parsing', async () => {
    const fetchMock = stubFetch(async (input, init) => {
      expect(new Headers(init?.headers).get('accept-encoding')).toBe('identity')
      return success(String(input), NOW, { 'content-encoding': 'gzip' })
    })

    await expect(executeMexcPublicRead('server_time_v1', {})).rejects.toMatchObject({ code: 'transport_contract_violation' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['401', 'invalid_credential'], ['402', 'invalid_credential'], ['602', 'invalid_credential'],
    ['406', 'ip_not_allowed'], ['511', 'permission_missing'], ['701', 'permission_missing'], ['704', 'permission_missing'],
    ['510', 'rate_limited'], ['500', 'provider_busy'], ['501', 'provider_busy'], ['801', 'provider_busy'],
    ['604', 'maintenance'], ['513', 'invalid_request'], ['600', 'invalid_request'], ['601', 'malformed_response'],
    ['1001', 'unsupported_contract'], ['1002', 'unsupported_contract'], ['9999', 'unknown_provider_error'],
  ])('maps provider code %s to %s with an explicit retry policy', async (providerCode, expectedCode) => {
    stubFetch(async (input) => jsonResponse(String(input), { success: false, code: providerCode, data: null }))

    await expect(executeMexcPublicRead('server_time_v1', {})).rejects.toMatchObject({ code: expectedCode, providerCode })
    expect(MEXC_TRANSPORT_ERROR_POLICY[expectedCode as keyof typeof MEXC_TRANSPORT_ERROR_POLICY]).toBeDefined()
  })

  it('uses the scoped /v3 preview and never converts malformed mixed items to an empty success', async () => {
    const requestedUrls: string[] = []
    stubFetch(async (input) => {
      const url = String(input)
      requestedUrls.push(url)
      if (url.endsWith('/api/v1/contract/ping')) return success(url, NOW)
      if (url.includes('/history_orders')) return success(url, [orderRecord(), 7])
      if (url.includes('/order_deals/v3')) return success(url, [])
      throw new Error('unexpected request')
    })

    await expect(readMexcFuturesPreview(() => CREDENTIALS, SCOPE)).rejects.toBeInstanceOf(MexcReadError)
    expect(requestedUrls.some((url) => url.includes('/order_deals/v3'))).toBe(true)
    expect(requestedUrls.every((url) => url.startsWith(MEXC_API_ORIGIN))).toBe(true)
    expect(requestedUrls.every((url) => !url.includes('contract.mexc.com'))).toBe(true)
  })

  it('preserves an unquoted provider ID above Number.MAX_SAFE_INTEGER exactly', async () => {
    const providerId = '900719925474099312345'
    stubFetch(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/v1/contract/ping')) return success(url, NOW)
      if (url.includes('/history_orders')) {
        const rawOrder = JSON.stringify(orderRecord({ orderId: '__UNQUOTED_PROVIDER_ID__' })).replace('"__UNQUOTED_PROVIDER_ID__"', providerId)
        return responseAt(url, `{"success":true,"code":0,"data":[${rawOrder}]}`, {
          headers: { 'content-type': 'application/json' },
        })
      }
      return success(url, [executionRecord()])
    })

    const result = await readMexcFuturesPreview(() => CREDENTIALS, SCOPE)
    expect(getMexcRecordId(result.orders[0] ?? {}, 'order')).toBe(providerId)
    expect(result.orders[0]?.orderId).toMatchObject({ kind: 'mexc_json_number', lexeme: providerId })
  })

  it('blocks the unconfirmed page-object shape instead of treating it as a complete preview', async () => {
    stubFetch(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/v1/contract/ping')) return success(url, NOW)
      return success(url, { currentPage: 1, pageSize: 20, totalCount: 0, totalPage: 0, resultList: [] })
    })

    await expect(readMexcFuturesPreview(() => CREDENTIALS, SCOPE)).rejects.toMatchObject({ errorCode: 'malformed_response' })
  })

  it('requires provider IDs instead of fabricating symbol/time fallbacks', () => {
    expect(getMexcRecordId({ orderId: '000123', symbol: 'BTC_USDT' }, 'order')).toBe('123')
    expect(() => getMexcRecordId({ symbol: 'BTC_USDT', createTime: NOW }, 'order')).toThrowError(/Provider-ID/)
  })
})

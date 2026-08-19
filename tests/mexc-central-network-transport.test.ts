import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  computeAuthorityTupleDigest,
  computeCaptureQueryProfileDigest,
  computeCapturePurposeScopeDigest,
  createBrokerRequestPlanningBoundary,
  createCentralBrokerEgress,
  type BrokerNetworkTransportPort,
  type BrokerSendAuthorization,
  type CanonicalJsonValue,
  type CaptureAuthorityTuple,
  type CaptureBrokerReadExecution,
  type CentralBrokerEgressDependencies,
} from '../lib/server/broker-core-contracts'
import { brokerCodeRegistry } from '../lib/server/broker-code-registry'
import { mexcBrokerNetworkTransport } from '../lib/server/mexc-central-network-transport'
import {
  MEXC_ADAPTER_CHECKPOINT_CONTRACT_VERSION,
  MEXC_READONLY_CAPABILITIES,
} from '../lib/server/providers/mexc-readonly-adapter'
import {
  MexcTransportError,
  canonicalMexcCaptureQueryProfile,
  type MexcReadCapabilityId,
} from '../lib/server/mexc-request-contract'

const HISTORY_QUERY = Object.freeze({
  symbol: 'BTC_USDT',
  start_time: 1_760_000_000_000,
  end_time: 1_760_000_100_000,
  page_num: 1,
  page_size: 20,
})

function credentialFrame(apiKey = 'readonly-api-key', secretKey = 'readonly-secret-key') {
  const api = new TextEncoder().encode(apiKey)
  const secret = new TextEncoder().encode(secretKey)
  const frame = new Uint8Array(5 + api.byteLength + secret.byteLength)
  frame[0] = 1
  frame[1] = Math.floor(api.byteLength / 256)
  frame[2] = api.byteLength % 256
  frame[3] = Math.floor(secret.byteLength / 256)
  frame[4] = secret.byteLength % 256
  frame.set(api, 5)
  frame.set(secret, 5 + api.byteLength)
  return frame
}

function captureWork(capabilityId: 'historical_orders_v1' | 'contract_metadata_v1') {
  const descriptor = MEXC_READONLY_CAPABILITIES.find((candidate) => candidate.ref.providerCapabilityId === capabilityId)!
  const requestInput = (capabilityId === 'contract_metadata_v1'
    ? { symbol: HISTORY_QUERY.symbol }
    : HISTORY_QUERY) as unknown as CanonicalJsonValue
  const captureQueryProfileDigest = computeCaptureQueryProfileDigest({
    provider: descriptor.ref,
    queryContractVersion: descriptor.queryContractVersion,
    stableCanonicalQuery: canonicalMexcCaptureQueryProfile(capabilityId as MexcReadCapabilityId, requestInput),
  })
  const scope = {
    instrumentScopeKey: HISTORY_QUERY.symbol,
    requestWindowStartUs: capabilityId === 'contract_metadata_v1'
      ? '0'
      : String(BigInt(HISTORY_QUERY.start_time) * BigInt(1_000)),
    requestWindowEndUs: capabilityId === 'contract_metadata_v1'
      ? '0'
      : String(BigInt(HISTORY_QUERY.end_time) * BigInt(1_000)),
    positionType: null,
    captureQueryProfileDigest,
  } as const
  const now = Date.now()
  const authority = {
    authorityTupleContractVersion: 'equora-broker-authority-tuple-v1',
    authorityTupleDigest: '',
    authorityPurpose: 'capture',
    userId: 'central-user',
    environment: 'live',
    runtimeAuthority: {
      requiredMode: 'capture',
      runtimeConfigurationDigest: 'central-runtime-digest',
      deploymentIdentity: 'central-deployment',
      runtimeAuthorityEpoch: 1,
    },
    provider: descriptor.ref,
    capabilityProfile: { profileId: 'mexc_futures_rest', profileVersion: 'v1', profileDigest: 'profile-digest' },
    commonPolicyPins: {
      runtimePolicyVersion: 'runtime-policy-v1',
      requestAuthorityPolicyVersion: 'request-policy-v1',
      failurePolicyVersion: 'failure-policy-v1',
    },
    purposeScopeDigest: computeCapturePurposeScopeDigest(scope),
    purposeRequestSequence: 1,
    workUnitId: `central-work-${capabilityId}`,
    expectedWorkUnitRowVersion: 1,
    claim: { claimRequestId: 'claim-1', leaseId: 'lease-1', leaseEpoch: 1, leaseTokenDigest: 'lease-digest' },
    activation: { id: 'activation-1', generation: 1, authorityEpoch: 1 },
    account: {
      brokerAccountId: 'broker-account-1',
      connectionAccountId: 'connection-account-1',
      identityDigest: 'identity-digest',
      identityKeyVersion: 'v1',
    },
    persistentCredentialReference: { id: 'credential-ref-1', keyVersion: 'v1', generation: 1 },
    checkpointContractVersion: MEXC_ADAPTER_CHECKPOINT_CONTRACT_VERSION,
    capturePolicyPins: {
      claimPolicyVersion: 'claim-policy-v1',
      leasePolicyVersion: 'lease-policy-v1',
      checkpointPolicyVersion: 'checkpoint-policy-v1',
    },
    captureBudget: {
      pageLimit: 10,
      responseByteLimit: 64 * 1024,
      requestDeadlineAt: new Date(now + 60_000).toISOString(),
    },
  } as CaptureAuthorityTuple
  ;(authority as unknown as { authorityTupleDigest: string }).authorityTupleDigest = computeAuthorityTupleDigest(authority)
  const chainBinding = { chainId: `central-chain-${capabilityId}`, authorityPurpose: 'capture', authority } as const
  return {
    descriptor,
    authority,
    requestInput,
    workUnit: {
      chainBinding,
      integrityKeyReference: { id: 'integrity-key-1', keyVersion: 'v1' },
      scope,
      checkpoint: {
        checkpointContractVersion: MEXC_ADAPTER_CHECKPOINT_CONTRACT_VERSION,
        captureQueryProfileDigest,
        payload: {
          checkpointContractVersion: MEXC_ADAPTER_CHECKPOINT_CONTRACT_VERSION,
          captureQueryProfileDigest,
          providerCapabilityId: capabilityId,
          lastPageObservationId: null,
          nextPageNumber: 1,
          terminal: false,
        },
        mac: 'checkpoint-mac',
      },
    },
  }
}

async function centralHarness(
  capabilityId: 'historical_orders_v1' | 'contract_metadata_v1',
  credentialMaterial = credentialFrame(),
) {
  const fixture = captureWork(capabilityId)
  const planned = await createBrokerRequestPlanningBoundary(brokerCodeRegistry).prepareCaptureRead({
    workUnit: fixture.workUnit as never,
    requestId: `central-request-${capabilityId}`,
    requestInput: fixture.requestInput,
  })
  const authorizationBinding = Object.freeze({
    requestAuthorityId: `central-authority-${capabilityId}`,
    authorityPurpose: 'capture' as const,
    requestBinding: planned.requestBinding,
  })
  const now = Date.now()
  const permit = Object.freeze({
    authority: fixture.authority,
    canonicalUnsignedRequestDigest: planned.requestBinding.canonicalUnsignedRequestDigest,
    requestAuthorityId: authorizationBinding.requestAuthorityId,
    authorizationBinding,
    permitContractVersion: 'equora-broker-read-permit-v1' as const,
    singleUse: true as const,
    issuedAt: new Date(now - 1_000).toISOString(),
    sendDeadlineAt: fixture.authority.captureBudget.requestDeadlineAt,
  })
  const execution = {
    authorityPurpose: 'capture',
    capabilityContract: planned.capabilityContract,
    requestBinding: planned.requestBinding,
    authorizationBinding,
    plan: planned.plan,
    permit,
  } as unknown as CaptureBrokerReadExecution<any, any>
  const counts = { controlPlane: 0, credentialLoader: 0, networkTransport: 0 }
  let capturedTransportInput: {
    plan: typeof planned.plan
    credentialMaterial: Uint8Array
    sendAuthorization: BrokerSendAuthorization<'capture'>
  } | null = null
  const wrappedTransport: BrokerNetworkTransportPort = {
    async executeCentralRead(input) {
      counts.networkTransport += 1
      capturedTransportInput = {
        plan: input.plan as typeof planned.plan,
        credentialMaterial: Uint8Array.from(input.credentialMaterial),
        sendAuthorization: input.sendAuthorization as BrokerSendAuthorization<'capture'>,
      }
      return mexcBrokerNetworkTransport.executeCentralRead(input)
    },
  }
  const dependencies: CentralBrokerEgressDependencies = {
    trustedClock: { nowEpochMs: () => Date.now() },
    codeRegistry: brokerCodeRegistry,
    runtimeAuthority: {
      async readCurrentRuntimeAuthority() { return fixture.authority.runtimeAuthority },
      async consumeCurrentRuntimeAuthoritySendFenceAtomically(command) {
        const expected = command.expectedRuntimeAuthority
        const current = fixture.authority.runtimeAuthority
        const currentAuthorityTupleDigest = computeAuthorityTupleDigest(fixture.authority)
        if (command.authorityPurpose !== 'capture'
          || fixture.authority.authorityTupleDigest !== currentAuthorityTupleDigest
          || command.authorityTupleDigest !== currentAuthorityTupleDigest
          || expected.requiredMode !== current.requiredMode
          || expected.runtimeConfigurationDigest !== current.runtimeConfigurationDigest
          || expected.deploymentIdentity !== current.deploymentIdentity
          || expected.runtimeAuthorityEpoch !== current.runtimeAuthorityEpoch) {
          throw new Error('fixture_runtime_authority_send_fence_rejected')
        }
        return {
          receiptContractVersion: 'equora-broker-runtime-authority-send-fence-receipt-v2',
          runtimeAuthorityFenceId: command.runtimeAuthorityFenceId,
          uniquenessScope: command.uniquenessScope,
          authorityPurpose: command.authorityPurpose,
          provider: command.provider,
          currentRuntimeAuthority: current,
          currentAuthorityTuple: fixture.authority,
          currentAuthorityTupleDigest,
          authorityTupleDigest: command.authorityTupleDigest,
          requestAuthorityId: command.requestAuthorityId,
          permitConsumptionId: command.permitConsumptionId,
          canonicalUnsignedRequestDigest: command.canonicalUnsignedRequestDigest,
          capabilityDescriptorDigest: command.capabilityDescriptorDigest,
          sendDeadlineAt: command.sendDeadlineAt,
          validatedAtEpochMs: command.trustedNowEpochMs,
          runtimeAuthorityTransactionId: `central-runtime-authority-${command.runtimeAuthorityFenceId}`,
        } as never
      },
    },
    controlPlane: {
      async consumeCapturePermitAtomically(command) {
        counts.controlPlane += 1
        return {
          receiptContractVersion: 'equora-broker-permit-consumption-v1',
          consumptionKeyContractVersion: command.consumptionKeyContractVersion,
          permitConsumptionId: command.permitConsumptionId,
          uniquenessScope: command.uniquenessScope,
          authorityPurpose: 'capture',
          authorityTupleDigest: command.authorityTupleDigest,
          requestAuthorityId: command.execution.authorizationBinding.requestAuthorityId,
          canonicalUnsignedRequestDigest: command.canonicalUnsignedRequestDigest,
          permitContractVersion: command.execution.permit.permitContractVersion,
          sendDeadlineAt: command.execution.permit.sendDeadlineAt,
          consumedAt: new Date(command.trustedNowEpochMs).toISOString(),
          controlPlaneTransactionId: 'central-transaction-1',
        }
      },
      async consumeConnectionProbePermitAtomically() {
        throw new Error('probe permit must not be used')
      },
    },
    credentialLoader: {
      async loadCaptureCredentialMaterial() {
        counts.credentialLoader += 1
        return credentialMaterial
      },
      async loadConnectionProbeCredentialMaterial() {
        throw new Error('probe credentials must not be used')
      },
    },
    networkTransport: wrappedTransport,
  }
  return {
    fixture,
    execution,
    egress: createCentralBrokerEgress(dependencies),
    counts,
    captured: () => capturedTransportInput,
  }
}

function responseAt(url: string, body: string) {
  const response = new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) },
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MEXC central BrokerNetworkTransportPort', () => {
  it('executes a pinned signed GET only through CentralBrokerEgress and consumes its authorization once', async () => {
    const body = JSON.stringify({ success: true, code: 0, data: [] })
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init })
      return responseAt(String(url), body)
    }))
    const harness = await centralHarness('historical_orders_v1')
    const result = await harness.egress.executeAuthorizedRead(harness.execution)
    expect(harness.counts).toEqual({ controlPlane: 1, credentialLoader: 1, networkTransport: 1 })
    expect(calls).toHaveLength(1)
    const headers = new Headers(calls[0].init.headers)
    expect(headers.get('ApiKey')).toBe('readonly-api-key')
    expect(headers.get('Signature')).toMatch(/^[a-f0-9]{64}$/)
    expect(result.wireResponse.httpStatus).toBe(200)

    const captured = harness.captured()
    if (!captured) throw new Error('transport input was not captured')
    await expect(mexcBrokerNetworkTransport.executeCentralRead(captured)).rejects.toThrow(/bereits verbraucht|nicht für exakt/)
    expect(calls).toHaveLength(1)
  })

  it.each([
    ['method', { method: 'POST' }],
    ['origin', { httpsOrigin: 'https://example.invalid' }],
    ['path', { canonicalPath: '/api/v1/private/order/submit' }],
    ['redirect', { redirectMode: 'follow' }],
    ['response budget', { responseByteLimit: 128 * 1024 }],
    ['timeout', { requestTimeoutMs: 60_000 }],
    ['plan contract', { planContractVersion: 'equora-mexc-broker-read-plan-v2' }],
    ['page sequence contract', { pageSequenceContractVersion: 'foreign-page-sequence-v1' }],
    ['page sequence', { pageSequence: 1 }],
  ] as const)('rejects forged %s plans and authorizations before touching credentials or fetch', async (_label, mutation) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const fixture = captureWork('historical_orders_v1')
    const planned = await createBrokerRequestPlanningBoundary(brokerCodeRegistry).prepareCaptureRead({
      workUnit: fixture.workUnit as never,
      requestId: 'forged-request',
      requestInput: fixture.requestInput,
    })
    const forgedAuthorization = Object.freeze({
      sendAuthorizationContractVersion: 'equora-broker-send-authorization-v2' as const,
      authorityPurpose: 'capture' as const,
      authorityTupleDigest: planned.plan.authorityTupleDigest,
      requestAuthorityId: 'forged-request-authority',
      permitConsumptionId: 'forged-consumption',
      canonicalUnsignedRequestDigest: planned.plan.canonicalUnsignedRequestDigest,
      capabilityDescriptorDigest: planned.plan.provider.capabilityDescriptorDigest,
      runtimeAuthorityRefDigest: '1'.repeat(64),
      runtimeAuthorityFenceId: '2'.repeat(64),
      authorizedAtEpochMs: Date.now(),
      sendDeadlineAt: new Date(Date.now() + 10_000).toISOString(),
    })
    const poisonedMaterial = new Proxy(credentialFrame(), {
      get() { throw new Error('credential material must not be touched') },
    })
    await expect(mexcBrokerNetworkTransport.executeCentralRead({
      plan: { ...planned.plan, ...mutation } as never,
      credentialMaterial: poisonedMaterial,
      sendAuthorization: forgedAuthorization,
    })).rejects.toThrowError(MexcTransportError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed credential frames after genuine authorization but before fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const harness = await centralHarness('historical_orders_v1', Uint8Array.of(1, 0, 8, 0, 8))
    await expect(harness.egress.executeAuthorizedRead(harness.execution)).rejects.toThrow(/Credentialmaterial/)
    expect(harness.counts).toEqual({ controlPlane: 1, credentialLoader: 1, networkTransport: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks public metadata before permit consumption, credential loading and network transport', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const harness = await centralHarness('contract_metadata_v1')
    await expect(harness.egress.executeAuthorizedRead(harness.execution)).rejects.toThrow(/public_or_unsupported/)
    expect(harness.counts).toEqual({ controlPlane: 0, credentialLoader: 0, networkTransport: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

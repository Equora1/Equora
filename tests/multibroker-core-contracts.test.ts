import { createHash, createHmac } from 'node:crypto'
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, normalize, posix, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

import {
  computeAuthorityTupleDigest,
  computeBrokerPermitConsumptionId,
  computeBrokerWireEvidenceDigest,
  computeCapturePageObservationId,
  computeCheckpointMacVerification,
  computeCheckpointTransitionMacVerification,
  computeCapturePurposeScopeDigest,
  createCaptureCommitBoundary,
  createBrokerAdapterInspectionBoundary,
  createCentralBrokerEgress,
  validateCaptureBrokerReadExecution,
  validateCaptureEventBatch,
  validateCaptureWirePage,
  validateConnectionProbeCapabilityResult,
  validateConnectionProbeBrokerReadExecution,
  validateConnectionProbeWireResponse,
  validateProviderPageTransition,
} from '../lib/server/broker-core-contracts'

vi.mock('server-only', () => ({}))

import type {
  AuthorizedBrokerReadPermit,
  AuthorizedConnectionProbePermit,
  BrokerAuthorityPurpose,
  BrokerCheckpointMacVerification,
  BrokerCheckpointTransitionMacVerification,
  BrokerEgressCaptureResult,
  BrokerEgressConnectionProbeResult,
  BrokerReadWorkUnit,
  BrokerRequestAuthorizationBinding,
  BrokerReadRequestPlan,
  BrokerRuntimeMode,
  BrokerWireResponse,
  CanonicalRawEventInput,
  CaptureAuthorityTuple,
  CaptureBrokerReadExecution,
  CaptureChainBinding,
  CaptureEventBatchCandidate,
  CapturePageEvidence,
  CapturePageObservationBinding,
  CaptureRequestBinding,
  CaptureRequestEvidence,
  CaptureRawObservationEnvelope,
  CaptureRawObservationCommit,
  CentralBrokerEgressDependencies,
  CentralBrokerEgress,
  CommonBrokerAuthorityCore,
  ConnectionProbeAuthorityTuple,
  ConnectionProbeBrokerReadExecution,
  ConnectionProbeChainBinding,
  ConnectionProbeCapabilityResult,
  ConnectionProbeCapabilityResultCandidate,
  ConnectionProbeRequestBinding,
  InspectedCapturePage,
  ProviderEventIdentity,
  ProviderPageTransitionInput,
  ProviderCheckpointTransition,
  ProviderReadMethod,
  ReadOnlyBrokerAdapter,
  ReadCapabilityExecutionContract,
  ReadCapabilityDescriptor,
  RuntimeValidatedCaptureWirePage,
  UniqueEventObservationTuple,
  UniqueCaptureEventBatch,
} from '../lib/server/broker-core-contracts'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false
type Assert<Condition extends true> = Condition

type _GetOnly = Assert<Equal<ProviderReadMethod, 'GET'>>
type _RuntimeModes = Assert<Equal<BrokerRuntimeMode, 'off' | 'probe' | 'capture'>>
type _AuthorityPurposes = Assert<Equal<BrokerAuthorityPurpose, 'capture' | 'connection_probe'>>
type _CapturePurpose = Assert<Equal<CaptureAuthorityTuple['authorityPurpose'], 'capture'>>
type _ProbePurpose = Assert<Equal<ConnectionProbeAuthorityTuple['authorityPurpose'], 'connection_probe'>>
type _CaptureMode = Assert<Equal<CaptureAuthorityTuple['runtimeAuthority']['requiredMode'], 'capture'>>
type _ProbeMode = Assert<Equal<ConnectionProbeAuthorityTuple['runtimeAuthority']['requiredMode'], 'probe'>>
type _AdapterHasNoExecute = Assert<Equal<'executeAuthorizedRead' extends keyof ReadOnlyBrokerAdapter ? true : false, false>>
type _CapturePinsBound = Assert<Equal<CaptureAuthorityTuple['capturePolicyPins']['checkpointPolicyVersion'], string>>
type _ProbePinsBound = Assert<Equal<ConnectionProbeAuthorityTuple['connectionProbePolicyPins']['probePolicyVersion'], string>>
// @ts-expect-error A capture authority may never be paired with probe runtime authority.
type _CrossPurposeModeMustFail = CommonBrokerAuthorityCore<'capture', 'probe'>

type CaptureChainA = CaptureChainBinding<'capture-chain-a'>
type CaptureChainB = CaptureChainBinding<'capture-chain-b'>
type CaptureRequestA = CaptureRequestBinding<CaptureChainA, 'capture-request-a'>
type CaptureRequestB = CaptureRequestBinding<CaptureChainB, 'capture-request-b'>
type CaptureAuthorizationA = BrokerRequestAuthorizationBinding<CaptureRequestA, 'capture-authority-a'>
type CaptureAuthorizationB = BrokerRequestAuthorizationBinding<CaptureRequestB, 'capture-authority-b'>
type CapturePageA = CapturePageObservationBinding<CaptureAuthorizationA, 'capture-page-a'>
type CapturePageB = CapturePageObservationBinding<CaptureAuthorizationB, 'capture-page-b'>
type CaptureEventA = CanonicalRawEventInput<CapturePageA, 'capture-event-a'>
type CaptureEventB = CanonicalRawEventInput<CapturePageA, 'capture-event-b'>

type ProbeChainA = ConnectionProbeChainBinding<'probe-chain-a'>
type ProbeRequestA = ConnectionProbeRequestBinding<ProbeChainA, 'probe-request-a'>
type ProbeAuthorizationA = BrokerRequestAuthorizationBinding<ProbeRequestA, 'probe-authority-a'>

type _CapturePlanPurpose = Assert<Equal<CaptureRequestA['authorityPurpose'], 'capture'>>
type _ProbePlanPurpose = Assert<Equal<ProbeRequestA['authorityPurpose'], 'connection_probe'>>
type _ProbeHasNoRawEnvelope = Assert<Equal<'envelope' extends keyof ConnectionProbeCapabilityResult<ProbeAuthorizationA> ? true : false, false>>
type _ProbeHasNoCheckpoint = Assert<Equal<'checkpointTransition' extends keyof ConnectionProbeCapabilityResult<ProbeAuthorizationA> ? true : false, false>>
type _CapturePermitPurpose = Assert<Equal<CaptureAuthorizationA['authorityPurpose'], 'capture'>>
type _ProbePermitPurpose = Assert<Equal<ProbeAuthorizationA['authorityPurpose'], 'connection_probe'>>
type _UniqueEventsAccepted = Assert<Equal<
  UniqueEventObservationTuple<readonly [CaptureEventA, CaptureEventB]>,
  readonly [CaptureEventA, CaptureEventB]
>>
type _DuplicateEventRejected = Assert<Equal<
  UniqueEventObservationTuple<readonly [CaptureEventA, CaptureEventA]>,
  never
>>

declare const captureRequestA: CaptureRequestA
declare const captureRequestB: CaptureRequestB
declare const captureAuthorizationA: CaptureAuthorizationA
declare const captureAuthorizationB: CaptureAuthorizationB
declare const capturePlanA: BrokerReadRequestPlan<CaptureRequestA>
declare const captureCapabilityContractA: ReadCapabilityExecutionContract
declare const capturePlanB: BrokerReadRequestPlan<CaptureRequestB>
declare const capturePermitA: AuthorizedBrokerReadPermit<CaptureAuthorizationA>
declare const capturePermitB: AuthorizedBrokerReadPermit<CaptureAuthorizationB>
declare const captureWorkUnitA: BrokerReadWorkUnit<CaptureChainA>
declare const captureWorkUnitB: BrokerReadWorkUnit<CaptureChainB>
declare const captureWireA: BrokerWireResponse<CaptureAuthorizationA>
declare const captureWirePageA: RuntimeValidatedCaptureWirePage<CapturePageA>
declare const capturePageA: InspectedCapturePage<CapturePageA>
declare const capturePageB: InspectedCapturePage<CapturePageB>
declare const captureRequestEvidenceA: CaptureRequestEvidence<CaptureAuthorizationA>
declare const capturePageEvidenceA: CapturePageEvidence<CapturePageA>
declare const captureEnvelopeA: CaptureRawObservationEnvelope<CapturePageA>
declare const captureTransitionA: ProviderCheckpointTransition<CapturePageA>
declare const captureTransitionB: ProviderCheckpointTransition<CapturePageB>
declare const probeRequestA: ProbeRequestA
declare const probeAuthorizationA: ProbeAuthorizationA
declare const probePlanA: BrokerReadRequestPlan<ProbeRequestA>
declare const probeCapabilityContractA: ReadCapabilityExecutionContract
declare const probePermitA: AuthorizedConnectionProbePermit<ProbeAuthorizationA>
declare const probeWireA: BrokerWireResponse<ProbeAuthorizationA>
declare const probeResultA: ConnectionProbeCapabilityResult<ProbeAuthorizationA>
declare const adapter: ReadOnlyBrokerAdapter
declare const egress: CentralBrokerEgress

function canonicalContractJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Fixture enthält keine kanonische Zahl.')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalContractJson).join(',')}]`
  if (!value || typeof value !== 'object') throw new Error('Fixture enthält keinen kanonischen Wert.')
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalContractJson(entry)}`).join(',')}}`
}

function authorityTupleDigest(authority: CaptureAuthorityTuple | ConnectionProbeAuthorityTuple) {
  return computeAuthorityTupleDigest(authority)
}

function capabilityContractDigest(contract: ReadCapabilityExecutionContract) {
  const { capabilityDescriptorDigest: _providedDigest, ...ref } = contract.ref
  return sha256(canonicalContractJson({ ...contract, ref }))
}

function requestPlanDigestInput(plan: BrokerReadRequestPlan<never>) {
  return {
    authorityPurpose: plan.authorityPurpose,
    authorityTupleDigest: plan.authorityTupleDigest,
    provider: plan.provider,
    method: plan.method,
    httpsOrigin: plan.httpsOrigin,
    port: plan.port,
    pathTemplateId: plan.pathTemplateId,
    canonicalPath: plan.canonicalPath,
    canonicalQuery: plan.canonicalQuery,
    redirectMode: plan.redirectMode,
    responseByteLimit: plan.responseByteLimit,
    requestTimeoutMs: plan.requestTimeoutMs,
    planContractVersion: plan.planContractVersion,
  }
}

function runtimeFixtureTimes() {
  const now = Date.now()
  return {
    issuedAt: new Date(now - 60_000).toISOString(),
    startedAt: new Date(now - 10_000).toISOString(),
    receivedAt: new Date(now - 5_000).toISOString(),
    observedAt: new Date(now - 5_000).toISOString(),
    committedAt: new Date(now).toISOString(),
    deadlineAt: new Date(now + 3_600_000).toISOString(),
  } as const
}

function runtimeCaptureFixture(suffix: string, constantHttpsOrigin = 'https://fixture.invalid') {
  const times = runtimeFixtureTimes()
  const provider = {
    providerCode: `provider-${suffix}`,
    providerContractVersion: 'provider-v1',
    adapterVersion: 'adapter-v1',
    capabilityKind: 'historical_executions',
    providerCapabilityId: `capability-${suffix}`,
    providerCapabilityVersion: 'v1',
    capabilityDescriptorDigest: '',
  } as CaptureAuthorityTuple['provider']
  const capabilityContract = {
    ref: provider,
    mutationContract: 'mutations_forbidden',
    methodContract: 'constant_read_method',
    constantMethod: 'GET',
    constantHttpsOrigin,
    constantPort: 443,
    constantPathTemplate: '/fixture',
    authClass: 'signed_read',
    dataClass: 'account_history',
    queryContractVersion: 'v1',
    cursorContractVersion: 'v1',
    responseContractVersion: 'v1',
  } as ReadCapabilityExecutionContract
  ;(provider as unknown as { capabilityDescriptorDigest: string }).capabilityDescriptorDigest = capabilityContractDigest(capabilityContract)
  const capabilityProfile = {
    profileId: `profile-${suffix}`,
    profileVersion: 'v1',
    profileDigest: `profile-digest-${suffix}`,
  } as CaptureAuthorityTuple['capabilityProfile']
  const scope = { instrumentScopeKey: 'all', requestWindowStartUs: '0', requestWindowEndUs: '1' } as const
  const authority = {
    authorityTupleContractVersion: 'equora-broker-authority-tuple-v1',
    authorityPurpose: 'capture',
    authorityTupleDigest: '',
    userId: `user-${suffix}`,
    environment: 'live',
    runtimeAuthority: {
      requiredMode: 'capture',
      runtimeConfigurationDigest: 'runtime-digest',
      deploymentIdentity: 'deployment',
      runtimeAuthorityEpoch: 1,
    },
    provider,
    capabilityProfile,
    commonPolicyPins: {
      runtimePolicyVersion: 'v1',
      requestAuthorityPolicyVersion: 'v1',
      failurePolicyVersion: 'v1',
    },
    purposeScopeDigest: computeCapturePurposeScopeDigest(scope),
    purposeRequestSequence: 1,
    workUnitId: `work-${suffix}`,
    expectedWorkUnitRowVersion: 1,
    claim: { claimRequestId: 'claim', leaseId: 'lease', leaseEpoch: 1, leaseTokenDigest: 'lease-digest' },
    activation: { id: 'activation', generation: 1, authorityEpoch: 1 },
    account: {
      brokerAccountId: `broker-account-${suffix}`,
      connectionAccountId: `connection-account-${suffix}`,
      identityDigest: `identity-${suffix}`,
      identityKeyVersion: 'v1',
    },
    persistentCredentialReference: { id: 'credential-ref', keyVersion: 'v1', generation: 1 },
    checkpointContractVersion: 'v1',
    capturePolicyPins: { claimPolicyVersion: 'v1', leasePolicyVersion: 'v1', checkpointPolicyVersion: 'v1' },
    captureBudget: { pageLimit: 10, responseByteLimit: 1000, requestDeadlineAt: times.deadlineAt },
  } as CaptureAuthorityTuple
  ;(authority as unknown as { authorityTupleDigest: string }).authorityTupleDigest = authorityTupleDigest(authority)
  const dynamicChainId: string = `capture-chain-${suffix}`
  const chainBinding = {
    chainId: dynamicChainId,
    authorityPurpose: 'capture',
    authority,
  } as unknown as CaptureChainBinding<string>
  const canonicalQuery = { cursor: suffix }
  const planDigestInput = {
    authorityPurpose: 'capture',
    authorityTupleDigest: authority.authorityTupleDigest,
    provider,
    method: 'GET',
    httpsOrigin: constantHttpsOrigin,
    port: 443,
    pathTemplateId: '/fixture',
    canonicalPath: '/fixture',
    canonicalQuery,
    redirectMode: 'error',
    responseByteLimit: 1000,
    requestTimeoutMs: 1000,
    planContractVersion: 'v1',
  } as const
  const requestBinding = {
    requestId: `request-${suffix}` as string,
    authorityPurpose: 'capture',
    chainBinding,
    canonicalUnsignedRequestDigest: sha256(canonicalContractJson(planDigestInput)),
    queryDigest: sha256(canonicalContractJson(canonicalQuery)),
    purposeRequestSequence: authority.purposeRequestSequence,
    provider,
    capabilityProfile,
  } as unknown as CaptureRequestBinding<CaptureChainBinding<string>, string>
  const authorizationBinding = {
    requestAuthorityId: `request-authority-${suffix}` as string,
    authorityPurpose: 'capture',
    requestBinding,
  } as unknown as BrokerRequestAuthorizationBinding<typeof requestBinding, string>
  const plan: BrokerReadRequestPlan<typeof requestBinding> = {
    authorityPurpose: 'capture',
    authorityTupleDigest: authority.authorityTupleDigest,
    provider,
    requestBinding,
    method: 'GET',
    httpsOrigin: constantHttpsOrigin,
    port: 443,
    pathTemplateId: '/fixture',
    canonicalPath: '/fixture',
    canonicalQuery,
    redirectMode: 'error',
    responseByteLimit: 1000,
    requestTimeoutMs: 1000,
    planContractVersion: 'v1',
    canonicalUnsignedRequestDigest: requestBinding.canonicalUnsignedRequestDigest,
  }
  const permit: AuthorizedBrokerReadPermit<typeof authorizationBinding> = {
    authority,
    canonicalUnsignedRequestDigest: requestBinding.canonicalUnsignedRequestDigest,
    requestAuthorityId: authorizationBinding.requestAuthorityId,
    authorizationBinding,
    permitContractVersion: 'equora-broker-read-permit-v1',
    singleUse: true,
    issuedAt: times.issuedAt,
    sendDeadlineAt: times.deadlineAt,
  }
  const wireResponse: BrokerWireResponse<typeof authorizationBinding> = {
    authorityPurpose: 'capture',
    authorizationBinding,
    methodEvidence: 'GET',
    originEvidence: constantHttpsOrigin,
    pathTemplateEvidence: '/fixture',
    queryDigest: requestBinding.queryDigest,
    startedAt: times.startedAt,
    receivedAt: times.receivedAt,
    httpStatus: 200,
    rawBody: [],
    rawBodyDigest: sha256(Buffer.alloc(0)),
    rawBodyBytes: 0,
  }
  const pageBinding = {
    authorizationBinding,
    pageObservationId: computeCapturePageObservationId(wireResponse),
    pageSequence: 0,
    observedAt: times.observedAt,
    pagePayloadDigest: sha256(canonicalContractJson({})),
    completenessStatus: 'page_observed_scope_open',
  } as unknown as CapturePageObservationBinding<typeof authorizationBinding, string>
  const requestEvidence: CaptureRequestEvidence<typeof authorizationBinding> = {
    authorizationBinding,
    methodEvidence: 'GET',
    originEvidence: constantHttpsOrigin,
    pathTemplateEvidence: '/fixture',
    queryDigest: requestBinding.queryDigest,
    startedAt: times.startedAt,
    receivedAt: times.receivedAt,
    wireBodyDigest: sha256(Buffer.alloc(0)),
    wireBodyBytes: 0,
  }
  const pageEvidence: CapturePageEvidence<typeof pageBinding> = { pageBinding, pagePayload: {} }
  const inspectedPage: InspectedCapturePage<typeof pageBinding> = {
    pageBinding,
    responseContractVersion: 'v1',
    requestEvidence,
    pageEvidence,
  }
  const workUnit = {
    chainBinding,
    integrityKeyReference: { id: 'integrity', keyVersion: 'v1' },
    scope,
    checkpoint: { checkpointContractVersion: 'v1', payload: null, mac: `checkpoint-${suffix}` },
  } as BrokerReadWorkUnit<typeof chainBinding>
  const event = (eventId: string, ordinal: number, page = pageBinding, completeness = page.completenessStatus) => {
    const observationBinding = {
      pageBinding: page,
      eventObservationId: eventId,
      eventOrdinal: ordinal,
      observedAt: times.observedAt,
      providerOccurredAtUs: '1',
      eventObservationDigest: '',
      inheritedCompletenessStatus: completeness,
      observationAuthority: 'provider_observed_unreconciled',
    } as const
    const { eventObservationDigest: _providedDigest, ...observationDigestInput } = observationBinding
    ;(observationBinding as unknown as { eventObservationDigest: string }).eventObservationDigest = sha256(canonicalContractJson(observationDigestInput))
    const payload = { eventId }
    return {
      observationBinding,
      eventKind: 'execution',
      providerIdentity: {
        identityStatus: 'stable_provider_id',
        providerEventId: `provider-${eventId}`,
        blockedIdentity: null,
      },
      providerRevision: null,
      payloadEncoding: 'canonical_json_v1',
      payload,
      payloadDigest: sha256(canonicalContractJson(payload)),
      normalizationAuthority: 'blocked_pending_versioned_normalization',
      reconciliationAuthority: 'none',
      approvalAuthority: 'none',
      importAuthority: 'none',
    } as unknown as CanonicalRawEventInput<typeof pageBinding, string>
  }
  return {
    authority,
    capabilityContract,
    chainBinding,
    requestBinding,
    authorizationBinding,
    plan,
    permit,
    wireResponse,
    pageBinding,
    requestEvidence,
    pageEvidence,
    inspectedPage,
    workUnit,
    event,
    times,
  }
}

function runtimeProbeFixture(suffix: string) {
  const times = runtimeFixtureTimes()
  const provider = {
    providerCode: `provider-${suffix}`,
    providerContractVersion: 'provider-v1',
    adapterVersion: 'adapter-v1',
    capabilityKind: 'permission_evidence',
    providerCapabilityId: `probe-capability-${suffix}`,
    providerCapabilityVersion: 'v1',
    capabilityDescriptorDigest: '',
  } as ConnectionProbeAuthorityTuple['provider']
  const capabilityContract = {
    ref: provider,
    mutationContract: 'mutations_forbidden',
    methodContract: 'constant_read_method',
    constantMethod: 'GET',
    constantHttpsOrigin: 'https://fixture.invalid',
    constantPort: 443,
    constantPathTemplate: '/probe',
    authClass: 'signed_read',
    dataClass: 'account_identity',
    queryContractVersion: 'v1',
    cursorContractVersion: 'v1',
    responseContractVersion: 'v1',
  } as ReadCapabilityExecutionContract
  ;(provider as unknown as { capabilityDescriptorDigest: string }).capabilityDescriptorDigest = capabilityContractDigest(capabilityContract)
  const capabilityProfile = {
    profileId: `probe-profile-${suffix}`,
    profileVersion: 'v1',
    profileDigest: `probe-profile-digest-${suffix}`,
  } as ConnectionProbeAuthorityTuple['capabilityProfile']
  const authority = {
    authorityTupleContractVersion: 'equora-broker-authority-tuple-v1',
    authorityPurpose: 'connection_probe',
    authorityTupleDigest: '',
    userId: `probe-user-${suffix}`,
    environment: 'live',
    runtimeAuthority: {
      requiredMode: 'probe',
      runtimeConfigurationDigest: 'probe-runtime-digest',
      deploymentIdentity: 'probe-deployment',
      runtimeAuthorityEpoch: 1,
    },
    provider,
    capabilityProfile,
    commonPolicyPins: {
      runtimePolicyVersion: 'v1',
      requestAuthorityPolicyVersion: 'v1',
      failurePolicyVersion: 'v1',
    },
    purposeScopeDigest: `probe-scope-${suffix}`,
    purposeRequestSequence: 1,
    setupCommandId: `setup-${suffix}`,
    expectedSetupCommandRowVersion: 1,
    setupRequestDigest: `setup-digest-${suffix}`,
    connectionProbePolicyPins: {
      setupPolicyVersion: 'v1',
      probePolicyVersion: 'v1',
      ephemeralCredentialPolicyVersion: 'v1',
      applyPolicyVersion: 'v1',
    },
    ephemeralCredentialSession: {
      sessionId: `probe-session-${suffix}`,
      generation: 1,
      materialBindingMac: `probe-mac-${suffix}`,
    },
    probeBudget: {
      cumulativeRequestLimit: 2,
      cumulativeRequestCountBefore: 0,
      responseByteLimit: 1000,
      absoluteDeadlineAt: times.deadlineAt,
    },
  } as ConnectionProbeAuthorityTuple
  ;(authority as unknown as { authorityTupleDigest: string }).authorityTupleDigest = authorityTupleDigest(authority)
  const chainBinding = {
    chainId: `probe-chain-${suffix}`,
    authorityPurpose: 'connection_probe',
    authority,
  } as unknown as ConnectionProbeChainBinding<string>
  const canonicalQuery = { scope: suffix }
  const planDigestInput = {
    authorityPurpose: 'connection_probe',
    authorityTupleDigest: authority.authorityTupleDigest,
    provider,
    method: 'GET',
    httpsOrigin: 'https://fixture.invalid',
    port: 443,
    pathTemplateId: '/probe',
    canonicalPath: '/probe',
    canonicalQuery,
    redirectMode: 'error',
    responseByteLimit: 1000,
    requestTimeoutMs: 1000,
    planContractVersion: 'v1',
  } as const
  const requestBinding = {
    requestId: `probe-request-${suffix}`,
    authorityPurpose: 'connection_probe',
    chainBinding,
    canonicalUnsignedRequestDigest: sha256(canonicalContractJson(planDigestInput)),
    queryDigest: sha256(canonicalContractJson(canonicalQuery)),
    purposeRequestSequence: authority.purposeRequestSequence,
    provider,
    capabilityProfile,
  } as unknown as ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>
  const authorizationBinding = {
    requestAuthorityId: `probe-authority-${suffix}`,
    authorityPurpose: 'connection_probe',
    requestBinding,
  } as unknown as BrokerRequestAuthorizationBinding<typeof requestBinding, string>
  const plan: BrokerReadRequestPlan<typeof requestBinding> = {
    requestBinding,
    ...planDigestInput,
    canonicalUnsignedRequestDigest: requestBinding.canonicalUnsignedRequestDigest,
  }
  const permit: AuthorizedConnectionProbePermit<typeof authorizationBinding> = {
    authority,
    canonicalUnsignedRequestDigest: requestBinding.canonicalUnsignedRequestDigest,
    requestAuthorityId: authorizationBinding.requestAuthorityId,
    authorizationBinding,
    permitContractVersion: 'equora-broker-read-permit-v1',
    singleUse: true,
    issuedAt: times.issuedAt,
    sendDeadlineAt: times.deadlineAt,
  }
  return { authority, capabilityContract, chainBinding, requestBinding, authorizationBinding, plan, permit, times }
}

function builtDescriptor(
  contract: ReadCapabilityExecutionContract,
  canonicalQuery: Readonly<Record<string, string>>,
): ReadCapabilityDescriptor<Readonly<Record<string, string>>, null> {
  return Object.freeze({
    ...contract,
    parseQuery(input: unknown) {
      if (canonicalContractJson(input) !== canonicalContractJson(canonicalQuery)) throw new Error('query rejected')
      return structuredClone(canonicalQuery)
    },
    parseCursor(input: unknown) {
      if (input !== null) throw new Error('cursor rejected')
      return null
    },
  })
}

function runtimeEgressHarness(
  fixtures: readonly (ReturnType<typeof runtimeCaptureFixture> | ReturnType<typeof runtimeProbeFixture>)[],
  options: Readonly<{ sharedConsumed?: Set<string> }> = {},
) {
  let clockNow = Date.now()
  let scriptedClockValues: number[] = []
  let mutateNextCaptureAdapterResult: ((value: Record<string, unknown>) => Record<string, unknown>) | null = null
  let mutateNextProbeAdapterResult: ((value: Record<string, unknown>) => Record<string, unknown>) | null = null
  const descriptors = new Map(fixtures.map((fixture) => [
    fixture.capabilityContract.ref.capabilityDescriptorDigest,
    builtDescriptor(fixture.capabilityContract, fixture.plan.canonicalQuery),
  ]))
  const adapters = new Map(fixtures.map((fixture) => {
    const descriptor = descriptors.get(fixture.capabilityContract.ref.capabilityDescriptorDigest)
    if (!descriptor) throw new Error('fixture_descriptor_missing')
    const adapter = Object.freeze({
      providerCode: fixture.authority.provider.providerCode,
      providerContractVersion: fixture.authority.provider.providerContractVersion,
      adapterVersion: fixture.authority.provider.adapterVersion,
      capabilities: Object.freeze([descriptor]),
      prepareReadPlan: () => fixture.plan,
      prepareProbeReadPlan: () => fixture.plan,
      inspectCaptureWireResponse: (wirePage: RuntimeValidatedCaptureWirePage<any>) => {
        if (wirePage.execution.authorityPurpose !== 'capture') throw new Error('fixture_capture_adapter_purpose_invalid')
        let result: Record<string, unknown> = {
          pageBinding: wirePage.pageBinding,
          responseContractVersion: wirePage.execution.capabilityContract.responseContractVersion,
          requestEvidence: {
            authorizationBinding: wirePage.wireResponse.authorizationBinding,
            methodEvidence: wirePage.wireResponse.methodEvidence,
            originEvidence: wirePage.wireResponse.originEvidence,
            pathTemplateEvidence: wirePage.wireResponse.pathTemplateEvidence,
            queryDigest: wirePage.wireResponse.queryDigest,
            startedAt: wirePage.wireResponse.startedAt,
            receivedAt: wirePage.wireResponse.receivedAt,
            wireBodyDigest: wirePage.wireResponse.rawBodyDigest,
            wireBodyBytes: wirePage.wireResponse.rawBodyBytes,
          },
          pageEvidence: { pageBinding: wirePage.pageBinding, pagePayload: {} },
        }
        const mutate = mutateNextCaptureAdapterResult
        mutateNextCaptureAdapterResult = null
        if (mutate) result = mutate(result)
        return result
      },
      inspectConnectionProbeWireResponse: (wire: Parameters<ReadOnlyBrokerAdapter['inspectConnectionProbeWireResponse']>[0]) => {
        let result: Record<string, unknown> = {
          resultContractVersion: 'equora-connection-probe-result-v1' as const,
          authorizationBinding: wire.execution.authorizationBinding,
          provider: wire.execution.requestBinding.provider,
          capabilityProfile: wire.execution.requestBinding.capabilityProfile,
          responseContractVersion: wire.execution.capabilityContract.responseContractVersion,
          wireEvidenceDigest: computeBrokerWireEvidenceDigest(wire.wireResponse),
          probeScopeDigest: wire.execution.requestBinding.chainBinding.authority.purposeScopeDigest,
          observedAt: wire.wireResponse.receivedAt,
          technicalReadResult: 'read_succeeded' as const,
          permissionEvidenceResult: 'read_permission_observed' as const,
          accountIdentityResult: 'stable_identity_observed' as const,
          sanitizedFindings: [],
          persistenceAuthority: 'sanitized_probe_receipt_only' as const,
          captureAuthority: 'none' as const,
          normalizationAuthority: 'none' as const,
          reconciliationAuthority: 'none' as const,
          approvalAuthority: 'none' as const,
          importAuthority: 'none' as const,
        }
        const mutate = mutateNextProbeAdapterResult
        mutateNextProbeAdapterResult = null
        if (mutate) result = mutate(result)
        return result
      },
      advanceCheckpoint: () => { throw new Error('fixture_checkpoint_not_invoked') },
      mapRawEvents: () => [],
      classifyFailure: () => ({
        failureClass: 'unknown_fail_closed' as const,
        failureCode: 'fixture',
        retryDisposition: 'never' as const,
        sanitizedDetail: null,
        httpStatusClass: 'none' as const,
      }),
    }) as unknown as ReadOnlyBrokerAdapter
    return [fixture.capabilityContract.ref.capabilityDescriptorDigest, adapter] as const
  }))
  const fixturesByRequestId = new Map(fixtures.map((fixture) => [fixture.requestBinding.requestId, fixture]))
  const authorities = new Map(fixtures.map((fixture) => [
    `${fixture.authority.authorityPurpose}:${fixture.authority.provider.providerCode}`,
    fixture.authority.runtimeAuthority,
  ]))
  const consumed = options.sharedConsumed ?? new Set<string>()
  const loadedCredentialMaterials: Uint8Array[] = []
  const transportAuthorizations: unknown[] = []
  let afterNextConsume: (() => void) | null = null
  let afterNextCredentialLoad: (() => void) | null = null
  let mutateNextReceipt: ((value: ReturnType<typeof receipt>) => ReturnType<typeof receipt>) | null = null
  const calls = {
    codeRegistry: 0,
    runtimeAuthority: 0,
    controlPlane: 0,
    credentialLoader: 0,
    networkTransport: 0,
  }
  function receipt(command: Readonly<{
    execution: CaptureBrokerReadExecution<any, any> | ConnectionProbeBrokerReadExecution<any, any>
    consumptionKeyContractVersion: 'equora-broker-permit-consumption-key-v1'
    permitConsumptionId: string
    uniquenessScope: 'global_request_authority_all_workers'
    trustedNowEpochMs: number
  }>) {
    const execution = command.execution
    const key = command.permitConsumptionId
    if (consumed.has(key)) throw new Error('fixture_control_plane_replay')
    consumed.add(key)
    calls.controlPlane += 1
    let value = {
      receiptContractVersion: 'equora-broker-permit-consumption-v1' as const,
      consumptionKeyContractVersion: command.consumptionKeyContractVersion,
      permitConsumptionId: command.permitConsumptionId,
      uniquenessScope: command.uniquenessScope,
      authorityPurpose: execution.authorityPurpose,
      authorityTupleDigest: execution.requestBinding.chainBinding.authority.authorityTupleDigest,
      requestAuthorityId: execution.authorizationBinding.requestAuthorityId,
      canonicalUnsignedRequestDigest: execution.requestBinding.canonicalUnsignedRequestDigest,
      permitContractVersion: execution.permit.permitContractVersion,
      sendDeadlineAt: execution.permit.sendDeadlineAt,
      consumedAt: new Date(command.trustedNowEpochMs - 20_000).toISOString(),
      controlPlaneTransactionId: `tx-${key}`,
    }
    const afterConsume = afterNextConsume
    afterNextConsume = null
    afterConsume?.()
    const mutate = mutateNextReceipt
    mutateNextReceipt = null
    if (mutate) value = mutate(value)
    return value
  }
  const codeRegistry: CentralBrokerEgressDependencies['codeRegistry'] = {
      async readBuiltCapability(ref) {
        calls.codeRegistry += 1
        return descriptors.get(ref.capabilityDescriptorDigest) ?? null
      },
      async readBuiltAdapter(ref) {
        calls.codeRegistry += 1
        return adapters.get(ref.capabilityDescriptorDigest) ?? null
      },
  }
  const dependencies: CentralBrokerEgressDependencies = {
    trustedClock: {
      nowEpochMs: () => scriptedClockValues.length > 0 ? scriptedClockValues.shift() as number : clockNow,
    },
    codeRegistry,
    runtimeAuthority: {
      async readCurrentRuntimeAuthority(purpose, provider) {
        calls.runtimeAuthority += 1
        return authorities.get(`${purpose}:${provider.providerCode}`) ?? null
      },
    },
    controlPlane: {
      async consumeCapturePermitAtomically(command) {
        return receipt(command) as ReturnType<typeof receipt> & { authorityPurpose: 'capture' }
      },
      async consumeConnectionProbePermitAtomically(command) {
        return receipt(command) as ReturnType<typeof receipt> & { authorityPurpose: 'connection_probe' }
      },
    },
    credentialLoader: {
      async loadCaptureCredentialMaterial() {
        calls.credentialLoader += 1
        const material = new Uint8Array([1, 2, 3])
        loadedCredentialMaterials.push(material)
        const action = afterNextCredentialLoad
        afterNextCredentialLoad = null
        action?.()
        return material
      },
      async loadConnectionProbeCredentialMaterial() {
        calls.credentialLoader += 1
        const material = new Uint8Array([4, 5, 6])
        loadedCredentialMaterials.push(material)
        const action = afterNextCredentialLoad
        afterNextCredentialLoad = null
        action?.()
        return material
      },
    },
    networkTransport: {
      async executeCentralRead({ plan, sendAuthorization }) {
        calls.networkTransport += 1
        transportAuthorizations.push(sendAuthorization)
        const fixture = fixturesByRequestId.get(plan.requestBinding.requestId)
        if (!fixture) throw new Error('fixture_request_missing')
        return {
          startedAt: fixture.times.startedAt,
          receivedAt: fixture.times.receivedAt,
          httpStatus: 200,
          rawBody: new Uint8Array(),
        }
      },
    },
  }
  return {
    egress: createCentralBrokerEgress(dependencies),
    inspectionBoundary: createBrokerAdapterInspectionBoundary(codeRegistry),
    dependencies,
    calls,
    loadedCredentialMaterials,
    transportAuthorizations,
    setTrustedNow(value: number) {
      clockNow = value
    },
    scriptTrustedClock(values: readonly number[]) {
      scriptedClockValues = [...values]
    },
    revokeRuntime(purpose: BrokerAuthorityPurpose, providerCode: string) {
      authorities.delete(`${purpose}:${providerCode}`)
    },
    removeDescriptor(descriptorDigest: string) {
      descriptors.delete(descriptorDigest)
    },
    afterNextControlPlaneConsume(action: () => void) {
      afterNextConsume = action
    },
    afterNextCredentialMaterialLoad(action: () => void) {
      afterNextCredentialLoad = action
    },
    mutateNextRegisteredProbeResult(action: (value: Record<string, unknown>) => Record<string, unknown>) {
      mutateNextProbeAdapterResult = action
    },
    mutateNextRegisteredCapturePage(action: (value: Record<string, unknown>) => Record<string, unknown>) {
      mutateNextCaptureAdapterResult = action
    },
    tamperNextControlPlaneReceipt(action: (value: ReturnType<typeof receipt>) => ReturnType<typeof receipt>) {
      mutateNextReceipt = action
    },
  }
}

async function inspectFreshCapturePage(
  suffix: string,
  mutate?: (value: Record<string, unknown>) => Record<string, unknown>,
) {
  const fixture = runtimeCaptureFixture(suffix)
  const harness = runtimeEgressHarness([fixture])
  const execution: CaptureBrokerReadExecution<typeof fixture.requestBinding, typeof fixture.authorizationBinding> = {
    authorityPurpose: 'capture',
    capabilityContract: fixture.capabilityContract,
    requestBinding: fixture.requestBinding,
    authorizationBinding: fixture.authorizationBinding,
    plan: fixture.plan,
    permit: fixture.permit,
  }
  const egressResult = await harness.egress.executeAuthorizedRead(execution)
  const wirePage = validateCaptureWirePage({
    execution: egressResult.execution,
    wireResponse: egressResult.wireResponse,
    pageBinding: fixture.pageBinding,
  })
  if (mutate) harness.mutateNextRegisteredCapturePage(mutate)
  const inspectedPage = await harness.inspectionBoundary.inspectCaptureWireResponse(wirePage)
  return { fixture, harness, wirePage, inspectedPage }
}

if (false) {
  const validCaptureExecution: CaptureBrokerReadExecution<CaptureRequestA, CaptureAuthorizationA> = {
    authorityPurpose: 'capture',
    capabilityContract: captureCapabilityContractA,
    requestBinding: captureRequestA,
    authorizationBinding: captureAuthorizationA,
    plan: capturePlanA,
    permit: capturePermitA,
  }
  const validProbeExecution: ConnectionProbeBrokerReadExecution<ProbeRequestA, ProbeAuthorizationA> = {
    authorityPurpose: 'connection_probe',
    capabilityContract: probeCapabilityContractA,
    requestBinding: probeRequestA,
    authorizationBinding: probeAuthorizationA,
    plan: probePlanA,
    permit: probePermitA,
  }
  egress.executeAuthorizedRead(validCaptureExecution)
  const invalidPlanPermit: CaptureBrokerReadExecution<CaptureRequestA, CaptureAuthorizationA> = {
    authorityPurpose: 'capture',
    capabilityContract: captureCapabilityContractA,
    requestBinding: captureRequestA,
    authorizationBinding: captureAuthorizationA,
    plan: capturePlanA,
    // @ts-expect-error Same-purpose Permit B cannot authorize Request/Plan A.
    permit: capturePermitB,
  }
  const invalidBindingPermit: CaptureBrokerReadExecution<CaptureRequestA, CaptureAuthorizationA> = {
    authorityPurpose: 'capture',
    capabilityContract: captureCapabilityContractA,
    requestBinding: captureRequestA,
    // @ts-expect-error Authorization B cannot be substituted into Chain/Request A.
    authorizationBinding: captureAuthorizationB,
    plan: capturePlanA,
    permit: capturePermitA,
  }
  const invalidPlanBinding: CaptureBrokerReadExecution<CaptureRequestA, CaptureAuthorizationA> = {
    authorityPurpose: 'capture',
    capabilityContract: captureCapabilityContractA,
    requestBinding: captureRequestA,
    authorizationBinding: captureAuthorizationA,
    // @ts-expect-error Plan B cannot be substituted into Chain/Request A.
    plan: capturePlanB,
    permit: capturePermitA,
  }
  // @ts-expect-error Probe results have no raw-event mapping authority.
  adapter.mapRawEvents(probeResultA)
  // @ts-expect-error Probe results have no checkpoint authority.
  adapter.advanceCheckpoint({ workUnit: captureWorkUnitA, wirePage: captureWirePageA, inspectedPage: probeResultA })
  // @ts-expect-error Probe results cannot become capture commits.
  const invalidCommit: CaptureRawObservationCommit<CapturePageA> = probeResultA
  // @ts-expect-error Probe wire responses cannot be inspected by the capture parser.
  adapter.inspectCaptureWireResponse({ wireResponse: probeWireA, pageBinding: capturePageA.pageBinding })
  // @ts-expect-error Capture wire responses cannot be inspected by the probe parser.
  adapter.inspectConnectionProbeWireResponse(captureWireA)
  // @ts-expect-error The central egress rejects a capture discriminator with a probe plan/permit.
  egress.executeAuthorizedRead({ authorityPurpose: 'capture', requestBinding: probeRequestA, authorizationBinding: probeAuthorizationA, plan: probePlanA, permit: probePermitA })
  // @ts-expect-error The central egress rejects a probe discriminator with a capture plan/permit.
  egress.executeAuthorizedRead({ authorityPurpose: 'connection_probe', requestBinding: captureRequestA, authorizationBinding: captureAuthorizationA, plan: capturePlanA, permit: capturePermitA })

  const invalidWorkUnitPage: ProviderPageTransitionInput<CapturePageA> = {
    // @ts-expect-error Work Unit B cannot advance Page A.
    workUnit: captureWorkUnitB,
    wirePage: captureWirePageA,
    inspectedPage: capturePageA,
  }
  const invalidRequestPageEnvelope: CaptureRawObservationEnvelope<CapturePageA> = {
    pageBinding: capturePageA.pageBinding,
    rawObservationId: 'observation-a',
    rawObservationDigest: 'digest-a',
    observationContractVersion: 'v1',
    observationAuthority: 'provider_observed_unreconciled',
    normalizationAuthority: 'blocked_pending_versioned_normalization',
    reconciliationAuthority: 'none',
    approvalAuthority: 'none',
    importAuthority: 'none',
    // @ts-expect-error Request Evidence B cannot be attached to Page A.
    requestEvidence: null as unknown as CaptureRequestEvidence<CaptureAuthorizationB>,
    pageEvidence: capturePageEvidenceA,
    eventBatch: captureEnvelopeA.eventBatch,
  }
  const mismatchedBindingCommit: CaptureRawObservationCommit<CapturePageA> = {
    authorityPurpose: 'capture',
    pageBinding: capturePageA.pageBinding,
    envelope: captureEnvelopeA,
    // @ts-expect-error Checkpoint B cannot be committed with Page/Envelope A.
    checkpointTransition: captureTransitionB,
    committedAt: '2026-08-14T00:00:00Z',
    commitReceiptDigest: 'receipt-a',
    persistenceAuthority: 'append_only_raw_observation',
  }
  // @ts-expect-error Stable provider identity requires a branded non-empty provider ID.
  const invalidStableIdentity: ProviderEventIdentity = {
    identityStatus: 'stable_provider_id',
    providerEventId: null,
    blockedIdentity: null,
  }
  const invalidBlockedIdentity: ProviderEventIdentity = {
    identityStatus: 'blocked_identity',
    // @ts-expect-error Blocked identity cannot carry a provider event ID.
    providerEventId: 'provider-id',
    blockedIdentity: {
      identityBlockContractVersion: 'v1',
      reasonCode: 'missing_id',
      identityFingerprint: 'fingerprint',
    },
  }
  const validCaptureTransition: ProviderPageTransitionInput<CapturePageA> = {
    workUnit: captureWorkUnitA,
    wirePage: captureWirePageA,
    inspectedPage: capturePageA,
  }
  void validCaptureExecution
  void validProbeExecution
  void invalidPlanPermit
  void invalidBindingPermit
  void invalidPlanBinding
  void invalidCommit
  void invalidWorkUnitPage
  void invalidRequestPageEnvelope
  void mismatchedBindingCommit
  void invalidStableIdentity
  void invalidBlockedIdentity
  void validCaptureTransition
  void captureRequestB
  void captureRequestEvidenceA
  void captureTransitionA
  void capturePageB
}

type ManifestValidator = (options?: Readonly<{
  root?: string
  allowPendingManifestAttempt?: boolean
  hooks?: Readonly<{
    afterOpen?: (input: Readonly<{ path: string; absolute: string; descriptor: number }>) => void
    afterRead?: (input: Readonly<{ path: string; absolute: string; descriptor: number; raw: Buffer }>) => void
  }>
}>) => Readonly<{ validated: number; total: number }>

const WORKSPACE = process.cwd()
const CONTRACT_PATH = join(WORKSPACE, 'lib', 'server', 'broker-core-contracts.ts')
const CONTRACT_SOURCE = readFileSync(CONTRACT_PATH, 'utf8')
const SOURCE_FILE = parseSource(CONTRACT_SOURCE, CONTRACT_PATH)
const MANIFEST_PATH = 'docs/gates/EQUORA_v57.61.0_MULTI_BROKER_PARITY_MANIFEST.sha256'
const EVIDENCE_PATH = 'docs/gates/EQUORA_v57.61.0_MULTI_BROKER_PARITY_EVIDENCE.json'
const REQUIRED_NORMATIVE_PATHS = [
  '.github/workflows/ci.yml',
  'docs/architecture/EQUORA_v57.61.0_PROVIDER_NEUTRAL_MULTI_BROKER_ARCHITECTURE.md',
  'lib/server/broker-core-contracts.ts',
  'package-lock.json',
  'package.json',
  'scripts/release-check.mjs',
  'scripts/validate-multibroker-parity-manifest.mjs',
  'tests/multibroker-core-contracts.test.ts',
  'tsconfig.json',
  'vitest.config.mts',
] as const
const REQUIRED_PARITY_PATHS = [
  'tests/application-contracts.test.ts',
  'tests/mexc-egress-boundary.test.ts',
  'tests/mexc-readonly-transport.test.ts',
  'tests/mexc-readonly-probe.test.ts',
  'tests/mexc-pagination.test.ts',
  'tests/mexc-oracles.test.ts',
  'tests/mexc-sync-scope.test.ts',
  'tests/mexc-capture-orchestrator.test.ts',
  'tests/mexc-capture-runtime.test.ts',
  'tests/broker-raw-ledger.test.ts',
  'tests/broker-capture-control.test.ts',
  'tests/broker-capture-route.test.ts',
  'tests/broker-runtime-control.test.ts',
  'tests/broker-runtime-deployment.test.ts',
  'tests/broker-capture-scheduler.test.ts',
  'tests/broker-preview.test.ts',
  'tests/sql-contracts.test.ts',
] as const
const REQUIRED_CANDIDATE_SCOPE = [
  EVIDENCE_PATH,
  MANIFEST_PATH,
  'lib/server/broker-core-contracts.ts',
  'scripts/validate-multibroker-parity-manifest.mjs',
  'tests/mexc-capture-orchestrator.test.ts',
  'tests/multibroker-core-contracts.test.ts',
] as const

function scriptKindForPath(path: string) {
  const normalizedPath = path.toLowerCase()
  if (normalizedPath.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (normalizedPath.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (normalizedPath.endsWith('.js') || normalizedPath.endsWith('.mjs') || normalizedPath.endsWith('.cjs')) return ts.ScriptKind.JS
  if (normalizedPath.endsWith('.json')) return ts.ScriptKind.JSON
  return ts.ScriptKind.TS
}

function parseSource(content: string, path: string) {
  return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, scriptKindForPath(path))
}

function declarationsOfKind<T extends ts.Node>(guard: (node: ts.Node) => node is T) {
  const matches: T[] = []
  const visit = (node: ts.Node) => {
    if (guard(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(SOURCE_FILE)
  return matches
}

function interfaceDeclaration(name: string) {
  const declaration = declarationsOfKind(ts.isInterfaceDeclaration)
    .find((candidate) => candidate.name.text === name)
  if (!declaration) throw new Error(`Interface ${name} fehlt.`)
  return declaration
}

function typeAliasDeclaration(name: string) {
  const declaration = declarationsOfKind(ts.isTypeAliasDeclaration)
    .find((candidate) => candidate.name.text === name)
  if (!declaration) throw new Error(`Type-Alias ${name} fehlt.`)
  return declaration
}

function memberNames(members: ts.NodeArray<ts.TypeElement>) {
  return members.map((member) => {
    if (!member.name) throw new Error('Unbenanntes Vertragsmitglied ist nicht zulässig.')
    if (ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name)) return member.name.text
    throw new Error('Berechnete Vertragsmitgliedsnamen sind nicht zulässig.')
  })
}

function typeLiteralMemberNames(aliasName: string) {
  const alias = typeAliasDeclaration(aliasName)
  const candidate = ts.isTypeReferenceNode(alias.type)
    && ts.isIdentifier(alias.type.typeName)
    && alias.type.typeName.text === 'Readonly'
    && alias.type.typeArguments?.length === 1
    ? alias.type.typeArguments[0]
    : alias.type
  if (!ts.isTypeLiteralNode(candidate)) {
    throw new Error(`${aliasName} muss ein direktes oder Readonly-gekapseltes Type-Literal sein.`)
  }
  return memberNames(candidate.members)
}

type ModuleReferenceScan = Readonly<{ specifiers: string[]; findings: string[] }>

function moduleReferences(sourceFile = SOURCE_FILE): ModuleReferenceScan {
  const specifiers: string[] = []
  const findings: string[] = [
    ...(sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [],
  ].map((diagnostic) => `parse-diagnostic:${diagnostic.code}`)
  const isModuleRequire = (node: ts.Expression) => (
    ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'module'
      && node.name.text === 'require'
  ) || (
    ts.isElementAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'module'
      && node.argumentExpression
      && ts.isStringLiteralLike(node.argumentExpression)
      && node.argumentExpression.text === 'require'
  )
  const isDirectRequire = (node: ts.Expression) => (
    ts.isIdentifier(node) && node.text === 'require'
  ) || isModuleRequire(node)
  const allowedLoaderNodes = new Set<ts.Node>()
  const markDirectLoader = (node: ts.Expression) => {
    allowedLoaderNodes.add(node)
    if (ts.isPropertyAccessExpression(node)) allowedLoaderNodes.add(node.name)
    if (ts.isElementAccessExpression(node) && node.argumentExpression) allowedLoaderNodes.add(node.argumentExpression)
  }

  const addCallSpecifier = (node: ts.CallExpression, kind: string) => {
    const specifier = node.arguments[0]
    if (!specifier || !ts.isStringLiteralLike(specifier)) findings.push(`${kind}:nonliteral-or-missing`)
    else specifiers.push(specifier.text)
  }
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text)
    }
    if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
      && ts.isStringLiteralLike(node.moduleReference.expression)) {
      specifiers.push(node.moduleReference.expression.text)
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      addCallSpecifier(node, 'dynamic-import')
    } else if (ts.isCallExpression(node) && isDirectRequire(node.expression)) {
      markDirectLoader(node.expression)
      addCallSpecifier(node, 'commonjs-loader')
    } else if (ts.isCallExpression(node)
      && (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'require'
        || ts.isElementAccessExpression(node.expression)
          && node.expression.argumentExpression
          && ts.isStringLiteralLike(node.expression.argumentExpression)
          && node.expression.argumentExpression.text === 'require')) {
      findings.push('unsupported-commonjs-loader-owner')
    }
    const processBuiltinLoader = ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'process'
      && node.name.text === 'getBuiltinModule'
    const computedProcessBuiltinLoader = ts.isElementAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'process'
      && (!node.argumentExpression
        || !ts.isStringLiteralLike(node.argumentExpression)
        || node.argumentExpression.text === 'getBuiltinModule')
    if (processBuiltinLoader || computedProcessBuiltinLoader) findings.push('process-builtin-module-loader-reference')
    const calledProcessBuiltinLoader = ts.isCallExpression(node) && (
      (ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === 'process'
        && node.expression.name.text === 'getBuiltinModule')
      || (ts.isElementAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === 'process'
        && (!node.expression.argumentExpression
          || !ts.isStringLiteralLike(node.expression.argumentExpression)
          || node.expression.argumentExpression.text === 'getBuiltinModule'))
    )
    if (calledProcessBuiltinLoader) {
      addCallSpecifier(node, 'process-builtin-module-loader')
    }
    if ((ts.isIdentifier(node) && node.text === 'createRequire')
      || (ts.isPropertyAccessExpression(node) && node.name.text === 'createRequire')
      || (ts.isElementAccessExpression(node)
        && node.argumentExpression
        && ts.isStringLiteralLike(node.argumentExpression)
        && node.argumentExpression.text === 'createRequire')) {
      findings.push('create-require-loader-reference')
    }
    if ((ts.isCallExpression(node) || ts.isNewExpression(node))
      && ((ts.isIdentifier(node.expression) && (node.expression.text === 'eval' || node.expression.text === 'Function'))
        || (ts.isPropertyAccessExpression(node.expression) && (node.expression.name.text === 'eval' || node.expression.name.text === 'Function'))
        || (ts.isElementAccessExpression(node.expression)
          && node.expression.argumentExpression
          && ts.isStringLiteralLike(node.expression.argumentExpression)
          && (node.expression.argumentExpression.text === 'eval' || node.expression.argumentExpression.text === 'Function')))) {
      findings.push('dynamic-code-loader-reference')
    }
    if (ts.isIdentifier(node) && (node.text === 'eval' || node.text === 'Function')) {
      findings.push('dynamic-code-loader-reference')
    }
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'Reflect'
      && node.expression.name.text === 'construct'
      && node.arguments.some((argument) => ts.isIdentifier(argument) && argument.text === 'Function')) {
      findings.push('dynamic-code-loader-reference')
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  const inspectLoaderReferences = (node: ts.Node) => {
    const bareRequire = ts.isIdentifier(node)
      && node.text === 'require'
      && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
      && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
    const moduleRequire = ts.isExpression(node) && isModuleRequire(node)
    const computedModuleLoader = ts.isElementAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'module'
      && (!node.argumentExpression || !ts.isStringLiteralLike(node.argumentExpression))
    if ((bareRequire || moduleRequire) && !allowedLoaderNodes.has(node)) {
      findings.push('commonjs-loader-reference-outside-direct-literal-call')
    }
    if (computedModuleLoader) findings.push('computed-commonjs-loader-reference')
    ts.forEachChild(node, inspectLoaderReferences)
  }
  inspectLoaderReferences(sourceFile)
  return { specifiers, findings: [...new Set(findings)] }
}

function importSpecifiers(sourceFile = SOURCE_FILE) {
  return moduleReferences(sourceFile).specifiers
}

const FORBIDDEN_NETWORK_MODULES = new Set([
  'http', 'https', 'http2', 'net', 'tls',
  'node:http', 'node:https', 'node:http2', 'node:net', 'node:tls',
  'undici', 'axios', 'ws', '@mexc/sdk', 'ccxt',
])
const PROVIDER_ADAPTER_ROOT = 'lib/server/providers/'
const CENTRAL_EGRESS_CONTRACT_OWNER = 'lib/server/broker-core-contracts.ts:CentralBrokerEgress'
const ALLOWED_PRODUCT_NETWORK_FINDINGS = new Set([
  'components/layout/sidebar-nav.tsx:fetch-reference',
  'components/performance/performance-dashboard.tsx:fetch-reference',
  'components/performance/performance-navigation-tracker.tsx:fetch-reference',
  'lib/server/mexc-transport.ts:fetch-reference',
])
const ALLOWED_PRODUCT_DYNAMIC_IMPORT_CALLSITES = Object.freeze([
  'components/trades/snipping-assist-dynamic.tsx:16:9:@/components/trades/snipping-assist-card',
  'components/trades/trade-import-panel.tsx:145:31:read-excel-file/browser',
  'lib/utils/snipping-ocr.ts:79:38:tesseract.js',
])
const ALLOWED_ADAPTER_EXTERNAL_IMPORTS = new Set(['server-only'])
const WORKSPACE_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'] as const
const WORKSPACE_SOURCE_EXCLUDED_DIRECTORIES = new Set(['.git', '.next', 'node_modules', 'coverage'])
const ALLOWED_ADAPTER_MEMBERS = new Set([
  'providerCode',
  'providerContractVersion',
  'adapterVersion',
  'capabilities',
  'prepareReadPlan',
  'prepareProbeReadPlan',
  'inspectCaptureWireResponse',
  'inspectConnectionProbeWireResponse',
  'advanceCheckpoint',
  'mapRawEvents',
  'classifyFailure',
])

function unwrapRuntimeExpression(expression: ts.Expression): ts.Expression {
  let current = expression
  while (ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)) {
    current = current.expression
  }
  return current
}

function staticStringValue(expression: ts.Expression | undefined, bindings: ReadonlyMap<string, string>): string | null {
  if (!expression) return null
  const current = unwrapRuntimeExpression(expression)
  if (ts.isStringLiteralLike(current)) return current.text
  if (ts.isIdentifier(current)) return bindings.get(current.text) ?? null
  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticStringValue(current.left, bindings)
    const right = staticStringValue(current.right, bindings)
    return left === null || right === null ? null : `${left}${right}`
  }
  return null
}

function dynamicImportCallsiteKey(node: ts.CallExpression, sourceFile: ts.SourceFile, path: string) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  const argument = node.arguments[0]
  const specifier = argument && ts.isStringLiteralLike(argument) ? argument.text : '<nonliteral>'
  return `${path}:${position.line + 1}:${position.character + 1}:${specifier}`
}

function dynamicRuntimeFindings(sourceFile: ts.SourceFile, path: string) {
  const findings: string[] = []
  const staticStrings = new Map<string, string>()
  const capabilities = new Map<string, Set<string>>()
  const variableDeclarations: ts.VariableDeclaration[] = []
  const assignments: ts.BinaryExpression[] = []
  const functionDeclarations: ts.FunctionDeclaration[] = []

  const mergeCapabilities = (name: string, values: ReadonlySet<string>) => {
    const target = capabilities.get(name) ?? new Set<string>()
    const before = target.size
    for (const value of values) target.add(value)
    capabilities.set(name, target)
    return target.size !== before
  }
  const propertyCapabilities = (base: ReadonlySet<string>, property: string | null) => {
    const result = new Set<string>()
    if (property === null && [...base].some((value) => [
      'process-object', 'global-object', 'module-object', 'module-namespace', 'module-constructor',
    ].includes(value))) result.add('computed-runtime-member')
    if (base.has('process-object') && property === 'getBuiltinModule') result.add('builtin-module-loader')
    if (base.has('module-namespace') && property === 'createRequire') result.add('create-require-factory')
    if (base.has('module-object') && property === 'require') result.add('commonjs-loader')
    if (base.has('module-object') && property === 'constructor') result.add('module-constructor')
    if (base.has('module-constructor') && property === '_load') result.add('commonjs-loader')
    if (base.has('global-object') && (property === 'Function' || property === 'eval')) result.add('dynamic-code-factory')
    if (base.has('global-object') && property === 'fetch') result.add('fetch-function')
    if (base.has('global-object') && property === 'WebSocket') result.add('websocket-constructor')
    if (base.has('reflect-object') && property === 'construct') result.add('reflect-construct')
    return result
  }
  const expressionCapabilities = (expression: ts.Expression): Set<string> => {
    const current = unwrapRuntimeExpression(expression)
    if (ts.isIdentifier(current)) {
      const intrinsic = new Map<string, string>([
        ['process', 'process-object'],
        ['globalThis', 'global-object'],
        ['module', 'module-object'],
        ['require', 'commonjs-loader'],
        ['eval', 'dynamic-code-factory'],
        ['Function', 'dynamic-code-factory'],
        ['Reflect', 'reflect-object'],
        ['fetch', 'fetch-function'],
        ['WebSocket', 'websocket-constructor'],
      ]).get(current.text)
      return new Set([...(intrinsic ? [intrinsic] : []), ...(capabilities.get(current.text) ?? [])])
    }
    if (ts.isPropertyAccessExpression(current)) {
      return propertyCapabilities(expressionCapabilities(current.expression), current.name.text)
    }
    if (ts.isElementAccessExpression(current)) {
      return propertyCapabilities(
        expressionCapabilities(current.expression),
        staticStringValue(current.argumentExpression, staticStrings),
      )
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const returned = new Set<string>()
      if (ts.isExpression(current.body)) {
        for (const capability of expressionCapabilities(current.body)) returned.add(`returns:${capability}`)
      } else {
        const collectReturns = (node: ts.Node) => {
          if (ts.isReturnStatement(node) && node.expression) {
            for (const capability of expressionCapabilities(node.expression)) returned.add(`returns:${capability}`)
            return
          }
          ts.forEachChild(node, collectReturns)
        }
        collectReturns(current.body)
      }
      return returned
    }
    if (ts.isCallExpression(current)) {
      const called = expressionCapabilities(current.expression)
      const result = new Set<string>()
      if (called.has('create-require-factory')) result.add('commonjs-loader')
      for (const capability of called) {
        if (capability.startsWith('returns:')) result.add(capability.slice('returns:'.length))
      }
      return result
    }
    return new Set()
  }

  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)) variableDeclarations.push(node)
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(node.left)) assignments.push(node)
    if (ts.isFunctionDeclaration(node) && node.name) functionDeclarations.push(node)
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier) && node.moduleSpecifier.text === 'node:module') {
      const clause = node.importClause
      if (clause?.name) mergeCapabilities(clause.name.text, new Set(['module-namespace']))
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        mergeCapabilities(clause.namedBindings.name.text, new Set(['module-namespace']))
      }
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          if ((element.propertyName?.text ?? element.name.text) === 'createRequire') {
            mergeCapabilities(element.name.text, new Set(['create-require-factory']))
          }
        }
      }
    }
    ts.forEachChild(node, collect)
  }
  collect(sourceFile)

  for (let pass = 0; pass < variableDeclarations.length + assignments.length + 4; pass += 1) {
    let changed = false
    for (const declaration of variableDeclarations) {
      if (!declaration.initializer) continue
      if (ts.isIdentifier(declaration.name)) {
        const staticValue = staticStringValue(declaration.initializer, staticStrings)
        if (staticValue !== null && staticStrings.get(declaration.name.text) !== staticValue) {
          staticStrings.set(declaration.name.text, staticValue)
          changed = true
        }
        changed = mergeCapabilities(declaration.name.text, expressionCapabilities(declaration.initializer)) || changed
      } else if (ts.isObjectBindingPattern(declaration.name)) {
        const base = expressionCapabilities(declaration.initializer)
        for (const element of declaration.name.elements) {
          if (!ts.isIdentifier(element.name)) continue
          const property = element.propertyName && ts.isComputedPropertyName(element.propertyName)
            ? staticStringValue(element.propertyName.expression, staticStrings)
            : element.propertyName && (ts.isIdentifier(element.propertyName) || ts.isStringLiteralLike(element.propertyName))
              ? element.propertyName.text
              : element.name.text
          changed = mergeCapabilities(element.name.text, propertyCapabilities(base, property)) || changed
        }
      }
    }
    for (const assignment of assignments) {
      if (!ts.isIdentifier(assignment.left)) continue
      changed = mergeCapabilities(assignment.left.text, expressionCapabilities(assignment.right)) || changed
    }
    for (const declaration of functionDeclarations) {
      const returned = new Set<string>()
      const collectReturns = (node: ts.Node) => {
        if (ts.isReturnStatement(node) && node.expression) {
          for (const capability of expressionCapabilities(node.expression)) returned.add(`returns:${capability}`)
          return
        }
        ts.forEachChild(node, collectReturns)
      }
      if (declaration.body) collectReturns(declaration.body)
      changed = mergeCapabilities(declaration.name?.text ?? '', returned) || changed
    }
    if (!changed) break
  }

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0]
      const directLiteral = argument && ts.isStringLiteralLike(argument) ? argument.text : null
      const callsite = dynamicImportCallsiteKey(node, sourceFile, path)
      if (directLiteral === null || !ALLOWED_PRODUCT_DYNAMIC_IMPORT_CALLSITES.includes(callsite)) {
        findings.push(`dynamic-module-loader-not-allowlisted:${directLiteral ?? 'nonliteral'}`)
      }
    }
    if (ts.isExpression(node)) {
      const resolved = expressionCapabilities(node)
      if (resolved.has('builtin-module-loader')) findings.push('process-builtin-module-loader-reference')
      if (resolved.has('create-require-factory')) findings.push('create-require-loader-reference')
      if (resolved.has('commonjs-loader')) findings.push('commonjs-loader-reference-outside-direct-literal-call')
      if (resolved.has('dynamic-code-factory')) findings.push('dynamic-code-loader-reference')
      if (resolved.has('computed-runtime-member')) findings.push('computed-runtime-loader-reference')
      if (resolved.has('fetch-function')) findings.push('fetch-reference')
      if (resolved.has('websocket-constructor')) findings.push('websocket-reference')
      if (ts.isCallExpression(node)) {
        const called = expressionCapabilities(node.expression)
        if (called.has('builtin-module-loader') || called.has('commonjs-loader')) {
          const specifier = staticStringValue(node.arguments[0], staticStrings)
          if (specifier !== null) findings.push(`module:${specifier}`)
          else findings.push('runtime-module-loader:nonliteral-or-missing')
        }
        if (called.has('reflect-construct')
          && node.arguments.some((argument) => expressionCapabilities(argument).has('dynamic-code-factory'))) {
          findings.push('dynamic-code-loader-reference')
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return [...new Set(findings)]
}

function literalDynamicImportCallsites(content: string, path: string) {
  const sourceFile = parseSource(content, path)
  const callsites: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      callsites.push(dynamicImportCallsiteKey(node, sourceFile, path))
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return callsites
}

const RESTRICTED_BROKER_RUNTIME_ROOTS = new Set([
  'process',
  'module',
  'require',
  'eval',
  'Function',
  'Reflect',
  'globalThis',
  'global',
])

function brokerRuntimeRootFindings(content: string, path: string) {
  const sourceFile = parseSource(content, path)
  const findings: string[] = []
  const staticStrings = new Map<string, string>()
  const declarations: ts.VariableDeclaration[] = []
  const collectDeclarations = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.push(node)
    ts.forEachChild(node, collectDeclarations)
  }
  collectDeclarations(sourceFile)
  for (let pass = 0; pass < declarations.length + 1; pass += 1) {
    let changed = false
    for (const declaration of declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const value = staticStringValue(declaration.initializer, staticStrings)
      if (value !== null && staticStrings.get(declaration.name.text) !== value) {
        staticStrings.set(declaration.name.text, value)
        changed = true
      }
    }
    if (!changed) break
  }
  const isDirectPropertyRoot = (node: ts.Identifier, property: string) => ts.isPropertyAccessExpression(node.parent)
    && node.parent.expression === node
    && node.parent.name.text === property
  const isAllowedRuntimeRoot = (node: ts.Identifier) => {
    if ((path === CONTRACT_PATH || path === 'lib/server/broker-core-contracts.ts')
      && node.text === 'Reflect'
      && isDirectPropertyRoot(node, 'ownKeys')
      && ts.isCallExpression(node.parent.parent)
      && node.parent.parent.expression === node.parent) return true
    if (node.text === 'process' && isDirectPropertyRoot(node, 'env')) return true
    if (path === 'postcss.config.js'
      && node.text === 'module'
      && isDirectPropertyRoot(node, 'exports')
      && ts.isBinaryExpression(node.parent.parent)
      && node.parent.parent.left === node.parent
      && node.parent.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) return true
    if (path === 'components/trades/snipping-assist-dynamic.tsx' && node.text === 'module') {
      if (ts.isParameter(node.parent) && node.parent.name === node) return true
      if (isDirectPropertyRoot(node, 'SnippingAssistCard')) return true
    }
    if (path === 'components/setups/setup-image-lightbox.tsx'
      && node.text === 'globalThis'
      && ts.isQualifiedName(node.parent)
      && node.parent.left === node
      && node.parent.right.text === 'KeyboardEvent') return true
    if (path === 'lib/utils/snipping-files.ts'
      && node.text === 'globalThis'
      && isDirectPropertyRoot(node, 'crypto')) return true
    if (path === 'lib/server/performance.ts' && node.text === 'global') {
      if (ts.isModuleDeclaration(node.parent) && node.parent.name === node) return true
    }
    if (path === 'lib/server/performance.ts'
      && node.text === 'globalThis'
      && isDirectPropertyRoot(node, '__equoraPerformanceStore')) return true
    return false
  }
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)
      && RESTRICTED_BROKER_RUNTIME_ROOTS.has(node.text)
      && !isAllowedRuntimeRoot(node)) {
      findings.push(`restricted-runtime-root:${node.text}`)
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'constructor') {
      findings.push('restricted-constructor-member')
    }
    if (ts.isElementAccessExpression(node)
      && staticStringValue(node.argumentExpression, staticStrings) === 'constructor') {
      findings.push('restricted-constructor-member')
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return [...new Set(findings)]
}

function networkFindings(content: string, path: string) {
  const findings: string[] = []
  const sourceFile = parseSource(content, path)
  const references = moduleReferences(sourceFile)
  findings.push(...references.findings)
  findings.push(...dynamicRuntimeFindings(sourceFile, path))
  for (const specifier of references.specifiers) {
    if (FORBIDDEN_NETWORK_MODULES.has(specifier)) findings.push(`module:${specifier}`)
  }
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'fetch') findings.push('fetch-reference')
    if (ts.isElementAccessExpression(node)) {
      if (ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === 'fetch') findings.push('fetch-reference')
      if (ts.isIdentifier(node.expression) && node.expression.text === 'globalThis' && !ts.isStringLiteralLike(node.argumentExpression)) {
        findings.push('global-computed-network-reference')
      }
    }
    if (
      ts.isIdentifier(node)
      && node.text === 'fetch'
      && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
      && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
    ) findings.push('fetch-reference')
    if (ts.isIdentifier(node) && node.text === 'WebSocket') findings.push('websocket-reference')
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return [...new Set(findings)]
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`workspace_source_symlink_or_nonregular:${normalize(absolute)}`)
    if (entry.isDirectory()) {
      return WORKSPACE_SOURCE_EXCLUDED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(absolute)
    }
    const isSource = WORKSPACE_SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
    if (isSource && !entry.isFile()) throw new Error(`workspace_source_symlink_or_nonregular:${normalize(absolute)}`)
    return entry.isFile() && isSource ? [normalize(absolute)] : []
  })
}

function toWorkspacePath(absolute: string) {
  return relative(WORKSPACE, absolute).replaceAll('\\', '/')
}

function declaredMemberNames(node: ts.ClassDeclaration | ts.ObjectLiteralExpression) {
  const members = ts.isClassDeclaration(node) ? node.members : node.properties
  return members.flatMap((member) => {
    if (!member.name) return []
    if (ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name)) return [member.name.text]
    return []
  })
}

function adapterBoundaryFindings(content: string, path: string) {
  if (!path.startsWith(PROVIDER_ADAPTER_ROOT)) return []
  const sourceFile = parseSource(content, path)
  const findings: string[] = []
  if (!/-adapter\.ts$/.test(path)) findings.push('adapter-path-contract')
  for (const primitive of networkFindings(content, path)) findings.push(`network:${primitive}`)
  for (const primitive of brokerRuntimeRootFindings(content, path)) findings.push(`runtime-root:${primitive}`)
  let adapterCandidates = 0
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node) || ts.isObjectLiteralExpression(node)) {
      const names = declaredMemberNames(node)
      const members = ts.isClassDeclaration(node) ? node.members : node.properties
      if (members.some((member) => member.name
        && !ts.isIdentifier(member.name)
        && !ts.isStringLiteralLike(member.name))) findings.push('adapter-computed-member')
      const implementsAdapter = ts.isClassDeclaration(node) && node.heritageClauses?.some((clause) => (
        clause.token === ts.SyntaxKind.ImplementsKeyword
        && clause.types.some((type) => type.expression.getText(sourceFile) === 'ReadOnlyBrokerAdapter')
      ))
      const isAdapterImplementation = implementsAdapter || names.includes('prepareReadPlan') || names.includes('mapRawEvents')
      if (isAdapterImplementation) {
        adapterCandidates += 1
        if (ts.isClassDeclaration(node) && node.heritageClauses?.some((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)) {
          findings.push('adapter-inheritance')
        }
        if (node.parent && !ts.isSourceFile(node.parent) && !ts.isVariableDeclaration(node.parent)) findings.push('factory-or-nested-adapter')
        if (members.some(ts.isSpreadAssignment)) findings.push('adapter-spread')
        for (const name of names) {
          if (!ALLOWED_ADAPTER_MEMBERS.has(name)) findings.push(`unexpected-adapter-member:${name}`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (adapterCandidates !== 1) findings.push(`adapter-candidate-count:${adapterCandidates}`)
  return [...new Set(findings)]
}

function adapterLocationFindings(content: string, path: string) {
  if (path === 'lib/server/broker-core-contracts.ts' || path.startsWith(PROVIDER_ADAPTER_ROOT)) return []
  const sourceFile = parseSource(content, path)
  let structuralAdapter = false
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node) || ts.isObjectLiteralExpression(node)) {
      const names = declaredMemberNames(node)
      if (names.includes('prepareReadPlan') || names.includes('mapRawEvents')) structuralAdapter = true
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return structuralAdapter || /\bReadOnlyBrokerAdapter\b/.test(content)
    ? [`adapter-outside-fixed-root:${path}`]
    : []
}

function workspaceModuleSpecifiers(content: string, path: string) {
  return moduleReferences(parseSource(content, path))
}

function moduleResolutionCandidates(base: string) {
  const withoutRuntimeExtension = base.replace(/\.(?:mjs|cjs|js|jsx)$/, '')
  return [...new Set([
    base,
    withoutRuntimeExtension,
    ...WORKSPACE_SOURCE_EXTENSIONS.map((extension) => `${withoutRuntimeExtension}${extension}`),
    ...WORKSPACE_SOURCE_EXTENSIONS.map((extension) => `${withoutRuntimeExtension}/index${extension}`),
  ])]
}

function resolveWorkspaceModule(sourcePath: string, specifier: string, sources: ReadonlyMap<string, string>) {
  if (ALLOWED_ADAPTER_EXTERNAL_IMPORTS.has(specifier)
    || sourcePath === 'lib/server/broker-core-contracts.ts'
      && (specifier === 'node:crypto' || specifier === 'node:util/types')) {
    return { kind: 'allowed_external' as const, specifier }
  }
  let base: string | null = null
  if (specifier.startsWith('@/')) base = specifier.slice(2)
  else if (specifier.startsWith('.')) base = posix.normalize(posix.join(posix.dirname(sourcePath), specifier))
  if (base !== null) {
    const resolved = moduleResolutionCandidates(base).find((candidate) => sources.has(candidate))
    return resolved
      ? { kind: 'internal' as const, path: resolved }
      : { kind: 'unresolved_internal' as const, specifier }
  }
  return { kind: 'external_not_allowlisted' as const, specifier }
}

function adapterDependencyFindings(sources: ReadonlyMap<string, string>) {
  const roots = [...sources.keys()].filter((path) => path.startsWith(PROVIDER_ADAPTER_ROOT))
  const findings: string[] = []
  for (const root of roots) findings.push(...adapterBoundaryFindings(sources.get(root) ?? '', root).map((finding) => `${root}:${finding}`))
  const pending = [...roots]
  const visited = new Set<string>()
  while (pending.length) {
    const path = pending.pop()
    if (!path || visited.has(path)) continue
    visited.add(path)
    const content = sources.get(path)
    if (content === undefined) continue
    findings.push(...brokerRuntimeRootFindings(content, path).map((finding) => `${path}:runtime-root:${finding}`))
    if (path !== 'lib/server/broker-core-contracts.ts') {
      findings.push(...networkFindings(content, path).map((finding) => `${path}:transitive-network:${finding}`))
    }
    const references = workspaceModuleSpecifiers(content, path)
    findings.push(...references.findings.map((finding) => `${path}:module-extraction:${finding}`))
    for (const specifier of references.specifiers) {
      const resolution = resolveWorkspaceModule(path, specifier, sources)
      if (resolution.kind === 'internal') pending.push(resolution.path)
      else if (resolution.kind === 'unresolved_internal') {
        findings.push(`${path}:unresolved-internal-import:${specifier}`)
      } else if (resolution.kind === 'external_not_allowlisted') {
        findings.push(`${path}:external-import-not-allowlisted:${specifier}`)
      }
    }
  }
  return [...new Set(findings)]
}

function isProductSourcePath(path: string) {
  return !path.startsWith('tests/')
    && !path.startsWith('scripts/')
    && !path.startsWith('.github/')
}

type ProductSource = Readonly<{ path: string; content: string }>

function aggregateProductBoundaryFindings(sources: readonly ProductSource[]) {
  return new Set(sources
    .filter(({ path }) => isProductSourcePath(path))
    .flatMap(({ path, content }) => [
      ...networkFindings(content, path).map((finding) => `${path}:${finding}`),
      ...brokerRuntimeRootFindings(content, path).map((finding) => `${path}:runtime-root:${finding}`),
    ]))
}

function egressDeclarationOwners(content: string, path: string) {
  const sourceFile = parseSource(content, path)
  const owners: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) {
      const names = node.members.flatMap((member) => member.name && (ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name)) ? [member.name.text] : [])
      if (names.includes('executeAuthorizedRead')) owners.push(`${path}:${node.name?.text ?? '<anonymous>'}`)
    }
    if (ts.isObjectLiteralExpression(node)) {
      const names = declaredMemberNames(node)
      if (names.includes('executeAuthorizedRead')) owners.push(`${path}:<object>`)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return owners
}

function sha256(input: Buffer | string) {
  return createHash('sha256').update(input).digest('hex')
}

function canonicalBytes(path: string) {
  const raw = readFileSync(path)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(raw)
  return Buffer.from(text.replace(/\r\n?/g, '\n'), 'utf8')
}

type Fixture = Readonly<{
  root: string
  outsideRoot: string
  normativePaths: string[]
  evidence: Record<string, unknown>
  rewrite: () => void
  dispose: () => void
}>

function writeFixtureFile(root: string, path: string, value: Buffer | string) {
  const absolute = join(root, ...path.split('/'))
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, value)
}

function createValidatorFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'equora-mb0-validator-'))
  const outsideRoot = mkdtempSync(join(tmpdir(), 'equora-mb0-validator-outside-'))
  const normativePaths = [...new Set([...REQUIRED_NORMATIVE_PATHS, ...REQUIRED_PARITY_PATHS])]
  for (const path of normativePaths) writeFixtureFile(root, path, `fixture:${path}\n`)
  writeFixtureFile(root, '.github/workflows/ci.yml', "steps:\n  - with:\n      node-version: 24.18.0\n")

  const sourceEvidence = JSON.parse(readFileSync(join(WORKSPACE, ...EVIDENCE_PATH.split('/')), 'utf8')) as {
    baseline_attempts: Array<Record<string, unknown>>
    candidate_attempts: Array<Record<string, unknown>>
  }
  const pinnedAttempts = (collection: 'baseline_attempts' | 'candidate_attempts', ids: readonly string[]) => ids.map((id) => {
    const attempt = sourceEvidence[collection].find((candidate) => candidate.attempt_id === id)
    if (!attempt) throw new Error(`Snapshotpin-Attempt fehlt in der Evidence: ${id}`)
    return JSON.parse(JSON.stringify(attempt)) as Record<string, unknown>
  })
  const canonicalPinnedAttempt = (
    attemptId: string,
    command: string,
    result: string,
    outputBytes: number,
    outputSha256: string,
    resultCounts?: Record<string, number>,
  ) => ({
    attempt_id: attemptId,
    command,
    started_at_utc: '2026-08-14T22:00:00.000Z',
    ended_at_utc: '2026-08-14T22:00:01.000Z',
    exit_code: 0,
    result,
    ...(resultCounts ? { result_counts: resultCounts } : {}),
    output_transcript_policy: 'canonical_gate_transcript_v1',
    stdout_stderr_utf8_bytes: outputBytes,
    stdout_stderr_sha256: outputSha256,
  })

  const evidence: Record<string, unknown> = {
    schema_version: 'equora_multi_broker_parity_evidence_v1',
    evidence_format_version: 1,
    phase: 'MB0',
    toolchain: {
      node: 'v24.18.0',
      npm: '11.16.0',
      git: '2.53.0.windows.2',
      operating_system: 'Microsoft Windows NT 10.0.26100.0',
      docker_client: '29.6.2',
      docker_client_observation: 'fixture observation',
      postgres_client: 'not_available_on_path',
      postgres_image: 'not_invoked_in_mb0',
      ci_node: '24.18.0',
    },
    expected_baseline_counts: {
      test_files: 23,
      tests: 380,
      audit_all_vulnerabilities: 0,
      audit_production_vulnerabilities: 0,
    },
    candidate_counts: {
      test_files: 24,
      tests: 398,
      new_contract_test_files: 1,
      new_contract_tests: 18,
      audit_all_vulnerabilities: 0,
      audit_production_vulnerabilities: 0,
    },
    gate_transcript_policies: {
      canonical_gate_transcript_v1: {
        encoding: 'UTF-8',
        line_endings: 'LF',
        redactions: [
          'Vitest Start at line replaced by:    Start at <redacted>',
          'Vitest Duration line replaced by:    Duration <redacted>',
          'Next.js Compiled successfully duration suffix replaced by: in <redacted>',
        ],
        non_redacted_contract: 'All other stdout/stderr text, commands, exit codes and result counts remain unchanged; the recorded byte count and SHA-256 bind the canonical transcript rather than the volatile physical terminal transcript.',
      },
    },
    baseline_attempts: pinnedAttempts('baseline_attempts', [
      'mb0-local-002',
      'mb0-local-003',
      'mb0-local-004',
      'mb0-local-005',
      'mb0-local-006',
      'mb0-local-007',
      'mb0-local-008',
    ]),
    candidate_attempts: [
      ...pinnedAttempts('candidate_attempts', [
        'mb0-remediation2-targeted-002',
        'mb0-remediation2-typecheck-002',
        'mb0-remediation2-full-002',
        'mb0-remediation2-release-002',
        'mb0-remediation2-audit-all-002',
        'mb0-remediation2-audit-prod-002',
        'mb0-remediation2-build-002',
        'mb0-remediation2-manifest-001',
      ]),
      canonicalPinnedAttempt('mb0-remediation3-targeted-001', 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', 'pass', 276, '68a1a9ff836d9b95c62a98664a9d9706cd793f5e9431c7a0d2910dac8fc13867', {
        test_files_passed: 1, test_files_total: 1, tests_passed: 16, tests_total: 16,
      }),
      canonicalPinnedAttempt('mb0-remediation3-typecheck-001', 'npm.cmd run typecheck', 'pass', 63, '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17'),
      canonicalPinnedAttempt('mb0-remediation3-full-001', 'npm.cmd test', 'pass', 239, '41f686510119faeb69351d69ea90710bb99ba5fe41a785ed2c172e15d1a90019', {
        test_files_passed: 24, test_files_total: 24, tests_passed: 396, tests_total: 396,
      }),
      canonicalPinnedAttempt('mb0-remediation3-release-001', 'npm.cmd run release:check', 'pass', 149, 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a'),
      canonicalPinnedAttempt('mb0-remediation3-audit-all-001', 'npm.cmd audit', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation3-audit-prod-001', 'npm.cmd audit --omit=dev', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation3-build-001', 'npm.cmd run build', 'pass', 2183, '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', {
        static_pages_generated: 3, static_pages_total: 3,
      }),
      canonicalPinnedAttempt('mb0-remediation3-manifest-001', 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', 'pass_bootstrap_before_append_only_evidence_rehash', 91, 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', {
        manifest_entries_passed: 28, manifest_entries_total: 28,
      }),
      canonicalPinnedAttempt('mb0-remediation4-targeted-001', 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', 'pass', 276, '68a1a9ff836d9b95c62a98664a9d9706cd793f5e9431c7a0d2910dac8fc13867', {
        test_files_passed: 1, test_files_total: 1, tests_passed: 16, tests_total: 16,
      }),
      canonicalPinnedAttempt('mb0-remediation4-typecheck-001', 'npm.cmd run typecheck', 'pass', 63, '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17'),
      canonicalPinnedAttempt('mb0-remediation4-full-001', 'npm.cmd test', 'pass', 239, '41f686510119faeb69351d69ea90710bb99ba5fe41a785ed2c172e15d1a90019', {
        test_files_passed: 24, test_files_total: 24, tests_passed: 396, tests_total: 396,
      }),
      canonicalPinnedAttempt('mb0-remediation4-release-001', 'npm.cmd run release:check', 'pass', 149, 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a'),
      canonicalPinnedAttempt('mb0-remediation4-audit-all-001', 'npm.cmd audit', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation4-audit-prod-001', 'npm.cmd audit --omit=dev', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation4-build-001', 'npm.cmd run build', 'pass', 2183, '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', {
        static_pages_generated: 3, static_pages_total: 3,
      }),
      canonicalPinnedAttempt('mb0-remediation4-manifest-001', 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', 'pass_bootstrap_before_append_only_evidence_rehash', 91, 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', {
        manifest_entries_passed: 28, manifest_entries_total: 28,
      }),
      canonicalPinnedAttempt('mb0-remediation5-targeted-001', 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', 'pass', 276, '68a1a9ff836d9b95c62a98664a9d9706cd793f5e9431c7a0d2910dac8fc13867', {
        test_files_passed: 1, test_files_total: 1, tests_passed: 16, tests_total: 16,
      }),
      canonicalPinnedAttempt('mb0-remediation5-typecheck-001', 'npm.cmd run typecheck', 'pass', 63, '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17'),
      canonicalPinnedAttempt('mb0-remediation5-full-001', 'npm.cmd test', 'pass', 239, '41f686510119faeb69351d69ea90710bb99ba5fe41a785ed2c172e15d1a90019', {
        test_files_passed: 24, test_files_total: 24, tests_passed: 396, tests_total: 396,
      }),
      canonicalPinnedAttempt('mb0-remediation5-release-001', 'npm.cmd run release:check', 'pass', 149, 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a'),
      canonicalPinnedAttempt('mb0-remediation5-audit-all-001', 'npm.cmd audit', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation5-audit-prod-001', 'npm.cmd audit --omit=dev', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation5-build-001', 'npm.cmd run build', 'pass', 2183, '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', {
        static_pages_generated: 3, static_pages_total: 3,
      }),
      canonicalPinnedAttempt('mb0-remediation5-manifest-001', 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', 'pass_bootstrap_before_append_only_evidence_rehash', 91, 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', {
        manifest_entries_passed: 28, manifest_entries_total: 28,
      }),
      canonicalPinnedAttempt('mb0-remediation6-targeted-001', 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', 'pass', 276, '4f0b60574ed91b7771fe0541dbb11bb0839403340e478cffa5fcb439a36ee75a', {
        test_files_passed: 1, test_files_total: 1, tests_passed: 18, tests_total: 18,
      }),
      canonicalPinnedAttempt('mb0-remediation6-typecheck-001', 'npm.cmd run typecheck', 'pass', 63, '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17'),
      canonicalPinnedAttempt('mb0-remediation6-full-001', 'npm.cmd test', 'pass', 239, '2f32254681edd551d66ef6ebe91348ab69f6a89ac33e4249923783ee38d9e38a', {
        test_files_passed: 24, test_files_total: 24, tests_passed: 398, tests_total: 398,
      }),
      canonicalPinnedAttempt('mb0-remediation6-release-001', 'npm.cmd run release:check', 'pass', 149, 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a'),
      canonicalPinnedAttempt('mb0-remediation6-audit-all-001', 'npm.cmd audit', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation6-audit-prod-001', 'npm.cmd audit --omit=dev', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation6-build-001', 'npm.cmd run build', 'pass', 2183, '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', {
        static_pages_generated: 3, static_pages_total: 3,
      }),
      canonicalPinnedAttempt('mb0-remediation6-manifest-001', 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', 'pass_bootstrap_before_append_only_evidence_rehash', 91, 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', {
        manifest_entries_passed: 28, manifest_entries_total: 28,
      }),
      canonicalPinnedAttempt('mb0-remediation6-closure-targeted-001', 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', 'pass', 276, '4f0b60574ed91b7771fe0541dbb11bb0839403340e478cffa5fcb439a36ee75a', {
        test_files_passed: 1, test_files_total: 1, tests_passed: 18, tests_total: 18,
      }),
      canonicalPinnedAttempt('mb0-remediation6-closure-typecheck-001', 'npm.cmd run typecheck', 'pass', 63, '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17'),
      canonicalPinnedAttempt('mb0-remediation6-closure-full-001', 'npm.cmd test', 'pass', 239, '2f32254681edd551d66ef6ebe91348ab69f6a89ac33e4249923783ee38d9e38a', {
        test_files_passed: 24, test_files_total: 24, tests_passed: 398, tests_total: 398,
      }),
      canonicalPinnedAttempt('mb0-remediation6-closure-release-001', 'npm.cmd run release:check', 'pass', 149, 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a'),
      canonicalPinnedAttempt('mb0-remediation6-closure-audit-all-001', 'npm.cmd audit', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation6-closure-audit-prod-001', 'npm.cmd audit --omit=dev', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation6-closure-build-001', 'npm.cmd run build', 'pass', 2183, '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', {
        static_pages_generated: 3, static_pages_total: 3,
      }),
      canonicalPinnedAttempt('mb0-remediation7-closure-targeted-001', 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', 'pass', 276, '4f0b60574ed91b7771fe0541dbb11bb0839403340e478cffa5fcb439a36ee75a', {
        test_files_passed: 1, test_files_total: 1, tests_passed: 18, tests_total: 18,
      }),
      canonicalPinnedAttempt('mb0-remediation7-closure-typecheck-001', 'npm.cmd run typecheck', 'pass', 63, '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17'),
      canonicalPinnedAttempt('mb0-remediation7-closure-full-001', 'npm.cmd test', 'pass', 239, '2f32254681edd551d66ef6ebe91348ab69f6a89ac33e4249923783ee38d9e38a', {
        test_files_passed: 24, test_files_total: 24, tests_passed: 398, tests_total: 398,
      }),
      canonicalPinnedAttempt('mb0-remediation7-closure-release-001', 'npm.cmd run release:check', 'pass', 149, 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a'),
      canonicalPinnedAttempt('mb0-remediation7-closure-audit-all-001', 'npm.cmd audit', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation7-closure-audit-prod-001', 'npm.cmd audit --omit=dev', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation7-closure-build-001', 'npm.cmd run build', 'pass', 2183, '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', {
        static_pages_generated: 3, static_pages_total: 3,
      }),
      canonicalPinnedAttempt('mb0-remediation7-closure-manifest-001', 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', 'pass_bootstrap_before_append_only_evidence_rehash', 91, 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', {
        manifest_entries_passed: 28, manifest_entries_total: 28,
      }),
      canonicalPinnedAttempt('mb0-remediation8-closure-targeted-001', 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', 'pass', 276, '4f0b60574ed91b7771fe0541dbb11bb0839403340e478cffa5fcb439a36ee75a', {
        test_files_passed: 1, test_files_total: 1, tests_passed: 18, tests_total: 18,
      }),
      canonicalPinnedAttempt('mb0-remediation8-closure-typecheck-001', 'npm.cmd run typecheck', 'pass', 63, '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17'),
      canonicalPinnedAttempt('mb0-remediation8-closure-full-001', 'npm.cmd test', 'pass', 239, '2f32254681edd551d66ef6ebe91348ab69f6a89ac33e4249923783ee38d9e38a', {
        test_files_passed: 24, test_files_total: 24, tests_passed: 398, tests_total: 398,
      }),
      canonicalPinnedAttempt('mb0-remediation8-closure-release-001', 'npm.cmd run release:check', 'pass', 149, 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a'),
      canonicalPinnedAttempt('mb0-remediation8-closure-audit-all-001', 'npm.cmd audit', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation8-closure-audit-prod-001', 'npm.cmd audit --omit=dev', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation8-closure-build-001', 'npm.cmd run build', 'pass', 2183, '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', {
        static_pages_generated: 3, static_pages_total: 3,
      }),
      canonicalPinnedAttempt('mb0-remediation8-closure-manifest-001', 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', 'pass_bootstrap_before_append_only_evidence_rehash', 91, 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', {
        manifest_entries_passed: 28, manifest_entries_total: 28,
      }),
      canonicalPinnedAttempt('mb0-remediation9-closure-targeted-001', 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', 'pass', 276, '4f0b60574ed91b7771fe0541dbb11bb0839403340e478cffa5fcb439a36ee75a', {
        test_files_passed: 1, test_files_total: 1, tests_passed: 18, tests_total: 18,
      }),
      canonicalPinnedAttempt('mb0-remediation9-closure-typecheck-001', 'npm.cmd run typecheck', 'pass', 63, '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17'),
      canonicalPinnedAttempt('mb0-remediation9-closure-full-001', 'npm.cmd test', 'pass', 239, '2f32254681edd551d66ef6ebe91348ab69f6a89ac33e4249923783ee38d9e38a', {
        test_files_passed: 24, test_files_total: 24, tests_passed: 398, tests_total: 398,
      }),
      canonicalPinnedAttempt('mb0-remediation9-closure-release-001', 'npm.cmd run release:check', 'pass', 149, 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a'),
      canonicalPinnedAttempt('mb0-remediation9-closure-audit-all-001', 'npm.cmd audit', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation9-closure-audit-prod-001', 'npm.cmd audit --omit=dev', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation9-closure-build-001', 'npm.cmd run build', 'pass', 2183, '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', {
        static_pages_generated: 3, static_pages_total: 3,
      }),
      canonicalPinnedAttempt('mb0-remediation9-closure-manifest-001', 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', 'pass_bootstrap_before_append_only_evidence_rehash', 91, 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', {
        manifest_entries_passed: 28, manifest_entries_total: 28,
      }),
      canonicalPinnedAttempt('mb0-remediation10-closure-targeted-001', 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', 'pass', 276, '4f0b60574ed91b7771fe0541dbb11bb0839403340e478cffa5fcb439a36ee75a', {
        test_files_passed: 1, test_files_total: 1, tests_passed: 18, tests_total: 18,
      }),
      canonicalPinnedAttempt('mb0-remediation10-closure-typecheck-001', 'npm.cmd run typecheck', 'pass', 63, '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17'),
      canonicalPinnedAttempt('mb0-remediation10-closure-full-001', 'npm.cmd test', 'pass', 239, '2f32254681edd551d66ef6ebe91348ab69f6a89ac33e4249923783ee38d9e38a', {
        test_files_passed: 24, test_files_total: 24, tests_passed: 398, tests_total: 398,
      }),
      canonicalPinnedAttempt('mb0-remediation10-closure-release-001', 'npm.cmd run release:check', 'pass', 149, 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a'),
      canonicalPinnedAttempt('mb0-remediation10-closure-audit-all-001', 'npm.cmd audit', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation10-closure-audit-prod-001', 'npm.cmd audit --omit=dev', 'pass_after_explicit_advisory_api_authorization', 24, '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', { vulnerabilities: 0 }),
      canonicalPinnedAttempt('mb0-remediation10-closure-build-001', 'npm.cmd run build', 'pass', 2183, '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', {
        static_pages_generated: 3, static_pages_total: 3,
      }),
      canonicalPinnedAttempt('mb0-remediation10-closure-manifest-001', 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', 'pass_bootstrap_before_append_only_evidence_rehash', 91, 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', {
        manifest_entries_passed: 28, manifest_entries_total: 28,
      }),
    ],
    canonical_hash_policy: {
      manifest_entry_prefix: 'lf:',
      manifest_path: MANIFEST_PATH,
      manifest_entry_count: normativePaths.length + 1,
    },
    candidate_scope: [...REQUIRED_CANDIDATE_SCOPE],
    parity_matrix: [...REQUIRED_PARITY_PATHS],
    normative_inputs: [],
  }

  const rewrite = () => {
    evidence.normative_inputs = normativePaths.map((path) => {
      const canonical = canonicalBytes(join(root, ...path.split('/')))
      return { path, canonical_utf8_bytes: canonical.length, sha256: sha256(canonical) }
    })
    const policy = evidence.canonical_hash_policy as { manifest_entry_count: number }
    policy.manifest_entry_count = normativePaths.length + 1
    writeFixtureFile(root, EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`)
    const entries = [...normativePaths, EVIDENCE_PATH].sort().map((path) => {
      const canonical = canonicalBytes(join(root, ...path.split('/')))
      return `${sha256(canonical)}  lf:${path}`
    })
    writeFixtureFile(root, MANIFEST_PATH, `${entries.join('\n')}\n`)
  }
  rewrite()

  return {
    root,
    outsideRoot,
    normativePaths,
    evidence,
    rewrite,
    dispose: () => {
      rmSync(root, { recursive: true, force: true })
      rmSync(outsideRoot, { recursive: true, force: true })
    },
  }
}

async function loadValidator() {
  // @ts-expect-error The production validator is intentionally an ESM JavaScript CLI without a declaration file.
  const module = await import('../scripts/validate-multibroker-parity-manifest.mjs') as {
    validateMultibrokerParityManifest: ManifestValidator
  }
  return module.validateMultibrokerParityManifest
}

describe('provider-neutral MB0 core contract', () => {
  it('keeps the provider-neutral server-bound contract and central egress boundary unwired from product runtime', () => {
    expect(importSpecifiers()).toEqual(['server-only', 'node:crypto', 'node:util/types'])
    expect(networkFindings(CONTRACT_SOURCE, CONTRACT_PATH)).toEqual([])
    expect(brokerRuntimeRootFindings(CONTRACT_SOURCE, CONTRACT_PATH)).toEqual([])
    expect(CONTRACT_SOURCE).not.toMatch(/https?:\/\//i)
    expect(CONTRACT_SOURCE).not.toMatch(/\b(?:mexc|binance|bybit|okx)\b/i)
    expect(CONTRACT_SOURCE).not.toMatch(/@supabase|lib\/supabase|broker-secret-store/i)
    expect(CONTRACT_SOURCE).not.toMatch(/export function consumeValidated/)
    expect(CONTRACT_SOURCE).not.toMatch(/consumedBrokerPermitKeys/)
    expect(typeLiteralMemberNames('BrokerReadRequestPlan')).toEqual([
      'authorityPurpose',
      'authorityTupleDigest',
      'provider',
      'requestBinding',
      'method',
      'httpsOrigin',
      'port',
      'pathTemplateId',
      'canonicalPath',
      'canonicalQuery',
      'redirectMode',
      'responseByteLimit',
      'requestTimeoutMs',
      'planContractVersion',
      'canonicalUnsignedRequestDigest',
    ])
    expect(typeLiteralMemberNames('AuthorizedBrokerReadPermit')).toEqual([
      'authority',
      'canonicalUnsignedRequestDigest',
      'requestAuthorityId',
      'authorizationBinding',
      'permitContractVersion',
      'singleUse',
      'issuedAt',
      'sendDeadlineAt',
    ])
  })

  it('freezes GET as the only provider read method', () => {
    const alias = typeAliasDeclaration('ProviderReadMethod')
    expect(ts.isLiteralTypeNode(alias.type)).toBe(true)
    if (!ts.isLiteralTypeNode(alias.type) || !ts.isStringLiteral(alias.type.literal)) {
      throw new Error('ProviderReadMethod muss ein einzelnes String-Literal sein.')
    }
    expect(alias.type.literal.text).toBe('GET')
  })

  it('keeps the adapter non-sending and the central egress as the only generic send owner', () => {
    expect(memberNames(interfaceDeclaration('ReadOnlyBrokerAdapter').members)).toEqual([
      'providerCode',
      'providerContractVersion',
      'adapterVersion',
      'capabilities',
      'prepareReadPlan',
      'prepareProbeReadPlan',
      'inspectCaptureWireResponse',
      'inspectConnectionProbeWireResponse',
      'advanceCheckpoint',
      'mapRawEvents',
      'classifyFailure',
    ])
    expect(memberNames(interfaceDeclaration('CentralBrokerEgress').members)).toEqual([
      'executeAuthorizedRead',
      'executeAuthorizedRead',
    ])

    const serverSources = sourceFiles(join(WORKSPACE, 'lib', 'server')).map((absolute) => ({
      path: toWorkspacePath(absolute),
      content: readFileSync(absolute, 'utf8'),
    }))
    const workspaceSources = sourceFiles(WORKSPACE).map((absolute) => ({
      path: toWorkspacePath(absolute),
      content: readFileSync(absolute, 'utf8'),
    }))
    const egressOwners = workspaceSources
      .filter(({ path }) => isProductSourcePath(path))
      .flatMap(({ path, content }) => egressDeclarationOwners(content, path))
    expect(egressOwners).toContain(CENTRAL_EGRESS_CONTRACT_OWNER)
    expect(egressOwners.every((owner) => owner.startsWith('lib/server/broker-core-contracts.ts:'))).toBe(true)
    expect(workspaceSources.filter(({ path, content }) => (
      isProductSourcePath(path)
      && path !== 'lib/server/broker-core-contracts.ts'
      && /\b(?:createCentralBrokerEgress|createCaptureCommitBoundary)\b/.test(content)
    )).map(({ path }) => path)).toEqual([])
    expect(serverSources.flatMap(({ path, content }) => adapterLocationFindings(content, path))).toEqual([])
    expect(serverSources.flatMap(({ path, content }) => adapterBoundaryFindings(content, path).map((finding) => ({ path, finding })))).toEqual([])
    expect(adapterDependencyFindings(new Map(workspaceSources.map(({ path, content }) => [path, content])))).toEqual([])
    const productNetworkFindings = aggregateProductBoundaryFindings(workspaceSources)
    expect(productNetworkFindings).toEqual(ALLOWED_PRODUCT_NETWORK_FINDINGS)
    const productDynamicImports = workspaceSources
      .filter(({ path }) => isProductSourcePath(path))
      .flatMap(({ path, content }) => literalDynamicImportCallsites(content, path))
      .sort()
    expect(productDynamicImports).toEqual([...ALLOWED_PRODUCT_DYNAMIC_IMPORT_CALLSITES].sort())
  }, 60_000)

  it('scans the complete product tree and detects network and adapter-boundary mutants', () => {

    const networkMutant = "import { request } from 'node:https'\nconst sdk = import('@mexc/sdk')\nexport const value = globalThis.fetch('https://example.invalid')\n"
    expect(networkFindings(networkMutant, 'mutant.ts')).toEqual(expect.arrayContaining([
      'module:node:https',
      'module:@mexc/sdk',
      'fetch-reference',
      'dynamic-module-loader-not-allowlisted:@mexc/sdk',
    ]))
    const differentlyNamedSender = "export async function dispatchProviderPage() { return globalThis['fetch']('/broker') }\n"
    expect(networkFindings(differentlyNamedSender, 'app/rogue-provider-page.ts')).toContain('fetch-reference')
    const aliasMutant = "const direct = fetch\nconst bound = globalThis.fetch.bind(globalThis)\nconst key = 'fetch'\nconst computed = globalThis[key]\nconst sdkName = '@mexc/sdk'\nvoid import(sdkName)\nvoid direct\nvoid bound\nvoid computed\n"
    expect(networkFindings(aliasMutant, 'mutant.ts')).toEqual(expect.arrayContaining([
      'fetch-reference',
      'global-computed-network-reference',
      'dynamic-import:nonliteral-or-missing',
    ]))
    for (const [mutant, expected] of [
      ["const load = process.getBuiltinModule('node:https')\nvoid load\n", ['process-builtin-module-loader-reference', 'module:node:https']],
      ["const name = 'node:https'\nconst load = process['getBuiltinModule'](name)\nvoid load\n", ['process-builtin-module-loader-reference', 'process-builtin-module-loader:nonliteral-or-missing']],
      ["import { createRequire as makeLoader } from 'node:module'\nconst load = makeLoader(import.meta.url)\nvoid load('node:https')\n", ['create-require-loader-reference']],
      ["const loader = () => require\nvoid loader()('node:https')\n", ['commonjs-loader-reference-outside-direct-literal-call']],
      ["void eval('require(\\'node:https\\')')\nvoid Function('return fetch')\n", ['dynamic-code-loader-reference']],
      ["const indirect = Function\nconst returned = () => indirect\nvoid returned()('return fetch')\n", ['dynamic-code-loader-reference']],
      ["void Reflect.construct(Function, ['return fetch'])\n", ['dynamic-code-loader-reference']],
      ["const runtimeProcess = process\nconst loadBuiltin = runtimeProcess.getBuiltinModule\nconst https = loadBuiltin('node:https')\nvoid https\n", ['process-builtin-module-loader-reference', 'module:node:https']],
      ["const { getBuiltinModule: loadBuiltin } = process\nvoid loadBuiltin('node:https')\n", ['process-builtin-module-loader-reference', 'module:node:https']],
      ["import * as moduleApi from 'node:module'\nconst dynamicApi = moduleApi as unknown as Record<string, unknown>\nconst makeRequire = dynamicApi['create' + 'Require'] as (url: string) => NodeRequire\nconst runtimeRequire = makeRequire(import.meta.url)\nvoid runtimeRequire('node:https')\n", ['create-require-loader-reference', 'commonjs-loader-reference-outside-direct-literal-call', 'module:node:https']],
      ["const runtimeGlobal = globalThis\nconst constructorKey = 'Fun' + 'ction'\nconst makeCode = (runtimeGlobal as Record<string, unknown>)[constructorKey] as FunctionConstructor\nvoid makeCode('return fetch')\n", ['dynamic-code-loader-reference']],
      ["void module.constructor._load('node:https')\n", ['commonjs-loader-reference-outside-direct-literal-call', 'module:node:https']],
    ] as const) {
      expect(networkFindings(mutant, 'mutant.ts')).toEqual(expect.arrayContaining([...expected]))
    }
    const adapterPath = 'lib/server/providers/example-adapter.ts'
    for (const mutant of [
      "const [runtimeProcess] = [process]\nconst loadBuiltin = runtimeProcess.getBuiltinModule\nvoid loadBuiltin('node:https')\n",
      "const box = { runtimeProcess: process }\nconst runtimeProcess = box.runtimeProcess\nvoid runtimeProcess.getBuiltinModule('node:https')\n",
      "const loadBuiltin = Reflect.get(process, 'getBuiltinModule')\nvoid loadBuiltin('node:https')\n",
      "const makeCode = (() => {}).constructor\nvoid makeCode('return fetch')()\n",
      "const key = 'con' + 'structor'\nvoid (() => {})[key]('return fetch')()\n",
      "function forward(value = process) { return value }\nvoid forward().getBuiltinModule('node:https')\n",
      "const values = { ...{ loader: process } }\nvoid values.loader.getBuiltinModule('node:https')\n",
      "const loadBuiltin = Reflect.apply.bind(Reflect.get(process, 'getBuiltinModule'), process)\nvoid loadBuiltin([], [])\n",
      "void global['pro' + 'cess']\n",
    ]) {
      expect(brokerRuntimeRootFindings(mutant, adapterPath).length).toBeGreaterThan(0)
    }
    const nonAdapterProductPath = 'lib/server/product-loader-mutant.ts'
    for (const mutant of [
      "const [runtimeProcess] = [process]\nconst loadBuiltin = runtimeProcess.getBuiltinModule\nvoid loadBuiltin('node:https')\n",
      "const box = { runtimeProcess: process }\nconst runtimeProcess = box.runtimeProcess\nvoid runtimeProcess.getBuiltinModule('node:https')\n",
      "const loadBuiltin = Reflect.get(process, 'getBuiltinModule')\nvoid loadBuiltin('node:https')\n",
      "const makeCode = (() => {}).constructor\nvoid makeCode('return fetch')()\n",
      "const key = 'con' + 'structor'\nvoid (() => {})[key]('return fetch')()\n",
      "function forward(value = process) { return value }\nvoid forward().getBuiltinModule('node:https')\n",
      "const values = { ...{ loader: process } }\nvoid values.loader.getBuiltinModule('node:https')\n",
      "const loadBuiltin = Reflect.apply.bind(Reflect.get(process, 'getBuiltinModule'), process)\nvoid loadBuiltin([], [])\n",
      "void global['pro' + 'cess']\n",
      "function returnLoader() { return process }\nvoid returnLoader().getBuiltinModule('node:https')\n",
      "function passLoader(loader: unknown) { return loader }\nvoid passLoader(process)\n",
      "let runtimeProcess\nruntimeProcess = process\nvoid runtimeProcess.getBuiltinModule('node:https')\n",
    ]) {
      const findings = aggregateProductBoundaryFindings([{ path: nonAdapterProductPath, content: mutant }])
      expect([...findings].some((finding) => finding.startsWith(`${nonAdapterProductPath}:runtime-root:`))).toBe(true)
    }
    expect(aggregateProductBoundaryFindings([{
      path: 'lib/server/allowed-process-env.ts',
      content: "export const value = process.env.EQUORA_EXAMPLE\n",
    }])).toEqual(new Set())
    expect(aggregateProductBoundaryFindings([{
      path: 'lib/server/computed-process-env.ts',
      content: "export const value = process['env'].EQUORA_EXAMPLE\n",
    }])).toContain('lib/server/computed-process-env.ts:runtime-root:restricted-runtime-root:process')
    expect(brokerRuntimeRootFindings("void Reflect.ownKeys({ value: true })\n", CONTRACT_PATH)).toEqual([])
    expect(brokerRuntimeRootFindings("void Reflect.get({}, 'value')\n", CONTRACT_PATH)).toContain(
      'restricted-runtime-root:Reflect',
    )
    const duplicateAllowedDynamicImport = `${readFileSync(join(WORKSPACE, 'lib/utils/snipping-ocr.ts'), 'utf8')}\nvoid import('tesseract.js')\n`
    expect(networkFindings(duplicateAllowedDynamicImport, 'lib/utils/snipping-ocr.ts')).toContain(
      'dynamic-module-loader-not-allowlisted:tesseract.js',
    )
    expect(networkFindings("const moduleName = 'tesseract.js'\nvoid import(moduleName)\n", 'lib/utils/snipping-ocr.ts')).toContain(
      'dynamic-module-loader-not-allowlisted:nonliteral',
    )
    const adapterMutant = "const adapter = { prepareReadPlan() {}, mapRawEvents() {}, readPage() {} }\nvoid fetch('https://example.invalid')\n"
    expect(adapterBoundaryFindings(adapterMutant, adapterPath)).toEqual(expect.arrayContaining([
      'unexpected-adapter-member:readPage',
      'network:fetch-reference',
    ]))
    const inheritedMutant = "class Adapter extends Base implements ReadOnlyBrokerAdapter { prepareReadPlan() {} mapRawEvents() {} }\n"
    expect(adapterBoundaryFindings(inheritedMutant, adapterPath)).toContain('adapter-inheritance')
    const factoryMutant = "function make() { return { prepareReadPlan() {}, mapRawEvents() {}, performRead() {} } }\n"
    expect(adapterBoundaryFindings(factoryMutant, adapterPath)).toEqual(expect.arrayContaining([
      'factory-or-nested-adapter',
      'unexpected-adapter-member:performRead',
    ]))
    const spreadMutant = "const base = {}\nconst adapter = { ...base, prepareReadPlan() {}, mapRawEvents() {} }\n"
    expect(adapterBoundaryFindings(spreadMutant, adapterPath)).toContain('adapter-spread')
    const computedMemberMutant = "const method = 'prepareReadPlan'\nconst adapter = { [method]() {}, mapRawEvents() {} }\n"
    expect(adapterBoundaryFindings(computedMemberMutant, adapterPath)).toContain('adapter-computed-member')
    expect(adapterLocationFindings('class Hidden implements ReadOnlyBrokerAdapter {}', 'lib/server/neutral-helper.ts')).toEqual([
      'adapter-outside-fixed-root:lib/server/neutral-helper.ts',
    ])
    const delegatedSources = new Map([
      [adapterPath, "import { brokerRead } from '../neutral-helper'\nconst adapter = { prepareReadPlan() {}, mapRawEvents() {} }\nvoid brokerRead\n"],
      ['lib/server/neutral-helper.ts', "export const brokerRead = globalThis['fetch']\n"],
    ])
    expect(adapterDependencyFindings(delegatedSources)).toContain(
      'lib/server/neutral-helper.ts:transitive-network:fetch-reference',
    )
    for (const externalModule of ['got', 'node-fetch', 'future-broker-sdk', 'external-broker-helper']) {
      const externalSources = new Map([
        [adapterPath, `import client from '${externalModule}'\nconst adapter = { prepareReadPlan() {}, mapRawEvents() {} }\nvoid client\n`],
      ])
      expect(adapterDependencyFindings(externalSources)).toContain(
        `${adapterPath}:external-import-not-allowlisted:${externalModule}`,
      )
    }
    const aliasOutsideServerSources = new Map([
      [adapterPath, "import { brokerRead } from '@/lib/network/broker-read'\nconst adapter = { prepareReadPlan() {}, mapRawEvents() {} }\nvoid brokerRead\n"],
      ['lib/network/broker-read.ts', 'export const brokerRead = globalThis.fetch\n'],
    ])
    expect(adapterDependencyFindings(aliasOutsideServerSources)).toContain(
      'lib/network/broker-read.ts:transitive-network:fetch-reference',
    )
    const relativeOutsideServerSources = new Map([
      [adapterPath, "import { brokerRead } from '../../network/broker-read'\nconst adapter = { prepareReadPlan() {}, mapRawEvents() {} }\nvoid brokerRead\n"],
      ['lib/network/broker-read.ts', 'export const brokerRead = globalThis.fetch\n'],
    ])
    expect(adapterDependencyFindings(relativeOutsideServerSources)).toContain(
      'lib/network/broker-read.ts:transitive-network:fetch-reference',
    )
    const runtimeExtensionSources = new Map([
      [adapterPath, "import { brokerRead } from '../../network/broker-read.js'\nconst adapter = { prepareReadPlan() {}, mapRawEvents() {} }\nvoid brokerRead\n"],
      ['lib/network/broker-read.ts', 'export const brokerRead = globalThis.fetch\n'],
    ])
    expect(adapterDependencyFindings(runtimeExtensionSources)).toContain(
      'lib/network/broker-read.ts:transitive-network:fetch-reference',
    )
    const unresolvedSources = new Map([
      [adapterPath, "import { helper } from '../../network/missing-helper'\nconst adapter = { prepareReadPlan() {}, mapRawEvents() {} }\nvoid helper\n"],
    ])
    expect(adapterDependencyFindings(unresolvedSources)).toContain(
      `${adapterPath}:unresolved-internal-import:../../network/missing-helper`,
    )
    const loaderMutants = [
      "void import('../../network/broker-read.js', { with: { type: 'json' } })",
      "import brokerRead = require('../../network/broker-read')\nvoid brokerRead",
      "const brokerRead = module.require('../../network/broker-read')\nvoid brokerRead",
    ]
    for (const loader of loaderMutants) {
      const loaderSources = new Map([
        [adapterPath, `${loader}\nconst adapter = { prepareReadPlan() {}, mapRawEvents() {} }\n`],
        ['lib/network/broker-read.ts', 'export const brokerRead = globalThis.fetch\n'],
      ])
      expect(adapterDependencyFindings(loaderSources)).toContain(
        'lib/network/broker-read.ts:transitive-network:fetch-reference',
      )
    }
    for (const loader of [
      "const load = require\nconst brokerRead = load('../../network/broker-read')",
      "const load = module.require\nconst brokerRead = load('../../network/broker-read')",
      "const load = module.require.bind(module)\nconst brokerRead = load('../../network/broker-read')",
      "const { require: load } = module\nconst brokerRead = load('../../network/broker-read')",
      "const load = require as NodeRequire\nconst brokerRead = load('../../network/broker-read')",
      "function expose() { return require }\nvoid expose",
      "class Loader { field = require }\nvoid Loader",
      "function wrap(loader: unknown) { return loader }\nvoid wrap(require)",
      "const callbacks = [require]\nvoid callbacks",
    ]) {
      const derivedLoaderSources = new Map([
        [adapterPath, `${loader}\nconst adapter = { prepareReadPlan() {}, mapRawEvents() {} }\nvoid brokerRead\n`],
      ])
      expect(adapterDependencyFindings(derivedLoaderSources)).toContain(
        `${adapterPath}:module-extraction:commonjs-loader-reference-outside-direct-literal-call`,
      )
    }
    for (const [path, content] of [
      ['malformed.js', 'const = ;'],
      ['malformed.jsx', 'export const View = <div>'],
      ['malformed.cjs', 'module.exports = {'],
    ]) {
      expect(moduleReferences(parseSource(content, path)).findings).toEqual(
        expect.arrayContaining([expect.stringMatching(/^parse-diagnostic:/)]),
      )
    }
    const unsupportedLoaderSources = new Map([
      [adapterPath, "const brokerRead = custom.require('../../network/broker-read')\nconst adapter = { prepareReadPlan() {}, mapRawEvents() {} }\nvoid brokerRead\n"],
    ])
    expect(adapterDependencyFindings(unsupportedLoaderSources)).toContain(
      `${adapterPath}:module-extraction:unsupported-commonjs-loader-owner`,
    )
    expect(egressDeclarationOwners('class Hidden { executeAuthorizedRead() {} }', 'neutral-helper.ts')).toEqual([
      'neutral-helper.ts:Hidden',
    ])
    const productEgressMutant = new Map([
      ['lib/server/broker-core-contracts.ts', 'interface CentralBrokerEgress { executeAuthorizedRead(): void }'],
      ['lib/client-hidden-egress.ts', 'class Hidden { executeAuthorizedRead() {} }'],
      ['components/hidden-egress.tsx', 'export class ComponentEgress { executeAuthorizedRead() {} }'],
    ])
    expect([...productEgressMutant].filter(([path]) => isProductSourcePath(path)).flatMap(([path, content]) => egressDeclarationOwners(content, path))).toEqual([
      CENTRAL_EGRESS_CONTRACT_OWNER,
      'lib/client-hidden-egress.ts:Hidden',
      'components/hidden-egress.tsx:ComponentEgress',
    ])

    const sourceClosureRoot = mkdtempSync(join(tmpdir(), 'equora-mb0-source-closure-'))
    try {
      writeFixtureFile(sourceClosureRoot, 'real.ts', 'export const value = 1\n')
      symlinkSync(join(sourceClosureRoot, 'real.ts'), join(sourceClosureRoot, 'linked.ts'), 'file')
      expect(() => sourceFiles(sourceClosureRoot)).toThrow(/workspace_source_symlink_or_nonregular/)
    } finally {
      rmSync(sourceClosureRoot, { recursive: true, force: true })
    }
  })

  it('separates common, capture and connection-probe policy pins', () => {
    expect(typeLiteralMemberNames('CommonBrokerAuthorityPolicyPins')).toEqual([
      'runtimePolicyVersion',
      'requestAuthorityPolicyVersion',
      'failurePolicyVersion',
    ])
    expect(typeLiteralMemberNames('CaptureAuthorityPolicyPins')).toEqual([
      'claimPolicyVersion',
      'leasePolicyVersion',
      'checkpointPolicyVersion',
    ])
    expect(typeLiteralMemberNames('ConnectionProbeAuthorityPolicyPins')).toEqual([
      'setupPolicyVersion',
      'probePolicyVersion',
      'ephemeralCredentialPolicyVersion',
      'applyPolicyVersion',
    ])
  })

  it('binds capture provenance and blocks normalization, reconciliation, approval and import authority', () => {
    expect(typeLiteralMemberNames('CaptureRequestEvidence')).toEqual([
      'authorizationBinding',
      'methodEvidence',
      'originEvidence',
      'pathTemplateEvidence',
      'queryDigest',
      'startedAt',
      'receivedAt',
      'wireBodyDigest',
      'wireBodyBytes',
    ])
    expect(typeLiteralMemberNames('CapturePageEvidence')).toEqual([
      'pageBinding',
      'pagePayload',
    ])
    expect(typeLiteralMemberNames('CaptureRawObservationEnvelope')).toEqual([
      'pageBinding',
      'rawObservationId',
      'rawObservationDigest',
      'observationContractVersion',
      'observationAuthority',
      'normalizationAuthority',
      'reconciliationAuthority',
      'approvalAuthority',
      'importAuthority',
      'requestEvidence',
      'pageEvidence',
      'eventBatch',
    ])
    for (const field of [
      'eventObservationId',
      'eventOrdinal',
      'observedAt',
      'providerOccurredAtUs',
      'eventObservationDigest',
      'inheritedCompletenessStatus',
    ]) expect(CONTRACT_SOURCE).toContain(`${field}:`)
    expect(CONTRACT_SOURCE).toContain("normalizationAuthority: 'blocked_pending_versioned_normalization'")
    expect(CONTRACT_SOURCE).toContain("reconciliationAuthority: 'none'")
    expect(CONTRACT_SOURCE).toContain("approvalAuthority: 'none'")
    expect(CONTRACT_SOURCE).toContain("importAuthority: 'none'")
    expect(CONTRACT_SOURCE).toContain("identityStatus: 'stable_provider_id'")
    expect(CONTRACT_SOURCE).toContain("identityStatus: 'blocked_identity'")
    expect(CONTRACT_SOURCE).toContain('providerEventId: NonEmptyProviderEventId')
    expect(CONTRACT_SOURCE).toContain('providerEventId: null')
    expect(CONTRACT_SOURCE).toContain("payloadEncoding: 'canonical_json_v1'")
  })

  it('keeps orders, executions, position revisions, funding events and instruments as separate raw grains', () => {
    const alias = typeAliasDeclaration('CanonicalRawEventKind')
    if (!ts.isUnionTypeNode(alias.type)) throw new Error('CanonicalRawEventKind muss eine geschlossene Literal-Union sein.')
    const values = alias.type.types.flatMap((node) => ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal) ? [node.literal.text] : [])
    expect(values).toEqual([
      'order',
      'execution',
      'position_revision',
      'funding_event',
      'account_financial_event',
      'instrument_metadata',
    ])
  })

  it('keeps capture and probe purpose/mode tuples domain-separated at runtime and compile time', () => {
    const capture: Pick<CaptureAuthorityTuple, 'authorityPurpose' | 'runtimeAuthority'> = {
      authorityPurpose: 'capture',
      runtimeAuthority: {
        requiredMode: 'capture',
        runtimeConfigurationDigest: 'fixture-runtime-digest',
        deploymentIdentity: 'fixture-deployment',
        runtimeAuthorityEpoch: 1,
      },
    }
    const probe: Pick<ConnectionProbeAuthorityTuple, 'authorityPurpose' | 'runtimeAuthority'> = {
      authorityPurpose: 'connection_probe',
      runtimeAuthority: {
        requiredMode: 'probe',
        runtimeConfigurationDigest: 'fixture-runtime-digest',
        deploymentIdentity: 'fixture-deployment',
        runtimeAuthorityEpoch: 1,
      },
    }

    expect(capture.authorityPurpose).toBe('capture')
    expect(capture.runtimeAuthority.requiredMode).toBe('capture')
    expect(probe.authorityPurpose).toBe('connection_probe')
    expect(probe.runtimeAuthority.requiredMode).toBe('probe')
  })

  it('pins the normative Equora-TCJ authority digest to a hard-coded cross-purpose test vector', () => {
    const capture = structuredClone(runtimeCaptureFixture('known-vector').authority)
    ;(capture.captureBudget as { requestDeadlineAt: string }).requestDeadlineAt = '2030-01-01T00:00:00.000Z'
    ;(capture as { authorityTupleDigest: string }).authorityTupleDigest = ''
    expect(computeAuthorityTupleDigest(capture)).toBe('a724200e8b91b101b6008712a32e8aa920b9bc48eb27a01f322d173266e778e7')

    const probe = structuredClone(runtimeProbeFixture('known-vector').authority)
    ;(probe.probeBudget as { absoluteDeadlineAt: string }).absoluteDeadlineAt = '2030-01-01T00:00:00.000Z'
    ;(probe as { authorityTupleDigest: string }).authorityTupleDigest = ''
    expect(computeAuthorityTupleDigest(probe)).not.toBe(computeAuthorityTupleDigest(capture))

    const floatMutant = structuredClone(capture)
    ;(floatMutant as { purposeRequestSequence: number }).purposeRequestSequence = 1.5
    expect(() => computeAuthorityTupleDigest(floatMutant)).toThrow(/equora_tcj_non_integer/)
    const versionMutant = structuredClone(capture)
    ;(versionMutant as { authorityTupleContractVersion: string }).authorityTupleContractVersion = 'v2'
    expect(() => computeAuthorityTupleDigest(versionMutant)).toThrow(/authority_tuple_contract_version_invalid/)
    const unknownFieldMutant = { ...capture, connectionProbePolicyPins: null } as unknown as CaptureAuthorityTuple
    expect(() => computeAuthorityTupleDigest(unknownFieldMutant)).toThrow(/capture_authority_digest_shape_invalid/)
  })

  it('rejects widened same-purpose binding mismatches at every runtime transition', async () => {
    const a = runtimeCaptureFixture('a')
    const b = runtimeCaptureFixture('b')
    const validExecution: CaptureBrokerReadExecution<typeof a.requestBinding, typeof a.authorizationBinding> = {
      authorityPurpose: 'capture',
      capabilityContract: a.capabilityContract,
      requestBinding: a.requestBinding,
      authorizationBinding: a.authorizationBinding,
      plan: a.plan,
      permit: a.permit,
    }
    const validatedExecution = validateCaptureBrokerReadExecution(validExecution)
    expect(validatedExecution.authorityPurpose).toBe('capture')
    expect(validateCaptureBrokerReadExecution.length).toBe(2)
    const crossAuthorizationPermit = structuredClone(b.permit)
    ;(crossAuthorizationPermit as { sendDeadlineAt: string }).sendDeadlineAt = a.permit.sendDeadlineAt
    expect(() => validateCaptureBrokerReadExecution({
      ...validExecution,
      authorizationBinding: b.authorizationBinding,
      permit: crossAuthorizationPermit,
    })).toThrow(/capture_execution_authorization_request_mismatch/)

    const authorityMutants = [
      (execution: CaptureBrokerReadExecution<typeof a.requestBinding, typeof a.authorizationBinding>) => {
        ;(execution.requestBinding.chainBinding.authority.runtimeAuthority as { runtimeConfigurationDigest: string }).runtimeConfigurationDigest = 'tampered'
      },
      (execution: CaptureBrokerReadExecution<typeof a.requestBinding, typeof a.authorizationBinding>) => {
        ;(execution.requestBinding.chainBinding.authority.commonPolicyPins as { failurePolicyVersion: string }).failurePolicyVersion = 'tampered'
      },
      (execution: CaptureBrokerReadExecution<typeof a.requestBinding, typeof a.authorizationBinding>) => {
        ;(execution.requestBinding.chainBinding.authority.capturePolicyPins as { checkpointPolicyVersion: string }).checkpointPolicyVersion = 'tampered'
      },
      (execution: CaptureBrokerReadExecution<typeof a.requestBinding, typeof a.authorizationBinding>) => {
        ;(execution.plan.canonicalQuery as Record<string, string>).cursor = 'tampered'
      },
      (execution: CaptureBrokerReadExecution<typeof a.requestBinding, typeof a.authorizationBinding>) => {
        ;(execution.permit as { sendDeadlineAt: string }).sendDeadlineAt = 'invalid'
      },
    ]
    for (const mutate of authorityMutants) {
      const mutant = structuredClone(validExecution)
      mutate(mutant)
      expect(() => validateCaptureBrokerReadExecution(mutant)).toThrow(/Broker binding validation failed/)
    }

    const immutableInput = structuredClone(validExecution)
    const immutableSnapshot = validateCaptureBrokerReadExecution(immutableInput)
    ;(immutableInput.plan.canonicalQuery as Record<string, string>).cursor = 'changed-after-validation'
    ;(immutableInput.requestBinding.chainBinding.authority.account as { identityDigest: string }).identityDigest = 'changed-after-validation'
    expect(immutableSnapshot.plan.canonicalQuery.cursor).toBe('a')
    expect(immutableSnapshot.requestBinding.chainBinding.authority.account.identityDigest).toBe('identity-a')
    expect(Object.isFrozen(immutableSnapshot.plan.canonicalQuery)).toBe(true)
    expect(Object.isFrozen(immutableSnapshot.requestBinding.chainBinding.authority.account)).toBe(true)

    const probe = runtimeProbeFixture('a')
    const probeExecution: ConnectionProbeBrokerReadExecution<typeof probe.requestBinding, typeof probe.authorizationBinding> = {
      authorityPurpose: 'connection_probe',
      capabilityContract: probe.capabilityContract,
      requestBinding: probe.requestBinding,
      authorizationBinding: probe.authorizationBinding,
      plan: probe.plan,
      permit: probe.permit,
    }
    const validatedProbe = validateConnectionProbeBrokerReadExecution(probeExecution)
    expect(validatedProbe.authorityPurpose).toBe('connection_probe')
    const probeMutant = structuredClone(probeExecution)
    ;(probeMutant.requestBinding.chainBinding.authority.connectionProbePolicyPins as { probePolicyVersion: string }).probePolicyVersion = 'tampered'
    expect(() => validateConnectionProbeBrokerReadExecution(probeMutant)).toThrow(
      /probe_authority_tuple_digest_mismatch/,
    )

    const foreignOrigin = structuredClone(validExecution)
    ;(foreignOrigin.capabilityContract as { constantHttpsOrigin: string }).constantHttpsOrigin = 'https://other.invalid'
    expect(() => validateCaptureBrokerReadExecution(foreignOrigin)).toThrow(/capability_contract_digest_mismatch/)
    const credentialOriginFixture = runtimeCaptureFixture('credential-origin', 'https://user:pass@fixture.invalid')
    expect(() => validateCaptureBrokerReadExecution({
      authorityPurpose: 'capture',
      capabilityContract: credentialOriginFixture.capabilityContract,
      requestBinding: credentialOriginFixture.requestBinding,
      authorizationBinding: credentialOriginFixture.authorizationBinding,
      plan: credentialOriginFixture.plan,
      permit: credentialOriginFixture.permit,
    })).toThrow(/capability_contract_origin_invalid/)
    const protocolRelativePath = structuredClone(validExecution)
    ;(protocolRelativePath.plan as { canonicalPath: string }).canonicalPath = '//other.invalid/path'
    expect(() => validateCaptureBrokerReadExecution(protocolRelativePath)).toThrow(/broker_read_plan_path_invalid/)
    const overBudget = structuredClone(validExecution)
    ;(overBudget.plan as { responseByteLimit: number }).responseByteLimit = 1001
    expect(() => validateCaptureBrokerReadExecution(overBudget)).toThrow(/response_limit_exceeds_authority/)
    const expired = structuredClone(validExecution)
    ;(expired.permit as { issuedAt: string; sendDeadlineAt: string }).issuedAt = '2020-01-01T00:00:00.000Z'
    ;(expired.permit as { issuedAt: string; sendDeadlineAt: string }).sendDeadlineAt = '2020-01-01T00:00:01.000Z'
    expect(() => validateCaptureBrokerReadExecution(expired, Date.now())).toThrow(/broker_read_permit_invalid/)
    const requestAuthorityMismatch = structuredClone(validExecution)
    ;(requestAuthorityMismatch.requestBinding as { purposeRequestSequence: number }).purposeRequestSequence = 2
    expect(() => validateCaptureBrokerReadExecution(requestAuthorityMismatch)).toThrow(/capture_request_authority_binding_mismatch/)

    const egressHarness = runtimeEgressHarness([a, probe])
    const captureEgressResult = await egressHarness.egress.executeAuthorizedRead(validExecution)
    const consumedExecution = captureEgressResult.execution
    expect(consumedExecution.authorityPurpose).toBe('capture')
    await expect(egressHarness.egress.executeAuthorizedRead(validExecution)).rejects.toThrow(/fixture_control_plane_replay/)
    const probeEgressResult = await egressHarness.egress.executeAuthorizedRead(probeExecution)
    const consumedProbe = probeEgressResult.execution
    expect(consumedProbe.authorityPurpose).toBe('connection_probe')
    expect(() => validateConnectionProbeWireResponse({
      execution: consumedProbe,
      wireResponse: structuredClone(probeEgressResult.wireResponse),
    })).toThrow(/probe_wire_response_not_issued_by_central_egress/)
    const probeWire = validateConnectionProbeWireResponse({
      execution: consumedProbe,
      wireResponse: probeEgressResult.wireResponse,
    })
    const selfAttestedProbeResult: ConnectionProbeCapabilityResultCandidate<typeof probe.authorizationBinding> = {
      resultContractVersion: 'equora-connection-probe-result-v1',
      authorizationBinding: probe.authorizationBinding,
      provider: probe.authority.provider,
      capabilityProfile: probe.authority.capabilityProfile,
      responseContractVersion: probe.capabilityContract.responseContractVersion,
      wireEvidenceDigest: computeBrokerWireEvidenceDigest(probeEgressResult.wireResponse),
      probeScopeDigest: probe.authority.purposeScopeDigest,
      observedAt: probeEgressResult.wireResponse.receivedAt,
      technicalReadResult: 'read_succeeded',
      permissionEvidenceResult: 'read_permission_observed',
      accountIdentityResult: 'stable_identity_observed',
      sanitizedFindings: [],
      persistenceAuthority: 'sanitized_probe_receipt_only',
      captureAuthority: 'none',
      normalizationAuthority: 'none',
      reconciliationAuthority: 'none',
      approvalAuthority: 'none',
      importAuthority: 'none',
    }
    expect(() => validateConnectionProbeCapabilityResult(selfAttestedProbeResult, probeWire)).toThrow(
      /probe_result_not_issued_by_registered_adapter/,
    )
    const probeResultCandidate = await egressHarness.inspectionBoundary.inspectConnectionProbeWireResponse(probeWire)
    const validatedProbeResult = validateConnectionProbeCapabilityResult(probeResultCandidate, probeWire)
    expect(validatedProbeResult.captureAuthority).toBe('none')
    expect('rawBody' in validatedProbeResult).toBe(false)
    expect(() => validateConnectionProbeCapabilityResult(
      { ...probeResultCandidate, wireEvidenceDigest: 'tampered' },
      probeWire,
    )).toThrow(/probe_result_not_issued_by_registered_adapter/)
    for (const unsafeFinding of [
      'provider said invalid API key abc123',
      'credential_payload_raw_text',
      'account-identity-user-42',
    ]) {
      egressHarness.mutateNextRegisteredProbeResult((value) => ({ ...value, sanitizedFindings: [unsafeFinding] }))
      const unsafeCandidate = await egressHarness.inspectionBoundary.inspectConnectionProbeWireResponse(probeWire)
      expect(() => validateConnectionProbeCapabilityResult(
        unsafeCandidate as ConnectionProbeCapabilityResultCandidate<typeof probe.authorizationBinding>,
        probeWire,
      )).toThrow(/probe_result_binding_or_semantics_invalid/)
    }
    for (const incompatibleResult of [
      { technicalReadResult: 'read_succeeded', sanitizedFindings: ['provider_read_unavailable'] },
      { technicalReadResult: 'read_succeeded', sanitizedFindings: ['provider_authentication_rejected'] },
      { permissionEvidenceResult: 'read_permission_observed', sanitizedFindings: ['read_permission_not_observed'] },
      { accountIdentityResult: 'stable_identity_observed', sanitizedFindings: ['account_identity_not_observed'] },
      {
        technicalReadResult: 'read_failed',
        permissionEvidenceResult: 'blocked',
        accountIdentityResult: 'blocked',
        sanitizedFindings: [],
      },
    ] as const) {
      egressHarness.mutateNextRegisteredProbeResult((value) => ({ ...value, ...incompatibleResult }))
      const incompatibleCandidate = await egressHarness.inspectionBoundary.inspectConnectionProbeWireResponse(probeWire)
      expect(() => validateConnectionProbeCapabilityResult(
        incompatibleCandidate,
        probeWire,
      )).toThrow(/probe_result_finding_matrix_invalid/)
    }
    egressHarness.mutateNextRegisteredProbeResult((value) => ({
      ...value,
      technicalReadResult: 'read_failed',
      permissionEvidenceResult: 'blocked',
      accountIdentityResult: 'blocked',
      sanitizedFindings: ['provider_authentication_rejected'],
    }))
    const correlatedFailureCandidate = await egressHarness.inspectionBoundary.inspectConnectionProbeWireResponse(probeWire)
    expect(validateConnectionProbeCapabilityResult(correlatedFailureCandidate, probeWire).sanitizedFindings).toEqual([
      'provider_authentication_rejected',
    ])
    egressHarness.mutateNextRegisteredProbeResult((value) => ({
      ...value,
      permissionEvidenceResult: 'not_observed',
      accountIdentityResult: 'not_observed',
      sanitizedFindings: ['read_permission_not_observed', 'account_identity_not_observed'],
    }))
    const correlatedObservationCandidate = await egressHarness.inspectionBoundary.inspectConnectionProbeWireResponse(probeWire)
    expect(validateConnectionProbeCapabilityResult(correlatedObservationCandidate, probeWire).sanitizedFindings).toEqual([
      'read_permission_not_observed',
      'account_identity_not_observed',
    ])
    expect(() => validateCaptureWirePage({
      execution: structuredClone(consumedExecution),
      wireResponse: captureEgressResult.wireResponse,
      pageBinding: a.pageBinding,
    })).toThrow(/capture_wire_page_execution_not_consumed/)

    const wireResponse = captureEgressResult.wireResponse
    expect(() => validateCaptureWirePage({
      execution: consumedExecution,
      wireResponse: structuredClone(wireResponse),
      pageBinding: a.pageBinding,
    })).toThrow(/capture_wire_response_not_issued_by_central_egress/)
    expect(() => validateCaptureWirePage({ execution: consumedExecution, wireResponse, pageBinding: b.pageBinding })).toThrow(
      /capture_wire_page_authorization_mismatch/,
    )
    const invalidWireDigest = structuredClone(wireResponse)
    ;(invalidWireDigest as { rawBodyDigest: string }).rawBodyDigest = 'wrong-digest'
    expect(() => validateCaptureWirePage({ execution: consumedExecution, wireResponse: invalidWireDigest, pageBinding: a.pageBinding })).toThrow(
      /capture_wire_response_not_issued_by_central_egress/,
    )
    const invalidWireTime = structuredClone(wireResponse)
    ;(invalidWireTime as { receivedAt: string }).receivedAt = '2099-08-14T21:00:01Z'
    expect(() => validateCaptureWirePage({ execution: consumedExecution, wireResponse: invalidWireTime, pageBinding: a.pageBinding })).toThrow(
      /capture_wire_response_not_issued_by_central_egress/,
    )
    const invalidPageSequence = structuredClone(a.pageBinding)
    ;(invalidPageSequence as { pageSequence: number }).pageSequence = -1
    expect(() => validateCaptureWirePage({ execution: consumedExecution, wireResponse, pageBinding: invalidPageSequence })).toThrow(
      /capture_page_sequence_invalid/,
    )
    const overBudgetPageSequence = structuredClone(a.pageBinding)
    ;(overBudgetPageSequence as { pageSequence: number }).pageSequence = 10
    expect(() => validateCaptureWirePage({ execution: consumedExecution, wireResponse, pageBinding: overBudgetPageSequence })).toThrow(
      /capture_page_sequence_exceeds_authority_budget/,
    )
    const callerSelectedPageIdentity = structuredClone(a.pageBinding)
    ;(callerSelectedPageIdentity as { pageObservationId: string }).pageObservationId = 'caller-selected-observation'
    expect(() => validateCaptureWirePage({
      execution: consumedExecution,
      wireResponse,
      pageBinding: callerSelectedPageIdentity,
    })).toThrow(/capture_page_observation_id_not_wire_derived/)
    const mutablePageInput = structuredClone(a.pageBinding)
    const wireSnapshot = validateCaptureWirePage({
      execution: consumedExecution,
      wireResponse,
      pageBinding: mutablePageInput,
    })
    ;(mutablePageInput as { pageObservationId: string }).pageObservationId = 'changed-after-validation'
    expect(wireSnapshot.pageBinding).toEqual(a.pageBinding)
    expect(wireSnapshot.pageBinding).not.toBe(a.pageBinding)
    expect(wireSnapshot.wireResponse.rawBody).toEqual([])
    expect(wireSnapshot.wireResponse.authorizationBinding.requestAuthorityId).toBe('request-authority-a')
    expect(wireSnapshot.pageBinding.pageObservationId).toBe(computeCapturePageObservationId(wireResponse))
    expect(Object.isFrozen(wireSnapshot.wireResponse.rawBody)).toBe(true)
    expect(() => validateCaptureWirePage({
      execution: consumedExecution,
      wireResponse,
      pageBinding: a.pageBinding,
    })).toThrow(/capture_wire_response_already_bound_to_page/)
    const reboundPage = structuredClone(a.pageBinding)
    ;(reboundPage as { pageObservationId: string }).pageObservationId = 'caller-selected-observation'
    expect(() => validateCaptureWirePage({
      execution: consumedExecution,
      wireResponse,
      pageBinding: reboundPage,
    })).toThrow(/capture_wire_response_already_bound_to_page/)

    const transitionWorkUnit = structuredClone(a.workUnit)
    const transitionInspectedPage = await egressHarness.inspectionBoundary.inspectCaptureWireResponse(wireSnapshot)
    await expect(egressHarness.inspectionBoundary.inspectCaptureWireResponse(wireSnapshot)).rejects.toThrow(
      /adapter_capture_wire_already_inspected/,
    )
    const transitionInput = {
      workUnit: transitionWorkUnit,
      wirePage: wireSnapshot,
      inspectedPage: transitionInspectedPage,
    }
    const previousCheckpointVerification = computeCheckpointMacVerification(
      transitionWorkUnit.checkpoint,
      transitionInput,
    )
    ;(transitionWorkUnit.checkpoint as { mac: string }).mac = createHmac('sha256', 'fixture-integrity-key')
      .update(previousCheckpointVerification.canonicalMacInput, 'utf8')
      .digest('hex')
    const transitionSnapshot = validateProviderPageTransition(transitionInput)
    expect(transitionSnapshot.workUnit).toEqual(transitionWorkUnit)
    expect(transitionSnapshot.workUnit).not.toBe(transitionWorkUnit)
    ;(transitionWorkUnit.scope as { instrumentScopeKey: string }).instrumentScopeKey = 'changed-after-validation'
    expect(transitionSnapshot.workUnit.scope.instrumentScopeKey).toBe('all')
    expect(transitionSnapshot.inspectedPage.pageEvidence.pagePayload).toEqual({})
    expect(Object.isFrozen(transitionSnapshot.workUnit.checkpoint)).toBe(true)
    expect(() => validateProviderPageTransition({ workUnit: b.workUnit, wirePage: wireSnapshot, inspectedPage: transitionInspectedPage })).toThrow(
      /page_transition_work_unit_chain_mismatch/,
    )
    const wrongPagePayloadCase = await inspectFreshCapturePage('wrong-page-payload', (value) => ({
      ...value,
      pageEvidence: { ...(value.pageEvidence as Record<string, unknown>), pagePayload: { unexpected: true } },
    }))
    expect(() => validateProviderPageTransition({
      workUnit: wrongPagePayloadCase.fixture.workUnit,
      wirePage: wrongPagePayloadCase.wirePage,
      inspectedPage: wrongPagePayloadCase.inspectedPage,
    })).toThrow(
      /capture_page_payload_digest_mismatch/,
    )
    const wrongRequestEvidenceCase = await inspectFreshCapturePage('wrong-request-evidence', (value) => ({
      ...value,
      requestEvidence: { ...(value.requestEvidence as Record<string, unknown>), wireBodyDigest: 'wrong-wire-body-digest' },
    }))
    expect(() => validateProviderPageTransition({
      workUnit: wrongRequestEvidenceCase.fixture.workUnit,
      wirePage: wrongRequestEvidenceCase.wirePage,
      inspectedPage: wrongRequestEvidenceCase.inspectedPage,
    })).toThrow(
      /capture_request_evidence_wire_mismatch/,
    )
    const wrongResponseContractCase = await inspectFreshCapturePage(
      'wrong-response-contract',
      (value) => ({ ...value, responseContractVersion: 'foreign-version' }),
    )
    expect(() => validateProviderPageTransition({
      workUnit: wrongResponseContractCase.fixture.workUnit,
      wirePage: wrongResponseContractCase.wirePage,
      inspectedPage: wrongResponseContractCase.inspectedPage,
    })).toThrow(
      /capture_response_contract_version_mismatch/,
    )
    const wrongCheckpointContract = structuredClone(a.workUnit)
    ;(wrongCheckpointContract.checkpoint as { checkpointContractVersion: string }).checkpointContractVersion = 'foreign-version'
    expect(() => validateProviderPageTransition({ workUnit: wrongCheckpointContract, wirePage: wireSnapshot, inspectedPage: transitionInspectedPage })).toThrow(
      /page_transition_work_unit_semantics_invalid/,
    )
    const noncanonicalPageTimeCase = await inspectFreshCapturePage('noncanonical-page-time', (value) => ({
      ...value,
      pageBinding: { ...(value.pageBinding as Record<string, unknown>), observedAt: '2099-08-14T21:00:01Z' },
    }))
    expect(() => validateProviderPageTransition({
      workUnit: noncanonicalPageTimeCase.fixture.workUnit,
      wirePage: noncanonicalPageTimeCase.wirePage,
      inspectedPage: noncanonicalPageTimeCase.inspectedPage,
    })).toThrow(
      /capture_page_observed_at_invalid/,
    )
    expect(() => validateProviderPageTransition({
      workUnit: a.workUnit,
      wirePage: wireSnapshot,
      inspectedPage: structuredClone(transitionInspectedPage),
    })).toThrow(/page_transition_inspected_page_not_issued_by_registered_adapter/)
    expect(egressHarness.calls).toEqual({
      codeRegistry: 17,
      runtimeAuthority: 5,
      controlPlane: 2,
      credentialLoader: 2,
      networkTransport: 2,
    })

    const events = [a.event('event-a', 0)]
    const eventBatch = validateCaptureEventBatch({
      pageBinding: a.pageBinding,
      eventCount: events.length,
      eventOrdinalContract: 'zero_based_contiguous_v1',
      eventObservationIdsDigest: sha256(canonicalContractJson(['event-a'])),
      events,
    })
    const envelopeWithoutDigest = {
      pageBinding: a.pageBinding,
      rawObservationId: 'raw-a',
      observationContractVersion: 'v1',
      observationAuthority: 'provider_observed_unreconciled',
      normalizationAuthority: 'blocked_pending_versioned_normalization',
      reconciliationAuthority: 'none',
      approvalAuthority: 'none',
      importAuthority: 'none',
      requestEvidence: a.requestEvidence,
      pageEvidence: a.pageEvidence,
      eventBatch,
    } as const
    const envelope: CaptureRawObservationEnvelope<typeof a.pageBinding> = {
      ...envelopeWithoutDigest,
      rawObservationDigest: sha256(canonicalContractJson(envelopeWithoutDigest)),
    }
    const nextCheckpoint = { checkpointContractVersion: 'v1', payload: null, mac: '' }
    const nextCheckpointVerification = computeCheckpointMacVerification(nextCheckpoint, transitionSnapshot)
    nextCheckpoint.mac = createHmac('sha256', 'fixture-integrity-key')
      .update(nextCheckpointVerification.canonicalMacInput, 'utf8')
      .digest('hex')
    const transitionWithoutDigest = {
      pageBinding: a.pageBinding,
      previousCheckpoint: transitionSnapshot.workUnit.checkpoint,
      previousCheckpointMac: transitionSnapshot.workUnit.checkpoint.mac,
      nextCheckpoint,
      status: 'next_page' as const,
    }
    const transitionWithDigest = {
      ...transitionWithoutDigest,
      transitionDigest: sha256(canonicalContractJson(transitionWithoutDigest)),
      transitionMac: '',
    }
    const transitionMacVerification = computeCheckpointTransitionMacVerification(transitionWithDigest, transitionSnapshot)
    const transitionA: ProviderCheckpointTransition<typeof a.pageBinding> = {
      ...transitionWithDigest,
      transitionMac: createHmac('sha256', 'fixture-integrity-key')
        .update(transitionMacVerification.canonicalMacInput, 'utf8')
        .digest('hex'),
    }
    const transitionB: ProviderCheckpointTransition<typeof b.pageBinding> = {
      ...transitionA,
      pageBinding: b.pageBinding,
    }
    const commitWithoutReceipt = {
      authorityPurpose: 'capture',
      pageBinding: a.pageBinding,
      envelope,
      checkpointTransition: transitionA,
      committedAt: a.times.committedAt,
      persistenceAuthority: 'append_only_raw_observation',
    } as const
    const validCommit: CaptureRawObservationCommit<typeof a.pageBinding> = {
      ...commitWithoutReceipt,
      commitReceiptDigest: sha256(canonicalContractJson(commitWithoutReceipt)),
    }
    const commitBoundary = createCaptureCommitBoundary({
      trustedClock: { nowEpochMs: () => Date.now() },
      checkpointIntegrity: {
        verifyCheckpointMac(input: BrokerCheckpointMacVerification) {
          return input.mac === createHmac('sha256', 'fixture-integrity-key')
            .update(input.canonicalMacInput, 'utf8')
            .digest('hex')
        },
        verifyCheckpointTransitionMac(input: BrokerCheckpointTransitionMacVerification) {
          return input.mac === createHmac('sha256', 'fixture-integrity-key')
            .update(input.canonicalMacInput, 'utf8')
            .digest('hex')
        },
      },
    })
    const validateCommit = commitBoundary.validateForCommit.bind(commitBoundary)
    const commitSnapshot = validateCommit(validCommit, transitionSnapshot)
    expect(commitSnapshot.pageBinding).toEqual(a.pageBinding)
    expect(Object.isFrozen(commitSnapshot.envelope.eventBatch.events[0].payload)).toBe(true)
    expect(Object.isFrozen(commitSnapshot.envelope.pageEvidence.pagePayload)).toBe(true)
    const mutatedCommit = structuredClone(validCommit) as CaptureRawObservationCommit<typeof a.pageBinding>
    ;(mutatedCommit.envelope.eventBatch.events[0].payload as { eventId: string }).eventId = 'tampered-before-commit'
    expect(() => validateCommit(mutatedCommit, transitionSnapshot)).toThrow(
      /event_payload_digest_mismatch/,
    )
    expect(() => validateCommit({ ...validCommit, checkpointTransition: transitionB }, transitionSnapshot)).toThrow(
      /capture_commit_page_binding_mismatch/,
    )
    expect(() => validateCommit(
      validCommit,
      transitionInput as unknown as typeof transitionSnapshot,
    )).toThrow(/capture_commit_transition_context_not_validated/)
    expect(() => validateCommit({ ...validCommit, commitReceiptDigest: 'wrong-receipt' }, transitionSnapshot)).toThrow(
      /capture_commit_receipt_digest_mismatch/,
    )
    expect(() => validateCommit({
      ...validCommit,
      envelope: { ...validCommit.envelope, rawObservationDigest: 'wrong-raw-observation-digest' },
    }, transitionSnapshot)).toThrow(/capture_raw_observation_digest_mismatch/)
    expect(() => validateCommit({
      ...validCommit,
      checkpointTransition: { ...validCommit.checkpointTransition, transitionDigest: 'wrong-transition-digest' },
    }, transitionSnapshot)).toThrow(/checkpoint_transition_digest_mismatch/)
    expect(() => validateCommit({
      ...validCommit,
      checkpointTransition: { ...validCommit.checkpointTransition, status: 'complete' },
    }, transitionSnapshot)).toThrow(/checkpoint_transition_status_mismatch/)
    expect(() => validateCommit({
      ...validCommit,
      checkpointTransition: {
        ...validCommit.checkpointTransition,
        previousCheckpoint: { ...validCommit.checkpointTransition.previousCheckpoint, mac: 'foreign-checkpoint' },
        previousCheckpointMac: 'foreign-checkpoint',
      },
    }, transitionSnapshot)).toThrow(/checkpoint_transition_contract_or_mac_mismatch/)
    expect(() => validateCommit({
      ...validCommit,
      checkpointTransition: { ...validCommit.checkpointTransition, transitionMac: 'forged-transition-mac' },
    }, transitionSnapshot)).toThrow(/checkpoint_transition_provenance_mac_authentication_failed/)
    const invalidMacTransitionWithoutDigest = {
      ...transitionA,
      nextCheckpoint: { ...transitionA.nextCheckpoint, mac: 'forged-checkpoint-mac' },
    }
    const {
      transitionDigest: _oldInvalidMacDigest,
      transitionMac: _oldInvalidMacTransitionMac,
      ...invalidMacTransitionInput
    } = invalidMacTransitionWithoutDigest
    const invalidMacTransition = {
      ...invalidMacTransitionInput,
      transitionDigest: sha256(canonicalContractJson(invalidMacTransitionInput)),
      transitionMac: transitionA.transitionMac,
    }
    const invalidMacCommitWithoutReceipt = { ...commitWithoutReceipt, checkpointTransition: invalidMacTransition }
    const invalidMacCommit = {
      ...invalidMacCommitWithoutReceipt,
      commitReceiptDigest: sha256(canonicalContractJson(invalidMacCommitWithoutReceipt)),
    }
    expect(() => validateCommit(invalidMacCommit, transitionSnapshot)).toThrow(/checkpoint_transition_mac_authentication_failed/)
    const mutableCommit = structuredClone(validCommit) as CaptureRawObservationCommit<typeof a.pageBinding>
    const immutableCommitSnapshot = validateCommit(mutableCommit, transitionSnapshot)
    ;(mutableCommit.envelope.pageEvidence.pagePayload as Record<string, unknown>).changed = true
    ;(mutableCommit.checkpointTransition.nextCheckpoint.payload as unknown[] | null) = []
    expect(immutableCommitSnapshot.envelope.pageEvidence.pagePayload).toEqual({})
    expect(immutableCommitSnapshot.checkpointTransition.nextCheckpoint.payload).toBeNull()
  })

  it('keeps control-plane consume, post-commit checks, credentials and the trusted clock fail-closed', async () => {
    const revoked = runtimeCaptureFixture('revoked-before-consume')
    const revokedHarness = runtimeEgressHarness([revoked])
    revokedHarness.revokeRuntime('capture', revoked.authority.provider.providerCode)
    await expect(revokedHarness.egress.executeAuthorizedRead({
      authorityPurpose: 'capture',
      capabilityContract: revoked.capabilityContract,
      requestBinding: revoked.requestBinding,
      authorizationBinding: revoked.authorizationBinding,
      plan: revoked.plan,
      permit: revoked.permit,
    })).rejects.toThrow(/current_runtime_authority_mismatch/)
    expect(revokedHarness.calls.controlPlane).toBe(0)
    expect(revokedHarness.calls.credentialLoader).toBe(0)
    expect(revokedHarness.calls.networkTransport).toBe(0)

    const postcommitRevoked = runtimeCaptureFixture('revoked-after-consume')
    const postcommitHarness = runtimeEgressHarness([postcommitRevoked])
    postcommitHarness.afterNextControlPlaneConsume(() => {
      postcommitHarness.revokeRuntime('capture', postcommitRevoked.authority.provider.providerCode)
    })
    await expect(postcommitHarness.egress.executeAuthorizedRead({
      authorityPurpose: 'capture',
      capabilityContract: postcommitRevoked.capabilityContract,
      requestBinding: postcommitRevoked.requestBinding,
      authorizationBinding: postcommitRevoked.authorizationBinding,
      plan: postcommitRevoked.plan,
      permit: postcommitRevoked.permit,
    })).rejects.toThrow(/current_runtime_authority_mismatch/)
    expect(postcommitHarness.calls.controlPlane).toBe(1)
    expect(postcommitHarness.calls.credentialLoader).toBe(0)
    expect(postcommitHarness.calls.networkTransport).toBe(0)

    const descriptorDrift = runtimeCaptureFixture('descriptor-drift')
    const descriptorHarness = runtimeEgressHarness([descriptorDrift])
    descriptorHarness.afterNextControlPlaneConsume(() => {
      descriptorHarness.removeDescriptor(descriptorDrift.authority.provider.capabilityDescriptorDigest)
    })
    await expect(descriptorHarness.egress.executeAuthorizedRead({
      authorityPurpose: 'capture',
      capabilityContract: descriptorDrift.capabilityContract,
      requestBinding: descriptorDrift.requestBinding,
      authorizationBinding: descriptorDrift.authorizationBinding,
      plan: descriptorDrift.plan,
      permit: descriptorDrift.permit,
    })).rejects.toThrow(/code_registry_descriptor_missing_or_mutable/)
    expect(descriptorHarness.calls.credentialLoader).toBe(0)
    expect(descriptorHarness.calls.networkTransport).toBe(0)

    const forgedReceipt = runtimeCaptureFixture('forged-receipt')
    const receiptHarness = runtimeEgressHarness([forgedReceipt])
    receiptHarness.tamperNextControlPlaneReceipt((receipt) => ({
      ...receipt,
      authorityTupleDigest: 'caller-forged-authority-digest',
    }))
    await expect(receiptHarness.egress.executeAuthorizedRead({
      authorityPurpose: 'capture',
      capabilityContract: forgedReceipt.capabilityContract,
      requestBinding: forgedReceipt.requestBinding,
      authorizationBinding: forgedReceipt.authorizationBinding,
      plan: forgedReceipt.plan,
      permit: forgedReceipt.permit,
    })).rejects.toThrow(/permit_consumption_receipt_binding_invalid/)
    expect(receiptHarness.calls.credentialLoader).toBe(0)
    expect(receiptHarness.calls.networkTransport).toBe(0)

    const successful = runtimeCaptureFixture('credential-zeroing')
    const successfulHarness = runtimeEgressHarness([successful])
    const ambientClock = vi.spyOn(Date, 'now').mockReturnValue(0)
    try {
      await successfulHarness.egress.executeAuthorizedRead({
        authorityPurpose: 'capture',
        capabilityContract: successful.capabilityContract,
        requestBinding: successful.requestBinding,
        authorizationBinding: successful.authorizationBinding,
        plan: successful.plan,
        permit: successful.permit,
      })
    } finally {
      ambientClock.mockRestore()
    }
    expect(successfulHarness.loadedCredentialMaterials).toHaveLength(1)
    expect([...successfulHarness.loadedCredentialMaterials[0]]).toEqual([0, 0, 0])
    expect(successfulHarness.transportAuthorizations).toHaveLength(1)
    expect(successfulHarness.transportAuthorizations[0]).toEqual(expect.objectContaining({
      sendAuthorizationContractVersion: 'equora-broker-send-authorization-v1',
      authorityPurpose: 'capture',
      requestAuthorityId: successful.authorizationBinding.requestAuthorityId,
      permitConsumptionId: computeBrokerPermitConsumptionId('capture', successful.authorizationBinding.requestAuthorityId),
      sendDeadlineAt: successful.permit.sendDeadlineAt,
    }))
    expect(Object.isFrozen(successfulHarness.transportAuthorizations[0])).toBe(true)

    const slowCredential = runtimeCaptureFixture('slow-credential')
    const slowCredentialHarness = runtimeEgressHarness([slowCredential])
    slowCredentialHarness.afterNextCredentialMaterialLoad(() => {
      slowCredentialHarness.setTrustedNow(Date.parse(slowCredential.permit.sendDeadlineAt) + 1)
    })
    await expect(slowCredentialHarness.egress.executeAuthorizedRead({
      authorityPurpose: 'capture',
      capabilityContract: slowCredential.capabilityContract,
      requestBinding: slowCredential.requestBinding,
      authorizationBinding: slowCredential.authorizationBinding,
      plan: slowCredential.plan,
      permit: slowCredential.permit,
    })).rejects.toThrow(/broker_read_permit_invalid/)
    expect(slowCredentialHarness.calls.networkTransport).toBe(0)
    expect([...slowCredentialHarness.loadedCredentialMaterials[0]]).toEqual([0, 0, 0])

    const regressingClock = runtimeCaptureFixture('regressing-clock')
    const regressingClockHarness = runtimeEgressHarness([regressingClock])
    const stableNow = Date.parse(regressingClock.times.observedAt) + 5_000
    regressingClockHarness.scriptTrustedClock([stableNow, stableNow, stableNow - 1])
    await expect(regressingClockHarness.egress.executeAuthorizedRead({
      authorityPurpose: 'capture',
      capabilityContract: regressingClock.capabilityContract,
      requestBinding: regressingClock.requestBinding,
      authorizationBinding: regressingClock.authorizationBinding,
      plan: regressingClock.plan,
      permit: regressingClock.permit,
    })).rejects.toThrow(/trusted_clock_regressed/)
    expect(regressingClockHarness.calls.networkTransport).toBe(0)

    const globalFixture = runtimeCaptureFixture('global-consumption')
    const globalConsumed = new Set<string>()
    const globalHarnessA = runtimeEgressHarness([globalFixture], { sharedConsumed: globalConsumed })
    const globalHarnessB = runtimeEgressHarness([globalFixture], { sharedConsumed: globalConsumed })
    const globalExecution = {
      authorityPurpose: 'capture' as const,
      capabilityContract: globalFixture.capabilityContract,
      requestBinding: globalFixture.requestBinding,
      authorizationBinding: globalFixture.authorizationBinding,
      plan: globalFixture.plan,
      permit: globalFixture.permit,
    }
    const concurrentResults = await Promise.allSettled([
      globalHarnessA.egress.executeAuthorizedRead(globalExecution),
      globalHarnessB.egress.executeAuthorizedRead(globalExecution),
    ])
    expect(concurrentResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(concurrentResults.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(globalHarnessA.calls.networkTransport + globalHarnessB.calls.networkTransport).toBe(1)

    const variantFixture = runtimeCaptureFixture('consumption-variant')
    const variantConsumed = new Set<string>()
    const variantHarnessA = runtimeEgressHarness([variantFixture], { sharedConsumed: variantConsumed })
    const variantHarnessB = runtimeEgressHarness([variantFixture], { sharedConsumed: variantConsumed })
    const variantExecution = {
      authorityPurpose: 'capture' as const,
      capabilityContract: variantFixture.capabilityContract,
      requestBinding: variantFixture.requestBinding,
      authorizationBinding: variantFixture.authorizationBinding,
      plan: variantFixture.plan,
      permit: variantFixture.permit,
    }
    await variantHarnessA.egress.executeAuthorizedRead(variantExecution)
    const changedTimesExecution = structuredClone(variantExecution)
    ;(changedTimesExecution.permit as { issuedAt: string }).issuedAt = new Date(
      Date.parse(variantFixture.permit.issuedAt) + 1_000,
    ).toISOString()
    await expect(variantHarnessB.egress.executeAuthorizedRead(changedTimesExecution)).rejects.toThrow(/fixture_control_plane_replay/)
    expect(variantHarnessB.calls.networkTransport).toBe(0)
    const changedPermitVersion = structuredClone(variantExecution)
    ;(changedPermitVersion.permit as { permitContractVersion: string }).permitContractVersion = 'equora-broker-read-permit-v2'
    expect(() => validateCaptureBrokerReadExecution(changedPermitVersion as never, Date.now())).toThrow(/broker_read_permit_contract_invalid/)

    const proxied = new Proxy({
      authorityPurpose: 'capture' as const,
      capabilityContract: successful.capabilityContract,
      requestBinding: successful.requestBinding,
      authorizationBinding: successful.authorizationBinding,
      plan: successful.plan,
      permit: successful.permit,
    }, {})
    expect(() => validateCaptureBrokerReadExecution(proxied)).toThrow(/canonical_value_proxy/)
    const accessorCandidate = { ...proxied } as Record<string, unknown>
    Object.defineProperty(accessorCandidate, 'authorityPurpose', { enumerable: true, get: () => 'capture' })
    expect(() => validateCaptureBrokerReadExecution(accessorCandidate as never)).toThrow(
      /canonical_value_accessor_or_hidden_property/,
    )
  })

  it('validates dynamic event batches before granting the unique-batch brand', () => {
    const a = runtimeCaptureFixture('batch-a')
    const b = runtimeCaptureFixture('batch-b')
    const dynamicEvents: readonly CanonicalRawEventInput<typeof a.pageBinding, string>[] = ['one', 'two'].map(
      (id, ordinal) => a.event(id, ordinal),
    )
    const candidate = (events: readonly CanonicalRawEventInput<typeof a.pageBinding, string>[], overrides: Partial<
      CaptureEventBatchCandidate<typeof a.pageBinding>
    > = {}): CaptureEventBatchCandidate<typeof a.pageBinding> => ({
      pageBinding: a.pageBinding,
      eventCount: events.length,
      eventOrdinalContract: 'zero_based_contiguous_v1',
      eventObservationIdsDigest: sha256(canonicalContractJson(
        events.map((event) => event.observationBinding.eventObservationId),
      )),
      events,
      ...overrides,
    })

    const validated: UniqueCaptureEventBatch<typeof a.pageBinding> = validateCaptureEventBatch(
      candidate(dynamicEvents),
    )
    expect(validated.events).toHaveLength(2)
    expect(Object.isFrozen(validated.events)).toBe(true)
    ;(dynamicEvents[0].payload as { eventId: string }).eventId = 'changed-after-validation'
    ;(dynamicEvents[0].observationBinding.pageBinding.authorizationBinding.requestBinding.chainBinding.authority.account as { identityDigest: string }).identityDigest = 'changed-after-validation'
    expect(validated.events[0].payload).toEqual({ eventId: 'one' })
    expect(validated.pageBinding.authorizationBinding.requestBinding.chainBinding.authority.account.identityDigest).toBe('identity-batch-a')
    expect(Object.isFrozen(validated.events[0].payload)).toBe(true)
    expect(Object.isFrozen(validated.events[0].observationBinding.pageBinding)).toBe(true)

    const invalidCandidates = [
      candidate([a.event('duplicate', 0), a.event('duplicate', 1)]),
      candidate([a.event('one', 0), a.event('two', 0)]),
      candidate([a.event('', 0)]),
      candidate(dynamicEvents, { eventCount: 3 }),
      candidate(dynamicEvents, { eventObservationIdsDigest: 'wrong-digest' }),
      candidate([a.event('foreign-page', 0, b.pageBinding)]),
      candidate([a.event('wrong-completeness', 0, a.pageBinding, 'partial_observation')]),
      candidate([{
        ...a.event('bad-identity', 0),
        providerIdentity: {
          identityStatus: 'stable_provider_id',
          providerEventId: '',
          blockedIdentity: null,
        },
      } as unknown as CanonicalRawEventInput<typeof a.pageBinding, string>]),
      candidate([{
        ...a.event('blocked-identity-extra-field', 0),
        providerIdentity: {
          identityStatus: 'blocked_identity',
          providerEventId: null,
          blockedIdentity: {
            identityBlockContractVersion: 'v1',
            reasonCode: 'missing_id',
            identityFingerprint: 'fingerprint',
            extra: 'forbidden',
          },
        },
      } as unknown as CanonicalRawEventInput<typeof a.pageBinding, string>]),
      candidate([{
        ...a.event('unknown-identity-discriminator', 0),
        providerIdentity: {
          identityStatus: 'provider_generated',
          providerEventId: null,
          blockedIdentity: {
            identityBlockContractVersion: 'v1',
            reasonCode: 'missing_id',
            identityFingerprint: 'fingerprint',
          },
        },
      } as unknown as CanonicalRawEventInput<typeof a.pageBinding, string>]),
      candidate([{
        ...a.event('empty-identity-discriminator', 0),
        providerIdentity: {
          identityStatus: '',
          providerEventId: null,
          blockedIdentity: {
            identityBlockContractVersion: 'v1',
            reasonCode: 'missing_id',
            identityFingerprint: 'fingerprint',
          },
        },
      } as unknown as CanonicalRawEventInput<typeof a.pageBinding, string>]),
      candidate([{
        ...a.event('null-identity-discriminator', 0),
        providerIdentity: {
          identityStatus: null,
          providerEventId: null,
          blockedIdentity: {
            identityBlockContractVersion: 'v1',
            reasonCode: 'missing_id',
            identityFingerprint: 'fingerprint',
          },
        },
      } as unknown as CanonicalRawEventInput<typeof a.pageBinding, string>]),
      candidate([{
        ...a.event('bad-payload', 0),
        payloadDigest: 'wrong-payload',
      }]),
      candidate([{
        ...a.event('bad-observation', 0),
        observationBinding: {
          ...a.event('bad-observation', 0).observationBinding,
          eventObservationDigest: 'wrong-observation',
        },
      } as CanonicalRawEventInput<typeof a.pageBinding, string>]),
      candidate([{
        ...a.event('bad-kind', 0),
        eventKind: 'trade',
      } as unknown as CanonicalRawEventInput<typeof a.pageBinding, string>]),
      candidate([{
        ...a.event('bad-encoding', 0),
        payloadEncoding: 'json',
      } as unknown as CanonicalRawEventInput<typeof a.pageBinding, string>]),
      candidate([{
        ...a.event('bad-time', 0),
        observationBinding: { ...a.event('bad-time', 0).observationBinding, observedAt: 'not-a-time' },
      } as CanonicalRawEventInput<typeof a.pageBinding, string>]),
      candidate([{
        ...a.event('bad-provider-time', 0),
        observationBinding: { ...a.event('bad-provider-time', 0).observationBinding, providerOccurredAtUs: '1.5' },
      } as CanonicalRawEventInput<typeof a.pageBinding, string>]),
      candidate([{
        ...a.event('bad-observation-authority', 0),
        observationBinding: { ...a.event('bad-observation-authority', 0).observationBinding, observationAuthority: 'normalized' },
      } as unknown as CanonicalRawEventInput<typeof a.pageBinding, string>]),
      candidate([{
        ...a.event('bad-import-authority', 0),
        importAuthority: 'granted',
      } as unknown as CanonicalRawEventInput<typeof a.pageBinding, string>]),
      candidate([{
        ...a.event('undefined-payload', 0),
        payload: { forbidden: undefined },
      } as unknown as CanonicalRawEventInput<typeof a.pageBinding, string>]),
    ]
    for (const invalid of invalidCandidates) {
      expect(() => validateCaptureEventBatch(invalid)).toThrow(/Broker binding validation failed/)
    }
  })
})

describe('multi-broker parity manifest validator', () => {
  it('accepts a closed 28-entry canonical fixture', async () => {
    const fixture = createValidatorFixture()
    try {
      const validate = await loadValidator()
      const attempts = fixture.evidence.candidate_attempts as Array<Record<string, unknown>>
      attempts.push({
        attempt_id: 'fixture-unwrapped-development-attempt',
        command: 'npm.cmd run typecheck',
        started_at_utc: null,
        ended_at_utc: null,
        exit_code: 1,
        result: 'development_failure_not_gate_evidence',
        output_transcript_policy: null,
        stdout_stderr_utf8_bytes: null,
        stdout_stderr_sha256: null,
        evidence_loss_reason: 'The fixture models an unwrapped development attempt with explicit null evidence fields.',
      })
      fixture.rewrite()
      expect(validate({ root: fixture.root })).toEqual({ validated: 28, total: 28 })
    } finally {
      fixture.dispose()
    }
  })

  it('rejects traversal, absolute, ADS, backslash and case-ambiguous manifest paths', async () => {
    const validate = await loadValidator()
    const attacks = [
      '../outside.txt',
      '/absolute.txt',
      'C:/absolute.txt',
      'package.json:stream',
      'nested\\file.txt',
      'PACKAGE.json',
    ]
    for (const attack of attacks) {
      const fixture = createValidatorFixture()
      try {
        const manifest = join(fixture.root, ...MANIFEST_PATH.split('/'))
        writeFileSync(manifest, `${readFileSync(manifest, 'utf8')}\n${'0'.repeat(64)}  lf:${attack}\n`)
        expect(() => validate({ root: fixture.root }), attack).toThrow(/Paritätsmanifest ungültig/)
      } finally {
        fixture.dispose()
      }
    }
  })

  it('rejects BOM and invalid UTF-8 even when their physical hashes are represented', async () => {
    const validate = await loadValidator()
    for (const attack of [Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), Buffer.from([0xc3, 0x28])]) {
      const fixture = createValidatorFixture()
      try {
        writeFixtureFile(fixture.root, 'package.json', attack)
        const manifest = join(fixture.root, ...MANIFEST_PATH.split('/'))
        const lines = readFileSync(manifest, 'utf8').split('\n').map((line) => line.endsWith('lf:package.json') ? `${sha256(attack)}  lf:package.json` : line)
        writeFileSync(manifest, lines.join('\n'))
        expect(() => validate({ root: fixture.root })).toThrow(/BOM|gültiges UTF-8/)
      } finally {
        fixture.dispose()
      }
    }
  })

  it('rejects symlinks, parent junctions and hardlink aliases', async () => {
    const validate = await loadValidator()

    const rootLinkFixture = createValidatorFixture()
    const linkedRoot = `${rootLinkFixture.root}-linked-root`
    try {
      symlinkSync(rootLinkFixture.root, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir')
      expect(() => validate({ root: linkedRoot })).toThrow(/Repository-Root/)
    } finally {
      rmSync(linkedRoot, { recursive: true, force: true })
      rootLinkFixture.dispose()
    }

    const finalLinkFixture = createValidatorFixture()
    try {
      const target = join(finalLinkFixture.root, 'package.json')
      const linkedPath = 'tests/linked-normative.ts'
      symlinkSync(target, join(finalLinkFixture.root, ...linkedPath.split('/')), 'file')
      finalLinkFixture.normativePaths.push(linkedPath)
      finalLinkFixture.rewrite()
      expect(() => validate({ root: finalLinkFixture.root })).toThrow(/Symlink|Reparse/)
    } finally {
      finalLinkFixture.dispose()
    }

    const parentLinkFixture = createValidatorFixture()
    try {
      writeFixtureFile(parentLinkFixture.outsideRoot, 'escaped.ts', 'outside\n')
      const linkDirectory = join(parentLinkFixture.root, 'linked-parent')
      symlinkSync(parentLinkFixture.outsideRoot, linkDirectory, process.platform === 'win32' ? 'junction' : 'dir')
      parentLinkFixture.normativePaths.push('linked-parent/escaped.ts')
      parentLinkFixture.rewrite()
      expect(() => validate({ root: parentLinkFixture.root })).toThrow(/Symlink|Reparse|Repository-Root/)
    } finally {
      parentLinkFixture.dispose()
    }

    const hardlinkFixture = createValidatorFixture()
    try {
      const linkedPath = 'tests/hardlink-normative.ts'
      linkSync(join(hardlinkFixture.root, 'package.json'), join(hardlinkFixture.root, ...linkedPath.split('/')))
      hardlinkFixture.normativePaths.push(linkedPath)
      hardlinkFixture.rewrite()
      expect(() => validate({ root: hardlinkFixture.root })).toThrow(/Hardlink|physischer Alias/)
    } finally {
      hardlinkFixture.dispose()
    }
  })

  it('rejects deterministic in-read mutations and path swaps', async () => {
    const validate = await loadValidator()
    const mutationFixture = createValidatorFixture()
    try {
      let mutated = false
      expect(() => validate({
        root: mutationFixture.root,
        hooks: {
          afterRead: ({ path, absolute }) => {
            if (path === 'package.json' && !mutated) {
              mutated = true
              writeFileSync(absolute, 'changed-during-read\n')
            }
          },
        },
      })).toThrow(/während des Reads|Pfadziel wechselte/)
    } finally {
      mutationFixture.dispose()
    }

    const swapFixture = createValidatorFixture()
    try {
      let swapped = false
      expect(() => validate({
        root: swapFixture.root,
        hooks: {
          afterOpen: ({ path, absolute }) => {
            if (path === 'package.json' && !swapped) {
              swapped = true
              renameSync(absolute, `${absolute}.opened`)
              writeFileSync(absolute, 'replacement-path-target\n')
            }
          },
        },
      })).toThrow(/Pfadziel wechselte|Dateiidentität wechselte|Datei wurde während des Reads verändert/)
    } finally {
      swapFixture.dispose()
    }

    const lateMutationFixture = createValidatorFixture()
    try {
      let mutatedLate = false
      expect(() => validate({
        root: lateMutationFixture.root,
        hooks: {
          afterRead: ({ path }) => {
            if (path === 'tsconfig.json' && !mutatedLate) {
              mutatedLate = true
              writeFileSync(join(lateMutationFixture.root, 'package.json'), 'changed-after-cached-read\n')
            }
          },
        },
      })).toThrow(/nach dem Read verändert|ausgetauscht/)
    } finally {
      lateMutationFixture.dispose()
    }
  })

  it('rejects manifest/evidence closure, count, parity and candidate-scope drift', async () => {
    const validate = await loadValidator()
    const mutations: Array<(fixture: Fixture) => void> = [
      (fixture) => {
        fixture.normativePaths.push('tests/unexpected-extra.ts')
        writeFixtureFile(fixture.root, 'tests/unexpected-extra.ts', 'extra\n')
        fixture.rewrite()
        const manifest = join(fixture.root, ...MANIFEST_PATH.split('/'))
        writeFileSync(manifest, readFileSync(manifest, 'utf8').replace(/^.*lf:tests\/unexpected-extra\.ts\r?\n/m, ''))
      },
      (fixture) => {
        fixture.rewrite()
        const policy = fixture.evidence.canonical_hash_policy as { manifest_entry_count: number }
        policy.manifest_entry_count = 999
        writeFixtureFile(fixture.root, EVIDENCE_PATH, `${JSON.stringify(fixture.evidence, null, 2)}\n`)
        const manifest = join(fixture.root, ...MANIFEST_PATH.split('/'))
        const evidenceBytes = canonicalBytes(join(fixture.root, ...EVIDENCE_PATH.split('/')))
        writeFileSync(manifest, readFileSync(manifest, 'utf8').replace(/^[a-f0-9]{64}  lf:docs\/gates\/EQUORA_v57\.61\.0_MULTI_BROKER_PARITY_EVIDENCE\.json$/m, `${sha256(evidenceBytes)}  lf:${EVIDENCE_PATH}`))
      },
      (fixture) => {
        fixture.evidence.parity_matrix = REQUIRED_PARITY_PATHS.slice(1)
        fixture.rewrite()
      },
      (fixture) => {
        fixture.evidence.candidate_scope = REQUIRED_CANDIDATE_SCOPE.slice(1)
        fixture.rewrite()
      },
      (fixture) => {
        fixture.evidence.toolchain = {
          node: 'v24.18.0',
          npm: '11.99.0',
          git: '2.53.0.windows.2',
          operating_system: 'Microsoft Windows NT 10.0.26100.0',
          docker_client: '29.6.2',
          docker_client_observation: 'fixture observation',
          postgres_client: 'not_available_on_path',
          postgres_image: 'not_invoked_in_mb0',
          ci_node: '24.18.0',
        }
        fixture.rewrite()
      },
      (fixture) => {
        fixture.evidence.candidate_counts = {
          test_files: 24,
          tests: 395,
          new_contract_test_files: 1,
          new_contract_tests: 15,
          audit_all_vulnerabilities: 0,
          audit_production_vulnerabilities: 0,
        }
        fixture.rewrite()
      },
      (fixture) => {
        writeFixtureFile(fixture.root, '.github/workflows/ci.yml', "steps:\n  - with:\n      node-version: 24.19.0\n")
        fixture.rewrite()
      },
      (fixture) => {
        const attempts = fixture.evidence.candidate_attempts as Array<Record<string, unknown>>
        const full = attempts.find((attempt) => attempt.attempt_id === 'mb0-remediation2-full-002')
        if (!full) throw new Error('Fixture-Gate-Attempt fehlt.')
        full.result_counts = {
          test_files_passed: 24,
          test_files_total: 24,
          tests_passed: 393,
          tests_total: 393,
        }
        fixture.rewrite()
      },
      (fixture) => {
        const attempts = fixture.evidence.baseline_attempts as Array<Record<string, unknown>>
        fixture.evidence.baseline_attempts = attempts.filter((attempt) => attempt.attempt_id !== 'mb0-local-005')
        fixture.rewrite()
      },
      (fixture) => {
        const attempts = fixture.evidence.baseline_attempts as Array<Record<string, unknown>>
        const release = attempts.find((attempt) => attempt.attempt_id === 'mb0-local-007')
        if (!release) throw new Error('Fixture-Baseline-Release-Attempt fehlt.')
        release.result = 'completed'
        fixture.rewrite()
      },
      (fixture) => {
        const attempts = fixture.evidence.baseline_attempts as Array<Record<string, unknown>>
        const build = attempts.find((attempt) => attempt.attempt_id === 'mb0-local-008')
        if (!build) throw new Error('Fixture-Baseline-Build-Attempt fehlt.')
        build.stdout_stderr_sha256 = 'f'.repeat(64)
        fixture.rewrite()
      },
      (fixture) => {
        const attempts = fixture.evidence.baseline_attempts as Array<Record<string, unknown>>
        const install = attempts.find((attempt) => attempt.attempt_id === 'mb0-local-002')
        if (!install) throw new Error('Fixture-Baseline-Install-Attempt fehlt.')
        install.stdout_stderr_utf8_bytes = 152
        fixture.rewrite()
      },
      (fixture) => {
        const attempts = fixture.evidence.candidate_attempts as Array<Record<string, unknown>>
        fixture.evidence.candidate_attempts = attempts.filter(
          (attempt) => attempt.attempt_id !== 'mb0-remediation2-manifest-001',
        )
        fixture.rewrite()
      },
      (fixture) => {
        delete fixture.evidence.gate_transcript_policies
        fixture.rewrite()
      },
      (fixture) => {
        const policies = fixture.evidence.gate_transcript_policies as Record<string, { redactions: string[] }>
        policies.canonical_gate_transcript_v1.redactions[0] = 'changed redaction'
        fixture.rewrite()
      },
      (fixture) => {
        const policies = fixture.evidence.gate_transcript_policies as Record<string, Record<string, unknown>>
        policies.canonical_gate_transcript_v1.extra = true
        fixture.rewrite()
      },
      (fixture) => {
        const attempts = fixture.evidence.candidate_attempts as Array<Record<string, unknown>>
        const targeted = attempts.find((attempt) => attempt.attempt_id === 'mb0-remediation3-targeted-001')
        if (!targeted) throw new Error('Fixture-Transcript-Attempt fehlt.')
        targeted.output_transcript_policy = 'unknown_policy'
        fixture.rewrite()
      },
    ]

    for (const mutate of mutations) {
      const fixture = createValidatorFixture()
      try {
        mutate(fixture)
        expect(() => validate({ root: fixture.root })).toThrow(/Paritätsmanifest ungültig/)
      } finally {
        fixture.dispose()
      }
    }

    const closureAttemptIds = [
      'mb0-remediation8-closure-targeted-001',
      'mb0-remediation8-closure-typecheck-001',
      'mb0-remediation8-closure-full-001',
      'mb0-remediation8-closure-release-001',
      'mb0-remediation8-closure-audit-all-001',
      'mb0-remediation8-closure-audit-prod-001',
      'mb0-remediation8-closure-build-001',
      'mb0-remediation8-closure-manifest-001',
      'mb0-remediation9-closure-targeted-001',
      'mb0-remediation9-closure-typecheck-001',
      'mb0-remediation9-closure-full-001',
      'mb0-remediation9-closure-release-001',
      'mb0-remediation9-closure-audit-all-001',
      'mb0-remediation9-closure-audit-prod-001',
      'mb0-remediation9-closure-build-001',
      'mb0-remediation9-closure-manifest-001',
      'mb0-remediation10-closure-targeted-001',
      'mb0-remediation10-closure-typecheck-001',
      'mb0-remediation10-closure-full-001',
      'mb0-remediation10-closure-release-001',
      'mb0-remediation10-closure-audit-all-001',
      'mb0-remediation10-closure-audit-prod-001',
      'mb0-remediation10-closure-build-001',
      'mb0-remediation10-closure-manifest-001',
    ] as const
    const closureAttemptMutations: Array<{
      name: string
      apply: (attempt: Record<string, unknown>) => boolean
    }> = [
      { name: 'result', apply: (attempt) => { attempt.result = 'tampered'; return true } },
      { name: 'exit', apply: (attempt) => { attempt.exit_code = 1; return true } },
      { name: 'command', apply: (attempt) => { attempt.command = 'tampered command'; return true } },
      {
        name: 'count',
        apply: (attempt) => {
          const counts = attempt.result_counts
          if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return false
          const firstKey = Object.keys(counts)[0]
          if (!firstKey) return false
          const mutableCounts = counts as Record<string, unknown>
          mutableCounts[firstKey] = Number(mutableCounts[firstKey]) + 1
          return true
        },
      },
      { name: 'transcript-bytes', apply: (attempt) => { attempt.stdout_stderr_utf8_bytes = Number(attempt.stdout_stderr_utf8_bytes) + 1; return true } },
      { name: 'transcript-hash', apply: (attempt) => { attempt.stdout_stderr_sha256 = 'f'.repeat(64); return true } },
      { name: 'policy', apply: (attempt) => { attempt.output_transcript_policy = 'unknown_policy'; return true } },
      { name: 'start-time', apply: (attempt) => { attempt.started_at_utc = null; return true } },
      { name: 'end-time', apply: (attempt) => { attempt.ended_at_utc = null; return true } },
    ]

    for (const attemptId of closureAttemptIds) {
      const deletionFixture = createValidatorFixture()
      try {
        const attempts = deletionFixture.evidence.candidate_attempts as Array<Record<string, unknown>>
        deletionFixture.evidence.candidate_attempts = attempts.filter((attempt) => attempt.attempt_id !== attemptId)
        deletionFixture.rewrite()
        expect(() => validate({ root: deletionFixture.root }), `deletion:${attemptId}`).toThrow(/Paritätsmanifest ungültig/)
      } finally {
        deletionFixture.dispose()
      }

      for (const mutation of closureAttemptMutations) {
        const fixture = createValidatorFixture()
        try {
          const attempts = fixture.evidence.candidate_attempts as Array<Record<string, unknown>>
          const attempt = attempts.find((candidate) => candidate.attempt_id === attemptId)
          if (!attempt) throw new Error(`Fixture-Closure-Attempt fehlt: ${attemptId}`)
          if (!mutation.apply(attempt)) continue
          fixture.rewrite()
          expect(
            () => validate({ root: fixture.root }),
            `${mutation.name}:${attemptId}`,
          ).toThrow(/Paritätsmanifest ungültig/)
        } finally {
          fixture.dispose()
        }
      }
    }

    const currentBootstrapFixture = createValidatorFixture()
    try {
      const attempts = currentBootstrapFixture.evidence.candidate_attempts as Array<Record<string, unknown>>
      currentBootstrapFixture.evidence.candidate_attempts = attempts.filter(
        (attempt) => attempt.attempt_id !== 'mb0-remediation10-closure-manifest-001',
      )
      currentBootstrapFixture.rewrite()
      expect(() => validate({ root: currentBootstrapFixture.root })).toThrow(/Paritätsmanifest ungültig/)
      expect(() => validate({
        root: currentBootstrapFixture.root,
        allowPendingManifestAttempt: true,
      })).not.toThrow()
    } finally {
      currentBootstrapFixture.dispose()
    }

    for (const historicalAttemptId of [
      'mb0-remediation8-closure-manifest-001',
      'mb0-remediation9-closure-manifest-001',
    ]) {
      const historicalBootstrapFixture = createValidatorFixture()
      try {
        const attempts = historicalBootstrapFixture.evidence.candidate_attempts as Array<Record<string, unknown>>
        historicalBootstrapFixture.evidence.candidate_attempts = attempts.filter(
          (attempt) => attempt.attempt_id !== historicalAttemptId,
        )
        historicalBootstrapFixture.rewrite()
        expect(() => validate({
          root: historicalBootstrapFixture.root,
          allowPendingManifestAttempt: true,
        })).toThrow(/Paritätsmanifest ungültig/)
      } finally {
        historicalBootstrapFixture.dispose()
      }
    }
  }, 60_000)
})

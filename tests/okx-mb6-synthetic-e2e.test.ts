import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// @ts-ignore The shared offline validator is JavaScript and intentionally has no declaration file.
import { probableSecretClasses as broadSecretScanner } from '../scripts/multibroker-mb4-validation-lib.mjs'

vi.mock('server-only', () => ({}))

import {
  DESCRIPTOR_QUERY_DIGEST_CONTRACT_VERSION,
  computeAuthorityTupleDigest,
  computeBrokerDescriptorQueryDigest,
  computeCanonicalBrokerValueDigest,
  createBrokerRequestPlanningBoundary,
  type BrokerCodeRegistryPort,
  type CanonicalJsonValue,
  type ConnectionProbeAuthorityTuple,
  type ProviderCapabilityRef,
} from '../lib/server/broker-core-contracts'
import { brokerCodeRegistry } from '../lib/server/broker-code-registry'
import {
  canonicalizeBrokerEgressIpAddress,
  canonicalizeBrokerEgressIpSet,
  isBrokerIpAddressSyntax,
} from '../lib/server/broker-ip-address'
import {
  computeOkxAccountIdentityDigest,
  computeOkxAuthorizedEgressIpSetDigest,
  computeOkxProviderProjectionDigest,
  computeOkxSyntheticPermitAuthoritySnapshotDigest,
  computeOkxSyntheticPermitRequestDescriptorDigest,
  computeOkxSyntheticAuthorityDigest,
  inspectOkxSyntheticMinimalProbeResponse,
  OKX_SYNTHETIC_HEADER_NAME_SET_DIGEST,
  resolveOkxCandidateRuntimeMode,
  runOkxSyntheticCandidateProbe,
  type OkxSyntheticAuthority,
  type OkxSyntheticPermit,
  type OkxSyntheticPermitControlPlane,
  type OkxSyntheticPermitIssueRequest,
  type OkxSyntheticPermitReceipt,
  type OkxSyntheticProbeInput,
  type OkxSyntheticResponse,
} from '../lib/server/okx-candidate-runtime'
import {
  OKX_ADAPTER_PLAN_CONTRACT_VERSION,
  OKX_ADAPTER_VERSION,
  OKX_EEA_DEMO_ORIGIN,
  OKX_PROFILE_CAPABILITY_DIGESTS,
  OKX_PROFILE_DIGEST,
  OKX_PROFILE_ID,
  OKX_PROFILE_VERSION,
  OKX_PROVIDER_CONTRACT_VERSION,
  OKX_READONLY_CAPABILITIES,
  OkxCandidateError,
  okxReadonlyCandidateAdapter,
  type OkxMinimalProbeCapabilityId,
} from '../lib/server/providers/okx-readonly-adapter'

function readOkxTestDescriptor(ref: ProviderCapabilityRef) {
  return OKX_READONLY_CAPABILITIES.find((descriptor) => (
      descriptor.ref.providerCode === ref.providerCode
      && descriptor.ref.providerContractVersion === ref.providerContractVersion
      && descriptor.ref.adapterVersion === ref.adapterVersion
      && descriptor.ref.capabilityKind === ref.capabilityKind
      && descriptor.ref.providerCapabilityId === ref.providerCapabilityId
      && descriptor.ref.providerCapabilityVersion === ref.providerCapabilityVersion
      && descriptor.ref.capabilityDescriptorDigest === ref.capabilityDescriptorDigest
  )) ?? null
}

const okxTestOnlyCodeRegistry: BrokerCodeRegistryPort = Object.freeze({
  async readBuiltCapability(ref: ProviderCapabilityRef) {
    return readOkxTestDescriptor(ref)
  },
  async readBuiltAdapter(ref: ProviderCapabilityRef) {
    return readOkxTestDescriptor(ref) ? okxReadonlyCandidateAdapter : null
  },
})

type FixtureCase = Readonly<{
  case_id: string
  capability_id: OkxMinimalProbeCapabilityId
  authority?: Readonly<{ authorized_egress_ip_set?: readonly string[] }>
  request_context?: Readonly<{ window_start_ms?: string; window_end_ms?: string }>
  response: Readonly<{ http_status: number; body: Record<string, unknown> }>
}>

const fixtureDocument = JSON.parse(readFileSync(
  resolve(process.cwd(), 'tests/fixtures/okx/mb5-read-contract-fixtures.json'),
  'utf8',
)) as Readonly<{ positive_cases: readonly FixtureCase[] }>
const okxProfileDocument = JSON.parse(readFileSync(
  resolve(process.cwd(), 'docs/architecture/EQUORA_v57.61.0_OKX_CAPABILITY_AND_PROBE_PROFILE.json'),
  'utf8',
)) as Readonly<{ single_use_permit_contract: Readonly<{ closed_claim_fields: readonly string[] }> }>

const IDENTITY_KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
const DEADLINE = '2026-08-27T10:21:00.000Z'
const TRUSTED_NOW = Date.parse('2026-08-27T10:20:23.000Z')
const WINDOW_START = '1787047202000'
const WINDOW_END = '1787652002000'
const MB56_PERMIT_KEYS = [
  'permitId', 'accountConnectionId', 'setupCommandId', 'setupRowVersion', 'identityKeyVersion',
  'permissionAttestationSha256', 'expectedProviderPermAndIpProjectionSha256', 'expectedAccountIdentitySha256',
  'authorizedEgressIpSetSha256', 'accountMfaAttestationSha256', 'incidentClearAttestationSha256',
  'authorityGeneration', 'predecessorResponseEvidenceSha256', 'observedProviderPermAndIpProjectionSha256',
  'observedAccountIdentitySha256', 'requestId', 'requestSequence', 'capabilityId', 'capabilityDescriptorSha256',
  'providerContractVersion', 'profileDigestSha256', 'authoritySnapshotSha256', 'environment', 'httpsOrigin', 'port',
  'method', 'pathWithCanonicalQuery', 'headerNameSetSha256', 'requestDescriptorSha256', 'windowStartMs',
  'windowEndMs', 'responseByteLimit', 'requestTimeoutMs', 'totalRequestBudget', 'totalResponseByteBudget',
  'issuedAt', 'deadlineAt', 'state', 'consumptionCount',
] as const

function snakeToCamel(value: string) {
  return value.replace(/_([a-z0-9])/g, (_match, character: string) => character.toUpperCase())
}

function fixture(caseId: string) {
  const selected = fixtureDocument.positive_cases.find((entry) => entry.case_id === caseId)
  if (!selected) throw new Error(`missing fixture ${caseId}`)
  return structuredClone(selected)
}

function rawBody(body: unknown) {
  return Object.freeze([...new TextEncoder().encode(JSON.stringify(body))])
}

function response(
  fixtureCase: FixtureCase,
  requestId: OkxSyntheticResponse['requestId'],
  requestSequence: OkxSyntheticResponse['requestSequence'],
  requestStartedAt: string,
  responseReceivedAt: string,
): OkxSyntheticResponse {
  return Object.freeze({
    transportKind: 'synthetic_fixture_no_network',
    requestId,
    requestSequence,
    capabilityId: fixtureCase.capability_id,
    httpStatus: fixtureCase.response.http_status,
    rawBody: rawBody(fixtureCase.response.body),
    requestStartedAt,
    responseReceivedAt,
  })
}

function authority(identityKey = IDENTITY_KEY) {
  const account = fixture('positive_account_config_main_net')
  const accountRecord = (account.response.body.data as Array<Record<string, string>>)[0]
  const authorizedEgressIpSet = Object.freeze([...(account.authority?.authorized_egress_ip_set ?? [])])
  const draft = {
    authorityContractVersion: 'equora-okx-synthetic-probe-authority-v1' as const,
    accountConnectionId: 'okx-synthetic-connection-1',
    setupCommandId: 'okx-synthetic-setup-1',
    setupRowVersion: 1,
    environment: 'demo' as const,
    regionProfileId: 'okx-eea-demo-v1' as const,
    httpsOrigin: OKX_EEA_DEMO_ORIGIN,
    providerContractVersion: OKX_PROVIDER_CONTRACT_VERSION,
    profileId: OKX_PROFILE_ID,
    profileVersion: OKX_PROFILE_VERSION,
    profileDigest: OKX_PROFILE_DIGEST,
    identityKeyVersion: 'synthetic-v1',
    expectedAccountIdentityDigest: computeOkxAccountIdentityDigest(identityKey, accountRecord.uid),
    permissionAttestationDigest: '1'.repeat(64),
    expectedProviderProjectionDigest: computeOkxProviderProjectionDigest('read_only', authorizedEgressIpSet),
    authorizedEgressIpSet,
    authorizedEgressIpSetDigest: computeOkxAuthorizedEgressIpSetDigest(authorizedEgressIpSet),
    accountMfaAttested: true as const,
    accountMfaAttestationDigest: '2'.repeat(64),
    incidentStatus: 'clear' as const,
    incidentClearAttestationDigest: '3'.repeat(64),
    windowStartMs: WINDOW_START,
    windowEndMs: WINDOW_END,
    absoluteDeadlineAt: DEADLINE,
    maximumRequests: 3 as const,
    maximumTotalResponseBytes: 1_048_576 as const,
    maximumDurationMs: 15_000 as const,
    maximumParallelRequests: 1 as const,
    maximumRetries: 0 as const,
  }
  return Object.freeze({
    ...draft,
    authorityDigest: computeOkxSyntheticAuthorityDigest(draft),
  }) as OkxSyntheticAuthority
}

function permit(
  authorityValue: OkxSyntheticAuthority,
  responseValue: Pick<OkxSyntheticResponse, 'requestId' | 'requestSequence' | 'capabilityId'>,
  predecessorResponseEvidenceDigest: string | null,
  observedProviderProjectionDigest: string | null,
  observedAccountIdentityDigest: string | null,
  issuedAt: string,
): OkxSyntheticPermit {
  const path = responseValue.capabilityId === 'okx_account_config_v1'
    ? '/api/v5/account/config'
    : responseValue.capabilityId === 'okx_account_instruments_swap_v1'
      ? '/api/v5/account/instruments?instType=SWAP'
      : `/api/v5/trade/fills-history?begin=${authorityValue.windowStartMs}&end=${authorityValue.windowEndMs}&instType=SWAP&limit=10`
  const responseByteLimit = responseValue.capabilityId === 'okx_account_config_v1'
    ? 65_536
    : responseValue.capabilityId === 'okx_account_instruments_swap_v1'
      ? 1_048_576
      : 262_144
  return Object.freeze({
    permitId: `okx-synthetic-permit-${responseValue.requestSequence}`,
    accountConnectionId: authorityValue.accountConnectionId,
    setupCommandId: authorityValue.setupCommandId,
    setupRowVersion: authorityValue.setupRowVersion,
    identityKeyVersion: authorityValue.identityKeyVersion,
    permissionAttestationSha256: authorityValue.permissionAttestationDigest,
    expectedProviderPermAndIpProjectionSha256: authorityValue.expectedProviderProjectionDigest,
    expectedAccountIdentitySha256: authorityValue.expectedAccountIdentityDigest,
    authorizedEgressIpSetSha256: authorityValue.authorizedEgressIpSetDigest,
    accountMfaAttestationSha256: authorityValue.accountMfaAttestationDigest,
    incidentClearAttestationSha256: authorityValue.incidentClearAttestationDigest,
    authorityGeneration: responseValue.requestSequence,
    predecessorResponseEvidenceSha256: predecessorResponseEvidenceDigest,
    observedProviderPermAndIpProjectionSha256: observedProviderProjectionDigest,
    observedAccountIdentitySha256: observedAccountIdentityDigest,
    requestId: responseValue.requestId,
    requestSequence: responseValue.requestSequence,
    capabilityId: responseValue.capabilityId,
    capabilityDescriptorSha256: OKX_PROFILE_CAPABILITY_DIGESTS[responseValue.capabilityId],
    providerContractVersion: OKX_PROVIDER_CONTRACT_VERSION,
    profileDigestSha256: OKX_PROFILE_DIGEST,
    authoritySnapshotSha256: computeOkxSyntheticPermitAuthoritySnapshotDigest(authorityValue, {
      authorityGeneration: responseValue.requestSequence,
      predecessorResponseEvidenceDigest,
      observedProviderProjectionDigest,
      observedAccountIdentityDigest,
    }),
    environment: authorityValue.environment,
    httpsOrigin: authorityValue.httpsOrigin,
    port: 443,
    method: 'GET',
    pathWithCanonicalQuery: path,
    headerNameSetSha256: OKX_SYNTHETIC_HEADER_NAME_SET_DIGEST,
    requestDescriptorSha256: computeOkxSyntheticPermitRequestDescriptorDigest(
      authorityValue,
      responseValue.requestSequence,
    ),
    windowStartMs: authorityValue.windowStartMs,
    windowEndMs: authorityValue.windowEndMs,
    responseByteLimit,
    requestTimeoutMs: 4_000,
    totalRequestBudget: 3,
    totalResponseByteBudget: 1_048_576,
    issuedAt,
    deadlineAt: DEADLINE,
    state: 'issued_unconsumed',
    consumptionCount: 0,
  })
}

function independentMb56RequestDescriptorDigest(
  authorityValue: OkxSyntheticAuthority,
  responseValue: Pick<OkxSyntheticResponse, 'requestId' | 'requestSequence' | 'capabilityId'>,
) {
  const pathWithCanonicalQuery = responseValue.capabilityId === 'okx_account_config_v1'
    ? '/api/v5/account/config'
    : responseValue.capabilityId === 'okx_account_instruments_swap_v1'
      ? '/api/v5/account/instruments?instType=SWAP'
      : `/api/v5/trade/fills-history?begin=${authorityValue.windowStartMs}&end=${authorityValue.windowEndMs}&instType=SWAP&limit=10`
  const responseByteLimit = responseValue.capabilityId === 'okx_account_config_v1'
    ? 65_536
    : responseValue.capabilityId === 'okx_account_instruments_swap_v1'
      ? 1_048_576
      : 262_144
  return computeCanonicalBrokerValueDigest({
    request_id: responseValue.requestId,
    request_sequence: responseValue.requestSequence,
    capability_id: responseValue.capabilityId,
    method: 'GET',
    https_origin: authorityValue.httpsOrigin,
    port: 443,
    environment: authorityValue.environment,
    path_with_canonical_query: pathWithCanonicalQuery,
    header_name_set_sha256: OKX_SYNTHETIC_HEADER_NAME_SET_DIGEST,
    window_start_ms: authorityValue.windowStartMs,
    window_end_ms: authorityValue.windowEndMs,
    response_byte_limit: responseByteLimit,
    request_timeout_ms: 4_000,
    total_request_budget: 3,
    total_response_byte_budget: 1_048_576,
    deadline_at: authorityValue.absoluteDeadlineAt,
  })
}

function harness(
  mutate?: (input: {
    authority: OkxSyntheticAuthority
    responses: OkxSyntheticResponse[]
  }) => void,
) {
  const authorityValue = authority()
  const responses = [
    response(
      fixture('positive_account_config_main_net'),
      'probe_account_config',
      1,
      '2026-08-27T10:20:20.000Z',
      '2026-08-27T10:20:20.500Z',
    ),
    response(
      fixture('positive_multiple_eligible_and_filtered_swap_instruments'),
      'probe_account_instruments',
      2,
      '2026-08-27T10:20:21.000Z',
      '2026-08-27T10:20:21.500Z',
    ),
    response(
      fixture('positive_fills_across_two_eligible_instruments'),
      'probe_fills_history',
      3,
      '2026-08-27T10:20:22.000Z',
      '2026-08-27T10:20:22.500Z',
    ),
  ]
  mutate?.({ authority: authorityValue, responses })
  return {
    input: Object.freeze({
      runtimeMode: 'synthetic_test',
      authority: authorityValue,
      identityKeyMaterial: IDENTITY_KEY,
      initialPermit: permit(authorityValue, responses[0], null, null, null, '2026-08-27T10:20:15.123Z'),
      responses: Object.freeze(responses),
    }) as OkxSyntheticProbeInput,
  }
}

function controlPlane(options?: Readonly<{
  mutateIssuedPermit?: (permitValue: OkxSyntheticPermit, request: OkxSyntheticPermitIssueRequest) => OkxSyntheticPermit
  mutateReceipt?: (receipt: OkxSyntheticPermitReceipt) => OkxSyntheticPermitReceipt
  duringConsume?: (permitValue: OkxSyntheticPermit) => void
  duringIssue?: (request: OkxSyntheticPermitIssueRequest) => void
}>) {
  const consumed = new Set<string>()
  const issuedDigests = new Map<number, string>()
  const consumedAt = [
    '2026-08-27T10:20:19.900Z',
    '2026-08-27T10:20:20.900Z',
    '2026-08-27T10:20:21.900Z',
  ] as const
  const issuedAt = [
    '2026-08-27T10:20:20.600Z',
    '2026-08-27T10:20:21.600Z',
  ] as const
  let calls = 0
  let issueCalls = 0
  let nextConsumptionSequence = 1
  let lastReceipt: Awaited<ReturnType<OkxSyntheticPermitControlPlane['consumePermitAtomically']>> | null = null
  let lastConsumedPermit: OkxSyntheticPermit | null = null
  const issuedPermits: OkxSyntheticPermit[] = []
  const issueRequests: OkxSyntheticPermitIssueRequest[] = []
  const port: OkxSyntheticPermitControlPlane = {
    async issuePermitForAcceptedTransition(request) {
      const expectedRequest = request.requestSequence === 2
        ? { requestId: 'probe_account_instruments', capabilityId: 'okx_account_instruments_swap_v1' }
        : { requestId: 'probe_fills_history', capabilityId: 'okx_fills_history_swap_v1' }
      if (!lastReceipt || !lastConsumedPermit || !Object.isFrozen(request) || !Object.isFrozen(request.authority)
        || !Object.isFrozen(request.predecessorPermitReceipt)
        || request.issueContractVersion !== 'equora-okx-synthetic-permit-issue-transition-v2'
        || request.authorityGeneration !== nextConsumptionSequence
        || request.requestSequence !== nextConsumptionSequence
        || request.requestSequence !== lastReceipt.requestSequence + 1
        || request.requestId !== expectedRequest.requestId || request.capabilityId !== expectedRequest.capabilityId
        || computeCanonicalBrokerValueDigest(request.predecessorPermitReceipt as unknown as CanonicalJsonValue)
          !== computeCanonicalBrokerValueDigest(lastReceipt as unknown as CanonicalJsonValue)
        || request.authority.accountConnectionId !== lastConsumedPermit.accountConnectionId
        || request.authority.setupCommandId !== lastConsumedPermit.setupCommandId
        || request.authority.setupRowVersion !== lastConsumedPermit.setupRowVersion
        || request.authority.identityKeyVersion !== lastConsumedPermit.identityKeyVersion
        || request.authority.permissionAttestationDigest !== lastConsumedPermit.permissionAttestationSha256
        || request.authority.expectedProviderProjectionDigest !== lastConsumedPermit.expectedProviderPermAndIpProjectionSha256
        || request.authority.expectedAccountIdentityDigest !== lastConsumedPermit.expectedAccountIdentitySha256
        || request.authority.authorizedEgressIpSetDigest !== lastConsumedPermit.authorizedEgressIpSetSha256
        || request.authority.accountMfaAttestationDigest !== lastConsumedPermit.accountMfaAttestationSha256
        || request.authority.incidentClearAttestationDigest !== lastConsumedPermit.incidentClearAttestationSha256
        || request.authority.providerContractVersion !== lastConsumedPermit.providerContractVersion
        || request.authority.profileDigest !== lastConsumedPermit.profileDigestSha256
        || request.authority.environment !== lastConsumedPermit.environment
        || request.authority.httpsOrigin !== lastConsumedPermit.httpsOrigin
        || request.authority.windowStartMs !== lastConsumedPermit.windowStartMs
        || request.authority.windowEndMs !== lastConsumedPermit.windowEndMs
        || request.authority.absoluteDeadlineAt !== lastConsumedPermit.deadlineAt
        || Date.parse(request.predecessorResponseReceivedAt) < Date.parse(lastReceipt.consumedAt)
        || !/^[a-f0-9]{64}$/.test(request.predecessorResponseEvidenceDigest)
        || !/^[a-f0-9]{64}$/.test(request.observedProviderProjectionDigest)
        || !/^[a-f0-9]{64}$/.test(request.observedAccountIdentityDigest)
        || issuedDigests.has(request.requestSequence)) {
        throw new OkxCandidateError('permit_rejected', 'synthetic permit issuance transition rejected')
      }
      options?.duringIssue?.(request)
      const issuedPermit = permit(
        request.authority,
        request,
        request.predecessorResponseEvidenceDigest,
        request.observedProviderProjectionDigest,
        request.observedAccountIdentityDigest,
        issuedAt[request.requestSequence - 2],
      )
      const result = options?.mutateIssuedPermit?.(issuedPermit, request) ?? issuedPermit
      issuedDigests.set(request.requestSequence, computeCanonicalBrokerValueDigest(result as unknown as CanonicalJsonValue))
      issuedPermits.push(result)
      issueRequests.push(request)
      issueCalls += 1
      return result
    },
    async consumePermitAtomically(permitValue) {
      if (!Object.isFrozen(permitValue)
        || Object.keys(permitValue).toSorted().join(',') !== [...MB56_PERMIT_KEYS].toSorted().join(',')
        || typeof permitValue.permitId !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(permitValue.permitId)
        || permitValue.requestSequence !== nextConsumptionSequence
        || permitValue.authorityGeneration !== nextConsumptionSequence
        || nextConsumptionSequence === 1 && (permitValue.requestId !== 'probe_account_config'
          || permitValue.capabilityId !== 'okx_account_config_v1')
        || consumed.has(permitValue.permitId)
        || nextConsumptionSequence > 1 && issuedDigests.get(nextConsumptionSequence)
          !== computeCanonicalBrokerValueDigest(permitValue as unknown as CanonicalJsonValue)) {
        throw new OkxCandidateError('permit_rejected', 'synthetic permit replay rejected')
      }
      options?.duringConsume?.(permitValue)
      consumed.add(permitValue.permitId)
      calls += 1
      const receipt = Object.freeze({
        receiptContractVersion: 'equora-okx-synthetic-permit-receipt-v2',
        permitId: permitValue.permitId,
        permitSha256: computeCanonicalBrokerValueDigest(permitValue as unknown as CanonicalJsonValue),
        authoritySnapshotSha256: permitValue.authoritySnapshotSha256,
        requestId: permitValue.requestId,
        requestSequence: permitValue.requestSequence,
        state: 'consumed',
        consumptionCount: 1,
        consumedAt: consumedAt[permitValue.requestSequence - 1],
        transactionId: `synthetic-transaction-${permitValue.requestSequence}`,
      })
      const result = options?.mutateReceipt?.(receipt) ?? receipt
      lastReceipt = receipt
      lastConsumedPermit = permitValue
      nextConsumptionSequence += 1
      return result
    },
  }
  return {
    port,
    calls: () => calls,
    issueCalls: () => issueCalls,
    issuedPermits: () => Object.freeze([...issuedPermits]),
    issueRequests: () => Object.freeze([...issueRequests]),
  }
}

function dependencies(control = controlPlane(), nowEpochMs = () => TRUSTED_NOW) {
  return {
    control,
    value: Object.freeze({
      trustedClock: Object.freeze({ nowEpochMs }),
      permitControlPlane: control.port,
    }),
  }
}

function rebindAuthority(
  original: OkxSyntheticAuthority,
  changes: Partial<Omit<OkxSyntheticAuthority, 'authorityDigest'>>,
) {
  const { authorityDigest: _authorityDigest, ...draft } = original
  const rebound = { ...draft, ...changes }
  return Object.freeze({
    ...rebound,
    authorityDigest: computeOkxSyntheticAuthorityDigest(rebound),
  }) as OkxSyntheticAuthority
}

function queryFor(capabilityId: OkxMinimalProbeCapabilityId) {
  if (capabilityId === 'okx_account_config_v1') return {}
  if (capabilityId === 'okx_account_instruments_swap_v1') return { instType: 'SWAP' }
  return { begin: WINDOW_START, end: WINDOW_END, instType: 'SWAP', limit: '10' }
}

async function planProbe(capabilityId: OkxMinimalProbeCapabilityId) {
  const selectedDescriptor = OKX_READONLY_CAPABILITIES.find(
    (entry) => entry.ref.providerCapabilityId === capabilityId,
  )!
  const requestInput = queryFor(capabilityId) as unknown as CanonicalJsonValue
  const capabilityProfile = {
    profileId: OKX_PROFILE_ID,
    profileVersion: OKX_PROFILE_VERSION,
    profileDigest: OKX_PROFILE_DIGEST,
  }
  const canonicalDescriptorQueryDigest = computeBrokerDescriptorQueryDigest({
    provider: selectedDescriptor.ref,
    capabilityProfile,
    queryContractVersion: selectedDescriptor.queryContractVersion,
    canonicalQuery: requestInput,
  })
  const setupDraft = {
    setupCommandContractVersion: 'equora-broker-connection-setup-command-v2',
    setupCommandId: `okx-setup-${capabilityId}`,
    expectedSetupCommandRowVersion: 1,
    userId: 'okx-synthetic-user',
    environment: 'demo',
    provider: selectedDescriptor.ref,
    capabilityProfile,
    descriptorQueryDigestContractVersion: DESCRIPTOR_QUERY_DIGEST_CONTRACT_VERSION,
    queryContractVersion: selectedDescriptor.queryContractVersion,
    canonicalDescriptorQueryDigest,
    readOnlyAttestation: true,
    probeBudget: {
      cumulativeRequestLimit: 3,
      responseByteLimit: 1_048_576,
      absoluteDeadlineAt: DEADLINE,
    },
    persistenceAuthority: 'secret_free_setup_command_only',
    credentialPersistenceAuthority: 'none_before_atomic_apply',
    captureAuthority: 'none',
    importAuthority: 'none',
  } as const
  const authorityValue = {
    authorityTupleContractVersion: 'equora-broker-authority-tuple-v1',
    authorityTupleDigest: '',
    authorityPurpose: 'connection_probe',
    setupCommandId: setupDraft.setupCommandId,
    expectedSetupCommandRowVersion: 1,
    setupRequestDigest: computeCanonicalBrokerValueDigest(setupDraft as unknown as CanonicalJsonValue),
    userId: setupDraft.userId,
    environment: 'demo',
    runtimeAuthority: {
      requiredMode: 'probe',
      runtimeConfigurationDigest: '4'.repeat(64),
      deploymentIdentity: 'synthetic-test-deployment',
      runtimeAuthorityEpoch: 1,
    },
    provider: selectedDescriptor.ref,
    capabilityProfile,
    commonPolicyPins: {
      runtimePolicyVersion: 'okx-runtime-policy-mb6-candidate-v1',
      requestAuthorityPolicyVersion: 'okx-request-policy-mb6-candidate-v1',
      failurePolicyVersion: 'okx-failure-policy-mb6-candidate-v1',
    },
    purposeScopeDigest: '5'.repeat(64),
    purposeRequestSequence: 1,
    connectionProbePolicyPins: {
      setupPolicyVersion: 'okx-setup-policy-mb6-candidate-v1',
      probePolicyVersion: 'okx-probe-policy-mb6-candidate-v1',
      ephemeralCredentialPolicyVersion: 'okx-ephemeral-policy-mb6-candidate-v1',
      applyPolicyVersion: 'okx-apply-policy-mb6-candidate-v1',
    },
    ephemeralCredentialSession: {
      sessionId: 'synthetic-session',
      generation: 1,
      materialBindingMac: 'synthetic-material-binding',
    },
    probeBudget: {
      ...setupDraft.probeBudget,
      cumulativeRequestCountBefore: 0,
    },
  } as unknown as ConnectionProbeAuthorityTuple
  ;(authorityValue as unknown as { authorityTupleDigest: string }).authorityTupleDigest = computeAuthorityTupleDigest(authorityValue)
  const boundary = createBrokerRequestPlanningBoundary(okxTestOnlyCodeRegistry)
  const setupCommand = await boundary.prepareConnectionSetupCommand({ authority: authorityValue, requestInput })
  return boundary.prepareConnectionProbeRead({
    probeWork: {
      chainBinding: {
        chainId: `okx-probe-chain-${capabilityId}`,
        authorityPurpose: 'connection_probe',
        authority: authorityValue,
      },
      setupCommand,
      requestInput,
    } as never,
    requestId: `okx-probe-request-${capabilityId}`,
    requestInput,
  })
}

describe('MB6 OKX local adapter, locked runtime and synthetic end-to-end slice', () => {
  it('binds the permit object to every closed MB5.6 claim field without additions', () => {
    const profilePermitKeys = okxProfileDocument.single_use_permit_contract.closed_claim_fields.map(snakeToCamel)
    expect([...MB56_PERMIT_KEYS].toSorted()).toEqual(profilePermitKeys.toSorted())
    expect(Object.keys(harness().input.initialPermit).toSorted()).toEqual(profilePermitKeys.toSorted())
  })

  it('reproduces every request descriptor from an independent MB5.6 oracle including capability_id', () => {
    const testHarness = harness()
    for (const responseValue of testHarness.input.responses) {
      expect(computeOkxSyntheticPermitRequestDescriptorDigest(
        testHarness.input.authority,
        responseValue.requestSequence,
      )).toBe(independentMb56RequestDescriptorDigest(testHarness.input.authority, responseValue))
    }
    expect(computeOkxSyntheticPermitRequestDescriptorDigest(testHarness.input.authority, 1))
      .toBe('9fd30591f976e0b94547d523683f38f272349bfc30d0d282a9f75fdf1852c0f1')
  })

  it('builds exactly three immutable GET-only candidate descriptors without registering OKX globally', async () => {
    expect(OKX_ADAPTER_VERSION).toBe('v57_61_0_mb6_candidate_1')
    expect(Object.isFrozen(okxReadonlyCandidateAdapter)).toBe(true)
    expect(OKX_READONLY_CAPABILITIES).toHaveLength(3)
    for (const descriptorValue of OKX_READONLY_CAPABILITIES) {
      expect(descriptorValue.constantMethod).toBe('GET')
      expect(descriptorValue.constantHttpsOrigin).toBe(OKX_EEA_DEMO_ORIGIN)
      expect(descriptorValue.constantPort).toBe(443)
      expect(descriptorValue.authClass).toBe('signed_read')
      expect(descriptorValue.mutationContract).toBe('mutations_forbidden')
      await expect(okxTestOnlyCodeRegistry.readBuiltAdapter(descriptorValue.ref)).resolves.toBe(okxReadonlyCandidateAdapter)
      await expect(brokerCodeRegistry.readBuiltAdapter(descriptorValue.ref)).resolves.toBeNull()
      await expect(brokerCodeRegistry.readBuiltCapability(descriptorValue.ref)).resolves.toBeNull()
    }
  })

  it.each(OKX_READONLY_CAPABILITIES.map((entry) => entry.ref.providerCapabilityId as OkxMinimalProbeCapabilityId))(
    'plans %s only through the isolated candidate registry',
    async (capabilityId) => {
      const planned = await planProbe(capabilityId)
      expect(planned.plan).toMatchObject({
        method: 'GET',
        httpsOrigin: OKX_EEA_DEMO_ORIGIN,
        port: 443,
        redirectMode: 'error',
        planContractVersion: OKX_ADAPTER_PLAN_CONTRACT_VERSION,
        pageSequence: 0,
      })
      expect(JSON.stringify(planned)).not.toMatch(/api.?key|secret|passphrase/i)
    },
  )

  it('keeps non-test and unconfigured runtime modes fail-closed', () => {
    expect(resolveOkxCandidateRuntimeMode({ nodeEnv: 'production', configuredMode: 'synthetic_test' })).toBe('off')
    expect(resolveOkxCandidateRuntimeMode({ nodeEnv: 'test', configuredMode: 'probe' })).toBe('off')
    expect(resolveOkxCandidateRuntimeMode({ nodeEnv: 'test', configuredMode: 'synthetic_test' })).toBe('synthetic_test')
  })

  it('enforces the test environment again at the executable runtime boundary', async () => {
    const testHarness = harness()
    const deps = dependencies()
    vi.stubEnv('NODE_ENV', 'production')
    try {
      await expect(runOkxSyntheticCandidateProbe(testHarness.input, deps.value))
        .rejects.toMatchObject({ code: 'runtime_disabled' })
      expect(deps.control.calls()).toBe(0)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('exposes only the synthetic documentation-IP policy and no public-routability classifier', () => {
    expect(isBrokerIpAddressSyntax('192.0.2.10')).toBe(true)
    expect(isBrokerIpAddressSyntax('2001:db8::10')).toBe(true)
    expect(isBrokerIpAddressSyntax('::ffff:192.0.2.10')).toBe(true)
    expect(isBrokerIpAddressSyntax('192.168.001.1')).toBe(false)
    expect(isBrokerIpAddressSyntax('2001:db8::10::20')).toBe(false)
    expect(isBrokerIpAddressSyntax('192.0.2.1::')).toBe(false)
    expect(isBrokerIpAddressSyntax('fe80::1%25eth0')).toBe(false)

    expect(canonicalizeBrokerEgressIpAddress('192.0.2.10', 'synthetic_documentation')).toBe('192.0.2.10')
    expect(canonicalizeBrokerEgressIpAddress('2001:0DB8:0:0:0:0:0:10', 'synthetic_documentation')).toBe('2001:db8::10')
    for (const prohibited of [
      '0.0.0.0', '0.0.0.1', '8.8.8.8', '127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.1.1', '172.16.0.1',
      '192.168.0.1', '198.18.0.1', '224.0.0.1', '::', '::1', '::192.0.2.10',
      '::ffff:192.0.2.10', 'fc00::1', 'fe80::1', 'ff02::1', '\u00a0192.0.2.10',
    ]) {
      expect(canonicalizeBrokerEgressIpAddress(prohibited, 'synthetic_documentation')).toBeNull()
    }
    expect(canonicalizeBrokerEgressIpSet(
      ['2001:0db8::10', '2001:db8::10'],
      'synthetic_documentation',
    )).toBeNull()
  })

  it('executes the exact three-response synthetic slice without fetch, credentials, apply, capture or import', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const testHarness = harness()
    const deps = dependencies()
    const result = await runOkxSyntheticCandidateProbe(testHarness.input, deps.value)
    expect(result).toMatchObject({
      status: 'synthetic_pass',
      transportKind: 'synthetic_fixture_no_network',
      providerCode: 'okx',
      accountClass: 'main',
      positionMode: 'net_mode',
      selectedInstrumentCount: 2,
      observedFillCount: 2,
      permitsConsumed: 3,
      connectionActivated: false,
      credentialsPersisted: false,
      captureStarted: false,
      importStarted: false,
      providerSupportedClaim: false,
      productionReadyClaim: false,
      commercialUseAuthorizedClaim: false,
    })
    expect(result.responseEvidenceDigests).toHaveLength(3)
    expect(deps.control.calls()).toBe(3)
    expect(deps.control.issueCalls()).toBe(2)
    const materializedPermits = [testHarness.input.initialPermit, ...deps.control.issuedPermits()]
    expect(materializedPermits).toHaveLength(3)
    for (const permitValue of materializedPermits) {
      expect(Object.keys(permitValue).toSorted()).toEqual([...MB56_PERMIT_KEYS].toSorted())
    }
    expect(testHarness.input.initialPermit).toMatchObject({
      authorityGeneration: 1,
      predecessorResponseEvidenceSha256: null,
      observedProviderPermAndIpProjectionSha256: null,
      observedAccountIdentitySha256: null,
    })
    expect(deps.control.issuedPermits()).toEqual(expect.arrayContaining([
      expect.objectContaining({ authorityGeneration: 2 }),
      expect.objectContaining({ authorityGeneration: 3 }),
    ]))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toMatch(/700000001|192\.0\.2\.10|AAA-USDT-SWAP|OK-ACCESS/i)
    vi.unstubAllGlobals()
  })

  it('keeps issuance state in the control plane and rejects pre-consumption or duplicate issuance', async () => {
    const control = controlPlane()
    await expect(control.port.issuePermitForAcceptedTransition({} as never))
      .rejects.toMatchObject({ code: 'permit_rejected' })
    expect(control.issueCalls()).toBe(0)

    const testHarness = harness()
    const deps = dependencies(control)
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, deps.value))
      .resolves.toMatchObject({ status: 'synthetic_pass' })
    const firstIssueRequest = control.issueRequests()[0]
    await expect(control.port.issuePermitForAcceptedTransition(firstIssueRequest))
      .rejects.toMatchObject({ code: 'permit_rejected' })
    expect(control.issueCalls()).toBe(2)
  })

  it('uses owned snapshots when caller-owned authority and permit mutate during an awaited consume', async () => {
    const testHarness = harness()
    const mutableAuthority = {
      ...testHarness.input.authority,
      authorizedEgressIpSet: [...testHarness.input.authority.authorizedEgressIpSet],
    } as unknown as OkxSyntheticAuthority
    const mutableInitialPermit = { ...testHarness.input.initialPermit } as OkxSyntheticPermit
    const input = Object.freeze({
      ...testHarness.input,
      authority: mutableAuthority,
      initialPermit: mutableInitialPermit,
    })
    const control = controlPlane({
      duringConsume(permitValue) {
        if (permitValue.requestSequence === 1) {
          ;(mutableAuthority as unknown as { maximumTotalResponseBytes: number }).maximumTotalResponseBytes = 1
          ;(mutableInitialPermit as unknown as { deadlineAt: string }).deadlineAt = '2026-08-27T10:20:00.000Z'
        }
      },
    })
    await expect(runOkxSyntheticCandidateProbe(input, dependencies(control).value))
      .resolves.toMatchObject({ status: 'synthetic_pass', observedFillCount: 2 })
    expect(mutableAuthority.maximumTotalResponseBytes).toBe(1)
    expect(mutableInitialPermit.deadlineAt).toBe('2026-08-27T10:20:00.000Z')
  })

  it('freezes the authority snapshot supplied across the awaited issuance boundary', async () => {
    const testHarness = harness()
    const control = controlPlane({
      duringIssue(request) {
        ;(request.authority as unknown as { windowEndMs: string }).windowEndMs = '1787652002001'
      },
    })
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, dependencies(control).value))
      .rejects.toBeInstanceOf(TypeError)
    expect(control.issueCalls()).toBe(0)
  })

  it('freezes the validated permit snapshot across the awaited consume boundary', async () => {
    const testHarness = harness()
    const control = controlPlane({
      duringConsume(permitValue) {
        ;(permitValue as unknown as { deadlineAt: string }).deadlineAt = '2026-08-27T10:20:00.000Z'
      },
    })
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, dependencies(control).value))
      .rejects.toBeInstanceOf(TypeError)
    expect(control.calls()).toBe(0)
  })

  it('blocks runtime-off before consuming a permit', async () => {
    const testHarness = harness()
    const deps = dependencies()
    await expect(runOkxSyntheticCandidateProbe({ ...testHarness.input, runtimeMode: 'off' }, deps.value))
      .rejects.toMatchObject({ code: 'runtime_disabled' })
    expect(deps.control.calls()).toBe(0)
  })

  it('rejects additive authority claims before permit consumption', async () => {
    const testHarness = harness()
    const { authorityDigest: _digest, ...authorityWithoutDigest } = testHarness.input.authority
    const additiveAuthority = {
      ...authorityWithoutDigest,
      unboundClaim: 'must-not-be-accepted',
    }
    const poisonedAuthority = {
      ...additiveAuthority,
      authorityDigest: computeCanonicalBrokerValueDigest(additiveAuthority as unknown as CanonicalJsonValue),
    }
    const deps = dependencies()
    await expect(runOkxSyntheticCandidateProbe({
      ...testHarness.input,
      authority: poisonedAuthority as unknown as OkxSyntheticAuthority,
    }, deps.value)).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
    expect(deps.control.calls()).toBe(0)
  })

  it('rejects non-string authority, permit and receipt identifiers before they can authorize progress', async () => {
    const authorityHarness = harness()
    const invalidAuthority = Object.freeze({
      ...authorityHarness.input.authority,
      accountConnectionId: 42 as never,
    }) as OkxSyntheticAuthority
    await expect(runOkxSyntheticCandidateProbe(Object.freeze({
      ...authorityHarness.input,
      authority: invalidAuthority,
    }), dependencies().value)).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })

    const permitHarness = harness()
    const invalidPermit = Object.freeze({
      ...permitHarness.input.initialPermit,
      permitId: Object.freeze({ value: 'okx-synthetic-permit-1' }),
    }) as unknown as OkxSyntheticPermit
    const permitDeps = dependencies()
    await expect(runOkxSyntheticCandidateProbe(Object.freeze({
      ...permitHarness.input,
      initialPermit: invalidPermit,
    }), permitDeps.value)).rejects.toMatchObject({ code: 'permit_rejected' })
    expect(permitDeps.control.calls()).toBe(0)

    const receiptHarness = harness()
    const receiptControl = controlPlane({
      mutateReceipt(receipt) {
        return Object.freeze({
          ...receipt,
          transactionId: Object.freeze({ value: receipt.transactionId }),
        }) as unknown as OkxSyntheticPermitReceipt
      },
    })
    await expect(runOkxSyntheticCandidateProbe(receiptHarness.input, dependencies(receiptControl).value))
      .rejects.toMatchObject({ code: 'permit_rejected' })
  })

  it('binds each consumption receipt to the complete canonical permit digest', async () => {
    const testHarness = harness()
    const control = controlPlane({
      mutateReceipt(receipt) {
        return Object.freeze({ ...receipt, permitSha256: '0'.repeat(64) })
      },
    })
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, dependencies(control).value))
      .rejects.toMatchObject({ code: 'permit_rejected' })
  })

  it('rejects a history window outside the documented three-month retention before permit consumption', async () => {
    const testHarness = harness()
    const expiredAuthority = rebindAuthority(testHarness.input.authority, {
      windowStartMs: String(Date.parse('2026-04-01T00:00:00.000Z')),
      windowEndMs: String(Date.parse('2026-04-07T00:00:00.000Z')),
    })
    const deps = dependencies()
    await expect(runOkxSyntheticCandidateProbe({
      ...testHarness.input,
      authority: expiredAuthority,
    }, deps.value)).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
    expect(deps.control.calls()).toBe(0)
  })

  it('rejects trusted-clock rollback immediately after the first atomic permit consumption', async () => {
    const testHarness = harness()
    const clockValues = [TRUSTED_NOW, TRUSTED_NOW, TRUSTED_NOW - 1]
    let clockIndex = 0
    const deps = dependencies(controlPlane(), () => clockValues[clockIndex++] ?? TRUSTED_NOW - 1)
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, deps.value))
      .rejects.toMatchObject({ code: 'runtime_disabled' })
    expect(deps.control.calls()).toBe(1)
  })

  it('rejects a pre-issued second-generation permit before consuming it', async () => {
    const testHarness = harness()
    const control = controlPlane({
      mutateIssuedPermit(permitValue, request) {
        return request.requestSequence === 2
          ? Object.freeze({ ...permitValue, issuedAt: '2026-08-27T10:20:20.400Z' })
          : permitValue
      },
    })
    const deps = dependencies(control)
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, deps.value))
      .rejects.toMatchObject({ code: 'permit_rejected' })
    expect(deps.control.calls()).toBe(1)
    expect(deps.control.issueCalls()).toBe(1)
  })

  it('rejects a second-generation permit without the observed bootstrap digests', async () => {
    const testHarness = harness()
    const control = controlPlane({
      mutateIssuedPermit(permitValue, request) {
        return request.requestSequence === 2
          ? Object.freeze({
            ...permitValue,
            observedProviderPermAndIpProjectionSha256: null,
            observedAccountIdentitySha256: null,
          }) as OkxSyntheticPermit
          : permitValue
      },
    })
    const deps = dependencies(control)
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, deps.value))
      .rejects.toMatchObject({ code: 'permit_rejected' })
    expect(deps.control.calls()).toBe(1)
    expect(deps.control.issueCalls()).toBe(1)
  })

  it('blocks an account/IP observation mismatch before permit two can be consumed', async () => {
    const testHarness = harness(({ responses }) => {
      const account = fixture('positive_account_config_main_net')
      const body = structuredClone(account.response.body)
      ;(body.data as Array<Record<string, unknown>>)[0].ip = '192.0.2.11'
      responses[0] = response(
        { ...account, response: { ...account.response, body } },
        'probe_account_config',
        1,
        '2026-08-27T10:20:20.000Z',
        '2026-08-27T10:20:20.500Z',
      )
    })
    const deps = dependencies()
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, deps.value))
      .rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
    expect(deps.control.calls()).toBe(1)
    expect(deps.control.issueCalls()).toBe(0)
  })

  it('rejects accessor, symbol and non-enumerable additions on the response array without executing an accessor', async () => {
    const testHarness = harness()
    const getter = vi.fn(() => testHarness.input.responses[0])
    const accessorResponses = new Array<OkxSyntheticResponse>(3)
    Object.defineProperty(accessorResponses, '0', { enumerable: true, configurable: true, get: getter })
    Object.defineProperty(accessorResponses, '1', { enumerable: true, configurable: true, value: testHarness.input.responses[1] })
    Object.defineProperty(accessorResponses, '2', { enumerable: true, configurable: true, value: testHarness.input.responses[2] })
    const symbolResponses = [...testHarness.input.responses]
    Object.defineProperty(symbolResponses, Symbol('unbound'), { value: true })
    const hiddenResponses = [...testHarness.input.responses]
    Object.defineProperty(hiddenResponses, 'unbound', { value: true })

    for (const responses of [accessorResponses, symbolResponses, hiddenResponses]) {
      const deps = dependencies()
      await expect(runOkxSyntheticCandidateProbe({
        ...testHarness.input,
        responses,
      }, deps.value)).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
      expect(deps.control.calls()).toBe(0)
    }
    expect(getter).not.toHaveBeenCalled()
  })

  it('rejects nested proxy inputs and executable dependency accessors without invoking their traps', async () => {
    const responseHarness = harness()
    const responseTrap = vi.fn()
    const proxiedResponses = new Proxy([...responseHarness.input.responses], { get: responseTrap })
    await expect(runOkxSyntheticCandidateProbe(Object.freeze({
      ...responseHarness.input,
      responses: proxiedResponses,
    }) as OkxSyntheticProbeInput, dependencies().value)).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
    expect(responseTrap).not.toHaveBeenCalled()

    const authorityHarness = harness()
    const ipTrap = vi.fn()
    const proxiedIps = new Proxy([...authorityHarness.input.authority.authorizedEgressIpSet], { get: ipTrap })
    const proxiedIpAuthority = Object.freeze({
      ...authorityHarness.input.authority,
      authorizedEgressIpSet: proxiedIps,
    }) as OkxSyntheticAuthority
    await expect(runOkxSyntheticCandidateProbe(Object.freeze({
      ...authorityHarness.input,
      authority: proxiedIpAuthority,
    }), dependencies().value)).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
    expect(ipTrap).not.toHaveBeenCalled()

    const portHarness = harness()
    const clockGetter = vi.fn(() => TRUSTED_NOW)
    const accessorClock = {}
    Object.defineProperty(accessorClock, 'nowEpochMs', { enumerable: true, configurable: true, get: clockGetter })
    await expect(runOkxSyntheticCandidateProbe(portHarness.input, Object.freeze({
      trustedClock: accessorClock as never,
      permitControlPlane: controlPlane().port,
    }))).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
    expect(clockGetter).not.toHaveBeenCalled()
  })

  it('rejects own bind accessors or overrides on executable port functions without reading them', async () => {
    for (const bindDescriptor of [
      { get: vi.fn(() => Function.prototype.bind) },
      { value: vi.fn(() => () => TRUSTED_NOW) },
    ]) {
      const testHarness = harness()
      const clockFunction = () => TRUSTED_NOW
      Object.defineProperty(clockFunction, 'bind', {
        enumerable: false,
        configurable: true,
        ...bindDescriptor,
      })
      await expect(runOkxSyntheticCandidateProbe(testHarness.input, Object.freeze({
        trustedClock: Object.freeze({ nowEpochMs: clockFunction }),
        permitControlPlane: controlPlane().port,
      }))).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
      expect('get' in bindDescriptor ? bindDescriptor.get : bindDescriptor.value).not.toHaveBeenCalled()
    }
  })

  it('rejects a proxied control plane or proxied port method without invoking proxy traps', async () => {
    const controlPlaneHarness = harness()
    const control = controlPlane()
    const controlPlaneTrap = vi.fn()
    const proxiedControlPlane = new Proxy(control.port, {
      get: controlPlaneTrap,
      getPrototypeOf: controlPlaneTrap,
      ownKeys: controlPlaneTrap,
    })
    await expect(runOkxSyntheticCandidateProbe(controlPlaneHarness.input, Object.freeze({
      trustedClock: Object.freeze({ nowEpochMs: () => TRUSTED_NOW }),
      permitControlPlane: proxiedControlPlane,
    }))).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
    expect(controlPlaneTrap).not.toHaveBeenCalled()

    const methodHarness = harness()
    const methodControl = controlPlane()
    const methodTrap = vi.fn()
    const proxiedIssueMethod = new Proxy(methodControl.port.issuePermitForAcceptedTransition, {
      apply: methodTrap,
      get: methodTrap,
      getPrototypeOf: methodTrap,
      ownKeys: methodTrap,
    })
    const portWithProxiedMethod = Object.freeze({
      ...methodControl.port,
      issuePermitForAcceptedTransition: proxiedIssueMethod,
    })
    await expect(runOkxSyntheticCandidateProbe(methodHarness.input, Object.freeze({
      trustedClock: Object.freeze({ nowEpochMs: () => TRUSTED_NOW }),
      permitControlPlane: portWithProxiedMethod,
    }))).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
    expect(methodTrap).not.toHaveBeenCalled()
  })

  it('rejects an accessor-backed raw response body without executing the accessor', async () => {
    const testHarness = harness()
    const originalRawBody = testHarness.input.responses[0].rawBody
    const accessorRawBody = [...originalRawBody]
    const getter = vi.fn(() => originalRawBody[0])
    Object.defineProperty(accessorRawBody, '0', { enumerable: true, configurable: true, get: getter })
    const responses = [...testHarness.input.responses]
    responses[0] = Object.freeze({ ...responses[0], rawBody: accessorRawBody })
    const deps = dependencies()
    await expect(runOkxSyntheticCandidateProbe({
      ...testHarness.input,
      responses: Object.freeze(responses),
    }, deps.value)).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
    expect(deps.control.calls()).toBe(0)
    expect(getter).not.toHaveBeenCalled()
  })

  it('rejects an accessor-backed nested authority IP list before hashing the authority', async () => {
    const testHarness = harness()
    const authorityIps = [...testHarness.input.authority.authorizedEgressIpSet]
    const getter = vi.fn(() => testHarness.input.authority.authorizedEgressIpSet[0])
    Object.defineProperty(authorityIps, '0', { enumerable: true, configurable: true, get: getter })
    const poisonedAuthority = Object.freeze({
      ...testHarness.input.authority,
      authorizedEgressIpSet: authorityIps,
    }) as OkxSyntheticAuthority
    const deps = dependencies()
    await expect(runOkxSyntheticCandidateProbe({
      ...testHarness.input,
      authority: poisonedAuthority,
    }, deps.value)).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
    expect(deps.control.calls()).toBe(0)
    expect(getter).not.toHaveBeenCalled()
  })

  it('rejects caller-owned symbol behavior on the identity key before copying it', async () => {
    const testHarness = harness()
    const identityKey = Uint8Array.from(testHarness.input.identityKeyMaterial)
    const getter = vi.fn(() => Uint8Array.prototype[Symbol.iterator])
    Object.defineProperty(identityKey, Symbol.iterator, { configurable: true, get: getter })
    const deps = dependencies()
    await expect(runOkxSyntheticCandidateProbe({
      ...testHarness.input,
      identityKeyMaterial: identityKey,
    }, deps.value)).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
    expect(deps.control.calls()).toBe(0)
    expect(getter).not.toHaveBeenCalled()
  })

  it('rejects an own byteLength accessor on a real identity Uint8Array without executing it', async () => {
    const testHarness = harness()
    const identityKey = Uint8Array.from(IDENTITY_KEY)
    const getter = vi.fn(() => 32)
    Object.defineProperty(identityKey, 'byteLength', { configurable: true, get: getter })
    await expect(runOkxSyntheticCandidateProbe(Object.freeze({
      ...testHarness.input,
      identityKeyMaterial: identityKey,
    }), dependencies().value)).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
    expect(getter).not.toHaveBeenCalled()
  })

  it('rejects object-valued SHA claims without invoking Symbol.toPrimitive', async () => {
    const coercion = vi.fn(() => '0'.repeat(64))
    const coerciveSha = Object.freeze({ [Symbol.toPrimitive]: coercion })

    const authorityHarness = harness()
    const invalidAuthority = Object.freeze({
      ...authorityHarness.input.authority,
      authorityDigest: coerciveSha,
    }) as unknown as OkxSyntheticAuthority
    await expect(runOkxSyntheticCandidateProbe(Object.freeze({
      ...authorityHarness.input,
      authority: invalidAuthority,
    }), dependencies().value)).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })

    const permitHarness = harness()
    const invalidPermit = Object.freeze({
      ...permitHarness.input.initialPermit,
      authoritySnapshotSha256: coerciveSha,
    }) as unknown as OkxSyntheticPermit
    await expect(runOkxSyntheticCandidateProbe(Object.freeze({
      ...permitHarness.input,
      initialPermit: invalidPermit,
    }), dependencies().value)).rejects.toMatchObject({ code: 'permit_rejected' })

    const receiptHarness = harness()
    const receiptControl = controlPlane({
      mutateReceipt(receipt) {
        return Object.freeze({ ...receipt, permitSha256: coerciveSha }) as unknown as OkxSyntheticPermitReceipt
      },
    })
    await expect(runOkxSyntheticCandidateProbe(receiptHarness.input, dependencies(receiptControl).value))
      .rejects.toMatchObject({ code: 'permit_rejected' })
    expect(coercion).not.toHaveBeenCalled()
  })

  it('rejects a proxied scalar authority claim before canonical digest traversal', async () => {
    const testHarness = harness()
    const getPrototypeOf = vi.fn(() => Object.prototype)
    const ownKeys = vi.fn(() => [])
    const getOwnPropertyDescriptor = vi.fn(() => undefined)
    const proxiedSha = new Proxy(Object.freeze({}), {
      getPrototypeOf,
      ownKeys,
      getOwnPropertyDescriptor,
    })
    const invalidAuthority = Object.freeze({
      ...testHarness.input.authority,
      expectedAccountIdentityDigest: proxiedSha,
    }) as unknown as OkxSyntheticAuthority

    const deps = dependencies()
    await expect(runOkxSyntheticCandidateProbe(Object.freeze({
      ...testHarness.input,
      authority: invalidAuthority,
    }), deps.value)).rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
    expect(deps.control.calls()).toBe(0)

    const { authorityDigest: _authorityDigest, ...digestInput } = invalidAuthority
    expect(() => computeOkxSyntheticAuthorityDigest(digestInput)).toThrowError(OkxCandidateError)
    expect(getPrototypeOf).not.toHaveBeenCalled()
    expect(ownKeys).not.toHaveBeenCalled()
    expect(getOwnPropertyDescriptor).not.toHaveBeenCalled()
  })

  it('rejects permit replay across repeated runner executions against the same stateful control plane', async () => {
    const testHarness = harness()
    const deps = dependencies()
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, deps.value)).resolves.toMatchObject({ status: 'synthetic_pass' })
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, deps.value)).rejects.toMatchObject({ code: 'permit_rejected' })
    expect(deps.control.calls()).toBe(3)
  })

  it('closes the directly exported response inspector against outer, query, byte-array and proxy execution', () => {
    const account = fixture('positive_account_config_main_net')
    const accountBytes = rawBody(account.response.body)

    const outerGetter = vi.fn(() => 200)
    const accessorOuter = {
      capabilityId: 'okx_account_config_v1',
      rawBody: accountBytes,
      canonicalQuery: {},
    }
    Object.defineProperty(accessorOuter, 'httpStatus', { enumerable: true, configurable: true, get: outerGetter })
    expect(() => inspectOkxSyntheticMinimalProbeResponse(accessorOuter as never)).toThrowError(OkxCandidateError)
    expect(outerGetter).not.toHaveBeenCalled()

    const byteGetter = vi.fn(() => accountBytes[0])
    const accessorBytes = new Array(accountBytes.length).fill(0)
    Object.defineProperty(accessorBytes, '0', { enumerable: true, configurable: true, get: byteGetter })
    expect(() => inspectOkxSyntheticMinimalProbeResponse({
      capabilityId: 'okx_account_config_v1',
      httpStatus: 200,
      rawBody: accessorBytes,
      canonicalQuery: {},
    })).toThrowError(OkxCandidateError)
    expect(byteGetter).not.toHaveBeenCalled()

    const queryGetter = vi.fn(() => 'SWAP')
    const accessorQuery = {}
    Object.defineProperty(accessorQuery, 'instType', { enumerable: true, configurable: true, get: queryGetter })
    const instruments = fixture('positive_multiple_eligible_and_filtered_swap_instruments')
    expect(() => inspectOkxSyntheticMinimalProbeResponse({
      capabilityId: 'okx_account_instruments_swap_v1',
      httpStatus: 200,
      rawBody: rawBody(instruments.response.body),
      canonicalQuery: accessorQuery as never,
    })).toThrowError(OkxCandidateError)
    expect(queryGetter).not.toHaveBeenCalled()

    const proxyTrap = vi.fn()
    const proxiedOuter = new Proxy({
      capabilityId: 'okx_account_config_v1' as const,
      httpStatus: 200,
      rawBody: accountBytes,
      canonicalQuery: {},
    }, { get: proxyTrap, getPrototypeOf: proxyTrap, ownKeys: proxyTrap })
    expect(() => inspectOkxSyntheticMinimalProbeResponse(proxiedOuter)).toThrowError(OkxCandidateError)
    expect(proxyTrap).not.toHaveBeenCalled()
  })

  it('rejects duplicate JSON members before semantic parsing', () => {
    const duplicated = new TextEncoder().encode(
      '{"code":"0","msg":"","data":[{"uid":"700000001","uid":"700000002","mainUid":"700000001","acctLv":"2","posMode":"net_mode","perm":"read_only","ip":"192.0.2.10"}]}',
    )
    expect(() => inspectOkxSyntheticMinimalProbeResponse({
      capabilityId: 'okx_account_config_v1',
      httpStatus: 200,
      rawBody: [...duplicated],
      canonicalQuery: {},
    })).toThrowError(OkxCandidateError)
  })

  it('rejects non-byte wire values before UTF-8 decoding', () => {
    expect(() => inspectOkxSyntheticMinimalProbeResponse({
      capabilityId: 'okx_account_config_v1',
      httpStatus: 200,
      rawBody: [123, 34, 256, 125],
      canonicalQuery: {},
    })).toThrowError(OkxCandidateError)
  })

  it.each([
    ['uid', 700000001],
    ['mainUid', 700000001],
    ['acctLv', 2],
  ] as const)('rejects a numeric account field %s without relying on another invalid field', (field, numericValue) => {
    const account = fixture('positive_account_config_main_net')
    const accountBody = structuredClone(account.response.body)
    const accountRecord = (accountBody.data as Array<Record<string, unknown>>)[0]
    accountRecord[field] = numericValue
    expect(() => inspectOkxSyntheticMinimalProbeResponse({
      capabilityId: 'okx_account_config_v1',
      httpStatus: 200,
      rawBody: rawBody(accountBody),
      canonicalQuery: {},
    })).toThrowError(OkxCandidateError)
  })

  it.each([
    ['tradeId', 1001],
    ['billId', 5001],
    ['ordId', 9001],
  ] as const)('rejects a numeric fill field %s without relying on another invalid field', (field, numericValue) => {
    const fills = fixture('positive_fills_across_two_eligible_instruments')
    const fillBody = structuredClone(fills.response.body)
    const fillRecord = (fillBody.data as Array<Record<string, unknown>>)[0]
    fillRecord[field] = numericValue
    expect(() => inspectOkxSyntheticMinimalProbeResponse({
      capabilityId: 'okx_fills_history_swap_v1',
      httpStatus: 200,
      rawBody: rawBody(fillBody),
      canonicalQuery: {
        begin: WINDOW_START,
        end: WINDOW_END,
        instType: 'SWAP',
        limit: '10',
      },
    })).toThrowError(OkxCandidateError)
  })

  it('rejects cross-capability instrument references even when every individual envelope is valid', async () => {
    const testHarness = harness(({ responses }) => {
      const fills = fixture('positive_fills_across_two_eligible_instruments')
      const body = structuredClone(fills.response.body)
      ;(body.data as Array<Record<string, string>>)[0].instId = 'ZZZ-USDT-SWAP'
      responses[2] = response(
        { ...fills, response: { ...fills.response, body } },
        'probe_fills_history',
        3,
        '2026-08-27T10:20:22.000Z',
        '2026-08-27T10:20:22.500Z',
      )
    })
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, dependencies().value))
      .rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
  })

  it('rejects response overlap before claiming an aggregate success', async () => {
    const testHarness = harness(({ responses }) => {
      responses[1] = Object.freeze({
        ...responses[1],
        requestStartedAt: '2026-08-27T10:20:20.400Z',
      })
    })
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, dependencies().value))
      .rejects.toMatchObject({ code: 'budget_rejected' })
  })

  it('accepts an observed empty fill page without making a completeness claim', async () => {
    const testHarness = harness(({ responses }) => {
      const fills = fixture('positive_fills_across_two_eligible_instruments')
      const body = structuredClone(fills.response.body)
      body.data = []
      responses[2] = response(
        { ...fills, response: { ...fills.response, body } },
        'probe_fills_history',
        3,
        '2026-08-27T10:20:22.000Z',
        '2026-08-27T10:20:22.500Z',
      )
    })
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, dependencies().value))
      .resolves.toMatchObject({ observedFillCount: 0, productionReadyClaim: false })
  })

  it('rejects long or short fill sides while account config remains net_mode', async () => {
    const testHarness = harness(({ responses }) => {
      const fills = fixture('positive_fills_across_two_eligible_instruments')
      const fillBody = structuredClone(fills.response.body)
      ;(fillBody.data as Array<Record<string, unknown>>)[0].posSide = 'long'
      responses[2] = response(
        { ...fills, response: { ...fills.response, body: fillBody } },
        'probe_fills_history',
        3,
        '2026-08-27T10:20:22.000Z',
        '2026-08-27T10:20:22.500Z',
      )
    })
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, dependencies().value))
      .rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
  })

  it('rejects net fill sides when account config reports long_short_mode', async () => {
    const testHarness = harness(({ responses }) => {
      const account = fixture('positive_account_config_main_net')
      const accountBody = structuredClone(account.response.body)
      ;(accountBody.data as Array<Record<string, unknown>>)[0].posMode = 'long_short_mode'
      responses[0] = response(
        { ...account, response: { ...account.response, body: accountBody } },
        'probe_account_config',
        1,
        '2026-08-27T10:20:20.000Z',
        '2026-08-27T10:20:20.500Z',
      )
    })
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, dependencies().value))
      .rejects.toMatchObject({ code: 'aggregate_contract_rejected' })
  })

  it('accepts long/short fill sides only when account config reports long_short_mode', async () => {
    const testHarness = harness(({ responses }) => {
      const account = fixture('positive_account_config_main_net')
      const accountBody = structuredClone(account.response.body)
      ;(accountBody.data as Array<Record<string, unknown>>)[0].posMode = 'long_short_mode'
      responses[0] = response(
        { ...account, response: { ...account.response, body: accountBody } },
        'probe_account_config',
        1,
        '2026-08-27T10:20:20.000Z',
        '2026-08-27T10:20:20.500Z',
      )

      const fills = fixture('positive_fills_across_two_eligible_instruments')
      const fillBody = structuredClone(fills.response.body)
      const rows = fillBody.data as Array<Record<string, unknown>>
      rows[0].posSide = 'long'
      rows[1].posSide = 'short'
      responses[2] = response(
        { ...fills, response: { ...fills.response, body: fillBody } },
        'probe_fills_history',
        3,
        '2026-08-27T10:20:22.000Z',
        '2026-08-27T10:20:22.500Z',
      )
    })
    await expect(runOkxSyntheticCandidateProbe(testHarness.input, dependencies().value))
      .resolves.toMatchObject({ positionMode: 'long_short_mode', observedFillCount: 2 })
  })

  it('keeps capture methods unavailable on the local candidate adapter', () => {
    expect(() => okxReadonlyCandidateAdapter.prepareReadPlan({} as never)).toThrowError(OkxCandidateError)
    expect(() => okxReadonlyCandidateAdapter.mapRawEvents({} as never)).toThrowError(OkxCandidateError)
  })

  it('contains no probable credential in the complete MB6 local candidate scope', () => {
    const candidatePaths = [
      'components/broker-sync/broker-connection-panel.tsx',
      'components/broker-sync/broker-sync-hub.tsx',
      'components/broker-sync/providers/okx-candidate-status.tsx',
      'docs/architecture/EQUORA_v57.61.0_MB6_OKX_LOCAL_IMPLEMENTATION_CANDIDATE.md',
      'lib/server/broker-ip-address.ts',
      'lib/server/okx-candidate-runtime.ts',
      'lib/server/providers/okx-readonly-adapter.ts',
      'lib/types/broker-sync.ts',
      'tests/application-contracts.test.ts',
      'tests/broker-connection-view.test.ts',
      'tests/okx-mb6-synthetic-e2e.test.ts',
    ]
    const candidateText = candidatePaths.map((path) => readFileSync(resolve(process.cwd(), path), 'utf8')).join('\n')
    expect(broadSecretScanner(candidateText)).toEqual([])
  })
})

import 'server-only'
import { createHash } from 'node:crypto'
import { isProxy } from 'node:util/types'

declare const providerCodeBrand: unique symbol
declare const providerContractVersionBrand: unique symbol
declare const adapterVersionBrand: unique symbol
declare const captureChainBindingBrand: unique symbol
declare const probeChainBindingBrand: unique symbol
declare const brokerRequestBindingBrand: unique symbol
declare const brokerRequestAuthorizationBindingBrand: unique symbol
declare const pageObservationBindingBrand: unique symbol
declare const eventObservationBindingBrand: unique symbol
declare const uniqueEventBatchBrand: unique symbol
declare const nonEmptyProviderEventIdBrand: unique symbol
declare const validatedCaptureExecutionBrand: unique symbol
declare const validatedProbeExecutionBrand: unique symbol
declare const validatedCaptureWirePageBrand: unique symbol
declare const validatedConnectionProbeWireBrand: unique symbol
declare const validatedConnectionProbeResultBrand: unique symbol
declare const validatedProviderPageTransitionBrand: unique symbol
declare const validatedCaptureCommitBrand: unique symbol
declare const consumedCaptureExecutionBrand: unique symbol
declare const consumedProbeExecutionBrand: unique symbol

const AUTHORITY_TUPLE_CONTRACT_VERSION = 'equora-broker-authority-tuple-v1'
const BROKER_READ_PERMIT_CONTRACT_VERSION = 'equora-broker-read-permit-v1'
const PERMIT_CONSUMPTION_KEY_CONTRACT_VERSION = 'equora-broker-permit-consumption-key-v1'
export const CAPTURE_QUERY_PROFILE_DIGEST_CONTRACT_VERSION = 'equora-broker-capture-query-profile-digest-v1' as const
export const DESCRIPTOR_QUERY_DIGEST_CONTRACT_VERSION = 'equora-broker-descriptor-query-digest-v1' as const
export const PAGE_SEQUENCE_CONTRACT_VERSION = 'equora-zero-based-page-sequence-v1' as const
const GLOBAL_PERMIT_CONSUMPTION_SCOPE = 'global_request_authority_all_workers'
const MAX_CLOCK_SKEW_MS = 30_000
const validatedCaptureExecutions = new WeakSet<object>()
const validatedProbeExecutions = new WeakSet<object>()
const consumedCaptureExecutions = new WeakSet<object>()
const consumedProbeExecutions = new WeakSet<object>()
const validatedCaptureWirePages = new WeakSet<object>()
const validatedConnectionProbeWires = new WeakSet<object>()
const validatedConnectionProbeResults = new WeakSet<object>()
const validatedProviderPageTransitions = new WeakSet<object>()
const validatedCaptureCommits = new WeakSet<object>()
const uniqueCaptureEventBatches = new WeakSet<object>()
const egressWireExecutionBindings = new WeakMap<object, object>()
const captureWirePageBindings = new WeakMap<object, object>()
const inspectedCaptureWirePages = new WeakSet<object>()
const inspectedCapturePageWireBindings = new WeakMap<object, object>()
const inspectedProbeResultWireBindings = new WeakMap<object, object>()
const issuedBrokerSendAuthorizations = new WeakMap<object, Readonly<{
  plan: object
  consumeRuntimeAuthorityFenceAtTransport: () => Promise<void>
}>>()
const consumedBrokerSendAuthorizations = new WeakSet<object>()

export type ProviderCode = string & { readonly [providerCodeBrand]: true }
export type ProviderContractVersion = string & { readonly [providerContractVersionBrand]: true }
export type AdapterVersion = string & { readonly [adapterVersionBrand]: true }

export type ProviderReadMethod = 'GET'
export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | Readonly<{ [key: string]: CanonicalJsonValue }>
export type BrokerEnvironment = 'live' | 'demo'
export type BrokerRuntimeMode = 'off' | 'probe' | 'capture'
export type BrokerAuthorityPurpose = 'capture' | 'connection_probe'
export type BrokerRuntimeModeForPurpose<Purpose extends BrokerAuthorityPurpose> =
  Purpose extends 'capture' ? 'capture' : 'probe'

export type BrokerRuntimeAuthorityRef<Mode extends Exclude<BrokerRuntimeMode, 'off'>> = Readonly<{
  requiredMode: Mode
  runtimeConfigurationDigest: string
  deploymentIdentity: string
  runtimeAuthorityEpoch: number
}>

export type BrokerCapabilityKind =
  | 'instrument_metadata'
  | 'historical_orders'
  | 'historical_executions'
  | 'historical_positions'
  | 'funding_history'
  | 'account_identity'
  | 'permission_evidence'

export type ProviderCapabilityRef = Readonly<{
  providerCode: ProviderCode
  providerContractVersion: ProviderContractVersion
  adapterVersion: AdapterVersion
  capabilityKind: BrokerCapabilityKind
  providerCapabilityId: string
  providerCapabilityVersion: string
  capabilityDescriptorDigest: string
}>

export type CapabilityProfileRef = Readonly<{
  profileId: string
  profileVersion: string
  profileDigest: string
}>

export type CommonBrokerAuthorityPolicyPins = Readonly<{
  runtimePolicyVersion: string
  requestAuthorityPolicyVersion: string
  failurePolicyVersion: string
}>

export type CaptureAuthorityPolicyPins = Readonly<{
  claimPolicyVersion: string
  leasePolicyVersion: string
  checkpointPolicyVersion: string
}>

export type ConnectionProbeAuthorityPolicyPins = Readonly<{
  setupPolicyVersion: string
  probePolicyVersion: string
  ephemeralCredentialPolicyVersion: string
  applyPolicyVersion: string
}>

export type CommonBrokerAuthorityCore<
  Purpose extends BrokerAuthorityPurpose,
  Mode extends BrokerRuntimeModeForPurpose<Purpose>,
> = Readonly<{
  authorityTupleContractVersion: string
  authorityPurpose: Purpose
  userId: string
  environment: BrokerEnvironment
  runtimeAuthority: BrokerRuntimeAuthorityRef<Mode>
  provider: ProviderCapabilityRef
  capabilityProfile: CapabilityProfileRef
  commonPolicyPins: CommonBrokerAuthorityPolicyPins
  purposeScopeDigest: string
  purposeRequestSequence: number
}>

export type CaptureAuthorityTuple = CommonBrokerAuthorityCore<'capture', 'capture'> & Readonly<{
  authorityTupleDigest: string
  workUnitId: string
  expectedWorkUnitRowVersion: number
  claim: Readonly<{
    claimRequestId: string
    leaseId: string
    leaseEpoch: number
    leaseTokenDigest: string
  }>
  activation: Readonly<{
    id: string
    generation: number
    authorityEpoch: number
  }>
  account: Readonly<{
    brokerAccountId: string
    connectionAccountId: string
    identityDigest: string
    identityKeyVersion: string
  }>
  persistentCredentialReference: Readonly<{
    id: string
    keyVersion: string
    generation: number
  }>
  checkpointContractVersion: string
  capturePolicyPins: CaptureAuthorityPolicyPins
  captureBudget: Readonly<{
    pageLimit: number
    responseByteLimit: number
    requestDeadlineAt: string
  }>
}>

export type ConnectionProbeAuthorityTuple = CommonBrokerAuthorityCore<'connection_probe', 'probe'> & Readonly<{
  authorityTupleDigest: string
  setupCommandId: string
  expectedSetupCommandRowVersion: number
  setupRequestDigest: string
  connectionProbePolicyPins: ConnectionProbeAuthorityPolicyPins
  ephemeralCredentialSession: Readonly<{
    sessionId: string
    generation: number
    materialBindingMac: string
  }>
  probeBudget: Readonly<{
    cumulativeRequestLimit: number
    cumulativeRequestCountBefore: number
    responseByteLimit: number
    absoluteDeadlineAt: string
  }>
}>

export type BrokerAuthorityTupleForPurpose<Purpose extends BrokerAuthorityPurpose> =
  Purpose extends 'capture' ? CaptureAuthorityTuple : ConnectionProbeAuthorityTuple

export type ReadCapabilityDescriptor<Query, Cursor> = Readonly<{
  ref: ProviderCapabilityRef
  mutationContract: 'mutations_forbidden'
  methodContract: 'constant_read_method'
  constantMethod: ProviderReadMethod
  constantHttpsOrigin: string
  constantPort: 443
  constantPathTemplate: string
  authClass: 'public' | 'signed_read'
  dataClass: 'metadata' | 'account_history' | 'account_identity'
  queryContractVersion: string
  cursorContractVersion: string
  responseContractVersion: string
  pageSequenceContractVersion: typeof PAGE_SEQUENCE_CONTRACT_VERSION
  canonicalizeQuery(input: unknown): Query
  parseQuery(input: unknown): Query
  parseCursor(input: unknown): Cursor | null
  pageSequenceFromQuery(input: Query): number
}>

export type ReadCapabilityExecutionContract = Readonly<{
  ref: ProviderCapabilityRef
  mutationContract: 'mutations_forbidden'
  methodContract: 'constant_read_method'
  constantMethod: ProviderReadMethod
  constantHttpsOrigin: string
  constantPort: 443
  constantPathTemplate: string
  authClass: 'public' | 'signed_read'
  dataClass: 'metadata' | 'account_history' | 'account_identity'
  queryContractVersion: string
  cursorContractVersion: string
  responseContractVersion: string
  pageSequenceContractVersion: typeof PAGE_SEQUENCE_CONTRACT_VERSION
}>

export type ProviderCheckpoint = Readonly<{
  checkpointContractVersion: string
  captureQueryProfileDigest: string
  payload: CanonicalJsonValue
  mac: string
}>

export type CaptureChainBinding<ChainId extends string> = Readonly<{
  chainId: ChainId
  authorityPurpose: 'capture'
  authority: CaptureAuthorityTuple
  readonly [captureChainBindingBrand]: ChainId
}>

export type ConnectionProbeChainBinding<ChainId extends string> = Readonly<{
  chainId: ChainId
  authorityPurpose: 'connection_probe'
  authority: ConnectionProbeAuthorityTuple
  readonly [probeChainBindingBrand]: ChainId
}>

export type AnyBrokerChainBinding =
  | CaptureChainBinding<string>
  | ConnectionProbeChainBinding<string>

export type BrokerReadWorkUnit<Binding extends CaptureChainBinding<string>> = Readonly<{
  chainBinding: Binding
  integrityKeyReference: Readonly<{
    id: string
    keyVersion: string
  }>
  scope: Readonly<{
    instrumentScopeKey: string
    requestWindowStartUs: string
    requestWindowEndUs: string
    positionType: '1' | '2' | null
    captureQueryProfileDigest: string
  }>
  checkpoint: ProviderCheckpoint
}>

export type BrokerConnectionSetupCommand<CommandId extends string = string> = Readonly<{
  setupCommandContractVersion: 'equora-broker-connection-setup-command-v2'
  setupCommandId: CommandId
  expectedSetupCommandRowVersion: number
  userId: string
  environment: BrokerEnvironment
  provider: ProviderCapabilityRef
  capabilityProfile: CapabilityProfileRef
  descriptorQueryDigestContractVersion: typeof DESCRIPTOR_QUERY_DIGEST_CONTRACT_VERSION
  queryContractVersion: string
  canonicalDescriptorQueryDigest: string
  readOnlyAttestation: true
  probeBudget: Readonly<{
    cumulativeRequestLimit: number
    responseByteLimit: number
    absoluteDeadlineAt: string
  }>
  persistenceAuthority: 'secret_free_setup_command_only'
  credentialPersistenceAuthority: 'none_before_atomic_apply'
  captureAuthority: 'none'
  importAuthority: 'none'
}>

export type BrokerConnectionProbeWork<Binding extends ConnectionProbeChainBinding<string>> = Readonly<{
  chainBinding: Binding
  setupCommand: BrokerConnectionSetupCommand<Binding['authority']['setupCommandId']>
  requestInput: CanonicalJsonValue
}>

export type BrokerConnectionApplyCommand<
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<
    ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
    string
  >,
> = Readonly<{
  applyContractVersion: 'equora-broker-connection-apply-v1'
  setupCommandId: AuthorizationBinding['requestBinding']['chainBinding']['authority']['setupCommandId']
  expectedSetupCommandRowVersion: AuthorizationBinding['requestBinding']['chainBinding']['authority']['expectedSetupCommandRowVersion']
  authorizationBinding: AuthorizationBinding
  validatedProbeResultDigest: string
  ephemeralCredentialSessionId: AuthorizationBinding['requestBinding']['chainBinding']['authority']['ephemeralCredentialSession']['sessionId']
  requestedAt: string
  mutationAuthority: 'atomic_connection_and_encrypted_credential_apply_only'
  captureAuthority: 'none'
  importAuthority: 'none'
}>

export type BrokerConnectionApplyReceipt = Readonly<{
  receiptContractVersion: 'equora-broker-connection-apply-receipt-v1'
  setupCommandId: string
  connectionAccountId: string
  brokerAccountId: string
  activationId: string
  activationGeneration: number
  appliedAt: string
  credentialMaterialPersisted: 'encrypted_generation_bound'
  automaticCaptureStarted: false
  automaticImportStarted: false
}>

export interface BrokerConnectionApplyPort {
  applyConnectionAtomically(
    command: BrokerConnectionApplyCommand<any>,
  ): Promise<BrokerConnectionApplyReceipt>
}

export type BrokerRequestBinding<
  ChainBinding extends AnyBrokerChainBinding,
  RequestId extends string,
> = Readonly<{
  requestId: RequestId
  authorityPurpose: ChainBinding['authorityPurpose']
  chainBinding: ChainBinding
  canonicalUnsignedRequestDigest: string
  queryDigest: string
  purposeRequestSequence: ChainBinding['authority']['purposeRequestSequence']
  provider: ChainBinding['authority']['provider']
  capabilityProfile: ChainBinding['authority']['capabilityProfile']
  readonly [brokerRequestBindingBrand]: Readonly<[ChainBinding['chainId'], RequestId]>
}>

export type CaptureRequestBinding<
  ChainBinding extends CaptureChainBinding<string>,
  RequestId extends string,
> = BrokerRequestBinding<ChainBinding, RequestId>

export type ConnectionProbeRequestBinding<
  ChainBinding extends ConnectionProbeChainBinding<string>,
  RequestId extends string,
> = BrokerRequestBinding<ChainBinding, RequestId>

export type AnyBrokerRequestBinding =
  | CaptureRequestBinding<CaptureChainBinding<string>, string>
  | ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>

export type BrokerRequestAuthorizationBinding<
  RequestBinding extends AnyBrokerRequestBinding,
  RequestAuthorityId extends string,
> = Readonly<{
  requestAuthorityId: RequestAuthorityId
  authorityPurpose: RequestBinding['authorityPurpose']
  requestBinding: RequestBinding
  readonly [brokerRequestAuthorizationBindingBrand]: Readonly<[
    RequestBinding['chainBinding']['chainId'],
    RequestBinding['requestId'],
    RequestAuthorityId,
  ]>
}>

export type BrokerReadRequestPlan<Binding extends AnyBrokerRequestBinding> = Readonly<{
  authorityPurpose: Binding['authorityPurpose']
  authorityTupleDigest: Binding['chainBinding']['authority']['authorityTupleDigest']
  provider: Binding['provider']
  requestBinding: Binding
  method: ProviderReadMethod
  httpsOrigin: string
  port: 443
  pathTemplateId: string
  canonicalPath: string
  canonicalQuery: Readonly<Record<string, string>>
  redirectMode: 'error'
  responseByteLimit: number
  requestTimeoutMs: number
  planContractVersion: string
  pageSequenceContractVersion: typeof PAGE_SEQUENCE_CONTRACT_VERSION
  pageSequence: number
  canonicalUnsignedRequestDigest: Binding['canonicalUnsignedRequestDigest']
}>

export type BrokerReadRequestPlanDraft = Readonly<{
  provider: ProviderCapabilityRef
  method: ProviderReadMethod
  httpsOrigin: string
  port: 443
  pathTemplateId: string
  canonicalPath: string
  canonicalQuery: Readonly<Record<string, string>>
  redirectMode: 'error'
  responseByteLimit: number
  requestTimeoutMs: number
  planContractVersion: string
  pageSequenceContractVersion: typeof PAGE_SEQUENCE_CONTRACT_VERSION
  pageSequence: number
}>

export type PlannedCaptureBrokerRead<
  ChainBinding extends CaptureChainBinding<string>,
  RequestId extends string,
> = Readonly<{
  capabilityContract: ReadCapabilityExecutionContract
  requestBinding: CaptureRequestBinding<ChainBinding, RequestId>
  plan: BrokerReadRequestPlan<CaptureRequestBinding<ChainBinding, RequestId>>
}>

export type PlannedConnectionProbeBrokerRead<
  ChainBinding extends ConnectionProbeChainBinding<string>,
  RequestId extends string,
> = Readonly<{
  capabilityContract: ReadCapabilityExecutionContract
  requestBinding: ConnectionProbeRequestBinding<ChainBinding, RequestId>
  plan: BrokerReadRequestPlan<ConnectionProbeRequestBinding<ChainBinding, RequestId>>
}>

export type ProviderCheckpointAdvanceCandidate<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = Readonly<{
  pageBinding: PageBinding
  previousCheckpoint: ProviderCheckpoint
  nextCheckpointContractVersion: string
  nextCaptureQueryProfileDigest: string
  nextCheckpointPayload: CanonicalJsonValue
  status: 'next_page' | 'complete' | 'partial' | 'blocked'
}>

export type AdapterRawEventCandidate<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = Readonly<{
  pageBinding: PageBinding
  eventKind: CanonicalRawEventKind
  providerIdentity: ProviderEventIdentity
  providerRevision: string | null
  providerOccurredAtUs: string | null
  payload: CanonicalJsonValue
}>

export type AuthorizedBrokerReadPermit<
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<
    CaptureRequestBinding<CaptureChainBinding<string>, string>,
    string
  >,
> = Readonly<{
  authority: AuthorizationBinding['requestBinding']['chainBinding']['authority']
  canonicalUnsignedRequestDigest: AuthorizationBinding['requestBinding']['canonicalUnsignedRequestDigest']
  requestAuthorityId: AuthorizationBinding['requestAuthorityId']
  authorizationBinding: AuthorizationBinding
  permitContractVersion: 'equora-broker-read-permit-v1'
  singleUse: true
  issuedAt: string
  sendDeadlineAt: string
}>

export type AuthorizedConnectionProbePermit<
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<
    ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
    string
  >,
> = Readonly<{
  authority: AuthorizationBinding['requestBinding']['chainBinding']['authority']
  canonicalUnsignedRequestDigest: AuthorizationBinding['requestBinding']['canonicalUnsignedRequestDigest']
  requestAuthorityId: AuthorizationBinding['requestAuthorityId']
  authorizationBinding: AuthorizationBinding
  permitContractVersion: 'equora-broker-read-permit-v1'
  singleUse: true
  issuedAt: string
  sendDeadlineAt: string
}>

export type CaptureBrokerReadExecution<
  RequestBinding extends CaptureRequestBinding<CaptureChainBinding<string>, string>,
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
> = Readonly<{
  authorityPurpose: 'capture'
  capabilityContract: ReadCapabilityExecutionContract
  requestBinding: RequestBinding
  authorizationBinding: AuthorizationBinding
  plan: BrokerReadRequestPlan<RequestBinding>
  permit: AuthorizedBrokerReadPermit<AuthorizationBinding>
}>

export type ConnectionProbeBrokerReadExecution<
  RequestBinding extends ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
> = Readonly<{
  authorityPurpose: 'connection_probe'
  capabilityContract: ReadCapabilityExecutionContract
  requestBinding: RequestBinding
  authorizationBinding: AuthorizationBinding
  plan: BrokerReadRequestPlan<RequestBinding>
  permit: AuthorizedConnectionProbePermit<AuthorizationBinding>
}>

export type RuntimeValidatedCaptureBrokerReadExecution<
  RequestBinding extends CaptureRequestBinding<CaptureChainBinding<string>, string>,
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
> = CaptureBrokerReadExecution<RequestBinding, AuthorizationBinding> & Readonly<{
  readonly [validatedCaptureExecutionBrand]: true
}>

export type RuntimeValidatedConnectionProbeBrokerReadExecution<
  RequestBinding extends ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
> = ConnectionProbeBrokerReadExecution<RequestBinding, AuthorizationBinding> & Readonly<{
  readonly [validatedProbeExecutionBrand]: true
}>

export type RuntimeConsumedCaptureBrokerReadExecution<
  RequestBinding extends CaptureRequestBinding<CaptureChainBinding<string>, string>,
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
> = RuntimeValidatedCaptureBrokerReadExecution<RequestBinding, AuthorizationBinding> & Readonly<{
  readonly [consumedCaptureExecutionBrand]: true
}>

export type RuntimeConsumedConnectionProbeBrokerReadExecution<
  RequestBinding extends ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
> = RuntimeValidatedConnectionProbeBrokerReadExecution<RequestBinding, AuthorizationBinding> & Readonly<{
  readonly [consumedProbeExecutionBrand]: true
}>

export type BrokerWireResponse<
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<AnyBrokerRequestBinding, string>,
> = Readonly<{
  authorityPurpose: AuthorizationBinding['authorityPurpose']
  authorizationBinding: AuthorizationBinding
  methodEvidence: ProviderReadMethod
  originEvidence: string
  pathTemplateEvidence: string
  queryDigest: AuthorizationBinding['requestBinding']['queryDigest']
  startedAt: string
  receivedAt: string
  httpStatus: number
  rawBody: readonly number[]
  rawBodyDigest: string
  rawBodyBytes: number
}>

export type CanonicalRawEventKind =
  | 'order'
  | 'execution'
  | 'position_revision'
  | 'funding_event'
  | 'account_financial_event'
  | 'instrument_metadata'

export type NonEmptyProviderEventId = string & Readonly<{
  [nonEmptyProviderEventIdBrand]: true
}>

export type ProviderEventIdentity =
  | Readonly<{
    identityStatus: 'stable_provider_id'
    providerEventId: NonEmptyProviderEventId
    blockedIdentity: null
  }>
  | Readonly<{
    identityStatus: 'blocked_identity'
    providerEventId: null
    blockedIdentity: Readonly<{
      identityBlockContractVersion: string
      reasonCode: string
      identityFingerprint: string
    }>
  }>

export type CaptureCompletenessStatus =
  | 'page_observed_scope_open'
  | 'scope_complete_provider_claim_unverified'
  | 'partial_observation'
  | 'blocked_observation'

export type CaptureRequestEvidence<
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<
    CaptureRequestBinding<CaptureChainBinding<string>, string>,
    string
  >,
> = Readonly<{
  authorizationBinding: AuthorizationBinding
  methodEvidence: ProviderReadMethod
  originEvidence: string
  pathTemplateEvidence: string
  queryDigest: AuthorizationBinding['requestBinding']['queryDigest']
  startedAt: string
  receivedAt: string
  wireBodyDigest: string
  wireBodyBytes: number
}>

export type CapturePageObservationBinding<
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<
    CaptureRequestBinding<CaptureChainBinding<string>, string>,
    string
  >,
  PageObservationId extends string,
> = Readonly<{
  authorizationBinding: AuthorizationBinding
  pageObservationId: PageObservationId
  pageSequence: number
  observedAt: string
  pagePayloadDigest: string
  completenessStatus: CaptureCompletenessStatus
  readonly [pageObservationBindingBrand]: Readonly<[
    AuthorizationBinding['requestBinding']['chainBinding']['chainId'],
    AuthorizationBinding['requestBinding']['requestId'],
    AuthorizationBinding['requestAuthorityId'],
    PageObservationId,
  ]>
}>

export type CapturePageEvidence<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = Readonly<{
  pageBinding: PageBinding
  pagePayload: CanonicalJsonValue
}>

export type InspectedCapturePage<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = Readonly<{
  pageBinding: PageBinding
  responseContractVersion: string
  requestEvidence: CaptureRequestEvidence<PageBinding['authorizationBinding']>
  pageEvidence: CapturePageEvidence<PageBinding>
}>

export type CaptureWirePageCandidate<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = Readonly<{
  execution: RuntimeConsumedCaptureBrokerReadExecution<
    PageBinding['authorizationBinding']['requestBinding'],
    PageBinding['authorizationBinding']
  >
  wireResponse: BrokerWireResponse<PageBinding['authorizationBinding']>
  pageBinding: PageBinding
}>

export type RuntimeValidatedCaptureWirePage<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = CaptureWirePageCandidate<PageBinding> & Readonly<{
  readonly [validatedCaptureWirePageBrand]: true
}>

export type ConnectionProbeWireCandidate<
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<
    ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
    string
  >,
> = Readonly<{
  execution: RuntimeConsumedConnectionProbeBrokerReadExecution<
    AuthorizationBinding['requestBinding'],
    AuthorizationBinding
  >
  wireResponse: BrokerWireResponse<AuthorizationBinding>
}>

export type RuntimeValidatedConnectionProbeWire<
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<
    ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
    string
  >,
> = ConnectionProbeWireCandidate<AuthorizationBinding> & Readonly<{
  readonly [validatedConnectionProbeWireBrand]: true
}>

export type ConnectionProbeFindingCode =
  | 'provider_read_unavailable'
  | 'provider_response_contract_rejected'
  | 'read_permission_not_observed'
  | 'account_identity_not_observed'
  | 'provider_rate_limited'
  | 'provider_authentication_rejected'

export type ConnectionProbeCapabilityResultCandidate<
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<
    ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
    string
  >,
> = Readonly<{
  resultContractVersion: 'equora-connection-probe-result-v1'
  authorizationBinding: AuthorizationBinding
  provider: AuthorizationBinding['requestBinding']['provider']
  capabilityProfile: AuthorizationBinding['requestBinding']['capabilityProfile']
  responseContractVersion: string
  wireEvidenceDigest: string
  probeScopeDigest: string
  observedAt: string
  technicalReadResult: 'read_succeeded' | 'read_failed'
  permissionEvidenceResult: 'read_permission_observed' | 'not_observed' | 'blocked'
  accountIdentityResult: 'stable_identity_observed' | 'not_observed' | 'blocked'
  sanitizedFindings: readonly ConnectionProbeFindingCode[]
  persistenceAuthority: 'sanitized_probe_receipt_only'
  captureAuthority: 'none'
  normalizationAuthority: 'none'
  reconciliationAuthority: 'none'
  approvalAuthority: 'none'
  importAuthority: 'none'
}>

export type ConnectionProbeCapabilityResult<
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<
    ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
    string
  >,
> = ConnectionProbeCapabilityResultCandidate<AuthorizationBinding> & Readonly<{
  readonly [validatedConnectionProbeResultBrand]: true
}>

export type CaptureEventObservationBinding<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
  EventObservationId extends string,
> = Readonly<{
  pageBinding: PageBinding
  eventObservationId: EventObservationId
  eventOrdinal: number
  observedAt: string
  providerOccurredAtUs: string | null
  eventObservationDigest: string
  inheritedCompletenessStatus: PageBinding['completenessStatus']
  observationAuthority: 'provider_observed_unreconciled'
  readonly [eventObservationBindingBrand]: Readonly<[
    PageBinding['pageObservationId'],
    EventObservationId,
  ]>
}>

export type CanonicalRawEventInput<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
  EventObservationId extends string,
> = Readonly<{
  observationBinding: CaptureEventObservationBinding<PageBinding, EventObservationId>
  eventKind: CanonicalRawEventKind
  providerIdentity: ProviderEventIdentity
  providerRevision: string | null
  payloadEncoding: 'canonical_json_v1'
  payload: CanonicalJsonValue
  payloadDigest: string
  normalizationAuthority: 'blocked_pending_versioned_normalization'
  reconciliationAuthority: 'none'
  approvalAuthority: 'none'
  importAuthority: 'none'
}>

type EventObservationIdOf<Event> = Event extends CanonicalRawEventInput<
  CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
  infer EventObservationId
> ? EventObservationId : never

export type UniqueEventObservationTuple<
  Events extends readonly CanonicalRawEventInput<
    CapturePageObservationBinding<
      BrokerRequestAuthorizationBinding<
        CaptureRequestBinding<CaptureChainBinding<string>, string>,
        string
      >,
      string
    >,
    string
  >[],
  Seen extends string = never,
> = number extends Events['length']
  ? never
  : Events extends readonly [infer Head, ...infer Tail]
    ? Head extends CanonicalRawEventInput<
        CapturePageObservationBinding<
          BrokerRequestAuthorizationBinding<
            CaptureRequestBinding<CaptureChainBinding<string>, string>,
            string
          >,
          string
        >,
        string
      >
      ? EventObservationIdOf<Head> extends Seen
        ? never
        : Tail extends readonly CanonicalRawEventInput<
            CapturePageObservationBinding<
              BrokerRequestAuthorizationBinding<
                CaptureRequestBinding<CaptureChainBinding<string>, string>,
                string
              >,
              string
            >,
            string
          >[]
          ? readonly [Head, ...UniqueEventObservationTuple<Tail, Seen | EventObservationIdOf<Head>>]
          : never
      : never
    : readonly []

export type UniqueCaptureEventBatch<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = Readonly<{
  pageBinding: PageBinding
  eventCount: number
  eventOrdinalContract: 'zero_based_contiguous_v1'
  eventObservationIdsDigest: string
  events: readonly CanonicalRawEventInput<PageBinding, string>[]
  readonly [uniqueEventBatchBrand]: PageBinding['pageObservationId']
}>

export type CaptureEventBatchCandidate<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = Readonly<{
  pageBinding: PageBinding
  eventCount: number
  eventOrdinalContract: 'zero_based_contiguous_v1'
  eventObservationIdsDigest: string
  events: readonly CanonicalRawEventInput<PageBinding, string>[]
}>

export type ProviderPageTransitionInput<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = Readonly<{
  workUnit: BrokerReadWorkUnit<PageBinding['authorizationBinding']['requestBinding']['chainBinding']>
  wirePage: RuntimeValidatedCaptureWirePage<PageBinding>
  inspectedPage: InspectedCapturePage<PageBinding>
}>

export type RuntimeValidatedProviderPageTransitionInput<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = ProviderPageTransitionInput<PageBinding> & Readonly<{
  readonly [validatedProviderPageTransitionBrand]: true
}>

export type ProviderCheckpointTransition<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = Readonly<{
  pageBinding: PageBinding
  previousCheckpoint: ProviderCheckpoint
  previousCheckpointMac: string
  nextCheckpoint: ProviderCheckpoint
  transitionDigest: string
  transitionMac: string
  status: 'next_page' | 'complete' | 'partial' | 'blocked'
}>

export type CaptureRawObservationEnvelope<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = Readonly<{
  pageBinding: PageBinding
  rawObservationId: string
  rawObservationDigest: string
  observationContractVersion: string
  observationAuthority: 'provider_observed_unreconciled'
  normalizationAuthority: 'blocked_pending_versioned_normalization'
  reconciliationAuthority: 'none'
  approvalAuthority: 'none'
  importAuthority: 'none'
  requestEvidence: CaptureRequestEvidence<PageBinding['authorizationBinding']>
  pageEvidence: CapturePageEvidence<PageBinding>
  eventBatch: UniqueCaptureEventBatch<PageBinding>
}>

export type CaptureRawObservationCommit<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = Readonly<{
  authorityPurpose: 'capture'
  pageBinding: PageBinding
  envelope: CaptureRawObservationEnvelope<PageBinding>
  checkpointTransition: ProviderCheckpointTransition<PageBinding>
  committedAt: string
  commitReceiptDigest: string
  persistenceAuthority: 'append_only_raw_observation'
}>

export type RuntimeValidatedCaptureRawObservationCommit<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
> = CaptureRawObservationCommit<PageBinding> & Readonly<{
  readonly [validatedCaptureCommitBrand]: true
}>

export type BrokerFailureClass =
  | 'authority'
  | 'credential'
  | 'permission'
  | 'contract'
  | 'pagination'
  | 'rate_limit'
  | 'provider_unavailable'
  | 'timeout'
  | 'resource_budget'
  | 'persistence_conflict'
  | 'unknown_fail_closed'

export type BrokerFailure = Readonly<{
  failureClass: BrokerFailureClass
  failureCode: string
  retryDisposition: 'never' | 'after_authority_change' | 'bounded_backoff' | 'manual_review'
  sanitizedDetail: string | null
  httpStatusClass: 'none' | '2xx' | '3xx' | '4xx' | '5xx'
}>

function bindingValidationFailure(code: string): never {
  throw new Error(`Broker binding validation failed: ${code}`)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function cloneCanonicalValue(value: unknown, active = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) bindingValidationFailure('canonical_value_non_finite_number')
    return value
  }
  if (Array.isArray(value)) {
    if (isProxy(value)) bindingValidationFailure('canonical_value_proxy')
    if (active.has(value)) bindingValidationFailure('canonical_value_cycle')
    active.add(value)
    const clone = value.map((entry) => cloneCanonicalValue(entry, active))
    active.delete(value)
    return clone
  }
  if (!isPlainRecord(value)) bindingValidationFailure('canonical_value_non_plain_object')
  if (isProxy(value)) bindingValidationFailure('canonical_value_proxy')
  if (active.has(value)) bindingValidationFailure('canonical_value_cycle')
  active.add(value)
  const clone: Record<string, unknown> = {}
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some((key) => typeof key === 'symbol')) bindingValidationFailure('canonical_value_symbol_key')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of ownKeys as string[]) {
    const descriptor = descriptors[key]
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      bindingValidationFailure('canonical_value_accessor_or_hidden_property')
    }
  }
  for (const key of (ownKeys as string[]).sort()) {
    if (value[key] === undefined) bindingValidationFailure('canonical_value_undefined')
    clone[key] = cloneCanonicalValue(value[key], active)
  }
  active.delete(value)
  return clone
}

function deepFreezeSnapshot<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreezeSnapshot(entry)
  return Object.freeze(value)
}

function canonicalSnapshot<T>(value: T): T {
  return deepFreezeSnapshot(cloneCanonicalValue(value) as T)
}

function canonicalSemanticValue(value: unknown): string {
  return JSON.stringify(cloneCanonicalValue(value))
}

function canonicalSha256(value: unknown): string {
  return createHash('sha256').update(canonicalSemanticValue(value), 'utf8').digest('hex')
}

export function computeCanonicalBrokerValueDigest(value: CanonicalJsonValue): string {
  return canonicalSha256(value)
}

export function computeBrokerPermitConsumptionId(
  authorityPurpose: BrokerAuthorityPurpose,
  requestAuthorityId: string,
): string {
  if (authorityPurpose !== 'capture' && authorityPurpose !== 'connection_probe') {
    bindingValidationFailure('permit_consumption_purpose_invalid')
  }
  requireNonEmptyString(requestAuthorityId, 'permit_consumption_request_authority_id_empty')
  return canonicalSha256({
    consumptionKeyContractVersion: PERMIT_CONSUMPTION_KEY_CONTRACT_VERSION,
    authorityPurpose,
    requestAuthorityId,
  })
}

function compareUtf8Keys(left: string, right: string) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

function encodeEquoraTcj(value: unknown, active = new Set<object>()): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) bindingValidationFailure('equora_tcj_non_integer')
    return String(value)
  }
  if (Array.isArray(value)) {
    if (isProxy(value) || active.has(value)) bindingValidationFailure('equora_tcj_invalid_array')
    active.add(value)
    const encoded = `[${value.map((entry) => encodeEquoraTcj(entry, active)).join(',')}]`
    active.delete(value)
    return encoded
  }
  if (!isPlainRecord(value) || isProxy(value) || active.has(value)) {
    bindingValidationFailure('equora_tcj_invalid_object')
  }
  active.add(value)
  const keys = Reflect.ownKeys(value)
  if (keys.some((key) => typeof key === 'symbol')) bindingValidationFailure('equora_tcj_symbol_key')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of keys as string[]) {
    const descriptor = descriptors[key]
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      bindingValidationFailure('equora_tcj_accessor_hidden_or_undefined')
    }
  }
  const encoded = `{${(keys as string[]).sort(compareUtf8Keys).map((key) => (
    `${JSON.stringify(key)}:${encodeEquoraTcj(descriptors[key].value, active)}`
  )).join(',')}}`
  active.delete(value)
  return encoded
}

function sameCanonicalSemantics(left: unknown, right: unknown) {
  return canonicalSemanticValue(left) === canonicalSemanticValue(right)
}

export function computeCapturePurposeScopeDigest(scope: BrokerReadWorkUnit<CaptureChainBinding<string>>['scope']) {
  return createHash('sha256')
    .update('equora-broker-capture-scope-v2', 'utf8')
    .update(Buffer.from([0]))
    .update(encodeEquoraTcj(scope), 'utf8')
    .digest('hex')
}

export function computeCaptureQueryProfileDigest(input: Readonly<{
  provider: ProviderCapabilityRef
  queryContractVersion: string
  stableCanonicalQuery: CanonicalJsonValue
}>) {
  validateProviderCapability(input.provider)
  requireNonEmptyString(input.queryContractVersion, 'capture_query_profile_query_contract_version_empty')
  const stableCanonicalQuery = canonicalSnapshot(input.stableCanonicalQuery)
  if (isPlainRecord(stableCanonicalQuery)
    && Object.prototype.hasOwnProperty.call(stableCanonicalQuery, 'page_num')) {
    bindingValidationFailure('capture_query_profile_contains_page_progress')
  }
  return canonicalSha256({
    digestContractVersion: CAPTURE_QUERY_PROFILE_DIGEST_CONTRACT_VERSION,
    provider: input.provider,
    queryContractVersion: input.queryContractVersion,
    stableCanonicalQuery,
  })
}

export function computeBrokerDescriptorQueryDigest(input: Readonly<{
  provider: ProviderCapabilityRef
  capabilityProfile: CapabilityProfileRef
  queryContractVersion: string
  canonicalQuery: CanonicalJsonValue
}>) {
  validateProviderCapability(input.provider)
  validateCapabilityProfile(input.capabilityProfile)
  requireNonEmptyString(input.queryContractVersion, 'descriptor_query_contract_version_empty')
  return canonicalSha256({
    digestContractVersion: DESCRIPTOR_QUERY_DIGEST_CONTRACT_VERSION,
    provider: input.provider,
    capabilityProfile: input.capabilityProfile,
    queryContractVersion: input.queryContractVersion,
    canonicalQuery: canonicalSnapshot(input.canonicalQuery),
  })
}

function isCanonicalUtcInstant(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value
}

function requireNonEmptyString(value: unknown, code: string) {
  if (typeof value !== 'string' || value.trim().length === 0) bindingValidationFailure(code)
}

function requirePositiveSafeInteger(value: unknown, code: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) bindingValidationFailure(code)
}

function exactKeys(value: unknown, expected: readonly string[], code: string) {
  if (!isPlainRecord(value)) bindingValidationFailure(code)
  const actual = Object.keys(value).sort()
  const required = [...expected].sort()
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    bindingValidationFailure(code)
  }
}

function requireNonEmptyStrings(values: readonly unknown[], code: string) {
  for (const value of values) requireNonEmptyString(value, code)
}

function capabilityContractDigest(contract: ReadCapabilityExecutionContract) {
  const { capabilityDescriptorDigest: _providedDigest, ...ref } = contract.ref
  return canonicalSha256({ ...contract, ref })
}

function authorityTupleDigestInput(authority: CaptureAuthorityTuple | ConnectionProbeAuthorityTuple) {
  const common = {
    authorityTupleContractVersion: authority.authorityTupleContractVersion,
    authorityPurpose: authority.authorityPurpose,
    userId: authority.userId,
    environment: authority.environment,
    runtimeAuthority: authority.runtimeAuthority,
    provider: authority.provider,
    capabilityProfile: authority.capabilityProfile,
    commonPolicyPins: authority.commonPolicyPins,
    purposeScopeDigest: authority.purposeScopeDigest,
    purposeRequestSequence: authority.purposeRequestSequence,
  }
  if (authority.authorityPurpose === 'capture') {
    return {
      common,
      capture: {
        workUnitId: authority.workUnitId,
        expectedWorkUnitRowVersion: authority.expectedWorkUnitRowVersion,
        claim: authority.claim,
        activation: authority.activation,
        account: authority.account,
        persistentCredentialReference: authority.persistentCredentialReference,
        checkpointContractVersion: authority.checkpointContractVersion,
        capturePolicyPins: authority.capturePolicyPins,
        captureBudget: authority.captureBudget,
      },
    }
  }
  return {
    common,
    connectionProbe: {
      setupCommandId: authority.setupCommandId,
      expectedSetupCommandRowVersion: authority.expectedSetupCommandRowVersion,
      setupRequestDigest: authority.setupRequestDigest,
      connectionProbePolicyPins: authority.connectionProbePolicyPins,
      ephemeralCredentialSession: authority.ephemeralCredentialSession,
      probeBudget: authority.probeBudget,
    },
  }
}

export function computeAuthorityTupleDigest(authority: CaptureAuthorityTuple | ConnectionProbeAuthorityTuple) {
  const snapshot = canonicalSnapshot(authority)
  const commonKeys = [
    'authorityTupleContractVersion', 'authorityPurpose', 'authorityTupleDigest', 'userId', 'environment',
    'runtimeAuthority', 'provider', 'capabilityProfile', 'commonPolicyPins', 'purposeScopeDigest',
    'purposeRequestSequence',
  ]
  exactKeys(snapshot.runtimeAuthority, [
    'requiredMode', 'runtimeConfigurationDigest', 'deploymentIdentity', 'runtimeAuthorityEpoch',
  ], 'authority_digest_runtime_shape_invalid')
  exactKeys(snapshot.provider, [
    'providerCode', 'providerContractVersion', 'adapterVersion', 'capabilityKind', 'providerCapabilityId',
    'providerCapabilityVersion', 'capabilityDescriptorDigest',
  ], 'authority_digest_provider_shape_invalid')
  exactKeys(snapshot.capabilityProfile, ['profileId', 'profileVersion', 'profileDigest'], 'authority_digest_profile_shape_invalid')
  exactKeys(snapshot.commonPolicyPins, [
    'runtimePolicyVersion', 'requestAuthorityPolicyVersion', 'failurePolicyVersion',
  ], 'authority_digest_common_policy_shape_invalid')
  if (snapshot.authorityPurpose === 'capture') {
    exactKeys(snapshot, [...commonKeys,
      'workUnitId', 'expectedWorkUnitRowVersion', 'claim', 'activation', 'account',
      'persistentCredentialReference', 'checkpointContractVersion', 'capturePolicyPins', 'captureBudget',
    ], 'capture_authority_digest_shape_invalid')
    exactKeys(snapshot.claim, ['claimRequestId', 'leaseId', 'leaseEpoch', 'leaseTokenDigest'], 'capture_authority_digest_claim_shape_invalid')
    exactKeys(snapshot.activation, ['id', 'generation', 'authorityEpoch'], 'capture_authority_digest_activation_shape_invalid')
    exactKeys(snapshot.account, [
      'brokerAccountId', 'connectionAccountId', 'identityDigest', 'identityKeyVersion',
    ], 'capture_authority_digest_account_shape_invalid')
    exactKeys(snapshot.persistentCredentialReference, ['id', 'keyVersion', 'generation'], 'capture_authority_digest_credential_shape_invalid')
    exactKeys(snapshot.capturePolicyPins, [
      'claimPolicyVersion', 'leasePolicyVersion', 'checkpointPolicyVersion',
    ], 'capture_authority_digest_policy_shape_invalid')
    exactKeys(snapshot.captureBudget, ['pageLimit', 'responseByteLimit', 'requestDeadlineAt'], 'capture_authority_digest_budget_shape_invalid')
  } else if (snapshot.authorityPurpose === 'connection_probe') {
    exactKeys(snapshot, [...commonKeys,
      'setupCommandId', 'expectedSetupCommandRowVersion', 'setupRequestDigest', 'connectionProbePolicyPins',
      'ephemeralCredentialSession', 'probeBudget',
    ], 'probe_authority_digest_shape_invalid')
    exactKeys(snapshot.connectionProbePolicyPins, [
      'setupPolicyVersion', 'probePolicyVersion', 'ephemeralCredentialPolicyVersion', 'applyPolicyVersion',
    ], 'probe_authority_digest_policy_shape_invalid')
    exactKeys(snapshot.ephemeralCredentialSession, [
      'sessionId', 'generation', 'materialBindingMac',
    ], 'probe_authority_digest_session_shape_invalid')
    exactKeys(snapshot.probeBudget, [
      'cumulativeRequestLimit', 'cumulativeRequestCountBefore', 'responseByteLimit', 'absoluteDeadlineAt',
    ], 'probe_authority_digest_budget_shape_invalid')
  } else {
    bindingValidationFailure('authority_digest_purpose_invalid')
  }
  if (snapshot.authorityTupleContractVersion !== AUTHORITY_TUPLE_CONTRACT_VERSION) {
    bindingValidationFailure('authority_tuple_contract_version_invalid')
  }
  return createHash('sha256')
    .update(AUTHORITY_TUPLE_CONTRACT_VERSION, 'utf8')
    .update(Buffer.from([0]))
    .update(snapshot.authorityPurpose, 'utf8')
    .update(Buffer.from([0]))
    .update(encodeEquoraTcj(authorityTupleDigestInput(snapshot)), 'utf8')
    .digest('hex')
}

export function computeBrokerConnectionSetupRequestDigest(
  command: BrokerConnectionSetupCommand,
): string {
  return canonicalSha256(command)
}

export function validateBrokerConnectionSetupCommand(
  candidate: BrokerConnectionSetupCommand,
  authority: ConnectionProbeAuthorityTuple,
): BrokerConnectionSetupCommand {
  const command = canonicalSnapshot(candidate)
  exactKeys(command, [
    'setupCommandContractVersion', 'setupCommandId', 'expectedSetupCommandRowVersion', 'userId', 'environment',
    'provider', 'capabilityProfile', 'descriptorQueryDigestContractVersion', 'queryContractVersion',
    'canonicalDescriptorQueryDigest', 'readOnlyAttestation', 'probeBudget',
    'persistenceAuthority', 'credentialPersistenceAuthority', 'captureAuthority', 'importAuthority',
  ], 'connection_setup_command_shape_invalid')
  exactKeys(command.probeBudget, [
    'cumulativeRequestLimit', 'responseByteLimit', 'absoluteDeadlineAt',
  ], 'connection_setup_command_budget_shape_invalid')
  validateProviderCapability(command.provider)
  validateCapabilityProfile(command.capabilityProfile)
  requireNonEmptyStrings([
    command.setupCommandId,
    command.userId,
    command.queryContractVersion,
    command.canonicalDescriptorQueryDigest,
  ], 'connection_setup_command_required_string_empty')
  requirePositiveSafeInteger(command.expectedSetupCommandRowVersion, 'connection_setup_command_row_version_invalid')
  requirePositiveSafeInteger(command.probeBudget.cumulativeRequestLimit, 'connection_setup_command_request_limit_invalid')
  requirePositiveSafeInteger(command.probeBudget.responseByteLimit, 'connection_setup_command_response_limit_invalid')
  if (!isCanonicalUtcInstant(command.probeBudget.absoluteDeadlineAt)) {
    bindingValidationFailure('connection_setup_command_deadline_invalid')
  }
  if (command.setupCommandContractVersion !== 'equora-broker-connection-setup-command-v2'
    || command.descriptorQueryDigestContractVersion !== DESCRIPTOR_QUERY_DIGEST_CONTRACT_VERSION
    || !/^[a-f0-9]{64}$/.test(command.canonicalDescriptorQueryDigest)
    || command.userId !== authority.userId
    || command.environment !== authority.environment
    || command.setupCommandId !== authority.setupCommandId
    || command.expectedSetupCommandRowVersion !== authority.expectedSetupCommandRowVersion
    || !sameProviderCapability(command.provider, authority.provider)
    || !sameCapabilityProfile(command.capabilityProfile, authority.capabilityProfile)
    || computeBrokerConnectionSetupRequestDigest(command) !== authority.setupRequestDigest
    || command.probeBudget.cumulativeRequestLimit !== authority.probeBudget.cumulativeRequestLimit
    || command.probeBudget.responseByteLimit !== authority.probeBudget.responseByteLimit
    || command.probeBudget.absoluteDeadlineAt !== authority.probeBudget.absoluteDeadlineAt
    || command.readOnlyAttestation !== true
    || command.persistenceAuthority !== 'secret_free_setup_command_only'
    || command.credentialPersistenceAuthority !== 'none_before_atomic_apply'
    || command.captureAuthority !== 'none'
    || command.importAuthority !== 'none') {
    bindingValidationFailure('connection_setup_command_authority_mismatch')
  }
  return command
}

export function validateBrokerConnectionProbeWork<Binding extends ConnectionProbeChainBinding<string>>(
  candidate: BrokerConnectionProbeWork<Binding>,
): BrokerConnectionProbeWork<Binding> {
  const work = canonicalSnapshot(candidate)
  exactKeys(work, ['chainBinding', 'setupCommand', 'requestInput'], 'connection_probe_work_shape_invalid')
  exactKeys(work.chainBinding, ['chainId', 'authorityPurpose', 'authority'], 'connection_probe_chain_shape_invalid')
  requireNonEmptyString(work.chainBinding.chainId, 'connection_probe_chain_id_empty')
  if (work.chainBinding.authorityPurpose !== 'connection_probe') {
    bindingValidationFailure('connection_probe_chain_purpose_invalid')
  }
  validateProbeAuthority(work.chainBinding.authority)
  validateBrokerConnectionSetupCommand(work.setupCommand, work.chainBinding.authority)
  cloneCanonicalValue(work.requestInput)
  return work
}

function requestPlanDigestInput(plan: BrokerReadRequestPlan<AnyBrokerRequestBinding>) {
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
    pageSequenceContractVersion: plan.pageSequenceContractVersion,
    pageSequence: plan.pageSequence,
  }
}

function sameProviderCapability(left: ProviderCapabilityRef, right: ProviderCapabilityRef) {
  return left.providerCode === right.providerCode
    && left.providerContractVersion === right.providerContractVersion
    && left.adapterVersion === right.adapterVersion
    && left.capabilityKind === right.capabilityKind
    && left.providerCapabilityId === right.providerCapabilityId
    && left.providerCapabilityVersion === right.providerCapabilityVersion
    && left.capabilityDescriptorDigest === right.capabilityDescriptorDigest
}

function sameCapabilityProfile(left: CapabilityProfileRef, right: CapabilityProfileRef) {
  return left.profileId === right.profileId
    && left.profileVersion === right.profileVersion
    && left.profileDigest === right.profileDigest
}

function sameCaptureChain(left: CaptureChainBinding<string>, right: CaptureChainBinding<string>) {
  return left.chainId === right.chainId
    && left.authorityPurpose === 'capture'
    && right.authorityPurpose === 'capture'
    && sameCanonicalSemantics(left.authority, right.authority)
}

function sameProbeChain(left: ConnectionProbeChainBinding<string>, right: ConnectionProbeChainBinding<string>) {
  return left.chainId === right.chainId
    && left.authorityPurpose === 'connection_probe'
    && right.authorityPurpose === 'connection_probe'
    && sameCanonicalSemantics(left.authority, right.authority)
}

function sameCaptureRequest(
  left: CaptureRequestBinding<CaptureChainBinding<string>, string>,
  right: CaptureRequestBinding<CaptureChainBinding<string>, string>,
) {
  return left.requestId === right.requestId
    && left.authorityPurpose === 'capture'
    && right.authorityPurpose === 'capture'
    && left.canonicalUnsignedRequestDigest === right.canonicalUnsignedRequestDigest
    && left.queryDigest === right.queryDigest
    && left.purposeRequestSequence === right.purposeRequestSequence
    && sameCaptureChain(left.chainBinding, right.chainBinding)
    && sameProviderCapability(left.provider, right.provider)
    && sameCapabilityProfile(left.capabilityProfile, right.capabilityProfile)
}

function sameProbeRequest(
  left: ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
  right: ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
) {
  return left.requestId === right.requestId
    && left.authorityPurpose === 'connection_probe'
    && right.authorityPurpose === 'connection_probe'
    && left.canonicalUnsignedRequestDigest === right.canonicalUnsignedRequestDigest
    && left.queryDigest === right.queryDigest
    && left.purposeRequestSequence === right.purposeRequestSequence
    && sameProbeChain(left.chainBinding, right.chainBinding)
    && sameProviderCapability(left.provider, right.provider)
    && sameCapabilityProfile(left.capabilityProfile, right.capabilityProfile)
}

function sameCaptureAuthorization(
  left: BrokerRequestAuthorizationBinding<
    CaptureRequestBinding<CaptureChainBinding<string>, string>,
    string
  >,
  right: BrokerRequestAuthorizationBinding<
    CaptureRequestBinding<CaptureChainBinding<string>, string>,
    string
  >,
) {
  return left.requestAuthorityId === right.requestAuthorityId
    && left.authorityPurpose === 'capture'
    && right.authorityPurpose === 'capture'
    && sameCaptureRequest(left.requestBinding, right.requestBinding)
}

function sameProbeAuthorization(
  left: BrokerRequestAuthorizationBinding<
    ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
    string
  >,
  right: BrokerRequestAuthorizationBinding<
    ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
    string
  >,
) {
  return left.requestAuthorityId === right.requestAuthorityId
    && left.authorityPurpose === 'connection_probe'
    && right.authorityPurpose === 'connection_probe'
    && sameProbeRequest(left.requestBinding, right.requestBinding)
}

function validateCaptureRequestBinding(request: CaptureRequestBinding<CaptureChainBinding<string>, string>) {
  exactKeys(request, [
    'requestId', 'authorityPurpose', 'chainBinding', 'canonicalUnsignedRequestDigest', 'queryDigest',
    'purposeRequestSequence', 'provider', 'capabilityProfile',
  ], 'capture_request_binding_shape_invalid')
  exactKeys(request.chainBinding, ['chainId', 'authorityPurpose', 'authority'], 'capture_chain_binding_shape_invalid')
  if (request.authorityPurpose !== 'capture' || request.chainBinding.authorityPurpose !== 'capture') {
    bindingValidationFailure('capture_request_purpose_invalid')
  }
  requireNonEmptyStrings([
    request.requestId, request.chainBinding.chainId, request.canonicalUnsignedRequestDigest, request.queryDigest,
  ], 'capture_request_required_string_empty')
  validateCaptureAuthority(request.chainBinding.authority)
  validateProviderCapability(request.provider)
  validateCapabilityProfile(request.capabilityProfile)
  if (request.purposeRequestSequence !== request.chainBinding.authority.purposeRequestSequence
    || !sameProviderCapability(request.provider, request.chainBinding.authority.provider)
    || !sameCapabilityProfile(request.capabilityProfile, request.chainBinding.authority.capabilityProfile)) {
    bindingValidationFailure('capture_request_authority_binding_mismatch')
  }
}

function validateProbeRequestBinding(request: ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>) {
  exactKeys(request, [
    'requestId', 'authorityPurpose', 'chainBinding', 'canonicalUnsignedRequestDigest', 'queryDigest',
    'purposeRequestSequence', 'provider', 'capabilityProfile',
  ], 'probe_request_binding_shape_invalid')
  exactKeys(request.chainBinding, ['chainId', 'authorityPurpose', 'authority'], 'probe_chain_binding_shape_invalid')
  if (request.authorityPurpose !== 'connection_probe' || request.chainBinding.authorityPurpose !== 'connection_probe') {
    bindingValidationFailure('probe_request_purpose_invalid')
  }
  requireNonEmptyStrings([
    request.requestId, request.chainBinding.chainId, request.canonicalUnsignedRequestDigest, request.queryDigest,
  ], 'probe_request_required_string_empty')
  validateProbeAuthority(request.chainBinding.authority)
  validateProviderCapability(request.provider)
  validateCapabilityProfile(request.capabilityProfile)
  if (request.purposeRequestSequence !== request.chainBinding.authority.purposeRequestSequence
    || !sameProviderCapability(request.provider, request.chainBinding.authority.provider)
    || !sameCapabilityProfile(request.capabilityProfile, request.chainBinding.authority.capabilityProfile)) {
    bindingValidationFailure('probe_request_authority_binding_mismatch')
  }
}

function validateCaptureAuthorizationBinding(authorization: BrokerRequestAuthorizationBinding<
  CaptureRequestBinding<CaptureChainBinding<string>, string>,
  string
>) {
  exactKeys(authorization, ['requestAuthorityId', 'authorityPurpose', 'requestBinding'], 'capture_authorization_binding_shape_invalid')
  if (authorization.authorityPurpose !== 'capture') bindingValidationFailure('capture_authorization_purpose_invalid')
  requireNonEmptyString(authorization.requestAuthorityId, 'capture_authorization_id_empty')
  validateCaptureRequestBinding(authorization.requestBinding)
}

function validateProbeAuthorizationBinding(authorization: BrokerRequestAuthorizationBinding<
  ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
  string
>) {
  exactKeys(authorization, ['requestAuthorityId', 'authorityPurpose', 'requestBinding'], 'probe_authorization_binding_shape_invalid')
  if (authorization.authorityPurpose !== 'connection_probe') bindingValidationFailure('probe_authorization_purpose_invalid')
  requireNonEmptyString(authorization.requestAuthorityId, 'probe_authorization_id_empty')
  validateProbeRequestBinding(authorization.requestBinding)
}

function sameCapturePage(
  left: CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
  right: CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
) {
  return left.pageObservationId === right.pageObservationId
    && left.pageSequence === right.pageSequence
    && left.observedAt === right.observedAt
    && left.pagePayloadDigest === right.pagePayloadDigest
    && left.completenessStatus === right.completenessStatus
    && sameCaptureAuthorization(left.authorizationBinding, right.authorizationBinding)
}

const CAPTURE_COMPLETENESS_VALUES: ReadonlySet<CaptureCompletenessStatus> = new Set([
  'page_observed_scope_open',
  'scope_complete_provider_claim_unverified',
  'partial_observation',
  'blocked_observation',
])

const CONNECTION_PROBE_FINDING_CODES: ReadonlySet<ConnectionProbeFindingCode> = new Set([
  'provider_read_unavailable',
  'provider_response_contract_rejected',
  'read_permission_not_observed',
  'account_identity_not_observed',
  'provider_rate_limited',
  'provider_authentication_rejected',
])

function validateCapturePageBinding(page: CapturePageObservationBinding<
  BrokerRequestAuthorizationBinding<CaptureRequestBinding<CaptureChainBinding<string>, string>, string>,
  string
>) {
  exactKeys(page, [
    'authorizationBinding', 'pageObservationId', 'pageSequence', 'observedAt', 'pagePayloadDigest',
    'completenessStatus',
  ], 'capture_page_binding_shape_invalid')
  requireNonEmptyStrings([page.pageObservationId, page.pagePayloadDigest], 'capture_page_required_string_empty')
  if (!Number.isSafeInteger(page.pageSequence) || page.pageSequence < 0) bindingValidationFailure('capture_page_sequence_invalid')
  if (!isCanonicalUtcInstant(page.observedAt)) {
    bindingValidationFailure('capture_page_observed_at_invalid')
  }
  if (!CAPTURE_COMPLETENESS_VALUES.has(page.completenessStatus)) bindingValidationFailure('capture_page_completeness_invalid')
  if (page.authorizationBinding.authorityPurpose !== 'capture'
    || page.authorizationBinding.requestBinding.authorityPurpose !== 'capture') {
    bindingValidationFailure('capture_page_authority_purpose_invalid')
  }
  validateCaptureAuthorizationBinding(page.authorizationBinding)
  if (page.pageSequence >= page.authorizationBinding.requestBinding.chainBinding.authority.captureBudget.pageLimit) {
    bindingValidationFailure('capture_page_sequence_exceeds_authority_budget')
  }
}

const CAPABILITY_KINDS: ReadonlySet<BrokerCapabilityKind> = new Set([
  'instrument_metadata', 'historical_orders', 'historical_executions', 'historical_positions',
  'funding_history', 'account_identity', 'permission_evidence',
])

function validateProviderCapability(provider: ProviderCapabilityRef) {
  exactKeys(provider, [
    'providerCode', 'providerContractVersion', 'adapterVersion', 'capabilityKind', 'providerCapabilityId',
    'providerCapabilityVersion', 'capabilityDescriptorDigest',
  ], 'provider_capability_shape_invalid')
  requireNonEmptyStrings([
    provider.providerCode, provider.providerContractVersion, provider.adapterVersion, provider.providerCapabilityId,
    provider.providerCapabilityVersion, provider.capabilityDescriptorDigest,
  ], 'provider_capability_required_string_empty')
  if (!CAPABILITY_KINDS.has(provider.capabilityKind)) bindingValidationFailure('provider_capability_kind_invalid')
}

function validateCapabilityProfile(profile: CapabilityProfileRef) {
  exactKeys(profile, ['profileId', 'profileVersion', 'profileDigest'], 'capability_profile_shape_invalid')
  requireNonEmptyStrings([profile.profileId, profile.profileVersion, profile.profileDigest], 'capability_profile_required_string_empty')
}

function validateCommonAuthority(authority: CaptureAuthorityTuple | ConnectionProbeAuthorityTuple) {
  if (authority.authorityTupleContractVersion !== AUTHORITY_TUPLE_CONTRACT_VERSION) {
    bindingValidationFailure('authority_tuple_contract_version_invalid')
  }
  if (authority.environment !== 'live' && authority.environment !== 'demo') bindingValidationFailure('authority_environment_invalid')
  exactKeys(authority.runtimeAuthority, [
    'requiredMode', 'runtimeConfigurationDigest', 'deploymentIdentity', 'runtimeAuthorityEpoch',
  ], 'runtime_authority_shape_invalid')
  exactKeys(authority.commonPolicyPins, [
    'runtimePolicyVersion', 'requestAuthorityPolicyVersion', 'failurePolicyVersion',
  ], 'common_policy_pins_shape_invalid')
  validateProviderCapability(authority.provider)
  validateCapabilityProfile(authority.capabilityProfile)
  requireNonEmptyStrings([
    authority.authorityTupleContractVersion,
    authority.authorityTupleDigest,
    authority.userId,
    authority.runtimeAuthority.runtimeConfigurationDigest,
    authority.runtimeAuthority.deploymentIdentity,
    authority.commonPolicyPins.runtimePolicyVersion,
    authority.commonPolicyPins.requestAuthorityPolicyVersion,
    authority.commonPolicyPins.failurePolicyVersion,
    authority.purposeScopeDigest,
  ], 'authority_common_required_string_empty')
  requirePositiveSafeInteger(authority.runtimeAuthority.runtimeAuthorityEpoch, 'runtime_authority_epoch_invalid')
  requirePositiveSafeInteger(authority.purposeRequestSequence, 'authority_request_sequence_invalid')
}

function validateCaptureAuthority(authority: CaptureAuthorityTuple) {
  exactKeys(authority, [
    'authorityTupleContractVersion', 'authorityPurpose', 'authorityTupleDigest', 'userId', 'environment',
    'runtimeAuthority', 'provider', 'capabilityProfile', 'commonPolicyPins', 'purposeScopeDigest',
    'purposeRequestSequence', 'workUnitId', 'expectedWorkUnitRowVersion', 'claim', 'activation', 'account',
    'persistentCredentialReference', 'checkpointContractVersion', 'capturePolicyPins', 'captureBudget',
  ], 'capture_authority_shape_invalid')
  if (authority.authorityPurpose !== 'capture' || authority.runtimeAuthority.requiredMode !== 'capture') {
    bindingValidationFailure('capture_authority_purpose_or_mode_invalid')
  }
  validateCommonAuthority(authority)
  exactKeys(authority.claim, ['claimRequestId', 'leaseId', 'leaseEpoch', 'leaseTokenDigest'], 'capture_claim_shape_invalid')
  exactKeys(authority.activation, ['id', 'generation', 'authorityEpoch'], 'capture_activation_shape_invalid')
  exactKeys(authority.account, [
    'brokerAccountId', 'connectionAccountId', 'identityDigest', 'identityKeyVersion',
  ], 'capture_account_shape_invalid')
  exactKeys(authority.persistentCredentialReference, ['id', 'keyVersion', 'generation'], 'capture_credential_reference_shape_invalid')
  exactKeys(authority.capturePolicyPins, [
    'claimPolicyVersion', 'leasePolicyVersion', 'checkpointPolicyVersion',
  ], 'capture_policy_pins_shape_invalid')
  exactKeys(authority.captureBudget, ['pageLimit', 'responseByteLimit', 'requestDeadlineAt'], 'capture_budget_shape_invalid')
  requireNonEmptyStrings([
    authority.workUnitId,
    authority.claim.claimRequestId,
    authority.claim.leaseId,
    authority.claim.leaseTokenDigest,
    authority.activation.id,
    authority.account.brokerAccountId,
    authority.account.connectionAccountId,
    authority.account.identityDigest,
    authority.account.identityKeyVersion,
    authority.persistentCredentialReference.id,
    authority.persistentCredentialReference.keyVersion,
    authority.checkpointContractVersion,
    authority.capturePolicyPins.claimPolicyVersion,
    authority.capturePolicyPins.leasePolicyVersion,
    authority.capturePolicyPins.checkpointPolicyVersion,
  ], 'capture_authority_required_string_empty')
  for (const value of [
    authority.expectedWorkUnitRowVersion,
    authority.claim.leaseEpoch,
    authority.activation.generation,
    authority.activation.authorityEpoch,
    authority.persistentCredentialReference.generation,
    authority.captureBudget.pageLimit,
    authority.captureBudget.responseByteLimit,
  ]) requirePositiveSafeInteger(value, 'capture_authority_positive_integer_invalid')
  if (!isCanonicalUtcInstant(authority.captureBudget.requestDeadlineAt)) bindingValidationFailure('capture_authority_deadline_invalid')
  if (authority.authorityTupleDigest !== computeAuthorityTupleDigest(authority)) bindingValidationFailure('capture_authority_tuple_digest_mismatch')
}

function validateProbeAuthority(authority: ConnectionProbeAuthorityTuple) {
  exactKeys(authority, [
    'authorityTupleContractVersion', 'authorityPurpose', 'authorityTupleDigest', 'userId', 'environment',
    'runtimeAuthority', 'provider', 'capabilityProfile', 'commonPolicyPins', 'purposeScopeDigest',
    'purposeRequestSequence', 'setupCommandId', 'expectedSetupCommandRowVersion', 'setupRequestDigest',
    'connectionProbePolicyPins', 'ephemeralCredentialSession', 'probeBudget',
  ], 'probe_authority_shape_invalid')
  if (authority.authorityPurpose !== 'connection_probe' || authority.runtimeAuthority.requiredMode !== 'probe') {
    bindingValidationFailure('probe_authority_purpose_or_mode_invalid')
  }
  validateCommonAuthority(authority)
  exactKeys(authority.connectionProbePolicyPins, [
    'setupPolicyVersion', 'probePolicyVersion', 'ephemeralCredentialPolicyVersion', 'applyPolicyVersion',
  ], 'probe_policy_pins_shape_invalid')
  exactKeys(authority.ephemeralCredentialSession, [
    'sessionId', 'generation', 'materialBindingMac',
  ], 'probe_ephemeral_session_shape_invalid')
  exactKeys(authority.probeBudget, [
    'cumulativeRequestLimit', 'cumulativeRequestCountBefore', 'responseByteLimit', 'absoluteDeadlineAt',
  ], 'probe_budget_shape_invalid')
  requireNonEmptyStrings([
    authority.setupCommandId,
    authority.setupRequestDigest,
    authority.ephemeralCredentialSession.sessionId,
    authority.ephemeralCredentialSession.materialBindingMac,
    authority.connectionProbePolicyPins.setupPolicyVersion,
    authority.connectionProbePolicyPins.probePolicyVersion,
    authority.connectionProbePolicyPins.ephemeralCredentialPolicyVersion,
    authority.connectionProbePolicyPins.applyPolicyVersion,
  ], 'probe_authority_required_string_empty')
  for (const value of [
    authority.expectedSetupCommandRowVersion,
    authority.ephemeralCredentialSession.generation,
    authority.probeBudget.cumulativeRequestLimit,
    authority.probeBudget.responseByteLimit,
  ]) requirePositiveSafeInteger(value, 'probe_authority_positive_integer_invalid')
  if (!Number.isSafeInteger(authority.probeBudget.cumulativeRequestCountBefore)
    || authority.probeBudget.cumulativeRequestCountBefore < 0
    || authority.probeBudget.cumulativeRequestCountBefore >= authority.probeBudget.cumulativeRequestLimit) {
    bindingValidationFailure('probe_authority_request_count_invalid')
  }
  if (!isCanonicalUtcInstant(authority.probeBudget.absoluteDeadlineAt)) bindingValidationFailure('probe_authority_deadline_invalid')
  if (authority.authorityTupleDigest !== computeAuthorityTupleDigest(authority)) bindingValidationFailure('probe_authority_tuple_digest_mismatch')
}

export function validateBrokerReadWorkUnit<Binding extends CaptureChainBinding<string>>(
  candidate: BrokerReadWorkUnit<Binding>,
): BrokerReadWorkUnit<Binding> {
  const work = canonicalSnapshot(candidate)
  exactKeys(work, ['chainBinding', 'integrityKeyReference', 'scope', 'checkpoint'], 'work_unit_shape_invalid')
  exactKeys(work.chainBinding, ['chainId', 'authorityPurpose', 'authority'], 'capture_chain_binding_shape_invalid')
  exactKeys(work.integrityKeyReference, ['id', 'keyVersion'], 'work_unit_integrity_key_shape_invalid')
  exactKeys(work.scope, [
    'instrumentScopeKey', 'requestWindowStartUs', 'requestWindowEndUs', 'positionType',
    'captureQueryProfileDigest',
  ], 'work_unit_scope_shape_invalid')
  exactKeys(work.checkpoint, [
    'checkpointContractVersion', 'captureQueryProfileDigest', 'payload', 'mac',
  ], 'work_unit_checkpoint_shape_invalid')
  if (work.chainBinding.authorityPurpose !== 'capture') bindingValidationFailure('work_unit_purpose_invalid')
  validateCaptureAuthority(work.chainBinding.authority)
  cloneCanonicalValue(work.checkpoint.payload)
  requireNonEmptyStrings([
    work.chainBinding.chainId,
    work.integrityKeyReference.id,
    work.integrityKeyReference.keyVersion,
    work.scope.instrumentScopeKey,
    work.scope.requestWindowStartUs,
    work.scope.requestWindowEndUs,
    work.scope.captureQueryProfileDigest,
    work.checkpoint.checkpointContractVersion,
    work.checkpoint.captureQueryProfileDigest,
    work.checkpoint.mac,
  ], 'work_unit_required_string_empty')
  if (work.checkpoint.checkpointContractVersion !== work.chainBinding.authority.checkpointContractVersion
    || work.checkpoint.captureQueryProfileDigest !== work.scope.captureQueryProfileDigest
    || work.chainBinding.authority.purposeScopeDigest !== computeCapturePurposeScopeDigest(work.scope)
    || !/^\d+$/.test(work.scope.requestWindowStartUs)
    || !/^\d+$/.test(work.scope.requestWindowEndUs)
    || BigInt(work.scope.requestWindowStartUs) > BigInt(work.scope.requestWindowEndUs)
    || !/^[a-f0-9]{64}$/.test(work.scope.captureQueryProfileDigest)
    || work.scope.positionType !== null && work.scope.positionType !== '1' && work.scope.positionType !== '2') {
    bindingValidationFailure('work_unit_semantics_invalid')
  }
  return work
}

function validateCapabilityContract(contract: ReadCapabilityExecutionContract, provider: ProviderCapabilityRef) {
  exactKeys(contract, [
    'ref', 'mutationContract', 'methodContract', 'constantMethod', 'constantHttpsOrigin', 'constantPort',
    'constantPathTemplate', 'authClass', 'dataClass', 'queryContractVersion', 'cursorContractVersion',
    'responseContractVersion', 'pageSequenceContractVersion',
  ], 'capability_contract_shape_invalid')
  validateProviderCapability(contract.ref)
  if (!sameProviderCapability(contract.ref, provider)) bindingValidationFailure('capability_contract_provider_mismatch')
  if (contract.mutationContract !== 'mutations_forbidden'
    || contract.methodContract !== 'constant_read_method'
    || contract.constantMethod !== 'GET'
    || contract.constantPort !== 443
    || contract.authClass !== 'public' && contract.authClass !== 'signed_read'
    || !['metadata', 'account_history', 'account_identity'].includes(contract.dataClass)) {
    bindingValidationFailure('capability_contract_semantics_invalid')
  }
  requireNonEmptyStrings([
    contract.constantHttpsOrigin, contract.constantPathTemplate, contract.queryContractVersion,
    contract.cursorContractVersion, contract.responseContractVersion, contract.pageSequenceContractVersion,
  ], 'capability_contract_required_string_empty')
  let parsedOrigin: URL
  try {
    parsedOrigin = new URL(contract.constantHttpsOrigin)
  } catch {
    bindingValidationFailure('capability_contract_origin_invalid')
  }
  if (parsedOrigin.protocol !== 'https:'
    || parsedOrigin.username !== ''
    || parsedOrigin.password !== ''
    || parsedOrigin.port !== ''
    || parsedOrigin.pathname !== '/'
    || parsedOrigin.search !== ''
    || parsedOrigin.hash !== ''
    || parsedOrigin.origin !== contract.constantHttpsOrigin) {
    bindingValidationFailure('capability_contract_origin_invalid')
  }
  if (provider.capabilityDescriptorDigest !== capabilityContractDigest(contract)) bindingValidationFailure('capability_contract_digest_mismatch')
}

function validatePlan(
  plan: BrokerReadRequestPlan<AnyBrokerRequestBinding>,
  contract: ReadCapabilityExecutionContract,
  responseByteLimit: number,
) {
  exactKeys(plan, [
    'authorityPurpose', 'authorityTupleDigest', 'provider', 'requestBinding', 'method', 'httpsOrigin', 'port',
    'pathTemplateId', 'canonicalPath', 'canonicalQuery', 'redirectMode', 'responseByteLimit',
    'requestTimeoutMs', 'planContractVersion', 'pageSequenceContractVersion', 'pageSequence',
    'canonicalUnsignedRequestDigest',
  ], 'broker_read_plan_shape_invalid')
  const authority = plan.requestBinding.chainBinding.authority
  if (plan.authorityPurpose !== plan.requestBinding.authorityPurpose
    || plan.authorityTupleDigest !== authority.authorityTupleDigest
    || !sameProviderCapability(plan.provider, plan.requestBinding.provider)
    || plan.method !== contract.constantMethod
    || plan.httpsOrigin !== contract.constantHttpsOrigin
    || plan.port !== contract.constantPort
    || plan.pathTemplateId !== contract.constantPathTemplate
    || plan.redirectMode !== 'error') bindingValidationFailure('broker_read_plan_capability_contract_mismatch')
  if (!/^\/(?!\/)/.test(plan.canonicalPath)
    || /[\\?#]/.test(plan.canonicalPath)
    || plan.canonicalPath.split('/').some((segment) => segment === '.' || segment === '..')) {
    bindingValidationFailure('broker_read_plan_path_invalid')
  }
  const templatePattern = contract.constantPathTemplate
    .split('/')
    .map((segment) => /^\{[A-Za-z][A-Za-z0-9_]*\}$/.test(segment)
      ? '[^/]+'
      : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('/')
  if (!new RegExp(`^${templatePattern}$`).test(plan.canonicalPath)) {
    bindingValidationFailure('broker_read_plan_path_template_mismatch')
  }
  for (const value of [plan.pathTemplateId, plan.planContractVersion]) requireNonEmptyString(value, 'broker_read_plan_required_string_empty')
  if (plan.pageSequenceContractVersion !== contract.pageSequenceContractVersion
    || plan.pageSequenceContractVersion !== PAGE_SEQUENCE_CONTRACT_VERSION) {
    bindingValidationFailure('broker_read_plan_page_sequence_contract_mismatch')
  }
  if (!Number.isSafeInteger(plan.pageSequence) || plan.pageSequence < 0) {
    bindingValidationFailure('broker_read_plan_page_sequence_invalid')
  }
  if (plan.authorityPurpose === 'capture'
    && plan.pageSequence >= (authority as CaptureAuthorityTuple).captureBudget.pageLimit) {
    bindingValidationFailure('broker_read_plan_page_sequence_exceeds_authority_budget')
  }
  requirePositiveSafeInteger(plan.responseByteLimit, 'broker_read_plan_response_limit_invalid')
  if (plan.responseByteLimit > responseByteLimit) bindingValidationFailure('broker_read_plan_response_limit_exceeds_authority')
  requirePositiveSafeInteger(plan.requestTimeoutMs, 'broker_read_plan_timeout_invalid')
  if (!isPlainRecord(plan.canonicalQuery)
    || Object.keys(plan.canonicalQuery).some((key) => key.trim().length === 0)
    || Object.values(plan.canonicalQuery).some((value) => typeof value !== 'string')) {
    bindingValidationFailure('broker_read_plan_query_invalid')
  }
  const computedPlanDigest = canonicalSha256(requestPlanDigestInput(plan))
  if (plan.requestBinding.queryDigest !== canonicalSha256(plan.canonicalQuery)
    || plan.requestBinding.canonicalUnsignedRequestDigest !== computedPlanDigest
    || plan.canonicalUnsignedRequestDigest !== computedPlanDigest) {
    bindingValidationFailure('broker_read_plan_digest_mismatch')
  }
}

function validatePermit(
  permit: AuthorizedBrokerReadPermit<BrokerRequestAuthorizationBinding<CaptureRequestBinding<CaptureChainBinding<string>, string>, string>>
    | AuthorizedConnectionProbePermit<BrokerRequestAuthorizationBinding<ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>, string>>,
  authorityDeadlineAt: string,
  nowMs?: number,
) {
  exactKeys(permit, [
    'authority', 'canonicalUnsignedRequestDigest', 'requestAuthorityId', 'authorizationBinding',
    'permitContractVersion', 'singleUse', 'issuedAt', 'sendDeadlineAt',
  ], 'broker_read_permit_shape_invalid')
  const request = permit.authorizationBinding.requestBinding
  if (permit.permitContractVersion !== BROKER_READ_PERMIT_CONTRACT_VERSION) {
    bindingValidationFailure('broker_read_permit_contract_invalid')
  }
  if (!sameCanonicalSemantics(permit.authority, request.chainBinding.authority)
    || permit.canonicalUnsignedRequestDigest !== request.canonicalUnsignedRequestDigest
    || permit.requestAuthorityId !== permit.authorizationBinding.requestAuthorityId) {
    bindingValidationFailure('broker_read_permit_binding_mismatch')
  }
  if (permit.singleUse !== true || !isCanonicalUtcInstant(permit.issuedAt) || !isCanonicalUtcInstant(permit.sendDeadlineAt)
    || Date.parse(permit.issuedAt) > Date.parse(permit.sendDeadlineAt)
    || Date.parse(permit.sendDeadlineAt) > Date.parse(authorityDeadlineAt)
    || (nowMs !== undefined && (!Number.isSafeInteger(nowMs)
      || nowMs < 0
      || Date.parse(permit.issuedAt) > nowMs + MAX_CLOCK_SKEW_MS
      || nowMs >= Date.parse(permit.sendDeadlineAt)))) {
    bindingValidationFailure('broker_read_permit_invalid')
  }
}

export function validateCaptureBrokerReadExecution<
  RequestBinding extends CaptureRequestBinding<CaptureChainBinding<string>, string>,
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
>(
  execution: CaptureBrokerReadExecution<RequestBinding, AuthorizationBinding>,
  trustedNowEpochMs?: number,
): RuntimeValidatedCaptureBrokerReadExecution<RequestBinding, AuthorizationBinding> {
  const snapshot = canonicalSnapshot(execution)
  exactKeys(snapshot, [
    'authorityPurpose', 'capabilityContract', 'requestBinding', 'authorizationBinding', 'plan', 'permit',
  ], 'capture_execution_shape_invalid')
  if (snapshot.authorityPurpose !== 'capture') bindingValidationFailure('capture_execution_purpose_invalid')
  const authority = snapshot.requestBinding.chainBinding.authority
  validateCaptureRequestBinding(snapshot.requestBinding)
  validateCaptureRequestBinding(snapshot.plan.requestBinding)
  validateCaptureAuthorizationBinding(snapshot.authorizationBinding)
  validateCaptureAuthorizationBinding(snapshot.permit.authorizationBinding)
  validateCapabilityContract(snapshot.capabilityContract, authority.provider)
  validatePlan(snapshot.plan, snapshot.capabilityContract, authority.captureBudget.responseByteLimit)
  validatePermit(snapshot.permit, authority.captureBudget.requestDeadlineAt, trustedNowEpochMs)
  if (!sameCaptureRequest(snapshot.requestBinding, snapshot.plan.requestBinding)) {
    bindingValidationFailure('capture_execution_plan_request_mismatch')
  }
  if (!sameCaptureAuthorization(snapshot.authorizationBinding, snapshot.permit.authorizationBinding)) {
    bindingValidationFailure('capture_execution_permit_authorization_mismatch')
  }
  if (!sameCaptureRequest(snapshot.requestBinding, snapshot.authorizationBinding.requestBinding)) {
    bindingValidationFailure('capture_execution_authorization_request_mismatch')
  }
  validatedCaptureExecutions.add(snapshot)
  return snapshot as RuntimeValidatedCaptureBrokerReadExecution<RequestBinding, AuthorizationBinding>
}

export function validateConnectionProbeBrokerReadExecution<
  RequestBinding extends ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
>(
  execution: ConnectionProbeBrokerReadExecution<RequestBinding, AuthorizationBinding>,
  trustedNowEpochMs?: number,
): RuntimeValidatedConnectionProbeBrokerReadExecution<RequestBinding, AuthorizationBinding> {
  const snapshot = canonicalSnapshot(execution)
  exactKeys(snapshot, [
    'authorityPurpose', 'capabilityContract', 'requestBinding', 'authorizationBinding', 'plan', 'permit',
  ], 'probe_execution_shape_invalid')
  if (snapshot.authorityPurpose !== 'connection_probe') bindingValidationFailure('probe_execution_purpose_invalid')
  const authority = snapshot.requestBinding.chainBinding.authority
  validateProbeRequestBinding(snapshot.requestBinding)
  validateProbeRequestBinding(snapshot.plan.requestBinding)
  validateProbeAuthorizationBinding(snapshot.authorizationBinding)
  validateProbeAuthorizationBinding(snapshot.permit.authorizationBinding)
  validateCapabilityContract(snapshot.capabilityContract, authority.provider)
  validatePlan(snapshot.plan, snapshot.capabilityContract, authority.probeBudget.responseByteLimit)
  validatePermit(snapshot.permit, authority.probeBudget.absoluteDeadlineAt, trustedNowEpochMs)
  if (!sameProbeRequest(snapshot.requestBinding, snapshot.plan.requestBinding)) {
    bindingValidationFailure('probe_execution_plan_request_mismatch')
  }
  if (!sameProbeAuthorization(snapshot.authorizationBinding, snapshot.permit.authorizationBinding)) {
    bindingValidationFailure('probe_execution_permit_authorization_mismatch')
  }
  if (!sameProbeRequest(snapshot.requestBinding, snapshot.authorizationBinding.requestBinding)) {
    bindingValidationFailure('probe_execution_authorization_request_mismatch')
  }
  validatedProbeExecutions.add(snapshot)
  return snapshot as RuntimeValidatedConnectionProbeBrokerReadExecution<RequestBinding, AuthorizationBinding>
}

function promoteControlPlaneConsumedCaptureExecution<
  RequestBinding extends CaptureRequestBinding<CaptureChainBinding<string>, string>,
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
>(execution: RuntimeValidatedCaptureBrokerReadExecution<RequestBinding, AuthorizationBinding>): RuntimeConsumedCaptureBrokerReadExecution<RequestBinding, AuthorizationBinding> {
  if (!validatedCaptureExecutions.has(execution)) {
    bindingValidationFailure('capture_execution_not_validated_at_consume')
  }
  const snapshot = cloneCanonicalValue(execution) as CaptureBrokerReadExecution<RequestBinding, AuthorizationBinding>
  const consumedSnapshot = deepFreezeSnapshot(snapshot)
  validatedCaptureExecutions.add(consumedSnapshot)
  consumedCaptureExecutions.add(consumedSnapshot)
  return consumedSnapshot as RuntimeConsumedCaptureBrokerReadExecution<RequestBinding, AuthorizationBinding>
}

function promoteControlPlaneConsumedProbeExecution<
  RequestBinding extends ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
>(execution: RuntimeValidatedConnectionProbeBrokerReadExecution<RequestBinding, AuthorizationBinding>): RuntimeConsumedConnectionProbeBrokerReadExecution<RequestBinding, AuthorizationBinding> {
  if (!validatedProbeExecutions.has(execution)) {
    bindingValidationFailure('probe_execution_not_validated_at_consume')
  }
  const snapshot = cloneCanonicalValue(execution) as ConnectionProbeBrokerReadExecution<RequestBinding, AuthorizationBinding>
  const consumedSnapshot = deepFreezeSnapshot(snapshot)
  validatedProbeExecutions.add(consumedSnapshot)
  consumedProbeExecutions.add(consumedSnapshot)
  return consumedSnapshot as RuntimeConsumedConnectionProbeBrokerReadExecution<RequestBinding, AuthorizationBinding>
}

export function validateCaptureWirePage<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
>(candidate: CaptureWirePageCandidate<PageBinding>): RuntimeValidatedCaptureWirePage<PageBinding> {
  if (!consumedCaptureExecutions.has(candidate.execution)
    || !validatedCaptureExecutions.has(candidate.execution)) {
    bindingValidationFailure('capture_wire_page_execution_not_consumed')
  }
  if (egressWireExecutionBindings.get(candidate.wireResponse) !== candidate.execution) {
    bindingValidationFailure('capture_wire_response_not_issued_by_central_egress')
  }
  if (captureWirePageBindings.has(candidate.wireResponse)) {
    bindingValidationFailure('capture_wire_response_already_bound_to_page')
  }
  const snapshot = cloneCanonicalValue(candidate) as CaptureWirePageCandidate<PageBinding>
  exactKeys(snapshot, ['execution', 'wireResponse', 'pageBinding'], 'capture_wire_page_shape_invalid')
  exactKeys(snapshot.wireResponse, [
    'authorityPurpose', 'authorizationBinding', 'methodEvidence', 'originEvidence', 'pathTemplateEvidence',
    'queryDigest', 'startedAt', 'receivedAt', 'httpStatus', 'rawBody', 'rawBodyDigest', 'rawBodyBytes',
  ], 'capture_wire_response_shape_invalid')
  validateCapturePageBinding(snapshot.pageBinding)
  const wire = snapshot.wireResponse
  if (!sameCaptureAuthorization(wire.authorizationBinding, snapshot.pageBinding.authorizationBinding)
    || !sameCaptureAuthorization(wire.authorizationBinding, snapshot.execution.authorizationBinding)) {
    bindingValidationFailure('capture_wire_page_authorization_mismatch')
  }
  if (wire.queryDigest !== snapshot.pageBinding.authorizationBinding.requestBinding.queryDigest
    || wire.queryDigest !== snapshot.execution.requestBinding.queryDigest) {
    bindingValidationFailure('capture_wire_page_query_digest_mismatch')
  }
  if (snapshot.pageBinding.pageObservationId !== computeCapturePageObservationId(wire)) {
    bindingValidationFailure('capture_page_observation_id_not_wire_derived')
  }
  if (snapshot.pageBinding.pageSequence !== snapshot.execution.plan.pageSequence) {
    bindingValidationFailure('capture_wire_page_plan_sequence_mismatch')
  }
  if (wire.authorityPurpose !== 'capture'
    || wire.methodEvidence !== snapshot.execution.plan.method
    || wire.originEvidence !== snapshot.execution.plan.httpsOrigin
    || wire.pathTemplateEvidence !== snapshot.execution.plan.pathTemplateId) {
    bindingValidationFailure('capture_wire_page_plan_evidence_mismatch')
  }
  if (!isCanonicalUtcInstant(wire.startedAt)
    || !isCanonicalUtcInstant(wire.receivedAt)
    || Date.parse(wire.startedAt) > Date.parse(wire.receivedAt)
    || Date.parse(wire.startedAt) < Date.parse(snapshot.execution.permit.issuedAt)
    || Date.parse(wire.startedAt) >= Date.parse(snapshot.execution.permit.sendDeadlineAt)
    || Date.parse(wire.receivedAt) > Date.parse(snapshot.execution.requestBinding.chainBinding.authority.captureBudget.requestDeadlineAt)
    || Date.parse(wire.receivedAt) > Date.parse(snapshot.pageBinding.observedAt)
    || Date.parse(snapshot.pageBinding.observedAt) > Date.parse(snapshot.execution.requestBinding.chainBinding.authority.captureBudget.requestDeadlineAt)) {
    bindingValidationFailure('capture_wire_page_time_invalid')
  }
  if (!Number.isSafeInteger(wire.httpStatus) || wire.httpStatus < 100 || wire.httpStatus > 599) {
    bindingValidationFailure('capture_wire_page_http_status_invalid')
  }
  if (!Array.isArray(wire.rawBody)
    || wire.rawBody.some((byte) => !Number.isSafeInteger(byte) || byte < 0 || byte > 255)
    || wire.rawBodyBytes !== wire.rawBody.length
    || wire.rawBodyBytes > snapshot.execution.plan.responseByteLimit) {
    bindingValidationFailure('capture_wire_page_body_shape_or_limit_invalid')
  }
  const rawBodyDigest = createHash('sha256').update(Buffer.from(wire.rawBody)).digest('hex')
  if (wire.rawBodyDigest !== rawBodyDigest) bindingValidationFailure('capture_wire_page_body_digest_mismatch')
  const validatedSnapshot = deepFreezeSnapshot(snapshot)
  validatedCaptureWirePages.add(validatedSnapshot)
  captureWirePageBindings.set(candidate.wireResponse, validatedSnapshot)
  return validatedSnapshot as RuntimeValidatedCaptureWirePage<PageBinding>
}

export function computeBrokerWireEvidenceDigest(wire: BrokerWireResponse<BrokerRequestAuthorizationBinding<AnyBrokerRequestBinding, string>>) {
  const { rawBody: _rawBody, ...evidence } = wire
  return canonicalSha256(evidence)
}

export function computeCapturePageObservationId(
  wire: BrokerWireResponse<BrokerRequestAuthorizationBinding<CaptureRequestBinding<CaptureChainBinding<string>, string>, string>>,
) {
  return `capture-page-v1:${canonicalSha256({
    observationIdentityContractVersion: 'equora-capture-page-observation-identity-v1',
    authorityPurpose: wire.authorityPurpose,
    requestAuthorityId: wire.authorizationBinding.requestAuthorityId,
    queryDigest: wire.queryDigest,
    startedAt: wire.startedAt,
    receivedAt: wire.receivedAt,
    rawBodyDigest: wire.rawBodyDigest,
    rawBodyBytes: wire.rawBodyBytes,
  })}`
}

export function validateConnectionProbeWireResponse<
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<
    ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
    string
  >,
>(candidate: ConnectionProbeWireCandidate<AuthorizationBinding>): RuntimeValidatedConnectionProbeWire<AuthorizationBinding> {
  if (!consumedProbeExecutions.has(candidate.execution) || !validatedProbeExecutions.has(candidate.execution)) {
    bindingValidationFailure('probe_wire_execution_not_control_plane_consumed')
  }
  if (egressWireExecutionBindings.get(candidate.wireResponse) !== candidate.execution) {
    bindingValidationFailure('probe_wire_response_not_issued_by_central_egress')
  }
  const snapshot = canonicalSnapshot(candidate)
  exactKeys(snapshot, ['execution', 'wireResponse'], 'probe_wire_candidate_shape_invalid')
  const wire = snapshot.wireResponse
  exactKeys(wire, [
    'authorityPurpose', 'authorizationBinding', 'methodEvidence', 'originEvidence', 'pathTemplateEvidence',
    'queryDigest', 'startedAt', 'receivedAt', 'httpStatus', 'rawBody', 'rawBodyDigest', 'rawBodyBytes',
  ], 'probe_wire_response_shape_invalid')
  if (!sameProbeAuthorization(wire.authorizationBinding, snapshot.execution.authorizationBinding)
    || wire.authorityPurpose !== 'connection_probe'
    || wire.methodEvidence !== snapshot.execution.plan.method
    || wire.originEvidence !== snapshot.execution.plan.httpsOrigin
    || wire.pathTemplateEvidence !== snapshot.execution.plan.pathTemplateId
    || wire.queryDigest !== snapshot.execution.requestBinding.queryDigest) {
    bindingValidationFailure('probe_wire_binding_or_plan_mismatch')
  }
  if (!isCanonicalUtcInstant(wire.startedAt)
    || !isCanonicalUtcInstant(wire.receivedAt)
    || Date.parse(wire.startedAt) < Date.parse(snapshot.execution.permit.issuedAt)
    || Date.parse(wire.startedAt) >= Date.parse(snapshot.execution.permit.sendDeadlineAt)
    || Date.parse(wire.startedAt) > Date.parse(wire.receivedAt)
    || Date.parse(wire.receivedAt) > Date.parse(snapshot.execution.requestBinding.chainBinding.authority.probeBudget.absoluteDeadlineAt)
    || !Number.isSafeInteger(wire.httpStatus)
    || wire.httpStatus < 100
    || wire.httpStatus > 599
    || !Array.isArray(wire.rawBody)
    || wire.rawBody.some((byte) => !Number.isSafeInteger(byte) || byte < 0 || byte > 255)
    || wire.rawBodyBytes !== wire.rawBody.length
    || wire.rawBodyBytes > snapshot.execution.requestBinding.chainBinding.authority.probeBudget.responseByteLimit
    || wire.rawBodyDigest !== createHash('sha256').update(Uint8Array.from(wire.rawBody)).digest('hex')) {
    bindingValidationFailure('probe_wire_evidence_invalid')
  }
  validatedConnectionProbeWires.add(snapshot)
  return snapshot as RuntimeValidatedConnectionProbeWire<AuthorizationBinding>
}

export function validateConnectionProbeCapabilityResult<
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<
    ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
    string
  >,
>(
  candidate: ConnectionProbeCapabilityResultCandidate<AuthorizationBinding>,
  wire: RuntimeValidatedConnectionProbeWire<AuthorizationBinding>,
): ConnectionProbeCapabilityResult<AuthorizationBinding> {
  if (!validatedConnectionProbeWires.has(wire)) bindingValidationFailure('probe_result_wire_not_validated')
  if (inspectedProbeResultWireBindings.get(candidate) !== wire) {
    bindingValidationFailure('probe_result_not_issued_by_registered_adapter')
  }
  const snapshot = canonicalSnapshot(candidate)
  exactKeys(snapshot, [
    'resultContractVersion', 'authorizationBinding', 'provider', 'capabilityProfile', 'responseContractVersion',
    'wireEvidenceDigest', 'probeScopeDigest', 'observedAt', 'technicalReadResult', 'permissionEvidenceResult',
    'accountIdentityResult', 'sanitizedFindings', 'persistenceAuthority', 'captureAuthority',
    'normalizationAuthority', 'reconciliationAuthority', 'approvalAuthority', 'importAuthority',
  ], 'probe_result_shape_invalid')
  const authority = wire.execution.requestBinding.chainBinding.authority
  if (snapshot.resultContractVersion !== 'equora-connection-probe-result-v1'
    || !sameProbeAuthorization(snapshot.authorizationBinding, wire.execution.authorizationBinding)
    || !sameProviderCapability(snapshot.provider, authority.provider)
    || !sameCapabilityProfile(snapshot.capabilityProfile, authority.capabilityProfile)
    || snapshot.responseContractVersion !== wire.execution.capabilityContract.responseContractVersion
    || snapshot.wireEvidenceDigest !== computeBrokerWireEvidenceDigest(wire.wireResponse)
    || snapshot.probeScopeDigest !== authority.purposeScopeDigest
    || !isCanonicalUtcInstant(snapshot.observedAt)
    || Date.parse(snapshot.observedAt) < Date.parse(wire.wireResponse.receivedAt)
    || Date.parse(snapshot.observedAt) > Date.parse(authority.probeBudget.absoluteDeadlineAt)
    || !['read_succeeded', 'read_failed'].includes(snapshot.technicalReadResult)
    || !['read_permission_observed', 'not_observed', 'blocked'].includes(snapshot.permissionEvidenceResult)
    || !['stable_identity_observed', 'not_observed', 'blocked'].includes(snapshot.accountIdentityResult)
    || !Array.isArray(snapshot.sanitizedFindings)
    || snapshot.sanitizedFindings.length > CONNECTION_PROBE_FINDING_CODES.size
    || new Set(snapshot.sanitizedFindings).size !== snapshot.sanitizedFindings.length
    || snapshot.sanitizedFindings.some((finding) => !CONNECTION_PROBE_FINDING_CODES.has(finding))
    || snapshot.persistenceAuthority !== 'sanitized_probe_receipt_only'
    || snapshot.captureAuthority !== 'none'
    || snapshot.normalizationAuthority !== 'none'
    || snapshot.reconciliationAuthority !== 'none'
    || snapshot.approvalAuthority !== 'none'
    || snapshot.importAuthority !== 'none') {
    bindingValidationFailure('probe_result_binding_or_semantics_invalid')
  }
  if (snapshot.technicalReadResult === 'read_failed'
    && (snapshot.permissionEvidenceResult === 'read_permission_observed'
      || snapshot.accountIdentityResult === 'stable_identity_observed')) {
    bindingValidationFailure('probe_result_overclaim')
  }
  const findingCodes = new Set(snapshot.sanitizedFindings)
  const technicalFailureCodes: ReadonlySet<ConnectionProbeFindingCode> = new Set([
    'provider_read_unavailable',
    'provider_response_contract_rejected',
    'provider_rate_limited',
    'provider_authentication_rejected',
  ])
  const hasTechnicalFailureCode = [...technicalFailureCodes].some((code) => findingCodes.has(code))
  if ((snapshot.technicalReadResult === 'read_succeeded' && hasTechnicalFailureCode)
    || (snapshot.technicalReadResult === 'read_failed' && !hasTechnicalFailureCode)
    || (snapshot.permissionEvidenceResult === 'read_permission_observed' && findingCodes.has('read_permission_not_observed'))
    || (snapshot.permissionEvidenceResult === 'not_observed') !== findingCodes.has('read_permission_not_observed')
    || (snapshot.accountIdentityResult === 'stable_identity_observed' && findingCodes.has('account_identity_not_observed'))
    || (snapshot.accountIdentityResult === 'not_observed') !== findingCodes.has('account_identity_not_observed')) {
    bindingValidationFailure('probe_result_finding_matrix_invalid')
  }
  validatedConnectionProbeResults.add(snapshot)
  return snapshot as ConnectionProbeCapabilityResult<AuthorizationBinding>
}

export function validateProviderPageTransition<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
>(candidate: ProviderPageTransitionInput<PageBinding>): RuntimeValidatedProviderPageTransitionInput<PageBinding> {
  if (!validatedCaptureWirePages.has(candidate.wirePage)) {
    bindingValidationFailure('page_transition_wire_page_not_validated')
  }
  if (inspectedCapturePageWireBindings.get(candidate.inspectedPage) !== candidate.wirePage) {
    bindingValidationFailure('page_transition_inspected_page_not_issued_by_registered_adapter')
  }
  const snapshot = cloneCanonicalValue(candidate) as ProviderPageTransitionInput<PageBinding>
  exactKeys(snapshot, ['workUnit', 'wirePage', 'inspectedPage'], 'page_transition_input_shape_invalid')
  exactKeys(snapshot.workUnit, ['chainBinding', 'integrityKeyReference', 'scope', 'checkpoint'], 'work_unit_shape_invalid')
  exactKeys(snapshot.workUnit.integrityKeyReference, ['id', 'keyVersion'], 'work_unit_integrity_key_shape_invalid')
  exactKeys(snapshot.workUnit.scope, [
    'instrumentScopeKey', 'requestWindowStartUs', 'requestWindowEndUs', 'positionType',
    'captureQueryProfileDigest',
  ], 'work_unit_scope_shape_invalid')
  exactKeys(snapshot.workUnit.checkpoint, [
    'checkpointContractVersion', 'captureQueryProfileDigest', 'payload', 'mac',
  ], 'work_unit_checkpoint_shape_invalid')
  exactKeys(snapshot.inspectedPage, [
    'pageBinding', 'responseContractVersion', 'requestEvidence', 'pageEvidence',
  ], 'inspected_page_shape_invalid')
  exactKeys(snapshot.inspectedPage.requestEvidence, [
    'authorizationBinding', 'methodEvidence', 'originEvidence', 'pathTemplateEvidence', 'queryDigest',
    'startedAt', 'receivedAt', 'wireBodyDigest', 'wireBodyBytes',
  ], 'capture_request_evidence_shape_invalid')
  exactKeys(snapshot.inspectedPage.pageEvidence, ['pageBinding', 'pagePayload'], 'capture_page_evidence_shape_invalid')
  const pageBinding = snapshot.inspectedPage.pageBinding
  validateCapturePageBinding(pageBinding)
  if (!sameCapturePage(snapshot.wirePage.pageBinding, pageBinding)
    || !sameCaptureAuthorization(snapshot.wirePage.wireResponse.authorizationBinding, pageBinding.authorizationBinding)) {
    bindingValidationFailure('page_transition_wire_page_binding_mismatch')
  }
  if (!sameCaptureChain(snapshot.workUnit.chainBinding, pageBinding.authorizationBinding.requestBinding.chainBinding)) {
    bindingValidationFailure('page_transition_work_unit_chain_mismatch')
  }
  if (!sameCaptureAuthorization(snapshot.inspectedPage.requestEvidence.authorizationBinding, pageBinding.authorizationBinding)) {
    bindingValidationFailure('page_transition_request_evidence_mismatch')
  }
  if (!sameCapturePage(snapshot.inspectedPage.pageEvidence.pageBinding, pageBinding)) {
    bindingValidationFailure('page_transition_page_evidence_mismatch')
  }
  const evidence = snapshot.inspectedPage.requestEvidence
  if (evidence.methodEvidence !== 'GET'
    || evidence.queryDigest !== pageBinding.authorizationBinding.requestBinding.queryDigest
    || !isCanonicalUtcInstant(evidence.startedAt)
    || !isCanonicalUtcInstant(evidence.receivedAt)
    || Date.parse(evidence.startedAt) > Date.parse(evidence.receivedAt)
    || Date.parse(evidence.receivedAt) > Date.parse(pageBinding.observedAt)
    || !evidence.originEvidence.trim()
    || !evidence.pathTemplateEvidence.trim()
    || !evidence.wireBodyDigest.trim()
    || !Number.isSafeInteger(evidence.wireBodyBytes)
    || evidence.wireBodyBytes < 0) {
    bindingValidationFailure('capture_request_evidence_invalid')
  }
  const wire = snapshot.wirePage.wireResponse
  if (evidence.methodEvidence !== wire.methodEvidence
    || evidence.originEvidence !== wire.originEvidence
    || evidence.pathTemplateEvidence !== wire.pathTemplateEvidence
    || evidence.queryDigest !== wire.queryDigest
    || evidence.startedAt !== wire.startedAt
    || evidence.receivedAt !== wire.receivedAt
    || evidence.wireBodyDigest !== wire.rawBodyDigest
    || evidence.wireBodyBytes !== wire.rawBodyBytes) {
    bindingValidationFailure('capture_request_evidence_wire_mismatch')
  }
  if (pageBinding.pagePayloadDigest !== canonicalSha256(snapshot.inspectedPage.pageEvidence.pagePayload)) {
    bindingValidationFailure('capture_page_payload_digest_mismatch')
  }
  if (snapshot.inspectedPage.responseContractVersion !== snapshot.wirePage.execution.capabilityContract.responseContractVersion) {
    bindingValidationFailure('capture_response_contract_version_mismatch')
  }
  requireNonEmptyStrings([
    snapshot.inspectedPage.responseContractVersion,
    snapshot.workUnit.integrityKeyReference.id,
    snapshot.workUnit.integrityKeyReference.keyVersion,
    snapshot.workUnit.scope.instrumentScopeKey,
    snapshot.workUnit.scope.requestWindowStartUs,
    snapshot.workUnit.scope.requestWindowEndUs,
    snapshot.workUnit.scope.captureQueryProfileDigest,
    snapshot.workUnit.checkpoint.checkpointContractVersion,
    snapshot.workUnit.checkpoint.captureQueryProfileDigest,
    snapshot.workUnit.checkpoint.mac,
  ], 'page_transition_required_string_empty')
  cloneCanonicalValue(snapshot.workUnit.checkpoint.payload)
  const authority = pageBinding.authorizationBinding.requestBinding.chainBinding.authority
  if (snapshot.workUnit.checkpoint.checkpointContractVersion !== authority.checkpointContractVersion
    || snapshot.workUnit.checkpoint.captureQueryProfileDigest !== snapshot.workUnit.scope.captureQueryProfileDigest
    || authority.purposeScopeDigest !== computeCapturePurposeScopeDigest(snapshot.workUnit.scope)
    || !/^\d+$/.test(snapshot.workUnit.scope.requestWindowStartUs)
    || !/^\d+$/.test(snapshot.workUnit.scope.requestWindowEndUs)
    || BigInt(snapshot.workUnit.scope.requestWindowStartUs) > BigInt(snapshot.workUnit.scope.requestWindowEndUs)
    || !/^[a-f0-9]{64}$/.test(snapshot.workUnit.scope.captureQueryProfileDigest)
    || snapshot.workUnit.scope.positionType !== null
      && snapshot.workUnit.scope.positionType !== '1'
      && snapshot.workUnit.scope.positionType !== '2') {
    bindingValidationFailure('page_transition_work_unit_semantics_invalid')
  }
  const validatedSnapshot = deepFreezeSnapshot(snapshot)
  validatedProviderPageTransitions.add(validatedSnapshot)
  return validatedSnapshot as RuntimeValidatedProviderPageTransitionInput<PageBinding>
}

function validateProviderEventIdentity(identity: ProviderEventIdentity) {
  if (!identity || !isPlainRecord(identity)) bindingValidationFailure('provider_identity_shape_invalid')
  exactKeys(identity, ['identityStatus', 'providerEventId', 'blockedIdentity'], 'provider_identity_shape_invalid')
  if (identity.identityStatus === 'stable_provider_id') {
    if (typeof identity.providerEventId !== 'string' || identity.providerEventId.trim().length === 0 || identity.blockedIdentity !== null) {
      bindingValidationFailure('stable_provider_identity_invalid')
    }
    return
  }
  if (identity.identityStatus !== 'blocked_identity' || !identity.blockedIdentity || !isPlainRecord(identity.blockedIdentity)) {
    bindingValidationFailure('provider_identity_discriminator_invalid')
  }
  exactKeys(identity.blockedIdentity, [
    'identityBlockContractVersion', 'reasonCode', 'identityFingerprint',
  ], 'blocked_provider_identity_shape_invalid')
  if (identity.providerEventId !== null
    || !identity.blockedIdentity.identityBlockContractVersion.trim()
    || !identity.blockedIdentity.reasonCode.trim()
    || !identity.blockedIdentity.identityFingerprint.trim()) {
    bindingValidationFailure('blocked_provider_identity_invalid')
  }
}

const CANONICAL_RAW_EVENT_KINDS: ReadonlySet<CanonicalRawEventKind> = new Set([
  'order',
  'execution',
  'position_revision',
  'funding_event',
  'account_financial_event',
  'instrument_metadata',
])

export function validateCaptureEventBatch<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
>(
  candidate: CaptureEventBatchCandidate<PageBinding>,
): UniqueCaptureEventBatch<PageBinding> {
  const snapshot = cloneCanonicalValue(candidate) as CaptureEventBatchCandidate<PageBinding>
  exactKeys(snapshot, ['pageBinding', 'eventCount', 'eventOrdinalContract', 'eventObservationIdsDigest', 'events'], 'event_batch_shape_invalid')
  validateCapturePageBinding(snapshot.pageBinding)
  if (snapshot.eventOrdinalContract !== 'zero_based_contiguous_v1') {
    bindingValidationFailure('event_ordinal_contract_invalid')
  }
  if (!Number.isSafeInteger(snapshot.eventCount) || snapshot.eventCount < 0 || snapshot.eventCount !== snapshot.events.length) {
    bindingValidationFailure('event_count_mismatch')
  }
  const observationIds = new Set<string>()
  const orderedObservationIds: string[] = []
  for (const [index, event] of snapshot.events.entries()) {
    exactKeys(event, [
      'observationBinding', 'eventKind', 'providerIdentity', 'providerRevision', 'payloadEncoding', 'payload',
      'payloadDigest', 'normalizationAuthority', 'reconciliationAuthority', 'approvalAuthority', 'importAuthority',
    ], 'event_shape_invalid')
    const observation = event.observationBinding
    exactKeys(observation, [
      'pageBinding', 'eventObservationId', 'eventOrdinal', 'observedAt', 'providerOccurredAtUs',
      'eventObservationDigest', 'inheritedCompletenessStatus', 'observationAuthority',
    ], 'event_observation_shape_invalid')
    const observationId = observation.eventObservationId
    if (typeof observationId !== 'string' || observationId.trim().length === 0) {
      bindingValidationFailure('event_observation_id_empty')
    }
    if (observationIds.has(observationId)) bindingValidationFailure('event_observation_id_duplicate')
    observationIds.add(observationId)
    orderedObservationIds.push(observationId)
    if (!Number.isSafeInteger(observation.eventOrdinal) || observation.eventOrdinal !== index) {
      bindingValidationFailure('event_ordinal_not_zero_based_contiguous')
    }
    if (!sameCapturePage(observation.pageBinding, snapshot.pageBinding)) {
      bindingValidationFailure('event_page_binding_mismatch')
    }
    if (observation.inheritedCompletenessStatus !== snapshot.pageBinding.completenessStatus) {
      bindingValidationFailure('event_completeness_mismatch')
    }
    if (!isCanonicalUtcInstant(observation.observedAt)
      || observation.observedAt !== snapshot.pageBinding.observedAt
      || observation.providerOccurredAtUs !== null && !/^\d+$/.test(observation.providerOccurredAtUs)
      || !observation.eventObservationDigest.trim()
      || !event.payloadDigest.trim()) {
      bindingValidationFailure('event_required_digest_or_time_empty')
    }
    if (observation.observationAuthority !== 'provider_observed_unreconciled') bindingValidationFailure('event_observation_authority_invalid')
    if (!CANONICAL_RAW_EVENT_KINDS.has(event.eventKind)) bindingValidationFailure('event_kind_invalid')
    if (event.payloadEncoding !== 'canonical_json_v1') bindingValidationFailure('event_payload_encoding_invalid')
    if (event.providerRevision !== null && (typeof event.providerRevision !== 'string' || !event.providerRevision.trim())) {
      bindingValidationFailure('event_provider_revision_invalid')
    }
    if (event.normalizationAuthority !== 'blocked_pending_versioned_normalization'
      || event.reconciliationAuthority !== 'none'
      || event.approvalAuthority !== 'none'
      || event.importAuthority !== 'none') {
      bindingValidationFailure('event_downstream_authority_invalid')
    }
    cloneCanonicalValue(event.payload)
    validateProviderEventIdentity(event.providerIdentity)
    if (event.payloadDigest !== canonicalSha256(event.payload)) bindingValidationFailure('event_payload_digest_mismatch')
    const { eventObservationDigest: _providedDigest, ...observationDigestInput } = event.observationBinding
    if (event.observationBinding.eventObservationDigest !== canonicalSha256(observationDigestInput)) {
      bindingValidationFailure('event_observation_digest_mismatch')
    }
  }
  const expectedIdsDigest = canonicalSha256(orderedObservationIds)
  if (!expectedIdsDigest || snapshot.eventObservationIdsDigest !== expectedIdsDigest) {
    bindingValidationFailure('event_observation_ids_digest_mismatch')
  }
  const validatedSnapshot = deepFreezeSnapshot(snapshot)
  uniqueCaptureEventBatches.add(validatedSnapshot)
  return validatedSnapshot as UniqueCaptureEventBatch<PageBinding>
}

export type BrokerCheckpointMacVerification = Readonly<{
  macContractVersion: 'equora-provider-checkpoint-mac-v1'
  integrityKeyReference: BrokerReadWorkUnit<CaptureChainBinding<string>>['integrityKeyReference']
  authorityTupleDigest: string
  provider: ProviderCapabilityRef
  purposeScopeDigest: string
  checkpointContractVersion: string
  captureQueryProfileDigest: string
  canonicalMacInput: string
  mac: string
}>

export type BrokerCheckpointTransitionMacVerification = Readonly<{
  macContractVersion: 'equora-provider-checkpoint-transition-mac-v1'
  integrityKeyReference: BrokerReadWorkUnit<CaptureChainBinding<string>>['integrityKeyReference']
  authorityTupleDigest: string
  provider: ProviderCapabilityRef
  purposeScopeDigest: string
  pageObservationId: string
  transitionDigest: string
  canonicalMacInput: string
  mac: string
}>

export interface BrokerCheckpointIntegrityPort {
  verifyCheckpointMac(input: BrokerCheckpointMacVerification): boolean
  verifyCheckpointTransitionMac(input: BrokerCheckpointTransitionMacVerification): boolean
}

export type CaptureCommitBoundaryDependencies = Readonly<{
  trustedClock: BrokerTrustedClockPort
  checkpointIntegrity: BrokerCheckpointIntegrityPort
}>

export interface CaptureCommitBoundary {
  validateForCommit<
    PageBinding extends CapturePageObservationBinding<
      BrokerRequestAuthorizationBinding<
        CaptureRequestBinding<CaptureChainBinding<string>, string>,
        string
      >,
      string
    >,
  >(
    candidate: CaptureRawObservationCommit<PageBinding>,
    transitionContext: RuntimeValidatedProviderPageTransitionInput<PageBinding>,
  ): RuntimeValidatedCaptureRawObservationCommit<PageBinding>
}

export function computeCheckpointMacVerification(
  checkpoint: ProviderCheckpoint,
  context: ProviderPageTransitionInput<CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<CaptureRequestBinding<CaptureChainBinding<string>, string>, string>,
    string
  >>,
): BrokerCheckpointMacVerification {
  const authority = context.workUnit.chainBinding.authority
  const canonicalMacInput = encodeEquoraTcj({
    macContractVersion: 'equora-provider-checkpoint-mac-v1',
    authorityTupleDigest: authority.authorityTupleDigest,
    provider: authority.provider,
    capabilityProfile: authority.capabilityProfile,
    workUnitId: authority.workUnitId,
    purposeScopeDigest: authority.purposeScopeDigest,
    integrityKeyReference: context.workUnit.integrityKeyReference,
    checkpoint: {
      checkpointContractVersion: checkpoint.checkpointContractVersion,
      captureQueryProfileDigest: checkpoint.captureQueryProfileDigest,
      payload: checkpoint.payload,
    },
  })
  return canonicalSnapshot({
    macContractVersion: 'equora-provider-checkpoint-mac-v1',
    integrityKeyReference: context.workUnit.integrityKeyReference,
    authorityTupleDigest: authority.authorityTupleDigest,
    provider: authority.provider,
    purposeScopeDigest: authority.purposeScopeDigest,
    checkpointContractVersion: checkpoint.checkpointContractVersion,
    captureQueryProfileDigest: checkpoint.captureQueryProfileDigest,
    canonicalMacInput,
    mac: checkpoint.mac,
  })
}

export function computeCheckpointTransitionMacVerification(
  transition: ProviderCheckpointTransition<CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<CaptureRequestBinding<CaptureChainBinding<string>, string>, string>,
    string
  >>,
  context: ProviderPageTransitionInput<CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<CaptureRequestBinding<CaptureChainBinding<string>, string>, string>,
    string
  >>,
): BrokerCheckpointTransitionMacVerification {
  const authority = context.workUnit.chainBinding.authority
  const canonicalMacInput = encodeEquoraTcj({
    macContractVersion: 'equora-provider-checkpoint-transition-mac-v1',
    authorityTupleDigest: authority.authorityTupleDigest,
    provider: authority.provider,
    capabilityProfile: authority.capabilityProfile,
    workUnitId: authority.workUnitId,
    purposeScopeDigest: authority.purposeScopeDigest,
    integrityKeyReference: context.workUnit.integrityKeyReference,
    pageBinding: transition.pageBinding,
    previousCheckpointMac: transition.previousCheckpointMac,
    nextCheckpointMac: transition.nextCheckpoint.mac,
    transitionDigest: transition.transitionDigest,
    status: transition.status,
  })
  return canonicalSnapshot({
    macContractVersion: 'equora-provider-checkpoint-transition-mac-v1',
    integrityKeyReference: context.workUnit.integrityKeyReference,
    authorityTupleDigest: authority.authorityTupleDigest,
    provider: authority.provider,
    purposeScopeDigest: authority.purposeScopeDigest,
    pageObservationId: transition.pageBinding.pageObservationId,
    transitionDigest: transition.transitionDigest,
    canonicalMacInput,
    mac: transition.transitionMac,
  })
}

function validateCaptureRawObservationCommitWithIntegrity<
  PageBinding extends CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<
      CaptureRequestBinding<CaptureChainBinding<string>, string>,
      string
    >,
    string
  >,
>(
  candidate: CaptureRawObservationCommit<PageBinding>,
  transitionContext: RuntimeValidatedProviderPageTransitionInput<PageBinding>,
  dependencies: CaptureCommitBoundaryDependencies,
): RuntimeValidatedCaptureRawObservationCommit<PageBinding> {
  if (!validatedProviderPageTransitions.has(transitionContext)) {
    bindingValidationFailure('capture_commit_transition_context_not_validated')
  }
  const batchSnapshot = validateCaptureEventBatch(candidate.envelope.eventBatch)
  const contextSnapshot = cloneCanonicalValue(transitionContext) as ProviderPageTransitionInput<PageBinding>
  const unbrandedSnapshot = cloneCanonicalValue({
    ...candidate,
    envelope: { ...candidate.envelope, eventBatch: batchSnapshot },
  }) as CaptureRawObservationCommit<PageBinding>
  exactKeys(unbrandedSnapshot, [
    'authorityPurpose', 'pageBinding', 'envelope', 'checkpointTransition', 'committedAt',
    'commitReceiptDigest', 'persistenceAuthority',
  ], 'capture_commit_shape_invalid')
  exactKeys(unbrandedSnapshot.envelope, [
    'pageBinding', 'rawObservationId', 'rawObservationDigest', 'observationContractVersion',
    'observationAuthority', 'normalizationAuthority', 'reconciliationAuthority', 'approvalAuthority',
    'importAuthority', 'requestEvidence', 'pageEvidence', 'eventBatch',
  ], 'capture_envelope_shape_invalid')
  exactKeys(unbrandedSnapshot.envelope.requestEvidence, [
    'authorizationBinding', 'methodEvidence', 'originEvidence', 'pathTemplateEvidence', 'queryDigest',
    'startedAt', 'receivedAt', 'wireBodyDigest', 'wireBodyBytes',
  ], 'capture_commit_request_evidence_shape_invalid')
  exactKeys(unbrandedSnapshot.envelope.pageEvidence, ['pageBinding', 'pagePayload'], 'capture_commit_page_evidence_shape_invalid')
  exactKeys(unbrandedSnapshot.checkpointTransition, [
    'pageBinding', 'previousCheckpoint', 'previousCheckpointMac', 'nextCheckpoint', 'transitionDigest',
    'transitionMac', 'status',
  ], 'checkpoint_transition_shape_invalid')
  exactKeys(unbrandedSnapshot.checkpointTransition.previousCheckpoint, [
    'checkpointContractVersion', 'captureQueryProfileDigest', 'payload', 'mac',
  ], 'previous_checkpoint_shape_invalid')
  exactKeys(unbrandedSnapshot.checkpointTransition.nextCheckpoint, [
    'checkpointContractVersion', 'captureQueryProfileDigest', 'payload', 'mac',
  ], 'next_checkpoint_shape_invalid')
  if (unbrandedSnapshot.authorityPurpose !== 'capture'
    || unbrandedSnapshot.persistenceAuthority !== 'append_only_raw_observation'
    || unbrandedSnapshot.envelope.observationAuthority !== 'provider_observed_unreconciled'
    || unbrandedSnapshot.envelope.normalizationAuthority !== 'blocked_pending_versioned_normalization'
    || unbrandedSnapshot.envelope.reconciliationAuthority !== 'none'
    || unbrandedSnapshot.envelope.approvalAuthority !== 'none'
    || unbrandedSnapshot.envelope.importAuthority !== 'none') {
    bindingValidationFailure('capture_commit_authority_invalid')
  }
  for (const value of [
    unbrandedSnapshot.envelope.rawObservationId,
    unbrandedSnapshot.envelope.rawObservationDigest,
    unbrandedSnapshot.envelope.observationContractVersion,
    unbrandedSnapshot.commitReceiptDigest,
  ]) requireNonEmptyString(value, 'capture_commit_required_string_empty')
  validateCapturePageBinding(unbrandedSnapshot.pageBinding)
  const commitNow = trustedNow(dependencies.trustedClock)
  if (!isCanonicalUtcInstant(unbrandedSnapshot.committedAt)
    || Date.parse(unbrandedSnapshot.committedAt) < Date.parse(unbrandedSnapshot.pageBinding.observedAt)
    || Date.parse(unbrandedSnapshot.committedAt) > commitNow + MAX_CLOCK_SKEW_MS) {
    bindingValidationFailure('capture_commit_time_invalid')
  }
  if (!sameCapturePage(unbrandedSnapshot.pageBinding, unbrandedSnapshot.envelope.pageBinding)
    || !sameCapturePage(unbrandedSnapshot.pageBinding, unbrandedSnapshot.checkpointTransition.pageBinding)
    || !sameCapturePage(unbrandedSnapshot.pageBinding, unbrandedSnapshot.envelope.pageEvidence.pageBinding)
    || !sameCapturePage(unbrandedSnapshot.pageBinding, unbrandedSnapshot.envelope.eventBatch.pageBinding)) {
    bindingValidationFailure('capture_commit_page_binding_mismatch')
  }
  if (!sameCapturePage(unbrandedSnapshot.pageBinding, contextSnapshot.inspectedPage.pageBinding)
    || !sameCapturePage(unbrandedSnapshot.pageBinding, contextSnapshot.wirePage.pageBinding)
    || !sameCaptureChain(
      contextSnapshot.workUnit.chainBinding,
      unbrandedSnapshot.pageBinding.authorizationBinding.requestBinding.chainBinding,
    )) {
    bindingValidationFailure('capture_commit_transition_context_mismatch')
  }
  if (!sameCaptureAuthorization(unbrandedSnapshot.pageBinding.authorizationBinding, unbrandedSnapshot.envelope.requestEvidence.authorizationBinding)) {
    bindingValidationFailure('capture_commit_request_evidence_mismatch')
  }
  if (!sameCanonicalSemantics(unbrandedSnapshot.envelope.requestEvidence, contextSnapshot.inspectedPage.requestEvidence)
    || !sameCanonicalSemantics(unbrandedSnapshot.envelope.pageEvidence, contextSnapshot.inspectedPage.pageEvidence)) {
    bindingValidationFailure('capture_commit_provenance_context_mismatch')
  }
  const requestEvidence = unbrandedSnapshot.envelope.requestEvidence
  if (requestEvidence.methodEvidence !== 'GET'
    || requestEvidence.queryDigest !== unbrandedSnapshot.pageBinding.authorizationBinding.requestBinding.queryDigest
    || !isCanonicalUtcInstant(requestEvidence.startedAt)
    || !isCanonicalUtcInstant(requestEvidence.receivedAt)
    || Date.parse(requestEvidence.startedAt) > Date.parse(requestEvidence.receivedAt)
    || Date.parse(requestEvidence.receivedAt) > Date.parse(unbrandedSnapshot.pageBinding.observedAt)
    || !requestEvidence.originEvidence.trim()
    || !requestEvidence.pathTemplateEvidence.trim()
    || !requestEvidence.wireBodyDigest.trim()
    || !Number.isSafeInteger(requestEvidence.wireBodyBytes)
    || requestEvidence.wireBodyBytes < 0) {
    bindingValidationFailure('capture_commit_request_evidence_invalid')
  }
  if (unbrandedSnapshot.pageBinding.pagePayloadDigest !== canonicalSha256(unbrandedSnapshot.envelope.pageEvidence.pagePayload)) {
    bindingValidationFailure('capture_commit_page_payload_digest_mismatch')
  }
  const { rawObservationDigest: _providedRawDigest, ...rawObservationDigestInput } = unbrandedSnapshot.envelope
  if (unbrandedSnapshot.envelope.rawObservationDigest !== canonicalSha256(rawObservationDigestInput)) {
    bindingValidationFailure('capture_raw_observation_digest_mismatch')
  }
  const transition = unbrandedSnapshot.checkpointTransition
  const authorityCheckpointContract = unbrandedSnapshot.pageBinding.authorizationBinding.requestBinding.chainBinding.authority.checkpointContractVersion
  requireNonEmptyStrings([
    transition.previousCheckpoint.checkpointContractVersion,
    transition.previousCheckpoint.captureQueryProfileDigest,
    transition.previousCheckpoint.mac,
    transition.previousCheckpointMac,
    transition.nextCheckpoint.checkpointContractVersion,
    transition.nextCheckpoint.captureQueryProfileDigest,
    transition.nextCheckpoint.mac,
    transition.transitionDigest,
    transition.transitionMac,
  ], 'checkpoint_transition_required_string_empty')
  if (transition.previousCheckpointMac !== transition.previousCheckpoint.mac
    || !sameCanonicalSemantics(transition.previousCheckpoint, contextSnapshot.workUnit.checkpoint)
    || transition.previousCheckpoint.checkpointContractVersion !== authorityCheckpointContract
    || transition.nextCheckpoint.checkpointContractVersion !== authorityCheckpointContract
    || transition.previousCheckpoint.captureQueryProfileDigest !== contextSnapshot.workUnit.scope.captureQueryProfileDigest
    || transition.nextCheckpoint.captureQueryProfileDigest !== contextSnapshot.workUnit.scope.captureQueryProfileDigest) {
    bindingValidationFailure('checkpoint_transition_contract_or_mac_mismatch')
  }
  const integrityContext = contextSnapshot as unknown as ProviderPageTransitionInput<CapturePageObservationBinding<
    BrokerRequestAuthorizationBinding<CaptureRequestBinding<CaptureChainBinding<string>, string>, string>,
    string
  >>
  if (!dependencies.checkpointIntegrity.verifyCheckpointMac(
    computeCheckpointMacVerification(transition.previousCheckpoint, integrityContext),
  ) || !dependencies.checkpointIntegrity.verifyCheckpointMac(
    computeCheckpointMacVerification(transition.nextCheckpoint, integrityContext),
  )) {
    bindingValidationFailure('checkpoint_transition_mac_authentication_failed')
  }
  const requiredStatus: ProviderCheckpointTransition<PageBinding>['status'] = unbrandedSnapshot.pageBinding.completenessStatus === 'page_observed_scope_open'
    ? 'next_page'
    : unbrandedSnapshot.pageBinding.completenessStatus === 'scope_complete_provider_claim_unverified'
      ? 'complete'
      : unbrandedSnapshot.pageBinding.completenessStatus === 'partial_observation'
        ? 'partial'
        : 'blocked'
  if (transition.status !== requiredStatus) bindingValidationFailure('checkpoint_transition_status_mismatch')
  cloneCanonicalValue(transition.previousCheckpoint.payload)
  cloneCanonicalValue(transition.nextCheckpoint.payload)
  const {
    transitionDigest: _providedTransitionDigest,
    transitionMac: _providedTransitionMac,
    ...transitionDigestInput
  } = transition
  if (transition.transitionDigest !== canonicalSha256(transitionDigestInput)) {
    bindingValidationFailure('checkpoint_transition_digest_mismatch')
  }
  if (!dependencies.checkpointIntegrity.verifyCheckpointTransitionMac(
    computeCheckpointTransitionMacVerification(transition as unknown as ProviderCheckpointTransition<CapturePageObservationBinding<
      BrokerRequestAuthorizationBinding<CaptureRequestBinding<CaptureChainBinding<string>, string>, string>,
      string
    >>, integrityContext),
  )) {
    bindingValidationFailure('checkpoint_transition_provenance_mac_authentication_failed')
  }
  for (const event of unbrandedSnapshot.envelope.eventBatch.events) {
    if (!sameCapturePage(event.observationBinding.pageBinding, unbrandedSnapshot.pageBinding)) {
      bindingValidationFailure('capture_commit_event_page_mismatch')
    }
  }
  const { commitReceiptDigest: _providedReceiptDigest, ...commitReceiptDigestInput } = unbrandedSnapshot
  if (unbrandedSnapshot.commitReceiptDigest !== canonicalSha256(commitReceiptDigestInput)) {
    bindingValidationFailure('capture_commit_receipt_digest_mismatch')
  }
  const snapshot = cloneCanonicalValue(unbrandedSnapshot) as CaptureRawObservationCommit<PageBinding>
  const validatedSnapshot = deepFreezeSnapshot(snapshot)
  uniqueCaptureEventBatches.add(validatedSnapshot.envelope.eventBatch)
  validatedCaptureCommits.add(validatedSnapshot)
  return validatedSnapshot as RuntimeValidatedCaptureRawObservationCommit<PageBinding>
}

export function createCaptureCommitBoundary(dependencies: CaptureCommitBoundaryDependencies): CaptureCommitBoundary {
  if (!dependencies || isProxy(dependencies)) bindingValidationFailure('capture_commit_dependencies_proxy_or_missing')
  const boundDependencies: CaptureCommitBoundaryDependencies = Object.freeze({
    trustedClock: Object.freeze({
      nowEpochMs: bindRequiredPortMethod(dependencies.trustedClock, 'nowEpochMs') as BrokerTrustedClockPort['nowEpochMs'],
    }),
    checkpointIntegrity: Object.freeze({
      verifyCheckpointMac: bindRequiredPortMethod(
        dependencies.checkpointIntegrity,
        'verifyCheckpointMac',
      ) as BrokerCheckpointIntegrityPort['verifyCheckpointMac'],
      verifyCheckpointTransitionMac: bindRequiredPortMethod(
        dependencies.checkpointIntegrity,
        'verifyCheckpointTransitionMac',
      ) as BrokerCheckpointIntegrityPort['verifyCheckpointTransitionMac'],
    }),
  })
  return Object.freeze({
    validateForCommit<
      PageBinding extends CapturePageObservationBinding<
        BrokerRequestAuthorizationBinding<
          CaptureRequestBinding<CaptureChainBinding<string>, string>,
          string
        >,
        string
      >,
    >(
      candidate: CaptureRawObservationCommit<PageBinding>,
      transitionContext: RuntimeValidatedProviderPageTransitionInput<PageBinding>,
    ) {
      return validateCaptureRawObservationCommitWithIntegrity(candidate, transitionContext, boundDependencies)
    },
  })
}

export interface CaptureEventBatchValidator {
  validateUniqueEventBatch<
    PageBinding extends CapturePageObservationBinding<
      BrokerRequestAuthorizationBinding<
        CaptureRequestBinding<CaptureChainBinding<string>, string>,
        string
      >,
      string
    >,
  >(
    input: CaptureEventBatchCandidate<PageBinding>,
  ): UniqueCaptureEventBatch<PageBinding>
}

export const captureEventBatchValidator: CaptureEventBatchValidator = Object.freeze({
  validateUniqueEventBatch: validateCaptureEventBatch,
})

export interface ReadOnlyBrokerAdapter {
  readonly providerCode: ProviderCode
  readonly providerContractVersion: ProviderContractVersion
  readonly adapterVersion: AdapterVersion
  readonly capabilities: readonly ReadCapabilityDescriptor<unknown, unknown>[]

  prepareReadPlan<ChainBinding extends CaptureChainBinding<string>>(input: Readonly<{
    workUnit: BrokerReadWorkUnit<ChainBinding>
    requestId: string
    requestInput: CanonicalJsonValue
  }>): BrokerReadRequestPlanDraft
  prepareProbeReadPlan<ChainBinding extends ConnectionProbeChainBinding<string>>(input: Readonly<{
    probeWork: BrokerConnectionProbeWork<ChainBinding>
    requestId: string
    requestInput: CanonicalJsonValue
  }>): BrokerReadRequestPlanDraft
  inspectCaptureWireResponse<
    PageBinding extends CapturePageObservationBinding<
      BrokerRequestAuthorizationBinding<
        CaptureRequestBinding<CaptureChainBinding<string>, string>,
        string
      >,
      string
    >,
  >(input: RuntimeValidatedCaptureWirePage<PageBinding>): InspectedCapturePage<PageBinding>
  inspectConnectionProbeWireResponse<
    AuthorizationBinding extends BrokerRequestAuthorizationBinding<
      ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
      string
    >,
  >(
    input: RuntimeValidatedConnectionProbeWire<AuthorizationBinding>,
  ): ConnectionProbeCapabilityResultCandidate<AuthorizationBinding>
  advanceCheckpoint<
    PageBinding extends CapturePageObservationBinding<
      BrokerRequestAuthorizationBinding<
        CaptureRequestBinding<CaptureChainBinding<string>, string>,
        string
      >,
      string
    >,
  >(input: RuntimeValidatedProviderPageTransitionInput<PageBinding>): ProviderCheckpointAdvanceCandidate<PageBinding>
  mapRawEvents<
    PageBinding extends CapturePageObservationBinding<
      BrokerRequestAuthorizationBinding<
        CaptureRequestBinding<CaptureChainBinding<string>, string>,
        string
      >,
      string
    >,
  >(input: InspectedCapturePage<PageBinding>): readonly AdapterRawEventCandidate<PageBinding>[]
  classifyFailure(error: unknown): BrokerFailure
}

export interface BrokerRequestPlanningBoundary {
  prepareConnectionSetupCommand(input: Readonly<{
    authority: ConnectionProbeAuthorityTuple
    requestInput: CanonicalJsonValue
  }>): Promise<BrokerConnectionSetupCommand>
  prepareCaptureRead<ChainBinding extends CaptureChainBinding<string>, RequestId extends string>(input: Readonly<{
    workUnit: BrokerReadWorkUnit<ChainBinding>
    requestId: RequestId
    requestInput: CanonicalJsonValue
  }>): Promise<PlannedCaptureBrokerRead<ChainBinding, RequestId>>
  prepareConnectionProbeRead<ChainBinding extends ConnectionProbeChainBinding<string>, RequestId extends string>(input: Readonly<{
    probeWork: BrokerConnectionProbeWork<ChainBinding>
    requestId: RequestId
    requestInput: CanonicalJsonValue
  }>): Promise<PlannedConnectionProbeBrokerRead<ChainBinding, RequestId>>
}

export interface BrokerAdapterInspectionBoundary {
  inspectCaptureWireResponse<
    PageBinding extends CapturePageObservationBinding<
      BrokerRequestAuthorizationBinding<CaptureRequestBinding<CaptureChainBinding<string>, string>, string>,
      string
    >,
  >(wirePage: RuntimeValidatedCaptureWirePage<PageBinding>): Promise<InspectedCapturePage<PageBinding>>
  inspectConnectionProbeWireResponse<
    AuthorizationBinding extends BrokerRequestAuthorizationBinding<
      ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
      string
    >,
  >(wire: RuntimeValidatedConnectionProbeWire<AuthorizationBinding>): Promise<ConnectionProbeCapabilityResultCandidate<AuthorizationBinding>>
}

export type BrokerPermitConsumptionReceipt<Purpose extends BrokerAuthorityPurpose> = Readonly<{
  receiptContractVersion: 'equora-broker-permit-consumption-v1'
  consumptionKeyContractVersion: 'equora-broker-permit-consumption-key-v1'
  permitConsumptionId: string
  uniquenessScope: 'global_request_authority_all_workers'
  authorityPurpose: Purpose
  authorityTupleDigest: string
  requestAuthorityId: string
  canonicalUnsignedRequestDigest: string
  permitContractVersion: 'equora-broker-read-permit-v1'
  sendDeadlineAt: string
  consumedAt: string
  controlPlaneTransactionId: string
}>

export type BrokerTransportResponse = Readonly<{
  startedAt: string
  receivedAt: string
  httpStatus: number
  rawBody: Uint8Array
}>

export type BrokerSendAuthorization<Purpose extends BrokerAuthorityPurpose> = Readonly<{
  sendAuthorizationContractVersion: 'equora-broker-send-authorization-v2'
  authorityPurpose: Purpose
  authorityTupleDigest: string
  requestAuthorityId: string
  permitConsumptionId: string
  canonicalUnsignedRequestDigest: string
  capabilityDescriptorDigest: string
  runtimeAuthorityRefDigest: string
  runtimeAuthorityFenceId: string
  authorizedAtEpochMs: number
  sendDeadlineAt: string
}>

export type BrokerRuntimeAuthoritySendFenceConsumeCommand<Purpose extends BrokerAuthorityPurpose> = Readonly<{
  fenceContractVersion: 'equora-broker-runtime-authority-send-fence-v2'
  runtimeAuthorityFenceId: string
  uniquenessScope: 'deployment_full_authority_tuple_and_request'
  authorityPurpose: Purpose
  provider: ProviderCapabilityRef
  expectedRuntimeAuthority: BrokerRuntimeAuthorityRef<BrokerRuntimeModeForPurpose<Purpose>>
  expectedAuthorityTuple: BrokerAuthorityTupleForPurpose<Purpose>
  authorityTupleDigest: string
  requestAuthorityId: string
  permitConsumptionId: string
  canonicalUnsignedRequestDigest: string
  capabilityDescriptorDigest: string
  sendDeadlineAt: string
  trustedNowEpochMs: number
}>

export type BrokerRuntimeAuthoritySendFenceReceipt<Purpose extends BrokerAuthorityPurpose> = Readonly<{
  receiptContractVersion: 'equora-broker-runtime-authority-send-fence-receipt-v2'
  runtimeAuthorityFenceId: string
  uniquenessScope: 'deployment_full_authority_tuple_and_request'
  authorityPurpose: Purpose
  provider: ProviderCapabilityRef
  currentRuntimeAuthority: BrokerRuntimeAuthorityRef<BrokerRuntimeModeForPurpose<Purpose>>
  currentAuthorityTuple: BrokerAuthorityTupleForPurpose<Purpose>
  currentAuthorityTupleDigest: string
  authorityTupleDigest: string
  requestAuthorityId: string
  permitConsumptionId: string
  canonicalUnsignedRequestDigest: string
  capabilityDescriptorDigest: string
  sendDeadlineAt: string
  validatedAtEpochMs: number
  runtimeAuthorityTransactionId: string
}>

export type BrokerEgressCaptureResult<
  RequestBinding extends CaptureRequestBinding<CaptureChainBinding<string>, string>,
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
> = Readonly<{
  execution: RuntimeConsumedCaptureBrokerReadExecution<RequestBinding, AuthorizationBinding>
  wireResponse: BrokerWireResponse<AuthorizationBinding>
  consumptionReceipt: BrokerPermitConsumptionReceipt<'capture'>
}>

export type BrokerEgressConnectionProbeResult<
  RequestBinding extends ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
> = Readonly<{
  execution: RuntimeConsumedConnectionProbeBrokerReadExecution<RequestBinding, AuthorizationBinding>
  wireResponse: BrokerWireResponse<AuthorizationBinding>
  consumptionReceipt: BrokerPermitConsumptionReceipt<'connection_probe'>
}>

export interface BrokerTrustedClockPort {
  nowEpochMs(): number
}

export interface BrokerCodeRegistryPort {
  readBuiltCapability(ref: ProviderCapabilityRef): Promise<ReadCapabilityDescriptor<unknown, unknown> | null>
  readBuiltAdapter(ref: ProviderCapabilityRef): Promise<ReadOnlyBrokerAdapter | null>
}

export interface BrokerRuntimeAuthorityPort {
  readCurrentRuntimeAuthority(
    purpose: BrokerAuthorityPurpose,
    provider: ProviderCapabilityRef,
  ): Promise<BrokerRuntimeAuthorityRef<'capture'> | BrokerRuntimeAuthorityRef<'probe'> | null>
  /**
   * The implementation MUST read the complete current CaptureAuthorityTuple or
   * ConnectionProbeAuthorityTuple from its authoritative source, independently recompute that
   * tuple's digest with computeAuthorityTupleDigest, compare it with authorityTupleDigest and then
   * atomically consume runtimeAuthorityFenceId in the same transaction. It MUST NOT trust a digest
   * supplied by the caller as the current value. The transport invokes this operation exactly once
   * immediately before its private signing/send path. Any activation, activation-authority,
   * credential/session generation, policy, Runtime Authority, provider, scope or other tuple drift,
   * as well as revocation or replay, MUST fail without any network effect.
   */
  consumeCurrentRuntimeAuthoritySendFenceAtomically<Purpose extends BrokerAuthorityPurpose>(
    command: BrokerRuntimeAuthoritySendFenceConsumeCommand<Purpose>,
  ): Promise<BrokerRuntimeAuthoritySendFenceReceipt<Purpose>>
}

export type BrokerPermitConsumeCommand<
  Purpose extends BrokerAuthorityPurpose,
  Execution extends RuntimeValidatedCaptureBrokerReadExecution<any, any>
    | RuntimeValidatedConnectionProbeBrokerReadExecution<any, any>,
> = Readonly<{
  consumeContractVersion: 'equora-broker-permit-consume-v1'
  consumptionKeyContractVersion: 'equora-broker-permit-consumption-key-v1'
  permitConsumptionId: string
  uniquenessScope: 'global_request_authority_all_workers'
  authorityPurpose: Purpose
  execution: Execution
  authorityTupleDigest: string
  canonicalUnsignedRequestDigest: string
  capabilityDescriptorDigest: string
  currentRuntimeAuthority: Purpose extends 'capture'
    ? BrokerRuntimeAuthorityRef<'capture'>
    : BrokerRuntimeAuthorityRef<'probe'>
  trustedNowEpochMs: number
}>

export interface BrokerPermitControlPlanePort {
  /**
   * Each operation MUST enforce durable atomic uniqueness by permitConsumptionId across every
   * worker, process, retry path and CentralBrokerEgress instance in the deployment domain.
   */
  consumeCapturePermitAtomically(
    command: BrokerPermitConsumeCommand<'capture', RuntimeValidatedCaptureBrokerReadExecution<
      CaptureRequestBinding<CaptureChainBinding<string>, string>, BrokerRequestAuthorizationBinding<
        CaptureRequestBinding<CaptureChainBinding<string>, string>, string
      >>>,
  ): Promise<BrokerPermitConsumptionReceipt<'capture'>>
  consumeConnectionProbePermitAtomically(
    command: BrokerPermitConsumeCommand<'connection_probe', RuntimeValidatedConnectionProbeBrokerReadExecution<
      ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>, BrokerRequestAuthorizationBinding<
        ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>, string
      >>>,
  ): Promise<BrokerPermitConsumptionReceipt<'connection_probe'>>
}

export interface BrokerCredentialLoaderPort {
  loadCaptureCredentialMaterial(authority: CaptureAuthorityTuple): Promise<Uint8Array>
  loadConnectionProbeCredentialMaterial(authority: ConnectionProbeAuthorityTuple): Promise<Uint8Array>
}

export interface BrokerNetworkTransportPort {
  executeCentralRead<Binding extends AnyBrokerRequestBinding>(input: Readonly<{
    plan: BrokerReadRequestPlan<Binding>
    credentialMaterial: Uint8Array
    sendAuthorization: BrokerSendAuthorization<Binding['authorityPurpose']>
  }>): Promise<BrokerTransportResponse>
}

export type CentralBrokerEgressDependencies = Readonly<{
  trustedClock: BrokerTrustedClockPort
  codeRegistry: BrokerCodeRegistryPort
  runtimeAuthority: BrokerRuntimeAuthorityPort
  controlPlane: BrokerPermitControlPlanePort
  credentialLoader: BrokerCredentialLoaderPort
  networkTransport: BrokerNetworkTransportPort
}>

export interface CentralBrokerEgress {
  executeAuthorizedRead<
    RequestBinding extends CaptureRequestBinding<CaptureChainBinding<string>, string>,
    AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
  >(
    execution: CaptureBrokerReadExecution<RequestBinding, AuthorizationBinding>,
  ): Promise<BrokerEgressCaptureResult<RequestBinding, AuthorizationBinding>>
  executeAuthorizedRead<
    RequestBinding extends ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
    AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
  >(
    execution: ConnectionProbeBrokerReadExecution<RequestBinding, AuthorizationBinding>,
  ): Promise<BrokerEgressConnectionProbeResult<RequestBinding, AuthorizationBinding>>
}

function descriptorExecutionContract(descriptor: ReadCapabilityDescriptor<unknown, unknown>): ReadCapabilityExecutionContract {
  return {
    ref: descriptor.ref,
    mutationContract: descriptor.mutationContract,
    methodContract: descriptor.methodContract,
    constantMethod: descriptor.constantMethod,
    constantHttpsOrigin: descriptor.constantHttpsOrigin,
    constantPort: descriptor.constantPort,
    constantPathTemplate: descriptor.constantPathTemplate,
    authClass: descriptor.authClass,
    dataClass: descriptor.dataClass,
    queryContractVersion: descriptor.queryContractVersion,
    cursorContractVersion: descriptor.cursorContractVersion,
    responseContractVersion: descriptor.responseContractVersion,
    pageSequenceContractVersion: descriptor.pageSequenceContractVersion,
  }
}

async function validateBuiltCapability(
  registry: BrokerCodeRegistryPort,
  executionContract: ReadCapabilityExecutionContract,
  plan: BrokerReadRequestPlan<AnyBrokerRequestBinding>,
) {
  const descriptor = await registry.readBuiltCapability(executionContract.ref)
  if (!descriptor || isProxy(descriptor) || !Object.isFrozen(descriptor)) {
    bindingValidationFailure('code_registry_descriptor_missing_or_mutable')
  }
  exactKeys(descriptor, [
    'ref', 'mutationContract', 'methodContract', 'constantMethod', 'constantHttpsOrigin', 'constantPort',
    'constantPathTemplate', 'authClass', 'dataClass', 'queryContractVersion', 'cursorContractVersion',
    'responseContractVersion', 'pageSequenceContractVersion', 'canonicalizeQuery', 'parseQuery', 'parseCursor',
    'pageSequenceFromQuery',
  ], 'code_registry_descriptor_shape_invalid')
  if (typeof descriptor.canonicalizeQuery !== 'function'
    || typeof descriptor.parseQuery !== 'function'
    || typeof descriptor.parseCursor !== 'function'
    || typeof descriptor.pageSequenceFromQuery !== 'function') {
    bindingValidationFailure('code_registry_parser_missing')
  }
  const registeredContract = canonicalSnapshot(descriptorExecutionContract(descriptor))
  validateCapabilityContract(registeredContract, executionContract.ref)
  if (!sameCanonicalSemantics(registeredContract, executionContract)) {
    bindingValidationFailure('code_registry_execution_contract_mismatch')
  }
  let parsedQuery: unknown
  try {
    parsedQuery = descriptor.parseQuery(plan.canonicalQuery)
  } catch {
    bindingValidationFailure('code_registry_query_rejected')
  }
  if (!sameCanonicalSemantics(parsedQuery, plan.canonicalQuery)) {
    bindingValidationFailure('code_registry_query_not_canonical')
  }
  let descriptorPageSequence: unknown
  try {
    descriptorPageSequence = descriptor.pageSequenceFromQuery(parsedQuery)
  } catch {
    bindingValidationFailure('code_registry_page_sequence_rejected')
  }
  if (descriptor.pageSequenceContractVersion !== plan.pageSequenceContractVersion
    || descriptorPageSequence !== plan.pageSequence) {
    bindingValidationFailure('code_registry_page_sequence_mismatch')
  }
  validatePlan(plan, registeredContract, plan.requestBinding.chainBinding.authority.authorityPurpose === 'capture'
    ? plan.requestBinding.chainBinding.authority.captureBudget.responseByteLimit
    : plan.requestBinding.chainBinding.authority.probeBudget.responseByteLimit)
  return descriptor
}

function requireSignedReadCentralEgressCapability(
  descriptor: ReadCapabilityDescriptor<unknown, unknown>,
) {
  if (descriptor.authClass !== 'signed_read') {
    bindingValidationFailure('central_signed_egress_public_or_unsupported_capability')
  }
  return descriptor
}

function trustedNow(clock: BrokerTrustedClockPort) {
  const now = clock.nowEpochMs()
  if (!Number.isSafeInteger(now) || now < 0) bindingValidationFailure('trusted_clock_invalid')
  return now
}

function monotonicTrustedNow(clock: BrokerTrustedClockPort) {
  let previous = -1
  return () => {
    const now = trustedNow(clock)
    if (now < previous) bindingValidationFailure('trusted_clock_regressed')
    previous = now
    return now
  }
}

function validateCurrentRuntimeAuthority(
  current: BrokerRuntimeAuthorityRef<'capture'> | BrokerRuntimeAuthorityRef<'probe'> | null,
  expected: BrokerRuntimeAuthorityRef<'capture'> | BrokerRuntimeAuthorityRef<'probe'>,
) {
  if (!current || !sameCanonicalSemantics(current, expected)) {
    bindingValidationFailure('current_runtime_authority_mismatch')
  }
}

function validateConsumptionReceipt<Purpose extends BrokerAuthorityPurpose>(
  receipt: BrokerPermitConsumptionReceipt<Purpose>,
  execution: CaptureBrokerReadExecution<
    CaptureRequestBinding<CaptureChainBinding<string>, string>,
    BrokerRequestAuthorizationBinding<CaptureRequestBinding<CaptureChainBinding<string>, string>, string>
  > | ConnectionProbeBrokerReadExecution<
    ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
    BrokerRequestAuthorizationBinding<ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>, string>
  >,
  nowMs: number,
) {
  const snapshot = canonicalSnapshot(receipt)
  exactKeys(snapshot, [
    'receiptContractVersion', 'consumptionKeyContractVersion', 'permitConsumptionId', 'uniquenessScope',
    'authorityPurpose', 'authorityTupleDigest', 'requestAuthorityId',
    'canonicalUnsignedRequestDigest', 'permitContractVersion', 'sendDeadlineAt', 'consumedAt',
    'controlPlaneTransactionId',
  ], 'permit_consumption_receipt_shape_invalid')
  const authority = execution.requestBinding.chainBinding.authority
  if (snapshot.receiptContractVersion !== 'equora-broker-permit-consumption-v1'
    || snapshot.consumptionKeyContractVersion !== PERMIT_CONSUMPTION_KEY_CONTRACT_VERSION
    || snapshot.permitConsumptionId !== computeBrokerPermitConsumptionId(
      execution.authorityPurpose,
      execution.authorizationBinding.requestAuthorityId,
    )
    || snapshot.uniquenessScope !== GLOBAL_PERMIT_CONSUMPTION_SCOPE
    || snapshot.authorityPurpose !== execution.authorityPurpose
    || snapshot.authorityTupleDigest !== authority.authorityTupleDigest
    || snapshot.requestAuthorityId !== execution.authorizationBinding.requestAuthorityId
    || snapshot.canonicalUnsignedRequestDigest !== execution.requestBinding.canonicalUnsignedRequestDigest
    || snapshot.permitContractVersion !== execution.permit.permitContractVersion
    || snapshot.sendDeadlineAt !== execution.permit.sendDeadlineAt
    || !isCanonicalUtcInstant(snapshot.consumedAt)
    || Date.parse(snapshot.consumedAt) < Date.parse(execution.permit.issuedAt)
    || Date.parse(snapshot.consumedAt) > nowMs + MAX_CLOCK_SKEW_MS
    || Date.parse(snapshot.consumedAt) >= Date.parse(snapshot.sendDeadlineAt)) {
    bindingValidationFailure('permit_consumption_receipt_binding_invalid')
  }
  requireNonEmptyString(snapshot.controlPlaneTransactionId, 'permit_consumption_transaction_id_empty')
  return snapshot
}

function validateTransportResponse(
  response: BrokerTransportResponse,
  consumedAt: string,
  sendDeadlineAt: string,
  responseByteLimit: number,
  nowMs: number,
) {
  if (!response || isProxy(response) || !isPlainRecord(response)) {
    bindingValidationFailure('broker_transport_response_invalid')
  }
  exactKeys(response, ['startedAt', 'receivedAt', 'httpStatus', 'rawBody'], 'broker_transport_response_shape_invalid')
  if (!(response.rawBody instanceof Uint8Array)
    || !isCanonicalUtcInstant(response.startedAt)
    || !isCanonicalUtcInstant(response.receivedAt)
    || Date.parse(response.startedAt) < Date.parse(consumedAt)
    || Date.parse(response.startedAt) >= Date.parse(sendDeadlineAt)
    || Date.parse(response.startedAt) > Date.parse(response.receivedAt)
    || Date.parse(response.receivedAt) > nowMs + MAX_CLOCK_SKEW_MS
    || !Number.isSafeInteger(response.httpStatus)
    || response.httpStatus < 100
    || response.httpStatus > 599
    || response.rawBody.byteLength > responseByteLimit) {
    bindingValidationFailure('broker_transport_response_semantics_invalid')
  }
}

function computeBrokerRuntimeAuthorityFenceId(input: Readonly<{
  purpose: BrokerAuthorityPurpose
  plan: BrokerReadRequestPlan<AnyBrokerRequestBinding>
  requestAuthorityId: string
  permitConsumptionId: string
  runtimeAuthority: BrokerRuntimeAuthorityRef<'capture'> | BrokerRuntimeAuthorityRef<'probe'>
}>) {
  return canonicalSha256({
    fenceContractVersion: 'equora-broker-runtime-authority-send-fence-v2',
    authorityPurpose: input.purpose,
    authorityTupleDigest: input.plan.authorityTupleDigest,
    requestAuthorityId: input.requestAuthorityId,
    permitConsumptionId: input.permitConsumptionId,
    canonicalUnsignedRequestDigest: input.plan.canonicalUnsignedRequestDigest,
    capabilityDescriptorDigest: input.plan.provider.capabilityDescriptorDigest,
    runtimeAuthority: input.runtimeAuthority,
  })
}

function validateRuntimeAuthorityFenceReceipt<Purpose extends BrokerAuthorityPurpose>(
  receipt: BrokerRuntimeAuthoritySendFenceReceipt<Purpose>,
  command: BrokerRuntimeAuthoritySendFenceConsumeCommand<Purpose>,
) {
  const snapshot = canonicalSnapshot(receipt)
  exactKeys(snapshot, [
    'receiptContractVersion', 'runtimeAuthorityFenceId', 'uniquenessScope', 'authorityPurpose',
    'provider', 'currentRuntimeAuthority', 'currentAuthorityTuple', 'currentAuthorityTupleDigest',
    'authorityTupleDigest', 'requestAuthorityId',
    'permitConsumptionId', 'canonicalUnsignedRequestDigest', 'capabilityDescriptorDigest',
    'sendDeadlineAt', 'validatedAtEpochMs', 'runtimeAuthorityTransactionId',
  ], 'runtime_authority_send_fence_receipt_shape_invalid')
  const expectedAuthorityTuple = command.expectedAuthorityTuple as CaptureAuthorityTuple | ConnectionProbeAuthorityTuple
  const expectedAuthorityTupleDigest = computeAuthorityTupleDigest(expectedAuthorityTuple)
  const currentAuthorityTuple = snapshot.currentAuthorityTuple as CaptureAuthorityTuple | ConnectionProbeAuthorityTuple
  const currentAuthorityTupleDigest = computeAuthorityTupleDigest(currentAuthorityTuple)
  if (snapshot.receiptContractVersion !== 'equora-broker-runtime-authority-send-fence-receipt-v2'
    || snapshot.runtimeAuthorityFenceId !== command.runtimeAuthorityFenceId
    || snapshot.uniquenessScope !== command.uniquenessScope
    || snapshot.authorityPurpose !== command.authorityPurpose
    || !sameProviderCapability(snapshot.provider, command.provider)
    || !sameCanonicalSemantics(snapshot.currentRuntimeAuthority, command.expectedRuntimeAuthority)
    || currentAuthorityTuple.authorityPurpose !== command.authorityPurpose
    || !sameProviderCapability(currentAuthorityTuple.provider, command.provider)
    || !sameCanonicalSemantics(currentAuthorityTuple.runtimeAuthority, command.expectedRuntimeAuthority)
    || !sameCanonicalSemantics(currentAuthorityTuple, expectedAuthorityTuple)
    || currentAuthorityTuple.authorityTupleDigest !== command.authorityTupleDigest
    || currentAuthorityTupleDigest !== command.authorityTupleDigest
    || expectedAuthorityTuple.authorityPurpose !== command.authorityPurpose
    || !sameProviderCapability(expectedAuthorityTuple.provider, command.provider)
    || !sameCanonicalSemantics(expectedAuthorityTuple.runtimeAuthority, command.expectedRuntimeAuthority)
    || expectedAuthorityTuple.authorityTupleDigest !== command.authorityTupleDigest
    || expectedAuthorityTupleDigest !== command.authorityTupleDigest
    || snapshot.currentAuthorityTupleDigest !== command.authorityTupleDigest
    || snapshot.authorityTupleDigest !== command.authorityTupleDigest
    || snapshot.requestAuthorityId !== command.requestAuthorityId
    || snapshot.permitConsumptionId !== command.permitConsumptionId
    || snapshot.canonicalUnsignedRequestDigest !== command.canonicalUnsignedRequestDigest
    || snapshot.capabilityDescriptorDigest !== command.capabilityDescriptorDigest
    || snapshot.sendDeadlineAt !== command.sendDeadlineAt
    || snapshot.validatedAtEpochMs !== command.trustedNowEpochMs
    || !Number.isSafeInteger(snapshot.validatedAtEpochMs)
    || snapshot.validatedAtEpochMs >= Date.parse(snapshot.sendDeadlineAt)) {
    bindingValidationFailure('runtime_authority_send_fence_receipt_binding_invalid')
  }
  validateCurrentRuntimeAuthority(
    snapshot.currentRuntimeAuthority as BrokerRuntimeAuthorityRef<'capture'> | BrokerRuntimeAuthorityRef<'probe'>,
    command.expectedRuntimeAuthority as BrokerRuntimeAuthorityRef<'capture'> | BrokerRuntimeAuthorityRef<'probe'>,
  )
  requireNonEmptyString(snapshot.runtimeAuthorityTransactionId, 'runtime_authority_transaction_id_empty')
  return snapshot
}

function issueBrokerSendAuthorization<Purpose extends BrokerAuthorityPurpose>(input: Readonly<{
  purpose: Purpose
  plan: BrokerReadRequestPlan<AnyBrokerRequestBinding>
  requestAuthorityId: string
  permitConsumptionId: string
  runtimeAuthority: BrokerRuntimeAuthorityRef<BrokerRuntimeModeForPurpose<Purpose>>
  runtimeAuthorityFenceId: string
  consumeRuntimeAuthorityFenceAtTransport: () => Promise<void>
  authorizedAtEpochMs: number
  sendDeadlineAt: string
}>): BrokerSendAuthorization<Purpose> {
  const authorization = Object.freeze({
    sendAuthorizationContractVersion: 'equora-broker-send-authorization-v2' as const,
    authorityPurpose: input.purpose,
    authorityTupleDigest: input.plan.authorityTupleDigest,
    requestAuthorityId: input.requestAuthorityId,
    permitConsumptionId: input.permitConsumptionId,
    canonicalUnsignedRequestDigest: input.plan.canonicalUnsignedRequestDigest,
    capabilityDescriptorDigest: input.plan.provider.capabilityDescriptorDigest,
    runtimeAuthorityRefDigest: canonicalSha256(input.runtimeAuthority),
    runtimeAuthorityFenceId: input.runtimeAuthorityFenceId,
    authorizedAtEpochMs: input.authorizedAtEpochMs,
    sendDeadlineAt: input.sendDeadlineAt,
  })
  issuedBrokerSendAuthorizations.set(authorization, Object.freeze({
    plan: input.plan,
    consumeRuntimeAuthorityFenceAtTransport: input.consumeRuntimeAuthorityFenceAtTransport,
  }))
  return authorization
}

export async function consumeBrokerSendAuthorizationForTransport<Binding extends AnyBrokerRequestBinding>(
  authorization: BrokerSendAuthorization<Binding['authorityPurpose']>,
  plan: BrokerReadRequestPlan<Binding>,
): Promise<BrokerSendAuthorization<Binding['authorityPurpose']>> {
  if (!authorization || isProxy(authorization) || !Object.isFrozen(authorization)) {
    bindingValidationFailure('broker_send_authorization_missing_mutable_or_proxy')
  }
  exactKeys(authorization, [
    'sendAuthorizationContractVersion', 'authorityPurpose', 'authorityTupleDigest', 'requestAuthorityId',
    'permitConsumptionId', 'canonicalUnsignedRequestDigest', 'capabilityDescriptorDigest',
    'runtimeAuthorityRefDigest', 'runtimeAuthorityFenceId', 'authorizedAtEpochMs', 'sendDeadlineAt',
  ], 'broker_send_authorization_shape_invalid')
  const provenance = issuedBrokerSendAuthorizations.get(authorization)
  if (!provenance || provenance.plan !== plan || consumedBrokerSendAuthorizations.has(authorization)) {
    bindingValidationFailure('broker_send_authorization_not_issued_for_plan_or_replayed')
  }
  if (authorization.sendAuthorizationContractVersion !== 'equora-broker-send-authorization-v2'
    || authorization.authorityPurpose !== plan.authorityPurpose
    || authorization.authorityTupleDigest !== plan.authorityTupleDigest
    || authorization.canonicalUnsignedRequestDigest !== plan.canonicalUnsignedRequestDigest
    || authorization.capabilityDescriptorDigest !== plan.provider.capabilityDescriptorDigest
    || authorization.permitConsumptionId !== computeBrokerPermitConsumptionId(
      authorization.authorityPurpose,
      authorization.requestAuthorityId,
    )
    || !/^[a-f0-9]{64}$/.test(authorization.runtimeAuthorityRefDigest)
    || !/^[a-f0-9]{64}$/.test(authorization.runtimeAuthorityFenceId)
    || !Number.isSafeInteger(authorization.authorizedAtEpochMs)
    || authorization.authorizedAtEpochMs < 1_000_000_000_000
    || !isCanonicalUtcInstant(authorization.sendDeadlineAt)
    || authorization.authorizedAtEpochMs >= Date.parse(authorization.sendDeadlineAt)) {
    bindingValidationFailure('broker_send_authorization_binding_invalid')
  }
  consumedBrokerSendAuthorizations.add(authorization)
  issuedBrokerSendAuthorizations.delete(authorization)
  await provenance.consumeRuntimeAuthorityFenceAtTransport()
  return authorization
}

function wireResponseFromTransport<
  AuthorizationBinding extends BrokerRequestAuthorizationBinding<AnyBrokerRequestBinding, string>,
>(
  execution: CaptureBrokerReadExecution<any, AuthorizationBinding> | ConnectionProbeBrokerReadExecution<any, AuthorizationBinding>,
  response: BrokerTransportResponse,
): BrokerWireResponse<AuthorizationBinding> {
  const rawBody = Array.from(response.rawBody)
  return canonicalSnapshot({
    authorityPurpose: execution.authorityPurpose,
    authorizationBinding: execution.authorizationBinding,
    methodEvidence: execution.plan.method,
    originEvidence: execution.plan.httpsOrigin,
    pathTemplateEvidence: execution.plan.pathTemplateId,
    queryDigest: execution.requestBinding.queryDigest,
    startedAt: response.startedAt,
    receivedAt: response.receivedAt,
    httpStatus: response.httpStatus,
    rawBody,
    rawBodyDigest: createHash('sha256').update(response.rawBody).digest('hex'),
    rawBodyBytes: response.rawBody.byteLength,
  }) as BrokerWireResponse<AuthorizationBinding>
}

function bindRequiredPortMethod(port: object, methodName: string): (...args: unknown[]) => unknown {
  if (!port || isProxy(port)) bindingValidationFailure(`broker_port_proxy_or_missing:${methodName}`)
  let owner: object | null = port
  let descriptor: PropertyDescriptor | undefined
  while (owner && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(owner, methodName)
    owner = Object.getPrototypeOf(owner) as object | null
  }
  if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'function') {
    bindingValidationFailure(`broker_port_method_invalid:${methodName}`)
  }
  return descriptor.value.bind(port) as (...args: unknown[]) => unknown
}

async function readRegisteredAdapter(
  registry: Pick<BrokerCodeRegistryPort, 'readBuiltAdapter'>,
  provider: ProviderCapabilityRef,
) {
  const adapter = await registry.readBuiltAdapter(provider)
  if (!adapter || isProxy(adapter) || !Object.isFrozen(adapter)
    || adapter.providerCode !== provider.providerCode
    || adapter.providerContractVersion !== provider.providerContractVersion
    || adapter.adapterVersion !== provider.adapterVersion
    || !Array.isArray(adapter.capabilities)
    || !adapter.capabilities.some((descriptor) => sameProviderCapability(descriptor.ref, provider))) {
    bindingValidationFailure('code_registry_adapter_missing_or_mismatched')
  }
  return adapter
}

async function readRegisteredDescriptor(
  registry: Pick<BrokerCodeRegistryPort, 'readBuiltCapability'>,
  provider: ProviderCapabilityRef,
) {
  const descriptor = await registry.readBuiltCapability(provider)
  if (!descriptor || isProxy(descriptor) || !Object.isFrozen(descriptor)
    || !sameProviderCapability(descriptor.ref, provider)) {
    bindingValidationFailure('code_registry_descriptor_missing_or_mismatched')
  }
  exactKeys(descriptor, [
    'ref', 'mutationContract', 'methodContract', 'constantMethod', 'constantHttpsOrigin', 'constantPort',
    'constantPathTemplate', 'authClass', 'dataClass', 'queryContractVersion', 'cursorContractVersion',
    'responseContractVersion', 'pageSequenceContractVersion', 'canonicalizeQuery', 'parseQuery', 'parseCursor',
    'pageSequenceFromQuery',
  ], 'code_registry_descriptor_shape_invalid')
  if (typeof descriptor.canonicalizeQuery !== 'function'
    || typeof descriptor.parseQuery !== 'function'
    || typeof descriptor.parseCursor !== 'function'
    || typeof descriptor.pageSequenceFromQuery !== 'function') {
    bindingValidationFailure('code_registry_parser_missing')
  }
  validateCapabilityContract(canonicalSnapshot(descriptorExecutionContract(descriptor)), provider)
  return descriptor
}

function canonicalizeRegisteredDescriptorQuery(
  descriptor: ReadCapabilityDescriptor<unknown, unknown>,
  rawRequestInput: CanonicalJsonValue,
) {
  let canonicalQuery: unknown
  try {
    canonicalQuery = descriptor.canonicalizeQuery(canonicalSnapshot(rawRequestInput))
  } catch {
    bindingValidationFailure('code_registry_setup_query_rejected')
  }
  const snapshot = canonicalSnapshot(canonicalQuery) as CanonicalJsonValue
  let parsedCanonicalQuery: unknown
  try {
    parsedCanonicalQuery = descriptor.parseQuery(snapshot)
  } catch {
    bindingValidationFailure('code_registry_setup_query_not_canonical')
  }
  if (!sameCanonicalSemantics(parsedCanonicalQuery, snapshot)) {
    bindingValidationFailure('code_registry_setup_query_not_canonical')
  }
  return snapshot
}

function bindPlannedBrokerRead<
  ChainBinding extends AnyBrokerChainBinding,
  RequestId extends string,
>(input: Readonly<{
  chainBinding: ChainBinding
  requestId: RequestId
  draft: BrokerReadRequestPlanDraft
  adapter: ReadOnlyBrokerAdapter
}>) {
  requireNonEmptyString(input.requestId, 'broker_request_planning_request_id_empty')
  const draft = canonicalSnapshot(input.draft)
  exactKeys(draft, [
    'provider', 'method', 'httpsOrigin', 'port', 'pathTemplateId', 'canonicalPath', 'canonicalQuery',
    'redirectMode', 'responseByteLimit', 'requestTimeoutMs', 'planContractVersion',
    'pageSequenceContractVersion', 'pageSequence',
  ], 'broker_request_plan_draft_shape_invalid')
  const authority = input.chainBinding.authority
  if (!sameProviderCapability(draft.provider, authority.provider)) {
    bindingValidationFailure('broker_request_plan_draft_provider_mismatch')
  }
  const descriptor = input.adapter.capabilities.find((candidate) => sameProviderCapability(candidate.ref, draft.provider))
  if (!descriptor || !Object.isFrozen(descriptor)) {
    bindingValidationFailure('broker_request_plan_draft_descriptor_missing')
  }
  const capabilityContract = canonicalSnapshot(descriptorExecutionContract(descriptor))
  validateCapabilityContract(capabilityContract, authority.provider)
  let parsedQuery: unknown
  try {
    parsedQuery = descriptor.parseQuery(draft.canonicalQuery)
  } catch {
    bindingValidationFailure('broker_request_plan_draft_query_rejected')
  }
  if (!sameCanonicalSemantics(parsedQuery, draft.canonicalQuery)) {
    bindingValidationFailure('broker_request_plan_draft_query_not_canonical')
  }
  let descriptorPageSequence: unknown
  try {
    descriptorPageSequence = descriptor.pageSequenceFromQuery(parsedQuery)
  } catch {
    bindingValidationFailure('broker_request_plan_draft_page_sequence_rejected')
  }
  if (draft.pageSequenceContractVersion !== descriptor.pageSequenceContractVersion
    || draft.pageSequenceContractVersion !== PAGE_SEQUENCE_CONTRACT_VERSION
    || descriptorPageSequence !== draft.pageSequence) {
    bindingValidationFailure('broker_request_plan_draft_page_sequence_mismatch')
  }
  const planDigestFields = {
    authorityPurpose: input.chainBinding.authorityPurpose,
    authorityTupleDigest: authority.authorityTupleDigest,
    provider: authority.provider,
    method: draft.method,
    httpsOrigin: draft.httpsOrigin,
    port: draft.port,
    pathTemplateId: draft.pathTemplateId,
    canonicalPath: draft.canonicalPath,
    canonicalQuery: draft.canonicalQuery,
    redirectMode: draft.redirectMode,
    responseByteLimit: draft.responseByteLimit,
    requestTimeoutMs: draft.requestTimeoutMs,
    planContractVersion: draft.planContractVersion,
    pageSequenceContractVersion: draft.pageSequenceContractVersion,
    pageSequence: draft.pageSequence,
  }
  const canonicalUnsignedRequestDigest = canonicalSha256(planDigestFields)
  const requestBinding = deepFreezeSnapshot({
    requestId: input.requestId,
    authorityPurpose: input.chainBinding.authorityPurpose,
    chainBinding: input.chainBinding,
    canonicalUnsignedRequestDigest,
    queryDigest: canonicalSha256(draft.canonicalQuery),
    purposeRequestSequence: authority.purposeRequestSequence,
    provider: authority.provider,
    capabilityProfile: authority.capabilityProfile,
  }) as unknown as AnyBrokerRequestBinding
  const plan = deepFreezeSnapshot({
    ...planDigestFields,
    requestBinding,
    canonicalUnsignedRequestDigest,
  }) as BrokerReadRequestPlan<AnyBrokerRequestBinding>
  if (input.chainBinding.authorityPurpose === 'capture') {
    validateCaptureRequestBinding(requestBinding as CaptureRequestBinding<CaptureChainBinding<string>, string>)
    validatePlan(plan, capabilityContract, input.chainBinding.authority.captureBudget.responseByteLimit)
  } else {
    validateProbeRequestBinding(requestBinding as ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>)
    validatePlan(plan, capabilityContract, input.chainBinding.authority.probeBudget.responseByteLimit)
  }
  return deepFreezeSnapshot({ capabilityContract, requestBinding, plan })
}

export function createBrokerRequestPlanningBoundary(
  codeRegistry: BrokerCodeRegistryPort,
): BrokerRequestPlanningBoundary {
  if (!codeRegistry || isProxy(codeRegistry)) bindingValidationFailure('broker_request_planning_registry_proxy_or_missing')
  const registry = Object.freeze({
    readBuiltCapability: bindRequiredPortMethod(codeRegistry, 'readBuiltCapability') as BrokerCodeRegistryPort['readBuiltCapability'],
    readBuiltAdapter: bindRequiredPortMethod(codeRegistry, 'readBuiltAdapter') as BrokerCodeRegistryPort['readBuiltAdapter'],
  })
  return Object.freeze({
    async prepareConnectionSetupCommand(input: Readonly<{
      authority: ConnectionProbeAuthorityTuple
      requestInput: CanonicalJsonValue
    }>) {
      exactKeys(input, ['authority', 'requestInput'], 'connection_setup_planning_input_shape_invalid')
      const authority = canonicalSnapshot(input.authority)
      validateProbeAuthority(authority)
      const descriptor = await readRegisteredDescriptor(registry, authority.provider)
      const canonicalQuery = canonicalizeRegisteredDescriptorQuery(descriptor, input.requestInput)
      const canonicalDescriptorQueryDigest = computeBrokerDescriptorQueryDigest({
        provider: authority.provider,
        capabilityProfile: authority.capabilityProfile,
        queryContractVersion: descriptor.queryContractVersion,
        canonicalQuery,
      })
      const command = deepFreezeSnapshot({
        setupCommandContractVersion: 'equora-broker-connection-setup-command-v2' as const,
        setupCommandId: authority.setupCommandId,
        expectedSetupCommandRowVersion: authority.expectedSetupCommandRowVersion,
        userId: authority.userId,
        environment: authority.environment,
        provider: authority.provider,
        capabilityProfile: authority.capabilityProfile,
        descriptorQueryDigestContractVersion: DESCRIPTOR_QUERY_DIGEST_CONTRACT_VERSION,
        queryContractVersion: descriptor.queryContractVersion,
        canonicalDescriptorQueryDigest,
        readOnlyAttestation: true as const,
        probeBudget: Object.freeze({
          cumulativeRequestLimit: authority.probeBudget.cumulativeRequestLimit,
          responseByteLimit: authority.probeBudget.responseByteLimit,
          absoluteDeadlineAt: authority.probeBudget.absoluteDeadlineAt,
        }),
        persistenceAuthority: 'secret_free_setup_command_only' as const,
        credentialPersistenceAuthority: 'none_before_atomic_apply' as const,
        captureAuthority: 'none' as const,
        importAuthority: 'none' as const,
      })
      return validateBrokerConnectionSetupCommand(command, authority)
    },
    async prepareCaptureRead<ChainBinding extends CaptureChainBinding<string>, RequestId extends string>(input: Readonly<{
      workUnit: BrokerReadWorkUnit<ChainBinding>
      requestId: RequestId
      requestInput: CanonicalJsonValue
    }>) {
      exactKeys(input, ['workUnit', 'requestId', 'requestInput'], 'capture_request_planning_input_shape_invalid')
      const workUnit = validateBrokerReadWorkUnit(input.workUnit)
      const requestInput = canonicalSnapshot(input.requestInput)
      const adapter = await readRegisteredAdapter(registry as BrokerCodeRegistryPort, workUnit.chainBinding.authority.provider)
      const prepare = bindRequiredPortMethod(adapter, 'prepareReadPlan') as ReadOnlyBrokerAdapter['prepareReadPlan']
      const draft = await Promise.resolve(prepare({ workUnit, requestId: input.requestId, requestInput }))
      return bindPlannedBrokerRead({ chainBinding: workUnit.chainBinding, requestId: input.requestId, draft, adapter }) as PlannedCaptureBrokerRead<ChainBinding, RequestId>
    },
    async prepareConnectionProbeRead<ChainBinding extends ConnectionProbeChainBinding<string>, RequestId extends string>(input: Readonly<{
      probeWork: BrokerConnectionProbeWork<ChainBinding>
      requestId: RequestId
      requestInput: CanonicalJsonValue
    }>) {
      exactKeys(input, ['probeWork', 'requestId', 'requestInput'], 'probe_request_planning_input_shape_invalid')
      const work = validateBrokerConnectionProbeWork(input.probeWork)
      if (!sameCanonicalSemantics(input.requestInput, work.requestInput)) {
        bindingValidationFailure('probe_request_planning_input_mismatch')
      }
      const descriptor = await readRegisteredDescriptor(registry, work.chainBinding.authority.provider)
      const canonicalQuery = canonicalizeRegisteredDescriptorQuery(descriptor, input.requestInput)
      const canonicalDescriptorQueryDigest = computeBrokerDescriptorQueryDigest({
        provider: work.chainBinding.authority.provider,
        capabilityProfile: work.chainBinding.authority.capabilityProfile,
        queryContractVersion: descriptor.queryContractVersion,
        canonicalQuery,
      })
      if (work.setupCommand.queryContractVersion !== descriptor.queryContractVersion
        || work.setupCommand.canonicalDescriptorQueryDigest !== canonicalDescriptorQueryDigest) {
        bindingValidationFailure('probe_request_planning_descriptor_query_mismatch')
      }
      const adapter = await readRegisteredAdapter(registry as BrokerCodeRegistryPort, work.chainBinding.authority.provider)
      const prepare = bindRequiredPortMethod(adapter, 'prepareProbeReadPlan') as ReadOnlyBrokerAdapter['prepareProbeReadPlan']
      const draft = await Promise.resolve(prepare(input))
      return bindPlannedBrokerRead({ chainBinding: work.chainBinding, requestId: input.requestId, draft, adapter }) as PlannedConnectionProbeBrokerRead<ChainBinding, RequestId>
    },
  })
}

export function createBrokerAdapterInspectionBoundary(
  codeRegistry: BrokerCodeRegistryPort,
): BrokerAdapterInspectionBoundary {
  if (!codeRegistry || isProxy(codeRegistry)) bindingValidationFailure('adapter_inspection_registry_proxy_or_missing')
  const registry = Object.freeze({
    readBuiltAdapter: bindRequiredPortMethod(codeRegistry, 'readBuiltAdapter') as BrokerCodeRegistryPort['readBuiltAdapter'],
  })
  return Object.freeze({
    async inspectCaptureWireResponse<
      PageBinding extends CapturePageObservationBinding<
        BrokerRequestAuthorizationBinding<CaptureRequestBinding<CaptureChainBinding<string>, string>, string>,
        string
      >,
    >(wirePage: RuntimeValidatedCaptureWirePage<PageBinding>) {
      if (!validatedCaptureWirePages.has(wirePage)) bindingValidationFailure('adapter_capture_wire_not_validated')
      if (inspectedCaptureWirePages.has(wirePage)) bindingValidationFailure('adapter_capture_wire_already_inspected')
      inspectedCaptureWirePages.add(wirePage)
      const provider = wirePage.execution.requestBinding.chainBinding.authority.provider
      const adapter = await readRegisteredAdapter(registry, provider)
      const inspect = bindRequiredPortMethod(adapter, 'inspectCaptureWireResponse') as ReadOnlyBrokerAdapter['inspectCaptureWireResponse']
      const inspectedPage = canonicalSnapshot(await Promise.resolve(inspect(wirePage))) as InspectedCapturePage<PageBinding>
      inspectedCapturePageWireBindings.set(inspectedPage, wirePage)
      return inspectedPage
    },
    async inspectConnectionProbeWireResponse<
      AuthorizationBinding extends BrokerRequestAuthorizationBinding<
        ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
        string
      >,
    >(wire: RuntimeValidatedConnectionProbeWire<AuthorizationBinding>) {
      if (!validatedConnectionProbeWires.has(wire)) bindingValidationFailure('adapter_probe_wire_not_validated')
      const provider = wire.execution.requestBinding.chainBinding.authority.provider
      const adapter = await readRegisteredAdapter(registry, provider)
      const inspect = bindRequiredPortMethod(adapter, 'inspectConnectionProbeWireResponse') as ReadOnlyBrokerAdapter['inspectConnectionProbeWireResponse']
      const result = canonicalSnapshot(await Promise.resolve(inspect(wire))) as ConnectionProbeCapabilityResultCandidate<AuthorizationBinding>
      inspectedProbeResultWireBindings.set(result, wire)
      return result
    },
  })
}

export function createCentralBrokerEgress(dependencies: CentralBrokerEgressDependencies): CentralBrokerEgress {
  if (!dependencies || isProxy(dependencies)) bindingValidationFailure('central_egress_dependencies_proxy_or_missing')
  const ports = Object.freeze({
    trustedClock: Object.freeze({
      nowEpochMs: bindRequiredPortMethod(dependencies.trustedClock, 'nowEpochMs') as BrokerTrustedClockPort['nowEpochMs'],
    }),
    codeRegistry: Object.freeze({
      readBuiltCapability: bindRequiredPortMethod(dependencies.codeRegistry, 'readBuiltCapability') as BrokerCodeRegistryPort['readBuiltCapability'],
      readBuiltAdapter: bindRequiredPortMethod(dependencies.codeRegistry, 'readBuiltAdapter') as BrokerCodeRegistryPort['readBuiltAdapter'],
    }),
    runtimeAuthority: Object.freeze({
      readCurrentRuntimeAuthority: bindRequiredPortMethod(
        dependencies.runtimeAuthority,
        'readCurrentRuntimeAuthority',
      ) as BrokerRuntimeAuthorityPort['readCurrentRuntimeAuthority'],
      consumeCurrentRuntimeAuthoritySendFenceAtomically: bindRequiredPortMethod(
        dependencies.runtimeAuthority,
        'consumeCurrentRuntimeAuthoritySendFenceAtomically',
      ) as BrokerRuntimeAuthorityPort['consumeCurrentRuntimeAuthoritySendFenceAtomically'],
    }),
    controlPlane: Object.freeze({
      consumeCapturePermitAtomically: bindRequiredPortMethod(
        dependencies.controlPlane,
        'consumeCapturePermitAtomically',
      ) as BrokerPermitControlPlanePort['consumeCapturePermitAtomically'],
      consumeConnectionProbePermitAtomically: bindRequiredPortMethod(
        dependencies.controlPlane,
        'consumeConnectionProbePermitAtomically',
      ) as BrokerPermitControlPlanePort['consumeConnectionProbePermitAtomically'],
    }),
    credentialLoader: Object.freeze({
      loadCaptureCredentialMaterial: bindRequiredPortMethod(
        dependencies.credentialLoader,
        'loadCaptureCredentialMaterial',
      ) as BrokerCredentialLoaderPort['loadCaptureCredentialMaterial'],
      loadConnectionProbeCredentialMaterial: bindRequiredPortMethod(
        dependencies.credentialLoader,
        'loadConnectionProbeCredentialMaterial',
      ) as BrokerCredentialLoaderPort['loadConnectionProbeCredentialMaterial'],
    }),
    networkTransport: Object.freeze({
      executeCentralRead: bindRequiredPortMethod(
        dependencies.networkTransport,
        'executeCentralRead',
      ) as BrokerNetworkTransportPort['executeCentralRead'],
    }),
  })
  const executeCapture = async <
    RequestBinding extends CaptureRequestBinding<CaptureChainBinding<string>, string>,
    AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
  >(candidate: CaptureBrokerReadExecution<RequestBinding, AuthorizationBinding>) => {
    const nextNow = monotonicTrustedNow(ports.trustedClock)
    const validationNow = nextNow()
    const execution = validateCaptureBrokerReadExecution(candidate, validationNow)
    const authority = execution.requestBinding.chainBinding.authority
    const preconsumeNow = nextNow()
    validatePermit(execution.permit, authority.captureBudget.requestDeadlineAt, preconsumeNow)
    requireSignedReadCentralEgressCapability(
      await validateBuiltCapability(ports.codeRegistry, execution.capabilityContract, execution.plan),
    )
    const currentRuntimeAuthority = await ports.runtimeAuthority.readCurrentRuntimeAuthority('capture', authority.provider)
    validateCurrentRuntimeAuthority(currentRuntimeAuthority, authority.runtimeAuthority)
    const permitConsumptionId = computeBrokerPermitConsumptionId('capture', execution.authorizationBinding.requestAuthorityId)
    const receipt = validateConsumptionReceipt(
      await ports.controlPlane.consumeCapturePermitAtomically(Object.freeze({
        consumeContractVersion: 'equora-broker-permit-consume-v1',
        consumptionKeyContractVersion: PERMIT_CONSUMPTION_KEY_CONTRACT_VERSION,
        permitConsumptionId,
        uniquenessScope: GLOBAL_PERMIT_CONSUMPTION_SCOPE,
        authorityPurpose: 'capture',
        execution,
        authorityTupleDigest: authority.authorityTupleDigest,
        canonicalUnsignedRequestDigest: execution.requestBinding.canonicalUnsignedRequestDigest,
        capabilityDescriptorDigest: authority.provider.capabilityDescriptorDigest,
        currentRuntimeAuthority: currentRuntimeAuthority as BrokerRuntimeAuthorityRef<'capture'>,
        trustedNowEpochMs: preconsumeNow,
      })),
      execution,
      nextNow(),
    )
    const consumedExecution = promoteControlPlaneConsumedCaptureExecution(execution)
    const postcommitNow = nextNow()
    validatePermit(consumedExecution.permit, authority.captureBudget.requestDeadlineAt, postcommitNow)
    requireSignedReadCentralEgressCapability(
      await validateBuiltCapability(ports.codeRegistry, consumedExecution.capabilityContract, consumedExecution.plan),
    )
    validateCurrentRuntimeAuthority(
      await ports.runtimeAuthority.readCurrentRuntimeAuthority('capture', authority.provider),
      authority.runtimeAuthority,
    )
    let credentialMaterial: Uint8Array | null = null
    try {
      credentialMaterial = await ports.credentialLoader.loadCaptureCredentialMaterial(authority)
      if (!(credentialMaterial instanceof Uint8Array) || credentialMaterial.byteLength === 0) {
        bindingValidationFailure('capture_credential_material_invalid')
      }
      const authorizedAtEpochMs = nextNow()
      validatePermit(consumedExecution.permit, authority.captureBudget.requestDeadlineAt, authorizedAtEpochMs)
      const runtimeAuthorityFenceId = computeBrokerRuntimeAuthorityFenceId({
        purpose: 'capture',
        plan: consumedExecution.plan,
        requestAuthorityId: consumedExecution.authorizationBinding.requestAuthorityId,
        permitConsumptionId,
        runtimeAuthority: authority.runtimeAuthority,
      })
      const sendAuthorization = issueBrokerSendAuthorization({
        purpose: 'capture' as const,
        plan: consumedExecution.plan,
        requestAuthorityId: consumedExecution.authorizationBinding.requestAuthorityId,
        permitConsumptionId,
        runtimeAuthority: authority.runtimeAuthority,
        runtimeAuthorityFenceId,
        consumeRuntimeAuthorityFenceAtTransport: async () => {
          const trustedNowEpochMs = nextNow()
          validatePermit(consumedExecution.permit, authority.captureBudget.requestDeadlineAt, trustedNowEpochMs)
          const command: BrokerRuntimeAuthoritySendFenceConsumeCommand<'capture'> = Object.freeze({
            fenceContractVersion: 'equora-broker-runtime-authority-send-fence-v2',
            runtimeAuthorityFenceId,
            uniquenessScope: 'deployment_full_authority_tuple_and_request',
            authorityPurpose: 'capture',
            provider: authority.provider,
            expectedRuntimeAuthority: authority.runtimeAuthority,
            expectedAuthorityTuple: authority,
            authorityTupleDigest: authority.authorityTupleDigest,
            requestAuthorityId: consumedExecution.authorizationBinding.requestAuthorityId,
            permitConsumptionId,
            canonicalUnsignedRequestDigest: consumedExecution.plan.canonicalUnsignedRequestDigest,
            capabilityDescriptorDigest: consumedExecution.plan.provider.capabilityDescriptorDigest,
            sendDeadlineAt: consumedExecution.permit.sendDeadlineAt,
            trustedNowEpochMs,
          })
          validateRuntimeAuthorityFenceReceipt(
            await ports.runtimeAuthority.consumeCurrentRuntimeAuthoritySendFenceAtomically(command),
            command,
          )
        },
        authorizedAtEpochMs,
        sendDeadlineAt: consumedExecution.permit.sendDeadlineAt,
      })
      const transportResponse = await ports.networkTransport.executeCentralRead({
        plan: consumedExecution.plan,
        credentialMaterial,
        sendAuthorization,
      })
      validateTransportResponse(
        transportResponse,
        receipt.consumedAt,
        receipt.sendDeadlineAt,
        authority.captureBudget.responseByteLimit,
        nextNow(),
      )
      const wireResponse = wireResponseFromTransport(consumedExecution, transportResponse)
      egressWireExecutionBindings.set(wireResponse, consumedExecution)
      return Object.freeze({
        execution: consumedExecution,
        wireResponse,
        consumptionReceipt: receipt,
      }) as BrokerEgressCaptureResult<RequestBinding, AuthorizationBinding>
    } finally {
      credentialMaterial?.fill(0)
    }
  }

  const executeProbe = async <
    RequestBinding extends ConnectionProbeRequestBinding<ConnectionProbeChainBinding<string>, string>,
    AuthorizationBinding extends BrokerRequestAuthorizationBinding<RequestBinding, string>,
  >(candidate: ConnectionProbeBrokerReadExecution<RequestBinding, AuthorizationBinding>) => {
    const nextNow = monotonicTrustedNow(ports.trustedClock)
    const validationNow = nextNow()
    const execution = validateConnectionProbeBrokerReadExecution(candidate, validationNow)
    const authority = execution.requestBinding.chainBinding.authority
    const preconsumeNow = nextNow()
    validatePermit(execution.permit, authority.probeBudget.absoluteDeadlineAt, preconsumeNow)
    requireSignedReadCentralEgressCapability(
      await validateBuiltCapability(ports.codeRegistry, execution.capabilityContract, execution.plan),
    )
    const currentRuntimeAuthority = await ports.runtimeAuthority.readCurrentRuntimeAuthority('connection_probe', authority.provider)
    validateCurrentRuntimeAuthority(currentRuntimeAuthority, authority.runtimeAuthority)
    const permitConsumptionId = computeBrokerPermitConsumptionId('connection_probe', execution.authorizationBinding.requestAuthorityId)
    const receipt = validateConsumptionReceipt(
      await ports.controlPlane.consumeConnectionProbePermitAtomically(Object.freeze({
        consumeContractVersion: 'equora-broker-permit-consume-v1',
        consumptionKeyContractVersion: PERMIT_CONSUMPTION_KEY_CONTRACT_VERSION,
        permitConsumptionId,
        uniquenessScope: GLOBAL_PERMIT_CONSUMPTION_SCOPE,
        authorityPurpose: 'connection_probe',
        execution,
        authorityTupleDigest: authority.authorityTupleDigest,
        canonicalUnsignedRequestDigest: execution.requestBinding.canonicalUnsignedRequestDigest,
        capabilityDescriptorDigest: authority.provider.capabilityDescriptorDigest,
        currentRuntimeAuthority: currentRuntimeAuthority as BrokerRuntimeAuthorityRef<'probe'>,
        trustedNowEpochMs: preconsumeNow,
      })),
      execution,
      nextNow(),
    )
    const consumedExecution = promoteControlPlaneConsumedProbeExecution(execution)
    const postcommitNow = nextNow()
    validatePermit(consumedExecution.permit, authority.probeBudget.absoluteDeadlineAt, postcommitNow)
    requireSignedReadCentralEgressCapability(
      await validateBuiltCapability(ports.codeRegistry, consumedExecution.capabilityContract, consumedExecution.plan),
    )
    validateCurrentRuntimeAuthority(
      await ports.runtimeAuthority.readCurrentRuntimeAuthority('connection_probe', authority.provider),
      authority.runtimeAuthority,
    )
    let credentialMaterial: Uint8Array | null = null
    try {
      credentialMaterial = await ports.credentialLoader.loadConnectionProbeCredentialMaterial(authority)
      if (!(credentialMaterial instanceof Uint8Array) || credentialMaterial.byteLength === 0) {
        bindingValidationFailure('probe_credential_material_invalid')
      }
      const authorizedAtEpochMs = nextNow()
      validatePermit(consumedExecution.permit, authority.probeBudget.absoluteDeadlineAt, authorizedAtEpochMs)
      const runtimeAuthorityFenceId = computeBrokerRuntimeAuthorityFenceId({
        purpose: 'connection_probe',
        plan: consumedExecution.plan,
        requestAuthorityId: consumedExecution.authorizationBinding.requestAuthorityId,
        permitConsumptionId,
        runtimeAuthority: authority.runtimeAuthority,
      })
      const sendAuthorization = issueBrokerSendAuthorization({
        purpose: 'connection_probe' as const,
        plan: consumedExecution.plan,
        requestAuthorityId: consumedExecution.authorizationBinding.requestAuthorityId,
        permitConsumptionId,
        runtimeAuthority: authority.runtimeAuthority,
        runtimeAuthorityFenceId,
        consumeRuntimeAuthorityFenceAtTransport: async () => {
          const trustedNowEpochMs = nextNow()
          validatePermit(consumedExecution.permit, authority.probeBudget.absoluteDeadlineAt, trustedNowEpochMs)
          const command: BrokerRuntimeAuthoritySendFenceConsumeCommand<'connection_probe'> = Object.freeze({
            fenceContractVersion: 'equora-broker-runtime-authority-send-fence-v2',
            runtimeAuthorityFenceId,
            uniquenessScope: 'deployment_full_authority_tuple_and_request',
            authorityPurpose: 'connection_probe',
            provider: authority.provider,
            expectedRuntimeAuthority: authority.runtimeAuthority,
            expectedAuthorityTuple: authority,
            authorityTupleDigest: authority.authorityTupleDigest,
            requestAuthorityId: consumedExecution.authorizationBinding.requestAuthorityId,
            permitConsumptionId,
            canonicalUnsignedRequestDigest: consumedExecution.plan.canonicalUnsignedRequestDigest,
            capabilityDescriptorDigest: consumedExecution.plan.provider.capabilityDescriptorDigest,
            sendDeadlineAt: consumedExecution.permit.sendDeadlineAt,
            trustedNowEpochMs,
          })
          validateRuntimeAuthorityFenceReceipt(
            await ports.runtimeAuthority.consumeCurrentRuntimeAuthoritySendFenceAtomically(command),
            command,
          )
        },
        authorizedAtEpochMs,
        sendDeadlineAt: consumedExecution.permit.sendDeadlineAt,
      })
      const transportResponse = await ports.networkTransport.executeCentralRead({
        plan: consumedExecution.plan,
        credentialMaterial,
        sendAuthorization,
      })
      validateTransportResponse(
        transportResponse,
        receipt.consumedAt,
        receipt.sendDeadlineAt,
        authority.probeBudget.responseByteLimit,
        nextNow(),
      )
      const wireResponse = wireResponseFromTransport(consumedExecution, transportResponse)
      egressWireExecutionBindings.set(wireResponse, consumedExecution)
      return Object.freeze({
        execution: consumedExecution,
        wireResponse,
        consumptionReceipt: receipt,
      }) as BrokerEgressConnectionProbeResult<RequestBinding, AuthorizationBinding>
    } finally {
      credentialMaterial?.fill(0)
    }
  }

  return Object.freeze({
    executeAuthorizedRead(execution: CaptureBrokerReadExecution<any, any> | ConnectionProbeBrokerReadExecution<any, any>) {
      return execution.authorityPurpose === 'capture' ? executeCapture(execution) : executeProbe(execution)
    },
  }) as CentralBrokerEgress
}

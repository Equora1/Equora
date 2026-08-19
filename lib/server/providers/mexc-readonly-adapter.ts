import 'server-only'

import {
  computeBrokerDescriptorQueryDigest,
  computeBrokerWireEvidenceDigest,
  computeCanonicalBrokerValueDigest,
  computeCaptureQueryProfileDigest,
  PAGE_SEQUENCE_CONTRACT_VERSION,
  validateBrokerConnectionProbeWork,
  validateBrokerReadWorkUnit,
  type AdapterRawEventCandidate,
  type AdapterVersion,
  type BrokerFailure,
  type CanonicalJsonValue,
  type ConnectionProbeCapabilityResultCandidate,
  type InspectedCapturePage,
  type NonEmptyProviderEventId,
  type ProviderCapabilityRef,
  type ProviderCheckpointAdvanceCandidate,
  type ProviderCode,
  type ProviderContractVersion,
  type ReadCapabilityDescriptor,
  type ReadOnlyBrokerAdapter,
  type RuntimeValidatedCaptureWirePage,
  type RuntimeValidatedConnectionProbeWire,
  type RuntimeValidatedProviderPageTransitionInput,
} from '@/lib/server/broker-core-contracts'
import {
  MEXC_API_ORIGIN,
  MEXC_MAX_RESPONSE_BYTES,
  MEXC_REQUEST_TIMEOUT_MS,
  MEXC_READ_CAPABILITIES,
  MexcTransportError,
  canonicalMexcQuery,
  parseCanonicalMexcQuery,
  parseMexcResponseEnvelope,
  type MexcPrivateCapabilityId,
  type MexcReadCapabilityId,
  type MexcTransportErrorCode,
} from '@/lib/server/mexc-request-contract'
import {
  getMexcJsonIntegerLexeme,
  isMexcJsonNumber,
  type MexcJsonObject,
  type MexcJsonValue,
} from '@/lib/server/mexc-json'
import {
  validateMexcCapabilityData,
  type MexcOracleCapabilityId,
  type MexcOracleResult,
  type MexcOracleScope,
} from '@/lib/server/mexc-oracles'

export const MEXC_PROVIDER_CODE = 'mexc' as ProviderCode
export const MEXC_PROVIDER_CONTRACT_VERSION = 'mexc_futures_contract_v1' as ProviderContractVersion
export const MEXC_ADAPTER_VERSION = 'v57_61_0_mb1' as AdapterVersion
export const MEXC_ADAPTER_PLAN_CONTRACT_VERSION = 'equora-mexc-broker-read-plan-v1' as const
export const MEXC_ADAPTER_CHECKPOINT_CONTRACT_VERSION = 'equora-mexc-adapter-checkpoint-v1' as const

type AdapterCapabilityDefinition = Readonly<{
  capabilityKind: ProviderCapabilityRef['capabilityKind']
  providerCapabilityId: MexcOracleCapabilityId
  providerCapabilityVersion: string
  capabilityDescriptorDigest: string
  authClass: 'public' | 'signed_read'
  dataClass: 'metadata' | 'account_history' | 'account_identity'
  queryContractVersion: string
  responseContractVersion: string
}>

const CAPABILITY_DEFINITIONS: Readonly<Record<MexcOracleCapabilityId, AdapterCapabilityDefinition>> = Object.freeze({
  contract_metadata_v1: Object.freeze({
    capabilityKind: 'instrument_metadata',
    providerCapabilityId: 'contract_metadata_v1',
    providerCapabilityVersion: 'v1',
    capabilityDescriptorDigest: '1b175cad2b9fc22de55ff024b22f8033072e7dad37dbeebdb2691c341aee6ba0',
    authClass: 'public',
    dataClass: 'metadata',
    queryContractVersion: 'mexc-contract-metadata-query-v1',
    responseContractVersion: 'mexc-contract-metadata-response-v1',
  }),
  historical_orders_v1: Object.freeze({
    capabilityKind: 'historical_orders',
    providerCapabilityId: 'historical_orders_v1',
    providerCapabilityVersion: 'v1',
    capabilityDescriptorDigest: '276d71da8353e41f77a23b5003de0d21761450100717336bdb3eca1e7413098e',
    authClass: 'signed_read',
    dataClass: 'account_history',
    queryContractVersion: 'mexc-history-orders-query-v1',
    responseContractVersion: 'mexc-history-orders-response-v1',
  }),
  historical_executions_v3: Object.freeze({
    capabilityKind: 'historical_executions',
    providerCapabilityId: 'historical_executions_v3',
    providerCapabilityVersion: 'v3',
    capabilityDescriptorDigest: '116751c8061c70a718cd8da27b9c8452233167fd769a10951c8a59201ac05841',
    authClass: 'signed_read',
    dataClass: 'account_history',
    queryContractVersion: 'mexc-history-executions-query-v3',
    responseContractVersion: 'mexc-history-executions-response-v3',
  }),
  historical_positions_v1: Object.freeze({
    capabilityKind: 'historical_positions',
    providerCapabilityId: 'historical_positions_v1',
    providerCapabilityVersion: 'v1',
    capabilityDescriptorDigest: 'ef9bf5771170ebc2e38b09e02aa4823698ae5383799737dfbc639887d4a6777f',
    authClass: 'signed_read',
    dataClass: 'account_history',
    queryContractVersion: 'mexc-history-positions-query-v1',
    responseContractVersion: 'mexc-history-positions-response-v1',
  }),
  funding_records_v1: Object.freeze({
    capabilityKind: 'funding_history',
    providerCapabilityId: 'funding_records_v1',
    providerCapabilityVersion: 'v1',
    capabilityDescriptorDigest: '1cb0ca0f8b04d485da70c2e03c0c4aab557c49e4a132d45fc25cb0de0e21ecf6',
    authClass: 'signed_read',
    dataClass: 'account_history',
    queryContractVersion: 'mexc-funding-records-query-v1',
    responseContractVersion: 'mexc-funding-records-response-v1',
  }),
})

function mexcPageSequence(capabilityId: MexcReadCapabilityId, input: unknown) {
  const query = parseCanonicalMexcQuery(capabilityId, input)
  if (capabilityId === 'contract_metadata_v1') return 0
  const pageNumber = Number(query.page_num)
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
    throw new MexcTransportError('invalid_query', 'MEXC-Seitennummer kann nicht in eine nullbasierte Seitensequenz überführt werden.')
  }
  return pageNumber - 1
}

function descriptor(definition: AdapterCapabilityDefinition): ReadCapabilityDescriptor<Readonly<Record<string, string>>, null> {
  const capability = MEXC_READ_CAPABILITIES[definition.providerCapabilityId]
  const ref = Object.freeze({
    providerCode: MEXC_PROVIDER_CODE,
    providerContractVersion: MEXC_PROVIDER_CONTRACT_VERSION,
    adapterVersion: MEXC_ADAPTER_VERSION,
    capabilityKind: definition.capabilityKind,
    providerCapabilityId: definition.providerCapabilityId,
    providerCapabilityVersion: definition.providerCapabilityVersion,
    capabilityDescriptorDigest: definition.capabilityDescriptorDigest,
  })
  return Object.freeze({
    ref,
    mutationContract: 'mutations_forbidden',
    methodContract: 'constant_read_method',
    constantMethod: 'GET',
    constantHttpsOrigin: MEXC_API_ORIGIN,
    constantPort: 443,
    constantPathTemplate: capability.path,
    authClass: definition.authClass,
    dataClass: definition.dataClass,
    queryContractVersion: definition.queryContractVersion,
    cursorContractVersion: 'mexc-page-number-cursor-v1',
    responseContractVersion: definition.responseContractVersion,
    pageSequenceContractVersion: PAGE_SEQUENCE_CONTRACT_VERSION,
    canonicalizeQuery(input: unknown) {
      return canonicalMexcQuery(definition.providerCapabilityId, input)
    },
    parseQuery(input: unknown) {
      return parseCanonicalMexcQuery(definition.providerCapabilityId, input)
    },
    parseCursor(input: unknown) {
      if (input !== null) throw new MexcTransportError('invalid_query', 'MEXC-Cursor muss für den page-number-Vertrag null sein.')
      return null
    },
    pageSequenceFromQuery(input: Readonly<Record<string, string>>) {
      return mexcPageSequence(definition.providerCapabilityId, input)
    },
  })
}

export const MEXC_READONLY_CAPABILITIES = Object.freeze(
  (Object.keys(CAPABILITY_DEFINITIONS) as MexcOracleCapabilityId[])
    .map((capabilityId) => descriptor(CAPABILITY_DEFINITIONS[capabilityId])),
)

function sameProvider(left: ProviderCapabilityRef, right: ProviderCapabilityRef) {
  return left.providerCode === right.providerCode
    && left.providerContractVersion === right.providerContractVersion
    && left.adapterVersion === right.adapterVersion
    && left.capabilityKind === right.capabilityKind
    && left.providerCapabilityId === right.providerCapabilityId
    && left.providerCapabilityVersion === right.providerCapabilityVersion
    && left.capabilityDescriptorDigest === right.capabilityDescriptorDigest
}

function selectedDescriptor(provider: ProviderCapabilityRef) {
  const selected = MEXC_READONLY_CAPABILITIES.find((candidate) => sameProvider(candidate.ref, provider))
  if (!selected) throw new MexcTransportError('unsupported_contract', 'MEXC-Adapter kennt die gepinnte Capability nicht.')
  return selected
}

function validateMexcCaptureScopeRequest(
  workUnit: Parameters<ReadOnlyBrokerAdapter['prepareReadPlan']>[0]['workUnit'],
  requestInput: CanonicalJsonValue,
  inputContract: 'raw_request' | 'canonical_plan' = 'raw_request',
) {
  const work = validateBrokerReadWorkUnit(workUnit)
  const descriptor = selectedDescriptor(work.chainBinding.authority.provider)
  const capabilityId = descriptor.ref.providerCapabilityId as MexcReadCapabilityId
  const query = inputContract === 'canonical_plan'
    ? descriptor.parseQuery(requestInput)
    : canonicalMexcQuery(capabilityId, requestInput)
  const { page_num: _pageNumber, ...stableCanonicalQuery } = query
  const captureQueryProfileDigest = computeCaptureQueryProfileDigest({
    provider: descriptor.ref,
    queryContractVersion: descriptor.queryContractVersion,
    stableCanonicalQuery,
  })
  if (work.scope.captureQueryProfileDigest !== captureQueryProfileDigest) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Queryprofil stimmt nicht mit dem Capture-Scope überein.')
  }
  if (query.symbol !== work.scope.instrumentScopeKey) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Symbol stimmt nicht mit dem Capture-Scope überein.')
  }
  const isMetadata = capabilityId === 'contract_metadata_v1'
  if (isMetadata) {
    if (work.scope.requestWindowStartUs !== '0' || work.scope.requestWindowEndUs !== '0') {
      throw new MexcTransportError('transport_contract_violation', 'Öffentliche MEXC-Metadaten besitzen kein autorisiertes Historienfenster.')
    }
  } else if (BigInt(query.start_time) * BigInt(1_000) !== BigInt(work.scope.requestWindowStartUs)
    || BigInt(query.end_time) * BigInt(1_000) !== BigInt(work.scope.requestWindowEndUs)) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Zeitfenster stimmt nicht mit dem Capture-Scope überein.')
  }
  const expectsPositionType = capabilityId === 'historical_positions_v1' || capabilityId === 'funding_records_v1'
  if (Object.prototype.hasOwnProperty.call(query, 'position_type') !== expectsPositionType
    || expectsPositionType && query.position_type !== work.scope.positionType
    || !expectsPositionType && work.scope.positionType !== null) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Positionstyp stimmt nicht mit dem Capabilityvertrag überein.')
  }
  if (work.checkpoint.checkpointContractVersion !== MEXC_ADAPTER_CHECKPOINT_CONTRACT_VERSION
    || !work.checkpoint.payload
    || typeof work.checkpoint.payload !== 'object'
    || Array.isArray(work.checkpoint.payload)) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Checkpoint besitzt nicht den gepinnten Page-Vertrag.')
  }
  const checkpoint = work.checkpoint.payload as Readonly<Record<string, CanonicalJsonValue>>
  const checkpointKeys = Object.keys(checkpoint).sort()
  const expectedCheckpointKeys = [
    'captureQueryProfileDigest', 'checkpointContractVersion', 'lastPageObservationId', 'nextPageNumber',
    'providerCapabilityId', 'terminal',
  ].sort()
  if (checkpointKeys.length !== expectedCheckpointKeys.length
    || checkpointKeys.some((key, index) => key !== expectedCheckpointKeys[index])
    || checkpoint.checkpointContractVersion !== MEXC_ADAPTER_CHECKPOINT_CONTRACT_VERSION
    || checkpoint.providerCapabilityId !== capabilityId
    || checkpoint.captureQueryProfileDigest !== captureQueryProfileDigest
    || checkpoint.terminal !== false
    || checkpoint.lastPageObservationId !== null && (typeof checkpoint.lastPageObservationId !== 'string'
      || checkpoint.lastPageObservationId.trim().length === 0)
    || !Number.isSafeInteger(checkpoint.nextPageNumber)
    || Number(checkpoint.nextPageNumber) < 1
    || Number(checkpoint.nextPageNumber) > work.chainBinding.authority.captureBudget.pageLimit
    || (!isMetadata && Number(query.page_num) !== checkpoint.nextPageNumber)
    || (isMetadata && checkpoint.nextPageNumber !== 1)) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Page oder Capability stimmt nicht mit dem Checkpoint überein.')
  }
  return Object.freeze({ work, query })
}

function preparePlan(input: Readonly<{
  provider: ProviderCapabilityRef
  authorityResponseByteLimit: number
  canonicalQuery: Readonly<Record<string, string>>
}>) {
  const capability = selectedDescriptor(input.provider)
  if (!Number.isSafeInteger(input.authorityResponseByteLimit) || input.authorityResponseByteLimit < 1) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Request besitzt kein gültiges Authority-Bytelimit.')
  }
  return {
    provider: input.provider,
    method: 'GET',
    httpsOrigin: capability.constantHttpsOrigin,
    port: 443,
    pathTemplateId: capability.constantPathTemplate,
    canonicalPath: capability.constantPathTemplate,
    canonicalQuery: input.canonicalQuery,
    redirectMode: 'error',
    responseByteLimit: Math.min(input.authorityResponseByteLimit, MEXC_MAX_RESPONSE_BYTES),
    requestTimeoutMs: MEXC_REQUEST_TIMEOUT_MS,
    planContractVersion: MEXC_ADAPTER_PLAN_CONTRACT_VERSION,
    pageSequenceContractVersion: capability.pageSequenceContractVersion,
    pageSequence: capability.pageSequenceFromQuery(input.canonicalQuery),
  }
}

function oracleScope(query: Readonly<Record<string, string>>): MexcOracleScope {
  if (!Object.prototype.hasOwnProperty.call(query, 'start_time')) return Object.freeze({ symbol: query.symbol })
  const base = {
    symbol: query.symbol,
    startTime: Number(query.start_time),
    endTime: Number(query.end_time),
    pageNumber: Number(query.page_num),
    pageSize: Number(query.page_size),
  }
  return Object.prototype.hasOwnProperty.call(query, 'position_type')
    ? Object.freeze({ ...base, positionType: Number(query.position_type) as 1 | 2 })
    : Object.freeze(base)
}

export function canonicalizeMexcProviderPayload(value: MexcJsonValue): CanonicalJsonValue {
  if (isMexcJsonNumber(value)) {
    return Object.freeze({ kind: 'equora_lossless_json_number_v1', lexeme: value.lexeme })
  }
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => canonicalizeMexcProviderPayload(entry)))
  if (value !== null && typeof value === 'object') {
    const output: Record<string, CanonicalJsonValue> = {}
    for (const key of Object.keys(value).sort()) output[key] = canonicalizeMexcProviderPayload((value as MexcJsonObject)[key])
    return Object.freeze(output)
  }
  return value
}

function inspectResponse(input: RuntimeValidatedCaptureWirePage<any> | RuntimeValidatedConnectionProbeWire<any>) {
  const wire = input.wireResponse
  if (wire.httpStatus < 200 || wire.httpStatus > 299) {
    throw new MexcTransportError('provider_unavailable', 'MEXC hat keinen erfolgreichen Read-Status geliefert.', wire.httpStatus)
  }
  const capabilityId = input.execution.requestBinding.provider.providerCapabilityId as MexcOracleCapabilityId
  const data = parseMexcResponseEnvelope(Uint8Array.from(wire.rawBody), wire.httpStatus)
  const result = validateMexcCapabilityData(capabilityId, data, oracleScope(input.execution.plan.canonicalQuery))
  return Object.freeze({
    data: canonicalizeMexcProviderPayload(data),
    result,
    requestedPageSize: Number(input.execution.plan.canonicalQuery.page_size ?? result.records.length),
  })
}

function completeness(result: MexcOracleResult, requestedPageSize: number) {
  if (result.status === 'blocked_unobserved_position_items' || result.status === 'blocked_funding_authority') {
    return 'partial_observation' as const
  }
  if (result.page !== null) {
    return result.page.totalPage === 0 || result.page.currentPage >= result.page.totalPage
      ? 'scope_complete_provider_claim_unverified' as const
      : 'page_observed_scope_open' as const
  }
  return result.records.length < requestedPageSize
    ? 'scope_complete_provider_claim_unverified' as const
    : 'page_observed_scope_open' as const
}

function canonicalIntegerLexeme(value: unknown) {
  const mexcLexeme = getMexcJsonIntegerLexeme(value)
  if (mexcLexeme !== null) return mexcLexeme
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  return candidate.kind === 'equora_lossless_json_number_v1'
    && typeof candidate.lexeme === 'string'
    && /^(?:0|[1-9]\d*)$/.test(candidate.lexeme)
    ? candidate.lexeme
    : null
}

function mexcRecordId(record: Readonly<Record<string, CanonicalJsonValue>>, field: string): NonEmptyProviderEventId {
  const value = record[field]
  const raw = typeof value === 'string' ? value : canonicalIntegerLexeme(value)
  if (raw === null || raw.trim().length === 0 || raw.length > 64) {
    throw new MexcTransportError('malformed_response', 'MEXC-Event besitzt keine stabile Provider-ID.')
  }
  return raw.replace(/^0+(?=\d)/, '') as NonEmptyProviderEventId
}

function providerTimeUs(record: Readonly<Record<string, CanonicalJsonValue>>, field: string) {
  const lexeme = canonicalIntegerLexeme(record[field])
  if (lexeme === null) return null
  const milliseconds = Number(lexeme)
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1_000_000_000_000) return null
  return String(BigInt(milliseconds) * BigInt(1_000))
}

function recordsFromPayload(capabilityId: MexcOracleCapabilityId, payload: CanonicalJsonValue) {
  if (capabilityId === 'funding_records_v1') {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || isMexcJsonNumber(payload)) {
      throw new MexcTransportError('malformed_response', 'MEXC-Funding-Payload besitzt keine Page-Form.')
    }
    const records = (payload as Record<string, MexcJsonValue>).resultList
    if (!Array.isArray(records)) throw new MexcTransportError('malformed_response', 'MEXC-Funding-Payload besitzt keine Resultliste.')
    return records as readonly Readonly<Record<string, CanonicalJsonValue>>[]
  }
  if (capabilityId === 'contract_metadata_v1') return [payload as Readonly<Record<string, CanonicalJsonValue>>]
  if (!Array.isArray(payload)) throw new MexcTransportError('malformed_response', 'MEXC-History-Payload besitzt keine Listenform.')
  return payload as readonly Readonly<Record<string, CanonicalJsonValue>>[]
}

const FAILURE_CLASSES: Readonly<Record<MexcTransportErrorCode, BrokerFailure['failureClass']>> = Object.freeze({
  transport_contract_violation: 'contract',
  invalid_query: 'contract',
  invalid_provider_time: 'contract',
  invalid_credential: 'credential',
  ip_not_allowed: 'permission',
  permission_missing: 'permission',
  rate_limited: 'rate_limit',
  provider_busy: 'provider_unavailable',
  maintenance: 'provider_unavailable',
  invalid_request: 'contract',
  unsupported_contract: 'contract',
  unknown_provider_error: 'unknown_fail_closed',
  provider_unavailable: 'provider_unavailable',
  timeout: 'timeout',
  response_too_large: 'resource_budget',
  malformed_response: 'contract',
})

const MEXC_READONLY_ADAPTER_IMPLEMENTATION = {
  providerCode: MEXC_PROVIDER_CODE,
  providerContractVersion: MEXC_PROVIDER_CONTRACT_VERSION,
  adapterVersion: MEXC_ADAPTER_VERSION,
  capabilities: MEXC_READONLY_CAPABILITIES,
  prepareReadPlan(input: Parameters<ReadOnlyBrokerAdapter['prepareReadPlan']>[0]) {
    if (input.workUnit.chainBinding.authorityPurpose !== 'capture') {
      throw new MexcTransportError('transport_contract_violation', 'MEXC-Capture-Plan besitzt einen falschen Purpose.')
    }
    const validated = validateMexcCaptureScopeRequest(input.workUnit, input.requestInput)
    return preparePlan({
      provider: validated.work.chainBinding.authority.provider,
      authorityResponseByteLimit: validated.work.chainBinding.authority.captureBudget.responseByteLimit,
      canonicalQuery: validated.query,
    })
  },
  prepareProbeReadPlan(input: Parameters<ReadOnlyBrokerAdapter['prepareProbeReadPlan']>[0]) {
    if (input.probeWork.chainBinding.authorityPurpose !== 'connection_probe') {
      throw new MexcTransportError('transport_contract_violation', 'MEXC-Probe-Plan besitzt einen falschen Purpose.')
    }
    const work = validateBrokerConnectionProbeWork(input.probeWork)
    const descriptor = selectedDescriptor(work.chainBinding.authority.provider)
    const canonicalQuery = canonicalMexcQuery(
      work.chainBinding.authority.provider.providerCapabilityId as MexcReadCapabilityId,
      input.requestInput,
    )
    const canonicalDescriptorQueryDigest = computeBrokerDescriptorQueryDigest({
      provider: work.chainBinding.authority.provider,
      capabilityProfile: work.chainBinding.authority.capabilityProfile,
      queryContractVersion: descriptor.queryContractVersion,
      canonicalQuery,
    })
    if (work.setupCommand.queryContractVersion !== descriptor.queryContractVersion
      || work.setupCommand.canonicalDescriptorQueryDigest !== canonicalDescriptorQueryDigest) {
      throw new MexcTransportError('transport_contract_violation', 'MEXC-Probe-Setup stimmt nicht mit der Authority überein.')
    }
    return preparePlan({
      provider: work.chainBinding.authority.provider,
      authorityResponseByteLimit: work.chainBinding.authority.probeBudget.responseByteLimit,
      canonicalQuery,
    })
  },
  inspectCaptureWireResponse(input: RuntimeValidatedCaptureWirePage<any>): InspectedCapturePage<any> {
    const inspected = inspectResponse(input)
    const expectedCompleteness = completeness(inspected.result, inspected.requestedPageSize)
    if (input.pageBinding.completenessStatus !== expectedCompleteness
      || input.pageBinding.pagePayloadDigest !== computeCanonicalBrokerValueDigest(inspected.data as CanonicalJsonValue)) {
      throw new MexcTransportError('transport_contract_violation', 'MEXC-Page-Binding stimmt nicht mit dem inspizierten Payload überein.')
    }
    return Object.freeze({
      pageBinding: input.pageBinding,
      responseContractVersion: input.execution.capabilityContract.responseContractVersion,
      requestEvidence: Object.freeze({
        authorizationBinding: input.wireResponse.authorizationBinding,
        methodEvidence: input.wireResponse.methodEvidence,
        originEvidence: input.wireResponse.originEvidence,
        pathTemplateEvidence: input.wireResponse.pathTemplateEvidence,
        queryDigest: input.wireResponse.queryDigest,
        startedAt: input.wireResponse.startedAt,
        receivedAt: input.wireResponse.receivedAt,
        wireBodyDigest: input.wireResponse.rawBodyDigest,
        wireBodyBytes: input.wireResponse.rawBodyBytes,
      }),
      pageEvidence: Object.freeze({ pageBinding: input.pageBinding, pagePayload: inspected.data as CanonicalJsonValue }),
    })
  },
  inspectConnectionProbeWireResponse(
    input: RuntimeValidatedConnectionProbeWire<any>,
  ): ConnectionProbeCapabilityResultCandidate<any> {
    inspectResponse(input)
    const descriptor = selectedDescriptor(input.execution.requestBinding.provider)
    const permissionObserved = descriptor.authClass === 'signed_read'
    return Object.freeze({
      resultContractVersion: 'equora-connection-probe-result-v1',
      authorizationBinding: input.execution.authorizationBinding,
      provider: input.execution.requestBinding.provider,
      capabilityProfile: input.execution.requestBinding.capabilityProfile,
      responseContractVersion: input.execution.capabilityContract.responseContractVersion,
      wireEvidenceDigest: computeBrokerWireEvidenceDigest(input.wireResponse),
      probeScopeDigest: input.execution.requestBinding.chainBinding.authority.purposeScopeDigest,
      observedAt: input.wireResponse.receivedAt,
      technicalReadResult: 'read_succeeded',
      permissionEvidenceResult: permissionObserved ? 'read_permission_observed' : 'not_observed',
      accountIdentityResult: 'not_observed',
      sanitizedFindings: Object.freeze([
        ...(permissionObserved ? [] : ['read_permission_not_observed' as const]),
        'account_identity_not_observed' as const,
      ]),
      persistenceAuthority: 'sanitized_probe_receipt_only',
      captureAuthority: 'none',
      normalizationAuthority: 'none',
      reconciliationAuthority: 'none',
      approvalAuthority: 'none',
      importAuthority: 'none',
    })
  },
  advanceCheckpoint(
    input: RuntimeValidatedProviderPageTransitionInput<any>,
  ): ProviderCheckpointAdvanceCandidate<any> {
    const pageBinding = input.inspectedPage.pageBinding
    const provider = pageBinding.authorizationBinding.requestBinding.provider
    const plan = input.wirePage.execution.plan
    const { work, query } = validateMexcCaptureScopeRequest(
      input.workUnit,
      plan.canonicalQuery as CanonicalJsonValue,
      'canonical_plan',
    )
    const capability = selectedDescriptor(provider)
    const executedPageSequence = capability.pageSequenceFromQuery(query)
    if (!sameProvider(plan.provider, provider)
      || plan.pageSequenceContractVersion !== PAGE_SEQUENCE_CONTRACT_VERSION
      || plan.pageSequenceContractVersion !== capability.pageSequenceContractVersion
      || plan.pageSequence !== executedPageSequence
      || pageBinding.pageSequence !== executedPageSequence) {
      throw new MexcTransportError(
        'transport_contract_violation',
        'MEXC-Plan, Page-Observation und Descriptor besitzen keine identische Seitensequenz.',
      )
    }
    const executedPageNumber = executedPageSequence + 1
    const checkpoint = work.checkpoint.payload as Readonly<Record<string, CanonicalJsonValue>>
    if (checkpoint.nextPageNumber !== executedPageNumber) {
      throw new MexcTransportError(
        'transport_contract_violation',
        'MEXC-Checkpoint stimmt nicht mit der tatsächlich ausgeführten Seite überein.',
      )
    }
    const status = input.inspectedPage.pageBinding.completenessStatus === 'page_observed_scope_open'
      ? 'next_page' as const
      : input.inspectedPage.pageBinding.completenessStatus === 'scope_complete_provider_claim_unverified'
        ? 'complete' as const
        : input.inspectedPage.pageBinding.completenessStatus === 'partial_observation'
          ? 'partial' as const
          : 'blocked' as const
    if (status === 'next_page' && executedPageNumber >= work.chainBinding.authority.captureBudget.pageLimit) {
      throw new MexcTransportError(
        'transport_contract_violation',
        'MEXC meldet eine Folgeseite außerhalb des autorisierten Page-Budgets.',
      )
    }
    const nextPageNumber = status === 'next_page' ? executedPageNumber + 1 : executedPageNumber
    return Object.freeze({
      pageBinding,
      previousCheckpoint: work.checkpoint,
      nextCheckpointContractVersion: MEXC_ADAPTER_CHECKPOINT_CONTRACT_VERSION,
      nextCaptureQueryProfileDigest: input.workUnit.scope.captureQueryProfileDigest,
      nextCheckpointPayload: Object.freeze({
        checkpointContractVersion: MEXC_ADAPTER_CHECKPOINT_CONTRACT_VERSION,
        captureQueryProfileDigest: input.workUnit.scope.captureQueryProfileDigest,
        providerCapabilityId: provider.providerCapabilityId,
        lastPageObservationId: pageBinding.pageObservationId,
        nextPageNumber,
        terminal: status !== 'next_page',
      }),
      status,
    })
  },
  mapRawEvents(input: InspectedCapturePage<any>): readonly AdapterRawEventCandidate<any>[] {
    const capabilityId = input.pageBinding.authorizationBinding.requestBinding.provider.providerCapabilityId as MexcOracleCapabilityId
    const records = recordsFromPayload(capabilityId, input.pageEvidence.pagePayload)
    const mapping = capabilityId === 'contract_metadata_v1'
      ? { eventKind: 'instrument_metadata' as const, id: 'symbol', time: null }
      : capabilityId === 'historical_orders_v1'
        ? { eventKind: 'order' as const, id: 'orderId', time: 'createTime' }
        : capabilityId === 'historical_executions_v3'
          ? { eventKind: 'execution' as const, id: 'id', time: 'timestamp' }
          : capabilityId === 'historical_positions_v1'
            ? { eventKind: 'position_revision' as const, id: 'positionId', time: 'createTime' }
            : { eventKind: 'funding_event' as const, id: 'id', time: 'settleTime' }
    return Object.freeze(records.map((record) => Object.freeze({
      pageBinding: input.pageBinding,
      eventKind: mapping.eventKind,
      providerIdentity: Object.freeze({
        identityStatus: 'stable_provider_id' as const,
        providerEventId: mexcRecordId(record, mapping.id),
        blockedIdentity: null,
      }),
      providerRevision: null,
      providerOccurredAtUs: mapping.time === null ? null : providerTimeUs(record, mapping.time),
      payload: record as CanonicalJsonValue,
    })))
  },
  classifyFailure(error: unknown): BrokerFailure {
    if (!(error instanceof MexcTransportError)) {
      return Object.freeze({
        failureClass: 'unknown_fail_closed',
        failureCode: 'mexc_unknown_failure',
        retryDisposition: 'manual_review',
        sanitizedDetail: null,
        httpStatusClass: 'none',
      })
    }
    const httpStatusClass = error.httpStatus === null
      ? 'none' as const
      : error.httpStatus >= 500
        ? '5xx' as const
        : error.httpStatus >= 400
          ? '4xx' as const
          : error.httpStatus >= 300
            ? '3xx' as const
            : '2xx' as const
    const retryDisposition = ['rate_limited', 'provider_busy', 'provider_unavailable', 'timeout'].includes(error.code)
      ? 'bounded_backoff' as const
      : ['invalid_credential', 'ip_not_allowed', 'permission_missing'].includes(error.code)
        ? 'after_authority_change' as const
        : 'never' as const
    return Object.freeze({
      failureClass: FAILURE_CLASSES[error.code],
      failureCode: `mexc_${error.code}`,
      retryDisposition,
      sanitizedDetail: null,
      httpStatusClass,
    })
  },
}

export const mexcReadonlyAdapter = Object.freeze(
  MEXC_READONLY_ADAPTER_IMPLEMENTATION,
) as unknown as ReadOnlyBrokerAdapter

import 'server-only'

import {
  applyBrokerRawPage,
  BROKER_RAW_CAPTURE_PROVIDER_PROFILES,
  type BrokerRawLedgerState,
  type BrokerRawPageEventInput,
  type BrokerRawPageTransition,
  type BrokerRequestResultReference,
  type BrokerRunReference,
} from '@/lib/server/broker-raw-ledger'
import { getMexcJsonIntegerLexeme, type MexcJsonObject, type MexcJsonValue } from '@/lib/server/mexc-json'
import {
  validateMexcCapabilityData,
  type MexcHistoryOracleScope,
  type MexcOracleResult,
  type MexcPositionOracleScope,
} from '@/lib/server/mexc-oracles'
import {
  createMexcPageObservation,
  recordMexcPage,
  verifyMexcPageCheckpoint,
  type MexcCheckpointIntegrityKey,
  type MexcPageCheckpoint,
  type MexcPageObservation,
  type MexcPageTransition,
} from '@/lib/server/mexc-pagination'
import {
  createMexcSyncScope,
  type MexcSyncScope,
  type MexcSyncScopeInput,
} from '@/lib/server/mexc-sync-scope'
import {
  inspectMexcWireResponse,
  prepareMexcRequest,
  type MexcWireResponse,
} from '@/lib/server/mexc-transport'

export const MEXC_CAPTURE_ORCHESTRATOR_VERSION = 'mexc-capture-orchestrator-v1' as const

export type MexcCapturedPageInput = Readonly<{
  syncScope: MexcSyncScopeInput
  checkpoint: MexcPageCheckpoint
  checkpointIntegrityKey: MexcCheckpointIntegrityKey
  ledgerState: BrokerRawLedgerState
  expectedLedgerGeneration: number
  wireResponse: MexcWireResponse
  runReference: BrokerRunReference
  requestResultReference: BrokerRequestResultReference
  requestSequence: number
}>

export type MexcCapturedPageResult = Readonly<{
  orchestratorVersion: typeof MEXC_CAPTURE_ORCHESTRATOR_VERSION
  status: 'page_committed' | 'pagination_blocked_before_ledger'
  commitPrecondition: Readonly<{
    workUnitId: string
    runId: string
    brokerAccountId: string
    connectionAccountId: string
    syncActivationId: string
    activationGeneration: number
    scopeDigest: string
    expectedCheckpointMac: string
    expectedLedgerGeneration: number
  }>
  syncScope: MexcSyncScope
  oracleResult: MexcOracleResult
  pageObservation: MexcPageObservation
  pageTransition: MexcPageTransition
  rawLedgerTransition: BrokerRawPageTransition | null
  authorityBlocked: true
}>

export class MexcCaptureOrchestratorError extends Error {
  constructor(
    public readonly code:
      | 'invalid_input'
      | 'scope_checkpoint_mismatch'
      | 'wire_context_mismatch'
      | 'wire_response_reused'
      | 'derived_record_mismatch'
      | 'unsupported_oracle_result',
    message: string,
  ) {
    super(message)
    this.name = 'MexcCaptureOrchestratorError'
  }
}

const PROFILE = BROKER_RAW_CAPTURE_PROVIDER_PROFILES.mexc
const PROVIDER_ID_PATTERN = /^(?:0|[1-9]\d{0,39})$/
const CONSUMED_CAPTURE_RESPONSES = new WeakSet<object>()
const MEXC_CAPTURE_RESULT_PROVENANCE = new WeakSet<object>()
const MEXC_CAPTURE_RESULT_WIRE_RESPONSE = new WeakMap<object, MexcWireResponse>()

const EVENT_MAPPING = Object.freeze({
  historical_orders_v1: Object.freeze({ eventType: 'order' as const, idField: 'orderId', timeField: 'createTime' }),
  historical_executions_v3: Object.freeze({ eventType: 'execution' as const, idField: 'id', timeField: 'timestamp' }),
  historical_positions_v1: Object.freeze({ eventType: 'position' as const, idField: 'positionId', timeField: 'createTime' }),
  funding_records_v1: Object.freeze({ eventType: 'funding' as const, idField: 'id', timeField: 'settleTime' }),
})

function fail(code: MexcCaptureOrchestratorError['code'], message: string): never {
  throw new MexcCaptureOrchestratorError(code, message)
}

function exactKeys(input: object, expected: readonly string[]) {
  const actual = Object.keys(input).sort()
  const canonicalExpected = [...expected].sort()
  if (actual.length !== canonicalExpected.length || actual.some((key, index) => key !== canonicalExpected[index])) {
    fail('invalid_input', 'MEXC Capture Input enthält unbekannte oder fehlende Felder.')
  }
}

function providerId(value: MexcJsonValue | undefined, label: string) {
  const raw = typeof value === 'string' ? value : getMexcJsonIntegerLexeme(value)
  if (raw === null || !/^\d{1,40}$/.test(raw)) fail('derived_record_mismatch', `${label} besitzt keine ableitbare Provider-ID.`)
  const canonical = raw.replace(/^0+(?=\d)/, '')
  if (!PROVIDER_ID_PATTERN.test(canonical)) fail('derived_record_mismatch', `${label} besitzt keine kanonische Provider-ID.`)
  return canonical
}

function providerTime(value: MexcJsonValue | undefined, label: string) {
  const lexeme = getMexcJsonIntegerLexeme(value)
  if (lexeme === null) fail('derived_record_mismatch', `${label} besitzt keinen ableitbaren Providerzeitpunkt.`)
  const time = Number(lexeme)
  if (!Number.isSafeInteger(time) || time < 1_000_000_000_000 || time > 9_999_999_999_999) {
    fail('derived_record_mismatch', `${label} besitzt keinen sicheren Unix-ms-Zeitpunkt.`)
  }
  return time
}

function pageScope(checkpoint: MexcPageCheckpoint): MexcHistoryOracleScope | MexcPositionOracleScope {
  const base = {
    symbol: checkpoint.scope.symbol,
    startTime: checkpoint.scope.startTime,
    endTime: checkpoint.scope.endTime,
    pageNumber: checkpoint.nextPageNumber,
    pageSize: checkpoint.scope.pageSize,
  }
  return 'positionType' in checkpoint.scope
    ? Object.freeze({ ...base, positionType: checkpoint.scope.positionType })
    : Object.freeze(base)
}

function assertScopeCheckpointMatch(scope: MexcSyncScope, checkpoint: MexcPageCheckpoint) {
  const positionType = 'positionType' in checkpoint.scope ? checkpoint.scope.positionType : null
  if (
    checkpoint.capabilityId !== scope.capabilityId
    || checkpoint.scope.symbol !== scope.instrumentScope.symbol
    || positionType !== scope.instrumentScope.positionType
    || checkpoint.scope.startTime !== scope.requestWindow.startTimeMs
    || checkpoint.scope.endTime !== scope.requestWindow.endTimeMs
    || checkpoint.authorityBlocked !== true
  ) fail('scope_checkpoint_mismatch', 'Normativer Sync Scope und authentischer Paginationcheckpoint widersprechen sich.')
}

function sameDigest(left: MexcSyncScope['scopeDigest'], right: MexcSyncScope['scopeDigest']) {
  return left.digestAlgorithm === right.digestAlgorithm
    && left.digestContractVersion === right.digestContractVersion
    && left.domain === right.domain
    && left.digest === right.digest
}

function sameAccountIdentity(left: MexcSyncScope['accountIdentity'], right: MexcSyncScope['accountIdentity']) {
  return left.digestAlgorithm === right.digestAlgorithm
    && left.digestContractVersion === right.digestContractVersion
    && left.purpose === right.purpose
    && left.keyVersion === right.keyVersion
    && left.digest === right.digest
    && left.verificationStatus === right.verificationStatus
}

function assertWireContextMatch(
  scope: MexcSyncScope,
  checkpoint: MexcPageCheckpoint,
  response: MexcWireResponse,
  input: MexcCapturedPageInput,
) {
  const expectedQuery = {
    symbol: scope.instrumentScope.symbol,
    start_time: scope.requestWindow.startTimeMs,
    end_time: scope.requestWindow.endTimeMs,
    page_num: checkpoint.nextPageNumber,
    page_size: checkpoint.scope.pageSize,
    ...(scope.instrumentScope.positionType === null ? {} : { position_type: scope.instrumentScope.positionType }),
  }
  const expectedRequest = prepareMexcRequest(scope.capabilityId, expectedQuery)
  const request = response.request
  const binding = response.captureBinding
  if (
    request.capabilityId !== expectedRequest.capabilityId
    || request.contractVersion !== expectedRequest.contractVersion
    || request.method !== 'GET'
    || request.auth !== 'private'
    || request.path !== expectedRequest.path
    || request.queryString !== expectedRequest.queryString
    || request.url !== expectedRequest.url
  ) fail('wire_context_mismatch', 'Authentische MEXC-Wire-Response gehört nicht zum erwarteten kanonischen Request.')
  if (
    binding === null
    || binding.bindingVersion !== 'mexc-transport-capture-binding-v1'
    || !sameAccountIdentity(binding.accountIdentity, scope.accountIdentity)
    || binding.brokerAccountId !== scope.brokerAccountId
    || binding.syncActivationId !== scope.syncActivationId
    || binding.activationGeneration !== scope.activationGeneration
    || !sameDigest(binding.scopeDigest, scope.scopeDigest)
    || binding.runReference.referenceType !== input.runReference.referenceType
    || binding.runReference.value !== input.runReference.value
    || binding.requestResultReference.referenceType !== input.requestResultReference.referenceType
    || binding.requestResultReference.value !== input.requestResultReference.value
    || binding.requestSequence !== input.requestSequence
  ) fail('wire_context_mismatch', 'Authentische MEXC-Wire-Response besitzt nicht die erwartete Capture-Zweckbindung.')
  if (CONSUMED_CAPTURE_RESPONSES.has(response)) {
    fail('wire_response_reused', 'Authentische MEXC-Capture-Response wurde in diesem Prozess bereits verbraucht.')
  }
  CONSUMED_CAPTURE_RESPONSES.add(response)
}

function deriveEvents(scope: MexcSyncScope, oracle: MexcOracleResult) {
  const mapping = EVENT_MAPPING[scope.capabilityId]
  const events: BrokerRawPageEventInput[] = []
  const orderedProviderIds: string[] = []
  const orderedProviderTimes: number[] = []
  for (let index = 0; index < oracle.records.length; index += 1) {
    const record = oracle.records[index] as MexcJsonObject
    const id = providerId(record[mapping.idField], `${scope.capabilityId}[${index}].${mapping.idField}`)
    const time = providerTime(record[mapping.timeField], `${scope.capabilityId}[${index}].${mapping.timeField}`)
    orderedProviderIds.push(id)
    orderedProviderTimes.push(time)
    events.push(Object.freeze({
      eventType: mapping.eventType,
      identityStatus: 'stable_provider_id' as const,
      externalEventId: id,
      providerRevision: null,
      providerRevisionAuthority: 'unverified' as const,
      providerOccurredAtUs: String(BigInt(time) * BigInt(1_000)),
      providerOrderTimeMs: time,
      payload: record,
    }))
  }
  return Object.freeze({
    events: Object.freeze(events),
    orderedProviderIds: Object.freeze(orderedProviderIds),
    orderedProviderTimes: Object.freeze(orderedProviderTimes),
  })
}

function responseClassification(oracle: MexcOracleResult) {
  if (
    oracle.status !== 'valid_read_preview_only'
    && oracle.status !== 'blocked_unobserved_position_items'
    && oracle.status !== 'blocked_funding_authority'
  ) fail('unsupported_oracle_result', 'Oracle-Result besitzt keine Raw-Ledger-fähige Responseklassifikation.')
  return oracle.status
}

export function applyMexcCapturedPage(input: MexcCapturedPageInput): MexcCapturedPageResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_input', 'MEXC Capture Input fehlt.')
  exactKeys(input, [
    'checkpoint',
    'checkpointIntegrityKey',
    'expectedLedgerGeneration',
    'ledgerState',
    'requestResultReference',
    'requestSequence',
    'runReference',
    'syncScope',
    'wireResponse',
  ])
  const syncScope = createMexcSyncScope(input.syncScope)
  verifyMexcPageCheckpoint(input.checkpoint, input.checkpointIntegrityKey)
  assertScopeCheckpointMatch(syncScope, input.checkpoint)
  if (!Number.isSafeInteger(input.requestSequence) || input.requestSequence !== input.checkpoint.totalRequestAttempts + 1) {
    fail('scope_checkpoint_mismatch', 'Requestsequenz folgt dem authentischen Paginationcheckpoint nicht exakt.')
  }

  const response = inspectMexcWireResponse(input.wireResponse)
  if (syncScope.sourceChannel !== PROFILE.sourceChannel) {
    fail('wire_context_mismatch', 'Sync Scope und Raw-Capture-Profil besitzen abweichende Source Channels.')
  }
  assertWireContextMatch(syncScope, input.checkpoint, response, input)
  const oracleScope = pageScope(input.checkpoint)
  const oracleResult = validateMexcCapabilityData(syncScope.capabilityId, response.data, oracleScope)
  if (oracleResult.capabilityId !== syncScope.capabilityId) {
    fail('derived_record_mismatch', 'Oracle-Result gehört nicht zur normativen Sync-Capability.')
  }
  if (oracleResult.shape !== 'bare_array_v1' && oracleResult.shape !== 'page_object_v1') {
    fail('unsupported_oracle_result', 'Oracle-Result besitzt keine paginierbare MEXC-Form.')
  }
  const derived = deriveEvents(syncScope, oracleResult)
  const observation = createMexcPageObservation({
    capabilityId: syncScope.capabilityId,
    requestPageNumber: input.checkpoint.nextPageNumber,
    shape: oracleResult.shape,
    oracleStatus: oracleResult.status,
    recordCount: derived.events.length,
    orderedProviderIds: derived.orderedProviderIds,
    orderedProviderTimes: derived.orderedProviderTimes,
    rawBodyDigest: response.rawBodyDigest,
    rawBodyBytes: response.rawBodyBytes,
    requestDurationMs: response.requestDurationMs,
    providerPage: oracleResult.page,
  })
  const pageTransition = recordMexcPage(input.checkpoint, observation, input.checkpointIntegrityKey)
  const pageWasCommitted = pageTransition.checkpoint.totalSuccessfulPages === input.checkpoint.totalSuccessfulPages + 1
  const commitPrecondition = Object.freeze({
    workUnitId: response.captureBinding!.workUnitReference.value,
    runId: response.captureBinding!.runReference.value,
    brokerAccountId: response.captureBinding!.brokerAccountId,
    connectionAccountId: response.captureBinding!.connectionAccountId,
    syncActivationId: response.captureBinding!.syncActivationId,
    activationGeneration: response.captureBinding!.activationGeneration,
    scopeDigest: response.captureBinding!.scopeDigest.digest,
    expectedCheckpointMac: input.checkpoint.checkpointMac,
    expectedLedgerGeneration: input.expectedLedgerGeneration,
  })
  if (!pageWasCommitted) {
    const result = Object.freeze({
      orchestratorVersion: MEXC_CAPTURE_ORCHESTRATOR_VERSION,
      status: 'pagination_blocked_before_ledger',
      commitPrecondition,
      syncScope,
      oracleResult,
      pageObservation: observation,
      pageTransition,
      rawLedgerTransition: null,
      authorityBlocked: true,
    })
    MEXC_CAPTURE_RESULT_PROVENANCE.add(result)
    MEXC_CAPTURE_RESULT_WIRE_RESPONSE.set(result, response)
    return result
  }

  const ledgerTransition = applyBrokerRawPage(input.ledgerState, input.expectedLedgerGeneration, {
    providerCode: syncScope.providerCode,
    accountIdentity: syncScope.accountIdentity,
    sourceChannel: syncScope.sourceChannel,
    sourceProfileId: syncScope.profileId,
    sourceProfileVersion: syncScope.profileVersion,
    providerContractVersion: syncScope.providerContractVersion,
    adapterVersion: syncScope.adapterVersion,
    capabilityId: syncScope.capabilityId,
    endpointId: syncScope.endpointId,
    scopeDigest: syncScope.scopeDigest,
    runReference: input.runReference,
    requestResultReference: input.requestResultReference,
    requestSequence: input.requestSequence,
    requestPageNumber: input.checkpoint.nextPageNumber,
    requestScope: {
      symbol: syncScope.instrumentScope.symbol,
      startTimeMs: syncScope.requestWindow.startTimeMs,
      endTimeMs: syncScope.requestWindow.endTimeMs,
      pageSize: input.checkpoint.scope.pageSize,
      positionType: syncScope.instrumentScope.positionType,
    },
    rawBodyDigest: response.rawBodyDigest,
    rawBodyBytes: response.rawBodyBytes,
    responseClassification: responseClassification(oracleResult),
    scopeCompleteness: pageTransition.scopeCompleteness,
    terminalEvidence: pageTransition.checkpoint.terminalEvidence,
    providerPage: oracleResult.page,
    cursor: observation.cursor === null
      ? null
      : { providerTimeMs: observation.cursor.providerTime, providerId: observation.cursor.providerId },
    observedAtUs: response.responseReceivedAtUs,
    events: derived.events,
  })

  const result = Object.freeze({
    orchestratorVersion: MEXC_CAPTURE_ORCHESTRATOR_VERSION,
    status: 'page_committed',
    commitPrecondition,
    syncScope,
    oracleResult,
    pageObservation: observation,
    pageTransition,
    rawLedgerTransition: ledgerTransition,
    authorityBlocked: true,
  })
  MEXC_CAPTURE_RESULT_PROVENANCE.add(result)
  MEXC_CAPTURE_RESULT_WIRE_RESPONSE.set(result, response)
  return result
}

export function inspectMexcCapturedPageResult(result: MexcCapturedPageResult): MexcCapturedPageResult {
  if (
    !result
    || typeof result !== 'object'
    || Array.isArray(result)
    || !Object.isFrozen(result)
    || !MEXC_CAPTURE_RESULT_PROVENANCE.has(result)
    || result.orchestratorVersion !== MEXC_CAPTURE_ORCHESTRATOR_VERSION
    || result.authorityBlocked !== true
  ) {
    fail('invalid_input', 'MEXC Capture Result besitzt keine authentische Orchestratorprovenienz.')
  }
  return result
}

export function inspectMexcCapturedPageResultForWireResponse(
  result: MexcCapturedPageResult,
  wireResponse: MexcWireResponse,
): MexcCapturedPageResult {
  inspectMexcCapturedPageResult(result)
  inspectMexcWireResponse(wireResponse)
  if (MEXC_CAPTURE_RESULT_WIRE_RESPONSE.get(result) !== wireResponse) {
    fail('wire_context_mismatch', 'MEXC Capture Result und Wire Response besitzen nicht dieselbe authentische Ursprungsrelation.')
  }
  return result
}

import 'server-only'

import { createHmac } from 'node:crypto'
import {
  consumeBrokerSendAuthorizationForTransport,
  type AnyBrokerRequestBinding,
  type BrokerNetworkTransportPort,
  type BrokerReadRequestPlan,
  type BrokerSendAuthorization,
  type BrokerTransportResponse,
} from '@/lib/server/broker-core-contracts'
import {
  digestEquoraRawResponseBody,
  isEquoraTcjDigest,
  type EquoraTcjDigest,
} from '@/lib/server/equora-tcj'
import {
  getMexcJsonIntegerLexeme,
  type MexcJsonValue,
} from '@/lib/server/mexc-json'
import {
  MEXC_API_ORIGIN,
  MEXC_MAX_RESPONSE_BYTES,
  MEXC_REQUEST_TIMEOUT_MS,
  MEXC_READ_CAPABILITIES,
  MEXC_TRANSPORT_CONTRACT_VERSION,
  MEXC_TRANSPORT_ERROR_POLICY,
  MexcTransportError,
  canonicalMexcQueryString,
  parseMexcResponseEnvelope,
  prepareCanonicalMexcRequest,
  prepareMexcRequest,
  type MexcPreparedRequest,
  type MexcPrivateCapabilityId,
  type MexcPublicCapabilityId,
  type MexcReadCapabilityId,
  type MexcTransportErrorCode,
} from '@/lib/server/mexc-request-contract'
import {
  MEXC_ADAPTER_VERSION,
  MEXC_ADAPTER_PLAN_CONTRACT_VERSION,
  MEXC_PROVIDER_CODE,
  MEXC_PROVIDER_CONTRACT_VERSION,
  MEXC_READONLY_CAPABILITIES,
} from '@/lib/server/providers/mexc-readonly-adapter'

export {
  MEXC_API_ORIGIN,
  MEXC_MAX_RESPONSE_BYTES,
  MEXC_REQUEST_TIMEOUT_MS,
  MEXC_READ_CAPABILITIES,
  MEXC_TRANSPORT_CONTRACT_VERSION,
  MEXC_TRANSPORT_ERROR_POLICY,
  MexcTransportError,
  canonicalMexcQueryString,
  parseMexcResponseEnvelope,
  prepareMexcRequest,
}
export type {
  MexcPreparedRequest,
  MexcPrivateCapabilityId,
  MexcPublicCapabilityId,
  MexcReadCapabilityId,
  MexcTransportErrorCode,
}
export const MEXC_MAX_CLOCK_SKEW_MS = 60_000

const MEXC_WIRE_RESPONSE_PROVENANCE = new WeakSet<object>()

const TRANSPORT_DEADLINE_MARGIN_MS = 500
export type MexcCredentials = Readonly<{ apiKey: string; secretKey: string }>
export type MexcCredentialReference = Readonly<{ id: string; keyVersion: string }>
export type MexcBoundCredentialContext = Readonly<{
  credentials: MexcCredentials
  accountIdentity: MexcTransportCaptureBinding['accountIdentity']
  brokerAccountId: string
  connectionAccountId: string
  syncActivationId: string
  activationGeneration: number
}>
export type MexcCredentialLoader = (credentialReference?: MexcCredentialReference) =>
  | MexcCredentials
  | MexcBoundCredentialContext
  | Promise<MexcCredentials | MexcBoundCredentialContext>

export type MexcPrivateRequestAuthorization = Readonly<{
  status: 'request_authorized'
  requestAuthorizationId: string
  sendDeadlineAt: string
  workUnitId: string
  requestSequence: number
  capabilityId: MexcPrivateCapabilityId
  scopeDigest: string
  credentialReference: MexcCredentialReference
  authorityBlocked: true
}>

export type MexcPrivateRequestAuthorizationContext = Readonly<{
  capabilityId: MexcPrivateCapabilityId
  workUnitId: string
  requestSequence: number
  scopeDigest: string
}>

export type MexcPrivateRequestAuthorizer = (
  context: MexcPrivateRequestAuthorizationContext,
) => MexcPrivateRequestAuthorization | Promise<MexcPrivateRequestAuthorization>

export type MexcTransportCaptureBinding = Readonly<{
  bindingVersion: 'mexc-transport-capture-binding-v1'
  accountIdentity: Readonly<{
    digestAlgorithm: 'hmac-sha256'
    digestContractVersion: 'equora-tcj-v1'
    purpose: 'broker_account_identity_v1'
    keyVersion: string
    digest: string
    verificationStatus: 'unverified_reference'
  }>
  brokerAccountId: string
  connectionAccountId: string
  syncActivationId: string
  activationGeneration: number
  scopeDigest: EquoraTcjDigest<'sync_scope'>
  workUnitReference: Readonly<{
    referenceType: 'capture_work_unit_id_v1'
    value: string
  }>
  runReference: Readonly<{
    referenceType: 'sync_run_id_v1'
    value: string
  }>
  requestResultReference: Readonly<{
    referenceType: 'provider_request_result_id_v1'
    value: string
  }>
  requestSequence: number
}>

export type MexcWireResponse = Readonly<{
  request: MexcPreparedRequest
  captureBinding: MexcTransportCaptureBinding | null
  data: MexcJsonValue
  rawBodyBase64: string
  rawBodyDigest: EquoraTcjDigest<'raw_response_body'>
  rawBodyBytes: number
  requestDurationMs: number
  requestStartedAtUs: string
  responseReceivedAtUs: string
  httpStatus: number
}>

export type MexcPrivateReadWorkUnit = Readonly<{
  capabilityId: MexcPrivateCapabilityId
  query: unknown
  captureBinding?: MexcTransportCaptureBinding
}>

export type MexcPrivateReadWorkUnitResult = Readonly<{
  serverTime: number
  outcomes: readonly MexcPrivateReadOutcome[]
}>

export type MexcPrivateReadOutcome = Readonly<{
  capabilityId: MexcPrivateCapabilityId
  status: 'wire_succeeded'
  response: MexcWireResponse
}> | Readonly<{
  capabilityId: MexcPrivateCapabilityId
  status: 'failed'
  error: MexcTransportError
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(input: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(input).sort()
  const canonicalExpected = [...expected].sort()
  return actual.length === canonicalExpected.length && actual.every((key, index) => key === canonicalExpected[index])
}

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const CANONICAL_US_PATTERN = /^(?:0|[1-9]\d{15})$/

function canonicalAccountIdentity(input: unknown): MexcTransportCaptureBinding['accountIdentity'] {
  if (
    !isRecord(input)
    || !hasExactKeys(input, ['digest', 'digestAlgorithm', 'digestContractVersion', 'keyVersion', 'purpose', 'verificationStatus'])
    || input.digestAlgorithm !== 'hmac-sha256'
    || input.digestContractVersion !== 'equora-tcj-v1'
    || input.purpose !== 'broker_account_identity_v1'
    || input.verificationStatus !== 'unverified_reference'
    || typeof input.keyVersion !== 'string'
    || !/^[a-z][a-z0-9_]{0,62}$/.test(input.keyVersion)
    || typeof input.digest !== 'string'
    || !SHA256_PATTERN.test(input.digest)
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC Account-Identity verletzt den geschlossenen Metadatenvertrag.')
  return Object.freeze({ ...input }) as MexcTransportCaptureBinding['accountIdentity']
}

function canonicalCaptureBinding(input: unknown): MexcTransportCaptureBinding {
  if (!isRecord(input) || !hasExactKeys(input, [
    'accountIdentity',
    'activationGeneration',
    'bindingVersion',
    'brokerAccountId',
    'connectionAccountId',
    'requestResultReference',
    'requestSequence',
    'runReference',
    'scopeDigest',
    'syncActivationId',
    'workUnitReference',
  ])) throw new MexcTransportError('transport_contract_violation', 'MEXC Capture Binding besitzt unbekannte oder fehlende Felder.')
  const accountIdentity = canonicalAccountIdentity(input.accountIdentity)
  const workUnitReference = input.workUnitReference
  const runReference = input.runReference
  const requestResultReference = input.requestResultReference
  if (
    input.bindingVersion !== 'mexc-transport-capture-binding-v1'
    || typeof input.brokerAccountId !== 'string'
    || !UUID_PATTERN.test(input.brokerAccountId)
    || typeof input.connectionAccountId !== 'string'
    || !UUID_PATTERN.test(input.connectionAccountId)
    || typeof input.syncActivationId !== 'string'
    || !UUID_PATTERN.test(input.syncActivationId)
    || !Number.isSafeInteger(input.activationGeneration)
    || (input.activationGeneration as number) < 1
    || (input.activationGeneration as number) > 2_147_483_647
    || !isEquoraTcjDigest(input.scopeDigest, 'sync_scope')
    || !isRecord(workUnitReference)
    || !hasExactKeys(workUnitReference, ['referenceType', 'value'])
    || workUnitReference.referenceType !== 'capture_work_unit_id_v1'
    || typeof workUnitReference.value !== 'string'
    || !UUID_PATTERN.test(workUnitReference.value)
    || !isRecord(runReference)
    || !hasExactKeys(runReference, ['referenceType', 'value'])
    || runReference.referenceType !== 'sync_run_id_v1'
    || typeof runReference.value !== 'string'
    || !UUID_PATTERN.test(runReference.value)
    || !isRecord(requestResultReference)
    || !hasExactKeys(requestResultReference, ['referenceType', 'value'])
    || requestResultReference.referenceType !== 'provider_request_result_id_v1'
    || typeof requestResultReference.value !== 'string'
    || !UUID_PATTERN.test(requestResultReference.value)
    || !Number.isSafeInteger(input.requestSequence)
    || (input.requestSequence as number) < 1
    || (input.requestSequence as number) > 2_147_483_647
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC Capture Binding verletzt den geschlossenen Metadatenvertrag.')

  return Object.freeze({
    bindingVersion: 'mexc-transport-capture-binding-v1',
    accountIdentity,
    brokerAccountId: input.brokerAccountId,
    connectionAccountId: input.connectionAccountId,
    syncActivationId: input.syncActivationId,
    activationGeneration: input.activationGeneration as number,
    scopeDigest: Object.freeze({ ...input.scopeDigest }) as EquoraTcjDigest<'sync_scope'>,
    workUnitReference: Object.freeze({ ...workUnitReference }) as MexcTransportCaptureBinding['workUnitReference'],
    runReference: Object.freeze({ ...runReference }) as MexcTransportCaptureBinding['runReference'],
    requestResultReference: Object.freeze({ ...requestResultReference }) as MexcTransportCaptureBinding['requestResultReference'],
    requestSequence: input.requestSequence as number,
  })
}

function validateCredentials(credentials: MexcCredentials) {
  const apiKey = credentials.apiKey.trim()
  const secretKey = credentials.secretKey.trim()
  if (apiKey.length < 8 || apiKey.length > 256 || secretKey.length < 8 || secretKey.length > 256) {
    throw new MexcTransportError('invalid_credential', 'MEXC-Zugangsdaten sind ungültig.')
  }
  return { apiKey, secretKey }
}

function sameAccountIdentity(
  left: MexcTransportCaptureBinding['accountIdentity'],
  right: MexcTransportCaptureBinding['accountIdentity'],
) {
  return left.digestAlgorithm === right.digestAlgorithm
    && left.digestContractVersion === right.digestContractVersion
    && left.purpose === right.purpose
    && left.keyVersion === right.keyVersion
    && left.digest === right.digest
    && left.verificationStatus === right.verificationStatus
}

function isBoundCredentialContext(
  input: MexcCredentials | MexcBoundCredentialContext,
): input is MexcBoundCredentialContext {
  return isRecord(input) && Object.prototype.hasOwnProperty.call(input, 'credentials')
}

function resolveCredentialMaterial(
  input: MexcCredentials | MexcBoundCredentialContext,
  captureBindings: readonly (MexcTransportCaptureBinding | null)[],
) {
  const requiresBoundContext = captureBindings.some((binding) => binding !== null)
  if (!requiresBoundContext) {
    return validateCredentials(isBoundCredentialContext(input) ? input.credentials : input)
  }
  if (!isBoundCredentialContext(input)) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC Capture benötigt einen credentialgebundenen Account-/Aktivierungskontext.')
  }
  if (
    !hasExactKeys(input, ['accountIdentity', 'activationGeneration', 'brokerAccountId', 'connectionAccountId', 'credentials', 'syncActivationId'])
    || !isRecord(input.credentials)
    || !isRecord(input.accountIdentity)
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC Capture benötigt einen credentialgebundenen Account-/Aktivierungskontext.')

  const accountIdentity = canonicalAccountIdentity(input.accountIdentity)
  if (
    typeof input.brokerAccountId !== 'string'
    || !UUID_PATTERN.test(input.brokerAccountId)
    || typeof input.connectionAccountId !== 'string'
    || !UUID_PATTERN.test(input.connectionAccountId)
    || typeof input.syncActivationId !== 'string'
    || !UUID_PATTERN.test(input.syncActivationId)
    || !Number.isSafeInteger(input.activationGeneration)
    || (input.activationGeneration as number) < 1
    || (input.activationGeneration as number) > 2_147_483_647
  ) throw new MexcTransportError('transport_contract_violation', 'Credentialgebundener MEXC Account-/Aktivierungskontext ist ungültig.')
  for (const binding of captureBindings) {
    if (
      binding !== null
      && (
        !sameAccountIdentity(binding.accountIdentity, accountIdentity)
        || binding.brokerAccountId !== input.brokerAccountId
        || binding.connectionAccountId !== input.connectionAccountId
        || binding.syncActivationId !== input.syncActivationId
        || binding.activationGeneration !== input.activationGeneration
      )
    ) throw new MexcTransportError('transport_contract_violation', 'MEXC Capture Binding widerspricht dem credentialgebundenen Account-/Aktivierungskontext.')
  }
  return validateCredentials(input.credentials as MexcCredentials)
}

function canonicalPrivateRequestAuthorization(
  input: unknown,
  context: MexcPrivateRequestAuthorizationContext,
) {
  if (
    !isRecord(input)
    || !hasExactKeys(input, [
      'authorityBlocked',
      'capabilityId',
      'credentialReference',
      'requestAuthorizationId',
      'requestSequence',
      'scopeDigest',
      'sendDeadlineAt',
      'status',
      'workUnitId',
    ])
    || input.status !== 'request_authorized'
    || input.authorityBlocked !== true
    || input.requestAuthorizationId === undefined
    || typeof input.requestAuthorizationId !== 'string'
    || !UUID_PATTERN.test(input.requestAuthorizationId)
    || input.workUnitId !== context.workUnitId
    || input.requestSequence !== context.requestSequence
    || input.capabilityId !== context.capabilityId
    || input.scopeDigest !== context.scopeDigest
    || typeof input.sendDeadlineAt !== 'string'
    || Number.isNaN(Date.parse(input.sendDeadlineAt))
    || Date.parse(input.sendDeadlineAt) <= Date.now()
    || !isRecord(input.credentialReference)
    || !hasExactKeys(input.credentialReference, ['id', 'keyVersion'])
    || typeof input.credentialReference.id !== 'string'
    || !UUID_PATTERN.test(input.credentialReference.id)
    || typeof input.credentialReference.keyVersion !== 'string'
    || !/^[a-z][a-z0-9_]{0,62}$/.test(input.credentialReference.keyVersion)
  ) {
    throw new MexcTransportError(
      'transport_contract_violation',
      'MEXC Capture Request besitzt keine gueltige Single-use-Autorisierung.',
    )
  }
  return Object.freeze({
    ...(input as unknown as MexcPrivateRequestAuthorization),
    credentialReference: Object.freeze({
      id: input.credentialReference.id,
      keyVersion: input.credentialReference.keyVersion,
    }),
  })
}

export function createMexcSignature(apiKey: string, secretKey: string, requestTime: number, queryString: string) {
  if (!Number.isSafeInteger(requestTime) || requestTime < 1_000_000_000_000) {
    throw new MexcTransportError('invalid_provider_time', 'MEXC-Requestzeit ist ungültig.')
  }
  return createHmac('sha256', secretKey).update(`${apiKey}${requestTime}${queryString}`).digest('hex')
}

function parseContentLength(response: Response) {
  const raw = response.headers.get('content-length')
  if (raw == null) return null
  if (!/^[0-9]+$/.test(raw)) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC Content-Length ist ungültig.', response.status)
  }
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed)) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC Content-Length ist ungültig.', response.status)
  }
  return parsed
}

async function readBoundedBody(response: Response, maximumBytes: number) {
  const contentLength = parseContentLength(response)
  const contentEncoding = response.headers.get('content-encoding')?.trim().toLowerCase() ?? ''
  if (contentEncoding && contentEncoding !== 'identity') {
    throw new MexcTransportError(
      'transport_contract_violation',
      'MEXC hat trotz angeforderter Identity-Kodierung eine komprimierte Antwort geliefert.',
      response.status,
    )
  }
  if (contentLength !== null && contentLength > maximumBytes) {
    throw new MexcTransportError('response_too_large', 'MEXC-Antwort überschreitet das erlaubte Größenlimit.', response.status)
  }
  if (!response.body) throw new MexcTransportError('malformed_response', 'MEXC-Antwort enthält keinen Body.', response.status)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximumBytes) {
      await reader.cancel().catch(() => undefined)
      throw new MexcTransportError('response_too_large', 'MEXC-Antwort überschreitet das erlaubte Größenlimit.', response.status)
    }
    chunks.push(value)
  }

  if (contentLength !== null && contentLength !== total) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC Content-Length stimmt nicht mit dem Body überein.', response.status)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function classifyHttpFailure(status: number) {
  if (status === 401) return new MexcTransportError('invalid_credential', 'MEXC hat den Lesezugriff abgelehnt.', status)
  if (status === 403) return new MexcTransportError('permission_missing', 'MEXC-Leserechte fehlen für diese Capability.', status)
  if (status === 429) return new MexcTransportError('rate_limited', 'MEXC begrenzt den Lesezugriff vorübergehend.', status)
  if (status === 503) return new MexcTransportError('provider_busy', 'MEXC ist vorübergehend ausgelastet.', status)
  return new MexcTransportError('provider_unavailable', 'MEXC ist für diesen Leseabruf nicht verfügbar.', status)
}

function parseEnvelope(
  body: Uint8Array,
  response: Response,
  request: MexcPreparedRequest,
  captureBinding: MexcTransportCaptureBinding | null,
  requestDurationMs: number,
  requestStartedAtUs: string,
  responseReceivedAtUs: string,
): MexcWireResponse {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    throw new MexcTransportError('malformed_response', 'MEXC-Antwort ist kein JSON.', response.status)
  }

  const data = parseMexcResponseEnvelope(body, response.status)

  const wireResponse = Object.freeze({
    request,
    captureBinding,
    data,
    rawBodyBase64: Buffer.from(body).toString('base64'),
    rawBodyDigest: digestEquoraRawResponseBody(body),
    rawBodyBytes: body.byteLength,
    requestDurationMs,
    requestStartedAtUs,
    responseReceivedAtUs,
    httpStatus: response.status,
  })
  MEXC_WIRE_RESPONSE_PROVENANCE.add(wireResponse)
  return wireResponse
}

function inspectPreparedRequest(request: MexcPreparedRequest) {
  if (
    !isRecord(request)
    || !Object.isFrozen(request)
    || !hasExactKeys(request, ['auth', 'capabilityId', 'contractVersion', 'method', 'path', 'query', 'queryString', 'url'])
    || !isRecord(request.query)
    || !Object.isFrozen(request.query)
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC-Wire-Request besitzt keine geschlossene kanonische Struktur.')

  const capability = MEXC_READ_CAPABILITIES[request.capabilityId]
  const queryString = canonicalMexcQueryString(request.query)
  const expectedUrl = `${MEXC_API_ORIGIN}${capability?.path ?? ''}${queryString ? `?${queryString}` : ''}`
  if (
    !capability
    || request.contractVersion !== MEXC_TRANSPORT_CONTRACT_VERSION
    || request.method !== capability.method
    || request.auth !== capability.auth
    || request.path !== capability.path
    || Object.values(request.query).some((value) => typeof value !== 'string')
    || request.queryString !== queryString
    || request.url !== expectedUrl
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC-Wire-Request weicht vom kanonischen Capabilityvertrag ab.')
}

function sameCaptureBinding(left: MexcTransportCaptureBinding, right: MexcTransportCaptureBinding) {
  return left.bindingVersion === right.bindingVersion
    && left.accountIdentity.digestAlgorithm === right.accountIdentity.digestAlgorithm
    && left.accountIdentity.digestContractVersion === right.accountIdentity.digestContractVersion
    && left.accountIdentity.purpose === right.accountIdentity.purpose
    && left.accountIdentity.keyVersion === right.accountIdentity.keyVersion
    && left.accountIdentity.digest === right.accountIdentity.digest
    && left.accountIdentity.verificationStatus === right.accountIdentity.verificationStatus
    && left.brokerAccountId === right.brokerAccountId
    && left.connectionAccountId === right.connectionAccountId
    && left.syncActivationId === right.syncActivationId
    && left.activationGeneration === right.activationGeneration
    && left.scopeDigest.digestAlgorithm === right.scopeDigest.digestAlgorithm
    && left.scopeDigest.digestContractVersion === right.scopeDigest.digestContractVersion
    && left.scopeDigest.domain === right.scopeDigest.domain
    && left.scopeDigest.digest === right.scopeDigest.digest
    && left.workUnitReference.referenceType === right.workUnitReference.referenceType
    && left.workUnitReference.value === right.workUnitReference.value
    && left.runReference.referenceType === right.runReference.referenceType
    && left.runReference.value === right.runReference.value
    && left.requestResultReference.referenceType === right.requestResultReference.referenceType
    && left.requestResultReference.value === right.requestResultReference.value
    && left.requestSequence === right.requestSequence
}

export function inspectMexcWireResponse(response: MexcWireResponse): MexcWireResponse {
  if (
    !response
    || typeof response !== 'object'
    || Array.isArray(response)
    || !Object.isFrozen(response)
    || !MEXC_WIRE_RESPONSE_PROVENANCE.has(response)
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC-Wire-Response besitzt keine authentische Transportprovenienz.')
  const expectedKeys = [
    'captureBinding',
    'data',
    'httpStatus',
    'rawBodyBase64',
    'rawBodyBytes',
    'rawBodyDigest',
    'request',
    'requestDurationMs',
    'requestStartedAtUs',
    'responseReceivedAtUs',
  ].sort()
  const actualKeys = Object.keys(response).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Wire-Response besitzt unbekannte oder fehlende Felder.')
  }
  inspectPreparedRequest(response.request)
  if (response.captureBinding !== null) {
    if (
      !Object.isFrozen(response.captureBinding)
      || !Object.isFrozen(response.captureBinding.accountIdentity)
      || !Object.isFrozen(response.captureBinding.scopeDigest)
      || !Object.isFrozen(response.captureBinding.workUnitReference)
      || !Object.isFrozen(response.captureBinding.runReference)
      || !Object.isFrozen(response.captureBinding.requestResultReference)
    ) {
      throw new MexcTransportError('transport_contract_violation', 'MEXC Capture Binding ist nicht unveränderlich.')
    }
    const canonicalBinding = canonicalCaptureBinding(response.captureBinding)
    if (!sameCaptureBinding(response.captureBinding, canonicalBinding)) {
      throw new MexcTransportError('transport_contract_violation', 'MEXC Capture Binding weicht vom kanonischen Vertrag ab.')
    }
  }
  if (
    typeof response.rawBodyBase64 !== 'string'
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(response.rawBodyBase64)
    || Buffer.from(response.rawBodyBase64, 'base64').toString('base64') !== response.rawBodyBase64
    || Buffer.from(response.rawBodyBase64, 'base64').byteLength !== response.rawBodyBytes
    || !isEquoraTcjDigest(response.rawBodyDigest, 'raw_response_body')
    || digestEquoraRawResponseBody(Buffer.from(response.rawBodyBase64, 'base64')).digest !== response.rawBodyDigest.digest
    || !Number.isSafeInteger(response.rawBodyBytes)
    || response.rawBodyBytes < 1
    || response.rawBodyBytes > MEXC_MAX_RESPONSE_BYTES
    || !Number.isSafeInteger(response.requestDurationMs)
    || response.requestDurationMs < 0
    || response.requestDurationMs > 60_000
    || !Number.isSafeInteger(response.httpStatus)
    || response.httpStatus < 200
    || response.httpStatus > 299
    || typeof response.requestStartedAtUs !== 'string'
    || !CANONICAL_US_PATTERN.test(response.requestStartedAtUs)
    || typeof response.responseReceivedAtUs !== 'string'
    || !CANONICAL_US_PATTERN.test(response.responseReceivedAtUs)
    || BigInt(response.responseReceivedAtUs) < BigInt(response.requestStartedAtUs)
  ) throw new MexcTransportError('transport_contract_violation', 'MEXC-Wire-Response verletzt den authentischen Metadatenvertrag.')
  return response
}

function assertResponseUrl(request: MexcPreparedRequest, response: Response) {
  if ((response.status >= 300 && response.status < 400) || response.redirected) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Redirects sind nicht erlaubt.', response.status)
  }
  if (!response.url) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Antwort enthält keine prüfbare finale URL.', response.status)
  }
  let finalUrl: URL
  try {
    finalUrl = new URL(response.url)
  } catch {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Antwort enthält eine ungültige finale URL.', response.status)
  }
  if (finalUrl.href !== new URL(request.url).href) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Antwort stammt nicht von der vorbereiteten finalen URL.', response.status)
  }
}

function isRedirectTransportFailure(error: unknown) {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (`${current.name} ${current.message}`.toLowerCase().includes('redirect')) return true
    current = (current as Error & { cause?: unknown }).cause
  }
  return false
}

async function executePreparedRequest(
  request: MexcPreparedRequest,
  headers: HeadersInit,
  captureBinding: MexcTransportCaptureBinding | null = null,
  absoluteDeadlineAtMs: number | null = null,
) {
  const remainingMs = absoluteDeadlineAtMs === null
    ? MEXC_REQUEST_TIMEOUT_MS
    : absoluteDeadlineAtMs - Date.now() - TRANSPORT_DEADLINE_MARGIN_MS
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    throw new MexcTransportError('timeout', 'Das End-to-End-Zeitbudget erlaubt keinen weiteren MEXC-Leseabruf.')
  }
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(MEXC_REQUEST_TIMEOUT_MS, Math.max(1, Math.floor(remainingMs))),
  )
  const requestStartedAtMs = Date.now()
  const startedAt = performance.now()
  try {
    const requestHeaders = new Headers(headers)
    requestHeaders.set('Accept-Encoding', 'identity')
    const response = await fetch(request.url, {
      method: 'GET',
      headers: requestHeaders,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    })
    assertResponseUrl(request, response)
    const body = await readBoundedBody(response, MEXC_MAX_RESPONSE_BYTES)
    if (!response.ok) throw classifyHttpFailure(response.status)
    const requestDurationMs = Math.ceil(Math.max(0, performance.now() - startedAt))
    if (requestDurationMs > 60_000) throw new MexcTransportError('timeout', 'Der MEXC-Leseabruf überschreitet das messbare Zeitbudget.')
    const responseReceivedAtMs = Date.now()
    if (responseReceivedAtMs < requestStartedAtMs) {
      throw new MexcTransportError('transport_contract_violation', 'Die lokale Transportuhr ist während des MEXC-Leseabrufs zurückgesprungen.')
    }
    return parseEnvelope(
      body,
      response,
      request,
      captureBinding,
      requestDurationMs,
      String(BigInt(requestStartedAtMs) * BigInt(1_000)),
      String(BigInt(responseReceivedAtMs) * BigInt(1_000)),
    )
  } catch (error) {
    if (error instanceof MexcTransportError) throw error
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new MexcTransportError('timeout', 'Der MEXC-Leseabruf hat das Zeitlimit überschritten.')
    }
    if (isRedirectTransportFailure(error)) {
      throw new MexcTransportError('transport_contract_violation', 'MEXC-Redirects sind nicht erlaubt.')
    }
    throw new MexcTransportError('provider_unavailable', 'Der MEXC-Leseabruf konnte nicht hergestellt werden.')
  } finally {
    clearTimeout(timeout)
  }
}

export async function executeMexcPublicRead(capabilityId: MexcPublicCapabilityId, query: unknown) {
  const request = prepareMexcRequest(capabilityId, query)
  if (request.auth !== 'public') throw new MexcTransportError('transport_contract_violation', 'Private MEXC-Capability wurde als öffentlich aufgerufen.')
  return executePreparedRequest(request, { Accept: 'application/json' })
}

function mexcPrivateReadHeaders(
  request: MexcPreparedRequest,
  requestTime: number,
  credentials: MexcCredentials,
) {
  if (request.auth !== 'private') throw new MexcTransportError('transport_contract_violation', 'Öffentliche MEXC-Capability wurde als privat aufgerufen.')
  const signature = createMexcSignature(credentials.apiKey, credentials.secretKey, requestTime, request.queryString)
  return {
    Accept: 'application/json',
    ApiKey: credentials.apiKey,
    'Request-Time': String(requestTime),
    Signature: signature,
    'Recv-Window': '10000',
  }
}

async function readMexcServerTime(absoluteDeadlineAtMs: number | null = null) {
  let response: MexcWireResponse
  try {
    const request = prepareMexcRequest('server_time_v1', {})
    response = await executePreparedRequest(
      request,
      { Accept: 'application/json' },
      null,
      absoluteDeadlineAtMs,
    )
  } catch (error) {
    if (error instanceof MexcTransportError && error.code === 'malformed_response') {
      throw new MexcTransportError('invalid_provider_time', 'MEXC-Serverzeit fehlt oder verletzt den Zeitvertrag.')
    }
    throw error
  }
  const serverTime = response.data
  const serverTimeLexeme = getMexcJsonIntegerLexeme(serverTime)
  const serverTimeValue = serverTimeLexeme === null ? Number.NaN : Number(serverTimeLexeme)
  if (
    !Number.isSafeInteger(serverTimeValue)
    || serverTimeValue < 1_000_000_000_000
    || Math.abs(serverTimeValue - Date.now()) > MEXC_MAX_CLOCK_SKEW_MS
  ) {
    throw new MexcTransportError('invalid_provider_time', 'MEXC-Serverzeit ist ungültig oder unplausibel.')
  }
  return serverTimeValue
}

export async function executeMexcPrivateReadWorkUnit(
  workUnits: readonly MexcPrivateReadWorkUnit[],
  loadCredentials: MexcCredentialLoader,
  authorizeRequest?: MexcPrivateRequestAuthorizer,
  executionBudget?: Readonly<{ absoluteDeadlineAtMs: number }>,
): Promise<MexcPrivateReadWorkUnitResult> {
  if (!workUnits.length || workUnits.length > 6) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Work-Unit enthält keine zulässige Anzahl an Lesecapabilities.')
  }

  const preparedRequests = workUnits.map((workUnit) => {
    if (!isRecord(workUnit) || !hasExactKeys(workUnit, workUnit.captureBinding === undefined
      ? ['capabilityId', 'query']
      : ['capabilityId', 'query', 'captureBinding'])) {
      throw new MexcTransportError('transport_contract_violation', 'MEXC-Work-Unit besitzt unbekannte oder fehlende Felder.')
    }
    const request = prepareMexcRequest(workUnit.capabilityId as MexcReadCapabilityId, workUnit.query)
    if (request.auth !== 'private') {
      throw new MexcTransportError('transport_contract_violation', 'Öffentliche MEXC-Capability wurde in eine private Work-Unit aufgenommen.')
    }
    const captureBinding = workUnit.captureBinding === undefined ? null : canonicalCaptureBinding(workUnit.captureBinding)
    return Object.freeze({ request, captureBinding })
  })

  const captureRequests = preparedRequests.filter(
    ({ captureBinding }) => captureBinding !== null,
  )
  if (captureRequests.length !== 0 && captureRequests.length !== preparedRequests.length) {
    throw new MexcTransportError(
      'transport_contract_violation',
      'Gebundene und ungebundene MEXC Requests duerfen nicht gemischt werden.',
    )
  }
  if (captureRequests.length > 0 && !authorizeRequest) {
    throw new MexcTransportError(
      'transport_contract_violation',
      'MEXC Capture benoetigt vor Credentialzugriff einen Request-Permit.',
    )
  }
  if (captureRequests.length > 0 && (
    !executionBudget
    || !Number.isSafeInteger(executionBudget.absoluteDeadlineAtMs)
    || executionBudget.absoluteDeadlineAtMs <= Date.now() + TRANSPORT_DEADLINE_MARGIN_MS
  )) {
    throw new MexcTransportError(
      'transport_contract_violation',
      'MEXC Capture benoetigt ein gueltiges absolutes End-to-End-Zeitbudget.',
    )
  }
  const authorizations = authorizeRequest
    ? await Promise.all(preparedRequests.map(async ({ request, captureBinding }) => {
      if (captureBinding === null) return null
      const context = Object.freeze({
        capabilityId: request.capabilityId as MexcPrivateCapabilityId,
        workUnitId: captureBinding.workUnitReference.value,
        requestSequence: captureBinding.requestSequence,
        scopeDigest: captureBinding.scopeDigest.digest,
      })
      return canonicalPrivateRequestAuthorization(
        await authorizeRequest(context),
        context,
      )
    }))
    : preparedRequests.map(() => null)
  const credentialReferences = authorizations.filter(
    (authorization): authorization is MexcPrivateRequestAuthorization => authorization !== null,
  ).map((authorization) => authorization.credentialReference)
  const credentialReference = credentialReferences[0]
  if (credentialReferences.some((reference) => (
    reference.id !== credentialReference?.id
    || reference.keyVersion !== credentialReference?.keyVersion
  ))) {
    throw new MexcTransportError(
      'transport_contract_violation',
      'Ein Capture-Batch darf nur eine Credentialgeneration verwenden.',
    )
  }
  if (authorizations.some((authorization) => (
    authorization !== null
    && Date.parse(authorization.sendDeadlineAt) <= Date.now()
  ))) {
    throw new MexcTransportError(
      'transport_contract_violation',
      'MEXC Capture Request-Permit ist vor dem ersten Broker-GET abgelaufen.',
    )
  }
  // For capture-bound reads the single-use permit is the Egress linearization
  // point for every broker request, including the public server-time GET.
  const invocationDeadlineAtMs = executionBudget?.absoluteDeadlineAtMs ?? null
  const permitDeadlineAtMs = authorizations.reduce<number | null>((minimum, authorization) => {
    if (authorization === null) return minimum
    const deadline = Date.parse(authorization.sendDeadlineAt)
    return minimum === null ? deadline : Math.min(minimum, deadline)
  }, null)
  const egressDeadlineAtMs = invocationDeadlineAtMs === null
    ? permitDeadlineAtMs
    : permitDeadlineAtMs === null
      ? invocationDeadlineAtMs
      : Math.min(invocationDeadlineAtMs, permitDeadlineAtMs)
  const serverTime = await readMexcServerTime(egressDeadlineAtMs)
  if (invocationDeadlineAtMs !== null
    && invocationDeadlineAtMs <= Date.now() + TRANSPORT_DEADLINE_MARGIN_MS) {
    throw new MexcTransportError(
      'timeout',
      'Das End-to-End-Zeitbudget ist vor dem Credentialzugriff abgelaufen.',
    )
  }
  if (authorizations.some((authorization) => (
    authorization !== null
    && Date.parse(authorization.sendDeadlineAt) <= Date.now()
  ))) {
    throw new MexcTransportError(
      'transport_contract_violation',
      'MEXC Capture Request-Permit ist vor dem Credentialzugriff abgelaufen.',
    )
  }
  const credentials = resolveCredentialMaterial(
    await loadCredentials(credentialReference),
    preparedRequests.map(({ captureBinding }) => captureBinding),
  )
  const outcomes = await Promise.all(preparedRequests.map(async ({ request, captureBinding }, index): Promise<MexcPrivateReadOutcome> => {
    try {
      const authorization = authorizations[index]
      if (invocationDeadlineAtMs !== null
        && invocationDeadlineAtMs <= Date.now() + TRANSPORT_DEADLINE_MARGIN_MS) {
        throw new MexcTransportError(
          'timeout',
          'Das End-to-End-Zeitbudget ist vor dem Senden abgelaufen.',
        )
      }
      if (authorization !== null && Date.parse(authorization.sendDeadlineAt) <= Date.now()) {
        throw new MexcTransportError(
          'transport_contract_violation',
          'MEXC Capture Request-Permit ist vor dem Senden abgelaufen.',
        )
      }
      const authorizationDeadlineAtMs = authorization === null
        ? invocationDeadlineAtMs
        : invocationDeadlineAtMs === null
          ? Date.parse(authorization.sendDeadlineAt)
          : Math.min(invocationDeadlineAtMs, Date.parse(authorization.sendDeadlineAt))
       const response = await executePreparedRequest(
        request,
        mexcPrivateReadHeaders(request, serverTime, credentials),
        captureBinding,
        authorizationDeadlineAtMs,
      )
      return Object.freeze({ capabilityId: request.capabilityId as MexcPrivateCapabilityId, status: 'wire_succeeded', response })
    } catch (error) {
      if (error instanceof MexcTransportError) {
        return Object.freeze({ capabilityId: request.capabilityId as MexcPrivateCapabilityId, status: 'failed', error })
      }
      throw error
    }
  }))
  return Object.freeze({ serverTime, outcomes: Object.freeze(outcomes) })
}

const MEXC_CENTRAL_CREDENTIAL_FRAME_VERSION = 1
const MEXC_CENTRAL_MAX_CREDENTIAL_FIELD_BYTES = 256

function decodeCentralMexcCredentialMaterial(material: Uint8Array) {
  if (!(material instanceof Uint8Array)
    || material.byteLength < 21
    || material[0] !== MEXC_CENTRAL_CREDENTIAL_FRAME_VERSION) {
    throw new MexcTransportError('invalid_credential', 'MEXC-Credentialmaterial verletzt den binären Framevertrag.')
  }
  const apiKeyBytes = material[1] * 256 + material[2]
  const secretKeyBytes = material[3] * 256 + material[4]
  if (apiKeyBytes < 8 || apiKeyBytes > MEXC_CENTRAL_MAX_CREDENTIAL_FIELD_BYTES
    || secretKeyBytes < 8 || secretKeyBytes > MEXC_CENTRAL_MAX_CREDENTIAL_FIELD_BYTES
    || material.byteLength !== 5 + apiKeyBytes + secretKeyBytes) {
    throw new MexcTransportError('invalid_credential', 'MEXC-Credentialmaterial besitzt ungültige Feldlängen.')
  }
  let apiKey: string
  let secretKey: string
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    apiKey = decoder.decode(material.subarray(5, 5 + apiKeyBytes))
    secretKey = decoder.decode(material.subarray(5 + apiKeyBytes))
  } catch {
    throw new MexcTransportError('invalid_credential', 'MEXC-Credentialmaterial ist kein gültiges UTF-8.')
  }
  if (apiKey !== apiKey.trim() || secretKey !== secretKey.trim()) {
    throw new MexcTransportError('invalid_credential', 'MEXC-Credentialmaterial enthält unzulässigen Rand-Whitespace.')
  }
  return { apiKey, secretKey }
}

function canonicalCentralMexcPlan(plan: BrokerReadRequestPlan<AnyBrokerRequestBinding>) {
  if (plan.provider.providerCode !== MEXC_PROVIDER_CODE
    || plan.provider.providerContractVersion !== MEXC_PROVIDER_CONTRACT_VERSION
    || plan.provider.adapterVersion !== MEXC_ADAPTER_VERSION
    || plan.method !== 'GET'
    || plan.httpsOrigin !== MEXC_API_ORIGIN
    || plan.port !== 443
    || plan.redirectMode !== 'error'
    || plan.responseByteLimit > MEXC_MAX_RESPONSE_BYTES
    || plan.requestTimeoutMs !== MEXC_REQUEST_TIMEOUT_MS
    || plan.planContractVersion !== MEXC_ADAPTER_PLAN_CONTRACT_VERSION) {
    throw new MexcTransportError('transport_contract_violation', 'Zentraler MEXC-Transport lehnt Provider-, GET- oder Originabweichung ab.')
  }
  const descriptor = MEXC_READONLY_CAPABILITIES.find((candidate) => (
    candidate.ref.capabilityDescriptorDigest === plan.provider.capabilityDescriptorDigest
    && candidate.ref.providerCapabilityId === plan.provider.providerCapabilityId
  ))
  if (!descriptor || descriptor.authClass !== 'signed_read') {
    throw new MexcTransportError('unsupported_contract', 'Zentraler MEXC-Transport akzeptiert nur gepinnte signed-read-Capabilities.')
  }
  if (plan.pageSequenceContractVersion !== descriptor.pageSequenceContractVersion
    || plan.pageSequence !== descriptor.pageSequenceFromQuery(plan.canonicalQuery)) {
    throw new MexcTransportError(
      'transport_contract_violation',
      'Zentraler MEXC-Transport lehnt eine vom Descriptor abweichende Seitensequenz ab.',
    )
  }
  const capabilityId = descriptor.ref.providerCapabilityId as MexcPrivateCapabilityId
  const capability = MEXC_READ_CAPABILITIES[capabilityId]
  const request = prepareCanonicalMexcRequest(capabilityId, plan.canonicalQuery)
  if (capability.auth !== 'private'
    || plan.pathTemplateId !== descriptor.constantPathTemplate
    || plan.canonicalPath !== descriptor.constantPathTemplate
    || request.path !== plan.canonicalPath) {
    throw new MexcTransportError('transport_contract_violation', 'Zentraler MEXC-Transport lehnt Capability- oder Pfadabweichung ab.')
  }
  return request
}

function centralUnixMicrosecondsToIso(value: string) {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Transportzeit ist nicht kanonisch.')
  }
  const epochMs = BigInt(value) / BigInt(1_000)
  if (epochMs > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MexcTransportError('transport_contract_violation', 'MEXC-Transportzeit liegt außerhalb des sicheren Bereichs.')
  }
  return new Date(Number(epochMs)).toISOString()
}

export const mexcBrokerNetworkTransport: BrokerNetworkTransportPort = Object.freeze({
  async executeCentralRead<Binding extends AnyBrokerRequestBinding>(input: Readonly<{
    plan: BrokerReadRequestPlan<Binding>
    credentialMaterial: Uint8Array
    sendAuthorization: BrokerSendAuthorization<Binding['authorityPurpose']>
  }>): Promise<BrokerTransportResponse> {
    const plan = input.plan as BrokerReadRequestPlan<AnyBrokerRequestBinding>
    try {
      await consumeBrokerSendAuthorizationForTransport(
        input.sendAuthorization as BrokerSendAuthorization<'capture' | 'connection_probe'>,
        plan,
      )
    } catch {
      throw new MexcTransportError(
        'transport_contract_violation',
        'Zentrale MEXC-Sendeautorität wurde nicht für exakt diesen Plan ausgegeben oder bereits verbraucht.',
      )
    }
    const request = canonicalCentralMexcPlan(plan)
    const credentials = decodeCentralMexcCredentialMaterial(input.credentialMaterial)
    const response = await executePreparedRequest(
      request,
      mexcPrivateReadHeaders(request, input.sendAuthorization.authorizedAtEpochMs, credentials),
      null,
      Date.parse(input.sendAuthorization.sendDeadlineAt),
    )
    return Object.freeze({
      startedAt: centralUnixMicrosecondsToIso(response.requestStartedAtUs),
      receivedAt: centralUnixMicrosecondsToIso(response.responseReceivedAtUs),
      httpStatus: response.httpStatus,
      rawBody: Uint8Array.from(Buffer.from(response.rawBodyBase64, 'base64')),
    })
  },
})

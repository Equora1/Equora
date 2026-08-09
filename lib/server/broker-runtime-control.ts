import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const BROKER_CONNECTION_SETUP_REQUEST_RPC = 'equora_request_mexc_connection_setup_v1' as const
export const BROKER_CONNECTION_SETUP_APPLY_RPC = 'equora_apply_mexc_connection_setup_v1' as const
export const BROKER_CONNECTION_REVOCATION_REQUEST_RPC = 'equora_request_mexc_connection_revocation_v1' as const
export const BROKER_CONNECTION_REVOCATION_APPLY_RPC = 'equora_apply_mexc_connection_revocation_v1' as const
export const BROKER_CAPTURE_FIND_CLAIMABLE_RPC = 'equora_find_claimable_broker_capture_work_unit_v1' as const
export const BROKER_CAPTURE_FIND_PENDING_YIELDED_RPC = 'equora_find_pending_yielded_broker_capture_work_unit_v1' as const
export const BROKER_CAPTURE_FIND_PENDING_FINALIZATION_RPC = 'equora_find_pending_broker_capture_scope_finalization_v1' as const
export const BROKER_CAPTURE_LOAD_MATERIAL_RPC = 'equora_load_broker_capture_material_v1' as const
export const BROKER_CAPTURE_FINALIZE_SCOPE_RPC = 'equora_finalize_broker_capture_scope_v1' as const

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const VERSION_PATTERN = /^[a-z][a-z0-9_]{0,62}$/

export type BrokerConnectionSetupRequestResult = Readonly<{
  commandId: string
  commandStatus: 'pending' | 'applied'
  result: Readonly<Record<string, unknown>> | null
  authorityBlocked: true
}>

export type BrokerConnectionSetupApplyResult = Readonly<{
  status: 'connection_activated'
  connectionId: string
  connectionAccountId: string
  brokerAccountId: string
  activationSeriesId: string
  syncActivationId: string
  activationGeneration: number
  seriesRowVersion: number
  activationRowVersion: number
  requirementCount: number
  probeEvidencePersistence: 'transient_not_persisted'
  symbolCount: number
  automaticImportAuthorized: false
  tradingAuthorized: false
  authorityBlocked: true
}>

export type BrokerConnectionRevocationResult = Readonly<{
  status: 'revoked'
  activationSeriesId: string
  syncActivationId: string
  activationGeneration: number
  seriesRowVersion: number
  activationRowVersion: number
  authorityEpoch: number
  connectionId: string
  credentialsRevoked: true
  automaticImportAuthorized: false
  tradingAuthorized: false
  authorityBlocked: true
}>

export type BrokerCaptureClaimableResult = Readonly<{
  status: 'claimable' | 'no_claimable'
  workUnitId: string | null
  workUnitRowVersion: number | null
  authorityBlocked: true
}>

export type BrokerCapturePendingFinalizationResult = Readonly<{
  status: 'pending' | 'no_pending'
  requestAuthorizationId: string | null
  authorityBlocked: true
}>

export type BrokerCapturePendingYieldedResult = Readonly<{
  status: 'pending' | 'no_pending'
  workUnitId: string | null
  workUnitRowVersion: number | null
  authorityBlocked: true
}>

export type BrokerCaptureMaterialResult = Readonly<{
  status: 'material_loaded'
  requestAuthorizationId: string
  userId: string
  providerCode: 'mexc'
  brokerAccountId: string
  connectionAccountId: string
  syncActivationId: string
  activationGeneration: number
  credentialReference: Readonly<{ id: string; keyVersion: string }>
  encryptedPayload: string
  integrityKeyReference: Readonly<{ id: string; keyVersion: string }>
  integrityKeyBase64: string
  sendDeadlineAt: string
  authorityBlocked: true
}>

export type BrokerCaptureScopeFinalizationResult = Readonly<{
  status: 'scope_finalized'
  requestAuthorizationId: string
  scopeId: string
  laneStateId: string
  watermarkTimeMs: number
  watermarkTieBreaker: string
  laneResult: Readonly<Record<string, unknown>>
  automaticImportAuthorized: false
  tradingAuthorized: false
  authorityBlocked: true
}>

export class BrokerRuntimeControlError extends Error {
  constructor(
    public readonly code: 'invalid_input' | 'database_error' | 'database_result_invalid',
    message: string,
  ) {
    super(message)
    this.name = 'BrokerRuntimeControlError'
  }
}

function fail(code: BrokerRuntimeControlError['code'], message: string): never {
  throw new BrokerRuntimeControlError(code, message)
}

function record(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('database_result_invalid', `${label} ist kein geschlossenes Datenbankergebnis.`)
  }
  return value as Record<string, unknown>
}

function exactKeys(value: unknown, expected: readonly string[], label: string) {
  const result = record(value, label)
  const actual = Object.keys(result).sort()
  const canonical = [...expected].sort()
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    fail('database_result_invalid', `${label} besitzt unbekannte oder fehlende Felder.`)
  }
  return result
}

function uuid(value: unknown, label: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) fail('database_result_invalid', `${label} ist ungültig.`)
  return value
}

function integer(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('database_result_invalid', `${label} ist ungültig.`)
  }
  return value as number
}

function databaseFailure(error: { message?: string } | null) {
  if (error) fail('database_error', 'Die geschlossene Broker-Runtime-Transaktion wurde von der Datenbank abgelehnt.')
}

export async function requestMexcConnectionSetupWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: Readonly<{ requestId: string; accountLabel: string; symbols: readonly string[] }>,
) {
  if (!UUID_PATTERN.test(input.requestId) || !input.symbols.length) fail('invalid_input', 'Connection-Setup-Input ist ungültig.')
  const { data, error } = await client.rpc(BROKER_CONNECTION_SETUP_REQUEST_RPC, {
    p_request_id: input.requestId,
    p_account_label: input.accountLabel,
    p_symbols: input.symbols,
    p_read_only_attested: true,
  })
  databaseFailure(error)
  const result = exactKeys(data, ['authorityBlocked', 'commandId', 'commandStatus', 'result'], 'Setup-Command')
  if (
    result.commandId !== input.requestId
    || !['pending', 'applied'].includes(result.commandStatus as string)
    || result.authorityBlocked !== true
    || (result.result !== null && (!result.result || typeof result.result !== 'object' || Array.isArray(result.result)))
  ) fail('database_result_invalid', 'Setup-Command widerspricht dem Vertrag.')
  return Object.freeze(result as unknown as BrokerConnectionSetupRequestResult)
}

export async function applyMexcConnectionSetupWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: Readonly<{
    commandId: string
    encryptedPayload: string
    credentialKeyVersion: string
    accountIdentityDigest: string
    accountIdentityKeyVersion: string
    integrityKeyBase64: string
  }>,
) {
  if (
    !UUID_PATTERN.test(input.commandId)
    || !input.encryptedPayload
    || !VERSION_PATTERN.test(input.credentialKeyVersion)
    || !SHA256_PATTERN.test(input.accountIdentityDigest)
    || !VERSION_PATTERN.test(input.accountIdentityKeyVersion)
    || !input.integrityKeyBase64
  ) fail('invalid_input', 'Connection-Setup-Apply-Input ist ungültig.')
  const { data, error } = await client.rpc(BROKER_CONNECTION_SETUP_APPLY_RPC, {
    p_command_id: input.commandId,
    p_encrypted_payload: input.encryptedPayload,
    p_credential_key_version: input.credentialKeyVersion,
    p_account_identity_digest: input.accountIdentityDigest,
    p_account_identity_key_version: input.accountIdentityKeyVersion,
    p_integrity_key_base64: input.integrityKeyBase64,
  })
  databaseFailure(error)
  const result = exactKeys(data, [
    'activationGeneration', 'activationRowVersion', 'activationSeriesId',
    'authorityBlocked', 'automaticImportAuthorized', 'brokerAccountId',
    'connectionAccountId', 'connectionId', 'probeEvidencePersistence', 'requirementCount',
    'seriesRowVersion', 'status', 'symbolCount', 'syncActivationId',
    'tradingAuthorized',
  ], 'Setup-Apply')
  for (const key of ['activationSeriesId', 'brokerAccountId', 'connectionAccountId', 'connectionId', 'syncActivationId']) {
    uuid(result[key], key)
  }
  if (
    result.status !== 'connection_activated'
    || result.authorityBlocked !== true
    || result.automaticImportAuthorized !== false
    || result.tradingAuthorized !== false
  ) fail('database_result_invalid', 'Setup-Apply widerspricht dem Read-only-Vertrag.')
  integer(result.activationGeneration, 1, Number.MAX_SAFE_INTEGER, 'activationGeneration')
  integer(result.activationRowVersion, 0, Number.MAX_SAFE_INTEGER, 'activationRowVersion')
  integer(result.seriesRowVersion, 0, Number.MAX_SAFE_INTEGER, 'seriesRowVersion')
  integer(result.requirementCount, 6, 30, 'requirementCount')
  if (result.probeEvidencePersistence !== 'transient_not_persisted') {
    fail('database_result_invalid', 'Setup-Apply besitzt unvollständige Capability-Evidenz.')
  }
  integer(result.symbolCount, 1, 5, 'symbolCount')
  return Object.freeze(result as unknown as BrokerConnectionSetupApplyResult)
}

export function applyMexcConnectionSetup(input: Parameters<typeof applyMexcConnectionSetupWithClient>[1]) {
  return applyMexcConnectionSetupWithClient(createSupabaseServerClient(), input)
}

export async function requestMexcConnectionRevocationWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: Readonly<{ connectionId: string; requestId: string }>,
) {
  if (!UUID_PATTERN.test(input.connectionId) || !UUID_PATTERN.test(input.requestId)) {
    fail('invalid_input', 'Connection-Revocation-Input ist ungültig.')
  }
  const { data, error } = await client.rpc(BROKER_CONNECTION_REVOCATION_REQUEST_RPC, {
    p_connection_id: input.connectionId,
    p_request_id: input.requestId,
  })
  databaseFailure(error)
  const result = exactKeys(data, ['authorityBlocked', 'commandId', 'commandStatus', 'result'], 'Revocation-Command')
  if (
    result.commandId !== input.requestId
    || !['pending', 'applied'].includes(result.commandStatus as string)
    || result.authorityBlocked !== true
    || (result.result !== null && (!result.result || typeof result.result !== 'object' || Array.isArray(result.result)))
  ) fail('database_result_invalid', 'Revocation-Command widerspricht dem Vertrag.')
  return Object.freeze(result as unknown as BrokerConnectionSetupRequestResult)
}

export async function applyMexcConnectionRevocationWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  commandId: string,
) {
  if (!UUID_PATTERN.test(commandId)) fail('invalid_input', 'Connection-Revocation-Command ist ungültig.')
  const { data, error } = await client.rpc(BROKER_CONNECTION_REVOCATION_APPLY_RPC, {
    p_command_id: commandId,
  })
  databaseFailure(error)
  const result = exactKeys(data, [
    'activationGeneration', 'activationRowVersion', 'activationSeriesId',
    'authorityBlocked', 'authorityEpoch', 'automaticImportAuthorized',
    'connectionId', 'credentialsRevoked', 'seriesRowVersion', 'status',
    'syncActivationId', 'tradingAuthorized',
  ], 'Revocation-Apply')
  for (const key of ['activationSeriesId', 'connectionId', 'syncActivationId']) uuid(result[key], key)
  if (
    result.status !== 'revoked'
    || result.credentialsRevoked !== true
    || result.automaticImportAuthorized !== false
    || result.tradingAuthorized !== false
    || result.authorityBlocked !== true
  ) fail('database_result_invalid', 'Revocation-Apply widerspricht dem Vertrag.')
  for (const key of ['activationGeneration', 'activationRowVersion', 'authorityEpoch', 'seriesRowVersion']) {
    integer(result[key], 0, Number.MAX_SAFE_INTEGER, key)
  }
  return Object.freeze(result as unknown as BrokerConnectionRevocationResult)
}

export function applyMexcConnectionRevocation(commandId: string) {
  return applyMexcConnectionRevocationWithClient(createSupabaseServerClient(), commandId)
}

export async function findClaimableBrokerCaptureWorkUnitWithClient(client: Pick<SupabaseClient, 'rpc'>) {
  const { data, error } = await client.rpc(BROKER_CAPTURE_FIND_CLAIMABLE_RPC)
  databaseFailure(error)
  const result = exactKeys(data, ['authorityBlocked', 'status', 'workUnitId', 'workUnitRowVersion'], 'Claimable-Hinweis')
  if (!['claimable', 'no_claimable'].includes(result.status as string) || result.authorityBlocked !== true) {
    fail('database_result_invalid', 'Claimable-Hinweis widerspricht dem Vertrag.')
  }
  const empty = result.status === 'no_claimable'
  if (empty ? result.workUnitId !== null || result.workUnitRowVersion !== null : result.workUnitId === null || result.workUnitRowVersion === null) {
    fail('database_result_invalid', 'Claimable-Hinweis besitzt inkonsistente Felder.')
  }
  return Object.freeze({
    status: result.status,
    workUnitId: empty ? null : uuid(result.workUnitId, 'workUnitId'),
    workUnitRowVersion: empty ? null : integer(result.workUnitRowVersion, 0, Number.MAX_SAFE_INTEGER, 'workUnitRowVersion'),
    authorityBlocked: true,
  } as BrokerCaptureClaimableResult)
}

export function findClaimableBrokerCaptureWorkUnit() {
  return findClaimableBrokerCaptureWorkUnitWithClient(createSupabaseServerClient())
}

export async function findPendingYieldedBrokerCaptureWorkUnitWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
) {
  const { data, error } = await client.rpc(BROKER_CAPTURE_FIND_PENDING_YIELDED_RPC)
  databaseFailure(error)
  const result = exactKeys(
    data,
    ['authorityBlocked', 'status', 'workUnitId', 'workUnitRowVersion'],
    'Yield-Continuation-Hinweis',
  )
  if (!['pending', 'no_pending'].includes(result.status as string) || result.authorityBlocked !== true) {
    fail('database_result_invalid', 'Yield-Continuation-Hinweis widerspricht dem Vertrag.')
  }
  const empty = result.status === 'no_pending'
  if (empty
    ? result.workUnitId !== null || result.workUnitRowVersion !== null
    : result.workUnitId === null || result.workUnitRowVersion === null) {
    fail('database_result_invalid', 'Yield-Continuation-Hinweis besitzt inkonsistente Felder.')
  }
  return Object.freeze({
    status: result.status,
    workUnitId: empty ? null : uuid(result.workUnitId, 'workUnitId'),
    workUnitRowVersion: empty
      ? null
      : integer(result.workUnitRowVersion, 0, Number.MAX_SAFE_INTEGER, 'workUnitRowVersion'),
    authorityBlocked: true,
  } as BrokerCapturePendingYieldedResult)
}

export function findPendingYieldedBrokerCaptureWorkUnit() {
  return findPendingYieldedBrokerCaptureWorkUnitWithClient(createSupabaseServerClient())
}

export async function findPendingBrokerCaptureScopeFinalizationWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
) {
  const { data, error } = await client.rpc(BROKER_CAPTURE_FIND_PENDING_FINALIZATION_RPC)
  databaseFailure(error)
  const result = exactKeys(data, ['authorityBlocked', 'requestAuthorizationId', 'status'], 'Finalisierungs-Hinweis')
  if (!['pending', 'no_pending'].includes(result.status as string) || result.authorityBlocked !== true) {
    fail('database_result_invalid', 'Finalisierungs-Hinweis widerspricht dem Vertrag.')
  }
  const empty = result.status === 'no_pending'
  if (empty ? result.requestAuthorizationId !== null : result.requestAuthorizationId === null) {
    fail('database_result_invalid', 'Finalisierungs-Hinweis besitzt inkonsistente Felder.')
  }
  return Object.freeze({
    status: result.status,
    requestAuthorizationId: empty ? null : uuid(result.requestAuthorizationId, 'requestAuthorizationId'),
    authorityBlocked: true,
  } as BrokerCapturePendingFinalizationResult)
}

export function findPendingBrokerCaptureScopeFinalization() {
  return findPendingBrokerCaptureScopeFinalizationWithClient(createSupabaseServerClient())
}

export async function loadBrokerCaptureMaterialWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  requestAuthorizationId: string,
) {
  if (!UUID_PATTERN.test(requestAuthorizationId)) fail('invalid_input', 'Request-Authorization-ID ist ungültig.')
  const { data, error } = await client.rpc(BROKER_CAPTURE_LOAD_MATERIAL_RPC, {
    p_request_authorization_id: requestAuthorizationId,
  })
  databaseFailure(error)
  const result = exactKeys(data, [
    'activationGeneration', 'authorityBlocked', 'brokerAccountId',
    'connectionAccountId', 'credentialReference', 'encryptedPayload',
    'integrityKeyBase64', 'integrityKeyReference', 'providerCode',
    'requestAuthorizationId', 'sendDeadlineAt', 'status',
    'syncActivationId', 'userId',
  ], 'Material-Load')
  const credentialReference = exactKeys(result.credentialReference, ['id', 'keyVersion'], 'Credential-Referenz')
  const integrityKeyReference = exactKeys(result.integrityKeyReference, ['id', 'keyVersion'], 'Integrity-Key-Referenz')
  if (
    result.status !== 'material_loaded'
    || result.requestAuthorizationId !== requestAuthorizationId
    || result.providerCode !== 'mexc'
    || result.authorityBlocked !== true
    || typeof result.encryptedPayload !== 'string'
    || !result.encryptedPayload
    || typeof result.integrityKeyBase64 !== 'string'
    || !result.integrityKeyBase64
    || typeof result.sendDeadlineAt !== 'string'
    || !Number.isFinite(Date.parse(result.sendDeadlineAt))
  ) fail('database_result_invalid', 'Material-Load widerspricht dem Vertrag.')
  for (const key of ['brokerAccountId', 'connectionAccountId', 'requestAuthorizationId', 'syncActivationId', 'userId']) uuid(result[key], key)
  uuid(credentialReference.id, 'credentialReference.id')
  uuid(integrityKeyReference.id, 'integrityKeyReference.id')
  if (!VERSION_PATTERN.test(credentialReference.keyVersion as string) || !VERSION_PATTERN.test(integrityKeyReference.keyVersion as string)) {
    fail('database_result_invalid', 'Material-Referenzversion ist ungültig.')
  }
  integer(result.activationGeneration, 1, Number.MAX_SAFE_INTEGER, 'activationGeneration')
  return Object.freeze({
    ...result,
    credentialReference: Object.freeze(credentialReference),
    integrityKeyReference: Object.freeze(integrityKeyReference),
  } as unknown as BrokerCaptureMaterialResult)
}

export function loadBrokerCaptureMaterial(requestAuthorizationId: string) {
  return loadBrokerCaptureMaterialWithClient(createSupabaseServerClient(), requestAuthorizationId)
}

export async function finalizeBrokerCaptureScopeWithClient(
  client: Pick<SupabaseClient, 'rpc'>,
  input: Readonly<{ requestAuthorizationId: string; requestId: string }>,
) {
  if (!UUID_PATTERN.test(input.requestAuthorizationId) || !UUID_PATTERN.test(input.requestId)) {
    fail('invalid_input', 'Scope-Finalization-Input ist ungültig.')
  }
  const { data, error } = await client.rpc(BROKER_CAPTURE_FINALIZE_SCOPE_RPC, {
    p_request_authorization_id: input.requestAuthorizationId,
    p_request_id: input.requestId,
  })
  databaseFailure(error)
  const result = exactKeys(data, [
    'authorityBlocked', 'automaticImportAuthorized', 'laneResult', 'laneStateId',
    'requestAuthorizationId', 'scopeId', 'status', 'tradingAuthorized',
    'watermarkTieBreaker', 'watermarkTimeMs',
  ], 'Scope-Finalisierung')
  if (
    result.status !== 'scope_finalized'
    || result.requestAuthorizationId !== input.requestAuthorizationId
    || result.authorityBlocked !== true
    || result.automaticImportAuthorized !== false
    || result.tradingAuthorized !== false
    || typeof result.watermarkTieBreaker !== 'string'
    || !/^(0|[1-9][0-9]{0,127})$/.test(result.watermarkTieBreaker)
    || !result.laneResult
    || typeof result.laneResult !== 'object'
    || Array.isArray(result.laneResult)
  ) fail('database_result_invalid', 'Scope-Finalisierung widerspricht dem Vertrag.')
  uuid(result.scopeId, 'scopeId')
  uuid(result.laneStateId, 'laneStateId')
  integer(result.watermarkTimeMs, 0, Number.MAX_SAFE_INTEGER, 'watermarkTimeMs')
  return Object.freeze(result as unknown as BrokerCaptureScopeFinalizationResult)
}

export function finalizeBrokerCaptureScope(input: Parameters<typeof finalizeBrokerCaptureScopeWithClient>[1]) {
  return finalizeBrokerCaptureScopeWithClient(createSupabaseServerClient(), input)
}

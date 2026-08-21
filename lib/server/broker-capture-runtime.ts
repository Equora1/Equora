import 'server-only'

import { createHash } from 'node:crypto'
import {
  BROKER_CAPTURE_EFFECT_AUTHORITY_VERSION,
  BROKER_CAPTURE_RUNTIME_AUTHORITY_VERSION,
  BROKER_CAPTURE_RUNTIME_REGISTRATION_VERSION,
  createBrokerCaptureDispatcher,
  type BrokerCaptureEffectAuthority,
} from '@/lib/server/broker-capture-dispatcher'
import { runMexcCaptureCycle } from '@/lib/server/mexc-capture-runtime'
import {
  getMexcRuntimeMode,
  isMexcCaptureEnvironmentReady,
} from '@/lib/server/mexc-runtime'
import {
  MEXC_ADAPTER_VERSION,
  MEXC_PROVIDER_CODE,
  MEXC_PROVIDER_CONTRACT_VERSION,
} from '@/lib/server/providers/mexc-readonly-adapter'

export const MEXC_CAPTURE_FAILURE_CODES = Object.freeze([
  'transport_contract_violation',
  'invalid_query',
  'invalid_provider_time',
  'invalid_credential',
  'ip_not_allowed',
  'permission_missing',
  'rate_limited',
  'provider_busy',
  'maintenance',
  'invalid_request',
  'unsupported_contract',
  'unknown_provider_error',
  'provider_unavailable',
  'timeout',
  'response_too_large',
  'malformed_response',
  'SCOPE_BUDGET_EXHAUSTED',
  'initialized',
  'resumed_same_work_unit',
  'continued_in_new_work_unit',
  'page_committed',
  'retry_scheduled',
  'work_unit_budget_reached',
  'scope_budget_reached',
  'terminal_short_bare_array',
  'terminal_provider_page_metadata',
  'terminal_canonical_empty_page',
  'non_retryable_failure',
  'retry_budget_reached',
  'failure_budget_reached',
  'claim_attempt_budget_reached',
  'provider_retry_deferred',
  'response_exceeds_remaining_budget',
  'provider_page_number_limit_reached',
  'cursor_progress_violation',
  'repeated_page_without_cursor_progress',
] as const)

const MEXC_RUNTIME_AUTHORITY_ENV_KEYS = Object.freeze([
  'EQUORA_MEXC_RUNTIME_MODE',
  'EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'EQUORA_BROKER_SECRET_KEYS',
  'EQUORA_BROKER_SECRET_KEY',
  'EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION',
  'EQUORA_BROKER_IDENTITY_KEY',
  'EQUORA_BROKER_IDENTITY_KEY_VERSION',
  'VERCEL_DEPLOYMENT_ID',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_ENV',
  'NODE_ENV',
] as const)

let lastActiveRuntimeAuthority: Readonly<{
  epoch: number
  configurationDigest: string
}> | null = null
let runtimeAuthoritySequenceInvalid = false

function readRuntimeAuthorityEpoch() {
  const raw = process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH?.trim()
  if (!raw || !/^[1-9][0-9]{0,15}$/.test(raw)) return 0
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : 0
}

function runtimeConfigurationDigest() {
  const hash = createHash('sha256')
  hash.update('equora:mexc-capture-runtime-configuration-v1\0', 'utf8')
  for (const key of MEXC_RUNTIME_AUTHORITY_ENV_KEYS) {
    const value = process.env[key] ?? ''
    hash.update(`${Buffer.byteLength(key, 'utf8')}:`, 'utf8').update(key, 'utf8')
    hash.update(`${Buffer.byteLength(value, 'utf8')}:`, 'utf8').update(value, 'utf8')
  }
  return hash.digest('hex')
}

function observeMonotonicRuntimeAuthority(epoch: number, configurationDigest: string) {
  if (runtimeAuthoritySequenceInvalid || epoch < 1) return false
  if (lastActiveRuntimeAuthority) {
    if (epoch < lastActiveRuntimeAuthority.epoch
      || (epoch === lastActiveRuntimeAuthority.epoch
        && configurationDigest !== lastActiveRuntimeAuthority.configurationDigest)) {
      runtimeAuthoritySequenceInvalid = true
      return false
    }
  }
  if (!lastActiveRuntimeAuthority || epoch > lastActiveRuntimeAuthority.epoch) {
    lastActiveRuntimeAuthority = Object.freeze({ epoch, configurationDigest })
  }
  return true
}

function readMexcCaptureRuntimeAuthority() {
  const mode = getMexcRuntimeMode()
  const runtimeAuthorityEpoch = readRuntimeAuthorityEpoch()
  const captureEnvironmentReady = isMexcCaptureEnvironmentReady()
  const configurationDigest = runtimeConfigurationDigest()
  const monotonicAuthorityValid = mode !== 'capture'
    || observeMonotonicRuntimeAuthority(runtimeAuthorityEpoch, configurationDigest)
  const environmentReady = captureEnvironmentReady
    && monotonicAuthorityValid
  return Object.freeze({
    authorityContractVersion: BROKER_CAPTURE_RUNTIME_AUTHORITY_VERSION,
    providerCode: MEXC_PROVIDER_CODE,
    providerContractVersion: MEXC_PROVIDER_CONTRACT_VERSION,
    adapterVersion: MEXC_ADAPTER_VERSION,
    runtimeAuthorityEpoch,
    runtimeConfigurationDigest: configurationDigest,
    captureActivated: mode === 'capture',
    environmentReady,
  })
}

function runMexcCycleAtAuthorizedEffectBoundary(authority: BrokerCaptureEffectAuthority) {
  if (authority.effectAuthorityContractVersion !== BROKER_CAPTURE_EFFECT_AUTHORITY_VERSION
    || authority.providerCode !== MEXC_PROVIDER_CODE) {
    throw new Error('MEXC_CAPTURE_DISPATCH_AUTHORITY_INVALID')
  }
  return authority.runAtEffectBoundary(runMexcCaptureCycle)
}

const dispatcher = createBrokerCaptureDispatcher(Object.freeze([
  Object.freeze({
    registrationContractVersion: BROKER_CAPTURE_RUNTIME_REGISTRATION_VERSION,
    providerCode: MEXC_PROVIDER_CODE,
    providerContractVersion: MEXC_PROVIDER_CONTRACT_VERSION,
    adapterVersion: MEXC_ADAPTER_VERSION,
    failureCodes: MEXC_CAPTURE_FAILURE_CODES,
    readRuntimeAuthority: readMexcCaptureRuntimeAuthority,
    runCaptureCycle: runMexcCycleAtAuthorizedEffectBoundary,
  }),
]))

export function runBrokerCaptureCycle() {
  return dispatcher.runCycle()
}

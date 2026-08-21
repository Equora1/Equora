import 'server-only'

import { isPromise, isProxy } from 'node:util/types'

const PROVIDER_CODE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/
const VERSION_PATTERN = /^[a-z][a-z0-9_]{0,62}$/
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const FAILURE_CODE_PATTERN = /^(?:[a-z][a-z0-9_]{0,127}|[A-Z][A-Z0-9_]{0,127})$/

export const BROKER_CAPTURE_DISPATCHER_CONTRACT_VERSION = 'equora-broker-capture-dispatcher-v6' as const
export const BROKER_CAPTURE_RUNTIME_REGISTRATION_VERSION = 'equora-broker-capture-runtime-registration-v6' as const
export const BROKER_CAPTURE_RUNTIME_AUTHORITY_VERSION = 'equora-broker-capture-runtime-authority-v2' as const
export const BROKER_CAPTURE_EFFECT_AUTHORITY_VERSION = 'equora-broker-capture-effect-authority-v4' as const

const INTRINSIC_PROMISE = Promise
const INTRINSIC_PROMISE_PROTOTYPE = Promise.prototype
const INTRINSIC_PROMISE_THEN = Promise.prototype.then
const INTRINSIC_PROMISE_SPECIES_GET = Object.getOwnPropertyDescriptor(Promise, Symbol.species)?.get

export type BrokerCaptureProviderCycleResult = Readonly<{
  status: 'disabled' | 'idle' | 'captured' | 'failed' | 'released'
  workUnitId: string | null
  pagesCommitted: number
  scopeFinalized: boolean
  failureCode: string | null
  authorityBlocked: true
}>

export type BrokerCaptureDispatchResult = Readonly<{
  dispatcherContractVersion: typeof BROKER_CAPTURE_DISPATCHER_CONTRACT_VERSION
  status: 'disabled' | 'runtime_not_configured' | BrokerCaptureProviderCycleResult['status']
  providerCode: string | null
  workUnitId: string | null
  pagesCommitted: number
  scopeFinalized: boolean
  failureCode: string | null
  authorityBlocked: true
}>

export type BrokerCaptureRuntimeAuthority = Readonly<{
  authorityContractVersion: typeof BROKER_CAPTURE_RUNTIME_AUTHORITY_VERSION
  providerCode: string
  providerContractVersion: string
  adapterVersion: string
  runtimeAuthorityEpoch: number
  runtimeConfigurationDigest: string
  captureActivated: boolean
  environmentReady: boolean
}>

export type BrokerCaptureEffectAuthority = Readonly<{
  effectAuthorityContractVersion: typeof BROKER_CAPTURE_EFFECT_AUTHORITY_VERSION
  providerCode: string
  runtimeAuthorityEpoch: number
  runtimeConfigurationDigest: string
  runAtEffectBoundary<Result>(effect: () => Promise<Result>): Promise<Result>
}>

export type BrokerCaptureRuntimeRegistration = Readonly<{
  registrationContractVersion: typeof BROKER_CAPTURE_RUNTIME_REGISTRATION_VERSION
  providerCode: string
  providerContractVersion: string
  adapterVersion: string
  failureCodes: readonly string[]
  readRuntimeAuthority(): BrokerCaptureRuntimeAuthority
  runCaptureCycle(authority: BrokerCaptureEffectAuthority): Promise<BrokerCaptureProviderCycleResult>
}>

export type BrokerCaptureDispatcher = Readonly<{
  runCycle(): Promise<BrokerCaptureDispatchResult>
}>

export class BrokerCaptureDispatchError extends Error {
  constructor(
    public readonly code:
      | 'invalid_registry'
      | 'ambiguous_runtime_authority'
      | 'runtime_gate_failed'
      | 'dispatch_authority_invalidated'
      | 'provider_result_invalid',
  ) {
    super(`Broker capture dispatch failed: ${code}`)
    this.name = 'BrokerCaptureDispatchError'
  }
}

type ClosedRegistration = Readonly<{
  registrationContractVersion: typeof BROKER_CAPTURE_RUNTIME_REGISTRATION_VERSION
  providerCode: string
  providerContractVersion: string
  adapterVersion: string
  failureCodes: ReadonlySet<string>
  readRuntimeAuthority(): BrokerCaptureRuntimeAuthority
  runCaptureCycle(authority: BrokerCaptureEffectAuthority): Promise<BrokerCaptureProviderCycleResult>
}>

type EffectAuthorityState = {
  status: 'issued' | 'consuming' | 'consumed' | 'revoked'
  token: object
  selectedIndex: number
  authoritySet: readonly BrokerCaptureRuntimeAuthority[]
  registrations: readonly ClosedRegistration[]
  effectPromise: Promise<unknown> | null
}

const effectAuthorities = new WeakMap<object, EffectAuthorityState>()

function fail(code: BrokerCaptureDispatchError['code']): never {
  throw new BrokerCaptureDispatchError(code)
}

function safeObjectPrototype(value: object) {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactOwnDataValues(
  value: object,
  expectedKeys: readonly string[],
  code: BrokerCaptureDispatchError['code'],
): Readonly<Record<string, unknown>> {
  const actualKeys = Reflect.ownKeys(value)
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))) {
    fail(code)
  }
  const snapshot: Record<string, unknown> = Object.create(null)
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) fail(code)
    snapshot[key] = descriptor.value
  }
  return Object.freeze(snapshot)
}

function closedFrozenArray<TInput, TOutput>(
  value: readonly TInput[],
  maxLength: number,
  closeItem: (item: TInput, index: number) => TOutput,
): readonly TOutput[] {
  if (!Array.isArray(value) || isProxy(value) || !Object.isFrozen(value)
    || value.length === 0 || value.length > maxLength) fail('invalid_registry')
  const keys = Reflect.ownKeys(value)
  const expectedKeys = new Set<PropertyKey>(['length'])
  for (let index = 0; index < value.length; index += 1) expectedKeys.add(String(index))
  if (keys.length !== expectedKeys.size || keys.some((key) => !expectedKeys.has(key))) fail('invalid_registry')
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (!lengthDescriptor || !('value' in lengthDescriptor) || lengthDescriptor.value !== value.length
    || lengthDescriptor.writable !== false || lengthDescriptor.configurable !== false) fail('invalid_registry')
  const result: TOutput[] = []
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true
      || descriptor.writable !== false || descriptor.configurable !== false) fail('invalid_registry')
    result.push(closeItem(descriptor.value as TInput, index))
  }
  return Object.freeze(result)
}

function ownDataMethod(
  values: Readonly<Record<string, unknown>>,
  methodName: 'readRuntimeAuthority' | 'runCaptureCycle',
  receiver: BrokerCaptureRuntimeRegistration,
) {
  const method = values[methodName]
  if (typeof method !== 'function') fail('invalid_registry')
  return method.bind(receiver) as (...args: never[]) => unknown
}

function closedFailureCodes(value: unknown) {
  if (!Array.isArray(value)) fail('invalid_registry')
  const closed = closedFrozenArray(value, 128, (item) => {
    if (typeof item !== 'string' || !FAILURE_CODE_PATTERN.test(item)) fail('invalid_registry')
    return item
  })
  const result = new Set<string>()
  for (let index = 0; index < closed.length; index += 1) {
    const code = closed[index]!
    if (result.has(code)) fail('invalid_registry')
    result.add(code)
  }
  return result
}

function closedRegistration(candidate: BrokerCaptureRuntimeRegistration): ClosedRegistration {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
    || isProxy(candidate) || !Object.isFrozen(candidate) || !safeObjectPrototype(candidate)) {
    fail('invalid_registry')
  }
  const values = exactOwnDataValues(candidate, [
    'registrationContractVersion',
    'providerCode',
    'providerContractVersion',
    'adapterVersion',
    'failureCodes',
    'readRuntimeAuthority',
    'runCaptureCycle',
  ], 'invalid_registry')
  if (values.registrationContractVersion !== BROKER_CAPTURE_RUNTIME_REGISTRATION_VERSION
    || typeof values.providerCode !== 'string' || !PROVIDER_CODE_PATTERN.test(values.providerCode)
    || typeof values.providerContractVersion !== 'string' || !VERSION_PATTERN.test(values.providerContractVersion)
    || typeof values.adapterVersion !== 'string' || !VERSION_PATTERN.test(values.adapterVersion)) {
    fail('invalid_registry')
  }
  return Object.freeze({
    registrationContractVersion: BROKER_CAPTURE_RUNTIME_REGISTRATION_VERSION,
    providerCode: values.providerCode,
    providerContractVersion: values.providerContractVersion,
    adapterVersion: values.adapterVersion,
    failureCodes: closedFailureCodes(values.failureCodes),
    readRuntimeAuthority: ownDataMethod(values, 'readRuntimeAuthority', candidate) as () => BrokerCaptureRuntimeAuthority,
    runCaptureCycle: ownDataMethod(values, 'runCaptureCycle', candidate) as (
      authority: BrokerCaptureEffectAuthority
    ) => Promise<BrokerCaptureProviderCycleResult>,
  })
}

function inertResult(
  status: 'disabled' | 'runtime_not_configured',
  providerCode: string | null,
): BrokerCaptureDispatchResult {
  return Object.freeze({
    dispatcherContractVersion: BROKER_CAPTURE_DISPATCHER_CONTRACT_VERSION,
    status,
    providerCode,
    workUnitId: null,
    pagesCommitted: 0,
    scopeFinalized: false,
    failureCode: null,
    authorityBlocked: true,
  })
}

function readAuthority(registration: ClosedRegistration): BrokerCaptureRuntimeAuthority {
  let value: BrokerCaptureRuntimeAuthority
  try {
    value = registration.readRuntimeAuthority()
  } catch {
    fail('runtime_gate_failed')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)
    || !Object.isFrozen(value) || !safeObjectPrototype(value)) fail('runtime_gate_failed')
  const values = exactOwnDataValues(value, [
    'authorityContractVersion',
    'providerCode',
    'providerContractVersion',
    'adapterVersion',
    'runtimeAuthorityEpoch',
    'runtimeConfigurationDigest',
    'captureActivated',
    'environmentReady',
  ], 'runtime_gate_failed')
  if (values.authorityContractVersion !== BROKER_CAPTURE_RUNTIME_AUTHORITY_VERSION
    || values.providerCode !== registration.providerCode
    || values.providerContractVersion !== registration.providerContractVersion
    || values.adapterVersion !== registration.adapterVersion
    || !Number.isSafeInteger(values.runtimeAuthorityEpoch) || (values.runtimeAuthorityEpoch as number) < 0
    || typeof values.runtimeConfigurationDigest !== 'string'
    || !/^[a-f0-9]{64}$/.test(values.runtimeConfigurationDigest)
    || typeof values.captureActivated !== 'boolean'
    || typeof values.environmentReady !== 'boolean'
    || (values.captureActivated === true && values.environmentReady === true
      && (values.runtimeAuthorityEpoch as number) < 1)) fail('runtime_gate_failed')
  return Object.freeze({
    authorityContractVersion: BROKER_CAPTURE_RUNTIME_AUTHORITY_VERSION,
    providerCode: registration.providerCode,
    providerContractVersion: registration.providerContractVersion,
    adapterVersion: registration.adapterVersion,
    runtimeAuthorityEpoch: values.runtimeAuthorityEpoch as number,
    runtimeConfigurationDigest: values.runtimeConfigurationDigest,
    captureActivated: values.captureActivated,
    environmentReady: values.environmentReady,
  })
}

function readAuthoritySet(registrations: readonly ClosedRegistration[]) {
  const authoritySet: BrokerCaptureRuntimeAuthority[] = []
  for (let index = 0; index < registrations.length; index += 1) {
    authoritySet.push(readAuthority(registrations[index]!))
  }
  return Object.freeze(authoritySet)
}

function sameAuthoritySet(
  left: readonly BrokerCaptureRuntimeAuthority[],
  right: readonly BrokerCaptureRuntimeAuthority[],
) {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!
    const b = right[index]!
    if (a.authorityContractVersion !== b.authorityContractVersion
      || a.providerCode !== b.providerCode
      || a.providerContractVersion !== b.providerContractVersion
      || a.adapterVersion !== b.adapterVersion
      || a.runtimeAuthorityEpoch !== b.runtimeAuthorityEpoch
      || a.runtimeConfigurationDigest !== b.runtimeConfigurationDigest
      || a.captureActivated !== b.captureActivated
      || a.environmentReady !== b.environmentReady) return false
  }
  return true
}

function activeAuthorityIndex(authoritySet: readonly BrokerCaptureRuntimeAuthority[]) {
  let activeIndex = -1
  for (let index = 0; index < authoritySet.length; index += 1) {
    if (!authoritySet[index]!.captureActivated) continue
    if (activeIndex !== -1) fail('ambiguous_runtime_authority')
    activeIndex = index
  }
  return activeIndex
}

function issueEffectAuthority(
  authoritySet: readonly BrokerCaptureRuntimeAuthority[],
  selectedIndex: number,
  registrations: readonly ClosedRegistration[],
) {
  const token = Object.freeze(Object.create(null)) as object
  const selected = authoritySet[selectedIndex]!
  const authority = Object.freeze(Object.assign(Object.create(null), {
    effectAuthorityContractVersion: BROKER_CAPTURE_EFFECT_AUTHORITY_VERSION,
    providerCode: selected.providerCode,
    runtimeAuthorityEpoch: selected.runtimeAuthorityEpoch,
    runtimeConfigurationDigest: selected.runtimeConfigurationDigest,
    runAtEffectBoundary<Result>(...runtimeArgs: [() => Promise<Result>]) {
      try {
        if (runtimeArgs.length !== 1) fail('dispatch_authority_invalidated')
        return consumeEffectAuthority(token, authority, runtimeArgs[0])
      } catch (error) {
        return Promise.reject(error)
      }
    },
  })) as BrokerCaptureEffectAuthority
  const state: EffectAuthorityState = {
    status: 'issued',
    token,
    selectedIndex,
    authoritySet,
    registrations,
    effectPromise: null,
  }
  effectAuthorities.set(token, state)
  effectAuthorities.set(authority, state)
  return authority
}

function consumeEffectAuthority<Result>(
  token: object,
  authority: BrokerCaptureEffectAuthority,
  effect: () => Promise<Result>,
) {
  const issued = effectAuthorities.get(token)
  if (!issued || issued.status !== 'issued') fail('dispatch_authority_invalidated')
  issued.status = 'consuming'
  if (typeof effect !== 'function'
    || authority.effectAuthorityContractVersion !== BROKER_CAPTURE_EFFECT_AUTHORITY_VERSION) {
    issued.status = 'revoked'
    fail('dispatch_authority_invalidated')
  }
  try {
    const current = readAuthoritySet(issued.registrations)
    if (!sameAuthoritySet(issued.authoritySet, current)) fail('dispatch_authority_invalidated')
    const selectedIndex = activeAuthorityIndex(current)
    if (selectedIndex !== issued.selectedIndex || selectedIndex < 0
      || !current[selectedIndex]!.environmentReady) fail('dispatch_authority_invalidated')
    const selected = current[selectedIndex]!
    if (authority.providerCode !== selected.providerCode
      || authority.runtimeAuthorityEpoch !== selected.runtimeAuthorityEpoch
      || authority.runtimeConfigurationDigest !== selected.runtimeConfigurationDigest) {
      fail('dispatch_authority_invalidated')
    }
    if (!promiseIntrinsicsClosed()) fail('dispatch_authority_invalidated')
    const effectPromise = effect()
    if (!isClosedPlainPromise(effectPromise)) fail('dispatch_authority_invalidated')
    observeClosedPromiseRejection(effectPromise)
    issued.effectPromise = effectPromise
    issued.status = 'consumed'
    return effectPromise
  } catch (error) {
    if (issued.status !== 'consumed') issued.status = 'revoked'
    throw error
  }
}

function revokeUnconsumedEffectAuthority(authority: BrokerCaptureEffectAuthority) {
  const issued = effectAuthorities.get(authority)
  if (!issued) return 'revoked' as const
  if (issued.status === 'issued' || issued.status === 'consuming') issued.status = 'revoked'
  return issued.status
}

function promiseIntrinsicsClosed() {
  const constructorDescriptor = Object.getOwnPropertyDescriptor(
    INTRINSIC_PROMISE_PROTOTYPE,
    'constructor',
  )
  const speciesDescriptor = Object.getOwnPropertyDescriptor(INTRINSIC_PROMISE, Symbol.species)
  return constructorDescriptor?.value === INTRINSIC_PROMISE
    && constructorDescriptor.get === undefined
    && constructorDescriptor.set === undefined
    && speciesDescriptor !== undefined
    && speciesDescriptor.get === INTRINSIC_PROMISE_SPECIES_GET
    && speciesDescriptor.set === undefined
    && speciesDescriptor.value === undefined
}

function isClosedPlainPromise(value: unknown): value is Promise<unknown> {
  return isPromise(value)
    && !isProxy(value)
    && promiseIntrinsicsClosed()
    && Object.getPrototypeOf(value) === INTRINSIC_PROMISE_PROTOTYPE
    && Reflect.ownKeys(value).length === 0
}

function observeClosedPromiseRejection(value: unknown) {
  if (!isClosedPlainPromise(value)) return false
  void INTRINSIC_PROMISE_THEN.call(value, undefined, () => undefined)
  return true
}

function assertEffectAuthorityCoupled(
  authority: BrokerCaptureEffectAuthority,
  providerPromise: Promise<BrokerCaptureProviderCycleResult>,
) {
  const issued = effectAuthorities.get(authority)
  if (!isClosedPlainPromise(providerPromise)
    || issued?.status !== 'consumed'
    || !isClosedPlainPromise(issued.effectPromise)
    || issued.effectPromise !== providerPromise) {
    observeClosedPromiseRejection(providerPromise)
    if (issued?.effectPromise && issued.effectPromise !== providerPromise) {
      observeClosedPromiseRejection(issued.effectPromise)
    }
    if (issued && issued.status !== 'consumed') issued.status = 'revoked'
    fail('dispatch_authority_invalidated')
  }
}

function cleanupEffectAuthority(authority: BrokerCaptureEffectAuthority) {
  const issued = effectAuthorities.get(authority)
  if (!issued) return
  effectAuthorities.delete(issued.token)
  effectAuthorities.delete(authority)
}

function validateProviderResult(
  registration: ClosedRegistration,
  value: BrokerCaptureProviderCycleResult,
): BrokerCaptureDispatchResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || isProxy(value) || !Object.isFrozen(value) || !safeObjectPrototype(value)) {
    fail('provider_result_invalid')
  }
  const values = exactOwnDataValues(value, [
    'status',
    'workUnitId',
    'pagesCommitted',
    'scopeFinalized',
    'failureCode',
    'authorityBlocked',
  ], 'provider_result_invalid')
  const status = values.status
  const workUnitId = values.workUnitId
  const pagesCommitted = values.pagesCommitted
  const scopeFinalized = values.scopeFinalized
  const failureCode = values.failureCode
  if (!['disabled', 'idle', 'captured', 'failed', 'released'].includes(status as string)
    || values.authorityBlocked !== true
    || !Number.isSafeInteger(pagesCommitted) || (pagesCommitted as number) < 0
    || typeof scopeFinalized !== 'boolean'
    || (workUnitId !== null && (typeof workUnitId !== 'string' || !UUID_PATTERN.test(workUnitId)))
    || (failureCode !== null && (typeof failureCode !== 'string' || !registration.failureCodes.has(failureCode)))) {
    fail('provider_result_invalid')
  }
  const inert = status === 'disabled' || status === 'idle'
  const capturedWithPages = status === 'captured'
    && typeof workUnitId === 'string' && (pagesCommitted as number) > 0 && failureCode === null
  const finalizationOnly = status === 'captured'
    && workUnitId === null && pagesCommitted === 0 && scopeFinalized === true && failureCode === null
  const failed = status === 'failed'
    && typeof workUnitId === 'string' && scopeFinalized === false && typeof failureCode === 'string'
  const released = status === 'released'
    && typeof workUnitId === 'string' && scopeFinalized === false && failureCode === null
  if ((inert && (workUnitId !== null || pagesCommitted !== 0 || scopeFinalized !== false || failureCode !== null))
    || (status === 'captured' && !capturedWithPages && !finalizationOnly)
    || (status === 'failed' && !failed)
    || (status === 'released' && !released)) fail('provider_result_invalid')

  return Object.freeze({
    dispatcherContractVersion: BROKER_CAPTURE_DISPATCHER_CONTRACT_VERSION,
    status: status as BrokerCaptureProviderCycleResult['status'],
    providerCode: registration.providerCode,
    workUnitId: workUnitId as string | null,
    pagesCommitted: pagesCommitted as number,
    scopeFinalized: scopeFinalized as boolean,
    failureCode: failureCode as string | null,
    authorityBlocked: true,
  })
}

export function createBrokerCaptureDispatcher(
  candidates: readonly BrokerCaptureRuntimeRegistration[],
): BrokerCaptureDispatcher {
  const registrations = closedFrozenArray(candidates, 32, closedRegistration)
  const providerCodes = new Set<string>()
  for (let index = 0; index < registrations.length; index += 1) {
    const providerCode = registrations[index]!.providerCode
    if (providerCodes.has(providerCode)) fail('invalid_registry')
    providerCodes.add(providerCode)
  }

  return Object.freeze({
    async runCycle(...runtimeArgs: never[]) {
      if (runtimeArgs.length !== 0) fail('invalid_registry')
      const observed = readAuthoritySet(registrations)
      const selectedIndex = activeAuthorityIndex(observed)
      if (selectedIndex < 0) return inertResult('disabled', null)
      if (!observed[selectedIndex]!.environmentReady) {
        return inertResult('runtime_not_configured', observed[selectedIndex]!.providerCode)
      }
      const selected = registrations[selectedIndex]!
      const effectAuthority = issueEffectAuthority(observed, selectedIndex, registrations)
      try {
        let providerPromise: Promise<BrokerCaptureProviderCycleResult>
        try {
          providerPromise = selected.runCaptureCycle(effectAuthority)
        } catch (error) {
          if (revokeUnconsumedEffectAuthority(effectAuthority) !== 'consumed') {
            fail('dispatch_authority_invalidated')
          }
          throw error
        }
        assertEffectAuthorityCoupled(effectAuthority, providerPromise)
        const providerResult = await providerPromise
        return validateProviderResult(selected, providerResult)
      } catch (error) {
        if (revokeUnconsumedEffectAuthority(effectAuthority) !== 'consumed') {
          fail('dispatch_authority_invalidated')
        }
        throw error
      } finally {
        cleanupEffectAuthority(effectAuthority)
      }
    },
  })
}

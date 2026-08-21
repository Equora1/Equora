import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  BROKER_CAPTURE_EFFECT_AUTHORITY_VERSION,
  BROKER_CAPTURE_RUNTIME_AUTHORITY_VERSION,
  BROKER_CAPTURE_RUNTIME_REGISTRATION_VERSION,
  BrokerCaptureDispatchError,
  createBrokerCaptureDispatcher,
  type BrokerCaptureEffectAuthority,
  type BrokerCaptureProviderCycleResult,
  type BrokerCaptureRuntimeAuthority,
  type BrokerCaptureRuntimeRegistration,
} from '../lib/server/broker-capture-dispatcher'

const WORK_UNIT_ID = '11111111-1111-4111-8111-111111111111'
const FAILURE_CODES = Object.freeze(['rate_limited', 'invalid_credential', 'SCOPE_BUDGET_EXHAUSTED'])
const EXPECTED_MEXC_CAPTURE_FAILURE_CODES = Object.freeze([
  'transport_contract_violation', 'invalid_query', 'invalid_provider_time', 'invalid_credential',
  'ip_not_allowed', 'permission_missing', 'rate_limited', 'provider_busy', 'maintenance',
  'invalid_request', 'unsupported_contract', 'unknown_provider_error', 'provider_unavailable',
  'timeout', 'response_too_large', 'malformed_response', 'SCOPE_BUDGET_EXHAUSTED', 'initialized',
  'resumed_same_work_unit', 'continued_in_new_work_unit', 'page_committed', 'retry_scheduled',
  'work_unit_budget_reached', 'scope_budget_reached', 'terminal_short_bare_array',
  'terminal_provider_page_metadata', 'terminal_canonical_empty_page', 'non_retryable_failure',
  'retry_budget_reached', 'failure_budget_reached', 'claim_attempt_budget_reached',
  'provider_retry_deferred', 'response_exceeds_remaining_budget',
  'provider_page_number_limit_reached', 'cursor_progress_violation',
  'repeated_page_without_cursor_progress',
] as const)
const CONFIGURATION_DIGEST_A = 'a'.repeat(64)
const CONFIGURATION_DIGEST_B = 'b'.repeat(64)

function authority(
  providerCode: string,
  overrides: Partial<BrokerCaptureRuntimeAuthority> = {},
): BrokerCaptureRuntimeAuthority {
  return Object.freeze({
    authorityContractVersion: BROKER_CAPTURE_RUNTIME_AUTHORITY_VERSION,
    providerCode,
    providerContractVersion: `${providerCode}_contract_v1`,
    adapterVersion: `${providerCode}_adapter_v1`,
    runtimeAuthorityEpoch: 0,
    runtimeConfigurationDigest: CONFIGURATION_DIGEST_A,
    captureActivated: false,
    environmentReady: true,
    ...overrides,
  })
}

function registration(
  providerCode: string,
  overrides: Partial<BrokerCaptureRuntimeRegistration> = {},
): BrokerCaptureRuntimeRegistration {
  return Object.freeze({
    registrationContractVersion: BROKER_CAPTURE_RUNTIME_REGISTRATION_VERSION,
    providerCode,
    providerContractVersion: `${providerCode}_contract_v1`,
    adapterVersion: `${providerCode}_adapter_v1`,
    failureCodes: FAILURE_CODES,
    readRuntimeAuthority: vi.fn(() => authority(providerCode)),
    runCaptureCycle: vi.fn((effectAuthority: BrokerCaptureEffectAuthority) => effectAuthority.runAtEffectBoundary(
      async () => result({}),
    )),
    ...overrides,
  })
}

function dispatcher(...registrations: BrokerCaptureRuntimeRegistration[]) {
  return createBrokerCaptureDispatcher(Object.freeze(registrations))
}

function result(overrides: Partial<BrokerCaptureProviderCycleResult>) {
  return Object.freeze({
    status: 'idle' as const,
    workUnitId: null,
    pagesCommitted: 0,
    scopeFinalized: false,
    failureCode: null,
    authorityBlocked: true as const,
    ...overrides,
  }) as BrokerCaptureProviderCycleResult
}

describe('provider-neutral broker capture dispatcher', () => {
  it('stays inert with no active provider runtime', async () => {
    const mexc = registration('mexc')
    await expect(dispatcher(mexc).runCycle()).resolves.toEqual({
      dispatcherContractVersion: 'equora-broker-capture-dispatcher-v6',
      status: 'disabled', providerCode: null, workUnitId: null, pagesCommitted: 0,
      scopeFinalized: false, failureCode: null, authorityBlocked: true,
    })
    expect(mexc.readRuntimeAuthority).toHaveBeenCalledOnce()
    expect(mexc.runCaptureCycle).not.toHaveBeenCalled()
  })

  it('dispatches the only active fixed registration after a second full-authority read', async () => {
    const mexc = registration('mexc', {
      readRuntimeAuthority: vi.fn(() => authority('mexc', {
        runtimeAuthorityEpoch: 2,
        captureActivated: true,
      })),
    })
    const other = registration('synthetic_provider')
    await expect(dispatcher(mexc, other).runCycle()).resolves.toMatchObject({
      status: 'idle', providerCode: 'mexc', authorityBlocked: true,
    })
    expect(mexc.readRuntimeAuthority).toHaveBeenCalledTimes(2)
    expect(other.readRuntimeAuthority).toHaveBeenCalledTimes(2)
    expect(mexc.runCaptureCycle).toHaveBeenCalledOnce()
    expect(other.runCaptureCycle).not.toHaveBeenCalled()
  })

  it('rejects runtime arguments instead of accepting a caller-selected provider', async () => {
    const value = dispatcher(registration('mexc'))
    await expect((value.runCycle as unknown as (...args: unknown[]) => Promise<unknown>)('mexc'))
      .rejects.toMatchObject({ code: 'invalid_registry' })
  })

  it('fails closed before provider execution when the initial authority set is ambiguous', async () => {
    const active = (providerCode: string) => registration(providerCode, {
      readRuntimeAuthority: vi.fn(() => authority(providerCode, {
        runtimeAuthorityEpoch: 1,
        captureActivated: true,
      })),
    })
    const first = active('mexc')
    const second = active('synthetic_provider')
    await expect(dispatcher(first, second).runCycle())
      .rejects.toMatchObject({ code: 'ambiguous_runtime_authority' })
    expect(first.runCaptureCycle).not.toHaveBeenCalled()
    expect(second.runCaptureCycle).not.toHaveBeenCalled()
  })

  it('reports an environment gate failure without invoking the provider cycle', async () => {
    const mexc = registration('mexc', {
      readRuntimeAuthority: vi.fn(() => authority('mexc', {
        runtimeAuthorityEpoch: 2,
        runtimeConfigurationDigest: CONFIGURATION_DIGEST_B,
        captureActivated: true,
        environmentReady: false,
      })),
    })
    await expect(dispatcher(mexc).runCycle()).resolves.toMatchObject({
      status: 'runtime_not_configured', providerCode: 'mexc', authorityBlocked: true,
    })
    expect(mexc.readRuntimeAuthority).toHaveBeenCalledOnce()
    expect(mexc.runCaptureCycle).not.toHaveBeenCalled()
  })

  it('rejects duplicate, unfrozen, accessor and proxy registrations', () => {
    const mexc = registration('mexc')
    expect(() => dispatcher(mexc, registration('mexc'))).toThrow(BrokerCaptureDispatchError)
    expect(() => createBrokerCaptureDispatcher(Object.freeze([{ ...mexc }]))).toThrow(BrokerCaptureDispatchError)
    const accessor = Object.freeze(Object.defineProperty({
      registrationContractVersion: BROKER_CAPTURE_RUNTIME_REGISTRATION_VERSION,
      providerCode: 'mexc', providerContractVersion: 'mexc_contract_v1',
      adapterVersion: 'mexc_adapter_v1', failureCodes: FAILURE_CODES,
      runCaptureCycle: async (effectAuthority: BrokerCaptureEffectAuthority) => (
        effectAuthority.runAtEffectBoundary(async () => result({}))
      ),
    }, 'readRuntimeAuthority', {
      enumerable: true, get: () => () => authority('mexc'),
    })) as unknown as BrokerCaptureRuntimeRegistration
    expect(() => dispatcher(accessor)).toThrow(BrokerCaptureDispatchError)
    expect(() => dispatcher(new Proxy(mexc, {}))).toThrow(BrokerCaptureDispatchError)
  })

  it('rejects unsafe registry containers without invoking caller-owned methods or accessors', () => {
    const mexc = registration('mexc')
    const ownMap = [mexc] as BrokerCaptureRuntimeRegistration[] & { map: ReturnType<typeof vi.fn> }
    Object.defineProperty(ownMap, 'map', { enumerable: false, value: vi.fn(() => [mexc]) })
    Object.freeze(ownMap)
    const ownFilter = [mexc] as BrokerCaptureRuntimeRegistration[] & { filter: ReturnType<typeof vi.fn> }
    Object.defineProperty(ownFilter, 'filter', { enumerable: false, value: vi.fn(() => [mexc]) })
    Object.freeze(ownFilter)
    const sparse = new Array<BrokerCaptureRuntimeRegistration>(2)
    sparse[1] = mexc
    Object.freeze(sparse)
    const indexGetter = vi.fn(() => mexc)
    const accessorIndex: BrokerCaptureRuntimeRegistration[] = []
    Object.defineProperty(accessorIndex, '0', { enumerable: true, get: indexGetter })
    Object.freeze(accessorIndex)
    const symbolExtra = [mexc]
    Object.defineProperty(symbolExtra, Symbol('extra'), { value: 'forbidden' })
    Object.freeze(symbolExtra)

    for (const candidate of [[mexc], ownMap, ownFilter, sparse, accessorIndex, symbolExtra]) {
      expect(() => createBrokerCaptureDispatcher(candidate)).toThrow(BrokerCaptureDispatchError)
    }
    expect(ownMap.map).not.toHaveBeenCalled()
    expect(ownFilter.filter).not.toHaveBeenCalled()
    expect(indexGetter).not.toHaveBeenCalled()
  })

  it('rejects unsafe failure-code registries before authority observation', () => {
    const base = registration('mexc')
    const duplicate = Object.freeze(['rate_limited', 'rate_limited'])
    const unsafe = Object.freeze(['rate_limited', 'secret value'])
    const accessor: string[] = []
    Object.defineProperty(accessor, '0', { enumerable: true, get: () => 'rate_limited' })
    Object.freeze(accessor)
    for (const failureCodes of [duplicate, unsafe, accessor]) {
      expect(() => dispatcher(Object.freeze({ ...base, failureCodes }))).toThrow(BrokerCaptureDispatchError)
    }
  })

  it.each([
    result({ status: 'disabled' }),
    result({ status: 'idle' }),
    result({ status: 'captured', workUnitId: WORK_UNIT_ID, pagesCommitted: 1 }),
    result({ status: 'captured', workUnitId: WORK_UNIT_ID, pagesCommitted: 2, scopeFinalized: true }),
    result({ status: 'captured', scopeFinalized: true }),
    result({ status: 'failed', workUnitId: WORK_UNIT_ID, failureCode: 'rate_limited' }),
    result({ status: 'released', workUnitId: WORK_UNIT_ID }),
  ])('accepts the closed real provider result form %#', async (providerResult) => {
    const mexc = registration('mexc', {
      readRuntimeAuthority: vi.fn(() => authority('mexc', {
        runtimeAuthorityEpoch: 2,
        captureActivated: true,
      })),
      runCaptureCycle: vi.fn((effectAuthority) => effectAuthority.runAtEffectBoundary(async () => providerResult)),
    })
    await expect(dispatcher(mexc).runCycle()).resolves.toMatchObject({
      status: providerResult.status,
      workUnitId: providerResult.workUnitId,
      pagesCommitted: providerResult.pagesCommitted,
      scopeFinalized: providerResult.scopeFinalized,
      failureCode: providerResult.failureCode,
    })
  })

  it.each([
    result({ status: 'captured' }),
    result({ status: 'captured', workUnitId: WORK_UNIT_ID }),
    result({ status: 'captured', pagesCommitted: 1 }),
    result({ status: 'failed', workUnitId: WORK_UNIT_ID }),
    result({ status: 'failed', workUnitId: WORK_UNIT_ID, scopeFinalized: true, failureCode: 'rate_limited' }),
    result({ status: 'failed', failureCode: 'rate_limited' }),
    result({ status: 'released' }),
    result({ status: 'released', workUnitId: WORK_UNIT_ID, scopeFinalized: true }),
    result({ status: 'idle', workUnitId: WORK_UNIT_ID }),
    result({ status: 'failed', workUnitId: WORK_UNIT_ID, failureCode: 'unregistered_failure' }),
  ])('rejects the contradictory provider result form %#', async (providerResult) => {
    const mexc = registration('mexc', {
      readRuntimeAuthority: vi.fn(() => authority('mexc', {
        runtimeAuthorityEpoch: 2,
        captureActivated: true,
      })),
      runCaptureCycle: vi.fn((effectAuthority) => effectAuthority.runAtEffectBoundary(async () => providerResult)),
    })
    await expect(dispatcher(mexc).runCycle())
      .rejects.toMatchObject({ code: 'provider_result_invalid' })
  })

  it('rejects accessor, hidden and symbol result fields without evaluating a secret-bearing getter', async () => {
    const secretGetter = vi.fn(() => 'secret_sentinel_must_not_escape')
    const accessor = Object.freeze(Object.defineProperty({
      status: 'failed', workUnitId: WORK_UNIT_ID, pagesCommitted: 0,
      scopeFinalized: false, authorityBlocked: true,
    }, 'failureCode', { enumerable: true, get: secretGetter })) as BrokerCaptureProviderCycleResult
    const hidden = Object.freeze(Object.defineProperty({ ...result({}) }, 'hidden', { value: 'secret_sentinel' }))
    const symbol = Object.freeze(Object.defineProperty({ ...result({}) }, Symbol('secret'), { value: 'secret_sentinel' }))
    for (const providerResult of [accessor, hidden, symbol]) {
      const mexc = registration('mexc', {
        readRuntimeAuthority: vi.fn(() => authority('mexc', {
          runtimeAuthorityEpoch: 2,
          captureActivated: true,
        })),
        runCaptureCycle: vi.fn((effectAuthority) => effectAuthority.runAtEffectBoundary(async () => providerResult)),
      })
      await expect(dispatcher(mexc).runCycle())
        .rejects.toMatchObject({ code: 'provider_result_invalid' })
    }
    expect(secretGetter).not.toHaveBeenCalled()
  })

  it.each([
    ['selected activation ABA changes the monotonic authority epoch',
      [{ runtimeAuthorityEpoch: 2, captureActivated: true }, { runtimeAuthorityEpoch: 3, captureActivated: true }]],
    ['selected environment turns unavailable',
      [{ runtimeAuthorityEpoch: 2, captureActivated: true }, {
        runtimeAuthorityEpoch: 2, runtimeConfigurationDigest: CONFIGURATION_DIGEST_B,
        captureActivated: true, environmentReady: false,
      }]],
    ['environment remains ready while the configuration or credential digest changes',
      [{ runtimeAuthorityEpoch: 2, captureActivated: true }, {
        runtimeAuthorityEpoch: 2, runtimeConfigurationDigest: CONFIGURATION_DIGEST_B,
        captureActivated: true, environmentReady: true,
      }]],
  ] as const)('invalidates dispatch authority when %s', async (_label, observations) => {
    let index = 0
    const readRuntimeAuthority = vi.fn(() => authority('mexc', observations[Math.min(index++, 1)]))
    const providerEffect = vi.fn(async () => result({}))
    const runCaptureCycle = vi.fn((effectAuthority: BrokerCaptureEffectAuthority) => (
      effectAuthority.runAtEffectBoundary(providerEffect)
    ))
    const mexc = registration('mexc', { readRuntimeAuthority, runCaptureCycle })
    await expect(dispatcher(mexc).runCycle())
      .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
    expect(runCaptureCycle).toHaveBeenCalledOnce()
    expect(providerEffect).not.toHaveBeenCalled()
  })

  it('invalidates dispatch authority when a second provider becomes active at consumption', async () => {
    const selected = registration('mexc', {
      readRuntimeAuthority: vi.fn(() => authority('mexc', {
        runtimeAuthorityEpoch: 2,
        captureActivated: true,
      })),
    })
    let otherReads = 0
    const other = registration('synthetic_provider', {
      readRuntimeAuthority: vi.fn(() => authority('synthetic_provider', otherReads++ === 0 ? {} : {
        runtimeAuthorityEpoch: 1,
        captureActivated: true,
      })),
    })
    await expect(dispatcher(selected, other).runCycle())
      .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
    expect(selected.runCaptureCycle).toHaveBeenCalledOnce()
    expect(other.runCaptureCycle).not.toHaveBeenCalled()
  })

  it('invalidates the complete provider set when a second-provider ABA changes only its epoch', async () => {
    const selectedEffect = vi.fn(async () => result({}))
    const selected = registration('mexc', {
      readRuntimeAuthority: vi.fn(() => authority('mexc', {
        runtimeAuthorityEpoch: 7,
        captureActivated: true,
      })),
      runCaptureCycle: vi.fn((effectAuthority) => effectAuthority.runAtEffectBoundary(selectedEffect)),
    })
    let otherReads = 0
    const other = registration('synthetic_provider', {
      readRuntimeAuthority: vi.fn(() => authority('synthetic_provider', {
        runtimeAuthorityEpoch: otherReads++ === 0 ? 4 : 6,
      })),
    })
    await expect(dispatcher(selected, other).runCycle())
      .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
    expect(selected.runCaptureCycle).toHaveBeenCalledOnce()
    expect(selectedEffect).not.toHaveBeenCalled()
  })

  it.each(['return', 'throw'] as const)(
    'terminally revokes an unconsumed authority after provider %s',
    async (providerExit) => {
      let retainedAuthority: BrokerCaptureEffectAuthority | null = null
      const lateEffect = vi.fn(async () => result({}))
      const mexc = registration('mexc', {
        readRuntimeAuthority: vi.fn(() => authority('mexc', {
          runtimeAuthorityEpoch: 2,
          captureActivated: true,
        })),
        runCaptureCycle: vi.fn((effectAuthority) => {
          retainedAuthority = effectAuthority
          if (providerExit === 'throw') throw new Error('provider_threw_before_consumption')
          return Promise.resolve(result({}))
        }),
      })
      await expect(dispatcher(mexc).runCycle())
        .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
      expect(retainedAuthority).not.toBeNull()
      await expect(retainedAuthority!.runAtEffectBoundary(lateEffect))
        .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
      expect(lateEffect).not.toHaveBeenCalled()
    },
  )

  it('terminally revokes a failed consume attempt across a later authority ABA', async () => {
    let retainedAuthority: BrokerCaptureEffectAuthority | null = null
    let reads = 0
    const observations = [
      { runtimeAuthorityEpoch: 7, runtimeConfigurationDigest: CONFIGURATION_DIGEST_A },
      { runtimeAuthorityEpoch: 8, runtimeConfigurationDigest: CONFIGURATION_DIGEST_B },
      { runtimeAuthorityEpoch: 7, runtimeConfigurationDigest: CONFIGURATION_DIGEST_A },
    ] as const
    const providerEffect = vi.fn(async () => result({}))
    const lateEffect = vi.fn(async () => result({}))
    const mexc = registration('mexc', {
      readRuntimeAuthority: vi.fn(() => authority('mexc', {
        ...observations[Math.min(reads++, observations.length - 1)],
        captureActivated: true,
      })),
      runCaptureCycle: vi.fn((effectAuthority) => {
        retainedAuthority = effectAuthority
        return effectAuthority.runAtEffectBoundary(providerEffect)
      }),
    })
    await expect(dispatcher(mexc).runCycle())
      .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
    await expect(retainedAuthority!.runAtEffectBoundary(lateEffect))
      .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
    expect(providerEffect).not.toHaveBeenCalled()
    expect(lateEffect).not.toHaveBeenCalled()
  })

  it('allows one authorized effect but rejects replay of the same authority', async () => {
    let retainedAuthority: BrokerCaptureEffectAuthority | null = null
    const firstEffect = vi.fn(async () => result({}))
    const replayEffect = vi.fn(async () => result({}))
    const mexc = registration('mexc', {
      readRuntimeAuthority: vi.fn(() => authority('mexc', {
        runtimeAuthorityEpoch: 2,
        captureActivated: true,
      })),
      runCaptureCycle: vi.fn((effectAuthority) => {
        retainedAuthority = effectAuthority
        return effectAuthority.runAtEffectBoundary(firstEffect)
      }),
    })
    await expect(dispatcher(mexc).runCycle()).resolves.toMatchObject({ status: 'idle' })
    await expect(retainedAuthority!.runAtEffectBoundary(replayEffect))
      .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
    expect(firstEffect).toHaveBeenCalledOnce()
    expect(replayEffect).not.toHaveBeenCalled()
  })

  it('rejects a provider promise that is detached from the authorized effect promise', async () => {
    const authorizedEffect = vi.fn(async () => result({ status: 'captured', scopeFinalized: true }))
    const detachedResult = result({})
    const mexc = registration('mexc', {
      readRuntimeAuthority: vi.fn(() => authority('mexc', {
        runtimeAuthorityEpoch: 2,
        captureActivated: true,
      })),
      runCaptureCycle: vi.fn((effectAuthority) => {
        void effectAuthority.runAtEffectBoundary(authorizedEffect)
        return Promise.resolve(detachedResult)
      }),
    })
    await expect(dispatcher(mexc).runCycle())
      .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
    expect(authorizedEffect).toHaveBeenCalledOnce()
  })

  it('intrinsically observes a rejecting authorized effect when the provider returns a detached promise', async () => {
    let retainedAuthority: BrokerCaptureEffectAuthority | null = null
    const effectError = new Error('authorized_effect_rejected')
    const authorizedEffect = vi.fn(() => Promise.reject<BrokerCaptureProviderCycleResult>(effectError))
    const lateEffect = vi.fn(async () => result({}))
    const mexc = registration('mexc', {
      readRuntimeAuthority: vi.fn(() => authority('mexc', {
        runtimeAuthorityEpoch: 2,
        captureActivated: true,
      })),
      runCaptureCycle: vi.fn((effectAuthority) => {
        retainedAuthority = effectAuthority
        void effectAuthority.runAtEffectBoundary(authorizedEffect)
        return Promise.resolve(result({}))
      }),
    })
    await expect(dispatcher(mexc).runCycle())
      .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(authorizedEffect).toHaveBeenCalledOnce()
    await expect(retainedAuthority!.runAtEffectBoundary(lateEffect))
      .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
    expect(lateEffect).not.toHaveBeenCalled()
  })

  it.each([
    ['an own constructor accessor', () => {
      const promise = new Promise<BrokerCaptureProviderCycleResult>(() => undefined)
      Object.defineProperty(promise, 'constructor', { get: () => { throw new Error('constructor_trap') } })
      return promise
    }],
    ['an own then property', () => {
      const promise = new Promise<BrokerCaptureProviderCycleResult>(() => undefined)
      Object.defineProperty(promise, 'then', { value: Promise.prototype.then })
      return promise
    }],
    ['an own catch property', () => {
      const promise = new Promise<BrokerCaptureProviderCycleResult>(() => undefined)
      Object.defineProperty(promise, 'catch', { value: vi.fn() })
      return promise
    }],
    ['a Promise subclass', () => {
      class ProviderPromise extends Promise<BrokerCaptureProviderCycleResult> {}
      return new ProviderPromise(() => undefined)
    }],
    ['a Promise proxy', () => new Proxy(
      new Promise<BrokerCaptureProviderCycleResult>(() => undefined),
      {},
    )],
  ] as const)('rejects an authorized effect returning %s', async (_label, unsafePromise) => {
    const providerEffect = vi.fn(unsafePromise)
    const mexc = registration('mexc', {
      readRuntimeAuthority: vi.fn(() => authority('mexc', {
        runtimeAuthorityEpoch: 2,
        captureActivated: true,
      })),
      runCaptureCycle: vi.fn((effectAuthority) => effectAuthority.runAtEffectBoundary(providerEffect)),
    })
    await expect(dispatcher(mexc).runCycle())
      .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
    expect(providerEffect).toHaveBeenCalledOnce()
  })

  it('binds the actual MEXC composition root, complete failure registry and effect boundary', async () => {
    const previousEpoch = process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH
    const providerEffect = vi.fn<() => Promise<BrokerCaptureProviderCycleResult>>()
    process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH = '41'
    vi.resetModules()
    vi.doMock('@/lib/server/mexc-runtime', () => ({
      getMexcRuntimeMode: () => 'capture' as const,
      isMexcCaptureEnvironmentReady: () => true,
    }))
    vi.doMock('@/lib/server/mexc-capture-runtime', () => ({ runMexcCaptureCycle: providerEffect }))
    try {
      const runtime = await import('../lib/server/broker-capture-runtime')
      expect(runtime.MEXC_CAPTURE_FAILURE_CODES).toEqual(EXPECTED_MEXC_CAPTURE_FAILURE_CODES)
      for (const failureCode of ['rate_limited', 'SCOPE_BUDGET_EXHAUSTED', 'cursor_progress_violation']) {
        providerEffect.mockResolvedValueOnce(result({
          status: 'failed', workUnitId: WORK_UNIT_ID, failureCode,
        }))
        await expect(runtime.runBrokerCaptureCycle()).resolves.toMatchObject({
          status: 'failed', providerCode: 'mexc', failureCode,
        })
      }
      expect(providerEffect).toHaveBeenCalledTimes(3)
    } finally {
      vi.doUnmock('@/lib/server/mexc-runtime')
      vi.doUnmock('@/lib/server/mexc-capture-runtime')
      vi.resetModules()
      if (previousEpoch === undefined) delete process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH
      else process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH = previousEpoch
    }
  })

  it('blocks the actual MEXC effect when the deployment authority epoch changes at the boundary', async () => {
    const previousEpoch = process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH
    const providerEffect = vi.fn(async () => result({}))
    let modeReads = 0
    process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH = '41'
    vi.resetModules()
    vi.doMock('@/lib/server/mexc-runtime', () => ({
      getMexcRuntimeMode: () => {
        if (modeReads++ === 1) process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH = '42'
        return 'capture' as const
      },
      isMexcCaptureEnvironmentReady: () => true,
    }))
    vi.doMock('@/lib/server/mexc-capture-runtime', () => ({ runMexcCaptureCycle: providerEffect }))
    try {
      const runtime = await import('../lib/server/broker-capture-runtime')
      await expect(runtime.runBrokerCaptureCycle())
        .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
      expect(providerEffect).not.toHaveBeenCalled()
    } finally {
      vi.doUnmock('@/lib/server/mexc-runtime')
      vi.doUnmock('@/lib/server/mexc-capture-runtime')
      vi.resetModules()
      if (previousEpoch === undefined) delete process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH
      else process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH = previousEpoch
    }
  })

  it('blocks the actual MEXC effect when credential configuration drifts but readiness stays true', async () => {
    const previousEpoch = process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH
    const previousKeyVersion = process.env.EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION
    const providerEffect = vi.fn(async () => result({}))
    let readinessReads = 0
    process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH = '41'
    process.env.EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION = 'v1'
    vi.resetModules()
    vi.doMock('@/lib/server/mexc-runtime', () => ({
      getMexcRuntimeMode: () => 'capture' as const,
      isMexcCaptureEnvironmentReady: () => {
        if (readinessReads++ === 1) process.env.EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION = 'v2'
        return true
      },
    }))
    vi.doMock('@/lib/server/mexc-capture-runtime', () => ({ runMexcCaptureCycle: providerEffect }))
    try {
      const runtime = await import('../lib/server/broker-capture-runtime')
      await expect(runtime.runBrokerCaptureCycle())
        .rejects.toMatchObject({ code: 'dispatch_authority_invalidated' })
      expect(providerEffect).not.toHaveBeenCalled()
    } finally {
      vi.doUnmock('@/lib/server/mexc-runtime')
      vi.doUnmock('@/lib/server/mexc-capture-runtime')
      vi.resetModules()
      if (previousEpoch === undefined) delete process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH
      else process.env.EQUORA_MEXC_RUNTIME_AUTHORITY_EPOCH = previousEpoch
      if (previousKeyVersion === undefined) delete process.env.EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION
      else process.env.EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION = previousKeyVersion
    }
  })

  it('keeps the API route provider-neutral and the dispatcher free of network or credential imports', () => {
    const route = readFileSync(join(process.cwd(), 'app', 'api', 'internal', 'broker-capture', 'route.ts'), 'utf8')
    const source = readFileSync(join(process.cwd(), 'lib', 'server', 'broker-capture-dispatcher.ts'), 'utf8')
    const composition = readFileSync(join(process.cwd(), 'lib', 'server', 'broker-capture-runtime.ts'), 'utf8')
    expect(route).toContain("@/lib/server/broker-capture-runtime")
    expect(route).not.toMatch(/mexc/i)
    expect(source).not.toMatch(/\bfetch\s*\(|mexc|broker-secret-store|credentialLoader|decryptBrokerCredentials/)
    expect(source).not.toMatch(/candidates\.(?:map|filter)|registrations\.(?:map|filter)/)
    expect(composition).toContain('authority.runAtEffectBoundary(runMexcCaptureCycle)')
    expect(composition.match(/runMexcCaptureCycle/g)).toHaveLength(2)
  })
})

import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createMexcSyncScope,
  MexcSyncScopeError,
  type MexcSyncScopeInput,
} from '../lib/server/mexc-sync-scope'

const DAY_MS = 24 * 60 * 60 * 1_000
const BUCKET_START = Date.UTC(2025, 9, 8)

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function uuid(value: string) {
  const hash = digest(value)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

const ACCOUNT = Object.freeze({
  digestAlgorithm: 'hmac-sha256' as const,
  digestContractVersion: 'equora-tcj-v1' as const,
  purpose: 'broker_account_identity_v1' as const,
  keyVersion: 'v1',
  digest: digest('scope-account'),
  verificationStatus: 'unverified_reference' as const,
})

function input(overrides: Partial<MexcSyncScopeInput> = {}): MexcSyncScopeInput {
  return Object.freeze({
    providerCode: 'mexc',
    accountIdentity: ACCOUNT,
    brokerAccountId: uuid('broker-account'),
    syncActivationId: uuid('activation'),
    activationGeneration: 1,
    capabilityId: 'historical_orders_v1',
    instrumentScope: Object.freeze({
      scopeType: 'mexc_futures_symbol_v1',
      symbol: 'BTC_USDT',
      positionType: null,
    }),
    providerContractVersion: 'mexc_futures_contract_v1',
    adapterVersion: 'v57_61_0',
    sourceChannel: 'provider_api_observation',
    profileId: 'mexc_futures_rest',
    profileVersion: 'v1',
    laneId: 'incremental_fast_6h',
    requestWindow: Object.freeze({
      startTimeMs: BUCKET_START - 2 * DAY_MS,
      endTimeMs: BUCKET_START + DAY_MS,
    }),
    bucket: Object.freeze({
      startTimeMs: BUCKET_START,
      endTimeMs: BUCKET_START + DAY_MS,
    }),
    boundaryPolicyVersion: 'mexc_provider_unverified_overlap_v1',
    boundarySemantics: 'provider_unverified',
    overlapPolicy: 'minimum_72h_v1',
    scopeGeneration: 1,
    stabilityGeneration: 1,
    coverageBasis: 'provider_observed',
    coveragePolicy: 'provider_observed_best_effort',
    scopeCompleteness: 'unverified',
    stabilityStatus: 'not_observed',
    digestVersion: 'equora-tcj-v1',
    ...overrides,
  })
}

function expectScopeCode(operation: () => unknown, code: MexcSyncScopeError['code']) {
  try {
    operation()
    expect.unreachable(`Expected sync scope error ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(MexcSyncScopeError)
    expect((error as MexcSyncScopeError).code).toBe(code)
  }
}

describe('normative MEXC-v1 sync scope', () => {
  it('builds immutable stability-bucket and sync-scope digests from the full closed identity', () => {
    const result = createMexcSyncScope(input())

    expect(result).toMatchObject({
      scopeVersion: 'mexc-sync-scope-v1',
      providerCode: 'mexc',
      endpointId: 'historical_orders_v1',
      sourceChannel: 'provider_api_observation',
      laneId: 'incremental_fast_6h',
      scopeCompleteness: 'unverified',
      stabilityStatus: 'not_observed',
      authorityBlocked: true,
    })
    expect(result.stabilityBucketDigest).toEqual({
      digestAlgorithm: 'sha256',
      digestContractVersion: 'equora-tcj-v1',
      domain: 'stability_bucket_identity',
      digest: 'e5757fb14d774e9d8d4afc983862c0e6a09d32214727c450012d9cf4aa3c358e',
    })
    expect(result.scopeDigest).toEqual({
      digestAlgorithm: 'sha256',
      digestContractVersion: 'equora-tcj-v1',
      domain: 'sync_scope',
      digest: 'f43d1b635666d53ea9505400154f5f5794359ac8c2b007118bacf5999c14de87',
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.requestWindow)).toBe(true)
  })

  it('changes only immutable identity fields and ignores mutable scope outcome state', () => {
    const baseline = createMexcSyncScope(input())
    const identityVariants = [
      input({ syncActivationId: uuid('other-activation') }),
      input({ activationGeneration: 2 }),
      input({ accountIdentity: Object.freeze({ ...ACCOUNT, digest: digest('other-account') }) }),
      input({ instrumentScope: Object.freeze({
        scopeType: 'mexc_futures_symbol_v1', symbol: 'ETH_USDT', positionType: null,
      }) }),
    ]

    for (const variant of identityVariants) {
      const result = createMexcSyncScope(variant)
      expect(result.scopeDigest.digest).not.toBe(baseline.scopeDigest.digest)
      expect(result.stabilityBucketDigest.digest).not.toBe(baseline.stabilityBucketDigest.digest)
    }

    const nextScopeGeneration = createMexcSyncScope(input({ scopeGeneration: 2 }))
    expect(nextScopeGeneration.stabilityBucketDigest).toEqual(baseline.stabilityBucketDigest)
    expect(nextScopeGeneration.scopeDigest.digest).not.toBe(baseline.scopeDigest.digest)

    const changedOutcome = createMexcSyncScope(input({
      stabilityGeneration: 2,
      scopeCompleteness: 'partial',
      stabilityStatus: 'invalidated',
    }))
    expect(changedOutcome.stabilityBucketDigest).toEqual(baseline.stabilityBucketDigest)
    expect(changedOutcome.scopeDigest).toEqual(baseline.scopeDigest)
  })

  it('pins each API lane to its minimum window and overlap policy', () => {
    const rolling7 = createMexcSyncScope(input({
      laneId: 'rolling_audit_7d_daily',
      overlapPolicy: 'closed_bucket_full_window_v1',
      requestWindow: { startTimeMs: BUCKET_START - 6 * DAY_MS, endTimeMs: BUCKET_START + DAY_MS - 1 },
    }))
    const rolling28 = createMexcSyncScope(input({
      laneId: 'rolling_audit_28d_weekly',
      overlapPolicy: 'closed_bucket_full_window_v1',
      requestWindow: { startTimeMs: BUCKET_START - 27 * DAY_MS, endTimeMs: BUCKET_START + DAY_MS - 1 },
    }))
    expect(rolling7.laneId).toBe('rolling_audit_7d_daily')
    expect(rolling28.laneId).toBe('rolling_audit_28d_weekly')

    expectScopeCode(() => createMexcSyncScope(input({ overlapPolicy: 'closed_bucket_full_window_v1' })), 'invalid_lane')
    expectScopeCode(() => createMexcSyncScope(input({
      requestWindow: { startTimeMs: BUCKET_START - DAY_MS, endTimeMs: BUCKET_START + DAY_MS - 1 },
    })), 'invalid_lane')
    expectScopeCode(() => createMexcSyncScope(input({
      laneId: 'rolling_audit_7d_daily',
      overlapPolicy: 'closed_bucket_full_window_v1',
      requestWindow: {
        startTimeMs: BUCKET_START - 6 * DAY_MS + 12 * 60 * 60 * 1_000,
        endTimeMs: BUCKET_START + DAY_MS + 12 * 60 * 60 * 1_000 - 1,
      },
    })), 'invalid_lane')
  })

  it('rejects non-UTC buckets, uncovered buckets and capability-incoherent instruments', () => {
    expectScopeCode(() => createMexcSyncScope(input({
      bucket: { startTimeMs: BUCKET_START + 1, endTimeMs: BUCKET_START + DAY_MS + 1 },
    })), 'invalid_window')
    expectScopeCode(() => createMexcSyncScope(input({
      requestWindow: { startTimeMs: BUCKET_START - 3 * DAY_MS, endTimeMs: BUCKET_START + DAY_MS - 2 },
    })), 'invalid_window')
    expectScopeCode(() => createMexcSyncScope(input({
      capabilityId: 'historical_positions_v1',
    })), 'invalid_instrument')
    expect(createMexcSyncScope(input({
      capabilityId: 'historical_positions_v1',
      instrumentScope: { scopeType: 'mexc_futures_symbol_v1', symbol: 'BTC_USDT', positionType: 1 },
    })).endpointId).toBe('historical_positions_v1')
  })

  it('rejects profile drift, positive authority claims, malformed identities and unknown fields', () => {
    expectScopeCode(() => createMexcSyncScope(input({ adapterVersion: 'v57_62_0' as never })), 'invalid_profile')
    expectScopeCode(() => createMexcSyncScope(input({ sourceChannel: 'provider_websocket_observation' as never })), 'invalid_profile')
    expectScopeCode(() => createMexcSyncScope(input({ scopeCompleteness: 'complete_for_profile' as never })), 'invalid_status')
    expectScopeCode(() => createMexcSyncScope(input({ stabilityStatus: 'observed_stable' as never })), 'invalid_status')
    expectScopeCode(() => createMexcSyncScope(input({ stabilityStatus: 'invalidated' })), 'invalid_status')
    expectScopeCode(() => createMexcSyncScope(input({ brokerAccountId: digest('not-a-uuid') })), 'invalid_identity')
    expectScopeCode(() => createMexcSyncScope({ ...input(), workerId: 'forbidden' } as never), 'invalid_structure')
  })
})

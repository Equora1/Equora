import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { digestEquoraRawResponseBody } from '../lib/server/equora-tcj'

import {
  createMexcPageCheckpoint,
  createMexcPageObservation,
  MEXC_PAGE_BUDGET_PROFILE_V1,
  MexcPaginationError,
  recordMexcPage,
  recordMexcPageFailure,
  resumeMexcPageCheckpoint,
  verifyMexcPageCheckpoint,
  type MexcPageBudgetProfile,
  type MexcPageCheckpoint,
  type MexcPagedCapabilityId,
} from '../lib/server/mexc-pagination'

const NOW = 1_760_000_000_000
const CHECKPOINT_KEY = Buffer.alloc(32, 0x5a)
const HISTORY_SCOPE = {
  symbol: 'BTC_USDT',
  startTime: NOW - 100_000,
  endTime: NOW,
  pageNumber: 1,
  pageSize: 2,
}
const POSITION_SCOPE = { ...HISTORY_SCOPE, positionType: 1 as const }

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function budget(overrides: Partial<MexcPageBudgetProfile> = {}): MexcPageBudgetProfile {
  const next = { ...MEXC_PAGE_BUDGET_PROFILE_V1, ...overrides }
  return Object.freeze({ ...next, retryBackoffMs: Object.freeze([...next.retryBackoffMs]) })
}

function page(input: {
  capabilityId?: MexcPagedCapabilityId
  requestPageNumber?: number
  ids?: string[]
  times?: number[]
  body?: string
  rawBodyBytes?: number
  requestDurationMs?: number
  providerPage?: { currentPage: number; pageSize: number; totalCount: number; totalPage: number } | null
  oracleStatus?: 'valid_read_preview_only' | 'blocked_unobserved_position_items' | 'blocked_funding_authority'
} = {}) {
  const capabilityId = input.capabilityId ?? 'historical_orders_v1'
  const ids = input.ids ?? ['1', '2']
  const times = input.times ?? [NOW - 1_000, NOW - 2_000]
  const funding = capabilityId === 'funding_records_v1'
  const positions = capabilityId === 'historical_positions_v1'
  return createMexcPageObservation({
    capabilityId,
    requestPageNumber: input.requestPageNumber ?? 1,
    shape: funding ? 'page_object_v1' : 'bare_array_v1',
    oracleStatus: input.oracleStatus ?? (funding
      ? 'blocked_funding_authority'
      : positions && ids.length
        ? 'blocked_unobserved_position_items'
        : 'valid_read_preview_only'),
    recordCount: ids.length,
    orderedProviderIds: ids,
    orderedProviderTimes: times,
    rawBodyDigest: digestEquoraRawResponseBody(
      new TextEncoder().encode(input.body ?? `page-${input.requestPageNumber ?? 1}`),
    ),
    rawBodyBytes: input.rawBodyBytes ?? 128,
    requestDurationMs: input.requestDurationMs ?? 25,
    providerPage: funding
      ? input.providerPage ?? { currentPage: input.requestPageNumber ?? 1, pageSize: 2, totalCount: ids.length, totalPage: ids.length ? 1 : 0 }
      : null,
  })
}

function expectPagingCode(operation: () => unknown, code: MexcPaginationError['code']) {
  try {
    operation()
    expect.unreachable(`Expected MEXC paging error ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(MexcPaginationError)
    expect((error as MexcPaginationError).code).toBe(code)
  }
}

describe('MEXC bounded page checkpoints', () => {
  it('creates deterministic immutable checkpoints and detects tampering', () => {
    const first = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY)
    const second = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY)

    expect(first).toEqual(second)
    expect(first.checkpointMac).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.scope)).toBe(true)
    expect(first.authorityBlocked).toBe(true)
    expect(verifyMexcPageCheckpoint(first, CHECKPOINT_KEY)).toBe(true)

    const tampered = { ...first, nextPageNumber: 99 } as MexcPageCheckpoint
    expectPagingCode(() => verifyMexcPageCheckpoint(tampered, CHECKPOINT_KEY), 'checkpoint_mismatch')
    expectPagingCode(
      () => verifyMexcPageCheckpoint({ ...first, unexpected: true } as never, CHECKPOINT_KEY),
      'checkpoint_mismatch',
    )
    expectPagingCode(
      () => verifyMexcPageCheckpoint(first, Buffer.alloc(32, 0x5b)),
      'checkpoint_mismatch',
    )
    expectPagingCode(
      () => verifyMexcPageCheckpoint(first, Buffer.alloc(31)),
      'invalid_integrity_key',
    )

    const differentInitialPage = createMexcPageCheckpoint('historical_orders_v1', {
      ...HISTORY_SCOPE,
      pageNumber: 2,
    }, CHECKPOINT_KEY)
    expect(differentInitialPage.scopeDigest).not.toBe(first.scopeDigest)
    expect(differentInitialPage.checkpointMac).not.toBe(first.checkpointMac)
    expectPagingCode(
      () => resumeMexcPageCheckpoint(first, differentInitialPage.checkpointMac, CHECKPOINT_KEY),
      'checkpoint_mismatch',
    )

    const sameIdDifferentLimits = budget({
      maxRequestAttemptsPerWorkUnit: MEXC_PAGE_BUDGET_PROFILE_V1.maxRequestAttemptsPerWorkUnit + 1,
    })
    expectPagingCode(
      () => verifyMexcPageCheckpoint(first, CHECKPOINT_KEY, sameIdDifferentLimits),
      'checkpoint_mismatch',
    )
  })

  it('continues after a full bare-array page and stops on a short page without claiming completeness', () => {
    const initial = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY)
    const first = recordMexcPage(initial, page(), CHECKPOINT_KEY)

    expect(first).toMatchObject({ action: 'request_next_page', scopeCompleteness: 'unverified' })
    expect(first.checkpoint).toMatchObject({
      status: 'continue',
      reason: 'page_committed',
      nextPageNumber: 2,
      totalSuccessfulPages: 1,
      totalRawEvents: 2,
    })

    const terminal = recordMexcPage(first.checkpoint, page({
      requestPageNumber: 2,
      ids: ['3'],
      times: [NOW - 3_000],
    }), CHECKPOINT_KEY)
    expect(terminal).toMatchObject({ action: 'stop_terminal', scopeCompleteness: 'unverified' })
    expect(terminal.checkpoint).toMatchObject({
      status: 'terminal_observed',
      reason: 'terminal_short_bare_array',
      terminalEvidence: 'short_bare_array',
      totalSuccessfulPages: 2,
      totalRawEvents: 3,
    })
  })

  it('accepts a canonical empty funding page but keeps financial authority blocked', () => {
    const checkpoint = createMexcPageCheckpoint('funding_records_v1', POSITION_SCOPE, CHECKPOINT_KEY)
    const transition = recordMexcPage(checkpoint, page({
      capabilityId: 'funding_records_v1',
      ids: [],
      times: [],
      providerPage: { currentPage: 1, pageSize: 2, totalCount: 0, totalPage: 0 },
    }), CHECKPOINT_KEY)

    expect(transition).toMatchObject({ action: 'stop_terminal', scopeCompleteness: 'unverified' })
    expect(transition.checkpoint).toMatchObject({
      authorityBlocked: true,
      reason: 'terminal_canonical_empty_page',
      terminalEvidence: 'canonical_empty_page',
    })
  })

  it('uses provider page metadata only as a terminal observation and keeps funding authority blocked', () => {
    const checkpoint = createMexcPageCheckpoint('funding_records_v1', POSITION_SCOPE, CHECKPOINT_KEY)
    const first = recordMexcPage(checkpoint, page({
      capabilityId: 'funding_records_v1',
      providerPage: { currentPage: 1, pageSize: 2, totalCount: 4, totalPage: 2 },
    }), CHECKPOINT_KEY)
    expect(first).toMatchObject({ action: 'request_next_page', scopeCompleteness: 'unverified' })

    const terminal = recordMexcPage(first.checkpoint, page({
      capabilityId: 'funding_records_v1',
      requestPageNumber: 2,
      ids: ['3', '4'],
      times: [NOW - 3_000, NOW - 4_000],
      providerPage: { currentPage: 2, pageSize: 2, totalCount: 4, totalPage: 2 },
    }), CHECKPOINT_KEY)
    expect(terminal).toMatchObject({ action: 'stop_terminal', scopeCompleteness: 'unverified' })
    expect(terminal.checkpoint).toMatchObject({
      authorityBlocked: true,
      reason: 'terminal_provider_page_metadata',
      terminalEvidence: 'provider_page_metadata',
    })
  })

  it('keeps non-empty historical positions blocked even when paging can continue', () => {
    const checkpoint = createMexcPageCheckpoint('historical_positions_v1', POSITION_SCOPE, CHECKPOINT_KEY)
    const transition = recordMexcPage(checkpoint, page({ capabilityId: 'historical_positions_v1' }), CHECKPOINT_KEY)

    expect(transition).toMatchObject({ action: 'request_next_page', scopeCompleteness: 'unverified' })
    expect(transition.checkpoint.authorityBlocked).toBe(true)
  })

  it('blocks a repeated cursor even when the provider changes the body and increments the page number', () => {
    const initial = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY)
    const firstPage = page({ body: 'same-provider-page' })
    const first = recordMexcPage(initial, firstPage, CHECKPOINT_KEY)
    const repeated = page({ requestPageNumber: 2, body: 'mutated-provider-page' })
    const loop = recordMexcPage(first.checkpoint, repeated, CHECKPOINT_KEY)

    expect(firstPage.pageFingerprint).not.toBe(repeated.pageFingerprint)
    expect(loop).toMatchObject({ action: 'stop_blocked', scopeCompleteness: 'partial' })
    expect(loop.checkpoint).toMatchObject({
      status: 'loop_blocked',
      reason: 'repeated_page_without_cursor_progress',
      nextPageNumber: 2,
      totalSuccessfulPages: 1,
    })
  })

  it('blocks a next page that moves back toward newer provider time', () => {
    const initial = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY)
    const first = recordMexcPage(initial, page(), CHECKPOINT_KEY)
    const regressed = recordMexcPage(first.checkpoint, page({
      requestPageNumber: 2,
      ids: ['3', '4'],
      times: [NOW - 500, NOW - 1_000],
      body: 'newer-page-after-older-cursor',
    }), CHECKPOINT_KEY)

    expect(regressed).toMatchObject({ action: 'stop_blocked', scopeCompleteness: 'partial' })
    expect(regressed.checkpoint).toMatchObject({
      status: 'partial_failed',
      reason: 'cursor_progress_violation',
      nextPageNumber: 2,
      totalSuccessfulPages: 1,
    })
  })

  it('keeps cross-page ID overlap as repeated observation input for the later raw ledger', () => {
    const initial = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY)
    const first = recordMexcPage(initial, page(), CHECKPOINT_KEY)
    const overlap = recordMexcPage(first.checkpoint, page({
      requestPageNumber: 2,
      ids: ['2', '3'],
      times: [NOW - 2_000, NOW - 3_000],
      body: 'overlap-is-not-page-layer-deduplication',
    }), CHECKPOINT_KEY)

    expect(overlap).toMatchObject({ action: 'request_next_page', scopeCompleteness: 'unverified' })
    expect(overlap.checkpoint).toMatchObject({
      authorityBlocked: true,
      status: 'continue',
      reason: 'page_committed',
      totalSuccessfulPages: 2,
      totalRawEvents: 4,
    })
  })

  it('yields at a work-unit boundary and resumes in a new bounded work unit', () => {
    const limits = budget({
      profileId: 'one-page-work-unit',
      maxSuccessfulPagesPerWorkUnit: 1,
      maxRequestAttemptsPerWorkUnit: 3,
    })
    const initial = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY, limits)
    const yielded = recordMexcPage(initial, page(), CHECKPOINT_KEY, limits)

    expect(yielded).toMatchObject({ action: 'yield', scopeCompleteness: 'partial' })
    expect(yielded.checkpoint).toMatchObject({ status: 'yielded', reason: 'work_unit_budget_reached' })

    const resumed = resumeMexcPageCheckpoint(
      yielded.checkpoint,
      yielded.checkpoint.checkpointMac,
      CHECKPOINT_KEY,
      limits,
    )
    expect(resumed).toMatchObject({
      status: 'ready',
      reason: 'continued_in_new_work_unit',
      workUnitSequence: 2,
      nextPageNumber: 2,
      unitSuccessfulPages: 0,
      totalSuccessfulPages: 1,
    })
    expect(verifyMexcPageCheckpoint(resumed, CHECKPOINT_KEY, limits)).toBe(true)
  })

  it('uses the full final work unit before exhausting the scope', () => {
    const limits = budget({
      profileId: 'one-two-page-work-unit',
      maxSuccessfulPagesPerWorkUnit: 2,
      maxWorkUnitsPerScope: 1,
      maxSuccessfulPagesPerScope: 2,
    })
    const initial = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY, limits)
    const first = recordMexcPage(initial, page(), CHECKPOINT_KEY, limits)
    expect(first).toMatchObject({ action: 'request_next_page', scopeCompleteness: 'unverified' })

    const second = recordMexcPage(first.checkpoint, page({
      requestPageNumber: 2,
      ids: ['3', '4'],
      times: [NOW - 3_000, NOW - 4_000],
    }), CHECKPOINT_KEY, limits)
    expect(second).toMatchObject({ action: 'yield', scopeCompleteness: 'partial' })
    expect(second.checkpoint).toMatchObject({
      reason: 'scope_budget_reached',
      totalSuccessfulPages: 2,
      workUnitSequence: 1,
    })
  })

  it('continues deterministically across three work units and a serialized checkpoint restart', () => {
    const limits = budget({
      profileId: 'three-work-units',
      maxSuccessfulPagesPerWorkUnit: 1,
      maxRequestAttemptsPerWorkUnit: 3,
    })
    let checkpoint = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY, limits)
    for (const pageNumber of [1, 2]) {
      const yielded = recordMexcPage(checkpoint, page({
        requestPageNumber: pageNumber,
        ids: [String(pageNumber * 2 - 1), String(pageNumber * 2)],
        times: [NOW - pageNumber * 2_000 + 1_000, NOW - pageNumber * 2_000],
      }), CHECKPOINT_KEY, limits)
      expect(yielded.action).toBe('yield')
      const serialized = JSON.parse(JSON.stringify(yielded.checkpoint)) as MexcPageCheckpoint
      expect(verifyMexcPageCheckpoint(serialized, CHECKPOINT_KEY, limits)).toBe(true)
      checkpoint = resumeMexcPageCheckpoint(serialized, serialized.checkpointMac, CHECKPOINT_KEY, limits)
    }

    const terminal = recordMexcPage(checkpoint, page({
      requestPageNumber: 3,
      ids: ['5'],
      times: [NOW - 5_000],
    }), CHECKPOINT_KEY, limits)
    expect(terminal.checkpoint).toMatchObject({
      workUnitSequence: 3,
      status: 'terminal_observed',
      totalSuccessfulPages: 3,
      totalRawEvents: 5,
    })
  })

  it('schedules only the pinned retry budget and never advances the page on failure', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    try {
    const initial = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY)
    const firstFailure = recordMexcPageFailure(
      initial,
      { errorCode: 'rate_limited', requestDurationMs: 100, responseBodyBytes: 128 },
      CHECKPOINT_KEY,
    )
    expect(firstFailure).toMatchObject({ action: 'retry_after_backoff', scopeCompleteness: 'partial' })
    expect(firstFailure.checkpoint).toMatchObject({
      status: 'retry_pending',
      suggestedBackoffMs: 1_000,
      nextPageNumber: 1,
      unitRetryCount: 1,
      totalElapsedMs: 1_100,
      totalResponseBytes: 128,
      retryNotBeforeMs: NOW + 1_000,
    })

    expectPagingCode(
      () => resumeMexcPageCheckpoint(
        firstFailure.checkpoint,
        firstFailure.checkpoint.checkpointMac,
        CHECKPOINT_KEY,
      ),
      'invalid_transition',
    )
    vi.advanceTimersByTime(1_000)

    const firstResume = resumeMexcPageCheckpoint(
      firstFailure.checkpoint,
      firstFailure.checkpoint.checkpointMac,
      CHECKPOINT_KEY,
    )
    const secondFailure = recordMexcPageFailure(
      firstResume,
      { errorCode: 'timeout', requestDurationMs: 200, responseBodyBytes: 0 },
      CHECKPOINT_KEY,
    )
    expect(secondFailure.checkpoint).toMatchObject({
      suggestedBackoffMs: 5_000,
      unitRetryCount: 2,
      nextPageNumber: 1,
      totalResponseBytes: 128,
    })

    expectPagingCode(
      () => resumeMexcPageCheckpoint(
        secondFailure.checkpoint,
        secondFailure.checkpoint.checkpointMac,
        CHECKPOINT_KEY,
      ),
      'invalid_transition',
    )
    vi.advanceTimersByTime(5_000)

    const secondResume = resumeMexcPageCheckpoint(
      secondFailure.checkpoint,
      secondFailure.checkpoint.checkpointMac,
      CHECKPOINT_KEY,
    )
    const exhausted = recordMexcPageFailure(
      secondResume,
      { errorCode: 'provider_busy', requestDurationMs: 300, responseBodyBytes: 256 },
      CHECKPOINT_KEY,
    )
    expect(exhausted).toMatchObject({ action: 'stop_blocked', scopeCompleteness: 'partial' })
    expect(exhausted.checkpoint).toMatchObject({
      status: 'partial_failed',
      reason: 'retry_budget_reached',
      suggestedBackoffMs: null,
      nextPageNumber: 1,
      totalResponseBytes: 384,
    })

    const maintenance = recordMexcPageFailure(
      initial,
      { errorCode: 'maintenance', requestDurationMs: 100, responseBodyBytes: 64 },
      CHECKPOINT_KEY,
    )
    expect(maintenance).toMatchObject({ action: 'stop_blocked', scopeCompleteness: 'partial' })
    expect(maintenance.checkpoint).toMatchObject({
      status: 'partial_failed',
      reason: 'provider_retry_deferred',
      unitRetryCount: 0,
      suggestedBackoffMs: null,
      nextPageNumber: 1,
    })
    } finally {
      vi.useRealTimers()
    }
  })

  it('counts provider error bodies against byte budgets and blocks retry at the boundary', () => {
    const limits = budget({
      profileId: 'failure-body-byte-budget',
      maxResponseBytesPerWorkUnit: 65_536,
    })
    const initial = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY, limits)
    const stopped = recordMexcPageFailure(initial, {
      errorCode: 'rate_limited',
      requestDurationMs: 100,
      responseBodyBytes: 65_536,
    }, CHECKPOINT_KEY, limits)

    expect(stopped).toMatchObject({ action: 'stop_blocked', scopeCompleteness: 'partial' })
    expect(stopped.checkpoint).toMatchObject({
      status: 'partial_failed',
      reason: 'failure_budget_reached',
      unitRequestAttempts: 1,
      unitResponseBytes: 65_536,
      totalResponseBytes: 65_536,
      unitRetryCount: 0,
      suggestedBackoffMs: null,
    })
  })

  it('blocks non-retryable failures and unknown error classes without fabricating empty data', () => {
    const initial = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY)
    const denied = recordMexcPageFailure(
      initial,
      { errorCode: 'permission_missing', requestDurationMs: 100, responseBodyBytes: 96 },
      CHECKPOINT_KEY,
    )
    expect(denied).toMatchObject({ action: 'stop_blocked', scopeCompleteness: 'partial' })
    expect(denied.checkpoint).toMatchObject({
      status: 'partial_failed',
      reason: 'non_retryable_failure',
      lastErrorCode: 'permission_missing',
      totalSuccessfulPages: 0,
    })

    expectPagingCode(() => recordMexcPageFailure(initial, {
      errorCode: 'invented_error' as never,
      requestDurationMs: 1,
      responseBodyBytes: 0,
    }, CHECKPOINT_KEY), 'invalid_page_observation')
  })

  it('blocks a response that cannot fit atomically into the remaining work-unit budget', () => {
    const limits = budget({
      profileId: 'single-body-byte-budget',
      maxResponseBytesPerWorkUnit: 65_536,
    })
    const initial = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY, limits)
    const first = recordMexcPage(initial, page({ rawBodyBytes: 40_000 }), CHECKPOINT_KEY, limits)
    const overflow = recordMexcPage(
      first.checkpoint,
      page({ requestPageNumber: 2, rawBodyBytes: 40_000 }),
      CHECKPOINT_KEY,
      limits,
    )

    expect(overflow).toMatchObject({ action: 'stop_blocked', scopeCompleteness: 'partial' })
    expect(overflow.checkpoint).toMatchObject({
      status: 'partial_failed',
      reason: 'response_exceeds_remaining_budget',
      nextPageNumber: 2,
      totalSuccessfulPages: 1,
    })
  })

  it('blocks out-of-order pages, invalid scopes, provider metadata and event timestamps', () => {
    const initial = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY)
    expectPagingCode(() => recordMexcPage(initial, page({ requestPageNumber: 2 }), CHECKPOINT_KEY), 'invalid_transition')
    expectPagingCode(() => createMexcPageCheckpoint('historical_orders_v1', POSITION_SCOPE, CHECKPOINT_KEY), 'invalid_scope')
    expectPagingCode(() => createMexcPageCheckpoint('unknown' as never, HISTORY_SCOPE, CHECKPOINT_KEY), 'invalid_capability')
    expectPagingCode(
      () => recordMexcPage(initial, page({ capabilityId: 'historical_executions_v3' }), CHECKPOINT_KEY),
      'invalid_transition',
    )
    expectPagingCode(
      () => recordMexcPage(initial, page({ times: [NOW + 1, NOW - 1] }), CHECKPOINT_KEY),
      'invalid_page_observation',
    )
    expectPagingCode(() => page({
      capabilityId: 'funding_records_v1',
      ids: [],
      times: [],
      providerPage: { currentPage: 1, pageSize: 2, totalCount: 3, totalPage: 1 },
    }), 'invalid_page_observation')
    expectPagingCode(() => page({
      capabilityId: 'funding_records_v1',
      ids: ['1'],
      times: [NOW - 1_000],
      providerPage: { currentPage: 1, pageSize: 2, totalCount: 2, totalPage: 1 },
    }), 'invalid_page_observation')
  })

  it('revalidates page observations at the transition boundary', () => {
    const initial = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY)
    const valid = page()
    expectPagingCode(
      () => recordMexcPage(initial, { ...valid, pageFingerprint: digest('forged') }, CHECKPOINT_KEY),
      'invalid_page_observation',
    )
    expectPagingCode(
      () => recordMexcPage(initial, { ...valid, unrecognised: true } as never, CHECKPOINT_KEY),
      'invalid_page_observation',
    )
    expectPagingCode(
      () => recordMexcPage(initial, {
        ...valid,
        rawBodyDigest: { ...valid.rawBodyDigest, domain: 'raw_event_content' },
      } as never, CHECKPOINT_KEY),
      'invalid_page_observation',
    )
  })

  it('rejects incoherent time budgets and refuses resume after the total time budget is exhausted', () => {
    const invalid = budget({
      profileId: 'invalid-time-budget',
      maxElapsedMsPerWorkUnit: 60_000,
      maxElapsedMsPerScope: 59_999,
    })
    expectPagingCode(
      () => createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY, invalid),
      'invalid_budget_profile',
    )

    const limits = budget({
      profileId: 'exhausted-time-budget',
      maxElapsedMsPerWorkUnit: 60_000,
      maxElapsedMsPerScope: 60_000,
    })
    const initial = createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY, limits)
    const exhausted = recordMexcPageFailure(initial, {
      errorCode: 'maintenance',
      requestDurationMs: 60_000,
      responseBodyBytes: 0,
    }, CHECKPOINT_KEY, limits).checkpoint
    expect(exhausted.reason).toBe('provider_retry_deferred')
    expectPagingCode(
      () => resumeMexcPageCheckpoint(exhausted, exhausted.checkpointMac, CHECKPOINT_KEY, limits),
      'invalid_transition',
    )

    expectPagingCode(
      () => createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY, {
        ...MEXC_PAGE_BUDGET_PROFILE_V1,
        unexpectedLimit: 1,
      } as never),
      'invalid_budget_profile',
    )
  })

  it('blocks a full page when the provider page-number contract cannot advance further', () => {
    const checkpoint = createMexcPageCheckpoint('historical_orders_v1', {
      ...HISTORY_SCOPE,
      pageNumber: 10_000,
    }, CHECKPOINT_KEY)
    const blocked = recordMexcPage(checkpoint, page({ requestPageNumber: 10_000 }), CHECKPOINT_KEY)

    expect(blocked).toMatchObject({ action: 'stop_blocked', scopeCompleteness: 'partial' })
    expect(blocked.checkpoint).toMatchObject({
      status: 'partial_failed',
      reason: 'provider_page_number_limit_reached',
      nextPageNumber: 10_001,
    })
  })

  it('does not resume terminal, loop-blocked, non-retryable or scope-exhausted checkpoints', () => {
    const terminal = recordMexcPage(
      createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY),
      page({ ids: [], times: [] }),
      CHECKPOINT_KEY,
    ).checkpoint
    expectPagingCode(
      () => resumeMexcPageCheckpoint(terminal, terminal.checkpointMac, CHECKPOINT_KEY),
      'invalid_transition',
    )

    const limits = budget({
      profileId: 'scope-one-page',
      maxSuccessfulPagesPerWorkUnit: 1,
      maxSuccessfulPagesPerScope: 1,
    })
    const scopeExhausted = recordMexcPage(
      createMexcPageCheckpoint('historical_orders_v1', HISTORY_SCOPE, CHECKPOINT_KEY, limits),
      page(),
      CHECKPOINT_KEY,
      limits,
    ).checkpoint
    expect(scopeExhausted.reason).toBe('scope_budget_reached')
    expectPagingCode(
      () => resumeMexcPageCheckpoint(scopeExhausted, scopeExhausted.checkpointMac, CHECKPOINT_KEY, limits),
      'invalid_transition',
    )
  })
})

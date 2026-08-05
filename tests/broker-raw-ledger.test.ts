import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  applyBrokerRawPage,
  BrokerRawLedgerError,
  createBrokerRawLedgerState,
  type BrokerAccountIdentityReference,
  type BrokerRawPageEventInput,
  type BrokerRawPageInput,
} from '../lib/server/broker-raw-ledger'
import {
  digestEquoraRawResponseBody,
  digestEquoraTcj,
  tcjObject,
  tcjString,
} from '../lib/server/equora-tcj'
import { parseMexcJson, type MexcJsonObject } from '../lib/server/mexc-json'

const NOW_US = '1760000000000000'
const ACCOUNT = Object.freeze({
  digestAlgorithm: 'hmac-sha256' as const,
  digestContractVersion: 'equora-tcj-v1' as const,
  purpose: 'broker_account_identity_v1' as const,
  keyVersion: 'v1',
  digest: digest('account-one'),
  verificationStatus: 'unverified_reference' as const,
})

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function rawBodyDigest(value: string) {
  return digestEquoraRawResponseBody(new TextEncoder().encode(value))
}

function uuid(value: string) {
  const hash = digest(value)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

function runReference(value: string) {
  return Object.freeze({ referenceType: 'sync_run_id_v1' as const, value: uuid(value) })
}

function requestResultReference(value: string) {
  return Object.freeze({ referenceType: 'provider_request_result_id_v1' as const, value: uuid(value) })
}

function syncScopeDigest(value: string) {
  return digestEquoraTcj('sync_scope', tcjObject([['fixture_scope', tcjString(value)]]))
}

function payload(json: string) {
  const value = parseMexcJson(json)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Test payload must be an object')
  return value as MexcJsonObject
}

function event(overrides: Partial<BrokerRawPageEventInput> = {}): BrokerRawPageEventInput {
  const externalEventId = Object.prototype.hasOwnProperty.call(overrides, 'externalEventId')
    ? overrides.externalEventId!
    : '1'
  const providerOccurredAtUs = Object.prototype.hasOwnProperty.call(overrides, 'providerOccurredAtUs')
    ? overrides.providerOccurredAtUs!
    : NOW_US
  const providerOrderTimeMs = Object.prototype.hasOwnProperty.call(overrides, 'providerOrderTimeMs')
    ? overrides.providerOrderTimeMs!
    : providerOccurredAtUs === null
      ? null
      : Number(BigInt(providerOccurredAtUs) / BigInt(1_000))
  return Object.freeze({
    eventType: 'order',
    identityStatus: externalEventId === null ? 'blocked_identity' : 'stable_provider_id',
    externalEventId,
    providerRevision: null,
    providerRevisionAuthority: 'unverified',
    providerOccurredAtUs,
    providerOrderTimeMs,
    payload: payload(`{"id":${JSON.stringify(externalEventId ?? 'blocked')},"qty":1}`),
    ...overrides,
  })
}

function page(overrides: Partial<BrokerRawPageInput> = {}): BrokerRawPageInput {
  const events = overrides.events ?? Object.freeze([event(), event({
    externalEventId: '2',
    providerOccurredAtUs: '1759999999000000',
    payload: payload('{"id":"2","qty":2}'),
  })])
  const defaultCursor = events.length === 0 || events[events.length - 1]!.externalEventId === null
    ? null
    : Object.freeze({
        providerTimeMs: events[events.length - 1]!.providerOrderTimeMs!,
        providerId: events[events.length - 1]!.externalEventId!,
      })
  const capabilityId = overrides.capabilityId ?? 'historical_orders_v1'
  const requestScope = overrides.requestScope ?? Object.freeze({
    symbol: 'BTC_USDT',
    startTimeMs: 1_759_999_900_000,
    endTimeMs: 1_760_000_000_000,
    pageSize: 100,
    positionType: null,
  })
  const providerPage = overrides.providerPage ?? null
  const terminalEvidence = overrides.terminalEvidence ?? (
    capabilityId !== 'funding_records_v1'
      ? events.length < requestScope.pageSize ? 'short_bare_array' : 'none'
      : providerPage?.currentPage === 1
          && providerPage.totalCount === 0
          && providerPage.totalPage === 0
          && events.length === 0
        ? 'canonical_empty_page'
        : providerPage && providerPage.totalPage > 0 && providerPage.currentPage >= providerPage.totalPage
          ? 'provider_page_metadata'
          : 'none'
  )
  return Object.freeze({
    providerCode: 'mexc',
    accountIdentity: ACCOUNT,
    sourceChannel: 'provider_api_observation',
    sourceProfileId: 'mexc_futures_rest',
    sourceProfileVersion: 'v1',
    providerContractVersion: 'mexc_futures_contract_v1',
    adapterVersion: 'v57_61_0',
    capabilityId,
    endpointId: 'historical_orders_v1',
    scopeDigest: syncScopeDigest('scope'),
    runReference: runReference('run-1'),
    requestResultReference: requestResultReference('request-1'),
    requestSequence: 1,
    requestPageNumber: 1,
    requestScope,
    rawBodyDigest: rawBodyDigest('body-1'),
    rawBodyBytes: 128,
    responseClassification: 'valid_read_preview_only',
    scopeCompleteness: 'unverified',
    terminalEvidence,
    providerPage,
    cursor: defaultCursor,
    observedAtUs: NOW_US,
    events,
    ...overrides,
  })
}

function expectLedgerCode(operation: () => unknown, code: BrokerRawLedgerError['code']) {
  try {
    operation()
    expect.unreachable(`Expected raw ledger error ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(BrokerRawLedgerError)
    expect((error as BrokerRawLedgerError).code).toBe(code)
  }
}

describe('MEXC-registered transient raw event observation ledger', () => {
  it('commits one immutable page transition as raw events plus first observations', () => {
    const initial = createBrokerRawLedgerState('mexc', ACCOUNT)
    const transition = applyBrokerRawPage(initial, 0, page())

    expect(initial).toMatchObject({ ledgerGeneration: 0, authorityBlocked: true })
    expect(initial.rawEvents).toHaveLength(0)
    expect(transition).toMatchObject({
      counts: { insertedRawEvents: 2, firstObservations: 2, repeatedObservations: 0 },
      scopeCompleteness: 'unverified',
      authorityBlocked: true,
    })
    expect(transition.state).toMatchObject({ ledgerGeneration: 1, authorityBlocked: true })
    expect(transition.state.rawEvents).toHaveLength(2)
    expect(transition.state.pageObservations).toHaveLength(1)
    expect(transition.state.rawEventObservations).toHaveLength(2)
    expect(transition.state.rawEvents.map((item) => item.revisionSequence)).toEqual([1, 1])
    expect(transition.state.rawEvents[0]!.rawEventContentDigest.digest).toBe('5b6551bb584caeb7b9be0459b42d85469eb853cbf4bcd5a987622dd279040309')
    expect(transition.pageObservation.pageObservationDigest).toEqual({
      digestAlgorithm: 'sha256',
      digestContractVersion: 'equora-tcj-v1',
      domain: 'page_observation',
      digest: 'e47e3f8250f7e455ccff3954a5da7902d4ac991bd04b3a9d0244cdbf34c96ffc',
    })
    expect(transition.observations[0]!.observationDigest).toEqual({
      digestAlgorithm: 'sha256',
      digestContractVersion: 'equora-tcj-v1',
      domain: 'raw_event_observation',
      digest: 'ceb23d26d443b8408c8f76657f952e7c0f2319cdd96543b2df6ee2ab4b90ce23',
    })
    expect(transition.observations.every((item) => item.occurrence === 'first_observation')).toBe(true)
    expect(new Set(transition.observations.map((item) => item.observationDigest.digest)).size).toBe(2)
    expect(transition.observations.every(
      (item) => item.observationDigest.digest !== transition.pageObservation.pageObservationDigest.digest,
    )).toBe(true)
    expect(Object.isFrozen(transition.state)).toBe(true)
    expect(Object.isFrozen(transition.state.rawEvents)).toBe(true)
  })

  it('deduplicates a cross-page overlap into a repeated observation and inserts only the new event', () => {
    const first = applyBrokerRawPage(createBrokerRawLedgerState('mexc', ACCOUNT), 0, page())
    const overlapPage = page({
      requestResultReference: requestResultReference('request-2'),
      requestSequence: 2,
      requestPageNumber: 2,
      rawBodyDigest: rawBodyDigest('body-2'),
      observedAtUs: '1760000001000000',
      events: Object.freeze([
        event({
          externalEventId: '2',
          providerOccurredAtUs: '1759999999000000',
          payload: payload('{"id":"2","qty":2}'),
        }),
        event({
          externalEventId: '3',
          providerOccurredAtUs: '1759999998000000',
          payload: payload('{"id":"3","qty":3}'),
        }),
      ]),
      cursor: Object.freeze({ providerTimeMs: 1_759_999_998_000, providerId: '3' }),
    })
    const overlap = applyBrokerRawPage(first.state, 1, overlapPage)

    expect(overlap.counts).toEqual({ insertedRawEvents: 1, firstObservations: 1, repeatedObservations: 1 })
    expect(overlap.state.rawEvents).toHaveLength(3)
    expect(overlap.state.rawEventObservations).toHaveLength(4)
    expect(overlap.observations.map((item) => item.occurrence)).toEqual([
      'repeated_observation',
      'first_observation',
    ])
    expect(overlap.state.rawEvents.filter((item) => item.externalEventId === '2')).toHaveLength(1)
  })

  it('treats key order and exact numeric equivalents as the same semantic raw event content', () => {
    const firstEvent = event({ payload: payload('{"id":"1","qty":1.0}') })
    const first = applyBrokerRawPage(
      createBrokerRawLedgerState('mexc', ACCOUNT),
      0,
      page({ events: [firstEvent], cursor: { providerTimeMs: 1_760_000_000_000, providerId: '1' } }),
    )
    const second = applyBrokerRawPage(first.state, 1, page({
      runReference: runReference('run-2'),
      requestResultReference: requestResultReference('request-semantic-repeat'),
      requestSequence: 2,
      rawBodyDigest: rawBodyDigest('different-raw-body'),
      observedAtUs: '1760000001000000',
      events: [event({ payload: payload('{"qty":1e0,"id":"1"}') })],
      cursor: { providerTimeMs: 1_760_000_000_000, providerId: '1' },
    }))

    expect(second.counts).toEqual({ insertedRawEvents: 0, firstObservations: 0, repeatedObservations: 1 })
    expect(second.state.rawEvents).toHaveLength(1)
    expect(second.pageObservation.pageObservationDigest.digest).not.toBe(first.pageObservation.pageObservationDigest.digest)
  })

  it('creates an adapter revision for changed payload when no provider revision is authoritative', () => {
    const first = applyBrokerRawPage(
      createBrokerRawLedgerState('mexc', ACCOUNT),
      0,
      page({
        events: [event({ providerRevision: 'observed_v1', providerRevisionAuthority: 'unverified' })],
        cursor: { providerTimeMs: 1_760_000_000_000, providerId: '1' },
      }),
    )
    const revision = applyBrokerRawPage(first.state, 1, page({
      requestResultReference: requestResultReference('request-revision'),
      requestSequence: 2,
      rawBodyDigest: rawBodyDigest('body-revision'),
      observedAtUs: '1760000001000000',
      events: [event({
        providerRevision: 'observed_v1',
        providerRevisionAuthority: 'unverified',
        payload: payload('{"id":"1","qty":2}'),
      })],
      cursor: { providerTimeMs: 1_760_000_000_000, providerId: '1' },
    }))

    expect(revision.counts.insertedRawEvents).toBe(1)
    expect(revision.state.rawEvents.map((item) => item.revisionSequence)).toEqual([1, 2])
    expect(revision.state.rawEvents.map((item) => item.revisionDiscriminator)).toEqual([
      'payload_hash_fallback',
      'payload_hash_fallback',
    ])
  })

  it('blocks unproven stable provider revisions for the MEXC capture profile atomically', () => {
    const initial = createBrokerRawLedgerState('mexc', ACCOUNT)
    const unprovenRevision = page({
      events: [event({ providerRevision: 'r1', providerRevisionAuthority: 'provider_stable' })],
      cursor: { providerTimeMs: 1_760_000_000_000, providerId: '1' },
    })

    expectLedgerCode(() => applyBrokerRawPage(initial, 0, unprovenRevision), 'invalid_page')
    expect(initial).toMatchObject({ ledgerGeneration: 0 })
    expect(initial.rawEvents).toHaveLength(0)
    expect(initial.pageObservations).toHaveLength(0)
  })

  it('enforces the generation precondition and replay blocking in one authentic state chain', () => {
    const initial = createBrokerRawLedgerState('mexc', ACCOUNT)
    expectLedgerCode(() => applyBrokerRawPage(initial, 1, page()), 'generation_mismatch')

    const first = applyBrokerRawPage(initial, 0, page())
    expectLedgerCode(() => applyBrokerRawPage(first.state, 1, page()), 'duplicate_request_result')
    expect(first.state.ledgerGeneration).toBe(1)

    const spreadRollback = Object.freeze({
      ...first.state,
      ledgerGeneration: 0,
      rawEvents: Object.freeze([]),
      pageObservations: Object.freeze([]),
      rawEventObservations: Object.freeze([]),
    })
    expectLedgerCode(() => applyBrokerRawPage(spreadRollback as never, 0, page()), 'invalid_state')

    const reflectedRollback = {
      ...spreadRollback,
    } as Record<PropertyKey, unknown>
    const stateBrand = Object.getOwnPropertySymbols(first.state)[0]!
    Object.defineProperty(
      reflectedRollback,
      stateBrand,
      Object.getOwnPropertyDescriptor(first.state, stateBrand)!,
    )
    Object.freeze(reflectedRollback)
    expectLedgerCode(() => applyBrokerRawPage(reflectedRollback as never, 0, page()), 'invalid_state')
  })

  it('keeps page digest content-addressed while run-bound event observations remain distinct', () => {
    const first = applyBrokerRawPage(createBrokerRawLedgerState('mexc', ACCOUNT), 0, page())
    const repeated = applyBrokerRawPage(first.state, 1, page({
      runReference: runReference('other-run'),
      requestResultReference: requestResultReference('other-request'),
      requestSequence: 9,
      observedAtUs: '1760000010000000',
    }))
    expect(repeated.pageObservation.pageObservationDigest).toEqual(first.pageObservation.pageObservationDigest)
    expect(repeated.observations.map((item) => item.observationDigest.digest)).not.toEqual(
      first.observations.map((item) => item.observationDigest.digest),
    )

    const changedBody = applyBrokerRawPage(repeated.state, 2, page({
      runReference: runReference('third-run'),
      requestResultReference: requestResultReference('third-request'),
      requestSequence: 10,
      observedAtUs: '1760000020000000',
      rawBodyDigest: rawBodyDigest('changed-body'),
    }))
    expect(changedBody.pageObservation.pageObservationDigest.digest).not.toBe(first.pageObservation.pageObservationDigest.digest)
  })

  it('records an empty terminal page without fabricating raw events or completeness', () => {
    const transition = applyBrokerRawPage(createBrokerRawLedgerState('mexc', ACCOUNT), 0, page({
      events: [],
      cursor: null,
      terminalEvidence: 'short_bare_array',
      rawBodyDigest: rawBodyDigest('empty-page'),
      rawBodyBytes: 2,
    }))

    expect(transition).toMatchObject({
      counts: { insertedRawEvents: 0, firstObservations: 0, repeatedObservations: 0 },
      scopeCompleteness: 'unverified',
      authorityBlocked: true,
    })
    expect(transition.state.rawEvents).toHaveLength(0)
    expect(transition.state.rawEventObservations).toHaveLength(0)
    expect(transition.state.pageObservations).toHaveLength(1)
  })

  it('binds Funding provider-page metadata and rejects capability-incoherent terminal evidence', () => {
    const fundingPage = page({
      capabilityId: 'funding_records_v1',
      endpointId: 'funding_records_v1',
      requestScope: {
        symbol: 'BTC_USDT',
        startTimeMs: 1_759_999_900_000,
        endTimeMs: 1_760_000_000_000,
        pageSize: 100,
        positionType: 1,
      },
      events: [],
      cursor: null,
      rawBodyBytes: 2,
      responseClassification: 'blocked_funding_authority',
      terminalEvidence: 'canonical_empty_page',
      providerPage: { currentPage: 1, pageSize: 100, totalCount: 0, totalPage: 0 },
    })
    const accepted = applyBrokerRawPage(createBrokerRawLedgerState('mexc', ACCOUNT), 0, fundingPage)
    expect(accepted.pageObservation.providerPage).toEqual({
      currentPage: 1,
      pageSize: 100,
      totalCount: 0,
      totalPage: 0,
    })

    const initial = createBrokerRawLedgerState('mexc', ACCOUNT)
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({
        providerPage: { currentPage: 1, pageSize: 100, totalCount: 2, totalPage: 1 },
      })),
      'invalid_page',
    )
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({
        capabilityId: 'funding_records_v1',
        endpointId: 'funding_records_v1',
        requestScope: {
          symbol: 'BTC_USDT',
          startTimeMs: 1_759_999_900_000,
          endTimeMs: 1_760_000_000_000,
          pageSize: 100,
          positionType: 1,
        },
        events: [event({
          eventType: 'funding',
          payload: payload('{"id":"1","funding":1}'),
        })],
        responseClassification: 'blocked_funding_authority',
        providerPage: { currentPage: 1, pageSize: 100, totalCount: 2, totalPage: 1 },
        terminalEvidence: 'provider_page_metadata',
      })),
      'invalid_page',
    )
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({ terminalEvidence: 'none' })),
      'invalid_page',
    )
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({
        events: [],
        cursor: null,
        terminalEvidence: 'canonical_empty_page',
      })),
      'invalid_page',
    )
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({
        capabilityId: 'funding_records_v1',
        endpointId: 'funding_records_v1',
        requestScope: {
          symbol: 'BTC_USDT',
          startTimeMs: 1_759_999_900_000,
          endTimeMs: 1_760_000_000_000,
          pageSize: 100,
          positionType: 1,
        },
        events: [event({
          eventType: 'funding',
          payload: payload('{"id":"1","funding":1}'),
        })],
        responseClassification: 'blocked_funding_authority',
        providerPage: { currentPage: 1, pageSize: 100, totalCount: 1, totalPage: 1 },
        terminalEvidence: 'none',
      })),
      'invalid_page',
    )
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({
        ...fundingPage,
        terminalEvidence: 'provider_page_metadata',
      })),
      'invalid_page',
    )
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({
        requestScope: {
          symbol: 'BTC_USDT',
          startTimeMs: 1_759_999_900_000,
          endTimeMs: 1_760_000_000_000,
          pageSize: 2,
          positionType: null,
        },
        terminalEvidence: 'short_bare_array',
      })),
      'invalid_page',
    )
  })

  it('caps canonical page work and total transient page growth', () => {
    const initial = createBrokerRawLedgerState('mexc', ACCOUNT)
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({
        rawBodyBytes: 16,
        events: [event({ payload: payload(`{"id":"1","large":"${'x'.repeat(5_000)}"}`) })],
        cursor: { providerTimeMs: 1_760_000_000_000, providerId: '1' },
      })),
      'resource_budget_exceeded',
    )

    let state = initial
    for (let index = 0; index < 100; index += 1) {
      state = applyBrokerRawPage(state, index, page({
        events: [],
        cursor: null,
        requestResultReference: requestResultReference(`bounded-request-${index}`),
        requestSequence: index + 1,
        requestPageNumber: index + 1,
        rawBodyDigest: rawBodyDigest(`bounded-body-${index}`),
        rawBodyBytes: 2,
        terminalEvidence: 'short_bare_array',
      })).state
    }
    expect(state.pageObservations).toHaveLength(100)
    expectLedgerCode(
      () => applyBrokerRawPage(state, 100, page({
        events: [],
        cursor: null,
        requestResultReference: requestResultReference('bounded-request-overflow'),
        requestSequence: 101,
        requestPageNumber: 101,
        rawBodyDigest: rawBodyDigest('bounded-body-overflow'),
        rawBodyBytes: 2,
        terminalEvidence: 'short_bare_array',
      })),
      'resource_budget_exceeded',
    )
  })

  it('stores missing provider identity only as blocked payload fingerprint evidence', () => {
    const blockedEvent = event({
      eventType: 'position',
      identityStatus: 'blocked_identity',
      externalEventId: null,
      providerRevision: null,
      payload: payload('{"symbol":"BTC_USDT","unidentified":true}'),
    })
    const first = applyBrokerRawPage(createBrokerRawLedgerState('mexc', ACCOUNT), 0, page({
      capabilityId: 'historical_positions_v1',
      endpointId: 'historical_positions_v1',
      requestScope: {
        symbol: 'BTC_USDT',
        startTimeMs: 1_759_999_900_000,
        endTimeMs: 1_760_000_000_000,
        pageSize: 100,
        positionType: 1,
      },
      events: [blockedEvent],
      cursor: null,
      scopeCompleteness: 'partial',
      responseClassification: 'blocked_unobserved_position_items',
    }))
    expect(first.state.rawEvents[0]).toMatchObject({
      identityStatus: 'blocked_identity',
      externalEventId: null,
      revisionDiscriminator: 'blocked_payload_fingerprint',
      authorityBlocked: true,
    })

    const repeated = applyBrokerRawPage(first.state, 1, page({
      capabilityId: 'historical_positions_v1',
      endpointId: 'historical_positions_v1',
      requestScope: {
        symbol: 'BTC_USDT',
        startTimeMs: 1_759_999_900_000,
        endTimeMs: 1_760_000_000_000,
        pageSize: 100,
        positionType: 1,
      },
      events: [blockedEvent],
      cursor: null,
      scopeCompleteness: 'partial',
      responseClassification: 'blocked_unobserved_position_items',
      requestResultReference: requestResultReference('blocked-repeat'),
      requestSequence: 2,
    }))
    expect(repeated.counts).toEqual({ insertedRawEvents: 0, firstObservations: 0, repeatedObservations: 1 })
  })

  it('keeps identical content isolated by synthetic account-digest reference', () => {
    const secondAccount: BrokerAccountIdentityReference = Object.freeze({
      digestAlgorithm: 'hmac-sha256',
      digestContractVersion: 'equora-tcj-v1',
      purpose: 'broker_account_identity_v1',
      keyVersion: 'v1',
      digest: digest('account-two'),
      verificationStatus: 'unverified_reference',
    })
    const firstState = createBrokerRawLedgerState('mexc', ACCOUNT)
    expectLedgerCode(
      () => applyBrokerRawPage(firstState, 0, page({ accountIdentity: secondAccount })),
      'invalid_page',
    )

    const first = applyBrokerRawPage(firstState, 0, page())
    const second = applyBrokerRawPage(
      createBrokerRawLedgerState('mexc', secondAccount),
      0,
      page({ accountIdentity: secondAccount }),
    )
    expect(second.state.rawEvents[0]!.rawEventContentDigest).toEqual(first.state.rawEvents[0]!.rawEventContentDigest)
    expect(second.state.rawEvents[0]!.membershipKey).not.toBe(first.state.rawEvents[0]!.membershipKey)
  })

  it('pins MEXC-v1 provenance, capability endpoint, digest domain and opaque references', () => {
    const initial = createBrokerRawLedgerState('mexc', ACCOUNT)
    const invalidPages: BrokerRawPageInput[] = [
      page({ endpointId: 'historical_executions_v3' }),
      page({ sourceProfileId: 'mexc_futures_rest_v2' }),
      page({ sourceProfileVersion: 'v2' }),
      page({ providerContractVersion: 'mexc_futures_contract_v2' }),
      page({ adapterVersion: 'v57_62_0' }),
      page({ scopeDigest: rawBodyDigest('wrong-domain') as never }),
      page({
        scopeDigest: {
          ...syncScopeDigest('scope'),
          digestContractVersion: 'equora-tcj-v2',
        } as never,
      }),
      page({ runReference: { referenceType: 'sync_run_id_v1', value: digest('not-a-uuid') } }),
      page({
        requestResultReference: {
          referenceType: 'sync_run_id_v1',
          value: uuid('wrong-reference-type'),
        } as never,
      }),
    ]

    for (const invalidPage of invalidPages) {
      expectLedgerCode(() => applyBrokerRawPage(initial, 0, invalidPage), 'invalid_page')
    }
    expect(initial).toMatchObject({ ledgerGeneration: 0 })
  })

  it('rejects forged completeness, unsupported channels, cursor mismatch and non-lossless payloads', () => {
    const initial = createBrokerRawLedgerState('mexc', ACCOUNT)
    expectLedgerCode(() => createBrokerRawLedgerState('future_broker', ACCOUNT), 'invalid_page')
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({ scopeCompleteness: 'complete' as never })),
      'invalid_page',
    )
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({ sourceChannel: 'provider_websocket_observation' as never })),
      'invalid_page',
    )
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({ cursor: { providerTimeMs: 1_760_000_000_000, providerId: 'wrong' } })),
      'invalid_page',
    )
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({ cursor: { providerTimeMs: 1_760_000_000_000, providerId: '2' } })),
      'invalid_page',
    )
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({
        events: [
          event({ providerOccurredAtUs: '1759999999000000' }),
          event({
            externalEventId: '2',
            providerOccurredAtUs: NOW_US,
            payload: payload('{"id":"2","qty":2}'),
          }),
        ],
        cursor: { providerTimeMs: 1_760_000_000_000, providerId: '2' },
      })),
      'invalid_page',
    )
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({
        events: [event({ providerRevisionAuthority: 'provider_stable', providerRevision: null })],
        cursor: { providerTimeMs: 1_760_000_000_000, providerId: '1' },
      })),
      'invalid_page',
    )
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({
        events: [event({ payload: { id: 1 } as never })],
        cursor: { providerTimeMs: 1_760_000_000_000, providerId: '1' },
      })),
      'invalid_page',
    )
    const forgedFrozenPayload = Object.create(null) as Record<string, unknown>
    forgedFrozenPayload.id = '1'
    Object.freeze(forgedFrozenPayload)
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({
        events: [event({ payload: forgedFrozenPayload as never })],
        cursor: { providerTimeMs: 1_760_000_000_000, providerId: '1' },
      })),
      'invalid_page',
    )
    const duplicate = event()
    expectLedgerCode(
      () => applyBrokerRawPage(initial, 0, page({
        events: [duplicate, duplicate],
        cursor: { providerTimeMs: 1_760_000_000_000, providerId: '1' },
      })),
      'duplicate_page_event',
    )
  })
})

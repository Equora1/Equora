import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server/mexc-transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/server/mexc-transport')>()
  return { ...actual, executeMexcPrivateReadWorkUnit: vi.fn() }
})

import { probeMexcReadonlyCredentials, MexcReadonlyProbeError } from '../lib/server/mexc-readonly-probe'
import { executeMexcPrivateReadWorkUnit } from '../lib/server/mexc-transport'
import { parseMexcJson } from '../lib/server/mexc-json'

const executeWorkUnit = vi.mocked(executeMexcPrivateReadWorkUnit)

function validOutcomes(): Array<Record<string, unknown>> {
  const emptyList = parseMexcJson('[]')
  const emptyFundingPage = parseMexcJson(
    '{"currentPage":1,"pageSize":10,"totalCount":0,"totalPage":0,"resultList":[]}',
  )
  return [
    { capabilityId: 'historical_orders_v1', status: 'wire_succeeded', response: { data: emptyList } },
    { capabilityId: 'historical_executions_v3', status: 'wire_succeeded', response: { data: emptyList } },
    { capabilityId: 'historical_positions_v1', status: 'wire_succeeded', response: { data: emptyList } },
    { capabilityId: 'historical_positions_v1', status: 'wire_succeeded', response: { data: emptyList } },
    { capabilityId: 'funding_records_v1', status: 'wire_succeeded', response: { data: emptyFundingPage } },
    { capabilityId: 'funding_records_v1', status: 'wire_succeeded', response: { data: emptyFundingPage } },
  ]
}

describe('MEXC read-only capability probe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(1_760_000_000_000)
  })

  it('accepts only capability- and scope-valid GET responses and keeps evidence transient', async () => {
    executeWorkUnit.mockResolvedValue({ serverTime: 1_760_000_000_000, outcomes: validOutcomes() } as never)

    await expect(probeMexcReadonlyCredentials(
      { apiKey: 'read-key', secretKey: 'read-secret' },
      ['BTC_USDT'],
    )).resolves.toEqual({
      status: 'capability_reads_succeeded',
      evidencePersistence: 'transient_not_persisted',
      oracleContractVersion: 'mexc-capability-oracle-v1',
      symbols: ['BTC_USDT'],
      requestCount: 6,
      authorityBlocked: true,
    })
  })

  it('rejects a wire-success response that violates the capability oracle', async () => {
    const outcomes = validOutcomes()
    outcomes[0] = {
      capabilityId: 'historical_orders_v1',
      status: 'wire_succeeded',
      response: { data: {} },
    }
    executeWorkUnit.mockResolvedValue({ serverTime: 1_760_000_000_000, outcomes } as never)

    await expect(probeMexcReadonlyCredentials(
      { apiKey: 'read-key', secretKey: 'read-secret' },
      ['BTC_USDT'],
    )).rejects.toMatchObject({ code: 'malformed_response' } satisfies Partial<MexcReadonlyProbeError>)
  })
})

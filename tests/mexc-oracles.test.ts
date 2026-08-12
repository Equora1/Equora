import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { parseMexcJson, type MexcJsonValue } from '../lib/server/mexc-json'
import { MexcOracleError, validateMexcCapabilityData } from '../lib/server/mexc-oracles'

const NOW = 1_760_000_000_000
const METADATA_SCOPE = { symbol: 'BTC_USDT' }
const HISTORY_SCOPE = {
  symbol: 'BTC_USDT',
  startTime: NOW - 100_000,
  endTime: NOW,
  pageNumber: 1,
  pageSize: 20,
}
const POSITION_SCOPE = { ...HISTORY_SCOPE, positionType: 1 as const }

function lossless(value: unknown) {
  return parseMexcJson(JSON.stringify(value))
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    orderId: '123', positionId: '456', symbol: 'BTC_USDT', side: 1, positionMode: 1, state: 3, category: 1, orderType: 1,
    vol: '2.5', dealVol: '2.5', price: '100.125', dealAvgPrice: '100.125', takerFee: '-0.01', makerFee: '0', profit: '1.5',
    feeCurrency: 'USDT', createTime: NOW - 2_000, updateTime: NOW - 1_000, ...overrides,
  }
}

function execution(overrides: Record<string, unknown> = {}) {
  return {
    id: '789', orderId: '123', symbol: 'BTC_USDT', side: 1, positionMode: 1, category: 1,
    vol: '2.5', price: '100.125', fee: '-0.01', feeCurrency: 'USDT', profit: '1.5', taker: true,
    timestamp: NOW - 1_500, ...overrides,
  }
}

function position(overrides: Record<string, unknown> = {}) {
  return {
    positionId: '456', symbol: 'BTC_USDT', positionType: 1, openType: 1, state: 3,
    holdVol: '0', closeVol: '2.5', openAvgPrice: '100', closeAvgPrice: '101', holdFee: '-0.01',
    closeProfitLoss: '2.5', realised: '2.49', fee: '-0.01', totalFee: '-0.01',
    createTime: NOW - 3_000, updateTime: NOW - 1_000, ...overrides,
  }
}

function funding(overrides: Record<string, unknown> = {}) {
  return {
    id: '999', symbol: 'BTC_USDT', positionType: 1, positionValue: '250.25', funding: '-0.025', rate: '0.0001',
    settleTime: NOW - 2_000, ...overrides,
  }
}

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    id: '1', symbol: 'BTC_USDT', baseCoin: 'BTC', quoteCoin: 'USDT', settleCoin: 'USDT', futureType: 1,
    contractSize: '0.001', priceScale: 2, volScale: 0, amountScale: 4, priceUnit: '0.01', volUnit: '1', state: 0,
    createTime: NOW - 10_000_000, openingTime: 0, ...overrides,
  }
}

function validate(capabilityId: Parameters<typeof validateMexcCapabilityData>[0], value: unknown) {
  const scope = capabilityId === 'contract_metadata_v1'
    ? METADATA_SCOPE
    : capabilityId === 'historical_positions_v1' || capabilityId === 'funding_records_v1'
      ? POSITION_SCOPE
      : HISTORY_SCOPE
  return validateMexcCapabilityData(capabilityId, lossless(value) as MexcJsonValue, scope)
}

function expectOracleCode(operation: () => unknown, code: MexcOracleError['code']) {
  try {
    operation()
    expect.unreachable(`Expected MEXC oracle error ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(MexcOracleError)
    expect((error as MexcOracleError).code).toBe(code)
  }
}

describe('MEXC capability field oracles', () => {
  it('validates current contract metadata only as non-historical reference evidence', () => {
    const result = validate('contract_metadata_v1', metadata({ providerExtension: 'retained_raw_only' }))
    expect(result).toMatchObject({ shape: 'object_v1', status: 'valid_reference_only' })
    expect(result.records).toHaveLength(1)
    expect(result.records[0]?.providerExtension).toBe('retained_raw_only')
  })

  it('validates orders and executions only as incomplete bare-array preview evidence', () => {
    expect(validate('historical_orders_v1', [order()])).toMatchObject({ shape: 'bare_array_v1', status: 'valid_read_preview_only' })
    expect(validate('historical_executions_v3', [execution()])).toMatchObject({ shape: 'bare_array_v1', status: 'valid_read_preview_only' })
  })

  it('validates but blocks non-empty historical position items until provider observation exists', () => {
    expect(validate('historical_positions_v1', [])).toMatchObject({ status: 'valid_read_preview_only' })
    expect(validate('historical_positions_v1', [position()])).toMatchObject({ status: 'blocked_unobserved_position_items' })
  })

  it('validates the observed funding page shape but keeps funding authority blocked', () => {
    const result = validate('funding_records_v1', {
      currentPage: 1,
      pageSize: 20,
      totalCount: 1,
      totalPage: 1,
      resultList: [funding()],
    })
    expect(result).toMatchObject({
      shape: 'page_object_v1',
      status: 'blocked_funding_authority',
      page: { currentPage: 1, pageSize: 20, totalCount: 1, totalPage: 1 },
    })
  })

  it('accepts only the canonical first empty funding page and keeps authority blocked', () => {
    expect(validate('funding_records_v1', {
      currentPage: 1,
      pageSize: 20,
      totalCount: 0,
      totalPage: 0,
      resultList: [],
    })).toMatchObject({
      shape: 'page_object_v1',
      status: 'blocked_funding_authority',
      records: [],
      page: { currentPage: 1, pageSize: 20, totalCount: 0, totalPage: 0 },
    })
  })

  it.each([
    ['contract_metadata_v1', metadata({ settleCoin: null }), 'malformed_response'],
    ['contract_metadata_v1', metadata({ futureType: 9 }), 'malformed_response'],
    ['historical_orders_v1', [order({ side: 9 })], 'malformed_response'],
    ['historical_orders_v1', [order({ createTime: NOW + 1 })], 'scope_violation'],
    ['historical_orders_v1', [order({ feeCurrency: null })], 'malformed_response'],
    ['historical_orders_v1', [order({ symbol: 'btc_usdt' })], 'scope_violation'],
    ['historical_orders_v1', [order({ vol: '-1' })], 'malformed_response'],
    ['historical_orders_v1', [order({ orderId: { kind: 'mexc_json_number', lexeme: '123' } })], 'malformed_response'],
    ['historical_executions_v3', [execution({ positionMode: 3 })], 'malformed_response'],
    ['historical_executions_v3', [execution({ timestamp: String(NOW - 1_500) })], 'malformed_response'],
    ['historical_executions_v3', [execution({ vol: { kind: 'mexc_json_number', lexeme: '2.5' } })], 'malformed_response'],
    ['historical_positions_v1', [position({ positionType: 2 })], 'scope_violation'],
    ['historical_positions_v1', [position({ positionId: null })], 'malformed_response'],
    ['historical_positions_v1', [position({ state: 4 })], 'malformed_response'],
    ['historical_positions_v1', [position({ createTime: NOW + 1 })], 'scope_violation'],
    ['funding_records_v1', { currentPage: 1, pageSize: 20, totalCount: 1, totalPage: 1, resultList: [funding({ id: null })] }, 'malformed_response'],
    ['funding_records_v1', { currentPage: 1, pageSize: 20, totalCount: 1, totalPage: 1, resultList: [funding({ funding: 'NaN' })] }, 'malformed_response'],
    ['funding_records_v1', { currentPage: 1, pageSize: 20, totalCount: 1, totalPage: 1, resultList: [funding({ symbol: 'btc_usdt' })] }, 'scope_violation'],
    ['funding_records_v1', { currentPage: 1, pageSize: 20, totalCount: 1, totalPage: 1, resultList: [funding({ settleTime: NOW + 1 })] }, 'scope_violation'],
  ] as const)('blocks invalid %s item fields with %s', (capabilityId, value, expectedCode) => {
    expectOracleCode(() => validate(capabilityId, value), expectedCode)
  })

  it('blocks increasing provider timestamps and inconsistent funding pages', () => {
    expectOracleCode(() => validate('historical_orders_v1', [
      order({ orderId: '1', createTime: NOW - 2_000 }),
      order({ orderId: '2', createTime: NOW - 1_000 }),
    ]), 'ordering_violation')

    expectOracleCode(() => validate('historical_executions_v3', [
      execution({ id: '1', timestamp: NOW - 2_000 }),
      execution({ id: '2', timestamp: NOW - 1_000 }),
    ]), 'ordering_violation')

    expectOracleCode(() => validate('historical_positions_v1', [
      position({ positionId: '1', createTime: NOW - 2_000 }),
      position({ positionId: '2', createTime: NOW - 1_000 }),
    ]), 'ordering_violation')

    expectOracleCode(() => validate('funding_records_v1', {
      currentPage: 1,
      pageSize: 20,
      totalCount: 2,
      totalPage: 1,
      resultList: [
        funding({ id: '1', settleTime: NOW - 2_000 }),
        funding({ id: '2', settleTime: NOW - 1_000 }),
      ],
    }), 'ordering_violation')

    expectOracleCode(() => validate('funding_records_v1', {
      currentPage: 1,
      pageSize: 20,
      totalCount: 21,
      totalPage: 1,
      resultList: [funding()],
    }), 'malformed_response')

    expectOracleCode(() => validateMexcCapabilityData('funding_records_v1', lossless({
      currentPage: 2,
      pageSize: 20,
      totalCount: 1,
      totalPage: 1,
      resultList: [],
    }) as MexcJsonValue, { ...POSITION_SCOPE, pageNumber: 2 }), 'malformed_response')
  })

  it('blocks overfull bare arrays and incomplete capability scopes', () => {
    expectOracleCode(() => validate('historical_orders_v1', Array.from(
      { length: HISTORY_SCOPE.pageSize + 1 },
      (_, index) => order({ orderId: String(index + 1) }),
    )), 'malformed_response')

    const missingPositionType = { ...HISTORY_SCOPE }
    expectOracleCode(
      () => validateMexcCapabilityData('historical_positions_v1', lossless([]) as MexcJsonValue, missingPositionType),
      'invalid_scope',
    )
    expectOracleCode(
      () => validateMexcCapabilityData('funding_records_v1', lossless({}) as MexcJsonValue, missingPositionType),
      'invalid_scope',
    )
  })

  it('rejects unknown capabilities and irrelevant scope fields at runtime', () => {
    expectOracleCode(
      () => validateMexcCapabilityData('unknown' as never, lossless([]) as MexcJsonValue, HISTORY_SCOPE),
      'invalid_scope',
    )
    expectOracleCode(
      () => validateMexcCapabilityData('contract_metadata_v1', lossless(metadata()) as MexcJsonValue, HISTORY_SCOPE),
      'invalid_scope',
    )
    expectOracleCode(
      () => validateMexcCapabilityData('historical_orders_v1', lossless([]) as MexcJsonValue, POSITION_SCOPE),
      'invalid_scope',
    )
    expectOracleCode(
      () => validateMexcCapabilityData('historical_executions_v3', lossless([]) as MexcJsonValue, POSITION_SCOPE),
      'invalid_scope',
    )
  })

  it('blocks unconfirmed page-object shapes for orders and executions', () => {
    const pageObject = { currentPage: 1, pageSize: 20, totalCount: 0, totalPage: 0, resultList: [] }
    expect(() => validate('historical_orders_v1', pageObject)).toThrow(MexcOracleError)
    expect(() => validate('historical_executions_v3', pageObject)).toThrow(MexcOracleError)
  })
})

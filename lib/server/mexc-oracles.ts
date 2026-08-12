import 'server-only'

import {
  getMexcJsonIntegerLexeme,
  isMexcJsonNumber,
  type MexcJsonObject,
  type MexcJsonValue,
} from '@/lib/server/mexc-json'

export type MexcOracleCapabilityId =
  | 'contract_metadata_v1'
  | 'historical_orders_v1'
  | 'historical_executions_v3'
  | 'historical_positions_v1'
  | 'funding_records_v1'

export type MexcMetadataOracleScope = Readonly<{
  symbol: string
}>

export type MexcHistoryOracleScope = Readonly<{
  symbol: string
  startTime: number
  endTime: number
  pageNumber: number
  pageSize: number
}>

export type MexcPositionOracleScope = MexcHistoryOracleScope & Readonly<{
  positionType: 1 | 2
}>

export type MexcOracleScope = MexcMetadataOracleScope | MexcHistoryOracleScope | MexcPositionOracleScope

export type MexcOracleStatus =
  | 'valid_reference_only'
  | 'valid_read_preview_only'
  | 'blocked_unobserved_position_items'
  | 'blocked_funding_authority'

export type MexcOracleResult = Readonly<{
  capabilityId: MexcOracleCapabilityId
  shape: 'object_v1' | 'bare_array_v1' | 'page_object_v1'
  status: MexcOracleStatus
  records: readonly MexcJsonObject[]
  page: Readonly<{
    currentPage: number
    pageSize: number
    totalCount: number
    totalPage: number
  }> | null
}>

export class MexcOracleError extends Error {
  constructor(
    public readonly code: 'invalid_scope' | 'malformed_response' | 'scope_violation' | 'ordering_violation',
    message: string,
  ) {
    super(message)
    this.name = 'MexcOracleError'
  }
}

const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/
const SYMBOL_PATTERN = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/
const CURRENCY_PATTERN = /^[A-Za-z0-9]{1,20}$/
const MAX_HISTORY_WINDOW_MS = 31 * 24 * 60 * 60 * 1000

function invalidScope(label: string): never {
  throw new MexcOracleError('invalid_scope', `${label} verletzt den capabilitybezogenen MEXC-Scopvertrag.`)
}

function malformed(label: string): never {
  throw new MexcOracleError('malformed_response', `${label} verletzt den capabilitybezogenen MEXC-Feldvertrag.`)
}

function asObject(value: MexcJsonValue, label: string): MexcJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isMexcJsonNumber(value)) malformed(label)
  return value as MexcJsonObject
}

function asObjectArray(value: MexcJsonValue, label: string) {
  if (!Array.isArray(value)) malformed(label)
  return value.map((item, index) => asObject(item, `${label}[${index}]`))
}

function field(record: MexcJsonObject, key: string, label: string) {
  if (!Object.prototype.hasOwnProperty.call(record, key) || record[key] == null) malformed(`${label}.${key}`)
  return record[key] as MexcJsonValue
}

function asProviderId(value: MexcJsonValue, label: string) {
  const raw = typeof value === 'string' ? value : getMexcJsonIntegerLexeme(value)
  if (raw === null || !/^[0-9]+$/.test(raw) || raw.length > 40) malformed(label)
  return raw.replace(/^0+(?=\d)/, '')
}

function asInteger(value: MexcJsonValue, label: string, minimum: number, maximum: number) {
  const lexeme = getMexcJsonIntegerLexeme(value)
  if (lexeme === null) malformed(label)
  const parsed = Number(lexeme)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) malformed(label)
  return parsed
}

function asDecimal(value: MexcJsonValue, label: string) {
  const lexeme = typeof value === 'string' ? value : isMexcJsonNumber(value) ? value.lexeme : null
  if (lexeme === null || lexeme.length > 256 || !DECIMAL_PATTERN.test(lexeme)) malformed(label)
  if (lexeme.startsWith('-') && isZeroDecimal(lexeme)) malformed(label)
  return lexeme
}

function isZeroDecimal(lexeme: string) {
  const mantissa = lexeme.replace(/^-/, '').split(/[eE]/, 1)[0] ?? ''
  return !/[1-9]/.test(mantissa)
}

function asUnsignedDecimal(value: MexcJsonValue, label: string, positive = false) {
  const lexeme = asDecimal(value, label)
  if (lexeme.startsWith('-') || (positive && isZeroDecimal(lexeme))) malformed(label)
  return lexeme
}

function asString(value: MexcJsonValue, label: string) {
  if (typeof value !== 'string' || !value.length || value.length > 128) malformed(label)
  return value
}

function asCurrency(value: MexcJsonValue, label: string) {
  const currency = asString(value, label)
  if (!CURRENCY_PATTERN.test(currency)) malformed(label)
  return currency
}

function asSymbol(value: MexcJsonValue, expectedSymbol: string, label: string) {
  const symbol = asString(value, label)
  if (!SYMBOL_PATTERN.test(symbol) || symbol !== expectedSymbol) {
    throw new MexcOracleError('scope_violation', `${label} liegt außerhalb des angefragten MEXC-Symbolscopes.`)
  }
  return symbol
}

function asUnixMs(value: MexcJsonValue, label: string, allowZero = false) {
  const minimum = allowZero ? 0 : 1_000_000_000_000
  return asInteger(value, label, minimum, 9_999_999_999_999)
}

function assertInScope(timestamp: number, scope: MexcHistoryOracleScope, label: string) {
  if (timestamp < scope.startTime || timestamp > scope.endTime) {
    throw new MexcOracleError('scope_violation', `${label} liegt außerhalb des angefragten MEXC-Zeitfensters.`)
  }
}

function assertNonIncreasing(timestamps: readonly number[], label: string) {
  for (let index = 1; index < timestamps.length; index += 1) {
    if ((timestamps[index] ?? 0) > (timestamps[index - 1] ?? 0)) {
      throw new MexcOracleError('ordering_violation', `${label} ist nicht in der erwarteten nichtzunehmenden Providerreihenfolge.`)
    }
  }
}

function exactScopeRecord(scope: MexcOracleScope, keys: readonly string[], label: string) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) invalidScope(label)
  const record = scope as Readonly<Record<string, unknown>>
  const actualKeys = Object.keys(record).sort()
  const expectedKeys = [...keys].sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    invalidScope(label)
  }
  return record
}

function validateMetadataScope(scope: MexcOracleScope): MexcMetadataOracleScope {
  const record = exactScopeRecord(scope, ['symbol'], 'contract_metadata_v1.scope')
  if (typeof record.symbol !== 'string' || !SYMBOL_PATTERN.test(record.symbol)) invalidScope('contract_metadata_v1.symbol')
  return Object.freeze({ symbol: record.symbol })
}

function validateHistoryScope(
  capabilityId: Exclude<MexcOracleCapabilityId, 'contract_metadata_v1'>,
  scope: MexcOracleScope,
  requirePositionType: boolean,
): MexcHistoryOracleScope | MexcPositionOracleScope {
  const keys = ['symbol', 'startTime', 'endTime', 'pageNumber', 'pageSize']
  if (requirePositionType) keys.push('positionType')
  const record = exactScopeRecord(scope, keys, `${capabilityId}.scope`)
  if (typeof record.symbol !== 'string' || !SYMBOL_PATTERN.test(record.symbol)) invalidScope(`${capabilityId}.symbol`)
  const startTime = record.startTime
  const endTime = record.endTime
  if (
    !Number.isSafeInteger(startTime)
    || !Number.isSafeInteger(endTime)
    || (startTime as number) < 1_000_000_000_000
    || (endTime as number) > 9_999_999_999_999
    || (startTime as number) > (endTime as number)
    || (endTime as number) - (startTime as number) > MAX_HISTORY_WINDOW_MS
  ) invalidScope(`${capabilityId}.timeWindow`)
  const pageNumber = record.pageNumber
  const pageSize = record.pageSize
  if (!Number.isSafeInteger(pageNumber) || (pageNumber as number) < 1 || (pageNumber as number) > 10_000) {
    invalidScope(`${capabilityId}.pageNumber`)
  }
  const maximumPageSize = capabilityId === 'historical_executions_v3' ? 1000 : 100
  if (!Number.isSafeInteger(pageSize) || (pageSize as number) < 1 || (pageSize as number) > maximumPageSize) {
    invalidScope(`${capabilityId}.pageSize`)
  }
  const historyScope: MexcHistoryOracleScope = Object.freeze({
    symbol: record.symbol,
    startTime: startTime as number,
    endTime: endTime as number,
    pageNumber: pageNumber as number,
    pageSize: pageSize as number,
  })
  if (!requirePositionType) return historyScope
  if (record.positionType !== 1 && record.positionType !== 2) invalidScope(`${capabilityId}.positionType`)
  return Object.freeze({ ...historyScope, positionType: record.positionType })
}

function optionalBoolean(record: MexcJsonObject, key: string, label: string) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return
  if (typeof record[key] !== 'boolean') malformed(`${label}.${key}`)
}

function validateMetadata(data: MexcJsonValue, scope: MexcMetadataOracleScope): MexcOracleResult {
  const record = asObject(data, 'Contract Metadata')
  asSymbol(field(record, 'symbol', 'Contract Metadata'), scope.symbol, 'Contract Metadata.symbol')
  asCurrency(field(record, 'baseCoin', 'Contract Metadata'), 'Contract Metadata.baseCoin')
  asCurrency(field(record, 'quoteCoin', 'Contract Metadata'), 'Contract Metadata.quoteCoin')
  asCurrency(field(record, 'settleCoin', 'Contract Metadata'), 'Contract Metadata.settleCoin')
  asInteger(field(record, 'futureType', 'Contract Metadata'), 'Contract Metadata.futureType', 1, 2)
  asUnsignedDecimal(field(record, 'contractSize', 'Contract Metadata'), 'Contract Metadata.contractSize', true)
  asInteger(field(record, 'priceScale', 'Contract Metadata'), 'Contract Metadata.priceScale', 0, 18)
  asInteger(field(record, 'volScale', 'Contract Metadata'), 'Contract Metadata.volScale', 0, 18)
  asInteger(field(record, 'amountScale', 'Contract Metadata'), 'Contract Metadata.amountScale', 0, 18)
  asUnsignedDecimal(field(record, 'priceUnit', 'Contract Metadata'), 'Contract Metadata.priceUnit', true)
  asUnsignedDecimal(field(record, 'volUnit', 'Contract Metadata'), 'Contract Metadata.volUnit', true)
  asInteger(field(record, 'state', 'Contract Metadata'), 'Contract Metadata.state', 0, 4)
  asUnixMs(field(record, 'createTime', 'Contract Metadata'), 'Contract Metadata.createTime')
  asUnixMs(field(record, 'openingTime', 'Contract Metadata'), 'Contract Metadata.openingTime', true)
  asProviderId(field(record, 'id', 'Contract Metadata'), 'Contract Metadata.id')
  return Object.freeze({ capabilityId: 'contract_metadata_v1', shape: 'object_v1', status: 'valid_reference_only', records: Object.freeze([record]), page: null })
}

function validateOrder(record: MexcJsonObject, scope: MexcHistoryOracleScope, index: number) {
  const label = `Historical Orders[${index}]`
  asProviderId(field(record, 'orderId', label), `${label}.orderId`)
  asProviderId(field(record, 'positionId', label), `${label}.positionId`)
  asSymbol(field(record, 'symbol', label), scope.symbol, `${label}.symbol`)
  asInteger(field(record, 'side', label), `${label}.side`, 1, 4)
  asInteger(field(record, 'positionMode', label), `${label}.positionMode`, 1, 2)
  asInteger(field(record, 'state', label), `${label}.state`, 1, 5)
  asInteger(field(record, 'category', label), `${label}.category`, 1, 4)
  if (Object.prototype.hasOwnProperty.call(record, 'orderType')) asInteger(field(record, 'orderType', label), `${label}.orderType`, 1, 5)
  for (const key of ['vol', 'dealVol', 'price', 'dealAvgPrice'] as const) asUnsignedDecimal(field(record, key, label), `${label}.${key}`)
  for (const key of ['takerFee', 'makerFee', 'profit'] as const) asDecimal(field(record, key, label), `${label}.${key}`)
  asCurrency(field(record, 'feeCurrency', label), `${label}.feeCurrency`)
  const createTime = asUnixMs(field(record, 'createTime', label), `${label}.createTime`)
  const updateTime = asUnixMs(field(record, 'updateTime', label), `${label}.updateTime`)
  assertInScope(createTime, scope, `${label}.createTime`)
  if (updateTime < createTime) malformed(`${label}.updateTime`)
  return createTime
}

function validateExecution(record: MexcJsonObject, scope: MexcHistoryOracleScope, index: number) {
  const label = `Historical Executions[${index}]`
  asProviderId(field(record, 'id', label), `${label}.id`)
  asProviderId(field(record, 'orderId', label), `${label}.orderId`)
  asSymbol(field(record, 'symbol', label), scope.symbol, `${label}.symbol`)
  asInteger(field(record, 'side', label), `${label}.side`, 1, 4)
  asInteger(field(record, 'positionMode', label), `${label}.positionMode`, 1, 2)
  asInteger(field(record, 'category', label), `${label}.category`, 1, 4)
  for (const key of ['vol', 'price'] as const) asUnsignedDecimal(field(record, key, label), `${label}.${key}`)
  for (const key of ['fee', 'profit'] as const) asDecimal(field(record, key, label), `${label}.${key}`)
  asCurrency(field(record, 'feeCurrency', label), `${label}.feeCurrency`)
  optionalBoolean(record, 'taker', label)
  const timestamp = asUnixMs(field(record, 'timestamp', label), `${label}.timestamp`)
  assertInScope(timestamp, scope, `${label}.timestamp`)
  return timestamp
}

function validatePosition(record: MexcJsonObject, scope: MexcPositionOracleScope, index: number) {
  const label = `Historical Positions[${index}]`
  asProviderId(field(record, 'positionId', label), `${label}.positionId`)
  asSymbol(field(record, 'symbol', label), scope.symbol, `${label}.symbol`)
  const positionType = asInteger(field(record, 'positionType', label), `${label}.positionType`, 1, 2)
  if (positionType !== scope.positionType) throw new MexcOracleError('scope_violation', `${label}.positionType liegt außerhalb des angefragten Scopes.`)
  asInteger(field(record, 'openType', label), `${label}.openType`, 1, 2)
  asInteger(field(record, 'state', label), `${label}.state`, 1, 3)
  for (const key of ['holdVol', 'closeVol', 'openAvgPrice', 'closeAvgPrice'] as const) asUnsignedDecimal(field(record, key, label), `${label}.${key}`)
  for (const key of ['holdFee', 'closeProfitLoss', 'realised', 'fee', 'totalFee'] as const) asDecimal(field(record, key, label), `${label}.${key}`)
  const createTime = asUnixMs(field(record, 'createTime', label), `${label}.createTime`)
  const updateTime = asUnixMs(field(record, 'updateTime', label), `${label}.updateTime`)
  assertInScope(createTime, scope, `${label}.createTime`)
  if (updateTime < createTime) malformed(`${label}.updateTime`)
  return createTime
}

function validateFunding(record: MexcJsonObject, scope: MexcPositionOracleScope, index: number) {
  const label = `Funding Records[${index}]`
  asProviderId(field(record, 'id', label), `${label}.id`)
  asSymbol(field(record, 'symbol', label), scope.symbol, `${label}.symbol`)
  const positionType = asInteger(field(record, 'positionType', label), `${label}.positionType`, 1, 2)
  if (positionType !== scope.positionType) throw new MexcOracleError('scope_violation', `${label}.positionType liegt außerhalb des angefragten Scopes.`)
  asUnsignedDecimal(field(record, 'positionValue', label), `${label}.positionValue`)
  for (const key of ['funding', 'rate'] as const) asDecimal(field(record, key, label), `${label}.${key}`)
  const settleTime = asUnixMs(field(record, 'settleTime', label), `${label}.settleTime`)
  assertInScope(settleTime, scope, `${label}.settleTime`)
  return settleTime
}

function bareArrayResult(
  capabilityId: 'historical_orders_v1' | 'historical_executions_v3' | 'historical_positions_v1',
  data: MexcJsonValue,
  scope: MexcHistoryOracleScope | MexcPositionOracleScope,
): MexcOracleResult {
  const records = asObjectArray(data, capabilityId)
  if (records.length > scope.pageSize) malformed(`${capabilityId}.pageSize`)
  const timestamps = capabilityId === 'historical_orders_v1'
    ? records.map((record, index) => validateOrder(record, scope, index))
    : capabilityId === 'historical_executions_v3'
      ? records.map((record, index) => validateExecution(record, scope, index))
      : records.map((record, index) => validatePosition(record, scope as MexcPositionOracleScope, index))
  assertNonIncreasing(timestamps, capabilityId)
  return Object.freeze({
    capabilityId,
    shape: 'bare_array_v1',
    status: capabilityId === 'historical_positions_v1' && records.length
      ? 'blocked_unobserved_position_items'
      : 'valid_read_preview_only',
    records: Object.freeze(records),
    page: null,
  })
}

function fundingResult(data: MexcJsonValue, scope: MexcPositionOracleScope): MexcOracleResult {
  const pageObject = asObject(data, 'Funding Records')
  const currentPage = asInteger(field(pageObject, 'currentPage', 'Funding Records'), 'Funding Records.currentPage', 0, 2_147_483_647)
  const pageSize = asInteger(field(pageObject, 'pageSize', 'Funding Records'), 'Funding Records.pageSize', 1, 100)
  const totalCount = asInteger(field(pageObject, 'totalCount', 'Funding Records'), 'Funding Records.totalCount', 0, 2_147_483_647)
  const totalPage = asInteger(field(pageObject, 'totalPage', 'Funding Records'), 'Funding Records.totalPage', 0, 2_147_483_647)
  const records = asObjectArray(field(pageObject, 'resultList', 'Funding Records'), 'Funding Records.resultList')
  if (currentPage !== scope.pageNumber || pageSize !== scope.pageSize || records.length > pageSize || totalCount < records.length) malformed('Funding Records.page')
  const expectedTotalPage = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize)
  const canonicalEmptyPage = totalCount === 0 && totalPage === 0 && currentPage === 1 && records.length === 0
  if (totalPage !== expectedTotalPage || !canonicalEmptyPage && currentPage > totalPage) malformed('Funding Records.totalPage')
  const timestamps = records.map((record, index) => validateFunding(record, scope, index))
  assertNonIncreasing(timestamps, 'Funding Records')
  return Object.freeze({
    capabilityId: 'funding_records_v1',
    shape: 'page_object_v1',
    status: 'blocked_funding_authority',
    records: Object.freeze(records),
    page: Object.freeze({ currentPage, pageSize, totalCount, totalPage }),
  })
}

export function validateMexcCapabilityData(
  capabilityId: MexcOracleCapabilityId,
  data: MexcJsonValue,
  scope: MexcOracleScope,
): MexcOracleResult {
  switch (capabilityId) {
    case 'contract_metadata_v1':
      return validateMetadata(data, validateMetadataScope(scope))
    case 'historical_orders_v1':
    case 'historical_executions_v3':
      return bareArrayResult(capabilityId, data, validateHistoryScope(capabilityId, scope, false))
    case 'historical_positions_v1':
      return bareArrayResult(capabilityId, data, validateHistoryScope(capabilityId, scope, true) as MexcPositionOracleScope)
    case 'funding_records_v1':
      return fundingResult(data, validateHistoryScope(capabilityId, scope, true) as MexcPositionOracleScope)
    default:
      return invalidScope('unknown_capability')
  }
}

import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-ignore The shared validator is intentionally JavaScript and has no declaration file.
import { assertNoDuplicateJsonObjectKeys, probableSecretClasses as broadSecretScanner } from '../scripts/multibroker-mb4-validation-lib.mjs'

type JsonObject = Record<string, unknown>

type Capability = JsonObject & {
  capability_id: string
  capability_kind: string
  descriptor_version: string
  capability_descriptor_sha256: string
  method: string
  https_origin: string
  port: number
  path: string
  canonical_query: string
  permission: string
  response_byte_limit: number
  request_timeout_ms: number
  in_minimal_probe: boolean
  support_state: string
  import_eligibility: string
  pagination_contract: JsonObject
  response_contract: JsonObject
}

type ProbeRequest = JsonObject & {
  sequence: number
  request_id: string
  capability_id: string
  path_with_canonical_query: string
  max_pages: number
}

type PositiveCase = JsonObject & {
  case_id: string
  capability_id: string
  synthetic: boolean
  account_position_mode?: string
  request_context?: {
    window_start_ms: string
    window_end_ms: string
    response_record_limit: number
  }
  authority?: {
    authorized_egress_ip_set: string[]
    authorized_egress_ip_set_sha256: string
  }
  response: {
    http_status: number
    body: {
      code: string
      msg: string
      data: JsonObject[]
    }
  }
  expected: JsonObject
}

type NegativeCase = JsonObject & {
  case_id: string
  synthetic: boolean
  mutation: string
  input: JsonObject
  expected_error: string
}

const root = process.cwd()
const profilePath = resolve(root, 'docs/architecture/EQUORA_v57.61.0_OKX_CAPABILITY_AND_PROBE_PROFILE.json')
const decisionPath = resolve(root, 'docs/decisions/EQUORA_v57.61.0_MB5_OKX_PROVIDER_DECISION.md')
const contractPath = resolve(root, 'docs/architecture/EQUORA_v57.61.0_OKX_PROVIDER_CONTRACT.md')
const fixturePath = resolve(root, 'tests/fixtures/okx/mb5-read-contract-fixtures.json')
const testPath = resolve(root, 'tests/okx-mb5-contract.test.ts')
const corePath = resolve(root, 'lib/server/broker-core-contracts.ts')
const registryPath = resolve(root, 'lib/server/broker-code-registry.ts')
const validatorDependencyPath = resolve(root, 'scripts/multibroker-mb4-validation-lib.mjs')

const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as JsonObject & {
  decision: JsonObject
  official_sources: JsonObject[]
  authority_boundary: JsonObject
  legal_product_gate: JsonObject
  region_profiles: {
    selected_candidate: JsonObject & {
      profile_id: string
      https_origin: string
      port: number
      environment: string
      required_constant_headers: Record<string, string>
      fallback_origins: string[]
      status: string
    }
  }
  credential_contract: JsonObject
  identity_contract: JsonObject
  signing_contract: JsonObject
  single_use_permit_contract: JsonObject
  response_envelope_contract: JsonObject
  capabilities: Capability[]
  minimal_probe_profile: JsonObject & {
    profile_id: string
    profile_version: string
    profile_digest_sha256: string
    status: string
    environment: string
    region_profile_id: string
    https_origin: string
    port: number
    method: string
    redirect_mode: string
    required_constant_headers: Record<string, string>
    request_sequence: ProbeRequest[]
    budget: Record<string, number>
    required_pre_request_authority_pins: string[]
    required_post_response_observations: string[]
    aggregate_comparison_requirements: string[]
    success_requirements: string[]
    missing_runtime_authority: boolean
    missing_credentials: boolean
    missing_identity_authority: boolean
    missing_window_authority: boolean
    missing_single_use_permits: boolean
  }
  pagination_and_completeness: JsonObject
  financial_semantics: JsonObject
  explicitly_forbidden: JsonObject & {
    methods: string[]
    read_semantic_post: JsonObject
    operation_classes: string[]
  }
  claim_contract: JsonObject & {
    allowed_after_future_successful_probe: string[]
    forbidden: string[]
    local_mb5_pass_meaning: string
  }
  hash_contract: JsonObject
}

const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as JsonObject & {
  positive_cases: PositiveCase[]
  negative_cases: NegativeCase[]
}

const decision = readFileSync(decisionPath, 'utf8')
const contract = readFileSync(contractPath, 'utf8')
const core = readFileSync(corePath, 'utf8')
const registry = readFileSync(registryPath, 'utf8')

function codePointCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non_canonical_number')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (!value || typeof value !== 'object') throw new Error('non_canonical_value')
  const entries = Object.entries(value as JsonObject).sort(([left], [right]) => codePointCompare(left, right))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
}

function sha256Canonical(value: unknown) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

function withoutKey<T extends JsonObject>(value: T, key: string) {
  const copy = structuredClone(value)
  delete copy[key]
  return copy
}

function positiveCase(caseId: string) {
  const fixture = fixtures.positive_cases.find((entry) => entry.case_id === caseId)
  if (!fixture) throw new Error(`missing_fixture:${caseId}`)
  return fixture
}

const DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/

function validDecimal(value: unknown, allowNegative = true) {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) return false
  if (/^-0(?:\.0+)?$/.test(value)) return false
  const unsigned = value.startsWith('-') ? value.slice(1) : value
  const [integer, fraction = ''] = unsigned.split('.')
  if (integer.length > 38 || fraction.length > 18) return false
  if (!allowNegative && value.startsWith('-')) return false
  return true
}

function decimalParts(value: string) {
  if (!validDecimal(value)) throw new Error('provider_decimal_rejected')
  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const [integer, fraction = ''] = unsigned.split('.')
  const digits = BigInt(`${integer}${fraction}`)
  return { coefficient: negative ? -digits : digits, scale: fraction.length }
}

function power10(exponent: number) {
  return BigInt(10) ** BigInt(exponent)
}

function formatDecimal(coefficient: bigint, scale: number) {
  if (coefficient === BigInt(0)) return '0'
  const negative = coefficient < BigInt(0)
  let digits = (negative ? -coefficient : coefficient).toString()
  if (scale > 0) digits = digits.padStart(scale + 1, '0')
  const integer = scale > 0 ? digits.slice(0, -scale) : digits
  const fraction = scale > 0 ? digits.slice(-scale).replace(/0+$/, '') : ''
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`
}

function addDecimals(values: string[]) {
  const parsed = values.map(decimalParts)
  const scale = Math.max(...parsed.map((entry) => entry.scale))
  const coefficient = parsed.reduce(
    (sum, entry) => sum + entry.coefficient * power10(scale - entry.scale),
    BigInt(0),
  )
  return formatDecimal(coefficient, scale)
}

function multiplyDecimals(values: string[]) {
  const parsed = values.map(decimalParts)
  const scale = parsed.reduce((sum, entry) => sum + entry.scale, 0)
  const coefficient = parsed.reduce((product, entry) => product * entry.coefficient, BigInt(1))
  return formatDecimal(coefficient, scale)
}

function decimalEquals(left: string, right: string) {
  const leftParts = decimalParts(left)
  const rightParts = decimalParts(right)
  const scale = Math.max(leftParts.scale, rightParts.scale)
  const leftCoefficient = leftParts.coefficient * power10(scale - leftParts.scale)
  const rightCoefficient = rightParts.coefficient * power10(scale - rightParts.scale)
  return leftCoefficient === rightCoefficient
}

function validateEnvelope(candidate: unknown): 'success' | 'provider_error_not_empty_success' | 'provider_response_contract_rejected' {
  if (!candidate || typeof candidate !== 'object') return 'provider_response_contract_rejected'
  const response = candidate as { http_status?: unknown; body?: unknown }
  if (typeof response.http_status !== 'number' || response.http_status < 200 || response.http_status >= 300) {
    return 'provider_response_contract_rejected'
  }
  if (!response.body || typeof response.body !== 'object' || Array.isArray(response.body)) {
    return 'provider_response_contract_rejected'
  }
  const body = response.body as JsonObject
  if (Object.keys(body).sort(codePointCompare).join(',') !== 'code,data,msg') return 'provider_response_contract_rejected'
  if (typeof body.code !== 'string' || typeof body.msg !== 'string' || !Array.isArray(body.data)) {
    return 'provider_response_contract_rejected'
  }
  if (body.code !== '0' || body.msg !== '') return 'provider_error_not_empty_success'
  return 'success'
}

function validPermissionTokens(value: unknown) {
  if (typeof value !== 'string' || value.length === 0) return false
  const tokens = value.split(',')
  return tokens.length === 1 && tokens[0] === 'read_only'
}

function decimalCompare(left: string, right: string) {
  const leftParts = decimalParts(left)
  const rightParts = decimalParts(right)
  const scale = Math.max(leftParts.scale, rightParts.scale)
  const leftCoefficient = leftParts.coefficient * power10(scale - leftParts.scale)
  const rightCoefficient = rightParts.coefficient * power10(scale - rightParts.scale)
  return leftCoefficient < rightCoefficient ? -1 : leftCoefficient > rightCoefficient ? 1 : 0
}

function strictlyPositiveDecimal(value: unknown) {
  return typeof value === 'string' && validDecimal(value, false) && decimalCompare(value, '0') > 0
}

function nonnegativeDecimal(value: unknown) {
  return typeof value === 'string' && validDecimal(value, false) && decimalCompare(value, '0') >= 0
}

function positiveDigitId(value: unknown) {
  return typeof value === 'string' && /^[1-9][0-9]*$/.test(value)
}

function unixMilliseconds(value: unknown) {
  return typeof value === 'string' && /^[0-9]{13}$/.test(value)
}

function canonicalUtcInstant(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return null
  return milliseconds
}

function canonicalIpEntry(value: string) {
  const version = isIP(value)
  if (version === 4) return value.split('.').map((entry) => String(Number(entry))).join('.')
  if (version === 6) return new URL(`http://[${value.toLowerCase()}]/`).hostname.slice(1, -1)
  return null
}

function prohibitedEgressIp(value: string) {
  if (value === '0.0.0.0' || value === '::' || value === '::1' || value.startsWith('::ffff:')) return true
  if (value.startsWith('127.') || value.startsWith('169.254.')) return true
  if (/^(?:10\.|192\.168\.)/.test(value)) return true
  const ipv4 = value.split('.').map(Number)
  if (ipv4.length === 4 && ((ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) || (ipv4[0] === 100 && ipv4[1] >= 64 && ipv4[1] <= 127) || ipv4[0] >= 224)) return true
  return /^(?:fc|fd|fe[89ab]|ff)/i.test(value)
}

function canonicalIpSet(value: unknown) {
  if (typeof value !== 'string' || value.length === 0) return null
  const rawEntries = value.split(',').map((entry) => entry.replace(/^ +| +$/g, ''))
  if (rawEntries.some((entry) => entry.length === 0)) return null
  const entries = rawEntries.map(canonicalIpEntry)
  if (entries.some((entry) => entry === null)) return null
  const canonical = entries as string[]
  if (canonical.some(prohibitedEgressIp) || new Set(canonical).size !== canonical.length) return null
  return canonical.sort(codePointCompare)
}

function ipSetDigest(entries: string[]) {
  return createHash('sha256').update(entries.join(','), 'utf8').digest('hex')
}

function validateExactProjection(capabilityId: string, record: JsonObject) {
  const capability = profile.capabilities.find((entry) => entry.capability_id === capabilityId)
  const responseContract = capability?.response_contract as JsonObject | undefined
  const expected = responseContract?.exact_projection_fields
  if (!Array.isArray(expected) || !expected.every((entry) => typeof entry === 'string')) {
    return 'provider_response_contract_missing'
  }
  const actual = Object.keys(record).sort(codePointCompare)
  return actual.join(',') === [...expected].sort(codePointCompare).join(',')
    ? 'accepted'
    : 'provider_record_shape_rejected'
}

function validateIpBinding(value: unknown, authority: PositiveCase['authority']) {
  if (value === '') return 'provider_ip_allowlist_required'
  const providerSet = canonicalIpSet(value)
  if (!providerSet) return 'provider_ip_allowlist_invalid'
  if (!authority) return 'provider_egress_authority_missing'
  const expectedSet = canonicalIpSet(authority.authorized_egress_ip_set.join(','))
  if (!expectedSet || ipSetDigest(expectedSet) !== authority.authorized_egress_ip_set_sha256) {
    return 'provider_egress_authority_invalid'
  }
  return ipSetDigest(providerSet) === authority.authorized_egress_ip_set_sha256
    ? 'accepted'
    : 'provider_ip_allowlist_mismatch'
}

function validateAccountConfigRecord(record: JsonObject, authority: PositiveCase['authority']) {
  const shape = validateExactProjection('okx_account_config_v1', record)
  if (shape !== 'accepted') return shape
  if (!positiveDigitId(record.uid) || !positiveDigitId(record.mainUid)) return 'account_identity_not_observed'
  if (!['1', '2', '3', '4'].includes(String(record.acctLv))) return 'provider_account_mode_rejected'
  if (!['net_mode', 'long_short_mode'].includes(String(record.posMode))) return 'provider_enum_unknown'
  if (!validPermissionTokens(record.perm)) return 'provider_permission_scope_rejected'
  return validateIpBinding(record.ip, authority)
}

function accountConfigExpected(record: JsonObject, authority: NonNullable<PositiveCase['authority']>) {
  const validation = validateAccountConfigRecord(record, authority)
  if (validation !== 'accepted') throw new Error(validation)
  return {
    account_class: record.uid === record.mainUid ? 'main' : 'subaccount',
    position_mode: record.posMode,
    identity_source_field: 'uid',
    permission_status: 'provider_reported_read_only_observed',
    ip_allowlist_status: 'provider_reported_exact_authorized_egress_match',
    authorized_egress_ip_set_sha256: authority.authorized_egress_ip_set_sha256,
    raw_identity_must_not_persist: true,
    raw_ip_must_not_persist: true,
  }
}

const baseInstrument: JsonObject = {
  instId: 'AAA-USDT-SWAP',
  instType: 'SWAP',
  instFamily: 'AAA-USDT',
  settleCcy: 'USDT',
  ctType: 'linear',
  ctVal: '0.01',
  ctMult: '10',
  ctValCcy: 'AAA',
  lotSz: '1',
  tickSz: '0.1',
  state: 'live',
}

function validateSelectedInstrumentIdentity(record: JsonObject) {
  if (typeof record.instId !== 'string' || !/^([A-Z0-9]+)-USDT-SWAP$/.test(record.instId)) {
    return 'provider_contract_class_out_of_scope'
  }
  const baseCurrency = record.instId.split('-')[0]
  if (record.instFamily !== `${baseCurrency}-USDT` || record.ctValCcy !== baseCurrency) {
    return 'provider_quantity_semantics_blocked'
  }
  return 'accepted'
}

function validateInstrumentBaseProjection(record: JsonObject) {
  const shape = validateExactProjection('okx_account_instruments_swap_v1', record)
  if (shape !== 'accepted') return shape
  if (Object.values(record).some((value) => typeof value !== 'string')) return 'provider_record_shape_rejected'
  if (record.instType !== 'SWAP') return 'provider_contract_class_out_of_scope'
  return 'accepted'
}

function selectedInstrumentRows(rows: JsonObject[]) {
  return rows.filter((record) => record.settleCcy === 'USDT' && record.ctType === 'linear')
}

function validateInstrument(record: JsonObject) {
  const base = validateInstrumentBaseProjection(record)
  if (base !== 'accepted') return base
  if (record.settleCcy !== 'USDT' || record.ctType !== 'linear') return 'provider_contract_class_out_of_scope'
  const identity = validateSelectedInstrumentIdentity(record)
  if (identity !== 'accepted') return identity
  if (![record.ctVal, record.ctMult, record.lotSz, record.tickSz].every(strictlyPositiveDecimal)) {
    return 'provider_quantity_semantics_blocked'
  }
  if (record.state !== 'live') return 'provider_instrument_state_rejected'
  return 'accepted'
}

function instrumentExpected(rows: JsonObject[]) {
  const validation = validateCapabilityRows('okx_account_instruments_swap_v1', rows)
  if (validation !== 'accepted') throw new Error(validation)
  const selected = selectedInstrumentRows(rows)
  return {
    eligible_instrument_ids: selected.map((record) => String(record.instId)),
    eligible_instrument_count: selected.length,
    filtered_out_record_count: rows.length - selected.length,
    instrument_contracts: selected.map((record) => ({
      instId: String(record.instId),
      eligible_for_selected_contract_class: true,
      size_unit: 'contracts',
      base_quantity_for_size_3: multiplyDecimals(['3', String(record.ctVal), String(record.ctMult)]),
      settlement_currency: 'USDT',
    })),
  }
}

function validatePositionSemantics(input: JsonObject) {
  if ('pos' in input) return 'provider_position_history_shape_rejected'
  const mode = String(input.posMode)
  const side = String(input.posSide)
  const direction = String(input.direction)
  if (!['net_mode', 'long_short_mode'].includes(mode)) return 'provider_enum_unknown'
  if (mode === 'net_mode' && (side !== 'net' || !['long', 'short'].includes(direction))) {
    return 'provider_position_semantics_rejected'
  }
  if (mode === 'long_short_mode' && (!['long', 'short'].includes(side) || side !== direction)) {
    return 'provider_position_semantics_rejected'
  }
  return 'accepted'
}

const PNL_DECIMAL_FIELDS = ['realizedPnl', 'pnl', 'fee', 'fundingFee', 'liqPenalty'] as const

type SettledPnlResult =
  | { value: string; provider_state: string; error?: never }
  | { error: string; value?: never; provider_state?: never }

function normalizedSettledPnl(record: JsonObject): SettledPnlResult {
  if (!Object.prototype.hasOwnProperty.call(record, 'settledPnl')) return { error: 'provider_realized_pnl_components_missing' }
  if (record.instType === 'SWAP') {
    return record.settledPnl === ''
      ? { value: '0', provider_state: 'not_applicable_empty' }
      : { error: 'provider_settled_pnl_semantics_rejected' }
  }
  if (record.instType === 'FUTURES' && record.mgnMode === 'cross') {
    return validDecimal(record.settledPnl)
      ? { value: String(record.settledPnl), provider_state: 'applicable_decimal' }
      : { error: 'provider_settled_pnl_semantics_rejected' }
  }
  return { error: 'provider_settled_pnl_semantics_rejected' }
}

function validatePositionPnl(record: JsonObject): string {
  if (PNL_DECIMAL_FIELDS.some((field) => !validDecimal(record[field]))) return 'provider_realized_pnl_components_missing'
  const settled = normalizedSettledPnl(record)
  if (settled.error) return settled.error
  const computed = addDecimals([
    String(record.pnl),
    String(record.fee),
    String(record.fundingFee),
    String(record.liqPenalty),
    settled.value!,
  ])
  return decimalEquals(computed, String(record.realizedPnl))
    ? 'accepted'
    : 'provider_realized_pnl_invariant_rejected'
}

function validateInstrumentReference(record: JsonObject) {
  return record.instType === 'SWAP' && typeof record.instId === 'string' && /^[A-Z0-9]+-USDT-SWAP$/.test(record.instId)
    ? 'accepted'
    : 'provider_contract_class_out_of_scope'
}

function validateCapabilityRows(
  capabilityId: string,
  rows: JsonObject[],
  fixture?: PositiveCase,
  requestContext: PositiveCase['request_context'] = fixture?.request_context,
): string {
  if (capabilityId === 'okx_account_config_v1') {
    if (rows.length !== 1) return 'account_config_cardinality_rejected'
    return validateAccountConfigRecord(rows[0], fixture?.authority)
  }
  if (capabilityId === 'okx_account_instruments_swap_v1') {
    for (const row of rows) {
      const base = validateInstrumentBaseProjection(row)
      if (base !== 'accepted') return base
    }
    const selected = selectedInstrumentRows(rows)
    if (selected.length === 0) return 'provider_instrument_filter_empty'
    const ids: string[] = []
    for (const row of selected) {
      const validation = validateInstrument(row)
      if (validation !== 'accepted') return validation
      ids.push(String(row.instId))
    }
    return new Set(ids).size === ids.length ? 'accepted' : 'provider_event_identity_blocked'
  }
  if (capabilityId === 'okx_orders_archive_swap_v1') {
    const ids: string[] = []
    for (const row of rows) {
      const shape = validateExactProjection(capabilityId, row)
      if (shape !== 'accepted') return shape
      if (validateInstrumentReference(row) !== 'accepted') return 'provider_contract_class_out_of_scope'
      if (!positiveDigitId(row.ordId)) return 'provider_event_identity_blocked'
      if (!['filled', 'canceled', 'mmp_canceled'].includes(String(row.state)) || !['buy', 'sell'].includes(String(row.side)) || !['net', 'long', 'short'].includes(String(row.posSide))) return 'provider_enum_unknown'
      if (![row.sz, row.accFillSz, row.avgPx].every(strictlyPositiveDecimal) || decimalCompare(String(row.accFillSz), String(row.sz)) > 0) return 'provider_quantity_semantics_blocked'
      if (!unixMilliseconds(row.cTime) || !unixMilliseconds(row.uTime) || BigInt(String(row.uTime)) < BigInt(String(row.cTime))) return 'provider_timestamp_rejected'
      ids.push(String(row.ordId))
    }
    return new Set(ids).size === ids.length ? 'accepted' : 'provider_event_identity_blocked'
  }
  if (capabilityId === 'okx_fills_history_swap_v1') {
    if (!requestContext) return 'provider_response_window_context_missing'
    if (!unixMilliseconds(requestContext.window_start_ms) || !unixMilliseconds(requestContext.window_end_ms)) {
      return 'provider_response_window_context_rejected'
    }
    const windowStart = BigInt(requestContext.window_start_ms)
    const windowEnd = BigInt(requestContext.window_end_ms)
    if (windowStart > windowEnd || windowEnd - windowStart > BigInt(604800000)) {
      return 'provider_response_window_context_rejected'
    }
    if (!Number.isSafeInteger(requestContext.response_record_limit) || requestContext.response_record_limit !== 10) {
      return 'provider_response_record_limit_context_rejected'
    }
    if (rows.length > requestContext.response_record_limit) return 'provider_response_record_limit_exceeded'
    if (rows.length === 0) return 'accepted'
    const tradeIds: string[] = []
    const billIds: string[] = []
    for (const row of rows) {
      const shape = validateExactProjection(capabilityId, row)
      if (shape !== 'accepted') return shape
      if (validateInstrumentReference(row) !== 'accepted') return 'provider_contract_class_out_of_scope'
      if (![row.tradeId, row.billId, row.ordId].every(positiveDigitId)) return 'provider_event_identity_blocked'
      if (!['buy', 'sell'].includes(String(row.side)) || !['net', 'long', 'short'].includes(String(row.posSide))) return 'provider_enum_unknown'
      if (!strictlyPositiveDecimal(row.fillSz) || !strictlyPositiveDecimal(row.fillPx)) return 'provider_quantity_semantics_blocked'
      if (!validDecimal(row.fee) || !validDecimal(row.fillPnl) || row.feeCcy !== 'USDT') return 'provider_financial_event_mapping_blocked'
      if (!unixMilliseconds(row.fillTime) || !unixMilliseconds(row.ts)) return 'provider_timestamp_rejected'
      const filterClock = BigInt(String(row.ts))
      if (filterClock < windowStart || filterClock > windowEnd) return 'provider_response_window_rejected'
      tradeIds.push(String(row.tradeId))
      billIds.push(String(row.billId))
    }
    return new Set(tradeIds).size === rows.length && new Set(billIds).size === rows.length
      ? 'accepted'
      : 'provider_event_identity_blocked'
  }
  if (capabilityId === 'okx_positions_history_swap_v1') {
    const observations: string[] = []
    for (const row of rows) {
      const shape = validateExactProjection(capabilityId, row)
      if (shape !== 'accepted') return shape
      if (validateInstrumentReference(row) !== 'accepted') return 'provider_contract_class_out_of_scope'
      if (!positiveDigitId(row.posId)) return 'provider_event_identity_blocked'
      if (!['cross', 'isolated'].includes(String(row.mgnMode)) || !['1', '2', '3', '4', '5'].includes(String(row.type))) return 'provider_enum_unknown'
      const semantics = validatePositionSemantics({ ...row, posMode: fixture?.account_position_mode })
      if (semantics !== 'accepted') return semantics
      if (!nonnegativeDecimal(row.openMaxPos) || !nonnegativeDecimal(row.closeTotalPos) || !strictlyPositiveDecimal(row.openAvgPx) || !strictlyPositiveDecimal(row.closeAvgPx)) return 'provider_quantity_semantics_blocked'
      if (row.ccy !== 'USDT') return 'provider_position_currency_rejected'
      if (!unixMilliseconds(row.cTime) || !unixMilliseconds(row.uTime) || BigInt(String(row.uTime)) < BigInt(String(row.cTime))) return 'provider_timestamp_rejected'
      const pnl = validatePositionPnl(row)
      if (pnl !== 'accepted') return pnl
      observations.push(`${String(row.posId)}:${String(row.uTime)}`)
    }
    return new Set(observations).size === rows.length ? 'accepted' : 'provider_event_identity_blocked'
  }
  if (capabilityId === 'okx_bills_archive_swap_v1') {
    const ids: string[] = []
    for (const row of rows) {
      const shape = validateExactProjection(capabilityId, row)
      if (shape !== 'accepted') return shape
      if (validateInstrumentReference(row) !== 'accepted') return 'provider_contract_class_out_of_scope'
      if (!positiveDigitId(row.billId)) return 'provider_event_identity_blocked'
      if (!['8:173', '2:2'].includes(`${String(row.type)}:${String(row.subType)}`)) return 'provider_financial_event_mapping_blocked'
      if (!validDecimal(row.balChg) || !validDecimal(row.fee) || row.ccy !== 'USDT') return 'provider_financial_event_mapping_blocked'
      if (!unixMilliseconds(row.ts)) return 'provider_timestamp_rejected'
      ids.push(String(row.billId))
    }
    return new Set(ids).size === rows.length ? 'accepted' : 'provider_event_identity_blocked'
  }
  return 'unknown_positive_capability'
}

function validatePositiveCase(fixture: PositiveCase): JsonObject {
  if (validateEnvelope(fixture.response) !== 'success') throw new Error('positive_envelope_rejected')
  const rows = fixture.response.body.data
  const validation = validateCapabilityRows(fixture.capability_id, rows, fixture)
  if (validation !== 'accepted') throw new Error(validation)
  if (fixture.capability_id === 'okx_account_config_v1') return accountConfigExpected(rows[0], fixture.authority!)
  if (fixture.capability_id === 'okx_account_instruments_swap_v1') return instrumentExpected(rows)
  if (fixture.capability_id === 'okx_orders_archive_swap_v1') {
    return { order_grain: rows[0].ordId, retention_scope: 'completed_orders_last_3_months', zero_fill_canceled_orders_in_archive: false, complete_account_history_claim: false }
  }
  if (fixture.capability_id === 'okx_fills_history_swap_v1') {
    if (rows.length === 0) return { exact_request_scope_empty: true, complete_account_history_claim: false, permission_completeness_claim: false }
    return {
      execution_grains: rows.map((row) => String(row.tradeId)),
      order_grain_count: new Set(rows.map((row) => row.ordId)).size,
      execution_grain_count: rows.length,
      pagination_cursors: rows.map((row) => String(row.billId)),
      filter_clock: 'ts', event_time_field: 'fillTime',
      same_timestamp_records_remain_distinct: new Set(rows.map((row) => row.fillTime)).size < rows.length,
      fee_currency: 'USDT',
    }
  }
  if (fixture.capability_id === 'okx_positions_history_swap_v1') {
    if (rows.length === 1) {
      return {
        position_grain: rows[0].posId,
        observation_grain: `${String(rows[0].posId)}:${String(rows[0].uTime)}`,
        direction: `${String(rows[0].direction)}_from_explicit_direction`,
        contract_quantities: { openMaxPos: rows[0].openMaxPos, closeTotalPos: rows[0].closeTotalPos },
        realized_pnl_formula_valid: true,
        pnl_fee_funding_penalty_and_settlement_remain_separate: true,
      }
    }
    return { position_grains: rows.map((row) => row.posId), observation_grains: rows.map((row) => `${String(row.posId)}:${String(row.uTime)}`), realized_pnl_formulas_valid: true, long_and_short_must_not_net: true }
  }
  if (fixture.capability_id === 'okx_bills_archive_swap_v1') {
    return { bill_grains: rows.map((row) => row.billId), mapping_status: 'blocked_until_versioned_official_enum_matrix', must_not_double_count_position_funding: true, currency: 'USDT' }
  }
  throw new Error('unknown_positive_capability')
}

const expectedProbeRequests = [
  {
    sequence: 1,
    request_id: 'probe_account_config',
    capability_id: 'okx_account_config_v1',
    path_with_canonical_query: '/api/v5/account/config',
    max_pages: 1,
  },
  {
    sequence: 2,
    request_id: 'probe_account_instruments',
    capability_id: 'okx_account_instruments_swap_v1',
    path_with_canonical_query: '/api/v5/account/instruments?instType=SWAP',
    max_pages: 1,
    post_response_filter: 'settleCcy=USDT_and_ctType=linear',
  },
  {
    sequence: 3,
    request_id: 'probe_fills_history',
    capability_id: 'okx_fills_history_swap_v1',
    path_with_canonical_query: '/api/v5/trade/fills-history?begin={window_start_ms}&end={window_end_ms}&instType=SWAP&limit=10',
    max_pages: 1,
    window_contract: 'authority_pinned_utc_ts_filter_window_product_maximum_7_days_within_documented_retention_fillTime_is_separate_event_clock',
  },
] as const

type SyntheticPermit = JsonObject & {
  state: string
  consumption_count: number
  issued_at: string
  deadline_at: string
}

type SyntheticRequestCore = {
  request_id: string
  request_sequence: number
  method: string
  https_origin: string
  port: number
  environment: string
  headers: Record<string, string>
  redirect_mode: string
  capability_id: string
  path_with_canonical_query: string
  window_start_ms: string
  window_end_ms: string
  response_byte_limit: number
  request_timeout_ms: number
  total_request_budget: number
  total_response_byte_budget: number
  deadline_at: string
}

type SyntheticRequest = SyntheticRequestCore & { permit: SyntheticPermit | null }

type TrustedRuntimeClock = {
  source: 'trusted_server_clock'
  server_now_at: string
}

type PermitTransitionContext = {
  authority_generation: number
  predecessor_response_evidence_sha256: string | null
  observed_provider_perm_and_ip_projection_sha256: string | null
  observed_account_identity_sha256: string | null
  issued_at: string
}

type ResponseTransportEvidence = {
  source: 'trusted_server_transport'
  raw_response_utf8: string
  raw_response_bytes: number
  raw_response_sha256: string
  request_started_at: string
  response_received_at: string
}

function accountIdentityDigest(uid: unknown) {
  if (!positiveDigitId(uid)) return null
  const message = [
    String(profile.identity_contract.domain_separator),
    'okx',
    'demo',
    'okx-eea-demo-v1',
    String(uid),
  ].join('\0')
  return createHmac('sha256', 'synthetic-fixture-identity-key-v1').update(Buffer.from(message, 'utf8')).digest('hex')
}

const syntheticAuthorityClaims = {
  account_connection_id: 'synthetic-connection-001',
  setup_command_id: 'synthetic-setup-command-001',
  setup_row_version: 7,
  identity_key_version: 'installation_identity_key_v1',
  permission_attestation_sha256: sha256Canonical({ provider_permissions: ['Read'], forbidden_permissions_absent: ['Trade', 'Withdraw'] }),
  expected_provider_perm_and_ip_projection_sha256: sha256Canonical({ perm: 'read_only', ip: '192.0.2.10' }),
  expected_account_identity_sha256: accountIdentityDigest('700000001')!,
  authorized_egress_ip_set_sha256: '6d99cbd08fc6c99cdb2d942a4cbb097c6b54496bbbc3ffd6351b145508dd2935',
  account_mfa_attestation_sha256: sha256Canonical({ account_mfa_attested: true }),
  incident_clear_attestation_sha256: sha256Canonical({ incident_status: 'clear' }),
}

const allowedHeaderNames = [
  ...profile.signing_contract.private_header_names as string[],
  ...Object.keys(profile.region_profiles.selected_candidate.required_constant_headers),
].sort(codePointCompare)

const validRequestCores: SyntheticRequestCore[] = expectedProbeRequests.map((probeRequest) => {
  const capability = profile.capabilities.find((entry) => entry.capability_id === probeRequest.capability_id)!
  return {
    request_id: probeRequest.request_id,
    request_sequence: probeRequest.sequence,
    method: 'GET',
    https_origin: 'https://eea.okx.com',
    port: 443,
    environment: 'demo',
    headers: {
      'OK-ACCESS-KEY': 'runtime',
      'OK-ACCESS-SIGN': 'runtime',
      'OK-ACCESS-TIMESTAMP': 'runtime',
      'OK-ACCESS-PASSPHRASE': 'runtime',
      'x-simulated-trading': '1',
    },
    redirect_mode: 'error',
    capability_id: probeRequest.capability_id,
    path_with_canonical_query: probeRequest.path_with_canonical_query,
    window_start_ms: '1787047202000',
    window_end_ms: '1787652002000',
    response_byte_limit: capability.response_byte_limit,
    request_timeout_ms: 4000,
    total_request_budget: 3,
    total_response_byte_budget: 1048576,
    deadline_at: '2026-08-27T10:20:45.123Z',
  }
})

const validRequestCore = validRequestCores[2]
const validTrustedRuntimeClock: TrustedRuntimeClock = {
  source: 'trusted_server_clock',
  server_now_at: '2026-08-27T10:20:22.000Z',
}

function requestDescriptor(request: SyntheticRequestCore) {
  return {
    request_id: request.request_id,
    request_sequence: request.request_sequence,
    capability_id: request.capability_id,
    environment: request.environment,
    https_origin: request.https_origin,
    port: request.port,
    method: request.method,
    path_with_canonical_query: request.path_with_canonical_query,
    header_name_set_sha256: sha256Canonical(Object.keys(request.headers).sort(codePointCompare)),
    window_start_ms: request.window_start_ms,
    window_end_ms: request.window_end_ms,
    response_byte_limit: request.response_byte_limit,
    request_timeout_ms: request.request_timeout_ms,
    total_request_budget: request.total_request_budget,
    total_response_byte_budget: request.total_response_byte_budget,
    deadline_at: request.deadline_at,
  }
}

function expectedPermit(request: SyntheticRequestCore, transition: PermitTransitionContext): SyntheticPermit {
  const capability = profile.capabilities.find((entry) => entry.capability_id === request.capability_id)!
  const descriptor = requestDescriptor(request)
  const authoritySnapshot = {
    ...syntheticAuthorityClaims,
    authority_generation: transition.authority_generation,
    predecessor_response_evidence_sha256: transition.predecessor_response_evidence_sha256,
    observed_provider_perm_and_ip_projection_sha256: transition.observed_provider_perm_and_ip_projection_sha256,
    observed_account_identity_sha256: transition.observed_account_identity_sha256,
  }
  return {
    permit_id: `synthetic-permit-${request.request_id}-001`,
    ...syntheticAuthorityClaims,
    authority_generation: transition.authority_generation,
    predecessor_response_evidence_sha256: transition.predecessor_response_evidence_sha256,
    observed_provider_perm_and_ip_projection_sha256: transition.observed_provider_perm_and_ip_projection_sha256,
    observed_account_identity_sha256: transition.observed_account_identity_sha256,
    request_id: request.request_id,
    request_sequence: request.request_sequence,
    capability_id: request.capability_id,
    capability_descriptor_sha256: capability.capability_descriptor_sha256,
    provider_contract_version: profile.decision.provider_contract_version,
    profile_digest_sha256: profile.minimal_probe_profile.profile_digest_sha256,
    authority_snapshot_sha256: sha256Canonical(authoritySnapshot),
    environment: request.environment,
    https_origin: request.https_origin,
    port: request.port,
    method: request.method,
    path_with_canonical_query: request.path_with_canonical_query,
    header_name_set_sha256: descriptor.header_name_set_sha256,
    request_descriptor_sha256: sha256Canonical(descriptor),
    window_start_ms: request.window_start_ms,
    window_end_ms: request.window_end_ms,
    response_byte_limit: request.response_byte_limit,
    request_timeout_ms: request.request_timeout_ms,
    total_request_budget: request.total_request_budget,
    total_response_byte_budget: request.total_response_byte_budget,
    issued_at: transition.issued_at,
    deadline_at: request.deadline_at,
    state: 'issued_unconsumed',
    consumption_count: 0,
  }
}

function validatePermit(
  input: SyntheticRequest,
  expectedRequest: SyntheticRequestCore,
  runtimeClock: TrustedRuntimeClock,
  expectedTransition: PermitTransitionContext,
) {
  if (!input.permit) return 'single_use_permit_missing'
  const expectedFields = profile.single_use_permit_contract.closed_claim_fields as string[]
  if (Object.keys(input.permit).sort(codePointCompare).join(',') !== [...expectedFields].sort(codePointCompare).join(',')) {
    return 'single_use_permit_shape_rejected'
  }
  if (input.permit.state !== 'issued_unconsumed' || input.permit.consumption_count !== 0) {
    return 'single_use_permit_replayed'
  }
  if (runtimeClock.source !== 'trusted_server_clock') return 'single_use_permit_runtime_clock_untrusted'
  const issuedAt = canonicalUtcInstant(input.permit.issued_at)
  const deadlineAt = canonicalUtcInstant(input.permit.deadline_at)
  const serverNowAt = canonicalUtcInstant(runtimeClock.server_now_at)
  if (issuedAt === null || deadlineAt === null || serverNowAt === null || deadlineAt <= issuedAt) {
    return 'single_use_permit_time_invalid'
  }
  if (serverNowAt < issuedAt) return 'single_use_permit_clock_rollback'
  if (serverNowAt >= deadlineAt) return 'single_use_permit_expired'
  return canonicalJson(input.permit) === canonicalJson(expectedPermit(expectedRequest, expectedTransition))
    ? 'accepted'
    : 'single_use_permit_scope_mismatch'
}

function consumePermit(permit: SyntheticPermit) {
  if (permit.state !== 'issued_unconsumed' || permit.consumption_count !== 0) throw new Error('single_use_permit_replayed')
  return { ...permit, state: 'consumed', consumption_count: 1 }
}

function validateSyntheticRequest(
  input: SyntheticRequest,
  expectedRequest: SyntheticRequestCore = validRequestCore,
  runtimeClock: TrustedRuntimeClock = validTrustedRuntimeClock,
  expectedTransition: PermitTransitionContext = validPermitTransition,
) {
  const selected = profile.region_profiles.selected_candidate
  if (input.method !== 'GET') return 'provider_method_forbidden'
  if (input.https_origin !== selected.https_origin) return 'provider_origin_pin_mismatch'
  if (input.port !== selected.port) return 'provider_port_pin_mismatch'
  if (input.environment !== selected.environment) return 'provider_environment_pin_mismatch'
  if (input.headers['x-simulated-trading'] !== '1') return 'provider_demo_header_missing'
  const actualHeaderNames = Object.keys(input.headers).sort(codePointCompare)
  if (actualHeaderNames.join(',') !== allowedHeaderNames.join(',') || actualHeaderNames.some((name) => input.headers[name] === '')) return 'provider_header_allowlist_rejected'
  if (input.redirect_mode !== 'error') return 'provider_redirect_forbidden'
  const expected = expectedProbeRequests.find((entry) => entry.capability_id === input.capability_id)
  if (!expected) return 'provider_capability_pin_mismatch'
  if (input.request_id !== expected.request_id || input.request_sequence !== expected.sequence) return 'provider_request_identity_pin_mismatch'
  if (input.path_with_canonical_query !== expected.path_with_canonical_query) {
    return input.path_with_canonical_query.startsWith(expected.path_with_canonical_query.split('?')[0])
      ? 'provider_query_pin_mismatch'
      : 'provider_path_pin_mismatch'
  }
  if (canonicalJson(requestDescriptor(input)) !== canonicalJson(requestDescriptor(expectedRequest))) {
    return 'provider_request_descriptor_pin_mismatch'
  }
  return validatePermit(input, expectedRequest, runtimeClock, expectedTransition)
}

const aggregatePositiveCaseIds = [
  'positive_account_config_main_net',
  'positive_multiple_eligible_and_filtered_swap_instruments',
  'positive_fills_across_two_eligible_instruments',
] as const

type SyntheticProbeResult = {
  fixture_case_id: string
  request: SyntheticRequest
  response: PositiveCase['response']
  transport: ResponseTransportEvidence
}

type SyntheticProbeAggregate = {
  results: SyntheticProbeResult[]
  account_authority: NonNullable<PositiveCase['authority']>
  apply_requested: boolean
}

const validTransportTimes = [
  ['2026-08-27T10:20:20.000Z', '2026-08-27T10:20:20.500Z'],
  ['2026-08-27T10:20:21.000Z', '2026-08-27T10:20:21.500Z'],
  ['2026-08-27T10:20:22.000Z', '2026-08-27T10:20:22.500Z'],
] as const

const validPermitIssuedAt = [
  '2026-08-27T10:20:15.123Z',
  '2026-08-27T10:20:20.600Z',
  '2026-08-27T10:20:21.600Z',
] as const

function buildTransportEvidence(response: PositiveCase['response'], index: number): ResponseTransportEvidence {
  const rawResponseUtf8 = canonicalJson(response)
  return {
    source: 'trusted_server_transport',
    raw_response_utf8: rawResponseUtf8,
    raw_response_bytes: Buffer.byteLength(rawResponseUtf8, 'utf8'),
    raw_response_sha256: createHash('sha256').update(rawResponseUtf8, 'utf8').digest('hex'),
    request_started_at: validTransportTimes[index][0],
    response_received_at: validTransportTimes[index][1],
  }
}

function responseEvidenceDescriptor(result: SyntheticProbeResult) {
  return {
    request_id: result.request.request_id,
    request_sequence: result.request.request_sequence,
    capability_id: result.request.capability_id,
    source: result.transport.source,
    raw_response_bytes: result.transport.raw_response_bytes,
    raw_response_sha256: result.transport.raw_response_sha256,
    request_started_at: result.transport.request_started_at,
    response_received_at: result.transport.response_received_at,
  }
}

function responseEvidenceSha256(result: SyntheticProbeResult) {
  return sha256Canonical(responseEvidenceDescriptor(result))
}

function rebindTransportEvidence(result: SyntheticProbeResult) {
  result.transport.raw_response_utf8 = canonicalJson(result.response)
  result.transport.raw_response_bytes = Buffer.byteLength(result.transport.raw_response_utf8, 'utf8')
  result.transport.raw_response_sha256 = createHash('sha256').update(result.transport.raw_response_utf8, 'utf8').digest('hex')
}

function validateTransportEvidence(result: SyntheticProbeResult) {
  if (result.transport.source !== 'trusted_server_transport') return 'provider_transport_measurement_untrusted'
  const startedAt = canonicalUtcInstant(result.transport.request_started_at)
  const receivedAt = canonicalUtcInstant(result.transport.response_received_at)
  const deadlineAt = canonicalUtcInstant(result.request.permit?.deadline_at)
  if (startedAt === null || receivedAt === null || deadlineAt === null || receivedAt < startedAt) {
    return 'provider_transport_time_invalid'
  }
  if (receivedAt >= deadlineAt) return 'provider_response_after_deadline'
  if (receivedAt - startedAt > result.request.request_timeout_ms) return 'provider_request_timeout'
  const measuredBytes = Buffer.byteLength(result.transport.raw_response_utf8, 'utf8')
  const measuredSha256 = createHash('sha256').update(result.transport.raw_response_utf8, 'utf8').digest('hex')
  if (result.transport.raw_response_bytes !== measuredBytes || result.transport.raw_response_sha256 !== measuredSha256) {
    return 'provider_transport_measurement_mismatch'
  }
  if (measuredBytes > result.request.response_byte_limit) return 'provider_response_byte_limit_exceeded'
  let parsed: unknown
  try {
    assertNoDuplicateJsonObjectKeys(result.transport.raw_response_utf8, 'provider_raw_response')
    parsed = JSON.parse(result.transport.raw_response_utf8)
  } catch (error) {
    return error instanceof Error && error.message.includes('duplicate object key')
      ? 'provider_response_duplicate_json_key_rejected'
      : 'provider_response_contract_rejected'
  }
  return canonicalJson(parsed) === canonicalJson(result.response)
    ? 'accepted'
    : 'provider_transport_response_binding_mismatch'
}

function buildValidProbeAggregate(): SyntheticProbeAggregate {
  const aggregate: SyntheticProbeAggregate = {
    results: validRequestCores.map((request, index) => {
      const response = structuredClone(positiveCase(aggregatePositiveCaseIds[index]).response)
      return {
      fixture_case_id: aggregatePositiveCaseIds[index],
      request: { ...structuredClone(request), permit: null },
      response,
      transport: buildTransportEvidence(response, index),
      }
    }),
    account_authority: structuredClone(positiveCase('positive_account_config_main_net').authority!),
    apply_requested: true,
  }
  const accountRecord = aggregate.results[0].response.body.data[0]
  const providerIpSet = canonicalIpSet(accountRecord.ip)!
  const observedProviderProjectionSha256 = sha256Canonical({ perm: accountRecord.perm, ip: providerIpSet.join(',') })
  const observedAccountIdentitySha256 = accountIdentityDigest(accountRecord.uid)!
  for (let index = 0; index < aggregate.results.length; index += 1) {
    const transition: PermitTransitionContext = {
      authority_generation: index + 1,
      predecessor_response_evidence_sha256: index === 0 ? null : responseEvidenceSha256(aggregate.results[index - 1]),
      observed_provider_perm_and_ip_projection_sha256: index === 0 ? null : observedProviderProjectionSha256,
      observed_account_identity_sha256: index === 0 ? null : observedAccountIdentitySha256,
      issued_at: validPermitIssuedAt[index],
    }
    aggregate.results[index].request.permit = expectedPermit(validRequestCores[index], transition)
  }
  return aggregate
}

const validProbeAggregate = buildValidProbeAggregate()
const validSyntheticRequest = structuredClone(validProbeAggregate.results[2].request)
const validPermitTransition: PermitTransitionContext = {
  authority_generation: Number(validSyntheticRequest.permit!.authority_generation),
  predecessor_response_evidence_sha256: String(validSyntheticRequest.permit!.predecessor_response_evidence_sha256),
  observed_provider_perm_and_ip_projection_sha256: String(validSyntheticRequest.permit!.observed_provider_perm_and_ip_projection_sha256),
  observed_account_identity_sha256: String(validSyntheticRequest.permit!.observed_account_identity_sha256),
  issued_at: validSyntheticRequest.permit!.issued_at,
}

function validateProbeAggregate(input: SyntheticProbeAggregate): string {
  if (input.results.length !== 3) return 'partial_probe_apply_forbidden'
  const consumedPermits: SyntheticPermit[] = []
  let observedProviderProjectionSha256: string | null = null
  let observedAccountIdentitySha256: string | null = null
  let predecessorResponseEvidenceSha256: string | null = null
  let previousResponseReceivedAt: number | null = null
  let firstRequestStartedAt: number | null = null
  let totalResponseBytes = 0
  for (let index = 0; index < validRequestCores.length; index += 1) {
    const result = input.results[index]
    const expectedRequest = validRequestCores[index]
    if (!result || result.fixture_case_id !== aggregatePositiveCaseIds[index]) return 'probe_response_sequence_rejected'
    const issuedAt = canonicalUtcInstant(result.request.permit?.issued_at)
    if (issuedAt === null) return 'single_use_permit_time_invalid'
    if (previousResponseReceivedAt !== null && issuedAt < previousResponseReceivedAt) {
      return 'provider_authority_transition_preissued'
    }
    const expectedTransition: PermitTransitionContext = {
      authority_generation: index + 1,
      predecessor_response_evidence_sha256: index === 0 ? null : predecessorResponseEvidenceSha256,
      observed_provider_perm_and_ip_projection_sha256: index === 0 ? null : observedProviderProjectionSha256,
      observed_account_identity_sha256: index === 0 ? null : observedAccountIdentitySha256,
      issued_at: result.request.permit!.issued_at,
    }
    if (index > 0 && (!observedProviderProjectionSha256 || !observedAccountIdentitySha256 || !predecessorResponseEvidenceSha256)) {
      return 'provider_authority_transition_missing'
    }
    if (
      result.request.permit?.authority_generation !== expectedTransition.authority_generation ||
      result.request.permit?.predecessor_response_evidence_sha256 !== expectedTransition.predecessor_response_evidence_sha256 ||
      result.request.permit?.observed_provider_perm_and_ip_projection_sha256 !== expectedTransition.observed_provider_perm_and_ip_projection_sha256 ||
      result.request.permit?.observed_account_identity_sha256 !== expectedTransition.observed_account_identity_sha256
    ) {
      return 'provider_authority_transition_mismatch'
    }
    const runtimeClock: TrustedRuntimeClock = {
      source: 'trusted_server_clock',
      server_now_at: result.transport.request_started_at,
    }
    const requestValidation = validateSyntheticRequest(result.request, expectedRequest, runtimeClock, expectedTransition)
    if (requestValidation !== 'accepted') return requestValidation
    const transportValidation = validateTransportEvidence(result)
    if (transportValidation !== 'accepted') return transportValidation
    const startedAt = canonicalUtcInstant(result.transport.request_started_at)!
    const receivedAt = canonicalUtcInstant(result.transport.response_received_at)!
    if (previousResponseReceivedAt !== null && startedAt < previousResponseReceivedAt) return 'provider_probe_sequence_overlap'
    if (firstRequestStartedAt === null) firstRequestStartedAt = startedAt
    if (receivedAt - firstRequestStartedAt > profile.minimal_probe_profile.budget.maximum_duration_ms) {
      return 'probe_deadline_exceeded'
    }
    totalResponseBytes += result.transport.raw_response_bytes
    if (totalResponseBytes > result.request.total_response_byte_budget) return 'probe_response_budget_exceeded'
    const envelopeValidation = validateEnvelope(result.response)
    if (envelopeValidation !== 'success') return envelopeValidation
    const fixture = {
      ...positiveCase(result.fixture_case_id),
      authority: input.account_authority,
      response: result.response,
    }
    const rowValidation = validateCapabilityRows(
      result.request.capability_id,
      result.response.body.data,
      fixture,
      {
        window_start_ms: result.request.window_start_ms,
        window_end_ms: result.request.window_end_ms,
        response_record_limit: result.request.request_sequence === 3 ? 10 : 0,
      },
    )
    if (rowValidation !== 'accepted') return rowValidation
    consumedPermits.push(consumePermit(result.request.permit!))
    predecessorResponseEvidenceSha256 = responseEvidenceSha256(result)
    previousResponseReceivedAt = receivedAt
    if (index === 0) {
      const accountRecord = result.response.body.data[0]
      const providerIpSet = canonicalIpSet(accountRecord.ip)
      if (!providerIpSet) return 'provider_ip_allowlist_invalid'
      observedProviderProjectionSha256 = sha256Canonical({ perm: accountRecord.perm, ip: providerIpSet.join(',') })
      observedAccountIdentitySha256 = accountIdentityDigest(accountRecord.uid)
      if (observedProviderProjectionSha256 !== syntheticAuthorityClaims.expected_provider_perm_and_ip_projection_sha256) {
        return 'provider_observation_projection_mismatch'
      }
      if (observedAccountIdentitySha256 !== syntheticAuthorityClaims.expected_account_identity_sha256) {
        return 'account_identity_digest_mismatch'
      }
    }
  }

  const accountRecord = input.results[0].response.body.data[0]
  const instrumentRows = input.results[1].response.body.data
  const fillRows = input.results[2].response.body.data
  if (
    input.results.some((result) => result.request.permit?.expected_provider_perm_and_ip_projection_sha256 !== observedProviderProjectionSha256) ||
    input.results.slice(1).some((result) => result.request.permit?.observed_provider_perm_and_ip_projection_sha256 !== observedProviderProjectionSha256) ||
    input.results.slice(1).some((result) => result.request.permit?.observed_account_identity_sha256 !== observedAccountIdentitySha256)
  ) {
    return 'provider_authority_transition_mismatch'
  }

  const positionMode = String(accountRecord.posMode)
  if (positionMode === 'net_mode' && fillRows.some((row) => row.posSide !== 'net')) {
    return 'provider_position_semantics_rejected'
  }
  if (positionMode === 'long_short_mode' && fillRows.some((row) => !['long', 'short'].includes(String(row.posSide)))) {
    return 'provider_position_semantics_rejected'
  }
  const eligibleInstrumentIds = new Set(selectedInstrumentRows(instrumentRows).map((row) => String(row.instId)))
  if (eligibleInstrumentIds.size === 0 || fillRows.some((row) => !eligibleInstrumentIds.has(String(row.instId)))) {
    return 'provider_cross_capability_instrument_mismatch'
  }
  if (
    new Set(consumedPermits.map((permit) => permit.permit_id)).size !== 3 ||
    consumedPermits.some((permit) => permit.state !== 'consumed' || permit.consumption_count !== 1)
  ) {
    return 'single_use_permit_aggregate_consumption_rejected'
  }
  return input.apply_requested ? 'accepted' : 'probe_apply_not_requested'
}

const EXPECTED_NEGATIVE_ERRORS: Record<string, string> = {
  negative_nonzero_provider_code: 'provider_error_not_empty_success',
  negative_response_data_not_array: 'provider_response_contract_rejected',
  negative_wrong_region_host: 'provider_origin_pin_mismatch',
  negative_post_method: 'provider_method_forbidden',
  negative_demo_header_missing: 'provider_demo_header_missing',
  negative_live_environment_substitution: 'provider_environment_pin_mismatch',
  negative_consumed_permit_replay: 'single_use_permit_replayed',
  negative_request_budget_exceeded: 'probe_request_budget_exceeded',
  negative_response_budget_exceeded: 'probe_response_budget_exceeded',
  negative_request_timeout: 'provider_request_timeout',
  negative_probe_deadline: 'probe_deadline_exceeded',
  negative_partial_probe_apply: 'partial_probe_apply_forbidden',
  negative_apply_identity_missing: 'account_identity_not_observed',
  negative_account_uid_missing: 'account_identity_not_observed',
  negative_unknown_position_mode: 'provider_enum_unknown',
  negative_long_short_position_side_net: 'provider_position_semantics_rejected',
  negative_invalid_decimal: 'provider_decimal_rejected',
  negative_execution_id_missing: 'provider_event_identity_blocked',
  negative_execution_order_link_missing: 'provider_order_link_blocked_initial_profile',
  negative_instrument_wrong_settlement: 'provider_contract_class_out_of_scope',
  negative_instrument_contract_value_missing: 'provider_quantity_semantics_blocked',
  negative_bill_unknown_subtype: 'provider_financial_event_mapping_blocked',
  negative_repeated_cursor_page: 'provider_pagination_progress_blocked',
  negative_mixed_cursor_directions: 'provider_pagination_direction_rejected',
  negative_probe_window_over_seven_days: 'provider_probe_window_rejected',
  negative_history_window_outside_retention: 'provider_retention_scope_rejected',
  negative_permission_trade: 'provider_permission_scope_rejected',
  negative_permission_withdraw: 'provider_permission_scope_rejected',
  negative_permission_trade_withdraw: 'provider_permission_scope_rejected',
  negative_permission_empty: 'provider_permission_scope_rejected',
  negative_permission_unknown: 'provider_permission_scope_rejected',
  negative_permission_duplicate: 'provider_permission_scope_rejected',
  negative_ip_allowlist_empty: 'provider_ip_allowlist_required',
  negative_ip_allowlist_invalid: 'provider_ip_allowlist_invalid',
  negative_account_mfa_attestation_missing: 'account_mfa_attestation_required',
  negative_incident_status_active: 'credential_incident_blocks_authority',
  negative_response_extra_top_level: 'provider_response_contract_rejected',
  negative_request_port: 'provider_port_pin_mismatch',
  negative_request_redirect: 'provider_redirect_forbidden',
  negative_request_path: 'provider_path_pin_mismatch',
  negative_request_query_order: 'provider_query_pin_mismatch',
  negative_request_unexpected_header: 'provider_header_allowlist_rejected',
  negative_request_missing_permit: 'single_use_permit_missing',
  negative_position_direction_conflict: 'provider_position_semantics_rejected',
  negative_position_history_pos_field: 'provider_position_history_shape_rejected',
  negative_position_pnl_formula: 'provider_realized_pnl_invariant_rejected',
  negative_position_pnl_component_missing: 'provider_realized_pnl_components_missing',
  negative_position_currency_conflict: 'provider_position_currency_rejected',
  negative_decimal_exponent: 'provider_decimal_rejected',
  negative_decimal_plus: 'provider_decimal_rejected',
  negative_decimal_leading_zero: 'provider_decimal_rejected',
  negative_decimal_overflow: 'provider_decimal_rejected',
  negative_quantity_negative: 'provider_quantity_semantics_blocked',
  negative_instrument_wrong_type: 'provider_contract_class_out_of_scope',
  negative_instrument_wrong_contract_type: 'provider_contract_class_out_of_scope',
  negative_instrument_wrong_value_currency: 'provider_quantity_semantics_blocked',
  negative_instrument_multiplier_missing: 'provider_quantity_semantics_blocked',
  negative_instrument_state: 'provider_instrument_state_rejected',
  negative_fills_cursor_uses_trade_id: 'provider_pagination_cursor_contract_rejected',
  negative_positions_cursor_uses_pos_id: 'provider_pagination_cursor_contract_rejected',
  negative_fills_filter_uses_fill_time: 'provider_filter_clock_contract_rejected',
  negative_fillSz_zero: 'provider_quantity_semantics_blocked',
  negative_fillSz_zero_fraction: 'provider_quantity_semantics_blocked',
  negative_fillSz_zero_long_fraction: 'provider_quantity_semantics_blocked',
  negative_sz_zero: 'provider_quantity_semantics_blocked',
  negative_sz_zero_fraction: 'provider_quantity_semantics_blocked',
  negative_sz_zero_long_fraction: 'provider_quantity_semantics_blocked',
  negative_ctVal_zero: 'provider_quantity_semantics_blocked',
  negative_ctVal_zero_fraction: 'provider_quantity_semantics_blocked',
  negative_ctVal_zero_long_fraction: 'provider_quantity_semantics_blocked',
  negative_ctMult_zero: 'provider_quantity_semantics_blocked',
  negative_ctMult_zero_fraction: 'provider_quantity_semantics_blocked',
  negative_ctMult_zero_long_fraction: 'provider_quantity_semantics_blocked',
  negative_ip_allowlist_wrong_valid_ip: 'provider_ip_allowlist_mismatch',
  negative_ip_allowlist_correct_plus_extra: 'provider_ip_allowlist_mismatch',
  negative_ip_allowlist_duplicate: 'provider_ip_allowlist_invalid',
  negative_ip_allowlist_unspecified: 'provider_ip_allowlist_invalid',
  negative_ip_allowlist_loopback: 'provider_ip_allowlist_invalid',
  negative_permit_wrong_connection: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_setup_row: 'single_use_permit_scope_mismatch',
  negative_permit_cross_request: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_sequence: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_capability: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_capability_digest: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_profile_digest: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_authority_digest: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_origin: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_path: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_header_digest: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_window: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_request_budget: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_response_budget: 'single_use_permit_scope_mismatch',
  negative_permit_expired: 'single_use_permit_expired',
  negative_permit_extra_claim: 'single_use_permit_shape_rejected',
  negative_order_wrong_inst_type: 'provider_contract_class_out_of_scope',
  negative_order_unknown_state: 'provider_enum_unknown',
  negative_order_unknown_side: 'provider_enum_unknown',
  negative_order_invalid_timestamp: 'provider_timestamp_rejected',
  negative_order_missing_field: 'provider_record_shape_rejected',
  negative_order_extra_field: 'provider_record_shape_rejected',
  negative_order_duplicate_id: 'provider_event_identity_blocked',
  negative_fill_wrong_inst_type: 'provider_contract_class_out_of_scope',
  negative_fill_unknown_side: 'provider_enum_unknown',
  negative_fill_unknown_pos_side: 'provider_enum_unknown',
  negative_fill_invalid_timestamp: 'provider_timestamp_rejected',
  negative_fill_zero_equivalent: 'provider_quantity_semantics_blocked',
  negative_fill_missing_field: 'provider_record_shape_rejected',
  negative_fill_duplicate_trade_id: 'provider_event_identity_blocked',
  negative_position_wrong_inst_type: 'provider_contract_class_out_of_scope',
  negative_position_invalid_timestamp: 'provider_timestamp_rejected',
  negative_position_unknown_type: 'provider_enum_unknown',
  negative_position_missing_field: 'provider_record_shape_rejected',
  negative_position_duplicate_observation: 'provider_event_identity_blocked',
  negative_settled_pnl_nonempty_swap: 'provider_settled_pnl_semantics_rejected',
  negative_settled_pnl_invalid_nonempty_swap: 'provider_settled_pnl_semantics_rejected',
  negative_settled_pnl_empty_cross_futures: 'provider_settled_pnl_semantics_rejected',
  negative_bill_wrong_inst_type: 'provider_contract_class_out_of_scope',
  negative_bill_invalid_timestamp: 'provider_timestamp_rejected',
  negative_bill_missing_field: 'provider_record_shape_rejected',
  negative_bill_duplicate_id: 'provider_event_identity_blocked',
  negative_request_private_header_missing: 'provider_header_allowlist_rejected',
  negative_permit_wrong_setup_command: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_contract_version: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_request_descriptor_digest: 'single_use_permit_scope_mismatch',
  negative_permit_wrong_provider_observation_digest: 'single_use_permit_scope_mismatch',
  negative_coordinated_request_and_permit_budget: 'provider_request_descriptor_pin_mismatch',
  negative_runtime_clock_unparseable: 'single_use_permit_time_invalid',
  negative_runtime_clock_noncanonical: 'single_use_permit_time_invalid',
  negative_runtime_clock_rollback: 'single_use_permit_clock_rollback',
  negative_runtime_clock_untrusted_source: 'single_use_permit_runtime_clock_untrusted',
  negative_permit_deadline_unparseable: 'single_use_permit_time_invalid',
  negative_permit_deadline_noncanonical: 'single_use_permit_time_invalid',
  negative_fill_ts_below_request_window: 'provider_response_window_rejected',
  negative_fill_ts_above_request_window: 'provider_response_window_rejected',
  negative_aggregate_position_mode_fill_side_conflict: 'provider_position_semantics_rejected',
  negative_aggregate_provider_observation_coordinated: 'single_use_permit_scope_mismatch',
  negative_aggregate_response_clock_cursor_coordinated: 'provider_response_window_rejected',
  negative_aggregate_cross_request_permit_reuse: 'provider_authority_transition_mismatch',
  negative_ip_allowlist_unicode_whitespace: 'provider_ip_allowlist_invalid',
  negative_ip_allowlist_ipv4_mapped_ipv6: 'provider_ip_allowlist_invalid',
  negative_permit_issued_at_unparseable: 'single_use_permit_time_invalid',
  negative_permit_issued_at_noncanonical: 'single_use_permit_time_invalid',
  negative_aggregate_permit_2_preissued: 'provider_authority_transition_preissued',
  negative_aggregate_observed_transition_missing: 'provider_authority_transition_mismatch',
  negative_aggregate_identity_coordinated: 'account_identity_digest_mismatch',
  negative_aggregate_identity_response_and_permits_coordinated: 'single_use_permit_scope_mismatch',
  negative_aggregate_response_after_deadline: 'provider_response_after_deadline',
  negative_aggregate_response_byte_claim_mismatch: 'provider_transport_measurement_mismatch',
  negative_aggregate_capability_byte_limit: 'provider_response_byte_limit_exceeded',
  negative_aggregate_total_byte_budget: 'probe_response_budget_exceeded',
  negative_aggregate_total_duration: 'probe_deadline_exceeded',
  negative_aggregate_fill_record_limit: 'provider_response_record_limit_exceeded',
  negative_aggregate_transport_untrusted: 'provider_transport_measurement_untrusted',
  negative_aggregate_transport_time_unparseable: 'provider_transport_time_invalid',
  negative_aggregate_request_timeout: 'provider_request_timeout',
  negative_aggregate_identity_legacy_json_encoding: 'single_use_permit_scope_mismatch',
  negative_aggregate_instrument_filter_empty: 'provider_instrument_filter_empty',
  negative_aggregate_instrument_selected_record_invalid: 'provider_quantity_semantics_blocked',
  negative_aggregate_duplicate_envelope_key: 'provider_response_duplicate_json_key_rejected',
  negative_aggregate_duplicate_id_key: 'provider_response_duplicate_json_key_rejected',
  negative_aggregate_duplicate_decimal_key: 'provider_response_duplicate_json_key_rejected',
  negative_aggregate_duplicate_timestamp_key: 'provider_response_duplicate_json_key_rejected',
  negative_aggregate_fill_references_filtered_out_instrument: 'provider_cross_capability_instrument_mismatch',
  negative_aggregate_unselected_instrument_base_invalid: 'provider_record_shape_rejected',
  negative_aggregate_duplicate_selected_instrument_id: 'provider_event_identity_blocked',
}

function validateMutatedPositiveRecord(input: JsonObject) {
  const base = positiveCase(String(input.base_case_id))
  const rows = structuredClone(base.response.body.data)
  const rowIndex = typeof input.row_index === 'number' ? input.row_index : 0
  if (!rows[rowIndex]) return 'provider_record_shape_rejected'
  if (typeof input.delete_field === 'string') delete rows[rowIndex][input.delete_field]
  if (input.patch && typeof input.patch === 'object' && !Array.isArray(input.patch)) Object.assign(rows[rowIndex], input.patch)
  return validateCapabilityRows(base.capability_id, rows, base)
}

function validateDuplicatePositiveRecord(input: JsonObject) {
  const base = positiveCase(String(input.base_case_id))
  const rows = structuredClone(base.response.body.data)
  const source = structuredClone(rows[typeof input.row_index === 'number' ? input.row_index : 0])
  if (input.patch && typeof input.patch === 'object' && !Array.isArray(input.patch)) Object.assign(source, input.patch)
  rows.push(source)
  return validateCapabilityRows(base.capability_id, rows, base)
}

function validateAggregateMutation(input: JsonObject) {
  const aggregate = buildValidProbeAggregate()
  const padTransportToBytes = (result: SyntheticProbeResult, targetBytes: number) => {
    const raw = canonicalJson(result.response)
    const baseBytes = Buffer.byteLength(raw, 'utf8')
    if (targetBytes < baseBytes) throw new Error('synthetic_target_smaller_than_response')
    result.transport.raw_response_utf8 = `${raw}${' '.repeat(targetBytes - baseBytes)}`
    result.transport.raw_response_bytes = targetBytes
    result.transport.raw_response_sha256 = createHash('sha256').update(result.transport.raw_response_utf8, 'utf8').digest('hex')
  }
  const bindRawTransport = (result: SyntheticProbeResult, rawResponseUtf8: string) => {
    result.transport.raw_response_utf8 = rawResponseUtf8
    result.transport.raw_response_bytes = Buffer.byteLength(rawResponseUtf8, 'utf8')
    result.transport.raw_response_sha256 = createHash('sha256').update(rawResponseUtf8, 'utf8').digest('hex')
  }
  const rebindSequentialPermits = () => {
    const accountRecord = aggregate.results[0].response.body.data[0]
    const providerIpSet = canonicalIpSet(accountRecord.ip)!
    const observedProviderProjectionSha256 = sha256Canonical({ perm: accountRecord.perm, ip: providerIpSet.join(',') })
    const observedAccountIdentitySha256 = accountIdentityDigest(accountRecord.uid)!
    for (let index = 0; index < aggregate.results.length; index += 1) {
      const transition: PermitTransitionContext = {
        authority_generation: index + 1,
        predecessor_response_evidence_sha256: index === 0 ? null : responseEvidenceSha256(aggregate.results[index - 1]),
        observed_provider_perm_and_ip_projection_sha256: index === 0 ? null : observedProviderProjectionSha256,
        observed_account_identity_sha256: index === 0 ? null : observedAccountIdentitySha256,
        issued_at: aggregate.results[index].request.permit!.issued_at,
      }
      aggregate.results[index].request.permit = expectedPermit(validRequestCores[index], transition)
    }
  }
  const recomputeAuthoritySnapshot = (permit: SyntheticPermit) => {
    permit.authority_snapshot_sha256 = sha256Canonical({
      account_connection_id: permit.account_connection_id,
      setup_command_id: permit.setup_command_id,
      setup_row_version: permit.setup_row_version,
      identity_key_version: permit.identity_key_version,
      permission_attestation_sha256: permit.permission_attestation_sha256,
      expected_provider_perm_and_ip_projection_sha256: permit.expected_provider_perm_and_ip_projection_sha256,
      expected_account_identity_sha256: permit.expected_account_identity_sha256,
      authorized_egress_ip_set_sha256: permit.authorized_egress_ip_set_sha256,
      account_mfa_attestation_sha256: permit.account_mfa_attestation_sha256,
      incident_clear_attestation_sha256: permit.incident_clear_attestation_sha256,
      authority_generation: permit.authority_generation,
      predecessor_response_evidence_sha256: permit.predecessor_response_evidence_sha256,
      observed_provider_perm_and_ip_projection_sha256: permit.observed_provider_perm_and_ip_projection_sha256,
      observed_account_identity_sha256: permit.observed_account_identity_sha256,
    })
  }
  switch (input.scenario) {
    case 'position_mode_fill_side_conflict':
      aggregate.results[0].response.body.data[0].posMode = 'long_short_mode'
      rebindTransportEvidence(aggregate.results[0])
      rebindSequentialPermits()
      return validateProbeAggregate(aggregate)
    case 'provider_observation_coordinated': {
      const ip = '192.0.2.11'
      const authorizedEgressIpSetSha256 = ipSetDigest([ip])
      const providerProjectionSha256 = sha256Canonical({ perm: 'read_only', ip })
      aggregate.results[0].response.body.data[0].ip = ip
      rebindTransportEvidence(aggregate.results[0])
      aggregate.account_authority = {
        authorized_egress_ip_set: [ip],
        authorized_egress_ip_set_sha256: authorizedEgressIpSetSha256,
      }
      for (const result of aggregate.results) {
        result.request.permit!.expected_provider_perm_and_ip_projection_sha256 = providerProjectionSha256
        result.request.permit!.authorized_egress_ip_set_sha256 = authorizedEgressIpSetSha256
      }
      aggregate.results[1].request.permit!.predecessor_response_evidence_sha256 = responseEvidenceSha256(aggregate.results[0])
      aggregate.results[1].request.permit!.observed_provider_perm_and_ip_projection_sha256 = providerProjectionSha256
      aggregate.results[2].request.permit!.observed_provider_perm_and_ip_projection_sha256 = providerProjectionSha256
      aggregate.results.forEach((result) => recomputeAuthoritySnapshot(result.request.permit!))
      return validateProbeAggregate(aggregate)
    }
    case 'response_clock_cursor_coordinated':
      aggregate.results[2].response.body.data[0].ts = '1787047201999'
      aggregate.results[2].response.body.data[0].billId = '825999999'
      rebindTransportEvidence(aggregate.results[2])
      return validateProbeAggregate(aggregate)
    case 'cross_request_permit_reuse': {
      const issuedAt = aggregate.results[1].request.permit!.issued_at
      aggregate.results[1].request.permit = structuredClone(aggregate.results[0].request.permit)
      aggregate.results[1].request.permit!.issued_at = issuedAt
      return validateProbeAggregate(aggregate)
    }
    case 'permit_2_preissued':
      aggregate.results[1].request.permit!.issued_at = '2026-08-27T10:20:20.400Z'
      return validateProbeAggregate(aggregate)
    case 'observed_transition_missing': {
      aggregate.results[1].request.permit!.observed_provider_perm_and_ip_projection_sha256 = null
      aggregate.results[1].request.permit!.observed_account_identity_sha256 = null
      return validateProbeAggregate(aggregate)
    }
    case 'identity_coordinated':
      aggregate.results[0].response.body.data[0].uid = '700000099'
      aggregate.results[0].response.body.data[0].mainUid = '700000099'
      rebindTransportEvidence(aggregate.results[0])
      return validateProbeAggregate(aggregate)
    case 'identity_response_and_permits_coordinated': {
      aggregate.results[0].response.body.data[0].uid = '700000099'
      aggregate.results[0].response.body.data[0].mainUid = '700000099'
      rebindTransportEvidence(aggregate.results[0])
      const identitySha256 = accountIdentityDigest('700000099')!
      for (const result of aggregate.results) result.request.permit!.expected_account_identity_sha256 = identitySha256
      aggregate.results[1].request.permit!.predecessor_response_evidence_sha256 = responseEvidenceSha256(aggregate.results[0])
      aggregate.results[1].request.permit!.observed_account_identity_sha256 = identitySha256
      aggregate.results[2].request.permit!.observed_account_identity_sha256 = identitySha256
      aggregate.results.forEach((result) => recomputeAuthoritySnapshot(result.request.permit!))
      return validateProbeAggregate(aggregate)
    }
    case 'identity_legacy_json_encoding': {
      const legacyJsonDigest = 'd70f34b3f6be1a356747cec66123db69c0ace9f135eccbada59cc5e0fda8e865'
      for (const result of aggregate.results) result.request.permit!.expected_account_identity_sha256 = legacyJsonDigest
      aggregate.results[1].request.permit!.observed_account_identity_sha256 = legacyJsonDigest
      aggregate.results[2].request.permit!.observed_account_identity_sha256 = legacyJsonDigest
      aggregate.results.forEach((result) => recomputeAuthoritySnapshot(result.request.permit!))
      return validateProbeAggregate(aggregate)
    }
    case 'instrument_filter_empty':
      for (const row of aggregate.results[1].response.body.data) {
        row.settleCcy = 'USDC'
        row.ctType = 'inverse'
      }
      rebindTransportEvidence(aggregate.results[1])
      return validateProbeAggregate(aggregate)
    case 'instrument_selected_record_invalid':
      aggregate.results[1].response.body.data[0].ctVal = ''
      rebindTransportEvidence(aggregate.results[1])
      return validateProbeAggregate(aggregate)
    case 'duplicate_envelope_key': {
      const result = aggregate.results[0]
      bindRawTransport(result, result.transport.raw_response_utf8.replace('"code":"0"', '"code":"0","code":"0"'))
      return validateProbeAggregate(aggregate)
    }
    case 'duplicate_id_key': {
      const result = aggregate.results[2]
      bindRawTransport(result, result.transport.raw_response_utf8.replace('"tradeId":"820000011"', '"tradeId":"820000011","tradeId":"820000011"'))
      return validateProbeAggregate(aggregate)
    }
    case 'duplicate_decimal_key': {
      const result = aggregate.results[2]
      bindRawTransport(result, result.transport.raw_response_utf8.replace('"fillSz":"1"', '"fillSz":"1","fillSz":"1"'))
      return validateProbeAggregate(aggregate)
    }
    case 'duplicate_timestamp_key': {
      const result = aggregate.results[2]
      bindRawTransport(result, result.transport.raw_response_utf8.replace('"ts":"1787652001100"', '"ts":"1787652001100","ts":"1787652001100"'))
      return validateProbeAggregate(aggregate)
    }
    case 'fill_references_filtered_out_instrument':
      aggregate.results[2].response.body.data[0].instId = 'CCC-USDT-SWAP'
      rebindTransportEvidence(aggregate.results[2])
      return validateProbeAggregate(aggregate)
    case 'unselected_instrument_base_invalid':
      aggregate.results[1].response.body.data[2].ctVal = 1
      rebindTransportEvidence(aggregate.results[1])
      rebindSequentialPermits()
      return validateProbeAggregate(aggregate)
    case 'duplicate_selected_instrument_id':
      aggregate.results[1].response.body.data[1].instId = 'AAA-USDT-SWAP'
      aggregate.results[1].response.body.data[1].instFamily = 'AAA-USDT'
      aggregate.results[1].response.body.data[1].ctValCcy = 'AAA'
      rebindTransportEvidence(aggregate.results[1])
      rebindSequentialPermits()
      return validateProbeAggregate(aggregate)
    case 'response_after_deadline':
      aggregate.results[2].transport.response_received_at = '2026-08-27T10:20:45.123Z'
      return validateProbeAggregate(aggregate)
    case 'response_byte_claim_mismatch':
      aggregate.results[2].transport.raw_response_bytes += 1
      return validateProbeAggregate(aggregate)
    case 'capability_byte_limit':
      padTransportToBytes(aggregate.results[2], validRequestCores[2].response_byte_limit + 1)
      return validateProbeAggregate(aggregate)
    case 'total_byte_budget':
      padTransportToBytes(aggregate.results[0], 60000)
      padTransportToBytes(aggregate.results[1], 990000)
      rebindSequentialPermits()
      return validateProbeAggregate(aggregate)
    case 'total_duration':
      aggregate.results[0].transport.request_started_at = '2026-08-27T10:20:20.000Z'
      aggregate.results[0].transport.response_received_at = '2026-08-27T10:20:23.500Z'
      aggregate.results[1].request.permit!.issued_at = '2026-08-27T10:20:27.000Z'
      aggregate.results[1].transport.request_started_at = '2026-08-27T10:20:28.000Z'
      aggregate.results[1].transport.response_received_at = '2026-08-27T10:20:31.500Z'
      aggregate.results[2].request.permit!.issued_at = '2026-08-27T10:20:35.000Z'
      aggregate.results[2].transport.request_started_at = '2026-08-27T10:20:36.000Z'
      aggregate.results[2].transport.response_received_at = '2026-08-27T10:20:39.500Z'
      rebindSequentialPermits()
      return validateProbeAggregate(aggregate)
    case 'fill_record_limit': {
      const rows = aggregate.results[2].response.body.data
      while (rows.length < 11) {
        const row = structuredClone(rows[0])
        row.tradeId = String(820000100 + rows.length)
        row.billId = String(825000100 + rows.length)
        rows.push(row)
      }
      rebindTransportEvidence(aggregate.results[2])
      return validateProbeAggregate(aggregate)
    }
    case 'transport_untrusted':
      aggregate.results[2].transport.source = 'request_supplied_transport' as unknown as 'trusted_server_transport'
      return validateProbeAggregate(aggregate)
    case 'transport_time_unparseable':
      aggregate.results[2].transport.response_received_at = 'not-a-date'
      return validateProbeAggregate(aggregate)
    case 'request_timeout':
      aggregate.results[2].transport.request_started_at = '2026-08-27T10:20:22.000Z'
      aggregate.results[2].transport.response_received_at = '2026-08-27T10:20:26.001Z'
      return validateProbeAggregate(aggregate)
    default:
      return 'unhandled_probe_aggregate_mutation'
  }
}

function validateNegativeCase(fixture: NegativeCase): string {
  const input = fixture.input
  switch (fixture.mutation) {
    case 'response_code_nonzero':
    case 'response_shape':
      return validateEnvelope(input)
    case 'origin_pin':
    case 'method_pin':
    case 'environment_pin':
    case 'port_pin':
    case 'redirect_pin':
    case 'path_pin':
    case 'query_pin':
    case 'header_allowlist':
    case 'permit_missing': {
      const merged = structuredClone(validSyntheticRequest)
      Object.assign(merged, input)
      if ('headers' in input) merged.headers = input.headers as Record<string, string>
      if (Array.isArray(input.extra_header_names)) {
        for (const name of input.extra_header_names) merged.headers[String(name)] = 'runtime'
      }
      if (fixture.mutation === 'permit_missing') merged.permit = null
      return validateSyntheticRequest(merged)
    }
    case 'permit_replay': {
      const merged = structuredClone(validSyntheticRequest)
      merged.permit!.state = 'consumed'
      merged.permit!.consumption_count = Number(input.permit_consumption_count)
      return validateSyntheticRequest(merged)
    }
    case 'permit_claim': {
      const merged = structuredClone(validSyntheticRequest)
      if (typeof input.field === 'string') merged.permit![input.field] = input.value
      return validateSyntheticRequest(merged)
    }
    case 'runtime_clock': {
      const runtimeClock = structuredClone(validTrustedRuntimeClock) as unknown as JsonObject
      Object.assign(runtimeClock, input)
      return validateSyntheticRequest(
        structuredClone(validSyntheticRequest),
        validRequestCore,
        runtimeClock as unknown as TrustedRuntimeClock,
      )
    }
    case 'request_and_permit_claim': {
      const merged = structuredClone(validSyntheticRequest)
      const field = String(input.field)
      const mutableRequest = merged as unknown as JsonObject
      mutableRequest[field] = input.value
      merged.permit![field] = input.value
      merged.permit!.request_descriptor_sha256 = sha256Canonical(requestDescriptor(merged))
      return validateSyntheticRequest(merged)
    }
    case 'request_budget':
      return Number(input.attempted_requests) > profile.minimal_probe_profile.budget.maximum_requests
        ? 'probe_request_budget_exceeded'
        : 'accepted'
    case 'response_budget':
      return Number(input.total_response_bytes) > profile.minimal_probe_profile.budget.maximum_total_response_bytes
        ? 'probe_response_budget_exceeded'
        : 'accepted'
    case 'timeout':
      return Number(input.request_duration_ms) > profile.minimal_probe_profile.budget.request_timeout_ms
        ? 'provider_request_timeout'
        : 'accepted'
    case 'deadline':
      return Number(input.probe_duration_ms) > profile.minimal_probe_profile.budget.maximum_duration_ms
        ? 'probe_deadline_exceeded'
        : 'accepted'
    case 'partial_success':
      return Array.isArray(input.failed_request_ids) && input.failed_request_ids.length > 0 && input.apply_requested === true
        ? 'partial_probe_apply_forbidden'
        : 'accepted'
    case 'apply_identity':
      return input.apply_requested === true && input.identity_digest === '' ? 'account_identity_not_observed' : 'accepted'
    case 'identity_shape':
      return typeof input.uid === 'string' && /^[0-9]+$/.test(input.uid) ? 'accepted' : 'account_identity_not_observed'
    case 'unknown_enum':
    case 'position_mode_side_conflict':
    case 'position_direction':
    case 'position_schema':
      return validatePositionSemantics(input)
    case 'decimal':
      return validDecimal(input.fillSz) ? 'accepted' : 'provider_decimal_rejected'
    case 'quantity_sign':
      return strictlyPositiveDecimal(input.fillSz) ? 'accepted' : 'provider_quantity_semantics_blocked'
    case 'positive_quantity':
      return strictlyPositiveDecimal(input.value) ? 'accepted' : 'provider_quantity_semantics_blocked'
    case 'stable_id':
      return typeof input.tradeId === 'string' && /^[0-9]+$/.test(input.tradeId) ? 'accepted' : 'provider_event_identity_blocked'
    case 'order_link':
      return typeof input.ordId === 'string' && /^[0-9]+$/.test(input.ordId)
        ? 'accepted'
        : 'provider_order_link_blocked_initial_profile'
    case 'contract_class':
    case 'unit_metadata':
    case 'instrument_state':
      return validateInstrument({ ...baseInstrument, ...input })
    case 'bill_enum':
      return input.type === '999' || input.subType === '999' ? 'provider_financial_event_mapping_blocked' : 'accepted'
    case 'pagination_replay':
      return input.previous_cursor === input.next_cursor || input.page_digest_repeated === true
        ? 'provider_pagination_progress_blocked'
        : 'accepted'
    case 'pagination_direction':
      return input.after && input.before ? 'provider_pagination_direction_rejected' : 'accepted'
    case 'window_budget':
      return Number(input.window_duration_ms) > 604800000 ? 'provider_probe_window_rejected' : 'accepted'
    case 'retention':
      return input.window_status === 'older_than_documented_three_month_horizon'
        ? 'provider_retention_scope_rejected'
        : 'accepted'
    case 'permission_tokens':
      return validPermissionTokens(input.perm) ? 'accepted' : 'provider_permission_scope_rejected'
    case 'ip_allowlist':
      return validateIpBinding(input.ip, positiveCase('positive_account_config_main_net').authority)
    case 'mfa_attestation':
      return input.account_mfa_attested === true ? 'accepted' : 'account_mfa_attestation_required'
    case 'incident_status':
      return input.incident_status === 'clear' ? 'accepted' : 'credential_incident_blocks_authority'
    case 'pnl_formula':
    case 'pnl_components':
      return validatePositionPnl(input)
    case 'settled_pnl_semantics':
      return normalizedSettledPnl(input).error ?? 'accepted'
    case 'position_currency':
      return input.ccy === 'USDT' ? 'accepted' : 'provider_position_currency_rejected'
    case 'pagination_cursor_field': {
      const capability = profile.capabilities.find((entry) => entry.capability_id === input.capability_id)
      return capability?.pagination_contract.cursor_field === input.cursor_field
        ? 'accepted'
        : 'provider_pagination_cursor_contract_rejected'
    }
    case 'filter_clock': {
      const capability = profile.capabilities.find((entry) => entry.capability_id === input.capability_id)
      return capability?.pagination_contract.filter_clock === input.filter_clock
        ? 'accepted'
        : 'provider_filter_clock_contract_rejected'
    }
    case 'response_record':
      return validateMutatedPositiveRecord(input)
    case 'duplicate_record':
      return validateDuplicatePositiveRecord(input)
    case 'probe_aggregate':
      return validateAggregateMutation(input)
    default:
      return 'unhandled_negative_fixture'
  }
}

describe('MB5 OKX provider contract', () => {
  it('binds the connected API-provider decision without changing existing OKX CSV support', () => {
    expect(profile).toMatchObject({
      schema_version: 'equora_mb5_okx_contract_v1',
      phase: 'MB5',
      status: 'local_contract_candidate_second_provider_not_built',
    })
    expect(profile.decision).toMatchObject({
      provider_code: 'okx',
      adapter_version: 'not_built',
      instrument_type: 'SWAP',
      settlement_currency: 'USDT',
      contract_style: 'linear_perpetual',
      broker_sync_api_adapter_built: false,
      connected_provider_registered: false,
      api_read_provider_supported: false,
      api_read_provider_observed: false,
      existing_manual_okx_csv_import_changed: false,
    })
    expect(decision).toContain('OKX_BROKER_SYNC_API_ADAPTER_BUILT = false')
    expect(decision).toContain('EXISTING_OKX_CSV_IMPORT_CHANGED = false')
    expect(decision).toContain('OKX_ACCOUNT_AND_JURISDICTION_ELIGIBILITY = UNCONFIRMED')
    expect(decision).toContain('OKX_COMMERCIAL_AUTHORIZATION = BLOCKED_PENDING_EXPLICIT_WRITTEN_OKX_AUTHORIZATION_OR_NEW_EXPLICITLY_PERMITTING_VERSIONED_OKX_CONTRACT')
    expect(decision).toContain('OKX_COMMERCIAL_RELEASE = BLOCKED')
    expect(decision).not.toContain('OKX_COMMERCIAL_RELEASE = BLOCKED_PENDING_ELIGIBILITY_OR_WRITTEN_AUTHORIZATION')
    expect(contract).toContain('bestehender manueller OKX-CSV-Import unverändert')
    expect(fixtures.provider_contract_version).toBe(profile.decision.provider_contract_version)
    expect(contract).toContain('okx-swap-read-contract/2026-08-27-mb5.6')
    expect(profile.claim_contract.local_mb5_pass_meaning).toBe('contract_fixture_and_review_readiness_only')
  })

  it('keeps every external and Git release authority false', () => {
    expect(Object.values(profile.authority_boundary)).not.toContain(true)
    expect(profile.authority_boundary.runtime_mode).toBe('off')
    expect(profile.minimal_probe_profile).toMatchObject({
      status: 'contract_only_not_authorized_not_executable',
      missing_runtime_authority: true,
      missing_credentials: true,
      missing_identity_authority: true,
      missing_window_authority: true,
      missing_single_use_permits: true,
    })
  })

  it('pins official sources and a strict written commercial authorization gate', () => {
    expect(profile.official_sources.map((source) => source.url)).toEqual([
      'https://www.okx.com/docs-v5/en/',
      'https://www.okx.com/docs-v5/log_en/',
      'https://www.okx.com/en-eu/help/api-faq-eea',
      'https://www.okx.com/en-eu/help/okx-api-agreement',
      'https://www.okx.com/en-au/help/how-can-i-do-derivatives-trading-with-the-jupyter-notebook',
    ])
    expect(profile.official_sources.slice(0, 4).every((source) => source.accessed_on === '2026-08-26')).toBe(true)
    expect(profile.official_sources[4].accessed_on).toBe('2026-08-27')
    expect(profile.official_sources[4].claims).toEqual([
      'derivative_contract_notional_equals_ctVal_times_ctMult_in_ctValCcy',
    ])
    expect(profile.legal_product_gate).toMatchObject({
      commercial_multi_user_or_saas_release: 'blocked_pending_explicit_written_okx_authorization_or_new_explicitly_permitting_versioned_okx_contract',
      market_data_redistribution: 'blocked_pending_explicit_written_okx_authorization_or_new_explicitly_permitting_versioned_okx_contract',
      gate_may_not_be_satisfied_by_local_tests: true,
    })
  })

  it('requires provider-reported read-only permissions, IP binding, MFA and incident response', () => {
    expect(profile.credential_contract).toMatchObject({
      technical_permission_introspection: 'account_config_perm_reports_current_requesting_api_key_permissions',
      accepted_permission_evidence: 'provider_reported_perm_exactly_read_only_plus_user_attestation',
      permission_tokens_allowed: ['read_only'],
      permission_tokens_blocking: ['trade', 'withdraw'],
      empty_duplicate_or_unknown_permission_token: 'block_probe_and_apply',
      ip_allowlist: 'canonical_provider_reported_ip_set_must_exactly_equal_authority_pinned_authorized_egress_ip_set_digest',
      account_mfa_user_attestation: 'required_before_probe',
      raw_credential_persistence: false,
      raw_credential_logging: false,
      raw_header_logging: false,
    })
    const incident = profile.credential_contract.incident_response as JsonObject
    expect(incident).toMatchObject({
      suspected_or_confirmed_compromise: 'block_all_new_permits_setup_apply_capture_and_import',
      equora_may_execute_actions_automatically: false,
    })
    expect(incident.required_user_actions).toEqual([
      'immediately_revoke_affected_api_key_and_agent_authorization',
      'rotate_affected_api_key',
      'notify_okx',
    ])
  })

  it('pins the identity HMAC to exact NUL-separated UTF-8 bytes and rejects the legacy JSON message', () => {
    expect(profile.identity_contract).toMatchObject({
      message_encoding: 'UTF-8',
      message_fields_in_order: ['domain_separator', 'provider_code', 'environment', 'region_profile_id', 'uid'],
      field_separator_hex: '00',
      message_canonicalization: 'exact_field_order_nul_separated_no_json',
      digest_encoding: 'lowercase_hex',
    })
    const message = [
      'equora:okx-account-identity:v1',
      'okx',
      'demo',
      'okx-eea-demo-v1',
      '700000001',
    ].join('\0')
    expect(Buffer.from(message, 'utf8').toString('hex')).toBe(
      '6571756f72613a6f6b782d6163636f756e742d6964656e746974793a7631006f6b780064656d6f006f6b782d6565612d64656d6f2d763100373030303030303031',
    )
    expect(createHmac('sha256', 'synthetic-fixture-identity-key-v1').update(Buffer.from(message, 'utf8')).digest('hex')).toBe(
      '32f0e02b4cfe57911b5614a0c5047f298f0526b538c08b1bf1832fb44cd30fd9',
    )
    const legacyJsonDigest = createHmac('sha256', 'synthetic-fixture-identity-key-v1').update(canonicalJson({
      domain_separator: 'equora:okx-account-identity:v1',
      provider: 'okx',
      environment: 'demo',
      region_profile_id: 'okx-eea-demo-v1',
      uid: '700000001',
    }), 'utf8').digest('hex')
    expect(legacyJsonDigest).toBe('d70f34b3f6be1a356747cec66123db69c0ace9f135eccbada59cc5e0fda8e865')
    expect(legacyJsonDigest).not.toBe(accountIdentityDigest('700000001'))
    expect(accountIdentityDigest('700000001')).toBe('32f0e02b4cfe57911b5614a0c5047f298f0526b538c08b1bf1832fb44cd30fd9')
  })

  it('allows only constant EEA demo GET descriptors and no fallback origin', () => {
    expect(profile.region_profiles.selected_candidate).toMatchObject({
      profile_id: 'okx-eea-demo-v1',
      https_origin: 'https://eea.okx.com',
      port: 443,
      environment: 'demo',
      required_constant_headers: { 'x-simulated-trading': '1' },
      fallback_origins: [],
      status: 'candidate_not_authorized',
    })
    expect(profile.capabilities).toHaveLength(6)
    for (const capability of profile.capabilities) {
      expect(capability).toMatchObject({
        method: 'GET',
        https_origin: 'https://eea.okx.com',
        port: 443,
        permission: 'Read',
        support_state: 'candidate',
        import_eligibility: 'blocked',
      })
      expect(capability.path).toMatch(/^\/api\/v5\/(?:account|trade)\/[a-z-]+$/)
    }
    expect(profile.explicitly_forbidden.methods).toEqual(['POST', 'PUT', 'PATCH', 'DELETE'])
    expect(profile.explicitly_forbidden.read_semantic_post).toEqual({
      path: '/api/v5/account/bills-history-archive',
      status: 'unsupported_requires_future_a4_and_core_contract_gate',
    })
  })

  it('matches the provider-neutral GET-only core and leaves OKX out of the connected registry', () => {
    expect(core).toMatch(/export type ProviderReadMethod = 'GET'/)
    expect(registry.toLowerCase()).not.toMatch(/['"]okx['"]/)
    expect(profile.explicitly_forbidden.operation_classes).toEqual(expect.arrayContaining([
      'place_order',
      'amend_order',
      'cancel_order',
      'transfer',
      'withdrawal',
      'api_key_management',
      'dynamic_host_or_redirect',
      'automatic_capture',
      'automatic_or_manual_import_execution',
    ]))
  })

  it('recomputes every capability descriptor and exact probe profile digest', () => {
    for (const capability of profile.capabilities) {
      expect(capability.capability_descriptor_sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(capability.capability_descriptor_sha256).toBe(
        sha256Canonical(withoutKey(capability, 'capability_descriptor_sha256')),
      )
    }
    expect(profile.minimal_probe_profile.profile_digest_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(profile.minimal_probe_profile.profile_digest_sha256).toBe(
      sha256Canonical(withoutKey(profile.minimal_probe_profile, 'profile_digest_sha256')),
    )
  })

  it('binds every field of the exact three-read probe to its capability descriptor', () => {
    const probe = profile.minimal_probe_profile
    expect(probe).toMatchObject({
      environment: 'demo',
      region_profile_id: 'okx-eea-demo-v1',
      https_origin: 'https://eea.okx.com',
      port: 443,
      method: 'GET',
      redirect_mode: 'error',
      required_constant_headers: { 'x-simulated-trading': '1' },
    })
    expect(probe.request_sequence).toEqual(expectedProbeRequests)
    const probeCapabilityIds = probe.request_sequence.map((entry) => entry.capability_id)
    expect(new Set(probeCapabilityIds).size).toBe(probeCapabilityIds.length)
    expect(probeCapabilityIds).toEqual(profile.capabilities.filter((entry) => entry.in_minimal_probe).map((entry) => entry.capability_id))
    for (const request of probe.request_sequence) {
      const capability = profile.capabilities.find((entry) => entry.capability_id === request.capability_id)
      expect(capability).toBeDefined()
      const expectedPath = `${capability!.path}${capability!.canonical_query ? `?${capability!.canonical_query}` : ''}`
      expect(request.path_with_canonical_query).toBe(expectedPath)
      expect(request.max_pages).toBe(1)
    }
    expect(probe.budget).toEqual({
      maximum_requests: 3,
      maximum_total_response_bytes: 1048576,
      maximum_duration_ms: 15000,
      request_timeout_ms: 4000,
      maximum_parallel_requests: 1,
      maximum_retries: 0,
      maximum_pages_per_request: 1,
    })
    const summedBytes = probeCapabilityIds.reduce((sum, id) => {
      return sum + profile.capabilities.find((entry) => entry.capability_id === id)!.response_byte_limit
    }, 0)
    expect(summedBytes).toBeGreaterThan(probe.budget.maximum_total_response_bytes)
    expect(probe.required_pre_request_authority_pins).toEqual(expect.arrayContaining([
      'expected_provider_perm_and_ip_projection_digest',
      'expected_account_identity_digest',
      'authorized_egress_ip_set_digest',
      'account_mfa_attestation_digest',
      'incident_clear_attestation_digest',
      'authority_snapshot_sha256',
      'request_descriptor_sha256',
      'window_start_ms_and_window_end_ms',
      'closed_single_use_permit_per_request',
      'total_budget',
    ]))
    expect(probe.required_pre_request_authority_pins).not.toContain('observed_provider_perm_and_ip_projection_digest_after_account_config')
    expect(probe.required_post_response_observations).toEqual(expect.arrayContaining([
      'observed_provider_perm_and_ip_projection_digest_after_account_config',
      'observed_account_identity_digest_after_account_config',
      'trusted_server_transport_response_evidence_per_request',
    ]))
    expect(probe.aggregate_comparison_requirements).toEqual(expect.arrayContaining([
      'observed_provider_projection_equals_expected_permit_projection',
      'observed_account_identity_equals_expected_connection_identity',
      'permit_2_and_3_bind_prior_accepted_response_evidence_and_observed_digests',
      'actual_response_bytes_times_and_record_count_within_bound_budgets',
    ]))
  })

  it('binds all three exact-header requests to distinct closed permits and consumes each once', () => {
    for (let index = 0; index < validProbeAggregate.results.length; index += 1) {
      const syntheticRequest = validProbeAggregate.results[index].request
      const request = validRequestCores[index]
      const permit = syntheticRequest.permit!
      const transition: PermitTransitionContext = {
        authority_generation: Number(permit.authority_generation),
        predecessor_response_evidence_sha256: permit.predecessor_response_evidence_sha256 as string | null,
        observed_provider_perm_and_ip_projection_sha256: permit.observed_provider_perm_and_ip_projection_sha256 as string | null,
        observed_account_identity_sha256: permit.observed_account_identity_sha256 as string | null,
        issued_at: permit.issued_at,
      }
      const runtimeClock: TrustedRuntimeClock = { source: 'trusted_server_clock', server_now_at: validProbeAggregate.results[index].transport.request_started_at }
      expect(Object.keys(syntheticRequest.headers).sort(codePointCompare)).toEqual(allowedHeaderNames)
      expect(validateSyntheticRequest(syntheticRequest, request, runtimeClock, transition)).toBe('accepted')
      expect(Object.keys(syntheticRequest.permit!).sort(codePointCompare)).toEqual(
        [...profile.single_use_permit_contract.closed_claim_fields as string[]].sort(codePointCompare),
      )
      expect(syntheticRequest.permit).toEqual(expectedPermit(request, transition))
      expect(consumePermit(syntheticRequest.permit!)).toMatchObject({
        state: 'consumed',
        consumption_count: 1,
      })
    }
    expect(new Set(validProbeAggregate.results.map((result) => result.request.permit!.permit_id)).size).toBe(3)
  })

  it('uses a trusted canonical server clock and validates the full three-response aggregate before apply', () => {
    expect(canonicalUtcInstant(validTrustedRuntimeClock.server_now_at)).not.toBeNull()
    expect(validateProbeAggregate(validProbeAggregate)).toBe('accepted')
    expect(validProbeAggregate.results.map((result) => result.request.request_sequence)).toEqual([1, 2, 3])
    expect(validProbeAggregate.results.map((result) => result.request.permit!.permit_id)).toEqual([
      'synthetic-permit-probe_account_config-001',
      'synthetic-permit-probe_account_instruments-001',
      'synthetic-permit-probe_fills_history-001',
    ])
    expect(validProbeAggregate.results[0].request.permit).toMatchObject({
      authority_generation: 1,
      predecessor_response_evidence_sha256: null,
      observed_provider_perm_and_ip_projection_sha256: null,
      observed_account_identity_sha256: null,
    })
    for (let index = 1; index < validProbeAggregate.results.length; index += 1) {
      expect(validProbeAggregate.results[index].request.permit).toMatchObject({
        authority_generation: index + 1,
        predecessor_response_evidence_sha256: responseEvidenceSha256(validProbeAggregate.results[index - 1]),
        observed_provider_perm_and_ip_projection_sha256: syntheticAuthorityClaims.expected_provider_perm_and_ip_projection_sha256,
        observed_account_identity_sha256: syntheticAuthorityClaims.expected_account_identity_sha256,
      })
    }
    expect(validProbeAggregate.results.every((result) => validateTransportEvidence(result) === 'accepted')).toBe(true)
    expect(validProbeAggregate.results.reduce((sum, result) => sum + result.transport.raw_response_bytes, 0)).toBeLessThanOrEqual(
      profile.minimal_probe_profile.budget.maximum_total_response_bytes,
    )
    expect(validProbeAggregate.results[2].response.body.data.length).toBeLessThanOrEqual(10)
  })

  it('uses the documented private GET signing prehash without a body', () => {
    expect(profile.signing_contract).toMatchObject({
      method: 'GET',
      body: '',
      prehash: 'timestamp + uppercase_method + request_path_with_canonical_query + empty_body',
      algorithm: 'HMAC-SHA256',
      encoding: 'Base64',
      query_is_part_of_request_path: true,
      redirect_mode: 'error',
    })
    const timestamp = '2026-08-26T10:20:30.123Z'
    const requestPath = '/api/v5/account/instruments?instType=SWAP'
    const prehash = `${timestamp}GET${requestPath}`
    expect(prehash).toBe('2026-08-26T10:20:30.123ZGET/api/v5/account/instruments?instType=SWAP')
    const signature = createHmac('sha256', 'synthetic-fixture-secret').update(prehash).digest('base64')
    expect(signature).toBe('50GNMV+TJLER/69D+SF7FTGe1MMCgm9V1shn6exXaDg=')
  })

  it('executes every positive Golden Case against local contract oracles', () => {
    expect(fixtures.positive_cases).toHaveLength(11)
    for (const fixture of fixtures.positive_cases) {
      expect(fixture.synthetic).toBe(true)
      expect(validatePositiveCase(fixture)).toEqual(fixture.expected)
    }
    const positiveCapabilityIds = new Set(fixtures.positive_cases.map((entry) => entry.capability_id))
    expect(profile.capabilities.every((capability) => positiveCapabilityIds.has(capability.capability_id))).toBe(true)
  })

  it('checks every nonempty positive row against its hash-bound exact projection contract', () => {
    for (const fixture of fixtures.positive_cases) {
      for (const row of fixture.response.body.data) {
        const capability = profile.capabilities.find((entry) => entry.capability_id === fixture.capability_id)!
        expect(Object.keys(row).sort(codePointCompare), fixture.case_id).toEqual(
          [...capability.response_contract.exact_projection_fields as string[]].sort(codePointCompare),
        )
        expect(validateExactProjection(fixture.capability_id, row), fixture.case_id).toBe('accepted')
      }
    }
  })

  it('executes every negative fixture and compares computed errors to an independent oracle map', () => {
    const fixtureIds = fixtures.negative_cases.map((entry) => entry.case_id)
    expect(new Set(fixtureIds).size).toBe(fixtureIds.length)
    expect(fixtureIds.sort(codePointCompare)).toEqual(Object.keys(EXPECTED_NEGATIVE_ERRORS).sort(codePointCompare))
    for (const fixture of fixtures.negative_cases) {
      const independentlyExpected = EXPECTED_NEGATIVE_ERRORS[fixture.case_id]
      expect(fixture.expected_error, fixture.case_id).toBe(independentlyExpected)
      expect(validateNegativeCase(fixture), fixture.case_id).toBe(independentlyExpected)
    }
  })

  it('pins per-capability cursor, filter clock and position observation semantics', () => {
    const capabilities = new Map(profile.capabilities.map((entry) => [entry.capability_id, entry]))
    expect(capabilities.get('okx_orders_archive_swap_v1')!.pagination_contract).toMatchObject({
      cursor_field: 'ordId',
      filter_clock: 'cTime',
      zero_fill_canceled_orders: 'absent_from_archive_available_only_on_excluded_last_7_days_endpoint_for_2_hours',
    })
    expect(capabilities.get('okx_fills_history_swap_v1')!.pagination_contract).toMatchObject({
      cursor_field: 'billId',
      filter_clock: 'ts',
      event_clock: 'fillTime',
    })
    expect(capabilities.get('okx_positions_history_swap_v1')!.pagination_contract).toMatchObject({
      cursor_field: 'uTime',
      observation_identity: 'posId_plus_uTime',
      same_uTime_contract: 'all_same_uTime_records_returned_together',
    })
    expect(capabilities.get('okx_bills_archive_swap_v1')!.pagination_contract).toMatchObject({
      cursor_field: 'billId',
      filter_clock: 'ts',
    })
  })

  it('uses scaled integer decimals and a nontrivial contract multiplier', () => {
    expect(validDecimal('0')).toBe(true)
    expect(validDecimal('-0')).toBe(false)
    expect(validDecimal('1e3')).toBe(false)
    expect(validDecimal('+1')).toBe(false)
    expect(validDecimal('01')).toBe(false)
    expect(strictlyPositiveDecimal('0')).toBe(false)
    expect(strictlyPositiveDecimal('0.0')).toBe(false)
    expect(strictlyPositiveDecimal('0.000')).toBe(false)
    expect(nonnegativeDecimal('0.0')).toBe(true)
    expect(addDecimals(['0.033', '-0.004', '-0.001', '0', '0'])).toBe('0.028')
    expect(multiplyDecimals(['3', '0.01', '10'])).toBe('0.3')
    const instrument = positiveCase('positive_usdt_linear_swap_instrument')
    expect(instrument.response.body.data[0].ctMult).toBe('10')
    expect(validatePositiveCase(instrument)).toMatchObject({
      eligible_instrument_count: 1,
      instrument_contracts: [{ base_quantity_for_size_3: '0.3' }],
    })
    expect(profile.financial_semantics).toMatchObject({
      decimal_grammar: '^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$',
      negative_zero: 'forbidden',
      maximum_integer_digits: 38,
      maximum_fraction_digits: 18,
      base_quantity_derivation_source: 'OKX-SRC-005',
      position_history_forbidden_field_assumption: 'no_pos_field_direction_is_explicit',
      position_realized_pnl_invariant: 'realizedPnl_equals_pnl_plus_fee_plus_fundingFee_plus_liqPenalty_plus_settledPnl',
      swap_settledPnl_semantics: 'field_required_empty_not_applicable_preserve_raw_empty_and_normalize_to_zero_only_for_invariant',
    })
    const position = positiveCase('positive_position_net_mode').response.body.data[0]
    expect(position.settledPnl).toBe('')
    expect(normalizedSettledPnl(position)).toEqual({ value: '0', provider_state: 'not_applicable_empty' })
  })

  it('distinguishes successful empty scope from errors without completeness claims', () => {
    expect(validateEnvelope(positiveCase('positive_successful_empty_fills_page').response)).toBe('success')
    expect(profile.response_envelope_contract.empty_array_meaning).toBe('successful_empty_exact_request_scope_only')
    expect(profile.pagination_and_completeness.global_completeness_claim).toBe(false)
    expect(profile.claim_contract.forbidden).toEqual(expect.arrayContaining([
      'complete_account_history',
      'gap_free_history',
      'production_ready',
      'connected_okx_broker_sync_api_provider_supported_or_available',
    ]))
  })

  it('contains no unresolved digest sentinel or probable real secret under the broad offline scanner', () => {
    const scopeText = [
      readFileSync(profilePath, 'utf8'),
      decision,
      contract,
      readFileSync(fixturePath, 'utf8'),
      readFileSync(testPath, 'utf8'),
    ].join('\n')
    const unresolvedHashSentinel = ['PEND', 'ING'].join('')
    expect(scopeText).not.toContain(`: "${unresolvedHashSentinel}"`)
    expect(broadSecretScanner(scopeText)).toEqual([])
    expect(profile.hash_contract.validator_dependencies_outside_candidate_scope).toEqual([
      {
        path: 'scripts/multibroker-mb4-validation-lib.mjs',
        sha256: 'd8dd6fe7839d502b906965861063b39b343a75aa0bd2a4e65e31fe4f39fbf820',
        role: 'broad_offline_secret_encoding_control_and_duplicate_json_validator',
        git_binding: 'unchanged_HEAD_25793bc873faa8fd89d42bfa2ddaea4cd6188a3b',
      },
      {
        path: 'lib/server/broker-core-contracts.ts',
        sha256: 'c72eeb57aa6de4f122bce185c794929664c11a4737eedcfde102cde5520811e1',
        role: 'provider_neutral_get_only_core_contract_read_by_candidate_test',
        git_binding: 'unchanged_HEAD_25793bc873faa8fd89d42bfa2ddaea4cd6188a3b',
      },
      {
        path: 'lib/server/broker-code-registry.ts',
        sha256: 'f028bb4d90834ea747ebe3605257193bd1d456a608808fe393f8e4da5c94e002',
        role: 'connected_provider_registry_exclusion_read_by_candidate_test',
        git_binding: 'unchanged_HEAD_25793bc873faa8fd89d42bfa2ddaea4cd6188a3b',
      },
    ])
    expect(createHash('sha256').update(readFileSync(validatorDependencyPath)).digest('hex')).toBe(
      'd8dd6fe7839d502b906965861063b39b343a75aa0bd2a4e65e31fe4f39fbf820',
    )
    expect(createHash('sha256').update(readFileSync(corePath)).digest('hex')).toBe(
      'c72eeb57aa6de4f122bce185c794929664c11a4737eedcfde102cde5520811e1',
    )
    expect(createHash('sha256').update(readFileSync(registryPath)).digest('hex')).toBe(
      'f028bb4d90834ea747ebe3605257193bd1d456a608808fe393f8e4da5c94e002',
    )
  })
})

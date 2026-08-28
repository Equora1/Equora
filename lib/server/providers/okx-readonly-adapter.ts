import 'server-only'

import {
  PAGE_SEQUENCE_CONTRACT_VERSION,
  computeBrokerDescriptorQueryDigest,
  computeBrokerWireEvidenceDigest,
  computeCanonicalBrokerValueDigest,
  validateBrokerConnectionProbeWork,
  type AdapterVersion,
  type BrokerFailure,
  type CanonicalJsonValue,
  type ConnectionProbeCapabilityResultCandidate,
  type ProviderCapabilityRef,
  type ProviderCode,
  type ProviderContractVersion,
  type ReadCapabilityDescriptor,
  type ReadOnlyBrokerAdapter,
  type RuntimeValidatedConnectionProbeWire,
} from '@/lib/server/broker-core-contracts'
import { canonicalizeBrokerEgressIpSet } from '@/lib/server/broker-ip-address'

export const OKX_PROVIDER_CODE = 'okx' as ProviderCode
export const OKX_PROVIDER_CONTRACT_VERSION = 'okx-swap-read-contract/2026-08-27-mb5.6' as ProviderContractVersion
export const OKX_ADAPTER_VERSION = 'v57_61_0_mb6_candidate_1' as AdapterVersion
export const OKX_PROFILE_ID = 'okx-eea-demo-usdt-swap-minimal-read-v1' as const
export const OKX_PROFILE_VERSION = '2026-08-27-mb5.6' as const
export const OKX_PROFILE_DIGEST = '12d3498031e982fd1e0946ac63d47a888409b9e389125bf68c7c8d61274f9f22' as const
export const OKX_EEA_DEMO_ORIGIN = 'https://eea.okx.com' as const
export const OKX_ADAPTER_PLAN_CONTRACT_VERSION = 'equora-okx-broker-read-plan-mb6-candidate-v1' as const

export type OkxMinimalProbeCapabilityId =
  | 'okx_account_config_v1'
  | 'okx_account_instruments_swap_v1'
  | 'okx_fills_history_swap_v1'

export type OkxAccountConfigRecord = Readonly<{
  uid: string
  mainUid: string
  acctLv: '1' | '2' | '3' | '4'
  posMode: 'net_mode' | 'long_short_mode'
  perm: 'read_only'
  ip: string
}>

export type OkxInstrumentRecord = Readonly<{
  instId: string
  instType: 'SWAP'
  instFamily: string
  settleCcy: string
  ctType: string
  ctVal: string
  ctMult: string
  ctValCcy: string
  lotSz: string
  tickSz: string
  state: string
}>

export type OkxFillRecord = Readonly<{
  instId: string
  instType: 'SWAP'
  tradeId: string
  billId: string
  ordId: string
  side: 'buy' | 'sell'
  posSide: 'net' | 'long' | 'short'
  fillSz: string
  fillPx: string
  fee: string
  feeCcy: 'USDT'
  fillPnl: string
  fillTime: string
  ts: string
}>

export type OkxInspectedProbeResponse = Readonly<
  | { capabilityId: 'okx_account_config_v1'; records: readonly [OkxAccountConfigRecord] }
  | { capabilityId: 'okx_account_instruments_swap_v1'; records: readonly OkxInstrumentRecord[]; selected: readonly OkxInstrumentRecord[] }
  | { capabilityId: 'okx_fills_history_swap_v1'; records: readonly OkxFillRecord[] }
>

export type OkxCandidateErrorCode =
  | 'capture_not_built'
  | 'unsupported_contract'
  | 'invalid_query'
  | 'provider_unavailable'
  | 'provider_rejected'
  | 'rate_limited'
  | 'authentication_rejected'
  | 'permission_rejected'
  | 'response_too_large'
  | 'malformed_response'
  | 'response_contract_rejected'
  | 'aggregate_contract_rejected'
  | 'runtime_disabled'
  | 'permit_rejected'
  | 'budget_rejected'

export class OkxCandidateError extends Error {
  constructor(
    readonly code: OkxCandidateErrorCode,
    message: string,
    readonly httpStatus: number | null = null,
  ) {
    super(message)
    this.name = 'OkxCandidateError'
  }
}

type CapabilityDefinition = Readonly<{
  capabilityKind: ProviderCapabilityRef['capabilityKind']
  capabilityId: OkxMinimalProbeCapabilityId
  providerCapabilityVersion: string
  profileCapabilityDescriptorDigest: string
  path: string
  dataClass: 'metadata' | 'account_history' | 'account_identity'
  queryContractVersion: string
  responseContractVersion: string
  responseByteLimit: number
}>

const CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[] = Object.freeze([
  Object.freeze({
    capabilityKind: 'account_identity',
    capabilityId: 'okx_account_config_v1',
    providerCapabilityVersion: 'v1',
    profileCapabilityDescriptorDigest: 'e41bdb29820fdf756df33c55c6dfab1fdf9c5bdeef1a6b9d4e0c39b6368e5917',
    path: '/api/v5/account/config',
    dataClass: 'account_identity',
    queryContractVersion: 'okx-account-config-query-mb6-candidate-v1',
    responseContractVersion: 'okx-account-config-response/2026-08-27-mb5.6',
    responseByteLimit: 65_536,
  }),
  Object.freeze({
    capabilityKind: 'instrument_metadata',
    capabilityId: 'okx_account_instruments_swap_v1',
    providerCapabilityVersion: 'v1',
    profileCapabilityDescriptorDigest: '0ed2246a0e6437fc6dc4ba341d0b881d00dee4fc697cd73fdb330d48167f18ad',
    path: '/api/v5/account/instruments',
    dataClass: 'metadata',
    queryContractVersion: 'okx-account-instruments-swap-query-mb6-candidate-v1',
    responseContractVersion: 'okx-account-instruments-swap-response/2026-08-27-mb5.6',
    responseByteLimit: 1_048_576,
  }),
  Object.freeze({
    capabilityKind: 'historical_executions',
    capabilityId: 'okx_fills_history_swap_v1',
    providerCapabilityVersion: 'v1',
    profileCapabilityDescriptorDigest: 'a4c5ef944969eafff9748f7cbb1b71fbcf4348152bf53e9e17660cf7ab1c7945',
    path: '/api/v5/trade/fills-history',
    dataClass: 'account_history',
    queryContractVersion: 'okx-fills-history-swap-query-mb6-candidate-v1',
    responseContractVersion: 'okx-fills-history-swap-response/2026-08-27-mb5.6',
    responseByteLimit: 262_144,
  }),
])

const DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/
const POSITIVE_ID_PATTERN = /^[1-9][0-9]*$/
const UNIX_MILLISECONDS_PATTERN = /^[0-9]{13}$/
const INSTRUMENT_ID_PATTERN = /^([A-Z0-9]+)-USDT-SWAP$/
const MAX_JSON_DEPTH = 64
const MAX_JSON_NODES = 50_000
type ProxyGuard = (value: object) => boolean
const TRUSTED_CORE_PROXY_GUARD: ProxyGuard = () => false

function assertClosedDataRecord(
  value: unknown,
  expected: readonly string[],
  code: 'invalid_query' | 'malformed_response' | 'response_contract_rejected',
  message: string,
  proxyGuard: ProxyGuard = TRUSTED_CORE_PROXY_GUARD,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || proxyGuard(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.getOwnPropertySymbols(value).length > 0) {
    throw new OkxCandidateError(code, message)
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const actual = Object.getOwnPropertyNames(value).sort()
  const required = [...expected].sort()
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])
    || actual.some((key) => {
      const descriptor = descriptors[key]
      return !descriptor?.enumerable || !('value' in descriptor) || descriptor.value === undefined
    })) {
    throw new OkxCandidateError(code, message)
  }
}

function exactKeys(value: unknown, expected: readonly string[], message: string): asserts value is Record<string, unknown> {
  assertClosedDataRecord(value, expected, 'response_contract_rejected', message)
}

function assertClosedByteArray(value: unknown, proxyGuard: ProxyGuard): asserts value is readonly number[] {
  if (!Array.isArray(value) || proxyGuard(value) || Object.getPrototypeOf(value) !== Array.prototype
    || Object.getOwnPropertySymbols(value).length > 0) {
    throw new OkxCandidateError('malformed_response', 'OKX-Antwort enthält ungültige Wirebytes.')
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (!lengthDescriptor || lengthDescriptor.enumerable || !('value' in lengthDescriptor)
    || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
    throw new OkxCandidateError('malformed_response', 'OKX-Antwort enthält ungültige Wirebytes.')
  }
  const length = lengthDescriptor.value as number
  const names = Object.getOwnPropertyNames(value)
  if (names.length !== length + 1 || !names.includes('length')) {
    throw new OkxCandidateError('malformed_response', 'OKX-Antwort enthält ungültige Wirebytes.')
  }
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor?.enumerable || !('value' in descriptor) || !Number.isInteger(descriptor.value)
      || descriptor.value < 0 || descriptor.value > 255) {
      throw new OkxCandidateError('malformed_response', 'OKX-Antwort enthält ungültige Wirebytes.')
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry)
  return Object.freeze(value)
}

function assertValidUnicode(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) {
        throw new OkxCandidateError('malformed_response', 'OKX-Antwort enthält ungültiges Unicode.')
      }
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new OkxCandidateError('malformed_response', 'OKX-Antwort enthält ungültiges Unicode.')
    }
  }
}

function assertUnambiguousJson(text: string) {
  let offset = 0
  let nodes = 0

  function fail(): never {
    throw new OkxCandidateError('malformed_response', 'OKX-Antwort enthält kein eindeutiges JSON.')
  }

  function skipWhitespace() {
    while (/[\t\n\r ]/.test(text[offset] ?? '')) offset += 1
  }

  function parseString(): string {
    if (text[offset] !== '"') fail()
    const start = offset
    offset += 1
    while (offset < text.length) {
      if (text[offset] === '\\') {
        offset += 2
        continue
      }
      if (text[offset] === '"') {
        offset += 1
        try {
          const value = JSON.parse(text.slice(start, offset))
          if (typeof value !== 'string') fail()
          assertValidUnicode(value)
          return value as string
        } catch (error) {
          if (error instanceof OkxCandidateError) throw error
          fail()
        }
      }
      if (text.charCodeAt(offset) < 0x20) fail()
      offset += 1
    }
    fail()
  }

  function parseValue(depth: number): void {
    nodes += 1
    if (depth > MAX_JSON_DEPTH || nodes > MAX_JSON_NODES) fail()
    skipWhitespace()
    const character = text[offset]
    if (character === '{') return parseObject(depth + 1)
    if (character === '[') return parseArray(depth + 1)
    if (character === '"') {
      parseString()
      return
    }
    const scalar = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(offset))
    if (!scalar) fail()
    offset += scalar[0].length
  }

  function parseObject(depth: number) {
    const keys = new Set<string>()
    offset += 1
    skipWhitespace()
    if (text[offset] === '}') {
      offset += 1
      return
    }
    while (offset < text.length) {
      skipWhitespace()
      const key = parseString()
      if (keys.has(key)) fail()
      keys.add(key)
      skipWhitespace()
      if (text[offset] !== ':') fail()
      offset += 1
      parseValue(depth)
      skipWhitespace()
      if (text[offset] === '}') {
        offset += 1
        return
      }
      if (text[offset] !== ',') fail()
      offset += 1
    }
    fail()
  }

  function parseArray(depth: number) {
    offset += 1
    skipWhitespace()
    if (text[offset] === ']') {
      offset += 1
      return
    }
    while (offset < text.length) {
      parseValue(depth)
      skipWhitespace()
      if (text[offset] === ']') {
        offset += 1
        return
      }
      if (text[offset] !== ',') fail()
      offset += 1
    }
    fail()
  }

  parseValue(0)
  skipWhitespace()
  if (offset !== text.length) fail()
}

function parseJsonBytes(rawBody: readonly number[], responseByteLimit: number, proxyGuard: ProxyGuard) {
  assertClosedByteArray(rawBody, proxyGuard)
  if (rawBody.length < 1 || rawBody.length > responseByteLimit) {
    throw new OkxCandidateError('response_too_large', 'OKX-Antwort überschreitet das gebundene Bytelimit.')
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(rawBody))
  } catch {
    throw new OkxCandidateError('malformed_response', 'OKX-Antwort ist nicht gültiges UTF-8.')
  }
  assertUnambiguousJson(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new OkxCandidateError('malformed_response', 'OKX-Antwort enthält ungültiges JSON.')
  }
  return deepFreeze(parsed)
}

function decimal(value: unknown, options: Readonly<{ signed: boolean; strictlyPositive: boolean }>) {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value) || value === '-0'
    || value.startsWith('-0.') && /^-0\.0+$/.test(value)) {
    return false
  }
  const [integer, fraction = ''] = value.replace(/^-/, '').split('.')
  if (integer.length > 38 || fraction.length > 18 || !options.signed && value.startsWith('-')) return false
  if (options.strictlyPositive) return !value.startsWith('-') && /[1-9]/.test(`${integer}${fraction}`)
  return true
}

function nonEmptyString(value: unknown, maximumLength = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength
}

function unixMilliseconds(value: unknown): value is string {
  return typeof value === 'string' && UNIX_MILLISECONDS_PATTERN.test(value)
}

function accountRecord(value: unknown): OkxAccountConfigRecord {
  exactKeys(value, ['uid', 'mainUid', 'acctLv', 'posMode', 'perm', 'ip'], 'OKX-Accountprojektion ist nicht vertragskonform.')
  if (typeof value.uid !== 'string' || !POSITIVE_ID_PATTERN.test(value.uid)
    || typeof value.mainUid !== 'string' || !POSITIVE_ID_PATTERN.test(value.mainUid)
    || typeof value.acctLv !== 'string' || !['1', '2', '3', '4'].includes(value.acctLv)
    || value.posMode !== 'net_mode' && value.posMode !== 'long_short_mode'
    || value.perm !== 'read_only'
    || typeof value.ip !== 'string') {
    throw new OkxCandidateError('permission_rejected', 'OKX-Account- oder Permissionprojektion wurde blockiert.')
  }
  const ips = canonicalizeBrokerEgressIpSet(value.ip.split(','), 'synthetic_documentation')
  if (!ips) {
    throw new OkxCandidateError('permission_rejected', 'OKX-IP-Projektion wurde blockiert.')
  }
  return deepFreeze(value as unknown as OkxAccountConfigRecord)
}

function instrumentBaseRecord(value: unknown): OkxInstrumentRecord {
  exactKeys(value, [
    'instId', 'instType', 'instFamily', 'settleCcy', 'ctType', 'ctVal', 'ctMult', 'ctValCcy',
    'lotSz', 'tickSz', 'state',
  ], 'OKX-Instrumentprojektion ist nicht vertragskonform.')
  for (const field of Object.keys(value)) {
    if (typeof value[field] !== 'string') {
      throw new OkxCandidateError('response_contract_rejected', 'OKX-Instrumentfelder müssen Strings sein.')
    }
  }
  if (value.instType !== 'SWAP') {
    throw new OkxCandidateError('response_contract_rejected', 'OKX-Instrumenttyp liegt außerhalb des SWAP-Vertrags.')
  }
  return deepFreeze(value as unknown as OkxInstrumentRecord)
}

function selectedInstrument(record: OkxInstrumentRecord) {
  const match = INSTRUMENT_ID_PATTERN.exec(record.instId)
  const base = match?.[1] ?? null
  if (!base || record.instFamily !== `${base}-USDT` || record.ctValCcy !== base
    || record.settleCcy !== 'USDT' || record.ctType !== 'linear' || record.state !== 'live'
    || !decimal(record.ctVal, { signed: false, strictlyPositive: true })
    || !decimal(record.ctMult, { signed: false, strictlyPositive: true })
    || !decimal(record.lotSz, { signed: false, strictlyPositive: true })
    || !decimal(record.tickSz, { signed: false, strictlyPositive: true })) {
    throw new OkxCandidateError('response_contract_rejected', 'OKX-Instrument liegt außerhalb der gepinnten linearen USDT-Contractklasse.')
  }
}

function fillRecord(value: unknown, windowStartMs: string, windowEndMs: string): OkxFillRecord {
  exactKeys(value, [
    'instId', 'instType', 'tradeId', 'billId', 'ordId', 'side', 'posSide', 'fillSz', 'fillPx',
    'fee', 'feeCcy', 'fillPnl', 'fillTime', 'ts',
  ], 'OKX-Fillprojektion ist nicht vertragskonform.')
  if (!nonEmptyString(value.instId) || value.instType !== 'SWAP'
    || typeof value.tradeId !== 'string' || !POSITIVE_ID_PATTERN.test(value.tradeId)
    || typeof value.billId !== 'string' || !POSITIVE_ID_PATTERN.test(value.billId)
    || typeof value.ordId !== 'string' || !POSITIVE_ID_PATTERN.test(value.ordId)
    || value.side !== 'buy' && value.side !== 'sell'
    || value.posSide !== 'net' && value.posSide !== 'long' && value.posSide !== 'short'
    || !decimal(value.fillSz, { signed: false, strictlyPositive: true })
    || !decimal(value.fillPx, { signed: false, strictlyPositive: true })
    || !decimal(value.fee, { signed: true, strictlyPositive: false })
    || value.feeCcy !== 'USDT'
    || !decimal(value.fillPnl, { signed: true, strictlyPositive: false })
    || !unixMilliseconds(value.fillTime) || !unixMilliseconds(value.ts)
    || BigInt(value.ts) < BigInt(windowStartMs) || BigInt(value.ts) > BigInt(windowEndMs)) {
    throw new OkxCandidateError('response_contract_rejected', 'OKX-Fill liegt außerhalb des gepinnten Responsevertrags.')
  }
  return deepFreeze(value as unknown as OkxFillRecord)
}

function parseEnvelope(rawBody: readonly number[], responseByteLimit: number, proxyGuard: ProxyGuard) {
  const parsed = parseJsonBytes(rawBody, responseByteLimit, proxyGuard)
  exactKeys(parsed, ['code', 'msg', 'data'], 'OKX-Envelope ist nicht vertragskonform.')
  if (parsed.code !== '0' || parsed.msg !== '' || !Array.isArray(parsed.data)) {
    throw new OkxCandidateError('provider_rejected', 'OKX lieferte keinen erfolgreichen Provider-Envelope.')
  }
  return parsed.data as readonly unknown[]
}

function definition(capabilityId: OkxMinimalProbeCapabilityId) {
  const selected = CAPABILITY_DEFINITIONS.find((entry) => entry.capabilityId === capabilityId)
  if (!selected) throw new OkxCandidateError('unsupported_contract', 'OKX-Capability ist nicht gebaut.')
  return selected
}

function canonicalQuery(
  capabilityId: OkxMinimalProbeCapabilityId,
  input: unknown,
  proxyGuard: ProxyGuard = TRUSTED_CORE_PROXY_GUARD,
): Readonly<Record<string, string>> {
  const expectedKeys = capabilityId === 'okx_account_config_v1'
    ? []
    : capabilityId === 'okx_account_instruments_swap_v1'
      ? ['instType']
      : ['begin', 'end', 'instType', 'limit']
  assertClosedDataRecord(
    input,
    expectedKeys,
    'invalid_query',
    'OKX-Query besitzt keine geschlossene Objektform.',
    proxyGuard,
  )
  const value = input
  if (capabilityId === 'okx_account_config_v1') {
    return Object.freeze({})
  }
  if (capabilityId === 'okx_account_instruments_swap_v1') {
    if (value.instType !== 'SWAP') {
      throw new OkxCandidateError('invalid_query', 'OKX-Instrumentquery muss exakt instType=SWAP sein.')
    }
    return Object.freeze({ instType: 'SWAP' })
  }
  if (!unixMilliseconds(value.begin) || !unixMilliseconds(value.end)
    || value.instType !== 'SWAP' || value.limit !== '10'
    || BigInt(value.begin) > BigInt(value.end)
    || BigInt(value.end) - BigInt(value.begin) > BigInt(7 * 24 * 60 * 60 * 1_000)) {
    throw new OkxCandidateError('invalid_query', 'OKX-Fillquery überschreitet den gepinnten Sieben-Tage-/Limit-10-Vertrag.')
  }
  return Object.freeze({
    begin: value.begin as string,
    end: value.end as string,
    instType: 'SWAP',
    limit: '10',
  })
}

function buildDescriptor(definitionValue: CapabilityDefinition): ReadCapabilityDescriptor<Readonly<Record<string, string>>, null> {
  const refWithoutDigest = {
    providerCode: OKX_PROVIDER_CODE,
    providerContractVersion: OKX_PROVIDER_CONTRACT_VERSION,
    adapterVersion: OKX_ADAPTER_VERSION,
    capabilityKind: definitionValue.capabilityKind,
    providerCapabilityId: definitionValue.capabilityId,
    providerCapabilityVersion: definitionValue.providerCapabilityVersion,
  }
  const contractWithoutDigest = {
    ref: refWithoutDigest,
    mutationContract: 'mutations_forbidden',
    methodContract: 'constant_read_method',
    constantMethod: 'GET',
    constantHttpsOrigin: OKX_EEA_DEMO_ORIGIN,
    constantPort: 443,
    constantPathTemplate: definitionValue.path,
    authClass: 'signed_read',
    dataClass: definitionValue.dataClass,
    queryContractVersion: definitionValue.queryContractVersion,
    cursorContractVersion: 'okx-single-page-no-cursor-mb6-candidate-v1',
    responseContractVersion: definitionValue.responseContractVersion,
    pageSequenceContractVersion: PAGE_SEQUENCE_CONTRACT_VERSION,
  } as const
  const capabilityDescriptorDigest = computeCanonicalBrokerValueDigest(contractWithoutDigest as unknown as CanonicalJsonValue)
  const ref = Object.freeze({ ...refWithoutDigest, capabilityDescriptorDigest }) as ProviderCapabilityRef
  return Object.freeze({
    ...contractWithoutDigest,
    ref,
    canonicalizeQuery(input: unknown) {
      return canonicalQuery(definitionValue.capabilityId, input)
    },
    parseQuery(input: unknown) {
      return canonicalQuery(definitionValue.capabilityId, input)
    },
    parseCursor(input: unknown) {
      if (input !== null) throw new OkxCandidateError('invalid_query', 'OKX-Minimalprobe besitzt keinen Cursor.')
      return null
    },
    pageSequenceFromQuery() {
      return 0
    },
  })
}

export const OKX_READONLY_CAPABILITIES = Object.freeze(CAPABILITY_DEFINITIONS.map(buildDescriptor))

export const OKX_PROFILE_CAPABILITY_DIGESTS = Object.freeze(Object.fromEntries(
  CAPABILITY_DEFINITIONS.map((entry) => [entry.capabilityId, entry.profileCapabilityDescriptorDigest]),
)) as Readonly<Record<OkxMinimalProbeCapabilityId, string>>

function sameProvider(left: ProviderCapabilityRef, right: ProviderCapabilityRef) {
  return left.providerCode === right.providerCode
    && left.providerContractVersion === right.providerContractVersion
    && left.adapterVersion === right.adapterVersion
    && left.capabilityKind === right.capabilityKind
    && left.providerCapabilityId === right.providerCapabilityId
    && left.providerCapabilityVersion === right.providerCapabilityVersion
    && left.capabilityDescriptorDigest === right.capabilityDescriptorDigest
}

function selectedDescriptor(provider: ProviderCapabilityRef) {
  const selected = OKX_READONLY_CAPABILITIES.find((candidate) => sameProvider(candidate.ref, provider))
  if (!selected) throw new OkxCandidateError('unsupported_contract', 'OKX-Adapter kennt die gepinnte Capability nicht.')
  return selected
}

type OkxMinimalProbeInspectionInput = Readonly<{
  capabilityId: OkxMinimalProbeCapabilityId
  httpStatus: number
  rawBody: readonly number[]
  canonicalQuery: Readonly<Record<string, string>>
}>

function inspectOkxMinimalProbeResponse(
  input: OkxMinimalProbeInspectionInput,
  proxyGuard: ProxyGuard,
): OkxInspectedProbeResponse {
  assertClosedDataRecord(
    input,
    ['capabilityId', 'httpStatus', 'rawBody', 'canonicalQuery'],
    'malformed_response',
    'OKX-Responseinspektor besitzt keine geschlossene Eingangsform.',
    proxyGuard,
  )
  if (!CAPABILITY_DEFINITIONS.some((entry) => entry.capabilityId === input.capabilityId)
    || !Number.isInteger(input.httpStatus)) {
    throw new OkxCandidateError('malformed_response', 'OKX-Responseinspektor besitzt keine geschlossene Eingangsform.')
  }
  if (input.httpStatus === 429) throw new OkxCandidateError('rate_limited', 'OKX-Read wurde rate-limitiert.', 429)
  if (input.httpStatus === 401 || input.httpStatus === 403) {
    throw new OkxCandidateError('authentication_rejected', 'OKX-Authentifizierung wurde abgelehnt.', input.httpStatus)
  }
  if (input.httpStatus < 200 || input.httpStatus > 299) {
    throw new OkxCandidateError('provider_unavailable', 'OKX lieferte keinen erfolgreichen HTTP-Status.', input.httpStatus)
  }
  const selectedDefinition = definition(input.capabilityId)
  const query = canonicalQuery(input.capabilityId, input.canonicalQuery, proxyGuard)
  const rows = parseEnvelope(input.rawBody, selectedDefinition.responseByteLimit, proxyGuard)

  if (input.capabilityId === 'okx_account_config_v1') {
    if (rows.length !== 1) throw new OkxCandidateError('response_contract_rejected', 'OKX-Accountconfig muss exakt einen Record liefern.')
    return deepFreeze({ capabilityId: input.capabilityId, records: [accountRecord(rows[0])] as const })
  }
  if (input.capabilityId === 'okx_account_instruments_swap_v1') {
    const records = rows.map(instrumentBaseRecord)
    const selected = records.filter((record) => record.settleCcy === 'USDT' && record.ctType === 'linear')
    if (selected.length < 1) throw new OkxCandidateError('response_contract_rejected', 'OKX-Response enthält kein zulässiges lineares USDT-SWAP-Instrument.')
    for (const record of selected) selectedInstrument(record)
    if (new Set(selected.map((record) => record.instId)).size !== selected.length) {
      throw new OkxCandidateError('response_contract_rejected', 'OKX-Instrumentprojektion enthält doppelte instId.')
    }
    return deepFreeze({ capabilityId: input.capabilityId, records, selected })
  }
  const begin = query.begin
  const end = query.end
  const records = rows.map((row) => fillRecord(row, begin, end))
  if (records.length > 10
    || new Set(records.map((record) => record.tradeId)).size !== records.length
    || new Set(records.map((record) => record.billId)).size !== records.length) {
    throw new OkxCandidateError('response_contract_rejected', 'OKX-Fillseite verletzt Record- oder Eindeutigkeitsgrenzen.')
  }
  return deepFreeze({ capabilityId: input.capabilityId, records })
}

export function createOkxMinimalProbeResponseInspector(proxyGuard: ProxyGuard) {
  if (typeof proxyGuard !== 'function') {
    throw new OkxCandidateError('malformed_response', 'OKX-Responseinspektor benötigt eine Proxy-Grenze.')
  }
  let trapExecuted = false
  const proxyCanary = new Proxy({}, {
    get() { trapExecuted = true; return undefined },
    getPrototypeOf() { trapExecuted = true; return Object.prototype },
    ownKeys() { trapExecuted = true; return [] },
  })
  try {
    if (proxyGuard(proxyCanary) !== true || trapExecuted || proxyGuard(Object.freeze({})) !== false) {
      throw new OkxCandidateError('malformed_response', 'OKX-Responseinspektor benötigt eine fail-closed Proxy-Grenze.')
    }
  } catch (error) {
    if (error instanceof OkxCandidateError) throw error
    throw new OkxCandidateError('malformed_response', 'OKX-Responseinspektor benötigt eine fail-closed Proxy-Grenze.')
  }
  return Object.freeze((input: OkxMinimalProbeInspectionInput) => (
    inspectOkxMinimalProbeResponse(input, proxyGuard)
  ))
}

function prepareProbePlan(input: Parameters<ReadOnlyBrokerAdapter['prepareProbeReadPlan']>[0]) {
  if (input.probeWork.chainBinding.authorityPurpose !== 'connection_probe') {
    throw new OkxCandidateError('unsupported_contract', 'OKX-Kandidatenadapter akzeptiert nur Connection-Probes.')
  }
  const work = validateBrokerConnectionProbeWork(input.probeWork)
  const descriptor = selectedDescriptor(work.chainBinding.authority.provider)
  const query = canonicalQuery(descriptor.ref.providerCapabilityId as OkxMinimalProbeCapabilityId, input.requestInput)
  const canonicalDescriptorQueryDigest = computeBrokerDescriptorQueryDigest({
    provider: work.chainBinding.authority.provider,
    capabilityProfile: work.chainBinding.authority.capabilityProfile,
    queryContractVersion: descriptor.queryContractVersion,
    canonicalQuery: query as unknown as CanonicalJsonValue,
  })
  if (work.setupCommand.queryContractVersion !== descriptor.queryContractVersion
    || work.setupCommand.canonicalDescriptorQueryDigest !== canonicalDescriptorQueryDigest) {
    throw new OkxCandidateError('invalid_query', 'OKX-Probe-Setup stimmt nicht mit der Capability-Authority überein.')
  }
  const capabilityDefinition = definition(descriptor.ref.providerCapabilityId as OkxMinimalProbeCapabilityId)
  return Object.freeze({
    provider: descriptor.ref,
    method: 'GET' as const,
    httpsOrigin: OKX_EEA_DEMO_ORIGIN,
    port: 443 as const,
    pathTemplateId: capabilityDefinition.path,
    canonicalPath: capabilityDefinition.path,
    canonicalQuery: query,
    redirectMode: 'error' as const,
    responseByteLimit: Math.min(work.chainBinding.authority.probeBudget.responseByteLimit, capabilityDefinition.responseByteLimit),
    requestTimeoutMs: 4_000,
    planContractVersion: OKX_ADAPTER_PLAN_CONTRACT_VERSION,
    pageSequenceContractVersion: PAGE_SEQUENCE_CONTRACT_VERSION,
    pageSequence: 0,
  })
}

const OKX_READONLY_ADAPTER_IMPLEMENTATION = {
  providerCode: OKX_PROVIDER_CODE,
  providerContractVersion: OKX_PROVIDER_CONTRACT_VERSION,
  adapterVersion: OKX_ADAPTER_VERSION,
  capabilities: OKX_READONLY_CAPABILITIES,
  prepareReadPlan() {
    throw new OkxCandidateError('capture_not_built', 'OKX-Capture ist nicht gebaut oder autorisiert.')
  },
  prepareProbeReadPlan: prepareProbePlan,
  inspectCaptureWireResponse() {
    throw new OkxCandidateError('capture_not_built', 'OKX-Capture ist nicht gebaut oder autorisiert.')
  },
  inspectConnectionProbeWireResponse(input: RuntimeValidatedConnectionProbeWire<any>): ConnectionProbeCapabilityResultCandidate<any> {
    const capabilityId = input.execution.requestBinding.provider.providerCapabilityId as OkxMinimalProbeCapabilityId
    inspectOkxMinimalProbeResponse({
      capabilityId,
      httpStatus: input.wireResponse.httpStatus,
      rawBody: input.wireResponse.rawBody,
      canonicalQuery: input.execution.plan.canonicalQuery,
    }, TRUSTED_CORE_PROXY_GUARD)
    return Object.freeze({
      resultContractVersion: 'equora-connection-probe-result-v1',
      authorizationBinding: input.execution.authorizationBinding,
      provider: input.execution.requestBinding.provider,
      capabilityProfile: input.execution.requestBinding.capabilityProfile,
      responseContractVersion: input.execution.capabilityContract.responseContractVersion,
      wireEvidenceDigest: computeBrokerWireEvidenceDigest(input.wireResponse),
      probeScopeDigest: input.execution.requestBinding.chainBinding.authority.purposeScopeDigest,
      observedAt: input.wireResponse.receivedAt,
      technicalReadResult: 'read_succeeded',
      permissionEvidenceResult: 'not_observed',
      accountIdentityResult: 'not_observed',
      sanitizedFindings: Object.freeze([
        'read_permission_not_observed' as const,
        'account_identity_not_observed' as const,
      ]),
      persistenceAuthority: 'sanitized_probe_receipt_only',
      captureAuthority: 'none',
      normalizationAuthority: 'none',
      reconciliationAuthority: 'none',
      approvalAuthority: 'none',
      importAuthority: 'none',
    })
  },
  advanceCheckpoint() {
    throw new OkxCandidateError('capture_not_built', 'OKX-Capture ist nicht gebaut oder autorisiert.')
  },
  mapRawEvents() {
    throw new OkxCandidateError('capture_not_built', 'OKX-Capture ist nicht gebaut oder autorisiert.')
  },
  classifyFailure(error: unknown): BrokerFailure {
    if (!(error instanceof OkxCandidateError)) {
      return Object.freeze({
        failureClass: 'unknown_fail_closed',
        failureCode: 'okx_candidate_unknown_failure',
        retryDisposition: 'manual_review',
        sanitizedDetail: null,
        httpStatusClass: 'none',
      })
    }
    const failureClass: BrokerFailure['failureClass'] = error.code === 'authentication_rejected'
      ? 'credential'
      : error.code === 'permission_rejected'
        ? 'permission'
        : error.code === 'rate_limited'
          ? 'rate_limit'
          : error.code === 'provider_unavailable'
            ? 'provider_unavailable'
            : error.code === 'response_too_large' || error.code === 'budget_rejected'
              ? 'resource_budget'
              : 'contract'
    const retryDisposition: BrokerFailure['retryDisposition'] = ['rate_limited', 'provider_unavailable'].includes(error.code)
      ? 'bounded_backoff'
      : ['authentication_rejected', 'permission_rejected'].includes(error.code)
        ? 'after_authority_change'
        : 'never'
    const httpStatusClass = error.httpStatus === null
      ? 'none' as const
      : error.httpStatus >= 500
        ? '5xx' as const
        : error.httpStatus >= 400
          ? '4xx' as const
          : error.httpStatus >= 300
            ? '3xx' as const
            : '2xx' as const
    return Object.freeze({
      failureClass,
      failureCode: `okx_candidate_${error.code}`,
      retryDisposition,
      sanitizedDetail: null,
      httpStatusClass,
    })
  },
}

export const okxReadonlyCandidateAdapter = Object.freeze(
  OKX_READONLY_ADAPTER_IMPLEMENTATION,
) as unknown as ReadOnlyBrokerAdapter

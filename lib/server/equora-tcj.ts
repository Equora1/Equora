import 'server-only'

import { createHash } from 'node:crypto'
import {
  isMexcJsonArray,
  isMexcJsonNumber,
  isMexcJsonObject,
  type MexcJsonValue,
} from '@/lib/server/mexc-json'

export const EQUORA_TCJ_VERSION = 'equora-tcj-v1' as const
export const EQUORA_TCJ_DIGEST_ALGORITHM = 'sha256' as const

export type EquoraTcjDigestDomain =
  | 'raw_response_body'
  | 'raw_event_content'
  | 'stability_bucket_identity'
  | 'page_observation'
  | 'raw_event_observation'
  | 'sync_scope'

const TCJ_VALUE_BRAND: unique symbol = Symbol('equora_tcj_value')
const TCJ_VALUE_PROVENANCE = new WeakSet<object>()
const MAX_TCJ_DEPTH = 64
const MAX_TCJ_NODES = 100_000
const MAX_TCJ_BYTES = 8_388_608
const MAX_NUMERIC_INPUT_LENGTH = 256
const CANONICAL_INTEGER_PATTERN = /^-?(?:0|[1-9]\d*)$/
const DECIMAL_INPUT_PATTERN = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/
const ENUM_PATTERN = /^[a-z][a-z0-9_]{0,62}$/
const BYTES_PATTERN = /^(?:[a-f0-9]{2})*$/

type EquoraTcjNull = Readonly<{
  [TCJ_VALUE_BRAND]: true
  type: 'null'
}>

type EquoraTcjBoolean = Readonly<{
  [TCJ_VALUE_BRAND]: true
  type: 'boolean'
  value: boolean
}>

type EquoraTcjString = Readonly<{
  [TCJ_VALUE_BRAND]: true
  type: 'string'
  value: string
}>

type EquoraTcjNumeric = Readonly<{
  [TCJ_VALUE_BRAND]: true
  type: 'integer' | 'decimal' | 'instant' | 'json_number'
  value: string
}>

type EquoraTcjEnum = Readonly<{
  [TCJ_VALUE_BRAND]: true
  type: 'enum'
  value: string
}>

type EquoraTcjBytes = Readonly<{
  [TCJ_VALUE_BRAND]: true
  type: 'bytes'
  value: string
}>

type EquoraTcjOrderedArray = Readonly<{
  [TCJ_VALUE_BRAND]: true
  type: 'ordered_array'
  values: readonly EquoraTcjValue[]
}>

type EquoraTcjUnorderedSet = Readonly<{
  [TCJ_VALUE_BRAND]: true
  type: 'unordered_set'
  values: readonly EquoraTcjValue[]
}>

type EquoraTcjObject = Readonly<{
  [TCJ_VALUE_BRAND]: true
  type: 'object'
  entries: readonly (readonly [string, EquoraTcjValue])[]
}>

export type EquoraTcjValue =
  | EquoraTcjNull
  | EquoraTcjBoolean
  | EquoraTcjString
  | EquoraTcjNumeric
  | EquoraTcjEnum
  | EquoraTcjBytes
  | EquoraTcjOrderedArray
  | EquoraTcjUnorderedSet
  | EquoraTcjObject

export type EquoraTcjDigest<Domain extends EquoraTcjDigestDomain = EquoraTcjDigestDomain> = Readonly<{
  digestAlgorithm: typeof EQUORA_TCJ_DIGEST_ALGORITHM
  digestContractVersion: typeof EQUORA_TCJ_VERSION
  domain: Domain
  digest: string
}>

export class EquoraTcjError extends Error {
  constructor(
    public readonly code:
      | 'invalid_value'
      | 'invalid_unicode'
      | 'invalid_integer'
      | 'invalid_decimal'
      | 'invalid_instant'
      | 'invalid_enum'
      | 'invalid_bytes'
      | 'duplicate_object_key'
      | 'duplicate_set_value'
      | 'depth_limit_exceeded'
      | 'node_limit_exceeded'
      | 'byte_limit_exceeded'
      | 'invalid_domain',
    message: string,
  ) {
    super(message)
    this.name = 'EquoraTcjError'
  }
}

function fail(code: EquoraTcjError['code'], message: string): never {
  throw new EquoraTcjError(code, message)
}

function tcjValue<T extends Omit<EquoraTcjValue, typeof TCJ_VALUE_BRAND>>(input: T) {
  const value = { ...input } as T & { [TCJ_VALUE_BRAND]: true }
  Object.defineProperty(value, TCJ_VALUE_BRAND, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  })
  const frozen = Object.freeze(value) as EquoraTcjValue
  TCJ_VALUE_PROVENANCE.add(frozen)
  return frozen
}

function assertValidUnicode(input: string) {
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(index + 1)
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        fail('invalid_unicode', 'TCJ-String enthält ein ungepaartes High-Surrogate.')
      }
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      fail('invalid_unicode', 'TCJ-String enthält ein ungepaartes Low-Surrogate.')
    }
  }
}

function normalizedString(input: unknown, label: string) {
  if (typeof input !== 'string') fail('invalid_value', `${label} muss ein String sein.`)
  assertValidUnicode(input)
  const normalized = input.normalize('NFC')
  assertValidUnicode(normalized)
  if (Buffer.byteLength(normalized, 'utf8') > MAX_TCJ_BYTES) {
    fail('byte_limit_exceeded', `${label} überschreitet das TCJ-Bytebudget.`)
  }
  return normalized
}

function quoteTcjString(input: string) {
  let output = '"'
  let outputBytes = 1
  const append = (fragment: string) => {
    outputBytes += Buffer.byteLength(fragment, 'utf8')
    if (outputBytes + 1 > MAX_TCJ_BYTES) {
      fail('byte_limit_exceeded', 'TCJ-String-Escaping überschreitet das kanonische Bytebudget.')
    }
    output += fragment
  }
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    if (code === 0x22) {
      append('\\"')
    } else if (code === 0x5c) {
      append('\\\\')
    } else if (code <= 0x1f) {
      append(`\\u00${code.toString(16).padStart(2, '0')}`)
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const pair = `${input[index] ?? ''}${input[index + 1] ?? ''}`
      index += 1
      append(pair)
    } else {
      append(input[index] ?? '')
    }
  }
  return `${output}"`
}

function canonicalInteger(input: unknown, errorCode: 'invalid_integer' | 'invalid_instant') {
  if (
    typeof input !== 'string'
    || input.length === 0
    || input.length > MAX_NUMERIC_INPUT_LENGTH
    || !CANONICAL_INTEGER_PATTERN.test(input)
  ) fail(errorCode, 'TCJ-Integer ist nicht kanonisch.')
  return input === '-0' ? '0' : input
}

export function canonicalizeEquoraDecimal(input: unknown) {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_NUMERIC_INPUT_LENGTH) {
    fail('invalid_decimal', 'TCJ-Decimal fehlt oder ist zu lang.')
  }
  const match = DECIMAL_INPUT_PATTERN.exec(input)
  if (!match) fail('invalid_decimal', 'TCJ-Decimal besitzt keine gültige Basis-10-Repräsentation.')
  const negative = match[1] === '-'
  const integerPart = match[2]!
  const fractionPart = match[3] ?? ''
  let exponent: bigint
  try {
    exponent = BigInt(match[4] ?? '0')
  } catch {
    fail('invalid_decimal', 'TCJ-Decimal besitzt einen ungültigen Exponenten.')
  }
  const digits = `${integerPart}${fractionPart}`
  if (/^0+$/.test(digits)) return '0'
  const maximumExpansion = BigInt(MAX_TCJ_BYTES)
  if (exponent < -maximumExpansion || exponent > maximumExpansion) {
    fail('byte_limit_exceeded', 'TCJ-Decimal würde das kanonische Bytebudget überschreiten.')
  }
  const decimalPositionBigInt = BigInt(integerPart.length) + exponent
  if (decimalPositionBigInt < -maximumExpansion || decimalPositionBigInt > maximumExpansion) {
    fail('byte_limit_exceeded', 'TCJ-Decimal würde das kanonische Bytebudget überschreiten.')
  }
  const decimalPosition = Number(decimalPositionBigInt)
  let expanded: string
  if (decimalPosition <= 0) {
    expanded = `0.${'0'.repeat(-decimalPosition)}${digits}`
  } else if (decimalPosition >= digits.length) {
    expanded = `${digits}${'0'.repeat(decimalPosition - digits.length)}`
  } else {
    expanded = `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`
  }
  const [rawInteger, rawFraction = ''] = expanded.split('.')
  const canonicalWhole = rawInteger!.replace(/^0+(?=\d)/, '') || '0'
  const canonicalFraction = rawFraction.replace(/0+$/, '')
  const canonical = canonicalFraction.length > 0 ? `${canonicalWhole}.${canonicalFraction}` : canonicalWhole
  const result = negative ? `-${canonical}` : canonical
  if (Buffer.byteLength(result, 'utf8') > MAX_TCJ_BYTES) {
    fail('byte_limit_exceeded', 'TCJ-Decimal überschreitet das kanonische Bytebudget.')
  }
  return result
}

export function tcjNull(): EquoraTcjValue {
  return tcjValue({ type: 'null' as const })
}

export function tcjBoolean(value: unknown): EquoraTcjValue {
  if (typeof value !== 'boolean') fail('invalid_value', 'TCJ-Boolean ist ungültig.')
  return tcjValue({ type: 'boolean' as const, value })
}

export function tcjString(value: unknown): EquoraTcjValue {
  return tcjValue({ type: 'string' as const, value: normalizedString(value, 'TCJ-String') })
}

export function tcjInteger(value: unknown): EquoraTcjValue {
  return tcjValue({ type: 'integer' as const, value: canonicalInteger(value, 'invalid_integer') })
}

export function tcjDecimal(value: unknown): EquoraTcjValue {
  return tcjValue({ type: 'decimal' as const, value: canonicalizeEquoraDecimal(value) })
}

export function tcjInstant(value: unknown): EquoraTcjValue {
  return tcjValue({ type: 'instant' as const, value: canonicalInteger(value, 'invalid_instant') })
}

export function tcjEnum(value: unknown): EquoraTcjValue {
  if (typeof value !== 'string' || !ENUM_PATTERN.test(value)) {
    fail('invalid_enum', 'TCJ-Enumcode ist ungültig.')
  }
  return tcjValue({ type: 'enum' as const, value })
}

export function tcjBytes(value: unknown): EquoraTcjValue {
  if (
    typeof value !== 'string'
    || Buffer.byteLength(value, 'utf8') > MAX_TCJ_BYTES
    || !BYTES_PATTERN.test(value)
  ) {
    fail('invalid_bytes', 'TCJ-Bytes müssen lowercase Hex mit gerader Länge sein.')
  }
  return tcjValue({ type: 'bytes' as const, value })
}

export function tcjJsonNumber(value: unknown): EquoraTcjValue {
  return tcjValue({ type: 'json_number' as const, value: canonicalizeEquoraDecimal(value) })
}

function assertTcjValue(value: unknown): asserts value is EquoraTcjValue {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || !TCJ_VALUE_PROVENANCE.has(value)
    || !Object.isFrozen(value)
    || (value as EquoraTcjValue)[TCJ_VALUE_BRAND] !== true
  ) {
    fail('invalid_value', 'Ungebrandeter Wert darf nicht als TCJ-Wert verwendet werden.')
  }
}

export function tcjOrderedArray(values: readonly EquoraTcjValue[]): EquoraTcjValue {
  if (!Array.isArray(values)) fail('invalid_value', 'TCJ-Ordered-Array muss ein Array sein.')
  if (values.length > MAX_TCJ_NODES) {
    fail('node_limit_exceeded', 'TCJ-Ordered-Array überschreitet das Nodebudget.')
  }
  for (const value of values) assertTcjValue(value)
  return tcjValue({ type: 'ordered_array' as const, values: Object.freeze([...values]) })
}

export function tcjUnorderedSet(values: readonly EquoraTcjValue[]): EquoraTcjValue {
  if (!Array.isArray(values)) fail('invalid_value', 'TCJ-Unordered-Set muss ein Array sein.')
  if (values.length > MAX_TCJ_NODES) {
    fail('node_limit_exceeded', 'TCJ-Unordered-Set überschreitet das Nodebudget.')
  }
  for (const value of values) assertTcjValue(value)
  return tcjValue({ type: 'unordered_set' as const, values: Object.freeze([...values]) })
}

export function tcjObject(entries: readonly (readonly [string, EquoraTcjValue])[]): EquoraTcjValue {
  if (!Array.isArray(entries)) fail('invalid_value', 'TCJ-Object-Entries müssen ein Array sein.')
  if (entries.length > MAX_TCJ_NODES) {
    fail('node_limit_exceeded', 'TCJ-Object überschreitet das Nodebudget.')
  }
  const normalizedEntries: Array<readonly [string, EquoraTcjValue]> = []
  const seenKeys = new Set<string>()
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) fail('invalid_value', 'TCJ-Object-Entry ist ungültig.')
    const key = normalizedString(entry[0], 'TCJ-Object-Key')
    if (seenKeys.has(key)) fail('duplicate_object_key', 'TCJ-Object-Key kollidiert nach NFC-Normalisierung.')
    assertTcjValue(entry[1])
    seenKeys.add(key)
    normalizedEntries.push(Object.freeze([key, entry[1]] as const))
  }
  normalizedEntries.sort((left, right) => Buffer.compare(Buffer.from(left[0], 'utf8'), Buffer.from(right[0], 'utf8')))
  return tcjValue({ type: 'object' as const, entries: Object.freeze(normalizedEntries) })
}

function boundedEncoded(value: string) {
  if (Buffer.byteLength(value, 'utf8') > MAX_TCJ_BYTES) {
    fail('byte_limit_exceeded', 'TCJ-Wert überschreitet 8.388.608 Bytes.')
  }
  return value
}

function encodeContainerItems(
  typeCode: 'a' | 'u' | 'o',
  sourceLength: number,
  encodeItem: (index: number) => string,
) {
  const prefix = `["${typeCode}",[`
  const suffix = ']]'
  let encodedBytes = Buffer.byteLength(prefix, 'utf8') + Buffer.byteLength(suffix, 'utf8')
  const items: string[] = []
  for (let index = 0; index < sourceLength; index += 1) {
    const item = encodeItem(index)
    encodedBytes += (index === 0 ? 0 : 1) + Buffer.byteLength(item, 'utf8')
    if (encodedBytes > MAX_TCJ_BYTES) {
      fail('byte_limit_exceeded', 'TCJ-Container überschreitet 8.388.608 Bytes.')
    }
    items.push(item)
  }
  return `${prefix}${items.join(',')}${suffix}`
}

function encodeValue(value: EquoraTcjValue, containerDepth: number, state: { nodes: number }): string {
  assertTcjValue(value)
  state.nodes += 1
  if (state.nodes > MAX_TCJ_NODES) fail('node_limit_exceeded', 'TCJ-Wert überschreitet das Nodebudget.')
  switch (value.type) {
    case 'null':
      return '["n"]'
    case 'boolean':
      return `["b",${value.value ? 'true' : 'false'}]`
    case 'string':
      return boundedEncoded(`["s",${quoteTcjString(value.value)}]`)
    case 'integer':
      return boundedEncoded(`["i",${quoteTcjString(value.value)}]`)
    case 'decimal':
      return boundedEncoded(`["d",${quoteTcjString(value.value)}]`)
    case 'instant':
      return boundedEncoded(`["t",${quoteTcjString(value.value)}]`)
    case 'enum':
      return boundedEncoded(`["e",${quoteTcjString(value.value)}]`)
    case 'bytes':
      return boundedEncoded(`["x",${quoteTcjString(value.value)}]`)
    case 'json_number':
      return boundedEncoded(`["j",${quoteTcjString(value.value)}]`)
    case 'ordered_array': {
      if (containerDepth >= MAX_TCJ_DEPTH) {
        fail('depth_limit_exceeded', 'TCJ-Verschachtelung überschreitet 64 Containerlevel.')
      }
      return encodeContainerItems(
        'a',
        value.values.length,
        (index) => encodeValue(value.values[index]!, containerDepth + 1, state),
      )
    }
    case 'unordered_set': {
      if (containerDepth >= MAX_TCJ_DEPTH) {
        fail('depth_limit_exceeded', 'TCJ-Verschachtelung überschreitet 64 Containerlevel.')
      }
      const items: string[] = []
      let encodedBytes = Buffer.byteLength('["u",[]]', 'utf8')
      for (const item of value.values) {
        const encodedItem = encodeValue(item, containerDepth + 1, state)
        encodedBytes += (items.length === 0 ? 0 : 1) + Buffer.byteLength(encodedItem, 'utf8')
        if (encodedBytes > MAX_TCJ_BYTES) {
          fail('byte_limit_exceeded', 'TCJ-Container überschreitet 8.388.608 Bytes.')
        }
        items.push(encodedItem)
      }
      items.sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')))
      for (let index = 1; index < items.length; index += 1) {
        if (items[index] === items[index - 1]) fail('duplicate_set_value', 'TCJ-Unordered-Set enthält ein kanonisches Duplikat.')
      }
      return encodeContainerItems('u', items.length, (index) => items[index]!)
    }
    case 'object': {
      if (containerDepth >= MAX_TCJ_DEPTH) {
        fail('depth_limit_exceeded', 'TCJ-Verschachtelung überschreitet 64 Containerlevel.')
      }
      return encodeContainerItems('o', value.entries.length, (index) => {
        const [key, item] = value.entries[index]!
        return boundedEncoded(`[${quoteTcjString(key)},${encodeValue(item, containerDepth + 1, state)}]`)
      })
    }
    default:
      return fail('invalid_value', 'Unbekannter TCJ-Werttyp.')
  }
}

export function encodeEquoraTcj(value: EquoraTcjValue) {
  return encodeValue(value, 0, { nodes: 0 })
}

export function isEquoraTcjDigest<Domain extends EquoraTcjDigestDomain>(
  value: unknown,
  domain: Domain,
): value is EquoraTcjDigest<Domain> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const expectedKeys = ['digest', 'digestAlgorithm', 'digestContractVersion', 'domain'].sort()
  const actualKeys = Object.keys(value).sort()
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    return false
  }
  const digest = value as Partial<EquoraTcjDigest>
  return digest.digestAlgorithm === EQUORA_TCJ_DIGEST_ALGORITHM
    && digest.digestContractVersion === EQUORA_TCJ_VERSION
    && digest.domain === domain
    && typeof digest.digest === 'string'
    && /^[a-f0-9]{64}$/.test(digest.digest)
}

export function digestEquoraTcj<Domain extends EquoraTcjDigestDomain>(
  domain: Domain,
  value: EquoraTcjValue,
): EquoraTcjDigest<Domain> {
  if (
    domain !== 'raw_response_body'
    && domain !== 'raw_event_content'
    && domain !== 'stability_bucket_identity'
    && domain !== 'page_observation'
    && domain !== 'raw_event_observation'
    && domain !== 'sync_scope'
  ) {
    fail('invalid_domain', 'Unbekannte TCJ-Digestdomain.')
  }
  const encoded = encodeEquoraTcj(value)
  const hash = createHash('sha256')
  hash.update('equora-digest', 'ascii')
  hash.update(Buffer.from([0]))
  hash.update(domain, 'ascii')
  hash.update(Buffer.from([0]))
  hash.update(EQUORA_TCJ_VERSION, 'ascii')
  hash.update(Buffer.from([0]))
  hash.update(encoded, 'utf8')
  return Object.freeze({
    digestAlgorithm: EQUORA_TCJ_DIGEST_ALGORITHM,
    digestContractVersion: EQUORA_TCJ_VERSION,
    domain,
    digest: hash.digest('hex'),
  })
}

export function digestEquoraRawResponseBody(body: Uint8Array): EquoraTcjDigest<'raw_response_body'> {
  if (!(body instanceof Uint8Array)) fail('invalid_value', 'Raw Response Body muss eine Bytefolge sein.')
  const stableBody = Uint8Array.from(body)
  return digestEquoraTcj('raw_response_body', tcjBytes(Buffer.from(stableBody).toString('hex')))
}

function tcjFromMexcJsonBounded(
  value: MexcJsonValue,
  containerDepth: number,
  state: { nodes: number },
): EquoraTcjValue {
  state.nodes += 1
  if (state.nodes > MAX_TCJ_NODES) fail('node_limit_exceeded', 'MEXC-Rawwert überschreitet das TCJ-Nodebudget.')
  if (value === null) return tcjNull()
  if (typeof value === 'boolean') return tcjBoolean(value)
  if (typeof value === 'string') return tcjString(value)
  if (isMexcJsonNumber(value)) return tcjJsonNumber(value.lexeme)
  if (isMexcJsonArray(value)) {
    if (containerDepth >= MAX_TCJ_DEPTH) {
      fail('depth_limit_exceeded', 'MEXC-Rawarray überschreitet 64 TCJ-Containerlevel.')
    }
    return tcjOrderedArray(value.map((item) => tcjFromMexcJsonBounded(item, containerDepth + 1, state)))
  }
  if (isMexcJsonObject(value)) {
    if (containerDepth >= MAX_TCJ_DEPTH) {
      fail('depth_limit_exceeded', 'MEXC-Rawobjekt überschreitet 64 TCJ-Containerlevel.')
    }
    const objectValue = value as Readonly<Record<string, MexcJsonValue>>
    return tcjObject(Object.keys(objectValue).map((key) => [
      key,
      tcjFromMexcJsonBounded(objectValue[key]!, containerDepth + 1, state),
    ] as const))
  }
  return fail('invalid_value', 'MEXC-Rawwert kann nicht in TCJ überführt werden.')
}

export function tcjFromMexcJson(value: MexcJsonValue): EquoraTcjValue {
  return tcjFromMexcJsonBounded(value, 0, { nodes: 0 })
}

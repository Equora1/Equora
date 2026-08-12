import 'server-only'

const MEXC_JSON_NUMBER_BRAND: unique symbol = Symbol('mexc_json_number')
const MEXC_JSON_CONTAINER_BRAND: unique symbol = Symbol('mexc_json_container')
const MEXC_JSON_PROVENANCE = new WeakMap<object, 'number' | 'object' | 'array'>()

export type MexcJsonNumber = Readonly<{
  [MEXC_JSON_NUMBER_BRAND]: true
  kind: 'mexc_json_number'
  lexeme: string
}>

export interface MexcJsonObject {
  readonly [MEXC_JSON_CONTAINER_BRAND]: 'object'
  readonly [key: string]: MexcJsonValue
}

export interface MexcJsonArray extends ReadonlyArray<MexcJsonValue> {
  readonly [MEXC_JSON_CONTAINER_BRAND]: 'array'
}
export type MexcJsonValue = null | boolean | string | MexcJsonNumber | MexcJsonArray | MexcJsonObject

const MAX_JSON_DEPTH = 64
const MAX_JSON_NODES = 10_000
const MAX_NUMBER_LEXEME_LENGTH = 256
export const MEXC_MAX_JSON_INPUT_BYTES = 64 * 1024
const NUMBER_PATTERN_SOURCE = String.raw`-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?`
const INTEGER_PATTERN = /^-?(?:0|[1-9]\d*)$/

export class MexcJsonParseError extends Error {
  constructor() {
    super('MEXC-Antwort enthält ungültiges oder nicht unterstütztes JSON.')
    this.name = 'MexcJsonParseError'
  }
}

export function isMexcJsonNumber(value: unknown): value is MexcJsonNumber {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && MEXC_JSON_PROVENANCE.get(value as object) === 'number'
    && Object.isFrozen(value)
    && (value as Partial<MexcJsonNumber>)[MEXC_JSON_NUMBER_BRAND] === true
    && (value as { kind?: unknown }).kind === 'mexc_json_number'
    && typeof (value as { lexeme?: unknown }).lexeme === 'string'
    && Object.keys(value).sort().join(',') === 'kind,lexeme'
}

export function isMexcJsonObject(value: unknown): value is MexcJsonObject {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && MEXC_JSON_PROVENANCE.get(value as object) === 'object'
    && Object.getPrototypeOf(value) === null
    && (value as Partial<MexcJsonObject>)[MEXC_JSON_CONTAINER_BRAND] === 'object'
    && Object.isFrozen(value)
}

export function isMexcJsonArray(value: unknown): value is MexcJsonArray {
  return Array.isArray(value)
    && MEXC_JSON_PROVENANCE.get(value) === 'array'
    && (value as Partial<MexcJsonArray>)[MEXC_JSON_CONTAINER_BRAND] === 'array'
    && Object.isFrozen(value)
}

export function getMexcJsonIntegerLexeme(value: unknown) {
  if (!isMexcJsonNumber(value) || !INTEGER_PATTERN.test(value.lexeme) || value.lexeme === '-0') return null
  return value.lexeme
}

function assertValidUnicode(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) throw new MexcJsonParseError()
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new MexcJsonParseError()
    }
  }
}

class LosslessJsonParser {
  private offset = 0
  private nodes = 0
  private readonly numberPattern = new RegExp(NUMBER_PATTERN_SOURCE, 'y')

  constructor(private readonly input: string) {}

  parse() {
    this.skipWhitespace()
    const value = this.parseValue(0)
    this.skipWhitespace()
    if (this.offset !== this.input.length) throw new MexcJsonParseError()
    return value
  }

  private countNode() {
    this.nodes += 1
    if (this.nodes > MAX_JSON_NODES) throw new MexcJsonParseError()
  }

  private skipWhitespace() {
    while (this.offset < this.input.length && /[\t\n\r ]/.test(this.input[this.offset] ?? '')) this.offset += 1
  }

  private parseValue(depth: number): MexcJsonValue {
    if (depth > MAX_JSON_DEPTH) throw new MexcJsonParseError()
    this.countNode()
    const character = this.input[this.offset]
    if (character === '"') return this.parseString()
    if (character === '{' || character === '[') {
      if (depth >= MAX_JSON_DEPTH) throw new MexcJsonParseError()
      return character === '{' ? this.parseObject(depth + 1) : this.parseArray(depth + 1)
    }
    if (character === 't') return this.parseLiteral('true', true)
    if (character === 'f') return this.parseLiteral('false', false)
    if (character === 'n') return this.parseLiteral('null', null)
    if (character === '-' || character && character >= '0' && character <= '9') return this.parseNumber()
    throw new MexcJsonParseError()
  }

  private parseLiteral<T extends boolean | null>(literal: string, value: T): T {
    if (!this.input.startsWith(literal, this.offset)) throw new MexcJsonParseError()
    this.offset += literal.length
    return value
  }

  private parseString() {
    const start = this.offset
    this.offset += 1
    while (this.offset < this.input.length) {
      const character = this.input[this.offset]
      if (character === '"') {
        this.offset += 1
        let value: unknown
        try {
          value = JSON.parse(this.input.slice(start, this.offset))
        } catch {
          throw new MexcJsonParseError()
        }
        if (typeof value !== 'string') throw new MexcJsonParseError()
        assertValidUnicode(value)
        return value
      }
      if (character === '\\') {
        this.offset += 2
        continue
      }
      if (!character || character.charCodeAt(0) < 0x20) throw new MexcJsonParseError()
      this.offset += 1
    }
    throw new MexcJsonParseError()
  }

  private parseNumber(): MexcJsonNumber {
    this.numberPattern.lastIndex = this.offset
    const match = this.numberPattern.exec(this.input)
    if (!match) throw new MexcJsonParseError()
    const lexeme = match[0]
    if (lexeme.length > MAX_NUMBER_LEXEME_LENGTH) throw new MexcJsonParseError()
    this.offset += lexeme.length
    const next = this.input[this.offset]
    if (next && !/[\t\n\r ,}\]]/.test(next)) throw new MexcJsonParseError()
    const value = { kind: 'mexc_json_number' as const, lexeme } as {
      kind: 'mexc_json_number'
      lexeme: string
      [MEXC_JSON_NUMBER_BRAND]: true
    }
    Object.defineProperty(value, MEXC_JSON_NUMBER_BRAND, {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    })
    const frozen = Object.freeze(value) as MexcJsonNumber
    MEXC_JSON_PROVENANCE.set(frozen, 'number')
    return frozen
  }

  private parseObject(depth: number): MexcJsonObject {
    this.offset += 1
    this.skipWhitespace()
    const value: Record<string, MexcJsonValue> = Object.create(null) as Record<string, MexcJsonValue>
    if (this.input[this.offset] === '}') {
      this.offset += 1
      return this.freezeObject(value)
    }

    while (this.offset < this.input.length) {
      if (this.input[this.offset] !== '"') throw new MexcJsonParseError()
      const key = this.parseString()
      if (Object.prototype.hasOwnProperty.call(value, key)) throw new MexcJsonParseError()
      this.skipWhitespace()
      if (this.input[this.offset] !== ':') throw new MexcJsonParseError()
      this.offset += 1
      this.skipWhitespace()
      value[key] = this.parseValue(depth)
      this.skipWhitespace()
      const separator = this.input[this.offset]
      if (separator === '}') {
        this.offset += 1
        return this.freezeObject(value)
      }
      if (separator !== ',') throw new MexcJsonParseError()
      this.offset += 1
      this.skipWhitespace()
    }
    throw new MexcJsonParseError()
  }

  private parseArray(depth: number): MexcJsonArray {
    this.offset += 1
    this.skipWhitespace()
    const value: MexcJsonValue[] = []
    if (this.input[this.offset] === ']') {
      this.offset += 1
      return this.freezeArray(value)
    }

    while (this.offset < this.input.length) {
      value.push(this.parseValue(depth))
      this.skipWhitespace()
      const separator = this.input[this.offset]
      if (separator === ']') {
        this.offset += 1
        return this.freezeArray(value)
      }
      if (separator !== ',') throw new MexcJsonParseError()
      this.offset += 1
      this.skipWhitespace()
    }
    throw new MexcJsonParseError()
  }

  private freezeObject(value: Record<string, MexcJsonValue>): MexcJsonObject {
    Object.defineProperty(value, MEXC_JSON_CONTAINER_BRAND, {
      configurable: false,
      enumerable: false,
      value: 'object',
      writable: false,
    })
    const frozen = Object.freeze(value) as MexcJsonObject
    MEXC_JSON_PROVENANCE.set(frozen, 'object')
    return frozen
  }

  private freezeArray(value: MexcJsonValue[]): MexcJsonArray {
    Object.defineProperty(value, MEXC_JSON_CONTAINER_BRAND, {
      configurable: false,
      enumerable: false,
      value: 'array',
      writable: false,
    })
    const frozen = Object.freeze(value) as MexcJsonArray
    MEXC_JSON_PROVENANCE.set(frozen, 'array')
    return frozen
  }
}

export function parseMexcJson(input: string): MexcJsonValue {
  if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > MEXC_MAX_JSON_INPUT_BYTES) {
    throw new MexcJsonParseError()
  }
  return new LosslessJsonParser(input).parse()
}

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  getMexcJsonIntegerLexeme,
  isMexcJsonArray,
  isMexcJsonNumber,
  isMexcJsonObject,
  MEXC_MAX_JSON_INPUT_BYTES,
  MexcJsonParseError,
  parseMexcJson,
} from '../lib/server/mexc-json'

describe('MEXC lossless JSON parser', () => {
  it('preserves large integers and decimal/exponent lexemes without IEEE-754 conversion', () => {
    const value = parseMexcJson('{"id":900719925474099312345,"price":1.2300e-4,"fee":-0.0000000100}')
    expect(value).toMatchObject({
      id: { kind: 'mexc_json_number', lexeme: '900719925474099312345' },
      price: { kind: 'mexc_json_number', lexeme: '1.2300e-4' },
      fee: { kind: 'mexc_json_number', lexeme: '-0.0000000100' },
    })
    expect(Object.isFrozen(value)).toBe(true)
  })

  it('freezes nested arrays and objects after parsing', () => {
    const value = parseMexcJson('{"items":[{"id":1}]}') as Record<string, unknown>
    const items = value.items as readonly unknown[]

    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(items)).toBe(true)
    expect(Object.isFrozen(items[0])).toBe(true)
  })

  it('exposes only canonical integer tokens as provider integer lexemes', () => {
    const integer = parseMexcJson('900719925474099312345')
    const decimal = parseMexcJson('1.0')
    const negativeZero = parseMexcJson('-0')

    expect(isMexcJsonNumber(integer)).toBe(true)
    expect(getMexcJsonIntegerLexeme(integer)).toBe('900719925474099312345')
    expect(getMexcJsonIntegerLexeme(decimal)).toBeNull()
    expect(getMexcJsonIntegerLexeme(negativeZero)).toBeNull()
    expect(getMexcJsonIntegerLexeme('900719925474099312345')).toBeNull()
  })

  it('does not accept a provider-controlled lookalike object as an internal number token', () => {
    const lookalike = parseMexcJson('{"kind":"mexc_json_number","lexeme":"1760000000000"}')

    expect(isMexcJsonNumber(lookalike)).toBe(false)
    expect(getMexcJsonIntegerLexeme(lookalike)).toBeNull()

    const genuineNumber = parseMexcJson('1')
    const spreadForgery = { ...(genuineNumber as object), lexeme: '2' }
    expect(isMexcJsonNumber(spreadForgery)).toBe(false)
    expect(getMexcJsonIntegerLexeme(spreadForgery)).toBeNull()
  })

  it('rejects reflected parser brands copied onto frozen container lookalikes', () => {
    const genuineObject = parseMexcJson('{"a":1}')
    const objectBrand = Object.getOwnPropertySymbols(genuineObject as object)[0]!
    const forgedObject = Object.create(null) as Record<PropertyKey, unknown>
    forgedObject.a = 'forged'
    Object.defineProperty(
      forgedObject,
      objectBrand,
      Object.getOwnPropertyDescriptor(genuineObject as object, objectBrand)!,
    )
    Object.freeze(forgedObject)
    expect(isMexcJsonObject(forgedObject)).toBe(false)

    const genuineArray = parseMexcJson('[1]')
    const arrayBrand = Object.getOwnPropertySymbols(genuineArray as object)[0]!
    const forgedArray: unknown[] = ['forged']
    Object.defineProperty(
      forgedArray,
      arrayBrand,
      Object.getOwnPropertyDescriptor(genuineArray as object, arrayBrand)!,
    )
    Object.freeze(forgedArray)
    expect(isMexcJsonArray(forgedArray)).toBe(false)
  })

  it.each([
    '{"id":1,"id":2}',
    '{"value":01}',
    '{"value":1.}',
    '{"value":NaN}',
    '{"value":Infinity}',
    '{"value":"\\uD800"}',
    '{"value":"\\uDC00"}',
    '{"id":1,"\\u0069d":2}',
    '[1,2,]',
    '{"a":1} trailing',
  ])('rejects ambiguous or non-standard JSON: %s', (input) => {
    expect(() => parseMexcJson(input)).toThrow(MexcJsonParseError)
  })

  it('fails closed beyond the pinned nesting limit', () => {
    const maximum = `${'['.repeat(64)}0${']'.repeat(64)}`
    const beyondMaximum = `${'['.repeat(65)}0${']'.repeat(65)}`

    expect(() => parseMexcJson(maximum)).not.toThrow()
    expect(() => parseMexcJson(beyondMaximum)).toThrow(MexcJsonParseError)
  })

  it('fails closed beyond the pinned number and node budgets', () => {
    expect(() => parseMexcJson('1'.repeat(257))).toThrow(MexcJsonParseError)
    expect(() => parseMexcJson(`[${Array.from({ length: 10_001 }, () => '0').join(',')}]`)).toThrow(MexcJsonParseError)
    expect(() => parseMexcJson(`"${'x'.repeat(MEXC_MAX_JSON_INPUT_BYTES)}"`)).toThrow(MexcJsonParseError)
  })
})

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  canonicalizeEquoraDecimal,
  digestEquoraRawResponseBody,
  digestEquoraTcj,
  encodeEquoraTcj,
  EquoraTcjError,
  tcjBoolean,
  tcjBytes,
  tcjDecimal,
  tcjEnum,
  tcjFromMexcJson,
  tcjInstant,
  tcjInteger,
  tcjNull,
  tcjObject,
  tcjOrderedArray,
  tcjString,
  tcjUnorderedSet,
  type EquoraTcjValue,
} from '../lib/server/equora-tcj'
import { parseMexcJson } from '../lib/server/mexc-json'

function expectTcjCode(operation: () => unknown, code: EquoraTcjError['code']) {
  try {
    operation()
    expect.unreachable(`Expected TCJ error ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(EquoraTcjError)
    expect((error as EquoraTcjError).code).toBe(code)
  }
}

describe('equora-tcj-v1 canonical encoding', () => {
  it('normalizes Unicode, sorts object keys by UTF-8 and uses the normative escapes', () => {
    const value = tcjObject([
      ['z', tcjNull()],
      ['a', tcjString('e\u0301\n"\\')],
    ])

    expect(encodeEquoraTcj(value)).toBe(String.raw`["o",[["a",["s","é\u000a\"\\"]],["z",["n"]]]]`)

    const nonAsciiKeys = tcjObject([
      ['é', tcjString('third')],
      ['ä', tcjString('second')],
      ['z', tcjString('first')],
    ])
    expect(encodeEquoraTcj(nonAsciiKeys)).toBe(
      '["o",[["z",["s","first"]],["ä",["s","second"]],["é",["s","third"]]]]',
    )
  })

  it('escapes every control byte canonically while leaving slash and U+2028/U+2029 unescaped', () => {
    const controls = String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index))
    const expectedControls = Array.from(
      { length: 32 },
      (_, index) => `\\u00${index.toString(16).padStart(2, '0')}`,
    ).join('')
    expect(encodeEquoraTcj(tcjString(controls))).toBe(`["s","${expectedControls}"]`)
    expect(encodeEquoraTcj(tcjString('/\u2028\u2029'))).toBe('["s","/\u2028\u2029"]')
  })

  it('keeps every primitive type explicit and canonicalizes numeric zero', () => {
    const value = tcjOrderedArray([
      tcjBoolean(false),
      tcjBoolean(true),
      tcjInteger('-0'),
      tcjDecimal('1.2300e2'),
      tcjInstant('1760000000000000'),
      tcjEnum('historical_execution'),
      tcjBytes('00ff'),
    ])

    expect(encodeEquoraTcj(value)).toBe(
      '["a",[["b",false],["b",true],["i","0"],["d","123"],["t","1760000000000000"],["e","historical_execution"],["x","00ff"]]]',
    )
  })

  it('canonicalizes equivalent base-10 decimal and exponent lexemes without IEEE-754', () => {
    expect(canonicalizeEquoraDecimal('1')).toBe('1')
    expect(canonicalizeEquoraDecimal('1.0')).toBe('1')
    expect(canonicalizeEquoraDecimal('1e0')).toBe('1')
    expect(canonicalizeEquoraDecimal('-0.000e999')).toBe('0')
    expect(canonicalizeEquoraDecimal('0e8388609')).toBe('0')
    expect(canonicalizeEquoraDecimal('123e-5')).toBe('0.00123')
    expect(canonicalizeEquoraDecimal('1.23e5')).toBe('123000')
    expect(canonicalizeEquoraDecimal('0.0012300')).toBe('0.00123')
  })

  it('sorts unordered sets by complete TCJ bytes and rejects canonical duplicates', () => {
    const value = tcjUnorderedSet([tcjString('b'), tcjString('a')])
    expect(encodeEquoraTcj(value)).toBe('["u",[["s","a"],["s","b"]]]')

    expectTcjCode(
      () => encodeEquoraTcj(tcjUnorderedSet([tcjDecimal('1'), tcjDecimal('1.0')])),
      'duplicate_set_value',
    )
  })

  it('rejects NFC key collisions, invalid Unicode and unbranded values', () => {
    expectTcjCode(
      () => tcjObject([
        ['é', tcjNull()],
        ['e\u0301', tcjString('collision')],
      ]),
      'duplicate_object_key',
    )
    expectTcjCode(() => tcjString('\ud800'), 'invalid_unicode')
    expectTcjCode(() => tcjOrderedArray([{ type: 'null' } as never]), 'invalid_value')

    const genuineInteger = tcjInteger('1')
    const spreadForgedInteger = { ...genuineInteger, value: '01' }
    expectTcjCode(() => encodeEquoraTcj(spreadForgedInteger as never), 'invalid_value')

    const genuineNull = tcjNull()
    const reflectedBrand = Object.getOwnPropertySymbols(genuineNull)[0]!
    const reflectedForgery = { type: 'null' } as Record<PropertyKey, unknown>
    Object.defineProperty(reflectedForgery, reflectedBrand, Object.getOwnPropertyDescriptor(genuineNull, reflectedBrand)!)
    Object.freeze(reflectedForgery)
    expectTcjCode(() => encodeEquoraTcj(reflectedForgery as never), 'invalid_value')
  })

  it('rejects invalid numeric, enum and byte representations', () => {
    expectTcjCode(() => tcjInteger('01'), 'invalid_integer')
    expectTcjCode(() => tcjDecimal('NaN'), 'invalid_decimal')
    expectTcjCode(() => canonicalizeEquoraDecimal('1e8388609'), 'byte_limit_exceeded')
    expectTcjCode(() => tcjEnum('Localized Label'), 'invalid_enum')
    expectTcjCode(() => tcjBytes('ABC'), 'invalid_bytes')
  })

  it('allows exactly 64 recursive TCJ container levels', () => {
    let allowed: EquoraTcjValue = tcjNull()
    for (let index = 0; index < 64; index += 1) allowed = tcjOrderedArray([allowed])
    expect(() => encodeEquoraTcj(allowed)).not.toThrow()

    const blocked = tcjOrderedArray([allowed])
    expectTcjCode(() => encodeEquoraTcj(blocked), 'depth_limit_exceeded')
  })

  it('maps lossless MEXC JSON into generic-json-number TCJ without key-order drift', () => {
    const first = tcjFromMexcJson(parseMexcJson('{"b":1.00,"a":[1e0,"x"]}'))
    const second = tcjFromMexcJson(parseMexcJson('{"a":[1.000,"x"],"b":1}'))

    expect(encodeEquoraTcj(first)).toBe('["o",[["a",["a",[["j","1"],["s","x"]]]],["b",["j","1"]]]]')
    expect(encodeEquoraTcj(second)).toBe(encodeEquoraTcj(first))
    expect(digestEquoraTcj('raw_event_content', second)).toEqual(digestEquoraTcj('raw_event_content', first))
  })

  it('rejects plain or unfrozen containers forged outside the lossless parser', () => {
    expectTcjCode(() => tcjFromMexcJson({ a: 'x' } as never), 'invalid_value')
    expectTcjCode(() => tcjFromMexcJson(['x'] as never), 'invalid_value')
    expectTcjCode(() => tcjFromMexcJson(Object.freeze(['x']) as never), 'invalid_value')

    const nullPrototypeObject = Object.create(null) as Record<string, string>
    nullPrototypeObject.a = 'x'
    expectTcjCode(() => tcjFromMexcJson(nullPrototypeObject as never), 'invalid_value')
    expectTcjCode(() => tcjFromMexcJson(Object.freeze(nullPrototypeObject) as never), 'invalid_value')
  })

  it('applies the byte limit after normative string escaping', () => {
    const exactLimit = encodeEquoraTcj(tcjString('x'.repeat(8_388_600)))
    expect(Buffer.byteLength(exactLimit, 'utf8')).toBe(8_388_608)
    expectTcjCode(
      () => encodeEquoraTcj(tcjString('x'.repeat(8_388_601))),
      'byte_limit_exceeded',
    )
    expectTcjCode(
      () => encodeEquoraTcj(tcjString('\u0000'.repeat(1_398_101))),
      'byte_limit_exceeded',
    )
  })

  it('enforces the exact 100000-node boundary and canonical empty containers', () => {
    const leaf = tcjNull()
    const exactLimit = tcjOrderedArray(Array.from({ length: 99_999 }, () => leaf))
    expect(() => encodeEquoraTcj(exactLimit)).not.toThrow()

    const beyondLimit = tcjOrderedArray(Array.from({ length: 100_000 }, () => leaf))
    expectTcjCode(() => encodeEquoraTcj(beyondLimit), 'node_limit_exceeded')

    expect(encodeEquoraTcj(tcjObject([]))).toBe('["o",[]]')
    expect(encodeEquoraTcj(tcjOrderedArray([]))).toBe('["a",[]]')
    expect(encodeEquoraTcj(tcjUnorderedSet([]))).toBe('["u",[]]')
    expect(encodeEquoraTcj(tcjString(''))).toBe('["s",""]')
    expect(encodeEquoraTcj(tcjObject([]))).not.toBe(encodeEquoraTcj(tcjObject([['present', tcjNull()]])))
  })

  it('matches the pinned raw-event-content SHA-256 golden vector and separates domains', () => {
    const value = tcjObject([
      ['event', tcjEnum('execution')],
      ['id', tcjInteger('123')],
    ])
    expect(encodeEquoraTcj(value)).toBe('["o",[["event",["e","execution"]],["id",["i","123"]]]]')

    const rawDigest = digestEquoraTcj('raw_event_content', value)
    expect(rawDigest).toEqual({
      digestAlgorithm: 'sha256',
      digestContractVersion: 'equora-tcj-v1',
      domain: 'raw_event_content',
      digest: 'fdf2ac9e9c0b51abb07c43592299df87338c46dc33da25f5e8b6d0496fbf1e21',
    })
    expect(digestEquoraTcj('page_observation', value).digest).not.toBe(rawDigest.digest)
    expectTcjCode(() => digestEquoraTcj('runtime_free_domain' as never, value), 'invalid_domain')
  })

  it('matches the independently calculated raw-response-body domain golden vector', () => {
    const body = new TextEncoder().encode('{"ok":true}')
    const digest = digestEquoraRawResponseBody(body)

    expect(digest).toEqual({
      digestAlgorithm: 'sha256',
      digestContractVersion: 'equora-tcj-v1',
      domain: 'raw_response_body',
      digest: 'ad8425132568e49067f0d18bef62f3c2f9d79d7c2f4219d07dcf690e227a7708',
    })
    expect(digestEquoraTcj('raw_event_content', tcjBytes('7b226f6b223a747275657d')).digest).not.toBe(digest.digest)
  })
})

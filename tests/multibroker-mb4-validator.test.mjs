import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  MB4_BROWSER_ARTIFACT_KEYS,
  MB4_EVIDENCE_KEYS,
  MB4_GATE_ARTIFACT_KEYS,
  assertContractReviewHistory,
  assertExactKeys,
  assertNoDisallowedTerminalControls,
  assertNoDisallowedSourceControls,
  assertNoDuplicateJsonObjectKeys,
  assertNoGateInfluenceVariables,
  assertNoTrailingWhitespace,
  canonicalUtf8Bytes,
  inspectJpegDimensions,
  probableSecretClasses,
  readStableRegularFile,
  runStableAbsoluteTextCommand,
  validateBrowserArtifactClosedShape,
  validateEvidenceClosedShape,
  validateGateArtifactClosedShape,
} from '../scripts/multibroker-mb4-validation-lib.mjs'

function objectWithKeys(keys) {
  return Object.fromEntries(keys.map((key) => [key, null]))
}

function evidenceShape() {
  const evidence = objectWithKeys(MB4_EVIDENCE_KEYS.root)
  for (const section of [
    'baseline',
    'claims',
    'authority_boundaries',
    'manifest_contract',
    'browser_qa',
    'gate_evidence',
    'local_audit',
    'independent_review',
  ]) evidence[section] = objectWithKeys(MB4_EVIDENCE_KEYS[section])
  evidence.remediation_history = [objectWithKeys(MB4_EVIDENCE_KEYS.remediation_history_entry)]
  return evidence
}

function gateArtifactShape() {
  const artifact = objectWithKeys(MB4_GATE_ARTIFACT_KEYS.root)
  artifact.execution_environment = objectWithKeys(MB4_GATE_ARTIFACT_KEYS.execution_environment)
  artifact.execution_environment.gate_entrypoints = [objectWithKeys(MB4_GATE_ARTIFACT_KEYS.gate_entrypoint)]
  artifact.transcript_policy = objectWithKeys(MB4_GATE_ARTIFACT_KEYS.transcript_policy)
  artifact.input_snapshot = [objectWithKeys(MB4_GATE_ARTIFACT_KEYS.input_snapshot_entry)]
  artifact.attempts = [objectWithKeys(MB4_GATE_ARTIFACT_KEYS.attempt)]
  return artifact
}

function browserArtifactShape() {
  const artifact = objectWithKeys(MB4_BROWSER_ARTIFACT_KEYS.root)
  for (const section of ['procedure', 'environment', 'assertions', 'interaction', 'console']) {
    artifact[section] = objectWithKeys(MB4_BROWSER_ARTIFACT_KEYS[section])
  }
  for (const section of ['desktop_first_viewport', 'mobile_first_viewport', 'mobile_target_viewport']) {
    artifact[section] = objectWithKeys(MB4_BROWSER_ARTIFACT_KEYS.viewport)
  }
  artifact.source_snapshot = [objectWithKeys(MB4_BROWSER_ARTIFACT_KEYS.source_snapshot_entry)]
  artifact.contrast_checks = [objectWithKeys(MB4_BROWSER_ARTIFACT_KEYS.contrast_check)]
  artifact.screenshots = [objectWithKeys(MB4_BROWSER_ARTIFACT_KEYS.screenshot)]
  return artifact
}

function withTempRoot(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'equora-mb4-validator-'))
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('MB4 validator trust boundary', () => {
  it('rejects invalid UTF-8 before canonical line-ending normalization', () => {
    expect(() => canonicalUtf8Bytes(Buffer.from([0x66, 0x6f, 0x80, 0x6f]), 'invalid.bin'))
      .toThrow(/invalid UTF-8/u)
    expect(canonicalUtf8Bytes(Buffer.from('a\r\nb\r', 'utf8'), 'valid.txt').toString('utf8')).toBe('a\nb\n')
  })

  it('rejects trailing spaces and tabs while allowing leading indentation', () => {
    expect(() => assertNoTrailingWhitespace('  indented\nvalue\n', 'valid.txt')).not.toThrow()
    expect(() => assertNoTrailingWhitespace('value \n', 'space.txt')).toThrow(/line 1/u)
    expect(() => assertNoTrailingWhitespace('value\t\n', 'tab.txt')).toThrow(/line 1/u)
  })

  it('rejects Unicode controls, format characters and non-ASCII separators', () => {
    expect(() => assertNoDisallowedSourceControls('  indented\tvalue\n', 'valid.txt')).not.toThrow()
    for (const codePoint of [
      0x00, 0x0b, 0x0c, 0x1b, 0x7f, 0x85, 0x9b, 0x00ad, 0x00a0, 0x061c, 0x1680,
      0x2007, 0x200b, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202e, 0x2060,
      0x2066, 0x2069, 0xfeff,
    ]) {
      expect(() => assertNoDisallowedSourceControls(`before${String.fromCodePoint(codePoint)}after`, 'invalid.txt'))
        .toThrow(/source control or separator/u)
    }
  })

  it.each([
    ['SPACE plus ESC', 'value \u001b\n'],
    ['TAB plus FORM FEED', 'value\t\u000c\n'],
    ['SPACE plus LINE SEPARATOR', 'value \u2028next\n'],
    ['TAB plus PARAGRAPH SEPARATOR', 'value\t\u2029next\n'],
  ])('fails closed for the %s trailing-whitespace bypass', (_label, value) => {
    expect(() => assertNoDisallowedSourceControls(value, 'bypass.txt')).toThrow(/source control or separator/u)
  })

  it('rejects directories and unstable path replacement', () => withTempRoot((root) => {
    mkdirSync(path.join(root, 'directory'))
    expect(() => readStableRegularFile(root, 'directory')).toThrow(/not a regular file/u)

    writeFileSync(path.join(root, 'candidate.txt'), 'before\n')
    expect(() => readStableRegularFile(root, 'candidate.txt', {
      afterRead() {
        writeFileSync(path.join(root, 'candidate.txt'), 'after!\n')
      },
    })).toThrow(/changed while it was being read/u)
  }))

  it('rejects a junction path segment on Windows and a symlink path segment elsewhere', () => withTempRoot((root) => {
    const target = path.join(root, 'target')
    mkdirSync(target)
    writeFileSync(path.join(target, 'candidate.txt'), 'content\n')
    const linked = path.join(root, 'linked')
    symlinkSync(target, linked, process.platform === 'win32' ? 'junction' : 'dir')
    expect(() => readStableRegularFile(root, 'linked/candidate.txt')).toThrow(/symlink or junction/u)
  }))

  it('closes every evidence section against missing and extra keys', () => {
    const base = evidenceShape()
    expect(() => validateEvidenceClosedShape(base)).not.toThrow()
    for (const section of [
      'baseline',
      'claims',
      'authority_boundaries',
      'manifest_contract',
      'browser_qa',
      'gate_evidence',
      'local_audit',
      'independent_review',
    ]) {
      const missing = structuredClone(base)
      delete missing[section][MB4_EVIDENCE_KEYS[section][0]]
      expect(() => validateEvidenceClosedShape(missing), `${section} missing`).toThrow(/keys mismatch/u)
      const extra = structuredClone(base)
      extra[section].unexpected = false
      expect(() => validateEvidenceClosedShape(extra), `${section} extra`).toThrow(/keys mismatch/u)
    }
  })

  it('closes gate and browser artifacts against missing or extra fields', () => {
    const gate = gateArtifactShape()
    const browser = browserArtifactShape()
    expect(() => validateGateArtifactClosedShape(gate)).not.toThrow()
    expect(() => validateBrowserArtifactClosedShape(browser)).not.toThrow()

    const gateMissing = structuredClone(gate)
    delete gateMissing.attempts[0].transcript_canonical_sha256
    expect(() => validateGateArtifactClosedShape(gateMissing)).toThrow(/keys mismatch/u)
    const browserExtra = structuredClone(browser)
    browserExtra.assertions.unexpected = true
    expect(() => validateBrowserArtifactClosedShape(browserExtra)).toThrow(/keys mismatch/u)
  })

  it('rejects duplicate JSON object keys at any nesting depth', () => {
    expect(() => assertNoDuplicateJsonObjectKeys('{"one":1,"one":2}', 'duplicate.json'))
      .toThrow(/duplicate object key/u)
    expect(() => assertNoDuplicateJsonObjectKeys('{"outer":{"one":1,"one":2}}', 'nested.json'))
      .toThrow(/duplicate object key/u)
    expect(() => assertNoDuplicateJsonObjectKeys('{"one":1,"nested":[true,{"two":2}]}', 'valid.json'))
      .not.toThrow()
  })

  it.each([
    ['private_key', ['-----BEGIN', 'DSA PRIVATE KEY-----'].join(' ')],
    ['private_key', ['-----BEGIN', 'ENCRYPTED PRIVATE KEY-----'].join(' ')],
    ['aws_access_key', `AKIA${'1234567890ABCDEF'}`],
    ['github_classic_token', `ghp_${'a'.repeat(36)}`],
    ['github_fine_grained_token', `github_pat_${'a'.repeat(30)}`],
    ['slack_token', `xoxb-${'1234567890'}-${'abcdefghijk'}`],
    ['stripe_secret', `sk_live_${'a'.repeat(24)}`],
    ['jwt', `${'eyJ'.padEnd(14, 'a')}.${'eyJ'.padEnd(14, 'b')}.${'sig'.padEnd(14, 'c')}`],
    ['credential_url', ['postgresql', '://', 'equora', ':', 'realpassword', '@example.invalid/equora'].join('')],
    ['assigned_long_credential', `api_key = "${'a'.repeat(32)}"`],
    ['assigned_long_credential', ['{"api', 'Key":"', 'A1b2'.repeat(8), '"}'].join('')],
    ['assigned_long_credential', ['{"secret', 'Key":"', 'Z9y8'.repeat(10), '"}'].join('')],
    ['assigned_long_credential', ['MEXC', '_API', '_KEY=', 'K7m3'.repeat(8)].join('')],
    ['assigned_long_credential', ['EQUORA', '_BROKER', '_SECRET', '_KEY=', 'Q7v5'.repeat(12)].join('')],
    ['assigned_long_credential', ['EQUORA', '_BROKER', '_SECRET', '_KEYS=', 'R8w6'.repeat(12)].join('')],
    ['assigned_long_credential', ['MEXC', '_API', '_SECRET=', 'S9x7'.repeat(12)].join('')],
    ['assigned_long_credential', ['{"api', 'Secret":"', 'T1y8'.repeat(12), '"}'].join('')],
    ['assigned_long_credential', ['{"access', 'Key":"', 'U2z9'.repeat(12), '"}'].join('')],
    ['assigned_long_credential', ['{"nested":{"api\\u0053', 'ecret":"', 'V3a1'.repeat(12), '"}}'].join('')],
    ['assigned_long_credential', ['{"brokerSecret', 'Keyring":"', 'W4b2'.repeat(12), '"}'].join('')],
    ['assigned_long_credential', ['{"api', 'Keys":["placeholder","', 'X5c3'.repeat(12), '"]}'].join('')],
    ['assigned_long_credential', ['{"brokerSecret', 'Keys":{"label":"primary","material":"', 'Y6d4'.repeat(12), '"}}'].join('')],
    ['assigned_long_credential', ['{"client', 'Secrets":{"active":{"label":"x","value":"', 'Z7e5'.repeat(12), '"}}}'].join('')],
    ['assigned_long_credential', ['const api', 'Secret = process.env.MEXC_API_SECRET || "', 'A8f6'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['const access', 'Key = process.env.MEXC_ACCESS_KEY ?? "', 'B9g7'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['const secret', 'Key = input.secretKey || "', 'C1h8'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['const api', 'Secret = process.env.MEXC_API_SECRET ||\n  "', 'D2i9'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['const access', 'Key = process.env.MEXC_ACCESS_KEY ??\n  "', 'E3j1'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['api', 'Secret ||= "', 'F4k2'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['api', 'Secret ??= "', 'G5m3'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['const client', 'Secret = configured\n  ? process.env.CLIENT_SECRET\n  : "', 'H6n4'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['const api', 'Secret = /* local fallback\n  assigned directly */\n  "', 'J7p5'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['const api', 'Secret = process.env.MEXC_API_SECRET ||\n  /* local fallback\n     used only for development */\n  "', 'K8q6'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['const access', 'Key = process.env.MEXC_ACCESS_KEY ??\n  /* local fallback\n     used only for development */\n  "', 'L9r7'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['api', 'Secret ||= /* local fallback\n  assignment */\n  "', 'M1s8'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['api', 'Secret ??= /* local fallback\n  assignment */\n  "', 'N2t9'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['const client', 'Secret = configured\n  ? process.env.CLIENT_SECRET\n  : /* local fallback\n       ternary branch */\n    "', 'P3u1'.repeat(12), '"'].join('')],
    ['assigned_long_credential', ['const api', 'Secret = "', 'R4v2'.repeat(12), '/* literal marker"'].join('')],
    ['assigned_long_credential', ['const api', 'Secret = `', 'S5w3'.repeat(12), '/* literal marker`'].join('')],
    ['assigned_long_credential', ['const api', 'Secret = `', '${process.env.MEXC_API_SECRET || "', 'T6x4'.repeat(12), '"}', '`'].join('')],
    ['assigned_long_credential', ['const api', 'Secret = `', 'U7y5'.repeat(12), '${process.env.MEXC_API_SECRET}', '`'].join('')],
    ['assigned_long_credential', ['const api', 'Secret = `', '${process.env.MEXC_API_SECRET ?? `', '${input.apiSecret || "', 'V8z6'.repeat(12), '"}', '`}', '`'].join('')],
    ['assigned_long_credential', ['const api', 'Secret = `', 'A1-B2-C3-D4-E5-F6-G7-H8-I9', '`'].join('')],
    ['assigned_long_credential', ['const api', 'Secret = `', 'A1_B2_C3_D4_E5_F6_G7_H8_I9', '`'].join('')],
    ['assigned_long_credential', ['const api', 'Secret = `', 'A1+B2/C3=D4-E5_F6+G7/H8=I9', '`'].join('')],
    ['assigned_long_credential', ['const api', 'Secret = `A1B2C3D4E5F6', '${process.env.MEXC_API_SECRET}', 'G7H8I9J1K2L3`'].join('')],
    ['authorization_bearer', ['Authorization', ': Bearer ', 'eyJ9'.repeat(8)].join('')],
  ])('detects offline secret class %s', (expectedClass, fixture) => {
    expect(probableSecretClasses(fixture)).toContain(expectedClass)
  })

  it('does not flag identifiers, placeholders or short adversarial test markers as secrets', () => {
    const benign = [
      "const apiKey = input.apiKey; const secretKey = ''; API_SECRET=must-not-render; postgresql://host/db",
      'const apiSecret = process.env.MEXC_API_SECRET',
      'const accessKey = input.accessKey',
      'const apiKeys = [input.apiKey, process.env.MEXC_API_KEY]',
      'const clientSecrets = { active: input.clientSecret }',
      `const apiSecret = process.env.MEXC_API_SECRET\nconst unrelated = "${'runtime-description-'.repeat(4)}"`,
      `const apiSecret = process.env.MEXC_API_SECRET /* "${'comment-only-long-value-'.repeat(3)}" */`,
      `const accessKey = input.accessKey /* documentation\n  "${'comment-only-long-value-'.repeat(3)}"\n*/`,
      `const apiSecret = \`${'${process.env.MEXC_API_SECRET}'}\``,
      `const apiSecret = \`${'${process.env.MEXC_API_SECRET /* "' + 'comment-only-long-value-'.repeat(3) + '" */}'}\``,
      `const apiSecret = \`${'${process.env.MEXC_API_KEY}${process.env.MEXC_API_SECRET}'}\``,
      `const apiSecret = \`${'${process.env.MEXC_API_KEY}::${config.apiSecret}--${input.apiSecret}'}\``,
      `const apiSecret = \`${'${config.apiSecret ?? `${process.env.MEXC_API_SECRET}${input.apiSecret}`}'}\``,
      `const apiSecret = \`${'${resolveSecret(process.env.MEXC_API_SECRET, config.apiSecret)}${readSecret(input.apiSecret)}'}\``,
      `const apiSecret = process.env.MEXC_API_SECRET\n/* independent documentation block */\nconst unrelated = "${'runtime-description-'.repeat(4)}"`,
      'const clientSecret = ${CONFIGURED_AT_RUNTIME}',
      "const fixture = { last_error: 'provider payload: API_SECRET=must-not-render' }",
      '{"apiSecret":"fixture-only"}',
    ].join('\n')
    expect(probableSecretClasses(benign)).toEqual([])
    expect(() => assertExactKeys({ one: true }, ['one'], 'sample')).not.toThrow()
  })

  it.each(['#', '~', ':', '-', '_', '/'])('keeps repeated punctuation-only %s separator quasis between runtime references benign', (separator) => {
    const runtimeTemplate = Array.from({ length: 40 }, () => '${process.env.MEXC_API_SECRET}').join(separator)
    expect(probableSecretClasses(['const api', 'Secret = `', runtimeTemplate, '`'].join(''))).toEqual([])
  })

  it.each(['   ', ' # ', '\t-\t', '\n/\n'])('keeps repeated whitespace or punctuation-only %j separator quasis benign', (separator) => {
    const runtimeTemplate = Array.from({ length: 40 }, () => '${process.env.MEXC_API_SECRET}').join(separator)
    expect(probableSecretClasses(['const api', 'Secret = `', runtimeTemplate, '`'].join(''))).toEqual([])
  })

  it.each(['via', 'to', 'viaAPI', 'short-label', 'separatorText', 'provider-label', 'v2', 'part2', 'api2', 'provider2-label', 'step1'])('treats accumulated alphanumeric static material %s conservatively', (material) => {
    const runtimeTemplate = Array.from({ length: 40 }, () => '${process.env.MEXC_API_SECRET}').join(material)
    expect(probableSecretClasses(['const api', 'Secret = `', runtimeTemplate, '`'].join('')))
      .toContain('assigned_long_credential')
  })

  it('classifies the same formatted hard value consistently as a string and a template', () => {
    const hardValue = 'A1-B2-C3-D4-E5-F6-G7-H8-I9'
    expect(probableSecretClasses(['const api', 'Secret = "', hardValue, '"'].join('')))
      .toContain('assigned_long_credential')
    expect(probableSecretClasses(['const api', 'Secret = `', hardValue, '`'].join('')))
      .toContain('assigned_long_credential')
  })

  it.each([
    ['uppercase', 'ABCDEFGHIJKL', 'MNOPQRSTUVWX'],
    ['lowercase', 'abcdefghijkl', 'mnopqrstuvwxyz'],
    ['mixed case', 'AbCdEfGhIjKl', 'MnOpQrStUvWx'],
    ['hyphenated', 'ABC-DEF-GHI-J', 'KLM-NOP-QRS-T'],
    ['underscored', 'ABC_DEF_GHI_J', 'KLM_NOP_QRS_T'],
    ['slash-formatted', 'ABC/DEF/GHI/J', 'KLM/NOP/QRS/T'],
    ['plus-formatted', 'ABC+DEF+GHI+J', 'KLM+NOP+QRS+T'],
    ['equals-formatted', 'ABC=DEF=GHI=J', 'KLM=NOP=QRS=T'],
  ])('classifies %s static material consistently across a string and two template quasis', (_label, left, right) => {
    expect(probableSecretClasses(['const api', 'Secret = "', left, right, '"'].join('')))
      .toContain('assigned_long_credential')
    expect(probableSecretClasses(['const api', 'Secret = `', left, '${process.env.SEP}', right, '`'].join('')))
      .toContain('assigned_long_credential')
  })

  it.each([
    ['SPACE', 'ABCDEFGHIJK ', ' LMNOPQRSTUV'],
    ['TAB', 'ABCDEFGHIJK\t', '\tLMNOPQRSTUV'],
    ['LF', 'ABCDEFGHIJK\n', '\nLMNOPQRSTUV'],
  ])('preserves internal %s bytes across template quasi boundaries', (_label, left, right) => {
    const staticMaterial = `${left}${right}`
    expect(staticMaterial).toHaveLength(24)
    expect(probableSecretClasses(['const api', 'Secret = "', staticMaterial, '"'].join('')))
      .toContain('assigned_long_credential')
    expect(probableSecretClasses(['const api', 'Secret = `', left, '${process.env.SEP}', right, '`'].join('')))
      .toContain('assigned_long_credential')
  })

  it('trims only the outer combined candidate instead of counting outer whitespace', () => {
    const left = ' ABCDEFGHIJK'
    const right = 'LMNOPQRSTUV '
    expect(`${left}${right}`).toHaveLength(24)
    expect(probableSecretClasses(['const api', 'Secret = `', left, '${process.env.SEP}', right, '`'].join('')))
      .toEqual([])
  })

  it('combines hard fragments while retaining intervening alphanumeric labels as conservative material', () => {
    const fixture = ['const api', 'Secret = `via${process.env.SEP}ABCDEFGHIJKL${process.env.SEP}via${process.env.SEP}MNOPQRSTUVWX`'].join('')
    expect(probableSecretClasses(fixture)).toContain('assigned_long_credential')
  })

  it('enforces the exact nested-template expression depth boundary', () => {
    const nestedTemplate = (depth) => {
      let template = '${process.env.MEXC_API_SECRET}'
      for (let index = 0; index < depth; index += 1) template = '${`' + template + '`}'
      return ['const api', 'Secret = `', template, '`'].join('')
    }
    expect(probableSecretClasses(nestedTemplate(15))).toEqual([])
    expect(probableSecretClasses(nestedTemplate(16))).toContain('assigned_long_credential')
  })

  it('enforces the exact template expression node budget boundary', () => {
    const references = '${process.env.X}'.repeat(6_666)
    expect(probableSecretClasses(['const api', 'Secret = `', references, '#'.repeat(8), '`'].join(''))).toEqual([])
    expect(probableSecretClasses(['const api', 'Secret = `', references, '#'.repeat(9), '`'].join('')))
      .toContain('assigned_long_credential')
  })

  it('keeps a bounded high number of exclusively runtime-referential interpolations benign', () => {
    const runtimeTemplate = Array.from({ length: 256 }, () => '${process.env.MEXC_API_SECRET}').join('')
    expect(probableSecretClasses('const apiSecret = `' + runtimeTemplate + '`')).toEqual([])
  })

  it('rejects a contract that omits the latest append-only NO-PASS history binding', () => {
    const independentReview = {
      initial_snapshot_result: 'no_pass_with_open_p2_findings',
      initial_review_ids: ['A3', 'A4', 'A5'],
      prior_remediation_snapshot_result: 'no_pass_with_four_open_p2_findings',
      prior_remediation_manifest_sha256: '0fc0d3dd2889c3b03e943d5fb3a9a6271aaacdb68d2a12fad579fff3d1e85578',
      prior_remediation_review_ids: ['A3', 'A4', 'A5'],
      latest_no_pass_snapshot_result: 'no_pass_with_two_open_p2_findings',
      latest_no_pass_manifest_sha256: '4cd3811d960dff8fb5b4fefa6e3dd8d2a7d01270eeaa3be62059f8c41e074593',
      latest_no_pass_review_ids: ['A3:pass', 'A4:no-pass', 'A5:pass'],
      fourth_remediation_snapshot_result: 'no_pass_with_one_open_p2_finding',
      fourth_remediation_manifest_sha256: '8de29258c85a058cccd22f5f0d097070f14e0d534739c8ea3e1ad63de453975a',
      fourth_remediation_review_ids: ['A3:pass', 'A4:no-pass', 'A5:pass'],
      fifth_remediation_snapshot_result: 'no_pass_with_two_open_p2_findings',
      fifth_remediation_manifest_sha256: '2a6d53989f4baf97b648793c66d2c70379d0fdc6e92638c1ae1b2ee82b300a67',
      fifth_remediation_review_ids: ['A3:no-pass', 'A4:no-pass', 'A5:pass'],
      sixth_remediation_snapshot_result: 'no_pass_with_one_open_p2_finding',
      sixth_remediation_manifest_sha256: 'f469c24da5aabbe40d184189781a1cae9d5e9ecb3b9d9c2a4e23b1753b731fdf',
      sixth_remediation_review_ids: ['A3:pass', 'A4:no-pass', 'A5:pass'],
      seventh_remediation_snapshot_result: 'no_pass_with_one_open_p2_finding',
      seventh_remediation_manifest_sha256: '25b1107ba0614e6ce658a17a9c1be297896876b656a8b327d0ec9199393e883d',
      seventh_remediation_review_ids: ['A3:pass', 'A4:no-pass', 'A5:pass'],
      eighth_remediation_snapshot_result: 'no_pass_with_two_open_p2_findings',
      eighth_remediation_manifest_sha256: 'a9f015686df07a893b55096ed1ec277802fecfc2d4dd9a58c3ca5011721dd451',
      eighth_remediation_review_ids: ['A3:pass', 'A4:no-pass', 'A5:pass'],
      ninth_remediation_snapshot_result: 'no_pass_with_two_open_p2_findings',
      ninth_remediation_manifest_sha256: 'ccb022ac20b4714bc0d3b2296864bfe2da7dc0d4e8e2094de62374cf2e6dfe2b',
      ninth_remediation_review_ids: ['A3:no-pass', 'A4:no-pass', 'A5:pass'],
      tenth_remediation_snapshot_result: 'no_pass_with_one_open_p2_finding',
      tenth_remediation_manifest_sha256: 'b43e3d172fb47ed55b806ffe84678ff7017adcfc8caf5b6ca495d7b090025b66',
      tenth_remediation_review_ids: ['A3:no-pass', 'A4:no-pass', 'A5:pass'],
      eleventh_remediation_snapshot_result: 'no_pass_with_one_open_p2_finding',
      eleventh_remediation_manifest_sha256: 'b11c716c1003af1640264dbc357e1008b0f3a66656fc5861255ad25a0dcb653f',
      eleventh_remediation_review_ids: ['A3:pass', 'A4:no-pass', 'A5:pass'],
      twelfth_remediation_snapshot_result: 'no_pass_with_one_open_p2_finding',
      twelfth_remediation_manifest_sha256: '7858366a1fd394103f6cbd5662e4097cc1d0f878ccc27db3ad38c7b1b103460d',
      twelfth_remediation_review_ids: ['A3:no-pass', 'A4:pass', 'A5:pass'],
    }
    const contract = [
      '`review_history:initial;result=no_pass_with_open_p2_findings;manifest=unbound_initial_13_path_snapshot;reviewers=A3,A4,A5`',
      '`review_history:prior;result=no_pass_with_four_open_p2_findings;manifest=0fc0d3dd2889c3b03e943d5fb3a9a6271aaacdb68d2a12fad579fff3d1e85578;reviewers=A3,A4,A5`',
      '`review_history:latest;result=no_pass_with_two_open_p2_findings;manifest=4cd3811d960dff8fb5b4fefa6e3dd8d2a7d01270eeaa3be62059f8c41e074593;reviewers=A3:pass,A4:no-pass,A5:pass`',
      '`review_history:fourth;result=no_pass_with_one_open_p2_finding;manifest=8de29258c85a058cccd22f5f0d097070f14e0d534739c8ea3e1ad63de453975a;reviewers=A3:pass,A4:no-pass,A5:pass`',
      '`review_history:fifth;result=no_pass_with_two_open_p2_findings;manifest=2a6d53989f4baf97b648793c66d2c70379d0fdc6e92638c1ae1b2ee82b300a67;reviewers=A3:no-pass,A4:no-pass,A5:pass`',
      '`review_history:sixth;result=no_pass_with_one_open_p2_finding;manifest=f469c24da5aabbe40d184189781a1cae9d5e9ecb3b9d9c2a4e23b1753b731fdf;reviewers=A3:pass,A4:no-pass,A5:pass`',
      '`review_history:seventh;result=no_pass_with_one_open_p2_finding;manifest=25b1107ba0614e6ce658a17a9c1be297896876b656a8b327d0ec9199393e883d;reviewers=A3:pass,A4:no-pass,A5:pass`',
      '`review_history:eighth;result=no_pass_with_two_open_p2_findings;manifest=a9f015686df07a893b55096ed1ec277802fecfc2d4dd9a58c3ca5011721dd451;reviewers=A3:pass,A4:no-pass,A5:pass`',
      '`review_history:ninth;result=no_pass_with_two_open_p2_findings;manifest=ccb022ac20b4714bc0d3b2296864bfe2da7dc0d4e8e2094de62374cf2e6dfe2b;reviewers=A3:no-pass,A4:no-pass,A5:pass`',
      '`review_history:tenth;result=no_pass_with_one_open_p2_finding;manifest=b43e3d172fb47ed55b806ffe84678ff7017adcfc8caf5b6ca495d7b090025b66;reviewers=A3:no-pass,A4:no-pass,A5:pass`',
      '`review_history:eleventh;result=no_pass_with_one_open_p2_finding;manifest=b11c716c1003af1640264dbc357e1008b0f3a66656fc5861255ad25a0dcb653f;reviewers=A3:pass,A4:no-pass,A5:pass`',
      '`review_history:twelfth;result=no_pass_with_one_open_p2_finding;manifest=7858366a1fd394103f6cbd5662e4097cc1d0f878ccc27db3ad38c7b1b103460d;reviewers=A3:no-pass,A4:pass,A5:pass`',
    ]
    expect(() => assertContractReviewHistory(contract.join('\n'), independentReview)).not.toThrow()
    expect(() => assertContractReviewHistory(contract.slice(0, -1).join('\n'), independentReview))
      .toThrow(/twelfth review history binding missing/u)
  })

  it('fails closed when a parsed JSON credential scan exceeds its depth budget', () => {
    let nested = 'clear'
    for (let index = 0; index < 66; index += 1) nested = { nested }
    expect(probableSecretClasses(JSON.stringify(nested))).toContain('structured_credential_scan_limit')
  })

  it('rejects gate-influencing environment variables before execution', () => {
    for (const environment of [
      { NODE_OPTIONS: '--require=unexpected' },
      { NODE_PATH: 'unexpected' },
      { npm_config_registry: 'https://example.invalid' },
      { VITEST_POOL_ID: 'unexpected' },
      { EQUORA_MB4_REVIEW_FIXTURE: 'local_only' },
      { EQUORA_MEXC_RUNTIME_MODE: 'capture' },
    ]) {
      expect(() => assertNoGateInfluenceVariables(environment)).toThrow(/influence variables/u)
    }
    expect(() => assertNoGateInfluenceVariables({ EQUORA_MEXC_RUNTIME_MODE: 'off' })).not.toThrow()
  })

  it('rejects C0, C1, CSI and OSC transcript controls while allowing TAB, LF and CR', () => {
    expect(() => assertNoDisallowedTerminalControls('plain\tline\r\n')).not.toThrow()
    for (const codePoint of [0x08, 0x1b, 0x7f, 0x9b]) {
      expect(() => assertNoDisallowedTerminalControls(`before${String.fromCodePoint(codePoint)}after`))
        .toThrow(/terminal control/u)
    }
  })

  it('executes an absolute stable binary independently of a hostile PATH', () => withTempRoot((root) => {
    writeFileSync(path.join(root, process.platform === 'win32' ? 'node.cmd' : 'node'), 'fake path binary')
    const output = runStableAbsoluteTextCommand(process.execPath, ['--version'], {
      cwd: root,
      env: { ...process.env, PATH: root },
    }).trim()
    expect(output).toBe(process.version)
  }))

  it('rejects invalid UTF-8 and a UTF-8 BOM from absolute command output before text decoding', () => withTempRoot((root) => {
    const invalidScript = path.join(root, 'invalid-output.mjs')
    writeFileSync(invalidScript, 'process.stdout.write(Buffer.from([0x66, 0x80]))\n')
    expect(() => runStableAbsoluteTextCommand(process.execPath, [invalidScript], {
      cwd: root,
      env: process.env,
    })).toThrow(/invalid UTF-8/u)

    const bomScript = path.join(root, 'bom-output.mjs')
    writeFileSync(bomScript, 'process.stdout.write(Buffer.from([0xef, 0xbb, 0xbf, 0x66]))\n')
    expect(() => runStableAbsoluteTextCommand(process.execPath, [bomScript], {
      cwd: root,
      env: process.env,
    })).toThrow(/UTF-8 BOM/u)
  }))

  it('requires a complete JPEG with a SOF dimension segment and scan payload', () => {
    const jpeg = Buffer.from([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00,
      0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
      0x01, 0xff, 0xd9,
    ])
    expect(inspectJpegDimensions(jpeg)).toEqual({ width: 3, height: 2 })
    expect(() => inspectJpegDimensions(jpeg.subarray(0, -2))).toThrow(/EOI/u)
    const noSof = Buffer.from(jpeg)
    noSof[3] = 0xe0
    expect(() => inspectJpegDimensions(noSof)).toThrow(/before a SOF/u)
  })
})

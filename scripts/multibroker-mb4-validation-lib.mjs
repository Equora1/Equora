import { execFileSync } from 'node:child_process'
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })

export const MB4_EVIDENCE_KEYS = Object.freeze({
  root: Object.freeze([
    'schema_version',
    'phase',
    'phase_status',
    'mb4_gate',
    'generated_at_utc',
    'baseline',
    'claims',
    'authority_boundaries',
    'candidate_scope',
    'manifest_contract',
    'browser_qa',
    'gate_evidence',
    'local_audit',
    'known_limits',
    'independent_review',
    'remediation_history',
    'hard_gates_remaining',
  ]),
  baseline: Object.freeze([
    'head',
    'origin_main',
    'branch',
    'fresh_branch_from_origin_main',
    'old_squash_merged_branch_reused',
  ]),
  claims: Object.freeze([
    'scope',
    'built_provider_count',
    'built_provider_codes',
    'second_provider_built',
    'dynamic_provider_loader_built',
    'generic_ui_receives_credentials',
    'generic_ui_builds_sendable_broker_requests',
    'raw_provider_errors_cross_rsc_boundary',
    'technical_read_attestation_permission_identity_coverage_separate',
    'normal_ui_actions_unknown_provider_environment_status_display_only',
    'legacy_last_sync_used_as_capture_evidence',
    'capture_evidence_source',
    'automatic_capture_added',
    'automatic_import_added',
    'local_review_fixture_production_enabled',
    'visual_modernization_in_scope',
    'local_gate_meaning',
  ]),
  authority_boundaries: Object.freeze([
    'runtime_mode',
    'production_write_authorized',
    'supabase_action_authorized',
    'mexc_or_broker_request_authorized',
    'credential_action_authorized',
    'cron_action_authorized',
    'capture_action_authorized',
    'import_action_authorized',
    'git_staging_authorized',
    'git_commit_authorized',
    'git_push_authorized',
    'pull_request_authorized',
    'merge_authorized',
    'deployment_authorized',
    'branch_deletion_authorized',
  ]),
  manifest_contract: Object.freeze([
    'path',
    'canonicalization',
    'entry_count',
    'excluded_paths',
  ]),
  browser_qa: Object.freeze([
    'status',
    'artifact_path',
    'artifact_schema',
    'artifact_canonical_sha256',
    'artifact_canonical_bytes',
  ]),
  gate_evidence: Object.freeze([
    'status',
    'artifact_path',
    'artifact_schema',
    'artifact_canonical_sha256',
    'artifact_canonical_bytes',
    'attempt_count',
  ]),
  local_audit: Object.freeze(['status', 'reason']),
  independent_review: Object.freeze([
    'required_reviewers',
    'initial_snapshot_result',
    'initial_review_ids',
    'prior_remediation_snapshot_result',
    'prior_remediation_manifest_sha256',
    'prior_remediation_review_ids',
    'latest_no_pass_snapshot_result',
    'latest_no_pass_manifest_sha256',
    'latest_no_pass_review_ids',
    'fourth_remediation_snapshot_result',
    'fourth_remediation_manifest_sha256',
    'fourth_remediation_review_ids',
    'fifth_remediation_snapshot_result',
    'fifth_remediation_manifest_sha256',
    'fifth_remediation_review_ids',
    'sixth_remediation_snapshot_result',
    'sixth_remediation_manifest_sha256',
    'sixth_remediation_review_ids',
    'seventh_remediation_snapshot_result',
    'seventh_remediation_manifest_sha256',
    'seventh_remediation_review_ids',
    'eighth_remediation_snapshot_result',
    'eighth_remediation_manifest_sha256',
    'eighth_remediation_review_ids',
    'ninth_remediation_snapshot_result',
    'ninth_remediation_manifest_sha256',
    'ninth_remediation_review_ids',
    'tenth_remediation_snapshot_result',
    'tenth_remediation_manifest_sha256',
    'tenth_remediation_review_ids',
    'eleventh_remediation_snapshot_result',
    'eleventh_remediation_manifest_sha256',
    'eleventh_remediation_review_ids',
    'twelfth_remediation_snapshot_result',
    'twelfth_remediation_manifest_sha256',
    'twelfth_remediation_review_ids',
    'remediation_reviews_completed',
    'snapshot_rule',
    'pass_condition',
  ]),
  remediation_history_entry: Object.freeze([
    'remediation_id',
    'source_findings',
    'status',
    'claim_boundary',
  ]),
})

const CONTRACT_REVIEW_HISTORY_BINDINGS = Object.freeze([
  Object.freeze({
    id: 'initial',
    resultKey: 'initial_snapshot_result',
    manifestKey: null,
    manifestFallback: 'unbound_initial_13_path_snapshot',
    reviewersKey: 'initial_review_ids',
  }),
  Object.freeze({
    id: 'prior',
    resultKey: 'prior_remediation_snapshot_result',
    manifestKey: 'prior_remediation_manifest_sha256',
    reviewersKey: 'prior_remediation_review_ids',
  }),
  Object.freeze({
    id: 'latest',
    resultKey: 'latest_no_pass_snapshot_result',
    manifestKey: 'latest_no_pass_manifest_sha256',
    reviewersKey: 'latest_no_pass_review_ids',
  }),
  Object.freeze({
    id: 'fourth',
    resultKey: 'fourth_remediation_snapshot_result',
    manifestKey: 'fourth_remediation_manifest_sha256',
    reviewersKey: 'fourth_remediation_review_ids',
  }),
  Object.freeze({
    id: 'fifth',
    resultKey: 'fifth_remediation_snapshot_result',
    manifestKey: 'fifth_remediation_manifest_sha256',
    reviewersKey: 'fifth_remediation_review_ids',
  }),
  Object.freeze({
    id: 'sixth',
    resultKey: 'sixth_remediation_snapshot_result',
    manifestKey: 'sixth_remediation_manifest_sha256',
    reviewersKey: 'sixth_remediation_review_ids',
  }),
  Object.freeze({
    id: 'seventh',
    resultKey: 'seventh_remediation_snapshot_result',
    manifestKey: 'seventh_remediation_manifest_sha256',
    reviewersKey: 'seventh_remediation_review_ids',
  }),
  Object.freeze({
    id: 'eighth',
    resultKey: 'eighth_remediation_snapshot_result',
    manifestKey: 'eighth_remediation_manifest_sha256',
    reviewersKey: 'eighth_remediation_review_ids',
  }),
  Object.freeze({
    id: 'ninth',
    resultKey: 'ninth_remediation_snapshot_result',
    manifestKey: 'ninth_remediation_manifest_sha256',
    reviewersKey: 'ninth_remediation_review_ids',
  }),
  Object.freeze({
    id: 'tenth',
    resultKey: 'tenth_remediation_snapshot_result',
    manifestKey: 'tenth_remediation_manifest_sha256',
    reviewersKey: 'tenth_remediation_review_ids',
  }),
  Object.freeze({
    id: 'eleventh',
    resultKey: 'eleventh_remediation_snapshot_result',
    manifestKey: 'eleventh_remediation_manifest_sha256',
    reviewersKey: 'eleventh_remediation_review_ids',
  }),
  Object.freeze({
    id: 'twelfth',
    resultKey: 'twelfth_remediation_snapshot_result',
    manifestKey: 'twelfth_remediation_manifest_sha256',
    reviewersKey: 'twelfth_remediation_review_ids',
  }),
])

export function assertContractReviewHistory(contract, independentReview) {
  if (typeof contract !== 'string' || !independentReview || typeof independentReview !== 'object') {
    throw new Error('contract review history inputs invalid')
  }
  for (const binding of CONTRACT_REVIEW_HISTORY_BINDINGS) {
    const result = independentReview[binding.resultKey]
    const manifest = binding.manifestKey === null
      ? binding.manifestFallback
      : independentReview[binding.manifestKey]
    const reviewers = independentReview[binding.reviewersKey]
    if (typeof result !== 'string' || typeof manifest !== 'string'
      || !Array.isArray(reviewers) || reviewers.some((value) => typeof value !== 'string')) {
      throw new Error(`${binding.id} review history evidence invalid`)
    }
    const token = `review_history:${binding.id};result=${result};manifest=${manifest};reviewers=${reviewers.join(',')}`
    if (!contract.includes(`\`${token}\``)) {
      throw new Error(`${binding.id} review history binding missing from contract`)
    }
  }
}

export const MB4_GATE_ARTIFACT_KEYS = Object.freeze({
  root: Object.freeze([
    'schema_version',
    'generated_at_utc',
    'input_snapshot',
    'execution_environment',
    'transcript_policy',
    'attempts',
  ]),
  input_snapshot_entry: Object.freeze(['path', 'canonical_sha256', 'canonical_bytes']),
  execution_environment: Object.freeze([
    'platform',
    'arch',
    'node_version',
    'node_executable_sha256',
    'node_executable_bytes',
    'gate_invocation',
    'gate_entrypoints',
    'git_version',
    'git_core_identity',
    'git_core_sha256',
    'git_core_bytes',
    'git_builtin_commands',
    'package_lock_sha256',
    'package_lock_bytes',
    'toolchain_binding_scope',
    'external_toolchain_trust_anchors',
    'environment_policy',
    'inherited_variable_names',
    'inherited_environment_sha256',
    'forced_variables',
    'rejected_influence_variables',
    'loaded_dotenv_files',
  ]),
  gate_entrypoint: Object.freeze(['gates', 'identity', 'sha256', 'bytes']),
  transcript_policy: Object.freeze([
    'encoding',
    'raw_output_validation',
    'line_endings',
    'terminal_controls',
    'npm_notices_removed',
    'workspace_path_replacement',
  ]),
  attempt: Object.freeze([
    'attempt_id',
    'gate',
    'command',
    'started_at_utc',
    'finished_at_utc',
    'exit_code',
    'result',
    'canonical_transcript',
    'transcript_canonical_bytes',
    'transcript_canonical_sha256',
    'result_counts',
  ]),
})

export const MB4_BROWSER_ARTIFACT_KEYS = Object.freeze({
  root: Object.freeze([
    'schema_version',
    'generated_at_utc',
    'source_snapshot',
    'procedure',
    'environment',
    'desktop_first_viewport',
    'mobile_first_viewport',
    'mobile_target_viewport',
    'assertions',
    'interaction',
    'contrast_checks',
    'console',
    'dom_snapshot',
    'dom_snapshot_canonical_bytes',
    'dom_snapshot_canonical_sha256',
    'screenshots',
    'known_observations',
  ]),
  source_snapshot_entry: Object.freeze(['path', 'canonical_sha256', 'canonical_bytes']),
  procedure: Object.freeze([
    'runner',
    'replayability',
    'steps',
    'fixed_viewports',
    'scroll_rule',
  ]),
  environment: Object.freeze([
    'url',
    'node_env',
    'fixture_flag',
    'runtime_mode',
    'next_telemetry_disabled',
    'ci',
    'no_update_notifier',
    'supabase_values',
    'supabase_environment_variable_names',
    'browser_observed_request_origins',
    'external_actions_performed',
    'network_boundary',
  ]),
  viewport: Object.freeze([
    'viewport_width',
    'viewport_height',
    'scroll_x',
    'scroll_y',
    'client_width',
    'scroll_width',
    'horizontal_overflow',
    'meaningful_content_visible',
    'framework_overlay_absent',
    'connection_count',
    'target_heading_visible',
  ]),
  assertions: Object.freeze([
    'meaningful_content_visible',
    'framework_overlay_absent',
    'runtime_off_visible',
    'runtime_status_separate_from_connector_readiness',
    'credential_controls_disabled',
    'provider_count',
    'connection_count',
    'separate_connection_states_visible',
    'known_connection_action_button_count',
    'unknown_state_action_button_count',
    'unsupported_provider_action_button_count',
    'attestation_provider_rights_separated',
    'non_color_status_text_visible',
    'qualified_capture_claims_bounded',
    'all_contrast_checks_passed',
  ]),
  interaction: Object.freeze([
    'provider_button_before_aria_pressed',
    'provider_button_after_enter_aria_pressed',
    'provider_activation_behavior',
    'provider_button_focused_before_enter',
    'provider_focus_method',
    'provider_setup_region_remained_visible',
  ]),
  contrast_check: Object.freeze([
    'label',
    'text',
    'font_size_px',
    'foreground_rgba',
    'effective_background_rgb',
    'contrast_ratio',
    'minimum_ratio',
    'pass',
  ]),
  console: Object.freeze([
    'application_origin_errors',
    'application_origin_warnings',
    'excluded_extension_or_prior_tab_event_count',
  ]),
  screenshot: Object.freeze([
    'name',
    'viewport_width',
    'viewport_height',
    'scroll_x',
    'scroll_y',
    'image_format',
    'image_width',
    'image_height',
    'image_sha256',
    'image_bytes',
    'image_base64',
  ]),
})

export function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  const actual = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} keys mismatch: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
  }
}

export function assertNoDuplicateJsonObjectKeys(text, label) {
  let offset = 0

  function failJson(message) {
    throw new Error(`${label} is not unambiguous JSON: ${message} at offset ${offset}`)
  }

  function skipWhitespace() {
    while (/\s/u.test(text[offset] ?? '')) offset += 1
  }

  function parseString() {
    if (text[offset] !== '"') failJson('expected string')
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
          return JSON.parse(text.slice(start, offset))
        } catch {
          failJson('invalid string escape')
        }
      }
      if (text.charCodeAt(offset) < 0x20) failJson('unescaped control character')
      offset += 1
    }
    failJson('unterminated string')
  }

  function parseValue() {
    skipWhitespace()
    const character = text[offset]
    if (character === '{') return parseObject()
    if (character === '[') return parseArray()
    if (character === '"') return parseString()
    const scalar = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/u.exec(text.slice(offset))
    if (!scalar) failJson('invalid value')
    offset += scalar[0].length
    return null
  }

  function parseObject() {
    const keys = new Set()
    offset += 1
    skipWhitespace()
    if (text[offset] === '}') {
      offset += 1
      return null
    }
    while (offset < text.length) {
      skipWhitespace()
      const key = parseString()
      if (keys.has(key)) failJson(`duplicate object key ${JSON.stringify(key)}`)
      keys.add(key)
      skipWhitespace()
      if (text[offset] !== ':') failJson('expected colon')
      offset += 1
      parseValue()
      skipWhitespace()
      if (text[offset] === '}') {
        offset += 1
        return null
      }
      if (text[offset] !== ',') failJson('expected comma or object end')
      offset += 1
    }
    failJson('unterminated object')
  }

  function parseArray() {
    offset += 1
    skipWhitespace()
    if (text[offset] === ']') {
      offset += 1
      return null
    }
    while (offset < text.length) {
      parseValue()
      skipWhitespace()
      if (text[offset] === ']') {
        offset += 1
        return null
      }
      if (text[offset] !== ',') failJson('expected comma or array end')
      offset += 1
    }
    failJson('unterminated array')
  }

  parseValue()
  skipWhitespace()
  if (offset !== text.length) failJson('trailing content')
}

export function validateEvidenceClosedShape(evidence) {
  assertExactKeys(evidence, MB4_EVIDENCE_KEYS.root, 'evidence')
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
    assertExactKeys(evidence[section], MB4_EVIDENCE_KEYS[section], `evidence.${section}`)
  }
  if (!Array.isArray(evidence.remediation_history)) throw new Error('evidence.remediation_history must be an array')
  for (const [index, entry] of evidence.remediation_history.entries()) {
    assertExactKeys(entry, MB4_EVIDENCE_KEYS.remediation_history_entry, `evidence.remediation_history[${index}]`)
  }
}

export function validateGateArtifactClosedShape(artifact) {
  assertExactKeys(artifact, MB4_GATE_ARTIFACT_KEYS.root, 'gate artifact')
  assertExactKeys(
    artifact.execution_environment,
    MB4_GATE_ARTIFACT_KEYS.execution_environment,
    'gate artifact execution_environment',
  )
  assertExactKeys(artifact.transcript_policy, MB4_GATE_ARTIFACT_KEYS.transcript_policy, 'gate artifact transcript_policy')
  if (!Array.isArray(artifact.input_snapshot) || !Array.isArray(artifact.attempts)) {
    throw new Error('gate artifact snapshot and attempts must be arrays')
  }
  for (const [index, entry] of artifact.input_snapshot.entries()) {
    assertExactKeys(entry, MB4_GATE_ARTIFACT_KEYS.input_snapshot_entry, `gate artifact input_snapshot[${index}]`)
  }
  if (!Array.isArray(artifact.execution_environment.gate_entrypoints)) {
    throw new Error('gate artifact execution_environment.gate_entrypoints must be an array')
  }
  for (const [index, entry] of artifact.execution_environment.gate_entrypoints.entries()) {
    assertExactKeys(entry, MB4_GATE_ARTIFACT_KEYS.gate_entrypoint, `gate artifact gate_entrypoints[${index}]`)
  }
  for (const [index, attempt] of artifact.attempts.entries()) {
    assertExactKeys(attempt, MB4_GATE_ARTIFACT_KEYS.attempt, `gate artifact attempts[${index}]`)
  }
}

export function validateBrowserArtifactClosedShape(artifact) {
  assertExactKeys(artifact, MB4_BROWSER_ARTIFACT_KEYS.root, 'browser artifact')
  for (const section of ['procedure', 'environment', 'assertions', 'interaction', 'console']) {
    assertExactKeys(artifact[section], MB4_BROWSER_ARTIFACT_KEYS[section], `browser artifact.${section}`)
  }
  for (const section of ['desktop_first_viewport', 'mobile_first_viewport', 'mobile_target_viewport']) {
    assertExactKeys(artifact[section], MB4_BROWSER_ARTIFACT_KEYS.viewport, `browser artifact.${section}`)
  }
  if (!Array.isArray(artifact.source_snapshot)) throw new Error('browser artifact source_snapshot must be an array')
  for (const [index, entry] of artifact.source_snapshot.entries()) {
    assertExactKeys(entry, MB4_BROWSER_ARTIFACT_KEYS.source_snapshot_entry, `browser artifact source_snapshot[${index}]`)
  }
  if (!Array.isArray(artifact.contrast_checks) || !Array.isArray(artifact.screenshots)) {
    throw new Error('browser artifact contrast_checks and screenshots must be arrays')
  }
  for (const [index, entry] of artifact.contrast_checks.entries()) {
    assertExactKeys(entry, MB4_BROWSER_ARTIFACT_KEYS.contrast_check, `browser artifact contrast_checks[${index}]`)
  }
  for (const [index, entry] of artifact.screenshots.entries()) {
    assertExactKeys(entry, MB4_BROWSER_ARTIFACT_KEYS.screenshot, `browser artifact screenshots[${index}]`)
  }
}

export function canonicalUtf8Bytes(bytes, label) {
  if (!Buffer.isBuffer(bytes)) throw new Error(`${label} is not a Buffer`)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(`${label} contains a UTF-8 BOM`)
  }
  let text
  try {
    text = UTF8_DECODER.decode(bytes)
  } catch {
    throw new Error(`${label} contains invalid UTF-8`)
  }
  return Buffer.from(text.replace(/\r\n?/gu, '\n'), 'utf8')
}

export function assertNoTrailingWhitespace(text, label) {
  if (typeof text !== 'string') throw new Error(`${label} is not text`)
  const lines = text.split('\n')
  for (const [index, line] of lines.entries()) {
    if (/[\t ]+$/u.test(line)) {
      throw new Error(`${label} contains trailing whitespace at line ${index + 1}`)
    }
  }
}

export function assertNoDisallowedSourceControls(text, label = 'source') {
  if (typeof text !== 'string') throw new Error(`${label} is not text`)
  for (const character of text) {
    if (character === ' ' || character === '\t' || character === '\n') continue
    if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(character) || /\p{Zs}/u.test(character)) {
      const codePoint = character.codePointAt(0).toString(16).padStart(4, '0')
      throw new Error(`${label} contains disallowed source control or separator U+${codePoint}`)
    }
  }
}

export function runStableAbsoluteTextCommand(executablePath, args, options = {}) {
  const before = readStableAbsoluteRegularFile(executablePath, `${executablePath} before execution`)
  const outputBytes = execFileSync(executablePath, args, {
    cwd: options.cwd,
    env: options.env,
    windowsHide: true,
  })
  const after = readStableAbsoluteRegularFile(executablePath, `${executablePath} after execution`)
  if (!before.equals(after)) throw new Error(`${executablePath} changed while it was executed`)
  return canonicalUtf8Bytes(outputBytes, `${executablePath} output`).toString('utf8')
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

export function inspectJpegDimensions(bytes, label = 'JPEG') {
  if (!Buffer.isBuffer(bytes) || bytes.length < 16) throw new Error(`${label} is too short to be a JPEG`)
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`${label} is missing the JPEG SOI marker`)
  if (bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error(`${label} is missing the terminal JPEG EOI marker`)

  let offset = 2
  let dimensions = null
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) throw new Error(`${label} contains an invalid pre-scan JPEG marker boundary`)
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9) break
    if (marker === 0x00 || marker === 0xd8) throw new Error(`${label} contains an invalid JPEG marker`)
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > bytes.length - 2) throw new Error(`${label} contains a truncated JPEG segment length`)
    const segmentLength = bytes.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > bytes.length - 2) {
      throw new Error(`${label} contains an invalid JPEG segment length`)
    }
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 8) throw new Error(`${label} contains a truncated JPEG SOF segment`)
      const height = bytes.readUInt16BE(offset + 3)
      const width = bytes.readUInt16BE(offset + 5)
      if (width <= 0 || height <= 0) throw new Error(`${label} contains invalid JPEG dimensions`)
      if (dimensions !== null) throw new Error(`${label} contains multiple JPEG SOF dimension segments`)
      dimensions = Object.freeze({ width, height })
    }
    if (marker === 0xda) {
      if (dimensions === null) throw new Error(`${label} reaches JPEG scan data before a SOF segment`)
      if (offset + segmentLength >= bytes.length - 2) throw new Error(`${label} contains no JPEG scan payload`)
      return dimensions
    }
    offset += segmentLength
  }
  throw new Error(`${label} contains no JPEG scan segment`)
}

function stableStatSignature(stats) {
  return [
    stats.dev,
    stats.ino,
    stats.mode,
    stats.nlink,
    stats.size,
    stats.mtimeNs,
    stats.ctimeNs,
  ].map(String).join(':')
}

function assertContained(rootRealPath, candidateRealPath, label) {
  const relative = path.relative(rootRealPath, candidateRealPath)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return
  throw new Error(`${label} escapes the repository root`)
}

function inspectSegments(rootPath, relativePath, label) {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error(`${label} must be repository-relative`)
  const segments = relativePath.replaceAll('\\', '/').split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label} contains an invalid path segment`)
  }
  let current = path.resolve(rootPath)
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment)
    const stats = lstatSync(current, { bigint: true })
    if (stats.isSymbolicLink()) throw new Error(`${label} contains a symlink or junction`)
    if (index < segments.length - 1 && !stats.isDirectory()) throw new Error(`${label} has a non-directory path segment`)
    if (index === segments.length - 1 && !stats.isFile()) throw new Error(`${label} is not a regular file`)
  }
  return current
}

export function readStableRegularFile(rootPath, relativePath, options = {}) {
  const rootRealPath = realpathSync(path.resolve(rootPath))
  const targetPath = inspectSegments(rootPath, relativePath, relativePath)
  const targetRealPath = realpathSync(targetPath)
  assertContained(rootRealPath, targetRealPath, relativePath)

  const pathBefore = lstatSync(targetPath, { bigint: true })
  const noFollow = process.platform === 'win32' ? 0 : (constants.O_NOFOLLOW ?? 0)
  const descriptor = openSync(targetPath, constants.O_RDONLY | noFollow)
  let bytes
  let descriptorBefore
  let descriptorAfter
  try {
    descriptorBefore = fstatSync(descriptor, { bigint: true })
    bytes = readFileSync(descriptor)
    options.afterRead?.()
    descriptorAfter = fstatSync(descriptor, { bigint: true })
  } finally {
    closeSync(descriptor)
  }

  const pathAfter = lstatSync(targetPath, { bigint: true })
  const realPathAfter = realpathSync(targetPath)
  if (targetRealPath !== realPathAfter
    || stableStatSignature(pathBefore) !== stableStatSignature(pathAfter)
    || stableStatSignature(descriptorBefore) !== stableStatSignature(descriptorAfter)
    || stableStatSignature(pathBefore) !== stableStatSignature(descriptorBefore)
    || BigInt(bytes.length) !== descriptorBefore.size) {
    throw new Error(`${relativePath} changed while it was being read`)
  }

  return bytes
}

export function readStableAbsoluteRegularFile(absolutePath, label = absolutePath) {
  if (!path.isAbsolute(absolutePath)) throw new Error(`${label} must be absolute`)
  const targetPath = path.resolve(absolutePath)
  const targetBefore = lstatSync(targetPath, { bigint: true })
  if (targetBefore.isSymbolicLink() || !targetBefore.isFile()) {
    throw new Error(`${label} is not a stable regular file`)
  }
  const realPathBefore = realpathSync(targetPath)
  const noFollow = process.platform === 'win32' ? 0 : (constants.O_NOFOLLOW ?? 0)
  const descriptor = openSync(targetPath, constants.O_RDONLY | noFollow)
  let bytes
  let descriptorBefore
  let descriptorAfter
  try {
    descriptorBefore = fstatSync(descriptor, { bigint: true })
    bytes = readFileSync(descriptor)
    descriptorAfter = fstatSync(descriptor, { bigint: true })
  } finally {
    closeSync(descriptor)
  }
  const targetAfter = lstatSync(targetPath, { bigint: true })
  if (realPathBefore !== realpathSync(targetPath)
    || stableStatSignature(targetBefore) !== stableStatSignature(targetAfter)
    || stableStatSignature(descriptorBefore) !== stableStatSignature(descriptorAfter)
    || stableStatSignature(targetBefore) !== stableStatSignature(descriptorBefore)
    || BigInt(bytes.length) !== descriptorBefore.size) {
    throw new Error(`${label} changed while it was being read`)
  }
  return bytes
}

const GATE_INFLUENCE_NAME = /^(?:NODE_OPTIONS|NODE_PATH|NODE_V8_COVERAGE|NODE_EXTRA_CA_CERTS|TS_NODE_.+|BABEL_.+|SWC_.+|VITEST_.+|NEXT_.+|TURBO_.+|CI|npm_config_.+|NPM_CONFIG_.+|EQUORA_MB4_REVIEW_FIXTURE|MEXC_.+|BROKER_.+|SUPABASE_.+|NEXT_PUBLIC_SUPABASE_.+)$/iu

export function gateInfluenceVariableNames(environment) {
  return Object.keys(environment)
    .filter((name) => {
      if (name.toUpperCase() === 'EQUORA_MEXC_RUNTIME_MODE') {
        return String(environment[name] ?? '').trim().toLowerCase() !== 'off'
      }
      return GATE_INFLUENCE_NAME.test(name)
    })
    .sort((left, right) => left.localeCompare(right, 'en'))
}

export function assertNoGateInfluenceVariables(environment) {
  const rejected = gateInfluenceVariableNames(environment)
  if (rejected.length > 0) {
    throw new Error(`gate influence variables are not permitted: ${rejected.join(', ')}`)
  }
  return rejected
}

export function assertNoDisallowedTerminalControls(text, label = 'transcript') {
  const match = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.exec(text)
  if (match) {
    const codePoint = match[0].codePointAt(0).toString(16).padStart(4, '0')
    throw new Error(`${label} contains disallowed terminal control U+${codePoint}`)
  }
}

const SECRET_PATTERNS = Object.freeze([
  ['private_key', /-----BEGIN (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----/u],
  ['aws_access_key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u],
  ['github_classic_token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/u],
  ['github_fine_grained_token', /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u],
  ['slack_token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/u],
  ['stripe_secret', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/u],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u],
  ['credential_url', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s/:@]+:[^\s@]+@[^\s]+/iu],
  ['authorization_bearer', /\bauthorization\s*:\s*bearer\s+[A-Za-z0-9._~+\/-]{20,}/iu],
])

const SENSITIVE_CREDENTIAL_NAME_SUFFIXES = Object.freeze([
  'accesskey',
  'accesskeys',
  'accesstoken',
  'accesstokens',
  'apikey',
  'apikeys',
  'apisecret',
  'apisecrets',
  'clientsecret',
  'clientsecrets',
  'password',
  'passwords',
  'privatekey',
  'privatekeys',
  'secretkey',
  'secretkeyring',
  'secretkeyrings',
  'secretkeys',
])

const ASSIGNMENT_OPERATOR = String.raw`(?::|(?:\|\||\?\?|&&)?=(?!=|>))`
const QUOTED_ASSIGNMENT_START = new RegExp(String.raw`['"]((?:\\.|[^'"\\]){1,256})['"]\s*${ASSIGNMENT_OPERATOR}\s*`, 'gmu')
const BARE_ASSIGNMENT_START = new RegExp(String.raw`\b([A-Za-z_$][A-Za-z0-9_$-]{1,255})\b\s*${ASSIGNMENT_OPERATOR}\s*`, 'gmu')
const CREDENTIAL_SCAN_MAX_NODES = 100_000
const CREDENTIAL_SCAN_MAX_DEPTH = 64
const EXPRESSION_SCAN_MAX_NODES = 100_000
const EXPRESSION_SCAN_MAX_DEPTH = 32
const HARD_LITERAL_MIN_LENGTH = 24

function decodeUnicodeEscapes(value) {
  return value
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/gu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/gu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
}

function isSensitiveCredentialName(value) {
  const normalized = decodeUnicodeEscapes(String(value)).replace(/[^A-Za-z0-9]/gu, '').toLowerCase()
  return SENSITIVE_CREDENTIAL_NAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

function isProbableCredentialValue(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed.length < HARD_LITERAL_MIN_LENGTH) return false
  if (/^(?:process\.env\.|import\.meta\.env\.|Deno\.env\.|input\.|credentials\.|config\.|env\.)/iu.test(trimmed)) {
    return false
  }
  if (/^\$\{[^}]+\}$/u.test(trimmed)) return false
  return true
}

function isProbableHardLiteral(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed.length < HARD_LITERAL_MIN_LENGTH) return false
  if (/^\$\{[^}]+\}$/u.test(trimmed)) return false
  return true
}

function consumeExpressionBudget(state) {
  state.nodes += 1
  return state.nodes <= EXPRESSION_SCAN_MAX_NODES
}

function scanQuotedExpressionLiteral(text, start, quote, state) {
  let value = ''
  let escaped = false
  let offset = start + 1
  for (; offset < text.length; offset += 1) {
    if (!consumeExpressionBudget(state)) {
      return { closed: false, credential: true, end: text.length }
    }
    const character = text[offset]
    if (escaped) {
      value += character
      escaped = false
    } else if (character === '\\') {
      value += character
      escaped = true
    } else if (character === quote) {
      return {
        closed: true,
        credential: isProbableHardLiteral(value),
        end: offset + 1,
      }
    } else {
      value += character
    }
  }
  return { closed: false, credential: true, end: text.length }
}

function containsTemplateCredentialCharacters(value) {
  return /[\p{L}\p{N}]/u.test(value)
}

function templateQuasisContainLongCredential(quasis) {
  const materialQuasis = quasis
    .filter((value) => containsTemplateCredentialCharacters(value))
  return isProbableHardLiteral(materialQuasis.join(''))
}

function scanTemplateExpression(text, start, state, scanDepth) {
  if (scanDepth > EXPRESSION_SCAN_MAX_DEPTH) {
    return { closed: false, credential: true, end: text.length }
  }
  let credential = false
  let escaped = false
  let staticValue = ''
  const quasis = []
  let offset = start + 1
  for (; offset < text.length; offset += 1) {
    if (!consumeExpressionBudget(state)) {
      return { closed: false, credential: true, end: text.length }
    }
    const character = text[offset]
    if (escaped) {
      staticValue += character
      escaped = false
      continue
    }
    if (character === '\\') {
      staticValue += character
      escaped = true
      continue
    }
    if (character === '`') {
      quasis.push(staticValue)
      credential ||= templateQuasisContainLongCredential(quasis)
      return { closed: true, credential, end: offset + 1 }
    }
    if (character === '$' && text[offset + 1] === '{') {
      quasis.push(staticValue)
      staticValue = ''
      const interpolation = scanCredentialExpression(text, offset + 2, state, scanDepth + 1, true)
      credential ||= interpolation.credential
      if (!interpolation.closed) return { closed: false, credential: true, end: text.length }
      offset = interpolation.end - 1
      continue
    }
    staticValue += character
  }
  return { closed: false, credential: true, end: text.length }
}

function scanCredentialExpression(text, start, state, scanDepth = 0, interpolation = false) {
  if (scanDepth > EXPRESSION_SCAN_MAX_DEPTH) {
    return { closed: false, credential: true, end: text.length }
  }
  let braceDepth = 0
  let credential = false
  let token = ''
  const flushToken = () => {
    if (isProbableCredentialValue(token)) credential = true
    token = ''
  }
  let offset = start
  for (; offset < text.length; offset += 1) {
    if (!consumeExpressionBudget(state)) {
      return { closed: false, credential: true, end: text.length }
    }
    const character = text[offset]
    if (interpolation && character === '}' && braceDepth === 0) {
      flushToken()
      return { closed: true, credential, end: offset + 1 }
    }
    if (character === '"' || character === "'") {
      flushToken()
      const literal = scanQuotedExpressionLiteral(text, offset, character, state)
      credential ||= literal.credential
      if (!literal.closed) return { closed: false, credential: true, end: text.length }
      offset = literal.end - 1
      continue
    }
    if (character === '`') {
      flushToken()
      const template = scanTemplateExpression(text, offset, state, scanDepth + 1)
      credential ||= template.credential
      if (!template.closed) return { closed: false, credential: true, end: text.length }
      offset = template.end - 1
      continue
    }
    if (text.startsWith('//', offset)) {
      flushToken()
      const lineBreak = text.indexOf('\n', offset + 2)
      if (lineBreak === -1) {
        return { closed: !interpolation, credential, end: text.length }
      }
      offset = lineBreak
      continue
    }
    if (text.startsWith('/*', offset)) {
      flushToken()
      const commentEnd = text.indexOf('*/', offset + 2)
      if (commentEnd === -1) return { closed: false, credential: true, end: text.length }
      offset = commentEnd + 1
      continue
    }
    if (character === '{') {
      flushToken()
      braceDepth += 1
      continue
    }
    if (character === '}') {
      flushToken()
      if (braceDepth > 0) braceDepth -= 1
      continue
    }
    if (/[\s|?&:+*/()!<>=,;\[\]\-]/u.test(character)) {
      flushToken()
      continue
    }
    token += character
  }
  flushToken()
  return { closed: !interpolation, credential, end: text.length }
}

function nextCodeStartsExpressionContinuation(text, start) {
  let offset = start
  while (offset < text.length) {
    if (/\s/u.test(text[offset])) {
      offset += 1
      continue
    }
    if (text.startsWith('//', offset)) {
      const lineBreak = text.indexOf('\n', offset + 2)
      if (lineBreak === -1) return false
      offset = lineBreak + 1
      continue
    }
    if (text.startsWith('/*', offset)) {
      const commentEnd = text.indexOf('*/', offset + 2)
      if (commentEnd === -1) return false
      offset = commentEnd + 2
      continue
    }
    return /^(?:\|\||\?\?|&&|\?|:|\.|\[)/u.test(text.slice(offset))
  }
  return false
}

function assignmentExpression(text, start) {
  let quote = null
  let escaped = false
  let depth = 0
  let needsOperand = true
  let offset = start
  let expression = ''
  for (; offset < text.length; offset += 1) {
    const character = text[offset]
    if (quote !== null) {
      expression += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) {
        quote = null
        needsOperand = false
      }
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      expression += character
      continue
    }
    if (character === '`') {
      const template = scanTemplateExpression(text, offset, { nodes: 0 }, 0)
      expression += text.slice(offset, template.end)
      offset = template.end - 1
      needsOperand = false
      continue
    }
    if (text.startsWith('//', offset)) {
      const lineBreak = text.indexOf('\n', offset + 2)
      expression += ' '
      if (lineBreak === -1) break
      offset = lineBreak - 1
      continue
    }
    if (text.startsWith('/*', offset)) {
      const commentEnd = text.indexOf('*/', offset + 2)
      expression += ' '
      if (commentEnd === -1) break
      offset = commentEnd + 1
      continue
    }
    if (depth === 0 && (character === '\n' || character === '\r')) {
      if (!needsOperand && !nextCodeStartsExpressionContinuation(text, offset + 1)) break
      expression += '\n'
      continue
    }
    if (character === '(' || character === '[' || character === '{') {
      depth += 1
      needsOperand = true
      expression += character
      continue
    }
    if (character === ')' || character === ']' || character === '}') {
      if (depth === 0) break
      depth -= 1
      needsOperand = false
      expression += character
      continue
    }
    if (depth === 0 && (character === ',' || character === ';')) {
      break
    }
    const twoCharacters = text.slice(offset, offset + 2)
    if (twoCharacters === '++' || twoCharacters === '--') {
      expression += twoCharacters
      needsOperand = false
      offset += 1
      continue
    }
    expression += character
    if (/\s/u.test(character)) continue
    needsOperand = /[?+:,\.\-+*/%&|^=!<>]/u.test(character)
  }
  return expression.trim()
}

function expressionContainsLongCredential(expression) {
  return scanCredentialExpression(expression, 0, { nodes: 0 }).credential
}

function isInsideLineQuotedLiteral(text, index) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1
  let quote = null
  let escaped = false
  for (let offset = lineStart; offset < index; offset += 1) {
    const character = text[offset]
    if (quote !== null) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = null
    } else if (character === '"' || character === "'" || character === '`') {
      quote = character
    }
  }
  return quote !== null
}

function hasAssignedLongCredential(text) {
  for (const [pattern, requireUnquotedStart] of [
    [QUOTED_ASSIGNMENT_START, false],
    [BARE_ASSIGNMENT_START, true],
  ]) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      const [, name] = match
      if (requireUnquotedStart && isInsideLineQuotedLiteral(text, match.index)) continue
      if (isSensitiveCredentialName(name)
        && expressionContainsLongCredential(assignmentExpression(text, match.index + match[0].length))) return true
    }
  }
  return false
}

function structuredJsonCredentialState(text) {
  let root
  try {
    root = JSON.parse(text)
  } catch {
    return 'not_json'
  }

  const stack = [{ value: root, depth: 0, sensitive: false }]
  let visited = 0
  while (stack.length > 0) {
    const { value, depth, sensitive } = stack.pop()
    visited += 1
    if (visited > CREDENTIAL_SCAN_MAX_NODES || depth > CREDENTIAL_SCAN_MAX_DEPTH) return 'scan_limit'
    if (sensitive && isProbableCredentialValue(value)) return 'credential'
    if (!value || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      for (const entry of value) stack.push({ value: entry, depth: depth + 1, sensitive })
      continue
    }
    for (const [name, entry] of Object.entries(value)) {
      const entrySensitive = sensitive || isSensitiveCredentialName(name)
      if (entrySensitive && isProbableCredentialValue(entry)) return 'credential'
      stack.push({ value: entry, depth: depth + 1, sensitive: entrySensitive })
    }
  }
  return 'clear'
}

export function probableSecretClasses(text) {
  const classes = SECRET_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
  const structuredState = structuredJsonCredentialState(text)
  if (hasAssignedLongCredential(text) || structuredState === 'credential') {
    classes.push('assigned_long_credential')
  }
  if (structuredState === 'scan_limit') classes.push('structured_credential_scan_limit')
  return [...new Set(classes)]
}

import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

import {
  assertContractReviewHistory,
  assertNoDisallowedTerminalControls,
  assertNoDisallowedSourceControls,
  assertNoDuplicateJsonObjectKeys,
  assertNoTrailingWhitespace,
  canonicalUtf8Bytes,
  inspectJpegDimensions,
  probableSecretClasses,
  readStableAbsoluteRegularFile,
  readStableRegularFile,
  runStableAbsoluteTextCommand,
  validateBrowserArtifactClosedShape,
  validateEvidenceClosedShape,
  validateGateArtifactClosedShape,
} from './multibroker-mb4-validation-lib.mjs'

const ROOT = process.cwd()
const BASELINE = '4f6bcc77d1843f1e05e26faf085c19c3e1f40f16'
const BRANCH = 'codex/multibroker-mb4-v57.61.0'
const CONTRACT_PATH = 'docs/architecture/EQUORA_v57.61.0_MULTI_BROKER_MB4_IMPLEMENTATION_CONTRACT.md'
const BROWSER_ARTIFACT_PATH = 'docs/gates/EQUORA_v57.61.0_MULTI_BROKER_MB4_BROWSER_ARTIFACT.json'
const EVIDENCE_PATH = 'docs/gates/EQUORA_v57.61.0_MULTI_BROKER_MB4_EVIDENCE.json'
const GATE_ARTIFACT_PATH = 'docs/gates/EQUORA_v57.61.0_MULTI_BROKER_MB4_GATE_ARTIFACT.json'
const MANIFEST_PATH = 'docs/gates/EQUORA_v57.61.0_MULTI_BROKER_MB4_MANIFEST.sha256'
const DELETED_PATH = 'components/broker-sync/mexc-connection-panel.tsx'
const NODE_DIRECTORY = path.dirname(process.execPath)
const PROGRAM_FILES = Object.entries(process.env).find(([name]) => name.toLowerCase() === 'programfiles')?.[1]
  ?? 'C:\\Program Files'
const GIT_CORE_PATH = process.platform === 'win32'
  ? path.join(PROGRAM_FILES, 'Git', 'mingw64', 'bin', 'git.exe')
  : '/usr/bin/git'
const GIT_CORE_DIRECTORY = path.dirname(GIT_CORE_PATH)
const GIT_SAFE_DIRECTORY = path.resolve(ROOT).replaceAll('\\', '/')
const GIT_EOL_CONFIG = process.platform === 'win32' ? 'core.autocrlf=true' : 'core.autocrlf=input'
const SYSTEM_ROOT = Object.entries(process.env).find(([name]) => name.toLowerCase() === 'systemroot')?.[1]
  ?? 'C:\\Windows'
const GIT_ENVIRONMENT = Object.freeze(process.platform === 'win32' ? {
  ComSpec: path.join(SYSTEM_ROOT, 'System32', 'cmd.exe'),
  GIT_CONFIG_GLOBAL: 'NUL',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_PAGER: 'cat',
  GIT_TERMINAL_PROMPT: '0',
  LANG: 'C',
  LC_ALL: 'C',
  PATH: [GIT_CORE_DIRECTORY, path.join(SYSTEM_ROOT, 'System32'), SYSTEM_ROOT].join(';'),
  PATHEXT: process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
  SystemRoot: SYSTEM_ROOT,
  TEMP: process.env.TEMP ?? path.join(SYSTEM_ROOT, 'Temp'),
  TMP: process.env.TMP ?? path.join(SYSTEM_ROOT, 'Temp'),
  windir: SYSTEM_ROOT,
} : {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_PAGER: 'cat',
  GIT_TERMINAL_PROMPT: '0',
  LANG: 'C',
  LC_ALL: 'C',
  PATH: `${GIT_CORE_DIRECTORY}:/usr/bin:/bin`,
  TMPDIR: process.env.TMPDIR ?? '/tmp',
})
const DOTENV_CANDIDATES = Object.freeze([
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.test',
  '.env.test.local',
])

const CANDIDATE_SCOPE = Object.freeze([
  'components/broker-sync/broker-connection-panel.tsx',
  'components/broker-sync/broker-sync-hub.tsx',
  DELETED_PATH,
  'components/broker-sync/providers/mexc-connection-setup.tsx',
  'components/layout/app-shell.tsx',
  CONTRACT_PATH,
  BROWSER_ARTIFACT_PATH,
  EVIDENCE_PATH,
  GATE_ARTIFACT_PATH,
  MANIFEST_PATH,
  'lib/server/broker-connection-view.ts',
  'lib/server/broker-sync-review-fixture.ts',
  'lib/server/broker-sync.ts',
  'lib/types/broker-sync.ts',
  'scripts/multibroker-mb4-validation-lib.mjs',
  'scripts/run-multibroker-mb4-gates.mjs',
  'scripts/validate-multibroker-mb4-manifest.mjs',
  'tests/application-contracts.test.ts',
  'tests/broker-connection-view.test.ts',
  'tests/multibroker-mb4-validator.test.mjs',
])

const MANIFEST_INPUTS = Object.freeze(CANDIDATE_SCOPE.filter((value) =>
  value !== MANIFEST_PATH && value !== DELETED_PATH,
))

const BROWSER_SOURCE_PATHS = Object.freeze([
  'components/broker-sync/broker-connection-panel.tsx',
  'components/broker-sync/broker-sync-hub.tsx',
  'components/broker-sync/providers/mexc-connection-setup.tsx',
  'components/layout/app-shell.tsx',
  'lib/server/broker-connection-view.ts',
  'lib/server/broker-sync-review-fixture.ts',
  'lib/server/broker-sync.ts',
  'lib/types/broker-sync.ts',
])

const GATE_INPUT_PATHS = Object.freeze([
  'components/broker-sync/broker-connection-panel.tsx',
  'components/broker-sync/broker-sync-hub.tsx',
  'components/broker-sync/providers/mexc-connection-setup.tsx',
  'components/layout/app-shell.tsx',
  CONTRACT_PATH,
  BROWSER_ARTIFACT_PATH,
  'lib/server/broker-connection-view.ts',
  'lib/server/broker-sync-review-fixture.ts',
  'lib/server/broker-sync.ts',
  'lib/types/broker-sync.ts',
  'scripts/multibroker-mb4-validation-lib.mjs',
  'scripts/run-multibroker-mb4-gates.mjs',
  'scripts/validate-multibroker-mb4-manifest.mjs',
  'tests/application-contracts.test.ts',
  'tests/broker-connection-view.test.ts',
  'tests/multibroker-mb4-validator.test.mjs',
])

const REQUIRED_GATES = Object.freeze([
  Object.freeze({
    attemptId: 'mb4-remediation14-targeted-001',
    gate: 'targeted',
    command: 'node <repo>/node_modules/vitest/dist/cli.js run tests/application-contracts.test.ts tests/broker-connection-view.test.ts tests/multibroker-mb4-validator.test.mjs tests/broker-runtime-control.test.ts tests/mexc-egress-boundary.test.ts tests/mexc-readonly-probe.test.ts --reporter=dot',
  }),
  Object.freeze({
    attemptId: 'mb4-remediation14-typecheck-001',
    gate: 'typecheck',
    command: 'node <repo>/node_modules/typescript/lib/tsc.js --noEmit',
  }),
  Object.freeze({
    attemptId: 'mb4-remediation14-full-001',
    gate: 'full_test',
    command: 'node <repo>/node_modules/vitest/dist/cli.js run --reporter=dot --maxWorkers=1',
  }),
  Object.freeze({
    attemptId: 'mb4-remediation14-release-001',
    gate: 'release_check',
    command: 'node <repo>/scripts/release-check.mjs',
  }),
  Object.freeze({
    attemptId: 'mb4-remediation14-build-001',
    gate: 'build',
    command: 'node <repo>/node_modules/next/dist/bin/next build',
  }),
])

const EXPECTED_GATE_ENTRYPOINTS = Object.freeze([
  Object.freeze({
    gates: ['targeted', 'full_test'],
    identity: '<repo>/node_modules/vitest/dist/cli.js',
    absolutePath: path.join(ROOT, 'node_modules', 'vitest', 'dist', 'cli.js'),
  }),
  Object.freeze({
    gates: ['typecheck'],
    identity: '<repo>/node_modules/typescript/lib/tsc.js',
    absolutePath: path.join(ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js'),
  }),
  Object.freeze({
    gates: ['release_check'],
    identity: '<repo>/scripts/release-check.mjs',
    absolutePath: path.join(ROOT, 'scripts', 'release-check.mjs'),
  }),
  Object.freeze({
    gates: ['build'],
    identity: '<repo>/node_modules/next/dist/bin/next',
    absolutePath: path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'),
  }),
])

const EXPECTED_EXTERNAL_TOOLCHAIN_TRUST_ANCHORS = Object.freeze([
  'Installed transitive node_modules implementation files are external local-machine trust anchors; package-lock.json metadata does not prove their installed bytes.',
  'Operating-system libraries loaded by Node and Git-Core are external local-machine trust anchors.',
  'Git helper files outside the bound Git-Core binary are not claimed; MB4 validator Git use is restricted to built-in rev-parse, diff and ls-files commands plus --version.',
])

const EXPECTED_CLAIMS = Object.freeze({
  scope: 'Local provider-neutral MB4 connection UI, client-safe connection projection and hash-bound regression evidence only.',
  built_provider_count: 1,
  built_provider_codes: ['mexc'],
  second_provider_built: false,
  dynamic_provider_loader_built: false,
  generic_ui_receives_credentials: false,
  generic_ui_builds_sendable_broker_requests: false,
  raw_provider_errors_cross_rsc_boundary: false,
  technical_read_attestation_permission_identity_coverage_separate: true,
  normal_ui_actions_unknown_provider_environment_status_display_only: true,
  legacy_last_sync_used_as_capture_evidence: false,
  capture_evidence_source: 'broker_capture_runs.sync_activation_id -> broker_sync_activations.connection_account_id -> broker_connection_accounts.connection_id; latest completed/partial completed_at across all activation chunks per connection',
  automatic_capture_added: false,
  automatic_import_added: false,
  local_review_fixture_production_enabled: false,
  visual_modernization_in_scope: false,
  local_gate_meaning: 'Local mechanics and independent review only; no staging, release, deployment, database or broker authorization.',
})

const EXPECTED_AUTHORITY = Object.freeze({
  runtime_mode: 'off',
  production_write_authorized: false,
  supabase_action_authorized: false,
  mexc_or_broker_request_authorized: false,
  credential_action_authorized: false,
  cron_action_authorized: false,
  capture_action_authorized: false,
  import_action_authorized: false,
  git_staging_authorized: false,
  git_commit_authorized: false,
  git_push_authorized: false,
  pull_request_authorized: false,
  merge_authorized: false,
  deployment_authorized: false,
  branch_deletion_authorized: false,
})

const EXPECTED_KNOWN_LIMITS = Object.freeze([
  'Only MEXC is built; provider neutrality is an architectural UI boundary, not evidence of a second working provider.',
  'Legacy permission flags provide bounded read observations and are not a global technical permission audit.',
  'A user read-only attestation is not provider-side proof of all account permissions.',
  'An observed completed or partial capture timestamp proves neither complete history nor import readiness.',
  'The existing MEXC server actions, runtime control, transports, credential store and database schema remain outside the MB4 implementation scope.',
  'Visual modernization in Equora black and gold remains a separate later track.',
  'The gate artifact binds Node, immediate JavaScript gate entrypoints, Git-Core and package-lock.json metadata; installed transitive node_modules bytes and operating-system libraries remain declared external local-machine trust anchors.',
  'The local Browser network boundary is based on the bound environment and reviewer-observed origins, not an immutable complete server-start and request-log transcript.',
  'The offline template secret scanner conservatively accumulates every static quasi containing letters or digits; benign alphanumeric labels can therefore trigger the local gate once the combined material reaches 24 characters, and this scanner is not semantic proof of secret absence.',
])

const EXPECTED_BROWSER_OBSERVATIONS = Object.freeze([
  'At 390x844 and scrollY=0 the existing stacked application navigation is the visible first viewport; the MB4 target heading is therefore documented separately at scrollY=1295 without calling that image a first viewport.',
  'The superseded v2 browser artifact did not bind NEXT_TELEMETRY_DISABLED=1, so its absolute no-external-action claim was not treated as proven.',
  'The local application issued POST /api/performance only to 127.0.0.1:3001; in development without Supabase variables the endpoint records only in process memory.',
  'Local Bicubik font requests returned 404, so the captured rendered measurements used the configured fallback typography.',
  'The Browser screenshot surface encoded 1268x713 pixels for the 1280x720 desktop setting and 378x818 pixels for the 390x844 mobile setting; viewport and JPEG dimensions are bound separately.',
])

const REVIEW_PENDING_GATES = Object.freeze([
  'Independent A3/A4/A5 read-only review on the exact 18-entry manifest snapshot.',
  'Separate authorization before git staging or commit.',
  'Separate authorization before push or pull-request creation.',
  'Separate authorization before Ready-for-Review, merge or deployment.',
  'Separate authorization before any Production, Supabase, MEXC/Broker, credential, Cron, Capture or Import action.',
])

const REVIEW_PASSED_GATES = Object.freeze(REVIEW_PENDING_GATES.slice(1))

function fail(message) {
  throw new Error(`MB4 manifest validation failed: ${message}`)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function sorted(values) {
  return [...values].sort()
}

function exactJson(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} mismatch\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`)
  }
}

function exactSet(actualValues, expectedValues, label) {
  exactJson(sorted(new Set(actualValues)), sorted(new Set(expectedValues)), label)
}

function git(...args) {
  return runStableAbsoluteTextCommand(GIT_CORE_PATH, [
    '-c',
    `safe.directory=${GIT_SAFE_DIRECTORY}`,
    '-c',
    GIT_EOL_CONFIG,
    ...args,
  ], {
    cwd: ROOT,
    env: GIT_ENVIRONMENT,
  }).trim()
}

function gitNames(...args) {
  const output = git(...args)
  return output ? output.split(/\r?\n/u).map((value) => value.replaceAll('\\', '/')) : []
}

function canonicalFile(relativePath) {
  return canonicalUtf8Bytes(readStableRegularFile(ROOT, relativePath), relativePath)
}

function textFile(relativePath) {
  return canonicalFile(relativePath).toString('utf8')
}

function parseClosedJson(relativePath) {
  const text = textFile(relativePath)
  assertNoDuplicateJsonObjectKeys(text, relativePath)
  try {
    return JSON.parse(text)
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`)
  }
}

function parseUtc(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    fail(`${label} must be an exact millisecond UTC timestamp`)
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) fail(`${label} is not a valid timestamp`)
  return parsed
}

function parseManifest() {
  const lines = textFile(MANIFEST_PATH).split('\n')
  if (lines.at(-1) !== '') fail('manifest must end with exactly one LF')
  lines.pop()
  if (lines.some((line) => line.length === 0)) fail('manifest contains an empty line')
  const entries = new Map()
  for (const line of lines) {
    const match = /^lf:([a-f0-9]{64})  ([1-9][0-9]*)  (.+)$/u.exec(line)
    if (!match) fail(`invalid manifest line: ${line}`)
    const [, digest, byteCount, relativePath] = match
    if (entries.has(relativePath)) fail(`duplicate manifest path: ${relativePath}`)
    entries.set(relativePath, { digest, byteCount: Number(byteCount) })
  }
  return entries
}

function validateGitScope() {
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== BRANCH) fail('unexpected branch')
  if (git('rev-parse', 'HEAD') !== BASELINE) fail('HEAD moved away from the approved baseline')
  if (git('rev-parse', 'origin/main') !== BASELINE) fail('local origin/main moved away from the approved baseline')
  if (gitNames('diff', '--cached', '--name-only').length !== 0) fail('index is not clean; staging is outside this gate')
  if (gitNames('ls-files', '--error-unmatch', DELETED_PATH).length !== 1) fail('deleted legacy path is not tracked at baseline')
  const liveDeletion = gitNames('diff', '--name-only', '--diff-filter=D')
  exactJson(liveDeletion, [DELETED_PATH], 'deleted path set')

  const changed = new Set([
    ...gitNames('diff', '--name-only'),
    ...gitNames('diff', '--cached', '--name-only'),
    ...gitNames('ls-files', '--others', '--exclude-standard'),
    ...gitNames('diff', '--name-only', `${BASELINE}..HEAD`),
  ])
  exactSet(changed, CANDIDATE_SCOPE, 'Git candidate scope')
}

function validateManifest(entries) {
  exactJson([...entries.keys()], MANIFEST_INPUTS, 'ordered manifest inputs')
  for (const relativePath of MANIFEST_INPUTS) {
    const bytes = canonicalFile(relativePath)
    const expected = entries.get(relativePath)
    if (sha256(bytes) !== expected.digest) fail(`manifest hash mismatch: ${relativePath}`)
    if (bytes.length !== expected.byteCount) fail(`manifest byte-count mismatch: ${relativePath}`)
    const text = bytes.toString('utf8')
    assertNoDisallowedSourceControls(text, relativePath)
    assertNoTrailingWhitespace(text, relativePath)
    const secretClasses = probableSecretClasses(text)
    if (secretClasses.length > 0) {
      fail(`probable secret material in ${relativePath}: ${secretClasses.join(', ')}`)
    }
  }
}

function validateBrowserArtifact(entries, artifact) {
  try {
    validateBrowserArtifactClosedShape(artifact)
  } catch (error) {
    fail(error.message)
  }
  if (artifact.schema_version !== 'equora_mb4_browser_artifact_v3') fail('unexpected browser artifact schema')
  parseUtc(artifact.generated_at_utc, 'browser artifact generated_at_utc')
  exactJson(artifact.source_snapshot.map(({ path }) => path), BROWSER_SOURCE_PATHS, 'browser source snapshot paths')
  for (const entry of artifact.source_snapshot) {
    const manifest = entries.get(entry.path)
    if (!manifest
      || entry.canonical_sha256 !== manifest.digest
      || entry.canonical_bytes !== manifest.byteCount) {
      fail(`browser source snapshot mismatch: ${entry.path}`)
    }
  }

  exactJson(artifact.environment, {
    url: 'http://127.0.0.1:3001/broker-sync',
    node_env: 'development',
    fixture_flag: 'local_only',
    runtime_mode: 'off',
    next_telemetry_disabled: '1',
    ci: '1',
    no_update_notifier: '1',
    supabase_values: 'built-in demo fallbacks; no Supabase variables set',
    supabase_environment_variable_names: [],
    browser_observed_request_origins: ['http://127.0.0.1:3001'],
    external_actions_performed: false,
    network_boundary: 'Next.js telemetry disabled before server start; browser and server observations used only http://127.0.0.1:3001, including an in-memory development-only /api/performance POST; no Production, Supabase, MEXC or broker action',
  }, 'browser environment')
  exactJson(artifact.procedure, {
    runner: 'Codex in-app Browser persistent local tab',
    replayability: 'manual bounded replay with the Browser viewport capability and the ordered steps below; byte-identical screenshot regeneration is not claimed',
    steps: [
      'Start Next.js development mode on 127.0.0.1:3001 with NEXT_TELEMETRY_DISABLED=1, CI=1, NO_UPDATE_NOTIFIER=1, EQUORA_MB4_REVIEW_FIXTURE=local_only, EQUORA_MEXC_RUNTIME_MODE=off and no Supabase variables.',
      'Open /broker-sync, wait for DOMContentLoaded, set 1280x720, scroll to x=0/y=0 and capture assertions, DOM, console and first-viewport JPEG.',
      'Focus the only provider button through the Browser locator, press Enter once and verify it remains selected; keyboard Tab traversal and a state transition are not claimed.',
      'Set 390x844, scroll to x=0/y=0 and capture the true mobile first viewport and first-viewport JPEG.',
      'Scroll the Broker verbinden heading fully into view, record the exact y offset and capture a separately labelled mobile target-section JPEG.',
      'Compute text contrast from rendered foreground alpha composited over effective ancestor backgrounds; require at least 4.5:1.',
    ],
    fixed_viewports: ['1280x720', '390x844'],
    scroll_rule: 'first_viewport screenshots require x=0/y=0; any scrolled target screenshot records its exact scroll offset and is not called a first viewport',
  }, 'browser replay procedure')
  exactJson(artifact.desktop_first_viewport, {
    viewport_width: 1280,
    viewport_height: 720,
    scroll_x: 0,
    scroll_y: 0,
    client_width: 1268,
    scroll_width: 1268,
    horizontal_overflow: false,
    meaningful_content_visible: true,
    framework_overlay_absent: true,
    connection_count: 3,
    target_heading_visible: true,
  }, 'browser desktop first viewport')
  exactJson(artifact.mobile_first_viewport, {
    viewport_width: 390,
    viewport_height: 844,
    scroll_x: 0,
    scroll_y: 0,
    client_width: 378,
    scroll_width: 378,
    horizontal_overflow: false,
    meaningful_content_visible: true,
    framework_overlay_absent: true,
    connection_count: 3,
    target_heading_visible: false,
  }, 'browser mobile first viewport')
  exactJson(artifact.mobile_target_viewport, {
    viewport_width: 390,
    viewport_height: 844,
    scroll_x: 0,
    scroll_y: 1295,
    client_width: 378,
    scroll_width: 378,
    horizontal_overflow: false,
    meaningful_content_visible: true,
    framework_overlay_absent: true,
    connection_count: 3,
    target_heading_visible: true,
  }, 'browser mobile target viewport')
  exactJson(artifact.assertions, {
    meaningful_content_visible: true,
    framework_overlay_absent: true,
    runtime_off_visible: true,
    runtime_status_separate_from_connector_readiness: true,
    credential_controls_disabled: true,
    provider_count: 1,
    connection_count: 3,
    separate_connection_states_visible: true,
    known_connection_action_button_count: 2,
    unknown_state_action_button_count: 0,
    unsupported_provider_action_button_count: 0,
    attestation_provider_rights_separated: true,
    non_color_status_text_visible: true,
    qualified_capture_claims_bounded: true,
    all_contrast_checks_passed: true,
  }, 'browser assertions')
  exactJson(artifact.interaction, {
    provider_button_before_aria_pressed: 'true',
    provider_button_after_enter_aria_pressed: 'true',
    provider_activation_behavior: 'single built provider remained selected; Enter was a verified no-op and no state transition is claimed',
    provider_button_focused_before_enter: true,
    provider_focus_method: 'Browser locator press focused the provider control before Enter; Tab traversal is not claimed because the Browser control surface did not advance focus.',
    provider_setup_region_remained_visible: true,
  }, 'browser interaction')
  exactJson(artifact.console, {
    application_origin_errors: [],
    application_origin_warnings: [],
    excluded_extension_or_prior_tab_event_count: 0,
  }, 'browser console')

  if (artifact.contrast_checks.length !== 5) fail('browser contrast check count mismatch')
  for (const check of artifact.contrast_checks) {
    if (typeof check.label !== 'string'
      || typeof check.text !== 'string'
      || !Number.isFinite(check.font_size_px)
      || !Number.isFinite(check.contrast_ratio)
      || check.minimum_ratio !== 4.5
      || check.contrast_ratio < check.minimum_ratio
      || check.pass !== true) {
      fail(`browser contrast evidence failed: ${check.label ?? 'unknown'}`)
    }
  }

  const expectedScreenshots = [
    ['desktop_first_viewport', 1280, 720, 0, 0, 1268, 713],
    ['mobile_first_viewport', 390, 844, 0, 0, 378, 818],
    ['mobile_target_viewport', 390, 844, 0, 1295, 378, 818],
  ]
  if (artifact.screenshots.length !== expectedScreenshots.length) fail('browser screenshot count mismatch')
  for (const [index, screenshot] of artifact.screenshots.entries()) {
    const [name, width, height, scrollX, scrollY, imageWidth, imageHeight] = expectedScreenshots[index]
    if (screenshot.name !== name
      || screenshot.viewport_width !== width
      || screenshot.viewport_height !== height
      || screenshot.scroll_x !== scrollX
      || screenshot.scroll_y !== scrollY
      || screenshot.image_format !== 'jpeg'
      || screenshot.image_width !== imageWidth
      || screenshot.image_height !== imageHeight
      || typeof screenshot.image_base64 !== 'string'
      || !/^[A-Za-z0-9+/]+={0,2}$/u.test(screenshot.image_base64)) {
      fail(`browser screenshot identity mismatch: ${name}`)
    }
    const imageBytes = Buffer.from(screenshot.image_base64, 'base64')
    let dimensions
    try {
      dimensions = inspectJpegDimensions(imageBytes, `browser screenshot ${name}`)
    } catch (error) {
      fail(error.message)
    }
    if (imageBytes.toString('base64') !== screenshot.image_base64
      || imageBytes.length !== screenshot.image_bytes
      || sha256(imageBytes) !== screenshot.image_sha256
      || dimensions.width !== imageWidth
      || dimensions.height !== imageHeight) {
      fail(`browser screenshot binding mismatch: ${name}`)
    }
  }

  if (typeof artifact.dom_snapshot !== 'string' || !artifact.dom_snapshot.endsWith('\n')) {
    fail('browser DOM snapshot must be a non-empty LF-terminated string')
  }
  const domBytes = Buffer.from(artifact.dom_snapshot.replace(/\r\n?/gu, '\n'), 'utf8')
  if (domBytes.length !== artifact.dom_snapshot_canonical_bytes
    || sha256(domBytes) !== artifact.dom_snapshot_canonical_sha256) {
    fail('browser DOM snapshot hash or byte count mismatch')
  }
  for (const requiredText of [
    'Runtime aus',
    'Nutzer bestätigt: Read-only-Key',
    'Provider-Schreibrechte',
    'Unbekannter MEXC-Zustand',
    'Nicht unterstützter Provider',
    'Capture-Daten beobachtet; keine Vollhistorie belegt',
    'Kein qualifizierter Lauf beobachtet',
  ]) {
    if (!artifact.dom_snapshot.includes(requiredText)) fail(`browser DOM snapshot misses ${requiredText}`)
  }
  if (artifact.dom_snapshot.includes('Noch kein Capturelauf')) {
    fail('browser DOM snapshot contains an absolute no-capture claim')
  }
  exactJson(artifact.known_observations, EXPECTED_BROWSER_OBSERVATIONS, 'browser known observations')
}

function validateGateArtifact(entries, artifact) {
  try {
    validateGateArtifactClosedShape(artifact)
  } catch (error) {
    fail(error.message)
  }
  if (artifact.schema_version !== 'equora_mb4_gate_artifact_v3') fail('unexpected gate artifact schema')
  const generatedAt = parseUtc(artifact.generated_at_utc, 'gate artifact generated_at_utc')
  exactJson(artifact.transcript_policy, {
    encoding: 'UTF-8 without BOM',
    raw_output_validation: 'stdout and stderr captured as bytes; invalid UTF-8 and UTF-8 BOM rejected before text canonicalization',
    line_endings: 'LF with exactly one terminal LF',
    terminal_controls: 'reject all C0/C1/CSI/OSC controls except TAB, LF and normalized CR',
    npm_notices_removed: false,
    workspace_path_replacement: '<repo>',
  }, 'gate transcript policy')

  const execution = artifact.execution_environment
  if (execution.platform !== process.platform
    || execution.arch !== process.arch
    || execution.node_version !== process.version) {
    fail('gate runtime identity does not match the validator runtime')
  }
  const nodeExecutableBytes = readStableAbsoluteRegularFile(process.execPath, 'Node executable')
  const gitCoreBytes = readStableAbsoluteRegularFile(GIT_CORE_PATH, 'Git-Core executable')
  const packageLockBytes = canonicalFile('package-lock.json')
  const gitVersion = runStableAbsoluteTextCommand(GIT_CORE_PATH, ['--version'], {
    cwd: ROOT,
    env: GIT_ENVIRONMENT,
  }).trim()
  if (execution.node_executable_sha256 !== sha256(nodeExecutableBytes)
    || execution.node_executable_bytes !== nodeExecutableBytes.length
    || execution.gate_invocation !== 'direct Node execution of the four recorded JavaScript entrypoints; npm launcher not used'
    || execution.git_version !== gitVersion
    || execution.git_core_identity !== (process.platform === 'win32' ? '<git-core-dir>/git.exe' : '<git-core-dir>/git')
    || execution.git_core_sha256 !== sha256(gitCoreBytes)
    || execution.git_core_bytes !== gitCoreBytes.length
    || execution.package_lock_sha256 !== sha256(packageLockBytes)
    || execution.package_lock_bytes !== packageLockBytes.length) {
    fail('gate selected-toolchain or lockfile binding mismatch')
  }
  exactJson(execution.gate_entrypoints, EXPECTED_GATE_ENTRYPOINTS.map(({ gates, identity, absolutePath }) => {
    const bytes = readStableAbsoluteRegularFile(absolutePath, identity)
    return { gates, identity, sha256: sha256(bytes), bytes: bytes.length }
  }), 'gate entrypoint bindings')
  exactJson(execution.git_builtin_commands, ['--version', 'diff', 'ls-files', 'rev-parse'], 'Git built-in command boundary')
  if (execution.toolchain_binding_scope !== 'Node executable, immediate JavaScript gate entrypoint files, Git-Core binary and package-lock.json resolution metadata are hash-bound; no transitive closure claim.') {
    fail('gate toolchain binding scope is overstated')
  }
  exactJson(
    execution.external_toolchain_trust_anchors,
    EXPECTED_EXTERNAL_TOOLCHAIN_TRUST_ANCHORS,
    'external toolchain trust anchors',
  )
  if (execution.environment_policy !== 'minimal_allowlist_v2_direct_node_entrypoints_reject_influence_variables') {
    fail('gate environment policy mismatch')
  }
  if (!Array.isArray(execution.inherited_variable_names)
    || JSON.stringify(execution.inherited_variable_names) !== JSON.stringify(sorted(execution.inherited_variable_names))
    || new Set(execution.inherited_variable_names).size !== execution.inherited_variable_names.length
    || !/^[a-f0-9]{64}$/u.test(execution.inherited_environment_sha256)
    || execution.rejected_influence_variables.length !== 0
    || execution.loaded_dotenv_files.length !== 0) {
    fail('gate inherited environment evidence is invalid')
  }
  const forced = execution.forced_variables
  exactSet(Object.keys(forced), process.platform === 'win32' ? [
    'CI',
    'ComSpec',
    'EQUORA_MEXC_RUNTIME_MODE',
    'LANG',
    'LC_ALL',
    'NEXT_TELEMETRY_DISABLED',
    'NO_COLOR',
    'NO_UPDATE_NOTIFIER',
    'PATH',
    'TERM',
    'TZ',
  ] : [
    'CI',
    'EQUORA_MEXC_RUNTIME_MODE',
    'LANG',
    'LC_ALL',
    'NEXT_TELEMETRY_DISABLED',
    'NO_COLOR',
    'NO_UPDATE_NOTIFIER',
    'PATH',
    'TERM',
    'TZ',
  ], 'gate forced environment keys')
  for (const [name, expected] of Object.entries({
    CI: '1',
    EQUORA_MEXC_RUNTIME_MODE: 'off',
    NEXT_TELEMETRY_DISABLED: '1',
    NO_COLOR: '1',
    NO_UPDATE_NOTIFIER: '1',
    TERM: 'dumb',
    TZ: 'UTC',
  })) {
    if (forced[name] !== expected) fail(`gate forced environment mismatch: ${name}`)
  }
  if (!String(forced.PATH).startsWith(process.platform === 'win32'
    ? '<node-dir>;<git-core-dir>'
    : '<node-dir>:<git-core-dir>')) {
    fail('gate PATH is not repository/toolchain bounded')
  }
  for (const dotenvPath of DOTENV_CANDIDATES) {
    try {
      readStableRegularFile(ROOT, dotenvPath)
      fail(`loadable dotenv file exists outside gate evidence: ${dotenvPath}`)
    } catch (error) {
      if (String(error.message).startsWith('MB4 manifest validation failed:')) throw error
      if (error.code !== 'ENOENT') throw error
    }
  }
  exactJson(artifact.input_snapshot.map(({ path }) => path), GATE_INPUT_PATHS, 'gate input snapshot paths')
  for (const entry of artifact.input_snapshot) {
    const manifest = entries.get(entry.path)
    if (!manifest
      || entry.canonical_sha256 !== manifest.digest
      || entry.canonical_bytes !== manifest.byteCount) {
      fail(`gate input snapshot mismatch: ${entry.path}`)
    }
  }

  if (artifact.attempts.length !== REQUIRED_GATES.length) fail('gate attempt count mismatch')
  for (const [index, attempt] of artifact.attempts.entries()) {
    const expected = REQUIRED_GATES[index]
    if (attempt.attempt_id !== expected.attemptId
      || attempt.gate !== expected.gate
      || attempt.command !== expected.command) {
      fail(`gate identity mismatch at index ${index}`)
    }
    if (attempt.command.includes('audit')) fail('npm audit is outside this local gate')
    const startedAt = parseUtc(attempt.started_at_utc, `${attempt.gate}.started_at_utc`)
    const finishedAt = parseUtc(attempt.finished_at_utc, `${attempt.gate}.finished_at_utc`)
    if (startedAt > finishedAt || finishedAt > generatedAt) fail(`invalid gate timestamp order: ${attempt.gate}`)
    if (attempt.exit_code !== 0 || attempt.result !== 'pass') fail(`gate is not passing: ${attempt.gate}`)
    if (typeof attempt.canonical_transcript !== 'string'
      || !attempt.canonical_transcript.endsWith('\n')
      || attempt.canonical_transcript.endsWith('\n\n')
      || attempt.canonical_transcript.includes(ROOT)
      || attempt.canonical_transcript.includes(ROOT.replaceAll('\\', '/'))) {
      fail(`gate transcript is not canonical: ${attempt.gate}`)
    }
    try {
      assertNoDisallowedTerminalControls(attempt.canonical_transcript, `${attempt.gate} transcript`)
    } catch (error) {
      fail(error.message)
    }
    const transcriptBytes = Buffer.from(attempt.canonical_transcript, 'utf8')
    if (transcriptBytes.length !== attempt.transcript_canonical_bytes
      || sha256(transcriptBytes) !== attempt.transcript_canonical_sha256) {
      fail(`gate transcript binding mismatch: ${attempt.gate}`)
    }

    if (attempt.gate === 'targeted' || attempt.gate === 'full_test') {
      const counts = attempt.result_counts
      exactSet(Object.keys(counts), ['test_files_passed', 'test_files_total', 'tests_passed', 'tests_total'], `${attempt.gate} result-count keys`)
      if (!Number.isInteger(counts.test_files_passed)
        || !Number.isInteger(counts.tests_passed)
        || counts.test_files_passed <= 0
        || counts.tests_passed <= 0
        || counts.test_files_passed !== counts.test_files_total
        || counts.tests_passed !== counts.tests_total
        || !attempt.canonical_transcript.includes('Test Files')
        || !attempt.canonical_transcript.includes('Tests')) {
        fail(`invalid Vitest result counts: ${attempt.gate}`)
      }
    } else if (attempt.gate === 'build') {
      exactSet(Object.keys(attempt.result_counts), [
        'static_pages_passed',
        'static_pages_total',
        'broker_sync_route_size',
        'broker_sync_first_load_js',
      ], 'build result-count keys')
      if (attempt.result_counts.static_pages_passed !== attempt.result_counts.static_pages_total
        || attempt.result_counts.static_pages_total <= 0
        || !attempt.canonical_transcript.includes('Compiled successfully')
        || !attempt.canonical_transcript.includes('/broker-sync')) {
        fail('invalid build result evidence')
      }
    } else {
      exactJson(attempt.result_counts, {}, `${attempt.gate} result counts`)
    }
  }
}

function validateEvidence(entries, evidence, browserArtifact, gateArtifact) {
  try {
    validateEvidenceClosedShape(evidence)
  } catch (error) {
    fail(error.message)
  }
  if (evidence.schema_version !== 'equora_mb4_evidence_v15' || evidence.phase !== 'MB4') {
    fail('unexpected Evidence identity')
  }
  const evidenceGeneratedAt = parseUtc(evidence.generated_at_utc, 'evidence generated_at_utc')
  const browserGeneratedAt = parseUtc(browserArtifact.generated_at_utc, 'bound browser generated_at_utc')
  const gateGeneratedAt = parseUtc(gateArtifact.generated_at_utc, 'bound gate generated_at_utc')
  if (browserGeneratedAt > gateGeneratedAt || gateGeneratedAt > evidenceGeneratedAt) {
    fail('artifact generation chronology must be browser <= gate <= Evidence')
  }
  if (evidenceGeneratedAt > Date.now() + 60_000) fail('Evidence generation timestamp is implausibly in the future')
  exactJson(evidence.baseline, {
    head: BASELINE,
    origin_main: BASELINE,
    branch: BRANCH,
    fresh_branch_from_origin_main: true,
    old_squash_merged_branch_reused: false,
  }, 'Evidence baseline')
  exactJson(evidence.claims, EXPECTED_CLAIMS, 'Evidence claims')
  exactJson(evidence.authority_boundaries, EXPECTED_AUTHORITY, 'Evidence authority boundaries')
  exactJson(evidence.candidate_scope, CANDIDATE_SCOPE, 'Evidence candidate scope')
  exactJson(evidence.manifest_contract, {
    path: MANIFEST_PATH,
    canonicalization: 'Strict UTF-8 without BOM; CRLF and CR normalized to LF before SHA-256 and byte-count calculation; stable regular files only; symlinks and junctions rejected.',
    entry_count: MANIFEST_INPUTS.length,
    excluded_paths: [MANIFEST_PATH, DELETED_PATH],
  }, 'Evidence manifest contract')

  const browserBytes = canonicalFile(BROWSER_ARTIFACT_PATH)
  exactJson(evidence.browser_qa, {
    status: 'pass_with_telemetry_disabled_bound_screenshots_and_mobile_shell_observation',
    artifact_path: BROWSER_ARTIFACT_PATH,
    artifact_schema: browserArtifact.schema_version,
    artifact_canonical_sha256: sha256(browserBytes),
    artifact_canonical_bytes: browserBytes.length,
  }, 'Evidence browser binding')
  const gateBytes = canonicalFile(GATE_ARTIFACT_PATH)
  exactJson(evidence.gate_evidence, {
    status: 'all_five_local_gates_passed_with_bound_entrypoints_and_declared_external_toolchain_trust',
    artifact_path: GATE_ARTIFACT_PATH,
    artifact_schema: gateArtifact.schema_version,
    artifact_canonical_sha256: sha256(gateBytes),
    artifact_canonical_bytes: gateBytes.length,
    attempt_count: REQUIRED_GATES.length,
  }, 'Evidence gate binding')
  exactJson(evidence.local_audit, {
    status: 'not_run_no_external_advisory_call',
    reason: 'No concrete approval in this block to transmit dependency metadata to the external npm Advisory API.',
  }, 'Evidence local audit')
  exactJson(evidence.known_limits, EXPECTED_KNOWN_LIMITS, 'Evidence known limits')

  exactJson(evidence.independent_review.required_reviewers, ['A3', 'A4', 'A5'], 'required reviewers')
  if (evidence.independent_review.initial_snapshot_result !== 'no_pass_with_open_p2_findings') {
    fail('initial NO-PASS review history missing')
  }
  exactJson(evidence.independent_review.initial_review_ids, ['A3', 'A4', 'A5'], 'initial review ids')
  if (evidence.independent_review.prior_remediation_snapshot_result !== 'no_pass_with_four_open_p2_findings'
    || evidence.independent_review.prior_remediation_manifest_sha256 !== '0fc0d3dd2889c3b03e943d5fb3a9a6271aaacdb68d2a12fad579fff3d1e85578') {
    fail('prior remediation NO-PASS review history missing')
  }
  exactJson(evidence.independent_review.prior_remediation_review_ids, ['A3', 'A4', 'A5'], 'prior remediation review ids')
  if (evidence.independent_review.latest_no_pass_snapshot_result !== 'no_pass_with_two_open_p2_findings'
    || evidence.independent_review.latest_no_pass_manifest_sha256 !== '4cd3811d960dff8fb5b4fefa6e3dd8d2a7d01270eeaa3be62059f8c41e074593') {
    fail('latest A4 NO-PASS review history missing')
  }
  exactJson(evidence.independent_review.latest_no_pass_review_ids, ['A3:pass', 'A4:no-pass', 'A5:pass'], 'latest NO-PASS review ids')
  if (evidence.independent_review.fourth_remediation_snapshot_result !== 'no_pass_with_one_open_p2_finding'
    || evidence.independent_review.fourth_remediation_manifest_sha256 !== '8de29258c85a058cccd22f5f0d097070f14e0d534739c8ea3e1ad63de453975a') {
    fail('fourth remediation A4 NO-PASS review history missing')
  }
  exactJson(evidence.independent_review.fourth_remediation_review_ids, ['A3:pass', 'A4:no-pass', 'A5:pass'], 'fourth remediation review ids')
  if (evidence.independent_review.fifth_remediation_snapshot_result !== 'no_pass_with_two_open_p2_findings'
    || evidence.independent_review.fifth_remediation_manifest_sha256 !== '2a6d53989f4baf97b648793c66d2c70379d0fdc6e92638c1ae1b2ee82b300a67') {
    fail('fifth remediation A3/A4 NO-PASS review history missing')
  }
  exactJson(evidence.independent_review.fifth_remediation_review_ids, ['A3:no-pass', 'A4:no-pass', 'A5:pass'], 'fifth remediation review ids')
  if (evidence.independent_review.sixth_remediation_snapshot_result !== 'no_pass_with_one_open_p2_finding'
    || evidence.independent_review.sixth_remediation_manifest_sha256 !== 'f469c24da5aabbe40d184189781a1cae9d5e9ecb3b9d9c2a4e23b1753b731fdf') {
    fail('sixth remediation A4 NO-PASS review history missing')
  }
  exactJson(evidence.independent_review.sixth_remediation_review_ids, ['A3:pass', 'A4:no-pass', 'A5:pass'], 'sixth remediation review ids')
  if (evidence.independent_review.seventh_remediation_snapshot_result !== 'no_pass_with_one_open_p2_finding'
    || evidence.independent_review.seventh_remediation_manifest_sha256 !== '25b1107ba0614e6ce658a17a9c1be297896876b656a8b327d0ec9199393e883d') {
    fail('seventh remediation A4 NO-PASS review history missing')
  }
  exactJson(evidence.independent_review.seventh_remediation_review_ids, ['A3:pass', 'A4:no-pass', 'A5:pass'], 'seventh remediation review ids')
  if (evidence.independent_review.eighth_remediation_snapshot_result !== 'no_pass_with_two_open_p2_findings'
    || evidence.independent_review.eighth_remediation_manifest_sha256 !== 'a9f015686df07a893b55096ed1ec277802fecfc2d4dd9a58c3ca5011721dd451') {
    fail('eighth remediation A4 NO-PASS review history missing')
  }
  exactJson(evidence.independent_review.eighth_remediation_review_ids, ['A3:pass', 'A4:no-pass', 'A5:pass'], 'eighth remediation review ids')
  if (evidence.independent_review.ninth_remediation_snapshot_result !== 'no_pass_with_two_open_p2_findings'
    || evidence.independent_review.ninth_remediation_manifest_sha256 !== 'ccb022ac20b4714bc0d3b2296864bfe2da7dc0d4e8e2094de62374cf2e6dfe2b') {
    fail('ninth remediation A3/A4 NO-PASS review history missing')
  }
  exactJson(evidence.independent_review.ninth_remediation_review_ids, ['A3:no-pass', 'A4:no-pass', 'A5:pass'], 'ninth remediation review ids')
  if (evidence.independent_review.tenth_remediation_snapshot_result !== 'no_pass_with_one_open_p2_finding'
    || evidence.independent_review.tenth_remediation_manifest_sha256 !== 'b43e3d172fb47ed55b806ffe84678ff7017adcfc8caf5b6ca495d7b090025b66') {
    fail('tenth remediation A3/A4 NO-PASS review history missing')
  }
  exactJson(evidence.independent_review.tenth_remediation_review_ids, ['A3:no-pass', 'A4:no-pass', 'A5:pass'], 'tenth remediation review ids')
  if (evidence.independent_review.eleventh_remediation_snapshot_result !== 'no_pass_with_one_open_p2_finding'
    || evidence.independent_review.eleventh_remediation_manifest_sha256 !== 'b11c716c1003af1640264dbc357e1008b0f3a66656fc5861255ad25a0dcb653f') {
    fail('eleventh remediation A4 NO-PASS review history missing')
  }
  exactJson(evidence.independent_review.eleventh_remediation_review_ids, ['A3:pass', 'A4:no-pass', 'A5:pass'], 'eleventh remediation review ids')
  if (evidence.independent_review.twelfth_remediation_snapshot_result !== 'no_pass_with_one_open_p2_finding'
    || evidence.independent_review.twelfth_remediation_manifest_sha256 !== '7858366a1fd394103f6cbd5662e4097cc1d0f878ccc27db3ad38c7b1b103460d') {
    fail('twelfth remediation A3 NO-PASS review history missing')
  }
  exactJson(evidence.independent_review.twelfth_remediation_review_ids, ['A3:no-pass', 'A4:pass', 'A5:pass'], 'twelfth remediation review ids')
  assertContractReviewHistory(textFile(CONTRACT_PATH), evidence.independent_review)
  if (evidence.independent_review.snapshot_rule !== 'All remediation reviewers must use the same eighteen manifest input hashes plus the explicit deleted path.'
    || evidence.independent_review.pass_condition !== 'All three independent reviews complete on the same snapshot with no open P0, P1 or P2 findings.') {
    fail('independent review contract mismatch')
  }

  exactJson(evidence.remediation_history, [
    {
      remediation_id: 'mb4-remediation-2026-08-23-01',
      source_findings: [
        'capture_provenance',
        'gate_transcript_binding',
        'browser_evidence',
        'security_claim_separation',
        'stable_strict_utf8_validation',
        'closed_evidence_schema',
        'offline_secret_detection',
        'unknown_state_actions',
        'required_readonly_attestation',
        'scoped_logging_claim',
      ],
      status: 'local_remediation_and_five_main_gates_passed',
      claim_boundary: 'No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
    {
      remediation_id: 'mb4-remediation-2026-08-23-02',
      source_findings: [
        'immutable_capture_provenance',
        'per_connection_history_query',
        'normal_ui_claim_boundary',
        'extended_offline_secret_detection',
        'execution_environment_and_toolchain_binding',
        'runtime_status_separation',
        'reproducible_bound_browser_evidence',
        'small_text_contrast',
        'terminal_control_rejection',
        'single_provider_noop_claim',
      ],
      status: 'local_followup_remediation_and_five_main_gates_passed',
      claim_boundary: 'No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
    {
      remediation_id: 'mb4-remediation-2026-08-23-03',
      source_findings: [
        'historical_relation_counted_keyset_pagination',
        'capture_query_concurrency_bound',
        'git_single_trust_root',
        'next_dev_telemetry_boundary',
        'evidence_generation_chronology',
        'jpeg_structure_and_dimensions',
        'bounded_browser_replay_claim',
        'mobile_shell_debt_retained',
        'workspace_scoped_git_safe_directory',
        'shared_canonical_hash_generation',
        'separate_viewport_and_jpeg_dimensions',
        'local_diagnostic_and_font_fallback_observations',
        'dom_snapshot_post_serialization_binding',
        'static_contract_token_rebound_to_concurrency_shape',
        'minimal_git_eol_policy',
      ],
      status: 'local_third_remediation_and_five_main_gates_passed',
      claim_boundary: 'No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
    {
      remediation_id: 'mb4-remediation-2026-08-23-04',
      source_findings: [
        'structured_project_specific_offline_secret_detection',
        'direct_node_gate_entrypoints_without_npm_launcher',
        'git_core_binary_identity',
        'declared_external_toolchain_trust_anchors',
        'raw_process_output_strict_utf8_and_bom_rejection',
        'latest_no_pass_review_history',
      ],
      status: 'local_fourth_remediation_and_five_main_gates_passed',
      claim_boundary: 'Immediate entrypoints and Git-Core are bound; transitive node_modules and operating-system libraries are declared external trust anchors. No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
    {
      remediation_id: 'mb4-remediation-2026-08-23-05',
      source_findings: [
        'sensitive_json_container_context_inheritance',
        'hardcoded_assignment_fallback_detection',
        'full_rhs_reference_exception_boundary',
        'fourth_remediation_no_pass_review_history',
      ],
      status: 'local_fifth_remediation_and_five_main_gates_passed',
      claim_boundary: 'Sensitive JSON container descendants and hardcoded RHS fallbacks are scanned fail-closed. No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
    {
      remediation_id: 'mb4-remediation-2026-08-23-06',
      source_findings: [
        'contract_evidence_review_history_coherence',
        'multiline_rhs_continuation_detection',
        'compound_secret_assignment_detection',
        'fifth_remediation_no_pass_review_history',
      ],
      status: 'local_sixth_remediation_and_five_main_gates_passed',
      claim_boundary: 'Append-only review history is contract-bound to Evidence; multiline and compound hardcoded secret fallbacks are scanned fail-closed. No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
    {
      remediation_id: 'mb4-remediation-2026-08-24-07',
      source_findings: [
        'multiline_block_comment_rhs_lexing',
        'comment_content_false_positive_exclusion',
        'comment_aware_operator_state_preservation',
        'sixth_remediation_no_pass_review_history',
      ],
      status: 'local_seventh_remediation_and_five_main_gates_passed',
      claim_boundary: 'The bounded RHS lexer preserves operator and nesting state across line and block comments while excluding comment content from secret values. No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
    {
      remediation_id: 'mb4-remediation-2026-08-24-08',
      source_findings: [
        'template_quasi_interpolation_lexing',
        'multiple_runtime_interpolation_false_positive',
        'nested_template_resource_bounding',
        'seventh_remediation_no_pass_review_history',
      ],
      status: 'local_eighth_remediation_and_five_main_gates_passed',
      claim_boundary: 'Template static quasis and recursively bounded interpolations are scanned separately so exclusively runtime-referential interpolations remain benign while hard static material and fallbacks fail closed. No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
    {
      remediation_id: 'mb4-remediation-2026-08-24-09',
      source_findings: [
        'template_quasi_boundary_semantics',
        'formatted_hard_template_literal_false_negative',
        'separator_only_template_false_positive',
        'expression_budget_boundary_regressions',
        'eighth_remediation_no_pass_review_history',
      ],
      status: 'local_ninth_remediation_and_five_main_gates_passed',
      claim_boundary: 'Template quasi boundaries are preserved: punctuation-only and short textual separators are not accumulated, formatted hard quasis use the full candidate, and shorter credential-bearing fragments can be combined within the resource budget. No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
    {
      remediation_id: 'mb4-remediation-2026-08-24-10',
      source_findings: [
        'deterministic_template_static_material_policy',
        'alphabetic_split_hard_literal_detection',
        'alphanumeric_label_conservative_fail_closed_policy',
        'template_scanner_claim_narrowing',
        'ninth_remediation_no_pass_review_history',
      ],
      status: 'local_tenth_remediation_and_five_main_gates_passed',
      claim_boundary: 'Only punctuation-only template quasis are excluded as separators; every static quasi containing letters or digits is accumulated verbatim and checked at the 24-character threshold. Benign alphanumeric labels may therefore fail the local gate, and the scanner is not semantic proof of secret absence. No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
    {
      remediation_id: 'mb4-remediation-2026-08-24-11',
      source_findings: [
        'template_quasi_verbatim_whitespace_preservation',
        'string_template_whitespace_boundary_consistency',
        'whitespace_and_punctuation_only_separator_regressions',
        'tenth_remediation_no_pass_review_history',
      ],
      status: 'local_eleventh_remediation_and_five_main_gates_passed',
      claim_boundary: 'Static template quasis containing letters or digits retain their original internal boundary whitespace before the combined candidate is outer-trimmed and checked at the 24-character threshold; whitespace-only and punctuation-only quasis remain excluded. Benign alphanumeric labels may still fail conservatively, and the scanner is not semantic proof of secret absence. No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
    {
      remediation_id: 'mb4-remediation-2026-08-24-12',
      source_findings: [
        'untracked_candidate_diff_check_gap',
        'staged_contract_trailing_whitespace',
        'manifest_input_trailing_whitespace_validation',
        'pre_commit_staging_reverted_without_commit',
      ],
      status: 'local_twelfth_remediation_and_five_main_gates_passed',
      claim_boundary: 'Every manifest input is checked directly for trailing spaces and tabs, including untracked candidate files that Git diff --check does not inspect before staging. The original staged preflight was reverted without commit. No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
    {
      remediation_id: 'mb4-remediation-2026-08-24-13',
      source_findings: [
        'source_control_trailing_whitespace_bypass',
        'alternate_unicode_line_separator_bypass',
        'embedded_bom_and_bidi_control_rejection',
        'eleventh_remediation_no_pass_review_history',
      ],
      status: 'local_thirteenth_remediation_and_five_main_gates_passed',
      claim_boundary: 'Every manifest input rejects Unicode control and format characters plus non-ASCII line, paragraph and space separators before trailing-whitespace and secret scanning; only ordinary SPACE, TAB and LF remain allowed from those categories. No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
    {
      remediation_id: 'mb4-remediation-2026-08-24-14',
      source_findings: [
        'post_canonicalization_source_control_claim_boundary',
        'crlf_and_bare_cr_normalization_claim',
        'twelfth_remediation_no_pass_review_history',
      ],
      status: 'local_fourteenth_remediation_and_five_main_gates_passed',
      claim_boundary: 'After the declared CRLF and bare-CR to LF canonicalization, every manifest input rejects all remaining Unicode Cc, Cf, Zl and Zp characters plus non-ASCII Zs before trailing-whitespace and secret scanning; ordinary SPACE, TAB and LF remain allowed. No external, Production, Supabase, MEXC/Broker, credential, Cron, Capture, Import or Git write authority.',
    },
  ], 'remediation history')

  const completed = evidence.independent_review.remediation_reviews_completed
  const reviewPass = JSON.stringify(completed) === JSON.stringify(['A3:pass', 'A4:pass', 'A5:pass'])
  const reviewPending = Array.isArray(completed) && completed.length === 0
  if (!reviewPass && !reviewPending) fail('invalid remediation review state')
  if (reviewPending) {
    if (evidence.phase_status !== 'local_final_gates_passed_independent_review_pending'
      || evidence.mb4_gate !== 'not_yet_passed') fail('pending review state claim mismatch')
    exactJson(evidence.hard_gates_remaining, REVIEW_PENDING_GATES, 'pending hard gates')
  } else {
    if (evidence.phase_status !== 'local_review_gates_passed'
      || evidence.mb4_gate !== 'passed') fail('passed review state claim mismatch')
    exactJson(evidence.hard_gates_remaining, REVIEW_PASSED_GATES, 'passed hard gates')
  }

  for (const referencedPath of [BROWSER_ARTIFACT_PATH, GATE_ARTIFACT_PATH, EVIDENCE_PATH]) {
    if (!entries.has(referencedPath)) fail(`Evidence reference is not manifest-bound: ${referencedPath}`)
  }
}

function validateStaticContracts() {
  const panel = textFile('components/broker-sync/broker-connection-panel.tsx')
  const hub = textFile('components/broker-sync/broker-sync-hub.tsx')
  const setup = textFile('components/broker-sync/providers/mexc-connection-setup.tsx')
  const shell = textFile('components/layout/app-shell.tsx')
  const view = textFile('lib/server/broker-connection-view.ts')
  const fixture = textFile('lib/server/broker-sync-review-fixture.ts')
  const server = textFile('lib/server/broker-sync.ts')
  const types = textFile('lib/types/broker-sync.ts')
  const runner = textFile('scripts/run-multibroker-mb4-gates.mjs')
  const contract = textFile(CONTRACT_PATH)

  const requiredPairs = [
    [panel, 'canShowBrokerConnectionActions(connection)'],
    [hub, 'Provider-Schreibrechte'],
    [hub, 'nicht vollständig auditiert'],
    [setup, 'type="checkbox"'],
    [setup, 'required'],
    [shell, 'grid min-w-0 gap-5'],
    [shell, 'aside className="min-w-0'],
    [view, 'latestCaptureByConnection'],
    [view, 'connectionIdByActivation.get(run.sync_activation_id)'],
    [view, "run.status !== 'completed' && run.status !== 'partial'"],
    [fixture, "nodeEnv !== 'development'"],
    [fixture, 'fixtureFlag !== LOCAL_REVIEW_FLAG'],
    [fixture, "const LOCAL_REVIEW_FLAG = 'local_only'"],
    [server, 'getLocalMb4ReviewSnapshot'],
    [server, 'const historicalAccountById = new Map(accountRows.map((row) => [row.id, row]))'],
    [server, 'const activationIdsByConnection = new Map<string, string[]>()'],
    [server, '.in(\'sync_activation_id\', activationIdChunk)'],
    [server, ': await mapWithConcurrency('],
    [server, 'CAPTURE_EVIDENCE_QUERY_CONCURRENCY'],
    [server, '.limit(1),'],
    [server, 'runtimeEnabled'],
    [types, "historyCoverage: 'capture_observed' | 'not_observed' | 'unavailable'"],
    [types, 'sync_activation_id: string'],
    [types, "connection.providerCode === 'mexc'"],
    [types, "connection.environment === 'live'"],
    [types, 'MEXC_CONNECTION_ACTION_STATUSES.has(connection.status)'],
    [runner, 'const environment = {}'],
    [runner, "EQUORA_MEXC_RUNTIME_MODE: 'off'"],
    [runner, 'GIT_CORE_PATH'],
    [runner, "entrypointIdentity: '<repo>/node_modules/vitest/dist/cli.js'"],
    [runner, 'canonicalUtf8Bytes(stdoutBytes'],
    [runner, 'assertNoGateInfluenceVariables(process.env)'],
    [textFile('scripts/validate-multibroker-mb4-manifest.mjs'), 'runStableAbsoluteTextCommand(GIT_CORE_PATH'],
    [textFile('scripts/validate-multibroker-mb4-manifest.mjs'), 'assertNoTrailingWhitespace(text, relativePath)'],
    [textFile('scripts/validate-multibroker-mb4-manifest.mjs'), 'assertNoDisallowedSourceControls(text, relativePath)'],
    [textFile('scripts/validate-multibroker-mb4-manifest.mjs'), '`safe.directory=${GIT_SAFE_DIRECTORY}`'],
    [textFile('scripts/validate-multibroker-mb4-manifest.mjs'), "'core.autocrlf=true'"],
    [contract, 'Der MB4-Scope umfasst genau diese 20 Pfade'],
    [contract, 'broker_connections.last_sync_at'],
  ]
  for (const [source, token] of requiredPairs) {
    if (!source.includes(token)) fail(`static contract token missing: ${token}`)
  }
  if (runner.includes('EQUORA_MB4_REVIEW_FIXTURE')) {
    fail('gate runner must not inherit or force the local review fixture')
  }
  if (view.includes('row.last_sync_at')) fail('legacy last_sync_at still feeds the client projection')
  if (/console\.(?:log|info|warn|error)/u.test(setup)) fail('credential component contains a console sink')
  if (fixture.includes('credential_reference') || fixture.includes('apiKey') || fixture.includes('secretKey')) {
    fail('local review fixture contains credential-shaped fields')
  }
}

validateGitScope()
const manifest = parseManifest()
validateManifest(manifest)
const browserArtifact = parseClosedJson(BROWSER_ARTIFACT_PATH)
const gateArtifact = parseClosedJson(GATE_ARTIFACT_PATH)
const evidence = parseClosedJson(EVIDENCE_PATH)
validateBrowserArtifact(manifest, browserArtifact)
validateGateArtifact(manifest, gateArtifact)
validateEvidence(manifest, evidence, browserArtifact, gateArtifact)
validateStaticContracts()
git('diff', '--check')

process.stdout.write(
  `MB4 manifest validation passed: ${MANIFEST_INPUTS.length}/${MANIFEST_INPUTS.length} canonical inputs, `
  + `${REQUIRED_GATES.length}/${REQUIRED_GATES.length} transcript-bound gates, browser artifact bound, `
  + 'closed schemas, stable regular files, strict raw-output UTF-8, structured offline secret classes, runtime off, '
  + 'Git-Core-reported scope under declared external toolchain trust, index clean.\n',
)

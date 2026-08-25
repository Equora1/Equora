import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import {
  assertNoDisallowedTerminalControls,
  assertNoGateInfluenceVariables,
  canonicalUtf8Bytes,
  readStableAbsoluteRegularFile,
  readStableRegularFile,
  runStableAbsoluteTextCommand,
} from './multibroker-mb4-validation-lib.mjs'

const ROOT = process.cwd()
const NODE_DIRECTORY = path.dirname(process.execPath)
const GIT_CORE_PATH = process.platform === 'win32'
  ? path.join(environmentValue(process.env, 'ProgramFiles') ?? 'C:\\Program Files', 'Git', 'mingw64', 'bin', 'git.exe')
  : '/usr/bin/git'
const GIT_CORE_DIRECTORY = path.dirname(GIT_CORE_PATH)
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
const INHERITED_ENV_ALLOWLIST = Object.freeze(process.platform === 'win32'
  ? [
      'APPDATA',
      'HOMEDRIVE',
      'HOMEPATH',
      'LOCALAPPDATA',
      'NUMBER_OF_PROCESSORS',
      'OS',
      'PATHEXT',
      'PROCESSOR_ARCHITECTURE',
      'ProgramData',
      'SystemRoot',
      'TEMP',
      'TMP',
      'USERPROFILE',
      'windir',
    ]
  : ['TMPDIR'])
const INPUT_SNAPSHOT_PATHS = Object.freeze([
  'components/broker-sync/broker-connection-panel.tsx',
  'components/broker-sync/broker-sync-hub.tsx',
  'components/broker-sync/providers/mexc-connection-setup.tsx',
  'components/layout/app-shell.tsx',
  'docs/architecture/EQUORA_v57.61.0_MULTI_BROKER_MB4_IMPLEMENTATION_CONTRACT.md',
  'docs/gates/EQUORA_v57.61.0_MULTI_BROKER_MB4_BROWSER_ARTIFACT.json',
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

const GATES = Object.freeze([
  Object.freeze({
    attemptId: 'mb4-remediation14-targeted-001',
    gate: 'targeted',
    command: 'node <repo>/node_modules/vitest/dist/cli.js run tests/application-contracts.test.ts tests/broker-connection-view.test.ts tests/multibroker-mb4-validator.test.mjs tests/broker-runtime-control.test.ts tests/mexc-egress-boundary.test.ts tests/mexc-readonly-probe.test.ts --reporter=dot',
    entrypointPath: path.join(ROOT, 'node_modules', 'vitest', 'dist', 'cli.js'),
    entrypointIdentity: '<repo>/node_modules/vitest/dist/cli.js',
    args: ['run', 'tests/application-contracts.test.ts', 'tests/broker-connection-view.test.ts', 'tests/multibroker-mb4-validator.test.mjs', 'tests/broker-runtime-control.test.ts', 'tests/mexc-egress-boundary.test.ts', 'tests/mexc-readonly-probe.test.ts', '--reporter=dot'],
  }),
  Object.freeze({
    attemptId: 'mb4-remediation14-typecheck-001',
    gate: 'typecheck',
    command: 'node <repo>/node_modules/typescript/lib/tsc.js --noEmit',
    entrypointPath: path.join(ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js'),
    entrypointIdentity: '<repo>/node_modules/typescript/lib/tsc.js',
    args: ['--noEmit'],
  }),
  Object.freeze({
    attemptId: 'mb4-remediation14-full-001',
    gate: 'full_test',
    command: 'node <repo>/node_modules/vitest/dist/cli.js run --reporter=dot --maxWorkers=1',
    entrypointPath: path.join(ROOT, 'node_modules', 'vitest', 'dist', 'cli.js'),
    entrypointIdentity: '<repo>/node_modules/vitest/dist/cli.js',
    args: ['run', '--reporter=dot', '--maxWorkers=1'],
  }),
  Object.freeze({
    attemptId: 'mb4-remediation14-release-001',
    gate: 'release_check',
    command: 'node <repo>/scripts/release-check.mjs',
    entrypointPath: path.join(ROOT, 'scripts', 'release-check.mjs'),
    entrypointIdentity: '<repo>/scripts/release-check.mjs',
    args: [],
  }),
  Object.freeze({
    attemptId: 'mb4-remediation14-build-001',
    gate: 'build',
    command: 'node <repo>/node_modules/next/dist/bin/next build',
    entrypointPath: path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'),
    entrypointIdentity: '<repo>/node_modules/next/dist/bin/next',
    args: ['build'],
  }),
])

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function environmentValue(environment, expectedName) {
  const actualName = Object.keys(environment).find(
    (name) => name.toLowerCase() === expectedName.toLowerCase(),
  )
  return actualName ? environment[actualName] : undefined
}

function canonicalEnvironmentDigest(entries) {
  return sha256(Buffer.from(JSON.stringify(
    entries.sort(([left], [right]) => left.localeCompare(right, 'en')),
  ), 'utf8'))
}

function gateEnvironment() {
  const rejectedInfluenceVariables = assertNoGateInfluenceVariables(process.env)
  const loadedDotenvFiles = DOTENV_CANDIDATES.filter((relativePath) => existsSync(path.join(ROOT, relativePath)))
  if (loadedDotenvFiles.length > 0) {
    throw new Error(`gate refuses loadable dotenv files: ${loadedDotenvFiles.join(', ')}`)
  }
  const environment = {}
  const inheritedEntries = []
  for (const name of INHERITED_ENV_ALLOWLIST) {
    const value = environmentValue(process.env, name)
    if (value == null) continue
    environment[name] = value
    inheritedEntries.push([name, value])
  }

  const systemRoot = environmentValue(environment, 'SystemRoot')
  const pathSeparator = process.platform === 'win32' ? ';' : ':'
  const deterministicPathEntries = [NODE_DIRECTORY, GIT_CORE_DIRECTORY]
  if (process.platform === 'win32') {
    if (!systemRoot) throw new Error('SystemRoot is required for the Windows gate environment')
    deterministicPathEntries.push(path.join(systemRoot, 'System32'), systemRoot)
  } else {
    deterministicPathEntries.push('/usr/bin', '/bin')
  }

  const forcedVariables = {
    CI: '1',
    EQUORA_MEXC_RUNTIME_MODE: 'off',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    NEXT_TELEMETRY_DISABLED: '1',
    NO_COLOR: '1',
    NO_UPDATE_NOTIFIER: '1',
    PATH: deterministicPathEntries.join(pathSeparator),
    TERM: 'dumb',
    TZ: 'UTC',
  }
  if (process.platform === 'win32') {
    forcedVariables.ComSpec = path.join(systemRoot, 'System32', 'cmd.exe')
  }
  Object.assign(environment, forcedVariables)

  const artifactForcedVariables = Object.fromEntries(Object.entries(forcedVariables).map(([name, value]) => [
    name,
    String(value)
      .replaceAll(path.resolve(ROOT), '<repo>')
      .replaceAll(NODE_DIRECTORY, '<node-dir>')
      .replaceAll(GIT_CORE_DIRECTORY, '<git-core-dir>')
      .replaceAll('\\', '/'),
  ]))

  return {
    environment,
    inherited_variable_names: inheritedEntries.map(([name]) => name),
    inherited_environment_sha256: canonicalEnvironmentDigest(inheritedEntries),
    forced_variables: artifactForcedVariables,
    rejected_influence_variables: rejectedInfluenceVariables,
    loaded_dotenv_files: loadedDotenvFiles,
  }
}

function canonicalTranscript(stdoutBytes, stderrBytes) {
  const repositoryPaths = new Set([
    path.resolve(ROOT),
    path.resolve(ROOT).replaceAll('\\', '/'),
  ])
  const stdout = canonicalUtf8Bytes(stdoutBytes ?? Buffer.alloc(0), 'gate stdout').toString('utf8')
  const stderr = canonicalUtf8Bytes(stderrBytes ?? Buffer.alloc(0), 'gate stderr').toString('utf8')
  const raw = `${stdout}${stderr}`
  assertNoDisallowedTerminalControls(raw, 'raw gate transcript')
  let combined = raw.replace(/\r\n?/gu, '\n')
  for (const repositoryPath of repositoryPaths) {
    const repositoryPattern = new RegExp(repositoryPath.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'giu')
    combined = combined.replace(repositoryPattern, '<repo>')
  }
  const canonical = `${combined.trim()}\n`
  assertNoDisallowedTerminalControls(canonical, 'canonical gate transcript')
  return canonical
}

function resultCounts(gate, transcript) {
  if (gate === 'targeted' || gate === 'full_test') {
    const files = /Test Files\s+(\d+) passed \((\d+)\)/u.exec(transcript)
    const tests = /Tests\s+(\d+) passed \((\d+)\)/u.exec(transcript)
    if (!files || !tests) throw new Error(`unable to parse Vitest counts for ${gate}`)
    return {
      test_files_passed: Number(files[1]),
      test_files_total: Number(files[2]),
      tests_passed: Number(tests[1]),
      tests_total: Number(tests[2]),
    }
  }
  if (gate === 'build') {
    const staticPages = [...transcript.matchAll(/Generating static pages \((\d+)\/(\d+)\)/gu)].at(-1)
    const route = /\/broker-sync\s+([0-9.]+ kB)\s+([0-9.]+ kB)/u.exec(transcript)
    if (!staticPages || !route) throw new Error('unable to parse build counts')
    return {
      static_pages_passed: Number(staticPages[1]),
      static_pages_total: Number(staticPages[2]),
      broker_sync_route_size: route[1],
      broker_sync_first_load_js: route[2],
    }
  }
  return {}
}

function inputSnapshot() {
  return INPUT_SNAPSHOT_PATHS.map((relativePath) => {
    const bytes = canonicalUtf8Bytes(
      readStableRegularFile(ROOT, relativePath),
      relativePath,
    )
    return {
      path: relativePath,
      canonical_sha256: sha256(bytes),
      canonical_bytes: bytes.length,
    }
  })
}

function assertInputSnapshot(expected, label) {
  const actual = inputSnapshot()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`gate input snapshot changed ${label}`)
}

function runGate(definition, environment, frozenInputSnapshot) {
  assertInputSnapshot(frozenInputSnapshot, `before ${definition.gate}`)
  const nodeBefore = readStableAbsoluteRegularFile(process.execPath, `Node executable before ${definition.gate}`)
  const entrypointBefore = readStableAbsoluteRegularFile(
    definition.entrypointPath,
    `${definition.entrypointIdentity} before ${definition.gate}`,
  )
  const packageLockBefore = readStableRegularFile(ROOT, 'package-lock.json')
  const startedAt = new Date().toISOString()
  const result = spawnSync(process.execPath, [definition.entrypointPath, ...definition.args], {
    cwd: ROOT,
    env: environment,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  })
  const finishedAt = new Date().toISOString()
  if (result.error) throw result.error
  const transcript = canonicalTranscript(result.stdout, result.stderr)
  const nodeAfter = readStableAbsoluteRegularFile(process.execPath, `Node executable after ${definition.gate}`)
  const entrypointAfter = readStableAbsoluteRegularFile(
    definition.entrypointPath,
    `${definition.entrypointIdentity} after ${definition.gate}`,
  )
  const packageLockAfter = readStableRegularFile(ROOT, 'package-lock.json')
  if (!nodeBefore.equals(nodeAfter)) throw new Error(`Node executable changed during ${definition.gate}`)
  if (!entrypointBefore.equals(entrypointAfter)) throw new Error(`gate entrypoint changed during ${definition.gate}`)
  if (!packageLockBefore.equals(packageLockAfter)) throw new Error(`package-lock.json changed during ${definition.gate}`)
  assertInputSnapshot(frozenInputSnapshot, `after ${definition.gate}`)
  if (result.status !== 0) {
    process.stderr.write(transcript)
    throw new Error(`${definition.gate} exited with ${result.status}`)
  }
  const bytes = Buffer.from(transcript, 'utf8')
  return {
    attempt_id: definition.attemptId,
    gate: definition.gate,
    command: definition.command,
    started_at_utc: startedAt,
    finished_at_utc: finishedAt,
    exit_code: result.status,
    result: 'pass',
    canonical_transcript: transcript,
    transcript_canonical_bytes: bytes.length,
    transcript_canonical_sha256: sha256(bytes),
    result_counts: resultCounts(definition.gate, transcript),
  }
}

const gateEnvironmentSnapshot = gateEnvironment()
const frozenInputSnapshot = inputSnapshot()
const nodeExecutableBytes = readStableAbsoluteRegularFile(process.execPath, 'Node executable')
const gateEntrypoints = [...new Map(GATES.map((definition) => [definition.entrypointIdentity, definition])).values()]
  .map((definition) => {
    const bytes = readStableAbsoluteRegularFile(definition.entrypointPath, definition.entrypointIdentity)
    return {
      gates: GATES.filter((gate) => gate.entrypointIdentity === definition.entrypointIdentity).map(({ gate }) => gate),
      identity: definition.entrypointIdentity,
      sha256: sha256(bytes),
      bytes: bytes.length,
    }
  })
const gitCoreBytes = readStableAbsoluteRegularFile(GIT_CORE_PATH, 'Git-Core executable')
const packageLockBytes = canonicalUtf8Bytes(
  readStableRegularFile(ROOT, 'package-lock.json'),
  'package-lock.json',
)
const gitVersion = runStableAbsoluteTextCommand(GIT_CORE_PATH, ['--version'], {
  cwd: ROOT,
  env: gateEnvironmentSnapshot.environment,
}).trim()

const artifact = {
  schema_version: 'equora_mb4_gate_artifact_v3',
  generated_at_utc: null,
  input_snapshot: frozenInputSnapshot,
  execution_environment: {
    platform: process.platform,
    arch: process.arch,
    node_version: process.version,
    node_executable_sha256: sha256(nodeExecutableBytes),
    node_executable_bytes: nodeExecutableBytes.length,
    gate_invocation: 'direct Node execution of the four recorded JavaScript entrypoints; npm launcher not used',
    gate_entrypoints: gateEntrypoints,
    git_version: gitVersion,
    git_core_identity: process.platform === 'win32' ? '<git-core-dir>/git.exe' : '<git-core-dir>/git',
    git_core_sha256: sha256(gitCoreBytes),
    git_core_bytes: gitCoreBytes.length,
    git_builtin_commands: ['--version', 'diff', 'ls-files', 'rev-parse'],
    package_lock_sha256: sha256(packageLockBytes),
    package_lock_bytes: packageLockBytes.length,
    toolchain_binding_scope: 'Node executable, immediate JavaScript gate entrypoint files, Git-Core binary and package-lock.json resolution metadata are hash-bound; no transitive closure claim.',
    external_toolchain_trust_anchors: [
      'Installed transitive node_modules implementation files are external local-machine trust anchors; package-lock.json metadata does not prove their installed bytes.',
      'Operating-system libraries loaded by Node and Git-Core are external local-machine trust anchors.',
      'Git helper files outside the bound Git-Core binary are not claimed; MB4 validator Git use is restricted to built-in rev-parse, diff and ls-files commands plus --version.',
    ],
    environment_policy: 'minimal_allowlist_v2_direct_node_entrypoints_reject_influence_variables',
    inherited_variable_names: gateEnvironmentSnapshot.inherited_variable_names,
    inherited_environment_sha256: gateEnvironmentSnapshot.inherited_environment_sha256,
    forced_variables: gateEnvironmentSnapshot.forced_variables,
    rejected_influence_variables: gateEnvironmentSnapshot.rejected_influence_variables,
    loaded_dotenv_files: gateEnvironmentSnapshot.loaded_dotenv_files,
  },
  transcript_policy: {
    encoding: 'UTF-8 without BOM',
    raw_output_validation: 'stdout and stderr captured as bytes; invalid UTF-8 and UTF-8 BOM rejected before text canonicalization',
    line_endings: 'LF with exactly one terminal LF',
    terminal_controls: 'reject all C0/C1/CSI/OSC controls except TAB, LF and normalized CR',
    npm_notices_removed: false,
    workspace_path_replacement: '<repo>',
  },
  attempts: GATES.map((definition) => runGate(definition, gateEnvironmentSnapshot.environment, frozenInputSnapshot)),
}
artifact.generated_at_utc = new Date().toISOString()
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`)

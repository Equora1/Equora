import { createHash } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { isAbsolute, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_MANIFEST_PATH = 'docs/gates/EQUORA_v57.61.0_MULTI_BROKER_PARITY_MANIFEST.sha256'
const EVIDENCE_PATH = 'docs/gates/EQUORA_v57.61.0_MULTI_BROKER_PARITY_EVIDENCE.json'

const REQUIRED_NORMATIVE_PATHS = [
  '.github/workflows/ci.yml',
  'docs/architecture/EQUORA_v57.61.0_PROVIDER_NEUTRAL_MULTI_BROKER_ARCHITECTURE.md',
  'lib/server/broker-code-registry.ts',
  'lib/server/broker-core-contracts.ts',
  'lib/server/mexc-central-network-transport.ts',
  'lib/server/mexc-request-contract.ts',
  'lib/server/mexc-transport.ts',
  'lib/server/providers/mexc-readonly-adapter.ts',
  'package-lock.json',
  'package.json',
  'scripts/release-check.mjs',
  'scripts/validate-multibroker-parity-manifest.mjs',
  'tests/multibroker-core-contracts.test.ts',
  'tests/mexc-central-network-transport.test.ts',
  'tests/mexc-readonly-adapter.test.ts',
  'tsconfig.json',
  'vitest.config.mts',
]

const REQUIRED_PARITY_PATHS = [
  'tests/application-contracts.test.ts',
  'tests/mexc-egress-boundary.test.ts',
  'tests/mexc-central-network-transport.test.ts',
  'tests/mexc-readonly-adapter.test.ts',
  'tests/mexc-readonly-transport.test.ts',
  'tests/mexc-readonly-probe.test.ts',
  'tests/mexc-pagination.test.ts',
  'tests/mexc-oracles.test.ts',
  'tests/mexc-sync-scope.test.ts',
  'tests/mexc-capture-orchestrator.test.ts',
  'tests/mexc-capture-runtime.test.ts',
  'tests/broker-raw-ledger.test.ts',
  'tests/broker-capture-control.test.ts',
  'tests/broker-capture-route.test.ts',
  'tests/broker-runtime-control.test.ts',
  'tests/broker-runtime-deployment.test.ts',
  'tests/broker-capture-scheduler.test.ts',
  'tests/broker-preview.test.ts',
  'tests/sql-contracts.test.ts',
]

const REQUIRED_CANDIDATE_SCOPE = [
  EVIDENCE_PATH,
  DEFAULT_MANIFEST_PATH,
  'lib/server/broker-code-registry.ts',
  'lib/server/broker-core-contracts.ts',
  'lib/server/mexc-central-network-transport.ts',
  'lib/server/mexc-request-contract.ts',
  'lib/server/mexc-transport.ts',
  'lib/server/providers/mexc-readonly-adapter.ts',
  'scripts/validate-multibroker-parity-manifest.mjs',
  'tests/application-contracts.test.ts',
  'tests/mexc-central-network-transport.test.ts',
  'tests/mexc-egress-boundary.test.ts',
  'tests/mexc-readonly-adapter.test.ts',
  'tests/multibroker-core-contracts.test.ts',
]

const EXPECTED_TOOLCHAIN = Object.freeze({
  node: 'v24.18.0',
  npm: '11.16.0',
  git: '2.53.0.windows.2',
  operating_system: 'Microsoft Windows NT 10.0.26100.0',
  docker_client: '29.7.2',
  postgres_client: 'not_available_on_path',
  postgres_image: 'not_invoked_in_mb1',
  ci_node: '24.18.0',
})

const EXPECTED_COUNTS = Object.freeze({
  baseline_test_files: 23,
  baseline_tests: 380,
  candidate_test_files: 26,
  candidate_tests: 433,
  contract_test_files: 2,
  contract_tests: 30,
  baseline_audit_all_vulnerabilities: 0,
  baseline_audit_production_vulnerabilities: 0,
  candidate_audit_all_vulnerabilities: null,
  candidate_audit_production_vulnerabilities: null,
  candidate_audit_status: 'not_run_no_external_advisory_api_authorization',
})

const EXPECTED_BASELINE_EVIDENCE = Object.freeze({
  historical_scope: 'historical_pre_mb0_repository_baseline',
  historical_commit: '3d88f47c339fa990734308cf9e923d23d4a9cc4f',
  historical_ci_scope: 'historical_pre_mb0_ci',
  integrated_scope: 'integrated_mb0_tree_inherited_by_mb1',
  integrated_commit: '19817a96dff114c3bb7a2173d1774880e8e00fbc',
  integrated_tree: '8df26d7dd4ace9d755640a34381af191b85b58d5',
  integrated_test_files: 24,
  integrated_tests: 398,
  current_ci_status: 'not_requeried_for_mb1',
})

const EXPECTED_GATE_TRANSCRIPT_POLICIES = Object.freeze({
  canonical_gate_transcript_v1: Object.freeze({
    encoding: 'UTF-8',
    line_endings: 'LF',
    redactions: Object.freeze([
      'Vitest Start at line replaced by:    Start at <redacted>',
      'Vitest Duration line replaced by:    Duration <redacted>',
      'Next.js Compiled successfully duration suffix replaced by: in <redacted>',
    ]),
    non_redacted_contract: 'All other stdout/stderr text, commands, exit codes and result counts remain unchanged; the recorded byte count and SHA-256 bind the canonical transcript rather than the volatile physical terminal transcript.',
  }),
  canonical_gate_transcript_v2: Object.freeze({
    encoding: 'UTF-8',
    line_endings: 'LF',
    redactions: Object.freeze([
      'Vitest Start at line replaced by:    Start at <redacted>',
      'Vitest Duration line replaced by:    Duration <redacted>',
      'Next.js Compiled successfully duration suffix replaced by: in <redacted>',
      'Optional npm CLI update-notice block removed in full, whether present or absent',
    ]),
    non_redacted_contract: 'All other stdout/stderr text, commands, exit codes and result counts remain unchanged; the recorded byte count and SHA-256 bind the canonical transcript rather than the volatile physical terminal transcript.',
  }),
})

const REQUIRED_GATE_ATTEMPTS = Object.freeze([
  Object.freeze({ collection: 'baseline_attempts', id: 'mb0-local-002', command: 'npm.cmd ci', result: 'pass', outputBytes: 151, outputSha256: '4041477179e951d38305a54884813d903dadbcf275c3481492c8ac0d38b3d6f3', resultCounts: { packages_added: 193, packages_audited: 194, vulnerabilities: 0 } }),
  Object.freeze({ collection: 'baseline_attempts', id: 'mb0-local-003', command: 'npm.cmd audit', result: 'pass', outputBytes: 25, outputSha256: '4b02d4a3c23d969c46bd2041360f80bfcb1fe760d9db864009acdd710f9de601', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'baseline_attempts', id: 'mb0-local-004', command: 'npm.cmd audit --omit=dev', result: 'pass', outputBytes: 25, outputSha256: '4b02d4a3c23d969c46bd2041360f80bfcb1fe760d9db864009acdd710f9de601', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'baseline_attempts', id: 'mb0-local-005', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 67, outputSha256: 'ae3382b4eca8d8d20fa90932ac5de0e80b7b2101355414d7ec4c8d4fa92f335d' }),
  Object.freeze({ collection: 'baseline_attempts', id: 'mb0-local-006', command: 'npm.cmd test', result: 'pass', outputBytes: 321, outputSha256: 'f9a24038649a36a07bc6b4c618306712ac0b3847a234362f851366373946f40f', resultCounts: { test_files_passed: 23, test_files_total: 23, tests_passed: 380, tests_total: 380 } }),
  Object.freeze({ collection: 'baseline_attempts', id: 'mb0-local-007', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 154, outputSha256: 'c4325bf55294a9af088cf8e8d931d6e586f58e86c9de51a51b9ca6bc5b59f993' }),
  Object.freeze({ collection: 'baseline_attempts', id: 'mb0-local-008', command: 'npm.cmd run build', result: 'pass', outputBytes: 2226, outputSha256: 'ae2d8d780e0a59743b6c2f7ef5a07b0e3e8ae4fc3b8aae0e3ba7b13d4568aa9a', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation2-targeted-002', command: 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', result: 'pass', outputBytes: 357, outputSha256: '1035cc1f76303e9791eaaf06d4763f504623ae62114de8191a56bafc2cd7a41b', resultCounts: { test_files_passed: 1, test_files_total: 1, tests_passed: 14, tests_total: 14 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation2-typecheck-002', command: 'npm.cmd run typecheck', result: 'pass_after_serial_rerun', outputBytes: 67, outputSha256: 'ae3382b4eca8d8d20fa90932ac5de0e80b7b2101355414d7ec4c8d4fa92f335d' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation2-full-002', command: 'npm.cmd test', result: 'pass', outputBytes: 322, outputSha256: '1984c016cdb75e11755778309bd3a24225a8a0e9156d87f698ae5ff3a1fd8350', resultCounts: { test_files_passed: 24, test_files_total: 24, tests_passed: 394, tests_total: 394 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation2-release-002', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 154, outputSha256: 'c4325bf55294a9af088cf8e8d931d6e586f58e86c9de51a51b9ca6bc5b59f993' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation2-audit-all-002', command: 'npm.cmd audit', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 25, outputSha256: '4b02d4a3c23d969c46bd2041360f80bfcb1fe760d9db864009acdd710f9de601', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation2-audit-prod-002', command: 'npm.cmd audit --omit=dev', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 25, outputSha256: '4b02d4a3c23d969c46bd2041360f80bfcb1fe760d9db864009acdd710f9de601', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation2-build-002', command: 'npm.cmd run build', result: 'pass', outputBytes: 2226, outputSha256: 'f30af38eef6a9d250a98ab2c1368e0f811121222ef4d0a24bc6c555ec37f5def', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation2-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 92, outputSha256: '35f944352bc7cda92eefa3c38e262843a449a2ae040d48d86c98ba5f29cb85ca', resultCounts: { manifest_entries_passed: 28, manifest_entries_total: 28 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation3-targeted-001', command: 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', result: 'pass', outputBytes: 276, outputSha256: '68a1a9ff836d9b95c62a98664a9d9706cd793f5e9431c7a0d2910dac8fc13867', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 1, test_files_total: 1, tests_passed: 16, tests_total: 16 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation3-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 63, outputSha256: '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation3-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 239, outputSha256: '41f686510119faeb69351d69ea90710bb99ba5fe41a785ed2c172e15d1a90019', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 24, test_files_total: 24, tests_passed: 396, tests_total: 396 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation3-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 149, outputSha256: 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation3-audit-all-001', command: 'npm.cmd audit', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation3-audit-prod-001', command: 'npm.cmd audit --omit=dev', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation3-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2183, outputSha256: '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation3-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { manifest_entries_passed: 28, manifest_entries_total: 28 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation4-targeted-001', command: 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', result: 'pass', outputBytes: 276, outputSha256: '68a1a9ff836d9b95c62a98664a9d9706cd793f5e9431c7a0d2910dac8fc13867', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 1, test_files_total: 1, tests_passed: 16, tests_total: 16 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation4-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 63, outputSha256: '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation4-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 239, outputSha256: '41f686510119faeb69351d69ea90710bb99ba5fe41a785ed2c172e15d1a90019', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 24, test_files_total: 24, tests_passed: 396, tests_total: 396 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation4-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 149, outputSha256: 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation4-audit-all-001', command: 'npm.cmd audit', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation4-audit-prod-001', command: 'npm.cmd audit --omit=dev', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation4-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2183, outputSha256: '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation4-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { manifest_entries_passed: 28, manifest_entries_total: 28 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation5-targeted-001', command: 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', result: 'pass', outputBytes: 276, outputSha256: '68a1a9ff836d9b95c62a98664a9d9706cd793f5e9431c7a0d2910dac8fc13867', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 1, test_files_total: 1, tests_passed: 16, tests_total: 16 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation5-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 63, outputSha256: '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation5-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 239, outputSha256: '41f686510119faeb69351d69ea90710bb99ba5fe41a785ed2c172e15d1a90019', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 24, test_files_total: 24, tests_passed: 396, tests_total: 396 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation5-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 149, outputSha256: 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation5-audit-all-001', command: 'npm.cmd audit', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation5-audit-prod-001', command: 'npm.cmd audit --omit=dev', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation5-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2183, outputSha256: '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation5-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { manifest_entries_passed: 28, manifest_entries_total: 28 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-targeted-001', command: 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', result: 'pass', outputBytes: 276, outputSha256: '4f0b60574ed91b7771fe0541dbb11bb0839403340e478cffa5fcb439a36ee75a', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 1, test_files_total: 1, tests_passed: 18, tests_total: 18 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 63, outputSha256: '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 239, outputSha256: '2f32254681edd551d66ef6ebe91348ab69f6a89ac33e4249923783ee38d9e38a', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 24, test_files_total: 24, tests_passed: 398, tests_total: 398 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 149, outputSha256: 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-audit-all-001', command: 'npm.cmd audit', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-audit-prod-001', command: 'npm.cmd audit --omit=dev', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2183, outputSha256: '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { manifest_entries_passed: 28, manifest_entries_total: 28 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-closure-targeted-001', command: 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', result: 'pass', outputBytes: 276, outputSha256: '4f0b60574ed91b7771fe0541dbb11bb0839403340e478cffa5fcb439a36ee75a', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 1, test_files_total: 1, tests_passed: 18, tests_total: 18 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-closure-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 63, outputSha256: '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-closure-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 239, outputSha256: '2f32254681edd551d66ef6ebe91348ab69f6a89ac33e4249923783ee38d9e38a', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 24, test_files_total: 24, tests_passed: 398, tests_total: 398 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-closure-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 149, outputSha256: 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-closure-audit-all-001', command: 'npm.cmd audit', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-closure-audit-prod-001', command: 'npm.cmd audit --omit=dev', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation6-closure-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2183, outputSha256: '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation7-closure-targeted-001', command: 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', result: 'pass', outputBytes: 276, outputSha256: '4f0b60574ed91b7771fe0541dbb11bb0839403340e478cffa5fcb439a36ee75a', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 1, test_files_total: 1, tests_passed: 18, tests_total: 18 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation7-closure-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 63, outputSha256: '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation7-closure-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 239, outputSha256: '2f32254681edd551d66ef6ebe91348ab69f6a89ac33e4249923783ee38d9e38a', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 24, test_files_total: 24, tests_passed: 398, tests_total: 398 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation7-closure-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 149, outputSha256: 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation7-closure-audit-all-001', command: 'npm.cmd audit', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation7-closure-audit-prod-001', command: 'npm.cmd audit --omit=dev', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation7-closure-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2183, outputSha256: '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation7-closure-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { manifest_entries_passed: 28, manifest_entries_total: 28 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation8-closure-targeted-001', command: 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', result: 'pass', outputBytes: 276, outputSha256: '4f0b60574ed91b7771fe0541dbb11bb0839403340e478cffa5fcb439a36ee75a', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 1, test_files_total: 1, tests_passed: 18, tests_total: 18 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation8-closure-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 63, outputSha256: '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation8-closure-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 239, outputSha256: '2f32254681edd551d66ef6ebe91348ab69f6a89ac33e4249923783ee38d9e38a', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 24, test_files_total: 24, tests_passed: 398, tests_total: 398 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation8-closure-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 149, outputSha256: 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation8-closure-audit-all-001', command: 'npm.cmd audit', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation8-closure-audit-prod-001', command: 'npm.cmd audit --omit=dev', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation8-closure-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2183, outputSha256: '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation8-closure-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { manifest_entries_passed: 28, manifest_entries_total: 28 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation9-closure-targeted-001', command: 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', result: 'pass', outputBytes: 276, outputSha256: '4f0b60574ed91b7771fe0541dbb11bb0839403340e478cffa5fcb439a36ee75a', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 1, test_files_total: 1, tests_passed: 18, tests_total: 18 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation9-closure-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 63, outputSha256: '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation9-closure-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 239, outputSha256: '2f32254681edd551d66ef6ebe91348ab69f6a89ac33e4249923783ee38d9e38a', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 24, test_files_total: 24, tests_passed: 398, tests_total: 398 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation9-closure-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 149, outputSha256: 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation9-closure-audit-all-001', command: 'npm.cmd audit', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation9-closure-audit-prod-001', command: 'npm.cmd audit --omit=dev', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation9-closure-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2183, outputSha256: '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation9-closure-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { manifest_entries_passed: 28, manifest_entries_total: 28 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation10-closure-targeted-001', command: 'npm.cmd test -- tests/multibroker-core-contracts.test.ts', result: 'pass', outputBytes: 276, outputSha256: '4f0b60574ed91b7771fe0541dbb11bb0839403340e478cffa5fcb439a36ee75a', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 1, test_files_total: 1, tests_passed: 18, tests_total: 18 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation10-closure-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 63, outputSha256: '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation10-closure-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 239, outputSha256: '2f32254681edd551d66ef6ebe91348ab69f6a89ac33e4249923783ee38d9e38a', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 24, test_files_total: 24, tests_passed: 398, tests_total: 398 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation10-closure-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 149, outputSha256: 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation10-closure-audit-all-001', command: 'npm.cmd audit', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation10-closure-audit-prod-001', command: 'npm.cmd audit --omit=dev', result: 'pass_after_explicit_advisory_api_authorization', outputBytes: 24, outputSha256: '6d8c5c8f3d7684adb070417bd608d01ae90aa3dc26a65af03ffda4955f38d9a3', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { vulnerabilities: 0 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation10-closure-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2183, outputSha256: '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb0-remediation10-closure-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: 'db11f17592857b5e169cc446fb5da39e95903e3871d78dd7dd0afe1742792207', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { manifest_entries_passed: 28, manifest_entries_total: 28 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-closure-targeted-001', command: 'npm.cmd test -- tests/application-contracts.test.ts tests/multibroker-core-contracts.test.ts tests/mexc-readonly-transport.test.ts tests/mexc-readonly-probe.test.ts tests/mexc-egress-boundary.test.ts tests/mexc-oracles.test.ts tests/mexc-pagination.test.ts tests/mexc-capture-orchestrator.test.ts tests/mexc-capture-runtime.test.ts tests/mexc-readonly-adapter.test.ts tests/mexc-central-network-transport.test.ts', result: 'pass', outputBytes: 845, outputSha256: 'd7ebd297de57e87e6229c604f3a36f2ca9647f593ce8f2ef4cbaabe6d578bc54', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 11, test_files_total: 11, tests_passed: 236, tests_total: 236 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-closure-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 272, outputSha256: '859c6371e48ae9c9a5dd396943de7eb97d62b71b9512a68dd3736367eb258b4f', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-closure-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 448, outputSha256: '2df6737a22add9c630933e63be9e9a4e3a88ad740fff96618d416f4b8899cbfa', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 26, test_files_total: 26, tests_passed: 425, tests_total: 425 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-closure-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 358, outputSha256: 'a838c5640bb362b0f3d78d39102f2687e8020cb3a95dab0c32e6f25499cf1ae4', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-closure-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2392, outputSha256: 'bc620124e8486cceb03a955a8be8662c0f9c7c0d3f6d1718037751bab0375358', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-closure-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: '2daa5f2087db82b4bcd365d23672173731fe5ad834b0bd4482105481b8b5e59e', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { manifest_entries_passed: 35, manifest_entries_total: 35 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation2-closure-targeted-001', command: 'npm.cmd test -- tests/application-contracts.test.ts tests/multibroker-core-contracts.test.ts tests/mexc-readonly-transport.test.ts tests/mexc-readonly-probe.test.ts tests/mexc-egress-boundary.test.ts tests/mexc-oracles.test.ts tests/mexc-pagination.test.ts tests/mexc-capture-orchestrator.test.ts tests/mexc-capture-runtime.test.ts tests/mexc-readonly-adapter.test.ts tests/mexc-central-network-transport.test.ts', result: 'pass', outputBytes: 845, outputSha256: '1b82bc278d34150d65c6b4b7152832e13210da66c2531fb3190226f048f0f8cc', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 11, test_files_total: 11, tests_passed: 238, tests_total: 238 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation2-closure-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 272, outputSha256: '859c6371e48ae9c9a5dd396943de7eb97d62b71b9512a68dd3736367eb258b4f', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation2-closure-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 448, outputSha256: '3bb005e10cb8dcc806ea5b0425a4b9b2a62afca4101e0003b818b8e8a5c38ce2', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 26, test_files_total: 26, tests_passed: 427, tests_total: 427 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation2-closure-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 358, outputSha256: 'a838c5640bb362b0f3d78d39102f2687e8020cb3a95dab0c32e6f25499cf1ae4', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation2-closure-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2392, outputSha256: 'bc620124e8486cceb03a955a8be8662c0f9c7c0d3f6d1718037751bab0375358', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation2-closure-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: '2daa5f2087db82b4bcd365d23672173731fe5ad834b0bd4482105481b8b5e59e', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { manifest_entries_passed: 35, manifest_entries_total: 35 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation3-closure-targeted-001', command: 'npm.cmd test -- tests/application-contracts.test.ts tests/multibroker-core-contracts.test.ts tests/mexc-readonly-transport.test.ts tests/mexc-readonly-probe.test.ts tests/mexc-egress-boundary.test.ts tests/mexc-oracles.test.ts tests/mexc-pagination.test.ts tests/mexc-capture-orchestrator.test.ts tests/mexc-capture-runtime.test.ts tests/mexc-readonly-adapter.test.ts tests/mexc-central-network-transport.test.ts', result: 'pass', outputBytes: 845, outputSha256: '1b82bc278d34150d65c6b4b7152832e13210da66c2531fb3190226f048f0f8cc', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 11, test_files_total: 11, tests_passed: 238, tests_total: 238 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation3-closure-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 272, outputSha256: '859c6371e48ae9c9a5dd396943de7eb97d62b71b9512a68dd3736367eb258b4f', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation3-closure-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 448, outputSha256: '3bb005e10cb8dcc806ea5b0425a4b9b2a62afca4101e0003b818b8e8a5c38ce2', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 26, test_files_total: 26, tests_passed: 427, tests_total: 427 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation3-closure-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 358, outputSha256: 'a838c5640bb362b0f3d78d39102f2687e8020cb3a95dab0c32e6f25499cf1ae4', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation3-closure-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2392, outputSha256: 'bc620124e8486cceb03a955a8be8662c0f9c7c0d3f6d1718037751bab0375358', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation3-closure-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: '2daa5f2087db82b4bcd365d23672173731fe5ad834b0bd4482105481b8b5e59e', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { manifest_entries_passed: 35, manifest_entries_total: 35 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation4-closure-targeted-001', command: 'npm.cmd test -- tests/application-contracts.test.ts tests/multibroker-core-contracts.test.ts tests/mexc-readonly-transport.test.ts tests/mexc-readonly-probe.test.ts tests/mexc-egress-boundary.test.ts tests/mexc-oracles.test.ts tests/mexc-pagination.test.ts tests/mexc-capture-orchestrator.test.ts tests/mexc-capture-runtime.test.ts tests/mexc-readonly-adapter.test.ts tests/mexc-central-network-transport.test.ts', result: 'pass', outputBytes: 845, outputSha256: '5087e338bda0fb3c74658f0a9ae3ed30754877891a61255320727c2c5cdcf07d', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 11, test_files_total: 11, tests_passed: 240, tests_total: 240 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation4-closure-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 272, outputSha256: '859c6371e48ae9c9a5dd396943de7eb97d62b71b9512a68dd3736367eb258b4f', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation4-closure-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 448, outputSha256: 'cb030344ec59dcf3f4a42ad107e7acaefbcd0277848822426d9da9303936ed11', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { test_files_passed: 26, test_files_total: 26, tests_passed: 429, tests_total: 429 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation4-closure-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 358, outputSha256: 'a838c5640bb362b0f3d78d39102f2687e8020cb3a95dab0c32e6f25499cf1ae4', outputTranscriptPolicy: 'canonical_gate_transcript_v1' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation4-closure-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2392, outputSha256: 'bc620124e8486cceb03a955a8be8662c0f9c7c0d3f6d1718037751bab0375358', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation4-closure-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: '2daa5f2087db82b4bcd365d23672173731fe5ad834b0bd4482105481b8b5e59e', outputTranscriptPolicy: 'canonical_gate_transcript_v1', resultCounts: { manifest_entries_passed: 35, manifest_entries_total: 35 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation5-closure-targeted-001', command: 'npm.cmd test -- tests/application-contracts.test.ts tests/multibroker-core-contracts.test.ts tests/mexc-readonly-transport.test.ts tests/mexc-readonly-probe.test.ts tests/mexc-egress-boundary.test.ts tests/mexc-oracles.test.ts tests/mexc-pagination.test.ts tests/mexc-capture-orchestrator.test.ts tests/mexc-capture-runtime.test.ts tests/mexc-readonly-adapter.test.ts tests/mexc-central-network-transport.test.ts', result: 'pass', outputBytes: 636, outputSha256: 'f0b459a8682328c7fd9efa59fc21a1aa2defa9500a7c4a2d283ff7f899af63a7', outputTranscriptPolicy: 'canonical_gate_transcript_v2', resultCounts: { test_files_passed: 11, test_files_total: 11, tests_passed: 240, tests_total: 240 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation5-closure-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 63, outputSha256: '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17', outputTranscriptPolicy: 'canonical_gate_transcript_v2' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation5-closure-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 239, outputSha256: '156ea5b0586766b3d6eb53f58756a27d1073efad5603739072a685c8c3acce52', outputTranscriptPolicy: 'canonical_gate_transcript_v2', resultCounts: { test_files_passed: 26, test_files_total: 26, tests_passed: 429, tests_total: 429 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation5-closure-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 149, outputSha256: 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a', outputTranscriptPolicy: 'canonical_gate_transcript_v2' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation5-closure-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2183, outputSha256: '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', outputTranscriptPolicy: 'canonical_gate_transcript_v2', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation5-closure-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: '2daa5f2087db82b4bcd365d23672173731fe5ad834b0bd4482105481b8b5e59e', outputTranscriptPolicy: 'canonical_gate_transcript_v2', resultCounts: { manifest_entries_passed: 35, manifest_entries_total: 35 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation6-closure-targeted-001', command: 'npm.cmd test -- tests/application-contracts.test.ts tests/multibroker-core-contracts.test.ts tests/mexc-readonly-transport.test.ts tests/mexc-readonly-probe.test.ts tests/mexc-egress-boundary.test.ts tests/mexc-oracles.test.ts tests/mexc-pagination.test.ts tests/mexc-capture-orchestrator.test.ts tests/mexc-capture-runtime.test.ts tests/mexc-readonly-adapter.test.ts tests/mexc-central-network-transport.test.ts', result: 'pass', outputBytes: 636, outputSha256: 'f0b459a8682328c7fd9efa59fc21a1aa2defa9500a7c4a2d283ff7f899af63a7', outputTranscriptPolicy: 'canonical_gate_transcript_v2', resultCounts: { test_files_passed: 11, test_files_total: 11, tests_passed: 240, tests_total: 240 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation6-closure-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 63, outputSha256: '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17', outputTranscriptPolicy: 'canonical_gate_transcript_v2' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation6-closure-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 239, outputSha256: '156ea5b0586766b3d6eb53f58756a27d1073efad5603739072a685c8c3acce52', outputTranscriptPolicy: 'canonical_gate_transcript_v2', resultCounts: { test_files_passed: 26, test_files_total: 26, tests_passed: 429, tests_total: 429 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation6-closure-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 149, outputSha256: 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a', outputTranscriptPolicy: 'canonical_gate_transcript_v2' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation6-closure-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2183, outputSha256: '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', outputTranscriptPolicy: 'canonical_gate_transcript_v2', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation6-closure-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: '2daa5f2087db82b4bcd365d23672173731fe5ad834b0bd4482105481b8b5e59e', outputTranscriptPolicy: 'canonical_gate_transcript_v2', resultCounts: { manifest_entries_passed: 35, manifest_entries_total: 35 }, bootstrapManifestAttempt: true }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation7-closure-targeted-001', command: 'npm.cmd test -- tests/application-contracts.test.ts tests/multibroker-core-contracts.test.ts tests/mexc-readonly-transport.test.ts tests/mexc-readonly-probe.test.ts tests/mexc-egress-boundary.test.ts tests/mexc-oracles.test.ts tests/mexc-pagination.test.ts tests/mexc-capture-orchestrator.test.ts tests/mexc-capture-runtime.test.ts tests/mexc-readonly-adapter.test.ts tests/mexc-central-network-transport.test.ts', result: 'pass', outputBytes: 636, outputSha256: 'bad1a49df924d41de9a82912a86ed3f108423d6af71245cf928fe38028e91776', outputTranscriptPolicy: 'canonical_gate_transcript_v2', resultCounts: { test_files_passed: 11, test_files_total: 11, tests_passed: 244, tests_total: 244 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation7-closure-typecheck-001', command: 'npm.cmd run typecheck', result: 'pass', outputBytes: 63, outputSha256: '8fdcec4087966dd38af8fcd84fa03e08088dd4b0a599f1f3d5dc87a931ea9e17', outputTranscriptPolicy: 'canonical_gate_transcript_v2' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation7-closure-full-001', command: 'npm.cmd test', result: 'pass', outputBytes: 239, outputSha256: '6f6d65ddf6ca38c65d758b6a596ed98d3c1bcc6a53106d40c0f5a2e2a03750c1', outputTranscriptPolicy: 'canonical_gate_transcript_v2', resultCounts: { test_files_passed: 26, test_files_total: 26, tests_passed: 433, tests_total: 433 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation7-closure-release-001', command: 'npm.cmd run release:check', result: 'pass', outputBytes: 149, outputSha256: 'bd84e5259443e96ebff13807ed3ce463e1c86252d9167fdbd9850a86d911969a', outputTranscriptPolicy: 'canonical_gate_transcript_v2' }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation7-closure-build-001', command: 'npm.cmd run build', result: 'pass', outputBytes: 2183, outputSha256: '70dc6e49ebfb502b8ce8e8f0fcd3895ec30dab464d4f43a1fc49e0636bf3825c', outputTranscriptPolicy: 'canonical_gate_transcript_v2', resultCounts: { static_pages_generated: 3, static_pages_total: 3 } }),
  Object.freeze({ collection: 'candidate_attempts', id: 'mb1-remediation7-closure-manifest-001', command: 'node scripts/validate-multibroker-parity-manifest.mjs --allow-pending-manifest-attempt', result: 'pass_bootstrap_before_append_only_evidence_rehash', outputBytes: 91, outputSha256: '2daa5f2087db82b4bcd365d23672173731fe5ad834b0bd4482105481b8b5e59e', outputTranscriptPolicy: 'canonical_gate_transcript_v2', resultCounts: { manifest_entries_passed: 35, manifest_entries_total: 35 }, bootstrapManifestAttempt: true }),
])

const CURRENT_PENDING_BOOTSTRAP_ATTEMPT_ID = 'mb1-remediation7-closure-manifest-001'

export class ManifestValidationError extends Error {
  constructor(message) {
    super(`Multi-Broker-Paritätsmanifest ungültig: ${message}`)
    this.name = 'ManifestValidationError'
  }
}

function fail(message) {
  throw new ManifestValidationError(message)
}

function logicalPathKey(path) {
  return path.normalize('NFC').toLocaleLowerCase('en-US')
}

function assertCanonicalRepositoryPath(value, manifestPath) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')) {
    fail(`nichtkanonischer Pfad: ${JSON.stringify(value)}`)
  }
  if (value.includes(':') || isAbsolute(value) || posix.isAbsolute(value)) {
    fail(`absoluter Pfad oder Windows-ADS ist nicht zulässig: ${JSON.stringify(value)}`)
  }
  const normalized = posix.normalize(value)
  if (normalized !== value || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    fail(`Pfad verlässt den Repository-Root oder ist nicht normalisiert: ${value}`)
  }
  if (value === manifestPath) fail('das Manifest darf sich nicht selbst hashen')
  return value
}

function isWithinRoot(root, target) {
  const relation = relative(root, target)
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))
}

function statIdentity(stats) {
  return `${stats.dev}:${stats.ino}`
}

function sameStableStat(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

function createStableRepositoryReader(rootInput, manifestPath, hooks = {}) {
  const resolvedRoot = resolve(rootInput)
  const unresolvedRootStats = lstatSync(resolvedRoot, { bigint: true })
  if (!unresolvedRootStats.isDirectory() || unresolvedRootStats.isSymbolicLink()) {
    fail('Repository-Root ist kein reguläres physisches Verzeichnis')
  }
  const root = realpathSync.native(resolvedRoot)
  const rootStats = lstatSync(root, { bigint: true })
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) fail('Repository-Root ist kein reguläres physisches Verzeichnis')

  const cache = new Map()
  const logicalTargets = new Map()
  const physicalTargets = new Map()

  function inspectPhysicalPath(path) {
    const segments = path.split('/')
    let current = root
    for (const [index, segment] of segments.entries()) {
      current = resolve(current, segment)
      const stats = lstatSync(current, { bigint: true })
      if (stats.isSymbolicLink()) fail(`Symlink/Junction/Reparse-Point ist nicht zulässig: ${path}`)
      if (index < segments.length - 1 && !stats.isDirectory()) fail(`Parentkomponente ist kein Verzeichnis: ${path}`)
      if (index === segments.length - 1 && !stats.isFile()) fail(`Manifestpfad ist keine reguläre Datei: ${path}`)
      const real = realpathSync.native(current)
      if (!isWithinRoot(root, real)) fail(`physischer Pfad verlässt den Repository-Root: ${path}`)
    }
    return current
  }

  function read(pathInput, { allowManifest = false } = {}) {
    const path = allowManifest
      ? assertCanonicalRepositoryPath(pathInput, '__manifest_self_check_disabled__')
      : assertCanonicalRepositoryPath(pathInput, manifestPath)
    if (cache.has(path)) return cache.get(path)

    const logicalKey = logicalPathKey(path)
    const priorLogical = logicalTargets.get(logicalKey)
    if (priorLogical && priorLogical !== path) fail(`case-/Unicode-ambiger Zielpfad: ${priorLogical} / ${path}`)
    logicalTargets.set(logicalKey, path)

    const absolute = inspectPhysicalPath(path)
    const beforePathStats = lstatSync(absolute, { bigint: true })
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
    const descriptor = openSync(absolute, constants.O_RDONLY | noFollow)
    try {
      const beforeDescriptorStats = fstatSync(descriptor, { bigint: true })
      if (!beforeDescriptorStats.isFile()) fail(`geöffneter Descriptor ist keine reguläre Datei: ${path}`)
      if (beforeDescriptorStats.nlink !== 1n) fail(`Hardlink/physischer Alias ist nicht zulässig: ${path}`)
      if (statIdentity(beforePathStats) !== statIdentity(beforeDescriptorStats)) fail(`Dateiidentität wechselte vor dem Read: ${path}`)

      hooks.afterOpen?.({ path, absolute, descriptor })
      const raw = Buffer.from(readFileSync(descriptor))
      hooks.afterRead?.({ path, absolute, descriptor, raw: Buffer.from(raw) })

      const afterDescriptorStats = fstatSync(descriptor, { bigint: true })
      const afterPathLstat = lstatSync(absolute, { bigint: true })
      if (afterPathLstat.isSymbolicLink() || !afterPathLstat.isFile()) fail(`Dateityp wechselte während des Reads: ${path}`)
      const afterPathStats = statSync(absolute, { bigint: true })
      const afterRealPath = realpathSync.native(absolute)
      if (!isWithinRoot(root, afterRealPath)) fail(`physischer Pfad verließ während des Reads den Repository-Root: ${path}`)
      if (!sameStableStat(beforeDescriptorStats, afterDescriptorStats)) fail(`Datei wurde während des Reads verändert: ${path}`)
      if (statIdentity(afterPathStats) !== statIdentity(afterDescriptorStats)) fail(`Pfadziel wechselte während des Reads: ${path}`)

      const physicalKey = statIdentity(afterDescriptorStats)
      const priorPhysical = physicalTargets.get(physicalKey)
      if (priorPhysical && priorPhysical !== path) fail(`mehrere Manifestpfade zeigen auf dieselbe physische Datei: ${priorPhysical} / ${path}`)
      physicalTargets.set(physicalKey, path)

      if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
        fail(`UTF-8-BOM ist nicht zulässig: ${path}`)
      }
      let text
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(raw)
      } catch {
        fail(`Datei ist kein gültiges UTF-8: ${path}`)
      }
      const canonical = Buffer.from(text.replace(/\r\n?/g, '\n'), 'utf8')
      const record = Object.freeze({
        path,
        absolute,
        realPath: afterRealPath,
        canonical,
        sha256: createHash('sha256').update(canonical).digest('hex'),
        canonicalUtf8Bytes: canonical.length,
        physicalKey,
        stableStats: afterDescriptorStats,
      })
      cache.set(path, record)
      return record
    } finally {
      closeSync(descriptor)
    }
  }

  function assertStable() {
    const finalUnresolvedRootStats = lstatSync(resolvedRoot, { bigint: true })
    if (!finalUnresolvedRootStats.isDirectory()
      || finalUnresolvedRootStats.isSymbolicLink()
      || !sameStableStat(unresolvedRootStats, finalUnresolvedRootStats)
      || realpathSync.native(resolvedRoot) !== root) {
      fail('Repository-Root wechselte während der Validierung')
    }
    const finalRootStats = lstatSync(root, { bigint: true })
    if (!finalRootStats.isDirectory() || finalRootStats.isSymbolicLink() || !sameStableStat(rootStats, finalRootStats)) {
      fail('physischer Repository-Root wechselte während der Validierung')
    }
    for (const record of cache.values()) {
      const absolute = inspectPhysicalPath(record.path)
      const finalPathLstat = lstatSync(absolute, { bigint: true })
      if (absolute !== record.absolute || finalPathLstat.isSymbolicLink() || !finalPathLstat.isFile()) {
        fail(`Dateityp oder Pfad wechselte nach dem Read: ${record.path}`)
      }
      const finalPathStats = statSync(absolute, { bigint: true })
      const finalRealPath = realpathSync.native(absolute)
      if (finalRealPath !== record.realPath
        || !isWithinRoot(root, finalRealPath)
        || statIdentity(finalPathStats) !== record.physicalKey
        || !sameStableStat(record.stableStats, finalPathStats)) {
        fail(`Datei wurde nach dem Read verändert oder ausgetauscht: ${record.path}`)
      }
    }
  }

  return Object.freeze({ read, assertStable, root })
}

function parseManifest(reader, manifestPath) {
  const manifest = reader.read(manifestPath, { allowManifest: true }).canonical.toString('utf8')
  const entries = new Map()
  const logicalKeys = new Map()
  for (const [index, line] of manifest.split('\n').entries()) {
    if (!line || line.startsWith('#')) continue
    const match = /^([a-f0-9]{64})  lf:(.+)$/.exec(line)
    if (!match) fail(`Syntaxfehler in Manifestzeile ${index + 1}`)
    const [, expectedHash, rawPath] = match
    const path = assertCanonicalRepositoryPath(rawPath, manifestPath)
    const key = logicalPathKey(path)
    if (logicalKeys.has(key)) fail(`doppelter logischer Manifestpfad: ${path}`)
    logicalKeys.set(key, path)
    entries.set(path, expectedHash)
  }
  if (!entries.size) fail('keine Hash-Einträge gefunden')
  return entries
}

function exactSet(actual, expected, label) {
  const missing = [...expected].filter((value) => !actual.has(value))
  const unexpected = [...actual].filter((value) => !expected.has(value))
  if (missing.length || unexpected.length) {
    fail(`${label} ist nicht exakt geschlossen; fehlend=${missing.join(',') || '-'}; zusätzlich=${unexpected.join(',') || '-'}`)
  }
}

function uniqueCanonicalPaths(values, manifestPath, label) {
  if (!Array.isArray(values)) fail(`${label} ist kein Array`)
  const paths = new Set()
  const logical = new Set()
  for (const value of values) {
    const path = value === manifestPath
      ? assertCanonicalRepositoryPath(value, '__manifest_self_check_disabled__')
      : assertCanonicalRepositoryPath(value, manifestPath)
    const key = logicalPathKey(path)
    if (logical.has(key)) fail(`${label} enthält einen doppelten logischen Pfad: ${path}`)
    logical.add(key)
    paths.add(path)
  }
  return paths
}

function parseIsoInstantTicks(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?Z$/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = ''] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const instant = new Date(0)
  instant.setUTCHours(0, 0, 0, 0)
  instant.setUTCFullYear(year, month - 1, day)
  instant.setUTCHours(hour, minute, second, 0)
  if (!Number.isFinite(instant.getTime())
    || instant.getUTCFullYear() !== year
    || instant.getUTCMonth() !== month - 1
    || instant.getUTCDate() !== day
    || instant.getUTCHours() !== hour
    || instant.getUTCMinutes() !== minute
    || instant.getUTCSeconds() !== second) {
    return null
  }
  const fractionalTicks = BigInt(fractionText.padEnd(7, '0') || '0')
  return BigInt(instant.getTime()) * BigInt(10_000) + fractionalTicks
}

function isIsoInstant(value) {
  return parseIsoInstantTicks(value) !== null
}

function exactScalarRecord(actual, expected) {
  if (expected === undefined) return actual === undefined
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false
  const actualKeys = Object.keys(actual).sort()
  const expectedKeys = Object.keys(expected).sort()
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key])
}

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (!value || typeof value !== 'object') return '__invalid__'
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
}

function exactJsonValue(actual, expected) {
  return canonicalJson(actual) === canonicalJson(expected)
}

function validateAttemptCollections(evidence, allowPendingManifestAttempt) {
  const attemptsByCollection = new Map()
  const allIds = new Set()
  let latestEndedAtTicks = null
  for (const collection of ['baseline_attempts', 'candidate_attempts']) {
    const attempts = evidence[collection]
    if (!Array.isArray(attempts)) fail(`${collection} ist kein Array`)
    const byId = new Map()
    for (const attempt of attempts) {
      if (!attempt || typeof attempt !== 'object') fail(`${collection} enthält keinen Objekt-Attempt`)
      if (typeof attempt.attempt_id !== 'string' || !attempt.attempt_id) fail(`${collection} enthält keine gültige Attempt-ID`)
      if (allIds.has(attempt.attempt_id)) fail(`Attempt-ID ist nicht global eindeutig: ${attempt.attempt_id}`)
      allIds.add(attempt.attempt_id)
      byId.set(attempt.attempt_id, attempt)
      if (attempt.command !== null && (typeof attempt.command !== 'string' || !attempt.command)) {
        fail(`Attempt enthält weder einen exakten Befehl noch explizites null: ${attempt.attempt_id}`)
      }
      if (typeof attempt.result !== 'string' || !attempt.result) fail(`Attempt enthält kein Ergebnis: ${attempt.attempt_id}`)
      const startedAtTicks = parseIsoInstantTicks(attempt.started_at_utc)
      const endedAtTicks = parseIsoInstantTicks(attempt.ended_at_utc)
      if (attempt.started_at_utc !== null && startedAtTicks === null) fail(`Attempt-Startzeit ist ungültig: ${attempt.attempt_id}`)
      if (attempt.ended_at_utc !== null && endedAtTicks === null) fail(`Attempt-Endzeit ist ungültig: ${attempt.attempt_id}`)
      if (startedAtTicks !== null && endedAtTicks !== null && startedAtTicks > endedAtTicks) {
        fail(`Attempt-Zeitfolge ist ungültig: ${attempt.attempt_id}`)
      }
      if (endedAtTicks !== null && (latestEndedAtTicks === null || endedAtTicks > latestEndedAtTicks)) {
        latestEndedAtTicks = endedAtTicks
      }
      if (attempt.exit_code !== null && !Number.isSafeInteger(attempt.exit_code)) fail(`Attempt-Exitcode ist ungültig: ${attempt.attempt_id}`)
      if (attempt.stdout_stderr_utf8_bytes !== null
        && (!Number.isSafeInteger(attempt.stdout_stderr_utf8_bytes) || attempt.stdout_stderr_utf8_bytes < 0)) {
        fail(`Attempt-Outputbytezahl ist ungültig: ${attempt.attempt_id}`)
      }
      if (attempt.stdout_stderr_sha256 !== null
        && (typeof attempt.stdout_stderr_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(attempt.stdout_stderr_sha256))) {
        fail(`Attempt-Outputhash ist ungültig: ${attempt.attempt_id}`)
      }
      const hasMissingEvidence = [
        attempt.command,
        attempt.started_at_utc,
        attempt.ended_at_utc,
        attempt.exit_code,
        attempt.stdout_stderr_utf8_bytes,
        attempt.stdout_stderr_sha256,
      ].some((value) => value === null)
      if (hasMissingEvidence && typeof attempt.evidence_loss_reason !== 'string' && typeof attempt.evidence_wrapper_error !== 'string') {
        fail(`Attempt mit Nullfeldern enthält keinen Evidenzverlustgrund: ${attempt.attempt_id}`)
      }
      if (attempt.output_transcript_policy !== undefined && attempt.output_transcript_policy !== null
        && (typeof attempt.output_transcript_policy !== 'string'
          || !(attempt.output_transcript_policy in EXPECTED_GATE_TRANSCRIPT_POLICIES))) {
        fail(`Attempt referenziert eine unbekannte Transcript-Policy: ${attempt.attempt_id}`)
      }
    }
    attemptsByCollection.set(collection, byId)
  }

  for (const contract of REQUIRED_GATE_ATTEMPTS) {
    const attempt = attemptsByCollection.get(contract.collection)?.get(contract.id)
    if (!attempt && contract.id === CURRENT_PENDING_BOOTSTRAP_ATTEMPT_ID && allowPendingManifestAttempt) continue
    if (!attempt) fail(`verbindlicher Gate-Attempt fehlt: ${contract.id}`)
    if (attempt.command !== contract.command
      || attempt.result !== contract.result
      || attempt.exit_code !== 0
      || attempt.stdout_stderr_utf8_bytes !== contract.outputBytes
      || attempt.stdout_stderr_sha256 !== contract.outputSha256
      || attempt.output_transcript_policy !== contract.outputTranscriptPolicy
      || !exactScalarRecord(attempt.result_counts, contract.resultCounts)) {
      fail(`Gate-Attempt weicht von den exakten Snapshotpins ab: ${contract.id}`)
    }
    if (!isIsoInstant(attempt.started_at_utc) || !isIsoInstant(attempt.ended_at_utc)) fail(`Gate-Attempt besitzt keine vollständigen Zeiten: ${contract.id}`)
    if (!Number.isSafeInteger(attempt.stdout_stderr_utf8_bytes) || attempt.stdout_stderr_utf8_bytes < 1
      || typeof attempt.stdout_stderr_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(attempt.stdout_stderr_sha256)) {
      fail(`Gate-Attempt besitzt keine hashgebundene Ausgabe: ${contract.id}`)
    }
  }
  return latestEndedAtTicks
}

function validateEvidence(reader, entries, manifestPath, allowPendingManifestAttempt) {
  const evidenceRecord = reader.read(EVIDENCE_PATH)
  let evidence
  try {
    evidence = JSON.parse(evidenceRecord.canonical.toString('utf8'))
  } catch {
    fail('Evidence ist kein gültiges JSON')
  }
  if (evidence.schema_version !== 'equora_multi_broker_parity_evidence_v1') fail('unerwartete Evidence-Schemaversion')
  if (evidence.evidence_format_version !== 1) fail('unerwartete Evidence-Formatversion')
  if (evidence.phase !== 'MB1') fail('unerwartete Evidence-Phase')
  if (!isIsoInstant(evidence.generated_at_utc)) fail('Evidence besitzt keinen kanonischen UTC-Erzeugungszeitpunkt')
  if (evidence.canonical_hash_policy?.manifest_entry_prefix !== 'lf:') fail('Evidence und Manifest verwenden nicht dieselbe Kanonisierung')
  if (evidence.canonical_hash_policy?.manifest_path !== manifestPath) fail('Evidence bindet einen anderen Manifestpfad')
  if (!Number.isSafeInteger(evidence.canonical_hash_policy?.manifest_entry_count)) fail('Evidence enthält keinen gültigen Manifestcount')

  const toolchain = evidence.toolchain
  for (const [field, expected] of Object.entries(EXPECTED_TOOLCHAIN)) {
    if (toolchain?.[field] !== expected) fail(`Evidence-Toolchain-Pin weicht ab: ${field}`)
  }
  if (typeof toolchain.docker_client_observation !== 'string' || !toolchain.docker_client_observation) {
    fail('Docker-Clientbeobachtung fehlt')
  }
  const ciWorkflow = reader.read('.github/workflows/ci.yml').canonical.toString('utf8')
  const ciNodeMatches = [...ciWorkflow.matchAll(/node-version:\s*['"]?([^'"\s]+)/g)].map((match) => match[1])
  if (!ciNodeMatches.length || ciNodeMatches.some((value) => value !== toolchain.ci_node)) {
    fail('CI-Workflow und Evidence enthalten unterschiedliche Node-Pins')
  }

  const baselineCounts = evidence.expected_baseline_counts
  const currentBaseline = evidence.current_mb1_baseline_evidence
  const candidateCounts = evidence.candidate_counts
  if (evidence.ci_evidence?.evidence_scope !== EXPECTED_BASELINE_EVIDENCE.historical_ci_scope
    || evidence.ci_evidence?.commit !== EXPECTED_BASELINE_EVIDENCE.historical_commit
    || baselineCounts?.evidence_scope !== EXPECTED_BASELINE_EVIDENCE.historical_scope
    || baselineCounts?.commit !== EXPECTED_BASELINE_EVIDENCE.historical_commit
    || baselineCounts?.test_files !== EXPECTED_COUNTS.baseline_test_files
    || baselineCounts?.tests !== EXPECTED_COUNTS.baseline_tests
    || baselineCounts?.audit_all_vulnerabilities !== EXPECTED_COUNTS.baseline_audit_all_vulnerabilities
    || baselineCounts?.audit_production_vulnerabilities !== EXPECTED_COUNTS.baseline_audit_production_vulnerabilities
    || currentBaseline?.evidence_scope !== EXPECTED_BASELINE_EVIDENCE.integrated_scope
    || currentBaseline?.commit !== EXPECTED_BASELINE_EVIDENCE.integrated_commit
    || currentBaseline?.tree !== EXPECTED_BASELINE_EVIDENCE.integrated_tree
    || currentBaseline?.test_files !== EXPECTED_BASELINE_EVIDENCE.integrated_test_files
    || currentBaseline?.tests !== EXPECTED_BASELINE_EVIDENCE.integrated_tests
    || currentBaseline?.current_ci_status !== EXPECTED_BASELINE_EVIDENCE.current_ci_status
    || candidateCounts?.test_files !== EXPECTED_COUNTS.candidate_test_files
    || candidateCounts?.tests !== EXPECTED_COUNTS.candidate_tests
    || candidateCounts?.new_contract_test_files !== EXPECTED_COUNTS.contract_test_files
    || candidateCounts?.new_contract_tests !== EXPECTED_COUNTS.contract_tests
    || candidateCounts?.audit_all_vulnerabilities !== EXPECTED_COUNTS.candidate_audit_all_vulnerabilities
    || candidateCounts?.audit_production_vulnerabilities !== EXPECTED_COUNTS.candidate_audit_production_vulnerabilities
    || candidateCounts?.audit_status !== EXPECTED_COUNTS.candidate_audit_status) {
    fail('Evidence-Test-/Auditcounts weichen von den Snapshotpins ab')
  }
  if (!exactJsonValue(evidence.gate_transcript_policies, EXPECTED_GATE_TRANSCRIPT_POLICIES)) {
    fail('Evidence-Transcript-Policy weicht vom exakten kanonischen Vertrag ab')
  }
  const latestAttemptEndTicks = validateAttemptCollections(evidence, allowPendingManifestAttempt)
  const generatedAtTicks = parseIsoInstantTicks(evidence.generated_at_utc)
  if (generatedAtTicks === null || (latestAttemptEndTicks !== null && generatedAtTicks < latestAttemptEndTicks)) {
    fail('Evidence-Erzeugungszeitpunkt liegt vor einem eingebetteten Attempt-Ende')
  }

  if (!Array.isArray(evidence.normative_inputs) || !evidence.normative_inputs.length) fail('Evidence enthält keine normativen Inputs')
  const normativePaths = new Set()
  const normativeLogical = new Set()
  for (const input of evidence.normative_inputs) {
    const path = assertCanonicalRepositoryPath(input?.path, manifestPath)
    const logicalKey = logicalPathKey(path)
    if (normativeLogical.has(logicalKey)) fail(`Evidence enthält einen doppelten normativen Pfad: ${path}`)
    normativeLogical.add(logicalKey)
    normativePaths.add(path)
    const record = reader.read(path)
    if (entries.get(path) !== input.sha256 || record.sha256 !== input.sha256) fail(`Evidence-/Manifest-Hash weicht ab: ${path}`)
    if (record.canonicalUtf8Bytes !== input.canonical_utf8_bytes) fail(`Evidence-Bytezahl weicht ab: ${path}`)
  }

  const expectedManifestPaths = new Set([...normativePaths, EVIDENCE_PATH])
  exactSet(new Set(entries.keys()), expectedManifestPaths, 'Manifest/Evidence-Menge')
  if (entries.size !== evidence.canonical_hash_policy.manifest_entry_count) fail('Evidence-Manifestcount stimmt nicht mit der tatsächlichen Menge überein')

  for (const path of REQUIRED_NORMATIVE_PATHS) {
    if (!normativePaths.has(path)) fail(`verbindlicher normativer Pfad fehlt: ${path}`)
  }
  const parityPaths = uniqueCanonicalPaths(evidence.parity_matrix, manifestPath, 'parity_matrix')
  exactSet(parityPaths, new Set(REQUIRED_PARITY_PATHS), 'Paritätspfad-Menge')
  for (const path of parityPaths) {
    if (!normativePaths.has(path)) fail(`Paritätspfad ist nicht normativ gebunden: ${path}`)
  }

  const candidateScope = uniqueCanonicalPaths(evidence.candidate_scope, manifestPath, 'candidate_scope')
  exactSet(candidateScope, new Set(REQUIRED_CANDIDATE_SCOPE), 'Candidate-Scope')
  for (const path of candidateScope) {
    if (path !== manifestPath && path !== EVIDENCE_PATH && !normativePaths.has(path)) {
      fail(`Candidate-Scope-Pfad ist nicht normativ gebunden: ${path}`)
    }
  }
}

export function validateMultibrokerParityManifest(options = {}) {
  const root = options.root ?? process.cwd()
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH
  assertCanonicalRepositoryPath(manifestPath, '__manifest_self_check_disabled__')
  if (manifestPath !== DEFAULT_MANIFEST_PATH) fail('unerwarteter Manifestpfad')
  const reader = createStableRepositoryReader(root, manifestPath, options.hooks)
  const entries = parseManifest(reader, manifestPath)

  for (const [path, expectedHash] of entries) {
    const record = reader.read(path)
    if (record.sha256 !== expectedHash) fail(`SHA-256-Abweichung für ${path}`)
  }
  validateEvidence(reader, entries, manifestPath, options.allowPendingManifestAttempt === true)
  reader.assertStable()
  return Object.freeze({ validated: entries.size, total: entries.size })
}

function runCli() {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--allow-pending-manifest-attempt')) fail(`unbekanntes CLI-Argument: ${args.join(' ')}`)
  const result = validateMultibrokerParityManifest({
    allowPendingManifestAttempt: args.includes('--allow-pending-manifest-attempt'),
  })
  console.log(`Multi-Broker-Paritätsmanifest PASS: ${result.validated}/${result.total} kanonische UTF-8/LF-Artefakte stimmen überein.`)
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
if (invokedPath === resolve(fileURLToPath(import.meta.url))) runCli()

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase', 'schema-patch-v57.60.1.sql'), 'utf8')
const capturePersistenceSql = readFileSync(
  join(process.cwd(), 'supabase', 'schema-patch-v57.61.0.sql'),
  'utf8',
)
const captureControlSql = readFileSync(
  join(process.cwd(), 'supabase', 'schema-patch-v57.61.0-g1-capture-control.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const captureIntegrationSql = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'broker-capture-persistence.integration.sql'),
  'utf8',
)
const outcomeConcurrencyScript = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-broker-capture-outcome-concurrency.ps1'),
  'utf8',
)
const laneAuthoritySql = readFileSync(
  join(process.cwd(), 'supabase', 'schema-patch-v57.61.0-g1-lane-authority.sql'),
  'utf8',
)
const laneHealthIntegrationSql = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'broker-capture-lane-health.integration.sql'),
  'utf8',
)
const laneHealthRunner = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-broker-capture-lane-health.ps1'),
  'utf8',
)
const activationAuthoritySql = readFileSync(
  join(process.cwd(), 'supabase', 'schema-patch-v57.61.0-g1-activation-authority.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const activationAuthorityIntegrationSql = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'broker-capture-activation-authority.integration.sql'),
  'utf8',
)
const activationAuthorityRunner = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-broker-capture-activation-authority.ps1'),
  'utf8',
)
const activationAuthorityConcurrencyRunner = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-broker-capture-activation-authority-concurrency.ps1'),
  'utf8',
)
const activationAuthorityDriftRunner = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-broker-capture-activation-authority-drift.ps1'),
  'utf8',
)
const schedulerControlSql = readFileSync(
  join(process.cwd(), 'supabase', 'schema-patch-v57.61.0-g1-scheduler-control.sql'),
  'utf8',
).replace(/\r\n/g, '\n')
const brokerCaptureSchedulerTs = readFileSync(
  join(process.cwd(), 'lib', 'server', 'broker-capture-scheduler.ts'),
  'utf8',
)
const schedulerControlIntegrationSql = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'broker-capture-scheduler-control.integration.sql'),
  'utf8',
)
const schedulerControlRunner = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-broker-capture-scheduler-control.ps1'),
  'utf8',
)
const runtimeDeploymentSql = readFileSync(
  join(process.cwd(), 'supabase', 'schema-patch-v57.61.0-g1-runtime-deployment.sql'),
  'utf8',
)
const runtimeDeploymentIntegrationSql = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'broker-capture-runtime-deployment.integration.sql'),
  'utf8',
)
const runtimeDeploymentPostflightSql = readFileSync(
  join(
    process.cwd(),
    'tests',
    'sql',
    'broker-capture-runtime-deployment-postflight.integration.sql',
  ),
  'utf8',
)
const deploymentDriverSql = readFileSync(
  join(process.cwd(), 'supabase', 'deploy-v57.61.0.sql'),
  'utf8',
)
const deploymentPreflightSql = readFileSync(
  join(process.cwd(), 'supabase', 'preflight-v57.61.0.sql'),
  'utf8',
)
const deploymentPostflightSql = readFileSync(
  join(process.cwd(), 'supabase', 'postflight-v57.61.0.sql'),
  'utf8',
)
const deploymentBaselineVerifierSql = readFileSync(
  join(process.cwd(), 'supabase', 'verify-v57.60.1-baseline.sql'),
  'utf8',
)
const restoredCredentialAclRepairSourceSql = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'assert-v57.60.1-restored-credential-acl-repair-source.sql',
  ),
  'utf8',
)
const restoredCredentialAclRepairSql = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'repair-v57.60.1-restored-credential-acl.sql',
  ),
  'utf8',
)
const deploymentContractVerifierSql = readFileSync(
  join(process.cwd(), 'supabase', 'verify-v57.61.0-contract.sql'),
  'utf8',
)
const deploymentDriftRunner = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-v57.61.0-deployment-drift.ps1'),
  'utf8',
)
const constraintTriggerDriftRunner = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-v57.61.0-constraint-trigger-drift.ps1'),
  'utf8',
)
const hostedSupabaseFixtureSql = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'equora-hosted-supabase-v17-stubs.sql'),
  'utf8',
)
const hostedSupabaseCompatRunner = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-v57.61.0-hosted-supabase-compat.ps1'),
  'utf8',
)
const restoredV57601FixtureSql = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'equora-restored-v57601-upgrade-fixture.sql'),
  'utf8',
)
const restoredV57601UpgradeRunner = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-v57.61.0-restored-v57601-upgrade.ps1'),
  'utf8',
)
const allLocalSqlRunner = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-v57.61.0-all-local.ps1'),
  'utf8',
)
const schedulerConcurrencyRunner = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-broker-capture-scheduler-concurrency.ps1'),
  'utf8',
)
const schedulerDriftRunner = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-broker-capture-scheduler-drift.ps1'),
  'utf8',
)
const pageReplayConcurrencyRunner = readFileSync(
  join(process.cwd(), 'tests', 'sql', 'run-broker-capture-page-replay-concurrency.ps1'),
  'utf8',
)
const schedulerSource = readFileSync(
  join(process.cwd(), 'lib', 'server', 'broker-capture-scheduler.ts'),
  'utf8',
)
const capturePersistenceSource = readFileSync(
  join(process.cwd(), 'lib', 'server', 'broker-capture-persistence.ts'),
  'utf8',
)
const captureControlSource = readFileSync(
  join(process.cwd(), 'lib', 'server', 'broker-capture-control.ts'),
  'utf8',
)

describe('v57.60.1 database contracts', () => {
  it('makes journal media private and owner-scoped', () => {
    expect(sql).toContain("set public = false")
    expect(sql).toContain("(storage.foldername(name))[1] = (select auth.uid()::text)")
    expect(sql).toContain('media_cleanup_outbox')
    expect(sql).toContain('equora_owned_media_path_v1')
    expect(sql).toContain('equora_has_pending_upload_intent_v1')
    expect(sql).toContain('equora_register_media_upload_intents_v1')
    expect(sql).toContain('UPLOAD_INTENT_QUOTA_EXCEEDED')
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('not_before')
  })

  it('provides atomic graph mutations for trade, setup, import and undo', () => {
    for (const functionName of [
      'equora_create_trade_v1',
      'equora_update_trade_v1',
      'equora_upsert_trade_media_v1',
      'equora_remove_trade_media_v1',
      'equora_delete_trade_v1',
      'equora_save_setup_v1',
      'equora_delete_setup_v1',
      'equora_import_trades_v1',
      'equora_revert_import_v1',
      'equora_add_trade_tags_v1',
      'equora_replace_trade_tags_v1',
      'equora_bulk_add_trade_tag_v1',
      'equora_accept_setup_suggestion_v1',
      'equora_save_review_session_v1',
      'equora_create_broker_connection_service_v1',
    ]) {
      expect(sql).toContain(`function public.${functionName}`)
    }
  })

  it('enforces currency and credential deletion boundaries', () => {
    expect(sql).toContain('trades_monetary_values_require_currency_v57601')
    expect(sql).toContain("('EUR', 'USD', 'GBP', 'USDT', 'USDC')")
    expect(sql).toContain('function public.delete_own_broker_connection')
    expect(sql).toContain('on delete restrict')
    expect(sql).toContain('revoke all on function public.delete_own_broker_connection')
    expect(sql).toContain('review_sessions_monetary_scope_v57601')
    expect(sql).toContain("monetary_scope_kind = 'single'")
  })

  it('does not expose the private credential table through an RLS client policy', () => {
    expect(sql).not.toMatch(/create\s+policy[\s\S]{0,160}on\s+public\.broker_credentials/i)
  })

  it('hardens import batches and browser broker writes behind RPC boundaries', () => {
    expect(sql).toContain('alter table public.trade_import_batches enable row level security')
    expect(sql).toContain('alter table public.trade_import_batches alter column user_id set not null')
    expect(sql).toContain('revoke insert, update, delete on table public.trade_import_batches')
    expect(sql).toContain('revoke insert, update, delete on table public.broker_connections')
  })

  it('blocks destructive legacy media migration until scalar URLs are reconciled', () => {
    expect(sql).toContain('LEGACY_TRADE_MEDIA_RECONCILIATION_REQUIRED')
    expect(sql).toContain('LEGACY_SETUP_MEDIA_RECONCILIATION_REQUIRED')
    expect(sql).toContain('LEGACY_SHARED_MEDIA_RECONCILIATION_REQUIRED')
    expect(sql).toContain('parent_trade.user_id = media.user_id')
    expect(sql).toContain('parent_setup.user_id = media.user_id')
    expect(sql).toContain('trade_media_parent_owner_v57601')
    expect(sql).toContain('setup_media_parent_owner_v57601')
  })
})

describe('v57.61.0 local broker capture control contracts', () => {
  it('is additive, marker-bound and keeps capture authority blocked', () => {
    expect(captureControlSql).toContain('CONTROL_MIGRATION_BASE_NOT_APPLIED')
    expect(captureControlSql).toContain('CONTROL_MIGRATION_PREEXISTING_PARTIAL_SCHEMA')
    expect(captureControlSql).toContain('equora_v57.61.0_g1_capture_control_v1')
    expect(captureControlSql).toMatch(/broker_capture_work_units_claim_state_check check \(\([\s\S]+claim_policy_version is not null[\s\S]+\) is true\)/)
    expect(captureControlSql).toMatch(/broker_capture_work_units_error_state_check check \(\([\s\S]+last_error_code is not null[\s\S]+\) is true\)/)
    expect(captureControlSql).toMatch(/broker_capture_attempt_outcomes_terminal_reason_check[\s\S]+terminal_reason is not null[\s\S]+\) is true\)/)
    expect(captureControlSql).toContain('CONTROL_MIGRATION_OUTCOME_STATE_INVALID')
    expect(captureControlSql).toContain('346216e2ac304bfc69495dacb75ea7efd01abb4cf3859fd32dd923d073dcd3ba')
    expect(captureControlSql).toContain('pg_get_constraintdef(constraint_row.oid, true)')
    expect(captureIntegrationSql).toContain('TEST_CONTROL_CLAIM_MIXED_NULL_WAS_ACCEPTED')
    expect(captureIntegrationSql).toContain('TEST_CONTROL_ERROR_MIXED_NULL_WAS_ACCEPTED')
    expect(captureIntegrationSql).toContain('TEST_CONTROL_MIXED_NULL_REJECTION_LEFT_PARTIAL_STATE')
    expect(captureIntegrationSql).toContain('TEST_CONTROL_TERMINAL_FAILED_NULL_REASON_WAS_ACCEPTED')
    expect(captureIntegrationSql).toContain('TEST_CONTROL_PARTIAL_FAILED_NULL_REASON_WAS_ACCEPTED')
    expect(captureIntegrationSql).toContain('TEST_CONTROL_OUTCOME_REASON_REJECTION_LEFT_PARTIAL_STATE')
    expect(captureControlSql).toContain("'authorityBlocked', true")
    expect(captureControlSql).not.toMatch(/insert\s+into\s+public\.trades/i)
    expect(captureControlSql).not.toMatch(/update\s+public\.trades/i)
    expect(captureControlSql).not.toMatch(/delete\s+from\s+public\.trades/i)
  })

  it('requires honest read-only evidence and a GET-only provider capability', () => {
    expect(captureControlSql).toContain('mexc_permission_evidence_v1')
    expect(captureControlSql).toContain('official_docs_plus_support_statement_2026-08-05')
    expect(captureControlSql).toContain('read_only_user_attested')
    expect(captureControlSql).toContain("'technicallyDetectedWritePermissions'")
    expect(captureControlSql).toContain("->> 'method' is distinct from 'GET'")
    expect(captureControlSql).toContain('broker_providers_mexc_get_only_capabilities_check')
    expect(captureControlSql).toContain("capability.version_value is distinct from 'v1'")
    expect(captureIntegrationSql).toContain('TEST_MEXC_PROVIDER_MISSING_CAPABILITY_WAS_ACCEPTED')
    expect(captureIntegrationSql).toContain('TEST_MEXC_PROVIDER_MISSING_METHOD_WAS_ACCEPTED')
    expect(captureControlSql).toContain('CONTROL_PERMISSION_EVIDENCE_INVALID')
    expect(captureControlSql).not.toContain('Order Placing')
  })

  it('keeps claim and failure RPCs service-role-only with bounded lock time', () => {
    expect(captureControlSql).toContain('equora_claim_broker_capture_work_unit_v1')
    expect(captureControlSql).toContain('equora_record_broker_capture_failure_v1')
    expect(captureControlSql).toContain("set lock_timeout = '2s'")
    expect(captureControlSql).toContain("set statement_timeout = '10s'")
    expect(captureControlSql).toMatch(/grant execute on function public\.equora_claim_broker_capture_work_unit_v1[\s\S]+to service_role;/)
    expect(captureControlSql).toMatch(/grant execute on function public\.equora_record_broker_capture_failure_v1[\s\S]+to service_role;/)
    expect(captureControlSql).not.toMatch(/grant execute on function public\.equora_(?:claim|record)_broker_capture_[\s\S]+to authenticated;/)
  })

  it('persists only sanitized failure outcomes and revokes direct table access', () => {
    const signatureStart = captureControlSql.indexOf(
      'create or replace function public.equora_record_broker_capture_failure_v1',
    )
    const signatureEnd = captureControlSql.indexOf(') returns jsonb', signatureStart)
    const failureSignature = captureControlSql.slice(signatureStart, signatureEnd)

    expect(signatureStart).toBeGreaterThan(-1)
    expect(signatureEnd).toBeGreaterThan(signatureStart)
    expect(failureSignature).not.toMatch(/raw_body|raw_payload|provider_message|api_key|secret_key|encrypted_payload/i)
    expect(failureSignature).not.toMatch(/outcome_status|retry_not_before/i)
    expect(failureSignature).toContain('p_expected_checkpoint_mac text')
    expect(failureSignature).toContain('p_expected_capability_id text')
    expect(failureSignature).toContain('p_expected_page_scope_digest text')
    expect(failureSignature).toContain('p_request_duration_ms integer')
    expect(captureControlSql).toContain('broker_capture_attempt_outcomes')
    expect(captureControlSql).toContain('broker_capture_attempt_outcomes_work_attempt_unique')
    expect(captureControlSql).toContain('revoke all on table public.broker_capture_attempt_outcomes')
  })

  it('revalidates time-bound lease and integrity-key authority after blocking locks', () => {
    expect(captureControlSql).toContain('v_integrity_key.valid_to <= v_now')
    expect(captureControlSql).toContain('CONTROL_INTEGRITY_KEY_INACTIVE')
    expect(captureControlSql).toContain('v_work_unit.lease_expires_at <= v_now')
    expect(captureControlSql.match(/v_now := clock_timestamp\(\);/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('derives retry and scope truth from the authenticated checkpoint and local evidence grain', () => {
    expect(captureControlSql).toContain('public.equora_mexc_checkpoint_mac_v1')
    expect(captureControlSql).toContain("v_retryable := p_failure_code in (\n    'rate_limited', 'provider_busy', 'provider_unavailable', 'timeout'")
    expect(captureControlSql).toContain("when p_failure_code = 'maintenance' then 'provider_retry_deferred'")
    expect(captureControlSql).toContain("v_terminal_reason := 'claim_attempt_budget_reached'")
    expect(captureControlSql).toContain('from public.broker_provider_request_results')
    expect(captureControlSql).toContain("when v_scope_has_valid_result then 'partial'")
    expect(captureControlSql).toContain("else 'failed'")
  })

  it('validates one canonical request checkpoint before claim or failure mutation', () => {
    expect(captureControlSql).toContain('equora_mexc_request_checkpoint_valid_v1')
    expect(captureControlSql).toContain("p_expected_capability_id = 'historical_executions_v3'")
    expect(captureControlSql).toContain("p_expected_capability_id in ('historical_positions_v1', 'funding_records_v1')")
    expect(captureControlSql).toContain("p_checkpoint ->> 'checkpointVersion' is distinct from 'mexc-page-checkpoint-v1'")
    expect(captureControlSql).toContain("p_checkpoint ->> 'totalRequestAttempts')::integer\n      > 7 *")
    expect(captureIntegrationSql).toContain('TEST_HMAC_VALID_NONCANONICAL_CHECKPOINT_MUTATED_CLAIM_STATE')
    expect(captureIntegrationSql).toContain('TEST_CONTROL_FAILURE_CAPABILITY_PRECONDITION_WAS_ACCEPTED')
    expect(captureIntegrationSql).toContain('TEST_CONTROL_FAILURE_SCOPE_DIGEST_PRECONDITION_WAS_ACCEPTED')
    expect(captureIntegrationSql).toContain('TEST_CONTROL_FAILURE_PRECONDITION_REPLAY_DRIFT_WAS_ACCEPTED')
  })

  it('keeps immutable Sync Scope and MEXC Page Scope digests in separate domains', () => {
    expect(captureControlSql).toContain("'scopeDigest', v_scope.scope_digest")
    expect(captureControlSql).toContain("'pageScopeDigest', v_work_unit.checkpoint ->> 'scopeDigest'")
    expect(captureControlSql).toContain('public.equora_mexc_page_scope_digest_v1(')
    expect(captureControlSql).not.toContain("checkpoint ->> 'scopeDigest' is distinct from v_scope.scope_digest")
    expect(captureIntegrationSql).toContain('TEST_CONTROL_CROSS_RUN_SCOPE_RESULT_INVALID')
  })

  it('pins a bidirectional Success-vs-Failure concurrency proof', () => {
    expect(outcomeConcurrencyScript).toContain('equora_outcome_page_winner')
    expect(outcomeConcurrencyScript).toContain('equora_outcome_failure_winner')
    expect(outcomeConcurrencyScript).toContain("'1|0|terminal_observed|8|1|running|0|unverified|t|1'")
    expect(outcomeConcurrencyScript).toContain("'0|1|partial_failed|8|1|partial|1|failed|t|0'")
  })
})

describe('v57.61.0 local broker lane authority contracts', () => {
  it('is additive, control-marker-bound and cannot create capture or journal work', () => {
    expect(laneAuthoritySql).toContain('LANE_AUTHORITY_CONTROL_MIGRATION_NOT_APPLIED')
    expect(laneAuthoritySql).toContain('LANE_AUTHORITY_PREEXISTING_PARTIAL_SCHEMA')
    expect(laneAuthoritySql).toContain('equora_v57.61.0_g1_lane_authority_v1')
    expect(laneAuthoritySql).toContain("'authorityBlocked', true")
    expect(laneAuthoritySql).not.toMatch(/insert\s+into\s+public\.broker_capture_work_units/i)
    expect(laneAuthoritySql).not.toMatch(/insert\s+into\s+public\.trades/i)
    expect(laneAuthoritySql).not.toMatch(/update\s+public\.trades/i)
    expect(laneAuthoritySql).not.toMatch(/delete\s+from\s+public\.trades/i)
  })

  it('persists exact current lane, watermark and gap authority grains', () => {
    expect(laneAuthoritySql).toContain('create table if not exists public.broker_sync_lane_requirements')
    expect(laneAuthoritySql).toContain('create table if not exists public.broker_sync_lane_states')
    expect(laneAuthoritySql).toContain('create table if not exists public.broker_sync_gaps')
    expect(laneAuthoritySql).toContain('broker_sync_lane_requirements_current_unique')
    expect(laneAuthoritySql).toContain('broker_sync_lane_states_current_unique')
    expect(laneAuthoritySql).toContain('broker_sync_lane_states_requirement_fkey')
    expect(laneAuthoritySql).toContain('broker_sync_scopes_lane_authority_digest_reference_unique')
    expect(laneAuthoritySql).toMatch(/last_complete_scope_id,[\s\S]+last_complete_scope_digest[\s\S]+references public\.broker_sync_scopes[\s\S]+scope_digest/)
    expect(laneAuthoritySql).toContain('broker_sync_scopes_lane_authority_reference_unique')
    expect(laneAuthoritySql).toContain("watermark_contract_version = 'broker-lane-watermark-v1'")
    expect(laneAuthoritySql).toContain('public.equora_lane_watermark_digest_v1(')
    expect(laneAuthoritySql).toContain('public.equora_gap_resolution_digest_v1(')
    expect(laneAuthoritySql).toContain('broker_sync_gaps_resolution_check')
    expect(laneHealthIntegrationSql).toContain('TEST_REQUIRED_INSTRUMENT_GRAIN_WAS_INVISIBLE')
    expect(laneHealthIntegrationSql).toContain('TEST_FORGED_WATERMARK_DIGEST_WAS_ACCEPTED')
    expect(laneHealthIntegrationSql).toContain('TEST_NULL_WATERMARK_DIGEST_WAS_ACCEPTED')
    expect(laneHealthIntegrationSql).toContain('TEST_PARTIAL_NULL_COMPLETE_SCOPE_EVIDENCE_WAS_ACCEPTED')
    expect(laneHealthIntegrationSql).toContain('TEST_PARTIAL_NULL_WATERMARK_EVIDENCE_WAS_ACCEPTED')
    expect(laneHealthIntegrationSql).toContain('TEST_PARTIAL_NULL_ERROR_EVIDENCE_WAS_ACCEPTED')
    expect(laneHealthIntegrationSql).toContain('TEST_SELF_CONSISTENT_WRONG_SCOPE_DIGEST_WAS_ACCEPTED')
    expect(laneHealthIntegrationSql).toContain('TEST_HEALTHY_PARTIAL_SCOPE_WAS_TRUSTED')
    expect(laneHealthIntegrationSql).toContain('TEST_HEALTHY_UNCLOSED_SCOPE_WAS_TRUSTED')
    expect(laneHealthIntegrationSql).toContain('TEST_HEALTHY_UNSTABLE_SCOPE_WAS_TRUSTED')
    expect(laneHealthIntegrationSql).toContain('TEST_HEALTHY_SOURCE_COVERAGE_MISMATCH_WAS_TRUSTED')
    expect(laneHealthIntegrationSql).toContain('TEST_HEALTHY_PREMATURE_COMPLETION_TIME_WAS_TRUSTED')
    expect(laneHealthIntegrationSql).toContain('TEST_VALID_COMPLETE_SCOPE_RECOVERY_NOT_HEALTHY')
    expect(laneHealthIntegrationSql).toContain('TEST_DUPLICATE_CURRENT_LANE_STATE_WAS_ACCEPTED')
    expect(laneHealthIntegrationSql).toContain('TEST_UNEVIDENCED_GAP_RECONCILIATION_WAS_ACCEPTED')
    expect(laneHealthIntegrationSql).toContain('TEST_PARTIAL_NULL_RECONCILIATION_EVIDENCE_WAS_ACCEPTED')
    expect(laneHealthIntegrationSql).toContain('TEST_CROSS_TENANT_GAP_BINDING_WAS_ACCEPTED')
  })

  it('derives health with lifecycle, export-gap, missing-lane and due-boundary precedence', () => {
    const exportBranch = laneAuthoritySql.indexOf("v_health := 'gap_requires_export'")
    const missingBranch = laneAuthoritySql.indexOf('v_expected_lane_count = 0 or v_missing_lane_count > 0')
    expect(exportBranch).toBeGreaterThan(-1)
    expect(missingBranch).toBeGreaterThan(exportBranch)
    expect(laneAuthoritySql).toContain('next_due_at is not null and next_due_at <= p_as_of')
    expect(laneAuthoritySql).toContain("'requiresExportGapCount', v_requires_export_gap_count")
    expect(laneAuthoritySql).toContain("'exportBlockedLaneCount', v_export_blocked_lane_count")
    expect(laneAuthoritySql).toContain("'invalidReconciliationCount', v_invalid_reconciliation_count")
    expect(laneAuthoritySql).toContain("'invalidCompleteScopeLaneCount', v_invalid_complete_scope_lane_count")
    expect(laneHealthIntegrationSql).toContain('TEST_EXPORT_COUNTERS_NOT_SEPARATED')
    expect(laneHealthIntegrationSql).toContain('TEST_POLICY_SUPERSESSION_MASKED_UNRESOLVED_GAP')
    expect(laneHealthIntegrationSql).toContain('TEST_PARTIAL_UNCLOSED_RECONCILIATION_PASSED')
    expect(laneHealthIntegrationSql).toContain('TEST_VALID_EXACT_RECONCILIATION_NOT_ACCEPTED')
    expect(laneHealthIntegrationSql).toContain('TEST_DUE_BOUNDARY_NOT_DEGRADED')
    expect(laneHealthIntegrationSql).toContain('TEST_PAUSE_PRECEDENCE_INVALID')
    expect(laneHealthIntegrationSql).toContain('TEST_REVOKE_PRECEDENCE_INVALID')
    expect(laneHealthIntegrationSql).toContain('TEST_CROSS_GENERATION_LANE_REUSE_ACCEPTED')
  })

  it('keeps direct tables closed and exposes only the clock-bound read-only wrapper', () => {
    expect(laneAuthoritySql).toContain('alter table public.broker_sync_lane_requirements enable row level security')
    expect(laneAuthoritySql).toContain('alter table public.broker_sync_lane_states enable row level security')
    expect(laneAuthoritySql).toContain('alter table public.broker_sync_gaps enable row level security')
    expect(laneAuthoritySql.match(/using \(\(select auth\.uid\(\)\) = user_id\)/g)?.length).toBe(3)
    expect(laneAuthoritySql).toContain('revoke all on table public.broker_sync_lane_requirements')
    expect(laneAuthoritySql).toContain('revoke all on table public.broker_sync_lane_states')
    expect(laneAuthoritySql).toContain('revoke all on table public.broker_sync_gaps')
    expect(laneAuthoritySql).toMatch(/revoke all on function public\.equora_derive_capture_health_at_v1\([\s\S]+from public, anon, authenticated, service_role;/)
    expect(laneAuthoritySql).toMatch(/grant execute on function public\.equora_derive_capture_health_v1\(uuid\)[\s\S]+to service_role;/)
    expect(laneAuthoritySql).not.toMatch(/grant execute on function public\.equora_derive_capture_health_v1\(uuid\)[\s\S]+to authenticated;/)
    expect(laneAuthoritySql).toContain('LANE_AUTHORITY_CONSTRAINT_DRIFT')
    expect(laneAuthoritySql).toContain('LANE_AUTHORITY_CONSTRAINT_DEFINITION_DRIFT')
    expect(laneAuthoritySql).toContain('LANE_AUTHORITY_INDEX_DEFINITION_DRIFT')
    expect(laneHealthIntegrationSql).toContain('TEST_LANE_AUTHORITY_CROSS_TENANT_RLS_LEAK')
    expect(captureIntegrationSql).toContain('-- EQUORA_LANE_HEALTH_SETUP_END')
    expect(laneHealthRunner).toContain("$setupMarker = '-- EQUORA_LANE_HEALTH_SETUP_END'")
    expect(laneHealthRunner).toContain('drop database if exists $TestDatabase with (force)')
  })
})

describe('v57.61.0 local broker activation authority contracts', () => {
  it('pins the complete normalized migration artifact to its embedded contract fingerprint', () => {
    const fingerprint = 'b074a756a015b34a7e3da804f3d3955100a40f9a6391855a75c1e415cbbb2abb'
    const normalizedArtifact = activationAuthoritySql
      .replaceAll(fingerprint, '0'.repeat(64))
      .replace(/\r\n/g, '\n')

    expect(activationAuthoritySql.split(fingerprint)).toHaveLength(4)
    expect(createHash('sha256').update(normalizedArtifact, 'utf8').digest('hex')).toBe(fingerprint)
  })

  it('is lane-marker-bound, additive and unable to schedule capture or write journal data', () => {
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_LANE_MIGRATION_NOT_APPLIED')
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_PREEXISTING_PARTIAL_SCHEMA')
    expect(activationAuthoritySql).toContain('equora_v57.61.0_g1_activation_authority_v1')
    expect(activationAuthoritySql).toContain("'authorityBlocked', true")
    expect(activationAuthoritySql).not.toMatch(/insert\s+into\s+public\.broker_capture_work_units/i)
    expect(activationAuthoritySql).not.toMatch(/insert\s+into\s+public\.trades/i)
    expect(activationAuthoritySql).not.toMatch(/update\s+public\.trades/i)
    expect(activationAuthoritySql).not.toMatch(/delete\s+from\s+public\.trades/i)
  })

  it('pins every Scope and Work Unit to an exact requirement, lane and policy revision', () => {
    expect(activationAuthoritySql).toContain('add column if not exists lane_requirement_id uuid not null')
    expect(activationAuthoritySql).toContain('add column if not exists lane_state_id uuid not null')
    expect(activationAuthoritySql).toContain('add column if not exists policy_generation bigint not null')
    expect(activationAuthoritySql).toContain('broker_sync_scopes_lane_authority_fkey')
    expect(activationAuthoritySql).toContain('broker_capture_work_units_scope_authority_fkey')
    expect(activationAuthoritySql).toContain('authority_plan_digest text not null')
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_NULLABLE_BINDING_DRIFT')
    expect(activationAuthorityIntegrationSql).toContain('TEST_OLD_POLICY_MUTATION_WAS_ACCEPTED')
  })

  it('creates each activation foundation atomically and supersedes policy without hiding old gaps', () => {
    expect(activationAuthoritySql).toContain("'historical_orders_v1'")
    expect(activationAuthoritySql).toContain("'historical_executions_v3'")
    expect(activationAuthoritySql).toContain("'historical_positions_v1'")
    expect(activationAuthoritySql).toContain("'funding_records_v1'")
    expect(activationAuthoritySql).toContain("cross join unnest(array[")
    expect(activationAuthoritySql).toContain("'incremental_fast_6h', 'rolling_audit_7d_daily'")
    expect(activationAuthoritySql).toContain("'rolling_audit_28d_weekly'")
    expect(activationAuthorityIntegrationSql).toContain('TEST_ACTIVATION_FOUNDATION_NOT_ATOMIC')
    expect(activationAuthorityIntegrationSql).toContain('TEST_POLICY_SUPERSESSION_CARRIED_OR_HID_EVIDENCE')
    expect(activationAuthorityIntegrationSql).toContain('TEST_ACTIVATION_RESUME_CHANGED_FOUNDATION')
  })

  it('uses owner-bound activation intents, durable replay receipts and CAS-controlled mutations', () => {
    expect(activationAuthoritySql).toContain('create table if not exists public.broker_sync_activation_commands')
    expect(activationAuthoritySql).toContain('create table if not exists public.broker_sync_authority_mutation_receipts')
    expect(activationAuthoritySql).toContain('series_row_version')
    expect(activationAuthoritySql).toContain('expected_lane_row_version')
    expect(activationAuthoritySql).toContain('ACTIVATION_COMMAND_REPLAY_MISMATCH')
    expect(activationAuthoritySql).toContain('AUTHORITY_MUTATION_REPLAY_MISMATCH')
    expect(activationAuthoritySql).toContain("command_status in ('pending', 'applied', 'rejected')")
    expect(activationAuthoritySql).toContain("'errorCode', 'ACTIVATION_APPLY_SERIES_CAS_MISMATCH'")
    expect(activationAuthorityIntegrationSql).toContain('TEST_ACTIVATION_COMMAND_DRIFT_WAS_ACCEPTED')
    expect(activationAuthorityIntegrationSql).toContain('TEST_REQUIREMENT_CREATE_REPLAY_INVALID')
    expect(activationAuthorityIntegrationSql).toContain('TEST_EXACT_REPLAY_AFTER_POLICY_CHANGE_INVALID')
    expect(activationAuthorityIntegrationSql).toContain('TEST_EXACT_REPLAY_AFTER_ACTIVATION_CHANGE_INVALID')
  })

  it('uses numeric provider-watermark order and export-only unknown-boundary reconciliation', () => {
    expect(activationAuthoritySql).toContain("p_high_watermark_tie_breaker !~ '^(0|[1-9][0-9]{0,127})$'")
    expect(activationAuthoritySql).toContain('p_high_watermark_tie_breaker::numeric <')
    expect(activationAuthoritySql).toContain("then 'provider_export_scope'")
    expect(activationAuthoritySql).toContain("v_gap.required_resolution_source = 'provider_export_scope'")
    expect(activationAuthorityIntegrationSql).toContain('TEST_WATERMARK_REGRESSION_WAS_ACCEPTED')
    expect(activationAuthorityIntegrationSql).toContain('TEST_WATERMARK_EVIDENCE_DRIFT_WAS_ACCEPTED')
    expect(activationAuthorityIntegrationSql).toContain('TEST_WATERMARK_EVIDENCE_DRIFT_LEFT_PARTIAL_EFFECT')
    expect(activationAuthoritySql).toContain('AUTHORITY_WATERMARK_EVIDENCE_DRIFT')
    expect(activationAuthorityIntegrationSql).toContain('TEST_NONCANONICAL_TIE_BREAKER_WAS_ACCEPTED')
    expect(activationAuthorityIntegrationSql).toContain('TEST_UNKNOWN_GAP_EXPORT_RECONCILIATION_INVALID')
    expect(activationAuthorityIntegrationSql).toContain('TEST_SEMANTIC_GAP_IDEMPOTENCY_INVALID')
  })

  it('requires a short-lived single-use request permit before v2 claim/page/failure authority', () => {
    expect(activationAuthoritySql).toContain('create table if not exists public.broker_capture_request_authorizations')
    expect(activationAuthoritySql).toContain('equora_authorize_broker_capture_request_v1')
    expect(activationAuthoritySql).toContain('equora_claim_broker_capture_work_unit_v2')
    expect(activationAuthoritySql).toContain('equora_commit_broker_capture_page_v2')
    expect(activationAuthoritySql).toContain('equora_record_broker_capture_failure_v2')
    expect(activationAuthoritySql).toMatch(/revoke all on function public\.equora_claim_broker_capture_work_unit_v1[\s\S]+from public, anon, authenticated, service_role;/)
    expect(activationAuthoritySql).toMatch(/revoke all on function public\.equora_commit_broker_capture_page_v1[\s\S]+from public, anon, authenticated, service_role;/)
    expect(activationAuthorityIntegrationSql).toContain('TEST_REQUEST_AUTHORIZATION_REUSE_WAS_ACCEPTED')
    expect(activationAuthorityIntegrationSql).toContain('TEST_STALE_PERMIT_COMMIT_WAS_ACCEPTED')
    expect(activationAuthorityIntegrationSql).toContain('TEST_STALE_PERMIT_LEFT_PARTIAL_OUTCOME')
    expect(activationAuthorityIntegrationSql).toContain('TEST_AUTHORIZED_V2_PAGE_OR_REPLAY_INVALID')
    expect(activationAuthorityIntegrationSql).toContain('TEST_V2_PAGE_REPLAY_DRIFT_WAS_ACCEPTED')
    expect(activationAuthoritySql).toContain('broker_capture_request_auth_page_receipt_check')
    expect(activationAuthoritySql).toContain('CAPTURE_PAGE_REPLAY_MISMATCH')
    expect(activationAuthorityIntegrationSql).toContain('TEST_REJECTED_PAGE_PERMIT_LEFT_PARTIAL_EFFECT')
    expect(activationAuthorityIntegrationSql).toContain('TEST_EXPIRED_PAGE_PERMIT_LEFT_PARTIAL_EFFECT')
    expect(activationAuthorityIntegrationSql).toContain('TEST_PAGE_SEND_DEADLINE_BOUNDARY_REJECTED')
    expect(activationAuthorityIntegrationSql).toContain("expect_v2_page_start_rejected(null)")
    expect(activationAuthoritySql).toContain('or not isfinite(p_request_started_at)')
    expect(activationAuthorityIntegrationSql).toContain('TEST_ACTIVATION_MIXED_NULL_REASON_WAS_ACCEPTED')
    expect(activationAuthorityIntegrationSql).toContain('TEST_LEGACY_ACTIVATE_SUPERSESSION_INVALID')
  })

  it('keeps authority tables closed and the isolated runner destructive only inside its test database', () => {
    expect(activationAuthoritySql).toContain('alter table public.broker_sync_activation_commands enable row level security')
    expect(activationAuthoritySql).toContain('alter table public.broker_sync_authority_mutation_receipts enable row level security')
    expect(activationAuthoritySql).toContain('alter table public.broker_capture_request_authorizations enable row level security')
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_TABLE_PRIVILEGE_DRIFT')
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_SECURITY_DEFINER_DRIFT')
    expect(activationAuthoritySql).toContain('create role equora_broker_capture_owner')
    expect(activationAuthoritySql).toContain('nologin noinherit nosuperuser nocreatedb nocreaterole')
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_OWNER_ROLE_DRIFT')
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_FUNCTION_OWNER_DRIFT')
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_OWNER_PRIVILEGE_DRIFT')
    expect(activationAuthoritySql).toContain('alter table public.broker_sync_activation_commands owner to postgres')
    expect(activationAuthoritySql).toContain('alter table public.broker_sync_authority_mutation_receipts owner to postgres')
    expect(activationAuthoritySql).toContain('alter table public.broker_capture_request_authorizations owner to postgres')
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_TABLE_OWNER_DRIFT')
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_V1_CORE_CONFIG_DRIFT')
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_TABLE_ACL_GRANTEE_DRIFT')
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_FUNCTION_ACL_GRANTEE_DRIFT')
    expect(activationAuthoritySql).toContain("aclexplode(")
    expect(activationAuthoritySql).toContain("coalesce(grantee_role.rolname, 'PUBLIC')")
    expect(activationAuthoritySql).toContain("membership_row.inherit_option")
    expect(activationAuthoritySql).toContain("membership_row.set_option")
    expect(activationAuthoritySql).toContain("('public.broker_provider_request_results', true, false, false, false)")
    expect(activationAuthoritySql).toContain("('public.broker_capture_attempt_outcomes', true, false, false, false)")
    expect(activationAuthoritySql).toContain('to_regprocedure(expected.function_signature)')
    expect(activationAuthoritySql).toContain("'statement_timeout=' || expected.statement_timeout")
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_INTERNAL_HELPER_CONFIG_DRIFT')
    expect(activationAuthoritySql).toContain(
      'equora_private.equora_request_context_uid_v1()',
    )
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_AUTH_ADAPTER_DRIFT')
    expect(activationAuthoritySql).toContain('select auth.uid()')
    expect(activationAuthoritySql).toContain(
      'v_user_id uuid := equora_private.equora_request_context_uid_v1();',
    )
    expect(activationAuthoritySql).not.toContain(
      'grant usage on schema public, equora_private, auth',
    )
    expect(activationAuthoritySql).not.toContain(
      'grant execute on function auth.uid() to equora_broker_capture_owner',
    )
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_CONSTRAINT_DEFINITION_DRIFT')
    expect(activationAuthoritySql).toContain('ACTIVATION_AUTHORITY_INDEX_DEFINITION_DRIFT')
    expect(activationAuthoritySql).toContain('422d191c9a776fb11c27043e400b6401e1500e851185f942b557865929cba379')
    expect(activationAuthoritySql).toContain('4677767b03b0706b0eb3fbf5761cc48f312ef204b899843662bc661406bdfdcb')
    expect(activationAuthorityRunner).toContain("drop database if exists $TestDatabase with (force)")
    expect(activationAuthorityRunner).toContain("TestDatabase must use the equora_capture_activation_authority_ prefix")
    expect(activationAuthorityConcurrencyRunner).toContain('equora_activation_create_winner')
    expect(activationAuthorityConcurrencyRunner).toContain('equora_policy_supersede_loser')
    expect(activationAuthorityConcurrencyRunner).toContain('equora_request_permit_winner')
    expect(activationAuthorityConcurrencyRunner).toContain('equora_pause_before_permit')
    expect(activationAuthorityConcurrencyRunner).toContain('equora_health_due_waiter')
    expect(activationAuthorityConcurrencyRunner).toContain('REQUEST_AUTH_HEALTH_BLOCKED')
    expect(activationAuthorityConcurrencyRunner).toContain("'1|1|1|4|12'")
    expect(activationAuthorityConcurrencyRunner).toContain("'0|paused|0|0'")
    expect(activationAuthorityConcurrencyRunner).toContain("drop database if exists $TestDatabase with (force)")
    expect(activationAuthorityDriftRunner).toContain('ACTIVATION_AUTHORITY_CONSTRAINT_DEFINITION_DRIFT')
    expect(activationAuthorityDriftRunner).toContain('ACTIVATION_AUTHORITY_INDEX_DEFINITION_DRIFT')
    expect(activationAuthorityDriftRunner).toContain('equora_activation_acl_probe')
    expect(activationAuthorityDriftRunner).toContain('ACTIVATION_AUTHORITY_ACL_NORMALIZATION_FAILED')
    expect(activationAuthorityDriftRunner).toContain('equora_claim_broker_capture_work_unit_v1')
    expect(activationAuthorityDriftRunner).toContain('equora_commit_broker_capture_page_v1')
    expect(activationAuthorityDriftRunner).toContain('equora_record_broker_capture_failure_v1')
    expect(activationAuthorityDriftRunner).toContain('alter table public.broker_sync_activation_commands owner to $aclProbeRole')
    expect(activationAuthorityDriftRunner).toContain("Invoke-ExpectedMigrationFailure -ExpectedCode 'ACTIVATION_AUTHORITY_TABLE_OWNER_DRIFT'")
    expect(activationAuthorityDriftRunner).toContain("Invoke-ExpectedMigrationFailure -ExpectedCode 'ACTIVATION_AUTHORITY_V1_CORE_CONFIG_DRIFT'")
    expect(activationAuthorityDriftRunner).toContain('ACTIVATION_AUTHORITY_CROSS_LAYER_RERUN_FAILED')
    expect(activationAuthorityDriftRunner).toContain("'false|false|true|true|true|true'")
    expect(activationAuthorityDriftRunner).toContain("'false|false|false|false|false|postgres'")
    expect(activationAuthorityDriftRunner).toContain("drop database if exists $TestDatabase with (force)")
  })
})

describe('v57.61.0 inactive scheduler and durable Lease contracts', () => {
  it('pins the normalized scheduler migration artifact to its embedded fingerprint', () => {
    const fingerprint = '87158546782b900817d3f36501a2e43b5619906a2f07636d0cb1167b042e5ab7'
    const normalizedArtifact = schedulerControlSql
      .replaceAll(fingerprint, '0'.repeat(64))
      .replace(/\r\n/g, '\n')

    expect(schedulerControlSql.split(fingerprint)).toHaveLength(4)
    expect(createHash('sha256').update(normalizedArtifact, 'utf8').digest('hex')).toBe(fingerprint)
  })

  it('keeps Continuation on the canonical Provider-Enrollment-child lock order', () => {
    const continuationStart = schedulerControlSql.indexOf(
      'create or replace function public.equora_continue_yielded_broker_capture_work_unit_v1',
    )
    const continuationEnd = schedulerControlSql.indexOf(
      'revoke all on function public.equora_continue_yielded_broker_capture_work_unit_v1',
      continuationStart,
    )
    const continuation = schedulerControlSql.slice(continuationStart, continuationEnd)
    expect(continuation).toContain(
      'equora_lock_capture_parent_chain_v1(\n    v_predecessor.id, clock_timestamp(), false',
    )
    expect(continuation.indexOf('clock_timestamp(), false')).toBeLessThan(
      continuation.indexOf('broker_capture_runtime_enrollment enrollment'),
    )
    expect(continuation.indexOf('broker_capture_runtime_enrollment enrollment')).toBeLessThan(
      continuation.indexOf('select * into v_scope from public.broker_sync_scopes'),
    )
    expect(continuation.indexOf('select * into v_scope from public.broker_sync_scopes')).toBeLessThan(
      continuation.indexOf('select * into v_requirement from public.broker_sync_lane_requirements'),
    )
    expect(schedulerConcurrencyRunner).toContain('Disable-first Continuation did not fail closed')
    expect(schedulerConcurrencyRunner).toContain("'f|0|0|0'")
  })

  it('binds one closed Continuation result shape and the zero-based 20-Work-Unit generation bound', () => {
    expect(schedulerControlSql).toContain("'crossRequestReplay', true")
    expect(schedulerControlSql).toContain("'crossRequestReplay', false")
    expect(brokerCaptureSchedulerTs).toContain('crossRequestReplay: boolean')
    expect(brokerCaptureSchedulerTs).toContain(
      'MEXC_PAGE_BUDGET_PROFILE_V1.maxWorkUnitsPerScope - 1',
    )
    expect(schedulerControlIntegrationSql).toContain(
      "result ->> 'crossRequestReplay' = 'true'",
    )
    expect(schedulerControlIntegrationSql).toContain(
      "result ->> 'crossRequestReplay' = 'false'",
    )
  })

  it('keeps one request Scope with authoritative daily child buckets', () => {
    expect(schedulerControlSql).toContain('create table if not exists public.broker_sync_scope_buckets')
    expect(schedulerControlSql).toContain("'broker-request-bucket-set-v1'")
    expect(schedulerControlSql).toContain('v_bucket_count := 7')
    expect(schedulerControlSql).toContain('v_bucket_count := 28')
    expect(schedulerControlSql).toContain('v_bucket_count not between 1 and 31')
    expect(schedulerControlSql).toContain('86400000::bigint')
    expect(schedulerControlIntegrationSql).toContain('SCHEDULER_7D_BUCKET_ORACLE_FAILED')
    expect(schedulerControlIntegrationSql).toContain('SCHEDULER_28D_OR_STARVATION_ORACLE_FAILED')
    expect(schedulerControlIntegrationSql).toContain('SCHEDULER_TCJ_BUCKET_GOLDEN_VECTOR_DRIFT')
    expect(schedulerControlIntegrationSql).toContain('SCHEDULER_MISSING_BUCKET_WAS_ACCEPTED')
    expect(schedulerControlIntegrationSql).toContain('SCHEDULER_TAMPERED_BUCKET_WAS_ACCEPTED')
    expect(activationAuthoritySql).toContain('AUTHORITY_SCOPE_BUCKET_SET_INVALID')
  })

  it('materializes each due identity append-once without starving later due Lanes', () => {
    expect(schedulerControlSql).toContain('broker_capture_schedule_occurrences_due_unique')
    expect(schedulerControlSql).toContain('broker_capture_materialization_commands')
    expect(schedulerControlSql.match(/scheduled\.schedule_contract_version = p_schedule_contract_version/g)?.length)
      .toBeGreaterThanOrEqual(3)
    expect(schedulerControlSql).toContain('for update of series skip locked')
    expect(schedulerControlIntegrationSql).toContain('SCHEDULER_EXACT_REPLAY_NOT_NOOP')
    expect(schedulerConcurrencyRunner).toContain('Concurrent exact materialization replay failed')
    expect(schedulerControlIntegrationSql).toContain('SCHEDULER_CAPABILITY_CHECKPOINT_MATRIX_FAILED')
    expect(schedulerControlIntegrationSql).toContain('SCHEDULER_POSITION_PERMIT_MATRIX_FAILED')
    expect(schedulerControlSql).toContain(') is distinct from true\n  then')
    expect(schedulerControlIntegrationSql).toContain('TEST_POSITION_NONE_WAS_ACCEPTED')
    expect(schedulerControlIntegrationSql).toContain('TEST_FUNDING_NONE_WAS_ACCEPTED')
    expect(schedulerControlIntegrationSql).toContain('TEST_ORDER_POSITION_TYPE_WAS_ACCEPTED')
    expect(schedulerControlIntegrationSql).toContain('TEST_EXECUTION_POSITION_TYPE_WAS_ACCEPTED')
    expect(schedulerControlIntegrationSql).toContain('SCHEDULER_INVALID_POSITION_TYPE_PARTIAL_EFFECT')
  })

  it('enforces exact Work-Unit and account/sync-kind Lease authority', () => {
    expect(schedulerControlSql).toContain('create table if not exists public.broker_capture_account_leases')
    expect(schedulerControlSql).toContain("sync_kind = 'provider_api_observation'")
    expect(schedulerControlSql).toContain("lease_max_expires_at = lease_acquired_at + interval '180 seconds'")
    expect(schedulerControlSql).toContain('lease_renew_count between 0 and 3')
    expect(activationAuthoritySql).toContain('REQUEST_AUTH_ACCOUNT_LEASE_INVALID')
    expect(activationAuthoritySql).toContain('CAPTURE_ACCOUNT_LEASE_INVALID')
    expect(activationAuthoritySql).toContain('FAILURE_ACCOUNT_LEASE_INVALID')
    expect(schedulerControlIntegrationSql).toContain('ACCOUNT_LEASE_FENCE_PARTIAL_EFFECT')
    expect(schedulerConcurrencyRunner).toContain('CONTROL_ACCOUNT_LEASE_BUSY')
  })

  it('treats Permit without Outcome as uncertain and bounds restart recovery', () => {
    expect(schedulerControlSql).toContain("then 'recovery_pending' else 'pending'")
    expect(schedulerControlSql).toContain("then 'uncertain_egress' else 'none'")
    expect(schedulerControlSql).toContain("'outcomeDerivedCount', v_outcome_derived")
    expect(schedulerControlSql).toContain('p_batch_limit not between 1 and 25')
    expect(schedulerControlIntegrationSql).toContain('LEASE_UNCERTAIN_EGRESS_ORACLE_FAILED')
    expect(schedulerControlIntegrationSql).toContain(
      'QUIESCENT_UNCERTAIN_EGRESS_RECOVERY_OR_REPLAY_FAILED',
    )
    expect(schedulerControlSql).toContain(
      'authorization_row.work_unit_row_version = candidate.row_version - 1',
    )
    expect(schedulerControlSql).toContain(
      'authorization_row.request_sequence = candidate.request_sequence + 1',
    )
    expect(schedulerControlIntegrationSql).toContain('EXPIRED_RECOVERY_OR_REPLAY_ORACLE_FAILED')
    expect(schedulerControlIntegrationSql).toContain('RESOLVED_OUTCOME_RECOVERY_ORACLE_FAILED')
    expect(schedulerConcurrencyRunner).toContain('Concurrent exact Renew replay failed')
    expect(schedulerConcurrencyRunner).toContain('Concurrent exact Release replay failed')
    expect(schedulerConcurrencyRunner).toContain('Concurrent exact Continuation replay failed')
    expect(schedulerConcurrencyRunner).toContain('Concurrent exact Recovery replay failed')
  })

  it('pins complete scheduler constraint and index definitions', () => {
    expect(schedulerControlSql).toContain(
      '1c580277b1cb2b2ef30112855cc27fb864ec0a28bd8d0eccbc776365909721b4',
    )
    expect(schedulerControlSql).toContain(
      '60ddc321d9ce4303120e760658a50916172e26da7c020043eec074736c28c8c1',
    )
    expect(schedulerControlSql).toContain('SCHEDULER_CONTROL_CONSTRAINT_DEFINITION_DRIFT')
    expect(schedulerControlSql).toContain('SCHEDULER_CONTROL_INDEX_DEFINITION_DRIFT')
    expect(schedulerDriftRunner).toContain('constraint drift mutant')
    expect(schedulerDriftRunner).toContain('index drift mutant')
  })

  it('creates one bounded same-Scope Yield successor and stays operationally inert', () => {
    expect(schedulerControlSql).toContain('broker_capture_work_units_predecessor_unique')
    expect(schedulerControlSql).toContain('equora_continue_yielded_broker_capture_work_unit_v1')
    expect(schedulerControlSql).toContain(
      'v_max_work_units_per_scope constant integer := 20',
    )
    expect(schedulerControlSql).toContain('>= v_max_work_units_per_scope')
    expect(schedulerControlSql).not.toContain("'workUnitSequence')::integer >= 8")
    expect(schedulerControlIntegrationSql).toContain('YIELD_CONTINUATION_OR_REPLAY_ORACLE_FAILED')
    expect(schedulerControlIntegrationSql).toContain(
      'YIELD_CONTINUATION_SCOPE_BOUNDARY_ORACLE_FAILED',
    )
    expect(schedulerControlIntegrationSql).toContain("'{workUnitSequence}', '19'::jsonb")
    expect(schedulerControlSql).not.toMatch(/create\s+(?:or\s+replace\s+)?trigger/i)
    expect(schedulerControlSql).not.toMatch(/insert\s+into\s+public\.trades/i)
    expect(schedulerControlSql).not.toMatch(/\bfetch\s*\(/i)
    expect(schedulerControlRunner).toContain("drop database if exists $TestDatabase with (force)")
    expect(schedulerControlRunner).toContain('populated re-run failed')
    expect(schedulerControlRunner).toContain("'f|f|f|t|t|t'")
    expect(schedulerConcurrencyRunner).toContain("drop database if exists $TestDatabase with (force)")
    expect(schedulerConcurrencyRunner).toContain(
      "application_name = 'equora_scheduler_enrollment_disable'",
    )
    expect(schedulerConcurrencyRunner).toContain(
      "application_name = 'equora_scheduler_continuation_waiter'",
    )
    expect(schedulerConcurrencyRunner).toContain('lock_row.waitstart is not null')
    expect(schedulerConcurrencyRunner).toContain(
      'Continuation was not observed waiting on the Enrollment lock.',
    )
  })

  it('returns concurrent closing Page replays from the immutable Receipt before mutable parents', () => {
    expect(activationAuthoritySql).toContain(
      'the Work-Unit lock already\n  -- serialized the Page writer',
    )
    expect(pageReplayConcurrencyRunner).toContain('pg_locks lock_row')
    expect(pageReplayConcurrencyRunner).toContain('lock_row.waitstart is not null')
    expect(pageReplayConcurrencyRunner).toContain("Outcome 'terminal_observed'")
    expect(pageReplayConcurrencyRunner).toContain("Outcome 'loop_blocked'")
    expect(pageReplayConcurrencyRunner).toContain('CAPTURE_PAGE_REPLAY_MISMATCH')
    expect(pageReplayConcurrencyRunner).toContain('each race persisted one Page effect')
    expect(pageReplayConcurrencyRunner).toContain("drop database if exists $TestDatabase with (force)")
  })

  it('keeps the Scheduler SQL error namespace bidirectionally closed and sanitized', () => {
    const runtimeFunctions = [
      'equora_lock_active_broker_account_identity_v1',
      'equora_lock_capture_parent_chain_v1',
      'equora_materialize_next_due_broker_capture_v1',
      'equora_renew_broker_capture_lease_v1',
      'equora_release_broker_capture_lease_v1',
      'equora_continue_yielded_broker_capture_work_unit_v1',
      'equora_recover_expired_broker_capture_leases_v1',
    ] as const
    const sqlCodes = new Set<string>()
    for (const functionName of runtimeFunctions) {
      const start = schedulerControlSql.indexOf(
        `create or replace function public.${functionName}(`,
      )
      expect(start, `${functionName} fehlt`).toBeGreaterThanOrEqual(0)
      const tail = schedulerControlSql.slice(start)
      const end = tail.search(/\r?\n\$\$;/)
      expect(end, `${functionName} ist nicht geschlossen`).toBeGreaterThanOrEqual(0)
      for (const match of tail.slice(0, end).matchAll(
        /raise exception '((?:SCHEDULER|LEASE|CONTINUATION|RECOVERY)_[A-Z_]+)'/g,
      )) sqlCodes.add(match[1])
    }

    const listBlock = schedulerSource.match(
      /export const BROKER_CAPTURE_SCHEDULER_DATABASE_ERROR_CODES = \[([\s\S]*?)\] as const/,
    )?.[1]
    expect(listBlock).toBeDefined()
    const runtimeCodes = [...(listBlock ?? '').matchAll(
      /'((?:SCHEDULER|LEASE|CONTINUATION|RECOVERY)_[A-Z_]+)'/g,
    )].map((match) => match[1])
    expect(runtimeCodes).toHaveLength(35)
    expect(new Set(runtimeCodes).size).toBe(35)
    expect([...sqlCodes].sort()).toEqual([...runtimeCodes].sort())
    expect(schedulerSource).toContain(
      'typeof BROKER_CAPTURE_SCHEDULER_DATABASE_ERROR_CODES[number]',
    )
    expect(schedulerSource).toContain(
      'new Set<BrokerCaptureSchedulerDatabaseErrorCode>',
    )
    expect(schedulerSource).toContain(
      "fail('database_error', 'Die Broker-Capture-Schedulertransaktion ist fehlgeschlagen.')",
    )
    expect(schedulerSource).not.toContain('fail(known as SchedulerErrorCode, message)')
  })

  it('keeps Page and Control database error namespaces equal to reachable SQL paths', () => {
    const functionCodes = (
      source: string,
      functionName: string,
      namespacePattern: string,
    ) => {
      const start = source.indexOf(`create or replace function public.${functionName}(`)
      expect(start, `${functionName} fehlt`).toBeGreaterThanOrEqual(0)
      const tail = source.slice(start)
      const end = tail.search(/\r?\n\$\$;/)
      expect(end, `${functionName} ist nicht geschlossen`).toBeGreaterThanOrEqual(0)
      return [...tail.slice(0, end).matchAll(
        new RegExp(`raise exception '((?:${namespacePattern})_[A-Z_]+)'`, 'g'),
      )].map((match) => match[1])
    }
    const constCodes = (
      source: string,
      constName: string,
      namespacePattern: string,
    ) => {
      const block = source.match(
        new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\] as const`),
      )?.[1]
      expect(block, `${constName} fehlt`).toBeDefined()
      return [...(block ?? '').matchAll(
        new RegExp(`'((?:${namespacePattern})_[A-Z_]+)'`, 'g'),
      )].map((match) => match[1])
    }

    const pageSqlCodes = new Set([
      ...functionCodes(
        capturePersistenceSql,
        'equora_commit_broker_capture_page_v1',
        'CAPTURE',
      ),
      ...functionCodes(
        activationAuthoritySql,
        'equora_commit_broker_capture_page_v2',
        'CAPTURE',
      ),
      'CAPTURE_CHECKPOINT_MAC_INVALID',
      'SCHEDULER_PARENT_LOCK_TIMEOUT',
      'SCHEDULER_PARENT_STATEMENT_TIMEOUT',
    ])
    const pageTsCodes = constCodes(
      capturePersistenceSource,
      'BROKER_CAPTURE_PAGE_DATABASE_ERROR_CODES',
      'CAPTURE|SCHEDULER_PARENT',
    )
    expect(new Set(pageTsCodes).size).toBe(pageTsCodes.length)
    expect([...pageTsCodes].sort()).toEqual([...pageSqlCodes].sort())
    expect(capturePersistenceSource).toContain(
      'typeof BROKER_CAPTURE_PAGE_DATABASE_ERROR_CODES[number]',
    )
    expect(capturePersistenceSource).toContain(
      'new Set<BrokerCapturePageDatabaseErrorCode>',
    )

    const controlSqlCodes = new Set([
      ...functionCodes(
        captureControlSql,
        'equora_claim_broker_capture_work_unit_v1',
        'CONTROL',
      ),
      ...functionCodes(
        activationAuthoritySql,
        'equora_claim_broker_capture_work_unit_v2',
        'CONTROL',
      ),
      ...functionCodes(
        activationAuthoritySql,
        'equora_authorize_broker_capture_request_v1',
        'REQUEST_AUTH',
      ),
      ...functionCodes(
        captureControlSql,
        'equora_record_broker_capture_failure_v1',
        'CONTROL',
      ),
      ...functionCodes(
        activationAuthoritySql,
        'equora_record_broker_capture_failure_v2',
        'CONTROL|FAILURE',
      ),
      'SCHEDULER_PARENT_LOCK_TIMEOUT',
      'SCHEDULER_PARENT_STATEMENT_TIMEOUT',
    ])
    const controlTsCodes = constCodes(
      captureControlSource,
      'BROKER_CAPTURE_CONTROL_DATABASE_ERROR_CODES',
      'CONTROL|REQUEST_AUTH|FAILURE|SCHEDULER_PARENT',
    )
    expect(new Set(controlTsCodes).size).toBe(controlTsCodes.length)
    expect([...controlTsCodes].sort()).toEqual([...controlSqlCodes].sort())
    expect(captureControlSource).toContain(
      'typeof BROKER_CAPTURE_CONTROL_DATABASE_ERROR_CODES[number]',
    )
    expect(captureControlSource).toContain(
      'new Set<BrokerCaptureControlDatabaseErrorCode>',
    )
    expect(captureControlSource).toContain('CONTROL|REQUEST_AUTH|FAILURE|SCHEDULER_PARENT')
  })

  it('keeps the productive runtime migration passive, read-only and crash-recoverable', () => {
    const fingerprint = '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96'
    const normalizedArtifact = runtimeDeploymentSql
      .replaceAll(fingerprint, '0'.repeat(64))
      .replace(/\r\n/g, '\n')
    expect(runtimeDeploymentSql.split(fingerprint)).toHaveLength(4)
    expect(createHash('sha256').update(normalizedArtifact, 'utf8').digest('hex')).toBe(fingerprint)

    for (const signature of [
      'equora_request_mexc_connection_setup_v1',
      'equora_apply_mexc_connection_setup_v1',
      'equora_request_mexc_connection_revocation_v1',
      'equora_apply_mexc_connection_revocation_v1',
      'equora_find_claimable_broker_capture_work_unit_v1',
      'equora_find_pending_yielded_broker_capture_work_unit_v1',
      'equora_find_pending_broker_capture_scope_finalization_v1',
      'equora_load_broker_capture_material_v1',
      'equora_finalize_broker_capture_scope_v1',
    ]) expect(runtimeDeploymentSql).toContain(signature)
    expect(runtimeDeploymentSql).not.toMatch(/\b(?:http_get|http_post|net\.http|cron\.schedule)\b/i)
    expect(runtimeDeploymentSql).toContain("'automaticImportAuthorized', false")
    expect(runtimeDeploymentSql).toContain("'tradingAuthorized', false")
    expect(runtimeDeploymentSql).toContain('RUNTIME_DEPLOYMENT_FUNCTION_ACL_DRIFT')
    expect(runtimeDeploymentSql).toContain('RUNTIME_DEPLOYMENT_TABLE_DRIFT')
    expect(runtimeDeploymentSql).toContain('RUNTIME_DEPLOYMENT_ENROLLMENT_ACL_DRIFT')
    expect(runtimeDeploymentSql).toMatch(
      /grant select, update on table equora_private\.broker_capture_runtime_enrollment\s+to postgres;/,
    )
    expect(runtimeDeploymentSql).toContain('RUNTIME_DEPLOYMENT_OWNER_DRIFT')
    expect(runtimeDeploymentSql.match(
      /v_user_id uuid := equora_private\.equora_request_context_uid_v1\(\);/g,
    )).toHaveLength(2)
    expect(runtimeDeploymentSql).toContain(
      '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96',
    )
    expect(runtimeDeploymentSql).toContain('receipt.request_authorization_id = request_auth.id')
    expect(runtimeDeploymentSql).toContain('where request_authorization_id = p_request_authorization_id')
    expect(runtimeDeploymentSql).toContain(
      'enrollment.broker_account_id = work_unit.broker_account_id',
    )
    expect(runtimeDeploymentIntegrationSql).toContain('RUNTIME_SETUP_ATOMIC_FOUNDATION_INVALID')
    expect(runtimeDeploymentIntegrationSql).toContain('RUNTIME_SETUP_REPLAY_CREATED_DUPLICATES')
    expect(runtimeDeploymentIntegrationSql).toContain('RUNTIME_SETUP_ACCOUNT_CAP_PARTIAL_EFFECT')
    expect(runtimeDeploymentIntegrationSql).toContain('RUNTIME_SETUP_PROBE_RESERVATION_BYPASSED')
    expect(runtimeDeploymentIntegrationSql).toContain('RUNTIME_DISABLED_ENROLLMENT_CLAIM_PARTIAL_EFFECT')
    expect(runtimeDeploymentIntegrationSql).toContain(
      'RUNTIME_SETUP_ENROLLMENT_ACCOUNT_BINDING_INVALID',
    )
    expect(runtimeDeploymentIntegrationSql).toContain('RUNTIME_REVOCATION_ATOMIC_BOUNDARY_INVALID')
    expect(runtimeDeploymentIntegrationSql).toContain('RUNTIME_DEPLOYMENT_PASSIVE_BOUNDARY_INVALID')
    expect(runtimeDeploymentIntegrationSql).toContain('to supabase_auth_admin')
    expect(runtimeDeploymentPostflightSql).toContain(
      'RUNTIME_DEPLOYMENT_ARBITRARY_ACL_SURVIVED_RERUN',
    )
  })

  it('makes the psql deployment gates preflight-bound, restore-only and process-failing on drift', () => {
    expect(capturePersistenceSql).toContain(
      'MIGRATION_LEGACY_SETUP_COLUMN_RECONCILIATION_REQUIRED',
    )
    expect(capturePersistenceSql).toContain(
      'MIGRATION_TRADE_OWNER_RECONCILIATION_REQUIRED',
    )
    expect(capturePersistenceSql).toContain('MIGRATION_TRADES_IMPORT_BATCH_FK_DRIFT')
    expect(capturePersistenceSql).toContain('MIGRATION_PGCRYPTO_WRAPPER_CONTRACT_DRIFT')
    expect(capturePersistenceSql).toContain('MIGRATION_PGCRYPTO_SCHEMA_SECURITY_DRIFT')
    expect(capturePersistenceSql.match(/security definer/g)?.length).toBeGreaterThanOrEqual(3)
    expect(capturePersistenceSql).toMatch(
      /alter function public\.equora_pgcrypto_digest_v1\(bytea, text\)\s+owner to postgres;/,
    )
    expect(capturePersistenceSql).toMatch(
      /revoke all on table public\.broker_credentials\s+from public, anon, authenticated, service_role;/,
    )
    expect(deploymentDriverSql).not.toContain('\\quit')
    expect(deploymentPreflightSql).not.toContain('\\quit')
    expect(deploymentPostflightSql).not.toContain('\\quit')
    for (const code of [
      'DEPLOY_CAPTURE_MARKER_DRIFT',
      'DEPLOY_CONTROL_MARKER_DRIFT',
      'DEPLOY_LANE_MARKER_DRIFT',
      'DEPLOY_ACTIVATION_MARKER_DRIFT',
      'DEPLOY_SCHEDULER_MARKER_DRIFT',
      'DEPLOY_RUNTIME_MARKER_DRIFT',
      'DEPLOY_PREFLIGHT_EVIDENCE_MISSING',
    ]) expect(deploymentDriverSql).toContain(code)
    expect(deploymentDriverSql.match(/already exact; skip/g)).toHaveLength(6)
    expect(deploymentPreflightSql).toContain('PREFLIGHT_BASELINE_INVALID')
    expect(deploymentPreflightSql).toContain('executor_role.rolbypassrls')
    expect(deploymentPreflightSql).toContain("executor_role.rolname = 'postgres'")
    expect(deploymentPreflightSql).toContain('PREFLIGHT_DEFAULT_ACL_INVALID')
    expect(deploymentPreflightSql).toContain('from pg_default_acl default_acl')
    expect(deploymentPreflightSql).toContain("'public', 'equora_private', 'extensions'")
    expect(deploymentPreflightSql).toContain("default_acl.defaclobjtype = 'f'")
    expect(deploymentPreflightSql).toContain("exploded.privilege_type = 'EXECUTE'")
    expect(deploymentPreflightSql).toContain("default_acl.defaclobjtype = 'n'")
    expect(deploymentPreflightSql).toContain("exploded.privilege_type = 'USAGE'")
    expect(deploymentPreflightSql).toContain('PREFLIGHT_PGCRYPTO_SECURITY_INVALID')
    expect(deploymentPreflightSql).toContain('PREFLIGHT_PLATFORM_SECURITY_INVALID')
    expect(deploymentPreflightSql).toContain('PREFLIGHT_PRIVATE_SCHEMA_STATE_INVALID')
    expect(deploymentPreflightSql).toContain(
      "has_schema_privilege(current_user, 'auth', 'usage')",
    )
    expect(deploymentPreflightSql).toContain(
      'current_user, platform_objects.uid_oid',
    )
    expect(deploymentPreflightSql).toContain(
      'current_user, platform_objects.users_oid',
    )
    expect(deploymentPreflightSql).not.toContain("'usage with grant option'")
    expect(deploymentPreflightSql).not.toContain("'execute with grant option'")
    expect(deploymentPreflightSql).toContain("'supabase_admin'")
    expect(deploymentPreflightSql).toContain("'dashboard_user'")
    expect(deploymentPreflightSql).toContain('equora_auth_schema_acl_digest')
    expect(deploymentPreflightSql).toContain('equora_auth_uid_acl_digest')
    expect(deploymentPreflightSql).toContain('\\ir verify-v57.60.1-baseline.sql')
    expect(deploymentPreflightSql).toContain('PREFLIGHT_CREDENTIAL_REFERENCE_INVALID')
    expect(deploymentPostflightSql).toContain('POSTFLIGHT_MIGRATION_MARKER_MISSING')
    expect(deploymentPostflightSql).toContain('POSTFLIGHT_RUNTIME_ACL_INVALID')
    expect(deploymentPostflightSql).toContain('POSTFLIGHT_AUTH_PLATFORM_ACL_DRIFT')
    expect(deploymentPostflightSql).toContain('aclexplode')
    for (const code of [
      'PREFLIGHT_BASELINE_CONTRACT_DRIFT',
      'POSTFLIGHT_COLUMN_CONTRACT_DRIFT',
      'POSTFLIGHT_RELATION_SECURITY_CONTRACT_DRIFT',
      'POSTFLIGHT_FUNCTION_CONTRACT_DRIFT',
      'POSTFLIGHT_RELATION_SECURITY_CONTRACT_DRIFT',
      'PREFLIGHT_PARTIAL_MIGRATION_RESTORE_REQUIRED',
      'POSTFLIGHT_TRIGGER_CONTRACT_DRIFT',
      'POSTFLIGHT_AUTHORITY_SECURITY_CONTRACT_DRIFT',
      'POSTFLIGHT_SCHEMA_ACL_CONTRACT_DRIFT',
      'POSTFLIGHT_PLATFORM_SECURITY_CONTRACT_DRIFT',
      'PREFLIGHT_DEFAULT_ACL_INVALID',
      'PREFLIGHT_EXECUTOR_CAPABILITY_INVALID',
    ]) expect(deploymentDriftRunner).toContain(code)
    expect(deploymentBaselineVerifierSql).toMatch(
      /trigger_row\.tgisinternal is false\s+or constraint_row\.oid is not null/,
    )
    expect(deploymentBaselineVerifierSql).not.toContain('attribute_row.attnum ||')
    expect(deploymentBaselineVerifierSql).toContain(
      'ac2bfb251aeb645dd3450e3b02d3f6d2ae5cb0aeeaa751e5a5a54f87a410c656',
    )
    expect(deploymentBaselineVerifierSql).toContain(
      '0fb6a0d531bb7cc66996c8b2d4f272f61dacefdb0e8969c536d1d49c89517218',
    )
    expect(restoredCredentialAclRepairSourceSql).toContain(
      '47cbc3bd6d4be8ccccf8543a1f1be554610fe20b5746478e6ca94664525daffb',
    )
    expect(restoredCredentialAclRepairSourceSql).toContain(
      'BASELINE_REPAIR_SOURCE_CONTRACT_DRIFT',
    )
    const baselineContractQuery = deploymentBaselineVerifierSql.match(
      /with contract_rows\(value\) as \([\s\S]+?from contract_rows;/,
    )?.[0]
    const repairSourceContractQuery = restoredCredentialAclRepairSourceSql.match(
      /with contract_rows\(value\) as \([\s\S]+?from contract_rows;/,
    )?.[0]
    expect(baselineContractQuery).toBeTruthy()
    expect(repairSourceContractQuery).toBe(baselineContractQuery)
    expect(deploymentBaselineVerifierSql).not.toContain(
      '47cbc3bd6d4be8ccccf8543a1f1be554610fe20b5746478e6ca94664525daffb',
    )
    expect(deploymentBaselineVerifierSql).not.toContain(
      'allow_exact_v57601_credential_acl_repair',
    )
    expect(restoredCredentialAclRepairSql).not.toContain(
      'allow_exact_v57601_credential_acl_repair',
    )
    expect(restoredCredentialAclRepairSql).toContain(
      '\\ir assert-v57.60.1-restored-credential-acl-repair-source.sql',
    )
    expect(restoredV57601UpgradeRunner).toContain(
      "set equora.allow_exact_v57601_credential_acl_repair = 'on'",
    )
    expect(restoredV57601UpgradeRunner).toContain(
      "-ExpectedCode 'BASELINE_REPAIR_SOURCE_CONTRACT_DRIFT'",
    )
    expect(restoredCredentialAclRepairSql).toContain(
      'revoke all privileges on table public.broker_credentials',
    )
    expect(restoredCredentialAclRepairSql).toContain(
      'BASELINE_REPAIR_POSTCONDITION_INVALID',
    )
    expect(deploymentContractVerifierSql).toMatch(
      /trigger_row\.tgisinternal is false\s+or constraint_row\.oid is not null/,
    )
    expect(deploymentContractVerifierSql).toContain(
      "raise exception 'POSTFLIGHT_PLATFORM_SECURITY_CONTRACT_DRIFT'",
    )
    expect(deploymentContractVerifierSql).toContain(
      'equora_private.equora_request_context_uid_v1()',
    )
    expect(deploymentContractVerifierSql).toContain(
      'auth_explicit_capture_owner_acl_count',
    )
    expect(deploymentContractVerifierSql).toContain(
      'POSTFLIGHT_PGCRYPTO_SCHEMA_SECURITY_DRIFT',
    )
    expect(deploymentContractVerifierSql).toContain(
      'pgcrypto_namespace|invalid_nonowner_acl_count',
    )
    expect(deploymentContractVerifierSql).toContain(
      'pgcrypto_namespace|capture_owner_usage_valid',
    )
    expect(hostedSupabaseFixtureSql).toContain('alter function auth.uid() owner to supabase_auth_admin')
    expect(hostedSupabaseCompatRunner).toContain('alter role postgres nosuperuser createrole bypassrls')
    expect(hostedSupabaseCompatRunner).toContain(
      'f|t|t|t|f|t|f|t',
    )
    expect(hostedSupabaseCompatRunner).toContain(
      'Hosted Supabase v17 non-superuser compatibility and drift oracles passed.',
    )
    expect(restoredV57601FixtureSql).toContain('trades_import_batch_id_fkey')
    expect(restoredV57601FixtureSql).toContain('trade_import_batches_delete_own')
    expect(restoredV57601UpgradeRunner).toContain(
      'MIGRATION_LEGACY_SETUP_COLUMN_RECONCILIATION_REQUIRED:name',
    )
    expect(restoredV57601UpgradeRunner).toContain(
      'MIGRATION_TRADE_OWNER_RECONCILIATION_REQUIRED',
    )
    expect(restoredV57601UpgradeRunner).toContain(
      'PREFLIGHT_BASELINE_CONTRACT_DRIFT',
    )
    expect(restoredV57601UpgradeRunner).toContain(
      'Exact restored credential ACL drift fixture',
    )
    expect(restoredV57601UpgradeRunner).toContain(
      'Non-exact credential ACL repair drift mutation',
    )
    expect(restoredV57601UpgradeRunner).toContain(
      'Restored exact re-run changed immutable migration receipts.',
    )
    expect(restoredV57601UpgradeRunner).toContain(
      'alter extension pgcrypto set schema public;',
    )
    expect(restoredV57601UpgradeRunner).toContain(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(restoredV57601UpgradeRunner).toContain(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    )
    expect(restoredV57601UpgradeRunner).toContain(
      'permission denied for schema extensions',
    )
    expect(restoredV57601UpgradeRunner).toContain(
      'negative oracles skipped here and covered by the mandatory extensions run',
    )
    expect(allLocalSqlRunner).toContain(
      "-PgcryptoSchema public -SkipNegativeOracles",
    )
    for (const hash of [
      '91306cab2e10611b78ddc975b178317d2d44fd633c02b2da7aff30a7194c1e20',
      '2f943b4bc2672842d23004a95e3f69188e6a0c5e6048170c97886c11a9a1a359',
      '1b9f219d66bf586ca5ec98d736ecde49a1e46e5dc8a0751c6fef2655c62b9586',
      'acd317c2a68f2028cb2573a94ba3ac917112af480a98aa7d68adef7e8e4a2ce8',
      'c3ce058a00fb5f6c7e6f40ed32a70eb5e80e161a859098d11e64d18105c4eb60',
      'eea9953ad30c53f83b3c94a8b9e315ef6b007222a759dafbe7922a3f50f6215a',
      'dc03fc52f8302cde82531aede2b06fa1a05207162cc3fde12f2dedb30ae1c42e',
      'f14e56c198abf499e69213f6875225c3b8cd10e922f46644774c37c8d6952ca6',
    ]) expect(deploymentContractVerifierSql).toContain(hash)
    expect(deploymentDriftRunner).toContain("Name = 'schema_auth_foreign_create'")
    expect(deploymentDriftRunner).toContain(
      'alter default privileges for role postgres in schema public grant select on tables to public;',
    )
    expect(deploymentDriftRunner).toContain('PUBLIC_DEFAULT_ACL_REACHED_DDL')
    expect(deploymentDriftRunner).toContain(
      'grant create on schemas to authenticated;',
    )
    expect(deploymentDriftRunner).toContain(
      'grant create on schema extensions to authenticated;',
    )
    expect(deploymentDriftRunner).toContain(
      'grant execute on functions to authenticated with grant option;',
    )
    expect(deploymentDriftRunner).toContain('EXTENSIONS_DEFAULT_ACL_REACHED_DDL')
    expect(deploymentDriftRunner).toContain(
      'grant usage on schema extensions to public;',
    )
    expect(deploymentDriftRunner).toContain('PGCRYPTO_PUBLIC_USAGE_REACHED_DDL')
    expect(deploymentDriftRunner).toContain('PGCRYPTO_SCHEMA_DRIFT_REACHED_DDL')
    expect(deploymentDriftRunner).toContain(
      'POSTFLIGHT_PGCRYPTO_SCHEMA_SECURITY_DRIFT',
    )
    expect(deploymentDriftRunner).toContain('Full v57.61.0 marker-skip drift matrix passed.')
    expect(constraintTriggerDriftRunner).toContain('trigger_row.tgisinternal')
    expect(constraintTriggerDriftRunner).toContain('trigger_row.tgenabled = \'O\'')
    expect(constraintTriggerDriftRunner).toContain('PREFLIGHT_BASELINE_CONTRACT_DRIFT')
    expect(constraintTriggerDriftRunner).toContain('POSTFLIGHT_TRIGGER_CONTRACT_DRIFT')
    expect(constraintTriggerDriftRunner).toContain(
      'Baseline and full-marker internal FK-trigger drift oracles passed.',
    )
    for (const fingerprint of [
      '492ebad5496806ad60425abd58e9801c58a58b421e38392d54e6082d7fa2b083',
      'c133d5e0c987e7f927963db4465ef5ab2f6f4c174cfdc96a3ed1cffb5cd62be5',
      '6be313155e81e0f14c48d0c71301e28a75b792a90e49542bc49ffe638f56c68d',
      'b074a756a015b34a7e3da804f3d3955100a40f9a6391855a75c1e415cbbb2abb',
      '87158546782b900817d3f36501a2e43b5619906a2f07636d0cb1167b042e5ab7',
      '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96',
    ]) {
      expect(deploymentDriverSql).toContain(fingerprint)
      expect(deploymentPostflightSql).toContain(fingerprint)
    }
  })
})

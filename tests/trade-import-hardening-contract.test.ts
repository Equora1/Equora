import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BROKER_FILE_IMPORT_CAPABILITY_CONTRACT_VERSION,
  BROKER_FILE_IMPORT_DATABASE_GATE_KEY,
  brokerFileImportCapability,
} from "../lib/utils/broker-file-import-capability";
import { csvImportPresets } from "../lib/utils/trade-import";

const root = process.cwd();
const source = (path: string) =>
  readFileSync(resolve(root, path), "utf8");

describe("trade import hardening release package", () => {
  const sqlPath =
    "supabase/schema-patch-v57.62.0-trade-import-hardening.sql";
  const sql = source(sqlPath);
  const preflight = source("supabase/preflight-v57.62.0-trade-import.sql");
  const deployment = source("supabase/deploy-v57.62.0-trade-import.sql");
  const postflight = source("supabase/postflight-v57.62.0-trade-import.sql");
  const verifier = source("supabase/verify-v57.62.0-trade-import.sql");
  const activation = source("supabase/activate-v57.62.0-trade-import.sql");
  const deactivation = source("supabase/deactivate-v57.62.0-trade-import.sql");
  const releaseGate = source(
    "docs/gates/EQUORA_v57.62.0_FILE_IMPORT_RELEASE_GATE.md",
  );
  const action = source("app/actions/trade-import.ts");
  const panel = source("components/trades/trade-import-panel.tsx");
  const share = source("app/actions/shared-trades.ts");
  const dashboard = source("components/dashboard/equity-curve-card.tsx");
  const dashboardData = source("lib/server/journal.ts");
  const postgresRunner = source(
    "tests/sql/run-trade-import-hardening.ps1",
  );
  const postgresTestLib = source(
    "tests/sql/trade-import-hardening-test-lib.ps1",
  );
  const postgresIntegration = source(
    "tests/sql/trade-import-hardening.integration.sql",
  );
  const postgresConcurrency = source(
    "tests/sql/run-trade-import-hardening-concurrency.ps1",
  );
  const postgresNegative = source(
    "tests/sql/run-trade-import-v5762-release-negative.ps1",
  );

  it("keeps the additive v57.62 patch outside the immutable v57.61 deploy driver", () => {
    const deploy = source("supabase/deploy-v57.61.0.sql");

    expect(sql).toContain("Installation remains default-off");
    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
    expect(deploy).not.toContain(
      "schema-patch-v57.62.0-trade-import-hardening.sql",
    );
  });

  it("binds deployment to one exact migration receipt and a default-off driver", () => {
    const migrationId = "equora_v57.62.0_trade_import_persistence_v1";
    const fingerprint =
      "014731e263ec2f0ffc9b0e16962b5d5574516a0c975a1713580740fa3bc6413d";

    for (const releaseContract of [sql, preflight, verifier]) {
      expect(releaseContract).toContain(migrationId);
      expect(releaseContract).toContain(fingerprint);
    }
    expect(deployment).toContain(
      "\\ir preflight-v57.62.0-trade-import.sql",
    );
    expect(deployment).toContain(
      "\\ir schema-patch-v57.62.0-trade-import-hardening.sql",
    );
    expect(deployment).toContain(
      "\\ir postflight-v57.62.0-trade-import.sql",
    );
    expect(deployment).not.toContain("activate-v57.62.0-trade-import.sql");
    expect(sql).toMatch(
      /insert into equora_private\.schema_migrations[\s\S]*?on conflict \(migration_id\) do nothing;/u,
    );
  });

  it("preflights the exact predecessor and rejects partial or drifted states", () => {
    expect(preflight).toContain("begin transaction read only");
    expect(preflight).toContain("current_user = 'postgres'");
    expect(preflight).toContain("current_setting('server_version_num')");
    expect(preflight).toContain(
      "where migration_id like 'equora_v57.61.0%'",
    );
    expect(preflight).toContain(") = 7");
    expect(preflight).toContain("v5762_pre_trades_count");
    expect(preflight).toContain("v5762_pre_batches_count");
    expect(preflight).toContain("TRADE_IMPORT_PREFLIGHT_UNKNOWN_MARKER");
    expect(preflight).toContain("TRADE_IMPORT_PREFLIGHT_MARKER_DRIFT");
    expect(preflight).toContain("TRADE_IMPORT_PREFLIGHT_PARTIAL_STATE");
    expect(preflight).toContain("\\set v5762_apply_required true");
    expect(preflight).toContain("\\set v5762_apply_required false");
  });

  it("postflights semantic security, catalog, receipt and data-count invariants", () => {
    expect(postflight).toContain(
      "\\ir verify-v57.62.0-trade-import.sql",
    );
    expect(postflight).toContain("v5762_existing_row_counts_unchanged");
    expect(postflight).toContain("TRADE_IMPORT_POSTFLIGHT_BASELINE_MISSING");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_MIGRATION_RECEIPT_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_RELATION_SECURITY_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_CONSTRAINTS_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_INDEXES_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_RLS_POLICIES_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_TABLE_PRIVILEGES_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_FUNCTION_SECURITY_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_FUNCTION_PRIVILEGES_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_ACTIVATION_STATE_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_KEY_CONSTRAINT_SHAPE_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_INDEX_SHAPE_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_RLS_POLICY_SHAPE_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_TABLE_ACL_SHAPE_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_FUNCTION_ACL_SHAPE_INVALID");
    expect(verifier).toContain("'service_role'");
  });

  it("keeps activation separate, atomic, reversible and non-destructive", () => {
    expect(activation).toContain("for update");
    expect(activation).toContain("set enabled = true");
    expect(activation).toContain("and not enabled");
    expect(activation).toContain("TRADE_IMPORT_ACTIVATION_CAS_FAILED");
    expect(deactivation).toContain("for update");
    expect(deactivation).toContain("set enabled = false");
    expect(deactivation).toContain("activated_at = null");
    expect(deactivation).toContain("TRADE_IMPORT_DEACTIVATION_CAS_FAILED");
    for (const gateTransition of [activation, deactivation]) {
      expect(gateTransition).not.toMatch(/\b(?:drop|truncate|delete)\b/iu);
      expect(gateTransition).not.toMatch(/\b(?:credential|cron|capture)\b/iu);
      expect(gateTransition).not.toContain("\\ir postflight-v57.62.0-trade-import.sql");
      expect(gateTransition).not.toContain(
        "\\ir preflight-v57.62.0-trade-import.sql",
      );
      expect(gateTransition).not.toContain("v5762_pre_trades_count");
      expect(gateTransition).not.toContain("v5762_pre_batches_count");
    }
    expect(deactivation).not.toContain("\\ir verify-v57.62.0-trade-import.sql");
    expect(activation.lastIndexOf("\\ir verify-v57.62.0-trade-import.sql")).toBeLessThan(activation.indexOf("commit;"));
  });

  it("separates historical evidence, current local verification and production gates", () => {
    const historicalEvidence = releaseGate.slice(
      releaseGate.indexOf("## 6. Historischer Nachweis"),
      releaseGate.indexOf("## 8. Lokaler PostgreSQL-Abschluss"),
    );
    const currentEvidence = releaseGate.slice(
      releaseGate.indexOf("## 8. Lokaler PostgreSQL-Abschluss"),
    );
    expect(releaseGate).toContain(
      "Status: **LOCAL CANDIDATE / NO-GO für Staging ohne neue konkrete Freigabe**",
    );
    expect(historicalEvidence).toContain("Fokussierte statische Verträge: **PASS, 42/42**");
    expect(historicalEvidence).toContain("777/777 Tests");
    expect(historicalEvidence).toContain("Lokaler Next.js-Production-Build: **PASS**");
    expect(historicalEvidence).toContain("Disposable PostgreSQL-Gate: **OFFEN**");
    expect(historicalEvidence).toContain("Gesamtentscheidung **NO-GO**");
    expect(currentEvidence).toContain("Dieser Abschnitt ersetzt die offenen Docker-/CHECK-Angaben");
    expect(currentEvidence).toContain("alle 13 vollständigen CHECK-Definitionen");
    expect(currentEvidence).toContain("lokale, synthetische PostgreSQL-Evidenz");
    expect(currentEvidence).toContain("weiterhin ausdrücklich nicht als bestanden ausgegeben");
    expect(currentEvidence).toContain("Vor einer Staging-Entscheidung");
    expect(releaseGate).toContain("Separate Freigabe zur Datenbank-Gate-Aktivierung");
    expect(releaseGate).toContain(
      "Separate Freigabe für App-Merge einschließlich Vercel-Production-Wirkung",
    );
    expect(releaseGate).not.toContain("produktiver Dateiimport ist aktiviert");
  });

  it("uses durable owner-bound account identities instead of editable labels as keys", () => {
    expect(sql).toContain(
      "create table if not exists public.journal_import_accounts",
    );
    expect(sql).toContain(
      "constraint journal_import_accounts_user_id_id_key unique (user_id, id)",
    );
    expect(sql).toContain(
      "unique (user_id, preset_key, normalized_label)",
    );
    expect(sql).toContain(
      "foreign key (user_id, import_account_id)",
    );
    expect(sql).toContain(
      "references public.journal_import_accounts (user_id, id)",
    );
    expect(action).not.toContain(
      'supabase.rpc("equora_upsert_import_account_v1"',
    );
    expect(sql).toContain(
      "v_account_result := public.equora_upsert_import_account_v1(",
    );
    expect(action).toContain(
      "p_import_account_id: requestedAccountId || null",
    );
    expect(panel).toContain("selectedImportAccountId");
    expect(panel).toContain("dauerhafte interne ID");
  });

  it("reserves canonical source keys atomically before trade creation", () => {
    expect(sql).toContain(
      "create table if not exists public.trade_import_source_keys",
    );
    expect(sql).toContain(
      "create unique index if not exists trade_import_source_keys_active_identity_key",
    );
    expect(sql).toContain(
      "user_id, import_account_id, preset_key, source_kind, source_digest",
    );
    expect(sql).toContain("pg_catalog.sha256(");
    expect(sql).toContain("where status = 'active'");
    expect(sql).toContain("v_reserved_source_kind := 'request_row_v1'");
    expect(sql).toContain("'equora-import-request-row-v1'");
    expect(sql).toContain("v_trade_snapshot_digest");
    expect(sql).toContain("v_provider_identity_digest := encode(");
    expect(sql).toContain(
      "v_provider_identity_kind <> v_required_provider_identity_kind",
    );
    expect(sql).toContain("raise exception 'REQUIRED_PROVIDER_IDENTITY_MISSING'");
    expect(sql).toContain("raise exception 'PROVIDER_IDENTITY_NOT_ALLOWED'");
    expect(sql).toContain("v_source_key - array['kind', 'identityKind', 'identityValue']");
    expect(sql).not.toContain("jsonb_object_length");
    expect(sql).not.toContain("value_fingerprint_v1");
    expect(action).not.toContain('kind: "value_fingerprint_v1"');

    const reservation = sql.indexOf(
      "insert into public.trade_import_source_keys",
    );
    const conflictGuard = sql.indexOf(
      "on conflict (user_id, import_account_id, preset_key, source_kind, source_digest)",
      reservation,
    );
    const createTrade = sql.indexOf(
      "perform public.equora_create_trade_v1",
      conflictGuard,
    );
    expect(reservation).toBeGreaterThan(0);
    expect(conflictGuard).toBeGreaterThan(reservation);
    expect(createTrade).toBeGreaterThan(conflictGuard);
  });

  it("keeps direct table writes closed and owner-scoped reads under RLS", () => {
    expect(sql).toContain(
      "alter table public.journal_import_accounts enable row level security",
    );
    expect(sql).toContain(
      "alter table public.trade_import_source_keys enable row level security",
    );
    expect(sql).toContain(
      "using ((select auth.uid()) = user_id)",
    );
    expect(sql).toMatch(
      /revoke all on table public\.journal_import_accounts\s+from public, anon, authenticated, service_role;/u,
    );
    expect(sql).toMatch(
      /revoke all on table public\.trade_import_source_keys\s+from public, anon, authenticated, service_role;/u,
    );
    expect(sql).toContain(
      "revoke all on table public.equora_runtime_capability_gates",
    );
  });

  it("keeps file-import persistence database-authoritative and default-off", () => {
    expect(brokerFileImportCapability).toMatchObject({
      contractVersion: BROKER_FILE_IMPORT_CAPABILITY_CONTRACT_VERSION,
      databaseGateKey: BROKER_FILE_IMPORT_DATABASE_GATE_KEY,
      databaseGateContractVersion:
        BROKER_FILE_IMPORT_CAPABILITY_CONTRACT_VERSION,
      deploymentState: "migration_pending",
      persistenceEnabled: false,
    });
    expect(sql).toContain(
      "create table if not exists public.equora_runtime_capability_gates",
    );
    expect(sql).toContain(`'${BROKER_FILE_IMPORT_DATABASE_GATE_KEY}'`);
    expect(sql).toContain(
      `'${BROKER_FILE_IMPORT_CAPABILITY_CONTRACT_VERSION}'`,
    );
    expect(sql).toMatch(
      /insert into public\.equora_runtime_capability_gates[\s\S]*?false,[\s\S]*?null[\s\S]*?on conflict \(capability_key, contract_version\) do nothing;/u,
    );
    expect(sql).not.toMatch(
      /update public\.equora_runtime_capability_gates[\s\S]*?enabled\s*=\s*true/iu,
    );

    const gateGuard = sql.indexOf(
      "from public.equora_runtime_capability_gates gate",
    );
    const disabledError = sql.indexOf(
      "raise exception 'IMPORT_PERSISTENCE_DISABLED'",
      gateGuard,
    );
    const inputValidation = sql.indexOf("if p_batch_id is null", disabledError);
    const firstMutation = sql.indexOf(
      "v_account_result := public.equora_upsert_import_account_v1(",
      inputValidation,
    );
    expect(gateGuard).toBeGreaterThan(0);
    expect(disabledError).toBeGreaterThan(gateGuard);
    expect(inputValidation).toBeGreaterThan(disabledError);
    expect(firstMutation).toBeGreaterThan(inputValidation);
  });

  it("keeps the SQL allowlist in parity with the provider-neutral preset registry", () => {
    for (const preset of csvImportPresets) {
      expect(sql).toContain(`'${preset.key}'`);
    }
    expect(
      csvImportPresets
        .filter((preset) => preset.sourceIdentity)
        .map((preset) => [preset.key, preset.sourceIdentity?.kind]),
    ).toEqual([
      ["metatrader4-history", "ticket"],
      ["ctrader-history", "deal_id"],
    ]);
    expect(sql).toContain("when 'ctrader-history' then 'deal_id'");
    expect(sql).toContain("when 'metatrader4-history' then 'ticket'");
    expect(sql).toContain(
      "v_provider_identity_kind <> v_required_provider_identity_kind",
    );
    expect(sql).toContain(
      "octet_length(coalesce(p_trades, '[]'::jsonb)::text) > 20971520",
    );
  });

  it("declares SQL state and preserves a validated source-row currency", () => {
    expect(sql).toContain("v_source_key jsonb;");
    expect(sql).toContain("raise exception 'INVALID_TRADE_CURRENCY'");
    expect(sql).toContain(
      "'account_currency', upper(btrim(v_trade->>'account_currency'))",
    );
    expect(sql).not.toContain(
      "'account_currency', p_batch->>'account_currency'",
    );
  });

  it("preserves dedupe tombstones before deleting reverted trades", () => {
    const tombstone = sql.indexOf(
      "update public.trade_import_source_keys",
    );
    const deleteTrades = sql.indexOf(
      "delete from public.trades",
      tombstone,
    );
    expect(tombstone).toBeGreaterThan(0);
    expect(sql.slice(tombstone, deleteTrades)).toContain(
      "status = 'reverted'",
    );
    expect(sql.slice(tombstone, deleteTrades)).toContain("trade_id = null");
    expect(deleteTrades).toBeGreaterThan(tombstone);
    expect(sql).toContain("where status = 'active'");
    expect(sql).toContain("trade_snapshot jsonb not null");
    expect(sql).toContain("snapshot_digest text not null");
    expect(sql).toContain(
      "'equora-trade-import-financial-snapshot-v1'",
    );
  });

  it("uses the v2 RPC result as the authoritative import report", () => {
    expect(action).toContain('"equora_import_trades_v2"');
    expect(action).not.toContain(
      'supabase.rpc("equora_import_trades_v1"',
    );
    expect(action).toContain("source_keys:");
    expect(action).toContain("p_import_account_id: requestedAccountId || null");
    expect(action).not.toContain("existingTrades");
    expect(action).not.toContain("totalDuplicateCount");
    expect(action).toContain("p_source_rows:");
    expect(action).toContain("const duplicateCount = Math.max(0, importResult.duplicateCount");
    expect(action).toContain("authoritativeImportedIds");
    expect(action).toContain(
      "importedCount + duplicateCount + skippedCount + invalidCount",
    );
    expect(action).toContain("authoritativeImportedIds.length !== importedCount");
    expect(sql).toContain("v_duplicates integer := 0");
    expect(sql).not.toContain("p_batch->>'duplicate_count'");
    expect(sql).toContain(
      "revoke all on function public.equora_import_trades_v1(",
    );
    expect(sql).toMatch(
      /equora_import_trades_v1\([\s\S]*?from public, anon, authenticated, service_role;/u,
    );
    expect(sql).toMatch(
      /equora_upsert_import_account_v1\([\s\S]*?from public, anon, authenticated, service_role;/u,
    );
    expect(panel.indexOf("if (!result.success)")).toBeLessThan(
      panel.indexOf("setLastImportReport({"),
    );
    expect(panel).toContain("importedCount: result.importedCount ?? 0");
    expect(panel).not.toContain(
      "importedCount: result.importedCount ?? drafts.length",
    );
  });

  it("serializes and binds exact batch replays before account mutation", () => {
    const lock = sql.indexOf("pg_catalog.pg_advisory_xact_lock");
    const replay = sql.indexOf("BATCH_REPLAY_MISMATCH", lock);
    const accountMutation = sql.indexOf(
      "v_account_result := public.equora_upsert_import_account_v1(",
      replay,
    );
    expect(lock).toBeGreaterThan(0);
    expect(replay).toBeGreaterThan(lock);
    expect(accountMutation).toBeGreaterThan(replay);
    expect(sql).toContain("request_digest text");
    expect(sql).toContain("'equora-import-request-v2'");
    expect(sql).toContain("'alreadyApplied', true");
    expect(sql).toContain("BATCH_REVERTED_REQUIRES_NEW_ID");
    expect(sql).toContain("BATCH_REPLAY_STATE_INVALID");
  });

  it("binds every submitted source row and derives counts on the server", () => {
    expect(sql).toContain("p_source_rows jsonb");
    expect(sql).toContain("SOURCE_MANIFEST_MISMATCH");
    expect(sql).toContain("source_manifest_digest text");
    expect(sql).toContain("source_manifest jsonb");
    expect(sql).toContain("v_source_row_count, p_source_rows");
    expect(sql).toContain("v_source_row_count := jsonb_array_length(p_source_rows)");
    expect(sql).toContain("'sourceRowCount', v_source_row_count");
    expect(sql).toContain("source_row - array['row_number', 'preview_status', 'selected']");
    expect(sql).toContain("trade_entry - array['row_number', 'trade', 'tags', 'source_keys']");
    expect(action).toContain("getSourceManifestIssue(sourceRows, input.rows)");
    expect(panel).toContain("sourceRows: previewRows.map");
  });

  it("generates trade IDs server-side and keeps receipt time server-authoritative", () => {
    expect(sql).toContain("v_trade_id := gen_random_uuid()");
    expect(sql).toContain("- 'id' - 'user_id' - 'import_batch_id'");
    expect(action).not.toContain("const tradeId = crypto.randomUUID()");
    expect(action).toContain("importedAt: null");
    expect(action).not.toContain("importedAt: timestamp");
    expect(sql).toContain("p_batch_id, v_user_id, v_import_account_id, now()");
  });

  it("fails closed on spreadsheet overwidth and timezone-free broker dates", () => {
    expect(panel).toContain("row.length > headers.length");
    expect(panel).toContain("Excel-Zeile");
    expect(panel).toContain("parseUtcOffsetMinutes(statementUtcOffset)");
    expect(panel).not.toContain('selectedPreset === "ctrader-history" ? (');
  });

  it("ships an executable disposable PostgreSQL evidence gate", () => {
    expect(postgresTestLib).toContain(
      "public.ecr.aws/supabase/postgres:17.6.1.084",
    );
    expect(postgresTestLib).toContain(
      "sha256:95d92e9563121189086690a4b7f8f2b711a4809a2499f45592199aae68ebae5f",
    );
    expect(postgresTestLib).toContain("NetworkMode");
    expect(postgresTestLib).toContain("Privileged");
    expect(postgresTestLib).toContain("MountCount=0");
    expect(postgresTestLib).toContain(
      "$mountCount = [int]$container.Mounts.Count",
    );
    expect(postgresTestLib).not.toContain("@($container.Mounts).Count");
    expect(postgresTestLib).toContain("PidMode");
    expect(postgresTestLib).toContain("IpcMode");
    expect(postgresTestLib).toContain("com.equora.disposable-harness");
    expect(postgresTestLib).toContain("ON_ERROR_STOP=1");
    expect(postgresTestLib).toContain("Expand-TradeImportPreflight");
    expect(postgresTestLib).toContain("Expand-TradeImportDeployment");
    expect(postgresTestLib).toContain("Assert-TradeImportBaseMarkers");
    expect(postgresTestLib).toContain(
      "legacy local postflight not claimed",
    );
    expect(postgresTestLib).not.toContain(
      "run-v57.61.0-deployment.ps1",
    );
    expect(postgresRunner).toContain("Install-TradeImportRelease");
    expect(
      postgresRunner.match(/Install-TradeImportRelease/g),
    ).toHaveLength(3);
    expect(postgresRunner).toContain("Set-TradeImportActivationState -Enabled $true");
    expect(postgresRunner).toContain("Set-TradeImportActivationState -Enabled $false");
    expect(postgresRunner).toContain("Get-TradeImportPersistenceSnapshot");
    expect(postgresTestLib).toContain("function Set-TradeImportActivationState");
    expect(postgresTestLib).toContain("function Get-TradeImportPersistenceSnapshot");
    expect(postgresRunner).toContain("Invoke-TradeImportIntegration");
    expect(postgresRunner).toContain(
      "run-trade-import-hardening-concurrency.ps1",
    );
    expect(postgresRunner).toContain(
      "run-trade-import-v5762-release-negative.ps1",
    );
    expect(postgresRunner.match(/Set-TradeImportActivationState -Enabled \$true/g)).toHaveLength(2);
    expect(postgresRunner.match(/Set-TradeImportActivationState -Enabled \$false/g)).toHaveLength(2);
    expect(postgresTestLib).toContain(
      "function Invoke-TradeImportSqlExpectFailure",
    );
    expect(postgresNegative).toContain(
      "TRADE_IMPORT_PREFLIGHT_PARTIAL_STATE",
    );
    expect(postgresNegative).toContain(
      "TRADE_IMPORT_PREFLIGHT_MARKER_DRIFT",
    );
    expect(postgresNegative).toContain(
      "TRADE_IMPORT_PREFLIGHT_UNKNOWN_MARKER",
    );
    expect(postgresNegative).toContain(
      "TRADE_IMPORT_VERIFY_INDEX_SHAPE_INVALID",
    );
    expect(postgresNegative).toContain(
      "TRADE_IMPORT_VERIFY_KEY_CONSTRAINT_SHAPE_INVALID",
    );
    expect(postgresConcurrency).toContain(
      "deactivate-v57.62.0-trade-import.sql",
    );
    expect(postgresConcurrency).toContain(
      "'gate_deactivate'",
    );
    expect(postgresIntegration).toContain("TEST_LEGACY_IMPORT_EXECUTE_OPEN");
    expect(postgresIntegration).toContain("TEST_RPC_SECURITY_CONTRACT_INVALID");
    expect(postgresIntegration).toContain("BATCH_REPLAY_MISMATCH");
    expect(postgresIntegration).toContain("BATCH_REVERTED_REQUIRES_NEW_ID");
    expect(postgresIntegration).toContain("request_row_v1");
    expect(postgresIntegration).toContain("trade_snapshot");
    expect(postgresIntegration).toContain("INVALID_TRADE_CURRENCY");
    expect(postgresIntegration).toContain(
      "TEST_POST_RESERVATION_ROLLBACK_FAILED",
    );
    expect(postgresIntegration).toContain(
      "'not-a-uuid','Rollback Account'",
    );
    expect(postgresIntegration).toContain(
      "TEST_CTRADER_PROVIDER_IDENTITY_INVALID",
    );
    expect(postgresIntegration).toContain("TEST_AUTHENTICATED_IMPORT_FAILED");
    expect(postgresIntegration).toContain("TEST_AUTHENTICATED_REVERT_FAILED");
    expect(postgresIntegration).toContain("TEST_DISABLED_DIRECT_IMPORT_MUTATED");
    expect(postgresIntegration).toContain("TEST_REVOKED_ACTIVATION_STATE_INVALID");
    expect(postgresIntegration).toContain("media_cleanup_outbox");
    expect(postgresIntegration).toContain("alreadyReverted");
    expect(postgresIntegration).toContain("set local role authenticated");
    expect(postgresConcurrency).toContain("Start-Job");
    expect(postgresConcurrency).toContain("Stop-Job");
    expect(postgresConcurrency).toContain("finally");
    expect(postgresConcurrency).toContain("pg_stat_activity");
    expect(postgresConcurrency).toContain("transactionid");
    expect(postgresConcurrency).toContain("advisory");
    expect(postgresConcurrency).toContain("Wait-Job");
    expect(postgresConcurrency).toContain("BATCH_REPLAY_MISMATCH");
    expect(postgresConcurrency).toContain("importedCount");
    expect(postgresConcurrency).toContain("duplicateCount");
  });

  it("binds time limits to the public RPC and requires a prearmed session timer", () => {
    const accountRoutine = sql.slice(sql.indexOf("create or replace function public.equora_upsert_import_account_v1"), sql.indexOf("create or replace function public.equora_import_trades_v2"));
    const importRoutine = sql.slice(sql.indexOf("create or replace function public.equora_import_trades_v2"), sql.indexOf("create or replace function public.equora_revert_import_v1"));
    expect(accountRoutine).not.toContain("set lock_timeout");
    expect(importRoutine).toContain("set lock_timeout = '3s'");
    expect(importRoutine).not.toContain("set statement_timeout");
    expect(importRoutine).toContain("setting::bigint between 1 and 30000");
    expect(importRoutine).toContain("nullif(v_entry->'trade'->>'created_at', '') is null");
    expect(importRoutine.indexOf("IMPORT_STATEMENT_TIMEOUT_REQUIRED")).toBeLessThan(importRoutine.indexOf("v_account_result :="));
  });

  it("rejects NULL-sensitive ACL drift and separate column grants", () => {
    expect(verifier).toContain("aclexplode(attribute_row.attacl)");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_COLUMN_ACL_INVALID");
    expect(deactivation).toContain("pg_catalog.pg_inherits");
    expect(deactivation).not.toContain("not tgisinternal");
    expect(postgresNegative).toContain("Internal gate cascade trigger");
    expect(postgresNegative).toContain("Inherited gate child");
    expect(verifier).toContain("coalesce(grantee_row.rolname, '') = 'authenticated'");
    expect(verifier).toContain("source_manifest_digest is distinct from encode");
    expect(sql).toMatch(/snapshot_digest ~ '\^\[0-9a-f\]\{64\}\$'\s*\) is true\)/u);
  });

  it("reads the financial snapshot back from the persisted row", () => {
    const createTrade = sql.indexOf("perform public.equora_create_trade_v1");
    const readBack = sql.indexOf("select * into strict v_persisted_trade", createTrade);
    const snapshotWrite = sql.indexOf("set trade_id = v_trade_id, trade_snapshot = v_trade_snapshot", readBack);
    expect(readBack).toBeGreaterThan(createTrade);
    expect(snapshotWrite).toBeGreaterThan(readBack);
    expect(sql).toContain("'partial_exits', 'r_multiple', 'pnl_mode', 'cost_profile'");
    expect(sql).not.toContain("'riskAmount'");
    expect(sql).not.toContain("'captureResult'");
    expect(sql).toContain("PROVIDER_IDENTITY_FINANCIAL_CONFLICT");
    expect(postgresIntegration).toContain("TEST_CHANGED_PROVIDER_FINANCIALS_ACCEPTED");
  });

  it("binds every CHECK to its exact catalog definition and metadata", () => {
    const checkNames = [...sql.matchAll(/\bconstraint\s+([a-z0-9_]+)\s+check\s*\(/gu)]
      .map((match) => match[1]).sort();
    const definitions = [...verifier.matchAll(/\('([a-z0-9_]+)','([a-z0-9_]+_check)',\s*\$checkdef\$(.*?)\$checkdef\$\)/gu)];
    expect(checkNames).toHaveLength(13);
    expect(definitions.map((match) => match[2]).sort()).toEqual(checkNames);
    expect(verifier).toContain("select count(distinct actual.oid)");
    expect(verifier).toContain("pg_catalog.pg_get_constraintdef(actual.oid,false) = expected.definition");
    expect(verifier).toContain("actual.convalidated and actual.conislocal");
    expect(verifier).toContain("actual.coninhcount = 0 and not actual.connoinherit");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_CHECK_CONSTRAINT_SET_INVALID");
    expect(verifier).toContain(")) <> 12 then");
    expect(verifier).toContain("set_config('search_path',v_previous_search_path,true)");
    expect(definitions.find((match) => match[2] === "trade_import_source_keys_snapshot_check")?.[3])
      .toContain("'schemaVersion'::text");
  });

  it("exercises each CHECK weakening and restores every fixture atomically", () => {
    const cases = [...postgresNegative.matchAll(/@\{Table='[a-z0-9_]+';Name='([a-z0-9_]+_check)'\}/gu)];
    const names = [...sql.matchAll(/\bconstraint\s+([a-z0-9_]+)\s+check\s*\(/gu)]
      .map((match) => match[1]).sort();
    expect(cases.map((match) => match[1]).sort()).toEqual(names);
    expect(postgresNegative).toContain("check(true)");
    expect(postgresNegative).toContain("Replace(' IS TRUE','')");
    expect(postgresNegative).toContain("@('NOT VALID','NO INHERIT')");
    expect(postgresNegative).toContain("CHECK actual inheritance");
    expect(postgresNegative).toContain("Unexpected additional CHECK");
    expect(postgresNegative).toContain("$atomicSetup = 'begin;'");
    expect(postgresNegative).toContain("$atomicRestore = 'begin;'");
    expect(postgresNegative).toContain("Restored CHECK:");
    expect(postgresNegative).toContain("Replace(\"'GBP'\",\"'gbp'\")");
    expect(postgresNegative).not.toContain("$weakened not valid;");
  });

  it("binds index ordering, access method, target relation and typed key arrays", () => {
    expect(verifier.match(/array_agg\(attribute_row\.attname::text/gu)).toHaveLength(3);
    expect(verifier).toContain("index_row.indrelid = format('public.%I',expected.table_name)::regclass");
    expect(verifier).toContain("access_method.amname = 'btree'");
    expect(verifier).toContain("array(select unnest(index_row.indoption)) = expected.key_options");
    expect(verifier).toContain("array[0,3]::smallint[]");
    expect(postgresNegative).toContain("Index DESC ordering");
  });

  it("rejects absent financial rows and NULL values in the snapshot fixture", () => {
    const fixture = postgresIntegration.slice(
      postgresIntegration.indexOf("-- Roll back the complete synthetic case"),
      postgresIntegration.indexOf("TEST_PERSISTED_FINANCIAL_SNAPSHOT_MISMATCH"),
    );
    expect(fixture).toContain("v_actual is null or v_snapshot is null");
    expect(fixture).toContain("v_snapshot->>'capture_status' is distinct from 'complete'");
    expect(fixture).toMatch(/select trust_score[\s\S]*?\) is distinct from 57/u);
    expect(fixture).not.toContain("<> 57");
  });

  it("keeps installation verification inside the transaction and races within budgets", () => {
    expect(sql.lastIndexOf("\\ir verify-v57.62.0-trade-import.sql")).toBeLessThan(sql.indexOf("commit;"));
    expect(postgresConcurrency).not.toContain("pg_sleep(");
    expect(postgresConcurrency).toContain("EQUORA_FIRST_READY");
    expect(postgresConcurrency).toContain("-ExpectTimeout");
    expect(postgresConcurrency).toContain("Successful retry after lock timeout");
    expect(postgresConcurrency).toContain("c1000000-0000-4000-8000-000000000011");
  });

  it("binds every executable routine body to the exact LF-normalized hash", () => {
    const definitions = [...sql.replaceAll("\r\n", "\n").matchAll(/create or replace function public\.(equora_upsert_import_account_v1|equora_import_trades_v2|equora_revert_import_v1)\s*\([\s\S]*?\bas \$\$([\s\S]*?)\$\$;/gu)];
    expect(definitions).toHaveLength(3);
    for (const [, , body] of definitions) {
      const digest = createHash("sha256").update(body, "utf8").digest("hex");
      expect(verifier).toContain(digest);
    }
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_FUNCTION_BODY_INVALID");
  });

  it("does not persist client trust claims and strips technical metadata from shares", () => {
    expect(action).not.toContain("input.trustScore");
    expect(action).not.toContain("input.trustLabel");
    expect(action).not.toContain("input.warnings");
    expect(sql).not.toContain("p_batch->>'trust_score'");
    expect(sql).not.toContain("p_batch->>'trust_label'");
    expect(share).toContain(
      "extractTradeImportMeta(trade.notes).cleanNotes",
    );
    expect(share).toContain("shared_notes: sharedNotes");
  });

  it("labels the dashboard result as a bounded loaded window", () => {
    expect(dashboard).toContain("DASHBOARD_TRADE_WINDOW_LIMIT");
    expect(dashboardData).toContain(
      "tradeLimit: DASHBOARD_TRADE_WINDOW_LIMIT",
    );
    expect(dashboard).toContain("Fenster-Summe");
    expect(dashboard).not.toContain("Journal-Summe");
  });
});

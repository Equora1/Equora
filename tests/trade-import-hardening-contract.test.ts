import { readFileSync } from "node:fs";
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

describe("trade import hardening candidate", () => {
  const sqlPath =
    "supabase/schema-candidate-v57.62.0-trade-import-hardening.sql";
  const sql = source(sqlPath);
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

  it("keeps the additive candidate outside the immutable v57.61 deploy driver", () => {
    const deploy = source("supabase/deploy-v57.61.0.sql");

    expect(sql).toContain("DO NOT APPLY to Production");
    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
    expect(deploy).not.toContain(
      "schema-candidate-v57.62.0-trade-import-hardening.sql",
    );
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
    expect(sql).toContain("v_expected_fingerprint_digest");
    expect(sql).toContain("v_import_account_id::text");
    expect(sql).toContain("where status = 'active'");
    expect(sql).toContain("v_reserved_source_kind := 'value_fingerprint_v1'");
    expect(sql).toContain("v_reserved_source_digest := v_expected_fingerprint_digest");
    expect(sql).toContain("v_provider_identity_digest := encode(");
    expect(sql).toContain("v_provider_identity_kind <> 'deal_id'");
    expect(sql).toContain("raise exception 'REQUIRED_PROVIDER_IDENTITY_MISSING'");
    expect(sql).toContain("raise exception 'PROVIDER_IDENTITY_NOT_ALLOWED'");
    expect(sql).toContain("pg_catalog.trim_scale(");
    expect(action).not.toContain('kind: "value_fingerprint_v1"');

    const reservation = sql.indexOf(
      "insert into public.trade_import_source_keys",
    );
    const conflictGuard = sql.indexOf(
      "exception when unique_violation",
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
    expect(sql).toContain(
      "revoke all on table public.journal_import_accounts from authenticated",
    );
    expect(sql).toContain(
      "revoke all on table public.trade_import_source_keys from authenticated",
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
    ).toEqual([["ctrader-history", "deal_id"]]);
    expect(sql).toContain("if v_preset_key = 'ctrader-history' then");
    expect(sql).toContain("v_provider_identity_kind <> 'deal_id'");
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
      /equora_import_trades_v1\([\s\S]*?from public, anon, authenticated;/u,
    );
    expect(sql).toMatch(
      /equora_upsert_import_account_v1\([\s\S]*?from public, anon, authenticated;/u,
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
  });

  it("binds every submitted source row and derives counts on the server", () => {
    expect(sql).toContain("p_source_rows jsonb");
    expect(sql).toContain("SOURCE_MANIFEST_MISMATCH");
    expect(sql).toContain("source_manifest_digest text");
    expect(sql).toContain("source_manifest jsonb");
    expect(sql).toContain("v_source_row_count, p_source_rows");
    expect(sql).toContain("v_source_row_count := jsonb_array_length(p_source_rows)");
    expect(sql).toContain("'sourceRowCount', v_source_row_count");
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
    expect(postgresRunner).toContain("Install-TradeImportCandidate");
    expect(
      postgresRunner.match(/Install-TradeImportCandidate/g),
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
    expect(postgresIntegration).toContain("TEST_LEGACY_IMPORT_EXECUTE_OPEN");
    expect(postgresIntegration).toContain("TEST_RPC_SECURITY_CONTRACT_INVALID");
    expect(postgresIntegration).toContain("BATCH_REPLAY_MISMATCH");
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

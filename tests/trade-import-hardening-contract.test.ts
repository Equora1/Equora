import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
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
const powershellExecutables =
  process.platform === "win32"
    ? ["powershell.exe", "pwsh.exe"]
    : ["pwsh"];
const windowsUnsafePathAliases = (target: string, shortNameAlias: string) => {
  if (process.platform !== "win32") {
    return [];
  }
  const driveMatch = /^([A-Za-z]):[\\/](.*)$/u.exec(target);
  if (!driveMatch) {
    throw new Error("Expected a drive-qualified Windows test path.");
  }
  return [
    "\\\\?\\" + target,
    "\\\\.\\" + target,
    "\\??\\" + target,
    "\\\\localhost\\" + driveMatch[1] + "$\\" + driveMatch[2],
    shortNameAlias,
  ];
};
const invokeRunnerFunction = (
  shell: string,
  functionName: string,
  parameters: Record<string, string>,
) => {
  const harness = [
    "$tokens = $null",
    "$errors = $null",
    "$runnerPath = $env:EQUORA_TEST_RUNNER",
    "$functionName = $env:EQUORA_TEST_FUNCTION",
    "$script:RepositoryRoot = $env:EQUORA_TEST_REPOSITORY_ROOT",
    "$ast = [System.Management.Automation.Language.Parser]::ParseFile($runnerPath, [ref]$tokens, [ref]$errors)",
    "if ($errors.Count -ne 0) { throw 'Runner parse failed' }",
    "foreach ($requiredFunction in @('Test-FullyQualifiedPath', 'Get-Sha256Hex', 'Get-WindowsDosDeviceTarget', 'Assert-TrustedWindowsDriveDescriptor', 'Assert-TrustedWindowsDrive', $functionName)) { $functionAst = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $requiredFunction }, $true); if ($null -eq $functionAst) { throw ('Runner function not found: ' + $requiredFunction) }; Invoke-Expression $functionAst.Extent.Text }",
    "$parameterObject = $env:EQUORA_TEST_PARAMETERS | ConvertFrom-Json",
    "$functionParameters = @{}",
    "$parameterObject.PSObject.Properties | ForEach-Object { $functionParameters[$_.Name] = [string]$_.Value }",
    "try { & $functionName @functionParameters | ConvertTo-Json -Compress -Depth 5; exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }",
  ].join("; ");

  return spawnSync(
    shell,
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", harness],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        EQUORA_TEST_RUNNER: resolve(
          root,
          "scripts/run-v57.62.0-production-preflight.ps1",
        ),
        EQUORA_TEST_FUNCTION: functionName,
        EQUORA_TEST_PARAMETERS: JSON.stringify(parameters),
        EQUORA_TEST_REPOSITORY_ROOT: root,
      },
    },
  );
};

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
  const productionPreflightRunbook = source(
    "docs/gates/EQUORA_v57.62.0_PRODUCTION_PREFLIGHT_RUNBOOK.md",
  );
  const productionPreflightRunner = source(
    "scripts/run-v57.62.0-production-preflight.ps1",
  );
  const productionSqlManifest = JSON.parse(
    source("docs/gates/EQUORA_v57.62.0_PRODUCTION_SQL_MANIFEST.json"),
  ) as {
    schema: string;
    sourceCommit: string;
    sourceTree: string;
    algorithm: string;
    fileCount: number;
    files: Array<{ path: string; normalizedBytes: number; sha256: string }>;
  };
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
  const postgresLocalStubs = source(
    "tests/sql/equora-local-supabase-stubs.sql",
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
      "460e008096b8f217e68d27f04c72b95b676d2b149daf49d5913d5a822cac628b";

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
    expect(sql).toContain("lock table only equora_private.schema_migrations");
    expect(sql).toContain("TRADE_IMPORT_PATCH_UNKNOWN_MARKER");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_UNKNOWN_V5762_MARKER");
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
    expect(preflight).toContain("TRADE_IMPORT_PREFLIGHT_GATE_ACTIVE");
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
    expect(postflight).toContain(
      "TRADE_IMPORT_POSTFLIGHT_GATE_NOT_DEFAULT_OFF",
    );
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_MIGRATION_RECEIPT_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_RELATION_SECURITY_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_CONSTRAINTS_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_INDEXES_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_RLS_POLICIES_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_TABLE_PRIVILEGES_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_FUNCTION_SECURITY_INVALID");
    expect(verifier).toContain(
      "TRADE_IMPORT_VERIFY_BINDING_TRIGGER_FUNCTION_INVALID",
    );
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_BINDING_TRIGGER_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_FUNCTION_PRIVILEGES_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_ACTIVATION_STATE_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_KEY_CONSTRAINT_SHAPE_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_INDEX_SHAPE_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_RLS_POLICY_SHAPE_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_TABLE_ACL_SHAPE_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_FUNCTION_ACL_SHAPE_INVALID");
    expect(verifier).toContain("relation_row.relpersistence = 'p'");
    expect(verifier).toContain("access_method_row.amname = 'heap'");
    expect(verifier).toContain("actual.collation_name is null");
    expect(verifier).toContain("procedure_row.provolatile = 'v'");
    expect(verifier).toContain("procedure_row.proparallel = 'u'");
    expect(verifier).toContain("not procedure_row.proleakproof");
    expect(verifier).toContain("not procedure_row.proisstrict");
    expect(postgresNegative).toContain("Gate relation persistence");
    expect(postgresNegative).toContain("Function behavior attribute");
    expect(postgresNegative).toContain("Explicit text collation");
    expect(verifier).toContain("'service_role'");
  });

  it("keeps activation separate, atomic, reversible and non-destructive", () => {
    expect(activation).toContain("for update");
    expect(activation).toContain("set enabled = true");
    expect(activation).toContain("and not enabled");
    expect(activation).toContain("TRADE_IMPORT_ACTIVATION_CAS_FAILED");
    expect(activation).toContain("TRADE_IMPORT_ACTIVATION_UNKNOWN_MARKER");
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
      "Status: **PR #14 GEMERGT / VERCEL-PRODUCTION GRÜN / HOSTED-SUPABASE-PREFLIGHT NOCH NICHT AUSGEFÜHRT**",
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

  it("prepares a hash-bound read-only production preflight without authorizing deployment", () => {
    expect(productionSqlManifest.schema).toBe(
      "equora-v57.62.0-production-sql-manifest-v1",
    );
    expect(productionSqlManifest.fileCount).toBe(7);
    expect(productionSqlManifest.files).toHaveLength(7);
    expect(productionSqlManifest.sourceCommit).toBe(
      "889a145e3443e52e5298ae945f53e3a8f44dc50b",
    );
    expect(productionSqlManifest.sourceTree).toBe(
      "0868907cd1fb05abdd9072541f6b24f05bff3196",
    );
    expect(productionSqlManifest.algorithm).toBe(
      "SHA-256 over file bytes after replacing CRLF with LF; lone CR and all other bytes are preserved",
    );
    expect(
      productionSqlManifest.files.map(({ path }) => path).sort(),
    ).toEqual(
      [
        "supabase/activate-v57.62.0-trade-import.sql",
        "supabase/deactivate-v57.62.0-trade-import.sql",
        "supabase/deploy-v57.62.0-trade-import.sql",
        "supabase/postflight-v57.62.0-trade-import.sql",
        "supabase/preflight-v57.62.0-trade-import.sql",
        "supabase/schema-patch-v57.62.0-trade-import-hardening.sql",
        "supabase/verify-v57.62.0-trade-import.sql",
      ].sort(),
    );

    for (const entry of productionSqlManifest.files) {
      const normalizedSource = source(entry.path).replace(/\r\n/gu, "\n");
      expect(Buffer.byteLength(normalizedSource, "utf8")).toBe(
        entry.normalizedBytes,
      );
      expect(
        createHash("sha256").update(normalizedSource, "utf8").digest("hex"),
      ).toBe(entry.sha256.toLowerCase());
    }

    expect(productionPreflightRunner).toContain(
      "[ValidateSet('ValidateLocal', 'ExecuteReadOnly')]",
    );
    expect(productionPreflightRunner).toContain(
      "EQUORA_SUPABASE_DATABASE_URL",
    );
    expect(productionPreflightRunner).toContain(
      "EQUORA_SUPABASE_SSL_ROOT_CERT",
    );
    expect(productionPreflightRunner).toContain(
      "ExpectedDatabaseHost",
    );
    expect(productionPreflightRunner).toContain(
      "sslmode=verify-full",
    );
    expect(productionPreflightRunner).toContain(
      "PGSSLROOTCERT",
    );
    expect(productionPreflightRunner).toContain(
      "psqlPath = $psqlCommand.Source",
    );
    expect(productionPreflightRunner).toContain(
      "psqlVersion = $psqlVersion",
    );
    expect(productionPreflightRunner).toContain(
      "default_transaction_read_only=on",
    );
    expect(productionPreflightRunner).toContain(
      "EvidenceDirectory must be outside the repository",
    );
    expect(productionPreflightRunner).toContain(
      "$manifestRepositoryPrefix",
    );
    expect(productionPreflightRunner).toContain(
      "[IO.Path]::DirectorySeparatorChar",
    );
    expect(productionPreflightRunner).not.toContain(
      "$script:RepositoryRoot.TrimEnd('\\') + '\\'",
    );
    expect(productionPreflightRunner).toContain(
      "deploymentAttempted = $false",
    );
    expect(productionPreflightRunner).toContain(
      "activationAttempted = $false",
    );
    expect(productionPreflightRunner).toContain(
      "$script:PreflightRelativePath = 'supabase/preflight-v57.62.0-trade-import.sql'",
    );
    expect(
      productionPreflightRunner.match(/'-f' \$preflightPath/gu),
    ).toHaveLength(1);
    expect(productionPreflightRunner).not.toMatch(
      /'-f'\s+.*(?:deploy|activate|deactivate)-v57\.62\.0/gu,
    );

    expect(productionPreflightRunbook).toContain("GO_PREFLIGHT_READ_ONLY");
    expect(productionPreflightRunbook).toContain("GO_DEPLOY_DEFAULT_OFF");
    expect(productionPreflightRunbook).toContain(
      "Datenbankbackups enthalten nur Storage-",
    );
    expect(productionPreflightRunbook).toContain(
      "Ein Plattform-Restore ist die letzte Maßnahme",
    );
    expect(productionPreflightRunbook).toContain(
      "HOSTED-SUPABASE-PREFLIGHT NICHT AUSGEFÜHRT",
    );
    expect(releaseGate).toContain(
      "production_preflight = not_executed",
    );
    expect(releaseGate).toContain(
      "database_gate_activation = not_authorized",
    );
  });

  it(
    "accepts only exact direct and shared session-pooler production targets",
    () => {
      const projectRef = "rrkfdprhqilvicjbgfcn";
      const directHost = `db.${projectRef}.supabase.co`;
      const poolerHost = "aws-0-eu-central-1.pooler.supabase.com";
      const syntheticPassword = ["synthetic", "test", "password"].join("-");
      const connectionUrl = (
        user: string,
        host: string,
        port = 5432,
        database = "postgres",
      ) =>
        [
          "postgresql://",
          user,
          ":",
          syntheticPassword,
          "@",
          host,
          ":",
          String(port),
          "/",
          database,
        ].join("");
      const validate = (
        shell: string,
        candidateUrl: string,
        expectedDatabaseHost: string,
      ) =>
        invokeRunnerFunction(shell, "Resolve-ProductionConnectionTarget", {
          ConnectionUrl: candidateUrl,
          ExpectedProjectRef: projectRef,
          ExpectedDatabaseHost: expectedDatabaseHost,
        });

      const rejectedTargets = [
        [
          connectionUrl("postgres", "db.otherprojectref1234.supabase.co"),
          directHost,
          "Database URL host does not match ExpectedDatabaseHost",
        ],
        [
          connectionUrl(`postgres.${projectRef}`, "arbitrary.supabase.com"),
          "arbitrary.supabase.com",
          "not an accepted direct or shared session-pooler identity",
        ],
        [
          connectionUrl(
            `postgres.${projectRef}`,
            "db.otherprojectref1234.supabase.co",
          ),
          "db.otherprojectref1234.supabase.co",
          "not an accepted direct or shared session-pooler identity",
        ],
        [
          connectionUrl(`postgres.${projectRef}`, poolerHost),
          "aws-1-us-east-1.pooler.supabase.com",
          "Database URL host does not match ExpectedDatabaseHost",
        ],
        [
          connectionUrl(`postgres.${projectRef}`, directHost),
          directHost,
          "not an accepted direct or shared session-pooler identity",
        ],
        [
          connectionUrl("postgres", directHost, 6543),
          directHost,
          "requires direct or shared session-pooler port 5432",
        ],
        [
          connectionUrl("postgres", directHost, 5432, "other"),
          directHost,
          "requires database postgres",
        ],
      ] as const;

      for (const shell of powershellExecutables) {
        const direct = validate(
          shell,
          connectionUrl("postgres", directHost),
          directHost,
        );
        expect(direct.status, `${shell}: ${direct.stderr}`).toBe(0);
        expect(direct.stdout).toContain('"connectionType":"direct"');

        const pooler = validate(
          shell,
          connectionUrl(`postgres.${projectRef}`, poolerHost),
          poolerHost,
        );
        expect(pooler.status, `${shell}: ${pooler.stderr}`).toBe(0);
        expect(pooler.stdout).toContain(
          '"connectionType":"shared_session_pooler"',
        );

        for (const [
          candidateUrl,
          expectedDatabaseHost,
          expectedError,
        ] of rejectedTargets) {
          const result = validate(
            shell,
            candidateUrl,
            expectedDatabaseHost,
          );
          expect(result.status, shell).not.toBe(0);
          expect(`${result.stdout}\n${result.stderr}`).toContain(expectedError);
        }
      }
    },
    45_000,
  );

  it(
    "rejects repository and linked evidence paths while allowing an external absolute path",
    () => {
      const runner = resolve(
        root,
        "scripts/run-v57.62.0-production-preflight.ps1",
      );
      const environment = { ...process.env };
      delete environment.EQUORA_SUPABASE_DATABASE_URL;
      delete environment.EQUORA_SUPABASE_SSL_ROOT_CERT;
      const runValidation = (shell: string, evidenceDirectory: string) =>
        spawnSync(
          shell,
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            ...(process.platform === "win32"
              ? ["-ExecutionPolicy", "Bypass"]
              : []),
            "-File",
            runner,
            "-Mode",
            "ValidateLocal",
            "-EvidenceDirectory",
            evidenceDirectory,
          ],
          {
            cwd: root,
            encoding: "utf8",
            env: environment,
          },
        );
      const output = (result: ReturnType<typeof runValidation>) =>
        `${result.stdout}\n${result.stderr}`;
      const temporaryRoot = mkdtempSync(
        resolve(tmpdir(), "equora-preflight-evidence-"),
      );

      try {
        const repositoryLink = resolve(temporaryRoot, "repository-link");
        symlinkSync(
          root,
          repositoryLink,
          process.platform === "win32" ? "junction" : "dir",
        );

        for (const shell of powershellExecutables) {
          const relative = runValidation(shell, "relative-evidence");
          expect(relative.status, shell).not.toBe(0);
          expect(output(relative)).toContain("fully qualified absolute path");

          const repositoryRoot = runValidation(shell, root);
          expect(repositoryRoot.status, shell).not.toBe(0);
          expect(output(repositoryRoot)).toContain(
            "EvidenceDirectory must be outside the repository",
          );

          const repositoryChild = runValidation(
            shell,
            resolve(root, "evidence"),
          );
          expect(repositoryChild.status, shell).not.toBe(0);
          expect(output(repositoryChild)).toContain(
            "EvidenceDirectory must be outside the repository",
          );

          const external = runValidation(shell, temporaryRoot);
          expect(external.status, `${shell}: ${output(external)}`).toBe(0);
          expect(external.stdout).toMatch(
            /"evidenceDirectoryValidated"\s*:\s*true/u,
          );
          expect(external.stdout).toMatch(
            /"hostedSupabaseAccessed"\s*:\s*false/u,
          );

          const linkedChild = runValidation(
            shell,
            resolve(repositoryLink, "linked-evidence"),
          );
          expect(linkedChild.status, shell).not.toBe(0);
          expect(output(linkedChild)).toContain(
            "must not traverse a reparse point or symbolic link",
          );

          for (const unsafeAlias of windowsUnsafePathAliases(
            resolve(root, "adversarial-evidence"),
            resolve(root, "..", "EQUORA~1", "adversarial-evidence"),
          )) {
            const aliased = runValidation(shell, unsafeAlias);
            expect(
              aliased.status,
              shell + ": " + unsafeAlias,
            ).not.toBe(0);
            expect(output(aliased)).toContain(
              "fully qualified absolute path",
            );
          }
        }
      } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
      }
    },
    40_000,
  );

  it(
    "accepts only ready fixed non-aliased Windows drive descriptors",
    () => {
      if (process.platform !== "win32") {
        return;
      }

      const baseParameters = {
        ValueName: "EvidenceDirectory",
        DriveRoot: "C:\\",
        DriveType: "Fixed",
        IsReady: "true",
        DosDeviceTarget: "\\Device\\HarddiskVolume3",
        RepositoryDriveRoot: "C:\\",
        RepositoryDosDeviceTarget: "\\Device\\HarddiskVolume3",
      };
      const validate = (
        shell: string,
        overrides: Partial<typeof baseParameters>,
      ) =>
        invokeRunnerFunction(
          shell,
          "Assert-TrustedWindowsDriveDescriptor",
          { ...baseParameters, ...overrides },
        );

      for (const shell of powershellExecutables) {
        const accepted = validate(shell, {});
        expect(accepted.status, shell + ": " + accepted.stderr).toBe(0);

        const rejectedDescriptors = [
          [
            {
              DriveRoot: "Z:\\",
              DriveType: "Network",
              DosDeviceTarget: "\\Device\\Mup\\server\\share",
            },
            "ready fixed local drive",
          ],
          [
            {
              DriveRoot: "D:\\",
              DriveType: "CDRom",
              IsReady: "false",
              DosDeviceTarget: "\\Device\\CdRom0",
            },
            "ready fixed local drive",
          ],
          [
            {
              IsReady: "false",
            },
            "ready fixed local drive",
          ],
          [
            {
              DriveRoot: "Z:\\",
              DosDeviceTarget: "\\??\\C:\\repository",
            },
            "must not use a SUBST or DOS-device alias",
          ],
          [
            {
              DriveRoot: "Z:\\",
              DosDeviceTarget: "\\DosDevices\\C:\\repository",
            },
            "must not use a SUBST or DOS-device alias",
          ],
          [
            {
              DriveRoot: "Z:\\",
              DosDeviceTarget: "\\Device\\HarddiskVolume3",
            },
            "must not alias the repository volume",
          ],
          [
            {
              DriveRoot: "Z:\\",
              DosDeviceTarget:
                "\\Device\\HarddiskVolume3\\Users\\matth\\.codex\\worktrees\\866e",
            },
            "must not alias the repository volume",
          ],
          [
            {
              DosDeviceTarget: "C:\\unexpected-target",
            },
            "must resolve directly to a recognized local device",
          ],
        ] as const;

        for (const [overrides, expectedError] of rejectedDescriptors) {
          const rejected = validate(shell, overrides);
          expect(rejected.status, shell).not.toBe(0);
          expect(rejected.stdout + "\n" + rejected.stderr).toContain(
            expectedError,
          );
        }
      }
    },
    30_000,
  );

  it(
    "validates trusted root certificates under every supported PowerShell runtime",
    () => {
      const temporaryRoot = mkdtempSync(
        resolve(tmpdir(), "equora-preflight-certificate-"),
      );
      const validCertificate = resolve(temporaryRoot, "root-ca.pem");
      const emptyCertificate = resolve(temporaryRoot, "empty-ca.pem");
      const missingCertificate = resolve(temporaryRoot, "missing-ca.pem");
      const certificateBytes = Buffer.from(
        "synthetic Equora root certificate fixture\n",
        "utf8",
      );
      writeFileSync(validCertificate, certificateBytes);
      writeFileSync(emptyCertificate, "");

      try {
        const repositoryLink = resolve(temporaryRoot, "repository-link");
        symlinkSync(
          root,
          repositoryLink,
          process.platform === "win32" ? "junction" : "dir",
        );
        const expectedSha256 = createHash("sha256")
          .update(certificateBytes)
          .digest("hex")
          .toUpperCase();
        const validate = (shell: string, path: string) =>
          invokeRunnerFunction(shell, "Resolve-TrustedRootCertificate", {
            Path: path,
          });

        for (const shell of powershellExecutables) {
          const valid = validate(shell, validCertificate);
          expect(valid.status, `${shell}: ${valid.stderr}`).toBe(0);
          expect(valid.stdout).toContain(expectedSha256);
          expect(valid.stdout).toContain(validCertificate.replace(/\\/gu, "\\\\"));

          const rejectedCertificates = [
            ["relative-ca.pem", "fully qualified absolute path"],
            [missingCertificate, "must reference an existing file"],
            [emptyCertificate, "must not be empty"],
            [resolve(root, "package.json"), "must be outside the repository"],
            [
              resolve(repositoryLink, "package.json"),
              "must not traverse a reparse point or symbolic link",
            ],
            ...windowsUnsafePathAliases(
              resolve(root, "package.json"),
              resolve(root, "..", "EQUORA~1", "package.json"),
            ).map(
              (path) =>
                [path, "fully qualified absolute path"] as const,
            ),
          ] as const;

          for (const [path, expectedError] of rejectedCertificates) {
            const result = validate(shell, path);
            expect(result.status, shell).not.toBe(0);
            expect(`${result.stdout}\n${result.stderr}`).toContain(expectedError);
          }
        }
      } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
      }
    },
    30_000,
  );

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
    const importRoutineStart = sql.indexOf(
      "create or replace function public.equora_import_trades_v2",
    );
    const earlyTradeWriterLock = sql.indexOf(
      "lock table only public.trades in row exclusive mode",
      importRoutineStart,
    );
    expect(earlyTradeWriterLock).toBeGreaterThan(importRoutineStart);
    expect(earlyTradeWriterLock).toBeLessThan(reservation);
  });

  it("binds every v2 batch trade one-to-one before assignment and revert", () => {
    expect(sql).toMatch(
      /trade_import_source_keys_trade_owner_fkey[\s\S]*?on delete restrict/gu,
    );
    expect(sql).toContain(
      "create unique index trade_import_source_keys_trade_idx",
    );
    expect(sql).toContain(
      "create or replace function public.equora_enforce_v2_trade_batch_binding_v1()",
    );
    expect(sql).toContain(
      "create trigger equora_enforce_v2_trade_batch_binding_v1",
    );
    expect(sql).toContain("raise exception 'IMPORT_BATCH_TRADE_BINDING_INVALID'");
    expect(sql).toMatch(
      /revoke all on function public\.equora_enforce_v2_trade_batch_binding_v1\(\)[\s\S]*?from public, anon, authenticated, service_role;/u,
    );
    expect(verifier).toContain(
      "pg_catalog.pg_get_triggerdef(trigger_row.oid, true)",
    );
    expect(verifier).toContain(
      "CREATE TRIGGER equora_enforce_v2_trade_batch_binding_v1 BEFORE INSERT OR UPDATE ON public.trades FOR EACH ROW EXECUTE FUNCTION public.equora_enforce_v2_trade_batch_binding_v1()",
    );
    expect(verifier).not.toContain("pg_catalog.pg_get_expr(\n        trigger_row.tgqual");
    expect(sql).not.toContain("when (new.import_batch_id is not null)");
    expect(sql).toContain("new.import_batch_id is distinct from old.import_batch_id");
    expect(sql).toContain("new.import_account_id is distinct from old.import_account_id");
    expect(sql).toContain("new.import_account_id is distinct from v_batch.import_account_id");
    expect(sql).toContain("source_key_row.import_account_id = new.import_account_id");
    expect(sql).toContain(
      "source_key_row.import_account_id = v_import_account_id",
    );
    expect(sql).toContain(
      "trade.import_account_id = source_key_row.import_account_id",
    );
    expect(sql).toContain("IMPORT_BATCH_TRADE_BINDING_IMMUTABLE");
    expect(postgresIntegration).toContain("TEST_BOUND_TRADE_NORMAL_UPDATE_REJECTED");
    expect(postgresIntegration).toContain("TEST_BOUND_TRADE_DETACH_LEFT_EFFECTS");
    expect(postgresIntegration).toContain("TEST_BOUND_TRADE_LEGACY_MOVE_LEFT_EFFECTS");
    expect(postgresIntegration).toContain("TEST_BOUND_TRADE_ACCOUNT_DETACH_LEFT_EFFECTS");
    expect(postgresIntegration).toContain("TEST_BOUND_TRADE_ACCOUNT_MOVE_LEFT_EFFECTS");
    expect(postgresConcurrency).toContain("binding_update_then_revert");
    expect(postgresConcurrency).toContain("Binding/revert concurrency PASS");
    expect(postgresConcurrency).toContain("timeout is bounded and retryable");

    const createWithoutBatch = sql.indexOf(
      "v_trade_id, v_trade - 'import_batch_id', v_tags, null",
    );
    const bindSourceKey = sql.indexOf(
      "set trade_id = v_trade_id",
      createWithoutBatch,
    );
    const attachBatch = sql.indexOf(
      "import_batch_id = p_batch_id",
      bindSourceKey,
    );
    expect(createWithoutBatch).toBeGreaterThan(-1);
    expect(bindSourceKey).toBeGreaterThan(createWithoutBatch);
    expect(attachBatch).toBeGreaterThan(bindSourceKey);

    const revertRoutine = sql.slice(
      sql.indexOf("create or replace function public.equora_revert_import_v1"),
      sql.indexOf("revoke all on function public.equora_upsert_import_account_v1"),
    );
    expect(sql).toContain("for key share");
    expect(revertRoutine).toMatch(/order by id\s+for update/gu);
    const revertTradeLock = revertRoutine.indexOf(
      "from public.trades\n  where user_id = v_user_id and import_batch_id = p_batch_id\n  order by id\n  for update",
    );
    const revertTableLock = revertRoutine.indexOf(
      "lock table only public.trades in exclusive mode",
    );
    const revertBatchLock = revertRoutine.indexOf(
      "select status, import_account_id into v_status, v_import_account_id\n  from public.trade_import_batches\n  where id = p_batch_id and user_id = v_user_id\n  for update",
    );
    const revertSourceKeyLock = revertRoutine.indexOf(
      "from public.trade_import_source_keys\n    where user_id = v_user_id and batch_id = p_batch_id\n    order by id\n    for update",
    );
    expect(revertTableLock).toBeGreaterThan(-1);
    expect(revertTradeLock).toBeGreaterThan(revertTableLock);
    expect(revertBatchLock).toBeGreaterThan(revertTradeLock);
    expect(revertSourceKeyLock).toBeGreaterThan(revertBatchLock);
    expect(revertRoutine).toContain(
      "raise exception 'IMPORT_BATCH_TRADE_BINDING_INVALID'",
    );
    expect(postgresIntegration).toContain(
      "TEST_BOUND_IMPORT_TRADE_DELETE_ACCEPTED",
    );
    expect(postgresIntegration).toContain("TEST_UNBOUND_V2_TRADE_ACCEPTED");
    expect(postgresIntegration).toContain("TEST_CORRUPT_V2_REVERT_ACCEPTED");
    expect(postgresIntegration).toContain(
      "TEST_CORRUPT_V2_ACCOUNT_REVERT_ACCEPTED",
    );
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
    expect(postgresLocalStubs).toContain(
      "grant usage on schema auth to postgres, anon, authenticated, service_role;",
    );
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
    const revertRoutine = sql.slice(sql.indexOf("create or replace function public.equora_revert_import_v1"), sql.indexOf("revoke all on function public.equora_upsert_import_account_v1"));
    expect(accountRoutine).not.toContain("set lock_timeout");
    expect(importRoutine).toContain("set lock_timeout = '3s'");
    expect(revertRoutine).toContain("set lock_timeout = '3s'");
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
    const snapshotWrite = sql.indexOf("set trade_snapshot = v_trade_snapshot", readBack);
    expect(readBack).toBeGreaterThan(createTrade);
    expect(snapshotWrite).toBeGreaterThan(readBack);
    expect(sql).toContain("'partial_exits', 'r_multiple', 'pnl_mode', 'cost_profile'");
    expect(sql).not.toContain("'riskAmount'");
    expect(sql).not.toContain("'captureResult'");
    expect(sql).toContain("PROVIDER_IDENTITY_FINANCIAL_CONFLICT");
    expect(postgresIntegration).toContain("TEST_CHANGED_PROVIDER_FINANCIALS_ACCEPTED");
  });

  it("rejects every non-finite imported numeric before source-key reservation", () => {
    const numericGuard = sql.indexOf("raise exception 'INVALID_TRADE_NUMERIC_VALUE'");
    const sourceKeyReservation = sql.indexOf("insert into public.trade_import_source_keys", numericGuard);
    expect(numericGuard).toBeGreaterThan(-1);
    expect(sourceKeyReservation).toBeGreaterThan(numericGuard);
    for (const field of [
      "entry", "exit", "stop_loss", "take_profit", "net_pnl", "risk_percent",
      "account_size", "r_multiple", "position_size", "point_value", "fees",
      "exchange_fees", "funding_fees", "funding_rate_bps", "funding_intervals",
      "spread_cost", "slippage", "leverage",
    ]) {
      expect(sql).toContain(`'${field}'`);
      expect(postgresIntegration).toContain(`'${field}'`);
    }
    for (const special of ["NaN", "Infinity", "-Infinity"]) {
      expect(sql).toContain(`to_jsonb('${special}'::numeric)`);
      expect(postgresIntegration).toContain(`'${special}'`);
    }
    expect(postgresIntegration).toContain("TEST_NON_FINITE_NUMERIC_LEFT_EFFECTS");
  });

  it("locks target DDL before checking every executable gate expression", () => {
    const lock = deactivation.indexOf("lock table only public.equora_runtime_capability_gates");
    expect(lock).toBeGreaterThan(deactivation.indexOf("current_user <> 'postgres'"));
    expect(lock).toBeLessThan(deactivation.indexOf("pg_catalog.pg_trigger"));
    expect(deactivation).toContain("in exclusive mode;");
    expect(deactivation).toContain("set local lock_timeout = '3s'");
    expect(deactivation).toContain("attgenerated <> ''");
    expect(deactivation).toContain("and relforcerowsecurity");
    expect(deactivation).toContain("actual.indexprs is not null or actual.indpred is not null");
    expect(deactivation).toContain("pg_catalog.pg_get_indexdef(actual.indexrelid,0,false)");
    expect(deactivation).toContain("array(select unnest(actual.indclass))");
    const definitions = [...deactivation.matchAll(/\('([a-z0-9_]+_check)',\s*\$checkdef\$(.*?)\$checkdef\$\)/gu)];
    expect(definitions).toHaveLength(3);
    const verifiedChecks = [...verifier.matchAll(/\('equora_runtime_capability_gates','([a-z0-9_]+_check)',\s*\$checkdef\$(.*?)\$checkdef\$\)/gu)];
    for (const [, name, definition] of definitions) {
      expect(verifiedChecks.find((match) => match[1] === name)?.[2]).toBe(definition);
    }
    expect(deactivation).toContain("expected.constraint_name is null");
    expect(deactivation).toContain("pg_catalog.pg_get_constraintdef(actual.oid,false)");
    expect(deactivation).toContain("case when actual.convalidated then '' else ' NOT VALID' end");
    expect(deactivation.indexOf("TRADE_IMPORT_DEACTIVATION_CHECK_EFFECTS_INVALID"))
      .toBeLessThan(deactivation.indexOf("select enabled, activated_at into strict"));
    expect(deactivation).toContain("when too_many_rows then raise exception 'TRADE_IMPORT_DEACTIVATION_GATE_AMBIGUOUS'");
    expect(deactivation).toContain("when no_data_found then raise exception 'TRADE_IMPORT_DEACTIVATION_GATE_MISSING'");
  });

  it("proves CHECK effects are rejected before invocation and preserves operational off", () => {
    expect(postgresNegative).toContain("TEST_GATE_CHECK_POSITIVE_CONTROL_FAILED");
    expect(postgresNegative).toContain("where executor='postgres'");
    expect(postgresNegative).toContain("rollback to savepoint gate_check_control");
    expect(postgresNegative).toContain("alter sequence public.equora_gate_check_calls restart with 1");
    expect(postgresNegative).toContain("not (select is_called from public.equora_gate_check_calls)");
    expect(postgresNegative).toContain("invariant failed before fixture restoration");
    expect(postgresNegative).toContain("Gate CHECK effect NOT VALID replaceKnown=");
    expect(postgresNegative).toContain("Gate same-name CHECK true:");
    expect(postgresNegative).toContain("Gate additional validated CHECK");
    for (const fixture of ["Gate generated column", "Gate unexpected index:", "Gate FORCE RLS", "Gate duplicate target rows"]) {
      expect(postgresNegative).toContain(fixture);
    }
    expect(postgresNegative).toContain("foreach($knownNotValid in @($false,$true))");
    expect(postgresNegative).toContain("Activation still rejects incomplete target");
    expect(postgresNegative).toContain("-PreservePersistence");
    expect(postgresTestLib).toContain("jsonb_agg(to_jsonb(gate_row) order by to_jsonb(gate_row)::text)");
  });

  it("covers admitted imports, activation lock upgrades and both target DDL orders", () => {
    for (const scenario of ["activation_then_off", "ddl_then_off", "off_then_ddl"]) {
      expect(postgresConcurrency).toContain(`'${scenario}'`);
    }
    expect(postgresConcurrency).toContain("-FirstAfterBarrierSql $activationUpdate");
    expect(postgresConcurrency).toContain("$deactivation 'relation' -SecondOwnTransaction");
    expect(postgresConcurrency).toContain("TRADE_IMPORT_DEACTIVATION_CHECK_EFFECTS_INVALID");
    expect(postgresConcurrency).toContain("Rejected DDL/off race changed persistence");
    expect(postgresConcurrency).toContain("$lateDdl 'relation' -ExpectTimeout");
    expect(postgresConcurrency).toContain("Off-body transaction extraction failed");
    expect(postgresConcurrency).toContain("Timed-out target DDL left a constraint");
  });

  it("binds real activation to the same safe index expressions before a locked update", () => {
    const gateIndexGuard = (text: string) => {
      const canonical = text.replaceAll("\r\n", "\n");
      const start = canonical.indexOf("select 1 from pg_catalog.pg_index actual");
      expect(start).toBeGreaterThan(-1);
      return canonical.slice(start, canonical.indexOf(") then raise exception", start));
    };
    expect(gateIndexGuard(verifier)).toBe(gateIndexGuard(deactivation));
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_GATE_INDEX_EFFECTS_INVALID");
    expect(verifier).not.toMatch(/lock table/iu);
    const lock = activation.indexOf("lock table only public.equora_runtime_capability_gates");
    expect(lock).toBeGreaterThan(activation.indexOf("current_user <> 'postgres'"));
    expect(lock).toBeLessThan(activation.indexOf("\\ir verify-v57.62.0-trade-import.sql"));
    expect(activation).toContain("in exclusive mode;");
    expect(postgresNegative).toContain("TEST_ACTIVATION_INDEX_POSITIVE_CONTROL_FAILED");
    expect(postgresNegative).toContain("TEST_ACTIVATION_INDEX_OFF_BASELINE_INVALID");
    expect(postgresNegative).toContain("language sql immutable as $fixture$ select public.equora_activation_index_effect($1)");
    expect(postgresNegative).toContain("-ProbeSql $activationProbe");
    expect(postgresNegative).toContain("foreach($indexKind in @('expression','partial'))");
    expect(postgresNegative).toContain("not (select is_called from public.equora_activation_index_calls)");
    for (const scenario of ["ddl_then_activate", "activate_then_ddl", "actual_activate_then_off", "actual_off_then_activate"]) {
      expect(postgresConcurrency).toContain(`'${scenario}'`);
    }
    expect(postgresConcurrency).toContain("Activation-body transaction extraction failed");
    expect(postgresConcurrency).toContain("Rejected DDL/activation race changed persistence");
    expect(postgresConcurrency).toContain("Timed-out activation DDL left an index");
  });

  it("checks both primitive column contracts and all gate metadata before reading gate data", () => {
    expect(
      verifier.match(
        /actual\.domain_name is null[\s\S]*?actual\.is_generated = 'NEVER'/gu,
      ),
    ).toHaveLength(2);
    const firstGateRead = verifier.indexOf("from public.equora_runtime_capability_gates");
    expect(firstGateRead).toBeGreaterThan(-1);
    for (const guard of [
      "TRADE_IMPORT_VERIFY_ADDITIVE_COLUMNS_INVALID",
      "TRADE_IMPORT_VERIFY_GATE_EFFECTS_INVALID",
      "TRADE_IMPORT_VERIFY_GATE_INDEX_EFFECTS_INVALID",
      "TRADE_IMPORT_VERIFY_COLUMN_SHAPE_INVALID",
      "TRADE_IMPORT_VERIFY_CHECK_CONSTRAINT_SHAPE_INVALID",
      "TRADE_IMPORT_VERIFY_FUNCTION_BODY_INVALID",
    ]) {
      expect(verifier.indexOf(guard)).toBeGreaterThan(-1);
      expect(verifier.indexOf(guard)).toBeLessThan(firstGateRead);
    }
    expect(postgresNegative).toContain("TEST_CONSTANT_INDEX_PLANNING_CONTROL_FAILED");
    expect(postgresNegative).toContain("where public.equora_constant_index_wrapper()");
    const constantStart = postgresNegative.indexOf("$beforeConstantFixture=Get-TradeImportPersistenceSnapshot");
    const constantEnd = postgresNegative.indexOf("Constant index fixture fully restored");
    const constantCase = postgresNegative.slice(constantStart, constantEnd);
    expect(constantStart).toBeGreaterThan(-1);
    expect(constantEnd).toBeGreaterThan(constantStart);
    expect(constantCase).toContain("copy public.equora_runtime_capability_gates to stdout;");
    expect(constantCase).not.toContain("-PreservePersistence");
    expect(constantCase.match(/Get-TradeImportPersistenceSnapshot/gu)).toHaveLength(2);
    expect(constantCase.indexOf("Relation COPY observer invoked the constant index"))
      .toBeLessThan(constantCase.indexOf("drop index public.equora_constant_index_fixture"));
    expect(constantCase.lastIndexOf("Get-TradeImportPersistenceSnapshot"))
      .toBeGreaterThan(constantCase.indexOf("Constant index fixture cleanup"));
    expect(postgresNegative).toContain("@('generated-key','timestamp-domain')");
    expect(postgresNegative).toContain("drop column capability_key");
    expect(postgresNegative).toContain("generated always as (public.equora_generated_key(enabled)) stored not null");
    expect(postgresNegative).toContain("TEST_COLUMN_EFFECT_POSITIVE_CONTROL_FAILED");
    expect(postgresNegative).toContain("not (select is_called from public.equora_column_effect_calls)");
    expect(postgresNegative).toContain("Additive request digest domain");
    expect(postgresNegative).toContain("TRADE_IMPORT_VERIFY_ADDITIVE_COLUMNS_INVALID");
  });

  it("binds all source-key indexes before digest reads under a DDL-stable activation", () => {
    const migrationLock = activation.indexOf("lock table only equora_private.schema_migrations");
    const gateLock = activation.indexOf("lock table only public.equora_runtime_capability_gates");
    const accountLock = activation.indexOf("lock table only public.journal_import_accounts");
    const sourceLock = activation.indexOf("lock table only public.trade_import_source_keys");
    expect(migrationLock).toBeGreaterThan(-1);
    expect(gateLock).toBeGreaterThan(migrationLock);
    expect(accountLock).toBeGreaterThan(gateLock);
    expect(sourceLock).toBeGreaterThan(accountLock);
    expect(sourceLock).toBeLessThan(activation.indexOf("\\ir verify-v57.62.0-trade-import.sql"));
    expect(activation).toContain("in share update exclusive mode;");
    expect(activation).toContain("TRADE_IMPORT_ACTIVATION_EXECUTOR_PRIVILEGE_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_EXECUTOR_PRIVILEGE_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_AUTHENTICATED_ROLE_ATTRIBUTES_INVALID");
    const sourceGuard = verifier.indexOf("TRADE_IMPORT_VERIFY_SOURCE_KEY_INDEX_EFFECTS_INVALID");
    expect(sourceGuard).toBeGreaterThan(-1);
    expect(sourceGuard).toBeLessThan(verifier.indexOf("from public.trade_import_source_keys"));
    expect(verifier).toContain("where indrelid='public.trade_import_source_keys'::regclass) <> 5");
    expect(verifier).toContain("actual.indisvalid and actual.indisready and actual.indislive");
    expect(verifier).toContain("operator_class.opcnamespace = 'pg_catalog'::regnamespace");
    expect(verifier).toContain("operator_class.opcmethod = access_method.oid");
    expect(verifier).toContain("array(select unnest(actual.indcollation))");
    expect(verifier).toContain("pg_catalog.pg_get_indexdef(actual.indexrelid,0,false) = expected.definition");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_SOURCE_KEY_RELATION_EFFECTS_INVALID");
    expect(verifier).toContain("inhparent='public.trade_import_source_keys'::regclass");
    const sourceStart = postgresNegative.indexOf("$beforeSourceFixture=Get-TradeImportPersistenceSnapshot");
    const sourceEnd = postgresNegative.indexOf("Source-key index fixture fully restored");
    expect(sourceStart).toBeGreaterThan(-1);
    expect(sourceEnd).toBeGreaterThan(sourceStart);
    const sourceCase = postgresNegative.slice(sourceStart, sourceEnd);
    expect(sourceCase).toContain("TEST_SOURCE_INDEX_PLANNING_CONTROL_FAILED");
    expect(sourceCase).toContain("where snapshot_digest is distinct from encode(");
    expect(sourceCase).toContain("copy public.trade_import_source_keys to stdout;");
    expect(sourceCase.match(/Get-TradeImportPersistenceSnapshot/gu)).toHaveLength(2);
    expect(sourceCase.indexOf("Relation COPY observer invoked the source-key index"))
      .toBeLessThan(sourceCase.indexOf("drop index public.equora_source_index_fixture"));
    expect(sourceCase.lastIndexOf("Get-TradeImportPersistenceSnapshot"))
      .toBeGreaterThan(sourceCase.indexOf("Source-key index fixture metadata-only cleanup"));
    expect(postgresNegative).toContain("Source-key nondefault operator class");
    expect(postgresNegative).toContain("Source-key inherited child");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_ACCOUNT_RELATION_EFFECTS_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_ACCOUNT_INDEX_EFFECTS_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_ACCOUNT_STATISTICS_EFFECTS_INVALID");
    expect(verifier).toContain("TRADE_IMPORT_VERIFY_PUBLICATION_EFFECTS_INVALID");
    expect(verifier).toContain("trigger_row.tgconstraint");
    expect(verifier).toContain("trigger_row.tgisinternal");
    expect(verifier).toContain("tgrelid='public.journal_import_accounts'::regclass) <> 8");
    expect(verifier).toContain("tgrelid='public.trade_import_source_keys'::regclass) <> 8");
    for (const fixture of [
      "Account unexpected key constraint",
      "Account unexpected expression index",
      "Account unexpected trigger",
      "Account unexpected incoming cascade foreign key",
      "Account unexpected rule",
      "Account inherited child",
      "Account unexpected statistics",
      "Unexpected logical publication membership",
      "Unexpected FOR ALL TABLES publication membership",
      "Unexpected FOR TABLES IN SCHEMA publication membership",
      "Authenticated role bypasses row security",
      "Source-key unexpected trigger",
      "Source-key unexpected rule",
      "Revert bounded lock timeout configuration",
    ]) {
      expect(postgresNegative).toContain(fixture);
    }
  });

  it("serializes migration markers and the mixed provider import/revert path", () => {
    for (const scenario of [
      "marker_then_patch",
      "marker_then_activate",
      "account_ddl_first_",
      "activate_account_ddl_late",
      "account_writer_compatible",
      "account_fk_ddl_first",
      "activate_account_fk_ddl_late",
      "publication_ddl_first",
      "activate_publication_ddl_late",
      "equora_ti_mixed_import",
      "equora_ti_mixed_revert",
    ]) {
      expect(postgresConcurrency).toContain(scenario);
    }
    expect(postgresConcurrency).toContain("TRADE_IMPORT_PATCH_UNKNOWN_MARKER");
    expect(postgresConcurrency).toContain("TRADE_IMPORT_ACTIVATION_UNKNOWN_MARKER");
    expect(postgresConcurrency).toContain("RowExclusiveLock");
    expect(postgresConcurrency).toContain("Provider duplicate/new import versus revert PASS");
    expect(postgresConcurrency).toContain("Incoming account FK concurrency PASS");
    expect(postgresConcurrency).toContain("Publication concurrency PASS");
    expect(postgresNegative).toContain("-SuperuserMutation");
    expect(postgresNegative).toContain("alter role authenticated bypassrls");
  });

  it("covers source-key DDL orders, timeout rollback, retry and writer compatibility", () => {
    for (const scenario of ["source_ddl_first_", "activate_source_ddl_", "source_writer_compatible"]) {
      expect(postgresConcurrency).toContain(scenario);
    }
    expect(postgresConcurrency).toContain("-ExpectTimeout:$sourceTimeout");
    expect(postgresConcurrency).toContain("Rejected source-key DDL/activation changed persistence");
    expect(postgresConcurrency).toContain("Timed-out source-key DDL left an index");
    expect(postgresConcurrency).toContain("$concurrentToken=if($sourceConcurrent){'concurrently '}else{''}");
    expect(postgresConcurrency).toContain("-SecondCompletesBeforeRelease");
    expect(postgresConcurrency).toContain("'completed-before-release'");
  });

  it("rejects all target statistics before the first affected data read", () => {
    for (const [text, relation, error, dataRead] of [
      [verifier, "equora_runtime_capability_gates", "TRADE_IMPORT_VERIFY_GATE_STATISTICS_EFFECTS_INVALID", "from public.equora_runtime_capability_gates"],
      [verifier, "journal_import_accounts", "TRADE_IMPORT_VERIFY_ACCOUNT_STATISTICS_EFFECTS_INVALID", null],
      [verifier, "trade_import_source_keys", "TRADE_IMPORT_VERIFY_SOURCE_KEY_STATISTICS_EFFECTS_INVALID", "from public.trade_import_source_keys"],
      [deactivation, "equora_runtime_capability_gates", "TRADE_IMPORT_DEACTIVATION_STATISTICS_EFFECTS_INVALID", "select enabled, activated_at into strict"],
    ] as const) {
      const guard = new RegExp(
        `if exists \\(\\s*select 1 from pg_catalog\\.pg_statistic_ext\\s*where stxrelid='public\\.${relation}'::regclass\\s*\\)\\s*then\\s*raise exception '${error}';\\s*end if;`,
        "u",
      );
      expect(text).toMatch(guard);
      expect(text.indexOf(error)).toBeGreaterThan(-1);
      if (dataRead !== null) {
        const readPosition = text.indexOf(dataRead);
        expect(readPosition).toBeGreaterThan(-1);
        expect(text.indexOf(error)).toBeLessThan(readPosition);
      }
    }
  });

  it("binds statistics regression controls and observers before metadata cleanup", () => {
    const start = postgresNegative.indexOf("$sourceStatisticsControl=@'");
    const end = postgresNegative.indexOf("# Replace existing columns", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const cases = postgresNegative.slice(start, end);
    for (const name of ["source_activation", "gate_activation", "gate_deactivation"]) {
      expect(cases).toContain(`Name='${name}'`);
    }
    expect(cases).toContain("TEST_STATISTICS_PLANNING_CONTROL_FAILED");
    expect(cases).toContain("where executor='postgres'");
    expect(cases).toContain("Invoke-TradeImportSqlExpectFailure $statisticsCase.Probe $statisticsCase.Error");
    expect(cases).not.toMatch(/^\s*analyze\b/imu);
    expect(cases).not.toContain("-PreservePersistence");
    expect(cases.match(/Get-TradeImportPersistenceSnapshot/gu)).toHaveLength(2);
    expect(cases.match(/Get-TradeImportScalar \$statisticsInvariant/gu)).toHaveLength(2);
    expect(cases).toContain("not (select is_called from public.equora_statistics_calls)");
    expect(cases).toContain("not exists (select 1 from public.equora_statistics_log)");
    expect(cases.indexOf("Relation COPY observer invoked statistics expression."))
      .toBeLessThan(cases.indexOf("drop statistics public.equora_statistics_fixture;"));
    expect(cases.lastIndexOf("Get-TradeImportPersistenceSnapshot"))
      .toBeGreaterThan(cases.indexOf("Statistics fixture metadata-only cleanup"));
    expect(cases).toContain("Get-TradeImportScalar $sourceCopySql");
    expect(cases).toContain("Get-TradeImportScalar $gateCopySql");
  });

  it("binds both statistics DDL orders, transition retries and final gate states", () => {
    const start = postgresConcurrency.indexOf("$statisticsRaces=@(");
    const end = postgresConcurrency.indexOf("$state=Get-TradeImportScalar", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const races = postgresConcurrency.slice(start, end);
    for (const name of ["source_statistics", "gate_on_statistics", "gate_off_statistics"]) {
      expect(races).toContain(`Name='${name}'`);
    }
    expect(races).toContain("$statisticsRace.Probe 'relation' -SecondOwnTransaction");
    expect(races).toContain("Rejected earlier statistics DDL changed persistence.");
    expect(races).toContain("Actual transition retry after statistics cleanup");
    expect(races).toContain("$statisticsRace.Body");
    expect(races).toContain("'relation' -ExpectTimeout");
    expect(races).toContain("Timed-out statistics DDL left metadata.");
    expect(races).toContain("-cne $statisticsRace.ExpectedEnabled");
    expect(races).toContain("Set-TradeImportActivationState -Enabled $false");
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
    expect(verifier.match(/array_agg\(attribute_row\.attname::text/gu)).toHaveLength(2);
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
    expect(postgresConcurrency).toContain("binding_update_then_revert");
    expect(postgresConcurrency).toContain("rowlock_then_write_revert_order");
    expect(postgresConcurrency).toContain("revert_table_lock_timeout");
    expect(postgresConcurrency).toContain("multi_trade_writer_then_revert");
    expect(postgresConcurrency).toContain("Binding/revert concurrency PASS");
    expect(postgresConcurrency).toContain(
      "EXCLUSIVE revert gate precedes every row lock",
    );
  });

  it("binds every executable routine body to the exact LF-normalized hash", () => {
    const definitions = [...sql.replaceAll("\r\n", "\n").matchAll(/create or replace function public\.(equora_upsert_import_account_v1|equora_enforce_v2_trade_batch_binding_v1|equora_import_trades_v2|equora_revert_import_v1)\s*\([\s\S]*?\bas \$\$([\s\S]*?)\$\$;/gu)];
    expect(definitions).toHaveLength(4);
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

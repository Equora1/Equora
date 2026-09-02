"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server-auth";
import { processMediaCleanupForPaths } from "@/lib/server/media-cleanup";
import { hasSupabaseClientEnv } from "@/lib/supabase/config";
import { inferTradeCaptureResultFromPnL } from "@/lib/utils/trade-capture";
import { deriveTradeSessionLabel } from "@/lib/utils/trade-time";
import {
  normalizeInstrumentType,
  normalizeTradePnLMode,
  parseTradingNumber,
} from "@/lib/utils/calculations";
import {
  getBrokerImportRuntimeDefaults,
  isCsvImportPresetKey,
} from "@/lib/utils/broker-import-kit";
import {
  CSV_IMPORT_LIMITS,
  getCsvImportPresetMeta,
  isExplicitCsvImportAccountLabel,
  normalizeCsvImportSourceIdentity,
  type CsvImportDraft,
  type CsvImportPresetKey,
  type CsvImportSourceManifestRow,
} from "@/lib/utils/trade-import";
import { appendTradeImportMeta } from "@/lib/utils/trade-import-meta";
import { normalizeTradeCurrency } from "@/lib/utils/currency";
import { brokerFileImportCapability } from "@/lib/utils/broker-file-import-capability";

export type CsvTradeImportInput = {
  rows: CsvImportDraft[];
  sourceRows: CsvImportSourceManifestRow[];
  batchId?: string | null;
  fileName?: string | null;
  presetLabel?: string | null;
  accountLabel?: string | null;
  accountId?: string | null;
  accountCurrency?: string | null;
};

export type TradeImportAccountSummary = {
  id: string;
  presetKey: CsvImportPresetKey;
  displayLabel: string;
  accountCurrency: string;
  updatedAt: string;
};

export type TradeImportBatchSummary = {
  id: string;
  createdAt: string;
  fileName: string | null;
  presetLabel: string | null;
  accountLabel: string | null;
  importedCount: number;
  duplicateCount: number;
  skippedCount: number;
  invalidCount: number;
  sourceRowCount: number;
  trustScore: number | null;
  trustLabel: string | null;
  status: string | null;
  revertedAt: string | null;
};

function toNumericField(value: string | null | undefined) {
  return value?.trim() ? parseTradingNumber(value) : null;
}

function revalidateTradeSurfaces() {
  revalidatePath("/dashboard");
  revalidatePath("/trades");
  revalidatePath("/statistik");
  revalidatePath("/kalender");
  revalidatePath("/review");
  revalidatePath("/setups");
}

function normalizeImportPreset(
  value?: CsvImportPresetKey | null,
): CsvImportPresetKey {
  return isCsvImportPresetKey(value) ? value : "generic";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getServerImportPlausibilityLabel(score: number) {
  if (score >= 85) return "Server-Plausibilität hoch";
  if (score >= 65) return "Server-Plausibilität mittel";
  return "Server-Prüfung erforderlich";
}

function buildServerImportPlausibility(row: CsvImportDraft) {
  let score = 100;
  const warnings = [
    "Aus übermittelten Importwerten rekonstruiert; Originaldatei nicht kryptografisch verifiziert.",
  ];
  if (!row.date?.trim()) score -= 35;
  if (!row.market?.trim()) score -= 35;
  if (!row.netPnL?.trim() && !(row.entry?.trim() && row.exit?.trim())) {
    score -= 25;
    warnings.push("P&L oder vollständiger Entry-/Exit-Kontext fehlt.");
  }
  if (!row.stopLoss?.trim()) {
    score -= 8;
    warnings.push("Initiales Risiko beziehungsweise Stop fehlt.");
  }
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    trustScore: safeScore,
    trustLabel: getServerImportPlausibilityLabel(safeScore),
    warnings,
  };
}

function getDraftPayloadIssue(rows: CsvImportDraft[]) {
  if (rows.length > CSV_IMPORT_LIMITS.maxRows) {
    return `Eine Importcharge darf höchstens ${CSV_IMPORT_LIMITS.maxRows} Zeilen enthalten.`;
  }
  for (const row of rows) {
    let serialized = "";
    try {
      serialized = JSON.stringify(row);
    } catch {
      return "Eine Importzeile enthält nicht serialisierbare Werte.";
    }
    if (serialized.length > CSV_IMPORT_LIMITS.maxDraftCharacters) {
      return "Eine Importzeile überschreitet das sichere Größenlimit.";
    }
  }
  return null;
}

function getSourceManifestIssue(
  sourceRows: CsvImportSourceManifestRow[],
  drafts: CsvImportDraft[],
) {
  if (!sourceRows.length || sourceRows.length > CSV_IMPORT_LIMITS.maxRows) {
    return `Das Quellenmanifest muss 1 bis ${CSV_IMPORT_LIMITS.maxRows} Zeilen enthalten.`;
  }
  const sourceRowNumbers = new Set<number>();
  const selectedRowNumbers = new Set<number>();
  for (const sourceRow of sourceRows) {
    if (
      !Number.isInteger(sourceRow.rowNumber) ||
      sourceRow.rowNumber < 2 ||
      !["importable", "check", "skip"].includes(sourceRow.previewStatus) ||
      typeof sourceRow.selected !== "boolean" ||
      sourceRowNumbers.has(sourceRow.rowNumber)
    ) {
      return "Das Quellenmanifest enthält eine ungültige oder doppelte Zeilennummer.";
    }
    sourceRowNumbers.add(sourceRow.rowNumber);
    if (sourceRow.selected) selectedRowNumbers.add(sourceRow.rowNumber);
  }

  const draftRowNumbers = new Set<number>();
  for (const draft of drafts) {
    if (
      !Number.isInteger(draft.rowNumber) ||
      draft.rowNumber < 2 ||
      draftRowNumbers.has(draft.rowNumber) ||
      !selectedRowNumbers.has(draft.rowNumber)
    ) {
      return "Die ausgewählten Importzeilen stimmen nicht eindeutig mit dem Quellenmanifest überein.";
    }
    draftRowNumbers.add(draft.rowNumber);
  }
  if (
    draftRowNumbers.size !== selectedRowNumbers.size ||
    [...selectedRowNumbers].some((rowNumber) => !draftRowNumbers.has(rowNumber))
  ) {
    return "Die ausgewählten Importzeilen sind im Quellenmanifest nicht vollständig gebunden.";
  }
  return null;
}

function resolveImportMeta(preset: CsvImportPresetKey | null | undefined) {
  const normalized = normalizeImportPreset(preset);
  return {
    normalized,
    ...getBrokerImportRuntimeDefaults(normalized),
  };
}


function isMissingImportBatchSchema(message?: string | null) {
  const value = (message ?? "").toLowerCase();
  return (
    value.includes("trade_import_batches") ||
    value.includes("journal_import_accounts") ||
    value.includes("equora_import_trades_v2") ||
    value.includes("equora_upsert_import_account_v1") ||
    value.includes("import_batch_id") ||
    value.includes("schema cache")
  );
}

export async function getTradeImportAccounts() {
  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: "demo" as const,
      accounts: [] as TradeImportAccountSummary[],
      message: "Demo-Modus: Importkonten werden nicht gespeichert.",
    };
  }

  try {
    const supabase = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        success: false,
        mode: "supabase" as const,
        accounts: [] as TradeImportAccountSummary[],
        message: "Bitte zuerst einloggen.",
      };
    }

    const { data, error } = await supabase
      .from("journal_import_accounts")
      .select(
        "id, preset_key, display_label, account_currency, updated_at",
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (error) {
      return {
        success: false,
        mode: "supabase" as const,
        accounts: [] as TradeImportAccountSummary[],
        message: isMissingImportBatchSchema(error.message)
          ? "Stabile Importkonten benötigen den geprüften v57.62-Schemakandidaten."
          : "Importkonten konnten nicht geladen werden.",
      };
    }

    return {
      success: true,
      mode: "supabase" as const,
      accounts: (data ?? []).flatMap((account) =>
        isCsvImportPresetKey(account.preset_key)
          ? [
              {
                id: account.id,
                presetKey: account.preset_key,
                displayLabel: account.display_label,
                accountCurrency: account.account_currency,
                updatedAt: account.updated_at,
              },
            ]
          : [],
      ) satisfies TradeImportAccountSummary[],
      message: "Importkonten geladen.",
    };
  } catch {
    return {
      success: false,
      mode: "supabase" as const,
      accounts: [] as TradeImportAccountSummary[],
      message: "Importkonten konnten nicht geladen werden.",
    };
  }
}

export async function getTradeImportBatches() {
  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: "demo" as const,
      batches: [] as TradeImportBatchSummary[],
      message: "Demo-Modus: Import-Verlauf wird erst mit Supabase gespeichert.",
    };
  }

  try {
    const supabase = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        mode: "supabase" as const,
        batches: [] as TradeImportBatchSummary[],
        message: "Bitte zuerst einloggen.",
      };
    }

    const { data, error } = await supabase
      .from("trade_import_batches")
      .select("id, created_at, file_name, preset_label, account_label, imported_count, duplicate_count, skipped_count, invalid_count, source_row_count, trust_score, trust_label, status, reverted_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      if (isMissingImportBatchSchema(error.message)) {
        return {
          success: false,
          mode: "supabase" as const,
          batches: [] as TradeImportBatchSummary[],
          message: "Import-Verlauf braucht den SQL-Patch v57.48.",
        };
      }
      return {
        success: false,
        mode: "supabase" as const,
        batches: [] as TradeImportBatchSummary[],
        message: `Import-Verlauf konnte nicht geladen werden. ${error.message}`,
      };
    }

    return {
      success: true,
      mode: "supabase" as const,
      batches: (data ?? []).map((batch) => ({
        id: batch.id,
        createdAt: batch.created_at,
        fileName: batch.file_name,
        presetLabel: batch.preset_label,
        accountLabel: batch.account_label,
        importedCount: batch.imported_count ?? 0,
        duplicateCount: batch.duplicate_count ?? 0,
        skippedCount: batch.skipped_count ?? 0,
        invalidCount: batch.invalid_count ?? 0,
        sourceRowCount: batch.source_row_count ?? 0,
        trustScore: batch.trust_score,
        trustLabel: batch.trust_label,
        status: batch.status,
        revertedAt: batch.reverted_at,
      })),
      message: "Import-Verlauf geladen.",
    };
  } catch (error) {
    return {
      success: false,
      mode: "supabase" as const,
      batches: [] as TradeImportBatchSummary[],
      message: `Import-Verlauf konnte nicht geladen werden. ${error instanceof Error ? error.message : "Unbekannter Fehler."}`,
    };
  }
}

export async function revertTradeImportBatch(batchId: string) {
  if (!batchId) return { success: false, message: "Kein Import ausgewählt." };

  if (!hasSupabaseClientEnv()) {
    return { success: true, mode: "demo" as const, message: "Demo-Modus: Import lokal entfernt.", deletedCount: 0 };
  }

  try {
    const supabase = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, mode: "supabase" as const, message: "Bitte zuerst einloggen." };

    const { data, error: revertError } = await supabase.rpc("equora_revert_import_v1", { p_batch_id: batchId });
    if (revertError) {
      return { success: false, mode: "supabase" as const, message: "Import konnte nicht atomar rückgängig gemacht werden. Die Daten blieben unverändert." };
    }
    const result = (data ?? {}) as { deletedCount?: number; storagePaths?: string[]; alreadyReverted?: boolean };
    const cleanup = await processMediaCleanupForPaths(result.storagePaths ?? []);

    revalidateTradeSurfaces();
    return {
      success: true,
      mode: "supabase" as const,
      message: result.alreadyReverted
        ? "Import war bereits rückgängig gemacht."
        : `${result.deletedCount ?? 0} importierte Trades atomar gelöscht.${cleanup.pending ? " Die Storage-Bereinigung läuft weiter." : ""}`,
      deletedCount: result.deletedCount ?? 0,
    };
  } catch (error) {
    return { success: false, mode: "supabase" as const, message: `Import konnte nicht rückgängig gemacht werden. ${error instanceof Error ? error.message : "Unbekannter Fehler."}` };
  }
}


export async function importTradeCsvEntries(input: CsvTradeImportInput) {
  const payloadIssue = getDraftPayloadIssue(input.rows);
  if (payloadIssue) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ("supabase" as const) : ("demo" as const),
      message: payloadIssue,
    };
  }
  const sourceRows = Array.isArray(input.sourceRows) ? input.sourceRows : [];
  const sourceManifestIssue = getSourceManifestIssue(sourceRows, input.rows);
  if (sourceManifestIssue) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ("supabase" as const) : ("demo" as const),
      message: sourceManifestIssue,
    };
  }
  const rows = input.rows;

  if (!rows.length) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ("supabase" as const) : ("demo" as const),
      message: "Keine importierbaren Zeilen gefunden.",
    };
  }

  if (!brokerFileImportCapability.persistenceEnabled) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ("supabase" as const) : ("demo" as const),
      message: brokerFileImportCapability.blockedReason,
    };
  }

  const selectedCurrency = normalizeTradeCurrency(input.accountCurrency);
  if (!selectedCurrency) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ("supabase" as const) : ("demo" as const),
      message: "Vor dem Import muss eine unterstützte Kontowährung ausgewählt werden: EUR, USD, GBP, USDT oder USDC.",
    };
  }
  const requestedPresets = new Set(
    rows.map((row) => normalizeImportPreset(row.importPreset)),
  );
  if (requestedPresets.size !== 1) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ("supabase" as const) : ("demo" as const),
      message:
        "Eine Importcharge muss vollständig zu genau einem statisch erlaubten Preset gehören.",
    };
  }

  const requestedAccountLabel =
    input.accountLabel?.trim().replace(/\s+/g, " ") ?? "";
  if (
    requestedAccountLabel.length < 3 ||
    requestedAccountLabel.length > 60
  ) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ("supabase" as const) : ("demo" as const),
      message:
        "Für den Import ist ein eindeutiger Zielkontoname mit 3 bis 60 Zeichen erforderlich.",
    };
  }
  const batchAccountLabel = requestedAccountLabel;
  const requestedAccountId = input.accountId?.trim() ?? "";
  if (requestedAccountId && !isUuid(requestedAccountId)) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ("supabase" as const) : ("demo" as const),
      message: "Das ausgewählte Importkonto ist ungültig.",
    };
  }
  const requestedBatchId = input.batchId?.trim() ?? "";
  if (requestedBatchId && !isUuid(requestedBatchId)) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ("supabase" as const) : ("demo" as const),
      message: "Die Import-Anforderungs-ID ist ungültig.",
    };
  }
  const hasStableSourceIdentity = rows.some((row) =>
    Boolean(normalizeCsvImportSourceIdentity(row.sourceIdentity)),
  );
  if (
    hasStableSourceIdentity &&
    !isExplicitCsvImportAccountLabel(batchAccountLabel)
  ) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ("supabase" as const) : ("demo" as const),
      message:
        "Für Exporte mit stabiler Quell-ID ist ein eindeutiger Zielkontoname erforderlich, zum Beispiel Broker, Plattform und Konto-Kürzel.",
    };
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: "demo" as const,
      importedCount: rows.length,
      duplicateCount: 0,
      skippedCount: sourceRows.filter((row) => !row.selected).length,
      importedIds: rows
        .slice(0, 12)
        .map((_, index) => `demo-import-${index + 1}`),
      message: `${rows.length} Trades als Demo-Import vorbereitet.`,
    };
  }

  try {
    const supabase = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        mode: "supabase" as const,
        message: "Bitte zuerst einloggen.",
      };
    }

    const batchId = requestedBatchId || crypto.randomUUID();
    const firstPreset = rows[0]?.importPreset ?? "generic";
    const importMetaForBatch = resolveImportMeta(firstPreset);
    const batchFileName =
      input.fileName?.trim().slice(0, 160) || "Unbenannte Datei";
    const batchPresetLabel = importMetaForBatch.presetLabel;
    const stagedTrades: Record<string, unknown>[] = [];
    const stagedTagsByRowNumber = new Map<number, string[]>();
    const sourceKeysByRowNumber = new Map<
      number,
      Array<{
        kind: "provider_identity_v1";
        identityKind: string;
        identityValue: string;
      }>
    >();

    for (const row of rows) {
      const normalizedDate = new Date(row.date);
      if (
        Number.isNaN(normalizedDate.getTime()) ||
        normalizedDate.toISOString() !== row.date ||
        !row.market.trim()
      ) {
        return {
          success: false,
          mode: "supabase" as const,
          message: `Ausgewählte Quellenzeile ${row.rowNumber} enthält kein kanonisches Datum oder keinen Markt.`,
        };
      }

      const timestamp = normalizedDate.toISOString();
      const tradeOccurredAt = timestamp;
      const netPnL = toNumericField(row.netPnL);
      const positionSize = toNumericField(row.positionSize);
      const bias = row.direction?.trim() || null;
      const importMeta = resolveImportMeta(row.importPreset);
      const rowCurrencyRaw = row.currency?.trim() ?? "";
      const rowCurrency = rowCurrencyRaw
        ? normalizeTradeCurrency(rowCurrencyRaw)
        : selectedCurrency;
      if (!rowCurrency) {
        return {
          success: false,
          mode: "supabase" as const,
          message: `Ausgewählte Quellenzeile ${row.rowNumber} enthält keine unterstützte Kontowährung.`,
        };
      }
      const sourceIdentityDescriptor =
        getCsvImportPresetMeta(importMeta.normalized).sourceIdentity;
      const requestedSourceIdentity = normalizeCsvImportSourceIdentity(
        row.sourceIdentity,
      );
      const sourceIdentity =
        sourceIdentityDescriptor &&
        requestedSourceIdentity?.kind === sourceIdentityDescriptor.kind
          ? requestedSourceIdentity
          : null;
      if (sourceIdentityDescriptor && !sourceIdentity) {
        return {
          success: false,
          mode: "supabase" as const,
          message: `Ausgewählte Quellenzeile ${row.rowNumber} enthält nicht die für ${importMeta.presetLabel} erforderliche stabile Quell-ID.`,
        };
      }
      const sourceContext = sourceIdentity
        ? {
            brokerProfile: importMeta.brokerProfile,
            accountTemplate: importMeta.accountTemplate,
            accountLabel: batchAccountLabel,
          }
        : null;
      sourceKeysByRowNumber.set(
        row.rowNumber,
        sourceIdentity
          ? [
              {
                kind: "provider_identity_v1",
                identityKind: sourceIdentity.kind,
                identityValue: sourceIdentity.value,
              },
            ]
          : [],
      );

      const entry = toNumericField(row.entry);
      const exit = toNumericField(row.exit);
      const stopLoss = toNumericField(row.stopLoss);
      const takeProfit = toNumericField(row.takeProfit);
      const fees = toNumericField(row.fees);
      const leverage = toNumericField(row.leverage);
      const resolvedPnLMode = normalizeTradePnLMode(undefined, netPnL);
      const hasEnoughContext =
        netPnL !== null ||
        (entry !== null && exit !== null) ||
        (entry !== null && stopLoss !== null && takeProfit !== null);
      const inferredResult = inferTradeCaptureResultFromPnL(netPnL);
      const captureStatus = hasEnoughContext ? "complete" : "incomplete";
      const captureResult =
        inferredResult ??
        (captureStatus === "incomplete" && entry !== null && exit === null
          ? "open"
          : null);
      const tags = Array.from(
        new Set((row.tags ?? []).map((tag) => tag.trim()).filter(Boolean)),
      );
      const noteParts = [importMeta.noteLead, row.notes?.trim()].filter(
        Boolean,
      );
      const plausibility = buildServerImportPlausibility(row);
      const persistedImportNote = appendTradeImportMeta(
        noteParts.join("\n\n") || null,
        {
          presetKey: importMeta.normalized,
          presetLabel: importMeta.presetLabel,
          importedAt: null,
          fieldSources: null,
          fieldHeaders: null,
          trustScore: plausibility.trustScore,
          trustLabel: plausibility.trustLabel,
          warnings: plausibility.warnings,
          sourceIdentity,
          sourceContext,
          provenance: "server_reconstructed",
        },
      );
      const instrumentType = normalizeInstrumentType(
        row.instrumentType || importMeta.instrumentType,
      );

      stagedTrades.push({
        row_number: row.rowNumber,
        created_at: timestamp,
        market: row.market.trim(),
        setup: row.setup?.trim() || importMeta.setup,
        emotion: null,
        bias,
        rule_check: null,
        entry,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        exit,
        net_pnl: netPnL,
        risk_percent: null,
        r_multiple: null,
        pnl_mode: resolvedPnLMode,
        cost_profile: importMeta.costProfile,
        broker_profile: importMeta.brokerProfile,
        instrument_type: instrumentType,
        account_template: importMeta.accountTemplate,
        account_label: batchAccountLabel,
        market_template: importMeta.marketTemplate,
        position_size: positionSize,
        point_value: null,
        fees,
        exchange_fees: null,
        funding_fees: null,
        funding_rate_bps: null,
        funding_intervals: null,
        spread_cost: null,
        slippage: null,
        account_currency: rowCurrency,
        crypto_market_type: importMeta.cryptoMarketType,
        execution_type: "manual",
        funding_direction: "manual",
        quote_asset: null,
        leverage,
        user_cost_profile_id: null,
        capture_status: captureStatus,
        capture_result: captureResult,
        captured_at: tradeOccurredAt,
        completed_at: captureStatus === "complete" ? tradeOccurredAt : null,
        notes: persistedImportNote,
        screenshot_url: null,
        quality: tags.includes("A-Setup")
          ? "A-Setup"
          : tags.includes("C-Setup")
            ? "C-Setup"
            : "B-Setup",
        session:
          row.session?.trim() || deriveTradeSessionLabel(tradeOccurredAt),
        concept: null,
      });

      if (tags.length) {
        stagedTagsByRowNumber.set(row.rowNumber, tags);
      }
    }

    if (stagedTrades.length !== rows.length) {
      return {
        success: false,
        mode: "supabase" as const,
        importedCount: 0,
        duplicateCount: 0,
        skippedCount: sourceRows.filter((row) => !row.selected).length,
        importedIds: [],
        message: "Die ausgewählten Quellenzeilen konnten nicht vollständig serverseitig rekonstruiert werden.",
      };
    }
    const { data: importResultData, error: importError } = await supabase.rpc(
      "equora_import_trades_v2",
      {
      p_batch_id: batchId,
      p_import_account_id: requestedAccountId || null,
      p_batch: {
        file_name: batchFileName,
        preset_key: importMetaForBatch.normalized,
        preset_label: batchPresetLabel,
        account_label: batchAccountLabel,
        account_currency: selectedCurrency,
      },
      p_source_rows: sourceRows.map((sourceRow) => ({
        row_number: sourceRow.rowNumber,
        preview_status: sourceRow.previewStatus,
        selected: sourceRow.selected,
      })),
      p_trades: stagedTrades.map((stagedTrade) => {
        const rowNumber = Number(stagedTrade.row_number);
        const { row_number: _rowNumber, ...trade } = stagedTrade;
        return {
        row_number: rowNumber,
        trade,
        tags: stagedTagsByRowNumber.get(rowNumber) ?? [],
        source_keys:
          sourceKeysByRowNumber.get(rowNumber) ?? [],
      };
      }),
      },
    );
    if (importError) {
      return {
        success: false,
        mode: "supabase" as const,
        message: isMissingImportBatchSchema(importError.message)
          ? "Import bleibt gesperrt: Die atomare v57.62-Importmigration ist noch nicht angewandt."
          : "Import wurde vollständig zurückgerollt. Importkonto, Dublettenbindung und Eingabedaten prüfen.",
      };
    }
    const importResult =
      typeof importResultData === "object" && importResultData !== null
        ? (importResultData as {
            importedCount?: number;
            duplicateCount?: number;
            skippedCount?: number;
            invalidCount?: number;
            sourceRowCount?: number;
            importedIds?: string[];
          })
        : {};
    const importedCount = Math.max(0, importResult.importedCount ?? 0);
    const duplicateCount = Math.max(0, importResult.duplicateCount ?? 0);
    const skippedCount = Math.max(0, importResult.skippedCount ?? 0);
    const invalidCount = Math.max(0, importResult.invalidCount ?? 0);
    const sourceRowCount = Math.max(0, importResult.sourceRowCount ?? 0);
    const authoritativeImportedIds = Array.isArray(importResult.importedIds)
      ? importResult.importedIds.filter(
          (id): id is string => typeof id === "string" && isUuid(id),
        )
      : [];
    if (
      sourceRowCount !==
        importedCount + duplicateCount + skippedCount + invalidCount ||
      authoritativeImportedIds.length !== importedCount
    ) {
      return {
        success: false,
        mode: "supabase" as const,
        message:
          "Der serverseitige Importbericht ist inkonsistent. Die Charge wird nicht als erfolgreich dargestellt.",
      };
    }

    revalidateTradeSurfaces();

    const summaryParts = [
      `${importedCount} Trade${importedCount === 1 ? "" : "s"} importiert`,
    ];
    if (duplicateCount)
      summaryParts.push(
        `${duplicateCount} Dublette${duplicateCount === 1 ? "" : "n"} übersprungen`,
      );
    if (skippedCount)
      summaryParts.push(
        `${skippedCount} Zeile${skippedCount === 1 ? "" : "n"} ausgelassen`,
      );
    if (invalidCount)
      summaryParts.push(
        `${invalidCount} Zeile${invalidCount === 1 ? "" : "n"} nicht ausgewählt oder prüfpflichtig`,
      );

    return {
      success: true,
      mode: "supabase" as const,
      importedCount,
      duplicateCount,
      skippedCount,
      invalidCount,
      sourceRowCount,
      importedIds: authoritativeImportedIds.slice(0, 24),
      batchId,
      message: `${summaryParts.join(" · ")}.`,
    };
  } catch (error) {
    return {
      success: false,
      mode: "supabase" as const,
      message: `Import fehlgeschlagen. ${error instanceof Error ? error.message : "Unbekannter Fehler."}`,
    };
  }
}

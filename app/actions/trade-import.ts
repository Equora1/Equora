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
import type {
  CsvImportDraft,
  CsvImportPresetKey,
} from "@/lib/utils/trade-import";
import { appendTradeImportMeta } from "@/lib/utils/trade-import-meta";
import { normalizeTradeCurrency } from "@/lib/utils/currency";

export type CsvTradeImportInput = {
  rows: CsvImportDraft[];
  fileName?: string | null;
  presetLabel?: string | null;
  accountLabel?: string | null;
  accountCurrency?: string | null;
  trustScore?: number | null;
  trustLabel?: string | null;
  warnings?: string[] | null;
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

function buildTradeFingerprint(input: {
  createdAt: string;
  market: string;
  bias?: string | null;
  netPnL?: number | null;
  positionSize?: number | null;
  accountCurrency?: string | null;
  brokerProfile?: string | null;
  accountTemplate?: string | null;
  accountLabel?: string | null;
}) {
  const date = new Date(input.createdAt);
  const timestampKey = Number.isNaN(date.getTime())
    ? input.createdAt.trim()
    : date.toISOString();
  return [
    timestampKey,
    input.market.trim().toLowerCase(),
    (input.bias ?? "").trim().toLowerCase(),
    input.netPnL ?? "",
    input.positionSize ?? "",
    (input.accountCurrency ?? "").trim().toUpperCase(),
    (input.brokerProfile ?? "").trim().toLowerCase(),
    (input.accountTemplate ?? "").trim().toLowerCase(),
    (input.accountLabel ?? "").trim().toLowerCase(),
  ].join("|");
}

function normalizeImportPreset(
  value?: CsvImportPresetKey | null,
): CsvImportPresetKey {
  const supported: CsvImportPresetKey[] = [
    "generic",
    "mexc-futures",
    "mexc-spot",
    "binance-futures",
    "bybit-futures",
    "okx-futures",
    "kraken-spot",
  ];
  return supported.includes(value ?? "generic")
    ? (value ?? "generic")
    : "generic";
}

function resolveImportMeta(preset: CsvImportPresetKey | null | undefined) {
  const normalized = normalizeImportPreset(preset);

  const cryptoBase = {
    costProfile: "crypto-perps",
    instrumentType: "crypto",
    cryptoMarketType: "perps",
    accountTemplate: "crypto-perps",
    marketTemplate: "manual",
    accountCurrency: "USDT",
  };

  if (normalized === "mexc-futures") {
    return {
      normalized,
      noteLead: "Importiert aus MEXC Futures CSV",
      presetLabel: "MEXC Futures",
      setup: "MEXC Futures Import",
      brokerProfile: "mexc-perps",
      ...cryptoBase,
    };
  }

  if (normalized === "bybit-futures") {
    return {
      normalized,
      noteLead: "Importiert aus Bybit Futures CSV",
      presetLabel: "Bybit Futures",
      setup: "Bybit Futures Import",
      brokerProfile: "bybit-perps",
      ...cryptoBase,
    };
  }

  if (normalized === "okx-futures") {
    return {
      normalized,
      noteLead: "Importiert aus OKX Futures CSV",
      presetLabel: "OKX Futures",
      setup: "OKX Futures Import",
      brokerProfile: "okx-perps",
      ...cryptoBase,
    };
  }

  if (normalized === "binance-futures") {
    return {
      normalized,
      noteLead: "Importiert aus Binance Futures CSV",
      presetLabel: "Binance Futures",
      setup: "Binance Futures Import",
      brokerProfile: "manual",
      ...cryptoBase,
    };
  }

  if (normalized === "mexc-spot" || normalized === "kraken-spot") {
    const isMexcSpot = normalized === "mexc-spot";
    return {
      normalized,
      noteLead: isMexcSpot
        ? "Importiert aus MEXC Spot CSV"
        : "Importiert aus Kraken Spot CSV",
      presetLabel: isMexcSpot ? "MEXC Spot" : "Kraken Spot",
      setup: isMexcSpot ? "MEXC Spot Import" : "Kraken Spot Import",
      brokerProfile: isMexcSpot ? "mexc-spot" : "manual",
      costProfile: "crypto-spot",
      instrumentType: "crypto",
      cryptoMarketType: "spot",
      accountTemplate: "crypto-spot",
      marketTemplate: "manual",
      accountCurrency: "USDT",
    };
  }

  return {
    normalized,
    noteLead: "Importiert aus CSV",
    presetLabel: "Allgemeine CSV",
    setup: "CSV Import",
    brokerProfile: "manual",
    costProfile: "manual",
    instrumentType: "unknown",
    cryptoMarketType: "manual",
    accountTemplate: "manual",
    marketTemplate: "manual",
    accountCurrency: null,
  };
}


function isMissingImportBatchSchema(message?: string | null) {
  const value = (message ?? "").toLowerCase();
  return value.includes("trade_import_batches") || value.includes("import_batch_id") || value.includes("schema cache");
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
      .select("id, created_at, file_name, preset_label, account_label, imported_count, duplicate_count, skipped_count, trust_score, trust_label, status, reverted_at")
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
  const rows = input.rows.filter(
    (row) => row.date?.trim() && row.market?.trim(),
  );

  if (!rows.length) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ("supabase" as const) : ("demo" as const),
      message: "Keine importierbaren Zeilen gefunden.",
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

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: "demo" as const,
      importedCount: rows.length,
      duplicateCount: 0,
      skippedCount: 0,
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

    const batchId = crypto.randomUUID();
    const firstPreset = rows[0]?.importPreset ?? "generic";
    const importMetaForBatch = resolveImportMeta(firstPreset);
    const batchFileName = input.fileName?.trim() || "Unbenannte Datei";
    const batchPresetLabel = input.presetLabel?.trim() || importMetaForBatch.presetLabel;
    const batchAccountLabel = input.accountLabel?.trim() || null;

    const { data: existingTrades, error: existingTradesError } = await supabase
      .from("trades")
      .select("id, created_at, market, bias, net_pnl, position_size, account_currency, broker_profile, account_template, account_label")
      .eq("user_id", user.id);

    if (existingTradesError) {
      return {
        success: false,
        mode: "supabase" as const,
        message: `Bestehende Trades konnten nicht geprüft werden. ${existingTradesError.message}`,
      };
    }

    const existingFingerprints = new Set(
      (existingTrades ?? []).map((trade) =>
        buildTradeFingerprint({
          createdAt: trade.created_at,
          market: trade.market,
          bias: trade.bias,
          netPnL:
            typeof trade.net_pnl === "number"
              ? trade.net_pnl
              : parseTradingNumber(trade.net_pnl),
          positionSize:
            typeof trade.position_size === "number"
              ? trade.position_size
              : parseTradingNumber(trade.position_size),
          accountCurrency: trade.account_currency,
          brokerProfile: trade.broker_profile,
          accountTemplate: trade.account_template,
          accountLabel: trade.account_label,
        }),
      ),
    );

    const stagedTrades: Record<string, unknown>[] = [];
    const stagedTags: Record<string, unknown>[] = [];
    const importedIds: string[] = [];
    const seenFingerprints = new Set<string>();
    let duplicateCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
      const normalizedDate = new Date(row.date);
      if (Number.isNaN(normalizedDate.getTime()) || !row.market.trim()) {
        skippedCount += 1;
        continue;
      }

      const tradeId = crypto.randomUUID();
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
        skippedCount += 1;
        continue;
      }
      const fingerprint = buildTradeFingerprint({
        createdAt: timestamp,
        market: row.market,
        bias,
        netPnL,
        positionSize,
        accountCurrency: rowCurrency,
        brokerProfile: importMeta.brokerProfile,
        accountTemplate: importMeta.accountTemplate,
        accountLabel: batchAccountLabel,
      });

      if (
        existingFingerprints.has(fingerprint) ||
        seenFingerprints.has(fingerprint)
      ) {
        duplicateCount += 1;
        continue;
      }

      seenFingerprints.add(fingerprint);
      importedIds.push(tradeId);

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
      const persistedImportNote = appendTradeImportMeta(
        noteParts.join("\n\n") || null,
        {
          presetKey: importMeta.normalized,
          presetLabel: importMeta.presetLabel,
          importedAt: timestamp,
          fieldSources: row.fieldSources ?? null,
          fieldHeaders: row.fieldHeaders ?? null,
          trustScore: row.importTrustScore ?? null,
          trustLabel: row.importTrustLabel ?? null,
          warnings: row.importWarnings ?? null,
        },
      );
      const instrumentType = normalizeInstrumentType(
        row.instrumentType || importMeta.instrumentType,
      );

      stagedTrades.push({
        id: tradeId,
        user_id: user.id,
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
        import_batch_id: batchId,
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
        stagedTags.push(
          ...tags.map((tag) => ({
            id: crypto.randomUUID(),
            trade_id: tradeId,
            tag,
            created_at: timestamp,
          })),
        );
      }
    }

    if (!stagedTrades.length) {
      return {
        success: false,
        mode: "supabase" as const,
        importedCount: 0,
        duplicateCount,
        skippedCount,
        importedIds: [],
        message: duplicateCount
          ? "Alle Zeilen wurden als mögliche Dubletten erkannt."
          : "Keine Trades konnten importiert werden.",
      };
    }

    const importedCount = stagedTrades.length;
    const tagsByTradeId = stagedTags.reduce<Record<string, string[]>>((map, row) => {
      const tradeId = String(row.trade_id ?? "");
      const tag = String(row.tag ?? "");
      if (tradeId && tag) (map[tradeId] ||= []).push(tag);
      return map;
    }, {});
    const { error: importError } = await supabase.rpc("equora_import_trades_v1", {
      p_batch_id: batchId,
      p_batch: {
        file_name: batchFileName,
        preset_key: importMetaForBatch.normalized,
        preset_label: batchPresetLabel,
        account_label: batchAccountLabel,
        duplicate_count: duplicateCount,
        skipped_count: skippedCount,
        trust_score: input.trustScore ?? null,
        trust_label: input.trustLabel ?? null,
        warnings: input.warnings ?? [],
      },
      p_trades: stagedTrades.map((trade) => ({
        trade,
        tags: tagsByTradeId[String(trade.id ?? "")] ?? [],
      })),
    });
    if (importError) {
      return {
        success: false,
        mode: "supabase" as const,
        message: "Import wurde vollständig zurückgerollt. Bitte Datenbankmigration v57.60.1 und Eingabedaten prüfen.",
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

    return {
      success: true,
      mode: "supabase" as const,
      importedCount,
      duplicateCount,
      skippedCount,
      importedIds: importedIds.slice(0, 24),
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

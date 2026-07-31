"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getTradeImportBatches, importTradeCsvEntries, revertTradeImportBatch, type TradeImportBatchSummary } from "@/app/actions/trade-import";
import { getAccountTemplateLabel } from "@/lib/utils/trade-presets";
import {
  buildCsvImportDrafts,
  buildCsvImportPreview,
  csvImportFieldDefinitions,
  csvImportPresets,
  getCsvImportPresetMeta,
  inferCsvImportMapping,
  parseCsvText,
  type ParsedCsvData,
  type CsvImportFieldKey,
  type CsvImportMapping,
  type CsvImportPresetKey,
  type CsvImportPreviewStatus,
  type CsvImportRepairOverrides,
  type CsvImportValueSource,
} from "@/lib/utils/trade-import";

const requiredFieldKeys: CsvImportFieldKey[] = ["date", "market"];
const visibleOptionalFieldKeys: CsvImportFieldKey[] = [
  "netPnL",
  "entry",
  "exit",
  "stopLoss",
  "takeProfit",
  "direction",
  "setup",
  "session",
  "tags",
  "notes",
  "fees",
  "positionSize",
  "instrumentType",
  "leverage",
];
const coreOptionalFieldKeys: CsvImportFieldKey[] = [
  "netPnL",
  "entry",
  "exit",
  "direction",
  "setup",
];
const repairFieldKeys: CsvImportFieldKey[] = [
  "date",
  "market",
  "netPnL",
  "entry",
  "exit",
  "direction",
  "fees",
  "positionSize",
  "leverage",
];

function getPresetAccountLabel(preset: CsvImportPresetKey) {
  if (preset === "mexc-spot" || preset === "kraken-spot") return getAccountTemplateLabel("crypto-spot");
  if (preset === "mexc-futures" || preset === "binance-futures" || preset === "bybit-futures" || preset === "okx-futures") return getAccountTemplateLabel("crypto-perps");
  return "Hauptkonto";
}

type ImportReport = {
  importedCount: number;
  duplicateCount: number;
  skippedCount: number;
  repairCount: number;
  importedPresetLabel: string;
  batchId?: string | null;
};

const spreadsheetExtensions = new Set(["xlsx", "xls"]);
const spreadsheetHeaderHints = [
  "time",
  "date",
  "symbol",
  "pair",
  "contract",
  "market",
  "pnl",
  "profit",
  "price",
  "side",
  "direction",
  "fee",
];

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function normalizeSpreadsheetCell(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function makeUniqueHeaders(headers: string[]) {
  const used = new Map<string, number>();
  return headers.map((header, index) => {
    const base = header.trim() || `Spalte ${index + 1}`;
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count ? `${base} ${count + 1}` : base;
  });
}

function findSpreadsheetHeaderRow(rows: string[][]) {
  let fallback = 0;
  let fallbackScore = -1;

  for (let index = 0; index < Math.min(rows.length, 25); index += 1) {
    const cells = rows[index].map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 2) continue;

    const joined = cells.join(" ").toLowerCase();
    const hintScore = spreadsheetHeaderHints.reduce(
      (score, hint) => score + (joined.includes(hint) ? 1 : 0),
      0,
    );

    if (hintScore >= 2) return index;
    if (hintScore > fallbackScore) {
      fallback = index;
      fallbackScore = hintScore;
    }
  }

  return fallback;
}

async function parseSpreadsheetFile(file: File): Promise<ParsedCsvData> {
  const extension = getFileExtension(file.name);

  if (extension === "xls") {
    throw new Error(
      "Alte .xls-Dateien bitte in Excel als .xlsx oder .csv speichern und erneut wählen.",
    );
  }

  const { readSheet } = await import("read-excel-file/browser");
  const table: string[][] = (await readSheet(file))
    .map((row) => row.map(normalizeSpreadsheetCell))
    .filter((row) => row.some(Boolean));

  if (!table.length) {
    return { delimiter: "excel", headers: [], rows: [] };
  }

  const headerRowIndex = findSpreadsheetHeaderRow(table);
  const headers = makeUniqueHeaders(table[headerRowIndex] ?? []);
  const dataRows = table.slice(headerRowIndex + 1);
  const rows = dataRows.map((row) =>
    headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = row[index] ?? "";
      return acc;
    }, {}),
  );

  return { delimiter: "excel", headers, rows };
}

async function parseImportFile(file: File): Promise<ParsedCsvData> {
  const extension = getFileExtension(file.name);

  if (spreadsheetExtensions.has(extension)) {
    return parseSpreadsheetFile(file);
  }

  return parseCsvText(await file.text());
}

export function TradeImportPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPreset, setSelectedPreset] =
    useState<CsvImportPresetKey>("generic");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<CsvImportMapping>({});
  const [repairOverrides, setRepairOverrides] =
    useState<CsvImportRepairOverrides>({});
  const [statusMessage, setStatusMessage] = useState("");
  const [lastImportReport, setLastImportReport] = useState<ImportReport | null>(
    null,
  );
  const [includeCheckRows, setIncludeCheckRows] = useState(true);
  const [showOptionalMappings, setShowOptionalMappings] = useState(false);
  const [isImporting, startImporting] = useTransition();
  const [isHistoryPending, startHistoryTransition] = useTransition();
  const [importBatches, setImportBatches] = useState<TradeImportBatchSummary[]>([]);
  const [historyMessage, setHistoryMessage] = useState("");

  const presetMeta = useMemo(
    () => getCsvImportPresetMeta(selectedPreset),
    [selectedPreset],
  );
  const importAccountLabel = useMemo(() => getPresetAccountLabel(selectedPreset), [selectedPreset]);
  const previewRows = useMemo(
    () =>
      buildCsvImportPreview(rawRows, mapping, selectedPreset, repairOverrides),
    [mapping, rawRows, repairOverrides, selectedPreset],
  );
  const counts = useMemo(() => {
    return previewRows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "importable") acc.importable += 1;
        if (row.status === "check") acc.check += 1;
        if (row.status === "skip") acc.skip += 1;
        if (hasSource(row.sources, "manual")) acc.manual += 1;
        if (hasSource(row.sources, "preset")) acc.preset += 1;
        return acc;
      },
      { total: 0, importable: 0, check: 0, skip: 0, manual: 0, preset: 0 },
    );
  }, [previewRows]);

  const trustSummary = useMemo(() => buildImportTrustSummary(previewRows), [previewRows]);

  const drafts = useMemo(
    () =>
      buildCsvImportDrafts(previewRows, {
        includeCheckRows,
        presetKey: selectedPreset,
      }),
    [includeCheckRows, previewRows, selectedPreset],
  );
  const previewSlice = previewRows.slice(0, 8);
  const repairRows = useMemo(
    () => previewRows.filter((row) => row.status !== "importable"),
    [previewRows],
  );
  const readiness = useMemo(
    () =>
      buildImportReadiness(
        headers,
        mapping,
        counts.total,
        counts.importable,
        counts.check,
        counts.skip,
      ),
    [
      counts.check,
      counts.importable,
      counts.skip,
      counts.total,
      headers,
      mapping,
    ],
  );


  function loadImportHistory() {
    startHistoryTransition(async () => {
      const result = await getTradeImportBatches();
      setImportBatches(result.batches ?? []);
      if (!result.success) setHistoryMessage(result.message);
    });
  }

  useEffect(() => {
    loadImportHistory();
  }, []);

  function handleRevertImport(batch: TradeImportBatchSummary) {
    if (batch.status === "reverted") return;
    const confirmed = window.confirm(`Import „${batch.fileName || batch.presetLabel || "ohne Namen"}“ wirklich rückgängig machen? Alle Trades aus diesem Upload werden gelöscht.`);
    if (!confirmed) return;

    startHistoryTransition(async () => {
      const result = await revertTradeImportBatch(batch.id);
      setHistoryMessage(result.message);
      loadImportHistory();
      router.refresh();
    });
  }

  async function handleFileChange(file: File | null) {
    setStatusMessage("");
    setLastImportReport(null);
    setRepairOverrides({});

    if (!file) {
      setFileName("");
      setHeaders([]);
      setRawRows([]);
      setMapping({});
      return;
    }

    try {
      const parsed = await parseImportFile(file);
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(inferCsvImportMapping(parsed.headers, selectedPreset));

      if (!parsed.headers.length || !parsed.rows.length) {
        setStatusMessage(
          "Datei gelesen, aber ohne brauchbare Kopfzeile oder Datenzeilen.",
        );
      }
    } catch (error) {
      setFileName(file.name);
      setHeaders([]);
      setRawRows([]);
      setMapping({});
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Datei konnte nicht gelesen werden.",
      );
    }
  }

  function handlePresetChange(nextPreset: CsvImportPresetKey) {
    setSelectedPreset(nextPreset);
    setStatusMessage("");
    setLastImportReport(null);
    setRepairOverrides({});
    if (headers.length) {
      setMapping(inferCsvImportMapping(headers, nextPreset));
    }
  }

  function handleMappingChange(field: CsvImportFieldKey, header: string) {
    setLastImportReport(null);
    setMapping((current) => ({
      ...current,
      [field]: header || undefined,
    }));
  }

  function handleRepairChange(
    rowNumber: number,
    field: CsvImportFieldKey,
    value: string,
  ) {
    setLastImportReport(null);
    setRepairOverrides((current) => ({
      ...current,
      [rowNumber]: {
        ...(current[rowNumber] ?? {}),
        [field]: value,
      },
    }));
  }

  function handleResetRow(rowNumber: number) {
    setLastImportReport(null);
    setRepairOverrides((current) => {
      if (!(rowNumber in current)) return current;
      const next = { ...current };
      delete next[rowNumber];
      return next;
    });
  }

  function handleImport() {
    if (!drafts.length) {
      setStatusMessage("Noch keine importierbaren Zeilen ausgewählt.");
      return;
    }

    startImporting(async () => {
      const result = await importTradeCsvEntries({
        rows: drafts,
        fileName,
        presetLabel: presetMeta.label,
        accountLabel: importAccountLabel,
        trustScore: trustSummary.score,
        trustLabel: trustSummary.label,
        warnings: trustSummary.warnings,
      });
      setStatusMessage(result.message);
      setLastImportReport({
        importedCount: result.importedCount ?? drafts.length,
        duplicateCount: result.duplicateCount ?? 0,
        skippedCount: result.skippedCount ?? 0,
        repairCount: repairRows.length,
        importedPresetLabel: presetMeta.label,
        batchId: result.batchId ?? null,
      });
      if (!result.success) return;

      loadImportHistory();

      const params = new URLSearchParams();
      if (result.importedIds?.length) {
        params.set("reviewTradeIds", result.importedIds.join("|"));
        params.set("tradeId", result.importedIds[0]);
      }
      params.set("reviewTitle", `${presetMeta.label} Import`);
      params.set("reviewDescription", result.message);
      const chips = [
        `Neu: ${result.importedCount ?? drafts.length}`,
        presetMeta.label,
      ];
      if (result.duplicateCount)
        chips.push(`Dubletten: ${result.duplicateCount}`);
      if (result.skippedCount)
        chips.push(`Ausgelassen: ${result.skippedCount}`);
      if (repairRows.length) chips.push(`Problemzeilen: ${repairRows.length}`);
      params.set("reviewChips", chips.join("|"));
      router.push(`/trades?${params.toString()}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
              Import-Verlauf
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Letzte Uploads
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/55">
              Hier kannst du einen kompletten CSV- oder Excel-Import wieder entfernen, falls Datei, Zeitraum oder Konto falsch waren.
            </p>
          </div>
          <button
            type="button"
            onClick={loadImportHistory}
            disabled={isHistoryPending}
            className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:text-white/35"
          >
            {isHistoryPending ? "Lädt …" : "Aktualisieren"}
          </button>
        </div>

        {historyMessage ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/65">
            {historyMessage}
          </div>
        ) : null}

        {importBatches.length ? (
          <div className="mt-5 grid gap-3">
            {importBatches.map((batch) => {
              const reverted = batch.status === "reverted";
              return (
                <div
                  key={batch.id}
                  className={`rounded-2xl border p-4 ${reverted ? "border-white/8 bg-white/[0.03] opacity-70" : "border-white/10 bg-black/25"}`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {batch.fileName || batch.presetLabel || "Import"}
                      </p>
                      <p className="mt-1 text-xs text-white/45">
                        {new Date(batch.createdAt).toLocaleString("de-DE")} · {batch.presetLabel || "Preset offen"} · {batch.accountLabel || "Konto offen"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-emerald-300/15 bg-emerald-400/[0.07] px-3 py-1 text-emerald-100/80">
                        {batch.importedCount} Trades
                      </span>
                      {batch.duplicateCount ? (
                        <span className="rounded-full border border-orange-300/15 bg-orange-400/[0.06] px-3 py-1 text-orange-100/80">
                          {batch.duplicateCount} Dubletten
                        </span>
                      ) : null}
                      <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-white/55">
                        {batch.trustScore ?? "—"}% · {batch.trustLabel || "Vertrauen offen"}
                      </span>
                      {reverted ? (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/45">
                          rückgängig
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRevertImport(batch)}
                          disabled={isHistoryPending}
                          className="rounded-full border border-red-300/20 bg-red-400/[0.07] px-3 py-1 text-red-100/85 transition hover:border-red-200/40 disabled:cursor-not-allowed disabled:text-white/35"
                        >
                          Import rückgängig
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/50">
            Noch kein Import-Verlauf.
          </div>
        )}
      </div>

      <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
              1. Preset
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">Preset</h3>
          </div>
          <div className="rounded-2xl border border-orange-300/20 bg-orange-400/10 px-4 py-3 text-sm text-orange-100">
            {presetMeta.label} · {presetMeta.badge} · {importAccountLabel}
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-3">
          {csvImportPresets.map((preset) => {
            const active = preset.key === selectedPreset;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => handlePresetChange(preset.key)}
                className={`rounded-[24px] border p-4 text-left transition ${active ? "border-orange-300/35 bg-orange-400/10" : "border-white/10 bg-black/25 hover:border-orange-300/20 hover:bg-orange-400/[0.05]"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-semibold text-white">
                    {preset.label}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] ${active ? "border-orange-300/30 bg-orange-400/15 text-orange-100" : "border-white/10 bg-black/30 text-white/45"}`}
                  >
                    {preset.badge}
                  </span>
                </div>
                <p className="mt-2 text-sm text-white/50">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <label className="flex min-h-[190px] cursor-pointer flex-col justify-between rounded-[28px] border border-dashed border-orange-300/25 bg-black/25 p-5 transition hover:border-orange-300/45 hover:bg-orange-400/[0.05]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
              2. Datei
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-white">
              CSV oder Excel wählen
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-6 text-sm text-white/70">
            <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-4 py-2 text-orange-100">
              CSV oder Excel wählen
            </span>
            <span className="text-white/45">Zielkonto: {importAccountLabel}</span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="sr-only"
            onChange={(event) =>
              void handleFileChange(event.target.files?.[0] ?? null)
            }
          />
        </label>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricTile
              label="Datei"
              value={fileName || "Noch keine Datei"}
              tone={fileName ? "text-white" : "text-white/45"}
            />
            <MetricTile
              label="Zeilen"
              value={String(counts.total)}
              tone={counts.total ? "text-white" : "text-white/45"}
            />
            <MetricTile
              label="Importierbar"
              value={String(counts.importable)}
              tone="text-emerald-200"
            />
            <MetricTile
              label="Prüfen"
              value={String(counts.check + counts.skip)}
              tone={repairRows.length ? "text-orange-100" : "text-white/45"}
            />
          </div>
          {headers.length ? (
            <div className={`rounded-2xl border px-4 py-3 ${readiness.tone}`}>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
                Feldcheck
              </p>
              <p className="mt-2 text-sm font-semibold text-white">
                {readiness.title}
              </p>
              <p className="mt-1 text-sm text-white/55">
                {readiness.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {readiness.chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/55"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <details className="group rounded-2xl border border-white/8 bg-black/20 p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-2 py-1 text-sm text-white/65 transition hover:text-white">
              <span>Importdetails</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/45">
                <span className="group-open:hidden">Anzeigen</span>
                <span className="hidden group-open:inline">Ausblenden</span>
              </span>
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label="Preset"
                value={presetMeta.label}
                tone="text-white"
              />
              <MetricTile
                label="Zielkonto"
                value={importAccountLabel}
                tone="text-orange-100"
              />
              <MetricTile
                label="Vertrauen"
                value={trustSummary.label}
                tone={trustSummary.tone}
              />
              <MetricTile
                label="Spalten"
                value={headers.length ? String(headers.length) : "0"}
                tone="text-white"
              />
              <MetricTile
                label="Prüfen / Skip"
                value={`${counts.check} / ${counts.skip}`}
                tone="text-orange-100"
              />
              <MetricTile
                label="Manuell"
                value={String(counts.manual)}
                tone={counts.manual ? "text-orange-100" : "text-white/45"}
              />
              <MetricTile
                label="Preset"
                value={String(counts.preset)}
                tone={counts.preset ? "text-sky-200" : "text-white/45"}
              />
            </div>
          </details>
        </div>
      </div>

      {statusMessage ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/75">
          {statusMessage}
        </div>
      ) : null}

      {headers.length ? (
        <div className={`rounded-[28px] border p-5 ${trustSummary.cardTone}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
                Import-Vertrauen
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                {trustSummary.label}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
                {trustSummary.description}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/75">
              {trustSummary.score}% · {trustSummary.importableRows} von {trustSummary.totalRows} Zeilen
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {trustSummary.chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/58"
              >
                {chip}
              </span>
            ))}
          </div>
          {trustSummary.warnings.length ? (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {trustSummary.warnings.map((warning) => (
                <div
                  key={warning}
                  className="rounded-2xl border border-orange-300/16 bg-orange-400/[0.06] px-4 py-3 text-sm text-orange-50/85"
                >
                  {warning}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {lastImportReport ? (
        <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
                Importbericht
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Importbericht
              </h3>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/70">
              {lastImportReport.importedPresetLabel}
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile
              label="Importiert"
              value={String(lastImportReport.importedCount)}
              tone="text-emerald-200"
            />
            <MetricTile
              label="Dubletten"
              value={String(lastImportReport.duplicateCount)}
              tone={
                lastImportReport.duplicateCount
                  ? "text-orange-100"
                  : "text-white/45"
              }
            />
            <MetricTile
              label="Ausgelassen"
              value={String(lastImportReport.skippedCount)}
              tone={
                lastImportReport.skippedCount
                  ? "text-orange-100"
                  : "text-white/45"
              }
            />
            <MetricTile
              label="Problemzeilen offen"
              value={String(lastImportReport.repairCount)}
              tone={
                lastImportReport.repairCount
                  ? "text-orange-100"
                  : "text-white/45"
              }
            />
          </div>
        </div>
      ) : null}

      {headers.length ? (
        <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
                3. Zuordnung
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Zuordnung
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowOptionalMappings((current) => !current)}
                className={`rounded-full border px-4 py-2 text-sm transition ${showOptionalMappings ? "border-orange-300/35 bg-orange-400/10 text-orange-100" : "border-white/10 bg-black/25 text-white/70 hover:border-white/20 hover:text-white"}`}
              >
                {showOptionalMappings ? "Weniger" : "Mehr"}
              </button>
              <label className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/75">
                <input
                  type="checkbox"
                  checked={includeCheckRows}
                  onChange={(event) =>
                    setIncludeCheckRows(event.target.checked)
                  }
                  className="h-4 w-4 accent-orange-300"
                />
                Prüfzeilen mitnehmen
              </label>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-3">
            {csvImportFieldDefinitions
              .filter(
                (field) =>
                  requiredFieldKeys.includes(field.key) ||
                  coreOptionalFieldKeys.includes(field.key) ||
                  (showOptionalMappings &&
                    visibleOptionalFieldKeys.includes(field.key) &&
                    !coreOptionalFieldKeys.includes(field.key)),
              )
              .map((field) => (
                <label
                  key={field.key}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-white">
                      {field.label}
                    </span>
                    {field.required ? (
                      <span className="rounded-full border border-orange-300/20 bg-orange-400/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-orange-100">
                        Pflicht
                      </span>
                    ) : null}
                  </div>
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(event) =>
                      handleMappingChange(field.key, event.target.value)
                    }
                    className="mt-3 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none"
                  >
                    <option value="" className="bg-black text-white">
                      Nicht zuordnen
                    </option>
                    {headers.map((header) => (
                      <option
                        key={`${field.key}-${header}`}
                        value={header}
                        className="bg-black text-white"
                      >
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
          </div>
        </div>
      ) : null}

      {previewRows.length ? (
        <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
                4. Vorschau
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">Import</h3>
            </div>
            <button
              type="button"
              onClick={handleImport}
              disabled={isImporting || !drafts.length}
              className={`rounded-full px-5 py-3 text-sm font-medium transition ${isImporting || !drafts.length ? "cursor-not-allowed border border-white/10 bg-black/20 text-white/35" : "border border-orange-300/35 bg-orange-400/15 text-white hover:border-orange-300/55 hover:bg-orange-400/20"}`}
            >
              {isImporting
                ? "Import läuft …"
                : `${drafts.length} Trades importieren`}
            </button>
          </div>

          <div className="mt-5 overflow-x-auto rounded-3xl border border-white/10 bg-black/30">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm text-white/75">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.2em] text-white/35">
                <tr>
                  <th className="px-4 py-3">Zeile</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Datum</th>
                  <th className="px-4 py-3">Markt</th>
                  <th className="px-4 py-3">Kontext</th>
                  <th className="px-4 py-3">Vertrauen</th>
                  <th className="px-4 py-3">Quellen</th>
                  <th className="px-4 py-3">Hinweis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {previewSlice.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="px-4 py-3 text-white/45">{row.rowNumber}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      {row.normalized.date
                        ? new Date(row.normalized.date).toLocaleDateString(
                            "de-DE",
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {row.normalized.market ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-white/65">
                      {row.normalized.netPnL
                        ? `P&L ${row.normalized.netPnL}`
                        : row.normalized.entry && row.normalized.exit
                          ? `Entry ${row.normalized.entry} → Exit ${row.normalized.exit}`
                          : row.normalized.entry
                            ? `Entry ${row.normalized.entry}`
                            : "Basisdaten"}
                      {row.normalized.leverage ? (
                        <span className="ml-2 text-white/35">
                          · {row.normalized.leverage}x
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-white/65">
                      {row.trustScore}% · {row.trustLabel}
                    </td>
                    <td className="px-4 py-3">
                      <SourceSummaryChips row={row} compact />
                    </td>
                    <td className="px-4 py-3 text-white/55">
                      {row.issues[0] ?? row.warnings[0] ?? "Sieht gut aus."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {repairRows.length ? (
        <div className="rounded-[28px] border border-orange-300/15 bg-orange-400/[0.04] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
                5. Problemzeilen
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Problemzeilen
              </h3>
            </div>
            <div className="rounded-2xl border border-orange-300/20 bg-orange-400/10 px-4 py-3 text-sm text-orange-100">
              Offen: {repairRows.length}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {repairRows.slice(0, 8).map((row) => (
              <div
                key={`repair-${row.rowNumber}`}
                className="rounded-[24px] border border-white/10 bg-black/25 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold text-white">
                        Zeile {row.rowNumber}
                      </span>
                      <StatusPill status={row.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.issues.map((issue) => (
                        <span
                          key={`${row.rowNumber}-${issue}`}
                          className="rounded-full border border-orange-300/20 bg-orange-400/10 px-3 py-1 text-xs text-orange-100"
                        >
                          {issue}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3">
                      <SourceSummaryChips row={row} />
                    </div>
                    {row.warnings.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {row.warnings.map((warning) => (
                          <span
                            key={`${row.rowNumber}-${warning}`}
                            className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/58"
                          >
                            {warning}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleResetRow(row.rowNumber)}
                    className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/55 transition hover:border-white/20 hover:text-white"
                  >
                    Reset
                  </button>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-3">
                  {repairFieldKeys.map((fieldKey) => {
                    const field = csvImportFieldDefinitions.find(
                      (entry) => entry.key === fieldKey,
                    );
                    if (!field) return null;
                    const value = getRepairFieldValue(row, fieldKey);
                    return (
                      <RepairField
                        key={`${row.rowNumber}-${fieldKey}`}
                        label={field.label}
                        helper={field.helper}
                        value={value}
                        onChange={(nextValue) =>
                          handleRepairChange(row.rowNumber, fieldKey, nextValue)
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}


function buildImportTrustSummary(
  rows: Array<{
    status: CsvImportPreviewStatus;
    trustScore: number;
    warnings: string[];
  }>,
) {
  const totalRows = rows.length;
  const importableRows = rows.filter((row) => row.status === "importable").length;
  const checkRows = rows.filter((row) => row.status === "check").length;
  const skipRows = rows.filter((row) => row.status === "skip").length;
  const warningCounts = new Map<string, number>();
  for (const row of rows) {
    for (const warning of row.warnings) {
      warningCounts.set(warning, (warningCounts.get(warning) ?? 0) + 1);
    }
  }
  const score = totalRows
    ? Math.round(rows.reduce((sum, row) => sum + row.trustScore, 0) / totalRows)
    : 0;
  const label = score >= 88 ? "Hohes Vertrauen" : score >= 70 ? "Solide prüfen" : score >= 50 ? "Nur mit Prüfung" : "Niedriges Vertrauen";
  const tone = score >= 88 ? "text-emerald-100" : score >= 70 ? "text-white" : score >= 50 ? "text-orange-100" : "text-red-100";
  const cardTone = score >= 88
    ? "border-emerald-300/18 bg-emerald-400/[0.05]"
    : score >= 70
      ? "border-white/10 bg-black/20"
      : "border-orange-300/18 bg-orange-400/[0.05]";
  const warnings = Array.from(warningCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([warning, count]) => (count > 1 ? `${warning} (${count}x)` : warning));
  const description = totalRows
    ? score >= 88
      ? "Die Datei ist sauber lesbar. Trotzdem Vorschau kurz prüfen, bevor sie ins Journal geht."
      : score >= 70
        ? "Die Basis passt. Einzelne Felder bleiben bewusst markiert, damit nichts still falsch gespeichert wird."
        : "Der Import braucht Aufmerksamkeit. Problemzeilen prüfen und fehlende Werte nur ergänzen, wenn sie sicher sind."
    : "Datei wählen. Danach zeigt Equora, wo die Werte herkommen und was offen bleibt.";

  return {
    score,
    label,
    tone,
    cardTone,
    description,
    totalRows,
    importableRows,
    chips: [
      `Importierbar: ${importableRows}`,
      `Prüfen: ${checkRows}`,
      `Skip: ${skipRows}`,
      `Warnungen: ${Array.from(warningCounts.values()).reduce((sum, count) => sum + count, 0)}`,
    ],
    warnings,
  };
}

function buildImportReadiness(
  headers: string[],
  mapping: CsvImportMapping,
  totalRows: number,
  importableRows: number,
  checkRows: number,
  skipRows: number,
) {
  const mappedRequired = requiredFieldKeys.filter((key) =>
    Boolean(mapping[key]),
  ).length;
  const mappedCore = coreOptionalFieldKeys.filter((key) =>
    Boolean(mapping[key]),
  ).length;
  const mappedOptional = visibleOptionalFieldKeys.filter((key) =>
    Boolean(mapping[key]),
  ).length;
  const rowRate = totalRows
    ? Math.round((importableRows / totalRows) * 100)
    : 0;
  const chips = [
    `Spalten: ${headers.length}`,
    `Pflicht: ${mappedRequired}/${requiredFieldKeys.length}`,
    `Kernfelder: ${mappedCore}/${coreOptionalFieldKeys.length}`,
    `Optional: ${mappedOptional}`,
  ];

  if (!headers.length) {
    return {
      title: "Noch keine Datei",
      description: "CSV oder Excel wählen. Danach zeigt Equora, was direkt lesbar ist.",
      chips,
      tone: "border-white/10 bg-black/20",
    };
  }

  if (mappedRequired < requiredFieldKeys.length) {
    return {
      title: "Pflichtfeld fehlt",
      description: "Datum und Markt müssen sitzen. Erst dann importieren.",
      chips,
      tone: "border-orange-300/20 bg-orange-400/[0.06]",
    };
  }

  if (skipRows > 0) {
    return {
      title: "Einige Zeilen fallen raus",
      description:
        "Die Repair Queue zeigt, was fehlt. Lieber prüfen als falsch speichern.",
      chips: [...chips, `Skip: ${skipRows}`],
      tone: "border-orange-300/20 bg-orange-400/[0.06]",
    };
  }

  if (checkRows > 0) {
    return {
      title: "Import möglich, aber prüfen",
      description: "Basis passt. Einige Zeilen brauchen P&L oder Preiskontext.",
      chips: [...chips, `Treffer: ${rowRate}%`],
      tone: "border-orange-300/20 bg-orange-400/[0.06]",
    };
  }

  return {
    title: "Import wirkt sauber",
    description:
      "Pflichtfelder und Kernwerte sind erkannt. Vorschau kurz lesen, dann importieren.",
    chips: [...chips, `Treffer: ${rowRate}%`],
    tone: "border-emerald-300/20 bg-emerald-400/[0.06]",
  };
}

function getRepairFieldValue(
  row: {
    normalized: {
      date: string | null;
      market: string | null;
      netPnL: string | null;
      entry: string | null;
      exit: string | null;
      direction: string | null;
      fees: string | null;
      positionSize: string | null;
      leverage: string | null;
    };
  },
  fieldKey: CsvImportFieldKey,
) {
  switch (fieldKey) {
    case "date":
      return row.normalized.date ? row.normalized.date.slice(0, 16) : "";
    case "market":
      return row.normalized.market ?? "";
    case "netPnL":
      return row.normalized.netPnL ?? "";
    case "entry":
      return row.normalized.entry ?? "";
    case "exit":
      return row.normalized.exit ?? "";
    case "direction":
      return row.normalized.direction ?? "";
    case "fees":
      return row.normalized.fees ?? "";
    case "positionSize":
      return row.normalized.positionSize ?? "";
    case "leverage":
      return row.normalized.leverage ?? "";
    default:
      return "";
  }
}

function hasSource(
  sources: Record<CsvImportFieldKey, CsvImportValueSource>,
  source: CsvImportValueSource,
) {
  return Object.values(sources).includes(source);
}

function SourceSummaryChips({
  row,
  compact = false,
}: {
  row: {
    sources: Record<CsvImportFieldKey, CsvImportValueSource>;
  };
  compact?: boolean;
}) {
  const groups = [
    buildSourceGroup(
      row.sources,
      "csv",
      "Direkt",
      "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
      compact,
    ),
    buildSourceGroup(
      row.sources,
      "preset",
      "Preset",
      "border-sky-300/20 bg-sky-400/10 text-sky-100",
      compact,
    ),
    buildSourceGroup(
      row.sources,
      "manual",
      "Manuell",
      "border-orange-300/20 bg-orange-400/10 text-orange-100",
      compact,
    ),
  ].filter(Boolean) as Array<{
    label: string;
    detail: string;
    className: string;
  }>;

  if (!groups.length) {
    return (
      <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/45">
        Noch keine Feldquelle
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((group) => (
        <span
          key={`${group.label}-${group.detail}`}
          className={`rounded-full border px-3 py-1 text-xs ${group.className}`}
        >
          {group.label}: {group.detail}
        </span>
      ))}
    </div>
  );
}

function buildSourceGroup(
  sources: Record<CsvImportFieldKey, CsvImportValueSource>,
  source: CsvImportValueSource,
  label: string,
  className: string,
  compact: boolean,
) {
  const fields = summarizeSourceFields(sources, source, compact);
  if (!fields.length) return null;
  return { label, detail: fields.join(" · "), className };
}

function summarizeSourceFields(
  sources: Record<CsvImportFieldKey, CsvImportValueSource>,
  source: CsvImportValueSource,
  compact: boolean,
) {
  const preferredFields: Array<{ key: CsvImportFieldKey; label: string }> = [
    { key: "date", label: "Datum" },
    { key: "market", label: "Markt" },
    { key: "netPnL", label: "P&L" },
    { key: "entry", label: "Entry" },
    { key: "exit", label: "Exit" },
    { key: "fees", label: "Fees" },
    { key: "positionSize", label: "Size" },
    { key: "leverage", label: "Hebel" },
    { key: "setup", label: "Setup" },
    { key: "instrumentType", label: "Typ" },
  ];

  return preferredFields
    .filter((field) => sources[field.key] === source)
    .slice(0, compact ? 2 : 4)
    .map((field) => field.label);
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
        {label}
      </p>
      <p className={`mt-2 text-sm font-medium ${tone}`}>{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: CsvImportPreviewStatus }) {
  const copy =
    status === "importable"
      ? "Importierbar"
      : status === "check"
        ? "Prüfen"
        : "Skip";
  const tone =
    status === "importable"
      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
      : status === "check"
        ? "border-orange-300/25 bg-orange-400/10 text-orange-100"
        : "border-white/10 bg-black/20 text-white/45";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${tone}`}
    >
      {copy}
    </span>
  );
}

function RepairField({
  label,
  helper,
  value,
  onChange,
}: {
  label: string;
  helper: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <span className="text-sm font-medium text-white">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none"
      />
    </label>
  );
}

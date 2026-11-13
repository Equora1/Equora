"use client";

import { useJournalLocale } from "@/components/layout/journal-locale-provider";
import { journalNumberLocale, journalText, type JournalLocale } from "@/lib/i18n/journal";
import { getBrokerFileImportCopy } from "@/lib/i18n/broker-file";
import { importDiagnostic, importFieldLabel, importPresetCopy } from "@/lib/i18n/import-preview";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getTradeImportAccounts,
  getTradeImportBatches,
  importTradeCsvEntries,
  revertTradeImportBatch,
  type TradeImportAccountSummary,
  type TradeImportBatchSummary,
} from "@/app/actions/trade-import";
import { getAccountTemplateLabel } from "@/lib/utils/trade-presets";
import { SUPPORTED_TRADE_CURRENCIES } from "@/lib/utils/currency";
import { brokerFileImportCapability } from "@/lib/utils/broker-file-import-capability";
import {
  detectBrokerImportProfile,
  getBrokerImportRuntimeDefaults, isCsvImportPresetKey,
  type BrokerImportDetection,
} from "@/lib/utils/broker-import-kit";
import {
  buildCsvImportDrafts,
  buildCsvImportPreview, isExplicitCsvImportAccountLabel,
  CSV_IMPORT_LIMITS,
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
import { parseMetaTrader4ReportHtml } from "@/lib/utils/metatrader4-report-import";
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
  if (getCsvImportPresetMeta(preset).sourceIdentity) return "";
  const accountTemplate = getBrokerImportRuntimeDefaults(preset).accountTemplate;
  if (accountTemplate === "crypto-spot") return getAccountTemplateLabel("crypto-spot");
  if (accountTemplate === "crypto-perps") return getAccountTemplateLabel("crypto-perps");
  return "Hauptkonto";
}

type ImportReport = {
  importedCount: number;
  duplicateCount: number;
  skippedCount: number;
  invalidCount: number;
  sourceRowCount: number;
  repairCount: number;
  importedPresetLabel: string;
  batchId?: string | null;
};

const spreadsheetExtensions = new Set(["xlsx", "xls"]);
const allowedImportExtensions = new Set(["csv", "tsv", "txt", "xlsx", "xls", "html", "htm"]);
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

function parseUtcOffsetMinutes(value: string) {
  const match = value.trim().match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 14 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  if (total > 14 * 60) return null;
  return match[1] === "-" ? -total : total;
}

function detectUtcOffset(headers: string[]) {
  for (const header of headers) {
    const match = header.match(/UTC\s*([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (!match) continue;
    const hours = match[2].padStart(2, "0");
    const minutes = (match[3] ?? "00").padStart(2, "0");
    const normalized = `${match[1]}${hours}:${minutes}`;
    if (parseUtcOffsetMinutes(normalized) !== null) return normalized;
  }
  return "";
}

function normalizeSpreadsheetCell(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) {
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
  }
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

async function parseSpreadsheetFile(file: File, locale: JournalLocale): Promise<ParsedCsvData> {
  const text = journalText(locale);
  const extension = getFileExtension(file.name);
  if (extension === "xls") {
    throw new Error(
      text("Alte .xls-Dateien bitte in Excel als .xlsx oder .csv speichern und erneut wählen.", "Save this .xls file as .xlsx or .csv and select it again."),
    );
  }

  const { readSheet } = await import("read-excel-file/browser");
  const table: string[][] = (await readSheet(file))
    .map((row) => row.map(normalizeSpreadsheetCell))
    .filter((row) => row.some(Boolean));

  if (!table.length) {
    return { delimiter: "excel", headers: [], rows: [] };
  }
  if (
    table.length - 1 > CSV_IMPORT_LIMITS.maxRows ||
    table.some(
      (row) =>
        row.length > CSV_IMPORT_LIMITS.maxColumns ||
        row.some((cell) => cell.length > CSV_IMPORT_LIMITS.maxCellCharacters),
    )
  ) {
    throw new Error(
      text(`Excel-Datei überschreitet das sichere Limit von ${CSV_IMPORT_LIMITS.maxRows} Zeilen, ${CSV_IMPORT_LIMITS.maxColumns} Spalten oder ${CSV_IMPORT_LIMITS.maxCellCharacters} Zeichen je Zelle.`, `The spreadsheet exceeds a limit: ${CSV_IMPORT_LIMITS.maxRows} rows, ${CSV_IMPORT_LIMITS.maxColumns} columns or ${CSV_IMPORT_LIMITS.maxCellCharacters} characters per cell.`),
    );
  }

  const headerRowIndex = findSpreadsheetHeaderRow(table);
  const headers = makeUniqueHeaders(table[headerRowIndex] ?? []);
  const dataRows = table.slice(headerRowIndex + 1);
  const overwideRowIndex = dataRows.findIndex(
    (row) => row.length > headers.length,
  );
  if (overwideRowIndex >= 0) {
    throw new Error(
      text(`Excel-Zeile ${headerRowIndex + overwideRowIndex + 2} enthält mehr Zellen als die Kopfzeile und wurde nicht still abgeschnitten.`, `Spreadsheet row ${headerRowIndex + overwideRowIndex + 2} has more cells than the header row.`),
    );
  }
  const rows = dataRows.map((row) =>
    headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = row[index] ?? "";
      return acc;
    }, {}),
  );

  return { delimiter: "excel", headers, rows };
}

const htmlReportExtensions = new Set(["html", "htm"]);
type ParsedImportFile = ParsedCsvData & Readonly<{ notice?: string }>;

async function parseImportFile(file: File, locale: JournalLocale): Promise<ParsedImportFile> {
  const text = journalText(locale);
  const extension = getFileExtension(file.name);
  if (!allowedImportExtensions.has(extension)) {
    throw new Error(
      text("Nur CSV, TSV, TXT, XLSX oder offizielle MT4-HTML-Berichte werden unterstützt.", "Choose a CSV, TSV, TXT or XLSX file, or an official MT4 HTML report."),
    );
  }
  if (file.size > CSV_IMPORT_LIMITS.maxFileBytes) {
    throw new Error(text("Datei ist zu groß. Erlaubt sind höchstens 5 MB.", "The file exceeds the 5 MB limit."));
  }

  if (spreadsheetExtensions.has(extension)) {
    return parseSpreadsheetFile(file, locale);
  }

  if (htmlReportExtensions.has(extension)) {
    const { summary, ...parsed } = parseMetaTrader4ReportHtml(await file.text());
    return {
      ...parsed,
      notice: text(`${summary.closedTradeCount} geschlossene MT4-Trades erkannt; ${summary.excludedRowCount} nicht als geschlossene Trades übernommene Berichtszeilen transparent ausgeschlossen. Netto-P&L vollständig abgeleitet: ${summary.derivedNetPnlCount}; manuell zu prüfen: ${summary.incompleteNetPnlCount}.`, `Closed MT4 trades found: ${summary.closedTradeCount}. Other rows skipped: ${summary.excludedRowCount}. Net P&L calculated: ${summary.derivedNetPnlCount}. P&L to review: ${summary.incompleteNetPnlCount}.`),
    };
  }

  return parseCsvText(await file.text());
}

function getSourceAccountExample(preset: CsvImportPresetKey) {
  return preset === "metatrader4-history"
    ? "IC Markets MT4 1234"
    : "IC Markets cTrader 1234";
}

function BrokerImportDetectionNotice({
  detection,
  selectedPreset,
}: {
  detection: BrokerImportDetection;
  selectedPreset: CsvImportPresetKey;
}) {
  const locale = useJournalLocale();
  const text = journalText(locale);
  const detectedLabel = importPresetCopy(getCsvImportPresetMeta(detection.presetKey), locale).label;
  const selectedLabel = importPresetCopy(getCsvImportPresetMeta(selectedPreset), locale).label;

  if (detection.confidence === "high") {
    if (detection.presetKey !== selectedPreset) {
      return (
        <>
          {text('Dateisignatur und gewähltes Preset widersprechen sich. Erkannt wurde ', 'The file does not match the selected preset. Detected: ')}
          <span className="font-medium text-orange-100">{detectedLabel}</span>{text(', aktiv bleibt ', '. Still selected: ')}
          <span className="font-medium text-white">{selectedLabel}</span>{text('. Bitte Auswahl und Zuordnung vor der Vorschau prüfen.', '. Check the preset and column mapping before previewing.')}
        </>
      );
    }

    return (
      <>
        {text('Dateisignatur erkannt:', 'File format detected:')} <span className="font-medium text-orange-100">{detectedLabel}</span>{" "}
        · {detection.score}/100 · {detection.matchedSignals.map((signal) => signal === "Dateiname" ? text("Dateiname", "File name") : signal).join(", ")}
      </>
    );
  }

  if (detection.confidence === "low") {
    return (
      <>
        {text('Möglicher Treffer:', 'Possible match:')} <span className="font-medium text-white">{detectedLabel}</span>{text(`. Wegen uneindeutiger Signatur bleibt ${selectedLabel} ausgewählt.`, `. The match is uncertain, so ${selectedLabel} remains selected.`)}
      </>
    );
  }

  return (
    <>
      {text(`Keine eindeutige Broker-Signatur erkannt. Aktiv bleibt ${selectedLabel}; bitte die Zuordnung manuell prüfen.`, `The file format could not be identified. ${selectedLabel} remains selected. Check the column mapping.`)}
    </>
  );
}

export function TradeImportPanel() {
  const locale = useJournalLocale();
  const text = journalText(locale);
  const importCopy = getBrokerFileImportCopy(locale);
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPreset = searchParams.get("preset");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPreset, setSelectedPreset] =
    useState<CsvImportPresetKey>(() =>
      isCsvImportPresetKey(requestedPreset) ? requestedPreset : "generic",
    );
  const [accountCurrency, setAccountCurrency] = useState("");
  const [importAccountLabel, setImportAccountLabel] = useState(() =>
    getPresetAccountLabel(
      isCsvImportPresetKey(requestedPreset) ? requestedPreset : "generic",
    ),
  );
  const [statementUtcOffset, setStatementUtcOffset] = useState("");
  const [selectedImportAccountId, setSelectedImportAccountId] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<CsvImportMapping>({});
  const [profileDetection, setProfileDetection] =
    useState<BrokerImportDetection | null>(null);
  const [repairOverrides, setRepairOverrides] =
    useState<CsvImportRepairOverrides>({});
  const [statusMessage, setStatusMessage] = useState("");
  const [lastImportReport, setLastImportReport] = useState<ImportReport | null>(
    null,
  );
  const [includeCheckRows, setIncludeCheckRows] = useState(false);
  const [showOptionalMappings, setShowOptionalMappings] = useState(false);
  const [isImporting, startImporting] = useTransition();
  const [isHistoryPending, startHistoryTransition] = useTransition();
  const [importBatches, setImportBatches] = useState<TradeImportBatchSummary[]>([]);
  const [importAccounts, setImportAccounts] = useState<
    TradeImportAccountSummary[]
  >([]);
  const [historyMessage, setHistoryMessage] = useState("");

  const presetMeta = useMemo(
    () => getCsvImportPresetMeta(selectedPreset),
    [selectedPreset],
  );
  const presetCopy = importPresetCopy(presetMeta, locale);
  const displayAccountLabel =
    importAccountLabel.trim() || text("Zielkonto noch nicht benannt", "Destination account unnamed");
  const availableImportAccounts = useMemo(
    () =>
      importAccounts.filter(
        (account) => account.presetKey === selectedPreset,
      ),
    [importAccounts, selectedPreset],
  );
  const previewRows = useMemo(
    () =>
      buildCsvImportPreview(
        rawRows,
        mapping,
        selectedPreset,
        repairOverrides,
        parseUtcOffsetMinutes(statementUtcOffset),
      ),
    [
      mapping,
      rawRows,
      repairOverrides,
      selectedPreset,
      statementUtcOffset,
    ],
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

  const trustSummary = useMemo(() => buildImportTrustSummary(previewRows, locale), [previewRows, locale]);

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
        locale,
      ),
    [
      counts.check,
      counts.importable,
      counts.skip,
      counts.total,
      headers,
      mapping,
      locale,
    ],
  );


  function loadImportState() {
    startHistoryTransition(async () => {
      const [batchResult, accountResult] = await Promise.all([
        getTradeImportBatches(),
        getTradeImportAccounts(),
      ]);
      setImportBatches(batchResult.batches ?? []);
      setImportAccounts(accountResult.accounts ?? []);
      if (!batchResult.success) setHistoryMessage(batchResult.message);
      else if (!accountResult.success) setHistoryMessage(accountResult.message);
    });
  }

  useEffect(() => {
    loadImportState();
  }, []);

  function handleRevertImport(batch: TradeImportBatchSummary) {
    if (batch.status === "reverted") return;
    const name = batch.fileName || batch.presetLabel || text('ohne Namen', 'untitled');
    const confirmed = window.confirm(text(
      `Import „${name}“ wirklich rückgängig machen? Alle Trades aus diesem Upload werden gelöscht.`,
      `Undo import “${name}”? This deletes all trades from this upload.`,
    ));
    if (!confirmed) return;

    startHistoryTransition(async () => {
      const result = await revertTradeImportBatch(batch.id);
      setHistoryMessage(result.message);
      loadImportState();
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
      setProfileDetection(null);
      setStatementUtcOffset("");
      return;
    }

    try {
      const parsed = await parseImportFile(file, locale);
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      const detection = detectBrokerImportProfile(parsed.headers, file.name);
      const nextPreset =
        selectedPreset === "generic" && detection.confidence === "high"
          ? detection.presetKey
          : selectedPreset;
      setProfileDetection(detection);
      setStatementUtcOffset(detectUtcOffset(parsed.headers));
      if (nextPreset !== selectedPreset) {
        setSelectedPreset(nextPreset);
        setSelectedImportAccountId("");
        setImportAccountLabel(getPresetAccountLabel(nextPreset));
      }
      setMapping(inferCsvImportMapping(parsed.headers, nextPreset));

      if (!parsed.headers.length || !parsed.rows.length) {
        setStatusMessage(
          text("Datei gelesen, aber ohne brauchbare Kopfzeile oder Datenzeilen.", "The file has no usable header or data rows."),
        );
      } else if (parsed.notice) {
        setStatusMessage(parsed.notice);
      }
    } catch (error) {
      setFileName(file.name);
      setHeaders([]);
      setRawRows([]);
      setMapping({});
      setProfileDetection(null);
      setStatusMessage(
        error instanceof Error
          ? importDiagnostic(error.message, locale)
          : text('Datei konnte nicht gelesen werden.', 'The file could not be read.'),
      );
    }
  }

  function handlePresetChange(nextPreset: CsvImportPresetKey) {
    setSelectedPreset(nextPreset);
    setSelectedImportAccountId("");
    setAccountCurrency("");
    setImportAccountLabel(getPresetAccountLabel(nextPreset));
    setStatementUtcOffset(detectUtcOffset(headers));
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
    if (!brokerFileImportCapability.persistenceEnabled) {
      setStatusMessage(importCopy.reason);
      return;
    }
    if (!drafts.length) {
      setStatusMessage(text("Noch keine importierbaren Zeilen ausgewählt.", "Select rows ready to import."));
      return;
    }
    if (!accountCurrency) {
      setStatusMessage(text("Vor dem Import eine Kontowährung auswählen. Sie wird nicht aus dem Preset geraten.", "Select the account currency before importing."));
      return;
    }
    const normalizedAccountLabel = importAccountLabel.trim();
    if (
      normalizedAccountLabel.length < 3 ||
      normalizedAccountLabel.length > 60
    ) {
      setStatusMessage(
        text("Vor dem Import ein Zielkonto mit 3 bis 60 Zeichen benennen.", "Enter a destination account name of 3 to 60 characters."),
      );
      return;
    }
    if (
      presetMeta.sourceIdentity &&
      !isExplicitCsvImportAccountLabel(normalizedAccountLabel)
    ) {
      setStatusMessage(
        text(`Für dieses Preset das Zielkonto eindeutig benennen, zum Beispiel ${getSourceAccountExample(selectedPreset)}. „Hauptkonto“ reicht nicht.`, `Use a distinct account name, for example ${getSourceAccountExample(selectedPreset)}.`),
      );
      return;
    }

    startImporting(async () => {
      const selectedRowNumbers = new Set(drafts.map((draft) => draft.rowNumber));
      const result = await importTradeCsvEntries({
        rows: drafts,
        sourceRows: previewRows.map((row) => ({
          rowNumber: row.rowNumber,
          previewStatus: row.status,
          selected: selectedRowNumbers.has(row.rowNumber),
        })),
        batchId: crypto.randomUUID(),
        fileName,
        presetLabel: presetMeta.label,
        accountLabel: normalizedAccountLabel,
        accountId: selectedImportAccountId || null,
        accountCurrency,
      });
      setStatusMessage(result.message);
      if (!result.success) {
        setLastImportReport(null);
        return;
      }
      setLastImportReport({
        importedCount: result.importedCount ?? 0,
        duplicateCount: result.duplicateCount ?? 0,
        skippedCount: result.skippedCount ?? 0,
        invalidCount: result.invalidCount ?? 0,
        sourceRowCount: result.sourceRowCount ?? 0,
        repairCount: repairRows.length,
        importedPresetLabel: presetMeta.label,
        batchId: result.batchId ?? null,
      });

      loadImportState();

      const params = new URLSearchParams();
      if (result.importedIds?.length) {
        params.set("reviewTradeIds", result.importedIds.join("|"));
        params.set("tradeId", result.importedIds[0]);
      }
      params.set("reviewTitle", `${presetMeta.label} Import`);
      params.set("reviewDescription", result.message);
      const chips = [
        `Neu: ${result.importedCount ?? 0}`,
        presetMeta.label,
      ];
      if (result.duplicateCount)
        chips.push(`Dubletten: ${result.duplicateCount}`);
      if (result.skippedCount)
        chips.push(`Ausgelassen: ${result.skippedCount}`);
      if (result.invalidCount)
        chips.push(`Prüfpflichtig: ${result.invalidCount}`);
      if (repairRows.length) chips.push(`Problemzeilen: ${repairRows.length}`);
      params.set("reviewChips", chips.join("|"));
      router.push(`/trades?${params.toString()}`);
      router.refresh();
    });
  }

  return (
    <div lang={locale} className="space-y-5">
      {!brokerFileImportCapability.persistenceEnabled ? (
        <p className="rounded-2xl border border-orange-300/20 bg-orange-400/5 px-4 py-3 text-sm text-orange-100">{importCopy.reason}</p>
      ) : null}
      <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/60">
              {text("Import-Verlauf", "Import history")}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              {text("Letzte Uploads", "Recent uploads")}
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/55">
              {text("Hier kannst du einen kompletten CSV- oder Excel-Import wieder entfernen, falls Datei, Zeitraum oder Konto falsch waren.", "Undo a complete import if you chose the wrong file, time period or account.")}
            </p>
          </div>
          <button
            type="button"
            onClick={loadImportState}
            disabled={isHistoryPending}
            className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:text-white/35"
          >
            {isHistoryPending ? text("Lädt …", "Loading…") : text("Aktualisieren", "Refresh")}
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
                        {new Date(batch.createdAt).toLocaleString(journalNumberLocale[locale])} · {batch.presetLabel || text("Preset offen", "Preset unavailable")} · {batch.accountLabel || text("Konto offen", "Account unavailable")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-emerald-300/15 bg-emerald-400/[0.07] px-3 py-1 text-emerald-100/80">
                        {batch.importedCount} Trades
                      </span>
                      {batch.duplicateCount ? (
                        <span className="rounded-full border border-orange-300/15 bg-orange-400/[0.06] px-3 py-1 text-orange-100/80">
                          {text(`${batch.duplicateCount} Dubletten`, `${batch.duplicateCount} duplicates`)}
                        </span>
                      ) : null}
                      {batch.skippedCount || batch.invalidCount ? (
                        <span className="rounded-full border border-orange-300/15 bg-orange-400/[0.06] px-3 py-1 text-orange-100/80">
                          {text(`${batch.skippedCount} ausgelassen · ${batch.invalidCount} prüfpflichtig`, `${batch.skippedCount} skipped · ${batch.invalidCount} to review`)}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-white/55">
                        {text(`${batch.sourceRowCount} Quellenzeilen`, `${batch.sourceRowCount} source rows`)}
                      </span>
                      <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-white/55">
                        {batch.trustScore ?? "—"}% · {batch.trustLabel ? importDiagnostic(batch.trustLabel, locale) : text('Vertrauen offen', 'Confidence unavailable')}
                      </span>
                      {reverted ? (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/45">
                          {text("rückgängig", "Undone")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRevertImport(batch)}
                          disabled={isHistoryPending}
                          className="rounded-full border border-red-300/20 bg-red-400/[0.07] px-3 py-1 text-red-100/85 transition hover:border-red-200/40 disabled:cursor-not-allowed disabled:text-white/35"
                        >
                          {text("Import rückgängig", "Undo import")}
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
            {text("Noch kein Import-Verlauf.", "No imports yet.")}
          </div>
        )}
      </div>

      <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
              {text("1. Preset", "1. File format")}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">{text("Preset", "File format")}</h3>
          </div>
          <div className="rounded-2xl border border-orange-300/20 bg-orange-400/10 px-4 py-3 text-sm text-orange-100">
            {presetCopy.label} · {presetCopy.badge} · {displayAccountLabel}
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-3">
          {csvImportPresets.map((preset) => {
            const active = preset.key === selectedPreset;
            const copy = importPresetCopy(preset, locale);
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => handlePresetChange(preset.key)}
                className={`rounded-[24px] border p-4 text-left transition ${active ? "border-orange-300/35 bg-orange-400/10" : "border-white/10 bg-black/25 hover:border-orange-300/20 hover:bg-orange-400/[0.05]"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-semibold text-white">
                    {copy.label}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] ${active ? "border-orange-300/30 bg-orange-400/15 text-orange-100" : "border-white/10 bg-black/30 text-white/45"}`}
                  >
                    {copy.badge}
                  </span>
                </div>
                <p className="mt-2 text-sm text-white/50">
                  {copy.description}
                </p>
              </button>
            );
          })}
        </div>
        {profileDetection && fileName ? (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-white/60"
          >
            <BrokerImportDetectionNotice detection={profileDetection} selectedPreset={selectedPreset} />
          </div>
        ) : null}
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <label className="block rounded-2xl border border-orange-300/20 bg-black/25 p-4">
            <span className="text-[11px] uppercase tracking-[0.24em] text-white/60">{text("Zielkonto · Pflichtfeld", "Destination account (required)")}</span>
            {availableImportAccounts.length ? (
              <select
                value={selectedImportAccountId}
                onChange={(event) => {
                  const accountId = event.target.value;
                  setSelectedImportAccountId(accountId);
                  const account = availableImportAccounts.find(
                    (candidate) => candidate.id === accountId,
                  );
                  if (account) {
                    setImportAccountLabel(account.displayLabel);
                    setAccountCurrency(account.accountCurrency);
                  } else {
                    setImportAccountLabel(getPresetAccountLabel(selectedPreset));
                  }
                  setStatusMessage("");
                  setLastImportReport(null);
                }}
                className="mt-3 w-full rounded-xl border border-orange-300/20 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-orange-300/45"
              >
                <option value="">{text("Neues Importkonto anlegen", "Create a new import account")}</option>
                {availableImportAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayLabel} · {account.accountCurrency}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              value={importAccountLabel}
              onChange={(event) => {
                setImportAccountLabel(event.target.value);
                setStatusMessage("");
              }}
              maxLength={60}
              autoComplete="off"
              className="mt-3 w-full rounded-xl border border-orange-300/20 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-orange-300/45"
              placeholder={text(`Zum Beispiel ${getSourceAccountExample(selectedPreset)}`, `For example ${getSourceAccountExample(selectedPreset)}`)}
            />
            <span className="mt-2 block text-xs leading-5 text-white/50">
              {text("Ein gespeichertes Konto besitzt eine dauerhafte interne ID; der sichtbare Name bleibt editierbar. Exporte mit Ticket- oder Deal-ID bewusst eindeutig benennen.", "Use a distinct account name for files with ticket or deal IDs. You can rename the account later.")}
            </span>
          </label>
          <label className="block rounded-2xl border border-orange-300/20 bg-black/25 p-4">
            <span className="text-[11px] uppercase tracking-[0.24em] text-white/60">{text("Kontowährung · Pflichtfeld", "Account currency (required)")}</span>
            <select
              value={accountCurrency}
              onChange={(event) => { setAccountCurrency(event.target.value); setStatusMessage(""); }}
              className="mt-3 w-full rounded-xl border border-orange-300/20 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-orange-300/45"
            >
              <option value="">{text("Bitte bewusst auswählen", "Select a currency")}</option>
              {SUPPORTED_TRADE_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
            <span className="mt-2 block text-xs leading-5 text-white/50">{text("Enthält eine Dateizeile eine gültige Währung, wird diese verwendet. Sonst gilt die hier gewählte Währung. USD, USDT und USDC bleiben getrennt; es findet keine Umrechnung statt.", "A supported currency in the file takes priority. This selection fills in missing currencies. Equora treats USD, USDT and USDC as separate currencies.")}</span>
          </label>
        </div>
        <label className="mt-3 block rounded-2xl border border-orange-300/20 bg-black/25 p-4">
            <span className="text-[10px] uppercase tracking-[0.24em] text-white/60">
              {text("Export-UTC-Offset · Pflichtfeld bei Zeit ohne Zone", "Export UTC offset (required for times without a zone)")}
            </span>
            <input
              value={statementUtcOffset}
              onChange={(event) => {
                setStatementUtcOffset(event.target.value);
                setStatusMessage("");
                setLastImportReport(null);
              }}
              inputMode="text"
              maxLength={6}
              autoComplete="off"
              placeholder="+02:00"
              className="mt-3 w-full rounded-xl border border-orange-300/20 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-orange-300/45"
            />
            <span className="mt-2 block text-xs leading-5 text-white/60">
              {text("Der Offset wird aus Kopfzeilen wie UTC+02:00 übernommen, wenn vorhanden. Andernfalls den im Broker-Export verwendeten Offset ausdrücklich eintragen; ohne belastbare Zone bleiben zonenlose Zeiten gesperrt.", "If a column header shows an offset such as UTC+02:00, Equora uses it. Otherwise, enter the offset used in the broker export.")}
            </span>
          </label>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <label className="flex min-h-[190px] cursor-pointer flex-col justify-between rounded-[28px] border border-dashed border-orange-300/25 bg-black/25 p-5 transition hover:border-orange-300/45 hover:bg-orange-400/[0.05]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
              {text("2. Datei", "2. File")}
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-white">
              {text("CSV, Excel oder MT4-Bericht wählen", "Choose a CSV, Excel or MT4 report")}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-6 text-sm text-white/70">
            <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-4 py-2 text-orange-100">
              {text("Lokale Datei wählen", "Choose a local file")}
            </span>
            <span className="text-white/45">{text('Zielkonto:', 'Destination account:')} {displayAccountLabel}</span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.html,.htm,text/html"
            className="sr-only"
            onChange={(event) =>
              void handleFileChange(event.target.files?.[0] ?? null)
            }
          />
        </label>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricTile
              label={text("Datei", "File")}
              value={fileName || text("Noch keine Datei", "No file selected")}
              tone={fileName ? "text-white" : "text-white/45"}
            />
            <MetricTile
              label={text("Zeilen", "Rows")}
              value={String(counts.total)}
              tone={counts.total ? "text-white" : "text-white/45"}
            />
            <MetricTile
              label={text("Importierbar", "Ready")}
              value={String(counts.importable)}
              tone="text-emerald-200"
            />
            <MetricTile
              label={text("Prüfen", "Review")}
              value={String(counts.check + counts.skip)}
              tone={repairRows.length ? "text-orange-100" : "text-white/45"}
            />
          </div>
          {headers.length ? (
            <div className={`rounded-2xl border px-4 py-3 ${readiness.tone}`}>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
                {text("Feldcheck", "Field check")}
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
              <span>{text("Importdetails", "Import details")}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/45">
                <span className="group-open:hidden">{text("Anzeigen", "Show")}</span>
                <span className="hidden group-open:inline">{text("Ausblenden", "Hide")}</span>
              </span>
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label="Preset"
                value={presetCopy.label}
                tone="text-white"
              />
              <MetricTile
                label={text("Zielkonto", "Destination account")}
                value={displayAccountLabel}
                tone="text-orange-100"
              />
              <MetricTile
                label={text("Vertrauen", "Confidence")}
                value={trustSummary.label}
                tone={trustSummary.tone}
              />
              <MetricTile
                label={text("Spalten", "Columns")}
                value={headers.length ? String(headers.length) : "0"}
                tone="text-white"
              />
              <MetricTile
                label={text("Prüfen / Skip", "Review / skipped")}
                value={`${counts.check} / ${counts.skip}`}
                tone="text-orange-100"
              />
              <MetricTile
                label={text("Manuell", "Manual")}
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
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/75"
        >
          {statusMessage}
        </div>
      ) : null}

      {headers.length ? (
        <div className={`rounded-[28px] border p-5 ${trustSummary.cardTone}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">
                {text("Import-Vertrauen", "Preview quality")}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                {trustSummary.label}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
                {trustSummary.description}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/75">
              {text(`${trustSummary.score}% · ${trustSummary.importableRows} von ${trustSummary.totalRows} Zeilen`, `${trustSummary.score}% · ${trustSummary.importableRows} of ${trustSummary.totalRows} rows`)}
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
                {text("Importbericht", "Import report")}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                {text("Importbericht", "Import report")}
              </h3>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/70">
              {lastImportReport.importedPresetLabel}
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <MetricTile
              label={text("Importiert", "Imported")}
              value={String(lastImportReport.importedCount)}
              tone="text-emerald-200"
            />
            <MetricTile
              label={text("Dubletten", "Duplicates")}
              value={String(lastImportReport.duplicateCount)}
              tone={
                lastImportReport.duplicateCount
                  ? "text-orange-100"
                  : "text-white/45"
              }
            />
            <MetricTile
              label={text("Ausgelassen", "Skipped")}
              value={String(lastImportReport.skippedCount)}
              tone={
                lastImportReport.skippedCount
                  ? "text-orange-100"
                  : "text-white/45"
              }
            />
            <MetricTile
              label={text("Prüfpflichtig", "Needs review")}
              value={String(lastImportReport.invalidCount)}
              tone={
                lastImportReport.invalidCount
                  ? "text-orange-100"
                  : "text-white/45"
              }
            />
            <MetricTile
              label={text("Quellenzeilen", "Source rows")}
              value={String(lastImportReport.sourceRowCount)}
              tone="text-white/70"
            />
            <MetricTile
              label={text("Problemzeilen offen", "Rows to review")}
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
                {text("3. Zuordnung", "3. Map columns")}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                {text("Zuordnung", "Map columns")}
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowOptionalMappings((current) => !current)}
                className={`rounded-full border px-4 py-2 text-sm transition ${showOptionalMappings ? "border-orange-300/35 bg-orange-400/10 text-orange-100" : "border-white/10 bg-black/25 text-white/70 hover:border-white/20 hover:text-white"}`}
              >
                {showOptionalMappings ? text("Weniger", "Show less") : text("Mehr", "Show more")}
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
                {text("Prüfzeilen mitnehmen", "Include rows that need review")}
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
                      {importFieldLabel(field.key, field.label, locale)}
                    </span>
                    {field.required ? (
                      <span className="rounded-full border border-orange-300/20 bg-orange-400/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-orange-100">
                        {text("Pflicht", "Required")}
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
                      {text("Nicht zuordnen", "Do not map")}
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
                {text("4. Vorschau", "4. Preview")}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">{text("Dateivorschau", "File preview")}</h3>
              <p
                id="file-import-deployment-status"
                className="mt-2 max-w-2xl text-xs leading-5 text-white/60"
              >
                {brokerFileImportCapability.persistenceEnabled
                  ? text("Produktiver Dateiimport ist freigegeben.", "File import is available.")
                  : importCopy.reason}
              </p>
            </div>
            <button
              type="button"
              onClick={handleImport}
              aria-describedby="file-import-deployment-status"
              disabled={
                isImporting ||
                !drafts.length ||
                !brokerFileImportCapability.persistenceEnabled
              }
              className={`rounded-full px-5 py-3 text-sm font-medium transition ${
                isImporting ||
                !drafts.length ||
                !brokerFileImportCapability.persistenceEnabled
                  ? "cursor-not-allowed border border-white/10 bg-black/20 text-white/45"
                  : "border border-orange-300/35 bg-orange-400/15 text-white hover:border-orange-300/55 hover:bg-orange-400/20"
              }`}
            >
              {isImporting
                ? text("Import läuft …", "Importing…")
                : !brokerFileImportCapability.persistenceEnabled
                  ? importCopy.blocked
                  : text(`${drafts.length} Trades importieren`, `Import ${drafts.length} ${drafts.length === 1 ? 'trade' : 'trades'}`)}
            </button>
          </div>

          <div className="mt-5 overflow-x-auto rounded-3xl border border-white/10 bg-black/30">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm text-white/75">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.2em] text-white/35">
                <tr>
                  <th className="px-4 py-3">{text("Zeile", "Row")}</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">{text("Datum", "Date")}</th>
                  <th className="px-4 py-3">{text("Markt", "Market")}</th>
                  <th className="px-4 py-3">{text("Kontext", "Details")}</th>
                  <th className="px-4 py-3">{text("Vertrauen", "Confidence")}</th>
                  <th className="px-4 py-3">{text("Quellen", "Sources")}</th>
                  <th className="px-4 py-3">{text("Hinweis", "Notes")}</th>
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
                            journalNumberLocale[locale],
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
                            : text("Basisdaten", "Basic details")}
                      {row.normalized.leverage ? (
                        <span className="ml-2 text-white/35">
                          · {row.normalized.leverage}x
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-white/65">
                      {row.trustScore}% · {importDiagnostic(row.trustLabel, locale)}
                    </td>
                    <td className="px-4 py-3">
                      <SourceSummaryChips row={row} compact />
                    </td>
                    <td className="px-4 py-3 text-white/55">
                      {importDiagnostic(row.issues[0] ?? row.warnings[0] ?? text('Sieht gut aus.', 'No issue detected.'), locale)}
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
                {text("5. Problemzeilen", "5. Rows to review")}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                {text("Problemzeilen", "Rows to review")}
              </h3>
            </div>
            <div className="rounded-2xl border border-orange-300/20 bg-orange-400/10 px-4 py-3 text-sm text-orange-100">
              {text('Offen:', 'To review:')} {repairRows.length}
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
                        {text('Zeile', 'Row')} {row.rowNumber}
                      </span>
                      <StatusPill status={row.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.issues.map((issue) => (
                        <span
                          key={`${row.rowNumber}-${issue}`}
                          className="rounded-full border border-orange-300/20 bg-orange-400/10 px-3 py-1 text-xs text-orange-100"
                        >
                          {importDiagnostic(issue, locale)}
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
                            {importDiagnostic(warning, locale)}
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
                    {text("Reset", "Reset")}
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
                        label={importFieldLabel(field.key, field.label, locale)}
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
  locale: JournalLocale,
) {
  const text = journalText(locale);
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
  const label = importDiagnostic(score >= 88 ? "Hohes Vertrauen" : score >= 70 ? "Solide prüfen" : score >= 50 ? "Nur mit Prüfung" : "Niedriges Vertrauen", locale);
  const tone = score >= 88 ? "text-emerald-100" : score >= 70 ? "text-white" : score >= 50 ? "text-orange-100" : "text-red-100";
  const cardTone = score >= 88
    ? "border-emerald-300/18 bg-emerald-400/[0.05]"
    : score >= 70
      ? "border-white/10 bg-black/20"
      : "border-orange-300/18 bg-orange-400/[0.05]";
  const warnings = Array.from(warningCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([warning, count]) => {
      const message = importDiagnostic(warning, locale);
      return count > 1 ? `${message} (${count}×)` : message;
    });
  const description = totalRows
    ? score >= 88
      ? text("Die Datei ist sauber lesbar. Trotzdem Vorschau kurz prüfen, bevor sie ins Journal geht.", "The file was read successfully. Review the rows before using them.")
      : score >= 70
        ? text("Die Basis passt. Einzelne Felder bleiben bewusst markiert, damit nichts still falsch gespeichert wird.", "The basic fields are present. Check the marked values.")
        : text("Der Import braucht Aufmerksamkeit. Problemzeilen prüfen und fehlende Werte nur ergänzen, wenn sie sicher sind.", "Review the flagged rows. Only add values you can verify.")
    : text("Datei wählen. Danach zeigt Equora, wo die Werte herkommen und was offen bleibt.", "Choose a file to see where values came from and which details are missing.");

  return {
    score,
    label,
    tone,
    cardTone,
    description,
    totalRows,
    importableRows,
    chips: [
      text(`Importierbar: ${importableRows}`, `Ready: ${importableRows}`),
      text(`Prüfen: ${checkRows}`, `Review: ${checkRows}`),
      text(`Skip: ${skipRows}`, `Skipped: ${skipRows}`),
      text(`Warnungen: ${Array.from(warningCounts.values()).reduce((sum, count) => sum + count, 0)}`, `Warnings: ${Array.from(warningCounts.values()).reduce((sum, count) => sum + count, 0)}`),
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
  locale: JournalLocale,
) {
  const text = journalText(locale);
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
    text(`Spalten: ${headers.length}`, `Columns: ${headers.length}`),
    text(`Pflicht: ${mappedRequired}/${requiredFieldKeys.length}`, `Required: ${mappedRequired}/${requiredFieldKeys.length}`),
    text(`Kernfelder: ${mappedCore}/${coreOptionalFieldKeys.length}`, `Key fields: ${mappedCore}/${coreOptionalFieldKeys.length}`),
    text(`Optional: ${mappedOptional}`, `Optional: ${mappedOptional}`),
  ];

  if (!headers.length) {
    return {
      title: text("Noch keine Datei", "No file selected"),
      description: text("CSV oder Excel wählen. Danach zeigt Equora, was direkt lesbar ist.", "Choose a file to see which fields Equora can read."),
      chips,
      tone: "border-white/10 bg-black/20",
    };
  }

  if (mappedRequired < requiredFieldKeys.length) {
    return {
      title: text("Pflichtfeld fehlt", "A required field is missing"),
      description: text("Datum und Markt müssen sitzen. Erst dann ist die Vorschau belastbar.", "Map the date and market columns to preview the trades."),
      chips,
      tone: "border-orange-300/20 bg-orange-400/[0.06]",
    };
  }

  if (skipRows > 0) {
    return {
      title: text("Einige Zeilen fallen raus", "Some rows will be skipped"),
      description:
        text("Die Repair Queue zeigt, was fehlt. Lieber prüfen als falsch speichern.", "See Rows to review for the reason each row was skipped."),
      chips: [...chips, text(`Skip: ${skipRows}`, `Skipped: ${skipRows}`)],
      tone: "border-orange-300/20 bg-orange-400/[0.06]",
    };
  }

  if (checkRows > 0) {
    return {
      title: text("Vorschau möglich, aber prüfen", "Some rows need review"),
      description: text("Basis passt. Einige Zeilen brauchen P&L oder Preiskontext.", "Some rows are missing P&L or price details."),
      chips: [...chips, text(`Treffer: ${rowRate}%`, `Ready: ${rowRate}%`)],
      tone: "border-orange-300/20 bg-orange-400/[0.06]",
    };
  }

  return {
    title: text("Vorschau wirkt sauber", "Preview looks ready"),
    description:
      `${text('Pflichtfelder und Kernwerte sind erkannt.', 'Required fields and key values were found.')} ${getBrokerFileImportCopy(locale).reason}`,
    chips: [...chips, text(`Treffer: ${rowRate}%`, `Ready: ${rowRate}%`)],
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
  const locale = useJournalLocale();
  const text = journalText(locale);
  const groups = [
    buildSourceGroup(
      row.sources,
      "csv",
      text("Direkt", "From file"),
      "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
      compact,
      locale,
    ),
    buildSourceGroup(
      row.sources,
      "preset",
      "Preset",
      "border-sky-300/20 bg-sky-400/10 text-sky-100",
      compact,
      locale,
    ),
    buildSourceGroup(
      row.sources,
      "manual",
      text("Manuell", "Manual"),
      "border-orange-300/20 bg-orange-400/10 text-orange-100",
      compact,
      locale,
    ),
  ].filter(Boolean) as Array<{
    label: string;
    detail: string;
    className: string;
  }>;

  if (!groups.length) {
    return (
      <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/45">
        {text("Noch keine Feldquelle", "No field sources yet")}
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
  locale: JournalLocale,
) {
  const fields = summarizeSourceFields(sources, source, compact, locale);
  if (!fields.length) return null;
  return { label, detail: fields.join(" · "), className };
}

function summarizeSourceFields(
  sources: Record<CsvImportFieldKey, CsvImportValueSource>,
  source: CsvImportValueSource,
  compact: boolean,
  locale: JournalLocale,
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
    .map((field) => importFieldLabel(field.key, field.label, locale));
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
  const text = journalText(useJournalLocale());
  const copy =
    status === "importable"
      ? text("Importierbar", "Ready")
      : status === "check"
        ? text("Prüfen", "Review")
        : text("Skip", "Skipped");
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
  value,
  onChange,
}: {
  label: string;
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

import { normalizeInstrumentType, parseTradingNumber } from "@/lib/utils/calculations";
import { normalizeTradeCurrency } from "@/lib/utils/currency";

export type CsvImportFieldKey =
  | "date"
  | "market"
  | "currency"
  | "netPnL"
  | "entry"
  | "exit"
  | "stopLoss"
  | "takeProfit"
  | "direction"
  | "setup"
  | "session"
  | "tags"
  | "notes"
  | "fees"
  | "positionSize"
  | "instrumentType"
  | "leverage";

export type CsvImportPresetKey =
  | "generic"
  | "mexc-futures"
  | "mexc-spot"
  | "binance-futures"
  | "bybit-futures"
  | "okx-futures"
  | "kraken-spot"
  | "ctrader-history";

export type CsvImportMapping = Partial<Record<CsvImportFieldKey, string>>;

export type CsvImportFieldDefinition = {
  key: CsvImportFieldKey;
  label: string;
  required?: boolean;
  helper: string;
};

export type CsvImportPreset = {
  key: CsvImportPresetKey;
  label: string;
  badge: string;
  description: string;
  helper: string;
  defaultSetup: string;
  defaultInstrumentType?: string;
  defaultBrokerProfile?: string;
  defaultCryptoMarketType?: string;
  sourceIdentity?: Readonly<{
    kind: string;
    aliases: readonly string[];
  }>;
  aliasOverrides?: Partial<Record<CsvImportFieldKey, string[]>>;
};

export type ParsedCsvData = {
  delimiter: string;
  headers: string[];
  rows: Array<Record<string, string>>;
};

export const CSV_IMPORT_LIMITS = Object.freeze({
  maxFileBytes: 5 * 1024 * 1024,
  maxTextCharacters: 5_000_000,
  maxRows: 5_000,
  maxColumns: 128,
  maxCellCharacters: 10_000,
  maxDraftCharacters: 50_000,
});

export type CsvImportPreviewStatus = "importable" | "check" | "skip";

export type CsvImportValueSource = "csv" | "preset" | "manual" | "empty";

export type CsvImportSourceIdentity = Readonly<{
  kind: string;
  header: string;
  value: string;
}>;

export type CsvImportPreviewRow = {
  rowNumber: number;
  raw: Record<string, string>;
  sourceIdentity: CsvImportSourceIdentity | null;
  normalized: {
    date: string | null;
    market: string | null;
    currency: string | null;
    netPnL: string | null;
    entry: string | null;
    exit: string | null;
    stopLoss: string | null;
    takeProfit: string | null;
    direction: string | null;
    setup: string | null;
    session: string | null;
    tags: string[];
    notes: string | null;
    fees: string | null;
    positionSize: string | null;
    instrumentType: string | null;
    leverage: string | null;
  };
  sources: Record<CsvImportFieldKey, CsvImportValueSource>;
  fieldHeaders: Partial<Record<CsvImportFieldKey, string>>;
  warnings: string[];
  trustScore: number;
  trustLabel: string;
  issues: string[];
  status: CsvImportPreviewStatus;
};

export type CsvImportRepairOverrides = Record<
  number,
  Partial<Record<CsvImportFieldKey, string>>
>;

export type CsvImportDraft = {
  rowNumber: number;
  sourceIdentity?: CsvImportSourceIdentity | null;
  fieldSources?: Partial<Record<CsvImportFieldKey, CsvImportValueSource>>;
  fieldHeaders?: Partial<Record<CsvImportFieldKey, string>>;
  importWarnings?: string[];
  importTrustScore?: number;
  importTrustLabel?: string;
  date: string;
  market: string;
  currency?: string | null;
  netPnL?: string | null;
  entry?: string | null;
  exit?: string | null;
  stopLoss?: string | null;
  takeProfit?: string | null;
  direction?: string | null;
  setup?: string | null;
  session?: string | null;
  tags?: string[];
  notes?: string | null;
  fees?: string | null;
  positionSize?: string | null;
  instrumentType?: string | null;
  leverage?: string | null;
  importPreset?: CsvImportPresetKey;
};

export type CsvImportSourceManifestRow = Readonly<{
  rowNumber: number;
  previewStatus: CsvImportPreviewStatus;
  selected: boolean;
}>;

export const csvImportFieldDefinitions: CsvImportFieldDefinition[] = [
  {
    key: "date",
    label: "Datum",
    required: true,
    helper: "Pflichtfeld für den Trade-Zeitpunkt.",
  },
  {
    key: "market",
    label: "Markt / Symbol",
    required: true,
    helper: "Pflichtfeld für Asset oder Symbol.",
  },
  {
    key: "currency",
    label: "Kontowährung",
    helper: "Zeilenwert überschreibt die für fehlende Werte gewählte Import-Währung.",
  },
  { key: "netPnL", label: "P&L", helper: "Schnelles P&L-Bild." },
  { key: "entry", label: "Entry", helper: "Optionaler Einstiegskurs." },
  { key: "exit", label: "Exit", helper: "Optionaler Ausstiegskurs." },
  { key: "stopLoss", label: "Stop Loss", helper: "Optionaler Stop." },
  { key: "takeProfit", label: "Take Profit", helper: "Optionales Ziel." },
  { key: "direction", label: "Richtung", helper: "Long, Short oder ähnlich." },
  {
    key: "setup",
    label: "Setup",
    helper: "Wird sonst auf das gewählte Import-Preset gesetzt.",
  },
  {
    key: "session",
    label: "Session",
    helper: "Optional für London, New York usw.",
  },
  {
    key: "tags",
    label: "Tags",
    helper: "Mit Komma, Semikolon oder Pipe getrennt.",
  },
  { key: "notes", label: "Notizen", helper: "Optionaler Freitext." },
  { key: "fees", label: "Gebühren", helper: "Optionaler Zahlenwert." },
  {
    key: "positionSize",
    label: "Positionsgröße",
    helper: "Optionaler Zahlenwert.",
  },
  {
    key: "instrumentType",
    label: "Instrument-Typ",
    helper: "z. B. Futures, Forex, Crypto.",
  },
  {
    key: "leverage",
    label: "Hebel",
    helper: "Optionaler Zahlenwert für Perps, Futures oder Margin.",
  },
];

const fieldAliases: Record<CsvImportFieldKey, string[]> = {
  date: [
    "date",
    "datum",
    "trade date",
    "timestamp",
    "time",
    "open time",
    "entry time",
    "opened",
    "created at",
    "close time",
    "filled time",
    "fill time",
    "order time",
    "executed at",
    "utc time",
  ],
  market: [
    "market",
    "markt",
    "symbol",
    "asset",
    "ticker",
    "instrument",
    "pair",
    "produkt",
    "contract",
    "coin",
    "base asset",
    "trading pair",
  ],
  currency: [
    "currency",
    "account currency",
    "settlement currency",
    "quote currency",
    "kontowährung",
    "währung",
    "ccy",
  ],
  netPnL: [
    "net pnl",
    "netpnl",
    "pnl",
    "profit",
    "realized pnl",
    "realised pnl",
    "gewinn",
    "verlust",
    "ergebnis",
    "closed pnl",
    "closing pnl",
    "close pnl",
    "realized profit",
    "realised profit",
    "profit loss",
    "profit/loss",
  ],
  entry: [
    "entry",
    "entry price",
    "buy price",
    "open price",
    "einstieg",
    "avg entry price",
    "average open price",
    "avg open price",
    "price",
    "order price",
    "filled price",
  ],
  exit: [
    "exit",
    "exit price",
    "close price",
    "sell price",
    "ausstieg",
    "avg close price",
    "average close price",
    "avg closing price",
    "closing price",
    "filled price",
  ],
  stopLoss: ["stop", "stop loss", "sl", "stoploss"],
  takeProfit: ["tp", "take profit", "target", "ziel"],
  direction: [
    "direction",
    "side",
    "richtung",
    "long short",
    "buy sell",
    "trade type",
    "position side",
    "order side",
    "type",
  ],
  setup: ["setup", "strategy", "strategie", "playbook"],
  session: ["session", "sesssion", "trading session"],
  tags: ["tags", "tag", "labels", "label"],
  notes: [
    "notes",
    "note",
    "notizen",
    "comment",
    "kommentar",
    "memo",
    "remark",
    "remarks",
  ],
  fees: [
    "fees",
    "fee",
    "commission",
    "gebühren",
    "kosten",
    "trading fee",
    "total fee",
    "fee paid",
    "commission paid",
  ],
  positionSize: [
    "size",
    "position size",
    "qty",
    "quantity",
    "lots",
    "contracts",
    "positionsgröße",
    "filled qty",
    "volume",
    "amount",
    "executed amount",
    "filled amount",
  ],
  instrumentType: [
    "instrument type",
    "instrument",
    "asset class",
    "markt typ",
    "typ",
    "market type",
  ],
  leverage: ["leverage", "lever", "heb", "hebel"],
};

export const csvImportPresets: CsvImportPreset[] = [
  {
    key: "generic",
    label: "Allgemeine CSV",
    badge: "Frei",
    description:
      "Breiter Start für gemischte Broker-, Exchange- oder Eigen-Exporte.",
    helper:
      "Equora versucht die Spalten ruhig vorzubelegen. Danach kannst du nur das Nötigste korrigieren.",
    defaultSetup: "CSV Import",
  },
  {
    key: "ctrader-history",
    label: "cTrader Statement",
    badge: "Plattform",
    description:
      "Gemeinsames Statement-Profil für Broker, die ihre Historie über cTrader bereitstellen.",
    helper:
      "Ordnet cTrader-Dealspalten wie Closing Time, Entry/Closing Price, Commission und Net P&L zu. Ein direkter Plattform-Sync ist damit nicht aktiviert.",
    defaultSetup: "cTrader Statement Import",
    defaultBrokerProfile: "manual",
    sourceIdentity: {
      kind: "deal_id",
      aliases: ["deal id", "id"],
    },
    aliasOverrides: {
      date: ["closing time", "close time", "closed time"],
      market: ["symbol"],
      netPnL: ["net (currency)", "net realised", "net realized", "net profit", "net"],
      entry: ["entry price", "opening price"],
      exit: ["closing price", "close price"],
      stopLoss: ["stop loss", "sl"],
      takeProfit: ["take profit", "tp"],
      direction: ["opening direction", "direction"],
      tags: ["label"],
      notes: ["comment"],
      fees: ["commissions", "commission", "realised broker commission", "realized broker commission"],
      positionSize: ["closing quantity", "requested quantity", "opening quantity", "quantity", "lots"],
    },
  },
  {
    key: "mexc-futures",
    label: "MEXC Futures",
    badge: "Krypto",
    description:
      "Preset für MEXC-Perps/Futures mit Fokus auf Symbol, Zeit, P&L, Size, Fees und Hebel.",
    helper:
      "Nimmt MEXC-Futures-Spalten bevorzugt auf. Setup, Broker- und Markt-Kontext werden dabei automatisch auf MEXC Futures / Perps gezogen.",
    defaultSetup: "MEXC Futures Import",
    defaultInstrumentType: "Crypto",
    defaultBrokerProfile: "mexc-perps",
    defaultCryptoMarketType: "perps",
    aliasOverrides: {
      date: [
        "close time",
        "time",
        "created time",
        "create time",
        "filled time",
        "trade time",
        "update time",
      ],
      market: ["futures trading pair", "trading pair", "symbol", "contract", "futures", "futures symbol"],
      netPnL: [
        "realized pnl",
        "realised pnl",
        "closed pnl",
        "close pnl",
        "total realized pnl",
        "closing pnl",
      ],
      entry: [
        "avg entry price",
        "average open price",
        "avg open price",
        "open avg price",
      ],
      exit: [
        "avg close price",
        "average close price",
        "avg closing price",
        "average filled price",
        "avg filled price",
        "close avg price",
        "closing price",
      ],
      direction: ["direction", "side", "position side", "order side"],
      fees: ["trading fee", "fee", "total fee", "close fee"],
      positionSize: ["filled qty crypto", "filled qty cont", "filled qty", "size", "qty", "quantity", "volume"],
      leverage: ["leverage", "lever"],
      instrumentType: ["market type", "contract type"],
    },
  },
  {
    key: "mexc-spot",
    label: "MEXC Spot",
    badge: "Spot",
    description:
      "Preset für MEXC-Spot-Historien mit Symbol, Zeit, Side, Preis, Menge und Gebühren.",
    helper:
      "Zieht Spot-Exporte in einen einfachen Trade-Kontext. P&L kann später ergänzt werden, wenn der Export nur Ausführungen liefert.",
    defaultSetup: "MEXC Spot Import",
    defaultInstrumentType: "Crypto",
    defaultBrokerProfile: "mexc-spot",
    defaultCryptoMarketType: "spot",
    aliasOverrides: {
      date: [
        "time",
        "created time",
        "create time",
        "filled time",
        "trade time",
      ],
      market: ["symbol", "pair", "coin", "trading pair"],
      entry: ["price", "avg price", "filled price", "order price"],
      direction: ["side", "order side", "type"],
      fees: ["fee", "trading fee", "commission"],
      positionSize: [
        "amount",
        "quantity",
        "filled amount",
        "filled qty",
        "volume",
      ],
    },
  },
  {
    key: "binance-futures",
    label: "Binance Futures",
    badge: "Krypto",
    description:
      "Preset für Binance Futures / USD-M Exporte mit Zeit, Symbol, Side, realisiertem P&L und Fees.",
    helper:
      "Für Futures-Listen mit Realized PNL, Commission, Quantity oder Position Side.",
    defaultSetup: "Binance Futures Import",
    defaultInstrumentType: "Crypto",
    defaultBrokerProfile: "manual",
    defaultCryptoMarketType: "perps",
    aliasOverrides: {
      date: ["time", "date utc", "trade time", "order time"],
      market: ["symbol", "contract"],
      netPnL: ["realized profit", "realized pnl", "realised pnl", "pnl"],
      direction: ["side", "position side"],
      fees: ["commission", "fee"],
      positionSize: ["quantity", "qty", "executed amount"],
      leverage: ["leverage"],
    },
  },
  {
    key: "bybit-futures",
    label: "Bybit Futures",
    badge: "Krypto",
    description:
      "Preset für Bybit-Perps mit Symbol, Zeit, Side, Order Price, Avg Entry/Exit, P&L und Fees.",
    helper:
      "Für Bybit-Exports, bei denen PnL, Closed PnL oder Trading Fee getrennt auftauchen.",
    defaultSetup: "Bybit Futures Import",
    defaultInstrumentType: "Crypto",
    defaultBrokerProfile: "bybit-perps",
    defaultCryptoMarketType: "perps",
    aliasOverrides: {
      date: ["created time", "updated time", "closed time", "trade time"],
      market: ["symbol", "contract"],
      netPnL: ["closed pnl", "realized pnl", "pnl"],
      entry: ["avg entry price", "order price", "price"],
      exit: ["avg exit price", "avg close price", "close price"],
      direction: ["side", "position side"],
      fees: ["trading fee", "fee"],
      positionSize: ["qty", "quantity", "closed size", "size"],
      leverage: ["leverage"],
    },
  },
  {
    key: "okx-futures",
    label: "OKX Futures",
    badge: "Krypto",
    description:
      "Preset für OKX Futures / Swap Exporte mit Instrument, Zeit, Side, P&L, Fee und Größe.",
    helper:
      "Für OKX-Spalten wie InstId, PnL, Fee, Side, PosSide und Fill Time.",
    defaultSetup: "OKX Futures Import",
    defaultInstrumentType: "Crypto",
    defaultBrokerProfile: "okx-perps",
    defaultCryptoMarketType: "perps",
    aliasOverrides: {
      date: ["fill time", "u time", "c time", "trade time", "time"],
      market: ["instid", "inst id", "instrument", "symbol"],
      netPnL: ["pnl", "realized pnl", "realised pnl"],
      entry: ["fill px", "avg px", "price"],
      direction: ["side", "posside", "pos side"],
      fees: ["fee", "fees"],
      positionSize: ["sz", "size", "fill sz", "qty"],
      leverage: ["lever", "leverage"],
    },
  },
  {
    key: "kraken-spot",
    label: "Kraken Spot",
    badge: "Spot",
    description:
      "Preset für Kraken-Ledger oder Trade-Export mit Pair, Time, Type, Price, Volume und Fee.",
    helper:
      "Spot-Import als Ausführungsbasis. Fehlendes P&L bleibt bewusst prüfpflichtig.",
    defaultSetup: "Kraken Spot Import",
    defaultInstrumentType: "Crypto",
    defaultBrokerProfile: "manual",
    defaultCryptoMarketType: "spot",
    aliasOverrides: {
      date: ["time", "dtime", "date"],
      market: ["pair", "asset", "symbol"],
      entry: ["price", "cost"],
      direction: ["type", "side"],
      fees: ["fee"],
      positionSize: ["vol", "volume", "amount"],
    },
  },
];

const presetLookup = new Map(
  csvImportPresets.map((preset) => [preset.key, preset]),
);

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[._\-/]+/g, " ")
    .replace(/\s+/g, " ");
}

function countDelimiterInFirstRecord(text: string, delimiter: string) {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (character === "\n" || character === "\r")) break;
    if (!inQuotes && character === delimiter) count += 1;
  }

  return count;
}

function detectDelimiter(text: string) {
  const delimiters = [",", ";", "\t", "|"];
  const scores = delimiters
    .map((delimiter) => ({
      delimiter,
      count: countDelimiterInFirstRecord(text, delimiter),
    }))
    .sort((left, right) => right.count - left.count);
  return scores[0]?.count ? scores[0].delimiter : ",";
}

function parseDelimitedRecords(text: string, delimiter: string) {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  function commitCell() {
    row.push(cell.trim());
    cell = "";
  }

  function commitRow() {
    commitCell();
    if (row.some((value) => value.trim())) records.push(row);
    row = [];
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character === delimiter) {
      commitCell();
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      commitRow();
      continue;
    }

    cell += character;
  }

  if (inQuotes) {
    throw new Error("CSV enthält ein nicht geschlossenes Anführungszeichen.");
  }
  if (cell || row.length) commitRow();
  return records;
}

function makeUniqueCsvHeaders(headers: string[]) {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const base = header.trim() || "Spalte " + (index + 1);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? base + " " + (count + 1) : base;
  });
}

export function parseCsvText(text: string): ParsedCsvData {
  if (text.length > CSV_IMPORT_LIMITS.maxTextCharacters) {
    throw new Error("CSV ist zu groß. Erlaubt sind höchstens 5 MB Text.");
  }
  const sanitized = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(sanitized);
  const records = parseDelimitedRecords(sanitized, delimiter);

  if (!records.length) {
    return { delimiter, headers: [], rows: [] };
  }

  const headers = makeUniqueCsvHeaders(records[0]);
  if (headers.length > CSV_IMPORT_LIMITS.maxColumns) {
    throw new Error(
      `Datei hat zu viele Spalten. Erlaubt sind höchstens ${CSV_IMPORT_LIMITS.maxColumns}.`,
    );
  }
  if (records.length - 1 > CSV_IMPORT_LIMITS.maxRows) {
    throw new Error(
      `Datei hat zu viele Datenzeilen. Erlaubt sind höchstens ${CSV_IMPORT_LIMITS.maxRows}.`,
    );
  }
  if (
    records.some(
      (record) =>
        record.length > CSV_IMPORT_LIMITS.maxColumns ||
        record.some((cell) => cell.length > CSV_IMPORT_LIMITS.maxCellCharacters),
    )
  ) {
    throw new Error(
      "Datei enthält eine zu breite Zeile oder eine überlange Zelle und wurde nicht verarbeitet.",
    );
  }
  const overwideRowIndex = records
    .slice(1)
    .findIndex((record) => record.length > headers.length);
  if (overwideRowIndex >= 0) {
    throw new Error(
      `Datenzeile ${overwideRowIndex + 2} enthält mehr Zellen als die Kopfzeile und wurde nicht still abgeschnitten.`,
    );
  }
  const rows = records.slice(1).map((cells) => {
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = cells[index] ?? "";
      return acc;
    }, {});
  });

  return { delimiter, headers, rows };
}

function getPreset(key: CsvImportPresetKey | null | undefined) {
  return presetLookup.get(key ?? "generic") ?? csvImportPresets[0];
}

const SOURCE_ID_KIND_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const REJECTED_SOURCE_ID_VALUES = new Set(["-", "n/a", "na", "null", "undefined"]);
const AMBIGUOUS_SOURCE_ACCOUNT_LABELS = new Set([
  "account",
  "ctrader account",
  "ctrader konto",
  "hauptkonto",
  "konto",
  "main account",
]);

export function isExplicitCsvImportAccountLabel(
  value: string | null | undefined,
) {
  const normalized = value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  return (
    normalized.length >= 3 &&
    normalized.length <= 60 &&
    !AMBIGUOUS_SOURCE_ACCOUNT_LABELS.has(normalized)
  );
}

export function normalizeCsvImportSourceIdentity(
  identity: Partial<CsvImportSourceIdentity> | null | undefined,
): CsvImportSourceIdentity | null {
  const kind = identity?.kind?.trim().toLowerCase() ?? "";
  const header = identity?.header?.trim().replace(/\s+/g, " ") ?? "";
  const value = identity?.value?.trim().replace(/\s+/g, " ") ?? "";

  if (
    !SOURCE_ID_KIND_PATTERN.test(kind) ||
    !header ||
    header.length > 80 ||
    !value ||
    value.length > 160 ||
    REJECTED_SOURCE_ID_VALUES.has(value.toLowerCase())
  ) {
    return null;
  }

  return Object.freeze({ kind, header, value });
}

export function extractCsvImportSourceIdentity(
  row: Readonly<Record<string, string>>,
  presetKey: CsvImportPresetKey,
) {
  const descriptor = getPreset(presetKey).sourceIdentity;
  if (!descriptor) return null;

  const fields = Object.entries(row).map(([header, value]) => ({
    header,
    normalizedHeader: normalizeHeader(header),
    value,
  }));

  for (const alias of descriptor.aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const match = fields.find(
      (field) => field.normalizedHeader === normalizedAlias,
    );
    const identity = normalizeCsvImportSourceIdentity({
      kind: descriptor.kind,
      header: match?.header,
      value: match?.value,
    });
    if (identity) return identity;
  }

  return null;
}

export function buildCsvImportSourceIdentityKey(input: Readonly<{
  presetKey: CsvImportPresetKey;
  sourceIdentity: Partial<CsvImportSourceIdentity> | null | undefined;
  brokerProfile?: string | null;
  accountTemplate?: string | null;
  accountLabel?: string | null;
}>) {
  const identity = normalizeCsvImportSourceIdentity(input.sourceIdentity);
  const accountLabel =
    input.accountLabel?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  if (!identity || !accountLabel) return null;

  return JSON.stringify([
    "equora-csv-source-identity-v1",
    input.presetKey,
    input.brokerProfile?.trim().toLowerCase() ?? "",
    input.accountTemplate?.trim().toLowerCase() ?? "",
    accountLabel,
    identity.kind,
    identity.value,
  ]);
}

export function isCsvImportDuplicate(input: Readonly<{
  sourceIdentityKey: string | null;
  fingerprint: string;
  existingSourceIdentityKeys: ReadonlySet<string>;
  seenSourceIdentityKeys: ReadonlySet<string>;
  existingFingerprints: ReadonlySet<string>;
  seenFingerprints: ReadonlySet<string>;
}>) {
  if (input.sourceIdentityKey) {
    return (
      input.existingSourceIdentityKeys.has(input.sourceIdentityKey) ||
      input.seenSourceIdentityKeys.has(input.sourceIdentityKey)
    );
  }
  const fingerprintDuplicate =
    input.existingFingerprints.has(input.fingerprint) ||
    input.seenFingerprints.has(input.fingerprint);
  return fingerprintDuplicate;
}

function getAliasesForField(
  field: CsvImportFieldKey,
  presetKey: CsvImportPresetKey | null | undefined,
) {
  const preset = getPreset(presetKey);
  return [...(preset.aliasOverrides?.[field] ?? []), ...fieldAliases[field]];
}

type HeaderFieldMatch = {
  field: CsvImportFieldKey;
  header: string;
  score: 1 | 2;
  aliasRank: number;
  aliasLength: number;
  headerRank: number;
};

function buildHeaderFieldMatches(
  headers: string[],
  presetKey: CsvImportPresetKey,
) {
  const matches: HeaderFieldMatch[] = [];

  for (const definition of csvImportFieldDefinitions) {
    const aliases = getAliasesForField(definition.key, presetKey)
      .map(normalizeHeader)
      .filter(Boolean);
    headers.forEach((header, headerRank) => {
      const normalizedHeader = normalizeHeader(header);
      let best: HeaderFieldMatch | null = null;
      aliases.forEach((alias, aliasRank) => {
        const score =
          normalizedHeader === alias
            ? 2
            : normalizedHeader.includes(alias)
              ? 1
              : 0;
        if (!score) return;
        const candidate: HeaderFieldMatch = {
          field: definition.key,
          header,
          score,
          aliasRank,
          aliasLength: alias.length,
          headerRank,
        };
        if (
          !best ||
          candidate.score > best.score ||
          (candidate.score === best.score &&
            candidate.aliasLength > best.aliasLength) ||
          (candidate.score === best.score &&
            candidate.aliasLength === best.aliasLength &&
            candidate.aliasRank < best.aliasRank)
        ) {
          best = candidate;
        }
      });
      if (best) matches.push(best);
    });
  }

  return matches;
}

function getTopHeaderClaims(
  matches: HeaderFieldMatch[],
  header: string,
) {
  const headerMatches = matches.filter((match) => match.header === header);
  const bestScore = Math.max(0, ...headerMatches.map((match) => match.score));
  return headerMatches.filter((match) => match.score === bestScore);
}

export function getCsvImportMappingIssues(
  headers: string[],
  mapping: CsvImportMapping,
  presetKey: CsvImportPresetKey = "generic",
) {
  const issues: string[] = [];
  const fieldsByHeader = new Map<string, CsvImportFieldKey[]>();
  for (const definition of csvImportFieldDefinitions) {
    const header = mapping[definition.key];
    if (!header) continue;
    const fields = fieldsByHeader.get(header) ?? [];
    fields.push(definition.key);
    fieldsByHeader.set(header, fields);
  }

  for (const [header, fields] of fieldsByHeader) {
    if (fields.length > 1) {
      issues.push(
        `Spalte „${header}“ ist mehreren Feldern zugeordnet. Bitte jede Spalte nur einmal verwenden.`,
      );
    }
  }

  const matches = buildHeaderFieldMatches(headers, presetKey);
  for (const header of headers) {
    const claims = getTopHeaderClaims(matches, header);
    const claimedFields = Array.from(
      new Set(claims.map((claim) => claim.field)),
    );
    if (claimedFields.length <= 1) continue;
    const mappedFields = fieldsByHeader.get(header) ?? [];
    if (
      mappedFields.length === 1 &&
      claimedFields.includes(mappedFields[0])
    ) {
      continue;
    }
    issues.push(
      `Spalte „${header}“ passt gleich stark zu mehreren Feldern. Bitte die Zuordnung ausdrücklich auf genau ein Feld setzen.`,
    );
  }

  return Array.from(new Set(issues));
}

export function inferCsvImportMapping(
  headers: string[],
  presetKey: CsvImportPresetKey = "generic",
): CsvImportMapping {
  const mapping: CsvImportMapping = {};
  const matches = buildHeaderFieldMatches(headers, presetKey);
  const usedHeaders = new Set<string>();

  for (const score of [2, 1] as const) {
    for (const definition of csvImportFieldDefinitions) {
      if (mapping[definition.key]) continue;
      const candidates = matches
        .filter(
          (match) =>
            match.field === definition.key &&
            match.score === score &&
            !usedHeaders.has(match.header) &&
            new Set(
              getTopHeaderClaims(matches, match.header).map(
                (claim) => claim.field,
              ),
            ).size === 1,
        )
        .sort(
          (left, right) =>
            left.aliasRank - right.aliasRank ||
            right.aliasLength - left.aliasLength ||
            left.headerRank - right.headerRank,
        );
      const match = candidates[0];
      if (!match) continue;
      mapping[definition.key] = match.header;
      usedHeaders.add(match.header);
    }
  }

  return mapping;
}

function getMappedValue(
  row: Record<string, string>,
  mapping: CsvImportMapping,
  key: CsvImportFieldKey,
) {
  const header = mapping[key];
  if (!header) return "";
  return row[header] ?? "";
}

function getCTraderStatementCurrency(mapping: CsvImportMapping) {
  const netPnlHeader = mapping.netPnL;
  if (!netPnlHeader) return "";
  const match = netPnlHeader.match(/\((EUR|USD|GBP|USDT|USDC)\)/i);
  return match?.[1]?.toUpperCase() ?? "";
}

function normalizeImportedFeeValue(
  value: string,
  presetKey: CsvImportPresetKey,
) {
  const trimmed = value.trim();
  if (!trimmed || presetKey !== "ctrader-history") return trimmed;
  const parsed = parseTradingNumber(trimmed);
  return parsed === null ? trimmed : String(Math.abs(parsed));
}

function getPreviewValue(
  row: Record<string, string>,
  mapping: CsvImportMapping,
  key: CsvImportFieldKey,
  rowNumber: number,
  repairOverrides?: CsvImportRepairOverrides,
) {
  const rowOverrides = repairOverrides?.[rowNumber];
  if (rowOverrides && Object.prototype.hasOwnProperty.call(rowOverrides, key)) {
    return rowOverrides[key] ?? "";
  }

  return getMappedValue(row, mapping, key);
}

function getPreviewValueSource(
  row: Record<string, string>,
  mapping: CsvImportMapping,
  key: CsvImportFieldKey,
  rowNumber: number,
  presetKey: CsvImportPresetKey,
  repairOverrides?: CsvImportRepairOverrides,
): CsvImportValueSource {
  const rowOverrides = repairOverrides?.[rowNumber];
  if (rowOverrides && Object.prototype.hasOwnProperty.call(rowOverrides, key)) {
    return "manual";
  }

  const mapped = getMappedValue(row, mapping, key).trim();
  if (mapped) return "csv";

  const preset = getPreset(presetKey);
  if (
    (key === "setup" && preset.defaultSetup) ||
    (key === "instrumentType" && preset.defaultInstrumentType)
  ) {
    return "preset";
  }

  return "empty";
}


function buildFieldHeaderMap(mapping: CsvImportMapping) {
  return csvImportFieldDefinitions.reduce<Partial<Record<CsvImportFieldKey, string>>>((acc, definition) => {
    const header = mapping[definition.key]
    if (header) acc[definition.key] = header
    return acc
  }, {})
}

function getImportTrustLabel(score: number) {
  if (score >= 88) return "Hoches Vertrauen"
  if (score >= 70) return "Solide prüfen"
  if (score >= 50) return "Nur mit Prüfung"
  return "Niedriges Vertrauen"
}

function buildImportTrust(input: {
  normalized: CsvImportPreviewRow["normalized"]
  sources: Record<CsvImportFieldKey, CsvImportValueSource>
  issues: string[]
  presetKey: CsvImportPresetKey
  skipped?: boolean
}) {
  let score = 100
  const warnings: string[] = []

  if (input.skipped) score -= 70
  if (!input.normalized.date) score -= 25
  if (!input.normalized.market) score -= 25
  if (!input.normalized.netPnL && !(input.normalized.entry && input.normalized.exit)) {
    score -= 22
    warnings.push("Kein belastbares Ergebnis: P&L oder Entry/Exit fehlen.")
  }
  if (!input.normalized.stopLoss) {
    score -= 10
    warnings.push("R bleibt offen: Stop oder initiales Risiko fehlt.")
  }
  if (input.sources.netPnL === "csv") {
    warnings.push("P&L wurde aus der Datei übernommen. Gebühren nur prüfen, wenn die Börse sie getrennt ausweist.")
  }
  if (
    input.presetKey === "ctrader-history" &&
    input.sources.netPnL === "csv" &&
    input.normalized.fees
  ) {
    warnings.push(
      "cTrader Net enthält Kosten bereits. Die Kommission wird für Equora als positiver Kostenbetrag dokumentiert, aber nicht erneut vom importierten Netto-P&L abgezogen.",
    );
  }
  if (input.sources.entry === "csv" && input.sources.exit === "csv" && !input.normalized.netPnL) {
    warnings.push("P&L wurde nicht geliefert. Equora kann nur mit vollständigem Preis- und Size-Kontext sinnvoll rechnen.")
  }
  if (input.sources.setup === "preset") {
    score -= 4
    warnings.push("Setup kommt vom Preset. Später mit deinem echten Setup verknüpfen.")
  }
  if (input.sources.instrumentType === "preset") {
    score -= 2
  }
  if (input.sources.date === "manual" || input.sources.market === "manual") score -= 6
  if (input.issues.length) score -= Math.min(24, input.issues.length * 8)
  if (input.presetKey.includes("spot") && !input.normalized.netPnL) {
    warnings.push("Spot-Export liefert oft Ausführungen statt fertige Trades. Ergebnis später ergänzen.")
  }

  const safeScore = Math.max(0, Math.min(100, Math.round(score)))
  return {
    trustScore: safeScore,
    trustLabel: getImportTrustLabel(safeScore),
    warnings: Array.from(new Set(warnings)).slice(0, 6),
  }
}

function buildOffsetIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  offsetMinutes: number,
) {
  const timestamp =
    Date.UTC(year, month - 1, day, hour, minute, second) -
    offsetMinutes * 60_000;
  const shifted = new Date(timestamp + offsetMinutes * 60_000);
  if (
    shifted.getUTCFullYear() !== year ||
    shifted.getUTCMonth() !== month - 1 ||
    shifted.getUTCDate() !== day ||
    shifted.getUTCHours() !== hour ||
    shifted.getUTCMinutes() !== minute ||
    shifted.getUTCSeconds() !== second
  ) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

function normalizeDateValue(
  value: string,
  timestampOffsetMinutes?: number | null,
) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const unixSeconds = trimmed.match(/^\d{10}$/);
  if (unixSeconds) {
    const date = new Date(Number(trimmed) * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const unixMilliseconds = trimmed.match(/^\d{13}$/);
  if (unixMilliseconds) {
    const date = new Date(Number(trimmed));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const numericDate = trimmed.match(
    /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (numericDate) {
    const day = Number(numericDate[1]);
    const month = Number(numericDate[2]);
    const year = Number(
      numericDate[3].length === 2 ? `20${numericDate[3]}` : numericDate[3],
    );
    const hour = Number(numericDate[4] ?? 0);
    const minute = Number(numericDate[5] ?? 0);
    const second = Number(numericDate[6] ?? 0);
    if (timestampOffsetMinutes == null) return null;
    return buildOffsetIso(
      year,
      month,
      day,
      hour,
      minute,
      second,
      timestampOffsetMinutes,
    );
  }

  const isoLikeDate = trimmed.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (
    isoLikeDate && timestampOffsetMinutes != null
  ) {
    return buildOffsetIso(
      Number(isoLikeDate[1]),
      Number(isoLikeDate[2]),
      Number(isoLikeDate[3]),
      Number(isoLikeDate[4]),
      Number(isoLikeDate[5]),
      Number(isoLikeDate[6] ?? 0),
      timestampOffsetMinutes,
    );
  }

  const hasExplicitTimezone =
    /(?:z|utc|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  if (!hasExplicitTimezone) return null;
  const direct = new Date(trimmed.replace(" UTC", "Z"));
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  return null;
}

export function normalizeDirectionValue(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (
    [
      "long",
      "buy",
      "kauf",
      "open long",
      "close short",
      "cover",
      "bid",
    ].includes(trimmed)
  )
    return "Long";
  if (
    ["short", "sell", "verkauf", "open short", "close long", "ask"].includes(
      trimmed,
    )
  )
    return "Short";
  if (trimmed === "neutral") return "Neutral";
  return value.trim();
}

export function normalizeInstrumentTypeValue(
  value: string,
  presetKey: CsvImportPresetKey = "generic",
) {
  const trimmed = value.trim();
  if (!trimmed) {
    const presetDefault = getPreset(presetKey).defaultInstrumentType?.trim();
    return presetDefault || null;
  }
  const normalized = normalizeInstrumentType(trimmed);
  return normalized === "unknown" ? trimmed : normalized;
}

export function splitTagValue(value: string) {
  return value
    .split(/[|,;]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function hasEnoughContext(normalized: CsvImportPreviewRow["normalized"]) {
  return Boolean(
    normalized.netPnL ||
    (normalized.entry && normalized.exit) ||
    (normalized.entry && normalized.stopLoss && normalized.takeProfit),
  );
}

export function getCsvImportPresetMeta(presetKey: CsvImportPresetKey) {
  return getPreset(presetKey);
}


function getRawValueByAliases(row: Record<string, string>, aliases: string[]) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const match = entries.find(([header]) => {
      const normalizedHeader = normalizeHeader(header);
      return normalizedHeader === normalizedAlias || normalizedHeader.includes(normalizedAlias);
    });
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function isMexcFuturesOrderHistoryRow(row: Record<string, string>) {
  return Boolean(
    getRawValueByAliases(row, ["Futures Trading Pair"]) &&
      getRawValueByAliases(row, ["Direction"]) &&
      (getRawValueByAliases(row, ["Closing PNL"]) ||
        getRawValueByAliases(row, ["Average Filled Price"])),
  );
}

function getMexcPositionSide(direction: string) {
  const normalized = direction.toLowerCase();
  if (normalized.includes("long")) return "Long";
  if (normalized.includes("short")) return "Short";
  return normalizeDirectionValue(direction) ?? null;
}

function getMexcOrderAction(value: string) {
  const normalized = value.trim().toLowerCase();
  if (/\b(close|closing|reduce|reduction)\b/.test(normalized)) return "close";
  if (/\b(open|opening|increase)\b/.test(normalized)) return "open";
  return null;
}

type MexcOrderHistoryOverride = {
  entry?: string;
  exit?: string;
  netPnL?: string;
  fees?: string;
  positionSize?: string;
  direction?: string;
  notes?: string;
  skipReason?: string;
};

function buildMexcFuturesOrderHistoryOverrides(rows: Array<Record<string, string>>) {
  const overrides = new Map<number, MexcOrderHistoryOverride>();
  const looksLikeOrderHistory = rows.some(isMexcFuturesOrderHistoryRow);
  if (!looksLikeOrderHistory) return overrides;

  rows.forEach((row, index) => {
    const directionRaw = getRawValueByAliases(row, [
      "Direction",
      "Action",
      "Side",
      "Position Side",
    ]);
    const action = getMexcOrderAction(directionRaw);
    const side = getMexcPositionSide(directionRaw);
    const pnlRaw = getRawValueByAliases(row, [
      "Closing PNL",
      "Closed PNL",
      "Realized PNL",
    ]);
    const feeRaw = getRawValueByAliases(row, ["Trading Fee", "Fee"]);
    const sizeRaw =
      getRawValueByAliases(row, [
        "Filled Qty (Crypto)",
        "Filled Qty Crypto",
        "Filled Qty",
        "Filled Qty (Cont.)",
      ]) || getRawValueByAliases(row, ["Order Qty (Crypto)", "Order Qty"]);

    if (action === "open") {
      overrides.set(index, {
        skipReason:
          "Explizite MEXC-Eröffnungszeile. Sie wird ohne belastbare Positions-ID und Teilfill-Zuordnung nicht automatisch gepaart.",
        direction: side ?? undefined,
      });
      return;
    }
    if (action !== "close") {
      overrides.set(index, {
        skipReason:
          "MEXC-Zeile ohne eindeutige Open-/Close-Aktion. Manuelle Prüfung erforderlich; keine heuristische Paarung.",
        direction: side ?? undefined,
      });
      return;
    }
    if (!pnlRaw || parseTradingNumber(pnlRaw) === null) {
      overrides.set(index, {
        skipReason:
          "MEXC-Schließungszeile ohne lesbares Closing P&L. Manuelle Prüfung erforderlich.",
        direction: side ?? undefined,
      });
      return;
    }

    overrides.set(index, {
      exit:
        getRawValueByAliases(row, ["Average Filled Price", "Avg Filled Price"]) ||
        getRawValueByAliases(row, ["Order Price"]),
      netPnL: pnlRaw,
      fees: feeRaw,
      positionSize: sizeRaw,
      direction: side ?? undefined,
      notes:
        "MEXC Order History: explizite Schließungszeile einschließlich Breakeven-P&L übernommen. Keine heuristische Entry-Paarung; R bleibt ohne Stop-/Risikodaten offen.",
    });
  });

  return overrides;
}

export function buildCsvImportPreview(
  rows: Array<Record<string, string>>,
  mapping: CsvImportMapping,
  presetKey: CsvImportPresetKey = "generic",
  repairOverrides?: CsvImportRepairOverrides,
  timestampOffsetMinutes?: number | null,
): CsvImportPreviewRow[] {
  const preset = getPreset(presetKey);
  const mexcOrderOverrides =
    presetKey === "mexc-futures"
      ? buildMexcFuturesOrderHistoryOverrides(rows)
      : new Map<number, MexcOrderHistoryOverride>();
  const cTraderStatementCurrency =
    presetKey === "ctrader-history"
      ? getCTraderStatementCurrency(mapping)
      : "";
  const mappingIssues = getCsvImportMappingIssues(
    Object.keys(rows[0] ?? {}),
    mapping,
    presetKey,
  );

  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const sourceIdentity = extractCsvImportSourceIdentity(row, presetKey);
    const mexcOverride = mexcOrderOverrides.get(index);
    const mappedCurrency = getPreviewValue(
      row,
      mapping,
      "currency",
      rowNumber,
      repairOverrides,
    );
    const previewValues = {
      date: getPreviewValue(row, mapping, "date", rowNumber, repairOverrides),
      market: getPreviewValue(
        row,
        mapping,
        "market",
        rowNumber,
        repairOverrides,
      ),
      currency: mappedCurrency || cTraderStatementCurrency,
      netPnL:
        mexcOverride?.netPnL ??
        getPreviewValue(
          row,
          mapping,
          "netPnL",
          rowNumber,
          repairOverrides,
        ),
      entry:
        mexcOverride?.entry ??
        getPreviewValue(row, mapping, "entry", rowNumber, repairOverrides),
      exit:
        mexcOverride?.exit ??
        getPreviewValue(row, mapping, "exit", rowNumber, repairOverrides),
      stopLoss: getPreviewValue(
        row,
        mapping,
        "stopLoss",
        rowNumber,
        repairOverrides,
      ),
      takeProfit: getPreviewValue(
        row,
        mapping,
        "takeProfit",
        rowNumber,
        repairOverrides,
      ),
      direction:
        mexcOverride?.direction ??
        getPreviewValue(
          row,
          mapping,
          "direction",
          rowNumber,
          repairOverrides,
        ),
      setup: getPreviewValue(row, mapping, "setup", rowNumber, repairOverrides),
      session: getPreviewValue(
        row,
        mapping,
        "session",
        rowNumber,
        repairOverrides,
      ),
      tags: getPreviewValue(row, mapping, "tags", rowNumber, repairOverrides),
      notes:
        mexcOverride?.notes ??
        getPreviewValue(row, mapping, "notes", rowNumber, repairOverrides),
      fees:
        mexcOverride?.fees ??
        getPreviewValue(row, mapping, "fees", rowNumber, repairOverrides),
      positionSize:
        mexcOverride?.positionSize ??
        getPreviewValue(
          row,
          mapping,
          "positionSize",
          rowNumber,
          repairOverrides,
        ),
      instrumentType: getPreviewValue(
        row,
        mapping,
        "instrumentType",
        rowNumber,
        repairOverrides,
      ),
      leverage: getPreviewValue(
        row,
        mapping,
        "leverage",
        rowNumber,
        repairOverrides,
      ),
    };

    const sources: Record<CsvImportFieldKey, CsvImportValueSource> = {
      date: getPreviewValueSource(
        row,
        mapping,
        "date",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      market: getPreviewValueSource(
        row,
        mapping,
        "market",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      currency: getPreviewValueSource(
        row,
        mapping,
        "currency",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      netPnL: getPreviewValueSource(
        row,
        mapping,
        "netPnL",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      entry: getPreviewValueSource(
        row,
        mapping,
        "entry",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      exit: getPreviewValueSource(
        row,
        mapping,
        "exit",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      stopLoss: getPreviewValueSource(
        row,
        mapping,
        "stopLoss",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      takeProfit: getPreviewValueSource(
        row,
        mapping,
        "takeProfit",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      direction: getPreviewValueSource(
        row,
        mapping,
        "direction",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      setup: getPreviewValueSource(
        row,
        mapping,
        "setup",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      session: getPreviewValueSource(
        row,
        mapping,
        "session",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      tags: getPreviewValueSource(
        row,
        mapping,
        "tags",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      notes: getPreviewValueSource(
        row,
        mapping,
        "notes",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      fees: getPreviewValueSource(
        row,
        mapping,
        "fees",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      positionSize: getPreviewValueSource(
        row,
        mapping,
        "positionSize",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      instrumentType: getPreviewValueSource(
        row,
        mapping,
        "instrumentType",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
      leverage: getPreviewValueSource(
        row,
        mapping,
        "leverage",
        rowNumber,
        presetKey,
        repairOverrides,
      ),
    };

    if (cTraderStatementCurrency && sources.currency === "empty") {
      sources.currency = "csv";
    }

    const normalized = {
      date: normalizeDateValue(
        previewValues.date,
        timestampOffsetMinutes,
      ),
      market: previewValues.market.trim() || null,
      currency: previewValues.currency.trim().toUpperCase() || null,
      netPnL: previewValues.netPnL.trim() || null,
      entry: previewValues.entry.trim() || null,
      exit: previewValues.exit.trim() || null,
      stopLoss: previewValues.stopLoss.trim() || null,
      takeProfit: previewValues.takeProfit.trim() || null,
      direction: normalizeDirectionValue(previewValues.direction),
      setup: previewValues.setup.trim() || preset.defaultSetup || null,
      session: previewValues.session.trim() || null,
      tags: splitTagValue(previewValues.tags),
      notes: previewValues.notes.trim() || null,
      fees: normalizeImportedFeeValue(previewValues.fees, presetKey) || null,
      positionSize: previewValues.positionSize.trim() || null,
      instrumentType: normalizeInstrumentTypeValue(
        previewValues.instrumentType,
        presetKey,
      ),
      leverage: previewValues.leverage.trim() || null,
    };

    const issues: string[] = [];
    issues.push(...mappingIssues);
    if (mexcOverride?.skipReason) issues.push(mexcOverride.skipReason);
    if (!normalized.date) {
      issues.push(
        previewValues.date.trim() && timestampOffsetMinutes == null
          ? "Exportzeit enthält keine belastbare Zeitzone. Bitte den UTC-Offset des Exports ausdrücklich wählen."
          : "Datum fehlt oder ist nicht lesbar.",
      );
    }
    if (!normalized.market) issues.push("Markt / Symbol fehlt.");
    if (normalized.currency && !normalizeTradeCurrency(normalized.currency)) {
      issues.push("Kontowährung ist nicht unterstützt; erlaubt sind EUR, USD, GBP, USDT und USDC.");
    }
    if (normalized.date && normalized.market && !hasEnoughContext(normalized)) {
      issues.push("Basisdaten vorhanden, aber ohne P&L oder Preiskontext.");
    }
    if (
      preset.key === "mexc-futures" &&
      !normalized.netPnL &&
      !normalized.entry &&
      !normalized.exit
    ) {
      issues.push(
        "MEXC Futures erkannt, aber ohne P&L oder Preiswerte ist die Zeile nur halb lesbar.",
      );
    }

    if (mexcOverride?.netPnL) sources.netPnL = "csv";
    if (mexcOverride?.entry) sources.entry = "csv";
    if (mexcOverride?.exit) sources.exit = "csv";
    if (mexcOverride?.fees) sources.fees = "csv";
    if (mexcOverride?.positionSize) sources.positionSize = "csv";
    if (mexcOverride?.direction) sources.direction = "csv";

    let status: CsvImportPreviewStatus = "importable";
    if (mexcOverride?.skipReason || mappingIssues.length) status = "skip";
    else if (!normalized.date || !normalized.market || (normalized.currency !== null && !normalizeTradeCurrency(normalized.currency))) status = "skip";
    else if (!hasEnoughContext(normalized)) status = "check";

    const trust = buildImportTrust({
      normalized,
      sources,
      issues,
      presetKey,
      skipped: status === "skip",
    });

    return {
      rowNumber,
      raw: row,
      sourceIdentity,
      normalized,
      sources,
      fieldHeaders: buildFieldHeaderMap(mapping),
      warnings: trust.warnings,
      trustScore: trust.trustScore,
      trustLabel: trust.trustLabel,
      issues,
      status,
    };
  });
}

export function buildCsvImportDrafts(
  previewRows: CsvImportPreviewRow[],
  options?: { includeCheckRows?: boolean; presetKey?: CsvImportPresetKey },
) {
  const includeCheckRows = options?.includeCheckRows ?? true;
  const preset = getPreset(options?.presetKey);

  return previewRows
    .filter(
      (row) =>
        row.status === "importable" ||
        (includeCheckRows && row.status === "check"),
    )
    .map<CsvImportDraft>((row) => ({
      rowNumber: row.rowNumber,
      sourceIdentity: row.sourceIdentity,
      fieldSources: row.sources,
      fieldHeaders: row.fieldHeaders,
      importWarnings: row.warnings,
      importTrustScore: row.trustScore,
      importTrustLabel: row.trustLabel,
      date: row.normalized.date ?? new Date().toISOString(),
      market: row.normalized.market ?? "Unbekannt",
      currency: row.normalized.currency,
      netPnL: row.normalized.netPnL,
      entry: row.normalized.entry,
      exit: row.normalized.exit,
      stopLoss: row.normalized.stopLoss,
      takeProfit: row.normalized.takeProfit,
      direction: row.normalized.direction,
      setup: row.normalized.setup ?? preset.defaultSetup,
      session: row.normalized.session,
      tags: row.normalized.tags,
      notes: row.normalized.notes,
      fees: row.normalized.fees,
      positionSize: row.normalized.positionSize,
      instrumentType:
        row.normalized.instrumentType ?? preset.defaultInstrumentType ?? null,
      leverage: row.normalized.leverage,
      importPreset: preset.key,
    }));
}

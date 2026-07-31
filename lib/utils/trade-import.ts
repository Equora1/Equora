import { normalizeTradeDate } from "@/lib/utils/calendar";
import { normalizeInstrumentType, parseTradingNumber } from "@/lib/utils/calculations";

export type CsvImportFieldKey =
  | "date"
  | "market"
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
  | "kraken-spot";

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
  aliasOverrides?: Partial<Record<CsvImportFieldKey, string[]>>;
};

export type ParsedCsvData = {
  delimiter: string;
  headers: string[];
  rows: Array<Record<string, string>>;
};

export type CsvImportPreviewStatus = "importable" | "check" | "skip";

export type CsvImportValueSource = "csv" | "preset" | "manual" | "empty";

export type CsvImportPreviewRow = {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: {
    date: string | null;
    market: string | null;
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
  fieldSources?: Partial<Record<CsvImportFieldKey, CsvImportValueSource>>;
  fieldHeaders?: Partial<Record<CsvImportFieldKey, string>>;
  importWarnings?: string[];
  importTrustScore?: number;
  importTrustLabel?: string;
  date: string;
  market: string;
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
    defaultBrokerProfile: "manual",
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
    defaultBrokerProfile: "binance",
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
    defaultBrokerProfile: "bybit",
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
    defaultBrokerProfile: "okx",
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

function parseCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, "").trim());
}

function detectDelimiter(text: string) {
  const probeLine =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";

  const delimiters = [",", ";", "\t", "|"];
  const scores = delimiters.map((delimiter) => ({
    delimiter,
    count: probeLine.split(delimiter).length,
  }));
  scores.sort((left, right) => right.count - left.count);
  return scores[0]?.count && scores[0].count > 1 ? scores[0].delimiter : ",";
}

export function parseCsvText(text: string): ParsedCsvData {
  const sanitized = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(sanitized);
  const lines = sanitized
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (!lines.length) {
    return { delimiter, headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line, delimiter);
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

function getAliasesForField(
  field: CsvImportFieldKey,
  presetKey: CsvImportPresetKey | null | undefined,
) {
  const preset = getPreset(presetKey);
  return [...(preset.aliasOverrides?.[field] ?? []), ...fieldAliases[field]];
}

function findHeaderMatch(headers: string[], aliases: string[]) {
  return headers.find((header) => {
    const normalized = normalizeHeader(header);
    return aliases.some((alias) => {
      const normalizedAlias = normalizeHeader(alias);
      return (
        normalized === normalizedAlias || normalized.includes(normalizedAlias)
      );
    });
  });
}

export function inferCsvImportMapping(
  headers: string[],
  presetKey: CsvImportPresetKey = "generic",
): CsvImportMapping {
  const mapping: CsvImportMapping = {};

  for (const definition of csvImportFieldDefinitions) {
    const match = findHeaderMatch(
      headers,
      getAliasesForField(definition.key, presetKey),
    );
    if (match) mapping[definition.key] = match;
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

function normalizeDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const unixSeconds = trimmed.match(/^\d{10}$/);
  if (unixSeconds) return new Date(Number(trimmed) * 1000).toISOString();

  const unixMilliseconds = trimmed.match(/^\d{13}$/);
  if (unixMilliseconds) return new Date(Number(trimmed)).toISOString();

  const numericDate = trimmed.match(
    /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (numericDate) {
    const day = Number(numericDate[1]);
    const month = Number(numericDate[2]) - 1;
    const year = Number(
      numericDate[3].length === 2 ? `20${numericDate[3]}` : numericDate[3],
    );
    const hour = Number(numericDate[4] ?? 0);
    const minute = Number(numericDate[5] ?? 0);
    const second = Number(numericDate[6] ?? 0);
    const date = new Date(year, month, day, hour, minute, second);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const direct = new Date(trimmed.replace(" UTC", "Z"));
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  const monthNameDate = trimmed.match(/^\d{1,2}\s+[A-Za-zÄÖÜäöüß.]+\s+\d{4}$/);
  if (monthNameDate) {
    const normalized = normalizeTradeDate(trimmed);
    if (!Number.isNaN(normalized.getTime())) return normalized.toISOString();
  }

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

  const parsedRows = rows
    .map((row, index) => {
      const dateRaw = getRawValueByAliases(row, ["Time(UTC+02:00)", "Time", "Created Time", "Trade Time"]);
      const date = normalizeDateValue(dateRaw);
      const market = getRawValueByAliases(row, ["Futures Trading Pair", "Trading Pair", "Symbol", "Contract"]);
      const directionRaw = getRawValueByAliases(row, ["Direction", "Side", "Position Side"]);
      const side = getMexcPositionSide(directionRaw);
      const averageFilledPrice = getRawValueByAliases(row, ["Average Filled Price", "Avg Filled Price"]);
      const orderPrice = getRawValueByAliases(row, ["Order Price"]);
      const pnlRaw = getRawValueByAliases(row, ["Closing PNL", "Closed PNL", "Realized PNL"]);
      const feeRaw = getRawValueByAliases(row, ["Trading Fee", "Fee"]);
      const sizeRaw =
        getRawValueByAliases(row, ["Filled Qty (Crypto)", "Filled Qty Crypto", "Filled Qty", "Filled Qty (Cont.)"]) ||
        getRawValueByAliases(row, ["Order Qty (Crypto)", "Order Qty"]);
      const pnl = parseTradingNumber(pnlRaw);
      const fee = parseTradingNumber(feeRaw);
      return {
        row,
        index,
        date,
        timestamp: date ? new Date(date).getTime() : 0,
        market,
        directionRaw,
        side,
        averageFilledPrice,
        orderPrice,
        pnlRaw,
        pnl,
        feeRaw,
        fee,
        sizeRaw,
      };
    })
    .filter((row) => row.date && row.market && row.side)
    .sort((left, right) => left.timestamp - right.timestamp);

  const openLegs = new Map<string, typeof parsedRows>();

  for (const row of parsedRows) {
    const key = `${row.market.toLowerCase()}|${row.side}`;
    const hasClosingPnL = row.pnl !== null && Math.abs(row.pnl) > 0.00000001;

    if (!hasClosingPnL) {
      const current = openLegs.get(key) ?? [];
      current.push(row);
      openLegs.set(key, current);
      overrides.set(row.index, {
        skipReason: "Order-Zeile ohne Closing P&L. Wird nicht als eigener Trade importiert.",
        direction: row.side ?? undefined,
        fees: row.feeRaw,
        positionSize: row.sizeRaw,
      });
      continue;
    }

    const current = openLegs.get(key) ?? [];
    const openingLeg = current.pop();
    openLegs.set(key, current);
    const openingFee = openingLeg?.fee ?? 0;
    const closingFee = row.fee ?? 0;
    const totalFees = openingFee || closingFee ? String(Number((openingFee + closingFee).toFixed(12))) : row.feeRaw;
    const entry = openingLeg?.averageFilledPrice || openingLeg?.orderPrice || "";
    const exit = row.averageFilledPrice || row.orderPrice || "";
    overrides.set(row.index, {
      entry,
      exit,
      netPnL: row.pnlRaw,
      fees: totalFees,
      positionSize: row.sizeRaw,
      direction: row.side ?? undefined,
      notes: openingLeg
        ? "MEXC Order History: Entry aus passender Eröffnungsorder übernommen. R bleibt offen, weil kein Stop/Risiko im Export steht."
        : "MEXC Order History: Closing P&L übernommen. R bleibt offen, weil kein Stop/Risiko im Export steht.",
    });
  }

  return overrides;
}

export function buildCsvImportPreview(
  rows: Array<Record<string, string>>,
  mapping: CsvImportMapping,
  presetKey: CsvImportPresetKey = "generic",
  repairOverrides?: CsvImportRepairOverrides,
): CsvImportPreviewRow[] {
  const preset = getPreset(presetKey);
  const mexcOrderOverrides =
    presetKey === "mexc-futures"
      ? buildMexcFuturesOrderHistoryOverrides(rows)
      : new Map<number, MexcOrderHistoryOverride>();

  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const mexcOverride = mexcOrderOverrides.get(index);
    const previewValues = {
      date: getPreviewValue(row, mapping, "date", rowNumber, repairOverrides),
      market: getPreviewValue(
        row,
        mapping,
        "market",
        rowNumber,
        repairOverrides,
      ),
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

    const normalized = {
      date: normalizeDateValue(previewValues.date),
      market: previewValues.market.trim() || null,
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
      fees: previewValues.fees.trim() || null,
      positionSize: previewValues.positionSize.trim() || null,
      instrumentType: normalizeInstrumentTypeValue(
        previewValues.instrumentType,
        presetKey,
      ),
      leverage: previewValues.leverage.trim() || null,
    };

    const issues: string[] = [];
    if (mexcOverride?.skipReason) issues.push(mexcOverride.skipReason);
    if (!normalized.date) issues.push("Datum fehlt oder ist nicht lesbar.");
    if (!normalized.market) issues.push("Markt / Symbol fehlt.");
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
    if (mexcOverride?.skipReason) status = "skip";
    else if (!normalized.date || !normalized.market) status = "skip";
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
      fieldSources: row.sources,
      fieldHeaders: row.fieldHeaders,
      importWarnings: row.warnings,
      importTrustScore: row.trustScore,
      importTrustLabel: row.trustLabel,
      date: row.normalized.date ?? new Date().toISOString(),
      market: row.normalized.market ?? "Unbekannt",
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

import {
  csvImportPresets,
  getCsvImportPresetMeta,
  inferCsvImportMapping,
  type CsvImportFieldKey,
  type CsvImportPresetKey,
} from "@/lib/utils/trade-import";

export const BROKER_IMPORT_PROFILE_CONTRACT_VERSION =
  "equora-broker-import-profile-v1" as const;

export type BrokerImportConnectorKind =
  | "file_upload"
  | "platform_sync"
  | "direct_api"
  | "aggregator";

export type BrokerImportDetectionConfidence = "high" | "low" | "none";

export type BrokerImportRuntimeDefaults = Readonly<{
  noteLead: string;
  presetLabel: string;
  setup: string;
  brokerProfile: string;
  costProfile: string;
  instrumentType: string;
  cryptoMarketType: string;
  accountTemplate: string;
  marketTemplate: string;
  accountCurrency: string | null;
}>;

export type BrokerImportProfile = Readonly<{
  profileContractVersion: typeof BROKER_IMPORT_PROFILE_CONTRACT_VERSION;
  presetKey: CsvImportPresetKey;
  label: string;
  badge: string;
  connectorKind: BrokerImportConnectorKind;
  runtimeDefaults: BrokerImportRuntimeDefaults;
}>;

export type BrokerImportDetection = Readonly<{
  presetKey: CsvImportPresetKey;
  confidence: BrokerImportDetectionConfidence;
  score: number;
  matchedSignals: readonly string[];
  competingPresetKey: CsvImportPresetKey | null;
}>;

type DetectionSignal = Readonly<{
  label: string;
  anyOf: readonly string[];
  weight: number;
}>;

type DetectionProfile = Readonly<{
  fileNameHints: readonly string[];
  fileNameWeight: number;
  minimumScore: number;
  signals: readonly DetectionSignal[];
}>;

const GENERIC_PRESET_KEY: CsvImportPresetKey = "generic";

const detectionProfiles: Readonly<
  Record<Exclude<CsvImportPresetKey, "generic">, DetectionProfile>
> = Object.freeze({
  "metatrader4-history": Object.freeze({
    fileNameHints: Object.freeze([
      "metatrader",
      "mt4",
      "account history",
      "statement",
    ]),
    fileNameWeight: 20,
    minimumScore: 70,
    signals: Object.freeze([
      Object.freeze({
        label: "MT4 Ticket",
        anyOf: Object.freeze(["ticket"]),
        weight: 25,
      }),
      Object.freeze({
        label: "MT4 Open/Close Time",
        anyOf: Object.freeze(["open time", "close time"]),
        weight: 20,
      }),
      Object.freeze({
        label: "MT4 Open/Close Price",
        anyOf: Object.freeze(["open price", "close price"]),
        weight: 20,
      }),
      Object.freeze({
        label: "MT4 Result Components",
        anyOf: Object.freeze(["commission", "taxes", "swap", "profit"]),
        weight: 25,
      }),
    ]),
  }),
  "ctrader-history": Object.freeze({
    fileNameHints: Object.freeze(["ctrader", "statement", "deal history"]),
    fileNameWeight: 20,
    minimumScore: 65,
    signals: Object.freeze([
      Object.freeze({
        label: "Deal identifiers",
        anyOf: Object.freeze(["deal id", "order id"]),
        weight: 20,
      }),
      Object.freeze({
        label: "Opening and closing time",
        anyOf: Object.freeze(["opening time", "closing time"]),
        weight: 25,
      }),
      Object.freeze({
        label: "Entry and closing price",
        anyOf: Object.freeze(["entry price", "closing price"]),
        weight: 25,
      }),
      Object.freeze({
        label: "Net result",
        anyOf: Object.freeze(["net currency", "net realized", "net realised", "net"]),
        weight: 20,
      }),
      Object.freeze({
        label: "Opening direction",
        anyOf: Object.freeze(["opening direction"]),
        weight: 15,
      }),
    ]),
  }),
  "mexc-futures": Object.freeze({
    fileNameHints: Object.freeze(["mexc", "futures", "contract"]),
    fileNameWeight: 20,
    minimumScore: 55,
    signals: Object.freeze([
      Object.freeze({
        label: "Futures Trading Pair",
        anyOf: Object.freeze(["futures trading pair"]),
        weight: 40,
      }),
      Object.freeze({
        label: "Closing PNL",
        anyOf: Object.freeze(["closing pnl", "average filled price"]),
        weight: 30,
      }),
      Object.freeze({
        label: "Filled quantity",
        anyOf: Object.freeze([
          "filled qty crypto",
          "filled qty cont",
          "order qty crypto",
        ]),
        weight: 20,
      }),
    ]),
  }),
  "mexc-spot": Object.freeze({
    fileNameHints: Object.freeze(["mexc", "spot"]),
    fileNameWeight: 35,
    minimumScore: 65,
    signals: Object.freeze([
      Object.freeze({
        label: "Spot pair",
        anyOf: Object.freeze(["trading pair", "pair", "symbol"]),
        weight: 15,
      }),
      Object.freeze({
        label: "Filled amount",
        anyOf: Object.freeze(["filled amount", "filled qty"]),
        weight: 20,
      }),
      Object.freeze({
        label: "Trade fee",
        anyOf: Object.freeze(["trading fee", "fee"]),
        weight: 10,
      }),
    ]),
  }),
  "binance-futures": Object.freeze({
    fileNameHints: Object.freeze(["binance", "futures", "usd-m"]),
    fileNameWeight: 20,
    minimumScore: 55,
    signals: Object.freeze([
      Object.freeze({
        label: "Realized Profit",
        anyOf: Object.freeze(["realized profit"]),
        weight: 40,
      }),
      Object.freeze({
        label: "Commission Asset",
        anyOf: Object.freeze(["commission asset"]),
        weight: 25,
      }),
      Object.freeze({
        label: "Position Side",
        anyOf: Object.freeze(["position side"]),
        weight: 20,
      }),
    ]),
  }),
  "bybit-futures": Object.freeze({
    fileNameHints: Object.freeze(["bybit", "closed pnl", "derivatives"]),
    fileNameWeight: 20,
    minimumScore: 55,
    signals: Object.freeze([
      Object.freeze({
        label: "Closed PnL",
        anyOf: Object.freeze(["closed pnl"]),
        weight: 40,
      }),
      Object.freeze({
        label: "Order number",
        anyOf: Object.freeze(["order no", "order id"]),
        weight: 20,
      }),
      Object.freeze({
        label: "Trading fee",
        anyOf: Object.freeze(["trading fee", "exec fee"]),
        weight: 20,
      }),
    ]),
  }),
  "okx-futures": Object.freeze({
    fileNameHints: Object.freeze(["okx", "swap", "futures"]),
    fileNameWeight: 20,
    minimumScore: 55,
    signals: Object.freeze([
      Object.freeze({
        label: "InstId",
        anyOf: Object.freeze(["instid", "inst id"]),
        weight: 40,
      }),
      Object.freeze({
        label: "PosSide",
        anyOf: Object.freeze(["posside", "pos side"]),
        weight: 25,
      }),
      Object.freeze({
        label: "Fill fields",
        anyOf: Object.freeze(["fill px", "fill sz", "fill time"]),
        weight: 20,
      }),
    ]),
  }),
  "kraken-spot": Object.freeze({
    fileNameHints: Object.freeze(["kraken", "ledger", "trades"]),
    fileNameWeight: 20,
    minimumScore: 55,
    signals: Object.freeze([
      Object.freeze({
        label: "Transaction ID",
        anyOf: Object.freeze(["txid"]),
        weight: 35,
      }),
      Object.freeze({
        label: "Order transaction ID",
        anyOf: Object.freeze(["ordertxid", "order txid"]),
        weight: 30,
      }),
      Object.freeze({
        label: "Kraken volume",
        anyOf: Object.freeze(["vol", "volume"]),
        weight: 15,
      }),
    ]),
  }),
});

function normalizeDetectionValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getRuntimeDefaults(presetKey: CsvImportPresetKey): BrokerImportRuntimeDefaults {
  const preset = getCsvImportPresetMeta(presetKey);
  const instrumentType =
    preset.defaultInstrumentType?.trim().toLowerCase() || "unknown";
  const cryptoMarketType = preset.defaultCryptoMarketType?.trim() || "manual";
  const isCrypto = instrumentType === "crypto";
  const isSpot = cryptoMarketType === "spot";

  return Object.freeze({
    noteLead:
      presetKey === GENERIC_PRESET_KEY
        ? "Importiert aus CSV"
        : presetKey === "metatrader4-history"
          ? "Importiert aus MetaTrader 4 HTML-Bericht"
          : "Importiert aus " + preset.label + " CSV",
    presetLabel: preset.label,
    setup: preset.defaultSetup,
    brokerProfile: preset.defaultBrokerProfile?.trim() || "manual",
    costProfile: isCrypto ? (isSpot ? "crypto-spot" : "crypto-perps") : "manual",
    instrumentType,
    cryptoMarketType,
    accountTemplate: isCrypto
      ? isSpot
        ? "crypto-spot"
        : "crypto-perps"
      : "manual",
    marketTemplate: "manual",
    accountCurrency: isCrypto ? "USDT" : null,
  });
}

export const brokerImportProfiles: readonly BrokerImportProfile[] = Object.freeze(
  csvImportPresets.map((preset) =>
    Object.freeze({
      profileContractVersion: BROKER_IMPORT_PROFILE_CONTRACT_VERSION,
      presetKey: preset.key,
      label: preset.label,
      badge: preset.badge,
      connectorKind: "file_upload" as const,
      runtimeDefaults: getRuntimeDefaults(preset.key),
    }),
  ),
);

const presetKeys = new Set<CsvImportPresetKey>(
  brokerImportProfiles.map((profile) => profile.presetKey),
);

export function isCsvImportPresetKey(value: unknown): value is CsvImportPresetKey {
  return typeof value === "string" && presetKeys.has(value as CsvImportPresetKey);
}

export function getBrokerImportProfile(
  presetKey: CsvImportPresetKey | string | null | undefined,
) {
  const normalized = isCsvImportPresetKey(presetKey)
    ? presetKey
    : GENERIC_PRESET_KEY;
  return (
    brokerImportProfiles.find((profile) => profile.presetKey === normalized) ??
    brokerImportProfiles[0]
  );
}

export function getBrokerImportRuntimeDefaults(
  presetKey: CsvImportPresetKey | string | null | undefined,
) {
  return getBrokerImportProfile(presetKey).runtimeDefaults;
}

function containsSignal(values: readonly string[], candidates: readonly string[]) {
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeDetectionValue(candidate);
    return values.some(
      (value) =>
        value === normalizedCandidate ||
        value.includes(normalizedCandidate),
    );
  });
}

function scoreDetectionProfile(
  presetKey: Exclude<CsvImportPresetKey, "generic">,
  headers: readonly string[],
  fileName: string,
) {
  const profile = detectionProfiles[presetKey];
  const normalizedHeaders = headers.map(normalizeDetectionValue).filter(Boolean);
  const normalizedFileName = normalizeDetectionValue(fileName);
  const matchedSignals: string[] = [];
  let score = 0;

  if (
    normalizedFileName &&
    profile.fileNameHints.some((hint) =>
      normalizedFileName.includes(normalizeDetectionValue(hint)),
    )
  ) {
    score += profile.fileNameWeight;
    matchedSignals.push("Dateiname");
  }

  for (const signal of profile.signals) {
    if (!containsSignal(normalizedHeaders, signal.anyOf)) continue;
    score += signal.weight;
    matchedSignals.push(signal.label);
  }

  const mapping = inferCsvImportMapping([...headers], presetKey);
  const mappedFields = Object.keys(mapping) as CsvImportFieldKey[];
  if (mappedFields.includes("date") && mappedFields.includes("market")) {
    score += 5;
  }

  return Object.freeze({
    presetKey,
    score: Math.min(100, score),
    minimumScore: profile.minimumScore,
    matchedSignals: Object.freeze(matchedSignals),
  });
}

export function detectBrokerImportProfile(
  headers: readonly string[],
  fileName = "",
): BrokerImportDetection {
  if (!headers.length) {
    return Object.freeze({
      presetKey: GENERIC_PRESET_KEY,
      confidence: "none" as const,
      score: 0,
      matchedSignals: Object.freeze([]),
      competingPresetKey: null,
    });
  }

  const scored = (
    Object.keys(detectionProfiles) as Array<
      Exclude<CsvImportPresetKey, "generic">
    >
  )
    .map((presetKey) => scoreDetectionProfile(presetKey, headers, fileName))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.presetKey.localeCompare(right.presetKey),
    );
  const best = scored[0];
  const second = scored[1];

  if (!best || best.score < 35) {
    return Object.freeze({
      presetKey: GENERIC_PRESET_KEY,
      confidence: "none" as const,
      score: best?.score ?? 0,
      matchedSignals: best?.matchedSignals ?? Object.freeze([]),
      competingPresetKey: second?.presetKey ?? null,
    });
  }

  const margin = best.score - (second?.score ?? 0);
  const confidence: BrokerImportDetectionConfidence =
    best.score >= best.minimumScore && margin >= 10 ? "high" : "low";

  return Object.freeze({
    presetKey: best.presetKey,
    confidence,
    score: best.score,
    matchedSignals: best.matchedSignals,
    competingPresetKey: second?.presetKey ?? null,
  });
}

import type { CsvImportPresetKey } from "@/lib/utils/trade-import";
import type { BrokerImportConnectorKind } from "@/lib/utils/broker-import-kit";
import { brokerFileImportCapability } from "@/lib/utils/broker-file-import-capability";

export const BROKER_CATALOG_CONTRACT_VERSION =
  "equora-broker-catalog-v1" as const;

export type BrokerPlatformFamilyKey =
  | "generic_csv"
  | "mexc_exchange"
  | "binance_exchange"
  | "bybit_exchange"
  | "okx_exchange"
  | "kraken_exchange"
  | "metatrader"
  | "metatrader5"
  | "ctrader"
  | "dxtrade";

export type BrokerConnectorKind = BrokerImportConnectorKind;

export type BrokerConnectorAvailability =
  | "available"
  | "controlled_candidate"
  | "planned";

export type BrokerCatalogEntryKind = "broker" | "platform" | "fallback";

export type BrokerCatalogMethod = Readonly<{
  connectorKind: BrokerConnectorKind;
  availability: BrokerConnectorAvailability;
  profileKeys: readonly CsvImportPresetKey[];
}>;

export type BrokerPlatformFamily = Readonly<{
  contractVersion: typeof BROKER_CATALOG_CONTRACT_VERSION;
  familyKey: BrokerPlatformFamilyKey;
  label: string;
  availability: BrokerConnectorAvailability;
  sharedAcrossBrokers: boolean;
  connectorKinds: readonly BrokerConnectorKind[];
  profileKeys: readonly CsvImportPresetKey[];
}>;

export type BrokerCatalogEntry = Readonly<{
  contractVersion: typeof BROKER_CATALOG_CONTRACT_VERSION;
  brokerCode: string;
  displayName: string;
  platformFamilyKey: BrokerPlatformFamilyKey;
  aliases: readonly string[];
  markets: readonly string[];
  methods: readonly BrokerCatalogMethod[];
  supportNote: string;
  entryKind: BrokerCatalogEntryKind;
}>;

function freezeMethod(
  method: Omit<BrokerCatalogMethod, "profileKeys"> & {
    profileKeys: readonly CsvImportPresetKey[];
  },
): BrokerCatalogMethod {
  return Object.freeze({
    ...method,
    profileKeys: Object.freeze([...method.profileKeys]),
  });
}

function freezeFamily(
  family: Omit<BrokerPlatformFamily, "contractVersion" | "connectorKinds" | "profileKeys"> & {
    connectorKinds: readonly BrokerConnectorKind[];
    profileKeys: readonly CsvImportPresetKey[];
  },
): BrokerPlatformFamily {
  return Object.freeze({
    ...family,
    contractVersion: BROKER_CATALOG_CONTRACT_VERSION,
    connectorKinds: Object.freeze([...family.connectorKinds]),
    profileKeys: Object.freeze([...family.profileKeys]),
  });
}

function freezeBroker(
  broker: Omit<BrokerCatalogEntry, "contractVersion" | "aliases" | "markets" | "methods"> & {
    aliases: readonly string[];
    markets: readonly string[];
    methods: readonly BrokerCatalogMethod[];
  },
): BrokerCatalogEntry {
  return Object.freeze({
    ...broker,
    contractVersion: BROKER_CATALOG_CONTRACT_VERSION,
    aliases: Object.freeze([...broker.aliases]),
    markets: Object.freeze([...broker.markets]),
    methods: Object.freeze(broker.methods.map(freezeMethod)),
  });
}

export const brokerPlatformFamilies: readonly BrokerPlatformFamily[] =
  Object.freeze([
    freezeFamily({
      familyKey: "generic_csv",
      label: "Equora Generic CSV",
      availability: brokerFileImportCapability.catalogAvailability,
      sharedAcrossBrokers: true,
      connectorKinds: ["file_upload"],
      profileKeys: ["generic"],
    }),
    freezeFamily({
      familyKey: "mexc_exchange",
      label: "MEXC Export",
      availability: brokerFileImportCapability.catalogAvailability,
      sharedAcrossBrokers: false,
      connectorKinds: ["file_upload", "direct_api"],
      profileKeys: ["mexc-futures", "mexc-spot"],
    }),
    freezeFamily({
      familyKey: "binance_exchange",
      label: "Binance Export",
      availability: brokerFileImportCapability.catalogAvailability,
      sharedAcrossBrokers: false,
      connectorKinds: ["file_upload"],
      profileKeys: ["binance-futures"],
    }),
    freezeFamily({
      familyKey: "bybit_exchange",
      label: "Bybit Export",
      availability: brokerFileImportCapability.catalogAvailability,
      sharedAcrossBrokers: false,
      connectorKinds: ["file_upload"],
      profileKeys: ["bybit-futures"],
    }),
    freezeFamily({
      familyKey: "okx_exchange",
      label: "OKX Export",
      availability: brokerFileImportCapability.catalogAvailability,
      sharedAcrossBrokers: false,
      connectorKinds: ["file_upload", "direct_api"],
      profileKeys: ["okx-futures"],
    }),
    freezeFamily({
      familyKey: "kraken_exchange",
      label: "Kraken Export",
      availability: brokerFileImportCapability.catalogAvailability,
      sharedAcrossBrokers: false,
      connectorKinds: ["file_upload"],
      profileKeys: ["kraken-spot"],
    }),
    freezeFamily({
      familyKey: "metatrader",
      label: "MetaTrader 4",
      availability: brokerFileImportCapability.catalogAvailability,
      sharedAcrossBrokers: true,
      connectorKinds: ["file_upload", "platform_sync"],
      profileKeys: ["metatrader4-history"],
    }),
    freezeFamily({
      familyKey: "metatrader5",
      label: "MetaTrader 5",
      availability: "planned",
      sharedAcrossBrokers: true,
      connectorKinds: ["file_upload", "platform_sync"],
      profileKeys: [],
    }),
    freezeFamily({
      familyKey: "ctrader",
      label: "cTrader",
      availability: brokerFileImportCapability.catalogAvailability,
      sharedAcrossBrokers: true,
      connectorKinds: ["file_upload", "platform_sync"],
      profileKeys: ["ctrader-history"],
    }),
    freezeFamily({
      familyKey: "dxtrade",
      label: "DXtrade",
      availability: "planned",
      sharedAcrossBrokers: true,
      connectorKinds: ["file_upload", "platform_sync"],
      profileKeys: [],
    }),
  ]);

export const brokerCatalog: readonly BrokerCatalogEntry[] = Object.freeze([
  freezeBroker({
    brokerCode: "mexc",
    displayName: "MEXC",
    platformFamilyKey: "mexc_exchange",
    aliases: ["mexc global"],
    markets: ["Crypto Spot", "Crypto Futures"],
    methods: [
      {
        connectorKind: "file_upload",
        availability: brokerFileImportCapability.catalogAvailability,
        profileKeys: ["mexc-futures", "mexc-spot"],
      },
      {
        connectorKind: "direct_api",
        availability: "controlled_candidate",
        profileKeys: [],
      },
    ],
    supportNote:
      `Dateiprofile gebaut. ${brokerFileImportCapability.blockedReason} Die Read-only-Runtime bleibt separat freigabepflichtig.`,
    entryKind: "broker",
  }),
  freezeBroker({
    brokerCode: "binance",
    displayName: "Binance",
    platformFamilyKey: "binance_exchange",
    aliases: ["binance futures", "binance usd-m"],
    markets: ["Crypto Futures"],
    methods: [
      {
        connectorKind: "file_upload",
        availability: brokerFileImportCapability.catalogAvailability,
        profileKeys: ["binance-futures"],
      },
    ],
    supportNote:
      `Dateiprofil mit eigener Exporterkennung gebaut. ${brokerFileImportCapability.blockedReason}`,
    entryKind: "broker",
  }),
  freezeBroker({
    brokerCode: "bybit",
    displayName: "Bybit",
    platformFamilyKey: "bybit_exchange",
    aliases: ["bybit derivatives", "bybit futures"],
    markets: ["Crypto Futures"],
    methods: [
      {
        connectorKind: "file_upload",
        availability: brokerFileImportCapability.catalogAvailability,
        profileKeys: ["bybit-futures"],
      },
    ],
    supportNote:
      `Dateiprofil mit eigener Exporterkennung gebaut. ${brokerFileImportCapability.blockedReason}`,
    entryKind: "broker",
  }),
  freezeBroker({
    brokerCode: "okx",
    displayName: "OKX",
    platformFamilyKey: "okx_exchange",
    aliases: ["okex", "okx swap", "okx futures"],
    markets: ["Crypto Futures"],
    methods: [
      {
        connectorKind: "file_upload",
        availability: brokerFileImportCapability.catalogAvailability,
        profileKeys: ["okx-futures"],
      },
      {
        connectorKind: "direct_api",
        availability: "controlled_candidate",
        profileKeys: [],
      },
    ],
    supportNote:
      `Dateiprofil gebaut. ${brokerFileImportCapability.blockedReason} Die direkte Read-only-Anbindung bleibt ein kontrollierter Kandidat.`,
    entryKind: "broker",
  }),
  freezeBroker({
    brokerCode: "kraken",
    displayName: "Kraken",
    platformFamilyKey: "kraken_exchange",
    aliases: ["kraken pro", "kraken spot"],
    markets: ["Crypto Spot"],
    methods: [
      {
        connectorKind: "file_upload",
        availability: brokerFileImportCapability.catalogAvailability,
        profileKeys: ["kraken-spot"],
      },
    ],
    supportNote:
      `Dateiprofil mit eigener Exporterkennung gebaut. ${brokerFileImportCapability.blockedReason}`,
    entryKind: "broker",
  }),
  freezeBroker({
    brokerCode: "metatrader4_platform",
    displayName: "MetaTrader 4 Broker",
    platformFamilyKey: "metatrader",
    aliases: ["metatrader", "mt4", "metatrader 4", "mt4 statement"],
    markets: ["Brokerabhängige Märkte"],
    methods: [
      {
        connectorKind: "file_upload",
        availability: brokerFileImportCapability.catalogAvailability,
        profileKeys: ["metatrader4-history"],
      },
      {
        connectorKind: "platform_sync",
        availability: "planned",
        profileKeys: [],
      },
    ],
    supportNote:
      `MT4-HTML-Kontohistorienprofil gebaut. ${brokerFileImportCapability.blockedReason} MT5 und direkter Plattform-Sync bleiben separat geplant.`,
    entryKind: "platform",
  }),
  freezeBroker({
    brokerCode: "ctrader_platform",
    displayName: "cTrader Broker",
    platformFamilyKey: "ctrader",
    aliases: ["ctrader", "spotware", "ctrader statement"],
    markets: ["Brokerabhängige Märkte"],
    methods: [
      {
        connectorKind: "file_upload",
        availability: brokerFileImportCapability.catalogAvailability,
        profileKeys: ["ctrader-history"],
      },
      {
        connectorKind: "platform_sync",
        availability: "planned",
        profileKeys: [],
      },
    ],
    supportNote:
      `cTrader-Statement-Profil gebaut. ${brokerFileImportCapability.blockedReason} Direkter Plattform-Sync bleibt geplant.`,
    entryKind: "platform",
  }),
  freezeBroker({
    brokerCode: "generic_csv",
    displayName: "Weitere Broker",
    platformFamilyKey: "generic_csv",
    aliases: ["anderer broker", "generic", "csv", "manuelles mapping"],
    markets: ["Aktien", "Optionen", "Futures", "Forex", "Crypto"],
    methods: [
      {
        connectorKind: "file_upload",
        availability: brokerFileImportCapability.catalogAvailability,
        profileKeys: ["generic"],
      },
    ],
    supportNote:
      `Allgemeines CSV-Mapping gebaut. ${brokerFileImportCapability.blockedReason} Keine Direktintegration wird behauptet.`,
    entryKind: "fallback",
  }),
]);

const familyLookup: ReadonlyMap<string, BrokerPlatformFamily> = new Map(
  brokerPlatformFamilies.map((family) => [family.familyKey, family]),
);

const brokerLookup = new Map(
  brokerCatalog.map((broker) => [broker.brokerCode, broker]),
);

function normalizeCatalogValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getBrokerPlatformFamily(
  familyKey: BrokerPlatformFamilyKey | string | null | undefined,
) {
  return typeof familyKey === "string" ? familyLookup.get(familyKey) ?? null : null;
}

export function getBrokerCatalogEntry(
  brokerCode: string | null | undefined,
) {
  return typeof brokerCode === "string" ? brokerLookup.get(brokerCode) ?? null : null;
}

export function findBrokerCatalogEntries(query = "") {
  const needle = normalizeCatalogValue(query);
  if (!needle) return brokerCatalog;

  return Object.freeze(
    brokerCatalog.filter((broker) => {
      const family = familyLookup.get(broker.platformFamilyKey);
      const values = [
        broker.displayName,
        broker.brokerCode,
        family?.label ?? "",
        ...broker.aliases,
        ...broker.markets,
      ].map(normalizeCatalogValue);
      return values.some((value) => value.includes(needle));
    }),
  );
}

export function getBrokerFileProfileKeys(
  brokerCode: string | null | undefined,
) {
  const broker = getBrokerCatalogEntry(brokerCode);
  if (!broker) return Object.freeze([]) as readonly CsvImportPresetKey[];

  return Object.freeze(
    broker.methods
      .filter(
        (method) =>
          method.connectorKind === "file_upload" &&
          method.availability !== "planned",
      )
      .flatMap((method) => method.profileKeys),
  );
}

const builtFileProfileKeys = new Set(
  brokerCatalog.flatMap((broker) => getBrokerFileProfileKeys(broker.brokerCode)),
);
const availableFileProfileKeys = new Set(
  brokerCatalog.flatMap((broker) =>
    broker.methods
      .filter(
        (method) =>
          method.connectorKind === "file_upload" &&
          method.availability === "available",
      )
      .flatMap((method) => method.profileKeys),
  ),
);
const controlledFileProfileKeys = new Set(
  brokerCatalog.flatMap((broker) =>
    broker.methods
      .filter(
        (method) =>
          method.connectorKind === "file_upload" &&
          method.availability === "controlled_candidate",
      )
      .flatMap((method) => method.profileKeys),
  ),
);

export const brokerCatalogSummary = Object.freeze({
  brokerCount: brokerCatalog.filter((broker) => broker.entryKind === "broker").length,
  platformCount: brokerCatalog.filter((broker) => broker.entryKind === "platform").length,
  genericFallbackCount: brokerCatalog.filter((broker) => broker.entryKind === "fallback")
    .length,
  builtFileProfileCount: builtFileProfileKeys.size,
  availableFileProfileCount: availableFileProfileKeys.size,
  controlledFileProfileCount: controlledFileProfileKeys.size,
  availablePlatformFamilyCount: brokerPlatformFamilies.filter(
    (family) => family.availability === "available",
  ).length,
  controlledPlatformFamilyCount: brokerPlatformFamilies.filter(
    (family) => family.availability === "controlled_candidate",
  ).length,
  plannedSharedFamilyCount: brokerPlatformFamilies.filter(
    (family) => family.availability === "planned" && family.sharedAcrossBrokers,
  ).length,
  controlledDirectApiCount: brokerCatalog.filter((broker) =>
    broker.methods.some(
      (method) =>
        method.connectorKind === "direct_api" &&
        method.availability === "controlled_candidate",
    ),
  ).length,
});

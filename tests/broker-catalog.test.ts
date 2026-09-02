import { describe, expect, it } from "vitest";
import {
  BROKER_CATALOG_CONTRACT_VERSION,
  brokerCatalog,
  brokerCatalogSummary,
  brokerPlatformFamilies,
  findBrokerCatalogEntries,
  getBrokerCatalogEntry,
  getBrokerFileProfileKeys,
  getBrokerPlatformFamily,
} from "../lib/utils/broker-catalog";
import { brokerImportProfiles } from "../lib/utils/broker-import-kit";
import {
  BROKER_FILE_IMPORT_CAPABILITY_CONTRACT_VERSION,
  brokerFileImportCapability,
  getBrokerFileImportPreviewHref,
} from "../lib/utils/broker-file-import-capability";

describe("provider-neutral broker catalog", () => {
  it("keeps preview and persistence as one immutable fail-closed deployment contract", () => {
    expect(brokerFileImportCapability).toMatchObject({
      contractVersion: BROKER_FILE_IMPORT_CAPABILITY_CONTRACT_VERSION,
      databaseGateKey: "journal_file_import_persistence_v2",
      databaseGateContractVersion:
        BROKER_FILE_IMPORT_CAPABILITY_CONTRACT_VERSION,
      deploymentState: "migration_pending",
      requiredMigration: "v57.62.0",
      previewEnabled: true,
      persistenceEnabled: false,
      catalogAvailability: "controlled_candidate",
      previewHref: "/trades?capture=import#trade-editor",
      previewActionLabel: "Datei prüfen",
      blockedActionLabel: "DB-Gate ausstehend",
    });
    expect(Object.isFrozen(brokerFileImportCapability)).toBe(true);
    expect(brokerFileImportCapability.blockedReason).toContain("v57.62.0");
    expect(getBrokerFileImportPreviewHref()).toBe(
      brokerFileImportCapability.previewHref,
    );
    expect(getBrokerFileImportPreviewHref("okx-futures")).toBe(
      "/trades?capture=import&preset=okx-futures#trade-editor",
    );
  });

  it("keeps broker brands, platform families and methods in immutable registries", () => {
    expect(new Set(brokerCatalog.map((broker) => broker.brokerCode)).size).toBe(
      brokerCatalog.length,
    );
    expect(
      new Set(brokerPlatformFamilies.map((family) => family.familyKey)).size,
    ).toBe(brokerPlatformFamilies.length);
    expect(
      brokerCatalog.every(
        (broker) =>
          broker.contractVersion === BROKER_CATALOG_CONTRACT_VERSION &&
          Object.isFrozen(broker) &&
          Object.isFrozen(broker.aliases) &&
          Object.isFrozen(broker.markets) &&
          Object.isFrozen(broker.methods) &&
          broker.methods.every(
            (method) => Object.isFrozen(method) && Object.isFrozen(method.profileKeys),
          ),
      ),
    ).toBe(true);
    expect(
      brokerPlatformFamilies.every(
        (family) =>
          Object.isFrozen(family) &&
          Object.isFrozen(family.connectorKinds) &&
          Object.isFrozen(family.profileKeys),
      ),
    ).toBe(true);
  });

  it("covers every built file profile exactly through a declared broker family", () => {
    const catalogProfileKeys = brokerCatalog.flatMap((broker) =>
      getBrokerFileProfileKeys(broker.brokerCode),
    );
    const importProfileKeys = brokerImportProfiles.map((profile) => profile.presetKey);

    expect(new Set(catalogProfileKeys)).toEqual(new Set(importProfileKeys));
    expect(catalogProfileKeys).toHaveLength(importProfileKeys.length);

    for (const broker of brokerCatalog) {
      const family = getBrokerPlatformFamily(broker.platformFamilyKey);
      expect(family).not.toBeNull();
      expect(
        getBrokerFileProfileKeys(broker.brokerCode).every((profileKey) =>
          family?.profileKeys.includes(profileKey),
        ),
      ).toBe(true);
    }
  });

  it("keeps built file profiles deployment-gated until the v57.62 migration is authorized", () => {
    const fileMethods = brokerCatalog.flatMap((broker) =>
      broker.methods.filter((method) => method.connectorKind === "file_upload"),
    );

    expect(fileMethods).toHaveLength(brokerCatalog.length);
    expect(
      fileMethods.every(
        (method) =>
          method.availability ===
            brokerFileImportCapability.catalogAvailability &&
          method.profileKeys.length > 0,
      ),
    ).toBe(true);
    expect(fileMethods.some((method) => method.availability === "available")).toBe(
      false,
    );
    expect(
      brokerCatalog
        .filter((broker) =>
          broker.methods.some((method) => method.connectorKind === "file_upload"),
        )
        .every((broker) =>
          broker.supportNote.includes(
            brokerFileImportCapability.requiredMigration,
          ),
        ),
    ).toBe(true);
    expect(
      brokerPlatformFamilies
        .filter((family) => family.profileKeys.length > 0)
        .every(
          (family) =>
            family.availability ===
            brokerFileImportCapability.catalogAvailability,
        ),
    ).toBe(true);
  });

  it("does not expose roadmap platform families as supported brokers", () => {
    const plannedFamilyKeys = new Set(
      brokerPlatformFamilies
        .filter((family) => family.availability === "planned")
        .map((family) => family.familyKey),
    );

    expect(plannedFamilyKeys).toEqual(
      new Set(["metatrader", "dxtrade"]),
    );
    expect(
      brokerCatalog.some((broker) => plannedFamilyKeys.has(broker.platformFamilyKey)),
    ).toBe(false);
    expect(
      brokerPlatformFamilies
        .filter((family) => family.availability === "planned")
        .every((family) => family.profileKeys.length === 0),
    ).toBe(true);
  });

  it("searches aliases, platform labels and market coverage without broker branches", () => {
    expect(findBrokerCatalogEntries("okex").map((broker) => broker.brokerCode)).toEqual([
      "okx",
    ]);
    expect(
      findBrokerCatalogEntries("USD M").map((broker) => broker.brokerCode),
    ).toEqual(["binance"]);
    expect(
      findBrokerCatalogEntries("Optionen").map((broker) => broker.brokerCode),
    ).toEqual(["generic_csv"]);
    expect(
      findBrokerCatalogEntries("cTrader").map((broker) => broker.brokerCode),
    ).toEqual(["ctrader_platform"]);
    expect(findBrokerCatalogEntries("MetaTrader")).toEqual([]);
    expect(findBrokerCatalogEntries()).toBe(brokerCatalog);
  });

  it("keeps direct APIs as controlled candidates instead of file-support claims", () => {
    const directApiEntries = brokerCatalog.filter((broker) =>
      broker.methods.some((method) => method.connectorKind === "direct_api"),
    );

    expect(directApiEntries.map((broker) => broker.brokerCode)).toEqual([
      "mexc",
      "okx",
    ]);
    expect(
      directApiEntries.every((broker) =>
        broker.methods
          .filter((method) => method.connectorKind === "direct_api")
          .every(
            (method) =>
              method.availability === "controlled_candidate" &&
              method.profileKeys.length === 0,
          ),
      ),
    ).toBe(true);
  });

  it("publishes deterministic catalog metrics and null-safe lookups", () => {
    expect(brokerCatalogSummary).toEqual({
      brokerCount: 5,
      platformCount: 1,
      genericFallbackCount: 1,
      builtFileProfileCount: 8,
      availableFileProfileCount: 0,
      controlledFileProfileCount: 8,
      availablePlatformFamilyCount: 0,
      controlledPlatformFamilyCount: 7,
      plannedSharedFamilyCount: 2,
      controlledDirectApiCount: 2,
    });
    expect(Object.isFrozen(brokerCatalogSummary)).toBe(true);
    expect(getBrokerCatalogEntry("mexc")?.displayName).toBe("MEXC");
    expect(getBrokerCatalogEntry("ctrader_platform")?.entryKind).toBe("platform");
    expect(getBrokerCatalogEntry("unknown")).toBeNull();
    expect(getBrokerPlatformFamily("metatrader")?.availability).toBe("planned");
    expect(getBrokerPlatformFamily("ctrader")).toMatchObject({
      availability: "controlled_candidate",
      profileKeys: ["ctrader-history"],
    });
    expect(getBrokerPlatformFamily("unknown")).toBeNull();
    expect(getBrokerFileProfileKeys("unknown")).toEqual([]);
  });
});

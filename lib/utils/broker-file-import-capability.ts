export const BROKER_FILE_IMPORT_CAPABILITY_CONTRACT_VERSION =
  "equora-broker-file-import-capability-v1" as const;

export const BROKER_FILE_IMPORT_DATABASE_GATE_KEY =
  "journal_file_import_persistence_v2" as const;

export type BrokerFileImportDeploymentState =
  | "migration_pending"
  | "available";

export type BrokerFileImportCatalogAvailability =
  | "controlled_candidate"
  | "available";

type BrokerFileImportDeploymentPolicy = Readonly<{
  catalogAvailability: BrokerFileImportCatalogAvailability;
  persistenceEnabled: boolean;
}>;

const deploymentPolicies: Readonly<
  Record<BrokerFileImportDeploymentState, BrokerFileImportDeploymentPolicy>
> = Object.freeze({
  migration_pending: Object.freeze({
    catalogAvailability: "controlled_candidate",
    persistenceEnabled: false,
  }),
  available: Object.freeze({
    catalogAvailability: "available",
    persistenceEnabled: true,
  }),
});

const deploymentState: BrokerFileImportDeploymentState = "migration_pending";
const deploymentPolicy = deploymentPolicies[deploymentState];

export const brokerFileImportCapability = Object.freeze({
  contractVersion: BROKER_FILE_IMPORT_CAPABILITY_CONTRACT_VERSION,
  databaseGateKey: BROKER_FILE_IMPORT_DATABASE_GATE_KEY,
  databaseGateContractVersion:
    BROKER_FILE_IMPORT_CAPABILITY_CONTRACT_VERSION,
  deploymentState,
  requiredMigration: "v57.62.0",
  previewEnabled: true,
  persistenceEnabled: deploymentPolicy.persistenceEnabled,
  catalogAvailability: deploymentPolicy.catalogAvailability,
  previewHref: "/trades?capture=import#trade-editor",
  previewActionLabel: "Datei prüfen",
  persistenceActionLabel: "Datei importieren",
  blockedActionLabel: "DB-Gate ausstehend",
  statusLabel: "Parser gebaut · DB-Gate offen",
  blockedReason:
    "Produktiver Dateiimport bleibt gesperrt, bis die freigegebene v57.62.0-Datenbankmigration angewendet sowie das zentrale App-Gate und das datenbankseitige Aktivierungsgate freigegeben sind.",
});

export function getBrokerFileImportPreviewHref(
  presetKey?: string | null,
) {
  const normalizedPreset = presetKey?.trim();
  if (!normalizedPreset) return brokerFileImportCapability.previewHref;

  return `/trades?capture=import&preset=${encodeURIComponent(normalizedPreset)}#trade-editor`;
}

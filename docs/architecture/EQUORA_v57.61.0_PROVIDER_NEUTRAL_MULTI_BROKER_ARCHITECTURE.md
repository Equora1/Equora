# Equora v57.61.0 – Providerneutrale Multi-Broker-Architektur

## 0. Dokumentkontrolle

| Feld | Wert |
|---|---|
| Status | Lokaler Architekturentwurf; bereit für unabhängiges Review, nicht für Implementierung oder Betrieb freigegeben |
| Baseline | `origin/main` bei `be204e6094cfa34cb2ec69c0eb2f35d7359a91eb` |
| Arbeitsbranch | `codex/multibroker-architecture-v57.61.0` |
| Scope | Providerneutraler Read-only-Brokerkern, Adaptergrenzen, Datenfluss, additive Migration und Gates |
| Nicht-Scope | Brokeraktivierung, Providerrequest, Cron, automatischer Import, Production-/Supabase-Änderung und UI-Redesign |
| Vorgängerentscheidungen | DEC-5761-006 bis DEC-5761-030, insbesondere providerneutraler Kern und dauerhaft read-only Brokerzugriff |

Dieses Dokument konsolidiert das Zielbild für die nächste Architekturphase. Es
ersetzt weder den MEXC-Providervertrag noch das logische Brokerimport-ERD, das
Transaktions-/Betriebsdesign, das Threat Model oder die Post-Release-Übergabe.
Es legt fest, wie die bereits teilweise providerneutrale Grundlage kontrolliert
von der heute MEXC-spezifischen Runtime-Vertikale entkoppelt werden soll.

Der Entwurf ist kein GO für einen zweiten Broker und keine Freigabe für einen
Brokerrequest. Ein zweiter Provider wird erst nach einer separaten
Produktentscheidung, einem aktuellen offiziellen Providervertrag und eigenen
Security-, Datenintegritäts-, QA- und Non-Production-Gates implementiert.

## 1. Ergebnis vor Detail

### 1.1 Architekturentscheidung

Equora erhält keinen gemeinsamen Universaladapter, der beliebige URLs,
HTTP-Methoden, Payloads oder Cursor zur Laufzeit entgegennimmt. Stattdessen wird
die Brokerarchitektur in vier klar gerichtete Ebenen getrennt:

1. **Providerneutraler Brokerkern** mit Identitäten, Capability-Referenzen,
   Work Units, Raw Envelopes, normalisierten Grains und Gatezuständen.
2. **Versionierte Provideradapter** mit ausschließlich fest registrierten,
   fachlich lesenden Capabilities, nicht sendefähigen Requestplänen, Oracle,
   Pagination und Mapping. Adapter besitzen keine Netzwerkprimitive.
3. **Providerneutraler Capture- und Persistenzkoordinator** plus genau ein
   serverseitiges Broker-Egress-Modul. Nur dieses Modul darf Netzwerkzugriff
   ausführen; es prüft unmittelbar vor jedem Egress erneut die vollständige
   Authority.
4. **Vom Capture getrennte Reconciliation-, Approval- und Importpipeline**, die
   keine Credentials, Providertransporte oder Schedulerparameter kennt.

MEXC bleibt der erste Referenzadapter. Zuerst wird sein bestehendes Verhalten
ohne fachliche Ausweitung hinter den neuen Ports gekapselt. Erst wenn die
MEXC-Verhaltensparität, Security-Invarianten und Datenbankverträge nachweislich
erhalten bleiben, darf ein zweiter Adapter als eigener Scope beginnen.

### 1.2 Kein Big-Bang-Rewrite

Die bestehende v57.61.0-Struktur besitzt bereits wertvolle providerneutrale
Bestandteile:

- `broker_providers`, `broker_accounts`, `broker_account_identities`,
  `broker_connection_accounts`, Activations, Scopes, Lane Requirements/States,
  Provider Request Results und Capture Raw Events führen `provider_code`
  direkt. Runs, Work Units, Raw Responses, Event Observations, Attempt Outcomes,
  Account Leases und Lease Events leiten den Provider dagegen über ihre
  geprüfte Composite-FK-Kette aus Account, Activation, Scope, Run oder Work Unit
  ab;
- Tenant-, Account-, Activation-, Lane-, Lease-, Raw- und
  Observation-Beziehungen sind weitgehend explizit;
- Providervertrag, Adapterversion und Capabilityprofil werden gepinnt;
- Raw Capture, Normalisierung, Reconciliation, Human Approval und Journalimport
  sind fachlich als getrennte Gates modelliert;
- der Brokerzugriff ist als dauerhaft read-only festgelegt.

Diese Strukturen werden nicht verworfen. Die Entkopplung erfolgt additiv und
strangler-artig: neue providerneutrale Ports vor den bestehenden MEXC-Pfad
setzen, Parität beweisen, erst danach interne MEXC-Abhängigkeiten aus den
generischen Modulen entfernen.

Die direkte oder transitive Providerbindung wird pro Tabelle bewusst
beibehalten. Ein redundanter direkter `provider_code` ist an einem v2-RPC- oder
Persistenzrand nur zulässig, wenn er innerhalb derselben Transaktion durch eine
Composite FK beziehungsweise einen exakten Parentvergleich erzwungen wird und
einen nachgewiesenen Authority-, Partitionierungs- oder Queryzweck erfüllt. Er
darf nicht allein aus optischer Einheitlichkeit ergänzt werden.

### 1.3 Harte Betriebsgrenze

Während der Architektur- und Refactoringphasen gilt weiterhin:

```text
runtime = off
broker_requests = forbidden_without_new_explicit_authorization
cron = disabled_not_authorized
automatic_journal_import = not_authorized
production_sql = not_authorized
production_deployment = not_authorized
```

Lokale Tests mit synthetischen Fixtures beweisen ausschließlich Mechanik und
Vertragsintegrität. Sie beweisen weder reales Providerverhalten noch
Vollständigkeit, korrekte historische Retention oder Importreife.

## 2. Verifizierter Ist-Zustand am Baseline-Commit

### 2.1 Bereits providerneutrale Substanz

| Bereich | Bestand | Bewertung |
|---|---|---|
| Provider Registry | `public.broker_providers` mit Contractversion, Read-Capabilities und `mutations_forbidden = true` | richtige zentrale Autorität; aktuell nur MEXC registriert |
| Brokerkonto | `broker_accounts`, `broker_account_identities`, `broker_connection_accounts` | providerneutraler Parent-/Identity-Grain vorhanden |
| Activation | Series, immutable Generations, Current Pointer und gepinnte Versionen | geeignete Grundlage für mehrere Provider |
| Scheduler | Requirements, Lane States, Gaps, Work Units, Leases und Recovery | fachlich generisch, intern teilweise MEXC-spezifische Scope-/Checkpointlogik |
| Raw Ledger | getrennte Raw Events, Page- und Event-Observations | richtige N:M-Provenienzgrundlage; Payloadtyp und Registry noch MEXC-gekoppelt |
| Security | RLS, enge RPCs, NOLOGIN-Owner, Runtime Enrollment und Egress-Fences | starke Basis; providerbezogene Regeln müssen aus MEXC-Hardcodierungen in gepinnte Verträge wandern |
| Downstream | Normalisierungs-, Reconciliation-, Candidate-, Approval- und Importmodell dokumentiert | weiterhin eigener Scope; darf nicht in den Adapter zurückgezogen werden |

### 2.2 Konkrete MEXC-Kopplungen

Die folgenden Kopplungen sind keine abstrakte Vermutung, sondern im
Baseline-Tree sichtbar:

| Schicht | Heutige Kopplung | Ziel |
|---|---|---|
| Runtime Gate | `mexc-runtime.ts` und `EQUORA_MEXC_RUNTIME_MODE` | globaler fail-closed Broker-Runtimemodus plus providergebundene Enrollment-Authority |
| API Route | `/api/internal/broker-capture` ruft direkt `runMexcCaptureCycle` auf | providerneutraler Dispatcher ohne frei wählbaren Provider oder freie Capability |
| Claim Contract | `BrokerCaptureClaimResult.providerCode` ist Literal `'mexc'`; Checkpoint- und Capabilitytypen stammen aus MEXC-Modulen | providergebundene, aber generisch getypte Claim-/Checkpoint-Envelope |
| Capture Control | Capability- und Failure-Sets importieren MEXC-Typen | Kernfehlerklassen und Providerfehler getrennt; Mapping im Adapter |
| Page Commit | `broker-capture-persistence.ts` importiert MEXC Wire-/Captured-Page-Typen | kanonischer providerneutraler Commit-Envelope, dessen Erzeuger der Adapter ist |
| Raw Ledger | Providerprofil enthält nur `mexc`; Payload ist `MexcJsonObject` | opaque kanonisches JSON/Bytes-Envelope plus providergebundener Decoder außerhalb des Kerns |
| Account Identity | `createMexcBrokerAccountIdentity` bindet Provider und Umgebung in der Funktion fest | domain-separierter generischer Identity-Digest mit geprüftem Provider-Identity-Input |
| Setup/Revocation | Actions und RPCs heißen und prüfen explizit MEXC | providerneutraler Commandvertrag mit adaptergebundener Validierung; bestehende MEXC-RPCs bleiben während Migration kompatibel |
| Runtime Enrollment | privater Singleton erzwingt `provider_code = 'mexc'` und genau ein Konto | allgemeines operator-owned Enrollment je Provider/Konto mit expliziten Caps; initial weiterhin nur MEXC erlaubt |
| UI | `MexcConnectionPanel`, MEXC-spezifische Meldungen und Aktionen | providerneutrale Connection Shell plus providerspezifisches Setupformular |

Eine Quellinventur findet MEXC-Verweise sowohl in klar providergebundenen
Modulen als auch in generisch benannten Servermodulen. Die Zahl der Treffer ist
kein Qualitätsmaß; relevant ist die Abhängigkeitsrichtung. Providercode darf
vom Adapter in Richtung Kern fließen, MEXC-Typen dürfen jedoch nicht die
öffentlichen Verträge des Kerns definieren.

### 2.3 Wichtige Interpretation

Der heutige Stand ist nicht „Multi-Broker implementiert“. Er ist:

```text
providerneutral dokumentiertes Domänen- und Datenmodell
+ in Production ausgelieferte, lokal technisch gehärtete MEXC-Capture-
  Grundlage bei Runtime off, ohne reales Provider-/Capture-Evidenz-GO
+ noch fehlende stabile Adapter-/Coordinator-Seams
+ G1_IN_PROGRESS_NO_GO für Capture, Reconciliation, Approval und Import
```

Das ist für den ersten Provider vertretbar. Einen zweiten Provider direkt in
die bestehenden MEXC-Typen einzubauen würde jedoch die bereits dokumentierte
Providerneutralität verletzen und Sicherheitslogik duplizieren.

## 3. Verbindliche Architekturprinzipien

### MB-001 – Fachliche Capabilities statt frei parametrierbarer Requests

Der Kern kennt fachliche Capability-Arten, zum Beispiel:

```text
instrument_metadata
historical_orders
historical_executions
historical_positions
funding_history
account_identity
permission_evidence
```

Ein Adapter registriert dafür konkrete, versionierte Provider-Capability-IDs.
Origin, Pfadtemplate, Methode, Authklasse und Queryschema sind Teil der
Providerregistrierung und niemals frei vom Aufrufer wählbar.

### MB-002 – Read-only ist eine Produktinvariante

Der Adapter-SDK enthält keine Operation für:

- Order Placement, Änderung oder Cancel;
- Position Open, Close oder Reverse;
- Transfer, Withdrawal oder Deposit;
- Leverage-, Margin- oder Accountmutation;
- API-Key- oder Permissionmutation.

Der Kern exponiert weder eine generische `request(method, url)`-Funktion noch
einen escape hatch. Falls ein späterer Provider eine technisch mutierend
benannte HTTP-Methode für einen belegbar nichtmutierenden Read-Endpunkt
erfordert, ist dies eine neue explizite Securityentscheidung. Die Methode wäre
fest in genau einer reviewten Capability registriert und niemals ein
Laufzeitparameter. Daraus entsteht kein Präzedenzfall für Brokerwrites.

### MB-003 – Raw ist unveränderlich, aber nicht fachlich autoritativ

Raw Responses und Raw Events bleiben byte-/digestgebundene Beobachtung. Sie
sind keine Journal-Trades und nicht automatisch normalisiert oder
importierbar. Ein Raw Event trägt mindestens:

- Tenant, Providerkonto und Providervertrag;
- Adapter-, Capability- und Source-Profilversion;
- Request-/Page-/Observationreferenzen;
- Provider-ID, Revision oder ausdrücklich blockierte Identität;
- unveränderliche Payload-/Body-Digests;
- Observed Time und Provider Time getrennt;
- Authority- und Completeness-Status.

### MB-004 – Providerpayloads enden am Adapter

Der Kern darf opaque Raw JSON/Bytes persistieren und digestsicher binden, aber
keine MEXC-, Binance-, Bybit- oder OKX-Feldnamen interpretieren. Providerfelder
werden ausschließlich im versionierten Adapterdecoder beziehungsweise Mapper
in kanonische Grains überführt.

### MB-005 – Finanzgrains bleiben getrennt

Order, Execution, Position Revision, Funding Event, Account Financial Event und
Instrument Metadata sind verschiedene Grains. Insbesondere gilt:

- Executions belegen ausgeführte Menge und Preis;
- Orders liefern Kontext, nicht zusätzliche Trades;
- Funding ist kein öffentlicher Funding-Rate-Ersatz;
- Contract Size, Settlement- und Fee-Währung benötigen eventzeitliche
  Authority;
- Journal-Trade-Grain bleibt der reconciled Position Cycle;
- offene oder widersprüchliche Cycles bleiben blockiert.

### MB-006 – Capture, Reconciliation, Approval und Import bleiben getrennt

Kein Schedulerjob und kein Adapter darf Candidate-Auswahl, Approval oder
Journalimport auslösen. Der Importpfad erhält ausschließlich eine
ownergebundene, unveränderte und single-use approvierte Candidate Revision. Er
kennt weder Credential noch Transport noch Providerendpoint.

### MB-007 – Alle Authority-Pins sind immutable und nachprüfbar

Es existiert nicht ein Capture-Tupel, das künstlich auch für Pre-Enrollment-
Probes gilt, sondern drei explizite Ebenen.

Die folgenden `snake_case`-Listen sind eine lesbare Feldinventur. Für
Feldnamen, Nesting, Präimage und Tests ist ausschließlich der TypeScript-
Vertrag in 6.1 mit seinen `camelCase`-Namen normativ; es existiert keine zweite
serialisierte `snake_case`-Variante.

Der gemeinsame, immer purposegebundene Authority-Kern bindet mindestens:

```text
authority_tuple_contract_version
authority_purpose
user_id
provider_code
provider_environment
required_runtime_mode
runtime_configuration_digest + deployment_identity + runtime_authority_epoch
provider_contract_version
adapter_version
capability_profile_id + version + digest
provider_capability_id + version + descriptor_digest
common_policy_versions:
  runtime_policy_version
  request_authority_policy_version
  failure_policy_version
purpose_scope_digest
purpose_request_sequence
```

Der `CaptureAuthorityTuple` ergänzt:

```text
work_unit_id + expected_row_version
claim_request_id + lease_id + lease_epoch + lease_token_digest
activation_id + generation
connection_account_id + broker_account_id
persistent_credential_reference + key_version + generation
identity_digest + key_version
checkpoint_contract_version
capture_policy_versions:
  claim_policy_version
  lease_policy_version
  checkpoint_policy_version
capture_budget + deadline
capture_authority_epoch
```

Der `ConnectionProbeAuthorityTuple` ergänzt stattdessen:

```text
setup_command_id + expected_row_version + setup_request_digest
ephemeral_session_id + generation + material_binding_mac
connection_probe_policy_versions:
  setup_policy_version
  probe_policy_version
  ephemeral_credential_policy_version
  apply_policy_version
cumulative_request_limit + request_count_before
response_byte_limit + absolute_deadline
```

Für `connection_probe` ist ausschließlich `capabilityProfile` aus dem Common
Core das versionierte Probeprofil; es gibt kein zusätzliches serialisiertes
Feld oder Alias `probe_profile`. Ebenso ist ausschließlich
`purposeRequestSequence` die Probesequenz; `probe_sequence` ist kein zweites
Feld. Texte dürfen die Begriffe „Probeprofil“ und „Probesequenz“ beschreibend
verwenden, die kanonische Präimage verwendet nur die TypeScript-Feldnamen.

Jeder konkrete Requestplan und jedes Permit-Envelope ergänzt den aus dem
tatsächlichen kanonischen Plan intern neu berechneten
`canonical_unsigned_request_digest`. Dieser Requestbinding-Layer ist nicht
Voraussetzung für die vorgelagerte Work-/Setup-Materialisierung, muss aber ab
Permitausstellung gemeinsam mit dem jeweiligen Purpose-Tupel unveränderlich
gebunden sein.

Im Capture-Purpose erzeugt eine relevante Parentänderung eine neue Activation
Generation beziehungsweise Authority Epoch. Im Probe-Purpose invalidiert eine
Änderung die Setup-Row-Version, ephemere Sessiongeneration oder Probe-
Authority. Ein Worker darf in keinem Purpose einen Pin dynamisch auf die
neueste Version umbiegen.

`authorityPurpose` und `authority_tuple_contract_version` sind Bestandteil der
domain-separierten Digestpräambel. Ein Capture-Tupel, Probe-Tupel oder dessen
Digest ist für den jeweils anderen Purpose nie verwendbar. Der
`authorityTupleDigest` umfasst den vollständigen gemeinsamen Kern plus genau
den kanonischen purpose-spezifischen Tupel; nur das Digest-Ausgabefeld selbst
liegt naturgemäß nicht in seiner Präimage. Capturefelder werden im Probe-Digest
und Probefelder im Capture-Digest weder als `null` noch als leere Platzhalter
geführt.

`authority_tuple_contract_version = equora-broker-authority-tuple-v1`
verwendet folgende einzige Digestregel:

```text
SHA-256(
  UTF8("equora-broker-authority-tuple-v1")
  || 0x00
  || UTF8(authorityPurpose)
  || 0x00
  || UTF8(encodeEquoraTcj({ common, capture | connectionProbe }))
)
```

`encodeEquoraTcj` ist der versionierte Equora-TCJ-Vertrag: Object Keys werden
lexikographisch nach ihren UTF-8-Bytes kanonisiert, Strings sind unverändert
UTF-8, ganzzahlige Werte besitzen eine kanonische Dezimaldarstellung, und
Floats, unbekannte Felder, implizite Defaults, `undefined` sowie die oben
verbotenen Cross-Purpose-Platzhalter sind unzulässig. `common` enthält exakt
die Felder von `CommonBrokerAuthorityCore`; der zweite Key heißt ausschließlich
`capture` oder `connectionProbe` und enthält exakt die zusätzlichen Felder des
zugehörigen TypeScript-Typs ohne `authorityTupleDigest`. Damit bestimmen
Feldnamen, Encoding, Präimage und Testvektoren dieselbe eine Variante.

TypeScript-Verträge, materialisierte Work Unit beziehungsweise Setup Command,
Claim-/Permit-Envelopes, Datenbank-RPC-Argumente und -Resultate, MAC-/Digest-
Domains, Receipts sowie relevante Composite FKs müssen den gemeinsamen Kern
und den purpose-spezifischen Tupel **innerhalb derselben Purpose-Kette**
identisch tragen oder über eine eindeutige, in derselben Transaktion validierte
Parentkette ableiten. Kein Rand darf einen gemeinsamen oder für seinen Purpose
erforderlichen Pin still weglassen. Negativtests variieren jeden gemeinsamen
und jeden purpose-spezifischen Pin einzeln; Cross-Purpose-, falscher-Tupeltyp-
und Digest-Replaytests erwarten Credential-/Handle-Loader- und Requestcount
jeweils null.

### MB-008 – Fail-closed bei Unbekanntem

Unbekannte Provider, Capabilities, Enums, Payloadshapes, Währungen,
Instrumenttypen, Cursor, Retentiongrenzen, Permissions oder Fehlerklassen
werden als `unsupported`, `unverified`, `suspended` oder `blocked`
ausgewiesen. Sie werden nie still durch Presets, `null = 0`, leere Arrays oder
den MEXC-Standard ersetzt.

## 4. Zielarchitektur und Abhängigkeitsrichtung

```text
UI / Server Action / Internal Trigger
                 |
                 v
      Broker Application Service
      - owner and input validation
      - no provider HTTP details
                 |
                 v
      Capture Coordinator / Dispatcher
      - claim, lease, authority, budgets
      - provider-neutral work envelope
                 |
        +--------+---------+
        |                  |
        v                  v
 Provider Adapter A   Provider Adapter B
 - capability map     - capability map
 - request plan       - request plan
 - oracle/parser      - oracle/parser
 - pagination         - pagination
 - raw mapping        - raw mapping
        |                  |
        +--------+---------+
                 |
                 v
      Central Broker Egress
      - sole network primitive owner
      - final permit revalidation
      - credential load and zeroization
                 |
                 v
      Canonical Page Commit Port
      - short transaction
      - CAS and idempotency
      - raw/observation/checkpoint
                 |
                 v
       Normalization Workers
       - provider mapping only here
                 |
                 v
 Reconciliation -> Candidate Revision
                 |
                 v
 Human Approval -> Atomic Journal Import
```

Zulässige Abhängigkeitsrichtung:

```text
provider adapter -> broker contracts -> shared primitives
application service -> broker contracts
capture coordinator -> broker contracts + persistence ports
central broker egress -> broker contracts + authority/credential ports
reconciliation/import -> canonical grains only
```

Unzulässige Abhängigkeitsrichtung:

```text
broker core -> mexc-* module
import -> adapter or credential store
UI -> provider transport
database RPC -> caller supplied URL/method
provider adapter -> journal trade mutation
provider adapter -> fetch/network library/broker SDK/send-capable websocket
any module except central broker egress -> broker network primitive
```

## 5. Vorgeschlagene Modulgrenzen

Die Namen sind Zielpfade, keine Anweisung für eine sofortige Verschiebung.

```text
lib/server/broker-core/
  contracts.ts
  capability.ts
  errors.ts
  runtime-policy.ts
  capture-coordinator.ts
  raw-envelope.ts
  checkpoint.ts
  normalization.ts

lib/server/broker-egress/
  execute-read.ts
  request-validator.ts
  credential-loader.ts

lib/server/broker-adapters/
  registry.ts
  mexc/
    contract.ts
    identity.ts
    request-plan.ts
    oracle.ts
    pagination.ts
    capture.ts
    normalize.ts

lib/server/broker-persistence/
  authority.ts
  scheduler.ts
  page-commit.ts
  raw-ledger.ts
  candidate-store.ts

app/actions/brokers/
  connections.ts

components/brokers/
  broker-connection-hub.tsx
  provider-setup-panel.tsx
  providers/mexc-setup-fields.tsx
```

Bestehende Pfade werden zunächst durch Facades oder Re-Exports kompatibel
gehalten. Eine reine Dateiumbenennung ohne entkoppelte Verträge gilt nicht als
Architekturfortschritt.

## 6. Kernverträge

### 6.1 Provider- und Capability-Identität

```ts
type ProviderCode = string & { readonly __brand: 'ProviderCode' }
type ProviderContractVersion = string & { readonly __brand: 'ProviderContractVersion' }
type AdapterVersion = string & { readonly __brand: 'AdapterVersion' }
type ProviderReadMethod = 'GET'
type BrokerEnvironment = 'live' | 'demo'
type BrokerRuntimeMode = 'off' | 'probe' | 'capture'

type BrokerRuntimeAuthorityRef<Mode extends 'probe' | 'capture'> = Readonly<{
  requiredMode: Mode
  runtimeConfigurationDigest: string
  deploymentIdentity: string
  runtimeAuthorityEpoch: number
}>

type BrokerCapabilityKind =
  | 'instrument_metadata'
  | 'historical_orders'
  | 'historical_executions'
  | 'historical_positions'
  | 'funding_history'
  | 'account_identity'
  | 'permission_evidence'

type ProviderCapabilityRef = Readonly<{
  providerCode: ProviderCode
  providerContractVersion: ProviderContractVersion
  adapterVersion: AdapterVersion
  capabilityKind: BrokerCapabilityKind
  providerCapabilityId: string
  providerCapabilityVersion: string
  capabilityDescriptorDigest: string
}>

type CapabilityProfileRef = Readonly<{
  profileId: string
  profileVersion: string
  profileDigest: string
}>

type CommonBrokerAuthorityPolicyPins = Readonly<{
  runtimePolicyVersion: string
  requestAuthorityPolicyVersion: string
  failurePolicyVersion: string
}>

type CaptureAuthorityPolicyPins = Readonly<{
  claimPolicyVersion: string
  leasePolicyVersion: string
  checkpointPolicyVersion: string
}>

type ConnectionProbeAuthorityPolicyPins = Readonly<{
  setupPolicyVersion: string
  probePolicyVersion: string
  ephemeralCredentialPolicyVersion: string
  applyPolicyVersion: string
}>

type CommonBrokerAuthorityCore<
  Purpose extends 'capture' | 'connection_probe',
  Mode extends 'capture' | 'probe',
> = Readonly<{
  authorityTupleContractVersion: string
  authorityPurpose: Purpose
  userId: string
  environment: BrokerEnvironment
  runtimeAuthority: BrokerRuntimeAuthorityRef<Mode>
  provider: ProviderCapabilityRef
  capabilityProfile: CapabilityProfileRef
  commonPolicyPins: CommonBrokerAuthorityPolicyPins
  purposeScopeDigest: string
  purposeRequestSequence: number
}>

type CaptureAuthorityTuple = CommonBrokerAuthorityCore<'capture', 'capture'> &
  Readonly<{
    authorityTupleDigest: string
    workUnitId: string
    expectedWorkUnitRowVersion: number
    claim: Readonly<{
      claimRequestId: string
      leaseId: string
      leaseEpoch: number
      leaseTokenDigest: string
    }>
    activation: Readonly<{
      id: string
      generation: number
      authorityEpoch: number
    }>
    account: Readonly<{
      brokerAccountId: string
      connectionAccountId: string
      identityDigest: string
      identityKeyVersion: string
    }>
    persistentCredentialReference: Readonly<{
      id: string
      keyVersion: string
      generation: number
    }>
    checkpointContractVersion: string
    capturePolicyPins: CaptureAuthorityPolicyPins
    captureBudget: Readonly<{
      pageLimit: number
      responseByteLimit: number
      requestDeadlineAt: string
    }>
  }>

type ConnectionProbeAuthorityTuple =
  CommonBrokerAuthorityCore<'connection_probe', 'probe'> &
    Readonly<{
      authorityTupleDigest: string
      setupCommandId: string
      expectedSetupCommandRowVersion: number
      setupRequestDigest: string
      connectionProbePolicyPins: ConnectionProbeAuthorityPolicyPins
      ephemeralCredentialSession: Readonly<{
        sessionId: string
        generation: number
        materialBindingMac: string
      }>
      probeBudget: Readonly<{
        cumulativeRequestLimit: number
        cumulativeRequestCountBefore: number
        responseByteLimit: number
        absoluteDeadlineAt: string
      }>
    }>
```

`BrokerCapabilityKind` beschreibt die Semantik des Kerns.
`providerCapabilityId` beschreibt den konkreten Providervertrag. Beide dürfen
nicht zu einem unversionierten String zusammenfallen.

### 6.2 Adapterdescriptor

```ts
type ReadCapabilityDescriptor<Query, Cursor> = Readonly<{
  ref: ProviderCapabilityRef
  mutationContract: 'mutations_forbidden'
  methodContract: 'constant_read_method'
  constantMethod: ProviderReadMethod
  constantHttpsOrigin: string
  constantPort: 443
  constantPathTemplate: string
  authClass: 'public' | 'signed_read'
  dataClass: 'metadata' | 'account_history' | 'account_identity'
  queryContractVersion: string
  cursorContractVersion: string
  responseContractVersion: string
  parseQuery(input: unknown): Query
  parseCursor(input: unknown): Cursor | null
}>

interface ReadOnlyBrokerAdapter {
  readonly providerCode: ProviderCode
  readonly providerContractVersion: ProviderContractVersion
  readonly adapterVersion: AdapterVersion
  readonly capabilities: readonly ReadCapabilityDescriptor<unknown, unknown>[]

  prepareReadPlan(input: BrokerReadWorkUnit): BrokerReadRequestPlan
  prepareProbeReadPlan(input: BrokerConnectionProbeWork): BrokerReadRequestPlan
  inspectWireResponse(input: BrokerWireResponse): InspectedProviderPage
  advanceCheckpoint(input: ProviderPageTransitionInput): ProviderCheckpointTransition
  mapRawEvents(input: InspectedProviderPage): readonly CanonicalRawEventInput[]
  classifyFailure(error: unknown): BrokerFailure
}
```

Das Interface enthält bewusst keine Verbindungserstellung, Credential-
Persistenz oder Journalmutation. Diese Aufgaben gehören in Application Service
beziehungsweise Persistence Ports.

Es enthält außerdem bewusst keine sendende Operation. Ein Adapter darf weder
`fetch`, eine andere Netzwerkprimitive, ein Broker-SDK noch einen
sendefähigen WebSocket importieren. `BrokerReadRequestPlan` ist ein
kanonischer, nicht sendefähiger Wert ohne Credentialmaterial oder Senderecht.
Nur das zentrale Egress-Modul kann diesen Plan zusammen mit einem gültigen,
opaque-provenance-gebundenen Permit ausführen.

Der `capabilityDescriptorDigest` wird über eine versionierte kanonische
Darstellung mindestens aus Provider-/Contract-/Adapter-/Capabilitypins,
`mutations_forbidden`, konstanter Methode, HTTPS-Origin, Port, Pfadtemplate,
Auth-/Datenklasse sowie Query-, Cursor- und Response-Contractversion gebildet.
Parserfunktionen selbst werden nicht zur Laufzeit aus Daten serialisiert; ihre
gebaute Adapterversion ist Teil des Pins. Code Registry, Database Registry und
Egress vergleichen den Digest, bevor Credentialmaterial aufgelöst wird.

### 6.3 Providerneutrale Work Unit

```ts
type BrokerReadWorkUnit = Readonly<{
  authority: CaptureAuthorityTuple
  integrityKeyReference: Readonly<{ id: string; keyVersion: string }>
  scope: Readonly<{
    instrumentScopeKey: string
    requestWindowStartUs: string
    requestWindowEndUs: string
  }>
  checkpoint: Readonly<{
    payload: unknown
    mac: string
  }>
}>
```

Der Coordinator liest das providerinterne Checkpoint-Payload nicht. Er prüft
nur Pins, Limits, MAC, CAS und Status. Der Adapter interpretiert das Payload
gegen genau seine gepinnte Checkpointversion.

### 6.4 Nicht sendefähiger Requestplan und Single-use-Permit

```ts
type BrokerReadRequestPlan = Readonly<{
  authorityPurpose: 'capture' | 'connection_probe'
  authorityTupleDigest: string
  provider: ProviderCapabilityRef
  method: ProviderReadMethod
  httpsOrigin: string
  port: 443
  pathTemplateId: string
  canonicalPath: string
  canonicalQuery: Readonly<Record<string, string>>
  canonicalUnsignedRequestDigest: string
  redirectMode: 'error'
  responseByteLimit: number
  requestTimeoutMs: number
  planContractVersion: string
}>

type AuthorizedBrokerReadPermit = Readonly<{
  authority: CaptureAuthorityTuple
  canonicalUnsignedRequestDigest: string
  requestAuthorityId: string
  permitContractVersion: string
  singleUse: true
  issuedAt: string
  sendDeadlineAt: string
}>
```

Der Permit ist nicht durch ein frei konstruierbares TypeScript-Objekt
autorisierend. Seine Datenbankzeile und ein nur intern prüfbarer
Provenienznachweis sind maßgeblich. Er ist kurzlebig, single-use und exakt an
Tenant, Work Unit, Row Version, Claim, Lease/Epoch, Request Sequence,
Providerumgebung, Provider-/Capability-/Contract-/Adapterversion und
Capability-Descriptor-Digest, Capabilityprofil, sämtliche Authority-
gemeinsame und Capture-spezifische Policyversionen, Konto, Activation
Generation, Authority Epoch,
Credentialgeneration, Scope und den kanonischen unsigned Requestdigest
gebunden. Replay, Deadlineüberschreitung oder jede abweichende Bindung
scheitert vor Credentialzugriff.

Bereits die Permitausstellung verwendet den serverinternen, nicht vom Caller
lieferbaren Runtime-Policy-Resolver. Sie ist nur bei aktuell passendem
Purpose/Mode zulässig und bindet dessen Konfigurationsdigest,
Deploymentidentität und Runtime Authority Epoch in Permit und
Authority-Tupel.

Das zentrale Egress-Modul parst und kanonisiert den tatsächlich übergebenen
Requestplan zuerst ohne Credentialzugriff vollständig. Es prüft
`authorityPurpose`, Provider-/Contract-/Adapter-/Capability-/Descriptordigest,
Methode, HTTPS-Origin, Port, konstantes Pfadtemplate, kanonischen Pfad,
Queryschema und -werte, Redirectmodus, Response-/Timeoutlimits und
Plancontract gegen die vollständige Code Registry und berechnet den unsigned
Requestdigest selbst neu; ein vom Caller mitgelieferter Digest ist keine
Authority. Plan, neu berechneter Digest und Permit müssen byte- beziehungsweise
semantikexakt übereinstimmen. Unmittelbar vor der Control-Plane-Transaktion
liest das Egress den aktuellen fail-closed Runtimewert neu, berechnet aus
Global-/Legacywert, Deploymentidentität und Runtime Authority Epoch den
aktuellen `runtimeConfigurationDigest` und verlangt für einen Capture-Permit
effektiv `capture`. Die kurze Transaktion löst dann den finalen
Send-Linearisierungspunkt aus, sperrt die
maßgeblichen Parentgrains in definierter Reihenfolge und revalidiert Database
Registry, Purpose-zu-Mode, Current Pointer, Activation, Enrollment,
Provider-/Capability-Status, Environment, Contract-/Adapter-/Descriptor-/
Profil-, Common- und Capture-Policypins, Credentialgeneration, Claim,
Lease/Epoch, Scope,
vollständigen kanonischen Requestplan samt neu berechnetem Digest,
Runtime-Konfigurationsdigest, Deploymentidentität, Runtime Authority Epoch und
Deadline. Erst danach verbraucht sie den Permit atomar. Gewinnt
Pause, Revocation, Credentialentfernung, Generationwechsel oder Suspension
diesen CAS vor dem Linearisierungspunkt, entstehen null weitere
Credentialzugriffe und null Brokerrequests. Ein nach dem Linearisierungspunkt
committender Widerruf kann einen bereits autorisierten/in-flight Request nicht
rückwirkend ungesendet machen; er blockiert jedoch jeden Folgerequest. Diese
Reihenfolge wird als Auditreceipt festgehalten und nicht als stärkere
Sofortwiderrufsgarantie dargestellt.

Nach erfolgreichem Transaktionscommit prüft das zentrale Egress-Modul den
aktuellen Runtimewert samt Konfigurationsdigest, Deploymentidentität und Epoch
sowie den unveränderten Code-Registry-Descriptor und den vollständigen
kanonischen Plan ein zweites Mal. Ein Mode-/Purpose-, Runtime-Authority-,
Descriptor- oder Planwechsel endet weiterhin vor
Credentialzugriff; der bereits konsumierte Permit bleibt ohne Send als
fail-closed Receipt nachvollziehbar. Erst wenn auch diese Prüfung besteht,
lädt das Egress genau die gebundene Credentialgeneration, signiert den bereits
validierten Plan und sendet ihn. Credentialmaterial wird in `finally` genullt.
Adapter sehen weder Permit noch Credentialmaterial. Änderungen der Database
Registry nach dem committen Send-Linearisierungspunkt können den bereits
autorisierten Request nicht rückwirkend aufheben, blockieren aber aufgrund
neuer Generation/Authority jeden Folgerequest.

```ts
interface CentralBrokerEgress {
  executeAuthorizedRead(
    plan: BrokerReadRequestPlan,
    permit: AuthorizedBrokerReadPermit | AuthorizedConnectionProbePermit,
  ): Promise<BrokerWireResponse>
}
```

Dies ist die einzige sendefähige Broker-Schnittstelle. Für den aktuellen
Vertrag ist `ProviderReadMethod` ausschließlich `GET`. Eine spätere
read-semantische andere Methode erfordert vor Erweiterung dieses Typs eine neue
Provider-, Security- und Nutzerentscheidung; sie kann nicht durch
Datenbankkonfiguration freigeschaltet werden.

### 6.5 Wire Response und Raw Envelope

```ts
type BrokerWireResponse = Readonly<{
  authorityPurpose: 'capture' | 'connection_probe'
  authorityTupleDigest: string
  provider: ProviderCapabilityRef
  requestAuthorityId: string
  methodEvidence: string
  originEvidence: string
  pathTemplateEvidence: string
  queryDigest: string
  startedAt: string
  receivedAt: string
  httpStatus: number
  rawBody: Uint8Array
  rawBodyDigest: string
  rawBodyBytes: number
}>

type CanonicalRawEventInput = Readonly<{
  eventKind:
    | 'order'
    | 'execution'
    | 'position'
    | 'funding'
    | 'account_financial_event'
    | 'instrument_metadata'
  providerEventId: string | null
  providerRevision: string | null
  identityStatus: 'stable_provider_id' | 'blocked_identity'
  providerOccurredAtUs: string | null
  payloadEncoding: 'canonical_json_v1'
  payload: unknown
  payloadDigest: string
  normalizationAuthority: 'blocked_pending_versioned_normalization'
}>
```

Providerpayloads dürfen als `unknown` den Persistenzrand erreichen, müssen dort
aber vor Commit gegen ein begrenztes kanonisches JSON-Format validiert werden.
Klasseninstanzen, Funktionen, unbeschränkte Tiefe, nichtendliche Zahlen,
duplizierte Keys oder ungebundene Binärdaten sind verboten.

### 6.6 Fehlervertrag

Der Kern kennt stabile Fehlerklassen:

```text
authority
credential
permission
contract
pagination
rate_limit
provider_unavailable
timeout
resource_budget
persistence_conflict
unknown_fail_closed
```

Der Adapter mappt Providercodes auf diese Klassen und fügt nur sanitisiertes,
begrenztes Detail hinzu. Ein unbekannter Providerfehler wird nie als leere
Erfolgspage oder retrybarer Standardfehler interpretiert.

### 6.7 Providerneutraler Pre-Enrollment-/Connection-Probevertrag

Ein Connection Probe läuft vor der endgültigen Anlage von Brokerkonto,
Connection, Activation, Enrollment und Capture Work Unit. Er verwendet deshalb
nicht künstlich `BrokerReadWorkUnit`, sondern einen eigenen Authority-Grain:

```ts
type BrokerConnectionProbeWork = Readonly<{
  authority: ConnectionProbeAuthorityTuple
}>

type AuthorizedConnectionProbePermit = Readonly<{
  authority: ConnectionProbeAuthorityTuple
  canonicalUnsignedRequestDigest: string
  requestAuthorityId: string
  permitContractVersion: string
  singleUse: true
  issuedAt: string
  sendDeadlineAt: string
}>
```

Der authentisierte Application Service validiert den Connection-Input und legt
zuerst ausschließlich einen secretfreien, ownergebundenen Setup Command mit
Provider, Umgebung, Profil, Symbol-/Accountscope, Read-only-Attestierung,
Budgets und Requestdigest an. API Key und Secret bleiben bis zum erfolgreichen
Apply ausschließlich in einem begrenzten serverseitigen Speicherbereich der
aktuellen Invocation. Sie werden nicht im Setup Command, Permit, Log oder
Adapter gespeichert.

Ein Probe-Permit wird nur ausgestellt, wenn der serverinterne Runtime-Resolver
zu diesem Zeitpunkt effektiv `probe` ergibt und
Konfigurationsdigest, Deploymentidentität sowie Runtime Authority Epoch in den
Probe-Tupel bindet. Ein Caller kann diese Runtime-Autorität nicht vorgeben.

Das Broker-Egress-Paket erzeugt daraus einen opaque
`EphemeralCredentialHandle`. Nur dieses Paket kann den Handle in derselben
Invocation gegen die gebundene Session, Generation und einen intern
domain-separiert erzeugten, nicht als Secret-Hash verwendeten Binding-MAC
auflösen. Der Provideradapter sieht nur den secretfreien Probe-Work und erzeugt
einen nicht sendefähigen Plan. Für jeden tatsächlichen Read wird ein eigener
kurzlebiger Single-use-Probepermit ausgestellt, unmittelbar vor Zugriff auf den
ephemeren Handle atomar gegen Setupstatus, Row Version, Nutzer, Provider,
Environment, Descriptor-/Profil-, Common- und Connection-Probe-Policypins,
Sequenz, Scope, kumulatives
Budget, Requestdigest, Deadline sowie den aktuell neu gelesenen effektiven
Runtimemodus `probe`, Runtime-Konfigurationsdigest, Deploymentidentität und
Runtime Authority Epoch revalidiert und verbraucht. Nach dem Commit prüft das
Egress Mode/Purpose, Runtime-Authority, vollständigen kanonischen Plan und den
Code-Descriptor erneut, bevor es den ephemeren Handle auflöst. Auch Probes
senden ausschließlich über `CentralBrokerEgress`.

Ein erfolgreicher Probe erzeugt ein versioniertes, sanitisiertes Ergebnis je
Capability:

```text
technical_read_result
permission_evidence_result
account_identity_result
provider_contract_version
adapter_version
capability_descriptor_digest
probe_scope_digest
observed_at
sanitized_findings
```

Technischer Leseerfolg, Nutzerattestierung und technisch erkennbare
Permissionevidenz bleiben getrennte Felder. Der Probe behauptet keine globale
Read-only-Gesamtrechteprüfung oder vollständige Historie.

Erst wenn das vollständige, gepinnte Probeprofil erfolgreich ist, darf eine
einzige serverseitige Apply-Transaktion das Credential verschlüsseln und
Credentialgeneration, Connection, Brokerkonto/Identity,
Connection-Account-Zuordnung und die weiterhin inaktive beziehungsweise
policygebundene Activationgrundlage konsistent anlegen. Ein Capture Enrollment
entsteht dadurch nicht automatisch.

Failure, Timeout, Replay, Widerruf, Ablauf oder abweichender Apply-Digest
erzeugen keine aktive Connection, kein Brokerkonto, keine Activation, kein
Enrollment, keine Capture Work Unit und kein persistiertes Credentialmaterial.
Ein sanitisiertes, secretfreies Setup-Intent/Failure-Receipt darf als Auditspur
bleiben. Ephemeres Material wird in jedem Exitpfad genullt; ein Apply nach
Expiry oder bereits konsumiertem Setup Command scheitert fail-closed.

## 7. Provider Registry und Adapterauflösung

### 7.1 Zwei gebundene Registry-Ebenen

1. **Code Registry:** enthält die tatsächlich gebauten Adapter und deren
   vollständige, unveränderliche Capabilitydescriptors einschließlich deren
   Digest; ein bloßer String- oder Reference-Katalog genügt nicht.
2. **Database Registry:** enthält operatorseitigen Status, erlaubte
   Contractversionen und Deployment-/Enrollment-Authority.

Ein Request ist nur zulässig, wenn beide Ebenen exakt übereinstimmen. Weder die
Datenbank noch der Code kann allein eine Capability aktivieren.

```text
common:
  code adapter exists
  AND database provider status = verified
  AND exact contract/adapter/profile/capability/descriptor pins current
  AND current effective runtime mode matches authority purpose
  AND request authority freshly issued

capture additionally:
  effective mode = capture
  AND operator enrollment permits provider/account
  AND activation/current pointer/lease/claim are current

connection_probe additionally:
  effective mode = probe
  AND provider/capability/profile are explicitly probe-capable and not suspended
  AND owner-bound setup command/probe profile/session are current
  AND no enrollment or activation is required or inferred

= egress permitted only for the selected purpose
```

### 7.2 Schreibautorität der Control Plane

Direkte DML auf Provider-/Capability-Registry, Runtime Enrollment, Activation,
Suspension und Versionsfreigaben ist für `PUBLIC`, `anon`, `authenticated` und
`service_role` entzogen. RLS ist eine zusätzliche Tenantlesegrenze, aber keine
hinreichende Control-Plane-Schreibautorität.

Änderungen erfolgen ausschließlich über eng validierte, explizit gewährte
`SECURITY DEFINER`-RPCs mit leerem `search_path`, vollständig
schemaqualifizierten Referenzen, CAS/Generation und immutablem Auditreceipt.
Diese Funktionen gehören einer dedizierten `NOLOGIN`-/`NOINHERIT`-
Operator-Control-Authority. Ihre Ownership oder Rollenmitgliedschaft wird
weder der Application Runtime noch `service_role` erteilt. Runtime-RPCs
besitzen eine davon getrennte `NOLOGIN`-Authority mit engeren Rechten und
können Provider oder Capability weder registrieren, verifizieren, enrollen,
entsuspendieren noch eine erlaubte Contractversion erweitern.

Operator-Commands und Runtime-Commands verwenden disjunkte RPCs,
Purpose-Digests, Rollen und Receipttypen. Jede Registry-, Enrollment-,
Activation-, Suspension- und Versionsmutation bindet erwartete Row Version,
vorherigen Zustand, Actor-/Requestreferenz und Ergebnis. Ein Replay ist
idempotent nur bei identischem Inputdigest; abweichender Replay und stale CAS
scheitern fail-closed.

### 7.3 Keine dynamischen Providerplugins in Production

Provideradapter werden als reviewter Anwendungscode ausgeliefert. Production
lädt keine Adaptermodule, URLs oder Scripts aus Datenbank, Marketplace,
Dateiupload oder Remote-Registry. Damit bleiben Supply-Chain-, Code-Signing- und
Reviewgrenzen nachvollziehbar.

### 7.4 Auswahl des zweiten Brokers

Es ist noch kein zweiter Broker gewählt. Die Auswahl erfolgt in einem eigenen
Decision Gate anhand mindestens dieser Kriterien:

| Kriterium | Mindestfrage |
|---|---|
| Nutzerwert | Existiert belegter Bedarf für konkrete Kontotypen und Märkte? |
| Read-only Rechte | Können Keys technisch granular ohne Trading, Transfer und Withdrawal erstellt werden? |
| Historische Daten | Welche Orders, Executions, Positionen, Funding- und Metadaten sind offiziell verfügbar? |
| Grains | Sind Ausführungen, Reversals, Hedge Mode, Contract Size und Währungen eindeutig abbildbar? |
| Pagination/Retention | Sind Grenzen, Sortierung, Cursor, Late Arrivals und Retention belastbar dokumentiert? |
| Rate Limits | Ist ein bounded serverless Capture wirtschaftlich und betrieblich möglich? |
| Regionen/Recht | Ist der Provider für den vorgesehenen Nutzerkreis und Betrieb zulässig? |
| Wartbarkeit | Wie hoch sind API-Volatilität, Supportqualität und Golden-Test-Aufwand? |

Binance, Bybit, OKX und andere Namen bleiben Kandidaten, keine Entscheidung.
Aktuelle Providerinformationen müssen im späteren Auswahlgate ausschließlich
aus aktuellen offiziellen Quellen erhoben werden.

## 8. Runtime- und Egress-Policy

### 8.1 Zielzustand

Der skalierbare Zielvertrag verwendet einen globalen Runtimemodus:

```text
EQUORA_BROKER_RUNTIME_MODE=off | probe | capture
```

`off` ist Default bei fehlendem, leerem oder unbekanntem Wert. Der globale
Modus ist nur eine notwendige, niemals hinreichende Bedingung. Die
Purpose-Matrix ist absichtlich disjunkt:

| Effektiver Modus | `connection_probe` | `capture` |
|---|---:|---:|
| `off` | blockiert | blockiert |
| `probe` | nur mit gültigem Setup-/Probe-Permit | blockiert |
| `capture` | blockiert | nur mit Enrollment, Activation, Claim und Capture-Permit |

Ein Capture-Deployment autorisiert damit nicht still Connection-Probes und ein
Probe-Deployment niemals Capture. Gleichzeitige Freigabe beider Zwecke würde
einen neuen expliziten Modus, neue Negativtests, A4-Review und Nutzerfreigabe
verlangen; sie wird nicht aus `capture` abgeleitet.

### 8.2 Übergang vom MEXC-Runtimemodus

Während der Kompatibilitätsphase bleibt `EQUORA_MEXC_RUNTIME_MODE` für den
MEXC-Adapter bestehen. Sobald der globale Modus eingeführt wird, gilt:

- fehlen beide Variablen, ist Runtime `off`;
- ist nur der Legacywert gesetzt, darf ausschließlich MEXC nach den bisherigen
  Regeln und derselben disjunkten `probe`-/`capture`-Purpose-Matrix laufen;
- ist nur der globale Wert gesetzt, bleibt jeder Provider ohne separates
  Enrollment im Capturepfad blockiert; der Probe-Pfad verlangt stattdessen den
  vollständigen Setup-/Probe-Vertrag aus 6.7;
- für MEXC ist bei zwei gesetzten Variablen der effektive Modus nur dann der
  gemeinsame exakte Wert, wenn beide gleich und gültig sind; bei Widerspruch,
  leerem oder unbekanntem Wert ist er `off`;
- für andere Provider ist der Legacywert niemals autorisierend; sie benötigen
  den gültigen globalen Wert und ihre providerbezogene Purpose-Authority;
- der Legacywert wird erst nach eigenem Release- und Rollbackgate entfernt.

Eine Migration darf Production niemals durch einen Defaultwechsel aktivieren.

### 8.3 Dispatcher

Der interne Trigger erhält keinen frei wählbaren Provider aus Query, Header
oder Body. Der Dispatcher sucht ausschließlich bereits materialisierte,
claimbare Work Units. Deren Provider- und Capabilitypins bestimmen den Adapter.
Eine fehlende oder mehrdeutige Adapterauflösung führt zu null Credentialzugriff
und null Egress.

## 9. Datenbank- und Persistenzdesign

### 9.1 Was bestehen bleibt

Die vorhandenen Tabellen für Provider, Konten, Identitäten, Connections,
Activations, Scopes, Lanes, Gaps, Runs, Work Units, Request Results, Raw
Responses, Raw Events, Observations, Leases und Receipts bleiben der Ausgang.
Es gibt keinen Anlass für eine parallele zweite Brokerdatenbank.

### 9.2 Erforderliche additive Deltas

Vor Umsetzung ist je Delta ein exakter Schema-/Queryplan erforderlich. Erwartet
werden insbesondere:

- versionierte Provider-Capability- und Checkpoint-Contract-Referenzen statt
  MEXC-Literaltypen an RPC-Rändern;
- generische Page-Scope-/Checkpoint-MAC-Funktionen mit Domain Separation über
  Provider, Contract und Capability;
- generische Setup-/Revocation-Commands, die Provider- und Adapterpolicy
  serverseitig verifizieren;
- Runtime Enrollment mit explizitem Provider-/Konto-Grain statt MEXC-Singleton,
  wobei globale und providerbezogene Caps erhalten bleiben;
- providerneutrale Request-/Page-Commit-RPC-Versionen;
- explizite Versionen für Query-, Cursor-, Response-, Raw-Envelope- und
  Normalisierungsverträge;
- vollständige Composite FKs über Tenant, Provider, Konto, Activation und
  Capability, soweit die Parentgrains dies erfordern;
- Indizes auf RLS-, FK-, Claim-, Lease-, offenen Work- und Keysetpfaden.

### 9.3 Transaktionsgrenzen

Der Capture-Ablauf bleibt:

1. Work Unit in kurzer Transaktion claimen.
2. Gebundenen Requestplan erstellen, ohne Credentialzugriff gegen die Code
   Registry validieren und Request Authority in einer neuen kurzen Transaktion
   ausstellen; noch kein Credentialzugriff.
3. Transaktion schließen.
4. Im zentralen Egress den aktuellen globalen und für MEXC zusätzlich den
   Legacy-Runtimewert neu lesen; Mode/Purpose muss exakt passen. Danach den
   Permit unter Parentlocks einschließlich Database Registry, Requestplan und
   purposebezogener Capture- oder Probe-Authority vollständig revalidieren,
   single-use verbrauchen und den Send-Linearisierungspunkt persistieren.
5. Nach Commit Runtime-Mode/Purpose und Code Registry erneut prüfen. Erst dann
   exakt gebundene persistierte Credentialgeneration beziehungsweise den
   ephemeren Probe-Handle kurzzeitig laden, signieren und Request ausführen.
6. Response vollständig validieren und digestsicher kanonisieren.
7. Page, Raw Events, Observations, Zähler und Checkpoint in genau einer kurzen
   CAS-geschützten Committransaktion persistieren.
8. Credentialmaterial nullen; Lease erneuern, freigeben oder kontrolliert
   yielden.

Der Pre-Enrollment-`connection_probe` verwendet ausdrücklich keinen Claim,
keine Capture Work Unit, kein Enrollment und keine Activation:

1. Secretfreien ownergebundenen Setup Command anlegen; Credentialmaterial nur
   als invocationgebundenen ephemeren Handle im Egress halten.
2. Probe-Requestplan ohne Handleauflösung kanonisieren, vollständig gegen die
   Code Registry prüfen und nur bei aktuell effektivem Mode `probe` einen an
   Setup, Profil, Session, Budget, Runtime-Authority und Plan gebundenen
   Single-use-Permit ausstellen.
3. Unmittelbar vor Consumption Global-/Legacywert neu lesen und in kurzer
   Transaktion Database Registry, probe-fähigen/nicht suspendierten
   Descriptor, Owner, Setup Command, Profil, Session, Budget, Runtime-
   Authority, vollständigen Plan und Digest prüfen; Permit atomar verbrauchen.
4. Nach Commit Mode/Purpose, Runtime-Authority, Code Registry und vollständigen
   Plan erneut prüfen; erst dann ephemeren Handle auflösen, signieren und
   senden.
5. Response begrenzt validieren und ausschließlich sanitisiertes
   Probe-/Failure-Resultat persistieren; noch keine Connection-, Konto-,
   Activation-, Enrollment-, Work-Unit- oder Raw-Capture-Persistenz.
6. Handlematerial in jedem Exitpfad nullen. Der optionale atomare Apply bleibt
   ein separater Schritt erst nach vollständigem, unverändertem Probeprofil.

Während eines externen HTTP-Requests bleibt keine Datenbanktransaktion offen.
Separate Check-then-insert-Sequenzen werden durch atomare RPCs und
`INSERT ... ON CONFLICT` ersetzt. Lockreihenfolge ist über alle Provider
identisch zu definieren.

### 9.4 RLS und Privilegien

- RLS bleibt auf allen tenantbezogenen Brokerobjekten aktiv.
- Einfache Ownerreads verwenden `(select auth.uid()) = user_id`.
- Alle RLS- und Composite-FK-Spalten werden passend indexiert.
- `PUBLIC`, `anon`, `authenticated` und `service_role` erhalten keine direkte
  DML auf Provider-/Capability-Registry, Enrollment, Activation, Suspension,
  Versionsfreigaben, Credentials, Raw, Normalisierung, Candidate Revision,
  Approval oder Provenienz.
- Kritische RPCs verwenden leeren `search_path`, explizite Schemas,
  Ownership-/Parentprüfung und minimale Grants.
- `service_role` wird nicht als alleinige Tenantgrenze betrachtet.
- Provideradapter erhalten keinen direkten, frei parametrierbaren SQL-Zugriff.
- Dedizierte `NOLOGIN`-/`NOINHERIT`-Authorities für Operator-Control-Plane und
  Runtime sind getrennt; die Runtime kann ihre eigene Authority nicht
  registrieren, enrollen, entsuspendieren oder erweitern.

### 9.5 Keine stille Umschreibung historischer Evidenz

Historische MEXC-Raw-Events und Checkpoints werden nicht in-place auf einen
neuen Vertrag umgedeutet. Eine neue kanonische Version referenziert den alten
Raw-Grain oder erzeugt eine explizite neue Revision. Alte Digests,
Contractversionen und Auditspuren bleiben reproduzierbar.

## 10. Normalisierung, Reconciliation und Import

### 10.1 Adapter-Normalisierung

Jeder Provideradapter liefert dieselben kanonischen Zielgrains, aber nur für
belegte Felder. Pro Feld beziehungsweise Finanzkomponente werden mindestens
Source, Authority, Currency, Contractversion und Mappingversion gebunden.

Ein zweiter Provider darf keine neuen Pflichtfelder in den Kern zwingen. Neue
fachliche Konzepte werden entweder:

- in ein bereits vorhandenes kanonisches Feld sauber abgebildet;
- als versionierte Providerextension erhalten;
- oder als neue providerübergreifende Domänenentscheidung eingeführt.

### 10.2 Reconciliation

Reconciliation ist providerneutral und arbeitet auf kanonischen Grains. Sie
enthält keine Endpoint-, HTTP-, Signatur- oder Payloadlogik. Providerabhängige
Semantik wird über versionierte Evidence- und Authorityobjekte zugeführt.

### 10.3 Approval und Import

Die bisherigen Hard Gates bleiben unverändert:

- blockierte oder partielle Candidates sind nicht auswählbar;
- keine Vorauswahl;
- Auswahl und finanzielle Summen werden vor Bestätigung angezeigt;
- Approval bindet Nutzer, Konto, Candidate Revision, Regeln und Snapshotdigest;
- neue relevante Evidenz invalidiert Approval;
- Import ist serverseitig, ownergebunden, single-use, atomar und idempotent;
- manuelle Notizen, Tags und Bilder bleiben bei Revert erhalten;
- Captureerfolg erzeugt nie automatisch Journal-Trades.

## 11. Migrationsfolge

### 11.1 Reproduzierbarer Evidenzvertrag für MB0–MB7

MB0 legt vor der ersten Implementierungsänderung zwei benannte Artefakte an:

```text
docs/gates/EQUORA_v57.61.0_MULTI_BROKER_PARITY_EVIDENCE.json
docs/gates/EQUORA_v57.61.0_MULTI_BROKER_PARITY_MANIFEST.sha256
```

Das Evidence-JSON enthält mindestens:

- Schema- und Evidence-Formatversion;
- Baseline-Commit und Branch-Baseline;
- Node-, npm-, Git-, Docker-/PostgreSQL-Image- und Betriebssystemversion;
- exakte Befehlsargumente, Exitcode, Start-/Endzeit und Ergebniscounts;
- exakte Test-, Fixture-, Golden-, SQL-, Contract- und Sourcepfade;
- SHA-256 und Bytezahl jedes Inputs und relevanten Outputs;
- erwartete Testfile-/Testcase-Counts und benannte Golden-Digests;
- erlaubten Scope sowie explizite Nicht-Claims;
- getrennte lokale, CI-, Datenbank-, Providerbeobachtungs- und Releaseevidenz.

Jeder Laufversuch wird append-only erfasst. Fehlgeschlagene, abgebrochene und
wiederholte Läufe dürfen nicht durch spätere PASS-Läufe ersetzt oder aus Counts
und Zusammenfassung entfernt werden. Ein nicht reproduzierter Fehler bleibt
als solcher sichtbar; erneutes Auftreten eines Integritäts-/MAC-Fehlers ist
mindestens P2 und blockiert ein reproduzierbares MB0-/Release-PASS bis zur
Ursachenklärung.

**Bekannte Pre-MB0-Beobachtung aus der Docs-only-Validierung:** Diese
Beobachtung ist kein formaler MB0-Lauf und kein Produktfehlernachweis, muss aber
in den späteren MB0-Evidenzsatz übernommen werden.

```text
source_artifact_sha256 = 8d8e206255d80718585584c54c9f39c76b502c486fc6b9f58f1fd32f41a4b4ce
baseline_commit = be204e6094cfa34cb2ec69c0eb2f35d7359a91eb
toolchain = node v24.18.0; npm 11.16.0; git 2.53.0.windows.2; Windows
first_command = npm.cmd test
first_start = 2026-08-13T22:22:26+02:00
first_result = 22/23 test files; 379/380 tests; exit 1
failed_test = tests/mexc-capture-orchestrator.test.ts > closed MEXC capture orchestrator > serializes an authentic committed page into the closed server-only RPC contract
expected_transition_mac = 649a5134e60d5543d8e46737ae627850170431acccb925d430904295f17d0dee
observed_transition_mac = ca990a36388f6119218955455dfa2011bc6ea099c4e2dbf818b04dc7e6f2b7a3
targeted_repeats = 5/5 complete runs PASS; 42/42 each; starts 22:23:25 through 22:23:38+02:00
full_suite_repeats = 3/3 complete runs PASS; 23/23 and 380/380 each; starts 22:23:46 through 22:23:58+02:00
intervening_product_test_config_changes = none
status = one-time currently not reproduced; root cause unresolved
```

Das SHA-256-Manifest bindet das Evidence-JSON und alle dort als normativ
aufgeführten textuellen Verträge, Fixtures, Goldens und Resultate. Es verwendet
eine dokumentierte kanonische Byte-/Zeilenendenpolicy; ein Validator muss das
Manifest aus einem frischen Checkout reproduzieren. Nach jeder Änderung wird
der gesamte betroffene Snapshot neu gehasht und erneut reviewt. Alte Manifeste
werden nicht still überschrieben.

Die Baseline-Paritätsmatrix umfasst mindestens diese vorhandenen Testpfade:

```text
tests/application-contracts.test.ts
tests/mexc-egress-boundary.test.ts
tests/mexc-readonly-transport.test.ts
tests/mexc-readonly-probe.test.ts
tests/mexc-pagination.test.ts
tests/mexc-oracles.test.ts
tests/mexc-sync-scope.test.ts
tests/mexc-capture-orchestrator.test.ts
tests/mexc-capture-runtime.test.ts
tests/broker-raw-ledger.test.ts
tests/broker-capture-control.test.ts
tests/broker-capture-route.test.ts
tests/broker-runtime-control.test.ts
tests/broker-runtime-deployment.test.ts
tests/broker-capture-scheduler.test.ts
tests/broker-preview.test.ts
tests/sql-contracts.test.ts
```

MB0 führt auf dem unveränderten Baseline-Commit reproduzierbar aus:

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd audit --omit=dev
npm.cmd run typecheck
npm.cmd test
npm.cmd run release:check
npm.cmd run build
```

CI verwendet dieselben fachlichen Gates unter dem in
`.github/workflows/ci.yml` gepinnten Node `24.18.0`. Lokale Abweichungen der
Toolchain werden im Evidence-JSON ausgewiesen und nicht als identische
CI-Evidenz dargestellt. Der erwartete Baselinecount ist erst der tatsächlich
aus dem unveränderten Baseline-Lauf aufgezeichnete Count; spätere Phasen dürfen
ihn nicht aus diesem Dokument abschreiben. Neue oder entfernte Tests benötigen
eine begründete Manifeständerung.

Für MB1–MB4 gilt je Phase:

1. exakt betroffene Tests plus neue Contract-/Negativtests;
2. `npm.cmd run typecheck`;
3. vor Integration die vollständige Suite `npm.cmd test`;
4. `npm.cmd run release:check`;
5. `npm.cmd run build`;
6. Rehash des Evidence-/Parity-Manifests und unabhängiger Review.

MB3 erzeugt zusätzlich mindestens diese ausführbaren lokalen Testentrypoints;
das Gate bleibt geschlossen, solange ein Pfad fehlt:

```text
tests/sql/run-v57.61.0-multibroker-fresh.ps1
tests/sql/run-v57.61.0-multibroker-upgrade.ps1
tests/sql/run-v57.61.0-multibroker-compatibility.ps1
tests/sql/run-v57.61.0-multibroker-partial-failure.ps1
tests/sql/run-v57.61.0-multibroker-drift.ps1
tests/sql/run-v57.61.0-multibroker-concurrency.ps1
```

Die SQL-Matrix bindet konkrete Ausgangsstände:

- **Fresh:** leere disposable PostgreSQL-/Supabase-kompatible Datenbank; zuerst
  vollständiges aktuelles v57.61.0-Deploymentskript, danach das additive
  Multi-Broker-Delta.
- **Upgrade:** disposable Datenbank aus dem Schema-/Migrationsstand des
  Baseline-Commits `be204e6094cfa34cb2ec69c0eb2f35d7359a91eb` mit exakt den
  sieben erwarteten v57.61.0-Receipts; danach genau das additive Delta.
- **Re-run:** dasselbe Delta erneut; null semantische Drift und keine neue
  Receiptgeneration.
- **Old App/New Schema:** Anwendung am Baseline-Commit gegen das additive
  Schema bei Runtime `off`; bestehende MEXC- und Nicht-Broker-Funktionen bleiben
  kompatibel.
- **New App/Old Schema:** neue Anwendung gegen Baselineschema; Brokerpfade
  erkennen die fehlende v2-Authority fail-closed, führen null Credentialzugriff
  und null Brokerrequest aus, Nicht-Broker-Funktionen bleiben prüfbar.
- **Partial Failure:** jeder transaktionale Failpoint hinterlässt entweder den
  vollständigen Vorgängerzustand oder den exakt dokumentierten, harmlosen
  additiven Zwischenstand ohne Marker/Authority-Aktivierung. Nichttransactionale
  Schritte werden separat gereceiptet und sind idempotent fortsetzbar.
- **Recovery:** Production-Rollback bedeutet bei additiv kompatiblem Schema
  zunächst alte App plus neues Schema und Runtime `off`; destruktiver
  Schemadowngrade ist nicht der Standard. Inkompatibilität verlangt
  forward-only Repair nach neuem Gate.

Die v1-RPCs bleiben im Kompatibilitätsfenster. Ihre spätere Entfernung ist ein
separates Gate und verlangt mindestens: keine Code-/SQL-/Dashboard-/Runbook-
Caller, vollständig migrierte Parents und Work Units, abgelaufenes
Rollbackfenster, grüne Old-/New-Kompatibilitätsmatrix, Backup-/Restoreevidenz
und neue Nutzerfreigabe.

MB7 bindet an denselben finalen Snapshot:

- Commit, Tree, Arbeitsbaum-/Indexscope und CI-Lauf;
- vollständige Test-, SQL-, Build- und Release-Check-Evidenz;
- Release-Allowlist und Filelist;
- Hashes von Releasepaket, Sidecar, Filelist und allen Gateartefakten;
- Extraktion in ein frisches Verzeichnis und byteweiser Allowlistvergleich;
- Secret-/Credential-/Payloadscan des Quell- und extrahierten Pakets;
- Backupidentität und einen tatsächlich ausgeführten Restore-Rehearsal-Nachweis
  vor Pilot-, Kunden-, Broker- oder Runtimebetrieb;
- A3-/A4-/A5-Voten auf exakt denselben Hashsnapshot.

Kein MB-Gate darf `PASS`, „unverändert“ oder „reproduzierbar“ behaupten, bevor
die zugehörigen Artefakte und Läufe tatsächlich erzeugt und hashgebunden
geprüft wurden. Das vorliegende Dokument definiert den Vertrag, es erfüllt ihn
nicht bereits selbst.

### Phase MB0 – Architekturfreeze und Abhängigkeitscontract

**Lokaler Scope**

- dieses Zielbild reviewen;
- die in 11.1 benannten Evidence-JSON-/Manifestartefakte erzeugen und den
  unveränderten Baseline-Lauf samt tatsächlicher Toolchain, Befehlen, Counts,
  Pfaden, Hashes und Nicht-Claims darin erfassen;
- Dependency-Richtung und verbotene Imports als Tests festlegen;
- Provider-, Capability-, Checkpoint-, Error- und Raw-Envelope-Verträge
  typisieren;
- MEXC-Verhaltensparitätsmatrix einfrieren;
- keine Runtime-, SQL- oder UI-Verhaltensänderung.

**Gate MB0**

- A3/A4/A5 finden keine offenen P0–P2-Befunde;
- Evidence-JSON und SHA-256-Manifest sind aus einem frischen Checkout mit der
  dokumentierten Byte-/Zeilenendenpolicy reproduzierbar;
- die Baselinebefehle aus 11.1 sind tatsächlich ausgeführt und ihre Resultate
  an denselben Snapshot gebunden;
- keine Aussage behauptet einen betriebsfähigen zweiten Broker;
- MEXC-/Production-Sperren sind explizit erhalten.

### Phase MB1 – Providerneutrale Core Types und Adapterfacade

**Lokaler Scope**

- `ProviderCapabilityRef`, Work Unit, Fehlerklassen und Raw Envelope einführen;
- den providerneutralen secretfreien Setup-Command, Probe-Work,
  `AuthorizedConnectionProbePermit` und atomaren Apply-Vertrag einführen;
- bestehende MEXC-Module hinter `ReadOnlyBrokerAdapter` kapseln;
- den bestehenden MEXC-Transport hinter das einzige zentrale Broker-Egress-
  Modul verschieben; Adapter liefern nur nicht sendefähige Requestpläne;
- bestehende öffentliche MEXC-Pfade über kompatible Facades erhalten;
- noch keine Datenbankänderung.

**Gate MB1**

- vorhandene MEXC-Tests unverändert grün;
- neue Contract-/Dependencytests grün;
- gemeinsamer Authority-Kern, Capture Work Unit/Claim/Capture-Permit und Probe
  Setup Command/Work/Probe-Permit binden ihre Pins jeweils identisch innerhalb
  derselben Purpose-Kette; Capture- und Probe-Tupel bleiben domain-separiert;
- für jeden gemeinsamen und purpose-spezifischen Pin existiert mindestens ein
  fail-closed Mismatchtest vor Credential-/Handlezugriff und Egress;
- Cross-Purpose-, falscher-Tupeltyp- und Digest-Replaytests enden mit
  Credential-/Handle-Loader- und Requestcount null;
- kein Kerninterface enthält MEXC-Typen oder freie HTTP-Parameter;
- kein Adapter importiert Netzwerkprimitive, Broker-SDKs oder sendefähige
  WebSockets;
- Egress-Negativtests bestätigen weiterhin GET-only für MEXC.

### Phase MB2 – Generischer Capture Coordinator

**Lokaler Scope**

- Route auf providerneutralen Dispatcher umstellen;
- Claim-/Authority-/Failure-/Page-Commit-Verträge vom MEXC-Typsystem lösen;
- Adapter ausschließlich über gepinnte Work-Unit-Authority auflösen;
- vollständig gebundene kurzlebige Single-use-Permits und den atomaren
  Send-Linearisierungspunkt einführen;
- Probe- und reguläre Capture-Requests nur über denselben zentralen Egress,
  aber über getrennte Authority-Grains und Permittypen ausführen;
- synthetische Fake-Adapter nur in Tests verwenden.

**Gate MB2**

- MEXC-Verhaltensparität für Claim, Authority, Egress, Pagination, Commit,
  Retry, Yield, Lease und Failure nachgewiesen;
- unbekannter Provider/Adapter/Capability führt zu null Credentialzugriff und
  null Request;
- Permit-Replay, Expiry, Scope-/Requestdigest-Mismatch, stale Row Version,
  Environment-/Provider-/Contract-/Adapter-/Descriptor-/Profil-/Policy-
  Mismatch, Lease-/Epoch-Drift, falsche Sequenz und falsche
  Credentialgeneration scheitern vor Credentialzugriff;
- falsche Methode, Origin, Port, Pfadtemplate/-wert, Queryshape/-wert,
  Redirectmodus, Response-/Timeoutlimit, Plancontract oder ein aus dem
  tatsächlichen Plan neu berechneter Digest-Mismatch lassen den
  Credential-Loader-Aufrufzähler exakt null;
- Mode-, Konfigurationsdigest-, Deploymentidentitäts- und Runtime-Authority-
  Epochwechsel zwischen Claim, Permitausstellung, finalem Consume und dem
  Zugriff nach Commit bleiben mit null Credentialzugriff und null Request;
- Decrypt-/Revoke- und Generation-/Suspension-Racetests belegen: gewinnt die
  Invalidierung den finalen CAS, entstehen null Credentialzugriffe und null
  Request; nach Send-Linearisierung wird nur der bereits autorisierte Request
  beendet und jeder Folgerequest blockiert;
- Fake-Adapter kann keine Mutation in das Interface einschleusen.

### Phase MB3 – Additives Datenbankdelta

**Lokaler Scope**

- v2-RPCs und versionierte Capability-/Checkpointpins additiv einführen;
- getrennte Operator-Control- und Runtime-Authorities mit disjunkten RPCs,
  Rollen und Receipts einführen;
- bestehende MEXC-v1-Daten und RPCs im Kompatibilitätsfenster erhalten;
- lokale Wegwerf-Datenbanken für Migration, Drift, Concurrency und RLS nutzen;
- keine Production-SQL-Aktion.

**Gate MB3**

- alle in 11.1 benannten SQL-Entry-Points für Fresh, Upgrade, Compatibility,
  Partial Failure, Drift und Concurrency existieren und sind grün;
- Fresh-, Upgrade-, Re-run-, Old-App/New-Schema-, New-App/Old-Schema-, Partial-
  Failure-, Recovery-, Drift-, Concurrency- und Roll-forward-Matrix grün;
- Composite FKs, RLS, Grants, Indizes und Lockreihenfolge geprüft;
- direkte Control-Plane-DML ist für `PUBLIC`, `anon`, `authenticated` und
  `service_role` nachweislich entzogen; Runtime kann sich nicht selbst
  registrieren, verifizieren, enrollen oder entsuspendieren;
- Registry-/Enrollment-/Activation-/Suspension-Mutationen bestehen CAS-,
  Replay-, Generation- und Auditreceipt-Tests;
- alte MEXC-Raw-Evidenz bleibt byte- und digestreproduzierbar;
- kein Default aktiviert Runtime oder Enrollment.

### Phase MB4 – Providerneutrale Connection UI

**Lokaler Scope**

- generische Provider-/Connectionübersicht;
- providerspezifische Setupfelder in getrennten Komponenten;
- Connection-Setup ausschließlich über den providerneutralen Setup-/Probe-
  Vertrag aus 6.7; die UI erhält weder ephemeres Credentialmaterial noch ein
  sendefähiges Requestobjekt;
- gemeinsame Read-only-, Datenherkunfts-, Coverage- und Fehlerzustände;
- MEXC-Funktionalität und Claims unverändert halten.

**Gate MB4**

- Accessibility, Tastaturbedienung und Nicht-Farb-Codierung geprüft;
- keine Credentials in Clientlogs, URL, Analytics oder Screenshots;
- UI behauptet weder technische Gesamtrechteprüfung noch vollständige Historie;
- technischer Leseerfolg, Read-only-Attestierung, technisch beobachtbare
  Permissionevidenz und Account-Identity werden getrennt dargestellt;
- fehlgeschlagener, abgelaufener oder widerrufener Probe hinterlässt keine
  aktive Connection, Activation, Enrollment, Capture Work Unit oder
  persistierte Credentials;
- kein Connection-Setup löst automatischen Capture oder Import aus.

### Phase MB5 – Auswahl und Vertrag des zweiten Providers

**Scope erst nach separater Nutzerentscheidung**

- Nutzer-/Marktbedarf und Providerkandidaten bewerten;
- aktuelle offizielle Dokumentation sichern;
- Providervertrag, Capability-Matrix, Rechte-, Retention-, Pagination-,
  Rate-Limit-, Grain- und Fehlervertrag erstellen;
- ein minimales, versioniertes Probeprofil mit exakten Capabilitydescriptors,
  Authoritypins, Requestreihenfolge, Gesamtbudget, Deadline,
  Permissionevidenz- und Identity-Erwartung definieren;
- synthetische/anonymisierte Fixtures und Golden Cases definieren.

**Gate MB5**

- Produktentscheidung benennt Provider, Kontotyp und Markt;
- A4 bestätigt die Read-only-Grenze;
- A5 bestätigt Grains, Currency-, Fee-, Funding-, Position- und PnL-Semantik;
- A3 bestätigt reproduzierbare Fixture-/Contracttests;
- Probeprofil und jeder seiner erlaubten Reads besitzen synthetische
  Positivfälle sowie Pin-, Replay-, Budget-, Timeout-, Partial-Success- und
  Apply-Negativfälle;
- weiterhin kein echter Providerrequest ohne eigenes Probe-Gate.

### Phase MB6 – Zweiter Adapter, ausschließlich Non-Production

**Scope nur nach MB5 und neuer Requestfreigabe**

- Adapter lokal implementieren;
- zunächst Public-/Fixturetests;
- danach eng begrenzte, separat freigegebene Non-Production-Read-Probe
  ausschließlich über Setup Command, vollständiges gepinntes Probeprofil,
  einen Single-use-Permit je Read und das zentrale Broker-Egress;
- sanitiserte Evidenz und Golden-Test-Abgleich;
- kein Production-Enrollment und kein Journalimport.

**Gate MB6**

- Providerbeobachtung bestätigt nur den exakt getesteten Scope;
- nur ein vollständig erfolgreiches Probeprofil ist apply-fähig; Teilresultate
  aktivieren und persistieren nichts, und ein erfolgreicher Apply erzeugt weder
  Capture Enrollment noch Importauthority;
- keine offenen P0–P2-Befunde;
- Capture, Reconciliation und Approval bleiben getrennt;
- Production bleibt gesperrt.

### Phase MB7 – Releaseentscheidung

Erst hier werden vollständige Regression, Releaseartefakt, Migration,
Backup/Restore, Deploymentwirkung, Runtimekonfiguration und operatives Runbook
als eigener Release-Scope bewertet. Merge, Deployment, Production-SQL,
Enrollment, Cron und jeder Brokerrequest benötigen jeweils die dafür konkrete
Freigabe.

## 12. Test- und Reviewvertrag

### 12.1 Architekturtests

- kein Import von `mexc-*` aus `broker-core` oder Importpipeline;
- kein Provideradapter importiert Journalmutationen;
- kein Provideradapter importiert `fetch`, Netzwerkbibliotheken, Broker-SDKs
  oder sendefähige WebSockets; repositoryweit besitzt genau das zentrale
  server-only Broker-Egress-Modul Broker-Netzwerkautorität;
- kein Runtimepfad akzeptiert freie URL oder freie HTTP-Methode;
- Registryauflösung bindet exakt Environment, Provider-, Contract-, Adapter-,
  Capability- und Descriptorversion/-digest, Capabilityprofil und sämtliche
  Authority-Policyversionen;
- unbekannte oder widersprüchliche Pins fail-closed;
- jeder gemeinsame Authoritypin wird isoliert in Capture- und Probe-Kette
  variiert; Capture-spezifische Pins werden gegen Work Unit, Claim und Capture-
  Permit, Probe-spezifische Pins gegen Setup Command, Probe Work und Probe-
  Permit geprüft; kein Mismatch erreicht Credential-/Handlezugriff oder Egress;
- jeder einzelne Common-, Capture- sowie Setup-/Probe-/Ephemeral-/Apply-
  Policypin besitzt einen Mismatch- und Stale-Policy-Replayfall; Capture-
  Policies im Probe-Tupel und Probe-Policies im Capture-Tupel werden bereits
  beim Schema-/Digestcheck mit Loader- und Requestcount null abgelehnt;
- `authorityPurpose` und Tupelcontract sind Teil der Digestdomain;
  Cross-Purpose-, falscher-Tupeltyp- und Digest-Replayfälle haben Loader- und
  Requestcount null;
- alle Capabilitydescriptors setzen `mutations_forbidden` effektiv durch;
- `off`, `probe`, `capture`, fehlende, leere, unbekannte und bei MEXC
  widersprüchliche Global-/Legacywerte werden an beiden Egress-Prüfpunkten
  gegen `authorityPurpose` getestet; ein Mismatch bleibt vor
  Credential-/Handle-Auflösung und Request;
- die Runtime-Authority bindet bei Ausstellung und finalem Consume den aktuell
  neu berechneten Konfigurationsdigest, die Deploymentidentität und Epoch;
  Mode-/Konfigurations-/Deployment-/Epochwechsel vor oder nach Consumption
  lassen den Credential-/Handle-Loader-Aufrufzähler exakt null;
- tatsächliche Planfelder werden kanonisiert, der unsigned Digest wird im
  Egress neu berechnet und gegen Code Registry, Database Registry und Permit
  geprüft; Methode-, Origin-, Port-, Pfad-, Query-, Redirect-, Limit-,
  Descriptor-/Registry- oder Digestabweichung erreicht den Loader nie;
- Capture-Permits sind im Modus `probe`, Probe-Permits im Modus `capture` und
  beide Permitarten im Modus `off` unverwendbar;
- Single-use-Permit und Send-Linearisierungsreceipt binden alle Authoritypins;
  Replay, Expiry und Race-Verlierer bleiben ohne Credentialzugriff/Egress.

### 12.2 MEXC-Verhaltensparität

- Request-Signatur und kanonische Query unverändert;
- Origin-, Pfad-, Redirect-, Timeout- und Bodylimits unverändert;
- Oracle- und Fehlerklassifikation unverändert;
- Page-/Scope-/Checkpointdigests reproduzierbar;
- Raw Event Membership und Observation-Dedupe unverändert;
- Claim-/Lease-/Authority-/Failure-/Commit-CAS unverändert;
- Runtime `off` ergibt null Credentialzugriff und null Brokerrequest.

### 12.3 Provideradapter-Contracttests

Jeder Adapter benötigt:

- Capability-Registry-Golden-File;
- erlaubte und verbotene Requestfälle;
- Shape-/Enum-/Pflichtfeld-Negativfälle;
- Pagination-, Wiederholung-, Late-Arrival- und Loopfälle;
- Retention-/Coverage-Grenzfälle;
- Fee-, Funding-, Contract-, Currency- und Position-Grains;
- Sanitization und Secret-Redaction;
- deterministische Raw-/Normalization-Digests;
- explizite unsupported-Fälle.

Zusätzlich läuft jeder Provider gegen dieselbe providerübergreifende
Reconciliation-Goldenmatrix. Sie bindet mindestens die bereits in
DEC-5761-007/008/010/011/018/020/021/024 festgelegten Fälle:

- Flat-to-Flat Position Cycles in One-way und Hedge Mode;
- Teilfills, Teil-Exits und eine Execution mit Close-/Open-Anteil beim Reversal;
- mehrdeutige Sequenz ohne belegte Providerordnung als
  `ambiguous_sequence` statt willkürlicher Zuordnung;
- gewichtete Preise und signed Inventory-/Mengenbilanz ohne Floatarithmetik;
- Gebühren, Funding und providergebuchtes PnL je autoritativer Quelle und
  Währung ohne Doppelzählung;
- fehlende oder widersprüchliche eventzeitliche Contractfamilien-, Instrument-
  oder Settlement-Authority als Candidate-Blocker;
- fehlt ausschließlich Contract Size beziehungsweise Multiplier-Einheit,
  bleiben native Contractmengen verwendbar; nur `base_quantity`, darauf
  beruhende wertbasierte Vergleichsgrößen und `local_valuation` werden
  `not_comparable`. Ein ansonsten vollständig `provider_booked` belegter
  Candidate wird dadurch allein nicht blockiert;
- fehlende oder widersprüchliche Fee-, Funding- oder PnL-Währung
  beziehungsweise deren Authority blockiert die betroffene Finanzkomponente,
  Netto-PnL, Approval und Import;
- offene Position, fehlende Funding-Expectation-Evidence, Late Arrival,
  Candidate-Revision und Approval-Invalidierung;
- idempotenter Import über Batchgrenzen und Revert unter Erhalt manueller
  Notizen, Tags und Bilder;
- `provider_observed_best_effort` mit sichtbarem
  `not_export_verified`/`silent_omission_risk`, niemals als globale
  Vollständigkeitsgarantie.

Providerfixtures liefern Eingaben für diese Matrix; sie dürfen die gemeinsamen
Erwartungen nicht durch providerspezifische Sonderregeln abschwächen. Ein Fall,
den ein Provider nicht belastbar speisen kann, wird ausdrücklich `unsupported`
oder `blocked` und nicht aus der Matrix entfernt.

### 12.4 Connection-Probe- und Apply-Tests

- nur ein authentisierter Owner kann einen secretfreien Setup Command für den
  eigenen Tenant anlegen, lesen, widerrufen oder applyen;
- Credentialmaterial erscheint nie in Setup Command, Permit, Adapter,
  Requestplan, Log, URL, Analytics, Screenshot oder Testreport;
- Ephemeral-Handle, Session, Generation und intern domain-separierter
  Material-Binding-MAC sind
  invocationgebunden; Cross-Invocation-/Cross-Tenant-Auflösung und Replay
  scheitern, und jeder Exitpfad nullt das Material;
- jeder technische Read verbraucht genau einen kurzlebigen Single-use-Permit;
  Pin-, Scope-, Sequence-, Digest-, Row-Version-, Deadline- und
  Gesamtbudgetabweichungen scheitern vor Credentialzugriff und Egress;
- ein aktueller Runtime-Mode-/Purpose-Mismatch vor oder nach Permitconsumption
  scheitert vor Auflösung des ephemeren Handles und vor Egress; der konsumierte
  No-Send-Fall besitzt ein sanitisiertes fail-closed Receipt;
- Mode-, Konfigurationsdigest-, Deploymentidentitäts- und Runtime-Authority-
  Epochwechsel zwischen Setup, Permitausstellung, Consumption und
  Handleauflösung sind eigene Race-/Negativfälle mit Loader- und Requestcount
  null;
- technische Lesbarkeit, Read-only-Attestierung, beobachtbare
  Permissionevidenz und Account-Identity bleiben getrennte Resultate und
  erzeugen keine globale Rechte- oder Vollständigkeitsbehauptung;
- Partial Success, Providerfehler, Timeout, Widerruf, Ablauf und Apply-Digest-
  Mismatch hinterlassen keine Connection, kein Konto, keine Activation, kein
  Enrollment, keine Work Unit und keine persistierten Credentials;
- nur das vollständig erfolgreiche, unveränderte Probeprofil kann genau einmal
  atomar applyen; Parallel-Apply und Replay erzeugen keine Duplikate;
- auch ein erfolgreicher Apply lässt Activation policygebunden inaktiv und
  erzeugt weder Enrollment, Capture, Cron noch Journalimport.

### 12.5 Datenbanktests

- Fresh Schema und Upgrade von der freigegebenen Vorgängerversion;
- idempotenter Re-run;
- Constraint-/Index-/Function-Definition-Drift;
- Cross-Tenant- und Parent-Mismatch-Rejection;
- parallele Claims, Generationswechsel, Page-Replays und Imports;
- Lease Expiry, Recovery und konsistente Lockreihenfolge;
- RLS-/Grantmatrix einschließlich `anon`, `authenticated`, `service_role` und
  getrennten NOLOGIN-/NOINHERIT-Ownern für Operator-Control und Runtime;
- keine direkte Control-Plane-DML; Registry-/Enrollment-/Activation-
  Änderungen nur über CAS-, Purpose- und Receipt-gebundene Operator-RPCs;
- Permit-Replay, Expiry, Scope-/Digest-/Lease-/Credentialgeneration-Mismatch
  sowie Pause-/Revoke-/Suspension-Races am Send-Linearisierungspunkt;
- kurze Transaktionen ohne externen HTTP innerhalb einer DB-Transaktion.

### 12.6 Unabhängige Reviews

| Review | Veto-Scope |
|---|---|
| A3 QA/Release | fehlende Reproduktion, Paritätslücke, unvollständige Migration oder überzogene Claims |
| A4 Security/Authority | Credential-, Egress-, RLS-, Privilegien-, Logging- oder Mutationsgrenze |
| A5 Trading/Data Integrity | falscher Grain, Mengen-/Currency-/Fee-/Funding-/PnL- oder Reconciliationvertrag |
| A6 Product/UX | irreführende Read-only-, Coverage-, Vollständigkeits- oder Importclaims |

Kein Reviewer darf einen fehlenden Test als bestanden werten. Ein lokaler PASS
autorisiert keine externe Aktion.

## 13. Observability und Datenschutz

Zulässige Observability:

- Provider-/Capability-/Contractversion;
- sanitiserte Fehlerklasse und Supportreferenz;
- Request-, Page-, Event-, Repeat-, Gap- und Duration-Counts;
- Authority-, Lease-, Retry- und Budgetstatus;
- Responsegröße und HTTP-Statusklasse ohne Body;
- Capture-, Normalization-, Reconciliation- und Importstatus getrennt.

Verbotene Observability:

- API Key, Secret, Signatur oder entschlüsseltes Credential;
- rohe Providerkonto-ID;
- Requestheader oder vollständige Querystrings mit sensitiven Daten;
- Raw Body oder einzelne finanzielle Payloadwerte in Standardlogs;
- lokale Dateipfade oder Originaldateinamen eines Providerexports;
- Nutzerlabels als technische Identität.

Provider- und Konto-Cardinality in Metriken muss begrenzt werden. Runtimefehler
dürfen nicht durch unkontrollierte Providertexte zu High-Cardinality- oder
Secret-Leaks führen.

## 14. Risiken und technische Schulden

| Risiko | Schwere | Behandlung |
|---|---|---|
| Generische Modulnamen verbergen MEXC-Typkopplung | P2 | MB1/MB2 Dependency- und Contracttests |
| Datenbank ist strukturell generisch, mehrere RPCs/Funktionen sind semantisch MEXC-fest | P2 | additive v2-Verträge; keine riskante In-place-Umdeutung |
| Globales Runtime-Gate könnte versehentlich einen neuen Provider aktivieren | P1 | Konjunktion aus global off-by-default, Code Registry, DB Registry, Enrollment und Activation |
| Ein Universaltransport könnte Read-only umgehen | P1 | keine freie Methode/URL; konstante reviewte Capabilitydescriptors |
| Providerpayload als `unknown` könnte Validierung schwächen | P1 | begrenzte kanonische JSON-Validierung plus adapterspezifisches Oracle vor Commit |
| MEXC-Parität geht bei Extraktion verloren | P1 | Golden Digests, bestehende Tests, Characterization und negative Egress-Tests |
| Zweiter Provider wird zu früh auf MEXC-Grains gemappt | P1 | MB5 Data-Integrity-Gate vor Implementierung |
| Historische Evidenz wird durch neue Digestverträge unlesbar | P1 | versionierte Domain Separation und keine In-place-Umschreibung |
| Providerselection ohne echten Nutzerbedarf erzeugt Wartungskosten | P2 | eigener Produktentscheid mit Kosten-/Nutzen- und API-Qualitätsmatrix |
| UI-Modernisierung vermischt sich mit Brokerentkopplung | P2 | UI nur funktionale Connection Shell in MB4; visueller Modernisierungstrack separat |

## 15. Bewusst verworfene Alternativen

### 15.1 Bestehenden MEXC-Pfad kopieren

Ein zweiter Ordner mit kopierten Runtime-, Scheduler-, Persistence- und
SQL-Funktionen würde Security- und Datenintegritätslogik duplizieren. Fixes
würden divergieren und Cross-Provider-Verhalten wäre nicht vergleichbar.

### 15.2 Vollständig dynamische Adapter aus Datenbankkonfiguration

Freie Origins, Methoden, Pfade, Schemas oder Transformationsskripte in der
Datenbank verlagern Code-Review-Authority in Laufzeitdaten und vergrößern die
Angriffsfläche. Equora verwendet gebaute, versionierte Adapter plus eine
einschränkende Datenbankregistry.

### 15.3 Sofortige Umbenennung aller MEXC-Module

Dateinamenänderungen erzeugen große Diffs, ohne automatisch Verträge zu
entkoppeln. Zuerst werden Ports und Characterization Tests eingeführt; danach
können Module schrittweise verschoben werden.

### 15.4 Gemeinsames Capture-und-Import-Jobmodell

Dies würde erfolgreiche Leseerfassung mit fachlicher Importfreigabe vermischen.
Capture bleibt automatisch nur nach eigenem Gate möglich; Journalimport bleibt
immer Human-Approval-gebunden und getrennt.

### 15.5 Zweiten Broker vor MEXC-Paritätsfreeze implementieren

Ohne stabile Kernports würden Unterschiede des zweiten Providers den
Refactoringscope verunreinigen. Zuerst wird MEXC hinter dem Interface
stabilisiert, dann wird die Erweiterbarkeit mit einem neuen Vertrag geprüft.

## 16. Offene Entscheidungen

Diese Punkte sind absichtlich nicht still entschieden:

1. Welcher zweite Provider besitzt belegten Nutzerwert?
2. Futures, Spot oder beide Marktarten im ersten Multi-Broker-Scope?
3. Soll ein Provider mit read-semantischem `POST` grundsätzlich ausgeschlossen
   oder nach separatem A4-Gate capabilitybezogen zulässig sein?
4. Welche Provideridentität ist technisch stabil und minimal verfügbar?
5. Ist ein offizieller Providerexport notwendige Recoveryquelle oder nur eine
   spätere optionale Capability?
6. Wie lange bleibt die MEXC-Legacy-Runtimevariable kompatibel?
7. Welche normalisierten Grains werden vor einem zweiten Adapter tatsächlich
   implementiert, statt nur dokumentiert?
8. Welche SLA-, Kosten- und Supportgrenzen gelten je Provider?

Keine dieser offenen Entscheidungen blockiert MB0/MB1. Sie blockieren jedoch
den Beginn von MB5 beziehungsweise die jeweils betroffene Implementierung.

## 17. Definition of Done für den Architekturtrack

Der providerneutrale Architekturtrack ist erst abgeschlossen, wenn:

- der Brokerkern keine MEXC-Typen oder MEXC-Endpoints importiert;
- der MEXC-Adapter vollständig über den versionierten Read-only-Port läuft;
- der generische Coordinator ausschließlich gepinnte Work Units dispatcht;
- Datenbankauthority und Code Registry für jeden Request übereinstimmen müssen;
- Runtime ohne explizite mehrstufige Authority default-off bleibt;
- MEXC-Verhaltensparität einschließlich negativer Securityfälle belegt ist;
- Evidence-JSON, Manifest, Test-/SQL-/Build-/Releaseergebnisse und
  A3-/A4-/A5-Voten denselben Commit-, Tree-, Index- und Dateihashsnapshot
  binden und aus einem frischen Checkout reproduzierbar sind;
- Raw-, Normalization-, Reconciliation-, Approval- und Importgrenzen technisch
  erzwungen sind;
- Migrationen additiv, reproduzierbar und roll-forward-fähig sind;
- A3, A4 und A5 denselben hashgebundenen Scope ohne offene P0–P2-Befunde
  reviewt haben;
- kein zweiter Provider als unterstützt dargestellt wird, bevor dessen eigenes
  Provider-, Probe-, Golden-, Security- und Releasegate bestanden ist.

## 18. Autorisierungsgrenze dieses Dokuments

Dieses Dokument autorisiert keine Folgeaktion. Es kann nach einer neuen,
konkreten Nutzerfreigabe als Grundlage für weitere lokale Analyse,
Dokumentation oder einen klar begrenzten Code-/Testscope dienen. Ohne diese
Freigabe bleiben insbesondere gesperrt:

- Änderung von `EQUORA_MEXC_RUNTIME_MODE=off` oder Einführung/Aktivierung einer
  Production-Runtimevariable;
- MEXC- oder sonstige Brokerrequests;
- Credentialanlage oder -änderung;
- Cron, Scheduler-Enrolment oder automatischen Capture;
- Journalimport oder Human-Approval-Ausführung;
- Supabase-SQL, Migration, Repair, Restore oder Datenänderung;
- Vercel-Environment-, Deployment-, Promotion- oder Rollbackaktion;
- Staging, Commit, Push, Pull Request oder Merge.

Frühere Freigaben bleiben Historie der damals exakt ausgeführten Schritte und
sind keine Dauerfreigabe für diesen Architekturtrack.

# Equora v57.61.0 – Provider Contract v1 / MEXC Futures Adapter

## 0. Dokumentkontrolle

| Feld | Wert |
|---|---|
| Designstatus | `DESIGN_ACCEPTED v19 – G1 Egress/permit-expiry/cross-layer/v1-core hardening incorporated; G0 DESIGN ONLY` |
| Implementierungsstatus | `G1 IN PROGRESS – NO-GO`; lokale Parser-/Transport-, Capture-Control-, Lane-/Gap-/Health-, Activation-/Request-Authority- und inaktive Scheduler-/Lease-Control-Teildeltas vorhanden, produktive Runtime und Gesamtimplementierung offen |
| Providerevidenzstatus | `PARTIAL/CONTRADICTED`; konkrete GET-Pfade und Kernshapes beobachtet; Support nennt jüngsten Monat als operative API-Reichweite, garantiert aber keine Retention/Vollständigkeit; Exportformat öffentlich als Excel/PDF dokumentiert |
| Gate G0 | `GO – DESIGN ONLY`; Parser-/Transportevidenz folgt G1–G3 |
| Stand | 2026-08-08, Europe/Berlin |
| Architektur | Providerneutraler Brokerimport-Kern mit versionierten Adaptern |
| Adapter | `mexc-futures` |
| Contract-Version | `mexc-futures-contract/2026-08-05-g0.1` |
| Owner | A2 |
| Pflichtreviews | A5, A4, A3 |
| Non-Production-Beobachtung | Credentialfreie Public-Phase sowie eng begrenzte credentialgebundene Private- und Discovery-Phasen am 2026-08-04 durchgeführt; `observation_status=observed_nonprod`, `coverage_status=partial`; Discovery beobachtete Order-, Execution- und Fundingitems, aber kein Positionsitem und keine globalen Vollständigkeitsgarantien |

## 1. Vertragsgrenze

Der Provideradapter ist die einzige Schicht, die MEXC-Hosts, Pfade,
Authentifizierung, Providerfelder und Provider-Enums kennen darf. Der
providerneutrale Kern verarbeitet ausschließlich kanonische Objekte und
Capability-Resultate.

Der Vertrag ist fail-closed:

- Nur explizit erlaubte HTTPS-Hosts, HTTP-Methoden und Pfade sind zulässig.
- Unbekannte Responseformen, Enums, Pflichtfelder, Zeitsemantiken oder
  Identitäten blockieren die betroffene Work Unit.
- Ein Endpoint-, Symbol-, Zeitfenster- oder Seitenfehler wird niemals als
  erfolgreiche leere Datenmenge behandelt.
- Der Adapter darf keine Order-, Cancel-, Transfer- oder Withdrawal-Funktion
  exponieren.
- Ein erfolgreicher GET-Aufruf beweist Lesefähigkeit für diesen Endpoint, aber
  nicht das Fehlen anderer Rechte am API-Key.

„Order“ bezeichnet in diesem Vertrag ausschließlich einen bereits beim Broker
existierenden historischen Datensatz. `fetchHistoricalOrders` liest ihn; es
gibt keine Operation, die eine Brokerorder erzeugt. Das Erzeugen eines lokalen
Journal-Trade-Datensatzes nach Human Approval ist keine Brokeroperation.

## 2. Offizielle Quellen

MEXC-SRC-001 bis -019 wurden am 2026-08-04, MEXC-SRC-020/-021 am
2026-08-05 read-only abgerufen. Die Webdokumentation ist änderbar; vor
Implementierung und vor Release ist der Change Log erneut zu prüfen.

| ID | Offizielle Quelle | Verwendete Evidenz |
|---|---|---|
| MEXC-SRC-001 | [Futures API Change Log](https://www.mexc.com/api-docs/futures/update-log) | Basisdomain seit 2026-01-19; aktuelle Dokumentationsänderungen |
| MEXC-SRC-002 | [Integration Guide](https://www.mexc.com/api-docs/futures/integration-guide) | Basis-URL, Signatur, Request-Time, Recv-Window, API-Key-Hinweise |
| MEXC-SRC-003 | [Error Codes](https://www.mexc.com/api-docs/futures/error-code) | Auth-, Permission-, Rate-Limit-, Parsing- und Maintenance-Klassen |
| MEXC-SRC-004 | [Get Server Time](https://www.mexc.com/api-docs/futures/market-endpoints/get-server-time) | Serverzeit in Unix-Millisekunden |
| MEXC-SRC-005 | [Get Contract Info](https://www.mexc.com/api-docs/futures/market-endpoints/get-contract-info) | Contract Size, Assets, Präzision, Units, Status und Gebührenmetadaten |
| MEXC-SRC-006 | [Get All Historical Orders](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/get-all-historical-orders) | Order-Grain, Page-Parameter, Position Mode und Orderfelder |
| MEXC-SRC-007 | [Get Historical Order Deal Details](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/get-historical-order-deal-details) | Execution-Grain und aktueller `/v3`-Pfad |
| MEXC-SRC-008 | [Get Trade Records by Order ID](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/get-trade-records-by-order-id) | Order-Execution-Linkage und Fee-Sign-Hinweis |
| MEXC-SRC-009 | [Get Historical Positions](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/get-historical-positions) | Position-Grain, Position ID, PnL, Funding und Fee-Summen |
| MEXC-SRC-010 | [Get Funding Fee Details](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/get-funding-fee-details) | Kontobezogene Fundingrecords und Parametervertrag |
| MEXC-SRC-011 | [Get User Position Mode](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/get-user-position-mode) | Hedge-/One-way-Modus, jedoch widersprüchliches Beispiel |
| MEXC-SRC-012 | [Get Fee Details](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/get-fee-details) | Aktuelle kontobezogene Fee-Konfiguration, nicht historische gezahlte Gebühren |
| MEXC-SRC-013 | [Get Funding Rate History](https://www.mexc.com/api-docs/futures/market-endpoints/get-funding-rate-history) | Öffentliche Fundingrate je Settlement; keine Kontozahlung |
| MEXC-SRC-014 | [Account Data Export](https://www.mexc.com/support/article/how-to-use-mexc-s-account-data-export-function-410103096834075648) | Futures Position-/Order-/Trade-History, Capital Flow und Futures Statement; Excel oder PDF; bis zu drei Jahre pro Report, derzeit frühestens ab 2024-10-01; manueller Export, kein API-Retentionsnachweis |
| MEXC-SRC-015 | [Place Order](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/place-order) | Belegt, dass MEXC mit `POST /api/v1/private/order/create` und Permission `Order Placing` eine getrennte Schreibfähigkeit anbietet; für Equora ausdrücklich forbidden |
| MEXC-SRC-016 | [Cancel Orders](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/cancel-orders) | Belegt schreibendes Cancel über `POST`; für Equora forbidden |
| MEXC-SRC-017 | [Reverse Open Position](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/reverse-open-position) | Belegt schreibendes Reversal über `POST`; für Equora forbidden |
| MEXC-SRC-018 | [Close All](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/close-all) | Belegt schreibendes Schließen über `POST`; für Equora forbidden |
| MEXC-SRC-019 | [MEXC Futures Calculation Guide](https://www.mexc.com/support/article/mexc-futures-calculation-guide-312060306409668608) | Aktuelle USDT-M-/Coin-M-Formeln für Fee, Funding, Closing-/Unrealized-PnL und Mengenabbildung; keine historische API-Metadatenbindung oder Rundungsversion |
| MEXC-SRC-020 | [Futures Trading Help Center](https://www.mexc.com/support/futures-trading) | Aktuell angebotene USDT-M-, USDC-M- und Coin-M-Futures; Stablecoin- und Coin-Settlement bleiben unterschiedliche Contractklassen |
| MEXC-SRC-021 | [Common Questions About USDT-Margined and Coin-Margined Futures](https://www.mexc.com/support/article/common-questions-about-usdt-margined-and-coin-margined-futures-7421764332953) | USDT/USDC als Settlement bei Stablecoin-Margined Futures und Underlying-Coin als Settlement bei Coin-Margined Futures; belegt, dass ein globaler USDT-/USDC-Default falsch wäre |

Die ältere GitHub-Pages-Dokumentation unter
`mexcdevelop.github.io/apidocs/contract_v1_en/` wird nur als historische
Vergleichsevidenz verwendet. Bei Abweichungen hat die aktuelle Dokumentation
unter `mexc.com/api-docs/futures` Vorrang, solange ein Contract-Probe nichts
anderes belegt.

### 2.1 Nutzerbereitgestellte MEXC-Supportevidenz vom 2026-08-05

Der Nutzer stellte drei Supportantworten im vollständigen Wortlaut, jedoch ohne
persistierte Ticket-/Message-ID oder technisch verifizierbare
Absenderattestierung bereit. Sie werden deshalb als
`user_supplied_provider_support_statement` geführt, nicht als normativer
Providervertrag:

- Telegram „API Management“: keine feste Retention; Paging und Zeitbereiche
  vorhanden; Synchronisation über IDs/Timestamps; Order-Execution-Link über
  `orderId`; keine historischen Contract-Metadatensnapshots; Order-Placing für
  Lesen nicht erforderlich.
- MEXC Ticket Support: Futures-Transaktionsrecords über API nur für den jüngsten
  Monat; ältere Records über Account Data Export ab 2024-10-01; kein direkter
  CSV-Export; exakte Read-Permissionmatrix an Fachteam eskaliert;
  Pagination-/Sortier-/Completeness-/Historical-Metadata-/Linkage-Semantik
  nicht zusätzlich dokumentiert.
- MEXC Ticket-Fachbereich: relevante Futures-History-Endpoints sind mit `View
  Order Details` lesbar; `Order Placing` ist dafür nicht erforderlich. Aktuelles
  Ergebnisverhalten sei reverse chronological, neueste Records zuerst.

Die Retentionsaussagen werden nicht zu einer Garantie verschmolzen. Der Vertrag
speichert höchstens:

```text
support_claimed_operational_horizon = recent_one_month
support_claimed_history_permission = View Order Details
support_claimed_result_order = reverse_chronological_current_behavior
guaranteed_retention = unknown
guaranteed_completeness = false
```

Die Telegram-Aussage, es gebe keinen dedizierten Historical-Positions-
Lifecycle-Endpoint, ist gegenüber MEXC-SRC-009 zu eng: Ein Historical-
Positions-GET ist offiziell dokumentiert. Unbelegt bleiben trotzdem
vollständige Cycle-Grenzen und eine lückenlose Lifecycle-Rekonstruktion.

Die Permissionaussage stimmt mit den endpointbezogenen öffentlichen
Dokumentationszeilen überein und schließt die fachliche Mappingfrage für das
gepinnt definierte History-Profil auf Designebene. Sie beweist nicht, dass ein
konkret hinterlegter Key ausschließlich diese Rechte besitzt; Nutzerattestierung
und gegebenenfalls technische Permissionintrospection bleiben getrennt. Die
Sortieraussage ist ein aktueller Supportclaim, keine stabile API-Garantie.

### 2.2 Lokaler Source-Snapshot der bestehenden Vorschau

Read-only geprüft am 2026-08-04:

- `lib/server/mexc-readonly.ts` enthält nur Serverzeit, historische Orders und
  historische Executions als Brokerpfade;
- der private Requesthelper setzt explizit `method: 'GET'`; der öffentliche
  Zeitabruf verwendet den Fetch-Default `GET`;
- im lokalen MEXC-/Broker-Scope wurde kein Place-, Modify-, Cancel-, Reverse-,
  Close-, Transfer- oder Withdrawal-Pfad gefunden;
- es existiert jedoch keine einschlägige Testsuite;
- der generische interne `fetchJson(url, init)`-Helfer akzeptiert ein freies
  `RequestInit` und verbietet Redirects nicht ausdrücklich;
- `toRecordArray` filtert malformed Arrayelemente und liefert für unbekannte
  Shapes `[]`, statt den Pagevertrag sichtbar zu blockieren (BRI-028);
- der Serverzeitparser verwendet bei fehlendem/nichtfinitem `data` still
  `Date.now()` (BRI-030);
- Host und Execution-Pfad sind gegenüber der aktuellen Dokumentation veraltet,
  wie BRI-018 bereits festhält.

Damit ist belegt, dass der vorhandene Stand derzeit nur GETs aufruft. Nicht
belegt ist eine strukturelle Garantie gegen spätere Regressionen. Diese Lücke
ist BRI-022 und muss vor G1 durch einen engeren Transportvertrag und
Negativtests geschlossen werden.

## 3. Providerneutrales Adapterinterface

Jeder Brokeradapter muss logisch folgende Funktionen erfüllen. Dies ist ein
Architekturvertrag, noch keine TypeScript-Signatur.

| Operation | Ergebnis | Fail-closed-Bedingung |
|---|---|---|
| `probeReadCapability` | Endpoint-Lesetest und Nutzerattestierung getrennt | Keine Behauptung technischer Read-only-Gesamtrechte |
| `fetchInstrumentMetadata` | Versionierte Instrument-/Contract-Metadaten | Fehlende Mengen-/Währungssemantik blockiert Normalisierung |
| `fetchHistoricalOrders` | Page Result mit Raw Orders und Checkpointdaten | Unklare Page-/Zeitsemantik oder Shape-Abweichung |
| `fetchHistoricalExecutions` | Page Result mit Raw Executions | Fehler/Shape-Abweichung darf nicht zu `[]` werden |
| `fetchHistoricalPositions` | Position-/Lifecycle-Evidenz | Unklarer Modus, Side oder Position-Key |
| `fetchFundingHistory` | Kontobezogene Fundingevents | Öffentliche Fundingrate ersetzt keine Kontozahlung |
| `fetchAccountIdentity` | Stabiler, minimierter Account-Scope oder `unsupported` | Keine Ableitung aus Label oder Symbol |
| `inspectSourceArtifact` | Format-/Größen-/Hash-/Containerklassifikation ohne Makro- oder Formelausführung | Unbekanntes, verschlüsseltes, makrobehaftetes oder übergroßes Artefakt wird vor Parserzugriff abgelehnt |
| `parseProviderExport` | Versioniertes File-Result mit Row-/Sheet-Counts und Raw Events | Nur explizit gegatetes Provider-/Dateiprofil; unbekannte Sheets/Headers/Typen blockieren |
| `classifyError` | Kanonische Fehlerklasse plus sanitisiertes Detail | Raw Providerpayload, Signatur oder Credential in Logs |
| `normalize*` | Kanonische Decimal-/UTC-Objekte | Unbekannte Enums/Pflichtfelder blockieren |

Capability-Evidenz wird nicht in einem einzigen, durch Fixtures erreichbaren
Status vermischt. Jede Vertragsversion führt getrennt:

| Dimension | Werte |
|---|---|
| `support_state` | `candidate`, `unsupported`, `forbidden`, `suspended` |
| `documentation_state` | `documented_unambiguous`, `documented_ambiguous`, `missing` |
| `adapter_fixture_state` | `not_run`, `passed`, `failed` |
| `provider_observation_state` | `not_approved`, `not_run`, `observed_nonprod`, `contradicted` |
| `provider_support_state` | `not_requested`, `confirmed`, `contradicted` |
| `import_eligibility` | `blocked`, `read_preview_only`, `eligible` |
| `source_channel` | `provider_api_observation`, `provider_export_file` |

Ein synthetisches oder aus Dokumentationsbeispielen nachgebildetes Fixture
beweist ausschließlich Adapterverhalten gegen diesen Testinput. Es kann weder
reales Providerverhalten, Retention, Page-Snapshot-Stabilität noch Late
Arrivals bestätigen und niemals allein `import_eligibility = eligible`
erzeugen.

Für globale oder historische Vollständigkeitsclaims müssen alle benötigten
Shape-, Feld-, Sortier-, Fenster-, Paging- und Retentioneigenschaften entweder
unzweideutig offiziell dokumentiert oder durch separat genehmigte,
anonymisierte Non-Production-Beobachtung beziehungsweise bestätigte
Providersupportevidenz belegt sein; zusätzlich müssen die Adapter-Fixtures
bestehen. MEXC v57.61.0 erhebt keinen solchen Globalclaim. Wiederholt
beobachtete Scopes werden als `provider_observed` und niemals als
`provider_guaranteed_complete` ausgewiesen. `observed_stable` belegt nur
identische Beobachtungen und kann allein keine Importeligibility erzeugen. Der
Nutzer hat am 2026-08-05 gemäß DEC-5761-024 ausdrücklich
`provider_observed_best_effort` gewählt. Ein rein aus der MEXC API abgeleiteter
Candidate darf deshalb nach erfülltem vollständigem Eligibility Predicate
`eligible` werden; `not_export_verified` und `silent_omission_risk` bleiben
unveränderlich sichtbar. Widerspruch oder ein bekannter Gap setzt die
Capability beziehungsweise den Candidate auf `suspended`/`blocked`.
`forbidden` ist eine permanente Produktinvariante und nicht konfigurierbar.

## 4. MEXC Transport- und Authentifizierungsvertrag

### 4.1 Basisdomain

Aktuell offiziell dokumentiert:

```text
https://api.mexc.com
```

Der Change Log nennt den 2026-01-19 als Umstellungstermin. Der vorhandene
Connector nutzt noch `https://contract.mexc.com`. Public-, Private- und
Discovery-Beobachtung haben `https://api.mexc.com` für die konkret
durchgeführten GETs bestätigt. `BRI-018` ist deshalb kein weiterer
Providerprobe-Blocker, sondern eine G1-Code-/Fixturekorrektur. Kein neuer
Live-Probe ist dafür autorisiert oder erforderlich.

### 4.2 Methoden- und Pfad-Allowlist

Für den v57.61.0-Importadapter sind ausschließlich `GET`-Aufrufe vorgesehen.
Die vorgeschlagene Allowlist lautet:

| Capability | Methode und Pfad | Auth | Doku-Limit | Contract-Status |
|---|---|---|---:|---|
| Serverzeit | `GET /api/v1/contract/ping` | öffentlich | 20 / 2 s | documented |
| Contract-Metadaten | `GET /api/v1/contract/detail/country` | öffentlich | 10 / 2 s | documented |
| Orders | `GET /api/v1/private/order/list/history_orders` | View Order Details | 20 / 2 s | ambiguous response shape |
| Executions | `GET /api/v1/private/order/list/order_deals/v3` | View Order Details | 20 / 2 s | ambiguous response shape |
| Execution je Order | `GET /api/v1/private/order/deal_details/{orderId}` | View Order Details | 20 / 2 s | supplementary; nicht für v57.61.0-Ingestion registriert |
| Historische Positionen | `GET /api/v1/private/position/list/history_positions` | View Order Details | 20 / 2 s | ambiguous response shape |
| Fundingzahlungen | `GET /api/v1/private/position/funding_records` | View Order Details | 20 / 2 s | response example conflicts with field table |
| Position Mode | `GET /api/v1/private/position/position_mode` | View Order Details | 20 / 2 s | supplementary blocked; response example conflicts with field table |
| Kontobezogene Fee-Konfiguration | `GET /api/v1/private/account/tiered_fee_rate/v2` | View Order Details | 20 / 2 s | supplementary only |
| Öffentliche Fundingraten | `GET /api/v1/contract/funding_rate/history` | öffentlich | 20 / 2 s | reference only |

Für die v57.61.0-Ingestion dürfen nur Serverzeit, Contract-Metadaten, Orders,
Executions `/v3`, historische Positionen und Fundingzahlungen als
Capabilitykandidaten registriert werden. Execution-by-Order, Position Mode,
Fee-Konfiguration und öffentliche Fundingrate sind bis zu eigenem striktem
Oracle und dokumentierter Reconciliationrolle nicht Teil eines
Vollständigkeitsprofils. Account Identity und atomare sonstige Account
Financial Events sind für MEXC v57.61.0 `unsupported`; der Account-Scope bleibt
connectiongebunden und sonstige Buchungen werden nicht erfunden.

Die dokumentierten Endpointzeilen und die nutzerbereitgestellte
Fachbereichsantwort ergeben für dieses gepinnte History-Profil
`permission_mapping_evidence = official_docs_plus_support_statement_2026-08-05`.
`Order Placing` ist nicht erforderlich und wird niemals empfohlen. Der Status
eines konkreten Keys bleibt mangels belegter Permissionintrospection
`read_only_user_attested`, nicht `read_only_technically_verified`.

Nicht auf der Allowlist:

- alle `POST`-, `PUT`, `PATCH`- und `DELETE`-Aufrufe;
- Ordereröffnung, Orderänderung, Cancel, Close oder Reverse;
- Transfer, Withdrawal oder Kontobewegung;
- dynamisch vom Providerpayload gelieferte Hosts oder Pfade;
- der alte Execution-Pfad ohne `/v3`, solange er nicht als explizit benötigte
  und geprüfte Legacy-Quelle dokumentiert wurde;
- der alte Basis-Host, solange die aktuelle offizielle Semantik nicht geklärt
  ist.

Der Transport erhält keinen frei zusammensetzbaren Pfad. Eine interne,
versionierte Capability-ID wird auf genau eine konstante Kombination aus
HTTPS-Host, `GET` und Pfadtemplate abgebildet. Queryparameter werden je
Capability typisiert und allowlisted; sie dürfen Host und Pfad nicht
beeinflussen.

Automatische Redirects sind verboten (`redirect = error` oder gleichwertig).
Ein `3xx`-Status ist `transport_contract_violation`; der Adapter sendet keine
Credentials an das Redirectziel. Auch ein Redirect auf denselben Host wird
nicht still verfolgt, weil Pfad und Signaturvertrag dadurch geändert werden
können.

Explizit forbidden sind insbesondere, aber nicht abschließend:

| Capability | MEXC-Pfad | Grund |
|---|---|---|
| Order platzieren | `POST /api/v1/private/order/create` | erzeugt Brokerorder; Permission `Order Placing` |
| Order stornieren | `POST /api/v1/private/order/cancel` | verändert Brokerorder |
| Position reversen | `POST /api/v1/private/position/reverse` | verändert/eröffnet Position |
| Alle Positionen schließen | `POST /api/v1/private/position/close_all` | schließt Brokerpositionen |
| Plan-/TP-/SL-/Trailing-Order schreiben | alle Place-/Modify-/Cancel-Pfade | verändert Brokerorders |
| Transfer/Withdrawal | sämtliche Funds-Mutationspfade | bewegt Vermögenswerte |

Die Methodenregel ist primär: Ein noch unbekannter künftiger `POST`-, `PUT`-,
`PATCH`- oder `DELETE`-Pfad ist automatisch forbidden, ohne dass er erst in
eine Denylist aufgenommen werden muss.

### 4.3 Signatur und Zeit

Für private OPEN-API-GET-Requests dokumentiert MEXC:

- Header `ApiKey`, `Request-Time`, `Signature` und optional `Recv-Window`;
- alphabetisch sortierte Queryparameter;
- URL-Encoding besonderer Parameterwerte;
- Signaturziel `accessKey + timestamp + parameterString`;
- HMAC-SHA256;
- keine `null`-Parameter in Request oder Signatur;
- Request-Time als Unix-Millisekunden;
- Standardfenster von 10 Sekunden; optionales `Recv-Window` mit dokumentiertem
  Maximum 60 Sekunden, wobei MEXC Werte über 30 Sekunden nicht empfiehlt.

Equora verwendet die MEXC-Serverzeit nur zur Request-Synchronisation. Fällt der
Zeitabruf aus oder ist die Antwort unlesbar, darf nicht still lokale Zeit als
erfolgreich validierte Providerzeit ausgegeben werden. Der Run wird vor einem
privaten Abruf abgebrochen oder als fehlgeschlagen klassifiziert.

Der Serverzeitparser akzeptiert ausschließlich einen finiten, ganzzahligen
Unix-Millisekundenwert im dokumentierten Responsefeld. Fehlend, `null`, String,
Boolean, Float, Sekundenformat, `NaN`/`Infinity` oder ein Wert außerhalb eines
versionierten Plausibilitäts-/Clock-Skew-Fensters ist
`invalid_provider_time`. Es gibt keinen `Date.now()`-Fallback. In diesem
Fehlerfall bleiben Signaturerzeugung, Credentialzugriff und private
Requestanzahl jeweils null.

API-Schlüssel und Secret werden ausschließlich serverseitig verarbeitet.
Signaturziel, Signatur, Headerwerte und vollständige Querystrings erscheinen
nicht in Nutzerfehlermeldungen oder Logs.

### 4.4 Rechteclaim

Die aktuelle Dokumentation verlangt für die relevanten privaten Endpoints
`View Order Details`. Ein dokumentierter Endpoint zur vollständigen Auflistung
aller am Key aktivierten Rechte wurde in den ausgewerteten Quellen nicht
gefunden.

Die MEXC-Fachbereichsantwort vom 2026-08-05 bestätigt `View Order Details` für
die relevanten Futures-History-Endpoints und trennt davon `Order Placing`.
Gemeinsam mit der öffentlichen endpointgenauen Dokumentation schließt dies die
Permission-Mappingfrage des gepinnten History-Profils auf Designebene. Die
Antwort ist nutzerbereitgestellte Providerevidenz und beweist weder die
tatsächliche Konfiguration noch die Gesamtrechte eines konkreten Keys.
Erfolgreiches Lesen
beweist weiterhin niemals das Fehlen zusätzlicher Keyrechte.

Die offizielle Futures API unterstützt unabhängig davon auch schreibende
`Order Placing`-Capabilities. Das ist kein Equora-Feature, sondern ein
zusätzliches Risiko eines falsch konfigurierten oder kompromittierten Keys.
Equora verlangt deshalb providerseitig deaktivierte Trading-, Transfer- und
Auszahlungsrechte. Liefert ein späterer offizieller Permission-Endpoint eine
positive Schreibberechtigung, wird der Key abgelehnt. Fehlt diese
Introspektion, bleiben Lesetest und Nutzerattestierung getrennte Evidenz.

Zulässige Evidenzzustände:

- `capability_read_succeeded` als ausschließlich transientes Ergebnis des
  nutzerinitiierten GET-Probes mit `provider_code`, `capability_id`,
  `contract_version`, exaktem Scope und Oraclevalidierung – exakt diese
  Capability im genannten Scope war in diesem Aufruf lesbar. v57.61.0
  persistiert daraus bewusst keine technische Permission-Evidenz und nutzt den
  Probe-Erfolg nicht als spätere Request-Authority;
- `read_only_user_attested` – der Nutzer hat deaktivierte Broker-Schreib-,
  Transfer- und Auszahlungsrechte bestätigt;
- optional `profile_read_succeeded` mit `profile_id`,
  `profile_version`, fixer Liste `required_capabilities` und `completed_at` –
  ausschließlich abgeleitet, wenn jede Pflichtcapability erfolgreich war.

`partial`, `unverified`, `failed` oder eine nicht ausgeführte Pflichtcapability
verhindert einen profilweiten Erfolgsstatus. Ein generisches
`mexc_futures_data_read_succeeded` ist auch als Alias verboten und entfällt
vollständig. Sichtbare Copy nennt entweder den konkreten Datentyp/Endpoint oder
das vollständig bestandene, benannte und versionierte Testprofil.

Unzulässige Claims:

- `read_only_verified`;
- `futures_read_verified`, sofern damit technische Gesamtverifikation gemeint
  ist;
- „vollständig sicher verbunden“;
- jede Aussage, dass Equora MEXC-seitige Zusatzrechte technisch ausgeschlossen
  habe.

Empfohlene Defense-in-depth:

- eigener API-Key ausschließlich für Equora;
- nur erforderliche View-/Read-Berechtigungen;
- keine Order-Placing-, Transfer- oder Withdrawal-Rechte;
- IP-Bindung, soweit die Betriebsumgebung eine stabile kontrollierte Egress-IP
  bereitstellt;
- sofortiger providerseitiger Widerruf bei Verdacht auf Offenlegung;
- kurze, dokumentierte Rotation ohne Key-Wiederverwendung in anderen Tools.

## 5. Endpoint- und Feldvertrag

### 5.1 Contract-Metadaten

`GET /api/v1/contract/detail/country` ist Pflichtquelle für jede im Sync
beobachtete Contract-Version. Mindestens zu persistieren:

- `symbol`, `id`, `futureType`, `state`;
- `baseCoin`, `quoteCoin`, `settleCoin`;
- `contractSize`;
- `priceScale`, `volScale`, `amountScale`;
- `priceUnit`, `volUnit`, `minVol`, `maxVol`;
- `positionOpenType`, `riskLongShortSwitch`;
- `createTime`, `openingTime`;
- belegtes Valuation-Modell (`linear`, `inverse`, `quanto` oder
  `unverified`), Contract-Multiplier-Einheit und PnL-Formelversion;
- relevante Fee- und Risk-Modes als belegte Metadaten, nicht als Ersatz für
  tatsächlich gezahlte Fees.

Contract-Metadaten sind zeitabhängig. Da die Dokumentation keine historische
Gültigkeitszeit liefert, speichert Equora jede Observation mit `observed_at`,
Inhaltshash und Contract-Version. Eine Observation nach einem Trade beweist
nicht automatisch, dass dieselbe Contract Size zum historischen Tradezeitpunkt
galt. Fachlich identische Beobachtungen vor und nach einem Ereignis erzeugen
nur `non_authoritative_same_bracket`, niemals historische Valid-Time-Authority; ein
unbeobachteter Wechsel und Rückwechsel bleibt möglich. Ohne providerseitige
Gültigkeitszeit, Version oder ereigniseingebettete Metadaten bleiben Basismenge,
lokale Average-/Value-Basen und lokale Vergleichsrechnung `not_comparable`;
importkritische Contractfamilie und Settlementzuordnung bleiben zusätzlich
`unverified` und blockiert.

Kanonische Basismenge:

```text
base_quantity = contract_volume × contract_size
```

Diese Formel gilt nur, wenn Contracttyp und Providervertrag sie für das
Instrument belegen. `contractSize = 1` ist kein zulässiger Default.
Die Basismengenformel ist nicht automatisch eine PnL-Formel. Lineare, inverse
und Quanto-Kontrakte benötigen getrennte, versionierte Bewertungsverträge. MEXC
v57.61.0 importiert deshalb ausschließlich `provider_booked` Finanzwerte und
stellt keine lokale PnL-Neuberechnung als autoritativ dar. Native
Contractmenge, Preis, Provider-PnL, Fee und Funding bleiben getrennt. Fehlende
historische Contract-Size-/Multiplier-Evidenz blockiert eine optionale
Basismenge beziehungsweise lokale Vergleichsrechnung, nicht einen ansonsten
vollständig belegten providergebuchten Wert – jedoch nur, wenn
Contractfamilie, Instrumentidentität und Settlement am Ereigniszeitpunkt über
eine getrennte zulässige Authority-Evidenz belegt sind. Fehlt diese
importkritische Authority, bleibt der gesamte Candidate blockiert.

**Contract-/Währungsscope v57.61.0:** Importfähig geplant sind ausschließlich
linear/stablecoin-margined Futures, deren `contract_family_at_event`,
`settlement_asset_at_event` und `instrument_identity_at_event` am
wirtschaftlichen Ereigniszeitpunkt autoritativ belegt sind und Settlement
`USDT` oder `USDC` ergeben. Zulässig sind nur ereigniseingebettete
Klassifikation, Provider-Metadaten mit belegter Valid-Time-/Versionssemantik oder
eine versionierte offizielle Regel, die Instrumentidentität unveränderlich an
Contractfamilie und Settlement bindet. `authority_evidence_type` und
`authority_evidence_version` werden persistiert. Fehlt dieser Nachweis, gelten
`contract_classification = unverified` und `import_eligibility = blocked`, auch
bei ansonsten providergebuchten Werten. Coin-M-, inverse, Quanto-, USD1-M- und
unbekannte Contractklassen bleiben `unsupported` für den Journalimport; Raw
Capture darf sie nur typisiert blockiert sichtbar machen.

Die drei At-Event-Werte werden nicht auf einer wiederverwendbaren aktuellen
Metadata Observation gespeichert, sondern in einer immutable
`EVENT_CONTRACT_AUTHORITY` je konkretem Economic Event. Sie bindet Event-ID/-
zeit, Account/Instrument, Authority-Typ/-Version und entweder providerbelegtes
Valid-Time-Intervall oder exakten Scope einer offiziellen unveränderlichen
Instrumentregel. Constraints verbieten Nutzung außerhalb dieses Scopes.
`non_authoritative_same_bracket` bleibt ausdrücklich nicht autoritativ. Candidate- und
Approval-Digests binden das vollständige sortierte Authority-Evidence-Set aller
enthaltenen Economic Events.
MEXC-SRC-020/-021 belegen, dass MEXC neben USDT-/USDC-M auch Coin-M-Produkte
anbietet. Deshalb ist „bei MEXC immer USDT oder USDC“ kein zulässiger globaler
Vertrag.

Der Contract-Settlement-Asset ist Kontext, aber kein stiller Ersatz für eine
fehlende Buchungswährung. PnL, Fee und Funding speichern jeweils die
providerbelegte Currency. Jede Komponente führt `currency_value |
currency_unknown`, `currency_source`, `currency_rule_version` und
`currency_authority_status`. Fehlt die Currency im Buchungsgrain, bleibt die
Komponente bis zu einer eigenen versionierten, am Ereigniszeitpunkt
autoritativen Authority-/Mappingevidenz blockiert; Symbolsuffix, Supportclaim
oder `settleCoin` allein füllen das Feld nicht.

### 5.2 Orders

Primäre Provideridentität: `orderId` innerhalb des Providerkonto-Scopes.

Relevante Felder:

- `orderId`, `externalOid`, `positionId`;
- `symbol`, `positionMode`, `side`, `category`, `orderType`, `state`;
- `vol`, `dealVol`, `price`, `dealAvgPrice`;
- `makerFee`, `takerFee`, `feeCurrency`, `profit`;
- `createTime`, `updateTime`;
- Responsefelder wie `version`, die in Beispielen erscheinen, aber in der
  Feldtabelle nicht vollständig definiert sind, werden zunächst als
  `unverified_extension` gespeichert und nicht fachlich ausgewertet.

Orderrevisionen werden über Provider-ID, Payloadhash, Observationszeit und eine
adapterseitige Revision abgebildet. Der aktuelle Dokumentationsstand erklärt
die Semantik des Beispiel-Felds `version` nicht ausreichend; es darf nicht
allein als verlässlicher Revisionszähler gelten.

### 5.3 Executions

Primäre Provideridentität: `id` innerhalb des Providerkonto-Scopes.

Relevante Felder:

- `id`, `orderId`, `symbol`;
- `side`, `positionMode`, `category`;
- `vol`, `price`;
- `fee`, `feeCurrency`, `profit`;
- `taker` beziehungsweise `isTaker`;
- `timestamp`.

Execution-ID, Order-ID und Position-ID bleiben getrennt. Die Dokumentation
bezeichnet `id` teilweise unpräzise; ein Contract-Probe muss bestätigen, dass
die ID im beobachteten Konto stabil und pro Execution eindeutig ist.

Fällt der Page-Abruf aus, ist das Ergebnis `partial` oder `failed`; es ist nicht
`no executions`.

### 5.4 Positionen

Historische Positionen liefern eine zusätzliche Brokeraggregation, ersetzen
aber nicht die Execution-Reconciliation. Relevante Felder:

- `positionId`, `symbol`, `positionType`, `openType`, `state`;
- `holdVol`, `closeVol`, `openAvgPrice`, `closeAvgPrice`;
- `holdFee`, `closeProfitLoss`, `realised`, `fee`, `totalFee`;
- `createTime`, `updateTime`;
- beobachtete `version`- oder Statusfelder als versionierte Extension.

Provider-PnL und ein etwaiger lokal berechneter PnL werden getrennt gespeichert.
Für MEXC v57.61.0 ist `local_valuation` jedoch `unsupported`; deshalb kann eine
lokale Berechnung weder Authority noch Importeligibility erzeugen. Positions-
Average-/Value-Felder bleiben ohne belegte historische Semantik
`reference_only`.

Ein historischer Positionsdatensatz beweist nur dann einen vollständigen
Position Cycle, wenn die Provider-Position-ID und der Status den gesamten
Lifecycle belastbar abgrenzen. Beginnt das Syncfenster innerhalb einer offenen
Position oder endet es vor dem belegten Flat-Zustand, bleibt der Cycle
`blocked_boundary`.

### 5.5 Funding

Kontobezogene Fundingzahlungen stammen aus
`GET /api/v1/private/position/funding_records`. Die öffentliche Fundingrate ist
nur Referenz und beweist keine Belastung oder Gutschrift des Nutzerkontos.

Kanonische Fundingfelder:

- Provider-ID;
- Position-ID, sofern vorhanden;
- Symbol und Positionsseite;
- Position Value;
- Fundingbetrag und Settlement-Währung;
- Rate und Settlementzeit;
- Raw Payload, Contract-Version und Providervertragsversion.

Die aktuelle MEXC-Seite listet Fundingrecord-Felder, zeigt aber ein Beispiel,
das wie eine aktuelle Fundingrate statt wie eine paginierte Kontohistorie
aussieht. Der Discovery-Probe beobachtete ein paginiertes Fundingitem, aber ohne
Currency- oder Position-ID-Eigenschaft. Die Capability ist deshalb
`read_preview_only`; Funding-Reconciliation bleibt bis zu belegter Währung,
Vorzeichensemantik und Lifecycle-Zuordnung blockiert. Kein weiterer Probe ist
dadurch autorisiert.

Eine leere Fundingantwort ist kein Beleg für null Funding. Schneidet ein Cycle
einen erwartbaren Funding-Settlementzeitpunkt, verlangt eine importfähige
Netto-PnL-Reconciliation entweder ein gebuchtes Funding Event oder eine
autoritative Null-/Completeness-Evidenz für genau diesen Account-, Instrument-
und Zeitscope. Die öffentliche Fundingrate darf nur die Erwartung auslösen und
niemals einen Kontobuchungswert erzeugen.

Für jeden nach einer providerbelegten `funding_boundary_rule_version`
potenziellen Settlementzeitpunkt eines Cycles wird immutable
`FUNDING_SETTLEMENT_EXPECTATION_EVIDENCE` persistiert. Die Grenzregel muss
Inklusivität an Cycle-Start und -Ende explizit festlegen; ohne belegtes
Expectation-Oracle gilt `expectation_unverified`. Zulässige Zustände sind nur
`booked_event_resolved`, `authoritative_zero_resolved`,
`expectation_not_applicable`, `expectation_unverified`, `missing_booking` und
`ambiguous_attribution`. Die Evidenz bindet Account, Instrument, Mode/Side,
Position-Lifecycle, Settlementzeit, Expectation-/Schedule-/Rule-Version,
Funding-Capability-Scope/-Digest sowie entweder eine konkrete Funding-
Allocation oder typisierte providerseitige Null-/Completeness-Evidenz.
`expectation_not_applicable` erfordert eine autoritative Regel, die keinen
Settlementzeitpunkt im Cycle belegt; eine leere Seite genügt nie. Nur die ersten
drei aufgelösten Zustände können Eligibility unterstützen. Ungeklärte Currency,
Grenze oder Hedge-Attribution blockiert.

### 5.6 Fee-Semantik

Executiondaten sind die primäre Kandidatenquelle für fillbezogene Gebühren und
Rebates, sobald Feld- und Vorzeichenvertrag belegt sind. Order- und
Positionsfelder wie `makerFee`, `takerFee`, `fee`, `totalFee`, `profit`,
`closeProfitLoss` und `realised` sind wegen möglicher Überlappung zunächst
ausschließlich `reference_only`. Sie werden weder untereinander noch zu
Executionkomponenten addiert und ersetzen keine fehlende Execution still.
Aktuelle Maker-/Taker-Rates aus Contract- oder Account-Fee-Endpoints sind keine
historische Zahlungsquelle.

Die Dokumentation nennt beim Execution-by-Order-Endpoint: positiver Fee-Wert
bedeutet Zahlung, negativer Wert Gutschrift. Historische Positionen beschreiben
ein `fee`-Beispiel mit negativem Wert, während `totalFee` positiv erscheint.
Diese Semantiken werden nicht vereinheitlicht, bevor Fixtures und A5-Review die
jeweilige Feldbedeutung bestätigen.

Kanonisch speichert Equora den Kontoequity-Effekt: Gutschriften positiv,
Belastungen negativ. Rohwert, Providerfeld, Providersemantik und angewandte
Vorzeichenregel bleiben getrennt rückverfolgbar. Ist die Providersemantik nicht
belegt, ist die Komponente `not_comparable` und blockiert den Kandidaten.

Jede Financial Component besitzt genau eine versionierte Authority Rule:
`provider_booked` mit summenerhaltender Source-Allocation oder
`local_valuation` mit vollständigen typisierten Calculation Inputs. Weitere
Providerfelder sind typisierte `reference_only`-/`overlap`-Links. Eine
Positionaggregation darf nur dann statt einer atomaren Quelle gebucht werden,
wenn Providervertrag, Coverage und Nichtüberlappung ausdrücklich belegt sind;
dies ist für den aktuellen MEXC-Stand nicht der Fall.

Bei teilbarer atomarer Source – etwa einer Execution Fee über Close-/Open-
Anteile eines Reversals – werden Quellbetrag, Currency, Coverage, allokierter
Teilbetrag und Splitregel gespeichert. Über alle aktuellen Candidate Revisions
entspricht die Summe exakt dem Quellbetrag; Rest blockiert, Überschreitung ist
Fehler. Funding- und sonstige Accountbuchungen folgen derselben Regel. Order-
und Positionsaggregate bleiben wiederholbare References und gehen nie in die
Kandidatensumme ein.

Die konkrete MEXC-Authority-Matrix startet fail-closed:

| Komponente / Quelle | Ausgangsstatus | Promotionsbedingung |
|---|---|---|
| Execution `profit` | `unverified` / `reference_only` | Grain, Coverage, Vorzeichen und explizite PnL-Währung durch Providerbeleg plus G2/G3-Fixtures bestätigt |
| Execution `fee` + `feeCurrency` | `unverified` | v3-Feldvorzeichen, Currency, Rebate und Summenerhaltung durch Providerbeleg plus G2/G3-Fixtures bestätigt |
| Positions-PnL-/Fee-/Fundingaggregate | `reference_only` | nur bei belegter Nichtüberlappung und vollständigem Lifecycle; für v57.61.0 nicht als primäre Authority geplant |
| Funding `funding` | `unverified` / `read_preview_only` | Currency, Vorzeichen, Kontobuchungsgrain, Coverage und eindeutige Lifecycle-Zuordnung belegt |

Keine Dokumentationszeile oder einzelne Non-Production-Beobachtung promoviert
diese Stati allein. Fehlende PnL-, Fee- oder Fundingwährung blockiert die
jeweilige Komponente, Netto-PnL und Approval.

### 5.7 Striktes Response- und Feldoracle

Die folgenden Tabellen sind der verbindliche Parservertrag, kein Hinweis,
ungeklärte Felder zu erraten. `IR` bedeutet importkritisch erforderlich, `RR`
Reconciliation-erforderlich und `O` optionale Referenz. Ein fehlendes oder
typfalsches `IR`-/`RR`-Feld blockiert mindestens das Element; ein malformed
Arrayelement darf niemals still ausgefiltert werden. Ist die Zahl valider
Elemente dadurch nicht beweisbar, wird die gesamte Page `partial` oder
`failed`, nicht `[]`.

#### 5.7.1 Gemeinsamer Envelope

| JSON-Pfad | Typ | Pflicht | Regel |
|---|---|---|---|
| `$.success` | Boolean | IR | muss `true` sein; fehlend/falsch ist `malformed_response` oder Providerfehler |
| `$.code` | Integer | IR | `0` für Erfolg; anderer Wert über Fehlervertrag klassifizieren |
| `$.data` | Capability-Shape | IR | exakt eine versionierte, zugelassene Shapevariante; `null` ist kein leeres Ergebnis |

Die Feldtabellen der offiziellen History-Seiten beschreiben ein Pageobjekt in
`$.data` mit `pageSize`, `totalCount`, `totalPage`, `currentPage` und
`resultList`. Die aktuellen Beispiele für Orders, Executions und historische
Positionen zeigen dagegen unmittelbar `$.data[]`. Diese Varianten sind
getrennte Schemas:

- `page_object_v1`: `$.data` ist Objekt, Pagezahlen sind nichtnegative sichere
  Integer und `$.data.resultList` ist Array;
- `bare_array_v1`: `$.data` ist Array; für Orders und Executions mit Item sowie
  für Historical Positions leer `observed_nonprod`. Die Shape besitzt keine
  Vollständigkeits-/Pagingevidenz und bleibt deshalb `read_preview_only`;
- jede andere Form: `malformed_response` und Importblocker.

Ein leeres Array ist nur dann eine valide leere Page, wenn Envelope und
Capability-Shape vollständig valide sind. Unbekannte Top-Level-Felder werden
im Raw Payload erhalten, aber fachlich erst nach Vertragsrevision verwendet.

#### 5.7.2 Gemeinsame primitive Typregeln

- `Provider ID/long`: JSON-String mit `^[0-9]+$` oder verlustfrei gelesener
  JSON-Integer-Token; Kanonisierung als Dezimalstring ohne führende Nullen.
  Eine JavaScript-`number` oberhalb `Number.MAX_SAFE_INTEGER` ist unzulässig.
- `Decimal`: JSON-String oder verlustfrei gelesener JSON-Zahlentoken in
  endlicher Dezimalschreibweise. Keine Berechnung über IEEE-754-`number`;
  Speicherung als exaktes Decimal plus unveränderter Rohlexem.
- `Unix ms`: nichtnegative, finite Integer-Millisekunden; Sekundenwerte,
  Strings, `NaN`, `Infinity` oder unplausible Abweichungen blockieren.
- `Currency`: nichtleerer Providerstring; kanonische Währung erst nach
  belegter Instrument-/Settlementzuordnung. Nie aus Symbolsuffix erraten.
- `Enum`: nur die unten aufgeführten Codes; unbekannte Codes werden raw
  erhalten und blockieren die betroffene Normalisierung.
- Fehlend und `null` sind verschieden. `null` ist nur erlaubt, wenn die
  jeweilige Feldregel dies ausdrücklich nennt.

#### 5.7.3 Serverzeit

Query: keine Parameter. Shape ausschließlich gemeinsamer Envelope mit
`$.data` als nichtnegative finite Integerzahl in Unix-Millisekunden. String,
Float, Sekundenformat, fehlend/`null` oder außerhalb des versionierten
Plausibilitäts-/Clock-Skew-Fensters ist `invalid_provider_time`. Keine andere
Shapevariante ist zulässig; Fehler stoppt vor Credentialzugriff und privatem
Request.

#### 5.7.4 Contract Metadata für exakt ein Instrument

Equora setzt den laut Provider optionalen Queryparameter `symbol` für jede
importkritische Observation zwingend. Shape ist `$.data` als genau ein Objekt;
eine Liste oder ein anderes Instrument ist `malformed_response`. Die
Observation erhält `observed_at`; die API dokumentiert keine historische
`valid_from`/`valid_to`-Garantie.

| Feld | Typ | Pflicht | Einheit/Semantik | Wirkung |
|---|---|---|---|---|
| `symbol` | String | IR | exakter angefragter Providercode | Instrumentidentität |
| `baseCoin` | Currency/String | IR | Basisasset | keine PnL-Formelableitung |
| `quoteCoin` | Currency/String | IR | Quoteasset | keine Settlementannahme |
| `settleCoin` | Currency/String | IR | Settlementasset | notwendiger Währungskontext |
| `futureType` | Enum int | IR | `1` perpetual, `2` delivery | Laufzeittyp, nicht linear/invers/quanto |
| `contractSize` | Decimal | IR | Provider-Contract-Size | Multiplikatoreinheit weiterhin explizit zu belegen |
| `priceScale`, `volScale`, `amountScale` | nichtnegative Integer | RR | angezeigte Präzision | Rundungskontext, nicht allein Tickregel |
| `priceUnit`, `volUnit` | positive Decimal | IR | Tick-/Contractmengenschritt | Mengen-/Preisoracle |
| `state` | Enum int | IR | `0` enabled, `1` delivery, `2` delivered, `3` offline, `4` paused | Capability-/Zeitraumstatus |
| `createTime`, `openingTime` | Unix ms | RR | Providerzeit; `openingTime=0` laut Beispiel möglich | keine historische Gültigkeitsgarantie |
| `id` | Provider ID | RR | Contract-ID | zusätzliche Identität, kein Sequenzfeld |

Felder wie aktuelle Fee-Rates, `apiAllowed`, Leverage-, Risk- oder
Orderkonfiguration sind Referenzmetadaten und keine historische Buchung. Die
offizielle Contract-Info enthält kein hinreichendes Feld für
`linear`/`inverse`/`quanto`, keine explizite Multiplier-Einheit und keine
historische PnL-Formel. MEXC-SRC-019 dokumentiert zwar aktuelle getrennte
USDT-M- und Coin-M-Formeln, bindet diese Klassen aber nicht über ein
versioniertes API-Feld an jede Contract-Observation und nennt weder historische
`valid_from`/`valid_to`-Gültigkeit noch verbindliche Rundungsreihenfolge.
Deshalb bleiben lokale Basismenge/PnL `not_comparable`, bis MEXC-U09/U10 für den
konkreten unterstützten Scope separat belegt sind. Funding darf `settleCoin`
nur als Currency verwenden, wenn der Providervertrag zusätzlich belegt, dass
das konkrete Fundingfeld in dieser Währung gebucht wird; derzeit bleibt diese
Ableitung blockiert.

#### 5.7.5 Query- und Capabilityprofile

Alle Querykeys sind geschlossen, eindeutig und genau einmal erlaubt. Unbekannte
oder doppelte Keys, `null`, leere Werte, nichtkanonische Zahlen, freies
Pathsegment oder Werte außerhalb der Grenzen werden vor Credentialzugriff
abgelehnt.

| Capability | Equora-Pflichtquery | Optional erlaubte Query | Appgrenzen |
|---|---|---|---|
| Serverzeit | keine | keine | exakt ein Request je Work Unit vor privaten Calls |
| Contract Metadata | `symbol:string` | keine | Symbol aus validiertem Scope; genau ein Instrument |
| Historical Orders | `symbol:string`, `start_time:unix_ms`, `end_time:unix_ms`, `page_num:int`, `page_size:int` | `states:enum-set`, `category:enum` | `1 <= page_size <= 100`; `start_time <= end_time`; `orderId` im Bulkprofil verboten |
| Historical Executions `/v3` | `symbol:string`, `start_time:unix_ms`, `end_time:unix_ms`, `page_num:int`, `page_size:int` | keine | `1 <= page_size <= 1000`; geschlossenes Zeitfenster |
| Historical Positions | `symbol:string`, `position_type:1|2`, `start_time:unix_ms`, `end_time:unix_ms`, `page_num:int`, `page_size:int` | keine | deprecated/duplizierter Querykey `type` wird nicht gesendet; `1 <= page_size <= 100` |
| Funding Fee Details | `symbol:string`, `position_type:1|2`, `start_time:unix_ms`, `end_time:unix_ms`, `page_num:int`, `page_size:int` | `position_id:Provider-ID` nur in separat gebundenem Lifecycle-Scope | `1 <= page_size <= 100`; Currency/Shape weiterhin blockiert |

`states` ist eine kanonisch aufsteigend sortierte, duplikatfreie Menge aus
`1..5`, providerkonform kommasepariert kodiert. Category ist `1..4`.
Pfadparameter werden im v57.61.0-Ingestionprofil nicht verwendet;
Execution-by-Order ist supplementary und nicht registriert. Position Mode ist
wegen des Widerspruchs zwischen Feldtabelle (`$.data.positionMode`) und Beispiel
(`$.data[]` mit Risk-Objekten) vollständig blockiert und trägt keine
Vollständigkeit bei. Account Identity und sonstige Account Financial Events
sind für MEXC v57.61.0 `unsupported`, nicht still aus Labels/Symbolen
abgeleitet.

#### 5.7.6 Historical Orders – Itempfad

Der Discovery-Probe beobachtete für zwei aufeinanderfolgende Seiten
`$.data[*]` (`bare_array_v1`). Die dokumentierte Alternative
`$.data.resultList[*]` bleibt eine unbestätigte Shapevariante und ist bis zu
eigener Evidenz blockiert. Eine beobachtete Shapevariante beweist noch keine
globale Sortier-, Retention- oder Snapshotsemantik.

| Feld | Typ | Pflicht | Einheit/Semantik | Identität-/Finanzwirkung |
|---|---|---|---|---|
| `orderId` | Provider ID | IR | Order-ID im Account-Scope | wirtschaftliche Orderidentität; keine Sequenzgarantie |
| `symbol` | String | IR | Providerinstrument | muss zu Scope/Metadata passen |
| `positionId` | Provider ID | RR; nullable noch ungeklärt | Position Lifecycle | darf bei Fehlen nicht heuristisch ersetzt werden |
| `side` | Enum int | IR | `1` open long, `2` close short, `3` open short, `4` close long | Positionwirkung |
| `positionMode` | Enum int | IR | `1` Hedge, `2` One-way | Scope-Trennung |
| `state` | Enum int | IR | `1` pending, `2` unfilled, `3` filled, `4` canceled, `5` invalid | Revisions-/Kontextstatus |
| `category` | Enum int | RR | `1` limit, `2` liquidation custody, `3` custody close, `4` ADL reduction | Sonderfallklassifikation |
| `orderType` | Enum int | O/RR | offizielle Tabelle `1..4`; Beispiel zeigt `5` | Code `5` bleibt `unverified_extension` |
| `vol` | Decimal | IR | Contractmenge | keine Basismenge ohne Metadata |
| `dealVol` | Decimal | IR | ausgeführte Contractmenge | Orderaggregat, keine Fillquelle |
| `price` | Decimal | RR | Order-/bei Zwangsliquidation ggf. Takeoverpreis | keine Fillpreisautorität |
| `dealAvgPrice` | Decimal | RR | Provideraggregat | nur Reconciliation Reference |
| `takerFee`, `makerFee`, `profit` | Decimal | RR | Provideraggregate | `reference_only`, bis Nichtüberlappung belegt |
| `feeCurrency` | Currency | RR | Gebührenwährung | keine Symbolableitung |
| `createTime`, `updateTime` | Unix ms | IR | Providerzeit | keine ID-Reihenfolge ableiten |
| `externalOid`, `version` | String/Providerinteger | O | Revision-/Referenzevidenz ungeklärt | nicht allein als Stable Revision verwenden |

Zusätzlich wurden in mindestens einem der beiden sanitisierten Orderitems die
optionalen Felder `bboTypeNum`, `errorCode`, `fee`, `feeRates`, `leverage`,
`lossTrend`, `lowSaveTotalFee`, `makerFee`, `makerFeeRate`, `openAvgPrice`,
`openType`, `orderMargin`, `pnlRate`, `positionDrop`, `priceProtect`,
`priceStr`, `profitTrend`, `showCancelReason`, `showProfitRateShare`,
`stopLossPrice`, `takeProfitPrice`, `takerFeeRate`, `totalFee`, `usedMargin`,
`zeroSaveTotalFeeBinance` und `zeroTradeTotalFeeBinance` beobachtet. Sie sind
nicht automatisch importkritisch und werden nur nach expliziter Feldregel
verarbeitet. Finanz- und Mengenfelder erschienen abhängig vom Wert teils als
ganzzahliges, teils als dezimales JSON-Zahllexem. Der Parser akzeptiert dafür
die geschlossene JSON-Zahlfamilie und konvertiert verlustfrei in kanonische
Decimalwerte; ein Integerlexem darf keinen fachlichen Integervertrag erzeugen.

#### 5.7.7 Historical Executions `/v3` – Itempfad

Der Discovery-Probe beobachtete `$.data[*]` (`bare_array_v1`) mit einem Item. Die
dokumentierte Alternative `$.data.resultList[*]` bleibt unbestätigt und bis zu
eigener Evidenz blockiert.

| Feld | Typ | Pflicht | Einheit/Semantik | Identität-/Finanzwirkung |
|---|---|---|---|---|
| `id` | Provider ID | IR | Execution-ID im Account-Scope | Stable-ID-Annahme noch zu belegen; keine Sequenzgarantie |
| `orderId` | Provider ID | IR | Parent-Order | fehlende Order im Fenster zulässig, aber sichtbar |
| `symbol` | String | IR | Providerinstrument | Scope-/Metadataabgleich |
| `side` | Enum int | IR | Codes wie Orders | Positionwirkung |
| `positionMode` | Enum int | IR | `1` Hedge, `2` One-way | Scope-Trennung |
| `vol` | Decimal | IR | ausgeführte Contractmenge | primäre Mengenquelle |
| `price` | Decimal | IR | Fillpreis | Valuation-Modell erforderlich |
| `fee` | Decimal | RR | Fee-Rohwert | mögliche gebuchte Authority nach Vorzeichenbeleg |
| `feeCurrency` | Currency | RR | Gebührenwährung | nie still Settlement ableiten |
| `profit` | Decimal | RR | Provider-PnL je Deal laut Beispiel, nicht Feldtabelle | `unverified_extension`, zunächst Reference |
| `timestamp` | Unix ms | IR | Executionzeit | gleiche Werte bilden Sequenzgruppe |
| `category` | Enum int | RR | Feld nur im Beispiel | unbekannt blockiert Sonderfallklassifikation |
| `taker` | Boolean | O/RR | Maker-/Takerindikator | Fee-Kontext, keine Rate als Zahlung |

`profit` besitzt in diesem beobachteten Grain kein eigenes Currencyfeld. Der
Normalizer setzt deshalb zunächst `pnl_currency = currency_unknown`. Eine
Promotion ist nur über eine versionierte, am Executionzeitpunkt autoritative
Contract- oder Kontobuchungsregel mit `currency_source`,
`currency_rule_version` und `currency_authority_status` zulässig. `settleCoin`,
Symbolsuffix oder ein allgemeiner Supportclaim genügen nicht.

Zusätzlich wurden `externalOid:string`, `opponentOrderId:string` und
`isSelf:boolean` beobachtet. `id` und `orderId` waren String-IDs. Auch hier
werden `price`, `vol`, `fee` und `profit` unabhängig vom konkreten Integer- oder
Decimallexem verlustfrei als Decimal normalisiert.

#### 5.7.8 Historical Positions – Itempfad

Im Discovery-Scope wurde `$.data` als leeres `bare_array_v1` beobachtet. Damit
ist die Arrayhülle, nicht aber ein Positionsitem belegt. Sowohl die folgende
Feldmatrix als auch die dokumentierte Pageobjektalternative bleiben bis zu
nichtleerer Providerbeobachtung beziehungsweise eindeutiger
Providersupportevidenz für den Import blockiert.

| Feld | Typ | Pflicht | Einheit/Semantik | Identität-/Finanzwirkung |
|---|---|---|---|---|
| `positionId` | Provider ID | IR | Position Lifecycle | Boundary-/Evidence-Key |
| `symbol` | String | IR | Providerinstrument | Scopeabgleich |
| `positionType` | Enum int | IR | `1` long, `2` short | Side-Trennung |
| `openType` | Enum int | RR | `1` isolated, `2` cross | Kontext |
| `state` | Enum int | IR | `1` holding, `2` system-held, `3` closed | Boundary-Evidenz, nicht allein ohne Lifecycleprüfung |
| `holdVol`, `closeVol` | Decimal | IR | Contractmengen | Positionaggregat |
| `openAvgPrice`, `closeAvgPrice` | Decimal | RR | Provideraggregate | nur Reconciliation Reference |
| `holdAvgPrice`, `newOpenAvgPrice`, `newCloseAvgPrice` | Decimal | O/RR | überlappende Provideraggregate | nicht zusätzlich buchen |
| `holdFee` | Decimal | RR | Funding; offiziell positiv erhalten, negativ gezahlt | Reference zu konkreten Funding Events |
| `closeProfitLoss`, `realised` | Decimal | RR | überlappende PnL-Aggregate | `reference_only`, nie beide addieren |
| `fee`, `totalFee` | Decimal | RR | überlappende Fee-Aggregate; Beispiel zeigt gegensätzliche Vorzeichen | `reference_only`, nie beide/additiv zu Fills buchen |
| `createTime`, `updateTime` | Unix ms | IR | Lifecyclezeit | Versions-/Boundarykontext |
| `version` | Providerinteger | O | Beispielerweiterung | Revisionssemantik unverified |

#### 5.7.9 Funding Fee Details – Itempfad

Der Discovery-Probe beobachtete `$.data` als Pageobjekt mit
`currentPage:int32`, `pageSize:int32`, `resultList:array`, `totalCount:int32`
und `totalPage:int32`. Ein Fundingitem in `$.data.resultList[*]` entsprach den
folgenden Kernfeldern. Die Itemshape ist damit `observed_nonprod`; die
Importfähigkeit bleibt wegen ungeklärter Währung, Vorzeichen-/Authority-Regel,
Filterwirkung, Retention und eindeutiger Lifecycle-Zuordnung blockiert.

| Feld | Typ | Pflicht | Einheit/Semantik | Identität-/Finanzwirkung |
|---|---|---|---|---|
| `id` | Provider ID | IR | Funding-Buchungs-ID | wirtschaftliche Fundingidentität |
| `symbol` | String | IR | Providerinstrument | Scopeabgleich |
| `positionType` | Enum int | IR | `1` long, `2` short | Attribution im Hedge Mode |
| `positionValue` | Decimal | RR | Providerpositionswert | Valuation-/Currencykontext noch zu belegen |
| `funding` | Decimal | IR | Funding-Rohbetrag | Vorzeichen laut konkreter Capability zu belegen |
| `rate` | Decimal | RR | Fundingrate | Referenz, nicht zusätzlich buchen |
| `settleTime` | Unix ms | IR | Settlementzeit | Cycle-Grenzregel erforderlich |

Die Dokumentation nennt `position_id` als Requestfilter, aber das beobachtete
Responseitem enthielt kein `positionId`. Obwohl der Discovery-Request einen
abgeleiteten `position_id`-Filter mitsendete, lässt sich seine tatsächliche
Anwendung aus genau einem Item ohne Rückgabefeld nicht beweisen. Ohne stabile
gleichwertige Zuordnung darf ein Funding Event bei simultanen Long-/Short-
Cycles nicht anhand von Symbol und Zeit geraten werden.

#### 5.7.10 Parser- und Shape-Reaktion

- Verlustfreie Raw Bytes werden vor jeder Interpretation gehasht und
  unverändert gespeichert beziehungsweise nach Retentionregel referenziert.
- Schemaerkennung ist eine geschlossene Discriminated Union; keine Funktion
  darf unbekannte Objekte oder Arrayelemente über `filter` entfernen.
- Jede positive Shapevariante besitzt ein Fixture; jede falsche Rootform,
  `success=false`, `code!=0`, `data=null`, mixed Array, fehlende Pflichtfelder,
  unbekannte Enums, unsichere IDs und Sekunden-/Millisekundenverwechslung ein
  Negativfixture.
- Der Parser liefert `valid_page`, `partial_invalid_items` oder
  `invalid_response` mit Counts und Findings. Nur `valid_page` einer für Import
  geeigneten Capability kann Vollständigkeit beitragen.
- Providerfeld, JSON-Pfad, Rohlexem, Normalisierungsregel und Vertragsversion
  bleiben für jeden importkritischen kanonischen Wert rückverfolgbar.

## 6. Pagination, Watermarks und Vollständigkeit

### 6.1 Dokumentierte Grenzen

| Endpoint | Page Size |
|---|---:|
| Historical Orders | max. 100 |
| Historical Deals `/v3` | max. 1000 |
| Historical Positions | max. 100 |
| Funding Records | max. 100 |
| Public Funding Rate History | max. 1000 |

### 6.2 Nur supportbeschriebene beziehungsweise nicht garantierte Providersemantik

Der MEXC-Fachbereich beschreibt das aktuelle Ergebnisverhalten als reverse
chronological, neueste Records zuerst. Dies wird als
`support_claimed_result_order=reverse_chronological_current_behavior`
versioniert, aber nicht als unveränderliche API-Garantie behandelt. Je
Capability prüft der Parser, dass belegte Zeitfelder innerhalb einer Page
nichtzunehmend sind. Ein Verstoß, ein fehlendes Sortierfeld oder ein
widersprüchlicher Pageübergang erzeugt `partial`/`contradicted`, niemals einen
stillen Fallback. Technische Providerreihenfolge und wirtschaftliche
Executionsequenz bleiben getrennt; Same-Timestamp-Gruppen folgen
DEC-5761-021.

Für die privaten History-Endpoints fehlen weiterhin belastbare Garantien zu:

- stabiler reverse-chronologischer Sortierreihenfolge über alle Endpoints und
  Pages;
- stabilem Snapshot über mehrere Seiten;
- Inklusivität von `start_time` und `end_time`;
- Retention und maximalem API-Historienzeitraum;
- Verhalten bei gleichen Zeitstempeln;
- Late Arrivals und nachträglichen Revisionen;
- Stabilität von `totalPage`/`totalCount` während beweglicher Historie;
- leerer letzter Seite versus Providerfehler.

Diese Punkte sind `BRI-019`. Sie verbieten weiterhin einen globalen
Vollständigkeitsclaim und einen garantierten historischen API-Backfill. Der
prospektive Scope aus DEC-5761-009 kontrolliert das Risiko durch begrenzte,
wiederholte Beobachtung, Digests, Cycle-Grenzen und Gapzustände. Er erklärt die
Providerunsicherheit nicht für gelöst und autorisiert keinen weiteren Probe.

### 6.3 Prospektiver adapterneutraler Algorithmus
**Normative Activation-Invariante**

1. Fehlende oder widersprüchliche Permissionevidenz blockiert nicht das
   secretfreie G0-Architekturreview oder synthetische Fixtures. Eine konkrete
   MEXC-Sync-Aktivierung ist nur zulässig, wenn für jede Pflichtcapability des
   gepinnten Profils eine versionierte offizielle View-/Read-
   Permissionzuordnung vorliegt, die Nutzerattestierung aktuell ist und keine
   technisch erkennbare Broker-Schreibpermission besteht. Andernfalls bleibt
   sie `blocked_permission_evidence`; ein erfolgreicher Lesetest ersetzt weder
   die Zuordnung noch eine Gesamtrechteprüfung.
2. Eine explizite Verbindungsaktivierung fixiert `activation_cutover_at`,
   Providerkonto, Credentialgeneration, Contract-/Adapter-/Profilversion und
   das Onboardingprofil `recent_28d_plus_current_utc_day_v1`. Die erste
   Aktivierung erzeugt eine `activation_series_id`, eine Aktivierungszeile mit
   neuer ID/Generation `1` und einen atomaren Current-Pointer. Reaktivierung nach
   `inactive`/`revoked` oder Änderung gepinnter Identitäten/Versionen sperrt die
   Series, erzeugt eine neue Zeile mit neuer ID/nächster Generation, deaktiviert
   eine zuvor current/arbeitsfähige Vorgängerzeile und invalidiert deren Jobs/
   Leases im selben Commit. Die sofortige Autoritätsinvalidierung beruht
   ausschließlich auf dem atomaren Current-Pointer-/Lifecycle-Fence; alte Work
   Units verlieren dadurch ohne inversen `Series -> Work Unit`-Lock jede Claim-,
   Renew-, Commit- und Request-Autorität. Physische Status-/Tokenbereinigung ist
   nachgelagert, idempotent und niemals Autoritätsvoraussetzung. Ein `revoked`er
   Vorgänger bleibt `revoked`. Zwei
   parallele Wechsel werden per Series-Row-Lock/Version serialisiert. Nur Resume
   aus `paused` mit unveränderten Pins und weiterhin aktuellem Pointer darf
   dieselbe Zeile/Generation behalten; alte Gaps/Lane States bleiben erhalten.
3. Vor Enqueue und erneut unmittelbar vor jedem Credential-Store-Zugriff wird
   atomar geprüft, dass Connection, Account und Tenant gebunden, Job-
   `sync_activation_id`/`activation_generation` exakt der aktuellen Series-
   Generation entsprechen, Aktivierung und Credentialgeneration aktiv,
   Contract/Adapter/Profil/Capabilities nicht
   suspendiert und der Trigger zulässig sind. `paused`, `revoked`,
   `blocked_permission_evidence`, Credentialentfernung oder Suspension
   invalidieren nicht begonnene Jobs, Retries, Startup-Catch-ups und Leases;
   danach gelten null Credentialzugriffe und null Brokerrequests. Ein bereits
   entschlüsselnder Worker sendet nach erkannter Invalidierung keinen Request.
   `degraded` erlaubt nur explizite Recovery-/Auditläufe und kein Approval.
4. Der Schedulervertrag führt disjunkte Pflichtlanes:
   `incremental_fast_6h` liest ab persistierter High-Watermark mit mindestens
   72 Stunden Overlap, `rolling_audit_7d_daily` liest täglich sieben
   vollständige UTC-Tage und `rolling_audit_28d_weekly` spätestens alle sieben
   Tage das gesamte 28-Tage-Profil erneut.
5. Stabilität wird nicht auf verschiebbaren rollierenden Fenstern berechnet,
   sondern auf unveränderlichen geschlossenen UTC-Tagesbuckets. Die
   kanonische Digestdomain `stability_bucket_identity` bindet exakt Provider-ID,
   tenantgebundenes Account-HMAC, `sync_activation_id` und
   `activation_generation`, `capability_id`, typisierten Instrument-/
   Accountscope, `provider_contract_version`, `adapter_version`, `profile_id`,
   `profile_version`, `boundary_policy_version`, `bucket_start`, `bucket_end`
   und `digest_version`; der laufende UTC-Tag kann nicht stabil werden. Keine
   Beobachtung wird über Aktivierungsgenerationen oder eine dieser Versionen
   hinweg wiederverwendet. Die 7-/28-Tage-Lanes orchestrieren lediglich die
   Menge dieser unveränderlichen Buckets.
6. Jeder Sync Scope fixiert Providerkonto, Capability, Instrument und
   geschlossenes UTC-Zeitfenster. Start-/End-Grenzsemantik wird als
   `provider_unverified` persistiert und durch angrenzende Overlapfenster
   abgedeckt; sie wird nicht still als inklusiv oder exklusiv behauptet.
7. Der Adapter persistiert Provider-Page-Token/Nummer zusammen mit
   Zeit-Watermarks, Page-Inhaltshash und dem geordneten Set stabiler
   Eventidentitäten. Jede Seite wird vollständig beobachtet; bekannte Raw
   Events erhalten eine neue Observation, aber keinen zweiten Raw-Datensatz.
8. Ein technischer Cursor enthält alle belegten Sortierfelder plus stabile
   Provider-ID als Paging-Tie-Breaker. Dies beweist keine wirtschaftliche
   Reihenfolge. Fehlt ein stabiler Tie-Breaker, bildet Reconciliation eine
   Sequenzgruppe nach DEC-5761-021 oder blockiert `ambiguous_sequence`.
9. Eine wiederholte Page mit identischem Hash und nicht fortschreitendem Cursor
   löst einen Loop-Blocker aus. Page-/Event-/Byte-/Zeitlimits stoppen die Work
   Unit kontrolliert und lassen den Run resumable.
10. Ein geschlossener Bucket wird erst `observed_stable`, wenn zwei
    aufeinanderfolgende, mindestens einen Schedulerlauf auseinanderliegende
    Beobachtungen derselben Bucketidentität identische Scope-, Eventset- und
    Content-Digests liefern. `partial`, offene Pages, unbekannte Shapes,
    Capabilityfehler oder Differenzen zählen nicht und invalidieren die
    Stabilitätsgeneration.
11. `SYNC_LANE_REQUIREMENT` ist die eigenständige Soll-Autorität je
    Aktivierungsgeneration, Capability und typisiertem Instrument-/Accountscope.
    Sie bindet Provider-, Adapter-, Profil- und Capabilityversion,
    `policy_generation` und eine versionierte Requirement-Quelle. Die Sollmenge
    wird niemals aus vorhandenen Lane States abgeleitet. Fehlt für eine Profil-
    Capability jede aktuelle Requirement, bleiben drei fehlende Pflichtlanes als
    Capability-Platzhalter sichtbar.

    `SYNC_LANE_STATE.health` ist die persistierte Health-Autorität je Requirement.
    Sein eindeutiger Grain bindet Aktivierungsgeneration, Brokerkonto,
    `lane_requirement_id`, Capability, Instrument-/Accountscope, disjunkte
    `lane_id`, `profile_id`, `profile_version` und `policy_generation`. Jede
    Pflichtlane persistiert getrennt `last_complete_at`, `next_due_at`, letzten
    vollständigen Scope-Digest, letzten Fehler und eine kanonisch gebundene
    High-Watermark. `not_observed` darf keine Watermark tragen; `healthy`
    verlangt eine vollständige Watermark, deren Digest den Authority-Grain,
    letzten Complete-Scope, Zeit, Tie-Breaker und Contractversion bindet. Eine
    monotone CAS-Mutation bleibt einem späteren geschlossenen Server-RPC
    vorbehalten. Der Last-Complete-Scope-Digest ist zugleich per Composite-FK
    an den tatsächlichen Scope-Digest gebunden. Die read-only Ableitung akzeptiert
    eine `healthy`-Lane nur mit exact-scoped, geschlossenem,
    `complete_for_profile`, stability-/source-/coverage-kompatiblem Scope und
    `last_complete_at >= closed_at`; ungültige Complete-Scope-Evidenz ergibt
    fail-closed `degraded`. Activation Health ist nur
    das abgeleitete Aggregat über alle Pflichtlanes; ein Scope trägt höchstens
    einen unveränderlichen Health-Snapshot bei Abschluss. Eine überfällige Lane
    setzt das Aggregat `degraded`; Recovery erfordert einen vollständigen Erfolg
    genau dieser Lane.
    `derive_capture_health_v1` verwendet deterministisch:

    ```text
    revoked lifecycle -> revoked
    paused lifecycle -> paused
    inactive/blocked_permission_evidence/pending lifecycle -> pending
    else active and any effective requires-export/unsupported/invalid-reconciliation gap
         in this activation generation or current lane gap_requires_export -> gap_requires_export
    else active and any required lane missing/not_observed -> pending
    else active and (any required lane degraded/overdue/open non-export gap
         or any persisted-healthy lane has invalid Complete-Scope evidence) -> degraded
    else active and every current required lane is persisted healthy
         and has valid Complete-Scope evidence -> healthy
    else -> pending
    ```

    Bei aktiver Aktivierung maskiert ein gleichzeitig fehlender Lane Key keine
    bereits bekannte Export-Recoverylage als bloßes `pending`. Lifecycle-Stopp
    löscht keine Lane-/Gap-Evidenz. Ein Gap derselben Aktivierungsgeneration
    bleibt auch nach Supersession seiner früheren Policy-Requirement/Lane
    sichtbar. Ein gespeicherter Status `reconciled` wirkt nur, wenn sein exakt
    gebundener Resolution Scope geschlossen, `complete_for_profile`,
    grenzdeckend und source-kompatibel ist und der kanonische Resolution-Digest
    Scope und Gap vollständig bindet. Unbekannte Grenzen sowie
    `requires_export`/`unsupported` verlangen Provider-Export-Evidenz.
    Andernfalls bleibt die Zeile als `invalid_reconciliation`
    exportblockierend. Ein erfolgreicher Einzelrequest genügt nicht; der
    schreibende Reconciliation-RPC bleibt ein offener G1-Baustein.

    Nach Resume wird aus aktuellen Requirements/Lane States plus sämtlichen
    Gaps derselben Aktivierungsgeneration neu abgeleitet. Candidate/Approval/
    Import/Recovery lesen niemals Run-/Scope-Snapshots als Health-Autorität.
12. Jede bekannte unbelegte oder unprüfbare Candidateüberlappung erzeugt sofort
    `gap_unproven` und sperrt Auswahl, Approval und Import. Sieben/28 Tage sind
    nur Eskalations-/Recoveryfristen. Bei mehr als 28 Tagen, unbekannter Grenze
    oder nicht resumierbarem Sourcefehler wird `requires_export` oder
    `unsupported` gesetzt.
13. Ein Cycle, der in eine Carry-in-Position oder den linken
    Aktivierungs-/Gap-Rand reicht, bleibt `blocked_left_boundary`. Erst eine
    belegte Flat-Grenze und ein danach vollständig beobachteter neuer Cycle oder
    ein separat gegateter Export können ihn lösen.
14. Die normativen Achsen sind getrennt:

    ```text
    coverage_basis = provider_observed | provider_export_observed
    scope_completeness = complete_for_profile | partial | failed | unverified
    stability_status = not_observed | observed_once | observed_stable | invalidated
    lane_health = healthy | degraded | gap_requires_export | paused
    capture_health = pending | healthy | degraded | gap_requires_export | paused | revoked
    gap_status = open | degraded | requires_export | reconciled | unsupported
    coverage_policy = strict_export_verified | provider_observed_best_effort | pending_user_policy
    ```

    `complete_for_profile` bedeutet nur, dass alle Work Units dieses Profils
    erfolgreich gelesen wurden. Es ist kein Providervollständigkeitsclaim.
15. Vor Candidate-Erzeugung, Sammelauswahl, Approval-Erzeugung und Import wird
    serverseitig derselbe Eligibility Predicate neu berechnet. Er verlangt alle
    schneidenden Pflichtbuckets stabil, alle Pflichtcapabilities
    `complete_for_profile`, `activation_state=active`, alle Pflichtlanes aktuell
    und gesund, keinen offenen
    Gap/Partial/Unverified-Source, belegte linke/rechte Grenzen, eventzeitlich
    autoritative Contractfamilie/Instrumentidentität/Settlementzuordnung sowie
    komponentenspezifisch autoritative PnL-/Fee-/Fundingcurrency, genau eine
    zulässige Funding-Expectation-Resolution je potenziellem Settlementzeitpunkt,
    Allocation und Reconciliation. Für MEXC gilt
    `coverage_policy=provider_observed_best_effort`: nach Erfüllung darf der
    Candidate `eligible` werden, bleibt aber `not_export_verified` mit dem
    sichtbaren Risiko einer konsistenten vollständigen Provideromission.

Providerseitige Page-Nummern werden nicht als dauerhafte wirtschaftliche
Identität verwendet. Intern folgen Listenansichten und Verarbeitungscursor dem
Keyset-Prinzip, soweit die belegte Providerordnung dies zulässt.

### 6.4 Manueller Account-Export als optionale Dateicapability

Der Providervertrag reserviert den getrennten Source Channel
`provider_export_file` und das Profil `mexc_account_export_excel`. Für den
aktuellen Stand gilt:

| Eigenschaft | Vertragsstatus |
|---|---|
| offizieller manueller Export | dokumentiert |
| Zeitraum | bis zu drei Jahre pro Report; derzeit frühestens 2024-10-01 |
| strukturierter Formatkandidat | Excel |
| PDF | Referenz-/Belegartefakt, nicht strukturierter Import |
| CSV-API oder direkter Export-API-Download | nicht vorhanden/belegt |
| konkretes Workbook-/Sheet-/Header-/Typ-Schema | `unverified` |
| Importeligibility | `blocked` bis eigenes File-Profile-Gate |

Ein originales Workbook wird nur lokal ausgewählt; es wird weder ins Repository
aufgenommen noch an MEXC oder einen anderen Connector hochgeladen. Vor dem
Lesen gelten gepinnte Grenzen für Archivbytezahl, Entry-Anzahl,
Einzelentrygröße, kumulierte dekomprimierte Größe, Kompressionsverhältnis,
Verschachtelungstiefe, Sheets, Rows, Columns und Strings. Absolute Pfade,
Traversal, Symlinks, doppelte oder nach Kanonisierung kollidierende Entry-Namen,
rekursive Archive und Budgetüberschreitungen werden abgelehnt; Limits gelten
workbookweit und können nicht durch Sheets, Chunks oder Container umgangen
werden. Das Vorhandensein irgendeiner Formelzelle oder eines Formula Records
führt zu `source_artifact_rejected`; auch ein gecachter Formelwert wird nicht
gelesen. Ebenfalls fail-closed abgelehnt werden VBA/XLM-Makros, ActiveX, OLE,
eingebettete Packages/Archive, DDE, externe Relationships/Datenverbindungen,
verschlüsselte oder unbekannte Containerteile, `DOCTYPE`/DTD und externe XML-
Entities. Der Parser führt niemals Excel, Officecode oder externe Verbindungen
aus.

Jedes später zugelassene Dateiprofil pinnt mindestens Provider, Exporttyp,
Profilversion, erlaubte Sheetnamen, Header, Typen, Nullability, Zeitzone,
Decimal-/ID-Regeln, Requested-/Exported-Range, Generated-At, Row Counts und
Joinpfade. Datei-, Sheet- und Row-Digests sichern Provenienz und Idempotenz.
Eine manuelle Excel-zu-CSV-Konvertierung ist kein Ersatz für dieses Profil.

## 7. Fehlervertrag

Kanonische Klassen:

| Klasse | MEXC-Evidenz | Retry | Runwirkung | Approval |
|---|---|---|---|---|
| `invalid_credential` | 401, 402, Signaturfehler 602 | nein bis Credential korrigiert | failed | gesperrt |
| `ip_not_allowed` | 406 | nein bis Whitelist korrigiert | failed | gesperrt |
| `permission_missing` | 511, 701–704 | nein bis Rechte korrigiert | failed/partial | gesperrt |
| `rate_limited` | 510 | begrenzt mit Backoff | resumable/partial | gesperrt bis vollständig |
| `provider_busy` | 500, 501, 801 | begrenzt | resumable/partial | gesperrt bis vollständig |
| `maintenance` | 604, 801 | später | failed/partial | gesperrt |
| `invalid_request` | 513, 600 | nein; Contractfehler | failed | gesperrt |
| `malformed_response` | 601 oder Schemaabweichung | nur nach Klassifikation | failed/partial | gesperrt |
| `timeout` | Transporttimeout | begrenzt | resumable/partial | gesperrt bis vollständig |
| `unsupported_contract` | 1001, 1002 oder Capability | nein | blocked/excluded | gesperrt |
| `unknown_provider_error` | unbekannter Code | nein automatisch | failed | gesperrt |

Nutzertexte enthalten eine sichere Aktion und eine sanitiserte Support-
Referenz. Provider-Code, Endpointklasse und Work-Unit-ID dürfen intern
auditierbar sein; Requestsignatur, Secret, API-Key und Raw Payload nicht.

## 8. Fixture-Vertrag

### 8.1 Erlaubte Quellen

- synthetische, von Equora erstellte Datensätze;
- minimierte Beispiele aus offizieller Dokumentation, soweit lizenz- und
  datenschutzkonform paraphrasiert beziehungsweise strukturell nachgebildet;
- explizit genehmigte, vollständig anonymisierte Nichtproduktionsantworten.

### 8.2 Verbotene Inhalte

- reale API-Keys, Secrets oder Signaturen;
- `EQUORA_BROKER_SECRET_KEY`, Service Role oder Maintenance Secrets;
- reale Nutzer-, Konto-, Connection- oder Credential-IDs;
- vollständige reale Brokerpayloads;
- E-Mail-Adressen, IP-Adressen oder frei zuordenbare Labels;
- Screenshots mit Kontodaten;
- künstliche Events, die trotz fehlender stabiler Provider-ID als importierbar
  markiert werden.

### 8.3 Pflichtmetadaten je Fixture

- `provider_code`;
- `provider_contract_version`;
- `endpoint_id` und anonymisiertes Requestfenster;
- `schema_variant`;
- `fixture_version`;
- `synthetic` oder `anonymized_nonprod`;
- erwarteter Raw-Eventcount;
- erwartete Normalisierungsresultate;
- erwartete Findings/Blocker;
- erwarteter Checkpoint und Resumezustand;
- erwarteter Kandidatenstatus;
- Decimalwerte als Strings oder exakte Decimalrepräsentation.

### 8.4 Mindestfixtures

1. Leere valide Page.
2. Volle Page plus nächste Page.
3. Drei Work Units mit kontrolliertem Abbruch und Resume.
4. Zwei Events mit gleichem Zeitstempel und unterschiedlichen IDs.
5. Doppelte Observation desselben Events.
6. Gleiche Provider-ID in zwei Konten.
7. Orderrevision mit gleichem `orderId` und neuem Payloadhash.
8. Execution ohne Parent-Order im Fenster.
9. Teilfill und Teil-Exit.
10. Hedge Mode Long und Short gleichzeitig.
11. Reversal mit mengenanteiliger Doppelallocation.
12. `vol=10`, `contractSize=0.001` → `base_quantity=0.01`.
13. Funding positiv und negativ.
14. Fee in abweichender Währung.
15. Unbekannter Enumwert.
16. Fehlende stabile Provider-ID.
17. Endpoint-/Symbol-/Seitenfehler → `partial`.
18. Rate Limit und resumable Retry.
19. Nicht fortschreitende Page/Loop.
20. Late Arrival nach Approval → `needs_review`.
21. MEXC Page-Wrapper und Array-Shape als getrennte Varianten, bis die reale
    Form geklärt ist; keine Variante wird ohne Contract-Probe importfähig.
22. Backfill startet innerhalb einer offenen Position → `blocked_boundary`.
23. Sync endet vor vollständigem Exit → `open` oder `blocked_boundary`.
24. Linearer Contract mit belegter Formel und Rundungsreihenfolge.
25. Inverser beziehungsweise unbekannter Contract ohne belegte Formel →
    `not_comparable` und nicht importierbar.
26. Versuch `POST`, `PUT`, `PATCH` oder `DELETE` → Ablehnung vor
    Credentialverwendung und Netzwerkzugriff.
27. Bekannter MEXC-Order-Create-/Cancel-/Reverse-/Close-Pfad → `forbidden`.
28. Unbekannter GET-Pfad oder freie URL → `transport_contract_violation`.
29. Redirect auf anderen Host → keine Weiterleitung und keine Credentialheader.
30. Redirect auf erlaubten Host mit anderem Pfad → ebenfalls keine
    Weiterleitung.
31. Query-/Pfadinjektion mit Host-, Schema- oder Traversalanteil → Ablehnung.
32. Simulierte positive Tradingpermission → Key ablehnen, sofern die
    Permission technisch auslesbar ist; andernfalls nur Nutzerattestierung und
    keine Verifikationsbehauptung.
33. WebSocket-/SDK-Mock versucht Tradingnachricht → Capability nicht vorhanden
    beziehungsweise sendeseitig blockiert.
34. Long und Short mit mehreren Scale-ins/-outs sowie erneutem Add nach
    Teil-Exit; Entry-/Exit-Summen, Peak- und End-Inventar separat erwartet.
35. Overshoot-Reversal; Close- plus Open-Allocation entspricht exakt der
    Executionmenge.
36. Same-Timestamp-Sequenzgruppe mit fachlich äquivalenten Permutationen →
    kanonisierbar.
37. Same-Timestamp-Sequenzgruppe mit verschiedenen Cycle-/PnL-Ergebnissen →
    `ambiguous_sequence`.
38. Executionfees plus identisches Position-`totalFee` → genau eine gebuchte
    Authority, Aggregat nur Referenz.
39. Positionaggregate widersprechen Executionsumme → `mismatch`, keine
    Ersatzbuchung.
40. Funding mit Position-ID, Funding ohne Position-ID bei simultanem Hedge-
    Long/Short und Settlement exakt an Cycle-Grenze.
41. Malformed/mixed Arrayelement, `data=null`, fehlendes Pflichtfeld,
    unbekannter Enum und unsichere große ID → sichtbarer Blocker, niemals `[]`.
42. Serverzeit fehlend, `null`, String, Float, Sekunden, außerhalb
    Plausibilitätsfenster → null Signaturen, Credentialzugriffe und private
    Requests.
43. Redirect `301/302/303/307/308` auf Same-Host-Fremdpfad, Subdomain,
    Fremdhost, anderen Port und HTTP-Downgrade → Zielserver null Requests.
44. Body ohne/falsches `Content-Length`, Chunked und komprimierte Übergröße →
    Abbruch vor JSON-Parsing.
45. Synthetisches Fixture bestanden, aber keine Providerbeobachtung →
    `adapter_fixture_state=passed`, `import_eligibility=blocked`.
46. Providerbeobachtung widerspricht dokumentierter Shape → Capability
    `suspended`, keine Vollständigkeitsbehauptung.
47. Overshoot-Reversal mit einer Execution-Fee über zwei Candidates →
    Teilbeträge summieren sich exakt zum Quellbetrag; kein doppelter Vollbetrag.
48. Unbelegte PnL-Coverage eines Reversals → Close-/Open-Components
    `not_comparable`; Opening-Anteil erhält kein geratenes Closing-PnL.
49. Dasselbe Funding Event in zwei aktuellen Candidates → Constraintblocker;
    belegter Split nur mit exakter Summeninvariante und identischer Currency.
50. Order- und Positionaggregate sind typisierte `reference_only`-Inputs und
    ändern keine Kandidatensumme.
51. Same-Timestamp-Gruppe mit gemischten Deltas oder überschrittenem
    Group-/CPU-/State-Budget → sofort `ambiguous_sequence`, keine faktorielle
    Enumeration und kein ID-Fallback.
52. Contract Metadata mit fehlendem `settleCoin`, `contractSize`, `priceUnit`
    oder `volUnit`, falschem Symbol beziehungsweise Listenshape → blockierend.
53. Position-Mode-Dokumentationsshape → Capability bleibt blockiert und trägt
    nicht zur Vollständigkeit bei.
54. Account Identity/Account Financial Event ohne registrierte MEXC-Capability
    → `unsupported`, keine Ableitung aus Label, Symbol, Rate oder Aggregat.
55. Aktuelle Contract Metadata wird rückwirkend auf ein älteres Economic Event
    angewandt → keine `EVENT_CONTRACT_AUTHORITY`, Candidate blockiert.
56. Contract Metadata wurde nur im selben Beobachtungsintervall wie das Economic
    Event gesehen, besitzt aber keine belegte Valid-Time-Grenze →
    `non_authoritative_same_bracket`, Candidate blockiert.
57. Contractfamilie beziehungsweise Settlement Asset wechselt im Verlauf
    A → B → A; eine aktuelle A-Observation darf den historischen B-Abschnitt
    nicht überschreiben → jedes Event benötigt seine eigene zeitgültige
    Authority.
58. Gleiches Symbol wird mit anderer Contractfamilie oder anderem Settlement
    Asset wiederverwendet → Symbolgleichheit erzeugt keine Authority und kein
    Candidate-Merge.
59. Offizielle immutable Instrumentregel besitzt eine exakt belegte, zum Event
    passende Gültigkeit und Identität → `EVENT_CONTRACT_AUTHORITY` darf genau in
    diesem Scope `authoritative` werden; außerhalb bleibt sie blockiert.
60. Execution enthält `profit`, aber keine autoritative PnL-Währung →
    `pnl_currency=currency_unknown`; kein Review, Approval oder Import bis zu
    einer eventzeitlich autoritativen Währungsregel.
61. Fundingendpoint liefert für einen nach Boundary Rule potenziellen
    Settlementzeitpunkt eine leere valide Page → keine Nullbuchung;
    `expectation_unverified` und Candidate blockiert.
62. Funding-Schedule-/Expectation-Oracle fehlt oder ist nicht eventzeitlich
    gültig → `expectation_unverified`; weder Nichtzutreffen noch Null darf
    abgeleitet werden.
63. Providerbelegte, scope- und zeitgebundene Zero-Completeness-Evidenz für ein
    erwartetes Funding Settlement → `authoritative_zero_resolved`, exakt null
    und keine synthetische Fundingbuchung.
64. Autoritative Fundingbuchung als Debit und als Credit → jeweilige
    Source-ID, Currency, Vorzeichenregel und Allocation sind exakt gebunden;
    `booked_event_resolved`.
65. Funding Settlement liegt exakt auf Cycle-Start beziehungsweise Cycle-Ende
    → Zuordnung ausschließlich nach der gepinnten, start-/end-inklusiv
    definierten Boundary Rule; fehlende oder widersprüchliche Regel blockiert.
66. Funding Event ohne eindeutige Position-ID trifft im Hedge Mode auf
    gleichzeitigen Long-/Short-Lifecycle → `ambiguous_attribution`, kein
    Candidate review- oder importfähig.
67. Health-Präzedenzkombinationen für revoked, paused, pending, Exportgap,
    degraded und healthy → ausschließlich `derive_capture_health_v1`; eine
    Pause oder ein Resume löscht keine zugrunde liegende Gap-/Lane-Evidenz.
68. Reaktivierung nach inactive/revoked mit denselben Events → neue
    `activation_generation`; keine Stabilitäts- oder Completeness-Evidenz wird
    aus der alten Generation übernommen.
69. Änderung von Providercontract-, Adapter-, Profile-, Boundary- oder Capture-
    Digestversion beziehungsweise Capability-/Scopeidentität → neue Bucket-/
    Stability-Identität; Digests aus dem alten Scope dürfen keine aktuelle
    Eligibility begründen. Eine Candidate-/Reconciliation-`algorithm_version`
    erzeugt dagegen eine neue Candidate Revision und invalidiert abhängige
    Approval-Snapshots, aber nicht automatisch den Raw-Capture-Stability-Bucket.
70. Zwei parallele Reaktivierungen beziehungsweise Pinwechsel derselben
    Activation Series → genau eine neue Current-Generation; der verlierende
    Versuch liest neu und erzeugt null Jobs, Leases, Credentialzugriffe oder
    Brokerrequests. Die Vorgängergeneration ist im selben Commit nicht mehr
    arbeitsfähig.

## 9. Unresolved-Register

| ID | FAKT/EVIDENZ | Risiko | Owner | Akzeptanzkriterium |
|---|---|---|---|---|
| MEXC-U01 | Offizielle Basisdomain ist `api.mexc.com`; Code nutzt `contract.mexc.com` | Veralteter oder ausfallender Connector | A2 | Genehmigter read-only Contract-Probe und statische Host-Allowlist |
| MEXC-U02 | Aktueller Deal-History-Pfad enthält `/v3`; Code nutzt Legacy-Pfad | Falsche oder unvollständige Datenform | A2 | Pfad-/Shape-Fixture und Nichtproduktionsnachweis |
| MEXC-U03 | Feldtabellen beschreiben Page-Wrapper, Beispiele zeigen teils Arrays; Discovery beobachtete Arrays für Orders/Executions und ein Funding-Pageobjekt, aber kein Positionsitem | Parser kann weitere valide Varianten verwerfen oder falsche Counts erzeugen | A2 | Expliziter versionierter Shape-Vertrag je Capability; unbekannte Varianten blockieren |
| MEXC-U04 | Discovery beobachtete ein Funding-Item, aber keine Response-Position-ID, Währung oder belegte Filter-/Vorzeichensemantik | Fundingzahlungen nicht belastbar einem Lifecycle und einer Währung zuordenbar | A5 | A5-Reconciliation mit belegter Currency-, Authority-, Vorzeichen- und Lifecycle-Regel |
| MEXC-U05 | Position-Mode-Seite nennt `positionMode`, Beispiel zeigt andere Struktur | Hedge-/One-way-Erkennung unsicher | A5 | Belegte Responseform und Negativtests |
| MEXC-U06 | Sortierung, Inklusivität, Retention, Snapshotstabilität fehlen | Historische Lücken oder Doppelzählungen | A2 | Offizielle Klärung oder kontrollierte Contract-Probes |
| MEXC-U07 | `version` erscheint in Beispielen, ist nicht ausreichend definiert | Order-/Positionrevisionen falsch interpretiert | A2 | Revisionsvertrag mit belegtem Verhalten |
| MEXC-U08 | Keine vollständige technische Rechteübersicht gefunden | Überzogener Read-only-Claim | A4 | Claims auf Lesetest plus Nutzerattestierung begrenzen |
| MEXC-U09 | Historische Contract-Metadata-Gültigkeit ist nicht dokumentiert | Falsche Contract Size für alte Trades | A5 | Historische Metadatenquelle oder fail-closed Policy |
| MEXC-U10 | Ein vollständig versionierter Valuation-/PnL-Vertrag je historischem Contracttyp ist nicht belegt | Linearformel könnte auf inverse/Quanto-Kontrakte angewandt werden | A5 | Belegtes Valuation-Modell, Formelversion und Golden Fixtures je unterstütztem Typ |
| MEXC-U11 | Belastbare Konto-/Subkontoidentität für Reconnect und Multi-Account ist in den ausgewerteten Endpoints nicht belegt | Falsches Zusammenführen oder Trennen wirtschaftlicher Konten | A2 | Offizieller read-only Identity-Contract oder explizit connectiongebundener Scope ohne Auto-Merge |
| MEXC-U12 | Der bestehende interne Fetch-Helfer ist generisch und sperrt Redirects nicht ausdrücklich; einschlägige Tests fehlen | Spätere Regression könnte Credentials an nicht erlaubte Methode, URL oder Redirectziel senden | A4 | Zentraler Capability-Transport, MEXC GET-only, `redirect=error`, Adapterimportgrenze und Negativtests 26–46 |
| MEXC-U13 | Dokumentationsfeldtabellen und Beispiele widersprechen sich; mehrere importkritische Felder fehlen jeweils in einer Darstellung | Parser könnte malformed/unvollständig als leer behandeln | A2 | Striktes Feldoracle 5.7 durch Providerbeleg vervollständigen; positive/negative Shapes ohne stilles Filtern |
| MEXC-U14 | Synthetische Fixtureevidenz und reales Providerverhalten waren im Status vermischt | Unbelegte Vollständigkeitsclaims | A2 | Getrennte Evidenzdimensionen; keine Importeligibility allein durch Fixture |
| MEXC-U15 | Der bestehende Serverzeitparser fällt bei malformed HTTP 200 auf `Date.now()` zurück | Privater Request ohne valide Providerzeit; Contractbruch bleibt unsichtbar | A2 | Strikter Unix-ms-/Plausibilitätsparser, kein Fallback, null Credential-/Signatur-/Privatrequests bei Fehler |
| MEXC-U16 | MEXC stellt laut Support keine historischen Contract-Metadata-Snapshots bereit | Aktuelle Metadaten könnten rückwirkend eine falsche Contractfamilie, Instrumentidentität oder Settlement Currency autorisieren | A5 | `EVENT_CONTRACT_AUTHORITY` nur aus event-embedded Evidence, belegter Provider-Valid-Time-Version oder exakt gescopter offizieller Immutable Rule; sonst fail-closed |
| MEXC-U17 | Ein leeres Fundingresultat belegt weder, dass kein Settlement erwartet war, noch dass der gebuchte Betrag null war | Fehlende Fundingkomponente und falscher Netto-PnL könnten unbemerkt bleiben | A5 | `FUNDING_SETTLEMENT_EXPECTATION_EVIDENCE` je potenziellem Settlement; nur gebuchtes Event, autoritative Null oder autoritatives Nichtzutreffen löst die Erwartung auf |
| MEXC-U18 | Das Executionfeld `profit` enthält in der dokumentierten/observierten Shape keine eigenständige, eventgebundene Currency Authority | Profit könnte in einer geratenen Settlement Currency gebucht oder mit anderen Währungen addiert werden | A5 | `currency_unknown` bis zur eventzeitlich autoritativen Contract-/Buchungsregel; Currency-Authority auf `FINANCIAL_COMPONENT` und sourcegleich erzwungen |

## 10. Kontrolliertes Non-Production-Read-Probe-Protokoll

Dieses Protokoll definierte den kleinstmöglichen Evidenzschritt für MEXC-U01
bis U15. Public- und Private-Phase wurden am 2026-08-04 nach Nutzerfreigabe
ausgeführt und sind in §10.5/§10.6 dokumentiert. Das Protokoll autorisiert
keinen weiteren Request und keine erneute Credentialverwendung.

### 10.1 Voraussetzungen

- separate ausdrückliche Nutzerfreigabe für genau diesen Probe;
- eigens dafür verwendeter MEXC-Key mit ausschließlich den erforderlichen
  View-/Leserechten; Order-, Positionsänderungs-, Transfer- und
  Auszahlungsrechte providerseitig deaktiviert;
- soweit verfügbar IP-Bindung und anschließend dokumentierter Key-Widerruf;
- keine Service Role, keine Produktionsdatenbank und kein Schreiben von Raw
  Responses in Git, Logs oder Testreports;
- Probe-Runner verwendet ausschließlich die vorab statisch geprüften MEXC-
  GET-Capabilities und `redirect: 'error'`;
- A4 bestätigt Canary-/Redactionpfad, A3 bestätigt Evidenzschema, A5 bestätigt
  die benötigten fachlichen Felder vor Start.

### 10.2 Feste Capability- und Requestgrenzen

Zulässig sind ausschließlich:

1. einmal Serverzeit;
2. einmal Contractmetadaten für höchstens ein vereinbartes Instrument;
3. je einmal Page 1 mit minimaler erlaubter Page Size für Historical Orders,
   Historical Executions, Historical Positions und Funding Fee Details;
4. höchstens eine gezielte Wiederholung derselben Page zur Stabilitätsprüfung;
5. optional eine zweite Page nur, wenn Page 1 eine belegte Pageform und
   `totalPage > 1` zeigt und A3 den Schritt vorab im Probeplan aufgenommen hat.

Für jedes zukünftige Probe-Budget zählt jeder tatsächlich abgesendete externe
Request kumulativ, einschließlich öffentlicher Diagnosecalls, abgebrochener
Versuche und Retries. Ein lokaler Fehler setzt den Zähler nicht zurück. Ein
Retry benötigt vor dem ersten neuen Request eine neue ausdrückliche
scope-spezifische Nutzerfreigabe mit eigenem Budget. Das Bereitstellen oder
Ersetzen eines Credentialartefakts ist keine solche Freigabe. Eine abhängige
Page darf nur nach nachweislich erfüllter schriftlicher Vorbedingung angefordert
werden; andernfalls stoppt der Runner.

#### 10.2.1 Historisches erweitertes Discovery-Profil und Vertragsabweichung

Der dem Nutzer vor dem ersten erweiterten Versuch beschriebene, auf sieben GETs
begrenzte Discovery-Plan zielte auf folgende einmalige Beobachtungssequenz:

1. Serverzeit;
2. accountweite Historical Orders Page 1 ohne Symbol-/Zeitfilter,
   `page_size=1`;
3. accountweite Historical Orders Page 2 ohne `totalPage`-Vorbedingung,
   `page_size=1`;
4. Contract Metadata für das nur im Prozessspeicher aus Order Page 1
   abgeleitete Symbol;
5. Historical Executions `/v3` für abgeleitetes Symbol/Zeitfenster;
6. Historical Positions für abgeleitetes Symbol, Positionstyp und Zeitfenster;
7. Funding Fee Details für abgeleiteten Scope.

Dieses einmalige `discovery_probe_profile_v1` ist kein Produktions-, Import-
oder Adapterqueryprofil. Insbesondere lockert es §5.7.5 nicht: Das dort
festgelegte Historical-Orders-Profil verlangt für den späteren Import weiterhin
Symbol und geschlossenes Zeitfenster. Das Discovery-Profil darf weder in
Runtimecode übernommen noch als Retention-/Vollständigkeitsbeleg verwendet
werden.

Zum Ausführungszeitpunkt war dieses abweichende Profil jedoch nicht als eigene
versionierte Ausnahme im Providervertrag festgehalten. Der accountweite
Orders-Request widersprach daher formal dem geschlossenen §5.7.5-Profil; Page 2
widersprach der Vorbedingung aus §10.2 Nr. 5. Die nachträgliche Dokumentation
macht die Ausführung nicht rückwirkend vertragskonform. Zusammen mit der in
§10.7 dokumentierten Budgetüberschreitung ist dies `BRI-031`. Künftige
Discovery-Profile müssen vor jeder Ausführung versioniert, von A3/A4 geprüft
und vom Nutzer mit kumulativem Requestbudget ausdrücklich freigegeben werden.

Kein Endpoint, keine Methode und kein Host darf zur Laufzeit ergänzt werden.
Order-Create/-Modify/-Cancel, Position-Modify/-Close/-Reverse, Transfer,
Withdrawal und alle sonstigen Mutationspfade bleiben strukturell
nicht registriert. Ein Redirect, unbekanntes Shape, malformed Element,
unplausible Serverzeit, Permissionabweichung oder Credential-Canary-Treffer
beendet den Probe sofort; es gibt keinen automatischen Fallback.

### 10.3 Datenminimierte Evidenz

Persistiert werden außerhalb der kurzlebigen lokalen Probe-Session nur:

- Datum, Vertrags-/Adapterversion und freigegebene Capability-ID;
- final validierter Origin/Pfad, Methode `GET`, HTTP-/Providerstatusklasse und
  sanitiserte Incident-/Requestreferenz;
- Response-Shape-ID, Feldnamen, JSON-Typen, Null-/Pflichtbeobachtung und
  anonymisierte Count-/Page-Metadaten;
- boolesche Beobachtung zu Sortierung, Wiederholungsstabilität und
  Zeitgrenzverhalten, ausdrücklich ohne daraus unbeobachtete Garantien
  abzuleiten;
- salted/ephemeral Digests zur Gleichheitsprüfung innerhalb des Probe;
- `observation_status` als `observed_nonprod` oder `contradicted` und getrennt
  davon `coverage_status` als `sufficient`, `partial` oder `insufficient`.

Nicht persistiert werden Provider-IDs, Symbole bei möglicher Zuordenbarkeit,
Zeitpunkte, Preise, Mengen, Gebühren, PnL, Fundingwerte, API-Key, Secret,
Signatur, vollständige Querystrings oder Responsebodys. Ein Probe kann nur
beobachtetes Verhalten bestätigen; Retention, Late Arrivals oder globale
Sortiergarantien benötigen weiterhin offizielle Provider-/Supportevidenz, wenn
sie im begrenzten Probe nicht belastbar beobachtbar sind.

### 10.4 Abschluss und Löschung

- A3 prüft Requestcount, Allowlist, Redaction und Evidenz gegen den genehmigten
  Plan;
- A4 prüft null Secret-/Credentialtreffer in allen erreichbaren Logs und die
  Löschung kurzlebiger Probe-Artefakte;
- der Nutzer widerruft den Probe-Key beim Provider; Equora weist darauf hin,
  dass lokale Löschung keinen Providerwiderruf ersetzt;
- jede Capability wird einzeln bewertet. Ein Teilerfolg erzeugt keinen
  pauschalen „MEXC verifiziert“-Status;
- G0/G1 ändern ihren Status erst nach A2/A3/A4/A5-Review der minimierten
  Evidenz.

### 10.5 Sanitiserte Public-Phase-Beobachtung vom 2026-08-04

Nach ausdrücklicher Nutzerfreigabe wurde der credentialfreie Teil des Probes
mit zwei fest codierten öffentlichen `GET`-Requests ausgeführt. Annahme für die
Ein-Instrument-Beobachtung war `BTC_USDT`. Es wurden keine Credentials, keine
Service Role und keine Datenbank verwendet; vollständige Responsebodys,
Provider-IDs und wirtschaftliche Feldwerte wurden weder in Dateien noch in
Testreports persistiert.

| Capability | Sanitiserte Beobachtung | Evidenzstatus |
|---|---|---|
| Serverzeit | `GET https://api.mexc.com/api/v1/contract/ping`; HTTP 200; finaler Origin/Pfad unverändert; kein Redirect; `application/json`; Bodyklasse `<=64 KiB`; Envelopekeys `code,data,success`; `data` als `Int64` | `observation_status=observed_nonprod`, `coverage_status=partial`; Wert wurde absichtlich nicht ausgegeben/persistiert, daher Plausibilitäts-/Skewprüfung nicht als bestanden behauptet |
| Contract Metadata | `GET https://api.mexc.com/api/v1/contract/detail/country?symbol=<agreed instrument>`; HTTP 200; finaler Origin/Pfad unverändert; kein Redirect; `application/json`; Bodyklasse `<=64 KiB`; Envelopekeys `code,data,success`; `data` als genau ein Objekt; beobachtete IR-Felder unter anderem `symbol:string`, `baseCoin:string`, `quoteCoin:string`, `settleCoin:string`, `futureType:Int32`, `contractSize:Decimal`, `priceUnit:Decimal`, `volUnit:Int32`, `state:Int32` | `observation_status=observed_nonprod`, `coverage_status=partial`; Shape/Feldtypen beobachtet, aber keine historische Gültigkeit, Valuationart, Multiplier-Einheit, Fundingcurrency oder globale Providergarantie belegt |

Requestcount dieser Phase: exakt zwei öffentliche `GET`-Requests. Es gab keinen
Credentialzugriff, keine Signatur und keinen privaten Request. Die Beobachtung
stützt den aktuellen öffentlichen Origin/Pfad für genau diese Aufrufe, schließt
aber insbesondere MEXC-U02/U03/U04/U05/U09/U10/U13 sowie Pagination,
Retention, Late Arrivals und private Permissionsemantik nicht.

Für die credentialgebundene Phase wurde vor dem ersten privaten Request eine
neue, innerhalb desselben gebundenen Probe-Schritts validierte Serverzeit
gelesen. Lokale Zeit wurde nicht als Ersatz verwendet.

### 10.6 Sanitiserte Private-Phase-Beobachtung vom 2026-08-04

Nach Nutzerfreigabe wurde ein bereits vorhandener, vom Nutzer als ausschließlich
View-/Read-only konfiguriert bestätigter MEXC-Key lokal per Windows-DPAPI
bereitgestellt. Der Runner entschlüsselte Key und Secret nur im Prozessspeicher.
Ein erfolgreicher Leseaufruf beweist technisch die Lesecapability, aber nicht
die Abwesenheit zusätzlicher providerseitiger Keyrechte; Equoras eigene Grenze
bleibt deshalb unabhängig davon eine leere Mutationsallowlist.

Der Runner sendete ein Instrument, ein clientseitiges 30-Tage-Fenster,
`page_num=1`, `page_size=1` sowie bei Positionen und Funding
`position_type=1`. Der erfolgreiche gebundene Lauf führte genau fünf Requests
aus: einmal Serverzeit
und je einmal Historical Orders, Historical Executions `/v3`, Historical
Positions und Funding Fee Details. Alle registrierten Methoden waren `GET`;
Mutationsmethoden waren nicht registriert. Redirects waren deaktiviert, der
Origin war fest `https://api.mexc.com`, und jeder Body war auf 64 KiB begrenzt.

| Capability | Sanitiserte Beobachtung | Evidenzstatus |
|---|---|---|
| Serverzeit | `GET /api/v1/contract/ping`; HTTP 2xx; Providerstatus `success/code=0`; Envelope `code:integer32,data:integer64,success:boolean`; Unix-ms plausibel; Clock-Skew-Klasse `<=1s` | `observed_nonprod` für genau diesen Aufruf |
| Historical Orders | `GET /api/v1/private/order/list/history_orders`; HTTP 2xx; Providerstatus `success/code=0`; `data:array`; parametrisierter Page-1-Request ohne Providerfehler, Itemcount-Klasse `zero` | Host/Pfad und Authentisierung dieses Requests beobachtet; Filterwirkung, Itemshape, Sortierung, Paging und Vollständigkeit `coverage_status=insufficient` |
| Historical Executions `/v3` | `GET /api/v1/private/order/list/order_deals/v3`; HTTP 2xx; Providerstatus `success/code=0`; `data:array`; parametrisierter Page-1-Request ohne Providerfehler, Itemcount-Klasse `zero` | `/v3`-Pfad und Authentisierung dieses Requests beobachtet; Filterwirkung, Itemshape und Historiensemantik `coverage_status=insufficient` |
| Historical Positions | `GET /api/v1/private/position/list/history_positions`; HTTP 2xx; Providerstatus `success/code=0`; `data:array`; mit `position_type=1` parametrisierter Request ohne Providerfehler, Itemcount-Klasse `zero` | Authentisierung dieses Requests beobachtet; Filterwirkung, Itemshape, Short-Scope und Lifecyclegrenzen `coverage_status=insufficient` |
| Funding Fee Details | `GET /api/v1/private/position/funding_records`; HTTP 2xx; Providerstatus `success/code=0`; Pageobjekt mit `currentPage,pageSize,resultList,totalCount,totalPage`; `resultList` leer | Authentisierung dieses Requests und Page-Envelope beobachtet; Filterwirkung, Funding-Itemshape, Currency und historische Semantik `coverage_status=insufficient` |

Vor dem erfolgreichen gebundenen Lauf schlugen Credential- und Runner-
Validierungen fail-closed fehl. Ungültig kurze erste Eingaben sowie ein
PowerShell-Parserfehler erzeugten null Requests. Drei zusätzliche öffentliche
Serverzeit-GETs wurden zur Diagnose einer PowerShell-5.1-Dictionary-
Inkompatibilität ausgeführt; kein privater Endpoint wurde dabei aufgerufen und
kein Credentialheader gesendet. Zusammen mit dem frischen Serverzeit-GET des
erfolgreichen Laufs umfasst diese Private-Phase-Arbeit vier öffentliche
Serverzeit-GETs und vier private GETs. Die frühere Public-Phase umfasste separat
zwei öffentliche GETs.

Es wurden keine Raw Bodys, Provider-IDs, Symbole, Zeitwerte, Preise, Mengen,
Gebühren, PnL-, Funding-, Key-, Secret- oder Signaturwerte persistiert oder
ausgegeben. Der Sanitiserungs-Canary fand keinen Credential- oder
Signaturtreffer. Die DPAPI-Datei blieb nach dieser ersten Private-Phase zunächst
bis zur späteren ausdrücklichen Löschfreigabe vorhanden. Ihre in §10.7
dokumentierte lokale Löschung ersetzt keinen Providerwiderruf.

Aus den leeren Itemlisten dürfen ausdrücklich keine Feld-, Nullability-,
Sortier-, Retention-, Late-Arrival-, Snapshot- oder globale
Paginationgarantien abgeleitet werden. Der Probe schließt MEXC-U01 und den
aktuellen privaten `/v3`-Pfad für den beobachteten Stand, reduziert aber die
übrigen Providerunsicherheiten nur.

### 10.7 Abgebrochener erweiterter Discovery-Versuch und Credential-Cleanup

Der Nutzer gab anschließend einen erweiterten, weiterhin GET-only gebundenen
Discovery-Probe mit maximal sieben Requests und die anschließende Löschung der
lokalen DPAPI-Probedatei frei. Der Runner führte genau einen öffentlichen
Serverzeit-GET aus. Nach erfolgreicher HTTP-/Envelope-/Zeitvalidierung scheiterte
er beim lokalen Aufbau des sanitisierten Ergebnisobjekts, weil Windows
PowerShell 5.1 ein direkt in Klammern verwendetes `if` nicht als Ausdruck
auswertet. Der Runner stoppte fail-closed vor dem ersten privaten Request.

Ergebnis dieses Versuchs:

- Requestcount exakt eins, ausschließlich `GET /api/v1/contract/ping`;
- null private Requests und null Credentialheader an MEXC;
- keine Order-, Execution-, Position-, Funding- oder Contract-Metadata-
  Discovery ausgeführt;
- keine Raw Bodys, Providerwerte, Credentials oder Signaturen persistiert;
- die exakt freigegebene Datei
  `%LOCALAPPDATA%/EquoraProbe/mexc-readonly-probe.dpapi.json` wurde anschließend
  nicht rekursiv gelöscht; eine inhaltsfreie Nachprüfung ergab `Exists=false`;
- die Löschung ist regulär nicht über den Papierkorb erfolgt und widerruft den
  weiterhin providerseitig verwalteten MEXC-Key nicht.

Der Ausdrucksfehler ist lokal ohne Netzwerk reproduziert. Die korrigierte
Variante mit vorab berechneter Skew-Klasse und ohne verschachtelte Array-
Rückgabe wurde anschließend mit synthetischen Dictionaries/Arrays bis zum
sanitisierten JSON-Ergebnis erfolgreich vorgeprüft. Danach stellte der Nutzer
in direkter Fortsetzung ein neues DPAPI-Artefakt bereit. A1 behandelte diese
Bereitstellung zusammen mit der früheren „Gerne weiter“-Nachricht
fälschlicherweise als ausreichende Autorisierung für einen Retry mit neuem
Sieben-Request-Zähler. Eine neue ausdrückliche scope- und budgetspezifische
Freigabe lag jedoch nicht vor.

Der abgebrochene Versuch hatte bereits einen externen GET verbraucht; der
nachfolgende Retry verbrauchte weitere sieben. Kumulativ wurden somit acht GETs
gegenüber dem ursprünglich genehmigten Maximum von sieben ausgeführt. Außerdem
forderte der Retry Orders Page 2 an, obwohl Page 1 als `bare_array_v1` keine
`totalPage > 1`-Evidenz lieferte und damit die Vorbedingung aus §10.2 Nr. 5
nicht erfüllt war. Beides ist eine Governance-/Protokollabweichung unter
`BRI-031`. Es ist kein Broker-Mutationsvorfall: Der erste Versuch sendete null
Credentialheader und null private Requests; sämtliche acht Requests waren GET,
und im Retry war keine Mutationsmethode registriert. Der abgebrochene Versuch
erzeugt keine Itemevidenz; der synthetische Dry-Run ist reine Harness-, keine
Providerevidenz.

Die Abweichung wird nicht rückwirkend als autorisiert dargestellt. Jeder
spätere neue oder erneut auszuführende Probe benötigt vorab eine ausdrücklich
scope-spezifische Nutzerfreigabe mit eigenem kumulativem Requestbudget und ein
neues DPAPI-Artefakt. Aktuell ist kein weiterer Probe autorisiert.

### 10.8 Erfolgreicher erweiterter Discovery-Probe

Der korrigierte Retry endete `completed_sanitized` mit
`observation_status=observed_nonprod`, `coverage_status=partial` und exakt
sieben von sieben lokal für diesen Retry konfigurierten Requests. Diese sieben
waren nicht zusätzlich durch ein neues Nutzerbudget autorisiert; zusammen mit
dem abgebrochenen Vorversuch beträgt der kumulative Count acht. Alle
registrierten Methoden waren `GET`; die Mutationsmethodenliste war leer.
Symbol, Positionstyp, Position-ID und das höchstens 90 Tage umfassende
Zeitfenster wurden nur im Prozessspeicher aus dem ersten beobachteten Orderitem
abgeleitet. Es wurden keine tatsächlichen Symbole, IDs, Zeitstempel, Preise,
Mengen, Fee-, PnL- oder Fundingwerte ausgegeben oder persistiert.

Der für A1 erreichbare Runneroutput enthielt außerdem keinen API-Key, Secret,
keine Signatur, kein Signaturziel, keine Credentialheader, vollständigen
Querystrings oder Raw Response Bodys. Der Runner schrieb diese Inhalte
absichtlich in keine Projektdatei und keinen Testreport. Für diesen Retry wurde
jedoch kein eigener Canary-Scan-Nachweis ausgegeben; deshalb wird keine Aussage
über nicht erreichbare Telemetrie, versteckte Systemlogs oder forensische
Artefakte getroffen.

| Nr. | Capability / Request | Sanitisierte Providerbeobachtung | Evidenzgrenze |
|---:|---|---|---|
| 1 | Serverzeit, `GET /api/v1/contract/ping` | HTTP 2xx, `success/code=0`, plausibler `integer64`-Zeitwert, Skewklasse `<=1s` | nur dieser Aufruf |
| 2 | Orders Page 1, accountweit, `page_size=1` | `data:array`, genau ein Item | Itemshape beobachtet; kein Retention-/Vollständigkeitsbeleg |
| 3 | Orders Page 2, accountweit, `page_size=1` | genau ein von Page 1 verschiedenes Item; beobachtete `createTime` nicht neuer als Page 1 | belegt genau dieses Seitenpaar, keine globale Sortier-/Snapshotgarantie |
| 4 | Contract Metadata für abgeleitetes Symbol | `data:object`, Symbolmatch; u. a. `futureType`, Base-/Quote-/Settle-Coin, `contractSize`, Scale-/Unit-Felder und aktuelle Risikofelder typisiert | aktuelle Metadaten, keine historische Gültigkeit/Rundung |
| 5 | Executions `/v3`, abgeleitetes Symbol/Fenster, Page 1 | `data:array`, genau ein Item | Itemshape beobachtet; keine globale Paging-/Lifecyclevollständigkeit |
| 6 | Historical Positions, abgeleiteter Scope, Page 1 | `data:array`, null Items | Hülle beobachtet; Itemshape/Boundary weiterhin unbelegt |
| 7 | Funding, abgeleiteter Scope, Page 1 | Pageobjekt, genau ein `resultList`-Item | Itemshape beobachtet; Filterwirkung, Währung, Vorzeichen und Lifecycle-Link unbelegt |

Sanitisiert beobachtete Order-Kernfelder waren `orderId`, `symbol`,
`positionId`, `side`, `positionMode`, `state`, `category`, `orderType`, `vol`,
`dealVol`, `price`, `dealAvgPrice`, `feeCurrency`, `createTime`, `updateTime`,
`externalOid` und `version` sowie die in §5.7.6 genannten optionalen Felder.
Execution-Kernfelder waren `id`, `orderId`, `symbol`, `side`, `positionMode`,
`vol`, `price`, `fee`, `feeCurrency`, `profit`, `timestamp`, `category`,
`taker`, `externalOid`, `opponentOrderId` und `isSelf`. Funding-Kernfelder waren
`id`, `symbol`, `positionType`, `positionValue`, `funding`, `rate` und
`settleTime`. Contract Metadata lieferte insbesondere `symbol`, `id`,
`futureType`, `state`, `baseCoin`, `quoteCoin`, `settleCoin`, `contractSize`,
`priceScale`, `volScale`, `amountScale`, `priceUnit`, `volUnit`, `minVol`,
`maxVol`, `positionOpenType`, `riskLongShortSwitch`, `createTime` und
`openingTime`.

Die beobachteten Finanzzahlen variierten zwischen ganzzahligen und dezimalen
JSON-Zahllexemen. Das ist Providerbeleg für eine lossless JSON-Zahlfamilie,
nicht für feldweise wechselnde fachliche Integersemantik. Der Parservertrag in
§5.7 normalisiert diese Werte daher verlustfrei als Decimal.

Nach Abschluss wurde die DPAPI-Probedatei gelöscht; eine inhaltsfreie
Nachprüfung bestätigte `Exists=false`. Belegt sind ausschließlich der entfernte
aktive Pfad und der Papierkorb-Bypass. Es erfolgte kein forensischer Secure-
Erase-Nachweis; über Dateisystemreste, Schattenkopien, Backups oder
Wiederherstellbarkeit wird keine Aussage getroffen. Die lokale Löschung
widerruft den providerseitig weiterbestehenden MEXC-Key nicht. Kein weiterer
Probe ist durch diese Beobachtung autorisiert.

## 11. Gate-Status

Der Providervertrag und seine Feld-, Digest-, Capability-, Claim- und
Securitygrenzen waren vor diesem Delta auf G0-Designebene unabhängig reviewt.
A3, A4 und A5 haben Discovery-Delta und Korrekturdesign mit PASS bewertet. Das
v10-Delta begrenzte den Produktclaim auf prospektive `provider_observed`-
Erfassung, konsolidiert öffentliche und neue Supportevidenz zu `View Order
Details` und aktueller Reverse-Chronology, macht lokale Valuation für MEXC
unsupported und
reserviert Excel als separat gegatete File-Capability. Es behebt die v9-
Reviewfindings zu immutable Buckets, getrennten Statusachsen, lane-spezifischer
Health, Activation-Recheck, File-Quarantäne und fail-closed Authority. A4
bestand v10; A3 fand noch drei P1. v11 band Stabilitätsidentität und Lane Keys,
ließ aber Health-Aggregation, eventbezogenen Authority-Grain, kanonische
Currency-Authority und Funding-Expectation unvollständig. v12 ergänzt
`derive_capture_health_v1`, `EVENT_CONTRACT_AUTHORITY`,
`FUNDING_SETTLEMENT_EXPECTATION_EVIDENCE` und Currency-Authority auf der
Financial Component; A3, A4 und A5 bewerteten v12 mit PASS. v13 konsolidierte
deren P2 zu immutable Activation-Series/Generationszeilen, Constraint-/
Invalidierungstraceability und korrigierter Stability-Fixture-Semantik; A3 und
A5 bewerteten v13 ohne Restbefund, A4 mit PASS und zwei P2. v14 ergänzt den
exklusiven Series-Current-Pointer, atomare Vorgänger-Deaktivierung, Generation-
Revalidation und Parallelwechsel-Fixture 70. A3 und A4 bewerteten das v14-
Delta mit PASS; A4 meldete 0 P1/P2, A3 nur einen anschließend mechanisch
korrigierten Dossierstatus-P2. A6 bestätigte Produkt-, Claim- und Approval-
Wirkung mit PASS. Der Providervertrag ist damit auf G0-Designebene angenommen.
Der
Fixture-/Testvertrag ist
Teil von G0; Erstellung und Ausführung der Fixtures gehören G1–G3 und sind
nicht selbst Voraussetzung für `design_status = reviewed`.
Aktueller Status:

```text
v16 DESIGN_ACCEPTED – G1 required-grain/reconciliation remediation incorporated; G0 bleibt DESIGN ONLY
```

Kein Teil dieses Dokuments autorisiert einen Live-MEXC-Aufruf oder eine
Änderung am vorhandenen Connector.

## 12. Lokaler G1-Requestvertrag nach Aktivierungs-Authority-Delta

Der MEXC-Transport bleibt vollständig GET-only. Für einen Capture-gebundenen
privaten Request gilt zusätzlich folgende lineare Kette:

```text
Work Unit + Run + Current Series/Activation + aktuelle Policy/Lane
  -> vollständige Authority-Lockkette
  -> mit frischem clock_timestamp() serverseitig neu abgeleitete Health
  -> Connection/Credential/Provider/Scope-Revalidierung
  -> fünf Sekunden gültiger Single-use-Permit
  -> öffentlicher Serverzeit-GET und strikte Providerzeitvalidierung
  -> Permitfrist vor Credentialzugriff erneut prüfen
  -> exakte Credentialgeneration laden
  -> privater GET
  -> Page oder sanitisiertes Failure über denselben Permit-Fence
```

Der Permit bindet Work Unit, Run, Scope, Requestsequenz, Checkpoint-MAC,
Series-Version, Authority-Epoch, Activation-Version, Requirement, Lane,
Policygeneration, Authority-Digest, Capability sowie Credential-ID und
-Keyversion. Health, Fälligkeit und Permit-Zeitgrenzen werden erst nach der
vollständigen Lockkette mit einem neu gelesenen `clock_timestamp()` bewertet;
eine während des Lock-Wartens überfällige Pflichtlane blockiert den Request.
Eine vor der Permit-Erteilung committete Pause, Revocation,
Supersession, Credentialrotation oder Providersperre führt zu null
Credentialzugriff und null Broker-GET einschließlich Serverzeit. Eine danach
gewinnende Transition
kann den bereits an den Transport übergebenen GET nicht zurückholen; sie
blockiert aber dessen erste persistente Page-/Failure-Wirkung. Läuft der Permit
während des autorisierten Serverzeit-GET ab, bleibt genau dieser öffentliche
in-flight GET beobachtbar; unmittelbar danach scheitert der Transport vor
Credentialload und privatem GET.

Ein erfolgreicher v2-Page-Commit persistiert atomar mit Raw Events,
Checkpoint, Countern und Request Result ein append-once Receipt auf der
Request-Freigabe. Der Receipt-Digest bindet alle Page-Eingaben. Exaktes Replay
liefert auch nach einer späteren Pause oder Supersession nur das bereits
gespeicherte Resultat; abweichender Replay-Input scheitert fail-closed und kann
weder einen zweiten Commit noch einen Brokerrequest autorisieren.
Ein paralleler exakter Replay, der zunächst auf den Work-Unit-Lock des
Erstschreibers wartet, liest das inzwischen committete Receipt unmittelbar
nach dieser Wartezeit und vor allen veränderlichen Parent-/Lifecycle-/Scope-
Fences erneut. Dadurch bleibt das Receipt auch für terminal schließende Pages
autoritativer Replaybeleg, ohne einen neuen Request zu erlauben.

Für aktuelle, vollständig authority-gebundene Aktivierungen ist nur Resume aus
`paused` mit unveränderten Pins in-place zulässig. Legacy-/ungebundene aktuelle
Zeilen dürfen nicht in-place pausiert, resumed oder revoked werden; nur eine
explizite `activate`-Supersession erzeugt die neue gebundene ID/Generation und
setzt den ungebundenen Vorgänger historisch `inactive`.

Die SQL-Grenze gewährt dem Funktionsowner je Tabelle nur die exakt erforderlichen
`SELECT`-/`INSERT`-/`UPDATE`-Rechte und kein `DELETE`; Browserrollen besitzen
kein direktes DML. Vorhandene zusätzliche Grants einschließlich
projektspezifischer Default-Privilege-Drift werden für alle tatsächlichen
Grantees entfernt. Der Postflight vergleicht über `aclexplode` die vollständige
Function- und Authoritytabellen-ACL gegen die geschlossene Allowlist; dies
schließt die intern delegierten v1-Claim-/Page-/Failure-Kern-RPCs ein.
Bestehender Authoritytabellen-Ownerdrift wird vor jeder Tabellen-DDL
fail-closed abgewiesen; gesunde Fresh-/Re-Run-Pfade pinnen die drei Tabellen
vor der ACL-Normalisierung auf `postgres` und verifizieren ihren Owner separat.
Die drei v1-Kern-RPCs sind separat auf `owner=postgres`, `SECURITY DEFINER`,
`search_path=''` und 10/15/10 Sekunden gepinnt. Ein Capture-Control-Re-Run nach
Activation Authority erkennt den Downstream-Marker und darf v1 Claim/Failure
nicht erneut für `service_role` freigeben; nur der `NOLOGIN`-Funktionsowner
behält den internen Aufrufpfad.
Exakte
`regprocedure`-Signaturen, Function-Eigentümer, `SECURITY DEFINER`,
`search_path=''` sowie Lock-/Statement-Timeouts bleiben weitere Invarianten.
Claim-Receipt und letzter Work-Unit-Fehler sind durch auf jedem Re-Run neu
erzeugte, boolean-totale und semantisch fingerprinted CHECKs strikt all-null
oder vollständig belegt. Der Outcome-Terminalgrund ist ebenfalls boolean-total:
bei `retry_pending` zwingend `NULL`, bei `partial_failed|terminal_failed`
zwingend ein erlaubter nichtleerer Reasoncode.

Der lokale Transporttest belegt die Reihenfolge Permit -> Providerzeit ->
Credentialloader -> privater GET sowie null Fetch bei fehlenden, abgelaufenen
oder scopefalschen Permits und die Blockade credentialfalscher Permits. Ein
zeitfortschreitender TOCTOU-Test lässt den Permit während des bereits
autorisierten Serverzeit-GET ablaufen und belegt danach null Credentialload und
null privaten GET. Es wurde kein MEXC-Request ausgeführt. Das Delta ist
providerneutral angelegt; jeder weitere Broker benötigt trotzdem einen eigenen
Capability-, Permission-, Paging-, Retention- und Fixturevertrag.

## 13. G1-Schedulerplan- und Bucketvertrag

Dieses Kapitel präzisiert ausschließlich die lokale Planerzeugung. Der Adapter
bleibt GET-only und deaktiviert; kein Scheduler ruft ihn automatisch auf.

### 13.1 MEXC-Requestprofile

| Lane | Requestfenster | Bucketraster | Fälligkeitsintervall |
|---|---|---|---|
| `incremental_fast_6h` | ab serverseitiger Watermark mit mindestens 72 Stunden Overlap; höchstens Providerprofilgrenze | alle vollständig geschlossenen UTC-Tage des Fensters, mindestens ein Bucket | 6 Stunden |
| `rolling_audit_7d_daily` | exakt sieben vollständige UTC-Tage, Ende an aktueller UTC-Mitternacht | exakt 7 lückenlose Tagesbuckets | 24 Stunden |
| `rolling_audit_28d_weekly` | exakt 28 vollständige UTC-Tage, Ende an aktueller UTC-Mitternacht | exakt 28 lückenlose Tagesbuckets | 7 Tage |

Das Requestfenster gehört zum Request-Scope-Header. Ein MEXC-GET wird pro
Scope genau einmal paginiert. Die Tagesbuckets sind Childgrains für
Stabilitätsvergleich und Vollständigkeitsaggregation; sie sind keine
zusätzlichen Brokerrequests. Bucketgrenzen oder Bucketanzahl dürfen weder vom
Caller geliefert noch aus Responseitems erraten werden.

Der Providerplaner erzeugt die Childrows unter dem providerneutralen
`broker-request-bucket-set-v1`-Vertrag. Für jeden Bucket wird die bestehende
`stability_bucket_identity`-Domain verwendet. Anschließend wird der Set-Digest
aus Anzahl und geordneter vollständiger Liste
der Bucketdigests gebildet. Fehlende, doppelte, nicht UTC-ausgerichtete,
überlappende oder vertauschte Buckets invalidieren den gesamten Scope. Der
laufende UTC-Tag ist nie Teil eines geschlossenen Auditrasters.

### 13.2 Lane-Ausführungs-Predicate

Eine überfällige Lane degradiert Health, muss aber ihre eigene Read-Evidenz
weiter sammeln können. Deshalb wird nicht pauschal auf einen gespeicherten oder
aggregierten `healthy`-Wert autorisiert. Der gemeinsame serverseitige
`lane_execution_allowed_v1`-Predicate verlangt:

- Current Series/Activation und `activation_state=active`;
- exakt aktuelle Requirement-/Lane-/Policy-/Authority-Bindung;
- `source_channel=provider_api_observation` und eine explizit erlaubte
  Read-Capability;
- `next_due_at <=` frisch nach allen Locks gelesenem `clock_timestamp()`;
- Ziel-Lane `not_observed`, due oder API-recoverable `degraded`;
- keine Permission-/Credential-/Provider-Suspension, keine Exportpflicht,
  keine invalidierte Reconciliation und keinen terminalen Lifecyclezustand.

Andere problematische Lanes verhindern weiterhin Candidate, Approval und
Import, blockieren aber nicht automatisch den kontrollierten Read-Abruf, der
genau diese Evidenzlage reparieren soll. `scheduler`, `startup_catchup` und
`recovery` dürfen nur den jeweils gebundenen Fälligkeitsslot bearbeiten.

### 13.3 Lease- und Restart-Grenze

Der erste konservative MEXC-Synckind ist `provider_api_observation`: Auf einem
Brokerkonto kann über alle MEXC-Read-Capabilities hinweg höchstens eine Work
Unit aktiv geleast sein. Das vermeidet unbelegte Parallelität und
Rate-Limitannahmen. Das Lease bleibt zusätzlich exact-scoped an Work Unit,
Run, Scope, Activation, Requirement, Lane, Policy, Row-Version und Lease-Epoch
gebunden. `lease-control-v1` verwendet 45 Sekunden Initiallease, höchstens drei
Renewals und 180 Sekunden absoluten Maximalhorizont.

Ein Request-Permit bleibt der Egress-Linearisation Point. Nach einem Crash gilt:

- abgelaufenes Lease ohne Permit dieser Epoch: sicher in `pending` requeuebar;
- Permit mit persistiertem Page-Receipt beziehungsweise Failure-Outcome:
  Zustand aus der dauerhaften Evidenz ableiten und exakt replayen;
- Permit ohne Outcome: `uncertain_egress`, keine blinde Wiederholung;
- `yielded/work_unit_budget_reached`: genau eine idempotente Successor-Work-
  Unit innerhalb desselben Runs und Request-Scopes mit nächster Sequenz;
- `yielded/scope_budget_reached`: kein Successor, Scope bleibt partial.

Das Providerprofil `mexc-page-budget-v1` bindet den Request-Scope auf maximal
20 Work Units und 100 Pages. Work-Unit-Sequenz 19 darf Sequenz 20 erzeugen;
Sequenz 20 ist die letzte zulässige Work Unit und kann nur in das replaybare
Ergebnis `scope_exhausted` ohne weiteren Brokerrequest oder Successor übergehen.

Diese Regeln ändern nicht die GET-Allowlist und fügen keine Brokeroperation
hinzu. Automatische Runtimeansteuerung, Credentialentschlüsselung und reale
MEXC-Requests bleiben eigene gesperrte G1-Blöcke.

## 14. Deployment-Runtime-Vertrag

Der Deploymentadapter ändert die Provider-Allowlist nicht. Für jedes gewählte
Symbol prüft der explizite `probe` genau sechs Requests: Orders, Executions,
Positionen Long/Short und Funding Long/Short. Jeder Request nutzt `GET`, eine
24-Stunden-Probewindow und höchstens zehn Ergebnisse; Payloads werden im Probe
nicht persistiert. Ein Teilfehler verhindert das gesamte Setup.

Der produktive `capture` lädt verschlüsselte Credentials ausschließlich nach
einem DB-seitigen single-use Request-Permit. Die Transportreihenfolge bleibt:

```text
Permit -> MEXC Server-Time GET -> Permit-Frist erneut prüfen
       -> authority-gebundener Materialload -> Private GET -> Page-Commit
```

Der Credentialloader revalidiert Connectionstatus, exakte Read-only-
Permissionmenge, Current Activation/Generation, Series-Version/Epoch,
Activation-Version, Credentialgeneration, Integrity-Key und Sendefrist. Ein
Claim oder Lease allein ist keine Egress-Autorität.

Ein Vercel-Aufruf verarbeitet höchstens drei Pages innerhalb des 300-Sekunden-
Plattformlimits. Nach 240 Sekunden beginnt die Runtime keine neue Page und nach
210 Sekunden keinen neuen Broker-Egress. Bereits autorisierte Persistenz,
Finalisierung und Lease-Bereinigung dürfen innerhalb des verbleibenden
300-Sekunden-Plattformbudgets kontrolliert abschließen; 240 Sekunden sind keine
harte End-to-End-Abbruchgarantie. Der nächste Lauf verarbeitet zuerst abgelaufene Leases und bereits
terminal persistierte, aber noch nicht finalisierte Scopes. Dieser Recoverypfad
ruft MEXC nicht erneut auf.

`off` ist der Default. `probe` erlaubt keine automatische Capture-Ansteuerung;
`capture` erlaubt keinen Journalimport. Der API-Responsevertrag von Setup,
Finalisierung und Widerruf behauptet ausdrücklich weder Trading- noch
Importautorität.

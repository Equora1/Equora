# Equora v57.61.0 – G1 Implementation Status

Stand: 2026-08-08
Branch: `feature/mexc-import-v57.61.0`
Baseline-Commit vor diesem uncommitteten Delta: `81dc159cc8999fddf61cc32e35921bc7abe94430`
Gate: `G1 IN PROGRESS – NO-GO`

## 1. Scope dieses Deltas

Dieses Delta implementiert den fail-closed G1-Sicherheitsblock für den
MEXC-Read-only-Connector, einen nichtdestruktiven Statistikscope für
Strategietests und ein lokal broker-erweiterbares Persistenzdatenmodell mit
derzeit MEXC-v1-spezifischem Commit-Adapter. Der Persistenzkern ist ein noch
nicht freigegebener Migrations- und RPC-Entwurf;
er wurde ausschließlich gegen eine isolierte lokale PostgreSQL-/Supabase-
Testinstanz ausgeführt.

Das aktuelle uncommittete Teildelta ergänzt darauf einen lokalen, weiterhin
deaktivierten Capture-Control-Plane für atomare Work-Unit-Claims sowie
persistente, sanitiserte Failure-/Retry-/Terminal-Outcomes. Ein weiteres
  additives Teildelta ergänzt die persistente Lane-/Gap-Autoritätsgrundlage,
  versionierte High-Watermark-Felder und eine rein lesende, deterministische
  `derive_capture_health_v1`-Ableitung. Das aktuelle Teildelta ergänzt außerdem
  eine lokal testbare, inaktive Scheduler-/Lease-Control-Plane. Es aktiviert
  weder Timer/Worker noch Credentialloader, Brokerzugriff oder Journalimport.

Nicht autorisiert und nicht ausgeführt wurden:

- MEXC-Live-Requests oder erneute Credentialverwendung;
- automatischer Journalimport;
- Änderungen an einem verbundenen Supabase-Projekt oder an Journaldaten;
- Produktions-SQL oder produktive Migrationen;
- Order-, Cancel-, Close-, Reverse-, Transfer- oder Withdrawal-Fähigkeiten;
- Git-Staging, Commit, Push, Deployment oder Produktionsaktivierung.

## 2. Read-only-Transport – implementierter Zwischenstand

`lib/server/mexc-transport.ts` ist der zentrale Broker-Egress-Chokepoint. Der
aktuelle Vertrag besitzt exakt sechs Read-Capabilities:

1. `server_time_v1`;
2. `contract_metadata_v1`;
3. `historical_orders_v1`;
4. `historical_executions_v3`;
5. `historical_positions_v1`;
6. `funding_records_v1`.

Umgesetzt sind:

- konstanter Origin `https://api.mexc.com`;
- ausschließlich Methode `GET`;
- explizite `server-only`-Grenze;
- keine freie URL, kein freier Pfad und kein generisches `RequestInit` im
  Adapterinterface;
- keine injizierbare Fetch-Implementierung, Uhr oder Deadline im
  Produktionsinterface;
- aktueller Executionpfad `/api/v1/private/order/list/order_deals/v3` ohne
  Legacy-Fallback;
- capabilitybezogen geschlossene Querykeys, Pflichtfelder und Pagegrenzen;
- validiertes Symbolformat und geschlossenes Zeitfenster bis maximal 31 Tage;
- ASCII-deterministische Querysortierung und HMAC-SHA256-Golden-Vektor;
- `redirect: 'error'` plus explizite 3xx-, `redirected`-, Redirectfehler- und
  Final-URL-Abweichungsprüfung;
- 12-Sekunden-Deadline bis einschließlich begrenztem Bodylesen;
- `Accept-Encoding: identity`, fail-closed Ablehnung komprimierter Antworten,
  64-KiB-Entitylimit sowie frühe `Content-Length`-Prüfung und Byteabgleich;
- eigener begrenzter, lossless JSON-Parser: numerische Providerlexeme werden
  ohne IEEE-754-Konvertierung erhalten; Duplicate Keys, ungültige Unicode-
  Surrogate, nicht standardkonforme Zahlen, zu tiefe beziehungsweise zu große
  Strukturen und überlange Zahllexeme werden fail-closed abgelehnt; interne
  Zahlentokens besitzen eine nicht durch Provider-JSON erzeugbare Symbolmarke;
- strikter JSON-/Envelopevertrag `success=true`, numerischer Integer-
  Token `code=0`, nicht-null `data`;
- strikte Unix-ms-Providerzeit mit 60-Sekunden-Skewfenster, ohne Zeitfallback
  und ohne aufruferseitig lieferbare private Requestzeit;
- private Work Units validieren sämtliche Queries vor Serverzeitabruf und
  Credentialloader; Capture-gebundene Work Units prüfen sämtliche Single-use-
  Permits vor jedem Broker-Fetch einschließlich Serverzeit. Die private
  Signaturzeit stammt ausschließlich aus dem anschließend validierten
  Providerzeitpfad;
- capabilitybezogene Work-Unit-Outcomes erhalten Teilfehler explizit; eine
  fehlgeschlagene Capability wird niemals durch eine erfolgreiche leere
  Antwort ersetzt;
- geschlossene Feld-, Typ-, Enum-, Symbol-, Scope-, Position-Type-, Paging-
  und Orderingoracles für Contract Metadata, Orders, Executions, Historical
  Positions und Funding Records;
- unbekannte Runtime-Capabilities und capabilityfremde Scopefelder werden
  explizit blockiert; Metadata-, History- sowie Position/Funding-Scopes sind
  getrennte exakte Verträge;
- unbekannte Zusatzfelder bleiben im unveränderten Payload erhalten, werden
  aber fachlich nicht interpretiert;
- malformed/mixed Pageelemente und die für Orders/Executions unbestätigte
  Pageobjektform führen sichtbar zum Fehler, niemals zu `[]`;
- nichtleere Historical-Position-Items bleiben trotz erfolgreichem Parser
  wegen fehlender Providerbeobachtung `blocked_unobserved_position_items`;
  Funding bleibt trotz beobachteter Page-/Itemform wegen ungeklärter Authority
  `blocked_funding_authority`;
- Provider-ID-Pflicht für Orders und Executions; keine synthetische
  Symbol-/Zeit-ID;
- domain-separierter `equora-tcj-v1`-Raw-Body-Digest mit vollständigen
  Digestmetadaten und Bytecount im nur lokalen Readresult;
- vollständige kanonische Providerfehlerklassen samt expliziter Retrypolicy;
- rekursiver AST-/Importgraph-Contracttest über alle Produktquellen unter
  `app`, `lib` und `components`: MEXC-Origin ausschließlich im zentralen
  Transport; direkte oder transitive Broker-Netzwerkprimitive werden auch in
  verschachtelten neutral benannten Modulen blockiert.

### 2.1 Synthetisch validierter Pagination-/Checkpointkern

`lib/server/mexc-pagination.ts` ergänzt einen reinen, serverseitigen
State-Machine-Kern ohne Fetch-, Credential-, Datenbank- oder Uhrinjektion in
seine Produktionsschnittstellen. Umgesetzt und durch synthetische Fixtures
belegt sind:

- capabilitygenaue, exakte Orders-, Executions-, Positions- und Fundingscopes;
- ein vorläufiges, vollständig digestgebundenes Page-/Event-/Byte-/Zeit-/
  Retry-/Work-Unit-Budgetprofil;
- vollständige Budgetprofil- und Startpagebindung an den Scope;
- HMAC-SHA-256-authentifizierte Checkpoints mit erforderlichem 32- bis
  64-Byte-Integritätsschlüssel, exakten Feldern sowie Status-, Reason-,
  Counter-, Cursor-, Fingerprint- und Terminalevidenzinvarianten;
- timing-sichere MAC-Prüfung, erwarteter-MAC-Precondition und deterministischer
  JSON-Restart derselben Work Unit;
- atomare Pageübergänge: eine nicht mehr in das Restbudget passende Response
  wird nicht als erfolgreiche Page verbucht;
- Blockade von wiederholtem Cursor trotz verändertem Body, identischem
  Pagefingerprint, Rückschritt in neuere Providerzeit und Pagefortsetzung über
  `10_000` hinaus;
- volle Nutzung der letzten erlaubten Work Unit statt vorzeitigem Abbruch;
- maximal zwei gepinnte bounded-backoff Retries mit serverseitigem
  `retryNotBeforeMs`; vorzeitiges Resume wird blockiert;
- Providerfehler-Entitybytes zählen ebenso wie erfolgreiche Pagebytes gegen
  Unit- und Scopebudgets; Timeouts müssen explizit null Bytes melden;
- `maintenance`, nicht retrybare Fehler und ausgeschöpftes Retrybudget enden
  `partial_failed/stop_blocked` und werden nicht automatisch in eine neue Work
  Unit übertragen;
- Terminalsignale bleiben `scopeCompleteness=unverified`; Fehler, Limits und
  Loops bleiben `partial`;
- Pagecheckpoints besitzen permanent `authorityBlocked=true`; weder leere noch
  nichtleere Pages können Import-, Funding- oder Finanzautorität erteilen;
- der fortlaufende ID-Digest ist ausdrücklich eine geordnete
  Provider-Identitätssequenz, kein dedupliziertes Eventset und kein
  Vollständigkeitsbeweis.

Der neue reine Capture-Orchestrator verdrahtet eine modul-authentische,
request- und capturezweckgebundene Transportantwort inzwischen in-memory mit
Oracle, Pagination und Raw Ledger.
Die ownergebundene atomare Checkpointpersistenz und eine aktivierungsgebundene
HMAC-Key-Referenz sind im lokalen Persistenzdelta umgesetzt. Noch nicht
umgesetzt sind die automatische Runtimeansteuerung unter einer gültigen
Aktivierung, produktive Key-Erzeugung/-Verteilung/-Rotation, reale Provider-
Paginationsevidenz und Produktionskalibrierung des Budgetprofils. Der Kern
bleibt lokale State-Machine-Evidenz, kein Runtime-GO.

### 2.2 Kanonische Digests und transienter Raw-Observation-Ledger

`lib/server/equora-tcj.ts` implementiert einen ausführbaren G1-Subset der für
G0 normierten `equora-tcj-v1`-Typkodierung und einen geschlossenen
Domain-/Metadaten-Envelope für die sechs aktuell benötigten Domainbezeichner
`raw_response_body`, `raw_event_content`, `stability_bucket_identity`,
`sync_scope`, `page_observation` und `raw_event_observation`. Umgesetzt sind:

- bytegenaue Typ-Tags, NFC-Normalisierung, normative Control-Character-
  Escapes und unsigned UTF-8-Keysortierung;
- exakte Basis-10-Kanonisierung ohne IEEE-754, einschließlich Exponenten und
  numerischem Nullfall;
- kanonisch sortierte Sets mit Duplicate-Rejection;
- exakt 64 Containerlevel, Node- und kanonisches 8-MiB-Bytebudget auch nach
  Stringescaping;
- Domain Separation nach dem normativen `equora-digest`-Präfix; der Transport
  stellt den Raw Body nicht mehr als unversionierten Plain-SHA-String, sondern
  als vollständigen `raw_response_body`-Digest mit Algorithmus, Vertrag und
  Domain bereit;
- lossless Providerzahlen, 64-KiB-Parserinputgrenze sowie modulprivate
  WeakMap-/WeakSet-Provenienz für Parsercontainer, Zahlentokens und TCJ-Werte;
  kopierte oder reflektierte Symbolmarken erteilen keine Provenienz;
- gepinnte und unabhängig gegengeprüfte SHA-256-Golden-Vektoren.

Nicht als vollständig implementiert gelten die produktiven HMAC-Purpose-/
Keyring-Lifecyclepfade sowie die Golden-Vektoren der späteren Normalisierungs-,
Candidate-, Approval- und Importdomains. Für den aktuellen Capture-Subset sind
Postgres-Parität und gemeinsame TypeScript-/SQL-Goldenvektoren lokal belegt.
Die verbleibenden Domains bleiben ihren Folgegates zugeordnet.

`lib/server/mexc-sync-scope.ts` implementiert das in der ERD normierte
MEXC-v1-Inhaltsschema für `stability_bucket_identity` und `sync_scope`:

- vollständige Bindung von Provider, unverified Account-HMAC-Referenz,
  Brokerkonto, Aktivierungs-ID/-Generation, Capability, typisiertem Instrument,
  Provider-/Adapter-/Profilversionen, Boundary-Policy und unveränderlichem
  geschlossenem UTC-Tagesbucket;
- getrennte domain-separierte Digests für Bucketidentität und Sync Scope;
- der `sync_scope`-Identitätsdigest bindet ausschließlich die unveränderlichen
  ERD-Felder: vollständige Bucketidentität, Source Channel, API-Lane,
  Abruffenster, Boundarysemantik, Overlap-Policy und Scopegeneration;
- Stabilitätsgeneration, Coverage, Completeness, Stability und Authority bleiben
  außerhalb dieses Identitätsdigests und können denselben Scope nicht umkeyen;
- `incremental_fast_6h` verlangt konservativ mindestens 72 Stunden
  Requestspanne. Dies beweist noch keinen Overlap relativ zu einer persistierten
  High-Watermark;
- 7-/28-Tage-Auditlanes verlangen für den einzelnen Request exakt sieben
  beziehungsweise 28 vollständig ausgerichtete UTC-Tage. Schedulerfälligkeit,
  High-Watermark und das vollständige Multi-Bucket-Raster sind noch nicht
  implementiert;
- ausschließlich `unverified`/`partial` und `not_observed`/`invalidated`;
  positive Vollständigkeit oder Stabilität ist in diesem G1-Subset unmöglich;
- keine Lease-, Worker-, Ergebnisstatus- oder veränderliche Healthinformation
  im Digest.

`lib/server/broker-raw-ledger.ts` ergänzt einen reinen, unveränderlichen
Raw-Event-/Page-Observation-/Event-Observation-Kern ohne Fetch, Credential,
Datenbank oder Journalzugriff. Er belegt synthetisch:

- accountgescopte Eventmembership über eine synthetische, digestförmige und
  ausdrücklich `unverified_reference` markierte
  `broker_account_identity_v1`-Referenz; eine echte HMAC-Erzeugung oder
  -Verifikation ist noch nicht belegt;
- unveränderliche Pageübergänge mit einer lokalen `ledgerGeneration`-
  Precondition; innerhalb einer authentischen fortgeführten State-Kette wird
  jede Request-Result-Referenz nur einmal akzeptiert. Dies ist kein atomarer
  persistenter CAS- oder globaler Exactly-once-Nachweis;
- Wiederbeobachtung derselben stabilen Provider-ID über Pagegrenzen ohne zweite
  Raw-Event-Zeile;
- neue Fallbackrevision bei gleicher Provider-ID und verändertem Raw Content,
  solange keine belegte Providerrevisionssemantik existiert;
- dauerhafte Retention von `blocked_identity` statt synthetischer IDs;
- getrennte Sync-Scope-, Raw-Body-, Raw-Content-, Page- und Event-Observation-
  Digests mit vollständigen Digestmetadaten; Eventobservations binden
  zusätzlich typisierte opake Run-/Request-Result-Referenzen, Page, Event,
  Index und First-/Repeated-Status;
- capabilitykohärente Provider-Page-/Terminalevidenz: Funding bindet
  `currentPage`, `pageSize`, `totalCount` und `totalPage`; Bare Arrays dürfen
  keine Provider-Page-Metadaten behaupten;
- private State-Provenienz statt kopierbarer Symbolauthority sowie begrenzte
  transiente Scopes von höchstens 100 Pages, 100.000 Raw Events und 100.000
  Eventobservations; Pagepayloads besitzen zusätzlich ein kanonisches
  Arbeitsbudget;
- ausschließlich `provider_api_observation`, permanent `authorityBlocked=true` und nur
  `unverified`/`partial`, auch bei leerer terminaler Page;
- ein geschlossenes MEXC-v1-Capture-Profil. Source Channel, Source-Profil-ID/-
  Version, Providervertrag, Adapterversion sowie die Capability-zu-Endpoint-
  Zuordnung sind gepinnt. Für MEXC ist außerdem
  `providerRevisionAuthority=unverified_only`; ein Adapter darf keine stabile
  Revisionsauthority selbst behaupten. Der aktuelle Code ist trotz generischer
  Raw-Recordnamen MEXC-v1-spezifisch: Payloadvertrag, Capability-/Scopeformen,
  Symbolsyntax, Zeitfenster und Limits stammen aus dem MEXC-Adapter. Ein
  weiterer Broker benötigt deshalb nicht nur einen Registryeintrag, sondern
  einen neuen lossless Adapter-/Scope-/Limitvertrag, Fixtures und ein eigenes
  Gate.

`lib/server/mexc-capture-orchestrator.ts` schließt den bisher getrennten
In-Memory-Datenfluss für den aktuellen Prozess ohne eigenen Fetch-, Credential-,
Datenbank- oder Journalzugriff:

1. Der Transport erzeugt kanonischen Prepared Request, `data`, Raw-Body-Digest,
   Bytecount, HTTP-Status, lokale Request-/Responsezeit und gemessene
   Requestdauer gemeinsam in einer eingefrorenen Wire Response mit modulprivater
   WeakSet-Provenienz.
2. Der Orchestrator akzeptiert ausschließlich diese authentische Wire Response;
   Spread-/Reflection-Kopien werden vor Oracle und Stateübergängen blockiert.
3. Für Capture muss derselbe serverseitige Credentialloader Account-HMAC-
   Referenz, Brokerkonto, Aktivierung und Generation gemeinsam mit den
   Credentials liefern. Diese deklarierte Loaderbindung muss zur eingefrorenen
   Capture-Bindung passen; ein ungebundener Preview-Response ist nicht
   capturefähig.
4. Der normative Sync Scope wird neu kanonisiert. Capability, exakter
   Prepared-Request-Vertrag, Symbol, Position-Type, Zeitfenster, Page, Pagegröße,
   Scope-Digest, Run, Request-Result und Sequenz müssen zu Capture-Bindung und
   HMAC-authentifiziertem Paginationcheckpoint passen.
5. Jede authentische Capture-Response ist im aktuellen Prozess höchstens einmal
   konsumierbar. Das ist kein prozessübergreifendes oder persistentes
   Exactly-once.
6. Oracle Records, Provider-IDs/-Zeiten, Page Observation und Raw Events werden
   aus demselben lossless Transportobjekt abgeleitet.
   Die Observationzeit stammt aus der serverseitigen Transportmetadatenquelle,
   nicht aus einem frei übergebenen Orchestratorfeld.
7. Pagination und Raw Ledger werden als unveränderliche Übergänge berechnet.
   Lehnt Pagination die Page vor Commit ab, bleibt der Raw Ledger unverändert;
   schlägt der Ledger fehl, werden keine mutierten Eingangszustände exponiert.

Damit ist die deklarierte Credentialkontext→Prepared-Request→Body-Digest→Parse→
Oracle→Page→Raw-Event-Herkunftsrelation für den unmittelbaren In-Process-Pfad
synthetisch und mit lokaler Single-use-Semantik belegt. Das nachfolgende
Persistenzdelta ergänzt dafür eine ownergebundene atomare DB-Grenze. Weiterhin
nicht implementiert sind Retention/Erasure, echte Account-HMAC-Erzeugung und
Key-Lifecycle, der persistente Runtime-Loader sowie die produktive Aktivierungs-
und Claimorchestrierung. Daraus entsteht weder Runtime- noch Import-GO.

### 2.3 Broker-erweiterbares Persistenzmodell mit MEXC-v1-Commit-Adapter

`supabase/schema-patch-v57.61.0.sql` ist eine additive, noch nicht produktiv
ausgeführte Migration. Sie erhält die bestehenden Broker-Tabellen und ergänzt
broker-erweiterbare, tenantgebundene Tabellen für Brokerkonten, Identitäten,
Connection-Account-Zuordnung, Aktivierungsserien und -generationen, Sync Scopes,
Capture Runs, Work Units, Request Results, vollständige Raw Responses, Raw
Events und Page-/Event-Observations. Die Tabellen sind für spätere Broker
erweiterbar; die aktuelle RPC, Bodyform, Capabilityfelder, Queryrekonstruktion
und TCJ-Ableitung sind bewusst MEXC-v1-spezifisch und dürfen nicht als
generischer Brokeradapter wiederverwendet werden.

Der zugehörige Commitpfad ist absichtlich eng begrenzt:

- `equora_commit_broker_capture_page_v1` ist eine serverseitige
  `security definer`-RPC mit festem `search_path`; nur `service_role` erhält
  `EXECUTE`, `anon` und `authenticated` nicht;
- die RPC akzeptiert keine aufruferseitige User-ID, sondern leitet Tenant,
  Brokerkonto, Aktivierung, Scope, Lane und Run aus der gesperrten Work Unit ab;
  erwartete WorkUnit-, Run-, Brokerkonto-, Connection-Account-, Aktivierungs-
  und Scopewerte werden nochmals exakt gegengeprüft;
- Lease Tokens liegen nur domain-separiert SHA-256-gehasht vor. Lease,
  Work-Unit-Row-Version, erwartete Checkpoint-MAC, Account-Ledger-Generation,
  Accountidentität und aktuelle Aktivierungsgeneration werden in derselben
  Transaktion und in einer festen Lockreihenfolge revalidiert;
- Connection-Account, zugrunde liegende Connection, exakt gepinnte
  Credentialgeneration, Read-only-Permissions, private Capture-
  Integritätsschlüsselgeneration und Providerstatus werden unmittelbar im
  Commitpfad erneut gelesen und unter Rowlocks geprüft; fremde, pausierte,
  widerrufene, abgelaufene oder nicht aktuelle Zustände brechen fail-closed ab;
- ein privater, für `service_role` weder lesbarer noch direkt nutzbarer
  32- bis 64-Byte-HMAC-Schlüssel authentifiziert den vollständigen
  Request-/Transportzeit-/Raw-Body-/Page-/Event-/Checkpoint-Übergang. Die RPC
  rekonstruiert denselben kanonischen TCJ-Envelope und beide Checkpoint-MACs
  serverseitig; ein direkter `service_role`-Aufruf kann damit die vorgelagerte
  Oracleprüfung nicht durch selbst konsistente Ersatzdaten umgehen;
- ausschließlich der registrierte GET-only-Providerpfad ist zulässig; POST und
  insbesondere Ordererstellung werden vor allen Schreibwirkungen blockiert;
- der vollständige begrenzte Responsebody wird als `bytea` gespeichert und
  gegen kanonisches Base64, Bytecount und den domain-separierten Raw-Body-
  Digest geprüft; Query, Envelope, Bodyevents, Page-Metadaten, Raw-Event-,
  Page- und Observation-Digests werden serverseitig aus persistiertem Scope
  und denselben Raw Bytes rekonstruiert;
- Request Result, Raw Response, Raw Events, Observations, Zähler, Folgecheckpoint
  und CAS-Generationen werden atomar geschrieben;
- die RPC besitzt funktionsgebunden `lock_timeout = 2s` und
  `statement_timeout = 15s`, eine kontrollierte 12-Sekunden-Deadline sowie
  fortschreitende `clock_timestamp()`-Prüfungen. Lease und Integritätsschlüssel
  werden nach potenziellen Lock-Wartezeiten und nochmals vor den finalen
  Zustandsupdates frisch validiert; Lock-, Statement- und Deadline-Timeouts
  werden als geschlossene resumable Fehler ohne Teilwirkung abgebildet;
- der freigegebene spätere Datenbankaufruf ist ausschließlich die Supabase Data
  API/PostgREST-RPC. Der lokale PostgREST-v14.15-Test bestätigt sowohl die
  Default-Hoisting-Konfiguration für `statement_timeout` als auch einen echten
  SQLSTATE-`57014`-Abbruch nach 15,03 Sekunden. Ein direkter produktiver
  `SELECT function(...)` ist nicht freigegeben, weil PostgreSQL ein erst in der
  laufenden Funktion gesetztes Statement-Timeout nicht rückwirkend aktiviert;
- zusammengesetzte Tenant-/Account-/Activation-/Lane-Fremdschlüssel,
  Constraints, RLS und explizite Privilegien begrenzen Cross-Tenant- und
  Browserzugriffe; auch `service_role` besitzt kein direktes Tabellen-DML,
  sondern ausschließlich `EXECUTE` auf der geschlossenen RPC;
- der TypeScript-Persistenzadapter akzeptiert nur modul-authentische
  Orchestrator- und Wire-Resultate und prüft das DB-Ergebnis exakt gegen den
  berechneten Übergang.
- ein privater Migrationsmarker lehnt bereits teilweise vorhandene, nicht als
  dieses Artefakt markierte Capturetabellen ab. Ein Postflight prüft kritische
  FKs, RLS, Ownerindizes und die exakte 39-Parameter-RPC-Signatur; ein
  autorisierter unmittelbarer Re-Run bleibt idempotent.

Die Migration schreibt keine Journal-Trades und enthält weder Normalisierung,
Reconciliation, Approval, Import, Scheduler noch automatische Aktivierung. Sie
wurde nur in einem isolierten lokalen Container ausgeführt, einschließlich
From-Scratch-Anwendung auf der v57.60.1-Baseline, idempotentem Re-Run,
kontrolliertem Drift-Abbruch, transaktionaler SQL-Integrationsfixture,
gezieltem Mid-Commit-Rollback, spätem Scope-Write-Ablauf-über-Lockwait-, Lock-Timeout-,
Zwei-Sitzungs-Ledger-CAS- und Activation-Pause-Race-Test sowie echter lokaler
PostgREST-Timeoutprobe. Das verbundene Supabase-Projekt wurde nicht berührt.

### 2.4 Lokaler Claim- und Failure-Control-Plane

`supabase/schema-patch-v57.61.0-g1-capture-control.sql` ist ein zweites
additives, marker- und fingerprintgebundenes lokales Migrationsartefakt. Es
ergänzt die bestehende Work Unit um Claim-, Retry- und Terminalzustand und
führt `broker_capture_attempt_outcomes` als immutable, sanitiserte
Fehlerhistorie ein. Der aktuelle Vertrag ist bewusst eng:

- `equora_claim_broker_capture_work_unit_v1` ist nur für `service_role`
  ausführbar, besitzt ein fixes 45-Sekunden-Lease, maximal acht Versuche,
  Work-Unit-CAS und idempotente, an die erwartete Vor-Row-Version gebundene
  Claim-Request-ID;
- der Claim prüft die aktuelle Aktivierungsgeneration, Run und Scope,
  Connection/Connection-Account, die opaque Credentialgeneration, einen
  aktiven zeitgültigen privaten Integritätsschlüssel, den GET-only-
  Providervertrag und den aktiven Retentionzustand des Brokerkontos; Cutover,
  Connection-Account-Start und Scopezustand werden nach den letzten
  potenziellen Lock-Wartezeiten erneut geprüft;
- MEXC-Permission-Evidence behauptet keine technische Rechteintrospektion. Sie
  bindet exakt die vier benötigten History-Capabilities, die Support-/
  Dokumentationsgrundlage, eine höchstens 15 Minuten vor Cutover abgegebene
  Read-only-Nutzerattestierung, `writePermissionIntrospection=unavailable` und
  eine leere Liste technisch erkannter Schreibrechte;
- das Claimresultat enthält ausschließlich opaque Credential-/Keyreferenzen,
  niemals API Key, Secret, Ciphertext, Integritätsschlüsselmaterial oder den
  Lease Token. Der immutable Sync-Scope-Digest (`scopeDigest`) und der daraus
  fachlich getrennte MEXC-Page-Checkpoint-Digest (`pageScopeDigest`) besitzen
  eigene Felder. Vor Ausgabe prüft SQL den gespeicherten Checkpoint-HMAC, den
  kanonischen Page-Scope-Digest und die symbol-/zeit-/positionstypgebundene
  verschachtelte Scopeform; der TypeScript-Adapter prüft dieselbe exakte
  typisierte Struktur, Sequenzbindung und rekursiv verbotene Secret-Keynamen
  und friert das gesamte Ergebnis rekursiv ein;
- `equora_record_broker_capture_failure_v1` akzeptiert nur die geschlossenen
  Transportfehlercodes, den erwarteten Checkpoint-MAC und begrenzte
  Transportmetriken. Caller dürfen weder Outcome-Status noch Retryzeitpunkt
  wählen. Automatisch retrybar sind ausschließlich Rate Limit, Provider Busy,
  Provider Unavailable und Timeout mit den Checkpoint-Budgets von einer und
  fünf Sekunden; Maintenance wird terminal als `provider_retry_deferred`
  persistiert;
- der Failure-RPC verifiziert den gespeicherten HMAC, leitet den vollständigen
  Folgecheckpoint serverseitig ab und signiert ihn neu. Der letzte zulässige
  Claim-Attempt persistiert den ursprünglichen Fehler genau einmal und endet
  replaybar mit `claim_attempt_budget_reached`, statt das Outcome zu verlieren;
- Scope `partial` setzt mindestens ein gültiges Request Result desselben Scopes
  voraus; ohne Scope-Evidenz wird `failed`. Ein Run mit verbleibender Work Unit
  oder gültiger Run-Evidenz bleibt als `partial` ohne `completed_at` resumable.
  Scope- und aktuelle Run-Wahrheit werden unabhängig abgeleitet; daher ist bei
  Scope-Evidenz aus einem früheren Run auch `partial_failed` zusammen mit einem
  aktuellen `failed`-Run ein gültiger, vom TypeScript-Adapter akzeptierter
  Zustand;
- Failure-Outcomes speichern nur Fehlercode/-klasse, Status, HTTP-Status,
  Bytecount, Requestdauer, Request-/Attemptbindung, Tokenhash sowie den
  authentifizierten Checkpoint vor und nach der Transition. Providertext, Raw
  Body, Payload und Credentials besitzen weder Spalten noch RPC-Parameter;
- Claim und Failure verwenden `lock_timeout=2s`, `statement_timeout=10s`, eine
  feste Lockreihenfolge und fortschreitendes `clock_timestamp()`. Lease und
  Integritätsschlüssel werden nach potenziellen Lock-Wartezeiten erneut geprüft;
- direkte Tabellenrechte bleiben auch für `service_role` entzogen; nur die
  geschlossenen RPCs dürfen mutieren.

Lokal belegt sind Migration plus idempotenter Re-Run, SQL-Integration mit
Rollback, Permission-/Connection-/Credential-/Key-/Provider-Negativpfade,
Checkpoint-Tamperblockade, Retry-Resume samt neu signiertem Checkpoint,
Attempt-Grenze, Maintenance-Deferred, Scope-lokale `failed/partial`-Ableitung,
Multi-Scope-Resume, exakte Replays, RLS/Privilegien, Future-Cutover- und
Future-Connection-Blockade, Scopeänderung während eines beobachteten Claim-
Lock-Waits, Integritätsschlüsselablauf während eines beobachteten späten
Account-Lock-Waits, Claim-Lock-Timeout, Failure-Leaseablauf während eines
beobachteten Scope-Lock-Waits sowie zwei echte konkurrierende Claims mit exakt
einem CAS-Gewinner. Page Success und Failure wurden zusätzlich für dieselbe
Work Unit und Requestsequenz in beiden Gewinnerreihenfolgen unter beobachtetem
Rowlock-Wait ausgeführt; jeweils committet exakt eine immutable Ergebnisart und
der Verlierer hinterlässt keine Teilwirkung.

Nicht umgesetzt sind weiterhin Aktivierungserstellung und atomare
Supersession, Lease-Renew/Release, Work-Unit-Erzeugung und Schedulerlanes,
autorisierte Lane-/Gap-Mutations-RPCs, die Fortschreibung der jetzt lediglich
modellierten High-Watermarks, die bindende Verwendung der Health-Ableitung in
Claim/Page/Request sowie produktiver Credential-/Keyloader,
Prozessrestart-Recovery und jede Runtimeverdrahtung. Daher entsteht weder
Runtime- noch Import-GO.

### 2.5 Lokale Lane-/Gap-/Health-Autoritätsgrundlage

`supabase/schema-patch-v57.61.0-g1-lane-authority.sql` ist ein drittes
additives, marker- und fingerprintgebundenes lokales Migrationsartefakt. Es
setzt den geprüften Capture-Control-Marker voraus und ergänzt:

- `broker_sync_lane_requirements` als von vorhandenen Lane States unabhängige
  Soll-Grain-Autorität je Tenant, Account, Activation/Generation, Capability,
  Instrument-/Accountscope, Profil und Policy;
- `broker_sync_lane_states` im exakten Requirement-/Tenant-/Account-/Activation-/
  Generation-/Capability-/Instrument-/Lane-/Profil-/Policy-Grain;
- genau die drei disjunkten API-Pflichtlanes `incremental_fast_6h`,
  `rolling_audit_7d_daily` und `rolling_audit_28d_weekly`;
- eine Partial-Unique-Autorität für genau eine aktuelle Lane-State-Revision;
- explizit versionierte, kanonisch digestgebundene Provider-Time-/Tie-Breaker-
  High-Watermarks statt eines freien JSON-Autoritätsfeldes; `not_observed`
  verbietet Watermarks und `healthy` verlangt sie vollständig;
- Composite-FK-Bindung von Last-Complete-Scope-ID plus gespeichertem Digest an
  die echte Scope-ID/-Digest-Kombination; die read-only Health-Ableitung zählt
  `healthy` nur bei geschlossenem, `complete_for_profile`, stability-/source-/
  coverage-kompatiblem Scope und konsistenter Abschlusszeit, andernfalls
  `invalidCompleteScopeLaneCount` und fail-closed `degraded`;
- `broker_sync_gaps` mit typisierten Grenzen, Cause/Status/Reason,
  exact-scoped Discovery-/Resolution-Scope-FKs und kanonisch gebundener
  Resolution-Evidence; eine erfundene „0 Events“-Auflösung ist nicht
  darstellbar. Ein Gap bleibt über Policy-Supersession hinweg wirksam, und ein
  syntaktisches `reconciled` ohne geschlossenen, vollständigen,
  grenzdeckenden und source-kompatiblen Scope wird fail-closed als
  `invalid_reconciliation` behandelt;
- RLS mit ownergebundenem `(select auth.uid())`, FK-/RLS-Indizes und entzogenen
  direkten Rechten für `anon`, `authenticated` und `service_role`;
- die timestamp-injizierbare interne
  `equora_derive_capture_health_at_v1` und den ausschließlich für
  `service_role` ausführbaren, uhrgebundenen read-only Wrapper
  `equora_derive_capture_health_v1`.

Die Ableitung bildet ihre Sollmenge aus aktuellen Requirements und einem
Capability-Platzhalter, falls eine Profil-Capability noch überhaupt kein
Requirement besitzt. Sie verwendet die geprüfte Präzedenz `revoked`, `paused`,
inaktiv/permission-blockiert/pending, Exportgap, fehlende beziehungsweise noch
nicht beobachtete Pflichtlane, degraded/überfällig/offener Non-Export-Gap,
vollständig healthy. `next_due_at <= as_of` gilt explizit als überfällig. Ein
bekannter Exportgap wird bei aktiver Activation nicht durch eine gleichzeitig
fehlende Lane als bloßes `pending` maskiert. Gaps derselben Aktivierungsgeneration
bleiben unabhängig von der aktuellen Policy/Lane sichtbar; Zeilen anderer
Aktivierungen oder Generationen werden nicht wiederverwendet. Export-Gap-,
ungültige-Reconciliation- und exportblockierte-Lane-Zähler bleiben getrennt.

`broker_sync_activations.capture_health` bleibt ein nichtautoritativer Cache.
Der neue read-only Wrapper aktualisiert ihn nicht und erzeugt weder Run, Scope,
Work Unit noch Brokerrequest. Die Migration enthält ausdrücklich keinen
Reconciliation- oder Watermark-Mutations-RPC. Solange keine geprüften
Mutations-RPCs und keine
bindenden Authority-Fences in Claim/Renew/Release/Page/Request existieren, ist
die Grundlage nicht scheduler- oder runtimefähig.

### 2.6 Optionale spätere WebSocketquelle

`docs/decisions/EQUORA_v57.61.0_WEBSOCKET_SOURCE_POLICY.md` hält private
Broker-WebSockets providerneutral als optionale, spätere Observationsquelle
fest. REST-History, Overlap-Backfill und Reconciliation bleiben maßgeblich.
Der MEXC-WebSocket besitzt einen vom REST-Origin getrennten Origin und benötigt
ein eigenes Security-/Provider-Gate. WebSocketcode und -runtime bleiben
blockiert; kein Streamereignis darf Vollständigkeit, Approval oder Import
autorisieren.

Der alte ungescopte Previewaufruf ist fail-closed gesperrt. Die gesamte
Runtimeaktivierung bleibt über `MEXC_RUNTIME_GATE = g1_transport_only` hart
deaktiviert. Connect- und Refresh-Actions sind zusätzlich bewusst inert und
brechen vor Credential-, Datenbank- oder Brokerzugriff ab. Die getrennte lokale
Nutzeraktion zum Entfernen einer gespeicherten Verbindung bleibt verfügbar.

## 3. Nichtdestruktiver Strategie-Testscope

Für die Nutzeranforderung „neue Strategie sauber auswerten, ohne alte Trades
zu verfälschen“ wurden Setup- und inklusive Von-/Bis-Filter ergänzt. Das
Journal wird dabei weder geändert noch gelöscht.

Zusätzliche Produktgrenzen:

- aktiver Scope, Trefferzahl und belastbare Treffer bleiben auch bei
  eingeklapptem Filter sichtbar;
- null passende beziehungsweise null belastbare Trades erzeugen einen
  eindeutigen Empty State ohne Performancezahlen;
- unter fünf belastbaren Trades werden keine Rankings oder Strategieclaims
  angezeigt;
- Best-/Weakest-Buckets benötigen mindestens drei Trades;
- oberhalb der Schwelle bleiben Aussagen deskriptiv-historisch und sind keine
  Strategie-, Positionsgrößen- oder Ausführungsempfehlung;
- „Auswertungszeitraum zurücksetzen“ ist sprachlich klar von Trade-Löschung
  und Import-Revert getrennt.

Einzel-Trade-Löschung und der bestehende Dateiimport-Revert bleiben separate,
destruktive Funktionen. Ein späterer MEXC-Revert darf den generischen
Hard-Delete nicht wiederverwenden, wenn manuelle Journalanreicherung erhalten
werden muss.

## 4. Lokale Verifikation

| Prüfung | Ergebnis |
|---|---|
| Vollständige Vitest-Suite | `15 files / 258 tests passed`; die vier neuen statischen Lane-Authority-Verträge sowie alle bisherigen Pagination-, Capture-Control- und SQL-Verträge sind enthalten |
| TypeScript | `tsc --noEmit` PASS |
| Next.js Production Build | PASS mit Next.js `15.5.21`; optimierter Produktionsbuild, buildintegrierte Typ-/Gültigkeitsprüfung, Page-Datenerhebung und statische Generierung erfolgreich. Historische Bezeichnung „Type-/Lintphase“ bedeutete keinen eigenständigen ESLint-Nachweis; `next lint` ist in diesem Workspace nicht reproduzierbar konfiguriert und gehört nicht zur Freigabeevidenz. |
| Lokale additive SQL-Migration | Capture Control unverändert PASS; remediierte Lane-Authority-Migration frisch gegen isoliertes `public.ecr.aws/supabase/postgres:17.6.1.084` angewendet und unmittelbar idempotent erneut ausgeführt. Marker/Fingerprint `dee44eac270b8522e8c8b4a3e5c2a5567072b33bd81f6a7fbbf70811948fe487`, Requirement-/Lane-/Gap-Tabellen, Scope-ID/-Digest-FK, exakte übrige FKs, RLS, Privilegien, Indizes, Wrapperrechte, 5-Sekunden-Statement-Timeout sowie kanonische Constraint-/Index-Definitionsfingerprints PASS. Kontrollierte Kopien mit falschem Marker, unmarkiertem Partialschema, entfernter kritischer FK, gleichnamig abgeschwächter FK, gleichnamig abgeschwächtem Complete-Scope-Check und gleichnamigem nicht eindeutigen/falsch prädizierten Current-Index wurden mit den vorgesehenen `LANE_AUTHORITY_*_DRIFT`-Fehlern vollständig abgewiesen; kein verbundenes Supabase-Projekt berührt |
| Lane-/Gap-/Health-SQL-Integration | PASS mit anschließendem `ROLLBACK`: Empty Set `pending`; vier unabhängige Required Grains ergeben eine vollständige 12-Lane-Matrix `healthy`; ein zusätzliches Instrument-Requirement ohne States bleibt mit drei fehlenden Lanes `pending`; exakte Due-Grenze wird `degraded`; Gap- und Lane-Exportzähler sind getrennt; ein ungelöster Exportgap bleibt nach Supersession der alten Policy und vollständig gesunder Ersatzpolicy sichtbar; `not_observed` mit Watermark, `healthy` ohne Watermark, Null-/gefälschter Watermark-Digest, selbstkonsistent über einen falschen Scope-Digest berechnete Watermark und gefälschter Resolution-Digest blockieren fail-closed; ein als healthy persistierter Partial-/Unclosed-Scope wird read-seitig als ungültige Complete-Scope-Evidenz `degraded`, nachträgliche Scope-Digest-Abweichung scheitert am FK; out-of-window, partial/unclosed und falsche Reconciliation-Source bleiben `invalid_reconciliation`; erst exact-scoped, geschlossene, `complete_for_profile`, grenzdeckende Provider-Export-Evidenz reconciliert; Pause/Revocation, Generation-Isolation, Duplicate-Current-Lane, Cross-Tenant-Gap, direkte Privilegien und RLS-Isolation blockieren fail-closed; service-role-only Read-Wrapper PASS |
| Persistenz-SQL-Integration | PASS mit anschließendem `ROLLBACK`: bestehende Page-Commit-/HMAC-/Digest-/Rollbackmatrix unverändert PASS; zusätzlich atomarer Claim, exaktes row-version-gebundenes Claim-/Outcome-Replay, Token-Mismatch, HMAC-gültige aber nichtkanonische Versions-, Page-Size-, Zähler-/Cursor- und Positions-Checkpoints, capability- und page-scope-gebundene Failure-Preconditions vor Mutation sowie Replay-Drift, serverseitig abgeleiteter und neu signierter Rate-Limit-Retry, verfrühter Retry, zweiter Claim, terminaler Credentialfehler, Maintenance-Deferred, Attempt-Grenze ohne Auditverlust, Success-/Failure-Sequenzkonflikt, Scope-lokale `failed/partial`-Ableitung, Multi-Scope-Resume, RLS und direkte `service_role`-Tabellenrechte geprüft; fehlende MEXC-Capability/-Methode, `null`-Capability-Version, pausierte Aktivierung, ungültige Permission-Evidence, pausierte Connection, leere Credentialgeneration, widerrufener Integritätsschlüssel und suspendierter Provider blockieren fail-closed |
| Persistenz-Zwei-Sitzungs-Test | `tests/sql/run-broker-capture-concurrency.ps1` erneut PASS gegen die lokale Vorlage mit installierter Lane-Authority-Migration: `pg_locks.waitstart` belegt den RPC-Start der späten `broker_sync_scopes`-Lock-Wartezeit bei noch gültigem Lease beziehungsweise Integritätsschlüssel nach bereits begonnenen Page-Writes; der Ablauf während dieser Wartezeit führt anschließend zur fail-closed Ablehnung. Der Test vergleicht ausdrücklich unveränderte Scope-Completeness/-Stability/-Closed-At- und Run-Status/-Started-At/-Counter-Werte und bestätigt damit den vollständigen Rollback aller Request-, Raw-, Event-, Observation-, Scope-, Run-, Ledger- und Work-Unit-Wirkungen; ein absichtlich länger als zwei Sekunden gehaltener Work-Unit-Lock endet mit `CAPTURE_LOCK_TIMEOUT` ohne Teilzeilen; echte Überlappung zweier Work Units führt zu exakt einem Ledger-CAS-Gewinner und einem `CAPTURE_LEDGER_CAS_MISMATCH`; ein paralleles Activation-Pause-Update wartet in einem belastbaren Drei-Sekunden-Beobachtungsfenster auf den in-flight Commit und wird erst nach dessen atomarem Abschluss wirksam |
| Claim-Zwei-Sitzungs-Test | `tests/sql/run-broker-capture-claim-concurrency.ps1` erneut PASS gegen die Vorlage mit installierter Lane-Authority-Migration: zukünftiger Activation-Cutover und zukünftiges Connection-Account-`valid_from` werden ohne Teilwirkung abgelehnt; ein während beobachteter Account-Lock-Wartezeit geschlossener Scope wird nach dem Wait erneut gesperrt und mit `CONTROL_SCOPE_INVALID` abgelehnt; Integritätsschlüsselablauf während eines mit `pg_locks.waitstart` vor Ablauf belegten späten Account-Lock-Waits endet mit `CONTROL_INTEGRITY_KEY_INACTIVE` und null Teilwirkung; ein länger als zwei Sekunden blockierter Work-Unit-Lock endet mit `CONTROL_LOCK_TIMEOUT` und null Teilwirkung; zwei überlappende Claims erzeugen exakt ein 45-Sekunden-Lease und einen `CONTROL_WORK_UNIT_CAS_MISMATCH`; exaktes Replay bleibt bei Row-Version/Attempt/Claim-Count eins, abweichender Token wird blockiert |
| Failure-Zwei-Sitzungs-Test | `tests/sql/run-broker-capture-failure-concurrency.ps1` erneut PASS gegen die Vorlage mit installierter Lane-Authority-Migration: `pg_locks.waitstart` belegt, dass der Failure-RPC vor Leaseablauf auf dem finalen Scope-Rowlock wartet; nach Ablauf lehnt die fortschreitende Zeitprüfung mit `CONTROL_LEASE_INVALID` ab und Work Unit, Run, Scope sowie immutable Outcome bleiben vollständig unverändert |
| Outcome-Zwei-Sitzungs-Test | `tests/sql/run-broker-capture-outcome-concurrency.ps1` erneut PASS gegen die Vorlage mit installierter Lane-Authority-Migration und in beiden Gewinnerreihenfolgen: Wenn Page Commit zuerst den identischen Work-Unit-/Sequenz-Slot sperrt und persistiert, wartet Failure nachweislich über `pg_locks.waitstart` und verliert anschließend atomar ohne Failure-Outcome; wenn Failure zuerst sperrt und persistiert, wartet Page Commit nachweislich und verliert anschließend ohne Success-Request-Result. Die exakten persistenten Endzustände belegen jeweils genau einen Gewinner, den korrekten Work-Unit-, Run- und Scope-Status sowie unveränderte Gegenpfadtabellen. |
| Capture-Control-Fehlervertrag | PASS: alle 23 produktiven SQL-`CONTROL_*`-Codes sind bidirektional in TypeScript-Union und geschlossener Datenbankcode-Whitelist vorhanden; die sechs ausschließlich migrationsbezogenen `CONTROL_MIGRATION_*`-Codes bleiben bewusst außerhalb des Runtimevertrags |
| Lokaler PostgREST-RPC-Timeout | `tests/sql/run-broker-capture-postgrest-timeout.ps1` PASS mit gepinntem offiziellem `postgrest/postgrest:v14.15`: Default `db-hoisted-tx-settings` enthält `statement_timeout`; eine echte Data-API-RPC mit 20 Sekunden Laufzeit und funktionsgebundenem 15-Sekunden-Limit endet nach 15,02 Sekunden mit SQLSTATE `57014`; Testcontainer, Netzwerk, Rolle und Funktion anschließend entfernt |
| Lokale Baselinegrenze | Für `schema.sql` und v57.60.1 wurden im isolierten Einzelcontainer die erforderlichen `storage.buckets`-/`storage.objects`-Schnittstellen als minimale lokale Testtabellen bereitgestellt. Damit sind SQL-Abhängigkeiten und Migrationstypen geprüft, aber kein vollständiger Supabase-Storage-Dienst, kein Zielprojekt-Backup/Restore und kein Plattformdeployment behauptet |
| Transport-Negativtests | unbekannte Capability/Query, Injection, Legacy-Positionsalias, ungültige Position-ID/-Type, Redirect 301/302/303/307/308, Redirectfehler, Same-Host-Fremdpfad, Subdomain, Fremdport, HTTP-Downgrade, Fremdhost, ungültige Providerzeit, komprimierter/übergroßer/falsch deklarierter Body, Exact-Limit, Chunked/Missing-Length, sämtliche dokumentierten Providerfehler, mixed Items, unbestätigte Pageform und fehlende Provider-ID blockiert |
| Lossless-JSON-/Capabilityoracles | große unquoted Provider-ID und Decimal-/Exponentlexeme exakt erhalten; Provider-Lookalikes können interne Zahlentokens nicht fälschen; Duplicate Keys einschließlich escaped Kollision, ungültige Unicode-Surrogate, Nonstandardzahlen, 64/65-Tiefengrenze, Node-/Zahlbudgetüberschreitung, unbekannte Capability, capabilityfremder Scope, fehlende Pflichtfelder, unbekannte Enums, Scope-/Symbol-/Position-Type-/Orderingverletzungen und inkonsistente Fundingpage blockiert; kanonische leere Fundingpage bleibt valide aber ohne Authority; unbekannte Zusatzfelder nur raw erhalten |
| Credential-/Requestzähler | invalid Query: null Fetch und null Credentialzugriff; invalid Providerzeit: null Credentialzugriff und null private Requests; private Work Unit lädt Credentials nach vollständiger Validierung genau einmal; Capture Binding ohne gebundenen Loaderkontext sowie isolierte Abweichungen bei Account-HMAC-Referenz, Brokerkonto, Connection Account, Aktivierungs-ID oder Aktivierungsgeneration werden vor dem privaten Request blockiert; eine WorkUnit-Referenz mit falschem Referenzvertrag scheitert vor jedem Fetch |
| Capability-Teilfehler | erfolgreicher Orders-Read plus rate-limited Execution-Read ergibt ein `wire_succeeded`- und ein `failed`-Outcome; der Previewadapter bricht sichtbar ab; kein `[]`-Ersatz und kein profilweiter Erfolgsclaim |
| Pagination-/Checkpointkern | `20/20` Fixtures: HMAC-/Budget-/Scopebindung, unbekannte Felder und Manipulation, Work-Unit-/Scopegrenzen, drei Work Units plus JSON-Restart, atomarer Budgetüberlauf, Error-Body-Bytebudget, wiederholter Cursor bei geändertem Body, Providerzeitregression, bewusst als spätere Raw-Observation akzeptierter Cross-Page-ID-Overlap, Page-10000-Grenze, Fundingterminalität ohne Authority, Positionsblockade, Retry-not-before, Retryerschöpfung, Maintenance und nicht retrybare Fehler |
| `equora-tcj-v1` | `14/14` Fixtures: normative Tags, volle U+0000–U+001F-Escapematrix, unescaped Slash/U+2028/U+2029, NFC, ASCII-/Non-ASCII-UTF-8-Key- und vollständige Set-Bytesortierung, Duplicate-/Surrogate-/Lookalike-/Brand-Copy-Rejection, 64/65-Containergrenze, exakte 100.000/100.001-Node- und 8-MiB/Plus-eins-Grenzen, Bytebudget nach Escaping, leere/missing-vs-null-Container, exakte Decimal-/Exponentkanonisierung, lossless Providerzahlen sowie gepinnte Raw-Content- und unabhängig berechnete domain-separierte Raw-Body-Golden-Vektoren; die fachlichen Domaininhalte werden separat in Ledger-, Sync-Scope- und Orchestrator-Fixtures geprüft |
| Transienter Raw-Observation-Ledger | `14/14` Fixtures: unveränderlicher Erstcommit, Cross-Page-Wiederbeobachtung, semantische Keyorder-/Zahläquivalenz, Fallbackrevision, MEXC-Revisionsauthorityblockade, Generation-Precondition, Replayblockade in authentischer State-Kette, Spread-/Reflection-State-Forgery, vollständige Digestmetadaten, typisierte opake Referenzen, gepinnte Source-/Contract-/Adapter-Provenienz und Capability-Endpoint-Bindung, Funding-Page-/Terminalbindung, leere terminale Page ohne Completeness, `blocked_identity`, Accountisolation und Page-/State-Ressourcenlimits |
| Normativer MEXC Sync Scope | `5/5` Fixtures: gepinnte Stability-/Scope-Golden-Digests, Cross-Activation-/Account-/Instrument-/Scopegenerationsisolierung, Ergebnisstatus ohne Digestwechsel, konservative 72-Stunden-Requestspanne, exakt ausgerichtete 7-/28-UTC-Tagesfenster, Profil-/Policy-Pins, capabilitykohärenter Position-Type sowie Blockade positiver Completeness-/Stabilityclaims; persistierte High-Watermark und Multi-Bucket-Raster bleiben offen |
| In-Process-Capture-Orchestrator und Persistenzadapter | `30/30` Fixtures: authentische Purpose-Binding→Prepared-Request→Body→Oracle→Pagination→Raw-Ledger-Transition, identische Raw-Body-/Scope-Digests, transportgebundene Observationzeit, unverändertes Raw-Payloadobjekt, Wire-Response-Forgery- und Unbound-Preview-Blockade, Scope-/Checkpointbindung, isolierte Capability-/Symbol-/Start-/End-/Page-/Page-Size-/Position-Type-Requestsubstitution sowie isolierte Scope-Digest-/Run-/Request-Result-/Sequenz-/Brokerkonto-/Aktivierungs-ID-/Aktivierungsgenerationsabweichung, Cross-Account-Blockade, Same-Process-Single-use und kanonische leere Fundingpage ohne Authority; Resultate sind zusätzlich an exakt das ursprüngliche authentische Wire-Response-Objekt gebunden; Raw-Byte-RPC-Serialisierung, fester Cross-Runtime-Transition-HMAC, Safe-Integer-Grenze, strikte DB-Ergebnisvalidierung, strukturierte SQLSTATE-/geschlossene Timeout-Fehlerabbildung und die sanitisiert geschlossene Abbildung von `CAPTURE_CHECKPOINT_MAC_INVALID` sind belegt |
| Broker-Egress-Contract | rekursive Produktquellprüfung und transitiver AST-Importgraph; exakt der zentrale Transport-Fetch sowie der bekannte Shared-Shell-Fetch `/api/sidebar-overview` sind fixiert; die zugehörige Route wird als eigener Root transitiv mitgeprüft; jeder zusätzliche lokale Brokerproxy ist ein Befund; verschachtelter `node:https`-/`globalThis.fetch`- und lokaler Proxy-/bare-`https`-Mutant werden erkannt |
| Browser Desktop | persistenter Scope, `n=1`-Hinweis, Empty State, direkter Reset und vollständiger Reset funktional |
| Browser Mobile `390x844` | früherer Scope-/Empty-State-Snapshot: `innerWidth=390`, `scrollWidth=378`, kein horizontaler Overflow; finaler Code zusätzlich durch Build und A6-Review geprüft |
| Browserkonsole Produktionsserver | keine neuen Warnungen oder Fehler; ein früherer, dokumentierter Dev-Junction-Fehler stammte vor dem Produktionsserverlauf |
| Git Whitespace | `git diff --check` PASS; ausschließlich erwartete CRLF-Hinweise |

Die Dependencies wurden nicht installiert oder verändert. Tests und Build
verwendeten ausschließlich einen temporären, vorab auf das vorhandene
v57.60.1-`node_modules` geprüften Junction; der Junction wird nach Abschluss
entfernt.

## 5. Verbleibende G1-P1-Blocker

Dieses Delta ist kein G1-Abschluss. Die lokale Persistenz-, Activation-,
Lane-/Gap-, Request-/Page-/Failure- und Scheduler-/Lease-Control-Plane ist
inzwischen implementiert und isoliert testbar. Vier produktive Blöcke bleiben
offen:

1. die weiterhin ausdrücklich gesperrte automatische Runtimeansteuerung des
   gebundenen Orchestrators einschließlich produktivem Credential-Decryptor;
2. der betriebliche Account-Identity-, Capture-Integritäts- und Credential-
   Key-Lifecycle einschließlich sicherer Erzeugung, Verteilung, Rotation,
   Widerruf sowie zusätzlicher Provider-/Credential-Suspension-Races;
3. reale, ausdrücklich freizugebende MEXC-Evidenz für Pagination, Retention,
   Rate Limits und Late Arrivals; die lokalen Orakel verwenden ausschließlich
   synthetische Providerdaten und erzeugen keinen Brokerrequest;
4. die kontrollierte Ziel-Supabase-Migration einschließlich Backup/Restore,
   Retention/Erasure, Plattform-RLS-/Timeout-Evidenz und Rolloutplan.

Die früheren begrenzten Teildeltas wurden unabhängig abgeschlossen geprüft:

- A3: `PASS`, `P1=0`, `P2=0`, `P3=0` für Parser, Capabilityoracles,
  Transport, Adapter und Tests;
- A4: `PASS`, `P1=0`, `P2=0`, `P3=0` für die Read-only-Sicherheitsgrenze;
- A6: `PASS`, `P1=0`, `P2=0` für den nichtdestruktiven Analytics-Scope.

Der erste unabhängige A3-/A4-Review des neuen TCJ-/Raw-Ledger-Deltas ergab
`FAIL` und identifizierte den unversionierten Raw-Body-Digest, kopierbare
Runtimebrands, den fälschbaren transienten State sowie Page-/Terminal- und
Claimlücken. Diese Befunde sind im aktuellen Arbeitsstand korrigiert. Die
unabhängigen Abschlussrechecks des hashfixierten Snapshots ergaben:

- A3: `PASS`, `P1=0`, `P2=0`, `P3=0` für TCJ, Raw Ledger,
  Provenienz-/Digest-/Terminalverträge und Claims;
- A4: `PASS`, `P1=0`, `P2=0`, `P3=0` für Read-only-, Security-, Ressourcen-
  und Authoritygrenzen.

Diese Voten schließen nur die genannten Teildeltas. Sie ersetzen keinen der
sechs weiterhin offenen G1-Punkte und erzeugen weder Runtime- noch Import-GO.

Der erste unabhängige A3-/A4-Review des nachfolgenden Sync-Scope-/Orchestrator-
Deltas ergab `FAIL`. Beanstandet wurden fehlende Request-/Account-/Scope-
Zweckbindung und Same-Process-Replayblockade, der abweichende Source Channel,
veränderliche Zustandsfelder im Scope-Digest, zu starke Laneclaims und eine frei
injizierbare Observationzeit. Diese Punkte sind im aktuellen lokalen Stand
technisch und dokumentarisch korrigiert; der unabhängige Abschlussrecheck des
ersten Remediation-Snapshots bestätigte `P1=0`, meldete jedoch eine `P2`-
Regressionsevidenzlücke für einzelne Credential-, Capture-Binding- und
Requestfelder. Die geforderte eindimensionale Negativmatrix ist im aktuellen
lokalen Stand ergänzt. Die unabhängigen Abschlussrechecks des neuen
hashfixierten Evidenz-Snapshots ergaben:

- A3: `PASS`, `P1=0`, `P2=0`, `P3=0` für G0-Feldtreue, Digest-/Laneclaims,
  Request-/Capture-Bindung und die vollständige eindimensionale Negativmatrix;
- A4: `PASS`, `P1=0`, `P2=0`, `P3=0` für Read-only-, Confused-Deputy-,
  Same-Process-Replay-, Credentialkontext- und Authoritygrenzen.

Diese Voten gelten ausschließlich für das begrenzte lokale Teildelta. Sie
schließen keinen der sechs offenen G1-P1-Blöcke und erzeugen weder Runtime-,
Import-, Datenbank-, Push-, Deployment- noch Produktions-GO.

Der vorangegangene hashfixierte Persistenzsnapshot erhielt von A3 `PASS` mit
`P1=0`, `P2=0`, `P3=0`. A4 meldete zunächst `FAIL` mit `P1=1`, `P2=1`:
fortlaufende Zeitprüfung nach Lock-Wartezeiten fehlte und die RPC besaß keine
belastbar auf den aktuellen Supabase-Data-API-Aufruf angewendeten Lock-/
Statement-Grenzen. Nach der ersten Remediation identifizierte A4 noch einen
späten P1-Rowlock beim Scope-Update nach der bis dahin letzten Authorityprüfung.
A6 bestätigte die technischen Produktgrenzen, meldete aber einen P2-Widerspruch
durch veraltete „Implementierung nicht begonnen“-Formulierungen im
Transaktionsdesign.

Der aktuelle Stand remediated diese Befunde durch fortlaufende
`clock_timestamp()`-Revalidierung einschließlich einer letzten Prüfung nach
Scope-/Run-Updates und unmittelbar vor Return, 2-/15-Sekunden-
Funktionsgrenzen, 12-Sekunden-Deadline, strukturierte Timeoutfehler, echte
Late-Scope-Write-Rollback- und PostgREST-Proben sowie wahrheitsgemäße
`G1 IN PROGRESS – NO-GO`-Statusmetadaten im Architekturartefakt. Im ersten
Schlussreview dieses Stands identifizierte A3 noch eine P3-Abweichung zwischen
dem SQL-Fehler `CAPTURE_CHECKPOINT_MAC_INVALID` und der geschlossenen
TypeScript-Whitelist; A4 empfahl als optionale P3-Evidenzhärtung die direkte
Scope-/Run-Rollback-Prüfung. Beide Punkte sind im finalen Snapshot korrigiert.

Die hashgebundenen Abschlussrechecks des finalen lokalen Snapshots ergaben:

- A3: `PASS`, `P0=0`, `P1=0`, `P2=0`, `P3=0`; 41 eindeutige
  SQL-`CAPTURE_*`-Codes, TypeScript-Whitelist und TypeScript-Union sind
  bidirektional vollständig;
- A4: `PASS`, `P0=0`, `P1=0`, `P2=0`, `P3=0`; Late-Scope-Authority-Race,
  `pg_locks.waitstart` und direkte Scope-/Run-Rollback-Evidenz bestätigt;
- A6: `PASS`, `P0=0`, `P1=0`, `P2=0`, `P3=0`; Statuswahrheit,
  Read-only-Produktgrenze, begrenzte Broker-Erweiterbarkeit und die sechs
  verbleibenden G1-P1-Sperren bestätigt.

Hashmanifest der unabhängig geprüften Implementierungs- und Evidenzartefakte:

| Artefakt | SHA-256 |
|---|---|
| `lib/server/broker-capture-persistence.ts` | `67618EADCC91B1E7C06BC39237C585984348577F08DE00CDA685663828F31EB1` |
| `lib/server/mexc-capture-orchestrator.ts` | `0D7F8EFEB1623CCC7821E1CAFC05FBB3C1D33EC96E2DBCBBD1D43B16615008F0` |
| `lib/server/mexc-transport.ts` | `B2C3DF747AE388D7575029CE14D1665945411543FCDEF2208BD3B637EEDDB25B` |
| `supabase/schema-patch-v57.61.0.sql` | `268B8ECD932871B2CAC2478D2AAB89DB98F1AEAD4C587628A0C66374F5D0296C` |
| `tests/mexc-capture-orchestrator.test.ts` | `7FBFD888BC5670D7990A749831126F917D5FCE68E8BAC24A407680F0820DC157` |
| `tests/mexc-readonly-transport.test.ts` | `1EF009BA341EDB4E9C150C34A18FF3408BB4A597E2151D27C29547EDB54F0CD9` |
| `tests/sql/broker-capture-persistence.integration.sql` | `55ED09357799FACDC98A17F4E2BE97B11F7E8B93A7E301A88ACDC19312D47E10` |
| `tests/sql/run-broker-capture-concurrency.ps1` | `9F76B0AE267FF328A4057AF9C20698F4C2E2527BC49CF2A3E9A941300F15B62C` |
| `tests/sql/run-broker-capture-postgrest-timeout.ps1` | `D08A3C0F793EBE4BE23E83EA31C72E73A4CC5915AB102B223316D89CD794D2F3` |
| `docs/architecture/EQUORA_v57.61.0_BROKER_IMPORT_TRANSACTION_OPERATIONS_MIGRATION_DESIGN.md` | `4DBFF9B83B246B3DA5C068C8169C9FF8E474BFCC802036E92223AF692A21ED68` |

Diese Voten und Hashes machen den begrenzten lokalen Patchstand
commit-fertig. Sie schließen keinen der sechs offenen G1-P1-Blöcke und sind
ausdrücklich kein Runtime-, Import-, Supabase-, Push-, Deployment- oder
Produktions-GO.

### 5.1 Aktuelles uncommittiertes Capture-Control-Teildelta

Die erste eingefrorene Prüfung des nachfolgenden Claim-/Failure-Control-
Teildeltas war ausdrücklich kein PASS:

- A3: `FAIL`, `P1=3`, `P2=3`, `P3=2`; beanstandet wurden insbesondere
  zeit- und scope-veraltete Claims/Failures nach Lock-Wartezeiten,
  unvollständige Checkpointauthentisierung, nicht ausreichend gebundene
  Replays sowie veraltete Gate-Evidenz;
- A4: `FAIL`, `P1=1`, `P2=2`; zukünftige Cutover-/Validity-Zeitpunkte,
  unnötig geladene Secretzeilen und eine abweichende Lockreihenfolge waren
  nicht akzeptabel;
- A5: `FAIL`, `P1=3`, `P2=1`; der letzte zulässige Fehlerversuch konnte vor
  Auditpersistenz abgewiesen werden, Runs wurden zu früh terminal und
  Scope-/Outcome-Completeness wurde aus dem falschen Grain abgeleitet.

Der erste hashfixierte Remediation-Snapshot beseitigte diese Befunde durch
fortschreitende Zeit-/Authorityprüfung nach den finalen Rowlocks,
Checkpoint-HMAC-Verifikation und serverseitige Neusignierung, geschlossene
DB-abgeleitete Retry-/Terminalübergänge, scope-lokale Evidenzableitung,
resumable Multi-Scope-Runs, exakte row-version-gebundene Replays und
Success-/Failure-Sequenzausschluss. Die unabhängige Prüfung dieses ersten
Remediation-Snapshots war dennoch kein Abschluss-PASS:

- A3: `FAIL`, `P1=1`, `P2=1`; die Datenbank konnte bei Scope-Evidenz aus einem
  früheren Run korrekt `partial_failed` für den Scope und `failed` für den
  aktuellen Run liefern, während der TypeScript-Adapter diese gültige
  Kombination nach bereits erfolgtem Commit zurückwies. Außerdem war die
  dokumentierte Lockreihenfolge veraltet;
- A4: `FAIL`, `P1=0`, `P2=1`; die Architektur beschrieb eine andere
  Integrity-Key-/Provider-/Broker-Account-Reihenfolge als die implementierte
  und getestete feste Lockordnung und ließ den finalen Scope-Lock aus;
- A5: `FAIL`, `P1=0`, `P2=1`; SQL-Vertrag und sequenzielle Integrationstests
  belegten den Success-/Failure-Ausschluss, aber noch keinen echten
  überlappenden Zwei-Sitzungs-Wettlauf beider Ergebnis-RPCs.

Der zweite unabhängige Recheck dieses Stands identifizierte weitere
Post-Commit- und NULL-Sicherheitslücken und war daher ebenfalls noch kein
Abschluss-PASS:

- A3: `FAIL`, zunächst `P1=1`, anschließend zusätzliche `P2`-Befunde;
  `historical_executions_v3` wurde im TypeScript-Ergebnisadapter nach einem
  erfolgreichen Claim fälschlich auf `pageSize <= 100` statt `<= 1000`
  begrenzt. Failure-Capability und `pageScopeDigest` wurden nur nach dem Commit
  im Adapter geprüft, nicht als SQL-Preconditions. Claim und Failure besaßen
  außerdem noch keine vollständig gemeinsame kanonische und relationale
  Request-Checkpointinvariante; der Migrationsfingerprint war nach der
  Signaturänderung zunächst veraltet;
- A4: `FAIL`, `P1=0`, `P2=1`; fehlende Provider-Capability/-Methode und
  `null`-Capability-Versionen konnten über PostgreSQL-Dreizustandslogik an
  `<>`-/`NOT`-Prüfungen vorbeilaufen. Der erste neue GET-only-Constraint war
  zudem noch nicht idempotent angelegt;
- A5 meldete in seinem fachlichen Zwischenstand keine neue P0-/P1-/P2-
  Integritätsabweichung, fror wegen der offenen A3-/A4-Verträge und veralteten
  Hashes aber bewusst noch kein Abschlussvotum ein.

Der aktuelle lokale Snapshot remediated sämtliche genannten Befunde: Scope- und Run-Wahrheit
werden unabhängig validiert; die Architektur nennt dieselbe feste Lockordnung
wie Claim und Failure; ein bidirektionaler Zwei-Sitzungs-Test belegt exakt einen
persistenten Page- oder Failure-Gewinner. Bei dieser Arbeit wurde zusätzlich
eine Integrationslücke entdeckt und geschlossen: der unveränderliche
`scopeDigest` des Sync Scopes und der fortschreibbare `pageScopeDigest` des
MEXC-Seitencheckpoints sind getrennte, explizit gebundene Digest-Domänen. Claim,
Failure, Page Commit, TypeScript-Adapter und Negativtests verwenden nun jeweils
die fachlich richtige Domäne und prüfen die verschachtelten Scopefelder gegen
den autoritativen Scope. Capability und Page-Digest sind nun 13-Parameter-
Failure-RPC-Preconditions und Replaybestandteil. Eine gemeinsame SQL-Invariante
prüft vor Claim und Failure Versions-/Budgetpins, capabilitybezogene
Seitengrößen, capabilitykohärentes `positionType`, requestfähige Status-/
Reasonkombinationen, Zähler-/Page-/Backoffrelationen, Fingerprint-/Cursorbindung
und verbleibenden Budget-Headroom. Permission-Evidence und Providerregistry
verwenden NULL-sichere Prädikate; ein idempotenter, validierter MEXC-Constraint
erzwingt die vier GET-only-Capabilities. Der neue Contract-Fingerprint lehnt
ältere lokale Marker transaktional ab.

Der Snapshot ist lokal durch markergebundene Migration plus Idempotenz,
SQL-Integration mit Rollback, Claim-/Failure-/Page-Commit- und bidirektionale
Outcome-Races, PostgREST-Timeout, `254/254` Vitest-Tests, TypeScript und Next.js-
Build belegt.

Die finalen hashgebundenen Abschlussreviews dieses unveränderten Snapshots
ergaben:

- A3: `PASS`, `P0=0`, `P1=0`, `P2=0`, `P3=0`; alle zuvor beanstandeten
  Capability-, Checkpoint-, Precondition-, Replay- und Race-Verträge sind
  geschlossen, `12/12` Manifest-Hashes stimmen;
- A4: `PASS`, `P0=0`, `P1=0`, `P2=0`, `P3=0`; Read-only-, GET-only-,
  NULL-Sicherheits-, Authority-, RLS-, Secret- und Migrationsgrenzen sind ohne
  offenen Securitybefund, `12/12` Manifest-Hashes stimmen;
- A5: `PASS`, `P0=0`, `P1=0`, `P2=0`, `P3=0`; Claim-/Failure-/Checkpoint-/
  Outcome-Invarianten, Multi-Scope-Resume und Success-/Failure-Ausschluss sind
  ohne offenen Integritätsbefund, `12/12` Manifest-Hashes stimmen;
- A6: `PASS`, `P0=0`, `P1=0`, `P2=0`, `P3=0`; Read-only-Produktgrenze,
  getrennte Finanzautorität, begrenzte Broker-Erweiterbarkeit und die sechs
  verbleibenden G1-P1-Sperren sind korrekt dargestellt, `12/12` Manifest-
  Hashes stimmen.

Damit ist ausschließlich das begrenzte lokale Capture-Control-Teildelta patch-
und commit-reif. Die vier Voten sind weder ein G1-GO noch eine Freigabe für
Runtime, Brokerrequests, automatischen Import, Supabase, Produktions-SQL, Push,
Vercel oder Deployment.

Hashmanifest des aktuellen Review-Snapshots:

| Artefakt | SHA-256 |
|---|---|
| `lib/server/mexc-pagination.ts` | `385F8EC38CD8FBC703191C5259BEDB7A93C1F9083541B9635FBFF9AF1D4C4689` |
| `lib/server/broker-capture-control.ts` | `888066C6E807B0BC90DA9B451FF9FB35F214922EB94D68D7555D72470AFABFF5` |
| `supabase/schema-patch-v57.61.0-g1-capture-control.sql` | `981A3F484F08D0D6D9E6B04C084A8A141AF74C60012FE5E8C21019B8D592EDA6` |
| `tests/mexc-pagination.test.ts` | `F584BD24EC7C8BF4E5F72057213A47A4F513ACDB1D24DB9088001C67BEE72230` |
| `tests/broker-capture-control.test.ts` | `FAB8B301F54D5AA4650963605A018EDA59FA025480779B1E29904CD46E3C5BD0` |
| `tests/sql-contracts.test.ts` | `8DD05C8E83143BB99BDB7A6ABDF846FD7D62594D10A767A195C4297FC3C40978` |
| `tests/sql/broker-capture-persistence.integration.sql` | `6D46D6FC58F9089F627C5245B1587A13E1984A620A365C913478437EB2198FB5` |
| `tests/sql/run-broker-capture-concurrency.ps1` | `10F4C584928BDB3A1EFD74256486FF0E5DCD8020550D79808DD32D539373F775` |
| `tests/sql/run-broker-capture-claim-concurrency.ps1` | `D4CB6DD85FEF0BDA757737DE8C0896B427E40115616F0F7DF968DDCDEA1BCAC2` |
| `tests/sql/run-broker-capture-failure-concurrency.ps1` | `1F9D1A0A879CE60344DB3B5A689C9C49DC5699D110EDB5C46677810082942AA7` |
| `tests/sql/run-broker-capture-outcome-concurrency.ps1` | `E89DD49A052201CFE2AC40715C007C3BDD26D799D66886A2F67D17F360C21EC4` |
| `docs/architecture/EQUORA_v57.61.0_BROKER_IMPORT_TRANSACTION_OPERATIONS_MIGRATION_DESIGN.md` | `32FB741015B9F4B0950CA0D27DDF8DA0EDDD965F2F4974D35F77CA24F90C852D` |

### 5.2 Aktuelles Lane-/Gap-/Health-Authority-Teildelta

Der erste eingefrorene Lane-Authority-Snapshot war technisch lokal grün, erhielt
aber bewusst kein Abschlussvotum. Die unabhängigen Reviews fanden:

- A3: `FAIL`, `P0=0`, `P1=4`, `P2=1`: ein Gap konnte durch Policy-Supersession
  unsichtbar werden; fehlende Instrument-Grains wurden aus vorhandenen States
  abgeleitet; `reconciled` verlangte keine positive vollständige Evidenz;
  Watermarkzustände und -Digests waren nicht hinreichend autoritativ; der
  kombinierte Exportzähler zählte Gap und Lane zusammen;
- A4: `LIMITED FAIL`, `P0=0`, `P1=1`, `P2=1`: derselbe
  Policy-Supersession-Fehler sowie fehlende Postflight-Prüfung kritischer
  Constraints/FKs;
- A5: `FAIL`, `P0=0`, `P1=3`, `P2=1`: dieselben Pflicht-Grain-,
  Supersession- und Reconciliationlücken sowie unvollständige
  Watermarksemantik.

Der erste Remediation-Snapshot schloss diese Findings durch eine
eigenständige `broker_sync_lane_requirements`-Sollautorität, exact-scoped
Requirement-FKs, policy-dauerhafte Gap-Auswertung, kanonische Watermark- und
Resolution-Digests, positive Resolution-Scope-Prüfung, getrennte Healthzähler
und einen Constraint-/FK-Postflight. Die vier Designartefakte wurden als
v16/v16/v12/v13 auf denselben Vertrag gebracht.

Der zweite unabhängige Review dieses Snapshots war erneut kein Abschluss-PASS:

- A3: `FAIL`, `P0=0`, `P1=1`, `P2=1`, `P3=0`: eine vorhandene Watermark mit
  `watermark_digest = NULL` konnte wegen SQL-Dreiwertlogik einen Check passieren;
  Last-Complete-Scope-Digest/-Vollständigkeit waren nicht positiv gebunden;
  drei Dokumentkontrolltabellen meldeten fälschlich `NOT STARTED`;
- A4: `FAIL`, `P0=0`, `P1=1`, `P2=1`, `P3=0`: derselbe
  Last-Complete-Scope-/Digest-Fail-open und lediglich namens-/typbasierte statt
  semantische Constraint-/Index-Driftprüfung;
- A5: `PASS`, `P0=0`, `P1=0`, `P2=0`, `P3=0`, wies den tatsächlichen Complete-
  Scope/Digest jedoch ausdrücklich als Voraussetzung des späteren Writers aus.

Der zweite Remediation-Snapshot band Last-Complete-Scope-ID und -Digest per
Composite-FK an die echte Scopezeile, verlangte einen expliziten 64-Hex-
Watermark-Digest, revalidierte `closed`, `complete_for_profile`, Stability,
Source/Coverage und Abschlusszeit in der read-only Health-Ableitung und zählte
ungültige Complete-Scope-Evidenz separat fail-closed als `degraded`. Kanonische
SHA-256-Fingerprints sämtlicher Constraints/Indizes der drei Authoritytabellen
plus der beiden Scope-Referenzindizes erkannten auch gleichnamig abgeschwächte
Definitionen. Die drei veralteten Dokumentkontrolltabellen wurden auf
`G1 IN PROGRESS – NO-GO` korrigiert.

Der dritte unabhängige Review dieses eingefrorenen Snapshots ergab:

- A3: `PASS`, `P0=0`, `P1=0`, `P2=0`, `P3=0`;
- A4: `PASS`, `P0=0`, `P1=0`, `P2=0`, `P3=0`;
- A5: `FAIL`, `P0=0`, `P1=0`, `P2=2`, `P3=0`: Stability-, Source/Coverage-
  und Abschlusszeitprädikate der positiven Complete-Scope-Revalidierung waren
  nicht einzeln durch Negativorakel geschützt; außerdem fehlte
  `invalidCompleteScopeLaneCount` in den vier normativen Health-
  Präzedenzblöcken.

Die konsolidierende Root-Prüfung akzeptierte den Snapshot trotz der beiden
PASS-Voten noch nicht: `complete_scope_check`, `watermark_check`, `error_check`
und `gaps_resolution_check` besaßen weitere gemischte Nullbelegungen, bei denen
PostgreSQL-`CHECK` wegen Dreiwertelogik `UNKNOWN` statt `FALSE` liefern konnte.
Direktes Tabellen-DML ist zwar bereits entzogen und der spätere Writer noch
nicht implementiert; die persistente Invariante selbst wäre aber unvollständig
gewesen.

Der aktuelle dritte Remediation-Snapshot verlangt deshalb in allen belegten
Evidenzzweigen jedes erforderliche nullable Feld explizit als `NOT NULL`.
Negativtests decken partielle Nullbelegung von Complete Scope, Watermark,
Fehlerzustand und Reconciliation ab. Die positive Health-Revalidierung besitzt
jetzt getrennte Orakel für ungültige Stability, inkompatible Source/Coverage,
`last_complete_at < closed_at` und vollständige Recovery. Alle vier normativen
Präzedenzblöcke degradieren ungültige Complete-Scope-Evidenz ausdrücklich und
verlangen sie positiv für `healthy`.

Der Implementierungsscope bleibt absichtlich kleiner als das gesamte offene
Activation-/Schedulerpaket. Enthalten sind ausschließlich Lane-/Gap-Schema,
Requirement-Autorität, exact-scoped FKs, High-Watermark-/Resolution-Vertrag,
RLS/Privilegien, deterministische read-only Health-Ableitung und Testharness.
Nicht enthalten sind Activation-Mutation, Supersession, Lease-Renew/Release,
autorisierte Requirement-/Lane-/Gap-/Reconciliation-/Watermark-Mutation,
Scheduler, Brokerrequest, Import oder ein produktiver Supabase-Aufruf.

Lokale Evidenz des aktuellen dritten Remediation-Snapshots:

- frische Migration und unmittelbarer idempotenter Re-Run PASS;
- Fingerprint-Drift, unmarkiertes Partialschema, entfernte kritische FK sowie
  gleichnamig abgeschwächte FK-, Complete-Scope-Check- und Current-Index-
  Definitionen fail-closed PASS;
- Lane-/Gap-/Health-Integration einschließlich unabhängiger Required Grains,
  fehlendem zweiten Instrument, Policy-Supersession, getrennten Exportzählern,
  Null-/Forged-/selbstkonsistent-falsch-scopegebundenen Watermark-Digests,
  gemischter Nullbelegung von Complete-Scope-, Watermark-, Fehler- und
  Reconciliation-Evidenz, read-seitig ungültigem Partial-/Unclosed-/Unstable-
  Complete-Scope, inkompatibler Source/Coverage, verfrühter Completion-Zeit,
  positiver Complete-Scope-Recovery, blockierter nachträglicher Scope-Digest-
  Abweichung, partial/unclosed/out-of-window/wrong-source Reconciliation,
  positiver Exact-Scope-Reconciliation, RLS, Tenant- und Generation-Isolation
  PASS mit `ROLLBACK`;
- bestehende Persistenz-SQL-Integration sowie Claim-, Failure-, Outcome- und
  Page-/Ledger-Races gegen eine Vorlage mit installierter neuer Migration
  erneut PASS;
- `15 files / 258 tests`, TypeScript und Next.js-15.5.21-Produktionsbuild PASS;
- Migrationsmarker/Fingerprint
  `80ca061710ffbde9d4b642fc0e6f75a630e1cf75ac52020b1d9926e21c6ed28a`,
  kanonischer Constraint-Fingerprint
  `27c5f8b9717b3f18ed952a786bc6976377c4fafaaae84306ee31c81a8ecf4caf`
  und unveränderter Index-Fingerprint
  `33ccc380e2cb27d5fe70acdb551f98b2e80355b0fea31c0fea374617b94fc610`
  PASS;
- `git diff --check` PASS, nur erwartete LF→CRLF-Hinweise.

Der folgende dritte Remediation-Snapshot wurde unverändert im vierten
unabhängigen A3/A4/A5-Abschlussreview geprüft:

| Artefakt | SHA-256 |
|---|---|
| `supabase/schema-patch-v57.61.0-g1-lane-authority.sql` | `07ADE2963A68E0AF80C8E607C4E699D34CD98EC86BB861C012BDD6CD22D1970E` |
| `tests/sql/broker-capture-lane-health.integration.sql` | `F2AB1BD6E19323C1759AC91FB6386DA53307288C12A84167A33B80FD919056EB` |
| `tests/sql/run-broker-capture-lane-health.ps1` | `D1F63B880C8567C35BF1F575C3E45DC554F211C2433E0A9B7C801ABF8055D888` |
| `tests/sql-contracts.test.ts` | `E59B755974ADC3101DBA30270957F47EAFDF82B9F19488862C968CB159C32A91` |
| `docs/decisions/EQUORA_v57.61.0_G0_DECISION_SET.md` | `B5AFBD83773F339A283D8F6B742318B975B1A8E7020872DC387AF7862AF0E001` |
| `docs/architecture/EQUORA_v57.61.0_MEXC_PROVIDER_CONTRACT.md` | `8A46B60F97C73A06D1998C267211E9CCBA117784A085D6CBCC811A1094DBA71A` |
| `docs/architecture/EQUORA_v57.61.0_BROKER_IMPORT_LOGICAL_ERD.md` | `569279F9AED619FFF519B67A44F430F5959EC651FE088177F7E4AE9B663B065A` |
| `docs/architecture/EQUORA_v57.61.0_BROKER_IMPORT_TRANSACTION_OPERATIONS_MIGRATION_DESIGN.md` | `7BE1610FE5D01E5714AF8146D3B5E8BB837618BAB7A1D1A90FBFEDB7DC5F8ECF` |

Die finalen hashgebundenen Voten lauten:

- A3: `PASS`, `P0=0`, `P1=0`, `P2=0`, `P3=0`, `8/8` Hashes; Misch-Null-
  Constraints, Complete-Scope-Health-Orakel, normative Präzedenz und
  semantische Driftkontrolle findingfrei;
- A4: `PASS`, `P0=0`, `P1=0`, `P2=0`, `P3=0`, `8/8` Hashes; SQL-
  Dreiwertelogik, Composite-FK, RLS, Grants, `SECURITY DEFINER`, Constraint-/
  Index-Fingerprints sowie fehlende Runtime-/Brokerautorität findingfrei;
- A5: `PASS`, `P0=0`, `P1=0`, `P2=0`, `P3=0`, `8/8` Hashes; beide früheren
  P2-Befunde zu positiven Health-Orakeln und vier normativen Präzedenzblöcken
  geschlossen, Integritätsvertrag findingfrei.

Damit lautet der begrenzte Teildeltastatus `LOCAL_PATCH_AND_COMMIT_READY`.
Diese Reife gilt ausschließlich für die lokale Foundation und schließt keinen
der sechs offenen G1-P1-Blöcke.

### 5.1 Aktuelles Activation-/Mutation-/Request-Authority-Delta

Dieser Abschnitt ersetzt für den aktuellen Arbeitsstand die älteren Aussagen
in 2.4, 2.5 und 5, wonach Activation-Mutation, Supersession, schreibende
Lane-/Gap-/Watermark-/Reconciliation-RPCs und bindende Claim/Page/Request-
Fences noch vollständig offen seien. Die historischen Reviewabschnitte bleiben
als nachvollziehbare Entwicklungsevidenz erhalten.

Neu lokal umgesetzt sind:

- ownergebundene Activation-Commands mit Series-/Activation-CAS,
  dauerhaftem exakt replaybarem Ergebnis und atomarer Generation-1-Foundation
  aus vier Read-only-Requirements und zwölf `not_observed`-Lanes;
- Pause/Resume/Revoke sowie Supersession auf neue Aktivierungs-ID/Generation
  bei geänderten Pins; alte Work Units verlieren durch Pointer-/Lifecycle-
  Fences ihre Autorität, nicht durch vorausgesetztes physisches Cleanup;
- Legacy-/ungebundene aktuelle Activations können nicht in-place pausiert,
  resumed oder revoked werden; nur eine explizite `activate`-Supersession
  erzeugt eine vollständig gebundene neue ID/Generation und konserviert den
  Vorgänger ohne erfundene Authority-Pins als `inactive`;
- NOT-NULL-Policybindung von Scope und Work Unit an Requirement, Lane-State,
  Policygeneration und Authority-Digest sowie Runbindung an einen kanonischen
  Authority-Plan-Digest;
- autorisierte Requirement-, Lane-Success/-Failure-, numerische Watermark-,
  Gap-Open/-Escalation- und exact-scoped Reconciliation-RPCs mit CAS,
  serverseitigen Digests und dauerhaften Mutation-Receipts;
- semantisch idempotente ungelöste Gaps und exakte Replays selbst nach Policy-
  oder Activation-Supersession;
- aus Requirements, Lanes und allen generationsgleichen Gaps neu abgeleitete
  Health als bindende Claim-, Permit-, Page- und Failure-Precondition;
  `capture_health` bleibt ausschließlich Cache;
- persistente, fünf Sekunden gültige Single-use-Request-Autorisierung als
  Credential-/Egress-Linearisation Point. Erst nach erfolgreicher Autorisierung
  folgen öffentlicher Serverzeit-GET, Providerzeitvalidierung, erneute
  Permitfristprüfung, Load der exakt gebundenen Credentialgeneration und
  privater GET; fehlender, bereits abgelaufener oder scopefalscher Permit ergibt
  null Fetch. Läuft der Permit während des bereits autorisierten öffentlichen
  GET ab, bleibt dieser in-flight GET beobachtbar, aber Credentialload und
  privater GET bleiben gesperrt. Page und Failure revalidieren Permit, Current
  Pointer, Lifecycle und Policy ohne Teilwirkung bei Fencefehlern;
- Permit-Health und Fälligkeit werden erst nach der vollständigen Authority-
  Lockkette mit einem frischen `clock_timestamp()` bewertet; eine während des
  Lock-Wartens überfällige Lane erzeugt keinen Permit;
- der erste erfolgreiche v2-Page-Commit schreibt atomar mit sämtlichen v1-
  Page-Wirkungen ein append-once Input-/Result-Receipt auf die Request-
  Autorisierung. Exaktes Replay liefert selbst nach einem Lifecyclewechsel nur
  das gespeicherte Resultat; abweichender Input scheitert ohne Teilwirkung;
- semantische SHA-256-Fingerprints für alle kritischen neuen Constraint- und
  Indexdefinitionen sowie geschlossene RLS-/Grant-/`SECURITY DEFINER`-
  Postflight-Prüfungen;
- eine dedizierte `NOLOGIN NOINHERIT`-Funktionsrolle mit `BYPASSRLS`, ohne
  nutzbare Application-Mitgliedschaft, ohne `CREATE` auf `public`, nur den
  explizit benötigten Tabellen-/Helperrechten und reinem `SELECT` auf den
  beiden unveränderlichen Replay-Outcome-Tabellen. Die Migration normalisiert
  über alle tatsächlichen Grantees auch frühere/default-privilegierte Function-
  und Authoritytabellen-ACLs und verifiziert die vollständige Allowlist mittels
  `aclexplode`; die intern delegierten v1-Claim-/Page-/Failure-Kern-RPCs sind
  darin enthalten. Bestehender Ownerdrift der drei Authoritytabellen wird vor
  jeder Tabellen-DDL fail-closed abgewiesen; gesunde Fresh-/Re-Run-Pfade pinnen
  vor der ACL-Normalisierung `postgres` als Owner und prüfen ihn separat.
  Die drei v1-Kern-RPCs sind separat auf `owner=postgres`, `SECURITY DEFINER`,
  `search_path=''` und 10/15/10 Sekunden gepinnt. Capture-Control-Re-Runs nach
  Activation Authority erkennen den Downstream-Marker und öffnen v1 Claim/
  Failure nicht wieder für `service_role`; nur der interne `NOLOGIN`-Ownerpfad
  bleibt. Vollständig
  qualifizierte `regprocedure`-Signaturen einschließlich Function-Owner,
  `SECURITY DEFINER`, leerem `search_path` und Lock-/Statement-Timeouts bleiben
  ebenfalls Postflight-Invarianten.
- Capture-Control-Claim-Receipt und letzter Work-Unit-Fehler sind durch auf
  jedem Re-Run neu erzeugte boolean-totale CHECKs strikt all-null oder
  vollständig belegt. Die ebenfalls boolean-totale Outcome-Constraint verlangt
  bei `retry_pending` einen leeren und bei `partial_failed|terminal_failed`
  einen nichtleeren erlaubten Terminalgrund. Ein gemeinsamer kanonischer
  Constraintfingerprint und dynamische Negativorakel sichern alle drei
  Definitionen.

Finale lokale Ausführungsevidenz vor dem unabhängigen Hash-Review:

- konsolidierter Fresh-Apply auf einer isolierten lokalen Supabase-
  Plattformfixture nach vollständigem Neuaufbau ihres `public`-Produktschemas
  `schema.sql -> v57.60.1 -> v57.61.0 -> Capture Control -> Lane Authority -> Activation Authority -> Scheduler Control`
  in `equora_scheduler_review_fresh` PASS; unmittelbarer downstream-aware Capture-
  Control-Re-Run bei bereits installiertem Activation-Marker und anschließender
  Activation-Migration-Re-Run PASS. `service_role` blieb dabei auf allen drei
  v1-Kern-RPCs ohne `EXECUTE`, während der dedizierte `NOLOGIN`-Ownerpfad
  erhalten blieb;
- kanonischer SHA-256 der drei boolean-totalen Capture-Control-Claim-/Error-/
  Outcome-Terminalgrund-CHECK-Definitionen
  `346216e2ac304bfc69495dacb75ea7efd01abb4cf3859fd32dd923d073dcd3ba`;
- eingebetteter, über LF-normalisierten Gesamtinhalt selbstgeprüfter
  Activation-Migrationsfingerprint
  `1ef62c79abd8da294db093a455ee8ea6756a00bf757187538c01f5b48b1fa8de`,
  Constraintfingerprint
  `422d191c9a776fb11c27043e400b6401e1500e851185f942b557865929cba379`
  und Indexfingerprint
  `4677767b03b0706b0eb3fbf5761cc48f312ef204b899843662bc661406bdfdcb`;
- serielle Activation-/Policy-/Watermark-/Gap-/Permit-Matrix einschließlich
  boolesch totaler Activation-NULL-Fälle, Legacy-Supersession, numerischer
  Watermark-Evidenzdrift, erfolgreichem v2-Page-Commit, append-once Replay,
  Replay-Inputdrift sowie fehlenden/fremden/abgelaufenen Permits PASS;
  parallele Create/Create-, Supersede/Supersede- und beide
  Pause-vs-Request-Permit-Reihenfolgen sowie Überschreitung von `next_due_at`
  während einer beobachteten Series-Lock-Wartezeit PASS; semantische
  Constraint-/Index-Driftmatrix PASS; ein zusätzlicher nicht privilegierter
  Probe-Grantee verlor beim Re-Run sowohl sein Service-RPC-`EXECUTE`, seine
  drei v1-Kern-RPC-`EXECUTE`-Grants als auch sein Authoritytabellen-`SELECT`.
  Separat wurde ein absichtlich auf diese LOGIN-Rolle driftender Tabellenowner
  vor jeder Tabellen-DDL mit `ACTIVATION_AUTHORITY_TABLE_OWNER_DRIFT`
  abgewiesen. Ein absichtlich driftender v1-Claim-Funktionsowner wurde mit
  `ACTIVATION_AUTHORITY_V1_CORE_CONFIG_DRIFT` abgewiesen. Ein Cross-Layer-
  Oracle belegt zusätzlich, dass `Capture Control` nach vollständigem Stack-
  Apply die v1-Claim-/Failure-Rechte nicht erneut für `service_role` öffnet.
  Damit sind All-Grantee-ACL-Normalisierung, Tabellen-/Funktionsowner-Pinning
  und der downstream-aware Re-Run dynamisch belegt;
- vollständige Broker-Capture-Persistenz- und Lane-Health-/Complete-Scope-/
  Reconciliation-Matrix PASS; Page-, Claim-, Failure- und Outcome-Race-
  Regressionen sowie die Capture-Control-Misch-NULL- und Outcome-Terminalgrund-
  Negativorakel PASS. Die
  v1-Kern-Race-Runner erhalten ihre ansonsten
  entzogenen Rechte ausschließlich in der jeweils kurzlebigen Testdatenbank;
- lokaler PostgREST-v14-Probe: der hoisted 15-Sekunden-`statement_timeout`
  brach mit SQLSTATE `57014` nach `15,03 s` ab;
- Transport-TOCTOU-Orakel PASS: Ablauf des fünf Sekunden gültigen Permits
  während des autorisierten Serverzeit-GET erzeugt exakt diesen einen
  öffentlichen Fetch, aber null Credentialload und null privaten GET;
- TypeScript PASS, Vitest `288/288` in `16/16` Testdateien PASS und optimierter
  Next.js-Produktions-Build PASS.

Die früheren 27-Dateien-Reviews schlossen zunächst boolean-totale Capture-
Control-Constraints, vollständige All-Grantee-Normalisierung, v1-Kern-ACLs und
das separate Tabellenowner-Pinning. Zwei A4-/A5-Reviews wurden dabei korrekt
ohne Votum abgebrochen, nachdem sich vier Manifestdateien während der Prüfung
geändert hatten. Der danach stabil eingefrorene Review ergab drei neue
Abschlussbefunde: A3 `FAIL` mit `P1=1`, weil der öffentliche Serverzeit-GET noch
vor der Single-use-Request-Autorisierung lag; A4 `FAIL` mit `P2=1`, weil Owner,
`SECURITY DEFINER` und Funktions-GUCs der drei v1-Kern-RPCs nicht separat exakt
gepinnt waren; A5 `FAIL` mit `P1=1`, weil ein später isolierter Capture-Control-
Re-Run v1 Claim und Failure wieder an `service_role` gewährte. Der aktuelle
Snapshot schließt diese drei Punkte durch Permit-vor-jedem-Broker-GET,
v1-Kern-Owner-/Config-Postflights und den downstream-aware Capture-Control-
Re-Run einschließlich dynamischer Negativorakel. Deshalb ist jetzt ein neuer
vollständiger A3/A4/A5-Hashreview des unveränderten 27-Dateien-Snapshots
erfolgt: A4 und A5 meldeten `PASS`, A3 jedoch `FAIL` mit `P1=1`, weil ein beim
Start gültiger Permit während des bis zu zwölf Sekunden dauernden Serverzeit-
GET ablaufen und danach vor der nächsten Fristprüfung noch Credentialmaterial
laden konnte. Der aktuelle Snapshot revalidiert die Permitfrist unmittelbar
nach dem Serverzeit-GET und zwingend vor `loadCredentials`; ein dynamischer
Zeitfortschrittstest belegt einen öffentlichen in-flight Fetch, aber null
Credentialload und null privaten GET. Wegen dieser Änderung war wiederum ein
neuer vollständiger A3/A4/A5-Hashreview erforderlich; dieser ist inzwischen
abgeschlossen, siehe Abschnitt 7.

Verbleibende G1-P1-Blöcke sind jetzt konsolidiert:

1. die automatische Runtimeansteuerung des gebundenen Orchestrators; die
   Scheduler-/Work-Unit-Erzeugung, Lease-Renew/Release, Yield-Continuation und
   Restart-Recovery sind lokal implementiert und isoliert belegt;
2. produktiver Credential-Decryptor, Integritäts-/Credential-Key-Lifecycle und
   zusätzliche Provider-/Credential-Suspension-Races unmittelbar gegen Permit;
3. reale, ausdrücklich freizugebende MEXC-Evidenz für Pagination, Retention,
   Rate Limits und Late Arrivals; bis dahin bleibt jede Brokeranfrage gesperrt;
4. kontrollierte Ziel-Supabase-Migration einschließlich Backup/Restore,
   Retention/Erasure, Plattform-RLS/Timeout-Evidenz und Rolloutplan.

Damit bleiben automatische Erfassung im Betrieb, automatischer Journalimport,
verbundene Datenbankänderungen und Deployment weiterhin NO-GO.

## 6. Gateentscheidung

```text
G1 IN PROGRESS – NO-GO
runtime_gate = g1_transport_only
automatic_import = blocked
broker_requests = blocked
local_ephemeral_database_tests = passed
supabase_project_changes = blocked
production_sql = blocked
push = blocked
deployment = blocked
```

## 7. Scheduler-/Lease-Control-Plane: lokale Implementierungsevidenz

Die read-only A3-/A4-/A5-Vorprüfung des nächsten P1-Blocks hat vier
Widersprüche bestätigt, die nicht durch ein oberflächliches Schedulerwrapper-
Delta umgangen werden dürfen:

1. initiale `not_observed`-Lanes besitzen bislang keinen materialisierten
   ersten `next_due_at`, während eine überfällige Fast-Lane am bisherigen
   globalen Health-Fence ihren eigenen Scheduler-/Startup-Catch-up blockiert;
2. ein 7-/28-Tage-Request-Scope bindet derzeit nur einen Tagesbucket;
3. das Work-Unit-Lease besitzt noch keinen vollständigen Renew-/Release-/
   Account-Slot-/Epoch-/Max-Lifetime-Vertrag;
4. `yielded` ist nicht claimbar und besitzt keinen atomaren persistenten
   Successor; Permit ohne Outcome darf beim Restart nicht blind requeued werden.

Der bindende Designfreeze ist jetzt in Decision Set, ERD, Providervertrag und
Operationsdesign festgeschrieben:

- Parent-Request-Scope plus autoritative UTC-Tagesbucket-Childrows (Fast Lane
  1 bis 31 geschlossene Tage; Auditprofile exakt 7 beziehungsweise 28 Tage);
- monotone `due_generation`, initiales `next_due_at=activation_cutover_at` und
  unique Schedule Occurrence ohne `trigger_kind` als Identität;
- lane-spezifischer gemeinsamer Execution-Predicate für die exakt zu heilende
  Read-Lane;
- exact-scoped Work-Unit-Lease plus konservativer eindeutiger Accountslot
  `provider_api_observation`;
- 45 Sekunden Initiallease, maximal drei Renewals und 180 Sekunden absolute
  Laufzeit;
- genau ein Yield-Successor im selben Run sowie
  `recovery_pending/uncertain_egress` für Permit ohne Outcome;
- ausschließlich inaktive lokale Control-Plane ohne Timer, Brokerrequest,
  Credentialdecrypt, Import, Push oder Deployment.

Der Designfreeze ist lokal umgesetzt durch:

- `schema-patch-v57.61.0-g1-scheduler-control.sql` mit Request-Scope-/
  Tagesbucket-Grain, append-once Due Occurrences, kontoweitem Lease-Slot,
  Renew/Release, bounded Recovery und Yield-Successor;
- `broker-capture-scheduler.ts` als providerneutral geschlossener Serveradapter;
- eine Account-Lease-Revalidierung unmittelbar vor Request-Autorisierung,
  Page-Commit und Failure-Commit;
- einen Fresh-Apply-/Rerun-Nachweis der vollständigen lokalen Migrationskette;
- einen SQL-Integrationsrunner für 7-/28-Tage-Raster, exakten Replay,
  Nicht-Verhungern späterer Due-Lanes, Permit-ohne-Outcome,
  Account-Lease-Drift, Recovery und Continuation;
- einen Zwei-Sitzungs-Runner für append-once Materialisierung und genau einen
  Gewinner des kontoweiten Account-/Sync-Kind-Leases.

Lokale Evidenz des aktuellen Snapshots:

- normalisierter Activation-Artefaktfingerprint
  `7634834df971d32afc2fb607a5e546e75ec9761ee3ef17fd01852798d713f432`;
- normalisierter Scheduler-Artefaktfingerprint
  `8c7788d176902a5cced9af5f69af4835f9454590bd2dfcb44bbd291a147aa499`;
- Scheduler-Constraintfingerprint
  `f7fab811f653909220107e1bbe65db72fe14914dce8536e2973d393dcfa08a3a`
  und Scheduler-Indexfingerprint
  `8319c8644b37fc35f99c97c4336850408a487cc98225d591c6ad134690d47d4e`;
- vollständige aktuelle Vitest-Suite `16/16` Dateien und `315/315` Tests PASS;
- TypeScript `tsc --noEmit` PASS und optimierter Next.js-15.5.21-
  Produktionsbuild PASS;
- vollständige lokale Fresh-Apply-Kette PASS;
- Scheduler-/Lease-Integration PASS, Scheduler-Race-Runner PASS und
  Populate→Activation-Rerun→Capture-Rerun→Scheduler-Rerun mit effektivem
  RPC-ACL-Endzustand `f|f|f|t|t|t` PASS;
- semantischer Scheduler-Constraint-/Index-Driftrunner PASS;
- capabilityspezifische Scheduler-Matrix PASS: Orders und Executions werden
  mit exakt fünf Scopefeldern ohne `positionType`, Positionen und Funding mit
  exakt sechs Scopefeldern und `positionType=1|2` materialisiert; alle vier
  Work Units passieren den produktiven Claim-/Checkpoint-MAC-Vertrag,
  Positionen und Funding zusätzlich den Request-Permit-Vertrag. Die
  positiv formulierte, mit `IS DISTINCT FROM TRUE` boolean-totale Gegenmatrix
  weist Positions/Funding mit `none` sowie Orders/Executions mit `1|2` jeweils
  als `SCHEDULER_AUTHORITY_BLOCKED` ab; vor und nach jedem Fall bleiben
  Materialization-Command, Run, Scope, Buckets, Work Unit, Occurrence,
  Lane-Input und Account-Lease unverändert;
- positiver Page-`continue`-Pfad über Page-v2/v1 PASS: 20 Read-only-Raw-Events,
  append-once Page-Receipt und atomare Work-Unit-/Account-Lease-Spiegelung von
  Row-Version 2 auf 3; die nächste Request-Autorisierung auf Version 3 PASS;
- bounded Recovery unterscheidet kein Permit (`pending`), persistierten
  Page-Receipt (`outcomeDerivedCount`) und Permit ohne Outcome
  (`recovery_pending/uncertain_egress`); serielle und parallele Replay-Orakel
  PASS;
- Zwei-Sitzungs-Page-v2-Replay PASS: Ein exakter Replay wurde bei
  `terminal_observed` und `loop_blocked` nachweislich am Work-Unit-Lock des
  Erstschreibers blockiert und lieferte danach dasselbe append-once Receipt;
  jeder Race persistierte exakt eine Page-Wirkung, abweichender Input scheiterte
  ohne Zustandsänderung;
- der TypeScript-Datenbankfehlervertrag ist eine geschlossene, aus einer
  kanonischen Liste abgeleitete Allowlist von exakt 34 produktiven Scheduler-,
  Lease-, Continuation- und Recovery-Codes; unbekannte Codes werden zu
  `database_error`, und rohe Datenbankmeldungen werden nicht reflektiert;
- auch Page-Persistenz sowie Claim-/Permit-/Failure-Control leiten ihre
  jeweiligen TypeScript-Typen und Runtime-Sets aus je einer kanonischen
  Allowlist ab. Ein bidirektionales statisches Orakel extrahiert alle direkt
  erreichbaren v1-/v2-RPC-Codes sowie exakt die zwei erreichbaren
  `SCHEDULER_PARENT_*`-Timeouts und verlangt Mengengleichheit; unbekannte
  Namespace-Codes bleiben generisch `database_error`, alle öffentlichen
  Meldungen bleiben sanitisiert;
- geschlossene TypeScript-Negativorakel verwerfen inkonsistente
  Materialization-, Lease-, Continuation- und Recovery-Resultatgruppen.

Die Evidenz ist ausschließlich lokal und synthetisch. Der technische Freeze mit
Manifest-SHA-256
`BEDA3BC025E00B5AA3F7A1ED9F5064BC3D030A7C44E01B8F5CFA6AAFA9B26E8A`
wurde vollständig und unabhängig geprüft. A3 (QA), A4 (Security/Authority) und
A5 (Integrität/Vertragskohärenz) votierten jeweils `PASS` mit
`P0=0`, `P1=0`, `P2=0`, `P3=0`; Initial- und Schlussrehash ergaben jeweils
`37/37` passende Artefakthashes und exakt `38` Git-Scopepfade
(37 Artefakte plus Manifest). Die anschließende Statusaktualisierung ist ein
reines Evidenzdelta ohne Code-, SQL- oder Teständerung und wird durch einen
erneuten vollständigen Hashabgleich plus A3-/A4-/A5-Attest gebunden.

Das lokale Teildelta ist damit implementiert, validiert und review-abgeschlossen.
Das Gesamtgate bleibt unverändert:

```text
G1 IN PROGRESS – NO-GO
scheduler_control_plane = local_implemented_validation_review_pass
automatic_runtime = blocked
broker_requests = blocked
supabase_project_changes = blocked
production_sql = blocked
push = blocked
deployment = blocked
```

## 8. Historischer erster Deployment-Kandidat nach dem technischen BEDA-Freeze

Dieser Abschnitt dokumentiert den inzwischen verworfenen ersten
Deployment-Kandidaten und seine damalige Evidenz. Er ist keine aktuelle
Freigabe- oder Betriebsanweisung; maßgeblich sind die Remediation in Abschnitt
9 und der jeweils neueste hashgebundene Reviewabschnitt.

Auf ausdrücklichen Nutzerauftrag wurde nach dem vollständig geprüften
Scheduler-Freeze ein davon getrenntes Deploymentdelta umgesetzt. Der
BEDA-/23DAD-Review bleibt historische Evidenz für seinen exakten Scope; er ist
kein unabhängiger Review des nachfolgenden Deploymentdeltas.

Das Delta ergänzt:

- einen versionierten AES-256-GCM-Broker-Keyring und einen getrennten
  HMAC-Identity-Key mit aktivem Buffer-Cleanup;
- die Runtimezustände `off|probe|capture`, unbekannt oder fehlend immer `off`;
- einen ausschließlich nutzerinitiierbaren GET-only Capability-Probe vor dem
  atomaren Connection-Setup;
- secret-freies Setup-Intent, service-only Foundation-Apply, begrenzten
  serverlosen Capturezyklus und Recovery terminaler, noch nicht finalisierter
  Scopes ohne neuen Brokerrequest;
- einen atomaren audit-erhaltenden Widerruf mit Credential-Tombstone;
- einen geschützten Vercel-Endpunkt, ein default-off `vercel.json` und ein erst
  nach Betreiberfreigabe zu aktivierendes Fünf-Minuten-Pro-Cronbeispiel;
- read-only Preflight, den damals noch als resumierbar entworfenen
  Sechs-Migrations-Treiber,
  exakten Postflight sowie Installations-, Rollback- und Betriebsdokumentation.

Aktuelle lokale Evidenz:

- TypeScript `tsc --noEmit` PASS;
- vollständige Vitest-Suite `18/18` Dateien und `328/328` Tests PASS;
- Release-Check PASS und optimierter Next.js-15.5.21-Produktionsbuild PASS;
- Lane-Health-, Activation-, Claim-, Failure-, Outcome-, Capture-, Scheduler-,
  Lease- und Page-Replay-Integrations-/Race-Runner PASS;
- Activation- und Scheduler-Constraint-/Index-/ACL-Driftrunner PASS;
- Runtime-Deployment Fresh-Apply und Re-Run PASS, einschließlich atomarer
  Ein-Symbol-Foundation mit 6 Requirements/18 Lanes, exaktem Apply-Replay,
  null automatischer Scope-/Work-Unit-Wirkung, atomarem Widerruf und Entfernung
  absichtlich eingeschleuster Fremdrollen-Grants;
- echter lokaler `psql`-Pfad von sauber rekonstruierter v57.60.1-Baseline über
  alle sechs Migrationen bis zum Postflight PASS, Tradecount unverändert `0`;
- damals behaupteter Resume nach exakt drei von sechs Migrationen PASS;
  vollständiger erneuter
  Treiberlauf überspringt exakt markierte Schichten; falscher Markerfingerprint,
  falsche Preflight-Baseline und falscher Postflight-Fingerprint enden jeweils
  fail-closed mit Nichtnull-Prozessstatus;
- kein schreibender MEXC-Transportpfad, genau ein zentraler `fetch` im
  fest verdrahteten GET-only Transport und keine SQL-Cron-/Netzwerkaktivierung.

Der lokale Ergebnisstatus lautet:

```text
deployment_candidate_delta = local_validation_pass_independent_review_pending
default_off_application_deployability = prepared_not_executed
automatic_runtime = default_off_not_released
real_mexc_probe = not_executed
supabase_staging_backup_restore_migration = not_executed
automatic_journal_import = not_implemented_not_authorized
trading_order_cancel_close_transfer_withdrawal = structurally_absent
production_sql = blocked
push = blocked
deployment = blocked
```

Der neue lokale Hashfreeze wird separat in
`EQUORA_v57.61.0_DEPLOYMENT_CANDIDATE_MANIFEST.sha256` gebunden. Sein
unabhängiger A3-/A4-/A5-Review ist vor jeder externen Freigabe erforderlich.
Danach bleiben Backup und Restore im separaten Supabase-Stagingprojekt,
Stagingmigration/RLS-/RPC-/Secret-Canary, der ausdrücklich freizugebende echte
MEXC-Read-only-Probe sowie eigene Go-Entscheidungen für Vercel-Deployment und
Capture-Cron zwingend. Automatischer Journalimport ist eine spätere, separate
Produktfunktion und wird durch dieses Delta nicht aktiviert.

## 9. Remediation des ersten Deployment-Manifests

Der erste unabhängige A3-/A4-/A5-Review des Deployment-Manifests endete
korrekt mit `FAIL`. Die Befunde wurden nicht als Restrisiko akzeptiert, sondern
lokal remediated. Der neue Kandidat enthält insbesondere:

- Crash-durable Wiederaufnahme lease-freier `yielded`-Work-Units sowie eine
  gebundene, verzögerte und outcome-sichere Auflösung von
  `recovery_pending/uncertain_egress`; bereits fortgesetzte Vorgänger werden
  nicht erneut gefunden, und eine neue Request-ID konvergiert append-only auf
  denselben vorhandenen Successor;
- 300 Sekunden Plattform-, 240 Sekunden Cycle- und 210 Sekunden Egressbudget;
- exakt ein aktiviertes, nach Setup atomar an den erzeugten Broker-Account
  gebundenes Runtime-Enrollment mit maximal fünf Symbolen; Finder,
  Materialize, Claim, Continuation, Request-Permit, Materialload und
  Finalisierung revalidieren diese Bindung an ihren jeweiligen
  Authority-Grenzen;
- getrennte Nutzerattestierung und capabilitygenaue, oracle-validierte
  GET-Leseevidenz ohne den unzulässigen technischen Claim, zusätzliche
  MEXC-Rechte erkennen zu können; Probe-Evidenz bleibt bewusst transient und
  ist keine persistierte spätere Request-Authority;
- PostgreSQL-16-Hardgate vor DDL, vollständigen semantischen v57.60.1-
  Baselinefingerprint einschließlich funktionaler Trigger, exakten globalen
  Sechs-Layer-Postflight einschließlich Rollenattributen, Membership und
  Schema-CREATE-Rechten sowie dynamische Marker-Skip-Driftorakel für Spalten,
  ACLs, Funktions-GUCs, Credentials, Trigger und Authority-Rolle; ein Teilstand
  mit ein bis fünf Markern ist Restore-only;
- relationale Composite-FKs und führende FK-Indizes für
  Finalization-Receipts, exakte Runtime-Tabellen-/Funktionsverträge und
  geschlossene All-Grantee-ACL-Normalisierung;
- eine ehrliche UI-/Preview-Semantik, inaktive Auslieferung ohne Cron sowie den
  ausdrücklichen Ausschluss des obsoleten Force-Push-Handoffs aus dem ZIP.

Aktuelle lokale Revalidierung des remediated Kandidaten:

- `tsc --noEmit` PASS;
- Vitest `21/21` Dateien, `353/353` Tests PASS;
- Next.js 15.5.21 Produktionsbuild PASS;
- vollständige SQL-/Concurrency-/Driftmatrix PASS, einschließlich Fresh Apply,
  exaktem Re-run aller sechs Layer, Activation-/Claim-/Capture-/Failure-/
  Outcome-/Page-/Scheduler-Races, Lane-Health, Scheduler-/Runtime-Integration,
  semantischer Baseline-/Marker-/ACL-/GUC-/Constraint-/Indexdrift, dynamischem
  internen FK-/Constraint-Triggerdrift und echtem PostgREST-v14.15-Timeout nach
  15,01 Sekunden;
- echte Zwei-Sitzungs-Orakel für parallele erste Connection-Setup-Requests
  (exakt ein secret-freier Probe-Slot-Gewinner), Enrollment-Disable gegen
  Claim und in einem echten Zwei-Sitzungs-Race gegen Continuation sowie
  fail-closed Enrollment-Gates vor Materialize, Continuation, Permit,
  Materialload und Finalisierung; jeder Ablehnungspfad bleibt ohne Work-Unit-,
  Lease-, Permit-, Nachfolger-, Receipt- oder Brokerrequest-Wirkung;
- Runtime-Cycle-Orakel belegen Lease-Renew vor dem nächsten Permit,
  Multi-Page-Continue, `yielded`-Continuation, kooperative Drei-Seiten-
  Freigabe sowie Lease-Cleanup bei unbekanntem Checkpoint und unerwartetem
  Fehler; ein Cleanupfehler maskiert den ursprünglichen Fehler nicht;
- normalisierte Migrationsfingerprints: Activation
  `ef73a48fb05299c4e78908fd1771c61ca1b8241b629cf31bc7f89af594d66c2c`,
  Scheduler
  `aeedbbc1861fcd7282ce05c92c0be09fd6d84c31aaadb0b8be00945310bb97fe`
  und Runtime
  `e78049f738ed26d4ab96188f4da1c52ae00a2b3583db5aeaf4be608cdcc95457`;
- globaler Skip-/Postflightvertrag PASS für Spalten, Constraints, Indizes,
  Relation/RLS/Policies/All-Grantee-ACL, Funktionen/Owner/GUC/EXECUTE-ACL,
  funktionale Trigger, interne FK-/Constraint-Triggerzustände sowie Authority-
  Rollenattribute/Membership und exakte All-Grantee-Schema-ACLs für `public`,
  `equora_private` und `auth`; der
  v57.60.1-Baselinehash lautet
  `b488ddcd54f83d1960d97654937535804e65d9d85787467dd3aee379d17f8703`,
  der globale Relation-/RLS-/Policy-/ACL-Hash
  `c50d852586bb6934b3465c1ad82707cd75158d4c760f2366a19263dc4af7624f`;
- Release-Check PASS; der ZIP-Builder erzwingt kanonische `/`-Entry-Namen,
  gleicht Central Directory und Dateimanifest ab, extrahiert und prüft den
  Inhalt erneut. Kein schreibender MEXC-Transport, kein SQL-Netzwerk, kein
  ausgelieferter Cron und kein Journal-Trade-Importpfad.

Der aus diesem Stand erzeugte neue Hashfreeze ersetzt das frühere
fehlgeschlagene Deployment-Manifest. Bis A3, A4 und A5 genau diesen neuen
Freeze unabhängig und findingfrei geprüft haben, gilt:

```text
deployment_candidate_delta = local_validation_pass_independent_re_review_pending
default_off_application_deployability = locally_prepared_not_released
automatic_runtime = default_off_not_released
broker_requests = blocked
real_mexc_probe = blocked
supabase_staging_or_production_changes = blocked
automatic_journal_import = not_implemented_not_authorized
trading_order_cancel_close_transfer_withdrawal = structurally_absent
production_sql = blocked
push = blocked
deployment = blocked
```

## 10. Remediation des unabhängigen 84-Artefakt-Deployment-Reviews

Der unabhängige Review des nach Abschnitt 9 erzeugten 84-Artefakt-Freeze hat
den Kandidaten erneut korrekt mit `FAIL` verworfen. Maßgeblich waren zwei
produktive P1-Befunde: Der SQL-/TypeScript-Continuation-Vertrag begrenzte einen
laut Providerprofil auf 20 Work Units und 100 Pages ausgelegten Request-Scope
noch auf acht Work Units, und der Fresh-Preflight bewies die für
`BYPASSRLS`-/Owner-Erzeugung notwendige Executorautorität sowie fremde
Default-ACLs nicht vollständig vor der ersten DDL. Dieser Freeze und sein ZIP
sind keine Freigabeartefakte.

Der aktuelle lokale Stand schließt diese Befunde und die zugehörigen
Reviewhärtungen:

- SQL und TypeScript verwenden denselben gepinnten Scopevertrag von 20 Work
  Units und 100 Pages. Ein dynamisches PostgreSQL-Orakel belegt Sequenz 19→20,
  Sequenz 20→keinen Successor, `partial_failed/scope_budget_exhausted` und
  exaktes Replay ohne zweite Wirkung;
- der unmittelbare Runtimepfad wertet das Continuation-Ergebnis aus und meldet
  `SCOPE_BUDGET_EXHAUSTED` genauso wie der Restartpfad, statt fälschlich
  `captured` zurückzugeben;
- fachlich fehlgeschlagene Cron-Cycles liefern bei technisch vollständig
  abgeschlossenem Handler HTTP 200 mit `ok=false`,
  `code=capture_domain_failed` und sanitisiertem `failureCode`; unerwartete
  Ausnahmen bleiben HTTP 500;
- der Fresh-Preflight akzeptiert nur PostgreSQL 16+, einen direkten
  `postgres`-Executor mit `CREATEROLE` und `BYPASSRLS` oder einen echten
  Superuser sowie ausschließlich die geschlossene nicht-grantable
  Supabase-Default-ACL-Allowlist. Dynamische Negativorakel blockieren eine
  unzulässige Executorrolle und einen fremden Default-ACL-Grantee vor DDL;
- das Enrollment-Disable-vs-Continuation-Orakel verwendet benannte Sessions
  und bestätigt den echten Lock-Wait über `pg_locks.waitstart`, nicht mehr nur
  über Startzeitabstände;
- der Broker-Snapshot startet die unabhängige Secure-Store-Bereitschaftsabfrage
  parallel zu den übrigen Reads. Identity-Keyversionen werden vor dem Decode
  verworfen; AES-Keyring und Plaintextbuffer liegen ab der ersten potenziell
  fehlschlagenden Operation innerhalb des garantierten Cleanupbereichs.

Aktuelle lokale Revalidierung dieses noch nicht eingefrorenen Stands:

- TypeScript `tsc --noEmit` PASS;
- Vitest `22/22` Dateien und `365/365` Tests PASS;
- optimierter Next.js-15.5.21-Produktionsbuild PASS;
- Release-Check PASS;
- vollständige lokale SQL-/Concurrency-/Driftmatrix PASS: Fresh Apply,
  exakter Sechs-Layer-Re-run, alle Activation-/Lane-/Claim-/Capture-/Failure-/
  Outcome-/Page-/Scheduler-/Runtime-Orakel, semantische Constraint-/Index-/
  ACL-/GUC-/Marker-/Triggerdrift, interner FK-/Constraint-Triggerdrift und
  echter PostgREST-v14.15-Timeout nach 15,02 Sekunden;
- normalisierter Scheduler-Artefaktfingerprint
  `aeedbbc1861fcd7282ce05c92c0be09fd6d84c31aaadb0b8be00945310bb97fe`;
- globaler Funktionsvertrag
  `c43253a5e6e24029bc90c812100ddcd7e5c2fa7773d420dce56f6e8f63738c8b`.

Aus diesem exakten Stand wurden das allowlistbasierte Releasepaket mit 360
kanonischen Dateien und SHA-256
`e51d0f80a67acd598c7a3344611bed463a2166b16938013bd7ca1cc83fce3f46`
sowie ein neues Deploymentmanifest mit 85 Artefakten erzeugt. Die expandierte
Git-Scopegrenze umfasst exakt 89 Pfade: 85 Manifestartefakte, das Manifest und
drei Release-Sidecars. Ein unabhängiger A3-/A4-/A5-Re-Review genau dieses
Freeze steht noch aus. Bis zu einem findingfreien Votum gilt weiterhin:

```text
deployment_candidate_delta = local_validation_pass_independent_re_review_pending
default_off_application_deployability = locally_prepared_not_released
automatic_runtime = default_off_not_released
broker_requests = blocked
real_mexc_probe = blocked
supabase_staging_or_production_changes = blocked
automatic_journal_import = not_implemented_not_authorized
trading_order_cancel_close_transfer_withdrawal = structurally_absent
production_sql = blocked
push = blocked
deployment = blocked
```

## 11. Remediation des unabhängigen 85-Artefakt-Deployment-Reviews

Der unabhängige A3-/A4-/A5-Review des in Abschnitt 10 beschriebenen
85-Artefakt-Freezes hat diesen Kandidaten findinggebunden verworfen. Der Freeze
mit Manifest-SHA-256
`74a804eb08be35799e141eb0a4c7519769a5ef900313cdc65cf8d53dcee9ad37`
und ZIP-SHA-256
`e51d0f80a67acd598c7a3344611bed463a2166b16938013bd7ca1cc83fce3f46`
ist kein Freigabeartefakt. Die belastbaren Befunde waren:

- A3 P1: Der SQL-Cross-Request-Continuation-Pfad lieferte
  `crossRequestReplay=true`, während der geschlossene TypeScript-Decoder dieses
  Feld nicht akzeptierte;
- A3 P2: Der Decoder ließ die unmögliche `continuationGeneration=20` zu, obwohl
  Work-Unit-Sequenz 1 mit Generation 0 beginnt und Sequenz 20 daher Generation
  19 besitzt;
- A4/A5 P1: Der Preflight erlaubte `PUBLIC` pauschal als Default-ACL-Grantee und
  blockierte dadurch `PUBLIC SELECT ON TABLES` nicht vor dem ersten separat
  commitenden Migrationslayer.

Der aktuelle lokale Stand schließt diese drei Befunde:

- jedes Continuation-Ergebnis besitzt jetzt die obligatorische boolesche
  `crossRequestReplay`-Eigenschaft; Erstpfad und `scope_exhausted` liefern
  `false`, nur die Konvergenz einer neuen Request-ID auf einen vorhandenen
  Successor liefert `true`. SQL-Orakel und TypeScript-Adaptertest binden beide
  Ausprägungen;
- der TypeScript-Decoder begrenzt `continuationGeneration` auf
  `maxWorkUnitsPerScope - 1`, aktuell exakt 19. Generation 19 wird positiv,
  Generation 20 negativ geprüft;
- der Preflight toleriert `PUBLIC` ausschließlich für nicht-grantable
  `EXECUTE` auf Funktionen. Ein dynamischer Mutant mit
  `ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES TO PUBLIC` endet mit
  `PREFLIGHT_DEFAULT_ACL_INVALID`, bevor `equora_private.schema_migrations`
  angelegt werden kann; der bestehende Fremdrollen-Mutant bleibt erhalten.

Die semantischen Verträge wurden entsprechend neu gebunden:

- normalisierter Scheduler-Fingerprint
  `87158546782b900817d3f36501a2e43b5619906a2f07636d0cb1167b042e5ab7`;
- globaler Funktionsvertrag
  `ceb0d9f999b196c35fc43a8346edcf727a0505d15b5b1f88d175b93a00d2a2a5`.

Aktuelle lokale Revalidierung des remediated, noch neu einzufrierenden Stands:

- TypeScript `tsc --noEmit` PASS;
- Vitest `22/22` Dateien und `367/367` Tests PASS;
- optimierter Next.js-15.5.21-Produktionsbuild PASS;
- Release-Check PASS;
- Fresh Apply und exakter Sechs-Layer-Re-run PASS;
- vollständige lokale SQL-/Concurrency-/Driftmatrix in 232,9 Sekunden PASS,
  einschließlich Activation/Lane/Claim/Page/Failure/Outcome, Scheduler,
  Runtime, echter Zwei-Sitzungs-Races, Marker-/ACL-/GUC-/Constraint-/Index-/
  Triggerdrift, internem FK-/Constraint-Triggerdrift und echtem
  PostgREST-v14.15-Timeout nach 15,01 Sekunden;
- die Deployment-Driftmatrix belegt sowohl den fremden Default-ACL-Grantee als
  auch `PUBLIC SELECT ON TABLES` fail-closed vor DDL.

Der vorherige Review ist durch dieses Delta ungültig. Aus dem revalidierten
Stand wurde ein neues allowlistbasiertes Releasepaket mit 360 kanonischen
Dateien und SHA-256
`f897b8db9a1836a3a54749a7cf09804d80b9b15db8229233d80d331c00ae69bd`
erzeugt und extrahiert/inhaltsverglichen. Der neue Deployment-Freeze bindet
weiterhin exakt 85 Manifestartefakte; die expandierte Git-Scopegrenze umfasst
85 Artefakte, das Manifest und drei Release-Sidecars, also 89 Pfade. Bis A3, A4
und A5 genau diesen neuen Hashstand findingfrei geprüft haben, gilt:

```text
deployment_candidate_delta = local_validation_pass_independent_re_review_pending
default_off_application_deployability = locally_prepared_not_released
automatic_runtime = default_off_not_released
broker_requests = blocked
real_mexc_probe = blocked
supabase_staging_or_production_changes = blocked
automatic_journal_import = not_implemented_not_authorized
trading_order_cancel_close_transfer_withdrawal = structurally_absent
production_sql = blocked
push = blocked
deployment = blocked
```

## 12. Schließung des P3-Testfixture-Befunds aus dem 85-Artefakt-Re-Review

Der unabhängige Review des in Abschnitt 11 beschriebenen Freezes mit
Manifest-SHA-256
`ac99bc81dd3d1c68bbab41eb1f14945714e28b3ef7130036b52f14f994a4e3ee`
bestätigte die produktiven Verträge findingfrei auf P0/P1/P2-Ebene. A4 votierte
`PASS` mit P0=P1=P2=P3=0. A3 und A5 votierten `PASS` mit jeweils demselben
nicht produktiven P3-Testhygienebefund: Vier untypisierte Runtime-
Continuation-Mocks bildeten den inzwischen obligatorischen
`crossRequestReplay`-Vertrag nicht vollständig ab; ein Mock verwendete weiterhin
die unmögliche Generation 20.

Der aktuelle lokale Stand schließt auch diesen P3:

- `tests/mexc-capture-runtime.test.ts` verwendet einen auf
  `BrokerCaptureYieldContinuationResult` typisierten Fixture-Builder;
- alle vier Runtime-Mocks besitzen dadurch exakt die neun Pflichtfelder,
  einschließlich `crossRequestReplay=false`;
- der unmittelbare `scope_exhausted`-Mock verwendet Generation 19;
- fehlende Pflichtfelder oder künftige Typdrift scheitern jetzt bereits im
  Typecheck.

Revalidierung dieses reinen Testfixture-Deltas:

- gezielte Runtime-/Scheduler-/SQL-Vertragssuite `71/71` PASS;
- TypeScript `tsc --noEmit` PASS;
- vollständige Vitest-Suite `22/22` Dateien und `367/367` Tests PASS;
- Release-Check PASS.

Produktionscode, SQL, Fingerprints, Runtimegrenzen und externe Autoritäten
wurden in diesem Schlussdelta nicht geändert; die in Abschnitt 11 ausgewiesene
vollständige SQL-Matrix bleibt byteidentisch anwendbar. Das neu erzeugte,
extrahiert und inhaltsverglichen geprüfte Releasepaket enthält 360 kanonische
Dateien und besitzt SHA-256
`379f81d82230e800ad089c3143544216447d2503811b914cbbee6e02929dbe13`.
Der Schlussfreeze bindet erneut 85 Manifestartefakte und eine expandierte
89-Pfad-Git-Scopegrenze. Bis A3, A4 und A5 genau diesen letzten Hashstand erneut
findingfrei attestiert haben, gilt:

```text
deployment_candidate_delta = p3_closed_independent_re_review_pending
default_off_application_deployability = locally_prepared_not_released
automatic_runtime = default_off_not_released
broker_requests = blocked
real_mexc_probe = blocked
supabase_staging_or_production_changes = blocked
automatic_journal_import = not_implemented_not_authorized
trading_order_cancel_close_transfer_withdrawal = structurally_absent
production_sql = blocked
push = blocked
deployment = blocked
```

## 13. Findingfreie lokale Schlussabnahme des Deployment-Freezes

Der technische Schlussfreeze mit Manifest-SHA-256
`8437356f400e55b8e7f72a326d9bae42baa1a738f17f6f8780b7c30eb65c96b0`,
85/85 Artefakten, exakt 89 Git-Scopepfaden und Release-ZIP-SHA-256
`379f81d82230e800ad089c3143544216447d2503811b914cbbee6e02929dbe13`
wurde unabhängig und mit stabilem Eingangs-/Schlussrehash geprüft:

- A3 QA/Runtime/UI/Package: `PASS`, P0=P1=P2=P3=0;
- A4 Security/Authority/Postgres/Vercel: `PASS`, P0=P1=P2=P3=0;
- A5 Integrity/Migration/Package: `PASS`, P0=P1=P2=P3=0.

Damit ist der lokale, default-off Deployment-Kandidat findingfrei vorbereitet.
Dieser Abschnitt ist ausschließlich ein append-only Dokumentationsattest des
bereits geprüften technischen Freezes. Er ändert weder Produktcode noch SQL,
Migrationsfingerprints, Testartefakte oder ZIP-Inhalt. Die danach aktualisierte
Manifestzeile des Statusdokuments benötigt lediglich ein abschließendes
Dokumentations-/Hashattest; sie ist keine neue technische Freigabefläche.

Die lokale Schlussabnahme hebt kein externes Gate auf. Insbesondere erzeugt ein
default-off Deployment weder Brokerrequests noch automatischen Journalimport.
Backup/Restore, Stagingmigration, RLS-/RPC-/Secret-Canaries, echter
MEXC-Read-only-Probe, Git-Push, Vercel-Deployment und eine spätere
Capture-/Cronaktivierung benötigen weiterhin jeweils eine ausdrückliche
Freigabe.

```text
deployment_candidate_delta = local_review_pass_default_off
automatic_runtime = default_off_not_released
broker_requests = blocked
real_mexc_probe = blocked
supabase_staging_or_production_changes = blocked
automatic_journal_import = not_implemented_not_authorized
trading_order_cancel_close_transfer_withdrawal = structurally_absent
production_sql = blocked
push = blocked
deployment = blocked
```

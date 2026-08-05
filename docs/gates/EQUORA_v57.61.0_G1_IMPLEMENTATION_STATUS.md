# Equora v57.61.0 – G1 Implementation Status

Stand: 2026-08-05
Branch: `feature/mexc-import-v57.61.0`
Baseline-Commit: `392addfaf32b6eba9ba1e34cef6fe65ce1ab944a`
Gate: `G1 IN PROGRESS – NO-GO`

## 1. Scope dieses Deltas

Dieses Delta implementiert ausschließlich den ersten fail-closed G1-
Sicherheitsblock für den MEXC-Read-only-Connector und einen nichtdestruktiven
Statistikscope für Strategietests.

Nicht autorisiert und nicht ausgeführt wurden:

- MEXC-Live-Requests oder erneute Credentialverwendung;
- automatischer Journalimport;
- Broker- oder Journal-Datenbankänderungen;
- Produktions-SQL oder Migrationen;
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
  Credentialloader; die private Signaturzeit stammt ausschließlich aus dem
  unmittelbar validierten Providerzeitpfad;
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
Noch nicht umgesetzt sind die automatische Runtimeansteuerung unter einer
gültigen Aktivierung, ownergebundene atomare Checkpointpersistenz,
HMAC-Key-Referenz/-Rotation, reale Provider-Paginationsevidenz und
Produktionskalibrierung des Budgetprofils. Der Kern bleibt lokale
State-Machine-Evidenz, kein Runtime-GO.

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

Nicht als vollständig implementiert gelten die beiden HMAC-Purpose-/Keyring-
Pfade, Persistenz-/Postgres-Parität sowie die Golden-Vektoren der späteren
Normalisierungs-, Candidate-, Approval- und Importdomains. Diese bleiben ihren
Folgegates zugeordnet.

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
synthetisch und mit lokaler Single-use-Semantik belegt. Nicht implementiert sind
persistente Tabellen/Constraints/RLS, vollständige Raw-Response-Aufbewahrung,
Retention/Erasure, echte Account-HMAC-Erzeugung und Key-Lifecycle,
ownergebundenes DB-CAS oder restartfähige Wire-Provenienz. Die deklarierte
Credentialloaderbindung ersetzt weder eine opaque persistente
Credentialreferenz noch die Current-Generation-Revalidation; Aktivierungs-ID,
Accountidentität und Request-Result-Referenz sind noch nicht gegen eine
persistente Autorität geprüft. Daraus entsteht weder Persistence- noch Runtime-GO.

### 2.3 Optionale spätere WebSocketquelle

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
| Vollständige Vitest-Suite | `14 files / 228 tests passed` |
| TypeScript | `tsc --noEmit` PASS |
| Next.js Production Build | PASS, Next.js `15.5.21` |
| Transport-Negativtests | unbekannte Capability/Query, Injection, Legacy-Positionsalias, ungültige Position-ID/-Type, Redirect 301/302/303/307/308, Redirectfehler, Same-Host-Fremdpfad, Subdomain, Fremdport, HTTP-Downgrade, Fremdhost, ungültige Providerzeit, komprimierter/übergroßer/falsch deklarierter Body, Exact-Limit, Chunked/Missing-Length, sämtliche dokumentierten Providerfehler, mixed Items, unbestätigte Pageform und fehlende Provider-ID blockiert |
| Lossless-JSON-/Capabilityoracles | große unquoted Provider-ID und Decimal-/Exponentlexeme exakt erhalten; Provider-Lookalikes können interne Zahlentokens nicht fälschen; Duplicate Keys einschließlich escaped Kollision, ungültige Unicode-Surrogate, Nonstandardzahlen, 64/65-Tiefengrenze, Node-/Zahlbudgetüberschreitung, unbekannte Capability, capabilityfremder Scope, fehlende Pflichtfelder, unbekannte Enums, Scope-/Symbol-/Position-Type-/Orderingverletzungen und inkonsistente Fundingpage blockiert; kanonische leere Fundingpage bleibt valide aber ohne Authority; unbekannte Zusatzfelder nur raw erhalten |
| Credential-/Requestzähler | invalid Query: null Fetch und null Credentialzugriff; invalid Providerzeit: null Credentialzugriff und null private Requests; private Work Unit lädt Credentials nach vollständiger Validierung genau einmal; Capture Binding ohne gebundenen Loaderkontext sowie isolierte Abweichungen bei Account-HMAC-Referenz, Brokerkonto, Aktivierungs-ID oder Aktivierungsgeneration werden vor dem privaten Request blockiert |
| Capability-Teilfehler | erfolgreicher Orders-Read plus rate-limited Execution-Read ergibt ein `wire_succeeded`- und ein `failed`-Outcome; der Previewadapter bricht sichtbar ab; kein `[]`-Ersatz und kein profilweiter Erfolgsclaim |
| Pagination-/Checkpointkern | `20/20` Fixtures: HMAC-/Budget-/Scopebindung, unbekannte Felder und Manipulation, Work-Unit-/Scopegrenzen, drei Work Units plus JSON-Restart, atomarer Budgetüberlauf, Error-Body-Bytebudget, wiederholter Cursor bei geändertem Body, Providerzeitregression, bewusst als spätere Raw-Observation akzeptierter Cross-Page-ID-Overlap, Page-10000-Grenze, Fundingterminalität ohne Authority, Positionsblockade, Retry-not-before, Retryerschöpfung, Maintenance und nicht retrybare Fehler |
| `equora-tcj-v1` | `14/14` Fixtures: normative Tags, volle U+0000–U+001F-Escapematrix, unescaped Slash/U+2028/U+2029, NFC, ASCII-/Non-ASCII-UTF-8-Key- und vollständige Set-Bytesortierung, Duplicate-/Surrogate-/Lookalike-/Brand-Copy-Rejection, 64/65-Containergrenze, exakte 100.000/100.001-Node- und 8-MiB/Plus-eins-Grenzen, Bytebudget nach Escaping, leere/missing-vs-null-Container, exakte Decimal-/Exponentkanonisierung, lossless Providerzahlen sowie gepinnte Raw-Content- und unabhängig berechnete domain-separierte Raw-Body-Golden-Vektoren; die fachlichen Domaininhalte werden separat in Ledger-, Sync-Scope- und Orchestrator-Fixtures geprüft |
| Transienter Raw-Observation-Ledger | `14/14` Fixtures: unveränderlicher Erstcommit, Cross-Page-Wiederbeobachtung, semantische Keyorder-/Zahläquivalenz, Fallbackrevision, MEXC-Revisionsauthorityblockade, Generation-Precondition, Replayblockade in authentischer State-Kette, Spread-/Reflection-State-Forgery, vollständige Digestmetadaten, typisierte opake Referenzen, gepinnte Source-/Contract-/Adapter-Provenienz und Capability-Endpoint-Bindung, Funding-Page-/Terminalbindung, leere terminale Page ohne Completeness, `blocked_identity`, Accountisolation und Page-/State-Ressourcenlimits |
| Normativer MEXC Sync Scope | `5/5` Fixtures: gepinnte Stability-/Scope-Golden-Digests, Cross-Activation-/Account-/Instrument-/Scopegenerationsisolierung, Ergebnisstatus ohne Digestwechsel, konservative 72-Stunden-Requestspanne, exakt ausgerichtete 7-/28-UTC-Tagesfenster, Profil-/Policy-Pins, capabilitykohärenter Position-Type sowie Blockade positiver Completeness-/Stabilityclaims; persistierte High-Watermark und Multi-Bucket-Raster bleiben offen |
| In-Process-Capture-Orchestrator | `23/23` Fixtures: authentische Purpose-Binding→Prepared-Request→Body→Oracle→Pagination→Raw-Ledger-Transition, identische Raw-Body-/Scope-Digests, transportgebundene Observationzeit, unverändertes Raw-Payloadobjekt, Wire-Response-Forgery- und Unbound-Preview-Blockade, Scope-/Checkpointbindung, isolierte Capability-/Symbol-/Start-/End-/Page-/Page-Size-/Position-Type-Requestsubstitution sowie isolierte Scope-Digest-/Run-/Request-Result-/Sequenz-/Brokerkonto-/Aktivierungs-ID-/Aktivierungsgenerationsabweichung, Cross-Account-Blockade, Same-Process-Single-use und kanonische leere Fundingpage ohne Authority |
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

Dieses Delta ist kein G1-Abschluss. Folgende sechs Punkte bleiben offen:

1. automatische Runtimeansteuerung des in-process zweckgebundenen Orchestrators
   unter einer persistiert gültigen Aktivierung sowie reale MEXC-Pagination-/
   Retention-/Rate-Limit-Evidenz; die synthetische Body→Oracle→Pagination→
   Raw-Ledger-Herkunftsbindung ist umgesetzt;
2. persistenter ownergebundener Raw-Event-/Revision-/Observation-Ledger mit
   atomarem DB-CAS, vollständiger Raw-Response-Aufbewahrung, RLS, Retention,
   Erasure sowie Erzeugung/Rotation der Account-Identity-HMACs; der transiente
   `equora-tcj-v1`-Kern und seine Golden-Vektoren sind umgesetzt;
3. Activation Series, Current Generation, atomare Supersession, Lease,
   persistierte High-Watermarks, vollständige Schedulerlane-/Multi-Bucket-
   Orchestrierung und `derive_capture_health_v1`;
4. Opaque Credentialreferenz und Current-Generation-Revalidation unmittelbar
   vor Credentialzugriff; die lokale deklarierte Credentialloaderbindung ist
   kein Persistenz- oder Ownershipnachweis;
5. persistente capabilitygenaue Evidence-/Partial-/Failed-Zustände ohne
   Produktions-SQL in diesem Gate;
6. verbleibende integrierte G1-Fixturematrix einschließlich persistenter
   Raw-Ledger-Deduplizierung/Revision, HMAC-Key-Rotation, Prozessrestart, realer
   Pagination-/Rate-Limit-Evidenz, Generation und atomaren Claimoracles;

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

## 6. Gateentscheidung

```text
G1 IN PROGRESS – NO-GO
runtime_gate = g1_transport_only
automatic_import = blocked
broker_requests = blocked
database_changes = blocked
production_sql = blocked
push = blocked
deployment = blocked
```

Der Transport-/Egress-/Parserblock ist implementiert, lokal validiert und für
seinen begrenzten Scope unabhängig bestanden. G1 bleibt wegen der sechs
verbleibenden P1-Blöcke `IN PROGRESS – NO-GO` und kann erst nach deren
Implementierung und unabhängiger Prüfung auf GO gesetzt werden.

# Equora v57.61.0 – Gate G0 Dossier

**Dokumentstatus:** FINAL v14 – G0 GO, DESIGN ONLY; A3/A4/A5/A6 ROUTING PASS

**Gate-Status:** GO – DESIGN ONLY

**Stand:** 2026-08-05

**Scope:** Provider-neutrale Brokerimport-Architektur; MEXC v57.61.0 erfasst prospektiv per Read-only API; Excel-Export bleibt separat gegatete Recovery-/Backfillquelle

**Entscheidungsbefugnis:** Dieses Dossier dokumentiert Evidenz und Reviewbedarf. Es erteilt weder Implementierungs- noch externe Betriebsfreigaben.

## 1. Ergebnis vor Detail

G0 ist bestanden. Die vier im Handoff geforderten Kernarchitekturartefakte, das
ergänzende Read-only-Threat-Model und dieses Dossier sind auf Designebene
angenommen. A3, A4, A5 und A6 haben ihre gerouteten Pflichtprüfungen ohne
offenen P1 abgeschlossen; der letzte A3-v14-P2 war eine mechanische
Statusformulierung und ist in diesem Finalstand korrigiert. Implementierung,
SQL, Brokerzugriff, finaler Journalimport, Git und Deployment sind dadurch nicht
freigegeben.

Am 2026-08-05 stellte der Nutzer drei MEXC-Supportantworten bereit und
bestätigte eine engere Produktrichtung: v57.61.0 soll ab expliziter Aktivierung
prospektiv und regelmäßig lesen; ungefähr ein Monat dient nur als Onboarding-
und Wiederanlaufpuffer. Equora wird zum lokalen Langzeitjournal. Historischer
MEXC-Excel-Import ist optionaler Backfill-/Recoverypfad und bleibt bis zu einem
eigenen File-Profile-Gate nicht importfähig.

Das v9-Delta ersetzte fehlende Providergarantie nicht durch eine Annahme. Es
verbietet globale Vollständigkeitsclaims, führt Aktivierungsgrenze, Fast-/Audit-
Lane, wiederholte Scope-Digests, Sync Health, Gap Ledger und Carry-in-Blocker
ein und begrenzt MEXC-Finanzwerte auf `provider_booked`. Historische lokale
Valuation bleibt unsupported. DEC-5761-009 und DEC-5761-018 sind deshalb nicht
mehr extern unentscheidbar, sondern `PROPOSED`.

Die unabhängigen A3-, A4-, A5- und A6-v9-Reviews ergaben `FAIL`. Das v10-
Remediation-Delta trennt deshalb immutable Stabilitätsbuckets, lane-spezifische
Health, Gap-/Coverageachsen, Activation-/Credential-Rechecks, File-Quarantäne
und komponentengenaue Financial Authority. Der Nutzer wählte am 2026-08-05
ausdrücklich `provider_observed_best_effort`: automatische Read-Capture,
Speicherung, Normalisierung und Reconciliation; finaler lokaler Journalimport
weiterhin nur nach expliziter Auswahl und separatem Human Approval. Bis zu den
damaligen Pflichtreviews blieb G0 RED. A4 und A6 bewerteten v10 mit PASS. A3 bewertete
v10 wegen nicht kanonischer Bucketidentität, nicht eindeutig disjunkter
Lane-Health und fehlender eventzeitlicher Contract-/Currency-Authority mit
FAIL. v11 schloss Bucket-/Lane-ID, ließ aber Health-Aggregation, eventbezogenen
Authority-Grain, kanonische Currency-Authority und Funding-Expectation noch
offen. A3/A5 bewerteten v11 deshalb mit FAIL. v12 schloss diese P1; A3, A4
und A5 bewerteten den eingefrorenen v12-Satz unabhängig mit PASS. v13
konsolidiert ausschließlich ihre P2 zu immutable Activation-Series/
Generationszeilen, vollständigen Constraint-/Invalidierungslisten, Diagramm-
und Finding-Test-Traceability sowie der korrigierten Stability-Fixture-Semantik.
Die begrenzten v13-Delta-Rechecks ergaben A3/A5 PASS ohne Restbefund und A4
PASS mit zwei P2. v14 ergänzt deshalb einen exklusiven Series-Current-Pointer,
atomare Vorgänger-Deaktivierung/Jobinvalidierung, Current-Generation-
Revalidation und ein Parallelwechsel-Fixture. A4 und A6 bewerteten v14 mit
PASS ohne P1/P2. A3 bewertete v14 technisch mit PASS; sein einziger P2 betraf
die inzwischen korrigierte mechanische Abschlussformulierung. Damit ist das
G0-Gesamtrouting ohne offenen Designblocker abgeschlossen.

Der historische BRI-031-Incident bleibt unverändert offengelegt: kumulativ acht
statt maximal sieben genehmigte GETs, keine rückwirkende Autorisierung, kein
weiterer Probe. Sein Korrekturdesign ist A3/A4-PASS; technische Enforcement
folgt G1.

Die Architektur ist ab G0 provider-neutral. MEXC-spezifische Pfade, Signatur,
Payloads und Semantik verbleiben ausschließlich im MEXC-Adapter. Ein weiterer
Broker darf später nur über einen eigenen versionierten Providervertrag, eigene
Fixtures und dieselben Gates angebunden werden.

## 2. Kontrollierter Ausgangsstand

Der read-only geprüfte Ausgangsstand vor Erstellung der G0-Dokumente war:

| Kontrollpunkt | Befund |
|---|---|
| Arbeitsordner | `C:\Users\matth\Desktop\Trading Journal\product\Equora Starter v57.61.0` |
| Branch | `feature/mexc-import-v57.61.0` |
| HEAD | `392addfaf32b6eba9ba1e34cef6fe65ce1ab944a` |
| Direkte Baseline | `15551c0a5fba367fd2e0e6283071bddaf7a329f2` |
| Upstream laut lokaler Git-Konfiguration | `origin/main`; lokal `ahead 1`, `behind 0` |
| Arbeitsbaum vor G0-Dokumentation | sauber |
| Remote-Aktualität | nicht verifiziert; kein Fetch/Push autorisiert |
| Baseline-Commit | Docs-only-Handoff-Commit |
| Secrets | `.env.local` im Worktree nicht vorhanden und ignoriert |

Der Arbeitsbaum ist nach Erstellung dieser Entwürfe erwartungsgemäß nicht mehr
sauber. Zulässig sind ausschließlich die in Abschnitt 4 aufgeführten neuen
Dokumente. Stage, Commit und Push sind nicht Teil von G0 und bleiben gesperrt.

## 3. Unveränderte Scope- und Sicherheitsgrenzen

Bis zu einer gesonderten, ausdrücklichen Nutzerfreigabe bleiben gesperrt:

- Live- oder Non-Production-Aufrufe gegen MEXC und andere Broker;
- Verwendung, Kopie, Rotation oder Prüfung realer API-Credentials;
- automatischer endgültiger Import oder automatische Freigabe von
  Journal-Trades; der prospektive Read-Scheduler ist nur als Architektur
  entworfen und noch nicht implementiert/aktiviert;
- Stage, Commit, Push, Pull Request, Merge und Branch-Wechsel;
- Deployment, Vercel-Änderungen und Produktions-SQL;
- Supabase-Migrationen, Service-Role-Operationen und produktive Datenabfragen.

Am 2026-08-04 autorisierte der Nutzer die Fortsetzung bis zu einem finalen
lokalen Patch. Nach bestandenem jeweiligen Architekturgate dürfen deshalb ohne
weitere Zwischenbestätigung lokal bearbeitet werden:

- Anwendungscode und lokale Dokumentation;
- synthetische, secretfreie Fixtures;
- Unit-, Contract-, Integrations- und statische Tests;
- nicht ausgeführte Schema-/Migrationsentwürfe im Repository;
- lokale Builds und Tests, soweit keine zusätzliche externe Installation oder
  reale Umgebung erforderlich ist.

Diese Autorisierung umfasst keine realen Brokerdaten/-credentials, keine reale
Datenbankmutation und keine Git-/Deploymentaktion.

Dauerhaft und nicht durch eine spätere Freigabe aktivierbar sind:

- jegliche Broker-Trading-, Order-Placing-, Modify-, Cancel-, Close- oder
  Reverse-Funktion;
- Transfer-, Deposit- oder Withdrawal-Operationen;
- jeder andere schreibende Broker-Endpoint;
- Broker-SDK- oder WebSocket-Sendefunktionen.

DEC-5761-019 stellt klar: Ein nach Human Approval erzeugter Journal-Trade ist
ausschließlich ein lokaler Equora-Datensatz und keine Brokerorder.

Die bestehende read-only Vorschau wird durch diese Dokumentation nicht verändert.
Der Journalimport bleibt bis zum Bestehen von G0 bis G6 NO-GO. Human Approval
bleibt zwingend und darf weder zeitgesteuert noch implizit ersetzt werden.

## 4. G0-Artefaktinventar

| Artefakt | Datei | Status | Zweck / Reviewbedarf |
|---|---|---|---|
| Decision Set (Handoff-Kernartefakt 1/4) | `docs/decisions/EQUORA_v57.61.0_G0_DECISION_SET.md` | DESIGN_ACCEPTED v14 | DEC-5761-009/018 promoted; DEC-5761-024 ACCEPTED; G0-Grenzen bindend |
| Provider Contract (Handoff-Kernartefakt 2/4) | `docs/architecture/EQUORA_v57.61.0_MEXC_PROVIDER_CONTRACT.md` | DESIGN_ACCEPTED v14 / `g0.1` | kanonische Buckets, Current-Pointer, deterministische Lane Health, Event-/Currency-/Funding-Authority, Filevertrag |
| Logical ERD (Handoff-Kernartefakt 3/4) | `docs/architecture/EQUORA_v57.61.0_BROKER_IMPORT_LOGICAL_ERD.md` | DESIGN_ACCEPTED v10 | Activation Series/Current Generation, Event Contract Authority, Funding Expectation, Currency-Authority, Trade-Coverage-Pfad; kein DDL |
| Transaction, Operations & Migration Design (Handoff-Kernartefakt 4/4) | `docs/architecture/EQUORA_v57.61.0_BROKER_IMPORT_TRANSACTION_OPERATIONS_MIGRATION_DESIGN.md` | DESIGN_ACCEPTED v11 | atomarer Generationswechsel, Eligibility-/Invalidierungs-Rechecks, Authority-/Funding-Recovery; kein SQL |
| Read-only Broker Boundary & Threat Model (ergänzendes Designartefakt) | `docs/security/EQUORA_v57.61.0_READ_ONLY_BROKER_BOUNDARY_THREAT_MODEL.md` | DESIGN_ACCEPTED v9 | A4-v14 Owner PASS; permanente Read-only-/GET-only-Grenze |

Dieses Gate-Dossier ist das separate Governance-Artefakt. Der lokale G0-Patch
umfasst damit vier verpflichtende Kernartefakte, ein ergänzendes Designartefakt
und dieses Dossier, insgesamt sechs Dokumente. Das Dossier ersetzt keines der
vier im Handoff geforderten Kernartefakte.

## 5. Agentenrouting und Entscheidungstrennung

Jedes Finding hat genau einen verantwortlichen Owner. Weitere Rollen sind
Pflichtreviewer, aber keine Co-Owner. Damit wird die Mehrfach-Owner-Notation der
Übergabe für die G0-Fortführung eindeutig normalisiert.

| Rolle | Verbindliche Aufgabe in G0 |
|---|---|
| A1 – Orchestrator / Engineering Lead | Scope, Abhängigkeiten, Decision Log, Evidenzvollständigkeit und finale G0-Entscheidung; hebt kein Veto ohne neue Evidenz auf |
| A2 – Software Architecture & Implementation | Lead für Providervertrag, Datenmodell, Pagination, Transaktionen, Migration und technische Fixture-Spezifikation |
| A5 – Trading Domain & Data Integrity | Hard-Gate-Veto für Trade-Grain, Positionszyklen, Teilfills, Gebühren, Funding, Währungen, PnL, Zeit und Toleranzen |
| A4 – Security, Privacy & Compliance | Pflichtreview für Credentials, Claims, Host-/Pfad-Allowlist, RLS, Logging, Retention, Export, Löschung und Key-Rotation |
| A3 – QA & Release Assurance | Unabhängige Prüfung der Akzeptanzkriterien, Fixture-/Testmatrix und Gate-Evidenz; keine Selbstfreigabe eigener Implementierung |
| A6 – Product, Commercial & Distribution | Approval-UX, verständliche Zustände, irreversible Folgen, Support- und Produktclaims |
| Nutzer | Ausschließliche Freigabe externer Aktionen sowie der ausdrücklich gesperrten Betriebs- und Git-Aktionen |

Verbindliche v12-Routingmatrix:

| Gegenstand | Owner | Pflichtreviews / Sign-off |
|---|---|---|
| DEC-5761-009 und Providervertrag | A2 | A3, A4, A5 |
| DEC-5761-018 | A5 | A2, A3, A4 |
| Logical ERD und Operationsdesign | A2 | A3, A4, A5 |
| Read-only Threat Model | A4 | A2, A3, A6 |
| Product-/Approval-/Claimwirkung | A6 | A2, A3, A4, A5 |
| G0-Gesamtentscheidung | A1 | alle vorgenannten Reviews beziehungsweise Owner-Sign-offs |

Owner-Sign-off ist kein unabhängiger Selbstreview. Diese Matrix ersetzt alle
abweichenden Pending-Formulierungen in älteren Deltas.

## 6. Vollständige Finding-Rückverfolgbarkeit

### 6.1 Übernommene Findings

| ID | Owner | Pflichtreview | Priorität | G0-Artefakt / spätere Evidenz | Exit-Gate | Status |
|---|---|---|---|---|---|---|
| BRI-001 | A2 | A3, A5 | P1 | Providervertrag und Transaction Design; deterministische Pagination-, Cursor-, Watermark-, Backfill- und Resume-Fixtures | G1 | offen |
| BRI-002 | A5 | A2, A3 | P1 | Decision Set und Logical ERD; getrennte Order-/Execution-Grains und Golden Tests für wirtschaftliche Journal-Trades | G2/G3 | offen |
| BRI-003 | A5 | A2, A3 | P1 | Decision Set, ERD und Allokationsmodell; Golden Tests für gewichtete Preise, Mengen und Teil-Exits | G3 | offen |
| BRI-004 | A5 | A2, A3, A4 | P1 | Decision Set und Providervertrag; transparente Gross-/Fee-/Funding-/Other-Cost-/Net-PnL-Reconciliation je Währung | G3 | offen |
| BRI-005 | A2 | A5, A3, A6 | P2, import-gate-relevant | Providervertrag und Decision Set; UTC-Persistenz, Provider-Zeitbasis, `Europe/Berlin`- und DST-Fixtures | G2/G3 | offen |
| BRI-006 | A2 | A5, A3 | P1 | ERD und Transaction Design; stabiler wirtschaftlicher Importkey sowie Wiederholungs- und Parallelitätstests | G5 | offen |
| BRI-009 | A4 | A2, A3 | P1 | ERD und Operations Design; Feldminimierung, Redaction, owner-gebundener Zugriff, Export und Löschung | G5/G6 | offen |
| BRI-010 | A2 | A3, A5, A6 | P1 | Providervertrag und Operations Design; persistierte Endpoint-/Symbol-/Seiten-/Fensterfehler, `partial` und Importsperre | G1/G4 | offen |
| BRI-011 | A2 | A5, A3 | P1 | Providervertrag, ERD und Decision Set; versionierte Contract-Metadaten, Positions-/Funding-Events, getrennte Währungen, keine `contractSize = 1`-Annahme | G1/G3 | offen |
| BRI-012 | A4 | A2, A3 | P1 | ERD und Migration Design; Mismatch-Preflight 0, zusammengesetzte Tenant-/Parent-FKs, negative Zwei-Nutzer-Tests für Tabellen und RPCs | G5/G6 | offen |
| BRI-013 | A4 | A2, A3, A6 | P1 | Providervertrag und Decision Set; Claims nur als Lesetest plus Nutzerbestätigung, feste Host-/GET-/Pfad-Allowlist und Negativtests | G1/G4 | offen |
| BRI-014 | A4 | A6, A2, A3 | P1 | Decision Set, ERD und Operations Design; getrennte Credential-/Raw-/Journal-Aktionen, Counts, MEXC-Widerrufshinweis, atomare Owner-Tests | G4/G5 | offen |
| BRI-015 | A4 | A2, A3, A6 | P1 | Decision Set, ERD und Operations Design; Inventar, Minimierung, Retention, Export, Erasure-RPC, Dual-Key-Rotation und Recovery-Runbook | G5/G6 | offen |
| BRI-016 | A5 | A2, A3 | P1 | Decision Set und ERD; Reconciliation über Execution-, Order- und Position-Identitäten, Menge und UTC statt CSV-LIFO-Heuristik | G2/G3 | offen |
| BRI-017 | A6 | A4, A5, A3 | P1 | Decision Set, Providervertrag und Approval-UX-Spezifikation; präzise Claims und unveränderliche Auswahl mit verständlichen Folgen | G4 | offen |

BRI-007 und BRI-008 bleiben als P2/P3 im Gesamtrisikoregister bestehen, sind
aber keine offenen P1-Importblocker. BRI-007 wird spätestens vor Pilotbetrieb in
G6 nachgewiesen; BRI-008 gehört in die spätere UI-/Regressionsevidenz.

### 6.2 Neu erhobene P1-Findings

| ID | Owner | Pflichtreview | Priorität | Evidenz / Risiko | Akzeptanzkriterium | Exit-Gate | Status |
|---|---|---|---|---|---|---|---|
| BRI-018 | A2 | A4, A3 | P1 | Der bestehende Connector verwendet `https://contract.mexc.com` und den historischen Dealpfad ohne `/v3`. Die aktuelle offizielle MEXC-Dokumentation führt seit 2026-01-19 `https://api.mexc.com` und `GET /api/v1/private/order/list/order_deals/v3`. Der Produktionscode wurde nicht verändert. Public- und Private-Probe beobachteten `api.mexc.com`; die Private-Phase erhielt HTTP 2xx/`success=0` für alle vier allowlisteten GET-Pfade einschließlich `/v3`. | Aktueller Host und versionierte GET-Pfade sind fail-closed allowlisted; Legacy-Fallback ist ausgeschlossen; Contract-Fixtures und Negativtests folgen in G1. | G1 | G0-Providerbeobachtung `observed_nonprod`; Implementierungs-/Fixtureevidenz G1 offen |
| BRI-019 | A2 | A5, A3, A4 | P1 | Offizielle MEXC-Seiten widersprechen sich bei mehreren Response-Beispielen und Feldtabellen. Discovery beobachtete reale Arrayitems für Orders/Executions, ein Funding-Page-/Itemobjekt und zwei verschiedene Orderseiten; Historical Positions blieb leer. Dieses eine Seitenpaar belegt weder globale Sortierung noch Fenster-Inklusivität, API-Retention, terminale Page, Page-Snapshot-Stabilität, Revisionen oder Late Arrivals. Eine stillschweigende Annahme könnte Historie verlieren oder doppeln. | Kein globaler/historischer Completenessclaim. v12 nutzt activation-/profilgebundene immutable UTC-Buckets, disjunkte Lane Health und sofortige Gap-Sperre. Support beschreibt aktuell newest-first; jede Page/Pagegrenze wird dennoch validiert. Vollständig ausgelassene matched Cycles werden als sichtbares Best-effort-Restrisiko geführt. | G0/G1 | G0-Design A2/A3/A4/A5 PASS; Best-effort-Policy gewählt, Implementierungs-/Fixtureevidenz G1 offen |
| BRI-020 | A5 | A2, A3 | P1 | Ein Backfill oder Aktivierungsscope kann innerhalb einer bereits offenen Position beginnen oder vor dem vollständigen Exit enden. Ohne belegte linke und rechte Cycle-Grenze könnte ein unvollständiger Ausschnitt fälschlich als abgeschlossener Journal-Trade importiert werden. | `boundary_complete` erfordert nachweislich flat vor Entry und nach Exit oder gleichwertige vollständige Provider-/Export-Lifecycle-Evidenz; Carry-in und links-/rechtszensierte Fenster bleiben `blocked_left_boundary`, `open` oder `blocked_boundary`; Export oder neue Flat-Grenze ist explizite Recovery. | G0/G2/G3 | A3/A5-v12 und A3/A5-v13 PASS; G0-Design geschlossen, Golden-/Implementierungsevidenz G2/G3 offen |
| BRI-021 | A5 | A2, A3, A4 | P1 | Contract Size und Basismenge definieren nicht automatisch die PnL-Bewertung. Eine lineare Formel kann für inverse oder Quanto-Kontrakte wirtschaftlich falsch sein. Historische Formel-/Metadatengültigkeit ist nicht ausreichend belegt. | Nur belegte `provider_booked` Komponenten können später Authority werden. Native Contractmenge/-preis bleiben erhalten; Contractfamilie/Settlement müssen eventzeitlich autoritativ sein; lokale Average-/Value-/Base-Rechnung ist ohne historische Valid-Time-Evidenz `not_comparable`. `non_authoritative_same_bracket` ist kein Validitätsbeweis; `local_valuation` bleibt unsupported. | G0/G2/G3 | G0-Design A5 Owner sowie A2/A3/A4 PASS; Provider-/Golden-Evidenz G2/G3 offen |
| BRI-022 | A4 | A2, A3 | P1 | Der bestehende MEXC-Stand ruft nur GET auf, verwendet intern aber einen generischen `fetchJson(url, init)`-Helfer, sperrt Redirects nicht ausdrücklich und besitzt keine Brokertransport-Negativtests. Da die aktuelle MEXC Futures API getrennte Order-Placing-POST-Pfade anbietet, fehlt eine strukturelle Regressionssperre. | Genau ein zentraler Egress-Chokepoint; Adapter dürfen keine Netzwerkprimitive/SDKs importieren; MEXC intern konstant GET; exakte Host-/Pfad-/Query-Allowlist; `redirect=error`; Capability vollständig vor Credential-Store/Signatur validieren; AST-/Dependency- sowie dynamische Negativtests für Bypass, Nicht-GET, Mutationspfade, Redirects, URL-Injektion und null Brokerrequests im Journalimport. | G0/G1/G6 | G0-Design A3/A4 PASS; Implementierungs-/Negativtestevidenz G1/G6 offen |
| BRI-023 | A5 | A2, A3 | P1 | „Cycle-Menge“ und generisch gewichteter Preis reichen für Scale-in, Scale-out, erneutes Add und Overshoot-Reversal nicht. Entry-/Exit-Turnover, Peak- und End-Inventar sind verschiedene Größen; Average Price hängt vom Valuation-Modell ab. | Getrennte Entry-/Exit-/Peak-/Endmengen; Long positiv/Short negativ; exakte Delta-/Null-/Reversalregeln; formelgebundene Value-/Average-Regeln; Execution-Fee/PnL über Reversal-Candidates nur summenerhaltend allokieren, sonst `not_comparable`; Golden Fixtures später G2/G3. | G0/G2/G3 | G0-Design A3/A5 PASS; Golden-/Implementierungsevidenz G2/G3 offen |
| BRI-024 | A2 | A5, A3 | P1 | Die erste Sammelallocation verlangte eine Execution, erlaubte aber Rollen `funding` und `position_reference`; Funding- und Positionsevidenz war nicht typisiert bis zum Raw Event referenzierbar. | Getrennte Execution-/Funding-/Account-Finanz-Allocations und Order-/Position-/Metadata-Evidence; Financial Links nur auf Candidate Sources derselben Revision; XOR-/Scope-/Raw-Constraints; Funding/Account-Sources exklusiv oder summenerhaltend gesplittet; Fixtures später G2/G3/G5. | G0/G2/G3/G5 | G0-Design A3/A5 PASS; Implementierungs-/Fixture-Evidenz G2/G3/G5 offen |
| BRI-025 | A5 | A2, A3 | P1 | Fee und PnL erscheinen auf Execution-, Order- und Positiongrain. Ohne Source-Authority-/Overlap-Regel drohen Executionfees plus `fee`/`totalFee` beziehungsweise PnL-Aggregate doppelt gebucht zu werden. | Je Komponente genau eine Authority Rule; typisierte Order-/Positionreferences und Accountbookings; atomare Source-/Field-/Currency-/Coverage-Teilbeträge summieren sich über aktuelle Candidates exakt zum Quellbetrag; Aggregate nur `reference_only`; Rest blockiert; Fixtures später G2/G3. | G0/G2/G3 | G0-Design A3/A5 PASS; Implementierungs-/Fixture-Evidenz G2/G3 offen |
| BRI-026 | A5 | A2, A3 | P1 | Eine stabile Provider-ID kann Paging deterministisch machen, beweist aber bei gleichen Zeitstempeln keine wirtschaftliche Reihenfolge. Eine erfundene ID-Sortierung kann Cycle/Reversal/PnL ändern. | Technische Pagingordnung von Economic Sequence trennen; Same-Timestamp-Gruppen nur über bounded analytischen Invarianzbeweis; gemischte Deltas, Nulldurchgang, fehlender Beweis oder Budgetende sofort `ambiguous_sequence`; keine faktorielle Enumeration/ID-Fallback; Fixtures später G1–G3. | G0/G1/G2/G3 | G0-Design A3/A5 PASS; Provider-/Fixture-/Implementierungsevidenz G1–G3 offen |
| BRI-027 | A2 | A3, A4, A5 | P1 | Scope-, Page-, Raw-, Candidate-, Approval-, Allocation- und Importdigests besaßen keinen gemeinsamen Kanonisierungs-, Domain- und Versionsvertrag. Runtimeabweichungen könnten Idempotenz und Approval-Invalidierung brechen. | Normatives `equora-tcj-v1` mit bytegenauen Typ-Tags, UTF-8-/Escape-/Duplicate-Key-/Sort-/Set-/Limit-/Zahl-/Zeit-/Raw-Body-Regeln, domain-separated SHA/HMAC, additiver Versionierung; Golden Vectors später G1/G5. | G0/G1/G5 | G0-Design A3/A4/A5 PASS; Golden-Vector-/Implementierungsevidenz G1/G5 offen |
| BRI-028 | A2 | A5, A3 | P1 | Die Providerfeldlisten waren kein ausführbares Oracle: JSON-Pfad, Typ, Pflicht/null, Einheit, Enum, Zeit, Identitäts- und Fehlerwirkung waren unvollständig. Der aktuelle Parser filtert malformed Items und kann unbekannte Shapes als `[]` behandeln. | Strikte versionierte Envelope-/Query-/Shape-/Feldmatrix für alle registrierten Capabilities einschließlich Serverzeit/Contract Metadata; Supplementary/Identity/Accountbooking explizit unregistriert oder unsupported; lossless Typen; unknown/malformed blockierend; Fixtures später G1/G2. | G0/G1/G2 | G0-Design A3 PASS; Provider-/Fixture-Evidenz G1/G2 offen |
| BRI-029 | A2 | A3, A4 | P1 | `supported_verified` konnte im ersten Entwurf allein durch synthetische Fixtures erreicht werden, obwohl diese kein reales Providerverhalten, Retention oder Paging belegen. | Dokumentation, Adapterfixture, Providerbeobachtung und Supportevidenz getrennt persistieren; keine Importeligibility allein durch synthetische Fixtures; Widerspruch suspendiert Capability. | G0/G1/G4 | G0-Design A3 PASS; Implementierungsevidenz offen |
| BRI-030 | A2 | A3 | P1 | Der aktuelle Serverzeitparser fällt bei fehlendem oder unlesbarem `data` still auf `Date.now()` zurück und kann lokale Zeit als Providerzeit ausgeben. | Strikter plausibler Unix-ms-Integer, kein Local-Time-Fallback; bei Fehler null Signaturen, Credentialzugriffe und private Requests; Negativfixtures für fehlend/null/String/Float/Sekunden/Skew. | G0/G1 | G0-Design A3 PASS; Code-/Testevidenz G1 offen |
| BRI-031 | A1 | A3, A4 | P1 | Der abgebrochene Discovery-Versuch verbrauchte einen öffentlichen GET; der ohne neue ausdrückliche Retryfreigabe gestartete Retry weitere sieben. Damit wurden acht statt maximal sieben genehmigte externe GETs ausgeführt. Das accountweite Discovery-Queryprofil und Orders Page 2 waren vor Ausführung nicht als versionierte Abweichung zu §5.7.5/§10.2 dokumentiert. Alle Calls blieben GET-only; der erste Versuch sendete keine Credentials/private Requests. Risiko ist eine reale Scope-/Budget-/SOP-Verletzung, nicht ein belegter Broker-Mutationsvorfall. | Incident und kumulativer Count bleiben unverändert dokumentiert; keine rückwirkende Freigabekonstruktion und kein weiterer Probe. Künftige Work Units benötigen vorab versioniertes Discovery-Profil, kumulatives Budget über Versuche, geprüfte Abhängigkeitsbedingungen und neue ausdrückliche Freigabe vor jedem Retry nach bereits verbrauchtem Request; A3/A4-Review, technische Enforcementtests G1. | G0/G1 | historischer Incident offengelegt; G0-Korrekturdesign A3/A4 PASS; Enforcement G1 offen |
| BRI-032 | A2 | A3, A5 | P1 | Nutzerbereitgestellte MEXC-Supportantworten nennen einerseits keine feste Retention, andererseits nur den jüngsten Monat. Sie definieren weder garantierte Tage noch endpointgenaue Vollständigkeit. | Als `support_claimed_operational_horizon` speichern, nie als Garantie. Produktclaim auf prospektive `provider_observed_best_effort`-Erfassung begrenzen; Supportevidenz versioniert ergänzen. | G0/G4 | G0-Design A2/A3/A5/A6 PASS; Best-effort-Policy gewählt, Laufzeit-/UX-Evidenz G4 offen |
| BRI-033 | A2 | A3, A4, A5 | P1 | Offizieller Account Data Export ist Excel/PDF, aber konkretes Workbook-/Sheet-/Header-/Typ-/Join-Schema ist nicht belegt. Manuelle Excel-zu-CSV-Konvertierung kann IDs, Zeit und Decimals verändern; Officeartefakte besitzen eigene Securityrisiken. | Getrennter `provider_export_file`-Channel, Source Artifact/File Parse Result, Quarantine, feste Ressourcenlimits, keine Makro-/Formel-/OLE-/External-Link-Ausführung. `mexc_account_export_excel` bleibt bis Originalbeispiel und eigenem File-Profile-Gate `unverified`/nicht importfähig. | eigenes File-G0/G1–G3 | Architekturreservierung vorgeschlagen; konkretes Profil blockiert |
| BRI-034 | A2 | A3, A4, A5, A6 | P1 | Automatisches Lesen könnte mit automatischem Journalimport verwechselt werden oder bei Schedulerlücken still falsche Vollständigkeit behaupten. | Getrennte Scheduler-/Sync-/Auswahl-/Approval-/Importcapabilities; sechs-Stunden-Ziel statt SLA, kanonische activation-/profilgebundene Buckets, disjunkte Fast-/7d-/28d-Lane-Health, keine Vorauswahl, explizite Sammelauswahl plus getrennte single-use Bestätigung; Scheduler schreibt nie Journal-Trades. | G0/G1/G4 | Nutzerpolicy DEC-5761-024 ACCEPTED; G0-Design A2/A3/A4/A5/A6 PASS; Laufzeit-/UX-Evidenz G1/G4 offen |
| BRI-035 | A6 | A2, A3, A4, A5 | P1 | Identische API-Beobachtungen können einen vollständig ausgelassenen matched Entry-/Exit-Cycle nicht erkennen. Ohne Produktpolicy wäre „importierbar“ ein stiller Vollständigkeitsclaim. | `provider_observed_best_effort` mit dauerhaft sichtbarem `not_export_verified`-/Omission-Risiko in Candidate, Approval, Trade und Statistik; bekannte Gaps bleiben Blocker; Human Approval bleibt zwingend. | G0/G4 | Nutzerpolicy 2026-08-05 ACCEPTED; G0-Design A2/A3/A4/A5/A6 PASS; UX-/Browser-/Statistikevidenz G4 offen |
| BRI-036 | A4 | A2, A3, A6 | P1 | Schedulerjobs könnten nach Pause, Widerruf, Credentialentfernung oder Permissionunklarheit noch Credentials laden beziehungsweise Requests senden. | Permissionevidenz vor Aktivierung; atomare Revalidierung vor Enqueue und Credentialzugriff; Job-/Retry-/Catch-up-/Lease-Invalidierung; null weitere Credentialzugriffe/Requests. | G0/G1/G6 | G0-Design A4 Owner sowie A2/A3/A6 PASS; Enforcement G1/G6 offen |
| BRI-037 | A4 | A2, A3, A6 | P1 | Excel-Formelcaches, Container-/XML-Angriffe und implizite Artefaktaufbewahrung waren nicht vollständig fail-closed. | Jede Formel/Cache und aktive/unklare Containerkomponente ablehnen; workbookweite Entry-/Dekompressions-/XML-Limits; Binärartefakt max. 7 Tage und nach terminalem Ergebnis 24h, sanitiserte Parsemetadaten 180 Tage. | File-G0/G1/G6 | A4-v10 Owner-Sign-off PASS; konkretes MEXC-Fileprofil bleibt gesperrt; Parser-/Erasureevidenz folgt im File-Gate |
| BRI-038 | A3 | A2, A4, A5 | P1 | Rollierende Auditfenster konnten nie denselben Stability Scope bilden; ein globaler Auditzeitpunkt konnte eine ausgefallene Pflichtlane maskieren. | Kanonische `stability_bucket_identity` bindet Activationgeneration und alle Profil-/Contract-/Boundaryversionen; disjunkte `incremental_fast_6h`-/7d-/28d-Lanes; `SYNC_LANE_STATE.health` als Autorität; einheitlicher Predicate vor Candidate/Auswahl/Approval/Import. | G0/G1/G4 | G0-Design A2/A3/A4/A5 PASS; Current-Generation-P2 geschlossen, Laufzeitevidenz G1/G4 offen |
| BRI-039 | A5 | A2, A3, A4 | P1 | Die Annahme „MEXC immer USDT/USDC“ ist global falsch: aktuelle offizielle Quellen nennen zusätzlich Coin-M-Futures; aktuelle Metadaten beweisen Contractfamilie/Settlement nicht rückwirkend; Execution-`profit` besitzt kein eigenes Currencyfeld. | v57.61.0 importiert nur eventzeitlich autoritativ belegte lineare USDT-/USDC-M-Contracts. Coin-M/inverse/Quanto/USD1-M/unknown unsupported. Jede PnL-/Fee-/Fundingkomponente besitzt eigenen Currency-/Authoritystatus; unknown blockiert. | G0/G2/G3 | A3/A4/A5-v12 und A3/A5-v13 PASS; G0-Design geschlossen, G2/G3-Providerevidenz offen |
| BRI-040 | A5 | A2, A3, A4 | P1 | Eine leere Fundingpage oder ein fehlender Expectation-Oracle könnte bei einem sichtbaren Cycle still als null Funding behandelt werden. Best-effort akzeptiert aber nur einen vollständig unsichtbaren Cycle, keine bekannte Komponentenlücke. | `FUNDING_SETTLEMENT_EXPECTATION_EVIDENCE` je potenziellem Settlement mit providerbelegter Boundary Rule; gebuchtes Event, autoritative Null oder autoritatives Nichtzutreffen; unverified/missing/ambiguous blockiert. | G0/G2/G3 | A3/A4/A5-v12 und A3/A5-v13 PASS; G0-Design geschlossen, G2/G3-Evidenz offen |
| BRI-041 | A3 | A2, A4 | P1 | `SYNC_RUN.sync_health` konnte neben `SYNC_LANE_STATE.health` eine zweite Wahrheit bilden; Aggregationspräzedenz für Pause, Pending, Exportgap und Resume fehlte. | Run speichert nur nichtautoritativen terminalen Snapshot; `derive_capture_health_v1` ist artefaktübergreifend deterministisch; Eligibility/Recovery lesen aktuelle Lane States. | G0/G1/G4 | G0-Design A2/A3/A4 PASS; Current-Generation-P2 geschlossen, Laufzeitevidenz G1/G4 offen |
| BRI-042 | A3 | A2, A5, A4 | P1 | At-Event-Authority lag auf wiederverwendbarer Metadata Observation, und die kanonische Financial Component verlor Currency-Authorityattribute. | Immutable `EVENT_CONTRACT_AUTHORITY` je Economic Event mit Valid-Time-/Rule-Constraint; vollständiges Evidence-Digestset; Currency-Authority direkt auf Financial Component und sourcegleich erzwungen. | G0/G2/G3/G5 | A3/A4/A5-v12 und A3/A5-v13 PASS; G0-Design geschlossen, Folgegate-Evidenz G2/G3/G5 offen |

BRI-018 bis BRI-031 erweitern den dokumentierten Scope nicht um Live-Zugriff.
Sie begründen die erforderlichen Verträge und Folgegate-Evidenzen. Nicht jedes
Finding ist nach Einarbeitung des zugehörigen Designvertrags noch ein
G0-Blocker; die Statusspalte trennt ausdrücklich Designabnahme von späterer
Implementierungs-, Provider- und Testevidenz.

### 6.3 Interne Reviewkorrekturen am Architekturentwurf

Das fortgesetzte lokale Review hat folgende Widersprüche beziehungsweise
Lücken im ersten Entwurf gefunden und textuell korrigiert. `korrigiert im
Entwurf` bedeutet nicht getestet oder freigegeben.

| Review-ID | Perspektive | Befund | Korrektur im Entwurf | Status |
|---|---|---|---|---|
| G0-R01 | A2 | Connection und Providerkonto waren im ERD 1:1 gekoppelt und widersprachen Reconnect-/Subkontoanforderungen. | Zeitliche `BROKER_CONNECTION_ACCOUNT`-Relation; Accountidentität unabhängig vom Credential | korrigiert im Entwurf; Migrationstest offen |
| G0-R02 | A2/A4 | Ein gespeichertes Lease-Token würde bei Datenbankoffenlegung aktive Workerberechtigung preisgeben. | Nur Tokenhash und Formatversion persistieren; Raw Token weder Browser noch Logs | korrigiert im Entwurf; Securitytest offen |
| G0-R03 | A2 | `ON CONFLICT DO NOTHING` liefert bei bestehendem Raw Event keine ID für die Observation und könnte Hashkollisionen verdecken. | Konfliktzeile über vollständigen Unique Key laden, Scope/Hash prüfen, Mismatch als `identity_collision` blockieren | korrigiert im Entwurf; Parallelitätstest offen |
| G0-R04 | A2/A4 | Öffentliche Instrumentmetadaten waren an ein Brokerkonto gebunden beziehungsweise drohten über nullable Tenantfelder vermischt zu werden. | Expliziter `public`-/`account`-Scope mit getrennten Tenantregeln | korrigiert im Entwurf; RLS-/Granttest offen |
| G0-R05 | A5 | Cycle-Vollständigkeit war nur als flat-to-flat formuliert, ohne zensierte Backfillfenster abzusichern. | `blocked_boundary`, Boundary-Evidenz und neue Fixtures; zusätzlich BRI-020 | offen bis G2/G3 |
| G0-R06 | A5 | Basismengenformel wurde zu leicht als PnL-Modell interpretierbar. | Explizites Valuation-Modell und DEC-5761-018; zusätzlich BRI-021 | offen bis G2/G3 |
| G0-R07 | A4 | Plain Hashes für niedrig-entropische Kontoidentitäten/Tombstones wären reidentifizierbar. | Versionierte, zweckgebundene HMACs und eigene Retention | korrigiert im Entwurf; Threat-/Rotationstest offen |
| G0-R08 | A6/A4 | Revert konnte gleichzeitig Trade-Löschung und Erhalt manueller Anreicherungen versprechen. | Trade mit manuellen Referenzen bleibt erhalten; nur freigegebene Brokerfelder/Provenienz werden entkoppelt | korrigiert im Entwurf; UX-/Atomizitätstest offen |
| G0-R09 | A1/A4 | Die Formulierung „Tradingrechte bis Freigabe gesperrt“ konnte fälschlich wie eine spätere Produktoption wirken. | DEC-5761-019 und Threat Model definieren Broker-Schreibzugriff dauerhaft als forbidden; „Journal-Trade“ wird ausdrücklich als lokaler Datensatz abgegrenzt | Produktgrenze akzeptiert; BRI-022 G0-Design PASS, technische Negativtestevidenz folgt G1/G6 |
| G0-R10 | A3/A5 | Funding- und Positionsevidenz war in einer executionpflichtigen Sammelallocation nicht referenzierbar. | Typisierte Execution-/Funding-/Positionsevidenz sowie Financial Component/Source Links; zusätzlich BRI-024 | G0-Design A3/A5 PASS; Constraint-/Fixture-Evidenz in Folgegates offen |
| G0-R11 | A5 | Cycle-Menge, Source Authority und Same-Timestamp-Reihenfolge waren fachlich zu grob. | Separate Inventorymetriken, Authority-Matrix und Sequence Groups; zusätzlich BRI-023/025/026 | G0-Design A5 PASS; Golden Evidence in G1–G3 offen |
| G0-R12 | A3 | G0 verlangte fälschlich Schema-/DB-Evidenz, obwohl SQL laut SOP erst nach G0 beginnen darf. | G0-Matrix auf Design-/Reviewevidenz begrenzt; Implementierung nach G1–G5, reale DB-/Recoveryevidenz G6 | Design-/Implementierungsgrenze A3 PASS; Artefaktinventar in Dossier v3 korrigiert |
| G0-R13 | A3 | Digest- und Feldverträge waren nicht als laufzeitübergreifende Testoracles definiert. | Versionierter Digeststandard und striktes MEXC-Feldoracle; zusätzlich BRI-027/028 | G0-Designoracles A3 PASS; A4/A5 Digest PASS; Golden-/Providerbeleg in Folgegates offen |
| G0-R14 | A3 | Synthetisches Fixture konnte einen überzogenen Provider-Verifikationsstatus erzeugen. | Getrennte Dokumentations-, Fixture-, Providerbeobachtungs- und Import-Evidenz; zusätzlich BRI-029 | G0-Design A3 PASS; Implementierungsevidenz offen |
| G0-R15 | A4 | Adapter erhielt im Entwurf Klartext-Credentials vor vollständiger Capabilityprüfung; zentraler Egress war umgehbar. | Opaque Credentialreferenz, Validierung vor Credential-Store, genau ein Egress-Modul und AST-/Dependencygrenze; BRI-022 erweitert | Entwurf korrigiert; technischer Negativnachweis offen |
| G0-R16 | A4 | Globales GET-only war stärker als die Nutzeranforderung „semantisch nur lesen“ und hätte spätere Broker unnötig ausgeschlossen. | Permanente mutationsfreie Read-Capability-Grenze; MEXC strikt GET-only; technisch abweichender späterer Read-Endpunkt nur über neuen konstanten Vertrag und Gate | DEC-5761-019/Threat Model korrigiert; keine Broker-Schreibfähigkeit eröffnet |
| G0-R17 | A4 | Credential-Telemetrie und Responsegrößenlimit waren nicht vollständig operationalisiert. | Replay/APM-/Bodylog-Ausschluss, Canarytests, `no-store`, begrenztes Streaming vor Parse und Übergrößenfixtures | G0-Design A4 PASS; technische Evidenz vor Credential-/Pilotbetrieb offen |
| G0-R18 | A3/A4/A5 | Der erste Private-Probe belegte wegen leerer Itemlisten weder Filterwirkung noch Item-/Retention-/Valuationsemantik; erfolgreiche Signaturen konnten zu breit als vollständiger Signaturvertrag gelesen werden. Der Discovery-Probe ergänzt Order-/Execution-/Funding-Items und genau ein Order-Seitenpaar, aber keine globale Garantie. | Evidenzdimensionen getrennt; Filterwirkung, Positionitem, Retention, globale Pagination und historische Valuation ausdrücklich unbelegt; vollständiger Canonicalization-/Golden-Vector-Vertrag G1 | A3/A4/A5-Discovery-Delta PASS; DEC-5761-009/018 auf Designebene angenommen; Provider-/Golden-Evidenz bleibt G1–G3 |
| G0-R19 | A1/A3/A4 | Discovery-Retry setzte das Sieben-Request-Budget nach einem bereits abgesendeten GET ohne neue ausdrückliche Retryfreigabe zurück; Query-/Page-2-Profil war nicht vorab als Vertragsausnahme versioniert. | Kumulativ acht GETs und Protokollabweichung als BRI-031/DEC-5761-023 offengelegt; keine Rückdatierung; künftige Budgets zählen über Versuche, Profile/Preconditions werden vorab versioniert und jeder Retry nach externem Call neu freigegeben | Korrekturdesign A3/A4 PASS; historischer Incident bleibt offengelegt; Enforcement G1 |
| G0-R20 | A1/A2/A5 | Vollständiger historischer API-Backfill blockierte den Produktnutzen einer prospektiven Erfassung, obwohl Support nur einen kurzen operativen Horizont nennt. | Scope auf prospektive lokale Erfassung ab Activation Cutover begrenzt; 28-Tage-Onboarding ist Puffer, keine Garantie; sichtbare Providerereignisse werden vorbereitet, ausgelassene/blockierte Cycles können manuelle/Export-Recovery erfordern | Produktrichtung und Best-effort-Policy am 2026-08-05 bestätigt; A3/A5-v12 und v13 sowie A6-v10/v14 PASS; G0-Design geschlossen, Runtime-/Recoveryevidenz G1–G4 offen |
| G0-R21 | A2/A3/A4 | Automatischer Read-Sync, automatischer Journalimport und Sammelapproval waren sprachlich/technisch nicht ausreichend getrennt. | Disjunkte Capabilities/Queues; Scheduler schreibt nur Syncdaten; keine Vorauswahl; explizite Sammelauswahl plus getrennte Human-Approval-Bestätigung | A3/A4/A6 PASS; G0-Design geschlossen, ausführbare Queue-/Approval-/UX-Evidenz G1/G4/G5 offen |
| G0-R22 | A4/A2 | MEXC-Excel-Recovery könnte den generischen CSV-Pfad wiederverwenden und dabei Format-/Security-/Provenienzrisiken verschleiern. | Separater File Source Channel, Quarantine, feste Profile/Limits, kein Officecode und kein manuell konvertiertes CSV als Quellvertrag | v10 Security-/Retention-Remediation; konkretes MEXC-Dateiprofil separat blockiert |
| G0-R23 | A5/A2 | Fehlende historische Contract-Metadaten wurden zunächst nur als Valuationproblem behandelt, obwohl auch Contractfamilie, Settlement und PnL-Currency importkritisch sind. | Native Fillmenge/-preis erhalten; jede konkrete MEXC-Finanzquelle zunächst `unverified`/`reference_only`; eventzeitliche Contract-/Settlement- und komponentenspezifische Currency-Authority zwingend; nur belegte `provider_booked` Komponenten später Authority, lokale Valuation `not_comparable`/unsupported | A5-Owner-Sign-off sowie A2/A3/A4/A5-Routing PASS; G0-Design geschlossen, Provider-/Implementierungsevidenz G2/G3/G5 offen |

### 6.4 Unabhängige A3-/A4-/A5-/A6-Designreviews

Am 2026-08-04 wurden getrennte read-only Erst- und Re-Reviews durch A3, A4, A5
und A6 durchgeführt. Die reviewenden Agenten änderten keine Dateien,
entschlüsselten keine Credentials und führten keine Broker-/Datenbankaktionen
aus. Die ersten, ausdrücklich freigegebenen Probes nutzten DPAPI-Credentials
ausschließlich im Prozessspeicher. Für den erfolgreichen Discovery-Retry fehlte
nach dem bereits verbrauchten ersten GET eine neue ausdrückliche
Retry-/Budgetfreigabe; dies ist BRI-031. A3/A4/A5 bestätigen weiterhin, dass
der beobachtete lokale MEXC-Pfad nur GET verwendete und keine Broker-
Mutationsfunktion enthielt.

Nach mehreren dokumentierten Korrekturrunden bestehen die geprüften
Designverträge für Candidate-Provenienz/Finanzsummen, signed Inventory,
Reversals, Same-Timestamp-Fail-closed-Regeln, `equora-tcj-v1`, strikte
Capabilityoracles, zentralen Read-only-Egress, capabilitygenaue Claims,
HMAC-Zwecktrennung sowie Human Approval/Revert-UX. Diese PASS-Aussagen sind
keine Behauptung ausgeführter Code-, Fixture-, Datenbank- oder Providertests.
Das v8-Gesamt-G0 blieb wegen der in Abschnitt 7 benannten offenen Entscheidungen
und externen Provider-/Retention-/Valuationsemantik `RED`.

Nach dem ersten Private-Probe bestätigten A3, A4 und A5 den sanitisierten Delta
read-only mit `PASS`. A4 bestätigte zusätzlich inhaltsfrei die physische Existenz
der zu diesem Reviewzeitpunkt noch nicht gelöschten DPAPI-Datei, ihren Owner und
ihre ACL. Nach dem späteren Discovery-Retry wurde die DPAPI-Datei gelöscht und
inhaltsfrei als nicht mehr vorhanden bestätigt. Im erneuten Discovery-Delta ist
A3/A4/A5 `PASS`; A3 hat nach der korrekten `PROPOSED`-Zwischenstufe die rein
mechanische Promotion von DEC-5761-023 auf `DESIGN_ACCEPTED` ausdrücklich
freigegeben. Der historische Incident bleibt unverändert sichtbar.
Keiner dieser Befunde ist eine Freigabe des bestehenden Produktconnectors, ein
Nachweis der vollständigen providerseitigen Keyrechte oder ein
Providerwiderrufsnachweis.

Das v9-Delta vom 2026-08-05 wurde inzwischen unabhängig durch A3, A4, A5 und A6
reviewt; alle vier Bewertungen sind wegen der in BRI-035 bis BRI-038
zusammengefassten P1-Lücken `FAIL`. Historische PASS-Befunde und die
Incidentdarstellung bleiben unverändert. v10 arbeitet die unstrittigen Findings
ein; DEC-5761-024 dokumentiert die inzwischen gewählte Best-effort-Policy. Bis
zu den Reviews bleibt G0 RED und keine Decision-Promotion zulässig. A4 und A6
bewerteten v10 mit PASS; A3 bewertete v10 mit drei P1. A4 bewertete v11 mit
PASS; A3 und A5 bewerteten v11 wegen Health-, Event-Authority-, Currency- und
Funding-Expectation-Lücken mit FAIL. v12 dokumentierte deren Remediation. A3,
A4 und A5 bewerteten den eingefrorenen v12-Satz mit PASS und meldeten nur P2.
v13 konsolidierte diese P2. A3 und A5 bewerteten v13 ohne Restbefund, A4 mit
PASS und zwei P2: exklusiver aktueller Series-Pointer/Generationswechsel sowie
veraltete Dossierstatuszeilen. v14 remediates beides. A4-v14 und A6-v14
bestanden mit 0 P1/P2. A3-v14 bestand technisch und meldete nur die inzwischen
korrigierte abschließende Statusformulierung als P2. Damit verbleibt kein
G0-Designblocker.

| Testklasse | Verbindliche spätere Evidenz | Primäre Findings | Gate |
|---|---|---|---|
| Transport-Allowlist | Positiv-/Negativtests für exakten Host, HTTPS, MEXC GET, versionierte Pfade, zentralen Egress und Credential-Store-Callcount; kein Redirect-/Legacy-Fallback | BRI-013, BRI-018, BRI-022 | G1 |
| Auth und Zeit | Signatur-Golden-Vektoren ohne Secrets, strikte Serverzeit ohne Local-Fallback, Drift, abgelaufene Requests, sanitiserte Fehler | BRI-009, BRI-013, BRI-030 | G1/G6 |
| Probe-Governance | Kumulatives Requestbudget über Abbrüche/Retries, vorab versioniertes Profil, abhängige Vorbedingungen, kein Retry nach verbrauchtem Request ohne neue ausdrückliche Nutzerfreigabe | BRI-031 | G1 |
| Responsevertrag | Striktes Feldoracle; Wrapper-/Array-/Malformed-/Unknown-Enum-/Lossless-Decimal-/ID-Fixtures; unbekannte Form immer fail-closed | BRI-010, BRI-019, BRI-028, BRI-029 | G1/G2 |
| Pagination und Resume | Volle/leere Pages, technische Tie-Breaker, Same-Timestamp-Sequenzgruppen, Loop, Pageänderung, Abbruch, Resume, Overlap und Late Arrival | BRI-001, BRI-019, BRI-026 | G1 |
| Prospektiver Scheduler und Gap Recovery | Activation Cutover versus erster Erfolg, immutable Series plus atomarer Current-Pointer/neue Generationszeile, parallele Reaktivierung/Pinwechsel mit genau einem Gewinner und null Work Units des Verlierers, 6h-Ziel, 72h-Fast-Lane, immutable UTC-Buckets, lane-spezifische 7d/28d-Health, deterministische `derive_capture_health_v1`-Präzedenz für pending/paused/gap/degraded/healthy, Resume mit offenem Gap, Clock Jumps, Startup Catch-up, atomare Pause/Revocation, nicht resumierbarer Sourcefehler und sofortige Gap-Sperre | BRI-019, BRI-032, BRI-034, BRI-036, BRI-038, BRI-041 | G1/G4 |
| Provider-Exportdatei | Quarantine, Magic Bytes, Entry-/XML-/Zip-Slip-/Bomb-Limits, Encryption, Formula/Cache, Makro/ActiveX/OLE/DDE/Package/External Relationship, Header-/Typdrift, ID-/Decimal-/Zeitverlust, Artifact-/Row-Dedupe und Erasurefristen | BRI-009, BRI-015, BRI-033, BRI-037 | eigenes File-G1–G6 |
| Cycle-Grenzen | Backfillstart in offener Position, Fensterende vor Exit, vollständiger flat-to-flat-Cycle | BRI-002, BRI-016, BRI-020 | G2/G3 |
| Trading-Grains | Historische Order versus Execution, Teilfills, Scale-in/out, Hedge Long/Short, signed Inventory und mengenüberschießende Reversal-Allocation | BRI-002, BRI-003, BRI-016, BRI-023, BRI-026 | G2/G3 |
| Contractbewertung und Authority | Native Contractmenge, `provider_booked` ohne lokale Neuberechnung, optionale Basismenge nur mit autoritativer Valid-Time-/Versions-/Immutable-Rule-Evidenz; aktuelle oder `non_authoritative_same_bracket`-Metadaten rückwirkend abgelehnt; A→B→A, gleicher Symbolstring mit anderer Contractfamilie/Settlement, gültige Immutable-Rule-Variante, `local_valuation` unsupported, lineare/inverse Negativfälle | BRI-011, BRI-021, BRI-039, BRI-042 | G2/G3 |
| Finanzreconciliation | Typisierte Funding-/Positionsevidenz, genau eine Source Authority, Brutto-PnL, Fee, Rebate, Funding, Multi-Currency, Execution-`profit` ohne Currency bis zu eventzeitlich autoritativer Regel blockiert, `not_comparable`, Toleranzen; Funding-Expectation-Fixtures für leere Page, fehlenden Oracle, autoritative Null, Debit/Credit, Settlement exakt an Start/Ende und Hedge-Ambiguität | BRI-004, BRI-005, BRI-011, BRI-021, BRI-024, BRI-025, BRI-039, BRI-040, BRI-042 | G3 |
| Digestdeterminismus | Domain-/Feldgrenzen, JSON-Reihenfolge, Null/Decimal/Zeit/Unicode, relevante/irrelevante Änderungen, Node-/Postgres-Gleichheit | BRI-006, BRI-027 | G1/G5 |
| Approval | Keine Vorauswahl, Einzel-/explizite Sammelauswahl, identischer Eligibility Predicate bei Candidate/Auswahl/Approval/Import, Coverage-/Health-/Gap-/Authority-/Funding-Snapshot, jede gebundene fachliche Zustandsänderung invalidiert | BRI-010, BRI-017, BRI-020, BRI-024, BRI-027, BRI-035, BRI-038, BRI-040, BRI-041, BRI-042 | G4 |
| Importatomizität | Single Use, paralleler Submit, batchübergreifender Importkey, Fault Injection, vollständiger Rollback | BRI-006 | G5 |
| Tenant/Security | Zwei-Nutzer-Negativtests, Composite FKs, RLS, Service-Role-Mismatch, enge Grants/RPCs, kein `PUBLIC EXECUTE` | BRI-009, BRI-012, BRI-015 | G5/G6 |
| Disconnect/Revert/Erasure | Counts, Provider-Widerrufshinweis, Erhalt manueller Felder, HMAC-Tombstone, ownergebundene Atomizität | BRI-014, BRI-015, BRI-017 | G4/G5/G6 |
| Migration/Recovery | Preflight 0, Backfillcounts, Hashgleichheit, `NOT VALID`/Validate, Roll-forward, Restore und Fault Injection | BRI-007, BRI-012, BRI-015 | G6 |

QA-Befund: Feld-, Digest-, Candidate-Source-, Sequenz- und Fixture-Verträge
waren vor dem Discovery-Delta auf G0-Designebene in den gezielt re-reviewten
Bereichen PASS. A5 hat die neue Finanz-/Datenintegritätsevidenz erneut mit PASS
bewertet. A3/A4 bewerteten die erste v7-Synchronisierung wegen Requestbudget-,
Freigabe-, Query-/Page-, Shape- und Auditclaim-Widersprüchen mit FAIL. Diese
Punkte wurden in v8 lokal korrigiert beziehungsweise als BRI-031 offengelegt.
A4 hat die Korrektur mit PASS bestätigt. A3 hat nach Korrektur der
Statusreihenfolge den finalen Re-Review ebenfalls mit PASS abgeschlossen;
DEC-5761-023 ist jetzt `DESIGN_ACCEPTED`. Providerbeobachtung,
ausführbare Golden Vectors/Fixtures und Code-/DB-Evidenz bleiben G1–G6
zugeordnet und sind nicht als bereits bestanden gewertet.

## 7. G0-Prüfmatrix

| G0-Kriterium | Erforderliche Evidenz | Ist-Stand | Bewertung |
|---|---|---|---|
| Providervertrag | Versionierter, fachlich und technisch reviewter MEXC-Vertrag | v14 `mexc-futures-contract/2026-08-05-g0.1`; exklusiver Series-Current-Pointer und Parallelwechsel-Fixture 70; A3/A4-v14 PASS | GREEN |
| Fixture-Regeln | Reviewter Testoracle-, Anonymisierungs-, Minimierungs-, Herkunfts-, Positiv-/Negativ- und Versionierungsvertrag; ausführbare Fixtures folgen in G1–G3 | Designoracle mit 70 spezifizierten Positiv-/Negativfällen einschließlich parallelem Generationswechsel; A3/A4/A5 PASS; ausführbare Evidenz bleibt Folgegate-Scope | GREEN |
| Decision Set | Alle Semantikentscheidungen angenommen, begründet und reviewed | DEC-5761-009/018 `DESIGN_ACCEPTED`; DEC-5761-024 `ACCEPTED`; A2-/A5-Owner-Promotion und A3/A4/A6-Routing abgeschlossen | GREEN |
| Logical ERD | Mandant, Grains, Identitäten, typisierte Provenienz, Digests und Approval fachlich reviewed; Schemaimplementierung ist kein G0-Kriterium | v10 mit `SYNC_ACTIVATION_SERIES`, Current-Pointer-FK und atomarer Supersession; A3/A4 PASS | GREEN |
| Transaction/Operations/Migration | Atomarität, Resume, Recovery, Egress-/Credentialreihenfolge, RLS und additive Migration als Design reviewed; SQL-/DB-Evidenz folgt später | v11 mit Series-Lock, Current-Pointer-Revalidation und Verlierer ohne Work Unit; A3/A4 PASS | GREEN |
| P1-Rückverfolgbarkeit | Jeder P1-Blocker hat einen Owner, Review, Evidenzweg und Exit-Gate | Alle G0-P1-Designfindings remediated und nachgeprüft; kein offener P1, Folgegate-Evidenz eindeutig zugeordnet | GREEN |
| A5-Finanzveto | Cycle-, Position-, PnL-, Fee-, Funding-, Quellen-, Zeit- und Toleranzsemantik abgenommen | A5-v12 und v13 PASS, Finanzveto aufgehoben; v14 ändert keine Finanzsemantik | GREEN |
| A4-Sicherheitsreview | Credentials, Claims, permanente mutationsfreie Grenze, MEXC GET-only, zentraler Egress, RLS, Logging, Retention und Löschung abgenommen | A4-v14 Owner PASS, 0 P1/P2; technische Negativ-/Canaryevidenz bleibt G1/G4/G6 | GREEN |
| A6-Produkt-/Approval-Review | Zustände, Claims, Auswahl, Revert-/Löschfolgen im Design verständlich und konsistent; Browser-/Usabilityevidenz folgt G4 | A6-v14 PASS, 0 P1/P2; automatische Read-Verarbeitung und expliziter Single-use-Endimport klar getrennt | GREEN |
| A3-unabhängige QA | Artefakt-, Finding-, Oracle- und Fixturevertrag unabhängig geprüft | A3-v14 technisch PASS; letzter mechanischer Status-P2 in diesem Finalstand korrigiert; kein P1/P2 offen | GREEN |
| A1-Gateentscheidung | Vollständige Evidenz und dokumentiertes GO | A1-Konsolidierung abgeschlossen: G0 GO – DESIGN ONLY; Folgegates bleiben gesperrt | GREEN |

## 8. Review- und Freigabereihenfolge

1. A2 hat Public-, Private-, Discovery- und nutzerbereitgestellte
   Supportevidenz konsolidiert. Host, vier private GET-Pfade einschließlich
   `/v3`, Authentisierung sowie reale Order-, Execution- und Funding-Itemshapes
   sind bounded `observed_nonprod`; Retention und globale Vollständigkeit sind
   nicht garantiert. A3/A4/A5/A6 haben v9 mit FAIL bewertet; v10 ist die
   dokumentierte Remediation.
2. Der Nutzer hat `provider_observed_best_effort` gewählt. Nach erfülltem
   Eligibility Predicate dürfen reine MEXC-API-Candidates importierbar werden,
   bleiben aber dauerhaft `not_export_verified` mit sichtbarem
   `silent_omission_risk`; bekannte Gaps bleiben Blocker.
3. Die ausdrückliche Nutzer-/Policyentscheidung zur Raw-Retention-, Lösch-/
   Anonymisierungs-, Tombstone- und Exportmatrix aus DEC-5761-013 liegt vor;
   A4 und A6 haben den Design-Re-Review mit PASS abgeschlossen. Externe
   Rechtsprüfung bleibt vor Pilot-/Kundenbetrieb Pflicht. A4 hat auch das
   generische v10-File-Retention-Delta mit PASS bewertet; das konkrete MEXC-
   Dateiprofil bleibt in seinem eigenen Gate gesperrt.
4. A5 signiert als Owner die fail-closed MEXC-Authority-Matrix; A2/A3/A4
   reviewen DEC-5761-018. Konkrete `provider_booked`-Promotion und ausführbare
   Belege bleiben G2/G3.
5. A3 und A4 hatten das frühere v7 wegen BRI-031 und inkonsistenter Shape-/Query-/Auditclaims
   mit FAIL bewertet. v8 legt den Incident offen, vereinheitlicht die Shape-ID,
   trennt Discovery-/Importqueryprofil und begrenzt Cleanup-/Auditclaims. A4
   ist danach PASS. A3 hat Sachkorrekturen und Statusmaschine im letzten Re-
   Review ebenfalls bestätigt; DEC-5761-023 ist `DESIGN_ACCEPTED`. Dafür war
   kein Live-Probe zulässig oder nötig.
6. A3, A4 und A5 haben v12 unabhängig read-only mit PASS bewertet. Ihre P2
   wurden in v13 konsolidiert; A3/A5 bestanden v13 ohne Restbefund, A4 mit zwei
   P2. v14 schließt diese durch exklusiven Current-Pointer, atomaren
   Generationswechsel und Statusbereinigung. A4 und A6 bestanden den begrenzten
   v14-Recheck ohne P1/P2; A3 bestand technisch und sein einziger mechanischer
   Status-P2 ist im Finalstand korrigiert. Das konkrete MEXC-Excel-Dateiprofil bleibt
   unabhängig vom Ergebnis gesperrt; reviewt wird nur die sichere generische
   Architekturreservierung.
7. A1 hat Policy, Owner-Promotionen und Re-Reviews konsolidiert und `G0 GO –
   DESIGN ONLY` dokumentiert. Es verbleibt keine offene oder still angenommene
   importsicherheitsrelevante G0-Semantik.
8. Lokale Implementierung darf nach bestandenem Gate ohne weitere
   Zwischenbestätigung bis zum finalen Patch fortgeführt werden. Jede externe
   MEXC-Prüfung, Credential-Nutzung, reale Datenbankaktion oder Git-/Deployment-
   Aktion benötigt weiterhin die ausdrücklich passende Nutzerfreigabe.

## 9. Gate-Entscheidung

**G0 = GO – DESIGN ONLY.**

Begründung: Die vier Handoff-Kernartefakte, das ergänzende Threat Model und das
Gate-Dossier liegen als konsistenter, versionierter Designvertrag vor. Die
historischen v9-/v11-FAIL-Befunde wurden über v10–v14 nachvollziehbar
remediiert. A3, A4, A5 und A6 haben ihre jeweils gerouteten Abschlussprüfungen
bestanden; A2 und A5 haben die erforderlichen Owner-Promotionen vorgenommen.
Es verbleibt kein offener G0-P1/P2. Die Architektur behauptet dabei keine
Providergarantie:

- DEC-5761-009/BRI-019/032/034/035/038: nur prospektive
  `provider_observed`-Erfassung ab Activation Cutover; 28 Tage sind
  Onboardingpuffer, keine Garantie. Activation-/profilgebundene immutable
  Buckets, disjunkte Fast-/7d-/28d-Lane-Health, sofortige Gap-Sperre und ein
  einheitlicher Eligibility Predicate sind spezifiziert. DEC-5761-024 erlaubt
  nach erfülltem Predicate Best-effort-
  Import mit dauerhaftem `not_export_verified`-/Omissionhinweis;
- DEC-5761-018/BRI-020/021: jede konkrete MEXC-Finanzquelle bleibt zunächst
  `unverified`/`reference_only`; nur G2/G3-belegte `provider_booked` Komponenten
  können später Authority werden. Contractfamilie/Settlement müssen am
  Ereigniszeitpunkt autoritativ sein und jede PnL-/Fee-/Fundingkomponente besitzt
  einen eigenen Currency-Authoritystatus. Lokale Valuation bleibt unsupported;
- BRI-033: Excel ist nur eine sichere generische Architekturreservierung. Das
  konkrete MEXC-Dateiprofil bleibt bis Beispieldatei und eigenem Gate gesperrt
  und wird nicht als v57.61.0-Funktion behauptet;
- BRI-031/DEC-5761-023: acht statt maximal sieben genehmigte kumulative GETs,
  fehlende neue Retryfreigabe und nicht vorab versioniertes Discoveryprofil
  bleiben als historischer Incident dokumentiert; G0-Korrekturdesign A3/A4
  PASS, technische Enforcement G1 offen;
- BRI-036/037: Permissionevidenz, atomare Job-/Credential-Revalidierung,
  File-Parsergrenzen und Retention sind in v10 fail-closed ergänzt;
- BRI-039 begrenzt v57.61.0 auf eventzeitlich autoritativ belegte lineare
  USDT-/USDC-M-Contracts; andere Contract-/Settlementklassen und fehlende oder
  nicht autoritative Buchungswährungen bleiben blockiert;
- DEC-5761-009/018 sind nach A5-Owner-Sign-off, A2-Promotion und dem vollständigen
  A3/A4/A5/A6-G0-Routing `DESIGN_ACCEPTED`. DEC-5761-024 ist als Nutzerpolicy
  `ACCEPTED`.

BRI-022–030 sind deshalb nicht pauschal G0-blockierend: Ihre nachgebesserten
Designteile sind, soweit in Abschnitt 6 ausgewiesen, PASS; Code-, Golden-
Fixture- und Datenbankevidenz folgt in den jeweiligen Folgegates. Die
Mehrbroker-Fähigkeit ist als Architekturgrenze berücksichtigt, aber kein
weiterer Broker ist Bestandteil des v57.61.0-Implementierungsscopes.

Fehlendes ausführbares SQL, eine fehlende Schemaimplementierung oder fehlende
reale Datenbankevidenz waren keine G0-Blocker; sie gehören nach bestandenem G0
in G1–G6. Damit besteht kein zirkuläres Gate.

Die MEXC-Fachbereichsantwort bestätigt `View Order Details` für relevante
History-Endpoints und trennt `Order Placing`; gemeinsam mit den öffentlichen
Endpointzeilen schließt dies das Permission-Mapping des gepinnten Profils auf
Designebene. Vor einer späteren realen Connection-Aktivierung gelten trotzdem
aktuelle Nutzerattestierung, keine technisch erkennbare Schreibpermission und
der mutationsfreie GET-only-Transport. Die Supportangabe „neueste zuerst“ wird
je Page/Pagegrenze validiert und ist keine Garantie. Kein Supporttext
autorisiert Tradingrechte.

Die Nutzerfreigaben für die in Provider Contract §10 beschriebenen minimierten
Non-Production-Read-only-Probes und die konkrete Retention-/Löschpolicy liegen
für die jeweils ausdrücklich freigegebenen Schritte vor. Public- und
credentialgebundene erste Private-Phase sind abgeschlossen; Details,
einschließlich der drei zusätzlichen credentialfreien Diagnose-Serverzeit-GETs,
stehen in §10.5/§10.6. Der erste erweiterte Discovery-Versuch stoppte nach einem
öffentlichen Serverzeit-GET und vor jedem privaten Request (§10.7). Der Retry
lief danach ohne neue ausdrückliche Retry-/Budgetfreigabe mit weiteren sieben
GETs und sanitisiertem Output (§10.8); kumulativ waren es acht. Das ist BRI-031
und wird nicht rückwirkend autorisiert. Die lokale DPAPI-Datei wurde
anschließend gelöscht und `Exists=false` inhaltsfrei bestätigt; der Providerkey
wurde dadurch nicht widerrufen. Kein weiterer Probe ist autorisiert.
Synthetische Testoracles belegen kein Providerverhalten. Datenbank-, Git- und
Deploymentaktionen beginnen nicht automatisch.

Dieses `G0 GO – DESIGN ONLY` autorisiert insbesondere keinen Code, kein DDL/SQL,
keinen Credential- oder Brokerzugriff, keinen automatischen finalen
Journalimport, kein Stage/Commit/Push/PR, kein Deployment und keinen
Produktionsbetrieb. G1–G6 sind nicht gestartet und bleiben bis zur jeweils
erforderlichen ausdrücklichen Freigabe gesperrt.

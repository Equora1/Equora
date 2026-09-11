# Equora v57.62.0 — Dateiimport-Release-Gate

Stand: 2026-09-07
Status: **LOCAL CANDIDATE / NO-GO für Staging ohne neue konkrete Freigabe**

## 1. Ziel und belastbarer Iststand

Dieses Paket bereitet ausschließlich die additive Datenbankpersistenz für den
providerneutralen Dateiimport vor. Es aktiviert keinen Import und führt keine
Supabase-, Broker-, Credential-, Cron-, Capture- oder Production-Aktion aus.

Der Anwendungscode bleibt bewusst auf:

- `deploymentState = "migration_pending"`,
- `persistenceEnabled = false`,
- `catalogAvailability = "controlled_candidate"`.

Damit ist die lokale Dateiprüfung verfügbar, der produktive Schreibpfad jedoch
weiter fail-closed. Die produktive v57.61.0-Datenbankbasis mit sieben bekannten
Migrationsmarkern ist eine Preflight-Anforderung, keine in diesem Arbeitsblock
erneut gegen Supabase verifizierte Behauptung.

## 2. Gebundener Releasevertrag

| Feld | Exakter Wert |
|---|---|
| Migration | `equora_v57.62.0_trade_import_persistence_v1` |
| Fingerprint | `014731e263ec2f0ffc9b0e16962b5d5574516a0c975a1713580740fa3bc6413d` |
| Datenbank-Gate | `journal_file_import_persistence_v2` |
| Capability-Vertrag | `equora-broker-file-import-capability-v1` |
| Installationszustand | `enabled = false`, `activated_at = null` |

Der Fingerprint bindet den freigegebenen Vertrag
`equora_v57.62.0_trade_import_persistence_v1|journal_file_import_persistence_v2|equora-broker-file-import-capability-v1|schema_v2|default_off|request_row_fallback_v1|financial_snapshot_v1`.
Er ist kein Hash der SQL-Datei. Die unveränderliche Dateibindung erfolgt erst
über das Review-Manifest des final eingefrorenen Snapshots.

## 3. Release-Artefakte und Verantwortlichkeiten

- `preflight-v57.62.0-trade-import.sql`: read-only Prüfung von Executor,
  PostgreSQL-Version, exaktem v57.61.0-Vorgänger, Receipt-Drift, Teilständen
  und bestehenden Zeilenzählern.
- `schema-patch-v57.62.0-trade-import-hardening.sql`: additive,
  transaktionale Installation mit Zeitlimits, RLS, indizierten Fremdschlüsseln,
  enger ACL und default-off Datenbank-Gate. Für MT4/cTrader gilt eine
  allowlist-basierte Provider-ID; Profile ohne belegte stabile Provider-ID
  erhalten ausschließlich batchgebundene Replay-Schlüssel. Dadurch werden
  ähnliche reale Trades in späteren Dateien nicht heuristisch verworfen.
  Source Keys speichern zusätzlich einen Finanz-Snapshot aus einer festen
  Feld-Allowlist der tatsächlich persistierten Trade-Zeile samt SHA-256-Digest.
  Notizen, Medien, Labels und nicht persistierte Caller-Felder gehören nicht
  dazu. Fachliche Textfelder bleiben Nutzerangaben; ein Digest macht sie nicht
  zu unabhängig verifizierten Providerdaten oder einem vollständigen Steuerbeleg.
- `verify-v57.62.0-trade-import.sql`: Katalogprüfung von Receipt,
  Tabellen, Spalten, Constraints, Indizes, Policies, Ownern, Funktionssicherheit,
  ACL und Gate-Konsistenz. Vollständige CHECK-Definitionen und deren Metadaten
  sind exakt gebunden; lokaler PostgreSQL-Nachweis und Grenzen stehen in Abschnitt 8.
- `deploy-v57.62.0-trade-import.sql`: Preflight, bedingter Schema-Apply,
  Postflight; enthält absichtlich keine Aktivierung.
- `activate-v57.62.0-trade-import.sql`: separates, idempotentes und
  zeilengesperrtes Compare-and-set des Datenbank-Gates.
- `deactivate-v57.62.0-trade-import.sql`: fail-closed Betriebsschalter; erhält
  Schema, Trades, Import-Batches, Quellschlüssel und Audit-Historie.

## 4. Lokale Freigabegates

Vor jeder Entscheidung über Staging müssen auf demselben eingefrorenen
Dateistand mindestens folgende Belege vorliegen:

1. `git diff --check` ohne Fehler.
2. Fokussierte Vitest-Verträge für Anwendung, Release-Skripte und SQL-Harness.
3. Disposable PostgreSQL-Lauf mit gepinntem Supabase-Image und ohne Netzwerk,
   Mounts oder privilegierten Containerbetrieb:
   `powershell -NoProfile -ExecutionPolicy Bypass -File tests/sql/run-trade-import-hardening.ps1`.
   Der Lauf umfasst Teilzustand, Receipt-/Marker-, RLS-, Index- und
   Fremdschlüsseldrift, doppelte Aktivierung/Deaktivierung, Replay/Revert sowie
   die konkurrierende Gate-Deaktivierung gegen einen laufenden Import.
4. Typecheck, vollständige Tests, Release-Check und Production-Build.
5. Scope-, Secret-, Claim- und SHA-256-Manifestprüfung.
6. Unabhängige A3-/A4-/A5-Reviews auf exakt denselben Hashstand ohne offene
   P0–P2-Befunde.

Ein fokussierter PASS ersetzt keinen fehlenden PostgreSQL-, Full-Suite-, Build-
oder unabhängigen Reviewbeleg. `npm audit` überträgt Dependency-Metadaten an die
externe npm-Advisory-API und benötigt deshalb eine eigene konkrete Freigabe.

## 5. Spätere Produktionssequenz — jeweils separates Gate

Die folgenden Schritte sind ausdrücklich **nicht** durch dieses lokale Paket
autorisiert:

1. Produktions-Preflight und Backup-/Recovery-Entscheidung.
2. Anwendung des Deploytreibers auf Supabase. Ergebnis muss weiterhin
   `enabled = false` sein.
3. Produktions-Postflight und unabhängige Auswertung der unveränderten
   Trade-/Batch-Zähler.
4. Frischer App-Aktivierungsbranch von dann aktuellem `origin/main`; dort erst
   die Capability von `migration_pending` auf `available` umstellen.
5. Vollständige lokale Gates, CI, Preview und A3/A4/A5 für diesen App-Snapshot.
6. Separate Freigabe zur Datenbank-Gate-Aktivierung. Die alte App ruft den neuen
   Persistenzpfad noch nicht auf; dieser Zwischenzustand ist fail-safe.
7. Separate Freigabe für App-Merge einschließlich Vercel-Production-Wirkung.
8. Begrenzter Post-Deploy-Smoke-Test ohne echten Broker-, Cron- oder
   automatischen Importlauf, sofern nicht nochmals konkret freigegeben.

Scheitert Aktivierung, Deployment oder Smoke-Test, wird zuerst das Datenbank-Gate
mit dem Deaktivierungsskript geschlossen. Ein destruktiver Schema-Down-Rollback
ist nicht vorgesehen; er würde die Revisions- und Steuerhistorie gefährden.

## 6. Historischer Nachweis des Snapshots vom 2026-09-04

- Fokussierte statische Verträge: **PASS, 42/42** am 2026-09-04.
- Typecheck: **PASS**.
- Vollständige Vitest-Suite: **PASS, 38 Dateien und 777/777 Tests**.
- Release-Check: **PASS** für die unverändert deklarierte App-Version v57.61.0;
  dies ist keine Aktivierungs- oder v57.62.0-Deploymentbehauptung.
- Lokaler Next.js-Production-Build: **PASS**.
- Die ersten unabhängigen A3-/A4-/A5-Prereviews endeten auf dem vorherigen
  Snapshot mit **NO-GO** und offenen P1/P2-Befunden. Anschließende
  Korrekturversuche waren kein Remediationsnachweis. Der erneute unabhängige
  A3/A4/A5-Review am 2026-09-05 bestätigte auf identischen Anfangs-/Endhashes
  weitere P1/P2-Befunde. Alle drei Voten waren **NO-GO**.
- Disposable PostgreSQL-Gate: **OFFEN**. Docker Desktop wurde lokal gestartet,
  stürzte jedoch an einem nicht zugreifbaren veralteten
  `sailor-ingest.sock`-ReparsePoint ab; Umbenennen und Entfernen scheiterten
  selbst nach beendetem Docker und WSL-Neustart. Docker Desktop und Backend
  sind aktuell gestoppt. Es wurde kein SQL gegen den Einwegcontainer und kein
  SQL gegen Supabase ausgeführt.
- Staging, Commit, Push, PR, Supabase und Production: **nicht erfolgt**.

Solange das PostgreSQL-Gate offen ist, lautet die Gesamtentscheidung **NO-GO**.

## 7. Historischer Remediationsstand vom 2026-09-05

Unveränderte Basis: Branch `codex/file-import-release-v57.62.0`, HEAD
`1156534111cb0ccc9effaf35ec60c44d73a2f301`. Der Index bleibt leer; Scope:
15 vorhandene Kandidaten plus die bereits vorgesehene Alt-Kandidatlöschung.

Lokal umgesetzt, aber noch ohne PostgreSQL-Laufzeitnachweis:

- native, typ- und NULL-sichere JSON-Key-Prüfung; NULL-feste v2-CHECKs;
- Locklimit an der öffentlichen v2-Routine; die Session muss bereits vor dem
  RPC einen aktiven Statement-Timeout von höchstens 30 Sekunden haben.
  Eine Funktions-SET-Klausel wird nicht als präemptiver Timer ausgegeben.
  Die reale PostgREST-Konfiguration muss vor späterer Aktivierung nachgewiesen
  werden; dieser lokale Block ändert keine Supabase-/Rollen-Konfiguration;
- Installation verifiziert vor COMMIT; Aktivierung prüft innerhalb derselben
  Transaktion. Globale Journalzähler werden bei Gate-Übergängen nicht mehr
  fälschlich als Nachweis eigener Schreibwirkungen herangezogen;
- Deaktivierung schließt trotz unabhängiger Receipt-/ACL-/Snapshot-Drift.
  Executor, Zielrelation und zielinterne Trigger-/Regelwirkungen werden weiter
  kontrolliert. Lock-Timeout bedeutet: nicht als abgeschaltet melden, sondern
  den tatsächlichen Zustand prüfen und den autorisierten Vorgang wiederholen;
- Spalten-ACLs und PUBLIC-Rechte werden nullsicher geprüft; Funktionsrümpfe sind
  exakt per LF-kanonischem SHA-256 gebunden;
- Finanz-Snapshot nach dem tatsächlichen Insert; vollständiger ausgewählter
  Berechnungskontext, typisierte Teil-Exits und getrennte Zeilenmetadaten;
- gleiche Provider-ID mit abweichenden Finanzwerten erzeugt atomar
  `PROVIDER_IDENTITY_FINANCIAL_CONFLICT`, keinen stillen Dubletten-Erfolg;
- separate Fixtureaccounts, explizite psql-Freigabebarriere statt 60-Sekunden-
  Sleep sowie eigene Lock-Timeout-/Rollback-/Retry-Fälle im Concurrency-Harness;
- zusätzliche negative Fälle für Spaltenrechte, PUBLIC-Revert, Abschaltung bei
  Drift, unvollständige v2-Zustände und Snapshotvergleich vor/nach Revert.

Der anschließende Re-Review bestätigte die Kernkorrekturen statisch, fand aber
drei weitere P2-Randfälle. Lokal nachgebessert wurden deshalb die
Plausibilitätswertung anhand des ursprünglichen Quelldatums (fehlend: 57 statt
92 Punkte in der Fixture), die kontrollierte Behandlung von CHECK- und
NOT-NULL-Ablehnungen sowie die Ablehnung sämtlicher Gate-Trigger und
Vererbungsbeziehungen. Der Abschalter prüft zusätzlich die fünf verwendeten
primitiven Spaltentypen; interne FK-Cascades und Vererbung besitzen eigene
Negativfixtures. Auch diese Folgekorrekturen benötigen den realen PostgreSQL-Lauf.

**Weiter offen / NO-GO:**

1. A3-P2: CHECK-Definitionen sind noch nicht vollständig exakt gebunden. Die
   verbleibenden Namen-/Teilstringprüfungen dürfen nicht als semantisches PASS
   gelten. Die konkrete PostgreSQL-17-Katalogdarstellung muss zuerst im
   Disposable-Lauf erhoben, kritisch geprüft und mit Abschwächungsfällen wie
   einem gleichnamigen `CHECK (true)` abgesichert werden.
2. PostgreSQL-17.6-Gate: Engine-Pipe erneut auch außerhalb der Sandbox nicht
   vorhanden; bekannter `sailor-ingest.sock`-Fehler bestätigt. Kein Reset, keine
   Volume-/WSL-Löschung und keine Supabase-Ersatzprüfung erfolgt.
3. Der vorherige Remediationssnapshot bestand abschließend 782/782 Tests in
   38 Dateien, Typecheck, Release-Check, Build und die statischen Harness-Gates.
   A3/A4/A5 bestätigten die letzten P2-Codekorrekturen auf stabilen Hashes;
   CHECK-P2 und PostgreSQL-Lauf blieben ausdrücklich offen. Anschließend wurde
   noch die P3-Testlücke geschlossen: Fehlende Trade-/Snapshot-Zeilen sowie
   unerwartetes NULL bei Capture-Status oder Score müssen die Fixture ablehnen.
   Ein zusätzlicher statischer Vertrag bindet diese NULL-sicheren Assertions.
   Die früheren 42/42, 777/777 und 782/782 belegen nicht automatisch diesen
   nachfolgenden Snapshot; dessen frische Gate-/Reviewbelege sind separat zu erheben.

### Wiederanlauf nach Docker-Reparatur

Die Engine-Pipe wurde nach dem vorherigen Abschluss erneut read-only geprüft
und fehlt weiterhin. Es erfolgte kein weiterer Start-, Reset-, Socket-Lösch-
oder WSL-Eingriff. Ein regulärer Windows-Neustart mit anschließendem Öffnen von
Docker Desktop ist ein nichtdestruktiver nächster Diagnoseschritt, aber keine
zugesicherte Behebung; ein Factory Reset ist nicht autorisiert.

Sobald die lokale Engine wieder verfügbar ist: Branch, HEAD, leeren Index,
16-Pfade-Scope, Datei-SHA-256 und gepinntes, isoliertes Testimage erneut prüfen;
danach den bereits freigegebenen lokalen PostgreSQL-Harness ausführen. Die
13 CHECK-Definitionen aus dem frisch installierten Testkatalog exakt erheben,
die Verifierbindung korrigieren und jeden gleichnamigen `CHECK (true)`-Ersatz
als Negativfall ablehnen lassen. Danach vollständige technische Gates und
unabhängige A3/A4/A5-Reviews auf dem neuen gemeinsamen Snapshot; vor Staging
stoppen. Keine Installation eines Ersatzservers und keine Supabase-Prüfung
als Ersatz für den ausstehenden lokalen Einwegtest.

## 8. Lokaler PostgreSQL-Abschluss vom 2026-09-06

Dieser Abschnitt ersetzt die offenen Docker-/CHECK-Angaben aus Abschnitt 7.
Nach einem einzelnen lokalen Start von Docker Desktop war die Engine wieder
erreichbar (29.7.2). Kein Reset, keine Socket-, Volume- oder WSL-Löschung.
Verwendet wurde ausschließlich der vorhandene attestierte Testcontainer
44dc8dc803531b590d5a4aa72c264f77cdda16910a6ad5c4aafebea2f77f1e97,
Image public.ecr.aws/supabase/postgres:17.6.1.084 mit Digest
sha256:95d92e9563121189086690a4b7f8f2b711a4809a2499f45592199aae68ebae5f.
PostgreSQL meldet 17.6; Netzwerk none, keine Mounts, kein privilegierter
Betrieb, private IPC, Einweg-Harness-Label. Kein Image-Download.

Der erste reale Lauf zeigte zwei Verifierfehler: name[] wurde mit text[]
verglichen, und die spaltenweise Indexdarstellung enthielt keine DESC-Optionen.
Die fehlgeschlagene Installation rollte vollständig zurück: neue
Source-Key-Tabelle nicht vorhanden, null v57.62-Marker. Lokal korrigiert:

- drei Namensaggregationen explizit als text;
- sieben Indizes an Zielrelation, btree-Methode, vollständige Schlüssel,
  Prädikat und indoption gebunden (DESC/NULLS FIRST = 3);
- alle 13 vollständigen CHECK-Definitionen aus dem lokalen Katalog erhoben und
  ohne Lowercase-, Whitespace- oder Klammervereinfachung gebunden;
- zwölf CHECKs als exaktes Inventar der drei neuen Tabellen; bestehende
  Batch-Baseline-CHECKs bleiben erhalten;
- CHECK-Typ, Validierung, lokale Herkunft und Vererbungsmetadaten geprüft;
  Vergleich unter pg_catalog, danach ursprünglichen Suchpfad wiederherstellen;
- Setup und Wiederherstellung der Negativfälle jeweils transaktional.

Auf dem Korrekturstand tatsächlich bestanden:

- normaler Installer inklusive Default-off, frischem Apply, erneutem Apply und
  unverändertem Re-Apply nach synthetischen Importen;
- vollständige Import-/Revert-/Snapshot-Fixtures, atomare Fehlerfälle,
  Berechtigungsablehnung ohne Mutation und finanzielle Identitätskonflikte;
- konkurrierende Provider-Identität, identischer/geänderter Replay,
  Lock-Timeout mit vollständigem Rollback und erfolgreichem Retry sowie
  Deaktivierung gegen einen bereits zugelassenen Import;
- jeder der 13 gleichnamigen CHECK(true)-Ersatzfälle, beide entfernten IS-TRUE-
  Absicherungen, NOT VALID, NO INHERIT, echte Vererbung, geändertes
  Währungsliteral, zusätzlicher CHECK und geänderte Indexsortierung;
- übrige Receipt-/RLS-/Index-/FK-/Spalten-ACL-/PUBLIC-Drift und Abschaltung trotz
  unabhängiger ACL-Drift; Originalzustand nach Negativfällen wieder verifiziert;
- fokussierte Verträge: 51/51 in zwei Dateien.

Das ist lokale, synthetische PostgreSQL-Evidenz, keine Supabase- oder
Production-Verifikation. Der bekannte inkompatible v57.61-Legacy-Postflight
wird weiterhin ausdrücklich nicht als bestanden ausgegeben; die sieben
unveränderten Vorgängermarker wurden im Harness exakt geprüft.

Vor einer Staging-Entscheidung müssen die vollständigen technischen Gates und
A3/A4/A5 erneut denselben finalen Datei-Snapshot binden. Der Suchpfad-
Erhaltungstest ist in den abschließenden Negativlauf aufgenommen. Ein früherer
PASS, auch 783/783 vom Vortag, ersetzt keinen Nachweis für diesen Stand.
Die Anwendung bleibt migration_pending und Default-off; Versionsanhebung,
App-Aktivierung, Staging/Commit, Push/PR, Supabase und Deployment benötigen
weiterhin ihre getrennten konkreten Freigaben.

Steuer-/Originaldatei-Vollständigkeit, Production-Betrieb und Brokerimport
werden durch diese Remediation ausdrücklich nicht behauptet.

## 9. Lokale Abschalter-Remediation nach dem PR-Review vom 2026-09-06

Dieser Abschnitt ergänzt Abschnitt 8 und grenzt den neueren Befund ab. Der
anschließende Live-Review des Draft-PRs #14 auf Commit
`410a46c714dec0b4ea1d2e4ad587d3e29d13c470` ergab ein neues P2-NO-GO:
Ein administrativ hinzugefügter CHECK mit einer schreibenden Funktion konnte
beim Abschalt-UPDATE ausgeführt werden, auch als NOT VALID. Das ist ein
Ziel-Drift-Fall mit privilegierter Schemaänderung, kein belegter
Production-Vorfall und keine gewöhnliche Nutzer-Rechteausweitung.

Die lokale Folgekorrektur bleibt auf dem bestehenden 16-Pfade-Release-Scope.
Geändert sind Abschalter, Concurrency-Harness, Negativ-Harness, gemeinsame
Snapshot-Testhilfe, statischer Vertrag und dieses Gate-Dokument. Installer,
Aktivator, Vollverifier und Anwendungscode bleiben unverändert.

- Der Abschalter erwirbt vor Katalog- und Zeilenprüfung eine transaktionale
  EXCLUSIVE-Sperre ausschließlich der Zielrelation. Sie wartet auf bereits
  zugelassene Import-/Aktivierungstransaktionen und verhindert neue konkurrierende
  Zielschemaänderungen bis COMMIT. Normale SELECTs bleiben möglich; Locklimit
  3 Sekunden und Statementlimit 30 Sekunden bleiben bestehen. EXCLUSIVE statt
  SHARE ROW EXCLUSIVE vermeidet den Aktivierungs-Lock-Upgrade-Zyklus, ohne
  den Aktivator zu ändern. Timeout ist keine bestätigte Abschaltung.
- Jeder vorhandene Ziel-CHECK muss exakt einer der drei bekannten sicheren
  Definitionen entsprechen. Unbekannte Namen und manipulierte Ausdrücke werden
  vor SELECT/UPDATE abgelehnt. Fehlende oder bekannte NOT VALID-CHECKs dürfen
  für das operative Schließen bestehen bleiben; der vollständige Verifier und
  die Aktivierung verlangen weiterhin den vollständigen validierten Vertrag.
- Generierte Zielspalten, FORCE RLS und unbekannte Zielindizes werden abgelehnt.
  Der einzige erlaubte vorhandene Index ist der bekannte einfache PK mit
  eingebauten btree/text_ops-Operator-Klassen. Fehlt er, bindet STRICT die
  tatsächliche Zielkardinalität; null oder mehrere Zielzeilen sind Fehler.
  Die Endprüfung verlangt genau eine Zielzeile und genau einen Off-Zustand.
- Fremdtrigger, Regeln und Vererbung bleiben gesperrt. Unabhängige Receipt-,
  Funktions-, ACL- oder Snapshot-Drift wird weiterhin nicht über einen Aufruf
  des vollständigen Verifiers zur Voraussetzung des Abschaltens gemacht.

Der lokale PostgreSQL-17.6-Gesamtlauf auf dem unveränderten isolierten
Testcontainer aus Abschnitt 8 bestand nach einer Testhilfe-Korrektur vollständig:

- Positivkontrollen belegen die schreibende CHECK-Auswertung als postgres;
  der korrigierte Abschalter weist sowohl zusätzliche als auch gleichnamig
  manipulierte NOT VALID-CHECKs ab. Sentinel-Tabelle und nichttransaktionaler
  Sequenzzähler belegen vor Fixture-Bereinigung null Schreibwirkungen und null
  Funktionsaufrufe im abgelehnten Abschaltversuch.
- Alle drei CHECK(true)-Ersetzungen am Ziel, zusätzlicher validierter CHECK,
  generierte Spalte, einfacher Zusatzindex, Ausdrucksindex, Partial-Index,
  FORCE RLS und doppelte Zielzeilen werden ohne Persistenzänderung abgelehnt.
- Inkonsistente Gatezustände mit fehlendem bzw. bekanntem NOT VALID-CHECK und
  fehlendem PK lassen sich schließen; Aktivierung auf solchen Teilständen
  bleibt abgelehnt. Abschaltung trotz unabhängiger ACL-Drift besteht weiterhin.
- Der tatsächliche Abschalter wartet auf einen laufenden Import; die nachgebildete
  Aktivierungsfolge FOR UPDATE/UPDATE endet ohne Lock-Upgrade-Zyklus. Bereits
  begonnene Ziel-DDL wird nach Sperrerwerb erkannt; nachträgliche Ziel-DDL läuft
  gegen den bis COMMIT gehaltenen Abschalter-Lock in den erwarteten Timeout.
- Die bisherigen Installer-, Import-, Revert-, Replay-, Snapshot-, Rechte- und
  Driftfälle bestehen unverändert. Der erste Folge-Lauf scheiterte allein an
  der einzeiligen Snapshot-Testabfrage bei absichtlich dupliziertem Gate;
  die Korrektur aggregiert deterministisch sämtliche Zielzeilen. Beide Läufe
  entfernten ihre synthetische Testdatenbank im finally-Pfad.
- Fokussierte Verträge nach der Testhilfe-Korrektur: 54/54. Vollständige lokale
  Gates, Manifest und A3/A4/A5-Voten müssen anschließend auf dem eingefrorenen
  Gesamtstand separat gebunden werden; dieses Dokument nimmt ihr Ergebnis
  nicht vorweg und wird nach dem Freeze nicht für Review-Voten verändert.

Die frühere grüne GitHub-CI und das READY-Preview-Deployment gehören ausschließlich
zum alten PR-Commit 410a46c. Sie belegen diese ungestagte Folgekorrektur nicht.
Der eigentliche Preview-App-Smoke war durch den Vercel-Zugriffsschutz offen;
dessen Schutz wurde nicht verändert. Kein erneutes externes npm-Audit in diesem
lokalen Block; Dependency-Dateien bleiben unverändert. Historische Audits sind
kein neuer Snapshot-Nachweis.

STOP bleibt vor Staging, Commit und Push. Draft-/Ready-/Merge-Änderungen,
Supabase, Production, Broker, Credentials, Cron, Capture und echte Importe
gehören nicht zu diesem lokalen Block. Migration pending und Default-off
bleiben unverändert; keine Steuer-, Broker- oder Production-Fertigmeldung.

## 10. Ergänzende Aktivierungsremediation im selben lokalen Block

Der unabhängige Review des Abschnitt-9-Snapshots mit Manifest-SHA-256
`CF3CE5E442056F45D129EA58CF0424AB647B2F0054C6E02B1D20E2396C2CE1B9`
endete mit A3/A4 NO-GO und A5 GO im eigenen Claim-/Scope-Prüfumfang. Alle drei
bestätigten identische Anfangs-/Endhashes. Der Abschalter-P2 war geschlossen;
ein zusätzlicher P2 betraf jedoch den Aktivator: Die bisherige Prüfung sieben
erwarteter Indizes im Vollverifier schloss zusätzliche Gate-Ausdrucksindizes
nicht aus. Auch zwischen Vorprüfung und UPDATE musste die Zieldefinition
gegen konkurrierende DDL stabilisiert werden.

Deshalb wurden zusätzlich innerhalb desselben 16-Pfade-Scopes korrigiert:

- `verify-v57.62.0-trade-import.sql` bindet sämtliche Gate-Indizes an genau
  den bekannten eingebauten PK. Seine Prüfung von Definition und Operator-Klassen
  entspricht dem Abschalter; ein statischer Vertrag vergleicht beide Prüfungen.
  Der Verifier enthält weiterhin keine Schreibsperre und bleibt für explizite
  read-only Transaktionen verwendbar.
- `activate-v57.62.0-trade-import.sql` prüft den Executor und erwirbt vor dem
  ersten Verifier dieselbe zielbezogene EXCLUSIVE-Sperre. Vorprüfung, UPDATE
  und Nachprüfung laufen mit stabiler Zieldefinition bis COMMIT. Lock- und
  Statementlimits bleiben unverändert; ein Timeout bleibt ein Fehler.
- Echte Aktivierungs-Negativfälle verwenden jeweils Ausdrucks- und Partial-Index
  mit IMMUTABLE-Wrapper und transitiver VOLATILE-Funktion. Ihr Indexaufbau erfolgt
  bei ausgeschaltetem Gate; die Positivkontrolle des Aktivierungs-UPDATE muss
  eine fremde Sentinel-Schreibwirkung als postgres nachweisen. Der tatsächliche
  Aktivator muss anschließend vor Funktionsaufruf und Mutation ablehnen.
  Sequenz-/Sentinel- und vollständige Persistenzprüfung erfolgen vor Bereinigung.
- Zusätzliche Konkurrenzfälle führen die tatsächlichen Aktivierungs- und
  Abschaltskripte in beiden Reihenfolgen aus. Vorher begonnene Zielindex-DDL muss
  nach Sperrerwerb abgelehnt werden, nachträgliche DDL bis COMMIT blockieren und
  im gezielt gehaltenen Testfall in den begrenzten Timeout laufen.

Damit sind jetzt acht der bestehenden 16 Scopepfade lokal verändert. Die Aussage
aus Abschnitt 9 über einen unveränderten Aktivator/Vollverifier gilt nur für
jenen früheren Freeze. Der Schema-Patch, der Installer und die App einschließlich
Default-off bleiben weiterhin unverändert. Die frühere 789er-Suite und die
vorherigen Review-Voten belegen diesen nachfolgenden Snapshot nicht.

Die neuen vollständigen Laufzeitgates, das neue Manifest und A3/A4/A5 sind
separat an den finalen gemeinsamen Freeze zu binden. Die beschriebene Testabsicht
ist kein vorweggenommener PASS. Staging, Commit, Push, PR-Änderungen, neuer
externer npm-Audit und sämtliche Production-/Supabase-/Broker-Aktionen bleiben
außerhalb dieses lokalen Blocks; der geschützte Preview-App-Smoke bleibt offen.

## 11. Abschlusskorrektur der beiden nachfolgenden P2-Befunde

Der Snapshot mit Manifest-SHA-256
DEEC6373AE778059AA6D9BBB51CB98117D56A053CD98AFB3C7A787A9CAFDCFAB
bestand die separat protokollierten technischen Gates einschließlich 790 Tests
und des isolierten PostgreSQL-17.6-Laufs. A3/A4 meldeten anschließend zwei P2;
A5 bestätigte nur den eigenen Claim-/Scope-Umfang. Das Gesamtvotum war NO-GO.
Diese historischen Ergebnisse gelten nicht für die nachfolgenden Änderungen.

Die begrenzte Abschlusskorrektur bleibt innerhalb derselben 16 Release-Pfade:

- Der Vollverifier liest den Gate-Datenzustand erst nach den vollständigen
  zielbezogenen Metadatenprüfungen. Die bereits vor dem Verifier erworbene
  EXCLUSIVE-Sperre des Aktivators bleibt unverändert bis Transaktionsende.
- Beide ausdrücklich deklarierten Spaltenverträge (26 neue und sieben additive
  Spalten) verlangen normale, nicht generierte Spalten ohne Domain-Typ. Gleiche
  sichtbare Datentypen und NULL-Eigenschaften allein reichen nicht aus.
- Eine neue konstante Partial-Index-Fixture prüft die Auswertung schon bei der
  SELECT-Planung. Eine Positivkontrolle muss den Aufruf belegen. Der tatsächliche
  Aktivator muss anschließend vor Aufruf und Wirkung ablehnen. Solange dieser
  Index vorhanden ist, darf der normale Gate-Snapshot-SELECT nicht als Beobachter
  dienen: Relation-COPY sowie Sequenz und Sentinel prüfen vor der Bereinigung.
  Erst nach ausschließlicher Entfernung der Fixture-Metadaten folgt der volle
  Persistenzvergleich mit dem Stand vor ihrem Aufbau; keine Gate- oder
  Finanzzeilen werden bei dieser Bereinigung wiederhergestellt.
- Weitere tatsächliche Aktivierungsfälle ersetzen die bestehende Schlüsselspalte
  durch eine gespeicherte generierte Spalte oder den Aktivierungszeitstempel
  durch eine Domain. Positivkontrollen, nichttransaktionale Aufrufzähler und
  Persistenzvergleiche vor Bereinigung binden ihre Ablehnung. Eine zusätzliche
  Domain-Fixture prüft den separaten Vertrag der additiven Legacy-Spalten.

Diese Beschreibung benennt die neuen Prüfregeln und Testabsichten, keinen
vorweggenommenen Laufzeit-PASS. Vollständige Gates, neues Hashmanifest und
unabhängige A3/A4/A5-Voten müssen denselben finalen Snapshot binden. Frühere
Review-Voten und Remote-CI-Ergebnisse werden nicht übernommen. Anwendung,
Schema-Patch, Default-off und Dependency-Dateien bleiben unverändert.

Stopp weiterhin vor Staging, Commit und Push. Kein neuer externer npm-Audit,
keine PR-, Production-, Supabase-, Broker-, Credential-, Cron-, Capture- oder
echte Importaktion; der geschützte Preview-App-Smoke bleibt offen.

## 12. Begrenzte Source-Key-Remediation vom 2026-09-07

Der vorherige Freeze
`7F1BB36B178706059282EB38CE3D1296E46636F613330CF05770A77180F44471`
bestand 56 fokussierte und 791 vollständige Tests sowie den isolierten
PostgreSQL-Lauf. A3/A4 schlossen die zwei Abschnitt-11-Befunde, meldeten aber
einen weiteren gemeinsamen P2: Der Daten-Digestvergleich der neuen
Source-Key-Tabelle konnte zusätzliche konstante Partial-Indizes planen.
A5 gab ausschließlich für Claims/Scope/Evidence GO; insgesamt blieb NO-GO.
Die Source-Key-Variante war dabei statisch hergeleitet, noch nicht reproduziert.

Der separat freigegebene lokale Folgeblock bleibt im selben 16-Pfade-Scope:

- Der Aktivator hält nach dem bestehenden Gate-Lock zusätzlich eine
  SHARE UPDATE EXCLUSIVE-Sperre auf ausschließlich trade_import_source_keys.
  Sie stabilisiert die Indexdefinitionen gegen gewöhnliches und konkurrierendes
  Index-DDL bis COMMIT; ROW EXCLUSIVE bleibt kompatibel. Reihenfolge Gate vor
  Source Keys sowie Lock-/Statementlimits bleiben explizit. Der Verifier selbst
  erhält keine Schreibsperre und bleibt in read-only Transaktionen nutzbar.
- Der Verifier bindet alle fünf Source-Key-Indizes einschließlich PK an exakte
  Definitionen, primitive pg_catalog/btree-Operator-Klassen und gültige
  Indexmetadaten. Zusätzliche Indizes werden vor dem Datenvergleich abgelehnt.
  Vererbungsbeziehungen werden ausgeschlossen, damit der Datenzugriff keine
  ungesperrten Kindrelationen einschließt.
- Die Source-Key-Regression verwendet den tatsächlichen Digest-SELECT als
  Positivkontrolle. Der tatsächliche Aktivator muss vor Aufruf oder Wirkung
  ablehnen. Sequenz, Sentinel und Relation-COPY beobachten vor Bereinigung;
  der volle Persistenzvergleich folgt erst nach ausschließlich metadatenbezogener
  Bereinigung. Zusatzindizes, eine nicht vorgesehene Operator-Klasse und
  Vererbung besitzen weitere Negativfälle.
- Konkurrenzfälle prüfen vorher begonnenes Source-Key-Index-DDL, atomaren
  Lock-Timeout mit anschließendem Retry, bis COMMIT blockiertes gewöhnliches
  und konkurrierendes Index-DDL sowie die Kompatibilität mit ROW EXCLUSIVE.

Die Vertrauensgrenze bleibt privilegierte Drift der betroffenen neuen
Release-Relation. Normale App-Rollen erhalten keine DDL-Rechte. Bestehende
Receipt-/Batch-Relationen und globale administrative Änderungen sind keine
Behauptung universeller Sicherheit gegen einen beliebig manipulierten
Datenbankbestand. Die App, der Installer, der Schema-Patch und Dependencies
bleiben unverändert; kein Produktionsvorfall wird behauptet.

Diese Ergänzung dokumentiert Korrektur und Prüfabsicht, keinen vorweggenommenen
PASS. Neue vollständige Gates, Hashmanifest und A3/A4/A5 müssen denselben
abschließenden Snapshot binden. Vor Staging, Commit und Push wird erneut
gestoppt. Keine PR-, Production-, Supabase-, Broker-, Credential-, Cron-,
Capture-, echte Import- oder externe npm-Audit-Aktion ist Teil dieses Blocks.

## 13. Begrenzter Abschluss der Statistikobjekt-Remediation vom 2026-09-07

Der nach Abschnitt 12 eingefrorene A6DD8E8B7DF0-Snapshot bestand 58 fokussierte
und 793 vollständige Tests, Typecheck, Release-Check, Build und den isolierten
PostgreSQL-17.6-Harness. Erst danach bestätigte der unabhängige Review den
zusätzlichen P2 bei Source-Key-Ausdrucksstatistiken. Diese grünen Ergebnisse
schlossen den nachträglich gefundenen Fall ausdrücklich nicht ein.

Der folgende Implementierungsversuch wurde durch eine Plattform-Inhaltsprüfung
unterbrochen. Die Sicherung B5F3AF551FBF hielt deshalb einen ungeprüften Teilstand
fest. Sie ist kein Testnachweis. Die Wiederanlaufprüfung bestätigte dieselben
466 Quellhashes und alle 16 Release-Einträge, einschließlich des abwesenden alten
Kandidaten. Die aktuellen Ergänzungen bleiben innerhalb dieses Release-Scopes:

- Vollverifier und Abschalter weisen das gesamte vorhandene pg_statistic_ext-
  Inventar der jeweils betroffenen neuen Zielrelation vor dem ersten zugehörigen
  Datenzugriff ab. Dieser Releasevertrag installiert keine solchen Statistiken;
  auch reine Spaltenstatistiken werden deshalb bewusst nicht akzeptiert.
- Die vorhandenen Negativfälle prüfen Source-Key-Aktivierung, Gate-Aktivierung
  und Gate-Abschaltung mit tatsächlichen Abfragen und Skripten. Kontrollaufrufe
  ohne ANALYZE, Sequenz-/Sentinel-Prüfungen sowie Relation-COPY vor dem Entfernen
  der Fixture-Metadaten und der vollständige Persistenzvergleich danach sollen
  eine Ablehnung vor Aufruf und Wirkung belegen.
- Konkurrenzfälle verwenden ungefährliche Spaltenstatistiken in beiden
  DDL-Reihenfolgen: vorherige Änderung erkennen, unveränderte Persistenz,
  tatsächlicher Retry, nachträgliche Änderung bis COMMIT blockieren und ihren
  begrenzten Lock-Timeout ohne verbliebene Metadaten nachweisen.
- Drei ergänzende statische Verträge binden die vollständigen Inventarprüfungen
  und ihre Reihenfolge sowie die genannten Beobachter und Konkurrenzfälle.

Dieser Abschnitt beschreibt Umsetzung und Prüfabsicht, keinen vorweggenommenen
PASS. Vollständige lokale Gates und neue unabhängige A3/A4/A5-Reviews sind an
denselben neuen Freeze zu binden; Nachweise werden separat gespeichert, ohne
dieses Dokument nach dem Freeze für Review-Voten umzuschreiben. Bei erneutem
Plattformabbruch wird der betroffene Lauf gestoppt, nicht umgangen.

Die Grenze bleibt privilegierte Drift dieser neuen Release-Relationen, keine
allgemeine Absicherung gegen beliebige Administrator-Manipulation und kein
belegter Production-Vorfall. App, Schema-Patch, Dependencies und Default-off
bleiben unverändert. Keine Broker-/Steuer-Vollständigkeitsbehauptung. Stopp vor
Staging, Commit und Push; keine PR-, Production-, Supabase-, Credential-, Cron-,
Capture-, echte Import-, externe npm-Audit- oder Installationsaktion.

## 14. Begrenzte Endlichkeitsprüfung numerischer Importwerte

Der vollständige A5-Review des in Abschnitt 13 beschriebenen Snapshots fand
einen weiteren P2: PostgreSQL `numeric` akzeptiert die Sonderwerte `NaN`,
`Infinity` und `-Infinity`. Der direkte, für `authenticated` freigegebene
Import-RPC hatte diese Werte bislang typisiert, aber nicht als semantisch
unzulässige Journalwerte abgewiesen. Eine lokale Positivkontrolle gegen den
isolierten PostgreSQL-17.6-Container reproduzierte alle drei Typkonvertierungen.

Die begrenzte Remediation prüft deshalb sämtliche numerischen Felder des
ausgewählten Finanz-Snapshots unmittelbar nach der Projektion durch die realen
Tabellentypen und vor jeder Source-Key-Reservierung. Nicht-endliche Werte führen
atomar zu `INVALID_TRADE_NUMERIC_VALUE`. Der PostgreSQL-Integrationstest bindet
alle 18 importierbaren numerischen Felder gegen jede der drei Sonderwertklassen
und verlangt nach jeder Ablehnung einen unveränderten Fixturezustand. Ein
statischer Vertrag bindet Feldmenge, Sonderwerte und die Reihenfolge vor der
Source-Key-Reservierung.

`risk_amount` gehört nicht zu dieser Feldmenge: Die vorhandene Basisspalte wird
weder vom Dateiimport-RPC noch von den relevanten App-Payloads persistiert; der
angezeigte Risikobetrag wird aus den gespeicherten Eingabefeldern berechnet. Der
zunächst hierzu gemeldete A5-Befund wurde nach Prüfung der tatsächlichen
Persistenzpfade zurückgenommen.

Dieser Abschnitt beschreibt Umsetzung und Prüfabsicht, keinen vorweggenommenen
PASS. Nach der Änderung sind vollständige lokale Gates, ein neues Hashmanifest
und neue unabhängige A3/A4/A5-Voten auf exakt demselben Snapshot erforderlich.
Stopp bleibt vor Staging, Commit und Push. Keine PR-, Production-, Supabase-,
Broker-, Credential-, Cron-, Capture-, echte Import-, externe npm-Audit- oder
Installationsaktion ist Teil dieses Blocks.

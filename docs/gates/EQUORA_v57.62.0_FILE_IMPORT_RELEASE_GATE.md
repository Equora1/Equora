# Equora v57.62.0 — Dateiimport-Release-Gate

Stand: 2026-09-06
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

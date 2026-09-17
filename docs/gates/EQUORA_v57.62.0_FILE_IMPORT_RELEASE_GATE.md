# Equora v57.62.0 — Dateiimport-Release-Gate

Stand: 2026-09-14
Status: **PR #14 GEMERGT / VERCEL-PRODUCTION GRÜN / HOSTED-SUPABASE-PREFLIGHT NOCH NICHT AUSGEFÜHRT**

## 1. Ziel und belastbarer Iststand

Dieses Paket enthält die additive Datenbankpersistenz für den providerneutralen
Dateiimport sowie die eng begrenzten Dependency-Patches Next.js `15.5.25`,
Sharp `0.35.4` und Vitest `4.1.11`. PR #14 wurde als Squash-Commit
`889a145e3443e52e5298ae945f53e3a8f44dc50b` in `main` übernommen; GitHub-CI
und das dadurch ausgelöste Vercel-Production-Deployment waren erfolgreich.
Damit wurde weder der Dateiimport aktiviert noch eine v57.62.0-Supabase-
Migration, Broker-, Credential-, Cron-, Capture- oder Importaktion ausgeführt.

Der Anwendungscode bleibt bewusst auf:

- `deploymentState = "migration_pending"`,
- `persistenceEnabled = false`,
- `catalogAvailability = "controlled_candidate"`.

Damit ist die lokale Dateiprüfung verfügbar, der produktive Schreibpfad jedoch
weiter fail-closed. Die produktive v57.61.0-Datenbankbasis mit sieben bekannten
Migrationsmarkern ist eine Preflight-Anforderung, keine in diesem Arbeitsblock
erneut gegen Supabase verifizierte Behauptung.

Die Abschnitte 6 bis 22 bleiben unverändert als chronologische historische
Snapshots erhalten. Ihre damaligen Stop- und NO-GO-Aussagen beschreiben den
jeweiligen Zwischenstand und nicht den aktuellen Post-Merge-Zustand. Der
aktuelle Status und die verbleibenden Gates stehen in Abschnitt 23.

## 2. Gebundener Releasevertrag

| Feld | Exakter Wert |
|---|---|
| Migration | `equora_v57.62.0_trade_import_persistence_v1` |
| Fingerprint | `460e008096b8f217e68d27f04c72b95b676d2b149daf49d5913d5a822cac628b` |
| Datenbank-Gate | `journal_file_import_persistence_v2` |
| Capability-Vertrag | `equora-broker-file-import-capability-v1` |
| Installationszustand | `enabled = false`, `activated_at = null` |

Der Fingerprint bindet den freigegebenen Vertrag
`equora_v57.62.0_trade_import_persistence_v1|journal_file_import_persistence_v2|equora-broker-file-import-capability-v1|schema_v2|default_off|request_row_fallback_v1|financial_snapshot_v1|source_key_trade_bijection_v2|immutable_v2_trade_binding_v1|global_trade_writer_revert_serialization_v1|revert_account_bijection_v1|default_off_redeploy_guard_v1|activation_marker_guard_v1|catalog_behavior_shape_v1|import_trade_lock_precedes_source_key_v1|migration_marker_serialization_v1|runtime_write_side_effect_inventory_v1|bounded_revert_lock_wait_v1|exclusive_revert_precedes_rowshare_v1|exact_internal_fk_trigger_inventory_v1|logical_publication_inventory_v1|privileged_publication_ddl_freeze_v1|authenticated_role_attributes_v1`.
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
- `docs/gates/EQUORA_v57.62.0_PRODUCTION_SQL_MANIFEST.json`: bindet alle sieben
  Production-SQL-Artefakte per CRLF-zu-LF-normalisiertem SHA-256 und Byteumfang.
- `scripts/run-v57.62.0-production-preflight.ps1`: validiert standardmäßig nur
  lokal. Der separat freizugebende Modus `ExecuteReadOnly` akzeptiert nur das
  gebundene Production-Ziel und führt ausschließlich den read-only Preflight
  mit zusätzlichem `default_transaction_read_only=on` aus.
- `docs/gates/EQUORA_v57.62.0_PRODUCTION_PREFLIGHT_RUNBOOK.md`: definiert
  Backup-/Recovery-Entscheidung, Operatorgrenzen, Evidence und harte Stopps vor
  Deploy, Aktivierung und Restore.

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

## 15. Draft-PR-Remediation von Dependency- und Datenintegritätsbefunden

Der Live-Review von Draft-PR #14 auf Commit
`53f5148ee817e2ce21c07a230cf0cd96c31515f2` war insgesamt NO-GO. GitHub-CI
scheiterte am Dependency-Audit. A5 bestätigte unabhängig zwei P2-Fälle: Ein
gelöschter Importtrade konnte einen aktiven, aber nicht mehr gebundenen
Source-Key zurücklassen; außerdem durfte der Revertpfad nicht allein aufgrund
einer fremd gesetzten `import_batch_id` gewöhnliche Trades löschen. A3 und A4
beanstandeten zusätzlich die roten CI-Gates und veraltete Snapshotclaims.

Die lokal begrenzte Remediation ändert keine Aktivierungs- oder
Productionkonfiguration:

- `next` ist auf 15.5.25, `sharp` einschließlich Override auf 0.35.4 und
  `vitest` auf 4.1.11 gepinnt. Die ausdrücklich freigegebenen Advisory-Abfragen
  `npm audit --json` und `npm audit --omit=dev --json` meldeten jeweils null
  bekannte Schwachstellen bei 243 aufgelösten Dependencies. Das ist eine
  zeitgebundene Registry-/Advisory-Aussage, keine allgemeine Sicherheitsgarantie.
- Der zusammengesetzte Source-Key-Fremdschlüssel auf den Trade verwendet
  `ON DELETE RESTRICT`; der partielle `(user_id, trade_id)`-Index ist eindeutig.
  Ein nicht öffentlich ausführbarer `BEFORE INSERT OR UPDATE`-Trigger erzwingt
  bei v2-Batches eine aktive, nutzer-, batch- und tradegebundene Source-Key-Zeile.
  Legacy-Batches ohne `import_account_id` bleiben kompatibel.
- Der Import erzeugt den Trade zunächst ohne Batchbindung, bindet danach den
  reservierten Source Key und setzt erst anschließend Account und Batch am
  Trade. Der Revertpfad sperrt und verifiziert vor der ersten Mutation die
  vollständige bidirektionale Zuordnung; Drift endet atomar mit
  `IMPORT_BATCH_TRADE_BINDING_INVALID`.
- Der PostgreSQL-Verifier bindet Fremdschlüssel, eindeutigen Index, Triggerform,
  Triggerfunktion und ACL exakt. Neue Negativfälle schwächen jede dieser
  Eigenschaften einzeln ab. Der isolierte PostgreSQL-17.6-Gesamtlauf bestätigte
  außerdem abgewiesenes Löschen gebundener Trades, abgewiesene ungebundene
  Batch-Trades, atomaren Revert bei synthetischer privilegierter Drift sowie die
  bisherigen RLS-, ACL-, Replay-, Endlichkeits- und Konkurrenzverträge.
- Der reale Harness deckte zwei reine Prüfmitteldefekte auf und band ihre
  Korrektur regressiv: Trigger-`WHEN` wird über die exakte
  `pg_get_triggerdef`-Darstellung statt der für `NEW` unzulässigen
  `pg_get_expr`-Dekodierung geprüft; die lokale Supabase-Einwegfixture gewährt
  den API-Rollen wie die bereits bestehende Hosted-Fixture `USAGE` auf `auth`.
  Ein Negativtest erwartet außerdem den tatsächlich zuerst ausgelösten
  allgemeinen Funktionsprivilegienfehler.

Auf den nach dieser Dokumentation unveränderten Kandidatenbytes müssen vor dem
Freeze erneut mindestens `git diff --check`, der fokussierte Vertragstest,
PowerShell-AST-Prüfung, vollständige 798-Test-Suite, Typecheck, Release-Check,
Production-Build, beide Audits und der isolierte PostgreSQL-Harness bestehen.
Erst danach werden Scope, Secret-Scan, Claims und SHA-256-Manifest gebunden und
A3/A4/A5 unabhängig auf genau diesem Snapshot wiederholt. Frühere grüne Läufe,
PR-CI und Review-Voten werden nicht auf den neuen Snapshot übertragen.

Bis zu drei übereinstimmenden GO-Voten ohne offene P0–P2 bleibt der Stand
**NO-GO**. Unabhängig vom Review endet dieser Arbeitsblock vor Staging, Commit,
Push und jeder Änderung an PR #14. Die Anwendung bleibt `migration_pending`,
das Datenbank-Gate bleibt default-off. Es erfolgten keine Supabase-, Production-,
Broker-, Credential-, Cron-, Capture- oder echten Importaktionen; insbesondere
werden weder Steuerbeleg-Vollständigkeit noch Production-Verhalten behauptet.

## 16. Abschluss der unveränderlichen v2-Tradebindung nach dem Re-Review

Der erste Freeze nach Abschnitt 15 mit Manifest-SHA-256
`2D8B46534BF512E8345F66D312C49B91D8D8DBBA9A9CA327C7AFAE69681B4571`
bestand die dort gebundenen lokalen Gates. A3 und A4 fanden anschließend
unabhängig denselben weiteren P2: Ein authentifizierter Eigentümer durfte eigene
Trades direkt aktualisieren. Der Trigger lief nur bei einem neuen nichtleeren
`import_batch_id` und band den Trade-Account nicht an Batch und Source Key.
Dadurch waren ein Detach auf NULL, ein Wechsel auf einen Legacy-Batch oder ein
anderes eigenes Importkonto möglich. Der Revert hätte die resultierende Drift
atomar erkannt, aber den regulären Revertpfad nicht mehr abschließen können.
A5 schloss die zwei ursprünglichen P2, erfasste diesen Direkt-UPDATE-Fall jedoch
nicht. Der 2D8B4653-Freeze ist deshalb insgesamt verworfen und kein Stagingbeleg.

Die Folgekorrektur erweitert denselben lokalen Datenintegritätsscope:

- Der Trigger wird bei jeder INSERT- und UPDATE-Operation ausgeführt. Bei einem
  bereits an einen v2-Batch gebundenen Trade sperrt und liest er den alten Batch
  und macht Trade-ID, Nutzer, Importkonto und Batchbindung unveränderlich.
  Das verhindert sowohl NULL-Detach als auch v2-zu-Legacy- und Accountwechsel.
- Jede neue v2-Bindung verlangt zusätzlich, dass Trade-, Batch- und aktiver
  Source-Key exakt dasselbe `import_account_id` tragen. Die bisherige Nutzer-,
  Batch-, Trade- und Statusprüfung bleibt bestehen. Normale Journal- und
  Finanzfeldänderungen mit unveränderter Importidentität bleiben zulässig.
- Authentifizierte PostgreSQL-Regressionen prüfen einen erlaubten normalen
  Trade-UPDATE sowie jeweils atomar abgewiesenes Batch-Detach, Verschieben auf
  einen Legacy-Batch, Account-Detach und Wechsel auf ein anderes eigenes Konto.
  Nach jedem Fehler muss der vollständige Fixturezustand identisch bleiben.
- Ein zusätzlicher Zweitransaktionsfall hält durch einen erlaubten Trade-UPDATE
  den v2-Batch mit `FOR KEY SHARE`, lässt den echten Revert nachweislich warten
  und anschließend in einer reinen Rollback-Probe erfolgreich laufen. Die aktive
  Live-Bindung bleibt danach unverändert. Damit ist die Lockreihenfolge gegenüber
  dem Revert ausdrücklich gebunden, nicht nur statisch abgeleitet.
- Der Verifier bindet nun einen Trigger ohne `WHEN`-Qualifikation, den neuen
  Funktionskörperhash und die unveränderten ACL-/Security-Definer-Eigenschaften.
  Der Releasevertrag erhält den Zusatz `immutable_v2_trade_binding_v1`; der
  daraus abgeleitete Fingerprint lautet
  `ec0c385a3a5bd7d6432656759db7ee16fe7056ed9e70f2f124279a8cc1d84129`.

Der fokussierte Vertragstest mit 42/42 Tests und der vollständige isolierte
PostgreSQL-17.6-Harness bestanden nach dieser Korrektur. Diese Teilergebnisse
nehmen den Abschluss nicht vorweg: Auf den nach dieser Dokumentation
unveränderten Bytes müssen vollständige Suite, Typecheck, Release-Check,
Production-Build, beide extern autorisierten npm-Audits, statische Prüfungen,
neues SHA-256-Manifest und neue unabhängige A3/A4/A5-Voten folgen.

Bis dahin bleibt **NO-GO**. Der Arbeitsblock stoppt weiterhin vor Staging,
Commit, Push und jeder Änderung an PR #14. Keine Supabase-, Production-,
Broker-, Credential-, Cron-, Capture- oder echte Importaktion wurde ausgeführt;
Default-off und `migration_pending` bleiben unverändert.

## 17. Deadlockfreie Lockreihenfolge nach dem zweiten Re-Review

Der unveränderte Snapshot aus Abschnitt 16 mit Manifest-SHA-256
`B8B6947D33DE254F3AE7BE2D417A397FAFEDB7CC56160298871CFD1C4136B2D4`
bestand die gebundenen lokalen Gates. A3 fand anschließend einen weiteren P2:
Ein gewöhnlicher Trade-UPDATE sperrt zuerst die Trade-Zeile und der
Binding-Trigger danach den Batch mit `FOR KEY SHARE`. Der Revert sperrte dagegen
zuerst den Batch und danach die Trade-Zeilen. Bei einer passenden Überlappung
konnten beide Transaktionen dadurch einen zyklischen Wait bilden. Die bereits
vorhandene Konkurrenzprobe deckte nur einen vollständig ausgeführten UPDATE vor
dem Revert ab und bewies dieses Zwischenfenster nicht. Der B8B6947D-Snapshot ist
deshalb verworfen und kein Stagingbeleg.

Die begrenzte Folgekorrektur vereinheitlicht die Reihenfolge:

- Der Revert liest Eigentümer und Terminalstatus zunächst ohne Schreibsperre,
  sperrt anschließend alle zum Batch gehörenden Trades deterministisch nach ID
  und nimmt erst danach den Batch-Schreiblock. Nach möglichem Warten liest und
  prüft er den Batchzustand unter dieser Sperre erneut. Source Keys folgen
  ebenfalls deterministisch nach ID.
- Die Triggerreihenfolge bleibt Trade-Zeile vor Batch-`KEY SHARE`. Damit nehmen
  reguläre Trade-UPDATEs und Revert dieselben Objekte in derselben Richtung.
- Eine neue deterministische Zweitransaktionsprobe hält ausdrücklich nur die
  Trade-Zeile, startet den echten Revert und fordert erst nach dessen beobachtetem
  Wait den Batch-`KEY SHARE` an. Ein Batch-zuerst-Revert würde in dieser Probe
  den früher möglichen Deadlock reproduzieren; die korrigierte Reihenfolge lässt
  beide Transaktionen geordnet fortfahren. Die bestehende echte
  UPDATE-vor-Revert-Probe bleibt zusätzlich erhalten.
- Der Releasevertrag erhält den Zusatz
  `trade_before_batch_revert_lock_order_v1`; der daraus abgeleitete Fingerprint
  lautet
  `67dd272ac9f6d1f04d24aab3fa19c0a281698440e456d23a1e111b1018155ea8`.

Auch diese Korrektur ist erst nach vollständigen lokalen Gates, neuer
Evidence-/Manifestbindung und drei unabhängigen GO-Voten von A3/A4/A5 ein
zulässiger Stagingkandidat. Bis dahin bleibt **NO-GO**. Der Arbeitsblock stoppt
vor Staging, Commit, Push und jeder Änderung an PR #14. Es erfolgen keine
Supabase-, Production-, Broker-, Credential-, Cron-, Capture- oder echten
Importaktionen; Default-off und `migration_pending` bleiben unverändert.

## 18. Globale Writer-/Revert-Serialisierung und Release-Gate-Nachschärfung

Der Freeze aus Abschnitt 17 mit Manifest-SHA-256
`4FC1D789B3E0F250C4517BEB0C8F985148DC71081F221CE2166D08950755D9AF`
bestand die dort gebundenen lokalen Gates, wurde im anschließenden gemeinsamen
A3/A4/A5-Review aber erneut verworfen. Alle drei Reviews fanden denselben P2:
Bei mindestens zwei Batch-Trades konnte ein direkter Mehrzeilen- oder
Mehrstatement-UPDATE Trades in einer anderen Reihenfolge sperren als der nach
ID sortierte Revert. Die Ein-Trade-Proben bewiesen deshalb keine allgemeine
Deadlockfreiheit. A4 fand zusätzlich einen aktiven Re-Deploy, der entgegen dem
Default-off-Installationsvertrag erfolgreich enden konnte, eine fehlende
Unknown-Marker-Abweisung im separaten Aktivierungsskript und nicht vollständig
gebundene Katalogattribute. A3 ergänzte eine fehlende Accountkomponente in der
fail-closed Revert-Bijectionsprüfung; A5 zeigte, dass der statische Test den
Batch-Lock nur über einen Kommentar lokalisierte.

Die Folgekorrektur bleibt auf den lokalen Release-/Datenintegritätsscope
begrenzt:

- `equora_revert_import_v1` nimmt vor dem ersten Trade-Rowlock einen
  `SHARE ROW EXCLUSIVE`-Lock auf `public.trades`. Jedes INSERT, UPDATE oder
  DELETE hält bereits vor seinem ersten Rowlock den damit konfliktierenden
  `ROW EXCLUSIVE`-Tabellenlock. Revert und beliebige Ein- oder Mehrzeilenwriter
  können deshalb nicht mehr jeweils unterschiedliche Trade-Zeilen halten und
  gegenseitig aufeinander warten. Erst danach folgen Trades nach ID, Batch und
  Source Keys nach ID.
- Diese bewusst konservative Lösung serialisiert den seltenen Revert global
  gegen Trade-Schreibvorgänge aller Nutzer. Reads und untereinander laufende
  normale Trade-Writer bleiben davon unberührt. Der breitere Schreib-Wait ist
  der klare Verfügbarkeitspreis für die unveränderte Unterstützung direkter
  authentifizierter Updates ohne neuen Update-RPC.
- Eine echte Zwei-Trade-Probe sperrt zuerst den höher sortierten Trade, startet
  den Revert, beobachtet dessen Relation-Wait vor jedem Rowlock und fordert erst
  dann den niedriger sortierten Trade an. Der Revert läuft anschließend in einer
  Rollback-Probe, und der vollständige Zwei-Trade-Zustand muss erhalten bleiben.
  Die bisherigen Ein-Trade-Proben bleiben additiv bestehen.
- Die Revert-Bijection verlangt nun in beiden Richtungen zusätzlich
  `source_key.import_account_id = trade.import_account_id =
  batch.import_account_id`. Eine privilegiert erzeugte Same-Tenant-Accountdrift
  muss vor der ersten Mutation mit `IMPORT_BATCH_TRADE_BINDING_INVALID` atomar
  enden.
- Ein Re-Deploy mit bereits aktivem Gate endet im Preflight mit
  `TRADE_IMPORT_PREFLIGHT_GATE_ACTIVE`; der Postflight akzeptiert ausschließlich
  den ausgeschalteten Endzustand. Es erfolgt keine automatische Deaktivierung,
  weil diese eine getrennt freizugebende Betriebsaktion wäre.
- Das Aktivierungsskript weist unbekannte `equora_v57.62.0%`-Marker vor der
  ersten Gate-Mutation mit `TRADE_IMPORT_ACTIVATION_UNKNOWN_MARKER` ab.
- Der Verifier bindet für die drei neuen Tabellen zusätzlich permanente
  Persistenz, Heap-Zugriffsmethode und unveränderte Standard-Collation. Für alle
  ausführbaren Kandidatenroutinen werden neben Owner, Sprache, Security-Definer,
  Rückgabetyp, Konfiguration und Körperhash nun auch VOLATILE, PARALLEL UNSAFE,
  nicht LEAKPROOF und nicht STRICT geprüft. Reale Negativfälle decken UNLOGGED,
  explizite Text-Collation und jede der vier Funktionsattributabweichungen ab.
- Der statische Lockorder-Vertrag lokalisiert den tatsächlichen Batch-SELECT mit
  `FOR UPDATE` statt eines Kommentars und bindet Tabellenlock, Trades, Batch und
  Source Keys in ihrer realen Reihenfolge.

Der Releasevertrag ersetzt den verworfenen Lockorder-Zusatz durch
`global_trade_writer_revert_serialization_v1` und ergänzt
`revert_account_bijection_v1`, `default_off_redeploy_guard_v1`,
`activation_marker_guard_v1` sowie `catalog_behavior_shape_v1`. Der daraus
abgeleitete Fingerprint lautet
`c32df9198471e5804726017a209b65b887441d0402b2f4b237f8d870986c73fc`.

Die Änderungen sind noch kein Stagingbeleg. Es müssen erneut der fokussierte
Vertragstest, vollständige Suite, Typecheck, Release-Check, Production-Build,
beide zeitgebundenen Audits, statische Prüfungen, der vollständige isolierte
PostgreSQL-17.6-Harness, eine neue Evidence-/Manifestbindung und drei
unabhängige A3/A4/A5-GO-Voten auf exakt denselben Bytes bestehen. Bis dahin
bleibt **NO-GO**. Der Arbeitsblock stoppt vor Staging, Commit, Push und jeder
Änderung an PR #14. Es erfolgen keine Hosted-Supabase-, Production-, Broker-,
Credential-, Cron-, Capture- oder echten Importaktionen; Default-off und
`migration_pending` bleiben unverändert.

## 19. Vollständiger Lockgraph, Marker-Serialisierung und Runtime-Seiteneffekte

Der Snapshot aus Abschnitt 18 mit Manifest-SHA-256
`AB7D2469F8FC6DD89E451DE85520C8A30E1F88CF96C8AA019F1180AEB3FD3949`
bestand sämtliche dort gebundenen lokalen Gates, ist nach dem unabhängigen
A3/A4/A5-Review aber erneut verworfen. A3 fand eine verbleibende Lockinversion:
Ein gemischter Providerimport konnte einen vorhandenen Source Key sperren und
erst bei einem späteren neuen Trade den mit dem Revert konfliktierenden
Tabellenlock anfordern. Gleichzeitig konnte der Revert bereits `trades` halten
und am Source Key warten. A4 fand zusätzlich ein TOCTOU-Fenster zwischen
Unknown-Marker-Prüfung und Patch beziehungsweise Aktivierung sowie nicht
vollständig gebundene Trigger-, Rule-, Index-, Vererbungs-, Statistik- und
Constraint-Nebenwirkungen der beiden neuen SECURITY-DEFINER-Schreibrelationen.
A3 ergänzte als P3 einen fehlenden lokalen oberen Wait-Bound des globalen
Revert-Locks. A5 hatte keine weiteren Befunde. AB7D2469 ist kein Stagingbeleg.

Die gebündelte Folgekorrektur schließt diese Punkte auf Basis eines vollständigen
Lock- und Seiteneffektmodells:

- Jeder neue Import nimmt `ROW EXCLUSIVE` auf `public.trades`, bevor Account,
  Batch oder Source Key geschrieben oder gesperrt werden. Der Lock bleibt mit
  normalen Trade-Writern kompatibel, steht aber vor jeder möglichen
  Import/Revert-Kreuzkante. Eine echte Dreitransaktionsprobe pausiert einen
  gemischten Import nach diesem frühen Lock, startet parallel den Revert des
  Ursprungsbatches und lässt anschließend „Dublette zuerst, neuer Trade danach“
  vollständig durchlaufen.
- Der Revert trägt einen funktionslokalen `lock_timeout = 3s`; sein globaler
  Writer-Wait ist damit unabhängig vom Caller begrenzt und sicher wiederholbar.
- Patch und Aktivator sperren `equora_private.schema_migrations` in einem mit
  Receipt-Writes konfliktierenden Modus und prüfen den v57.62-Markerraum unter
  demselben Transaktionslock erneut. Der Vollverifier weist unbekannte Marker
  ebenfalls ab. Reale Zweitransaktionsproben lassen einen fremden Marker zuerst
  uncommitted schreiben und verlangen anschließend atomare Abweisung von Patch
  und Aktivierung nach dem beobachteten Relation-Wait.
- Die Aktivierung stabilisiert vor dem Verifier Gate, Importkonten und Source
  Keys in einer festen Reihenfolge. Der Verifier bindet für Importkonten das
  vollständige Indexinventar und schließt zusätzliche Trigger, Rules,
  Vererbung und erweiterte Statistiken aus. Für Source Keys ergänzt er Trigger-
  und Rule-Ausschluss; ein exaktes Key-Constraint-Set verhindert zusätzliche
  interne FK-Trigger. Negative Aktivierungsproben decken jede Klasse sowie
  Account-DDL in beiden Konkurrenzreihenfolgen ab.

Der Releasevertrag ergänzt
`import_trade_lock_precedes_source_key_v1`,
`migration_marker_serialization_v1`,
`runtime_write_side_effect_inventory_v1` und
`bounded_revert_lock_wait_v1`. Der neue Fingerprint lautet
`1ba05c08d09810a6b0f43ebba5cd5246d414e1e5a3f6884d0d9a0a9d2370f4ec`.

Auch dieser Stand bleibt bis zu vollständigen lokalen Gates, neuer
Evidence-/Manifestbindung und drei unabhängigen A3/A4/A5-GO-Voten **NO-GO**.
Der Arbeitsblock endet weiterhin vor Staging, Commit, Push und jeder Änderung
an PR #14. Hosted Supabase, Production, Broker, Credentials, Cron, Capture und
echte Importe bleiben unberührt; Gate und Anwendung bleiben default-off und
`migration_pending`.

## 20. Ausführungsbefunde und fail-closed Deaktivierung

Die erste Ausführung des in Abschnitt 19 beschriebenen Gesamtblocks zeigte drei
Fehler ausschließlich in den neuen Test-Fixtures beziehungsweise ihrer
statischen Typisierung: Der künstliche Konkurrenzmarker verletzte den bereits
bestehenden 64-Hex-Fingerprint-CHECK, eine zusätzliche UNIQUE-Negativ-Fixture
verwendete absichtlich nicht eindeutige Anzeigenamen, und die optionale
Account-Leseposition war in TypeScript nicht als festes Tupel typisiert. Diese
Fixtures wurden auf einen gültigen 64-Hex-Wert, die bereits eindeutige ID und
eine `as const`-Tupelbindung begrenzt korrigiert. Keine dieser Korrekturen lockert
einen Produkt- oder Verifiervertrag.

Ein weiterer Lauf fand dagegen einen echten Ausführungsbefund: Eine bereits
vorhandene Ausdrucksstatistik des Runtime-Gates konnte beim Eintritt in die
Deaktivierungsroutine ausgewertet werden, bevor deren bisherige Prüfung unter
dem Tabellenlock erreicht wurde. Die Deaktivierung weist deshalb vorhandene
erweiterte Statistiken nun bereits vor der ersten Auflösung beziehungsweise
Sperre der Zielrelation ab und wiederholt dieselbe Prüfung nach dem
`EXCLUSIVE`-Lock. Die zweite Prüfung schließt das konkurrierende
`CREATE STATISTICS`-Fenster; der bestehende Konkurrenztest bindet beide
DDL-Reihenfolgen. Der echte Negativfall verlangt unverändert null
Funktionsaufrufe und null persistente Seiteneffekte.

Diese Nachschärfung konkretisiert den bereits durch
`runtime_write_side_effect_inventory_v1` gebundenen fail-closed Vertrag; der
Vertragsfingerprint aus Abschnitt 19 bleibt deshalb unverändert. Der danach
vollständig wiederholte isolierte PostgreSQL-17.6-Harness bestand einschließlich
Marker-, Account-/Source-DDL-, Statistik-, Import/Revert-, Drift-, Aktivierungs-
und Deaktivierungsfällen sowie abschließender Datenbankbereinigung. Fokussierter
Vertragstest, Typecheck, Release-Check, Production-Build und beide npm-Audits
bestanden ebenfalls in den nachfolgenden Läufen; die Audits meldeten null
Schwachstellen bei 243 Abhängigkeiten.

Vor einer neuen Evidence-/Manifestbindung wird die vollständige lokale Suite
noch einmal auf den nach dieser Dokumentation unveränderten Bytes ausgeführt.
Anschließend sind unabhängige A3/A4/A5-GO-Voten auf genau diesem Hashstand
erforderlich. Bis dahin bleibt **NO-GO**; Staging, Commit, Push, PR-Änderungen
und alle Hosted-Supabase-, Production-, Broker-, Credential-, Cron-, Capture-
oder echten Importaktionen bleiben gesperrt.

## 21. Rowshare-Lockgraph, interne FK-Trigger und Publikationsinventar

Der Snapshot aus Abschnitt 20 mit Manifest-SHA-256
`69EE1D40055AD44ED9E2DE6F27274666CD27F0171BBC15E141DCB4FB57759871`
bestand die gebundenen lokalen Gates, wurde im anschließenden unabhängigen
A3/A4/A5-Review aber verworfen. A3 zeigte einen verbleibenden P2-Zyklus mit
älteren authentifizierten RPCs: Diese können zunächst eine Trade-Zeile über
`SELECT ... FOR UPDATE` sperren, dabei nur `ROW SHARE` auf `trades` halten und
erst beim späteren UPDATE oder DELETE `ROW EXCLUSIVE` anfordern. Der bisherige
`SHARE ROW EXCLUSIVE`-Revert-Lock war mit dem anfänglichen `ROW SHARE`
kompatibel und konnte deshalb zwischen beide Schritte geraten. A4 zeigte einen
zweiten P2: Ein eingehender Fremdschlüssel einer dritten Tabelle konnte interne
Cascade-Trigger auf `journal_import_accounts` erzeugen, ohne vom lokalen
Constraint-Zähler oder dem Ausschluss nur nichtinterner Trigger erkannt zu
werden. A5 gab für Scope/Claims/Evidence GO und ergänzte zwei P3-Hinweise zu
Dokumentdatum und fehlenden Rohlog-Hashes. 69EE1D40 ist kein Stagingbeleg.

Die gebündelte Folgekorrektur erweitert das Modell an den tatsächlichen
Kreuzkanten:

- Der Revert nimmt nun `EXCLUSIVE` auf `public.trades`, bevor er irgendeine
  Trade-Zeile sperrt. Dieser Modus kollidiert sowohl mit dem `ROW EXCLUSIVE`
  normaler Writer als auch mit dem `ROW SHARE` eines vorausgehenden
  `SELECT ... FOR UPDATE`; gewöhnliche `ACCESS SHARE`-Leser bleiben möglich.
  Eine echte Zweitransaktionsprobe hält zuerst nur die Zeile, beobachtet den
  Revert am Relation-Lock und führt danach das spätere UPDATE aus. Eine zweite
  Probe blockiert den Revert länger als seinen funktionslokalen Drei-Sekunden-
  Timeout, verlangt atomaren Fehler und anschließend erfolgreichen Retry.
- Der Verifier bindet auf Importkonten und Source Keys jeweils die vollständige
  Acht-Trigger-Menge. Zugelassen sind ausschließlich aktivierte interne Trigger,
  deren `tgconstraint` zu den bereits exakt geprüften erwarteten FK-OIDs und
  Relationen gehört. Ein eingehender `ON UPDATE CASCADE`-FK einer dritten
  Tabelle muss nach einer positiven Cascade-Kontrolle vor Aktivierung atomar
  scheitern. Beide DDL-Reihenfolgen werden zusätzlich konkurrierend geprüft.
- Mitgliedschaften des Gates, der Importkonten oder Source Keys in logischen
  PostgreSQL-Publikationen werden über `pg_publication_tables` einschließlich
  `FOR ALL TABLES` abgewiesen. Damit sind Realtime-/Replikationseffekte nicht nur
  dokumentarisch ausgegrenzt, sondern Bestandteil des fail-closed
  Aktivierungsinventars. Negativ- und Konkurrenzproben decken vorhandene und
  während der Aktivierung angeforderte Publikationsmitgliedschaften ab.
- Die nächste Gate-Receipt bindet zusätzlich Hashes vollständiger lokaler
  Rohlogs. Dadurch bleibt die verdichtete Ergebnisdarstellung erhalten, ist
  aber nicht mehr der einzige dauerhafte Ausführungsbeleg.

Der Releasevertrag ergänzt `exclusive_revert_precedes_rowshare_v1`,
`exact_internal_fk_trigger_inventory_v1` und
`logical_publication_inventory_v1`. Der neue Fingerprint lautet
`3de9606c724c7c961c7fe0f709ac33f82a9291daac45ba54d2661411448bc34e`.

Auch dieser Stand bleibt bis zu vollständigen lokalen Gates, neuer
Rohlog-/Evidence-/Manifestbindung und drei unabhängigen A3/A4/A5-GO-Voten
**NO-GO**. Der Arbeitsblock stoppt vor Staging, Commit, Push und jeder Änderung
an PR #14; Hosted Supabase, Production, Broker, Credentials, Cron, Capture und
echte Importe bleiben unberührt. Gate und Anwendung bleiben default-off und
`migration_pending`.

## 22. Privilegierte Publication-Grenze und Rollenbindung

Der Snapshot aus Abschnitt 21 mit Manifest-SHA-256
`FED8F0D685CAF9C9356BD2C2E5A56F335221161102037282834F39F03FDCF06F`
bestand alle gebundenen lokalen Gates und erhielt A3- sowie A5-GO. A4 verwarf
ihn dennoch wegen eines P2-Races: Die tabellenbezogenen Zielrelationlocks
serialisierten `CREATE/ALTER PUBLICATION ... FOR TABLE ...`, nicht jedoch
`FOR ALL TABLES` oder `FOR TABLES IN SCHEMA public`. Ein solcher privilegierter
Publication-Writer konnte deshalb die letzte Verifier-Lesung kreuzen.
FED8F0D6 ist kein Stagingbeleg.

Eine zunächst untersuchte Sperre auf `pg_catalog.pg_publication` wurde im
echten Supabase-PostgreSQL-17.6-Image verworfen: Der vorgesehene Release-
Executor `postgres` ist dort bewusst kein Superuser, kein Mitglied von
`supabase_admin` und besitzt keine Berechtigung für einen schreibkonfligierenden
Kataloglock. Die Korrektur behauptet daher keine technisch nicht vorhandene
Serialisierung.

Stattdessen bindet Aktivierung und Verifier den zulässigen Executor ausdrücklich
an die Nicht-Superuser-Grenze: `postgres` darf weder Superuser sein noch einen
Superuser erben. PostgreSQL 17 erlaubt `FOR ALL TABLES` und
`FOR TABLES IN SCHEMA` ausschließlich Superusern. Bereits vorhandene direkte,
globale oder schemaweite Memberships der drei geschützten Relationen werden
weiterhin über die expandierte Sicht `pg_publication_tables` abgewiesen.
Relationengebundene Publication-DDL des Release-Executors bleibt durch die
Zielrelationlocks in beiden Reihenfolgen technisch serialisiert.

Parallele DDL einer separaten Superuser-Administration ist wie jede andere
gleichzeitige privilegierte Katalogmutation außerhalb der Schutzmacht des
nichtprivilegierten Release-Executors. Für Aktivierung und Deaktivierung gilt
deshalb zwingend eine administrative DDL-Freeze-Präcondition: Während der
gesamten Transaktion darf kein separater Superuser Publication-, Schema-,
Tabellen-, Policy-, Rollen- oder Funktions-DDL ausführen. Das ist ein
Betriebsgate und keine vom SQL selbst erzwungene Garantie. Lokale Negativproben
erzeugen globale und schemaweite Publications gezielt über `supabase_admin`
und verlangen deren atomare Ablehnung vor Aktivierung.

Zusätzlich bindet der Verifier die Laufzeitrolle `authenticated` als
Nicht-Superuser ohne `BYPASSRLS`, `CREATEROLE`, `CREATEDB`, `LOGIN` oder
`REPLICATION`; ein gezielter `BYPASSRLS`-Drift muss die Aktivierung atomar
blockieren. Der Releasevertrag ergänzt
`privileged_publication_ddl_freeze_v1` und
`authenticated_role_attributes_v1`; der neue Fingerprint lautet
`460e008096b8f217e68d27f04c72b95b676d2b149daf49d5913d5a822cac628b`.

Auch dieser Stand bleibt bis zu vollständigen lokalen Gates, neuer
Rohlog-/Evidence-/Manifestbindung und drei unabhängigen A3/A4/A5-GO-Voten
**NO-GO**. Der Arbeitsblock stoppt vor Staging, Commit, Push und jeder Änderung
an PR #14; Hosted Supabase, Production, Broker, Credentials, Cron, Capture und
echte Importe bleiben unberührt. Gate und Anwendung bleiben default-off und
`migration_pending`.

## 23. Post-Merge-Abschluss und Production-Preflight-Vorbereitung

Die Schlussprüfung von PR #14 band den unveränderten Review-Head
`13ac447df7e95c84bc9aef2c526e6e5f1303284e`, den Tree
`0868907cd1fb05abdd9072541f6b24f05bff3196` und 19 Live-Git-Blobs. A3, A4 und
A5 erteilten jeweils GO ohne offene P0–P2-Befunde. Der PR wurde danach am
2026-09-14 kontrolliert per Squash-Merge in `main` übernommen:

- Squash-Commit und `origin/main`:
  `889a145e3443e52e5298ae945f53e3a8f44dc50b`;
- GitHub-CI-Run `34877824745`: `success` auf exakt diesem Commit;
- Vercel-Production-Deployment: `success` auf exakt diesem Commit;
- Feature-Branch nicht gelöscht;
- keine v57.62.0-Supabase-Migration, Datenbank-Gate-Aktivierung, Broker-,
  Credential-, Cron-, Capture- oder echte Importaktion.

Die Anwendung bleibt weiterhin bei `migration_pending`,
`persistenceEnabled=false` und `controlled_candidate`. Der erfolgreiche
Vercel-Deploy bedeutet deshalb nicht, dass der produktive Dateiimport bereits
persistiert oder dass der Hosted-Supabase-Vertrag bestanden wurde.

Der frische Branch `codex/file-import-post-merge-v57.62.0` wurde exakt von
diesem `origin/main` angelegt. Der erste Production-Preflight-Stand wurde als
Commit `b78447e1357795fafafdd6f72724dc849377c8bf` gepusht und in Draft-PR #15
gegen `main` geöffnet. GitHub-CI-Run `34890959535`, Vercel und Vercel Preview
Comments waren auf exakt diesem Head erfolgreich. A3, A4 und A5 lehnten den
Snapshot dennoch wegen nicht verhaltensgetesteter Evidence-Pfad- und
Production-Ziel-/TLS-Grenzen ab; grüne CI ersetzte diese Prüfung nicht.

Der lokale Remediationstand vom 2026-09-15 schließt deshalb fail-closed:

1. EvidenceDirectory muss absolut, außerhalb des Repositorys und frei von
   Dateisystem-Root-, Junction- oder Symlink-Rückwegen sein;
2. URL-Host und separat bestätigter Dashboard-Host müssen exakt übereinstimmen;
3. Direct und Shared Session Pooler besitzen getrennte Host-/Benutzerverträge;
4. TLS verlangt `verify-full` und ein explizites externes Supabase-
   Root-Zertifikat;
5. Manifestidentität, exakte Sieben-Pfade-Menge, `psql`-Pfad und Version werden
   zusätzlich gebunden beziehungsweise protokolliert;
6. ausführbare lokale Positiv-/Negativtests prüfen die kritischen Grenzen ohne
   Netzwerk- oder Supabase-Zugriff.

Der Backup-/Recovery-Entscheidungswert lautet vor jeder Liveprüfung weiterhin
`NO_GO`. Ein späterer read-only Preflight darf erst nach eigener Freigabe zu
`GO_PREFLIGHT_READ_ONLY` wechseln. Ein default-off Deploy verlangt danach
separat `GO_DEPLOY_DEFAULT_OFF`, insbesondere einen aktuell verifizierten
Restorepunkt, frische hashgebundene Rollen-/Schema-/Datendumps außerhalb des
Repositorys, Recovery-Owner und Wartungsfenster. Ein Restore-Rehearsal bleibt
vor Pilot-, Kunden- oder Brokerbetrieb Pflicht; eine Vertagung ist ein
ausdrücklich zu akzeptierendes Restrisiko und kein PASS.

Gatezustand dieses ausdrücklich vor Remediation-Staging eingefrorenen
Dokumentationssnapshots:

```text
snapshot = 2026-09-15_pre_remediation_staging
pr14 = squash_merged
origin_main = 889a145e3443e52e5298ae945f53e3a8f44dc50b
github_main_ci = success
vercel_production = success
pr15 = open_draft
pr15_reviewed_head = b78447e1357795fafafdd6f72724dc849377c8bf
pr15_ci_preview = success
pr15_a3_a4_a5 = no_go_on_reviewed_head
local_remediation = unstaged_validation_in_progress
application_capability = migration_pending
application_persistence = false
database_candidate_installation = not_executed
database_gate = not_live_verified_assumed_absent_until_preflight
backup_recovery_decision = prepared_no_go_until_live_evidence
production_preflight = not_executed
production_deploy_default_off = not_authorized
database_gate_activation = not_authorized
restore = not_authorized
broker_cron_capture_import = not_authorized
ready_for_review_merge = not_authorized
```

Dieser Remediationblock stoppt erneut vor Staging, Commit, Push, Änderung an
Draft-PR #15 und vor jedem Zugriff auf das Hosted-Supabase-Projekt.
Zeitabhängige Backup-, Plan-, Restorepunkt-, Zähler- und Zielclaims müssen in
einem späteren ausdrücklich freigegebenen Preflight frisch erhoben werden.

## 24. PR-#15-Live-Review und lokale Evidence-Receipt-Remediation

Der unveränderte Draft-PR-Head
`c02310f0dee8d4f127096bc4e3b7c03aacd8efdc` bestand GitHub-CI und Vercel
Preview. Der anschließend exakt auf diesen Head gebundene unabhängige
Live-PR-Review ergab:

- A3: GO ohne P0–P2;
- A4: GO ohne P0–P2;
- A5: NO-GO wegen eines P2-Evidence-Befunds.

Der A5-Befund war berechtigt: Das Preflight-SQL setzte Trade- und
Batch-Baselinecounts nur als interne `psql`-Variablen, während Runner und Receipt
sie nicht evidenzfähig ausgaben. Dadurch konnte das v1-Receipt den eigenen
Runbook-Vertrag zu protokollierten Baselinecounts nicht erfüllen.

Der lokale Remediationkandidat vom 2026-09-17 schließt diese Lücke ohne Änderung
der sieben SQL-Artefakte:

1. derselbe `psql`-Prozess gibt nach dem einzigen manifestgebundenen `-f`-Lauf
   die bereits erhobenen Variablen über ein einzelnes `-c \echo`
   maschinenlesbar aus;
2. der Runner verlangt exakt einen Evidence-Record und exakt einen PASS-Record;
3. Trade- und Batchcount müssen nichtnegative Int64-Werte sein;
4. `apply_required` muss in beiden Records übereinstimmen;
5. das v2-Receipt speichert beide Counts, den booleschen Apply-Status, die
   Evidence-Gültigkeit und Parsefehler;
6. ein netzwerkfreier Fake-`psql`-Harness prüft Erfolg, Argumentgrenzen,
   Log-/Receipt-Hashbindung, Secret-Nichtausgabe und Fail-Closed-Fehlerfälle in
   beiden unterstützten lokalen PowerShell-Laufzeiten.

Die sieben SQL-Dateien und
`docs/gates/EQUORA_v57.62.0_PRODUCTION_SQL_MANIFEST.json` bleiben bytegleich.
Der Kandidat benötigt vor jeder weiteren Git- oder PR-Aktion vollständige lokale
Gates, neue Scope-/Hash-/Secret-Prüfungen und neue unabhängige A3/A4/A5-Voten auf
exakt denselben Bytes.

```text
snapshot = 2026-09-17_local_receipt_remediation_candidate
pr15 = open_draft
pr15_reviewed_head = c02310f0dee8d4f127096bc4e3b7c03aacd8efdc
pr15_ci_preview = success
prior_pr15_a3 = go
prior_pr15_a4 = go
prior_pr15_a5 = no_go_one_p2
local_remediation = unstaged_validation_required
production_sql_manifest = unchanged_seven_of_seven
production_preflight = not_executed
production_deploy_default_off = not_authorized
database_gate_activation = not_authorized
restore = not_authorized
broker_cron_capture_import = not_authorized
ready_for_review_merge = not_authorized
```

Dieser Block stoppt weiterhin vor Staging, Commit, Push, jeder Änderung an
Draft-PR #15 und vor jedem Hosted-Supabase-, Production-, Broker-, Credential-,
Cron-, Capture- oder Importzugriff.

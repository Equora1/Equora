# Equora v57.62.0 — Production-Preflight-Runbook

Stand: 2026-09-19
Status: **LOKAL VORBEREITET / HOSTED-SUPABASE-PREFLIGHT NICHT AUSGEFÜHRT**

## 1. Zweck und harte Grenze

Dieses Runbook bereitet ausschließlich die spätere, separat freizugebende
Production-Datenbanksequenz für die additive Dateiimport-Persistenz vor. Es
erteilt keine Freigabe für einen Datenbankzugriff und führt bei seiner lokalen
Validierung keinen Netzwerk-, Supabase- oder Production-Aufruf aus.

Der zugehörige Runner
`scripts/run-v57.62.0-production-preflight.ps1` besitzt genau zwei Modi:

- `ValidateLocal` ist der Standard. Er prüft lokal Branch, Git-Stand und die
  normalisierten SHA-256-Bindungen aller sieben SQL-Artefakte.
- `ExecuteReadOnly` führt ausschließlich
  `supabase/preflight-v57.62.0-trade-import.sql` aus. Er enthält weder den
  Deploytreiber noch Aktivierung oder Deaktivierung und erzwingt zusätzlich
  `default_transaction_read_only=on` auf Sitzungsebene.

Deployment, Datenbank-Gate-Aktivierung, Restore, App-Aktivierung, Brokerzugriff,
Cron, Capture und echter Import bleiben jeweils eigene Freigabegates.

## 2. Gebundener Kandidat

| Feld | Wert |
|---|---|
| Repository | `Equora1/Equora` |
| Squash-Commit auf `main` | `889a145e3443e52e5298ae945f53e3a8f44dc50b` |
| Commit-Tree | `0868907cd1fb05abdd9072541f6b24f05bff3196` |
| Mergequelle | PR #14, Review-Head `13ac447df7e95c84bc9aef2c526e6e5f1303284e` |
| Migration | `equora_v57.62.0_trade_import_persistence_v1` |
| Fingerprint | `460e008096b8f217e68d27f04c72b95b676d2b149daf49d5913d5a822cac628b` |
| Datenbank-Gate | `journal_file_import_persistence_v2` |
| Installationsziel | `enabled=false`, `activated_at=null` |
| Production-Project-Ref | `rrkfdprhqilvicjbgfcn` |
| SQL-Manifest | `docs/gates/EQUORA_v57.62.0_PRODUCTION_SQL_MANIFEST.json` |

Der Project Ref ist eine Zielidentität, kein Credential. URL, Passwort,
Access-Token, Service-Role-Key und andere geheime Werte dürfen weder in Git noch
in dieses Runbook, Screenshots, Chatnachrichten oder Evidence-Dateinamen gelangen.

## 3. Aktueller belastbarer Zustand

- PR #14 wurde per Squash-Merge in `main` übernommen.
- GitHub-CI und das dadurch ausgelöste Vercel-Production-Deployment waren auf
  dem Squash-Commit erfolgreich.
- Die Anwendung bleibt bei `deploymentState="migration_pending"`,
  `persistenceEnabled=false` und `catalogAvailability="controlled_candidate"`.
- Das Production-Supabase-Projekt wurde für v57.62.0 noch nicht gelesen oder
  verändert. Der historisch dokumentierte Sieben-Marker-Stand ist eine
  Preflight-Anforderung, keine aktuelle Livebehauptung.
- Die Installation und das Datenbank-Gate sind getrennt. Selbst eine später
  erfolgreiche Installation muss das Gate ausgeschaltet lassen.

## 4. Backup- und Recovery-Entscheidung

### 4.1 Fakten, die vor einem Deploy erhoben werden müssen

Ein Operator und ein unabhängiger Beobachter dokumentieren vor jeder
Production-DDL mindestens:

1. Zielname, Project Ref, Datenbankname, Verbindungsmodus und UTC-Zeit.
2. Supabase-Plan und tatsächliche Backupart: Daily Backup oder PITR.
3. Zeitstempel des jüngsten **wiederherstellbaren** Backups beziehungsweise den
   letzten PITR-Restorepunkt und die angezeigte Retention.
4. Drei frische logische Exporte außerhalb des Repositorys: Rollen, Schema und
   Daten. Jeder Export muss vorhanden, größer als null Byte und SHA-256-gebunden
   sein. Die Dateien müssen verschlüsselt und getrennt vom Arbeitscheckout
   aufbewahrt werden.
5. Verantwortliche Person, Wartungsfenster, erwartete Downtime eines Restores
   und die konkrete Stelle, an der Restore-Zugang und Backup-Evidence liegen.
6. Relevanz von Supabase Storage. Datenbankbackups enthalten nur Storage-
   Metadaten, nicht die eigentlichen Storage-Objekte. Die v57.62.0-Migration
   verändert keine Storage-Objekte; ein allgemeiner Disaster-Recovery-Plan muss
   sie dennoch separat berücksichtigen.
7. Vorhandene Replikationsslots oder Subscriptions. Diese können bei einem
   Restore zusätzliche Vor- und Nacharbeiten erfordern.

Die Supabase-Dokumentation ist unmittelbar vor der realen Ausführung erneut zu
prüfen. Stand 2026-09-14 gilt laut offizieller Dokumentation:

- automatische tägliche Backups stehen für Pro-, Team- und Enterprise-Projekte
  mit planabhängiger Retention zur Verfügung;
- PITR ist ein kostenpflichtiges Add-on und ersetzt bei Aktivierung die Daily
  Backups;
- physische Backups sind nicht zwingend herunterladbar; logische Exporte bleiben
  über `supabase db dump` beziehungsweise `pg_dump` möglich;
- ein Restore macht das Projekt während der Wiederherstellung unzugänglich und
  kann alle neueren Daten seit dem gewählten Restorepunkt verlieren;
- ein Restore in ein neues Projekt ist für geeignete Paid-Plan-Projekte als
  Beta-Funktion verfügbar, übernimmt aber nicht sämtliche Plattformkonfiguration.

Quellen:

- <https://supabase.com/docs/guides/platform/backups>
- <https://supabase.com/docs/reference/cli/supabase-db-dump>
- <https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>
- <https://supabase.com/docs/guides/platform/clone-project>
- <https://supabase.com/docs/guides/database/connecting-to-postgres>
- <https://supabase.com/docs/guides/platform/ssl-enforcement>
- <https://supabase.com/docs/guides/database/psql>
- <https://www.postgresql.org/docs/17/libpq-ssl.html>

### 4.2 Exakte Gate-Entscheidung

| Entscheidung | Mindestbedingungen | Ergebnis |
|---|---|---|
| Read-only Preflight | Exakter freigegebener Git-Head, saubere Arbeitskopie, SQL-Manifest 7/7, korrekt gebundenes Production-Ziel, `psql` verfügbar, separate Freigabe | `GO_PREFLIGHT_READ_ONLY` |
| Default-off Deploy | Read-only Preflight PASS; Plattformbackup/PITR aktuell und wiederherstellbar; drei frische logische Exporte hashgebunden; Recovery-Owner und Wartungsfenster bestätigt; keine ungeklärte Ziel- oder Schemadrift; separate Schreibfreigabe | `GO_DEPLOY_DEFAULT_OFF` |
| Datenbank-Gate-Aktivierung | Default-off Deploy und Postflight PASS; separater App-Aktivierungskandidat vollständig getestet; administrativer DDL-Freeze; separate Aktivierungsfreigabe | `GO_ACTIVATE_DATABASE_GATE` |
| Restore | Datenverlust-/Korruptionsbefund, festgelegter Restorepunkt, Auswirkungsanalyse, Downtime-Kommunikation und neue ausdrückliche Restore-Freigabe | `GO_RESTORE` |

Fehlt auch nur eine Mindestbedingung, lautet der Status `NO_GO`. Weder ein
vorhandener Dashboard-Eintrag noch ein erfolgreich erzeugter Dump beweist für
sich allein die praktische Wiederherstellbarkeit. Ein Restore-Rehearsal in ein
isoliertes Ziel bleibt vor Pilot-, Kunden- oder Brokerbetrieb Pflicht. Wird es
für die ausschließlich default-off bleibende additive Installation vertagt,
muss dies als ausdrücklich akzeptiertes Restrisiko protokolliert werden; es ist
keine technische PASS-Behauptung.

### 4.3 Recovery-Strategie

Die v57.62.0-Migration ist additiv und installiert default-off. Deshalb gilt:

1. **Preflight scheitert:** keine DDL ausführen; Ursache read-only klären.
2. **Backup oder Dump scheitert:** kein Deploy ausführen.
3. **Schema-Transaktion scheitert:** keine blinde Wiederholung. Zuerst Marker,
   Teilzustand und Transaktionsausgang read-only prüfen.
4. **Schema ist installiert, Postflight scheitert:** Capability bleibt
   `migration_pending`, Gate bleibt beziehungsweise wird fail-closed gehalten;
   kein destruktiver Down-Rollback und kein automatischer Restore. Zählerdrift
   kann aus parallelen Journalaktionen stammen und muss separat attribuiert
   werden.
5. **Gate wurde in einem späteren Schritt aktiviert und Betrieb ist unsicher:**
   zuerst nach eigener Freigabe den geprüften Deaktivator verwenden. Er erhält
   Schema, Trades, Import-Batches, Quellschlüssel und Audit-Historie.
6. **Belegte Korruption oder Datenverlust:** Schreibwege einfrieren und über
   Restore entscheiden. Ein Plattform-Restore ist die letzte Maßnahme, weil er
   Downtime und Verlust neuerer Daten verursachen kann.

## 5. Lokale Vorbereitung ohne Supabase-Zugriff

Im Repository-Root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-v57.62.0-production-preflight.ps1 `
  -Mode ValidateLocal
```

Erwartet werden:

- `sqlFileCount = 7`;
- alle sieben normalisierten SHA-256-Werte stimmen;
- `preflightExecutionTransport = "stdin-with-inlined-verifier"` sowie SHA-256
  und Bytezahl der exakten späteren stdin-Nutzlast sind vorhanden;
- `hostedSupabaseAccessed = false`;
- `databaseMutationAttempted = false`.

Ein schmutziger Arbeitsbaum ist in `ValidateLocal` sichtbar, aber zulässig,
damit die Dokumentationsänderung selbst geprüft werden kann. Für
`ExecuteReadOnly` ist eine vollständig saubere Arbeitskopie zwingend.

## 6. Späterer read-only Production-Preflight

Dieser Abschnitt ist eine Ausführungsanweisung, aber **keine aktuelle
Ausführungsfreigabe**.

Vorbedingungen:

- neuer, konkret freigegebener Arbeitsblock;
- exakt benannter 40-stelliger Commit und saubere Arbeitskopie;
- Production-Project-Ref separat gegen die Supabase-Oberfläche verifiziert;
- exakter Datenbankhost aus dem aktuellen Supabase-Connect-Dialog separat
  verifiziert; ein Pooler-Host darf nicht aus einer Region geraten werden;
- Verbindungsstring ausschließlich in der kurzlebigen Prozessvariable
  `EQUORA_SUPABASE_DATABASE_URL`, geladen aus einem Secret Store und nie
  ausgegeben;
- das aktuelle Supabase-Server-Root-Zertifikat aus den Database Settings liegt
  als nichtleere Datei außerhalb des Repositorys; unter Windows ist nur ein
  normaler laufwerksqualifizierter Langpfad auf einem bereiten festen lokalen
  Laufwerk zulässig; sein absoluter Pfad wird nur über
  `EQUORA_SUPABASE_SSL_ROOT_CERT` übergeben; sein SHA-256 muss unabhängig aus
  derselben konkret freigegebenen Quelle ermittelt und separat als
  `ExpectedSslRootCertificateSha256` übergeben werden;
- absoluter Evidence-Ordner außerhalb des Repositorys; unter Windows ebenfalls
  als normaler laufwerksqualifizierter Langpfad auf einem bereiten festen
  lokalen Laufwerk; Repository-Root, Unterordner, Dateisystem-Root, Junction,
  symbolischer Link, UNC-/Netzlaufwerk, Namespace-, `SUBST`-/DOS-Device- und
  8.3-Kurznamenpfade sind unzulässig;
- absoluter, separat freigegebener nativer `psql`-Pfad und vorab unabhängig
  ermittelter SHA-256 derselben Binärdatei; unter Windows sind nur `.exe` auf
  einem bereiten festen lokalen Laufwerk ohne Reparse-/Symlink-Komponente
  zulässig; zusätzlich muss der kanonische SHA-256 des vollständigen direkten
  `psql`-Bundleverzeichnisses separat als `ExpectedPsqlBundleSha256` freigegeben
  sein;
- genau ein Operator, ein unabhängiger Beobachter, kein paralleles DDL.

Beispiel mit absichtlich nicht ausgefülltem Evidence-Ziel:

```powershell
$approvedHead = '<EXAKTER_FREIGEGEBENER_40_STELLIGER_COMMIT>'
$approvedDatabaseHost = '<EXAKTER_HOST_AUS_DEM_SUPABASE_CONNECT_DIALOG>'
$evidenceRoot = '<ABSOLUTER_ORDNER_AUSSERHALB_DES_REPOSITORYS>'
$approvedPsqlPath = '<ABSOLUTER_FREIGEGEBENER_PSQL-PFAD>'
$approvedPsqlSha256 = '<FREIGEGEBENER_64-HEX-SHA256>'
$approvedPsqlBundleSha256 = '<FREIGEGEBENER_BUNDLE-MANIFEST-SHA256>'
$approvedSslRootSha256 = '<FREIGEGEBENER_ROOT-ZERTIFIKAT-SHA256>'

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-v57.62.0-production-preflight.ps1 `
  -Mode ExecuteReadOnly `
  -ExpectedHead $approvedHead `
  -ExpectedProjectRef 'rrkfdprhqilvicjbgfcn' `
  -ExpectedDatabaseHost $approvedDatabaseHost `
  -EvidenceDirectory $evidenceRoot `
  -PsqlExecutablePath $approvedPsqlPath `
  -ExpectedPsqlSha256 $approvedPsqlSha256 `
  -ExpectedPsqlBundleSha256 $approvedPsqlBundleSha256 `
  -ExpectedSslRootCertificateSha256 $approvedSslRootSha256
```

Der Runner:

- lässt `ExecuteReadOnly` ausschließlich auf dem geprüften Windows-Profil zu;
  andere Plattformen brechen vor Credentialverarbeitung und Prozessstart ab;
- akzeptiert nur den bekannten Equora-Production-Project-Ref;
- verlangt exakte Übereinstimmung von URL-Host und separat freigegebenem Host;
- akzeptiert Direct ausschließlich als `db.<Project-Ref>.supabase.co:5432` mit
  Benutzer `postgres`;
- akzeptiert den Shared Session Pooler ausschließlich als kanonischen
  `Provider-Index-Region.pooler.supabase.com:5432`-Host mit Benutzer
  `postgres.<Project-Ref>`; Transaction- und Dedicated-Pooler auf Port `6543`
  sind für diesen Lauf ausgeschlossen;
- akzeptiert ausschließlich Datenbank `postgres`;
- übergibt das Passwort nicht als Kommandozeilenargument;
- lehnt Steuerzeichen in den percent-dekodierten URL-Credentials fail-closed ab;
- verwirft das geerbte Kindprozess-Environment vollständig, übernimmt nur die
  begründete Betriebssystem-Allowlist `SystemRoot`, `WINDIR`,
  `TEMP`/`TMP`/`TMPDIR`, `LANG`/`LC_*` und `TZ` und setzt danach ausschließlich
  die vier für `psql` erforderlichen `PG*`-Werte sowie einen auf das gebundene
  Bundleverzeichnis, `System32` und den Windows-Ordner begrenzten `PATH`;
  insbesondere können keine ambienten `PGSERVICE*`-,
  `PGPASSFILE`-, Client-Key- oder fachfremden Credential-Variablen in den
  Kindprozess gelangen;
- erzwingt `sslmode=verify-full`, liest das freigegebene Root-Zertifikat einmal,
  vergleicht die Bytes vor Prozessstart mit dem separat freigegebenen Sollhash
  und übergibt ausschließlich deren
  temporäre, owner-only geschützte Kopie über `PGSSLROOTCERT`;
  `sslmode=require` ist unzulässig;
- startet `psql` mit `-X`, `--no-psqlrc`, `ON_ERROR_STOP=1` und erzwungener
  read-only Sitzung;
- erzeugt `psql` unter Windows mit `CreateProcessW(..., CREATE_SUSPENDED)` und
  einer expliziten, nur stdin/stdout/stderr umfassenden Handle-Liste, weist den
  noch suspendierten Root dem Kill-on-close-Job zu, beweist die Mitgliedschaft
  und ruft erst danach `ResumeThread` auf; bei jedem Zuweisungsfehler wird der
  noch nicht ausgeführte Root beendet und sein Ende nachgewiesen;
- startet `psql` damit über eine explizite native Prozessgrenze, erfasst `stdout` und
  `stderr` getrennt und wertet den nativen Exitcode unabhängig von
  `$ErrorActionPreference` aus; für das Evidence-Log werden zuerst die
  vollständigen `stdout`- und anschließend die vollständigen `stderr`-Zeilen
  deterministisch zusammengeführt;
- akzeptiert unter Windows keinen `.cmd`-/`.bat`-Wrapper als `psql`, sondern
  verlangt einen direkt gestarteten nativen Prozess; dadurch entsteht keine
  zweite `cmd.exe`-Parsing- oder Metazeichengrenze;
- verwendet keine `PATH`-Discovery für `psql`, sondern bindet den explizit
  freigegebenen absoluten Pfad an den freigegebenen SHA-256. Zusätzlich werden
  sämtliche regulären Dateien im direkten Bundleverzeichnis ordinal sortiert
  als `Dateiname<TAB>Bytezahl<TAB>SHA-256<LF>` kanonisiert und gegen den separat
  freigegebenen Bundlehash geprüft. Aus den bereits geöffneten und gehashten
  Bytes wird im owner-only Evidence-Laufordner ein neuer Ausführungssnapshot
  aufgebaut, erneut vollständig gegen Executable- und Bundlehash geprüft und
  danach so gehärtet, dass ein realer Dateierstellungsversuch des Runner-Tokens
  unmittelbar vor Prozessstart mit `UnauthorizedAccessException` scheitern
  muss.
  Die Snapshotdateien bleiben während des Prozesses zusätzlich über Read-Handles
  gegen Schreiben und Löschen gesperrt; ausschließlich aus diesem Snapshot wird
  gestartet und dessen Verzeichnis steht als erster und einziger nicht zum
  Betriebssystem gehörender Eintrag im Kindprozess-`PATH`. Diese Grenze schützt
  nicht vor einem bösartigen Prozess unter derselben Windows-Identität: Der
  Verzeichniseigentümer könnte die DACL erneut ändern und könnte ohnehin die
  im Parentprozess gehaltenen Zugangsdaten untersuchen. Ein solcher
  Same-Identity-Angreifer ist deshalb ausdrücklich nicht Teil dieses
  Ausführungsmodells. Das v5-Receipt setzt
  `psqlDependencySetBound=true`,
  `psqlExecutionSnapshotWriteDeniedAtLaunch=true` und
  `psqlExecutionSnapshotSameIdentityAdversaryExcluded=true`; außerdem nennt es
  Bundlehash und Dateizahl;
- führt keinen separaten `psql --version`-Prozess aus. Das v5-Receipt setzt
  `psqlVersion=null` und `psqlVersionProbeAttempted=false`, statt eine
  unzureichend geschützte Versionsprobe als Evidence auszugeben;
- begrenzt den eigentlichen Preflight standardmäßig auf 75 Sekunden; der Wert
  ist nur zwischen einer und 120 Sekunden konfigurierbar. Die gemeinsame
  Hostdeadline beginnt vor `CreateProcessW` und umfasst damit auch den
  asynchronen stdin-Write. Ein Kind, das stdin nicht liest, kann die Deadline
  nicht umgehen. Es gibt keinen `taskkill`-Fallback;
- terminiert nach Root-Ende oder Timeout den gesamten Job, prüft dessen aktive
  Prozesszahl bis auf null, beweist das Root-Ende und schließt das Job-Handle
  fehlergeprüft. Jeder Zuweisungs-, Terminierungs-, Leerstands-, Handle- oder
  Streamfehler macht den Lauf fail-closed; erst danach werden Log und Receipt
  abgeschlossen;
- ersetzt im Speicher exakt den einen manifestgebundenen
  `\ir verify-v57.62.0-trade-import.sql`-Include durch die ebenfalls
  manifestgebundenen Verifierbytes, lehnt andere als die explizit erlaubten
  `psql`-Metakommandos ab und übergibt die exakten zusammengesetzten Bytes über
  stdin mit `-f -`; SHA-256 und Bytezahl dieser Nutzlast stehen im v5-Receipt;
- gibt im selben `psql`-Prozess die bereits per `\gset` erhobenen Werte über
  genau ein nachgeschaltetes `-c \echo` maschinenlesbar aus; es entsteht weder
  eine zweite Datenbanksitzung noch ein zusätzlicher SQL-Aufruf;
- protokolliert den absoluten freigegebenen `psql`-Quellpfad getrennt vom
  tatsächlich ausgeführten absoluten Snapshotpfad und dessen relativem
  Laufordnerpfad sowie Binär- und Bundle-SHA-256, Dateizahl, Prozessgrenze,
  Verbindungstyp und erwarteten und tatsächlichen Root-Zertifikat-SHA-256,
  jedoch weder
  Zertifikatspfad noch Passwort;
- wertet ausschließlich das intern gehaltene, unveränderte `stdout` aus und
  redigiert vor jeder Persistenz das exakte Passwort, die vollständige
  Connection-URL sowie Eingabe- und aufgelösten Zertifikatspfad aus beiden
  Kindprozess-Ausgabekanälen; unterschiedliche gleich lange Secrets bleiben
  eigenständige Redaktionswerte;
- erzeugt je Lauf einen nicht vorhersagbaren owner-only geschützten Unterordner
  im externen Evidence-Root und reserviert Log, temporäres Receipt und
  Zertifikatskopie mit `CreateNew`; erst ein vollständig geschriebenes und auf
  Datenträger geflushtes `receipt.pending` wird atomar in `receipt.json`
  umbenannt. `receiptComplete=true` ist der Abschlussmarker;
- führt ausschließlich den Preflight aus und setzt im Receipt
  `deploymentAttempted=false` sowie `activationAttempted=false`.

Die maschinenlesbare Zeile besitzt exakt dieses Format:

```text
EQUORA_V5762_PREFLIGHT_EVIDENCE trades_count=<non-negative-int64> batches_count=<non-negative-int64> apply_required=<true|false>
```

Der Runner akzeptiert genau eine solche Zeile und genau eine Abschlusszeile. Er
lehnt fehlende, doppelte, syntaktisch abweichende, negative oder übergroße
Zähler sowie widersprüchliche `apply_required`-Werte fail-closed ab. Das Receipt
mit Schema `equora-v57.62.0-production-preflight-receipt-v5` speichert
`preflightApplyRequired`, `preflightTradesCount`, `preflightBatchesCount`,
`preflightEvidenceValid`, etwaige `preflightEvidenceErrors`, `psqlSha256`,
`psqlBinding`, `psqlDependencySetBound=true`, `psqlBundleSha256`,
`psqlBundleFileCount`, `executedSqlSha256`, `executedSqlBytes`, `logBytes`,
`nativeProcessFailed`, `processCleanupVerified`, `receiptComplete` und die
verwendete Prozessbaumgrenze.

Evidence- und Abschlusszeile werden ausschließlich aus `stdout` ausgewertet.
`stderr` bleibt vollständig redigierte Diagnose-Evidence im Log, kann aber
weder Counts noch `apply_required` noch einen PASS autorisieren.

Diese Ausgabe erfolgt ausschließlich durch die Runner-Orchestrierung. Die sieben
SQL-Artefakte und ihre bestehende SHA-256-Manifestbindung bleiben bytegleich.

## 7. Auswertung des Preflights

`GO_PREFLIGHT_READ_ONLY` verlangt gleichzeitig:

- Exitcode `0`;
- exakt eine gültige maschinenlesbare Evidence-Zeile mit zwei nichtnegativen
  Int64-Zählern und booleschem `apply_required`;
- Abschlusszeile
  `v57.62.0 trade-import preflight PASS; apply_required= true` oder `false`;
- identischer `apply_required`-Wert in Evidence- und Abschlusszeile;
- Ziel `postgres`, Executor `postgres`, PostgreSQL mindestens 16;
- exakt sieben erwartete v57.61.0-Marker und null unbekannte Marker;
- vorhandene v57.61.0-Basistabellen und Importfunktion;
- bei bereits vorhandenem v57.62.0-Marker exakter Fingerprint, vollständiger
  Verifier-PASS und Gate weiterhin `enabled=false`, `activated_at=null`;
- im v5-Receipt protokollierte Trade- und Batch-Baselinecounts sowie die
  exakte stdin-SQL-Hashbindung.

Jeder Fehler, Timeout, Hashunterschied, falsche Targetbindung, Teilzustand,
unbekannte Migration, aktives Gate oder fehlende Evidence führt zu `NO_GO`.
Danach keine automatische Wiederholung, keinen Deploy und keinen Restore starten.

Eine Warn- oder Fehlerzeile auf `stderr` darf den Runner insbesondere unter
Windows PowerShell 5.1 nicht vor der Log- und Receipt-Erzeugung abbrechen.
`stderr` bei Exitcode `0` bleibt Evidence und kann bei ansonsten gültigem
Preflight akzeptiert werden; ein von null verschiedener Exitcode bleibt immer
`NO_GO`, wird aber mit Log, Hash und v5-Receipt nachvollziehbar abgeschlossen.
Native Start-, Job-, Kill- oder Streamfehler werden ohne Kindprozess-Fehltext
als `EQUORA_NATIVE_PROCESS_FAILURE`, Exitcode `-3` und fail-closed v5-Receipt
abgeschlossen. Nach einer Timeout-Terminierung besitzen Prozessende und
Streamschluss jeweils eine zusätzliche feste Obergrenze; die Prozessenden teilen
sich dabei ein einziges Fünf-Sekunden-Budget.

## 8. Späterer Deploy-Stoppunkt

Ein später freigegebener Deploy muss den unveränderten Treiber
`supabase/deploy-v57.62.0-trade-import.sql` in genau einer `psql`-Sitzung
ausführen. Der Treiber führt Preflight, gegebenenfalls den Schema-Patch und
Postflight aus; er enthält absichtlich keine Aktivierung. Vorher müssen
`GO_PREFLIGHT_READ_ONLY` und `GO_DEPLOY_DEFAULT_OFF` dokumentiert sein.

Nach dem Postflight muss erneut gestoppt werden. Erst ein separater
App-Aktivierungsbranch darf die Capability auf `available` umstellen. Das
Datenbank-Gate und ein späterer App-Merge bleiben danach weiterhin getrennte
Freigaben.

## 9. Evidence-Vorlage

```text
target_name = Equora Production
project_ref = rrkfdprhqilvicjbgfcn
expected_database_host = <exact-dashboard-host>
approved_head = <40-hex>
sql_manifest_sha256 = <64-hex>
ssl_mode = verify-full
ssl_root_certificate_sha256 = <64-hex>
psql_path = <absolute-path>
psql_approved_source_path = <absolute-approved-source-path>
psql_executed_snapshot_path = <absolute-executed-snapshot-path>
psql_executed_snapshot_relative_path = psql-execution-snapshot/<filename>
psql_sha256 = <64-hex>
psql_binding = sha256-readonly-execution-snapshot-v3
psql_bundle_sha256 = <64-hex>
psql_bundle_file_count = <integer>
psql_dependency_set_bound = true
psql_execution_snapshot_write_denied_at_launch = true
psql_execution_snapshot_same_identity_adversary_excluded = true
psql_version_probe_attempted = false
executed_sql_sha256 = <64-hex>
executed_sql_bytes = <integer>
operator = <name-or-role>
observer = <name-or-role>
maintenance_window_utc = <start/end>
supabase_plan = <verified>
backup_mode = <daily|pitr>
latest_restore_point_utc = <verified>
backup_retention = <verified>
logical_roles_dump_sha256 = <64-hex>
logical_schema_dump_sha256 = <64-hex>
logical_data_dump_sha256 = <64-hex>
restore_rehearsal = <pass|not-executed-with-explicit-risk-acceptance>
storage_objects_backup = <not-applicable-to-change|separately-verified>
preflight_exit_code = <integer>
preflight_apply_required = <true|false>
preflight_trades_count = <integer>
preflight_batches_count = <integer>
production_preflight = <pass|fail>
deploy_authorized = false
database_gate_activation_authorized = false
```

Die ausgefüllte Evidence darf keine Connection-URL, Passwörter, Tokens,
Service-Role-Keys oder andere Credentials enthalten.

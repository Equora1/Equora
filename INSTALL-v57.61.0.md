# Installation und kontrollierter Rollout – Equora Starter v57.61.0

## Ergebnisgrenze

Dieses Paket ist ein Deploymentkandidat. Die Anwendung kann ohne MEXC-Egress
mit `EQUORA_MEXC_RUNTIME_MODE=off` bereitgestellt werden. Weder das Aufspielen
der SQL-Strukturen noch das Vercel-Deployment importiert Trades ins Journal,
sendet Orders oder ruft MEXC auf. Supabase-Migration, MEXC-Evidenzlauf,
Scheduleraktivierung und Produktionsdeployment sind getrennte Freigabeschritte.

## Voraussetzungen

- bestehende, konsistente Equora-v57.60.1-Datenbank;
- PostgreSQL 16 oder neuer; der Preflight bricht auf älteren Versionen vor
  jeder v57.61.0-DDL hart ab;
- direkter Migrationsexecutor `postgres` mit `CREATEROLE` und `BYPASSRLS` oder
  ein echter Superuser. Ein bloßes Schema-`CREATE`-Recht reicht nicht, weil die
  Migration einen gepinnten NOLOGIN-/BYPASSRLS-Owner erzeugt und Objektowner
  auf `postgres` normalisiert;
- ein separates Staging-Projekt für Restore- und Migrationstest;
- direkter PostgreSQL-Verbindungsstring für `psql`/`pg_dump`, nicht der
  Transaction-Pooler;
- bestätigtes Backup plus dokumentierter Restore-Verantwortlicher;
- Vercel-Projekt zunächst ohne Broker-Cron;
- bestehender MEXC-Futures-Key ausschließlich mit `View Order Details`;
- Node.js 20.9 bis 25 und die im Lockfile gepinnten Abhängigkeiten;
- für die vollständige lokale SQL-Matrix Docker sowie das bereits lokal
  vorhandene Image `postgres:17-alpine`. Der Runner verwendet
  `--pull never` und führt keinen impliziten Netzwerkdownload aus.

## Lokale Freigabeprüfung

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run release:check
npm.cmd run build
```

Ein eigenständiger ESLint-Lauf gehört nicht zu diesem Freeze: `npm run lint`
verweist noch auf den interaktiven, in Next.js 15 veralteten `next lint`-Setup
und es ist keine gepinnte ESLint-Konfiguration vorhanden. Freigabeevidenz sind
Typecheck, Vitest, Release-Check, Produktionsbuild und die SQL-Matrix; der Build
darf nicht als separater ESLint-Nachweis umgedeutet werden.

Die SQL-Race- und Integrationsrunner benötigen den dokumentierten lokalen
Supabase-Postgres-Testcontainer. Das Systemtrigger-Negativorakel startet
zusätzlich einen kurzlebigen PostgreSQL-17-Container, weil nur ein echter
Superuser interne FK-/Constraint-Trigger kontrolliert deaktivieren darf; der
Container wird danach wieder entfernt. Ein grüner Build ersetzt den
Staging-Restore und die reale RLS-/RPC-Prüfung nicht.

Die vollständige lokale Datenbankmatrix wird gebündelt ausgeführt:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File tests/sql/run-v57.61.0-all-local.ps1
```

Sie erzeugt getrennte Activation- und Full-Deployment-Templates, führt alle
SQL-Integrations-, Konkurrenz- und Drift-Runner, das interne FK-Trigger-
Driftorakel sowie den gepinnten PostgREST-v14.15-Timeouttest aus und entfernt
ihre temporären Datenbanken, Container und Fixture-Autoritäten anschließend
wieder.

Zusätzlich simuliert die Matrix in einem eigenen, netzlosen
`postgres:17-alpine`-Container die Hosted-Supabase-Rollenverteilung: Der
Migrationsexecutor `postgres` ist kein Superuser, besitzt aber `CREATEROLE`
und `BYPASSRLS`; `auth` und `auth.uid()` gehören den Plattformrollen
`supabase_admin` beziehungsweise `supabase_auth_admin`. Normale `USAGE`-,
`EXECUTE`- und `REFERENCES`-Rechte genügen. Grant Options werden weder erwartet
noch erzeugt. Fresh Apply, exakter Sechs-Layer-Re-Run sowie Owner-, ACL-,
Grantable- und fehlende-Executor-Rechte werden dynamisch geprüft.

## Backup und Preflight

1. Zielprojekt und Wartungsfenster eindeutig dokumentieren; genau ein Operator.
2. In Supabase unter `Database > Backups` einen verfügbaren Restorepunkt
   verifizieren. Zusätzlich einen logischen Schema-, Rollen- und Datendump über
   die direkte Datenbankverbindung erstellen. Storage-Dateien separat sichern;
   ein Datenbankbackup enthält nur deren Metadaten.
3. Backup in ein separates Staging-Projekt wiederherstellen und den Restore
   tatsächlich starten können. Ein lediglich vorhandener Backup-Eintrag reicht
   nicht als Restore-Nachweis.
4. Den read-only Preflight zunächst eigenständig ausführen und die drei
   Baselinecounts sichern:

```powershell
psql $env:EQUORA_SUPABASE_DIRECT_URL -X -v ON_ERROR_STOP=1 -f supabase/preflight-v57.61.0.sql
```

Der Verbindungsstring gehört nur in eine kurzlebige Prozessumgebung oder einen
Secret Manager, nie in Repository, Bildschirmfoto oder Shell-Historie.

Bei einer Datenbank ohne v57.61.0-Marker akzeptiert der Preflight nicht nur
einige Tabellennamen, sondern ausschließlich den exakt gepinnten semantischen
v57.60.1-Vertrag aus Spalten, Constraints, Indizes, RLS/FORCE-RLS, Policies,
Ownern, ACLs, funktionalen Triggern, internen FK-/Constraint-Triggerzuständen
und öffentlichen Equora-Funktionen. Ein
Wiederanlauf ist nur bei bereits vollständigen sechs, fingerprintgenauen
v57.61.0-Markern zulässig; der Preflight revalidiert dann vor dem Treiber den
gesamten aktuellen Vertrag. Ein Teilstand mit ein bis fünf Markern ist bewusst
nicht resumierbar und verlangt Restore der geprüften v57.60.1-Baseline. Jeder
unerlaubte Credential-Tabellengrant, eine inkompatible Baseline oder eine
PostgreSQL-Version unter 16 beendet den Preflight vor der ersten v57.61.0-DDL.
Dasselbe gilt für unzulässige Default-ACLs des Migrationsexecutors:
`PUBLIC` ist ausschließlich für nicht-grantable `EXECUTE`-Defaults auf
Funktionen zulässig; insbesondere `PUBLIC SELECT ON TABLES` wird vor der ersten
DDL blockiert. Für `anon`, `authenticated` und `service_role` werden nur die
erwarteten nicht-grantable Supabase-Defaults in einer geschlossenen Matrix aus
Objektart und Privileg toleriert. Schema-`CREATE` ist für diese API-Rollen auch
dann verboten, wenn die Rolle selbst bekannt ist; fremde, grantable oder
objektartfremde Default-ACLs sind unzulässig. Dieser Check umfasst globale
Defaults sowie `public`, `equora_private` und den prospektiven
`extensions`-Namespace, auch wenn `pgcrypto` dort noch nicht installiert ist.

`pgcrypto` darf ausschließlich in `public` oder `extensions` installiert sein.
Der Preflight und der globale Postflight validieren den tatsächlichen Namespace,
seinen Plattformowner und seine nicht-grantable ACL. `PUBLIC`, `anon`,
`authenticated` und `service_role` dürfen dort kein effektives `CREATE`
besitzen. Bei `pgcrypto` in `extensions` ist auch `PUBLIC USAGE` unzulässig und
die Capture-Ownerrolle muss ohne effektives Schema-`USAGE` bleiben; bei
`public` ist dessen bereits vorhandenes `USAGE` zulässig. Die Migration schreibt
Supabase-verwaltete Namespace-ACLs nicht pauschal um, sondern stoppt bei einem
abweichenden Zustand fail-closed.

Die Migration ändert keine ACL des plattformverwalteten `auth`-Schemas und
keine ACL von `auth.uid()`. Der Preflight bindet beide kanonischen ACL-Zustände
an die aktuelle `psql`-Sitzung; der Postflight verlangt Byte-/Digestgleichheit.
Equoras NOLOGIN-Authority erhält keinen direkten Zugriff auf `auth`. Stattdessen
ruft ausschließlich der exakt gepinnte, `postgres`-eigene
`SECURITY DEFINER`-Adapter
`equora_private.equora_request_context_uid_v1()` die offizielle
Supabase-Funktion `auth.uid()` auf. Der Adapter ist `STABLE`, besitzt
`search_path=""` und darf explizit nur von
`equora_broker_capture_owner` ausgeführt werden.

## SQL-Reihenfolge

Für jedes noch nicht migrierte Ziel gilt: nur nach einem grünen Restore- oder
Baseline-Nachweis und gesonderter Freigabe. Preflight, Treiber und Postflight
müssen in derselben `psql`-Sitzung laufen, damit der Postflight die vor der
Migration ermittelte Tradeanzahl technisch vergleichen kann. Für `Equora
Staging` wurde genau dieser Ablauf am 2026-08-10 bereits separat freigegeben
und vollständig erfolgreich ausgeführt; daraus folgt keine Freigabe für ein
anderes Ziel:

```powershell
psql $env:EQUORA_SUPABASE_DIRECT_URL -X -v ON_ERROR_STOP=1 `
  -f supabase/preflight-v57.61.0.sql `
  -f supabase/deploy-v57.61.0.sql `
  -f supabase/postflight-v57.61.0.sql
```

Der psql-Treiber wendet exakt diese additive Reihenfolge an:

1. Capture Persistence
2. Capture Control
3. Lane Authority
4. Activation Authority
5. Scheduler Control
6. Runtime Deployment Authority

Keinen Einzelschritt überspringen, nicht über den Supabase SQL Editor neu
sortieren und nach einem Fehler nicht blind erneut fortfahren. Erst Ursache und
Transaktionsstatus prüfen. Danach darf derselbe Treiber kontrolliert erneut
gestartet werden, wenn bereits alle sechs Marker mit exakt gepinntem
Fingerprint vorhanden sind; dann überspringt er alle sechs Schichten und der
globale Postflight revalidiert den aktuellen Objektvertrag. Bei ein bis fünf
Markern bricht bereits der Preflight mit Restore-Anforderung ab. Es wird nicht
ab der ersten fehlenden Migration fortgesetzt. Alle Dateien verwenden
`ON_ERROR_STOP` bzw. eigene Transaktionsgrenzen.

## Vercel-Umgebung

Die Werte aus `.env.example` werden serverseitig hinterlegt. Insbesondere:

- `EQUORA_BROKER_SECRET_KEYS`: JSON-Keyring mit 32-Byte-AES-Keys;
- `EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION`: vorhandene aktive Version;
- `EQUORA_BROKER_IDENTITY_KEY`: separater 32- bis 64-Byte-HMAC-Key;
- `EQUORA_BROKER_IDENTITY_KEY_VERSION`: initial `idv1`;
- `CRON_SECRET`: zufälliger Wert mit mindestens 16 Zeichen;
- `EQUORA_MEXC_RUNTIME_MODE`: beim ersten Deployment zwingend `off`.

Die Secretwerte werden als „Sensitive“ gespeichert und niemals als
`NEXT_PUBLIC_*` angelegt. Eine Variablenänderung wirkt erst in einem neuen
Deployment.

## Rolloutstufen

1. Preview und anschließend Produktion mit `vercel.json` und Runtime `off`.
   Diese Datei enthält absichtlich keinen Cron.
2. Login, bestehende Journalfunktionen, RLS, Medien und CSV-Import regressieren.
3. Nach separater Freigabe genau den vorgesehenen Nutzer in
   `equora_private.broker_capture_runtime_enrollment` mit `max_accounts = 1`,
   `max_symbols between 1 and 5` und `enabled = true` eintragen. Die Migration
   erzeugt absichtlich keine Enrollment-Zeile; ohne diesen Operatorenschritt
   scheitert Setup vor jedem Broker-GET. Danach Runtime auf `probe` setzen und
   neu deployen. Der
   Nutzer startet im Brokerformular genau einmal den echten GET-only-
   Capabilitytest für 1 bis 5 Symbole. Erst ein vollständig grüner Probe legt
   die Verbindung atomar an.
   Der Apply bindet das Enrollment im selben Commit an genau den neu erzeugten
   Broker-Account. Claim-, Continuation-, Finalization- und Material-Loader
   akzeptieren danach ausschließlich diese aktive Nutzer-/Provider-/Account-
   Bindung; ein zweiter Account für dasselbe Enrollment scheitert fail-closed.
4. Probe-Ergebnis, Secret-Canary, MEXC-Fehlerklassen und Supabase-Audit prüfen.
5. Erst nach eigener Capture-Freigabe `vercel.capture.pro.example.json` bewusst
   als aktive `vercel.json` übernehmen, Runtime auf `capture` setzen und neu
   deployen. Der Pro-Beispielcron läuft alle fünf Minuten (UTC). Ein Lauf
   verarbeitet bewusst höchstens eine Work Unit mit maximal drei Seiten; der
   Takt stellt deshalb Verarbeitungskapazität bereit und ändert nicht das
   6-Stunden-Fachintervall der Fast Lane.

Vercel Hobby erlaubt derzeit nur einen Cronlauf pro Tag und erfüllt damit die
implementierte 6-Stunden-Fast-Lane nicht. Für den Fünf-Minuten-Beispielplan ist
Vercel Pro oder ein gleichwertiger externer Scheduler erforderlich. Der Plan
ist zunächst für einen kontrollierten Account mit höchstens fünf Symbolen
dimensioniert. Vor mehreren Accounts muss der Durchsatz anhand überfälliger
Lanes gemessen und bei Bedarf durch einen gebundenen Queue-/Worker-Dispatcher
erweitert werden. Vercel führt fehlende Cron-Retries nicht automatisch nach;
die Datenbankpfade sind deshalb lease- und idempotenzgebunden.

Die Route ist auf 300 Sekunden begrenzt. Nach 240 Sekunden beginnt die Runtime
keine neue Page-Verarbeitung; neuen Broker-Egress beendet sie spätestens nach
210 Sekunden. Bereits autorisierte Persistenz, Finalisierung, Failure-Receipt
und Lease-Freigabe dürfen danach noch innerhalb des 300-Sekunden-
Plattformlimits kontrolliert abschließen. Die 240 Sekunden sind deshalb eine
Planungs-/Page-Startgrenze und keine behauptete harte End-to-End-Abbruchzeit.

## Abnahme

- `off`: Cron-Endpunkt liefert trotz gültigem Secret `runtime_disabled`;
- ohne oder mit zu kurzem `CRON_SECRET`: `401 unauthorized`;
- ohne vollständige Server-/Keyring-Umgebung: `runtime_not_configured`;
- Probe und Capture verwenden ausschließlich `GET` gegen
  `https://api.mexc.com` und ausschließlich die vier fest verdrahteten
  Futures-Historien;
- Trading, Orderänderung, Positionsschluss, Transfer und Auszahlung besitzen
  keinen Transportpfad;
- Widerruf setzt Activation, Connection, Connection-Account, Broker-Account
  und Integrity-Key auf `revoked` und ersetzt das verschlüsselte Brokersecret
  durch einen Tombstone; historische Capture-Daten bleiben unverändert;
- Migration und Capture erzeugen null Journal-Trades;
- automatische Journalnormalisierung und -freigabe bleiben ausgeschaltet.

## Rollback

1. `EQUORA_MEXC_RUNTIME_MODE=off` setzen, Cron in Vercel deaktivieren und ein
   neues Deployment erstellen. Das ist der erste und schnellste Egress-Stopp.
2. Laufende Function-Aufrufe auslaufen lassen; keine Secret- oder DB-Rotation
   während eines aktiven Requests.
3. Bei reinem Appfehler auf das vorherige Vercel-Deployment zurückrollen. Die
   additiven Tabellen dürfen liegenbleiben, solange die Runtime aus ist.
4. Bei Schema-/Datenfehler Schreibzugriffe stoppen und das vollständig geprüfte
   Pre-Migration-Backup in ein neues Projekt wiederherstellen. Kein ad-hoc
   `DROP` gegen Produktion.
5. Storage separat gegen das Inventar abgleichen; Datenbankrestore stellt
   gelöschte Storage-Objekte nicht wieder her.

## Unterstützter restaurierter v57.60.1-Ausgangsstand

Der markerfreie Preflight akzeptiert genau zwei vollständig semantisch
gefingerprintete v57.60.1-Profile:

- kanonische Neuinstallation:
  `ac2bfb251aeb645dd3450e3b02d3f6d2ae5cb0aeeaa751e5a5a54f87a410c656`;
- verifizierter Restore-/Upgradepfad:
  `0fb6a0d531bb7cc66996c8b2d4f272f61dacefdb0e8969c536d1d49c89517218`.

Ein aus einem historischen Dump wiederhergestellter Zustand mit exakt dem
Vertragshash
`47cbc3bd6d4be8ccccf8543a1f1be554610fe20b5746478e6ca94664525daffb`
ist **keine** direkt akzeptierte Baseline. Er enthält ausschließlich die
belegte Kombination aus korrektem UTF-8-Funktionskörper und unerlaubten
`anon`-/`authenticated`-Tabellenrechten auf `broker_credentials`. Nur für
diesen exakten Zustand existiert der separate, transaktionale Reparaturschritt:

```powershell
psql $env:EQUORA_SUPABASE_DIRECT_URL -X -v ON_ERROR_STOP=1 `
  -f supabase/repair-v57.60.1-restored-credential-acl.sql
```

Die Reparatur sperrt die Credentialtabelle kurz, widerruft ausschließlich diese
beiden ACLs, verifiziert unveränderte Trade-/Credentialcounts und verlangt
anschließend den vollständigen sauberen Restorehash. Jeder andere Drift bleibt
fail-closed. Reparatur und v57.61.0-Apply sind getrennte externe Freigaben;
nach der Reparatur wird der eigenständige Preflight erneut ausgeführt.

Der Hash `47cbc3bd...` darf ausschließlich aus einem eigenständigen, read-only
Preflight stammen. Der Operator darf ihn weder schätzen noch aus einzelnen
ACL-Abfragen zusammensetzen. Vor der Reparatur müssen Zielprojekt,
Session-Pooler-Modus, Datenbankname und Tradecount nochmals protokolliert
werden. Nach einem Fehler endet der Ablauf; weder der Deploymenttreiber noch
manuelle Einzel-DDL dürfen folgen.

Der allgemeine Baselineverifier kennt ausschließlich die beiden sauberen
Hashes. Der Dirty-Hash steht nur in einer separaten, rein read-only Assertion,
die vom Reparaturskript unmittelbar nach dem Tabellenlock eingebunden wird.
Es gibt keinen GUC-, Session- oder Umgebungswert, der den allgemeinen
Verifier auf einen Reparaturmodus umschalten kann.

PowerShell-Runner, die SQL über eine Pipeline an `psql` übergeben, setzen
explizit UTF-8 ohne BOM. Das ist Teil des Baselinevertrags: Nicht-ASCII-Zeichen
in Funktionskörpern dürfen beim lokalen Beweis nicht durch die Windows-
Ausgabecodepage verändert und anschließend als vermeintlicher Schemadrift
gehasht werden.

Der zweite Pfad ist kein allgemeiner Driftmodus. Layer 1 normalisiert nur die
belegte Restoreform: sieben fehlende Submission-Spalten, vier Indizes, die
kanonischen Policies, den exakten Trade-Import-FK, `trades.user_id NOT NULL`
und den fehlenden Setup-Title-Default. Die Altspalten `setups.name`,
`setups.grade` und `setups.screenshot_url` werden nur entfernt, wenn sie
vollständig `NULL` sind. Ownerlose Trades oder ein einziger nichtleerer
Altwert brechen die Transaktion vor dem Marker fail-closed ab. Unbekannter
Schemadrift scheitert bereits im Preflight.

Die lokale Beweiskette liegt in
`tests/sql/run-v57.61.0-restored-v57601-upgrade.ps1`. Sie prüft Apply,
gemeinsamen Endvertrag, sechs exakte Re-Run-Skips, unveränderte Marker-Receipts
und die vollständige No-partial-effect-Negativmatrix: vorab gesetzter alter GUC
beim Standalone-Verifier und vollständigen Preflight, normaler Dirty-Preflight,
nichtleere Altspalte, ownerloser Trade, unbekannter Schemadrift sowie nicht
exakter Teilgrant im Reparaturpfad. Der Runner wird verpflichtend
einmal mit `pgcrypto` in `extensions` und einmal nach realer Extension-
Relokation nach `public` ausgeführt; beide Spuren prüfen Wrappervertrag,
Capture-Owner-Ausführung über die engen Wrapper und bekannte
SHA-256-/HMAC-SHA-256-Vektoren. Die `extensions`-Spur beweist zusätzlich, dass
derselbe Owner die rohe Extensionfunktion mangels Namespace-`USAGE` nicht
direkt erreicht. Dieser lokale Nachweis autorisierte für sich allein keinen
Staginglauf. Die spätere Credential-ACL-Reparatur und der anschließende
v57.61.0-Apply auf `Equora Staging` wurden jeweils getrennt ausdrücklich
freigegeben und sind im G1-Status mit ihren tatsächlichen Ergebnissen
protokolliert.

## Aktueller Staging- und Rolloutstand

Maßgeblich für den aktuellen verbundenen Stagingzustand ist der nachträglich
ausgeführte und unabhängig attestierte Ablauf:

- ausschließlich auf das vor der Ausführung eindeutig identifizierte separate
  Projekt `Equora Staging`; der konkrete Project Ref bleibt nur im externen
  G1-Auditstatus dokumentiert und ist kein Paketinhalt;
- exakte Credential-ACL-Reparatur vom Dirty-Hash
  `47cbc3bd6d4be8ccccf8543a1f1be554610fe20b5746478e6ca94664525daffb`
  auf den sauberen Restorehash
  `0fb6a0d531bb7cc66996c8b2d4f272f61dacefdb0e8969c536d1d49c89517218`;
- unerlaubte Credential-ACL-Zeilen von 16 auf 0 reduziert;
- normaler read-only Preflight danach PASS;
- sechs von sechs Migrationslayern in einer kontrollierten `psql`-Sitzung
  angewendet;
- globaler Postflight PASS und sechs von sechs exakte Marker/Fingerprints;
- Journal-Trades 1280 vor und 1280 nach dem Apply;
- Broker Connections, Broker Credentials, Sync Runs und Raw Events jeweils 0
  vor und nach dem Apply;
- Auth-Nutzer 7, Trade-Medien 3, Setup-Medien 1 und Storage-Objekte 6 jeweils
  unverändert;
- kein Retry und kein Restore nach dem Apply.

Der Apply installierte ausschließlich die additive Datenbank- und
Authority-Struktur. `EQUORA_MEXC_RUNTIME_MODE` bleibt für den nächsten
Rolloutschritt zwingend `off`; es existiert kein aktiver Capture-Cron und es
wurde kein MEXC-Request oder Journalimport ausgelöst. Vercel Preview,
RLS-/RPC-/Secret-App-Canaries, echter MEXC-Read-only-Probe, Capture-Cron,
Supabase-Produktion, Produktions-SQL, Git-Push, Merge und Deployment benötigen
weiterhin jeweils ihre eigene ausdrückliche Freigabe.

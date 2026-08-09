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
erwarteten nicht-grantable Supabase-Defaults toleriert; fremde oder grantable
Default-ACLs sind unzulässig.

## SQL-Reihenfolge

Nur nach einem grünen Staging-Restore und gesonderter Freigabe. Preflight,
Treiber und Postflight müssen in derselben `psql`-Sitzung laufen, damit der
Postflight die vor der Migration ermittelte Tradeanzahl technisch vergleichen
kann:

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

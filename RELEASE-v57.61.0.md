# Release v57.61.0 – MEXC Read-only Deploymentkandidat

## Ergebnis

v57.61.0 ergänzt die providererweiterbare, authority-gebundene Erfassung von
MEXC-Futures-Historien. Das Release kann default-off deployed werden. Ein
Deployment allein aktiviert weder Brokerrequests noch automatischen
Journalimport. Tradingrechte und schreibende Brokerendpunkte sind nicht
implementiert.

## Enthalten

- additive Capture-, Lane-, Activation-, Scheduler-, Lease- und Runtime-SQL-
  Verträge mit RLS, Composite-FKs, CAS, Idempotenzreceipts und fail-closed ACLs;
- MEXC-GET-Allowlist für Orders, Executions, historische Positionen und Funding;
- 7-/28-Tage Request-Scopes mit 1:N UTC-Tagesbuckets;
- kurzlebige single-use Egress-Permits vor Brokerzeit-GET und Credentialload;
- versionierter AES-256-GCM-Credential-Keyring und separater HMAC-Identity-Key;
- expliziter Read-only-Evidenzprobe vor atomarem Connection-Setup;
- begrenzter serverloser Capturezyklus mit Account-Lease, Renew, Release,
  Crash-Recovery für lease-freie `yielded`/`recovery_pending`-Arbeit,
  Page-Receipt und Scope-Finalisierungs-Recovery;
- Request-Scope-Budget von exakt 20 Work Units und 100 Pages mit
  replaybarem `scope_exhausted` ohne 21. Successor;
- explizites Runtime-Enrollment für genau einen atomar gebundenen Broker-
  Account und ein bis fünf Symbole; alle Finder, Material- und Finalisierungspfade
  revalidieren diese Accountbindung;
- atomarer, audit-erhaltender Connection-Widerruf mit Credential-Tombstone;
- Vercel-Endpoint mit Bearer-Secret, `no-store`, Default-off-Runtime und
  300-Sekunden-Funktionsgrenze; der Capturezyklus beendet Broker-Egress bereits
  nach spätestens 210 Sekunden und reserviert Zeit für Persistenz/Lease-Cleanup;
- psql-Preflight, geordneter Sieben-Migrations-Treiber, Postflight, Betriebs-SOP
  und inaktives Vercel-Cronbeispiel. Der Preflight akzeptiert ausschließlich
  eine markerfreie exakte v57.60.1-Baseline, den exakten Sechs-Marker-
  Vorgänger oder alle sieben exakten v57.61.0-Marker; ein Teilstand mit ein bis
  fünf Markern verlangt Restore.
  Preflight-, Fingerprint- oder ACL-Drift endet mit Nichtnull-Prozessstatus,
  und der globale Postflight revalidiert auch bei vollständigem Marker-Skip
  alle sieben Layer. Der Sechs-Marker-Vorgänger darf ausschließlich durch den
  forward-only Broker-Provider-RLS-Layer konvergieren. Vor jeder DDL werden
  PostgreSQL 16+, der exakte
  `postgres`-/Superuser-Executorvertrag sowie fremde oder grantable Default-
  ACLs fail-closed geprüft. `PUBLIC` bleibt nur als nicht-grantable
  Funktions-`EXECUTE`-Default zulässig; Tabellenrechte für `PUBLIC` werden vor
  der ersten DDL blockiert.
- Hosted-Supabase-kompatibler Request-Identity-Vertrag ohne Plattform-Grant-
  Options: Ein privater, `postgres`-eigener und vollständig gefingerprintter
  `SECURITY DEFINER`-Adapter kapselt ausschließlich `auth.uid()`. Die
  Equora-NOLOGIN-Authority erhält weder `auth`-Schema-USAGE noch einen direkten
  `auth.uid()`-Grant; Preflight und Postflight beweisen unveränderte
  Plattform-ACLs.

## Nicht enthalten

- keine Ordereröffnung, -änderung, -stornierung oder Positionsschließung;
- kein Transfer, keine Auszahlung und keine MEXC-Schreibmethode;
- keine automatische Umwandlung von Capture-Rohdaten in Journal-Trades;
- keine automatische Produktionsmigration, kein Secret-Upload und kein Cron
  bei Auslieferung;
- kein Löschen historischer Capture-/Journalbelege beim Verbindungswiderruf;
- kein automatischer Keyring-Re-Encryption-Job;
- kein garantierter MEXC-Historienzeitraum über die beobachtete API-Antwort
  hinaus; ältere Daten benötigen Account Data Export und Reconciliation.

## Freigabegates

1. vollständiger lokaler Typecheck, Unit-/Vertrags-/SQL-/Race-Test und Build
   (PASS für den aktuellen lokalen Delta);
2. neuer SHA-256-Freeze des exakten Deltas und externes Paket-Sidecar; nach
   jeder Änderung zwingend neu zu bilden;
3. findingfreier unabhängiger QA-, Security- und Integritätsreview genau dieses
   Freeze; der aktuelle Atteststatus steht ausschließlich im G1-Statusdokument;
4. Backup- und Restore-Nachweis in separatem Supabase-Stagingprojekt
   (PASS für den verifizierten v57.60.1-Restore);
5. historische kontrollierte Stagingmigration der Sechs-Layer-Fassung (PASS:
   6/6 Marker und damaliger globaler Postflight); dieses Ergebnis ist nur
   Vorgängerevidenz. Das verbundene Layer-7-Gate des aktuellen Kandidaten ist
   erneut offen und benötigt eine eigene Freigabe sowie 7/7-Postflight;
   die davon getrennten Vercel-/App-RLS-/RPC-/Secret-Canaries stehen noch aus;
6. ausdrücklich freigegebener echter MEXC-Read-only-Probe;
7. separates Go für Capture-Cron und erst später ein eigenes Importgate.

## Lokale Kandidatenevidenz

- TypeScript-Typecheck PASS;
- vollständige Vitest-Suite: 23/23 Dateien und 380/380 Tests PASS;
- optimierter Next.js-15.5.21-Produktionsbuild PASS;
- kein separater ESLint-Nachweis: das bestehende `next lint`-Script startet
  mangels gepinnter ESLint-Konfiguration nur den interaktiven, veralteten
  Next.js-Setupdialog und ist ausdrücklich kein Bestandteil dieses Gates;
- vollständige lokale SQL-Matrix PASS: Fresh Apply aller sieben Layer,
  exakter Sechs-zu-Sieben-Roll-forward für `RLS=false` und Hosted-`RLS=true`,
  Sieben-Layer-Re-run mit sieben Skips, unbekannter Sieben-Marker-No-effect-
  Fall, Activation/Lane/Claim/Page/Failure/Outcome, Race- und Lockorakel,
  Scheduler, Runtime, Baseline-/Marker-/ACL-/GUC-/Constraint-/Indexdrift,
  internes FK-Triggerdriftorakel sowie echter PostgREST-v14.15-Timeout nach
  15,03 Sekunden;
- isolierte Hosted-PG17-Matrix PASS: non-super `postgres`, getrennte
  `supabase_admin`-/`supabase_auth_admin`-Owner, normale nicht-grantable
  Plattformrechte, privater UID-Adapter, exakter Re-Run und sieben
  fail-closed Plattformdrift-Mutanten;
- produktive Runtime-Cycle-Zweige für Lease-Renew, Multi-Page-Continue,
  `yielded`-Continuation, kooperative Drei-Seiten-Freigabe und unerwartete
  Fehler inklusive Lease-Cleanup sind dynamisch belegt; das echte
  Zwei-Sitzungs-Orakel Enrollment-Disable gegen Continuation endet
  fail-closed und ohne Nachfolger-/Receipt-Teilwirkung;
- das dynamische Scope-Grenzorakel belegt Sequenz 19→20, Sequenz 20→keinen
  Nachfolger sowie exaktes `scope_exhausted`-Replay; unmittelbarer und nach
  Restart wiederaufgenommener Runtimepfad melden denselben Fehlerstatus;
- fachlich fehlgeschlagene Cron-Cycles liefern HTTP 200 mit `ok=false`,
  `capture_domain_failed` und sanitisiertem `failureCode`; Transportausnahmen
  bleiben HTTP 500;
- Preflight-Negativorakel blockieren unzulässige Executorrollen, fremde
  Default-ACLs, `PUBLIC SELECT ON TABLES` und Schema-`CREATE` für bekannte
  API-Rollen vor der ersten v57.61.0-DDL;
  Identity-/Credential-Keypuffer
  werden auch auf frühen Fehlerpfaden nicht unnötig decodiert und sicher
  geleert;
- Release-Check PASS; das Paket wird allowlistbasiert erzeugt, extrahiert,
  inhaltsverglichen und erneut geprüft. Der obsolete Force-Push-Handoff ist
  ausdrücklich ausgeschlossen.

Der frühere Schlussfreeze mit ZIP-SHA-256
`379f81d82230e800ad089c3143544216447d2503811b914cbbee6e02929dbe13`
ist durch den Hosted-Supabase-Kompatibilitätspatch technisch überholt und kein
aktuelles Freigabeartefakt. Das neu erzeugte lokale Paket enthält zusätzlich
die Hosted-PG17-Fixture und ihren Runner. Sein autoritativer Hash steht nur im
externen `.sha256.txt`-Sidecar und im Deploymentmanifest, damit der ZIP-Inhalt
keinen selbstreferenziellen Hash behauptet. Das Paket bleibt bis zum neuen
Deploymentmanifest und findingfreien A3-/A4-/A5-Review NO-GO für jede
Veröffentlichung oder verbundene Aktion.

Diese lokale Evidenz ist erst nach einem neuen hashgebundenen A3-/A4-/A5-
Review des vollständigen Deployment-Manifests reviewgültig. Sie autorisiert
keine externe Aktion.

Ohne diese Nachweise lautet der Status: lokal vorbereitet, Deployment/Runtime
noch NO-GO. Ein grüner technischer Freeze ersetzt die externen Gates nicht.

## Restore-Kompatibilitätsdelta nach Hosted-Preflight

Der vorangehende Hosted-Kompatibilitätsfreeze ist durch einen weiteren
lokalen, noch neu einzufrierenden Kandidaten ersetzt. Der verifizierte
Staging-Restore offenbarte einen zweiten exakten v57.60.1-Ausgangsvertrag. Der
Patch akzeptiert deshalb nicht beliebigen Baseline-Drift, sondern ausschließlich
die beiden gepinnten Profile und führt die bekannte Restoreform
datenerhaltend auf denselben v57.61.0-Endvertrag.

Zusätzliche Evidenz:

- restaurierter Apply und exakter Re-Run PASS;
- Altspaltendaten, ownerloser Trade und unbekannter Baseline-Drift jeweils
  fail-closed ohne v57.61.0-Teileffekt;
- pgcrypto-Schemaunterschied `public`/`extensions` durch zwei exakt gepinnte,
  `postgres`-eigene `SECURITY DEFINER`-Adapter gekapselt; in beiden Spuren kein
  Schema-`CREATE` und kein expliziter direkter Digest-/HMAC-Grant für die
  Capture-Ownerrolle, bei `extensions` zusätzlich kein Schema-`USAGE`;
- Namespaceowner/-ACL sowie die objektart- und privileggenaue Default-ACL-
  Matrix einschließlich des prospektiven `extensions`-Namespaces sind in
  Preflight und globalem Postflight fail-closed gebunden; `PUBLIC USAGE` auf
  `extensions` scheitert vor DDL und auch bei Drift zwischen Preflight und
  Postflight;
- komplette lokale SQL-/Concurrency-/Drift-/Hosted-/PostgREST-Matrix PASS in
  315,1 Sekunden auf dem final propagierten Fingerprintstand;
- Vitest `22/22` Dateien, `367/367` Tests, Typecheck, Release-Check und
  Next.js-15.5.21-Produktionsbuild PASS.

Dieser Abschnitt beschreibt den damaligen Restore-Zwischenstand. Danach wurden
die exakte Credential-ACL-Reparatur und der v57.61.0-Staging-Apply jeweils
separat ausdrücklich freigegeben und erfolgreich ausgeführt. Daraus entsteht
keine Freigabe für MEXC, Vercel, Produktion, Push, Merge oder Deployment.

Das allowlistbasierte Paket enthält 364 kanonische Dateien. Sein
`.sha256.txt`-Sidecar und die 364-zeilige Dateiliste liegen außerhalb des ZIP;
nur diese externen Artefakte und das Deploymentmanifest dürfen den finalen
ZIP-Hash festhalten. Der Hash ist erst nach findingfreiem A3-/A4-/A5-Review
reviewgültig.

## Exakte Credential-ACL-Reparatur nach Staging-Preflight

Der erste freigegebene, eigenständige und read-only ausgeführte Preflight des
restaurierten Stagingprojekts hat korrekt vor jeder v57.61.0-DDL gestoppt. Die
Markertabelle blieb abwesend. Ursache waren ausschließlich 16 explizite
Restore-ACLs auf `public.broker_credentials`: je acht für `anon` und
`authenticated`. Gleichzeitig zeigte der Vergleich mit der lokalen Fixture
einen Windows-Pipelinefehler: Ohne explizites UTF-8 wurde ein Nicht-ASCII-
Zeichen in einem kanonischen v57.60.1-Funktionskörper lokal verfälscht.

Die Remediation erweitert den Baselinevertrag nicht um beliebigen Drift:

- sämtliche SQL-PowerShell-Runner setzen UTF-8 ohne BOM;
- die beiden sauberen kanonischen Baselinehashes lauten nun
  `ac2bfb251aeb645dd3450e3b02d3f6d2ae5cb0aeeaa751e5a5a54f87a410c656`
  (Fresh) und
  `0fb6a0d531bb7cc66996c8b2d4f272f61dacefdb0e8969c536d1d49c89517218`
  (Restore);
- der separate Reparaturpfad akzeptiert ausschließlich den exakt belegten
  Drift-Hash
  `47cbc3bd6d4be8ccccf8543a1f1be554610fe20b5746478e6ca94664525daffb`,
  widerruft nur die zwei Credential-Tabellen-ACLs und verlangt unveränderte
  fachliche Counts sowie anschließend den vollständigen sauberen Restorehash;
- ein Teilrecht, ein zusätzlicher Drift oder eine abweichende Nachbedingung
  scheitert fail-closed ohne Marker und ohne v57.61.0-Apply.
- der allgemeine Baselineverifier enthält den Dirty-Hash nicht; nur die
  separate read-only Reparaturquellen-Assertion kennt ihn. Ein frei setzbarer
  GUC-, Session- oder Umgebungswert kann den normalen Gatevertrag nicht
  aufweiten.

Lokale Evidenz des technisch geprüften Kandidaten:

- vollständige SQL-/Concurrency-/Drift-/Hosted-/PostgREST-Matrix PASS in
  295,7 Sekunden;
- beide pgcrypto-Namespacepfade, exakte ACL-Reparatur, Fresh Apply, exakte
  Re-Runs und No-partial-effect-Negativorakel PASS;
- Vitest `22/22` Dateien und `367/367` Tests PASS;
- TypeScript-Typecheck PASS;
- Release-Check und optimierter Next.js-15.5.21-Produktionsbuild PASS.

Das allowlistbasierte Paket wurde nach dieser Dokumentationsänderung neu
erzeugt, intern extrahiert und bytegenau geprüft. Es enthält 366 kanonische
Dateien. Sein autoritativer SHA-256 steht ausschließlich im externen Sidecar
und im externen Deploymentmanifest, nicht selbstreferenziell im ZIP-Inhalt.
Nur das G1-Statusdokument darf den aktuellen Hash- und Reviewstatus behaupten.
Nach dem findingfreien lokalen Review wurden zuerst ausschließlich die exakte
Baseline-Reparatur und danach in einer weiteren ausdrücklichen Freigabe der
normale Staging-Apply ausgeführt. Beide Schritte sind abgeschlossen und
datenerhaltend attestiert; sie autorisieren keine weitere verbundene Aktion.

## Ausgeführte Stagingmigration und verbleibende Releasegrenze

Der aktuelle Stagingnachweis ersetzt die früheren zeitgebundenen Aussagen in
diesem Dokument, nach denen `Equora Staging` noch markerfrei oder der Apply
ausstehend war. Tatsächlich bestätigt sind:

- Ziel ausschließlich das vor der Ausführung eindeutig identifizierte separate
  Projekt `Equora Staging`; der konkrete Project Ref bleibt im externen
  G1-Auditstatus und ist kein Bestandteil des generischen Releasepakets;
- Credential-ACL-Reparatur vom exakt gebundenen Dirty-Hash `47cbc3bd...` auf
  den sauberen Restorehash `0fb6a0d5...` PASS;
- 16 unerlaubte Credential-ACL-Zeilen auf 0 reduziert;
- normaler read-only Preflight danach PASS;
- alle sechs Migrationslayer erstmals und ohne Skip angewendet;
- alle sechs Marker mit ihren exakten Contract-Fingerprints vorhanden;
- globaler Postflight PASS;
- Journal-Trades 1280 vor und nach dem Apply;
- Broker Connections, Broker Credentials, Sync Runs und Raw Events jeweils 0;
- Auth-Nutzer 7, Trade-Medien 3, Setup-Medien 1 und Storage-Objekte 6
  unverändert;
- RLS aktiv, keine ownerlosen Trades und keine direkten
  Credential-`SELECT`-ACL-Zeilen für `anon`, `authenticated` oder
  `service_role`;
- kein Retry, kein Restore, kein Brokerrequest und kein Journalimport.

Der technische Code- und SQL-Kandidat bleibt gegenüber dieser reinen
Betriebsdokumentationskorrektur unverändert. Weil `INSTALL-v57.61.0.md`,
`OPERATIONS-SOP-v57.61.0.md` und dieses Release-Dokument Bestandteil des
Release-ZIP sind, muss das Paket dennoch neu erzeugt, bytegenau geprüft, neu
gehasht und als neuer Deployment-Kandidat unabhängig attestiert werden.

Nach diesem lokalen Paketabschluss bleiben ausdrücklich offen und gesperrt:

1. Feature-Branch-Commit und Git-Push;
2. Vercel-Preview gegen `Equora Staging` mit Runtime `off`, ohne Cron und ohne
   MEXC-Egress;
3. App-seitige RLS-/RPC-/Secret-Canaries;
4. ein separat freizugebender echter MEXC-Read-only-Probe;
5. ein separat freizugebender manueller Capture-Canary;
6. Merge nach `main`, Produktionsbackup/-preflight, Produktions-SQL,
   Produktionsdeployment und Capture-Cron;
7. der spätere automatische Journalimport als eigenes G2-G6-Produktgate.

## Lokale Dependency-Security-Remediation vor der Main-Vorbereitung

Ein unmittelbar vor der Main-/Produktionsvorbereitung erneut ausgeführter
`npm audit` hat die transitive Produktionsabhängigkeit `nanoid@3.3.16` als
`high` gemäß `GHSA-2v37-7h3g-55p8` / `CVE-2026-67213` abgelehnt. Die
Abhängigkeitskette war `next@15.5.21 -> postcss@8.5.23 -> nanoid@3.3.16`.
Deshalb wurde weder nach `main` gemergt noch ein Produktionsdeployment
ausgelöst.

Die lokale Remediation ist bewusst auf zwei technische Dateien begrenzt:

- `package-lock.json` bindet innerhalb der bereits erlaubten
  `nanoid`-Patchreihe nun `3.3.18`; `package.json` blieb unverändert;
- `tests/sql-contracts.test.ts` normalisiert die drei mehrzeilig geprüften
  Capture-Control-, Activation-Authority- und Scheduler-Control-SQL-Quellen
  vor den Stringorakeln von CRLF auf LF.

Die Testnormalisierung ändert weder produktiven TypeScript-Code noch SQL. Sie
schließt eine bei der isolierten Regression sichtbar gewordene
Reproduzierbarkeitslücke: Eine Git-Archivkopie mit CRLF ließ fünf statische
SQL-Stringorakel scheitern, obwohl dieselben Artefakte in der bytegenauen
Workspace-/Releaseform mit LF bestanden. Nach der Remediation bestehen beide
Kopieformen denselben vollständigen Testbestand.

Lokale Regressionsevidenz des technischen Zwei-Dateien-Deltas:

- isoliertes `npm ci` PASS; tatsächlich installiert `nanoid@3.3.18`;
- vollständiger `npm audit` PASS mit `0 vulnerabilities`;
- `npm audit --omit=dev` PASS mit `0 vulnerabilities`;
- TypeScript-Typecheck PASS in LF- und CRLF-Kopie;
- Vitest in der bytegenauen Workspace-/Releasekopie: `23/23` Dateien und
  `379/379` Tests PASS;
- Vitest in der CRLF-/Git-Archivkopie: `23/23` Dateien und `379/379` Tests
  PASS;
- Release-Check PASS;
- optimierter Next.js-15.5.21-Produktionsbuild PASS.

Dieser Absatz beschreibt den damaligen nanoid-Zwischenstand: Releasepaket und
Deploymentmanifest waren für jenes Delta noch neu zu bilden und unabhängig zu
prüfen. Die danach gebildete Paketgrenze wird durch die folgende Layer-7-
Korrektur erneut supersediert. Eine lokale Security-Remediation ist niemals
eine externe Freigabe.

## Forward-only Layer-7-Releasekorrektur

Die Production-Erstausführung setzte alle sechs ursprünglichen Marker exakt,
ließ die drei Baselinezählstände unverändert und stoppte ausschließlich im
globalen Relation-Security-Postflight. Die anschließende einmalig freigegebene
read-only Diagnose belegte `public.broker_providers` als einzige Abweichung:
Hosted Production führte die Relation bereits mit `RLS=true`, der bisherige
lokale Endvertrag erwartete `RLS=false`.

Der Releasekandidat ergänzt deshalb einen siebten, forward-only Layer. Er
aktiviert RLS idempotent auf genau dieser Tabelle, erhält die exakte bestehende
Owner-/ACL-/Policy-Grenze und fügt erst danach ein neues immutable Receipt ein.
Der globale Verifier akzeptiert den alten Relation-Hash ausschließlich im
exakten Sechs-Marker-Vorgänger; mit Layer-7-Marker gilt allein der neue
Relation-Hash
`d44f7661d68f9623bd1d3ef79da5af48e0ecee94f25aa3a24b829bc75a3fa8b8`.

Die sechs früheren Migrationsartefakte und ihre Fingerprints bleiben
byteidentisch. Der neue Layer-Fingerprint lautet
`d72047ce5e28e1400869a9abdcdad650a4f1b3b11e1e1b7cb07a9b37157eca47`.

Diese Sektion und die aktuelle „Lokale Kandidatenevidenz“ supersedieren für
den Layer-7-Kandidaten alle früheren Testzahlen und Aussagen, nach denen sechs
Marker den vollständigen Endvertrag bildeten. Tatsächlich bestätigt sind:

- vollständiger lokaler SQL-Orchestrator einschließlich Fresh-7,
  Sechs-zu-Sieben-Roll-forward, Sieben-Skip-Re-run und Unknown-Marker-
  No-effect-Orakel PASS;
- Vitest `23/23` Dateien und `380/380` Tests PASS;
- TypeScript-Typecheck, Release-Check und optimierter
  Next.js-15.5.21-Produktionsbuild PASS;
- allowlistbasiertes Releasepaket mit `369` kanonischen, bytegenau gegen den
  Workspace geprüften Dateien; autoritative Paket- und Freezehashes stehen nur
  im externen Sidecar, Deploymentmanifest und G1-Status.

Der Patch bleibt trotz dieser lokalen Evidenz rein lokal. Production bleibt
bei sechs Markern und globalem Postflight-FAIL; das aktuelle verbundene
Layer-7-Gate ist nicht ausgeführt. Kein Retry, Production-SQL, Restore, Merge,
Deployment, Cron, Runtime- oder MEXC-Schritt ist dadurch freigegeben.

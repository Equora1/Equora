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
- psql-Preflight, geordneter Sechs-Migrations-Treiber, Postflight, Betriebs-SOP
  und inaktives Vercel-Cronbeispiel. Der Preflight akzeptiert ausschließlich
  eine markerfreie exakte v57.60.1-Baseline oder bereits alle sechs exakten
  v57.61.0-Marker; ein Teilstand mit ein bis fünf Markern verlangt Restore.
  Preflight-, Fingerprint- oder ACL-Drift endet mit Nichtnull-Prozessstatus,
  und der globale Postflight revalidiert auch bei vollständigem Marker-Skip
  alle sechs Layer. Vor jeder DDL werden PostgreSQL 16+, der exakte
  `postgres`-/Superuser-Executorvertrag sowie fremde oder grantable Default-
  ACLs fail-closed geprüft. `PUBLIC` bleibt nur als nicht-grantable
  Funktions-`EXECUTE`-Default zulässig; Tabellenrechte für `PUBLIC` werden vor
  der ersten DDL blockiert.

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

1. vollständiger lokaler Typecheck, Unit-/Vertrags-/SQL-/Race-Test und Build;
2. neuer SHA-256-Freeze des exakten Deltas;
3. unabhängiger QA-, Security- und Integritätsreview dieses neuen Freeze;
4. Backup- und Restore-Nachweis in separatem Supabase-Stagingprojekt;
5. kontrollierte Stagingmigration plus RLS-/RPC-/Secret-Canary-Prüfung;
6. ausdrücklich freigegebener echter MEXC-Read-only-Probe;
7. separates Go für Capture-Cron und erst später ein eigenes Importgate.

## Lokale Kandidatenevidenz

- TypeScript-Typecheck PASS;
- vollständige Vitest-Suite: 22/22 Dateien und 367/367 Tests PASS;
- optimierter Next.js-15.5.21-Produktionsbuild PASS;
- kein separater ESLint-Nachweis: das bestehende `next lint`-Script startet
  mangels gepinnter ESLint-Konfiguration nur den interaktiven, veralteten
  Next.js-Setupdialog und ist ausdrücklich kein Bestandteil dieses Gates;
- vollständige lokale SQL-Matrix PASS: Fresh Apply, exakter Sechs-Layer-Re-run,
  Activation/Lane/Claim/Page/Failure/Outcome, Race- und Lockorakel, Scheduler,
  Runtime, Baseline-/Marker-/ACL-/GUC-/Constraint-/Indexdrift, internes
  FK-Triggerdriftorakel sowie echter PostgREST-v14.15-Timeout nach 15,01
  Sekunden;
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
  Default-ACLs und `PUBLIC SELECT ON TABLES` vor der ersten v57.61.0-DDL;
  Identity-/Credential-Keypuffer
  werden auch auf frühen Fehlerpfaden nicht unnötig decodiert und sicher
  geleert;
- Release-Check PASS; das Paket wird allowlistbasiert erzeugt, extrahiert,
  inhaltsverglichen und erneut geprüft. Der obsolete Force-Push-Handoff ist
  ausdrücklich ausgeschlossen.

Diese lokale Evidenz ist erst nach einem neuen hashgebundenen A3-/A4-/A5-
Review des vollständigen Deployment-Manifests reviewgültig. Sie autorisiert
keine externe Aktion.

Ohne diese Nachweise lautet der Status: lokal vorbereitet, Deployment/Runtime
noch NO-GO. Ein grüner technischer Freeze ersetzt die externen Gates nicht.

# Equora v57.61.0 – Post-Release- und Roadmap-Übergabe

## 0. Dokumentkontrolle

| Feld | Wert |
|---|---|
| Status | Verbindliche aktuelle Übergabe für den nächsten Codex-Task |
| Stand | 2026-08-12, Europe/Berlin |
| Produkt | Equora Trading Journal |
| Version | v57.61.0 / Package `0.57.61-0` |
| Worktree | `C:\Users\matth\Desktop\Trading Journal\product\Equora Starter v57.61.0` |
| Remote | `https://github.com/Equora1/Equora.git` |
| Production-Branch | `main` |
| Production-Commit | `04c4526395e4cd9d715ca6d0e3c38a66a5500852` |
| Evidenzbranch | `feature/mexc-import-v57.61.0` |
| Evidenz-HEAD/Upstream | `316def4ff467c9eb4be9f4ed5826ff33240fc1c1` |

Diese Datei aktualisiert den operativen Stand nach dem v57.61.0-Production-
Release. Die ältere Datei
`docs/handoff/EQUORA_v57.61.0_MEXC_IMPORT_HANDOFF.md` bleibt für fachliche
Definitionen, G0–G6, Golden Tests und Sicherheitsgrenzen relevant, ist aber bei
zeitabhängigen Git-, Datenbank-, Release- und Production-Aussagen durch diese
Post-Release-Übergabe und durch Abschnitt 30 des G1-Status supersediert.

Die Datei `UEBERGABE-v57.60-fuer-v57.61.txt` bleibt historisch und darf nicht
als Arbeitsanweisung verwendet werden. Ihre Force-Push-Anweisungen sind
ausdrücklich verboten.

## 1. Management Summary

`FAKT – am 2026-08-12 lokal und über die angebundene GitHub-Schnittstelle
read-only erneut geprüft`

- v57.61.0 ist als Anwendung und Datenbank in Production veröffentlicht.
- Production-Datenbank: exakt `7/7` v57.61.0-Marker, globaler Postflight PASS.
- Production-App: Vercel-Deployment für `main`-Commit `04c4526...` war `READY`;
  der begrenzte read-only Login-Surface-Smoketest bestand.
- `EQUORA_MEXC_RUNTIME_MODE=off` bleibt verbindlich.
- Kein MEXC-/Brokerrequest, kein Capture-Cron und kein automatischer
  Journalimport sind freigegeben.
- Die MEXC-Capture-Grundlage ist vorhanden; die produktive Capture-,
  Reconciliation-, Approval- und Importkette bleibt `G1_IN_PROGRESS_NO_GO`.
- Der jüngste Evidence-Commit `316def4...` liegt nur auf dem Feature-Branch und
  ist noch nicht Teil von `main`.
- Diese Übergabe ist zunächst eine lokale Datei. Sie autorisiert weder Staging,
  Commit, Push, PR, Merge, Deployment noch eine angeschlossene Systemaktion.

## 2. Verifizierter Git- und GitHub-Stand

### 2.1 Lokaler und entfernter Stand

```text
local_branch = feature/mexc-import-v57.61.0
local_head = 316def4ff467c9eb4be9f4ed5826ff33240fc1c1
feature_upstream = 316def4ff467c9eb4be9f4ed5826ff33240fc1c1
origin_main = 04c4526395e4cd9d715ca6d0e3c38a66a5500852
merge_base = 15551c0a5fba367fd2e0e6283071bddaf7a329f2
origin_main_vs_feature = 1_left_15_right
```

PR #1 wurde als Squash-Merge abgeschlossen. Deshalb ist die Historie des alten
Feature-Branches nicht linear auf dem neuen `main`, obwohl der Tree von
`origin/main` bytegleich zum gemergten Feature-Tree `5211e3c...` ist.

Der Tree von `HEAD` unterscheidet sich von `origin/main` aktuell ausschließlich
in:

1. `docs/gates/EQUORA_v57.61.0_G1_IMPLEMENTATION_STATUS.md`;
2. `docs/gates/EQUORA_v57.61.0_DEPLOYMENT_CANDIDATE_MANIFEST.sha256`.

### 2.2 Konsequenz für die nächste Integration

`VERBINDLICH`

- Keinen neuen PR direkt aus `feature/mexc-import-v57.61.0` eröffnen. Wegen des
  Squash-Merges könnte GitHub sonst die bereits gemergte Historie erneut als
  PR-Umfang darstellen.
- Für eine spätere Integration der Post-Release-Dokumentation einen frischen
  Branch direkt von dem dann erneut gefetchten `origin/main` erzeugen.
- Auf diesen frischen Branch nur die tatsächlich benötigten Post-Release-
  Dokumentationsänderungen übernehmen. Der Evidence-Commit `316def4...` ist
  dafür die überprüfte Quelle; die vorliegende Übergabedatei ist zusätzlich zu
  prüfen und bewusst aufzunehmen.
- Vor PR oder Merge erneut `git fetch`, Tree-/Diffprüfung, Tests nach Scope und
  eine Vercel-Production-Impactentscheidung durchführen. Jeder Push nach
  `main` kann automatisch ein Production-Deployment auslösen.

### 2.3 Aktueller GitHub-Status des Evidence-Commits

- Commit `316def4...` ist auf GitHub vorhanden.
- Commit-Diff: exakt zwei Dokumentationspfade, `225` Einfügungen und eine
  Löschung.
- GitHub Combined Status enthält `Vercel = success`.
- Es existieren keine PR-gebundenen GitHub-Workflowläufe für diesen Commit.
  Das ist erwartbar, weil PR #1 bereits beim früheren Head `5211e3c...`
  geschlossen und gemergt wurde.
- Aus dem Vercel-Commitstatus allein wird in dieser Übergabe kein neuer
  Production-Deploy behauptet.

## 3. Production-Endstand v57.61.0

### 3.1 Datenbank

```text
marker_state = seven_exact_complete
marker_count = 7
unknown_marker_count = 0
layer7_fingerprint = d72047ce5e28e1400869a9abdcdad650a4f1b3b11e1e1b7cb07a9b37157eca47
global_postflight = pass
old_receipts_digest = cc21daa87cba4695c1010b24acc8b9aa
old_receipts_unchanged = true
counts = trades_1280_connections_1_credentials_1_providers_1_sync_runs_2_raw_events_93
```

Layer 7 war ein forward-only RLS-Fix. Er änderte fachlich ausschließlich die
erforderliche RLS-Aktivierung plus den fingerprintgebundenen Receipt. Der
erfolgreiche Same-Session-Ablauf und der vorausgegangene fehlklassifizierte
Wrapperlauf sind ehrlich in Abschnitt 29 des G1-Status dokumentiert.

Keine weitere Supabase-SQL-, Repair-, Restore- oder Migrationsaktion ist durch
diese Übergabe freigegeben.

### 3.2 Anwendung, CI und Vercel

```text
production_main_sha = 04c4526395e4cd9d715ca6d0e3c38a66a5500852
github_ci_run_id = 31583100815
github_ci = completed_success
vercel_deployment_id = dpl_DswXJSHCU3qu8fnB93TCWCRFstnc
vercel_state = READY
production_ui_smoke = pass_readonly_login_surface
production_mexc_runtime_mode = off
production_broker_capture_requests = 0
production_mexc_requests = 0
production_cron_runs = 0
automatic_journal_import = not_implemented_not_authorized
```

Der Smoketest belegte nur Erreichbarkeit, Loginoberfläche und eine saubere
Browserkonsole. Er war kein authentifizierter Fachfunktions-, Broker- oder
Importtest.

### 3.3 Backup und akzeptiertes Restrisiko

Der verifizierte Production-Sicherungssatz liegt außerhalb des Repositorys:

`E:\Equora BackupsProduction2026-08-10\equora-production-20260811T071226Z`

Belegt sind `COMPLETE_VERIFIED`, `10/10` gebundene Dateihashes, sechs
verschlüsselte Nutzlastartefakte, `768` Custom-Format-TOC-Einträge sowie das
Storageinventar `1 Bucket / 6 Objekte / 914313 Byte`.

Backupmanifest-SHA-256:
`f07fbd76a8d8d822e590f1f6b5e95ca93bf057d3887f4e6c0a114298d5e5b538`

`SHA256SUMS`-SHA-256:
`a828f676e2e2cd8bc8e7eb7e054fb821bc510f6bc156176d0c9ab2cbca13a163`

Ein praktischer Restore dieses Satzes wurde nicht ausgeführt. Das bleibt ein
akzeptiertes P2-Risiko für den internen Runtime-off-Stand, aber ein Pflicht-Gate
vor Pilot-, Kunden-, Broker- oder Runtimebetrieb. Ein Restore braucht eine neue
ausdrückliche Freigabe.

## 4. Hashgebundene Releaseevidenz

```text
g1_status_sha256 = c2eed44da0a550253b82c803e41b762de6a3a364e0f2c824b4483ef9b546d801
deployment_manifest_sha256 = 30e587d9a90f003d0cd2d8e0ca06ce1950bdc690160948fdc370fa88f802d53b
deployment_manifest = 96/96
release_zip_sha256 = 8e3a5c65124582959e4873e6dfb6b33a1050364d8fb14c634bfb2314b1b6eeb6
release_sidecar_sha256 = 594e1bd78639385b1c4ceffc2bb3f45ca73f2877a99724512c9d47eec05bf32f
release_filelist_sha256 = d861370e888c09e0a3eab18846e4613ff320d1e88ed715e3fc0d6d0ce738493a
release_package_file_count = 369
```

### 4.1 Reproduzierbarkeitsgrenze des Deploymentmanifests

`WICHTIGE EVIDENZGRENZE`

`deployment_manifest = 96/96` bezeichnet den am Evidence-Commit
`316def4ff467c9eb4be9f4ed5826ff33240fc1c1` gegen die exakten physischen Bytes
des damaligen Quellworktrees
`C:\Users\matth\Desktop\Trading Journal\product\Equora Starter v57.61.0`
validierten historischen Freeze. Dieser Worktree enthält wegen der damaligen
Checkout-Historie gemischte Zeilenenden. Im Repository ist keine
`.gitattributes`-Policy festgelegt; bei globalem `core.autocrlf=true` kann ein
frischer Windows-Checkout deshalb nicht pauschal dieselben physischen Bytes und
damit nicht ohne Weiteres `96/96` reproduzieren.

Der Wert ist folglich keine Behauptung, dass ein beliebiger aktueller Checkout
das Manifest byteweise besteht. Für die Post-Release-Dokumentationsintegration
werden stattdessen getrennt geprüft:

- die beiden Evidence-Dateien bytegleich gegen ihre Git-Blobs aus `316def4...`;
- deren dokumentierte SHA-256-Werte;
- das unveränderte Release-ZIP sowie dessen Sidecar und Filelist gegen den
  benannten historischen Evidence-Worktree;
- der neue Branchscope, die Diffs und der leere Git-Index.

Eine checkoutunabhängige kanonische Hashpolicy oder ein neu gebildetes Manifest
ist ein eigener Tooling-/Releaseevidenz-Scope mit neuem Hashfreeze und
unabhängigem Review. Weder Produkt-, SQL-, Test-, Lockfile- noch
Konfigurationsdateien dürfen für die vorliegende Docs-only-Integration nur zur
Herstellung bestimmter Zeilenenden still verändert werden.

Der letzte vollständige lokale technische Stand war:

- `23/23` Vitest-Dateien und `380/380` Tests PASS;
- TypeScript `--noEmit` PASS;
- Release-Check PASS;
- optimierter Build PASS;
- SQL-Matrix Fresh-7, exakt 6→7, exakt 7-Skip-Re-run und Unknown-Marker-
  No-effect PASS;
- unabhängige A3/A4/A5-Voten jeweils PASS mit `P0=P1=P2=P3=0`.

Diese Tests wurden für den genannten Freeze ausgeführt. Der neue Task darf sie
nicht als frisch ausgeführt bezeichnen, bevor er sie erneut gestartet hat.

## 5. Verbindliche Sicherheits- und Produktgrenzen

Bis zu einer neuen, konkreten Nutzerfreigabe bleiben gesperrt:

- Änderung von `EQUORA_MEXC_RUNTIME_MODE=off`;
- MEXC-Probe, MEXC-Capture oder sonstiger Brokerrequest;
- Capture-Cron oder andere automatische Ausführung;
- automatischer Journalimport;
- Trading-, Order-, Cancel-, Transfer- oder Withdrawal-Funktionen;
- weitere Supabase-SQL-, Repair-, Restore- oder Migrationsaktionen;
- Änderung von Vercel-Environmentvariablen oder Secrets;
- Production-Deployment, Promotion oder Rollback;
- Push nach `main` und Merge;
- Veröffentlichung, Pilot- oder Kundenfreigabe.

Credential-, DPAPI-, Vercel-, Supabase- und Brokerwerte dürfen weder in diese
Übergabe noch in Repository, Logs, Screenshots, Fixtures oder Chatantworten
geschrieben werden. Eventuell weiterhin vorhandene lokale Login-/CLI-Sessions
sind technische Sitzungen, keine fachliche Freigabe.

## 6. Wie Freigaben im neuen Codex-Task behandelt werden

### 6.1 Was übernommen wird

- Diese Datei und der G1-Status übertragen den belegten Projektzustand, die
  abgeschlossenen Aktionen und die dauerhaft geltenden Sicherheitsgrenzen.
- Bereits ausgeführte Freigaben bleiben als historische Autorisierung der
  damals exakt beschriebenen Aktionen dokumentiert.
- Eine bestehende Browser-, GitHub-, Vercel-CLI- oder Plugin-Anmeldung kann
  technisch noch verfügbar sein. Der neue Task muss das read-only prüfen und
  darf die Verfügbarkeit nicht voraussetzen.

### 6.2 Was nicht automatisch übernommen wird

- Eine Freigabe für eine bereits erledigte Aktion ist keine Dauerfreigabe für
  spätere Commits, Pushes, PRs, Merges, Deployments, Secretänderungen,
  Datenbankläufe oder Brokerrequests.
- Ein neuer Task besitzt nicht verlässlich den vollständigen Gesprächskontext.
  Diese Übergabe ersetzt Kontext, aber keine neue Autorisierung für externe
  Schreibaktionen.
- Technisch persistierte Tool- oder CLI-Berechtigungen sind keine
  Projektfreigabe.

### 6.3 Empfohlener Freigabemodus

Im neuen Task kann der Nutzer zu Beginn pauschal erlauben:

- vollständige lokale read-only Analyse;
- lokale, klar begrenzte Dateiänderungen und Tests innerhalb eines benannten
  Scopes;
- Arbeit bis zum nächsten ausdrücklich genannten externen Hard Gate.

Weiterhin separat und konkret freizugeben sind mindestens: Git-Staging/Commit,
Push, PR-Schreibaktionen, Merge, Vercel-Schreibaktionen, Supabase-SQL,
Restore, Cron, Runtime-Aktivierung und jeder Broker-/MEXC-Request.

## 7. Unmittelbar nächster sicherer Arbeitsblock

### 7.1 Ziel

Post-Release-Evidenz und diese neue Übergabe sauber auf einen frischen, von
`origin/main` abgeleiteten Dokumentationsbranch bringen, ohne Production oder
den alten Featureverlauf erneut auszuliefern.

### 7.2 Reihenfolge

1. Root-`AGENTS.md`, diese Datei, den alten MEXC-Handoff und die aktuellen
   Abschnitte 29–30 des G1-Status vollständig lesen.
2. Erst nach konkreter Fetch-/Ref-Freigabe `git fetch origin --prune`
   ausführen. Der Abruf verändert keine Remote-Branches, aktualisiert oder
   entfernt aber lokale Remote-Tracking-Refs und ist deshalb lokal keine
   read-only Aktion. Anschließend Branch-, Tree- und Arbeitsbaumstatus
   read-only prüfen.
3. Bestätigen, dass `origin/main` weiterhin auf dem erwarteten Production-
   Stand basiert und ob seit dieser Übergabe neue Commits hinzugekommen sind.
4. Einen neuen Branch direkt von dem frisch geprüften `origin/main` erst nach
   ausdrücklicher Branchfreigabe erstellen.
5. Nur die zwei geprüften Post-Release-Evidenzänderungen aus `316def4...` und
   diese Übergabedatei übernehmen.
6. Diffs, Hashgrenzen, Claims und Secret-Hygiene prüfen. Abhängig vom finalen
   Scope Manifest und Releaseartefakt nicht still verändern.
7. Unabhängigen Review nach Routing durchführen.
8. Vor Staging, Commit, Push, PR, Merge und dem möglichen Vercel-Production-
   Impact jeweils an der vereinbarten Freigabegrenze stoppen.

## 8. Fachliche Weiterentwicklung des Journals

Die Reihenfolge ist bewusst risikoorientiert. Ein optischer Relaunch darf die
fachliche Broker- und Datenintegrität nicht überholen.

### Phase A – Stabilisierung des veröffentlichten Runtime-off-Releases

- Production-Erreichbarkeit und Fehlerlage beobachten;
- Backup-/Restore-Runbook vervollständigen;
- Security-/Dependencypflege weiterführen;
- kein Brokerzugriff und kein automatischer Import.

### Phase B – Kontrollierte Broker-Capture-Aktivierung

- zuerst Staging-Probe mit reinem GET und minimalem Accountscope;
- danach begrenztes Staging-Capture mit festen Symbolen und Budgets;
- Lease, Pagination, Recovery, Raw-Provenienz und No-partial-effect prüfen;
- Production erst nach separatem Gate, neuem Backup und ausdrücklicher
  Aktivierungsfreigabe;
- Capture bleibt von Journalimport getrennt.

### Phase C – Reconciliation und Human Approval

- Orders und Executions strikt getrennt normalisieren;
- Position Cycles, Teilfills, Teil-Exits, Reversals, Gebühren, Funding,
  Contract Size, Settlement-Währung und Zeitzonen fachlich korrekt behandeln;
- unvollständige oder widersprüchliche Kandidaten fail-closed blockieren;
- nachvollziehbare Importvorschau mit unveränderlichem Approval-Snapshot;
- atomarer, owner-gebundener und idempotenter Journalimport;
- kontrollierter Revert bei Erhalt manueller Notizen, Tags und Bilder.

### Phase D – Providerneutrale Multi-Broker-Plattform

MEXC ist der erste Adapter und Referenzfall, nicht die langfristige
Architekturgrenze. Weitere Broker sind geplant, werden aber erst nach einer
expliziten Auswahl- und Priorisierungsentscheidung umgesetzt.

Die wiederverwendbare Kernstruktur soll umfassen:

- versionierten `BrokerProviderAdapter` statt MEXC-Logik in Produktflächen;
- Provider-Capability-Matrix für Spot/Futures, Orders, Executions, Positionen,
  Funding, Contract-Metadaten, Zeitbereiche und Pagination;
- getrennte Credential- und Account-Identity-Verträge je Provider;
- providerneutrale Raw-Observation-, Checkpoint-, Lease- und Receipt-Schicht;
- kanonische normalisierte Order-, Execution-, Funding- und Instrument-Grains;
- providerabhängige Enum-, Fehler-, Rate-Limit- und Zeitsemantik nur im Adapter;
- gemeinsame Reconciliation-, Approval-, Import- und Provenienzpipeline;
- GET-/Read-only-Allowlist je Provider; keine Tradingfähigkeit durch
  Wiederverwendung der Capture-Architektur;
- pro neuem Broker eigene offizielle Providerverträge, Golden Tests,
  Securityprüfung und Stagingevidenz.

Kandidaten wie Binance, Bybit, OKX oder andere Broker sind noch keine
Produktentscheidung. Die Priorisierung soll anhand Nutzerbedarf, API-Qualität,
historischer Abdeckung, Gebühren-/Fundingdaten, Rechtegranularität, Rate Limits,
rechtlicher Verfügbarkeit und Wartungsaufwand erfolgen.

### Phase E – Modernisierung von UX und visueller Sprache

Ziel ist ein moderneres, datenorientiertes Journal auf dem Qualitätsniveau
führender Trading-Journals, ohne TradeZella oder andere Produkte visuell zu
kopieren. Equoras eigene Identität bleibt erhalten:

- dunkler Grundton `#080808`;
- Karten `#0d0d0d` und warme Grenzflächen;
- Equora-Gold/Orange `#c8823a`, `#f0a855`, `#a06828`;
- Plus Jakarta Sans und die vorhandene Equora-Displaytypografie;
- Grün und Rot ausschließlich semantisch für positive/negative oder sichere/
  kritische Zustände.

Empfohlene UX-Bausteine:

- klarere App-Shell mit kompakter Navigation und konsistentem Seitenraster;
- frei konfigurierbares Dashboard mit KPI-Leiste, Equity Curve, Drawdown,
  Kalender, Setup-/Session-/Wochentagsanalysen und Datenqualitätsstatus;
- einheitliche Filterleiste für Zeitraum, Konto, Broker, Markt, Setup und Tags;
- schnellere Trade-Tabelle mit gespeicherten Ansichten und Detail-Drawer;
- Trade-Detail als nachvollziehbare Timeline aus Entry, Teilfills, Exits,
  Gebühren, Funding, Screenshots, Notizen und Review;
- deutlich sichtbare Datenherkunft: manuell, CSV, Broker-Capture, reconciled,
  approviert oder blockiert;
- responsive Desktop-/Tablet-/Mobile-Hierarchie;
- reduzierte Glow-Effekte, stärkere Informationshierarchie und konsistente
  Spacing-/Radius-/Typografie-Tokens;
- Barrierefreiheit, Tastaturbedienung, Kontrast und Nicht-Farb-Codierung als
  Designanforderung.

Vor dem UI-Umbau sollten ein Seiteninventar, ein Design-Token-Audit, zwei bis
drei Wireframe-Richtungen und ein priorisierter Komponentenplan entstehen.
Empfohlen ist ein schrittweiser Umbau von App-Shell, Dashboard und Trade-Detail,
nicht ein Big-Bang-Rewrite.

### Phase F – Produktreife und Pilotfähigkeit

- Restore-Rehearsal und Incident-/Recovery-Prozess;
- Export, Löschung, Retention und Schlüsselrotation;
- Pilotvertrag, Supportmodell und messbare Qualitätsmetriken;
- echte Kohortenevidenz vor Kunden-, White-Label- oder Unternehmenskaufclaims;
- keine Rendite- oder Zuverlässigkeitsversprechen ohne belastbare Daten.

## 9. Offene Entscheidungen für den neuen Roadmap-Task

1. Welche Nutzeraufgabe erhält Priorität: Broker-Capture, automatische
   Reconciliation oder UI-Modernisierung?
2. Soll Production vorerst dauerhaft Runtime-off bleiben, bis der gesamte
   Human-Approval-Importpfad fertig ist, oder wird ein reines Capture-Pilotgate
   getrennt geplant?
3. Welcher zweite Broker hat den höchsten realen Nutzerwert?
4. Welche Kontotypen und Märkte sind zunächst in Scope: Futures, Spot oder
   beides?
5. Welche Dashboard- und Review-Kennzahlen sind fachlich definiert und
   währungsübergreifend belastbar?
6. Welche drei Seiten sollen zuerst modernisiert werden?
7. Welche TradeZella-ähnlichen Informationsmuster sind nützlich, ohne fremdes
   Branding, Layout oder Assets zu kopieren?
8. Wann wird das noch offene Restore-Rehearsal durchgeführt?

## 10. Startprotokoll für den neuen Codex-Task

1. Vollständig lesen:
   - `C:\Users\matth\Desktop\Trading Journal\AGENTS.md`;
   - diese Post-Release-Übergabe;
   - `docs/handoff/EQUORA_v57.61.0_MEXC_IMPORT_HANDOFF.md`;
   - G1-Status mindestens Abschnitte 29 und 30.
2. Read-only prüfen:
   - Worktree und Branch;
   - `HEAD`, Upstream, `origin/main`, Merge-Base und Tree-Diffs;
   - Arbeitsbaum einschließlich untracked Dateien;
   - keine `.env.local`, Secrets oder Backupinhalte im Git-Scope;
   - aktuellen GitHub-/CI-/Vercel-Status nur soweit erforderlich.
3. Fakten, Annahmen, Risiken und Empfehlungen trennen.
4. Vor jeder lokalen Änderung den konkreten Scope nennen.
5. Vor jeder externen oder schwer reversiblen Aktion eine neue, konkrete
   Freigabe einholen.
6. Keine Aussage als aktuell bestätigt darstellen, die nur aus dieser Übergabe
   stammt und seitdem zeitlich driften kann; solche Aussagen zuerst read-only
   aktualisieren.

## 11. Empfohlene erste Nachricht im neuen Task

> Arbeite in `C:\Users\matth\Desktop\Trading Journal\product\Equora Starter v57.61.0`. Lies zuerst vollständig `C:\Users\matth\Desktop\Trading Journal\AGENTS.md`, `docs\handoff\EQUORA_v57.61.0_POST_RELEASE_AND_ROADMAP_HANDOFF.md` und anschließend den älteren MEXC-Handoff. Prüfe den aktuellen Git-, GitHub-, `main`-, Feature-, CI- und Arbeitsbaumstand zunächst ausschließlich read-only. Beachte: PR #1 wurde als Squash-Merge abgeschlossen; der alte Feature-Branch darf nicht direkt als neuer PR verwendet werden. Production läuft auf v57.61.0, die Datenbank steht bei 7/7 und `EQUORA_MEXC_RUNTIME_MODE=off`; MEXC/Broker, Cron, automatischer Import, weitere Supabase-Aktionen und Production-Schreibaktionen bleiben ohne neue konkrete Freigabe gesperrt. Lege danach einen phasenweisen Plan für (1) saubere Integration der Post-Release-Dokumentation über einen frischen Branch von `origin/main`, (2) providerneutrale Multi-Broker-Architektur und (3) einen späteren UI-Modernisierungstrack in Equora-Schwarz/Gold vor. Beginne noch nicht mit Änderungen oder externen Schreibaktionen.

## 12. Übergabegrenze

Diese Datei enthält keine Secrets, keine echten Credentialwerte, keine
Brokerpayloads und keine Freigabe für eine externe Folgeaktion. Sie dokumentiert
den aktuellen Projektstand und das Zielbild für die nächste Arbeitssequenz.

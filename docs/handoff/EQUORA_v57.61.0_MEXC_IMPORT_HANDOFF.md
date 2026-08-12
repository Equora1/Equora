# Equora v57.61.0 – Übergabe MEXC Import & Reconciliation

## 0. Dokumentkontrolle

| Feld | Wert |
|---|---|
| Status | Verbindliche Arbeitsübergabe für den neuen Entwicklungs-Task |
| Stand | 2026-08-04, Europe/Berlin |
| Produkt | Equora Trading Journal |
| Produktionsbasis | Equora Starter v57.60.1 |
| Baseline-Commit | `15551c0a5fba367fd2e0e6283071bddaf7a329f2` |
| Entwicklungsbranch | `feature/mexc-import-v57.61.0` |
| Worktree | `C:\Users\matth\Desktop\Trading Journal\product\Equora Starter v57.61.0` |
| Produktionsrepository | `C:\Users\matth\Desktop\Equora Starter v57.60.1` |
| Remote | `https://github.com/Equora1/Equora.git` |

Diese Datei übergibt den bestätigten Stand der produktiven Version v57.60.1 und
definiert den kontrollierten Scope für v57.61.0. Sie ist keine Freigabe für
automatischen Brokerimport, Kundenvertrieb oder White-Label-Betrieb.

> **Verbindliche Sperre:** Die ältere Datei
> `UEBERGABE-v57.60-fuer-v57.61.txt` ist historisch, inhaltlich überholt und
> darf nicht als Arbeitsanweisung verwendet werden. Insbesondere dürfen die
> dort enthaltenen Force-Push-Anweisungen niemals ausgeführt werden. Diese
> Markdown-Datei ersetzt sie für den v57.61.0-Workstream.

## 1. Verbindliches Startprotokoll für den neuen Task

Der neue Task muss vor jeder Änderung in dieser Reihenfolge arbeiten:

1. Die übergeordnete `AGENTS.md` vollständig lesen. Sie liegt unter
   `C:\Users\matth\Desktop\Trading Journal\AGENTS.md` und gilt auch für diesen
   Worktree.
2. Diese Übergabedatei vollständig lesen.
3. Ausschließlich read-only prüfen:
   - aktueller Ordner ist der oben dokumentierte Worktree;
   - Branch ist `feature/mexc-import-v57.61.0`;
   - `HEAD` basiert auf `15551c0a...`;
   - Arbeitsverzeichnis enthält keine unerwarteten Änderungen;
   - keine `.env.local`, Zugangsdaten oder Produktionsdaten sind vorgemerkt.
4. Scope, Nicht-Ziele, offene Findings und Akzeptanzkriterien bestätigen.
5. Erst danach einen phasenweisen Implementierungsplan vorlegen.
6. Keine Produktion, Supabase-Migration, GitHub-Branch, Vercel-Umgebung oder
   MEXC-Verbindung verändern, bevor der jeweilige Gate-Owner die Evidenz geprüft
   und der Nutzer die externe Aktion ausdrücklich freigegeben hat.

## 2. Verifizierter Ausgangsstand

### 2.1 Git- und Worktree-Evidenz

`FAKT – lokal am 2026-08-04 geprüft`

- Das Produktionsrepository befand sich auf Branch `main`.
- `main...origin/main` hatte nach `git fetch origin --prune` die Abweichung
  `0 0`.
- Lokaler und entfernter Baseline-Commit waren
  `15551c0a5fba367fd2e0e6283071bddaf7a329f2`.
- Das Produktionsarbeitsverzeichnis war sauber.
- Der neue Worktree wurde direkt aus `origin/main` erstellt.
- Der neue Branch wurde nicht gepusht und nicht deployt.
- Die Produktionsbasis v57.60.1 wurde nicht verändert.
- Während der Review-Erstellung war ausschließlich `?? docs/` erwartet. Nach
  dem freigegebenen lokalen Docs-only-Commit muss der Arbeitsbaum sauber sein.
  Es wurden keine bestehenden Code-, SQL-, Konfigurations- oder Paketdateien
  geändert.

### 2.2 Release- und Produktionsevidenz

`FAKT – durch frühere lokale Befehlsausgaben auf v57.60.1 und anschließenden
Nutzertest belegt`

- `npm.cmd ci` war erfolgreich.
- `npm.cmd run typecheck` war erfolgreich.
- `npm.cmd test` war erfolgreich: 5 Testdateien, 38 Tests.
- `npm.cmd run release:check` war erfolgreich.
- `npm.cmd run build` mit Next.js 15.5.21 war erfolgreich.
- Git-Commit `15551c0` wurde nach `origin/main` gepusht.
- Vercel deployte diesen Commit.
- Der Nutzer bestätigte in Produktion:
  - Login funktioniert;
  - Dashboard funktioniert;
  - Trade-Bilder und Setup-Bild sind vorhanden;
  - Statistik, Review und Share funktionieren;
  - der Broker-Bereich ist erreichbar.

`WICHTIGE ABGRENZUNG`

- Typecheck, 38 Tests und Build wurden für den damaligen v57.60.1-Checkout
  erfolgreich ausgeführt.
- Im neu angelegten Worktree wurden diese dependency-abhängigen Gates noch
  nicht erneut ausgeführt; `node_modules` wurde absichtlich nicht kopiert.
- Im neuen Worktree bestand beim Setup der read-only Aufruf
  `node scripts/release-check.mjs`; `git diff --check` war ohne Befund.
- Diese Setup-Prüfungen ersetzen keinen vollständigen v57.61.0-Regressionstest.

`GRENZE DER EVIDENZ`

- Diese Nachweise belegen den Betrieb für den getesteten Eigengebrauch.
- Sie sind keine belastbare Kunden-, SLA-, White-Label- oder
  Unternehmenskauf-Freigabe.
- Ein vollständiger Restore-Test wurde nicht durchgeführt.
- Supabase Storage wurde auf ausdrückliche Nutzerentscheidung nicht zusätzlich
  gesichert, da die vorhandenen Medien als nicht kritisch bewertet wurden.

### 2.3 Supabase-Evidenz v57.60.1

`FAKT – vom Nutzer im Produktionsprojekt ausgeführt und per Ergebnis belegt`

- Vor der Migration wurden `roles.sql`, `schema.sql` und `data.sql` lokal
  gesichert und SHA-256-Hashes erzeugt.
- Die v57.60.1-Migration endete erfolgreich mit `COMMIT`.
- Postflight-Prüfungen bestätigten unter anderem:
  - erwarteter Media-Bucket vorhanden;
  - verbleibende Legacy-Trade-URLs: 0;
  - verbleibende Legacy-Setup-URLs: 0;
  - verbleibende Legacy-Share-URLs: 0;
  - kritische Constraints vorhanden;
  - erforderliche RPCs vorhanden;
  - vier kritische Tabellen mit RLS;
  - offene Media-Cleanup-Jobs: 0.

`OFFEN`

- Wiederherstellung aus den SQL-Dumps wurde nicht praktisch getestet.
- Ein dauerhaft geplanter Cleanup-Aufruf ist noch als Betriebsnachweis zu
  verifizieren; das Vorhandensein des Endpunkts allein belegt keinen Scheduler.

## 3. Bestätigter MEXC-Stand

### 3.1 Sicherheits- und Verbindungstest

`FAKT – Produktionsbeobachtung des Nutzers`

- Eine MEXC-Futures-Verbindung wurde mit einem nach Nutzerbestätigung
  ausschließlich lesend konfigurierten API-Key eingerichtet.
- Trading-, Transfer- und Auszahlungsrechte waren nach Nutzerbestätigung
  deaktiviert. Der erfolgreiche GET-Abruf beweist jedoch technisch nur die
  Lesefähigkeit des Schlüssels, nicht das Fehlen weiterer MEXC-seitiger Rechte.
- Equora zeigte die Verbindung anschließend als gespeichert und bereit an.
- Die Zugangsdaten werden serverseitig verschlüsselt in `broker_credentials`
  abgelegt; Klartextwerte dürfen nicht an den Browser zurückgegeben werden.
- Der aktuelle Connector führt ausschließlich lesende MEXC-GET-Aufrufe aus.
- Es wurde kein Brokerereignis als Journal-Trade importiert.

Die bestehenden DB-/UI-Bezeichnungen `futures_read_verified` und
`read_only_confirmed` sind deshalb zu stark formuliert. Für v57.61.0 sind
ehrliche Semantiken wie `futures_data_read_succeeded` und
`read_only_user_attested` zu verwenden, sofern MEXC keine belastbare technische
Rechteübersicht bereitstellt.

### 3.2 Zwei bestätigte Abrufe

| Abruf | Gefunden | Bereits bekannt | Neu gegenüber dem Speicher |
|---|---:|---:|---:|
| Erster Abruf | 72 | 0 | 72 |
| Zweiter Abruf | 89 | 68 | 21 |

Der erste Abruf bestand laut UI aus 20 Orders und 52 Ausführungen.

### 3.3 Aggregierte Rohdatenprüfung nach beiden Abrufen

| Ereignistyp | Gespeicherte Zeilen | Eindeutige externe IDs | Eindeutige Fingerprints | Wiederholte ID-Gruppen | Zusätzliche Versionen |
|---|---:|---:|---:|---:|---:|
| `execution` | 72 | 72 | 72 | 0 | 0 |
| `order` | 21 | 21 | 21 | 0 | 0 |

`FAKT`

- Insgesamt sind 93 eindeutige Rohereignisse für die getestete Verbindung
  gespeichert.
- Auf der beobachteten Rohdatenebene existieren keine doppelten externen IDs,
  keine doppelten Fingerprints und keine mehrfach gespeicherten Versionen
  derselben externen ID.
- Die technische Fingerprint-Deduplizierung hat für die beiden beobachteten
  Abrufe funktioniert.

`WICHTIGE GRENZE`

- 93 Rohereignisse sind nicht 93 wirtschaftliche Trades.
- Orders und Ausführungen haben unterschiedliche Granularität.
- Eine Order kann mehrere Ausführungen enthalten.
- Eine Ausführung darf nicht zusätzlich zu ihrer Order als zweiter Trade
  gezählt werden.
- Die bisherigen Abrufe beweisen weder historische Vollständigkeit noch eine
  korrekte Positionsrekonstruktion.

## 4. Aktuelle Connector-Architektur und Grenzen

### 4.1 Relevante Quellpfade

- `lib/server/mexc-readonly.ts`
- `lib/server/broker-preview.ts`
- `app/actions/broker-sync.ts`
- `lib/server/broker-sync.ts`
- `lib/server/broker-secret-store.ts`
- `components/broker-sync/mexc-connection-panel.tsx`
- `components/broker-sync/broker-sync-hub.tsx`
- `supabase/schema.sql`
- `supabase/schema-patch-v57.60.1.sql`
- `BROKER-SYNC.md`

### 4.2 Read-only-Abruf in v57.60.1

Der Connector verwendet aktuell:

- `GET /api/v1/contract/ping`;
- `GET /api/v1/private/order/list/history_orders`;
- `GET /api/v1/private/order/list/order_deals`.

Die Vorschau ist im Code begrenzt auf:

- maximal 20 History-Orders;
- maximal fünf aus diesen Orders abgeleitete Symbole;
- maximal 20 Ausführungen je ausgewähltem Symbol.

Das ist bewusst eine begrenzte Vorschau und kein vollständiger historischer
Brokerimport.

Ein weiterer aktueller Grenzfall ist release-blockierend für den Import: Wenn
der Execution-Abruf für ein einzelnes Symbol einen `MexcReadError` liefert,
ersetzt v57.60.1 diesen Abruf durch eine leere Liste. Damit ist „keine
Ausführungen vorhanden“ aktuell nicht sicher von „Abruf fehlgeschlagen“ zu
unterscheiden. v57.61.0 muss solche Läufe mindestens als `partial` markieren und
alle betroffenen Kandidaten blockieren.

### 4.3 Rohdatenmodell

Relevante Tabellen:

- `broker_credentials` – verschlüsselte Credential-Payload;
- `broker_connections` – Verbindung, Status und Rechte;
- `broker_sync_runs` – Laufstatus und Zähler;
- `broker_raw_events` – unveränderte Providerereignisse und Importstatus.

Auf `broker_raw_events(connection_id, event_fingerprint)` besteht ein eindeutiger
Index. RLS muss für alle benutzerbezogenen Brokertabellen aktiv bleiben.

## 5. Offene Findings und Gate-Wirkung

Die P1-Einstufungen beziehen sich auf die Freigabe des neuen Importfeatures.
Sie machen die bestehende read-only Vorschau nicht rückwirkend unbrauchbar.

| ID | Owner | Status | Schweregrad | Evidenz / Risiko | Akzeptanzkriterium |
|---|---|---|---|---|---|
| BRI-001 | A2 | offen | P1 | Der Abruf ist ein bewegliches, begrenztes Vorschaufenster. Historische Daten können fehlen. | Deterministische Pagination, Cursor/Watermark, Backfill-Grenzen und Vollständigkeitsreport sind getestet. |
| BRI-002 | A5 | offen | P1 | Orders und Executions sind gemischte Granularitäten. Direkter Import würde Doppelzählungen ermöglichen. | Normalisierte getrennte Grains und belegte Order-Execution-Zuordnung; nur wirtschaftliche Trades gelangen in das Journal. |
| BRI-003 | A5 | offen | P1 | Teilfills können Preis, Menge und Ergebnis auf mehrere Events verteilen. | Gewichtete Preise, kumulierte Mengen und Teil-Exit-Logik bestehen Golden Tests. |
| BRI-004 | A5 | offen | P1 | Gebühren, Funding und realisierter PnL sind noch nicht vollständig reconciled. | Brutto-PnL, Gebühren, Funding, sonstige Kosten und Netto-PnL sind transparent definiert und gegen Brokerwerte abstimmbar. |
| BRI-005 | A2/A5 | offen | P2, import-gate-relevant | Server- und Browserdarstellung zeigten unterschiedliche Ortszeiten. Fehlerhafte Zeitzonen können Handelstage und Statistiken verschieben. | UTC-Persistenz, dokumentierte Provider-Zeitbasis und konsistente Anzeige in `Europe/Berlin`, einschließlich DST-Tests. |
| BRI-006 | A2/A5 | offen | P1 | Rohdaten-Deduplizierung ist belegt; Idempotenz auf Journal-Trade-Ebene noch nicht. | Wiederholter Sync und wiederholte Freigabe erzeugen exakt denselben Journalbestand ohne Duplikate. |
| BRI-007 | A4/A3 | offen | P2 | Datenbank-Backup vorhanden, Restore nicht praktisch getestet. | Vor Pilot/Kundenbetrieb dokumentierter Restore-Test mit überprüften Zeilen- und Integritätszählungen. |
| BRI-008 | A2/A3 | offen | P3 | Nach der ersten Verbindung war ein manueller Reload nötig, bevor die gespeicherte Verbindung korrekt angezeigt wurde. | UI aktualisiert Verbindungen, Vorschau und Laufhistorie nach erfolgreicher Aktion ohne manuellen Reload. |
| BRI-009 | A4 | offen | P1 | Broker-Payloads können kontobezogene und wirtschaftlich sensible Daten enthalten. Ungefilterte Logs oder Exporte wären ein Datenschutzrisiko. | Keine Secrets/Rohpayloads in Logs; Zugriff, Export und Löschung sind owner-gebunden und getestet. |
| BRI-010 | A2 | offen | P1 | Execution-Fehler je Symbol werden aktuell als leere Ergebnisliste behandelt. Unvollständige Historie kann wie Erfolg aussehen. | Fehler je Endpoint/Symbol/Seite/Zeitfenster persistieren; Lauf mindestens `partial`; betroffene Positionen nicht importfähig. |
| BRI-011 | A2/A5 | offen | P1 | Contract Size, Settlement-Währung, historische Positionen und Funding werden nicht geladen. `vol` kann Kontrakte statt Basis-Asset-Menge bedeuten. | Versionierte Contract-Metadaten sowie erforderliche Position-/Funding-Events; keine Annahme `contractSize = 1`; Währungen getrennt reconciled. |
| BRI-012 | A4/A2 | offen | P1 | Broker-Sync-Runs und Raw Events tragen `user_id`, aber die bestehenden Fremdschlüssel erzwingen die Tenant-Konsistenz nicht durchgehend zusammengesetzt; Service Role umgeht RLS. | Preflight-Mismatch 0, zusammengesetzte Owner/Parent-FKs und negative Zwei-Nutzer-Tests für Tabellen und RPCs. |
| BRI-013 | A4 | offen | P1 | Erfolgreiche GETs werden derzeit als `read_only_confirmed` gespeichert, obwohl MEXC-seitige Zusatzrechte nicht technisch verifiziert werden. | Claims/Flags auf Lesetest plus Nutzerbestätigung begrenzen; feste Host/GET/Pfad-Allowlist mit Negativtests. |
| BRI-014 | A4/A6 | offen | P1 | Lokales Entfernen widerruft den Schlüssel nicht bei MEXC; Folgen für Raw Events und später importierte Trades sind noch nicht sauber getrennt. | Getrennte Aktionen und Counts für Credential, Raw History und Journal-Trades; klarer Hinweis auf separaten MEXC-Widerruf; atomare Owner-Tests. |
| BRI-015 | A4 | offen | P1 | Retention, Export/Auskunft, kontrollierte Raw-Event-Immutable-Linie und Master-Key-Rotation sind nicht vollständig operationalisiert. | Dateninventar, Feldminimierung, Retention/Export/Löschung, kontrollierte Erasure-RPC, Dual-Key-Rotation und getestetes Key-Recovery-Runbook. |
| BRI-016 | A5/A2 | offen | P1 | Bestehende CSV-Zuordnung nach Symbol/Richtung und LIFO ist für API-Positionen, Hedge Mode und Teilfills nicht belastbar. | API-Reconciliation verwendet Execution-, Order- und Position-Identitäten, Menge und UTC; CSV-Heuristik wird nicht wiederverwendet. |
| BRI-017 | A6/A4 | offen | P1 | Produktclaims und Approval-UX unterscheiden Lesetest, Nutzerbestätigung und technische Rechteverifikation noch nicht präzise genug. | UI sagt „MEXC-Datenabruf erfolgreich“ und „Read-only vom Nutzer bestätigt“, nicht „technisch verifiziert“ oder pauschal „sicher verbunden“; unveränderliche Auswahl mit verständlichen Folgen. |

## 6. Verbindlicher Scope v57.61.0

### 6.1 Ziel

Eine kontrollierte, nachvollziehbare und idempotente MEXC-Futures-Importstrecke,
die Brokerereignisse vollständig abruft, fachlich korrekt normalisiert,
Positionen und Teilfills reconciled, Abweichungen sichtbar macht und erst nach
expliziter Nutzerfreigabe Journal-Trades erzeugt.

### 6.2 Pflichtumfang

1. Providervertrag und Feldsemantik dokumentieren.
2. Vollständige, wiederaufnehmbare Pagination und historische Backfill-Grenzen
   implementieren.
3. Rohereignisse unverändert und idempotent persistieren.
4. Orders und Ausführungen in getrennte normalisierte Grains überführen.
5. Ausführungen Orders und anschließend wirtschaftlichen Positionszyklen
   zuordnen.
6. Long/Short, Teilfills, Teil-Exits, Reversals, Gebühren, Funding, Rundung,
   Providerzeit und Anzeigezeitzone korrekt behandeln.
7. Abweichungen, unvollständige Datensätze und nicht zuordenbare Events
   fail-closed behandeln.
8. Eine verständliche Importvorschau mit Human Approval bauen.
9. Journalimport atomar, owner-gebunden, idempotent und rückverfolgbar ausführen.
10. Post-Import-Reconciliation und Revert/Recovery-Verhalten implementieren.

### 6.3 Nicht-Ziele

- keine Ordereröffnung, Orderänderung oder Orderschließung;
- keine Trading-, Transfer- oder Auszahlungsberechtigungen;
- kein automatischer Import ohne Human Approval;
- kein automatisches Verbinden zusätzlicher MEXC-Konten;
- keine weiteren Broker in diesem Scope;
- keine Strategieempfehlung oder Renditeprognose;
- keine Kunden-, White-Label- oder Unternehmenskauf-Freigabe;
- kein Production-Schema-Change ohne separates Migrations- und Rollback-Gate.

## 7. Agentenrouting und Qualitätsverantwortung

Die Rollen bezeichnen spezialisierte Prüfverantwortung. Sie müssen mit
prüfbarer Evidenz arbeiten; Rollenbezeichnungen ersetzen keine Tests.

### A1 – Orchestrator / Engineering Lead

- kontrolliert Scope, Reihenfolge, Abhängigkeiten und Decision Log;
- weist jedem Finding genau einen Owner zu;
- führt Ergebnisse zusammen;
- darf ein Hard-Gate-Veto nicht ohne neue dokumentierte Evidenz aufheben.

### A2 – Software Architecture & Implementation – Lead

- verantwortet Connector, Pagination, Normalisierungsarchitektur, Datenmodell,
  Transaktionen, Migrationsdesign, Performance und technische Tests;
- verändert Broker- und Importcode erst nach dokumentiertem Providervertrag.

### A5 – Trading Domain & Data Integrity – Pflichtreview mit Hard-Gate-Veto

- definiert Orders, Executions, Positionszyklen und PnL-Komponenten;
- prüft Long/Short, Teilfills, Teil-Exits, Reversals, Gebühren, Funding,
  Rundung, Zeitzonen und Abweichungsregeln;
- gibt keine Importfreigabe ohne bestandene Golden Tests.

### A3 – QA & Release Assurance – unabhängige Prüfung

- erstellt Testmatrix und Reproduktionsnachweise;
- prüft Unit-, Integrations-, Migrations-, Browser- und Regressionsevidenz;
- wertet fehlende Evidenz nicht als bestanden;
- implementiert nicht gleichzeitig die alleinige finale Release-Freigabe.

### A4 – Security, Privacy & Compliance Engineering – Pflichtreview

- prüft Secrets, Verschlüsselung, API-Rechte, RLS, Service-Role-Nutzung,
  Logging, Löschung, Export, Backups und Threat Model;
- blockiert jede Ausweitung über read-only oder jede ungeschützte Offenlegung.

### A6 – Product, Commercial & Distribution

- prüft Importvorschau, Human Approval, verständliche Abweichungen,
  Barrierefreiheit, Fehlermeldungen und Supportfolgen;
- beteiligt A4/A5 an allen Claims über Genauigkeit, Sicherheit oder Nutzen.

## 8. Zielarchitektur

```text
MEXC Read-only API
        |
        v
Paginated Fetch + Cursor/Watermark
        |
        v
Immutable Raw Events
        |
        v
Provider Normalization
        |
        +--> Normalized Orders
        |
        +--> Normalized Executions
                    |
                    v
          Order/Execution Linkage
                    |
                    v
          Position-Cycle Reconciliation
                    |
                    v
         Fees/Funding/PnL Validation
                    |
                    v
        Import Candidates + Findings
                    |
                    v
              Human Approval
                    |
                    v
        Atomic Idempotent Journal Import
                    |
                    v
          Post-Import Reconciliation
```

### 8.1 Fachliche Grains

- **Raw Event:** eine unveränderte Providerantwort auf Ereignisebene.
- **Normalized Order:** eine Brokerorder; darf mehrere Executions enthalten.
- **Normalized Execution:** ein tatsächlich ausgeführter Fill mit eigener
  Menge, Preis, Zeit und gegebenenfalls Gebühr.
- **Position Cycle:** fachlich abgegrenzte Entwicklung von Flat zu Position und
  zurück zu Flat; Reversal-Regeln müssen explizit definiert werden.
- **Journal Trade:** das nach Reconciliation und Human Approval persistierte
  Produktobjekt; seine Herkunft muss zu den Rohereignissen zurückverfolgbar sein.

Executions sind die primäre Evidenz für tatsächlich ausgeführte Mengen und
Preise. Orders liefern Kontext und dürfen Brokerwerte ergänzen, aber nicht als
zusätzliche wirtschaftliche Trades gezählt werden.

Contract-Metadaten, insbesondere `contractSize`, Settlement-Währung und
Providerpräzision, sind versioniert mit ihrer Gültigkeit zu behandeln. Funding
und erforderliche historische Positionsdaten erhalten eigene Quell-/Eventtypen.
Offene Positionen oder unvollständige Zeiträume dürfen nicht als abgeschlossene
Journal-Trades erscheinen.

### 8.2 Vor Implementierung erforderliches logisches Datenmodell

Das bestehende einzelne `broker_raw_events.trade_id` reicht nicht als
Provenienzmodell. Insbesondere kann eine Reversal-Execution anteilig einen alten
Position Cycle schließen und einen neuen eröffnen. G0 verlangt deshalb ein
reviewtes logisches ERD mindestens für:

- Sync Scope mit Provider, Verbindung/Konto, Endpoint, Symbol und Zeitfenster;
- Run Checkpoint mit Cursor/Page, High-/Low-Watermark und Resume-Information;
- Page-/Request-Ergebnis mit Status, Providerfehler, Count und Zeitgrenzen;
- Run-to-Raw-Event-Observation auch für erneut beobachtete, bereits bekannte
  Raw Events;
- Normalized Order, Execution, Contract Metadata, Position und Funding;
- Import Candidate mit stabilem `source_key`, `input_digest`,
  `algorithm_version`, Revision und Status;
- Candidate-to-Raw-Event-Allocation mit Rolle und zugeordneter Menge;
- Trade-Provenienz als eigene Relation;
- Approval mit Kandidatenrevision, Snapshot-Hash, Zeitpunkt und Single-Use;
- `stale`/`needs_review` bei verspäteten oder geänderten Quellen;
- kontrollierte Tombstone-/Erasure-Semantik.

Events ohne belastbare Provideridentität dürfen nicht über schwache
Fallback-IDs importfähig werden. Provider-ID, Inhaltshash, fachlicher Importkey
und Orderrevision sind getrennt und versioniert zu definieren.

## 9. Arbeitsphasen und Hard Gates

### Phase 0 – Baseline und Verträge

- Baseline erneut prüfen;
- aktuelle MEXC-Futures-API-Dokumentation aus offiziellen Quellen sichern;
- Feldmapping, Zeitbasis, Statuswerte, Pagination und Rate Limits dokumentieren;
- Testfixtures ausschließlich anonymisiert und minimiert erstellen.
- Produktentscheidungen zu Journal-Trade-Grain, initialem Backfill,
  Reimport/manuellen Feldern und Lösch-/Entfernungssemantik mit ID, Datum,
  Owner, Begründung und den erforderlichen A4-/A5-Reviews abschließen.

G0 erzeugt vier überprüfbare Architekturartefakte:

1. **Decision Set** unter `docs/decisions/`: Journal-Grain,
   Hedge-/Reversal-Modell, initialer und inkrementeller Sync-Zeitraum,
   Gebühren-/Währungspolitik, PnL-Toleranzen, Reimport/manuelle Felder und
   Löschsemantik.
2. **Providervertrag**: Endpoints, Sortierung, maximale Seitengröße/Retention,
   Zeitgrenzen und Inklusivität, Tie-Breaker, Stop-/Loop-Regeln, Watermarks,
   Overlap-Scan, Late Arrivals, stabile IDs, Orderrevisionen, Rate Limits und
   Fehlersemantik.
3. **Logisches ERD**: Run/Page/Observation, Raw/Normalized Events,
   Candidate/Revision/Allocation, Approval, Import und Provenienz gemäß 8.2.
4. **Transaktions-/Betriebs-/Migrationsdesign**: Lease, bounded Work Units,
   Page-Commit-RPC, Failure Cases, additive Migration, Backfill, Constraint-
   Validierung, RLS-Umschaltung und Roll-forward Recovery.

**Gate G0:** Kein Implementierungsbeginn ohne Providervertrag, Fixture-Regeln
und die vier genannten reviewten Architekturartefakte. Offene oder still
angenommene Semantik hält G0 rot.

### Phase 1 – Vollständige Ingestion

- Pagination, Cursor/Watermark, Retry, Rate Limit und Resume-Verhalten;
- atomare Run-Zähler und deterministische Deduplizierung;
- keine Veränderung bereits gespeicherter Raw Events.
- keine Umwandlung von Endpoint-/Symbol-/Seitenfehlern in scheinbar leere,
  erfolgreiche Datenmengen.
- genau ein aktives Lease je Verbindung und begrenzte Work Units statt
  unzuverlässiger Hintergrundarbeit nach einer Serverless-Response;
- pro Seite/Chunk eine kurze DB-Transaktion mit
  `INSERT ... ON CONFLICT DO NOTHING`, tatsächlich abgeleiteten Zählern und
  atomarem Checkpoint; keine offene DB-Transaktion während externer HTTP-Calls;
- wiederholte Observation bekannter Raw Events protokollieren, ohne diese Raw
  Events doppelt zu speichern.

**Gate G1:** Kontrollierter Backfill findet alle erwarteten Fixture-Ereignisse
genau einmal und kann nach Abbruch fortgesetzt werden.

### Phase 2 – Normalisierung

- typisierte Felder, Dezimalwerte ohne Gleitkommafehler, UTC-Zeitstempel;
- Order- und Execution-Grain strikt trennen;
- unbekannte Enums und Pflichtfelder fail-closed behandeln.

**Gate G2:** Normalisierungs-Fixtures sind deterministisch; keine stillen
Defaults bei fachlich unbekannten Werten.

### Phase 3 – Reconciliation

- Order-Execution-Linkage;
- Teilfills, Teil-Exits und Reversals;
- gewichtete Preise, Mengenbilanz und PnL-Komponenten;
- Abweichungsregister und Toleranzregeln.

**Gate G3:** Alle Golden Tests bestehen; ungeklärte Differenzen bleiben
blockiert und sichtbar.

### Phase 4 – Vorschau und Human Approval

- Kandidaten, Duplikate, blockierte Datensätze und Abweichungen getrennt zeigen;
- keine Vorauswahl riskanter oder unklarer Kandidaten;
- Approval an unveränderlichen Kandidatensatz binden.
- getrennte, vollständig abstimmbare Kategorien anzeigen: importierbar, bereits
  importiert, blockiert, offene Positionen, nicht zugeordnet und bewusst
  ausgeschlossen;
- je Kandidat mindestens Verbindung/Konto, Markt, Long/Short, UTC- und Ortszeit,
  Entry/Exit, Menge, gewichtete Preise, Gebühren, Funding, Brutto-/Netto-PnL,
  Abweichungsstatus und Quellherkunft einsehbar machen;
- blockierte oder unklare Kandidaten technisch nicht auswählbar machen;
- Approval an Nutzer, Verbindung/Konto, Sync Run, Watermark, Kandidaten-IDs,
  Regelversion und kryptografischen Snapshot-Hash binden;
- vor Bestätigung Anzahl und finanzielle Summen der konkret ausgewählten
  Kandidaten zeigen; keine Vorauswahl und kein Ein-Klick-Gesamtimport;
- neue Raw Events, Contract-Metadaten oder Reconciliation-Ergebnisse
  invalidieren die Freigabe und setzen `needs_review`.

**Gate G4:** Ohne explizite Aktion entstehen keine Journal-Trades.

Die UX unterscheidet mindestens die Zustände `vollständig`, `teilweise`, `keine
Daten`, `Berechtigung fehlt`, `Credential ungültig`, `Rate Limit` und `Provider
nicht erreichbar`. Bei `partial` ist Approval gesperrt. Jede Meldung enthält
eine sichere Nutzeraktion und eine sanitiserte Support-Referenz, aber keine
Payload-, Signatur- oder Credential-Information. Status wird nicht nur über
Farbe vermittelt.

### Phase 5 – Persistenz und Revert

- owner-gebundene serverseitige RPC/Transaktion;
- eindeutige Importidentität je Provider/Konto/Execution bzw. Kandidat;
- atomare Verknüpfung zu Rohereignissen;
- kontrollierter Revert ohne Löschen manueller Nutzerergänzungen.
- getrennte Aktionen für Credential/Verbindung trennen, Brokerhistorie löschen
  und importierte Journal-Trades revertieren;
- vor destruktiven Aktionen betroffene Counts, verbleibende Daten,
  Reimportfolgen und Exportmöglichkeit anzeigen;
- Raw History nicht so löschen, dass Journal-Trades ihre Provenienz verlieren
  oder erneut importiert werden können; dafür ist ein geprüftes
  Tombstone-/Importidentitätskonzept erforderlich;
- manuelle Notizen, Tags und Bilder beim Revert nachweislich bewahren.
- eigenen Brokerimport-RPC verwenden; der Client übergibt nur Kandidatensatz,
  Revision und Auswahl, niemals autoritative Finanzwerte;
- der RPC lädt serverseitig approvierte Kandidaten, prüft Digest, Ownership,
  Status und Single-Use, sperrt die Auswahl und importiert atomar;
- ein batchübergreifend eindeutiger wirtschaftlicher Broker-Importkey verhindert
  Duplikate auch bei neuer Batch-ID oder parallelen Requests.

**Gate G5:** Wiederholter Import bleibt idempotent; Fehler erzeugen keinen
teilweise sichtbaren Journalbestand.

### Phase 6 – unabhängige Release Assurance

- A3-, A4- und A5-Review;
- reale Datenbankmigration zunächst außerhalb Produktion;
- Browser- und Regressionstests;
- Backup-/Rollback-/Restore-Nachweis nach Scope;
- Release-Artefakt fail-closed erstellen und prüfen.

**Gate G6:** Kein Merge nach `main`, kein Vercel-Deployment und kein
Produktions-SQL ohne dokumentiertes GO der betroffenen Gate-Owner und
ausdrückliche Nutzerfreigabe.

## 10. Mindestumfang Golden Test Cases

1. Long, einzelner Entry-Fill, einzelner Exit-Fill.
2. Short, einzelner Entry-Fill, einzelner Exit-Fill.
3. Mehrere Entry-Teilfills mit gewichteter Durchschnittsbasis.
4. Mehrere Exit-Teilfills mit realisiertem Teil-PnL.
5. Teil-Exit mit verbleibender offener Position.
6. Reversal von Long nach Short und von Short nach Long.
7. Maker- und Taker-Gebühren je Fill.
8. Gebühren in abweichender Abrechnungswährung – blockieren oder explizit
   konvertieren, niemals still gleichsetzen.
9. Positives und negatives Funding; Gutschrift und Belastung.
10. Order mit Preis 0 oder ohne Fill darf keinen Trade mit Preis 0 erzeugen.
11. Stornierte, abgelehnte und teilweise ausgeführte Orders.
12. Ausführung ohne im Abruffenster vorhandene Parent-Order.
13. Ausführung kommt verspätet oder außerhalb der Reihenfolge an.
14. Derselbe Abruf wird zweimal ausgeführt.
15. Importvorschau wird zweimal bestätigt.
16. Pagination-Grenze und Wiederaufnahme nach simuliertem Abbruch.
17. Gleiches Symbol in getrennten Positionszyklen.
18. Mehrere Konten mit identischen Broker-IDs bleiben mandantensicher getrennt.
19. UTC-Zeit nahe Mitternacht verschiebt den lokalen Handelstag korrekt.
20. DST-Wechsel Europe/Berlin mit nicht doppelt oder fehlend gezählter Stunde.
21. Sehr kleine Preise/Mengen und hohe Dezimalpräzision ohne Float-Drift.
22. Gemischte oder fehlende Währung blockiert aggregierte Kennzahlen.
23. Broker-PnL und lokal berechneter PnL innerhalb dokumentierter Toleranz.
24. Transaktionsfehler nach Teiloperation hinterlässt keinen Teilimport.
25. Revert entfernt nur importierte Beziehungen/Trades gemäß definierter
   Ownership und bewahrt manuelle Nutzerergänzungen.
26. Symbolabruf schlägt fehl: Lauf ist `partial`, Kandidat ist blockiert.
27. Hedge Mode mit gleichzeitigem Long und Short desselben Symbols bleibt in
   getrennten Position Lifecycles.
28. `vol=10` und `contractSize=0,001` ergeben 0,01 Basis-Einheiten, nicht zehn.
29. Spät eintreffende Execution oder Funding nach Approval erzwingt
    `needs_review`; kein stilles Update.
30. Eine Reversal-Execution wird mengenanteilig zwei Position Cycles zugeordnet;
    beide bleiben vollständig bis Raw Event, Kandidatenrevision und
    Algorithmusversion rückverfolgbar.
31. Zwei unterschiedliche Events mit gleichem Symbol und Zeitstempel
    kollidieren nicht; ein Event ohne belastbare Provider-ID bleibt blockiert.
32. Zwei überlappende Sync-Läufe beobachten dieselben Raw Events ohne
    Doppelspeicherung; jede Seite und jede Observation bleibt auditierbar.
33. Ein Backfill über mindestens drei bounded Work Units liefert nach
    kontrollierten Abbrüchen denselben Bestand wie der ununterbrochene
    Referenzlauf.

## 11. Security- und Privacy-Grenzen

### 11.1 Niemals in Repository, Übergabe, Tests, Logs oder Screenshots

- MEXC API Key;
- MEXC Secret Key;
- `EQUORA_BROKER_SECRET_KEY`;
- `EQUORA_MAINTENANCE_SECRET`;
- Supabase Service Role Key;
- `.env.local`;
- Vercel-Environment-Werte;
- vollständige reale Broker-Payloads;
- Konto-, Nutzer- oder Credential-IDs, wenn sie nicht anonymisiert sind.

### 11.2 Pflichtkontrollen

- MEXC-Key ausschließlich read-only; keine Trading-/Transfer-/Withdrawal-Rechte.
- Credentials nur serverseitig entschlüsseln und niemals an Client Components
  serialisieren.
- AES-256-GCM schützt die Credential-Payload app-seitig; die Raw Broker Events
  sind dadurch nicht automatisch zusätzlich anwendungsseitig verschlüsselt.
- Service Role ausschließlich in server-only Codepfaden.
- RLS und Parent/User-Bindung für alle Broker- und Importtabellen.
- Keine Raw Payloads, Secrets oder signierten Requests in Logs oder Fehlertexten.
- Providerfehler für Nutzer minimieren; technische Details nur sanitisiert.
- Credential-Löschung, Connection-Löschung, Raw-Event-Löschung und Export
  definieren und testen.
- Schlüsselrotation und Verhalten bei fehlendem/falschem Key dokumentieren.
- Getrennte Dev-/Preview-/Prod-Master-Keys, gesicherte Recovery-Kopie und
  Dual-Key-Re-Encryption statt blindem Ersetzen des produktiven Master-Keys.
- Das Entfernen einer Verbindung in Equora widerruft den API-Key nicht bei
  MEXC; die UI muss zum separaten Widerruf beim Provider auffordern.
- Raw Events und Sync Runs dürfen nicht über breite Browser-DML verändert
  werden; Provenienz bleibt immutable, Löschung erfolgt kontrolliert nach
  definierter Erasure-Semantik.
- Server-Sync benötigt Lease/Lock, Cooldown sowie harte Grenzen für Seiten,
  Ereignisse, Bytes, Laufzeit und Retries.
- Credential-Seite benötigt überprüfte HTTPS-/HSTS-/CSP-/Clickjacking-Header
  und darf keine unnötigen Third-Party-Skripte laden.
- Keine neue externe API, kostenpflichtige Funktion oder Telemetrie ohne
  ausdrückliche Nutzerfreigabe.

Der neue Worktree enthält absichtlich keine automatisch kopierte `.env.local`.
Lokale Runtime-Secrets werden erst bei einem konkreten Testbedarf aus einer
sicheren lokalen Quelle bereitgestellt und bleiben Git-ignoriert.

## 12. Datenbank- und Migrationsregeln

- Jede Schemaänderung erhält ein neues, versioniertes Patch-Skript.
- Vorwärtsmigration, Preflight, Postflight und Rollback/Recovery müssen
  konsistent dokumentiert werden.
- Trading-bezogene referenzielle Integrität muss Mandant und Parent gemeinsam
  binden; keine bloße UUID-Verknüpfung ohne Ownership-Nachweis.
- Vor einer Migration werden Mismatch-Preflights für Credential/Connection,
  Run/Connection, Raw/Run/Connection und Raw/Trade ausgeführt. Erwartung: 0.
- Zusammengesetzte Fremdschlüssel müssen gleiche `user_id` und, wo relevant,
  gleiche `connection_id` erzwingen; künftige Import-RPCs leiten Ownership
  serverseitig ab und vertrauen keinem Client-`user_id`.
- Eindeutige Importkeys müssen auf Provider, Verbindung/Konto und stabile
  externe Identität abgestimmt sein.
- Finanzwerte werden als geeignete Decimal/Numeric-Werte verarbeitet, nicht als
  unkontrollierte binäre Floats.
- Keine Produktionsmigration direkt aus einem Entwicklungsentwurf.
- Vor späterer Produktionsmigration erneut manuelles Supabase-Backup erzeugen.
- Bei Free-Plan-Betrieb Restore-Prozedur und Aufbewahrungsort explizit prüfen.

Das Migrationsdesign folgt vor SQL-Implementierung mindestens dieser additiven
Reihenfolge:

1. Mismatch-Preflights;
2. erforderliche Parent-Unique-Constraints;
3. additive Spalten und neue Tabellen;
4. kontrollierter Backfill bestehender v57.60.1-Daten;
5. zusammengesetzte Fremdschlüssel zunächst `NOT VALID`;
6. Validierung der neuen Constraints;
7. Berechtigungs- und RLS-Umschaltung;
8. Postflight-Zählungen und Integritätsprüfungen;
9. definiertes Kompatibilitätsfenster zur vorherigen Anwendungsversion;
10. Roll-forward Recovery statt eines destruktiven Down-Rollback-Versprechens.

Die vorhandenen 93 beobachteten Produktions-Rohereignisse müssen bei einer
späteren Migration erhalten bleiben. Dieser Zähler ist Referenzevidenz, ersetzt
aber keinen erneuten unmittelbar vor Migration ausgeführten Preflight.

## 13. Test- und Release-Matrix

### Automatisierte Baseline-Gates

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run release:check
npm.cmd run build
npm.cmd audit
```

### Zusätzlich für v57.61.0 erforderlich

- Unit Tests für MEXC-Feldmapping und Zeitzonen;
- Golden Tests für alle Fälle aus Abschnitt 10;
- Integrationsprüfung der Pagination/Resume-Logik mit kontrollierten Fixtures;
- SQL-Contract-Tests für Constraints, RLS, Grants und RPC-Signaturen;
- reale Postgres/Supabase-Migration außerhalb Produktion;
- RLS-Negativtests mit zwei verschiedenen Nutzern;
- Idempotenztest über mindestens zwei vollständige Sync- und Importläufe;
- Fehler-/Rollback-Test inmitten des Imports;
- Browserprüfung der Vorschau, Auswahl, Blocker und Human Approval;
- responsive und barrierearme Bedienung;
- Secret- und Artifact-Scan vor Commit und Packaging;
- extrahiertes Release-Artefakt erneut gegen Manifest und Gates prüfen.

## 14. Definition of Done v57.61.0

Die Version ist erst fertig, wenn:

1. Scope und Nicht-Ziele umgesetzt und dokumentiert sind;
2. alle offenen P1-Importblocker behoben oder das Feature deaktiviert bleibt;
3. alle Golden Tests bestanden sind;
4. Pagination und historische Vollständigkeit für den definierten Zeitraum
   messbar sind;
5. Journalimport atomar und idempotent ist;
6. ungeklärte Datensätze fail-closed bleiben;
7. Security-, Privacy-, Trading- und QA-Reviews unabhängig abgeschlossen sind;
8. Migration, Rollback und notwendiger Restore-Nachweis vorliegen;
9. Human Approval technisch zwingend ist;
10. kein Secret oder reale Broker-Payload im Git-/Release-Artefakt liegt;
11. Produktions-Smoke-Test nach ausdrücklicher Deployment-Freigabe bestanden
    ist;
12. Restrisiken und Gate-Entscheidung im Decision Log stehen.

## 15. Kommerzielle Grenze

`AKTUELLER STATUS`

- Eigengebrauch v57.60.1: produktiv getestet.
- Read-only MEXC-Vorschau: technisch funktionsfähig.
- MEXC-Journalimport: NO-GO bis G0–G6 bestanden sind.
- Pilot mit externen Nutzern: NO-GO bis zusätzlich Restore, Datenschutzprozesse,
  Supportmodell und Pilotmetriken belegt sind.
- Kundenvertrieb/White-Label/Unternehmenskauf: NO-GO; dafür fehlen weiterhin
  rechtliche, operative, wirtschaftliche und reale Kohortenevidenz.

Vor einem externen Pilot existiert zusätzlich ein genehmigter Pilotvertrag mit
ICP, Teilnehmerzahl, Laufzeit, erlaubten Daten, Supportkanal, Reaktionsmodell,
Incident-/Widerrufsprozess und Abbruchkriterien. Zielwerte werden vor Beginn
festgelegt, mindestens für Abrufvollständigkeit, Reconciliation-Abdeckung,
ungeklärte Kandidaten, Journal-Duplikate, Import-/Revert-Fehler, Zeit bis zum
ersten validierten Import, Supportaufwand sowie Export-/Löschdurchlauf. Ein
erfolgreicher interner Test ersetzt diese externe Pilot-Evidenz nicht.

## 16. Versions- und Branch-Hinweis

Der Worktree heißt bereits `v57.61.0`, basiert aber unverändert auf dem
Produktcode v57.60.1. Deshalb stehen in `package.json`, README und UI zu Beginn
noch v57.60.1-Werte. Das ist absichtlich kein verdeckter Versionsumbau.

Der Versionsbump auf v57.61.0 erfolgt als eigener überprüfbarer Change zusammen
mit konsistentem `package-lock.json`, Release-Dokumentation und Tests. Der Branch
trackt zunächst `origin/main`; er wurde zum Zeitpunkt dieser Übergabe nicht zu
GitHub gepusht.

Die Übergabedatei bildet nach A2/A3/A4/A5/A6-Review den einzigen lokalen
Docs-only-Setup-Commit. Der neue Task prüft diesen Commit zunächst gegen
Baseline und Scope. Ein Push benötigt weiterhin die ausdrückliche
Nutzerfreigabe.

## 17. Offene Produktentscheidungen vor Implementierung

Diese Entscheidungen sind fachlich vorzubereiten und im Decision Log zu
dokumentieren; fehlende Antworten dürfen nicht durch stille Defaults ersetzt
werden:

1. Definiert Equora einen Journal-Trade als Position Cycle, abgeschlossene
   Brokerorder oder nutzerbestätigten Ausführungscluster?
2. Wie werden Hedge Mode, parallele Long-/Short-Positionen und Reversals bei
   MEXC unterschieden?
3. Welche Gebühren-, Funding- und Währungsfelder liefert MEXC je Endpoint
   verbindlich, und wie werden fehlende Werte behandelt?
4. Welcher historische Zeitraum soll der initiale Backfill abdecken?
5. Welche dokumentierten PnL-Toleranzen sind wegen Rundung akzeptabel?
6. Welche manuellen Felder darf ein Reimport aktualisieren, ohne
   Nutzeranreicherungen zu überschreiben?
7. Welche Daten werden beim Entfernen einer Brokerverbindung gelöscht,
   aufbewahrt oder anonymisiert?
8. Welche MEXC-Endpunkte und Felder liefern die für `contractSize`, Position,
   Fee-Währung und Funding benötigte belastbare Historie?
9. Wie wird der globale Credential-Master-Key rotiert und wiederhergestellt,
   ohne bestehende Verbindungen unlesbar zu machen?

## 18. Startbefehle für den neuen Task – zunächst read-only

```powershell
Set-Location "C:\Users\matth\Desktop\Trading Journal\product\Equora Starter v57.61.0"

git branch --show-current
git status -sb
git rev-parse HEAD
git log -1 --oneline
git worktree list

Get-Content ".\docs\handoff\EQUORA_v57.61.0_MEXC_IMPORT_HANDOFF.md"
```

Falls Codex wegen unterschiedlicher Windows-Dateibesitzrechte `dubious
ownership` meldet, wird `safe.directory` nur für den jeweiligen Git-Befehl über
`git -c safe.directory='C:/Users/matth/Desktop/Trading Journal/product/Equora Starter v57.61.0' ...`
gesetzt. Keine globale Git-Ausnahme anlegen.

Erst nach bestätigtem Baseline-Gate:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run release:check
npm.cmd run build
```

## 19. Empfohlene erste Nachricht im neuen Codex-Task

> Arbeite im Ordner `C:\Users\matth\Desktop\Trading Journal\product\Equora Starter v57.61.0`. Lies zuerst vollständig die übergeordnete `AGENTS.md` und `docs\handoff\EQUORA_v57.61.0_MEXC_IMPORT_HANDOFF.md`. Prüfe anschließend den Baseline-Stand ausschließlich read-only und bestätige Branch, Commit, Arbeitsbaum, Scope, offene P1-Importblocker und Agentenrouting. Beginne noch nicht mit Änderungen. Lege danach den phasenweisen Plan für G0 bis G6 vor und halte automatischen Import, Tradingrechte, Push, Deployment und Produktions-SQL gesperrt, bis die jeweiligen Gates und meine ausdrückliche Freigabe vorliegen.

## 20. Initiale Entscheidungen

| ID | Datum | Entscheidung | Begründung |
|---|---|---|---|
| DEC-5761-001 | 2026-08-04 | v57.60.1 bleibt unveränderte Produktionsbasis. | Produktionsfunktion und Rollback-Basis dürfen nicht mit Entwicklungsarbeit vermischt werden. |
| DEC-5761-002 | 2026-08-04 | v57.61.0 wird als isolierter Git-Worktree auf eigenem Feature-Branch entwickelt. | Saubere Diffs, getrennte Arbeitsbäume und kontrollierbare Integration. |
| DEC-5761-003 | 2026-08-04 | Read-only Vorschau bleibt aktiv; Journalimport bleibt bis G0–G6 gesperrt. | Rohdaten-Deduplizierung ist belegt, fachliche Reconciliation noch nicht. |
| DEC-5761-004 | 2026-08-04 | Human Approval bleibt zwingend. | Finanzdaten dürfen nicht aufgrund unklarer automatischer Zuordnung verändert werden. |
| DEC-5761-005 | 2026-08-04 | Kein Secret wird in den neuen Worktree kopiert. | Minimierung von Offenlegungs-, Commit- und Release-Risiken. |

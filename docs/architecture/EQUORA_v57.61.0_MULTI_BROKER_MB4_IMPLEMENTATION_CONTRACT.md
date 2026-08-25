# Equora v57.61.0 – MB4 providerneutraler Connection-UI-Vertrag

Stand: 2026-08-23
Branch: `codex/multibroker-mb4-v57.61.0`
Feste Basis: `origin/main` bei `4f6bcc77d1843f1e05e26faf085c19c3e1f40f16`

## 1. Entscheidung und Scope

MB4 baut ausschließlich die lokale, providerneutrale Connection-Oberfläche auf der bereits freigegebenen MB3-Grundlage. Die Phase fügt keinen zweiten Provider hinzu und erweitert keine Runtime-, Netzwerk-, Credential-, Capture- oder Import-Authority.

Gebaut werden:

1. eine generische Providerübersicht;
2. eine generische Übersicht gespeicherter Connections;
3. ein ausschließlich client-sicheres Connection-DTO an der React-Server-Component-Grenze;
4. getrennte, providerspezifische MEXC-Setupfelder;
5. getrennte Anzeigen für technischen Leseerfolg, Nutzerattestierung, Permission-Evidenz, Kontoidentität und historische Coverage;
6. display-only Verhalten der normalen Connection-UI für unbekannte Provider-, Environment- und Statuswerte;
7. ein ausschließlich in Development und nur über den exakten Wert `EQUORA_MB4_REVIEW_FIXTURE=local_only` erreichbarer synthetischer Reviewzustand;
8. statische, testbasierte und browserseitige Regressionsevidenz mit Hashbindung.

Nicht gebaut oder freigegeben werden:

- kein zweiter Provider;
- kein Provider-Plugin- oder dynamischer Component-Loader;
- keine neue Brokerroute und kein neuer Netzwerktransport;
- keine neue Credential-Persistenz;
- kein automatischer Capturelauf und kein Journalimport;
- keine Runtime-Aktivierung;
- keine Supabase-Migration oder Production-Schreibaktion;
- kein visueller Redesign-Track; Equora-Schwarz/Gold bleibt unverändert;
- kein Staging, Commit, Push, PR, Merge oder Deployment durch dieses lokale Gate.

## 2. Provider- und Component-Grenze

`BROKER_PROVIDER_PRESENTATIONS` ist eine Präsentations-Allowlist, keine Authority-Registry. Sie enthält in MB4 genau einen gebauten Eintrag: MEXC Futures. Der Eintrag beschreibt ausschließlich Anzeige, Setup-Komponententyp und die begrenzte GET-only-Lesegrenze.

Die generische `BrokerConnectionPanel`-Komponente:

- erhält keine API Keys, Secrets oder Credential References;
- erzeugt kein sendefähiges Providerrequestobjekt;
- kennt nur client-sichere Connection-Summaries;
- rendert providerspezifische Setupfelder nur über eine geschlossene, statische Auswahl;
- zeigt Actions ausschließlich für MEXC, `live` und die explizit erlaubten Statuswerte `ready`, `paused` oder `error`;
- zeigt bei unbekanntem Provider, Environment oder Status keine normalen Connection-Actions; diese Aussage gilt für die UI-Allowlist und behauptet keine zusätzliche Autorisierungssperre der unveränderten Widerrufs-Server-Action;
- stellt MEXC nicht als Beleg für eine bereits gebaute Multi-Provider-Runtime dar.

`MexcConnectionSetup` ist die einzige MB4-Clientkomponente, die API Key und Secret als kurzlebigen React-State annimmt. Sie nutzt die bestehende Server Action. Sie schreibt Credentialwerte weder in URL, Browser-Storage noch Console. Bei erfolgreicher Antwort werden API Key und Secret aus dem Component-State geleert. Die Nutzerattestierung zu deaktivierten Provider-Schreibrechten ist bei einem verfügbaren Formular ein technisch erforderliches Kontrollfeld, bleibt aber ausdrücklich eine Attestierung und keine Providerprüfung.

## 3. React-Server-Component- und Datengrenze

Rohzeilen aus `broker_connections` dürfen nicht an Client Components serialisiert werden. `projectBrokerConnectionSummary` projiziert ausschließlich:

- Connection-ID;
- normalisierten Providercode;
- begrenztes Accountlabel;
- geschlossene Environment- und Statuswerte;
- getrennte, grobe Evidenzzustände;
- Zeitpunkt des letzten über eine unveränderliche Aktivierung gebundenen, abgeschlossenen oder teilweise abgeschlossenen Capturelaufs;
- ein Bool, ob ein serverseitiger Fehler vorliegt.

Ausdrücklich nicht clientseitig serialisiert werden:

- `user_id` oder andere Tenantdaten;
- `credential_reference` oder verschlüsselte Credentialpayloads;
- rohe Providerfehler, Payloadwerte oder Stacktraces;
- brokerseitige Account-IDs;
- vollständige Permission- oder Requestobjekte.

Providerwerte müssen dem Muster `^[a-z][a-z0-9_]{0,31}$` entsprechen. Ungültige Werte werden zu `unknown`. Unbekannte Environments und Statuswerte werden ebenfalls zu `unknown`; sie dürfen keine neue normale UI-Action erzeugen. `runtimeMode` (`off`, `probe`, `capture`) und `runtimeEnabled` werden getrennt von `connectorReady` projiziert, damit fehlender Secure Store, fehlende Keys und Runtime-off nicht als derselbe Zustand ausgegeben werden.

## 4. Evidenzzustände und Claims

Die UI hält folgende Aussagen getrennt:

| Zustand | Zulässige Aussage | Nicht zulässige Aussage |
| --- | --- | --- |
| Technischer Leseerfolg | Ein begrenzter Legacy-Leseabruf wurde beobachtet oder nicht dauerhaft gespeichert. | Alle Endpunkte oder die gesamte Historie funktionieren. |
| Read-only-Attestierung | Der Nutzer hat eingeschränkte Providerrechte bestätigt oder nicht bestätigt. | Der Provider hat sämtliche Rechte technisch verifiziert. |
| Permission-Evidenz | Begrenzte Leseevidenz liegt vor oder wurde nicht persistiert. | Trading, Transfer und Auszahlung seien global technisch ausgeschlossen. |
| Kontoidentität | Eine pseudonyme serverseitige Bindung existiert oder ist nicht sichtbar. | Eine reale Kontoinhaberschaft sei verifiziert. |
| Historische Coverage | Ein qualifizierter Capturelauf wurde beobachtet, in den verfügbaren Laufdaten nicht beobachtet oder die Evidenz ist derzeit nicht verfügbar. | Die Historie sei vollständig oder ein nicht beobachteter Lauf existiere sicher nicht. |

`broker_connections.last_sync_at` ist Legacy-Probe-Metadatum und ausdrücklich keine Capture-Evidenz. Historische Coverage und letzter Capturezeitpunkt werden ausschließlich über die unveränderliche Kette `broker_capture_runs.sync_activation_id -> broker_sync_activations.connection_account_id -> broker_connection_accounts.connection_id` abgeleitet. Die beiden historischen Relationstabellen werden UUID-keyset-paginiert, stabil nach `id` sortiert und auf jeder Seite mit einem exakten Restcount geprüft. Eine abschließende Wiederholung der ersten Count-/ID-Seite bindet die Completeness-Verifikation; Countdrift, Trunkierung, ungültige Reihenfolge oder Überschreitung des 500-Seiten-Budgets verwirft sämtliche partiellen Relationsdaten und projiziert Coverage fail-closed als `unavailable`. Rebinding, Superseding oder Revocation dürfen einen älteren Lauf nicht nachträglich einer aktuellen Connection zuordnen. Pro Connection werden alle vollständig gelesenen Aktivierungs-IDs in begrenzten 50er-Chunks abgefragt, pro Chunk nur der neueste `completed`- oder `partial`-Lauf mit gültigem `completed_at` übernommen und anschließend das Maximum über die Chunks gebildet. Diese Capture-Abfragen laufen mit höchstens drei gleichzeitigen Requests. Der separate globale Fünfer-Slice bleibt ausschließlich die Liste „Letzte Prüfungen“ und ist keine Connection-Coverage-Evidenz. Jeder Relations- oder Capture-Lesefehler wird als `unavailable`, nicht als Nichtvorhandensein, projiziert.

Ein Connectionstatus `ready` bedeutet weiterhin nicht automatisch, dass alle technischen Rechte oder die gesamte Historie geprüft wurden. App-Funktion, Nutzerattestierung und Providerrechte werden in der Oberfläche getrennt dargestellt. Aussagen zur Protokollierung sind auf bewusstes Schreiben durch diese App in Client-Logs, URLs und Browser-Storage begrenzt; externe Provider- und Plattform-Logs sind nicht als vollständig auditiert behauptet.

## 5. Bestehende Server-Authority und lokale Review-Fixture

MB4 ändert `app/actions/broker-sync.ts`, Runtime-Control, Egress-Transport, Credential-Store und Datenbankschema nicht.

Die vorhandenen Grenzen gelten fort:

- `EQUORA_MEXC_RUNTIME_MODE=off` sperrt MEXC-Requests;
- der Verbindungsprobe ist nur bei bereits aktivierter, separat autorisierter Runtime möglich;
- „Ansicht aktualisieren“ liest die lokale Journalansicht und löst keinen Schedulerlauf oder Brokerrequest aus;
- Widerruf bleibt eine explizite Nutzeraktion über den bestehenden atomaren Serverpfad;
- ein fehlgeschlagener Probe aktiviert weder Connection, Credential, Enrollment, Work Unit, Capture noch Import;
- Capture und Import benötigen weiterhin eigene konkrete Freigaben.

Die lokale Review-Fixture:

- ist nur bei `NODE_ENV=development` und exakt `EQUORA_MB4_REVIEW_FIXTURE=local_only` aktiv;
- liefert ausschließlich synthetische, secret-freie und client-sichere Zustände;
- wird vor Supabase-Zugriff ausgewählt und löst keinen Netzwerk- oder Brokerzugriff aus;
- wird vom Gate-Runner bereits vor dem ersten Gate als unzulässige Einflussvariable abgewiesen;
- ist in Production fail-closed und erzeugt dort keine Daten.

Dieser Implementierungsvertrag autorisiert keine Ausführung der Serverpfade gegen Production.

## 6. Accessibility-, Responsive- und UX-Mindestgrenze

MB4 verlangt:

- semantische Buttons und Formcontrols;
- sichtbare `focus-visible`-Zustände;
- Labels, Fieldset/Legend und zugeordnete Hilfetexte;
- `aria-pressed` für die Providerauswahl;
- `aria-live` mit `status` beziehungsweise `alert` für Feedback;
- Statusaussagen zusätzlich als Text, nicht ausschließlich über Farbe;
- verständliche Disabled-Erklärung bei fehlender Runtime oder Secure-Store-Grundlage;
- Textkontrast von mindestens 4,5:1 für die geprüften kleinen MB4-Texte;
- keine horizontale Seitenüberbreite bei 390 CSS-Pixeln.

Die gebundene lokale Browserprüfung nutzt synthetische Demo-Daten, die eingebauten Demo-Fallbacks ohne gesetzte Supabase-Variablen und Runtime-off. Der lokale Next.js-Development-Server wird vor Start mit `NEXT_TELEMETRY_DISABLED=1`, `CI=1` und `NO_UPDATE_NOTIFIER=1` gegen Framework-Telemetrie und Updatechecks gesperrt; Browser- und Serverbeobachtung binden ausschließlich `http://127.0.0.1:3001` als Request-Origin. Der beobachtete lokale `POST /api/performance` schreibt im Developmentmodus ohne Supabase-Variablen ausschließlich in den prozesslokalen In-Memory-Diagnosespeicher; lokale Bicubik-Fontrequests liefern mangels lizenzierter Release-Datei 404, sodass die gebundenen Messungen die konfigurierte Fallback-Typografie abbilden. Das Artefakt dokumentiert ein manuell begrenzt reproduzierbares, geordnetes Verfahren, aber behauptet keine byteidentische Screenshot-Neuerzeugung. Es bindet feste Viewports, exakte Scrollpositionen, drei Connectionzustände einschließlich unbekannter Werte, Action-Allowlist, deaktivierte Credentialcontrols, den vor Enter bestätigten Browser-Locator-Fokus ohne Behauptung einer Tab-Traversierung, ehrliches Single-Provider-No-op-Verhalten, Textstatus, gerenderte Kontrastwerte sowie Anwendungs-Console. Drei JPEGs werden mit Bildbytes, SHA-256 und Base64 direkt im Browser-Artefakt gebunden: Desktop first viewport, Mobile first viewport bei `scrollY=0` und separat der als gescrollt bezeichnete MB4-Zielbereich. Die Browseroberfläche kodiert dabei 1268×713 Pixel für die 1280×720-Desktopvorgabe und 378×818 Pixel für die 390×844-Mobilevorgabe; Viewport- und tatsächliche JPEG-Dimensionen werden deshalb getrennt gebunden. Der Validator verlangt SOI, terminales EOI, genau ein plausibles SOF-Dimensionssegment, Scanpayload sowie Übereinstimmung mit den separat gebundenen JPEG-Dimensionen. Damit wurden keine Production-, Supabase- oder Brokeraktionen ausgelöst. Der frühere v2-Claim ohne gebundenes `NEXT_TELEMETRY_DISABLED=1` gilt ausdrücklich als nicht bewiesen und wird nur append-only als ersetzter Evidenzstand erhalten.

Bei 390 × 844 zeigt der tatsächliche erste Viewport aufgrund der bestehenden gestapelten App-Navigation noch nicht die MB4-Überschrift. Das Artefakt behauptet das nicht als Zielansicht, sondern bindet zusätzlich eine getrennt benannte Zielbereichsaufnahme bei der exakten Scrollposition. Diese Beobachtung ist kein Beleg für einen modernen Mobile-Shell-Entwurf; dessen Neugestaltung bleibt außerhalb von MB4.

## 7. Geschlossener Kandidatenscope

Der MB4-Scope umfasst genau diese 20 Pfade:

1. `components/broker-sync/broker-connection-panel.tsx`
2. `components/broker-sync/broker-sync-hub.tsx`
3. `components/broker-sync/mexc-connection-panel.tsx` (gelöscht)
4. `components/broker-sync/providers/mexc-connection-setup.tsx`
5. `components/layout/app-shell.tsx`
6. `docs/architecture/EQUORA_v57.61.0_MULTI_BROKER_MB4_IMPLEMENTATION_CONTRACT.md`
7. `docs/gates/EQUORA_v57.61.0_MULTI_BROKER_MB4_BROWSER_ARTIFACT.json`
8. `docs/gates/EQUORA_v57.61.0_MULTI_BROKER_MB4_EVIDENCE.json`
9. `docs/gates/EQUORA_v57.61.0_MULTI_BROKER_MB4_GATE_ARTIFACT.json`
10. `docs/gates/EQUORA_v57.61.0_MULTI_BROKER_MB4_MANIFEST.sha256`
11. `lib/server/broker-connection-view.ts`
12. `lib/server/broker-sync-review-fixture.ts`
13. `lib/server/broker-sync.ts`
14. `lib/types/broker-sync.ts`
15. `scripts/multibroker-mb4-validation-lib.mjs`
16. `scripts/run-multibroker-mb4-gates.mjs`
17. `scripts/validate-multibroker-mb4-manifest.mjs`
18. `tests/application-contracts.test.ts`
19. `tests/broker-connection-view.test.ts`
20. `tests/multibroker-mb4-validator.test.mjs`

Das Manifest bindet die 18 lebenden Eingabepfade. Das Manifest selbst wird nicht rekursiv gehasht; der gelöschte Pfad hat keine Bytefolge. Jede Manifestdatei muss während eines stabilen, symlink- und junctionfreien Regular-File-Reads gelesen werden und strikt gültiges UTF-8 ohne BOM enthalten. CRLF und CR werden vor Hash und Bytezahl zu LF normalisiert.

## 8. Lokale Gates und Artefaktbindung

Der gebundene Snapshot muss folgende Gates bestehen:

1. sechs gezielte Vertrags-, View-, Validator-, Runtime-Control-, Egress- und Probe-Testdateien;
2. Typecheck;
3. vollständiger Testsatz mit einem Worker, damit das unveränderte 5-Sekunden-Einzeltestlimit nicht durch parallele Git-/Dateisystemkonkurrenz verfälscht wird;
4. Release-Check;
5. lokaler Next.js-Produktions-Build;
6. hash-gebundene Browserprüfung der Runtime-off-Reviewansicht;
7. MB4-Manifest-/Scope-/Secret-/Claim-/Artefakt-Validator;
8. `git diff --check`;
9. unabhängige A3-, A4- und A5-Reviews desselben Manifeststands.

Die fünf ausführbaren Hauptgates werden mit exakter Commandline, Start- und Endzeit, Exitcode, kanonischem Transcript, Transcript-Hash und einem 16-Pfade-Eingangssnapshot im Gate-Artefakt gebunden. Sie laufen direkt über die aufgezeichneten JavaScript-Einstiegspunkte von Vitest, TypeScript, Release-Check und Next.js unter dem gebundenen Node-Executable; der npm-Launcher wird nicht ausgeführt. Vor und nach jedem Gate müssen Node-Executable, unmittelbarer Gate-Einstiegspunkt, `package-lock.json` und der 16-Pfade-Eingangssnapshot stabil bleiben. Zusätzlich bindet das Gate-Artefakt Betriebssystem/Architektur, die unmittelbaren Gate-Einstiegspunkte, die tatsächliche Git-Core-Binary, Git-Version und `package-lock.json` sowie eine minimale Umgebungs-Allowlist und erzwungene Runtime-off-/No-color-/No-telemetry-Werte. Gate-beeinflussende Variablen und ladbare `.env`-Dateien werden vor Ausführung abgewiesen; der Eltern-`PATH` und `node_modules/.bin` werden nicht übernommen.

Diese Bindung behauptet ausdrücklich keine vollständige Toolchain-Closure: transitive installierte `node_modules`-Implementierungsdateien, vom Betriebssystem geladene Bibliotheken und Git-Helper außerhalb der Git-Core-Binary bleiben benannte externe lokale Trust-Anker. `package-lock.json` bindet Auflösungsmetadaten, beweist aber nicht die installierten Bytes. Die Git-Abfragen des Validators sind auf die eingebauten Befehle `rev-parse`, `diff` und `ls-files` sowie `--version` begrenzt und laufen über die absolute Git-Core-Binary in einer eigenen Minimalumgebung; die Binary wird vor und nach jedem Aufruf stabil gelesen. Bei getrennten Datei- und Sandboxbesitzer-SIDs wird nur der exakt aufgelöste aktuelle Workspace pro Git-Aufruf als `safe.directory` gebunden; eine globale Ausnahme wird nicht geschrieben. Die Git-EOL-Regel ist pro Aufruf explizit gebunden (`core.autocrlf=true` auf Windows, `core.autocrlf=input` auf anderen Plattformen), damit `diff --check` CRLF-Checkouts reproduzierbar als Text und nicht als nachgestellte CR-Zeichen bewertet wird.

Stdout und Stderr werden zunächst als Bytes erfasst. Ungültiges UTF-8 und ein UTF-8-BOM werden vor jeder Textkanonisierung abgewiesen; anschließend werden Zeilenenden normalisiert und alle C0-/C1-/CSI-/OSC-Steuerzeichen außer TAB und LF verworfen. Der Offline-Secret-Scanner kombiniert formatspezifische Tokenmuster mit normalisierten Credential-Schlüsseln, rekursivem JSON-Key-/Value-Scanning einschließlich dekodierter Unicode-Escapes und einem fail-closed Tiefen-/Knotenbudget. Sensitiver Kontext eines Credential-, Plural- oder Keyring-Schlüssels wird an sämtliche Objekt- und Array-Nachkommen vererbt. Bei Zuweisungen wird der vollständige begrenzte RHS-Ausdruck einschließlich ein- und mehrzeiliger `||`-, `??`- und ternärer Alternativen sowie `||=`- und `??=`-Zuweisungen auf harte Werte geprüft; nur ein ausschließlich referenzieller RHS bleibt benign. Der begrenzte RHS-Lexer trennt Strings, einzelne statische Template-Quasis und rekursiv begrenzte Template-Interpolationen von Kommentarzeichen und erhält die Grenzen zwischen den Quasis. Ausschließlich nichtalphanumerische Quasis gelten als Separatoren und werden nicht akkumuliert. Jedes statische Quasi mit mindestens einem Buchstaben oder einer Ziffer wird dagegen mit seinen vollständigen Originalzeichen akkumuliert; erst der verbundene Gesamtkandidat wird einmal äußerlich getrimmt und ab dann insgesamt 24 Zeichen konsistent zum String-Literal als harter Wert behandelt. Interne Whitespacezeichen an Quasi-Grenzen bleiben dabei erhalten. Diese deterministische Policy unterscheidet nicht semantisch zwischen Label und Credential: Lange oder wiederholte alphanumerische Labels können das lokale Gate konservativ auslösen. Der Scanner ist deshalb kein semantischer Beweis vollständiger Secretfreiheit. Mehrere ausschließlich referenzielle Interpolationen ohne alphanumerisches statisches Material bleiben benign; formatierte harte Templateanteile und harte Fallbacks innerhalb verschachtelter Interpolationen werden fail-closed erkannt. Der Lexer erhält Verschachtelungs- und Operatorzustand über Leerzeilen, `//`-Kommentare und mehrzeilige `/* ... */`-Kommentare hinweg und entfernt Kommentarinhalt vor der Secretwertprüfung. Der Scanner deckt insbesondere projektspezifische Präfixe, `apiSecret`, `accessKey`, Singular-/Plural- und Keyringformen ab, ohne reine Runtime-Referenzen als eingebettete Secretwerte auszugeben. Der Validator prüft geschlossene Schemas, Kandidatenscope, den durch Git-Core gemeldeten Git-Scope unter den genannten Trust-Annahmen, Manifest, Browser- und Gate-Artefakte, JPEG-Struktur und -Dimensionen, Screenshotbytes, Transcript-Hashes, monotone Artefaktchronologie `Browser <= Gate <= Evidence`, append-only Contract-/Evidence-Reviewhistorie, Claims und Runtime-off.

`npm audit` ist nicht Bestandteil des lokalen MB4-PASS-Claims. Der Aufruf würde Dependency-Metadaten an eine externe Advisory-API übertragen und benötigt eine eigene konkrete Netzwerkfreigabe.

## 9. Review- und Freigabegrenze

Der erste A3/A4/A5-Review des 13-Pfade-Snapshots und der spätere gemeinsame Review des 18-Input-Manifests `0fc0d3dd2889c3b03e943d5fb3a9a6271aaacdb68d2a12fad579fff3d1e85578` endeten jeweils mit NO-PASS. Beim nachfolgenden 18-Input-Manifest `4cd3811d960dff8fb5b4fefa6e3dd8d2a7d01270eeaa3be62059f8c41e074593` bestanden A3 und A5; A4 erteilte wegen unvollständiger projektspezifischer Secret-Erkennung und eines überstarken Toolchain-Closure-Claims NO-PASS. Beim darauf folgenden 18-Input-Manifest `8de29258c85a058cccd22f5f0d097070f14e0d534739c8ea3e1ad63de453975a` bestanden A3 und A5; A4 erteilte wegen fehlender Vererbung sensitiver JSON-Containerkontexte und unvollständiger Erkennung hart codierter RHS-Fallbacks NO-PASS. Beim anschließend geprüften 18-Input-Manifest `2a6d53989f4baf97b648793c66d2c70379d0fdc6e92638c1ae1b2ee82b300a67` bestand A5; A3 erteilte wegen einer unvollständigen Contract-/Evidence-Reviewhistorie und A4 wegen umgehbarer mehrzeiliger beziehungsweise Compound-RHS-Fallbacks NO-PASS. Beim danach geprüften 18-Input-Manifest `f469c24da5aabbe40d184189781a1cae9d5e9ecb3b9d9c2a4e23b1753b731fdf` bestanden A3 und A5; A4 erteilte wegen eines umgehbaren mehrzeiligen Blockkommentars im RHS-Secret-Scan NO-PASS. Beim anschließend geprüften 18-Input-Manifest `25b1107ba0614e6ce658a17a9c1be297896876b656a8b327d0ec9199393e883d` bestanden A3 und A5; A4 erteilte wegen eines False Positive bei ausschließlich referenziellen Templates mit mehreren Interpolationen NO-PASS. Beim danach geprüften 18-Input-Manifest `a9f015686df07a893b55096ed1ec277802fecfc2d4dd9a58c3ca5011721dd451` bestanden A3 und A5; A4 erteilte wegen eines False Negative bei formatierten harten Template-Literalen und eines gegenläufigen False Positive bei wiederholten Separator-Quasis NO-PASS. Beim anschließend geprüften 18-Input-Manifest `ccb022ac20b4714bc0d3b2296864bfe2da7dc0d4e8e2094de62374cf2e6dfe2b` bestand A5; A3 und A4 erteilten wegen eines unerkannten rein alphabetischen Hard-Literal-Splits und eines gegenläufigen False Positive bei alphanumerischen Label-Quasis NO-PASS. Beim danach geprüften 18-Input-Manifest `b43e3d172fb47ed55b806ffe84678ff7017adcfc8caf5b6ca495d7b090025b66` bestand A5; A3 und A4 erteilten wegen der pro-Quasi-Trimmmung interner Whitespacezeichen entgegen dem Verbatim- und String-/Template-Konsistenz-Claim NO-PASS. Alle zehn Befundstände werden append-only in der Evidence als Ausgangspunkt der begrenzten Remediationen dokumentiert.

Die maschinengeprüfte append-only Bindung zwischen Vertrag und Evidence lautet:

- `review_history:initial;result=no_pass_with_open_p2_findings;manifest=unbound_initial_13_path_snapshot;reviewers=A3,A4,A5`
- `review_history:prior;result=no_pass_with_four_open_p2_findings;manifest=0fc0d3dd2889c3b03e943d5fb3a9a6271aaacdb68d2a12fad579fff3d1e85578;reviewers=A3,A4,A5`
- `review_history:latest;result=no_pass_with_two_open_p2_findings;manifest=4cd3811d960dff8fb5b4fefa6e3dd8d2a7d01270eeaa3be62059f8c41e074593;reviewers=A3:pass,A4:no-pass,A5:pass`
- `review_history:fourth;result=no_pass_with_one_open_p2_finding;manifest=8de29258c85a058cccd22f5f0d097070f14e0d534739c8ea3e1ad63de453975a;reviewers=A3:pass,A4:no-pass,A5:pass`
- `review_history:fifth;result=no_pass_with_two_open_p2_findings;manifest=2a6d53989f4baf97b648793c66d2c70379d0fdc6e92638c1ae1b2ee82b300a67;reviewers=A3:no-pass,A4:no-pass,A5:pass`
- `review_history:sixth;result=no_pass_with_one_open_p2_finding;manifest=f469c24da5aabbe40d184189781a1cae9d5e9ecb3b9d9c2a4e23b1753b731fdf;reviewers=A3:pass,A4:no-pass,A5:pass`
- `review_history:seventh;result=no_pass_with_one_open_p2_finding;manifest=25b1107ba0614e6ce658a17a9c1be297896876b656a8b327d0ec9199393e883d;reviewers=A3:pass,A4:no-pass,A5:pass`
- `review_history:eighth;result=no_pass_with_two_open_p2_findings;manifest=a9f015686df07a893b55096ed1ec277802fecfc2d4dd9a58c3ca5011721dd451;reviewers=A3:pass,A4:no-pass,A5:pass`
- `review_history:ninth;result=no_pass_with_two_open_p2_findings;manifest=ccb022ac20b4714bc0d3b2296864bfe2da7dc0d4e8e2094de62374cf2e6dfe2b;reviewers=A3:no-pass,A4:no-pass,A5:pass`
- `review_history:tenth;result=no_pass_with_one_open_p2_finding;manifest=b43e3d172fb47ed55b806ffe84678ff7017adcfc8caf5b6ca495d7b090025b66;reviewers=A3:no-pass,A4:no-pass,A5:pass`
- `review_history:eleventh;result=no_pass_with_one_open_p2_finding;manifest=b11c716c1003af1640264dbc357e1008b0f3a66656fc5861255ad25a0dcb653f;reviewers=A3:pass,A4:no-pass,A5:pass`
- `review_history:twelfth;result=no_pass_with_one_open_p2_finding;manifest=7858366a1fd394103f6cbd5662e4097cc1d0f878ccc27db3ad38c7b1b103460d;reviewers=A3:no-pass,A4:pass,A5:pass`

Der gemeinsame A3/A4/A5-Review des Pending-Manifests `b668a3d8d54a4e3ca384ae249ea59909c75ac3202116c64237951c34bade72ae` endete ohne offene P0-, P1- oder P2-Befunde. Der anschließende Staging-Preflight der mechanisch geschlossenen Fassung `4b0087c289c8056ccf80b6f2cd288fbae8f9e52d7c20f01ab042bf1d3fc813d6` fand jedoch zwei nachgestellte Leerzeichen in dieser zuvor ungetrackten Vertragsdatei. Das Staging wurde ohne Commit vollständig zurückgenommen. Remediation 12 entfernt die Zeichen und prüft nun jeden Manifestinput unmittelbar auf nachgestellte Leerzeichen oder TABs, weil `git diff --check` ungetrackte Kandidatendateien vor dem Staging nicht erfasst.

Beim nachfolgenden A3/A4/A5-Review des Pending-Manifests `b11c716c1003af1640264dbc357e1008b0f3a66656fc5861255ad25a0dcb653f` bestanden A3 und A5; A4 erteilte wegen eines mit C0-/ESC- beziehungsweise U+2028-/U+2029-Zeichen umgehbaren Whitespace-Direktchecks NO-PASS. Remediation 13 weist nun kategorisch Unicode-Steuer- und Formatzeichen sowie nicht-ASCII Zeilen-, Absatz- und Space-Separatoren vor Whitespace- und Secretprüfung fail-closed ab; aus diesen Kategorien bleiben nur normales SPACE, TAB und LF erlaubt.

Beim darauf folgenden A3/A4/A5-Review des Pending-Manifests `7858366a1fd394103f6cbd5662e4097cc1d0f878ccc27db3ad38c7b1b103460d` bestanden A4 und A5; A3 erteilte wegen des überstarken Rohinput-Claims NO-PASS, da CRLF und Bare CR vertragsgemäß vor der Source-Control-Prüfung zu LF kanonisiert werden. Remediation 14 grenzt den Claim ohne Implementierungsänderung exakt ein: Nach dieser CRLF-/Bare-CR-zu-LF-Kanonisierung werden alle verbleibenden Unicode-Zeichen der Kategorien Cc, Cf, Zl und Zp sowie alle nicht-ASCII-Zs abgewiesen; normales SPACE, TAB und LF bleiben erlaubt.

Die lokalen Gates belegen ausschließlich mechanische Konsistenz des neuen Kandidatensnapshots. MB4 bleibt `not_yet_passed`, bis A3, A4 und A5 exakt denselben neuen 18-Hash-Manifeststand unabhängig und ohne offene P0-, P1- oder P2-Befunde geprüft haben.

Auch ein späteres Review-PASS autorisiert nicht automatisch:

- Staging oder Commit;
- Push oder PR-Erstellung;
- Draft-zu-Ready;
- Squash-Merge oder Production-Deployment;
- Branchlöschung;
- Supabase-, MEXC-/Broker-, Credential-, Cron-, Capture- oder Importaktionen.

Jede dieser Aktionen bleibt ein separates, konkretes Gate. Der Branch wurde frisch von `origin/main` erstellt und darf erst nach einem möglichen Squash-Merge als historischer Branch behandelt, nicht für einen weiteren PR wiederverwendet werden.

# Betriebs-SOP – Equora Starter v57.61.0 MEXC Read-only Capture

## Harte Grenzen

- MEXC ist ausschließlich Datenquelle. Es existiert kein Order-, Cancel-,
  Close-, Transfer- oder Withdrawal-Transport.
- `off`, `probe` und `capture` sind getrennte Betriebszustände. Jede Änderung
  benötigt ein neues Deployment und einen dokumentierten Operator.
- Capture speichert autoritative Rohbeobachtungen. Es autorisiert weder einen
  Journalimport noch eine Strategie- oder Tradingentscheidung.
- Supabase-Service-Role, Broker-Keyring, Identity-Key, Integrity-Key und
  `CRON_SECRET` dürfen nie in Clientbundles, Logs oder Supporttickets erscheinen.

## Regelbetrieb

Der freizugebende Pro-Cron ruft den internen Endpoint alle fünf Minuten per
`GET` auf. Der Takt ist Verarbeitungskapazität; die Fast-Lane selbst bleibt auf
sechs Stunden terminiert. Ein Lauf verarbeitet höchstens eine Work Unit mit
maximal drei Seiten. Vor jedem Broker-GET wird eine kurzlebige, single-use
Request-Authorization erzeugt und vor Credentialzugriff erneut validiert. Pro
Account und Syncart hält die Datenbank genau einen Lease-Slot.
Mehrfachzustellung darf deshalb keine parallelen Brokerwirkungen oder doppelten
Page-Commits erzeugen. v57.61.0 wird zunächst nur für einen kontrollierten
Account mit höchstens fünf Symbolen freigegeben; mehrere Accounts benötigen
vorher eine gemessene Kapazitätsprüfung und gegebenenfalls einen Queue-/Worker-
Dispatcher.

Das Ein-Konto-Limit ist zusätzlich in
`equora_private.broker_capture_runtime_enrollment` serialisiert. Ohne eine
explizit aktivierte Enrollment-Zeile sind Setup und damit auch der vorgelagerte
GET-Probe gesperrt. Die Route hat 300 Sekunden Plattformbudget; neuer
Broker-Egress endet intern spätestens nach 210 Sekunden. Nach 240 Sekunden
startet die Runtime keine neue Page; bereits autorisierte Persistenz,
Finalisierung und Lease-Bereinigung dürfen bis zur 300-Sekunden-
Plattformgrenze kontrolliert abschließen.

Ein Request-Scope ist über mehrere Cronläufe auf exakt 20 Work Units und 100
Pages begrenzt. Sequenz 19 darf noch Sequenz 20 erzeugen. Erfordert Sequenz 20
eine weitere Continuation, entsteht kein Nachfolger: Die Work Unit endet
`partial_failed/scope_budget_exhausted`, und der Lauf muss als fachlich
fehlgeschlagen überwacht werden. Weil Sequenz 1 die Generation 0 besitzt, ist
die höchste zulässige `continuationGeneration` 19. Jedes Continuation-Ergebnis
enthält den obligatorischen booleschen Replay-Indikator `crossRequestReplay`.

Nach erfolgreichem Setup ist das Enrollment atomar an genau den erzeugten
Broker-Account gebunden. Runtime-Finder, Claim, Continuation, Permit,
Material-Loader und Finalisierung revalidieren diese exakte aktivierte Bindung.
Eine lease-freie
`yielded` Work Unit wird vor neuen Claims wieder aufgenommen. Ein nach
ungeklärtem Egress persistiertes `recovery_pending` wird erst nach Ablauf der
gebundenen Permitfrist plus Sicherheitsabstand und nur ohne passendes
Page-/Outcome-Receipt deterministisch auf `retry_pending` zurückgeführt.

Zu überwachen sind nur sanitierte Werte:

- HTTP-Status des Cron-Endpunkts und Laufdauer;
- `status`, `pagesCommitted`, `scopeFinalized`;
- Anzahl `yielded`, `retry_pending`, `recovery_pending`, offene Gaps und
  überfällige Lanes;
- Alter der ältesten noch nicht finalisierten terminalen Scope;
- MEXC-Fehlerklasse, niemals Responsebody oder Requestheader.

Vercel wiederholt fehlgeschlagene Cronläufe nicht automatisch. Der nächste
reguläre Lauf führt zuerst Lease-Recovery und liegengebliebene Scope-
Finalisierung aus. Manuelle Aufrufe dürfen nur mit dem Cron-Secret und nach
Incidentfreigabe erfolgen.

Der Cron-Endpunkt unterscheidet Transport- und Fachstatus: Ein ordnungsgemäß
beendeter, aber fachlich fehlgeschlagener Cycle antwortet bewusst HTTP 200 mit
`ok=false`, `code=capture_domain_failed` und sanitisiertem `failureCode`.
HTTP 500 bleibt unerwarteten Runtimeausnahmen vorbehalten. Monitoring darf
daher nicht allein den HTTP-Status auswerten.

## Migrationswiederanlauf

Nach einem SQL-Fehler zuerst den konkreten Fehler und alle vorhandenen Einträge
in `equora_private.schema_migrations` prüfen. Ein Teilstand mit ein bis fünf
v57.61.0-Markern darf nicht fortgesetzt werden: Er verlangt Restore der zuvor
geprüften v57.60.1-Baseline und einen vollständigen Neulauf. Nur bei bereits
vollständigen sechs exakten Markern darf der unveränderte Treiber erneut laufen
und alle Layer überspringen. Marker niemals manuell umschreiben.

Der Wiederanlauf muss erneut als eine `psql`-Sitzung mit
`preflight -> deploy -> postflight` erfolgen. Der Preflight akzeptiert nur null
v57.61.0-Marker auf exakter Baseline oder den vollständigen Sechs-Marker-Satz;
der Postflight revalidiert den
vollständigen semantischen Spalten-/Constraint-/Index-/RLS-/ACL-/Funktionsvertrag
auch für übersprungene Layer und erzwingt unveränderte Journal-Tradeanzahl.
Ohne Marker wird zusätzlich der vollständige semantische v57.60.1-
Baselinefingerprint vor jeder v57.61.0-DDL geprüft. Ein Marker beweist nur eine
frühere Anwendung; deshalb darf der globale Contract-Postflight bei keinem
Wiederanlauf ausgelassen werden.

## Credential- und Key-Lebenszyklus

### Broker-AES-Keyring

Neue Version in `EQUORA_BROKER_SECRET_KEYS` ergänzen, alte Version beibehalten,
`EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION` umschalten und neu deployen. Neue
Verbindungen nutzen danach die neue Version; bestehende Envelopes bleiben über
ihre gespeicherte Version lesbar. Eine alte Version darf erst entfernt werden,
wenn keine `broker_credentials.key_version` mehr darauf verweist. v57.61.0
enthält bewusst keinen automatischen Re-Encryption-Job.

### Broker-Identity-Key

Nicht in-place rotieren. Der HMAC-Digest ist Teil des Account-, Scope- und
Raw-Evidence-Grains. Eine Rotation benötigt eine neue kontrollierte Verbindung
und Activation-Generation; bestehende Evidenz bleibt an die alte Keyversion
gebunden.

### MEXC-Key

Bei MEXC zuerst einen neuen reinen `View Order Details`-Key anlegen und den
Probe-Modus verwenden. Alte Verbindung erst nach erfolgreichem Ersatz
widerrufen; danach den alten Key bei MEXC deaktivieren. Niemals vorübergehend
Order- oder Transferrechte aktivieren.

### Widerruf

Der UI-Widerruf ist audit-erhaltend: aktuelle Authority wird terminal revoked,
alle künftigen Claims/Permits scheitern, Connection- und Accountstatus werden
revoked und das gespeicherte Credential wird durch einen ungültigen Tombstone
ersetzt. Rohbeobachtungen und Journaldaten werden nicht gelöscht. Datenlöschung
und Auswertungs-Reset sind eigene, später freizugebende Funktionen.

## Incidentmatrix

| Ereignis | Sofortmaßnahme | Danach |
|---|---|---|
| Unbekannter Brokerrequest | Runtime `off`, Cron deaktivieren, Deployment | Logs/Allowlist/Secret-Canary sichern; P0 |
| MEXC meldet fehlende Leserechte | Verbindung widerrufen | Keyrechte bei MEXC korrigieren, neuer Probe |
| Credential-/Identity-Key vermutet kompromittiert | Runtime `off`, betroffene Verbindung widerrufen | kontrollierte Rotation, neue Activation |
| Wiederholte 429/5xx | Runtime nicht hochskalieren | Retry-/Gapstatus prüfen, Rate reduzieren |
| `yielded` bleibt über mehrere Cronläufe liegen | Runtime `off`, keinen manuellen Brokerrequest starten | Finder-/Continuation-Receipt und Account-Lease prüfen |
| `recovery_pending` bleibt über Permitfrist plus Sicherheitsabstand liegen | Runtime `off`, Egress nicht wiederholen | Request-Authorization, Page-Receipt und Outcome exakt abgleichen |
| Scope terminal, nicht finalisiert | keinen neuen Brokerabruf erzwingen | nächsten Recoverylauf prüfen |
| Supabase-ACL/RLS-Drift | Runtime `off`, Appzugriff begrenzen | Restore/Forward-Fix im Staging validieren |
| Falsche Journalauswertung | Journalauswertung sperren | Capture-Rohdaten unverändert lassen; A5 prüfen |

## Monatliche Kontrollen

- verwendete Keyversionen gegen Vercel-Keyring abgleichen;
- Restore eines aktuellen Backups in separatem Projekt testen;
- RLS, Tabellenowner, Function-Owner/GUC und exakte EXECUTE-ACL prüfen;
- Provider-Allowlist und MEXC-Dokumentationsänderungen prüfen;
- offene Gaps, Retentiongrenze und benötigte Account-Exports bewerten;
- Vercel-Plan, Cronfrequenz, Functiondauer und Logs-Aufbewahrung prüfen;
- erst nach fachlicher Reconciliation einen späteren Journalimport freigeben.

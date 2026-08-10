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

Hosted Supabase verwaltet `auth` selbst. Der Operator darf deshalb weder
Grant Options anfordern noch manuell `USAGE ON SCHEMA auth` oder `EXECUTE ON
auth.uid()` an Equoras Authority-Rolle vergeben. Der unterstützte Pfad ist der
private Adapter `equora_private.equora_request_context_uid_v1()`. Schlägt der
Preflight wegen Plattformowner, ACL, `auth.uid()` oder `auth.users(id)` fehl,
ist das ein hartes NO-GO vor DDL; keine Plattform-ACL wird als Workaround
verändert. Nach einem erfolgreichen Lauf müssen die im Preflight gebundenen
Auth-ACL-Digests im Postflight identisch sein.

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

## Restaurierter v57.60.1-Upgradepfad

Ein Restore gilt nur dann als migrationsfähig, wenn der markerfreie Preflight
exakt einen der beiden gepinnten v57.60.1-Baselinehashes meldet. Beim
Restoreprofil gelten zusätzliche harte Stopbedingungen:

- `trades.user_id is null` muss exakt null Zeilen liefern;
- `setups.name`, `setups.grade` und `setups.screenshot_url` dürfen, falls die
  Spalten existieren, keinen nichtleeren Wert enthalten;
- jeder weitere unbekannte Spalten-, Constraint-, Index-, Policy-, Trigger-,
  Funktions- oder ACL-Drift ist `NO-GO`;
- eine Default-ACL außerhalb der geschlossenen Objektart-/Privilegmatrix oder
  Schema-`CREATE` für `anon`, `authenticated` bzw. `service_role` ist `NO-GO`;
  geprüft werden globale Defaults sowie `public`, `equora_private` und
  `extensions`;
- der tatsächliche `pgcrypto`-Namespace muss `public` oder `extensions` sein;
  API-Rollen dürfen dort kein effektives `CREATE` besitzen; bei `extensions`
  sind zusätzlich `PUBLIC USAGE` und jedes effektive Schema-`USAGE` der
  Capture-Ownerrolle `NO-GO`;
- ein Abbruch in Layer 1 darf weder Marker noch Broker-Capture-Objekte
  hinterlassen.

Die Normalisierung ist transaktional und erzeugt keine Journal-Trades. Ein
fehlgeschlagener Lauf wird nicht manuell durch Einzel-DDL repariert. Der
Operator stoppt, sichert die Fehlerevidenz und entscheidet zwischen
Datenreconciliation, neuem Backup-Restore oder einem separat geprüften
Forward-Fix.

Historischer Zwischenstand vor den getrennt freigegebenen Stagingaktionen:
`Equora Staging` enthielt zunächst ausschließlich den verifizierten
v57.60.1-Restore ohne v57.61.0-Marker. Dieser Zwischenstand ist durch die unten
dokumentierte Credential-ACL-Reparatur und den anschließend separat
freigegebenen Sechs-Layer-Apply überholt.

### Exakt begrenzte Restore-ACL-Reparatur

Der erste eigenständige Staging-Preflight nach dem Restore endete vor jeder DDL
mit `PREFLIGHT_BASELINE_CONTRACT_DRIFT`. Die read-only Klassifizierung belegte
genau 16 nicht-grantable Tabellenrechte: je acht Rechte für `anon` und
`authenticated` auf `public.broker_credentials`. Die Tabelle ist RLS-aktiv und
besitzt in diesem Restore keine Policy; das begrenzt die unmittelbare Wirkung,
macht die ACLs aber nicht zulässig. Die Markertabelle blieb abwesend.

Vor der inzwischen ausgeführten Reparatur galt und für jedes neue Ziel gilt
weiterhin: Nur wenn der vollständige Baselinehash exakt
`47cbc3bd6d4be8ccccf8543a1f1be554610fe20b5746478e6ca94664525daffb`
lautet, darf nach einer eigenen externen Freigabe
`supabase/repair-v57.60.1-restored-credential-acl.sql` ausgeführt werden. Die
Transaktion widerruft ausschließlich diese Rechte, prüft unveränderte Trade-
und Credentialcounts und verlangt danach den sauberen Restorehash
`0fb6a0d531bb7cc66996c8b2d4f272f61dacefdb0e8969c536d1d49c89517218`.
Jeder andere Ausgangszustand oder jede abweichende Nachbedingung rollt zurück.

Der Dirty-Hash ist technisch nicht Teil des allgemeinen Baselineverifiers. Eine
separate read-only Assertion prüft ihn im gesperrten Reparaturpfad. Auch ein
vorab gesetzter gleichnamiger Custom-GUC wird von Verifier und Preflight
ignoriert; die lokale Negativmatrix verlangt in beiden Fällen weiterhin
`PREFLIGHT_BASELINE_CONTRACT_DRIFT` und null v57.61.0-Teileffekt.

Auf `Equora Staging` wurde diese Reparatur nach ausdrücklicher Freigabe
erfolgreich ausgeführt. Der danach eigenständig wiederholte read-only Preflight
bestätigte den sauberen Restorehash. Erst in einer weiteren, getrennt erteilten
Freigabe wurden normaler Preflight, alle sechs Migrationslayer und globaler
Postflight in derselben `psql`-Sitzung ausgeführt.

### Aktueller Staging-Betriebszustand

Der aktuelle, unabhängig attestierte Stagingzustand lautet:

- Credential-ACL-Reparatur PASS, 16 unerlaubte ACL-Zeilen auf 0;
- sauberer Restorehash
  `0fb6a0d531bb7cc66996c8b2d4f272f61dacefdb0e8969c536d1d49c89517218`;
- normaler Preflight PASS;
- v57.61.0-Apply mit sechs von sechs exakten Markern PASS;
- globaler Postflight PASS;
- Journal-Trades 1280 vor und nach dem Apply;
- Broker Connections, Broker Credentials, Sync Runs und Raw Events jeweils 0;
- Auth-Nutzer 7, Trade-Medien 3, Setup-Medien 1 und Storage-Objekte 6
  unverändert;
- keine ownerlosen Trades und keine direkten Credential-`SELECT`-ACL-Zeilen
  für `anon`, `authenticated` oder `service_role`;
- RLS aktiv;
- kein Retry und kein Restore nach dem Apply.

Die installierte Datenbankstruktur ist keine Runtimefreigabe. Der verbindliche
Betriebszustand bleibt `off`: kein Enrollment, kein MEXC-Probe, kein
Brokerrequest, kein Cron und kein Journalimport. Als nächstes externes Gate ist
ausschließlich ein separat freizugebendes Vercel-Preview gegen `Equora Staging`
mit Runtime `off` und ohne Cron vorgesehen. Produktion, MEXC-Requests,
automatische Runtime, Vercel, Git-Push, Merge und Deployment bleiben bis zu
ihren jeweiligen ausdrücklichen Freigaben gesperrt.

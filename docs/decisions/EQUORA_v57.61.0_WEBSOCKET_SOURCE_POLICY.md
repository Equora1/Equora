# Equora v57.61.0 – Broker WebSocket Source Policy

Stand: 2026-08-05
Status: `DESIGN DECISION – DEFERRED; REST G1 REMAINS AUTHORITATIVE`
Scope: MEXC Futures und spätere Brokeradapter
Runtime: `BLOCKED`

## 1. Entscheidung

Private Broker-WebSockets können später als optionale, niedriglatente
Observationsquelle ergänzt werden. Sie sind weder Voraussetzung für den ersten
MEXC-Import noch Ersatz für REST-History, Backfill, Reconciliation oder
persistierte Coverage-Evidenz.

Die verbindliche Reihenfolge lautet:

1. REST-Read-Profil, Pagination, Checkpoint/Resume, Raw Capture und
   Reconciliation vollständig gegatet umsetzen;
2. brokerbezogen prüfen, ob ein privater Stream fachlich relevante read-only
   Events mit stabilen IDs, Zeiten und gegebenenfalls Sequenzen liefert;
3. den Stream in einem separaten Security-/Provider-Gate als zusätzliche
   `provider_websocket_observation` registrieren;
4. nach jedem Disconnect, Reconnect, Sequenzsprung oder unbekannten Zustand
   einen REST-Overlap-Backfill verlangen;
5. erst REST-Reconciliation darf einen Stream-Gap schließen.

Ein WebSocket-Event darf allein niemals `complete_for_profile`,
`observed_stable`, Candidate-Eligibility, Approval oder Journalimport erzeugen.

## 2. Nutzen und Grenzen

Ein privater read-only Stream kann:

- neue Fills und Orderrevisionen schneller als ein Pollingintervall erfassen;
- Positionsänderungen früh als zusätzliche Boundary-/Reconciliationevidenz
  sichtbar machen;
- die Latenz zwischen Brokerausführung und Journalvorschau reduzieren;
- bei Providern mit belastbaren Sequenznummern Lücken schneller erkennen.

Er kann nicht:

- ältere Historie oder die MEXC-Retentiongrenze erweitern;
- Events während einer getrennten oder nicht authentifizierten Verbindung
  rückwirkend garantieren;
- eine unbekannte Startposition, Fundingvollständigkeit oder historische
  Contract-Metadaten beweisen;
- REST-Pagination, Overlap, Deduplizierung oder Reconciliation ersetzen.

Für ein Trading Journal ist WebSocket-Unterstützung deshalb eine spätere
Qualitäts- und Latenzoptimierung, keine Grundlage der finanziellen
Korrektheit.

## 3. Aktuelle MEXC-Evidenz

Die am 2026-08-05 geprüfte offizielle MEXC-Futures-Dokumentation beschreibt:

- nativen Endpoint `wss://contract.mexc.com/edge`;
- Login mit `apiKey`, `reqTime` und `signature`;
- privaten Order-Push `push.personal.order`;
- privaten Positions-Push `push.personal.position`;
- privaten Fill-Push `push.personal.order.deal`;
- clientseitigen Ping; ohne Ping innerhalb einer Minute wird die Verbindung
  geschlossen, dokumentiert empfohlen sind 10–20 Sekunden;
- keine Aussage, dass der private Stream verpasste Events nachliefert oder
  historische Vollständigkeit garantiert.

Quellen:

- <https://www.mexc.com/api-docs/futures/websocket-api/native-ws-endpoint>
- <https://www.mexc.com/api-docs/futures/websocket-api/command-details-for-data-exchange>
- <https://www.mexc.com/api-docs/futures/websocket-api/login-authentication>
- <https://www.mexc.com/api-docs/futures/websocket-api/order>
- <https://www.mexc.com/api-docs/futures/websocket-api/position>
- <https://www.mexc.com/api-docs/futures/websocket-api/fill-details>

Der WS-Origin unterscheidet sich vom gepinnten REST-Origin
`https://api.mexc.com`. Deshalb darf er nicht in die vorhandene REST-Allowlist
aufgenommen werden. Eine spätere Implementierung benötigt einen eigenen festen
WS-Origin-, TLS-, Login-, Channel-, Message-, Größen-, Heartbeat-, Timeout- und
Reconnectvertrag.

## 4. Permanente Read-only-Grenze

Eine spätere WS-Implementierung darf sendeseitig ausschließlich besitzen:

- festes TLS-WebSocket-Connect;
- genau den dokumentierten Auth-Login;
- Ping/Heartbeat;
- gegebenenfalls exakt allowlistete read-only Subscription-/Unsubscription-
  Kommandos;
- kontrolliertes Close.

Nicht vorhanden und nicht konfigurierbar sind:

- Order Create, Amend, Cancel, Close oder Reverse;
- Leverage-, Margin-, Position-Mode- oder TP/SL-Mutation;
- Transfer oder Withdrawal;
- freie Channels, freie Kommandos oder beliebige JSON-Sendefunktionen;
- dynamische Providerhosts oder durch Payload gelieferte Reconnectziele.

`push.personal.order` bezeichnet eingehende Orderzustandsdaten. Es autorisiert
keine Brokerorder und darf nicht mit einem Order-Placing-Kommando gekoppelt
werden.

## 5. Providerneutrales Adaptermodell

WebSocket-Support wird nicht als globales Brokermerkmal angenommen. Ein
späteres Providerprofil muss getrennt deklarieren:

- `private_stream_support = unsupported | candidate | gated | active`;
- erlaubte Eventfamilien und exakte Channelversionen;
- Snapshot-/Backfillquelle je Eventfamilie;
- Stable-ID- und Revisionsevidenz;
- Sequenzmodell einschließlich Reset-/Wrap-/Gap-Semantik;
- Heartbeat-, Idle-, Disconnect- und Reconnectregeln;
- maximal zulässige Messagegröße und Parserbudget;
- REST-Overlapfenster nach Reconnect;
- Currency-, Contract- und Financial-Authoritystatus.

Ein Broker ohne brauchbaren privaten Stream bleibt vollständig über REST oder
eine separat gegatete Exportquelle integrierbar. Ein Broker mit Stream darf
nicht zu einer abweichenden Journal-, Candidate- oder Approvalsemantik führen.

## 6. Mindest-Gate vor Implementierung

WebSocket-Code bleibt blockiert, bis mindestens belegt sind:

1. REST-G1 mit resumierbarer Capturebasis;
2. offizieller read-only Channel-/Authvertrag;
3. eigener zentraler WS-Egress ohne generische Sendefunktion;
4. Login-, Heartbeat-, Größen-, Parser-, Disconnect- und Reconnecttests;
5. Sequenz-/Gapfixtures einschließlich Eventverlust während Disconnect;
6. REST-Backfill und Stream-Deduplizierung gegen dieselbe Provider-ID;
7. A3-QA- und A4-Security-PASS;
8. weiterhin null Trading-, Transfer- und Withdrawalcapabilities.

Bis dahin gilt:

```text
websocket_runtime = blocked
websocket_is_authority = false
rest_reconciliation_required = true
automatic_import = blocked
```

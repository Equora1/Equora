# Equora Broker-Verbindung

Stand: v57.60

## Was der Bereich macht

Equora verbindet sich lesend mit MEXC Futures und zeigt die zuletzt gefundenen Orders und Ausführungen als Vorschau.

Die Vorschau ist noch kein Journal-Import. Der Nutzer sieht zuerst, welche Daten vorhanden sind.

## Was Equora niemals macht

- Orders erstellen
- Orders ändern oder schließen
- Auszahlungen auslösen
- Geld transferieren
- API-Schlüssel im Browser zurückgeben
- Secrets in Logs schreiben

## MEXC-Ablauf

1. Nutzer erstellt bei MEXC einen API-Schlüssel mit ausschließlich Futures-Leserechten.
2. Handels-, Transfer- und Auszahlungsrechte bleiben deaktiviert.
3. Nutzer gibt API-Schlüssel und Secret Key in Equora ein.
4. Equora signiert die Leseabfrage serverseitig.
5. MEXC bestätigt den lesenden Zugriff und liefert historische Orders.
6. Equora liest zusätzlich Ausführungen für die zuletzt gefundenen Märkte.
7. Die Daten werden als Vorschau gespeichert.
8. Es entsteht noch kein finaler Journal-Trade.

## Verwendete MEXC-Endpunkte

Öffentlich:

- `GET /api/v1/contract/ping`

Privat und lesend:

- `GET /api/v1/private/order/list/history_orders`
- `GET /api/v1/private/order/list/order_deals`

Keine POST-, DELETE-, Order-, Transfer- oder Auszahlungsendpunkte werden implementiert.

## Verschlüsselter Zugangsspeicher

`broker_credentials.encrypted_payload` enthält API-Schlüssel und Secret gemeinsam verschlüsselt mit AES-256-GCM.

Der verwendete Hauptschlüssel liegt in:

```text
EQUORA_BROKER_SECRET_KEY
```

`broker_connections.credential_reference` enthält nur die ID des verschlüsselten Datensatzes.

Die Tabelle `broker_credentials`:

- hat Row Level Security aktiviert
- besitzt absichtlich keine Policies für normale Nutzer
- wird ausschließlich über die serverseitige Service Role gelesen und beschrieben

## Rechteprüfung

Der verwendete MEXC-Leseendpunkt bestätigt, dass der Schlüssel Futures-Daten lesen darf. Er liefert jedoch keine vollständige Liste aller möglicherweise aktivierten Schlüsselrechte.

Deshalb gilt zusätzlich:

- Equora sendet niemals testweise eine Order.
- Nutzer müssen bestätigen, dass Trading, Transfer und Auszahlung ausgeschaltet sind.
- Equora selbst enthält ausschließlich GET-Abfragen für den Connector.

## Datenvorschau

Gefundene Orders und Ausführungen werden in `broker_raw_events` gespeichert.

Dubletten werden über einen Fingerprint aus Art, externer ID, Markt, Zeit, Preis und Menge erkannt.

In v57.60 bleibt `import_status` auf `pending`. Die Daten werden nicht automatisch in `trades` übernommen.

## Nächste Version

v57.61:

- MEXC-Daten in das Equora-Tradeformat übersetzen
- Entry, Exit, Größe, Gebühren, Funding und P&L zuordnen
- Problemfälle anzeigen
- Trade-Dubletten prüfen
- Import erst nach Nutzerbestätigung durchführen
- vorhandenen Import-Undo-Mechanismus weiterverwenden

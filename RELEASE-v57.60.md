# Equora v57.60 – MEXC sicher verbinden

v57.60 ist der erste echte Read-only-Broker-Connector des Equora Journals.

## Nutzeroberfläche

Der bisher technisch klingende Bereich wurde neu formuliert:

- „Broker Sync“ wird in der Navigation zu „Broker verbinden“
- „Raw Preview“ wird zu „Datenvorschau“
- „Sync Runs“ werden zu „letzten Prüfungen“
- „Fills“ werden als „Ausführungen“ bezeichnet
- interne Datenbank- und Connector-Begriffe verschwinden aus der normalen Oberfläche

## MEXC Futures

Die neue Verbindung kann:

- API-Schlüssel und Secret serverseitig prüfen
- private MEXC-Futures-Abfragen mit HMAC-SHA256 signieren
- die letzten historischen Orders lesen
- Ausführungen für die zuletzt gefundenen Märkte lesen
- gefundene Daten als Vorschau speichern
- bekannte Einträge über Fingerprints erkennen
- eine bestehende Verbindung erneut prüfen
- Verbindung und verschlüsselten Zugang löschen

Nicht enthalten:

- Order-Erstellung
- Order-Änderung oder Stornierung
- Auszahlung oder Transfer
- automatischer finaler Journal-Import

## Sicherheit

- API-Schlüssel und Secret werden mit AES-256-GCM verschlüsselt.
- Der Schlüssel `EQUORA_BROKER_SECRET_KEY` liegt ausschließlich in der Serverumgebung.
- Die Tabelle `broker_credentials` besitzt keine Client-Policies.
- Der Browser erhält gespeicherte Zugangsdaten nicht zurück.
- Secrets werden nicht in Logs oder Vorschau-Datensätzen gespeichert.
- Equora ruft ausschließlich lesende MEXC-Endpunkte auf.

MEXC liefert über die verwendete Leseschnittstelle keine vollständige Übersicht aller am API-Schlüssel aktivierten Rechte. Equora prüft deshalb niemals schreibend und akzeptiert die Verbindung nur nach ausdrücklicher Bestätigung, dass Trading, Transfer und Auszahlung am Schlüssel deaktiviert wurden.

## SQL

Neuer Patch:

- `supabase/schema-patch-v57.60.sql`

Er erstellt `broker_credentials` als serverseitigen, verschlüsselten Zugangsspeicher.

## Vercel

Neue Pflichtvariable für den Connector:

```text
EQUORA_BROKER_SECRET_KEY=
```

Erzeugung:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Nächster Schritt

v57.61 soll die gefundenen MEXC-Daten in das Equora-Tradeformat übersetzen, Dubletten auf Trade-Ebene prüfen und einen ausdrücklich bestätigten Import anbieten.

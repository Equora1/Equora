# Equora v57.57 – Trades Pagination & Lazy Details

## Ziel

v57.57 reduziert die schwerste Journal-Seite `/trades`. Nicht mehr die gesamte Trade-Historie samt Bildern und Detailkarten wird beim ersten Aufruf geladen.

## Neue Ladegrenzen

- maximal 30 Trades pro Server-Seite
- exakte Gesamtzahl über eine kleine Count-Abfrage
- Trade-Tags nur für die geladene Seite
- Setup-Verknüpfungen nur für die geladenen Trade-IDs
- keine Trade-Medien in der Tabellenabfrage
- für die Tabelle werden nur Bildanzahlen statt Bild-URLs geladen
- vollständige Trade-Details, Tags und Bilder erst nach Auswahl eines Trades

## Pagination

Die Trade-Liste verwendet den URL-Parameter `page`:

```text
/trades?page=1
/trades?page=2
```

Ungültige Seiten oberhalb der letzten Seite werden auf die letzte vorhandene Seite zurückgeführt.

Die vorhandenen Tabellenfilter bleiben in v57.57 bewusst clientseitig und wirken auf die aktuell geladene Seite. Eine spätere Version kann häufige Filter in echte Server-Queries überführen.

## Detailansicht

Der erste Aufruf von `/trades` zeigt zunächst nur die Tabelle. Erst nach Auswahl eines Trades wird dieser serverseitig einzeln geladen, einschließlich:

- vollständiger Trade-Felder
- Trade-Tags
- Trade-Medien und Screenshot-URLs
- Detailberechnung und Review-Fakten

Damit wachsen Bildbibliothek und Detailtiefe nicht mehr mit jeder Tabellenzeile im initialen Payload.

## Datenbank

Kein neuer SQL-Patch. v57.57 nutzt die bereits vorhandenen Indizes, insbesondere:

- Nutzer + Trade-Zeitpunkt aus `schema-patch-v57.56.sql`
- Nutzer + created_at aus den früheren Performance-Patches

## Prüfstatus

- `npm ci`: erfolgreich
- `npm audit`: 0 bekannte Schwachstellen
- `npm run typecheck`: erfolgreich
- `npm run build`: Kompilierung, Typecheck und Seitenerzeugung erfolgreich; abschließender Trace-Schritt in der Containerumgebung zuletzt ohne Abschluss
- `npm run build:turbopack`: vollständig erfolgreich
- Produktions-Smoke-Test für Liste, Pagination und Detail-Link: erfolgreich

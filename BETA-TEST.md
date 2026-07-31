# Equora v57.60 – Beta-Test-Checkliste

## Installation und Sicherheit

```powershell
node -v
npm install
npm audit
npm run typecheck
npm run build
npm run build:turbopack
npm run release:check
```

Erwartung:

- Node 20.9 bis unter 26, empfohlen Node 24 LTS
- Next.js 15.5.21
- Sharp 0.35.3
- PostCSS 8.5.18
- kein `npm audit fix --force`
- keine internen Registry-URLs
- beide Builds erfolgreich

## Vor dem Broker-Test

1. `supabase/schema-patch-v57.60.sql` im Supabase SQL Editor ausführen.
2. Einen 32-Byte-Schlüssel erzeugen:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

3. Wert in Vercel und lokal als `EQUORA_BROKER_SECRET_KEY` hinterlegen.
4. Einen separaten MEXC-API-Schlüssel mit ausschließlich Futures-Leserechten anlegen.
5. Handels-, Transfer- und Auszahlungsrechte deaktivieren.

Keine echten API-Schlüssel in Screenshots, Tickets, GitHub oder Chat-Nachrichten einfügen.

## Broker verbinden

1. Unter „Erweitert“ den Punkt „Broker verbinden“ öffnen.
2. Prüfen, dass keine Begriffe wie Raw Preview, Sync Run oder Credential Reference in der Oberfläche erscheinen.
3. Ohne SQL-Patch muss ein verständlicher Einrichtungshinweis erscheinen.
4. Ohne `EQUORA_BROKER_SECRET_KEY` muss die Verbindung deaktiviert bleiben.
5. Leere oder zu kurze Schlüssel müssen abgewiesen werden.
6. Ohne Read-only-Bestätigung muss die Verbindung abgewiesen werden.
7. Mit falschem Schlüssel muss eine verständliche MEXC-Fehlermeldung erscheinen.
8. Mit gültigem Leseschlüssel muss die Verbindung gespeichert werden.
9. API-Schlüssel und Secret dürfen nach dem Speichern nicht erneut sichtbar sein.
10. „Daten erneut prüfen“ testen.
11. Prüfen, dass Orders und Ausführungen nur als Datenvorschau erscheinen.
12. Prüfen, dass kein neuer Eintrag in `trades` angelegt wird.
13. Verbindung entfernen und kontrollieren, dass auch `broker_credentials` gelöscht wurde.

## Datenbank

- `broker_credentials` besitzt RLS, aber keine Nutzer-Policies.
- `credential_reference` enthält nur eine Datensatz-ID.
- `broker_raw_events` enthält Broker-Daten, aber keine API-Schlüssel oder Secrets.
- erneute Prüfungen erkennen bereits bekannte Vorschau-Einträge.

## Journal-Kern

1. Start, Trades, Review, Statistik und Setups öffnen.
2. Kalender, Sessions, Vault, Kosten, Daily Note und Broker verbinden öffnen.
3. TradingView Zwei-Bild-Import testen.
4. CSV/Excel-Import und Import rückgängig prüfen.
5. Trade-Pagination und Details prüfen.
6. Mobile und Tablet-Breite grob prüfen.

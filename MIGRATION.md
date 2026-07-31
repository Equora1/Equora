# EQUORA – Migration / Supabase-Patches

Stand: v57.60

## Neue Supabase-Projekte

1. `supabase/schema.sql` ausführen.
2. Danach nur Patches ausführen, die neuer als das verwendete Schema sind.

## Bestehende Supabase-Projekte

Patches chronologisch prüfen:

- `schema-patch-v57.17.sql`: Setup-Vorschläge
- `schema-patch-v57.48.sql`: Import-Verlauf und Import rückgängig
- `schema-patch-v57.51.sql`: erste Performance-Indizes
- `schema-patch-v57.52.sql`: Broker-Grundtabellen
- `schema-patch-v57.56.sql`: zusätzliche Performance-Indizes
- `schema-patch-v57.60.sql`: verschlüsselter Broker-Zugangsspeicher

## v57.60

Neuer SQL-Patch erforderlich:

```text
supabase/schema-patch-v57.60.sql
```

Der Patch erstellt:

- `broker_credentials`
- Index nach Nutzer und Erstellungszeit
- RLS ohne Client-Policies
- expliziten Entzug der Tabellenrechte für `anon` und `authenticated`

Zusätzlich erforderlich:

```text
EQUORA_BROKER_SECRET_KEY
```

Der Wert muss 32 Byte ergeben und als Base64 oder 64-stelliges Hex hinterlegt werden.

Codeänderungen:

- erster echter MEXC Futures Read-only-Connector
- serverseitige HMAC-Signatur
- verschlüsselte Zugangsdaten
- Datenvorschau statt automatischem Import
- benutzerfreundliche Broker-Sprache
- erneute Prüfung und sicheres Entfernen einer Verbindung

## Lokal prüfen

```powershell
npm install
npm audit
npm run typecheck
npm run build
npm run build:turbopack
npm run release:check
```

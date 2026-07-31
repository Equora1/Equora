# Equora Starter v57.60

## Schwerpunkt: erster MEXC Read-only-Connector

v57.60 verbindet das Equora Journal erstmals direkt mit MEXC Futures. Der Connector liest ausschließlich Daten und zeigt sie als Vorschau. Er importiert noch keine Trades und enthält keine Order-Funktion.

Neu:

- Broker-Bereich vollständig in verständliche Journal-Sprache überarbeitet
- MEXC Futures mit serverseitig signierten Leseabfragen
- Vorschau der letzten Orders und Ausführungen
- verschlüsselter Zugangsspeicher für API-Schlüssel und Secret Key
- Zugangsdaten werden nach dem Speichern nicht an den Browser zurückgegeben
- manuelle erneute Prüfung einer Verbindung
- Verbindung und verschlüsselten Zugang gemeinsam löschen
- gefundene Daten bleiben Vorschau und werden nicht automatisch zu Journal-Trades

Details: `RELEASE-v57.60.md` und `BROKER-SYNC.md`.

## Installation

Empfohlen: Node 24 LTS.

```powershell
npm install
npm audit
npm run typecheck
npm run build
npm run start
```

Optional:

```powershell
npm run build:turbopack
```

`npm audit fix --force` nicht verwenden.

Festgelegt:

- Next.js `15.5.21`
- Sharp `0.35.3`
- PostCSS `8.5.18`

## Supabase

Für bestehende Projekte ist neu:

- `supabase/schema-patch-v57.60.sql`: serverseitiger, verschlüsselter Broker-Zugangsspeicher

Vorherige relevante Patches:

- `supabase/schema-patch-v57.17.sql`: Setup-Vorschläge
- `supabase/schema-patch-v57.48.sql`: Import-Verlauf und Import rückgängig
- `supabase/schema-patch-v57.51.sql`: erste Performance-Indizes
- `supabase/schema-patch-v57.52.sql`: Broker-Grundtabellen
- `supabase/schema-patch-v57.56.sql`: zusätzliche Performance-Indizes

## Neue Vercel-Variable

Zusätzlich zu den vorhandenen Supabase-Variablen wird benötigt:

```text
EQUORA_BROKER_SECRET_KEY=<32-Byte-Schlüssel als Base64 oder 64-stelliges Hex>
```

Einmalig erzeugen:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Den erzeugten Wert sicher in Vercel hinterlegen. Nicht committen und nicht später beliebig austauschen, da bestehende Broker-Zugänge sonst nicht mehr entschlüsselt werden können.

## Produktgrenze

Equora dokumentiert, analysiert und unterstützt Reviews.

Equora darf nicht:

- Orders erstellen, ändern oder schließen
- Geld auszahlen oder transferieren
- Handelssignale geben
- Broker-Daten ohne Nutzerkontrolle final importieren

## Aktueller Produktstand

- v57.55: persistente Shell, Prefetching und Ladezustände
- v57.56: gezieltere Seitenabfragen und Monatsfilter
- v57.57: Trade-Pagination und spätes Laden von Details
- v57.58: interne Performance-Diagnose
- v57.59: stabilisierte Beta-Basis
- v57.60: erster echter MEXC Read-only-Connector mit Datenvorschau

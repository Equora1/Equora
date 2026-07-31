# Installation Equora v57.60

Empfohlen: Node 24 LTS.

```powershell
cd "C:\Users\matth\Desktop\Equora Starter v57.60"
npm install
npm audit
npm run typecheck
npm run build
npm run build:turbopack
npm run start
```

Nicht ausführen:

```text
npm audit fix --force
```

## Supabase-Patch

Für ein bestehendes Projekt im Supabase SQL Editor ausführen:

```text
supabase/schema-patch-v57.60.sql
```

Der Patch erstellt den verschlüsselten Broker-Zugangsspeicher. Die bisherigen Broker-Tabellen aus v57.52 müssen bereits vorhanden sein.

## Vercel-Variable

Einen 32-Byte-Schlüssel erzeugen:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Den erzeugten Wert in Vercel als folgende Variable hinterlegen:

```text
EQUORA_BROKER_SECRET_KEY
```

Für Production, Preview und Development nur dann denselben Wert verwenden, wenn dieselbe Supabase-Datenbank und dieselben verschlüsselten Broker-Zugänge gelesen werden sollen.

## Windows-Dateisperren

```powershell
taskkill /F /IM node.exe
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm install
```

## Lockdatei

Falls die ZIP keine `package-lock.json` enthält, erzeugt `npm install` sie einmalig. Danach für saubere Neuinstallationen `npm ci` verwenden.

## Paketstand prüfen

```powershell
npm ls next sharp postcss
npm audit
```

Erwartet:

- Next.js 15.5.21
- Sharp 0.35.3
- PostCSS 8.5.18
- idealerweise 0 bekannte Schwachstellen

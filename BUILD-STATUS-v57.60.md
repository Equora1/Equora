# Build-Status v57.60

Stand: 30.07.2026

## Erfolgreich geprüft

- `package.json` ist gültiges JSON und trägt Version `0.57.60`.
- `npm run release:check` wurde über das zugrunde liegende Node-Skript erfolgreich ausgeführt.
- Syntaxprüfung von 218 TS-/TSX-Dateien mit dem vorhandenen TypeScript-Compiler erfolgreich.
- Gezielte TypeScript-Prüfung der neuen Broker-Dateien erfolgreich.
- Verschlüsselungstest erfolgreich:
  - API-Schlüssel und Secret lassen sich korrekt verschlüsseln und entschlüsseln.
  - Die zusätzliche Nutzer-/Provider-Bindung verhindert die Entschlüsselung im falschen Nutzerkontext.
- Keine schreibenden MEXC-Methoden oder Order-Endpunkte im Connector gefunden.
- Keine `.env.local`, `.env`, `.next`, `node_modules`, `.git` oder Cache-Dateien in der Auslieferung.
- Keine API-Schlüssel oder Secrets in den Projektdateien.
- Der neue SQL-Patch legt `broker_credentials` ohne Client-Policies an.

## In der Erstellungsumgebung nicht vollständig ausführbar

`npm install` konnte nicht abgeschlossen werden:

- die interne Paketquelle lieferte für `@fontsource-variable/plus-jakarta-sans` HTTP 404,
- der direkte Versuch über die öffentliche npm Registry lief wegen fehlender Netzwerkerreichbarkeit in ein Timeout.

Deshalb konnten hier nicht ausgeführt werden:

- vollständiges `npm install`
- `npm audit`
- reguläres `npm run typecheck` mit den echten Projektabhängigkeiten
- `npm run build`
- `npm run build:turbopack`

Die ZIP enthält daher keine neu erzeugte `package-lock.json`.

## Lokal ausführen

```powershell
cd "C:\Users\matth\Desktop\Equora Starter v57.60"
npm install
npm ls next sharp postcss
npm audit
npm run typecheck
npm run build
npm run build:turbopack
npm run release:check
```

Nur dann „Build vollständig erfolgreich“ dokumentieren, wenn beide Next.js-Builds bis zum Ende durchlaufen.

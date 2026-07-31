# Equora Git Setup

Stand: v57.60

Vor Commit oder ZIP:

```powershell
npm install
npm audit
npm run typecheck
npm run build
npm run build:turbopack
```

Nicht committen oder verpacken:

- `.env.local`
- `.env`
- `.next`
- `node_modules`
- `tsconfig.tsbuildinfo`
- API-Schlüssel, Secret Keys, Tokens oder lokale Logs

Besonders wichtig für v57.60:

- `SUPABASE_SERVICE_ROLE_KEY` bleibt ausschließlich in Vercel bzw. `.env.local`
- `EQUORA_BROKER_SECRET_KEY` bleibt ausschließlich in Vercel bzw. `.env.local`
- keine MEXC-Zugangsdaten in Testdateien oder Screenshots

Nach dem Entfernen lokaler Build-Dateien:

```powershell
npm run release:check
```

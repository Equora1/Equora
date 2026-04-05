# Equora v56.44 — Integrations- und Migrationshinweis

## Aktueller SQL-Stand
- **Bestehende Supabase-Projekte auf v56.35 bis v56.37:** kein neuer SQL-Patch nötig
- **Komplett neue Supabase-Projekte:** `supabase/schema.sql`

## Reihenfolge
1. v56.44 App-Dateien deployen.
2. `npm install` ausführen.
3. Lokalen Build wie gewohnt in VS Code prüfen.
4. Storage-Bucket `equora-media` prüfen.
5. Optional `SUPABASE_SERVICE_ROLE_KEY` setzen, damit Trade-Löschen auch Storage-Dateien mit bereinigen kann.

## Hinweis
Diese Version zieht den ruhigeren Boxenstil jetzt auch in die **Setups**: Explorer und Detail lesen sich breiter und klarer, statt in schmalen Split-Flächen zu hängen.

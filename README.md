# Equora Starter v56.44

Equora ist eine testbare Lern-, Review- und Coaching-App mit Fokus auf schnelle Erfassung, ruhige Arbeitsflächen und stärkere visuelle Führung.

## Was ist neu in v56.44
- Der **Setups-Bereich** ist jetzt ruhiger aufgebaut: aktiver Setup-Rahmen, Detailfläche und Bibliothek laufen als **breite Blöcke untereinander** statt als schmale Split-Ansicht.
- Das **Setup-Detail** liest sich nicht mehr wie ein Kassenzettel. Entry, Exit, Invalidierung, Performance, Playbook, Fehler und passende Trades liegen jetzt in **breiten Boxen** mit mehr Luft.
- Auch die **Setup-Bibliothek** bleibt sichtbar, drängt den aktiven Rahmen aber nicht mehr nach hinten. So passt der Stil jetzt besser zu Kalender und Dashboard.

## SQL nötig?
- **Nein, nicht für v56.44.**
- Wenn dein Projekt schon auf **v56.35**, **v56.36** oder **v56.37** ist, ist kein neuer SQL-Patch nötig.
- **Neue Supabase-Projekte:** weiterhin `supabase/schema.sql`

## npm install nötig?
- **Ja.** Nach dem Entpacken `npm install` ausführen.

## Konnte ein Full Build wirklich geprüft werden?
- In dieser Arbeitsumgebung wurde für v56.44 kein frischer Full Build belastbar bestätigt.
- Bitte `npm install` und `npm run build` wie gewohnt in deiner lokalen VS-Code- / Deploy-Umgebung prüfen.

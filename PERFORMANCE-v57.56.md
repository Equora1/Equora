# Equora v57.56 – Page-specific Queries

## Ziel

v57.55 verbesserte vor allem die gefühlte Navigation. v57.56 reduziert nun die Datenmenge und die Zahl unnötiger Serverabfragen auf häufig genutzten Seiten.

## Änderungen nach Seite

### Dashboard

Vorher:

- vollständiger Trade-Bestand
- vollständige Daily-Note-Historie
- Setup-Library
- Setup-Trade-Verknüpfungen

Jetzt:

- maximal 60 jüngste Trades
- maximal 7 Daily Notes
- keine Setup-Library
- keine Setup-Verknüpfungen
- Startaktionen werden sofort gerendert
- nur die Tageskarte liegt in einer Suspense-Grenze

Die 60 Trades dienen auch der aktuellen Serienanzeige. Eine außergewöhnlich lange Serie über 60 Trades wird auf dem Dashboard bewusst nicht vollständig rekonstruiert; Statistik und Review bleiben die vollständigen Analysebereiche.

### Kalender

Vorher:

- gesamte Trade-Historie bei jedem Kalenderaufruf
- Daily Notes wurden geladen und auf der Seite nicht verwendet
- Setup-Library und Verknüpfungen wurden mitgeladen

Jetzt:

- nur Trades des sichtbaren Monats
- keine Daily Notes
- keine Setup-Library
- keine Setup-Verknüpfungen
- Monatsnavigation über `?month=YYYY-MM`

### Review-Sessions

Vorher:

- paginierte Sessions
- zusätzlich vollständiger Journal-Snapshot nur für Quelle und Sidebar-Zahlen

Jetzt:

- ausschließlich paginierte Sessions
- Quelle wird aus der Laufzeitkonfiguration bestimmt
- Sidebar-Zahlen bleiben über den bereits entkoppelten Kurzüberblick verfügbar

### Broker Sync

Vorher:

- Broker-Sync-Daten
- zusätzlich Navigation-Metriken

Jetzt:

- nur Broker-Sync-Daten

### Kostenprofile

Vorher:

- vollständige Trades
- Setups und Setup-Verknüpfungen
- vollständige Trade-Mappings nur für Nutzungszahlen

Jetzt:

- Nutzerprofile
- eine schmale Abfrage nur auf `user_cost_profile_id`

### Daily Note

- keine Setup-Library
- keine Setup-Verknüpfungen
- Trades und Notes bleiben vollständig verfügbar, weil der Nutzer im Datumsfeld auch ältere Tage öffnen kann

## Neue Indizes

`supabase/schema-patch-v57.56.sql`:

```sql
create index if not exists idx_trades_user_captured_at
  on public.trades (user_id, captured_at desc);

create index if not exists idx_daily_notes_user_trade_date
  on public.daily_notes (user_id, trade_date desc);

create index if not exists idx_trades_user_cost_profile
  on public.trades (user_id, user_cost_profile_id)
  where user_cost_profile_id is not null;
```

## Smoke-Test im Produktionsmodus

Demo-Modus ohne externes Supabase-Netzwerk, erster Abruf auf separatem Port:

- Dashboard: ca. 0,14 s
- Kalender: ca. 0,04 s
- Kostenprofile: ca. 0,02 s
- Review-Sessions: ca. 0,015 s
- Broker Sync: ca. 0,02 s

Diese Werte prüfen Routing, Rendering und interne Datenpfade. Live-Werte hängen zusätzlich von Supabase, Region, Netzwerk und Nutzerbestand ab.

## Bewusst noch nicht geändert

Diese Bereiche benötigen weiterhin die vollständige Historie:

- Statistik
- Review
- Setups
- Trade-Workbench
- Share-Auswahl

Die nächste sinnvolle Performance-Stufe ist serverseitige Trade-Pagination mit lazy geladenen Details und Medien. Dabei müssen Filter, gespeicherte Review-Sessions und direkte Trade-Links weiterhin korrekt funktionieren.

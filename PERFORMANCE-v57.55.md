# Equora v57.55 – Instant Navigation und Streaming

## Ziel

v57.55 verbessert zuerst die **gefühlte Geschwindigkeit**. Datenabfragen werden in v57.56 weiter verschlankt; in dieser Version bleibt die Benutzeroberfläche beim Wechsel zwischen Journal-Seiten stabil sichtbar.

## Persistente Journal-Hülle

Die Journal-Seiten liegen jetzt in der Route Group `app/(journal)`.

```text
app/(journal)/layout.tsx
├── Sidebar
├── Hintergrund / AppShell
└── wechselnder Seiteninhalt
```

Die öffentliche URL ändert sich dadurch nicht. `/dashboard`, `/trades`, `/review` usw. bleiben erhalten.

Die bisherigen `AppShell`-Wrapper in den Seiten sind aus Kompatibilitätsgründen noch vorhanden, rendern aber nur ihre Kinder. Die sichtbare Hülle wird ausschließlich im gemeinsamen Layout aufgebaut.

## Navigation

- Haupt- und erweiterte Navigationslinks nutzen wieder Next.js-Prefetching.
- Logout bleibt absichtlich `prefetch={false}`.
- Ein Klick setzt sofort einen Ladeindikator am Zielpunkt.
- Die Sidebar bleibt während des Route-Wechsels bedienbar und sichtbar.

## Streaming / Loading

Alle Journal-Bereiche besitzen einen `loading.tsx`-Fallback. Damit kann Next.js den persistenten Rahmen sofort ausliefern und nur den Inhaltsbereich streamen.

## Kurzüberblick

Die Sidebar-Kennzahlen blockieren keine Seite mehr.

Erst beim Öffnen von `Kurzüberblick` ruft der Client `/api/sidebar-overview` auf. Die API verwendet drei `head`-/Count-Abfragen:

- alle Trades
- A-Setups
- Trades mit negativem Netto-P&L

Es werden keine vollständigen Trade-Zeilen übertragen.

## Auth

`getCurrentUser()` verwendet `getClaims()` statt eines zusätzlichen `getUser()`-Netzwerkaufrufs und ist mit React `cache()` innerhalb eines Server-Requests dedupliziert. Die Middleware aktualisiert und prüft die Session weiterhin.

## Produktionsmessung im Demo-Modus

Lokaler Test mit `npm run build` und `npm run start`:

- Server bereit in ca. 0,8 Sekunden
- erste TTFB je Route im Test: ca. 0,008 bis 0,14 Sekunden

Diese Werte sind kein Versprechen für Supabase-Live-Daten. Sie zeigen, dass Routing und Rendering selbst nicht mehr der dominante Engpass sind. Für echte Nutzerdaten folgt v57.56 mit gezielten Queries und Pagination.

## Nächster Performance-Schritt

v57.56 soll die tatsächliche Serverarbeit reduzieren:

- Dashboard nur letzte Trades + Aggregatwerte
- Kalender nur benötigter Zeitraum und Spalten
- Review nur relevanter Zeitraum
- Trades serverseitig paginieren
- Setup-Medien erst bei Bedarf laden
- Query-Zeiten pro Bereich messen

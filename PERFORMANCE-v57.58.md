# Equora Performance-Diagnose v57.58

v57.58 ist bewusst eine Mess-Version. Sie verändert keine Trading-Logik und führt keinen neuen Supabase-Patch ein.

## Ziel

Die Ladezeit wird getrennt gemessen nach:

- Browsernavigation: Klick bis zum sichtbaren neuen Inhalt
- Authentifizierung: `auth.getClaims`
- Supabase-Abfragen: Trades, Tags, Medien, Setups, Daily Notes, Counts und Zusatzbereiche
- Snapshot-Gesamtdauer je Seite
- Transformationen in Next.js für Trades, Review, Statistik und Setups

## Diagnose öffnen

1. App im Produktionsmodus starten:

```powershell
npm run build
npm run start
```

2. Im Journal unter **Erweitert → Performance** öffnen.
3. Messungen leeren.
4. Nacheinander öffnen:
   - Start
   - Trades
   - Review
   - Statistik
   - Setups
   - Kalender
5. Danach zur Performance-Seite zurückkehren.

## Interpretation

- Hohe `navigation.click_to_paint`-Werte: Nutzer wartet sichtbar lange.
- Hohe `auth.getClaims`-Werte: Auth-/Netzwerkpfad prüfen.
- Hohe `database.*`-Werte: Supabase-Abfrage, Region, Index oder Roundtrips prüfen.
- Hohe `snapshot.*.total`-Werte bei niedrigen Einzelabfragen: Ablauf/Parallelisierung prüfen.
- Hohe `transform.*`-Werte: JavaScript-Auswertung oder Datenmenge reduzieren.

P95 ist wichtiger als ein einzelner Bestwert. Erst nach mehreren Seitenwechseln beurteilen.

## Datenschutz

Gespeichert werden nur:

- Operationsname
- Kategorie
- Dauer
- Route
- kleine Mengenangaben wie Anzahl Trades oder Setups
- Zeitstempel und Status

Nicht gespeichert werden:

- Nutzer-ID oder E-Mail
- Trade-Inhalte
- Notizen
- API-Schlüssel oder Secrets
- Supabase-Tokens

Die letzten maximal 300 Ereignisse liegen nur im Arbeitsspeicher des laufenden Next.js-Prozesses. Ein Neustart leert sie. In verteilten/serverlosen Deployments zeigt die Seite nur die Ereignisse der jeweils antwortenden Instanz.

## Serverkonsole

Optional erscheinen strukturierte Zeilen:

```text
[equora:perf] { ... }
```

Sie werden nur mit folgender Server-Umgebungsvariable aktiviert:

```text
EQUORA_PERFORMANCE_LOGS=true
```

Ohne diesen Schalter sammelt die interne Performance-Seite weiterhin Messwerte im Prozessspeicher, ohne das Terminal mit Diagnosezeilen zu belasten.

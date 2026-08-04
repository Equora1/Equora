# Release v57.60.1 – Hardening-Bericht

## Ergebnis

v57.60.1 ist ein technisches Korrekturrelease, kein Trading- oder Renditeversprechen. Es schließt zentrale Hard-Gate-Lücken, ist aber ohne echte Staging-Migration weiterhin nicht pilot- oder produktionsreif.

## Umgesetzt

- privater Bucket und nutzergebundene Objektpfade;
- fünf Minuten gültige Signed URLs ohne persistierte Zugriffstoken und ohne Next-Image-Cache für diese URLs;
- fail-closed Cleanup: Referenzfehler führen nie zur physischen Löschung;
- dauerhafte, parentgebundene Upload-Intents vor jedem Browserupload; pro Vorgang, aktivem Nutzerbestand und Minute gelten harte Mengenlimits;
- mehrdeutige Finalize-Fehler verlängern die 30-Minuten-Sperrfrist und führen erst danach zu einer serverseitigen, referenzgeprüften Cleanup-Anforderung;
- atomare DB-RPCs für Trade, Medien, Tags, Setup, Review, Setup-Vorschläge, Import und Undo;
- Setup-Bildersatz lädt neue Bilder vor genau einer atomaren DB-Speicherung hoch;
- Legacy-Medienmigration bricht bei URL-only-Daten ab, statt Daten blind zu leeren;
- explizite Währung; Legacy-Edit erfindet keine Preset-Währung;
- CSV-Zeilenwährungen überschreiben nur als unterstützte Werte den Batch-Fallback;
- Import-Dubletten nutzen exakten Zeitpunkt, Währung, Broker-, Konto-Template und Kontobezeichnung;
- fehlende Währung ist ein eigener nicht belastbarer Trust-Status;
- Kostenaggregation nutzt keine Betragsumkehr und sperrt gemischte/unbekannte Einheiten;
- Review-Snapshots werden serverseitig aus den eigenen Trades berechnet;
- Import-Batches mit RLS/Owner-Pflicht; direkte Browser-DML gesperrt;
- Broker-Verbindung und Credential werden serverseitig atomar erstellt und gelöscht;
- aktueller Lockfile, Vitest 4.1.10, Vertrags- und Regressionstests.

## Bewusste Grenzen

- Keine FX-Konvertierung ohne definierte Kursquelle, Bewertungszeitpunkt, Gebühren und Rundung.
- Historische Währungen werden nicht geraten.
- Cleanup benötigt externen Scheduler; parallele Worker haben noch keinen Claim/Lease.
- Upload-Intents reduzieren Browserabbruch-Orphans; der reale Fault-Injection-Nachweis gegen Supabase bleibt trotzdem offen.
- Das Release-ZIP enthält genau einen Root-Ordner `Equora Starter v57.60.1`, wird aus einer expliziten Datei-/Erweiterungs-Allowlist gebaut, erneut extrahiert, gegen sein Manifest verglichen und im extrahierten Zustand nochmals geprüft.
- Master-Setup-Medien benötigen für organisationsweite Sichtbarkeit später ein eigenes Asset-Vault-Berechtigungsmodell.
- SQL-Migration, RLS-Angriffstests und Fault-Injection konnten lokal ohne echte Staging-Datenbank nicht bewiesen werden.

## Go/No-Go

- Lokale Code-/UI-Regression: nach vollständigem grünen Lauf zulässig.
- Staging: nur nach Schreibstopp, Backup und grünen Preflight-Zählern.
- Pilot/Produktion: **No-Go**, bis Migration, DB-Integrationstests, Fault-Injection, Restore-Nachweis und unabhängige Gate-Re-Reviews grün sind.
- Vertrieb/White-Label: zusätzlich A6-Wirtschaftlichkeit, Support/SLA, Datenschutzinformation und externe Rechtsprüfung der Claims.

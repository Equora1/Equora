# Standard Operating Procedure – Equora Starter v57.60.1

## Ziel und Rollen

Hard Gates haben Vorrang vor Termin- oder Vertriebsdruck. A1 orchestriert; A2 verantwortet Architektur/Implementierung; A3 die unabhängige Regression; A4 Security/Privacy/Compliance; A5 Trading- und Datenintegrität; A6 Produkt, Wirtschaftlichkeit und Vertrieb. Der Implementierer erteilt bei hohem Risiko nicht allein die finale Freigabe.

## Releaseablauf

1. A1 friert Scope, Akzeptanzkriterien und Nicht-Ziele ein.
2. Schreibstopp, Backup, Bucket-Inventar und Rollbackplan.
3. A4 prüft RLS, Storage-Ownership, Secrets, Cleanup und Credentials.
4. A5 prüft Währungen, Long/Short, Gebühren, P&L und Golden Cases.
5. A3 führt Typecheck, Tests, Release-Check, Build und Browser-Regression aus.
6. Das aus der expliziten Allowlist erzeugte ZIP wird extrahiert, byteunabhängig gegen die Dateiliste abgeglichen und im extrahierten Zustand erneut durch den Release-Check geprüft; erst danach wird der SHA-256 veröffentlicht.
6. SQL-Patch und Fault-Injection zuerst in Staging; jeder Fehler ist No-Go.
7. A1 dokumentiert Gate-Status, Restrisiken und Go/No-Go.

## Cleanup-Betrieb

Nur `POST` ist erlaubt (`GET` liefert `405`):

```text
POST /api/maintenance/media-cleanup
Authorization: Bearer <EQUORA_MAINTENANCE_SECRET>
```

Startwert: alle 15 Minuten, genau ein Scheduler-Consumer, maximal 50 Jobs pro Lauf. Alarmieren, wenn `attempts` steigt oder der älteste offene Job länger als eine Stunde liegt. Bei fehlgeschlagener Referenzabfrage löscht der Worker nichts.

Upload-Intents sind auf zwölf Medien pro Vorgang sowie 24 gleichzeitig aktive bzw. pro Minute reservierte Pfade je Nutzer begrenzt. Mehrdeutige Finalisierungsfehler dürfen die 30-minütige Grace Period nie verkürzen. Änderungen an diesen Grenzwerten erfordern A4-Review und einen Last-/Missbrauchstest.

Parallele Worker besitzen noch keinen DB-Claim/Lease und bleiben ein Betriebsrisiko. Abgeschlossene Jobs werden 30 Tage aufbewahrt und danach in einem genehmigten Maintenance-Lauf gelöscht; offene Jobs niemals altersbasiert. Die Outbox besitzt bewusst keinen kaskadierenden Auth-Fremdschlüssel, damit Objektlöschungen eine Kontolöschung überleben.

## Tägliche Kontrollen

- Fehlerquote von Trade-, Setup-, Review- und Import-RPCs;
- offene/fehlgeschlagene Cleanup-Jobs und verwaiste Storage-Objekte;
- Auth-/RLS-Fehler und ungewöhnliche Zugriffsmuster;
- monetäre Trades ohne unterstützte Währung;
- Broker-Sync-Fehler, ohne Secrets zu protokollieren.

## Incident-Regeln

- Fremder Medienzugriff: Zugriff stoppen, A4 aktivieren, Logs sichern, Token-/Secret-Rotation und Datenschutzfolge prüfen.
- Falsche Geldaggregation: Auswertung sperren, A5 aktivieren, Daten nicht automatisiert korrigieren.
- Teilmutation/Datenverlust: Schreibzugriff stoppen, Backup und Outbox sichern, A2/A3 reproduzieren lassen.
- Credential-Löschfehler: Verbindung als nicht gelöscht behandeln; keine Erfolgsmeldung.
- P0/P1: kein Pilot, Vertrieb oder Release bis zur nachgewiesenen Behebung bzw. einem vom Gate Owner akzeptierten Workaround.

## Monatliche Prüfung

- Dependencies und Sicherheitsmeldungen;
- Restore-Test;
- RLS-, Storage-Policies und RPC-Grants;
- historische Währungen und erst danach Constraint-Validierung;
- Abgleich von Storage-Objekten gegen Medienzeilen und offene Upload-Intents; abgelaufene Intents müssen vom Worker nach Referenzprüfung bereinigt werden;
- Produktclaims, Datenschutztexte, Lösch-/Exportprozess und Supportmodell.

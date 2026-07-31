# Equora Integration

Stand: v57.60

## MEXC Read-only-Connector

Serverdateien:

- `lib/server/mexc-readonly.ts`: Signatur und lesende MEXC-Abfragen
- `lib/server/broker-secret-store.ts`: AES-256-GCM-Verschlüsselung
- `lib/server/broker-preview.ts`: Vorschau und Fingerprints
- `lib/server/broker-sync.ts`: Seiten-Snapshot
- `app/actions/broker-sync.ts`: Verbinden, erneut prüfen und entfernen

Oberfläche:

- `components/broker-sync/broker-sync-hub.tsx`
- `components/broker-sync/mexc-connection-panel.tsx`

SQL:

- `supabase/schema-patch-v57.52.sql`: Broker-Grundtabellen
- `supabase/schema-patch-v57.60.sql`: verschlüsselter Zugangsspeicher

## Servervariablen

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
EQUORA_BROKER_SECRET_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` und `EQUORA_BROKER_SECRET_KEY` dürfen niemals als `NEXT_PUBLIC_`-Variable angelegt werden.

## MEXC-Signatur

Private GET-Abfragen verwenden serverseitig:

- Header `ApiKey`
- Header `Request-Time`
- Header `Signature`
- HMAC-SHA256 über API-Key, Zeitstempel und sortierte Query-Parameter

Der MEXC-Zeitserver wird vor der privaten Abfrage gelesen, um Zeitabweichungen zu reduzieren.

## Produktgrenze

Der Connector enthält ausschließlich GET-Abfragen. Schreibende Order-, Transfer- und Auszahlungsendpunkte sind nicht implementiert.

## Interne Performance-Diagnose

Die Diagnose bleibt als internes Werkzeug im Projekt und ist im Produktionsbetrieb standardmäßig deaktiviert.

```text
EQUORA_PERFORMANCE_DIAGNOSTICS=false
EQUORA_PERFORMANCE_LOGS=false
```

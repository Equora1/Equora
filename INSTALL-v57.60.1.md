# Installation und Migration – Equora Starter v57.60.1

## Freigabegrenze

Der Code darf erst produktiv ausgerollt werden, wenn der SQL-Patch in einer Staging-Datenbank erfolgreich ausgeführt wurde. Typecheck, Tests und Build ersetzen keine Datenbankprüfung.

## 1. Vorbedingungen

- Schreibzugriffe vor dem Backup stoppen und den Wartungszeitraum dokumentieren;
- danach vollständiges Datenbank- und Schema-Backup erstellen;
- Bucket `equora-media` inventarisieren oder sichern;
- funktionierende v57.60-Installation und Node.js 24 LTS;
- getrennte Secrets für Broker-Verschlüsselung und Maintenance-Worker.

Bestehende v57.60-Datenbank: nur `supabase/schema-patch-v57.60.1.sql` anwenden. Neuinstallation: zuerst `supabase/schema.sql`, danach denselben v57.60.1-Patch.

## 2. Migrationswirkung

- `equora-media` wird privat; Ansichten erzeugen kurzlebige Signed URLs.
- Nicht zugeordnete Legacy-URLs stoppen die Migration. Nichts wird automatisch geraten oder blind gelöscht.
- Löschungen von Medienzeilen erzeugen dauerhafte Jobs in `media_cleanup_outbox`.
- Upload-Intents werden ausschließlich für existente, dem angemeldeten Nutzer gehörende Trades oder Setups registriert; die Datenbank serialisiert und begrenzt die Reservierungen pro Nutzer.
- Mehrtabellen-Änderungen sind innerhalb PostgreSQL atomar. Storage und DB bleiben eine Saga mit Kompensation und Outbox.
- Neue monetäre Trades erfordern `EUR`, `USD`, `GBP`, `USDT` oder `USDC`.
- Gemischte oder unbekannte Geldeinheiten werden nicht umgerechnet, sondern gesperrt.
- Review-Snapshots werden serverseitig aus den eigenen Trades berechnet.
- Direkte Browser-Mutationen an Import-Batches und Broker-Verbindungen werden entzogen.

## 3. Umgebungsvariablen

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
EQUORA_BROKER_SECRET_KEY=
EQUORA_MAINTENANCE_SECRET=
```

Secrets nur serverseitig speichern und nie in Repository, Logs oder Screenshots übernehmen.

## 4. Preflight vor dem Patch

```sql
select count(*) as ownerless_import_batches
from public.trade_import_batches where user_id is null;

select count(*) as unreconciled_trade_urls
from public.trades where screenshot_url is not null;

select count(*) as unreconciled_setup_urls
from public.setups where cover_image_url is not null;

select count(*) as unreconciled_shared_urls
from public.shared_trade_submissions where shared_screenshot_url is not null;

select count(*) as invalid_trade_media
from public.trade_media m
where m.user_id is null
   or m.trade_id is null
   or m.storage_path !~ ('^' || m.user_id::text || '/trades/' || m.trade_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$')
   or not exists (select 1 from storage.objects o where o.bucket_id = 'equora-media' and o.name = m.storage_path);

select count(*) as invalid_setup_media
from public.setup_media m
where m.user_id is null
   or m.setup_id is null
   or m.storage_path !~ ('^' || m.user_id::text || '/setups/' || m.setup_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$')
   or not exists (select 1 from storage.objects o where o.bucket_id = 'equora-media' and o.name = m.storage_path);
```

Alle sechs Werte müssen `0` sein. Andernfalls gilt **No-Go** und die Daten werden unter A4/A5 fachlich zugeordnet.

## 5. Technische Verifikation

```powershell
npm install
npm run typecheck
npm test
npm run release:check
npm run build
```

Danach in Staging prüfen:

```sql
select id, public from storage.buckets where id = 'equora-media';

select account_currency, count(*)
from public.trades where net_pnl is not null
group by account_currency order by account_currency nulls first;

select conname, convalidated from pg_constraint
where conname in (
  'trades_account_currency_supported_v57601',
  'trades_monetary_values_require_currency_v57601',
  'review_sessions_monetary_scope_v57601'
);

select count(*) as pending_cleanup
from public.media_cleanup_outbox where completed_at is null;
```

Die Constraints sind teilweise absichtlich `NOT VALID`: neue/geänderte Zeilen sind geschützt; historische Währungen werden erst nach A5/A3-Prüfung fachlich korrigiert und validiert.

## 6. Staging-Abnahme

- Eigene Medien lesbar, fremde Nutzerpfade nicht lesbar.
- Fault-Injection für Upload-, Signed-URL-, RPC- und Cleanup-Fehler: jeder geplante Upload besitzt vorab einen dauerhaften Intent; alte und bereits neu referenzierte Medien bleiben erhalten.
- Trade-, Setup-, Review- und Import-Graphen sind innerhalb der DB vollständig oder gar nicht gespeichert.
- EUR/USD/USDT/USDC werden nie ohne definierte FX-Logik addiert.
- Legacy-Edit ohne Währung bleibt leer und wird bis zur Auswahl blockiert.
- Broker-Verbindung und Credential werden gemeinsam erstellt bzw. gelöscht oder gar nicht.
- MEXC bleibt read-only; keine Order-, Transfer- oder Cancel-Funktion.

## 7. Rollback

1. Schreibzugriffe gestoppt lassen.
2. v57.60-Anwendung bereitstellen.
3. Datenbank aus dem Pre-Migration-Backup wiederherstellen.
4. Storage gegen das Inventar prüfen.
5. Ursache und Restrisiko dokumentieren; erneute Migration erst nach Gate-Review.

Den Bucket nicht als Schnelllösung wieder öffentlich schalten.

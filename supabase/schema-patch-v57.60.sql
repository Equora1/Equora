-- Equora v57.60
-- Verschlüsselter Zugangsspeicher für den ersten MEXC Read-only-Connector.
-- API-Schlüssel und Secrets werden ausschließlich serverseitig verschlüsselt gespeichert.

create table if not exists public.broker_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  encrypted_payload text not null,
  key_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_broker_credentials_user_created_at
  on public.broker_credentials (user_id, created_at desc);

alter table public.broker_credentials enable row level security;

-- Absichtlich keine Nutzer-Policies: Nur serverseitige Service-Role-Zugriffe dürfen
-- verschlüsselte Broker-Zugänge lesen, schreiben oder löschen.
revoke all on table public.broker_credentials from anon, authenticated;

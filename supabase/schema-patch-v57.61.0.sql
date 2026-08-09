-- Equora v57.61.0 - G1 broker-extensible read-only capture persistence.
-- The current atomic provider-result contract is deliberately MEXC Futures v1.
--
-- Local migration artifact only. This file must not be executed against a
-- Supabase project or production database before the documented migration,
-- rollback, RLS and restore gates have passed and the user has approved it.
--
-- This patch is additive. It does not normalize broker events, create journal
-- trades, enable a scheduler, access credentials or call a broker.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '120s';

create schema if not exists extensions;
create schema if not exists equora_private;
revoke all on schema equora_private from public, anon, authenticated, service_role;

create table if not exists equora_private.schema_migrations (
  migration_id text primary key,
  contract_fingerprint text not null,
  applied_at timestamptz not null default now(),
  constraint schema_migrations_id_check
    check (migration_id ~ '^[a-z0-9_.-]{1,127}$'),
  constraint schema_migrations_fingerprint_check
    check (contract_fingerprint ~ '^[a-f0-9]{64}$')
);
alter table equora_private.schema_migrations enable row level security;
revoke all on table equora_private.schema_migrations
  from public, anon, authenticated, service_role;

do $$
declare
  v_migration_id constant text := 'equora_v57.61.0_broker_capture_v1';
  v_contract_fingerprint constant text := 'ab08958bdeb88b9637351e2690c08f311d1653f3dba33d4cf11c61d4a81399b6';
  v_existing_fingerprint text;
begin
  select contract_fingerprint into v_existing_fingerprint
  from equora_private.schema_migrations
  where migration_id = v_migration_id;

  if v_existing_fingerprint is null and exists (
    select 1
    from unnest(array[
      'public.broker_providers',
      'public.broker_accounts',
      'equora_private.broker_capture_integrity_keys',
      'public.broker_account_identities',
      'public.broker_connection_accounts',
      'public.broker_sync_activation_series',
      'public.broker_sync_activations',
      'public.broker_sync_scopes',
      'public.broker_capture_runs',
      'public.broker_capture_work_units',
      'public.broker_provider_request_results',
      'public.broker_raw_responses',
      'public.broker_capture_raw_events',
      'public.broker_capture_event_observations'
    ]) as target(qualified_name)
    where to_regclass(target.qualified_name) is not null
  ) then
    raise exception 'MIGRATION_PREEXISTING_PARTIAL_SCHEMA';
  end if;

  if v_existing_fingerprint is not null
    and v_existing_fingerprint is distinct from v_contract_fingerprint
  then
    raise exception 'MIGRATION_CONTRACT_FINGERPRINT_DRIFT';
  end if;
end;
$$;

-- Preserve only the user-attestation meaning of the legacy permission pair.
-- Successful GETs remain capability evidence and never prove that a MEXC key
-- has no additional provider-side permissions.
update public.broker_connections
set permissions = array['read_only_user_attested']::text[],
    updated_at = clock_timestamp()
where provider = 'mexc'
  and permissions @> array['futures_read_verified', 'read_only_confirmed']::text[]
  and permissions <@ array['futures_read_verified', 'read_only_confirmed']::text[];

create extension if not exists pgcrypto with schema extensions;

-- pgcrypto is relocatable and Supabase projects do not all install it in the
-- same schema. Create a fixed, security-definer-safe wrapper against the
-- catalog-confirmed extension namespace instead of assuming public/extensions.
do $$
declare
  v_pgcrypto_schema text;
begin
  select namespace_row.nspname into v_pgcrypto_schema
  from pg_extension extension_row
  join pg_namespace namespace_row on namespace_row.oid = extension_row.extnamespace
  where extension_row.extname = 'pgcrypto';

  if v_pgcrypto_schema is null then
    raise exception 'MIGRATION_PGCRYPTO_NOT_AVAILABLE';
  end if;

  execute format($function$
    create or replace function public.equora_pgcrypto_digest_v1(
      p_value bytea,
      p_algorithm text
    ) returns bytea
    language sql
    immutable
    strict
    set search_path = ''
    as $body$
      select %I.digest(p_value, p_algorithm)
    $body$
  $function$, v_pgcrypto_schema);

  execute format($function$
    create or replace function public.equora_pgcrypto_hmac_v1(
      p_value bytea,
      p_key bytea,
      p_algorithm text
    ) returns bytea
    language sql
    immutable
    strict
    set search_path = ''
    as $body$
      select %I.hmac(p_value, p_key, p_algorithm)
    $body$
  $function$, v_pgcrypto_schema);
end;
$$;

revoke all on function public.equora_pgcrypto_digest_v1(bytea, text)
  from public, anon, authenticated, service_role;
revoke all on function public.equora_pgcrypto_hmac_v1(bytea, bytea, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Existing v57.60.1 parents: add composite keys required by tenant-bound FKs.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'broker_connections_id_user_provider_environment_key'
      and conrelid = 'public.broker_connections'::regclass
  ) then
    alter table public.broker_connections
      add constraint broker_connections_id_user_provider_environment_key
      unique (id, user_id, provider, environment);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'broker_credentials_id_user_provider_version_key'
      and conrelid = 'public.broker_credentials'::regclass
  ) then
    alter table public.broker_credentials
      add constraint broker_credentials_id_user_provider_version_key
      unique (id, user_id, provider, key_version);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'broker_credentials_id_user_provider_key'
      and conrelid = 'public.broker_credentials'::regclass
  ) then
    alter table public.broker_credentials
      add constraint broker_credentials_id_user_provider_key
      unique (id, user_id, provider);
  end if;
end;
$$;

create index if not exists idx_broker_connections_owner_provider_environment
  on public.broker_connections (user_id, provider, environment, id);

create index if not exists idx_broker_credentials_owner_provider
  on public.broker_credentials (user_id, provider, id);
create index if not exists idx_broker_credentials_owner_provider_version
  on public.broker_credentials (user_id, provider, key_version, id);

-- ---------------------------------------------------------------------------
-- Provider, economic account and connection-account association.
-- ---------------------------------------------------------------------------

create table if not exists public.broker_providers (
  provider_code text primary key,
  display_name text not null,
  status text not null,
  current_contract_version text not null,
  allowed_contract_versions text[] not null,
  readonly_capabilities jsonb not null,
  mutations_forbidden boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broker_providers_code_check
    check (provider_code ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint broker_providers_status_check
    check (status in ('draft', 'verified', 'suspended', 'retired')),
  constraint broker_providers_mutations_forbidden_check
    check (mutations_forbidden = true),
  constraint broker_providers_capabilities_object_check
    check (jsonb_typeof(readonly_capabilities) = 'object')
);

insert into public.broker_providers (
  provider_code,
  display_name,
  status,
  current_contract_version,
  allowed_contract_versions,
  readonly_capabilities,
  mutations_forbidden
) values (
  'mexc',
  'MEXC Futures',
  'verified',
  'mexc_futures_contract_v1',
  array['mexc_futures_contract_v1'],
  '{
    "historical_orders_v1":{"method":"GET","origin":"https://api.mexc.com","path":"/api/v1/private/order/list/history_orders"},
    "historical_executions_v3":{"method":"GET","origin":"https://api.mexc.com","path":"/api/v1/private/order/list/order_deals/v3"},
    "historical_positions_v1":{"method":"GET","origin":"https://api.mexc.com","path":"/api/v1/private/position/list/history_positions"},
    "funding_records_v1":{"method":"GET","origin":"https://api.mexc.com","path":"/api/v1/private/position/funding_records"}
  }'::jsonb,
  true
) on conflict (provider_code) do nothing;

do $$
begin
  if not exists (
    select 1
    from public.broker_providers
    where provider_code = 'mexc'
      and display_name = 'MEXC Futures'
      and status = 'verified'
      and current_contract_version = 'mexc_futures_contract_v1'
      and allowed_contract_versions = array['mexc_futures_contract_v1']
      and readonly_capabilities = '{
        "historical_orders_v1":{"method":"GET","origin":"https://api.mexc.com","path":"/api/v1/private/order/list/history_orders"},
        "historical_executions_v3":{"method":"GET","origin":"https://api.mexc.com","path":"/api/v1/private/order/list/order_deals/v3"},
        "historical_positions_v1":{"method":"GET","origin":"https://api.mexc.com","path":"/api/v1/private/position/list/history_positions"},
        "funding_records_v1":{"method":"GET","origin":"https://api.mexc.com","path":"/api/v1/private/position/funding_records"}
      }'::jsonb
      and mutations_forbidden = true
  ) then
    raise exception 'MIGRATION_PROVIDER_REGISTRY_DRIFT';
  end if;
end;
$$;

create table if not exists public.broker_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_code text not null references public.broker_providers (provider_code) on delete restrict,
  environment text not null,
  display_label text,
  identity_status text not null default 'connection_scoped',
  account_type text not null default 'unknown',
  capability_profile_id text not null,
  provider_contract_version text not null,
  status text not null default 'pending',
  retention_status text not null default 'active',
  ledger_generation bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broker_accounts_environment_check
    check (environment in ('live', 'demo')),
  constraint broker_accounts_identity_status_check
    check (identity_status in ('connection_scoped', 'provider_verified', 'conflicting_or_insufficient')),
  constraint broker_accounts_status_check
    check (status in ('pending', 'active', 'paused', 'revoked', 'erased')),
  constraint broker_accounts_retention_status_check
    check (retention_status in ('active', 'erasure_pending', 'erased')),
  constraint broker_accounts_ledger_generation_check
    check (ledger_generation >= 0),
  constraint broker_accounts_id_owner_provider_environment_key
    unique (id, user_id, provider_code, environment),
  constraint broker_accounts_id_owner_key
    unique (id, user_id),
  constraint broker_accounts_id_owner_provider_key
    unique (id, user_id, provider_code)
);

create table if not exists equora_private.broker_capture_integrity_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  key_version text not null,
  key_material bytea not null,
  status text not null default 'active',
  valid_from timestamptz not null,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  constraint broker_capture_integrity_keys_account_fkey
    foreign key (broker_account_id, user_id)
    references public.broker_accounts (id, user_id)
    on delete cascade,
  constraint broker_capture_integrity_keys_version_check
    check (key_version ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint broker_capture_integrity_keys_material_check
    check (octet_length(key_material) between 32 and 64),
  constraint broker_capture_integrity_keys_status_check
    check (status in ('active', 'retired', 'revoked')),
  constraint broker_capture_integrity_keys_validity_check
    check (
      valid_to is null or valid_to > valid_from
    ),
  constraint broker_capture_integrity_keys_id_owner_account_version_key
    unique (id, user_id, broker_account_id, key_version),
  constraint broker_capture_integrity_keys_owner_account_version_key
    unique (user_id, broker_account_id, key_version)
);

alter table equora_private.broker_capture_integrity_keys enable row level security;
revoke all on table equora_private.broker_capture_integrity_keys
  from public, anon, authenticated, service_role;

create index if not exists idx_broker_capture_integrity_keys_owner_account_status
  on equora_private.broker_capture_integrity_keys (
    user_id, broker_account_id, status, valid_from desc, id
  );

create table if not exists public.broker_account_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  provider_code text not null,
  environment text not null,
  identity_type text not null,
  digest_purpose text not null,
  digest_algorithm text not null,
  digest_contract_version text not null,
  hmac_key_version text not null,
  hmac_digest text not null,
  evidence_source text not null,
  verification_status text not null,
  valid_from timestamptz not null,
  retired_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint broker_account_identities_account_fkey
    foreign key (broker_account_id, user_id, provider_code, environment)
    references public.broker_accounts (id, user_id, provider_code, environment)
    on delete cascade,
  constraint broker_account_identities_type_check
    check (identity_type in (
      'provider_verified_identity',
      'cryptographic_identity_rotation',
      'user_attested_display_link',
      'conflicting_or_insufficient'
    )),
  constraint broker_account_identities_purpose_check
    check (digest_purpose = 'broker_account_identity_v1'),
  constraint broker_account_identities_algorithm_check
    check (digest_algorithm = 'hmac-sha256'),
  constraint broker_account_identities_contract_check
    check (digest_contract_version = 'equora-tcj-v1'),
  constraint broker_account_identities_key_version_check
    check (hmac_key_version ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint broker_account_identities_digest_check
    check (hmac_digest ~ '^[a-f0-9]{64}$'),
  constraint broker_account_identities_verification_check
    check (verification_status in ('unverified_reference', 'provider_verified', 'retired', 'conflicting')),
  constraint broker_account_identities_status_check
    check (status in ('active', 'retired', 'conflicting')),
  constraint broker_account_identities_retirement_check
    check ((status = 'active' and retired_at is null) or (status <> 'active' and retired_at is not null)),
  constraint broker_account_identities_id_owner_account_key
    unique (id, user_id, broker_account_id),
  constraint broker_account_identities_account_digest_version_key
    unique (broker_account_id, user_id, hmac_digest, hmac_key_version)
);

create unique index if not exists broker_account_identities_active_digest_unique
  on public.broker_account_identities (
    user_id, provider_code, environment, identity_type, hmac_key_version, hmac_digest
  ) where status = 'active';

create index if not exists idx_broker_account_identities_account_status
  on public.broker_account_identities (user_id, broker_account_id, status, valid_from desc);

create table if not exists public.broker_connection_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null,
  broker_account_id uuid not null,
  provider_code text not null,
  environment text not null,
  assignment_source text not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  status text not null default 'active',
  review_reference text,
  created_at timestamptz not null default now(),
  constraint broker_connection_accounts_connection_fkey
    foreign key (connection_id, user_id, provider_code, environment)
    references public.broker_connections (id, user_id, provider, environment)
    on delete cascade,
  constraint broker_connection_accounts_account_fkey
    foreign key (broker_account_id, user_id, provider_code, environment)
    references public.broker_accounts (id, user_id, provider_code, environment)
    on delete cascade,
  constraint broker_connection_accounts_source_check
    check (assignment_source in ('provider_verified', 'connection_scoped', 'explicit_reviewed')),
  constraint broker_connection_accounts_status_check
    check (status in ('active', 'superseded', 'revoked')),
  constraint broker_connection_accounts_time_check
    check (valid_to is null or valid_to > valid_from),
  constraint broker_connection_accounts_id_owner_account_key
    unique (id, user_id, broker_account_id),
  constraint broker_conn_accounts_owner_account_provider_env_key
    unique (id, user_id, broker_account_id, provider_code, environment)
);

create unique index if not exists broker_connection_accounts_active_connection_unique
  on public.broker_connection_accounts (connection_id)
  where status = 'active' and valid_to is null;

create index if not exists idx_broker_connection_accounts_owner_account_status
  on public.broker_connection_accounts (user_id, broker_account_id, status, valid_from desc);

-- ---------------------------------------------------------------------------
-- Activation series and immutable activation generations.
-- ---------------------------------------------------------------------------

create table if not exists public.broker_sync_activation_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_account_id uuid not null,
  broker_account_id uuid not null,
  current_sync_activation_id uuid,
  current_activation_generation integer,
  series_row_version bigint not null default 0,
  series_policy_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broker_sync_activation_series_connection_account_fkey
    foreign key (connection_account_id, user_id, broker_account_id)
    references public.broker_connection_accounts (id, user_id, broker_account_id)
    on delete cascade,
  constraint broker_sync_activation_series_generation_check
    check (current_activation_generation is null or current_activation_generation > 0),
  constraint broker_sync_activation_series_pointer_pair_check
    check ((current_sync_activation_id is null) = (current_activation_generation is null)),
  constraint broker_sync_activation_series_row_version_check
    check (series_row_version >= 0),
  constraint broker_sync_activation_series_id_owner_account_connection_key
    unique (id, user_id, broker_account_id, connection_account_id),
  constraint broker_sync_activation_series_scope_unique
    unique (user_id, connection_account_id, broker_account_id)
);

create table if not exists public.broker_sync_activations (
  id uuid primary key default gen_random_uuid(),
  activation_series_id uuid not null,
  activation_generation integer not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_account_id uuid not null,
  broker_account_id uuid not null,
  provider_code text not null references public.broker_providers (provider_code) on delete restrict,
  environment text not null,
  active_credential_id uuid not null,
  active_credential_key_version text not null,
  capture_integrity_key_id uuid not null,
  capture_integrity_key_version text not null,
  activation_cutover_at timestamptz not null,
  activated_by text not null,
  first_successful_capture_at timestamptz,
  last_successful_required_scope_id uuid,
  onboarding_profile_id text not null,
  scheduler_policy_version text not null,
  scheduler_target_seconds integer not null,
  fast_lane_overlap_seconds integer not null,
  audit_policy_version text not null,
  activation_state text not null,
  capture_health text not null,
  provider_contract_version text not null,
  adapter_version text not null,
  profile_id text not null,
  profile_version text not null,
  capability_versions jsonb not null,
  permission_evidence jsonb not null,
  permission_evidence_version text not null,
  user_read_only_attested_at timestamptz not null,
  created_at timestamptz not null default now(),
  lifecycle_updated_at timestamptz not null default now(),
  constraint broker_sync_activations_series_fkey
    foreign key (activation_series_id, user_id, broker_account_id, connection_account_id)
    references public.broker_sync_activation_series (id, user_id, broker_account_id, connection_account_id)
    on delete cascade,
  constraint broker_sync_activations_connection_account_fkey
    foreign key (connection_account_id, user_id, broker_account_id, provider_code, environment)
    references public.broker_connection_accounts (id, user_id, broker_account_id, provider_code, environment)
    on delete restrict,
  constraint broker_sync_activations_credential_fkey
    foreign key (active_credential_id, user_id, provider_code, active_credential_key_version)
    references public.broker_credentials (id, user_id, provider, key_version)
    on delete restrict,
  constraint broker_sync_activations_integrity_key_fkey
    foreign key (
      capture_integrity_key_id,
      user_id,
      broker_account_id,
      capture_integrity_key_version
    )
    references equora_private.broker_capture_integrity_keys (
      id,
      user_id,
      broker_account_id,
      key_version
    )
    on delete restrict,
  constraint broker_sync_activations_generation_check
    check (activation_generation > 0),
  constraint broker_sync_activations_scheduler_target_check
    check (scheduler_target_seconds = 21600),
  constraint broker_sync_activations_fast_lane_overlap_check
    check (fast_lane_overlap_seconds = 259200),
  constraint broker_sync_activations_onboarding_check
    check (onboarding_profile_id = 'recent_28d_plus_current_utc_day_v1'),
  constraint broker_sync_activations_state_check
    check (activation_state in ('inactive', 'blocked_permission_evidence', 'pending', 'active', 'paused', 'revoked')),
  constraint broker_sync_activations_health_check
    check (capture_health in ('pending', 'healthy', 'degraded', 'gap_requires_export', 'paused', 'revoked')),
  constraint broker_sync_activations_capability_versions_check
    check (jsonb_typeof(capability_versions) = 'object'),
  constraint broker_sync_activations_credential_version_check
    check (active_credential_key_version ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint broker_sync_activations_integrity_key_version_check
    check (capture_integrity_key_version ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint broker_sync_activations_permission_evidence_check
    check (jsonb_typeof(permission_evidence) = 'object'),
  constraint broker_sync_activations_series_generation_unique
    unique (activation_series_id, activation_generation),
  constraint broker_sync_activations_current_pointer_key
    unique (id, activation_series_id, activation_generation, user_id, broker_account_id, connection_account_id),
  constraint broker_sync_activations_id_owner_account_generation_key
    unique (id, user_id, broker_account_id, activation_generation),
  constraint broker_sync_activations_scope_contract_key
    unique (
      id,
      user_id,
      broker_account_id,
      activation_generation,
      provider_code,
      provider_contract_version,
      adapter_version,
      profile_id,
      profile_version
    )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'broker_sync_activation_series_current_pointer_fkey'
      and conrelid = 'public.broker_sync_activation_series'::regclass
  ) then
    alter table public.broker_sync_activation_series
      add constraint broker_sync_activation_series_current_pointer_fkey
      foreign key (
        current_sync_activation_id,
        id,
        current_activation_generation,
        user_id,
        broker_account_id,
        connection_account_id
      )
      references public.broker_sync_activations (
        id,
        activation_series_id,
        activation_generation,
        user_id,
        broker_account_id,
        connection_account_id
      )
      on delete restrict
      deferrable initially deferred;
  end if;
end;
$$;

create index if not exists idx_broker_sync_activation_series_current
  on public.broker_sync_activation_series (
    user_id, broker_account_id, current_sync_activation_id, current_activation_generation
  );

create index if not exists idx_broker_sync_activations_owner_state
  on public.broker_sync_activations (user_id, broker_account_id, activation_state, created_at desc);
create index if not exists idx_broker_sync_activations_credential_version
  on public.broker_sync_activations (
    active_credential_id, user_id, provider_code, active_credential_key_version
  );
create index if not exists idx_broker_sync_activations_integrity_key
  on public.broker_sync_activations (
    capture_integrity_key_id, user_id, broker_account_id, capture_integrity_key_version
  );

-- ---------------------------------------------------------------------------
-- Immutable capture scope, run and resumable work unit.
-- ---------------------------------------------------------------------------

create table if not exists public.broker_sync_scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  provider_code text not null,
  account_identity_digest text not null,
  account_identity_key_version text not null,
  source_channel text not null,
  profile_id text not null,
  profile_version text not null,
  provider_contract_version text not null,
  adapter_version text not null,
  capability_id text not null,
  endpoint_id text not null,
  instrument_scope_key text not null,
  instrument_symbol text not null,
  position_type integer,
  lane_id text not null,
  request_start_ms bigint not null,
  request_end_ms bigint not null,
  bucket_start_ms bigint not null,
  bucket_end_ms bigint not null,
  boundary_policy_version text not null,
  boundary_semantics text not null,
  overlap_policy text not null,
  scope_generation integer not null,
  stability_generation integer not null,
  coverage_basis text not null,
  coverage_policy text not null,
  scope_completeness text not null,
  stability_status text not null,
  lane_health_snapshot text,
  digest_algorithm text not null,
  digest_contract_version text not null,
  digest_version text not null,
  stability_bucket_digest text not null,
  scope_digest text not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint broker_sync_scopes_activation_fkey
    foreign key (
      sync_activation_id,
      user_id,
      broker_account_id,
      activation_generation,
      provider_code,
      provider_contract_version,
      adapter_version,
      profile_id,
      profile_version
    )
    references public.broker_sync_activations (
      id,
      user_id,
      broker_account_id,
      activation_generation,
      provider_code,
      provider_contract_version,
      adapter_version,
      profile_id,
      profile_version
    )
    on delete restrict,
  constraint broker_sync_scopes_account_identity_fkey
    foreign key (
      broker_account_id,
      user_id,
      account_identity_digest,
      account_identity_key_version
    )
    references public.broker_account_identities (
      broker_account_id,
      user_id,
      hmac_digest,
      hmac_key_version
    )
    on delete restrict,
  constraint broker_sync_scopes_source_channel_check
    check (source_channel in ('provider_api_observation', 'provider_export_file')),
  constraint broker_sync_scopes_lane_check
    check (lane_id in (
      'onboarding_once',
      'incremental_fast_6h',
      'rolling_audit_7d_daily',
      'rolling_audit_28d_weekly',
      'file_backfill_manual',
      'file_recovery_manual'
    )),
  constraint broker_sync_scopes_window_check
    check (request_start_ms <= request_end_ms),
  constraint broker_sync_scopes_bucket_check
    check (bucket_start_ms < bucket_end_ms),
  constraint broker_sync_scopes_generation_check
    check (scope_generation > 0 and stability_generation > 0 and activation_generation > 0),
  constraint broker_sync_scopes_coverage_basis_check
    check (coverage_basis in ('provider_observed', 'provider_export_observed')),
  constraint broker_sync_scopes_coverage_policy_check
    check (coverage_policy in ('strict_export_verified', 'provider_observed_best_effort', 'pending_user_policy')),
  constraint broker_sync_scopes_completeness_check
    check (scope_completeness in ('complete_for_profile', 'partial', 'failed', 'unverified')),
  constraint broker_sync_scopes_stability_check
    check (stability_status in ('not_observed', 'observed_once', 'observed_stable', 'invalidated')),
  constraint broker_sync_scopes_digest_metadata_check
    check (
      digest_algorithm = 'sha256'
      and digest_contract_version = 'equora-tcj-v1'
      and digest_version = 'equora-tcj-v1'
    ),
  constraint broker_sync_scopes_digest_check
    check (scope_digest ~ '^[a-f0-9]{64}$' and stability_bucket_digest ~ '^[a-f0-9]{64}$'),
  constraint broker_sync_scopes_id_owner_account_key
    unique (id, user_id, broker_account_id),
  constraint broker_sync_scopes_id_owner_account_activation_key
    unique (id, user_id, broker_account_id, sync_activation_id, activation_generation),
  constraint broker_sync_scopes_id_owner_account_activation_lane_key
    unique (id, user_id, broker_account_id, sync_activation_id, activation_generation, lane_id),
  constraint broker_sync_scopes_digest_unique
    unique (user_id, broker_account_id, sync_activation_id, activation_generation, scope_digest)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'broker_sync_activations_last_successful_scope_fkey'
      and conrelid = 'public.broker_sync_activations'::regclass
  ) then
    alter table public.broker_sync_activations
      add constraint broker_sync_activations_last_successful_scope_fkey
      foreign key (
        last_successful_required_scope_id,
        user_id,
        broker_account_id,
        id,
        activation_generation
      )
      references public.broker_sync_scopes (
        id,
        user_id,
        broker_account_id,
        sync_activation_id,
        activation_generation
      )
      on delete restrict
      deferrable initially deferred;
  end if;
end;
$$;

create table if not exists public.broker_capture_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  lane_id text not null,
  trigger_kind text not null,
  status text not null default 'pending',
  adapter_version text not null,
  algorithm_version text not null,
  started_at timestamptz,
  completed_at timestamptz,
  observed_event_count integer not null default 0,
  inserted_raw_event_count integer not null default 0,
  repeated_observation_count integer not null default 0,
  failed_request_count integer not null default 0,
  scope_count integer not null default 0,
  scope_completeness_summary jsonb not null default '{}'::jsonb,
  lane_health_summary_snapshot jsonb,
  lane_health_summary_derived_at timestamptz,
  derive_capture_health_version text,
  created_at timestamptz not null default now(),
  constraint broker_capture_runs_activation_fkey
    foreign key (sync_activation_id, user_id, broker_account_id, activation_generation)
    references public.broker_sync_activations (id, user_id, broker_account_id, activation_generation)
    on delete restrict,
  constraint broker_capture_runs_lane_check
    check (lane_id in (
      'onboarding_once',
      'incremental_fast_6h',
      'rolling_audit_7d_daily',
      'rolling_audit_28d_weekly',
      'file_backfill_manual',
      'file_recovery_manual'
    )),
  constraint broker_capture_runs_trigger_check
    check (trigger_kind in ('user', 'scheduler', 'startup_catchup', 'file_selection', 'recovery')),
  constraint broker_capture_runs_status_check
    check (status in ('pending', 'running', 'partial', 'completed', 'failed', 'cancelled')),
  constraint broker_capture_runs_counts_check
    check (
      observed_event_count >= 0
      and inserted_raw_event_count >= 0
      and repeated_observation_count >= 0
      and failed_request_count >= 0
      and scope_count >= 0
    ),
  constraint broker_capture_runs_id_owner_account_key
    unique (id, user_id, broker_account_id),
  constraint broker_capture_runs_id_owner_account_activation_key
    unique (id, user_id, broker_account_id, sync_activation_id, activation_generation),
  constraint broker_capture_runs_id_owner_account_activation_lane_key
    unique (id, user_id, broker_account_id, sync_activation_id, activation_generation, lane_id)
);

create table if not exists public.broker_capture_work_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  run_id uuid not null,
  scope_id uuid not null,
  lane_id text not null,
  status text not null default 'pending',
  attempt integer not null default 0,
  lease_token_digest text,
  lease_token_format_version text,
  lease_expires_at timestamptz,
  lease_epoch bigint not null default 0,
  lease_acquired_at timestamptz,
  lease_max_expires_at timestamptz,
  lease_renew_count integer not null default 0,
  lease_policy_version text,
  recovery_state text not null default 'none',
  predecessor_work_unit_id uuid,
  continuation_generation integer not null default 0,
  row_version bigint not null default 0,
  checkpoint jsonb not null,
  checkpoint_mac text not null,
  request_sequence integer not null default 0,
  low_watermark jsonb,
  high_watermark jsonb,
  resume_token_digest text,
  last_error_class text,
  successful_page_count integer not null default 0,
  observed_event_count integer not null default 0,
  response_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broker_capture_work_units_run_fkey
    foreign key (run_id, user_id, broker_account_id, sync_activation_id, activation_generation, lane_id)
    references public.broker_capture_runs (id, user_id, broker_account_id, sync_activation_id, activation_generation, lane_id)
    on delete cascade,
  constraint broker_capture_work_units_scope_fkey
    foreign key (scope_id, user_id, broker_account_id, sync_activation_id, activation_generation, lane_id)
    references public.broker_sync_scopes (id, user_id, broker_account_id, sync_activation_id, activation_generation, lane_id)
    on delete restrict,
  constraint broker_capture_work_units_status_check
    check (status in ('pending', 'leased', 'running', 'retry_pending', 'yielded', 'terminal_observed', 'partial_failed', 'cancelled')),
  constraint broker_capture_work_units_attempt_check
    check (attempt >= 0 and row_version >= 0 and request_sequence >= 0),
  constraint broker_capture_work_units_lease_pair_check
    check (
      (lease_token_digest is null and lease_token_format_version is null and lease_expires_at is null)
      or (
        lease_token_digest ~ '^[a-f0-9]{64}$'
        and lease_token_format_version = 'uuid-sha256-v1'
        and lease_expires_at is not null
      )
    ),
  constraint broker_capture_work_units_checkpoint_object_check
    check (jsonb_typeof(checkpoint) = 'object'),
  constraint broker_capture_work_units_checkpoint_mac_check
    check (checkpoint_mac ~ '^[a-f0-9]{64}$'),
  constraint broker_capture_work_units_resume_digest_check
    check (resume_token_digest is null or resume_token_digest ~ '^[a-f0-9]{64}$'),
  constraint broker_capture_work_units_counts_check
    check (successful_page_count >= 0 and observed_event_count >= 0 and response_bytes >= 0),
  constraint broker_capture_work_units_id_owner_account_key
    unique (id, user_id, broker_account_id),
  constraint broker_capture_work_units_id_run_scope_key
    unique (id, run_id, scope_id, user_id, broker_account_id)
);

alter table public.broker_capture_work_units
  add column if not exists lease_epoch bigint not null default 0,
  add column if not exists lease_acquired_at timestamptz,
  add column if not exists lease_max_expires_at timestamptz,
  add column if not exists lease_renew_count integer not null default 0,
  add column if not exists lease_policy_version text,
  add column if not exists recovery_state text not null default 'none',
  add column if not exists predecessor_work_unit_id uuid,
  add column if not exists continuation_generation integer not null default 0;

create index if not exists idx_broker_sync_scopes_owner_account_status_created
  on public.broker_sync_scopes (user_id, broker_account_id, scope_completeness, created_at desc, id);

create index if not exists idx_broker_capture_runs_owner_account_status_created
  on public.broker_capture_runs (user_id, broker_account_id, status, created_at desc, id);

create index if not exists idx_broker_capture_work_units_run_status
  on public.broker_capture_work_units (run_id, status, id);

create index if not exists idx_broker_capture_work_units_scope_status
  on public.broker_capture_work_units (scope_id, status, id);

create index if not exists idx_broker_capture_work_units_active_lease
  on public.broker_capture_work_units (lease_expires_at, id)
  where lease_token_digest is not null and status in ('leased', 'running');

create index if not exists idx_broker_capture_work_units_owner
  on public.broker_capture_work_units (user_id, id);

-- ---------------------------------------------------------------------------
-- Immutable request result, raw response, raw event and N:M observation.
-- ---------------------------------------------------------------------------

create table if not exists public.broker_provider_request_results (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  run_id uuid not null,
  scope_id uuid not null,
  work_unit_id uuid not null,
  provider_code text not null,
  capability_id text not null,
  endpoint_id text not null,
  request_sequence integer not null,
  method text not null,
  request_origin text not null,
  request_path text not null,
  request_query jsonb not null,
  transport_contract_version text not null,
  request_started_at timestamptz not null,
  response_received_at timestamptz not null,
  request_duration_ms integer not null,
  http_status integer not null,
  provider_status_class text not null,
  response_classification text not null,
  result_count integer not null,
  response_bytes integer not null,
  page_observation_digest text not null,
  page_metadata jsonb not null,
  scope_completeness text not null,
  created_at timestamptz not null default now(),
  constraint broker_provider_request_results_work_unit_fkey
    foreign key (work_unit_id, run_id, scope_id, user_id, broker_account_id)
    references public.broker_capture_work_units (id, run_id, scope_id, user_id, broker_account_id)
    on delete cascade,
  constraint broker_provider_request_results_method_check
    check (method = 'GET'),
  constraint broker_provider_request_results_origin_check
    check (request_origin ~ '^https://[a-z0-9.-]+$'),
  constraint broker_provider_request_results_path_check
    check (request_path ~ '^/api/v1/[a-z0-9_/-]+$'),
  constraint broker_provider_request_results_query_object_check
    check (jsonb_typeof(request_query) = 'object'),
  constraint broker_provider_request_results_sequence_check
    check (request_sequence > 0),
  constraint broker_provider_request_results_time_check
    check (response_received_at >= request_started_at and request_duration_ms >= 0),
  constraint broker_provider_request_results_http_status_check
    check (http_status between 100 and 599),
  constraint broker_provider_request_results_status_class_check
    check (provider_status_class = 'success'),
  constraint broker_provider_request_results_response_class_check
    check (response_classification in (
      'valid_read_preview_only',
      'blocked_unobserved_position_items',
      'blocked_funding_authority'
    )),
  constraint broker_provider_request_results_counts_check
    check (result_count >= 0 and response_bytes between 1 and 65536),
  constraint broker_provider_request_results_page_digest_check
    check (page_observation_digest ~ '^[a-f0-9]{64}$'),
  constraint broker_provider_request_results_scope_completeness_check
    check (scope_completeness in ('unverified', 'partial', 'failed')),
  constraint broker_provider_request_results_work_unit_sequence_unique
    unique (work_unit_id, request_sequence),
  constraint broker_provider_request_results_id_owner_account_key
    unique (id, user_id, broker_account_id),
  constraint broker_provider_request_results_id_run_owner_account_key
    unique (id, run_id, user_id, broker_account_id)
);

create table if not exists public.broker_raw_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  request_result_id uuid not null,
  raw_body bytea,
  raw_body_digest text not null,
  digest_algorithm text not null,
  digest_contract_version text not null,
  content_encoding text not null,
  decompressed_bytes integer not null,
  erasure_status text not null default 'retained',
  retained_at timestamptz not null default now(),
  erased_at timestamptz,
  constraint broker_raw_responses_request_result_fkey
    foreign key (request_result_id, user_id, broker_account_id)
    references public.broker_provider_request_results (id, user_id, broker_account_id)
    on delete cascade,
  constraint broker_raw_responses_request_unique
    unique (request_result_id),
  constraint broker_raw_responses_digest_check
    check (raw_body_digest ~ '^[a-f0-9]{64}$'),
  constraint broker_raw_responses_digest_metadata_check
    check (digest_algorithm = 'sha256' and digest_contract_version = 'equora-tcj-v1'),
  constraint broker_raw_responses_encoding_check
    check (content_encoding = 'identity'),
  constraint broker_raw_responses_bytes_check
    check (decompressed_bytes between 1 and 65536),
  constraint broker_raw_responses_erasure_status_check
    check (erasure_status = 'retained'),
  constraint broker_raw_responses_erasure_shape_check
    check (raw_body is not null and erased_at is null)
);

create table if not exists public.broker_capture_raw_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  provider_code text not null references public.broker_providers (provider_code) on delete restrict,
  account_identity_digest text not null,
  source_channel text not null,
  source_profile_id text not null,
  source_profile_version text not null,
  membership_key text not null,
  event_type text not null,
  identity_status text not null,
  external_event_id text,
  provider_revision text,
  provider_revision_authority text not null,
  revision_discriminator text not null,
  revision_discriminator_value text not null,
  provider_occurred_at_us bigint,
  raw_payload jsonb not null,
  raw_event_content_digest text not null,
  digest_algorithm text not null,
  digest_contract_version text not null,
  provider_contract_version text not null,
  endpoint_id text not null,
  first_observed_at_us bigint not null,
  erasure_status text not null default 'retained',
  created_at timestamptz not null default now(),
  erased_at timestamptz,
  constraint broker_capture_raw_events_account_fkey
    foreign key (broker_account_id, user_id, provider_code)
    references public.broker_accounts (id, user_id, provider_code)
    on delete cascade,
  constraint broker_capture_raw_events_event_type_check
    check (event_type in ('order', 'execution', 'position', 'funding', 'account_financial_event', 'contract_metadata')),
  constraint broker_capture_raw_events_identity_check
    check (
      (identity_status = 'stable_provider_id' and external_event_id is not null)
      or (identity_status = 'blocked_identity' and external_event_id is null)
    ),
  constraint broker_capture_raw_events_revision_authority_check
    check (provider_revision_authority in ('unverified', 'provider_stable')),
  constraint broker_capture_raw_events_revision_discriminator_check
    check (revision_discriminator in ('provider_revision', 'payload_hash_fallback', 'blocked_payload_fingerprint')),
  constraint broker_capture_raw_events_payload_object_check
    check (jsonb_typeof(raw_payload) = 'object'),
  constraint broker_capture_raw_events_digest_check
    check (
      account_identity_digest ~ '^[a-f0-9]{64}$'
      and raw_event_content_digest ~ '^[a-f0-9]{64}$'
    ),
  constraint broker_capture_raw_events_digest_metadata_check
    check (digest_algorithm = 'sha256' and digest_contract_version = 'equora-tcj-v1'),
  constraint broker_capture_raw_events_observed_time_check
    check (first_observed_at_us > 0),
  constraint broker_capture_raw_events_erasure_status_check
    check (erasure_status = 'retained'),
  constraint broker_capture_raw_events_erasure_shape_check
    check (raw_payload is not null and erased_at is null),
  constraint broker_capture_raw_events_id_owner_account_key
    unique (id, user_id, broker_account_id),
  constraint broker_capture_raw_events_membership_unique
    unique (user_id, broker_account_id, membership_key),
  constraint broker_capture_raw_events_provider_identity_unique
    unique (
      user_id,
      broker_account_id,
      provider_code,
      event_type,
      external_event_id,
      revision_discriminator,
      revision_discriminator_value
    )
);

create table if not exists public.broker_capture_event_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  raw_event_id uuid not null,
  run_id uuid not null,
  request_result_id uuid not null,
  event_index integer not null,
  observed_at_us bigint not null,
  occurrence text not null,
  page_observation_digest text not null,
  observation_digest text not null,
  created_at timestamptz not null default now(),
  constraint broker_capture_event_observations_raw_event_fkey
    foreign key (raw_event_id, user_id, broker_account_id)
    references public.broker_capture_raw_events (id, user_id, broker_account_id)
    on delete cascade,
  constraint broker_capture_event_observations_request_fkey
    foreign key (request_result_id, run_id, user_id, broker_account_id)
    references public.broker_provider_request_results (id, run_id, user_id, broker_account_id)
    on delete cascade,
  constraint broker_capture_event_observations_event_index_check
    check (event_index between 0 and 999),
  constraint broker_capture_event_observations_time_check
    check (observed_at_us > 0),
  constraint broker_capture_event_observations_occurrence_check
    check (occurrence in ('first_observation', 'repeated_observation')),
  constraint broker_capture_event_observations_digest_check
    check (page_observation_digest ~ '^[a-f0-9]{64}$' and observation_digest ~ '^[a-f0-9]{64}$'),
  constraint broker_capture_event_observations_request_event_unique
    unique (request_result_id, raw_event_id),
  constraint broker_capture_event_observations_request_index_unique
    unique (request_result_id, event_index),
  constraint broker_capture_event_observations_digest_unique
    unique (user_id, broker_account_id, observation_digest)
);

create index if not exists idx_broker_provider_request_results_work_unit_created
  on public.broker_provider_request_results (work_unit_id, request_sequence, created_at);

create index if not exists idx_broker_provider_request_results_owner
  on public.broker_provider_request_results (user_id, id);

create index if not exists idx_broker_raw_responses_owner_account_retention
  on public.broker_raw_responses (user_id, broker_account_id, erasure_status, retained_at);

create index if not exists idx_broker_capture_raw_events_owner_account_type_time
  on public.broker_capture_raw_events (
    user_id, broker_account_id, event_type, provider_occurred_at_us desc, id
  );

create index if not exists idx_broker_capture_event_observations_raw_event
  on public.broker_capture_event_observations (raw_event_id, observed_at_us desc, id);

create index if not exists idx_broker_capture_event_observations_run
  on public.broker_capture_event_observations (run_id, request_result_id, event_index);

-- Child-side FK indexes keep lifecycle updates/deletes from widening locks into
-- tenant-table scans. Column order follows the exact FK order.
create index if not exists idx_broker_accounts_user_fkey
  on public.broker_accounts (user_id);
create index if not exists idx_broker_accounts_provider_fkey
  on public.broker_accounts (provider_code);
create index if not exists idx_broker_account_identities_account_fkey
  on public.broker_account_identities (broker_account_id, user_id, provider_code, environment);
create index if not exists idx_broker_connection_accounts_connection_fkey
  on public.broker_connection_accounts (connection_id, user_id, provider_code, environment);
create index if not exists idx_broker_connection_accounts_account_fkey
  on public.broker_connection_accounts (broker_account_id, user_id, provider_code, environment);
create index if not exists idx_broker_sync_activation_series_connection_fkey
  on public.broker_sync_activation_series (connection_account_id, user_id, broker_account_id);
create index if not exists idx_broker_sync_activation_series_pointer_fkey
  on public.broker_sync_activation_series (
    current_sync_activation_id, id, current_activation_generation, user_id, broker_account_id, connection_account_id
  );
create index if not exists idx_broker_sync_activations_series_fkey
  on public.broker_sync_activations (activation_series_id, user_id, broker_account_id, connection_account_id);
create index if not exists idx_broker_sync_activations_connection_fkey
  on public.broker_sync_activations (connection_account_id, user_id, broker_account_id, provider_code, environment);
create index if not exists idx_broker_sync_activations_credential_fkey
  on public.broker_sync_activations (active_credential_id, user_id, provider_code);
create index if not exists idx_broker_sync_activations_last_scope_fkey
  on public.broker_sync_activations (
    last_successful_required_scope_id, user_id, broker_account_id, id, activation_generation
  );
create index if not exists idx_broker_sync_scopes_activation_fkey
  on public.broker_sync_scopes (
    sync_activation_id, user_id, broker_account_id, activation_generation,
    provider_code, provider_contract_version, adapter_version, profile_id, profile_version
  );
create index if not exists idx_broker_sync_scopes_identity_fkey
  on public.broker_sync_scopes (
    broker_account_id, user_id, account_identity_digest, account_identity_key_version
  );
create index if not exists idx_broker_capture_runs_activation_fkey
  on public.broker_capture_runs (sync_activation_id, user_id, broker_account_id, activation_generation);
create index if not exists idx_broker_capture_work_units_run_fkey
  on public.broker_capture_work_units (
    run_id, user_id, broker_account_id, sync_activation_id, activation_generation, lane_id
  );
create index if not exists idx_broker_capture_work_units_scope_fkey
  on public.broker_capture_work_units (
    scope_id, user_id, broker_account_id, sync_activation_id, activation_generation, lane_id
  );
create index if not exists idx_broker_provider_request_results_work_unit_fkey
  on public.broker_provider_request_results (work_unit_id, run_id, scope_id, user_id, broker_account_id);
create index if not exists idx_broker_raw_responses_request_fkey
  on public.broker_raw_responses (request_result_id, user_id, broker_account_id);
create index if not exists idx_broker_capture_raw_events_account_fkey
  on public.broker_capture_raw_events (broker_account_id, user_id, provider_code);
create index if not exists idx_broker_capture_event_observations_raw_fkey
  on public.broker_capture_event_observations (raw_event_id, user_id, broker_account_id);
create index if not exists idx_broker_capture_event_observations_request_fkey
  on public.broker_capture_event_observations (request_result_id, run_id, user_id, broker_account_id);

-- ---------------------------------------------------------------------------
-- RLS and least privilege. The UI gets no raw-body or raw-payload table grant.
-- ---------------------------------------------------------------------------

alter table public.broker_accounts enable row level security;
alter table public.broker_account_identities enable row level security;
alter table public.broker_connection_accounts enable row level security;
alter table public.broker_sync_activation_series enable row level security;
alter table public.broker_sync_activations enable row level security;
alter table public.broker_sync_scopes enable row level security;
alter table public.broker_capture_runs enable row level security;
alter table public.broker_capture_work_units enable row level security;
alter table public.broker_provider_request_results enable row level security;
alter table public.broker_raw_responses enable row level security;
alter table public.broker_capture_raw_events enable row level security;
alter table public.broker_capture_event_observations enable row level security;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'broker_accounts',
    'broker_account_identities',
    'broker_connection_accounts',
    'broker_sync_activation_series',
    'broker_sync_activations',
    'broker_sync_scopes',
    'broker_capture_runs',
    'broker_capture_work_units',
    'broker_provider_request_results',
    'broker_raw_responses',
    'broker_capture_raw_events',
    'broker_capture_event_observations'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'users can read own ' || v_table, v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      'users can read own ' || v_table,
      v_table
    );
    execute format('revoke all on table public.%I from anon, authenticated, service_role', v_table);
  end loop;
end;
$$;

revoke all on table public.broker_providers from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Internal validation helpers.
-- ---------------------------------------------------------------------------

create or replace function public.equora_jsonb_exact_keys_v1(
  p_value jsonb,
  p_expected text[]
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    jsonb_typeof(p_value) = 'object'
    and coalesce(
      (select array_agg(key order by key) from jsonb_object_keys(p_value) as key),
      '{}'::text[]
    ) = (
      select coalesce(array_agg(value order by value), '{}'::text[])
      from unnest(p_expected) as value
    );
$$;

create or replace function public.equora_constant_time_hex_equal_v1(
  p_left text,
  p_right text
) returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_difference integer := 0;
  v_index integer;
begin
  if p_left !~ '^[a-f0-9]{64}$' or p_right !~ '^[a-f0-9]{64}$' then
    return false;
  end if;
  for v_index in 1..64 loop
    v_difference := v_difference | (ascii(substr(p_left, v_index, 1)) # ascii(substr(p_right, v_index, 1)));
  end loop;
  return v_difference = 0;
end;
$$;

create or replace function public.equora_lease_token_digest_v1(
  p_token uuid
) returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(
    public.equora_pgcrypto_digest_v1(
      convert_to('equora-lease-token-v1', 'UTF8')
      || decode('00', 'hex')
      || convert_to(p_token::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function public.equora_mexc_page_scope_digest_v1(
  p_capability_id text,
  p_symbol text,
  p_start_time_ms bigint,
  p_end_time_ms bigint,
  p_initial_page_number integer,
  p_page_size integer,
  p_position_type integer,
  p_budget_profile_id text,
  p_budget_profile_digest text
) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_part text;
  v_payload bytea := decode('', 'hex');
begin
  foreach v_part in array array[
    'mexc-page-scope-v1',
    p_capability_id,
    p_symbol,
    p_start_time_ms::text,
    p_end_time_ms::text,
    p_initial_page_number::text,
    p_page_size::text,
    coalesce(p_position_type::text, '<null>'),
    p_budget_profile_id,
    p_budget_profile_digest
  ] loop
    if v_part is null then raise exception 'MEXC_PAGE_SCOPE_INVALID'; end if;
    v_payload := v_payload || convert_to(octet_length(convert_to(v_part, 'UTF8'))::text || ':' || v_part || '|', 'UTF8');
  end loop;
  return encode(public.equora_pgcrypto_digest_v1(v_payload, 'sha256'), 'hex');
end;
$$;

create or replace function public.equora_tcj_quote_v1(
  p_value text
) returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_value text := normalize(p_value, NFC);
  v_output text := '"';
  v_character text;
  v_code integer;
  v_index integer;
begin
  for v_index in 1..char_length(v_value) loop
    v_character := substr(v_value, v_index, 1);
    v_code := ascii(v_character);
    if v_code = 34 then
      v_output := v_output || chr(92) || '"';
    elsif v_code = 92 then
      v_output := v_output || chr(92) || chr(92);
    elsif v_code between 0 and 31 then
      v_output := v_output || chr(92) || 'u00' || lpad(to_hex(v_code), 2, '0');
    else
      v_output := v_output || v_character;
    end if;
    if octet_length(v_output) > 8388607 then
      raise exception 'TCJ_BYTE_LIMIT_EXCEEDED';
    end if;
  end loop;
  return v_output || '"';
end;
$$;

create or replace function public.equora_tcj_atom_v1(
  p_type text,
  p_value text
) returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_type = 'n' then
    if p_value is not null then raise exception 'TCJ_ATOM_INVALID'; end if;
    return '["n"]';
  end if;
  if p_type = 'b' then
    if p_value not in ('true', 'false') then raise exception 'TCJ_ATOM_INVALID'; end if;
    return '["b",' || p_value || ']';
  end if;
  if p_type not in ('s', 'i', 'd', 't', 'e', 'x', 'j') or p_value is null then
    raise exception 'TCJ_ATOM_INVALID';
  end if;
  return '["' || p_type || '",' || public.equora_tcj_quote_v1(p_value) || ']';
end;
$$;

create or replace function public.equora_tcj_decimal_v1(
  p_value text
) returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_numeric numeric;
  v_result text;
begin
  if length(p_value) > 256 or p_value !~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$' then
    raise exception 'TCJ_DECIMAL_INVALID';
  end if;
  begin
    v_numeric := p_value::numeric;
  exception when others then
    raise exception 'TCJ_DECIMAL_INVALID';
  end;
  v_result := v_numeric::text;
  if position('.' in v_result) > 0 then
    v_result := regexp_replace(v_result, '0+$', '');
    v_result := regexp_replace(v_result, '\.$', '');
  end if;
  if v_result in ('-0', '') then v_result := '0'; end if;
  if octet_length(v_result) > 8388608 then raise exception 'TCJ_BYTE_LIMIT_EXCEEDED'; end if;
  return v_result;
end;
$$;

create or replace function public.equora_tcj_array_v1(
  p_values text[]
) returns text
language sql
immutable
set search_path = ''
as $$
  select '["a",[' || coalesce(array_to_string(p_values, ','), '') || ']]'
$$;

create or replace function public.equora_tcj_object_v1(
  p_encoded_values jsonb
) returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_result text := '["o",[';
  v_key text;
  v_value text;
  v_first boolean := true;
begin
  if jsonb_typeof(p_encoded_values) <> 'object' then raise exception 'TCJ_OBJECT_INVALID'; end if;
  for v_key, v_value in
    select normalize(entry.key, NFC), entry.value #>> '{}'
    from jsonb_each(p_encoded_values) entry
    order by convert_to(normalize(entry.key, NFC), 'UTF8')
  loop
    if v_value is null then raise exception 'TCJ_OBJECT_INVALID'; end if;
    if not v_first then v_result := v_result || ','; end if;
    v_result := v_result || '[' || public.equora_tcj_quote_v1(v_key) || ',' || v_value || ']';
    v_first := false;
  end loop;
  v_result := v_result || ']]';
  if octet_length(v_result) > 8388608 then raise exception 'TCJ_BYTE_LIMIT_EXCEEDED'; end if;
  return v_result;
end;
$$;

create or replace function public.equora_tcj_from_jsonb_v1(
  p_value jsonb,
  p_depth integer default 0
) returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_type text := jsonb_typeof(p_value);
  v_values text[];
  v_result text;
  v_key text;
  v_normalized_key text;
  v_previous_key text := null;
  v_item jsonb;
  v_first boolean := true;
begin
  if p_depth < 0 or p_depth > 64 then raise exception 'TCJ_DEPTH_LIMIT_EXCEEDED'; end if;
  if v_type = 'null' then return public.equora_tcj_atom_v1('n', null); end if;
  if v_type = 'boolean' then return public.equora_tcj_atom_v1('b', p_value #>> '{}'); end if;
  if v_type = 'string' then return public.equora_tcj_atom_v1('s', p_value #>> '{}'); end if;
  if v_type = 'number' then
    return public.equora_tcj_atom_v1('j', public.equora_tcj_decimal_v1(p_value #>> '{}'));
  end if;
  if p_depth >= 64 then raise exception 'TCJ_DEPTH_LIMIT_EXCEEDED'; end if;
  if v_type = 'array' then
    select coalesce(array_agg(public.equora_tcj_from_jsonb_v1(element.value, p_depth + 1) order by element.ordinality), '{}'::text[])
      into v_values
    from jsonb_array_elements(p_value) with ordinality element(value, ordinality);
    v_result := public.equora_tcj_array_v1(v_values);
  elsif v_type = 'object' then
    v_result := '["o",[';
    for v_key, v_item in
      select entry.key, entry.value
      from jsonb_each(p_value) entry
      order by convert_to(normalize(entry.key, NFC), 'UTF8')
    loop
      v_normalized_key := normalize(v_key, NFC);
      if v_previous_key is not null and v_previous_key = v_normalized_key then
        raise exception 'TCJ_DUPLICATE_OBJECT_KEY';
      end if;
      if not v_first then v_result := v_result || ','; end if;
      v_result := v_result || '[' || public.equora_tcj_quote_v1(v_normalized_key) || ','
        || public.equora_tcj_from_jsonb_v1(v_item, p_depth + 1) || ']';
      v_first := false;
      v_previous_key := v_normalized_key;
    end loop;
    v_result := v_result || ']]';
  else
    raise exception 'TCJ_JSON_TYPE_INVALID';
  end if;
  if octet_length(v_result) > 8388608 then raise exception 'TCJ_BYTE_LIMIT_EXCEEDED'; end if;
  return v_result;
end;
$$;

create or replace function public.equora_tcj_digest_v1(
  p_domain text,
  p_encoded_value text
) returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(
    public.equora_pgcrypto_digest_v1(
      convert_to('equora-digest', 'UTF8')
      || decode('00', 'hex')
      || convert_to(p_domain, 'UTF8')
      || decode('00', 'hex')
      || convert_to('equora-tcj-v1', 'UTF8')
      || decode('00', 'hex')
      || convert_to(p_encoded_value, 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function public.equora_tcj_digest_value_v1(
  p_domain text,
  p_digest text
) returns text
language sql
immutable
strict
set search_path = ''
as $$
  select public.equora_tcj_object_v1(jsonb_build_object(
    'digest_algorithm', public.equora_tcj_atom_v1('e', 'sha256'),
    'digest_contract_version', public.equora_tcj_atom_v1('s', 'equora-tcj-v1'),
    'domain', public.equora_tcj_atom_v1('e', p_domain),
    'digest', public.equora_tcj_atom_v1('x', p_digest)
  ))
$$;

create or replace function public.equora_raw_event_content_digest_v1(
  p_provider text,
  p_provider_contract_version text,
  p_endpoint_id text,
  p_event_type text,
  p_identity_status text,
  p_external_event_id text,
  p_provider_revision_authority text,
  p_provider_revision text,
  p_provider_occurred_at_us text,
  p_raw_payload jsonb
) returns text
language sql
immutable
set search_path = ''
as $$
  select public.equora_tcj_digest_v1(
    'raw_event_content',
    public.equora_tcj_object_v1(jsonb_build_object(
      'provider', public.equora_tcj_atom_v1('e', p_provider),
      'provider_contract_version', public.equora_tcj_atom_v1('s', p_provider_contract_version),
      'endpoint_id', public.equora_tcj_atom_v1('s', p_endpoint_id),
      'event_type', public.equora_tcj_atom_v1('e', p_event_type),
      'identity_status', public.equora_tcj_atom_v1('e', p_identity_status),
      'external_event_id', case when p_external_event_id is null then public.equora_tcj_atom_v1('n', null) else public.equora_tcj_atom_v1('s', p_external_event_id) end,
      'provider_revision_authority', public.equora_tcj_atom_v1('e', p_provider_revision_authority),
      'provider_revision', case when p_provider_revision is null then public.equora_tcj_atom_v1('n', null) else public.equora_tcj_atom_v1('s', p_provider_revision) end,
      'provider_occurred_at', case when p_provider_occurred_at_us is null then public.equora_tcj_atom_v1('n', null) else public.equora_tcj_atom_v1('t', p_provider_occurred_at_us) end,
      'payload', public.equora_tcj_from_jsonb_v1(p_raw_payload)
    ))
  )
$$;

create or replace function public.equora_raw_event_observation_digest_v1(
  p_page_digest text,
  p_raw_event_digest text,
  p_run_id uuid,
  p_request_result_id uuid,
  p_event_index integer,
  p_occurrence text
) returns text
language sql
immutable
strict
set search_path = ''
as $$
  select public.equora_tcj_digest_v1(
    'raw_event_observation',
    public.equora_tcj_object_v1(jsonb_build_object(
      'observation_kind', public.equora_tcj_atom_v1('e', 'raw_event_on_page'),
      'page_observation_digest', public.equora_tcj_digest_value_v1('page_observation', p_page_digest),
      'raw_event_content_digest', public.equora_tcj_digest_value_v1('raw_event_content', p_raw_event_digest),
      'run_reference', public.equora_tcj_object_v1(jsonb_build_object(
        'reference_type', public.equora_tcj_atom_v1('e', 'sync_run_id_v1'),
        'value', public.equora_tcj_atom_v1('s', p_run_id::text)
      )),
      'request_result_reference', public.equora_tcj_object_v1(jsonb_build_object(
        'reference_type', public.equora_tcj_atom_v1('e', 'provider_request_result_id_v1'),
        'value', public.equora_tcj_atom_v1('s', p_request_result_id::text)
      )),
      'event_index', public.equora_tcj_atom_v1('i', p_event_index::text),
      'occurrence', public.equora_tcj_atom_v1('e', p_occurrence)
    ))
  )
$$;

create or replace function public.equora_page_observation_digest_v1(
  p_provider text,
  p_capability_id text,
  p_endpoint_id text,
  p_scope_digest text,
  p_request_page_number integer,
  p_symbol text,
  p_start_time_ms bigint,
  p_end_time_ms bigint,
  p_page_size integer,
  p_position_type integer,
  p_source_channel text,
  p_source_profile_id text,
  p_source_profile_version text,
  p_provider_contract_version text,
  p_adapter_version text,
  p_raw_body_digest text,
  p_raw_body_bytes integer,
  p_cursor jsonb,
  p_provider_page jsonb,
  p_response_classification text,
  p_scope_completeness text,
  p_terminal_evidence text,
  p_event_identities jsonb
) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_cursor text;
  v_provider_page text;
  v_events text[] := '{}'::text[];
  v_event jsonb;
begin
  if p_cursor is null or jsonb_typeof(p_cursor) = 'null' then
    v_cursor := public.equora_tcj_atom_v1('n', null);
  else
    if not public.equora_jsonb_exact_keys_v1(p_cursor, array['providerTimeMs', 'providerId']) then
      raise exception 'TCJ_PAGE_CURSOR_INVALID';
    end if;
    v_cursor := public.equora_tcj_object_v1(jsonb_build_object(
      'provider_time_ms', public.equora_tcj_atom_v1('i', p_cursor ->> 'providerTimeMs'),
      'provider_id', public.equora_tcj_atom_v1('s', p_cursor ->> 'providerId')
    ));
  end if;

  if p_provider_page is null or jsonb_typeof(p_provider_page) = 'null' then
    v_provider_page := public.equora_tcj_atom_v1('n', null);
  else
    if not public.equora_jsonb_exact_keys_v1(p_provider_page, array['currentPage', 'pageSize', 'totalCount', 'totalPage']) then
      raise exception 'TCJ_PROVIDER_PAGE_INVALID';
    end if;
    v_provider_page := public.equora_tcj_object_v1(jsonb_build_object(
      'current_page', public.equora_tcj_atom_v1('i', p_provider_page ->> 'currentPage'),
      'page_size', public.equora_tcj_atom_v1('i', p_provider_page ->> 'pageSize'),
      'total_count', public.equora_tcj_atom_v1('i', p_provider_page ->> 'totalCount'),
      'total_page', public.equora_tcj_atom_v1('i', p_provider_page ->> 'totalPage')
    ));
  end if;

  if jsonb_typeof(p_event_identities) <> 'array' then raise exception 'TCJ_PAGE_EVENTS_INVALID'; end if;
  for v_event in select value from jsonb_array_elements(p_event_identities) loop
    if not public.equora_jsonb_exact_keys_v1(v_event, array[
      'eventType',
      'identityStatus',
      'externalEventId',
      'providerOrderTimeMs',
      'revisionDiscriminator',
      'revisionDiscriminatorValue',
      'rawEventContentDigest'
    ]) then
      raise exception 'TCJ_PAGE_EVENT_INVALID';
    end if;
    v_events := array_append(v_events, public.equora_tcj_object_v1(jsonb_build_object(
      'identity', public.equora_tcj_object_v1(jsonb_build_object(
        'event_type', public.equora_tcj_atom_v1('e', v_event ->> 'eventType'),
        'identity_status', public.equora_tcj_atom_v1('e', v_event ->> 'identityStatus'),
        'external_event_id', case when v_event ->> 'externalEventId' is null then public.equora_tcj_atom_v1('n', null) else public.equora_tcj_atom_v1('s', v_event ->> 'externalEventId') end,
        'provider_order_time_ms', case when v_event ->> 'providerOrderTimeMs' is null then public.equora_tcj_atom_v1('n', null) else public.equora_tcj_atom_v1('i', v_event ->> 'providerOrderTimeMs') end,
        'revision_discriminator', public.equora_tcj_atom_v1('e', v_event ->> 'revisionDiscriminator'),
        'revision_discriminator_value', public.equora_tcj_atom_v1('s', v_event ->> 'revisionDiscriminatorValue')
      )),
      'raw_event_content_digest', public.equora_tcj_digest_value_v1('raw_event_content', v_event ->> 'rawEventContentDigest')
    )));
  end loop;

  return public.equora_tcj_digest_v1(
    'page_observation',
    public.equora_tcj_object_v1(jsonb_build_object(
      'observation_kind', public.equora_tcj_atom_v1('e', 'provider_page'),
      'scope_digest', public.equora_tcj_digest_value_v1('sync_scope', p_scope_digest),
      'request', public.equora_tcj_object_v1(jsonb_build_object(
        'provider', public.equora_tcj_atom_v1('e', p_provider),
        'capability_id', public.equora_tcj_atom_v1('s', p_capability_id),
        'endpoint_id', public.equora_tcj_atom_v1('s', p_endpoint_id),
        'request_page_number', public.equora_tcj_atom_v1('i', p_request_page_number::text),
        'symbol', public.equora_tcj_atom_v1('s', p_symbol),
        'start_time_ms', public.equora_tcj_atom_v1('i', p_start_time_ms::text),
        'end_time_ms', public.equora_tcj_atom_v1('i', p_end_time_ms::text),
        'page_size', public.equora_tcj_atom_v1('i', p_page_size::text),
        'position_type', case when p_position_type is null then public.equora_tcj_atom_v1('n', null) else public.equora_tcj_atom_v1('i', p_position_type::text) end,
        'source_channel', public.equora_tcj_atom_v1('e', p_source_channel),
        'source_profile_id', public.equora_tcj_atom_v1('s', p_source_profile_id),
        'source_profile_version', public.equora_tcj_atom_v1('s', p_source_profile_version),
        'provider_contract_version', public.equora_tcj_atom_v1('s', p_provider_contract_version),
        'adapter_version', public.equora_tcj_atom_v1('s', p_adapter_version)
      )),
      'page', public.equora_tcj_object_v1(jsonb_build_object(
        'raw_body_digest', public.equora_tcj_digest_value_v1('raw_response_body', p_raw_body_digest),
        'raw_body_bytes', public.equora_tcj_atom_v1('i', p_raw_body_bytes::text),
        'cursor', v_cursor,
        'provider_page', v_provider_page,
        'response_classification', public.equora_tcj_atom_v1('e', p_response_classification),
        'scope_completeness', public.equora_tcj_atom_v1('e', p_scope_completeness),
        'terminal_evidence', public.equora_tcj_atom_v1('e', p_terminal_evidence)
      )),
      'events', public.equora_tcj_array_v1(v_events)
    ))
  );
end;
$$;

create or replace function public.equora_raw_response_body_digest_v1(
  p_body bytea
) returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(
    public.equora_pgcrypto_digest_v1(
      convert_to('equora-digest', 'UTF8')
      || decode('00', 'hex')
      || convert_to('raw_response_body', 'UTF8')
      || decode('00', 'hex')
      || convert_to('equora-tcj-v1', 'UTF8')
      || decode('00', 'hex')
      || convert_to('["x","' || encode(p_body, 'hex') || '"]', 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public.equora_mexc_checkpoint_mac_v1(
  p_checkpoint jsonb,
  p_key bytea
) returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_part text;
  v_value text;
  v_payload bytea := decode('', 'hex');
begin
  if jsonb_typeof(p_checkpoint) <> 'object'
    or octet_length(p_key) not between 32 and 64
    or jsonb_typeof(p_checkpoint -> 'seenPageFingerprints') <> 'array'
  then
    raise exception 'CAPTURE_CHECKPOINT_MAC_INVALID';
  end if;

  foreach v_part in array array[
    p_checkpoint ->> 'checkpointVersion',
    p_checkpoint ->> 'checkpointMacVersion',
    p_checkpoint ->> 'budgetProfileId',
    p_checkpoint ->> 'budgetProfileDigest',
    p_checkpoint ->> 'capabilityId',
    p_checkpoint ->> 'scopeDigest',
    p_checkpoint ->> 'status',
    p_checkpoint ->> 'reason',
    p_checkpoint ->> 'workUnitSequence',
    p_checkpoint ->> 'nextPageNumber',
    p_checkpoint ->> 'unitSuccessfulPages',
    p_checkpoint ->> 'unitRequestAttempts',
    p_checkpoint ->> 'unitRawEvents',
    p_checkpoint ->> 'unitResponseBytes',
    p_checkpoint ->> 'unitElapsedMs',
    p_checkpoint ->> 'unitRetryCount',
    p_checkpoint ->> 'unitBackoffMs',
    p_checkpoint ->> 'totalSuccessfulPages',
    p_checkpoint ->> 'totalRequestAttempts',
    p_checkpoint ->> 'totalRawEvents',
    p_checkpoint ->> 'totalResponseBytes',
    p_checkpoint ->> 'totalElapsedMs',
    p_checkpoint ->> 'authorityBlocked',
    p_checkpoint ->> 'terminalEvidence',
    case when jsonb_typeof(p_checkpoint -> 'lastCursor') = 'object'
      then p_checkpoint -> 'lastCursor' ->> 'providerTime' else null end,
    case when jsonb_typeof(p_checkpoint -> 'lastCursor') = 'object'
      then p_checkpoint -> 'lastCursor' ->> 'providerId' else null end,
    p_checkpoint ->> 'lastPageFingerprint',
    p_checkpoint ->> 'orderedProviderIdentitySequenceDigest',
    p_checkpoint ->> 'lastErrorCode',
    p_checkpoint ->> 'suggestedBackoffMs',
    p_checkpoint ->> 'retryNotBeforeMs'
  ] loop
    v_value := coalesce(v_part, '<null>');
    v_payload := v_payload || convert_to(
      octet_length(convert_to(v_value, 'UTF8'))::text || ':' || v_value || '|',
      'UTF8'
    );
  end loop;

  for v_part in
    select value
    from jsonb_array_elements_text(p_checkpoint -> 'seenPageFingerprints')
      with ordinality as fingerprint(value, ordinality)
    order by ordinality
  loop
    v_payload := v_payload || convert_to(
      octet_length(convert_to(v_part, 'UTF8'))::text || ':' || v_part || '|',
      'UTF8'
    );
  end loop;

  return encode(public.equora_pgcrypto_hmac_v1(v_payload, p_key, 'sha256'), 'hex');
end;
$$;

create or replace function public.equora_capture_transition_mac_v1(
  p_payload jsonb,
  p_key bytea
) returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(
    public.equora_pgcrypto_hmac_v1(
      convert_to('equora-broker-capture-transition-v1', 'UTF8')
      || decode('00', 'hex')
      || convert_to(public.equora_tcj_from_jsonb_v1(p_payload), 'UTF8'),
      p_key,
      'sha256'
    ),
    'hex'
  )
$$;

revoke all on function public.equora_jsonb_exact_keys_v1(jsonb, text[]) from public, anon, authenticated, service_role;
revoke all on function public.equora_constant_time_hex_equal_v1(text, text) from public, anon, authenticated, service_role;
revoke all on function public.equora_lease_token_digest_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.equora_mexc_page_scope_digest_v1(text, text, bigint, bigint, integer, integer, integer, text, text) from public, anon, authenticated, service_role;
revoke all on function public.equora_tcj_quote_v1(text) from public, anon, authenticated, service_role;
revoke all on function public.equora_tcj_atom_v1(text, text) from public, anon, authenticated, service_role;
revoke all on function public.equora_tcj_decimal_v1(text) from public, anon, authenticated, service_role;
revoke all on function public.equora_tcj_array_v1(text[]) from public, anon, authenticated, service_role;
revoke all on function public.equora_tcj_object_v1(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.equora_tcj_from_jsonb_v1(jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function public.equora_tcj_digest_v1(text, text) from public, anon, authenticated, service_role;
revoke all on function public.equora_tcj_digest_value_v1(text, text) from public, anon, authenticated, service_role;
revoke all on function public.equora_raw_event_content_digest_v1(text, text, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.equora_raw_event_observation_digest_v1(text, text, uuid, uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.equora_page_observation_digest_v1(text, text, text, text, integer, text, bigint, bigint, integer, integer, text, text, text, text, text, text, integer, jsonb, jsonb, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.equora_raw_response_body_digest_v1(bytea) from public, anon, authenticated, service_role;
revoke all on function public.equora_mexc_checkpoint_mac_v1(jsonb, bytea) from public, anon, authenticated, service_role;
revoke all on function public.equora_capture_transition_mac_v1(jsonb, bytea) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Atomic server-only page commit.
--
-- The RPC derives tenant/account/run/scope ownership from the locked work unit.
-- It accepts no client user_id, makes no external request and decrypts no key.
-- Account ledger generation and work-unit row version are independent CAS
-- guards. Every failure rolls back request, raw body, events, observations and
-- checkpoint changes together.
-- ---------------------------------------------------------------------------

create or replace function public.equora_commit_broker_capture_page_v1(
  p_work_unit_id uuid,
  p_expected_run_id uuid,
  p_expected_broker_account_id uuid,
  p_expected_connection_account_id uuid,
  p_expected_sync_activation_id uuid,
  p_expected_activation_generation integer,
  p_expected_scope_digest text,
  p_transition_mac_version text,
  p_transition_integrity_key_version text,
  p_transition_mac text,
  p_lease_token uuid,
  p_expected_work_unit_row_version bigint,
  p_expected_checkpoint_mac text,
  p_expected_ledger_generation bigint,
  p_request_result_id uuid,
  p_request_sequence integer,
  p_method text,
  p_request_origin text,
  p_request_path text,
  p_request_query jsonb,
  p_transport_contract_version text,
  p_request_started_at timestamptz,
  p_response_received_at timestamptz,
  p_request_duration_ms integer,
  p_http_status integer,
  p_provider_status_class text,
  p_response_classification text,
  p_raw_body_base64 text,
  p_raw_body_digest text,
  p_raw_body_bytes integer,
  p_page_observation_digest text,
  p_page_metadata jsonb,
  p_scope_completeness text,
  p_next_checkpoint jsonb,
  p_next_checkpoint_mac text,
  p_next_checkpoint_status text,
  p_next_checkpoint_reason text,
  p_next_page_number integer,
  p_events jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '15s'
as $$
declare
  v_rpc_deadline constant timestamptz := clock_timestamp() + interval '12 seconds';
  v_work_unit public.broker_capture_work_units%rowtype;
  v_scope public.broker_sync_scopes%rowtype;
  v_run public.broker_capture_runs%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_connection_account public.broker_connection_accounts%rowtype;
  v_connection public.broker_connections%rowtype;
  v_credential public.broker_credentials%rowtype;
  v_integrity_key equora_private.broker_capture_integrity_keys%rowtype;
  v_provider public.broker_providers%rowtype;
  v_identity public.broker_account_identities%rowtype;
  v_raw_body bytea;
  v_body_json jsonb;
  v_body_records jsonb;
  v_event_payload jsonb;
  v_event_identities jsonb := '[]'::jsonb;
  v_expected_ordered_digests jsonb := '[]'::jsonb;
  v_expected_query jsonb;
  v_recomputed_raw_event_digest text;
  v_recomputed_page_digest text;
  v_recomputed_observation_digest text;
  v_recomputed_membership_key text;
  v_expected_event_type text;
  v_provider_id_field text;
  v_provider_time_field text;
  v_body_provider_id text;
  v_body_provider_time_ms bigint;
  v_page_size integer;
  v_request_page_number integer;
  v_terminal_evidence text;
  v_cursor jsonb;
  v_provider_page jsonb;
  v_lease_token_digest text;
  v_event jsonb;
  v_raw_event_id uuid;
  v_inserted_id uuid;
  v_existing public.broker_capture_raw_events%rowtype;
  v_event_index integer;
  v_event_count integer;
  v_inserted_count integer := 0;
  v_repeated_count integer := 0;
  v_observation_count integer := 0;
  v_occurrence text;
  v_provider_capability jsonb;
  v_new_work_unit_row_version bigint;
  v_new_ledger_generation bigint;
  v_transition_payload jsonb;
  v_recomputed_transition_mac text;
  v_recomputed_checkpoint_mac text;
  v_account_lease_row_count bigint := 0;
begin
  if p_work_unit_id is null
    or p_expected_run_id is null
    or p_expected_broker_account_id is null
    or p_expected_connection_account_id is null
    or p_expected_sync_activation_id is null
    or p_expected_activation_generation <= 0
    or p_transition_mac_version is null
    or p_transition_integrity_key_version is null
    or p_transition_mac is null
    or p_lease_token is null
    or p_request_result_id is null
    or p_expected_work_unit_row_version < 0
    or p_expected_ledger_generation < 0
    or p_request_sequence <= 0
  then
    raise exception 'CAPTURE_INVALID_INPUT';
  end if;

  if p_expected_scope_digest !~ '^[a-f0-9]{64}$'
    or p_transition_mac_version is distinct from 'equora-broker-capture-transition-hmac-sha256-v1'
    or p_transition_integrity_key_version !~ '^[a-z][a-z0-9_]{0,62}$'
    or p_transition_mac !~ '^[a-f0-9]{64}$'
    or p_expected_checkpoint_mac !~ '^[a-f0-9]{64}$'
    or p_next_checkpoint_mac !~ '^[a-f0-9]{64}$'
    or p_raw_body_digest !~ '^[a-f0-9]{64}$'
    or p_page_observation_digest !~ '^[a-f0-9]{64}$'
  then
    raise exception 'CAPTURE_INVALID_DIGEST';
  end if;

  if p_method <> 'GET'
    or p_provider_status_class <> 'success'
    or p_scope_completeness not in ('unverified', 'partial')
    or p_raw_body_bytes not between 1 and 65536
    or p_http_status not between 200 and 299
    or p_request_duration_ms < 0
    or p_response_received_at < p_request_started_at
    or p_next_page_number < 1
    or jsonb_typeof(p_request_query) <> 'object'
    or jsonb_typeof(p_page_metadata) <> 'object'
    or jsonb_typeof(p_next_checkpoint) <> 'object'
    or jsonb_typeof(p_events) <> 'array'
  then
    raise exception 'CAPTURE_INVALID_SHAPE';
  end if;

  v_event_count := jsonb_array_length(p_events);
  if v_event_count > 1000
    or octet_length(p_events::text) > 8388608
    or octet_length(p_page_metadata::text) > 262144
    or octet_length(p_next_checkpoint::text) > 262144
  then
    raise exception 'CAPTURE_RESOURCE_BUDGET_EXCEEDED';
  end if;

  select * into v_work_unit
  from public.broker_capture_work_units
  where id = p_work_unit_id
  for update;
  if not found then raise exception 'CAPTURE_WORK_UNIT_NOT_FOUND'; end if;

  if v_work_unit.run_id is distinct from p_expected_run_id
    or v_work_unit.broker_account_id is distinct from p_expected_broker_account_id
    or v_work_unit.sync_activation_id is distinct from p_expected_sync_activation_id
    or v_work_unit.activation_generation is distinct from p_expected_activation_generation
  then
    raise exception 'CAPTURE_PURPOSE_BINDING_MISMATCH';
  end if;

  v_lease_token_digest := public.equora_lease_token_digest_v1(p_lease_token);
  if v_work_unit.status not in ('leased', 'running')
    or v_work_unit.lease_token_format_version is distinct from 'uuid-sha256-v1'
    or v_work_unit.lease_token_digest is null
    or not public.equora_constant_time_hex_equal_v1(v_work_unit.lease_token_digest, v_lease_token_digest)
    or v_work_unit.lease_expires_at is null
    or v_work_unit.lease_expires_at <= clock_timestamp()
  then
    raise exception 'CAPTURE_LEASE_INVALID';
  end if;

  if v_work_unit.row_version <> p_expected_work_unit_row_version
    or v_work_unit.checkpoint_mac <> p_expected_checkpoint_mac
    or v_work_unit.request_sequence + 1 <> p_request_sequence
  then
    raise exception 'CAPTURE_WORK_UNIT_CAS_MISMATCH';
  end if;

  select * into v_scope
  from public.broker_sync_scopes
  where id = v_work_unit.scope_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation;
  if not found then raise exception 'CAPTURE_SCOPE_MISMATCH'; end if;
  if v_scope.scope_digest is distinct from p_expected_scope_digest
    or v_work_unit.lane_id is distinct from v_scope.lane_id
  then
    raise exception 'CAPTURE_PURPOSE_BINDING_MISMATCH';
  end if;

  select * into v_run
  from public.broker_capture_runs
  where id = v_work_unit.run_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found or v_run.status not in ('pending', 'running') then
    raise exception 'CAPTURE_RUN_INVALID';
  end if;
  if v_run.id is distinct from p_expected_run_id
    or v_run.lane_id is distinct from v_scope.lane_id
  then
    raise exception 'CAPTURE_PURPOSE_BINDING_MISMATCH';
  end if;

  select series_row.* into v_series
  from public.broker_sync_activation_series series_row
  join public.broker_sync_activations activation_row
    on activation_row.activation_series_id = series_row.id
   and activation_row.user_id = series_row.user_id
   and activation_row.broker_account_id = series_row.broker_account_id
  where activation_row.id = v_work_unit.sync_activation_id
    and activation_row.user_id = v_work_unit.user_id
    and activation_row.broker_account_id = v_work_unit.broker_account_id
    and activation_row.activation_generation = v_work_unit.activation_generation
  for update of series_row;
  if not found then raise exception 'CAPTURE_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_activation
  from public.broker_sync_activations
  where id = v_work_unit.sync_activation_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found
    or v_activation.connection_account_id is distinct from p_expected_connection_account_id
    or v_activation.activation_state <> 'active'
  then
    raise exception 'CAPTURE_ACTIVATION_INACTIVE';
  end if;
  if v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
  then
    raise exception 'CAPTURE_ACTIVATION_NOT_CURRENT';
  end if;

  select * into v_connection_account
  from public.broker_connection_accounts
  where id = v_activation.connection_account_id
    and user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and provider_code = v_activation.provider_code
    and environment = v_activation.environment
  for share;
  if not found
    or v_connection_account.status <> 'active'
    or v_connection_account.valid_to is not null
    or v_connection_account.valid_from > p_request_started_at
  then
    raise exception 'CAPTURE_CONNECTION_INACTIVE';
  end if;

  select * into v_connection
  from public.broker_connections
  where id = v_connection_account.connection_id
    and user_id = v_connection_account.user_id
    and provider = v_connection_account.provider_code
    and environment = v_connection_account.environment
  for share;
  if not found
    or v_connection.status <> 'ready'
    or v_connection.credential_reference is distinct from v_activation.active_credential_id
    or not v_connection.permissions @> array['read_only_user_attested']::text[]
    or not v_connection.permissions <@ array['read_only_user_attested']::text[]
  then
    raise exception 'CAPTURE_CONNECTION_INACTIVE';
  end if;

  select * into v_credential
  from public.broker_credentials
  where id = v_activation.active_credential_id
    and user_id = v_activation.user_id
    and provider = v_activation.provider_code
    and key_version = v_activation.active_credential_key_version
  for share;
  if not found or length(v_credential.encrypted_payload) < 1 then
    raise exception 'CAPTURE_CREDENTIAL_INACTIVE';
  end if;

  select * into v_integrity_key
  from equora_private.broker_capture_integrity_keys
  where id = v_activation.capture_integrity_key_id
    and user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and key_version = v_activation.capture_integrity_key_version
  for share;
  if not found
    or v_integrity_key.status <> 'active'
    or v_integrity_key.valid_from > clock_timestamp()
    or (v_integrity_key.valid_to is not null and v_integrity_key.valid_to <= clock_timestamp())
    or p_transition_integrity_key_version is distinct from v_integrity_key.key_version
  then
    raise exception 'CAPTURE_INTEGRITY_KEY_INVALID';
  end if;

  v_recomputed_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
    v_work_unit.checkpoint,
    v_integrity_key.key_material
  );
  if not public.equora_constant_time_hex_equal_v1(
    v_recomputed_checkpoint_mac,
    p_expected_checkpoint_mac
  ) then
    raise exception 'CAPTURE_CHECKPOINT_MAC_MISMATCH';
  end if;

  v_recomputed_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
    p_next_checkpoint,
    v_integrity_key.key_material
  );
  if not public.equora_constant_time_hex_equal_v1(
    v_recomputed_checkpoint_mac,
    p_next_checkpoint_mac
  ) then
    raise exception 'CAPTURE_CHECKPOINT_MAC_MISMATCH';
  end if;

  v_transition_payload := jsonb_build_object(
    'p_work_unit_id', p_work_unit_id::text,
    'p_expected_run_id', p_expected_run_id::text,
    'p_expected_broker_account_id', p_expected_broker_account_id::text,
    'p_expected_connection_account_id', p_expected_connection_account_id::text,
    'p_expected_sync_activation_id', p_expected_sync_activation_id::text,
    'p_expected_activation_generation', p_expected_activation_generation,
    'p_expected_scope_digest', p_expected_scope_digest,
    'p_transition_mac_version', p_transition_mac_version,
    'p_transition_integrity_key_version', p_transition_integrity_key_version,
    'p_lease_token', p_lease_token::text,
    'p_expected_work_unit_row_version', p_expected_work_unit_row_version,
    'p_expected_checkpoint_mac', p_expected_checkpoint_mac,
    'p_expected_ledger_generation', p_expected_ledger_generation,
    'p_request_result_id', p_request_result_id::text,
    'p_request_sequence', p_request_sequence,
    'p_method', p_method,
    'p_request_origin', p_request_origin,
    'p_request_path', p_request_path,
    'p_request_query', p_request_query,
    'p_transport_contract_version', p_transport_contract_version,
    'p_request_started_at', to_char(
      p_request_started_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'p_response_received_at', to_char(
      p_response_received_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'p_request_duration_ms', p_request_duration_ms,
    'p_http_status', p_http_status,
    'p_provider_status_class', p_provider_status_class,
    'p_response_classification', p_response_classification,
    'p_raw_body_base64', p_raw_body_base64,
    'p_raw_body_digest', p_raw_body_digest,
    'p_raw_body_bytes', p_raw_body_bytes,
    'p_page_observation_digest', p_page_observation_digest,
    'p_page_metadata', p_page_metadata,
    'p_scope_completeness', p_scope_completeness,
    'p_next_checkpoint', p_next_checkpoint,
    'p_next_checkpoint_mac', p_next_checkpoint_mac,
    'p_next_checkpoint_status', p_next_checkpoint_status,
    'p_next_checkpoint_reason', p_next_checkpoint_reason,
    'p_next_page_number', p_next_page_number,
    'p_events', p_events
  );
  v_recomputed_transition_mac := public.equora_capture_transition_mac_v1(
    v_transition_payload,
    v_integrity_key.key_material
  );
  if not public.equora_constant_time_hex_equal_v1(
    v_recomputed_transition_mac,
    p_transition_mac
  ) then
    raise exception 'CAPTURE_TRANSITION_MAC_MISMATCH';
  end if;

  select * into v_identity
  from public.broker_account_identities
  where broker_account_id = v_scope.broker_account_id
    and user_id = v_scope.user_id
    and hmac_digest = v_scope.account_identity_digest
    and hmac_key_version = v_scope.account_identity_key_version
    and status = 'active'
    and verification_status = 'unverified_reference'
  for share;
  if not found then raise exception 'CAPTURE_ACCOUNT_IDENTITY_INACTIVE'; end if;

  perform 1
  from public.broker_accounts
  where id = v_work_unit.broker_account_id
    and user_id = v_work_unit.user_id
    and provider_code = v_scope.provider_code
    and status in ('pending', 'active')
    and retention_status = 'active'
    and ledger_generation = p_expected_ledger_generation
  for update;
  if not found then raise exception 'CAPTURE_LEDGER_CAS_MISMATCH'; end if;

  select * into v_provider
  from public.broker_providers
  where provider_code = v_scope.provider_code
    and status = 'verified'
    and mutations_forbidden = true
  for share;
  if not found then raise exception 'CAPTURE_PROVIDER_BLOCKED'; end if;

  if clock_timestamp() >= v_rpc_deadline then
    raise exception 'CAPTURE_RPC_DEADLINE_EXCEEDED';
  end if;

  v_provider_capability := v_provider.readonly_capabilities -> v_scope.capability_id;
  if v_provider_capability is null
    or v_provider_capability ->> 'method' <> 'GET'
    or v_provider_capability ->> 'origin' <> p_request_origin
    or v_provider_capability ->> 'path' <> p_request_path
    or v_scope.endpoint_id <> v_scope.capability_id
    or p_method <> v_provider_capability ->> 'method'
    or v_scope.provider_contract_version <> v_provider.current_contract_version
    or not (v_scope.provider_contract_version = any(v_provider.allowed_contract_versions))
  then
    raise exception 'CAPTURE_READONLY_CONTRACT_MISMATCH';
  end if;

  if p_transport_contract_version <> 'mexc-readonly-transport-v1'
    or p_request_origin <> 'https://api.mexc.com'
    or p_request_path not like '/api/v1/%'
  then
    raise exception 'CAPTURE_TRANSPORT_CONTRACT_MISMATCH';
  end if;

  if exists (
    select 1 from public.broker_provider_request_results
    where id = p_request_result_id
      or (work_unit_id = p_work_unit_id and request_sequence = p_request_sequence)
  ) then
    raise exception 'CAPTURE_REQUEST_RESULT_REPLAY';
  end if;

  begin
    if p_raw_body_base64 is null
      or p_raw_body_base64 !~ '^[A-Za-z0-9+/]*={0,2}$'
      or length(p_raw_body_base64) > 87384
    then
      raise exception 'CAPTURE_RAW_BODY_INVALID';
    end if;
    v_raw_body := decode(p_raw_body_base64, 'base64');
    if replace(replace(encode(v_raw_body, 'base64'), chr(10), ''), chr(13), '') is distinct from p_raw_body_base64 then
      raise exception 'CAPTURE_RAW_BODY_INVALID';
    end if;
  exception when others then
    raise exception 'CAPTURE_RAW_BODY_INVALID';
  end;

  if octet_length(v_raw_body) <> p_raw_body_bytes
    or public.equora_raw_response_body_digest_v1(v_raw_body) <> p_raw_body_digest
  then
    raise exception 'CAPTURE_RAW_BODY_DIGEST_MISMATCH';
  end if;

  begin
    if not public.equora_jsonb_exact_keys_v1(v_work_unit.checkpoint, array[
      'checkpointVersion', 'checkpointMacVersion', 'checkpointMac',
      'budgetProfileId', 'budgetProfileDigest', 'capabilityId', 'scope',
      'scopeDigest', 'status', 'reason', 'workUnitSequence', 'nextPageNumber',
      'unitSuccessfulPages', 'unitRequestAttempts', 'unitRawEvents',
      'unitResponseBytes', 'unitElapsedMs', 'unitRetryCount', 'unitBackoffMs',
      'totalSuccessfulPages', 'totalRequestAttempts', 'totalRawEvents',
      'totalResponseBytes', 'totalElapsedMs', 'authorityBlocked',
      'terminalEvidence', 'lastCursor', 'lastPageFingerprint',
      'seenPageFingerprints', 'orderedProviderIdentitySequenceDigest',
      'lastErrorCode', 'suggestedBackoffMs', 'retryNotBeforeMs'
    ])
      or not public.equora_jsonb_exact_keys_v1(p_next_checkpoint, array[
        'checkpointVersion', 'checkpointMacVersion', 'checkpointMac',
        'budgetProfileId', 'budgetProfileDigest', 'capabilityId', 'scope',
        'scopeDigest', 'status', 'reason', 'workUnitSequence', 'nextPageNumber',
        'unitSuccessfulPages', 'unitRequestAttempts', 'unitRawEvents',
        'unitResponseBytes', 'unitElapsedMs', 'unitRetryCount', 'unitBackoffMs',
        'totalSuccessfulPages', 'totalRequestAttempts', 'totalRawEvents',
        'totalResponseBytes', 'totalElapsedMs', 'authorityBlocked',
        'terminalEvidence', 'lastCursor', 'lastPageFingerprint',
        'seenPageFingerprints', 'orderedProviderIdentitySequenceDigest',
        'lastErrorCode', 'suggestedBackoffMs', 'retryNotBeforeMs'
      ])
      or not public.equora_jsonb_exact_keys_v1(
        v_work_unit.checkpoint -> 'scope',
        case when v_scope.position_type is null
          then array['symbol', 'startTime', 'endTime', 'pageNumber', 'pageSize']
          else array['symbol', 'startTime', 'endTime', 'pageNumber', 'pageSize', 'positionType']
        end
      )
      or not public.equora_jsonb_exact_keys_v1(
        p_next_checkpoint -> 'scope',
        case when v_scope.position_type is null
          then array['symbol', 'startTime', 'endTime', 'pageNumber', 'pageSize']
          else array['symbol', 'startTime', 'endTime', 'pageNumber', 'pageSize', 'positionType']
        end
      )
    then
      raise exception 'CAPTURE_NEXT_CHECKPOINT_MISMATCH';
    end if;

    v_request_page_number := (v_work_unit.checkpoint ->> 'nextPageNumber')::integer;
    v_page_size := (v_work_unit.checkpoint -> 'scope' ->> 'pageSize')::integer;
    if v_work_unit.checkpoint ->> 'checkpointMac' is distinct from v_work_unit.checkpoint_mac
      or v_work_unit.checkpoint ->> 'checkpointMac' is distinct from p_expected_checkpoint_mac
      or v_work_unit.checkpoint ->> 'scopeDigest' is distinct from public.equora_mexc_page_scope_digest_v1(
        v_scope.capability_id,
        v_scope.instrument_symbol,
        v_scope.request_start_ms,
        v_scope.request_end_ms,
        (v_work_unit.checkpoint -> 'scope' ->> 'pageNumber')::integer,
        v_page_size,
        v_scope.position_type,
        v_work_unit.checkpoint ->> 'budgetProfileId',
        v_work_unit.checkpoint ->> 'budgetProfileDigest'
      )
      or v_work_unit.checkpoint ->> 'capabilityId' is distinct from v_scope.capability_id
      or v_work_unit.checkpoint -> 'scope' ->> 'symbol' is distinct from v_scope.instrument_symbol
      or (v_work_unit.checkpoint -> 'scope' ->> 'startTime')::bigint is distinct from v_scope.request_start_ms
      or (v_work_unit.checkpoint -> 'scope' ->> 'endTime')::bigint is distinct from v_scope.request_end_ms
      or (v_work_unit.checkpoint -> 'scope' ->> 'positionType')::integer is distinct from v_scope.position_type
      or p_next_checkpoint ->> 'checkpointMac' is distinct from p_next_checkpoint_mac
      or p_next_checkpoint ->> 'scopeDigest' is distinct from v_work_unit.checkpoint ->> 'scopeDigest'
      or p_next_checkpoint ->> 'capabilityId' is distinct from v_scope.capability_id
      or p_next_checkpoint -> 'scope' is distinct from v_work_unit.checkpoint -> 'scope'
      or (p_next_checkpoint ->> 'nextPageNumber')::integer is distinct from p_next_page_number
      or p_next_page_number is distinct from v_request_page_number + 1
      or p_next_checkpoint ->> 'status' is distinct from p_next_checkpoint_status
      or p_next_checkpoint ->> 'reason' is distinct from p_next_checkpoint_reason
      or (p_next_checkpoint ->> 'authorityBlocked')::boolean is distinct from true
      or p_next_checkpoint_status not in ('continue', 'yielded', 'terminal_observed', 'partial_failed', 'loop_blocked')
      or p_next_checkpoint_reason not in (
        'page_committed', 'terminal_short_bare_array',
        'terminal_provider_page_metadata', 'terminal_canonical_empty_page',
        'work_unit_budget_reached', 'scope_budget_reached',
        'provider_page_number_limit_reached', 'cursor_progress_violation',
        'repeated_page_without_cursor_progress', 'response_exceeds_remaining_budget'
      )
      or (p_next_checkpoint ->> 'totalSuccessfulPages')::integer is distinct from (v_work_unit.checkpoint ->> 'totalSuccessfulPages')::integer + 1
      or (p_next_checkpoint ->> 'totalRequestAttempts')::integer is distinct from (v_work_unit.checkpoint ->> 'totalRequestAttempts')::integer + 1
      or (p_next_checkpoint ->> 'totalRawEvents')::integer is distinct from (v_work_unit.checkpoint ->> 'totalRawEvents')::integer + v_event_count
      or (p_next_checkpoint ->> 'totalResponseBytes')::bigint is distinct from (v_work_unit.checkpoint ->> 'totalResponseBytes')::bigint + p_raw_body_bytes
    then
      raise exception 'CAPTURE_NEXT_CHECKPOINT_MISMATCH';
    end if;
  exception when others then
    if sqlerrm like '%CAPTURE_NEXT_CHECKPOINT_MISMATCH%' then raise; end if;
    raise exception 'CAPTURE_NEXT_CHECKPOINT_MISMATCH';
  end;

  v_expected_query := jsonb_build_object(
    'symbol', v_scope.instrument_symbol,
    'start_time', v_scope.request_start_ms::text,
    'end_time', v_scope.request_end_ms::text,
    'page_num', v_request_page_number::text,
    'page_size', v_page_size::text
  );
  if v_scope.position_type is not null then
    v_expected_query := v_expected_query || jsonb_build_object('position_type', v_scope.position_type::text);
  end if;
  if p_request_query is distinct from v_expected_query then
    raise exception 'CAPTURE_REQUEST_QUERY_MISMATCH';
  end if;

  begin
    v_body_json := convert_from(v_raw_body, 'UTF8')::jsonb;
  exception when others then
    raise exception 'CAPTURE_RAW_BODY_INVALID';
  end;
  if jsonb_typeof(v_body_json) <> 'object'
    or v_body_json -> 'success' is distinct from 'true'::jsonb
    or jsonb_typeof(v_body_json -> 'code') <> 'number'
    or (v_body_json ->> 'code')::numeric <> 0
    or not (v_body_json ? 'data')
    or jsonb_typeof(v_body_json -> 'data') is null
  then
    raise exception 'CAPTURE_BODY_ENVELOPE_MISMATCH';
  end if;

  if v_scope.capability_id = 'historical_orders_v1' then
    v_expected_event_type := 'order';
    v_provider_id_field := 'orderId';
    v_provider_time_field := 'createTime';
  elsif v_scope.capability_id = 'historical_executions_v3' then
    v_expected_event_type := 'execution';
    v_provider_id_field := 'id';
    v_provider_time_field := 'timestamp';
  elsif v_scope.capability_id = 'historical_positions_v1' then
    v_expected_event_type := 'position';
    v_provider_id_field := 'positionId';
    v_provider_time_field := 'createTime';
  elsif v_scope.capability_id = 'funding_records_v1' then
    v_expected_event_type := 'funding';
    v_provider_id_field := 'id';
    v_provider_time_field := 'settleTime';
  else
    raise exception 'CAPTURE_READONLY_CONTRACT_MISMATCH';
  end if;

  if v_scope.capability_id = 'funding_records_v1' then
    if jsonb_typeof(v_body_json -> 'data') <> 'object'
      or jsonb_typeof(v_body_json -> 'data' -> 'resultList') <> 'array'
    then raise exception 'CAPTURE_BODY_EVENT_MISMATCH'; end if;
    v_body_records := v_body_json -> 'data' -> 'resultList';
    v_provider_page := jsonb_build_object(
      'currentPage', (v_body_json -> 'data' ->> 'currentPage')::integer,
      'pageSize', (v_body_json -> 'data' ->> 'pageSize')::integer,
      'totalCount', (v_body_json -> 'data' ->> 'totalCount')::integer,
      'totalPage', (v_body_json -> 'data' ->> 'totalPage')::integer
    );
  else
    if jsonb_typeof(v_body_json -> 'data') <> 'array' then raise exception 'CAPTURE_BODY_EVENT_MISMATCH'; end if;
    v_body_records := v_body_json -> 'data';
    v_provider_page := 'null'::jsonb;
  end if;

  if jsonb_array_length(v_body_records) is distinct from v_event_count
    or v_event_count > v_page_size
  then
    raise exception 'CAPTURE_BODY_EVENT_MISMATCH';
  end if;

  if not public.equora_jsonb_exact_keys_v1(p_page_metadata, array[
    'requestPageNumber', 'requestScope', 'terminalEvidence', 'providerPage',
    'cursor', 'orderedRawEventContentDigests', 'authorityBlocked'
  ])
    or not public.equora_jsonb_exact_keys_v1(p_page_metadata -> 'requestScope', array[
      'symbol', 'startTimeMs', 'endTimeMs', 'pageSize', 'positionType'
    ])
    or (p_page_metadata ->> 'requestPageNumber')::integer is distinct from v_request_page_number
    or p_page_metadata -> 'requestScope' ->> 'symbol' is distinct from v_scope.instrument_symbol
    or (p_page_metadata -> 'requestScope' ->> 'startTimeMs')::bigint is distinct from v_scope.request_start_ms
    or (p_page_metadata -> 'requestScope' ->> 'endTimeMs')::bigint is distinct from v_scope.request_end_ms
    or (p_page_metadata -> 'requestScope' ->> 'pageSize')::integer is distinct from v_page_size
    or (p_page_metadata -> 'requestScope' ->> 'positionType')::integer is distinct from v_scope.position_type
    or (p_page_metadata ->> 'authorityBlocked')::boolean is distinct from true
    or p_page_metadata -> 'providerPage' is distinct from v_provider_page
  then
    raise exception 'CAPTURE_PAGE_METADATA_MISMATCH';
  end if;

  if v_scope.capability_id = 'funding_records_v1' then
    if (v_provider_page ->> 'currentPage')::integer <> v_request_page_number
      or (v_provider_page ->> 'pageSize')::integer <> v_page_size
      or (v_provider_page ->> 'totalCount')::integer < v_event_count
      or (v_provider_page ->> 'totalPage')::integer < 0
    then raise exception 'CAPTURE_PAGE_METADATA_MISMATCH'; end if;
    v_terminal_evidence := case
      when (v_provider_page ->> 'totalCount')::integer = 0
        and (v_provider_page ->> 'totalPage')::integer = 0
        and v_request_page_number = 1
        and v_event_count = 0 then 'canonical_empty_page'
      when (v_provider_page ->> 'totalPage')::integer > 0
        and v_request_page_number >= (v_provider_page ->> 'totalPage')::integer then 'provider_page_metadata'
      else 'none'
    end;
    if p_response_classification is distinct from 'blocked_funding_authority' then
      raise exception 'CAPTURE_PAGE_METADATA_MISMATCH';
    end if;
  else
    v_terminal_evidence := case when v_event_count < v_page_size then 'short_bare_array' else 'none' end;
    if p_response_classification is distinct from (
      case
        when v_scope.capability_id = 'historical_positions_v1' and v_event_count > 0
          then 'blocked_unobserved_position_items'
        else 'valid_read_preview_only'
      end
    ) then
      raise exception 'CAPTURE_PAGE_METADATA_MISMATCH';
    end if;
  end if;
  if p_page_metadata ->> 'terminalEvidence' is distinct from v_terminal_evidence
    or p_next_checkpoint ->> 'terminalEvidence' is distinct from v_terminal_evidence
  then
    raise exception 'CAPTURE_PAGE_METADATA_MISMATCH';
  end if;

  for v_event in select value from jsonb_array_elements(p_events) loop
    if clock_timestamp() >= v_rpc_deadline then
      raise exception 'CAPTURE_RPC_DEADLINE_EXCEEDED';
    end if;
    if not public.equora_jsonb_exact_keys_v1(v_event, array[
      'accountIdentityDigest', 'digestAlgorithm', 'digestContractVersion',
      'endpointId', 'eventIndex', 'eventType', 'externalEventId',
      'firstObservedAtUs', 'identityStatus', 'membershipKey',
      'observationDigest', 'observedAtUs', 'occurrence',
      'pageObservationDigest', 'providerCode', 'providerContractVersion',
      'providerOccurredAtUs', 'providerRevision', 'providerRevisionAuthority',
      'rawEventContentDigest', 'rawPayloadJson', 'revisionDiscriminator',
      'revisionDiscriminatorValue'
    ]) then
      raise exception 'CAPTURE_EVENT_SHAPE_INVALID';
    end if;
    v_event_index := (v_event ->> 'eventIndex')::integer;
    if v_event_index < 0 or v_event_index >= v_event_count then
      raise exception 'CAPTURE_EVENT_CONTRACT_MISMATCH';
    end if;
    begin
      v_event_payload := (v_event ->> 'rawPayloadJson')::jsonb;
    exception when others then
      raise exception 'CAPTURE_EVENT_SHAPE_INVALID';
    end;
    if jsonb_typeof(v_event_payload) <> 'object'
      or v_event_payload is distinct from v_body_records -> v_event_index
    then raise exception 'CAPTURE_BODY_EVENT_MISMATCH'; end if;

    if jsonb_typeof(v_event_payload -> v_provider_id_field) not in ('number', 'string') then
      raise exception 'CAPTURE_EVENT_CONTRACT_MISMATCH';
    end if;
    v_body_provider_id := ltrim(v_event_payload ->> v_provider_id_field, '0');
    if v_body_provider_id = '' then v_body_provider_id := '0'; end if;
    if v_body_provider_id !~ '^(0|[1-9][0-9]{0,39})$' then
      raise exception 'CAPTURE_EVENT_CONTRACT_MISMATCH';
    end if;
    if jsonb_typeof(v_event_payload -> v_provider_time_field) <> 'number'
      or (v_event_payload ->> v_provider_time_field) !~ '^[0-9]{13}$'
    then raise exception 'CAPTURE_EVENT_CONTRACT_MISMATCH'; end if;
    v_body_provider_time_ms := (v_event_payload ->> v_provider_time_field)::bigint;

    v_recomputed_raw_event_digest := public.equora_raw_event_content_digest_v1(
      v_scope.provider_code,
      v_scope.provider_contract_version,
      v_scope.endpoint_id,
      v_expected_event_type,
      'stable_provider_id',
      v_body_provider_id,
      'unverified',
      null,
      (v_body_provider_time_ms * 1000)::text,
      v_event_payload
    );
    v_recomputed_membership_key :=
      octet_length(v_scope.provider_code)::text || ':' || v_scope.provider_code || '|'
      || octet_length(v_identity.digest_algorithm)::text || ':' || v_identity.digest_algorithm || '|'
      || octet_length(v_identity.digest_contract_version)::text || ':' || v_identity.digest_contract_version || '|'
      || octet_length(v_identity.digest_purpose)::text || ':' || v_identity.digest_purpose || '|'
      || octet_length(v_scope.account_identity_key_version)::text || ':' || v_scope.account_identity_key_version || '|'
      || octet_length(v_scope.account_identity_digest)::text || ':' || v_scope.account_identity_digest || '|'
      || octet_length(v_expected_event_type)::text || ':' || v_expected_event_type || '|'
      || octet_length(v_body_provider_id)::text || ':' || v_body_provider_id || '|'
      || octet_length('payload_hash_fallback')::text || ':payload_hash_fallback|'
      || octet_length(v_recomputed_raw_event_digest)::text || ':' || v_recomputed_raw_event_digest;

    if v_event ->> 'providerCode' is distinct from v_scope.provider_code
      or v_event ->> 'accountIdentityDigest' is distinct from v_scope.account_identity_digest
      or v_event ->> 'endpointId' is distinct from v_scope.endpoint_id
      or v_event ->> 'providerContractVersion' is distinct from v_scope.provider_contract_version
      or v_event ->> 'digestAlgorithm' is distinct from 'sha256'
      or v_event ->> 'digestContractVersion' is distinct from 'equora-tcj-v1'
      or v_event ->> 'eventType' is distinct from v_expected_event_type
      or v_event ->> 'identityStatus' is distinct from 'stable_provider_id'
      or v_event ->> 'externalEventId' is distinct from v_body_provider_id
      or v_event ->> 'providerRevision' is not null
      or v_event ->> 'providerRevisionAuthority' is distinct from 'unverified'
      or v_event ->> 'revisionDiscriminator' is distinct from 'payload_hash_fallback'
      or v_event ->> 'revisionDiscriminatorValue' is distinct from v_recomputed_raw_event_digest
      or v_event ->> 'rawEventContentDigest' is distinct from v_recomputed_raw_event_digest
      or v_event ->> 'membershipKey' is distinct from v_recomputed_membership_key
      or (v_event ->> 'providerOccurredAtUs')::bigint is distinct from v_body_provider_time_ms * 1000
      or (v_event ->> 'observedAtUs')::bigint is distinct from (extract(epoch from p_response_received_at) * 1000000)::bigint
      or v_event ->> 'pageObservationDigest' is distinct from p_page_observation_digest
      or v_event ->> 'occurrence' not in ('first_observation', 'repeated_observation')
      or (v_event ->> 'firstObservedAtUs') !~ '^[0-9]{16}$'
      or (
        v_event ->> 'occurrence' = 'first_observation'
        and (v_event ->> 'firstObservedAtUs')::bigint is distinct from (extract(epoch from p_response_received_at) * 1000000)::bigint
      )
      or (v_event ->> 'observationDigest') !~ '^[a-f0-9]{64}$'
    then
      raise exception 'CAPTURE_EVENT_CONTRACT_MISMATCH';
    end if;

    v_event_identities := v_event_identities || jsonb_build_array(jsonb_build_object(
      'eventType', v_expected_event_type,
      'identityStatus', 'stable_provider_id',
      'externalEventId', v_body_provider_id,
      'providerOrderTimeMs', v_body_provider_time_ms,
      'revisionDiscriminator', 'payload_hash_fallback',
      'revisionDiscriminatorValue', v_recomputed_raw_event_digest,
      'rawEventContentDigest', v_recomputed_raw_event_digest
    ));
    v_expected_ordered_digests := v_expected_ordered_digests || jsonb_build_array(jsonb_build_object(
      'digestAlgorithm', 'sha256',
      'digestContractVersion', 'equora-tcj-v1',
      'domain', 'raw_event_content',
      'digest', v_recomputed_raw_event_digest
    ));
    v_cursor := jsonb_build_object('providerTimeMs', v_body_provider_time_ms, 'providerId', v_body_provider_id);
  end loop;

  if v_event_count = 0 then v_cursor := 'null'::jsonb; end if;
  if p_page_metadata -> 'cursor' is distinct from v_cursor
    or p_page_metadata -> 'orderedRawEventContentDigests' is distinct from v_expected_ordered_digests
  then
    raise exception 'CAPTURE_PAGE_METADATA_MISMATCH';
  end if;

  v_recomputed_page_digest := public.equora_page_observation_digest_v1(
    v_scope.provider_code,
    v_scope.capability_id,
    v_scope.endpoint_id,
    v_scope.scope_digest,
    v_request_page_number,
    v_scope.instrument_symbol,
    v_scope.request_start_ms,
    v_scope.request_end_ms,
    v_page_size,
    v_scope.position_type,
    v_scope.source_channel,
    v_scope.profile_id,
    v_scope.profile_version,
    v_scope.provider_contract_version,
    v_scope.adapter_version,
    p_raw_body_digest,
    p_raw_body_bytes,
    v_cursor,
    v_provider_page,
    p_response_classification,
    p_scope_completeness,
    v_terminal_evidence,
    v_event_identities
  );
  if v_recomputed_page_digest is distinct from p_page_observation_digest then
    raise exception 'CAPTURE_PAGE_DIGEST_MISMATCH';
  end if;

  if clock_timestamp() >= v_rpc_deadline then
    raise exception 'CAPTURE_RPC_DEADLINE_EXCEEDED';
  end if;

  -- clock_timestamp(), unlike statement_timestamp(), advances while this RPC
  -- waits on row locks. Revalidate both time-bounded authorities after every
  -- validation/lock phase and immediately before the first write.
  if v_work_unit.lease_expires_at <= clock_timestamp() then
    raise exception 'CAPTURE_LEASE_INVALID';
  end if;
  if v_integrity_key.valid_from > clock_timestamp()
    or (v_integrity_key.valid_to is not null and v_integrity_key.valid_to <= clock_timestamp())
  then
    raise exception 'CAPTURE_INTEGRITY_KEY_INVALID';
  end if;

  insert into public.broker_provider_request_results (
    id,
    user_id,
    broker_account_id,
    run_id,
    scope_id,
    work_unit_id,
    provider_code,
    capability_id,
    endpoint_id,
    request_sequence,
    method,
    request_origin,
    request_path,
    request_query,
    transport_contract_version,
    request_started_at,
    response_received_at,
    request_duration_ms,
    http_status,
    provider_status_class,
    response_classification,
    result_count,
    response_bytes,
    page_observation_digest,
    page_metadata,
    scope_completeness
  ) values (
    p_request_result_id,
    v_work_unit.user_id,
    v_work_unit.broker_account_id,
    v_work_unit.run_id,
    v_work_unit.scope_id,
    v_work_unit.id,
    v_scope.provider_code,
    v_scope.capability_id,
    v_scope.endpoint_id,
    p_request_sequence,
    p_method,
    p_request_origin,
    p_request_path,
    p_request_query,
    p_transport_contract_version,
    p_request_started_at,
    p_response_received_at,
    p_request_duration_ms,
    p_http_status,
    p_provider_status_class,
    p_response_classification,
    v_event_count,
    p_raw_body_bytes,
    p_page_observation_digest,
    p_page_metadata,
    p_scope_completeness
  );

  insert into public.broker_raw_responses (
    user_id,
    broker_account_id,
    request_result_id,
    raw_body,
    raw_body_digest,
    digest_algorithm,
    digest_contract_version,
    content_encoding,
    decompressed_bytes
  ) values (
    v_work_unit.user_id,
    v_work_unit.broker_account_id,
    p_request_result_id,
    v_raw_body,
    p_raw_body_digest,
    'sha256',
    'equora-tcj-v1',
    'identity',
    p_raw_body_bytes
  );

  for v_event in
    select value from jsonb_array_elements(p_events)
  loop
    if clock_timestamp() >= v_rpc_deadline then
      raise exception 'CAPTURE_RPC_DEADLINE_EXCEEDED';
    end if;

    v_event_index := (v_event ->> 'eventIndex')::integer;
    v_occurrence := v_event ->> 'occurrence';
    v_event_payload := (v_event ->> 'rawPayloadJson')::jsonb;

    v_inserted_id := null;
    insert into public.broker_capture_raw_events (
      user_id,
      broker_account_id,
      provider_code,
      account_identity_digest,
      source_channel,
      source_profile_id,
      source_profile_version,
      membership_key,
      event_type,
      identity_status,
      external_event_id,
      provider_revision,
      provider_revision_authority,
      revision_discriminator,
      revision_discriminator_value,
      provider_occurred_at_us,
      raw_payload,
      raw_event_content_digest,
      digest_algorithm,
      digest_contract_version,
      provider_contract_version,
      endpoint_id,
      first_observed_at_us
    ) values (
      v_work_unit.user_id,
      v_work_unit.broker_account_id,
      v_event ->> 'providerCode',
      v_event ->> 'accountIdentityDigest',
      v_scope.source_channel,
      v_scope.profile_id,
      v_scope.profile_version,
      v_event ->> 'membershipKey',
      v_event ->> 'eventType',
      v_event ->> 'identityStatus',
      nullif(v_event ->> 'externalEventId', ''),
      nullif(v_event ->> 'providerRevision', ''),
      v_event ->> 'providerRevisionAuthority',
      v_event ->> 'revisionDiscriminator',
      v_event ->> 'revisionDiscriminatorValue',
      nullif(v_event ->> 'providerOccurredAtUs', '')::bigint,
      v_event_payload,
      v_event ->> 'rawEventContentDigest',
      'sha256',
      'equora-tcj-v1',
      v_event ->> 'providerContractVersion',
      v_event ->> 'endpointId',
      (v_event ->> 'firstObservedAtUs')::bigint
    ) on conflict (user_id, broker_account_id, membership_key) do nothing
    returning id into v_inserted_id;

    -- The unique-index conflict path can itself wait on another transaction.
    -- An authority that expires during that wait must roll back this page.
    if v_work_unit.lease_expires_at <= clock_timestamp() then
      raise exception 'CAPTURE_LEASE_INVALID';
    end if;
    if v_integrity_key.valid_from > clock_timestamp()
      or (v_integrity_key.valid_to is not null and v_integrity_key.valid_to <= clock_timestamp())
    then
      raise exception 'CAPTURE_INTEGRITY_KEY_INVALID';
    end if;

    if v_inserted_id is not null then
      if v_occurrence <> 'first_observation' then
        raise exception 'CAPTURE_LEDGER_OCCURRENCE_MISMATCH';
      end if;
      v_raw_event_id := v_inserted_id;
      v_inserted_count := v_inserted_count + 1;
    else
      select * into v_existing
      from public.broker_capture_raw_events
      where user_id = v_work_unit.user_id
        and broker_account_id = v_work_unit.broker_account_id
        and membership_key = v_event ->> 'membershipKey'
      for update;
      if not found
        or v_existing.provider_code <> v_event ->> 'providerCode'
        or v_existing.source_channel <> v_scope.source_channel
        or v_existing.source_profile_id <> v_scope.profile_id
        or v_existing.source_profile_version <> v_scope.profile_version
        or v_existing.event_type <> v_event ->> 'eventType'
        or v_existing.identity_status <> v_event ->> 'identityStatus'
        or v_existing.external_event_id is distinct from nullif(v_event ->> 'externalEventId', '')
        or v_existing.provider_revision is distinct from nullif(v_event ->> 'providerRevision', '')
        or v_existing.provider_revision_authority <> v_event ->> 'providerRevisionAuthority'
        or v_existing.revision_discriminator <> v_event ->> 'revisionDiscriminator'
        or v_existing.revision_discriminator_value <> v_event ->> 'revisionDiscriminatorValue'
        or v_existing.provider_occurred_at_us is distinct from nullif(v_event ->> 'providerOccurredAtUs', '')::bigint
        or v_existing.first_observed_at_us is distinct from (v_event ->> 'firstObservedAtUs')::bigint
        or v_existing.raw_event_content_digest <> v_event ->> 'rawEventContentDigest'
        or v_existing.raw_payload <> v_event_payload
        or v_existing.erasure_status <> 'retained'
      then
        raise exception 'CAPTURE_IDENTITY_COLLISION';
      end if;
      if v_occurrence <> 'repeated_observation' then
        raise exception 'CAPTURE_LEDGER_OCCURRENCE_MISMATCH';
      end if;
      v_raw_event_id := v_existing.id;
      v_repeated_count := v_repeated_count + 1;
    end if;

    v_recomputed_observation_digest := public.equora_raw_event_observation_digest_v1(
      p_page_observation_digest,
      v_event ->> 'rawEventContentDigest',
      v_work_unit.run_id,
      p_request_result_id,
      v_event_index,
      v_occurrence
    );
    if v_event ->> 'observationDigest' is distinct from v_recomputed_observation_digest then
      raise exception 'CAPTURE_OBSERVATION_DIGEST_MISMATCH';
    end if;

    insert into public.broker_capture_event_observations (
      user_id,
      broker_account_id,
      raw_event_id,
      run_id,
      request_result_id,
      event_index,
      observed_at_us,
      occurrence,
      page_observation_digest,
      observation_digest
    ) values (
      v_work_unit.user_id,
      v_work_unit.broker_account_id,
      v_raw_event_id,
      v_work_unit.run_id,
      p_request_result_id,
      v_event_index,
      (v_event ->> 'observedAtUs')::bigint,
      v_occurrence,
      p_page_observation_digest,
      v_recomputed_observation_digest
    );
    v_observation_count := v_observation_count + 1;
  end loop;

  if v_observation_count <> v_event_count
    or v_inserted_count + v_repeated_count <> v_event_count
  then
    raise exception 'CAPTURE_COUNT_MISMATCH';
  end if;

  -- Final authority check after all potentially blocking event/observation
  -- writes. Any expiry raises inside the transaction and rolls every row back.
  if clock_timestamp() >= v_rpc_deadline then
    raise exception 'CAPTURE_RPC_DEADLINE_EXCEEDED';
  end if;
  if v_work_unit.lease_expires_at <= clock_timestamp() then
    raise exception 'CAPTURE_LEASE_INVALID';
  end if;
  if v_integrity_key.valid_from > clock_timestamp()
    or (v_integrity_key.valid_to is not null and v_integrity_key.valid_to <= clock_timestamp())
  then
    raise exception 'CAPTURE_INTEGRITY_KEY_INVALID';
  end if;

  update public.broker_accounts
  set ledger_generation = ledger_generation + 1,
      updated_at = clock_timestamp()
  where id = v_work_unit.broker_account_id
    and user_id = v_work_unit.user_id
    and ledger_generation = p_expected_ledger_generation
  returning ledger_generation into v_new_ledger_generation;
  if not found then raise exception 'CAPTURE_LEDGER_CAS_MISMATCH'; end if;

  update public.broker_capture_work_units
  set status = case
        when p_next_checkpoint_status = 'terminal_observed' then 'terminal_observed'
        when p_next_checkpoint_status in ('partial_failed', 'loop_blocked') then 'partial_failed'
        when p_next_checkpoint_status = 'yielded' then 'yielded'
        when p_next_checkpoint_status = 'retry_pending' then 'retry_pending'
        else 'running'
      end,
      row_version = row_version + 1,
      checkpoint = p_next_checkpoint,
      checkpoint_mac = p_next_checkpoint_mac,
      request_sequence = p_request_sequence,
      successful_page_count = successful_page_count + 1,
      observed_event_count = observed_event_count + v_event_count,
      response_bytes = response_bytes + p_raw_body_bytes,
      lease_token_digest = case
        when p_next_checkpoint_status in ('continue', 'ready') then lease_token_digest
        else null end,
      lease_token_format_version = case
        when p_next_checkpoint_status in ('continue', 'ready') then lease_token_format_version
        else null end,
      lease_expires_at = case
        when p_next_checkpoint_status in ('continue', 'ready') then lease_expires_at
        else null end,
      lease_acquired_at = case
        when p_next_checkpoint_status in ('continue', 'ready') then lease_acquired_at
        else null end,
      lease_max_expires_at = case
        when p_next_checkpoint_status in ('continue', 'ready') then lease_max_expires_at
        else null end,
      lease_renew_count = case
        when p_next_checkpoint_status in ('continue', 'ready') then lease_renew_count
        else 0 end,
      lease_policy_version = case
        when p_next_checkpoint_status in ('continue', 'ready') then lease_policy_version
        else null end,
      updated_at = clock_timestamp()
  where id = v_work_unit.id
    and row_version = p_expected_work_unit_row_version
    and checkpoint_mac = p_expected_checkpoint_mac
  returning row_version into v_new_work_unit_row_version;
  if not found then raise exception 'CAPTURE_WORK_UNIT_CAS_MISMATCH'; end if;

  if p_next_checkpoint_status in ('continue', 'ready')
    and to_regclass('public.broker_capture_account_leases') is not null
  then
    execute $account_lease_advance$
      update public.broker_capture_account_leases
      set work_unit_row_version = $3,
          row_version = row_version + 1,
          updated_at = clock_timestamp()
      where broker_account_id = $1
        and sync_kind = 'provider_api_observation'
        and state = 'leased'
        and work_unit_id = $2
        and run_id = $4
        and scope_id = $5
        and user_id = $6
        and sync_activation_id = $7
        and activation_generation = $8
        and lane_state_id = $9
        and policy_generation = $10
        and work_unit_row_version = $11
        and lease_epoch = $12
        and lease_token_digest = $13
        and lease_acquired_at = $14
        and lease_expires_at = $15
        and lease_max_expires_at = $16
        and lease_renew_count = $17
        and lease_policy_version = 'lease-control-v1'
    $account_lease_advance$
    using v_work_unit.broker_account_id, v_work_unit.id,
      v_new_work_unit_row_version, v_work_unit.run_id, v_work_unit.scope_id,
      v_work_unit.user_id, v_work_unit.sync_activation_id,
      v_work_unit.activation_generation, v_work_unit.lane_state_id,
      v_work_unit.policy_generation, p_expected_work_unit_row_version,
      v_work_unit.lease_epoch, v_work_unit.lease_token_digest,
      v_work_unit.lease_acquired_at, v_work_unit.lease_expires_at,
      v_work_unit.lease_max_expires_at, v_work_unit.lease_renew_count;
    get diagnostics v_account_lease_row_count = row_count;
    if v_account_lease_row_count <> 1 then
      raise exception 'CAPTURE_ACCOUNT_LEASE_CAS_MISMATCH';
    end if;
  elsif p_next_checkpoint_status not in ('continue', 'ready')
    and to_regclass('public.broker_capture_account_leases') is not null
  then
    execute $account_lease_release$
      update public.broker_capture_account_leases
      set state = 'available', sync_activation_id = null,
          activation_generation = null, work_unit_id = null, run_id = null,
          scope_id = null, lane_state_id = null, policy_generation = null,
          work_unit_row_version = null, lease_epoch = null,
          lease_token_digest = null, lease_acquired_at = null,
          lease_expires_at = null, lease_max_expires_at = null,
          lease_renew_count = null, lease_policy_version = null,
          row_version = row_version + 1, updated_at = clock_timestamp()
      where broker_account_id = $1
        and sync_kind = 'provider_api_observation'
        and state = 'leased' and work_unit_id = $2
        and run_id = $3 and scope_id = $4 and user_id = $5
        and sync_activation_id = $6 and activation_generation = $7
        and lane_state_id = $8 and policy_generation = $9
        and work_unit_row_version = $10 and lease_epoch = $11
        and lease_token_digest = $12 and lease_acquired_at = $13
        and lease_expires_at = $14 and lease_max_expires_at = $15
        and lease_renew_count = $16
        and lease_policy_version = 'lease-control-v1'
    $account_lease_release$
    using v_work_unit.broker_account_id, v_work_unit.id, v_work_unit.run_id,
      v_work_unit.scope_id, v_work_unit.user_id, v_work_unit.sync_activation_id,
      v_work_unit.activation_generation, v_work_unit.lane_state_id,
      v_work_unit.policy_generation, p_expected_work_unit_row_version,
      v_work_unit.lease_epoch, v_work_unit.lease_token_digest,
      v_work_unit.lease_acquired_at, v_work_unit.lease_expires_at,
      v_work_unit.lease_max_expires_at, v_work_unit.lease_renew_count;
    get diagnostics v_account_lease_row_count = row_count;
    if v_account_lease_row_count <> 1 then
      raise exception 'CAPTURE_ACCOUNT_LEASE_CAS_MISMATCH';
    end if;
  end if;

  update public.broker_sync_scopes
  set scope_completeness = case
        when scope_completeness = 'partial' or p_scope_completeness = 'partial' then 'partial'
        else 'unverified'
      end,
      stability_status = case
        when scope_completeness = 'partial' or p_scope_completeness = 'partial' then 'invalidated'
        else stability_status
      end,
      closed_at = case
        when p_next_checkpoint_status in ('terminal_observed', 'partial_failed', 'loop_blocked') then clock_timestamp()
        else closed_at
      end
  where id = v_scope.id
    and user_id = v_scope.user_id
    and broker_account_id = v_scope.broker_account_id;

  update public.broker_capture_runs
  set status = case when status = 'pending' then 'running' else status end,
      started_at = coalesce(started_at, p_request_started_at),
      observed_event_count = observed_event_count + v_event_count,
      inserted_raw_event_count = inserted_raw_event_count + v_inserted_count,
      repeated_observation_count = repeated_observation_count + v_repeated_count
  where id = v_run.id
    and user_id = v_run.user_id
    and broker_account_id = v_run.broker_account_id;

  -- Scope and run writes can wait on rows that were deliberately not held
  -- throughout the validation phase. Revalidate time-bounded authority after
  -- those final possible waits; any failure rolls the entire page back.
  if clock_timestamp() >= v_rpc_deadline then
    raise exception 'CAPTURE_RPC_DEADLINE_EXCEEDED';
  end if;
  if v_work_unit.lease_expires_at <= clock_timestamp() then
    raise exception 'CAPTURE_LEASE_INVALID';
  end if;
  if v_integrity_key.valid_from > clock_timestamp()
    or (v_integrity_key.valid_to is not null and v_integrity_key.valid_to <= clock_timestamp())
  then
    raise exception 'CAPTURE_INTEGRITY_KEY_INVALID';
  end if;

  return jsonb_build_object(
    'status', 'page_committed',
    'requestResultId', p_request_result_id,
    'workUnitRowVersion', v_new_work_unit_row_version,
    'ledgerGeneration', v_new_ledger_generation,
    'insertedRawEvents', v_inserted_count,
    'repeatedObservations', v_repeated_count,
    'observations', v_observation_count,
    'scopeCompleteness', p_scope_completeness,
    'authorityBlocked', true
  );
exception
  -- lock_timeout raises lock_not_available (55P03). PostgREST hoists the
  -- function statement_timeout before invoking this RPC, and PostgreSQL raises
  -- query_canceled (57014) when that request budget is exhausted. Both cases
  -- are closed, resumable failures; the surrounding transaction rolls back.
  when lock_not_available then
    raise exception 'CAPTURE_LOCK_TIMEOUT';
  when query_canceled then
    raise exception 'CAPTURE_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_commit_broker_capture_page_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  text,
  text,
  text,
  text,
  uuid,
  bigint,
  text,
  bigint,
  uuid,
  integer,
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz,
  timestamptz,
  integer,
  integer,
  text,
  text,
  text,
  text,
  integer,
  text,
  jsonb,
  text,
  jsonb,
  text,
  text,
  text,
  integer,
  jsonb
) from public, anon, authenticated;

grant execute on function public.equora_commit_broker_capture_page_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  text,
  text,
  text,
  text,
  uuid,
  bigint,
  text,
  bigint,
  uuid,
  integer,
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz,
  timestamptz,
  integer,
  integer,
  text,
  text,
  text,
  text,
  integer,
  text,
  jsonb,
  text,
  jsonb,
  text,
  text,
  text,
  integer,
  jsonb
) to service_role;

insert into equora_private.schema_migrations (
  migration_id,
  contract_fingerprint
) values (
  'equora_v57.61.0_broker_capture_v1',
  'ab08958bdeb88b9637351e2690c08f311d1653f3dba33d4cf11c61d4a81399b6'
) on conflict (migration_id) do nothing;

do $$
declare
  v_rpc_identity_arguments text;
begin
  select pg_get_function_identity_arguments(procedure_row.oid)
    into v_rpc_identity_arguments
  from pg_proc procedure_row
  join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
  where namespace_row.nspname = 'public'
    and procedure_row.proname = 'equora_commit_broker_capture_page_v1';

  if v_rpc_identity_arguments is distinct from concat_ws(', ',
    'p_work_unit_id uuid',
    'p_expected_run_id uuid',
    'p_expected_broker_account_id uuid',
    'p_expected_connection_account_id uuid',
    'p_expected_sync_activation_id uuid',
    'p_expected_activation_generation integer',
    'p_expected_scope_digest text',
    'p_transition_mac_version text',
    'p_transition_integrity_key_version text',
    'p_transition_mac text',
    'p_lease_token uuid',
    'p_expected_work_unit_row_version bigint',
    'p_expected_checkpoint_mac text',
    'p_expected_ledger_generation bigint',
    'p_request_result_id uuid',
    'p_request_sequence integer',
    'p_method text',
    'p_request_origin text',
    'p_request_path text',
    'p_request_query jsonb',
    'p_transport_contract_version text',
    'p_request_started_at timestamp with time zone',
    'p_response_received_at timestamp with time zone',
    'p_request_duration_ms integer',
    'p_http_status integer',
    'p_provider_status_class text',
    'p_response_classification text',
    'p_raw_body_base64 text',
    'p_raw_body_digest text',
    'p_raw_body_bytes integer',
    'p_page_observation_digest text',
    'p_page_metadata jsonb',
    'p_scope_completeness text',
    'p_next_checkpoint jsonb',
    'p_next_checkpoint_mac text',
    'p_next_checkpoint_status text',
    'p_next_checkpoint_reason text',
    'p_next_page_number integer',
    'p_events jsonb'
  ) then
    raise exception 'MIGRATION_RPC_SIGNATURE_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'equora_commit_broker_capture_page_v1'
      and procedure_row.proconfig @> array[
        'lock_timeout=2s',
        'statement_timeout=15s'
      ]::text[]
  ) then
    raise exception 'MIGRATION_RPC_TIMEOUT_CONFIG_DRIFT';
  end if;

  if not exists (
      select 1 from equora_private.schema_migrations
      where migration_id = 'equora_v57.61.0_broker_capture_v1'
        and contract_fingerprint = 'ab08958bdeb88b9637351e2690c08f311d1653f3dba33d4cf11c61d4a81399b6'
    )
    or not exists (
      select 1 from pg_class
      where oid = 'equora_private.broker_capture_integrity_keys'::regclass
        and relrowsecurity = true
    )
    or has_schema_privilege('service_role', 'equora_private', 'usage')
    or has_table_privilege('service_role', 'equora_private.broker_capture_integrity_keys', 'select')
    or not exists (
      select 1 from pg_constraint
      where conrelid = 'public.broker_sync_activations'::regclass
        and conname in (
          'broker_sync_activations_credential_fkey',
          'broker_sync_activations_integrity_key_fkey'
        )
      group by conrelid
      having count(*) = 2
    )
    or to_regclass('public.idx_broker_capture_work_units_owner') is null
    or to_regclass('public.idx_broker_provider_request_results_owner') is null
  then
    raise exception 'MIGRATION_CRITICAL_STRUCTURE_DRIFT';
  end if;
end;
$$;

commit;

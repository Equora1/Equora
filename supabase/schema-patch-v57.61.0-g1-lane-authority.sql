-- Equora v57.61.0 - G1 local lane/gap authority foundation.
--
-- Local migration artifact only. Do not execute this file against a connected
-- Supabase project or production database before the documented migration,
-- backup/restore, RLS and rollout gates have passed and the user has approved.
--
-- This patch does not call a broker, decrypt credentials, create work units,
-- schedule capture, normalize events, create journal trades or enable import.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '120s';

do $$
declare
  v_control_fingerprint text;
begin
  select contract_fingerprint into v_control_fingerprint
  from equora_private.schema_migrations
  where migration_id = 'equora_v57.61.0_g1_capture_control_v1';

  if v_control_fingerprint is distinct from
      'c133d5e0c987e7f927963db4465ef5ab2f6f4c174cfdc96a3ed1cffb5cd62be5'
  then
    raise exception 'LANE_AUTHORITY_CONTROL_MIGRATION_NOT_APPLIED';
  end if;
end;
$$;

do $$
declare
  v_migration_id constant text := 'equora_v57.61.0_g1_lane_authority_v1';
  v_contract_fingerprint constant text := '6be313155e81e0f14c48d0c71301e28a75b792a90e49542bc49ffe638f56c68d';
  v_existing_fingerprint text;
begin
  select contract_fingerprint into v_existing_fingerprint
  from equora_private.schema_migrations
  where migration_id = v_migration_id;

  if v_existing_fingerprint is null and (
    to_regclass('public.broker_sync_lane_requirements') is not null
    or to_regprocedure(
      'public.equora_lane_watermark_digest_v1(uuid,integer,uuid,text,text,text,text,text,bigint,text,bigint,text,text)'
    ) is not null
    or to_regprocedure(
      'public.equora_gap_resolution_digest_v1(uuid,uuid,integer,uuid,text,text,text,text,text,bigint,bigint,bigint,boolean,boolean,text,uuid,text,text)'
    ) is not null
    or to_regclass('public.broker_sync_lane_states') is not null
    or to_regclass('public.broker_sync_gaps') is not null
    or to_regprocedure(
      'public.equora_derive_capture_health_at_v1(uuid,timestamp with time zone)'
    ) is not null
    or to_regprocedure(
      'public.equora_derive_capture_health_v1(uuid)'
    ) is not null
  ) then
    raise exception 'LANE_AUTHORITY_PREEXISTING_PARTIAL_SCHEMA';
  end if;

  if v_existing_fingerprint is not null
    and v_existing_fingerprint is distinct from v_contract_fingerprint
  then
    raise exception 'LANE_AUTHORITY_CONTRACT_FINGERPRINT_DRIFT';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Canonical authority digests. These helpers are internal and immutable; a
-- future mutation RPC must calculate, not accept, the resulting digest.
-- ---------------------------------------------------------------------------

create or replace function public.equora_lane_watermark_digest_v1(
  p_sync_activation_id uuid,
  p_activation_generation integer,
  p_broker_account_id uuid,
  p_capability_id text,
  p_instrument_scope_key text,
  p_lane_id text,
  p_profile_id text,
  p_profile_version text,
  p_policy_generation bigint,
  p_last_complete_scope_digest text,
  p_high_watermark_time_ms bigint,
  p_high_watermark_tie_breaker text,
  p_watermark_contract_version text
) returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_part text;
  v_payload bytea := decode('', 'hex');
begin
  foreach v_part in array array[
    'equora-lane-watermark-v1',
    p_sync_activation_id::text,
    p_activation_generation::text,
    p_broker_account_id::text,
    p_capability_id,
    p_instrument_scope_key,
    p_lane_id,
    p_profile_id,
    p_profile_version,
    p_policy_generation::text,
    p_last_complete_scope_digest,
    p_high_watermark_time_ms::text,
    p_high_watermark_tie_breaker,
    p_watermark_contract_version
  ] loop
    v_payload := v_payload || convert_to(
      octet_length(convert_to(v_part, 'UTF8'))::text || ':' || v_part || '|',
      'UTF8'
    );
  end loop;
  return encode(public.equora_pgcrypto_digest_v1(v_payload, 'sha256'), 'hex');
end;
$$;

revoke all on function public.equora_lane_watermark_digest_v1(
  uuid, integer, uuid, text, text, text, text, text, bigint, text, bigint, text, text
) from public, anon, authenticated, service_role;

create or replace function public.equora_gap_resolution_digest_v1(
  p_gap_id uuid,
  p_sync_activation_id uuid,
  p_activation_generation integer,
  p_broker_account_id uuid,
  p_capability_id text,
  p_instrument_scope_key text,
  p_lane_id text,
  p_profile_id text,
  p_profile_version text,
  p_policy_generation bigint,
  p_gap_from_ms bigint,
  p_gap_to_ms bigint,
  p_left_boundary_unknown boolean,
  p_right_boundary_unknown boolean,
  p_required_resolution_source text,
  p_resolution_scope_id uuid,
  p_resolution_scope_digest text,
  p_resolution_contract_version text
) returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_part text;
  v_payload bytea := decode('', 'hex');
begin
  foreach v_part in array array[
    'equora-gap-resolution-v1',
    p_gap_id::text,
    p_sync_activation_id::text,
    p_activation_generation::text,
    p_broker_account_id::text,
    p_capability_id,
    p_instrument_scope_key,
    p_lane_id,
    p_profile_id,
    p_profile_version,
    p_policy_generation::text,
    coalesce(p_gap_from_ms::text, '<unknown>'),
    coalesce(p_gap_to_ms::text, '<unknown>'),
    p_left_boundary_unknown::text,
    p_right_boundary_unknown::text,
    p_required_resolution_source,
    p_resolution_scope_id::text,
    p_resolution_scope_digest,
    p_resolution_contract_version
  ] loop
    v_payload := v_payload || convert_to(
      octet_length(convert_to(v_part, 'UTF8'))::text || ':' || v_part || '|',
      'UTF8'
    );
  end loop;
  return encode(public.equora_pgcrypto_digest_v1(v_payload, 'sha256'), 'hex');
end;
$$;

revoke all on function public.equora_gap_resolution_digest_v1(
  uuid, uuid, integer, uuid, text, text, text, text, text, bigint,
  bigint, bigint, boolean, boolean, text, uuid, text, text
) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Current and superseded lane authority. A row is current only while
-- superseded_at is null. The three API lanes remain disjoint.
-- ---------------------------------------------------------------------------

create unique index if not exists broker_sync_scopes_lane_authority_reference_unique
  on public.broker_sync_scopes (
    id,
    user_id,
    broker_account_id,
    sync_activation_id,
    activation_generation,
    capability_id,
    instrument_scope_key,
    lane_id,
    profile_id,
    profile_version
  );

create unique index if not exists broker_sync_scopes_lane_authority_digest_reference_unique
  on public.broker_sync_scopes (
    id,
    user_id,
    broker_account_id,
    sync_activation_id,
    activation_generation,
    capability_id,
    instrument_scope_key,
    lane_id,
    profile_id,
    profile_version,
    scope_digest
  );

create table if not exists public.broker_sync_lane_requirements (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  provider_code text not null,
  provider_contract_version text not null,
  adapter_version text not null,
  capability_id text not null,
  capability_version text not null,
  instrument_scope_key text not null,
  profile_id text not null,
  profile_version text not null,
  policy_generation bigint not null,
  requirement_source text not null,
  row_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint broker_sync_lane_requirements_activation_fkey
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
  constraint broker_sync_lane_requirements_generation_check
    check (activation_generation > 0 and policy_generation > 0),
  constraint broker_sync_lane_requirements_versions_check
    check (
      capability_id ~ '^[a-z][a-z0-9_]{0,126}$'
      and capability_version ~ '^[a-z0-9][a-z0-9_.-]{0,126}$'
      and profile_id ~ '^[a-z][a-z0-9_.-]{0,126}$'
      and profile_version ~ '^[a-z0-9][a-z0-9_.-]{0,126}$'
    ),
  constraint broker_sync_lane_requirements_scope_key_check
    check (octet_length(instrument_scope_key) between 1 and 512),
  constraint broker_sync_lane_requirements_source_check
    check (requirement_source in (
      'activation_plan', 'instrument_discovery', 'explicit_account_scope'
    )),
  constraint broker_sync_lane_requirements_row_version_check
    check (row_version >= 0),
  constraint broker_sync_lane_requirements_time_check
    check (
      updated_at >= created_at
      and (superseded_at is null or (
        superseded_at >= created_at and updated_at >= superseded_at
      ))
    ),
  constraint broker_sync_lane_requirements_id_authority_key
    unique (
      id,
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      capability_version,
      instrument_scope_key,
      profile_id,
      profile_version,
      policy_generation
    ),
  constraint broker_sync_lane_requirements_authority_generation_unique
    unique (
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      instrument_scope_key,
      profile_id,
      profile_version,
      policy_generation
    )
);

create unique index if not exists broker_sync_lane_requirements_current_unique
  on public.broker_sync_lane_requirements (
    user_id,
    broker_account_id,
    sync_activation_id,
    activation_generation,
    capability_id,
    instrument_scope_key,
    profile_id,
    profile_version
  )
  where superseded_at is null;

create index if not exists idx_broker_sync_lane_requirements_owner_current
  on public.broker_sync_lane_requirements (
    user_id, broker_account_id, sync_activation_id, activation_generation,
    superseded_at, capability_id, instrument_scope_key
  );

create index if not exists idx_broker_sync_lane_requirements_activation_fkey
  on public.broker_sync_lane_requirements (
    sync_activation_id, user_id, broker_account_id, activation_generation,
    provider_code, provider_contract_version, adapter_version, profile_id,
    profile_version
  );

create table if not exists public.broker_sync_lane_states (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  lane_requirement_id uuid not null,
  provider_code text not null,
  provider_contract_version text not null,
  adapter_version text not null,
  capability_id text not null,
  capability_version text not null,
  instrument_scope_key text not null,
  lane_id text not null,
  profile_id text not null,
  profile_version text not null,
  policy_generation bigint not null,
  observation_status text not null default 'not_observed',
  health text,
  last_complete_at timestamptz,
  next_due_at timestamptz,
  last_complete_scope_id uuid,
  last_complete_scope_digest text,
  high_watermark_time_ms bigint,
  high_watermark_tie_breaker text,
  watermark_contract_version text,
  watermark_digest text,
  last_error_code text,
  last_error_at timestamptz,
  due_generation bigint not null default 1,
  row_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint broker_sync_lane_states_activation_fkey
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
  constraint broker_sync_lane_states_requirement_fkey
    foreign key (
      lane_requirement_id,
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      capability_version,
      instrument_scope_key,
      profile_id,
      profile_version,
      policy_generation
    )
    references public.broker_sync_lane_requirements (
      id,
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      capability_version,
      instrument_scope_key,
      profile_id,
      profile_version,
      policy_generation
    )
    on delete restrict,
  constraint broker_sync_lane_states_last_scope_fkey
    foreign key (
      last_complete_scope_id,
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      instrument_scope_key,
      lane_id,
      profile_id,
      profile_version,
      last_complete_scope_digest
    )
    references public.broker_sync_scopes (
      id,
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      instrument_scope_key,
      lane_id,
      profile_id,
      profile_version,
      scope_digest
    )
    on delete restrict,
  constraint broker_sync_lane_states_generation_check
    check (activation_generation > 0 and policy_generation > 0),
  constraint broker_sync_lane_states_lane_check
    check (lane_id in (
      'incremental_fast_6h',
      'rolling_audit_7d_daily',
      'rolling_audit_28d_weekly'
    )),
  constraint broker_sync_lane_states_observation_check
    check (observation_status in ('not_observed', 'observed')),
  constraint broker_sync_lane_states_health_check
    check (health is null or health in (
      'healthy', 'degraded', 'gap_requires_export', 'paused'
    )),
  constraint broker_sync_lane_states_observation_health_check
    check (
      (observation_status = 'not_observed' and health is null
        and last_complete_at is null and last_complete_scope_id is null
        and last_complete_scope_digest is null
        and high_watermark_time_ms is null
        and high_watermark_tie_breaker is null
        and watermark_contract_version is null
        and watermark_digest is null)
      or
      (observation_status = 'observed' and health is not null)
    ),
  constraint broker_sync_lane_states_complete_scope_check
    check (
      (last_complete_at is null and last_complete_scope_id is null
        and last_complete_scope_digest is null)
      or
      (last_complete_at is not null and last_complete_scope_id is not null
        and last_complete_scope_digest is not null
        and last_complete_scope_digest ~ '^[a-f0-9]{64}$')
    ),
  constraint broker_sync_lane_states_healthy_check
    check (
      health is distinct from 'healthy'
      or (last_complete_at is not null and next_due_at is not null
        and last_complete_scope_id is not null
        and last_complete_scope_digest is not null
        and high_watermark_time_ms is not null)
    ),
  constraint broker_sync_lane_states_watermark_check
    check (
      (high_watermark_time_ms is null and high_watermark_tie_breaker is null
        and watermark_contract_version is null and watermark_digest is null)
      or
      (high_watermark_time_ms is not null
        and high_watermark_time_ms >= 0
        and high_watermark_tie_breaker is not null
        and octet_length(high_watermark_tie_breaker) between 1 and 256
        and watermark_contract_version is not null
        and watermark_contract_version = 'broker-lane-watermark-v1'
        and watermark_digest is not null
        and watermark_digest ~ '^[a-f0-9]{64}$'
        and last_complete_scope_digest is not null
        and watermark_digest = public.equora_lane_watermark_digest_v1(
          sync_activation_id,
          activation_generation,
          broker_account_id,
          capability_id,
          instrument_scope_key,
          lane_id,
          profile_id,
          profile_version,
          policy_generation,
          last_complete_scope_digest,
          high_watermark_time_ms,
          high_watermark_tie_breaker,
          watermark_contract_version
        ))
    ),
  constraint broker_sync_lane_states_error_check
    check (
      (last_error_code is null and last_error_at is null)
      or
      (last_error_code is not null
        and last_error_code ~ '^[a-z][a-z0-9_]{0,62}$'
        and last_error_at is not null)
    ),
  constraint broker_sync_lane_states_versions_check
    check (
      capability_id ~ '^[a-z][a-z0-9_]{0,126}$'
      and capability_version ~ '^[a-z0-9][a-z0-9_.-]{0,126}$'
      and profile_id ~ '^[a-z][a-z0-9_.-]{0,126}$'
      and profile_version ~ '^[a-z0-9][a-z0-9_.-]{0,126}$'
    ),
  constraint broker_sync_lane_states_scope_key_check
    check (octet_length(instrument_scope_key) between 1 and 512),
  constraint broker_sync_lane_states_row_version_check
    check (row_version >= 0 and due_generation > 0),
  constraint broker_sync_lane_states_time_check
    check (
      updated_at >= created_at
      and (superseded_at is null or superseded_at >= created_at)
      and (last_complete_at is null or last_complete_at >= created_at)
      and (next_due_at is null or last_complete_at is null or next_due_at > last_complete_at)
    ),
  constraint broker_sync_lane_states_id_authority_key
    unique (
      id,
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      lane_requirement_id,
      capability_id,
      instrument_scope_key,
      lane_id,
      profile_id,
      profile_version,
      policy_generation
    ),
  constraint broker_sync_lane_states_gap_authority_key
    unique (
      id,
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      instrument_scope_key,
      lane_id,
      profile_id,
      profile_version,
      policy_generation
    ),
  constraint broker_sync_lane_states_authority_generation_unique
    unique (
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      instrument_scope_key,
      lane_id,
      profile_id,
      profile_version,
      policy_generation
    )
);

alter table public.broker_sync_lane_states
  add column if not exists due_generation bigint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_sync_lane_states'::regclass
      and conname = 'broker_sync_lane_states_id_tenant_activation_key'
  ) then
    alter table public.broker_sync_lane_states
      add constraint broker_sync_lane_states_id_tenant_activation_key
      unique (
        id, user_id, broker_account_id, sync_activation_id, activation_generation
      );
  end if;
end;
$$;

alter table public.broker_sync_lane_states
  drop constraint if exists broker_sync_lane_states_row_version_check;
alter table public.broker_sync_lane_states
  add constraint broker_sync_lane_states_row_version_check
  check ((row_version >= 0 and due_generation > 0) is true);

create unique index if not exists broker_sync_lane_states_current_unique
  on public.broker_sync_lane_states (
    user_id,
    broker_account_id,
    sync_activation_id,
    activation_generation,
    capability_id,
    instrument_scope_key,
    lane_id,
    profile_id,
    profile_version
  )
  where superseded_at is null;

create index if not exists idx_broker_sync_lane_states_owner_activation_current
  on public.broker_sync_lane_states (
    user_id, broker_account_id, sync_activation_id, activation_generation,
    superseded_at, capability_id, instrument_scope_key, lane_id
  );

create index if not exists idx_broker_sync_lane_states_current_due
  on public.broker_sync_lane_states (
    next_due_at, sync_activation_id, lane_id, id
  )
  where superseded_at is null and next_due_at is not null;

create index if not exists idx_broker_sync_lane_states_activation_fkey
  on public.broker_sync_lane_states (
    sync_activation_id, user_id, broker_account_id, activation_generation,
    provider_code, provider_contract_version, adapter_version, profile_id,
    profile_version
  );

create index if not exists idx_broker_sync_lane_states_requirement_fkey
  on public.broker_sync_lane_states (
    lane_requirement_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, capability_id, capability_version,
    instrument_scope_key, profile_id, profile_version, policy_generation
  );

create index if not exists idx_broker_sync_lane_states_last_scope_fkey
  on public.broker_sync_lane_states (
    last_complete_scope_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, capability_id, instrument_scope_key, lane_id,
    profile_id, profile_version, last_complete_scope_digest
  )
  where last_complete_scope_id is not null;

-- ---------------------------------------------------------------------------
-- Gap ledger. Resolution requires explicit scope-bound evidence; a later
-- request returning zero events is not sufficient by itself.
-- ---------------------------------------------------------------------------

create table if not exists public.broker_sync_gaps (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  lane_state_id uuid not null,
  capability_id text not null,
  instrument_scope_key text not null,
  lane_id text not null,
  profile_id text not null,
  profile_version text not null,
  policy_generation bigint not null,
  gap_from_ms bigint,
  gap_to_ms bigint,
  left_boundary_unknown boolean not null default false,
  right_boundary_unknown boolean not null default false,
  cause text not null,
  status text not null,
  reason_code text not null,
  required_resolution_source text not null,
  discovery_scope_id uuid,
  resolution_scope_id uuid,
  resolution_scope_digest text,
  resolution_contract_version text,
  resolution_evidence_digest text,
  detected_at timestamptz not null,
  last_checked_at timestamptz not null,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broker_sync_gaps_lane_state_fkey
    foreign key (
      lane_state_id,
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      instrument_scope_key,
      lane_id,
      profile_id,
      profile_version,
      policy_generation
    )
    references public.broker_sync_lane_states (
      id,
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      instrument_scope_key,
      lane_id,
      profile_id,
      profile_version,
      policy_generation
    )
    on delete restrict,
  constraint broker_sync_gaps_discovery_scope_fkey
    foreign key (
      discovery_scope_id,
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      instrument_scope_key,
      lane_id,
      profile_id,
      profile_version
    )
    references public.broker_sync_scopes (
      id,
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      instrument_scope_key,
      lane_id,
      profile_id,
      profile_version
    )
    on delete restrict,
  constraint broker_sync_gaps_resolution_scope_fkey
    foreign key (
      resolution_scope_id,
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      instrument_scope_key,
      lane_id,
      profile_id,
      profile_version
    )
    references public.broker_sync_scopes (
      id,
      user_id,
      broker_account_id,
      sync_activation_id,
      activation_generation,
      capability_id,
      instrument_scope_key,
      lane_id,
      profile_id,
      profile_version
    )
    on delete restrict,
  constraint broker_sync_gaps_generation_check
    check (activation_generation > 0 and policy_generation > 0),
  constraint broker_sync_gaps_lane_check
    check (lane_id in (
      'incremental_fast_6h',
      'rolling_audit_7d_daily',
      'rolling_audit_28d_weekly'
    )),
  constraint broker_sync_gaps_boundary_check
    check (
      (left_boundary_unknown = (gap_from_ms is null))
      and (right_boundary_unknown = (gap_to_ms is null))
      and (gap_from_ms is null or gap_from_ms >= 0)
      and (gap_to_ms is null or gap_to_ms >= 0)
      and (gap_from_ms is null or gap_to_ms is null or gap_from_ms < gap_to_ms)
    ),
  constraint broker_sync_gaps_cause_check
    check (cause in (
      'scheduler_lapse', 'provider_error', 'permission', 'paging',
      'unknown_boundary', 'schema_change', 'manual_pause'
    )),
  constraint broker_sync_gaps_status_check
    check (status in (
      'open', 'degraded', 'requires_export', 'reconciled', 'unsupported'
    )),
  constraint broker_sync_gaps_reason_check
    check (reason_code ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint broker_sync_gaps_required_resolution_source_check
    check (
      required_resolution_source in (
        'complete_api_scope', 'provider_export_scope'
      )
      and (
        status not in ('requires_export', 'unsupported')
        or required_resolution_source = 'provider_export_scope'
      )
      and (
        not left_boundary_unknown and not right_boundary_unknown
        or required_resolution_source = 'provider_export_scope'
      )
    ),
  constraint broker_sync_gaps_resolution_check
    check (
      (status = 'reconciled' and resolution_scope_id is not null
        and gap_from_ms is not null and gap_to_ms is not null
        and not left_boundary_unknown and not right_boundary_unknown
        and resolution_scope_digest is not null
        and resolution_scope_digest ~ '^[a-f0-9]{64}$'
        and resolution_contract_version is not null
        and resolution_contract_version = 'equora-gap-resolution-v1'
        and resolution_evidence_digest is not null
        and resolution_evidence_digest = public.equora_gap_resolution_digest_v1(
          id,
          sync_activation_id,
          activation_generation,
          broker_account_id,
          capability_id,
          instrument_scope_key,
          lane_id,
          profile_id,
          profile_version,
          policy_generation,
          gap_from_ms,
          gap_to_ms,
          left_boundary_unknown,
          right_boundary_unknown,
          required_resolution_source,
          resolution_scope_id,
          resolution_scope_digest,
          resolution_contract_version
        )
        and reconciled_at is not null)
      or
      (status <> 'reconciled' and resolution_scope_id is null
        and resolution_scope_digest is null
        and resolution_contract_version is null
        and resolution_evidence_digest is null and reconciled_at is null)
    ),
  constraint broker_sync_gaps_time_check
    check (
      last_checked_at >= detected_at
      and updated_at >= last_checked_at
      and updated_at >= created_at
      and (reconciled_at is null or (
        reconciled_at >= detected_at and reconciled_at <= updated_at
      ))
    ),
  constraint broker_sync_gaps_id_owner_activation_key
    unique (id, user_id, broker_account_id, sync_activation_id, activation_generation)
);

create index if not exists idx_broker_sync_gaps_owner_activation_current
  on public.broker_sync_gaps (
    user_id, broker_account_id, sync_activation_id, activation_generation,
    status, capability_id, instrument_scope_key, lane_id
  )
  where status <> 'reconciled';

create index if not exists idx_broker_sync_gaps_lane_state_fkey
  on public.broker_sync_gaps (
    lane_state_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, capability_id, instrument_scope_key, lane_id,
    profile_id, profile_version, policy_generation
  );

create index if not exists idx_broker_sync_gaps_discovery_scope_fkey
  on public.broker_sync_gaps (
    discovery_scope_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, capability_id, instrument_scope_key, lane_id,
    profile_id, profile_version
  )
  where discovery_scope_id is not null;

create index if not exists idx_broker_sync_gaps_resolution_scope_fkey
  on public.broker_sync_gaps (
    resolution_scope_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, capability_id, instrument_scope_key, lane_id,
    profile_id, profile_version
  )
  where resolution_scope_id is not null;

-- ---------------------------------------------------------------------------
-- RLS and least privilege. Owner policies exist for future reviewed read
-- surfaces, but no browser or service-role table grants are enabled here.
-- ---------------------------------------------------------------------------

alter table public.broker_sync_lane_requirements enable row level security;
alter table public.broker_sync_lane_states enable row level security;
alter table public.broker_sync_gaps enable row level security;

drop policy if exists "users can read own broker_sync_lane_requirements"
  on public.broker_sync_lane_requirements;
create policy "users can read own broker_sync_lane_requirements"
  on public.broker_sync_lane_requirements
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own broker_sync_lane_states"
  on public.broker_sync_lane_states;
create policy "users can read own broker_sync_lane_states"
  on public.broker_sync_lane_states
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own broker_sync_gaps"
  on public.broker_sync_gaps;
create policy "users can read own broker_sync_gaps"
  on public.broker_sync_gaps
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.broker_sync_lane_requirements
  from public, anon, authenticated, service_role;
revoke all on table public.broker_sync_lane_states
  from public, anon, authenticated, service_role;
revoke all on table public.broker_sync_gaps
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Deterministic health derivation. The timestamp-injected helper is internal;
-- only the clock-bound read-only wrapper is callable by the backend role.
-- capture_health on the activation remains a non-authoritative cache.
-- ---------------------------------------------------------------------------

create or replace function public.equora_derive_capture_health_at_v1(
  p_sync_activation_id uuid,
  p_as_of timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_activation public.broker_sync_activations%rowtype;
  v_health text := 'pending';
  v_required_capability_count integer := 0;
  v_represented_capability_count integer := 0;
  v_required_grain_count integer := 0;
  v_current_lane_count integer := 0;
  v_expected_lane_count integer := 0;
  v_missing_capability_count integer := 0;
  v_missing_lane_count integer := 0;
  v_not_observed_lane_count integer := 0;
  v_export_blocked_lane_count integer := 0;
  v_degraded_lane_count integer := 0;
  v_overdue_lane_count integer := 0;
  v_non_healthy_lane_count integer := 0;
  v_invalid_complete_scope_lane_count integer := 0;
  v_requires_export_gap_count integer := 0;
  v_invalid_reconciliation_count integer := 0;
  v_non_export_gap_count integer := 0;
begin
  if p_sync_activation_id is null or p_as_of is null or not isfinite(p_as_of) then
    raise exception 'LANE_AUTHORITY_INVALID_INPUT';
  end if;

  begin
    select * into strict v_activation
    from public.broker_sync_activations
    where id = p_sync_activation_id;
  exception when no_data_found then
    raise exception 'LANE_AUTHORITY_ACTIVATION_NOT_FOUND';
  when too_many_rows then
    raise exception 'LANE_AUTHORITY_ACTIVATION_IDENTITY_DRIFT';
  end;

  select count(*)::integer
  into v_required_capability_count
  from jsonb_object_keys(v_activation.capability_versions);

  with current_requirements as (
    select requirement.*
    from public.broker_sync_lane_requirements requirement
    where requirement.sync_activation_id = v_activation.id
      and requirement.user_id = v_activation.user_id
      and requirement.broker_account_id = v_activation.broker_account_id
      and requirement.activation_generation = v_activation.activation_generation
      and requirement.superseded_at is null
      and v_activation.capability_versions ? requirement.capability_id
      and v_activation.capability_versions ->> requirement.capability_id
        = requirement.capability_version
  ), current_states as (
    select
      lane_state.*,
      coalesce(
        complete_scope.id is not null
        and complete_scope.scope_digest = lane_state.last_complete_scope_digest
        and complete_scope.scope_completeness = 'complete_for_profile'
        and complete_scope.stability_status in ('observed_once', 'observed_stable')
        and complete_scope.closed_at is not null
        and lane_state.last_complete_at >= complete_scope.closed_at
        and (
          (complete_scope.source_channel = 'provider_api_observation'
            and complete_scope.coverage_basis = 'provider_observed')
          or
          (complete_scope.source_channel = 'provider_export_file'
            and complete_scope.coverage_basis = 'provider_export_observed')
        ),
        false
      ) as healthy_scope_valid
    from public.broker_sync_lane_states lane_state
    join current_requirements requirement
      on requirement.id = lane_state.lane_requirement_id
      and requirement.user_id = lane_state.user_id
      and requirement.broker_account_id = lane_state.broker_account_id
      and requirement.sync_activation_id = lane_state.sync_activation_id
      and requirement.activation_generation = lane_state.activation_generation
      and requirement.capability_id = lane_state.capability_id
      and requirement.capability_version = lane_state.capability_version
      and requirement.instrument_scope_key = lane_state.instrument_scope_key
      and requirement.profile_id = lane_state.profile_id
      and requirement.profile_version = lane_state.profile_version
      and requirement.policy_generation = lane_state.policy_generation
    left join public.broker_sync_scopes complete_scope
      on complete_scope.id = lane_state.last_complete_scope_id
      and complete_scope.user_id = lane_state.user_id
      and complete_scope.broker_account_id = lane_state.broker_account_id
      and complete_scope.sync_activation_id = lane_state.sync_activation_id
      and complete_scope.activation_generation = lane_state.activation_generation
      and complete_scope.capability_id = lane_state.capability_id
      and complete_scope.instrument_scope_key = lane_state.instrument_scope_key
      and complete_scope.lane_id = lane_state.lane_id
      and complete_scope.profile_id = lane_state.profile_id
      and complete_scope.profile_version = lane_state.profile_version
      and complete_scope.scope_digest = lane_state.last_complete_scope_digest
    where lane_state.sync_activation_id = v_activation.id
      and lane_state.superseded_at is null
  ), represented_capabilities as (
    select distinct capability_id
    from current_requirements
  ), effective_gaps as (
    select
      case
        when gap.status <> 'reconciled' then gap.status
        when resolution_scope.id is not null
          and resolution_scope.scope_digest = gap.resolution_scope_digest
          and resolution_scope.scope_completeness = 'complete_for_profile'
          and resolution_scope.stability_status in ('observed_once', 'observed_stable')
          and resolution_scope.closed_at is not null
          and gap.reconciled_at >= resolution_scope.closed_at
          and resolution_scope.request_start_ms <= gap.gap_from_ms
          and resolution_scope.request_end_ms >= gap.gap_to_ms
          and (
            (gap.required_resolution_source = 'provider_export_scope'
              and resolution_scope.source_channel = 'provider_export_file'
              and resolution_scope.coverage_basis = 'provider_export_observed')
            or
            (gap.required_resolution_source = 'complete_api_scope' and (
              (resolution_scope.source_channel = 'provider_api_observation'
                and resolution_scope.coverage_basis = 'provider_observed')
              or
              (resolution_scope.source_channel = 'provider_export_file'
                and resolution_scope.coverage_basis = 'provider_export_observed')
            ))
          )
          and gap.resolution_evidence_digest = public.equora_gap_resolution_digest_v1(
            gap.id,
            gap.sync_activation_id,
            gap.activation_generation,
            gap.broker_account_id,
            gap.capability_id,
            gap.instrument_scope_key,
            gap.lane_id,
            gap.profile_id,
            gap.profile_version,
            gap.policy_generation,
            gap.gap_from_ms,
            gap.gap_to_ms,
            gap.left_boundary_unknown,
            gap.right_boundary_unknown,
            gap.required_resolution_source,
            gap.resolution_scope_id,
            resolution_scope.scope_digest,
            gap.resolution_contract_version
          )
        then 'reconciled'
        else 'invalid_reconciliation'
      end as effective_status
    from public.broker_sync_gaps gap
    left join public.broker_sync_scopes resolution_scope
      on resolution_scope.id = gap.resolution_scope_id
      and resolution_scope.user_id = gap.user_id
      and resolution_scope.broker_account_id = gap.broker_account_id
      and resolution_scope.sync_activation_id = gap.sync_activation_id
      and resolution_scope.activation_generation = gap.activation_generation
      and resolution_scope.capability_id = gap.capability_id
      and resolution_scope.instrument_scope_key = gap.instrument_scope_key
      and resolution_scope.lane_id = gap.lane_id
      and resolution_scope.profile_id = gap.profile_id
      and resolution_scope.profile_version = gap.profile_version
    where gap.user_id = v_activation.user_id
      and gap.broker_account_id = v_activation.broker_account_id
      and gap.sync_activation_id = v_activation.id
      and gap.activation_generation = v_activation.activation_generation
  )
  select
    (select count(*) from represented_capabilities)::integer,
    (select count(*) from current_requirements)::integer,
    (select count(*) from current_states)::integer,
    (select count(*) from current_states
      where observation_status = 'not_observed')::integer,
    (select count(*) from current_states
      where health = 'gap_requires_export')::integer,
    (select count(*) from current_states
      where health in ('degraded', 'paused'))::integer,
    (select count(*) from current_states
      where observation_status = 'observed'
        and next_due_at is not null and next_due_at <= p_as_of)::integer,
    (select count(*) from current_states
      where observation_status = 'observed'
        and health is distinct from 'healthy')::integer,
    (select count(*) from current_states
      where health = 'healthy' and not healthy_scope_valid)::integer,
    (select count(*) from effective_gaps
      where effective_status in ('requires_export', 'unsupported'))::integer,
    (select count(*) from effective_gaps
      where effective_status = 'invalid_reconciliation')::integer,
    (select count(*) from effective_gaps
      where effective_status in ('open', 'degraded'))::integer
  into
    v_represented_capability_count,
    v_required_grain_count,
    v_current_lane_count,
    v_not_observed_lane_count,
    v_export_blocked_lane_count,
    v_degraded_lane_count,
    v_overdue_lane_count,
    v_non_healthy_lane_count,
    v_invalid_complete_scope_lane_count,
    v_requires_export_gap_count,
    v_invalid_reconciliation_count,
    v_non_export_gap_count;

  v_missing_capability_count := greatest(
    v_required_capability_count - v_represented_capability_count,
    0
  );
  v_expected_lane_count := (v_required_grain_count + v_missing_capability_count) * 3;
  v_missing_lane_count := greatest(v_expected_lane_count - v_current_lane_count, 0);

  if v_activation.activation_state = 'revoked' then
    v_health := 'revoked';
  elsif v_activation.activation_state = 'paused' then
    v_health := 'paused';
  elsif v_activation.activation_state in (
    'inactive', 'blocked_permission_evidence', 'pending'
  ) then
    v_health := 'pending';
  elsif v_activation.activation_state = 'active'
    and (v_requires_export_gap_count > 0
      or v_invalid_reconciliation_count > 0
      or v_export_blocked_lane_count > 0)
  then
    v_health := 'gap_requires_export';
  elsif v_activation.activation_state = 'active'
    and (v_expected_lane_count = 0 or v_missing_lane_count > 0
      or v_not_observed_lane_count > 0)
  then
    v_health := 'pending';
  elsif v_activation.activation_state = 'active'
    and (v_degraded_lane_count > 0 or v_overdue_lane_count > 0
      or v_non_export_gap_count > 0 or v_non_healthy_lane_count > 0
      or v_invalid_complete_scope_lane_count > 0)
  then
    v_health := 'degraded';
  elsif v_activation.activation_state = 'active'
    and v_current_lane_count = v_expected_lane_count
    and v_current_lane_count > 0
  then
    v_health := 'healthy';
  else
    v_health := 'pending';
  end if;

  return jsonb_build_object(
    'derivationVersion', 'broker-capture-health-v1',
    'activationId', v_activation.id,
    'activationGeneration', v_activation.activation_generation,
    'health', v_health,
    'authorityBlocked', true,
    'requiredCapabilityCount', v_required_capability_count,
    'representedCapabilityCount', v_represented_capability_count,
    'requiredGrainCount', v_required_grain_count,
    'requiredLaneStateCount', v_expected_lane_count,
    'currentLaneStateCount', v_current_lane_count,
    'missingLaneStateCount', v_missing_lane_count,
    'notObservedLaneCount', v_not_observed_lane_count,
    'overdueLaneCount', v_overdue_lane_count,
    'degradedLaneCount', v_degraded_lane_count,
    'invalidCompleteScopeLaneCount', v_invalid_complete_scope_lane_count,
    'requiresExportGapCount', v_requires_export_gap_count,
    'invalidReconciliationCount', v_invalid_reconciliation_count,
    'exportBlockedLaneCount', v_export_blocked_lane_count,
    'nonExportGapCount', v_non_export_gap_count,
    'persistedCaptureHealth', v_activation.capture_health,
    'cacheMatchesDerived', v_activation.capture_health = v_health,
    'asOf', p_as_of
  );
end;
$$;

revoke all on function public.equora_derive_capture_health_at_v1(
  uuid, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.equora_derive_capture_health_v1(
  p_sync_activation_id uuid
) returns jsonb
language sql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
  select public.equora_derive_capture_health_at_v1(
    p_sync_activation_id,
    clock_timestamp()
  )
$$;

revoke all on function public.equora_derive_capture_health_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.equora_derive_capture_health_v1(uuid)
  to service_role;

insert into equora_private.schema_migrations (
  migration_id,
  contract_fingerprint
) values (
  'equora_v57.61.0_g1_lane_authority_v1',
  '6be313155e81e0f14c48d0c71301e28a75b792a90e49542bc49ffe638f56c68d'
) on conflict (migration_id) do nothing;

do $$
declare
  v_constraint_contract_fingerprint text;
  v_index_contract_fingerprint text;
begin
  if not exists (
      select 1
      from equora_private.schema_migrations
      where migration_id = 'equora_v57.61.0_g1_lane_authority_v1'
        and contract_fingerprint = '6be313155e81e0f14c48d0c71301e28a75b792a90e49542bc49ffe638f56c68d'
    )
    or to_regclass('public.broker_sync_lane_requirements') is null
    or to_regclass('public.broker_sync_lane_states') is null
    or to_regclass('public.broker_sync_gaps') is null
    or not exists (
      select 1
      from pg_class
      where oid in (
        'public.broker_sync_lane_requirements'::regclass,
        'public.broker_sync_lane_states'::regclass,
        'public.broker_sync_gaps'::regclass
      )
        and relrowsecurity = true
      group by relrowsecurity
      having count(*) = 3
    )
    or has_table_privilege(
      'service_role', 'public.broker_sync_lane_requirements',
      'select,insert,update,delete'
    )
    or has_table_privilege(
      'service_role', 'public.broker_sync_lane_states',
      'select,insert,update,delete'
    )
    or has_table_privilege(
      'service_role', 'public.broker_sync_gaps',
      'select,insert,update,delete'
    )
    or has_function_privilege(
      'service_role',
      'public.equora_derive_capture_health_at_v1(uuid,timestamp with time zone)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.equora_derive_capture_health_v1(uuid)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.equora_derive_capture_health_v1(uuid)',
      'execute'
    )
    or has_function_privilege(
      'service_role',
      'public.equora_lane_watermark_digest_v1(uuid,integer,uuid,text,text,text,text,text,bigint,text,bigint,text,text)',
      'execute'
    )
    or has_function_privilege(
      'service_role',
      'public.equora_gap_resolution_digest_v1(uuid,uuid,integer,uuid,text,text,text,text,text,bigint,bigint,bigint,boolean,boolean,text,uuid,text,text)',
      'execute'
    )
    or to_regclass('public.broker_sync_lane_requirements_current_unique') is null
    or to_regclass('public.broker_sync_lane_states_current_unique') is null
    or to_regclass('public.broker_sync_scopes_lane_authority_reference_unique') is null
    or to_regclass('public.broker_sync_scopes_lane_authority_digest_reference_unique') is null
    or to_regclass('public.idx_broker_sync_lane_requirements_activation_fkey') is null
    or to_regclass('public.idx_broker_sync_lane_states_activation_fkey') is null
    or to_regclass('public.idx_broker_sync_lane_states_requirement_fkey') is null
    or to_regclass('public.idx_broker_sync_lane_states_last_scope_fkey') is null
    or to_regclass('public.idx_broker_sync_gaps_lane_state_fkey') is null
    or to_regclass('public.idx_broker_sync_gaps_discovery_scope_fkey') is null
    or to_regclass('public.idx_broker_sync_gaps_resolution_scope_fkey') is null
  then
    raise exception 'LANE_AUTHORITY_CRITICAL_STRUCTURE_DRIFT';
  end if;

  if exists (
    with expected_constraints(relation_name, constraint_name, constraint_type) as (
      values
        ('broker_sync_lane_requirements', 'broker_sync_lane_requirements_activation_fkey', 'f'::"char"),
        ('broker_sync_lane_requirements', 'broker_sync_lane_requirements_id_authority_key', 'u'::"char"),
        ('broker_sync_lane_requirements', 'broker_sync_lane_requirements_authority_generation_unique', 'u'::"char"),
        ('broker_sync_lane_requirements', 'broker_sync_lane_requirements_time_check', 'c'::"char"),
        ('broker_sync_lane_states', 'broker_sync_lane_states_activation_fkey', 'f'::"char"),
        ('broker_sync_lane_states', 'broker_sync_lane_states_requirement_fkey', 'f'::"char"),
        ('broker_sync_lane_states', 'broker_sync_lane_states_last_scope_fkey', 'f'::"char"),
        ('broker_sync_lane_states', 'broker_sync_lane_states_id_authority_key', 'u'::"char"),
        ('broker_sync_lane_states', 'broker_sync_lane_states_id_tenant_activation_key', 'u'::"char"),
        ('broker_sync_lane_states', 'broker_sync_lane_states_gap_authority_key', 'u'::"char"),
        ('broker_sync_lane_states', 'broker_sync_lane_states_authority_generation_unique', 'u'::"char"),
        ('broker_sync_lane_states', 'broker_sync_lane_states_observation_health_check', 'c'::"char"),
        ('broker_sync_lane_states', 'broker_sync_lane_states_complete_scope_check', 'c'::"char"),
        ('broker_sync_lane_states', 'broker_sync_lane_states_healthy_check', 'c'::"char"),
        ('broker_sync_lane_states', 'broker_sync_lane_states_watermark_check', 'c'::"char"),
        ('broker_sync_lane_states', 'broker_sync_lane_states_time_check', 'c'::"char"),
        ('broker_sync_gaps', 'broker_sync_gaps_lane_state_fkey', 'f'::"char"),
        ('broker_sync_gaps', 'broker_sync_gaps_discovery_scope_fkey', 'f'::"char"),
        ('broker_sync_gaps', 'broker_sync_gaps_resolution_scope_fkey', 'f'::"char"),
        ('broker_sync_gaps', 'broker_sync_gaps_boundary_check', 'c'::"char"),
        ('broker_sync_gaps', 'broker_sync_gaps_required_resolution_source_check', 'c'::"char"),
        ('broker_sync_gaps', 'broker_sync_gaps_resolution_check', 'c'::"char"),
        ('broker_sync_gaps', 'broker_sync_gaps_time_check', 'c'::"char")
    )
    select 1
    from expected_constraints expected
    left join pg_namespace namespace_row
      on namespace_row.nspname = 'public'
    left join pg_class relation_row
      on relation_row.relnamespace = namespace_row.oid
      and relation_row.relname = expected.relation_name
    left join pg_constraint constraint_row
      on constraint_row.conrelid = relation_row.oid
      and constraint_row.conname = expected.constraint_name
      and constraint_row.contype = expected.constraint_type
      and constraint_row.convalidated = true
    where constraint_row.oid is null
  ) then
    raise exception 'LANE_AUTHORITY_CONSTRAINT_DRIFT';
  end if;

  select encode(public.equora_pgcrypto_digest_v1(
    convert_to(string_agg(
      relation_row.relname || '|' || constraint_row.conname || '|'
        || constraint_row.contype::text || '|'
        || constraint_row.convalidated::text || '|'
        || pg_get_constraintdef(constraint_row.oid, true),
      E'\n' order by relation_row.relname, constraint_row.conname
    ), 'UTF8'),
    'sha256'
  ), 'hex')
  into v_constraint_contract_fingerprint
  from pg_constraint constraint_row
  join pg_class relation_row on relation_row.oid = constraint_row.conrelid
  join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
  where namespace_row.nspname = 'public'
    and relation_row.relname in (
      'broker_sync_lane_requirements',
      'broker_sync_lane_states',
      'broker_sync_gaps'
    );

  select encode(public.equora_pgcrypto_digest_v1(
    convert_to(string_agg(
      index_row.tablename || '|' || index_row.indexname || '|'
        || index_row.indexdef,
      E'\n' order by index_row.tablename, index_row.indexname
    ), 'UTF8'),
    'sha256'
  ), 'hex')
  into v_index_contract_fingerprint
  from pg_indexes index_row
  where index_row.schemaname = 'public'
    and (
      index_row.tablename in (
        'broker_sync_lane_requirements',
        'broker_sync_lane_states',
        'broker_sync_gaps'
      )
      or index_row.indexname in (
        'broker_sync_scopes_lane_authority_reference_unique',
        'broker_sync_scopes_lane_authority_digest_reference_unique'
      )
    );

  if v_constraint_contract_fingerprint is null
    or v_index_contract_fingerprint is null
  then
    raise exception 'LANE_AUTHORITY_SCHEMA_CONTRACT_FINGERPRINT_MISSING';
  end if;

  raise notice 'LANE_AUTHORITY_SCHEMA_HASHES constraints=% indexes=%',
    v_constraint_contract_fingerprint, v_index_contract_fingerprint;

  if v_constraint_contract_fingerprint is distinct from
      'be0e0ca693e3f2abb588b6b912e4ad838194ef955be10314b33ce0a98b1c9f52'
  then
    raise exception 'LANE_AUTHORITY_CONSTRAINT_DEFINITION_DRIFT';
  end if;

  if v_index_contract_fingerprint is distinct from
      '1ff0f731d9bc35f9aa12025f53f106e4e90b5226fa1b418f3db0edb6f9d7a783'
  then
    raise exception 'LANE_AUTHORITY_INDEX_DEFINITION_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname in (
        'equora_derive_capture_health_at_v1',
        'equora_derive_capture_health_v1'
      )
      and procedure_row.proconfig @> array['statement_timeout=5s']::text[]
    group by namespace_row.nspname
    having count(*) = 2
  ) then
    raise exception 'LANE_AUTHORITY_TIMEOUT_CONFIG_DRIFT';
  end if;
end;
$$;

commit;

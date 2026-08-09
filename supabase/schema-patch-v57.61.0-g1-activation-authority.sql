-- Equora v57.61.0 - G1 local activation and request-authority control plane.
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
  v_lane_fingerprint text;
begin
  select contract_fingerprint into v_lane_fingerprint
  from equora_private.schema_migrations
  where migration_id = 'equora_v57.61.0_g1_lane_authority_v1';

  if v_lane_fingerprint is distinct from
      '955a175d3b05c34f680b94d54a494261d0a51dca2ecaba8ddf2311c20b9bcae5'
  then
    raise exception 'ACTIVATION_AUTHORITY_LANE_MIGRATION_NOT_APPLIED';
  end if;
end;
$$;

do $$
declare
  v_migration_id constant text := 'equora_v57.61.0_g1_activation_authority_v1';
  v_contract_fingerprint constant text :=
    'ef73a48fb05299c4e78908fd1771c61ca1b8241b629cf31bc7f89af594d66c2c';
  v_existing_fingerprint text;
begin
  select contract_fingerprint into v_existing_fingerprint
  from equora_private.schema_migrations
  where migration_id = v_migration_id;

  if v_existing_fingerprint is null and (
    to_regclass('public.broker_sync_activation_commands') is not null
    or to_regclass('public.broker_sync_authority_mutation_receipts') is not null
    or to_regclass('public.broker_capture_request_authorizations') is not null
    or to_regprocedure(
      'public.equora_request_broker_sync_activation_v1(uuid,text,bigint,bigint,uuid)'
    ) is not null
    or to_regprocedure(
      'public.equora_apply_broker_sync_activation_command_v1(uuid)'
    ) is not null
  ) then
    raise exception 'ACTIVATION_AUTHORITY_PREEXISTING_PARTIAL_SCHEMA';
  end if;

  if v_existing_fingerprint is not null
    and v_existing_fingerprint is distinct from v_contract_fingerprint
  then
    raise exception 'ACTIVATION_AUTHORITY_CONTRACT_FINGERPRINT_DRIFT';
  end if;

  -- A non-superuser migration executor cannot safely reclaim a table from an
  -- arbitrary owner. Reject such drift before any table DDL; healthy fresh and
  -- rerun paths pin all three owners to postgres again before ACL normalization.
  if exists (
    select 1
    from pg_class relation_row
    join pg_namespace namespace_row
      on namespace_row.oid = relation_row.relnamespace
    join pg_roles owner_row on owner_row.oid = relation_row.relowner
    where namespace_row.nspname = 'public'
      and relation_row.relname in (
        'broker_sync_activation_commands',
        'broker_sync_authority_mutation_receipts',
        'broker_capture_request_authorizations'
      )
      and owner_row.rolname is distinct from 'postgres'
  ) then
    raise exception 'ACTIVATION_AUTHORITY_TABLE_OWNER_DRIFT';
  end if;

  if exists (
    with expected_v1_core(
      function_signature, expected_statement_timeout
    ) as (
      values
        ('public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)', '10s'),
        ('public.equora_commit_broker_capture_page_v1(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)', '15s'),
        ('public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)', '10s')
    )
    select 1
    from expected_v1_core expected
    left join pg_proc procedure_row
      on procedure_row.oid = to_regprocedure(expected.function_signature)
    left join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    where procedure_row.oid is null
      or owner_row.rolname is distinct from 'postgres'
      or not procedure_row.prosecdef
      or procedure_row.proconfig is null
      or not (
        procedure_row.proconfig @> array[
          'search_path=""', 'lock_timeout=2s',
          'statement_timeout=' || expected.expected_statement_timeout
        ]::text[]
        and procedure_row.proconfig <@ array[
          'search_path=""', 'lock_timeout=2s',
          'statement_timeout=' || expected.expected_statement_timeout
        ]::text[]
      )
  ) then
    raise exception 'ACTIVATION_AUTHORITY_V1_CORE_CONFIG_DRIFT';
  end if;

  if v_existing_fingerprint is null and (
    exists (select 1 from public.broker_capture_work_units)
    or exists (select 1 from public.broker_capture_runs)
    or exists (select 1 from public.broker_sync_scopes)
  ) then
    raise exception 'ACTIVATION_AUTHORITY_UNBOUND_CAPTURE_ROWS_PRESENT';
  end if;
end;
$$;

-- Dedicated, non-login execution owner for the new SECURITY DEFINER surface.
-- BYPASSRLS is confined to this role because it has no login and no usable
-- application membership. PostgreSQL 16+ records the creating `postgres`
-- role as an admin-only, non-inherited and non-settable role grant; postflight
-- permits only that platform-management record. Application callers receive
-- EXECUTE only on the closed RPCs, never role membership.
do $$
declare
  v_owner_role record;
begin
  select * into v_owner_role
  from pg_roles
  where rolname = 'equora_broker_capture_owner';

  if not found then
    execute 'create role equora_broker_capture_owner '
      || 'nologin noinherit nosuperuser nocreatedb nocreaterole '
      || 'noreplication bypassrls';
  elsif v_owner_role.rolcanlogin
    or v_owner_role.rolsuper
    or v_owner_role.rolcreatedb
    or v_owner_role.rolcreaterole
    or v_owner_role.rolreplication
    or v_owner_role.rolinherit
    or not v_owner_role.rolbypassrls
  then
    raise exception 'ACTIVATION_AUTHORITY_OWNER_ROLE_DRIFT';
  end if;

  -- PostgreSQL requires the migration executor to be able to SET ROLE to a
  -- function's new owner. Grant that capability only for this transaction;
  -- it is revoked again immediately after all ownership transfers. The final
  -- postflight rejects every surviving member of the owner role.
  execute format(
    'grant equora_broker_capture_owner to %I',
    current_user
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Activation lifecycle CAS and revocation epoch. Existing activations remain
-- deliberately unbound until they are superseded by the reviewed command path.
-- ---------------------------------------------------------------------------

alter table public.broker_sync_activation_series
  add column if not exists authority_epoch bigint not null default 0;

alter table public.broker_sync_activations
  add column if not exists activation_row_version bigint not null default 0,
  add column if not exists authority_contract_version text,
  add column if not exists lifecycle_reason_code text,
  add column if not exists last_transition_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_sync_activation_series'::regclass
      and conname = 'broker_sync_activation_series_authority_epoch_check'
  ) then
    alter table public.broker_sync_activation_series
      add constraint broker_sync_activation_series_authority_epoch_check
      check (authority_epoch >= 0);
  end if;

  -- Recreate this constraint on rerun so an older fail-open definition cannot
  -- survive merely because it has the expected name. The outer IS TRUE closes
  -- PostgreSQL CHECK/UNKNOWN semantics for every mixed-NULL combination.
  alter table public.broker_sync_activations
    drop constraint if exists broker_sync_activations_authority_control_check;
  alter table public.broker_sync_activations
    add constraint broker_sync_activations_authority_control_check check ((
      activation_row_version >= 0
      and (
        (authority_contract_version is null
          and lifecycle_reason_code is null
          and last_transition_at is null)
        or
        (authority_contract_version is not null
          and authority_contract_version = 'broker-capture-authority-v1'
          and lifecycle_reason_code is not null
          and lifecycle_reason_code ~ '^[a-z][a-z0-9_]{0,62}$'
          and last_transition_at is not null
          and (last_transition_at >= created_at) is true)
      )
    ) is true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Immutable policy binding. A Scope and Work Unit bind one exact Requirement /
-- Lane revision. A Run binds the canonical authority plan that produced all of
-- its Work Units; individual Work Units remain exact-scoped through the Scope.
-- ---------------------------------------------------------------------------

alter table public.broker_sync_scopes
  add column if not exists lane_requirement_id uuid not null,
  add column if not exists lane_state_id uuid not null,
  add column if not exists policy_generation bigint not null,
  add column if not exists authority_contract_version text not null,
  add column if not exists authority_digest text not null;

alter table public.broker_capture_runs
  add column if not exists authority_contract_version text not null,
  add column if not exists authority_plan_digest text not null;

alter table public.broker_capture_work_units
  add column if not exists lane_requirement_id uuid not null,
  add column if not exists lane_state_id uuid not null,
  add column if not exists policy_generation bigint not null,
  add column if not exists authority_contract_version text not null,
  add column if not exists authority_digest text not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_sync_scopes'::regclass
      and conname = 'broker_sync_scopes_lane_authority_fkey'
  ) then
    alter table public.broker_sync_scopes
      add constraint broker_sync_scopes_lane_authority_fkey
      foreign key (
        lane_state_id, user_id, broker_account_id, sync_activation_id,
        activation_generation, lane_requirement_id, capability_id,
        instrument_scope_key, lane_id, profile_id, profile_version,
        policy_generation
      ) references public.broker_sync_lane_states (
        id, user_id, broker_account_id, sync_activation_id,
        activation_generation, lane_requirement_id, capability_id,
        instrument_scope_key, lane_id, profile_id, profile_version,
        policy_generation
      ) on delete restrict deferrable initially deferred;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_capture_work_units'::regclass
      and conname = 'broker_capture_work_units_scope_authority_fkey'
  ) then
    alter table public.broker_sync_scopes
      add constraint broker_sync_scopes_authority_reference_unique unique (
        id, user_id, broker_account_id, sync_activation_id,
        activation_generation, lane_requirement_id, lane_state_id,
        policy_generation, authority_contract_version, authority_digest
      );

    alter table public.broker_capture_work_units
      add constraint broker_capture_work_units_scope_authority_fkey
      foreign key (
        scope_id, user_id, broker_account_id, sync_activation_id,
        activation_generation, lane_requirement_id, lane_state_id,
        policy_generation, authority_contract_version, authority_digest
      ) references public.broker_sync_scopes (
        id, user_id, broker_account_id, sync_activation_id,
        activation_generation, lane_requirement_id, lane_state_id,
        policy_generation, authority_contract_version, authority_digest
      ) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_sync_scopes'::regclass
      and conname = 'broker_sync_scopes_authority_contract_check'
  ) then
    alter table public.broker_sync_scopes
      add constraint broker_sync_scopes_authority_contract_check check (
        policy_generation > 0
        and authority_contract_version = 'broker-capture-authority-v1'
        and authority_digest ~ '^[a-f0-9]{64}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_capture_runs'::regclass
      and conname = 'broker_capture_runs_authority_contract_check'
  ) then
    alter table public.broker_capture_runs
      add constraint broker_capture_runs_authority_contract_check check (
        authority_contract_version = 'broker-capture-authority-v1'
        and authority_plan_digest ~ '^[a-f0-9]{64}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_capture_work_units'::regclass
      and conname = 'broker_capture_work_units_authority_contract_check'
  ) then
    alter table public.broker_capture_work_units
      add constraint broker_capture_work_units_authority_contract_check check (
        policy_generation > 0
        and authority_contract_version = 'broker-capture-authority-v1'
        and authority_digest ~ '^[a-f0-9]{64}$'
      );
  end if;
end;
$$;

create index if not exists idx_broker_sync_scopes_lane_authority_fkey
  on public.broker_sync_scopes (
    lane_state_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, lane_requirement_id, capability_id,
    instrument_scope_key, lane_id, profile_id, profile_version,
    policy_generation
  );

create index if not exists idx_broker_capture_work_units_scope_authority_fkey
  on public.broker_capture_work_units (
    scope_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, lane_requirement_id, lane_state_id,
    policy_generation, authority_contract_version, authority_digest
  );

-- ---------------------------------------------------------------------------
-- Owner-bound lifecycle commands. The authenticated RPC derives the tenant
-- exclusively from auth.uid(); the service-role applier accepts only a command
-- ID and derives every account, provider and credential binding from locked
-- parent rows.
-- ---------------------------------------------------------------------------

create table if not exists public.broker_sync_activation_commands (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_account_id uuid not null,
  broker_account_id uuid not null,
  command_kind text not null,
  expected_series_row_version bigint not null,
  expected_activation_row_version bigint,
  request_digest text not null,
  command_status text not null default 'pending',
  result jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint broker_sync_activation_commands_connection_fkey
    foreign key (connection_account_id, user_id, broker_account_id)
    references public.broker_connection_accounts (id, user_id, broker_account_id)
    on delete restrict,
  constraint broker_sync_activation_commands_kind_check
    check (command_kind in ('activate', 'pause', 'resume', 'revoke')),
  constraint broker_sync_activation_commands_versions_check
    check (
      expected_series_row_version >= 0
      and (expected_activation_row_version is null
        or expected_activation_row_version >= 0)
      and ((command_kind = 'activate')
        or expected_activation_row_version is not null)
    ),
  constraint broker_sync_activation_commands_digest_check
    check (request_digest ~ '^[a-f0-9]{64}$'),
  constraint broker_sync_activation_commands_status_check
    check (command_status in ('pending', 'applied', 'rejected')),
  constraint broker_sync_activation_commands_result_check check (
    (command_status = 'pending' and result is null and applied_at is null)
    or
    (command_status in ('applied', 'rejected') and result is not null
      and jsonb_typeof(result) = 'object' and applied_at is not null
      and applied_at >= created_at)
  )
);

alter table public.broker_sync_activation_commands enable row level security;
drop policy if exists "users can read own broker_sync_activation_commands"
  on public.broker_sync_activation_commands;
create policy "users can read own broker_sync_activation_commands"
  on public.broker_sync_activation_commands for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.broker_sync_activation_commands
  from public, anon, authenticated, service_role;

create index if not exists idx_broker_sync_activation_commands_owner_created
  on public.broker_sync_activation_commands (user_id, created_at desc, id);
create index if not exists idx_broker_sync_activation_commands_connection_fkey
  on public.broker_sync_activation_commands (
    connection_account_id, user_id, broker_account_id
  );

create or replace function public.equora_activation_command_digest_v1(
  p_request_id uuid,
  p_user_id uuid,
  p_connection_account_id uuid,
  p_broker_account_id uuid,
  p_command_kind text,
  p_expected_series_row_version bigint,
  p_expected_activation_row_version bigint
) returns text
language sql
immutable
set search_path = ''
as $$
  select encode(public.equora_pgcrypto_digest_v1(
    convert_to(
      jsonb_build_object(
        'contractVersion', 'broker-activation-command-v1',
        'requestId', p_request_id::text,
        'userId', p_user_id::text,
        'connectionAccountId', p_connection_account_id::text,
        'brokerAccountId', p_broker_account_id::text,
        'commandKind', p_command_kind,
        'expectedSeriesRowVersion', p_expected_series_row_version,
        'expectedActivationRowVersion', p_expected_activation_row_version
      )::text,
      'UTF8'
    ),
    'sha256'
  ), 'hex')
$$;

revoke all on function public.equora_activation_command_digest_v1(
  uuid, uuid, uuid, uuid, text, bigint, bigint
) from public, anon, authenticated, service_role;

create or replace function public.equora_request_broker_sync_activation_v1(
  p_connection_account_id uuid,
  p_command_kind text,
  p_expected_series_row_version bigint,
  p_expected_activation_row_version bigint,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_connection_account public.broker_connection_accounts%rowtype;
  v_existing public.broker_sync_activation_commands%rowtype;
  v_digest text;
begin
  if v_user_id is null
    or p_connection_account_id is null
    or p_request_id is null
    or p_command_kind not in ('activate', 'pause', 'resume', 'revoke')
    or p_expected_series_row_version is null
    or p_expected_series_row_version < 0
    or (p_command_kind <> 'activate' and (
      p_expected_activation_row_version is null
      or p_expected_activation_row_version < 0
    ))
    or (p_expected_activation_row_version is not null
      and p_expected_activation_row_version < 0)
  then
    raise exception 'ACTIVATION_COMMAND_INVALID_INPUT';
  end if;

  select * into v_connection_account
  from public.broker_connection_accounts
  where id = p_connection_account_id
    and user_id = v_user_id;
  if not found then
    raise exception 'ACTIVATION_COMMAND_CONNECTION_NOT_FOUND';
  end if;

  v_digest := public.equora_activation_command_digest_v1(
    p_request_id,
    v_user_id,
    v_connection_account.id,
    v_connection_account.broker_account_id,
    p_command_kind,
    p_expected_series_row_version,
    p_expected_activation_row_version
  );

  select * into v_existing
  from public.broker_sync_activation_commands
  where id = p_request_id;
  if found then
    if v_existing.user_id is distinct from v_user_id
      or v_existing.connection_account_id is distinct from v_connection_account.id
      or v_existing.broker_account_id is distinct from v_connection_account.broker_account_id
      or v_existing.request_digest is distinct from v_digest
    then
      raise exception 'ACTIVATION_COMMAND_REPLAY_MISMATCH';
    end if;
    return jsonb_build_object(
      'commandId', v_existing.id,
      'commandStatus', v_existing.command_status,
      'authorityBlocked', true,
      'result', v_existing.result
    );
  end if;

  insert into public.broker_sync_activation_commands (
    id, user_id, connection_account_id, broker_account_id, command_kind,
    expected_series_row_version, expected_activation_row_version,
    request_digest
  ) values (
    p_request_id, v_user_id, v_connection_account.id,
    v_connection_account.broker_account_id, p_command_kind,
    p_expected_series_row_version, p_expected_activation_row_version,
    v_digest
  ) returning * into v_existing;

  return jsonb_build_object(
    'commandId', v_existing.id,
    'commandStatus', v_existing.command_status,
    'authorityBlocked', true,
    'result', null
  );
exception
  when unique_violation then raise exception 'ACTIVATION_COMMAND_REPLAY_RACE';
  when lock_not_available then raise exception 'ACTIVATION_COMMAND_LOCK_TIMEOUT';
  when query_canceled then raise exception 'ACTIVATION_COMMAND_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_request_broker_sync_activation_v1(
  uuid, text, bigint, bigint, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.equora_request_broker_sync_activation_v1(
  uuid, text, bigint, bigint, uuid
) to authenticated;

create or replace function public.equora_apply_broker_sync_activation_command_v1(
  p_command_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_command public.broker_sync_activation_commands%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_connection_account public.broker_connection_accounts%rowtype;
  v_connection public.broker_connections%rowtype;
  v_credential record;
  v_integrity_key record;
  v_account public.broker_accounts%rowtype;
  v_provider public.broker_providers%rowtype;
  v_runtime_enrollment record;
  v_runtime_enrollment_row_count bigint := 0;
  v_capability_versions jsonb;
  v_permission_evidence jsonb;
  v_new_activation_id uuid;
  v_new_generation integer;
  v_result jsonb;
  v_health jsonb;
  v_pins_match boolean := false;
  v_mutated boolean := false;
begin
  if p_command_id is null then
    raise exception 'ACTIVATION_APPLY_INVALID_INPUT';
  end if;

  select * into v_command
  from public.broker_sync_activation_commands
  where id = p_command_id
  for update;
  if not found then
    raise exception 'ACTIVATION_APPLY_COMMAND_NOT_FOUND';
  end if;
  if v_command.command_status in ('applied', 'rejected') then
    return v_command.result;
  end if;

  -- Existing Series paths always lock Series before Activation and Connection.
  select * into v_series
  from public.broker_sync_activation_series
  where user_id = v_command.user_id
    and connection_account_id = v_command.connection_account_id
    and broker_account_id = v_command.broker_account_id
  for update;

  if not found then
    if v_command.command_kind <> 'activate'
      or v_command.expected_series_row_version <> 0
    then
      raise exception 'ACTIVATION_APPLY_SERIES_NOT_FOUND';
    end if;

    -- First creation has no Series row to lock. The canonical Connection-
    -- Account parent serializes the unique create path; no Work Unit can exist
    -- before the Series and Current Pointer exist.
    select * into v_connection_account
    from public.broker_connection_accounts
    where id = v_command.connection_account_id
      and user_id = v_command.user_id
      and broker_account_id = v_command.broker_account_id
    for update;
    if not found then
      raise exception 'ACTIVATION_APPLY_CONNECTION_NOT_FOUND';
    end if;

    select * into v_series
    from public.broker_sync_activation_series
    where user_id = v_command.user_id
      and connection_account_id = v_command.connection_account_id
      and broker_account_id = v_command.broker_account_id
    for update;

    if not found then
      insert into public.broker_sync_activation_series (
        user_id, connection_account_id, broker_account_id,
        series_policy_version, series_row_version, authority_epoch
      ) values (
        v_command.user_id, v_command.connection_account_id,
        v_command.broker_account_id, 'prospective_capture_v1', 0, 0
      ) returning * into v_series;
    end if;
  end if;

  if v_series.series_row_version <> v_command.expected_series_row_version then
    v_result := jsonb_build_object(
      'status', 'rejected',
      'errorCode', 'ACTIVATION_APPLY_SERIES_CAS_MISMATCH',
      'activationSeriesId', v_series.id,
      'syncActivationId', v_series.current_sync_activation_id,
      'activationGeneration', v_series.current_activation_generation,
      'seriesRowVersion', v_series.series_row_version,
      'authorityEpoch', v_series.authority_epoch,
      'authorityBlocked', true
    );
    update public.broker_sync_activation_commands
    set command_status = 'rejected', result = v_result,
        applied_at = clock_timestamp()
    where id = v_command.id and command_status = 'pending';
    return v_result;
  end if;
  if v_series.series_policy_version is distinct from 'prospective_capture_v1' then
    raise exception 'ACTIVATION_APPLY_SERIES_POLICY_DRIFT';
  end if;

  if v_series.current_sync_activation_id is not null then
    select * into v_activation
    from public.broker_sync_activations
    where id = v_series.current_sync_activation_id
      and activation_series_id = v_series.id
      and activation_generation = v_series.current_activation_generation
      and user_id = v_series.user_id
      and broker_account_id = v_series.broker_account_id
      and connection_account_id = v_series.connection_account_id
    for update;
    if not found then
      raise exception 'ACTIVATION_APPLY_CURRENT_POINTER_DRIFT';
    end if;
    if v_command.command_kind = 'activate'
      and (
        v_command.expected_activation_row_version is null
        or v_activation.activation_row_version is distinct from
          v_command.expected_activation_row_version
      )
    then
      v_result := jsonb_build_object(
        'status', 'rejected',
        'errorCode', 'ACTIVATION_APPLY_ACTIVATION_CAS_MISMATCH',
        'activationSeriesId', v_series.id,
        'syncActivationId', v_activation.id,
        'activationGeneration', v_activation.activation_generation,
        'seriesRowVersion', v_series.series_row_version,
        'activationRowVersion', v_activation.activation_row_version,
        'authorityEpoch', v_series.authority_epoch,
        'authorityBlocked', true
      );
      update public.broker_sync_activation_commands
      set command_status = 'rejected', result = v_result,
          applied_at = clock_timestamp()
      where id = v_command.id and command_status = 'pending';
      return v_result;
    end if;
  elsif v_command.command_kind = 'activate'
    and v_command.expected_activation_row_version is not null
  then
    v_result := jsonb_build_object(
      'status', 'rejected',
      'errorCode', 'ACTIVATION_APPLY_ACTIVATION_CAS_MISMATCH',
      'activationSeriesId', v_series.id,
      'syncActivationId', null,
      'activationGeneration', null,
      'seriesRowVersion', v_series.series_row_version,
      'authorityEpoch', v_series.authority_epoch,
      'authorityBlocked', true
    );
    update public.broker_sync_activation_commands
    set command_status = 'rejected', result = v_result,
        applied_at = clock_timestamp()
    where id = v_command.id and command_status = 'pending';
    return v_result;
  end if;

  if v_command.command_kind <> 'activate' then
    if v_series.current_sync_activation_id is null then
      raise exception 'ACTIVATION_APPLY_CURRENT_NOT_FOUND';
    end if;
    if v_activation.activation_row_version is distinct from
      v_command.expected_activation_row_version
    then
      v_result := jsonb_build_object(
        'status', 'rejected',
        'errorCode', 'ACTIVATION_APPLY_ACTIVATION_CAS_MISMATCH',
        'activationSeriesId', v_series.id,
        'syncActivationId', v_activation.id,
        'activationGeneration', v_activation.activation_generation,
        'seriesRowVersion', v_series.series_row_version,
        'activationRowVersion', v_activation.activation_row_version,
        'authorityEpoch', v_series.authority_epoch,
        'authorityBlocked', true
      );
      update public.broker_sync_activation_commands
      set command_status = 'rejected', result = v_result,
          applied_at = clock_timestamp()
      where id = v_command.id and command_status = 'pending';
      return v_result;
    end if;
    -- A pre-authority activation has no closed lifecycle evidence. It may only
    -- be replaced through activate/supersession; same-row lifecycle mutation is
    -- fail-closed so mixed legacy state can never acquire current authority.
    if v_activation.authority_contract_version is distinct from
      'broker-capture-authority-v1'
    then
      raise exception 'ACTIVATION_APPLY_LEGACY_AUTHORITY_UNBOUND';
    end if;
  end if;

  if v_connection_account.id is null then
    select * into v_connection_account
    from public.broker_connection_accounts
    where id = v_series.connection_account_id
      and user_id = v_series.user_id
      and broker_account_id = v_series.broker_account_id
    for update;
    if not found then
      raise exception 'ACTIVATION_APPLY_CONNECTION_NOT_FOUND';
    end if;
  end if;

  -- Activate and resume revalidate every immutable pin from locked parents.
  -- Pause/revoke intentionally need no Credential or Provider access.
  if v_command.command_kind in ('activate', 'resume') then
    v_now := clock_timestamp();
    if v_connection_account.status <> 'active'
      or v_connection_account.valid_from > v_now
      or (v_connection_account.valid_to is not null
        and v_connection_account.valid_to <= v_now)
    then
      raise exception 'ACTIVATION_APPLY_CONNECTION_INACTIVE';
    end if;
    if v_command.created_at < v_now - interval '15 minutes' then
      raise exception 'ACTIVATION_APPLY_ATTESTATION_EXPIRED';
    end if;

    select * into v_connection
    from public.broker_connections
    where id = v_connection_account.connection_id
      and user_id = v_connection_account.user_id
      and provider = v_connection_account.provider_code
      and environment = v_connection_account.environment
    for update;
    if not found
      or v_connection.status <> 'ready'
      or v_connection.credential_reference is null
      or not v_connection.permissions @>
        array['read_only_user_attested']::text[]
      or not v_connection.permissions <@
        array['read_only_user_attested']::text[]
    then
      raise exception 'ACTIVATION_APPLY_CONNECTION_INACTIVE';
    end if;

    select credential_row.id, credential_row.key_version,
      length(credential_row.encrypted_payload) > 0 as has_encrypted_payload
    into v_credential
    from public.broker_credentials credential_row
    where credential_row.id = v_connection.credential_reference
      and credential_row.user_id = v_connection.user_id
      and credential_row.provider = v_connection.provider
    for update;
    if not found or not v_credential.has_encrypted_payload then
      raise exception 'ACTIVATION_APPLY_CREDENTIAL_INACTIVE';
    end if;

    select integrity_key_row.id, integrity_key_row.key_version,
      integrity_key_row.status, integrity_key_row.valid_from,
      integrity_key_row.valid_to
    into v_integrity_key
    from equora_private.broker_capture_integrity_keys integrity_key_row
    where integrity_key_row.user_id = v_command.user_id
      and integrity_key_row.broker_account_id = v_command.broker_account_id
      and integrity_key_row.status = 'active'
      and integrity_key_row.valid_from <= v_now
      and (integrity_key_row.valid_to is null
        or integrity_key_row.valid_to > v_now)
    order by integrity_key_row.valid_from desc, integrity_key_row.id
    limit 1
    for share;
    if not found then
      raise exception 'ACTIVATION_APPLY_INTEGRITY_KEY_INACTIVE';
    end if;

    select * into v_account
    from public.broker_accounts
    where id = v_command.broker_account_id
      and user_id = v_command.user_id
      and provider_code = v_connection_account.provider_code
      and environment = v_connection_account.environment
    for update;
    if not found
      or v_account.status <> 'active'
      or v_account.retention_status <> 'active'
      or v_account.capability_profile_id <> 'mexc_futures_rest'
    then
      raise exception 'ACTIVATION_APPLY_ACCOUNT_INACTIVE';
    end if;

    select * into v_provider
    from public.broker_providers
    where provider_code = v_connection_account.provider_code
    for share;
    if not found
      or v_provider.provider_code <> 'mexc'
      or v_provider.status <> 'verified'
      or v_provider.mutations_forbidden is distinct from true
      or v_provider.current_contract_version <> 'mexc_futures_contract_v1'
      or not (v_provider.current_contract_version = any(
        v_provider.allowed_contract_versions
      ))
      or (select count(*) from jsonb_object_keys(
        v_provider.readonly_capabilities
      )) <> 4
      or exists (
        select 1
        from jsonb_each(v_provider.readonly_capabilities) capability
        where capability.value ->> 'method' is distinct from 'GET'
      )
      or not v_provider.readonly_capabilities ?& array[
        'funding_records_v1', 'historical_executions_v3',
        'historical_orders_v1', 'historical_positions_v1'
      ]
    then
      raise exception 'ACTIVATION_APPLY_PROVIDER_BLOCKED';
    end if;

    select jsonb_object_agg(capability.key, 'v1' order by capability.key)
    into v_capability_versions
    from jsonb_each(v_provider.readonly_capabilities) capability;

    v_permission_evidence := jsonb_build_object(
      'mappingEvidence', 'official_docs_plus_support_statement_2026-08-05',
      'requiredCapabilities', jsonb_build_array(
        'funding_records_v1', 'historical_executions_v3',
        'historical_orders_v1', 'historical_positions_v1'
      ),
      'technicallyDetectedWritePermissions', '[]'::jsonb,
      'userAttestation', 'read_only_user_attested',
      'writePermissionIntrospection', 'unavailable'
    );

    if public.equora_mexc_permission_evidence_valid_v1(
      v_permission_evidence,
      'mexc_permission_evidence_v1',
      v_command.created_at,
      v_now,
      v_capability_versions
    ) is distinct from true then
      raise exception 'ACTIVATION_APPLY_PERMISSION_EVIDENCE_INVALID';
    end if;

    v_pins_match := v_series.current_sync_activation_id is not null
      and v_activation.connection_account_id = v_connection_account.id
      and v_activation.broker_account_id = v_account.id
      and v_activation.provider_code = v_provider.provider_code
      and v_activation.environment = v_connection_account.environment
      and v_activation.active_credential_id = v_credential.id
      and v_activation.active_credential_key_version = v_credential.key_version
      and v_activation.capture_integrity_key_id = v_integrity_key.id
      and v_activation.capture_integrity_key_version = v_integrity_key.key_version
      and v_activation.onboarding_profile_id = 'recent_28d_plus_current_utc_day_v1'
      and v_activation.scheduler_policy_version = 'scheduler_v1'
      and v_activation.audit_policy_version = 'audit_v1'
      and v_activation.provider_contract_version = v_provider.current_contract_version
      and v_activation.adapter_version = 'v57_61_0'
      and v_activation.profile_id = v_account.capability_profile_id
      and v_activation.profile_version = 'v1'
      and v_activation.capability_versions = v_capability_versions
      and v_activation.permission_evidence = v_permission_evidence
      and v_activation.permission_evidence_version = 'mexc_permission_evidence_v1'
      and v_activation.authority_contract_version = 'broker-capture-authority-v1';
  end if;

  if v_command.command_kind = 'activate' then
    if v_series.current_sync_activation_id is not null
      and v_activation.activation_state = 'paused'
      and v_pins_match
    then
      raise exception 'ACTIVATION_APPLY_RESUME_REQUIRED';
    end if;

    if v_series.current_sync_activation_id is not null
      and v_activation.activation_state = 'active'
      and v_pins_match
    then
      v_new_activation_id := v_activation.id;
      v_new_generation := v_activation.activation_generation;
      v_result := jsonb_build_object(
        'status', 'already_current',
        'activationSeriesId', v_series.id,
        'syncActivationId', v_activation.id,
        'activationGeneration', v_activation.activation_generation,
        'seriesRowVersion', v_series.series_row_version,
        'activationRowVersion', v_activation.activation_row_version,
        'authorityEpoch', v_series.authority_epoch,
        'authorityBlocked', true
      );
    else
      v_new_activation_id := gen_random_uuid();
      v_new_generation := coalesce(v_series.current_activation_generation, 0) + 1;
      v_now := clock_timestamp();

      if v_series.current_sync_activation_id is not null then
        update public.broker_sync_activations
        set activation_state = case
              when activation_state = 'revoked' then 'revoked'
              else 'inactive'
            end,
            capture_health = case
              when activation_state = 'revoked' then 'revoked'
              else 'pending'
            end,
            lifecycle_reason_code = case
              when authority_contract_version is null then null
              when activation_state = 'revoked' then lifecycle_reason_code
              else 'superseded'
            end,
            last_transition_at = case
              when authority_contract_version is null then null
              else v_now
            end,
            lifecycle_updated_at = v_now,
            activation_row_version = activation_row_version + 1
        where id = v_activation.id;
      end if;

      insert into public.broker_sync_activations (
        id, activation_series_id, activation_generation, user_id,
        connection_account_id, broker_account_id, provider_code, environment,
        active_credential_id, active_credential_key_version,
        capture_integrity_key_id, capture_integrity_key_version,
        activation_cutover_at, activated_by, onboarding_profile_id,
        scheduler_policy_version, scheduler_target_seconds,
        fast_lane_overlap_seconds, audit_policy_version, activation_state,
        capture_health, provider_contract_version, adapter_version, profile_id,
        profile_version, capability_versions, permission_evidence,
        permission_evidence_version, user_read_only_attested_at,
        activation_row_version, authority_contract_version,
        lifecycle_reason_code, last_transition_at, lifecycle_updated_at
      ) values (
        v_new_activation_id, v_series.id, v_new_generation, v_command.user_id,
        v_connection_account.id, v_account.id, v_provider.provider_code,
        v_connection_account.environment, v_credential.id,
        v_credential.key_version, v_integrity_key.id, v_integrity_key.key_version,
        v_now, 'owner_activation_command_v1',
        'recent_28d_plus_current_utc_day_v1', 'scheduler_v1', 21600, 259200,
        'audit_v1', 'active', 'pending', v_provider.current_contract_version,
        'v57_61_0', v_account.capability_profile_id, 'v1',
        v_capability_versions, v_permission_evidence,
        'mexc_permission_evidence_v1', v_command.created_at, 0,
        'broker-capture-authority-v1',
        case when v_series.current_sync_activation_id is null
          then 'activated' else 'superseded_activation' end,
        v_now, v_now
      );

      -- The validated activation plan begins with the four provider-level
      -- read-only capabilities. Symbol discoveries may add narrower
      -- Requirements later, but a new generation must never exist with a
      -- partially created foundation. Each plan Requirement therefore gets
      -- exactly the three disjoint API lanes in this same transaction.
      with inserted_requirements as (
        insert into public.broker_sync_lane_requirements (
          id, user_id, broker_account_id, sync_activation_id,
          activation_generation, provider_code, provider_contract_version,
          adapter_version, capability_id, capability_version,
          instrument_scope_key, profile_id, profile_version,
          policy_generation, requirement_source, created_at, updated_at
        )
        select
          gen_random_uuid(), v_command.user_id, v_account.id,
          v_new_activation_id, v_new_generation, v_provider.provider_code,
          v_provider.current_contract_version, 'v57_61_0', capability.key,
          capability.value #>> '{}', 'mexc_futures_account_v1:all',
          v_account.capability_profile_id, 'v1', 1, 'activation_plan',
          v_now, v_now
        from jsonb_each(v_capability_versions) capability
        returning id, user_id, broker_account_id, sync_activation_id,
          activation_generation, provider_code, provider_contract_version,
          adapter_version, capability_id, capability_version,
          instrument_scope_key, profile_id, profile_version,
          policy_generation
      )
      insert into public.broker_sync_lane_states (
        id, user_id, broker_account_id, sync_activation_id,
        activation_generation, lane_requirement_id, provider_code,
        provider_contract_version, adapter_version, capability_id,
        capability_version, instrument_scope_key, lane_id, profile_id,
        profile_version, policy_generation, observation_status,
        next_due_at, due_generation, created_at, updated_at
      )
      select
        gen_random_uuid(), requirement.user_id, requirement.broker_account_id,
        requirement.sync_activation_id, requirement.activation_generation,
        requirement.id, requirement.provider_code,
        requirement.provider_contract_version, requirement.adapter_version,
        requirement.capability_id, requirement.capability_version,
        requirement.instrument_scope_key, lane.lane_id,
        requirement.profile_id, requirement.profile_version,
        requirement.policy_generation, 'not_observed', v_now, 1, v_now, v_now
      from inserted_requirements requirement
      cross join unnest(array[
        'incremental_fast_6h', 'rolling_audit_7d_daily',
        'rolling_audit_28d_weekly'
      ]::text[]) lane(lane_id);

      update public.broker_sync_activation_series
      set current_sync_activation_id = v_new_activation_id,
          current_activation_generation = v_new_generation,
          series_row_version = series_row_version + 1,
          authority_epoch = authority_epoch + 1,
          updated_at = v_now
      where id = v_series.id
        and series_row_version = v_command.expected_series_row_version
      returning * into v_series;
      if not found then
        raise exception 'ACTIVATION_APPLY_SERIES_CAS_MISMATCH';
      end if;
      v_mutated := true;

      v_result := jsonb_build_object(
        'status', case when v_new_generation = 1
          then 'activated' else 'superseded' end,
        'activationSeriesId', v_series.id,
        'syncActivationId', v_new_activation_id,
        'activationGeneration', v_new_generation,
        'seriesRowVersion', v_series.series_row_version,
        'activationRowVersion', 0,
        'authorityEpoch', v_series.authority_epoch,
        'authorityBlocked', true
      );
    end if;
  elsif v_command.command_kind = 'pause' then
    if v_activation.activation_state = 'paused' then
      null;
    elsif v_activation.activation_state <> 'active' then
      raise exception 'ACTIVATION_APPLY_ILLEGAL_TRANSITION';
    else
      v_now := clock_timestamp();
      update public.broker_sync_activations
      set activation_state = 'paused', capture_health = 'paused',
          lifecycle_reason_code = 'user_paused', last_transition_at = v_now,
          lifecycle_updated_at = v_now,
          activation_row_version = activation_row_version + 1
      where id = v_activation.id
        and activation_row_version = v_command.expected_activation_row_version
      returning * into v_activation;
      if not found then
        raise exception 'ACTIVATION_APPLY_ACTIVATION_CAS_MISMATCH';
      end if;
      v_mutated := true;
    end if;
  elsif v_command.command_kind = 'resume' then
    if v_activation.activation_state <> 'paused' or not v_pins_match then
      raise exception 'ACTIVATION_APPLY_ILLEGAL_RESUME';
    end if;
    v_now := clock_timestamp();
    update public.broker_sync_activations
    set activation_state = 'active', lifecycle_reason_code = 'user_resumed',
        last_transition_at = v_now, lifecycle_updated_at = v_now,
        activation_row_version = activation_row_version + 1
    where id = v_activation.id
      and activation_row_version = v_command.expected_activation_row_version
    returning * into v_activation;
    if not found then
      raise exception 'ACTIVATION_APPLY_ACTIVATION_CAS_MISMATCH';
    end if;
    v_health := public.equora_derive_capture_health_at_v1(v_activation.id, v_now);
    update public.broker_sync_activations
    set capture_health = v_health ->> 'health'
    where id = v_activation.id
    returning * into v_activation;
    v_mutated := true;
  elsif v_command.command_kind = 'revoke' then
    if v_activation.activation_state <> 'revoked' then
      v_now := clock_timestamp();
      update public.broker_sync_activations
      set activation_state = 'revoked', capture_health = 'revoked',
          lifecycle_reason_code = 'user_revoked', last_transition_at = v_now,
          lifecycle_updated_at = v_now,
          activation_row_version = activation_row_version + 1
      where id = v_activation.id
        and activation_row_version = v_command.expected_activation_row_version
      returning * into v_activation;
      if not found then
        raise exception 'ACTIVATION_APPLY_ACTIVATION_CAS_MISMATCH';
      end if;
      v_mutated := true;
    end if;
  end if;

  if v_command.command_kind in ('pause', 'resume', 'revoke') then
    if v_mutated then
      update public.broker_sync_activation_series
      set series_row_version = series_row_version + 1,
          authority_epoch = authority_epoch + 1,
          updated_at = clock_timestamp()
      where id = v_series.id
        and series_row_version = v_command.expected_series_row_version
      returning * into v_series;
      if not found then
        raise exception 'ACTIVATION_APPLY_SERIES_CAS_MISMATCH';
      end if;
    end if;
    v_result := jsonb_build_object(
      'status', case
        when v_command.command_kind = 'pause' then 'paused'
        when v_command.command_kind = 'resume' then 'resumed'
        else 'revoked'
      end,
      'activationSeriesId', v_series.id,
      'syncActivationId', v_activation.id,
      'activationGeneration', v_activation.activation_generation,
      'seriesRowVersion', v_series.series_row_version,
      'activationRowVersion', v_activation.activation_row_version,
      'authorityEpoch', v_series.authority_epoch,
      'authorityBlocked', true
    );
  end if;

  v_now := clock_timestamp();
  update public.broker_sync_activation_commands
  set command_status = 'applied', result = v_result, applied_at = v_now
  where id = v_command.id and command_status = 'pending'
  returning * into v_command;
  if not found then
    raise exception 'ACTIVATION_APPLY_COMMAND_CAS_MISMATCH';
  end if;

  return v_result;
exception
  when lock_not_available then raise exception 'ACTIVATION_APPLY_LOCK_TIMEOUT';
  when query_canceled then raise exception 'ACTIVATION_APPLY_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_apply_broker_sync_activation_command_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.equora_apply_broker_sync_activation_command_v1(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Immutable mutation receipts. Exact replay returns the stored result; reuse of
-- a request ID with a different canonical payload is always rejected.
-- ---------------------------------------------------------------------------

alter table public.broker_sync_gaps
  add column if not exists row_version bigint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_sync_gaps'::regclass
      and conname = 'broker_sync_gaps_row_version_check'
  ) then
    alter table public.broker_sync_gaps
      add constraint broker_sync_gaps_row_version_check
      check (row_version >= 0);
  end if;
end;
$$;

create unique index if not exists broker_sync_gaps_open_identity_unique
  on public.broker_sync_gaps (
    user_id, broker_account_id, sync_activation_id, activation_generation,
    capability_id, instrument_scope_key, lane_id,
    coalesce(gap_from_ms, '-1'::bigint),
    coalesce(gap_to_ms, '-1'::bigint),
    left_boundary_unknown, right_boundary_unknown, cause
  ) where status <> 'reconciled';

create table if not exists public.broker_sync_authority_mutation_receipts (
  request_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  mutation_kind text not null,
  request_digest text not null,
  result jsonb not null,
  applied_at timestamptz not null default now(),
  constraint broker_sync_authority_receipts_activation_fkey
    foreign key (
      sync_activation_id, user_id, broker_account_id, activation_generation
    ) references public.broker_sync_activations (
      id, user_id, broker_account_id, activation_generation
    ) on delete restrict,
  constraint broker_sync_authority_receipts_kind_check check (
    mutation_kind in (
      'upsert_requirement', 'record_lane_success', 'record_lane_failure',
      'open_gap', 'escalate_gap', 'reconcile_gap'
    )
  ),
  constraint broker_sync_authority_receipts_digest_check
    check (request_digest ~ '^[a-f0-9]{64}$'),
  constraint broker_sync_authority_receipts_result_check
    check (jsonb_typeof(result) = 'object'),
  constraint broker_sync_authority_receipts_generation_check
    check (activation_generation > 0)
);

alter table public.broker_sync_authority_mutation_receipts enable row level security;
drop policy if exists "users can read own broker_sync_authority_mutation_receipts"
  on public.broker_sync_authority_mutation_receipts;
create policy "users can read own broker_sync_authority_mutation_receipts"
  on public.broker_sync_authority_mutation_receipts for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.broker_sync_authority_mutation_receipts
  from public, anon, authenticated, service_role;

create index if not exists idx_broker_sync_authority_receipts_activation_fkey
  on public.broker_sync_authority_mutation_receipts (
    sync_activation_id, user_id, broker_account_id, activation_generation
  );

create or replace function public.equora_authority_mutation_digest_v1(
  p_mutation_kind text,
  p_payload jsonb
) returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(public.equora_pgcrypto_digest_v1(
    convert_to(
      jsonb_build_object(
        'contractVersion', 'broker-authority-mutation-v1',
        'mutationKind', p_mutation_kind,
        'payload', p_payload
      )::text,
      'UTF8'
    ),
    'sha256'
  ), 'hex')
$$;

revoke all on function public.equora_authority_mutation_digest_v1(text, jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Requirement/policy mutation. New discovery creates exactly three fresh,
-- not-observed lane revisions. A policy change supersedes the old Requirement
-- and all three lanes atomically; old Gaps remain untouched and effective.
-- ---------------------------------------------------------------------------

create or replace function public.equora_upsert_broker_sync_lane_requirement_v1(
  p_sync_activation_id uuid,
  p_expected_series_row_version bigint,
  p_expected_activation_row_version bigint,
  p_capability_id text,
  p_instrument_scope_key text,
  p_requirement_source text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_current_requirement public.broker_sync_lane_requirements%rowtype;
  v_receipt public.broker_sync_authority_mutation_receipts%rowtype;
  v_requirement_id uuid := gen_random_uuid();
  v_policy_generation bigint;
  v_digest text;
  v_result jsonb;
  v_health jsonb;
  v_lane_ids jsonb;
begin
  if p_sync_activation_id is null
    or p_request_id is null
    or p_expected_series_row_version is null
    or p_expected_series_row_version < 0
    or p_expected_activation_row_version is null
    or p_expected_activation_row_version < 0
    or p_capability_id is null
    or p_capability_id !~ '^[a-z][a-z0-9_]{0,126}$'
    or p_instrument_scope_key is null
    or octet_length(p_instrument_scope_key) not between 1 and 512
    or p_requirement_source not in (
      'activation_plan', 'instrument_discovery', 'explicit_account_scope'
    )
  then
    raise exception 'AUTHORITY_REQUIREMENT_INVALID_INPUT';
  end if;

  v_digest := public.equora_authority_mutation_digest_v1(
    'upsert_requirement',
    jsonb_build_object(
      'requestId', p_request_id::text,
      'syncActivationId', p_sync_activation_id::text,
      'expectedSeriesRowVersion', p_expected_series_row_version,
      'expectedActivationRowVersion', p_expected_activation_row_version,
      'capabilityId', p_capability_id,
      'instrumentScopeKey', p_instrument_scope_key,
      'requirementSource', p_requirement_source
    )
  );

  -- A completed receipt is the immutable authority for an exact replay. It is
  -- intentionally checked before Current locks so later supersession cannot
  -- turn the same request into a different outcome.
  select * into v_receipt
  from public.broker_sync_authority_mutation_receipts
  where request_id = p_request_id;
  if found then
    if v_receipt.mutation_kind <> 'upsert_requirement'
      or v_receipt.request_digest is distinct from v_digest
    then raise exception 'AUTHORITY_MUTATION_REPLAY_MISMATCH'; end if;
    return v_receipt.result;
  end if;

  select series_row.* into v_series
  from public.broker_sync_activation_series series_row
  join public.broker_sync_activations activation_row
    on activation_row.activation_series_id = series_row.id
   and activation_row.user_id = series_row.user_id
   and activation_row.broker_account_id = series_row.broker_account_id
   and activation_row.connection_account_id = series_row.connection_account_id
  where activation_row.id = p_sync_activation_id
  for update of series_row;
  if not found then
    raise exception 'AUTHORITY_ACTIVATION_NOT_CURRENT';
  end if;

  select * into v_activation
  from public.broker_sync_activations
  where id = p_sync_activation_id
    and activation_series_id = v_series.id
    and user_id = v_series.user_id
    and broker_account_id = v_series.broker_account_id
    and connection_account_id = v_series.connection_account_id
  for update;
  if not found
    or v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
    or v_activation.activation_state <> 'active'
    or v_activation.authority_contract_version is distinct from
      'broker-capture-authority-v1'
  then
    raise exception 'AUTHORITY_ACTIVATION_NOT_CURRENT';
  end if;

  if v_series.series_row_version <> p_expected_series_row_version then
    raise exception 'AUTHORITY_SERIES_CAS_MISMATCH';
  end if;
  if v_activation.activation_row_version <> p_expected_activation_row_version then
    raise exception 'AUTHORITY_ACTIVATION_CAS_MISMATCH';
  end if;
  if not (v_activation.capability_versions ? p_capability_id) then
    raise exception 'AUTHORITY_CAPABILITY_NOT_PINNED';
  end if;

  select * into v_current_requirement
  from public.broker_sync_lane_requirements
  where user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and sync_activation_id = v_activation.id
    and activation_generation = v_activation.activation_generation
    and capability_id = p_capability_id
    and instrument_scope_key = p_instrument_scope_key
    and profile_id = v_activation.profile_id
    and profile_version = v_activation.profile_version
    and superseded_at is null
  for update;

  v_policy_generation := coalesce(v_current_requirement.policy_generation, 0) + 1;
  v_now := clock_timestamp();

  if v_current_requirement.id is not null then
    perform 1
    from public.broker_sync_lane_states
    where lane_requirement_id = v_current_requirement.id
      and user_id = v_current_requirement.user_id
      and broker_account_id = v_current_requirement.broker_account_id
      and sync_activation_id = v_current_requirement.sync_activation_id
      and activation_generation = v_current_requirement.activation_generation
      and superseded_at is null
    order by id
    for update;

    if (select count(*) from public.broker_sync_lane_states
        where lane_requirement_id = v_current_requirement.id
          and superseded_at is null) <> 3
    then
      raise exception 'AUTHORITY_REQUIREMENT_LANE_MATRIX_DRIFT';
    end if;

    update public.broker_sync_lane_states
    set superseded_at = v_now, updated_at = v_now, row_version = row_version + 1
    where lane_requirement_id = v_current_requirement.id
      and user_id = v_current_requirement.user_id
      and broker_account_id = v_current_requirement.broker_account_id
      and sync_activation_id = v_current_requirement.sync_activation_id
      and activation_generation = v_current_requirement.activation_generation
      and superseded_at is null;

    update public.broker_sync_lane_requirements
    set superseded_at = v_now, updated_at = v_now, row_version = row_version + 1
    where id = v_current_requirement.id
      and row_version = v_current_requirement.row_version;
    if not found then
      raise exception 'AUTHORITY_REQUIREMENT_CAS_MISMATCH';
    end if;
  end if;

  insert into public.broker_sync_lane_requirements (
    id, user_id, broker_account_id, sync_activation_id, activation_generation,
    provider_code, provider_contract_version, adapter_version, capability_id,
    capability_version, instrument_scope_key, profile_id, profile_version,
    policy_generation, requirement_source, created_at, updated_at
  ) values (
    v_requirement_id, v_activation.user_id, v_activation.broker_account_id,
    v_activation.id, v_activation.activation_generation,
    v_activation.provider_code, v_activation.provider_contract_version,
    v_activation.adapter_version, p_capability_id,
    v_activation.capability_versions ->> p_capability_id,
    p_instrument_scope_key, v_activation.profile_id, v_activation.profile_version,
    v_policy_generation, p_requirement_source, v_now, v_now
  );

  with inserted as (
    insert into public.broker_sync_lane_states (
      id, user_id, broker_account_id, sync_activation_id,
      activation_generation, lane_requirement_id, provider_code,
      provider_contract_version, adapter_version, capability_id,
      capability_version, instrument_scope_key, lane_id, profile_id,
      profile_version, policy_generation, observation_status, next_due_at,
      due_generation, created_at, updated_at
    )
    select gen_random_uuid(), v_activation.user_id, v_activation.broker_account_id,
      v_activation.id, v_activation.activation_generation, v_requirement_id,
      v_activation.provider_code, v_activation.provider_contract_version,
      v_activation.adapter_version, p_capability_id,
      v_activation.capability_versions ->> p_capability_id,
      p_instrument_scope_key, lane_id, v_activation.profile_id,
      v_activation.profile_version, v_policy_generation, 'not_observed',
      v_now, 1, v_now, v_now
    from unnest(array[
      'incremental_fast_6h', 'rolling_audit_7d_daily',
      'rolling_audit_28d_weekly'
    ]::text[]) lane_id
    returning id, lane_id
  )
  select jsonb_object_agg(lane_id, id order by lane_id)
  into v_lane_ids from inserted;

  update public.broker_sync_activations
  set activation_row_version = activation_row_version + 1,
      lifecycle_updated_at = v_now
  where id = v_activation.id
    and activation_row_version = p_expected_activation_row_version
  returning * into v_activation;
  if not found then
    raise exception 'AUTHORITY_ACTIVATION_CAS_MISMATCH';
  end if;

  update public.broker_sync_activation_series
  set series_row_version = series_row_version + 1,
      authority_epoch = authority_epoch + 1,
      updated_at = v_now
  where id = v_series.id
    and series_row_version = p_expected_series_row_version
  returning * into v_series;
  if not found then
    raise exception 'AUTHORITY_SERIES_CAS_MISMATCH';
  end if;

  v_health := public.equora_derive_capture_health_at_v1(v_activation.id, v_now);
  update public.broker_sync_activations
  set capture_health = v_health ->> 'health'
  where id = v_activation.id;

  v_result := jsonb_build_object(
    'status', case when v_policy_generation = 1
      then 'requirement_created' else 'requirement_superseded' end,
    'syncActivationId', v_activation.id,
    'activationGeneration', v_activation.activation_generation,
    'requirementId', v_requirement_id,
    'policyGeneration', v_policy_generation,
    'laneStateIds', v_lane_ids,
    'seriesRowVersion', v_series.series_row_version,
    'activationRowVersion', v_activation.activation_row_version,
    'authorityEpoch', v_series.authority_epoch,
    'captureHealth', v_health ->> 'health',
    'authorityBlocked', true
  );

  insert into public.broker_sync_authority_mutation_receipts (
    request_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, mutation_kind, request_digest, result, applied_at
  ) values (
    p_request_id, v_activation.user_id, v_activation.broker_account_id,
    v_activation.id, v_activation.activation_generation,
    'upsert_requirement', v_digest, v_result, v_now
  );

  return v_result;
exception
  when unique_violation then raise exception 'AUTHORITY_MUTATION_REPLAY_RACE';
  when lock_not_available then raise exception 'AUTHORITY_MUTATION_LOCK_TIMEOUT';
  when query_canceled then raise exception 'AUTHORITY_MUTATION_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_upsert_broker_sync_lane_requirement_v1(
  uuid, bigint, bigint, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.equora_upsert_broker_sync_lane_requirement_v1(
  uuid, bigint, bigint, text, text, text, uuid
) to service_role;

create or replace function public.equora_capture_authority_digest_v1(
  p_sync_activation_id uuid,
  p_activation_generation integer,
  p_broker_account_id uuid,
  p_lane_requirement_id uuid,
  p_lane_state_id uuid,
  p_policy_generation bigint,
  p_capability_id text,
  p_instrument_scope_key text,
  p_lane_id text,
  p_profile_id text,
  p_profile_version text,
  p_scope_digest text
) returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(public.equora_pgcrypto_digest_v1(
    convert_to(
      jsonb_build_object(
        'contractVersion', 'broker-capture-authority-v1',
        'syncActivationId', p_sync_activation_id::text,
        'activationGeneration', p_activation_generation,
        'brokerAccountId', p_broker_account_id::text,
        'laneRequirementId', p_lane_requirement_id::text,
        'laneStateId', p_lane_state_id::text,
        'policyGeneration', p_policy_generation,
        'capabilityId', p_capability_id,
        'instrumentScopeKey', p_instrument_scope_key,
        'laneId', p_lane_id,
        'profileId', p_profile_id,
        'profileVersion', p_profile_version,
        'scopeDigest', p_scope_digest
      )::text,
      'UTF8'
    ),
    'sha256'
  ), 'hex')
$$;

revoke all on function public.equora_capture_authority_digest_v1(
  uuid, integer, uuid, uuid, uuid, bigint, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Successful Lane transition and monotone MEXC Watermark. The total order is
-- provider-time followed by a decimal provider ID; naive text ordering is not
-- used. next_due_at and every digest are calculated server-side.
-- ---------------------------------------------------------------------------

create or replace function public.equora_record_broker_sync_lane_success_v1(
  p_lane_state_id uuid,
  p_complete_scope_id uuid,
  p_expected_series_row_version bigint,
  p_expected_activation_row_version bigint,
  p_expected_lane_row_version bigint,
  p_high_watermark_time_ms bigint,
  p_high_watermark_tie_breaker text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_lane_pre public.broker_sync_lane_states%rowtype;
  v_lane public.broker_sync_lane_states%rowtype;
  v_requirement public.broker_sync_lane_requirements%rowtype;
  v_scope public.broker_sync_scopes%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_receipt public.broker_sync_authority_mutation_receipts%rowtype;
  v_digest text;
  v_authority_digest text;
  v_watermark_digest text;
  v_result jsonb;
  v_health jsonb;
  v_next_due_at timestamptz;
  v_noop boolean := false;
  v_bucket_set_valid boolean := false;
begin
  if p_lane_state_id is null
    or p_complete_scope_id is null
    or p_request_id is null
    or p_expected_series_row_version is null
    or p_expected_series_row_version < 0
    or p_expected_activation_row_version is null
    or p_expected_activation_row_version < 0
    or p_expected_lane_row_version is null
    or p_expected_lane_row_version < 0
    or p_high_watermark_time_ms is null
    or p_high_watermark_time_ms < 0
    or p_high_watermark_tie_breaker is null
    or p_high_watermark_tie_breaker !~ '^(0|[1-9][0-9]{0,127})$'
  then
    raise exception 'AUTHORITY_LANE_SUCCESS_INVALID_INPUT';
  end if;

  select * into v_lane_pre
  from public.broker_sync_lane_states
  where id = p_lane_state_id;
  if not found then
    raise exception 'AUTHORITY_LANE_NOT_FOUND';
  end if;

  v_digest := public.equora_authority_mutation_digest_v1(
    'record_lane_success',
    jsonb_build_object(
      'requestId', p_request_id::text,
      'laneStateId', p_lane_state_id::text,
      'completeScopeId', p_complete_scope_id::text,
      'expectedSeriesRowVersion', p_expected_series_row_version,
      'expectedActivationRowVersion', p_expected_activation_row_version,
      'expectedLaneRowVersion', p_expected_lane_row_version,
      'highWatermarkTimeMs', p_high_watermark_time_ms,
      'highWatermarkTieBreaker', p_high_watermark_tie_breaker
    )
  );

  select * into v_receipt
  from public.broker_sync_authority_mutation_receipts
  where request_id = p_request_id;
  if found then
    if v_receipt.mutation_kind <> 'record_lane_success'
      or v_receipt.request_digest is distinct from v_digest
    then raise exception 'AUTHORITY_MUTATION_REPLAY_MISMATCH'; end if;
    return v_receipt.result;
  end if;

  select series_row.* into v_series
  from public.broker_sync_activation_series series_row
  join public.broker_sync_activations activation_row
    on activation_row.activation_series_id = series_row.id
   and activation_row.user_id = series_row.user_id
   and activation_row.broker_account_id = series_row.broker_account_id
   and activation_row.connection_account_id = series_row.connection_account_id
  where activation_row.id = v_lane_pre.sync_activation_id
  for update of series_row;
  if not found then raise exception 'AUTHORITY_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_activation
  from public.broker_sync_activations
  where id = v_lane_pre.sync_activation_id
    and user_id = v_lane_pre.user_id
    and broker_account_id = v_lane_pre.broker_account_id
    and activation_generation = v_lane_pre.activation_generation
  for update;
  if not found
    or v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
    or v_activation.activation_state <> 'active'
    or v_activation.authority_contract_version is distinct from
      'broker-capture-authority-v1'
  then raise exception 'AUTHORITY_ACTIVATION_NOT_CURRENT'; end if;

  -- Scope precedes Requirement/Lane in the global worker lock order.
  select * into v_scope
  from public.broker_sync_scopes
  where id = p_complete_scope_id
    and user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and sync_activation_id = v_activation.id
    and activation_generation = v_activation.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_SCOPE_INVALID'; end if;

  select * into v_requirement
  from public.broker_sync_lane_requirements
  where id = v_lane_pre.lane_requirement_id
    and user_id = v_lane_pre.user_id
    and broker_account_id = v_lane_pre.broker_account_id
    and sync_activation_id = v_lane_pre.sync_activation_id
    and activation_generation = v_lane_pre.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_REQUIREMENT_NOT_FOUND'; end if;

  select * into v_lane
  from public.broker_sync_lane_states
  where id = v_lane_pre.id
    and lane_requirement_id = v_requirement.id
    and user_id = v_requirement.user_id
    and broker_account_id = v_requirement.broker_account_id
    and sync_activation_id = v_requirement.sync_activation_id
    and activation_generation = v_requirement.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_LANE_NOT_FOUND'; end if;

  if v_series.series_row_version <> p_expected_series_row_version then
    raise exception 'AUTHORITY_SERIES_CAS_MISMATCH';
  end if;
  if v_activation.activation_row_version <> p_expected_activation_row_version then
    raise exception 'AUTHORITY_ACTIVATION_CAS_MISMATCH';
  end if;
  if v_lane.row_version <> p_expected_lane_row_version then
    raise exception 'AUTHORITY_LANE_CAS_MISMATCH';
  end if;
  if v_requirement.superseded_at is not null
    or v_lane.superseded_at is not null
    or v_lane.policy_generation <> v_requirement.policy_generation
    or v_scope.lane_requirement_id <> v_requirement.id
    or v_scope.lane_state_id <> v_lane.id
    or v_scope.policy_generation <> v_lane.policy_generation
    or v_scope.capability_id <> v_lane.capability_id
    or v_scope.instrument_scope_key <> v_lane.instrument_scope_key
    or v_scope.lane_id <> v_lane.lane_id
    or v_scope.profile_id <> v_lane.profile_id
    or v_scope.profile_version <> v_lane.profile_version
    or v_scope.authority_contract_version <> 'broker-capture-authority-v1'
    or v_scope.scope_completeness <> 'complete_for_profile'
    or v_scope.stability_status not in ('observed_once', 'observed_stable')
    or v_scope.closed_at is null
    or v_scope.closed_at > v_now
    or not (
      (v_scope.source_channel = 'provider_api_observation'
        and v_scope.coverage_basis = 'provider_observed')
      or
      (v_scope.source_channel = 'provider_export_file'
        and v_scope.coverage_basis = 'provider_export_observed')
    )
  then
    raise exception 'AUTHORITY_SCOPE_INVALID';
  end if;

  if to_regclass('public.broker_sync_scope_buckets') is not null then
    if to_regprocedure('public.equora_scope_bucket_set_valid_v1(uuid)') is null
    then raise exception 'AUTHORITY_SCOPE_BUCKET_CONTRACT_MISSING'; end if;
    execute 'select public.equora_scope_bucket_set_valid_v1($1)'
      into v_bucket_set_valid using v_scope.id;
    if v_bucket_set_valid is distinct from true then
      raise exception 'AUTHORITY_SCOPE_BUCKET_SET_INVALID';
    end if;
  end if;

  v_authority_digest := public.equora_capture_authority_digest_v1(
    v_activation.id, v_activation.activation_generation,
    v_activation.broker_account_id, v_requirement.id, v_lane.id,
    v_lane.policy_generation, v_lane.capability_id,
    v_lane.instrument_scope_key, v_lane.lane_id, v_lane.profile_id,
    v_lane.profile_version, v_scope.scope_digest
  );
  if v_scope.authority_digest is distinct from v_authority_digest then
    raise exception 'AUTHORITY_SCOPE_DIGEST_INVALID';
  end if;
  if p_high_watermark_time_ms < v_scope.request_start_ms
    or p_high_watermark_time_ms > v_scope.request_end_ms
  then
    raise exception 'AUTHORITY_WATERMARK_OUTSIDE_SCOPE';
  end if;

  if v_lane.high_watermark_time_ms is not null then
    if p_high_watermark_time_ms < v_lane.high_watermark_time_ms
      or (p_high_watermark_time_ms = v_lane.high_watermark_time_ms
        and p_high_watermark_tie_breaker::numeric <
          v_lane.high_watermark_tie_breaker::numeric)
    then raise exception 'AUTHORITY_WATERMARK_REGRESSION'; end if;

    if p_high_watermark_time_ms = v_lane.high_watermark_time_ms
      and p_high_watermark_tie_breaker::numeric =
        v_lane.high_watermark_tie_breaker::numeric
    then
      if v_lane.last_complete_scope_id is distinct from v_scope.id
        or v_lane.last_complete_scope_digest is distinct from v_scope.scope_digest
      then raise exception 'AUTHORITY_WATERMARK_EVIDENCE_DRIFT'; end if;
      v_noop := true;
    end if;
  end if;

  if not v_noop then
    v_now := clock_timestamp();
    v_next_due_at := v_now + case v_lane.lane_id
      when 'incremental_fast_6h' then interval '6 hours'
      when 'rolling_audit_7d_daily' then interval '1 day'
      when 'rolling_audit_28d_weekly' then interval '7 days'
      else interval '0 seconds'
    end;
    v_watermark_digest := public.equora_lane_watermark_digest_v1(
      v_lane.sync_activation_id, v_lane.activation_generation,
      v_lane.broker_account_id, v_lane.capability_id,
      v_lane.instrument_scope_key, v_lane.lane_id, v_lane.profile_id,
      v_lane.profile_version, v_lane.policy_generation, v_scope.scope_digest,
      p_high_watermark_time_ms, p_high_watermark_tie_breaker,
      'broker-lane-watermark-v1'
    );

    update public.broker_sync_lane_states
    set observation_status = 'observed', health = 'healthy',
        last_complete_at = v_now, next_due_at = v_next_due_at,
        due_generation = due_generation + 1,
        last_complete_scope_id = v_scope.id,
        last_complete_scope_digest = v_scope.scope_digest,
        high_watermark_time_ms = p_high_watermark_time_ms,
        high_watermark_tie_breaker = p_high_watermark_tie_breaker,
        watermark_contract_version = 'broker-lane-watermark-v1',
        watermark_digest = v_watermark_digest,
        last_error_code = null, last_error_at = null,
        row_version = row_version + 1, updated_at = v_now
    where id = v_lane.id and row_version = p_expected_lane_row_version
    returning * into v_lane;
    if not found then raise exception 'AUTHORITY_LANE_CAS_MISMATCH'; end if;

    update public.broker_sync_activations
    set activation_row_version = activation_row_version + 1,
        lifecycle_updated_at = v_now
    where id = v_activation.id
      and activation_row_version = p_expected_activation_row_version
    returning * into v_activation;
    if not found then raise exception 'AUTHORITY_ACTIVATION_CAS_MISMATCH'; end if;

    update public.broker_sync_activation_series
    set series_row_version = series_row_version + 1,
        authority_epoch = authority_epoch + 1, updated_at = v_now
    where id = v_series.id
      and series_row_version = p_expected_series_row_version
    returning * into v_series;
    if not found then raise exception 'AUTHORITY_SERIES_CAS_MISMATCH'; end if;
  end if;

  v_health := public.equora_derive_capture_health_at_v1(v_activation.id, clock_timestamp());
  update public.broker_sync_activations
  set capture_health = v_health ->> 'health'
  where id = v_activation.id;

  v_result := jsonb_build_object(
    'status', case when v_noop then 'lane_success_noop' else 'lane_advanced' end,
    'laneStateId', v_lane.id,
    'laneRowVersion', v_lane.row_version,
    'seriesRowVersion', v_series.series_row_version,
    'activationRowVersion', v_activation.activation_row_version,
    'authorityEpoch', v_series.authority_epoch,
    'captureHealth', v_health ->> 'health',
    'authorityBlocked', true
  );

  insert into public.broker_sync_authority_mutation_receipts (
    request_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, mutation_kind, request_digest, result, applied_at
  ) values (
    p_request_id, v_activation.user_id, v_activation.broker_account_id,
    v_activation.id, v_activation.activation_generation,
    'record_lane_success', v_digest, v_result, clock_timestamp()
  );
  return v_result;
exception
  when unique_violation then raise exception 'AUTHORITY_MUTATION_REPLAY_RACE';
  when lock_not_available then raise exception 'AUTHORITY_MUTATION_LOCK_TIMEOUT';
  when query_canceled then raise exception 'AUTHORITY_MUTATION_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_record_broker_sync_lane_success_v1(
  uuid, uuid, bigint, bigint, bigint, bigint, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.equora_record_broker_sync_lane_success_v1(
  uuid, uuid, bigint, bigint, bigint, bigint, text, uuid
) to service_role;

create or replace function public.equora_record_broker_sync_lane_failure_v1(
  p_lane_state_id uuid,
  p_expected_series_row_version bigint,
  p_expected_activation_row_version bigint,
  p_expected_lane_row_version bigint,
  p_error_code text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_lane_pre public.broker_sync_lane_states%rowtype;
  v_lane public.broker_sync_lane_states%rowtype;
  v_requirement public.broker_sync_lane_requirements%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_receipt public.broker_sync_authority_mutation_receipts%rowtype;
  v_digest text;
  v_result jsonb;
  v_health jsonb;
begin
  if p_lane_state_id is null or p_request_id is null
    or p_expected_series_row_version is null
    or p_expected_series_row_version < 0
    or p_expected_activation_row_version is null
    or p_expected_activation_row_version < 0
    or p_expected_lane_row_version is null
    or p_expected_lane_row_version < 0
    or p_error_code is null
    or p_error_code !~ '^[a-z][a-z0-9_]{0,62}$'
  then raise exception 'AUTHORITY_LANE_FAILURE_INVALID_INPUT'; end if;

  select * into v_lane_pre
  from public.broker_sync_lane_states
  where id = p_lane_state_id;
  if not found then raise exception 'AUTHORITY_LANE_NOT_FOUND'; end if;

  v_digest := public.equora_authority_mutation_digest_v1(
    'record_lane_failure',
    jsonb_build_object(
      'requestId', p_request_id::text,
      'laneStateId', p_lane_state_id::text,
      'expectedSeriesRowVersion', p_expected_series_row_version,
      'expectedActivationRowVersion', p_expected_activation_row_version,
      'expectedLaneRowVersion', p_expected_lane_row_version,
      'errorCode', p_error_code
    )
  );

  select * into v_receipt
  from public.broker_sync_authority_mutation_receipts
  where request_id = p_request_id;
  if found then
    if v_receipt.mutation_kind <> 'record_lane_failure'
      or v_receipt.request_digest is distinct from v_digest
    then raise exception 'AUTHORITY_MUTATION_REPLAY_MISMATCH'; end if;
    return v_receipt.result;
  end if;

  select series_row.* into v_series
  from public.broker_sync_activation_series series_row
  join public.broker_sync_activations activation_row
    on activation_row.activation_series_id = series_row.id
   and activation_row.user_id = series_row.user_id
   and activation_row.broker_account_id = series_row.broker_account_id
  where activation_row.id = v_lane_pre.sync_activation_id
  for update of series_row;
  if not found then raise exception 'AUTHORITY_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_activation
  from public.broker_sync_activations
  where id = v_lane_pre.sync_activation_id
    and user_id = v_lane_pre.user_id
    and broker_account_id = v_lane_pre.broker_account_id
    and activation_generation = v_lane_pre.activation_generation
  for update;
  if not found
    or v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from
      v_activation.activation_generation
    or v_activation.activation_state <> 'active'
    or v_activation.authority_contract_version is distinct from
      'broker-capture-authority-v1'
  then raise exception 'AUTHORITY_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_requirement
  from public.broker_sync_lane_requirements
  where id = v_lane_pre.lane_requirement_id
    and user_id = v_lane_pre.user_id
    and broker_account_id = v_lane_pre.broker_account_id
    and sync_activation_id = v_lane_pre.sync_activation_id
    and activation_generation = v_lane_pre.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_REQUIREMENT_NOT_FOUND'; end if;

  select * into v_lane
  from public.broker_sync_lane_states
  where id = v_lane_pre.id
    and lane_requirement_id = v_requirement.id
    and user_id = v_requirement.user_id
    and broker_account_id = v_requirement.broker_account_id
    and sync_activation_id = v_requirement.sync_activation_id
    and activation_generation = v_requirement.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_LANE_NOT_FOUND'; end if;

  if v_series.series_row_version <> p_expected_series_row_version then
    raise exception 'AUTHORITY_SERIES_CAS_MISMATCH'; end if;
  if v_activation.activation_row_version <>
    p_expected_activation_row_version
  then raise exception 'AUTHORITY_ACTIVATION_CAS_MISMATCH'; end if;
  if v_lane.row_version <> p_expected_lane_row_version then
    raise exception 'AUTHORITY_LANE_CAS_MISMATCH'; end if;
  if v_requirement.superseded_at is not null
    or v_lane.superseded_at is not null
    or v_requirement.policy_generation <> v_lane.policy_generation
  then raise exception 'AUTHORITY_POLICY_NOT_CURRENT'; end if;

  update public.broker_sync_lane_states
  set observation_status = 'observed',
      health = case when health = 'gap_requires_export'
        then 'gap_requires_export' else 'degraded' end,
      last_error_code = p_error_code,
      last_error_at = v_now,
      row_version = row_version + 1,
      updated_at = v_now
  where id = v_lane.id and row_version = p_expected_lane_row_version
  returning * into v_lane;
  if not found then raise exception 'AUTHORITY_LANE_CAS_MISMATCH'; end if;

  update public.broker_sync_activations
  set activation_row_version = activation_row_version + 1,
      lifecycle_updated_at = v_now
  where id = v_activation.id
    and activation_row_version = p_expected_activation_row_version
  returning * into v_activation;
  if not found then raise exception 'AUTHORITY_ACTIVATION_CAS_MISMATCH'; end if;

  update public.broker_sync_activation_series
  set series_row_version = series_row_version + 1,
      authority_epoch = authority_epoch + 1,
      updated_at = v_now
  where id = v_series.id
    and series_row_version = p_expected_series_row_version
  returning * into v_series;
  if not found then raise exception 'AUTHORITY_SERIES_CAS_MISMATCH'; end if;

  v_health := public.equora_derive_capture_health_at_v1(
    v_activation.id, clock_timestamp()
  );
  update public.broker_sync_activations
  set capture_health = v_health ->> 'health'
  where id = v_activation.id;

  v_result := jsonb_build_object(
    'status', 'lane_degraded',
    'laneStateId', v_lane.id,
    'laneHealth', v_lane.health,
    'laneRowVersion', v_lane.row_version,
    'seriesRowVersion', v_series.series_row_version,
    'activationRowVersion', v_activation.activation_row_version,
    'authorityEpoch', v_series.authority_epoch,
    'captureHealth', v_health ->> 'health',
    'authorityBlocked', true
  );
  insert into public.broker_sync_authority_mutation_receipts (
    request_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, mutation_kind, request_digest, result, applied_at
  ) values (
    p_request_id, v_activation.user_id, v_activation.broker_account_id,
    v_activation.id, v_activation.activation_generation,
    'record_lane_failure', v_digest, v_result, v_now
  );
  return v_result;
exception
  when unique_violation then raise exception 'AUTHORITY_MUTATION_REPLAY_RACE';
  when lock_not_available then raise exception 'AUTHORITY_MUTATION_LOCK_TIMEOUT';
  when query_canceled then raise exception 'AUTHORITY_MUTATION_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_record_broker_sync_lane_failure_v1(
  uuid, bigint, bigint, bigint, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.equora_record_broker_sync_lane_failure_v1(
  uuid, bigint, bigint, bigint, text, uuid
) to service_role;

create or replace function public.equora_open_broker_sync_gap_v1(
  p_lane_state_id uuid,
  p_discovery_scope_id uuid,
  p_expected_series_row_version bigint,
  p_expected_activation_row_version bigint,
  p_expected_lane_row_version bigint,
  p_gap_from_ms bigint,
  p_gap_to_ms bigint,
  p_left_boundary_unknown boolean,
  p_right_boundary_unknown boolean,
  p_cause text,
  p_reason_code text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_lane_pre public.broker_sync_lane_states%rowtype;
  v_lane public.broker_sync_lane_states%rowtype;
  v_requirement public.broker_sync_lane_requirements%rowtype;
  v_scope public.broker_sync_scopes%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_receipt public.broker_sync_authority_mutation_receipts%rowtype;
  v_gap public.broker_sync_gaps%rowtype;
  v_digest text;
  v_authority_digest text;
  v_status text;
  v_required_source text;
  v_result jsonb;
  v_health jsonb;
begin
  if p_lane_state_id is null
    or p_request_id is null
    or p_expected_series_row_version is null
    or p_expected_series_row_version < 0
    or p_expected_activation_row_version is null
    or p_expected_activation_row_version < 0
    or p_expected_lane_row_version is null
    or p_expected_lane_row_version < 0
    or p_left_boundary_unknown is null
    or p_right_boundary_unknown is null
    or (p_left_boundary_unknown <> (p_gap_from_ms is null))
    or (p_right_boundary_unknown <> (p_gap_to_ms is null))
    or (p_gap_from_ms is not null and p_gap_from_ms < 0)
    or (p_gap_to_ms is not null and p_gap_to_ms < 0)
    or (p_gap_from_ms is not null and p_gap_to_ms is not null
      and p_gap_from_ms >= p_gap_to_ms)
    or p_cause not in (
      'scheduler_lapse', 'provider_error', 'permission', 'paging',
      'unknown_boundary', 'schema_change', 'manual_pause'
    )
    or p_reason_code is null
    or p_reason_code !~ '^[a-z][a-z0-9_]{0,62}$'
  then
    raise exception 'AUTHORITY_GAP_INVALID_INPUT';
  end if;

  v_required_source := case
    when p_left_boundary_unknown or p_right_boundary_unknown
      or p_cause in ('permission', 'unknown_boundary', 'schema_change')
    then 'provider_export_scope'
    else 'complete_api_scope'
  end;
  v_status := case when v_required_source = 'provider_export_scope'
    then 'requires_export' else 'open' end;

  select * into v_lane_pre from public.broker_sync_lane_states
  where id = p_lane_state_id;
  if not found then raise exception 'AUTHORITY_LANE_NOT_FOUND'; end if;

  v_digest := public.equora_authority_mutation_digest_v1(
    'open_gap',
    jsonb_build_object(
      'requestId', p_request_id::text,
      'laneStateId', p_lane_state_id::text,
      'discoveryScopeId', p_discovery_scope_id::text,
      'expectedSeriesRowVersion', p_expected_series_row_version,
      'expectedActivationRowVersion', p_expected_activation_row_version,
      'expectedLaneRowVersion', p_expected_lane_row_version,
      'gapFromMs', p_gap_from_ms, 'gapToMs', p_gap_to_ms,
      'leftBoundaryUnknown', p_left_boundary_unknown,
      'rightBoundaryUnknown', p_right_boundary_unknown,
      'cause', p_cause, 'reasonCode', p_reason_code
    )
  );

  select * into v_receipt
  from public.broker_sync_authority_mutation_receipts
  where request_id = p_request_id;
  if found then
    if v_receipt.mutation_kind <> 'open_gap'
      or v_receipt.request_digest is distinct from v_digest
    then raise exception 'AUTHORITY_MUTATION_REPLAY_MISMATCH'; end if;
    return v_receipt.result;
  end if;

  select series_row.* into v_series
  from public.broker_sync_activation_series series_row
  join public.broker_sync_activations activation_row
    on activation_row.activation_series_id = series_row.id
   and activation_row.user_id = series_row.user_id
   and activation_row.broker_account_id = series_row.broker_account_id
  where activation_row.id = v_lane_pre.sync_activation_id
  for update of series_row;
  if not found then raise exception 'AUTHORITY_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_activation from public.broker_sync_activations
  where id = v_lane_pre.sync_activation_id
    and user_id = v_lane_pre.user_id
    and broker_account_id = v_lane_pre.broker_account_id
    and activation_generation = v_lane_pre.activation_generation
  for update;
  if not found
    or v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
    or v_activation.activation_state <> 'active'
  then raise exception 'AUTHORITY_ACTIVATION_NOT_CURRENT'; end if;

  if p_discovery_scope_id is not null then
    select * into v_scope from public.broker_sync_scopes
    where id = p_discovery_scope_id
      and user_id = v_activation.user_id
      and broker_account_id = v_activation.broker_account_id
      and sync_activation_id = v_activation.id
      and activation_generation = v_activation.activation_generation
    for update;
    if not found then raise exception 'AUTHORITY_SCOPE_INVALID'; end if;
  end if;

  select * into v_requirement from public.broker_sync_lane_requirements
  where id = v_lane_pre.lane_requirement_id
    and user_id = v_lane_pre.user_id
    and broker_account_id = v_lane_pre.broker_account_id
    and sync_activation_id = v_lane_pre.sync_activation_id
    and activation_generation = v_lane_pre.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_REQUIREMENT_NOT_FOUND'; end if;

  select * into v_lane from public.broker_sync_lane_states
  where id = v_lane_pre.id
    and lane_requirement_id = v_requirement.id
    and user_id = v_requirement.user_id
    and broker_account_id = v_requirement.broker_account_id
    and sync_activation_id = v_requirement.sync_activation_id
    and activation_generation = v_requirement.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_LANE_NOT_FOUND'; end if;

  if v_series.series_row_version <> p_expected_series_row_version then
    raise exception 'AUTHORITY_SERIES_CAS_MISMATCH';
  end if;
  if v_activation.activation_row_version <> p_expected_activation_row_version then
    raise exception 'AUTHORITY_ACTIVATION_CAS_MISMATCH';
  end if;
  if v_lane.row_version <> p_expected_lane_row_version then
    raise exception 'AUTHORITY_LANE_CAS_MISMATCH';
  end if;
  if v_requirement.superseded_at is not null or v_lane.superseded_at is not null
    or (p_discovery_scope_id is not null and (
      v_scope.lane_requirement_id <> v_requirement.id
      or v_scope.lane_state_id <> v_lane.id
      or v_scope.policy_generation <> v_lane.policy_generation
      or v_scope.capability_id <> v_lane.capability_id
      or v_scope.instrument_scope_key <> v_lane.instrument_scope_key
      or v_scope.lane_id <> v_lane.lane_id
      or v_scope.profile_id <> v_lane.profile_id
      or v_scope.profile_version <> v_lane.profile_version
    ))
  then raise exception 'AUTHORITY_SCOPE_INVALID'; end if;

  if p_discovery_scope_id is not null then
    v_authority_digest := public.equora_capture_authority_digest_v1(
      v_activation.id, v_activation.activation_generation,
      v_activation.broker_account_id, v_requirement.id, v_lane.id,
      v_lane.policy_generation, v_lane.capability_id,
      v_lane.instrument_scope_key, v_lane.lane_id, v_lane.profile_id,
      v_lane.profile_version, v_scope.scope_digest
    );
    if v_scope.authority_digest is distinct from v_authority_digest then
      raise exception 'AUTHORITY_SCOPE_DIGEST_INVALID';
    end if;
  end if;

  insert into public.broker_sync_gaps (
    id, user_id, broker_account_id, sync_activation_id,
    activation_generation, lane_state_id, capability_id,
    instrument_scope_key, lane_id, profile_id, profile_version,
    policy_generation, gap_from_ms, gap_to_ms, left_boundary_unknown,
    right_boundary_unknown, cause, status, reason_code,
    required_resolution_source, discovery_scope_id, detected_at,
    last_checked_at, created_at, updated_at, row_version
  ) values (
    gen_random_uuid(), v_lane.user_id, v_lane.broker_account_id,
    v_lane.sync_activation_id, v_lane.activation_generation, v_lane.id,
    v_lane.capability_id, v_lane.instrument_scope_key, v_lane.lane_id,
    v_lane.profile_id, v_lane.profile_version, v_lane.policy_generation,
    p_gap_from_ms, p_gap_to_ms, p_left_boundary_unknown,
    p_right_boundary_unknown, p_cause, v_status, p_reason_code,
    v_required_source, p_discovery_scope_id, v_now, v_now, v_now, v_now, 0
  ) on conflict do nothing
  returning * into v_gap;

  if not found then
    -- Gap identity is semantic, not request-ID based. Parallel or later
    -- observations of the same unresolved interval/cause reuse the durable Gap
    -- without mutating its original policy/evidence or the current Lane.
    select * into v_gap
    from public.broker_sync_gaps
    where user_id = v_lane.user_id
      and broker_account_id = v_lane.broker_account_id
      and sync_activation_id = v_lane.sync_activation_id
      and activation_generation = v_lane.activation_generation
      and capability_id = v_lane.capability_id
      and instrument_scope_key = v_lane.instrument_scope_key
      and lane_id = v_lane.lane_id
      and gap_from_ms is not distinct from p_gap_from_ms
      and gap_to_ms is not distinct from p_gap_to_ms
      and left_boundary_unknown = p_left_boundary_unknown
      and right_boundary_unknown = p_right_boundary_unknown
      and cause = p_cause
      and status <> 'reconciled'
    for update;
    if not found then raise exception 'AUTHORITY_GAP_IDENTITY_RACE'; end if;

    v_health := public.equora_derive_capture_health_at_v1(
      v_activation.id, clock_timestamp()
    );
    v_result := jsonb_build_object(
      'status', 'gap_already_open', 'gapId', v_gap.id,
      'gapStatus', v_gap.status, 'gapRowVersion', v_gap.row_version,
      'laneRowVersion', v_lane.row_version,
      'seriesRowVersion', v_series.series_row_version,
      'activationRowVersion', v_activation.activation_row_version,
      'authorityEpoch', v_series.authority_epoch,
      'captureHealth', v_health ->> 'health', 'authorityBlocked', true
    );
    insert into public.broker_sync_authority_mutation_receipts (
      request_id, user_id, broker_account_id, sync_activation_id,
      activation_generation, mutation_kind, request_digest, result, applied_at
    ) values (
      p_request_id, v_activation.user_id, v_activation.broker_account_id,
      v_activation.id, v_activation.activation_generation,
      'open_gap', v_digest, v_result, clock_timestamp()
    );
    return v_result;
  end if;

  update public.broker_sync_lane_states
  set observation_status = 'observed',
      health = case when v_status = 'requires_export'
        then 'gap_requires_export' else 'degraded' end,
      last_error_code = p_reason_code, last_error_at = v_now,
      row_version = row_version + 1, updated_at = v_now
  where id = v_lane.id and row_version = p_expected_lane_row_version
  returning * into v_lane;
  if not found then raise exception 'AUTHORITY_LANE_CAS_MISMATCH'; end if;

  update public.broker_sync_activations
  set activation_row_version = activation_row_version + 1,
      lifecycle_updated_at = v_now
  where id = v_activation.id
    and activation_row_version = p_expected_activation_row_version
  returning * into v_activation;
  if not found then raise exception 'AUTHORITY_ACTIVATION_CAS_MISMATCH'; end if;

  update public.broker_sync_activation_series
  set series_row_version = series_row_version + 1,
      authority_epoch = authority_epoch + 1, updated_at = v_now
  where id = v_series.id
    and series_row_version = p_expected_series_row_version
  returning * into v_series;
  if not found then raise exception 'AUTHORITY_SERIES_CAS_MISMATCH'; end if;

  v_health := public.equora_derive_capture_health_at_v1(v_activation.id, clock_timestamp());
  update public.broker_sync_activations set capture_health = v_health ->> 'health'
  where id = v_activation.id;

  v_result := jsonb_build_object(
    'status', 'gap_opened', 'gapId', v_gap.id,
    'gapStatus', v_gap.status, 'gapRowVersion', v_gap.row_version,
    'laneRowVersion', v_lane.row_version,
    'seriesRowVersion', v_series.series_row_version,
    'activationRowVersion', v_activation.activation_row_version,
    'authorityEpoch', v_series.authority_epoch,
    'captureHealth', v_health ->> 'health', 'authorityBlocked', true
  );
  insert into public.broker_sync_authority_mutation_receipts (
    request_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, mutation_kind, request_digest, result, applied_at
  ) values (
    p_request_id, v_activation.user_id, v_activation.broker_account_id,
    v_activation.id, v_activation.activation_generation,
    'open_gap', v_digest, v_result, clock_timestamp()
  );
  return v_result;
exception
  when unique_violation then raise exception 'AUTHORITY_MUTATION_REPLAY_RACE';
  when lock_not_available then raise exception 'AUTHORITY_MUTATION_LOCK_TIMEOUT';
  when query_canceled then raise exception 'AUTHORITY_MUTATION_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_open_broker_sync_gap_v1(
  uuid, uuid, bigint, bigint, bigint, bigint, bigint, boolean, boolean,
  text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.equora_open_broker_sync_gap_v1(
  uuid, uuid, bigint, bigint, bigint, bigint, bigint, boolean, boolean,
  text, text, uuid
) to service_role;

create or replace function public.equora_escalate_broker_sync_gap_v1(
  p_gap_id uuid,
  p_target_status text,
  p_reason_code text,
  p_expected_series_row_version bigint,
  p_expected_activation_row_version bigint,
  p_expected_lane_row_version bigint,
  p_expected_gap_row_version bigint,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_gap_pre public.broker_sync_gaps%rowtype;
  v_gap public.broker_sync_gaps%rowtype;
  v_lane public.broker_sync_lane_states%rowtype;
  v_requirement public.broker_sync_lane_requirements%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_receipt public.broker_sync_authority_mutation_receipts%rowtype;
  v_digest text;
  v_result jsonb;
  v_health jsonb;
begin
  if p_gap_id is null or p_request_id is null
    or p_target_status not in ('degraded', 'requires_export', 'unsupported')
    or p_reason_code is null
    or p_reason_code !~ '^[a-z][a-z0-9_]{0,62}$'
    or p_expected_series_row_version is null
    or p_expected_series_row_version < 0
    or p_expected_activation_row_version is null
    or p_expected_activation_row_version < 0
    or p_expected_lane_row_version is null
    or p_expected_lane_row_version < 0
    or p_expected_gap_row_version is null
    or p_expected_gap_row_version < 0
  then raise exception 'AUTHORITY_GAP_ESCALATION_INVALID_INPUT'; end if;

  select * into v_gap_pre
  from public.broker_sync_gaps
  where id = p_gap_id;
  if not found then raise exception 'AUTHORITY_GAP_NOT_FOUND'; end if;

  v_digest := public.equora_authority_mutation_digest_v1(
    'escalate_gap',
    jsonb_build_object(
      'requestId', p_request_id::text,
      'gapId', p_gap_id::text,
      'targetStatus', p_target_status,
      'reasonCode', p_reason_code,
      'expectedSeriesRowVersion', p_expected_series_row_version,
      'expectedActivationRowVersion', p_expected_activation_row_version,
      'expectedLaneRowVersion', p_expected_lane_row_version,
      'expectedGapRowVersion', p_expected_gap_row_version
    )
  );

  select * into v_receipt
  from public.broker_sync_authority_mutation_receipts
  where request_id = p_request_id;
  if found then
    if v_receipt.mutation_kind <> 'escalate_gap'
      or v_receipt.request_digest is distinct from v_digest
    then raise exception 'AUTHORITY_MUTATION_REPLAY_MISMATCH'; end if;
    return v_receipt.result;
  end if;

  select series_row.* into v_series
  from public.broker_sync_activation_series series_row
  join public.broker_sync_activations activation_row
    on activation_row.activation_series_id = series_row.id
   and activation_row.user_id = series_row.user_id
   and activation_row.broker_account_id = series_row.broker_account_id
  where activation_row.id = v_gap_pre.sync_activation_id
  for update of series_row;
  if not found then raise exception 'AUTHORITY_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_activation
  from public.broker_sync_activations
  where id = v_gap_pre.sync_activation_id
    and user_id = v_gap_pre.user_id
    and broker_account_id = v_gap_pre.broker_account_id
    and activation_generation = v_gap_pre.activation_generation
  for update;
  if not found
    or v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from
      v_activation.activation_generation
    or v_activation.activation_state <> 'active'
  then raise exception 'AUTHORITY_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_requirement
  from public.broker_sync_lane_requirements
  where id = (
      select lane_requirement_id
      from public.broker_sync_lane_states
      where id = v_gap_pre.lane_state_id
        and user_id = v_gap_pre.user_id
        and broker_account_id = v_gap_pre.broker_account_id
        and sync_activation_id = v_gap_pre.sync_activation_id
        and activation_generation = v_gap_pre.activation_generation
    )
    and user_id = v_gap_pre.user_id
    and broker_account_id = v_gap_pre.broker_account_id
    and sync_activation_id = v_gap_pre.sync_activation_id
    and activation_generation = v_gap_pre.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_REQUIREMENT_NOT_FOUND'; end if;

  select * into v_lane
  from public.broker_sync_lane_states
  where id = v_gap_pre.lane_state_id
    and lane_requirement_id = v_requirement.id
    and user_id = v_gap_pre.user_id
    and broker_account_id = v_gap_pre.broker_account_id
    and sync_activation_id = v_gap_pre.sync_activation_id
    and activation_generation = v_gap_pre.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_LANE_NOT_FOUND'; end if;

  select * into v_gap
  from public.broker_sync_gaps
  where id = v_gap_pre.id
    and user_id = v_gap_pre.user_id
    and broker_account_id = v_gap_pre.broker_account_id
    and sync_activation_id = v_gap_pre.sync_activation_id
    and activation_generation = v_gap_pre.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_GAP_NOT_FOUND'; end if;

  if v_series.series_row_version <> p_expected_series_row_version then
    raise exception 'AUTHORITY_SERIES_CAS_MISMATCH'; end if;
  if v_activation.activation_row_version <>
    p_expected_activation_row_version
  then raise exception 'AUTHORITY_ACTIVATION_CAS_MISMATCH'; end if;
  if v_lane.row_version <> p_expected_lane_row_version then
    raise exception 'AUTHORITY_LANE_CAS_MISMATCH'; end if;
  if v_gap.row_version <> p_expected_gap_row_version then
    raise exception 'AUTHORITY_GAP_CAS_MISMATCH'; end if;

  if not (
    v_gap.status = 'open'
    or (v_gap.status = 'degraded'
      and p_target_status in ('degraded', 'requires_export', 'unsupported'))
    or (v_gap.status in ('requires_export', 'unsupported')
      and p_target_status = v_gap.status)
  )
  then raise exception 'AUTHORITY_GAP_ILLEGAL_TRANSITION'; end if;

  update public.broker_sync_gaps
  set status = p_target_status,
      reason_code = p_reason_code,
      required_resolution_source = case
        when p_target_status in ('requires_export', 'unsupported')
          then 'provider_export_scope'
        else required_resolution_source
      end,
      last_checked_at = v_now,
      updated_at = v_now,
      row_version = row_version + 1
  where id = v_gap.id and row_version = p_expected_gap_row_version
  returning * into v_gap;
  if not found then raise exception 'AUTHORITY_GAP_CAS_MISMATCH'; end if;

  update public.broker_sync_lane_states
  set observation_status = 'observed',
      health = case
        when p_target_status in ('requires_export', 'unsupported')
          then 'gap_requires_export'
        when health = 'gap_requires_export' then 'gap_requires_export'
        else 'degraded'
      end,
      last_error_code = p_reason_code,
      last_error_at = v_now,
      row_version = row_version + 1,
      updated_at = v_now
  where id = v_lane.id and row_version = p_expected_lane_row_version
  returning * into v_lane;
  if not found then raise exception 'AUTHORITY_LANE_CAS_MISMATCH'; end if;

  update public.broker_sync_activations
  set activation_row_version = activation_row_version + 1,
      lifecycle_updated_at = v_now
  where id = v_activation.id
    and activation_row_version = p_expected_activation_row_version
  returning * into v_activation;
  if not found then raise exception 'AUTHORITY_ACTIVATION_CAS_MISMATCH'; end if;

  update public.broker_sync_activation_series
  set series_row_version = series_row_version + 1,
      authority_epoch = authority_epoch + 1,
      updated_at = v_now
  where id = v_series.id
    and series_row_version = p_expected_series_row_version
  returning * into v_series;
  if not found then raise exception 'AUTHORITY_SERIES_CAS_MISMATCH'; end if;

  v_health := public.equora_derive_capture_health_at_v1(
    v_activation.id, clock_timestamp()
  );
  update public.broker_sync_activations
  set capture_health = v_health ->> 'health'
  where id = v_activation.id;

  v_result := jsonb_build_object(
    'status', 'gap_escalated',
    'gapId', v_gap.id,
    'gapStatus', v_gap.status,
    'gapRowVersion', v_gap.row_version,
    'laneRowVersion', v_lane.row_version,
    'seriesRowVersion', v_series.series_row_version,
    'activationRowVersion', v_activation.activation_row_version,
    'authorityEpoch', v_series.authority_epoch,
    'captureHealth', v_health ->> 'health',
    'authorityBlocked', true
  );
  insert into public.broker_sync_authority_mutation_receipts (
    request_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, mutation_kind, request_digest, result, applied_at
  ) values (
    p_request_id, v_activation.user_id, v_activation.broker_account_id,
    v_activation.id, v_activation.activation_generation,
    'escalate_gap', v_digest, v_result, v_now
  );
  return v_result;
exception
  when unique_violation then raise exception 'AUTHORITY_MUTATION_REPLAY_RACE';
  when lock_not_available then raise exception 'AUTHORITY_MUTATION_LOCK_TIMEOUT';
  when query_canceled then raise exception 'AUTHORITY_MUTATION_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_escalate_broker_sync_gap_v1(
  uuid, text, text, bigint, bigint, bigint, bigint, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.equora_escalate_broker_sync_gap_v1(
  uuid, text, text, bigint, bigint, bigint, bigint, uuid
) to service_role;

create or replace function public.equora_reconcile_broker_sync_gap_v1(
  p_gap_id uuid,
  p_resolution_scope_id uuid,
  p_expected_series_row_version bigint,
  p_expected_activation_row_version bigint,
  p_expected_gap_row_version bigint,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_gap_pre public.broker_sync_gaps%rowtype;
  v_gap public.broker_sync_gaps%rowtype;
  v_lane public.broker_sync_lane_states%rowtype;
  v_requirement public.broker_sync_lane_requirements%rowtype;
  v_scope public.broker_sync_scopes%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_receipt public.broker_sync_authority_mutation_receipts%rowtype;
  v_digest text;
  v_authority_digest text;
  v_resolution_digest text;
  v_effective_gap_from_ms bigint;
  v_effective_gap_to_ms bigint;
  v_result jsonb;
  v_health jsonb;
begin
  if p_gap_id is null or p_resolution_scope_id is null or p_request_id is null
    or p_expected_series_row_version is null or p_expected_series_row_version < 0
    or p_expected_activation_row_version is null or p_expected_activation_row_version < 0
    or p_expected_gap_row_version is null or p_expected_gap_row_version < 0
  then raise exception 'AUTHORITY_RECONCILIATION_INVALID_INPUT'; end if;

  select * into v_gap_pre from public.broker_sync_gaps where id = p_gap_id;
  if not found then raise exception 'AUTHORITY_GAP_NOT_FOUND'; end if;

  v_digest := public.equora_authority_mutation_digest_v1(
    'reconcile_gap',
    jsonb_build_object(
      'requestId', p_request_id::text, 'gapId', p_gap_id::text,
      'resolutionScopeId', p_resolution_scope_id::text,
      'expectedSeriesRowVersion', p_expected_series_row_version,
      'expectedActivationRowVersion', p_expected_activation_row_version,
      'expectedGapRowVersion', p_expected_gap_row_version
    )
  );

  select * into v_receipt
  from public.broker_sync_authority_mutation_receipts
  where request_id = p_request_id;
  if found then
    if v_receipt.mutation_kind <> 'reconcile_gap'
      or v_receipt.request_digest is distinct from v_digest
    then raise exception 'AUTHORITY_MUTATION_REPLAY_MISMATCH'; end if;
    return v_receipt.result;
  end if;

  select series_row.* into v_series
  from public.broker_sync_activation_series series_row
  join public.broker_sync_activations activation_row
    on activation_row.activation_series_id = series_row.id
   and activation_row.user_id = series_row.user_id
   and activation_row.broker_account_id = series_row.broker_account_id
  where activation_row.id = v_gap_pre.sync_activation_id
  for update of series_row;
  if not found then raise exception 'AUTHORITY_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_activation from public.broker_sync_activations
  where id = v_gap_pre.sync_activation_id
    and user_id = v_gap_pre.user_id
    and broker_account_id = v_gap_pre.broker_account_id
    and activation_generation = v_gap_pre.activation_generation
  for update;
  if not found
    or v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
    or v_activation.activation_state <> 'active'
  then raise exception 'AUTHORITY_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_scope from public.broker_sync_scopes
  where id = p_resolution_scope_id
    and user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and sync_activation_id = v_activation.id
    and activation_generation = v_activation.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_SCOPE_INVALID'; end if;

  select * into v_requirement
  from public.broker_sync_lane_requirements
  where id = (
      select lane_requirement_id
      from public.broker_sync_lane_states
      where id = v_gap_pre.lane_state_id
        and user_id = v_gap_pre.user_id
        and broker_account_id = v_gap_pre.broker_account_id
        and sync_activation_id = v_gap_pre.sync_activation_id
        and activation_generation = v_gap_pre.activation_generation
    )
    and user_id = v_gap_pre.user_id
    and broker_account_id = v_gap_pre.broker_account_id
    and sync_activation_id = v_gap_pre.sync_activation_id
    and activation_generation = v_gap_pre.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_REQUIREMENT_NOT_FOUND'; end if;

  select * into v_lane from public.broker_sync_lane_states
  where id = v_gap_pre.lane_state_id
    and user_id = v_gap_pre.user_id
    and broker_account_id = v_gap_pre.broker_account_id
    and sync_activation_id = v_gap_pre.sync_activation_id
    and activation_generation = v_gap_pre.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_LANE_NOT_FOUND'; end if;
  if v_requirement.id <> v_lane.lane_requirement_id then
    raise exception 'AUTHORITY_REQUIREMENT_NOT_FOUND';
  end if;

  select * into v_gap from public.broker_sync_gaps
  where id = v_gap_pre.id
    and user_id = v_gap_pre.user_id
    and broker_account_id = v_gap_pre.broker_account_id
    and sync_activation_id = v_gap_pre.sync_activation_id
    and activation_generation = v_gap_pre.activation_generation
  for update;
  if not found then raise exception 'AUTHORITY_GAP_NOT_FOUND'; end if;

  if v_series.series_row_version <> p_expected_series_row_version then
    raise exception 'AUTHORITY_SERIES_CAS_MISMATCH'; end if;
  if v_activation.activation_row_version <> p_expected_activation_row_version then
    raise exception 'AUTHORITY_ACTIVATION_CAS_MISMATCH'; end if;
  if v_gap.row_version <> p_expected_gap_row_version then
    raise exception 'AUTHORITY_GAP_CAS_MISMATCH'; end if;

  v_effective_gap_from_ms := coalesce(
    v_gap.gap_from_ms, v_scope.request_start_ms
  );
  v_effective_gap_to_ms := coalesce(
    v_gap.gap_to_ms, v_scope.request_end_ms
  );

  if v_gap.status = 'reconciled'
    or v_scope.lane_requirement_id <> v_lane.lane_requirement_id
    or v_scope.lane_state_id <> v_lane.id
    or v_scope.policy_generation <> v_lane.policy_generation
    or v_scope.capability_id <> v_gap.capability_id
    or v_scope.instrument_scope_key <> v_gap.instrument_scope_key
    or v_scope.lane_id <> v_gap.lane_id
    or v_scope.profile_id <> v_gap.profile_id
    or v_scope.profile_version <> v_gap.profile_version
    or v_scope.scope_completeness <> 'complete_for_profile'
    or v_scope.stability_status not in ('observed_once', 'observed_stable')
    or v_scope.closed_at is null
    or v_effective_gap_from_ms is null
    or v_effective_gap_to_ms is null
    or v_effective_gap_from_ms < 0
    or v_effective_gap_to_ms <= v_effective_gap_from_ms
    or v_scope.request_start_ms > v_effective_gap_from_ms
    or v_scope.request_end_ms < v_effective_gap_to_ms
    or not (
      (v_gap.required_resolution_source = 'provider_export_scope'
        and v_scope.source_channel = 'provider_export_file'
        and v_scope.coverage_basis = 'provider_export_observed')
      or
      (v_gap.required_resolution_source = 'complete_api_scope' and (
        (v_scope.source_channel = 'provider_api_observation'
          and v_scope.coverage_basis = 'provider_observed')
        or
        (v_scope.source_channel = 'provider_export_file'
          and v_scope.coverage_basis = 'provider_export_observed')
      ))
    )
  then raise exception 'AUTHORITY_RECONCILIATION_SCOPE_INVALID'; end if;

  v_authority_digest := public.equora_capture_authority_digest_v1(
    v_activation.id, v_activation.activation_generation,
    v_activation.broker_account_id, v_requirement.id, v_lane.id,
    v_lane.policy_generation, v_lane.capability_id,
    v_lane.instrument_scope_key, v_lane.lane_id, v_lane.profile_id,
    v_lane.profile_version, v_scope.scope_digest
  );
  if v_scope.authority_digest is distinct from v_authority_digest then
    raise exception 'AUTHORITY_SCOPE_DIGEST_INVALID';
  end if;

  v_now := clock_timestamp();
  if v_scope.closed_at > v_now then
    raise exception 'AUTHORITY_RECONCILIATION_SCOPE_INVALID';
  end if;
  v_resolution_digest := public.equora_gap_resolution_digest_v1(
    v_gap.id, v_gap.sync_activation_id, v_gap.activation_generation,
    v_gap.broker_account_id, v_gap.capability_id,
    v_gap.instrument_scope_key, v_gap.lane_id, v_gap.profile_id,
    v_gap.profile_version, v_gap.policy_generation, v_effective_gap_from_ms,
    v_effective_gap_to_ms, false, false, v_gap.required_resolution_source,
    v_scope.id, v_scope.scope_digest, 'equora-gap-resolution-v1'
  );
  update public.broker_sync_gaps
  set status = 'reconciled',
      gap_from_ms = v_effective_gap_from_ms,
      gap_to_ms = v_effective_gap_to_ms,
      left_boundary_unknown = false,
      right_boundary_unknown = false,
      resolution_scope_id = v_scope.id,
      resolution_scope_digest = v_scope.scope_digest,
      resolution_contract_version = 'equora-gap-resolution-v1',
      resolution_evidence_digest = v_resolution_digest,
      last_checked_at = v_now, reconciled_at = v_now, updated_at = v_now,
      row_version = row_version + 1
  where id = v_gap.id and row_version = p_expected_gap_row_version
  returning * into v_gap;
  if not found then raise exception 'AUTHORITY_GAP_CAS_MISMATCH'; end if;

  update public.broker_sync_activations
  set activation_row_version = activation_row_version + 1,
      lifecycle_updated_at = v_now
  where id = v_activation.id
    and activation_row_version = p_expected_activation_row_version
  returning * into v_activation;
  if not found then raise exception 'AUTHORITY_ACTIVATION_CAS_MISMATCH'; end if;

  update public.broker_sync_activation_series
  set series_row_version = series_row_version + 1,
      authority_epoch = authority_epoch + 1, updated_at = v_now
  where id = v_series.id
    and series_row_version = p_expected_series_row_version
  returning * into v_series;
  if not found then raise exception 'AUTHORITY_SERIES_CAS_MISMATCH'; end if;

  v_health := public.equora_derive_capture_health_at_v1(v_activation.id, v_now);
  update public.broker_sync_activations set capture_health = v_health ->> 'health'
  where id = v_activation.id;
  v_result := jsonb_build_object(
    'status', 'gap_reconciled', 'gapId', v_gap.id,
    'gapRowVersion', v_gap.row_version,
    'seriesRowVersion', v_series.series_row_version,
    'activationRowVersion', v_activation.activation_row_version,
    'authorityEpoch', v_series.authority_epoch,
    'captureHealth', v_health ->> 'health', 'authorityBlocked', true
  );
  insert into public.broker_sync_authority_mutation_receipts (
    request_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, mutation_kind, request_digest, result, applied_at
  ) values (
    p_request_id, v_activation.user_id, v_activation.broker_account_id,
    v_activation.id, v_activation.activation_generation,
    'reconcile_gap', v_digest, v_result, v_now
  );
  return v_result;
exception
  when unique_violation then raise exception 'AUTHORITY_MUTATION_REPLAY_RACE';
  when lock_not_available then raise exception 'AUTHORITY_MUTATION_LOCK_TIMEOUT';
  when query_canceled then raise exception 'AUTHORITY_MUTATION_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_reconcile_broker_sync_gap_v1(
  uuid, uuid, bigint, bigint, bigint, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.equora_reconcile_broker_sync_gap_v1(
  uuid, uuid, bigint, bigint, bigint, uuid
) to service_role;

-- ---------------------------------------------------------------------------
-- Single-use Request dispatch authorization. This RPC is the linearization
-- point immediately before Credential loading. A lifecycle/credential/provider
-- change committed before this function wins causes zero returned Credential
-- reference. A transition after it wins waits on the held Series lock and the
-- dispatch is explicitly treated as the already in-flight winner.
-- ---------------------------------------------------------------------------

create table if not exists public.broker_capture_request_authorizations (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  activation_series_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  run_id uuid not null,
  scope_id uuid not null,
  work_unit_id uuid not null,
  lane_requirement_id uuid not null,
  lane_state_id uuid not null,
  policy_generation bigint not null,
  authority_digest text not null,
  work_unit_row_version bigint not null,
  request_sequence integer not null,
  lease_token_digest text not null,
  checkpoint_mac text not null,
  page_scope_digest text not null,
  series_row_version bigint not null,
  authority_epoch bigint not null,
  activation_row_version bigint not null,
  active_credential_id uuid not null,
  active_credential_key_version text not null,
  provider_code text not null,
  provider_contract_version text not null,
  capability_id text not null,
  authorization_contract_version text not null,
  consumed_at timestamptz not null,
  send_deadline_at timestamptz not null,
  constraint broker_capture_request_auth_activation_fkey
    foreign key (
      sync_activation_id, user_id, broker_account_id, activation_generation
    ) references public.broker_sync_activations (
      id, user_id, broker_account_id, activation_generation
    ) on delete restrict,
  constraint broker_capture_request_auth_work_unit_fkey
    foreign key (
      work_unit_id, run_id, scope_id, user_id, broker_account_id
    ) references public.broker_capture_work_units (
      id, run_id, scope_id, user_id, broker_account_id
    ) on delete restrict,
  constraint broker_capture_request_auth_versions_check check (
    activation_generation > 0 and policy_generation > 0
    and work_unit_row_version >= 0 and request_sequence > 0
    and series_row_version >= 0 and authority_epoch >= 0
    and activation_row_version >= 0
  ),
  constraint broker_capture_request_auth_digests_check check (
    authority_digest ~ '^[a-f0-9]{64}$'
    and lease_token_digest ~ '^[a-f0-9]{64}$'
    and checkpoint_mac ~ '^[a-f0-9]{64}$'
    and page_scope_digest ~ '^[a-f0-9]{64}$'
  ),
  constraint broker_capture_request_auth_contract_check check (
    authorization_contract_version = 'broker-request-authorization-v1'
    and active_credential_key_version ~ '^[a-z][a-z0-9_]{0,62}$'
  ),
  constraint broker_capture_request_auth_time_check check (
    send_deadline_at > consumed_at
    and send_deadline_at <= consumed_at + interval '5 seconds'
  ),
  constraint broker_capture_request_auth_sequence_unique
    unique (work_unit_id, request_sequence)
);

-- The authorization itself remains single-use. These three fields form an
-- append-once outcome receipt written in the same transaction as v1 Page
-- persistence so exact v2 replay never depends on a still-live Lease.
alter table public.broker_capture_request_authorizations
  add column if not exists page_commit_input_digest text,
  add column if not exists page_commit_result jsonb,
  add column if not exists page_committed_at timestamptz;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_capture_request_authorizations'::regclass
      and conname = 'broker_capture_request_auth_receipt_authority_key'
  ) then
    alter table public.broker_capture_request_authorizations
      add constraint broker_capture_request_auth_receipt_authority_key
      unique (
        id, user_id, broker_account_id, sync_activation_id,
        activation_generation, scope_id, lane_state_id
      );
  end if;
end;
$$;
alter table public.broker_capture_request_authorizations
  drop constraint if exists broker_capture_request_auth_page_receipt_check;
alter table public.broker_capture_request_authorizations
  add constraint broker_capture_request_auth_page_receipt_check check ((
    (page_commit_input_digest is null
      and page_commit_result is null and page_committed_at is null)
    or
    (page_commit_input_digest is not null
      and page_commit_input_digest ~ '^[a-f0-9]{64}$'
      and page_commit_result is not null
      and jsonb_typeof(page_commit_result) = 'object'
      and page_commit_result ->> 'status' = 'page_committed'
      and page_committed_at is not null
      and isfinite(page_committed_at))
  ) is true);

alter table public.broker_capture_request_authorizations enable row level security;
drop policy if exists "users can read own broker_capture_request_authorizations"
  on public.broker_capture_request_authorizations;
create policy "users can read own broker_capture_request_authorizations"
  on public.broker_capture_request_authorizations for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.broker_capture_request_authorizations
  from public, anon, authenticated, service_role;

create index if not exists idx_broker_capture_request_auth_activation_fkey
  on public.broker_capture_request_authorizations (
    sync_activation_id, user_id, broker_account_id, activation_generation
  );
create index if not exists idx_broker_capture_request_auth_work_unit_fkey
  on public.broker_capture_request_authorizations (
    work_unit_id, run_id, scope_id, user_id, broker_account_id
  );

create or replace function public.equora_authorize_broker_capture_request_v1(
  p_work_unit_id uuid,
  p_expected_work_unit_row_version bigint,
  p_request_sequence integer,
  p_expected_checkpoint_mac text,
  p_lease_token uuid,
  p_request_authorization_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_lease_digest text;
  v_work_unit public.broker_capture_work_units%rowtype;
  v_run public.broker_capture_runs%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_connection_account public.broker_connection_accounts%rowtype;
  v_connection public.broker_connections%rowtype;
  v_credential record;
  v_integrity_key record;
  v_account public.broker_accounts%rowtype;
  v_provider public.broker_providers%rowtype;
  v_runtime_enrollment record;
  v_runtime_enrollment_row_count bigint := 0;
  v_scope public.broker_sync_scopes%rowtype;
  v_requirement public.broker_sync_lane_requirements%rowtype;
  v_lane public.broker_sync_lane_states%rowtype;
  v_account_lease record;
  v_account_lease_row_count bigint := 0;
  v_health jsonb;
  v_derived_health text;
  v_existing public.broker_capture_request_authorizations%rowtype;
begin
  if p_work_unit_id is null or p_request_authorization_id is null
    or p_lease_token is null
    or p_expected_work_unit_row_version is null
    or p_expected_work_unit_row_version < 0
    or p_request_sequence is null or p_request_sequence < 1
    or p_expected_checkpoint_mac is null
    or p_expected_checkpoint_mac !~ '^[a-f0-9]{64}$'
  then raise exception 'REQUEST_AUTH_INVALID_INPUT'; end if;
  v_lease_digest := public.equora_lease_token_digest_v1(p_lease_token);

  select * into v_existing
  from public.broker_capture_request_authorizations
  where id = p_request_authorization_id;
  if found then
    raise exception 'REQUEST_AUTH_ALREADY_CONSUMED';
  end if;

  select * into v_work_unit from public.broker_capture_work_units
  where id = p_work_unit_id for update;
  if not found then raise exception 'REQUEST_AUTH_WORK_UNIT_NOT_FOUND'; end if;
  v_now := clock_timestamp();
  if v_work_unit.row_version <> p_expected_work_unit_row_version
    or v_work_unit.request_sequence + 1 <> p_request_sequence
    or v_work_unit.checkpoint_mac is distinct from p_expected_checkpoint_mac
    or v_work_unit.status not in ('leased', 'running')
    or v_work_unit.lease_token_digest is null
    or not public.equora_constant_time_hex_equal_v1(
      v_work_unit.lease_token_digest, v_lease_digest
    )
    or v_work_unit.lease_expires_at is null
    or v_work_unit.lease_expires_at <= v_now
  then raise exception 'REQUEST_AUTH_WORK_UNIT_CAS_MISMATCH'; end if;

  select * into v_run from public.broker_capture_runs
  where id = v_work_unit.run_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found or v_run.status not in ('pending', 'running', 'partial')
    or v_run.authority_contract_version <> 'broker-capture-authority-v1'
  then raise exception 'REQUEST_AUTH_RUN_INVALID'; end if;

  select series_row.* into v_series
  from public.broker_sync_activation_series series_row
  join public.broker_sync_activations activation_row
    on activation_row.activation_series_id = series_row.id
   and activation_row.user_id = series_row.user_id
   and activation_row.broker_account_id = series_row.broker_account_id
  where activation_row.id = v_work_unit.sync_activation_id
    and activation_row.activation_generation = v_work_unit.activation_generation
  for update of series_row;
  if not found then raise exception 'REQUEST_AUTH_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_activation from public.broker_sync_activations
  where id = v_work_unit.sync_activation_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found
    or v_activation.activation_state <> 'active'
    or v_activation.authority_contract_version <> 'broker-capture-authority-v1'
    or v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
  then raise exception 'REQUEST_AUTH_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_connection_account
  from public.broker_connection_accounts
  where id = v_activation.connection_account_id
    and user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and provider_code = v_activation.provider_code
    and environment = v_activation.environment
  for share;
  if not found or v_connection_account.status <> 'active'
    or v_connection_account.valid_from > v_now
    or (v_connection_account.valid_to is not null
      and v_connection_account.valid_to <= v_now)
  then raise exception 'REQUEST_AUTH_CONNECTION_INACTIVE'; end if;

  select * into v_connection from public.broker_connections
  where id = v_connection_account.connection_id
    and user_id = v_connection_account.user_id
    and provider = v_connection_account.provider_code
    and environment = v_connection_account.environment
  for share;
  if not found or v_connection.status <> 'ready'
    or v_connection.credential_reference is distinct from v_activation.active_credential_id
    or not v_connection.permissions @>
      array['read_only_user_attested']::text[]
    or not v_connection.permissions <@
      array['read_only_user_attested']::text[]
  then raise exception 'REQUEST_AUTH_CONNECTION_INACTIVE'; end if;

  -- This is the Credential-store linearization point. Only metadata presence is
  -- read; plaintext key/secret material is neither selected nor returned.
  select credential_row.id, credential_row.key_version,
    length(credential_row.encrypted_payload) > 0 as has_encrypted_payload
  into v_credential from public.broker_credentials credential_row
  where credential_row.id = v_activation.active_credential_id
    and credential_row.user_id = v_activation.user_id
    and credential_row.provider = v_activation.provider_code
    and credential_row.key_version = v_activation.active_credential_key_version
  for share;
  if not found or not v_credential.has_encrypted_payload then
    raise exception 'REQUEST_AUTH_CREDENTIAL_INACTIVE';
  end if;

  select integrity_key_row.id, integrity_key_row.key_version,
    integrity_key_row.status, integrity_key_row.valid_from,
    integrity_key_row.valid_to
  into v_integrity_key
  from equora_private.broker_capture_integrity_keys integrity_key_row
  where integrity_key_row.id = v_activation.capture_integrity_key_id
    and integrity_key_row.user_id = v_activation.user_id
    and integrity_key_row.broker_account_id = v_activation.broker_account_id
    and integrity_key_row.key_version = v_activation.capture_integrity_key_version
  for share;
  if not found then raise exception 'REQUEST_AUTH_INTEGRITY_KEY_INACTIVE'; end if;

  select * into v_account from public.broker_accounts
  where id = v_activation.broker_account_id
    and user_id = v_activation.user_id
    and provider_code = v_activation.provider_code
  for update;
  if not found or v_account.status <> 'active'
    or v_account.retention_status <> 'active'
  then raise exception 'REQUEST_AUTH_ACCOUNT_INACTIVE'; end if;

  select * into v_provider from public.broker_providers
  where provider_code = v_activation.provider_code for share;
  if not found or v_provider.status <> 'verified'
    or v_provider.mutations_forbidden is distinct from true
    or not (v_activation.provider_contract_version = any(
      v_provider.allowed_contract_versions
    ))
  then raise exception 'REQUEST_AUTH_PROVIDER_BLOCKED'; end if;

  -- Runtime enrollment is a default-off operational authority. The row is
  -- locked immediately before Scope/Lane authorization so disable-vs-request
  -- has one database linearization point. If disable commits first, no permit
  -- is created and the application performs neither server-time GET nor secret
  -- load. A permit committed first is the documented bounded in-flight winner.
  if to_regclass('equora_private.broker_capture_runtime_enrollment') is not null then
    execute $runtime_enrollment$
      select enrollment.*
      from equora_private.broker_capture_runtime_enrollment enrollment
      where enrollment.singleton_key is true
      for update
    $runtime_enrollment$ into v_runtime_enrollment;
    get diagnostics v_runtime_enrollment_row_count = row_count;
    if v_runtime_enrollment_row_count is distinct from 1
      or v_runtime_enrollment.enabled is distinct from true
      or v_runtime_enrollment.user_id is distinct from v_activation.user_id
      or v_runtime_enrollment.provider_code is distinct from v_activation.provider_code
      or v_runtime_enrollment.broker_account_id is distinct from v_activation.broker_account_id
    then
      raise exception 'REQUEST_AUTH_RUNTIME_ENROLLMENT_INVALID';
    end if;
  end if;

  select * into v_scope from public.broker_sync_scopes
  where id = v_work_unit.scope_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found or v_scope.closed_at is not null
    or v_scope.lane_requirement_id <> v_work_unit.lane_requirement_id
    or v_scope.lane_state_id <> v_work_unit.lane_state_id
    or v_scope.policy_generation <> v_work_unit.policy_generation
    or v_scope.authority_digest <> v_work_unit.authority_digest
    or v_provider.readonly_capabilities -> v_scope.capability_id ->> 'method'
      is distinct from 'GET'
  then raise exception 'REQUEST_AUTH_SCOPE_INVALID'; end if;

  select * into v_requirement from public.broker_sync_lane_requirements
  where id = v_work_unit.lane_requirement_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  select * into v_lane from public.broker_sync_lane_states
  where id = v_work_unit.lane_state_id
    and lane_requirement_id = v_work_unit.lane_requirement_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if v_requirement.id is null or v_lane.id is null
    or v_requirement.superseded_at is not null or v_lane.superseded_at is not null
    or v_lane.policy_generation <> v_work_unit.policy_generation
    or v_lane.lane_id <> v_work_unit.lane_id
  then raise exception 'REQUEST_AUTH_POLICY_NOT_CURRENT'; end if;

  -- Once the scheduler-control layer exists, its account/sync-kind Lease is
  -- part of the request authority. Keep this lookup dynamic so the Activation
  -- migration remains independently installable before that downstream layer.
  if to_regclass('public.broker_capture_account_leases') is not null then
    execute $account_lease$
      select account_lease.*
      from public.broker_capture_account_leases account_lease
      where account_lease.broker_account_id = $1
        and account_lease.sync_kind = 'provider_api_observation'
      for update
    $account_lease$
    into v_account_lease
    using v_work_unit.broker_account_id;
    get diagnostics v_account_lease_row_count = row_count;
    if v_account_lease_row_count <> 1
      or v_account_lease.state is distinct from 'leased'
      or v_account_lease.user_id is distinct from v_work_unit.user_id
      or v_account_lease.sync_activation_id is distinct from v_activation.id
      or v_account_lease.activation_generation
        is distinct from v_activation.activation_generation
      or v_account_lease.work_unit_id is distinct from v_work_unit.id
      or v_account_lease.run_id is distinct from v_work_unit.run_id
      or v_account_lease.scope_id is distinct from v_work_unit.scope_id
      or v_account_lease.lane_state_id is distinct from v_work_unit.lane_state_id
      or v_account_lease.policy_generation
        is distinct from v_work_unit.policy_generation
      or v_account_lease.work_unit_row_version
        is distinct from v_work_unit.row_version
      or v_account_lease.lease_epoch is distinct from v_work_unit.lease_epoch
      or v_account_lease.lease_token_digest is null
      or not public.equora_constant_time_hex_equal_v1(
        v_account_lease.lease_token_digest, v_lease_digest
      )
      or v_account_lease.lease_expires_at is distinct from v_work_unit.lease_expires_at
      or v_account_lease.lease_acquired_at is distinct from v_work_unit.lease_acquired_at
      or v_account_lease.lease_max_expires_at
        is distinct from v_work_unit.lease_max_expires_at
      or v_account_lease.lease_renew_count
        is distinct from v_work_unit.lease_renew_count
      or v_account_lease.lease_policy_version is distinct from 'lease-control-v1'
    then raise exception 'REQUEST_AUTH_ACCOUNT_LEASE_INVALID'; end if;
  end if;

  -- Refresh time only after the complete authority lock chain is held. A
  -- waiter may have crossed next_due_at while blocked on Series; deriving with
  -- the earlier Work-Unit timestamp would otherwise authorize stale health.
  -- Series/Activation locks serialize all reviewed Lane/Gap writers, so this
  -- derivation is the authority and capture_health remains a cache only.
  v_now := clock_timestamp();
  v_health := public.equora_derive_capture_health_at_v1(v_activation.id, v_now);
  v_derived_health := v_health ->> 'health';
  if v_derived_health = 'gap_requires_export'
    or v_derived_health in ('paused', 'revoked')
  then raise exception 'REQUEST_AUTH_HEALTH_BLOCKED'; end if;

  if not (
    v_derived_health = 'healthy'
    or (v_derived_health = 'pending'
      and v_lane.observation_status = 'not_observed')
    or (v_derived_health = 'degraded' and (
      v_run.trigger_kind = 'recovery'
      or v_run.lane_id in ('rolling_audit_7d_daily', 'rolling_audit_28d_weekly')
      or (v_run.trigger_kind in ('scheduler', 'startup_catchup')
        and v_lane.next_due_at is not null
        and v_lane.next_due_at <= clock_timestamp())
    ))
  ) then raise exception 'REQUEST_AUTH_HEALTH_BLOCKED'; end if;

  if v_work_unit.lease_expires_at <= v_now
    or v_connection_account.valid_from > v_now
    or (v_connection_account.valid_to is not null
      and v_connection_account.valid_to <= v_now)
    or v_integrity_key.status <> 'active'
    or v_integrity_key.valid_from > v_now
    or (v_integrity_key.valid_to is not null and v_integrity_key.valid_to <= v_now)
  then raise exception 'REQUEST_AUTH_TIME_AUTHORITY_EXPIRED'; end if;

  insert into public.broker_capture_request_authorizations (
    id, user_id, broker_account_id, activation_series_id,
    sync_activation_id, activation_generation, run_id, scope_id,
    work_unit_id, lane_requirement_id, lane_state_id, policy_generation,
    authority_digest, work_unit_row_version, request_sequence,
    lease_token_digest, checkpoint_mac, page_scope_digest,
    series_row_version, authority_epoch, activation_row_version,
    active_credential_id, active_credential_key_version, provider_code,
    provider_contract_version, capability_id,
    authorization_contract_version, consumed_at, send_deadline_at
  ) values (
    p_request_authorization_id, v_work_unit.user_id,
    v_work_unit.broker_account_id, v_series.id, v_activation.id,
    v_activation.activation_generation, v_work_unit.run_id,
    v_work_unit.scope_id, v_work_unit.id, v_work_unit.lane_requirement_id,
    v_work_unit.lane_state_id, v_work_unit.policy_generation,
    v_work_unit.authority_digest, v_work_unit.row_version, p_request_sequence,
    v_lease_digest, v_work_unit.checkpoint_mac,
    v_work_unit.checkpoint ->> 'scopeDigest', v_series.series_row_version,
    v_series.authority_epoch, v_activation.activation_row_version,
    v_activation.active_credential_id, v_activation.active_credential_key_version,
    v_activation.provider_code, v_activation.provider_contract_version,
    v_scope.capability_id, 'broker-request-authorization-v1',
    v_now, v_now + interval '5 seconds'
  );

  update public.broker_sync_activations
  set capture_health = v_derived_health
  where id = v_activation.id;

  return jsonb_build_object(
    'status', 'request_authorized',
    'requestAuthorizationId', p_request_authorization_id,
    'sendDeadlineAt', v_now + interval '5 seconds',
    'workUnitId', v_work_unit.id,
    'workUnitRowVersion', v_work_unit.row_version,
    'requestSequence', p_request_sequence,
    'syncActivationId', v_activation.id,
    'activationGeneration', v_activation.activation_generation,
    'seriesRowVersion', v_series.series_row_version,
    'authorityEpoch', v_series.authority_epoch,
    'capabilityId', v_scope.capability_id,
    'scopeDigest', v_scope.scope_digest,
    'pageScopeDigest', v_work_unit.checkpoint ->> 'scopeDigest',
    'credentialReference', jsonb_build_object(
      'id', v_activation.active_credential_id,
      'keyVersion', v_activation.active_credential_key_version
    ),
    'authorityBlocked', true
  );
exception
  when unique_violation then raise exception 'REQUEST_AUTH_ALREADY_CONSUMED';
  when lock_not_available then raise exception 'REQUEST_AUTH_LOCK_TIMEOUT';
  when query_canceled then raise exception 'REQUEST_AUTH_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_authorize_broker_capture_request_v1(
  uuid, bigint, integer, text, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.equora_authorize_broker_capture_request_v1(
  uuid, bigint, integer, text, uuid, uuid
) to service_role;

create or replace function public.equora_claim_broker_capture_work_unit_v2(
  p_work_unit_id uuid,
  p_expected_work_unit_row_version bigint,
  p_claim_request_id uuid,
  p_lease_token uuid,
  p_claim_policy_version text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_work_unit public.broker_capture_work_units%rowtype;
  v_run public.broker_capture_runs%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_lane public.broker_sync_lane_states%rowtype;
  v_health jsonb;
  v_derived_health text;
begin
  if p_work_unit_id is null then raise exception 'CONTROL_INVALID_INPUT'; end if;
  select * into v_work_unit from public.broker_capture_work_units
  where id = p_work_unit_id for update;
  if not found then raise exception 'CONTROL_WORK_UNIT_NOT_FOUND'; end if;
  select * into v_run from public.broker_capture_runs
  where id = v_work_unit.run_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found then raise exception 'CONTROL_RUN_INVALID'; end if;
  select series_row.* into v_series
  from public.broker_sync_activation_series series_row
  join public.broker_sync_activations activation_row
    on activation_row.activation_series_id = series_row.id
   and activation_row.user_id = series_row.user_id
   and activation_row.broker_account_id = series_row.broker_account_id
  where activation_row.id = v_work_unit.sync_activation_id
    and activation_row.activation_generation = v_work_unit.activation_generation
  for update of series_row;
  if not found then raise exception 'CONTROL_ACTIVATION_NOT_CURRENT'; end if;
  select * into v_activation from public.broker_sync_activations
  where id = v_work_unit.sync_activation_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found or v_activation.activation_state <> 'active'
    or v_activation.authority_contract_version <> 'broker-capture-authority-v1'
    or v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
    or v_work_unit.authority_contract_version <> 'broker-capture-authority-v1'
    or v_run.authority_contract_version <> 'broker-capture-authority-v1'
  then raise exception 'CONTROL_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_lane from public.broker_sync_lane_states
  where id = v_work_unit.lane_state_id
    and lane_requirement_id = v_work_unit.lane_requirement_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation;
  if not found or v_lane.superseded_at is not null
    or v_lane.policy_generation <> v_work_unit.policy_generation
    or v_lane.lane_id <> v_work_unit.lane_id
  then raise exception 'CONTROL_SCOPE_INVALID'; end if;

  v_health := public.equora_derive_capture_health_at_v1(
    v_activation.id, clock_timestamp()
  );
  v_derived_health := v_health ->> 'health';
  if not (
    v_derived_health = 'healthy'
    or (v_derived_health = 'pending'
      and v_lane.observation_status = 'not_observed')
    or (v_derived_health = 'degraded' and (
      v_run.trigger_kind = 'recovery'
      or v_run.lane_id in ('rolling_audit_7d_daily', 'rolling_audit_28d_weekly')
      or (v_run.trigger_kind in ('scheduler', 'startup_catchup')
        and v_lane.next_due_at is not null
        and v_lane.next_due_at <= clock_timestamp())
    ))
  ) then raise exception 'CONTROL_HEALTH_BLOCKED'; end if;

  update public.broker_sync_activations
  set capture_health = v_derived_health where id = v_activation.id;
  return public.equora_claim_broker_capture_work_unit_v1(
    p_work_unit_id, p_expected_work_unit_row_version, p_claim_request_id,
    p_lease_token, p_claim_policy_version
  );
exception
  when lock_not_available then raise exception 'CONTROL_LOCK_TIMEOUT';
  when query_canceled then raise exception 'CONTROL_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_claim_broker_capture_work_unit_v1(
  uuid, bigint, uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.equora_claim_broker_capture_work_unit_v2(
  uuid, bigint, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.equora_claim_broker_capture_work_unit_v2(
  uuid, bigint, uuid, uuid, text
) to service_role;

create or replace function public.equora_commit_broker_capture_page_v2(
  p_request_authorization_id uuid,
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
  v_work_unit public.broker_capture_work_units%rowtype;
  v_run public.broker_capture_runs%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_lane public.broker_sync_lane_states%rowtype;
  v_authorization public.broker_capture_request_authorizations%rowtype;
  v_account_lease record;
  v_account_lease_row_count bigint := 0;
  v_parent_chain_valid boolean := false;
  v_health jsonb;
  v_derived_health text;
  v_input_payload jsonb;
  v_input_digest text;
  v_result jsonb;
begin
  if p_request_authorization_id is null
    or p_request_started_at is null
    or not isfinite(p_request_started_at)
  then
    raise exception 'CAPTURE_REQUEST_AUTHORIZATION_INVALID';
  end if;

  v_input_payload := jsonb_build_object(
      'requestAuthorizationId', p_request_authorization_id,
      'workUnitId', p_work_unit_id,
      'expectedRunId', p_expected_run_id,
      'expectedBrokerAccountId', p_expected_broker_account_id,
      'expectedConnectionAccountId', p_expected_connection_account_id,
      'expectedSyncActivationId', p_expected_sync_activation_id,
      'expectedActivationGeneration', p_expected_activation_generation,
      'expectedScopeDigest', p_expected_scope_digest,
      'transitionMacVersion', p_transition_mac_version,
      'transitionIntegrityKeyVersion', p_transition_integrity_key_version,
      'transitionMac', p_transition_mac,
      'leaseToken', p_lease_token,
      'expectedWorkUnitRowVersion', p_expected_work_unit_row_version,
      'expectedCheckpointMac', p_expected_checkpoint_mac,
      'expectedLedgerGeneration', p_expected_ledger_generation,
      'requestResultId', p_request_result_id,
      'requestSequence', p_request_sequence,
      'method', p_method,
      'requestOrigin', p_request_origin,
      'requestPath', p_request_path,
      'requestQuery', p_request_query,
      'transportContractVersion', p_transport_contract_version,
      'requestStartedAt', to_char(
        p_request_started_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'responseReceivedAt', case when p_response_received_at is null then null
        else to_char(
          p_response_received_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ) end,
      'requestDurationMs', p_request_duration_ms,
      'httpStatus', p_http_status,
      'providerStatusClass', p_provider_status_class,
      'responseClassification', p_response_classification,
      'rawBodyBase64', p_raw_body_base64,
      'rawBodyDigest', p_raw_body_digest,
      'rawBodyBytes', p_raw_body_bytes,
      'pageObservationDigest', p_page_observation_digest,
      'pageMetadata', p_page_metadata,
      'scopeCompleteness', p_scope_completeness,
      'nextCheckpoint', p_next_checkpoint,
      'nextCheckpointMac', p_next_checkpoint_mac,
      'nextCheckpointStatus', p_next_checkpoint_status,
      'nextCheckpointReason', p_next_checkpoint_reason,
      'nextPageNumber', p_next_page_number,
      'events', p_events
    );
  v_input_digest := public.equora_authority_mutation_digest_v1(
    'commit_page_v2', v_input_payload
  );

  -- Replay is authorized by the append-once receipt, not by a Lease that the
  -- successful Page may already have terminalized. This also survives a later
  -- lifecycle/policy change without reopening any state authority.
  select * into v_authorization
  from public.broker_capture_request_authorizations
  where id = p_request_authorization_id;
  if found and v_authorization.page_commit_input_digest is not null then
    if v_authorization.page_commit_input_digest is distinct from v_input_digest
    then raise exception 'CAPTURE_PAGE_REPLAY_MISMATCH'; end if;
    return v_authorization.page_commit_result;
  end if;

  select * into v_work_unit from public.broker_capture_work_units
  where id = p_work_unit_id for update;
  if not found then raise exception 'CAPTURE_WORK_UNIT_NOT_FOUND'; end if;

  -- A concurrent first writer may have committed while this call waited for
  -- the Work-Unit lock. The immutable Receipt wins before any mutable parent,
  -- lifecycle, policy, health, Scope or Lease authority is re-evaluated. This
  -- read deliberately takes no Authorization lock: the Work-Unit lock already
  -- serialized the Page writer and the global Work-Unit -> Run lock order stays
  -- unchanged.
  select * into v_authorization
  from public.broker_capture_request_authorizations
  where id = p_request_authorization_id;
  if found and v_authorization.page_commit_input_digest is not null then
    if v_authorization.page_commit_input_digest is distinct from v_input_digest
    then raise exception 'CAPTURE_PAGE_REPLAY_MISMATCH'; end if;
    return v_authorization.page_commit_result;
  end if;

  select * into v_run from public.broker_capture_runs
  where id = v_work_unit.run_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found then raise exception 'CAPTURE_RUN_INVALID'; end if;
  select series_row.* into v_series
  from public.broker_sync_activation_series series_row
  join public.broker_sync_activations activation_row
    on activation_row.activation_series_id = series_row.id
   and activation_row.user_id = series_row.user_id
   and activation_row.broker_account_id = series_row.broker_account_id
  where activation_row.id = v_work_unit.sync_activation_id
    and activation_row.activation_generation = v_work_unit.activation_generation
  for update of series_row;
  if not found then raise exception 'CAPTURE_ACTIVATION_NOT_CURRENT'; end if;
  select * into v_activation from public.broker_sync_activations
  where id = v_work_unit.sync_activation_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found or v_activation.activation_state <> 'active'
    or v_activation.authority_contract_version <> 'broker-capture-authority-v1'
    or v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
  then raise exception 'CAPTURE_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_lane from public.broker_sync_lane_states
  where id = v_work_unit.lane_state_id
    and lane_requirement_id = v_work_unit.lane_requirement_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation;
  if not found or v_lane.superseded_at is not null
    or v_lane.policy_generation <> v_work_unit.policy_generation
  then raise exception 'CAPTURE_POLICY_NOT_CURRENT'; end if;

  if to_regclass('public.broker_capture_account_leases') is not null then
    if to_regprocedure(
      'public.equora_lock_capture_parent_chain_v1(uuid,timestamptz)'
    ) is null then
      raise exception 'CAPTURE_PARENT_AUTHORITY_MISSING';
    end if;
    execute 'select public.equora_lock_capture_parent_chain_v1($1,$2)'
      into v_parent_chain_valid
      using v_work_unit.id, p_request_started_at;
    if v_parent_chain_valid is distinct from true then
      raise exception 'CAPTURE_PARENT_AUTHORITY_INVALID';
    end if;
    execute $account_lease$
      select account_lease.*
      from public.broker_capture_account_leases account_lease
      where account_lease.broker_account_id = $1
        and account_lease.sync_kind = 'provider_api_observation'
      for update
    $account_lease$
    into v_account_lease
    using v_work_unit.broker_account_id;
    get diagnostics v_account_lease_row_count = row_count;
    if v_account_lease_row_count <> 1
      or v_account_lease.state is distinct from 'leased'
      or v_account_lease.user_id is distinct from v_work_unit.user_id
      or v_account_lease.sync_activation_id is distinct from v_activation.id
      or v_account_lease.activation_generation
        is distinct from v_activation.activation_generation
      or v_account_lease.work_unit_id is distinct from v_work_unit.id
      or v_account_lease.run_id is distinct from v_work_unit.run_id
      or v_account_lease.scope_id is distinct from v_work_unit.scope_id
      or v_account_lease.lane_state_id is distinct from v_work_unit.lane_state_id
      or v_account_lease.policy_generation
        is distinct from v_work_unit.policy_generation
      or v_account_lease.work_unit_row_version
        is distinct from v_work_unit.row_version
      or v_account_lease.lease_epoch is distinct from v_work_unit.lease_epoch
      or v_account_lease.lease_token_digest is null
      or not public.equora_constant_time_hex_equal_v1(
        v_account_lease.lease_token_digest,
        public.equora_lease_token_digest_v1(p_lease_token)
      )
      or v_account_lease.lease_expires_at is distinct from v_work_unit.lease_expires_at
      or v_account_lease.lease_acquired_at is distinct from v_work_unit.lease_acquired_at
      or v_account_lease.lease_max_expires_at
        is distinct from v_work_unit.lease_max_expires_at
      or v_account_lease.lease_renew_count
        is distinct from v_work_unit.lease_renew_count
      or v_account_lease.lease_policy_version is distinct from 'lease-control-v1'
    then raise exception 'CAPTURE_ACCOUNT_LEASE_INVALID'; end if;
  end if;

  v_health := public.equora_derive_capture_health_at_v1(
    v_activation.id, clock_timestamp()
  );
  v_derived_health := v_health ->> 'health';
  if not (
    v_derived_health = 'healthy'
    or (v_derived_health = 'pending' and v_lane.observation_status = 'not_observed')
    or (v_derived_health = 'degraded' and (
      v_run.trigger_kind = 'recovery'
      or v_run.lane_id in ('rolling_audit_7d_daily', 'rolling_audit_28d_weekly')
      or (v_run.trigger_kind in ('scheduler', 'startup_catchup')
        and v_lane.next_due_at is not null
        and v_lane.next_due_at <= clock_timestamp())
    ))
  ) then raise exception 'CAPTURE_HEALTH_BLOCKED'; end if;

  select * into v_authorization
  from public.broker_capture_request_authorizations
  where id = p_request_authorization_id
  for update;
  -- A concurrent first writer may have completed while this call waited on an
  -- earlier Work-Unit/Run lock. Recheck the append-once receipt under lock.
  if found and v_authorization.page_commit_input_digest is not null then
    if v_authorization.page_commit_input_digest is distinct from v_input_digest
    then raise exception 'CAPTURE_PAGE_REPLAY_MISMATCH'; end if;
    return v_authorization.page_commit_result;
  end if;
  if not found
    or v_authorization.work_unit_id <> v_work_unit.id
    or v_authorization.run_id <> v_work_unit.run_id
    or v_authorization.scope_id <> v_work_unit.scope_id
    or v_authorization.sync_activation_id <> v_activation.id
    or v_authorization.activation_generation <> v_activation.activation_generation
    or v_authorization.work_unit_row_version <> p_expected_work_unit_row_version
    or v_authorization.request_sequence <> p_request_sequence
    or v_authorization.checkpoint_mac <> p_expected_checkpoint_mac
    or v_authorization.lane_requirement_id <> v_work_unit.lane_requirement_id
    or v_authorization.lane_state_id <> v_work_unit.lane_state_id
    or v_authorization.policy_generation <> v_work_unit.policy_generation
    or v_authorization.authority_digest <> v_work_unit.authority_digest
    or v_authorization.series_row_version <> v_series.series_row_version
    or v_authorization.authority_epoch <> v_series.authority_epoch
    or v_authorization.activation_row_version <> v_activation.activation_row_version
    or p_request_started_at < v_authorization.consumed_at
    or p_request_started_at > v_authorization.send_deadline_at
  then raise exception 'CAPTURE_REQUEST_AUTHORIZATION_INVALID'; end if;

  update public.broker_sync_activations
  set capture_health = v_derived_health where id = v_activation.id;
  v_result := public.equora_commit_broker_capture_page_v1(
    p_work_unit_id, p_expected_run_id, p_expected_broker_account_id,
    p_expected_connection_account_id, p_expected_sync_activation_id,
    p_expected_activation_generation, p_expected_scope_digest,
    p_transition_mac_version, p_transition_integrity_key_version,
    p_transition_mac, p_lease_token, p_expected_work_unit_row_version,
    p_expected_checkpoint_mac, p_expected_ledger_generation,
    p_request_result_id, p_request_sequence, p_method, p_request_origin,
    p_request_path, p_request_query, p_transport_contract_version,
    p_request_started_at, p_response_received_at, p_request_duration_ms,
    p_http_status, p_provider_status_class, p_response_classification,
    p_raw_body_base64, p_raw_body_digest, p_raw_body_bytes,
    p_page_observation_digest, p_page_metadata, p_scope_completeness,
    p_next_checkpoint, p_next_checkpoint_mac, p_next_checkpoint_status,
    p_next_checkpoint_reason, p_next_page_number, p_events
  );
  update public.broker_capture_request_authorizations
  set page_commit_input_digest = v_input_digest,
      page_commit_result = v_result,
      page_committed_at = clock_timestamp()
  where id = v_authorization.id
    and page_commit_input_digest is null
    and page_commit_result is null
    and page_committed_at is null;
  if not found then raise exception 'CAPTURE_PAGE_REPLAY_RACE'; end if;
  return v_result;
exception
  when lock_not_available then raise exception 'CAPTURE_LOCK_TIMEOUT';
  when query_canceled then raise exception 'CAPTURE_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_commit_broker_capture_page_v1(
  uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,
  uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,
  text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.equora_commit_broker_capture_page_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,
  uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,
  text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.equora_commit_broker_capture_page_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,
  uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,
  text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb
) to service_role;

create or replace function public.equora_record_broker_capture_failure_v2(
  p_request_authorization_id uuid,
  p_request_started_at timestamptz,
  p_work_unit_id uuid,
  p_expected_work_unit_row_version bigint,
  p_outcome_id uuid,
  p_lease_token uuid,
  p_request_sequence integer,
  p_expected_checkpoint_mac text,
  p_expected_capability_id text,
  p_expected_page_scope_digest text,
  p_failure_code text,
  p_http_status integer,
  p_response_bytes integer,
  p_request_duration_ms integer,
  p_failure_policy_version text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_work_unit public.broker_capture_work_units%rowtype;
  v_run public.broker_capture_runs%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_lane public.broker_sync_lane_states%rowtype;
  v_authorization public.broker_capture_request_authorizations%rowtype;
  v_account_lease record;
  v_account_lease_row_count bigint := 0;
  v_parent_chain_valid boolean := false;
  v_health jsonb;
  v_derived_health text;
begin
  if p_request_authorization_id is null or p_request_started_at is null
    or not isfinite(p_request_started_at)
  then raise exception 'CONTROL_REQUEST_AUTHORIZATION_INVALID'; end if;

  if exists (
    select 1 from public.broker_capture_attempt_outcomes
    where id = p_outcome_id
      and work_unit_id = p_work_unit_id
      and request_sequence = p_request_sequence
  ) then
    return public.equora_record_broker_capture_failure_v1(
      p_work_unit_id, p_expected_work_unit_row_version, p_outcome_id,
      p_lease_token, p_request_sequence, p_expected_checkpoint_mac,
      p_expected_capability_id, p_expected_page_scope_digest,
      p_failure_code, p_http_status, p_response_bytes,
      p_request_duration_ms, p_failure_policy_version
    );
  end if;

  select * into v_work_unit from public.broker_capture_work_units
  where id = p_work_unit_id for update;
  if not found then raise exception 'CONTROL_WORK_UNIT_NOT_FOUND'; end if;
  select * into v_run from public.broker_capture_runs
  where id = v_work_unit.run_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found then raise exception 'CONTROL_RUN_INVALID'; end if;
  select series_row.* into v_series
  from public.broker_sync_activation_series series_row
  join public.broker_sync_activations activation_row
    on activation_row.activation_series_id = series_row.id
   and activation_row.user_id = series_row.user_id
   and activation_row.broker_account_id = series_row.broker_account_id
  where activation_row.id = v_work_unit.sync_activation_id
    and activation_row.activation_generation = v_work_unit.activation_generation
  for update of series_row;
  if not found then raise exception 'CONTROL_ACTIVATION_NOT_CURRENT'; end if;
  select * into v_activation from public.broker_sync_activations
  where id = v_work_unit.sync_activation_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found or v_activation.activation_state <> 'active'
    or v_activation.authority_contract_version <> 'broker-capture-authority-v1'
    or v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
  then raise exception 'CONTROL_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_lane from public.broker_sync_lane_states
  where id = v_work_unit.lane_state_id
    and lane_requirement_id = v_work_unit.lane_requirement_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation;
  if not found or v_lane.superseded_at is not null
    or v_lane.policy_generation <> v_work_unit.policy_generation
  then raise exception 'CONTROL_POLICY_NOT_CURRENT'; end if;

  if to_regclass('public.broker_capture_account_leases') is not null then
    if to_regprocedure(
      'public.equora_lock_capture_parent_chain_v1(uuid,timestamptz)'
    ) is null then
      raise exception 'FAILURE_PARENT_AUTHORITY_MISSING';
    end if;
    execute 'select public.equora_lock_capture_parent_chain_v1($1,$2)'
      into v_parent_chain_valid
      using v_work_unit.id, p_request_started_at;
    if v_parent_chain_valid is distinct from true then
      raise exception 'FAILURE_PARENT_AUTHORITY_INVALID';
    end if;
    execute $account_lease$
      select account_lease.*
      from public.broker_capture_account_leases account_lease
      where account_lease.broker_account_id = $1
        and account_lease.sync_kind = 'provider_api_observation'
      for update
    $account_lease$
    into v_account_lease
    using v_work_unit.broker_account_id;
    get diagnostics v_account_lease_row_count = row_count;
    if v_account_lease_row_count <> 1
      or v_account_lease.state is distinct from 'leased'
      or v_account_lease.user_id is distinct from v_work_unit.user_id
      or v_account_lease.sync_activation_id is distinct from v_activation.id
      or v_account_lease.activation_generation
        is distinct from v_activation.activation_generation
      or v_account_lease.work_unit_id is distinct from v_work_unit.id
      or v_account_lease.run_id is distinct from v_work_unit.run_id
      or v_account_lease.scope_id is distinct from v_work_unit.scope_id
      or v_account_lease.lane_state_id is distinct from v_work_unit.lane_state_id
      or v_account_lease.policy_generation
        is distinct from v_work_unit.policy_generation
      or v_account_lease.work_unit_row_version
        is distinct from v_work_unit.row_version
      or v_account_lease.lease_epoch is distinct from v_work_unit.lease_epoch
      or v_account_lease.lease_token_digest is null
      or not public.equora_constant_time_hex_equal_v1(
        v_account_lease.lease_token_digest,
        public.equora_lease_token_digest_v1(p_lease_token)
      )
      or v_account_lease.lease_expires_at is distinct from v_work_unit.lease_expires_at
      or v_account_lease.lease_acquired_at is distinct from v_work_unit.lease_acquired_at
      or v_account_lease.lease_max_expires_at
        is distinct from v_work_unit.lease_max_expires_at
      or v_account_lease.lease_renew_count
        is distinct from v_work_unit.lease_renew_count
      or v_account_lease.lease_policy_version is distinct from 'lease-control-v1'
    then raise exception 'FAILURE_ACCOUNT_LEASE_INVALID'; end if;
  end if;

  v_health := public.equora_derive_capture_health_at_v1(
    v_activation.id, clock_timestamp()
  );
  v_derived_health := v_health ->> 'health';
  if not (
    v_derived_health = 'healthy'
    or (v_derived_health = 'pending' and v_lane.observation_status = 'not_observed')
    or (v_derived_health = 'degraded' and (
      v_run.trigger_kind = 'recovery'
      or v_run.lane_id in ('rolling_audit_7d_daily', 'rolling_audit_28d_weekly')
      or (v_run.trigger_kind in ('scheduler', 'startup_catchup')
        and v_lane.next_due_at is not null
        and v_lane.next_due_at <= clock_timestamp())
    ))
  ) then raise exception 'CONTROL_HEALTH_BLOCKED'; end if;

  select * into v_authorization
  from public.broker_capture_request_authorizations
  where id = p_request_authorization_id
  for update;
  if not found
    or v_authorization.work_unit_id <> v_work_unit.id
    or v_authorization.run_id <> v_work_unit.run_id
    or v_authorization.scope_id <> v_work_unit.scope_id
    or v_authorization.sync_activation_id <> v_activation.id
    or v_authorization.activation_generation <> v_activation.activation_generation
    or v_authorization.work_unit_row_version <> p_expected_work_unit_row_version
    or v_authorization.request_sequence <> p_request_sequence
    or v_authorization.checkpoint_mac <> p_expected_checkpoint_mac
    or v_authorization.page_scope_digest <> p_expected_page_scope_digest
    or v_authorization.capability_id <> p_expected_capability_id
    or v_authorization.series_row_version <> v_series.series_row_version
    or v_authorization.authority_epoch <> v_series.authority_epoch
    or v_authorization.activation_row_version <> v_activation.activation_row_version
    or p_request_started_at < v_authorization.consumed_at
    or p_request_started_at > v_authorization.send_deadline_at
  then raise exception 'CONTROL_REQUEST_AUTHORIZATION_INVALID'; end if;

  update public.broker_sync_activations
  set capture_health = v_derived_health where id = v_activation.id;
  return public.equora_record_broker_capture_failure_v1(
    p_work_unit_id, p_expected_work_unit_row_version, p_outcome_id,
    p_lease_token, p_request_sequence, p_expected_checkpoint_mac,
    p_expected_capability_id, p_expected_page_scope_digest,
    p_failure_code, p_http_status, p_response_bytes,
    p_request_duration_ms, p_failure_policy_version
  );
exception
  when lock_not_available then raise exception 'CONTROL_LOCK_TIMEOUT';
  when query_canceled then raise exception 'CONTROL_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_record_broker_capture_failure_v1(
  uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text
) from public, anon, authenticated, service_role;
revoke all on function public.equora_record_broker_capture_failure_v2(
  uuid,timestamptz,uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,
  integer,integer,text
) from public, anon, authenticated, service_role;
grant execute on function public.equora_record_broker_capture_failure_v2(
  uuid,timestamptz,uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,
  integer,integer,text
) to service_role;

grant usage on schema public, equora_private, auth
  to equora_broker_capture_owner;
grant execute on function auth.uid() to equora_broker_capture_owner;
-- Required by PostgreSQL only while function ownership is transferred. It is
-- revoked below before the migration commits and is covered by postflight.
grant create on schema public to equora_broker_capture_owner;
-- The authority-table owner is itself an authority boundary. The preflight
-- rejects drift before any table DDL; healthy fresh and rerun paths pin the
-- intended owner again before ACL normalization.
alter table public.broker_sync_activation_commands owner to postgres;
alter table public.broker_sync_authority_mutation_receipts owner to postgres;
alter table public.broker_capture_request_authorizations owner to postgres;
-- Remove every inherited, default-privilege or drifted grant from the three
-- new authority tables. The exact function-owner grants are reapplied below.
do $$
declare
  v_relation regclass;
  v_acl record;
begin
  foreach v_relation in array array[
    'public.broker_sync_activation_commands'::regclass,
    'public.broker_sync_authority_mutation_receipts'::regclass,
    'public.broker_capture_request_authorizations'::regclass
  ]
  loop
    for v_acl in
      select distinct expanded.grantee, grantee_role.rolname
      from pg_class relation_row
      cross join lateral aclexplode(
        coalesce(
          relation_row.relacl,
          acldefault('r', relation_row.relowner)
        )
      ) expanded
      left join pg_roles grantee_role on grantee_role.oid = expanded.grantee
      where relation_row.oid = v_relation
        and expanded.grantee <> relation_row.relowner
    loop
      if v_acl.grantee = 0 then
        execute format(
          'revoke all privileges on table %s from public', v_relation
        );
      elsif v_acl.rolname is not null then
        execute format(
          'revoke all privileges on table %s from %I',
          v_relation, v_acl.rolname
        );
      else
        raise exception 'ACTIVATION_AUTHORITY_TABLE_ACL_GRANTEE_INVALID';
      end if;
    end loop;
  end loop;
end;
$$;
-- Normalize privileges on rerun before applying the exact least-privilege
-- allowlist. No activation-authority function deletes authority evidence.
revoke all on table
  public.broker_sync_activation_commands,
  public.broker_sync_activation_series,
  public.broker_sync_activations,
  public.broker_connection_accounts,
  public.broker_connections,
  public.broker_credentials,
  equora_private.broker_capture_integrity_keys,
  public.broker_accounts,
  public.broker_providers,
  public.broker_sync_scopes,
  public.broker_capture_runs,
  public.broker_capture_work_units,
  public.broker_sync_lane_requirements,
  public.broker_sync_lane_states,
  public.broker_sync_gaps,
  public.broker_sync_authority_mutation_receipts,
  public.broker_capture_request_authorizations,
  public.broker_provider_request_results,
  public.broker_capture_attempt_outcomes
from equora_broker_capture_owner;
grant select on table
  public.broker_sync_activation_commands,
  public.broker_sync_activation_series,
  public.broker_sync_activations,
  public.broker_connection_accounts,
  public.broker_connections,
  public.broker_credentials,
  equora_private.broker_capture_integrity_keys,
  public.broker_accounts,
  public.broker_providers,
  public.broker_sync_scopes,
  public.broker_capture_runs,
  public.broker_capture_work_units,
  public.broker_sync_lane_requirements,
  public.broker_sync_lane_states,
  public.broker_sync_gaps,
  public.broker_sync_authority_mutation_receipts,
  public.broker_capture_request_authorizations,
  public.broker_provider_request_results,
  public.broker_capture_attempt_outcomes
to equora_broker_capture_owner;
grant insert on table
  public.broker_sync_activation_commands,
  public.broker_sync_activation_series,
  public.broker_sync_activations,
  public.broker_sync_lane_requirements,
  public.broker_sync_lane_states,
  public.broker_sync_gaps,
  public.broker_sync_authority_mutation_receipts,
  public.broker_capture_request_authorizations
to equora_broker_capture_owner;
-- A late scheduler-control layer materializes only new immutable request rows.
-- Preserve its narrow INSERT authority when this prerequisite migration is
-- deliberately re-run after the downstream marker already exists.
do $$
begin
  if to_regclass('public.broker_capture_schedule_occurrences') is not null then
    grant insert on table
      public.broker_sync_scopes,
      public.broker_capture_runs,
      public.broker_capture_work_units
    to equora_broker_capture_owner;
  end if;
end;
$$;
grant update on table
  public.broker_sync_activation_commands,
  public.broker_sync_activation_series,
  public.broker_sync_activations,
  public.broker_connection_accounts,
  public.broker_connections,
  public.broker_credentials,
  equora_private.broker_capture_integrity_keys,
  public.broker_accounts,
  public.broker_providers,
  public.broker_sync_scopes,
  public.broker_capture_runs,
  public.broker_capture_work_units,
  public.broker_sync_lane_requirements,
  public.broker_sync_lane_states,
  public.broker_sync_gaps,
  public.broker_capture_request_authorizations
to equora_broker_capture_owner;

do $$
declare
  v_signature text;
  v_procedure regprocedure;
begin
  foreach v_signature in array array[
    'public.equora_pgcrypto_digest_v1(bytea,text)',
    'public.equora_jsonb_exact_keys_v1(jsonb,text[])',
    'public.equora_mexc_permission_evidence_valid_v1(jsonb,text,timestamptz,timestamptz,jsonb)',
    'public.equora_derive_capture_health_at_v1(uuid,timestamptz)',
    'public.equora_lane_watermark_digest_v1(uuid,integer,uuid,text,text,text,text,text,bigint,text,bigint,text,text)',
    'public.equora_gap_resolution_digest_v1(uuid,uuid,integer,uuid,text,text,text,text,text,bigint,bigint,bigint,boolean,boolean,text,uuid,text,text)',
    'public.equora_lease_token_digest_v1(uuid)',
    'public.equora_constant_time_hex_equal_v1(text,text)',
    'public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)',
    'public.equora_commit_broker_capture_page_v1(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)',
    'public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)'
  ]::text[]
  loop
    v_procedure := to_regprocedure(v_signature);
    if v_procedure is null then
      raise exception 'ACTIVATION_AUTHORITY_DEPENDENCY_SIGNATURE_MISSING: %',
        v_signature;
    end if;
    execute format(
      'grant execute on function %s to equora_broker_capture_owner',
      v_procedure
    );
  end loop;

  foreach v_signature in array array[
    'public.equora_request_broker_sync_activation_v1(uuid,text,bigint,bigint,uuid)',
    'public.equora_apply_broker_sync_activation_command_v1(uuid)',
    'public.equora_upsert_broker_sync_lane_requirement_v1(uuid,bigint,bigint,text,text,text,uuid)',
    'public.equora_record_broker_sync_lane_success_v1(uuid,uuid,bigint,bigint,bigint,bigint,text,uuid)',
    'public.equora_record_broker_sync_lane_failure_v1(uuid,bigint,bigint,bigint,text,uuid)',
    'public.equora_open_broker_sync_gap_v1(uuid,uuid,bigint,bigint,bigint,bigint,bigint,boolean,boolean,text,text,uuid)',
    'public.equora_escalate_broker_sync_gap_v1(uuid,text,text,bigint,bigint,bigint,bigint,uuid)',
    'public.equora_reconcile_broker_sync_gap_v1(uuid,uuid,bigint,bigint,bigint,uuid)',
    'public.equora_authorize_broker_capture_request_v1(uuid,bigint,integer,text,uuid,uuid)',
    'public.equora_claim_broker_capture_work_unit_v2(uuid,bigint,uuid,uuid,text)',
    'public.equora_commit_broker_capture_page_v2(uuid,uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)',
    'public.equora_record_broker_capture_failure_v2(uuid,timestamptz,uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)',
    'public.equora_activation_command_digest_v1(uuid,uuid,uuid,uuid,text,bigint,bigint)',
    'public.equora_authority_mutation_digest_v1(text,jsonb)',
    'public.equora_capture_authority_digest_v1(uuid,integer,uuid,uuid,uuid,bigint,text,text,text,text,text,text)'
  ]::text[]
  loop
    v_procedure := to_regprocedure(v_signature);
    if v_procedure is null then
      raise exception 'ACTIVATION_AUTHORITY_OWNED_SIGNATURE_MISSING: %',
        v_signature;
    end if;
    execute format(
      'alter function %s owner to equora_broker_capture_owner',
      v_procedure
    );
  end loop;
end;
$$;

-- CREATE OR REPLACE preserves grants to arbitrary roles. Normalize every
-- owned authority function and each postgres-owned v1 core RPC against all
-- current grantees before reapplying only the intended grants.
do $$
declare
  v_signature text;
  v_procedure regprocedure;
  v_acl record;
begin
  foreach v_signature in array array[
    'public.equora_request_broker_sync_activation_v1(uuid,text,bigint,bigint,uuid)',
    'public.equora_apply_broker_sync_activation_command_v1(uuid)',
    'public.equora_upsert_broker_sync_lane_requirement_v1(uuid,bigint,bigint,text,text,text,uuid)',
    'public.equora_record_broker_sync_lane_success_v1(uuid,uuid,bigint,bigint,bigint,bigint,text,uuid)',
    'public.equora_record_broker_sync_lane_failure_v1(uuid,bigint,bigint,bigint,text,uuid)',
    'public.equora_open_broker_sync_gap_v1(uuid,uuid,bigint,bigint,bigint,bigint,bigint,boolean,boolean,text,text,uuid)',
    'public.equora_escalate_broker_sync_gap_v1(uuid,text,text,bigint,bigint,bigint,bigint,uuid)',
    'public.equora_reconcile_broker_sync_gap_v1(uuid,uuid,bigint,bigint,bigint,uuid)',
    'public.equora_authorize_broker_capture_request_v1(uuid,bigint,integer,text,uuid,uuid)',
    'public.equora_claim_broker_capture_work_unit_v2(uuid,bigint,uuid,uuid,text)',
    'public.equora_commit_broker_capture_page_v2(uuid,uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)',
    'public.equora_record_broker_capture_failure_v2(uuid,timestamptz,uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)',
    'public.equora_activation_command_digest_v1(uuid,uuid,uuid,uuid,text,bigint,bigint)',
    'public.equora_authority_mutation_digest_v1(text,jsonb)',
    'public.equora_capture_authority_digest_v1(uuid,integer,uuid,uuid,uuid,bigint,text,text,text,text,text,text)',
    'public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)',
    'public.equora_commit_broker_capture_page_v1(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)',
    'public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)'
  ]::text[]
  loop
    v_procedure := to_regprocedure(v_signature);
    if v_procedure is null then
      raise exception 'ACTIVATION_AUTHORITY_OWNED_SIGNATURE_MISSING: %',
        v_signature;
    end if;
    for v_acl in
      select distinct expanded.grantee, grantee_role.rolname
      from pg_proc procedure_row
      cross join lateral aclexplode(
        coalesce(
          procedure_row.proacl,
          acldefault('f', procedure_row.proowner)
        )
      ) expanded
      left join pg_roles grantee_role on grantee_role.oid = expanded.grantee
      where procedure_row.oid = v_procedure
        and expanded.grantee <> procedure_row.proowner
    loop
      if v_acl.grantee = 0 then
        execute format(
          'revoke all privileges on function %s from public', v_procedure
        );
      elsif v_acl.rolname is not null then
        execute format(
          'revoke all privileges on function %s from %I',
          v_procedure, v_acl.rolname
        );
      else
        raise exception 'ACTIVATION_AUTHORITY_FUNCTION_ACL_GRANTEE_INVALID';
      end if;
    end loop;
  end loop;
end;
$$;

grant execute on function public.equora_claim_broker_capture_work_unit_v1(
  uuid, bigint, uuid, uuid, text
) to equora_broker_capture_owner;
grant execute on function public.equora_commit_broker_capture_page_v1(
  uuid, uuid, uuid, uuid, uuid, integer, text, text, text, text, uuid, bigint,
  text, bigint, uuid, integer, text, text, text, jsonb, text, timestamptz,
  timestamptz, integer, integer, text, text, text, text, integer, text, jsonb,
  text, jsonb, text, text, text, integer, jsonb
) to equora_broker_capture_owner;
grant execute on function public.equora_record_broker_capture_failure_v1(
  uuid, bigint, uuid, uuid, integer, text, text, text, text, integer, integer,
  integer, text
) to equora_broker_capture_owner;

grant execute on function public.equora_request_broker_sync_activation_v1(
  uuid, text, bigint, bigint, uuid
) to authenticated;

do $$
declare
  v_signature text;
  v_procedure regprocedure;
begin
  foreach v_signature in array array[
    'public.equora_apply_broker_sync_activation_command_v1(uuid)',
    'public.equora_upsert_broker_sync_lane_requirement_v1(uuid,bigint,bigint,text,text,text,uuid)',
    'public.equora_record_broker_sync_lane_success_v1(uuid,uuid,bigint,bigint,bigint,bigint,text,uuid)',
    'public.equora_record_broker_sync_lane_failure_v1(uuid,bigint,bigint,bigint,text,uuid)',
    'public.equora_open_broker_sync_gap_v1(uuid,uuid,bigint,bigint,bigint,bigint,bigint,boolean,boolean,text,text,uuid)',
    'public.equora_escalate_broker_sync_gap_v1(uuid,text,text,bigint,bigint,bigint,bigint,uuid)',
    'public.equora_reconcile_broker_sync_gap_v1(uuid,uuid,bigint,bigint,bigint,uuid)',
    'public.equora_authorize_broker_capture_request_v1(uuid,bigint,integer,text,uuid,uuid)',
    'public.equora_claim_broker_capture_work_unit_v2(uuid,bigint,uuid,uuid,text)',
    'public.equora_commit_broker_capture_page_v2(uuid,uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)',
    'public.equora_record_broker_capture_failure_v2(uuid,timestamptz,uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)'
  ]::text[]
  loop
    v_procedure := to_regprocedure(v_signature);
    if v_procedure is null then
      raise exception 'ACTIVATION_AUTHORITY_SERVICE_SIGNATURE_MISSING: %',
        v_signature;
    end if;
    execute format(
      'grant execute on function %s to service_role', v_procedure
    );
  end loop;
end;
$$;

-- The migration/maintenance role may evaluate these immutable canonical
-- digests for fixtures and postflight. Runtime roles remain explicitly denied.
grant execute on function public.equora_activation_command_digest_v1(
  uuid, uuid, uuid, uuid, text, bigint, bigint
) to postgres;
grant execute on function public.equora_authority_mutation_digest_v1(text, jsonb)
  to postgres;
grant execute on function public.equora_capture_authority_digest_v1(
  uuid, integer, uuid, uuid, uuid, bigint, text, text, text, text, text, text
) to postgres;

do $$
begin
  revoke create on schema public from equora_broker_capture_owner;
  execute format(
    'revoke equora_broker_capture_owner from %I',
    current_user
  );
end;
$$;

insert into equora_private.schema_migrations (
  migration_id, contract_fingerprint
) values (
  'equora_v57.61.0_g1_activation_authority_v1',
    'ef73a48fb05299c4e78908fd1771c61ca1b8241b629cf31bc7f89af594d66c2c'
) on conflict (migration_id) do nothing;

do $$
declare
  v_expected_owned_functions text[] := array[
    'public.equora_request_broker_sync_activation_v1(uuid,text,bigint,bigint,uuid)',
    'public.equora_apply_broker_sync_activation_command_v1(uuid)',
    'public.equora_upsert_broker_sync_lane_requirement_v1(uuid,bigint,bigint,text,text,text,uuid)',
    'public.equora_record_broker_sync_lane_success_v1(uuid,uuid,bigint,bigint,bigint,bigint,text,uuid)',
    'public.equora_record_broker_sync_lane_failure_v1(uuid,bigint,bigint,bigint,text,uuid)',
    'public.equora_open_broker_sync_gap_v1(uuid,uuid,bigint,bigint,bigint,bigint,bigint,boolean,boolean,text,text,uuid)',
    'public.equora_escalate_broker_sync_gap_v1(uuid,text,text,bigint,bigint,bigint,bigint,uuid)',
    'public.equora_reconcile_broker_sync_gap_v1(uuid,uuid,bigint,bigint,bigint,uuid)',
    'public.equora_authorize_broker_capture_request_v1(uuid,bigint,integer,text,uuid,uuid)',
    'public.equora_claim_broker_capture_work_unit_v2(uuid,bigint,uuid,uuid,text)',
    'public.equora_commit_broker_capture_page_v2(uuid,uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)',
    'public.equora_record_broker_capture_failure_v2(uuid,timestamptz,uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)',
    'public.equora_activation_command_digest_v1(uuid,uuid,uuid,uuid,text,bigint,bigint)',
    'public.equora_authority_mutation_digest_v1(text,jsonb)',
    'public.equora_capture_authority_digest_v1(uuid,integer,uuid,uuid,uuid,bigint,text,text,text,text,text,text)'
  ];
  v_constraint_contract_fingerprint text;
  v_index_contract_fingerprint text;
  v_owner_membership_drift boolean := false;
begin
  if not exists (
    select 1 from equora_private.schema_migrations
    where migration_id = 'equora_v57.61.0_g1_activation_authority_v1'
        and contract_fingerprint =
          'ef73a48fb05299c4e78908fd1771c61ca1b8241b629cf31bc7f89af594d66c2c'
  )
    or to_regclass('public.broker_sync_activation_commands') is null
    or to_regclass('public.broker_sync_authority_mutation_receipts') is null
    or to_regclass('public.broker_capture_request_authorizations') is null
    or to_regclass('public.broker_sync_gaps_open_identity_unique') is null
    or to_regclass('public.idx_broker_sync_scopes_lane_authority_fkey') is null
    or to_regclass('public.idx_broker_capture_work_units_scope_authority_fkey') is null
  then
    raise exception 'ACTIVATION_AUTHORITY_CRITICAL_STRUCTURE_DRIFT';
  end if;

  if exists (
    select 1 from pg_attribute attribute_row
    where attribute_row.attrelid in (
      'public.broker_sync_scopes'::regclass,
      'public.broker_capture_runs'::regclass,
      'public.broker_capture_work_units'::regclass
    )
      and attribute_row.attname in (
        'lane_requirement_id', 'lane_state_id', 'policy_generation',
        'authority_contract_version', 'authority_digest',
        'authority_plan_digest'
      )
      and not attribute_row.attnotnull
  ) then
    raise exception 'ACTIVATION_AUTHORITY_NULLABLE_BINDING_DRIFT';
  end if;

  if exists (
    with expected_constraints(
      relation_name, constraint_name, constraint_type
    ) as (
      values
        ('broker_sync_activation_series', 'broker_sync_activation_series_authority_epoch_check', 'c'::"char"),
        ('broker_sync_activations', 'broker_sync_activations_authority_control_check', 'c'::"char"),
        ('broker_sync_scopes', 'broker_sync_scopes_lane_authority_fkey', 'f'::"char"),
        ('broker_sync_scopes', 'broker_sync_scopes_authority_reference_unique', 'u'::"char"),
        ('broker_sync_scopes', 'broker_sync_scopes_authority_contract_check', 'c'::"char"),
        ('broker_capture_runs', 'broker_capture_runs_authority_contract_check', 'c'::"char"),
        ('broker_capture_work_units', 'broker_capture_work_units_scope_authority_fkey', 'f'::"char"),
        ('broker_capture_work_units', 'broker_capture_work_units_authority_contract_check', 'c'::"char"),
        ('broker_sync_activation_commands', 'broker_sync_activation_commands_connection_fkey', 'f'::"char"),
        ('broker_sync_activation_commands', 'broker_sync_activation_commands_kind_check', 'c'::"char"),
        ('broker_sync_activation_commands', 'broker_sync_activation_commands_versions_check', 'c'::"char"),
        ('broker_sync_activation_commands', 'broker_sync_activation_commands_digest_check', 'c'::"char"),
        ('broker_sync_activation_commands', 'broker_sync_activation_commands_status_check', 'c'::"char"),
        ('broker_sync_activation_commands', 'broker_sync_activation_commands_result_check', 'c'::"char"),
        ('broker_sync_gaps', 'broker_sync_gaps_row_version_check', 'c'::"char"),
        ('broker_sync_authority_mutation_receipts', 'broker_sync_authority_receipts_activation_fkey', 'f'::"char"),
        ('broker_sync_authority_mutation_receipts', 'broker_sync_authority_receipts_kind_check', 'c'::"char"),
        ('broker_sync_authority_mutation_receipts', 'broker_sync_authority_receipts_digest_check', 'c'::"char"),
        ('broker_sync_authority_mutation_receipts', 'broker_sync_authority_receipts_result_check', 'c'::"char"),
        ('broker_sync_authority_mutation_receipts', 'broker_sync_authority_receipts_generation_check', 'c'::"char"),
        ('broker_capture_request_authorizations', 'broker_capture_request_auth_activation_fkey', 'f'::"char"),
        ('broker_capture_request_authorizations', 'broker_capture_request_auth_work_unit_fkey', 'f'::"char"),
        ('broker_capture_request_authorizations', 'broker_capture_request_auth_versions_check', 'c'::"char"),
        ('broker_capture_request_authorizations', 'broker_capture_request_auth_digests_check', 'c'::"char"),
        ('broker_capture_request_authorizations', 'broker_capture_request_auth_contract_check', 'c'::"char"),
        ('broker_capture_request_authorizations', 'broker_capture_request_auth_time_check', 'c'::"char"),
        ('broker_capture_request_authorizations', 'broker_capture_request_auth_page_receipt_check', 'c'::"char"),
        ('broker_capture_request_authorizations', 'broker_capture_request_auth_sequence_unique', 'u'::"char")
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
    raise exception 'ACTIVATION_AUTHORITY_CONSTRAINT_DRIFT';
  end if;

  with expected_constraints(relation_name, constraint_name) as (
    values
      ('broker_sync_activation_series', 'broker_sync_activation_series_authority_epoch_check'),
      ('broker_sync_activations', 'broker_sync_activations_authority_control_check'),
      ('broker_sync_scopes', 'broker_sync_scopes_lane_authority_fkey'),
      ('broker_sync_scopes', 'broker_sync_scopes_authority_reference_unique'),
      ('broker_sync_scopes', 'broker_sync_scopes_authority_contract_check'),
      ('broker_capture_runs', 'broker_capture_runs_authority_contract_check'),
      ('broker_capture_work_units', 'broker_capture_work_units_scope_authority_fkey'),
      ('broker_capture_work_units', 'broker_capture_work_units_authority_contract_check'),
      ('broker_sync_activation_commands', 'broker_sync_activation_commands_connection_fkey'),
      ('broker_sync_activation_commands', 'broker_sync_activation_commands_kind_check'),
      ('broker_sync_activation_commands', 'broker_sync_activation_commands_versions_check'),
      ('broker_sync_activation_commands', 'broker_sync_activation_commands_digest_check'),
      ('broker_sync_activation_commands', 'broker_sync_activation_commands_status_check'),
      ('broker_sync_activation_commands', 'broker_sync_activation_commands_result_check'),
      ('broker_sync_gaps', 'broker_sync_gaps_row_version_check'),
      ('broker_sync_authority_mutation_receipts', 'broker_sync_authority_receipts_activation_fkey'),
      ('broker_sync_authority_mutation_receipts', 'broker_sync_authority_receipts_kind_check'),
      ('broker_sync_authority_mutation_receipts', 'broker_sync_authority_receipts_digest_check'),
      ('broker_sync_authority_mutation_receipts', 'broker_sync_authority_receipts_result_check'),
      ('broker_sync_authority_mutation_receipts', 'broker_sync_authority_receipts_generation_check'),
      ('broker_capture_request_authorizations', 'broker_capture_request_auth_activation_fkey'),
      ('broker_capture_request_authorizations', 'broker_capture_request_auth_work_unit_fkey'),
      ('broker_capture_request_authorizations', 'broker_capture_request_auth_versions_check'),
      ('broker_capture_request_authorizations', 'broker_capture_request_auth_digests_check'),
      ('broker_capture_request_authorizations', 'broker_capture_request_auth_contract_check'),
      ('broker_capture_request_authorizations', 'broker_capture_request_auth_time_check'),
      ('broker_capture_request_authorizations', 'broker_capture_request_auth_page_receipt_check'),
      ('broker_capture_request_authorizations', 'broker_capture_request_auth_sequence_unique')
  )
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
  from expected_constraints expected
  join pg_namespace namespace_row on namespace_row.nspname = 'public'
  join pg_class relation_row
    on relation_row.relnamespace = namespace_row.oid
    and relation_row.relname = expected.relation_name
  join pg_constraint constraint_row
    on constraint_row.conrelid = relation_row.oid
    and constraint_row.conname = expected.constraint_name;

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
    and index_row.indexname in (
      'idx_broker_sync_scopes_lane_authority_fkey',
      'idx_broker_capture_work_units_scope_authority_fkey',
      'broker_sync_activation_commands_pkey',
      'idx_broker_sync_activation_commands_owner_created',
      'idx_broker_sync_activation_commands_connection_fkey',
      'broker_sync_gaps_open_identity_unique',
      'broker_sync_authority_mutation_receipts_pkey',
      'idx_broker_sync_authority_receipts_activation_fkey',
      'broker_capture_request_authorizations_pkey',
      'broker_capture_request_auth_sequence_unique',
      'idx_broker_capture_request_auth_activation_fkey',
      'idx_broker_capture_request_auth_work_unit_fkey'
    );

  if v_constraint_contract_fingerprint is distinct from
      '422d191c9a776fb11c27043e400b6401e1500e851185f942b557865929cba379'
  then
    raise exception 'ACTIVATION_AUTHORITY_CONSTRAINT_DEFINITION_DRIFT';
  end if;
  if v_index_contract_fingerprint is distinct from
      '4677767b03b0706b0eb3fbf5761cc48f312ef204b899843662bc661406bdfdcb'
  then
    raise exception 'ACTIVATION_AUTHORITY_INDEX_DEFINITION_DRIFT';
  end if;

  if exists (
    select 1 from pg_class relation_row
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    where namespace_row.nspname = 'public'
      and relation_row.relname in (
        'broker_sync_activation_commands',
        'broker_sync_authority_mutation_receipts',
        'broker_capture_request_authorizations'
      )
      and not relation_row.relrowsecurity
  ) then
    raise exception 'ACTIVATION_AUTHORITY_RLS_DRIFT';
  end if;

  -- PostgreSQL 16+ records an admin-only creator grant. It must remain both
  -- non-inherited and non-settable; older releases must have no membership.
  if current_setting('server_version_num')::integer >= 160000 then
    execute $membership$
      select exists (
        select 1
        from pg_auth_members membership_row
        join pg_roles member_role on member_role.oid = membership_row.member
        where membership_row.roleid = (
          select oid from pg_roles
          where rolname = 'equora_broker_capture_owner'
        )
          and (
            member_role.rolname is distinct from 'postgres'
            or not membership_row.admin_option
            or membership_row.inherit_option
            or membership_row.set_option
          )
      )
    $membership$ into v_owner_membership_drift;
  else
    select exists (
      select 1
      from pg_auth_members membership_row
      where membership_row.roleid = (
        select oid from pg_roles
        where rolname = 'equora_broker_capture_owner'
      )
    ) into v_owner_membership_drift;
  end if;

  if not exists (
      select 1
      from pg_roles role_row
      where role_row.rolname = 'equora_broker_capture_owner'
        and not role_row.rolcanlogin
        and not role_row.rolsuper
        and not role_row.rolcreatedb
        and not role_row.rolcreaterole
        and not role_row.rolreplication
        and not role_row.rolinherit
        and role_row.rolbypassrls
    )
    or v_owner_membership_drift
  then
    raise exception 'ACTIVATION_AUTHORITY_OWNER_ROLE_DRIFT';
  end if;

  if exists (
    select 1
    from unnest(v_expected_owned_functions) expected(function_signature)
    left join pg_proc procedure_row
      on procedure_row.oid = to_regprocedure(expected.function_signature)
    left join pg_namespace namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    left join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    where procedure_row.oid is null
      or namespace_row.nspname is distinct from 'public'
      or owner_row.rolname is distinct from 'equora_broker_capture_owner'
  ) then
    raise exception 'ACTIVATION_AUTHORITY_FUNCTION_OWNER_DRIFT';
  end if;

  if has_table_privilege(
      'service_role', 'public.broker_sync_activation_commands',
      'select,insert,update,delete'
    )
    or has_table_privilege(
      'service_role', 'public.broker_sync_authority_mutation_receipts',
      'select,insert,update,delete'
    )
    or has_table_privilege(
      'service_role', 'public.broker_capture_request_authorizations',
      'select,insert,update,delete'
    )
  then
    raise exception 'ACTIVATION_AUTHORITY_TABLE_PRIVILEGE_DRIFT';
  end if;

  if exists (
    with expected_acl(
      relation_name, allow_select, allow_insert, allow_update, allow_delete
    ) as (
      values
        ('public.broker_sync_activation_commands', true, true, true, false),
        ('public.broker_sync_activation_series', true, true, true, false),
        ('public.broker_sync_activations', true, true, true, false),
        ('public.broker_connection_accounts', true, false, true, false),
        ('public.broker_connections', true, false, true, false),
        ('public.broker_credentials', true, false, true, false),
        ('equora_private.broker_capture_integrity_keys', true, false, true, false),
        ('public.broker_accounts', true, false, true, false),
        ('public.broker_providers', true, false, true, false),
        (
          'public.broker_sync_scopes', true,
          to_regclass('public.broker_capture_schedule_occurrences') is not null,
          true, false
        ),
        (
          'public.broker_capture_runs', true,
          to_regclass('public.broker_capture_schedule_occurrences') is not null,
          true, false
        ),
        (
          'public.broker_capture_work_units', true,
          to_regclass('public.broker_capture_schedule_occurrences') is not null,
          true, false
        ),
        ('public.broker_sync_lane_requirements', true, true, true, false),
        ('public.broker_sync_lane_states', true, true, true, false),
        ('public.broker_sync_gaps', true, true, true, false),
        ('public.broker_sync_authority_mutation_receipts', true, true, false, false),
        ('public.broker_capture_request_authorizations', true, true, true, false),
        ('public.broker_provider_request_results', true, false, false, false),
        ('public.broker_capture_attempt_outcomes', true, false, false, false)
    )
    select 1
    from expected_acl expected
    where has_table_privilege(
        'equora_broker_capture_owner', expected.relation_name, 'select'
      ) is distinct from expected.allow_select
      or has_table_privilege(
        'equora_broker_capture_owner', expected.relation_name, 'insert'
      ) is distinct from expected.allow_insert
      or has_table_privilege(
        'equora_broker_capture_owner', expected.relation_name, 'update'
      ) is distinct from expected.allow_update
      or has_table_privilege(
        'equora_broker_capture_owner', expected.relation_name, 'delete'
      ) is distinct from expected.allow_delete
  )
    or not has_function_privilege(
      'equora_broker_capture_owner',
      'public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)',
      'execute'
    )
    or not has_function_privilege(
      'equora_broker_capture_owner',
      'public.equora_commit_broker_capture_page_v1(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamp with time zone,timestamp with time zone,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)',
      'execute'
    )
    or not has_function_privilege(
      'equora_broker_capture_owner',
      'public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)',
      'execute'
    )
    or has_schema_privilege(
      'equora_broker_capture_owner', 'public', 'create'
    )
  then
    raise exception 'ACTIVATION_AUTHORITY_OWNER_PRIVILEGE_DRIFT';
  end if;

  if exists (
    select 1
    from pg_class relation_row
    join pg_namespace namespace_row
      on namespace_row.oid = relation_row.relnamespace
    join pg_roles owner_row on owner_row.oid = relation_row.relowner
    where namespace_row.nspname = 'public'
      and relation_row.relname in (
        'broker_sync_activation_commands',
        'broker_sync_authority_mutation_receipts',
        'broker_capture_request_authorizations'
      )
      and owner_row.rolname is distinct from 'postgres'
  ) then
    raise exception 'ACTIVATION_AUTHORITY_TABLE_OWNER_DRIFT';
  end if;

  if exists (
    with expected_table_acl(
      relation_name, grantee_name, privilege_type, is_grantable
    ) as (
      values
        ('public.broker_sync_activation_commands',
          'equora_broker_capture_owner', 'INSERT', false),
        ('public.broker_sync_activation_commands',
          'equora_broker_capture_owner', 'SELECT', false),
        ('public.broker_sync_activation_commands',
          'equora_broker_capture_owner', 'UPDATE', false),
        ('public.broker_sync_authority_mutation_receipts',
          'equora_broker_capture_owner', 'INSERT', false),
        ('public.broker_sync_authority_mutation_receipts',
          'equora_broker_capture_owner', 'SELECT', false),
        ('public.broker_capture_request_authorizations',
          'equora_broker_capture_owner', 'INSERT', false),
        ('public.broker_capture_request_authorizations',
          'equora_broker_capture_owner', 'SELECT', false),
        ('public.broker_capture_request_authorizations',
          'equora_broker_capture_owner', 'UPDATE', false)
    ), actual_table_acl as (
      select
        namespace_row.nspname || '.' || relation_row.relname,
        coalesce(grantee_role.rolname, 'PUBLIC'),
        expanded.privilege_type,
        expanded.is_grantable
      from pg_class relation_row
      join pg_namespace namespace_row
        on namespace_row.oid = relation_row.relnamespace
      cross join lateral aclexplode(
        coalesce(
          relation_row.relacl,
          acldefault('r', relation_row.relowner)
        )
      ) expanded
      left join pg_roles grantee_role on grantee_role.oid = expanded.grantee
      where (
          namespace_row.nspname || '.' || relation_row.relname
        ) in (
          'public.broker_sync_activation_commands',
          'public.broker_sync_authority_mutation_receipts',
          'public.broker_capture_request_authorizations'
        )
        and expanded.grantee <> relation_row.relowner
    )
    select 1
    from (
      (
        select * from actual_table_acl
        except
        select * from expected_table_acl
      )
      union all
      (
        select * from expected_table_acl
        except
        select * from actual_table_acl
      )
    ) acl_drift
  ) then
    raise exception 'ACTIVATION_AUTHORITY_TABLE_ACL_GRANTEE_DRIFT';
  end if;

  if exists (
    select 1
    from pg_proc procedure_row
    join pg_namespace namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where procedure_row.oid = to_regprocedure(
        'public.equora_request_broker_sync_activation_v1(uuid,text,bigint,bigint,uuid)'
      )
      and (
        namespace_row.nspname is distinct from 'public'
        or not procedure_row.prosecdef
        or not (
          procedure_row.proconfig @> array[
            'search_path=""', 'lock_timeout=2s', 'statement_timeout=5s'
          ]::text[]
          and procedure_row.proconfig <@ array[
            'search_path=""', 'lock_timeout=2s', 'statement_timeout=5s'
          ]::text[]
        )
        or not has_function_privilege(
          'authenticated', procedure_row.oid, 'execute'
        )
        or has_function_privilege('anon', procedure_row.oid, 'execute')
        or has_function_privilege('service_role', procedure_row.oid, 'execute')
      )
  )
    or to_regprocedure(
      'public.equora_request_broker_sync_activation_v1(uuid,text,bigint,bigint,uuid)'
    ) is null
    or has_function_privilege(
      'service_role',
      'public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)',
      'execute'
    )
    or has_function_privilege(
      'service_role',
      'public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)',
      'execute'
    )
  then
    raise exception 'ACTIVATION_AUTHORITY_FUNCTION_PRIVILEGE_DRIFT';
  end if;

  if exists (
    with expected_service_functions(function_signature, statement_timeout) as (
      values
        ('public.equora_apply_broker_sync_activation_command_v1(uuid)', '10s'),
        ('public.equora_upsert_broker_sync_lane_requirement_v1(uuid,bigint,bigint,text,text,text,uuid)', '10s'),
        ('public.equora_record_broker_sync_lane_success_v1(uuid,uuid,bigint,bigint,bigint,bigint,text,uuid)', '10s'),
        ('public.equora_record_broker_sync_lane_failure_v1(uuid,bigint,bigint,bigint,text,uuid)', '10s'),
        ('public.equora_open_broker_sync_gap_v1(uuid,uuid,bigint,bigint,bigint,bigint,bigint,boolean,boolean,text,text,uuid)', '10s'),
        ('public.equora_escalate_broker_sync_gap_v1(uuid,text,text,bigint,bigint,bigint,bigint,uuid)', '10s'),
        ('public.equora_reconcile_broker_sync_gap_v1(uuid,uuid,bigint,bigint,bigint,uuid)', '10s'),
        ('public.equora_authorize_broker_capture_request_v1(uuid,bigint,integer,text,uuid,uuid)', '10s'),
        ('public.equora_claim_broker_capture_work_unit_v2(uuid,bigint,uuid,uuid,text)', '10s'),
        ('public.equora_commit_broker_capture_page_v2(uuid,uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)', '15s'),
        ('public.equora_record_broker_capture_failure_v2(uuid,timestamptz,uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)', '10s')
    )
    select 1
    from expected_service_functions expected
    left join pg_proc procedure_row
      on procedure_row.oid = to_regprocedure(expected.function_signature)
    left join pg_namespace namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where procedure_row.oid is null
      or namespace_row.nspname is distinct from 'public'
      or not procedure_row.prosecdef
      or not (
        procedure_row.proconfig @> array[
          'search_path=""', 'lock_timeout=2s',
          'statement_timeout=' || expected.statement_timeout
        ]::text[]
        and procedure_row.proconfig <@ array[
          'search_path=""', 'lock_timeout=2s',
          'statement_timeout=' || expected.statement_timeout
        ]::text[]
      )
      or not has_function_privilege(
        'service_role', procedure_row.oid, 'execute'
      )
      or has_function_privilege('authenticated', procedure_row.oid, 'execute')
      or has_function_privilege('anon', procedure_row.oid, 'execute')
  ) then
    raise exception 'ACTIVATION_AUTHORITY_SECURITY_DEFINER_DRIFT';
  end if;

  if exists (
    with expected_v1_core(
      function_signature, expected_statement_timeout
    ) as (
      values
        ('public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)', '10s'),
        ('public.equora_commit_broker_capture_page_v1(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)', '15s'),
        ('public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)', '10s')
    )
    select 1
    from expected_v1_core expected
    left join pg_proc procedure_row
      on procedure_row.oid = to_regprocedure(expected.function_signature)
    left join pg_namespace namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    left join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    where procedure_row.oid is null
      or namespace_row.nspname is distinct from 'public'
      or owner_row.rolname is distinct from 'postgres'
      or not procedure_row.prosecdef
      or procedure_row.proconfig is null
      or not (
        procedure_row.proconfig @> array[
          'search_path=""', 'lock_timeout=2s',
          'statement_timeout=' || expected.expected_statement_timeout
        ]::text[]
        and procedure_row.proconfig <@ array[
          'search_path=""', 'lock_timeout=2s',
          'statement_timeout=' || expected.expected_statement_timeout
        ]::text[]
      )
  ) then
    raise exception 'ACTIVATION_AUTHORITY_V1_CORE_CONFIG_DRIFT';
  end if;

  if exists (
    with expected_internal_helpers(function_signature) as (
      values
        ('public.equora_activation_command_digest_v1(uuid,uuid,uuid,uuid,text,bigint,bigint)'),
        ('public.equora_authority_mutation_digest_v1(text,jsonb)'),
        ('public.equora_capture_authority_digest_v1(uuid,integer,uuid,uuid,uuid,bigint,text,text,text,text,text,text)')
    )
    select 1
    from expected_internal_helpers expected
    left join pg_proc procedure_row
      on procedure_row.oid = to_regprocedure(expected.function_signature)
    left join pg_namespace namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    left join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    where procedure_row.oid is null
      or namespace_row.nspname is distinct from 'public'
      or owner_row.rolname is distinct from 'equora_broker_capture_owner'
      or procedure_row.prosecdef
      or not (
        procedure_row.proconfig @> array['search_path=""']::text[]
        and procedure_row.proconfig <@ array['search_path=""']::text[]
      )
      or has_function_privilege('service_role', procedure_row.oid, 'execute')
      or has_function_privilege('authenticated', procedure_row.oid, 'execute')
      or has_function_privilege('anon', procedure_row.oid, 'execute')
  ) then
    raise exception 'ACTIVATION_AUTHORITY_INTERNAL_HELPER_CONFIG_DRIFT';
  end if;

  if has_function_privilege(
      'service_role',
      'public.equora_activation_command_digest_v1(uuid,uuid,uuid,uuid,text,bigint,bigint)',
      'execute'
    )
    or has_function_privilege(
      'service_role',
      'public.equora_authority_mutation_digest_v1(text,jsonb)',
      'execute'
    )
    or has_function_privilege(
      'service_role',
      'public.equora_capture_authority_digest_v1(uuid,integer,uuid,uuid,uuid,bigint,text,text,text,text,text,text)',
      'execute'
    )
  then
    raise exception 'ACTIVATION_AUTHORITY_INTERNAL_HELPER_GRANT_DRIFT';
  end if;

  if exists (
    with expected_function_acl(
      function_signature, grantee_name, privilege_type, is_grantable
    ) as (
      values
        ('public.equora_request_broker_sync_activation_v1(uuid,text,bigint,bigint,uuid)',
          'authenticated', 'EXECUTE', false),
        ('public.equora_apply_broker_sync_activation_command_v1(uuid)',
          'service_role', 'EXECUTE', false),
        ('public.equora_upsert_broker_sync_lane_requirement_v1(uuid,bigint,bigint,text,text,text,uuid)',
          'service_role', 'EXECUTE', false),
        ('public.equora_record_broker_sync_lane_success_v1(uuid,uuid,bigint,bigint,bigint,bigint,text,uuid)',
          'service_role', 'EXECUTE', false),
        ('public.equora_record_broker_sync_lane_failure_v1(uuid,bigint,bigint,bigint,text,uuid)',
          'service_role', 'EXECUTE', false),
        ('public.equora_open_broker_sync_gap_v1(uuid,uuid,bigint,bigint,bigint,bigint,bigint,boolean,boolean,text,text,uuid)',
          'service_role', 'EXECUTE', false),
        ('public.equora_escalate_broker_sync_gap_v1(uuid,text,text,bigint,bigint,bigint,bigint,uuid)',
          'service_role', 'EXECUTE', false),
        ('public.equora_reconcile_broker_sync_gap_v1(uuid,uuid,bigint,bigint,bigint,uuid)',
          'service_role', 'EXECUTE', false),
        ('public.equora_authorize_broker_capture_request_v1(uuid,bigint,integer,text,uuid,uuid)',
          'service_role', 'EXECUTE', false),
        ('public.equora_claim_broker_capture_work_unit_v2(uuid,bigint,uuid,uuid,text)',
          'service_role', 'EXECUTE', false),
        ('public.equora_commit_broker_capture_page_v2(uuid,uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)',
          'service_role', 'EXECUTE', false),
        ('public.equora_record_broker_capture_failure_v2(uuid,timestamptz,uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)',
          'service_role', 'EXECUTE', false),
        ('public.equora_activation_command_digest_v1(uuid,uuid,uuid,uuid,text,bigint,bigint)',
          'postgres', 'EXECUTE', false),
        ('public.equora_authority_mutation_digest_v1(text,jsonb)',
          'postgres', 'EXECUTE', false),
        ('public.equora_capture_authority_digest_v1(uuid,integer,uuid,uuid,uuid,bigint,text,text,text,text,text,text)',
          'postgres', 'EXECUTE', false),
        ('public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)',
          'equora_broker_capture_owner', 'EXECUTE', false),
        ('public.equora_commit_broker_capture_page_v1(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)',
          'equora_broker_capture_owner', 'EXECUTE', false),
        ('public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)',
          'equora_broker_capture_owner', 'EXECUTE', false)
    ), actual_function_acl as (
      select
        expected.function_signature,
        coalesce(grantee_role.rolname, 'PUBLIC'),
        expanded.privilege_type,
        expanded.is_grantable
      from expected_function_acl expected
      join pg_proc procedure_row
        on procedure_row.oid = to_regprocedure(expected.function_signature)
      cross join lateral aclexplode(
        coalesce(
          procedure_row.proacl,
          acldefault('f', procedure_row.proowner)
        )
      ) expanded
      left join pg_roles grantee_role on grantee_role.oid = expanded.grantee
      where expanded.grantee <> procedure_row.proowner
    )
    select 1
    from (
      (
        select * from actual_function_acl
        except
        select * from expected_function_acl
      )
      union all
      (
        select * from expected_function_acl
        except
        select * from actual_function_acl
      )
    ) acl_drift
  ) then
    raise exception 'ACTIVATION_AUTHORITY_FUNCTION_ACL_GRANTEE_DRIFT';
  end if;
end;
$$;

commit;

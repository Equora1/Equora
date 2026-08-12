-- Equora v57.61.0 - deployment runtime authority (inactive by default).
--
-- Installs no cron, trigger, outbound HTTP, broker request, journal import or
-- trading capability. The application runtime remains gated by
-- EQUORA_MEXC_RUNTIME_MODE and every productive secret load requires a live,
-- single-use broker_capture_request_authorization.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v_existing_fingerprint text;
begin
  if to_regclass('public.broker_connections') is null
    or to_regclass('public.broker_credentials') is null
    or to_regclass('public.broker_accounts') is null
    or to_regclass('public.broker_account_identities') is null
    or to_regclass('public.broker_connection_accounts') is null
    or to_regclass('public.broker_sync_activation_commands') is null
    or to_regclass('public.broker_capture_request_authorizations') is null
    or to_regclass('public.broker_sync_scope_buckets') is null
    or to_regclass('equora_private.broker_capture_integrity_keys') is null
    or to_regprocedure('public.equora_apply_broker_sync_activation_command_v1(uuid)') is null
    or to_regprocedure('public.equora_upsert_broker_sync_lane_requirement_v1(uuid,bigint,bigint,text,text,text,uuid)') is null
    or to_regprocedure('public.equora_record_broker_sync_lane_success_v1(uuid,uuid,bigint,bigint,bigint,bigint,text,uuid)') is null
    or to_regprocedure('public.equora_scheduler_digest_v1(text,jsonb)') is null
    or to_regprocedure(
      'equora_private.equora_request_context_uid_v1()'
    ) is null
  then
    raise exception 'RUNTIME_DEPLOYMENT_PREREQUISITE_MISSING';
  end if;
  select contract_fingerprint into v_existing_fingerprint
  from equora_private.schema_migrations
  where migration_id = 'equora_v57.61.0_g1_runtime_deployment_v1';
  if v_existing_fingerprint is not null
    and v_existing_fingerprint is distinct from
      '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96'
  then raise exception 'RUNTIME_DEPLOYMENT_MIGRATION_DRIFT'; end if;
  if v_existing_fingerprint is null and (
    to_regclass('public.broker_connection_setup_commands') is not null
    or to_regclass('public.broker_capture_scope_finalization_receipts') is not null
    or to_regclass('equora_private.broker_capture_runtime_enrollment') is not null
    or to_regprocedure('public.equora_request_mexc_connection_setup_v1(uuid,text,jsonb,boolean)') is not null
    or to_regprocedure('public.equora_apply_mexc_connection_setup_v1(uuid,text,text,text,text,text)') is not null
    or to_regprocedure('public.equora_request_mexc_connection_revocation_v1(uuid,uuid)') is not null
    or to_regprocedure('public.equora_apply_mexc_connection_revocation_v1(uuid)') is not null
    or to_regprocedure('public.equora_find_claimable_broker_capture_work_unit_v1()') is not null
    or to_regprocedure('public.equora_find_pending_yielded_broker_capture_work_unit_v1()') is not null
    or to_regprocedure('public.equora_find_pending_broker_capture_scope_finalization_v1()') is not null
    or to_regprocedure('public.equora_load_broker_capture_material_v1(uuid)') is not null
    or to_regprocedure('public.equora_finalize_broker_capture_scope_v1(uuid,uuid)') is not null
  ) then raise exception 'RUNTIME_DEPLOYMENT_PREEXISTING_PARTIAL_SCHEMA'; end if;
  if not exists (
    select 1 from pg_roles
    where rolname = 'equora_broker_capture_owner'
      and rolcanlogin = false and rolinherit = false and rolbypassrls = true
      and rolsuper = false and rolcreatedb = false and rolcreaterole = false
      and rolreplication = false
  ) then
    raise exception 'RUNTIME_DEPLOYMENT_OWNER_INVALID';
  end if;
end;
$$;

-- Supabase's migration executor is intentionally not a superuser. PostgreSQL
-- requires temporary SET ROLE capability before ownership can be assigned to
-- the dedicated NOLOGIN authority owner. Both privileges are revoked before
-- the security postflight and the postflight rejects any surviving membership.
do $$
begin
  grant create on schema public, equora_private to equora_broker_capture_owner;
  execute format(
    'grant equora_broker_capture_owner to %I with set true', current_user
  );
end;
$$;

create table if not exists public.broker_connection_setup_commands (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_code text not null,
  environment text not null,
  account_label text not null,
  instrument_symbols text[] not null,
  read_only_attested_at timestamptz not null,
  request_digest text not null,
  command_status text not null default 'pending',
  apply_input_digest text,
  result jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint broker_connection_setup_commands_provider_check
    check ((provider_code = 'mexc' and environment = 'live') is true),
  constraint broker_connection_setup_commands_label_check
    check ((octet_length(account_label) between 1 and 120) is true),
  constraint broker_connection_setup_commands_symbols_check
    check ((cardinality(instrument_symbols) between 1 and 5) is true),
  constraint broker_connection_setup_commands_digest_check
    check ((request_digest ~ '^[a-f0-9]{64}$'
      and (apply_input_digest is null or apply_input_digest ~ '^[a-f0-9]{64}$')) is true),
  constraint broker_connection_setup_commands_status_check
    check ((command_status in ('pending', 'applied')) is true),
  constraint broker_connection_setup_commands_result_check check ((
    (command_status = 'pending' and apply_input_digest is null
      and result is null and applied_at is null)
    or
    (command_status = 'applied' and apply_input_digest is not null
      and result is not null and jsonb_typeof(result) = 'object'
      and result ->> 'status' = 'connection_activated'
      and applied_at is not null and applied_at >= created_at)
  ) is true)
);

alter table public.broker_connection_setup_commands enable row level security;
drop policy if exists "users can read own broker_connection_setup_commands"
  on public.broker_connection_setup_commands;
create policy "users can read own broker_connection_setup_commands"
  on public.broker_connection_setup_commands for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.broker_connection_setup_commands
  from public, anon, authenticated, service_role;
alter table public.broker_connection_setup_commands
  owner to equora_broker_capture_owner;

create index if not exists idx_broker_connection_setup_commands_owner_created
  on public.broker_connection_setup_commands (user_id, created_at desc, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_connection_setup_commands'::regclass
      and conname = 'broker_connection_setup_commands_id_user_key'
  ) then
    alter table public.broker_connection_setup_commands
      add constraint broker_connection_setup_commands_id_user_key
      unique (id, user_id);
  end if;
end;
$$;

create table if not exists public.broker_capture_scope_finalization_receipts (
  request_id uuid primary key,
  request_authorization_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  scope_id uuid not null,
  lane_state_id uuid not null,
  input_digest text not null,
  result jsonb not null,
  finalized_at timestamptz not null default now(),
  constraint broker_capture_scope_finalization_auth_unique
    unique (request_authorization_id),
  constraint broker_capture_scope_finalization_auth_fkey
    foreign key (
      request_authorization_id, user_id, broker_account_id,
      sync_activation_id, activation_generation, scope_id, lane_state_id
    ) references public.broker_capture_request_authorizations (
      id, user_id, broker_account_id, sync_activation_id,
      activation_generation, scope_id, lane_state_id
    ) on delete restrict,
  constraint broker_capture_scope_finalization_digest_check
    check ((input_digest ~ '^[a-f0-9]{64}$') is true),
  constraint broker_capture_scope_finalization_result_check
    check ((jsonb_typeof(result) = 'object'
      and result ->> 'status' = 'scope_finalized') is true),
  constraint broker_capture_scope_finalization_generation_check
    check ((activation_generation > 0) is true),
  constraint broker_capture_scope_finalization_activation_fkey
    foreign key (sync_activation_id, user_id, broker_account_id, activation_generation)
    references public.broker_sync_activations (
      id, user_id, broker_account_id, activation_generation
    ) on delete restrict,
  constraint broker_capture_scope_finalization_scope_fkey
    foreign key (scope_id, user_id, broker_account_id, sync_activation_id, activation_generation)
    references public.broker_sync_scopes (
      id, user_id, broker_account_id, sync_activation_id, activation_generation
    ) on delete restrict,
  constraint broker_capture_scope_finalization_lane_fkey
    foreign key (
      lane_state_id, user_id, broker_account_id,
      sync_activation_id, activation_generation
    ) references public.broker_sync_lane_states (
      id, user_id, broker_account_id, sync_activation_id, activation_generation
    ) on delete restrict
);

alter table public.broker_capture_scope_finalization_receipts enable row level security;
drop policy if exists "users can read own broker_capture_scope_finalization_receipts"
  on public.broker_capture_scope_finalization_receipts;
create policy "users can read own broker_capture_scope_finalization_receipts"
  on public.broker_capture_scope_finalization_receipts for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.broker_capture_scope_finalization_receipts
  from public, anon, authenticated, service_role;
alter table public.broker_capture_scope_finalization_receipts
  owner to equora_broker_capture_owner;

create index if not exists idx_broker_capture_scope_finalization_activation
  on public.broker_capture_scope_finalization_receipts (
    sync_activation_id, user_id, broker_account_id, activation_generation
  );
create index if not exists idx_broker_capture_scope_finalization_scope
  on public.broker_capture_scope_finalization_receipts (
    scope_id, user_id, broker_account_id, sync_activation_id, activation_generation
  );
create index if not exists idx_broker_capture_scope_finalization_user_fkey
  on public.broker_capture_scope_finalization_receipts (user_id);
create index if not exists idx_broker_capture_scope_finalization_auth_fkey
  on public.broker_capture_scope_finalization_receipts (
    request_authorization_id, user_id, broker_account_id,
    sync_activation_id, activation_generation, scope_id, lane_state_id
  );
create index if not exists idx_broker_capture_scope_finalization_lane_fkey
  on public.broker_capture_scope_finalization_receipts (
    lane_state_id, user_id, broker_account_id,
    sync_activation_id, activation_generation
  );

-- Explicit, operator-owned rollout enrollment. No row is created by the
-- migration, so a deployed runtime remains incapable of enrolling any user or
-- account until a later approved staging/production operation inserts exactly
-- one bounded row. The row is also the serialization lock for the account cap.
create table if not exists equora_private.broker_capture_runtime_enrollment (
  singleton_key boolean primary key default true,
  user_id uuid not null unique references auth.users (id) on delete restrict,
  provider_code text not null,
  broker_account_id uuid,
  max_accounts integer not null,
  max_symbols integer not null,
  enabled boolean not null default false,
  enrolled_at timestamptz not null,
  updated_at timestamptz not null,
  constraint broker_capture_runtime_enrollment_singleton_check
    check ((singleton_key is true) is true),
  constraint broker_capture_runtime_enrollment_provider_check
    check ((provider_code = 'mexc') is true),
  constraint broker_capture_runtime_enrollment_account_fkey
    foreign key (broker_account_id, user_id, provider_code)
    references public.broker_accounts (id, user_id, provider_code)
    on delete restrict,
  constraint broker_capture_runtime_enrollment_bounds_check
    check ((max_accounts = 1 and max_symbols between 1 and 5) is true),
  constraint broker_capture_runtime_enrollment_time_check
    check ((updated_at >= enrolled_at) is true)
);
revoke all on table equora_private.broker_capture_runtime_enrollment
  from public, anon, authenticated, service_role;
alter table equora_private.broker_capture_runtime_enrollment
  owner to equora_broker_capture_owner;

create index if not exists idx_broker_capture_runtime_enrollment_account_fkey
  on equora_private.broker_capture_runtime_enrollment (
    broker_account_id, user_id, provider_code
  );

do $$
declare
  v_table regclass;
  v_acl record;
begin
  foreach v_table in array array[
    'public.broker_connection_setup_commands'::regclass,
    'public.broker_capture_scope_finalization_receipts'::regclass,
    'equora_private.broker_capture_runtime_enrollment'::regclass
  ] loop
    for v_acl in
      select distinct exploded.grantee, role_row.rolname
      from pg_class relation_row
      cross join lateral aclexplode(coalesce(
        relation_row.relacl, acldefault('r', relation_row.relowner)
      )) exploded
      left join pg_roles role_row on role_row.oid = exploded.grantee
      where relation_row.oid = v_table
        and exploded.grantee <> relation_row.relowner
    loop
      if v_acl.grantee = 0 then
        execute format('revoke all privileges on table %s from public', v_table);
      elsif v_acl.rolname is not null then
        execute format(
          'revoke all privileges on table %s from %I', v_table, v_acl.rolname
        );
      else
        raise exception 'RUNTIME_DEPLOYMENT_TABLE_ACL_GRANTEE_INVALID';
      end if;
    end loop;
  end loop;
end;
$$;

-- Only the NOLOGIN SECURITY DEFINER owner receives the narrow data-plane
-- privileges required by the five closed RPCs. Runtime roles retain no direct
-- table access, in particular no access to credential or integrity material.
grant select, insert, update on table
  public.broker_credentials,
  public.broker_connections,
  public.broker_accounts,
  public.broker_connection_accounts,
  public.broker_sync_activation_commands,
  equora_private.broker_capture_integrity_keys,
  equora_private.broker_capture_runtime_enrollment
to equora_broker_capture_owner;

-- The internally delegated Claim-v1 core is intentionally pinned to the
-- postgres role by the activation layer. PostgreSQL row locking requires both
-- SELECT and UPDATE privilege, although the Claim core performs no enrollment
-- mutation. These are granted only to the non-runtime v1 owner so it can lock
-- and revalidate rollout authority after Account/Provider and before Scope.
grant select, update on table equora_private.broker_capture_runtime_enrollment
to postgres;

grant select, insert on table public.broker_account_identities
to equora_broker_capture_owner;

grant select on table
  public.broker_capture_work_units,
  public.broker_capture_runs,
  public.broker_capture_request_authorizations,
  public.broker_provider_request_results,
  public.broker_capture_event_observations,
  public.broker_capture_raw_events
to equora_broker_capture_owner;

grant select, update on table
  public.broker_sync_activation_series,
  public.broker_sync_activations,
  public.broker_sync_lane_requirements,
  public.broker_sync_lane_states,
  public.broker_sync_scopes,
  public.broker_sync_scope_buckets
to equora_broker_capture_owner;

create or replace function public.equora_request_mexc_connection_setup_v1(
  p_request_id uuid,
  p_account_label text,
  p_symbols jsonb,
  p_read_only_attested boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := equora_private.equora_request_context_uid_v1();
  v_label text := btrim(coalesce(p_account_label, ''));
  v_symbols text[];
  v_digest text;
  v_existing public.broker_connection_setup_commands%rowtype;
  v_enrollment equora_private.broker_capture_runtime_enrollment%rowtype;
  v_active_account_count integer;
  v_active_probe_reservation_count integer;
begin
  if v_user_id is null or p_request_id is null
    or p_read_only_attested is distinct from true
    or octet_length(v_label) not between 1 and 120
    or jsonb_typeof(p_symbols) is distinct from 'array'
    or jsonb_array_length(p_symbols) not between 1 and 5
  then raise exception 'CONNECTION_SETUP_INVALID_INPUT'; end if;

  select array_agg(symbol order by symbol) into v_symbols
  from (
    select distinct upper(btrim(value)) as symbol
    from jsonb_array_elements_text(p_symbols)
  ) normalized;
  if cardinality(v_symbols) is distinct from jsonb_array_length(p_symbols)
    or exists (
      select 1 from unnest(v_symbols) symbol
      where symbol !~ '^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$'
    )
  then raise exception 'CONNECTION_SETUP_INVALID_SYMBOLS'; end if;

  v_digest := public.equora_scheduler_digest_v1(
    'mexc-connection-setup-command-v1',
    jsonb_build_object(
      'requestId', p_request_id::text,
      'userId', v_user_id::text,
      'providerCode', 'mexc',
      'environment', 'live',
      'accountLabel', v_label,
      'symbols', to_jsonb(v_symbols),
      'readOnlyAttested', true
    )
  );

  select * into v_existing
  from public.broker_connection_setup_commands
  where id = p_request_id;
  if found and (
    v_existing.user_id is distinct from v_user_id
    or v_existing.request_digest is distinct from v_digest
  ) then
    raise exception 'CONNECTION_SETUP_REQUEST_DRIFT';
  end if;
  if found and v_existing.command_status = 'applied' then
    return jsonb_build_object(
      'commandId', v_existing.id,
      'commandStatus', v_existing.command_status,
      'result', v_existing.result,
      'authorityBlocked', true
    );
  end if;

  select * into v_enrollment
  from equora_private.broker_capture_runtime_enrollment
  where singleton_key is true for update;
  if not found
    or v_enrollment.enabled is distinct from true
    or v_enrollment.user_id is distinct from v_user_id
    or v_enrollment.provider_code is distinct from 'mexc'
    or cardinality(v_symbols) > v_enrollment.max_symbols
  then raise exception 'CONNECTION_SETUP_ROLLOUT_NOT_ENROLLED'; end if;
  select count(*)::integer into v_active_account_count
  from public.broker_connections
  where user_id = v_user_id
    and provider = 'mexc'
    and environment = 'live'
    and status in ('ready', 'paused');
  if v_active_account_count >= v_enrollment.max_accounts then
    raise exception 'CONNECTION_SETUP_ACCOUNT_LIMIT_REACHED';
  end if;

  -- The enrollment row is still held FOR UPDATE here. A pending setup command
  -- is the secret-free, time-bounded reservation for the sole rollout slot,
  -- so two concurrent first-time requests cannot both reach the external
  -- capability probe while active_account_count is still zero. Exact replay
  -- of the same command remains allowed; abandoned reservations expire with
  -- the same 15-minute freshness boundary enforced by Apply.
  select count(*)::integer into v_active_probe_reservation_count
  from public.broker_connection_setup_commands command_row
  where command_row.id <> p_request_id
    and command_row.user_id = v_user_id
    and command_row.provider_code = 'mexc'
    and command_row.environment = 'live'
    and command_row.command_status = 'pending'
    and command_row.read_only_attested_at >= clock_timestamp() - interval '15 minutes';
  if v_active_probe_reservation_count > 0 then
    raise exception 'CONNECTION_SETUP_PROBE_BUSY';
  end if;

  if v_existing.id is not null then
    return jsonb_build_object(
      'commandId', v_existing.id,
      'commandStatus', v_existing.command_status,
      'result', v_existing.result,
      'authorityBlocked', true
    );
  end if;

  insert into public.broker_connection_setup_commands (
    id, user_id, provider_code, environment, account_label,
    instrument_symbols, read_only_attested_at, request_digest
  ) values (
    p_request_id, v_user_id, 'mexc', 'live', v_label,
    v_symbols, clock_timestamp(), v_digest
  ) returning * into v_existing;

  return jsonb_build_object(
    'commandId', v_existing.id,
    'commandStatus', 'pending',
    'result', null,
    'authorityBlocked', true
  );
exception
  when unique_violation then raise exception 'CONNECTION_SETUP_REQUEST_RACE';
  when lock_not_available then raise exception 'CONNECTION_SETUP_LOCK_TIMEOUT';
  when query_canceled then raise exception 'CONNECTION_SETUP_STATEMENT_TIMEOUT';
end;
$$;

create or replace function public.equora_apply_mexc_connection_setup_v1(
  p_command_id uuid,
  p_encrypted_payload text,
  p_credential_key_version text,
  p_account_identity_digest text,
  p_account_identity_key_version text,
  p_integrity_key_base64 text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '45s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_command public.broker_connection_setup_commands%rowtype;
  v_apply_digest text;
  v_integrity_key bytea;
  v_connection_id uuid := gen_random_uuid();
  v_credential_id uuid := gen_random_uuid();
  v_account_id uuid := gen_random_uuid();
  v_identity_id uuid := gen_random_uuid();
  v_connection_account_id uuid := gen_random_uuid();
  v_integrity_key_id uuid := gen_random_uuid();
  v_activation_command_id uuid := gen_random_uuid();
  v_activation_result jsonb;
  v_requirement_result jsonb;
  v_series_version bigint;
  v_activation_version bigint;
  v_series_id uuid;
  v_activation_id uuid;
  v_generation integer;
  v_symbol text;
  v_capability text;
  v_position_token text;
  v_requirement_spec text[];
  v_requirement_count integer := 0;
  v_enrollment equora_private.broker_capture_runtime_enrollment%rowtype;
  v_active_account_count integer;
  v_result jsonb;
begin
  if p_command_id is null
    or octet_length(coalesce(p_encrypted_payload, '')) not between 32 and 16384
    or p_credential_key_version !~ '^[a-z][a-z0-9_]{0,62}$'
    or p_account_identity_digest !~ '^[a-f0-9]{64}$'
    or p_account_identity_key_version !~ '^[a-z][a-z0-9_]{0,62}$'
    or octet_length(coalesce(p_integrity_key_base64, '')) not between 40 and 128
  then raise exception 'CONNECTION_SETUP_APPLY_INVALID_INPUT'; end if;
  begin
    v_integrity_key := decode(p_integrity_key_base64, 'base64');
  exception when others then
    raise exception 'CONNECTION_SETUP_APPLY_INVALID_INPUT';
  end;
  if octet_length(v_integrity_key) not between 32 and 64 then
    raise exception 'CONNECTION_SETUP_APPLY_INVALID_INPUT';
  end if;

  v_apply_digest := public.equora_scheduler_digest_v1(
    'mexc-connection-setup-apply-v1',
    jsonb_build_object(
      'commandId', p_command_id::text,
      'encryptedPayloadDigest', encode(public.equora_pgcrypto_digest_v1(
        convert_to(p_encrypted_payload, 'UTF8'), 'sha256'), 'hex'),
      'credentialKeyVersion', p_credential_key_version,
      'accountIdentityDigest', p_account_identity_digest,
      'accountIdentityKeyVersion', p_account_identity_key_version,
      'integrityKeyDigest', encode(public.equora_pgcrypto_digest_v1(
        v_integrity_key, 'sha256'), 'hex')
    )
  );

  select * into v_command
  from public.broker_connection_setup_commands
  where id = p_command_id
  for update;
  if not found then raise exception 'CONNECTION_SETUP_COMMAND_NOT_FOUND'; end if;
  if v_command.command_status = 'applied' then
    if v_command.apply_input_digest is distinct from v_apply_digest then
      raise exception 'CONNECTION_SETUP_APPLY_DRIFT';
    end if;
    return v_command.result;
  end if;
  if v_command.provider_code <> 'mexc' or v_command.environment <> 'live'
    or v_command.read_only_attested_at < v_now - interval '15 minutes'
  then raise exception 'CONNECTION_SETUP_COMMAND_EXPIRED'; end if;

  select * into v_enrollment
  from equora_private.broker_capture_runtime_enrollment
  where singleton_key is true for update;
  if not found
    or v_enrollment.enabled is distinct from true
    or v_enrollment.user_id is distinct from v_command.user_id
    or v_enrollment.provider_code is distinct from 'mexc'
    or cardinality(v_command.instrument_symbols) > v_enrollment.max_symbols
  then raise exception 'CONNECTION_SETUP_ROLLOUT_NOT_ENROLLED'; end if;
  select count(*)::integer into v_active_account_count
  from public.broker_connections
  where user_id = v_command.user_id
    and provider = 'mexc'
    and environment = 'live'
    and status in ('ready', 'paused');
  if v_active_account_count >= v_enrollment.max_accounts then
    raise exception 'CONNECTION_SETUP_ACCOUNT_LIMIT_REACHED';
  end if;

  insert into public.broker_credentials (
    id, user_id, provider, encrypted_payload, key_version, created_at, updated_at
  ) values (
    v_credential_id, v_command.user_id, 'mexc', p_encrypted_payload,
    p_credential_key_version, v_now, v_now
  );
  insert into public.broker_connections (
    id, user_id, provider, account_label, environment, status, permissions,
    sync_mode, credential_reference, last_sync_at, last_error, created_at, updated_at
  ) values (
    v_connection_id, v_command.user_id, 'mexc', v_command.account_label,
    'live', 'ready', array['read_only_user_attested'],
    'scheduled', v_credential_id, null, null, v_now, v_now
  );
  insert into public.broker_accounts (
    id, user_id, provider_code, environment, display_label, identity_status,
    account_type, capability_profile_id, provider_contract_version, status,
    retention_status, ledger_generation, created_at, updated_at
  ) values (
    v_account_id, v_command.user_id, 'mexc', 'live', v_command.account_label,
    'connection_scoped', 'futures', 'mexc_futures_rest',
    'mexc_futures_contract_v1', 'active', 'active', 0, v_now, v_now
  );
  update equora_private.broker_capture_runtime_enrollment
  set broker_account_id = v_account_id, updated_at = v_now
  where singleton_key is true;
  if not found then raise exception 'CONNECTION_SETUP_ROLLOUT_NOT_ENROLLED'; end if;
  insert into equora_private.broker_capture_integrity_keys (
    id, user_id, broker_account_id, key_version, key_material, status,
    valid_from, valid_to, created_at
  ) values (
    v_integrity_key_id, v_command.user_id, v_account_id, 'ikv1',
    v_integrity_key, 'active', v_now, null, v_now
  );
  insert into public.broker_account_identities (
    id, user_id, broker_account_id, provider_code, environment, identity_type,
    digest_purpose, digest_algorithm, digest_contract_version,
    hmac_key_version, hmac_digest, evidence_source, verification_status,
    valid_from, retired_at, status, created_at
  ) values (
    v_identity_id, v_command.user_id, v_account_id, 'mexc', 'live',
    'cryptographic_identity_rotation', 'broker_account_identity_v1',
    'hmac-sha256', 'equora-tcj-v1', p_account_identity_key_version,
    p_account_identity_digest, 'api_key_hmac_unverified_reference_v1',
    'unverified_reference', v_now, null, 'active', v_now
  );
  insert into public.broker_connection_accounts (
    id, user_id, connection_id, broker_account_id, provider_code, environment,
    assignment_source, valid_from, valid_to, status, review_reference, created_at
  ) values (
    v_connection_account_id, v_command.user_id, v_connection_id, v_account_id,
    'mexc', 'live', 'connection_scoped', v_now, null, 'active',
    'read_only_user_attested_capability_probe_v1', v_now
  );

  insert into public.broker_sync_activation_commands (
    id, user_id, connection_account_id, broker_account_id, command_kind,
    expected_series_row_version, expected_activation_row_version, request_digest
  ) values (
    v_activation_command_id, v_command.user_id, v_connection_account_id,
    v_account_id, 'activate', 0, null,
    public.equora_activation_command_digest_v1(
      v_activation_command_id, v_command.user_id, v_connection_account_id,
      v_account_id, 'activate', 0, null
    )
  );
  v_activation_result := public.equora_apply_broker_sync_activation_command_v1(
    v_activation_command_id
  );
  if v_activation_result ->> 'status' <> 'activated' then
    raise exception 'CONNECTION_SETUP_ACTIVATION_FAILED';
  end if;
  v_series_id := (v_activation_result ->> 'activationSeriesId')::uuid;
  v_activation_id := (v_activation_result ->> 'syncActivationId')::uuid;
  v_generation := (v_activation_result ->> 'activationGeneration')::integer;
  v_series_version := (v_activation_result ->> 'seriesRowVersion')::bigint;
  v_activation_version := (v_activation_result ->> 'activationRowVersion')::bigint;

  foreach v_symbol in array v_command.instrument_symbols loop
    foreach v_requirement_spec slice 1 in array array[
      ['historical_orders_v1', 'none'],
      ['historical_executions_v3', 'none'],
      ['historical_positions_v1', '1'],
      ['historical_positions_v1', '2'],
      ['funding_records_v1', '1'],
      ['funding_records_v1', '2']
    ] loop
      v_capability := v_requirement_spec[1];
      v_position_token := v_requirement_spec[2];
      v_requirement_result := public.equora_upsert_broker_sync_lane_requirement_v1(
        v_activation_id, v_series_version, v_activation_version,
        v_capability,
        'mexc_futures_symbol_v1:' || v_symbol || ':' || v_position_token,
        'explicit_account_scope', gen_random_uuid()
      );
      v_series_version := (v_requirement_result ->> 'seriesRowVersion')::bigint;
      v_activation_version := (v_requirement_result ->> 'activationRowVersion')::bigint;
      v_requirement_count := v_requirement_count + 1;
    end loop;
  end loop;

  -- Provider-level Activation placeholders have served their purpose once all
  -- explicit symbol requirements exist. Leaving them current would keep the
  -- aggregate Health permanently pending and block later healthy-lane claims.
  v_now := clock_timestamp();
  update public.broker_sync_lane_states
  set superseded_at = v_now, updated_at = v_now, row_version = row_version + 1
  where sync_activation_id = v_activation_id
    and activation_generation = v_generation
    and instrument_scope_key = 'mexc_futures_account_v1:all'
    and superseded_at is null;
  update public.broker_sync_lane_requirements
  set superseded_at = v_now, updated_at = v_now, row_version = row_version + 1
  where sync_activation_id = v_activation_id
    and activation_generation = v_generation
    and instrument_scope_key = 'mexc_futures_account_v1:all'
    and superseded_at is null;
  update public.broker_sync_activations
  set activation_row_version = activation_row_version + 1,
      lifecycle_updated_at = v_now
  where id = v_activation_id and activation_row_version = v_activation_version
  returning activation_row_version into v_activation_version;
  if not found then raise exception 'CONNECTION_SETUP_ACTIVATION_CAS_MISMATCH'; end if;
  update public.broker_sync_activation_series
  set series_row_version = series_row_version + 1,
      authority_epoch = authority_epoch + 1, updated_at = v_now
  where id = v_series_id and series_row_version = v_series_version
  returning series_row_version into v_series_version;
  if not found then raise exception 'CONNECTION_SETUP_SERIES_CAS_MISMATCH'; end if;
  update public.broker_sync_activations
  set capture_health = public.equora_derive_capture_health_at_v1(
    v_activation_id, clock_timestamp()
  ) ->> 'health'
  where id = v_activation_id;

  v_result := jsonb_build_object(
    'status', 'connection_activated',
    'connectionId', v_connection_id,
    'connectionAccountId', v_connection_account_id,
    'brokerAccountId', v_account_id,
    'activationSeriesId', v_series_id,
    'syncActivationId', v_activation_id,
    'activationGeneration', v_generation,
    'seriesRowVersion', v_series_version,
    'activationRowVersion', v_activation_version,
    'requirementCount', v_requirement_count,
    'probeEvidencePersistence', 'transient_not_persisted',
    'symbolCount', cardinality(v_command.instrument_symbols),
    'automaticImportAuthorized', false,
    'tradingAuthorized', false,
    'authorityBlocked', true
  );
  update public.broker_connection_setup_commands
  set command_status = 'applied', apply_input_digest = v_apply_digest,
      result = v_result, applied_at = clock_timestamp()
  where id = v_command.id and command_status = 'pending';
  if not found then raise exception 'CONNECTION_SETUP_COMMAND_CAS_MISMATCH'; end if;
  return v_result;
exception
  when unique_violation then raise exception 'CONNECTION_SETUP_APPLY_CONFLICT';
  when lock_not_available then raise exception 'CONNECTION_SETUP_LOCK_TIMEOUT';
  when query_canceled then raise exception 'CONNECTION_SETUP_STATEMENT_TIMEOUT';
end;
$$;

create or replace function public.equora_request_mexc_connection_revocation_v1(
  p_connection_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := equora_private.equora_request_context_uid_v1();
  v_connection_account public.broker_connection_accounts%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
begin
  if v_user_id is null or p_connection_id is null or p_request_id is null then
    raise exception 'CONNECTION_REVOCATION_INVALID_INPUT';
  end if;
  select * into v_connection_account
  from public.broker_connection_accounts
  where connection_id = p_connection_id and user_id = v_user_id
    and status = 'active'
  order by valid_from desc, id
  limit 1;
  if not found then raise exception 'CONNECTION_REVOCATION_NOT_FOUND'; end if;
  select * into v_series
  from public.broker_sync_activation_series
  where connection_account_id = v_connection_account.id
    and user_id = v_user_id
    and broker_account_id = v_connection_account.broker_account_id;
  if not found or v_series.current_sync_activation_id is null then
    raise exception 'CONNECTION_REVOCATION_AUTHORITY_NOT_FOUND';
  end if;
  select * into v_activation
  from public.broker_sync_activations
  where id = v_series.current_sync_activation_id
    and activation_generation = v_series.current_activation_generation;
  if not found then raise exception 'CONNECTION_REVOCATION_AUTHORITY_NOT_FOUND'; end if;
  return public.equora_request_broker_sync_activation_v1(
    v_connection_account.id, 'revoke', v_series.series_row_version,
    v_activation.activation_row_version, p_request_id
  );
exception
  when lock_not_available then raise exception 'CONNECTION_REVOCATION_LOCK_TIMEOUT';
  when query_canceled then raise exception 'CONNECTION_REVOCATION_STATEMENT_TIMEOUT';
end;
$$;

create or replace function public.equora_apply_mexc_connection_revocation_v1(
  p_command_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '15s'
as $$
declare
  v_now timestamptz;
  v_command public.broker_sync_activation_commands%rowtype;
  v_connection_account public.broker_connection_accounts%rowtype;
  v_connection public.broker_connections%rowtype;
  v_result jsonb;
  v_tombstone constant text :=
    '{"v":"revoked","iv":"","tag":"","data":""}';
begin
  if p_command_id is null then raise exception 'CONNECTION_REVOCATION_INVALID_INPUT'; end if;
  select * into v_command from public.broker_sync_activation_commands
  where id = p_command_id for update;
  if not found or v_command.command_kind <> 'revoke' then
    raise exception 'CONNECTION_REVOCATION_COMMAND_INVALID';
  end if;
  select * into v_connection_account
  from public.broker_connection_accounts
  where id = v_command.connection_account_id
    and user_id = v_command.user_id
    and broker_account_id = v_command.broker_account_id;
  if not found then raise exception 'CONNECTION_REVOCATION_NOT_FOUND'; end if;

  v_result := public.equora_apply_broker_sync_activation_command_v1(p_command_id);
  if v_result ->> 'status' <> 'revoked' then
    raise exception 'CONNECTION_REVOCATION_AUTHORITY_REJECTED';
  end if;
  v_now := clock_timestamp();
  select * into v_connection from public.broker_connections
  where id = v_connection_account.connection_id
    and user_id = v_command.user_id for update;
  if not found then raise exception 'CONNECTION_REVOCATION_NOT_FOUND'; end if;

  update public.broker_connections
  set status = 'revoked', permissions = '{}'::text[], sync_mode = 'manual',
      last_error = null, updated_at = v_now
  where id = v_connection.id and status <> 'revoked';
  update public.broker_credentials
  set encrypted_payload = v_tombstone, updated_at = v_now
  where id = v_connection.credential_reference
    and user_id = v_command.user_id
    and encrypted_payload is distinct from v_tombstone;
  update public.broker_connection_accounts
  set status = 'revoked', valid_to = v_now
  where id = v_connection_account.id and status <> 'revoked';
  update public.broker_accounts
  set status = 'revoked', updated_at = v_now
  where id = v_command.broker_account_id and status <> 'revoked';
  update equora_private.broker_capture_integrity_keys
  set status = 'revoked', valid_to = v_now
  where broker_account_id = v_command.broker_account_id
    and user_id = v_command.user_id and status = 'active';

  return v_result || jsonb_build_object(
    'connectionId', v_connection.id,
    'credentialsRevoked', true,
    'automaticImportAuthorized', false,
    'tradingAuthorized', false
  );
exception
  when lock_not_available then raise exception 'CONNECTION_REVOCATION_LOCK_TIMEOUT';
  when query_canceled then raise exception 'CONNECTION_REVOCATION_STATEMENT_TIMEOUT';
end;
$$;

create or replace function public.equora_find_claimable_broker_capture_work_unit_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_work_unit public.broker_capture_work_units%rowtype;
begin
  select work_unit.* into v_work_unit
  from public.broker_capture_work_units work_unit
  join equora_private.broker_capture_runtime_enrollment enrollment
    on enrollment.enabled is true
    and enrollment.user_id = work_unit.user_id
    and enrollment.provider_code = 'mexc'
    and enrollment.broker_account_id = work_unit.broker_account_id
  join public.broker_capture_runs run on run.id = work_unit.run_id
    and run.user_id = work_unit.user_id
    and run.broker_account_id = work_unit.broker_account_id
  join public.broker_sync_activation_series series
    on series.current_sync_activation_id = work_unit.sync_activation_id
    and series.current_activation_generation = work_unit.activation_generation
    and series.user_id = work_unit.user_id
    and series.broker_account_id = work_unit.broker_account_id
  join public.broker_sync_activations activation
    on activation.id = series.current_sync_activation_id
    and activation.activation_generation = series.current_activation_generation
  join public.broker_sync_lane_requirements requirement
    on requirement.id = work_unit.lane_requirement_id
    and requirement.superseded_at is null
  join public.broker_sync_lane_states lane
    on lane.id = work_unit.lane_state_id
    and lane.lane_requirement_id = requirement.id
    and lane.superseded_at is null
  where work_unit.status in ('pending', 'retry_pending')
    and (work_unit.status <> 'retry_pending'
      or work_unit.retry_not_before <= clock_timestamp())
    and run.status in ('pending', 'running', 'partial')
    and activation.activation_state = 'active'
    and activation.authority_contract_version = 'broker-capture-authority-v1'
    and work_unit.policy_generation = lane.policy_generation
  order by case work_unit.status when 'retry_pending' then 0 else 1 end,
    work_unit.retry_not_before nulls first, work_unit.created_at, work_unit.id
  limit 1;
  if not found then
    return jsonb_build_object(
      'status', 'no_claimable', 'workUnitId', null,
      'workUnitRowVersion', null, 'authorityBlocked', true
    );
  end if;
  return jsonb_build_object(
    'status', 'claimable', 'workUnitId', v_work_unit.id,
    'workUnitRowVersion', v_work_unit.row_version,
    'authorityBlocked', true
  );
end;
$$;

-- Durable restart path for a yielded predecessor. The immediate in-process
-- continuation is an optimization only; this closed hint makes the state
-- discoverable again after a worker crash. Authority is revalidated inside
-- the mutating continuation RPC before a successor can be created.
create or replace function public.equora_find_pending_yielded_broker_capture_work_unit_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_work_unit public.broker_capture_work_units%rowtype;
begin
  select work_unit.* into v_work_unit
  from public.broker_capture_work_units work_unit
  join equora_private.broker_capture_runtime_enrollment enrollment
    on enrollment.enabled is true
    and enrollment.user_id = work_unit.user_id
    and enrollment.provider_code = 'mexc'
    and enrollment.broker_account_id = work_unit.broker_account_id
  join public.broker_capture_runs run on run.id = work_unit.run_id
    and run.user_id = work_unit.user_id
    and run.broker_account_id = work_unit.broker_account_id
  join public.broker_sync_activation_series series
    on series.current_sync_activation_id = work_unit.sync_activation_id
    and series.current_activation_generation = work_unit.activation_generation
    and series.user_id = work_unit.user_id
    and series.broker_account_id = work_unit.broker_account_id
  join public.broker_sync_activations activation
    on activation.id = series.current_sync_activation_id
    and activation.activation_generation = series.current_activation_generation
  join public.broker_sync_lane_requirements requirement
    on requirement.id = work_unit.lane_requirement_id
    and requirement.superseded_at is null
  join public.broker_sync_lane_states lane
    on lane.id = work_unit.lane_state_id
    and lane.lane_requirement_id = requirement.id
    and lane.superseded_at is null
  where work_unit.status = 'yielded'
    and work_unit.lease_token_digest is null
    and work_unit.recovery_state = 'none'
    and work_unit.checkpoint ->> 'status' = 'yielded'
    and run.status in ('pending', 'running', 'partial')
    and activation.activation_state = 'active'
    and activation.authority_contract_version = 'broker-capture-authority-v1'
    and work_unit.policy_generation = lane.policy_generation
    and not exists (
      select 1
      from public.broker_capture_work_units successor
      where successor.predecessor_work_unit_id = work_unit.id
        and successor.run_id = work_unit.run_id
        and successor.scope_id = work_unit.scope_id
        and successor.user_id = work_unit.user_id
        and successor.broker_account_id = work_unit.broker_account_id
    )
  order by work_unit.updated_at, work_unit.id
  limit 1;
  if not found then
    return jsonb_build_object(
      'status', 'no_pending', 'workUnitId', null,
      'workUnitRowVersion', null, 'authorityBlocked', true
    );
  end if;
  return jsonb_build_object(
    'status', 'pending', 'workUnitId', v_work_unit.id,
    'workUnitRowVersion', v_work_unit.row_version,
    'authorityBlocked', true
  );
end;
$$;

create or replace function public.equora_find_pending_broker_capture_scope_finalization_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_authorization_id uuid;
begin
  select request_auth.id into v_authorization_id
  from public.broker_capture_request_authorizations request_auth
  join equora_private.broker_capture_runtime_enrollment enrollment
    on enrollment.enabled is true
    and enrollment.user_id = request_auth.user_id
    and enrollment.provider_code = request_auth.provider_code
    and enrollment.broker_account_id = request_auth.broker_account_id
  join public.broker_capture_work_units work_unit
    on work_unit.id = request_auth.work_unit_id
    and work_unit.user_id = request_auth.user_id
    and work_unit.broker_account_id = request_auth.broker_account_id
    and work_unit.sync_activation_id = request_auth.sync_activation_id
    and work_unit.activation_generation = request_auth.activation_generation
  join public.broker_sync_activation_series series
    on series.id = request_auth.activation_series_id
    and series.current_sync_activation_id = request_auth.sync_activation_id
    and series.current_activation_generation = request_auth.activation_generation
  join public.broker_sync_activations activation
    on activation.id = series.current_sync_activation_id
    and activation.activation_generation = series.current_activation_generation
    and activation.activation_state = 'active'
  join public.broker_sync_lane_requirements requirement
    on requirement.id = request_auth.lane_requirement_id
    and requirement.superseded_at is null
  join public.broker_sync_lane_states lane
    on lane.id = request_auth.lane_state_id
    and lane.lane_requirement_id = requirement.id
    and lane.superseded_at is null
  left join public.broker_capture_scope_finalization_receipts receipt
    on receipt.request_authorization_id = request_auth.id
  where request_auth.page_commit_input_digest is not null
    and request_auth.page_commit_result ->> 'status' = 'page_committed'
    and work_unit.status = 'terminal_observed'
    and work_unit.checkpoint ->> 'status' = 'terminal_observed'
    and receipt.request_authorization_id is null
  order by work_unit.updated_at, work_unit.id
  limit 1;
  if v_authorization_id is null then
    return jsonb_build_object(
      'status', 'no_pending', 'requestAuthorizationId', null,
      'authorityBlocked', true
    );
  end if;
  return jsonb_build_object(
    'status', 'pending', 'requestAuthorizationId', v_authorization_id,
    'authorityBlocked', true
  );
end;
$$;

create or replace function public.equora_load_broker_capture_material_v1(
  p_request_authorization_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '8s'
as $$
declare
  v_now timestamptz;
  v_authorization public.broker_capture_request_authorizations%rowtype;
  v_work_unit public.broker_capture_work_units%rowtype;
  v_run public.broker_capture_runs%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_connection_account public.broker_connection_accounts%rowtype;
  v_connection public.broker_connections%rowtype;
  v_enrollment equora_private.broker_capture_runtime_enrollment%rowtype;
  v_credential public.broker_credentials%rowtype;
  v_integrity_key equora_private.broker_capture_integrity_keys%rowtype;
begin
  if p_request_authorization_id is null then
    raise exception 'MATERIAL_LOAD_INVALID_INPUT';
  end if;
  select * into v_authorization
  from public.broker_capture_request_authorizations
  where id = p_request_authorization_id;
  if not found then raise exception 'MATERIAL_LOAD_AUTHORIZATION_NOT_FOUND'; end if;

  select * into v_work_unit from public.broker_capture_work_units
  where id = v_authorization.work_unit_id for update;
  if not found then raise exception 'MATERIAL_LOAD_AUTHORITY_INVALID'; end if;
  select * into v_run from public.broker_capture_runs
  where id = v_work_unit.run_id for update;
  select * into v_series from public.broker_sync_activation_series
  where id = v_authorization.activation_series_id for update;
  select * into v_activation from public.broker_sync_activations
  where id = v_authorization.sync_activation_id for update;
  select * into v_connection_account from public.broker_connection_accounts
  where id = v_activation.connection_account_id for share;
  select * into v_connection from public.broker_connections
  where id = v_connection_account.connection_id for share;
  select * into v_enrollment
  from equora_private.broker_capture_runtime_enrollment
  where singleton_key is true for share;
  select * into v_credential from public.broker_credentials
  where id = v_authorization.active_credential_id for share;
  select * into v_integrity_key from equora_private.broker_capture_integrity_keys
  where id = v_activation.capture_integrity_key_id for share;
  v_now := clock_timestamp();
  if v_run.id is null or v_series.id is null or v_activation.id is null
    or v_connection_account.id is null or v_connection.id is null
    or v_credential.id is null or v_integrity_key.id is null
    or v_enrollment.singleton_key is distinct from true
    or v_enrollment.enabled is distinct from true
    or v_enrollment.user_id is distinct from v_authorization.user_id
    or v_enrollment.provider_code is distinct from v_authorization.provider_code
    or v_enrollment.broker_account_id is distinct from v_authorization.broker_account_id
    or v_authorization.authorization_contract_version <> 'broker-request-authorization-v1'
    or v_authorization.send_deadline_at <= v_now
    or v_authorization.page_commit_input_digest is not null
    or v_work_unit.row_version <> v_authorization.work_unit_row_version
    or v_work_unit.status not in ('leased', 'running')
    or v_series.current_sync_activation_id <> v_activation.id
    or v_series.current_activation_generation <> v_activation.activation_generation
    or v_series.series_row_version <> v_authorization.series_row_version
    or v_series.authority_epoch <> v_authorization.authority_epoch
    or v_activation.activation_row_version <> v_authorization.activation_row_version
    or v_activation.activation_state <> 'active'
    or v_activation.active_credential_id <> v_credential.id
    or v_activation.active_credential_key_version <> v_credential.key_version
    or v_authorization.active_credential_key_version <> v_credential.key_version
    or v_connection.status <> 'ready'
    or v_connection.credential_reference <> v_credential.id
    or not v_connection.permissions @>
      array['read_only_user_attested']::text[]
    or not v_connection.permissions <@
      array['read_only_user_attested']::text[]
    or v_integrity_key.key_version <> v_activation.capture_integrity_key_version
    or v_integrity_key.status <> 'active'
    or v_integrity_key.valid_from > v_now
    or (v_integrity_key.valid_to is not null and v_integrity_key.valid_to <= v_now)
  then raise exception 'MATERIAL_LOAD_AUTHORITY_INVALID'; end if;

  return jsonb_build_object(
    'status', 'material_loaded',
    'requestAuthorizationId', v_authorization.id,
    'userId', v_authorization.user_id,
    'providerCode', v_authorization.provider_code,
    'brokerAccountId', v_authorization.broker_account_id,
    'connectionAccountId', v_activation.connection_account_id,
    'syncActivationId', v_authorization.sync_activation_id,
    'activationGeneration', v_authorization.activation_generation,
    'credentialReference', jsonb_build_object(
      'id', v_credential.id, 'keyVersion', v_credential.key_version
    ),
    'encryptedPayload', v_credential.encrypted_payload,
    'integrityKeyReference', jsonb_build_object(
      'id', v_integrity_key.id, 'keyVersion', v_integrity_key.key_version
    ),
    'integrityKeyBase64', encode(v_integrity_key.key_material, 'base64'),
    'sendDeadlineAt', v_authorization.send_deadline_at,
    'authorityBlocked', true
  );
exception
  when lock_not_available then raise exception 'MATERIAL_LOAD_LOCK_TIMEOUT';
  when query_canceled then raise exception 'MATERIAL_LOAD_STATEMENT_TIMEOUT';
end;
$$;

create or replace function public.equora_finalize_broker_capture_scope_v1(
  p_request_authorization_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
set statement_timeout = '20s'
as $$
declare
  v_authorization public.broker_capture_request_authorizations%rowtype;
  v_work_unit public.broker_capture_work_units%rowtype;
  v_run public.broker_capture_runs%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_enrollment equora_private.broker_capture_runtime_enrollment%rowtype;
  v_scope public.broker_sync_scopes%rowtype;
  v_requirement public.broker_sync_lane_requirements%rowtype;
  v_lane public.broker_sync_lane_states%rowtype;
  v_receipt public.broker_capture_scope_finalization_receipts%rowtype;
  v_input_digest text;
  v_bucket public.broker_sync_scope_buckets%rowtype;
  v_event_digests jsonb;
  v_page_digests jsonb;
  v_event_set_digest text;
  v_content_digest text;
  v_watermark_time bigint;
  v_watermark_tie text;
  v_lane_result jsonb;
  v_result jsonb;
begin
  if p_request_authorization_id is null or p_request_id is null then
    raise exception 'SCOPE_FINALIZE_INVALID_INPUT';
  end if;
  select * into v_authorization
  from public.broker_capture_request_authorizations
  where id = p_request_authorization_id;
  if not found then raise exception 'SCOPE_FINALIZE_AUTHORIZATION_NOT_FOUND'; end if;
  v_input_digest := public.equora_scheduler_digest_v1(
    'broker-capture-scope-finalize-v1',
    jsonb_build_object(
      'requestId', p_request_id::text,
      'requestAuthorizationId', p_request_authorization_id::text,
      'workUnitId', v_authorization.work_unit_id::text,
      'scopeId', v_authorization.scope_id::text
    )
  );
  select * into v_receipt
  from public.broker_capture_scope_finalization_receipts
  where request_id = p_request_id;
  if found then
    if v_receipt.request_authorization_id <> p_request_authorization_id
      or v_receipt.input_digest <> v_input_digest
    then raise exception 'SCOPE_FINALIZE_REQUEST_DRIFT'; end if;
    return v_receipt.result;
  end if;
  select * into v_receipt
  from public.broker_capture_scope_finalization_receipts
  where request_authorization_id = p_request_authorization_id;
  if found then return v_receipt.result; end if;

  select * into v_work_unit from public.broker_capture_work_units
  where id = v_authorization.work_unit_id for update;
  select * into v_authorization from public.broker_capture_request_authorizations
  where id = p_request_authorization_id for update;
  select * into v_run from public.broker_capture_runs
  where id = v_work_unit.run_id for update;
  select * into v_series from public.broker_sync_activation_series
  where id = v_authorization.activation_series_id for update;
  select * into v_activation from public.broker_sync_activations
  where id = v_authorization.sync_activation_id for update;
  select * into v_enrollment
  from equora_private.broker_capture_runtime_enrollment
  where singleton_key is true for share;
  select * into v_scope from public.broker_sync_scopes
  where id = v_authorization.scope_id for update;
  select * into v_requirement from public.broker_sync_lane_requirements
  where id = v_authorization.lane_requirement_id for update;
  select * into v_lane from public.broker_sync_lane_states
  where id = v_authorization.lane_state_id for update;
  -- A concurrent recovery with a different request ID may have waited on the
  -- Work Unit lock. Re-read the append-once receipt after that wait so both
  -- callers converge on the same deterministic result instead of surfacing a
  -- false race failure.
  select * into v_receipt
  from public.broker_capture_scope_finalization_receipts
  where request_authorization_id = p_request_authorization_id;
  if found then return v_receipt.result; end if;
  if v_work_unit.id is null or v_run.id is null or v_series.id is null
    or v_activation.id is null or v_scope.id is null
    or v_requirement.id is null or v_lane.id is null
    or v_enrollment.singleton_key is distinct from true
    or v_enrollment.enabled is distinct from true
    or v_enrollment.user_id is distinct from v_authorization.user_id
    or v_enrollment.provider_code is distinct from v_authorization.provider_code
    or v_enrollment.broker_account_id is distinct from v_authorization.broker_account_id
    or v_authorization.page_commit_input_digest is null
    or v_authorization.page_commit_result ->> 'status' <> 'page_committed'
    or v_work_unit.status <> 'terminal_observed'
    or v_work_unit.checkpoint ->> 'status' <> 'terminal_observed'
    or v_scope.closed_at is null
    or v_scope.scope_completeness not in ('unverified', 'complete_for_profile')
    or v_scope.source_channel <> 'provider_api_observation'
    or v_scope.coverage_basis <> 'provider_observed'
    or v_series.current_sync_activation_id <> v_activation.id
    or v_series.current_activation_generation <> v_activation.activation_generation
    or v_activation.activation_state <> 'active'
    or v_requirement.superseded_at is not null or v_lane.superseded_at is not null
    or v_scope.lane_requirement_id <> v_requirement.id
    or v_scope.lane_state_id <> v_lane.id
    or v_scope.policy_generation <> v_lane.policy_generation
  then raise exception 'SCOPE_FINALIZE_AUTHORITY_INVALID'; end if;

  select coalesce(jsonb_agg(result.page_observation_digest
    order by result.request_sequence), '[]'::jsonb)
  into v_page_digests
  from public.broker_provider_request_results result
  where result.scope_id = v_scope.id and result.run_id = v_run.id;

  for v_bucket in
    select * from public.broker_sync_scope_buckets
    where scope_id = v_scope.id order by bucket_ordinal for update
  loop
    select coalesce(jsonb_agg(distinct raw_event.raw_event_content_digest
      order by raw_event.raw_event_content_digest), '[]'::jsonb)
    into v_event_digests
    from public.broker_capture_event_observations observation
    join public.broker_provider_request_results result
      on result.id = observation.request_result_id
      and result.run_id = observation.run_id
    join public.broker_capture_raw_events raw_event
      on raw_event.id = observation.raw_event_id
    where result.scope_id = v_scope.id
      and raw_event.provider_occurred_at_us >= v_bucket.bucket_start_ms * 1000
      and raw_event.provider_occurred_at_us < v_bucket.bucket_end_ms * 1000;
    v_event_set_digest := public.equora_scheduler_digest_v1(
      'broker-scope-bucket-event-set-v1',
      jsonb_build_object(
        'scopeId', v_scope.id::text,
        'bucketOrdinal', v_bucket.bucket_ordinal,
        'rawEventContentDigests', v_event_digests
      )
    );
    v_content_digest := public.equora_scheduler_digest_v1(
      'broker-scope-bucket-content-v1',
      jsonb_build_object(
        'scopeId', v_scope.id::text,
        'bucketOrdinal', v_bucket.bucket_ordinal,
        'pageObservationDigests', v_page_digests,
        'eventSetDigest', v_event_set_digest
      )
    );
    update public.broker_sync_scope_buckets
    set stability_status = 'observed_once',
        event_set_digest = v_event_set_digest,
        content_digest = v_content_digest,
        observed_at = v_scope.closed_at,
        updated_at = clock_timestamp()
    where id = v_bucket.id and stability_status = 'not_observed';
  end loop;
  if (select count(*) from public.broker_sync_scope_buckets
      where scope_id = v_scope.id and stability_status <> 'observed_once') <> 0
  then raise exception 'SCOPE_FINALIZE_BUCKET_DRIFT'; end if;

  update public.broker_sync_scopes
  set scope_completeness = 'complete_for_profile',
      stability_status = 'observed_once'
  where id = v_scope.id
    and scope_completeness in ('unverified', 'complete_for_profile')
  returning * into v_scope;
  if not found then raise exception 'SCOPE_FINALIZE_SCOPE_CAS_MISMATCH'; end if;

  select raw_event.provider_occurred_at_us / 1000,
    raw_event.external_event_id
  into v_watermark_time, v_watermark_tie
  from public.broker_capture_event_observations observation
  join public.broker_provider_request_results result
    on result.id = observation.request_result_id and result.run_id = observation.run_id
  join public.broker_capture_raw_events raw_event
    on raw_event.id = observation.raw_event_id
  where result.scope_id = v_scope.id and raw_event.external_event_id ~ '^(0|[1-9][0-9]{0,127})$'
  order by raw_event.provider_occurred_at_us desc,
    length(raw_event.external_event_id) desc, raw_event.external_event_id desc
  limit 1;
  v_watermark_time := coalesce(v_watermark_time, v_scope.request_end_ms);
  v_watermark_tie := coalesce(v_watermark_tie, '0');

  v_lane_result := public.equora_record_broker_sync_lane_success_v1(
    v_lane.id, v_scope.id, v_series.series_row_version,
    v_activation.activation_row_version, v_lane.row_version,
    v_watermark_time, v_watermark_tie, gen_random_uuid()
  );
  v_result := jsonb_build_object(
    'status', 'scope_finalized',
    'requestAuthorizationId', v_authorization.id,
    'scopeId', v_scope.id,
    'laneStateId', v_lane.id,
    'watermarkTimeMs', v_watermark_time,
    'watermarkTieBreaker', v_watermark_tie,
    'laneResult', v_lane_result,
    'automaticImportAuthorized', false,
    'tradingAuthorized', false,
    'authorityBlocked', true
  );
  insert into public.broker_capture_scope_finalization_receipts (
    request_id, request_authorization_id, user_id, broker_account_id,
    sync_activation_id, activation_generation, scope_id, lane_state_id,
    input_digest, result, finalized_at
  ) values (
    p_request_id, v_authorization.id, v_authorization.user_id,
    v_authorization.broker_account_id, v_authorization.sync_activation_id,
    v_authorization.activation_generation, v_scope.id, v_lane.id,
    v_input_digest, v_result, clock_timestamp()
  );
  return v_result;
exception
  when unique_violation then raise exception 'SCOPE_FINALIZE_REQUEST_RACE';
  when lock_not_available then raise exception 'SCOPE_FINALIZE_LOCK_TIMEOUT';
  when query_canceled then raise exception 'SCOPE_FINALIZE_STATEMENT_TIMEOUT';
end;
$$;

alter function public.equora_request_mexc_connection_setup_v1(
  uuid,text,jsonb,boolean
) owner to equora_broker_capture_owner;
alter function public.equora_apply_mexc_connection_setup_v1(
  uuid,text,text,text,text,text
) owner to equora_broker_capture_owner;
alter function public.equora_request_mexc_connection_revocation_v1(uuid,uuid)
  owner to equora_broker_capture_owner;
alter function public.equora_apply_mexc_connection_revocation_v1(uuid)
  owner to equora_broker_capture_owner;
alter function public.equora_find_claimable_broker_capture_work_unit_v1()
  owner to equora_broker_capture_owner;
alter function public.equora_find_pending_yielded_broker_capture_work_unit_v1()
  owner to equora_broker_capture_owner;
alter function public.equora_find_pending_broker_capture_scope_finalization_v1()
  owner to equora_broker_capture_owner;
alter function public.equora_load_broker_capture_material_v1(uuid)
  owner to equora_broker_capture_owner;
alter function public.equora_finalize_broker_capture_scope_v1(uuid,uuid)
  owner to equora_broker_capture_owner;

do $$
declare
  v_signature text;
  v_procedure regprocedure;
  v_acl record;
begin
  foreach v_signature in array array[
    'public.equora_request_mexc_connection_setup_v1(uuid,text,jsonb,boolean)',
    'public.equora_apply_mexc_connection_setup_v1(uuid,text,text,text,text,text)',
    'public.equora_request_mexc_connection_revocation_v1(uuid,uuid)',
    'public.equora_apply_mexc_connection_revocation_v1(uuid)',
    'public.equora_find_claimable_broker_capture_work_unit_v1()',
    'public.equora_find_pending_yielded_broker_capture_work_unit_v1()',
    'public.equora_find_pending_broker_capture_scope_finalization_v1()',
    'public.equora_load_broker_capture_material_v1(uuid)',
    'public.equora_finalize_broker_capture_scope_v1(uuid,uuid)'
  ] loop
    v_procedure := to_regprocedure(v_signature);
    if v_procedure is null then
      raise exception 'RUNTIME_DEPLOYMENT_FUNCTION_MISSING: %', v_signature;
    end if;
    for v_acl in
      select distinct exploded.grantee, role_row.rolname
      from pg_proc procedure_row
      cross join lateral aclexplode(coalesce(
        procedure_row.proacl, acldefault('f', procedure_row.proowner)
      )) exploded
      left join pg_roles role_row on role_row.oid = exploded.grantee
      where procedure_row.oid = v_procedure
        and exploded.privilege_type = 'EXECUTE'
        and exploded.grantee <> procedure_row.proowner
    loop
      if v_acl.grantee = 0 then
        execute format('revoke execute on function %s from public', v_procedure);
      elsif v_acl.rolname is not null then
        execute format(
          'revoke execute on function %s from %I', v_procedure, v_acl.rolname
        );
      else
        raise exception 'RUNTIME_DEPLOYMENT_FUNCTION_ACL_GRANTEE_INVALID';
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.equora_request_mexc_connection_setup_v1(
  uuid,text,jsonb,boolean
) from public, anon, authenticated, service_role;
grant execute on function public.equora_request_mexc_connection_setup_v1(
  uuid,text,jsonb,boolean
) to authenticated;
revoke all on function public.equora_apply_mexc_connection_setup_v1(
  uuid,text,text,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.equora_apply_mexc_connection_setup_v1(
  uuid,text,text,text,text,text
) to service_role;
revoke all on function public.equora_request_mexc_connection_revocation_v1(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.equora_request_mexc_connection_revocation_v1(uuid,uuid)
  to authenticated;
revoke all on function public.equora_apply_mexc_connection_revocation_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.equora_apply_mexc_connection_revocation_v1(uuid)
  to service_role;
revoke all on function public.equora_find_claimable_broker_capture_work_unit_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.equora_find_claimable_broker_capture_work_unit_v1()
  to service_role;
revoke all on function public.equora_find_pending_yielded_broker_capture_work_unit_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.equora_find_pending_yielded_broker_capture_work_unit_v1()
  to service_role;
revoke all on function public.equora_find_pending_broker_capture_scope_finalization_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.equora_find_pending_broker_capture_scope_finalization_v1()
  to service_role;
revoke all on function public.equora_load_broker_capture_material_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.equora_load_broker_capture_material_v1(uuid)
  to service_role;
revoke all on function public.equora_finalize_broker_capture_scope_v1(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.equora_finalize_broker_capture_scope_v1(uuid,uuid)
  to service_role;

-- Remove every project-specific/default-privilege grantee from the complete
-- broker surface before the final semantic contract is fingerprinted. Standard
-- Supabase roles remain subject to the exact per-layer grants and postflights.
do $$
declare
  v_relation regclass;
  v_procedure regprocedure;
  v_acl record;
begin
  for v_relation in
    select relation_row.oid::regclass
    from pg_class relation_row
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    where relation_row.relkind in ('r','p')
      and (
        (namespace_row.nspname = 'public' and relation_row.relname like 'broker\_%' escape '\')
        or (namespace_row.nspname = 'equora_private'
          and relation_row.relname in (
            'broker_capture_integrity_keys', 'broker_capture_runtime_enrollment'
          ))
      )
    order by namespace_row.nspname, relation_row.relname
  loop
    for v_acl in
      select distinct exploded.grantee, role_row.rolname
      from pg_class relation_row
      cross join lateral aclexplode(coalesce(
        relation_row.relacl, acldefault('r', relation_row.relowner)
      )) exploded
      left join pg_roles role_row on role_row.oid = exploded.grantee
      where relation_row.oid = v_relation
        and exploded.grantee <> relation_row.relowner
        and coalesce(role_row.rolname, 'PUBLIC') not in (
          'anon', 'authenticated', 'service_role', 'equora_broker_capture_owner'
        )
        and not (
          v_relation = 'equora_private.broker_capture_runtime_enrollment'::regclass
          and role_row.rolname = 'postgres'
          and exploded.privilege_type in ('SELECT', 'UPDATE')
          and exploded.is_grantable is false
        )
    loop
      if v_acl.grantee = 0 then
        execute format('revoke all privileges on table %s from public', v_relation);
      elsif v_acl.rolname is not null then
        execute format('revoke all privileges on table %s from %I', v_relation, v_acl.rolname);
      else
        raise exception 'RUNTIME_DEPLOYMENT_GLOBAL_TABLE_ACL_GRANTEE_INVALID';
      end if;
    end loop;
  end loop;

  -- Secret/enrollment tables have no direct runtime-role surface at all.
  for v_relation in select unnest(array[
    'public.broker_credentials'::regclass,
    'equora_private.broker_capture_integrity_keys'::regclass,
    'equora_private.broker_capture_runtime_enrollment'::regclass
  ]::regclass[])
  loop
    execute format(
      'revoke all privileges on table %s from public, anon, authenticated, service_role',
      v_relation
    );
  end loop;

  for v_procedure in
    select procedure_row.oid::regprocedure
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname like 'equora\_%' escape '\'
    order by procedure_row.oid::regprocedure::text
  loop
    for v_acl in
      select distinct exploded.grantee, role_row.rolname
      from pg_proc procedure_row
      cross join lateral aclexplode(coalesce(
        procedure_row.proacl, acldefault('f', procedure_row.proowner)
      )) exploded
      left join pg_roles role_row on role_row.oid = exploded.grantee
      where procedure_row.oid = v_procedure
        and exploded.privilege_type = 'EXECUTE'
        and exploded.grantee <> procedure_row.proowner
        and coalesce(role_row.rolname, 'PUBLIC') not in (
          'anon', 'authenticated', 'service_role', 'equora_broker_capture_owner'
        )
    loop
      if v_acl.grantee = 0 then
        execute format('revoke execute on function %s from public', v_procedure);
      elsif v_acl.rolname is not null then
        execute format('revoke execute on function %s from %I', v_procedure, v_acl.rolname);
      else
        raise exception 'RUNTIME_DEPLOYMENT_GLOBAL_FUNCTION_ACL_GRANTEE_INVALID';
      end if;
    end loop;
  end loop;
end;
$$;

do $$
begin
  revoke create on schema public, equora_private from equora_broker_capture_owner;
  execute format(
    'revoke equora_broker_capture_owner from %I', current_user
  );
end;
$$;

insert into equora_private.schema_migrations (migration_id, contract_fingerprint)
values (
  'equora_v57.61.0_g1_runtime_deployment_v1',
  '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96'
) on conflict (migration_id) do nothing;

do $$
declare
  v_function record;
  v_procedure regprocedure;
  v_actual_configs text[];
  v_expected_configs text[];
  v_acl record;
  v_table regclass;
  v_owner_membership_drift boolean;
begin
  if not exists (
    select 1 from equora_private.schema_migrations
    where migration_id = 'equora_v57.61.0_g1_runtime_deployment_v1'
      and contract_fingerprint =
        '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96'
  ) then raise exception 'RUNTIME_DEPLOYMENT_MIGRATION_DRIFT'; end if;

  -- PostgreSQL 16+ retains an admin-only creator grant for a role created by
  -- postgres. It is safe only while it is neither inherited nor SET-able.
  if current_setting('server_version_num')::integer >= 160000 then
    execute $membership$
      select exists (
        select 1
        from pg_auth_members membership_row
        join pg_roles granted_role
          on granted_role.oid = membership_row.roleid
        join pg_roles member_role
          on member_role.oid = membership_row.member
        where member_role.rolname = 'equora_broker_capture_owner'
          or (
            granted_role.rolname = 'equora_broker_capture_owner'
            and (
              member_role.rolname <> 'postgres'
              or membership_row.admin_option is distinct from true
              or membership_row.inherit_option is distinct from false
              or membership_row.set_option is distinct from false
            )
          )
      )
    $membership$ into v_owner_membership_drift;
  else
    select exists (
      select 1
      from pg_auth_members membership_row
      join pg_roles granted_role
        on granted_role.oid = membership_row.roleid
      join pg_roles member_role
        on member_role.oid = membership_row.member
      where member_role.rolname = 'equora_broker_capture_owner'
        or granted_role.rolname = 'equora_broker_capture_owner'
    ) into v_owner_membership_drift;
  end if;

  if not exists (
    select 1
    from pg_roles
    where rolname = 'equora_broker_capture_owner'
      and rolcanlogin = false
      and rolinherit = false
      and rolbypassrls = true
      and rolsuper = false
      and rolcreatedb = false
      and rolcreaterole = false
      and rolreplication = false
  ) or v_owner_membership_drift
    or has_schema_privilege('equora_broker_capture_owner', 'public', 'create')
    or has_schema_privilege(
      'equora_broker_capture_owner', 'equora_private', 'create'
    )
  then
    raise exception 'RUNTIME_DEPLOYMENT_OWNER_DRIFT';
  end if;

  for v_function in
    select *
    from (values
      (
        'public.equora_request_mexc_connection_setup_v1(uuid,text,jsonb,boolean)',
        'authenticated',
        array['lock_timeout=2s','search_path=""','statement_timeout=5s']::text[]
      ),
      (
        'public.equora_apply_mexc_connection_setup_v1(uuid,text,text,text,text,text)',
        'service_role',
        array['lock_timeout=3s','search_path=""','statement_timeout=45s']::text[]
      ),
      (
        'public.equora_request_mexc_connection_revocation_v1(uuid,uuid)',
        'authenticated',
        array['lock_timeout=2s','search_path=""','statement_timeout=5s']::text[]
      ),
      (
        'public.equora_apply_mexc_connection_revocation_v1(uuid)',
        'service_role',
        array['lock_timeout=3s','search_path=""','statement_timeout=15s']::text[]
      ),
      (
        'public.equora_find_claimable_broker_capture_work_unit_v1()',
        'service_role',
        array['search_path=""','statement_timeout=5s']::text[]
      ),
      (
        'public.equora_find_pending_yielded_broker_capture_work_unit_v1()',
        'service_role',
        array['search_path=""','statement_timeout=5s']::text[]
      ),
      (
        'public.equora_find_pending_broker_capture_scope_finalization_v1()',
        'service_role',
        array['search_path=""','statement_timeout=5s']::text[]
      ),
      (
        'public.equora_load_broker_capture_material_v1(uuid)',
        'service_role',
        array['lock_timeout=2s','search_path=""','statement_timeout=8s']::text[]
      ),
      (
        'public.equora_finalize_broker_capture_scope_v1(uuid,uuid)',
        'service_role',
        array['lock_timeout=3s','search_path=""','statement_timeout=20s']::text[]
      )
    ) as expected(signature, runtime_role, expected_configs)
  loop
    v_procedure := to_regprocedure(v_function.signature);
    if v_procedure is null then
      raise exception 'RUNTIME_DEPLOYMENT_FUNCTION_MISSING: %',
        v_function.signature;
    end if;

    if not exists (
      select 1
      from pg_proc procedure_row
      join pg_roles owner_row on owner_row.oid = procedure_row.proowner
      where procedure_row.oid = v_procedure
        and procedure_row.prosecdef = true
        and owner_row.rolname = 'equora_broker_capture_owner'
    ) then
      raise exception 'RUNTIME_DEPLOYMENT_FUNCTION_DRIFT: %',
        v_function.signature;
    end if;

    select coalesce(array_agg(config_entry order by config_entry), array[]::text[])
    into v_actual_configs
    from pg_proc procedure_row
    cross join lateral unnest(
      coalesce(procedure_row.proconfig, array[]::text[])
    ) config_entry
    where procedure_row.oid = v_procedure;
    select array_agg(config_entry order by config_entry)
    into v_expected_configs
    from unnest(v_function.expected_configs) config_entry;
    if v_actual_configs is distinct from v_expected_configs then
      raise exception 'RUNTIME_DEPLOYMENT_FUNCTION_CONFIG_DRIFT: %',
        v_function.signature;
    end if;

    for v_acl in
      select exploded.grantee, role_row.rolname, exploded.is_grantable
      from pg_proc procedure_row
      cross join lateral aclexplode(coalesce(
        procedure_row.proacl, acldefault('f', procedure_row.proowner)
      )) exploded
      left join pg_roles role_row on role_row.oid = exploded.grantee
      where procedure_row.oid = v_procedure
        and exploded.privilege_type = 'EXECUTE'
        and exploded.grantee <> procedure_row.proowner
    loop
      if v_acl.rolname is distinct from v_function.runtime_role
        or v_acl.is_grantable
      then
        raise exception 'RUNTIME_DEPLOYMENT_FUNCTION_ACL_DRIFT: %',
          v_function.signature;
      end if;
    end loop;
    if not has_function_privilege(
      v_function.runtime_role, v_procedure, 'execute'
    ) then
      raise exception 'RUNTIME_DEPLOYMENT_FUNCTION_GRANT_MISSING: %',
        v_function.signature;
    end if;
  end loop;

  foreach v_table in array array[
    'public.broker_connection_setup_commands'::regclass,
    'public.broker_capture_scope_finalization_receipts'::regclass
  ] loop
    if not exists (
      select 1
      from pg_class relation_row
      join pg_roles owner_row on owner_row.oid = relation_row.relowner
      where relation_row.oid = v_table
        and relation_row.relkind = 'r'
        and relation_row.relrowsecurity = true
        and owner_row.rolname = 'equora_broker_capture_owner'
    ) or exists (
      select 1
      from pg_class relation_row
      cross join lateral aclexplode(coalesce(
        relation_row.relacl, acldefault('r', relation_row.relowner)
      )) exploded
      where relation_row.oid = v_table
        and exploded.grantee <> relation_row.relowner
    ) then
      raise exception 'RUNTIME_DEPLOYMENT_TABLE_DRIFT: %', v_table;
    end if;
  end loop;

  if not exists (
      select 1
      from pg_class relation_row
      join pg_roles owner_row on owner_row.oid = relation_row.relowner
      where relation_row.oid =
        'equora_private.broker_capture_runtime_enrollment'::regclass
        and relation_row.relkind = 'r'
        and owner_row.rolname = 'equora_broker_capture_owner'
    )
    or (
      select count(*)
      from pg_class relation_row
      cross join lateral aclexplode(coalesce(
        relation_row.relacl, acldefault('r', relation_row.relowner)
      )) exploded
      left join pg_roles role_row on role_row.oid = exploded.grantee
      where relation_row.oid =
        'equora_private.broker_capture_runtime_enrollment'::regclass
        and exploded.grantee <> relation_row.relowner
        and role_row.rolname = 'postgres'
        and exploded.privilege_type in ('SELECT', 'UPDATE')
        and exploded.is_grantable is false
    ) is distinct from 2
    or exists (
      select 1
      from pg_class relation_row
      cross join lateral aclexplode(coalesce(
        relation_row.relacl, acldefault('r', relation_row.relowner)
      )) exploded
      left join pg_roles role_row on role_row.oid = exploded.grantee
      where relation_row.oid =
        'equora_private.broker_capture_runtime_enrollment'::regclass
        and exploded.grantee <> relation_row.relowner
        and (
          role_row.rolname is distinct from 'postgres'
          or exploded.privilege_type not in ('SELECT', 'UPDATE')
          or exploded.is_grantable is distinct from false
        )
    )
  then
    raise exception 'RUNTIME_DEPLOYMENT_ENROLLMENT_ACL_DRIFT';
  end if;

  if has_table_privilege(
      'service_role', 'equora_private.broker_capture_integrity_keys', 'select'
    )
  then
    raise exception 'RUNTIME_DEPLOYMENT_PRIVATE_ACL_DRIFT';
  end if;
end;
$$;

commit;

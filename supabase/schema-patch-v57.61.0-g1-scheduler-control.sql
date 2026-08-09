-- Equora v57.61.0 - inactive G1 scheduler, bucket and durable lease control plane.
--
-- This migration is deliberately inert. It installs tables and closed RPCs,
-- but no cron job, trigger, timer, background worker, credential decryptor,
-- broker request, candidate builder, journal import or trading capability.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '120s';

do $$
declare
  v_existing_fingerprint text;
begin
  if to_regclass('public.broker_sync_activation_series') is null
    or to_regclass('public.broker_sync_activations') is null
    or to_regclass('public.broker_sync_lane_requirements') is null
    or to_regclass('public.broker_sync_lane_states') is null
    or to_regclass('public.broker_sync_scopes') is null
    or to_regclass('public.broker_capture_runs') is null
    or to_regclass('public.broker_capture_work_units') is null
    or to_regclass('public.broker_capture_request_authorizations') is null
    or to_regclass('equora_private.broker_capture_integrity_keys') is null
    or to_regprocedure('public.equora_capture_authority_digest_v1(uuid,integer,uuid,uuid,uuid,bigint,text,text,text,text,text,text)') is null
    or to_regprocedure('public.equora_mexc_page_scope_digest_v1(text,text,bigint,bigint,integer,integer,integer,text,text)') is null
    or to_regprocedure('public.equora_mexc_checkpoint_mac_v1(jsonb,bytea)') is null
  then
    raise exception 'SCHEDULER_CONTROL_PREREQUISITE_MISSING';
  end if;

  select contract_fingerprint into v_existing_fingerprint
  from equora_private.schema_migrations
  where migration_id = 'equora_v57.61.0_g1_scheduler_control_v2';
  if v_existing_fingerprint is not null
    and v_existing_fingerprint is distinct from
      '87158546782b900817d3f36501a2e43b5619906a2f07636d0cb1167b042e5ab7'
  then raise exception 'SCHEDULER_CONTROL_MIGRATION_DRIFT'; end if;
  if v_existing_fingerprint is null and (
    to_regclass('public.broker_capture_schedule_occurrences') is not null
    or to_regclass('public.broker_capture_materialization_commands') is not null
    or to_regclass('public.broker_capture_run_lane_inputs') is not null
    or to_regclass('public.broker_sync_scope_buckets') is not null
    or to_regclass('public.broker_capture_account_leases') is not null
    or to_regclass('public.broker_capture_lease_events') is not null
    or to_regclass('public.broker_capture_recovery_commands') is not null
    or to_regprocedure('public.equora_scheduler_digest_v1(text,jsonb)') is not null
    or to_regprocedure('public.equora_lock_capture_parent_chain_v1(uuid,timestamptz)') is not null
    or to_regprocedure('public.equora_lock_capture_parent_chain_v1(uuid,timestamptz,boolean)') is not null
    or to_regprocedure('public.equora_runtime_enrollment_allows_v1(uuid,text,uuid)') is not null
    or to_regprocedure('public.equora_materialize_next_due_broker_capture_v1(uuid,text)') is not null
    or to_regprocedure('public.equora_renew_broker_capture_lease_v1(uuid,bigint,uuid,uuid,text)') is not null
    or to_regprocedure('public.equora_release_broker_capture_lease_v1(uuid,bigint,uuid,uuid,text,text)') is not null
    or to_regprocedure('public.equora_continue_yielded_broker_capture_work_unit_v1(uuid,bigint,uuid,text)') is not null
    or to_regprocedure('public.equora_recover_expired_broker_capture_leases_v1(uuid,integer,text)') is not null
    or exists (
      select 1 from pg_attribute
      where attrelid = 'public.broker_sync_scopes'::regclass
        and attnum > 0 and not attisdropped and attname in (
          'bucket_count','bucket_set_contract_version','stability_bucket_set_digest'
        )
    )
  ) then raise exception 'SCHEDULER_CONTROL_PREEXISTING_PARTIAL_SCHEMA'; end if;

  if not exists (
    select 1 from pg_roles
    where rolname = 'equora_broker_capture_owner'
      and rolcanlogin = false and rolinherit = false and rolbypassrls = true
      and rolsuper = false and rolcreatedb = false and rolcreaterole = false
      and rolreplication = false
  ) then
    raise exception 'SCHEDULER_CONTROL_OWNER_INVALID';
  end if;

  if exists (
    select 1
    from pg_auth_members membership
    join pg_roles member_role on member_role.oid = membership.member
    join pg_roles granted_role on granted_role.oid = membership.roleid
    where member_role.rolname = 'equora_broker_capture_owner'
      or (
        granted_role.rolname = 'equora_broker_capture_owner'
        and (
          member_role.rolname <> 'postgres'
          or membership.admin_option is distinct from true
          or membership.inherit_option is distinct from false
          or membership.set_option is distinct from false
        )
      )
  ) then
    raise exception 'SCHEDULER_CONTROL_OWNER_MEMBERSHIP_INVALID';
  end if;

  if exists (
    select 1 from public.broker_capture_work_units
    where lease_token_digest is not null
  ) then
    raise exception 'SCHEDULER_ACTIVE_LEASE_MIGRATION_BLOCKED';
  end if;
end;
$$;

-- CREATE OR REPLACE on a re-run must be authorized for the dedicated NOLOGIN
-- owner before the first owned function is reached. Both temporary rights are
-- revoked again before the postflight.
do $$
begin
  grant create on schema public to equora_broker_capture_owner;
  execute format(
    'grant equora_broker_capture_owner to %I with set true', current_user
  );
end;
$$;

alter table public.broker_sync_scopes
  add column if not exists bucket_count integer,
  add column if not exists bucket_set_contract_version text,
  add column if not exists stability_bucket_set_digest text;

alter table public.broker_capture_runs
  add column if not exists row_version bigint not null default 0;

alter table public.broker_capture_work_units
  add column if not exists lease_epoch bigint not null default 0,
  add column if not exists lease_acquired_at timestamptz,
  add column if not exists lease_max_expires_at timestamptz,
  add column if not exists lease_renew_count integer not null default 0,
  add column if not exists lease_policy_version text,
  add column if not exists recovery_state text not null default 'none',
  add column if not exists predecessor_work_unit_id uuid,
  add column if not exists continuation_generation integer not null default 0;

alter table public.broker_capture_work_units
  drop constraint if exists broker_capture_work_units_status_check;
alter table public.broker_capture_work_units
  add constraint broker_capture_work_units_status_check check ((
    status in (
      'pending', 'leased', 'running', 'retry_pending', 'yielded',
      'terminal_observed', 'partial_failed', 'recovery_pending', 'cancelled'
    )
  ) is true);

alter table public.broker_capture_work_units
  drop constraint if exists broker_capture_work_units_lease_pair_check;
alter table public.broker_capture_work_units
  add constraint broker_capture_work_units_lease_pair_check check ((
    (
      status in ('leased', 'running')
      and lease_token_digest is not null
      and lease_token_digest ~ '^[a-f0-9]{64}$'
      and lease_token_format_version = 'uuid-sha256-v1'
      and lease_acquired_at is not null
      and lease_expires_at is not null
      and lease_max_expires_at is not null
      and lease_policy_version = 'lease-control-v1'
      and lease_epoch > 0
      and lease_renew_count between 0 and 3
      and lease_expires_at > lease_acquired_at
      and lease_max_expires_at >= lease_expires_at
      and lease_max_expires_at = lease_acquired_at + interval '180 seconds'
    )
    or
    (
      status not in ('leased', 'running')
      and lease_token_digest is null
      and lease_token_format_version is null
      and lease_acquired_at is null
      and lease_expires_at is null
      and lease_max_expires_at is null
      and lease_policy_version is null
      and lease_renew_count = 0
    )
  ) is true);

alter table public.broker_capture_work_units
  drop constraint if exists broker_capture_work_units_recovery_state_check;
alter table public.broker_capture_work_units
  add constraint broker_capture_work_units_recovery_state_check check ((
    recovery_state in ('none', 'uncertain_egress')
    and (
      (status = 'recovery_pending' and recovery_state = 'uncertain_egress')
      or (status <> 'recovery_pending' and recovery_state = 'none')
    )
  ) is true);

alter table public.broker_capture_work_units
  drop constraint if exists broker_capture_work_units_continuation_check;
alter table public.broker_capture_work_units
  add constraint broker_capture_work_units_continuation_check check ((
    continuation_generation >= 0
    and (
      (predecessor_work_unit_id is null and continuation_generation = 0)
      or (predecessor_work_unit_id is not null and continuation_generation > 0)
    )
  ) is true);

alter table public.broker_capture_runs
  drop constraint if exists broker_capture_runs_row_version_check;
alter table public.broker_capture_runs
  add constraint broker_capture_runs_row_version_check
  check ((row_version >= 0) is true);

alter table public.broker_sync_scopes
  drop constraint if exists broker_sync_scopes_bucket_set_check;
alter table public.broker_sync_scopes
  add constraint broker_sync_scopes_bucket_set_check check ((
    (
      bucket_count is null
      and bucket_set_contract_version is null
      and stability_bucket_set_digest is null
    )
    or
    (
      bucket_count between 1 and 31
      and bucket_set_contract_version = 'broker-request-bucket-set-v1'
      and stability_bucket_set_digest ~ '^[a-f0-9]{64}$'
      and stability_bucket_digest = stability_bucket_set_digest
    )
  ) is true);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_capture_work_units'::regclass
      and conname = 'broker_capture_work_units_predecessor_fkey'
  ) then
    alter table public.broker_capture_work_units
      add constraint broker_capture_work_units_predecessor_fkey
      foreign key (
        predecessor_work_unit_id, run_id, scope_id, user_id, broker_account_id
      ) references public.broker_capture_work_units (
        id, run_id, scope_id, user_id, broker_account_id
      ) on delete restrict deferrable initially deferred;
  end if;
end;
$$;

create unique index if not exists broker_capture_work_units_predecessor_unique
  on public.broker_capture_work_units (predecessor_work_unit_id)
  where predecessor_work_unit_id is not null;

create unique index if not exists broker_capture_work_units_open_scope_unique
  on public.broker_capture_work_units (scope_id)
  where status in ('pending', 'leased', 'running', 'retry_pending', 'recovery_pending');

create index if not exists idx_broker_capture_work_units_expired_authority
  on public.broker_capture_work_units (
    broker_account_id, lease_expires_at, id
  ) where status in ('leased', 'running') and lease_expires_at is not null;

create index if not exists idx_broker_capture_work_units_recovery_pending
  on public.broker_capture_work_units (updated_at, id)
  where status = 'recovery_pending';

create table if not exists public.broker_capture_schedule_occurrences (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  activation_series_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  lane_requirement_id uuid not null,
  lane_state_id uuid not null,
  policy_generation bigint not null,
  due_generation bigint not null,
  due_slot_at timestamptz not null,
  trigger_kind text not null,
  schedule_contract_version text not null,
  authority_plan_digest text not null,
  run_id uuid not null,
  scope_id uuid not null,
  work_unit_id uuid not null,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint broker_capture_schedule_occurrences_series_fkey
    foreign key (activation_series_id)
    references public.broker_sync_activation_series (id) on delete restrict,
  constraint broker_capture_schedule_occurrences_activation_fkey
    foreign key (
      sync_activation_id, user_id, broker_account_id, activation_generation
    ) references public.broker_sync_activations (
      id, user_id, broker_account_id, activation_generation
    ) on delete restrict,
  constraint broker_capture_schedule_occurrences_requirement_fkey
    foreign key (lane_requirement_id)
    references public.broker_sync_lane_requirements (id) on delete restrict,
  constraint broker_capture_schedule_occurrences_lane_fkey
    foreign key (lane_state_id)
    references public.broker_sync_lane_states (id) on delete restrict,
  constraint broker_capture_schedule_occurrences_versions_check check ((
    activation_generation > 0 and policy_generation > 0 and due_generation > 0
      and schedule_contract_version = 'broker-capture-schedule-v1'
  ) is true),
  constraint broker_capture_schedule_occurrences_trigger_check check ((
    trigger_kind in ('scheduler', 'startup_catchup', 'recovery')
  ) is true),
  constraint broker_capture_schedule_occurrences_digest_check check ((
    authority_plan_digest ~ '^[a-f0-9]{64}$'
  ) is true),
  constraint broker_capture_schedule_occurrences_status_check check ((
    status in ('scheduled', 'in_progress', 'succeeded', 'retryable_failed', 'stale')
  ) is true),
  constraint broker_capture_schedule_occurrences_time_check check ((
    updated_at >= created_at
  ) is true),
  constraint broker_capture_schedule_occurrences_due_unique unique (
    lane_state_id, policy_generation, due_generation, schedule_contract_version
  ),
  constraint broker_capture_schedule_occurrences_authority_key unique (
    id, run_id, scope_id, work_unit_id, user_id, broker_account_id,
    sync_activation_id, activation_generation, lane_requirement_id,
    lane_state_id, policy_generation, due_generation
  )
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_capture_schedule_occurrences'::regclass
      and conname = 'broker_capture_schedule_occurrences_authority_key'
  ) then
    alter table public.broker_capture_schedule_occurrences
      add constraint broker_capture_schedule_occurrences_authority_key
      unique (
        id, run_id, scope_id, work_unit_id, user_id, broker_account_id,
        sync_activation_id, activation_generation, lane_requirement_id,
        lane_state_id, policy_generation, due_generation
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_sync_lane_requirements'::regclass
      and conname = 'broker_sync_lane_requirements_scheduler_reference_key'
  ) then
    alter table public.broker_sync_lane_requirements
      add constraint broker_sync_lane_requirements_scheduler_reference_key
      unique (
        id, user_id, broker_account_id, sync_activation_id,
        activation_generation, policy_generation
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_sync_lane_states'::regclass
      and conname = 'broker_sync_lane_states_scheduler_reference_key'
  ) then
    alter table public.broker_sync_lane_states
      add constraint broker_sync_lane_states_scheduler_reference_key
      unique (
        id, lane_requirement_id, user_id, broker_account_id,
        sync_activation_id, activation_generation, policy_generation
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_sync_scopes'::regclass
      and conname = 'broker_sync_scopes_scheduler_reference_key'
  ) then
    alter table public.broker_sync_scopes
      add constraint broker_sync_scopes_scheduler_reference_key
      unique (
        id, user_id, broker_account_id, sync_activation_id,
        activation_generation, lane_requirement_id, lane_state_id,
        policy_generation
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_capture_work_units'::regclass
      and conname = 'broker_capture_work_units_scheduler_reference_key'
  ) then
    alter table public.broker_capture_work_units
      add constraint broker_capture_work_units_scheduler_reference_key
      unique (
        id, run_id, scope_id, user_id, broker_account_id,
        sync_activation_id, activation_generation, lane_requirement_id,
        lane_state_id, policy_generation
      );
  end if;
end;
$$;

alter table public.broker_capture_schedule_occurrences
  drop constraint if exists broker_capture_schedule_occurrences_run_fkey,
  drop constraint if exists broker_capture_schedule_occurrences_scope_fkey,
  drop constraint if exists broker_capture_schedule_occurrences_work_unit_fkey,
  drop constraint if exists broker_capture_schedule_occurrences_requirement_fkey,
  drop constraint if exists broker_capture_schedule_occurrences_lane_fkey;
alter table public.broker_capture_schedule_occurrences
  add constraint broker_capture_schedule_occurrences_run_fkey
    foreign key (
      run_id, user_id, broker_account_id, sync_activation_id,
      activation_generation
    ) references public.broker_capture_runs (
      id, user_id, broker_account_id, sync_activation_id,
      activation_generation
    ) on delete restrict deferrable initially deferred,
  add constraint broker_capture_schedule_occurrences_scope_fkey
    foreign key (
      scope_id, user_id, broker_account_id, sync_activation_id,
      activation_generation, lane_requirement_id, lane_state_id,
      policy_generation
    ) references public.broker_sync_scopes (
      id, user_id, broker_account_id, sync_activation_id,
      activation_generation, lane_requirement_id, lane_state_id,
      policy_generation
    ) on delete restrict deferrable initially deferred,
  add constraint broker_capture_schedule_occurrences_work_unit_fkey
    foreign key (
      work_unit_id, run_id, scope_id, user_id, broker_account_id,
      sync_activation_id, activation_generation, lane_requirement_id,
      lane_state_id, policy_generation
    ) references public.broker_capture_work_units (
      id, run_id, scope_id, user_id, broker_account_id,
      sync_activation_id, activation_generation, lane_requirement_id,
      lane_state_id, policy_generation
    ) on delete restrict deferrable initially deferred,
  add constraint broker_capture_schedule_occurrences_requirement_fkey
    foreign key (
      lane_requirement_id, user_id, broker_account_id, sync_activation_id,
      activation_generation, policy_generation
    ) references public.broker_sync_lane_requirements (
      id, user_id, broker_account_id, sync_activation_id,
      activation_generation, policy_generation
    ) on delete restrict,
  add constraint broker_capture_schedule_occurrences_lane_fkey
    foreign key (
      lane_state_id, lane_requirement_id, user_id, broker_account_id,
      sync_activation_id, activation_generation, policy_generation
    ) references public.broker_sync_lane_states (
      id, lane_requirement_id, user_id, broker_account_id,
      sync_activation_id, activation_generation, policy_generation
    ) on delete restrict;

create index if not exists idx_broker_capture_schedule_occurrences_series
  on public.broker_capture_schedule_occurrences (
    activation_series_id, sync_activation_id, due_slot_at, id
  );

create index if not exists idx_broker_capture_schedule_occurrences_lane_fkey
  on public.broker_capture_schedule_occurrences (
    lane_state_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, lane_requirement_id, policy_generation
  );

create table if not exists public.broker_capture_materialization_commands (
  request_id uuid primary key,
  input_digest text not null,
  status text not null,
  result jsonb,
  created_at timestamptz not null,
  applied_at timestamptz,
  constraint broker_capture_materialization_commands_digest_check check ((
    input_digest ~ '^[a-f0-9]{64}$'
  ) is true),
  constraint broker_capture_materialization_commands_status_check check ((
    status in ('pending', 'applied', 'no_due')
  ) is true),
  constraint broker_capture_materialization_commands_result_check check ((
    (status = 'pending' and result is null and applied_at is null)
    or (status in ('applied', 'no_due') and jsonb_typeof(result) = 'object'
      and applied_at is not null and applied_at >= created_at)
  ) is true)
);

create table if not exists public.broker_capture_run_lane_inputs (
  run_id uuid primary key,
  occurrence_id uuid not null unique,
  scope_id uuid not null,
  work_unit_id uuid not null,
  user_id uuid not null,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  lane_requirement_id uuid not null,
  lane_state_id uuid not null,
  policy_generation bigint not null,
  due_generation bigint not null,
  scheduled_due_at timestamptz not null,
  trigger_kind text not null,
  authority_plan_digest text not null,
  created_at timestamptz not null,
  constraint broker_capture_run_lane_inputs_run_fkey
    foreign key (
      run_id, user_id, broker_account_id, sync_activation_id,
      activation_generation
    ) references public.broker_capture_runs (
      id, user_id, broker_account_id, sync_activation_id,
      activation_generation
    ) on delete cascade,
  constraint broker_capture_run_lane_inputs_occurrence_fkey
    foreign key (
      occurrence_id, run_id, scope_id, work_unit_id, user_id, broker_account_id,
      sync_activation_id, activation_generation, lane_requirement_id,
      lane_state_id, policy_generation, due_generation
    ) references public.broker_capture_schedule_occurrences (
      id, run_id, scope_id, work_unit_id, user_id, broker_account_id,
      sync_activation_id, activation_generation, lane_requirement_id,
      lane_state_id, policy_generation, due_generation
    )
    deferrable initially deferred,
  constraint broker_capture_run_lane_inputs_lane_fkey
    foreign key (lane_state_id)
    references public.broker_sync_lane_states (id) on delete restrict,
  constraint broker_capture_run_lane_inputs_requirement_fkey
    foreign key (lane_requirement_id)
    references public.broker_sync_lane_requirements (id) on delete restrict,
  constraint broker_capture_run_lane_inputs_version_check check ((
    activation_generation > 0 and policy_generation > 0 and due_generation > 0
      and authority_plan_digest ~ '^[a-f0-9]{64}$'
  ) is true)
);

alter table public.broker_capture_run_lane_inputs
  add column if not exists scope_id uuid,
  add column if not exists work_unit_id uuid;
update public.broker_capture_run_lane_inputs lane_input
set scope_id = occurrence.scope_id,
    work_unit_id = occurrence.work_unit_id
from public.broker_capture_schedule_occurrences occurrence
where occurrence.id = lane_input.occurrence_id
  and (lane_input.scope_id is null or lane_input.work_unit_id is null);
alter table public.broker_capture_run_lane_inputs
  alter column scope_id set not null,
  alter column work_unit_id set not null,
  drop constraint if exists broker_capture_run_lane_inputs_occurrence_fkey;
alter table public.broker_capture_run_lane_inputs
  add constraint broker_capture_run_lane_inputs_occurrence_fkey
    foreign key (
      occurrence_id, run_id, scope_id, work_unit_id, user_id,
      broker_account_id, sync_activation_id, activation_generation,
      lane_requirement_id, lane_state_id, policy_generation, due_generation
    ) references public.broker_capture_schedule_occurrences (
      id, run_id, scope_id, work_unit_id, user_id,
      broker_account_id, sync_activation_id, activation_generation,
      lane_requirement_id, lane_state_id, policy_generation, due_generation
    ) deferrable initially deferred;

create index if not exists idx_broker_capture_run_lane_inputs_lane
  on public.broker_capture_run_lane_inputs (
    lane_state_id, policy_generation, due_generation, scheduled_due_at
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_sync_scopes'::regclass
      and conname = 'broker_sync_scopes_bucket_reference_unique'
  ) then
    alter table public.broker_sync_scopes
      add constraint broker_sync_scopes_bucket_reference_unique unique (
        id, user_id, broker_account_id, sync_activation_id,
        activation_generation, lane_requirement_id, lane_state_id,
        policy_generation, scope_digest
      );
  end if;
end;
$$;

create table if not exists public.broker_sync_scope_buckets (
  id uuid primary key,
  scope_id uuid not null,
  user_id uuid not null,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  lane_requirement_id uuid not null,
  lane_state_id uuid not null,
  policy_generation bigint not null,
  capability_id text not null,
  instrument_scope_key text not null,
  lane_id text not null,
  profile_id text not null,
  profile_version text not null,
  scope_digest text not null,
  bucket_set_contract_version text not null,
  bucket_ordinal integer not null,
  bucket_start_ms bigint not null,
  bucket_end_ms bigint not null,
  stability_generation integer not null,
  stability_status text not null,
  stability_bucket_digest text not null,
  event_set_digest text,
  content_digest text,
  observed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint broker_sync_scope_buckets_scope_fkey
    foreign key (
      scope_id, user_id, broker_account_id, sync_activation_id,
      activation_generation, lane_requirement_id, lane_state_id,
      policy_generation, scope_digest
    ) references public.broker_sync_scopes (
      id, user_id, broker_account_id, sync_activation_id,
      activation_generation, lane_requirement_id, lane_state_id,
      policy_generation, scope_digest
    ) on delete restrict,
  constraint broker_sync_scope_buckets_lane_fkey
    foreign key (lane_state_id)
    references public.broker_sync_lane_states (id) on delete restrict,
  constraint broker_sync_scope_buckets_versions_check check ((
    activation_generation > 0 and policy_generation > 0
      and stability_generation > 0
      and bucket_set_contract_version = 'broker-request-bucket-set-v1'
  ) is true),
  constraint broker_sync_scope_buckets_boundary_check check ((
    bucket_ordinal between 0 and 30
      and bucket_start_ms >= 0
      and bucket_end_ms = bucket_start_ms + 86400000
      and mod(bucket_start_ms, 86400000) = 0
      and mod(bucket_end_ms, 86400000) = 0
  ) is true),
  constraint broker_sync_scope_buckets_status_check check ((
    stability_status in (
      'not_observed', 'observed_once', 'observed_stable', 'invalidated'
    )
  ) is true),
  constraint broker_sync_scope_buckets_digest_check check ((
    scope_digest ~ '^[a-f0-9]{64}$'
      and stability_bucket_digest ~ '^[a-f0-9]{64}$'
      and (event_set_digest is null or event_set_digest ~ '^[a-f0-9]{64}$')
      and (content_digest is null or content_digest ~ '^[a-f0-9]{64}$')
  ) is true),
  constraint broker_sync_scope_buckets_observation_check check ((
    (
      stability_status = 'not_observed'
      and event_set_digest is null and content_digest is null
      and observed_at is null
    )
    or
    (
      stability_status <> 'not_observed'
      and event_set_digest is not null and content_digest is not null
      and observed_at is not null
    )
  ) is true),
  constraint broker_sync_scope_buckets_time_check check ((
    updated_at >= created_at
      and (observed_at is null or observed_at >= created_at)
  ) is true),
  constraint broker_sync_scope_buckets_ordinal_unique
    unique (scope_id, bucket_ordinal),
  constraint broker_sync_scope_buckets_boundary_unique
    unique (scope_id, bucket_start_ms, bucket_end_ms)
);

create index if not exists idx_broker_sync_scope_buckets_scope_fkey
  on public.broker_sync_scope_buckets (
    scope_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, lane_requirement_id, lane_state_id,
    policy_generation, scope_digest
  );

create index if not exists idx_broker_sync_scope_buckets_stability
  on public.broker_sync_scope_buckets (
    broker_account_id, sync_activation_id, capability_id,
    instrument_scope_key, lane_id, bucket_start_ms, stability_generation
  );

create table if not exists public.broker_capture_account_leases (
  broker_account_id uuid not null,
  sync_kind text not null,
  user_id uuid not null,
  state text not null,
  sync_activation_id uuid,
  activation_generation integer,
  work_unit_id uuid,
  run_id uuid,
  scope_id uuid,
  lane_state_id uuid,
  policy_generation bigint,
  work_unit_row_version bigint,
  lease_epoch bigint,
  lease_token_digest text,
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  lease_max_expires_at timestamptz,
  lease_renew_count integer,
  lease_policy_version text,
  row_version bigint not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (broker_account_id, sync_kind),
  constraint broker_capture_account_leases_account_fkey
    foreign key (broker_account_id, user_id)
    references public.broker_accounts (id, user_id) on delete restrict,
  constraint broker_capture_account_leases_work_unit_fkey
    foreign key (work_unit_id, run_id, scope_id, user_id, broker_account_id)
    references public.broker_capture_work_units (
      id, run_id, scope_id, user_id, broker_account_id
    ) on delete restrict,
  constraint broker_capture_account_leases_contract_check check ((
    sync_kind = 'provider_api_observation'
      and state in ('available', 'leased') and row_version >= 0
      and (
        (state = 'available'
          and sync_activation_id is null and activation_generation is null
          and work_unit_id is null and run_id is null and scope_id is null
          and lane_state_id is null and policy_generation is null
          and work_unit_row_version is null and lease_epoch is null
          and lease_token_digest is null and lease_acquired_at is null
          and lease_expires_at is null and lease_max_expires_at is null
          and lease_renew_count is null and lease_policy_version is null)
        or
        (state = 'leased'
          and sync_activation_id is not null and activation_generation > 0
          and work_unit_id is not null and run_id is not null
          and scope_id is not null and lane_state_id is not null
          and policy_generation > 0 and work_unit_row_version >= 0
          and lease_epoch > 0 and lease_token_digest ~ '^[a-f0-9]{64}$'
          and lease_acquired_at is not null and lease_expires_at is not null
          and lease_max_expires_at is not null
          and lease_policy_version = 'lease-control-v1'
          and lease_renew_count between 0 and 3)
      )
  ) is true),
  constraint broker_capture_account_leases_time_check check ((
    updated_at >= created_at
      and (
        state = 'available'
        or (lease_expires_at > lease_acquired_at
          and lease_max_expires_at >= lease_expires_at
          and lease_max_expires_at = lease_acquired_at + interval '180 seconds')
      )
  ) is true)
);

create index if not exists idx_broker_capture_account_leases_work_unit_fkey
  on public.broker_capture_account_leases (
    work_unit_id, run_id, scope_id, user_id, broker_account_id
  );

create index if not exists idx_broker_capture_account_leases_expiry
  on public.broker_capture_account_leases (lease_expires_at, broker_account_id);

create table if not exists public.broker_capture_lease_events (
  id uuid primary key,
  request_id uuid not null,
  event_kind text not null,
  input_digest text not null,
  user_id uuid not null,
  broker_account_id uuid not null,
  work_unit_id uuid not null,
  run_id uuid not null,
  scope_id uuid not null,
  previous_work_unit_row_version bigint not null,
  next_work_unit_row_version bigint not null,
  previous_lease_epoch bigint not null,
  next_lease_epoch bigint not null,
  previous_lease_expires_at timestamptz,
  next_lease_expires_at timestamptz,
  result_code text not null,
  result jsonb not null,
  created_at timestamptz not null,
  constraint broker_capture_lease_events_work_unit_fkey
    foreign key (work_unit_id, run_id, scope_id, user_id, broker_account_id)
    references public.broker_capture_work_units (
      id, run_id, scope_id, user_id, broker_account_id
    ) on delete restrict,
  constraint broker_capture_lease_events_kind_check check ((
    event_kind in (
      'renew', 'release', 'expired_recovery', 'uncertain_egress',
      'yield_continuation', 'uncertain_egress_resolution'
    )
  ) is true),
  constraint broker_capture_lease_events_digest_check check ((
    input_digest ~ '^[a-f0-9]{64}$'
  ) is true),
  constraint broker_capture_lease_events_version_check check ((
    previous_work_unit_row_version >= 0
      and previous_lease_epoch >= 0
      and (
        (next_work_unit_row_version = previous_work_unit_row_version + 1
          and next_lease_epoch = previous_lease_epoch + 1)
        or (
          event_kind = 'yield_continuation'
          and result_code = 'continued'
          and result ->> 'crossRequestReplay' = 'true'
          and next_work_unit_row_version = previous_work_unit_row_version
          and next_lease_epoch = previous_lease_epoch
        )
      )
  ) is true),
  constraint broker_capture_lease_events_result_check check ((
    result_code ~ '^[a-z][a-z0-9_]{0,62}$'
      and jsonb_typeof(result) = 'object'
  ) is true),
  constraint broker_capture_lease_events_request_unique
    unique (work_unit_id, request_id, event_kind)
);

-- CREATE TABLE IF NOT EXISTS does not update an earlier CHECK definition.
-- Recreate it unconditionally so a markerless/pre-final re-run converges on
-- the exact no-mutation continuation-replay contract.
alter table public.broker_capture_lease_events
  drop constraint if exists broker_capture_lease_events_version_check;
alter table public.broker_capture_lease_events
  add constraint broker_capture_lease_events_version_check check ((
    previous_work_unit_row_version >= 0
      and previous_lease_epoch >= 0
      and (
        (next_work_unit_row_version = previous_work_unit_row_version + 1
          and next_lease_epoch = previous_lease_epoch + 1)
        or (
          event_kind = 'yield_continuation'
          and result_code = 'continued'
          and result ->> 'crossRequestReplay' = 'true'
          and next_work_unit_row_version = previous_work_unit_row_version
          and next_lease_epoch = previous_lease_epoch
        )
      )
  ) is true);

create index if not exists idx_broker_capture_lease_events_work_unit_fkey
  on public.broker_capture_lease_events (
    work_unit_id, run_id, scope_id, user_id, broker_account_id
  );

create table if not exists public.broker_capture_recovery_commands (
  request_id uuid primary key,
  input_digest text not null,
  batch_limit integer not null,
  status text not null,
  result jsonb,
  created_at timestamptz not null,
  applied_at timestamptz,
  constraint broker_capture_recovery_commands_digest_check check ((
    input_digest ~ '^[a-f0-9]{64}$' and batch_limit between 1 and 25
  ) is true),
  constraint broker_capture_recovery_commands_status_check check ((
    status in ('pending', 'applied')
  ) is true),
  constraint broker_capture_recovery_commands_result_check check ((
    (status = 'pending' and result is null and applied_at is null)
    or (status = 'applied' and jsonb_typeof(result) = 'object'
      and applied_at is not null and applied_at >= created_at)
  ) is true)
);

alter table public.broker_capture_recovery_commands
  add column if not exists status text,
  add column if not exists created_at timestamptz;
update public.broker_capture_recovery_commands
set status = coalesce(status, 'applied'),
    created_at = coalesce(created_at, applied_at, clock_timestamp());
alter table public.broker_capture_recovery_commands
  alter column status set not null,
  alter column created_at set not null,
  alter column result drop not null,
  alter column applied_at drop not null,
  drop constraint if exists broker_capture_recovery_commands_status_check,
  drop constraint if exists broker_capture_recovery_commands_result_check;
alter table public.broker_capture_recovery_commands
  add constraint broker_capture_recovery_commands_status_check check ((
    status in ('pending', 'applied')
  ) is true),
  add constraint broker_capture_recovery_commands_result_check check ((
    (status = 'pending' and result is null and applied_at is null)
    or (status = 'applied' and jsonb_typeof(result) = 'object'
      and applied_at is not null and applied_at >= created_at)
  ) is true);

alter table public.broker_capture_schedule_occurrences enable row level security;
alter table public.broker_capture_materialization_commands enable row level security;
alter table public.broker_capture_run_lane_inputs enable row level security;
alter table public.broker_sync_scope_buckets enable row level security;
alter table public.broker_capture_account_leases enable row level security;
alter table public.broker_capture_lease_events enable row level security;
alter table public.broker_capture_recovery_commands enable row level security;

revoke all on table public.broker_capture_schedule_occurrences
  from public, anon, authenticated, service_role;
revoke all on table public.broker_capture_materialization_commands
  from public, anon, authenticated, service_role;
revoke all on table public.broker_capture_run_lane_inputs
  from public, anon, authenticated, service_role;
revoke all on table public.broker_sync_scope_buckets
  from public, anon, authenticated, service_role;
revoke all on table public.broker_capture_account_leases
  from public, anon, authenticated, service_role;
revoke all on table public.broker_capture_lease_events
  from public, anon, authenticated, service_role;
revoke all on table public.broker_capture_recovery_commands
  from public, anon, authenticated, service_role;

-- Row locking an identity requires table mutation privilege in PostgreSQL.
-- Keep that privilege in this postgres-owned, closed helper instead of
-- broadening the NOLOGIN scheduler owner's table ACL.
create or replace function public.equora_lock_active_broker_account_identity_v1(
  p_user_id uuid,
  p_broker_account_id uuid,
  p_provider_code text,
  p_environment text
) returns public.broker_account_identities
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
declare
  v_identity public.broker_account_identities%rowtype;
begin
  if p_user_id is null or p_broker_account_id is null
    or p_provider_code is null or p_environment is null
  then
    raise exception 'SCHEDULER_IDENTITY_INVALID_INPUT';
  end if;
  select * into strict v_identity
  from public.broker_account_identities identity_row
  where identity_row.user_id = p_user_id
    and identity_row.broker_account_id = p_broker_account_id
    and identity_row.provider_code = p_provider_code
    and identity_row.environment = p_environment
    and identity_row.status = 'active'
  order by identity_row.valid_from desc, identity_row.id
  limit 1
  for share;
  return v_identity;
exception
  when no_data_found then raise exception 'SCHEDULER_IDENTITY_NOT_ACTIVE';
  when lock_not_available then raise exception 'SCHEDULER_LOCK_TIMEOUT';
  when query_canceled then raise exception 'SCHEDULER_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_lock_active_broker_account_identity_v1(
  uuid,uuid,text,text
) from public, anon, authenticated, service_role;

-- Locks and validates the shared parent authority in the one global order used
-- by Claim, Permit, Page, Failure and Continuation. The Work Unit, Run, Series
-- and Activation must already be locked by the caller; the account Lease is
-- deliberately locked only after this helper returns.
create or replace function public.equora_lock_capture_parent_chain_v1(
  p_work_unit_id uuid,
  p_as_of timestamptz,
  p_lock_child_authority boolean
) returns boolean
language plpgsql
volatile
strict
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
declare
  v_work_unit public.broker_capture_work_units%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_connection_account public.broker_connection_accounts%rowtype;
  v_connection public.broker_connections%rowtype;
  v_credential public.broker_credentials%rowtype;
  v_integrity_key equora_private.broker_capture_integrity_keys%rowtype;
  v_account public.broker_accounts%rowtype;
  v_provider public.broker_providers%rowtype;
  v_scope public.broker_sync_scopes%rowtype;
  v_requirement public.broker_sync_lane_requirements%rowtype;
  v_lane public.broker_sync_lane_states%rowtype;
begin
  select * into v_work_unit
  from public.broker_capture_work_units
  where id = p_work_unit_id;
  if not found then return false; end if;
  select * into v_activation
  from public.broker_sync_activations
  where id = v_work_unit.sync_activation_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and activation_generation = v_work_unit.activation_generation;
  if not found then return false; end if;

  select * into v_connection_account
  from public.broker_connection_accounts
  where id = v_activation.connection_account_id
    and user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and provider_code = v_activation.provider_code
    and environment = v_activation.environment
  for update;
  if not found then return false; end if;

  select * into v_connection
  from public.broker_connections
  where id = v_connection_account.connection_id
    and user_id = v_activation.user_id
    and provider = v_activation.provider_code
    and environment = v_activation.environment
  for update;
  if not found then return false; end if;

  select * into v_credential
  from public.broker_credentials
  where id = v_activation.active_credential_id
    and user_id = v_activation.user_id
    and provider = v_activation.provider_code
    and key_version = v_activation.active_credential_key_version
  for update;
  if not found then return false; end if;

  select * into v_integrity_key
  from equora_private.broker_capture_integrity_keys
  where id = v_activation.capture_integrity_key_id
    and user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and key_version = v_activation.capture_integrity_key_version
  for update;
  if not found then return false; end if;

  select * into v_account
  from public.broker_accounts
  where id = v_activation.broker_account_id
    and user_id = v_activation.user_id
    and provider_code = v_activation.provider_code
    and environment = v_activation.environment
  for update;
  if not found then return false; end if;

  select * into v_provider
  from public.broker_providers
  where provider_code = v_activation.provider_code
  for update;
  if not found then return false; end if;

  if not (
    v_activation.activation_state = 'active'
    and v_connection_account.status = 'active'
    and v_connection_account.valid_from <= p_as_of
    and v_connection_account.valid_to is null
    and v_connection.status = 'ready'
    and v_connection.credential_reference = v_activation.active_credential_id
    and v_connection.permissions @>
      array['read_only_user_attested']::text[]
    and v_connection.permissions <@
      array['read_only_user_attested']::text[]
    and length(v_credential.encrypted_payload) > 0
    and v_integrity_key.status = 'active'
    and v_integrity_key.valid_from <= p_as_of
    and (v_integrity_key.valid_to is null or v_integrity_key.valid_to > p_as_of)
    and v_account.status = 'active'
    and v_account.retention_status = 'active'
    and v_provider.status = 'verified'
    and v_provider.mutations_forbidden = true
    and v_provider.current_contract_version = v_activation.provider_contract_version
    and v_activation.provider_contract_version = any(v_provider.allowed_contract_versions)
  ) then
    return false;
  end if;

  -- Continuation needs the same parent locks but places the downstream
  -- singleton Enrollment between Provider and Scope/Requirement/Lane. The
  -- two-argument wrapper below preserves the complete chain for other callers.
  if p_lock_child_authority is false then
    return true;
  end if;

  select * into v_scope
  from public.broker_sync_scopes
  where id = v_work_unit.scope_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
    and lane_requirement_id = v_work_unit.lane_requirement_id
    and lane_state_id = v_work_unit.lane_state_id
    and policy_generation = v_work_unit.policy_generation
  for update;
  if not found then return false; end if;

  select * into v_requirement
  from public.broker_sync_lane_requirements
  where id = v_work_unit.lane_requirement_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
    and policy_generation = v_work_unit.policy_generation
  for update;
  if not found then return false; end if;

  select * into v_lane
  from public.broker_sync_lane_states
  where id = v_work_unit.lane_state_id
    and lane_requirement_id = v_work_unit.lane_requirement_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
    and policy_generation = v_work_unit.policy_generation
  for update;
  if not found then return false; end if;

  perform 1
  from public.broker_sync_gaps gap
  where gap.user_id = v_work_unit.user_id
    and gap.broker_account_id = v_work_unit.broker_account_id
    and gap.sync_activation_id = v_work_unit.sync_activation_id
    and gap.activation_generation = v_work_unit.activation_generation
  order by gap.id
  for update;

  return v_provider.readonly_capabilities -> v_lane.capability_id ->> 'method' = 'GET'
    and v_scope.closed_at is null
    and v_requirement.superseded_at is null
    and v_lane.superseded_at is null;
exception
  when lock_not_available then raise exception 'SCHEDULER_PARENT_LOCK_TIMEOUT';
  when query_canceled then raise exception 'SCHEDULER_PARENT_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_lock_capture_parent_chain_v1(
  uuid,timestamptz,boolean
) from public, anon, authenticated, service_role;

create or replace function public.equora_lock_capture_parent_chain_v1(
  p_work_unit_id uuid,
  p_as_of timestamptz
) returns boolean
language sql
volatile
strict
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
  select public.equora_lock_capture_parent_chain_v1($1, $2, true)
$$;

revoke all on function public.equora_lock_capture_parent_chain_v1(
  uuid,timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.equora_scheduler_digest_v1(
  p_domain text,
  p_payload jsonb
) returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(public.equora_pgcrypto_digest_v1(
    convert_to(
      octet_length(convert_to(p_domain, 'UTF8'))::text || ':' || p_domain || '|'
        || octet_length(convert_to(p_payload::text, 'UTF8'))::text || ':'
        || p_payload::text || '|',
      'UTF8'
    ),
    'sha256'
  ), 'hex')
$$;

create or replace function public.equora_stability_bucket_identity_digest_v1(
  p_provider text,
  p_account_digest_algorithm text,
  p_account_digest_contract_version text,
  p_account_digest_purpose text,
  p_account_key_version text,
  p_account_digest text,
  p_account_verification_status text,
  p_broker_account_id uuid,
  p_sync_activation_id uuid,
  p_activation_generation integer,
  p_capability_id text,
  p_instrument_scope_type text,
  p_symbol text,
  p_position_type integer,
  p_provider_contract_version text,
  p_adapter_version text,
  p_profile_id text,
  p_profile_version text,
  p_boundary_policy_version text,
  p_bucket_start_ms bigint,
  p_bucket_end_ms bigint,
  p_digest_version text
) returns text
language sql
immutable
set search_path = ''
as $$
  select public.equora_tcj_digest_v1(
    'stability_bucket_identity',
    public.equora_tcj_object_v1(jsonb_build_object(
      'identity_contract', public.equora_tcj_atom_v1(
        'e', 'stability_bucket_identity_v1'
      ),
      'provider', public.equora_tcj_atom_v1('e', p_provider),
      'account_identity', public.equora_tcj_object_v1(jsonb_build_object(
        'digest_algorithm', public.equora_tcj_atom_v1(
          's', p_account_digest_algorithm
        ),
        'digest_contract_version', public.equora_tcj_atom_v1(
          's', p_account_digest_contract_version
        ),
        'purpose', public.equora_tcj_atom_v1('e', p_account_digest_purpose),
        'key_version', public.equora_tcj_atom_v1('s', p_account_key_version),
        'digest', public.equora_tcj_atom_v1('x', p_account_digest),
        'verification_status', public.equora_tcj_atom_v1(
          'e', p_account_verification_status
        )
      )),
      'broker_account_id', public.equora_tcj_atom_v1(
        's', p_broker_account_id::text
      ),
      'sync_activation_id', public.equora_tcj_atom_v1(
        's', p_sync_activation_id::text
      ),
      'activation_generation', public.equora_tcj_atom_v1(
        'i', p_activation_generation::text
      ),
      'capability_id', public.equora_tcj_atom_v1('s', p_capability_id),
      'instrument_scope', public.equora_tcj_object_v1(jsonb_build_object(
        'scope_type', public.equora_tcj_atom_v1('e', p_instrument_scope_type),
        'symbol', public.equora_tcj_atom_v1('s', p_symbol),
        'position_type', case when p_position_type is null
          then public.equora_tcj_atom_v1('n', null)
          else public.equora_tcj_atom_v1('i', p_position_type::text) end
      )),
      'provider_contract_version', public.equora_tcj_atom_v1(
        's', p_provider_contract_version
      ),
      'adapter_version', public.equora_tcj_atom_v1('s', p_adapter_version),
      'profile_id', public.equora_tcj_atom_v1('s', p_profile_id),
      'profile_version', public.equora_tcj_atom_v1('s', p_profile_version),
      'boundary_policy_version', public.equora_tcj_atom_v1(
        's', p_boundary_policy_version
      ),
      'bucket_start', public.equora_tcj_atom_v1(
        't', (p_bucket_start_ms * 1000)::text
      ),
      'bucket_end', public.equora_tcj_atom_v1(
        't', (p_bucket_end_ms * 1000)::text
      ),
      'digest_version', public.equora_tcj_atom_v1('s', p_digest_version)
    ))
  )
$$;

revoke all on function public.equora_stability_bucket_identity_digest_v1(
  text,text,text,text,text,text,text,uuid,uuid,integer,text,text,text,integer,
  text,text,text,text,text,bigint,bigint,text
) from public, anon, authenticated, service_role;

create or replace function public.equora_scope_bucket_set_valid_v1(
  p_scope_id uuid
) returns boolean
language plpgsql
stable
strict
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
declare
  v_scope public.broker_sync_scopes%rowtype;
  v_identity public.broker_account_identities%rowtype;
  v_count integer;
  v_min_ordinal integer;
  v_max_ordinal integer;
  v_all_exact boolean;
  v_set_digest text;
begin
  select * into v_scope
  from public.broker_sync_scopes
  where id = p_scope_id;
  if not found or v_scope.bucket_count is null
    or v_scope.bucket_set_contract_version is distinct from
      'broker-request-bucket-set-v1'
  then return false; end if;

  select * into v_identity
  from public.broker_account_identities
  where broker_account_id = v_scope.broker_account_id
    and user_id = v_scope.user_id
    and hmac_digest = v_scope.account_identity_digest
    and hmac_key_version = v_scope.account_identity_key_version;
  if not found then return false; end if;

  select count(*)::integer, min(bucket.bucket_ordinal), max(bucket.bucket_ordinal),
    bool_and(
      bucket.bucket_start_ms =
        v_scope.bucket_start_ms + bucket.bucket_ordinal * 86400000::bigint
      and bucket.bucket_end_ms =
        v_scope.bucket_start_ms + (bucket.bucket_ordinal + 1) * 86400000::bigint
      and bucket.stability_bucket_digest =
        public.equora_stability_bucket_identity_digest_v1(
          v_scope.provider_code, v_identity.digest_algorithm,
          v_identity.digest_contract_version, v_identity.digest_purpose,
          v_identity.hmac_key_version, v_identity.hmac_digest,
          v_identity.verification_status, v_scope.broker_account_id,
          v_scope.sync_activation_id, v_scope.activation_generation,
          v_scope.capability_id, 'mexc_futures_symbol_v1',
          v_scope.instrument_symbol, v_scope.position_type,
          v_scope.provider_contract_version, v_scope.adapter_version,
          v_scope.profile_id, v_scope.profile_version,
          v_scope.boundary_policy_version, bucket.bucket_start_ms,
          bucket.bucket_end_ms, v_scope.digest_version
        )
    )
  into v_count, v_min_ordinal, v_max_ordinal, v_all_exact
  from public.broker_sync_scope_buckets bucket
  where bucket.scope_id = v_scope.id;

  if v_count is distinct from v_scope.bucket_count
    or v_min_ordinal is distinct from 0
    or v_max_ordinal is distinct from v_scope.bucket_count - 1
    or v_all_exact is distinct from true
    or v_scope.bucket_end_ms is distinct from
      v_scope.bucket_start_ms + v_scope.bucket_count * 86400000::bigint
  then return false; end if;

  select public.equora_scheduler_digest_v1(
    'broker-request-bucket-set-v1',
    jsonb_build_object(
      'bucketCount', count(*),
      'bucketDigests', jsonb_agg(
        bucket.stability_bucket_digest order by bucket.bucket_ordinal
      )
    )
  ) into v_set_digest
  from public.broker_sync_scope_buckets bucket
  where bucket.scope_id = v_scope.id;

  return v_set_digest is not distinct from v_scope.stability_bucket_set_digest
    and v_scope.stability_bucket_digest is not distinct from v_set_digest;
exception
  when lock_not_available then return false;
  when query_canceled then return false;
end;
$$;

revoke all on function public.equora_scope_bucket_set_valid_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.equora_lane_execution_allowed_v1(
  p_lane_state_id uuid,
  p_trigger_kind text,
  p_as_of timestamptz
) returns boolean
language sql
stable
strict
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
  select exists (
    select 1
    from public.broker_sync_lane_states lane
    join public.broker_sync_lane_requirements requirement
      on requirement.id = lane.lane_requirement_id
    join public.broker_sync_activations activation
      on activation.id = lane.sync_activation_id
      and activation.user_id = lane.user_id
      and activation.broker_account_id = lane.broker_account_id
      and activation.activation_generation = lane.activation_generation
    join public.broker_sync_activation_series series
      on series.id = activation.activation_series_id
      and series.current_sync_activation_id = activation.id
      and series.current_activation_generation = activation.activation_generation
    where lane.id = p_lane_state_id
      and lane.superseded_at is null
      and requirement.superseded_at is null
      and requirement.id = lane.lane_requirement_id
      and requirement.policy_generation = lane.policy_generation
      and activation.activation_state = 'active'
      and activation.authority_contract_version = 'broker-capture-authority-v1'
      and p_trigger_kind in ('scheduler', 'startup_catchup', 'recovery')
      and lane.lane_id in (
        'incremental_fast_6h', 'rolling_audit_7d_daily',
        'rolling_audit_28d_weekly'
      )
      and lane.next_due_at is not null
      and lane.next_due_at <= p_as_of
      and lane.observation_status in ('not_observed', 'observed')
      and coalesce(lane.health, 'degraded') in ('healthy', 'degraded')
      and lane.instrument_scope_key ~
        '^mexc_futures_symbol_v1:[A-Z0-9]{1,20}_[A-Z0-9]{1,20}:(none|1|2)$'
      and not exists (
        select 1
        from public.broker_sync_gaps gap
        where gap.user_id = lane.user_id
          and gap.broker_account_id = lane.broker_account_id
          and gap.sync_activation_id = lane.sync_activation_id
          and gap.activation_generation = lane.activation_generation
          and gap.status in ('requires_export', 'unsupported')
      )
  )
$$;

revoke all on function public.equora_scheduler_digest_v1(text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.equora_lane_execution_allowed_v1(uuid,text,timestamptz)
  from public, anon, authenticated, service_role;

-- The scheduler layer is installed before the default-off runtime layer. This
-- closed helper therefore treats an absent enrollment table as installation-
-- time compatibility only; as soon as that table exists, every due candidate
-- must match its exact enabled tenant/provider/account row.
create or replace function public.equora_runtime_enrollment_allows_v1(
  p_user_id uuid,
  p_provider_code text,
  p_broker_account_id uuid
) returns boolean
language plpgsql
stable
strict
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
declare
  v_allowed boolean;
begin
  if to_regclass('equora_private.broker_capture_runtime_enrollment') is null then
    return true;
  end if;
  execute $query$
    select exists (
      select 1
      from equora_private.broker_capture_runtime_enrollment enrollment
      where enrollment.singleton_key is true
        and enrollment.enabled is true
        and enrollment.user_id = $1
        and enrollment.provider_code = $2
        and enrollment.broker_account_id = $3
    )
  $query$ into v_allowed using p_user_id, p_provider_code, p_broker_account_id;
  return coalesce(v_allowed, false);
end;
$$;

revoke all on function public.equora_runtime_enrollment_allows_v1(uuid,text,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.equora_materialize_next_due_broker_capture_v1(
  p_request_id uuid,
  p_schedule_contract_version text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '12s'
as $$
declare
  v_input_digest text;
  v_command public.broker_capture_materialization_commands%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_connection_account public.broker_connection_accounts%rowtype;
  v_connection public.broker_connections%rowtype;
  v_credential public.broker_credentials%rowtype;
  v_integrity_key equora_private.broker_capture_integrity_keys%rowtype;
  v_account public.broker_accounts%rowtype;
  v_provider public.broker_providers%rowtype;
  v_identity public.broker_account_identities%rowtype;
  v_requirement public.broker_sync_lane_requirements%rowtype;
  v_lane public.broker_sync_lane_states%rowtype;
  v_now timestamptz;
  v_now_ms bigint;
  v_midnight_ms bigint;
  v_request_start_ms bigint;
  v_request_end_ms bigint;
  v_first_bucket_ms bigint;
  v_bucket_end_exclusive_ms bigint;
  v_bucket_count integer;
  v_bucket_set_digest text;
  v_scope_digest text;
  v_authority_digest text;
  v_authority_plan_digest text;
  v_page_scope_digest text;
  v_checkpoint jsonb;
  v_checkpoint_mac text;
  v_result jsonb;
  v_symbol text;
  v_position_token text;
  v_position_type integer;
  v_enrollment_enabled boolean;
  v_enrollment_user_id uuid;
  v_enrollment_provider_code text;
  v_enrollment_account_id uuid;
  v_enrollment_row_count integer := 0;
  v_page_size integer := 20;
  v_run_id uuid := gen_random_uuid();
  v_scope_id uuid := gen_random_uuid();
  v_work_unit_id uuid := gen_random_uuid();
  v_occurrence_id uuid := gen_random_uuid();
  v_initial_sequence_digest constant text :=
    'abc75af3e6e8f3380b3b96243cf6eaf0529eca3f40e4323cd6c8b924d1928e05';
  v_budget_profile_digest constant text :=
    'aba71711421cebbff9f7ab4f8c761865aac36dffc91adc3d7468b6e632ab56aa';
begin
  if p_request_id is null
    or p_schedule_contract_version is distinct from 'broker-capture-schedule-v1'
  then
    raise exception 'SCHEDULER_INVALID_INPUT';
  end if;

  v_input_digest := public.equora_scheduler_digest_v1(
    'broker-capture-materialization-command-v1',
    jsonb_build_object(
      'requestId', p_request_id::text,
      'scheduleContractVersion', p_schedule_contract_version
  )
);

  v_now := clock_timestamp();

  insert into public.broker_capture_materialization_commands (
    request_id, input_digest, status, result, created_at, applied_at
  ) values (
    p_request_id, v_input_digest, 'pending', null, v_now, null
  ) on conflict (request_id) do nothing;

  select * into v_command
  from public.broker_capture_materialization_commands
  where request_id = p_request_id
  for update;

  if v_command.input_digest is distinct from v_input_digest then
    raise exception 'SCHEDULER_REQUEST_DRIFT';
  end if;
  if v_command.status in ('applied', 'no_due') then
    return v_command.result;
  end if;

  select series.* into v_series
  from public.broker_sync_activation_series series
  join public.broker_sync_activations activation
    on activation.id = series.current_sync_activation_id
    and activation.activation_generation = series.current_activation_generation
    and activation.activation_series_id = series.id
  join public.broker_sync_lane_states lane
    on lane.sync_activation_id = activation.id
    and lane.activation_generation = activation.activation_generation
    and lane.user_id = activation.user_id
    and lane.broker_account_id = activation.broker_account_id
  join public.broker_sync_lane_requirements requirement
    on requirement.id = lane.lane_requirement_id
  join public.broker_connection_accounts candidate_connection_account
    on candidate_connection_account.id = activation.connection_account_id
    and candidate_connection_account.user_id = activation.user_id
    and candidate_connection_account.broker_account_id = activation.broker_account_id
    and candidate_connection_account.provider_code = activation.provider_code
    and candidate_connection_account.environment = activation.environment
  join public.broker_connections candidate_connection
    on candidate_connection.id = candidate_connection_account.connection_id
    and candidate_connection.user_id = activation.user_id
    and candidate_connection.provider = activation.provider_code
    and candidate_connection.environment = activation.environment
  join public.broker_credentials candidate_credential
    on candidate_credential.id = activation.active_credential_id
    and candidate_credential.user_id = activation.user_id
    and candidate_credential.provider = activation.provider_code
    and candidate_credential.key_version = activation.active_credential_key_version
  join equora_private.broker_capture_integrity_keys candidate_integrity_key
    on candidate_integrity_key.id = activation.capture_integrity_key_id
    and candidate_integrity_key.user_id = activation.user_id
    and candidate_integrity_key.broker_account_id = activation.broker_account_id
    and candidate_integrity_key.key_version = activation.capture_integrity_key_version
  join public.broker_accounts candidate_account
    on candidate_account.id = activation.broker_account_id
    and candidate_account.user_id = activation.user_id
    and candidate_account.provider_code = activation.provider_code
    and candidate_account.environment = activation.environment
  join public.broker_providers candidate_provider
    on candidate_provider.provider_code = activation.provider_code
  where activation.activation_state = 'active'
    and candidate_connection_account.status = 'active'
    and candidate_connection_account.valid_from <= clock_timestamp()
    and candidate_connection_account.valid_to is null
    and candidate_connection.status = 'ready'
    and candidate_connection.credential_reference = activation.active_credential_id
    and candidate_connection.permissions @>
      array['read_only_user_attested']::text[]
    and candidate_connection.permissions <@
      array['read_only_user_attested']::text[]
    and length(candidate_credential.encrypted_payload) > 0
    and candidate_integrity_key.status = 'active'
    and candidate_integrity_key.valid_from <= clock_timestamp()
    and (candidate_integrity_key.valid_to is null
      or candidate_integrity_key.valid_to > clock_timestamp())
    and candidate_account.status = 'active'
    and candidate_account.retention_status = 'active'
    and candidate_provider.status = 'verified'
    and candidate_provider.mutations_forbidden = true
    and activation.provider_contract_version = candidate_provider.current_contract_version
    and activation.provider_contract_version = any(
      candidate_provider.allowed_contract_versions
    )
    and candidate_provider.readonly_capabilities -> lane.capability_id ->> 'method'
      = 'GET'
    and public.equora_runtime_enrollment_allows_v1(
      activation.user_id, activation.provider_code, activation.broker_account_id
    )
    and public.equora_lane_execution_allowed_v1(
      lane.id, 'scheduler', clock_timestamp()
    )
    and lane.superseded_at is null
    and requirement.superseded_at is null
    and lane.next_due_at is not null
    and lane.next_due_at <= clock_timestamp()
    and lane.instrument_scope_key ~
      '^mexc_futures_symbol_v1:[A-Z0-9]{1,20}_[A-Z0-9]{1,20}:(none|1|2)$'
    and not exists (
      select 1
      from public.broker_capture_schedule_occurrences scheduled
      where scheduled.lane_state_id = lane.id
        and scheduled.policy_generation = lane.policy_generation
        and scheduled.due_generation = lane.due_generation
        and scheduled.schedule_contract_version = p_schedule_contract_version
    )
  order by
    case lane.observation_status when 'not_observed' then 0 else 1 end,
    lane.next_due_at, series.user_id, series.broker_account_id,
    activation.id, lane.lane_id, lane.id
  for update of series skip locked
  limit 1;

  if v_series.id is null then
    v_result := jsonb_build_object(
      'status', 'no_due', 'requestId', p_request_id::text,
      'occurrenceId', null, 'runId', null, 'scopeId', null,
      'workUnitId', null, 'laneStateId', null, 'dueGeneration', null,
      'scheduledDueAt', null, 'bucketCount', 0, 'bucketSetDigest', null,
      'authorityBlocked', true
    );
    update public.broker_capture_materialization_commands
    set status = 'no_due', result = v_result, applied_at = clock_timestamp()
    where request_id = p_request_id;
    return v_result;
  end if;

  select * into strict v_activation
  from public.broker_sync_activations
  where id = v_series.current_sync_activation_id
    and activation_generation = v_series.current_activation_generation
    and activation_series_id = v_series.id
  for update;

  select * into strict v_connection_account
  from public.broker_connection_accounts
  where id = v_activation.connection_account_id
    and user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and provider_code = v_activation.provider_code
    and environment = v_activation.environment
  for update;

  select * into strict v_connection
  from public.broker_connections
  where id = v_connection_account.connection_id
    and user_id = v_activation.user_id
  for update;

  select * into strict v_credential
  from public.broker_credentials
  where id = v_activation.active_credential_id
    and user_id = v_activation.user_id
    and provider = v_activation.provider_code
    and key_version = v_activation.active_credential_key_version
  for update;

  select * into strict v_integrity_key
  from equora_private.broker_capture_integrity_keys
  where id = v_activation.capture_integrity_key_id
    and user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and key_version = v_activation.capture_integrity_key_version
  for update;

  select * into strict v_account
  from public.broker_accounts
  where id = v_activation.broker_account_id
    and user_id = v_activation.user_id
    and provider_code = v_activation.provider_code
    and environment = v_activation.environment
  for update;

  select * into strict v_provider
  from public.broker_providers
  where provider_code = v_activation.provider_code
  for update;

  if to_regclass('equora_private.broker_capture_runtime_enrollment') is not null then
    execute $enrollment$
      select enabled, user_id, provider_code, broker_account_id
      from equora_private.broker_capture_runtime_enrollment
      where singleton_key is true
      for update
    $enrollment$ into v_enrollment_enabled, v_enrollment_user_id,
      v_enrollment_provider_code, v_enrollment_account_id;
    get diagnostics v_enrollment_row_count = row_count;
    if v_enrollment_row_count is distinct from 1
      or v_enrollment_enabled is distinct from true
      or v_enrollment_user_id is distinct from v_activation.user_id
      or v_enrollment_provider_code is distinct from v_activation.provider_code
      or v_enrollment_account_id is distinct from v_activation.broker_account_id
    then
      raise exception 'SCHEDULER_RUNTIME_ENROLLMENT_INVALID';
    end if;
  end if;

  select * into strict v_identity
  from public.equora_lock_active_broker_account_identity_v1(
    v_activation.user_id, v_activation.broker_account_id,
    v_activation.provider_code, v_activation.environment
  );

  select * into strict v_requirement
  from public.broker_sync_lane_requirements
  where sync_activation_id = v_activation.id
    and activation_generation = v_activation.activation_generation
    and user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and superseded_at is null
    and instrument_scope_key ~
      '^mexc_futures_symbol_v1:[A-Z0-9]{1,20}_[A-Z0-9]{1,20}:(none|1|2)$'
    and exists (
      select 1 from public.broker_sync_lane_states candidate
      where candidate.lane_requirement_id =
        public.broker_sync_lane_requirements.id
        and candidate.superseded_at is null
        and candidate.next_due_at is not null
        and candidate.next_due_at <= clock_timestamp()
        and not exists (
          select 1
          from public.broker_capture_schedule_occurrences scheduled
          where scheduled.lane_state_id = candidate.id
            and scheduled.policy_generation = candidate.policy_generation
            and scheduled.due_generation = candidate.due_generation
            and scheduled.schedule_contract_version = p_schedule_contract_version
        )
    )
  order by id
  limit 1
  for update;

  select * into strict v_lane
  from public.broker_sync_lane_states
  where lane_requirement_id = v_requirement.id
    and superseded_at is null
    and next_due_at is not null
    and next_due_at <= clock_timestamp()
    and not exists (
      select 1
      from public.broker_capture_schedule_occurrences scheduled
      where scheduled.lane_state_id = public.broker_sync_lane_states.id
        and scheduled.policy_generation =
          public.broker_sync_lane_states.policy_generation
        and scheduled.due_generation =
          public.broker_sync_lane_states.due_generation
        and scheduled.schedule_contract_version = p_schedule_contract_version
    )
  order by
    case observation_status when 'not_observed' then 0 else 1 end,
    next_due_at, lane_id, id
  limit 1
  for update;

  v_now := clock_timestamp();
  if v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
    or v_activation.activation_state is distinct from 'active'
    or v_activation.authority_contract_version is distinct from 'broker-capture-authority-v1'
    or v_connection_account.status is distinct from 'active'
    or v_connection_account.valid_from > v_now
    or v_connection_account.valid_to is not null
    or v_connection.status is distinct from 'ready'
    or v_connection.provider is distinct from v_activation.provider_code
    or v_connection.environment is distinct from v_activation.environment
    or v_connection.credential_reference
      is distinct from v_activation.active_credential_id
    or not v_connection.permissions @>
      array['read_only_user_attested']::text[]
    or not v_connection.permissions <@
      array['read_only_user_attested']::text[]
    or length(v_credential.encrypted_payload) < 1
    or v_account.status is distinct from 'active'
    or v_account.retention_status is distinct from 'active'
    or v_provider.status is distinct from 'verified'
    or v_provider.mutations_forbidden is distinct from true
    or v_provider.current_contract_version
      is distinct from v_activation.provider_contract_version
    or not (
      v_activation.provider_contract_version = any(v_provider.allowed_contract_versions)
    )
    or v_integrity_key.status is distinct from 'active'
    or v_integrity_key.valid_from > v_now
    or (v_integrity_key.valid_to is not null and v_integrity_key.valid_to <= v_now)
    or v_requirement.id is distinct from v_lane.lane_requirement_id
    or v_requirement.policy_generation is distinct from v_lane.policy_generation
    or not public.equora_lane_execution_allowed_v1(v_lane.id, 'scheduler', v_now)
    or v_provider.readonly_capabilities -> v_lane.capability_id ->> 'method'
      is distinct from 'GET'
  then
    raise exception 'SCHEDULER_AUTHORITY_BLOCKED';
  end if;

  v_symbol := split_part(v_lane.instrument_scope_key, ':', 2);
  v_position_token := split_part(v_lane.instrument_scope_key, ':', 3);
  v_position_type := case when v_position_token = 'none' then null
    else v_position_token::integer end;
  if (
    (
      v_lane.capability_id in (
        'historical_positions_v1', 'funding_records_v1'
      )
      and v_position_type in (1, 2)
    )
    or (
      v_lane.capability_id in (
        'historical_orders_v1', 'historical_executions_v3'
      )
      and v_position_type is null
    )
  ) is distinct from true
  then
    raise exception 'SCHEDULER_AUTHORITY_BLOCKED';
  end if;

  v_now_ms := floor(extract(epoch from v_now) * 1000)::bigint;
  v_midnight_ms := (v_now_ms / 86400000::bigint) * 86400000::bigint;
  if v_lane.lane_id = 'rolling_audit_7d_daily' then
    v_bucket_count := 7;
    v_request_start_ms := v_midnight_ms - 7 * 86400000::bigint;
    v_request_end_ms := v_midnight_ms - 1;
    v_first_bucket_ms := v_request_start_ms;
    v_bucket_end_exclusive_ms := v_midnight_ms;
  elsif v_lane.lane_id = 'rolling_audit_28d_weekly' then
    v_bucket_count := 28;
    v_request_start_ms := v_midnight_ms - 28 * 86400000::bigint;
    v_request_end_ms := v_midnight_ms - 1;
    v_first_bucket_ms := v_request_start_ms;
    v_bucket_end_exclusive_ms := v_midnight_ms;
  else
    v_request_start_ms := greatest(
      0,
      coalesce(v_lane.high_watermark_time_ms - 259200000,
        v_now_ms - 2419200000)
    );
    v_request_end_ms := v_now_ms;
    v_first_bucket_ms :=
      ((v_request_start_ms + 86400000::bigint - 1) / 86400000::bigint)
        * 86400000::bigint;
    v_bucket_end_exclusive_ms := v_midnight_ms;
    v_bucket_count :=
      ((v_bucket_end_exclusive_ms - v_first_bucket_ms)
        / 86400000::bigint)::integer;
  end if;
  if v_bucket_count not between 1 and 31
    or v_request_end_ms - v_request_start_ms + 1 > 31 * 86400000::bigint
  then
    raise exception 'SCHEDULER_SCOPE_WINDOW_INVALID';
  end if;

  select public.equora_scheduler_digest_v1(
    'broker-request-bucket-set-v1',
    jsonb_build_object(
      'bucketCount', count(*),
      'bucketDigests', jsonb_agg(bucket_digest order by bucket_ordinal)
    )
  ) into v_bucket_set_digest
  from (
    select ordinal as bucket_ordinal,
      public.equora_stability_bucket_identity_digest_v1(
        v_lane.provider_code, v_identity.digest_algorithm,
        v_identity.digest_contract_version, v_identity.digest_purpose,
        v_identity.hmac_key_version, v_identity.hmac_digest,
        v_identity.verification_status, v_lane.broker_account_id,
        v_lane.sync_activation_id, v_lane.activation_generation,
        v_lane.capability_id, 'mexc_futures_symbol_v1', v_symbol,
        v_position_type, v_lane.provider_contract_version,
        v_lane.adapter_version, v_lane.profile_id, v_lane.profile_version,
        'mexc_provider_unverified_overlap_v1',
        v_first_bucket_ms + ordinal * 86400000::bigint,
        v_first_bucket_ms + (ordinal + 1) * 86400000::bigint,
        'equora-tcj-v1'
      ) as bucket_digest
    from generate_series(0, v_bucket_count - 1) ordinal
  ) buckets;

  v_scope_digest := public.equora_scheduler_digest_v1(
    'broker-request-scope-v2',
    jsonb_build_object(
      'syncActivationId', v_lane.sync_activation_id::text,
      'activationGeneration', v_lane.activation_generation,
      'brokerAccountId', v_lane.broker_account_id::text,
      'laneRequirementId', v_lane.lane_requirement_id::text,
      'laneStateId', v_lane.id::text,
      'policyGeneration', v_lane.policy_generation,
      'dueGeneration', v_lane.due_generation,
      'capabilityId', v_lane.capability_id,
      'instrumentScopeKey', v_lane.instrument_scope_key,
      'laneId', v_lane.lane_id,
      'requestStartMs', v_request_start_ms,
      'requestEndMs', v_request_end_ms,
      'bucketSetDigest', v_bucket_set_digest
    )
  );
  v_authority_digest := public.equora_capture_authority_digest_v1(
    v_lane.sync_activation_id, v_lane.activation_generation,
    v_lane.broker_account_id, v_lane.lane_requirement_id, v_lane.id,
    v_lane.policy_generation, v_lane.capability_id,
    v_lane.instrument_scope_key, v_lane.lane_id, v_lane.profile_id,
    v_lane.profile_version, v_scope_digest
  );
  v_authority_plan_digest := public.equora_scheduler_digest_v1(
    'broker-capture-authority-plan-v2',
    jsonb_build_object(
      'authorityDigest', v_authority_digest,
      'scopeDigest', v_scope_digest,
      'bucketSetDigest', v_bucket_set_digest,
      'dueGeneration', v_lane.due_generation,
      'scheduledDueAt', v_lane.next_due_at
    )
  );
  v_page_scope_digest := public.equora_mexc_page_scope_digest_v1(
    v_lane.capability_id, v_symbol, v_request_start_ms, v_request_end_ms,
    1, v_page_size, v_position_type, 'mexc-history-page-budget-v1',
    v_budget_profile_digest
  );
  v_checkpoint := jsonb_build_object(
    'checkpointVersion', 'mexc-page-checkpoint-v1',
    'checkpointMacVersion', 'mexc-page-checkpoint-hmac-sha256-v1',
    'budgetProfileId', 'mexc-history-page-budget-v1',
    'budgetProfileDigest', v_budget_profile_digest,
    'capabilityId', v_lane.capability_id,
    'scope', (
      jsonb_build_object(
        'symbol', v_symbol, 'startTime', v_request_start_ms,
        'endTime', v_request_end_ms, 'pageNumber', 1, 'pageSize', v_page_size
      ) || case
        when v_lane.capability_id in (
          'historical_positions_v1', 'funding_records_v1'
        ) then jsonb_build_object('positionType', v_position_type)
        else '{}'::jsonb
      end
    ),
    'scopeDigest', v_page_scope_digest,
    'status', 'ready', 'reason', 'initialized',
    'workUnitSequence', 1, 'nextPageNumber', 1,
    'unitSuccessfulPages', 0, 'unitRequestAttempts', 0,
    'unitRawEvents', 0, 'unitResponseBytes', 0, 'unitElapsedMs', 0,
    'unitRetryCount', 0, 'unitBackoffMs', 0,
    'totalSuccessfulPages', 0, 'totalRequestAttempts', 0,
    'totalRawEvents', 0, 'totalResponseBytes', 0, 'totalElapsedMs', 0,
    'authorityBlocked', true, 'terminalEvidence', 'none',
    'lastCursor', null, 'lastPageFingerprint', null,
    'seenPageFingerprints', jsonb_build_array(),
    'orderedProviderIdentitySequenceDigest', v_initial_sequence_digest,
    'lastErrorCode', null, 'suggestedBackoffMs', null,
    'retryNotBeforeMs', null
  );
  v_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
    v_checkpoint, v_integrity_key.key_material
  );
  v_checkpoint := v_checkpoint || jsonb_build_object(
    'checkpointMac', v_checkpoint_mac
  );

  insert into public.broker_capture_runs (
    id, user_id, broker_account_id, sync_activation_id,
    activation_generation, lane_id, trigger_kind, status, adapter_version,
    algorithm_version, scope_count, authority_contract_version,
    authority_plan_digest, row_version
  ) values (
    v_run_id, v_lane.user_id, v_lane.broker_account_id,
    v_lane.sync_activation_id, v_lane.activation_generation, v_lane.lane_id,
    'scheduler', 'pending', v_lane.adapter_version, 'broker-raw-ledger-v1',
    1, 'broker-capture-authority-v1', v_authority_plan_digest, 0
  );

  insert into public.broker_sync_scopes (
    id, user_id, broker_account_id, sync_activation_id,
    activation_generation, provider_code, account_identity_digest,
    account_identity_key_version, source_channel, profile_id, profile_version,
    provider_contract_version, adapter_version, capability_id, endpoint_id,
    instrument_scope_key, instrument_symbol, position_type, lane_id,
    request_start_ms, request_end_ms, bucket_start_ms, bucket_end_ms,
    boundary_policy_version, boundary_semantics, overlap_policy,
    scope_generation, stability_generation, coverage_basis, coverage_policy,
    scope_completeness, stability_status, digest_algorithm,
    digest_contract_version, digest_version, stability_bucket_digest,
    scope_digest, lane_requirement_id, lane_state_id, policy_generation,
    authority_contract_version, authority_digest, bucket_count,
    bucket_set_contract_version, stability_bucket_set_digest
  ) values (
    v_scope_id, v_lane.user_id, v_lane.broker_account_id,
    v_lane.sync_activation_id, v_lane.activation_generation,
    v_lane.provider_code, v_identity.hmac_digest, v_identity.hmac_key_version,
    'provider_api_observation', v_lane.profile_id, v_lane.profile_version,
    v_lane.provider_contract_version, v_lane.adapter_version,
    v_lane.capability_id, v_lane.capability_id, v_lane.instrument_scope_key,
    v_symbol, v_position_type, v_lane.lane_id, v_request_start_ms,
    v_request_end_ms, v_first_bucket_ms, v_bucket_end_exclusive_ms,
    'mexc_provider_unverified_overlap_v1', 'provider_unverified',
    case when v_lane.lane_id = 'incremental_fast_6h'
      then 'minimum_72h_v1' else 'closed_bucket_full_window_v1' end,
    1, 1, 'provider_observed', 'provider_observed_best_effort',
    'unverified', 'not_observed', 'sha256', 'equora-tcj-v1',
    'equora-tcj-v1', v_bucket_set_digest, v_scope_digest,
    v_lane.lane_requirement_id, v_lane.id, v_lane.policy_generation,
    'broker-capture-authority-v1', v_authority_digest, v_bucket_count,
    'broker-request-bucket-set-v1', v_bucket_set_digest
  );

  insert into public.broker_sync_scope_buckets (
    id, scope_id, user_id, broker_account_id, sync_activation_id,
    activation_generation, lane_requirement_id, lane_state_id,
    policy_generation, capability_id, instrument_scope_key, lane_id,
    profile_id, profile_version, scope_digest, bucket_set_contract_version,
    bucket_ordinal, bucket_start_ms, bucket_end_ms, stability_generation,
    stability_status, stability_bucket_digest, event_set_digest,
    content_digest, observed_at, created_at, updated_at
  )
  select gen_random_uuid(), v_scope_id, v_lane.user_id,
    v_lane.broker_account_id, v_lane.sync_activation_id,
    v_lane.activation_generation, v_lane.lane_requirement_id, v_lane.id,
    v_lane.policy_generation, v_lane.capability_id,
    v_lane.instrument_scope_key, v_lane.lane_id, v_lane.profile_id,
    v_lane.profile_version, v_scope_digest, 'broker-request-bucket-set-v1',
    ordinal, v_first_bucket_ms + ordinal * 86400000::bigint,
    v_first_bucket_ms + (ordinal + 1) * 86400000::bigint,
    1, 'not_observed',
    public.equora_stability_bucket_identity_digest_v1(
      v_lane.provider_code, v_identity.digest_algorithm,
      v_identity.digest_contract_version, v_identity.digest_purpose,
      v_identity.hmac_key_version, v_identity.hmac_digest,
      v_identity.verification_status, v_lane.broker_account_id,
      v_lane.sync_activation_id, v_lane.activation_generation,
      v_lane.capability_id, 'mexc_futures_symbol_v1', v_symbol,
      v_position_type, v_lane.provider_contract_version,
      v_lane.adapter_version, v_lane.profile_id, v_lane.profile_version,
      'mexc_provider_unverified_overlap_v1',
      v_first_bucket_ms + ordinal * 86400000::bigint,
      v_first_bucket_ms + (ordinal + 1) * 86400000::bigint,
      'equora-tcj-v1'
    ), null, null, null, v_now, v_now
  from generate_series(0, v_bucket_count - 1) ordinal;

  insert into public.broker_capture_work_units (
    id, user_id, broker_account_id, sync_activation_id,
    activation_generation, run_id, scope_id, lane_id, status, attempt,
    row_version, checkpoint, checkpoint_mac, request_sequence,
    successful_page_count, observed_event_count, response_bytes,
    lane_requirement_id, lane_state_id, policy_generation,
    authority_contract_version, authority_digest, lease_epoch,
    lease_renew_count, recovery_state, continuation_generation
  ) values (
    v_work_unit_id, v_lane.user_id, v_lane.broker_account_id,
    v_lane.sync_activation_id, v_lane.activation_generation, v_run_id,
    v_scope_id, v_lane.lane_id, 'pending', 0, 0, v_checkpoint,
    v_checkpoint_mac, 0, 0, 0, 0, v_lane.lane_requirement_id, v_lane.id,
    v_lane.policy_generation, 'broker-capture-authority-v1',
    v_authority_digest, 0, 0, 'none', 0
  );

  insert into public.broker_capture_schedule_occurrences (
    id, user_id, broker_account_id, activation_series_id,
    sync_activation_id, activation_generation, lane_requirement_id,
    lane_state_id, policy_generation, due_generation, due_slot_at,
    trigger_kind, schedule_contract_version, authority_plan_digest,
    run_id, scope_id, work_unit_id, status, created_at, updated_at
  ) values (
    v_occurrence_id, v_lane.user_id, v_lane.broker_account_id, v_series.id,
    v_lane.sync_activation_id, v_lane.activation_generation,
    v_lane.lane_requirement_id, v_lane.id, v_lane.policy_generation,
    v_lane.due_generation, v_lane.next_due_at, 'scheduler',
    p_schedule_contract_version, v_authority_plan_digest, v_run_id,
    v_scope_id, v_work_unit_id, 'scheduled', v_now, v_now
  );

  insert into public.broker_capture_run_lane_inputs (
    run_id, occurrence_id, scope_id, work_unit_id, user_id,
    broker_account_id, sync_activation_id,
    activation_generation, lane_requirement_id, lane_state_id,
    policy_generation, due_generation, scheduled_due_at, trigger_kind,
    authority_plan_digest, created_at
  ) values (
    v_run_id, v_occurrence_id, v_scope_id, v_work_unit_id,
    v_lane.user_id, v_lane.broker_account_id,
    v_lane.sync_activation_id, v_lane.activation_generation,
    v_lane.lane_requirement_id, v_lane.id, v_lane.policy_generation,
    v_lane.due_generation, v_lane.next_due_at, 'scheduler',
    v_authority_plan_digest, v_now
  );

  v_result := jsonb_build_object(
    'status', 'scheduled', 'requestId', p_request_id::text,
    'occurrenceId', v_occurrence_id::text, 'runId', v_run_id::text,
    'scopeId', v_scope_id::text, 'workUnitId', v_work_unit_id::text,
    'laneStateId', v_lane.id::text, 'dueGeneration', v_lane.due_generation,
    'scheduledDueAt', to_char(v_lane.next_due_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'bucketCount', v_bucket_count, 'bucketSetDigest', v_bucket_set_digest,
    'authorityBlocked', true
  );
  update public.broker_capture_materialization_commands
  set status = 'applied', result = v_result, applied_at = clock_timestamp()
  where request_id = p_request_id;
  return v_result;
exception
  when no_data_found then raise exception 'SCHEDULER_AUTHORITY_BLOCKED';
  when lock_not_available then raise exception 'SCHEDULER_LOCK_TIMEOUT';
  when query_canceled then raise exception 'SCHEDULER_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_materialize_next_due_broker_capture_v1(uuid,text)
  from public, anon, authenticated;
grant execute on function public.equora_materialize_next_due_broker_capture_v1(uuid,text)
  to service_role;

create or replace function public.equora_renew_broker_capture_lease_v1(
  p_work_unit_id uuid,
  p_expected_work_unit_row_version bigint,
  p_lease_token uuid,
  p_request_id uuid,
  p_lease_policy_version text
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
  v_event public.broker_capture_lease_events%rowtype;
  v_input_digest text;
  v_lease_digest text;
  v_now timestamptz;
  v_next_expiry timestamptz;
  v_previous_expiry timestamptz;
  v_previous_epoch bigint;
  v_result jsonb;
begin
  if p_work_unit_id is null or p_lease_token is null or p_request_id is null
    or p_expected_work_unit_row_version is null
    or p_expected_work_unit_row_version < 0
    or p_lease_policy_version is distinct from 'lease-control-v1'
  then raise exception 'LEASE_INVALID_INPUT'; end if;
  v_lease_digest := public.equora_lease_token_digest_v1(p_lease_token);
  v_input_digest := public.equora_scheduler_digest_v1(
    'broker-capture-lease-renew-v1',
    jsonb_build_object(
      'workUnitId', p_work_unit_id::text,
      'expectedWorkUnitRowVersion', p_expected_work_unit_row_version,
      'leaseTokenDigest', v_lease_digest,
      'requestId', p_request_id::text,
      'leasePolicyVersion', p_lease_policy_version
    )
  );

  select * into v_event from public.broker_capture_lease_events
  where work_unit_id = p_work_unit_id and request_id = p_request_id
    and event_kind = 'renew';
  if found then
    if v_event.input_digest is distinct from v_input_digest then
      raise exception 'LEASE_REQUEST_DRIFT';
    end if;
    return v_event.result;
  end if;

  select * into v_work_unit from public.broker_capture_work_units
  where id = p_work_unit_id for update;
  if not found then raise exception 'LEASE_WORK_UNIT_NOT_FOUND'; end if;
  select * into v_event from public.broker_capture_lease_events
  where work_unit_id = p_work_unit_id and request_id = p_request_id
    and event_kind = 'renew';
  if found then
    if v_event.input_digest is distinct from v_input_digest then
      raise exception 'LEASE_REQUEST_DRIFT';
    end if;
    return v_event.result;
  end if;
  select * into v_run from public.broker_capture_runs
  where id = v_work_unit.run_id and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id for update;
  if not found then raise exception 'LEASE_AUTHORITY_BLOCKED'; end if;
  select series.* into v_series
  from public.broker_sync_activation_series series
  join public.broker_sync_activations activation
    on activation.activation_series_id = series.id
  where activation.id = v_work_unit.sync_activation_id
    and activation.activation_generation = v_work_unit.activation_generation
  for update of series;
  if not found then raise exception 'LEASE_AUTHORITY_BLOCKED'; end if;
  select * into v_activation from public.broker_sync_activations
  where id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation for update;
  select * into v_lane from public.broker_sync_lane_states
  where id = v_work_unit.lane_state_id
    and lane_requirement_id = v_work_unit.lane_requirement_id for update;

  perform 1 from public.broker_capture_account_leases
  where broker_account_id = v_work_unit.broker_account_id
    and sync_kind = 'provider_api_observation' for update;
  if not found then raise exception 'LEASE_AUTHORITY_BLOCKED'; end if;

  v_now := clock_timestamp();
  if v_work_unit.row_version is distinct from p_expected_work_unit_row_version
    or v_work_unit.status not in ('leased', 'running')
    or v_work_unit.lease_token_digest is null
    or not public.equora_constant_time_hex_equal_v1(
      v_work_unit.lease_token_digest, v_lease_digest)
    or v_work_unit.lease_expires_at is null
    or v_work_unit.lease_expires_at <= v_now
    or v_work_unit.lease_max_expires_at is null
    or v_work_unit.lease_renew_count >= 3
    or v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
    or v_activation.activation_state is distinct from 'active'
    or v_lane.superseded_at is not null
    or v_lane.policy_generation is distinct from v_work_unit.policy_generation
    or not public.equora_lane_execution_allowed_v1(v_lane.id, v_run.trigger_kind, v_now)
    or not exists (
      select 1 from public.broker_capture_account_leases account_lease
      where account_lease.broker_account_id = v_work_unit.broker_account_id
        and account_lease.sync_kind = 'provider_api_observation'
        and account_lease.state = 'leased'
        and account_lease.user_id = v_work_unit.user_id
        and account_lease.sync_activation_id = v_work_unit.sync_activation_id
        and account_lease.activation_generation = v_work_unit.activation_generation
        and account_lease.work_unit_id = v_work_unit.id
        and account_lease.run_id = v_work_unit.run_id
        and account_lease.scope_id = v_work_unit.scope_id
        and account_lease.lane_state_id = v_work_unit.lane_state_id
        and account_lease.policy_generation = v_work_unit.policy_generation
        and account_lease.work_unit_row_version = v_work_unit.row_version
        and account_lease.lease_epoch = v_work_unit.lease_epoch
        and public.equora_constant_time_hex_equal_v1(
          account_lease.lease_token_digest, v_lease_digest)
        and account_lease.lease_acquired_at = v_work_unit.lease_acquired_at
        and account_lease.lease_expires_at = v_work_unit.lease_expires_at
        and account_lease.lease_max_expires_at = v_work_unit.lease_max_expires_at
        and account_lease.lease_renew_count = v_work_unit.lease_renew_count
        and account_lease.lease_policy_version = v_work_unit.lease_policy_version
    )
  then raise exception 'LEASE_AUTHORITY_BLOCKED'; end if;

  if exists (
    select 1
    from public.broker_capture_request_authorizations authorization_row
    where authorization_row.work_unit_id = v_work_unit.id
      and public.equora_constant_time_hex_equal_v1(
        authorization_row.lease_token_digest, v_lease_digest
      )
      and authorization_row.page_commit_input_digest is null
      and not exists (
        select 1 from public.broker_capture_attempt_outcomes outcome
        where outcome.work_unit_id = v_work_unit.id
          and outcome.expected_work_unit_row_version =
            authorization_row.work_unit_row_version
          and outcome.request_sequence = authorization_row.request_sequence
          and public.equora_constant_time_hex_equal_v1(
            outcome.lease_token_digest, v_lease_digest
          )
      )
  ) then
    raise exception 'LEASE_PERMIT_IN_FLIGHT';
  end if;

  v_next_expiry := least(
    v_now + interval '45 seconds', v_work_unit.lease_max_expires_at
  );
  if v_next_expiry <= v_work_unit.lease_expires_at then
    raise exception 'LEASE_RENEW_LIMIT_REACHED';
  end if;
  v_previous_expiry := v_work_unit.lease_expires_at;
  v_previous_epoch := v_work_unit.lease_epoch;

  update public.broker_capture_work_units
  set lease_expires_at = v_next_expiry,
      lease_renew_count = lease_renew_count + 1,
      lease_epoch = lease_epoch + 1,
      row_version = row_version + 1,
      updated_at = v_now
  where id = v_work_unit.id and row_version = p_expected_work_unit_row_version
  returning * into v_work_unit;
  if not found then raise exception 'LEASE_WORK_UNIT_CAS_MISMATCH'; end if;

  update public.broker_capture_account_leases
  set work_unit_row_version = v_work_unit.row_version,
      lease_epoch = v_work_unit.lease_epoch,
      lease_expires_at = v_work_unit.lease_expires_at,
      lease_renew_count = v_work_unit.lease_renew_count,
      row_version = row_version + 1, updated_at = v_now
  where broker_account_id = v_work_unit.broker_account_id
    and sync_kind = 'provider_api_observation' and state = 'leased'
    and user_id = v_work_unit.user_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
    and work_unit_id = v_work_unit.id
    and run_id = v_work_unit.run_id
    and scope_id = v_work_unit.scope_id
    and lane_state_id = v_work_unit.lane_state_id
    and policy_generation = v_work_unit.policy_generation
    and work_unit_row_version = p_expected_work_unit_row_version
    and lease_epoch = v_previous_epoch
    and public.equora_constant_time_hex_equal_v1(
      lease_token_digest, v_lease_digest
    )
    and lease_acquired_at = v_work_unit.lease_acquired_at
    and lease_expires_at = v_previous_expiry
    and lease_max_expires_at = v_work_unit.lease_max_expires_at
    and lease_renew_count = v_work_unit.lease_renew_count - 1
    and lease_policy_version = 'lease-control-v1';
  if not found then raise exception 'LEASE_AUTHORITY_BLOCKED'; end if;

  v_result := jsonb_build_object(
    'status', 'renewed', 'requestId', p_request_id::text,
    'workUnitId', v_work_unit.id::text,
    'workUnitRowVersion', v_work_unit.row_version,
    'leaseEpoch', v_work_unit.lease_epoch,
    'leaseExpiresAt', to_char(v_work_unit.lease_expires_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'recoveryState', 'none', 'authorityBlocked', true
  );
  insert into public.broker_capture_lease_events (
    id, request_id, event_kind, input_digest, user_id, broker_account_id,
    work_unit_id, run_id, scope_id, previous_work_unit_row_version,
    next_work_unit_row_version, previous_lease_epoch, next_lease_epoch,
    previous_lease_expires_at, next_lease_expires_at, result_code, result,
    created_at
  ) values (
    gen_random_uuid(), p_request_id, 'renew', v_input_digest,
    v_work_unit.user_id, v_work_unit.broker_account_id, v_work_unit.id,
    v_work_unit.run_id, v_work_unit.scope_id,
    p_expected_work_unit_row_version, v_work_unit.row_version,
    v_previous_epoch, v_work_unit.lease_epoch,
    v_previous_expiry, v_work_unit.lease_expires_at,
    'renewed', v_result, v_now
  );
  return v_result;
exception
  when lock_not_available then raise exception 'LEASE_LOCK_TIMEOUT';
  when query_canceled then raise exception 'LEASE_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_renew_broker_capture_lease_v1(
  uuid,bigint,uuid,uuid,text
) from public, anon, authenticated;
grant execute on function public.equora_renew_broker_capture_lease_v1(
  uuid,bigint,uuid,uuid,text
) to service_role;

create or replace function public.equora_release_broker_capture_lease_v1(
  p_work_unit_id uuid,
  p_expected_work_unit_row_version bigint,
  p_lease_token uuid,
  p_request_id uuid,
  p_release_reason text,
  p_lease_policy_version text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_work_unit public.broker_capture_work_units%rowtype;
  v_event public.broker_capture_lease_events%rowtype;
  v_input_digest text;
  v_lease_digest text;
  v_now timestamptz;
  v_uncertain boolean;
  v_previous_expiry timestamptz;
  v_previous_acquired_at timestamptz;
  v_previous_max_expiry timestamptz;
  v_previous_renew_count integer;
  v_previous_epoch bigint;
  v_result jsonb;
begin
  if p_work_unit_id is null or p_lease_token is null or p_request_id is null
    or p_expected_work_unit_row_version is null
    or p_expected_work_unit_row_version < 0
    or p_release_reason not in (
      'cooperative_shutdown', 'worker_budget_yield',
      'authority_invalidated', 'recovery_handoff'
    )
    or p_lease_policy_version is distinct from 'lease-control-v1'
  then raise exception 'LEASE_INVALID_INPUT'; end if;
  v_lease_digest := public.equora_lease_token_digest_v1(p_lease_token);
  v_input_digest := public.equora_scheduler_digest_v1(
    'broker-capture-lease-release-v1',
    jsonb_build_object(
      'workUnitId', p_work_unit_id::text,
      'expectedWorkUnitRowVersion', p_expected_work_unit_row_version,
      'leaseTokenDigest', v_lease_digest,
      'requestId', p_request_id::text,
      'releaseReason', p_release_reason,
      'leasePolicyVersion', p_lease_policy_version
    )
  );
  select * into v_event from public.broker_capture_lease_events
  where work_unit_id = p_work_unit_id and request_id = p_request_id
    and event_kind = 'release';
  if found then
    if v_event.input_digest is distinct from v_input_digest then
      raise exception 'LEASE_REQUEST_DRIFT';
    end if;
    return v_event.result;
  end if;

  select * into v_work_unit from public.broker_capture_work_units
  where id = p_work_unit_id for update;
  if not found then raise exception 'LEASE_WORK_UNIT_NOT_FOUND'; end if;
  select * into v_event from public.broker_capture_lease_events
  where work_unit_id = p_work_unit_id and request_id = p_request_id
    and event_kind = 'release';
  if found then
    if v_event.input_digest is distinct from v_input_digest then
      raise exception 'LEASE_REQUEST_DRIFT';
    end if;
    return v_event.result;
  end if;
  perform 1 from public.broker_capture_runs where id = v_work_unit.run_id for update;
  perform 1 from public.broker_capture_account_leases
  where broker_account_id = v_work_unit.broker_account_id
    and sync_kind = 'provider_api_observation' for update;
  v_now := clock_timestamp();
  if v_work_unit.row_version is distinct from p_expected_work_unit_row_version
    or v_work_unit.status not in ('leased', 'running')
    or v_work_unit.lease_token_digest is null
    or not public.equora_constant_time_hex_equal_v1(
      v_work_unit.lease_token_digest, v_lease_digest)
    or not exists (
      select 1 from public.broker_capture_account_leases account_lease
      where account_lease.broker_account_id = v_work_unit.broker_account_id
        and account_lease.sync_kind = 'provider_api_observation'
        and account_lease.state = 'leased'
        and account_lease.user_id = v_work_unit.user_id
        and account_lease.sync_activation_id = v_work_unit.sync_activation_id
        and account_lease.activation_generation = v_work_unit.activation_generation
        and account_lease.work_unit_id = v_work_unit.id
        and account_lease.run_id = v_work_unit.run_id
        and account_lease.scope_id = v_work_unit.scope_id
        and account_lease.lane_state_id = v_work_unit.lane_state_id
        and account_lease.policy_generation = v_work_unit.policy_generation
        and account_lease.lease_epoch = v_work_unit.lease_epoch
        and account_lease.work_unit_row_version = v_work_unit.row_version
        and public.equora_constant_time_hex_equal_v1(
          account_lease.lease_token_digest, v_lease_digest)
        and account_lease.lease_acquired_at = v_work_unit.lease_acquired_at
        and account_lease.lease_expires_at = v_work_unit.lease_expires_at
        and account_lease.lease_max_expires_at = v_work_unit.lease_max_expires_at
        and account_lease.lease_renew_count = v_work_unit.lease_renew_count
        and account_lease.lease_policy_version = v_work_unit.lease_policy_version
    )
  then raise exception 'LEASE_TOKEN_INVALID'; end if;

  v_previous_expiry := v_work_unit.lease_expires_at;
  v_previous_acquired_at := v_work_unit.lease_acquired_at;
  v_previous_max_expiry := v_work_unit.lease_max_expires_at;
  v_previous_renew_count := v_work_unit.lease_renew_count;
  v_previous_epoch := v_work_unit.lease_epoch;
  select exists (
    select 1
    from public.broker_capture_request_authorizations authorization_row
    where authorization_row.work_unit_id = v_work_unit.id
      and authorization_row.work_unit_row_version = v_work_unit.row_version
      and public.equora_constant_time_hex_equal_v1(
        authorization_row.lease_token_digest, v_lease_digest)
      and authorization_row.page_commit_input_digest is null
      and not exists (
        select 1 from public.broker_capture_attempt_outcomes outcome
        where outcome.work_unit_id = v_work_unit.id
          and outcome.expected_work_unit_row_version = v_work_unit.row_version
          and outcome.request_sequence = authorization_row.request_sequence
          and public.equora_constant_time_hex_equal_v1(
            outcome.lease_token_digest, v_lease_digest)
      )
  ) into v_uncertain;

  update public.broker_capture_work_units
  set status = case when v_uncertain then 'recovery_pending' else 'pending' end,
      lease_token_digest = null, lease_token_format_version = null,
      lease_acquired_at = null, lease_expires_at = null,
      lease_max_expires_at = null, lease_renew_count = 0,
      lease_policy_version = null,
      lease_epoch = lease_epoch + 1,
      recovery_state = case when v_uncertain then 'uncertain_egress' else 'none' end,
      row_version = row_version + 1, updated_at = v_now
  where id = v_work_unit.id and row_version = p_expected_work_unit_row_version
  returning * into v_work_unit;
  if not found then raise exception 'LEASE_WORK_UNIT_CAS_MISMATCH'; end if;

  update public.broker_capture_account_leases
  set state = 'available', sync_activation_id = null,
      activation_generation = null, work_unit_id = null, run_id = null,
      scope_id = null, lane_state_id = null, policy_generation = null,
      work_unit_row_version = null, lease_epoch = null,
      lease_token_digest = null, lease_acquired_at = null,
      lease_expires_at = null, lease_max_expires_at = null,
      lease_renew_count = null, lease_policy_version = null,
      row_version = row_version + 1, updated_at = v_now
  where broker_account_id = v_work_unit.broker_account_id
    and sync_kind = 'provider_api_observation'
    and state = 'leased'
    and user_id = v_work_unit.user_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
    and work_unit_id = v_work_unit.id
    and run_id = v_work_unit.run_id
    and scope_id = v_work_unit.scope_id
    and lane_state_id = v_work_unit.lane_state_id
    and policy_generation = v_work_unit.policy_generation
    and work_unit_row_version = p_expected_work_unit_row_version
    and lease_epoch = v_previous_epoch
    and public.equora_constant_time_hex_equal_v1(
      lease_token_digest, v_lease_digest
    )
    and lease_acquired_at = v_previous_acquired_at
    and lease_expires_at = v_previous_expiry
    and lease_max_expires_at = v_previous_max_expiry
    and lease_renew_count = v_previous_renew_count
    and lease_policy_version = 'lease-control-v1';
  if not found then raise exception 'LEASE_ACCOUNT_SLOT_CAS_MISMATCH'; end if;

  v_result := jsonb_build_object(
    'status', case when v_uncertain then 'recovery_pending' else 'released' end,
    'requestId', p_request_id::text, 'workUnitId', v_work_unit.id::text,
    'workUnitRowVersion', v_work_unit.row_version,
    'leaseEpoch', v_work_unit.lease_epoch, 'leaseExpiresAt', null,
    'recoveryState', case when v_uncertain then 'uncertain_egress' else 'none' end,
    'authorityBlocked', true
  );
  insert into public.broker_capture_lease_events (
    id, request_id, event_kind, input_digest, user_id, broker_account_id,
    work_unit_id, run_id, scope_id, previous_work_unit_row_version,
    next_work_unit_row_version, previous_lease_epoch, next_lease_epoch,
    previous_lease_expires_at, next_lease_expires_at, result_code, result,
    created_at
  ) values (
    gen_random_uuid(), p_request_id, 'release', v_input_digest,
    v_work_unit.user_id, v_work_unit.broker_account_id, v_work_unit.id,
    v_work_unit.run_id, v_work_unit.scope_id,
    p_expected_work_unit_row_version, v_work_unit.row_version,
    v_previous_epoch, v_work_unit.lease_epoch, v_previous_expiry, null,
    case when v_uncertain then 'uncertain_egress' else 'released' end,
    v_result, v_now
  );
  return v_result;
exception
  when lock_not_available then raise exception 'LEASE_LOCK_TIMEOUT';
  when query_canceled then raise exception 'LEASE_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_release_broker_capture_lease_v1(
  uuid,bigint,uuid,uuid,text,text
) from public, anon, authenticated;
grant execute on function public.equora_release_broker_capture_lease_v1(
  uuid,bigint,uuid,uuid,text,text
) to service_role;

create or replace function public.equora_continue_yielded_broker_capture_work_unit_v1(
  p_predecessor_work_unit_id uuid,
  p_expected_predecessor_row_version bigint,
  p_request_id uuid,
  p_lease_policy_version text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_predecessor public.broker_capture_work_units%rowtype;
  v_run public.broker_capture_runs%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_scope public.broker_sync_scopes%rowtype;
  v_requirement public.broker_sync_lane_requirements%rowtype;
  v_lane public.broker_sync_lane_states%rowtype;
  v_provider public.broker_providers%rowtype;
  v_integrity_key equora_private.broker_capture_integrity_keys%rowtype;
  v_event public.broker_capture_lease_events%rowtype;
  v_successor public.broker_capture_work_units%rowtype;
  v_input_digest text;
  v_checkpoint jsonb;
  v_checkpoint_mac text;
  v_now timestamptz;
  v_previous_epoch bigint;
  v_result jsonb;
  v_scope_exhausted boolean;
  v_max_work_units_per_scope constant integer := 20;
  v_parent_chain_valid boolean := false;
  v_runtime_enrollment record;
  v_runtime_enrollment_row_count bigint := 0;
begin
  if p_predecessor_work_unit_id is null or p_request_id is null
    or p_expected_predecessor_row_version is null
    or p_expected_predecessor_row_version < 0
    or p_lease_policy_version is distinct from 'lease-control-v1'
  then raise exception 'CONTINUATION_INVALID_INPUT'; end if;
  v_input_digest := public.equora_scheduler_digest_v1(
    'broker-capture-yield-continuation-v1',
    jsonb_build_object(
      'predecessorWorkUnitId', p_predecessor_work_unit_id::text,
      'expectedPredecessorRowVersion', p_expected_predecessor_row_version,
      'requestId', p_request_id::text,
      'leasePolicyVersion', p_lease_policy_version
    )
  );
  select * into v_event from public.broker_capture_lease_events
  where work_unit_id = p_predecessor_work_unit_id
    and request_id = p_request_id and event_kind = 'yield_continuation';
  if found then
    if v_event.input_digest is distinct from v_input_digest then
      raise exception 'CONTINUATION_REQUEST_DRIFT';
    end if;
    return v_event.result;
  end if;

  select * into v_predecessor from public.broker_capture_work_units
  where id = p_predecessor_work_unit_id for update;
  if not found then raise exception 'CONTINUATION_NOT_YIELDED'; end if;
  select * into v_event from public.broker_capture_lease_events
  where work_unit_id = p_predecessor_work_unit_id
    and request_id = p_request_id and event_kind = 'yield_continuation';
  if found then
    if v_event.input_digest is distinct from v_input_digest then
      raise exception 'CONTINUATION_REQUEST_DRIFT';
    end if;
    return v_event.result;
  end if;
  if v_predecessor.row_version <> p_expected_predecessor_row_version
  then raise exception 'CONTINUATION_NOT_YIELDED'; end if;
  select * into v_run from public.broker_capture_runs
  where id = v_predecessor.run_id for update;
  select series.* into v_series
  from public.broker_sync_activation_series series
  join public.broker_sync_activations activation
    on activation.activation_series_id = series.id
  where activation.id = v_predecessor.sync_activation_id
    and activation.activation_generation = v_predecessor.activation_generation
  for update of series;
  select * into v_activation from public.broker_sync_activations
  where id = v_predecessor.sync_activation_id
    and activation_generation = v_predecessor.activation_generation for update;
  v_parent_chain_valid := public.equora_lock_capture_parent_chain_v1(
    v_predecessor.id, clock_timestamp(), false
  );
  if v_parent_chain_valid is distinct from true then
    raise exception 'CONTINUATION_AUTHORITY_BLOCKED';
  end if;
  -- A yielded Finder is only a hint. If the downstream runtime enrollment
  -- exists, Continuation itself locks and revalidates the exact rollout row
  -- before Scope/Lane or successor mutation. Disable committed first means
  -- zero successor and zero continuation receipt; Continuation committed first
  -- is the single documented in-flight winner.
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
      or v_runtime_enrollment.user_id is distinct from v_predecessor.user_id
      or v_runtime_enrollment.provider_code is distinct from v_activation.provider_code
      or v_runtime_enrollment.broker_account_id is distinct from v_predecessor.broker_account_id
    then
      raise exception 'CONTINUATION_AUTHORITY_BLOCKED';
    end if;
  end if;
  select * into v_scope from public.broker_sync_scopes
  where id = v_predecessor.scope_id
    and user_id = v_predecessor.user_id
    and broker_account_id = v_predecessor.broker_account_id
    and sync_activation_id = v_predecessor.sync_activation_id
    and activation_generation = v_predecessor.activation_generation
    and lane_requirement_id = v_predecessor.lane_requirement_id
    and lane_state_id = v_predecessor.lane_state_id
    and policy_generation = v_predecessor.policy_generation
  for update;
  if not found then raise exception 'CONTINUATION_AUTHORITY_BLOCKED'; end if;
  select * into v_requirement from public.broker_sync_lane_requirements
  where id = v_predecessor.lane_requirement_id
    and user_id = v_predecessor.user_id
    and broker_account_id = v_predecessor.broker_account_id
    and sync_activation_id = v_predecessor.sync_activation_id
    and activation_generation = v_predecessor.activation_generation
    and policy_generation = v_predecessor.policy_generation
  for update;
  if not found then raise exception 'CONTINUATION_AUTHORITY_BLOCKED'; end if;
  select * into v_lane from public.broker_sync_lane_states
  where id = v_predecessor.lane_state_id
    and lane_requirement_id = v_predecessor.lane_requirement_id
    and user_id = v_predecessor.user_id
    and broker_account_id = v_predecessor.broker_account_id
    and sync_activation_id = v_predecessor.sync_activation_id
    and activation_generation = v_predecessor.activation_generation
    and policy_generation = v_predecessor.policy_generation
  for update;
  if not found then raise exception 'CONTINUATION_AUTHORITY_BLOCKED'; end if;
  select * into v_provider from public.broker_providers
  where provider_code = v_activation.provider_code;
  if not found then raise exception 'CONTINUATION_AUTHORITY_BLOCKED'; end if;
  perform 1
  from public.broker_sync_gaps gap
  where gap.user_id = v_predecessor.user_id
    and gap.broker_account_id = v_predecessor.broker_account_id
    and gap.sync_activation_id = v_predecessor.sync_activation_id
    and gap.activation_generation = v_predecessor.activation_generation
  order by gap.id
  for update;
  select * into v_integrity_key
  from equora_private.broker_capture_integrity_keys
  where id = v_activation.capture_integrity_key_id
    and user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and key_version = v_activation.capture_integrity_key_version
  for update;
  v_now := clock_timestamp();
  if v_predecessor.status is distinct from 'yielded'
    or v_predecessor.lease_token_digest is not null
    or v_predecessor.recovery_state is distinct from 'none'
    or v_predecessor.checkpoint ->> 'status' is distinct from 'yielded'
    or v_predecessor.checkpoint ->> 'reason' not in (
      'work_unit_budget_reached', 'scope_budget_reached'
    )
    or v_predecessor.checkpoint ->> 'checkpointMac'
      is distinct from v_predecessor.checkpoint_mac
    or public.equora_mexc_checkpoint_mac_v1(
      v_predecessor.checkpoint - 'checkpointMac', v_integrity_key.key_material
    ) is distinct from v_predecessor.checkpoint_mac
    or v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
    or v_activation.activation_state is distinct from 'active'
    or v_integrity_key.status is distinct from 'active'
    or v_integrity_key.valid_from > v_now
    or (v_integrity_key.valid_to is not null and v_integrity_key.valid_to <= v_now)
    or v_lane.superseded_at is not null
    or v_requirement.superseded_at is not null
    or v_lane.policy_generation is distinct from v_predecessor.policy_generation
    or v_scope.closed_at is not null
    or v_provider.readonly_capabilities
      -> v_lane.capability_id ->> 'method' is distinct from 'GET'
    or not public.equora_lane_execution_allowed_v1(
      v_lane.id, v_run.trigger_kind, v_now
    )
  then raise exception 'CONTINUATION_AUTHORITY_BLOCKED'; end if;

  select * into v_event from public.broker_capture_lease_events
  where work_unit_id = p_predecessor_work_unit_id
    and request_id = p_request_id and event_kind = 'yield_continuation';
  if found then
    if v_event.input_digest is distinct from v_input_digest then
      raise exception 'CONTINUATION_REQUEST_DRIFT';
    end if;
    return v_event.result;
  end if;

  -- Cross-request convergence: a crash after the unique successor commit but
  -- before the caller observes it must not attempt a second successor. The
  -- current predecessor row-version is still required, then the exact
  -- relational successor is returned and this new request gets its own
  -- append-only outcome receipt.
  select successor.* into v_successor
  from public.broker_capture_work_units successor
  where successor.predecessor_work_unit_id = v_predecessor.id
    and successor.run_id = v_predecessor.run_id
    and successor.scope_id = v_predecessor.scope_id
    and successor.user_id = v_predecessor.user_id
    and successor.broker_account_id = v_predecessor.broker_account_id;
  if found then
    v_now := clock_timestamp();
    v_result := jsonb_build_object(
      'status', 'continued',
      'requestId', p_request_id::text,
      'predecessorWorkUnitId', v_predecessor.id::text,
      'successorWorkUnitId', v_successor.id::text,
      'runId', v_predecessor.run_id::text,
      'scopeId', v_predecessor.scope_id::text,
      'continuationGeneration', v_successor.continuation_generation,
      'crossRequestReplay', true,
      'authorityBlocked', true
    );
    insert into public.broker_capture_lease_events (
      id, request_id, event_kind, input_digest, user_id, broker_account_id,
      work_unit_id, run_id, scope_id, previous_work_unit_row_version,
      next_work_unit_row_version, previous_lease_epoch, next_lease_epoch,
      previous_lease_expires_at, next_lease_expires_at, result_code, result,
      created_at
    ) values (
      gen_random_uuid(), p_request_id, 'yield_continuation', v_input_digest,
      v_predecessor.user_id, v_predecessor.broker_account_id, v_predecessor.id,
      v_predecessor.run_id, v_predecessor.scope_id,
      v_predecessor.row_version, v_predecessor.row_version,
      v_predecessor.lease_epoch, v_predecessor.lease_epoch, null, null,
      'continued', v_result, v_now
    );
    return v_result;
  end if;

  v_scope_exhausted :=
    v_predecessor.checkpoint ->> 'reason' = 'scope_budget_reached'
    or (v_predecessor.checkpoint ->> 'workUnitSequence')::integer
      >= v_max_work_units_per_scope;
  v_previous_epoch := v_predecessor.lease_epoch;

  if not v_scope_exhausted then
    v_checkpoint := jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        v_predecessor.checkpoint - 'checkpointMac',
                        '{status}', '"ready"'::jsonb
                      ), '{reason}', '"continued_in_new_work_unit"'::jsonb
                    ), '{workUnitSequence}',
                    to_jsonb((v_predecessor.checkpoint ->> 'workUnitSequence')::integer + 1)
                  ), '{unitSuccessfulPages}', '0'::jsonb
                ), '{unitRequestAttempts}', '0'::jsonb
              ), '{unitRawEvents}', '0'::jsonb
            ), '{unitResponseBytes}', '0'::jsonb
          ), '{unitElapsedMs}', '0'::jsonb
        ), '{unitRetryCount}', '0'::jsonb
      ), '{unitBackoffMs}', '0'::jsonb
    ) || jsonb_build_object(
      'lastErrorCode', null, 'suggestedBackoffMs', null,
      'retryNotBeforeMs', null
    );
    v_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
      v_checkpoint, v_integrity_key.key_material
    );
    v_checkpoint := v_checkpoint || jsonb_build_object(
      'checkpointMac', v_checkpoint_mac
    );
    insert into public.broker_capture_work_units (
      id, user_id, broker_account_id, sync_activation_id,
      activation_generation, run_id, scope_id, lane_id, status, attempt,
      row_version, checkpoint, checkpoint_mac, request_sequence,
      low_watermark, high_watermark, resume_token_digest, last_error_class,
      successful_page_count, observed_event_count, response_bytes,
      lane_requirement_id, lane_state_id, policy_generation,
      authority_contract_version, authority_digest, lease_epoch,
      lease_renew_count, recovery_state, predecessor_work_unit_id,
      continuation_generation
    ) values (
      gen_random_uuid(), v_predecessor.user_id, v_predecessor.broker_account_id,
      v_predecessor.sync_activation_id, v_predecessor.activation_generation,
      v_predecessor.run_id, v_predecessor.scope_id, v_predecessor.lane_id,
      'pending', 0, 0, v_checkpoint, v_checkpoint_mac,
      v_predecessor.request_sequence, v_predecessor.low_watermark,
      v_predecessor.high_watermark, v_predecessor.resume_token_digest, null,
      v_predecessor.successful_page_count, v_predecessor.observed_event_count,
      v_predecessor.response_bytes, v_predecessor.lane_requirement_id,
      v_predecessor.lane_state_id, v_predecessor.policy_generation,
      v_predecessor.authority_contract_version, v_predecessor.authority_digest,
      0, 0, 'none', v_predecessor.id,
      v_predecessor.continuation_generation + 1
    ) returning * into v_successor;
  end if;

  if v_scope_exhausted then
    v_checkpoint := jsonb_set(
      jsonb_set(
        v_predecessor.checkpoint - 'checkpointMac',
        '{status}', '"partial_failed"'::jsonb
      ),
      '{reason}', '"scope_budget_exhausted"'::jsonb
    );
    v_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
      v_checkpoint, v_integrity_key.key_material
    );
    v_checkpoint := v_checkpoint || jsonb_build_object(
      'checkpointMac', v_checkpoint_mac
    );
  end if;

  update public.broker_capture_work_units
  set status = case when v_scope_exhausted then 'partial_failed' else status end,
      checkpoint = case when v_scope_exhausted then v_checkpoint else checkpoint end,
      checkpoint_mac = case when v_scope_exhausted then v_checkpoint_mac else checkpoint_mac end,
      last_error_class = case when v_scope_exhausted
        then 'scope_budget_exhausted' else last_error_class end,
      row_version = row_version + 1, lease_epoch = lease_epoch + 1,
      updated_at = v_now
  where id = v_predecessor.id
    and row_version = p_expected_predecessor_row_version
  returning * into v_predecessor;
  if not found then raise exception 'CONTINUATION_NOT_YIELDED'; end if;

  v_result := jsonb_build_object(
    'status', case when v_scope_exhausted then 'scope_exhausted'
      else 'continued' end,
    'requestId', p_request_id::text,
    'predecessorWorkUnitId', v_predecessor.id::text,
    'successorWorkUnitId', case when v_scope_exhausted then null
      else to_jsonb(v_successor.id::text) end,
    'runId', v_predecessor.run_id::text,
    'scopeId', v_predecessor.scope_id::text,
    'continuationGeneration', case when v_scope_exhausted
      then v_predecessor.continuation_generation
      else v_successor.continuation_generation end,
    'crossRequestReplay', false,
    'authorityBlocked', true
  );
  insert into public.broker_capture_lease_events (
    id, request_id, event_kind, input_digest, user_id, broker_account_id,
    work_unit_id, run_id, scope_id, previous_work_unit_row_version,
    next_work_unit_row_version, previous_lease_epoch, next_lease_epoch,
    previous_lease_expires_at, next_lease_expires_at, result_code, result,
    created_at
  ) values (
    gen_random_uuid(), p_request_id, 'yield_continuation', v_input_digest,
    v_predecessor.user_id, v_predecessor.broker_account_id, v_predecessor.id,
    v_predecessor.run_id, v_predecessor.scope_id,
    p_expected_predecessor_row_version, v_predecessor.row_version,
    v_previous_epoch, v_predecessor.lease_epoch, null, null,
    case when v_scope_exhausted then 'scope_exhausted' else 'continued' end,
    v_result, v_now
  );
  return v_result;
exception
  when unique_violation then raise exception 'CONTINUATION_REPLAY_RACE';
  when lock_not_available then raise exception 'CONTINUATION_LOCK_TIMEOUT';
  when query_canceled then raise exception 'CONTINUATION_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_continue_yielded_broker_capture_work_unit_v1(
  uuid,bigint,uuid,text
) from public, anon, authenticated;
grant execute on function public.equora_continue_yielded_broker_capture_work_unit_v1(
  uuid,bigint,uuid,text
) to service_role;

create or replace function public.equora_recover_expired_broker_capture_leases_v1(
  p_request_id uuid,
  p_batch_limit integer,
  p_lease_policy_version text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '12s'
as $$
declare
  v_command public.broker_capture_recovery_commands%rowtype;
  v_work_unit public.broker_capture_work_units%rowtype;
  v_before public.broker_capture_work_units%rowtype;
  v_account_lease public.broker_capture_account_leases%rowtype;
  v_now timestamptz;
  v_input_digest text;
  v_event_digest text;
  v_previous_epoch bigint;
  v_previous_expiry timestamptz;
  v_next_status text;
  v_has_unresolved_permit boolean;
  v_has_resolved_permit boolean;
  v_inspected integer := 0;
  v_requeued integer := 0;
  v_uncertain integer := 0;
  v_outcome_derived integer := 0;
  v_result jsonb;
begin
  if p_request_id is null or p_batch_limit not between 1 and 25
    or p_lease_policy_version is distinct from 'lease-control-v1'
  then raise exception 'RECOVERY_INVALID_INPUT'; end if;
  v_input_digest := public.equora_scheduler_digest_v1(
    'broker-capture-expired-recovery-command-v1',
    jsonb_build_object(
      'requestId', p_request_id::text, 'batchLimit', p_batch_limit,
      'leasePolicyVersion', p_lease_policy_version
    )
  );
  insert into public.broker_capture_recovery_commands (
    request_id, input_digest, batch_limit, status, result, created_at, applied_at
  ) values (
    p_request_id, v_input_digest, p_batch_limit, 'pending', null,
    clock_timestamp(), null
  ) on conflict (request_id) do nothing;
  select * into strict v_command
  from public.broker_capture_recovery_commands
  where request_id = p_request_id
  for update;
  if v_command.input_digest is distinct from v_input_digest
    or v_command.batch_limit is distinct from p_batch_limit
  then raise exception 'RECOVERY_REQUEST_DRIFT'; end if;
  if v_command.status = 'applied' then return v_command.result; end if;

  v_now := clock_timestamp();
  for v_work_unit in
    select * from public.broker_capture_work_units
    where status in ('leased', 'running')
      and lease_expires_at is not null and lease_expires_at <= v_now
    order by lease_expires_at, id
    for update skip locked
    limit p_batch_limit
  loop
    -- The account slot is locked after its Work Unit, matching Claim/Renew.
    select * into v_account_lease
    from public.broker_capture_account_leases
    where broker_account_id = v_work_unit.broker_account_id
      and sync_kind = 'provider_api_observation' for update;
    v_now := clock_timestamp();
    select * into v_work_unit from public.broker_capture_work_units
    where id = v_work_unit.id for update;
    if v_work_unit.status not in ('leased', 'running')
      or v_work_unit.lease_expires_at is null
      or v_work_unit.lease_expires_at > v_now
    then continue; end if;

    if v_account_lease.broker_account_id is null
      or v_account_lease.state is distinct from 'leased'
      or v_account_lease.user_id is distinct from v_work_unit.user_id
      or v_account_lease.sync_activation_id
        is distinct from v_work_unit.sync_activation_id
      or v_account_lease.activation_generation
        is distinct from v_work_unit.activation_generation
      or v_account_lease.work_unit_id is distinct from v_work_unit.id
      or v_account_lease.run_id is distinct from v_work_unit.run_id
      or v_account_lease.scope_id is distinct from v_work_unit.scope_id
      or v_account_lease.lane_state_id is distinct from v_work_unit.lane_state_id
      or v_account_lease.policy_generation
        is distinct from v_work_unit.policy_generation
      or v_account_lease.work_unit_row_version
        is distinct from v_work_unit.row_version
      or v_account_lease.lease_epoch is distinct from v_work_unit.lease_epoch
      or v_account_lease.lease_token_digest
        is distinct from v_work_unit.lease_token_digest
      or v_account_lease.lease_acquired_at
        is distinct from v_work_unit.lease_acquired_at
      or v_account_lease.lease_expires_at
        is distinct from v_work_unit.lease_expires_at
      or v_account_lease.lease_max_expires_at
        is distinct from v_work_unit.lease_max_expires_at
      or v_account_lease.lease_renew_count
        is distinct from v_work_unit.lease_renew_count
      or v_account_lease.lease_policy_version
        is distinct from v_work_unit.lease_policy_version
    then raise exception 'RECOVERY_ACCOUNT_LEASE_DRIFT'; end if;

    select exists (
      select 1 from public.broker_capture_request_authorizations authorization_row
      where authorization_row.work_unit_id = v_work_unit.id
        and authorization_row.lease_token_digest = v_work_unit.lease_token_digest
        and authorization_row.page_commit_input_digest is null
        and not exists (
          select 1 from public.broker_capture_attempt_outcomes outcome
          where outcome.work_unit_id = v_work_unit.id
            and outcome.expected_work_unit_row_version =
              authorization_row.work_unit_row_version
            and outcome.request_sequence = authorization_row.request_sequence
            and outcome.lease_token_digest = v_work_unit.lease_token_digest
        )
    ) into v_has_unresolved_permit;
    select exists (
      select 1 from public.broker_capture_request_authorizations authorization_row
      where authorization_row.work_unit_id = v_work_unit.id
        and authorization_row.lease_token_digest = v_work_unit.lease_token_digest
        and (
          authorization_row.page_commit_input_digest is not null
          or exists (
            select 1 from public.broker_capture_attempt_outcomes outcome
            where outcome.work_unit_id = v_work_unit.id
              and outcome.expected_work_unit_row_version =
                authorization_row.work_unit_row_version
              and outcome.request_sequence = authorization_row.request_sequence
              and outcome.lease_token_digest = v_work_unit.lease_token_digest
          )
        )
    ) into v_has_resolved_permit;
    v_before := v_work_unit;
    v_previous_epoch := v_work_unit.lease_epoch;
    v_previous_expiry := v_work_unit.lease_expires_at;
    v_next_status := case
      when v_has_unresolved_permit then 'recovery_pending'
      when v_has_resolved_permit then case v_work_unit.checkpoint ->> 'status'
        when 'retry_pending' then 'retry_pending'
        when 'yielded' then 'yielded'
        when 'terminal_observed' then 'terminal_observed'
        when 'partial_failed' then 'partial_failed'
        when 'loop_blocked' then 'partial_failed'
        else 'pending' end
      else 'pending' end;
    update public.broker_capture_work_units
    set status = v_next_status,
        lease_token_digest = null, lease_token_format_version = null,
        lease_acquired_at = null, lease_expires_at = null,
        lease_max_expires_at = null, lease_renew_count = 0,
        lease_policy_version = null, lease_epoch = lease_epoch + 1,
        recovery_state = case when v_has_unresolved_permit
          then 'uncertain_egress' else 'none' end,
        row_version = row_version + 1, updated_at = v_now
    where id = v_work_unit.id and row_version = v_work_unit.row_version
    returning * into v_work_unit;

    update public.broker_capture_account_leases
    set state = 'available', sync_activation_id = null,
        activation_generation = null, work_unit_id = null, run_id = null,
        scope_id = null, lane_state_id = null, policy_generation = null,
        work_unit_row_version = null, lease_epoch = null,
        lease_token_digest = null, lease_acquired_at = null,
        lease_expires_at = null, lease_max_expires_at = null,
        lease_renew_count = null, lease_policy_version = null,
        row_version = row_version + 1, updated_at = v_now
    where broker_account_id = v_before.broker_account_id
      and sync_kind = 'provider_api_observation'
      and state = 'leased'
      and user_id = v_before.user_id
      and sync_activation_id = v_before.sync_activation_id
      and activation_generation = v_before.activation_generation
      and work_unit_id = v_before.id
      and run_id = v_before.run_id
      and scope_id = v_before.scope_id
      and lane_state_id = v_before.lane_state_id
      and policy_generation = v_before.policy_generation
      and work_unit_row_version = v_before.row_version
      and lease_epoch = v_before.lease_epoch
      and lease_token_digest = v_before.lease_token_digest
      and lease_acquired_at = v_before.lease_acquired_at
      and lease_expires_at = v_before.lease_expires_at
      and lease_max_expires_at = v_before.lease_max_expires_at
      and lease_renew_count = v_before.lease_renew_count
      and lease_policy_version = v_before.lease_policy_version;
    if not found then raise exception 'RECOVERY_ACCOUNT_LEASE_CAS_MISMATCH'; end if;

    v_inspected := v_inspected + 1;
    if v_has_unresolved_permit then
      v_uncertain := v_uncertain + 1;
    elsif v_has_resolved_permit then
      v_outcome_derived := v_outcome_derived + 1;
    else
      v_requeued := v_requeued + 1;
    end if;
    v_event_digest := public.equora_scheduler_digest_v1(
      'broker-capture-expired-recovery-event-v1',
      jsonb_build_object(
        'commandRequestId', p_request_id::text,
        'workUnitId', v_work_unit.id::text,
        'previousLeaseEpoch', v_previous_epoch,
        'previousLeaseExpiresAt', v_previous_expiry,
        'resultStatus', v_next_status
      )
    );
    insert into public.broker_capture_lease_events (
      id, request_id, event_kind, input_digest, user_id, broker_account_id,
      work_unit_id, run_id, scope_id, previous_work_unit_row_version,
      next_work_unit_row_version, previous_lease_epoch, next_lease_epoch,
      previous_lease_expires_at, next_lease_expires_at, result_code, result,
      created_at
    ) values (
      gen_random_uuid(), p_request_id, 'expired_recovery', v_event_digest,
      v_work_unit.user_id, v_work_unit.broker_account_id, v_work_unit.id,
      v_work_unit.run_id, v_work_unit.scope_id, v_work_unit.row_version - 1,
      v_work_unit.row_version, v_previous_epoch, v_work_unit.lease_epoch,
      v_previous_expiry, null,
       case when v_has_unresolved_permit then 'uncertain_egress'
         when v_has_resolved_permit then 'outcome_derived'
         else 'requeued' end,
      jsonb_build_object(
        'status', v_next_status, 'workUnitId', v_work_unit.id::text,
        'authorityBlocked', true
      ), v_now
    );
  end loop;

  -- A released uncertain-egress row is intentionally not claimable while a
  -- broker send may still be in flight. Once every unresolved authorization
  -- has been past its immutable send deadline for 30 seconds, the GET-only
  -- request can be retried safely through the normal idempotent capture path.
  -- This second bounded pass prevents recovery_pending from becoming a
  -- lease-free terminal orphan after a worker crash.
  for v_work_unit in
    select candidate.*
    from public.broker_capture_work_units candidate
    where candidate.status = 'recovery_pending'
      and candidate.recovery_state = 'uncertain_egress'
      and not exists (
        select 1
        from public.broker_capture_request_authorizations authorization_row
        where authorization_row.work_unit_id = candidate.id
          and authorization_row.work_unit_row_version = candidate.row_version - 1
          and authorization_row.request_sequence = candidate.request_sequence + 1
          and authorization_row.page_commit_input_digest is null
          and not exists (
            select 1
            from public.broker_capture_attempt_outcomes outcome
            where outcome.work_unit_id = candidate.id
              and outcome.expected_work_unit_row_version =
                authorization_row.work_unit_row_version
              and outcome.request_sequence = authorization_row.request_sequence
          )
          and authorization_row.send_deadline_at + interval '30 seconds' > v_now
      )
    order by candidate.updated_at, candidate.id
    for update skip locked
    limit greatest(0, p_batch_limit - v_inspected)
  loop
    v_now := clock_timestamp();
    select * into v_work_unit
    from public.broker_capture_work_units
    where id = v_work_unit.id for update;
    if v_work_unit.status is distinct from 'recovery_pending'
      or v_work_unit.recovery_state is distinct from 'uncertain_egress'
      or exists (
        select 1
        from public.broker_capture_request_authorizations authorization_row
        where authorization_row.work_unit_id = v_work_unit.id
          and authorization_row.work_unit_row_version = v_work_unit.row_version - 1
          and authorization_row.request_sequence = v_work_unit.request_sequence + 1
          and authorization_row.page_commit_input_digest is null
          and not exists (
            select 1
            from public.broker_capture_attempt_outcomes outcome
            where outcome.work_unit_id = v_work_unit.id
              and outcome.expected_work_unit_row_version =
                authorization_row.work_unit_row_version
              and outcome.request_sequence = authorization_row.request_sequence
          )
          and authorization_row.send_deadline_at + interval '30 seconds' > v_now
      )
    then continue; end if;

    select exists (
      select 1
      from public.broker_capture_request_authorizations authorization_row
      where authorization_row.work_unit_id = v_work_unit.id
        and authorization_row.work_unit_row_version = v_work_unit.row_version - 1
        and authorization_row.request_sequence = v_work_unit.request_sequence + 1
        and (
          authorization_row.page_commit_input_digest is not null
          or exists (
            select 1
            from public.broker_capture_attempt_outcomes outcome
            where outcome.work_unit_id = v_work_unit.id
              and outcome.expected_work_unit_row_version =
                authorization_row.work_unit_row_version
              and outcome.request_sequence = authorization_row.request_sequence
          )
        )
    ) into v_has_resolved_permit;
    v_before := v_work_unit;
    v_previous_epoch := v_work_unit.lease_epoch;
    v_next_status := case when v_has_resolved_permit then
      case v_work_unit.checkpoint ->> 'status'
        when 'retry_pending' then 'retry_pending'
        when 'yielded' then 'yielded'
        when 'terminal_observed' then 'terminal_observed'
        when 'partial_failed' then 'partial_failed'
        when 'loop_blocked' then 'partial_failed'
        else 'retry_pending' end
      else 'retry_pending' end;

    update public.broker_capture_work_units
    set status = v_next_status,
        recovery_state = 'none',
        retry_not_before = case when v_next_status = 'retry_pending'
          then v_now else retry_not_before end,
        row_version = row_version + 1,
        lease_epoch = lease_epoch + 1,
        updated_at = v_now
    where id = v_before.id
      and row_version = v_before.row_version
      and status = 'recovery_pending'
      and recovery_state = 'uncertain_egress'
    returning * into v_work_unit;
    if not found then continue; end if;

    v_inspected := v_inspected + 1;
    if v_has_resolved_permit then
      v_outcome_derived := v_outcome_derived + 1;
    else
      v_requeued := v_requeued + 1;
    end if;
    v_event_digest := public.equora_scheduler_digest_v1(
      'broker-capture-uncertain-egress-resolution-event-v1',
      jsonb_build_object(
        'commandRequestId', p_request_id::text,
        'workUnitId', v_work_unit.id::text,
        'previousLeaseEpoch', v_previous_epoch,
        'resultStatus', v_next_status,
        'quiescenceMarginSeconds', 30
      )
    );
    insert into public.broker_capture_lease_events (
      id, request_id, event_kind, input_digest, user_id, broker_account_id,
      work_unit_id, run_id, scope_id, previous_work_unit_row_version,
      next_work_unit_row_version, previous_lease_epoch, next_lease_epoch,
      previous_lease_expires_at, next_lease_expires_at, result_code, result,
      created_at
    ) values (
      gen_random_uuid(), p_request_id, 'uncertain_egress_resolution',
      v_event_digest, v_work_unit.user_id, v_work_unit.broker_account_id,
      v_work_unit.id, v_work_unit.run_id, v_work_unit.scope_id,
      v_before.row_version, v_work_unit.row_version, v_previous_epoch,
      v_work_unit.lease_epoch, null, null,
      case when v_has_resolved_permit then 'outcome_derived'
        else 'quiescent_requeue' end,
      jsonb_build_object(
        'status', v_next_status, 'workUnitId', v_work_unit.id::text,
        'quiescenceMarginSeconds', 30, 'authorityBlocked', true
      ), v_now
    );
  end loop;

  v_result := jsonb_build_object(
    'status', case when v_inspected = 0 then 'no_expired' else 'recovered' end,
    'requestId', p_request_id::text, 'inspectedCount', v_inspected,
    'requeuedCount', v_requeued, 'uncertainEgressCount', v_uncertain,
    'outcomeDerivedCount', v_outcome_derived,
    'authorityBlocked', true
  );
  update public.broker_capture_recovery_commands
  set status = 'applied', result = v_result, applied_at = clock_timestamp()
  where request_id = p_request_id and status = 'pending'
    and input_digest = v_input_digest and batch_limit = p_batch_limit;
  if not found then raise exception 'RECOVERY_REQUEST_DRIFT'; end if;
  return v_result;
exception
  when lock_not_available then raise exception 'RECOVERY_LOCK_TIMEOUT';
  when query_canceled then raise exception 'RECOVERY_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_recover_expired_broker_capture_leases_v1(
  uuid,integer,text
) from public, anon, authenticated;
grant execute on function public.equora_recover_expired_broker_capture_leases_v1(
  uuid,integer,text
) to service_role;

-- Exact least-privilege end state. Revoke every explicit non-owner table ACL,
-- including project-specific/default-privilege grantees that are not among the
-- four standard Supabase runtime roles.
do $$
declare
  v_relation regclass;
  v_acl record;
begin
  foreach v_relation in array array[
    'public.broker_sync_scopes'::regclass,
    'public.broker_capture_runs'::regclass,
    'public.broker_capture_work_units'::regclass,
    'public.broker_account_identities'::regclass,
    'public.broker_capture_schedule_occurrences'::regclass,
    'public.broker_capture_materialization_commands'::regclass,
    'public.broker_capture_run_lane_inputs'::regclass,
    'public.broker_sync_scope_buckets'::regclass,
    'public.broker_capture_account_leases'::regclass,
    'public.broker_capture_lease_events'::regclass,
    'public.broker_capture_recovery_commands'::regclass
  ]::regclass[]
  loop
    for v_acl in
      select distinct exploded.grantee, role_row.rolname
      from pg_class relation_row
      cross join lateral aclexplode(
        coalesce(relation_row.relacl, acldefault('r', relation_row.relowner))
      ) exploded
      left join pg_roles role_row on role_row.oid = exploded.grantee
      where relation_row.oid = v_relation
        and exploded.grantee <> relation_row.relowner
    loop
      if v_acl.grantee = 0 then
        execute format('revoke all privileges on table %s from public', v_relation);
      elsif v_acl.rolname is not null then
        execute format(
          'revoke all privileges on table %s from %I',
          v_relation, v_acl.rolname
        );
      else
        raise exception 'SCHEDULER_CONTROL_TABLE_ACL_GRANTEE_INVALID';
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on table
  public.broker_sync_scopes,
  public.broker_capture_runs,
  public.broker_capture_work_units,
  public.broker_account_identities,
  public.broker_capture_schedule_occurrences,
  public.broker_capture_materialization_commands,
  public.broker_capture_run_lane_inputs,
  public.broker_sync_scope_buckets,
  public.broker_capture_account_leases,
  public.broker_capture_lease_events,
  public.broker_capture_recovery_commands
from equora_broker_capture_owner;

grant select on table
  public.broker_sync_scopes,
  public.broker_capture_runs,
  public.broker_capture_work_units,
  public.broker_account_identities,
  public.broker_capture_schedule_occurrences,
  public.broker_capture_materialization_commands,
  public.broker_capture_run_lane_inputs,
  public.broker_sync_scope_buckets,
  public.broker_capture_account_leases,
  public.broker_capture_lease_events,
  public.broker_capture_recovery_commands
to equora_broker_capture_owner;

grant insert on table
  public.broker_sync_scopes,
  public.broker_capture_runs,
  public.broker_capture_work_units,
  public.broker_capture_schedule_occurrences,
  public.broker_capture_materialization_commands,
  public.broker_capture_run_lane_inputs,
  public.broker_sync_scope_buckets,
  public.broker_capture_account_leases,
  public.broker_capture_lease_events,
  public.broker_capture_recovery_commands
to equora_broker_capture_owner;

grant update on table
  public.broker_sync_scopes,
  public.broker_capture_runs,
  public.broker_capture_work_units,
  public.broker_capture_materialization_commands,
  public.broker_capture_account_leases,
  public.broker_capture_recovery_commands
to equora_broker_capture_owner;

-- The scheduler owner requires only the closed digest/MAC dependencies used by
-- the SECURITY DEFINER functions below. It receives no schema CREATE right.
grant usage on schema public, equora_private to equora_broker_capture_owner;
grant execute on function public.equora_pgcrypto_digest_v1(bytea,text)
  to equora_broker_capture_owner;
grant execute on function public.equora_pgcrypto_hmac_v1(bytea,bytea,text)
  to equora_broker_capture_owner;
grant execute on function public.equora_mexc_page_scope_digest_v1(
  text,text,bigint,bigint,integer,integer,integer,text,text
) to equora_broker_capture_owner;
grant execute on function public.equora_mexc_checkpoint_mac_v1(jsonb,bytea)
  to equora_broker_capture_owner;
grant execute on function public.equora_lease_token_digest_v1(uuid)
  to equora_broker_capture_owner;
grant execute on function public.equora_constant_time_hex_equal_v1(text,text)
  to equora_broker_capture_owner;
grant execute on function public.equora_tcj_atom_v1(text,text)
  to equora_broker_capture_owner;
grant execute on function public.equora_tcj_quote_v1(text)
  to equora_broker_capture_owner;
grant execute on function public.equora_tcj_object_v1(jsonb)
  to equora_broker_capture_owner;
grant execute on function public.equora_tcj_digest_v1(text,text)
  to equora_broker_capture_owner;

alter function public.equora_lock_capture_parent_chain_v1(uuid,timestamptz)
  owner to equora_broker_capture_owner;
alter function public.equora_lock_capture_parent_chain_v1(uuid,timestamptz,boolean)
  owner to equora_broker_capture_owner;
alter function public.equora_scheduler_digest_v1(text,jsonb)
  owner to equora_broker_capture_owner;
alter function public.equora_stability_bucket_identity_digest_v1(
  text,text,text,text,text,text,text,uuid,uuid,integer,text,text,text,integer,
  text,text,text,text,text,bigint,bigint,text
) owner to equora_broker_capture_owner;
alter function public.equora_scope_bucket_set_valid_v1(uuid)
  owner to equora_broker_capture_owner;
alter function public.equora_lane_execution_allowed_v1(uuid,text,timestamptz)
  owner to equora_broker_capture_owner;
alter function public.equora_runtime_enrollment_allows_v1(uuid,text,uuid)
  owner to equora_broker_capture_owner;
alter function public.equora_materialize_next_due_broker_capture_v1(uuid,text)
  owner to equora_broker_capture_owner;
alter function public.equora_renew_broker_capture_lease_v1(
  uuid,bigint,uuid,uuid,text
) owner to equora_broker_capture_owner;
alter function public.equora_release_broker_capture_lease_v1(
  uuid,bigint,uuid,uuid,text,text
) owner to equora_broker_capture_owner;
alter function public.equora_continue_yielded_broker_capture_work_unit_v1(
  uuid,bigint,uuid,text
) owner to equora_broker_capture_owner;
alter function public.equora_recover_expired_broker_capture_leases_v1(
  uuid,integer,text
) owner to equora_broker_capture_owner;

-- Normalize EXECUTE for all current grantees, not only the known runtime roles.
do $$
declare
  v_signature text;
  v_procedure regprocedure;
  v_acl record;
begin
  foreach v_signature in array array[
    'public.equora_lock_active_broker_account_identity_v1(uuid,uuid,text,text)',
    'public.equora_lock_capture_parent_chain_v1(uuid,timestamptz)',
    'public.equora_lock_capture_parent_chain_v1(uuid,timestamptz,boolean)',
    'public.equora_scheduler_digest_v1(text,jsonb)',
    'public.equora_stability_bucket_identity_digest_v1(text,text,text,text,text,text,text,uuid,uuid,integer,text,text,text,integer,text,text,text,text,text,bigint,bigint,text)',
    'public.equora_scope_bucket_set_valid_v1(uuid)',
    'public.equora_lane_execution_allowed_v1(uuid,text,timestamptz)',
    'public.equora_runtime_enrollment_allows_v1(uuid,text,uuid)',
    'public.equora_materialize_next_due_broker_capture_v1(uuid,text)',
    'public.equora_renew_broker_capture_lease_v1(uuid,bigint,uuid,uuid,text)',
    'public.equora_release_broker_capture_lease_v1(uuid,bigint,uuid,uuid,text,text)',
    'public.equora_continue_yielded_broker_capture_work_unit_v1(uuid,bigint,uuid,text)',
    'public.equora_recover_expired_broker_capture_leases_v1(uuid,integer,text)'
  ]::text[]
  loop
    v_procedure := to_regprocedure(v_signature);
    if v_procedure is null then
      raise exception 'SCHEDULER_CONTROL_FUNCTION_MISSING: %', v_signature;
    end if;
    for v_acl in
      select distinct exploded.grantee, role_row.rolname
      from pg_proc procedure_row
      cross join lateral aclexplode(
        coalesce(procedure_row.proacl, acldefault('f', procedure_row.proowner))
      ) exploded
      left join pg_roles role_row on role_row.oid = exploded.grantee
      where procedure_row.oid = v_procedure
        and exploded.privilege_type = 'EXECUTE'
        and exploded.grantee <> procedure_row.proowner
    loop
      if v_acl.grantee = 0 then
        execute format('revoke all privileges on function %s from public', v_procedure);
      elsif v_acl.rolname is not null then
        execute format(
          'revoke all privileges on function %s from %I',
          v_procedure, v_acl.rolname
        );
      else
        raise exception 'SCHEDULER_CONTROL_FUNCTION_ACL_GRANTEE_INVALID';
      end if;
    end loop;
  end loop;
end;
$$;

grant execute on function public.equora_lock_active_broker_account_identity_v1(
  uuid,uuid,text,text
) to equora_broker_capture_owner;
grant execute on function public.equora_materialize_next_due_broker_capture_v1(
  uuid,text
) to service_role;
grant execute on function public.equora_renew_broker_capture_lease_v1(
  uuid,bigint,uuid,uuid,text
) to service_role;
grant execute on function public.equora_release_broker_capture_lease_v1(
  uuid,bigint,uuid,uuid,text,text
) to service_role;
grant execute on function public.equora_continue_yielded_broker_capture_work_unit_v1(
  uuid,bigint,uuid,text
) to service_role;
grant execute on function public.equora_recover_expired_broker_capture_leases_v1(
  uuid,integer,text
) to service_role;

do $$
begin
  revoke create on schema public from equora_broker_capture_owner;
  execute format(
    'revoke equora_broker_capture_owner from %I', current_user
  );
end;
$$;

insert into equora_private.schema_migrations (
  migration_id, contract_fingerprint
) values (
  'equora_v57.61.0_g1_scheduler_control_v2',
  '87158546782b900817d3f36501a2e43b5619906a2f07636d0cb1167b042e5ab7'
) on conflict (migration_id) do nothing;

-- Fail closed if RLS, ownership, table ACLs, SECURITY DEFINER settings or the
-- service-only RPC boundary drift from the contract above.
do $$
declare
  v_expected_tables text[] := array[
    'broker_capture_schedule_occurrences',
    'broker_capture_materialization_commands',
    'broker_capture_run_lane_inputs',
    'broker_sync_scope_buckets',
    'broker_capture_account_leases',
    'broker_capture_lease_events',
    'broker_capture_recovery_commands'
  ];
  v_constraint_contract_fingerprint text;
  v_index_contract_fingerprint text;
begin
  if not exists (
    select 1 from pg_roles
    where rolname = 'equora_broker_capture_owner'
      and rolcanlogin = false and rolinherit = false and rolbypassrls = true
      and rolsuper = false and rolcreatedb = false and rolcreaterole = false
      and rolreplication = false
  ) or exists (
    select 1
    from pg_auth_members membership
    join pg_roles member_role on member_role.oid = membership.member
    join pg_roles granted_role on granted_role.oid = membership.roleid
    where member_role.rolname = 'equora_broker_capture_owner'
      or (
        granted_role.rolname = 'equora_broker_capture_owner'
        and (
          member_role.rolname <> 'postgres'
          or membership.admin_option is distinct from true
          or membership.inherit_option is distinct from false
          or membership.set_option is distinct from false
        )
      )
  ) then
    raise exception 'SCHEDULER_CONTROL_OWNER_SECURITY_DRIFT';
  end if;

  if not exists (
    select 1 from equora_private.schema_migrations
    where migration_id = 'equora_v57.61.0_g1_scheduler_control_v2'
        and contract_fingerprint =
          '87158546782b900817d3f36501a2e43b5619906a2f07636d0cb1167b042e5ab7'
  ) then
    raise exception 'SCHEDULER_CONTROL_MARKER_DRIFT';
  end if;

  if exists (
    select 1
    from unnest(v_expected_tables) expected(relation_name)
    left join pg_class relation_row
      on relation_row.oid = to_regclass('public.' || expected.relation_name)
    left join pg_namespace namespace_row
      on namespace_row.oid = relation_row.relnamespace
    left join pg_roles owner_row on owner_row.oid = relation_row.relowner
    where relation_row.oid is null
      or relation_row.relkind <> 'r'
      or namespace_row.nspname is distinct from 'public'
      or owner_row.rolname is distinct from 'postgres'
      or relation_row.relrowsecurity is distinct from true
  ) then
    raise exception 'SCHEDULER_CONTROL_TABLE_SECURITY_DRIFT';
  end if;

  if exists (
    with expected_acl(
      relation_name, allow_select, allow_insert, allow_update, allow_delete
    ) as (
      values
        ('public.broker_sync_scopes', true, true, true, false),
        ('public.broker_capture_runs', true, true, true, false),
        ('public.broker_capture_work_units', true, true, true, false),
        ('public.broker_account_identities', true, false, false, false),
        ('public.broker_capture_schedule_occurrences', true, true, false, false),
        ('public.broker_capture_materialization_commands', true, true, true, false),
        ('public.broker_capture_run_lane_inputs', true, true, false, false),
        ('public.broker_sync_scope_buckets', true, true, false, false),
        ('public.broker_capture_account_leases', true, true, true, false),
        ('public.broker_capture_lease_events', true, true, false, false),
        ('public.broker_capture_recovery_commands', true, true, true, false)
    )
    select 1 from expected_acl expected
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
  ) or exists (
    select 1
    from pg_class relation_row
    join pg_namespace namespace_row
      on namespace_row.oid = relation_row.relnamespace
    cross join lateral aclexplode(
      coalesce(relation_row.relacl, acldefault('r', relation_row.relowner))
    ) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where namespace_row.nspname = 'public'
      and relation_row.relname = any(array[
        'broker_sync_scopes', 'broker_capture_runs',
        'broker_capture_work_units', 'broker_account_identities',
        'broker_capture_schedule_occurrences',
        'broker_capture_materialization_commands',
        'broker_capture_run_lane_inputs', 'broker_sync_scope_buckets',
        'broker_capture_account_leases', 'broker_capture_lease_events',
        'broker_capture_recovery_commands'
      ])
      and exploded.privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE')
      and coalesce(grantee_row.rolname, 'PUBLIC') not in (
        'postgres', 'equora_broker_capture_owner'
      )
  ) then
    raise exception 'SCHEDULER_CONTROL_TABLE_ACL_DRIFT';
  end if;

  if has_schema_privilege(
    'equora_broker_capture_owner', 'public', 'create'
  ) then
    raise exception 'SCHEDULER_CONTROL_OWNER_SCHEMA_DRIFT';
  end if;

  if exists (
    with expected_function(
      signature, security_definer, volatility, strictness, lock_timeout,
      statement_timeout, service_execute
    ) as (
      values
        ('public.equora_lock_capture_parent_chain_v1(uuid,timestamptz)',
          true, 'v', true, '2s', '5s', false),
        ('public.equora_lock_capture_parent_chain_v1(uuid,timestamptz,boolean)',
          true, 'v', true, '2s', '5s', false),
        ('public.equora_scheduler_digest_v1(text,jsonb)', false, 'i', true,
          null::text, null::text, false),
        ('public.equora_stability_bucket_identity_digest_v1(text,text,text,text,text,text,text,uuid,uuid,integer,text,text,text,integer,text,text,text,text,text,bigint,bigint,text)',
          false, 'i', false, null::text, null::text, false),
        ('public.equora_scope_bucket_set_valid_v1(uuid)',
          true, 's', true, '2s', '5s', false),
        ('public.equora_lane_execution_allowed_v1(uuid,text,timestamptz)',
          true, 's', true, '2s', '5s', false),
        ('public.equora_runtime_enrollment_allows_v1(uuid,text,uuid)',
          true, 's', true, '2s', '5s', false),
        ('public.equora_materialize_next_due_broker_capture_v1(uuid,text)',
          true, 'v', false, '2s', '12s', true),
        ('public.equora_renew_broker_capture_lease_v1(uuid,bigint,uuid,uuid,text)',
          true, 'v', false, '2s', '10s', true),
        ('public.equora_release_broker_capture_lease_v1(uuid,bigint,uuid,uuid,text,text)',
          true, 'v', false, '2s', '10s', true),
        ('public.equora_continue_yielded_broker_capture_work_unit_v1(uuid,bigint,uuid,text)',
          true, 'v', false, '2s', '10s', true),
        ('public.equora_recover_expired_broker_capture_leases_v1(uuid,integer,text)',
          true, 'v', false, '2s', '12s', true)
    )
    select 1
    from expected_function expected
    left join pg_proc procedure_row
      on procedure_row.oid = to_regprocedure(expected.signature)
    left join pg_namespace namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    left join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    where procedure_row.oid is null
      or namespace_row.nspname is distinct from 'public'
      or owner_row.rolname is distinct from 'equora_broker_capture_owner'
      or procedure_row.prosecdef is distinct from expected.security_definer
      or procedure_row.provolatile is distinct from expected.volatility::"char"
      or procedure_row.proisstrict is distinct from expected.strictness
      or not (
        coalesce(procedure_row.proconfig, array[]::text[]) @>
          case when expected.lock_timeout is null then
            array['search_path=""']::text[]
          else array[
            'search_path=""', 'lock_timeout=' || expected.lock_timeout,
            'statement_timeout=' || expected.statement_timeout
          ]::text[] end
        and coalesce(procedure_row.proconfig, array[]::text[]) <@
          case when expected.lock_timeout is null then
            array['search_path=""']::text[]
          else array[
            'search_path=""', 'lock_timeout=' || expected.lock_timeout,
            'statement_timeout=' || expected.statement_timeout
          ]::text[] end
      )
      or has_function_privilege('service_role', expected.signature, 'execute')
        is distinct from expected.service_execute
      or has_function_privilege('anon', expected.signature, 'execute')
      or has_function_privilege('authenticated', expected.signature, 'execute')
  ) or exists (
    select 1
    from pg_proc procedure_row
    cross join lateral aclexplode(
      coalesce(procedure_row.proacl, acldefault('f', procedure_row.proowner))
    ) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where procedure_row.oid = any(array[
      to_regprocedure('public.equora_lock_capture_parent_chain_v1(uuid,timestamptz)'),
      to_regprocedure('public.equora_lock_capture_parent_chain_v1(uuid,timestamptz,boolean)'),
      to_regprocedure('public.equora_scheduler_digest_v1(text,jsonb)'),
      to_regprocedure('public.equora_stability_bucket_identity_digest_v1(text,text,text,text,text,text,text,uuid,uuid,integer,text,text,text,integer,text,text,text,text,text,bigint,bigint,text)'),
      to_regprocedure('public.equora_scope_bucket_set_valid_v1(uuid)'),
      to_regprocedure('public.equora_lane_execution_allowed_v1(uuid,text,timestamptz)'),
      to_regprocedure('public.equora_runtime_enrollment_allows_v1(uuid,text,uuid)'),
      to_regprocedure('public.equora_materialize_next_due_broker_capture_v1(uuid,text)'),
      to_regprocedure('public.equora_renew_broker_capture_lease_v1(uuid,bigint,uuid,uuid,text)'),
      to_regprocedure('public.equora_release_broker_capture_lease_v1(uuid,bigint,uuid,uuid,text,text)'),
      to_regprocedure('public.equora_continue_yielded_broker_capture_work_unit_v1(uuid,bigint,uuid,text)'),
      to_regprocedure('public.equora_recover_expired_broker_capture_leases_v1(uuid,integer,text)')
    ]::regprocedure[])
      and exploded.privilege_type = 'EXECUTE'
      and coalesce(grantee_row.rolname, 'PUBLIC') not in (
        'equora_broker_capture_owner', 'service_role'
      )
  ) or exists (
    select 1
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    where procedure_row.oid = to_regprocedure(
        'public.equora_lock_active_broker_account_identity_v1(uuid,uuid,text,text)'
      )
      and (
        namespace_row.nspname is distinct from 'public'
        or owner_row.rolname is distinct from 'postgres'
        or procedure_row.prosecdef is distinct from true
        or procedure_row.provolatile is distinct from 'v'::"char"
        or procedure_row.proisstrict is distinct from false
        or not (
          procedure_row.proconfig @> array[
            'search_path=""', 'lock_timeout=2s', 'statement_timeout=5s'
          ]::text[]
          and procedure_row.proconfig <@ array[
            'search_path=""', 'lock_timeout=2s', 'statement_timeout=5s'
          ]::text[]
        )
      )
  ) or to_regprocedure(
      'public.equora_lock_active_broker_account_identity_v1(uuid,uuid,text,text)'
    ) is null
    or not has_function_privilege(
      'equora_broker_capture_owner',
      'public.equora_lock_active_broker_account_identity_v1(uuid,uuid,text,text)',
      'execute'
    )
    or has_function_privilege(
      'service_role',
      'public.equora_lock_active_broker_account_identity_v1(uuid,uuid,text,text)',
      'execute'
    )
    or exists (
      select 1
      from pg_proc procedure_row
      cross join lateral aclexplode(
        coalesce(procedure_row.proacl, acldefault('f', procedure_row.proowner))
      ) exploded
      left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
      where procedure_row.oid = to_regprocedure(
          'public.equora_lock_active_broker_account_identity_v1(uuid,uuid,text,text)'
        )
        and exploded.privilege_type = 'EXECUTE'
        and coalesce(grantee_row.rolname, 'PUBLIC') not in (
          'postgres', 'equora_broker_capture_owner'
        )
    )
  then
    raise exception 'SCHEDULER_CONTROL_FUNCTION_SECURITY_DRIFT';
  end if;

  with selected_constraints as (
    select relation_row.relname, constraint_row.conname,
      constraint_row.contype, constraint_row.convalidated,
      constraint_row.oid
    from pg_constraint constraint_row
    join pg_class relation_row on relation_row.oid = constraint_row.conrelid
    join pg_namespace namespace_row
      on namespace_row.oid = relation_row.relnamespace
    where namespace_row.nspname = 'public'
      and (
        relation_row.relname in (
          'broker_capture_schedule_occurrences',
          'broker_capture_materialization_commands',
          'broker_capture_run_lane_inputs',
          'broker_sync_scope_buckets',
          'broker_capture_account_leases',
          'broker_capture_lease_events',
          'broker_capture_recovery_commands'
        )
        or (relation_row.relname, constraint_row.conname) in (
          values
            ('broker_capture_work_units',
              'broker_capture_work_units_status_check'),
            ('broker_capture_work_units',
              'broker_capture_work_units_lease_pair_check'),
            ('broker_capture_work_units',
              'broker_capture_work_units_recovery_state_check'),
            ('broker_capture_work_units',
              'broker_capture_work_units_continuation_check'),
            ('broker_capture_work_units',
              'broker_capture_work_units_predecessor_fkey'),
            ('broker_capture_work_units',
              'broker_capture_work_units_scheduler_reference_key'),
            ('broker_capture_runs',
              'broker_capture_runs_row_version_check'),
            ('broker_sync_scopes',
              'broker_sync_scopes_bucket_set_check'),
            ('broker_sync_scopes',
              'broker_sync_scopes_scheduler_reference_key'),
            ('broker_sync_scopes',
              'broker_sync_scopes_bucket_reference_unique'),
            ('broker_sync_lane_requirements',
              'broker_sync_lane_requirements_scheduler_reference_key'),
            ('broker_sync_lane_states',
              'broker_sync_lane_states_scheduler_reference_key')
        )
      )
  )
  select encode(public.equora_pgcrypto_digest_v1(
    convert_to(string_agg(
      relname || '|' || conname || '|' || contype::text || '|'
        || convalidated::text || '|' || pg_get_constraintdef(oid, true),
      E'\n' order by relname, conname
    ), 'UTF8'),
    'sha256'
  ), 'hex')
  into v_constraint_contract_fingerprint
  from selected_constraints;

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
        'broker_capture_schedule_occurrences',
        'broker_capture_materialization_commands',
        'broker_capture_run_lane_inputs',
        'broker_sync_scope_buckets',
        'broker_capture_account_leases',
        'broker_capture_lease_events',
        'broker_capture_recovery_commands'
      )
      or index_row.indexname in (
        'broker_capture_work_units_predecessor_unique',
        'broker_capture_work_units_open_scope_unique',
        'idx_broker_capture_work_units_expired_authority',
        'idx_broker_capture_work_units_recovery_pending',
        'broker_capture_work_units_scheduler_reference_key',
        'broker_sync_lane_requirements_scheduler_reference_key',
        'broker_sync_lane_states_scheduler_reference_key',
        'broker_sync_scopes_scheduler_reference_key',
        'broker_sync_scopes_bucket_reference_unique'
      )
    );

  raise notice 'SCHEDULER_CONTROL_SCHEMA_HASHES constraints=% indexes=%',
    v_constraint_contract_fingerprint, v_index_contract_fingerprint;

  if v_constraint_contract_fingerprint is distinct from
      '1c580277b1cb2b2ef30112855cc27fb864ec0a28bd8d0eccbc776365909721b4'
  then
    raise exception 'SCHEDULER_CONTROL_CONSTRAINT_DEFINITION_DRIFT';
  end if;

  if v_index_contract_fingerprint is distinct from
      '60ddc321d9ce4303120e760658a50916172e26da7c020043eec074736c28c8c1'
  then
    raise exception 'SCHEDULER_CONTROL_INDEX_DEFINITION_DRIFT';
  end if;
end;
$$;

commit;

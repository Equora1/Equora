-- Equora v57.61.0 - G1 local capture claim and failure control plane.
--
-- Local migration artifact only. Do not execute this file against a connected
-- Supabase project or production database before the documented migration,
-- backup/restore, RLS and rollout gates have passed and the user has approved.
--
-- This patch does not call a broker, decrypt credentials, expose integrity-key
-- material, normalize events, create journal trades or enable a scheduler.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '120s';

do $$
declare
  v_base_fingerprint text;
begin
  select contract_fingerprint into v_base_fingerprint
  from equora_private.schema_migrations
  where migration_id = 'equora_v57.61.0_broker_capture_v1';

  if v_base_fingerprint is distinct from
    '492ebad5496806ad60425abd58e9801c58a58b421e38392d54e6082d7fa2b083'
  then
    raise exception 'CONTROL_MIGRATION_BASE_NOT_APPLIED';
  end if;
end;
$$;

do $$
declare
  v_migration_id constant text := 'equora_v57.61.0_g1_capture_control_v1';
  v_contract_fingerprint constant text := 'c133d5e0c987e7f927963db4465ef5ab2f6f4c174cfdc96a3ed1cffb5cd62be5';
  v_existing_fingerprint text;
begin
  select contract_fingerprint into v_existing_fingerprint
  from equora_private.schema_migrations
  where migration_id = v_migration_id;

  if v_existing_fingerprint is null and (
    to_regclass('public.broker_capture_attempt_outcomes') is not null
    or to_regprocedure(
      'public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)'
    ) is not null
    or to_regprocedure(
      'public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,integer,integer,integer,text)'
    ) is not null
    or to_regprocedure(
      'public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)'
    ) is not null
    or to_regprocedure(
      'public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,timestamp with time zone,integer,integer,text)'
    ) is not null
    or to_regprocedure(
      'public.equora_mexc_request_checkpoint_valid_v1(jsonb,text,text,bigint,bigint,integer,integer)'
    ) is not null
    or exists (
      select 1
      from pg_constraint
      where conrelid = 'public.broker_providers'::regclass
        and conname = 'broker_providers_mexc_get_only_capabilities_check'
    )
    or exists (
      select 1
      from pg_attribute
      where attrelid = 'public.broker_capture_work_units'::regclass
        and attname in (
          'claim_count',
          'claim_policy_version',
          'last_claim_request_id',
          'claimed_at',
          'retry_not_before',
          'last_error_code',
          'last_error_at',
          'terminal_reason',
          'max_attempts'
        )
        and not attisdropped
    )
  ) then
    raise exception 'CONTROL_MIGRATION_PREEXISTING_PARTIAL_SCHEMA';
  end if;

  if v_existing_fingerprint is not null
    and v_existing_fingerprint is distinct from v_contract_fingerprint
  then
    raise exception 'CONTROL_MIGRATION_CONTRACT_FINGERPRINT_DRIFT';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Claim/retry state on the bounded work unit.
-- ---------------------------------------------------------------------------

alter table public.broker_capture_work_units
  add column if not exists claim_count integer not null default 0,
  add column if not exists claim_policy_version text,
  add column if not exists last_claim_request_id uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists retry_not_before timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_at timestamptz,
  add column if not exists terminal_reason text,
  add column if not exists max_attempts integer not null default 8;

do $$
begin
  if exists (
    select 1
    from public.broker_capture_work_units
    where claim_count < 0
      or max_attempts not between 1 and 8
      or attempt > max_attempts
      or (last_claim_request_id is null) <> (claimed_at is null)
      or (claim_policy_version is null) <> (last_claim_request_id is null)
      or (retry_not_before is not null and status <> 'retry_pending')
      or (status = 'retry_pending' and retry_not_before is null)
      or (last_error_code is null) <> (last_error_at is null)
  ) then
    raise exception 'CONTROL_MIGRATION_WORK_UNIT_STATE_INVALID';
  end if;

  alter table public.broker_capture_work_units
    drop constraint if exists broker_capture_work_units_claim_state_check;
  alter table public.broker_capture_work_units
    add constraint broker_capture_work_units_claim_state_check check ((
      claim_count >= 0
      and max_attempts between 1 and 8
      and attempt <= max_attempts
      and (
        (
          last_claim_request_id is null
          and claimed_at is null
          and claim_policy_version is null
        )
        or (
          last_claim_request_id is not null
          and claimed_at is not null
          and claim_policy_version is not null
          and claim_policy_version = 'broker-capture-claim-v1'
        )
      )
    ) is true);

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_capture_work_units'::regclass
      and conname = 'broker_capture_work_units_retry_state_check'
  ) then
    alter table public.broker_capture_work_units
      add constraint broker_capture_work_units_retry_state_check check (
        (status = 'retry_pending' and retry_not_before is not null)
        or (status <> 'retry_pending' and retry_not_before is null)
      );
  end if;

  alter table public.broker_capture_work_units
    drop constraint if exists broker_capture_work_units_error_state_check;
  alter table public.broker_capture_work_units
    add constraint broker_capture_work_units_error_state_check check ((
      (last_error_code is null and last_error_at is null)
      or (
        last_error_code is not null
        and last_error_code ~ '^[a-z][a-z0-9_]{0,62}$'
        and last_error_at is not null
      )
    ) is true);

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.broker_capture_work_units'::regclass
      and conname = 'broker_capture_work_units_terminal_reason_check'
  ) then
    alter table public.broker_capture_work_units
      add constraint broker_capture_work_units_terminal_reason_check check (
        terminal_reason is null
        or terminal_reason ~ '^[a-z][a-z0-9_]{0,62}$'
      );
  end if;
end;
$$;

create unique index if not exists broker_capture_work_units_claim_request_unique
  on public.broker_capture_work_units (last_claim_request_id)
  where last_claim_request_id is not null;

create index if not exists idx_broker_capture_work_units_claimable
  on public.broker_capture_work_units (
    sync_activation_id,
    activation_generation,
    status,
    retry_not_before,
    created_at,
    id
  )
  where status in ('pending', 'retry_pending', 'leased', 'running');

-- ---------------------------------------------------------------------------
-- Immutable, sanitized failure/retry outcomes. No raw body or provider message.
-- ---------------------------------------------------------------------------

create table if not exists public.broker_capture_attempt_outcomes (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  run_id uuid not null,
  scope_id uuid not null,
  work_unit_id uuid not null,
  expected_work_unit_row_version bigint not null,
  work_unit_row_version_after bigint not null,
  attempt integer not null,
  request_sequence integer not null,
  lease_token_digest text not null,
  failure_policy_version text not null,
  failure_code text not null,
  failure_class text not null,
  outcome_status text not null,
  retry_not_before timestamptz,
  http_status integer,
  response_bytes integer not null,
  request_duration_ms integer not null,
  expected_checkpoint_mac text not null,
  checkpoint_after jsonb not null,
  checkpoint_mac_after text not null,
  terminal_reason text,
  run_status_after text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint broker_capture_attempt_outcomes_work_unit_fkey
    foreign key (work_unit_id, run_id, scope_id, user_id, broker_account_id)
    references public.broker_capture_work_units (
      id, run_id, scope_id, user_id, broker_account_id
    )
    on delete cascade,
  constraint broker_capture_attempt_outcomes_activation_fkey
    foreign key (sync_activation_id, user_id, broker_account_id, activation_generation)
    references public.broker_sync_activations (
      id, user_id, broker_account_id, activation_generation
    )
    on delete restrict,
  constraint broker_capture_attempt_outcomes_version_check
    check (failure_policy_version = 'broker-capture-failure-policy-v1'),
  constraint broker_capture_attempt_outcomes_generation_check
    check (
      activation_generation > 0
      and expected_work_unit_row_version >= 0
      and work_unit_row_version_after = expected_work_unit_row_version + 1
      and attempt > 0
      and request_sequence > 0
    ),
  constraint broker_capture_attempt_outcomes_lease_digest_check
    check (lease_token_digest ~ '^[a-f0-9]{64}$'),
  constraint broker_capture_attempt_outcomes_failure_code_check
    check (failure_code in (
      'transport_contract_violation',
      'invalid_query',
      'invalid_provider_time',
      'invalid_credential',
      'ip_not_allowed',
      'permission_missing',
      'rate_limited',
      'provider_busy',
      'maintenance',
      'invalid_request',
      'unsupported_contract',
      'unknown_provider_error',
      'provider_unavailable',
      'timeout',
      'response_too_large',
      'malformed_response'
    )),
  constraint broker_capture_attempt_outcomes_failure_class_check
    check (failure_class in ('transport', 'provider', 'authority', 'contract', 'resource', 'timeout')),
  constraint broker_capture_attempt_outcomes_status_check
    check (outcome_status in ('retry_pending', 'partial_failed', 'terminal_failed')),
  constraint broker_capture_attempt_outcomes_retry_shape_check
    check (
      (outcome_status = 'retry_pending' and retry_not_before is not null)
      or (outcome_status <> 'retry_pending' and retry_not_before is null)
    ),
  constraint broker_capture_attempt_outcomes_http_check
    check (http_status is null or http_status between 100 and 599),
  constraint broker_capture_attempt_outcomes_bytes_check
    check (response_bytes between 0 and 65536),
  constraint broker_capture_attempt_outcomes_duration_check
    check (request_duration_ms between 0 and 60000),
  constraint broker_capture_attempt_outcomes_checkpoint_check
    check (
      expected_checkpoint_mac ~ '^[a-f0-9]{64}$'
      and checkpoint_mac_after ~ '^[a-f0-9]{64}$'
      and jsonb_typeof(checkpoint_after) = 'object'
      and checkpoint_after ->> 'checkpointMac' = checkpoint_mac_after
    ),
  constraint broker_capture_attempt_outcomes_terminal_reason_check
    check ((
      (outcome_status = 'retry_pending' and terminal_reason is null)
      or (
        outcome_status <> 'retry_pending'
        and terminal_reason is not null
        and terminal_reason in (
          'claim_attempt_budget_reached', 'failure_budget_reached',
          'retry_budget_reached', 'provider_retry_deferred',
          'non_retryable_failure', 'response_exceeds_remaining_budget'
        )
      )
    ) is true),
  constraint broker_capture_attempt_outcomes_run_status_check
    check (run_status_after in ('running', 'partial', 'failed')),
  constraint broker_capture_attempt_outcomes_work_attempt_unique
    unique (work_unit_id, attempt, request_sequence),
  constraint broker_capture_attempt_outcomes_id_binding_key
    unique (id, work_unit_id, run_id, scope_id, user_id, broker_account_id)
);

do $$
begin
  if exists (
    select 1
    from public.broker_capture_attempt_outcomes
    where not ((
      (outcome_status = 'retry_pending' and terminal_reason is null)
      or (
        outcome_status <> 'retry_pending'
        and terminal_reason is not null
        and terminal_reason in (
          'claim_attempt_budget_reached', 'failure_budget_reached',
          'retry_budget_reached', 'provider_retry_deferred',
          'non_retryable_failure', 'response_exceeds_remaining_budget'
        )
      )
    ) is true)
  ) then
    raise exception 'CONTROL_MIGRATION_OUTCOME_STATE_INVALID';
  end if;

  alter table public.broker_capture_attempt_outcomes
    drop constraint if exists
      broker_capture_attempt_outcomes_terminal_reason_check;
  alter table public.broker_capture_attempt_outcomes
    add constraint broker_capture_attempt_outcomes_terminal_reason_check
    check ((
      (outcome_status = 'retry_pending' and terminal_reason is null)
      or (
        outcome_status <> 'retry_pending'
        and terminal_reason is not null
        and terminal_reason in (
          'claim_attempt_budget_reached', 'failure_budget_reached',
          'retry_budget_reached', 'provider_retry_deferred',
          'non_retryable_failure', 'response_exceeds_remaining_budget'
        )
      )
    ) is true);
end;
$$;

create index if not exists idx_broker_capture_attempt_outcomes_work_unit_fkey
  on public.broker_capture_attempt_outcomes (
    work_unit_id, run_id, scope_id, user_id, broker_account_id
  );

create index if not exists idx_broker_capture_attempt_outcomes_activation_fkey
  on public.broker_capture_attempt_outcomes (
    sync_activation_id, user_id, broker_account_id, activation_generation
  );

create index if not exists idx_broker_capture_attempt_outcomes_owner_created
  on public.broker_capture_attempt_outcomes (
    user_id, broker_account_id, created_at desc, id
  );

alter table public.broker_capture_attempt_outcomes enable row level security;
drop policy if exists "users can read own broker_capture_attempt_outcomes"
  on public.broker_capture_attempt_outcomes;
create policy "users can read own broker_capture_attempt_outcomes"
  on public.broker_capture_attempt_outcomes
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.broker_capture_attempt_outcomes
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Honest MEXC activation evidence. This validates the immutable activation
-- snapshot only; it does not claim technical introspection of all key rights.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.broker_providers'::regclass
      and conname = 'broker_providers_mexc_get_only_capabilities_check'
  ) then
    alter table public.broker_providers
      add constraint broker_providers_mexc_get_only_capabilities_check
      check (
        provider_code <> 'mexc'
        or (
          readonly_capabilities -> 'historical_orders_v1' ->> 'method' = 'GET'
          and readonly_capabilities -> 'historical_executions_v3' ->> 'method' = 'GET'
          and readonly_capabilities -> 'historical_positions_v1' ->> 'method' = 'GET'
          and readonly_capabilities -> 'funding_records_v1' ->> 'method' = 'GET'
        ) is true
      ) not valid;
  end if;
end;
$$;

alter table public.broker_providers
  validate constraint broker_providers_mexc_get_only_capabilities_check;

create or replace function public.equora_mexc_request_checkpoint_valid_v1(
  p_checkpoint jsonb,
  p_expected_capability_id text,
  p_expected_symbol text,
  p_expected_start_ms bigint,
  p_expected_end_ms bigint,
  p_expected_position_type integer,
  p_expected_request_sequence integer
) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_scope jsonb;
  v_cursor jsonb;
  v_item jsonb;
  v_max_page_size integer;
begin
  if p_checkpoint is null
    or p_expected_capability_id not in (
      'historical_orders_v1', 'historical_executions_v3',
      'historical_positions_v1', 'funding_records_v1'
    )
    or p_expected_symbol is null
    or p_expected_start_ms is null
    or p_expected_end_ms is null
    or p_expected_request_sequence is null
    or p_expected_request_sequence < 0
    or (
      p_expected_capability_id in ('historical_positions_v1', 'funding_records_v1')
      and (p_expected_position_type in (1, 2)) is not true
    )
    or (
      p_expected_capability_id in ('historical_orders_v1', 'historical_executions_v3')
      and p_expected_position_type is not null
    )
    or not public.equora_jsonb_exact_keys_v1(p_checkpoint, array[
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
  then
    return false;
  end if;

  v_scope := p_checkpoint -> 'scope';
  if not public.equora_jsonb_exact_keys_v1(
      v_scope,
      case when p_expected_capability_id in ('historical_positions_v1', 'funding_records_v1')
        then array['symbol', 'startTime', 'endTime', 'pageNumber', 'pageSize', 'positionType']
        else array['symbol', 'startTime', 'endTime', 'pageNumber', 'pageSize']
      end
    )
    or p_checkpoint ->> 'checkpointVersion' is distinct from 'mexc-page-checkpoint-v1'
    or p_checkpoint ->> 'checkpointMacVersion' is distinct from 'mexc-page-checkpoint-hmac-sha256-v1'
    or (p_checkpoint ->> 'checkpointMac' ~ '^[a-f0-9]{64}$') is not true
    or p_checkpoint ->> 'budgetProfileId' is distinct from 'mexc-history-page-budget-v1'
    or p_checkpoint ->> 'budgetProfileDigest' is distinct from 'aba71711421cebbff9f7ab4f8c761865aac36dffc91adc3d7468b6e632ab56aa'
    or p_checkpoint ->> 'capabilityId' is distinct from p_expected_capability_id
    or (p_checkpoint ->> 'scopeDigest' ~ '^[a-f0-9]{64}$') is not true
    or (p_checkpoint ->> 'authorityBlocked')::boolean is distinct from true
    or p_checkpoint ->> 'terminalEvidence' is distinct from 'none'
    or (p_checkpoint ->> 'orderedProviderIdentitySequenceDigest' ~ '^[a-f0-9]{64}$') is not true
    or (v_scope ->> 'symbol' ~ '^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$') is not true
    or v_scope ->> 'symbol' is distinct from p_expected_symbol
    or (v_scope ->> 'startTime')::bigint is distinct from p_expected_start_ms
    or (v_scope ->> 'endTime')::bigint is distinct from p_expected_end_ms
    or (v_scope ->> 'positionType')::integer is distinct from p_expected_position_type
  then
    return false;
  end if;

  v_max_page_size := case when p_expected_capability_id = 'historical_executions_v3'
    then 1000 else 100 end;
  if ((v_scope ->> 'pageNumber')::integer between 1 and 10000) is not true
    or ((v_scope ->> 'pageSize')::integer between 1 and v_max_page_size) is not true
    or ((p_checkpoint ->> 'workUnitSequence')::integer between 1 and 20) is not true
    or ((p_checkpoint ->> 'nextPageNumber')::integer between 1 and 10000) is not true
    or ((p_checkpoint ->> 'unitSuccessfulPages')::integer between 0 and 4) is not true
    or ((p_checkpoint ->> 'unitRequestAttempts')::integer between 0 and 6) is not true
    or ((p_checkpoint ->> 'unitRawEvents')::integer between 0 and 999) is not true
    or ((p_checkpoint ->> 'unitResponseBytes')::bigint between 0 and 327679) is not true
    or ((p_checkpoint ->> 'unitElapsedMs')::bigint between 0 and 59999) is not true
    or ((p_checkpoint ->> 'unitRetryCount')::integer between 0 and 2) is not true
    or ((p_checkpoint ->> 'unitBackoffMs')::bigint between 0 and 6000) is not true
    or ((p_checkpoint ->> 'totalSuccessfulPages')::integer between 0 and 99) is not true
    or ((p_checkpoint ->> 'totalRequestAttempts')::integer between 0 and 139) is not true
    or (p_checkpoint ->> 'totalRequestAttempts')::integer is distinct from p_expected_request_sequence
    or ((p_checkpoint ->> 'totalRawEvents')::integer between 0 and 99999) is not true
    or ((p_checkpoint ->> 'totalResponseBytes')::bigint between 0 and 6553599) is not true
    or ((p_checkpoint ->> 'totalElapsedMs')::bigint between 0 and 1199999) is not true
    or (p_checkpoint ->> 'unitSuccessfulPages')::integer > (p_checkpoint ->> 'totalSuccessfulPages')::integer
    or (p_checkpoint ->> 'unitRequestAttempts')::integer > (p_checkpoint ->> 'totalRequestAttempts')::integer
    or (p_checkpoint ->> 'unitRawEvents')::integer > (p_checkpoint ->> 'totalRawEvents')::integer
    or (p_checkpoint ->> 'unitResponseBytes')::bigint > (p_checkpoint ->> 'totalResponseBytes')::bigint
    or (p_checkpoint ->> 'unitElapsedMs')::bigint > (p_checkpoint ->> 'totalElapsedMs')::bigint
    or (p_checkpoint ->> 'unitBackoffMs')::bigint > (p_checkpoint ->> 'unitElapsedMs')::bigint
    or (p_checkpoint ->> 'totalRequestAttempts')::integer < (p_checkpoint ->> 'totalSuccessfulPages')::integer
    or (p_checkpoint ->> 'unitRequestAttempts')::integer < (p_checkpoint ->> 'unitSuccessfulPages')::integer
    or (p_checkpoint ->> 'totalRequestAttempts')::integer
      > 7 * (p_checkpoint ->> 'workUnitSequence')::integer
    or (p_checkpoint ->> 'totalSuccessfulPages')::integer
      > 5 * (p_checkpoint ->> 'workUnitSequence')::integer
    or (p_checkpoint ->> 'nextPageNumber')::integer
      <> (v_scope ->> 'pageNumber')::integer + (p_checkpoint ->> 'totalSuccessfulPages')::integer
    or (p_checkpoint ->> 'unitBackoffMs')::bigint <> (case (p_checkpoint ->> 'unitRetryCount')::integer
      when 0 then 0
      when 1 then 1000
      when 2 then 6000
      else -1
    end)
  then
    return false;
  end if;

  if (
      (p_checkpoint ->> 'status' = 'ready'
        and p_checkpoint ->> 'reason' in ('initialized', 'resumed_same_work_unit', 'continued_in_new_work_unit'))
      or (p_checkpoint ->> 'status' = 'continue' and p_checkpoint ->> 'reason' = 'page_committed')
      or (p_checkpoint ->> 'status' = 'retry_pending' and p_checkpoint ->> 'reason' = 'retry_scheduled')
    ) is not true
  then
    return false;
  end if;

  if jsonb_typeof(p_checkpoint -> 'seenPageFingerprints') is distinct from 'array'
    or jsonb_array_length(p_checkpoint -> 'seenPageFingerprints') > 100
  then
    return false;
  end if;
  for v_item in select value from jsonb_array_elements(p_checkpoint -> 'seenPageFingerprints')
  loop
    if jsonb_typeof(v_item) is distinct from 'string'
      or (v_item #>> '{}') !~ '^[a-f0-9]{64}$'
    then
      return false;
    end if;
  end loop;

  if jsonb_array_length(p_checkpoint -> 'seenPageFingerprints')
      <> (p_checkpoint ->> 'totalSuccessfulPages')::integer
    or (
      select count(distinct value)
      from jsonb_array_elements_text(p_checkpoint -> 'seenPageFingerprints') as fingerprint(value)
    ) <> jsonb_array_length(p_checkpoint -> 'seenPageFingerprints')
    or (
      (p_checkpoint ->> 'totalSuccessfulPages')::integer = 0
      and p_checkpoint -> 'lastPageFingerprint' <> 'null'::jsonb
    )
    or (
      (p_checkpoint ->> 'totalSuccessfulPages')::integer > 0
      and p_checkpoint ->> 'lastPageFingerprint' is distinct from
        p_checkpoint -> 'seenPageFingerprints' ->>
          (jsonb_array_length(p_checkpoint -> 'seenPageFingerprints') - 1)
    )
  then
    return false;
  end if;

  if p_checkpoint -> 'lastPageFingerprint' <> 'null'::jsonb
    and (p_checkpoint ->> 'lastPageFingerprint' ~ '^[a-f0-9]{64}$') is not true
  then
    return false;
  end if;
  if p_checkpoint -> 'lastCursor' <> 'null'::jsonb then
    v_cursor := p_checkpoint -> 'lastCursor';
    if not public.equora_jsonb_exact_keys_v1(v_cursor, array['providerId', 'providerTime'])
      or (v_cursor ->> 'providerId' ~ '^(0|[1-9][0-9]{0,39})$') is not true
      or ((v_cursor ->> 'providerTime')::bigint between 1000000000000 and 9999999999999) is not true
    then
      return false;
    end if;
  end if;
  if (((p_checkpoint ->> 'totalRawEvents')::integer = 0)) is distinct from
      (p_checkpoint -> 'lastCursor' = 'null'::jsonb)
  then
    return false;
  end if;

  if p_checkpoint -> 'lastErrorCode' <> 'null'::jsonb
    and p_checkpoint ->> 'lastErrorCode' not in (
      'transport_contract_violation', 'invalid_query', 'invalid_provider_time',
      'invalid_credential', 'ip_not_allowed', 'permission_missing',
      'rate_limited', 'provider_busy', 'maintenance', 'invalid_request',
      'unsupported_contract', 'unknown_provider_error', 'provider_unavailable',
      'timeout', 'response_too_large', 'malformed_response'
    )
  then
    return false;
  end if;
  if p_checkpoint ->> 'status' = 'retry_pending' then
    if ((p_checkpoint ->> 'suggestedBackoffMs')::integer in (1000, 5000)) is not true
      or ((p_checkpoint ->> 'retryNotBeforeMs')::bigint between 1000000000000 and 9999999999999) is not true
      or (p_checkpoint ->> 'lastErrorCode' in (
        'rate_limited', 'provider_busy', 'provider_unavailable', 'timeout'
      )) is not true
    then
      return false;
    end if;
  elsif p_checkpoint -> 'suggestedBackoffMs' <> 'null'::jsonb
    or p_checkpoint -> 'retryNotBeforeMs' <> 'null'::jsonb
  then
    return false;
  end if;
  if p_checkpoint ->> 'reason' in ('retry_scheduled', 'resumed_same_work_unit') then
    if (p_checkpoint ->> 'lastErrorCode' in (
      'rate_limited', 'provider_busy', 'provider_unavailable', 'timeout'
    )) is not true then
      return false;
    end if;
  elsif p_checkpoint -> 'lastErrorCode' <> 'null'::jsonb then
    return false;
  end if;

  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.equora_mexc_request_checkpoint_valid_v1(
  jsonb, text, text, bigint, bigint, integer, integer
) from public, anon, authenticated, service_role;

create or replace function public.equora_mexc_permission_evidence_valid_v1(
  p_permission_evidence jsonb,
  p_permission_evidence_version text,
  p_user_attested_at timestamptz,
  p_activation_cutover_at timestamptz,
  p_capability_versions jsonb
) returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select coalesce(
    p_permission_evidence_version = 'mexc_permission_evidence_v1'
    and p_user_attested_at <= p_activation_cutover_at
    and p_user_attested_at >= p_activation_cutover_at - interval '15 minutes'
    and public.equora_jsonb_exact_keys_v1(
      p_permission_evidence,
      array[
        'mappingEvidence',
        'requiredCapabilities',
        'technicallyDetectedWritePermissions',
        'userAttestation',
        'writePermissionIntrospection'
      ]
    )
    and p_permission_evidence ->> 'mappingEvidence'
      = 'official_docs_plus_support_statement_2026-08-05'
    and p_permission_evidence ->> 'userAttestation' = 'read_only_user_attested'
    and p_permission_evidence ->> 'writePermissionIntrospection' = 'unavailable'
    and p_permission_evidence -> 'requiredCapabilities' =
      '["funding_records_v1","historical_executions_v3","historical_orders_v1","historical_positions_v1"]'::jsonb
    and p_permission_evidence -> 'technicallyDetectedWritePermissions' = '[]'::jsonb
    and public.equora_jsonb_exact_keys_v1(
      p_capability_versions,
      array[
        'funding_records_v1',
        'historical_executions_v3',
        'historical_orders_v1',
        'historical_positions_v1'
      ]
    )
    and not exists (
      select 1
      from jsonb_each_text(p_capability_versions) as capability(version_key, version_value)
      where capability.version_value is distinct from 'v1'
    ),
    false
  )
$$;

revoke all on function public.equora_mexc_permission_evidence_valid_v1(
  jsonb, text, timestamptz, timestamptz, jsonb
) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Atomic, idempotent claim. Fixed 45-second lease; no secret material returned.
-- Global lock order follows the Page-Commit authority path: Work Unit -> Run ->
-- Series -> Activation -> Connection Account -> Connection -> Credential ->
-- Integrity Key -> Broker Account -> Provider -> Scope. The integrity key is
-- loaded only because the stored checkpoint is verified and a due retry is
-- re-sealed before it can be returned to a worker.
-- ---------------------------------------------------------------------------

create or replace function public.equora_claim_broker_capture_work_unit_v1(
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
  v_now timestamptz := clock_timestamp();
  v_lease_expires_at timestamptz;
  v_lease_token_digest text;
  v_work_unit public.broker_capture_work_units%rowtype;
  v_run public.broker_capture_runs%rowtype;
  v_scope public.broker_sync_scopes%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_connection_account public.broker_connection_accounts%rowtype;
  v_connection public.broker_connections%rowtype;
  v_credential record;
  v_integrity_key record;
  v_provider public.broker_providers%rowtype;
  v_account public.broker_accounts%rowtype;
  v_runtime_enrollment record;
  v_runtime_enrollment_row_count bigint := 0;
  v_checkpoint jsonb;
  v_checkpoint_mac text;
  v_recomputed_checkpoint_mac text;
  v_claim_replay boolean := false;
  v_account_lease_state text;
  v_account_lease_work_unit_id uuid;
  v_account_lease_valid boolean := false;
begin
  if p_work_unit_id is null
    or p_claim_request_id is null
    or p_lease_token is null
    or p_expected_work_unit_row_version is null
    or p_expected_work_unit_row_version < 0
    or p_claim_policy_version is distinct from 'broker-capture-claim-v1'
  then
    raise exception 'CONTROL_INVALID_INPUT';
  end if;

  v_lease_token_digest := public.equora_lease_token_digest_v1(p_lease_token);

  select * into v_work_unit
  from public.broker_capture_work_units
  where id = p_work_unit_id
  for update;
  if not found then raise exception 'CONTROL_WORK_UNIT_NOT_FOUND'; end if;
  v_now := clock_timestamp();

  if v_work_unit.last_claim_request_id is not distinct from p_claim_request_id then
    v_claim_replay := true;
    if v_work_unit.status not in ('leased', 'running')
      or v_work_unit.row_version <> p_expected_work_unit_row_version + 1
      or v_work_unit.claim_policy_version is distinct from p_claim_policy_version
      or v_work_unit.lease_token_digest is null
      or not public.equora_constant_time_hex_equal_v1(
        v_work_unit.lease_token_digest,
        v_lease_token_digest
      )
      or v_work_unit.lease_expires_at is null
      or v_work_unit.lease_expires_at <= v_now
    then
      raise exception 'CONTROL_CLAIM_REPLAY_MISMATCH';
    end if;
  else
    if v_work_unit.row_version <> p_expected_work_unit_row_version then
      raise exception 'CONTROL_WORK_UNIT_CAS_MISMATCH';
    end if;
    if v_work_unit.status not in ('pending', 'retry_pending', 'leased', 'running')
      or (
        v_work_unit.status in ('leased', 'running')
        and v_work_unit.lease_expires_at is not null
        and v_work_unit.lease_expires_at > v_now
      )
    then
      raise exception 'CONTROL_WORK_UNIT_NOT_CLAIMABLE';
    end if;
    if v_work_unit.status = 'retry_pending'
      and (v_work_unit.retry_not_before is null or v_work_unit.retry_not_before > v_now)
    then
      raise exception 'CONTROL_RETRY_NOT_DUE';
    end if;
    if v_work_unit.attempt >= v_work_unit.max_attempts then
      raise exception 'CONTROL_ATTEMPT_BUDGET_EXHAUSTED';
    end if;
  end if;

  select * into v_run
  from public.broker_capture_runs
  where id = v_work_unit.run_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found or v_run.status not in ('pending', 'running', 'partial') then
    raise exception 'CONTROL_RUN_INVALID';
  end if;

  select * into v_series
  from public.broker_sync_activation_series
  where id = (
    select activation_series_id
    from public.broker_sync_activations
    where id = v_work_unit.sync_activation_id
      and user_id = v_work_unit.user_id
      and broker_account_id = v_work_unit.broker_account_id
      and activation_generation = v_work_unit.activation_generation
  )
  for update;
  if not found then raise exception 'CONTROL_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_activation
  from public.broker_sync_activations
  where id = v_work_unit.sync_activation_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found or v_activation.activation_state <> 'active' then
    raise exception 'CONTROL_ACTIVATION_INACTIVE';
  end if;
  if v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
  then
    raise exception 'CONTROL_ACTIVATION_NOT_CURRENT';
  end if;
  if v_activation.capture_health not in ('pending', 'healthy')
    and not (
      v_activation.capture_health = 'degraded'
      and (
        v_run.trigger_kind = 'recovery'
        or v_run.lane_id in ('rolling_audit_7d_daily', 'rolling_audit_28d_weekly')
      )
    )
  then
    raise exception 'CONTROL_ACTIVATION_INACTIVE';
  end if;

  if v_activation.provider_code <> 'mexc'
    or public.equora_mexc_permission_evidence_valid_v1(
      v_activation.permission_evidence,
      v_activation.permission_evidence_version,
      v_activation.user_read_only_attested_at,
      v_activation.activation_cutover_at,
      v_activation.capability_versions
    ) is distinct from true
  then
    raise exception 'CONTROL_PERMISSION_EVIDENCE_INVALID';
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
    or v_connection_account.valid_from > v_now
    or (v_connection_account.valid_to is not null and v_connection_account.valid_to <= v_now)
  then
    raise exception 'CONTROL_CONNECTION_INACTIVE';
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
  then
    raise exception 'CONTROL_CONNECTION_INACTIVE';
  end if;

  select
    credential_row.id,
    credential_row.key_version,
    length(credential_row.encrypted_payload) > 0 as has_encrypted_payload
  into v_credential
  from public.broker_credentials as credential_row
  where credential_row.id = v_activation.active_credential_id
    and credential_row.user_id = v_activation.user_id
    and credential_row.provider = v_activation.provider_code
    and credential_row.key_version = v_activation.active_credential_key_version
  for share;
  if not found or not v_credential.has_encrypted_payload then
    raise exception 'CONTROL_CREDENTIAL_INACTIVE';
  end if;

  select
    integrity_key_row.id,
    integrity_key_row.key_version,
    integrity_key_row.status,
    integrity_key_row.valid_from,
    integrity_key_row.valid_to,
    integrity_key_row.key_material
  into v_integrity_key
  from equora_private.broker_capture_integrity_keys as integrity_key_row
  where integrity_key_row.id = v_activation.capture_integrity_key_id
    and integrity_key_row.user_id = v_activation.user_id
    and integrity_key_row.broker_account_id = v_activation.broker_account_id
    and integrity_key_row.key_version = v_activation.capture_integrity_key_version
  for share;
  if not found then raise exception 'CONTROL_INTEGRITY_KEY_INACTIVE'; end if;

  select * into v_account
  from public.broker_accounts
  where id = v_work_unit.broker_account_id
    and user_id = v_work_unit.user_id
    and provider_code = v_activation.provider_code
  for update;
  if not found
    or v_account.status <> 'active'
    or v_account.retention_status <> 'active'
  then
    raise exception 'CONTROL_ACTIVATION_INACTIVE';
  end if;

  select * into v_provider
  from public.broker_providers
  where provider_code = v_activation.provider_code
  for share;
  if not found
    or v_provider.status <> 'verified'
    or v_provider.mutations_forbidden is distinct from true
    or (v_activation.provider_contract_version = any(v_provider.allowed_contract_versions)) is not true
  then
    raise exception 'CONTROL_PROVIDER_BLOCKED';
  end if;

  -- The runtime enrollment is installed by the downstream deployment layer.
  -- When present it is an operational authority, not a finder hint: Claim
  -- locks and revalidates it after Account/Provider and before Scope. This
  -- closes disable-vs-Finder/Claim TOCTOU without making the earlier G1 layer
  -- depend on a table that does not yet exist during its own isolated tests.
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
      or v_runtime_enrollment.user_id is distinct from v_work_unit.user_id
      or v_runtime_enrollment.provider_code is distinct from v_activation.provider_code
      or v_runtime_enrollment.broker_account_id is distinct from v_work_unit.broker_account_id
    then
      raise exception 'CONTROL_RUNTIME_ENROLLMENT_INVALID';
    end if;
  end if;

  -- Scope is locked after Account and Provider, matching Page Commit's final
  -- mutation order. A concurrent close/invalidation therefore cannot be read
  -- from a stale snapshot and then leased.
  select * into v_scope
  from public.broker_sync_scopes
  where id = v_work_unit.scope_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found
    or v_scope.closed_at is not null
    or v_scope.scope_completeness not in ('unverified', 'partial')
    or v_scope.lane_id is distinct from v_work_unit.lane_id
  then
    raise exception 'CONTROL_SCOPE_INVALID';
  end if;
  if v_provider.readonly_capabilities -> v_scope.capability_id ->> 'method' is distinct from 'GET'
    or not (v_activation.capability_versions ? v_scope.capability_id)
  then
    raise exception 'CONTROL_PROVIDER_BLOCKED';
  end if;

  -- Re-read wall-clock authority after every potentially blocking lock. A key
  -- or replay lease that expired while this transaction waited is not current.
  v_now := clock_timestamp();
  if v_activation.activation_cutover_at > v_now
    or v_connection_account.valid_from > v_now
    or (v_connection_account.valid_to is not null and v_connection_account.valid_to <= v_now)
  then
    raise exception 'CONTROL_ACTIVATION_INACTIVE';
  end if;
  if v_integrity_key.status <> 'active'
    or v_integrity_key.valid_from > v_now
    or (v_integrity_key.valid_to is not null and v_integrity_key.valid_to <= v_now)
  then
    raise exception 'CONTROL_INTEGRITY_KEY_INACTIVE';
  end if;
  if v_work_unit.last_claim_request_id is not distinct from p_claim_request_id
    and v_work_unit.lease_expires_at <= v_now
  then
    raise exception 'CONTROL_CLAIM_REPLAY_MISMATCH';
  end if;

  begin
    if public.equora_mexc_request_checkpoint_valid_v1(
      v_work_unit.checkpoint,
      v_scope.capability_id,
      v_scope.instrument_symbol,
      v_scope.request_start_ms,
      v_scope.request_end_ms,
      v_scope.position_type,
      v_work_unit.request_sequence
    ) is distinct from true then
      raise exception 'CONTROL_CHECKPOINT_INVALID';
    end if;
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
      or not public.equora_jsonb_exact_keys_v1(
        v_work_unit.checkpoint -> 'scope',
        case when v_scope.position_type is null
          then array['symbol', 'startTime', 'endTime', 'pageNumber', 'pageSize']
          else array['symbol', 'startTime', 'endTime', 'pageNumber', 'pageSize', 'positionType']
        end
      )
    then
      raise exception 'CONTROL_CHECKPOINT_INVALID';
    end if;

    v_recomputed_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
      v_work_unit.checkpoint,
      v_integrity_key.key_material
    );
    if v_work_unit.checkpoint ->> 'checkpointMac' is distinct from v_work_unit.checkpoint_mac
      or not public.equora_constant_time_hex_equal_v1(
        v_recomputed_checkpoint_mac,
        v_work_unit.checkpoint_mac
      )
      or v_work_unit.checkpoint ->> 'capabilityId' is distinct from v_scope.capability_id
      or v_work_unit.checkpoint ->> 'scopeDigest' is distinct from public.equora_mexc_page_scope_digest_v1(
        v_scope.capability_id,
        v_scope.instrument_symbol,
        v_scope.request_start_ms,
        v_scope.request_end_ms,
        (v_work_unit.checkpoint -> 'scope' ->> 'pageNumber')::integer,
        (v_work_unit.checkpoint -> 'scope' ->> 'pageSize')::integer,
        v_scope.position_type,
        v_work_unit.checkpoint ->> 'budgetProfileId',
        v_work_unit.checkpoint ->> 'budgetProfileDigest'
      )
      or v_work_unit.checkpoint -> 'scope' ->> 'symbol' is distinct from v_scope.instrument_symbol
      or (v_work_unit.checkpoint -> 'scope' ->> 'startTime')::bigint is distinct from v_scope.request_start_ms
      or (v_work_unit.checkpoint -> 'scope' ->> 'endTime')::bigint is distinct from v_scope.request_end_ms
      or (v_work_unit.checkpoint -> 'scope' ->> 'positionType')::integer is distinct from v_scope.position_type
      or (v_work_unit.checkpoint ->> 'totalRequestAttempts')::integer
        is distinct from v_work_unit.request_sequence
      or (v_work_unit.checkpoint ->> 'authorityBlocked')::boolean is distinct from true
    then
      raise exception 'CONTROL_CHECKPOINT_INVALID';
    end if;
  exception when others then
    if sqlerrm like '%CONTROL_CHECKPOINT_INVALID%' then raise; end if;
    raise exception 'CONTROL_CHECKPOINT_INVALID';
  end;

  v_checkpoint := v_work_unit.checkpoint;
  v_checkpoint_mac := v_work_unit.checkpoint_mac;
  if v_work_unit.last_claim_request_id is distinct from p_claim_request_id then
    if v_work_unit.status = 'retry_pending' then
      if v_checkpoint ->> 'status' is distinct from 'retry_pending'
        or v_checkpoint ->> 'reason' is distinct from 'retry_scheduled'
        or (v_checkpoint ->> 'retryNotBeforeMs')::bigint is distinct from
          floor(extract(epoch from v_work_unit.retry_not_before) * 1000)::bigint
      then
        raise exception 'CONTROL_CHECKPOINT_INVALID';
      end if;
      v_checkpoint := v_checkpoint || jsonb_build_object(
        'status', 'ready',
        'reason', 'resumed_same_work_unit',
        'suggestedBackoffMs', null,
        'retryNotBeforeMs', null
      );
      v_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
        v_checkpoint,
        v_integrity_key.key_material
      );
      v_checkpoint := v_checkpoint || jsonb_build_object('checkpointMac', v_checkpoint_mac);
    elsif v_checkpoint ->> 'status' not in ('ready', 'continue') then
      raise exception 'CONTROL_CHECKPOINT_INVALID';
    end if;
  elsif v_checkpoint ->> 'status' not in ('ready', 'continue') then
    raise exception 'CONTROL_CHECKPOINT_INVALID';
  end if;

  if v_work_unit.last_claim_request_id is distinct from p_claim_request_id then
    v_lease_expires_at := v_now + interval '45 seconds';
    update public.broker_capture_work_units
    set status = 'leased',
        attempt = attempt + 1,
        claim_count = claim_count + 1,
        claim_policy_version = p_claim_policy_version,
        last_claim_request_id = p_claim_request_id,
        claimed_at = v_now,
        lease_token_digest = v_lease_token_digest,
        lease_token_format_version = 'uuid-sha256-v1',
        lease_epoch = lease_epoch + 1,
        lease_acquired_at = v_now,
        lease_expires_at = v_lease_expires_at,
        lease_max_expires_at = v_now + interval '180 seconds',
        lease_renew_count = 0,
        lease_policy_version = 'lease-control-v1',
        recovery_state = 'none',
        retry_not_before = null,
        terminal_reason = null,
        checkpoint = v_checkpoint,
        checkpoint_mac = v_checkpoint_mac,
        row_version = row_version + 1,
        updated_at = v_now
    where id = v_work_unit.id
      and row_version = p_expected_work_unit_row_version
    returning * into v_work_unit;
    if not found then raise exception 'CONTROL_WORK_UNIT_CAS_MISMATCH'; end if;

    update public.broker_capture_runs
    set status = 'running',
        started_at = coalesce(started_at, v_now),
        completed_at = null
    where id = v_run.id
      and user_id = v_run.user_id
      and broker_account_id = v_run.broker_account_id
    returning * into v_run;
  else
    v_lease_expires_at := v_work_unit.lease_expires_at;
  end if;

  if to_regclass('public.broker_capture_account_leases') is not null then
    execute $account_lease_insert$
      insert into public.broker_capture_account_leases (
        broker_account_id, sync_kind, user_id, state, row_version,
        created_at, updated_at
      ) values ($1, 'provider_api_observation', $2, 'available', 0, $3, $3)
      on conflict (broker_account_id, sync_kind) do nothing
    $account_lease_insert$
    using v_work_unit.broker_account_id, v_work_unit.user_id, v_now;

    execute $account_lease_lock$
      select state, work_unit_id
      from public.broker_capture_account_leases
      where broker_account_id = $1
        and sync_kind = 'provider_api_observation'
      for update
    $account_lease_lock$
    into v_account_lease_state, v_account_lease_work_unit_id
    using v_work_unit.broker_account_id;

    if v_account_lease_state = 'leased'
      and v_account_lease_work_unit_id is distinct from v_work_unit.id
    then
      raise exception 'CONTROL_ACCOUNT_LEASE_BUSY';
    end if;

    if v_claim_replay then
      execute $account_lease_replay$
        select exists (
          select 1 from public.broker_capture_account_leases account_lease
          where account_lease.broker_account_id = $1
            and account_lease.sync_kind = 'provider_api_observation'
            and account_lease.state = 'leased'
            and account_lease.user_id = $2
            and account_lease.sync_activation_id = $3
            and account_lease.activation_generation = $4
            and account_lease.work_unit_id = $5
            and account_lease.run_id = $6
            and account_lease.scope_id = $7
            and account_lease.lane_state_id = $8
            and account_lease.policy_generation = $9
            and account_lease.work_unit_row_version = $10
            and account_lease.lease_epoch = $11
            and public.equora_constant_time_hex_equal_v1(
              account_lease.lease_token_digest, $12
            )
            and account_lease.lease_acquired_at = $13
            and account_lease.lease_expires_at = $14
            and account_lease.lease_max_expires_at = $15
            and account_lease.lease_renew_count = 0
            and account_lease.lease_policy_version = 'lease-control-v1'
        )
      $account_lease_replay$
      into v_account_lease_valid
      using v_work_unit.broker_account_id, v_work_unit.user_id,
        v_work_unit.sync_activation_id, v_work_unit.activation_generation,
        v_work_unit.id, v_work_unit.run_id, v_work_unit.scope_id,
        v_work_unit.lane_state_id, v_work_unit.policy_generation,
        v_work_unit.row_version, v_work_unit.lease_epoch,
        v_work_unit.lease_token_digest, v_work_unit.lease_acquired_at,
        v_work_unit.lease_expires_at, v_work_unit.lease_max_expires_at;
      if not v_account_lease_valid then
        raise exception 'CONTROL_ACCOUNT_LEASE_DRIFT';
      end if;
    else
      execute $account_lease_update$
        update public.broker_capture_account_leases
        set state = 'leased', user_id = $2, sync_activation_id = $3,
            activation_generation = $4, work_unit_id = $5, run_id = $6,
            scope_id = $7, lane_state_id = $8, policy_generation = $9,
            work_unit_row_version = $10, lease_epoch = $11,
            lease_token_digest = $12, lease_acquired_at = $13,
            lease_expires_at = $14, lease_max_expires_at = $15,
            lease_renew_count = 0, lease_policy_version = 'lease-control-v1',
            row_version = row_version + 1, updated_at = $13
        where broker_account_id = $1
          and sync_kind = 'provider_api_observation'
      $account_lease_update$
      using v_work_unit.broker_account_id, v_work_unit.user_id,
        v_work_unit.sync_activation_id, v_work_unit.activation_generation,
        v_work_unit.id, v_work_unit.run_id, v_work_unit.scope_id,
        v_work_unit.lane_state_id, v_work_unit.policy_generation,
        v_work_unit.row_version, v_work_unit.lease_epoch,
        v_work_unit.lease_token_digest, v_work_unit.lease_acquired_at,
        v_work_unit.lease_expires_at, v_work_unit.lease_max_expires_at;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'claimed',
    'authorityBlocked', true,
    'claimPolicyVersion', p_claim_policy_version,
    'claimRequestId', p_claim_request_id,
    'workUnitId', v_work_unit.id,
    'workUnitRowVersion', v_work_unit.row_version,
    'attempt', v_work_unit.attempt,
    'maxAttempts', v_work_unit.max_attempts,
    'requestSequence', v_work_unit.request_sequence + 1,
    'leaseExpiresAt', v_lease_expires_at,
    'runId', v_work_unit.run_id,
    'scopeId', v_work_unit.scope_id,
    'brokerAccountId', v_work_unit.broker_account_id,
    'connectionAccountId', v_activation.connection_account_id,
    'syncActivationId', v_work_unit.sync_activation_id,
    'activationGeneration', v_work_unit.activation_generation,
    'providerCode', v_activation.provider_code,
    'providerContractVersion', v_activation.provider_contract_version,
    'adapterVersion', v_activation.adapter_version,
    'profileId', v_activation.profile_id,
    'profileVersion', v_activation.profile_version,
    'capabilityId', v_scope.capability_id,
    'endpointId', v_scope.endpoint_id,
    'instrumentSymbol', v_scope.instrument_symbol,
    'positionType', v_scope.position_type,
    'requestStartMs', v_scope.request_start_ms,
    'requestEndMs', v_scope.request_end_ms,
    'scopeDigest', v_scope.scope_digest,
    'pageScopeDigest', v_work_unit.checkpoint ->> 'scopeDigest',
    'accountIdentityDigest', v_scope.account_identity_digest,
    'accountIdentityKeyVersion', v_scope.account_identity_key_version,
    'checkpoint', v_work_unit.checkpoint,
    'checkpointMac', v_work_unit.checkpoint_mac,
    'expectedLedgerGeneration', v_account.ledger_generation,
    'credentialReference', jsonb_build_object(
      'id', v_activation.active_credential_id,
      'keyVersion', v_activation.active_credential_key_version
    ),
    'integrityKeyReference', jsonb_build_object(
      'id', v_activation.capture_integrity_key_id,
      'keyVersion', v_activation.capture_integrity_key_version
    )
  );
exception
  when lock_not_available then raise exception 'CONTROL_LOCK_TIMEOUT';
  when query_canceled then raise exception 'CONTROL_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_claim_broker_capture_work_unit_v1(
  uuid, bigint, uuid, uuid, text
) from public, anon, authenticated, service_role;
do $$
begin
  if exists (
    select 1 from equora_private.schema_migrations
    where migration_id = 'equora_v57.61.0_g1_activation_authority_v1'
  ) then
    if to_regrole('equora_broker_capture_owner') is null then
      raise exception 'CONTROL_MIGRATION_DOWNSTREAM_OWNER_MISSING';
    end if;
    execute 'grant execute on function '
      || 'public.equora_claim_broker_capture_work_unit_v1('
      || 'uuid,bigint,uuid,uuid,text) to equora_broker_capture_owner';
  else
    grant execute on function public.equora_claim_broker_capture_work_unit_v1(
      uuid, bigint, uuid, uuid, text
    ) to service_role;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic failure/retry result. The caller supplies only a closed error code and
-- bounded transport metrics. SQL verifies the stored checkpoint HMAC, derives
-- the exact retry/terminal transition, re-seals it with the private integrity
-- key and persists the immutable result. No caller-selected outcome status,
-- backoff or provider message crosses this boundary.
-- ---------------------------------------------------------------------------

create or replace function public.equora_record_broker_capture_failure_v1(
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
  v_now timestamptz := clock_timestamp();
  v_lease_token_digest text;
  v_failure_class text;
  v_actual_outcome_status text;
  v_run_status text;
  v_terminal_reason text;
  v_retry_not_before timestamptz;
  v_authorizing_lease_expires_at timestamptz;
  v_retry_not_before_ms bigint;
  v_backoff_ms integer;
  v_retryable boolean;
  v_retry_allowed boolean;
  v_failure_budget_reached boolean;
  v_scope_has_valid_result boolean;
  v_run_has_valid_result boolean;
  v_run_has_open_work boolean;
  v_unit_request_attempts integer;
  v_total_request_attempts integer;
  v_unit_response_bytes bigint;
  v_total_response_bytes bigint;
  v_unit_elapsed_ms bigint;
  v_total_elapsed_ms bigint;
  v_unit_retry_count integer;
  v_unit_backoff_ms bigint;
  v_next_checkpoint jsonb;
  v_next_checkpoint_mac text;
  v_recomputed_checkpoint_mac text;
  v_expected_checkpoint_mac text;
  v_existing public.broker_capture_attempt_outcomes%rowtype;
  v_work_unit public.broker_capture_work_units%rowtype;
  v_run public.broker_capture_runs%rowtype;
  v_scope public.broker_sync_scopes%rowtype;
  v_series public.broker_sync_activation_series%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_integrity_key record;
  v_account public.broker_accounts%rowtype;
  v_provider public.broker_providers%rowtype;
begin
  if p_work_unit_id is null
    or p_outcome_id is null
    or p_lease_token is null
    or p_expected_work_unit_row_version is null
    or p_expected_work_unit_row_version < 0
    or p_request_sequence is null
    or p_request_sequence < 1
    or p_expected_checkpoint_mac is null
    or p_expected_checkpoint_mac !~ '^[a-f0-9]{64}$'
    or p_expected_capability_id not in (
      'historical_orders_v1', 'historical_executions_v3',
      'historical_positions_v1', 'funding_records_v1'
    )
    or p_expected_page_scope_digest is null
    or p_expected_page_scope_digest !~ '^[a-f0-9]{64}$'
    or p_failure_code is null
    or p_failure_policy_version is distinct from 'broker-capture-failure-policy-v1'
    or p_failure_code not in (
      'transport_contract_violation', 'invalid_query', 'invalid_provider_time',
      'invalid_credential', 'ip_not_allowed', 'permission_missing',
      'rate_limited', 'provider_busy', 'maintenance', 'invalid_request',
      'unsupported_contract', 'unknown_provider_error', 'provider_unavailable',
      'timeout', 'response_too_large', 'malformed_response'
    )
    or (p_http_status is not null and p_http_status not between 100 and 599)
    or p_response_bytes is null
    or p_response_bytes not between 0 and 65536
    or p_request_duration_ms is null
    or p_request_duration_ms not between 0 and 60000
  then
    raise exception 'CONTROL_INVALID_INPUT';
  end if;

  if p_failure_code in (
    'transport_contract_violation', 'invalid_query', 'invalid_provider_time',
    'invalid_request', 'unsupported_contract', 'malformed_response'
  ) then v_failure_class := 'contract';
  elsif p_failure_code in ('invalid_credential', 'ip_not_allowed', 'permission_missing')
  then v_failure_class := 'authority';
  elsif p_failure_code in (
    'rate_limited', 'provider_busy', 'maintenance',
    'unknown_provider_error', 'provider_unavailable'
  ) then v_failure_class := 'provider';
  elsif p_failure_code = 'timeout' then v_failure_class := 'timeout';
  elsif p_failure_code = 'response_too_large' then v_failure_class := 'resource';
  else v_failure_class := 'transport';
  end if;

  v_lease_token_digest := public.equora_lease_token_digest_v1(p_lease_token);

  select * into v_existing
  from public.broker_capture_attempt_outcomes
  where id = p_outcome_id
  for update;
  if found then
    if v_existing.work_unit_id is distinct from p_work_unit_id
      or v_existing.expected_work_unit_row_version is distinct from p_expected_work_unit_row_version
      or v_existing.request_sequence is distinct from p_request_sequence
      or v_existing.expected_checkpoint_mac is distinct from p_expected_checkpoint_mac
      or v_existing.checkpoint_after ->> 'capabilityId' is distinct from p_expected_capability_id
      or v_existing.checkpoint_after ->> 'scopeDigest' is distinct from p_expected_page_scope_digest
      or v_existing.failure_code is distinct from p_failure_code
      or v_existing.failure_policy_version is distinct from p_failure_policy_version
      or v_existing.lease_token_digest is null
      or not public.equora_constant_time_hex_equal_v1(
        v_existing.lease_token_digest,
        v_lease_token_digest
      )
      or v_existing.http_status is distinct from p_http_status
      or v_existing.response_bytes is distinct from p_response_bytes
      or v_existing.request_duration_ms is distinct from p_request_duration_ms
    then
      raise exception 'CONTROL_FAILURE_REPLAY_MISMATCH';
    end if;

    return jsonb_build_object(
      'status', v_existing.outcome_status,
      'authorityBlocked', true,
      'outcomeId', v_existing.id,
      'workUnitId', v_existing.work_unit_id,
      'workUnitRowVersion', v_existing.work_unit_row_version_after,
      'attempt', v_existing.attempt,
      'requestSequence', v_existing.request_sequence,
      'failureCode', v_existing.failure_code,
      'failureClass', v_existing.failure_class,
      'retryNotBefore', v_existing.retry_not_before,
      'terminalReason', v_existing.terminal_reason,
      'checkpoint', v_existing.checkpoint_after,
      'checkpointMac', v_existing.checkpoint_mac_after,
      'runStatus', v_existing.run_status_after
    );
  end if;

  select * into v_work_unit
  from public.broker_capture_work_units
  where id = p_work_unit_id
  for update;
  if not found then raise exception 'CONTROL_WORK_UNIT_NOT_FOUND'; end if;
  v_now := clock_timestamp();
  if v_work_unit.row_version <> p_expected_work_unit_row_version
    or v_work_unit.request_sequence + 1 <> p_request_sequence
    or v_work_unit.checkpoint_mac is distinct from p_expected_checkpoint_mac
    or v_work_unit.checkpoint ->> 'capabilityId' is distinct from p_expected_capability_id
    or v_work_unit.checkpoint ->> 'scopeDigest' is distinct from p_expected_page_scope_digest
  then
    raise exception 'CONTROL_WORK_UNIT_CAS_MISMATCH';
  end if;
  if exists (
    select 1
    from public.broker_provider_request_results
    where work_unit_id = v_work_unit.id
      and request_sequence = p_request_sequence
  ) then
    raise exception 'CONTROL_REQUEST_OUTCOME_CONFLICT';
  end if;
  if v_work_unit.status not in ('leased', 'running')
    or v_work_unit.lease_token_format_version is distinct from 'uuid-sha256-v1'
    or v_work_unit.lease_token_digest is null
    or not public.equora_constant_time_hex_equal_v1(
      v_work_unit.lease_token_digest,
      v_lease_token_digest
    )
    or v_work_unit.lease_expires_at is null
    or v_work_unit.lease_expires_at <= v_now
  then
    raise exception 'CONTROL_LEASE_INVALID';
  end if;
  v_authorizing_lease_expires_at := v_work_unit.lease_expires_at;
  select * into v_run
  from public.broker_capture_runs
  where id = v_work_unit.run_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found or v_run.status not in ('pending', 'running') then
    raise exception 'CONTROL_RUN_INVALID';
  end if;

  select * into v_series
  from public.broker_sync_activation_series
  where id = (
    select activation_series_id
    from public.broker_sync_activations
    where id = v_work_unit.sync_activation_id
      and user_id = v_work_unit.user_id
      and broker_account_id = v_work_unit.broker_account_id
      and activation_generation = v_work_unit.activation_generation
  )
  for update;
  if not found then raise exception 'CONTROL_ACTIVATION_NOT_CURRENT'; end if;

  select * into v_activation
  from public.broker_sync_activations
  where id = v_work_unit.sync_activation_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found
    or v_activation.activation_state <> 'active'
    or v_series.current_sync_activation_id is distinct from v_activation.id
    or v_series.current_activation_generation is distinct from v_activation.activation_generation
  then
    raise exception 'CONTROL_ACTIVATION_NOT_CURRENT';
  end if;

  select
    integrity_key_row.id,
    integrity_key_row.key_version,
    integrity_key_row.status,
    integrity_key_row.valid_from,
    integrity_key_row.valid_to,
    integrity_key_row.key_material
  into v_integrity_key
  from equora_private.broker_capture_integrity_keys as integrity_key_row
  where integrity_key_row.id = v_activation.capture_integrity_key_id
    and integrity_key_row.user_id = v_activation.user_id
    and integrity_key_row.broker_account_id = v_activation.broker_account_id
    and integrity_key_row.key_version = v_activation.capture_integrity_key_version
  for share;
  if not found then raise exception 'CONTROL_INTEGRITY_KEY_INACTIVE'; end if;

  select * into v_account
  from public.broker_accounts
  where id = v_work_unit.broker_account_id
    and user_id = v_work_unit.user_id
    and provider_code = v_activation.provider_code
  for update;
  if not found
    or v_account.status <> 'active'
    or v_account.retention_status <> 'active'
  then
    raise exception 'CONTROL_ACTIVATION_INACTIVE';
  end if;

  select * into v_provider
  from public.broker_providers
  where provider_code = v_activation.provider_code
  for share;
  if not found
    or v_provider.status <> 'verified'
    or v_provider.mutations_forbidden is distinct from true
  then
    raise exception 'CONTROL_PROVIDER_BLOCKED';
  end if;

  select * into v_scope
  from public.broker_sync_scopes
  where id = v_work_unit.scope_id
    and user_id = v_work_unit.user_id
    and broker_account_id = v_work_unit.broker_account_id
    and sync_activation_id = v_work_unit.sync_activation_id
    and activation_generation = v_work_unit.activation_generation
  for update;
  if not found
    or v_scope.lane_id is distinct from v_work_unit.lane_id
    or v_scope.closed_at is not null
  then
    raise exception 'CONTROL_SCOPE_INVALID';
  end if;

  -- Revalidate every time-bounded authority after the final Scope lock.
  v_now := clock_timestamp();
  if v_work_unit.lease_expires_at <= v_now then
    raise exception 'CONTROL_LEASE_INVALID';
  end if;
  if v_activation.activation_cutover_at > v_now then
    raise exception 'CONTROL_ACTIVATION_INACTIVE';
  end if;
  if v_integrity_key.status <> 'active'
    or v_integrity_key.valid_from > v_now
    or (v_integrity_key.valid_to is not null and v_integrity_key.valid_to <= v_now)
  then
    raise exception 'CONTROL_INTEGRITY_KEY_INACTIVE';
  end if;

  begin
    if public.equora_mexc_request_checkpoint_valid_v1(
      v_work_unit.checkpoint,
      v_scope.capability_id,
      v_scope.instrument_symbol,
      v_scope.request_start_ms,
      v_scope.request_end_ms,
      v_scope.position_type,
      v_work_unit.request_sequence
    ) is distinct from true then
      raise exception 'CONTROL_CHECKPOINT_INVALID';
    end if;
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
      or not public.equora_jsonb_exact_keys_v1(
        v_work_unit.checkpoint -> 'scope',
        case when v_scope.position_type is null
          then array['symbol', 'startTime', 'endTime', 'pageNumber', 'pageSize']
          else array['symbol', 'startTime', 'endTime', 'pageNumber', 'pageSize', 'positionType']
        end
      )
      or v_work_unit.checkpoint ->> 'checkpointMac' is distinct from v_work_unit.checkpoint_mac
      or v_work_unit.checkpoint ->> 'checkpointVersion' is distinct from 'mexc-page-checkpoint-v1'
      or v_work_unit.checkpoint ->> 'checkpointMacVersion' is distinct from 'mexc-page-checkpoint-hmac-sha256-v1'
      or v_work_unit.checkpoint ->> 'budgetProfileId' is distinct from 'mexc-history-page-budget-v1'
      or v_work_unit.checkpoint ->> 'budgetProfileDigest' is distinct from 'aba71711421cebbff9f7ab4f8c761865aac36dffc91adc3d7468b6e632ab56aa'
      or v_work_unit.checkpoint ->> 'capabilityId' is distinct from v_scope.capability_id
      or v_work_unit.checkpoint ->> 'scopeDigest' is distinct from public.equora_mexc_page_scope_digest_v1(
        v_scope.capability_id,
        v_scope.instrument_symbol,
        v_scope.request_start_ms,
        v_scope.request_end_ms,
        (v_work_unit.checkpoint -> 'scope' ->> 'pageNumber')::integer,
        (v_work_unit.checkpoint -> 'scope' ->> 'pageSize')::integer,
        v_scope.position_type,
        v_work_unit.checkpoint ->> 'budgetProfileId',
        v_work_unit.checkpoint ->> 'budgetProfileDigest'
      )
      or v_work_unit.checkpoint -> 'scope' ->> 'symbol' is distinct from v_scope.instrument_symbol
      or (v_work_unit.checkpoint -> 'scope' ->> 'startTime')::bigint is distinct from v_scope.request_start_ms
      or (v_work_unit.checkpoint -> 'scope' ->> 'endTime')::bigint is distinct from v_scope.request_end_ms
      or (v_work_unit.checkpoint -> 'scope' ->> 'positionType')::integer is distinct from v_scope.position_type
      or v_work_unit.checkpoint ->> 'status' not in ('ready', 'continue')
      or (v_work_unit.checkpoint ->> 'totalRequestAttempts')::integer
        is distinct from v_work_unit.request_sequence
      or (v_work_unit.checkpoint ->> 'authorityBlocked')::boolean is distinct from true
    then
      raise exception 'CONTROL_CHECKPOINT_INVALID';
    end if;

    v_recomputed_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
      v_work_unit.checkpoint,
      v_integrity_key.key_material
    );
    if not public.equora_constant_time_hex_equal_v1(
      v_recomputed_checkpoint_mac,
      v_work_unit.checkpoint_mac
    ) then
      raise exception 'CONTROL_CHECKPOINT_INVALID';
    end if;
    v_expected_checkpoint_mac := v_work_unit.checkpoint_mac;

    v_unit_request_attempts := (v_work_unit.checkpoint ->> 'unitRequestAttempts')::integer + 1;
    v_total_request_attempts := (v_work_unit.checkpoint ->> 'totalRequestAttempts')::integer + 1;
    v_unit_response_bytes := (v_work_unit.checkpoint ->> 'unitResponseBytes')::bigint + p_response_bytes;
    v_total_response_bytes := (v_work_unit.checkpoint ->> 'totalResponseBytes')::bigint + p_response_bytes;
    v_unit_elapsed_ms := (v_work_unit.checkpoint ->> 'unitElapsedMs')::bigint + p_request_duration_ms;
    v_total_elapsed_ms := (v_work_unit.checkpoint ->> 'totalElapsedMs')::bigint + p_request_duration_ms;
    v_unit_retry_count := (v_work_unit.checkpoint ->> 'unitRetryCount')::integer;
    v_unit_backoff_ms := (v_work_unit.checkpoint ->> 'unitBackoffMs')::bigint;
    if v_total_request_attempts <> p_request_sequence
      or v_unit_request_attempts > 7
      or v_total_request_attempts > 140
      or v_unit_retry_count not between 0 and 2
    then
      raise exception 'CONTROL_CHECKPOINT_INVALID';
    end if;
  exception when others then
    if sqlerrm like '%CONTROL_CHECKPOINT_INVALID%' then raise; end if;
    raise exception 'CONTROL_CHECKPOINT_INVALID';
  end;

  v_retryable := p_failure_code in (
    'rate_limited', 'provider_busy', 'provider_unavailable', 'timeout'
  );
  v_backoff_ms := case v_unit_retry_count
    when 0 then 1000
    when 1 then 5000
    else null
  end;
  v_retry_allowed := v_retryable
    and v_backoff_ms is not null
    and v_unit_retry_count < 2
    and v_unit_request_attempts < 7
    and v_unit_response_bytes < 327680
    and v_unit_elapsed_ms + coalesce(v_backoff_ms, 0) < 60000
    and v_total_response_bytes < 6553600
    and v_total_elapsed_ms + coalesce(v_backoff_ms, 0) < 1200000;
  v_failure_budget_reached := v_retryable and (
    v_unit_request_attempts >= 7
    or v_unit_response_bytes >= 327680
    or v_unit_elapsed_ms >= 60000
    or v_total_response_bytes >= 6553600
    or v_total_elapsed_ms >= 1200000
  );

  if v_unit_response_bytes > 327680 or v_total_response_bytes > 6553600 then
    v_actual_outcome_status := 'terminal_failed';
    v_terminal_reason := 'response_exceeds_remaining_budget';
  elsif v_retry_allowed and v_work_unit.attempt >= v_work_unit.max_attempts then
    v_actual_outcome_status := 'terminal_failed';
    v_terminal_reason := 'claim_attempt_budget_reached';
  elsif v_retry_allowed then
    v_actual_outcome_status := 'retry_pending';
    v_terminal_reason := null;
    v_retry_not_before_ms := floor(extract(epoch from v_now) * 1000)::bigint + v_backoff_ms;
    v_retry_not_before := to_timestamp(v_retry_not_before_ms::numeric / 1000);
    v_unit_retry_count := v_unit_retry_count + 1;
    v_unit_backoff_ms := v_unit_backoff_ms + v_backoff_ms;
    v_unit_elapsed_ms := v_unit_elapsed_ms + v_backoff_ms;
    v_total_elapsed_ms := v_total_elapsed_ms + v_backoff_ms;
  else
    v_actual_outcome_status := 'terminal_failed';
    v_terminal_reason := case
      when p_failure_code = 'maintenance' then 'provider_retry_deferred'
      when v_failure_budget_reached then 'failure_budget_reached'
      when v_retryable then 'retry_budget_reached'
      else 'non_retryable_failure'
    end;
  end if;

  v_next_checkpoint := v_work_unit.checkpoint || jsonb_build_object(
    'status', case when v_actual_outcome_status = 'retry_pending' then 'retry_pending' else 'partial_failed' end,
    'reason', case when v_actual_outcome_status = 'retry_pending' then 'retry_scheduled' else v_terminal_reason end,
    'unitRequestAttempts', v_unit_request_attempts,
    'unitResponseBytes', v_unit_response_bytes,
    'unitElapsedMs', v_unit_elapsed_ms,
    'unitRetryCount', v_unit_retry_count,
    'unitBackoffMs', v_unit_backoff_ms,
    'totalRequestAttempts', v_total_request_attempts,
    'totalResponseBytes', v_total_response_bytes,
    'totalElapsedMs', v_total_elapsed_ms,
    'lastErrorCode', case
      when v_terminal_reason = 'response_exceeds_remaining_budget' then null
      else p_failure_code
    end,
    'suggestedBackoffMs', case when v_actual_outcome_status = 'retry_pending' then v_backoff_ms else null end,
    'retryNotBeforeMs', case when v_actual_outcome_status = 'retry_pending' then v_retry_not_before_ms else null end
  );
  v_next_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
    v_next_checkpoint,
    v_integrity_key.key_material
  );
  v_next_checkpoint := v_next_checkpoint || jsonb_build_object(
    'checkpointMac', v_next_checkpoint_mac
  );

  select exists (
    select 1
    from public.broker_provider_request_results
    where scope_id = v_scope.id
      and user_id = v_scope.user_id
      and broker_account_id = v_scope.broker_account_id
  ) into v_scope_has_valid_result;
  select exists (
    select 1
    from public.broker_provider_request_results
    where run_id = v_run.id
      and user_id = v_run.user_id
      and broker_account_id = v_run.broker_account_id
  ) into v_run_has_valid_result;
  select exists (
    select 1
    from public.broker_capture_work_units
    where run_id = v_run.id
      and user_id = v_run.user_id
      and broker_account_id = v_run.broker_account_id
      and id <> v_work_unit.id
      and status in ('pending', 'leased', 'running', 'retry_pending', 'yielded')
  ) into v_run_has_open_work;

  if v_actual_outcome_status = 'retry_pending' then
    v_run_status := 'running';
  else
    v_actual_outcome_status := case
      when v_scope_has_valid_result then 'partial_failed'
      else 'terminal_failed'
    end;
    v_run_status := case
      when v_run_has_open_work or v_run_has_valid_result then 'partial'
      else 'failed'
    end;
  end if;

  update public.broker_capture_work_units
  set status = case
        when v_actual_outcome_status = 'retry_pending' then 'retry_pending'
        else 'partial_failed'
      end,
      request_sequence = p_request_sequence,
      checkpoint = v_next_checkpoint,
      checkpoint_mac = v_next_checkpoint_mac,
      lease_token_digest = null,
      lease_token_format_version = null,
      lease_expires_at = null,
      lease_acquired_at = null,
      lease_max_expires_at = null,
      lease_renew_count = 0,
      lease_policy_version = null,
      recovery_state = 'none',
      retry_not_before = v_retry_not_before,
      last_error_code = p_failure_code,
      last_error_class = v_failure_class,
      last_error_at = v_now,
      terminal_reason = v_terminal_reason,
      row_version = row_version + 1,
      updated_at = v_now
  where id = v_work_unit.id
    and row_version = p_expected_work_unit_row_version
  returning * into v_work_unit;
  if not found then raise exception 'CONTROL_WORK_UNIT_CAS_MISMATCH'; end if;

  if to_regclass('public.broker_capture_account_leases') is not null then
    execute $account_lease_release$
      update public.broker_capture_account_leases
      set state = 'available', sync_activation_id = null,
          activation_generation = null, work_unit_id = null, run_id = null,
          scope_id = null, lane_state_id = null, policy_generation = null,
          work_unit_row_version = null, lease_epoch = null,
          lease_token_digest = null, lease_acquired_at = null,
          lease_expires_at = null, lease_max_expires_at = null,
          lease_renew_count = null, lease_policy_version = null,
          row_version = row_version + 1, updated_at = v_now
      where broker_account_id = $1
        and sync_kind = 'provider_api_observation'
        and state = 'leased' and work_unit_id = $2
    $account_lease_release$
    using v_work_unit.broker_account_id, v_work_unit.id;
  end if;

  update public.broker_capture_runs
  set status = v_run_status,
      started_at = coalesce(started_at, v_now),
      completed_at = case
        when v_run_status = 'failed' then v_now
        else null
      end,
      failed_request_count = failed_request_count + 1
  where id = v_run.id
    and user_id = v_run.user_id
    and broker_account_id = v_run.broker_account_id
  returning * into v_run;

  if v_actual_outcome_status <> 'retry_pending' then
    update public.broker_sync_scopes
    set scope_completeness = case
          when v_scope_has_valid_result then 'partial'
          else 'failed'
        end,
        stability_status = 'invalidated',
        closed_at = coalesce(closed_at, v_now)
    where id = v_scope.id
      and user_id = v_scope.user_id
      and broker_account_id = v_scope.broker_account_id;
  end if;

  insert into public.broker_capture_attempt_outcomes (
    id,
    user_id,
    broker_account_id,
    sync_activation_id,
    activation_generation,
    run_id,
    scope_id,
    work_unit_id,
    expected_work_unit_row_version,
    work_unit_row_version_after,
    attempt,
    request_sequence,
    lease_token_digest,
    failure_policy_version,
    failure_code,
    failure_class,
    outcome_status,
    retry_not_before,
    http_status,
    response_bytes,
    request_duration_ms,
    expected_checkpoint_mac,
    checkpoint_after,
    checkpoint_mac_after,
    terminal_reason,
    run_status_after,
    observed_at
  ) values (
    p_outcome_id,
    v_work_unit.user_id,
    v_work_unit.broker_account_id,
    v_work_unit.sync_activation_id,
    v_work_unit.activation_generation,
    v_work_unit.run_id,
    v_work_unit.scope_id,
    v_work_unit.id,
    p_expected_work_unit_row_version,
    v_work_unit.row_version,
    v_work_unit.attempt,
    p_request_sequence,
    v_lease_token_digest,
    p_failure_policy_version,
    p_failure_code,
    v_failure_class,
    v_actual_outcome_status,
    v_retry_not_before,
    p_http_status,
    p_response_bytes,
    p_request_duration_ms,
    v_expected_checkpoint_mac,
    v_next_checkpoint,
    v_next_checkpoint_mac,
    v_terminal_reason,
    v_run.status,
    v_now
  );

  -- The immutable outcome insert can wait on a conflicting id/unique key.
  -- Revalidate wall-clock authority after that final blocking point; an error
  -- rolls back Work Unit, Run, Scope and outcome together.
  v_now := clock_timestamp();
  if v_authorizing_lease_expires_at <= v_now then
    raise exception 'CONTROL_LEASE_INVALID';
  end if;
  if v_integrity_key.valid_from > v_now
    or (v_integrity_key.valid_to is not null and v_integrity_key.valid_to <= v_now)
  then
    raise exception 'CONTROL_INTEGRITY_KEY_INACTIVE';
  end if;

  return jsonb_build_object(
    'status', v_actual_outcome_status,
    'authorityBlocked', true,
    'outcomeId', p_outcome_id,
    'workUnitId', v_work_unit.id,
    'workUnitRowVersion', v_work_unit.row_version,
    'attempt', v_work_unit.attempt,
    'requestSequence', p_request_sequence,
    'failureCode', p_failure_code,
    'failureClass', v_failure_class,
    'retryNotBefore', v_retry_not_before,
    'terminalReason', v_terminal_reason,
    'checkpoint', v_next_checkpoint,
    'checkpointMac', v_next_checkpoint_mac,
    'runStatus', v_run.status
  );
exception
  when unique_violation then raise exception 'CONTROL_OUTCOME_CONFLICT';
  when lock_not_available then raise exception 'CONTROL_LOCK_TIMEOUT';
  when query_canceled then raise exception 'CONTROL_STATEMENT_TIMEOUT';
end;
$$;

revoke all on function public.equora_record_broker_capture_failure_v1(
  uuid, bigint, uuid, uuid, integer, text, text, text, text, integer, integer, integer, text
) from public, anon, authenticated, service_role;
do $$
begin
  if exists (
    select 1 from equora_private.schema_migrations
    where migration_id = 'equora_v57.61.0_g1_activation_authority_v1'
  ) then
    if to_regrole('equora_broker_capture_owner') is null then
      raise exception 'CONTROL_MIGRATION_DOWNSTREAM_OWNER_MISSING';
    end if;
    execute 'grant execute on function '
      || 'public.equora_record_broker_capture_failure_v1('
      || 'uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,'
      || 'integer,text) to equora_broker_capture_owner';
  else
    grant execute on function public.equora_record_broker_capture_failure_v1(
      uuid, bigint, uuid, uuid, integer, text, text, text, text, integer,
      integer, integer, text
    ) to service_role;
  end if;
end;
$$;

insert into equora_private.schema_migrations (
  migration_id,
  contract_fingerprint
) values (
  'equora_v57.61.0_g1_capture_control_v1',
  'c133d5e0c987e7f927963db4465ef5ab2f6f4c174cfdc96a3ed1cffb5cd62be5'
) on conflict (migration_id) do nothing;

do $$
declare
  v_activation_authority_applied boolean;
begin
  select exists (
    select 1 from equora_private.schema_migrations
    where migration_id = 'equora_v57.61.0_g1_activation_authority_v1'
  ) into v_activation_authority_applied;

  if not exists (
      select 1
      from equora_private.schema_migrations
      where migration_id = 'equora_v57.61.0_g1_capture_control_v1'
        and contract_fingerprint = 'c133d5e0c987e7f927963db4465ef5ab2f6f4c174cfdc96a3ed1cffb5cd62be5'
    )
    or to_regclass('public.broker_capture_attempt_outcomes') is null
    or not exists (
      select 1 from pg_class
      where oid = 'public.broker_capture_attempt_outcomes'::regclass
        and relrowsecurity = true
    )
    or has_table_privilege(
      'service_role',
      'public.broker_capture_attempt_outcomes',
      'select,insert,update,delete'
    )
    or to_regprocedure(
      'public.equora_mexc_request_checkpoint_valid_v1(jsonb,text,text,bigint,bigint,integer,integer)'
    ) is null
    or has_function_privilege(
      'service_role',
      'public.equora_mexc_request_checkpoint_valid_v1(jsonb,text,text,bigint,bigint,integer,integer)',
      'execute'
    )
    or not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.broker_providers'::regclass
        and conname = 'broker_providers_mexc_get_only_capabilities_check'
        and convalidated = true
    )
    or to_regclass('public.idx_broker_capture_work_units_claimable') is null
    or to_regclass('public.idx_broker_capture_attempt_outcomes_work_unit_fkey') is null
    or to_regclass('public.idx_broker_capture_attempt_outcomes_activation_fkey') is null
    or (
      select encode(public.equora_pgcrypto_digest_v1(
        convert_to(
          string_agg(
            constraint_row.conname || ':'
              || pg_get_constraintdef(constraint_row.oid, true),
            E'\n' order by constraint_row.conname
          ),
          'UTF8'
        ),
        'sha256'
      ), 'hex')
      from pg_constraint constraint_row
      where constraint_row.conrelid =
        any (array[
          'public.broker_capture_work_units'::regclass,
          'public.broker_capture_attempt_outcomes'::regclass
        ])
        and constraint_row.conname in (
          'broker_capture_work_units_claim_state_check',
          'broker_capture_work_units_error_state_check',
          'broker_capture_attempt_outcomes_terminal_reason_check'
        )
    ) is distinct from
      '346216e2ac304bfc69495dacb75ea7efd01abb4cf3859fd32dd923d073dcd3ba'
  then
    raise exception 'CONTROL_MIGRATION_CRITICAL_STRUCTURE_DRIFT';
  end if;

  if v_activation_authority_applied then
    if to_regrole('equora_broker_capture_owner') is null
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
      or not has_function_privilege(
        'equora_broker_capture_owner',
        'public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)',
        'execute'
      )
      or not has_function_privilege(
        'equora_broker_capture_owner',
        'public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)',
        'execute'
      )
    then
      raise exception 'CONTROL_MIGRATION_DOWNSTREAM_V1_ACL_DRIFT';
    end if;
  elsif not has_function_privilege(
      'service_role',
      'public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)',
      'execute'
    )
  then
    raise exception 'CONTROL_MIGRATION_V1_ACL_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname in (
        'equora_claim_broker_capture_work_unit_v1',
        'equora_record_broker_capture_failure_v1'
      )
      and procedure_row.proconfig @> array[
        'lock_timeout=2s',
        'statement_timeout=10s'
      ]::text[]
    group by namespace_row.nspname
    having count(*) = 2
  ) then
    raise exception 'CONTROL_MIGRATION_TIMEOUT_CONFIG_DRIFT';
  end if;
end;
$$;

commit;

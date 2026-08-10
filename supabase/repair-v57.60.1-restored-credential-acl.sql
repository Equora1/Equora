\set ON_ERROR_STOP on
\pset pager off

-- Narrow, opt-in repair for the exact verified restore shape whose only
-- security drift is ALL table privileges on broker_credentials for anon and
-- authenticated. This script is deliberately separate from the v57.61.0
-- deployment and must pass both exact pre- and post-contract fingerprints.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v_executor record;
begin
  select rolsuper, rolcreaterole, rolbypassrls
  into v_executor
  from pg_roles
  where rolname = current_user;

  if current_user <> 'postgres'
    or v_executor is null
    or (not v_executor.rolsuper and (
      not v_executor.rolcreaterole or not v_executor.rolbypassrls
    ))
  then raise exception 'BASELINE_REPAIR_EXECUTOR_INVALID'; end if;

  if current_setting('server_version_num')::integer < 160000
  then raise exception 'BASELINE_REPAIR_POSTGRES_VERSION_UNSUPPORTED'; end if;

  if to_regclass('equora_private.schema_migrations') is not null
  then raise exception 'BASELINE_REPAIR_V5761_MARKER_PRESENT'; end if;

  if to_regclass('public.broker_credentials') is null
  then raise exception 'BASELINE_REPAIR_TARGET_MISSING'; end if;
end;
$$;

lock table public.broker_credentials in access exclusive mode;

\ir assert-v57.60.1-restored-credential-acl-repair-source.sql

select count(*) as equora_repair_trade_count
from public.trades
\gset
select count(*) as equora_repair_credential_count
from public.broker_credentials
\gset

revoke all privileges on table public.broker_credentials
  from anon, authenticated;

\ir verify-v57.60.1-baseline.sql

select
  (select count(*) from public.trades) = :equora_repair_trade_count::bigint
  and (select count(*) from public.broker_credentials) =
    :equora_repair_credential_count::bigint
  and not exists (
    select 1
    from pg_class relation_row
    cross join lateral aclexplode(coalesce(
      relation_row.relacl, acldefault('r', relation_row.relowner)
    )) exploded
    join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where relation_row.oid = 'public.broker_credentials'::regclass
      and grantee_row.rolname in ('anon', 'authenticated')
  ) as repair_postcondition_valid
\gset

\if :repair_postcondition_valid
\else
  do $fail$ begin
    raise exception 'BASELINE_REPAIR_POSTCONDITION_INVALID';
  end $fail$;
\endif

commit;
\echo 'BASELINE REPAIR PASS: exact restored v57.60.1 credential ACL drift closed; row counts unchanged.'

\set ON_ERROR_STOP on

-- Load equora-local-supabase-stubs.sql and ../../supabase/schema.sql as
-- postgres in a fresh disposable database before running this file.
-- Mirror only the versioned upgrade ACL for the table under test.
revoke insert, update, delete on table public.shared_trade_submissions from anon, authenticated;
grant select on table public.shared_trade_submissions to authenticated;

\ir ../../supabase/schema-patch-v57.62.0-featured-share-read.sql

begin;

insert into auth.users (id) values
  ('f1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000002'),
  ('f1000000-0000-4000-8000-000000000003');

insert into public.admin_users (user_id) values ('f1000000-0000-4000-8000-000000000003');

insert into public.trades (id, user_id, market, setup)
select
  ('f2000000-0000-4000-8000-00000000000' || n)::uuid,
  'f1000000-0000-4000-8000-000000000001',
  'ES',
  'Synthetic breakout'
from generate_series(1, 5) as ids(n);

insert into public.shared_trade_submissions (
  id, user_id, trade_id, status, vault_opt_in, visibility, submitted_by_name,
  shared_market, shared_setup, shared_result, shared_net_pnl, shared_currency,
  shared_r_multiple, featured_at, user_note, admin_note, shared_notes
)
select
  ('f3000000-0000-4000-8000-00000000000' || n)::uuid,
  'f1000000-0000-4000-8000-000000000001',
  ('f2000000-0000-4000-8000-00000000000' || n)::uuid,
  status, opt_in, visibility, display_name,
  'ES', 'Synthetic breakout', 'win', 25.125, 'USD', 1.25,
  timestamptz '2026-01-01 00:00:00+00' + n * interval '1 day',
  'Owner context', 'Internal context', 'Journal context'
from (values
  (1, 'featured', true,  'anonymous', 'Private name'),
  (2, 'featured', true,  'named',     'Display name'),
  (3, 'featured', false, 'named',     'Opted out'),
  (4, 'pending',  true,  'named',     'Pending'),
  (5, 'revoked',  true,  'named',     'Revoked')
) as fixture(n, status, opt_in, visibility, display_name);

do $$
begin
  if has_function_privilege('anon', 'public.equora_featured_shared_trades_v1()', 'EXECUTE')
    or has_function_privilege('service_role', 'public.equora_featured_shared_trades_v1()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.equora_featured_shared_trades_v1()', 'EXECUTE')
  then
    raise exception 'Unexpected card function grants';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if public.equora_featured_shared_trades_v1() is distinct from '[]'::jsonb then
    raise exception 'Caller without a user identity received cards';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000002', true);
do $$
declare
  cards jsonb := public.equora_featured_shared_trades_v1();
  expected_anonymous jsonb := '{
    "id":"f3000000-0000-4000-8000-000000000001",
    "status":"featured",
    "learning_category":null,
    "visibility":"anonymous",
    "submitted_by_name":null,
    "shared_market":"ES",
    "shared_setup":"Synthetic breakout",
    "shared_result":"win",
    "shared_net_pnl":25.125,
    "shared_currency":"USD",
    "shared_r_multiple":1.25,
    "shared_screenshot_url":null,
    "vault_blurb":null,
    "coach_feedback":null,
    "review_labels":[]
  }'::jsonb;
  expected_named jsonb := expected_anonymous || '{
    "id":"f3000000-0000-4000-8000-000000000002",
    "visibility":"named",
    "submitted_by_name":"Display name"
  }'::jsonb;
begin
  if exists (select 1 from public.shared_trade_submissions) then
    raise exception 'A different authenticated user can read a base row';
  end if;
  if cards is distinct from jsonb_build_array(expected_named, expected_anonymous) then
    raise exception 'Card projection, order, consent filter or name handling differs';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
do $$
begin
  if (select count(*) from public.shared_trade_submissions where user_note = 'Owner context') <> 5 then
    raise exception 'Owner lost access to their submissions';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000003', true);
do $$
begin
  if (select count(*) from public.shared_trade_submissions where admin_note = 'Internal context') <> 5 then
    raise exception 'Admin lost moderation read access';
  end if;
end;
$$;
reset role;

rollback;

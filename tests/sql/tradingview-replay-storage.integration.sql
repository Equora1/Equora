-- Requires a disposable PostgreSQL database with synthetic Supabase roles.
begin;
set local timezone = 'America/New_York';

do $$
begin
  if current_database() <> 'equora_replay_test' then
    raise exception 'Replay storage tests require the synthetic database';
  end if;
end
$$;

insert into auth.users (id) values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
insert into public.trades (id) values (1);

create function pg_temp.replay_batch(p_session uuid, p_submission text default repeat('b', 64))
returns jsonb language sql as $$
  select jsonb_build_object(
    'sessionId', p_session, 'mode', 'simulation', 'source', 'tradingview_replay',
    'market', 'OANDA:XAGUSD', 'priceCurrency', 'EUR', 'pnlCurrency', 'USD',
    'exportOffset', '+01:00', 'sourceDigest', repeat('a', 64), 'submissionDigest', p_submission,
    'trades', '[{
      "tradeNumber":1,"direction":"short","openedAtExport":"2026-11-11T14:15:35",
      "closedAtExport":"2026-11-11T15:35:45","openedAt":"2026-11-11T13:15:35.000Z",
      "closedAt":"2026-11-11T14:35:45.000Z","entry":52.79992,"exit":52.22104,
      "quantity":2000,"netPnL":1157.76,"commission":-0.25,"stopLoss":52.857808,"takeProfit":52.22104
    }]'::jsonb
  );
$$;

do $$
declare
  owner_a constant uuid := '00000000-0000-4000-8000-000000000001';
  owner_b constant uuid := '00000000-0000-4000-8000-000000000002';
  session_a uuid;
  session_a2 uuid;
  session_b uuid;
  session_failed uuid;
  session_offset uuid;
  batch jsonb;
  position jsonb;
  result jsonb;
begin
  session_a := public.journal_create_replay_session_v1(owner_a, '  Silber Replay  ');
  session_a2 := public.journal_create_replay_session_v1(owner_a, 'Zweite Wiedergabe');
  session_b := public.journal_create_replay_session_v1(owner_b, 'Fremde Sitzung');
  session_failed := public.journal_create_replay_session_v1(owner_a, 'Fehlerprobe');
  session_offset := public.journal_create_replay_session_v1(owner_a, 'Negativer Offset');
  if (select label from public.journal_replay_sessions where id = session_a) is distinct from 'Silber Replay' then
    raise exception 'Replay session label was not trimmed';
  end if;
  raise notice 'PASS session creation';

  batch := pg_temp.replay_batch(session_a);
  result := public.journal_save_replay_import_v1(owner_a, batch);
  if (result ->> 'status') is distinct from 'imported' or (result ->> 'sessionId')::uuid is distinct from session_a then
    raise exception 'First Replay import did not succeed: %', result;
  end if;
  if not exists (
    select 1 from public.journal_replay_trades trade join public.journal_replay_imports batch using (session_id, user_id)
    where trade.session_id = session_a and batch.mode = 'simulation'
      and batch.price_currency = 'EUR' and batch.pnl_currency = 'USD'
      and trade.entry = 52.79992 and trade.exit = 52.22104
      and trade.quantity = 2000 and trade.net_pnl = 1157.76 and trade.commission = -0.25
      and trade.stop_loss = 52.857808 and trade.take_profit = 52.22104
      and trade.opened_at = '2026-11-11T13:15:35Z'::timestamptz
      and trade.opened_at_export = '2026-11-11T14:15:35'::timestamp
  ) then
    raise exception 'Unexpected Replay values after import';
  end if;
  raise notice 'PASS first import, amounts and UTC times';

  result := public.journal_save_replay_import_v1(owner_a, batch);
  if (result ->> 'status') is distinct from 'already_imported'
      or (select count(*) from public.journal_replay_trades where session_id = session_a) <> 1 then
    raise exception 'Replay repeat was not idempotent: %', result;
  end if;
  raise notice 'PASS identical retry';

  result := public.journal_save_replay_import_v1(owner_a, pg_temp.replay_batch(session_a, repeat('c', 64)));
  if (result ->> 'status') is distinct from 'conflict'
      or (select submission_digest from public.journal_replay_imports where session_id = session_a) <> repeat('b', 64) then
    raise exception 'Conflicting Replay request overwrote the import: %', result;
  end if;
  raise notice 'PASS changed request preserves stored import';

  result := public.journal_save_replay_import_v1(owner_a, pg_temp.replay_batch(session_a2));
  if (result ->> 'status') is distinct from 'imported' then
    raise exception 'Separate Replay session could not import the same data';
  end if;
  raise notice 'PASS same content in a second session';

  begin
    perform public.journal_save_replay_import_v1(owner_a, pg_temp.replay_batch(session_b));
    raise exception 'Cross-owner Replay unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  result := public.journal_save_replay_import_v1(owner_b, pg_temp.replay_batch(session_b));
  if (result ->> 'status') is distinct from 'imported' then
    raise exception 'Owner could not import into their own session';
  end if;
  raise notice 'PASS ownership boundary';

  batch := pg_temp.replay_batch(session_failed);
  position := batch #> '{trades,0}';
  begin
    perform public.journal_save_replay_import_v1(owner_a, jsonb_set(batch, '{trades}', jsonb_build_array(
      position, position || '{"tradeNumber":2,"closedAt":"2026-11-11T15:35:45Z"}'::jsonb
    )));
    raise exception 'Forged UTC timestamp was accepted';
  exception when invalid_parameter_value then null;
  end;
  if exists (select 1 from public.journal_replay_imports where session_id = session_failed)
      or exists (select 1 from public.journal_replay_trades where session_id = session_failed) then
    raise exception 'Partial Replay write leaked from the rejected batch';
  end if;
  raise notice 'PASS wrong timestamp rolls back the whole import';

  begin
    perform public.journal_save_replay_import_v1(owner_a, jsonb_set(batch, '{trades}', jsonb_build_array(position, position)));
    raise exception 'Duplicate trade number was accepted';
  exception when unique_violation then null;
  end;
  if exists (select 1 from public.journal_replay_imports where session_id = session_failed) then
    raise exception 'Duplicate trade numbers left an import row';
  end if;
  raise notice 'PASS duplicate trade numbers roll back the import';

  begin
    perform public.journal_save_replay_import_v1(owner_a, jsonb_set(batch, '{trades,0,stopLoss}', '51'));
    raise exception 'Wrong-side stop was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.journal_save_replay_import_v1(owner_a, jsonb_set(batch, '{trades,0,netPnL}', '"NaN"'));
    raise exception 'Non-finite net P&L was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.journal_save_replay_import_v1(owner_a, jsonb_set(batch, '{exportOffset}', '"-00:00"'));
    raise exception 'Unknown offset was accepted';
  exception when invalid_parameter_value then null;
  end;
  if exists (select 1 from public.journal_replay_imports where session_id = session_failed) then
    raise exception 'Rejected fields left a partial import';
  end if;
  raise notice 'PASS wrong-side stop, NaN and unknown offset rejected';

  batch := pg_temp.replay_batch(session_offset);
  batch := batch || jsonb_build_object(
    'exportOffset', '-05:30', 'trades', jsonb_build_array((batch #> '{trades,0}') || '{
      "openedAt":"2026-11-11T19:45:35Z","closedAt":"2026-11-11T21:05:45Z",
      "commission":null,"stopLoss":null,"takeProfit":null
    }'::jsonb)
  );
  result := public.journal_save_replay_import_v1(owner_a, batch);
  if (result ->> 'status') is distinct from 'imported' or not exists (
    select 1 from public.journal_replay_trades where session_id = session_offset
      and stop_loss is null and take_profit is null and commission is null
      and closed_at = '2026-11-11T21:05:45Z'::timestamptz
  ) then
    raise exception 'Negative fractional offset or nullable fields failed';
  end if;
  raise notice 'PASS negative fractional offset and optional values';

  if (select count(*) from public.trades) <> 1 then
    raise exception 'Replay writes changed live trades';
  end if;
  raise notice 'PASS live trades remain separate';
end
$$;

do $$
begin
  if has_function_privilege('anon', 'public.journal_create_replay_session_v1(uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.journal_save_replay_import_v1(uuid,jsonb)', 'execute')
    or not has_function_privilege('service_role', 'public.journal_save_replay_import_v1(uuid,jsonb)', 'execute')
    or has_table_privilege('anon', 'public.journal_replay_trades', 'select')
    or has_table_privilege('authenticated', 'public.journal_replay_trades', 'insert')
    or has_table_privilege('authenticated', 'public.journal_replay_imports', 'update')
    or has_table_privilege('service_role', 'public.journal_replay_imports', 'insert') then
    raise exception 'Replay grants are wider than expected or the server RPC is unavailable';
  end if;
  raise notice 'PASS server-only write grants';
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$
begin
  if (select count(*) from public.journal_replay_sessions) <> 1
    or (select count(*) from public.journal_replay_imports) <> 1
    or (select count(*) from public.journal_replay_trades) <> 1
    or not exists (select 1 from public.journal_replay_sessions where label = 'Fremde Sitzung') then
    raise exception 'Replay RLS did not scope reads to the current owner';
  end if;
  raise notice 'PASS authenticated owner-only reads';
end
$$;

rollback;

begin;

create table public.journal_replay_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.journal_replay_imports (
  session_id uuid primary key,
  user_id uuid not null,
  source text not null check (source = 'tradingview_replay'),
  mode text not null check (mode = 'simulation'),
  market text not null check (
    char_length(market) <= 255 and market ~ '^[A-Z][A-Z0-9_]*:[A-Z0-9][A-Z0-9.!-]*$'
  ),
  price_currency text not null check (price_currency ~ '^[A-Z]{3}$'),
  pnl_currency text not null check (pnl_currency in ('EUR', 'USD', 'GBP', 'USDT', 'USDC')),
  export_offset text not null check (
    export_offset ~ '^([+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$' and export_offset <> '-00:00'
  ),
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  submission_digest text not null check (submission_digest ~ '^[a-f0-9]{64}$'),
  imported_at timestamptz not null default now(),
  unique (user_id, session_id),
  foreign key (user_id, session_id) references public.journal_replay_sessions (user_id, id) on delete cascade
);

create table public.journal_replay_trades (
  session_id uuid not null,
  user_id uuid not null,
  trade_number bigint not null check (trade_number between 1 and 9007199254740991),
  direction text not null check (direction in ('long', 'short')),
  opened_at_export timestamp not null check (isfinite(opened_at_export)),
  closed_at_export timestamp not null check (isfinite(closed_at_export) and closed_at_export >= opened_at_export),
  opened_at timestamptz not null check (isfinite(opened_at)),
  closed_at timestamptz not null check (isfinite(closed_at) and closed_at >= opened_at),
  entry numeric not null check (abs(entry) < 'Infinity'::numeric),
  exit numeric not null check (abs(exit) < 'Infinity'::numeric),
  quantity numeric not null check (quantity > 0 and quantity < 'Infinity'::numeric),
  net_pnl numeric not null check (abs(net_pnl) < 'Infinity'::numeric),
  commission numeric check (abs(commission) < 'Infinity'::numeric),
  stop_loss numeric check (
    abs(stop_loss) < 'Infinity'::numeric
    and ((direction = 'long' and stop_loss < entry) or (direction = 'short' and stop_loss > entry))
  ),
  take_profit numeric check (
    abs(take_profit) < 'Infinity'::numeric
    and ((direction = 'long' and take_profit > entry) or (direction = 'short' and take_profit < entry))
  ),
  primary key (session_id, trade_number),
  foreign key (user_id, session_id) references public.journal_replay_imports (user_id, session_id) on delete cascade
);

create index journal_replay_sessions_owner_created_idx on public.journal_replay_sessions (user_id, created_at desc, id);
create index journal_replay_trades_owner_time_idx on public.journal_replay_trades (user_id, opened_at desc);

alter table public.journal_replay_sessions enable row level security;
alter table public.journal_replay_imports enable row level security;
alter table public.journal_replay_trades enable row level security;

revoke all on public.journal_replay_sessions, public.journal_replay_imports, public.journal_replay_trades
  from public, anon, authenticated, service_role;
grant select on public.journal_replay_sessions, public.journal_replay_imports, public.journal_replay_trades
  to authenticated;

create policy journal_replay_sessions_owner_read on public.journal_replay_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy journal_replay_imports_owner_read on public.journal_replay_imports
  for select to authenticated using ((select auth.uid()) = user_id);
create policy journal_replay_trades_owner_read on public.journal_replay_trades
  for select to authenticated using ((select auth.uid()) = user_id);

create function public.journal_create_replay_session_v1(p_user_id uuid, p_label text)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.journal_replay_sessions (user_id, label)
  values (p_user_id, btrim(p_label))
  returning id;
$$;

-- The application server supplies the verified user ID and the prepared batch.
-- The unique session key serializes competing requests for the same session.
create function public.journal_save_replay_import_v1(p_user_id uuid, p_batch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session uuid;
  v_saved_session uuid;
  v_existing public.journal_replay_imports%rowtype;
  v_trades jsonb;
  v_export_offset text;
  v_offset interval;
  v_trade_count integer;
  v_saved_count integer;
begin
  if jsonb_typeof(p_batch) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid Replay batch';
  end if;
  v_session := (p_batch ->> 'sessionId')::uuid;
  if not exists (
    select 1 from public.journal_replay_sessions where id = v_session and user_id = p_user_id
  ) then
    raise exception using errcode = '42501', message = 'Replay session unavailable for this owner';
  end if;

  v_export_offset := p_batch ->> 'exportOffset';
  v_trades := p_batch -> 'trades';
  if jsonb_typeof(v_trades) is distinct from 'array'
      or v_export_offset is null
      or v_export_offset !~ '^([+-](0[0-9]|1[0-3]):[0-5][0-9]|[+-]14:00)$'
      or v_export_offset = '-00:00' then
    raise exception using errcode = '22023', message = 'Invalid Replay trades or UTC offset';
  end if;
  v_trade_count := jsonb_array_length(v_trades);
  if v_trade_count not between 1 and 2500 then
    raise exception using errcode = '22023', message = 'Invalid Replay trade count';
  end if;
  v_offset := make_interval(mins =>
    (case when left(v_export_offset, 1) = '-' then -1 else 1 end)
    * (substring(v_export_offset, 2, 2)::integer * 60 + right(v_export_offset, 2)::integer)
  );

  insert into public.journal_replay_imports (
    session_id, user_id, source, mode, market, price_currency, pnl_currency,
    export_offset, source_digest, submission_digest
  ) values (
    v_session, p_user_id, p_batch ->> 'source', p_batch ->> 'mode', p_batch ->> 'market',
    p_batch ->> 'priceCurrency', p_batch ->> 'pnlCurrency', v_export_offset,
    p_batch ->> 'sourceDigest', p_batch ->> 'submissionDigest'
  )
  on conflict (session_id) do nothing
  returning session_id into v_saved_session;

  if v_saved_session is null then
    select * into strict v_existing
    from public.journal_replay_imports
    where session_id = v_session and user_id = p_user_id;
    if v_existing.source_digest = p_batch ->> 'sourceDigest'
        and v_existing.submission_digest = p_batch ->> 'submissionDigest' then
      return jsonb_build_object('status', 'already_imported', 'sessionId', v_session);
    end if;
    return jsonb_build_object('status', 'conflict', 'sessionId', v_session);
  end if;

  insert into public.journal_replay_trades (
    session_id, user_id, trade_number, direction, opened_at_export, closed_at_export, opened_at, closed_at,
    entry, exit, quantity, net_pnl, commission, stop_loss, take_profit
  )
  select v_session, p_user_id, trade."tradeNumber", trade.direction, trade."openedAtExport", trade."closedAtExport",
    trade."openedAt", trade."closedAt", trade.entry, trade.exit, trade.quantity, trade."netPnL",
    trade.commission, trade."stopLoss", trade."takeProfit"
  from jsonb_to_recordset(v_trades) as trade(
    "tradeNumber" bigint, direction text, "openedAtExport" timestamp, "closedAtExport" timestamp,
    "openedAt" timestamptz, "closedAt" timestamptz, entry numeric, exit numeric,
    quantity numeric, "netPnL" numeric, commission numeric, "stopLoss" numeric, "takeProfit" numeric
  )
  where ((trade."openedAtExport" at time zone 'UTC') - v_offset) = trade."openedAt"
    and ((trade."closedAtExport" at time zone 'UTC') - v_offset) = trade."closedAt";
  get diagnostics v_saved_count = row_count;
  if v_saved_count <> v_trade_count then
    raise exception using errcode = '22023', message = 'Replay UTC timestamps do not match the export offset';
  end if;

  return jsonb_build_object('status', 'imported', 'sessionId', v_session);
end;
$$;

revoke execute on function public.journal_create_replay_session_v1(uuid, text) from public, anon, authenticated;
revoke execute on function public.journal_save_replay_import_v1(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.journal_create_replay_session_v1(uuid, text) to service_role;
grant execute on function public.journal_save_replay_import_v1(uuid, jsonb) to service_role;

commit;

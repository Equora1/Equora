begin;

create table public.trading_check_ins (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trade_date date not null,
  phase text not null,
  recovery smallint check (recovery between 1 and 5),
  focus smallint check (focus between 1 and 5),
  previous_emotions smallint check (previous_emotions between 1 and 5),
  trading_pressure smallint check (trading_pressure between 1 and 5),
  confidence smallint check (confidence between 1 and 5),
  plan_adherence smallint check (plan_adherence between 1 and 5),
  entry_signal smallint check (entry_signal between 1 and 5),
  no_trades boolean not null default false,
  primary key (user_id, trade_date, phase),
  constraint trading_check_ins_phase_answers check (
    (
      phase = 'before'
      and not no_trades
      and num_nonnulls(confidence, plan_adherence, entry_signal) = 0
      and num_nonnulls(recovery, focus, previous_emotions, trading_pressure) > 0
    ) or (
      phase = 'after'
      and num_nonnulls(recovery, focus, previous_emotions, trading_pressure) = 0
      and (
        (no_trades and num_nonnulls(confidence, plan_adherence, entry_signal) = 0)
        or (
          not no_trades
          and num_nonnulls(confidence, plan_adherence) > 0
          and (entry_signal is null or (plan_adherence is not null and plan_adherence < 5))
        )
      )
    )
  )
);

alter table public.trading_check_ins enable row level security;

revoke all on table public.trading_check_ins from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.trading_check_ins to authenticated;

create policy trading_check_ins_own_rows
  on public.trading_check_ins
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;

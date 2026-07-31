-- Equora v57.56: page-specific query indexes
-- Safe to run repeatedly.

create index if not exists idx_trades_user_captured_at
  on public.trades (user_id, captured_at desc);

create index if not exists idx_daily_notes_user_trade_date
  on public.daily_notes (user_id, trade_date desc);

create index if not exists idx_trades_user_cost_profile
  on public.trades (user_id, user_cost_profile_id)
  where user_cost_profile_id is not null;

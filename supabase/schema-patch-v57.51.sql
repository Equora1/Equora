-- Equora v57.51 Performance-Indizes
-- Ziel: häufige user-spezifische Listenabfragen stabil schnell halten.
-- Der Patch ist idempotent und kann gefahrlos auf bestehenden Projekten laufen.

create index if not exists idx_trades_user_created_at
  on public.trades (user_id, created_at desc);

create index if not exists idx_trade_tags_trade_id_created_at
  on public.trade_tags (trade_id, created_at asc);

create index if not exists idx_setup_trade_links_user_created_at
  on public.setup_trade_links (user_id, created_at asc);

create index if not exists idx_setups_user_sort_title
  on public.setups (user_id, sort_order asc, title asc);

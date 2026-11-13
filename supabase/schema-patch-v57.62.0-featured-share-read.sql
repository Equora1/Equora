-- Local candidate. Apply only through the approved release process.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create function public.equora_featured_shared_trades_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
set row_security = off
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'status', s.status,
        'learning_category', s.learning_category,
        'visibility', s.visibility,
        'submitted_by_name', case when s.visibility = 'named' then s.submitted_by_name end,
        'shared_market', s.shared_market,
        'shared_setup', s.shared_setup,
        'shared_result', s.shared_result,
        'shared_net_pnl', s.shared_net_pnl,
        'shared_currency', s.shared_currency,
        'shared_r_multiple', s.shared_r_multiple,
        'shared_screenshot_url', s.shared_screenshot_url,
        'vault_blurb', s.vault_blurb,
        'coach_feedback', s.coach_feedback,
        'review_labels', s.review_labels
      )
      order by s.featured_at desc, s.reviewed_at desc, s.id
    ),
    '[]'::jsonb
  )
  from (
    select
      id, status, learning_category, visibility, submitted_by_name,
      shared_market, shared_setup, shared_result, shared_net_pnl, shared_currency,
      shared_r_multiple, shared_screenshot_url, vault_blurb, coach_feedback, review_labels,
      featured_at, reviewed_at
    from public.shared_trade_submissions
    where auth.uid() is not null
      and status = 'featured'
      and vault_opt_in is true
    order by featured_at desc, reviewed_at desc, id
    limit 1000
  ) s;
$$;

revoke all on function public.equora_featured_shared_trades_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.equora_featured_shared_trades_v1() to authenticated;

drop policy "authenticated users can read featured vault submissions"
  on public.shared_trade_submissions;

do $$
begin
  if not (select relrowsecurity from pg_catalog.pg_class
          where oid = 'public.shared_trade_submissions'::regclass) then
    raise exception 'SHARED_TRADE_ROW_SECURITY_DISABLED';
  end if;
  -- This is also the new function owner. Abort if the fixed read cannot
  -- see all eligible cards while the base table remains protected for callers.
  if pg_catalog.row_security_active('public.shared_trade_submissions'::regclass) then
    raise exception 'SHARED_TRADE_CARD_OWNER_SUBJECT_TO_ROW_SECURITY';
  end if;
  if (select array_agg(policyname::text order by policyname::text collate "C")
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'shared_trade_submissions'
        and cmd in ('SELECT', 'ALL'))
     is distinct from array['admins can read shared trade submissions', 'users can read own shared trade submissions'] then
    raise exception 'UNEXPECTED_SHARED_TRADE_READ_POLICIES';
  end if;
end;
$$;

commit;

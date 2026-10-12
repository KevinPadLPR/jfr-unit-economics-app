-- 2026-10-12: two views for the Dashboard's new Financial tab (Client Files/Tab2-Financial.jpg).
-- That tab needs Revenue + Cattle Cost + Direct + Indirect per lot, by month AND by week, to
-- compute Net Income = Revenue - Cattle Cost - Direct - Indirect. Today:
--   - ue_gl_lot_report_line_summary gives life-to-date totals per lot (no time axis at all).
--   - ue_gl_lot_week_cost gives Direct/Indirect per lot per week, but no Revenue or Cattle, and
--     there is no per-lot MONTHLY view at all (only the ranch-wide ue_gl_ranch_month_cost).
-- This file adds the missing monthly view and widens the existing weekly view -- same source
-- table (ue_gl_transactions), same report_section values, same aggregation style as every other
-- ue_gl_* view (see "sql - dashboard tables and views 2026-10-06.sql", which this follows).
--
-- NOT self-applied: the dashboard (public/client-app/dashboard/data/financial.js) is written to
-- treat a missing view as "data not available yet" (this app's existing pattern -- see
-- dashboard.css/router.js comments), not an error, so it ships now and starts working the moment
-- someone with write access to the client's Supabase project pastes this into the SQL Editor and
-- runs it once. Paste into the client project's SQL Editor and run once.
--
-- Same posture as every prior ue_ migration: touches no existing client table,
-- security_invoker = true on every view (client's own docs/database.md rule 3 -- "No exceptions"),
-- nothing granted to anon.
begin;

-- =====================================================================
-- 1. ue_gl_lot_month_cost -- one row per (lot, month_end): Revenue, Cattle, Direct, Indirect $.
--    New view -- no per-lot monthly cost view existed before this.
-- =====================================================================
create or replace view public.ue_gl_lot_month_cost
with (security_invoker = true) as
select lot, month_end,
       round(sum(case when report_section = 'Revenue' then report_amount else 0 end), 2) as revenue,
       round(sum(case when report_section = 'Cattle'   then report_amount else 0 end), 2) as cattle_cost,
       round(sum(case when report_section = 'Direct'   then report_amount else 0 end), 2) as direct,
       round(sum(case when report_section = 'Indirect' then report_amount else 0 end), 2) as indirect
  from public.ue_gl_transactions
 where lot is not null and month_end is not null
 group by lot, month_end;

comment on view public.ue_gl_lot_month_cost is
  'Revenue + Cattle/Direct/Indirect $ by lot and month. Net Income = revenue - cattle_cost - direct - indirect. Dashboard Financial tab''s Monthly view.';

-- =====================================================================
-- 2. ue_gl_lot_week_cost -- widen the existing view with the same two columns, so the Financial
--    tab's Weekly view can compute the identical Net Income formula at weekly grain. Still
--    dollars only, never $/lb (Indirect posts month-end only, so a weekly $/lb would show a false
--    monthly spike -- same reason this view has always been dollars-only).
-- =====================================================================
-- Column order matters here: CREATE OR REPLACE VIEW can only append new columns at the end of the
-- existing list, not insert them in the middle (Postgres error 42P16 otherwise) -- so direct/
-- indirect stay in their original positions (2026-10-06 migration) and revenue/cattle_cost are
-- added after them, not before.
create or replace view public.ue_gl_lot_week_cost
with (security_invoker = true) as
select lot, week_end,
       round(sum(case when report_section = 'Direct'   then report_amount else 0 end), 2) as direct,
       round(sum(case when report_section = 'Indirect' then report_amount else 0 end), 2) as indirect,
       round(sum(case when report_section = 'Revenue' then report_amount else 0 end), 2) as revenue,
       round(sum(case when report_section = 'Cattle'   then report_amount else 0 end), 2) as cattle_cost
  from public.ue_gl_transactions
 where lot is not null and week_end is not null
 group by lot, week_end;

comment on view public.ue_gl_lot_week_cost is
  'Revenue + Cattle/Direct/Indirect $ by lot and week. Dashboard takes the last 13 weeks client-side. Dollars only, never $/lb.';

revoke all on public.ue_gl_lot_month_cost from public, anon;
grant select on public.ue_gl_lot_month_cost to authenticated;
grant select on public.ue_gl_lot_month_cost to service_role;

-- ue_gl_lot_week_cost's own revoke/grant already ran in the 2026-10-06 migration and survives
-- `create or replace view` (it doesn't reset privileges), but re-asserting here is cheap
-- insurance against this file ever being run standalone against a project that lacks it.
revoke all on public.ue_gl_lot_week_cost from public, anon;
grant select on public.ue_gl_lot_week_cost to authenticated;
grant select on public.ue_gl_lot_week_cost to service_role;

-- =====================================================================
-- VERIFY
-- =====================================================================
do $verify$
declare
  t text;
  v_txt text;
begin
  foreach t in array array['ue_gl_lot_month_cost','ue_gl_lot_week_cost'] loop
    if has_table_privilege('anon', 'public.'||t, 'SELECT') then
      raise exception 'anon can read view public.%.', t;
    end if;
    select coalesce(reloptions::text,'') into v_txt from pg_class where oid=('public.'||t)::regclass;
    if v_txt not like '%security_invoker=true%' then
      raise exception '% is not security_invoker: reloptions = %', t, v_txt;
    end if;
  end loop;

  raise notice 'lot financial views verified: 2 views (1 new, 1 widened), both security_invoker, nothing granted to anon.';
end
$verify$;

commit;

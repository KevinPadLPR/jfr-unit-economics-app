-- 2026-10-12: speed up the ranch-wide ("All lots") aggregations the Financial tab's two views
-- (ue_gl_lot_month_cost, ue_gl_lot_week_cost -- 2026-10-12_lot_financial_views.sql) run when no
-- lot filter narrows the query. Measured against the real project after those views went live:
-- "All lots" + Monthly took ~4.5s, "All lots" + Weekly took ~9s (ue_gl_lot_week_cost alone is
-- 1,272 rows ranch-wide across 2023-2026). ue_gl_transactions already has indexes on (lot) and
-- (date) (Guía - Migrar Database a Supabase del Cliente.md), but nothing on month_end/week_end --
-- exactly the columns these two views GROUP BY -- so an "All lots" query (no lot predicate to use
-- the existing index) falls back to a full scan + sort every time.
--
-- Pure performance, no behavior change: adds two indexes, nothing else. Safe to skip if the
-- current speed is acceptable -- the dashboard is already correct either way, just slower for the
-- "All lots" selection specifically; per-lot queries already use the existing (lot) index and
-- aren't affected by this.
begin;

create index if not exists idx_ue_gl_transactions_month_end on public.ue_gl_transactions(month_end);
create index if not exists idx_ue_gl_transactions_week_end  on public.ue_gl_transactions(week_end);

commit;

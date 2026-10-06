# JFR Ranch Dashboard — data layer

**2026-10-06: `dev.sqlite` is retired.** This dashboard no longer has a local database file at
all — every `src/lib/data/*.ts` function queries the client's own Supabase project
(`xpfmebdzcxorvwikfvtj.supabase.co`) directly, server-side, via `src/lib/supabase/service.ts`
(the service_role key — see that file's comment for why there's no per-request session to scope
these reads to instead). There are three families of tables there — **do not conflate them**:

- **`ue_gl_*` tables** (`ue_gl_transactions`, `ue_gl_head_days`, `ue_gl_head_movements`) — derived
  from the CenterPoint General Ledger / accounting pipeline ("Unit Economics Reporting" Excel
  project), pushed there by that project's `supabase_sync.py` after every reconciled monthly run.
  Real **dollar** figures. `ue_gl_lot_report_line_summary`, `ue_gl_lot_week_cost`,
  `ue_gl_ranch_month_cost` and `ue_gl_lot_head_flow` are Supabase VIEWS over `ue_gl_transactions`/
  `ue_gl_head_days` that pre-aggregate the GROUP BY / SUM queries this dashboard needs (PostgREST
  has no clean way to parameterize an arbitrary SQL aggregation, so the views do it once and the
  dashboard filters/sums the much smaller result in application code).
- **`ue_master_lot_schedule` / `ue_master_crop_schedule`** — the unified lot / crop-lot dimension
  tables (see `../docs/PROMPT - Master Schedule Unification.md`), upserted by the same
  `supabase_sync.py` run. GL-computed metrics, app-derived ADG/weight, and client-editable fields
  (Feed Type, Interest, Target ADG, ...) all on one row per lot.
- **Native app tables (no `ue_` prefix)** — `market_quotes` and `positions` are the client's own
  tables (same project, not ours), read live: `market_quotes` is fed by a daily cron + edge
  function, `positions` is the client's hedge/futures/options register. Queried directly, no copy
  of either lives in this project.
- **`ue_lot_crosswalk`** bridges `ue_master_lot_schedule` and the app's own lot identity, because
  the two systems do **not** share lot identity (see Caveat 2 below — read it before writing any
  query that joins across the two families). Uploaded by
  `Unit Economics Reporting/upload_lot_crosswalk.py` whenever the source crosswalk changes, not
  by the regular monthly sync.

See `Unit Economics Reporting/Guía - Migrar Database a Supabase del Cliente.md` for the full
migration this replaced (what used to be a local `dev.sqlite` snapshot, rebuilt by hand from a
separate Supabase project and a point-in-time `ranch.sqlite` export).

---

## Critical caveats — still apply, read before writing any query

These were true of the old `dev.sqlite` snapshot and remain true of the live tables it was built
from — nothing below was fixed by this migration, it's a read-path change, not a data change.

1. **Some `lots` rows are test data** (`TEST_DOC1`, `TEST_DOC2`, `Test-1` by lot number). A query
   against the client's native `lots` table (or a join through it) should filter those out unless
   you are explicitly auditing test data. `ue_lot_crosswalk` carries them too (passed through
   verbatim from the source crosswalk file) — `getCrosswalkInfo()` only ever looks one up by
   `gl_lot`, which is blank for all three, so they're harmless there, but don't assume absence.

2. **GL lot identity ≠ app lot identity.** `ue_master_lot_schedule.lot` /
   `ue_gl_transactions.lot` (e.g. `"37-X"`) and the client app's own `lots.lot_number` (e.g.
   `"37X"`, `"37X-1"`, `"37X-F"`) are DIFFERENT grains — never join them directly on text
   equality. Always go through `ue_lot_crosswalk`. Some app sub-lots roll up many-to-one into a
   single GL lot (`match_type = 'rollup'`); some GL lots have no app presence at all
   (`match_type = 'gl_only'`) and must keep using `ue_master_lot_schedule`'s own columns for
   head/weight data instead of the app tables; one is a `match_type = 'suspect'` match needing
   human confirmation (`FEEDPEN-27`, flagged as possibly the same as GL's `Feed Pen-25` but with
   mismatched years) — never treat a `suspect` row as a confirmed match. Rows with
   `decision_needed = 'YES'` have not been signed off by a human yet.

3. **`market_quotes.created_at`** was uniformly a single backfill timestamp as of the last check
   — never use it for recency. Always use `quote_date`.

4. **Death Loss is already its own GL cost line.** The GL nets Death Loss (account `623000`,
   `Death Loss Expense`) as its own real cost line, already separate from Purchased Cattle at
   entry cost. Never add death loss on top of purchase cost as an extra charge — it's already a
   distinct `report_line` value in `ue_gl_transactions`.

5. **`lots.total_cost_in`** (the client's own native column, not anything in `ue_*`) is never
   relieved when head are sold — it's a whole-lot cumulative purchase cost. Dividing it by
   remaining head count for a mostly-sold lot produces absurd numbers. Never present
   `total_cost_in / head_current` as a real per-head remaining cost without clearly labeling it
   an approximation. (This dashboard doesn't currently query `lots` directly for cost — it uses
   `ue_master_lot_schedule.cost_in_dollars`, which doesn't have this problem — but don't add a
   query that does.)

6. **Cost of Gain has three legitimate, very different definitions** — feed-only
   (≈ $0.37–0.49/lb), operating (≈ $0.66–1.24/lb), and all-in (≈ $1.00–1.50/lb). Always label
   which definition a displayed number uses (`getCostOfGain()` returns all three: `cogFeed`,
   `cogOper`, `cogAllIn`).

7. **"Grazing - Summer Native" has been booked at $0 for some lots in some periods** — not a bug
   in any query, a real gap in the accounting. `getCostOfGain()`'s `grazingSummerNativeBooked`
   flag exists specifically so the UI can surface this instead of silently understating feed cost
   of gain.

8. **Check `positions.notes` before presenting hedge coverage as real.** The table has carried
   verification/test rows in the past (e.g. `"[VERIFICATION ROW ... - not a real position;
   delete when done looking]"`) — `getOverviewMetrics()`'s hedge-coverage tile already excludes
   any row whose `notes` contains `"VERIFICATION ROW"`, but a query added elsewhere needs the
   same filter, not an assumption that every row is real.

None of the above are fixed, backfilled, or papered over anywhere in this data layer — the point
of this section is honesty about known gaps in the source data, not a changelog of what's been
cleaned up.

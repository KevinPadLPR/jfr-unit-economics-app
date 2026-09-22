# Prompt: adapt the web app to the Master Lot Schedule / Master Crop Schedule unification

Written for: whoever (human or another Claude session) next touches
`Reagan Ranch/JFR Ranch Dashboard/web`'s data layer. Self-contained — you shouldn't need to open
the Excel project to act on this, though `Context - Dashboard Web App Handoff.md` and
`Unit Economics Reporting/data/README.md`-equivalent context is in
`Unit Economics Reporting/Requirements.md` if you want the full backstory.

## What changed upstream (2026-09-22), in one paragraph

The Excel/notebook project (`Unit Economics Reporting/JFR Unit Economics Automation.ipynb`)
unified four previously-separate per-lot tables — `Lot Master.xlsx` (client input), the old
`Master Lot Schedule.xlsx` (client input), `Data_Lots`/`tbl_Lots` (GL-computed), and
`Data_LotAttrs`/`tbl_LotAttrs` (Supabase-app-derived, cohort-grain) — into **one** table,
`master_lot_schedule`, one row per GL lot. It also added a brand-new, analogous
`master_crop_schedule` table for crop lots (no equivalent existed before). A Python script,
`Unit Economics Reporting/supabase_sync.py`, now pushes both tables (plus `gl_transactions` and
`gl_head_days`) to Supabase from the last cell of the notebook, once Reconciliation confirms
`RECONCILED`. Exact column names for both new tables are in that script's `MASTER_LOT_SCHEDULE_COLUMN_MAP`
/ `MASTER_CROP_SCHEDULE_COLUMN_MAP` dicts — copy from there, don't retype by hand, if you write any
new SQL against them.

**This web app's dev SQLite schema and query layer were built *before* this unification** (they
mirror the four old fragmented tables). This prompt is the update.

## 1. Retire 4 tables, adopt 1 (+ 1 new one)

| Retire | Replaced by |
|---|---|
| `gl_lot_summary` | `master_lot_schedule` |
| `gl_lot_master` | `master_lot_schedule` (same columns, now client-editable fields on the one table) |
| `gl_master_lot_schedule` | `master_lot_schedule` (same columns) |
| `lot_attrs_app_cohort` | `master_lot_schedule` (see grain change below — **not** a 1:1 column copy) |
| *(nothing — brand new)* | `master_crop_schedule` |

### New `master_lot_schedule` schema (SQLite DDL — mirrors what `supabase_sync.py` pushes to Postgres)

```sql
CREATE TABLE master_lot_schedule (
    lot                            TEXT PRIMARY KEY,
    profit_center                  TEXT,
    status                         TEXT,
    production_year                INTEGER,
    date_in                        TEXT,
    last_activity                  TEXT,
    books_through                  TEXT,
    head_in                        INTEGER,
    head_sold                      INTEGER,
    head_dead                      INTEGER,
    head_transferred_out           INTEGER,
    head_on_hand                   INTEGER,
    head_days                      REAL,
    avg_dof                        REAL,
    lbs_in                         REAL,
    avg_wt_in                      REAL,
    cost_in_dollars                REAL,
    cost_in_dollars_per_head       REAL,
    head_data                      TEXT,
    has_app_data                   TEXT,     -- 'Yes' / 'No'
    app_sub_lots                   TEXT,     -- comma-joined, e.g. "37X,37X-1,37X-F" -- informational only
    head_in_app                    REAL,
    head_current_app               REAL,
    avg_weight_in_app              REAL,
    projected_current_weight_app   REAL,
    adg_used                       REAL,     -- ALREADY head-weighted-blended across app cohorts -- see §2
    adg_source                     TEXT,     -- 'assumed' / 'realized' / 'realized_thin' / 'mixed'
    anchor_type                    TEXT,
    anchor_date                    TEXT,
    days_since_anchor              REAL,
    weight_stale_over_60d          TEXT,     -- 'YES' / ''
    crosswalk_flag                 TEXT,
    display_name                   TEXT,
    target_adg                     REAL,     -- client-editable assumption (was Lot Master)
    market_dollars_per_cwt         REAL,     -- client-editable assumption (was Lot Master)
    target_out_date                TEXT,
    budget_cost_per_head           REAL,
    use_for_benchmark              TEXT,
    feed_type                      TEXT,     -- client-editable (was Master Lot Schedule)
    location_type                  TEXT,
    state                          TEXT,
    interest                       REAL,     -- reserved, not read by any Excel formula yet either
    death_loss                     REAL,
    slide                          REAL,
    premium                        REAL,
    action                         TEXT,     -- system-generated "Fill: X-Y" hint, e.g. "Fill: State"
    notes                          TEXT
);
```

### New `master_crop_schedule` schema

```sql
CREATE TABLE master_crop_schedule (
    crop_lot                TEXT PRIMARY KEY,   -- e.g. "Corn 2026", "26-Corn-Lucas (120 ac)"
    profit_center           TEXT,               -- Corn / Harv Oats / Grazing Oats / Native Grazing / Cover Crop / Corn Silage / Hay
    status                  TEXT,               -- 'Open' = current production year, else 'Closed'
    production_year         INTEGER,
    date_in                 TEXT,
    last_activity            TEXT,
    books_through           TEXT,
    direct_cost_dollars     REAL,
    indirect_cost_dollars   REAL,
    total_cost_dollars      REAL,
    revenue_dollars         REAL,               -- 'Crop Sales' GL report line
    net_dollars             REAL,
    display_name            TEXT,
    acres                   REAL,               -- client-editable; regex-suggested from the label on first sight, never assumed
    yield_quantity          REAL,               -- client-editable, no source anywhere yet
    yield_unit               TEXT,
    action                   TEXT,
    notes                    TEXT
);
```

No cattle-style app data on crops — there's no Supabase-app equivalent for crop lots, so no
`has_app_data`/`adg_used`-style columns here.

## 2. The one thing that isn't a mechanical rename: `lot_attrs_app_cohort`'s grain change

`lot_attrs_app_cohort` was **cohort-grain** (one row per app sub-lot, e.g. separate rows for
`37X`, `37X-1`, `37X-F`) — that's why `src/lib/data/lot-attrs.ts`'s `getLotAttrsRollup()` exists at
all: it queries all cohort rows for a GL lot and computes a **head-weighted average** ADG/weight
itself, in TypeScript.

`master_lot_schedule` is **GL-lot-grain already** (one row per GL lot, `37-X`) — the Excel
notebook now does that exact same head-weighted rollup *before* the sync (same formula, ported
from the old `tbl_LotAttrs` cell — nothing about the math changed, only where it runs). This means
`getLotAttrsRollup()`'s rollup logic is now **dead code to delete**, not adapt — the app can read
`adg_used`, `projected_current_weight_app`, `has_app_data`, `weight_stale_over_60d` straight off
the single `master_lot_schedule` row for that lot. This is a net simplification, not just a rename.

## 3. Exact file-by-file changes

Found by `grep -rl "gl_lot_summary\|gl_lot_master\|gl_master_lot_schedule\|lot_attrs_app_cohort" src/ scripts/` — six files, no others:

### `src/lib/data/cost-of-gain.ts`
- `getGlLotSummary()`, `listGlLots()`: change `FROM gl_lot_summary` → `FROM master_lot_schedule`.
  `GlLotSummaryRow` interface gains the app/client columns that used to live elsewhere (or just
  keep it narrow and add a second, wider interface — your call) — at minimum `target_adg` no
  longer needs a separate `gl_lot_master` join anywhere else in the codebase (it wasn't joined
  today, so no change there — this file already selected `target_adg` off `gl_lot_summary`,
  which itself came from a Lot Master merge upstream in the old Excel pipeline; same value, same
  column name, new source table).

### `src/lib/data/lot-attrs.ts`
- **Delete** the cohort-rollup logic in `getLotAttrsRollup()` (the `SELECT ... FROM
  lot_attrs_app_cohort WHERE lot = ?` query, the `weight()`/`totalWeight` head-weighting loop,
  `allRealized` check). Replace with a single-row read off `master_lot_schedule`:
  `has_app_data`, `adg_used`, `adg_source`, `weighted_arrival_date` (not present in the new
  table — see note below), `projected_current_weight_app`, `weight_stale_over_60d`.
  - **Note**: `weighted_arrival_date` (used today for `LotAttrsRollup.weightedArrivalDate`) has no
    direct equivalent in `master_lot_schedule` — the closest is `anchor_date`. Check what
    `weightedArrivalDate` is actually used for in the UI before assuming `anchor_date` is a drop-in
    replacement; if nothing renders it, just drop the field.
  - `getCrosswalkInfo()` — unaffected, doesn't touch these four tables (queries a separate
    `lot_crosswalk` table you built directly from `crosswalk_seed.csv`, which the Excel side
    doesn't sync yet — leave as-is, or ask whether it should also start coming from Supabase
    now that `master_lot_schedule.crosswalk_flag` exists per-lot).

### `src/lib/data/scorecard.ts`
- Currently does a second query against `gl_master_lot_schedule` just for `feed_type`/`location_type`,
  then joins it in application code (`scheduleByLot` map). Delete that second query entirely —
  `listGlLots()` (after the `cost-of-gain.ts` change above) already returns rows from
  `master_lot_schedule`, which already has `feed_type`/`location_type` on the same row. One query
  instead of two.

### `src/lib/data/lot-sheet.ts`
- Same pattern: a `gl_master_lot_schedule` lookup for `feed_type`/`location_type`/`state` that's
  now redundant with the single `master_lot_schedule` row already fetched via `getGlLotSummary()`.
  Delete the second query.

### `src/app/(app)/lots/page.tsx`
- The `ScheduleRow` query (`SELECT lot, feed_type, location_type, state, interest, death_loss,
  slide, premium, latest_gl_date, action FROM gl_master_lot_schedule`) — note `latest_gl_date`
  doesn't exist as a column name in the new table; the equivalent is `last_activity`. Fold this
  into the main `listGlLots()` result (one table now has everything this page needs) rather than
  a separate query.

### `scripts/build_dev_db.py`
This is the biggest change, and an opportunity, not just an obligation: this script currently
**recomputes** GL stats, head-days, and the app-cohort rollup itself, in Python, independently
from the Excel project — duplicate logic that could drift out of sync with the Excel side's own
(now more carefully tested) version. Two options, in order of preference:

1. **(Recommended) Read `Database/Master Lot Schedule.xlsx` and `Database/Master Crop Schedule.xlsx`
   directly** (they live in the Excel project at
   `Reagan Ranch/Unit Economics Reporting/Database/`) instead of recomputing from the raw GL
   export + `ranch.sqlite` + crosswalk CSV. This script's job shrinks to: read those two files with
   `pandas.read_excel()`, rename columns per the maps in
   `Unit Economics Reporting/supabase_sync.py` (same source of truth — literally import that
   module if convenient, don't retype the maps a third time), and load into SQLite. The Excel
   project already reconciles this data against the GL to the penny (see its Reconciliation tab)
   — reuse that instead of re-deriving it.
2. If you need dev data to work independently of the Excel project's Box folder being reachable
   from wherever this runs, keep the current from-scratch approach but update the target schema to
   match §1 above, and drop the now-redundant cohort-rollup step (§2) — the underlying
   `App_LotAttrs.csv` source hasn't moved, so this is a smaller change than it sounds.

Either way: rebuild `data/dev.sqlite` and re-run `npm run db:seed`, then click through Cost of
Gain / Lot Scorecard / Market Position / Lots for a couple of real lots and confirm the numbers
match what they showed before (37-X's Cost of Gain all-in was ≈$1.19/lb against real September
2026 data at last check — use that as a smell test).

## 4. New opportunity, not required: a Crop page

`master_crop_schedule` has no consumer in this app yet — there's no crop-side page, and nothing in
the original ask for this dashboard mentioned one. If a "Crop Schedule" or "Crop Cost Summary" page
gets requested later, the table already has everything for a basic version: cost by crop lot,
Direct/Indirect split, revenue, net, and (once the client fills them in) $/acre. Flagging this here
so whoever builds it doesn't have to re-derive the schema from the Excel side from scratch — it's
already in §1 above.

## 5. What does NOT need to change

- `gl_transactions`, `gl_head_days`, and every Supabase-app-native table (`lots`, `lot_status`,
  `sales`, `invoices`, `market_quotes`, ...) are untouched by this unification — same names, same
  columns, same grain, on both the Excel/Supabase side and this app's SQLite mirror.
- `lot_crosswalk` — separate concern, not part of this unification (see the note under
  `lot-attrs.ts` above).
- Nothing about the UI/pages themselves needs to change *visually* — this is purely a data-layer
  consolidation. If you do it right, the dashboard should look and behave identically, just with
  fewer, simpler queries underneath.

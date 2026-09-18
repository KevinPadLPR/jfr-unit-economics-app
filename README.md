# JFR Ranch — Position Desk

Unit Economics, Lot Scorecard, and Market Position dashboard for JFR Ranch Co. Ltd
(Kosse, TX). Built on the same approved visual style as the K4 Ranches reference
dashboard (`Ranch Automation/Ranch Dashboard v2/web`) — Next.js App Router, Tailwind v4,
Recharts, NextAuth — extended with real role-based access and JFR's own brand.

Read `Context - Dashboard Web App Handoff.md` (in the `Unit Economics Reporting` project)
first if you're new to this client — it's the single-file briefing this app was built
from: who the client is, what data exists, and the non-negotiable Position Desk rules
this app follows (every number is labeled with how it was derived; a missing input is a
dash + its age, never a plausible guess; the front page caps at twelve metrics).

## Quick start

```bash
npm install
python scripts/build_dev_db.py   # builds data/dev.sqlite from the real Excel + Supabase snapshot
npm run db:seed                  # seeds the two test accounts into data/dev.sqlite
npm run dev
```

Requires Python 3 with `openpyxl` installed for the first command. Both scripts are
idempotent — re-run them any time the source files change.

## Test accounts

Seeded by `npm run db:seed` (see `scripts/seed_users.mjs` — change the passwords there
before this ever goes near a real client):

| Role | Email | Password |
|---|---|---|
| Admin (full dashboard) | `admin@jfrranch.com` | `JFRAdmin2026!` |
| Rancher (data entry — placeholder for now) | `rancher@jfrranch.com` | `JFRRancher2026!` |

Admins see the full dashboard (Overview, Cost of Gain, Lot Scorecard, Market Position,
Master Lot Schedule). Ranchers are routed to `/rancher`, a placeholder — field data entry
(weights, deaths, moves, health events) is an explicitly separate next phase, not built
here yet (see the handoff doc §3 for what ranchers actually asked for).

## Data: SQLite now, Supabase later

This app reads a local SQLite file (`data/dev.sqlite`, gitignored — it holds real client
financial and cattle data and must never be committed) built by two scripts:

- `scripts/build_dev_db.py` — real ranch data. GL-derived tables (prefixed `gl_*`) come
  from the Unit Economics Excel project's latest ETL output; app-native tables (`lots`,
  `lot_status`, `sales`, `market_quotes`, etc., same names, no prefix) are copied verbatim
  from the Supabase snapshot at `Supabase Connection/data/ranch.sqlite`. See
  `data/README.md` for the full table reference and the caveats that matter (test-lot
  filtering, the GL/app lot-identity crosswalk, known accounting gaps).
- `scripts/seed_users.mjs` — the `app_users` auth table (Node/bcryptjs, kept separate from
  the Python data import on purpose).

Everything in `src/lib/data/*.ts` is written as plain SQL against this schema so that
pointing at real Supabase instead of SQLite later is a matter of swapping `src/lib/db.ts`
— not rewriting every query. That sync job doesn't exist yet (see handoff doc §5b/§7);
until it does, this repo's Vercel deployment has no real data source configured in
production (`data/dev.sqlite` is dev-only and isn't shipped), and will show the "report
unavailable" state rather than crash.

## Brand

No official JFR Ranch logo exists yet — `docs/brand-palette.md` explains what this app's
branding is based on (the client's own field-app icons) and exactly how the chart colors
were chosen and validated. Replace `public/brand/*.svg` wholesale once a real logo shows
up; nothing else should need to change.

## What's deliberately not built yet

- Rancher field data entry (next phase, per the client ask).
- A real contract-month/own-basis table for Market Position — light calves are currently
  marked against the standard CME feeder contract, which is a known simplification (see
  the caveat text on that page).
- Live Supabase connection (dev runs on the SQLite snapshot only).
- GL transaction drill-down (click a cost line to see the underlying postings) — the Cost
  of Gain and Lot Sheet pages show the category-level breakdown but not per-transaction
  detail yet.

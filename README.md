# JFR Ranch — Position Desk (vanilla JS)

> **2026-10 rewrite notice:** this branch (`migration/dashboard-vanilla-js`) replaces
> everything below with a plain HTML/CSS/JS build -- no build step, no React/Next.js,
> no bundler -- so this dashboard matches the client's own vanilla-JS architecture
> (`public/client-app/index.html`) and can eventually be folded into that single file.
> The Next.js version this README originally documented still exists on `main`; the
> sections below are kept for history/context (data model, brand notes) but the
> **Quick start** section is stale -- see the summary just below instead.
>
> **New architecture, in short:**
> - One static `.html` file per report under `dashboard/`, plus `index.html` (login)
>   and `rancher.html` (crew view). "Dynamic routes" are a query string
>   (`dashboard/lot-detail.html?lot=37X-1`), not a path segment -- there's no server.
> - This app's own code is plain ES modules under `assets/js/` (`pages/*.js` per
>   page, `data/*.js` mirroring the old `src/lib/data/*.ts` 1:1), loaded with
>   `<script type="module">` -- no bundler needed, browsers run this natively.
> - Supabase JS and Chart.js load from the same CDN URLs/versions
>   `public/client-app/index.html` already uses (UMD builds, globals, no npm
>   install required to run the site).
> - Every read in `assets/js/data/*.js` goes through `assets/js/supabase-client.js`,
>   which holds **only the anon/publishable key** plus a signed-in browser session,
>   relying entirely on this project's existing RLS policies (`current_user_role()`)
>   -- never the service_role key the old Next.js server code used. See that file's
>   header comment before adding any new data module.
> - Run it: serve the repo root with any static file server (`npx serve .` or
>   `python -m http.server`) and open `index.html`. Sign in with a real Supabase Auth
>   account from the client's project -- same login every client-app user already has.
> - Tests: `tests/dashboard.spec.js`, a read-only Playwright smoke suite -- `npm install`
>   then `npm test` (see that file's header comment and `tests/README.md` for the
>   `TEST_ACCOUNTANT_EMAIL`/`TEST_ACCOUNTANT_PASSWORD` env vars it needs).
> - `package.json`/`package-lock.json` have been trimmed to just this branch's own
>   dev tooling (`@playwright/test`, `serve`) -- the leftover Next.js/React dependency
>   list a first pass of this rewrite left in place has been removed; the shipped site
>   itself still needs zero npm packages to run.
>
> ---
>
> ## (Below: original Next.js-era README, describing the SQLite dev workflow on `main` -- not this branch)

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
| Rancher (read-only) | `rancher@jfrranch.com` | `JFRRancher2026!` |

Admins see the full dashboard (Overview, Cost of Gain, Lot Scorecard, Market Position,
Master Lot Schedule). Ranchers are routed to `/rancher`, a lightweight read-only view of
their open lots (feed type, location, head on hand, avg DOF) — no $ cost/revenue and no
market/hedge position data, both of which stay admin-only. This is deliberately **not** a
data-entry screen: field data (weights, deaths, moves, health events) is captured in
John's own field app, not here, so there's no legitimate write path for a rancher account
to have in this dashboard at all (see the handoff doc §3 for what ranchers actually asked
for, and the 2026-09-24 conversation note that settled this scope).

## Data: SQLite now, Supabase later

This app reads a local SQLite file (`data/dev.sqlite`) built by two scripts:

- `scripts/build_dev_db.py` — real ranch data. GL-derived tables (prefixed `gl_*`) come
  from the Unit Economics Excel project's latest ETL output; app-native tables (`lots`,
  `lot_status`, `sales`, `market_quotes`, etc., same names, no prefix) are copied verbatim
  from the Supabase snapshot at `Supabase Connection/data/ranch.sqlite`. See
  `data/README.md` for the full table reference and the caveats that matter (test-lot
  filtering, the GL/app lot-identity crosswalk, known accounting gaps).
- `scripts/seed_users.mjs` — the `app_users` auth table (Node/bcryptjs, kept separate from
  the Python data import on purpose).

**`data/dev.sqlite` is committed to this repo** (as of 2026-09-21, Kevin's call) so the
Vercel deployment has working data and login before the real Supabase sync exists. It
contains real JFR Ranch financial and cattle data — **keep this repo private.**
`next.config.ts`'s `outputFileTracingIncludes` forces Vercel to bundle the file (Next's
automatic tracing can't see the dynamic `fs` path in `src/lib/db.ts`); if pages start
500ing in production after a config change, check that first. Only the WAL/SHM/journal
sidecar files stay gitignored (regenerated automatically, not meaningful to diff).

Everything in `src/lib/data/*.ts` is written as plain SQL against this schema so that
pointing at real Supabase instead of SQLite later is a matter of swapping `src/lib/db.ts`
— not rewriting every query. That sync job doesn't exist yet (see handoff doc §5b/§7).

## Brand

No official JFR Ranch logo exists yet — `docs/brand-palette.md` explains what this app's
branding is based on (the client's own field-app icons) and exactly how the chart colors
were chosen and validated. Replace `public/brand/*.svg` wholesale once a real logo shows
up; nothing else should need to change.

## What's deliberately not built yet

- Rancher field data entry — **not planned**, not just "later." Field data is captured in
  John's own app; this dashboard has no legitimate write path and isn't meant to grow one.
- A real contract-month/own-basis table for Market Position — light calves are currently
  marked against the standard CME feeder contract, which is a known simplification (see
  the caveat text on that page).
- Live Supabase connection (dev runs on the SQLite snapshot only).
- GL transaction drill-down (click a cost line to see the underlying postings) — the Cost
  of Gain and Lot Sheet pages show the category-level breakdown but not per-transaction
  detail yet.

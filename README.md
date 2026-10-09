# JFR Ranch — Unit Economics dashboard (now a native tab, not a separate site)

> **2026-10 integration notice:** this branch (`migration/dashboard-vanilla-js`) does NOT
> build or deploy a separate site. An earlier pass on this branch did -- its own
> `index.html` login page, its own Supabase session, its own Vercel project -- and that
> was a scoping mistake, corrected this session. The dashboard is now **native vanilla-JS
> code living inside `public/client-app/index.html`**, the client's own real app (a
> reference copy in this repo; the actual deployed app is a separate repo the client owns
> -- see below), behind the "Dashboard" nav tab that already existed there.
>
> **Where everything lives:**
> - `public/client-app/index.html` -- unchanged except: one new `<link>` for
>   `dashboard/dashboard.css`, the `#dashboardView` markup (an iframe before, a plain
>   `<div id="dashboardContent">` now), `showDashboardTab()` (calls
>   `window.UEDash.renderSubtab(subtab)` instead of setting an iframe `src`), and ~20 new
>   `<script src="dashboard/...">` tags right before `</body>`.
> - `public/client-app/dashboard/` -- every ported file: `data/*.js` (9 files, 1:1 with the
>   old Next.js `src/lib/data/*.ts`), `charts.js`, `colors.js`, `format.js`, `dom.js`,
>   `pages/*.js` (7 sub-tab renderers), `router.js`, `dashboard.css`.
> - **Plain classic `<script>` tags, not ES modules** -- this app's 40,000 lines are one
>   shared global scope with no bundler, so the ported files read its already-declared
>   `supabase`/`currentProfile`/`currentUser` directly instead of creating a second client
>   or a second login. To avoid leaking ~70 function/const names into that shared scope,
>   every ported name lives on one object, `window.UEDash`, instead of as a bare global --
>   see `dashboard/format.js`'s header comment.
> - **CSS is scoped**, not global -- every selector in `dashboard.css` (including what used
>   to be a `:root` custom-property block) is written under a `.dashboard-root` ancestor,
>   the one container the Dashboard tab's markup lives inside, because the host app already
>   defines some of the same custom-property names (`--border`, `--radius`, `--accent`)
>   with different values -- loading the old tokens.css unscoped would have silently
>   changed those everywhere in the app, not just on this tab.
> - **No `?lot=`/`?month=` query-string state** -- there's no URL to carry it in inside a
>   tab. Lot/month selection lives in `window.UEDash.dashState` (`router.js`); a lot link
>   anywhere in the dashboard calls `window.UEDash.goToLot(lotNumber)`, which jumps to the
>   Lot Detail sub-tab with that lot already selected.
> - Reads are exactly what they were: every `data/*.js` call is a plain `.select()`, no
>   RPC, no write -- same posture as every phase of the separate Next.js migration this
>   engagement has also been shipping on `migration/client-app-nextjs-phase1`.
>
> **What this branch is NOT**: it does not touch `johnfreagan/JFR-Ranch-cattle-management-
> office-app-`, the client's real, separately-owned repo where the actually-deployed app
> lives (confirmed this session -- `public/client-app/` here is a reference copy kept for
> porting work, not the live site). Handing this off to the client is a separate step,
> outside this repo, for Kevin to do however he and John agree on (PR, patch, etc.).
>
> The rest of this README (below) is the original Next.js-era document, kept for history
> (data model notes, brand palette) -- it describes neither this branch's current shape
> nor the separate Next.js migration on `main`.
>
> ---

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

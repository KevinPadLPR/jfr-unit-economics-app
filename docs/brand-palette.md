# JFR Ranch — chart & brand palette

Reference instance for this app, following the data-viz color-formula method (fixed hue
anchors, six-check validation via `validate_palette.js`). If the brand mark changes, redo
this file — don't hand-edit hex values elsewhere.

## Where the hues came from

No official JFR Ranch logo/brand guide exists yet (checked Box — only generic PWA icons
from John Reagan's own cattle-management app: a white longhorn silhouette, and a
tally-book icon using near-black `#1A1E16` ink on cream `#EFF0EB`, with an olive-green
`#2F5D3A` accent). This app's brand extends that existing, client-authored pair — near-black
ink + cream ground — with an olive-green primary and a small earth-tone chart family built
around it. Replace this file wholesale if/when the client supplies an official logo.

## Categorical (chart series identity) — 4 slots, both modes VALIDATED

Only light mode is currently wired into the app (dark mode is not implemented — see
`README.md`); the dark steps below are recorded for when that's built.

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | rust / terracotta | `#C1602A` | `#C97A42` |
| 2 | steel blue | `#0B7AA0` | `#1F8EBD` |
| 3 | olive / moss green | `#6E8F2E` | `#6B9E3A` |
| 4 | plum / wine | `#8C3560` | `#B0578A` |

Validated with `node scripts/validate_palette.js "<hexes>" --mode light --surface "#EFF0EB"`
(and `--mode dark --surface "#1A1E16"`) from the dataviz skill directory — all four checks
PASS in both modes (chroma floor, adjacent CVD >= 8 target, normal-vision floor >= 15,
contrast >= 3:1). Only 4 slots exist (not the usual 8) because this app rarely needs more
than 4 simultaneous series (Feed Type, Location Type, lot status groupings) — extend by
re-running the validator with 2 more candidate hues before adding a 5th slot, don't just
append a color.

Use in fixed order — slot 1 always rust, slot 2 always steel blue, etc. Never recolor by
value/rank.

## Diverging (Market Position unrealized gain/loss, GL cost bridges)

Two hues reused from the categorical set (legal — diverging is a separate job/context, and
these two never appear as competing series identities in the same chart as the diverging
encoding):

- Positive / gain arm: olive green `#6E8F2E`, tint `#DCE8C9`
- Negative / loss arm: rust `#C1602A`, tint `#F3DCCB`
- Neutral midpoint: `#CFCDBF` (warm gray, not the brand cream — cream is a surface color,
  using it as the midpoint would make "zero" invisible against the card background)

## Sequential (magnitude — single hue, light -> dark)

Steel blue ramp: `#DCEEF5` (100) -> `#0B7AA0` (400) -> `#053446` (700). Used for
days-on-feed / cost-per-head-day intensity where a genuine continuous magnitude is being
shown (not identity).

## Status (fixed — never themed, per the dataviz skill)

Adopted verbatim from the skill's documented default status scale — status colors are
never brand-derived by design, so they never get confused with a themed series:

| role | hex |
|---|---|
| good | `#0CA30C` |
| warning | `#FAB219` |
| serious | `#EC835A` |
| critical | `#D03B3B` |

Always icon + label, never color alone (warning/serious sit below 3:1 contrast on the light
surface by design — the pairing is the mitigation).

## Data-provenance badges (Position Desk spec, Rule 1)

Not chart colors — small UI badges marking whether a number is measured, sourced, modeled,
or assumed (see `Context - Dashboard Web App Handoff.md` §4). Deliberately distinct from
both the categorical and status scales so a provenance tag never reads as a chart series or
a health indicator:

| provenance | hex | meaning |
|---|---|---|
| MEASURED | `#1A1E16` (ink, solid) | scale ticket, invoice, GL posting |
| SOURCED | `#0B7AA0` | CME settle, cash bid |
| MODELED | `#6E8F2E` | weight from ADG, cost from head-days |
| ASSUMED | `#A8783C` | projected ADG, flat death-loss %, target month |

## UI chrome (not chart colors)

| role | hex |
|---|---|
| Page background | `#F7F6F1` |
| Card | `#FFFFFF` |
| Primary ink | `#1A1E16` |
| Muted ink | `#6B6A5E` |
| Border | `#E3E1D5` |
| Primary action (buttons, active nav) | `#3F5C2A` |

See `src/app/globals.css` for the CSS custom properties these map to, and
`src/lib/theme/colors.ts` for the JS constants Recharts components import.

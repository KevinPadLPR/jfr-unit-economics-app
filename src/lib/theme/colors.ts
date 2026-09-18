/**
 * JFR Ranch chart palette — mirrors the CSS tokens in globals.css and the
 * validated instance documented in docs/brand-palette.md. Recharts needs raw
 * hex (it can't read CSS custom properties for fill/stroke props), so this is
 * the one place both worlds read from — don't hardcode hex anywhere else.
 */

export const CATEGORICAL = {
  rust: "#C1602A",
  steelBlue: "#0B7AA0",
  olive: "#6E8F2E",
  plum: "#8C3560",
} as const;

export const CATEGORICAL_ORDER = [
  CATEGORICAL.rust,
  CATEGORICAL.steelBlue,
  CATEGORICAL.olive,
  CATEGORICAL.plum,
] as const;

export const DIVERGING = {
  positive: "#6E8F2E",
  positiveTint: "#DCE8C9",
  negative: "#C1602A",
  negativeTint: "#F3DCCB",
  neutral: "#CFCDBF",
} as const;

export const SEQUENTIAL_BLUE = {
  100: "#DCEEF5",
  400: "#0B7AA0",
  700: "#053446",
} as const;

/** Fixed, never themed — reconciliation state, exceptions, alert severity. */
export const STATUS = {
  good: "#0CA30C",
  warning: "#FAB219",
  serious: "#EC835A",
  critical: "#D03B3B",
} as const;

/** Position Desk spec Rule 1 — every number is labeled with how it was derived. */
export const PROVENANCE = {
  measured: "#1A1E16",
  sourced: "#0B7AA0",
  modeled: "#6E8F2E",
  assumed: "#A8783C",
} as const;

export type Provenance = keyof typeof PROVENANCE;

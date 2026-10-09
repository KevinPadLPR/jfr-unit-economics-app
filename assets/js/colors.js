/**
 * Direct port of src/lib/theme/colors.ts -- mirrors the CSS tokens in
 * assets/css/tokens.css. Chart.js needs raw hex (same reason Recharts did),
 * so this is the one place both worlds read from -- don't hardcode hex
 * anywhere else.
 */

export const CATEGORICAL = {
  rust: "#C1602A",
  steelBlue: "#0B7AA0",
  olive: "#6E8F2E",
  plum: "#8C3560",
};

export const CATEGORICAL_ORDER = [CATEGORICAL.rust, CATEGORICAL.steelBlue, CATEGORICAL.olive, CATEGORICAL.plum];

export const DIVERGING = {
  positive: "#6E8F2E",
  positiveTint: "#DCE8C9",
  negative: "#C1602A",
  negativeTint: "#F3DCCB",
  neutral: "#CFCDBF",
};

export const SEQUENTIAL_BLUE = {
  100: "#DCEEF5",
  400: "#0B7AA0",
  700: "#053446",
};

/** Fixed, never themed -- reconciliation state, exceptions, alert severity. */
export const STATUS = {
  good: "#0CA30C",
  warning: "#FAB219",
  serious: "#EC835A",
  critical: "#D03B3B",
};

/** Position Desk spec Rule 1 -- every number is labeled with how it was derived. */
export const PROVENANCE = {
  measured: "#1A1E16",
  sourced: "#0B7AA0",
  modeled: "#6E8F2E",
  assumed: "#A8783C",
};

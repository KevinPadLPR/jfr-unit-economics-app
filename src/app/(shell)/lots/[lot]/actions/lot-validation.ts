export type LotFormMode = "edit" | "duplicate";

/**
 * Ported from the save handler's one hard rule (index.html:9964-9976): on anything but an edit,
 * a positive estimated purchase weight is required -- without it every per-cwt med on the
 * receiving protocol doses at nothing. `mode: 'new'` (the other case this rule applies to in
 * vanilla) isn't reachable from this page's kebab menu, so in practice this always fires for
 * `duplicate` unless a weight is given.
 */
export function validateLotForm(input: { mode: LotFormMode; estWeight: number | null }): string | null {
  if (input.mode !== "edit" && !(input.estWeight != null && input.estWeight > 0)) {
    return (
      "Put in the estimated purchase weight. Without it every per-hundredweight med on the receiving " +
      "protocol doses at nothing, so the drug goes in the cattle and this lot is charged $0 for it. " +
      "Within a few pounds is plenty - an invoice weight takes over the moment one is entered."
    );
  }
  return null;
}

/**
 * The fixed 13-column cost-assumption copy a "Duplicate lot" save performs
 * (index.html:9997-10013) -- named here so a silently-dropped column is a failing test, not a
 * quiet gap. `cog_mode` is listed but never actually read off the seed: "the only mode
 * (2026-09-11); the old per-day / flat columns are audit and are not copied."
 */
export const DUPLICATE_ASSUMPTION_COLUMNS = [
  "target_sale_cwt",
  "target_days_on_feed",
  "cog_mode",
  "labor_mode",
  "assumed_cog_per_lb",
  "assumed_nonfeed_cog_per_day",
  "assumed_labor_per_day",
  "assumed_labor_per_head",
  "assumed_med_per_head",
  "assumed_processing_per_head",
  "assumed_doctoring_per_head",
  "assumed_death_loss_pct",
  "assumed_interest_pct",
] as const;

export interface DuplicateSeed {
  target_sale_cwt: number | null;
  target_days_on_feed: number | null;
  labor_mode: string | null;
  assumed_cog_per_lb: number | null;
  assumed_nonfeed_cog_per_day: number | null;
  assumed_labor_per_day: number | null;
  assumed_labor_per_head: number | null;
  assumed_med_per_head: number | null;
  assumed_processing_per_head: number | null;
  assumed_doctoring_per_head: number | null;
  assumed_death_loss_pct: number | null;
  assumed_interest_pct: number | null;
}

export function pickDuplicateAssumptions(seed: DuplicateSeed): Record<(typeof DUPLICATE_ASSUMPTION_COLUMNS)[number], unknown> {
  return {
    target_sale_cwt: seed.target_sale_cwt,
    target_days_on_feed: seed.target_days_on_feed,
    cog_mode: "per_lb",
    labor_mode: seed.labor_mode,
    assumed_cog_per_lb: seed.assumed_cog_per_lb,
    assumed_nonfeed_cog_per_day: seed.assumed_nonfeed_cog_per_day,
    assumed_labor_per_day: seed.assumed_labor_per_day,
    assumed_labor_per_head: seed.assumed_labor_per_head,
    assumed_med_per_head: seed.assumed_med_per_head,
    assumed_processing_per_head: seed.assumed_processing_per_head,
    assumed_doctoring_per_head: seed.assumed_doctoring_per_head,
    assumed_death_loss_pct: seed.assumed_death_loss_pct,
    assumed_interest_pct: seed.assumed_interest_pct,
  };
}

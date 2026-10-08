import { describe, it, expect } from "vitest";
import { validateLotForm, DUPLICATE_ASSUMPTION_COLUMNS, pickDuplicateAssumptions, type DuplicateSeed } from "./lot-validation";

describe("validateLotForm", () => {
  it("never requires a weight on edit", () => {
    expect(validateLotForm({ mode: "edit", estWeight: null })).toBeNull();
    expect(validateLotForm({ mode: "edit", estWeight: 0 })).toBeNull();
  });

  it("requires a positive weight on duplicate", () => {
    expect(validateLotForm({ mode: "duplicate", estWeight: null })).toMatch(/estimated purchase weight/);
    expect(validateLotForm({ mode: "duplicate", estWeight: 0 })).toMatch(/estimated purchase weight/);
    expect(validateLotForm({ mode: "duplicate", estWeight: -5 })).toMatch(/estimated purchase weight/);
    expect(validateLotForm({ mode: "duplicate", estWeight: 550 })).toBeNull();
  });
});

describe("pickDuplicateAssumptions", () => {
  const seed: DuplicateSeed = {
    target_sale_cwt: 185,
    target_days_on_feed: 120,
    labor_mode: "per_head",
    assumed_cog_per_lb: 1.1,
    assumed_nonfeed_cog_per_day: 0.5,
    assumed_labor_per_day: null,
    assumed_labor_per_head: 25,
    assumed_med_per_head: 10,
    assumed_processing_per_head: 15,
    assumed_doctoring_per_head: 5,
    assumed_death_loss_pct: 1.5,
    assumed_interest_pct: 7,
  };

  it("copies exactly the 13 named columns, forcing cog_mode to per_lb", () => {
    const picked = pickDuplicateAssumptions(seed);
    expect(Object.keys(picked).sort()).toEqual([...DUPLICATE_ASSUMPTION_COLUMNS].sort());
    expect(picked.cog_mode).toBe("per_lb");
    expect(picked.target_sale_cwt).toBe(185);
    expect(picked.assumed_interest_pct).toBe(7);
  });

  it("carries a null assumption through as null, not dropped or zeroed", () => {
    const picked = pickDuplicateAssumptions(seed);
    expect(picked.assumed_labor_per_day).toBeNull();
  });
});

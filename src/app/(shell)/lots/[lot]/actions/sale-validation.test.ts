import { describe, it, expect } from "vitest";
import { validateSaleSources, checkPriceSanity, checkPayWeightTie } from "./sale-validation";

describe("validateSaleSources", () => {
  it("single source: takes head count from the top field, requires a pasture", () => {
    expect(validateSaleSources(40, [{ pastureId: "", headCount: null }])).toEqual({ error: "Pick a source pasture." });
    expect(validateSaleSources(40, [{ pastureId: "north", headCount: null }])).toEqual({ sources: [{ pastureId: "north", headCount: 40 }] });
  });

  it("multi source: requires at least one valid row", () => {
    expect(
      validateSaleSources(40, [
        { pastureId: "", headCount: 0 },
        { pastureId: "", headCount: null },
      ])
    ).toEqual({ error: "Add at least one source pasture." });
  });

  it("multi source: must sum exactly to head count", () => {
    expect(
      validateSaleSources(40, [
        { pastureId: "north", headCount: 20 },
        { pastureId: "south", headCount: 15 },
      ])
    ).toEqual({ error: "Sources total (35 hd) must equal head count (40 hd)." });
  });

  it("multi source: accepts a valid split, dropping empty rows", () => {
    expect(
      validateSaleSources(40, [
        { pastureId: "north", headCount: 20 },
        { pastureId: "", headCount: null },
        { pastureId: "south", headCount: 20 },
      ])
    ).toEqual({
      sources: [
        { pastureId: "north", headCount: 20 },
        { pastureId: "south", headCount: 20 },
      ],
    });
  });
});

describe("checkPriceSanity", () => {
  it("passes with no price entered", () => {
    expect(checkPriceSanity(null)).toBeNull();
  });
  it("passes within the typical range", () => {
    expect(checkPriceSanity(50)).toBeNull();
    expect(checkPriceSanity(250)).toBeNull();
    expect(checkPriceSanity(1000)).toBeNull();
  });
  it("flags below $50 or above $1000", () => {
    expect(checkPriceSanity(49.99)).toMatch(/outside the typical range/);
    expect(checkPriceSanity(1000.01)).toMatch(/outside the typical range/);
  });
});

describe("checkPayWeightTie", () => {
  it("ties when total/gross*100 lands on the quoted $/cwt within tolerance", () => {
    // 1000 lb gross at $200/cwt = $2000 total.
    expect(checkPayWeightTie(1000, 200, 2000)).toBe(true);
  });
  it("does not tie when the money is off", () => {
    expect(checkPayWeightTie(1000, 200, 1500)).toBe(false);
  });
  it("never ties with no price or no total", () => {
    expect(checkPayWeightTie(1000, null, 2000)).toBe(false);
    expect(checkPayWeightTie(1000, 200, null)).toBe(false);
    expect(checkPayWeightTie(1000, 200, 0)).toBe(false);
  });
});

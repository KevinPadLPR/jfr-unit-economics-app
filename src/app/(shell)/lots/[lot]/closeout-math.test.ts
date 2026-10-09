import { describe, it, expect } from "vitest";
import { closeoutActual, closeoutProjection, daysBetween, interestOn, buildCloseoutRates, type CloseoutInputs, type CloseoutRates } from "./closeout-math";

const TODAY = "2026-10-09";

function baseInputs(overrides: Partial<CloseoutInputs> = {}): CloseoutInputs {
  return {
    status: {
      head_in: 100,
      head_current: 100,
      head_dead: 0,
      total_cost_in: 100000, // $1,000/hd
      total_weight_in: 50000, // 500 lb/hd
      weighted_arrival_date: "2026-07-01",
    },
    lot: { arrival_date: "2026-07-01", assumed_nonfeed_cog_per_day: null },
    headDaysToDate: 10000, // 100 hd x 100 days
    medCost: { processing: 0, treatment: 0, other: 0, headWithout: null },
    lotFeed: null,
    realizedAdg: null,
    weightAnchor: null,
    transferCosts: null,
    transfers: [],
    headAdjTotals: { missingOut: 0, strayIn: 0 },
    sales: [],
    ranchNonFeedDefault: null,
    ranchNonFeedRates: [],
    feedDirectFrom: null,
    headDaysAfterBoundary: null,
    feedAfterBoundary: null,
    nonFeedRanchCharge: null,
    today: TODAY,
    ...overrides,
  };
}

function baseRates(overrides: Partial<CloseoutRates> = {}): CloseoutRates {
  return {
    salePerLb: 1.5,
    adg: 2.5,
    finishWt: 1000,
    cog: 1.2,
    nonFeedCog: null,
    labor: 0.5,
    laborMode: "per_day",
    procPerHead: 20,
    docPerHead: 10,
    deathPct: 0.02,
    intPct: 0.08,
    shipDate: "2026-12-01",
    ...overrides,
  };
}

describe("daysBetween", () => {
  it("counts whole days between two local calendar dates", () => {
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
  });
  it("returns null when either side is missing", () => {
    expect(daysBetween(null, "2026-01-11")).toBeNull();
    expect(daysBetween("2026-01-01", null)).toBeNull();
  });
});

describe("interestOn", () => {
  it("charges full-period interest on cattle cost and half-period on operating cost", () => {
    // 100000 cattle, 10000 operating, 365 days, 10% -> 10000 + 500
    expect(interestOn(100000, 10000, 365, 0.1)).toBeCloseTo(10500, 6);
  });
  it("is zero with no rate, no days, or a non-positive day count", () => {
    expect(interestOn(1000, 0, 100, null)).toBe(0);
    expect(interestOn(1000, 0, 0, 0.1)).toBe(0);
    expect(interestOn(1000, 0, -5, 0.1)).toBe(0);
  });
});

describe("closeoutActual: cost-of-gain feed/non-feed boundary", () => {
  it("charges the single assumed $/lb rate with feed as a memo when no non-feed rate exists anywhere", () => {
    const inputs = baseInputs({ lotFeed: { feed_cost_usd: 500, cost_per_head_day: 0.05 } });
    const actual = closeoutActual(inputs, baseRates());
    expect(actual.feedInsideCog).toBe(true);
    expect(actual.feed).toBe(0); // feed is a memo, never added when inside COG
    expect(actual.feedLedger).toBe(500);
    expect(actual.cogSplit).toBe(false);
    // gainToDateLb with no sales/realized ADG: pure target-ADG estimate over all head-days
    expect(actual.gainToDateLb).toBeCloseTo(2.5 * 10000, 6);
    expect(actual.cog).toBeCloseTo(1.2 * 2.5 * 10000, 6);
  });

  it("splits cost of gain at the ranch feed-direct boundary: assumed rate before, non-feed + actual feed after", () => {
    const inputs = baseInputs({
      lot: { arrival_date: "2026-07-01", assumed_nonfeed_cog_per_day: 1.1 },
      feedDirectFrom: "2026-09-01",
      headDaysAfterBoundary: 3900, // 100 hd x 39 days (Sep 1 -> Oct 9)
      feedAfterBoundary: 2000,
    });
    const actual = closeoutActual(inputs, baseRates());
    expect(actual.boundaryActive).toBe(true);
    expect(actual.feedInsideCog).toBe(false);
    expect(actual.hdAfter).toBe(3900);
    expect(actual.hdBefore).toBe(10000 - 3900);
    expect(actual.feed).toBe(2000); // actual feed since the boundary, not the whole ledger
    expect(actual.nonFeedSource).toBe("lot");
    // cog = 1.2 * gainOnDays(hdBefore) + nonFeedRate(1.1) * hdAfter
    const gainOnHdBefore = (actual.gainToDateLb * actual.hdBefore) / actual.headDays;
    expect(actual.cog).toBeCloseTo(1.2 * gainOnHdBefore + 1.1 * 3900, 6);
  });

  it("falls back to the ranch default rate when the lot has no non-feed rate of its own", () => {
    const inputs = baseInputs({
      feedDirectFrom: "2026-09-01",
      headDaysAfterBoundary: 3900,
      feedAfterBoundary: 2000,
      ranchNonFeedDefault: 0.9,
    });
    const actual = closeoutActual(inputs, baseRates());
    expect(actual.nonFeedSource).toBe("ranch");
    expect(actual.nonFeedCog).toBe(0.9);
  });

  it("stays in single-rate mode (feed as a memo, no split) when the boundary date is set but no non-feed rate exists anywhere -- there is nothing to split the lot's one COG number against", () => {
    const inputs = baseInputs({
      feedDirectFrom: "2026-09-01",
      headDaysAfterBoundary: 3900,
      feedAfterBoundary: 2000,
      ranchNonFeedDefault: null,
    });
    const actual = closeoutActual(inputs, baseRates());
    expect(actual.feedInsideCog).toBe(true); // nonFeedCog is null, so feed never leaves the memo
    expect(actual.boundaryActive).toBe(false); // the split requires a non-feed rate to split onto
    expect(actual.nonFeedMissing).toBe(false); // reachable only once a non-feed rate exists but goes missing mid-life
  });

  it("flags splitUnavailable and holds the full assumed rate when the boundary date is set but the head-day split failed to load", () => {
    const inputs = baseInputs({
      lot: { arrival_date: "2026-07-01", assumed_nonfeed_cog_per_day: 1.1 },
      feedDirectFrom: "2026-09-01",
      headDaysAfterBoundary: null,
    });
    const actual = closeoutActual(inputs, baseRates());
    expect(actual.splitUnavailable).toBe(true);
    expect(actual.boundaryActive).toBe(false);
    expect(actual.cogSplit).toBe(false);
    expect(actual.cog).toBeCloseTo(1.2 * actual.gainToDateLb, 6);
  });
});

describe("closeoutActual: ADG waterfall", () => {
  it("uses the target ADG when nothing has sold and no whole-lot weighing exists", () => {
    const actual = closeoutActual(baseInputs(), baseRates({ adg: 3 }));
    expect(actual.estAdgSource).toBe("target");
    expect(actual.estAdg).toBe(3);
  });

  it("uses the whole-lot weighing ADG over the target once one exists", () => {
    const inputs = baseInputs({
      weightAnchor: { anchor_type: "weighing", anchor_date: "2026-09-10", anchor_avg_weight_lb: 750 },
    });
    // 71 days from arrival (2026-07-01) to anchor (2026-09-10); avgWtIn = 500
    const actual = closeoutActual(inputs, baseRates({ adg: 3 }));
    expect(actual.estAdgSource).toBe("weighing");
    const days = daysBetween("2026-07-01", "2026-09-10")!;
    expect(actual.estAdg).toBeCloseTo((750 - 500) / days, 6);
  });

  it("switches to the realized sale ADG only once 25% of sold head carry a pay weight", () => {
    const sales = [{ head_count: 30, total_price: 30000, net_weight_lb: 24000, gross_weight_lb: null, notes: null }];
    const below = baseInputs({
      sales,
      realizedAdg: { realized_adg: 3.2, total_gain_lb: 9000, sold_head_days: 3000, head_sold_with_weight: 7 }, // 7/30 = 23% < 25%
    });
    const actualBelow = closeoutActual(below, baseRates({ adg: 2.5 }));
    expect(actualBelow.estAdgSource).not.toBe("realized");

    const above = baseInputs({
      sales,
      realizedAdg: { realized_adg: 3.2, total_gain_lb: 9000, sold_head_days: 3000, head_sold_with_weight: 8 }, // 8/30 = 26.7% >= 25%
    });
    const actualAbove = closeoutActual(above, baseRates({ adg: 2.5 }));
    expect(actualAbove.estAdgSource).toBe("realized");
    expect(actualAbove.estAdg).toBe(3.2);
  });

  it("clamps a negative realized gain to zero cost rather than crediting it, and still flags gainClamped", () => {
    const inputs = baseInputs({
      realizedAdg: { realized_adg: -1, total_gain_lb: -500, sold_head_days: 1000, head_sold_with_weight: 0 },
    });
    const actual = closeoutActual(inputs, baseRates());
    expect(actual.gainClamped).toBe(true);
    expect(actual.rawSoldGainLb).toBe(-500);
    expect(actual.soldGainLb).toBe(0);
  });
});

describe("closeoutActual: death loss and missing head carve-outs", () => {
  it("values death loss at cost-in and carves it out of cattle-in, never adding it on top", () => {
    const inputs = baseInputs({ status: { ...baseInputs().status, head_dead: 5 } });
    const actual = closeoutActual(inputs, baseRates());
    expect(actual.avgCostIn).toBe(1000); // 100000 / 100
    expect(actual.deathLossUsd).toBe(5000);
    expect(actual.cattleLive).toBe(100000 - 5000);
  });

  it("nets strays back against missing head, both valued at cost-in", () => {
    const inputs = baseInputs({ headAdjTotals: { missingOut: 4, strayIn: 1 } });
    const actual = closeoutActual(inputs, baseRates());
    expect(actual.netMissing).toBe(3);
    expect(actual.missingLossUsd).toBe(3000);
    expect(actual.missingOut).toBe(4);
    expect(actual.strayIn).toBe(1);
  });

  it("goes negative (a net gain) when strays back exceed head ever written off", () => {
    const inputs = baseInputs({ headAdjTotals: { missingOut: 1, strayIn: 3 } });
    const actual = closeoutActual(inputs, baseRates());
    expect(actual.netMissing).toBe(-2);
    expect(actual.missingLossUsd).toBe(-2000);
  });
});

describe("closeoutActual: transfers", () => {
  it("accrues interest on an inbound transfer's basis only from the transfer date forward, not the giving lot's whole life", () => {
    const inputs = baseInputs({
      transferCosts: { transferred_in_usd: 20000, transferred_out_usd: 0, transferred_in_head: 20, transferred_out_head: 0 },
      transfers: [{ is_outbound: false, kind: "merge", head_count: 20, transfer_date: "2026-09-09", basis_total: 20000 }],
    });
    const actual = closeoutActual(inputs, baseRates({ intPct: 0.1 }));
    const days = daysBetween("2026-09-09", TODAY)!;
    expect(actual.transferInterest).toBeCloseTo(0.1 * 20000 * (days / 365), 6);
    expect(actual.totalCost).toBeGreaterThan(actual.cattleCost); // includes the transferred-in basis
  });

  it("ignores outbound transfers when accruing this lot's own transfer interest", () => {
    const inputs = baseInputs({
      transferCosts: { transferred_in_usd: 0, transferred_out_usd: 15000, transferred_in_head: 0, transferred_out_head: 15 },
      transfers: [{ is_outbound: true, kind: "merge", head_count: 15, transfer_date: "2026-09-09", basis_total: 15000 }],
    });
    const actual = closeoutActual(inputs, baseRates({ intPct: 0.1 }));
    expect(actual.transferInterest).toBe(0);
    expect(actual.transferOutUsd).toBe(15000);
  });
});

describe("closeoutProjection", () => {
  it("builds forward figures on top of closeoutActual's own output, not an independent calculation", () => {
    const inputs = baseInputs();
    const rates = baseRates();
    const actual = closeoutActual(inputs, rates);
    const proj = closeoutProjection(inputs, rates, actual);
    expect(proj.totalCost).toBeGreaterThan(actual.totalCost);
    expect(proj.totalRevenue).toBeGreaterThanOrEqual(actual.revenue);
    expect(proj.net).toBeCloseTo(proj.totalRevenue - proj.totalCost, 6);
  });

  it("weights assumed death loss still to come by the share of the feeding period remaining", () => {
    const inputs = baseInputs();
    const rates = baseRates({ deathPct: 0.1, shipDate: "2026-10-19" }); // 10 days out, ~91 days run
    const actual = closeoutActual(inputs, rates);
    const proj = closeoutProjection(inputs, rates, actual);
    const assumedTotalDeaths = 100 * 0.1;
    expect(proj.deathExposure).toBeCloseTo(10 / (actual.daysToDate + 10), 6);
    expect(proj.deathsToCome).toBeCloseTo(assumedTotalDeaths * proj.deathExposure, 6);
    expect(proj.survivingAtClose).toBeCloseTo(100 - proj.deathsToCome, 6);
  });

  it("carries the whole remaining death allowance forward when there is no ship date to weight it against", () => {
    const inputs = baseInputs();
    const rates = baseRates({ deathPct: 0.1, shipDate: null });
    const actual = closeoutActual(inputs, rates);
    const proj = closeoutProjection(inputs, rates, actual);
    expect(proj.remainingDays).toBeNull();
    expect(proj.deathExposure).toBe(1);
    expect(proj.deathsToCome).toBeCloseTo(10, 6); // the full 10% of 100 head, none yet dead
  });

  it("still projects the assumed processing cost on un-protocoled head even once some processing is on the books", () => {
    const inputs = baseInputs({ medCost: { processing: 500, treatment: 0, other: 0, headWithout: 60 } });
    const rates = baseRates({ procPerHead: 20 });
    const actual = closeoutActual(inputs, rates);
    const proj = closeoutProjection(inputs, rates, actual);
    expect(proj.headNoProtocol).toBe(60);
    expect(proj.processingFwd).toBeCloseTo(20 * 60, 6);
  });

  it("holds the doctoring projection at the assumed floor until actual plus observed burn passes it", () => {
    const inputs = baseInputs({ medCost: { processing: 0, treatment: 50, other: 0, headWithout: null } }); // tiny actual treatment
    const rates = baseRates({ docPerHead: 15 }); // floor = 15 * 100 = 1500, far above 50
    const actual = closeoutActual(inputs, rates);
    const proj = closeoutProjection(inputs, rates, actual);
    expect(proj.doctoringOnFloor).toBe(true);
    expect(proj.treatmentProj).toBeCloseTo(1500, 6);
  });
});

describe("buildCloseoutRates", () => {
  it("falls back to weight-in + days x target ADG for finish weight when no anchored projection is available", () => {
    const rates = buildCloseoutRates(
      {
        target_sale_cwt: 1.5,
        target_adg: 2.5,
        target_ship_date: "2026-12-01",
        target_days_on_feed: 90,
        arrival_date: "2026-07-01",
        assumed_cog_per_lb: 1.2,
        assumed_nonfeed_cog_per_day: null,
        labor_mode: "per_day",
        assumed_labor_per_day: 0.5,
        assumed_labor_per_head: null,
        assumed_processing_per_head: 20,
        assumed_doctoring_per_head: 10,
        assumed_death_loss_pct: 0.02,
        assumed_interest_pct: 0.08,
      },
      { head_in: 100, total_weight_in: 50000 }
    );
    expect(rates.finishWt).toBe(Math.round(500 + 90 * 2.5));
  });
});

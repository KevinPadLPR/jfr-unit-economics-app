import { listGlLots, getCostOfGain, getConfidenceGrade } from "@/lib/data/cost-of-gain";

export interface ScorecardRow {
  lot: string;
  profitCenter: string | null;
  status: string | null;
  feedType: string | null;
  locationType: string | null;
  headIn: number | null;
  headOnHand: number | null;
  avgDof: number | null;
  adgUsed: number;
  costInDollarsPerHead: number | null;
  cogAllIn: number | null;
  confidence: "H" | "M" | "L";
  useForBenchmark: boolean;
}

export function getLotScorecard(): ScorecardRow[] {
  // master_lot_schedule already carries feed_type/location_type on the same
  // row as everything else (docs/PROMPT - Master Schedule Unification.md
  // §3) — one query via listGlLots() instead of two.
  return listGlLots().map((lot) => {
    const cog = getCostOfGain(lot.lot);
    return {
      lot: lot.lot,
      profitCenter: lot.profit_center,
      status: lot.status,
      feedType: lot.feed_type,
      locationType: lot.location_type,
      headIn: lot.head_in,
      headOnHand: lot.head_on_hand,
      avgDof: lot.avg_dof,
      adgUsed: cog?.adgUsed ?? lot.target_adg ?? 0,
      costInDollarsPerHead: lot.cost_in_dollars_per_head,
      cogAllIn: cog?.cogAllIn ?? null,
      confidence: getConfidenceGrade(lot.lot),
      useForBenchmark: (lot.use_for_benchmark ?? "").toLowerCase() === "yes",
    };
  });
}

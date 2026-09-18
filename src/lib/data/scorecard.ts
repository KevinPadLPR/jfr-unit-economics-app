import { getDb } from "@/lib/db";
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

interface ScheduleRow {
  lot: string;
  feed_type: string | null;
  location_type: string | null;
}

export function getLotScorecard(): ScorecardRow[] {
  const db = getDb();
  const schedule = db.prepare(`SELECT lot, feed_type, location_type FROM gl_master_lot_schedule`).all() as unknown as ScheduleRow[];
  const scheduleByLot = new Map(schedule.map((s) => [s.lot, s]));

  return listGlLots().map((lot) => {
    const cog = getCostOfGain(lot.lot);
    const sched = scheduleByLot.get(lot.lot);
    return {
      lot: lot.lot,
      profitCenter: lot.profit_center,
      status: lot.status,
      feedType: sched?.feed_type ?? null,
      locationType: sched?.location_type ?? null,
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

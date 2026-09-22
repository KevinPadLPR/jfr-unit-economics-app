import { getDb } from "@/lib/db";
import { sumReportAmount, getDirectCostBreakdown, FEED_FORAGE_LINES, HEALTH_LINES, DEATH_LOSS_LINE, LRP_LINE } from "@/lib/data/gl";
import { getLotAttrsRollup, getCrosswalkInfo } from "@/lib/data/lot-attrs";
import type { Provenance } from "@/lib/theme/colors";

export interface GlLotSummaryRow {
  lot: string;
  profit_center: string | null;
  status: string | null;
  production_year: number | null;
  date_in: string | null;
  last_activity: string | null;
  books_through: string | null;
  head_in: number | null;
  head_sold: number | null;
  head_dead: number | null;
  head_transferred_out: number | null;
  head_on_hand: number | null;
  head_days: number | null;
  avg_dof: number | null;
  lbs_in: number | null;
  avg_wt_in: number | null;
  cost_in_dollars: number | null;
  cost_in_dollars_per_head: number | null;
  target_adg: number | null;
  market_dollars_per_cwt: number | null;
  target_out_date: string | null;
  use_for_benchmark: string | null;
  // Columns that used to live on gl_lot_master / gl_master_lot_schedule /
  // lot_attrs_app_cohort, now on this one row (docs/PROMPT - Master Schedule
  // Unification.md §1) — folded in here so callers like scorecard.ts,
  // lot-sheet.ts and the Lots page don't need a second query.
  feed_type: string | null;
  location_type: string | null;
  state: string | null;
  interest: number | null;
  death_loss: number | null;
  slide: number | null;
  premium: number | null;
  action: string | null;
  notes: string | null;
}

export function getGlLotSummary(lot: string): GlLotSummaryRow | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM master_lot_schedule WHERE lot = ?`).get(lot) as GlLotSummaryRow | undefined;
}

export function listGlLots(): GlLotSummaryRow[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM master_lot_schedule ORDER BY status, lot`).all() as unknown as GlLotSummaryRow[];
}

export interface CostOfGainResult {
  lot: string;
  headDays: number;
  adgUsed: number;
  adgProvenance: Provenance;
  adgSourceDetail: string;
  poundsGained: number;
  feedForage: number;
  health: number;
  laborOverhead: number;
  operating: number;
  deathLoss: number;
  lrp: number;
  allIn: number;
  cogFeed: number | null;
  cogOper: number | null;
  cogAllIn: number | null;
  costPerHeadDayOperating: number | null;
  grazingSummerNativeBooked: boolean;
  costBreakdown: { report_line: string; total: number }[];
}

/**
 * Life-to-date Cost of Gain, all three conventions. Formulas match
 * Template/builder/add_analysis_sheets.py exactly (see
 * Context - Dashboard Web App Handoff.md §6 and C.1 in the data-map notes) —
 * "total dollars first, divide at the end," never averaging $/lb across lots.
 */
export function getCostOfGain(lot: string): CostOfGainResult | undefined {
  const summary = getGlLotSummary(lot);
  if (!summary) return undefined;

  const headDays = summary.head_days ?? 0;
  const attrs = getLotAttrsRollup(lot, summary.target_adg ?? 0);
  const poundsGained = headDays * attrs.adgUsed;

  const feedForage = sumReportAmount(lot, { reportLines: FEED_FORAGE_LINES });
  const health = sumReportAmount(lot, { reportLines: HEALTH_LINES });
  const laborOverhead = sumReportAmount(lot, { reportSection: "Indirect" });
  const operating = feedForage + health + laborOverhead;
  const deathLoss = sumReportAmount(lot, { reportLines: [DEATH_LOSS_LINE] });
  const lrp = sumReportAmount(lot, { reportLines: [LRP_LINE] });
  const allIn = operating + deathLoss + lrp;
  const grazingSummerNative = sumReportAmount(lot, { reportLines: ["Grazing - Summer Native"] });

  const safeDiv = (n: number, d: number) => (d > 0 ? n / d : null);

  return {
    lot,
    headDays,
    adgUsed: attrs.adgUsed,
    adgProvenance: attrs.adgProvenance,
    adgSourceDetail: attrs.adgSourceDetail,
    poundsGained,
    feedForage,
    health,
    laborOverhead,
    operating,
    deathLoss,
    lrp,
    allIn,
    cogFeed: safeDiv(feedForage, poundsGained),
    cogOper: safeDiv(operating, poundsGained),
    cogAllIn: safeDiv(allIn, poundsGained),
    costPerHeadDayOperating: safeDiv(operating, headDays),
    grazingSummerNativeBooked: grazingSummerNative !== 0,
    costBreakdown: getDirectCostBreakdown(lot),
  };
}

export type ConfidenceGrade = "H" | "M" | "L";

export function getConfidenceGrade(lot: string): ConfidenceGrade {
  const attrs = getLotAttrsRollup(lot, 0);
  const crosswalk = getCrosswalkInfo(lot);
  if (!attrs.hasAppData) return "L";
  if (crosswalk.decisionNeeded || attrs.anyWeightStale) return "M";
  return "H";
}

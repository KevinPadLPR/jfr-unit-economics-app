import { createClient } from "@/lib/supabase/server";
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

export async function getGlLotSummary(lot: string): Promise<GlLotSummaryRow | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ue_master_lot_schedule")
    .select("*")
    .eq("lot", lot)
    .maybeSingle();
  if (error) throw error;
  return (data as GlLotSummaryRow) ?? undefined;
}

export async function listGlLots(): Promise<GlLotSummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ue_master_lot_schedule")
    .select("*")
    .order("status", { ascending: true })
    .order("lot", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GlLotSummaryRow[];
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
export async function getCostOfGain(lot: string): Promise<CostOfGainResult | undefined> {
  const summary = await getGlLotSummary(lot);
  if (!summary) return undefined;

  const headDays = summary.head_days ?? 0;
  const attrs = await getLotAttrsRollup(lot, summary.target_adg ?? 0);
  const poundsGained = headDays * attrs.adgUsed;

  const [feedForage, health, laborOverhead, deathLoss, lrp, grazingSummerNative, costBreakdown] = await Promise.all([
    sumReportAmount(lot, { reportLines: FEED_FORAGE_LINES }),
    sumReportAmount(lot, { reportLines: HEALTH_LINES }),
    sumReportAmount(lot, { reportSection: "Indirect" }),
    sumReportAmount(lot, { reportLines: [DEATH_LOSS_LINE] }),
    sumReportAmount(lot, { reportLines: [LRP_LINE] }),
    sumReportAmount(lot, { reportLines: ["Grazing - Summer Native"] }),
    getDirectCostBreakdown(lot),
  ]);
  const operating = feedForage + health + laborOverhead;
  const allIn = operating + deathLoss + lrp;

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
    costBreakdown,
  };
}

export type ConfidenceGrade = "H" | "M" | "L";

export async function getConfidenceGrade(lot: string): Promise<ConfidenceGrade> {
  const [attrs, crosswalk] = await Promise.all([getLotAttrsRollup(lot, 0), getCrosswalkInfo(lot)]);
  if (!attrs.hasAppData) return "L";
  if (crosswalk.decisionNeeded || attrs.anyWeightStale) return "M";
  return "H";
}

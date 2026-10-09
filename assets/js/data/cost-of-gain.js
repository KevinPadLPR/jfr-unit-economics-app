/** Direct port of src/lib/data/cost-of-gain.ts. */
import { supabase } from "../supabase-client.js";
import { sumReportAmount, getDirectCostBreakdown, FEED_FORAGE_LINES, HEALTH_LINES, DEATH_LOSS_LINE, LRP_LINE } from "./gl.js";
import { getLotAttrsRollup, getCrosswalkInfo } from "./lot-attrs.js";

export async function getGlLotSummary(lot) {
  const { data, error } = await supabase.from("ue_master_lot_schedule").select("*").eq("lot", lot).maybeSingle();
  if (error) throw error;
  return data ?? undefined;
}

export async function listGlLots() {
  const { data, error } = await supabase
    .from("ue_master_lot_schedule")
    .select("*")
    .order("status", { ascending: true })
    .order("lot", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Life-to-date Cost of Gain, all three conventions. Formulas match
 * Template/builder/add_analysis_sheets.py exactly (see
 * Context - Dashboard Web App Handoff.md §6 and C.1 in the data-map notes) --
 * "total dollars first, divide at the end," never averaging $/lb across lots.
 */
export async function getCostOfGain(lot) {
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

  const safeDiv = (n, d) => (d > 0 ? n / d : null);

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

export async function getConfidenceGrade(lot) {
  const [attrs, crosswalk] = await Promise.all([getLotAttrsRollup(lot, 0), getCrosswalkInfo(lot)]);
  if (!attrs.hasAppData) return "L";
  if (crosswalk.decisionNeeded || attrs.anyWeightStale) return "M";
  return "H";
}

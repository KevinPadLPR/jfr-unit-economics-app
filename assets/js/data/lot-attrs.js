/** Direct port of src/lib/data/lot-attrs.ts. */
import { supabase } from "../supabase-client.js";

/**
 * `ue_master_lot_schedule` is GL-lot-grain already -- the Excel notebook does
 * the head-weighted rollup across app cohorts (sub-lots like "37X-1") itself,
 * before syncing, so this is a single-row read, not a rollup computed here.
 * Falls back to the flat, assumed Target ADG when a lot has no app data at
 * all (~5 of 14 real lots / 28% of head, permanently -- see
 * Context - Dashboard Web App Handoff.md §5b).
 */
export async function getLotAttrsRollup(glLot, fallbackTargetAdg) {
  const { data: row, error } = await supabase
    .from("ue_master_lot_schedule")
    .select("has_app_data, adg_used, adg_source, projected_current_weight_app, weight_stale_over_60d")
    .eq("lot", glLot)
    .maybeSingle();
  if (error) throw error;

  if (!row || (row.has_app_data ?? "").toLowerCase() !== "yes") {
    return {
      hasAppData: false,
      adgUsed: fallbackTargetAdg,
      adgProvenance: "assumed",
      adgSourceDetail: "Using our target daily gain for this lot — no field weigh-ins yet",
      projectedCurrentWeight: null,
      anyWeightStale: false,
    };
  }

  const source = row.adg_source ?? "assumed";
  const detailBySource = {
    realized: "Based on actual field weigh-ins",
    realized_thin: "Based on actual field weigh-ins (small sample so far)",
    mixed: "Mix of actual weigh-ins and our target assumption",
    assumed: "Using our target daily gain for now — no weigh-ins yet",
  };

  return {
    hasAppData: true,
    adgUsed: row.adg_used ?? fallbackTargetAdg,
    adgProvenance: source === "assumed" ? "assumed" : "modeled",
    adgSourceDetail: detailBySource[source] ?? `ADG source: ${source}`,
    projectedCurrentWeight: row.projected_current_weight_app,
    anyWeightStale: row.weight_stale_over_60d === "YES",
  };
}

export async function getCrosswalkInfo(glLot) {
  const { data: row, error } = await supabase
    .from("ue_lot_crosswalk")
    .select("match_type, decision_needed, note")
    .eq("gl_lot", glLot)
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  return {
    matchType: row?.match_type ?? null,
    decisionNeeded: row?.decision_needed === "YES",
    note: row?.note ?? null,
  };
}

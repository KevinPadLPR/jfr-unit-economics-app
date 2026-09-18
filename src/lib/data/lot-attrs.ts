import { getDb } from "@/lib/db";
import type { Provenance } from "@/lib/theme/colors";

export interface LotAttrsRollup {
  hasAppData: boolean;
  adgUsed: number;
  adgProvenance: Provenance;
  adgSourceDetail: string;
  weightedArrivalDate: string | null;
  projectedCurrentWeight: number | null;
  anyWeightStale: boolean;
  cohortCount: number;
}

/**
 * App-native cattle data is cohort-grain (sub-lots like "37X-1") while the GL
 * lot is coarser ("37-X"). lot_attrs_app_cohort.lot already carries the GL
 * lot for each cohort row (Ryan's ETL applied the crosswalk upstream), so we
 * just group by it here — head-weighted average for ADG/weight, per the same
 * convention used in Template/builder/add_analysis_sheets.py's tbl_LotAttrs.
 * Falls back to the flat, assumed Target ADG when a lot has no app rows at
 * all (~5 of 14 real lots / 28% of head, permanently — see
 * Context - Dashboard Web App Handoff.md §5b).
 */
export function getLotAttrsRollup(glLot: string, fallbackTargetAdg: number): LotAttrsRollup {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT app_lot, head_current, adg_used, adg_source, weighted_arrival_date,
              projected_current_weight, weight_stale_over_60d
       FROM lot_attrs_app_cohort
       WHERE lot = ?`
    )
    .all(glLot) as {
    app_lot: string;
    head_current: number | null;
    adg_used: number | null;
    adg_source: string | null;
    weighted_arrival_date: string | null;
    projected_current_weight: number | null;
    weight_stale_over_60d: string | null;
  }[];

  if (rows.length === 0) {
    return {
      hasAppData: false,
      adgUsed: fallbackTargetAdg,
      adgProvenance: "assumed",
      adgSourceDetail: "No app data for this lot — flat Target ADG from Lot Master",
      weightedArrivalDate: null,
      projectedCurrentWeight: null,
      anyWeightStale: false,
      cohortCount: 0,
    };
  }

  const weight = (r: (typeof rows)[number]) => (r.head_current && r.head_current > 0 ? r.head_current : 1);
  const totalWeight = rows.reduce((s, r) => s + weight(r), 0);

  const adgUsed = rows.reduce((s, r) => s + (r.adg_used ?? fallbackTargetAdg) * weight(r), 0) / totalWeight;
  const projectedCurrentWeight =
    rows.reduce((s, r) => s + (r.projected_current_weight ?? 0) * weight(r), 0) / totalWeight;

  const allRealized = rows.every((r) => (r.adg_source ?? "").startsWith("realized"));
  const anyWeightStale = rows.some((r) => r.weight_stale_over_60d === "YES");
  const latestArrival = rows
    .map((r) => r.weighted_arrival_date)
    .filter((d): d is string => !!d)
    .sort()
    .pop();

  return {
    hasAppData: true,
    adgUsed,
    adgProvenance: allRealized ? "modeled" : "assumed",
    adgSourceDetail: allRealized
      ? `Realized ADG from ${rows.length} app cohort(s), head-weighted`
      : `Mixed realized/assumed ADG across ${rows.length} app cohort(s)`,
    weightedArrivalDate: latestArrival ?? null,
    projectedCurrentWeight,
    anyWeightStale,
    cohortCount: rows.length,
  };
}

export interface CrosswalkInfo {
  matchType: string | null;
  decisionNeeded: boolean;
  note: string | null;
}

export function getCrosswalkInfo(glLot: string): CrosswalkInfo {
  const db = getDb();
  const row = db
    .prepare(`SELECT match_type, decision_needed, note FROM lot_crosswalk WHERE gl_lot = ? LIMIT 1`)
    .get(glLot) as { match_type: string | null; decision_needed: string | null; note: string | null } | undefined;

  return {
    matchType: row?.match_type ?? null,
    decisionNeeded: row?.decision_needed === "YES",
    note: row?.note ?? null,
  };
}

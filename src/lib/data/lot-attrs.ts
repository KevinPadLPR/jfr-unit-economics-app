import { getDb } from "@/lib/db";
import type { Provenance } from "@/lib/theme/colors";

export interface LotAttrsRollup {
  hasAppData: boolean;
  adgUsed: number;
  adgProvenance: Provenance;
  adgSourceDetail: string;
  projectedCurrentWeight: number | null;
  anyWeightStale: boolean;
}

/**
 * `master_lot_schedule` is GL-lot-grain already — the Excel notebook now does
 * the head-weighted rollup across app cohorts (sub-lots like "37X-1") itself,
 * before syncing, so this is a single-row read, not a rollup computed here.
 * See docs/PROMPT - Master Schedule Unification.md §2 — this used to query
 * cohort-grain `lot_attrs_app_cohort` and average in JS; that table is
 * retired, replaced by the `has_app_data`/`adg_used`/`adg_source` columns
 * already on the one `master_lot_schedule` row for this lot.
 * Falls back to the flat, assumed Target ADG when a lot has no app data at
 * all (~5 of 14 real lots / 28% of head, permanently — see
 * Context - Dashboard Web App Handoff.md §5b).
 */
export function getLotAttrsRollup(glLot: string, fallbackTargetAdg: number): LotAttrsRollup {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT has_app_data, adg_used, adg_source, projected_current_weight_app, weight_stale_over_60d
       FROM master_lot_schedule
       WHERE lot = ?`
    )
    .get(glLot) as {
    has_app_data: string | null;
    adg_used: number | null;
    adg_source: string | null;
    projected_current_weight_app: number | null;
    weight_stale_over_60d: string | null;
  } | undefined;

  if (!row || (row.has_app_data ?? "").toLowerCase() !== "yes") {
    return {
      hasAppData: false,
      adgUsed: fallbackTargetAdg,
      adgProvenance: "assumed",
      adgSourceDetail: "No app data for this lot — flat Target ADG from Master Lot Schedule",
      projectedCurrentWeight: null,
      anyWeightStale: false,
    };
  }

  const source = row.adg_source ?? "assumed";
  const detailBySource: Record<string, string> = {
    realized: "Realized ADG from app cohort(s), head-weighted",
    realized_thin: "Realized ADG from app cohort(s), head-weighted (thin sample)",
    mixed: "Mixed realized/assumed ADG across app cohort(s), head-weighted",
    assumed: "App data present but not yet realized — assumed ADG",
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

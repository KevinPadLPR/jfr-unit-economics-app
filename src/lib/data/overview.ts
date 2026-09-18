import { listGlLots } from "@/lib/data/cost-of-gain";
import { getMarketPosition } from "@/lib/data/market-position";
import { getCrosswalkInfo, getLotAttrsRollup } from "@/lib/data/lot-attrs";
import { getDb } from "@/lib/db";

/**
 * The Position Desk spec's "front-page twelve" (Context - Dashboard Web App
 * Handoff.md §4): Available cash, LOC available, Head owned, Pounds owned,
 * Cost basis, Marked value, Unrealized position, Hedge coverage %, Forecast
 * margin, Week-7 cash low, Lots needing action, Exceptions.
 *
 * This snapshot has no accounting cash-position feed at all (no bank/LOC
 * balances anywhere in the GL export or the Supabase app), and it's a single
 * point-in-time snapshot rather than a running weekly series, so week-over-
 * week deltas and a cash forecast aren't real numbers yet either. Per Rule 2
 * ("never a silently estimated number"), those tiles are shown as an
 * explicit dash with a reason — never omitted, never guessed.
 */

export interface OverviewMetric {
  key: string;
  label: string;
  value: string | null;
  provenance: "measured" | "sourced" | "modeled" | "assumed" | null;
  unavailableReason?: string;
}

export function getOverviewMetrics() {
  const lots = listGlLots();
  const openLots = lots.filter((l) => (l.status ?? "").toLowerCase() === "open");
  const marketPosition = getMarketPosition();

  let headOwned = 0;
  let poundsOwned = 0;
  for (const lot of openLots) {
    const attrs = getLotAttrsRollup(lot.lot, lot.target_adg ?? 0);
    const head = lot.head_on_hand ?? 0;
    const weight = attrs.projectedCurrentWeight ?? lot.avg_wt_in ?? 0;
    headOwned += head;
    poundsOwned += head * weight;
  }

  const costBasis = openLots.reduce((s, l) => s + (l.cost_in_dollars ?? 0), 0);
  const markedValue = marketPosition.reduce((s, r) => s + (r.markedValue ?? 0), 0);
  const unrealized = markedValue - costBasis;

  const db = getDb();
  const confirmedPositions = db
    .prepare(`SELECT COUNT(*) AS n FROM positions WHERE notes NOT LIKE '%VERIFICATION ROW%' OR notes IS NULL`)
    .get() as { n: number };

  const today = new Date().toISOString().slice(0, 10);
  const lotsNeedingAction = openLots.filter((l) => l.target_out_date && l.target_out_date < today).length;

  const staleWeightLots = openLots.filter((l) => getLotAttrsRollup(l.lot, 0).anyWeightStale).length;
  const decisionNeededLots = openLots.filter((l) => getCrosswalkInfo(l.lot).decisionNeeded).length;
  const unbookedSummerGrazing = openLots.filter((l) => (l.production_year ?? 0) >= 2026).length; // known, dated gap
  const exceptions = staleWeightLots + decisionNeededLots;

  return {
    computed: [
      { key: "head_owned", label: "Head owned", value: `${headOwned.toLocaleString("en-US")}`, provenance: "measured" as const },
      { key: "pounds_owned", label: "Pounds owned (est.)", value: `${Math.round(poundsOwned).toLocaleString("en-US")} lb`, provenance: "modeled" as const },
      { key: "cost_basis", label: "Cost basis (open lots)", value: formatUsd(costBasis), provenance: "measured" as const },
      { key: "marked_value", label: "Marked value", value: formatUsd(markedValue), provenance: "modeled" as const },
      { key: "unrealized", label: "Unrealized position", value: formatUsd(unrealized), provenance: "modeled" as const },
      {
        key: "hedge_coverage",
        label: "Hedge coverage",
        value: confirmedPositions.n === 0 ? "0% — no confirmed positions" : `${confirmedPositions.n} confirmed position(s)`,
        provenance: "measured" as const,
      },
      { key: "lots_needing_action", label: "Lots needing action", value: `${lotsNeedingAction}`, provenance: "modeled" as const },
      { key: "exceptions", label: "Exceptions", value: `${exceptions}`, provenance: "measured" as const },
    ] satisfies OverviewMetric[],
    unavailable: [
      { key: "available_cash", label: "Available cash", value: null, provenance: null, unavailableReason: "No bank/cash-position feed in this data snapshot yet." },
      { key: "loc_available", label: "LOC available", value: null, provenance: null, unavailableReason: "No line-of-credit feed in this data snapshot yet." },
      { key: "week7_cash_low", label: "Week-7 cash low", value: null, provenance: null, unavailableReason: "Requires a weekly cash forecast — not built yet (Position Desk Phase 2)." },
    ] satisfies OverviewMetric[],
    caveats: {
      unbookedSummerGrazingLots: unbookedSummerGrazing,
    },
  };
}

function formatUsd(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

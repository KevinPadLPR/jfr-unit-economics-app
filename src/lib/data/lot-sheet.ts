import { getDb } from "@/lib/db";
import { getGlLotSummary, getCostOfGain } from "@/lib/data/cost-of-gain";
import { getLatestFeederSettle } from "@/lib/data/market-position";
import { getLotAttrsRollup, getCrosswalkInfo } from "@/lib/data/lot-attrs";
import { sumReportAmount } from "@/lib/data/gl";

export interface HeadMovementRow {
  date: string;
  movement_type: string;
  head: number;
  lbs: number | null;
  amount: number | null;
  dollars_per_head: number | null;
  notes: string | null;
}

export function getHeadMovements(lot: string): HeadMovementRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT date, movement_type, head, lbs, amount, dollar_per_head AS dollars_per_head, notes
       FROM gl_head_movements WHERE lot = ? ORDER BY date`
    )
    .all(lot) as unknown as HeadMovementRow[];
}

export interface ExpenseLine {
  label: string;
  total: number;
  perHead: number | null;
  perCwt: number | null;
}

export interface LotSheet {
  lot: string;
  summary: NonNullable<ReturnType<typeof getGlLotSummary>>;
  scheduleFeedType: string | null;
  scheduleLocationType: string | null;
  scheduleState: string | null;
  cattleIn: HeadMovementRow[];
  cattleOut: HeadMovementRow[];
  deads: HeadMovementRow[];
  expenses: {
    direct: ExpenseLine[];
    directTotal: ExpenseLine;
    general: ExpenseLine;
    total: ExpenseLine;
  };
  revenue: number;
  markedValueOnHand: number | null;
  outstandingCost: number;
  estimatedPL: number;
  crosswalk: ReturnType<typeof getCrosswalkInfo>;
  hasAppData: boolean;
}

export function getLotSheet(lot: string): LotSheet | undefined {
  const summary = getGlLotSummary(lot);
  if (!summary) return undefined;

  // feed_type/location_type/state now live on the same master_lot_schedule
  // row as `summary` — no second query (docs/PROMPT - Master Schedule
  // Unification.md §3).
  const movements = getHeadMovements(lot);
  const cattleIn = movements.filter((m) => ["Purchase", "Transfer In"].includes(m.movement_type));
  const cattleOut = movements.filter((m) => ["Sold", "Transfer Out"].includes(m.movement_type));
  const deads = movements.filter((m) => m.movement_type === "Died");

  const cog = getCostOfGain(lot);
  const headIn = summary.head_in ?? 0;
  const lbsIn = summary.lbs_in ?? 0;
  const cwtIn = lbsIn / 100;

  const toLine = (label: string, total: number): ExpenseLine => ({
    label,
    total,
    perHead: headIn > 0 ? total / headIn : null,
    perCwt: cwtIn > 0 ? total / cwtIn : null,
  });

  const direct = (cog?.costBreakdown ?? []).map((r) => toLine(r.report_line, r.total));
  const directTotal = toLine("Total Direct Expense", sumOf(direct));
  const general = toLine("General / Overhead (Indirect)", cog?.laborOverhead ?? 0);
  const total = toLine("Total All Expense", directTotal.total + general.total);

  const revenue = sumReportAmount(lot, { reportSection: "Revenue" });

  const attrs = getLotAttrsRollup(lot, summary.target_adg ?? 0);
  const settle = getLatestFeederSettle();
  const isOpen = (summary.status ?? "").toLowerCase() === "open" && (summary.head_on_hand ?? 0) > 0;
  const markedValueOnHand =
    isOpen && settle
      ? ((attrs.projectedCurrentWeight ?? summary.avg_wt_in ?? 0) / 100) * settle.settle * (summary.head_on_hand ?? 0)
      : null;

  // master_lot_schedule.cost_in_dollars is already the full LTD cost mapped to this
  // lot (Purchased Cattle + Direct + Indirect, WIP+COGS twins unioned) — the
  // expense breakdown above is Direct/Indirect detail for display, not a
  // second cost to add on top.
  const outstandingCost = summary.cost_in_dollars ?? 0;
  const estimatedPL = revenue + (markedValueOnHand ?? 0) - outstandingCost;

  return {
    lot,
    summary,
    scheduleFeedType: summary.feed_type,
    scheduleLocationType: summary.location_type,
    scheduleState: summary.state,
    cattleIn,
    cattleOut,
    deads,
    expenses: { direct, directTotal, general, total },
    revenue,
    markedValueOnHand,
    outstandingCost,
    estimatedPL,
    crosswalk: getCrosswalkInfo(lot),
    hasAppData: attrs.hasAppData,
  };
}

function sumOf(lines: ExpenseLine[]) {
  return lines.reduce((s, l) => s + l.total, 0);
}

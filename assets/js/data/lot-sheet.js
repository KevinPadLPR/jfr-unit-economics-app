/** Direct port of src/lib/data/lot-sheet.ts. */
import { supabase } from "../supabase-client.js";
import { getGlLotSummary, getCostOfGain } from "./cost-of-gain.js";
import { getLatestFeederSettle } from "./market-position.js";
import { getLotAttrsRollup, getCrosswalkInfo } from "./lot-attrs.js";
import { sumReportAmount } from "./gl.js";

export async function getHeadMovements(lot) {
  const { data, error } = await supabase
    .from("ue_gl_head_movements")
    .select("date, movement_type, head, lbs, amount, dollar_per_head, notes")
    .eq("lot", lot)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    date: r.date,
    movement_type: r.movement_type,
    head: r.head,
    lbs: r.lbs,
    amount: r.amount,
    dollars_per_head: r.dollar_per_head,
    notes: r.notes,
  }));
}

/**
 * Every dollar and every head movement on this lot, in one chronological
 * ledger. Cattle movements (Purchase/Transfer In/Sold/Transfer Out/Died)
 * come from ue_gl_head_movements (the Cattle Inventory report). Direct +
 * Indirect cost postings (Feed, Medicine, overhead allocations, ...) come
 * from ue_gl_transactions -- deliberately excluding that table's own
 * 'Cattle' (Purchased Cattle) and 'Revenue' (Cattle Sales, hedging,
 * insurance) report sections, since those are the *same* purchase/sale
 * events already shown via the movement rows, from a different report --
 * including both would show two different dollar figures for what looks
 * like one event and nothing here explains why they differ.
 */
export async function getLotActivityLedger(lot) {
  const [movements, { data: expenseRows, error }] = await Promise.all([
    getHeadMovements(lot),
    supabase
      .from("ue_gl_transactions")
      .select("date, report_line, report_amount, notation")
      .eq("lot", lot)
      .in("report_section", ["Direct", "Indirect"]),
  ]);
  if (error) throw error;

  const rows = [
    ...movements.map((m) => ({
      date: m.date,
      category: "movement",
      type: m.movement_type,
      head: m.head,
      weight: m.lbs,
      amount: m.amount,
      dollarsPerHead: m.dollars_per_head,
      notes: m.notes,
    })),
    ...(expenseRows ?? []).map((e) => ({
      date: e.date,
      category: "expense",
      type: e.report_line,
      head: null,
      weight: null,
      amount: e.report_amount,
      dollarsPerHead: null,
      notes: e.notation,
    })),
  ];

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function sumOf(lines) {
  return lines.reduce((s, l) => s + l.total, 0);
}

export async function getLotSheet(lot) {
  const summary = await getGlLotSummary(lot);
  if (!summary) return undefined;

  // feed_type/location_type/state now live on the same ue_master_lot_schedule
  // row as `summary` -- no second query.
  const [activity, cog, revenue, attrs, settle, crosswalk] = await Promise.all([
    getLotActivityLedger(lot),
    getCostOfGain(lot),
    sumReportAmount(lot, { reportSection: "Revenue" }),
    getLotAttrsRollup(lot, summary.target_adg ?? 0),
    getLatestFeederSettle(),
    getCrosswalkInfo(lot),
  ]);

  const headIn = summary.head_in ?? 0;
  const lbsIn = summary.lbs_in ?? 0;
  const cwtIn = lbsIn / 100;

  const toLine = (label, total) => ({
    label,
    total,
    perHead: headIn > 0 ? total / headIn : null,
    perCwt: cwtIn > 0 ? total / cwtIn : null,
  });

  const direct = (cog?.costBreakdown ?? []).map((r) => toLine(r.report_line, r.total));
  const directTotal = toLine("Total Direct Expense", sumOf(direct));
  const general = toLine("General / Overhead (Indirect)", cog?.laborOverhead ?? 0);
  const total = toLine("Total All Expense", directTotal.total + general.total);

  const isOpen = (summary.status ?? "").toLowerCase() === "open" && (summary.head_on_hand ?? 0) > 0;
  const markedValueOnHand =
    isOpen && settle
      ? ((attrs.projectedCurrentWeight ?? summary.avg_wt_in ?? 0) / 100) * settle.settle * (summary.head_on_hand ?? 0)
      : null;

  // ue_master_lot_schedule.cost_in_dollars is already the full LTD cost
  // mapped to this lot (Purchased Cattle + Direct + Indirect, WIP+COGS twins
  // unioned) -- the expense breakdown above is Direct/Indirect detail for
  // display, not a second cost to add on top.
  const outstandingCost = summary.cost_in_dollars ?? 0;
  const estimatedPL = revenue + (markedValueOnHand ?? 0) - outstandingCost;

  return {
    lot,
    summary,
    scheduleFeedType: summary.feed_type,
    scheduleLocationType: summary.location_type,
    scheduleState: summary.state,
    activity,
    expenses: { direct, directTotal, general, total },
    revenue,
    markedValueOnHand,
    outstandingCost,
    estimatedPL,
    crosswalk,
    hasAppData: attrs.hasAppData,
  };
}

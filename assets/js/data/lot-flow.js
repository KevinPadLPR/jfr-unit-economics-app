/** Direct port of src/lib/data/lot-flow.ts. */
import { supabase } from "../supabase-client.js";

/**
 * Life-to-date cattle flow for one lot: where the head came from (Purchased /
 * Born / Transfer In) and where they've gone (Sold / Died / Transfer Out /
 * still on hand), sized by head count. Built from ue_gl_lot_head_flow (a
 * Supabase view, already summed life-to-date across every month on record
 * for this lot), which is reconciled to the Cattle Inventory report to the
 * penny for every lot -- not the app-only "source ranch" detail some lots
 * also have (that only covers a minority of lots; this covers all of them
 * the same way). Categories with zero head are omitted so the chart never
 * shows an empty flow.
 */
export async function getLotFlow(lot, headOnHand) {
  const { data: totals, error } = await supabase
    .from("ue_gl_lot_head_flow")
    .select("purchased, born, transfer_in, sold, died, transfer_out")
    .eq("lot", lot)
    .maybeSingle();
  if (error) throw error;
  if (!totals) return undefined;

  const isPositive = (pair) => pair[1] > 0;
  const inflows = [
    ["Purchased", totals.purchased],
    ["Born", totals.born],
    ["Transfer In", totals.transfer_in],
  ].filter(isPositive);
  const outflows = [
    ["Sold", totals.sold],
    ["Died", totals.died],
    ["Transfer Out", totals.transfer_out],
    ["Still On Feed", headOnHand > 0 ? headOnHand : 0],
  ].filter(isPositive);

  if (inflows.length === 0 || outflows.length === 0) return undefined;

  const nodes = [...inflows.map(([name]) => ({ name })), { name: lot }, ...outflows.map(([name]) => ({ name }))];
  const lotIndex = inflows.length;
  const links = [
    ...inflows.map(([, value], i) => ({ source: i, target: lotIndex, value })),
    ...outflows.map(([, value], i) => ({ source: lotIndex, target: lotIndex + 1 + i, value })),
  ];

  return { nodes, links };
}

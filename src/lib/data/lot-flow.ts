import { getDb } from "@/lib/db";

export interface LotFlowNode {
  name: string;
}

export interface LotFlowLink {
  source: number;
  target: number;
  value: number;
}

export interface LotFlow {
  nodes: LotFlowNode[];
  links: LotFlowLink[];
}

interface Totals {
  purchased: number;
  born: number;
  transfer_in: number;
  sold: number;
  died: number;
  transfer_out: number;
}

/**
 * Life-to-date cattle flow for one lot: where the head came from (Purchased /
 * Born / Transfer In) and where they've gone (Sold / Died / Transfer Out /
 * still on hand), sized by head count. Built entirely from gl_head_days,
 * which is reconciled to the Cattle Inventory report to the penny for every
 * lot — not the app-only "source ranch" detail some lots also have (that
 * only covers a minority of lots; this covers all of them the same way).
 * Categories with zero head are omitted so the chart never shows an empty
 * flow.
 */
export function getLotFlow(lot: string, headOnHand: number): LotFlow | undefined {
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(purchased),0) AS purchased, COALESCE(SUM(born),0) AS born,
              COALESCE(SUM(transfer_in),0) AS transfer_in, COALESCE(SUM(sold),0) AS sold,
              COALESCE(SUM(died),0) AS died, COALESCE(SUM(transfer_out),0) AS transfer_out
       FROM gl_head_days WHERE lot = ?`
    )
    .get(lot) as Totals | undefined;
  if (!totals) return undefined;

  const isPositive = (pair: [string, number]): pair is [string, number] => pair[1] > 0;
  const inflows: [string, number][] = (
    [
      ["Purchased", totals.purchased],
      ["Born", totals.born],
      ["Transfer In", totals.transfer_in],
    ] satisfies [string, number][]
  ).filter(isPositive);
  const outflows: [string, number][] = (
    [
      ["Sold", totals.sold],
      ["Died", totals.died],
      ["Transfer Out", totals.transfer_out],
      ["Still On Feed", headOnHand > 0 ? headOnHand : 0],
    ] satisfies [string, number][]
  ).filter(isPositive);

  if (inflows.length === 0 || outflows.length === 0) return undefined;

  const nodes: LotFlowNode[] = [...inflows.map(([name]) => ({ name })), { name: lot }, ...outflows.map(([name]) => ({ name }))];
  const lotIndex = inflows.length;
  const links: LotFlowLink[] = [
    ...inflows.map(([, value], i) => ({ source: i, target: lotIndex, value })),
    ...outflows.map(([, value], i) => ({ source: lotIndex, target: lotIndex + 1 + i, value })),
  ];

  return { nodes, links };
}

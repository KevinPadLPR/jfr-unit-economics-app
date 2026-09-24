import { getDb } from "@/lib/db";

export interface InventoryLotRow {
  lot: string;
  status: string | null;
  locationType: string | null;
  feedType: string | null;
  beginning: number;
  purchased: number;
  born: number;
  transferIn: number;
  transferOut: number;
  sold: number;
  died: number;
  ending: number;
}

export interface InventoryTotals {
  beginning: number;
  purchased: number;
  born: number;
  transferIn: number;
  transferOut: number;
  sold: number;
  died: number;
  ending: number;
}

export interface InventoryLocationGroup {
  location: string;
  rows: InventoryLotRow[];
  totals: InventoryTotals;
}

export interface InventorySnapshot {
  monthEnd: string;
  rows: InventoryLotRow[];
  totals: InventoryTotals;
  byLocation: InventoryLocationGroup[];
}

function sumTotals(rows: InventoryLotRow[]): InventoryTotals {
  return rows.reduce(
    (t, r) => ({
      beginning: t.beginning + r.beginning,
      purchased: t.purchased + r.purchased,
      born: t.born + r.born,
      transferIn: t.transferIn + r.transferIn,
      transferOut: t.transferOut + r.transferOut,
      sold: t.sold + r.sold,
      died: t.died + r.died,
      ending: t.ending + r.ending,
    }),
    { beginning: 0, purchased: 0, born: 0, transferIn: 0, transferOut: 0, sold: 0, died: 0, ending: 0 }
  );
}

/** Every month the GL has a head-days snapshot for, newest first. */
export function getAvailableMonths(): string[] {
  const db = getDb();
  return (
    db
      .prepare(`SELECT DISTINCT month_end FROM gl_head_days WHERE month_end IS NOT NULL ORDER BY month_end DESC`)
      .all() as { month_end: string }[]
  ).map((r) => r.month_end);
}

interface RawRow {
  lot: string;
  status: string | null;
  location_type: string | null;
  feed_type: string | null;
  head_start: number | null;
  purchased: number | null;
  born: number | null;
  transfer_in: number | null;
  sold: number | null;
  died: number | null;
  transfer_out: number | null;
  head_end: number | null;
}

/**
 * One month's ranch-wide head movement, by lot and grouped by location. Every
 * lot with a gl_head_days row for this month is included, regardless of its
 * status today — the movement genuinely happened in that month even if the
 * lot has since closed.
 */
export function getInventorySnapshot(monthEnd: string): InventorySnapshot {
  const db = getDb();
  const raw = db
    .prepare(
      `SELECT hd.lot, s.status, s.location_type, s.feed_type,
              hd.head_start, hd.purchased, hd.born, hd.transfer_in, hd.sold, hd.died, hd.transfer_out, hd.head_end
       FROM gl_head_days hd
       LEFT JOIN master_lot_schedule s ON s.lot = hd.lot
       WHERE hd.month_end = ?
       ORDER BY hd.lot`
    )
    .all(monthEnd) as unknown as RawRow[];

  const rows: InventoryLotRow[] = raw.map((r) => ({
    lot: r.lot,
    status: r.status,
    locationType: r.location_type,
    feedType: r.feed_type,
    beginning: r.head_start ?? 0,
    purchased: r.purchased ?? 0,
    born: r.born ?? 0,
    transferIn: r.transfer_in ?? 0,
    transferOut: r.transfer_out ?? 0,
    sold: r.sold ?? 0,
    died: r.died ?? 0,
    ending: r.head_end ?? 0,
  }));

  const groups = new Map<string, InventoryLotRow[]>();
  for (const row of rows) {
    const key = row.locationType ?? "Unspecified";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const byLocation: InventoryLocationGroup[] = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([location, groupRows]) => ({ location, rows: groupRows, totals: sumTotals(groupRows) }));

  return { monthEnd, rows, totals: sumTotals(rows), byLocation };
}

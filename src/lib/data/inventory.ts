import { createClient } from "@/lib/supabase/server";

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
export async function getAvailableMonths(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ue_gl_head_days")
    .select("month_end")
    .not("month_end", "is", null)
    .order("month_end", { ascending: false });
  if (error) throw error;
  // No SELECT DISTINCT over PostgREST -- dedupe in application code instead, order already
  // matches (newest first) since the query is already sorted.
  return [...new Set((data ?? []).map((r) => r.month_end as string))];
}

/**
 * One month's ranch-wide head movement, by lot and grouped by location. Every
 * lot with a ue_gl_head_days row for this month is included, regardless of its
 * status today — the movement genuinely happened in that month even if the
 * lot has since closed.
 */
export async function getInventorySnapshot(monthEnd: string): Promise<InventorySnapshot> {
  const supabase = await createClient();
  const [{ data: headDays, error: headDaysError }, { data: schedule, error: scheduleError }] = await Promise.all([
    supabase
      .from("ue_gl_head_days")
      .select("lot, head_start, purchased, born, transfer_in, sold, died, transfer_out, head_end")
      .eq("month_end", monthEnd)
      .order("lot", { ascending: true }),
    supabase.from("ue_master_lot_schedule").select("lot, status, location_type, feed_type"),
  ]);
  if (headDaysError) throw headDaysError;
  if (scheduleError) throw scheduleError;

  const scheduleByLot = new Map((schedule ?? []).map((s) => [s.lot as string, s]));

  const rows: InventoryLotRow[] = (headDays ?? []).map((r) => {
    const s = scheduleByLot.get(r.lot as string);
    return {
      lot: r.lot,
      status: s?.status ?? null,
      locationType: s?.location_type ?? null,
      feedType: s?.feed_type ?? null,
      beginning: r.head_start ?? 0,
      purchased: r.purchased ?? 0,
      born: r.born ?? 0,
      transferIn: r.transfer_in ?? 0,
      transferOut: r.transfer_out ?? 0,
      sold: r.sold ?? 0,
      died: r.died ?? 0,
      ending: r.head_end ?? 0,
    };
  });

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

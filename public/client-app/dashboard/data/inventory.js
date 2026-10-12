/** Unit Economics dashboard -- ranch-wide monthly head movement. */
window.UEDash = window.UEDash || {};

(function () {
  function sumTotals(rows) {
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
  async function getAvailableMonths() {
    const { data, error } = await supabase.from("ue_gl_head_days").select("month_end").not("month_end", "is", null).order("month_end", { ascending: false });
    if (error) throw error;
    // No SELECT DISTINCT over PostgREST -- dedupe in application code instead, order already
    // matches (newest first) since the query is already sorted.
    return [...new Set((data ?? []).map((r) => r.month_end))];
  }

  /**
   * One month's ranch-wide head movement, by lot and grouped by profit center. Every lot with a
   * ue_gl_head_days row for this month is included, regardless of its status today -- the
   * movement genuinely happened in that month even if the lot has since closed.
   *
   * Grouped by profit_center (Stockers/Feeders/Rsd Stockers/Cows), not location_type/feed_type --
   * confirmed (2026-10-12) those two are our own regex-on-lot-name heuristic, never real client/GL
   * data, never corrected by anyone. profit_center is the one genuine GL grouping dimension.
   */
  async function getInventorySnapshot(monthEnd) {
    const [{ data: headDays, error: headDaysError }, { data: schedule, error: scheduleError }] = await Promise.all([
      supabase
        .from("ue_gl_head_days")
        .select("lot, head_start, purchased, born, transfer_in, sold, died, transfer_out, head_end")
        .eq("month_end", monthEnd)
        .order("lot", { ascending: true }),
      supabase.from("ue_master_lot_schedule").select("lot, status, profit_center"),
    ]);
    if (headDaysError) throw headDaysError;
    if (scheduleError) throw scheduleError;

    const scheduleByLot = new Map((schedule ?? []).map((s) => [s.lot, s]));

    const rows = (headDays ?? []).map((r) => {
      const s = scheduleByLot.get(r.lot);
      return {
        lot: r.lot,
        status: s?.status ?? null,
        profitCenter: s?.profit_center ?? null,
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

    const groups = new Map();
    for (const row of rows) {
      const key = row.profitCenter ?? "Unspecified";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const byProfitCenter = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([profitCenter, groupRows]) => ({ profitCenter, rows: groupRows, totals: sumTotals(groupRows) }));

    return { monthEnd, rows, totals: sumTotals(rows), byProfitCenter };
  }

  Object.assign(window.UEDash, { getAvailableMonths, getInventorySnapshot });
})();

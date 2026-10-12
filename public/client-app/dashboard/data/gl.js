/**
 * Unit Economics dashboard -- GL report-line reads. Reads through this app's own already
 * signed-in `supabase` client (declared once near the top of this file's main script), same as
 * every other data call in this 40,000-line app -- RLS-gated, no second client.
 */
window.UEDash = window.UEDash || {};

(function () {
  /**
   * Report-line groupings used by the Cost of Gain formulas -- these mirror the already-decided,
   * John-confirmed business rules baked into Template/builder/add_analysis_sheets.py in the Unit
   * Economics Excel project. Don't add lines here without updating that source of truth too.
   */
  const FEED_FORAGE_LINES = ["Feed", "Grazing - Winter Oats", "Grazing - Summer Native", "Mineral", "Rent"];
  const HEALTH_LINES = ["Medicine", "Processing"];
  const DEATH_LOSS_LINE = "Death Loss";
  const LRP_LINE = "LRP Insurance";

  /**
   * ue_gl_lot_report_line_summary (Supabase view) is already grouped by (lot, report_section,
   * report_line) -- this sums a handful of pre-aggregated rows in application code instead of a
   * parameterized SQL filter, which views can't take cleanly.
   */
  async function sumReportAmount(lot, opts = {}) {
    const { data, error } = await supabase.from("ue_gl_lot_report_line_summary").select("report_line, report_section, total").eq("lot", lot);
    if (error) throw error;

    const rows = data ?? [];
    const filtered = rows.filter((r) => {
      if (opts.reportLines?.length) return opts.reportLines.includes(r.report_line);
      if (opts.reportSection) return r.report_section === opts.reportSection;
      return false;
    });
    return filtered.reduce((s, r) => s + (r.total ?? 0), 0);
  }

  /** All Direct-section cost, grouped by line -- used for the Cost of Gain breakdown chart. */
  async function getDirectCostBreakdown(lot) {
    const { data, error } = await supabase
      .from("ue_gl_lot_report_line_summary")
      .select("report_line, total")
      .eq("lot", lot)
      .eq("report_section", "Direct")
      .order("total", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  /**
   * Direct + Indirect $ by week, dollars only -- never $/lb. Indirect posts month-end only, so a
   * weekly $/lb would show a false monthly spike (the same reason the Excel "Weekly Cost of
   * Gain" block is dollars-only).
   */
  /**
   * Full life-to-date cost for one lot: Purchased Cattle + Direct + Indirect. Deliberately NOT
   * ue_master_lot_schedule.cost_in_dollars -- confirmed 2026-10-12 against the ETL's own
   * build_lots() (JFR Unit Economics Automation.ipynb) that column is only the Cattle Inventory
   * report's "Cost In $" (Purchase/Born/Transfer-In head movements), renamed on sync. It never
   * includes Direct/Indirect, so using it as "total cost" understates cost and overstates P/L.
   */
  async function getTotalCostToDate(lot) {
    const { data, error } = await supabase.from("ue_gl_lot_report_line_summary").select("report_section, total").eq("lot", lot).in("report_section", ["Cattle", "Direct", "Indirect"]);
    if (error) throw error;
    return (data ?? []).reduce((s, r) => s + (r.total ?? 0), 0);
  }

  /** Same as getTotalCostToDate, for many lots in one query -- avoids an N+1 round trip for
   * screens (Market Position) that need this for every open lot at once. */
  async function getTotalCostToDateByLot(lots) {
    if (!lots.length) return new Map();
    const { data, error } = await supabase.from("ue_gl_lot_report_line_summary").select("lot, report_section, total").in("lot", lots).in("report_section", ["Cattle", "Direct", "Indirect"]);
    if (error) throw error;
    const byLot = new Map();
    for (const r of data ?? []) byLot.set(r.lot, (byLot.get(r.lot) ?? 0) + (r.total ?? 0));
    return byLot;
  }

  async function getWeeklyCostSeries(lot) {
    const { data, error } = await supabase.from("ue_gl_lot_week_cost").select("week_end, direct, indirect").eq("lot", lot).order("week_end", { ascending: false }).limit(13);
    if (error) throw error;
    return (data ?? []).slice().reverse();
  }

  /** Head on hand at month-end, life-to-date -- how this lot's count has moved over time. */
  async function getMonthlyHeadSeries(lot) {
    const { data, error } = await supabase.from("ue_gl_head_days").select("month_end, head_end").eq("lot", lot).not("month_end", "is", null).order("month_end", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  /** Direct + Indirect $ by month, across every lot -- the whole ranch's spend, not one lot's. */
  async function getRanchMonthlyCostSeries() {
    const { data, error } = await supabase.from("ue_gl_ranch_month_cost").select("month_end, direct, indirect").order("month_end", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  Object.assign(window.UEDash, {
    FEED_FORAGE_LINES,
    HEALTH_LINES,
    DEATH_LOSS_LINE,
    LRP_LINE,
    sumReportAmount,
    getTotalCostToDate,
    getTotalCostToDateByLot,
    getDirectCostBreakdown,
    getWeeklyCostSeries,
    getMonthlyHeadSeries,
    getRanchMonthlyCostSeries,
  });
})();

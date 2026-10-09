/**
 * Direct port of src/lib/data/gl.ts. Only change from the Next.js version:
 * reads through the session-scoped anon-key client (RLS-gated) instead of
 * the server-only service_role client -- see supabase-client.js.
 */
import { supabase } from "../supabase-client.js";

/**
 * Report-line groupings used by the Cost of Gain formulas -- these mirror
 * the already-decided, John-confirmed business rules baked into
 * Template/builder/add_analysis_sheets.py in the Unit Economics Excel
 * project. Don't add lines here without updating that source of truth too.
 */
export const FEED_FORAGE_LINES = ["Feed", "Grazing - Winter Oats", "Grazing - Summer Native", "Mineral", "Rent"];
export const HEALTH_LINES = ["Medicine", "Processing"];
export const DEATH_LOSS_LINE = "Death Loss";
export const LRP_LINE = "LRP Insurance";

/**
 * ue_gl_lot_report_line_summary (Supabase view) is already grouped by
 * (lot, report_section, report_line) -- this sums a handful of pre-aggregated
 * rows in application code instead of a parameterized SQL filter, which
 * views can't take cleanly.
 */
export async function sumReportAmount(lot, opts = {}) {
  const { data, error } = await supabase
    .from("ue_gl_lot_report_line_summary")
    .select("report_line, report_section, total")
    .eq("lot", lot);
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
export async function getDirectCostBreakdown(lot) {
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
 * Direct + Indirect $ by week, dollars only -- never $/lb. Indirect posts
 * month-end only, so a weekly $/lb would show a false monthly spike (the
 * same reason the Excel "Weekly Cost of Gain" block is dollars-only).
 */
export async function getWeeklyCostSeries(lot) {
  const { data, error } = await supabase
    .from("ue_gl_lot_week_cost")
    .select("week_end, direct, indirect")
    .eq("lot", lot)
    .order("week_end", { ascending: false })
    .limit(13);
  if (error) throw error;
  return (data ?? []).slice().reverse();
}

/** Head on hand at month-end, life-to-date -- how this lot's count has moved over time. */
export async function getMonthlyHeadSeries(lot) {
  const { data, error } = await supabase
    .from("ue_gl_head_days")
    .select("month_end, head_end")
    .eq("lot", lot)
    .not("month_end", "is", null)
    .order("month_end", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Direct + Indirect $ by month, across every lot -- the whole ranch's spend, not one lot's. */
export async function getRanchMonthlyCostSeries() {
  const { data, error } = await supabase
    .from("ue_gl_ranch_month_cost")
    .select("month_end, direct, indirect")
    .order("month_end", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

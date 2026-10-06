import { createServiceClient } from "@/lib/supabase/service";

/**
 * Report-line groupings used by the Cost of Gain formulas — these mirror the
 * already-decided, John-confirmed business rules baked into
 * Template/builder/add_analysis_sheets.py in the Unit Economics Excel
 * project. Don't add lines here without updating that source of truth too.
 */
export const FEED_FORAGE_LINES = ["Feed", "Grazing - Winter Oats", "Grazing - Summer Native", "Mineral", "Rent"];
export const HEALTH_LINES = ["Medicine", "Processing"];
export const DEATH_LOSS_LINE = "Death Loss";
export const LRP_LINE = "LRP Insurance";

/**
 * ue_gl_lot_report_line_summary (Supabase view) is already grouped by
 * (lot, report_section, report_line) -- this sums a handful of pre-aggregated rows in
 * application code instead of a parameterized SQL filter, which views can't take cleanly.
 */
export async function sumReportAmount(lot: string, opts: { reportLines?: string[]; reportSection?: string }): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ue_gl_lot_report_line_summary")
    .select("report_line, report_section, total")
    .eq("lot", lot);
  if (error) throw error;

  const rows = (data ?? []) as { report_line: string; report_section: string; total: number }[];
  const filtered = rows.filter((r) => {
    if (opts.reportLines?.length) return opts.reportLines.includes(r.report_line);
    if (opts.reportSection) return r.report_section === opts.reportSection;
    return false;
  });
  return filtered.reduce((s, r) => s + (r.total ?? 0), 0);
}

export interface GlCostBreakdownRow {
  report_line: string;
  total: number;
}

/** All Direct-section cost, grouped by line — used for the Cost of Gain breakdown chart. */
export async function getDirectCostBreakdown(lot: string): Promise<GlCostBreakdownRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ue_gl_lot_report_line_summary")
    .select("report_line, total")
    .eq("lot", lot)
    .eq("report_section", "Direct")
    .order("total", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GlCostBreakdownRow[];
}

export interface WeeklyCostPoint {
  week_end: string;
  direct: number;
  indirect: number;
}

/**
 * Direct + Indirect $ by week, dollars only — never $/lb. Indirect posts
 * month-end only, so a weekly $/lb would show a false monthly spike (the
 * same reason the Excel "Weekly Cost of Gain" block is dollars-only).
 */
export async function getWeeklyCostSeries(lot: string): Promise<WeeklyCostPoint[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ue_gl_lot_week_cost")
    .select("week_end, direct, indirect")
    .eq("lot", lot)
    .order("week_end", { ascending: false })
    .limit(13);
  if (error) throw error;
  return ((data ?? []) as WeeklyCostPoint[]).reverse();
}

export interface MonthlyHeadPoint {
  month_end: string;
  head_end: number;
}

/** Head on hand at month-end, life-to-date — how this lot's count has moved over time. */
export async function getMonthlyHeadSeries(lot: string): Promise<MonthlyHeadPoint[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ue_gl_head_days")
    .select("month_end, head_end")
    .eq("lot", lot)
    .not("month_end", "is", null)
    .order("month_end", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MonthlyHeadPoint[];
}

export interface MonthlyRanchCostPoint {
  month_end: string;
  direct: number;
  indirect: number;
}

/** Direct + Indirect $ by month, across every lot — the whole ranch's spend, not one lot's. */
export async function getRanchMonthlyCostSeries(): Promise<MonthlyRanchCostPoint[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ue_gl_ranch_month_cost")
    .select("month_end, direct, indirect")
    .order("month_end", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MonthlyRanchCostPoint[];
}

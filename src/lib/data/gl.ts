import { getDb } from "@/lib/db";

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

function placeholders(n: number) {
  return new Array(n).fill("?").join(",");
}

export function sumReportAmount(lot: string, opts: { reportLines?: string[]; reportSection?: string }): number {
  const db = getDb();
  const clauses = ["lot = ?"];
  const params: (string | number)[] = [lot];

  if (opts.reportLines?.length) {
    clauses.push(`report_line IN (${placeholders(opts.reportLines.length)})`);
    params.push(...opts.reportLines);
  }
  if (opts.reportSection) {
    clauses.push("report_section = ?");
    params.push(opts.reportSection);
  }

  const row = db
    .prepare(`SELECT COALESCE(SUM(report_amount), 0) AS total FROM gl_transactions WHERE ${clauses.join(" AND ")}`)
    .get(...params) as { total: number };
  return row.total;
}

export interface GlCostBreakdownRow {
  report_line: string;
  total: number;
}

/** All Direct-section cost, grouped by line — used for the Cost of Gain breakdown chart. */
export function getDirectCostBreakdown(lot: string): GlCostBreakdownRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT report_line, ROUND(SUM(report_amount), 2) AS total
       FROM gl_transactions
       WHERE lot = ? AND report_section = 'Direct'
       GROUP BY report_line
       ORDER BY total DESC`
    )
    .all(lot) as unknown as GlCostBreakdownRow[];
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
export function getWeeklyCostSeries(lot: string): WeeklyCostPoint[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT week_end,
              ROUND(SUM(CASE WHEN report_section = 'Direct' THEN report_amount ELSE 0 END), 2) AS direct,
              ROUND(SUM(CASE WHEN report_section = 'Indirect' THEN report_amount ELSE 0 END), 2) AS indirect
       FROM gl_transactions
       WHERE lot = ? AND week_end IS NOT NULL
       GROUP BY week_end
       ORDER BY week_end DESC
       LIMIT 13`
    )
    .all(lot)
    .reverse() as unknown as WeeklyCostPoint[];
}

export interface MonthlyHeadPoint {
  month_end: string;
  head_end: number;
}

/** Head on hand at month-end, life-to-date — how this lot's count has moved over time. */
export function getMonthlyHeadSeries(lot: string): MonthlyHeadPoint[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT month_end, head_end
       FROM gl_head_days
       WHERE lot = ? AND month_end IS NOT NULL
       ORDER BY month_end ASC`
    )
    .all(lot) as unknown as MonthlyHeadPoint[];
}

/**
 * Unit Economics dashboard -- Financial tab (Client Files/Tab2-Financial.jpg). Revenue, Cattle
 * Cost, Direct, Indirect and Net Income per lot, by month or week. Reads
 * ue_gl_lot_month_cost / ue_gl_lot_week_cost (docs/sql/2026-10-12_lot_financial_views.sql) --
 * NEITHER THE NEW MONTHLY VIEW NOR THE WIDENED WEEKLY VIEW EXIST ON THE CLIENT'S SUPABASE PROJECT
 * YET as of this writing. Every function here treats a missing-view error as "not available yet"
 * (see isViewMissing below), not a crash, so this tab ships now and starts working the moment
 * someone with write access to that project pastes the SQL file above into the SQL Editor.
 */
window.UEDash = window.UEDash || {};

(function () {
  /** PostgREST's "this table/view isn't in its schema cache" error -- what every call below gets
   * back today, since neither view exists yet. Checked by code first (PGRST205, the documented
   * code for this), message text as a fallback for older/newer PostgREST wording. */
  function isViewMissing(error) {
    if (!error) return false;
    if (error.code === "PGRST205" || error.code === "42P01") return true;
    return /schema cache|does not exist/i.test(error.message ?? "");
  }

  /**
   * "All lots" has no lot predicate at all, so Postgres has to read and group every row in
   * ue_gl_transactions regardless of any index -- an index speeds up a filtered lookup, not an
   * unconditional full-table aggregation. Measured 2026-10-12 (after the month_end/week_end
   * indexes from docs/sql/2026-10-12b were applied): ~33,700 real GL transaction rows, "All lots"
   * still takes ~5s (Monthly) / ~8s (Weekly) -- that's the real cost of summing the whole ledger
   * with nothing to filter it by, not something more indexing fixes. A real fix (a pre-aggregated
   * materialized view, refreshed on the ETL's own sync cadence instead of computed live on every
   * request) would need DDL access to the client's production project this session doesn't have,
   * and isn't something to self-apply blind against real data with no staging environment either
   * way -- flagged here, not done.
   *
   * What IS fixed here: caching. The GL only changes on the ETL's periodic sync, not in real
   * time (same reasoning as listGlLots' cache), so there's no reason to re-run that expensive
   * query every time someone revisits "All lots" or flips Monthly/Weekly and back within the same
   * session -- only the first load per selection pays the real cost.
   */
  const financialCache = new Map();
  const FINANCIAL_CACHE_TTL_MS = 120_000;

  /** PostgREST caps a single request at 1000 rows (this project's db.max_rows). "All lots" has no
   * lot filter to shrink it -- confirmed 2026-10-12 that ue_gl_lot_week_cost alone is 1,272 rows
   * ranch-wide, over that cap -- so this pages through with .range() until a page comes back
   * short, same fix already applied to Market Data's Internal investigation for the same reason. */
  async function queryFinancials(table, periodCol, lots) {
    const cacheKey = `${table}|${lots && lots.length ? lots.slice().sort().join(",") : "ALL"}`;
    const cached = financialCache.get(cacheKey);
    if (cached && Date.now() - cached.at < FINANCIAL_CACHE_TTL_MS) return cached.rows;

    const pageSize = 1000;
    let rows = [];
    for (let from = 0; ; from += pageSize) {
      let query = supabase.from(table).select(`lot, ${periodCol}, revenue, cattle_cost, direct, indirect`);
      if (lots && lots.length) query = query.in("lot", lots);
      const { data, error } = await query.order(periodCol, { ascending: true }).range(from, from + pageSize - 1);
      if (error) {
        if (isViewMissing(error)) return null;
        throw error;
      }
      rows = rows.concat(data ?? []);
      if (!data || data.length < pageSize) break;
    }
    financialCache.set(cacheKey, { rows, at: Date.now() });
    return rows;
  }

  /**
   * Rows for the selected lot(s), summed across all selected lots per period -- "All lots" and
   * "several lots" both land here as the same plain client-side group-by (lots=null/[] means
   * every lot). Returns null (not []) when the backing view doesn't exist yet, so the page can
   * tell "not deployed yet" apart from "deployed, but genuinely zero rows for this selection".
   */
  async function getLotFinancials({ lots, period }) {
    const table = period === "week" ? "ue_gl_lot_week_cost" : "ue_gl_lot_month_cost";
    const periodCol = period === "week" ? "week_end" : "month_end";
    const rows = await queryFinancials(table, periodCol, lots);
    if (rows === null) return null;

    const byPeriod = new Map();
    for (const r of rows) {
      const key = r[periodCol];
      if (!byPeriod.has(key)) byPeriod.set(key, { period: key, revenue: 0, cattleCost: 0, direct: 0, indirect: 0 });
      const row = byPeriod.get(key);
      row.revenue += Number(r.revenue) || 0;
      row.cattleCost += Number(r.cattle_cost) || 0;
      row.direct += Number(r.direct) || 0;
      row.indirect += Number(r.indirect) || 0;
    }

    return [...byPeriod.values()]
      .map((r) => ({ ...r, netIncome: r.revenue - r.cattleCost - r.direct - r.indirect }))
      .sort((a, b) => String(a.period).localeCompare(String(b.period)));
  }

  Object.assign(window.UEDash, { getLotFinancials, isFinancialViewMissing: isViewMissing });
})();

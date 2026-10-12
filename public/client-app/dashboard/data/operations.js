/**
 * Unit Economics dashboard -- Operations tab (Client Files/Tab3-Operations.jpg). One lot's cost
 * economics, by month: Total Head, Days on Feed, Starting/Estimated Weight, Total Cost to Date,
 * Average Daily Gain, Cost of Gain, and a monthly Purchase/Medicine/Freight/Feed/Other breakdown.
 *
 * Cost category mapping -- verified against `Database/Account Map.xlsx` (the authoritative
 * Report Section/Report Line map the ETL itself hard-fails without), not guessed:
 *   Purchase  = report_section 'Cattle' (report_line 'Purchased Cattle' is the only line there)
 *   Medicine  = report_line in ('Medicine','Processing') -- same HEALTH_LINES pairing data/gl.js
 *               already uses elsewhere in this dashboard, reused rather than inventing a
 *               different split for this one tab
 *   Freight   = report_line 'Trucking & Freight' (there is no line literally called "Freight")
 *   Feed      = FEED_FORAGE_LINES (data/gl.js): Feed, Grazing - Winter Oats,
 *               Grazing - Summer Native, Mineral, Rent
 *   Other     = everything else: all of Indirect, plus Direct's Death Loss/LRP Insurance/Crop
 *               Inputs/Transfer Price, AND "Grazing / Pasture" -- a real, distinct Direct line
 *               the Account Map keeps separate from the two Grazing lines above. Deliberately NOT
 *               folded into Feed: nothing confirms it's the same thing, and silently merging two
 *               differently-named GL categories is exactly the kind of guess this dashboard no
 *               longer makes. Flagging it here so it's easy to correct once confirmed either way.
 * Purchase + Medicine + Freight + Feed + Other == Cattle + Direct + Indirect == Total Cost,
 * confirmed additive (Template/builder/build_template.py's own "All Lots" sheet, line 736).
 */
window.UEDash = window.UEDash || {};

(function () {
  const { getGlLotSummary, getCostOfGain } = window.UEDash;
  const { FEED_FORAGE_LINES } = window.UEDash;

  const MEDICINE_LINES = new Set(["Medicine", "Processing"]);
  const FEED_LINES = new Set(FEED_FORAGE_LINES);
  const FREIGHT_LINE = "Trucking & Freight";

  function bucketFor(reportSection, reportLine) {
    if (reportSection === "Cattle") return "purchase";
    if (reportSection === "Indirect") return "other";
    // Direct from here down.
    if (MEDICINE_LINES.has(reportLine)) return "medicine";
    if (reportLine === FREIGHT_LINE) return "freight";
    if (FEED_LINES.has(reportLine)) return "feed";
    return "other";
  }

  function monthKey(dateStr) {
    return String(dateStr).slice(0, 7); // YYYY-MM, grouping key only -- not stored/displayed raw
  }

  /** Every Cattle/Direct/Indirect transaction on this lot, bucketed into the 5 categories above
   * and grouped by month. Reads individual ue_gl_transactions rows (not a pre-aggregated view) --
   * there is no existing per-lot-per-month-per-category view, and this table already carries
   * everything needed to build one client-side from real transaction-level data. */
  async function getMonthlyCostBreakdown(lot) {
    const { data, error } = await supabase
      .from("ue_gl_transactions")
      .select("date, report_section, report_line, report_amount")
      .eq("lot", lot)
      .in("report_section", ["Cattle", "Direct", "Indirect"])
      .order("date", { ascending: true });
    if (error) throw error;

    const byMonth = new Map();
    for (const r of data ?? []) {
      const key = monthKey(r.date);
      if (!byMonth.has(key)) byMonth.set(key, { month: key, purchase: 0, medicine: 0, freight: 0, feed: 0, other: 0, total: 0 });
      const row = byMonth.get(key);
      const bucket = bucketFor(r.report_section, r.report_line);
      const amount = Number(r.report_amount) || 0;
      row[bucket] += amount;
      row.total += amount;
    }

    return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * The operational summary cards. Days on Feed uses `books_through` (the lot's own "data
   * available as of" date, GL-measured) rather than today's wall-clock date -- using the system
   * clock would not be derived from GL/client data at all, just whatever happens to be open when
   * someone loads the page.
   *
   * Performance (2026-10-12): summary and getCostOfGain don't depend on each other, so they run in
   * parallel. isMeasured/adgUsed/adgSourceDetail/totalCostToDate all come straight off cog's own
   * return value instead of this function fetching attrs and total-cost-to-date a second time --
   * getCostOfGain already computes both from data it fetches anyway.
   */
  async function getOperationsSummary(lot) {
    const [summary, cog] = await Promise.all([getGlLotSummary(lot), getCostOfGain(lot)]);
    if (!summary) return undefined;

    const daysOnFeed = summary.date_in && summary.books_through ? Math.round((new Date(summary.books_through) - new Date(summary.date_in)) / 86400000) : null;
    const startingWeight = summary.avg_wt_in ?? null;
    const isMeasured = cog?.isMeasured ?? false;
    const estimatedWeight = isMeasured && startingWeight != null && daysOnFeed != null ? startingWeight + daysOnFeed * cog.adgUsed : null;

    return {
      lot,
      asOfDate: summary.books_through,
      totalHead: summary.head_in ?? null,
      daysOnFeed,
      startingWeight,
      estimatedWeight,
      isMeasured,
      adgSourceDetail: cog?.adgSourceDetail ?? null,
      adgUsed: isMeasured ? cog.adgUsed : null,
      cogAllIn: cog?.cogAllIn ?? null,
      totalCostToDate: cog?.totalCostToDate ?? 0,
      headIn: summary.head_in ?? 0,
    };
  }

  Object.assign(window.UEDash, { getMonthlyCostBreakdown, getOperationsSummary });
})();

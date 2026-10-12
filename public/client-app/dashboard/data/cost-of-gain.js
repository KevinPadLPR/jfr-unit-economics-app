/** Unit Economics dashboard -- per-lot GL summary + Cost of Gain. */
window.UEDash = window.UEDash || {};

(function () {
  const { getReportLineRows, sumRows, FEED_FORAGE_LINES, HEALTH_LINES, DEATH_LOSS_LINE, LRP_LINE } = window.UEDash;
  const { getLotAttrsRollup, getCrosswalkInfo } = window.UEDash;

  async function getGlLotSummary(lot) {
    const { data, error } = await supabase.from("ue_master_lot_schedule").select("*").eq("lot", lot).maybeSingle();
    if (error) throw error;
    return data ?? undefined;
  }

  // ue_master_lot_schedule only changes on the ETL's own sync cadence (a monthly reconciled run,
  // per that project's own docs), not in real time -- every sub-tab calls listGlLots() on its own
  // render, so without this, switching Operations -> Cost of Gain -> Lot Detail (or just picking a
  // different lot, which re-renders the same page) re-fetches this ~35-row, full-column table from
  // scratch every single time for data that's already sitting in memory. A short TTL, not an
  // unbounded cache, so a real sync during a long-open session still shows up before too long.
  let lotsCache = null;
  let lotsCacheAt = 0;
  const LOTS_CACHE_TTL_MS = 60_000;

  async function listGlLots() {
    if (lotsCache && Date.now() - lotsCacheAt < LOTS_CACHE_TTL_MS) return lotsCache;
    const { data, error } = await supabase.from("ue_master_lot_schedule").select("*").order("status", { ascending: true }).order("lot", { ascending: true });
    if (error) throw error;
    lotsCache = data ?? [];
    lotsCacheAt = Date.now();
    return lotsCache;
  }

  /**
   * Life-to-date Cost of Gain, all three conventions. Formulas match
   * Template/builder/add_analysis_sheets.py exactly -- "total dollars first, divide at the end,"
   * never averaging $/lb across lots.
   *
   * Performance (2026-10-12): this used to be 8 separate round trips per lot -- summary and attrs
   * fetched sequentially even though neither depends on the other, plus 6 separate queries to
   * ue_gl_lot_report_line_summary (5x sumReportAmount + getDirectCostBreakdown) that differed only
   * in which rows they kept client-side. Confirmed via real timing against the client's production
   * Supabase that this was the dashboard's actual slow spot (~875ms for this one call). Now: one
   * query for summary + attrs each (parallel), one query for every report-line row this lot has,
   * every category total computed from that single row set.
   */
  async function getCostOfGain(lot) {
    const [summary, attrs] = await Promise.all([getGlLotSummary(lot), getLotAttrsRollup(lot)]);
    if (!summary) return undefined;

    const headDays = summary.head_days ?? 0;
    // Pounds gained (and everything divided by it) is a formula on ADG -- only real when the ADG
    // feeding it is itself measured (attrs.isMeasured). No more falling back to a target/assumed
    // ADG: per John's rule (2026-10-12), an unmeasured lot shows no pounds-gained-based figure at
    // all, not a guessed one.
    const poundsGained = attrs.isMeasured ? headDays * attrs.adgUsed : null;

    const rows = await getReportLineRows(lot);
    const feedForage = sumRows(rows, { reportLines: FEED_FORAGE_LINES });
    const health = sumRows(rows, { reportLines: HEALTH_LINES });
    const laborOverhead = sumRows(rows, { reportSection: "Indirect" });
    const deathLoss = sumRows(rows, { reportLines: [DEATH_LOSS_LINE] });
    const lrp = sumRows(rows, { reportLines: [LRP_LINE] });
    const grazingSummerNative = sumRows(rows, { reportLines: ["Grazing - Summer Native"] });
    const costBreakdown = rows
      .filter((r) => r.report_section === "Direct")
      .map((r) => ({ report_line: r.report_line, total: r.total }))
      .sort((a, b) => b.total - a.total);
    const totalCostToDate = rows.filter((r) => ["Cattle", "Direct", "Indirect"].includes(r.report_section)).reduce((s, r) => s + (r.total ?? 0), 0);

    const operating = feedForage + health + laborOverhead;
    const allIn = operating + deathLoss + lrp;

    const safeDiv = (n, d) => (n != null && d != null && d > 0 ? n / d : null);

    return {
      lot,
      headDays,
      isMeasured: attrs.isMeasured,
      adgUsed: attrs.adgUsed,
      adgSourceDetail: attrs.adgSourceDetail,
      poundsGained,
      feedForage,
      health,
      laborOverhead,
      operating,
      deathLoss,
      lrp,
      allIn,
      cogFeed: safeDiv(feedForage, poundsGained),
      cogOper: safeDiv(operating, poundsGained),
      cogAllIn: safeDiv(allIn, poundsGained),
      costPerHeadDayOperating: safeDiv(operating, headDays),
      grazingSummerNativeBooked: grazingSummerNative !== 0,
      costBreakdown,
      totalCostToDate,
    };
  }

  async function getConfidenceGrade(lot) {
    const [attrs, crosswalk] = await Promise.all([getLotAttrsRollup(lot), getCrosswalkInfo(lot)]);
    if (!attrs.isMeasured) return "L";
    if (crosswalk.decisionNeeded || attrs.anyWeightStale) return "M";
    return "H";
  }

  Object.assign(window.UEDash, { getGlLotSummary, listGlLots, getCostOfGain, getConfidenceGrade });
})();

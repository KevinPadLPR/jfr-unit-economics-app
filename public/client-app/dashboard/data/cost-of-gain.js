/** Unit Economics dashboard -- per-lot GL summary + Cost of Gain. */
window.UEDash = window.UEDash || {};

(function () {
  const { sumReportAmount, getDirectCostBreakdown, FEED_FORAGE_LINES, HEALTH_LINES, DEATH_LOSS_LINE, LRP_LINE } = window.UEDash;
  const { getLotAttrsRollup, getCrosswalkInfo } = window.UEDash;

  async function getGlLotSummary(lot) {
    const { data, error } = await supabase.from("ue_master_lot_schedule").select("*").eq("lot", lot).maybeSingle();
    if (error) throw error;
    return data ?? undefined;
  }

  async function listGlLots() {
    const { data, error } = await supabase.from("ue_master_lot_schedule").select("*").order("status", { ascending: true }).order("lot", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  /**
   * Life-to-date Cost of Gain, all three conventions. Formulas match
   * Template/builder/add_analysis_sheets.py exactly -- "total dollars first, divide at the end,"
   * never averaging $/lb across lots.
   */
  async function getCostOfGain(lot) {
    const summary = await getGlLotSummary(lot);
    if (!summary) return undefined;

    const headDays = summary.head_days ?? 0;
    const attrs = await getLotAttrsRollup(lot);
    // Pounds gained (and everything divided by it) is a formula on ADG -- only real when the ADG
    // feeding it is itself measured (attrs.isMeasured). No more falling back to a target/assumed
    // ADG: per John's rule (2026-10-12), an unmeasured lot shows no pounds-gained-based figure at
    // all, not a guessed one.
    const poundsGained = attrs.isMeasured ? headDays * attrs.adgUsed : null;

    const [feedForage, health, laborOverhead, deathLoss, lrp, grazingSummerNative, costBreakdown] = await Promise.all([
      sumReportAmount(lot, { reportLines: FEED_FORAGE_LINES }),
      sumReportAmount(lot, { reportLines: HEALTH_LINES }),
      sumReportAmount(lot, { reportSection: "Indirect" }),
      sumReportAmount(lot, { reportLines: [DEATH_LOSS_LINE] }),
      sumReportAmount(lot, { reportLines: [LRP_LINE] }),
      sumReportAmount(lot, { reportLines: ["Grazing - Summer Native"] }),
      getDirectCostBreakdown(lot),
    ]);
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

/** Unit Economics dashboard -- app-data rollup + crosswalk reads. */
window.UEDash = window.UEDash || {};

(function () {
  /**
   * `ue_master_lot_schedule` is GL-lot-grain already -- the Excel notebook does the
   * head-weighted rollup across app cohorts (sub-lots like "37X-1") itself, before syncing, so
   * this is a single-row read, not a rollup computed here.
   *
   * `isMeasured` is the gate every ADG-dependent figure (estimated weight, cost of gain, pounds
   * gained) must check before rendering a number at all -- per John's rule (2026-10-12): every
   * figure must be measured or derived from real data, nothing we assume on the client's behalf.
   * Only `realized`/`realized_thin` are genuinely measured (back-solved from real weigh-ins --
   * see `JFR Unit Economics Automation.ipynb` cell 12). `mixed` is deliberately NOT trusted here
   * even though today's only mixed lot (37-X) happens to blend two real sources: `mixed` just
   * means "this GL lot's app sub-lot cohorts don't all agree," which could in principle include
   * an assumed cohort for some future lot, and nothing client-side can tell the two cases apart.
   * `assumed` (including "no app data at all," which silently ran on a flat, never-customized
   * Target ADG of 1.75) is never measured. No more `fallbackTargetAdg` parameter -- there is no
   * compliant fallback left to pass one.
   */
  async function getLotAttrsRollup(glLot) {
    const { data: row, error } = await supabase
      .from("ue_master_lot_schedule")
      .select("has_app_data, adg_used, adg_source, projected_current_weight_app, weight_stale_over_60d")
      .eq("lot", glLot)
      .maybeSingle();
    if (error) throw error;

    if (!row || (row.has_app_data ?? "").toLowerCase() !== "yes") {
      return {
        hasAppData: false,
        isMeasured: false,
        adgUsed: null,
        adgSourceDetail: "No measured weigh-ins yet for this lot.",
        projectedCurrentWeight: null,
        anyWeightStale: false,
      };
    }

    const source = row.adg_source ?? "assumed";
    const isMeasured = source === "realized" || source === "realized_thin";
    const detailBySource = {
      realized: "Based on actual field weigh-ins",
      realized_thin: "Based on actual field weigh-ins (small sample so far)",
      mixed: "This lot's sub-groups don't all share one ADG source yet, can't confirm it's fully measured",
      assumed: "No measured weigh-ins yet for this lot.",
    };

    return {
      hasAppData: true,
      isMeasured,
      adgUsed: isMeasured ? row.adg_used : null,
      adgSourceDetail: detailBySource[source] ?? `ADG source: ${source}`,
      projectedCurrentWeight: row.projected_current_weight_app,
      anyWeightStale: row.weight_stale_over_60d === "YES",
    };
  }

  async function getCrosswalkInfo(glLot) {
    const { data: row, error } = await supabase.from("ue_lot_crosswalk").select("match_type, decision_needed, note").eq("gl_lot", glLot).limit(1).maybeSingle();
    if (error) throw error;

    return {
      matchType: row?.match_type ?? null,
      decisionNeeded: row?.decision_needed === "YES",
      note: row?.note ?? null,
    };
  }

  Object.assign(window.UEDash, { getLotAttrsRollup, getCrosswalkInfo });
})();

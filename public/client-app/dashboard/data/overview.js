/** Unit Economics dashboard -- the Overview tab's front-page metrics. */
window.UEDash = window.UEDash || {};

(function () {
  const { listGlLots } = window.UEDash;
  const { getMarketPosition } = window.UEDash;
  const { getLotAttrsRollup, getCrosswalkInfo } = window.UEDash;

  function formatUsd(value) {
    return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  /**
   * The Position Desk spec's "front-page twelve": Available cash, LOC available, Head owned,
   * Pounds owned, Cost basis, Marked value, Unrealized position, Hedge coverage %, Forecast
   * margin, Week-7 cash low, Lots needing action, Exceptions.
   *
   * This snapshot has no accounting cash-position feed at all, and it's a single point-in-time
   * snapshot rather than a running weekly series, so week-over-week deltas and a cash forecast
   * aren't real numbers yet either. Those tiles are shown as an explicit dash with a reason --
   * never omitted, never guessed.
   */
  async function getOverviewMetrics() {
    const [lots, marketPosition, positionsRes] = await Promise.all([
      listGlLots(),
      getMarketPosition(),
      supabase.from("positions").select("notes"),
    ]);
    const openLots = lots.filter((l) => (l.status ?? "").toLowerCase() === "open");

    // One parallel pass per open lot instead of two sequential ones -- anyWeightStale/
    // hasAppData don't depend on the fallback ADG argument, so the same getLotAttrsRollup call
    // (fallback = this lot's own target ADG) covers what used to be two separate round-trips
    // per lot.
    const perLot = await Promise.all(
      openLots.map((lot) => Promise.all([getLotAttrsRollup(lot.lot, lot.target_adg ?? 0), getCrosswalkInfo(lot.lot)]))
    );

    let headOwned = 0;
    let poundsOwned = 0;
    let staleWeightLots = 0;
    let decisionNeededLots = 0;
    openLots.forEach((lot, i) => {
      const [attrs, crosswalk] = perLot[i];
      const head = lot.head_on_hand ?? 0;
      const weight = attrs.projectedCurrentWeight ?? lot.avg_wt_in ?? 0;
      headOwned += head;
      poundsOwned += head * weight;
      if (attrs.anyWeightStale) staleWeightLots += 1;
      if (crosswalk.decisionNeeded) decisionNeededLots += 1;
    });

    const costBasis = openLots.reduce((s, l) => s + (l.cost_in_dollars ?? 0), 0);
    const markedValue = marketPosition.reduce((s, r) => s + (r.markedValue ?? 0), 0);
    const unrealized = markedValue - costBasis;

    // positions is the client's own native hedge register (not a ue_ table) -- small (a handful
    // of real rows today), so counting "confirmed" (not the seed data's verification rows) in
    // application code is simpler and just as correct as a SQL filter.
    if (positionsRes.error) throw positionsRes.error;
    const confirmedCount = (positionsRes.data ?? []).filter((p) => !p.notes || !String(p.notes).includes("VERIFICATION ROW")).length;

    const today = new Date().toISOString().slice(0, 10);
    const lotsNeedingAction = openLots.filter((l) => l.target_out_date && l.target_out_date < today).length;

    const unbookedSummerGrazing = openLots.filter((l) => (l.production_year ?? 0) >= 2026).length; // known, dated gap
    const exceptions = staleWeightLots + decisionNeededLots;

    return {
      computed: [
        { key: "head_owned", label: "Head owned", value: `${headOwned.toLocaleString("en-US")}`, provenance: "measured" },
        { key: "pounds_owned", label: "Pounds owned (est.)", value: `${Math.round(poundsOwned).toLocaleString("en-US")} lb`, provenance: "modeled" },
        { key: "cost_basis", label: "Cost basis (open lots)", value: formatUsd(costBasis), provenance: "measured" },
        { key: "marked_value", label: "Marked value", value: formatUsd(markedValue), provenance: "modeled" },
        { key: "unrealized", label: "Unrealized position", value: formatUsd(unrealized), provenance: "modeled" },
        {
          key: "hedge_coverage",
          label: "Hedge coverage",
          value: confirmedCount === 0 ? "0%, no confirmed positions" : `${confirmedCount} confirmed position(s)`,
          provenance: "measured",
        },
        { key: "lots_needing_action", label: "Lots needing action", value: `${lotsNeedingAction}`, provenance: "modeled" },
        { key: "exceptions", label: "Exceptions", value: `${exceptions}`, provenance: "measured" },
      ],
      unavailable: [
        { key: "available_cash", label: "Available cash", value: null, provenance: null, unavailableReason: "No bank/cash-position feed in this data snapshot yet." },
        { key: "loc_available", label: "LOC available", value: null, provenance: null, unavailableReason: "No line-of-credit feed in this data snapshot yet." },
        { key: "week7_cash_low", label: "Week-7 cash low", value: null, provenance: null, unavailableReason: "Requires a weekly cash forecast, not built yet (Position Desk Phase 2)." },
      ],
      caveats: {
        unbookedSummerGrazingLots: unbookedSummerGrazing,
      },
    };
  }

  Object.assign(window.UEDash, { getOverviewMetrics });
})();

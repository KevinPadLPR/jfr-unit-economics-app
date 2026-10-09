/** Unit Economics dashboard -- Overview sub-tab. */
window.UEDash = window.UEDash || {};

(function () {
  const { getOverviewMetrics, getMarketPosition, getRanchMonthlyCostSeries } = window.UEDash;
  const { statTileHtml, showError } = window.UEDash;
  const { stackedCostBarChart, unrealizedByLotChart } = window.UEDash;

  async function renderOverview(container) {
    let computed, unavailable, caveats, marketPosition, monthlySpend;
    try {
      [{ computed, unavailable, caveats }, marketPosition, monthlySpend] = await Promise.all([getOverviewMetrics(), getMarketPosition(), getRanchMonthlyCostSeries()]);
    } catch (err) {
      showError(container, err);
      return;
    }

    container.innerHTML = `
      <div class="stack">
        <div>
          <h1 class="text-2xl font-semibold text-foreground">Overview</h1>
          <p class="text-sm text-muted-foreground">Your ranch at a glance — cattle owned, what they cost, and where you stand against the market.</p>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          ${computed.map((m) => statTileHtml({ label: m.label, value: m.value ?? "—", provenance: m.provenance ?? undefined })).join("")}
          ${unavailable.map((m) => statTileHtml({ label: m.label, value: "—", delta: m.unavailableReason, className: "opacity-70" })).join("")}
        </div>
        ${caveats.unbookedSummerGrazingLots > 0 ? `<p class="text-xs text-muted-foreground">Note: ${caveats.unbookedSummerGrazingLots} open 2026 lot(s) show $0 for summer grazing — that's not been booked yet, not a real $0 cost. Feed cost for those lots is understated until it is.</p>` : ""}
        <div class="card" id="monthly-spend-card" style="${monthlySpend.length ? "" : "display:none"}">
          <div class="card-header">
            <h3 class="card-title card-title-base">Ranch spend, by month</h3>
            <p class="card-description">What you've spent running the whole operation, month by month — every lot combined.</p>
          </div>
          <div class="chart-box h-72"><canvas id="monthly-spend-chart"></canvas></div>
        </div>
        <div class="card" id="unrealized-card" style="${marketPosition.length ? "" : "display:none"}">
          <div class="card-header">
            <h3 class="card-title card-title-base">Unrealized position by open lot</h3>
            <p class="card-description">What each open lot would gain or lose if sold today, at the latest market price.</p>
          </div>
          <div class="chart-box h-72"><canvas id="unrealized-chart"></canvas></div>
          ${marketPosition.some((r) => r.lightCalfCaveat) ? `<p class="light-calf-note">Lots under 600 lb are marked at a price meant for heavier cattle, which can show an overly large loss — look at those numbers as a rough estimate, not a firm one.</p>` : ""}
        </div>
      </div>`;

    if (monthlySpend.length) stackedCostBarChart(container.querySelector("#monthly-spend-chart"), monthlySpend, { xKey: "month_end" });
    if (marketPosition.length) {
      unrealizedByLotChart(
        container.querySelector("#unrealized-chart"),
        marketPosition.map((r) => ({ lot: r.lot, unrealized: r.unrealized ?? 0, lightCalfCaveat: r.lightCalfCaveat }))
      );
    }
  }

  Object.assign(window.UEDash, { renderOverview });
})();

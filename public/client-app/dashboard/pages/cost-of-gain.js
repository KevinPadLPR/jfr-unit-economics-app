/** Unit Economics dashboard -- Cost of Gain sub-tab. Lot selection shares
 * window.UEDash.dashState.lot with Lot Detail (picking a lot here or there remembers it either
 * way) instead of a ?lot= query param. */
window.UEDash = window.UEDash || {};

(function () {
  const { listGlLots, getCostOfGain } = window.UEDash;
  const { getWeeklyCostSeries } = window.UEDash;
  const { statTileHtml, reportUnavailableHtml, filterSelect, showError } = window.UEDash;
  const { formatPerLb, formatMoney, formatNumber } = window.UEDash;
  const { directCostBreakdownChart, adgComparisonChart, stackedCostBarChart } = window.UEDash;

  async function renderCostOfGain(container) {
    let lots;
    try {
      lots = await listGlLots();
    } catch (err) {
      showError(container, err);
      return;
    }

    const state = window.UEDash.dashState;
    const lot = state.lot && lots.some((l) => l.lot === state.lot) ? state.lot : lots[0]?.lot ?? null;
    state.lot = lot;

    container.innerHTML = `
      <div class="stack">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold text-foreground">Cost of Gain</h1>
            <p class="text-sm text-muted-foreground">What it's cost to put a pound of gain on this lot, from day one.</p>
          </div>
          <div id="lot-picker"></div>
        </div>
        <div id="body"></div>
      </div>`;

    container.querySelector("#lot-picker").append(
      filterSelect({
        label: "Lot",
        value: lot ?? "",
        options: lots.map((l) => ({ value: l.lot, label: `${l.lot}${l.status ? ` (${l.status})` : ""}` })),
        allowAll: false,
        className: "w-64",
        onChange: (value) => {
          state.lot = value;
          renderCostOfGain(container);
        },
      })
    );

    const body = container.querySelector("#body");
    if (!lot) {
      body.innerHTML = reportUnavailableHtml("No lot selected, or this lot has no GL data.");
      return;
    }

    let cog, weekly;
    try {
      [cog, weekly] = await Promise.all([getCostOfGain(lot), getWeeklyCostSeries(lot)]);
    } catch (err) {
      showError(body, err);
      return;
    }
    const targetAdg = lots.find((l) => l.lot === lot)?.target_adg ?? null;

    if (!cog) {
      body.innerHTML = reportUnavailableHtml("No lot selected, or this lot has no GL data.");
      return;
    }

    body.innerHTML = `
      <div class="stack">
        ${!cog.grazingSummerNativeBooked ? reportUnavailableHtml(`Summer grazing costs for lot ${cog.lot} haven't been booked yet. Feed cost of gain is understated until they are.`) : ""}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          ${statTileHtml({ label: "Cost of Gain: Feed only", value: formatPerLb(cog.cogFeed), provenance: "modeled", delta: formatMoney(cog.feedForage) + " total" })}
          ${statTileHtml({ label: "Cost of Gain: Operating", value: formatPerLb(cog.cogOper), provenance: "modeled", delta: formatMoney(cog.operating) + " total" })}
          ${statTileHtml({ label: "Cost of Gain: All-in", value: formatPerLb(cog.cogAllIn), provenance: "modeled", delta: formatMoney(cog.allIn) + " total" })}
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          ${statTileHtml({ label: "Head-days", value: formatNumber(cog.headDays), provenance: "measured" })}
          ${statTileHtml({ label: "ADG used", value: `${cog.adgUsed.toFixed(2)} lb/day`, provenance: cog.adgProvenance, delta: cog.adgSourceDetail })}
          ${statTileHtml({ label: "Pounds gained (LTD)", value: formatNumber(cog.poundsGained), provenance: "modeled" })}
          ${statTileHtml({ label: "$ / head-day (operating)", value: formatMoney(cog.costPerHeadDayOperating, { cents: true }), provenance: "modeled" })}
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="card" style="${cog.costBreakdown.length ? "" : "display:none"}">
            <div class="card-header"><h3 class="card-title card-title-base">Direct cost breakdown (life-to-date)</h3><p class="card-description">Every direct cost line for this lot, biggest first.</p></div>
            <div class="chart-box h-72"><canvas id="cost-breakdown-chart"></canvas></div>
          </div>
          <div class="card" style="${targetAdg === null ? "display:none" : ""}">
            <div class="card-header"><h3 class="card-title card-title-base">Target vs. actual daily gain</h3><p class="card-description">How this lot's cattle are gaining weight against what was assumed going in. A snapshot, not a trend, since a lot only gets one realized ADG reading at a time.</p></div>
            <div class="chart-box h-48"><canvas id="adg-chart"></canvas></div>
          </div>
        </div>
        <div class="card" style="${weekly.length ? "" : "display:none"}">
          <div class="card-header"><h3 class="card-title card-title-base">Weekly cost, last 13 weeks</h3><p class="card-description">Direct and overhead spend on this lot, week by week.</p></div>
          <div class="chart-box h-64"><canvas id="weekly-cost-chart"></canvas></div>
        </div>
      </div>`;

    if (cog.costBreakdown.length) directCostBreakdownChart(body.querySelector("#cost-breakdown-chart"), cog.costBreakdown);
    if (targetAdg !== null) adgComparisonChart(body.querySelector("#adg-chart"), targetAdg, cog.adgUsed);
    if (weekly.length) stackedCostBarChart(body.querySelector("#weekly-cost-chart"), weekly, { xKey: "week_end" });
  }

  Object.assign(window.UEDash, { renderCostOfGain });
})();

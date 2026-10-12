/**
 * Unit Economics dashboard -- Market Data sub-tab (Client Files/Tab4-Market Data.jpg). Instrument
 * selection lives in window.UEDash.dashState.marketInstrument, same in-memory-state convention as
 * every other sub-tab here.
 */
window.UEDash = window.UEDash || {};

(function () {
  const { getPricingHistory, getFuturesCurve, getLrpPositions, getInternalSales, MARKET_INSTRUMENTS } = window.UEDash;
  const { statTileHtml, badgeHtml, showError, escapeHtml, reportUnavailableHtml, filterSelect, beginRender, isStaleRender } = window.UEDash;
  const { formatMoney, formatNumber, formatDate } = window.UEDash;
  const { pricingHistoryChart, internalSalesChart } = window.UEDash;

  const INSTRUMENT_LABEL = { feeder_cattle: "Feeder cattle", live_cattle: "Live cattle", corn: "Corn" };
  // As-quoted units (docs/sql/2026-09-10_markets_and_positions.sql's own header comment) -- never
  // converted. Cattle cents/lb reads the same number as $/cwt; corn stays cents/bushel.
  const UNIT_LABEL = { feeder_cattle: "/cwt", live_cattle: "/cwt", corn: "¢/bu" };
  const PRICE_PREFIX = { feeder_cattle: "$", live_cattle: "$", corn: "" };

  function priceLabel(instrument, settle) {
    return `${PRICE_PREFIX[instrument]}${Number(settle).toFixed(2)}${UNIT_LABEL[instrument]}`;
  }

  async function renderMarketSection(container, instrument) {
    const token = beginRender(container);
    let history, curve;
    try {
      [history, curve] = await Promise.all([getPricingHistory(instrument), getFuturesCurve(instrument)]);
    } catch (err) {
      if (!isStaleRender(container, token)) showError(container, err);
      return;
    }
    if (isStaleRender(container, token)) return;

    container.innerHTML = `
      <div class="stack">
        <div class="card" style="${history.length ? "" : "display:none"}">
          <div class="card-header"><h3 class="card-title card-title-base">Pricing history</h3><p class="card-description">Every contract month's own settle price over time -- not a single rolled front-month line, so nothing here is a convention we invented.</p></div>
          <div class="chart-box h-72"><canvas id="pricing-history-chart"></canvas></div>
        </div>
        ${!history.length ? reportUnavailableHtml(`No ${INSTRUMENT_LABEL[instrument]} quotes on file yet.`) : ""}
        <div class="card" style="overflow:hidden">
          <div class="card-header"><h3 class="card-title card-title-base">Futures pricing</h3><p class="card-description">The forward curve as of the most recent quote for each contract month.</p></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Contract month</th><th class="text-right">Settle</th><th>As of</th></tr></thead>
              <tbody>
                ${curve.length === 0 ? `<tr><td colspan="3" class="text-center text-muted-foreground">No futures quotes on file yet.</td></tr>` : ""}
                ${curve.map((r) => `<tr><td>${escapeHtml(formatDate(r.contract_month))}</td><td class="text-right">${escapeHtml(priceLabel(instrument, r.settle))}</td><td>${escapeHtml(formatDate(r.quote_date))}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    if (history.length) pricingHistoryChart(container.querySelector("#pricing-history-chart"), history, { unitSuffix: UNIT_LABEL[instrument] });
  }

  async function renderInternalSection(container) {
    const token = beginRender(container);
    let sales;
    try {
      sales = await getInternalSales();
    } catch (err) {
      if (!isStaleRender(container, token)) showError(container, err);
      return;
    }
    if (isStaleRender(container, token)) return;

    const priced = sales.filter((s) => s.price_per_cwt != null);

    container.innerHTML = `
      <div class="stack">
        <p class="text-xs text-muted-foreground">JFR's own real settlement price per sale -- from the app's own sale records (total price ÷ actual buyer pay weight), not a GL entry or outside quote.</p>
        <div class="card" style="${priced.length ? "" : "display:none"}">
          <div class="card-header"><h3 class="card-title card-title-base">Realized price per sale</h3><p class="card-description">Every sale with a recorded pay weight, in order.</p></div>
          <div class="chart-box h-72"><canvas id="internal-sales-chart"></canvas></div>
        </div>
        ${!priced.length ? reportUnavailableHtml("No sales with a recorded pay weight yet.") : ""}
        <div class="card" style="overflow:hidden">
          <div class="card-header"><h3 class="card-title card-title-base">Sales</h3><p class="card-description">Every sale on file, including the ones with no pay weight recorded yet.</p></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Date</th><th>Buyer</th><th class="text-right">Head</th><th class="text-right">Pay weight</th><th class="text-right">$/cwt</th><th class="text-right">$/head</th><th class="text-right">Total</th><th>Notes</th></tr></thead>
              <tbody>
                ${sales.length === 0 ? `<tr><td colspan="8" class="text-center text-muted-foreground">No sales on file yet.</td></tr>` : ""}
                ${sales
                  .map(
                    (s) => `
                  <tr>
                    <td>${escapeHtml(formatDate(s.sale_date))}</td>
                    <td>${s.buyer ? escapeHtml(s.buyer) : "-"}</td>
                    <td class="text-right">${formatNumber(s.head_count)}</td>
                    <td class="text-right" title="${s.net_weight_lb == null ? "Pay weight not recorded for this sale" : ""}">${s.net_weight_lb != null ? `${formatNumber(s.net_weight_lb)} lb` : "-"}</td>
                    <td class="text-right">${s.price_per_cwt != null ? `$${Number(s.price_per_cwt).toFixed(2)}` : "-"}</td>
                    <td class="text-right">${s.price_per_head != null ? formatMoney(s.price_per_head, { cents: true }) : "-"}</td>
                    <td class="text-right">${formatMoney(s.total_price)}</td>
                    <td class="truncate text-muted-foreground" style="max-width:16rem" title="${escapeHtml(s.notes ?? "")}">${s.notes ? escapeHtml(s.notes) : "-"}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    if (priced.length) internalSalesChart(container.querySelector("#internal-sales-chart"), priced);
  }

  async function renderLrpSection(container) {
    const token = beginRender(container);
    let rows;
    try {
      rows = await getLrpPositions();
    } catch (err) {
      if (!isStaleRender(container, token)) showError(container, err);
      return;
    }
    if (isStaleRender(container, token)) return;

    const STATUS_VARIANT = { open: "good", closed: "neutral", expired: "warning" };

    container.innerHTML = `
      <div class="card" style="overflow:hidden">
        <div class="card-header"><h3 class="card-title card-title-base">LRP (Livestock Risk Protection)</h3><p class="card-description">Every LRP endorsement on file, coverage price as quoted (cents/lb = $/cwt), premium in $/head.</p></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>End date</th><th class="text-right">Head</th><th class="text-right">Coverage price</th><th class="text-right">Premium</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>
              ${rows.length === 0 ? `<tr><td colspan="6" class="text-center text-muted-foreground">No LRP endorsements on file.</td></tr>` : ""}
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td>${escapeHtml(formatDate(r.end_date))}</td>
                  <td class="text-right">${formatNumber(r.head)}</td>
                  <td class="text-right">$${Number(r.coverage_price).toFixed(2)}/cwt</td>
                  <td class="text-right">${r.premium != null ? formatMoney(r.premium, { cents: true }) + "/hd" : "-"}</td>
                  <td>${badgeHtml(r.status, STATUS_VARIANT[r.status] ?? "neutral")}</td>
                  <td class="text-muted-foreground">${r.notes ? escapeHtml(r.notes) : "-"}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  async function renderMarketData(container) {
    const state = window.UEDash.dashState;
    const instrument = MARKET_INSTRUMENTS.includes(state.marketInstrument) ? state.marketInstrument : "feeder_cattle";
    const source = state.marketSource === "internal" ? "internal" : "market";
    state.marketInstrument = instrument;
    state.marketSource = source;

    container.innerHTML = `
      <div class="stack">
        <div>
          <h1 class="text-2xl font-semibold text-foreground">Market Data</h1>
          <p class="text-sm text-muted-foreground">CME pricing and hedge coverage for the instruments JFR tracks.</p>
        </div>
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div class="pill-toggle">
            <button type="button" data-source="market">Market</button>
            <button type="button" data-source="internal">Internal</button>
          </div>
          <div id="instrument-picker"></div>
        </div>
        <div id="market-body"></div>
        <div id="lrp-body"></div>
      </div>`;

    container.querySelectorAll("[data-source]").forEach((btn) => btn.classList.toggle("active", btn.dataset.source === source));
    container.querySelectorAll("[data-source]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.marketSource = btn.dataset.source;
        renderMarketData(container);
      })
    );

    const instrumentPicker = container.querySelector("#instrument-picker");
    instrumentPicker.classList.toggle("hidden", source === "internal");
    instrumentPicker.append(
      filterSelect({
        label: "Instrument",
        value: instrument,
        options: MARKET_INSTRUMENTS.map((i) => ({ value: i, label: INSTRUMENT_LABEL[i] })),
        allowAll: false,
        className: "w-48",
        onChange: (value) => {
          state.marketInstrument = value;
          renderMarketData(container);
        },
      })
    );

    const marketBody = container.querySelector("#market-body");
    if (source === "internal") {
      await renderInternalSection(marketBody);
    } else {
      await renderMarketSection(marketBody, instrument);
    }

    await renderLrpSection(container.querySelector("#lrp-body"));
  }

  Object.assign(window.UEDash, { renderMarketData });
})();

/** Unit Economics dashboard -- Lot Detail sub-tab. The lot being viewed lives in
 * window.UEDash.dashState.lot instead of a ?lot= query param -- there is no dynamic route to
 * carry it in here, and window.UEDash.goToLot(lotNumber) (router.js) is how every other
 * sub-tab's "Lot" link jumps here with a specific lot already selected. */
window.UEDash = window.UEDash || {};

(function () {
  const { getLotSheet } = window.UEDash;
  const { listGlLots } = window.UEDash;
  const { getLotFlow } = window.UEDash;
  const { getMonthlyHeadSeries, getWeeklyCostSeries } = window.UEDash;
  const { statTileHtml, filterSelect, badgeHtml, showError, escapeHtml, reportUnavailableHtml } = window.UEDash;
  const { formatMoney, formatNumber, formatDate, formatPct } = window.UEDash;
  const { lotFlowBarChart, monthlyHeadAreaChart, stackedCostBarChart } = window.UEDash;

  const MOVEMENT_BADGE = {
    Purchase: "good",
    "Transfer In": "good",
    Sold: "neutral",
    "Transfer Out": "neutral",
    Died: "critical",
    Adjustment: "warning",
  };

  async function renderLotDetail(container) {
    let allLotsRaw;
    try {
      allLotsRaw = await listGlLots();
    } catch (err) {
      showError(container, err);
      return;
    }

    const state = window.UEDash.dashState;
    let lot = state.lot;
    if (!lot || !allLotsRaw.some((l) => l.lot === lot)) {
      lot = allLotsRaw.find((l) => (l.status ?? "").toLowerCase() === "open")?.lot ?? allLotsRaw[0]?.lot ?? null;
      state.lot = lot;
    }
    if (!lot) {
      container.innerHTML = reportUnavailableHtml("No lots found.");
      return;
    }

    let sheet;
    try {
      sheet = await getLotSheet(lot);
    } catch (err) {
      showError(container, err);
      return;
    }
    if (!sheet) {
      container.innerHTML = reportUnavailableHtml(`Lot "${lot}" was not found.`);
      return;
    }

    const { summary } = sheet;
    const deathPct = summary.head_in ? ((summary.head_dead ?? 0) / summary.head_in) * 100 : null;

    let flow, monthlyHead, weeklyCost;
    try {
      [flow, monthlyHead, weeklyCost] = await Promise.all([getLotFlow(lot, summary.head_on_hand ?? 0), getMonthlyHeadSeries(lot), getWeeklyCostSeries(lot)]);
    } catch (err) {
      showError(container, err);
      return;
    }
    const allLots = allLotsRaw.map((l) => ({ lot: l.lot, status: l.status }));

    const activityRow = (row) => `
      <tr>
        <td>${formatDate(row.date)}</td>
        <td>${row.category === "movement" ? badgeHtml(row.type, MOVEMENT_BADGE[row.type] ?? "neutral") : badgeHtml(row.type, "outline")}</td>
        <td class="text-right">${row.head != null ? formatNumber(row.head) : "-"}</td>
        <td class="text-right">${row.weight ? `${formatNumber(row.weight)} lb` : "-"}</td>
        <td class="text-right">${formatMoney(row.amount)}</td>
        <td class="text-right">${row.dollarsPerHead != null ? formatMoney(row.dollarsPerHead, { cents: true }) : "-"}</td>
        <td class="truncate" style="max-width:20rem" title="${escapeHtml(row.notes ?? "")}">${row.notes ? escapeHtml(row.notes) : "-"}</td>
      </tr>`;

    const expenseRow = (line) => `
      <tr>
        <td>${escapeHtml(line.label)}</td>
        <td class="text-right">${formatMoney(line.total)}</td>
        <td class="text-right">${formatMoney(line.perHead, { cents: true })}</td>
        <td class="text-right">${formatMoney(line.perCwt, { cents: true })}</td>
      </tr>`;

    container.innerHTML = `
      <div class="stack">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold text-foreground">${escapeHtml(sheet.lot)}</h1>
            <p class="text-sm text-muted-foreground">${escapeHtml(summary.profit_center ?? "")} · ${escapeHtml(sheet.scheduleFeedType ?? "feed type n/a")} · ${escapeHtml(sheet.scheduleLocationType ?? "location n/a")} ${sheet.scheduleState ? `· ${escapeHtml(sheet.scheduleState)}` : ""}</p>
          </div>
          <div class="flex items-center gap-3">
            <div id="lot-picker"></div>
            ${badgeHtml(summary.status ?? "Unknown", summary.status?.toLowerCase() === "open" ? "good" : "neutral")}
          </div>
        </div>

        ${sheet.crosswalk.decisionNeeded ? `<p class="notice-detail" style="border:1px solid color-mix(in srgb, var(--status-warning) 50%, var(--border));background:color-mix(in srgb, var(--status-warning) 8%, white);border-radius:var(--radius-md);padding:.5rem .75rem;font-size:.75rem;color:#5c3d00">We need to confirm which app record this lot matches before its head/weight numbers can be trusted: ${escapeHtml(sheet.crosswalk.note ?? "")}</p>` : ""}

        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          ${statTileHtml({ label: "Date In", value: formatDate(summary.date_in) })}
          ${statTileHtml({ label: "Avg DOF", value: formatNumber(summary.avg_dof) })}
          ${statTileHtml({ label: "Head On Hand", value: formatNumber(summary.head_on_hand) })}
          ${statTileHtml({ label: "Target Out Date", value: formatDate(summary.target_out_date) })}
          ${statTileHtml({ label: "Books Through", value: formatDate(summary.books_through) })}
          ${statTileHtml({ label: "Last Activity", value: formatDate(summary.last_activity) })}
        </div>

        ${flow ? `
        <div class="card">
          <div class="card-header"><h3 class="card-title card-title-base">Cattle flow</h3><p class="card-description">Where this lot's cattle came from and where they've gone, life-to-date. (Shown as inflow/outflow bars here, not a flow diagram.)</p></div>
          <div class="chart-box h-80"><canvas id="flow-chart"></canvas></div>
        </div>` : ""}

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="card" style="${monthlyHead.length ? "" : "display:none"}">
            <div class="card-header"><h3 class="card-title card-title-base">Head on hand, by month</h3><p class="card-description">How the count on this lot has moved since it started.</p></div>
            <div class="chart-box h-64"><canvas id="monthly-head-chart"></canvas></div>
          </div>
          <div class="card" style="${weeklyCost.length ? "" : "display:none"}">
            <div class="card-header"><h3 class="card-title card-title-base">Weekly cost, last 13 weeks</h3><p class="card-description">Direct and overhead spend on this lot, week by week.</p></div>
            <div class="chart-box h-64"><canvas id="weekly-cost-chart"></canvas></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3 class="card-title card-title-base">Deads</h3></div>
          <div class="card-content flex gap-8">
            <div><p class="text-xs text-muted-foreground">Total dead</p><p class="text-lg font-semibold">${formatNumber(summary.head_dead)}</p></div>
            <div><p class="text-xs text-muted-foreground">Death %</p><p class="text-lg font-semibold">${formatPct(deathPct)}</p></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3 class="card-title card-title-base">Activity</h3><p class="card-description">Every head movement and cost on this lot, in order.</p></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Date</th><th>Type</th><th class="text-right">Head</th><th class="text-right">Weight</th><th class="text-right">Amount</th><th class="text-right">$/Head</th><th>Notes</th></tr></thead>
              <tbody>${sheet.activity.length === 0 ? `<tr><td colspan="7" class="text-center text-muted-foreground">No activity recorded</td></tr>` : sheet.activity.map(activityRow).join("")}</tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3 class="card-title card-title-base">Expenses</h3><p class="card-description">Every dollar spent on this lot since day one.</p></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Line</th><th class="text-right">Total</th><th class="text-right">Per Head</th><th class="text-right">Per Cwt</th></tr></thead>
              <tbody>
                ${sheet.expenses.direct.map(expenseRow).join("")}
                <tr style="font-weight:500">${expenseRow(sheet.expenses.directTotal).replace("<tr>", "").replace("</tr>", "")}</tr>
                ${expenseRow(sheet.expenses.general)}
              </tbody>
              <tfoot>${expenseRow(sheet.expenses.total)}</tfoot>
            </table>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          ${statTileHtml({ label: "Total Outstanding Cost", value: formatMoney(sheet.outstandingCost), provenance: "measured" })}
          ${statTileHtml({ label: "Market Value (on hand)", value: sheet.markedValueOnHand !== null ? formatMoney(sheet.markedValueOnHand) : "-", provenance: "modeled", delta: sheet.markedValueOnHand === null ? "Lot is closed or has no head on hand" : undefined })}
          ${statTileHtml({ label: "Estimated P/L", value: formatMoney(sheet.estimatedPL), deltaTone: sheet.estimatedPL >= 0 ? "good" : "bad", provenance: "modeled" })}
        </div>
      </div>`;

    container.querySelector("#lot-picker").append(
      filterSelect({
        label: "Lot",
        value: lot,
        options: allLots.map((l) => ({ value: l.lot, label: `${l.lot}${l.status ? ` (${l.status})` : ""}` })),
        allowAll: false,
        className: "w-64",
        onChange: (value) => {
          state.lot = value;
          renderLotDetail(container);
        },
      })
    );

    if (flow) lotFlowBarChart(container.querySelector("#flow-chart"), flow, lot);
    if (monthlyHead.length) monthlyHeadAreaChart(container.querySelector("#monthly-head-chart"), monthlyHead);
    if (weeklyCost.length) stackedCostBarChart(container.querySelector("#weekly-cost-chart"), weeklyCost, { xKey: "week_end" });
  }

  Object.assign(window.UEDash, { renderLotDetail });
})();

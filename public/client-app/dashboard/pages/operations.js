/**
 * Unit Economics dashboard -- Operations sub-tab (Client Files/Tab3-Operations.jpg). Lot
 * selection shares window.UEDash.dashState.lot with Cost of Gain/Lot Detail. Per-Head toggle is
 * this page's own state (window.UEDash.dashState.opsPerHead).
 */
window.UEDash = window.UEDash || {};

(function () {
  const { listGlLots } = window.UEDash;
  const { getOperationsSummary, getMonthlyCostBreakdown } = window.UEDash;
  const { statTileHtml, reportUnavailableHtml, filterSelect, showError, escapeHtml } = window.UEDash;
  const { formatMoney, formatNumber, formatDate } = window.UEDash;

  const CATEGORY_ROWS = [
    { key: "purchase", label: "Purchase" },
    { key: "medicine", label: "Medicine" },
    { key: "freight", label: "Freight" },
    { key: "feed", label: "Feed" },
    { key: "other", label: "Other" },
  ];

  function renderBreakdownTable(container, months, headIn, perHead) {
    const money = (n) => (perHead ? formatMoney(headIn > 0 ? n / headIn : null, { cents: true }) : formatMoney(n));
    container.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>Cost</th>
          ${months.map((m) => `<th class="text-right">${escapeHtml(formatDate(m.month + "-01"))}</th>`).join("")}
          <th class="text-right">Total</th>
        </tr></thead>
        <tbody>
          ${CATEGORY_ROWS.map(
            (cat) => `
            <tr>
              <td>${cat.label}</td>
              ${months.map((m) => `<td class="text-right">${money(m[cat.key])}</td>`).join("")}
              <td class="text-right font-medium">${money(months.reduce((s, m) => s + m[cat.key], 0))}</td>
            </tr>`
          ).join("")}
        </tbody>
        <tfoot><tr>
          <td>Total Cost</td>
          ${months.map((m) => `<td class="text-right">${money(m.total)}</td>`).join("")}
          <td class="text-right">${money(months.reduce((s, m) => s + m.total, 0))}</td>
        </tr></tfoot>
      </table>`;
  }

  async function renderOperations(container) {
    let lots;
    try {
      lots = await listGlLots();
    } catch (err) {
      showError(container, err);
      return;
    }

    const state = window.UEDash.dashState;
    const lot = state.lot && lots.some((l) => l.lot === state.lot) ? state.lot : lots[0]?.lot ?? null;
    const perHead = !!state.opsPerHead;
    state.lot = lot;

    container.innerHTML = `
      <div class="stack">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold text-foreground">Operations</h1>
            <p class="text-sm text-muted-foreground">Cost economics for one lot, month by month.</p>
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
          renderOperations(container);
        },
      })
    );

    const body = container.querySelector("#body");
    if (!lot) {
      body.innerHTML = reportUnavailableHtml("No lot selected, or this lot has no GL data.");
      return;
    }

    let summary, months;
    try {
      [summary, months] = await Promise.all([getOperationsSummary(lot), getMonthlyCostBreakdown(lot)]);
    } catch (err) {
      showError(body, err);
      return;
    }
    if (!summary) {
      body.innerHTML = reportUnavailableHtml("No lot selected, or this lot has no GL data.");
      return;
    }

    body.innerHTML = `
      <div class="stack">
        <p class="text-xs text-muted-foreground">Data available as of ${escapeHtml(formatDate(summary.asOfDate))}.</p>
        ${!summary.isMeasured ? reportUnavailableHtml(`${summary.adgSourceDetail} Estimated weight, average daily gain and cost of gain need a real measured ADG, so none of those three show a number for this lot.`) : ""}
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          ${statTileHtml({ label: "Total head", value: formatNumber(summary.totalHead), provenance: "measured" })}
          ${statTileHtml({ label: "Days on feed", value: formatNumber(summary.daysOnFeed), provenance: "measured" })}
          ${statTileHtml({ label: "Starting weight", value: summary.startingWeight != null ? `${formatNumber(summary.startingWeight)} lb` : "-", provenance: "measured" })}
          ${statTileHtml({ label: "Estimated weight", value: summary.estimatedWeight != null ? `${formatNumber(Math.round(summary.estimatedWeight))} lb` : "-", provenance: summary.isMeasured ? "modeled" : undefined, delta: summary.isMeasured ? summary.adgSourceDetail : undefined })}
          ${statTileHtml({ label: "Average daily gain", value: summary.adgUsed != null ? `${summary.adgUsed.toFixed(2)} lb/day` : "-", provenance: summary.isMeasured ? "measured" : undefined })}
          ${statTileHtml({ label: "Cost of gain, all-in", value: summary.cogAllIn != null ? `$${summary.cogAllIn.toFixed(2)}/lb` : "-", provenance: summary.isMeasured ? "modeled" : undefined })}
          ${statTileHtml({ label: "Total cost to date", value: formatMoney(summary.totalCostToDate), provenance: "measured" })}
        </div>
        <div class="card" style="overflow:hidden">
          <div class="card-header card-header-row">
            <div><h3 class="card-title card-title-base">Cost, by month</h3><p class="card-description">Purchase, medicine, freight, feed and everything else, month by month.</p></div>
            <div class="flex gap-1">
              <button type="button" class="btn btn-outline btn-sm ${!perHead ? "active" : ""}" data-per-head="false">Total $</button>
              <button type="button" class="btn btn-outline btn-sm ${perHead ? "active" : ""}" data-per-head="true">Per head</button>
            </div>
          </div>
          <div class="table-wrap" id="breakdown-table"></div>
        </div>
      </div>`;

    if (months.length === 0) {
      body.querySelector("#breakdown-table").innerHTML = `<p class="text-sm text-muted-foreground" style="padding:1rem;">No Cattle/Direct/Indirect transactions recorded for this lot yet.</p>`;
    } else {
      renderBreakdownTable(body.querySelector("#breakdown-table"), months, summary.headIn, perHead);
    }

    body.querySelectorAll("[data-per-head]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.opsPerHead = btn.dataset.perHead === "true";
        renderOperations(container);
      })
    );
  }

  Object.assign(window.UEDash, { renderOperations });
})();

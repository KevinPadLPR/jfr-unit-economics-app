/**
 * Unit Economics dashboard -- Overview sub-tab. Rebuilt 2026-10-12 per John's sketch
 * (Client Files/tab1-Overview.jpg). Time period (From/Month, To/Month) lives in
 * window.UEDash.dashState (router.js), same in-memory-state convention as every other sub-tab
 * here -- there's no URL to carry it in inside a tab.
 */
window.UEDash = window.UEDash || {};

(function () {
  const { getOverviewData } = window.UEDash;
  const { statTileHtml, reportUnavailableHtml, filterSelect, showError, escapeHtml, lotLinkHtml } = window.UEDash;
  const { formatNumber, formatDate } = window.UEDash;

  async function renderOverview(container) {
    let months;
    try {
      months = await window.UEDash.getAvailableMonths();
    } catch (err) {
      showError(container, err);
      return;
    }
    if (!months.length) {
      container.innerHTML = reportUnavailableHtml("No head-count history yet.");
      return;
    }

    const state = window.UEDash.dashState;
    // "Data available as of" is always the newest month on file -- a fact about the data, not a
    // selectable input. From/To default to that same month (a single-month view, same shape as
    // today), widen the range to go back further.
    const asOfDate = months[0];
    const toMonth = state.overviewTo && months.includes(state.overviewTo) ? state.overviewTo : asOfDate;
    const fromMonth = state.overviewFrom && months.includes(state.overviewFrom) && state.overviewFrom <= toMonth ? state.overviewFrom : toMonth;
    state.overviewFrom = fromMonth;
    state.overviewTo = toMonth;

    container.innerHTML = `
      <div class="stack">
        <div>
          <h1 class="text-2xl font-semibold text-foreground">Overview</h1>
          <p class="text-sm text-muted-foreground">Cattle inventory for a selected time period -- data available as of ${escapeHtml(formatDate(asOfDate))}.</p>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <div id="from-picker"></div>
          <div id="to-picker"></div>
        </div>
        <div id="body"></div>
      </div>`;

    const monthOptions = months.map((m) => ({ value: m, label: formatDate(m) })).reverse(); // oldest first in the dropdowns, newest first is only for "as of"

    container.querySelector("#from-picker").append(
      filterSelect({
        label: "Time period from",
        value: fromMonth,
        options: monthOptions,
        allowAll: false,
        className: "w-48",
        onChange: (value) => {
          state.overviewFrom = value;
          renderOverview(container);
        },
      })
    );
    container.querySelector("#to-picker").append(
      filterSelect({
        label: "to",
        value: toMonth,
        options: monthOptions.filter((o) => o.value >= fromMonth),
        allowAll: false,
        className: "w-48",
        onChange: (value) => {
          state.overviewTo = value;
          renderOverview(container);
        },
      })
    );

    const body = container.querySelector("#body");
    let data;
    try {
      data = await getOverviewData(fromMonth, toMonth);
    } catch (err) {
      showError(body, err);
      return;
    }
    const { totals, rows } = data;
    const netChange = totals.ending - totals.beginning;

    body.innerHTML = `
      <div class="stack">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          ${statTileHtml({ label: "Starting balance", value: formatNumber(totals.beginning), provenance: "measured" })}
          ${statTileHtml({ label: "Ending balance", value: formatNumber(totals.ending), provenance: "measured" })}
          ${statTileHtml({
            label: "Net change",
            value: `${netChange >= 0 ? "+" : ""}${formatNumber(netChange)}`,
            deltaTone: netChange >= 0 ? "good" : "bad",
            provenance: "measured",
          })}
          ${statTileHtml({ label: "Purchased", value: formatNumber(totals.purchased), provenance: "measured" })}
          ${statTileHtml({ label: "Died", value: formatNumber(totals.died), provenance: "measured" })}
        </div>
        <div class="card" style="overflow:hidden">
          <div class="card-header"><h3 class="card-title card-title-base">Open lots</h3><p class="card-description">Every lot open today, head movement for the selected period.</p></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr>
                <th>Lot</th><th>Profit center</th>
                <th class="text-right">Starting balance</th><th class="text-right">Births</th><th class="text-right">Purchases</th>
                <th class="text-right">Transfers in</th><th class="text-right">Deaths</th><th class="text-right">Sold</th>
                <th class="text-right">Transfers out</th><th class="text-right">Ending balance</th>
              </tr></thead>
              <tbody>
                ${rows.length === 0 ? `<tr><td colspan="10" class="text-center text-muted-foreground">No open lots had activity in this period</td></tr>` : ""}
                ${rows
                  .map(
                    (r) => `
                  <tr>
                    <td class="font-medium">${lotLinkHtml(r.lot)}</td>
                    <td>${r.profitCenter ? escapeHtml(r.profitCenter) : "-"}</td>
                    <td class="text-right">${formatNumber(r.beginning)}</td>
                    <td class="text-right">${formatNumber(r.born)}</td>
                    <td class="text-right">${formatNumber(r.purchased)}</td>
                    <td class="text-right">${formatNumber(r.transferIn)}</td>
                    <td class="text-right">${formatNumber(r.died)}</td>
                    <td class="text-right">${formatNumber(r.sold)}</td>
                    <td class="text-right">${formatNumber(r.transferOut)}</td>
                    <td class="text-right font-medium">${formatNumber(r.ending)}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
              <tfoot><tr>
                <td>Total</td><td></td>
                <td class="text-right">${formatNumber(totals.beginning)}</td>
                <td class="text-right">${formatNumber(totals.born)}</td>
                <td class="text-right">${formatNumber(totals.purchased)}</td>
                <td class="text-right">${formatNumber(totals.transferIn)}</td>
                <td class="text-right">${formatNumber(totals.died)}</td>
                <td class="text-right">${formatNumber(totals.sold)}</td>
                <td class="text-right">${formatNumber(totals.transferOut)}</td>
                <td class="text-right">${formatNumber(totals.ending)}</td>
              </tr></tfoot>
            </table>
          </div>
        </div>
      </div>`;
  }

  Object.assign(window.UEDash, { renderOverview });
})();

/**
 * Unit Economics dashboard -- Financial sub-tab (Client Files/Tab2-Financial.jpg). Lot selection
 * and Monthly/Weekly period are this page's own state (window.UEDash.dashState.financialLot/
 * financialPeriod) -- not shared with Cost of Gain/Lot Detail's single-lot dashState.lot.
 */
window.UEDash = window.UEDash || {};

(function () {
  const { listGlLots } = window.UEDash;
  const { getLotFinancials } = window.UEDash;
  const { reportUnavailableHtml, showError, escapeHtml, filterSelect, ALL } = window.UEDash;
  const { formatMoney, formatDate } = window.UEDash;

  const ROWS = [
    { key: "revenue", label: "Revenue" },
    { key: "cattleCost", label: "Cattle Cost" },
    { key: "direct", label: "Direct" },
    { key: "indirect", label: "Indirect" },
  ];

  function periodLabel(period, value) {
    return period === "week" ? formatDate(value) : formatDate(String(value).length === 7 ? `${value}-01` : value);
  }

  function renderTable(container, rows, period) {
    if (!rows.length) {
      container.innerHTML = `<p class="text-sm text-muted-foreground" style="padding:1rem;">No Revenue/Cattle/Direct/Indirect transactions recorded for this selection yet.</p>`;
      return;
    }
    const total = (key) => rows.reduce((s, r) => s + r[key], 0);
    container.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>$</th>
          ${rows.map((r) => `<th class="text-right">${escapeHtml(periodLabel(period, r.period))}</th>`).join("")}
          <th class="text-right">Total</th>
        </tr></thead>
        <tbody>
          ${ROWS.map(
            (row) => `
            <tr>
              <td>${row.label}</td>
              ${rows.map((r) => `<td class="text-right">${formatMoney(r[row.key])}</td>`).join("")}
              <td class="text-right font-medium">${formatMoney(total(row.key))}</td>
            </tr>`
          ).join("")}
        </tbody>
        <tfoot><tr>
          <td>Net Income</td>
          ${rows.map((r) => `<td class="text-right" style="color:${r.netIncome >= 0 ? "#3f5c1f" : "#8a3115"}">${formatMoney(r.netIncome)}</td>`).join("")}
          <td class="text-right" style="color:${total("netIncome") >= 0 ? "#3f5c1f" : "#8a3115"}">${formatMoney(total("netIncome"))}</td>
        </tr></tfoot>
      </table>`;
  }

  async function renderFinancial(container) {
    let lots;
    try {
      lots = await listGlLots();
    } catch (err) {
      showError(container, err);
      return;
    }

    const state = window.UEDash.dashState;

    container.innerHTML = `
      <div class="stack">
        <div>
          <h1 class="text-2xl font-semibold text-foreground">Financial</h1>
          <p class="text-sm text-muted-foreground">Revenue, cost and net income -- one lot, several, or the whole ranch.</p>
        </div>
        <div class="flex flex-wrap items-end gap-4">
          <div class="pill-toggle" id="period-toggle">
            <button type="button" data-period="month" class="${state.financialPeriod === "month" ? "active" : ""}">Monthly</button>
            <button type="button" data-period="week" class="${state.financialPeriod === "week" ? "active" : ""}">Weekly</button>
          </div>
          <div id="lot-picker"></div>
        </div>
        <div class="card" style="overflow:hidden">
          <div class="card-header"><h3 class="card-title card-title-base">Revenue &amp; cost, by ${state.financialPeriod === "week" ? "week" : "month"}</h3><p class="card-description">Revenue less Cattle Cost, Direct and Indirect -- what's left is Net Income.</p></div>
          <div class="table-wrap" id="financial-table"></div>
        </div>
      </div>`;

    container.querySelector("#lot-picker").append(
      filterSelect({
        label: "Lot",
        value: state.financialLot,
        options: lots.map((l) => ({ value: l.lot, label: `${l.lot}${l.status ? ` (${l.status})` : ""}` })),
        allowAll: true,
        className: "w-64",
        onChange: (value) => {
          state.financialLot = value;
          renderFinancial(container);
        },
      })
    );
    container.querySelectorAll("[data-period]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.financialPeriod = btn.dataset.period;
        renderFinancial(container);
      })
    );

    const tableHost = container.querySelector("#financial-table");
    let rows;
    try {
      rows = await getLotFinancials({ lots: state.financialLot === ALL ? null : [state.financialLot], period: state.financialPeriod });
    } catch (err) {
      showError(tableHost, err);
      return;
    }
    if (rows === null) {
      tableHost.innerHTML = reportUnavailableHtml(
        "This tab's data views haven't been added to the client's Supabase project yet (docs/sql/2026-10-12_lot_financial_views.sql is drafted and ready to apply). Nothing to show until that runs."
      );
      return;
    }
    renderTable(tableHost, rows, state.financialPeriod);
  }

  Object.assign(window.UEDash, { renderFinancial });
})();

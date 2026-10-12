/**
 * Unit Economics dashboard -- Financial sub-tab (Client Files/Tab2-Financial.jpg). Lot selection
 * and Monthly/Weekly period are this page's own state (window.UEDash.dashState.financialLots/
 * financialPeriod) -- not shared with Cost of Gain/Lot Detail's single-lot dashState.lot, since
 * this page supports selecting several lots (or all of them) at once.
 */
window.UEDash = window.UEDash || {};

(function () {
  const { listGlLots } = window.UEDash;
  const { getLotFinancials } = window.UEDash;
  const { reportUnavailableHtml, showError, escapeHtml } = window.UEDash;
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
          <label class="field" style="width:19rem">
            <span class="flex items-center" style="justify-content:space-between">
              <span>Lots</span>
              <span style="display:flex;align-items:center;gap:.35rem;font-weight:normal;white-space:nowrap">
                <input type="checkbox" id="all-lots-toggle" ${state.financialLots === null ? "checked" : ""} /> All lots
              </span>
            </span>
            <select id="lots-select" multiple size="5" title="Ctrl/shift-click to select several" ${state.financialLots === null ? "disabled" : ""}>
              ${lots.map((l) => `<option value="${escapeHtml(l.lot)}" ${state.financialLots?.includes(l.lot) ? "selected" : ""}>${escapeHtml(l.lot)}${l.status ? ` (${escapeHtml(l.status)})` : ""}</option>`).join("")}
            </select>
          </label>
          <div class="flex gap-1">
            <button type="button" class="btn btn-outline btn-sm ${state.financialPeriod === "month" ? "active" : ""}" data-period="month">Monthly</button>
            <button type="button" class="btn btn-outline btn-sm ${state.financialPeriod === "week" ? "active" : ""}" data-period="week">Weekly</button>
          </div>
        </div>
        <div class="card" style="overflow:hidden">
          <div class="card-header"><h3 class="card-title card-title-base">Revenue &amp; cost, by ${state.financialPeriod === "week" ? "week" : "month"}</h3><p class="card-description">Revenue less Cattle Cost, Direct and Indirect -- what's left is Net Income.</p></div>
          <div class="table-wrap" id="financial-table"></div>
        </div>
      </div>`;

    container.querySelector("#all-lots-toggle").addEventListener("change", (e) => {
      state.financialLots = e.target.checked ? null : [];
      renderFinancial(container);
    });
    container.querySelector("#lots-select").addEventListener("change", (e) => {
      state.financialLots = [...e.target.selectedOptions].map((o) => o.value);
      renderFinancial(container);
    });
    container.querySelectorAll("[data-period]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.financialPeriod = btn.dataset.period;
        renderFinancial(container);
      })
    );

    const tableHost = container.querySelector("#financial-table");
    let rows;
    try {
      rows = await getLotFinancials({ lots: state.financialLots, period: state.financialPeriod });
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

/** Unit Economics dashboard -- Master Lot Schedule sub-tab. */
window.UEDash = window.UEDash || {};

(function () {
  const { listGlLots } = window.UEDash;
  const { statTileHtml, filterSelect, badgeHtml, showError, escapeHtml, ALL, lotLinkHtml } = window.UEDash;
  const { formatNumber, formatDate } = window.UEDash;
  const { headCountBarChart } = window.UEDash;

  const STATUS_VARIANT = { Open: "good", Closed: "neutral" };

  function statusBadge(status) {
    if (!status) return badgeHtml("Unknown", "neutral");
    return badgeHtml(status, STATUS_VARIANT[status] ?? "neutral");
  }

  function uniqueOptions(rows, key) {
    const values = [...new Set(rows.map((r) => r[key]).filter(Boolean))];
    return values.sort().map((v) => ({ value: v, label: v }));
  }

  let openRows = [];

  function drawHeadByGroupChart(container) {
    const totals = new Map();
    for (const row of openRows) {
      const key = row.profit_center ?? "Unspecified";
      totals.set(key, (totals.get(key) ?? 0) + (row.head_on_hand ?? 0));
    }
    const data = [...totals.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    headCountBarChart(container.querySelector("#head-by-group-chart"), data);
    container.querySelector("#head-by-group-desc").textContent = "Every open lot's head count, grouped by profit center.";
  }

  function renderTable(container, rows, mountId, filters) {
    const term = filters.search.trim().toLowerCase();
    const filtered = rows.filter((r) => (filters.status === ALL || r.status === filters.status) && (filters.profitCenter === ALL || r.profit_center === filters.profitCenter) && (!term || r.lot.toLowerCase().includes(term)));
    container.querySelector("#filtered-count").textContent = `${filtered.length} of ${rows.length} lots`;
    container.querySelector("#" + mountId).innerHTML = `
      <table class="data-table">
        <thead><tr><th>Lot</th><th>Status</th><th>Profit center</th><th class="text-right">Head on hand</th><th>Last activity</th></tr></thead>
        <tbody>
          ${filtered
            .map(
              (l) => `
            <tr>
              <td class="font-medium">${lotLinkHtml(l.lot)}</td>
              <td>${statusBadge(l.status)}</td>
              <td>${l.profit_center ? escapeHtml(l.profit_center) : "-"}</td>
              <td class="text-right">${formatNumber(l.head_on_hand)}</td>
              <td>${formatDate(l.last_activity)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  }

  async function renderLots(container) {
    let lots;
    try {
      lots = await listGlLots();
    } catch (err) {
      showError(container, err);
      return;
    }

    const open = lots.filter((l) => (l.status ?? "").toLowerCase() === "open");
    const closed = lots.filter((l) => (l.status ?? "").toLowerCase() === "closed");
    const totalHeadOnHand = open.reduce((s, l) => s + (l.head_on_hand ?? 0), 0);
    openRows = open;

    container.innerHTML = `
      <div class="stack">
        <div>
          <h1 class="text-2xl font-semibold text-foreground">Master Lot Schedule</h1>
          <p class="text-sm text-muted-foreground">Every lot JFR has run, and where things stand today.</p>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          ${statTileHtml({ label: "Total lots", value: formatNumber(lots.length) })}
          ${statTileHtml({ label: "Open", value: formatNumber(open.length) })}
          ${statTileHtml({ label: "Closed", value: formatNumber(closed.length) })}
          ${statTileHtml({ label: "Head on hand", value: formatNumber(totalHeadOnHand) })}
        </div>
        <div class="card">
          <div class="card-header"><h3 class="card-title card-title-base">Head on hand today</h3><p class="card-description" id="head-by-group-desc"></p></div>
          <div class="chart-box h-64"><canvas id="head-by-group-chart"></canvas></div>
        </div>
        <div class="stack" style="gap:1rem">
          <div class="flex flex-wrap items-end gap-3">
            <label class="field">Search<input class="input" id="search-input" placeholder="Lot name..." style="width:12rem" /></label>
            <div id="status-filter"></div>
            <div id="profit-center-filter"></div>
            <p class="text-sm text-muted-foreground ml-auto" id="filtered-count"></p>
          </div>
          <div class="card" style="overflow:hidden">
            <div class="table-wrap" id="lots-table"></div>
          </div>
        </div>
      </div>`;

    drawHeadByGroupChart(container);

    const filters = { search: "", status: ALL, profitCenter: ALL };
    const refresh = () => renderTable(container, lots, "lots-table", filters);

    container.querySelector("#search-input").addEventListener("input", (e) => {
      filters.search = e.target.value;
      refresh();
    });
    container.querySelector("#status-filter").append(filterSelect({ label: "Status", value: ALL, options: uniqueOptions(lots, "status"), className: "w-40", onChange: (v) => { filters.status = v; refresh(); } }));
    container.querySelector("#profit-center-filter").append(filterSelect({ label: "Profit center", value: ALL, options: uniqueOptions(lots, "profit_center"), className: "w-40", onChange: (v) => { filters.profitCenter = v; refresh(); } }));
    refresh();
  }

  Object.assign(window.UEDash, { renderLots });
})();

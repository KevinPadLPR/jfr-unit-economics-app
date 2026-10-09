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

  let groupBy = "feed";
  let openRows = [];

  function drawHeadByGroupChart(container) {
    const totals = new Map();
    for (const row of openRows) {
      const key = (groupBy === "feed" ? row.feed_type : row.location_type) ?? "Unspecified";
      totals.set(key, (totals.get(key) ?? 0) + (row.head_on_hand ?? 0));
    }
    const data = [...totals.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    headCountBarChart(container.querySelector("#head-by-group-chart"), data);
    container.querySelector("#head-by-group-desc").textContent = `Every open lot's head count, grouped by ${groupBy === "feed" ? "feed type" : "location"}.`;
    container.querySelectorAll("[data-group]").forEach((btn) => btn.classList.toggle("active", btn.dataset.group === groupBy));
  }

  function renderTable(container, rows, mountId, filters) {
    const term = filters.search.trim().toLowerCase();
    const filtered = rows.filter(
      (r) => (filters.status === ALL || r.status === filters.status) && (filters.feedType === ALL || r.feed_type === filters.feedType) && (filters.locationType === ALL || r.location_type === filters.locationType) && (!term || r.lot.toLowerCase().includes(term))
    );
    container.querySelector("#filtered-count").textContent = `${filtered.length} of ${rows.length} lots`;
    container.querySelector("#" + mountId).innerHTML = `
      <table class="data-table">
        <thead><tr><th>Lot</th><th>Status</th><th>Feed type</th><th>Location</th><th class="text-right">Head on hand</th><th>Last activity</th></tr></thead>
        <tbody>
          ${filtered
            .map(
              (l) => `
            <tr>
              <td class="font-medium">${lotLinkHtml(l.lot)}</td>
              <td>${statusBadge(l.status)}</td>
              <td>${l.feed_type ? escapeHtml(l.feed_type) : "-"}</td>
              <td>${l.location_type ? escapeHtml(l.location_type) : "-"}</td>
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
          <div class="card-header card-header-row">
            <div><h3 class="card-title card-title-base">Head on hand today</h3><p class="card-description" id="head-by-group-desc"></p></div>
            <div class="flex gap-1">
              <button type="button" class="btn btn-outline btn-sm" data-group="feed">Feed type</button>
              <button type="button" class="btn btn-outline btn-sm" data-group="location">Location</button>
            </div>
          </div>
          <div class="chart-box h-64"><canvas id="head-by-group-chart"></canvas></div>
        </div>
        <div class="stack" style="gap:1rem">
          <div class="flex flex-wrap items-end gap-3">
            <label class="field">Search<input class="input" id="search-input" placeholder="Lot name..." style="width:12rem" /></label>
            <div id="status-filter"></div>
            <div id="feed-filter"></div>
            <div id="location-filter"></div>
            <p class="text-sm text-muted-foreground ml-auto" id="filtered-count"></p>
          </div>
          <div class="card" style="overflow:hidden">
            <div class="table-wrap" id="lots-table"></div>
          </div>
        </div>
      </div>`;

    drawHeadByGroupChart(container);
    container.querySelectorAll("[data-group]").forEach((btn) =>
      btn.addEventListener("click", () => {
        groupBy = btn.dataset.group;
        drawHeadByGroupChart(container);
      })
    );

    const filters = { search: "", status: ALL, feedType: ALL, locationType: ALL };
    const refresh = () => renderTable(container, lots, "lots-table", filters);

    container.querySelector("#search-input").addEventListener("input", (e) => {
      filters.search = e.target.value;
      refresh();
    });
    container.querySelector("#status-filter").append(filterSelect({ label: "Status", value: ALL, options: uniqueOptions(lots, "status"), className: "w-40", onChange: (v) => { filters.status = v; refresh(); } }));
    container.querySelector("#feed-filter").append(filterSelect({ label: "Feed type", value: ALL, options: uniqueOptions(lots, "feed_type"), className: "w-40", onChange: (v) => { filters.feedType = v; refresh(); } }));
    container.querySelector("#location-filter").append(filterSelect({ label: "Location", value: ALL, options: uniqueOptions(lots, "location_type"), className: "w-40", onChange: (v) => { filters.locationType = v; refresh(); } }));
    refresh();
  }

  Object.assign(window.UEDash, { renderLots });
})();

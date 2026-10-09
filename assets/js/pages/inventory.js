/** Direct port of src/app/dashboard/inventory/page.tsx (+ month-picker.tsx,
 * waterfall-chart.tsx, balance-bar-chart.tsx). */
import { requireSession } from "../auth.js";
import { getAvailableMonths, getInventorySnapshot } from "../data/inventory.js";
import { statTileHtml, reportUnavailableHtml, filterSelect, showError, escapeHtml } from "../dom.js";
import { formatNumber, formatDate } from "../format.js";
import { headWaterfallChart, headCountBarChart } from "../charts.js";

const main = document.getElementById("main");
let currentRows = [];
let groupBy = "location";

function currentMonthParam() {
  return new URLSearchParams(window.location.search).get("month");
}

function groupKey(row, by) {
  if (by === "lot") return row.lot;
  if (by === "location") return row.locationType ?? "Unspecified";
  return row.feedType ?? "Unspecified";
}

function drawBalanceChart() {
  const totals = new Map();
  for (const row of currentRows) {
    const key = groupKey(row, groupBy);
    totals.set(key, (totals.get(key) ?? 0) + row.ending);
  }
  const data = [...totals.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  headCountBarChart(document.getElementById("balance-chart"), data, { rotateLabels: groupBy === "lot" });
  document.getElementById("balance-desc").textContent = `Ending count for the month, grouped by ${{ lot: "lot", location: "location", feed: "feed type" }[groupBy]}.`;
  main.querySelectorAll("[data-group]").forEach((btn) => btn.classList.toggle("active", btn.dataset.group === groupBy));
}

async function render() {
  await requireSession("admin");

  let months;
  try {
    months = await getAvailableMonths();
  } catch (err) {
    showError(main, err);
    return;
  }
  const monthParam = currentMonthParam();
  const monthEnd = monthParam && months.includes(monthParam) ? monthParam : months[0];

  main.innerHTML = `
    <div class="stack">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold text-foreground">Inventory</h1>
          <p class="text-sm text-muted-foreground">How many head you had, what moved, and where everything ended up for the month.</p>
        </div>
        <div id="month-picker"></div>
      </div>
      <div id="body"></div>
    </div>`;

  if (monthEnd) {
    main.querySelector("#month-picker").append(
      filterSelect({
        label: "Month",
        value: monthEnd,
        options: months.map((m) => ({ value: m, label: formatDate(m) })),
        allowAll: false,
        className: "w-48",
        onChange: (value) => {
          window.location.search = `?month=${encodeURIComponent(value)}`;
        },
      })
    );
  }

  const body = main.querySelector("#body");
  if (!monthEnd) {
    body.innerHTML = reportUnavailableHtml("No head-count history yet.");
    return;
  }

  let snapshot;
  try {
    snapshot = await getInventorySnapshot(monthEnd);
  } catch (err) {
    showError(body, err);
    return;
  }
  const { totals, rows, byLocation } = snapshot;
  currentRows = rows;

  const statRow = (label, value) => statTileHtml({ label, value, provenance: "measured" });

  body.innerHTML = `
    <div class="stack">
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        ${statRow("Ending head count", formatNumber(totals.ending))}
        ${statRow("Purchased", formatNumber(totals.purchased))}
        ${statRow("Born", formatNumber(totals.born))}
        ${statRow("Transfers in / out", `${formatNumber(totals.transferIn)} / ${formatNumber(totals.transferOut)}`)}
        ${statRow("Sold", formatNumber(totals.sold))}
        ${statRow("Died", formatNumber(totals.died))}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="card">
          <div class="card-header"><h3 class="card-title card-title-base">Head count, month over month</h3><p class="card-description">What you started the month with, what moved, and what you ended with.</p></div>
          <div class="chart-box h-72"><canvas id="waterfall-chart"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header card-header-row">
            <div><h3 class="card-title card-title-base">Head on hand today</h3><p class="card-description" id="balance-desc"></p></div>
            <div class="flex gap-1">
              <button type="button" class="btn btn-outline btn-sm" data-group="lot">Lot</button>
              <button type="button" class="btn btn-outline btn-sm" data-group="location">Location</button>
              <button type="button" class="btn btn-outline btn-sm" data-group="feed">Feed type</button>
            </div>
          </div>
          <div class="chart-box h-72"><canvas id="balance-chart"></canvas></div>
        </div>
      </div>
      <div class="stack" id="location-cards"></div>
    </div>`;

  headWaterfallChart(document.getElementById("waterfall-chart"), totals);
  groupBy = "location";
  drawBalanceChart();
  main.querySelectorAll("[data-group]").forEach((btn) =>
    btn.addEventListener("click", () => {
      groupBy = btn.dataset.group;
      drawBalanceChart();
    })
  );

  const locationCards = main.querySelector("#location-cards");
  locationCards.innerHTML = byLocation
    .map((group) => {
      const rowHtml = (row) => `
        <tr>
          <td class="font-medium"><a class="hover-underline" href="/dashboard/lot-detail.html?lot=${encodeURIComponent(row.lot)}">${escapeHtml(row.lot)}</a></td>
          <td class="text-right">${formatNumber(row.beginning)}</td>
          <td class="text-right">${formatNumber(row.purchased)}</td>
          <td class="text-right">${formatNumber(row.born)}</td>
          <td class="text-right">${formatNumber(row.transferIn)}</td>
          <td class="text-right">${formatNumber(row.transferOut)}</td>
          <td class="text-right">${formatNumber(row.sold)}</td>
          <td class="text-right">${formatNumber(row.died)}</td>
          <td class="text-right font-medium">${formatNumber(row.ending)}</td>
        </tr>`;
      return `
        <div class="card">
          <div class="card-header"><h3 class="card-title card-title-base">${escapeHtml(group.location)}</h3></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Lot</th><th class="text-right">Beginning</th><th class="text-right">Purch.</th><th class="text-right">Born</th><th class="text-right">Trans. In</th><th class="text-right">Trans. Out</th><th class="text-right">Sold</th><th class="text-right">Died</th><th class="text-right">Ending</th></tr></thead>
              <tbody>${group.rows.map(rowHtml).join("")}</tbody>
              <tfoot><tr>
                <td>Total</td>
                <td class="text-right">${formatNumber(group.totals.beginning)}</td>
                <td class="text-right">${formatNumber(group.totals.purchased)}</td>
                <td class="text-right">${formatNumber(group.totals.born)}</td>
                <td class="text-right">${formatNumber(group.totals.transferIn)}</td>
                <td class="text-right">${formatNumber(group.totals.transferOut)}</td>
                <td class="text-right">${formatNumber(group.totals.sold)}</td>
                <td class="text-right">${formatNumber(group.totals.died)}</td>
                <td class="text-right">${formatNumber(group.totals.ending)}</td>
              </tr></tfoot>
            </table>
          </div>
        </div>`;
    })
    .join("");
}

render();

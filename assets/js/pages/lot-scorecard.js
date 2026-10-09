/** Direct port of src/app/dashboard/lot-scorecard/page.tsx (+
 * cost-of-gain-chart.tsx, scorecard-table.tsx). */
import { requireSession } from "../auth.js";
import { getLotScorecard } from "../data/scorecard.js";
import { filterSelect, badgeHtml, showError, escapeHtml, ALL } from "../dom.js";
import { formatMoney, formatPerLb, formatNumber } from "../format.js";
import { cogAllInByLotChart } from "../charts.js";

const main = document.getElementById("main");

const CONFIDENCE_LABEL = { H: "High", M: "Medium", L: "Low" };
const CONFIDENCE_VARIANT = { H: "good", M: "warning", L: "critical" };

function uniqueOptions(rows, key) {
  const values = [...new Set(rows.map((r) => r[key]).filter(Boolean))];
  return values.sort().map((v) => ({ value: v, label: v }));
}

function renderBody(rows, filters) {
  const filtered = rows.filter(
    (r) =>
      (filters.status === ALL || r.status === filters.status) &&
      (filters.feedType === ALL || r.feedType === filters.feedType) &&
      (filters.locationType === ALL || r.locationType === filters.locationType)
  );

  const chartData = filtered.filter((r) => r.cogAllIn !== null).sort((a, b) => b.cogAllIn - a.cogAllIn);
  const chartHost = document.getElementById("cog-chart-card");
  chartHost.style.display = chartData.length ? "" : "none";
  if (chartData.length) cogAllInByLotChart(document.getElementById("cog-chart"), chartData);

  document.getElementById("scorecard-table").innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Lot</th><th>Status</th><th>Feed type</th><th>Location</th>
        <th class="text-right">Head in</th><th class="text-right">On hand</th><th class="text-right">Avg DOF</th>
        <th class="text-right">ADG used</th><th class="text-right">$ / head in</th><th class="text-right">COG all-in</th><th>Confidence</th>
      </tr></thead>
      <tbody>
        ${filtered
          .map(
            (r) => `
          <tr>
            <td class="font-medium"><a class="hover-underline" href="/dashboard/lot-detail.html?lot=${encodeURIComponent(r.lot)}">${escapeHtml(r.lot)}</a></td>
            <td>${r.status ? escapeHtml(r.status) : "—"}</td>
            <td>${r.feedType ? escapeHtml(r.feedType) : "—"}</td>
            <td>${r.locationType ? escapeHtml(r.locationType) : "—"}</td>
            <td class="text-right">${formatNumber(r.headIn)}</td>
            <td class="text-right">${formatNumber(r.headOnHand)}</td>
            <td class="text-right">${formatNumber(r.avgDof)}</td>
            <td class="text-right">${r.adgUsed.toFixed(2)}</td>
            <td class="text-right">${formatMoney(r.costInDollarsPerHead)}</td>
            <td class="text-right">${formatPerLb(r.cogAllIn)}</td>
            <td>${badgeHtml(CONFIDENCE_LABEL[r.confidence], CONFIDENCE_VARIANT[r.confidence])}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

async function render() {
  await requireSession("admin");

  let rows;
  try {
    rows = await getLotScorecard();
  } catch (err) {
    showError(main, err);
    return;
  }

  main.innerHTML = `
    <div class="stack">
      <div>
        <h1 class="text-2xl font-semibold text-foreground">Lot Scorecard</h1>
        <p class="text-sm text-muted-foreground">Every lot, open and closed, side by side so you can compare how each one performed.</p>
      </div>
      <div class="flex flex-wrap gap-3">
        <div id="status-filter"></div>
        <div id="feed-filter"></div>
        <div id="location-filter"></div>
      </div>
      <div class="card" id="cog-chart-card">
        <div class="card-header"><h3 class="card-title card-title-base">Cost of gain, all-in — by lot</h3><p class="card-description">Highest cost per pound first, so you can spot which lots are expensive to run.</p></div>
        <div class="chart-box h-80"><canvas id="cog-chart"></canvas></div>
      </div>
      <div class="card" style="overflow:hidden">
        <div class="table-wrap" id="scorecard-table"></div>
      </div>
    </div>`;

  const filters = { status: ALL, feedType: ALL, locationType: ALL };
  const refresh = () => renderBody(rows, filters);

  document.getElementById("status-filter").append(
    filterSelect({ label: "Status", value: ALL, options: uniqueOptions(rows, "status"), className: "w-40", onChange: (v) => { filters.status = v; refresh(); } })
  );
  document.getElementById("feed-filter").append(
    filterSelect({ label: "Feed type", value: ALL, options: uniqueOptions(rows, "feedType"), className: "w-40", onChange: (v) => { filters.feedType = v; refresh(); } })
  );
  document.getElementById("location-filter").append(
    filterSelect({ label: "Location type", value: ALL, options: uniqueOptions(rows, "locationType"), className: "w-40", onChange: (v) => { filters.locationType = v; refresh(); } })
  );
  refresh();
}

render();

/** Direct port of src/app/dashboard/market-position/page.tsx. */
import { requireSession } from "../auth.js";
import { getMarketPosition, getLatestFeederSettle } from "../data/market-position.js";
import { reportUnavailableHtml, provenanceBadgeHtml, badgeHtml, showError, escapeHtml } from "../dom.js";
import { formatMoney, formatNumber, formatDate } from "../format.js";
import { unrealizedByLotChart } from "../charts.js";

const main = document.getElementById("main");

async function render() {
  await requireSession("admin");

  let rows, settle;
  try {
    [rows, settle] = await Promise.all([getMarketPosition(), getLatestFeederSettle()]);
  } catch (err) {
    showError(main, err);
    return;
  }

  const totalMarked = rows.reduce((s, r) => s + (r.markedValue ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + (r.costBasis ?? 0), 0);
  const totalUnrealized = totalMarked - totalCost;

  main.innerHTML = `
    <div class="stack">
      <div>
        <h1 class="text-2xl font-semibold text-foreground">Market Position</h1>
        <p class="text-sm text-muted-foreground">What your open lots would be worth if you sold today, at the latest market price.</p>
      </div>

      ${settle
        ? `<p class="text-xs text-muted-foreground">Latest feeder-cattle settle: <span class="font-medium text-foreground">$${settle.settle.toFixed(2)}/cwt</span> as of ${formatDate(settle.quoteDate)}.</p>`
        : reportUnavailableHtml("No market quotes available.")}

      <div class="card" style="${rows.length ? "" : "display:none"}">
        <div class="card-header"><h3 class="card-title card-title-base">Unrealized position by open lot</h3><p class="card-description">What each open lot would gain or lose if sold today, at the latest market price.</p></div>
        <div class="chart-box h-72"><canvas id="unrealized-chart"></canvas></div>
        ${rows.some((r) => r.lightCalfCaveat) ? `<p class="light-calf-note">Lots under 600 lb are marked at a price meant for heavier cattle, which can show an overly large loss — look at those numbers as a rough estimate, not a firm one.</p>` : ""}
      </div>

      <div class="card" style="overflow:hidden">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Lot</th><th class="text-right">Head on hand</th><th class="text-right">Est. wt / head</th>
              <th class="text-right">Cost basis</th><th class="text-right">Marked value</th><th class="text-right">Unrealized</th><th>Weight source</th>
            </tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td class="font-medium">
                    <a class="hover-underline" href="/dashboard/lot-detail.html?lot=${encodeURIComponent(r.lot)}">${escapeHtml(r.lot)}</a>
                    ${r.lightCalfCaveat ? `<span style="margin-left:.5rem">${badgeHtml("light-calf mark", "warning")}</span>` : ""}
                  </td>
                  <td class="text-right">${formatNumber(r.headOnHand)}</td>
                  <td class="text-right">${formatNumber(r.projectedWeightPerHead)} lb</td>
                  <td class="text-right">${formatMoney(r.costBasis)}</td>
                  <td class="text-right">${formatMoney(r.markedValue)}</td>
                  <td class="text-right font-medium" style="color:${(r.unrealized ?? 0) >= 0 ? "#3f5c1f" : "#8a3115"}">${formatMoney(r.unrealized)}</td>
                  <td>${provenanceBadgeHtml(r.weightProvenance)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
            <tfoot><tr>
              <td colspan="3">Total</td>
              <td class="text-right">${formatMoney(totalCost)}</td>
              <td class="text-right">${formatMoney(totalMarked)}</td>
              <td class="text-right">${formatMoney(totalUnrealized)}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>
      </div>

      <p class="text-xs text-muted-foreground">Every lot is marked at the same feeder-cattle price, which may not perfectly reflect lighter calves' real market value — that's what the "light-calf mark" flag is calling out.</p>
    </div>`;

  if (rows.length) {
    unrealizedByLotChart(
      document.getElementById("unrealized-chart"),
      rows.map((r) => ({ lot: r.lot, unrealized: r.unrealized ?? 0, lightCalfCaveat: r.lightCalfCaveat }))
    );
  }
}

render();

/**
 * Unit Economics dashboard -- Overview sub-tab. Rebuilt 2026-10-12 per John's sketch
 * (Client Files/tab1-Overview.jpg). Time period (From/Month, To/Month) lives in
 * window.UEDash.dashState (router.js), same in-memory-state convention as every other sub-tab
 * here -- there's no URL to carry it in inside a tab.
 */
window.UEDash = window.UEDash || {};

(function () {
  const { getOverviewData } = window.UEDash;
  const { reportUnavailableHtml, showError, escapeHtml, lotLinkHtml } = window.UEDash;
  const { formatNumber, formatDate } = window.UEDash;
  const { headWaterfallChart } = window.UEDash;

  /**
   * Draggable dual-handle period slicer (Power BI style) over the fixed list of months with real
   * head-count data -- there's no continuous date axis here, every position snaps to one of
   * `months`. Only the label/thumb position update live while dragging; the actual data refetch
   * (onCommit) fires once per drag, on pointerup, same as a real BI tool debounces this.
   */
  function wireRangeSlider(host, months, fromMonth, toMonth, onCommit) {
    const n = months.length;
    let fromIdx = Math.max(0, months.indexOf(fromMonth));
    let toIdx = Math.max(fromIdx, months.indexOf(toMonth));

    const range = host.querySelector(".range-slider-range");
    const fromThumb = host.querySelector('[data-thumb="from"]');
    const toThumb = host.querySelector('[data-thumb="to"]');
    const fromLabel = fromThumb.querySelector(".range-slider-label");
    const toLabel = toThumb.querySelector(".range-slider-label");

    const pct = (i) => (n <= 1 ? 0 : (i / (n - 1)) * 100);
    // When both handles land on the same month (the common initial single-month view), they'd
    // sit at the exact same pixel and only the topmost one could ever be grabbed again. A few
    // pixels of push-apart keeps both independently draggable without changing the logical
    // (snapped-to-month) position either represents.
    const OVERLAP_PUSH_PX = 5;

    function paint() {
      const overlapping = fromIdx === toIdx;
      fromThumb.style.left = `${pct(fromIdx)}%`;
      toThumb.style.left = `${pct(toIdx)}%`;
      fromThumb.style.marginLeft = overlapping ? `-${OVERLAP_PUSH_PX}px` : "0";
      toThumb.style.marginLeft = overlapping ? `${OVERLAP_PUSH_PX}px` : "0";
      range.style.left = `${pct(fromIdx)}%`;
      range.style.width = `${pct(toIdx) - pct(fromIdx)}%`;
      fromLabel.textContent = formatDate(months[fromIdx]);
      toLabel.textContent = formatDate(months[toIdx]);
    }
    paint();

    function indexFromClientX(clientX) {
      const rect = host.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(ratio * (n - 1));
    }

    function startDrag(which) {
      return (downEvent) => {
        downEvent.preventDefault();
        downEvent.stopPropagation();
        fromThumb.style.zIndex = which === "from" ? "2" : "1";
        toThumb.style.zIndex = which === "to" ? "2" : "1";
        const move = (e) => {
          const idx = indexFromClientX(e.clientX);
          if (which === "from") fromIdx = Math.min(idx, toIdx);
          else toIdx = Math.max(idx, fromIdx);
          paint();
        };
        const up = () => {
          document.removeEventListener("pointermove", move);
          document.removeEventListener("pointerup", up);
          onCommit(months[fromIdx], months[toIdx]);
        };
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up, { once: true });
      };
    }

    fromThumb.addEventListener("pointerdown", startDrag("from"));
    toThumb.addEventListener("pointerdown", startDrag("to"));
  }

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
        <div class="card" style="padding:0 1rem 1rem">
          <div class="card-header"><p class="card-description">Time period</p></div>
          <div class="range-slider" id="period-slider">
            <div class="range-slider-track"></div>
            <div class="range-slider-range"></div>
            <button type="button" class="range-slider-thumb" data-thumb="from" title="Drag to change the start month"><span class="range-slider-label"></span></button>
            <button type="button" class="range-slider-thumb" data-thumb="to" title="Drag to change the end month"><span class="range-slider-label"></span></button>
          </div>
        </div>
        <div id="body"></div>
      </div>`;

    // Oldest-to-newest left-to-right, same direction as the slider reads.
    const monthsAsc = months.slice().reverse();
    wireRangeSlider(container.querySelector("#period-slider"), monthsAsc, fromMonth, toMonth, (newFrom, newTo) => {
      state.overviewFrom = newFrom;
      state.overviewTo = newTo;
      renderOverview(container);
    });

    const body = container.querySelector("#body");
    let data;
    try {
      data = await getOverviewData(fromMonth, toMonth);
    } catch (err) {
      showError(body, err);
      return;
    }
    const { totals, rows } = data;

    body.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="card-header"><h3 class="card-title card-title-base">Cattle inventory movement</h3><p class="card-description">Starting balance to ending balance, every inflow and outflow in between, for the selected period.</p></div>
          <div class="chart-box h-72"><canvas id="movement-chart"></canvas></div>
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

    headWaterfallChart(body.querySelector("#movement-chart"), totals);
  }

  Object.assign(window.UEDash, { renderOverview });
})();

/**
 * Chart.js 4.4.0 builders -- one per chart that used to be a Recharts
 * component. Chart.js is loaded globally via the CDN <script> tag (see each
 * page's <head>), so `Chart` is a global here, same as `window.supabase`.
 */
import { CATEGORICAL, DIVERGING } from "./colors.js";
import { formatMoney, formatNumber, formatDate } from "./format.js";

function destroyExisting(canvas) {
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
}

const GRID_COLOR = "#d4d2c8";

/** Stacked Direct/Indirect $ bars -- used by Ranch spend, Weekly cost (lot + lot-detail). */
export function stackedCostBarChart(canvas, data, { xKey, xLabel = formatDate } = {}) {
  destroyExisting(canvas);
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: data.map((d) => xLabel(d[xKey])),
      datasets: [
        { label: "Direct", data: data.map((d) => d.direct), backgroundColor: CATEGORICAL.olive, stack: "cost" },
        { label: "Indirect", data: data.map((d) => d.indirect), backgroundColor: CATEGORICAL.rust, stack: "cost" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: GRID_COLOR }, ticks: { callback: (v) => formatMoney(v), font: { size: 11 } } },
      },
      plugins: {
        legend: { position: "top", labels: { boxWidth: 12, font: { size: 12 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}` } },
      },
    },
  });
}

/** Unrealized $ by lot, colored green/rust around a zero baseline. */
export function unrealizedByLotChart(canvas, rows) {
  destroyExisting(canvas);
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: rows.map((r) => r.lot),
      datasets: [
        {
          data: rows.map((r) => r.unrealized),
          backgroundColor: rows.map((r) => (r.unrealized >= 0 ? DIVERGING.positive : DIVERGING.negative)),
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 30, minRotation: 30 } },
        y: { grid: { color: GRID_COLOR }, ticks: { callback: (v) => formatMoney(v), font: { size: 11 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const row = rows[ctx.dataIndex];
              return `Unrealized: ${formatMoney(ctx.parsed.y)}${row.lightCalfCaveat ? " (light-calf mark — see note)" : ""}`;
            },
          },
        },
      },
    },
  });
}

/** Horizontal bar -- Direct cost breakdown, lot-level. */
export function directCostBreakdownChart(canvas, rows) {
  destroyExisting(canvas);
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: rows.map((r) => r.report_line),
      datasets: [{ data: rows.map((r) => r.total), backgroundColor: CATEGORICAL.steelBlue, borderRadius: 4 }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: GRID_COLOR }, ticks: { callback: (v) => formatMoney(v), font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `Amount: ${formatMoney(ctx.parsed.x)}` } },
      },
    },
  });
}

/** Horizontal two-bar comparison -- Target vs Actual ADG. */
export function adgComparisonChart(canvas, targetAdg, actualAdg) {
  destroyExisting(canvas);
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["Target", "Actual (used)"],
      datasets: [
        {
          data: [targetAdg, actualAdg],
          backgroundColor: [CATEGORICAL.steelBlue, CATEGORICAL.olive],
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: GRID_COLOR }, ticks: { callback: (v) => `${v.toFixed(1)} lb/day`, font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { font: { size: 12 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.x.toFixed(2)} lb/day` } },
      },
    },
  });
}

/** Vertical bar with a toggle-driven grouping -- Head on hand (Inventory/Lots pages). */
export function headCountBarChart(canvas, rows, { rotateLabels = false } = {}) {
  destroyExisting(canvas);
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: rows.map((r) => r.name),
      datasets: [{ data: rows.map((r) => r.value), backgroundColor: CATEGORICAL.steelBlue, borderRadius: 3 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: rotateLabels ? { font: { size: 11 }, maxRotation: 45, minRotation: 45 } : { font: { size: 11 } },
        },
        y: { grid: { color: GRID_COLOR }, ticks: { callback: (v) => formatNumber(v), font: { size: 11 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${formatNumber(ctx.parsed.y)} head` } },
      },
    },
  });
}

/**
 * Waterfall -- Beginning -> movements -> Ending, same technique the
 * Recharts version used: a transparent "base" stack dataset holds each bar
 * off the ground, a colored "size" dataset draws the visible segment.
 */
export function headWaterfallChart(canvas, totals) {
  destroyExisting(canvas);
  const steps = [{ name: "Beginning", base: 0, size: totals.beginning, kind: "total", actual: totals.beginning }];
  let running = totals.beginning;
  const deltas = [
    ["Purchased", totals.purchased],
    ["Born", totals.born],
    ["Transfer In", totals.transferIn],
    ["Sold", -totals.sold],
    ["Died", -totals.died],
    ["Transfer Out", -totals.transferOut],
  ];
  for (const [name, delta] of deltas) {
    if (delta === 0) continue;
    const base = delta >= 0 ? running : running + delta;
    steps.push({ name, base, size: Math.abs(delta), kind: delta >= 0 ? "in" : "out", actual: delta });
    running += delta;
  }
  steps.push({ name: "Ending", base: 0, size: totals.ending, kind: "total", actual: totals.ending });

  const colorFor = { total: CATEGORICAL.steelBlue, in: DIVERGING.positive, out: DIVERGING.negative };

  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: steps.map((s) => s.name),
      datasets: [
        { data: steps.map((s) => s.base), backgroundColor: "transparent", stack: "a" },
        { data: steps.map((s) => s.size), backgroundColor: steps.map((s) => colorFor[s.kind]), stack: "a", borderRadius: 3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 20, minRotation: 20 } },
        y: { grid: { color: GRID_COLOR }, ticks: { callback: (v) => formatNumber(v), font: { size: 11 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: () => "",
            label: (ctx) => {
              if (ctx.datasetIndex === 0) return null;
              const s = steps[ctx.dataIndex];
              return `${s.name}: ${s.actual >= 0 ? "+" : ""}${formatNumber(s.actual)} head`;
            },
          },
        },
      },
    },
  });
}

/** Area/line -- Head on hand by month (lot detail). */
export function monthlyHeadAreaChart(canvas, data) {
  destroyExisting(canvas);
  return new Chart(canvas, {
    type: "line",
    data: {
      labels: data.map((d) => formatDate(d.month_end)),
      datasets: [
        {
          data: data.map((d) => d.head_end),
          borderColor: CATEGORICAL.steelBlue,
          backgroundColor: "rgba(11,122,160,0.15)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: GRID_COLOR }, ticks: { callback: (v) => formatNumber(v), font: { size: 11 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${formatNumber(ctx.parsed.y)} head` } },
      },
    },
  });
}

/** Cost of gain all-in, by lot (Lot Scorecard). */
export function cogAllInByLotChart(canvas, rows) {
  destroyExisting(canvas);
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: rows.map((r) => r.lot),
      datasets: [{ data: rows.map((r) => r.cogAllIn), backgroundColor: CATEGORICAL.rust, borderRadius: 3 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 45 } },
        y: { grid: { color: GRID_COLOR }, ticks: { callback: (v) => `$${v.toFixed(2)}`, font: { size: 11 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `All-in: $${ctx.parsed.y.toFixed(2)}/lb` } },
      },
    },
  });
}

/**
 * Cattle flow -- SIMPLIFIED from the Next.js version's Recharts <Sankey>.
 * Chart.js has no native Sankey/flow-diagram type and this app intentionally
 * avoids adding a plugin dependency beyond the CDN scripts the client's own
 * app already loads. Same underlying numbers (inflow/outflow head counts
 * from ue_gl_lot_head_flow), rendered as a single horizontal bar per
 * category instead of a flow diagram -- see the final report for why this
 * was judged an acceptable simplification rather than a faithfulness gap.
 */
export function lotFlowBarChart(canvas, flow, lot) {
  destroyExisting(canvas);
  const categories = flow.nodes.filter((n) => n.name !== lot).map((n) => n.name);
  const valueByName = new Map();
  for (const link of flow.links) {
    const sourceName = flow.nodes[link.source].name;
    const targetName = flow.nodes[link.target].name;
    const name = sourceName === lot ? targetName : sourceName;
    valueByName.set(name, (valueByName.get(name) ?? 0) + link.value);
  }
  const inflowNames = new Set(["Purchased", "Born", "Transfer In"]);
  const labels = categories;
  const values = labels.map((name) => valueByName.get(name) ?? 0);
  const colors = labels.map((name) => (inflowNames.has(name) ? DIVERGING.positive : DIVERGING.negative));

  return new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 3 }] },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: GRID_COLOR }, ticks: { callback: (v) => formatNumber(v), font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${formatNumber(ctx.parsed.x)} head` } },
      },
    },
  });
}

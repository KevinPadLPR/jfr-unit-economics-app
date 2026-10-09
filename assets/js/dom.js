/** Small render helpers shared by every page script -- no framework, just DOM. */

import { PROVENANCE } from "./colors.js";

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

const PROV_LABEL = { measured: "MEASURED", sourced: "SOURCED", modeled: "MODELED", assumed: "ASSUMED" };
const PROV_TITLE = {
  measured: "Scale ticket, invoice, or GL posting",
  sourced: "CME settle or cash bid",
  modeled: "Derived — e.g. weight from ADG, cost from head-days",
  assumed: "Projected — e.g. flat ADG, assumed death-loss %",
};

/** Position Desk spec Rule 1: every number carries a provenance label. */
export function provenanceBadgeHtml(provenance) {
  if (!provenance) return "";
  const color = PROVENANCE[provenance];
  return `<span class="prov-badge" style="border-color:${color};color:${color}" title="${PROV_TITLE[provenance]}">${PROV_LABEL[provenance]}</span>`;
}

/** Deliberately icon-free -- the reference app removed icons from these tiles after client feedback. */
export function statTileHtml({ label, value, delta, deltaTone = "neutral", provenance, className = "" }) {
  return `
    <div class="card stat-tile ${className}">
      <div class="card-header">
        <div class="stat-head-row">
          <p class="card-description">${escapeHtml(label)}</p>
          ${provenanceBadgeHtml(provenance)}
        </div>
        <p class="stat-value">${escapeHtml(value ?? "—")}</p>
        ${delta ? `<span class="stat-delta stat-delta-${deltaTone}">${escapeHtml(delta)}</span>` : ""}
      </div>
    </div>`;
}

export function reportUnavailableHtml(detail) {
  return `
    <div class="card notice-warning">
      <div class="notice-body">
        <span class="notice-icon">&#9888;</span>
        <div class="notice-text">
          <p class="notice-title">This report isn't available right now.</p>
          <p class="notice-detail">${escapeHtml(detail ?? "The data source is being regenerated. Try again shortly, or check the data pipeline.")}</p>
        </div>
      </div>
    </div>`;
}

const BADGE_VARIANT_CLASS = {
  neutral: "badge-neutral",
  outline: "badge-outline",
  good: "badge-good",
  warning: "badge-warning",
  critical: "badge-critical",
};

export function badgeHtml(text, variant = "neutral") {
  return `<span class="badge ${BADGE_VARIANT_CLASS[variant] ?? "badge-neutral"}">${escapeHtml(text)}</span>`;
}

/** Shared filter dropdown -- mirrors components/filter-select.tsx. */
export function filterSelect({ label, value, options, onChange, allowAll = true, className = "" }) {
  const wrap = el("label", { class: `field ${className}` }, [label]);
  const selectWrap = el("div", { class: "select-wrap" });
  const select = el("select", { class: "select" });
  if (allowAll) select.append(el("option", { value: "__all__" }, ["All"]));
  for (const opt of options) {
    const o = el("option", { value: opt.value }, [opt.label]);
    select.append(o);
  }
  select.value = value;
  select.addEventListener("change", (e) => onChange(e.target.value));
  selectWrap.append(select, el("span", { class: "chevron" }, ["▾"]));
  wrap.append(selectWrap);
  return wrap;
}

export const ALL = "__all__";

export function renderInto(container, html) {
  container.innerHTML = html;
}

export function showError(container, err) {
  console.error(err);
  container.innerHTML = reportUnavailableHtml(
    err && err.message && err.message.toUpperCase().includes("SUPABASE")
      ? "Can't reach the client's Supabase project from this environment -- check the anon key/URL and your network."
      : `Something went wrong loading this report: ${err && err.message ? err.message : "unknown error"}`
  );
}

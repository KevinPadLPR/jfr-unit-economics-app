/** Unit Economics dashboard -- small render helpers shared by every page. */
window.UEDash = window.UEDash || {};

(function () {
  const PROVENANCE = window.UEDash.PROVENANCE;

  function el(tag, attrs = {}, children = []) {
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

  function escapeHtml(value) {
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
  function provenanceBadgeHtml(provenance) {
    if (!provenance) return "";
    const color = PROVENANCE[provenance];
    return `<span class="prov-badge" style="border-color:${color};color:${color}" title="${PROV_TITLE[provenance]}">${PROV_LABEL[provenance]}</span>`;
  }

  function statTileHtml({ label, value, delta, deltaTone = "neutral", provenance, className = "" }) {
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

  function reportUnavailableHtml(detail) {
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

  function badgeHtml(text, variant = "neutral") {
    return `<span class="badge ${BADGE_VARIANT_CLASS[variant] ?? "badge-neutral"}">${escapeHtml(text)}</span>`;
  }

  function filterSelect({ label, value, options, onChange, allowAll = true, className = "" }) {
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

  const ALL = "__all__";

  function showError(container, err) {
    console.error(err);
    container.innerHTML = reportUnavailableHtml(
      err && err.message && err.message.toUpperCase().includes("SUPABASE")
        ? "Can't reach the client's Supabase project from this environment -- check the anon key/URL and your network."
        : `Something went wrong loading this report: ${err && err.message ? err.message : "unknown error"}`
    );
  }

  /**
   * Replaces the standalone app's real page links (`/dashboard/lot-detail.html?lot=...`) --
   * there's no such route inside this tab. The anchor still degrades to plain text if JS
   * somehow didn't wire a click handler (href="#"); router.js attaches one delegated listener
   * per rendered page via wireLotLinks(container) rather than inline onclick, so the generated
   * HTML strings below don't need to embed any JS.
   */
  /** Replaces the standalone app's real page links (/dashboard/lot-detail.html?lot=...) -- there
   * is no such route inside this tab. router.js wires one delegated click listener on the
   * permanent #dashboardView container that intercepts [data-dash-lot] clicks and calls
   * UEDash.goToLot(), so this markup needs no inline JS. */
  function lotLinkHtml(lotNumber, label) {
    return `<a class="hover-underline" href="#" data-dash-lot="${escapeHtml(lotNumber)}">${escapeHtml(label ?? lotNumber)}</a>`;
  }

  Object.assign(window.UEDash, {
    el,
    escapeHtml,
    provenanceBadgeHtml,
    statTileHtml,
    reportUnavailableHtml,
    badgeHtml,
    filterSelect,
    ALL,
    showError,
    lotLinkHtml,
  });
})();

/**
 * Unit Economics dashboard -- shared JS namespace.
 *
 * Every ported file (this one plus colors.js/dom.js/charts.js/data/*.js/
 * pages/*.js/router.js) is a classic <script> (not type="module", so they
 * all share one global lexical scope with the rest of this 40,000-line app
 * and can read its existing `supabase`/`currentProfile`/`currentUser`
 * directly -- see router.js's header comment). To avoid leaking ~70
 * individual function/const names into that shared scope -- this app has no
 * bundler to catch a collision, and a silent redefinition of some unrelated
 * host function would be a much worse bug than a loud one -- every ported
 * name lives on this one object instead of as a bare global. `UEDash` itself
 * is the only new global name this whole feature introduces.
 */
window.UEDash = window.UEDash || {};

(function () {
  function formatMoney(value, opts = {}) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: opts.cents ? 2 : 0,
      maximumFractionDigits: opts.cents ? 2 : 0,
    });
  }

  function formatNumber(value, digits = 0) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return value.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function formatPerLb(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return `$${value.toFixed(2)}/lb`;
  }

  function formatPct(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return `${value.toFixed(digits)}%`;
  }

  function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  Object.assign(window.UEDash, { formatMoney, formatNumber, formatPerLb, formatPct, formatDate });
})();

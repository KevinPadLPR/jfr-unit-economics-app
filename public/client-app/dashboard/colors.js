/** Unit Economics dashboard colors -- raw hex Chart.js needs; mirrors dashboard.css's
 * .dashboard-root custom properties, don't hardcode hex anywhere else in this feature. */
window.UEDash = window.UEDash || {};

(function () {
  const CATEGORICAL = {
    rust: "#C1602A",
    steelBlue: "#0B7AA0",
    olive: "#6E8F2E",
    plum: "#8C3560",
  };

  const DIVERGING = {
    positive: "#6E8F2E",
    positiveTint: "#DCE8C9",
    negative: "#C1602A",
    negativeTint: "#F3DCCB",
    neutral: "#CFCDBF",
  };

  const PROVENANCE = {
    measured: "#1A1E16",
    sourced: "#0B7AA0",
    modeled: "#6E8F2E",
    assumed: "#A8783C",
  };

  Object.assign(window.UEDash, { CATEGORICAL, DIVERGING, PROVENANCE });
})();

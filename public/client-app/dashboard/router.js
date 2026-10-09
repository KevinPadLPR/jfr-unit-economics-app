/**
 * Unit Economics dashboard -- router. Replaces the old showDashboardTab()'s iframe onto a
 * separately-deployed Next.js app: this file and everything it depends on (data/*.js,
 * charts.js, colors.js, format.js, dom.js, pages/*.js) are loaded as plain classic <script>
 * tags, in dependency order, right after this app's own main script -- so they share its global
 * scope and can read `supabase`/`currentProfile`/`currentUser` directly, same as every other
 * function in this file. See dashboard.css's header comment for why dashboard-internal names
 * live on window.UEDash instead of as bare globals.
 *
 * showDashboardTab(subtab) (this app's own nav/sub-tab-highlight function) calls
 * window.UEDash.renderSubtab(subtab) in place of the old frame.src assignment.
 */
window.UEDash = window.UEDash || {};

(function () {
  // Shared in-memory state replacing the standalone branch's ?lot=/?month= query params -- this
  // tab has no URL of its own to carry state in, and nothing else in this 40,000-line app reads
  // window.location.search either.
  const dashState = { lot: null, month: null };

  const RENDERERS = {
    overview: "renderOverview",
    inventory: "renderInventory",
    lots: "renderLots",
    "lot-detail": "renderLotDetail",
    "cost-of-gain": "renderCostOfGain",
    "lot-scorecard": "renderLotScorecard",
    "market-position": "renderMarketPosition",
  };

  function renderSubtab(subtab) {
    const content = document.getElementById("dashboardContent");
    if (!content) return;
    const rendererName = RENDERERS[subtab];
    if (!rendererName || typeof window.UEDash[rendererName] !== "function") {
      content.innerHTML = window.UEDash.reportUnavailableHtml(`Unknown Dashboard sub-tab "${subtab}".`);
      return;
    }
    content.innerHTML = '<p class="text-sm text-muted-foreground" style="padding:2rem;">Loading…</p>';
    Promise.resolve(window.UEDash[rendererName](content)).catch((err) => window.UEDash.showError(content, err));
  }

  /** Jumps to Lot Detail with a specific lot selected -- how every other sub-tab's lot link
   * navigates, in place of the standalone branch's real page link
   * (/dashboard/lot-detail.html?lot=...). */
  function goToLot(lotNumber) {
    dashState.lot = lotNumber;
    showDashboardTab("lot-detail");
  }

  // Wired once (this script runs once, same as the rest of this single-page app) on the
  // permanent #dashboardView container, not on #dashboardContent itself -- that inner container
  // gets its innerHTML replaced on every sub-tab switch, so a listener attached there would need
  // re-wiring after every render. Delegation on the stable outer element avoids that.
  const dashboardView = document.getElementById("dashboardView");
  if (dashboardView) {
    dashboardView.addEventListener("click", (e) => {
      const a = e.target.closest("[data-dash-lot]");
      if (!a || !dashboardView.contains(a)) return;
      e.preventDefault();
      goToLot(a.dataset.dashLot);
    });
  }

  Object.assign(window.UEDash, { dashState, renderSubtab, goToLot });
})();

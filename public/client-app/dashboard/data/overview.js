/**
 * Unit Economics dashboard -- Overview tab. Rebuilt 2026-10-12 per John's sketch
 * (Client Files/tab1-Overview.jpg) and video: "data available as of" date, a time-period
 * slicer, and a cattle-inventory waterfall (Starting Balance / Births / Purchases / Transfers
 * in / Deaths / Transfers out / Ending Balance) for open lots, historical periods selectable.
 *
 * Reuses getAvailableMonths()/getOpenLotInventoryRange() (data/inventory.js) rather than a new
 * data layer -- this IS the same real GL head-movement data the Inventory tab already reads,
 * just read as a date-centric range instead of one month-end snapshot.
 */
window.UEDash = window.UEDash || {};

(function () {
  const { getOpenLotInventoryRange } = window.UEDash;

  async function getOverviewData(fromMonth, toMonth) {
    const snapshot = await getOpenLotInventoryRange(fromMonth, toMonth);
    return {
      asOfDate: toMonth,
      fromMonth,
      toMonth,
      totals: snapshot.totals,
      rows: snapshot.rows.sort((a, b) => a.lot.localeCompare(b.lot)),
    };
  }

  Object.assign(window.UEDash, { getOverviewData });
})();

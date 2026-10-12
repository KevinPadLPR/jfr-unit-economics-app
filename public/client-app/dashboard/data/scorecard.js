/** Unit Economics dashboard -- Lot Scorecard rows. */
window.UEDash = window.UEDash || {};

(function () {
  const { listGlLots, getCostOfGain, getConfidenceGrade } = window.UEDash;

  async function getLotScorecard() {
    // ue_master_lot_schedule already carries profit_center on the same row as everything else --
    // one query via listGlLots() instead of two. feed_type/location_type dropped: confirmed
    // (2026-10-12) to be our own regex-on-lot-name heuristic, never real client/GL data, never
    // corrected by anyone -- profit_center (Stockers/Feeders/Rsd Stockers/Cows) is the one
    // genuine GL grouping dimension available.
    const lots = await listGlLots();
    return Promise.all(
      lots.map(async (lot) => {
        const [cog, confidence] = await Promise.all([getCostOfGain(lot.lot), getConfidenceGrade(lot.lot)]);
        return {
          lot: lot.lot,
          profitCenter: lot.profit_center,
          status: lot.status,
          headIn: lot.head_in,
          headOnHand: lot.head_on_hand,
          avgDof: lot.avg_dof,
          isMeasured: cog?.isMeasured ?? false,
          adgUsed: cog?.isMeasured ? cog.adgUsed : null,
          costInDollarsPerHead: lot.cost_in_dollars_per_head,
          cogAllIn: cog?.cogAllIn ?? null,
          confidence,
          useForBenchmark: (lot.use_for_benchmark ?? "").toLowerCase() === "yes",
        };
      })
    );
  }

  Object.assign(window.UEDash, { getLotScorecard });
})();

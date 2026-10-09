/** Unit Economics dashboard -- Lot Scorecard rows. */
window.UEDash = window.UEDash || {};

(function () {
  const { listGlLots, getCostOfGain, getConfidenceGrade } = window.UEDash;

  async function getLotScorecard() {
    // ue_master_lot_schedule already carries feed_type/location_type on the same row as
    // everything else -- one query via listGlLots() instead of two.
    const lots = await listGlLots();
    return Promise.all(
      lots.map(async (lot) => {
        const [cog, confidence] = await Promise.all([getCostOfGain(lot.lot), getConfidenceGrade(lot.lot)]);
        return {
          lot: lot.lot,
          profitCenter: lot.profit_center,
          status: lot.status,
          feedType: lot.feed_type,
          locationType: lot.location_type,
          headIn: lot.head_in,
          headOnHand: lot.head_on_hand,
          avgDof: lot.avg_dof,
          adgUsed: cog?.adgUsed ?? lot.target_adg ?? 0,
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

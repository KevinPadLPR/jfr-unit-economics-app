export interface SaleSourceRow {
  pastureId: string;
  headCount: number;
}

/**
 * Ported from the sale save handler's source validation (index.html:30238-30252): with exactly
 * one source, the top head-count field supplies its count; with 2+, each row needs a pasture
 * and a positive head count, and they must sum exactly to `headCount`. Same shape as Phase 7's
 * `validateLoadOutDestinations`, mirrored here for sale sources.
 */
export function validateSaleSources(
  headCount: number,
  rows: { pastureId: string; headCount: number | null }[]
): { sources: SaleSourceRow[] } | { error: string } {
  if (rows.length === 1) {
    const [row] = rows;
    if (!row.pastureId) return { error: "Pick a source pasture." };
    return { sources: [{ pastureId: row.pastureId, headCount }] };
  }

  const valid = rows.filter((r): r is { pastureId: string; headCount: number } => !!r.pastureId && Number(r.headCount) > 0);
  const total = valid.reduce((s, r) => s + Number(r.headCount), 0);
  if (valid.length === 0) return { error: "Add at least one source pasture." };
  if (total !== headCount) {
    return { error: `Sources total (${total} hd) must equal head count (${headCount} hd).` };
  }
  return { sources: valid };
}

/** Ported from the Phase-14 sanity rule (index.html:30294-30298): stocker/feeder cattle run
 * $100-$400/cwt, fat cattle $150-$250/cwt -- below $50 or above $1000 is almost certainly a typo. */
export function checkPriceSanity(pricePerCwt: number | null): string | null {
  if (pricePerCwt == null || Number.isNaN(pricePerCwt)) return null;
  if (pricePerCwt < 50 || pricePerCwt > 1000) {
    return `$/cwt value (${pricePerCwt}) is outside the typical range ($50-$1000). Common typo: decimal in wrong place.`;
  }
  return null;
}

/**
 * Ported from the pay-weight guard's tie-check (index.html:30326-30329): when net weight is
 * blank but gross is given, checks whether the money ties on the gross (total / gross * 100
 * lands on the $/cwt within the same 0.02 tolerance vanilla uses) -- if so, that figure IS the
 * buyer's pay weight and can be booked as both.
 */
export function checkPayWeightTie(grossWeightLb: number, pricePerCwt: number | null, totalPrice: number | null): boolean {
  if (pricePerCwt == null || Number.isNaN(pricePerCwt)) return false;
  if (totalPrice == null || Number.isNaN(totalPrice) || !(totalPrice > 0)) return false;
  return Math.abs(pricePerCwt - (totalPrice / grossWeightLb) * 100) < 0.02;
}

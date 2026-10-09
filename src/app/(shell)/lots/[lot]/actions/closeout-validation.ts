/**
 * Ported from the Save Assumptions handler's one hard rule (index.html:9835-9839): a target ship
 * date must fall strictly after the arrival date. `<=` is rejected, same as vanilla's
 * `new Date(shipDate) <= new Date(arrivalDate)` check -- an equal date is not allowed either.
 * No ship date set is not an error (the Projection column just shows no figures, per Phase 9).
 */
export function validateCloseoutAssumptions(input: { shipDate: string | null; arrivalDate: string | null }): string | null {
  if (input.shipDate && input.arrivalDate && new Date(input.shipDate) <= new Date(input.arrivalDate)) {
    return `Target ship date (${input.shipDate}) must be after arrival date (${input.arrivalDate}).`;
  }
  return null;
}

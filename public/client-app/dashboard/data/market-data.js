/**
 * Unit Economics dashboard -- Market Data tab (Client Files/Tab4-Market Data.jpg, not in John's
 * video but required). Reads `market_quotes` (Pricing History, Futures pricing) and `positions`
 * where position_type='lrp' (LRP) -- both real, already-live tables in the client's own Supabase
 * project (docs/sql/2026-09-10_markets_and_positions.sql), no new schema needed.
 *
 * UNITS (per that file's own header comment, read in full before writing this): feeder_cattle/
 * live_cattle `settle`/`coverage_price` are cents/lb, which is numerically the same numberas
 * $/cwt -- display as-is with a $/cwt label, not a conversion. Corn `settle` is cents/bushel --
 * displayed as cents/bu, never divided by 100 to invent a $/bu figure this file doesn't quote.
 * `premium` is dollars PER HEAD, already in the right unit to show directly.
 */
window.UEDash = window.UEDash || {};

(function () {
  const INSTRUMENTS = ["feeder_cattle", "live_cattle", "corn"];

  /** Every (quote_date, settle) this instrument has, across every contract month --
   * Pricing History reads this grouped by contract_month into one line per contract. */
  async function getPricingHistory(instrument) {
    const { data, error } = await supabase.from("market_quotes").select("quote_date, contract_month, settle").eq("instrument", instrument).order("quote_date", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  /** The forward curve as of today: the most recent settle on file for each contract month,
   * sorted by contract month -- "Futures pricing" from the sketch. */
  async function getFuturesCurve(instrument) {
    const { data, error } = await supabase
      .from("market_quotes")
      .select("contract_month, settle, quote_date")
      .eq("instrument", instrument)
      .order("contract_month", { ascending: true })
      .order("quote_date", { ascending: false });
    if (error) throw error;
    const latestByMonth = new Map();
    for (const r of data ?? []) {
      if (!latestByMonth.has(r.contract_month)) latestByMonth.set(r.contract_month, r);
    }
    return [...latestByMonth.values()].sort((a, b) => a.contract_month.localeCompare(b.contract_month));
  }

  /**
   * LRP endorsements -- coverage_price/head/end_date are the three fields this position type
   * cannot be saved without (positions_lrp_fields CHECK), so every row here has all three.
   * Excludes rows tagged "VERIFICATION ROW" -- the same seed/test marker the rest of this
   * codebase already filters out (see the old Overview's confirmedCount logic): these are
   * explicitly non-real positions left behind when the table was built, never real LRP coverage.
   */
  async function getLrpPositions() {
    const { data, error } = await supabase
      .from("positions")
      .select("id, head, coverage_price, premium, end_date, trade_date, status, notes")
      .eq("position_type", "lrp")
      .order("end_date", { ascending: true });
    if (error) throw error;
    return (data ?? []).filter((p) => !p.notes || !String(p.notes).includes("VERIFICATION ROW"));
  }

  Object.assign(window.UEDash, { MARKET_INSTRUMENTS: INSTRUMENTS, getPricingHistory, getFuturesCurve, getLrpPositions });
})();

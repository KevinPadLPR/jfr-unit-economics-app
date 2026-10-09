import { createClient } from "@/lib/supabase/server";

export interface LotRecord {
  id: string;
  lot_number: string;
  closed_at: string | null;
  is_test: boolean | null;
  is_feed_pen: boolean | null;
  fiscal_year: string | null;
}

export interface LotStatusRecord {
  lot_id: string;
  lot_number: string;
  closed_at: string | null;
  head_current: number | null;
  avg_weight_in: number | null;
  projected_current_weight: number | null;
  days_on_feed: number | null;
  source: string | null;
  sex_class: string | null;
  adg_used: number | null;
  adg_source: string | null;
  /** The rest are Closeout-only (Phase 9): closeoutActual() reads these off `st`. */
  head_in: number | null;
  head_dead: number | null;
  total_cost_in: number | null;
  total_weight_in: number | null;
  weighted_arrival_date: string | null;
}

export interface CurrentLocation {
  id: string;
  pasture_id: string;
  head_count: number | null;
  moved_in: string | null;
  notes: string | null;
  pasture_name: string | null;
  ranch_name: string | null;
}

/** Keyed by lot_number, not lots.id -- that's what /lots links by and what a human types into a URL. */
export async function getLotByNumber(lotNumber: string): Promise<LotRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lots")
    .select("id, lot_number, closed_at, is_test, is_feed_pen, fiscal_year")
    .eq("lot_number", lotNumber)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getLotStatus(lotId: string): Promise<LotStatusRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lot_status")
    .select(
      "lot_id, lot_number, closed_at, head_current, avg_weight_in, projected_current_weight, days_on_feed, source, sex_class, adg_used, adg_source, " +
        "head_in, head_dead, total_cost_in, total_weight_in, weighted_arrival_date"
    )
    .eq("lot_id", lotId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as LotStatusRecord | null;
}

export interface LotEditDetail {
  arrival_date: string | null;
  source: string | null;
  sex_class: string | null;
  target_adg: number | null;
  notes: string | null;
  est_purchase_weight_lb: number | null;
  est_weight_source: string | null;
  no_precon: boolean | null;
}

/** The extra columns the Edit/Duplicate lot form needs beyond `LotRecord` (index.html:9868-9907). */
export async function getLotEditDetail(lotId: string): Promise<LotEditDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lots")
    .select("arrival_date, source, sex_class, target_adg, notes, est_purchase_weight_lb, est_weight_source, no_precon")
    .eq("id", lotId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface LotCloseoutAssumptions {
  target_sale_cwt: number | null;
  target_days_on_feed: number | null;
  target_adg: number | null;
  target_ship_date: string | null;
  cog_mode: string | null;
  labor_mode: string | null;
  assumed_cog_per_lb: number | null;
  assumed_nonfeed_cog_per_day: number | null;
  assumed_labor_per_day: number | null;
  assumed_labor_per_head: number | null;
  assumed_processing_per_head: number | null;
  assumed_doctoring_per_head: number | null;
  assumed_death_loss_pct: number | null;
  assumed_interest_pct: number | null;
}

/**
 * The lot's saved cost-of-gain assumptions -- what `closeoutRates()` (index.html:8499-8522)
 * prefills its live input boxes from. This phase is read-only (no input boxes), so `rates` is
 * built directly from these saved columns rather than from any unsaved what-if the office might
 * be typing on the real Closeout tab.
 */
export async function getLotCloseoutAssumptions(lotId: string): Promise<LotCloseoutAssumptions | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lots")
    .select(
      "target_sale_cwt, target_days_on_feed, target_adg, target_ship_date, cog_mode, labor_mode, " +
        "assumed_cog_per_lb, assumed_nonfeed_cog_per_day, assumed_labor_per_day, assumed_labor_per_head, " +
        "assumed_processing_per_head, assumed_doctoring_per_head, assumed_death_loss_pct, assumed_interest_pct"
    )
    .eq("id", lotId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as LotCloseoutAssumptions | null;
}

/**
 * Ported from loadLotLocations() (public/client-app/index.html:25187-25194): the open
 * (moved_out is null) pasture assignments for this lot -- "where the lot is right now."
 */
export async function getCurrentLocations(lotId: string): Promise<CurrentLocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lot_pasture_assignments")
    .select("id, pasture_id, head_count, moved_in, notes, pastures(name, ranches(name))")
    .eq("lot_id", lotId)
    .is("moved_out", null)
    .order("head_count", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const pastures = r.pastures as unknown as { name: string | null; ranches: { name: string | null } | null } | null;
    return {
      id: r.id,
      pasture_id: r.pasture_id,
      head_count: r.head_count,
      moved_in: r.moved_in,
      notes: r.notes,
      pasture_name: pastures?.name ?? null,
      ranch_name: pastures?.ranches?.name ?? null,
    };
  });
}

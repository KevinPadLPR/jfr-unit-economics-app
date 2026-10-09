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
      "lot_id, lot_number, closed_at, head_current, avg_weight_in, projected_current_weight, days_on_feed, source, sex_class, adg_used, adg_source"
    )
    .eq("lot_id", lotId)
    .maybeSingle();
  if (error) throw error;
  return data;
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

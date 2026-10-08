import { createClient } from "@/lib/supabase/server";

export interface ActivePasture {
  id: string;
  name: string;
  ranch_name: string | null;
}

/**
 * Every active pasture -- the "+ Move" destination list and the stray-return pasture list
 * (a stray can be found anywhere, per the vanilla app's own grouping at index.html:26282-26303).
 * Same table/columns as `approvals/lookups.ts`'s existing pasture read, scoped down to active
 * only since this page's write modals never need to target a retired pasture.
 */
export async function getActivePastures(): Promise<ActivePasture[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pastures")
    .select("id, name, is_active, ranches(name)")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => {
    const ranch = p.ranches as unknown as { name: string | null } | null;
    return { id: p.id, name: p.name, ranch_name: ranch?.name ?? null };
  });
}

export interface FieldAction {
  id: string;
  name: string;
  requires_note: boolean | null;
  requires_meds: boolean | null;
}

/**
 * The Doctoring "+ New" action dropdown's real source (index.html:29082-29089), filtered the
 * same way: is_active, and is_dead excluded entirely -- "a doctoring row records no death"
 * (2026-10-03 rule). A death goes through "+ Record deaths" (Phase 3), never this.
 */
export async function getFieldActions(): Promise<FieldAction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("field_actions")
    .select("id, name, requires_note, requires_meds")
    .eq("is_active", true)
    .eq("is_dead", false)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface MedicationCatalogEntry {
  id: string;
  name: string;
  is_active: boolean | null;
  cost_per_unit: number | null;
  cost_per_head: number | null;
  round_up_to: number | null;
  bottle_size_unit: string | null;
  withdrawal_days: number | null;
}

/** Same shape as `LookupMedication` (approvals/lookups.ts) -- deliberately, so a row from this
 * query can be passed straight into the reused, exported `computeMedCost` (post.ts) without an
 * adapter. Written fresh here rather than imported, to keep the two features decoupled. */
export async function getMedicationCatalog(): Promise<MedicationCatalogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("medications")
    .select("id, name, is_active, cost_per_unit, cost_per_head, round_up_to, bottle_size_unit, withdrawal_days")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface ReceivingProtocol {
  id: string;
  name: string;
  version_label: string | null;
  protocol_type: string;
  sex_class: string | null;
}

/** The Invoice modal's protocol dropdown (index.html:10111-10124). */
export async function getReceivingProtocols(): Promise<ReceivingProtocol[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("protocols")
    .select("id, name, version_label, protocol_type, sex_class")
    .eq("is_active", true)
    .order("protocol_type", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Ported from lotDefaultProtocolId() (index.html:10086-10101): the protocol a new invoice most
 * likely uses -- whichever active protocol was used on the lot's latest load out or invoice,
 * else the one active `receiving`-type protocol if there's exactly one. Pre-picks a sensible
 * default; the dropdown is a normal select and can always be changed.
 */
export async function getDefaultProtocolId(lotId: string, protocols: ReceivingProtocol[]): Promise<string> {
  const supabase = await createClient();
  const active = new Set(protocols.map((p) => p.id));
  const [rc, inv] = await Promise.all([
    supabase
      .from("delivery_receipts")
      .select("receiving_protocol_id, receipt_date")
      .eq("lot_id", lotId)
      .not("receiving_protocol_id", "is", null)
      .order("receipt_date", { ascending: false })
      .limit(1),
    supabase
      .from("invoices")
      .select("receiving_protocol_id, invoice_date")
      .eq("lot_id", lotId)
      .not("receiving_protocol_id", "is", null)
      .order("invoice_date", { ascending: false })
      .limit(1),
  ]);
  const used = [...(rc.data ?? []), ...(inv.data ?? [])].map((r) => r.receiving_protocol_id).find((id) => active.has(id));
  if (used) return used;
  const receiving = protocols.filter((p) => p.protocol_type === "receiving");
  return receiving.length === 1 ? receiving[0].id : "";
}

import { createClient } from "@/lib/supabase/server";

export interface MoveEvent {
  id: string;
  move_date: string | null;
  head_count: number | null;
  notes: string | null;
  from_pasture_name: string | null;
  to_pasture_name: string | null;
}

export interface LotTransfer {
  transfer_id: string;
  transfer_date: string | null;
  kind: string | null;
  head_count: number | null;
  is_outbound: boolean;
  other_lot_number: string | null;
  basis_total: number | null;
  basis_per_head: number | null;
  notes: string | null;
}

interface RawMovement {
  id: string;
  move_date: string | null;
  head_count: number | null;
  notes: string | null;
  from_pasture_id: string | null;
  to_pasture_id: string | null;
}

interface RawTransfer {
  transfer_id: string;
  source_lot_id: string;
  dest_lot_id: string;
  source_lot_number: string | null;
  dest_lot_number: string | null;
  head_count: number | null;
  transfer_date: string | null;
  kind: string | null;
  basis_total: number | null;
  basis_per_head: number | null;
  notes: string | null;
}

/**
 * Ported from the "Move history" card (public/client-app/index.html:25345-25349):
 * lot_movements doesn't embed pasture relations, so names are resolved with one
 * batched follow-up lookup, same as loadAuditLog() does for its own pasture IDs.
 */
export async function getMoveHistory(lotId: string): Promise<MoveEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lot_movements")
    .select("id, move_date, head_count, notes, from_pasture_id, to_pasture_id")
    .eq("lot_id", lotId)
    .order("move_date", { ascending: false });
  if (error) throw error;
  const movements = (data ?? []) as RawMovement[];

  const pastureIds = new Set<string>();
  movements.forEach((m) => {
    if (m.from_pasture_id) pastureIds.add(m.from_pasture_id);
    if (m.to_pasture_id) pastureIds.add(m.to_pasture_id);
  });
  const names = await resolvePastureNames(supabase, pastureIds);

  return movements.map((m) => ({
    id: m.id,
    move_date: m.move_date,
    head_count: m.head_count,
    notes: m.notes,
    from_pasture_name: m.from_pasture_id ? names.get(m.from_pasture_id) ?? null : null,
    to_pasture_name: m.to_pasture_id ? names.get(m.to_pasture_id) ?? null : null,
  }));
}

async function resolvePastureNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pastureIds: Set<string>
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (pastureIds.size === 0) return names;
  const { data, error } = await supabase.from("pastures").select("id, name, ranches(name)").in("id", [...pastureIds]);
  if (error) throw error;
  (data ?? []).forEach((p) => {
    const ranch = p.ranches as unknown as { name: string | null } | null;
    names.set(p.id, `${ranch?.name ?? "?"} / ${p.name}`);
  });
  return names;
}

/**
 * Ported from renderLotTransfers() (public/client-app/index.html:16270-16357): lot-to-lot
 * transfers/merges/feed-pen sends, read from the lot_transfer_provenance view (note its PK
 * column is `transfer_id`, not `id` -- confirmed from the vanilla app's own button wiring).
 */
export async function getLotTransfers(lotId: string): Promise<LotTransfer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lot_transfer_provenance")
    .select(
      "transfer_id, source_lot_id, dest_lot_id, source_lot_number, dest_lot_number, head_count, " +
        "transfer_date, kind, basis_total, basis_per_head, notes"
    )
    .or(`source_lot_id.eq.${lotId},dest_lot_id.eq.${lotId}`)
    .order("transfer_date", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as RawTransfer[]).map((t) => {
    const isOutbound = t.source_lot_id === lotId;
    return {
      transfer_id: t.transfer_id,
      transfer_date: t.transfer_date,
      kind: t.kind,
      head_count: t.head_count,
      is_outbound: isOutbound,
      other_lot_number: isOutbound ? t.dest_lot_number : t.source_lot_number,
      basis_total: t.basis_total,
      basis_per_head: t.basis_per_head,
      notes: t.notes,
    };
  });
}

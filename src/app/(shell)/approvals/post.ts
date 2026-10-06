import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientRole } from "@/lib/roles";
import type { ResolvedEntry, ResolvedMed } from "./resolve";

export type PostedRef =
  | { kind: "doctoring_event"; id: string }
  | { kind: "lot_event"; id: string }
  | { kind: "lot_movement"; id: string };

function normalizeTag(tag: string): string {
  const s = String(tag ?? "").trim();
  return /^nt/i.test(s) ? s.toUpperCase() : s;
}

function computeMedCost(med: ResolvedMed["med"], doseCc: number | null): number | null {
  if (!med) return null;
  // Bottle pricing wins when both a per-unit cost and a dose exist.
  if (med.cost_per_unit != null && doseCc != null && doseCc > 0) {
    return Number(med.cost_per_unit) * Number(doseCc);
  }
  // Fallback: legacy flat cost_per_head (used for implants, tags, etc.)
  if (med.cost_per_head != null) return Number(med.cost_per_head);
  return null;
}

/** Ported from computeNextNTForLot() (index.html:28848-28872). */
async function computeNextNTForLot(supabase: SupabaseClient, lotId: string): Promise<string> {
  const { data, error } = await supabase
    .from("doctoring_events")
    .select("tag_number, no_tag, notes")
    .eq("lot_id", lotId)
    .eq("no_tag", true);
  // A failed read would hand out NT1 again and give two untagged animals one identity;
  // refuse instead.
  if (error) throw new Error(`Could not read the lot's NT numbers: ${error.message}`);
  let maxN = 0;
  for (const d of data ?? []) {
    for (const c of [String(d.tag_number ?? ""), String(d.notes ?? "")]) {
      const m = c.match(/NT\s*(\d+)/i);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
  }
  return `NT${maxN + 1}`;
}

/**
 * Ported from entryDayKey() (index.html:10538-10545). Doctoring/dead carry a dateTime;
 * moves carry a plain date. Falls back to the raw event_datetime, truncated.
 */
function entryDayKey(r: ResolvedEntry): string {
  const stamp = r.kind === "doctoring" || r.kind === "dead" ? (r.raw as Record<string, unknown>).dateTime : (r.raw as Record<string, unknown>).date;
  const d = String(stamp ?? r.entry.event_datetime ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

interface MedLedgerState {
  ranchLocationId: string | null;
  usageFrom: string | null;
  available: boolean;
}

/**
 * Ported from invLedgerReady() (index.html:36794-36807) -- the go-live gate. Looked up once
 * per batch (not cached across requests the way the vanilla app's module-level `let`s are,
 * since a Server Action has no persistent client-side state between calls).
 */
async function loadMedLedgerState(supabase: SupabaseClient): Promise<MedLedgerState> {
  const { data, error } = await supabase
    .from("med_stock_locations")
    .select("id, usage_from")
    .eq("kind", "ranch")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) return { ranchLocationId: null, usageFrom: null, available: false };
  return { ranchLocationId: data.id, usageFrom: data.usage_from ?? null, available: true };
}

/**
 * Ported from invRecordDoctoringUsage() (index.html:36809-36866). Draws the given meds off
 * the FIFO shelf for a doctoring event. Deliberately swallows a med_consume failure per med
 * (matches the vanilla app exactly) -- a treatment is never blocked by an inventory problem,
 * it just isn't drawn, and the next count catches the gap as shrink. The role gate
 * (office/owner only) exists because med_consume's RLS policies go through
 * can_read_books(), which excludes crew -- this function is only ever called from this
 * Server Action, which already refused a crew/accountant caller before reaching here, but
 * the check is kept as a second, explicit line matching the vanilla app's own belt-and-
 * suspenders approach.
 */
async function recordDoctoringUsage(
  supabase: SupabaseClient,
  role: ClientRole,
  eventId: string,
  medRows: { medication_id: string; dose_cc: number | null }[],
  eventDate: string | null
): Promise<void> {
  if (!medRows.length) return;
  if (role !== "owner" && role !== "office") return;
  const ledger = await loadMedLedgerState(supabase);
  if (!ledger.available || !ledger.ranchLocationId) return;
  const when = eventDate ? String(eventDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
  if (!ledger.usageFrom || when < ledger.usageFrom) return;
  for (const m of medRows) {
    const dose = Number(m.dose_cc);
    if (!m.medication_id || !(dose > 0)) continue;
    try {
      await supabase.rpc("med_consume", {
        p_medication_id: m.medication_id,
        p_location_id: ledger.ranchLocationId,
        p_qty_units: dose,
        p_txn_type: "usage",
        p_reason: "treatment",
        p_ref_kind: "doctoring_event",
        p_ref_id: eventId,
        p_txn_date: when,
      });
    } catch {
      // deliberately swallowed -- see docstring
    }
  }
}

/** Ported from invReverseDoctoringUsage() (index.html:36937-36948). */
async function reverseDoctoringUsage(supabase: SupabaseClient, eventId: string): Promise<void> {
  try {
    const { data } = await supabase.from("med_txns").select("id").eq("ref_kind", "doctoring_event").eq("ref_id", eventId);
    for (const t of data ?? []) {
      await supabase.rpc("med_reverse_txn", { p_txn_id: t.id });
    }
  } catch {
    // deliberately swallowed -- see docstring
  }
}

/** Ported from postDoctoringEntry() (index.html:11237-11284). */
export async function postDoctoringEntry(supabase: SupabaseClient, role: ClientRole, userId: string, r: ResolvedEntry): Promise<PostedRef> {
  if (!r.lot || !r.action) throw new Error("doctoring entry missing lot or action");
  let tag = normalizeTag(r.tag);
  if (!tag || /^NT[^0-9]*$/.test(tag)) tag = await computeNextNTForLot(supabase, r.lot.id);

  const payload = {
    lot_id: r.lot.id,
    tag_number: tag,
    no_tag: !!r.entry.no_tag || /^NT\d*$/.test(tag),
    event_datetime: r.entry.event_datetime,
    field_action_id: r.action.id,
    pasture_id: r.pasture ? r.pasture.id : null,
    notes: (r.raw.notes as string) || null,
    recorded_by_user_id: userId,
    // Idempotency key: ties the posted row back to the field record it came from.
    legacy_source: "field_app",
    legacy_id: r.entry.client_id,
  };
  const { data: evt, error } = await supabase.from("doctoring_events").insert(payload).select("id").single();
  if (error) throw new Error(`tag ${tag}: ${error.message}`);

  const medRows = r.meds
    .filter((m) => m.med && m.dose != null && m.dose > 0)
    .map((m) => ({
      doctoring_event_id: evt.id,
      position: m.position,
      medication_id: m.med!.id,
      medication_name_freetext: null,
      dose_cc: m.dose,
      cost: computeMedCost(m.med, m.dose),
    }));
  if (medRows.length) {
    const { error: medErr } = await supabase.from("doctoring_event_meds").insert(medRows);
    if (medErr) {
      // Undo the parent so a half-written event never survives.
      await supabase.from("doctoring_events").delete().eq("id", evt.id);
      throw new Error(`tag ${tag} meds: ${medErr.message}`);
    }
    await recordDoctoringUsage(supabase, role, evt.id, medRows, payload.event_datetime);
  }
  return { kind: "doctoring_event", id: evt.id };
}

/** Ported from postDeathEntry() (index.html:11286-11308). */
export async function postDeathEntry(supabase: SupabaseClient, userId: string, r: ResolvedEntry): Promise<PostedRef> {
  if (!r.lot || !r.pasture) throw new Error("death entry missing lot or pasture");
  const hauled = String((r.raw as Record<string, unknown>).drugOff ?? "").trim();
  const noteBits = [];
  if (r.raw.notes) noteBits.push(String(r.raw.notes));
  noteBits.push(`Carcass hauled off: ${hauled || "not answered"}`);
  noteBits.push("(from field app)");

  const { data, error } = await supabase.rpc("record_death_with_pasture", {
    p_lot_id: r.lot.id,
    p_pasture_id: r.pasture.id,
    p_head_count: 1, // a tagged death is one animal
    p_tag_number: r.tag || null,
    p_cause: null, // office fills cause in later
    p_event_date: entryDayKey(r) || String(r.entry.event_datetime ?? "").slice(0, 10),
    p_notes: noteBits.join(" · "),
    p_created_by: userId,
  });
  if (error) throw new Error(`tag ${r.tag} (death): ${error.message}`);
  return { kind: "lot_event", id: data as string };
}

/**
 * Ported from postMoveEntry() (index.html:11314-11343). Returns one ref per leg: a move
 * off a mixed pasture is one movement per lot, and each has to be reversible on its own.
 * record_move_with_pasture stays the only thing doing head math -- nothing here
 * reimplements it.
 */
export async function postMoveEntry(supabase: SupabaseClient, userId: string, r: ResolvedEntry): Promise<PostedRef[]> {
  if (!r.pasture || !r.toPasture) throw new Error("move entry missing from/to pasture");
  const legs = r.split ? r.split.map((x) => ({ lot: x.lot, head: x.head })) : r.lot && r.head ? [{ lot: r.lot, head: r.head }] : [];
  if (!legs.length) throw new Error("move entry has no lot/head to post");

  const refs: PostedRef[] = [];
  for (const leg of legs) {
    const note = [r.raw.notes as string | undefined, r.split ? `lot ${leg.lot.lot_number}, ${leg.head} of ${r.head} head` : null, "(from field app)"]
      .filter(Boolean)
      .join(" · ");
    const { data, error } = await supabase.rpc("record_move_with_pasture", {
      p_lot_id: leg.lot.id,
      p_from_pasture_id: r.pasture.id,
      p_to_pasture_id: r.toPasture.id,
      p_head_count: leg.head,
      p_move_date: entryDayKey(r) || String(r.entry.event_datetime ?? "").slice(0, 10),
      p_notes: note,
      p_recorded_by: userId,
    });
    if (error) {
      // Hand back what already posted so the batch rollback can unwind the earlier legs too.
      const err = new Error(`move ${r.raw.fromPasture} → ${r.raw.toPasture} (lot ${leg.lot.lot_number}): ${error.message}`) as Error & {
        partial?: PostedRef[];
      };
      err.partial = refs;
      throw err;
    }
    refs.push({ kind: "lot_movement", id: data as string });
  }
  return refs;
}

/**
 * Ported from rollbackPosted() (index.html:11409-11444), limited to the three kinds this
 * phase can post (doctoring_event, lot_event, lot_movement) -- count/weight aren't posted
 * by this Server Action yet, so they never appear in `posted`. Reverses in order: most
 * recent first.
 */
export async function rollbackPosted(supabase: SupabaseClient, posted: PostedRef[]): Promise<string[]> {
  const failures: string[] = [];
  for (const p of [...posted].reverse()) {
    try {
      if (p.kind === "doctoring_event") {
        await reverseDoctoringUsage(supabase, p.id);
        await supabase.from("doctoring_event_meds").delete().eq("doctoring_event_id", p.id);
        const { error } = await supabase.from("doctoring_events").delete().eq("id", p.id);
        if (error) throw error;
      } else if (p.kind === "lot_event") {
        const { error } = await supabase.rpc("delete_death_event", { p_event_id: p.id });
        if (error) throw error;
      } else if (p.kind === "lot_movement") {
        const { error } = await supabase.rpc("delete_move_event", { p_movement_id: p.id });
        if (error) throw error;
      }
    } catch (err) {
      // Not `err instanceof Error`: a PostgrestError (what supabase-js actually throws here,
      // via `if (error) throw error`) is a plain object, not an Error subclass, but it does
      // carry `.message` -- same thing the vanilla app's own `err.message || err` read
      // (index.html:11440) without needing to care about the distinction.
      const msg = (err as { message?: string } | null)?.message ?? String(err);
      failures.push(`${p.kind} ${p.id}: ${msg}`);
    }
  }
  return failures;
}

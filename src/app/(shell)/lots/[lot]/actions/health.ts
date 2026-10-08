"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { canWriteLotEntries } from "@/lib/roles";
import { isValidTagNumber, checkPastureAvailability } from "./health-validation";

export interface LotActionResult {
  ok: boolean;
  message: string;
}

export interface DeathRow {
  pastureId: string;
  tagNumber: string | null;
  headCount: number;
}

function path(lotNumber: string) {
  return `/lots/${encodeURIComponent(lotNumber)}`;
}

/**
 * Ported from the deaths-modal save (index.html:26653-26790). Deliberately NOT atomic across
 * rows -- the vanilla app's own save loop doesn't roll back a row that already posted if a
 * later one fails, and this mirrors that exactly rather than inventing a stronger guarantee
 * the production app doesn't have.
 */
export async function recordDeaths(
  lotNumber: string,
  lotId: string,
  rows: DeathRow[],
  eventDate: string,
  cause: string | null,
  notes: string | null
): Promise<LotActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot record deaths." };
  if (!rows.length) return { ok: false, message: "Add at least one row." };
  for (const r of rows) {
    if (!r.pastureId) return { ok: false, message: "Every row needs a pasture." };
    if (!Number.isInteger(r.headCount) || r.headCount < 1) return { ok: false, message: "Every row needs a head count of at least 1." };
    if (r.tagNumber && !isValidTagNumber(r.tagNumber)) return { ok: false, message: `Tag "${r.tagNumber}" isn't a valid tag number.` };
  }

  const supabase = await createClient();
  const { data: lot, error: lotError } = await supabase.from("lots").select("closed_at").eq("id", lotId).single();
  if (lotError) return { ok: false, message: lotError.message };
  if (lot.closed_at) return { ok: false, message: "This lot is closed -- re-open it first." };

  const { data: assignments, error: assignError } = await supabase
    .from("lot_pasture_assignments")
    .select("pasture_id, head_count")
    .eq("lot_id", lotId)
    .is("moved_out", null);
  if (assignError) return { ok: false, message: assignError.message };
  const availabilityError = checkPastureAvailability(rows, assignments ?? []);
  if (availabilityError) return { ok: false, message: availabilityError };

  let posted = 0;
  for (const r of rows) {
    const { error } = await supabase.rpc("record_death_with_pasture", {
      p_lot_id: lotId,
      p_pasture_id: r.pastureId,
      p_head_count: r.headCount,
      p_tag_number: r.tagNumber,
      p_cause: cause,
      p_event_date: eventDate,
      p_notes: notes,
      p_created_by: session.user.id,
    });
    if (error) {
      revalidatePath(path(lotNumber));
      const already = posted > 0 ? `${posted} of ${rows.length} rows saved before this one failed: ` : "Could not save: ";
      return { ok: false, message: `${already}${error.message}` };
    }
    posted++;
  }

  revalidatePath(path(lotNumber));
  return { ok: true, message: `${posted} death${posted === 1 ? "" : "s"} recorded.` };
}

/** Ported from the death-log delete handler (index.html:26792-26808). Owner-only inside the RPC. */
export async function deleteDeath(lotNumber: string, eventId: string): Promise<LotActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (session.user.role !== "owner") return { ok: false, message: "Only an owner can delete a death." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_death_event", { p_event_id: eventId });
  if (error) return { ok: false, message: error.message };

  revalidatePath(path(lotNumber));
  return { ok: true, message: "Death deleted and head restored." };
}

/**
 * Shared guard for record_missing_head / record_stray_return (index.html:26238-26245): both
 * refuse a closed or feed-pen lot inside the RPC too, but checking first surfaces the vanilla
 * app's own precise reason instead of a generic Postgres error.
 */
async function guardLotForAdjustment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lotId: string
): Promise<string | null> {
  const { data: lot, error } = await supabase.from("lots").select("closed_at, is_feed_pen").eq("id", lotId).single();
  if (error) return error.message;
  if (lot.closed_at) return "This lot is closed -- re-open it first.";
  if (lot.is_feed_pen) return "Feed pens use their own entries (Head found / Record removal), not this.";
  return null;
}

/** Ported from openHeadAdjustModal('missing') / saveHeadAdjustment (index.html:26236-26350). */
export async function recordMissingHead(
  lotNumber: string,
  lotId: string,
  pastureId: string,
  headCount: number,
  eventDate: string,
  tagNumber: string | null,
  notes: string | null
): Promise<LotActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot write off missing head." };
  if (!Number.isInteger(headCount) || headCount < 1) return { ok: false, message: "Head count must be at least 1." };

  const supabase = await createClient();
  const guardError = await guardLotForAdjustment(supabase, lotId);
  if (guardError) return { ok: false, message: guardError };

  const { data: assignment } = await supabase
    .from("lot_pasture_assignments")
    .select("head_count")
    .eq("lot_id", lotId)
    .eq("pasture_id", pastureId)
    .is("moved_out", null)
    .maybeSingle();
  const available = assignment?.head_count ?? 0;
  if (headCount > available) return { ok: false, message: `Only ${available} head available in that pasture -- ${headCount} requested.` };

  const { error } = await supabase.rpc("record_missing_head", {
    p_lot_id: lotId,
    p_pasture_id: pastureId,
    p_head: headCount,
    p_event_date: eventDate,
    p_tag_number: tagNumber,
    p_notes: notes,
    p_recorded_by: session.user.id,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath(path(lotNumber));
  return { ok: true, message: "Missing head written off." };
}

/** Ported from openHeadAdjustModal('stray') / saveHeadAdjustment (index.html:26236-26350). */
export async function recordStrayReturn(
  lotNumber: string,
  lotId: string,
  pastureId: string,
  headCount: number,
  eventDate: string,
  tagNumber: string | null,
  notes: string | null
): Promise<LotActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot record a stray return." };
  if (!Number.isInteger(headCount) || headCount < 1) return { ok: false, message: "Head count must be at least 1." };

  const supabase = await createClient();
  // record_stray_return refuses a closed lot explicitly (per its own design doc: "put the
  // stray in the feed pen instead"), so the same guard applies -- the RPC also enforces its
  // own date-not-before-first-arrival rule, which isn't worth duplicating client-side.
  const guardError = await guardLotForAdjustment(supabase, lotId);
  if (guardError) return { ok: false, message: guardError };

  const { error } = await supabase.rpc("record_stray_return", {
    p_lot_id: lotId,
    p_pasture_id: pastureId,
    p_head: headCount,
    p_event_date: eventDate,
    p_tag_number: tagNumber,
    p_notes: notes,
    p_recorded_by: session.user.id,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath(path(lotNumber));
  return { ok: true, message: "Stray return recorded." };
}

/** Reverses either of the above (index.html:26352-26368). Owner-only inside the RPC, which
 * raises an explicit "Not deleted: only the owner..." message if RLS silently no-ops the
 * delete -- surfaced verbatim via `error.message` rather than replaced with a generic one. */
export async function deleteHeadAdjustment(lotNumber: string, eventId: string): Promise<LotActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (session.user.role !== "owner") return { ok: false, message: "Only an owner can delete a head adjustment." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_head_adjustment", { p_event_id: eventId });
  if (error) return { ok: false, message: error.message };

  revalidatePath(path(lotNumber));
  return { ok: true, message: "Adjustment deleted and head restored." };
}

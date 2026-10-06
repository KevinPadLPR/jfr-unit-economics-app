"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { canWriteApprovals } from "@/lib/roles";
import { loadApprovalLookups } from "./lookups";
import { resolveApprovalEntry, flagDuplicateApprovals, type PendingFieldEntry, type ResolvedEntry } from "./resolve";
import { postDoctoringEntry, postDeathEntry, postMoveEntry, rollbackPosted, type PostedRef } from "./post";

export interface ApproveResult {
  ok: boolean;
  message: string;
}

const QUEUE_COLUMNS =
  "id, entry_type, client_id, raw, status, review_notes, submitted_at, submitted_by, " +
  "event_datetime, lot_id, pasture_id, to_pasture_id, field_action_id, " +
  "tag_number, no_tag, head_count, resolved_meds, resolved_detail";

/**
 * Re-resolves exactly the rows the caller asked for, against a fresh read of the queue and
 * lookups -- never trusts a client-submitted "this row is ready" claim, since the queue can
 * change between the page rendering and the button being clicked (another reviewer, or the
 * cowboy editing the field app, could both change what a row resolves to).
 */
async function resolveSelected(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entryIds: string[]
): Promise<ResolvedEntry[]> {
  const [{ data: entries, error }, lookups] = await Promise.all([
    supabase.from("pending_field_entries").select(QUEUE_COLUMNS).eq("status", "pending").in("id", entryIds),
    loadApprovalLookups(),
  ]);
  if (error) throw error;

  const resolved = ((entries ?? []) as unknown as PendingFieldEntry[]).map((e) => resolveApprovalEntry(e, lookups));
  await flagDuplicateApprovals(resolved, async (lotIds) => {
    const { data } = await supabase.from("doctoring_events").select("tag_number, lot_id, field_action_id").in("lot_id", lotIds);
    return data ?? [];
  });
  return resolved;
}

/**
 * Ported from approveSelected() (index.html:11446-11536), restricted to the three kinds
 * this phase can post (doctoring/dead/move) -- count/weight entries are refused with a
 * clear message rather than silently skipped or half-ported, matching the plan's explicit
 * phase boundary. Batch is all-or-nothing: if any row fails, every already-posted row in
 * this call is rolled back before returning.
 */
export async function approveEntries(entryIds: string[], reviewNotes?: Record<string, string>): Promise<ApproveResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  // Belt and suspenders, matching the vanilla app's own pattern (docs/database.md:
  // "Tagging is cosmetic; the wrapper is the enforcement") -- RLS on doctoring_events /
  // the SECURITY INVOKER RPCs is the real backstop, this just avoids a pointless round
  // trip for a role that can never succeed anyway.
  if (!canWriteApprovals(session.user.role)) return { ok: false, message: "Your role cannot approve entries." };
  if (!entryIds.length) return { ok: false, message: "Nothing selected." };

  const supabase = await createClient();
  const rows = await resolveSelected(supabase, entryIds);

  const unsupported = rows.filter((r) => r.kind === "count" || r.kind === "weight");
  if (unsupported.length) {
    return {
      ok: false,
      message: `${unsupported.length} selected ${unsupported.length === 1 ? "entry is" : "entries are"} a kind (count/weight) ` +
        `this preview doesn't post yet -- approve those from the existing app for now.`,
    };
  }
  const notReady = rows.filter((r) => !r.ready);
  if (notReady.length) {
    return { ok: false, message: `${notReady.length} selected ${notReady.length === 1 ? "entry has" : "entries have"} unresolved issues -- fix them first.` };
  }

  // Doctoring first: it touches no head math at all. Deaths and moves BOTH move head
  // between pastures, so they replay in the order the day actually happened -- a move that
  // empties a pasture, posted before a death recorded in that same pasture, would leave
  // record_death_with_pasture with no active assignment and fail a batch that is perfectly
  // valid in the right order.
  const headMath = rows
    .filter((r) => r.kind === "dead" || r.kind === "move")
    .sort((a, b) => String(a.entry.event_datetime ?? "").localeCompare(String(b.entry.event_datetime ?? "")));
  const ordered = [...rows.filter((r) => r.kind === "doctoring"), ...headMath];

  const posted: PostedRef[] = [];
  try {
    const refsByEntryId = new Map<string, PostedRef[]>();
    for (const r of ordered) {
      let refs: PostedRef[];
      try {
        if (r.kind === "dead") refs = [await postDeathEntry(supabase, session.user.id, r)];
        else if (r.kind === "move") refs = await postMoveEntry(supabase, session.user.id, r);
        else refs = [await postDoctoringEntry(supabase, session.user.role, session.user.id, r)];
      } catch (e) {
        const partial = (e as { partial?: PostedRef[] }).partial;
        if (partial) posted.push(...partial);
        throw e;
      }
      posted.push(...refs);
      refsByEntryId.set(r.entry.id, refs);
    }

    // Only once every row is in the books do we mark the queue.
    for (const r of ordered) {
      const refs = refsByEntryId.get(r.entry.id)!;
      const { error } = await supabase
        .from("pending_field_entries")
        .update({
          status: "approved",
          approved_ref: refs.length === 1 ? refs[0] : refs,
          review_notes: reviewNotes?.[r.entry.id]?.trim() || null,
        })
        .eq("id", r.entry.id);
      if (error) throw new Error(`marking ${r.tag || "move"} approved: ${error.message}`);
    }

    revalidatePath("/approvals");
    return { ok: true, message: `${ordered.length} ${ordered.length === 1 ? "entry" : "entries"} posted to the books.` };
  } catch (err) {
    const failures = await rollbackPosted(supabase, posted);
    revalidatePath("/approvals");
    // Same defensive read as rollbackPosted() (post.ts): don't assume a real Error instance.
    const message = (err as { message?: string } | null)?.message ?? String(err);
    if (failures.length) {
      // The dangerous case: something is in the books that should not be. Say precisely
      // what, and do not pretend otherwise.
      return {
        ok: false,
        message: `Batch failed: ${message}. ROLLBACK INCOMPLETE — these are still in the books and need attention: ${failures.join("; ")}`,
      };
    }
    return { ok: false, message: `Batch failed and was rolled back — nothing was posted. ${message}` };
  }
}

/** Ported from rejectApprovalEntry() (index.html:11538-11557). */
export async function rejectEntry(id: string, reason: string): Promise<ApproveResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteApprovals(session.user.role)) return { ok: false, message: "Your role cannot reject entries." };
  if (!reason.trim()) return { ok: false, message: "A reason is required to reject." };

  const supabase = await createClient();
  // The reason goes first (the cowboy reads it in the field app); any earlier office note
  // is kept after it rather than overwritten.
  const { data: existing } = await supabase.from("pending_field_entries").select("review_notes").eq("id", id).maybeSingle();
  const prior = existing?.review_notes ? ` · ${existing.review_notes}` : "";

  const { data, error } = await supabase
    .from("pending_field_entries")
    .update({ status: "rejected", review_notes: reason.trim() + prior })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, message: `Could not reject: ${error.message}` };
  if (!data || !data.length) {
    return { ok: false, message: "Not rejected: nothing was changed. The entry may already have been approved or rejected." };
  }

  revalidatePath("/approvals");
  return { ok: true, message: "Entry rejected and sent back." };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { canWriteLotEntries } from "@/lib/roles";
import type { MovePair } from "../moves-pairing";

export interface LotActionResult {
  ok: boolean;
  message: string;
}

function path(lotNumber: string) {
  return `/lots/${encodeURIComponent(lotNumber)}`;
}

/**
 * Reverses every already-posted leg, most-recent-first. Ported from the "+ Move" modal's own
 * partial-failure handling (index.html:27097-27112) -- delete_move_event is owner-only inside
 * the RPC, so an office-role rollback can itself fail; that failure is collected and named
 * rather than hidden behind a claim that the rollback succeeded.
 */
async function rollbackMoves(supabase: Awaited<ReturnType<typeof createClient>>, movementIds: string[]): Promise<string[]> {
  const failures: string[] = [];
  for (const id of [...movementIds].reverse()) {
    const { error } = await supabase.rpc("delete_move_event", { p_movement_id: id });
    if (error) failures.push(`${id}: ${(error as { message?: string } | null)?.message ?? String(error)}`);
  }
  return failures;
}

/**
 * Ported from the "+ Move" modal's save (index.html:27014-27123). `pairs` is already split by
 * `pairMoves()` client-side -- this Action posts each pair and rolls back whatever already
 * posted if a later one fails, same as vanilla. `p_from_pasture_id: null` (a pair drawn from
 * the synthetic "Unassigned" source) tells the RPC this head has no prior pasture.
 */
export async function recordMove(lotNumber: string, lotId: string, moveDate: string, pairs: MovePair[], notes: string | null): Promise<LotActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot record a move." };
  if (!pairs.length) return { ok: false, message: "Nothing to move." };

  const supabase = await createClient();
  const posted: string[] = [];
  for (const p of pairs) {
    const noteParts = [notes, p.notes].filter((n): n is string => Boolean(n));
    const { data, error } = await supabase.rpc("record_move_with_pasture", {
      p_lot_id: lotId,
      p_from_pasture_id: p.fromPastureId,
      p_to_pasture_id: p.toPastureId,
      p_head_count: p.headCount,
      p_move_date: moveDate,
      p_notes: noteParts.length ? noteParts.join(" · ") : null,
      p_recorded_by: session.user.id,
    });
    if (error) {
      const failures = await rollbackMoves(supabase, posted);
      revalidatePath(path(lotNumber));
      if (failures.length) {
        return {
          ok: false,
          message: `Move failed: ${error.message}. ROLLBACK INCOMPLETE — these legs are still in the books and need attention: ${failures.join("; ")}`,
        };
      }
      return { ok: false, message: `Move failed and was rolled back — nothing was posted. ${error.message}` };
    }
    posted.push(data as string);
  }

  revalidatePath(path(lotNumber));
  return { ok: true, message: `${posted.length} leg${posted.length === 1 ? "" : "s"} posted.` };
}

/** Ported from the Move history delete handler. Owner-only inside the RPC. */
export async function deleteMove(lotNumber: string, movementId: string): Promise<LotActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (session.user.role !== "owner") return { ok: false, message: "Only an owner can delete a move." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_move_event", { p_movement_id: movementId });
  if (error) return { ok: false, message: error.message };

  revalidatePath(path(lotNumber));
  return { ok: true, message: "Move deleted and head restored." };
}

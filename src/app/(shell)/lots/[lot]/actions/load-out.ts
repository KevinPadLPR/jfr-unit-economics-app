"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { canWriteLotEntries } from "@/lib/roles";
import { parseMissingTags, checkTagCountMatchesHead, validateLoadOutDestinations } from "./load-out-validation";
import { recordProcessingDraw } from "./processing-draw";

export interface LoadOutInput {
  receiptDate: string;
  headCount: number;
  tagStart: number | null;
  tagEnd: number | null;
  missingTagsRaw: string;
  receivingProtocolId: string | null;
  invoiceId: string | null;
  notes: string | null;
  destinationRows: { pastureId: string; headCount: number | null }[];
}

export interface TagConflict {
  tagNumber: number;
  lotNumber: string;
}

export interface LoadOutActionResult {
  ok: boolean;
  message: string;
  needsTagConflict?: boolean;
  conflicts?: TagConflict[];
}

export type TagConflictChoice = { skip: true } | { overrideReason: string };

function path(lotNumber: string) {
  return `/lots/${encodeURIComponent(lotNumber)}`;
}

/**
 * Ported from the receipt save handler (index.html:27465-27600) + actuallySaveLoadOut
 * (27669-27722). Edit only ever changes protocol/invoice/notes (everything else is locked in
 * the vanilla modal too, 27323-27333); new goes through duplicate-block, then tag-conflict,
 * then the already-verified `record_load_out` RPC in one transaction.
 */
export async function saveLoadOut(
  mode: "new" | "edit",
  receiptId: string | null,
  lotId: string,
  lotNumber: string,
  fiscalYear: string | null,
  input: LoadOutInput,
  tagConflictChoice?: TagConflictChoice
): Promise<LoadOutActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot record a load out." };

  const supabase = await createClient();

  if (mode === "edit" && receiptId) {
    const { data, error } = await supabase
      .from("delivery_receipts")
      .update({
        receiving_protocol_id: input.receivingProtocolId,
        invoice_id: input.invoiceId,
        notes: input.notes?.trim() || null,
      })
      .eq("id", receiptId)
      .select("id");
    if (error) return { ok: false, message: error.message };
    if (!data || !data.length) {
      return { ok: false, message: "Nothing was saved: the load out could not be updated (it may have been deleted, or your login cannot change it)." };
    }
    const draw = await recordProcessingDraw(receiptId, session.user.role, true);
    revalidatePath(path(lotNumber));
    return { ok: true, message: draw?.message ? `Load out updated. ${draw.message}` : "Load out updated." };
  }

  const missing = parseMissingTags(input.missingTagsRaw);
  const tagCountError = checkTagCountMatchesHead(input.tagStart, input.tagEnd, missing, input.headCount);
  if (tagCountError) return { ok: false, message: tagCountError };

  const destResult = validateLoadOutDestinations(input.headCount, input.destinationRows);
  if ("error" in destResult) return { ok: false, message: destResult.error };

  // DUPLICATE LOAD-OUT CHECK -- hard block, no override (index.html:27526-27547).
  let dupQ = supabase
    .from("delivery_receipts")
    .select("id")
    .eq("lot_id", lotId)
    .eq("receipt_date", input.receiptDate)
    .eq("head_count", input.headCount);
  dupQ = input.tagStart != null ? dupQ.eq("tag_start", input.tagStart) : dupQ.is("tag_start", null);
  dupQ = input.tagEnd != null ? dupQ.eq("tag_end", input.tagEnd) : dupQ.is("tag_end", null);
  const { data: dups, error: dupError } = await dupQ;
  if (dupError) return { ok: false, message: dupError.message };
  if (dups && dups.length > 0) {
    return {
      ok: false,
      message:
        `DUPLICATE LOAD OUT -- not saved. A receipt already exists on this lot for ${input.receiptDate} with ${input.headCount} head and the ` +
        "same tag range. If this is a correction, edit the existing receipt instead of entering a new one.",
    };
  }

  // TAG CONFLICT CHECK -- before saving anything (index.html:27549-27592).
  const tagList: number[] = [];
  if (input.tagStart != null && input.tagEnd != null) {
    for (let t = input.tagStart; t <= input.tagEnd; t++) if (!missing.includes(t)) tagList.push(t);
  }

  let conflicts: { tag_number: number; lot_id: string; lot_number: string }[] = [];
  if (tagList.length > 0 && fiscalYear) {
    const { data: conflictData, error: confError } = await supabase
      .from("tag_registry")
      .select("tag_number, lot_id, lot_number")
      .eq("fiscal_year", fiscalYear)
      .eq("status", "active")
      .in("tag_number", tagList);
    if (!confError) conflicts = (conflictData ?? []).filter((c) => c.lot_id !== lotId);
  }

  if (conflicts.length > 0 && !tagConflictChoice) {
    return {
      ok: false,
      needsTagConflict: true,
      conflicts: conflicts.map((c) => ({ tagNumber: c.tag_number, lotNumber: c.lot_number })),
      message: `${conflicts.length} tag${conflicts.length === 1 ? "" : "s"} from this load-out are already registered to another lot in fiscal year ${fiscalYear}.`,
    };
  }

  const conflictTagSet = new Set(conflicts.map((c) => c.tag_number));
  const tagsToRegister = tagConflictChoice && "skip" in tagConflictChoice ? tagList.filter((t) => !conflictTagSet.has(t)) : tagList;
  const overrideReason = tagConflictChoice && "overrideReason" in tagConflictChoice ? tagConflictChoice.overrideReason : null;

  const { data, error } = await supabase.rpc("record_load_out", {
    p_lot_id: lotId,
    p_receipt_date: input.receiptDate,
    p_head_count: input.headCount,
    p_tag_start: input.tagStart,
    p_tag_end: input.tagEnd,
    p_missing_tags: missing.length > 0 ? missing : [],
    p_receiving_protocol_id: input.receivingProtocolId,
    p_invoice_id: input.invoiceId,
    p_notes: input.notes?.trim() || null,
    p_destinations: destResult.destinations.map((d) => ({ pasture_id: d.pastureId, head_count: d.headCount })),
    p_register_tags: tagsToRegister,
    p_override_reason: overrideReason,
  });
  if (error) return { ok: false, message: `Load out NOT saved, nothing was changed: ${error.message}` };

  const newReceiptId = (data as { receipt_id: string }).receipt_id;
  const draw = await recordProcessingDraw(newReceiptId, session.user.role, false);

  revalidatePath(path(lotNumber));
  const base = `Load out saved: ${input.headCount} head in, ${tagsToRegister.length} tag(s) registered.`;
  return { ok: true, message: draw?.message ? `${base} ${draw.message}` : base };
}

/** Ported from the receipt delete handler (index.html:27724-27739). */
export async function deleteLoadOut(lotNumber: string, receiptId: string): Promise<LoadOutActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot delete a load out." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_receipt_with_reversal", { p_receipt_id: receiptId });
  if (error) return { ok: false, message: error.message };

  revalidatePath(path(lotNumber));
  const s = (data ?? {}) as { head_count?: number; pastures_reversed?: number; tags_deleted?: number };
  return {
    ok: true,
    message: `Load out deleted and reversed: ${s.head_count ?? "?"} hd backed out of ${s.pastures_reversed ?? 0} pasture(s), ${s.tags_deleted ?? 0} tag(s) unregistered.`,
  };
}

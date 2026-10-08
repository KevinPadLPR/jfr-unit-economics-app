"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { canWriteLotEntries } from "@/lib/roles";
import { computeNextNTForLot, normalizeTag, recordDoctoringUsage, reverseDoctoringUsage } from "@/app/(shell)/approvals/post";
import { buildMedRows, validateDoctoringEntry, type MedRowInput } from "./doctoring-validation";
import type { MedicationCatalogEntry } from "../data/reference";

export interface LotActionResult {
  ok: boolean;
  message: string;
  needsTagOverride?: boolean;
}

export interface DoctoringInput {
  tagNumber: string;
  noTag: boolean;
  actionId: string;
  actionRequiresNote: boolean;
  actionRequiresMeds: boolean;
  date: string;
  pastureId: string | null;
  notes: string | null;
  medRows: MedRowInput[];
}

function path(lotNumber: string) {
  return `/lots/${encodeURIComponent(lotNumber)}`;
}

/**
 * Ported from the doctoring save handler (index.html:29314-29480). Re-fetches the referenced
 * medications server-side (never trusts a client-submitted catalog/cost) to build the same
 * `medsById` shape `buildMedRows`/`computeMedCost` need. `overrideTagReason` is supplied on a
 * second call after the UI shows the soft tag-registration warning inline
 * (vanilla uses `prompt()` here, index.html:29341-29377 -- this Action returns
 * `needsTagOverride` instead so the UI can ask without a native dialog).
 */
export async function recordDoctoring(
  lotNumber: string,
  lotId: string,
  input: DoctoringInput,
  overrideTagReason?: string
): Promise<LotActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot record doctoring entries." };

  const supabase = await createClient();

  let tagNumber = normalizeTag(input.tagNumber);
  if (input.noTag && !/^NT[0-9]+$/.test(tagNumber)) {
    tagNumber = await computeNextNTForLot(supabase, lotId);
  }

  const medIds = input.medRows.map((r) => r.medicationId).filter((id): id is string => !!id);
  let medsById = new Map<string, MedicationCatalogEntry>();
  if (medIds.length) {
    const { data: meds, error: medsError } = await supabase
      .from("medications")
      .select("id, name, is_active, cost_per_unit, cost_per_head, round_up_to, bottle_size_unit, withdrawal_days")
      .in("id", medIds);
    if (medsError) return { ok: false, message: medsError.message };
    medsById = new Map((meds ?? []).map((m) => [m.id, m as MedicationCatalogEntry]));
  }
  const medRows = buildMedRows(input.medRows, medsById);

  const validationError = validateDoctoringEntry({
    tagNumber,
    noTag: input.noTag,
    actionId: input.actionId,
    date: input.date,
    action: { requires_note: input.actionRequiresNote, requires_meds: input.actionRequiresMeds },
    notes: input.notes,
    medRows,
  });
  if (validationError) return { ok: false, message: validationError };

  let notes = input.notes;
  // Soft tag-registration check (index.html:29341-29377) -- skipped for no-tag animals.
  if (!input.noTag) {
    const tagInt = parseInt(tagNumber, 10);
    if (!Number.isNaN(tagInt)) {
      const { data: activeHere } = await supabase.from("lot_tags").select("tag_number").eq("tag_number", tagInt).eq("lot_id", lotId).eq("status", "active");
      if (!activeHere || activeHere.length === 0) {
        if (!overrideTagReason?.trim()) {
          const { data: activeElsewhere } = await supabase
            .from("lot_tags")
            .select("lot_id, lots(lot_number)")
            .eq("tag_number", tagInt)
            .eq("status", "active")
            .maybeSingle();
          const otherLotNumber = (activeElsewhere?.lots as unknown as { lot_number?: string } | null)?.lot_number;
          const detail = otherLotNumber
            ? `Tag ${tagNumber} is currently active on lot ${otherLotNumber}, not lot ${lotNumber}.`
            : `Tag ${tagNumber} is not registered to any active lot.`;
          return {
            ok: false,
            needsTagOverride: true,
            message: `Tag ${tagNumber} is not registered as active on lot ${lotNumber}. ${detail}`,
          };
        }
        notes = (notes ? `${notes} | ` : "") + `Tag override: ${overrideTagReason.trim()}`;
      }
    }
  }

  const payload = {
    lot_id: lotId,
    tag_number: tagNumber,
    no_tag: input.noTag,
    event_datetime: `${input.date}T08:00:00Z`,
    field_action_id: input.actionId,
    pasture_id: input.pastureId,
    drug_off: null,
    notes,
    recorded_by_user_id: session.user.id,
  };
  const { data: evt, error } = await supabase.from("doctoring_events").insert(payload).select("id").single();
  if (error) {
    if (error.message.includes("duplicate_once_per_animal")) {
      return { ok: false, message: "This action has already been recorded for this tag in this lot. (Once-per-animal rule.)" };
    }
    return { ok: false, message: error.message };
  }

  if (medRows.length) {
    const medPayload = medRows.map((m) => ({ ...m, doctoring_event_id: evt.id }));
    const { error: medErr } = await supabase.from("doctoring_event_meds").insert(medPayload);
    if (medErr) {
      // Undo the parent so a half-written event never survives.
      await supabase.from("doctoring_events").delete().eq("id", evt.id);
      return { ok: false, message: `Meds: ${medErr.message}` };
    }
    // A free-text med (no medication_id) has nothing to draw off the FIFO shelf -- only
    // catalog meds reach the ledger, same as recordDoctoringUsage's own internal guard.
    const fifoRows = medRows.filter((m): m is typeof m & { medication_id: string } => m.medication_id !== null);
    await recordDoctoringUsage(supabase, session.user.role, evt.id, fifoRows, payload.event_datetime);
  }

  revalidatePath(path(lotNumber));
  return { ok: true, message: "Doctoring entry recorded." };
}

/** Ported from the doctoring delete handler (index.html:29482-29499). No owner-gate in vanilla
 * for this one (unlike deaths/moves/adjustments) -- confirmed by its card only carrying
 * `data-perm="office"`, no `data-perm="owner"` on the delete button itself. */
export async function deleteDoctoring(lotNumber: string, eventId: string): Promise<LotActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot delete a doctoring entry." };

  const supabase = await createClient();
  await reverseDoctoringUsage(supabase, eventId);
  const { error: medErr } = await supabase.from("doctoring_event_meds").delete().eq("doctoring_event_id", eventId);
  if (medErr) return { ok: false, message: `Failed to delete meds: ${medErr.message}` };
  const { error } = await supabase.from("doctoring_events").delete().eq("id", eventId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(path(lotNumber));
  return { ok: true, message: "Doctoring entry deleted." };
}

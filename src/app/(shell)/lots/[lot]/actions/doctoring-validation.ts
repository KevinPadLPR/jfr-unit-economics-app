import { computeMedCost } from "@/app/(shell)/approvals/post";
import type { MedicationCatalogEntry } from "../data/reference";

export interface MedRowInput {
  position: number;
  medicationId: string | null;
  medicationNameFreetext: string | null;
  doseCc: number | null;
}
export interface BuiltMedRow {
  position: number;
  medication_id: string | null;
  medication_name_freetext: string | null;
  dose_cc: number | null;
  cost: number | null;
}

/**
 * Ported from the save handler's med-row collection (index.html:29388-29412): drops a row with
 * neither a catalog pick nor a free-text name, and freezes `cost` via the reused `computeMedCost`
 * -- a catalog med prices itself, a free-text one never does (no pricing info to freeze).
 */
export function buildMedRows(rows: MedRowInput[], medsById: Map<string, MedicationCatalogEntry>): BuiltMedRow[] {
  return rows
    .filter((r) => r.medicationId || (r.medicationNameFreetext && r.medicationNameFreetext.trim()))
    .map((r) => ({
      position: r.position,
      medication_id: r.medicationId,
      medication_name_freetext: r.medicationId ? null : r.medicationNameFreetext,
      dose_cc: r.doseCc,
      cost: r.medicationId ? computeMedCost(medsById.get(r.medicationId) ?? null, r.doseCc) : null,
    }));
}

export interface DoctoringActionLike {
  requires_note: boolean | null;
  requires_meds: boolean | null;
}

/** Ported from the save handler's validation (index.html:29334-29416), in the same order. */
export function validateDoctoringEntry(input: {
  tagNumber: string;
  noTag: boolean;
  actionId: string;
  date: string;
  action: DoctoringActionLike | null;
  notes: string | null;
  medRows: BuiltMedRow[];
}): string | null {
  if (!input.noTag && !input.tagNumber.trim()) return "Tag number is required.";
  if (!input.date) return "Date is required.";
  if (!input.actionId) return "Pick an action.";
  if (input.action?.requires_note && !input.notes?.trim()) {
    return 'This action requires notes (e.g., "Other" needs a description).';
  }
  if (input.action?.requires_meds && input.medRows.length === 0) {
    return "This action requires at least one medication.";
  }
  return null;
}

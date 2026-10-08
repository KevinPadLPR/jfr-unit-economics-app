import { describe, it, expect } from "vitest";
import { buildMedRows, validateDoctoringEntry } from "./doctoring-validation";
import type { MedicationCatalogEntry } from "../data/reference";

function makeMed(overrides: Partial<MedicationCatalogEntry> = {}): MedicationCatalogEntry {
  return {
    id: "med-1",
    name: "Draxxin",
    is_active: true,
    cost_per_unit: 2.5,
    cost_per_head: null,
    round_up_to: null,
    bottle_size_unit: "mL",
    withdrawal_days: 18,
    ...overrides,
  };
}

describe("buildMedRows", () => {
  it("drops a row with neither a catalog pick nor a free-text name", () => {
    const rows = buildMedRows([{ position: 1, medicationId: null, medicationNameFreetext: "", doseCc: 5 }], new Map());
    expect(rows).toEqual([]);
  });

  it("freezes cost via computeMedCost for a catalog med", () => {
    const med = makeMed();
    const rows = buildMedRows([{ position: 1, medicationId: med.id, medicationNameFreetext: null, doseCc: 5 }], new Map([[med.id, med]]));
    expect(rows).toEqual([{ position: 1, medication_id: med.id, medication_name_freetext: null, dose_cc: 5, cost: 12.5 }]);
  });

  it("never prices a free-text med", () => {
    const rows = buildMedRows([{ position: 2, medicationId: null, medicationNameFreetext: "Compounded X", doseCc: 3 }], new Map());
    expect(rows).toEqual([{ position: 2, medication_id: null, medication_name_freetext: "Compounded X", dose_cc: 3, cost: null }]);
  });
});

describe("validateDoctoringEntry", () => {
  const base = { tagNumber: "123", noTag: false, actionId: "action-1", date: "2026-10-08", action: null, notes: null, medRows: [] };

  it("passes a well-formed entry", () => {
    expect(validateDoctoringEntry(base)).toBeNull();
  });

  it("requires a tag number unless no-tag", () => {
    expect(validateDoctoringEntry({ ...base, tagNumber: "" })).toMatch(/Tag number is required/);
    expect(validateDoctoringEntry({ ...base, tagNumber: "", noTag: true })).toBeNull();
  });

  it("requires a date", () => {
    expect(validateDoctoringEntry({ ...base, date: "" })).toMatch(/Date is required/);
  });

  it("requires an action", () => {
    expect(validateDoctoringEntry({ ...base, actionId: "" })).toMatch(/Pick an action/);
  });

  it("enforces requires_note", () => {
    const action = { requires_note: true, requires_meds: false };
    expect(validateDoctoringEntry({ ...base, action, notes: null })).toMatch(/requires notes/);
    expect(validateDoctoringEntry({ ...base, action, notes: "Other: saw a limp" })).toBeNull();
  });

  it("enforces requires_meds", () => {
    const action = { requires_note: false, requires_meds: true };
    expect(validateDoctoringEntry({ ...base, action, medRows: [] })).toMatch(/at least one medication/);
    expect(
      validateDoctoringEntry({
        ...base,
        action,
        medRows: [{ position: 1, medication_id: "m1", medication_name_freetext: null, dose_cc: 5, cost: 1 }],
      })
    ).toBeNull();
  });
});

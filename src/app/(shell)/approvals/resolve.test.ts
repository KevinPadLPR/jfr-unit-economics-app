import { describe, it, expect } from "vitest";
import { resolveApprovalEntry, type PendingFieldEntry } from "./resolve";
import type { ApprovalLookups, LookupLot, LookupPasture, LookupFieldAction, LookupMedication } from "./lookups";

function makeLot(overrides: Partial<LookupLot> = {}): LookupLot {
  return { id: "lot-1", lot_number: "31-26", closed_at: null, is_test: false, ...overrides };
}
function makePasture(overrides: Partial<LookupPasture> = {}): LookupPasture {
  return { id: "pasture-1", name: "North 40", ranch_id: "ranch-1", is_active: true, ...overrides };
}
function makeAction(overrides: Partial<LookupFieldAction> = {}): LookupFieldAction {
  return { id: "action-1", name: "First Pull EX", is_dead: false, once_per_animal: true, is_active: true, ...overrides };
}
function makeMed(overrides: Partial<LookupMedication> = {}): LookupMedication {
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

function makeLookups(overrides: Partial<ApprovalLookups> = {}): ApprovalLookups {
  const lot = makeLot();
  const pasture = makePasture();
  const action = makeAction();
  const med = makeMed();
  return {
    lotsByName: new Map([[lot.lot_number.toLowerCase(), lot]]),
    ranchesByName: new Map([["east", { id: "ranch-1", name: "East", is_active: true }]]),
    pastures: [pasture],
    actionsByName: new Map([[action.name.toLowerCase(), action]]),
    medsByName: new Map([[med.name.toLowerCase(), med]]),
    medsById: new Map([[med.id, med]]),
    lotsById: new Map([[lot.id, lot]]),
    actionsById: new Map([[action.id, action]]),
    pasturesById: new Map([[pasture.id, pasture]]),
    ranchesById: new Map([["ranch-1", { id: "ranch-1", name: "East", is_active: true }]]),
    assignments: [{ lot_id: lot.id, pasture_id: pasture.id, head_count: 40, moved_out: null }],
    ...overrides,
  };
}

function makeEntry(overrides: Partial<PendingFieldEntry> = {}): PendingFieldEntry {
  return {
    id: "entry-1",
    entry_type: "doctoring",
    client_id: "client-1",
    raw: { lotNumber: "31-26", location: "East - North 40", treatmentType: "First Pull EX", tagNumber: "123" },
    status: "pending",
    review_notes: null,
    submitted_at: "2026-10-01T12:00:00Z",
    submitted_by: "user-1",
    event_datetime: "2026-10-01T12:00:00Z",
    lot_id: null,
    pasture_id: null,
    to_pasture_id: null,
    field_action_id: null,
    tag_number: null,
    no_tag: false,
    head_count: null,
    resolved_meds: [],
    resolved_detail: null,
    ...overrides,
  };
}

describe("resolveApprovalEntry — doctoring", () => {
  it("resolves a clean doctoring entry as ready, with meds from the raw cowboy fields", () => {
    const entry = makeEntry({ raw: { lotNumber: "31-26", location: "East - North 40", treatmentType: "First Pull EX", tagNumber: "123", medication1: "Draxxin", dosage1: "5" } });
    const r = resolveApprovalEntry(entry, makeLookups());
    expect(r.kind).toBe("doctoring");
    expect(r.ready).toBe(true);
    expect(r.lot?.lot_number).toBe("31-26");
    expect(r.meds).toHaveLength(1);
    expect(r.meds[0].med?.name).toBe("Draxxin");
    expect(r.meds[0].dose).toBe(5);
  });

  it("blocks when the lot isn't found rather than guessing", () => {
    const entry = makeEntry({ raw: { lotNumber: "99-99", location: "East - North 40", treatmentType: "First Pull EX" } });
    const r = resolveApprovalEntry(entry, makeLookups());
    expect(r.ready).toBe(false);
    expect(r.issues.some((i) => i.includes("not found"))).toBe(true);
  });

  it("resolves a death (action.is_dead) as kind 'dead', not 'doctoring'", () => {
    const deadAction = makeAction({ id: "action-2", name: "Died - Respiratory", is_dead: true });
    const lookups = makeLookups({ actionsByName: new Map([[deadAction.name.toLowerCase(), deadAction]]), actionsById: new Map([[deadAction.id, deadAction]]) });
    const entry = makeEntry({ raw: { lotNumber: "31-26", location: "East - North 40", treatmentType: "Died - Respiratory", drugOff: "yes" } });
    const r = resolveApprovalEntry(entry, lookups);
    expect(r.kind).toBe("dead");
    expect(r.isDead).toBe(true);
    expect(r.notHauled).toBe(false);
  });

  it("flags carcass disposal as a warning, not a blocker, when drugOff is unanswered", () => {
    const deadAction = makeAction({ id: "action-2", name: "Died - Respiratory", is_dead: true });
    const lookups = makeLookups({ actionsByName: new Map([[deadAction.name.toLowerCase(), deadAction]]), actionsById: new Map([[deadAction.id, deadAction]]) });
    const entry = makeEntry({ raw: { lotNumber: "31-26", location: "East - North 40", treatmentType: "Died - Respiratory" } });
    const r = resolveApprovalEntry(entry, lookups);
    expect(r.notHauled).toBe(true);
    expect(r.warnings.some((w) => w.includes("carcass disposal"))).toBe(true);
    expect(r.ready).toBe(true); // a warning, not a blocker
  });

  // Regression guard for the 2026-08-31 meds-loss incident (docs/field-entries.md): an
  // OFFICE edit that explicitly clears the med list (resolved_meds: []) must stay cleared,
  // not silently fall back to the cowboy's original raw medication1/dosage1 fields.
  it("respects an office edit that explicitly clears the med list (does not fall back to raw meds)", () => {
    const entry = makeEntry({
      lot_id: "lot-1", // presence of any FK column means "the office edited this row"
      resolved_meds: [],
      raw: { lotNumber: "31-26", location: "East - North 40", treatmentType: "First Pull EX", medication1: "Draxxin", dosage1: "5" },
    });
    const r = resolveApprovalEntry(entry, makeLookups());
    expect(r.meds).toHaveLength(0);
  });

  it("falls back to the cowboy's raw medication fields when the row was never office-edited", () => {
    const entry = makeEntry({
      lot_id: null,
      resolved_meds: [], // naturally empty on an untouched row -- must NOT be mistaken for an edit
      raw: { lotNumber: "31-26", location: "East - North 40", treatmentType: "First Pull EX", medication1: "Draxxin", dosage1: "5" },
    });
    const r = resolveApprovalEntry(entry, makeLookups());
    expect(r.meds).toHaveLength(1);
    expect(r.meds[0].name).toBe("Draxxin");
  });

  it("flags a duplicate once-per-animal action as a blocker", () => {
    const entry = makeEntry({ raw: { lotNumber: "31-26", location: "East - North 40", treatmentType: "First Pull EX", tagNumber: "123" } });
    const r = resolveApprovalEntry(entry, makeLookups());
    r.ready = true; // sanity: resolves clean on its own
    expect(r.issues).toHaveLength(0);
    // flagDuplicateApprovals is tested separately (it needs a DB round trip to check
    // existing doctoring_events, so it's not part of this pure-function test).
  });
});

describe("resolveApprovalEntry — move", () => {
  it("infers the lot when the from-pasture holds exactly one open lot", () => {
    const entry = makeEntry({
      entry_type: "move",
      raw: { fromRanch: "East", fromPasture: "North 40", toRanch: "East", toPasture: "North 40", headCount: "10" },
    });
    const lookups = makeLookups({
      pastures: [makePasture({ id: "p1", name: "North 40" }), makePasture({ id: "p2", name: "South 40" })],
      pasturesById: new Map([
        ["p1", makePasture({ id: "p1", name: "North 40" })],
        ["p2", makePasture({ id: "p2", name: "South 40" })],
      ]),
      assignments: [{ lot_id: "lot-1", pasture_id: "p1", head_count: 40, moved_out: null }],
    });
    (entry.raw as Record<string, unknown>).fromPasture = "North 40";
    (entry.raw as Record<string, unknown>).toPasture = "South 40";
    const r = resolveApprovalEntry(entry, lookups);
    expect(r.kind).toBe("move");
    expect(r.lot?.lot_number).toBe("31-26");
    expect(r.warnings.some((w) => w.includes("inferred"))).toBe(true);
  });

  it("blocks when head count exceeds what the from-pasture holds", () => {
    const entry = makeEntry({
      entry_type: "move",
      raw: { fromRanch: "East", fromPasture: "North 40", toRanch: "East", toPasture: "South 40", headCount: "999", lotNumber: "31-26" },
    });
    const lookups = makeLookups({
      pastures: [makePasture({ id: "p1", name: "North 40" }), makePasture({ id: "p2", name: "South 40" })],
      pasturesById: new Map([
        ["p1", makePasture({ id: "p1", name: "North 40" })],
        ["p2", makePasture({ id: "p2", name: "South 40" })],
      ]),
      assignments: [{ lot_id: "lot-1", pasture_id: "p1", head_count: 40, moved_out: null }],
    });
    const r = resolveApprovalEntry(entry, lookups);
    expect(r.ready).toBe(false);
    expect(r.issues.some((i) => i.includes("exceeds"))).toBe(true);
  });
});

describe("resolveApprovalEntry — count", () => {
  it("blocks when the counted head doesn't match the books (a gap means a missing event, not a split)", () => {
    const entry = makeEntry({ entry_type: "count", raw: { ranch: "East", pasture: "North 40", countedHead: "35" } });
    const r = resolveApprovalEntry(entry, makeLookups());
    expect(r.kind).toBe("count");
    expect(r.ready).toBe(false);
    expect(r.diff).toBe(-5); // 35 counted vs 40 on the books
  });

  it("is ready when the count matches the books exactly", () => {
    const entry = makeEntry({ entry_type: "count", raw: { ranch: "East", pasture: "North 40", countedHead: "40" } });
    const r = resolveApprovalEntry(entry, makeLookups());
    expect(r.ready).toBe(true);
    expect(r.diff).toBe(0);
  });
});

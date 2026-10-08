import { describe, it, expect } from "vitest";
import { mergeAuditEvents } from "./audit";

const NORTH = "pasture-north";
const SOUTH = "pasture-south";
const names = new Map([
  [NORTH, "East / North 40"],
  [SOUTH, "East / South 40"],
]);

describe("mergeAuditEvents", () => {
  it("flattens a receipt with no load-out destination into one event", () => {
    const events = mergeAuditEvents(
      [{ id: "r1", receipt_date: "2026-05-01", head_count: 50, tag_start: 100, tag_end: 149, notes: null, load_out_destinations: [] }],
      [],
      [],
      [],
      [],
      names
    );
    expect(events).toEqual([
      {
        kind: "receipt",
        date: "2026-05-01",
        source_name: null,
        dest_name: "(no load-out destination)",
        head: 50,
        label: "Receipt (tags 100-149)",
        notes: null,
      },
    ]);
  });

  it("emits one event per load-out destination on a split receipt", () => {
    const events = mergeAuditEvents(
      [
        {
          id: "r1",
          receipt_date: "2026-05-01",
          head_count: 80,
          tag_start: null,
          tag_end: null,
          notes: null,
          load_out_destinations: [
            { head_count: 50, pastures: { id: NORTH, name: "North 40", ranches: { name: "East" } } },
            { head_count: 30, pastures: { id: SOUTH, name: "South 40", ranches: { name: "East" } } },
          ],
        },
      ],
      [],
      [],
      [],
      [],
      names
    );
    expect(events).toHaveLength(2);
    expect(events[0].dest_name).toBe("East / North 40");
    expect(events[1].dest_name).toBe("East / South 40");
  });

  it("reads a negative head_count adjustment as a source (missing head) and a positive one as a destination (stray returned)", () => {
    const events = mergeAuditEvents(
      [],
      [],
      [
        { event_date: "2026-06-01", event_type: "adjustment", head_count: -2, tag_number: null, cause: "missing", notes: null, pasture_id: NORTH },
        { event_date: "2026-06-05", event_type: "adjustment", head_count: 1, tag_number: "77", cause: "stray", notes: null, pasture_id: SOUTH },
      ],
      [],
      [],
      names
    );
    const missing = events.find((e) => e.label === "missing")!;
    const stray = events.find((e) => e.label === "stray tag 77")!;
    expect(missing.source_name).toBe("East / North 40");
    expect(missing.dest_name).toBeNull();
    expect(missing.head).toBe(2);
    expect(stray.dest_name).toBe("East / South 40");
    expect(stray.source_name).toBeNull();
  });

  it("reports a death's head_count as its absolute value regardless of sign", () => {
    const events = mergeAuditEvents(
      [],
      [],
      [{ event_date: "2026-06-10", event_type: "death", head_count: -3, tag_number: "12", cause: "bloat", notes: null, pasture_id: NORTH }],
      [],
      [],
      names
    );
    expect(events[0].head).toBe(3);
    expect(events[0].label).toBe("Death tag 12 (bloat)");
  });

  it("joins a sale to its sale_sources by sale_id, one event per source", () => {
    const events = mergeAuditEvents(
      [],
      [],
      [],
      [{ id: "s1", sale_date: "2026-07-01", head_count: 40, buyer: "Acme Beef", notes: null }],
      [
        { sale_id: "s1", pasture_id: NORTH, head_count: 25 },
        { sale_id: "s1", pasture_id: SOUTH, head_count: 15 },
      ],
      names
    );
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.label === "Sale → Acme Beef")).toBe(true);
    expect(events.map((e) => e.head)).toEqual([25, 15]);
  });

  it("sorts newest first, tie-breaking same-day events receipt before move before death before adjustment before sale", () => {
    const events = mergeAuditEvents(
      [{ id: "r1", receipt_date: "2026-08-01", head_count: 10, tag_start: null, tag_end: null, notes: null, load_out_destinations: [] }],
      [{ from_pasture_id: NORTH, to_pasture_id: SOUTH, move_date: "2026-08-01", head_count: 5, notes: null }],
      [
        { event_date: "2026-08-01", event_type: "death", head_count: -1, tag_number: null, cause: null, notes: null, pasture_id: null },
        { event_date: "2026-07-01", event_type: "adjustment", head_count: 1, tag_number: null, cause: "stray", notes: null, pasture_id: null },
      ],
      [{ id: "s1", sale_date: "2026-08-01", head_count: 2, buyer: "Acme", notes: null }],
      [],
      names
    );
    expect(events.map((e) => e.kind)).toEqual(["receipt", "move", "death", "sale", "adjustment"]);
  });
});

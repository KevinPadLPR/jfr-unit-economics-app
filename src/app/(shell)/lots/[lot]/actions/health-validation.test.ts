import { describe, it, expect } from "vitest";
import { isValidTagNumber, checkPastureAvailability } from "./health-validation";

describe("isValidTagNumber", () => {
  it.each(["1", "123", "NT1", "NT42", "NT0"])("accepts %s", (tag) => {
    expect(isValidTagNumber(tag)).toBe(true);
  });
  it.each(["0", "01", "NT", "abc", ""])("rejects %s", (tag) => {
    expect(isValidTagNumber(tag)).toBe(false);
  });
});

describe("checkPastureAvailability", () => {
  const assignments = [
    { pasture_id: "north", head_count: 10 },
    { pasture_id: "south", head_count: 5 },
  ];

  it("allows a single row within availability", () => {
    expect(checkPastureAvailability([{ pastureId: "north", headCount: 10 }], assignments)).toBeNull();
  });

  it("nets two rows against the same pasture before refusing", () => {
    const rows = [
      { pastureId: "north", headCount: 6 },
      { pastureId: "north", headCount: 4 },
    ];
    expect(checkPastureAvailability(rows, assignments)).toBeNull();
  });

  it("refuses when the netted request exceeds what's open there", () => {
    const rows = [
      { pastureId: "north", headCount: 6 },
      { pastureId: "north", headCount: 6 },
    ];
    expect(checkPastureAvailability(rows, assignments)).toMatch(/Only 10 head available/);
  });

  it("treats a pasture with no open assignment as zero available", () => {
    expect(checkPastureAvailability([{ pastureId: "east", headCount: 1 }], assignments)).toMatch(/Only 0 head available/);
  });
});

import { describe, it, expect } from "vitest";
import { pairMoves } from "./moves-pairing";

const NORTH = "pasture-north";
const SOUTH = "pasture-south";
const EAST = "pasture-east";

describe("pairMoves", () => {
  it("pairs a single source to a single destination", () => {
    const pairs = pairMoves([{ pastureId: NORTH, label: "North", available: 50, requested: 20 }], [{ pastureId: SOUTH, headCount: 20 }]);
    expect(pairs).toEqual([{ fromPastureId: NORTH, toPastureId: SOUTH, headCount: 20, notes: undefined }]);
  });

  it("splits one source across two destinations", () => {
    const pairs = pairMoves(
      [{ pastureId: NORTH, label: "North", available: 30, requested: 30 }],
      [
        { pastureId: SOUTH, headCount: 20 },
        { pastureId: EAST, headCount: 10 },
      ]
    );
    expect(pairs).toEqual([
      { fromPastureId: NORTH, toPastureId: SOUTH, headCount: 20, notes: undefined },
      { fromPastureId: NORTH, toPastureId: EAST, headCount: 10, notes: undefined },
    ]);
  });

  it("feeds one destination from two sources", () => {
    const pairs = pairMoves(
      [
        { pastureId: NORTH, label: "North", available: 15, requested: 15 },
        { pastureId: EAST, label: "East", available: 15, requested: 15 },
      ],
      [{ pastureId: SOUTH, headCount: 30 }]
    );
    expect(pairs).toEqual([
      { fromPastureId: NORTH, toPastureId: SOUTH, headCount: 15, notes: undefined },
      { fromPastureId: EAST, toPastureId: SOUTH, headCount: 15, notes: undefined },
    ]);
  });

  it("tags a pair drawn from the synthetic Unassigned source (pastureId: null)", () => {
    const pairs = pairMoves([{ pastureId: null, label: "Unassigned", available: 40, requested: 40 }], [{ pastureId: SOUTH, headCount: 40 }]);
    expect(pairs).toEqual([{ fromPastureId: null, toPastureId: SOUTH, headCount: 40, notes: "From unassigned (initial placement)" }]);
  });

  it("ignores a source or destination with nothing requested/needed", () => {
    const pairs = pairMoves(
      [
        { pastureId: NORTH, label: "North", available: 10, requested: 0 },
        { pastureId: EAST, label: "East", available: 10, requested: 10 },
      ],
      [{ pastureId: SOUTH, headCount: 10 }]
    );
    expect(pairs).toEqual([{ fromPastureId: EAST, toPastureId: SOUTH, headCount: 10, notes: undefined }]);
  });

  it("stops once either side is exhausted, leaving no dangling zero-head pair", () => {
    const pairs = pairMoves([{ pastureId: NORTH, label: "North", available: 5, requested: 5 }], [{ pastureId: SOUTH, headCount: 5 }]);
    expect(pairs).toHaveLength(1);
  });
});

import { describe, it, expect } from "vitest";
import { parseMissingTags, computeTagSummary, checkTagCountMatchesHead, validateLoadOutDestinations } from "./load-out-validation";

describe("parseMissingTags", () => {
  it("parses a comma list, dropping blanks and non-positive junk", () => {
    expect(parseMissingTags("101, 105,  0, abc, 110")).toEqual([101, 105, 110]);
  });
  it("returns empty for blank input", () => {
    expect(parseMissingTags("")).toEqual([]);
    expect(parseMissingTags("   ")).toEqual([]);
  });
});

describe("computeTagSummary", () => {
  it("returns nulls when no range is given", () => {
    expect(computeTagSummary(null, null, [])).toEqual({ count: null, ranges: null, error: null });
  });
  it("errors when end < start", () => {
    expect(computeTagSummary(10, 5, []).error).toBe("End tag must be >= start tag");
  });
  it("counts a contiguous range with no gaps as one range", () => {
    expect(computeTagSummary(100, 104, [])).toEqual({ count: 5, ranges: "100-104", error: null });
  });
  it("splits around missing tags into separate ranges and excludes them from the count", () => {
    expect(computeTagSummary(100, 105, [102, 103])).toEqual({ count: 4, ranges: "100-101, 104-105", error: null });
  });
  it("renders a single missing tag at the boundary correctly", () => {
    expect(computeTagSummary(100, 102, [100])).toEqual({ count: 2, ranges: "101-102", error: null });
  });
});

describe("checkTagCountMatchesHead", () => {
  it("passes when there's no tag range at all", () => {
    expect(checkTagCountMatchesHead(null, null, [], 50)).toBeNull();
  });
  it("passes when the tag count matches head count", () => {
    expect(checkTagCountMatchesHead(100, 149, [], 50)).toBeNull();
  });
  it("refuses when they don't match, naming both numbers", () => {
    expect(checkTagCountMatchesHead(100, 149, [], 48)).toMatch(/Tag count \(50\) does not match head count \(48\)/);
  });
  it("lets the missing-tags field account for the gap", () => {
    expect(checkTagCountMatchesHead(100, 149, [101, 102], 48)).toBeNull();
  });
});

describe("validateLoadOutDestinations", () => {
  it("single destination: takes head count from the top field, requires a pasture", () => {
    expect(validateLoadOutDestinations(40, [{ pastureId: "", headCount: null }])).toEqual({ error: "Pick a destination pasture for the load out." });
    expect(validateLoadOutDestinations(0, [{ pastureId: "north", headCount: null }])).toEqual({ error: "Head count is required." });
    expect(validateLoadOutDestinations(40, [{ pastureId: "north", headCount: null }])).toEqual({ destinations: [{ pastureId: "north", headCount: 40 }] });
  });

  it("multi destination: requires at least one valid row", () => {
    expect(
      validateLoadOutDestinations(40, [
        { pastureId: "", headCount: 0 },
        { pastureId: "", headCount: null },
      ])
    ).toEqual({ error: "Pick at least one destination pasture for the load out." });
  });

  it("multi destination: must sum exactly to head count", () => {
    expect(
      validateLoadOutDestinations(40, [
        { pastureId: "north", headCount: 20 },
        { pastureId: "south", headCount: 15 },
      ])
    ).toEqual({ error: "Destinations total (35 hd) must equal head count (40 hd). Adjust destinations or head count to match." });
  });

  it("multi destination: accepts a valid split, dropping empty rows", () => {
    expect(
      validateLoadOutDestinations(40, [
        { pastureId: "north", headCount: 20 },
        { pastureId: "", headCount: null },
        { pastureId: "south", headCount: 20 },
      ])
    ).toEqual({
      destinations: [
        { pastureId: "north", headCount: 20 },
        { pastureId: "south", headCount: 20 },
      ],
    });
  });
});

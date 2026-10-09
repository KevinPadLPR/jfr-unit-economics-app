export interface TagSummary {
  count: number | null;
  ranges: string | null;
  error: string | null;
}

/** Ported verbatim from parseMissingTags() (index.html:27162-27165). */
export function parseMissingTags(s: string): number[] {
  if (!s || !s.trim()) return [];
  return s
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((x) => !Number.isNaN(x) && x > 0);
}

/**
 * Ported verbatim from computeTagSummary() (index.html:27133-27161): compresses a tag range
 * minus its missing tags into contiguous display ranges, and counts the tags actually present.
 */
export function computeTagSummary(start: number | null, end: number | null, missing: number[]): TagSummary {
  if (start == null || end == null) {
    return { count: null, ranges: null, error: null };
  }
  if (end < start) {
    return { count: null, ranges: null, error: "End tag must be >= start tag" };
  }
  const missingSet = new Set((missing ?? []).filter((n) => n >= start && n <= end));
  const ranges: string[] = [];
  let runStart: number | null = null;
  let count = 0;
  for (let n = start; n <= end; n++) {
    if (missingSet.has(n)) {
      if (runStart != null) {
        ranges.push(runStart === n - 1 ? `${runStart}` : `${runStart}-${n - 1}`);
        runStart = null;
      }
    } else {
      if (runStart == null) runStart = n;
      count++;
    }
  }
  if (runStart != null) {
    ranges.push(runStart === end ? `${runStart}` : `${runStart}-${end}`);
  }
  return { count, ranges: ranges.join(", "), error: null };
}

/** Ported from the save handler's Phase-14 hard rule (index.html:27481-27487). */
export function checkTagCountMatchesHead(tagStart: number | null, tagEnd: number | null, missing: number[], headCount: number): string | null {
  if (tagStart == null || tagEnd == null) return null;
  const summary = computeTagSummary(tagStart, tagEnd, missing);
  if (summary.error) return summary.error;
  if (summary.count != null && headCount !== summary.count) {
    return (
      `Tag count (${summary.count}) does not match head count (${headCount}). If some tags in the range are ` +
      "missing, list them in the Missing tags field. Otherwise correct one of the values."
    );
  }
  return null;
}

export interface DestinationRow {
  pastureId: string;
  headCount: number;
}

/**
 * Ported from the save handler's destination validation (index.html:27490-27512): with exactly
 * one destination, the top head-count field supplies its count (the row's own head input is
 * hidden in the vanilla UI for that case); with 2+, each row needs a pasture and a positive
 * head count, and they must sum exactly to `headCount`.
 */
export function validateLoadOutDestinations(
  headCount: number,
  rows: { pastureId: string; headCount: number | null }[]
): { destinations: DestinationRow[] } | { error: string } {
  if (rows.length === 1) {
    const [row] = rows;
    if (!row.pastureId) return { error: "Pick a destination pasture for the load out." };
    if (!(headCount > 0)) return { error: "Head count is required." };
    return { destinations: [{ pastureId: row.pastureId, headCount }] };
  }

  const valid = rows.filter((r): r is { pastureId: string; headCount: number } => !!r.pastureId && Number(r.headCount) > 0);
  const total = valid.reduce((s, r) => s + Number(r.headCount), 0);
  if (valid.length === 0) return { error: "Pick at least one destination pasture for the load out." };
  if (total !== headCount) {
    return { error: `Destinations total (${total} hd) must equal head count (${headCount} hd). Adjust destinations or head count to match.` };
  }
  return { destinations: valid };
}

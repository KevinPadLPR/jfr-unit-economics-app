/** Mirrors the DB CHECK constraint on doctoring_events/lot_events tag_number (index.html:26666-26684). */
const TAG_PATTERN = /^([1-9][0-9]*|NT[0-9]+)$/;

export function isValidTagNumber(tag: string): boolean {
  return TAG_PATTERN.test(tag.trim());
}

export interface DeathRowInput {
  pastureId: string;
  headCount: number;
}
export interface OpenAssignment {
  pasture_id: string;
  head_count: number | null;
}

/**
 * Ported from the deaths-modal's pasture-availability guard (index.html:26689-26722): nets the
 * requested head per pasture across every row -- two rows drawing the same pasture are checked
 * together, not independently -- against what's actually open there right now. Returns a
 * human-readable reason the save should be refused, or null if every pasture has enough.
 */
export function checkPastureAvailability(rows: DeathRowInput[], assignments: OpenAssignment[]): string | null {
  const available = new Map<string, number>();
  assignments.forEach((a) => available.set(a.pasture_id, (available.get(a.pasture_id) ?? 0) + (a.head_count ?? 0)));

  const requested = new Map<string, number>();
  rows.forEach((r) => requested.set(r.pastureId, (requested.get(r.pastureId) ?? 0) + r.headCount));

  for (const [pastureId, head] of requested) {
    const avail = available.get(pastureId) ?? 0;
    if (head > avail) return `Only ${avail} head available in that pasture -- ${head} requested.`;
  }
  return null;
}

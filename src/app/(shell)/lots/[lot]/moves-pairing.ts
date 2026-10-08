export interface MoveSource {
  /** null = the synthetic "Unassigned" source (head_current minus every open assignment). */
  pastureId: string | null;
  label: string;
  available: number;
}
export interface MoveDestination {
  pastureId: string;
  headCount: number;
}
export interface MovePair {
  fromPastureId: string | null;
  toPastureId: string;
  headCount: number;
  notes?: string;
}

/**
 * Ported from the "+ Move" modal's save-time pairing walk (public/client-app/index.html:27043-27074):
 * a greedy two-pointer merge over sources and destinations, in the order given, splitting a
 * source across destinations (or a destination across sources) exactly as needed. A source
 * with `pastureId: null` is the synthetic "Unassigned" row (a lot's first-ever placement); any
 * pair drawn from it is tagged with the same auto-note the vanilla app appends.
 *
 * Pure and order-sensitive by design, matching vanilla: callers control allocation by the order
 * they pass sources/destinations in, not by any sorting done here.
 */
export function pairMoves(sources: (MoveSource & { requested: number })[], destinations: MoveDestination[]): MovePair[] {
  const pairs: MovePair[] = [];
  const srcs = sources.filter((s) => s.requested > 0).map((s) => ({ pastureId: s.pastureId, remaining: s.requested }));
  const dests = destinations.filter((d) => d.headCount > 0).map((d) => ({ pastureId: d.pastureId, remaining: d.headCount }));

  let si = 0;
  let di = 0;
  while (si < srcs.length && di < dests.length) {
    const s = srcs[si];
    const d = dests[di];
    const headCount = Math.min(s.remaining, d.remaining);
    if (headCount > 0) {
      pairs.push({
        fromPastureId: s.pastureId,
        toPastureId: d.pastureId,
        headCount,
        notes: s.pastureId === null ? "From unassigned (initial placement)" : undefined,
      });
      s.remaining -= headCount;
      d.remaining -= headCount;
    }
    if (s.remaining === 0) si++;
    if (d.remaining === 0) di++;
  }
  return pairs;
}

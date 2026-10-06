import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { postDoctoringEntry, postDeathEntry, postMoveEntry, rollbackPosted } from "./post";
import type { ResolvedEntry } from "./resolve";

/**
 * A minimal chainable Supabase mock: every query-builder method (select/insert/eq/...)
 * returns the same object, and the object itself is thenable, resolving to a pre-configured
 * {data, error} regardless of how deep the real chain goes (`.insert(x).select('id').single()`
 * all resolve to the one result queued for that `.from(table)` call). This mirrors supabase-js's
 * own "the builder is a promise" design without needing the real client or a network call.
 */
function chainable(result: { data?: unknown; error?: unknown }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const obj: Record<string, unknown> & { then: (resolve: (v: unknown) => void) => void } = {
    then: (resolve: (v: unknown) => void) => resolve(resolved),
  } as never;
  for (const m of ["select", "insert", "update", "delete", "eq", "is", "in", "limit", "order", "single", "maybeSingle"]) {
    (obj as Record<string, unknown>)[m] = vi.fn(() => obj);
  }
  return obj as Record<string, ReturnType<typeof vi.fn>> & { then: (resolve: (v: unknown) => void) => void };
}

function createSupabaseMock() {
  const fromCalls: string[] = [];
  const perTableQueue = new Map<string, ReturnType<typeof chainable>[]>();
  const rpcCalls: { name: string; args: unknown }[] = [];
  const rpcQueue: ReturnType<typeof chainable>[] = [];

  function queueFrom(table: string, result: { data?: unknown; error?: unknown }) {
    const c = chainable(result);
    if (!perTableQueue.has(table)) perTableQueue.set(table, []);
    perTableQueue.get(table)!.push(c);
    return c;
  }
  function queueRpc(result: { data?: unknown; error?: unknown }) {
    const c = chainable(result);
    rpcQueue.push(c);
    return c;
  }

  const supabase = {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      const q = perTableQueue.get(table);
      if (!q || !q.length) throw new Error(`post.test.ts: no mocked response queued for table "${table}"`);
      return q.shift()!;
    }),
    rpc: vi.fn((name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      if (!rpcQueue.length) throw new Error(`post.test.ts: no mocked response queued for rpc "${name}"`);
      return rpcQueue.shift()!;
    }),
  };
  return { supabase: supabase as unknown as SupabaseClient, queueFrom, queueRpc, fromCalls, rpcCalls };
}

function makeResolved(overrides: Partial<ResolvedEntry> = {}): ResolvedEntry {
  return {
    entry: {
      id: "entry-1",
      entry_type: "doctoring",
      client_id: "client-1",
      raw: {},
      status: "pending",
      review_notes: null,
      submitted_at: null,
      submitted_by: null,
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
    },
    raw: {},
    kind: "doctoring",
    edited: false,
    lot: { id: "lot-1", lot_number: "31-26", closed_at: null, is_test: false },
    ranch: null,
    pasture: { id: "pasture-1", name: "North 40", ranch_id: "ranch-1", is_active: true },
    toRanch: null,
    toPasture: null,
    split: null,
    head: null,
    action: { id: "action-1", name: "First Pull EX", is_dead: false, once_per_animal: true, is_active: true },
    tag: "123",
    meds: [],
    isDead: false,
    notHauled: false,
    issues: [],
    warnings: [],
    ready: true,
    ...overrides,
  };
}

describe("postDoctoringEntry", () => {
  it("inserts the doctoring_events row with the expected payload shape, no meds", async () => {
    const { supabase, queueFrom } = createSupabaseMock();
    const evt = queueFrom("doctoring_events", { data: { id: "evt-1" } });

    const ref = await postDoctoringEntry(supabase, "office", "user-1", makeResolved());

    expect(ref).toEqual({ kind: "doctoring_event", id: "evt-1" });
    expect(evt.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        lot_id: "lot-1",
        tag_number: "123",
        field_action_id: "action-1",
        pasture_id: "pasture-1",
        recorded_by_user_id: "user-1",
        legacy_source: "field_app",
        legacy_id: "client-1",
      })
    );
  });

  it("rolls the parent event back if the meds insert fails, and never draws inventory", async () => {
    const { supabase, queueFrom, fromCalls } = createSupabaseMock();
    queueFrom("doctoring_events", { data: { id: "evt-1" } }); // insert succeeds
    const medsInsert = queueFrom("doctoring_event_meds", { error: { message: "constraint violated" } });
    const compensatingDelete = queueFrom("doctoring_events", { data: null }); // the rollback delete

    const entry = makeResolved({
      meds: [{ position: 1, name: "Draxxin", med: { id: "med-1", name: "Draxxin", is_active: true, cost_per_unit: 2.5, cost_per_head: null, round_up_to: null, bottle_size_unit: "mL", withdrawal_days: 18 }, dose: 5, unpriced: false, withdrawalDays: 18, clearDate: null }],
    });

    await expect(postDoctoringEntry(supabase, "office", "user-1", entry)).rejects.toThrow(/constraint violated/);
    expect(medsInsert.insert).toHaveBeenCalled();
    expect(compensatingDelete.delete).toHaveBeenCalled();
    expect(compensatingDelete.eq).toHaveBeenCalledWith("id", "evt-1");
    // med_consume (the FIFO draw) must never be called once the batch already failed.
    expect(fromCalls).not.toContain("med_stock_locations");
  });
});

describe("postDeathEntry", () => {
  it("calls record_death_with_pasture with the verified argument names", async () => {
    const { supabase, queueRpc, rpcCalls } = createSupabaseMock();
    queueRpc({ data: "event-1" });

    const entry = makeResolved({ kind: "dead", isDead: true, raw: { drugOff: "yes" } });
    const ref = await postDeathEntry(supabase, "user-1", entry);

    expect(ref).toEqual({ kind: "lot_event", id: "event-1" });
    expect(rpcCalls[0].name).toBe("record_death_with_pasture");
    expect(rpcCalls[0].args).toEqual(
      expect.objectContaining({
        p_lot_id: "lot-1",
        p_pasture_id: "pasture-1",
        p_head_count: 1,
        p_tag_number: "123",
        p_cause: null,
        p_created_by: "user-1",
      })
    );
  });
});

describe("postMoveEntry", () => {
  it("calls record_move_with_pasture once for a single-lot move", async () => {
    const { supabase, queueRpc, rpcCalls } = createSupabaseMock();
    queueRpc({ data: "move-1" });

    const entry = makeResolved({ kind: "move", toPasture: { id: "pasture-2", name: "South 40", ranch_id: "ranch-1", is_active: true }, head: 10 });
    const refs = await postMoveEntry(supabase, "user-1", entry);

    expect(refs).toEqual([{ kind: "lot_movement", id: "move-1" }]);
    expect(rpcCalls[0].name).toBe("record_move_with_pasture");
    expect(rpcCalls[0].args).toEqual(
      expect.objectContaining({ p_lot_id: "lot-1", p_from_pasture_id: "pasture-1", p_to_pasture_id: "pasture-2", p_head_count: 10, p_recorded_by: "user-1" })
    );
  });

  it("calls record_move_with_pasture once per leg for a split move, and surfaces partial refs on failure", async () => {
    const { supabase, queueRpc, rpcCalls } = createSupabaseMock();
    queueRpc({ data: "move-1" }); // first leg succeeds
    queueRpc({ error: { message: "destination full" } }); // second leg fails

    const lotB = { id: "lot-2", lot_number: "36-27", closed_at: null, is_test: false };
    const entry = makeResolved({
      kind: "move",
      toPasture: { id: "pasture-2", name: "South 40", ranch_id: "ranch-1", is_active: true },
      split: [
        { lot: { id: "lot-1", lot_number: "31-26", closed_at: null, is_test: false }, name: "31-26", head: 5 },
        { lot: lotB, name: "36-27", head: 5 },
      ],
    });

    await expect(postMoveEntry(supabase, "user-1", entry)).rejects.toMatchObject({
      partial: [{ kind: "lot_movement", id: "move-1" }],
    });
    expect(rpcCalls).toHaveLength(2);
  });
});

describe("rollbackPosted", () => {
  it("reverses posted refs in reverse order, by kind", async () => {
    const { supabase, queueFrom, queueRpc, fromCalls, rpcCalls } = createSupabaseMock();
    // Reversal order is [move, dead, doctoring] -- the reverse of posting order
    // [doctoring, dead, move] (doctoring/count/weight first, then head-math sorted by date).
    const deleteMove = queueRpc({ data: true }); // delete_move_event
    const deleteDeath = queueRpc({ data: true }); // delete_death_event
    queueFrom("med_txns", { data: [] }); // reverseDoctoringUsage's lookup (no txns -> no-op)
    const medsDelete = queueFrom("doctoring_event_meds", { data: null });
    const eventDelete = queueFrom("doctoring_events", { data: null });

    const failures = await rollbackPosted(supabase, [
      { kind: "doctoring_event", id: "evt-1" },
      { kind: "lot_event", id: "death-1" },
      { kind: "lot_movement", id: "move-1" },
    ]);

    expect(failures).toHaveLength(0);
    expect(rpcCalls.map((c) => c.name)).toEqual(["delete_move_event", "delete_death_event"]);
    expect(rpcCalls[0].args).toEqual({ p_movement_id: "move-1" });
    expect(rpcCalls[1].args).toEqual({ p_event_id: "death-1" });
    expect(medsDelete.delete).toHaveBeenCalled();
    expect(eventDelete.delete).toHaveBeenCalled();
    void deleteMove;
    void deleteDeath;
  });

  it("collects a failure message instead of throwing when one reversal fails", async () => {
    const { supabase, queueRpc } = createSupabaseMock();
    queueRpc({ error: { message: "no open assignment at the destination" } });

    const failures = await rollbackPosted(supabase, [{ kind: "lot_movement", id: "move-1" }]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("move-1");
    expect(failures[0]).toContain("no open assignment");
  });
});

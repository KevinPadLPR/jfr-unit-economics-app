import { createClient } from "@/lib/supabase/server";

export interface LookupLot {
  id: string;
  lot_number: string;
  closed_at: string | null;
  is_test: boolean;
}
export interface LookupRanch {
  id: string;
  name: string;
  is_active: boolean | null;
}
export interface LookupPasture {
  id: string;
  name: string;
  ranch_id: string;
  is_active: boolean | null;
}
export interface LookupFieldAction {
  id: string;
  name: string;
  is_dead: boolean | null;
  once_per_animal: boolean | null;
  is_active: boolean | null;
}
export interface LookupMedication {
  id: string;
  name: string;
  is_active: boolean | null;
  cost_per_unit: number | null;
  cost_per_head: number | null;
  round_up_to: number | null;
  bottle_size_unit: string | null;
  withdrawal_days: number | null;
}
export interface LookupAssignment {
  lot_id: string;
  pasture_id: string;
  head_count: number | null;
  moved_out: string | null;
}

export interface ApprovalLookups {
  lotsByName: Map<string, LookupLot>;
  ranchesByName: Map<string, LookupRanch>;
  pastures: LookupPasture[];
  actionsByName: Map<string, LookupFieldAction>;
  medsByName: Map<string, LookupMedication>;
  medsById: Map<string, LookupMedication>;
  lotsById: Map<string, LookupLot>;
  actionsById: Map<string, LookupFieldAction>;
  pasturesById: Map<string, LookupPasture>;
  ranchesById: Map<string, LookupRanch>;
  assignments: LookupAssignment[];
}

function byName<T>(rows: T[], key: keyof T): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) m.set(String(r[key]).trim().toLowerCase(), r);
  return m;
}
function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) m.set(r.id, r);
  return m;
}

/**
 * Ported from loadApprovalLookups() (public/client-app/index.html:10560-10603) -- same five
 * reference tables, same shape, translated to Map lookups instead of plain objects (TypeScript
 * doesn't get the same free-form object-as-hashmap ergonomics JS does here, but the semantics
 * are identical).
 */
export async function loadApprovalLookups(): Promise<ApprovalLookups> {
  const supabase = await createClient();
  const [lotsRes, ranchRes, pastRes, actRes, medRes, assignRes] = await Promise.all([
    supabase.from("lots").select("id, lot_number, closed_at, is_test").is("closed_at", null),
    supabase.from("ranches").select("id, name, is_active"),
    supabase.from("pastures").select("id, name, ranch_id, is_active"),
    supabase.from("field_actions").select("id, name, is_dead, once_per_animal, is_active"),
    supabase
      .from("medications")
      .select("id, name, is_active, cost_per_unit, cost_per_head, round_up_to, bottle_size_unit, withdrawal_days"),
    // Which lots currently sit in which pasture -- used to infer a move's lot when the
    // from-pasture holds exactly one.
    supabase.from("lot_pasture_assignments").select("lot_id, pasture_id, head_count, moved_out").is("moved_out", null),
  ]);
  const firstErr = [lotsRes, ranchRes, pastRes, actRes, medRes, assignRes].find((r) => r.error);
  if (firstErr?.error) throw firstErr.error;

  const lots = ((lotsRes.data ?? []) as LookupLot[]).filter((l) => !l.is_test);
  const ranches = (ranchRes.data ?? []) as LookupRanch[];
  const pastures = (pastRes.data ?? []) as LookupPasture[];
  const actions = (actRes.data ?? []) as LookupFieldAction[];
  const meds = (medRes.data ?? []) as LookupMedication[];

  return {
    lotsByName: byName(lots, "lot_number"),
    ranchesByName: byName(ranches, "name"),
    pastures,
    actionsByName: byName(actions, "name"),
    medsByName: byName(meds, "name"),
    medsById: byId(meds),
    lotsById: byId(lots),
    actionsById: byId(actions),
    pasturesById: byId(pastures),
    ranchesById: byId(ranches),
    assignments: (assignRes.data ?? []) as LookupAssignment[],
  };
}

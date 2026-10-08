import { createClient } from "@/lib/supabase/server";

export interface DoctoringMed {
  position: number | null;
  dose_cc: number | null;
  medication_name: string | null;
}
export interface DoctoringEvent {
  id: string;
  event_datetime: string | null;
  tag_number: string | null;
  no_tag: boolean | null;
  drug_off: boolean | null;
  notes: string | null;
  action_name: string | null;
  is_dead: boolean | null;
  pasture_name: string | null;
  ranch_name: string | null;
  meds: DoctoringMed[];
}

export interface DeathEvent {
  id: string;
  event_date: string | null;
  head_count: number | null;
  tag_number: string | null;
  cause: string | null;
  notes: string | null;
  pasture_name: string | null;
  ranch_name: string | null;
}

export interface HeadAdjustment {
  id: string;
  event_date: string | null;
  head_count: number | null;
  tag_number: string | null;
  cause: string | null;
  notes: string | null;
  pasture_name: string | null;
  ranch_name: string | null;
}

interface RawPasture {
  name: string | null;
  ranches: { name: string | null } | null;
}

interface RawDoctoringEvent {
  id: string;
  event_datetime: string | null;
  tag_number: string | null;
  no_tag: boolean | null;
  drug_off: boolean | null;
  notes: string | null;
  field_actions: { name: string | null; is_dead: boolean | null } | null;
  pastures: RawPasture | null;
  doctoring_event_meds: { position: number | null; dose_cc: number | null; medications: { name: string | null } | null }[] | null;
}
interface RawLotEvent {
  id: string;
  event_date: string | null;
  head_count: number | null;
  tag_number: string | null;
  cause: string | null;
  notes: string | null;
  pastures: RawPasture | null;
}

/** Ported from loadDoctoring() (public/client-app/index.html:27871-27880). */
export async function getDoctoringEvents(lotId: string): Promise<DoctoringEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctoring_events")
    .select(
      "id, event_datetime, tag_number, no_tag, drug_off, notes, " +
        "field_actions(name, is_dead), pastures(name, ranches(name)), " +
        "doctoring_event_meds(position, dose_cc, medications(name))"
    )
    .eq("lot_id", lotId)
    .order("event_datetime", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as RawDoctoringEvent[]).map((e) => ({
    id: e.id,
    event_datetime: e.event_datetime,
    tag_number: e.tag_number,
    no_tag: e.no_tag,
    drug_off: e.drug_off,
    notes: e.notes,
    action_name: e.field_actions?.name ?? null,
    is_dead: e.field_actions?.is_dead ?? null,
    pasture_name: e.pastures?.name ?? null,
    ranch_name: e.pastures?.ranches?.name ?? null,
    meds: (e.doctoring_event_meds ?? []).map((m) => ({
      position: m.position,
      dose_cc: m.dose_cc,
      medication_name: m.medications?.name ?? null,
    })),
  }));
}

/** Ported from loadDeathLog() (public/client-app/index.html:25978-25984) -- narrower than
 * Audit Log's event_type filter: deaths only, not head adjustments. */
export async function getDeathLog(lotId: string): Promise<DeathEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lot_events")
    .select("id, event_date, head_count, tag_number, cause, notes, pastures(name, ranches(name))")
    .eq("lot_id", lotId)
    .eq("event_type", "death")
    .order("event_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RawLotEvent[]).map((e) => ({
    id: e.id,
    event_date: e.event_date,
    head_count: e.head_count != null ? Math.abs(e.head_count) : null,
    tag_number: e.tag_number,
    cause: e.cause,
    notes: e.notes,
    pasture_name: e.pastures?.name ?? null,
    ranch_name: e.pastures?.ranches?.name ?? null,
  }));
}

/** Ported from loadHeadAdjustments() (public/client-app/index.html:26142-26150) -- missing
 * head written off and strays returned, deliberately NOT deaths (see the vanilla app's own
 * comment at index.html:1341-1348: filing these as deaths breaks the mortality rate). */
export async function getHeadAdjustments(lotId: string): Promise<HeadAdjustment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lot_events")
    .select("id, event_date, head_count, tag_number, cause, notes, pastures(name, ranches(name))")
    .eq("lot_id", lotId)
    .eq("event_type", "adjustment")
    .order("event_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RawLotEvent[]).map((e) => ({
    id: e.id,
    event_date: e.event_date,
    head_count: e.head_count,
    tag_number: e.tag_number,
    cause: e.cause,
    notes: e.notes,
    pasture_name: e.pastures?.name ?? null,
    ranch_name: e.pastures?.ranches?.name ?? null,
  }));
}

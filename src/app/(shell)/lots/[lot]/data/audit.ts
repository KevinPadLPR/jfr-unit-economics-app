import { createClient } from "@/lib/supabase/server";

export type AuditEventKind = "receipt" | "move" | "death" | "adjustment" | "sale";

export interface AuditEvent {
  kind: AuditEventKind;
  date: string | null;
  source_name: string | null;
  dest_name: string | null;
  head: number | null;
  label: string;
  notes: string | null;
}

interface RawReceipt {
  id: string;
  receipt_date: string | null;
  head_count: number | null;
  tag_start: number | null;
  tag_end: number | null;
  notes: string | null;
  load_out_destinations: { head_count: number | null; pastures: { id: string; name: string; ranches: { name: string | null } | null } | null }[] | null;
}
interface RawMove {
  from_pasture_id: string | null;
  to_pasture_id: string | null;
  move_date: string | null;
  head_count: number | null;
  notes: string | null;
}
interface RawLotEvent {
  event_date: string | null;
  event_type: string;
  head_count: number | null;
  tag_number: string | null;
  cause: string | null;
  notes: string | null;
  pasture_id: string | null;
}
interface RawSale {
  id: string;
  sale_date: string | null;
  head_count: number | null;
  buyer: string | null;
  notes: string | null;
}
interface RawSaleSource {
  sale_id: string;
  pasture_id: string | null;
  head_count: number | null;
}

const KIND_ORDER: Record<AuditEventKind, number> = { receipt: 1, move: 2, death: 3, adjustment: 4, sale: 5 };

/**
 * Pure merge/sort step of loadAuditLog() (public/client-app/index.html:25679-25814), split out
 * from its data fetch so it's independently testable: flattens 5 differently-shaped sources into
 * one chronological (newest-first) timeline, with receipts/deaths/adjustments/sales tie-broken
 * in the same fixed order the vanilla app uses when two events share a date.
 */
export function mergeAuditEvents(
  receipts: RawReceipt[],
  moves: RawMove[],
  lotEvents: RawLotEvent[],
  sales: RawSale[],
  saleSources: RawSaleSource[],
  pastureNames: Map<string, string>
): AuditEvent[] {
  const events: AuditEvent[] = [];

  receipts.forEach((rcpt) => {
    const tagRange = rcpt.tag_start && rcpt.tag_end ? ` (tags ${rcpt.tag_start}-${rcpt.tag_end})` : "";
    const dests = rcpt.load_out_destinations ?? [];
    if (dests.length === 0) {
      events.push({
        kind: "receipt",
        date: rcpt.receipt_date,
        source_name: null,
        dest_name: "(no load-out destination)",
        head: rcpt.head_count,
        label: `Receipt${tagRange}`,
        notes: rcpt.notes,
      });
    } else {
      dests.forEach((d) => {
        const pname = d.pastures ? `${d.pastures.ranches?.name ?? "?"} / ${d.pastures.name}` : "?";
        events.push({
          kind: "receipt",
          date: rcpt.receipt_date,
          source_name: null,
          dest_name: pname,
          head: d.head_count,
          label: `Receipt${tagRange}`,
          notes: rcpt.notes,
        });
      });
    }
  });

  moves.forEach((m) => {
    events.push({
      kind: "move",
      date: m.move_date,
      source_name: m.from_pasture_id ? pastureNames.get(m.from_pasture_id) ?? "?" : "(unassigned)",
      dest_name: m.to_pasture_id ? pastureNames.get(m.to_pasture_id) ?? "?" : "?",
      head: m.head_count,
      label: "Move",
      notes: m.notes,
    });
  });

  lotEvents
    .filter((d) => d.event_type === "death")
    .forEach((d) => {
      const tag = d.tag_number ? ` tag ${d.tag_number}` : "";
      const cause = d.cause ? ` (${d.cause})` : "";
      events.push({
        kind: "death",
        date: d.event_date,
        source_name: d.pasture_id ? pastureNames.get(d.pasture_id) ?? "?" : "(unattributed)",
        dest_name: null,
        head: d.head_count != null ? Math.abs(d.head_count) : null,
        label: `Death${tag}${cause}`,
        notes: d.notes,
      });
    });

  lotEvents
    .filter((d) => d.event_type === "adjustment")
    .forEach((d) => {
      const delta = Number(d.head_count) || 0;
      const pname = d.pasture_id ? pastureNames.get(d.pasture_id) ?? "?" : "(unattributed)";
      const tag = d.tag_number ? ` tag ${d.tag_number}` : "";
      events.push({
        kind: "adjustment",
        date: d.event_date,
        source_name: delta < 0 ? pname : null,
        dest_name: delta > 0 ? pname : null,
        head: Math.abs(delta),
        label: `${d.cause || "Adjustment"}${tag}`,
        notes: d.notes,
      });
    });

  sales.forEach((sale) => {
    const sources = saleSources.filter((s) => s.sale_id === sale.id);
    const label = `Sale → ${sale.buyer || "(no buyer)"}`;
    if (sources.length === 0) {
      events.push({ kind: "sale", date: sale.sale_date, source_name: "(no source recorded)", dest_name: null, head: sale.head_count, label, notes: sale.notes });
    } else {
      sources.forEach((s) => {
        events.push({
          kind: "sale",
          date: sale.sale_date,
          source_name: s.pasture_id ? pastureNames.get(s.pasture_id) ?? "?" : "(unattributed)",
          dest_name: null,
          head: s.head_count,
          label,
          notes: sale.notes,
        });
      });
    }
  });

  events.sort((a, b) => {
    if ((a.date ?? "") < (b.date ?? "")) return 1;
    if ((a.date ?? "") > (b.date ?? "")) return -1;
    return (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
  });

  return events;
}

/** Ported from loadAuditLog() (public/client-app/index.html:25612-25818). Purely read-only --
 * confirmed upstream (Phase 2 research) as the one section of the lot detail view with no write
 * controls of its own in the vanilla app. */
export async function getAuditLog(lotId: string): Promise<AuditEvent[]> {
  const supabase = await createClient();
  const [receiptsRes, movesRes, lotEventsRes, salesRes] = await Promise.all([
    supabase
      .from("delivery_receipts")
      .select("id, receipt_date, head_count, tag_start, tag_end, notes, load_out_destinations(head_count, pastures(id, name, ranches(name)))")
      .eq("lot_id", lotId),
    supabase.from("lot_movements").select("from_pasture_id, to_pasture_id, move_date, head_count, notes").eq("lot_id", lotId),
    supabase
      .from("lot_events")
      .select("event_date, event_type, head_count, tag_number, cause, notes, pasture_id")
      .eq("lot_id", lotId)
      .in("event_type", ["death", "adjustment"]),
    supabase.from("sales").select("id, sale_date, head_count, buyer, notes").eq("lot_id", lotId),
  ]);
  if (receiptsRes.error) throw receiptsRes.error;
  if (movesRes.error) throw movesRes.error;
  if (lotEventsRes.error) throw lotEventsRes.error;
  if (salesRes.error) throw salesRes.error;

  const saleIds = (salesRes.data ?? []).map((s) => s.id);
  let saleSources: RawSaleSource[] = [];
  if (saleIds.length > 0) {
    const { data, error } = await supabase.from("sale_sources").select("sale_id, pasture_id, head_count").in("sale_id", saleIds);
    if (error) throw error;
    saleSources = data ?? [];
  }

  const pastureIds = new Set<string>();
  (movesRes.data ?? []).forEach((m) => {
    if (m.from_pasture_id) pastureIds.add(m.from_pasture_id);
    if (m.to_pasture_id) pastureIds.add(m.to_pasture_id);
  });
  (lotEventsRes.data ?? []).forEach((d) => {
    if (d.pasture_id) pastureIds.add(d.pasture_id);
  });
  saleSources.forEach((s) => {
    if (s.pasture_id) pastureIds.add(s.pasture_id);
  });

  const pastureNames = new Map<string, string>();
  if (pastureIds.size > 0) {
    const { data, error } = await supabase.from("pastures").select("id, name, ranches(name)").in("id", [...pastureIds]);
    if (error) throw error;
    (data ?? []).forEach((p) => {
      const ranch = p.ranches as unknown as { name: string | null } | null;
      pastureNames.set(p.id, `${ranch?.name ?? "?"} / ${p.name}`);
    });
  }

  return mergeAuditEvents(
    (receiptsRes.data ?? []) as unknown as RawReceipt[],
    (movesRes.data ?? []) as RawMove[],
    (lotEventsRes.data ?? []) as RawLotEvent[],
    (salesRes.data ?? []) as RawSale[],
    saleSources,
    pastureNames
  );
}

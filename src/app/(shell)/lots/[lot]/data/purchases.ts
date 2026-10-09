import { createClient } from "@/lib/supabase/server";

export interface LoadOutDestination {
  head_count: number | null;
  pasture_name: string | null;
  ranch_name: string | null;
}

export interface DeliveryReceipt {
  id: string;
  receipt_date: string | null;
  head_count: number | null;
  tag_start: number | null;
  tag_end: number | null;
  missing_tags: number | null;
  notes: string | null;
  destinations: LoadOutDestination[];
}

export interface Invoice {
  id: string;
  invoice_date: string | null;
  invoice_number: string | null;
  head_count: number | null;
  total_weight_lb: number | null;
  total_cost: number | null;
  receiving_protocol_id: string | null;
  notes: string | null;
  receipts: DeliveryReceipt[];
}

interface RawDestination {
  head_count: number | null;
  pastures: { name: string | null; ranches: { name: string | null } | null } | null;
}
interface RawReceipt {
  id: string;
  receipt_date: string | null;
  head_count: number | null;
  tag_start: number | null;
  tag_end: number | null;
  missing_tags: number | null;
  notes: string | null;
  load_out_destinations: RawDestination[] | null;
}
interface RawInvoice {
  id: string;
  invoice_date: string | null;
  invoice_number: string | null;
  head_count: number | null;
  total_weight_lb: number | null;
  total_cost: number | null;
  receiving_protocol_id: string | null;
  notes: string | null;
  delivery_receipts: RawReceipt[] | null;
}

/**
 * Ported from the Purchases portion of showLotDetail()'s master query
 * (public/client-app/index.html:7287): invoices -> delivery_receipts -> load_out_destinations
 * -> pastures/ranches, in one nested select.
 */
export async function getPurchases(lotId: string): Promise<Invoice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_date, invoice_number, head_count, total_weight_lb, total_cost, receiving_protocol_id, notes, " +
        "delivery_receipts(id, receipt_date, head_count, tag_start, tag_end, missing_tags, notes, " +
        "load_out_destinations(head_count, pastures(name, ranches(name))))"
    )
    .eq("lot_id", lotId)
    .order("invoice_date", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as RawInvoice[]).map((inv) => ({
    id: inv.id,
    invoice_date: inv.invoice_date,
    invoice_number: inv.invoice_number,
    head_count: inv.head_count,
    total_weight_lb: inv.total_weight_lb,
    total_cost: inv.total_cost,
    receiving_protocol_id: inv.receiving_protocol_id,
    notes: inv.notes,
    receipts: (inv.delivery_receipts ?? []).map((r) => ({
      id: r.id,
      receipt_date: r.receipt_date,
      head_count: r.head_count,
      tag_start: r.tag_start,
      tag_end: r.tag_end,
      missing_tags: r.missing_tags,
      notes: r.notes,
      destinations: (r.load_out_destinations ?? []).map((d) => ({
        head_count: d.head_count,
        pasture_name: d.pastures?.name ?? null,
        ranch_name: d.pastures?.ranches?.name ?? null,
      })),
    })),
  }));
}

export interface UnlinkedReceipt {
  id: string;
  receipt_date: string | null;
  head_count: number | null;
  tag_start: number | null;
  tag_end: number | null;
  missing_tags: number[] | null;
  receiving_protocol_id: string | null;
  invoice_id: string | null;
  notes: string | null;
  protocol_name: string | null;
  destinations: LoadOutDestination[];
}

interface RawUnlinkedReceipt {
  id: string;
  receipt_date: string | null;
  head_count: number | null;
  tag_start: number | null;
  tag_end: number | null;
  missing_tags: number[] | null;
  receiving_protocol_id: string | null;
  invoice_id: string | null;
  notes: string | null;
  protocols: { name: string | null; version_label: string | null } | null;
  load_out_destinations: RawDestination[] | null;
}

/**
 * Ported from loadReceipts() (index.html:27167-27173): load-outs not (yet) linked to an
 * invoice -- linked ones nest under their invoice in `getPurchases` instead. A new "+ Load Out"
 * always lands here first; linking it to an invoice later (not built this phase) is what moves
 * it into an invoice's own card.
 */
export async function getUnlinkedReceipts(lotId: string): Promise<UnlinkedReceipt[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_receipts")
    .select(
      "id, receipt_date, head_count, tag_start, tag_end, missing_tags, receiving_protocol_id, invoice_id, notes, " +
        "protocols(name, version_label), load_out_destinations(head_count, pastures(name, ranches(name)))"
    )
    .eq("lot_id", lotId)
    .is("invoice_id", null)
    .order("receipt_date", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as RawUnlinkedReceipt[]).map((r) => ({
    id: r.id,
    receipt_date: r.receipt_date,
    head_count: r.head_count,
    tag_start: r.tag_start,
    tag_end: r.tag_end,
    missing_tags: r.missing_tags,
    receiving_protocol_id: r.receiving_protocol_id,
    invoice_id: r.invoice_id,
    notes: r.notes,
    protocol_name: r.protocols ? `${r.protocols.name ?? ""}${r.protocols.version_label ? " " + r.protocols.version_label : ""}`.trim() || null : null,
    destinations: (r.load_out_destinations ?? []).map((d) => ({
      head_count: d.head_count,
      pasture_name: d.pastures?.name ?? null,
      ranch_name: d.pastures?.ranches?.name ?? null,
    })),
  }));
}

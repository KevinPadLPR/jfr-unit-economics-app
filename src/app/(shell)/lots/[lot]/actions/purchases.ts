"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { canWriteLotEntries } from "@/lib/roles";
import { checkInvoiceHeadCount } from "./purchases-validation";

export interface LotActionResult {
  ok: boolean;
  message: string;
}

export interface InvoiceInput {
  invoiceDate: string;
  invoiceNumber: string | null;
  headCount: number;
  totalWeightLb: number | null;
  totalCost: number | null;
  receivingProtocolId: string | null;
  notes: string | null;
}

function path(lotNumber: string) {
  return `/lots/${encodeURIComponent(lotNumber)}`;
}

/**
 * Ported from the invoice save handler (index.html:10250-10363), minus the reconcile checklist
 * and attachments sections (out of scope this phase -- see the Phase 6 plan). The head-count
 * guard still applies on edit, checked against whatever receipts are *already* linked (nothing
 * here changes that linkage, so this is always the "no reconcile touches" branch).
 */
export async function saveInvoice(mode: "new" | "edit", invoiceId: string | null, lotId: string, lotNumber: string, input: InvoiceInput): Promise<LotActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot edit invoices." };
  if (!Number.isInteger(input.headCount) || input.headCount < 1) return { ok: false, message: "Head count is required." };

  const supabase = await createClient();

  if (mode === "edit" && invoiceId) {
    const { data: linked, error: linkedError } = await supabase.from("delivery_receipts").select("head_count").eq("invoice_id", invoiceId);
    if (linkedError) return { ok: false, message: linkedError.message };
    const guardError = checkInvoiceHeadCount(
      input.headCount,
      (linked ?? []).map((r) => r.head_count)
    );
    if (guardError) return { ok: false, message: guardError };
  }

  const payload = {
    lot_id: lotId,
    invoice_date: input.invoiceDate,
    invoice_number: input.invoiceNumber?.trim() || null,
    head_count: input.headCount,
    total_weight_lb: input.totalWeightLb,
    total_cost: input.totalCost,
    receiving_protocol_id: input.receivingProtocolId || null,
    notes: input.notes?.trim() || null,
  };

  const query =
    mode === "edit" && invoiceId
      ? supabase.from("invoices").update(payload).eq("id", invoiceId)
      : supabase.from("invoices").insert({ ...payload, created_by: session.user.id });
  const { error } = await query;
  if (error) return { ok: false, message: error.message };

  revalidatePath(path(lotNumber));
  return { ok: true, message: mode === "edit" ? "Invoice updated." : "Invoice saved." };
}

/** Ported from the invoice delete handler (index.html:10365-10377). Plain delete, no RPC, no
 * cascade handling -- matches vanilla exactly. */
export async function deleteInvoice(lotNumber: string, invoiceId: string): Promise<LotActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot delete an invoice." };

  const supabase = await createClient();
  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(path(lotNumber));
  return { ok: true, message: "Invoice deleted." };
}

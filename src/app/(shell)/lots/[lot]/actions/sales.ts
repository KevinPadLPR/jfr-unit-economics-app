"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { canWriteLotEntries } from "@/lib/roles";
import { parseMissingTags, computeTagSummary } from "./load-out-validation";
import { validateSaleSources, checkPriceSanity, checkPayWeightTie } from "./sale-validation";
import { getWithdrawalHolds, type WithdrawalHold } from "../data/reference";

export interface SaleInput {
  saleDate: string;
  headCount: number;
  grossWeightLb: number | null;
  netWeightLb: number | null;
  pricePerCwt: number | null;
  pricePerHead: number | null;
  totalPrice: number | null;
  buyer: string | null;
  saleInvoiceNumber: string | null;
  tagStart: number | null;
  tagEnd: number | null;
  missingTagsRaw: string;
  notes: string | null;
  sourceRows: { pastureId: string; headCount: number | null }[];
}

export interface SaleConfirmations {
  noPriceConfirmed?: boolean;
  priceOverrideReason?: string;
  payWeightChoice?: "book_gross" | "proceed_without_net";
  withdrawalConfirmed?: boolean;
}

export interface SaleActionResult {
  ok: boolean;
  message: string;
  needsNoPriceConfirm?: boolean;
  needsPriceOverride?: boolean;
  needsPayWeightChoice?: { ties: boolean };
  needsWithdrawalConfirm?: boolean;
  withdrawalHolds?: WithdrawalHold[];
  lotNowEmpty?: boolean;
}

function path(lotNumber: string) {
  return `/lots/${encodeURIComponent(lotNumber)}`;
}

/**
 * Ported from the sale save handler (index.html:30225-30476). Confirmations arrive one at a
 * time, same pattern as Phase 7's tag-conflict flow: each guard below returns a `needsX` result
 * instead of a native dialog the first time it's unresolved; the UI shows an inline dialog, gets
 * the answer, and re-calls with that field of `confirmations` set -- this function re-runs from
 * the top and moves past whatever's now answered.
 */
export async function saveSale(
  mode: "new" | "edit",
  saleId: string | null,
  lotId: string,
  lotNumber: string,
  input: SaleInput,
  confirmations: SaleConfirmations = {}
): Promise<SaleActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot record a sale." };
  if (!(input.headCount > 0)) return { ok: false, message: "Head count is required." };

  const supabase = await createClient();
  const isNew = mode === "new";

  // Sources: locked on edit (head and source pastures never move cattle again once saved,
  // index.html:29987-29998).
  let sources: { pastureId: string; headCount: number }[] = [];
  if (isNew) {
    const sourceResult = validateSaleSources(input.headCount, input.sourceRows);
    if ("error" in sourceResult) return { ok: false, message: sourceResult.error };
    sources = sourceResult.sources;

    const { data: liveAssignments, error: liveError } = await supabase
      .from("lot_pasture_assignments")
      .select("pasture_id, head_count")
      .eq("lot_id", lotId)
      .is("moved_out", null);
    if (liveError) return { ok: false, message: liveError.message };
    const liveAvail = new Map<string, number>();
    (liveAssignments ?? []).forEach((a) => liveAvail.set(a.pasture_id, (liveAvail.get(a.pasture_id) ?? 0) + (a.head_count ?? 0)));
    for (const s of sources) {
      const avail = liveAvail.get(s.pastureId) ?? 0;
      if (s.headCount > avail) {
        return { ok: false, message: `Cannot sell ${s.headCount} head from a pasture with only ${avail} active head. Pick a different pasture or reduce count.` };
      }
    }
  }

  // Tag range validity -- vanilla checks only that the range itself is coherent, not that its
  // count matches head count (unlike Load Out's stricter rule).
  const missing = parseMissingTags(input.missingTagsRaw);
  if (input.tagStart != null && input.tagEnd != null) {
    const summary = computeTagSummary(input.tagStart, input.tagEnd, missing);
    if (summary.error) return { ok: false, message: summary.error };
  }

  const hasAnyPrice = input.pricePerCwt != null || input.pricePerHead != null || input.totalPrice != null;
  if (!hasAnyPrice && !confirmations.noPriceConfirmed) {
    return { ok: false, needsNoPriceConfirm: true, message: "No price entered. Save sale anyway?" };
  }

  const priceSanityError = checkPriceSanity(input.pricePerCwt);
  if (priceSanityError && !confirmations.priceOverrideReason?.trim()) {
    return { ok: false, needsPriceOverride: true, message: priceSanityError };
  }
  let notes = input.notes;
  if (priceSanityError && confirmations.priceOverrideReason?.trim()) {
    notes = (notes ? `${notes} | ` : "") + `Price override: ${confirmations.priceOverrideReason.trim()}`;
  }

  // Pay-weight guard (index.html:30313-30355): a weight with no pay weight is invisible to
  // realized ADG / cost of gain. Never blocks -- only decides whether gross gets booked as net
  // too, or the sale proceeds weightless and flagged on Anomalies.
  let netWeightLb = input.netWeightLb;
  if (netWeightLb == null && input.grossWeightLb != null && input.grossWeightLb > 0 && !confirmations.payWeightChoice) {
    const ties = checkPayWeightTie(input.grossWeightLb, input.pricePerCwt, input.totalPrice);
    return {
      ok: false,
      needsPayWeightChoice: { ties },
      message: ties
        ? `No pay weight (net) entered, but the money ties on the ${input.grossWeightLb} lb gross -- that figure is the buyer's pay weight.`
        : "No pay weight (net) entered. Realized ADG and cost of gain read the net weight only -- this sale will count as no weight at all.",
    };
  }
  if (confirmations.payWeightChoice === "book_gross") netWeightLb = input.grossWeightLb;

  // Withdrawal holds (index.html:6612-6684) -- purely advisory, new sales only.
  if (isNew && !confirmations.withdrawalConfirmed) {
    const holds = await getWithdrawalHolds(lotId, input.saleDate);
    if (holds.length > 0) {
      return { ok: false, needsWithdrawalConfirm: true, withdrawalHolds: holds, message: `${holds.length} tag(s) on this lot will still be in withdrawal on the ship date.` };
    }
  }

  const payload = {
    lot_id: lotId,
    sale_date: input.saleDate,
    head_count: input.headCount,
    gross_weight_lb: input.grossWeightLb,
    net_weight_lb: netWeightLb,
    price_per_cwt: input.pricePerCwt,
    price_per_head: input.pricePerHead,
    total_price: input.totalPrice,
    buyer: input.buyer?.trim() || null,
    sale_invoice_number: input.saleInvoiceNumber?.trim() || null,
    tag_start: input.tagStart,
    tag_end: input.tagEnd,
    missing_tags: missing.length > 0 ? missing : null,
    notes: notes?.trim() || null,
  };

  let newSaleId: string;
  if (isNew) {
    const { data, error } = await supabase.from("sales").insert({ ...payload, created_by: session.user.id }).select("id").single();
    if (error) return { ok: false, message: error.message };
    newSaleId = data.id;
  } else if (saleId) {
    const { error } = await supabase.from("sales").update(payload).eq("id", saleId);
    if (error) return { ok: false, message: error.message };
    newSaleId = saleId;
  } else {
    return { ok: false, message: "Missing sale id for edit." };
  }

  let lotNowEmpty = false;
  if (isNew) {
    const { error: srcError } = await supabase.from("sale_sources").insert(sources.map((s) => ({ sale_id: newSaleId, pasture_id: s.pastureId, head_count: s.headCount })));
    if (srcError) return { ok: false, message: srcError.message };

    // Ported verbatim from index.html:30407-30439: decrement each source's open assignment,
    // closing it via moved_out if it reaches zero.
    for (const s of sources) {
      const { data: existing, error: existingError } = await supabase
        .from("lot_pasture_assignments")
        .select("id, head_count")
        .eq("lot_id", lotId)
        .eq("pasture_id", s.pastureId)
        .is("moved_out", null)
        .maybeSingle();
      if (existingError) return { ok: false, message: existingError.message };
      if (!existing) continue; // shouldn't happen given the availability check above
      const newHead = (existing.head_count ?? 0) - s.headCount;
      if (newHead < 0) return { ok: false, message: "Internal: pasture assignment would go negative on sale. Aborting." };
      const { error: decError } =
        newHead === 0
          ? await supabase.from("lot_pasture_assignments").update({ moved_out: input.saleDate }).eq("id", existing.id)
          : await supabase.from("lot_pasture_assignments").update({ head_count: newHead }).eq("id", existing.id);
      if (decError) return { ok: false, message: decError.message };
    }

    const { data: latest } = await supabase.from("lot_status").select("head_current").eq("lot_id", lotId).maybeSingle();
    lotNowEmpty = latest?.head_current === 0;
  }

  revalidatePath(path(lotNumber));
  return { ok: true, message: isNew ? "Sale saved." : "Sale updated.", lotNowEmpty };
}

/** Ported from the sale delete handler (index.html:30483-30497). Owner-only (2026-10-03). Tag
 * un-retirement is handled by the lot_tags_retire_on_sale trigger, not here. */
export async function deleteSale(lotNumber: string, saleId: string): Promise<SaleActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (session.user.role !== "owner") return { ok: false, message: "Only an owner can delete a sale." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_sale_with_reversal", { p_sale_id: saleId });
  if (error) return { ok: false, message: `Sale NOT deleted, nothing was changed: ${error.message}` };

  revalidatePath(path(lotNumber));
  const s = (data ?? {}) as { head_restored?: number; lot_reopened?: boolean };
  return {
    ok: true,
    message: `Sale deleted -- ${s.head_restored ?? "?"} head back on the pastures${s.lot_reopened ? "; the lot was reopened." : "."}`,
  };
}

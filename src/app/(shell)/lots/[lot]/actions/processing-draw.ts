"use server";

import { createClient } from "@/lib/supabase/server";
import type { ClientRole } from "@/lib/roles";

export interface ProcessingDrawResult {
  drawn: number;
  waiting: number;
  message: string | null;
}

/** Ported from invLedgerReady() (index.html:36794-36807) -- the go-live gate. */
async function ledgerReady(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data, error } = await supabase.from("med_stock_locations").select("id").eq("kind", "ranch").eq("is_active", true).limit(1).maybeSingle();
  return !error && !!data;
}

/**
 * Ported from invRecordProcessingDraw() (index.html:36878-36933), a receipt at a time instead
 * of a batch array (this phase only ever draws for the one receipt just saved). Uses the REAL
 * return shape of `med_processing_draw`/`med_processing_reverse`
 * (docs/sql/2026-10-02_med_processing_draw.sql:126-164) -- `med_processing_reverse` returns
 * only `{receipt_id, lines_reversed}`, with no `lines_locked` field; the vanilla UI's "locked"
 * message reads a field that doesn't exist on that RPC and can never fire against this schema,
 * so it isn't ported.
 *
 * Non-fatal by design: a draw that doesn't happen is reported, never thrown, so a load-out save
 * already committed is never rolled back over an inventory side-effect.
 */
export async function recordProcessingDraw(receiptId: string, role: ClientRole, reverseFirst: boolean): Promise<ProcessingDrawResult | null> {
  const supabase = await createClient();
  if (!(await ledgerReady(supabase))) return null;

  // Same gap as doctoring: med_processing_draw is INVOKER and the med policies go through
  // can_read_books(), which excludes crew.
  if (role !== "owner" && role !== "office") {
    return {
      drawn: 0,
      waiting: 0,
      message:
        "The processing medicine was NOT taken out of inventory -- that needs an office login. Tell the office " +
        "before the next count, or the count will read those doses as shrink.",
    };
  }

  try {
    let reversedLines = 0;
    if (reverseFirst) {
      const { data: rev, error: revError } = await supabase.rpc("med_processing_reverse", { p_receipt_id: receiptId });
      if (revError) throw revError;
      reversedLines = Number(rev?.lines_reversed) || 0;
    }
    const { data, error } = await supabase.rpc("med_processing_draw", { p_receipt_id: receiptId });
    if (error) throw error;
    const drawn = Number(data?.lines_drawn) || 0;
    const waiting = Number(data?.lines_awaiting_weight) || 0;

    void reversedLines; // informational only -- vanilla never surfaces a reverse-only message either
    if (waiting > 0) {
      return {
        drawn,
        waiting,
        message: `${waiting} processing line(s) are waiting on an invoice weight and have not been drawn. They draw by themselves when the invoice is entered.`,
      };
    }
    return { drawn, waiting, message: null };
  } catch (err) {
    const message = (err as { message?: string } | null)?.message ?? String(err);
    return {
      drawn: 0,
      waiting: 0,
      message: `Saved, but the processing medicine could not be taken out of inventory: ${message} -- tell the office before the next count.`,
    };
  }
}

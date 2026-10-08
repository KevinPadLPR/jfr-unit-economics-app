"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { canWriteLotEntries } from "@/lib/roles";
import { validateLotForm, pickDuplicateAssumptions, type LotFormMode, type DuplicateSeed } from "./lot-validation";

export interface LotActionResult {
  ok: boolean;
  message: string;
  lotNumber?: string;
  needsSalesConfirm?: boolean;
  unweighedSales?: UnweighedSale[];
}

export interface UnweighedSale {
  id: string;
  sale_date: string | null;
  head_count: number | null;
  buyer: string | null;
  gross_weight_lb: number | null;
}

export interface LotFormInput {
  lotNumber: string;
  arrivalDate: string;
  source: string | null;
  sexClass: string | null;
  targetAdg: number | null;
  notes: string | null;
  estPurchaseWeightLb: number | null;
  estWeightSource: string | null;
  noPrecon: boolean;
}

function path(lotNumber: string) {
  return `/lots/${encodeURIComponent(lotNumber)}`;
}

/**
 * Ported from the shared lot-modal save handler (index.html:9958-10029). `mode: 'new'` isn't
 * built -- only `edit`/`duplicate` are reachable from this page's kebab menu, so `is_feed_pen`
 * (only ever set on `'new'`) never needs to appear in this payload. `lotId` is null on
 * duplicate (an insert); `seedLotId` is the lot being duplicated, re-read fresh server-side
 * rather than trusting whatever the client last rendered.
 */
export async function saveLotInfo(mode: LotFormMode, lotId: string | null, seedLotId: string, input: LotFormInput): Promise<LotActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot edit lots." };

  const validationError = validateLotForm({ mode, estWeight: input.estPurchaseWeightLb });
  if (validationError) return { ok: false, message: validationError };

  const supabase = await createClient();

  const payload: Record<string, unknown> = {
    lot_number: input.lotNumber.trim(),
    arrival_date: input.arrivalDate,
    source: input.source?.trim() || null,
    sex_class: input.sexClass || null,
    target_adg: input.targetAdg,
    notes: input.notes?.trim() || null,
    est_purchase_weight_lb: input.estPurchaseWeightLb,
    est_weight_source: input.estWeightSource?.trim() || null,
    // Sent unconditionally, matching vanilla exactly -- on an edit this re-stamps the
    // original creator's ID with the editor's. Not this phase's place to "fix" that with an
    // updated_by column the schema doesn't have.
    created_by: session.user.id,
    no_precon: input.noPrecon,
  };
  // Every insert names the mode: lots_cog_mode_check allows per_lb only.
  if (!lotId) payload.cog_mode = "per_lb";

  if (mode === "duplicate") {
    const { data: seed, error: seedError } = await supabase
      .from("lots")
      .select(
        "target_sale_cwt, target_days_on_feed, labor_mode, assumed_cog_per_lb, assumed_nonfeed_cog_per_day, " +
          "assumed_labor_per_day, assumed_labor_per_head, assumed_med_per_head, assumed_processing_per_head, " +
          "assumed_doctoring_per_head, assumed_death_loss_pct, assumed_interest_pct"
      )
      .eq("id", seedLotId)
      .maybeSingle();
    if (seedError) return { ok: false, message: seedError.message };
    if (seed) Object.assign(payload, pickDuplicateAssumptions(seed as unknown as DuplicateSeed));
  }

  const query = lotId ? supabase.from("lots").update(payload).eq("id", lotId) : supabase.from("lots").insert(payload);
  const { data, error } = await query.select("id, lot_number").single();
  if (error) return { ok: false, message: error.message };

  revalidatePath(path(data.lot_number));
  return {
    ok: true,
    message: mode === "duplicate" ? `Lot ${data.lot_number} created. Next: + Invoice or + Load Out.` : "Lot saved.",
    lotNumber: data.lot_number,
  };
}

const NO_TICKET_MARK = "[no scale ticket]";

function saleHasNoTicketMark(notes: string | null): boolean {
  return !!(notes && notes.includes(NO_TICKET_MARK));
}

/**
 * Ported from closeLotGuard() + the close/re-open handler (index.html:10041-10079), as a
 * two-step result instead of nested `confirm()`s: a first call with `confirmUnweighedSales`
 * unset returns `needsSalesConfirm` if any sale on the lot has no pay weight and isn't already
 * marked `[no scale ticket]`; the caller re-calls with it set to true once the user agrees.
 */
export async function closeOrReopenLot(
  lotId: string,
  lotNumber: string,
  closing: boolean,
  confirmUnweighedSales?: boolean
): Promise<LotActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot close or re-open a lot." };

  const supabase = await createClient();

  if (closing) {
    const { data: sales, error } = await supabase
      .from("sales")
      .select("id, sale_date, head_count, buyer, gross_weight_lb, net_weight_lb, notes")
      .eq("lot_id", lotId);
    if (error) return { ok: false, message: `Could not check the sales before closing: ${error.message}` };
    const unweighed = (sales ?? []).filter((s) => !(Number(s.net_weight_lb) > 0) && !saleHasNoTicketMark(s.notes));

    if (unweighed.length && !confirmUnweighedSales) {
      const head = unweighed.reduce((t, s) => t + (Number(s.head_count) || 0), 0);
      return {
        ok: false,
        needsSalesConfirm: true,
        unweighedSales: unweighed.map((s) => ({
          id: s.id,
          sale_date: s.sale_date,
          head_count: s.head_count,
          buyer: s.buyer,
          gross_weight_lb: s.gross_weight_lb,
        })),
        message:
          `Lot ${lotNumber} has ${head} head sold with no pay weight. Their gain is still an estimate at the ` +
          `assumed ADG, and a closed lot would carry that as final. Enter the pay weights first (Sales tab), ` +
          `or mark these sales as having no scale ticket and close now.`,
      };
    }

    if (unweighed.length && confirmUnweighedSales) {
      const today = new Date().toISOString().slice(0, 10);
      for (const s of unweighed) {
        const notes = (s.notes ? s.notes + " " : "") + NO_TICKET_MARK + " " + today;
        const { data, error: uErr } = await supabase.from("sales").update({ notes }).eq("id", s.id).select("id");
        if (uErr) return { ok: false, message: `Could not mark the sale: ${uErr.message}` };
        if (!data || !data.length) return { ok: false, message: "The sale was not marked -- that is office and owner only." };
      }
    }
  }

  const { error } = await supabase
    .from("lots")
    .update({ closed_at: closing ? new Date().toISOString() : null })
    .eq("id", lotId);
  if (error) return { ok: false, message: `Failed: ${error.message}` };

  revalidatePath(path(lotNumber));
  return { ok: true, message: `Lot ${closing ? "closed" : "re-opened"}.` };
}

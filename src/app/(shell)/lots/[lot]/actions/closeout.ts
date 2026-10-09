"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { canWriteLotEntries } from "@/lib/roles";
import { validateCloseoutAssumptions } from "./closeout-validation";

export interface CloseoutActionResult {
  ok: boolean;
  message: string;
}

export interface CloseoutAssumptionsInput {
  salePerLb: number | null;
  adg: number | null;
  shipDate: string | null;
  daysOnFeed: number | null;
  cog: number | null;
  nonFeedCog: number | null;
  labor: number | null;
  laborMode: "per_day" | "per_head";
  procPerHead: number | null;
  docPerHead: number | null;
  /** Whole percentages as typed (6 means 6%), converted to the stored fraction here -- never in
   * closeout-math.ts, which already expects fractions (CloseoutRates.deathPct/intPct). */
  deathPctWhole: number | null;
  intPctWhole: number | null;
}

function path(lotNumber: string) {
  return `/lots/${encodeURIComponent(lotNumber)}`;
}

/**
 * Ported from the Save Assumptions handler (index.html:9832-9866): a straight UPDATE on `lots`,
 * no RPC. `cog_mode` is sent fixed as `'per_lb'`, the only mode left since 2026-09-11 (every
 * stored lot and budget migrated, the CHECK constraint refuses anything else) -- matching
 * closeoutRates()'s own hardcoded `cogMode: 'per_lb'`.
 */
export async function saveCloseoutAssumptions(lotId: string, lotNumber: string, arrivalDate: string | null, input: CloseoutAssumptionsInput): Promise<CloseoutActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Not signed in." };
  if (!canWriteLotEntries(session.user.role)) return { ok: false, message: "Your role cannot edit this lot's assumptions." };

  const validationError = validateCloseoutAssumptions({ shipDate: input.shipDate, arrivalDate });
  if (validationError) return { ok: false, message: validationError };

  const payload = {
    target_sale_cwt: input.salePerLb,
    target_days_on_feed: input.daysOnFeed,
    target_ship_date: input.shipDate,
    target_adg: input.adg,
    cog_mode: "per_lb",
    labor_mode: input.laborMode,
    assumed_cog_per_lb: input.cog,
    assumed_nonfeed_cog_per_day: input.nonFeedCog,
    assumed_labor_per_day: input.laborMode === "per_day" ? input.labor : null,
    assumed_labor_per_head: input.laborMode === "per_head" ? input.labor : null,
    assumed_processing_per_head: input.procPerHead,
    assumed_doctoring_per_head: input.docPerHead,
    assumed_death_loss_pct: input.deathPctWhole != null ? input.deathPctWhole / 100 : null,
    assumed_interest_pct: input.intPctWhole != null ? input.intPctWhole / 100 : null,
  };

  const supabase = await createClient();
  const { data, error } = await supabase.from("lots").update(payload).eq("id", lotId).select();
  if (error) return { ok: false, message: `Save failed: ${error.message}` };
  // A refused UPDATE returns zero rows rather than an error (index.html:9862-9863).
  if (!data || data.length === 0) return { ok: false, message: "Nothing was saved — you may not have permission to change this lot." };

  revalidatePath(path(lotNumber));
  return { ok: true, message: "Assumptions saved." };
}

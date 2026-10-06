import { createClient } from "@/lib/supabase/server";
import { listGlLots } from "@/lib/data/cost-of-gain";
import { getLotAttrsRollup } from "@/lib/data/lot-attrs";
import type { Provenance } from "@/lib/theme/colors";

export interface LatestQuote {
  settle: number;
  quoteDate: string;
  instrument: string;
}

/**
 * "Nearest" here means most recent settle overall, not the contract month
 * that actually matches each lot's target ship date, and it always uses the
 * feeder_cattle strip. A real own-basis table (light calves vs. the 700-800lb
 * CME feeder contract) doesn't exist yet — see Pitfall C3 — so light-calf
 * lots get an explicit caveat badge instead of a quietly wrong mark.
 *
 * `market_quotes` is the client's own NATIVE table (not a ue_ one) -- fed live
 * by a daily cron + edge function, see public/client-app/docs/sql/
 * 2026-09-10_market_quotes_schedule.sql.
 */
export async function getLatestFeederSettle(): Promise<LatestQuote | undefined> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("market_quotes")
    .select("settle, quote_date, instrument")
    .eq("instrument", "feeder_cattle")
    .order("quote_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!row) return undefined;
  return { settle: row.settle, quoteDate: row.quote_date, instrument: row.instrument };
}

export interface MarketPositionRow {
  lot: string;
  status: string | null;
  headOnHand: number | null;
  projectedWeightPerHead: number | null;
  weightProvenance: Provenance;
  markedValue: number | null;
  costBasis: number | null;
  unrealized: number | null;
  lightCalfCaveat: boolean;
}

const LIGHT_CALF_THRESHOLD_LB = 600;

export async function getMarketPosition(): Promise<MarketPositionRow[]> {
  const [settle, lots] = await Promise.all([getLatestFeederSettle(), listGlLots()]);
  const openLots = lots.filter((l) => (l.status ?? "").toLowerCase() === "open" && (l.head_on_hand ?? 0) > 0);

  return Promise.all(
    openLots.map(async (l) => {
      const attrs = await getLotAttrsRollup(l.lot, l.target_adg ?? 0);
      const projectedWeightPerHead = attrs.projectedCurrentWeight ?? l.avg_wt_in;
      const headOnHand = l.head_on_hand ?? 0;

      const markedValue =
        settle && projectedWeightPerHead
          ? (projectedWeightPerHead / 100) * settle.settle * headOnHand
          : null;
      const costBasis = l.cost_in_dollars ?? null;

      return {
        lot: l.lot,
        status: l.status,
        headOnHand: l.head_on_hand,
        projectedWeightPerHead,
        weightProvenance: attrs.hasAppData ? ("modeled" as const) : ("assumed" as const),
        markedValue,
        costBasis,
        unrealized: markedValue !== null && costBasis !== null ? markedValue - costBasis : null,
        lightCalfCaveat: !!projectedWeightPerHead && projectedWeightPerHead < LIGHT_CALF_THRESHOLD_LB,
      };
    })
  );
}

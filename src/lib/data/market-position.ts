import { getDb } from "@/lib/db";
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
 */
export function getLatestFeederSettle(): LatestQuote | undefined {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT settle, quote_date, instrument FROM market_quotes
       WHERE instrument = 'feeder_cattle'
       ORDER BY quote_date DESC LIMIT 1`
    )
    .get() as { settle: number; quote_date: string; instrument: string } | undefined;
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

export function getMarketPosition(): MarketPositionRow[] {
  const settle = getLatestFeederSettle();

  return listGlLots()
    .filter((l) => (l.status ?? "").toLowerCase() === "open" && (l.head_on_hand ?? 0) > 0)
    .map((l) => {
      const attrs = getLotAttrsRollup(l.lot, l.target_adg ?? 0);
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
        weightProvenance: attrs.hasAppData ? "modeled" : "assumed",
        markedValue,
        costBasis,
        unrealized: markedValue !== null && costBasis !== null ? markedValue - costBasis : null,
        lightCalfCaveat: !!projectedWeightPerHead && projectedWeightPerHead < LIGHT_CALF_THRESHOLD_LB,
      };
    });
}

import { createClient } from "@/lib/supabase/server";
import { buildCloseoutRates } from "../closeout-math";
import type {
  CloseoutInputs,
  CloseoutLot,
  CloseoutLotStatus,
  CloseoutRates,
  HeadAdjTotals,
  LotFeed,
  MedCost,
  RealizedAdg,
  SaleRow,
  TransferCosts,
  TransferRow,
  WeightAnchor,
} from "../closeout-math";
import { getLotCloseoutAssumptions, type LotStatusRecord } from "./lot";
import { getLotTransfers } from "./moves";
import { getHeadAdjustments } from "./health";
import { getRanchSettings, getHeadDaysAfterBoundary } from "./ranch-settings";
import { getSales } from "./sales";

interface RawMedCatRow {
  category: string | null;
  total_cost: number | null;
}

/** Ported from the medication cost split (index.html:7379-7421): processing is
 * lot_med_costs_by_category's "processing" row PLUS lot_processing_costs (receipts × receiving
 * protocol) -- two different sources for the same category, summed, not a single table read. */
async function getMedCost(lotId: string): Promise<MedCost> {
  const supabase = await createClient();
  const [medCatRes, procCostRes, coverage] = await Promise.all([
    supabase.from("lot_med_costs_by_category").select("category, total_cost").eq("lot_id", lotId),
    supabase.from("lot_processing_costs").select("total_cost").eq("lot_id", lotId).maybeSingle(),
    getProcessingCoverage(lotId),
  ]);
  if (medCatRes.error) throw medCatRes.error;
  if (procCostRes.error) throw procCostRes.error;

  const medCatRows = (medCatRes.data ?? []) as RawMedCatRow[];
  const catTotal = (cat: string) => {
    const row = medCatRows.find((r) => r.category === cat);
    return row ? Number(row.total_cost) || 0 : 0;
  };
  const procFromReceipts = procCostRes.data ? Number(procCostRes.data.total_cost) || 0 : 0;

  return {
    processing: catTotal("processing") + procFromReceipts,
    treatment: catTotal("treatment"),
    other: catTotal("other"),
    headWithout: coverage?.headWithout ?? null,
  };
}

interface RawReceipt {
  head_count: number | null;
  receiving_protocol_id: string | null;
}
interface RawInvoiceGap {
  head_count: number | null;
  receiving_protocol_id: string | null;
  delivery_receipts: { head_count: number | null }[] | null;
}

/**
 * Ported from procCoverage (index.html:7395-7416): invoiced head with NO receiving protocol on
 * either their load out or their invoice -- the head still carried at the assumed $/head in the
 * Projection column rather than the real receipts-derived cost.
 */
async function getProcessingCoverage(lotId: string): Promise<{ headWithout: number } | null> {
  const supabase = await createClient();
  const [receiptsRes, invoicesRes] = await Promise.all([
    supabase.from("delivery_receipts").select("head_count, receiving_protocol_id").eq("lot_id", lotId),
    supabase.from("invoices").select("head_count, receiving_protocol_id, delivery_receipts(head_count)").eq("lot_id", lotId),
  ]);
  if (receiptsRes.error || invoicesRes.error) return null;

  const procLoads = (receiptsRes.data ?? []) as RawReceipt[];
  const headWithoutLoads = procLoads.filter((r) => !r.receiving_protocol_id).reduce((t, r) => t + (Number(r.head_count) || 0), 0);

  const invGaps = ((invoicesRes.data ?? []) as unknown as RawInvoiceGap[])
    .map((i) => ({
      gap: (Number(i.head_count) || 0) - (i.delivery_receipts ?? []).reduce((t, r) => t + (Number(r.head_count) || 0), 0),
      proto: !!i.receiving_protocol_id,
    }))
    .filter((g) => g.gap > 0);
  const gapWithout = invGaps.filter((g) => !g.proto).reduce((t, g) => t + g.gap, 0);

  return { headWithout: headWithoutLoads + gapWithout };
}

async function getLotFeed(lotId: string): Promise<LotFeed | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("lot_feed_costs").select("feed_cost_usd, cost_per_head_day").eq("lot_id", lotId).maybeSingle();
  if (error) return null; // a missing view (migration not applied) means zero feed, not unknown
  return data ?? { feed_cost_usd: 0, cost_per_head_day: 0 };
}

async function getRealizedAdg(lotId: string): Promise<RealizedAdg | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lot_realized_adg")
    .select("realized_adg, total_gain_lb, sold_head_days, head_sold_with_weight")
    .eq("lot_id", lotId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getWeightAnchor(lotId: string): Promise<WeightAnchor | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lot_weight_anchor")
    .select("anchor_type, anchor_date, anchor_avg_weight_lb")
    .eq("lot_id", lotId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const ZERO_XFER: TransferCosts = { transferred_in_usd: 0, transferred_out_usd: 0, transferred_in_head: 0, transferred_out_head: 0 };

async function getTransferCosts(lotId: string): Promise<TransferCosts> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lot_transfer_costs")
    .select("transferred_in_usd, transferred_out_usd, transferred_in_head, transferred_out_head")
    .eq("lot_id", lotId)
    .maybeSingle();
  if (error) return ZERO_XFER; // missing view or RLS denial both mean zero, not unknown
  return data ?? ZERO_XFER;
}

/** Ported from loadHeadAdjustments()'s client-side split (index.html:26165-26166): negative
 * head_count is written off (missing), positive is a stray returned. */
function computeHeadAdjTotals(rows: { head_count: number | null }[]): HeadAdjTotals {
  let missingOut = 0;
  let strayIn = 0;
  for (const r of rows) {
    const d = Number(r.head_count) || 0;
    if (d < 0) missingOut += -d;
    else strayIn += d;
  }
  return { missingOut, strayIn };
}

/**
 * Aggregates every read `closeoutActual`/`closeoutProjection` need, mirroring the relevant
 * slice of showLotDetail()'s master query (index.html:7284-7348, 7443-7496). `today` is passed
 * in (not computed here) so the whole call tree stays testable with a fixed clock.
 */
export interface CloseoutData {
  inputs: CloseoutInputs;
  rates: CloseoutRates;
  /** The lot's own saved target_days_on_feed -- not part of `rates` (closeoutRates() never reads
   * it directly, only via the derived-from-ship-date hidden field), but the Save Assumptions
   * form needs it as the fallback when no ship date is set. */
  savedDaysOnFeed: number | null;
}

export async function getCloseoutInputs(lotId: string, status: LotStatusRecord, arrivalDate: string | null, today: string): Promise<CloseoutData> {
  const [assumptions, medCost, lotFeed, realizedAdg, weightAnchor, transferCosts, transfers, headAdjRows, sales, ranchSettings] = await Promise.all([
    getLotCloseoutAssumptions(lotId),
    getMedCost(lotId),
    getLotFeed(lotId),
    getRealizedAdg(lotId),
    getWeightAnchor(lotId),
    getTransferCosts(lotId),
    getLotTransfers(lotId),
    getHeadAdjustments(lotId),
    getSales(lotId),
    getRanchSettings(today),
  ]);

  let headDaysAfterBoundary: number | null = null;
  let feedAfterBoundary: number | null = null;
  let nonFeedRanchCharge: number | null = null;
  if (ranchSettings.feedDirectFrom) {
    const r = await getHeadDaysAfterBoundary(lotId, ranchSettings.feedDirectFrom, ranchSettings.nonFeedRates);
    headDaysAfterBoundary = r.headDaysAfterBoundary;
    feedAfterBoundary = r.feedAfterBoundary;
    nonFeedRanchCharge = r.nonFeedRanchCharge;
  }

  const closeoutStatus: CloseoutLotStatus = {
    head_in: status.head_in,
    head_current: status.head_current,
    head_dead: status.head_dead,
    total_cost_in: status.total_cost_in,
    total_weight_in: status.total_weight_in,
    weighted_arrival_date: status.weighted_arrival_date,
  };

  const transferRows: TransferRow[] = transfers.map((t) => ({
    is_outbound: t.is_outbound,
    kind: t.kind,
    head_count: t.head_count,
    transfer_date: t.transfer_date,
    basis_total: t.basis_total,
  }));

  const saleRows: SaleRow[] = sales.map((s) => ({
    head_count: s.head_count,
    total_price: s.total_price,
    net_weight_lb: s.net_weight_lb,
    gross_weight_lb: s.gross_weight_lb,
    notes: s.notes,
  }));

  const lot: CloseoutLot = { arrival_date: arrivalDate, assumed_nonfeed_cog_per_day: assumptions?.assumed_nonfeed_cog_per_day ?? null };

  const inputs: CloseoutInputs = {
    status: closeoutStatus,
    lot,
    headDaysToDate: await getHeadDaysToDate(lotId),
    medCost,
    lotFeed,
    realizedAdg,
    weightAnchor,
    transferCosts,
    transfers: transferRows,
    headAdjTotals: computeHeadAdjTotals(headAdjRows),
    sales: saleRows,
    ranchNonFeedDefault: ranchSettings.nonFeedCogPerDay,
    ranchNonFeedRates: ranchSettings.nonFeedRates,
    feedDirectFrom: ranchSettings.feedDirectFrom,
    headDaysAfterBoundary,
    feedAfterBoundary,
    nonFeedRanchCharge,
    today,
  };

  const rates = buildCloseoutRates(
    {
      target_sale_cwt: assumptions?.target_sale_cwt ?? null,
      target_adg: assumptions?.target_adg ?? null,
      target_ship_date: assumptions?.target_ship_date ?? null,
      target_days_on_feed: assumptions?.target_days_on_feed ?? null,
      arrival_date: arrivalDate,
      assumed_cog_per_lb: assumptions?.assumed_cog_per_lb ?? null,
      assumed_nonfeed_cog_per_day: assumptions?.assumed_nonfeed_cog_per_day ?? null,
      labor_mode: assumptions?.labor_mode ?? null,
      assumed_labor_per_day: assumptions?.assumed_labor_per_day ?? null,
      assumed_labor_per_head: assumptions?.assumed_labor_per_head ?? null,
      assumed_processing_per_head: assumptions?.assumed_processing_per_head ?? null,
      assumed_doctoring_per_head: assumptions?.assumed_doctoring_per_head ?? null,
      assumed_death_loss_pct: assumptions?.assumed_death_loss_pct ?? null,
      assumed_interest_pct: assumptions?.assumed_interest_pct ?? null,
    },
    { head_in: status.head_in, total_weight_in: status.total_weight_in }
  );

  return { inputs, rates, savedDaysOnFeed: assumptions?.target_days_on_feed ?? null };
}

/** Ported from currentHeadDaysToDate (index.html:7371-7374): summed client-side, `null` (not 0)
 * on a failed read -- a lot with no head-days read as zero would silently drop cost of gain. */
async function getHeadDaysToDate(lotId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("lot_head_days_by_month").select("head_days").eq("lot_id", lotId).order("month_start", { ascending: true });
  if (error) return null;
  return (data ?? []).reduce((sum, r) => sum + (Number(r.head_days) || 0), 0);
}

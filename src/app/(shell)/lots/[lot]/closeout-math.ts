/**
 * NonfeedRate/ranchNonFeedRateOn/ranchNonFeedLatest live here, not in data/ranch-settings.ts,
 * because this file is imported by closeout-actions.tsx (a client component, for `daysBetween`)
 * -- anything it imports must be pure, with zero dependency on server-only code
 * (data/ranch-settings.ts's own reads pull in next/headers via @/lib/supabase/server, which
 * cannot bundle into client code). data/ranch-settings.ts imports these back from here instead.
 */
export interface NonfeedRate {
  effective_from: string;
  rate_per_head_day: number;
  includes_pasture: boolean | null;
  is_placeholder: boolean | null;
  notes: string | null;
}

/** Ported from ranchNonFeedRateOn() (index.html:8596-8600): the dated rate in force on a given
 * day -- the last rate whose effective_from is on or before it. */
export function ranchNonFeedRateOn(rates: NonfeedRate[], day: string): NonfeedRate | null {
  let current: NonfeedRate | null = null;
  for (const r of rates) {
    if (r.effective_from <= day) current = r;
    else break;
  }
  return current;
}

/** Ported from ranchNonFeedLatest() (index.html:8602-8604): the newest dated rate on file. */
export function ranchNonFeedLatest(rates: NonfeedRate[]): NonfeedRate | null {
  return rates.length ? rates[rates.length - 1] : null;
}

/** Ranch-local "today" (America/Chicago calendar day), the same boundary the database's
 * ranch_today() uses -- ported from ranchToday() (index.html:8562-8567). Safe to call
 * server-side: Intl.DateTimeFormat with an explicit timeZone doesn't depend on the host's
 * local timezone. Called once per page render, threaded through as a plain argument so every
 * function below stays pure and testable. */
export function ranchTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Ported from daysBetween() (index.html:8534-8538) -- local-calendar date parsing (not ISO
 * string parsing) so a day boundary never shifts under a reader's timezone. */
export function daysBetween(fromStr: string | null, toStr: string | null): number | null {
  if (!fromStr || !toStr) return null;
  const p = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  return Math.round((p(toStr).getTime() - p(fromStr).getTime()) / 86400000);
}

/** Ported from interestOn() (index.html:8528-8532): simple interest on cattle cost for the
 * full period, plus simple interest on operating cost for half the period (it accrues
 * gradually, not all on day one). */
export function interestOn(cattleCost: number, operatingCost: number, days: number | null, ratePct: number | null): number {
  if (!ratePct || !days || days <= 0) return 0;
  const yearFrac = days / 365;
  return ratePct * (cattleCost * yearFrac + (operatingCost || 0) * yearFrac / 2);
}

const NO_TICKET_MARK = "[no scale ticket]";
/** Ported from saleHasNoTicketMark() (index.html:10040). */
function saleHasNoTicketMark(notes: string | null): boolean {
  return !!(notes && notes.includes(NO_TICKET_MARK));
}

export interface CloseoutLotStatus {
  head_in: number | null;
  head_current: number | null;
  head_dead: number | null;
  total_cost_in: number | null;
  total_weight_in: number | null;
  weighted_arrival_date: string | null;
}

export interface CloseoutLot {
  arrival_date: string | null;
  assumed_nonfeed_cog_per_day: number | null;
}

export interface CloseoutRates {
  salePerLb: number | null;
  adg: number | null;
  finishWt: number | null;
  cog: number | null;
  nonFeedCog: number | null;
  labor: number | null;
  laborMode: "per_day" | "per_head";
  procPerHead: number | null;
  docPerHead: number | null;
  deathPct: number | null;
  intPct: number | null;
  shipDate: string | null;
}

export interface MedCost {
  processing: number;
  treatment: number;
  other: number;
  /** Ported from procCoverage.headWithout (index.html:7409-7416): invoiced head with no
   * receiving protocol on their load out OR their invoice -- still carried at the assumed
   * $/head in the Projection column. `null` only when the coverage read itself failed. */
  headWithout: number | null;
}

export interface LotFeed {
  feed_cost_usd: number | null;
  cost_per_head_day: number | null;
}

export interface RealizedAdg {
  realized_adg: number | null;
  total_gain_lb: number | null;
  sold_head_days: number | null;
  head_sold_with_weight: number | null;
}

export interface WeightAnchor {
  anchor_type: string | null;
  anchor_date: string | null;
  anchor_avg_weight_lb: number | null;
}

export interface TransferCosts {
  transferred_in_usd: number | null;
  transferred_out_usd: number | null;
  transferred_in_head: number | null;
  transferred_out_head: number | null;
}

export interface TransferRow {
  is_outbound: boolean;
  kind: string | null;
  head_count: number | null;
  transfer_date: string | null;
  basis_total: number | null;
}

export interface HeadAdjTotals {
  missingOut: number;
  strayIn: number;
}

export interface SaleRow {
  head_count: number | null;
  total_price: number | null;
  net_weight_lb: number | null;
  gross_weight_lb: number | null;
  notes: string | null;
}

export interface CloseoutInputs {
  status: CloseoutLotStatus;
  lot: CloseoutLot;
  headDaysToDate: number | null;
  medCost: MedCost | null;
  lotFeed: LotFeed | null;
  realizedAdg: RealizedAdg | null;
  weightAnchor: WeightAnchor | null;
  transferCosts: TransferCosts | null;
  transfers: TransferRow[];
  headAdjTotals: HeadAdjTotals;
  sales: SaleRow[];
  ranchNonFeedDefault: number | null;
  ranchNonFeedRates: NonfeedRate[];
  feedDirectFrom: string | null;
  headDaysAfterBoundary: number | null;
  feedAfterBoundary: number | null;
  nonFeedRanchCharge: number | null;
  today: string;
}

export interface CloseoutActual {
  headIn: number;
  headCurrent: number;
  headDead: number;
  daysToDate: number;
  headDays: number;
  cattleCost: number;
  processing: number;
  treatment: number;
  otherMed: number;
  feed: number;
  cog: number;
  labor: number;
  interest: number;
  medicine: number;
  feedPerHeadDay: number;
  feedLedger: number;
  feedInsideCog: boolean;
  cogSplit: boolean;
  nonFeedFwdRate: number | null;
  ranchDated: boolean;
  ranchDatedUsd: number | null;
  cogLbRate: number;
  nonFeedCog: number | null;
  nonFeedSource: "lot" | "ranch" | "none";
  soldGainLb: number;
  soldHeadDays: number;
  unsettledHeadDays: number;
  estGainLb: number;
  gainToDateLb: number;
  gainClamped: boolean;
  rawSoldGainLb: number;
  unweighedSoldHead: number;
  estAdg: number;
  estAdgSource: "realized" | "weighing" | "target";
  soldWithWt: number;
  boundaryActive: boolean;
  splitUnavailable: boolean;
  hdBefore: number;
  hdAfter: number;
  nonFeedMissing: boolean;
  operating: number;
  totalCost: number;
  transferInUsd: number;
  transferOutUsd: number;
  transferInHead: number;
  transferOutHead: number;
  transferInterest: number;
  avgCostIn: number;
  deathLossUsd: number;
  cattleLive: number;
  netMissing: number;
  missingLossUsd: number;
  missingOut: number;
  strayIn: number;
  soldHead: number;
  revenue: number;
  soldWeight: number;
  treatmentPerHeadDay: number;
}

/**
 * Ported from closeoutActual(rates) (index.html:8610-8884) -- cost-to-date. Faithfully
 * line-for-line, same variable names/order as the source, so a future audit against
 * index.html is a direct comparison, not a re-derivation. `basisPerHead` is kept (even though
 * the Closeout tab itself doesn't display it -- confirmed only `ltComputeBasis()`, Lot
 * Transfers' basis-freezing, reads it) since it's cheap to compute and matches the source
 * return shape exactly.
 */
export function closeoutActual(inputs: CloseoutInputs, rates: CloseoutRates): CloseoutActual {
  const { status: st, lot, today } = inputs;
  const headIn = Number(st.head_in) || 0;
  const headCurrent = Number(st.head_current) || 0;
  const headDead = Number(st.head_dead) || 0;
  const cattleCost = Number(st.total_cost_in) || 0;
  const headDays = Number(inputs.headDaysToDate) || 0;

  const start = st.weighted_arrival_date || lot.arrival_date || null;
  const daysToDate = start ? Math.max(0, daysBetween(start, today) ?? 0) : 0;
  const soldHeadPre = inputs.sales.reduce((t, x) => t + (Number(x.head_count) || 0), 0);

  const processing = inputs.medCost ? inputs.medCost.processing || 0 : 0;
  const treatment = inputs.medCost ? inputs.medCost.treatment || 0 : 0;
  const otherMed = inputs.medCost ? inputs.medCost.other || 0 : 0;

  const feedLedger = inputs.lotFeed ? Number(inputs.lotFeed.feed_cost_usd) || 0 : 0;

  // The vanilla source's `nonFeedCog` has a three-way source (typed on a live input box, else
  // the lot's own saved rate, else the ranch default) with a live-box tri-state (untouched /
  // explicitly cleared / typed) that only matters when a human is editing. This port has no
  // input boxes -- `rates.nonFeedCog` IS `lot.assumed_nonfeed_cog_per_day` by construction (see
  // buildCloseoutRates) -- so the "typed" branch can never fire here and is dropped; this
  // collapses to exactly the vanilla app's own "inherit from the lot, else the ranch default"
  // behavior.
  const nonFeedLot = lot.assumed_nonfeed_cog_per_day != null ? Number(lot.assumed_nonfeed_cog_per_day) : null;
  const nonFeedCog: number | null = nonFeedLot != null ? nonFeedLot : inputs.ranchNonFeedDefault;
  const nonFeedSource: CloseoutActual["nonFeedSource"] = nonFeedLot != null ? "lot" : nonFeedCog != null ? "ranch" : "none";
  const feedInsideCog = nonFeedCog == null;

  const boundaryActive = !feedInsideCog && !!inputs.feedDirectFrom && inputs.headDaysAfterBoundary != null;
  const hdAfter = boundaryActive ? Math.min(inputs.headDaysAfterBoundary as number, headDays) : 0;
  const hdBefore = Math.max(0, headDays - hdAfter);

  const feed = feedInsideCog ? 0 : boundaryActive ? inputs.feedAfterBoundary ?? 0 : feedLedger;
  const feedPerHeadDay = feedInsideCog
    ? 0
    : boundaryActive && hdAfter > 0 && inputs.feedAfterBoundary != null
      ? inputs.feedAfterBoundary / hdAfter
      : (inputs.lotFeed && Number(inputs.lotFeed.cost_per_head_day)) || 0;

  const splitUnavailable = !feedInsideCog && !!inputs.feedDirectFrom && inputs.headDaysAfterBoundary == null;
  const nonFeedMissing = boundaryActive && hdAfter > 0 && nonFeedCog == null;
  const useNonFeedOnly = !boundaryActive && !splitUnavailable && nonFeedCog != null;
  const cogSplit = boundaryActive || useNonFeedOnly;

  const ranchDated = boundaryActive && nonFeedSource === "ranch" && inputs.nonFeedRanchCharge != null && (inputs.headDaysAfterBoundary as number) > 0;
  const ranchDatedUsd = ranchDated ? (inputs.nonFeedRanchCharge as number) * Math.min(1, hdAfter / (inputs.headDaysAfterBoundary as number)) : null;
  const nonFeedRate: number | null = !cogSplit ? null : ranchDated ? (hdAfter > 0 ? (ranchDatedUsd as number) / hdAfter : nonFeedCog ?? 0) : (nonFeedCog ?? 0);
  const latestNf = ranchNonFeedLatest(inputs.ranchNonFeedRates);
  const nonFeedFwdRate = cogSplit && nonFeedSource === "ranch" && latestNf ? Number(latestNf.rate_per_head_day) : nonFeedRate;

  const rawSoldGainLb = inputs.realizedAdg && inputs.realizedAdg.total_gain_lb != null ? Number(inputs.realizedAdg.total_gain_lb) : 0;
  const gainClamped = rawSoldGainLb < 0;
  const soldGainLb = Math.max(0, rawSoldGainLb);
  const soldHeadDays = inputs.realizedAdg && inputs.realizedAdg.sold_head_days != null ? Math.min(headDays, Number(inputs.realizedAdg.sold_head_days)) : 0;
  const unsettledHeadDays = Math.max(0, headDays - soldHeadDays);

  const soldWithWt = inputs.realizedAdg && inputs.realizedAdg.head_sold_with_weight != null ? Number(inputs.realizedAdg.head_sold_with_weight) : 0;
  const realizedAdgRate = inputs.realizedAdg && inputs.realizedAdg.realized_adg != null ? Number(inputs.realizedAdg.realized_adg) : null;
  const anchor = inputs.weightAnchor;
  const anchorDays = anchor && anchor.anchor_type && anchor.anchor_type !== "purchase" && start ? daysBetween(start, anchor.anchor_date) : null;
  const avgWtIn = headIn > 0 ? (Number(st.total_weight_in) || 0) / headIn : 0;
  const weighingAdg =
    anchorDays != null && anchorDays > 0 && avgWtIn > 0 && anchor?.anchor_avg_weight_lb != null ? (Number(anchor.anchor_avg_weight_lb) - avgWtIn) / anchorDays : null;
  let estAdg: number;
  let estAdgSource: CloseoutActual["estAdgSource"];
  if (realizedAdgRate != null && soldHeadPre > 0 && soldWithWt / soldHeadPre >= 0.25) {
    estAdg = realizedAdgRate;
    estAdgSource = "realized";
  } else if (weighingAdg != null) {
    estAdg = weighingAdg;
    estAdgSource = "weighing";
  } else {
    estAdg = rates.adg || 0;
    estAdgSource = "target";
  }
  estAdg = Math.max(0, estAdg);
  const estGainLb = estAdg * unsettledHeadDays;
  const gainToDateLb = soldGainLb + estGainLb;

  const cogLbRate = rates.cog || 0;
  const gainOnDays = (hd: number) => (headDays > 0 ? (gainToDateLb * hd) / headDays : 0);
  let cog: number;
  if (boundaryActive) {
    cog = cogLbRate * gainOnDays(hdBefore) + (ranchDated ? (ranchDatedUsd as number) : (nonFeedRate ?? 0) * hdAfter);
  } else if (useNonFeedOnly) {
    cog = (nonFeedRate ?? 0) * headDays;
  } else {
    cog = cogLbRate * gainToDateLb;
  }
  const labor = rates.laborMode === "per_day" ? (rates.labor || 0) * headDays : (rates.labor || 0) * headIn;

  const operating = processing + treatment + otherMed + feed + cog + labor;
  const interest = interestOn(cattleCost, operating, daysToDate, rates.intPct);

  const xfer = inputs.transferCosts;
  const transferInUsd = Number(xfer?.transferred_in_usd) || 0;
  const transferOutUsd = Number(xfer?.transferred_out_usd) || 0;
  const transferInHead = Number(xfer?.transferred_in_head) || 0;
  const transferOutHead = Number(xfer?.transferred_out_head) || 0;

  let transferInterest = 0;
  if (rates.intPct) {
    for (const t of inputs.transfers) {
      if (t.is_outbound) continue; // only transfers where THIS lot is the destination
      const d = daysBetween(t.transfer_date, today);
      if (d == null || d <= 0) continue;
      transferInterest += rates.intPct * (Number(t.basis_total) || 0) * (d / 365);
    }
  }

  let soldHead = 0;
  let revenue = 0;
  let soldWeight = 0;
  let unweighedSoldHead = 0;
  for (const s of inputs.sales) {
    soldHead += Number(s.head_count) || 0;
    revenue += Number(s.total_price) || 0;
    soldWeight += Number(s.net_weight_lb) || Number(s.gross_weight_lb) || 0;
    if (!(Number(s.net_weight_lb) > 0) && !saleHasNoTicketMark(s.notes)) unweighedSoldHead += Number(s.head_count) || 0;
  }

  const totalCost = cattleCost + operating + interest + transferInUsd + transferInterest - transferOutUsd;

  // survivingHead/basisPerHead (index.html:8838-8840) feed only ltComputeBasis(), Lot
  // Transfers' basis-freezing -- confirmed never read by the Closeout render itself, and Lot
  // Transfers is out of scope this phase, so they're dropped rather than computed unused.
  const netMissing = (inputs.headAdjTotals.missingOut || 0) - (inputs.headAdjTotals.strayIn || 0);

  const avgCostIn = headIn > 0 ? cattleCost / headIn : 0;
  const deathLossUsd = headDead * avgCostIn;
  const missingLossUsd = netMissing * avgCostIn;
  const cattleLive = cattleCost - deathLossUsd - missingLossUsd;

  return {
    headIn, headCurrent, headDead, daysToDate, headDays,
    cattleCost, processing, treatment, otherMed, feed, cog, labor, interest,
    medicine: processing + treatment + otherMed,
    feedPerHeadDay, feedLedger, feedInsideCog, cogSplit, nonFeedFwdRate, ranchDated, ranchDatedUsd, cogLbRate, nonFeedCog, nonFeedSource,
    soldGainLb, soldHeadDays, unsettledHeadDays, estGainLb, gainToDateLb, gainClamped, rawSoldGainLb, unweighedSoldHead,
    estAdg, estAdgSource, soldWithWt,
    boundaryActive, splitUnavailable, hdBefore, hdAfter, nonFeedMissing,
    operating, totalCost,
    transferInUsd, transferOutUsd, transferInHead, transferOutHead, transferInterest,
    avgCostIn, deathLossUsd, cattleLive,
    netMissing, missingLossUsd,
    missingOut: inputs.headAdjTotals.missingOut || 0, strayIn: inputs.headAdjTotals.strayIn || 0,
    soldHead, revenue, soldWeight,
    treatmentPerHeadDay: headDays > 0 ? treatment / headDays : 0,
  };
}

export interface CloseoutProjection {
  remainingDays: number | null;
  deathsToCome: number;
  deathExposure: number;
  survivingAtClose: number;
  forwardHeadDays: number;
  gainFwdLb: number;
  deathLossFwd: number;
  processingProj: number;
  processingFwd: number;
  headNoProtocol: number;
  treatmentProj: number;
  treatmentBurnFwd: number;
  doctoringFloor: number;
  doctoringOnFloor: boolean;
  medicineFwd: number;
  penOutHead: number;
  cogFwd: number;
  laborFwd: number;
  treatmentFwd: number;
  feedFwd: number;
  interestFwd: number;
  operatingFwd: number;
  revenueFwd: number;
  totalCost: number;
  totalRevenue: number;
  net: number;
  breakEvenPerLb: number | null;
  costPerHeadSold: number | null;
  remnantCost: number | null;
  lotShortfall: number;
  soldNet: number | null;
  soldNetPerHd: number | null;
  leftNet: number | null;
  leftNetPerHd: number | null;
  actualCostPerHd: number | null;
  leftCost: number | null;
  leftBreakEvenPerLb: number | null;
  headSoldAtClose: number;
  netPerHeadSold: number | null;
}

/** Ported from closeoutProjection(rates, actual) (index.html:8893-9042) -- cost-at-close,
 * built on top of closeoutActual()'s own output, not a second independent calculation. */
export function closeoutProjection(inputs: CloseoutInputs, rates: CloseoutRates, actual: CloseoutActual): CloseoutProjection {
  const today = inputs.today;
  const remainingDays = rates.shipDate ? Math.max(0, daysBetween(today, rates.shipDate) ?? 0) : null;

  const assumedTotalDeaths = rates.deathPct != null ? actual.headIn * rates.deathPct : 0;
  const lifeDays = remainingDays != null ? actual.daysToDate + remainingDays : 0;
  const deathExposure = remainingDays == null ? 1 : lifeDays > 0 ? Math.max(0, Math.min(1, remainingDays / lifeDays)) : 0;
  const deathsToCome = Math.max(0, Math.min(actual.headCurrent, (assumedTotalDeaths - actual.headDead) * deathExposure));
  const survivingAtClose = Math.max(0, actual.headCurrent - deathsToCome);
  const deathLossFwd = deathsToCome * actual.avgCostIn;

  const forwardHeadDays = remainingDays != null ? (remainingDays * (actual.headCurrent + survivingAtClose)) / 2 : 0;

  const gainFwdLb = (actual.estAdg != null ? actual.estAdg : rates.adg || 0) * forwardHeadDays;
  const cogFwd = actual.cogSplit ? (actual.nonFeedFwdRate || 0) * forwardHeadDays : actual.cogLbRate * gainFwdLb;
  const laborFwd = rates.laborMode === "per_day" ? (rates.labor || 0) * forwardHeadDays : 0;

  const feedFwd = actual.feedInsideCog ? 0 : actual.feedPerHeadDay * forwardHeadDays;

  // Ported from index.html:8951-8952: once a load carries a receiving protocol, processing
  // cost is derived from the books and the Projection figure is actual + (assumed rate × only
  // the head with no protocol yet) -- NOT "0 once any processing exists", which would silently
  // stop projecting the un-protocoled head's assumed cost on a lot with partial coverage.
  const headNoProtocol = inputs.medCost?.headWithout != null ? inputs.medCost.headWithout : actual.processing > 0 ? 0 : actual.headIn;
  const processingProj = actual.processing + (rates.procPerHead || 0) * headNoProtocol;
  const processingFwd = processingProj - actual.processing;

  const treatmentBurnFwd = actual.treatmentPerHeadDay * forwardHeadDays;
  const doctoringFloor = (rates.docPerHead || 0) * actual.headIn;
  const onFeed = remainingDays != null && remainingDays > 0;
  const treatmentProj = onFeed ? Math.max(actual.treatment + treatmentBurnFwd, doctoringFloor) : actual.treatment + treatmentBurnFwd;
  const treatmentFwd = treatmentProj - actual.treatment;
  const doctoringOnFloor = onFeed && doctoringFloor > actual.treatment + treatmentBurnFwd;

  const operatingFwd = cogFwd + laborFwd + treatmentFwd + feedFwd + processingFwd;
  const carriedTransfer = (actual.transferInUsd || 0) - (actual.transferOutUsd || 0);
  const penOutHead = inputs.transfers.filter((t) => t.kind === "feed_pen" && t.is_outbound).reduce((n, t) => n + (Number(t.head_count) || 0), 0);
  const interestFwd = interestOn(0, actual.cattleCost + actual.operating + carriedTransfer + operatingFwd, remainingDays || 0, rates.intPct);

  const finishWt = rates.finishWt || 0;
  const revenueFwd = rates.salePerLb != null ? survivingAtClose * finishWt * rates.salePerLb : 0;

  const totalCost = actual.totalCost + operatingFwd + interestFwd;
  const totalRevenue = actual.revenue + revenueFwd;
  const net = totalRevenue - totalCost;

  const headSoldAtClose = actual.soldHead + survivingAtClose;
  const costPerHeadSold = headSoldAtClose > 0 ? totalCost / headSoldAtClose : null;
  const breakEvenPerLb = costPerHeadSold != null && finishWt > 0 ? costPerHeadSold / finishWt : null;
  const remnantCost = costPerHeadSold != null ? costPerHeadSold * survivingAtClose : null;
  const lotShortfall = totalCost - actual.revenue;

  const actualCostPerHd = headSoldAtClose > 0 ? actual.totalCost / headSoldAtClose : null;
  const soldNet = actual.soldHead > 0 && actualCostPerHd != null ? actual.revenue - actualCostPerHd * actual.soldHead : null;
  const soldNetPerHd = soldNet != null ? soldNet / actual.soldHead : null;
  const leftCost = actualCostPerHd != null ? actualCostPerHd * survivingAtClose + operatingFwd + interestFwd : null;
  const leftNet = survivingAtClose > 0 && leftCost != null ? revenueFwd - leftCost : null;
  const leftNetPerHd = leftNet != null ? leftNet / survivingAtClose : null;
  const leftBreakEvenPerLb = leftCost != null && survivingAtClose > 0 && finishWt > 0 ? leftCost / (survivingAtClose * finishWt) : null;

  return {
    remainingDays, deathsToCome, deathExposure, survivingAtClose, forwardHeadDays, gainFwdLb, deathLossFwd,
    processingProj, processingFwd, headNoProtocol,
    treatmentProj, treatmentBurnFwd, doctoringFloor, doctoringOnFloor,
    medicineFwd: processingFwd + treatmentFwd,
    penOutHead,
    cogFwd, laborFwd, treatmentFwd, feedFwd, interestFwd, operatingFwd,
    revenueFwd, totalCost, totalRevenue, net, breakEvenPerLb,
    costPerHeadSold, remnantCost, lotShortfall,
    soldNet, soldNetPerHd, leftNet, leftNetPerHd, actualCostPerHd, leftCost, leftBreakEvenPerLb,
    headSoldAtClose,
    netPerHeadSold: headSoldAtClose > 0 ? net / headSoldAtClose : null,
  };
}

/**
 * Builds `rates` for this read-only port: the lot's SAVED assumption columns, the same values
 * the real Closeout tab's input boxes are prefilled with (index.html:9102-9163) -- there are no
 * editable boxes here, so this *is* the rates object, not just its initial value.
 * `finishWt`'s default uses the simpler weight-in + days×ADG fallback
 * (`avgWtIn + targetDays*targetAdg`, index.html:9112-9113's fallback branch) rather than the
 * live anchored-projection RPC (`lot_projected_weight_detail`) the real tab prefers when
 * available -- that RPC's SQL isn't committed anywhere in the repo to verify its real shape
 * against, so it isn't ported (same "never guess an RPC" rule as every other phase); the lot
 * behaves exactly as if that projection "could not be read", a state the vanilla app already
 * handles gracefully and was built to fall back from.
 */
export function buildCloseoutRates(
  lot: {
    target_sale_cwt: number | null;
    target_adg: number | null;
    target_ship_date: string | null;
    target_days_on_feed: number | null;
    arrival_date: string | null;
    assumed_cog_per_lb: number | null;
    assumed_nonfeed_cog_per_day: number | null;
    labor_mode: string | null;
    assumed_labor_per_day: number | null;
    assumed_labor_per_head: number | null;
    assumed_processing_per_head: number | null;
    assumed_doctoring_per_head: number | null;
    assumed_death_loss_pct: number | null;
    assumed_interest_pct: number | null;
  },
  status: { head_in: number | null; total_weight_in: number | null }
): CloseoutRates {
  const laborMode: "per_day" | "per_head" = lot.labor_mode === "per_head" ? "per_head" : "per_day";
  const headIn = Number(status.head_in) || 0;
  const avgWtIn = headIn > 0 ? (Number(status.total_weight_in) || 0) / headIn : 0;
  const targetDays = lot.target_days_on_feed || 90;
  const targetAdg = Number(lot.target_adg) || 2.5;
  const finishWt = avgWtIn ? Math.round(avgWtIn + targetDays * targetAdg) : null;

  return {
    salePerLb: lot.target_sale_cwt,
    adg: lot.target_adg,
    finishWt,
    cog: lot.assumed_cog_per_lb,
    nonFeedCog: lot.assumed_nonfeed_cog_per_day,
    labor: laborMode === "per_day" ? lot.assumed_labor_per_day : lot.assumed_labor_per_head,
    laborMode,
    procPerHead: lot.assumed_processing_per_head,
    docPerHead: lot.assumed_doctoring_per_head,
    deathPct: lot.assumed_death_loss_pct,
    intPct: lot.assumed_interest_pct,
    shipDate: lot.target_ship_date,
  };
}

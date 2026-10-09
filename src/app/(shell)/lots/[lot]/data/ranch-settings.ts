import { createClient } from "@/lib/supabase/server";

export interface NonfeedRate {
  effective_from: string;
  rate_per_head_day: number;
  includes_pasture: boolean | null;
  is_placeholder: boolean | null;
  notes: string | null;
}

export interface RanchSettings {
  feedDirectFrom: string | null;
  nonFeedCogPerDay: number | null;
  nonFeedCogNote: string | null;
  nonFeedRates: NonfeedRate[];
}

/**
 * Ported from loadRanchSettings() (index.html:8571-8594): ranch-wide (not lot-scoped) feed-cost
 * settings -- the single cutover date after which a lot charges actual feed plus a non-feed
 * $/head-day rate instead of one all-in assumed cost-of-gain rate, and the dated history of that
 * non-feed rate. Dated rates REPLACE the single `ranch_settings` figure when any exist (kept
 * there only for audit) -- `nonFeedCogPerDay`/`nonFeedCogNote` end up as the rate in force
 * *today*, not the raw `ranch_settings` row, exactly matching the vanilla override.
 */
export async function getRanchSettings(today: string): Promise<RanchSettings> {
  const supabase = await createClient();
  const [settingsRes, ratesRes] = await Promise.all([
    supabase.from("ranch_settings").select("feed_direct_from, nonfeed_cog_per_day, nonfeed_cog_note").maybeSingle(),
    supabase
      .from("nonfeed_rates")
      .select("effective_from, rate_per_head_day, includes_pasture, is_placeholder, notes")
      .order("effective_from", { ascending: true }),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  if (ratesRes.error) throw ratesRes.error;

  const nonFeedRates = ratesRes.data ?? [];
  let nonFeedCogPerDay = settingsRes.data?.nonfeed_cog_per_day ?? null;
  let nonFeedCogNote = settingsRes.data?.nonfeed_cog_note ?? null;
  if (nonFeedRates.length) {
    const now = ranchNonFeedRateOn(nonFeedRates, today);
    nonFeedCogPerDay = now ? now.rate_per_head_day : null;
    nonFeedCogNote = now ? (now.is_placeholder ? "placeholder" : now.notes || "") : null;
  }

  return {
    feedDirectFrom: settingsRes.data?.feed_direct_from ?? null,
    nonFeedCogPerDay,
    nonFeedCogNote,
    nonFeedRates,
  };
}

export interface HeadDaysAfterBoundary {
  headDaysAfterBoundary: number | null;
  feedAfterBoundary: number | null;
  nonFeedRanchCharge: number | null;
}

const HEAD_DAYS_ROW_CAP = 1200;
const FEED_DAYS_ROW_CAP = 5000;

/**
 * Ported from the head-days-after-boundary fetch inside showLotDetail() (index.html:7443-7496),
 * only run when the ranch has a feed-direct-charge cutover date on file. Hitting either row cap
 * forces the corresponding total back to null (unknown) rather than silently truncating it.
 */
export async function getHeadDaysAfterBoundary(lotId: string, feedDirectFrom: string, nonFeedRates: NonfeedRate[]): Promise<HeadDaysAfterBoundary> {
  const supabase = await createClient();
  const [hdRes, fdRes] = await Promise.all([
    supabase.from("lot_daily_head").select("as_of_date, head_on_hand").eq("lot_id", lotId).gte("as_of_date", feedDirectFrom).limit(HEAD_DAYS_ROW_CAP),
    supabase.from("lot_feed_daily").select("cost_usd").eq("lot_id", lotId).gte("day", feedDirectFrom).limit(FEED_DAYS_ROW_CAP),
  ]);
  if (hdRes.error) throw hdRes.error;
  if (fdRes.error) throw fdRes.error;

  const feedAfterBoundary = !fdRes.error && (fdRes.data?.length ?? 0) < FEED_DAYS_ROW_CAP ? (fdRes.data ?? []).reduce((t, r) => t + (Number(r.cost_usd) || 0), 0) : null;

  const hdRows = hdRes.data ?? [];
  let headDaysAfterBoundary: number | null = hdRows.reduce((t, r) => t + (Number(r.head_on_hand) || 0), 0);
  if (hdRows.length >= HEAD_DAYS_ROW_CAP) headDaysAfterBoundary = null;

  let nonFeedRanchCharge: number | null = null;
  if (headDaysAfterBoundary != null && nonFeedRates.length) {
    let usd = 0;
    let ok = true;
    for (const r of hdRows) {
      const head = Number(r.head_on_hand) || 0;
      if (!head) continue;
      const rate = ranchNonFeedRateOn(nonFeedRates, String(r.as_of_date).slice(0, 10));
      if (!rate) {
        ok = false;
        break;
      }
      usd += head * Number(rate.rate_per_head_day);
    }
    if (ok) nonFeedRanchCharge = usd;
  }

  return { headDaysAfterBoundary, feedAfterBoundary, nonFeedRanchCharge };
}

/** Ported from ranchNonFeedRateOn() (index.html:8596-8600): the dated rate in force on a given
 * day -- the last rate whose effective_from is on or before it. Pure, exported for Vitest. */
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

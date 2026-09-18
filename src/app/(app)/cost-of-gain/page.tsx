import { listGlLots, getCostOfGain } from "@/lib/data/cost-of-gain";
import { getWeeklyCostSeries } from "@/lib/data/gl";
import { StatTile } from "@/components/stat-tile";
import { ReportUnavailableNotice } from "@/components/report-unavailable-notice";
import { LotPicker } from "./lot-picker";
import { CostBreakdownChart } from "./cost-breakdown-chart";
import { WeeklyCostChart } from "./weekly-cost-chart";
import { formatPerLb, formatMoney, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CostOfGainPage({
  searchParams,
}: {
  searchParams: Promise<{ lot?: string }>;
}) {
  const lots = listGlLots();
  const { lot: lotParam } = await searchParams;
  const lot = lotParam ?? lots[0]?.lot;

  const cog = lot ? getCostOfGain(lot) : undefined;
  const weekly = lot ? getWeeklyCostSeries(lot) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Cost of Gain</h1>
          <p className="text-sm text-muted-foreground">
            Life-to-date, by lot. &ldquo;Total dollars first, divide at the end&rdquo; — never averaged ratios.
          </p>
        </div>
        <LotPicker lots={lots.map((l) => ({ lot: l.lot, status: l.status }))} />
      </div>

      {!cog ? (
        <ReportUnavailableNotice detail="No lot selected, or this lot has no GL data." />
      ) : (
        <>
          {!cog.grazingSummerNativeBooked && (
            <ReportUnavailableNotice detail={`Grazing - Summer Native is booked at $0 for lot ${cog.lot} — feed cost of gain is understated until this is posted.`} />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label="Cost of Gain — Feed only"
              value={formatPerLb(cog.cogFeed)}
              provenance="modeled"
              delta={formatMoney(cog.feedForage) + " total"}
            />
            <StatTile
              label="Cost of Gain — Operating"
              value={formatPerLb(cog.cogOper)}
              provenance="modeled"
              delta={formatMoney(cog.operating) + " total"}
            />
            <StatTile
              label="Cost of Gain — All-in"
              value={formatPerLb(cog.cogAllIn)}
              provenance="modeled"
              delta={formatMoney(cog.allIn) + " total"}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Head-days" value={formatNumber(cog.headDays)} provenance="measured" />
            <StatTile
              label="ADG used"
              value={`${cog.adgUsed.toFixed(2)} lb/day`}
              provenance={cog.adgProvenance}
              delta={cog.adgSourceDetail}
            />
            <StatTile label="Pounds gained (LTD)" value={formatNumber(cog.poundsGained)} provenance="modeled" />
            <StatTile label="$ / head-day (operating)" value={formatMoney(cog.costPerHeadDayOperating, { cents: true })} provenance="modeled" />
          </div>

          <CostBreakdownChart data={cog.costBreakdown} />
          <WeeklyCostChart data={weekly} />
        </>
      )}
    </div>
  );
}

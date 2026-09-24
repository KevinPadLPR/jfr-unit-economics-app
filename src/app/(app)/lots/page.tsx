import { listGlLots } from "@/lib/data/cost-of-gain";
import { StatTile } from "@/components/stat-tile";
import { formatNumber } from "@/lib/format";
import { LotScheduleTable } from "./lot-schedule-table";
import { HeadByGroupChart } from "./head-by-group-chart";

export const dynamic = "force-dynamic";

export default async function LotsPage() {
  const lots = listGlLots();
  const open = lots.filter((l) => (l.status ?? "").toLowerCase() === "open");
  const closed = lots.filter((l) => (l.status ?? "").toLowerCase() === "closed");
  const totalHeadOnHand = open.reduce((s, l) => s + (l.head_on_hand ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Master Lot Schedule</h1>
        <p className="text-sm text-muted-foreground">Every lot JFR has run, and where things stand today.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total lots" value={formatNumber(lots.length)} />
        <StatTile label="Open" value={formatNumber(open.length)} />
        <StatTile label="Closed" value={formatNumber(closed.length)} />
        <StatTile label="Head on hand" value={formatNumber(totalHeadOnHand)} />
      </div>

      <HeadByGroupChart rows={open.map((l) => ({ feedType: l.feed_type, locationType: l.location_type, headOnHand: l.head_on_hand }))} />

      <LotScheduleTable rows={lots} />
    </div>
  );
}

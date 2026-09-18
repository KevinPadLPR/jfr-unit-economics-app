import { getOverviewMetrics } from "@/lib/data/overview";
import { getMarketPosition } from "@/lib/data/market-position";
import { StatTile } from "@/components/stat-tile";
import { UnrealizedByLotChart } from "./unrealized-by-lot-chart";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { computed, unavailable, caveats } = getOverviewMetrics();
  const marketPosition = getMarketPosition();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">
          The front-page metrics from the Position Desk spec — capped at twelve, every number labeled with how it
          was derived.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {computed.map((m) => (
          <StatTile key={m.key} label={m.label} value={m.value ?? "—"} provenance={m.provenance ?? undefined} />
        ))}
        {unavailable.map((m) => (
          <StatTile key={m.key} label={m.label} value="—" className="opacity-70" delta={m.unavailableReason} />
        ))}
      </div>

      {caveats.unbookedSummerGrazingLots > 0 && (
        <p className="text-xs text-muted-foreground">
          Note: {caveats.unbookedSummerGrazingLots} open 2026 lot(s) show $0 booked for &ldquo;Grazing - Summer
          Native&rdquo; — a known accounting gap, not zero real cost. Feed cost of gain for those lots is
          understated until Brenda books it.
        </p>
      )}

      <UnrealizedByLotChart
        data={marketPosition.map((r) => ({
          lot: r.lot,
          unrealized: r.unrealized ?? 0,
          lightCalfCaveat: r.lightCalfCaveat,
        }))}
      />
    </div>
  );
}

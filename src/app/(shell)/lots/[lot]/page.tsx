import { notFound } from "next/navigation";
import { getLotByNumber, getLotStatus, getCurrentLocations } from "./data/lot";
import { getPurchases } from "./data/purchases";
import { getDoctoringEvents, getDeathLog, getHeadAdjustments } from "./data/health";
import { getMoveHistory, getLotTransfers } from "./data/moves";
import { getSales } from "./data/sales";
import { getAuditLog } from "./data/audit";
import { Badge } from "@/components/ui/badge";
import { LotDetailTabs } from "./lot-detail-tabs";

export const dynamic = "force-dynamic";

/**
 * Phase 2: the per-lot drill-in the vanilla app's detailView (index.html:1199-1510) shows.
 * Read-only this phase -- see the Phase 2 plan for why Closeout/Feed Pen are deferred.
 * Keyed by lot_number (what /lots links by and what a human types into a URL), NOT the
 * same concept as /dashboard/lots/[lot] (the Unit Economics GL-rollup page, a different
 * data source and audience that happens to use the same URL shape).
 */
export default async function LotDetailPage({ params }: { params: Promise<{ lot: string }> }) {
  const { lot: lotParam } = await params;
  const lotNumber = decodeURIComponent(lotParam);

  const lot = await getLotByNumber(lotNumber);
  if (!lot || lot.is_test) notFound();

  const [status, locations, purchases, doctoring, deaths, headAdjustments, moves, transfers, sales, audit] = await Promise.all([
    getLotStatus(lot.id),
    getCurrentLocations(lot.id),
    getPurchases(lot.id),
    getDoctoringEvents(lot.id),
    getDeathLog(lot.id),
    getHeadAdjustments(lot.id),
    getMoveHistory(lot.id),
    getLotTransfers(lot.id),
    getSales(lot.id),
    getAuditLog(lot.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{lot.lot_number}</h1>
        <Badge variant={lot.closed_at ? "neutral" : "good"}>{lot.closed_at ? "Closed" : "Open"}</Badge>
        {lot.is_feed_pen ? <Badge variant="warning">Feed pen</Badge> : null}
      </div>

      <LotDetailTabs
        lot={lot}
        status={status}
        locations={locations}
        purchases={purchases}
        doctoring={doctoring}
        deaths={deaths}
        headAdjustments={headAdjustments}
        moves={moves}
        transfers={transfers}
        sales={sales}
        audit={audit}
      />
    </div>
  );
}

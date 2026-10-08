import { notFound } from "next/navigation";
import { getLotByNumber, getLotStatus, getCurrentLocations, getLotEditDetail } from "./data/lot";
import { getPurchases } from "./data/purchases";
import { getDoctoringEvents, getDeathLog, getHeadAdjustments } from "./data/health";
import { getMoveHistory, getLotTransfers } from "./data/moves";
import { getSales } from "./data/sales";
import { getAuditLog } from "./data/audit";
import { getActivePastures, getFieldActions, getMedicationCatalog } from "./data/reference";
import { getSession } from "@/lib/session";
import { canWriteLotEntries } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { LotDetailTabs } from "./lot-detail-tabs";
import { LotActions } from "./lot-actions";

export const dynamic = "force-dynamic";

/**
 * Phase 2 shipped this read-only (Currently In, Purchases, Animal Health, Moves, Sales, Audit
 * Log -- public/client-app/index.html:1199-1510). Phase 3 added write support for Animal Health
 * (new deaths, missing/stray head adjustments) and Moves (+ Move); Phase 4 added Doctoring direct
 * entry; Phase 5 adds the kebab menu's Edit/Duplicate/Close lot -- see the Phase 5 plan for why
 * Delete-test-lot, Purchases/Sales/Transfers/Closeout, and editing an existing doctoring/death
 * event stay deferred.
 */
export default async function LotDetailPage({ params }: { params: Promise<{ lot: string }> }) {
  const { lot: lotParam } = await params;
  const lotNumber = decodeURIComponent(lotParam);

  const lot = await getLotByNumber(lotNumber);
  if (!lot || lot.is_test) notFound();

  const [
    session,
    status,
    locations,
    purchases,
    doctoring,
    deaths,
    headAdjustments,
    moves,
    transfers,
    sales,
    audit,
    activePastures,
    fieldActions,
    medicationCatalog,
    editDetail,
  ] = await Promise.all([
    getSession(),
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
    getActivePastures(),
    getFieldActions(),
    getMedicationCatalog(),
    getLotEditDetail(lot.id),
  ]);
  const role = session?.user.role;
  const canWrite = role ? canWriteLotEntries(role) : false;
  const isOwner = role === "owner";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">{lot.lot_number}</h1>
          <Badge variant={lot.closed_at ? "neutral" : "good"}>{lot.closed_at ? "Closed" : "Open"}</Badge>
          {lot.is_feed_pen ? <Badge variant="warning">Feed pen</Badge> : null}
        </div>
        <LotActions lotNumber={lot.lot_number} lotId={lot.id} canWrite={canWrite} lotClosed={!!lot.closed_at} editDetail={editDetail} />
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
        activePastures={activePastures}
        fieldActions={fieldActions}
        medicationCatalog={medicationCatalog}
        canWrite={canWrite}
        isOwner={isOwner}
      />
    </div>
  );
}

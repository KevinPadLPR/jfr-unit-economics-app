import { redirect } from "next/navigation";
import { listGlLots } from "@/lib/data/cost-of-gain";

/**
 * "Lot Detail" has no page of its own -- it's the dynamic /lots/[lot] route --
 * so the client app's top bar (which can't compute a default lot itself, it's
 * a static sub-tab pointed at a fixed path) links here and this picks one: the
 * first open lot, same default the old sidebar nav used.
 */
export const dynamic = "force-dynamic";

export default function LotDetailRedirect() {
  const lots = listGlLots();
  const defaultLot = lots.find((l) => (l.status ?? "").toLowerCase() === "open")?.lot ?? lots[0]?.lot;
  redirect(defaultLot ? `/dashboard/lots/${encodeURIComponent(defaultLot)}` : "/dashboard/lots");
}

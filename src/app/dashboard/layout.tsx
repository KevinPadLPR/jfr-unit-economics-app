import type { ReactNode } from "react";
import { listGlLots } from "@/lib/data/cost-of-gain";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // "Lot Detail" has no page of its own (it's the dynamic /lots/[lot] route) --
  // land on the first open lot by default; the page's own dropdown picks any
  // other lot from there. A plain string is all that can cross the server/client
  // boundary here -- DashboardShell builds the actual nav (icons included) itself.
  const lots = listGlLots();
  const defaultLot = lots.find((l) => (l.status ?? "").toLowerCase() === "open")?.lot ?? lots[0]?.lot;

  return <DashboardShell defaultLot={defaultLot}>{children}</DashboardShell>;
}

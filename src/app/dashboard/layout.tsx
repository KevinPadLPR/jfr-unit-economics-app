import type { ReactNode } from "react";
import { Boxes, LayoutDashboard, TrendingUp, ClipboardList, LineChart, ListTree, FileText } from "lucide-react";
import { listGlLots } from "@/lib/data/cost-of-gain";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // "Lot Detail" has no page of its own (it's the dynamic /lots/[lot] route) --
  // land on the first open lot by default; the page's own dropdown picks any
  // other lot from there.
  const lots = listGlLots();
  const defaultLot = lots.find((l) => (l.status ?? "").toLowerCase() === "open")?.lot ?? lots[0]?.lot;

  const NAV = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/inventory", label: "Inventory", icon: Boxes },
    { href: "/dashboard/lots", label: "Master Lot Schedule", icon: ListTree },
    { href: defaultLot ? `/dashboard/lots/${encodeURIComponent(defaultLot)}` : "/dashboard/lots", label: "Lot Detail", icon: FileText },
    { href: "/dashboard/cost-of-gain", label: "Cost of Gain", icon: TrendingUp },
    { href: "/dashboard/lot-scorecard", label: "Lot Scorecard", icon: ClipboardList },
    { href: "/dashboard/market-position", label: "Market Position", icon: LineChart },
  ];

  return <DashboardShell nav={NAV}>{children}</DashboardShell>;
}

import type { ReactNode } from "react";
import Link from "next/link";
import { Boxes, LayoutDashboard, TrendingUp, ClipboardList, LineChart, ListTree, FileText, LogOut } from "lucide-react";
import { auth, signOut } from "@/auth";
import { listGlLots } from "@/lib/data/cost-of-gain";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  // "Lot Detail" has no page of its own (it's the dynamic /lots/[lot] route) --
  // land on the first open lot by default; the page's own dropdown picks any
  // other lot from there.
  const lots = listGlLots();
  const defaultLot = lots.find((l) => (l.status ?? "").toLowerCase() === "open")?.lot ?? lots[0]?.lot;

  const NAV = [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/inventory", label: "Inventory", icon: Boxes },
    { href: "/lots", label: "Master Lot Schedule", icon: ListTree },
    { href: defaultLot ? `/lots/${encodeURIComponent(defaultLot)}` : "/lots", label: "Lot Detail", icon: FileText },
    { href: "/cost-of-gain", label: "Cost of Gain", icon: TrendingUp },
    { href: "/lot-scorecard", label: "Lot Scorecard", icon: ClipboardList },
    { href: "/market-position", label: "Market Position", icon: LineChart },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex flex-col items-center gap-1 border-b border-sidebar-border px-4 py-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo, no benefit from next/image's raster optimizer */}
          <img src="/brand/logo-lockup.svg" alt="JFR Ranch" width={130} height={114} />
          <p className="text-center text-xs font-medium text-muted-foreground">
            Unit Economics &amp; Position Desk
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Icon className="size-4 text-muted-foreground" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-between gap-2 border-t border-sidebar-border p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {session?.user?.name ?? "Viewer"}
            </p>
            <p className="text-xs capitalize text-muted-foreground">{session?.user?.role ?? ""}</p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden p-8">{children}</main>
    </div>
  );
}

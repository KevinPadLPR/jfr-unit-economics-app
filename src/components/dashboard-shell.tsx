"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useClientSession } from "@/lib/useClientSession";

/**
 * Gates every /dashboard/* page -- no chrome of its own anymore. Navigation
 * lives entirely in the client app's own top bar now (public/client-app/
 * index.html's #dashboardSubtabs, one level up from this iframe): Overview,
 * Inventory, Master Lot Schedule, Lot Detail, Cost of Gain, Lot Scorecard,
 * Market Position, same text and order this sidebar used to render.
 *
 * Auth: there is no login screen of our own. Signed-out bounces the
 * top-level window to "/" (the client app, which owns the only login in
 * this deployment); a "rancher"-tier (client role "crew") session is routed
 * to /rancher within the same iframe, same as proxy.ts used to do
 * server-side before it was removed in favor of this client-side check.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const session = useClientSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (session.status === "signed-out") {
      const top = window.top ?? window;
      top.location.href = "/";
    } else if (session.status === "signed-in" && session.user.tier === "rancher") {
      router.replace("/rancher");
    }
  }, [session, router, pathname]);

  if (session.status !== "signed-in" || session.user.tier !== "admin") return null;

  return <div className="min-h-screen p-8">{children}</div>;
}

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { TopNav } from "@/components/app-shell/top-nav";
import { UserMenu } from "@/components/app-shell/user-menu";

/**
 * Shared chrome for every ported route (/lots, /approvals, /dashboard, and the
 * not-yet-built placeholders) -- the single highest-leverage piece of clean-code
 * restructuring in Phase 1: the vanilla app's manual clearAllNavActive()/hideAllViews()
 * class-juggling becomes real server-rendered conditional rendering, gated once here
 * instead of re-checked in every page.
 *
 * proxy.ts already redirects signed-out users to /login and crew-tier users to /rancher
 * before a request reaches this far; the checks below are a defensive second line (a
 * prefetch or a direct Server Component hit can in principle skip middleware), not the
 * primary gate.
 */
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.tier === "rancher") redirect("/rancher");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo, no benefit from next/image's raster optimizer */}
          <img src="/brand/logo-lockup.svg" alt="JFR Ranch" width={32} height={28} />
          <TopNav role={session.user.role} />
        </div>
        <UserMenu name={session.user.name} role={session.user.role} />
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

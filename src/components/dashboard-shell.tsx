"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, type LucideIcon } from "lucide-react";
import { useClientSession } from "@/lib/useClientSession";
import { createSharedClient } from "@/lib/supabase/shared";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Gates and frames every /dashboard/* page. There is no login screen of our own:
 * signed-out bounces the top-level window to "/" (the client app, which owns the
 * only login in this deployment); a "rancher"-tier (client role "crew") session
 * is routed to /rancher within the same iframe, same as proxy.ts used to do
 * server-side before it was removed in favor of this client-side check.
 */
export function DashboardShell({ nav, children }: { nav: NavItem[]; children: ReactNode }) {
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

  async function handleSignOut() {
    const supabase = createSharedClient();
    await supabase.auth.signOut();
    const top = window.top ?? window;
    top.location.href = "/";
  }

  if (session.status !== "signed-in" || session.user.tier !== "admin") return null;

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
          {nav.map(({ href, label, icon: Icon }) => (
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
            <p className="truncate text-sm font-medium text-sidebar-foreground">{session.user.name}</p>
            <p className="text-xs capitalize text-muted-foreground">{session.user.role}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden p-8">{children}</main>
    </div>
  );
}

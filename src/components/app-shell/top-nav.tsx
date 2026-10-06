import Link from "next/link";
import type { ClientRole } from "@/lib/roles";

interface NavItem {
  href: string;
  label: string;
  /** Mirrors the vanilla app's data-perm="office" nav gate (index.html:1035-1045) --
   * every role except "crew" sees these; crew never reaches this nav at all (proxy.ts
   * routes crew straight to /rancher), so in practice this only ever hides nothing for
   * an admin-tier viewer -- kept as an explicit flag anyway so a future tier change
   * can't silently show an office-only tab to someone who shouldn't see it. */
  officeOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/lots", label: "Lots" },
  { href: "/health", label: "Health" },
  { href: "/sales", label: "Moves & Sales", officeOnly: true },
  { href: "/inventory", label: "Inventory", officeOnly: true },
  { href: "/reports", label: "Reports" },
  { href: "/approvals", label: "Approvals", officeOnly: true },
  { href: "/dashboard", label: "Dashboard", officeOnly: true },
];

/**
 * Server Component -- the shared top nav for every (shell) route, replacing the vanilla
 * app's manual clearAllNavActive()/hideAllViews() class-juggling with real conditional
 * rendering (every role except crew sees office-only tabs; crew never reaches this nav).
 * Active-link styling only needs usePathname(), not a client-side nav rewrite, but that's
 * a small enough piece to add later -- plain links are correct and simple for Phase 1.
 */
export function TopNav({ role }: { role: ClientRole }) {
  const visible = NAV.filter((item) => !item.officeOnly || role !== "crew");

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {visible.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="shrink-0 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

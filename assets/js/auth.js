/**
 * Standalone auth/session handling for this app -- modeled on
 * public/client-app/index.html's own checkSession/onLoggedIn flow (around
 * line 6715), NOT on the superseded src/lib/useClientSession.ts /
 * dashboard-shell.tsx (those assumed this dashboard lived in an iframe
 * inside the client app and read a session the client app had already put
 * in localStorage). This app has its own login page and signs in for
 * itself, same Supabase project, same auth.users table and user_profiles
 * row every other client-app login uses.
 *
 * is_active is the authorization gate: current_user_role() returns NULL for
 * an inactive profile, so every RLS policy denies. Without this check a
 * disabled account would get a shell with every report empty and erroring.
 * Stop them at the door, same as the client app does.
 */
import { supabase } from "./supabase-client.js";
import { isClientRole, tierForRole } from "./roles.js";

const NAV_TABS = [
  { href: "/dashboard/overview.html", key: "overview", label: "Overview" },
  { href: "/dashboard/inventory.html", key: "inventory", label: "Inventory" },
  { href: "/dashboard/lots.html", key: "lots", label: "Master Lot Schedule" },
  { href: "/dashboard/lot-detail.html", key: "lot-detail", label: "Lot Detail" },
  { href: "/dashboard/cost-of-gain.html", key: "cost-of-gain", label: "Cost of Gain" },
  { href: "/dashboard/lot-scorecard.html", key: "lot-scorecard", label: "Lot Scorecard" },
  { href: "/dashboard/market-position.html", key: "market-position", label: "Market Position" },
];

async function loadProfile(user) {
  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .single();
  if (error || !profile) return null;
  if (!profile.is_active || !isClientRole(profile.role)) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    name: profile.full_name ?? user.email ?? "there",
    role: profile.role,
    tier: tierForRole(profile.role),
  };
}

/** Used by index.html (login) to skip the form if already signed in. */
export async function getSignedInUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  return loadProfile(session.user);
}

/**
 * Gates a protected page. `tier` is "admin" (every /dashboard/* page) or
 * "rancher" (rancher.html, which also welcomes "admin" -- office/owner/
 * accountant are allowed to view the read-only rancher page too, same as
 * rancher-header.tsx's RancherGate never redirected an admin session away).
 *
 * Resolves to the signed-in user, or redirects and never resolves (the page
 * should show nothing while the browser navigates away).
 */
export async function requireSession(tier) {
  const user = await getSignedInUser();
  if (!user) {
    window.location.href = "/index.html";
    return new Promise(() => {});
  }
  if (tier === "admin" && user.tier !== "admin") {
    window.location.href = "/rancher.html";
    return new Promise(() => {});
  }
  renderNav(user);
  return user;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "/index.html";
}

/** Builds the top nav chrome this app needs now that it's standalone, not
 * embedded in the client app's own iframe shell (there's no parent window
 * providing #dashboardSubtabs anymore -- see dashboard-shell.tsx's comment
 * for the exact tab list/order this replicates: Overview, Inventory,
 * Master Lot Schedule, Lot Detail, Cost of Gain, Lot Scorecard, Market
 * Position). This nav markup is new, not ported -- the Next.js version
 * deferred all of it to the host iframe. */
export function renderNav(user) {
  const mount = document.getElementById("app-nav");
  if (!mount) return;
  // Strip a trailing ".html" on both sides before comparing -- some static
  // hosts (e.g. the `serve` CLI's default "clean URLs" redirect) rewrite
  // /dashboard/overview.html to /dashboard/overview, and this still needs to
  // highlight the right tab either way.
  const current = window.location.pathname.split("/").pop().replace(/\.html$/, "");
  const tabsHtml = user.tier === "admin"
    ? NAV_TABS.map((t) => {
        const isActive = t.href.replace(/\.html$/, "").endsWith(current);
        return `<a href="${t.href}" class="${isActive ? "active" : ""}">${t.label}</a>`;
      }).join("")
    : "";

  mount.innerHTML = `
    <div class="app-nav-inner">
      <a href="${user.tier === "admin" ? "/dashboard/overview.html" : "/rancher.html"}" class="app-nav-brand">
        <img src="/public/brand/mark.svg" alt="" />
        <span>JFR Ranch — Position Desk</span>
      </a>
      <nav class="app-nav-tabs">${tabsHtml}</nav>
      <div class="app-nav-right">
        <span class="app-nav-user">Hi, <strong>${user.name}</strong> <span class="role-pill">${user.role}</span></span>
        <button type="button" class="btn btn-outline btn-sm" id="sign-out-btn">Sign out</button>
      </div>
    </div>`;
  document.getElementById("sign-out-btn")?.addEventListener("click", signOut);
}

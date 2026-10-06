import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isClientRole, tierForRole } from "@/lib/roles";

// Next.js 16 renamed middleware.ts -> proxy.ts (network boundary in front of the app).
//
// Dead code as of the client-app integration: the matcher below now excludes every
// path this function would otherwise see (/dashboard, /rancher, /login), so this
// never actually runs. Left in place, unexercised, rather than deleted, pending a
// decision on this file's disposition -- see dashboard-shell.tsx / rancher-header.tsx
// / useClientSession.ts for the client-side replacement and why server-side cookie
// auth can't work here (the client app's own supabase-js client persists its session
// to localStorage, not cookies, so this middleware never saw it log in to begin with).
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // "/" is the client app now (next.config.ts rewrites it to /client-app/index.html) -- it
  // has its own Supabase-based login and its own data-perm="office" role gate already; this
  // middleware has no business running in front of it, same reasoning as the client-app
  // exclusion in the matcher below.
  if (pathname === "/") return NextResponse.next();

  const isLoginRoute = pathname.startsWith("/login");

  const { supabaseResponse, supabase, user } = await updateSession(req);

  if (!user) {
    if (isLoginRoute) return supabaseResponse;
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  // Mirrors getSession()'s rule exactly: no row, inactive, or an unrecognized role all
  // read as "not logged in" -- never fall through to the dashboard on an ambiguous role.
  if (!profile || !profile.is_active || !isClientRole(profile.role)) {
    if (isLoginRoute) return supabaseResponse;
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  const tier = tierForRole(profile.role);

  if (isLoginRoute) {
    return NextResponse.redirect(new URL(tier === "rancher" ? "/rancher" : "/dashboard", req.nextUrl));
  }

  // Ranchers (client role "crew") get a lightweight read-only view (their open lots,
  // no $ or hedge data) rather than the full admin dashboard.
  if (tier === "rancher" && !pathname.startsWith("/rancher")) {
    return NextResponse.redirect(new URL("/rancher", req.nextUrl));
  }

  return supabaseResponse;
}

export const config = {
  // client-app excluded: it's the client's own cattle-management app (public/client-app, a git
  // submodule), served statically so it can live inside the Dashboard tab's iframe at the same
  // origin. It has its own Supabase-based login -- this gate has no business in front of it,
  // and letting this gate catch it just bounced every request to our /login instead.
  //
  // dashboard/rancher/login excluded too: this middleware's auth check relies on an
  // @supabase/ssr cookie session, but the client app's own login (public/client-app/
  // index.html) writes its session to localStorage via a plain supabase-js client, never
  // to a cookie -- so this middleware never actually saw a logged-in user and always
  // redirected to /login, even for someone already signed into the client app clicking
  // the Dashboard tab. DashboardShell / RancherGate (src/components/) now gate these
  // routes client-side by reading that same localStorage session directly, which is the
  // only way to actually share it with the client app.
  //
  // Also excluded: any request whose last path segment has a file extension -- static assets
  // under public/ (brand/*.svg, etc.) were falling through this same hole before client-app was
  // ever added (pre-existing, not specific to this submodule): a plain <img src="/brand/..."> is
  // not a page navigation, so redirecting it to /login just serves the login page's HTML back as
  // the "image" and it never renders -- that's the broken logo on the login screen itself.
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|favicon.ico|client-app|dashboard|rancher|login|.*\\.[\\w]+$).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isClientRole, tierForRole } from "@/lib/roles";

// Next.js 16 renamed middleware.ts -> proxy.ts (network boundary in front of the app).
//
// Phase 1 of the client-app-into-Next.js migration: this is back in active duty. It was
// disabled (matcher excluded every path it would see) while the client app's own
// vanilla-JS login -- which writes its session to localStorage, never a cookie -- was
// the only front door; this middleware could never see that login. Now that
// src/app/login/page.tsx (a real Next.js page, @supabase/ssr, writes a cookie) is the
// only login surface, the original reason for excluding every route is gone.
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
    // /lots is the new shell's default landing page -- the closest native analog to
    // the vanilla app's own default view (navLots is the first nav tab, active on load).
    return NextResponse.redirect(new URL(tier === "rancher" ? "/rancher" : "/lots", req.nextUrl));
  }

  // Ranchers (client role "crew") get a lightweight read-only view (their open lots,
  // no $ or hedge data) rather than the full admin dashboard.
  if (tier === "rancher" && !pathname.startsWith("/rancher")) {
    return NextResponse.redirect(new URL("/rancher", req.nextUrl));
  }

  return supabaseResponse;
}

export const config = {
  // client-app still excluded: public/client-app/ is the old vanilla app's files, kept on
  // disk for the not-yet-migrated tabs (Health/Sales/Inventory/Reports/Settings) but no
  // longer routed to from "/" -- nothing links to it from the new shell, but leaving the
  // path itself unguarded costs nothing and avoids reviving the old "this gate bounced a
  // static asset to /login" class of bug if something still references it directly.
  //
  // Any request whose last path segment has a file extension is excluded for the same
  // pre-existing reason as before: a plain <img src="/brand/..."> is not a page navigation,
  // and redirecting it to /login just serves back login-page HTML as the "image."
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|favicon.ico|client-app|.*\\.[\\w]+$).*)"],
};

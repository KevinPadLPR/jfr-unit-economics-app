import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isClientRole, tierForRole } from "@/lib/roles";

// Next.js 16 renamed middleware.ts -> proxy.ts (network boundary in front of the app).
// Auth is the client's own Supabase project (user_profiles / current_user_role(), see
// public/client-app/docs/security-model.md) -- not a separate login system. Office,
// owner and accountant get the full dashboard; crew gets redirected to /rancher,
// same as John's own app hides $ data from crew via its data-perm="office" CSS gate.
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
  // Also excluded: any request whose last path segment has a file extension -- static assets
  // under public/ (brand/*.svg, etc.) were falling through this same hole before client-app was
  // ever added (pre-existing, not specific to this submodule): a plain <img src="/brand/..."> is
  // not a page navigation, so redirecting it to /login just serves the login page's HTML back as
  // the "image" and it never renders -- that's the broken logo on the login screen itself.
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|favicon.ico|client-app|.*\\.[\\w]+$).*)"],
};

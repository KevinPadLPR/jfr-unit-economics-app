import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Next.js 16 renamed middleware.ts -> proxy.ts (network boundary in front of
// the app); this still wraps NextAuth's auth() the same way middleware.ts did.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;
  const isLoginRoute = pathname.startsWith("/login");

  if (!isLoggedIn && !isLoginRoute) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isLoggedIn && isLoginRoute) {
    return NextResponse.redirect(new URL(role === "rancher" ? "/rancher" : "/", req.nextUrl));
  }

  // Ranchers get a lightweight read-only view (their open lots, no $ or
  // hedge data) rather than the full admin dashboard — there's no data-entry
  // path here at all; field data comes from John's app, not this dashboard.
  if (isLoggedIn && role === "rancher" && !pathname.startsWith("/rancher")) {
    return NextResponse.redirect(new URL("/rancher", req.nextUrl));
  }
});

export const config = {
  // client-app excluded: it's the client's own cattle-management app (public/client-app, a git
  // submodule), served statically so it can live inside the Dashboard tab's iframe at the same
  // origin. It has its own Supabase-based login -- our NextAuth gate has no business in front of
  // it, and letting this gate catch it just bounced every request to our /login instead.
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|favicon.ico|client-app).*)"],
};

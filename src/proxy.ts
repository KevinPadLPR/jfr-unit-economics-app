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
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|favicon.ico).*)"],
};

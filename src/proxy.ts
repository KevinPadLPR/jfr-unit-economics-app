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

  // Rancher data-entry views/data are a later phase — for now, fence ranchers
  // out of the admin dashboards rather than showing them empty pages.
  if (isLoggedIn && role === "rancher" && !pathname.startsWith("/rancher")) {
    return NextResponse.redirect(new URL("/rancher", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|favicon.ico).*)"],
};

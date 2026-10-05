import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Standard @supabase/ssr middleware session-refresh pattern: a request-scoped
 * client whose cookie writes land on BOTH the incoming request (so this same
 * request sees the refreshed token) and the outgoing response (so the browser
 * does). Must call `getUser()` (not just read a cookie) -- it's the call that
 * actually talks to Supabase Auth and refreshes an expired token; skipping it
 * is the one way to end up silently logged out.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, supabase, user };
}

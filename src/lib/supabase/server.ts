import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Component / Server Action Supabase client. Setting cookies from a Server
 * Component itself is a no-op (Next.js forbids it outside a Route Handler/Server
 * Action) -- the `catch` below is exactly that case, and it's fine: proxy.ts
 * (middleware) already refreshes the session on every request, so a Server
 * Component only ever needs to read it, never write it.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component -- middleware handles the refresh.
          }
        },
      },
    },
  );
}

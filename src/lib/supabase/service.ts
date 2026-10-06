import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client for Server Components (src/lib/data/*.ts) -- uses the service_role key,
 * which bypasses RLS, because there is no per-request user session to scope these reads to:
 * auth is entirely client-side now (see useClientSession.ts / DashboardShell), read directly off
 * the client app's own localStorage session, and a Server Component has no access to that.
 * Gating happens in the UI (DashboardShell/RancherGate won't render without a valid session);
 * this key must never reach a "use client" file or the browser bundle -- SUPABASE_SERVICE_ROLE_KEY
 * is deliberately NOT NEXT_PUBLIC_-prefixed so Next.js never inlines it client-side.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

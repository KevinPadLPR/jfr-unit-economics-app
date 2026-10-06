import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client bypassing RLS entirely (service_role key) -- NOT the default anymore as
 * of the Phase 1 client-app migration (see plan "Phase 1 -- migrate the client app into the
 * Next.js dashboard"). src/lib/data/*.ts now uses the per-request user-scoped client
 * (src/lib/supabase/server.ts's createClient()) so reads respect RLS as the signed-in user --
 * required for anything that might sit in front of a SECURITY INVOKER RPC (see
 * public/client-app/docs/database.md rule 6), which this key would silently bypass the gate on.
 *
 * Keep this only for a read that's deliberately role-agnostic (e.g. public reference data with
 * no RLS policy at all) -- currently nothing in this repo needs that. This key must never reach
 * a "use client" file or the browser bundle -- SUPABASE_SERVICE_ROLE_KEY is deliberately NOT
 * NEXT_PUBLIC_-prefixed so Next.js never inlines it client-side.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

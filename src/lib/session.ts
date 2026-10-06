import { createClient } from "@/lib/supabase/server";
import { isClientRole, tierForRole, type ClientRole, type Tier } from "@/lib/roles";

export interface DashboardSession {
  user: {
    id: string;
    email: string | null;
    name: string;
    role: ClientRole;
    tier: Tier;
  };
}

/**
 * Server-side session read, restored now that login is a real Next.js page writing a
 * cookie (@supabase/ssr) instead of the vanilla client app's localStorage-only session.
 * Reads the same `user_profiles` row (by `id = auth.uid()`) proxy.ts already checked --
 * a little redundant per-request, but it keeps each Server Component self-sufficient
 * without threading resolved-role data through props. Returns null for no session, no
 * profile row, an inactive profile, or an unrecognized role: all of those should read as
 * "not logged in" here, same as `current_user_role()` returns NULL for all of them
 * server-side (RLS already enforces this; this is the UI mirror).
 */
export async function getSession(): Promise<DashboardSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name, role, is_active")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.is_active || !isClientRole(profile.role)) return null;

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
      name: profile.full_name ?? user.email ?? "there",
      role: profile.role,
      tier: tierForRole(profile.role),
    },
  };
}

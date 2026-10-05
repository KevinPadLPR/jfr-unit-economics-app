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
 * Drop-in replacement for NextAuth's `auth()`. Reads the same `user_profiles` row
 * (by `id = auth.uid()`) the client's own app reads after login -- see
 * public/client-app/index.html's `onLoggedIn()`. Returns null for no session, no
 * profile row, an inactive profile, or an unrecognized role: all of those should
 * read as "not logged in" here, same as `current_user_role()` returns NULL for
 * all of them server-side (RLS already enforces this; this is the UI mirror).
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

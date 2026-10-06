"use client";

import { useEffect, useState } from "react";
import { createSharedClient } from "@/lib/supabase/shared";
import { isClientRole, tierForRole, type ClientRole, type Tier } from "@/lib/roles";

export interface ClientSessionUser {
  id: string;
  email: string | null;
  name: string;
  role: ClientRole;
  tier: Tier;
}

export type ClientSessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: ClientSessionUser };

/**
 * Reads the session the client app's own login already put in localStorage --
 * see public/client-app/index.html and src/lib/supabase/shared.ts. Mirrors the
 * same "no row, inactive, or an unrecognized role all read as signed-out" rule
 * the client app's own RLS (`current_user_role()`) applies server-side.
 */
export function useClientSession(): ClientSessionState {
  const [state, setState] = useState<ClientSessionState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const supabase = createSharedClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setState({ status: "signed-out" });
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name, role, is_active")
        .eq("id", user.id)
        .single();

      if (!profile || !profile.is_active || !isClientRole(profile.role)) {
        if (!cancelled) setState({ status: "signed-out" });
        return;
      }

      if (!cancelled) {
        setState({
          status: "signed-in",
          user: {
            id: user.id,
            email: user.email ?? null,
            name: profile.full_name ?? user.email ?? "there",
            role: profile.role,
            tier: tierForRole(profile.role),
          },
        });
      }
    }

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => load());

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

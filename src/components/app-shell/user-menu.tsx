import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClientRole } from "@/lib/roles";

/**
 * Server Component (the sign-out button is a plain <form action> Server Action, no client
 * JS needed) -- mirrors the vanilla app's "Name menu" (index.html:1047-1053: role badge,
 * Settings, Sign out, tucked behind the user's name so the tab row fits). Settings itself
 * is a future-phase placeholder here, same as the other not-yet-ported tabs.
 */
export function UserMenu({ name, role }: { name: string; role: ClientRole }) {
  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">
        {name} <span className="capitalize text-foreground">({role})</span>
      </span>
      <Link href="/settings" className="text-muted-foreground hover:text-foreground">
        Settings
      </Link>
      <form action={signOut}>
        <button type="submit" className="text-muted-foreground hover:text-foreground">
          Sign out
        </button>
      </form>
    </div>
  );
}

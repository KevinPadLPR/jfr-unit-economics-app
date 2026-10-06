"use client";

import { useEffect, type ReactNode } from "react";
import { useClientSession } from "@/lib/useClientSession";
import { createSharedClient } from "@/lib/supabase/shared";
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Gates /rancher the same way DashboardShell gates /dashboard/*: no session ->
 * bounce the top-level window to "/" (the client app's own login). Unlike
 * DashboardShell this never redirects an "admin"-tier session away -- office/
 * owner/accountant are welcome to view the read-only rancher page too. Wraps
 * the whole card body (not just the header) so the lots table never flashes
 * on screen before a signed-out redirect fires.
 */
export function RancherGate({ children }: { children: ReactNode }) {
  const session = useClientSession();

  useEffect(() => {
    if (session.status === "signed-out") {
      const top = window.top ?? window;
      top.location.href = "/";
    }
  }, [session]);

  async function handleSignOut() {
    const supabase = createSharedClient();
    await supabase.auth.signOut();
    const top = window.top ?? window;
    top.location.href = "/";
  }

  if (session.status !== "signed-in") return null;

  return (
    <>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Hi, {session.user.name}</CardTitle>
          <CardDescription>Your open lots — read-only</CardDescription>
        </div>
        <Button type="button" variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      </CardHeader>
      {children}
    </>
  );
}

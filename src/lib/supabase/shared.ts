import { createClient } from "@supabase/supabase-js";

/**
 * Plain browser client using supabase-js's default localStorage session storage --
 * deliberately NOT @supabase/ssr's cookie-based client. public/client-app/index.html
 * (the client's own app: same Supabase project, same origin, loaded via its own
 * `window.supabase.createClient(...)` UMD call) already wrote a session to
 * localStorage under this same default key by the time our dashboard loads in its
 * iframe, so this reads that session directly. There is no login flow here and no
 * server-side session of our own -- the client app is the only place anyone signs in.
 */
export function createSharedClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

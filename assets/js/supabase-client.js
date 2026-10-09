/**
 * Browser-side Supabase client -- anon/publishable key only, same tier the
 * client's own public/client-app/index.html hardcodes (see its <script>
 * block around line 6247). Every read in this app goes through this client
 * and relies entirely on the project's existing RLS policies (tied to
 * current_user_role()) to scope what a signed-in user can see.
 *
 * SECURITY: never import the service_role key here or in any file loaded by
 * the browser. That key bypasses RLS entirely and must stay server-only
 * (there is no server in this app, so it must simply never appear here).
 *
 * Values copied verbatim from .env.local's NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY -- same project, same public anon key
 * already shipped inside public/client-app/index.html.
 */
const SUPABASE_URL = "https://xpfmebdzcxorvwikfvtj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_LhyJ7-bxebSa7HuRTxjmBQ__73Oc-66";

if (!window.supabase) {
  throw new Error("Supabase UMD library not available -- check the CDN <script> tag and network access.");
}

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

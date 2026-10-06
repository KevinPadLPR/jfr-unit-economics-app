import { redirect } from "next/navigation";

/**
 * Replaces next.config.ts's old rewrite to public/client-app/index.html. By the time this
 * renders, proxy.ts has already resolved auth (redirected signed-out to /login, crew-tier to
 * /rancher) -- an authenticated admin-tier user reaching "/" just needs a default landing
 * page, same role /lots plays as the vanilla app's own default view (navLots, active on load).
 */
export default function RootPage() {
  redirect("/lots");
}

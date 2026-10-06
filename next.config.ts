import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 1 of the client-app-into-Next.js migration: "/" is a real Next.js route again
  // (src/app/page.tsx) -- public/client-app/index.html is no longer rewritten to from here.
  // It stays on disk (not yet deleted) for the tabs Phase 1 doesn't port
  // (Health/Sales/Inventory/Reports/Settings), but nothing in this app links to it anymore.
};

export default nextConfig;

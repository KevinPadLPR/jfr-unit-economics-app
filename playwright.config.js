// @ts-check
import { defineConfig } from "@playwright/test";

/**
 * Smoke-tests the static site -- no bundler, nothing to build first. Point
 * `webServer` at a plain static file server serving the repo root (this app
 * has no API routes of its own; every data call goes straight to Supabase
 * from the browser).
 */
export default defineConfig({
  testDir: "./tests",
  // Generous on purpose: the Overview/Scorecard pages faithfully port the
  // Next.js version's per-lot query loops (N+1-shaped on purpose, see
  // assets/js/data/overview.js's header comment) -- from a browser, over a
  // real network, against every open lot in production, that's legitimately
  // several seconds, not a bug to "fix" here.
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false, // all specs share one signed-in session via storageState
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    actionTimeout: 20_000,
  },
  webServer: {
    command: "npx serve . -l 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 20_000,
  },
});

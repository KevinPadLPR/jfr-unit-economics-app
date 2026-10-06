import { defineConfig } from "@playwright/test";

// ============================================================================
// HARD RULE, non-negotiable: this points at a LOCAL Next.js instance, but that
// instance's data layer still talks to the CLIENT'S REAL PRODUCTION SUPABASE
// PROJECT -- there is no staging database. Every spec under e2e/ must be
// READ-ONLY: log in, navigate, assert something renders. NEVER click Approve,
// NEVER click Reject, NEVER submit a form that writes. If a test needs to
// prove a write control exists, assert `.toBeVisible()`/`.toBeEnabled()` and
// stop there -- do not click it. See "Phase 1 -- migrate the client app into
// the Next.js dashboard" plan, Testing section, for the full reasoning.
// ============================================================================
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Low worker count on purpose: this is exercising real production Supabase reads,
  // not a disposable test database -- no need to hammer it concurrently.
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -- -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

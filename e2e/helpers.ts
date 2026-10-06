import type { Page } from "@playwright/test";

/**
 * Only the `accountant` credential is known-good in this environment (verified earlier in
 * this engagement against the client's real Supabase project) -- it's also the right
 * default for read-only specs, since the client's own RLS already provably refuses it any
 * write, so a spec using it can never accidentally mutate production even if it tried.
 *
 * `office`/`owner` and `crew` credentials are NOT provided here (none were given) -- specs
 * that need them read from env vars and skip themselves with a clear reason if unset, rather
 * than inventing a test account. See the Testing section of the Phase 1 plan for why seeding
 * a new account needs John's explicit approval first (production data change).
 */
export const ACCOUNTANT = {
  email: process.env.E2E_ACCOUNTANT_EMAIL ?? "ryan@longpointresources.com",
  password: process.env.E2E_ACCOUNTANT_PASSWORD ?? "password1",
};
export const OFFICE = process.env.E2E_OFFICE_EMAIL
  ? { email: process.env.E2E_OFFICE_EMAIL, password: process.env.E2E_OFFICE_PASSWORD ?? "" }
  : null;
export const CREW = process.env.E2E_CREW_EMAIL
  ? { email: process.env.E2E_CREW_EMAIL, password: process.env.E2E_CREW_PASSWORD ?? "" }
  : null;

export async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Either /lots (admin tier) or /rancher (crew/"rancher" tier) -- never /login.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

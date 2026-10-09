// @ts-check
import { test, expect } from "@playwright/test";

/**
 * Read-only smoke suite against the real JFR Ranch Supabase project (there is
 * no staging environment). Signs in once as a read-only `accountant`-role
 * test account and asserts each ported page renders its key content without
 * an error banner. Never clicks a write control -- this dashboard has none,
 * so that's naturally satisfied, but these specs are written to only ever
 * call .click() on nav links/filters, never a submit button other than the
 * login form itself.
 *
 * Credentials come from the environment, not hardcoded here -- see
 * tests/README.md for the account these should point at.
 */
const EMAIL = process.env.TEST_ACCOUNTANT_EMAIL;
const PASSWORD = process.env.TEST_ACCOUNTANT_PASSWORD;

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "Set TEST_ACCOUNTANT_EMAIL and TEST_ACCOUNTANT_PASSWORD (see tests/README.md) before running this suite."
    );
  }
});

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
  // Already-signed-in browsers get redirected instantly; only fill the form
  // if it's actually there.
  const emailField = page.locator("#login-email");
  if (await emailField.isVisible().catch(() => false)) {
    await emailField.fill(/** @type {string} */ (EMAIL));
    await page.locator("#login-password").fill(/** @type {string} */ (PASSWORD));
    await page.locator("#login-submit").click();
  }
  await page.waitForURL(/dashboard\/overview\.html|rancher\.html/, { timeout: 15_000 });
});

test("overview page renders stat tiles and charts", async ({ page }) => {
  await page.goto("/dashboard/overview.html");
  await expect(page.locator("h1")).toHaveText("Overview");
  await expect(page.locator(".stat-tile").first()).toBeVisible();
  await expect(page.locator(".notice-warning")).toHaveCount(0);
});

test("cost of gain page renders for the default lot", async ({ page }) => {
  await page.goto("/dashboard/cost-of-gain.html");
  await expect(page.locator("h1")).toHaveText("Cost of Gain");
  await expect(page.locator("#lot-picker select")).toBeVisible();
  // Either real cost tiles, or an explicit "report unavailable" notice -- both
  // are valid states, a silent blank page is not.
  await expect(page.locator(".stat-tile, .notice-warning").first()).toBeVisible();
});

test("inventory page renders a month snapshot", async ({ page }) => {
  await page.goto("/dashboard/inventory.html");
  await expect(page.locator("h1")).toHaveText("Inventory");
  await expect(page.locator(".stat-tile, .notice-warning").first()).toBeVisible();
});

test("master lot schedule lists lots and filters", async ({ page }) => {
  await page.goto("/dashboard/lots.html");
  await expect(page.locator("h1")).toHaveText("Master Lot Schedule");
  await expect(page.locator("table.data-table tbody tr").first()).toBeVisible();
  const countText = await page.locator("#filtered-count").textContent();
  expect(countText).toMatch(/\d+ of \d+ lots/);
});

test("lot detail redirects to a default lot and renders its sheet", async ({ page }) => {
  await page.goto("/dashboard/lot-detail.html");
  await page.waitForURL(/lot-detail\.html\?lot=/, { timeout: 15_000 });
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator(".stat-tile").first()).toBeVisible();
});

test("lot scorecard renders the comparison table", async ({ page }) => {
  await page.goto("/dashboard/lot-scorecard.html");
  await expect(page.locator("h1")).toHaveText("Lot Scorecard");
  await expect(page.locator("table.data-table tbody tr").first()).toBeVisible();
});

test("market position renders the unrealized table", async ({ page }) => {
  await page.goto("/dashboard/market-position.html");
  await expect(page.locator("h1")).toHaveText("Market Position");
  await expect(page.locator("table.data-table")).toBeVisible();
});

test("rancher view is reachable even for an admin-tier account", async ({ page }) => {
  await page.goto("/rancher.html");
  await expect(page.locator(".card-title").first()).toContainText("Hi,");
  await expect(page.locator("table.data-table")).toBeVisible();
});

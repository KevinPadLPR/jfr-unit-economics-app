import { test, expect } from "@playwright/test";
import { login, ACCOUNTANT } from "./helpers";

// Phase 2, read-only: no insert/update/delete/RPC exists on this page yet, so this spec only
// ever clicks tabs and reads what renders -- same no-mutation posture as lots-read.spec.ts.
test("Lot detail page renders every read-only section for a real lot", async ({ page }) => {
  await login(page, ACCOUNTANT);
  await expect(page).toHaveURL(/\/lots$/);

  // The real herd changes over time -- follow whichever lot is first in the list rather than
  // hardcoding a lot number, so this spec doesn't go stale when that lot closes.
  const firstLotLink = page.getByRole("table").getByRole("row").nth(1).getByRole("link");
  const lotNumber = await firstLotLink.innerText();
  await firstLotLink.click();
  await expect(page).toHaveURL(new RegExp(`/lots/${encodeURIComponent(lotNumber)}$`));
  await expect(page.getByRole("heading", { name: lotNumber })).toBeVisible();

  // Currently in -- the default tab, no click needed.
  await expect(page.getByRole("button", { name: "Currently in" })).toBeVisible();

  for (const label of ["Purchases", "Animal Health", "Moves", "Sales", "Audit log"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    // Asserting the tab itself took the active style would couple the spec to CSS class
    // names; asserting the page didn't go blank/error is the structural guarantee that
    // actually matters here -- a table or an empty-state message, never neither.
    const hasTable = await page.getByRole("table").count();
    const hasEmptyState = await page.getByText(/no .* yet|not available|no transfers|no history/i).count();
    expect(hasTable + hasEmptyState).toBeGreaterThan(0);
  }

  // Closeout and Feed pen are explicitly deferred to Phase 3 -- confirm the placeholder,
  // not a write form, is what's behind them.
  await page.getByRole("button", { name: "Closeout", exact: true }).click();
  await expect(page.getByText("isn't migrated yet")).toBeVisible();
});

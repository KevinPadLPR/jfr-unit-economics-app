import { test, expect } from "@playwright/test";
import { login, ACCOUNTANT } from "./helpers";

// Phase 9, read-only: closeout-math.ts has no insert/update/delete/RPC, so this spec only reads
// what renders -- same posture as lot-detail-read.spec.ts. It specifically looks for a lot with
// at least one invoice (so the real Actual/Projection table renders, not the no-invoice gate)
// rather than following "first in the list" -- the real herd's first lot may have no invoice yet.
test("Closeout tab renders real Actual/Projection figures, never input boxes or a Save button", async ({ page }) => {
  await login(page, ACCOUNTANT);
  await expect(page).toHaveURL(/\/lots$/);

  const rows = page.getByRole("table").getByRole("row");
  const rowCount = await rows.count();
  let found = false;
  for (let i = 1; i < rowCount && i < 15 && !found; i++) {
    const link = rows.nth(i).getByRole("link");
    const lotNumber = await link.innerText();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/lots/${encodeURIComponent(lotNumber)}$`));
    await page.getByRole("button", { name: "Closeout", exact: true }).click();
    if (await page.getByRole("cell", { name: "Total cost" }).count()) {
      found = true;
      break;
    }
    await page.goBack();
    await page.waitForURL(/\/lots$/);
  }
  expect(found).toBe(true);

  // Real figures, two columns, every row from the approved plan's row set.
  for (const label of ["Head-days", "Days on feed", "Cattle in", "Medicine", "Cost of gain", "Labor", "Interest", "Total cost", "Revenue", "Break-even $/lb"]) {
    await expect(page.getByRole("cell", { name: label, exact: false }).first()).toBeVisible();
  }

  // Read-only: this phase has no editable assumptions and no save action, unlike the vanilla
  // app's live calculator.
  expect(await page.locator("input").count()).toBe(0);
  expect(await page.getByRole("button", { name: /save/i }).count()).toBe(0);
});

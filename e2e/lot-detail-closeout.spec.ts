import { test, expect, type Page } from "@playwright/test";
import { login, ACCOUNTANT, OFFICE } from "./helpers";

// Phase 9 (read-only Actual/Projection) + Phase 10 (Save Assumptions) -- closeout-math.ts and
// actions/closeout.ts have no RPC, so the only write this suite could ever trigger is the one
// `.update(lots)` Phase 10 added; see the office-only spec below for how it avoids ever changing
// a real lot's saved assumptions. Both specs look for a lot with at least one invoice (so the
// real Actual/Projection table renders, not the no-invoice gate) rather than following "first in
// the list" -- the real herd's first lot may have no invoice yet.
async function openFirstLotWithCloseout(page: Page): Promise<string> {
  const rows = page.getByRole("table").getByRole("row");
  const rowCount = await rows.count();
  for (let i = 1; i < rowCount && i < 15; i++) {
    const link = rows.nth(i).getByRole("link");
    const lotNumber = await link.innerText();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/lots/${encodeURIComponent(lotNumber)}$`));
    await page.getByRole("button", { name: "Closeout", exact: true }).click();
    if (await page.getByRole("cell", { name: "Total cost" }).count()) return lotNumber;
    await page.goBack();
    await page.waitForURL(/\/lots$/);
  }
  throw new Error("No lot among the first 15 in the list has an invoice yet -- the Closeout table never rendered.");
}

test("accountant sees real Actual/Projection figures, never input boxes or a Save button", async ({ page }) => {
  await login(page, ACCOUNTANT);
  await expect(page).toHaveURL(/\/lots$/);
  await openFirstLotWithCloseout(page);

  // Real figures, two columns, every row from the approved plan's row set.
  for (const label of ["Head-days", "Days on feed", "Cattle in", "Medicine", "Cost of gain", "Labor", "Interest", "Total cost", "Revenue", "Break-even $/lb"]) {
    await expect(page.getByRole("cell", { name: label, exact: false }).first()).toBeVisible();
  }

  // Read-only: accountant has no write access, so none of Phase 10's form appears either.
  expect(await page.locator("input").count()).toBe(0);
  expect(await page.getByRole("button", { name: /save/i }).count()).toBe(0);
});

test("office sees the Working assumptions form and a no-op save round-trips cleanly", async ({ page }) => {
  test.skip(!OFFICE, "requires E2E_OFFICE_EMAIL/E2E_OFFICE_PASSWORD -- no office/owner test account provided yet");
  await login(page, OFFICE!);
  await openFirstLotWithCloseout(page);

  await expect(page.getByText("Working assumptions")).toBeVisible();
  const saveButton = page.getByRole("button", { name: "Save to lot" });
  await expect(saveButton).toBeVisible();

  // This is real production data with no staging environment -- saving back the exact values the
  // form was prefilled with (a no-op save) proves the round-trip works without ever changing a
  // real lot's saved assumptions. Read every field before touching anything.
  const totalCostBefore = await page.getByRole("cell", { name: "Total cost" }).locator("..").allInnerTexts();

  await saveButton.click();
  await expect(page.getByText(/assumptions saved|nothing was saved/i)).toBeVisible();

  const totalCostAfter = await page.getByRole("cell", { name: "Total cost" }).locator("..").allInnerTexts();
  expect(totalCostAfter).toEqual(totalCostBefore);
});

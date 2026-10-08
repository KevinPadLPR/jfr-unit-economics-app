import { test, expect } from "@playwright/test";
import { login, ACCOUNTANT, OFFICE } from "./helpers";

// Phase 3/4's write controls (Record deaths / Write off missing / Stray returned / + Move /
// Doctoring + New) are never clicked by any Playwright spec -- this one only ever asserts
// visibility, same no-mutation rule as every other spec in this suite (see playwright.config.ts).

test("accountant sees Animal Health and Moves read-only, with none of the new write controls", async ({ page }) => {
  await login(page, ACCOUNTANT);
  const firstLotLink = page.getByRole("table").getByRole("row").nth(1).getByRole("link");
  const lotNumber = await firstLotLink.innerText();
  await firstLotLink.click();
  await expect(page).toHaveURL(new RegExp(`/lots/${encodeURIComponent(lotNumber)}$`));

  await page.getByRole("button", { name: "Animal Health", exact: true }).click();
  await expect(page.getByRole("button", { name: /record deaths/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /write off missing/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /stray returned/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /\+ New/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Moves", exact: true }).click();
  await expect(page.getByRole("button", { name: /\+ Move/ })).toHaveCount(0);
});

test("office sees the new write controls on Animal Health and Moves (never clicked)", async ({ page }) => {
  test.skip(!OFFICE, "requires E2E_OFFICE_EMAIL/E2E_OFFICE_PASSWORD -- no office/owner test account provided yet");
  await login(page, OFFICE!);
  const firstLotLink = page.getByRole("table").getByRole("row").nth(1).getByRole("link");
  await firstLotLink.click();

  await page.getByRole("button", { name: "Animal Health", exact: true }).click();
  await expect(page.getByRole("button", { name: /record deaths/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /write off missing/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /stray returned/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /\+ New/ })).toBeVisible();

  await page.getByRole("button", { name: "Moves", exact: true }).click();
  await expect(page.getByRole("button", { name: /\+ Move/ })).toBeVisible();
});

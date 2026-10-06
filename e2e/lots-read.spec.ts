import { test, expect } from "@playwright/test";
import { login, ACCOUNTANT } from "./helpers";

test("Lots page renders the real operational lot list", async ({ page }) => {
  await login(page, ACCOUNTANT);
  await expect(page).toHaveURL(/\/lots$/);
  await expect(page.getByRole("heading", { name: "Lots" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  // At least one row -- the ranch has open lots as a baseline fact, not a specific count
  // that would make this spec flaky as the real herd changes.
  expect(await page.getByRole("row").count()).toBeGreaterThan(1); // header row + at least one lot
});

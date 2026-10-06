import { test, expect } from "@playwright/test";
import { login, ACCOUNTANT, OFFICE, CREW } from "./helpers";

test.describe("nav visibility by role", () => {
  test("accountant sees every office-gated tab, including Approvals and Dashboard", async ({ page }) => {
    await login(page, ACCOUNTANT);
    await expect(page.getByRole("link", { name: "Approvals" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Lots" })).toBeVisible();
  });

  test("accountant sees the Approvals queue but not Approve/Reject controls", async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.getByRole("link", { name: "Approvals" }).click();
    await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
    await expect(page.getByRole("button", { name: /approve selected/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject" })).toHaveCount(0);
  });

  test("office sees Approve/Reject controls on postable rows (never clicked)", async ({ page }) => {
    // Note the per-test skip (not a bare test.skip() between tests, which applies to the
    // whole describe block in Playwright, not just the next test -- confirmed the hard way).
    test.skip(!OFFICE, "requires E2E_OFFICE_EMAIL/E2E_OFFICE_PASSWORD -- no office/owner test account provided yet");
    await login(page, OFFICE!);
    await page.getByRole("link", { name: "Approvals" }).click();
    const approveButton = page.getByRole("button", { name: /approve selected/i });
    // Only asserts the control exists and is interactable -- never clicks it (see
    // playwright.config.ts's no-mutation rule).
    await expect(approveButton).toBeVisible();
  });

  test("crew is routed to /rancher and never sees the office-gated nav at all", async ({ page }) => {
    test.skip(!CREW, "requires E2E_CREW_EMAIL/E2E_CREW_PASSWORD -- no crew test account provided yet");
    await login(page, CREW!);
    await expect(page).toHaveURL(/\/rancher/);
    await expect(page.getByRole("link", { name: "Approvals" })).toHaveCount(0);
  });
});

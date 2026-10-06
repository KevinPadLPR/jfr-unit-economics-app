import { test, expect } from "@playwright/test";
import { login, ACCOUNTANT } from "./helpers";

// READ-ONLY. See playwright.config.ts's no-mutation rule -- this spec never selects a
// checkbox, never clicks Approve/Reject (accountant can't see those controls anyway, but
// the rule holds regardless of role).
test("Approvals queue renders without error against the real queue", async ({ page }) => {
  await login(page, ACCOUNTANT);
  await page.getByRole("link", { name: "Approvals" }).click();

  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
  // Structural assertion, not an exact row count -- the real queue changes as the ranch
  // works through it, so pinning a count would make this spec flaky by design. Either a
  // populated table or the explicit "Nothing pending" empty state is a pass; anything
  // else (an unhandled error boundary, a blank page) is not.
  const emptyState = page.getByText("Nothing pending.");
  const table = page.getByRole("table");
  await expect(emptyState.or(table)).toBeVisible();
});

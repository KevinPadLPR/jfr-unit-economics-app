import { test, expect } from "@playwright/test";
import { login, ACCOUNTANT } from "./helpers";

// Regression guard: /dashboard moved from its own iframe-free-but-separately-gated layout
// into the shared (shell) route group during Phase 1 (same URL, now shares TopNav/UserMenu
// instead of having no chrome of its own) -- this confirms it still renders real content,
// not that anything about its own data/behavior changed.
test("Dashboard overview still renders after the move into the shared shell", async ({ page }) => {
  await login(page, ACCOUNTANT);
  await page.getByRole("link", { name: "Dashboard" }).click();
  // Generously long: this page's data layer does an N+1 query per open lot (pre-existing,
  // not introduced by this phase -- see the comment on OverviewPage), observed to take
  // ~7s against the real production data. A real timeout regression should still fail
  // well within this.
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

import { test, expect } from "@playwright/test";
test("protected dashboard redirects to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});
test("password recovery is accessible", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /send reset link/i })).toBeVisible();
});

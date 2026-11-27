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

test.describe("mobile login layout", () => {
  test.use({ hasTouch: true });

  test("keeps the checkbox square and form links on one line", async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 568 });
      await page.goto("/login");

      const checkbox = page.getByRole("checkbox", { name: "Remember me" });
      const remember = page.locator('label[for="rememberMe"]');
      const forgot = page.getByRole("link", { name: "Forgot password?" });
      const box = await checkbox.boundingBox();
      const label = await remember.boundingBox();
      const link = await forgot.boundingBox();
      expect(box).not.toBeNull();
      expect(label).not.toBeNull();
      expect(link).not.toBeNull();
      expect(box!.height).toBe(box!.width);
      expect(label!.height).toBeGreaterThanOrEqual(44);
      expect(link!.height).toBe(44);
      expect(label!.x + label!.width).toBeLessThanOrEqual(link!.x);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

      await expect(checkbox).toBeChecked();
      await remember.click();
      await expect(checkbox).not.toBeChecked();
      await page.getByRole("link", { name: "Terms", exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("link", { name: "Terms", exact: true })).toBeInViewport();
    }
  });
});

import { test, expect } from "../fixtures/identity";
import { signIn } from "../helpers/browser";

test("anonymous root navigation goes to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("authenticated root goes to dashboard and UI logout prevents protected re-entry", async ({
  page,
  identity,
}) => {
  await signIn(page, identity);
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test.describe("viewer authorization", () => {
  test.use({ role: "viewer" });
  test("direct administrator URL is denied and dashboard return remains available", async ({
    page,
    identity,
  }) => {
    await signIn(page, identity);
    await page.goto("/settings/users");
    await expect(page).toHaveURL(/\/forbidden$/);
    await expect(page.getByText("Access denied", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

import { test, expect } from "@playwright/test";

test("login validates required fields and password length before sending credentials", async ({
  page,
}) => {
  let submissions = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/sign-in/email")) submissions++;
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter your email address.", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter your password.", { exact: true })).toBeVisible();
  await page.getByLabel("Email address", { exact: true }).fill("invalid");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Passwords are at least 12 characters.", { exact: true }),
  ).toBeVisible();
  expect(submissions).toBe(0);
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
});

test("reset form blocks mismatched passwords without sending the reset token", async ({ page }) => {
  let submissions = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/auth/reset-password")) submissions++;
  });
  await page.goto("/reset-password?token=synthetic-invalid-token");
  await page.getByLabel("New password", { exact: true }).fill("Synthetic-password-one");
  await page.getByLabel("Confirm password", { exact: true }).fill("Synthetic-password-two");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText("Passwords do not match.", { exact: true })).toBeVisible();
  expect(submissions).toBe(0);
});

test("legal pages are reachable from the sign-in screen", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: "Terms", exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

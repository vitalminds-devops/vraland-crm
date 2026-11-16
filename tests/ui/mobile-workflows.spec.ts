import { test, expect } from "../fixtures/identity";
import { query, signIn } from "../helpers/browser";

test.setTimeout(120_000);

test("mobile navigation and theme remain usable across routes", async ({ page, identity }) => {
  await signIn(page, identity);
  await page.goto("/dashboard");
  const toggle = page.getByRole("button", { name: "Open navigation", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Contacts & leads", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  const theme = await page.evaluate(() => localStorage.getItem("vra-theme"));
  expect(["light", "dark"]).toContain(theme);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*\bdark\b)/);
});

test("mobile user can create a task and save a profile using visible controls", async ({
  page,
  identity,
}) => {
  await signIn(page, identity);
  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Mobile follow up");
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: "Mobile follow up" })).toBeVisible();
  expect(
    await query("select title from tasks where organization_id=$1", [identity.organizationId]),
  ).toEqual([{ title: "Mobile follow up" }]);
  await page.goto("/account");
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Playwright");
  await page.getByLabel("First name", { exact: true }).fill("Mobile");
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Mobile");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Mobile");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

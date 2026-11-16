import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

function pages(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? pages(join(directory, entry.name))
      : entry.name === "page.tsx"
        ? [join(directory, entry.name)]
        : [],
  );
}
const crm = join("app", "(crm)");
const routes = pages(crm).map((file) =>
  file
    .slice(crm.length)
    .replaceAll("\\", "/")
    .replace(/\/page\.tsx$/, ""),
);
for (const route of routes.filter(
  (route) =>
    route.includes("[") || ["/reports", "/settings/activity", "/forbidden"].includes(route),
)) {
  test(`anonymous direct dynamic/alias access ${route}`, async ({ page }) => {
    const concrete = route.replace(/\[[^\]]+\]/g, "00000000-0000-4000-8000-000000000001");
    await page.goto(concrete);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  });
}

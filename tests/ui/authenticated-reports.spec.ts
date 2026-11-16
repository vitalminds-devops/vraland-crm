import { test, expect } from "../fixtures/identity";
import { signIn } from "../helpers/browser";

test.setTimeout(90_000);

for (const [path, heading] of [
  ["/dashboard", "Dashboard"],
  ["/reports/sales", "Sales performance"],
  ["/reports/forecast", "Sales forecasting"],
  ["/reports/conversion", "Lead conversion"],
  ["/reports/agents", "Agent leaderboard"],
] as const) {
  test(`isolated administrator can render ${path}`, async ({ page, identity }) => {
    await signIn(page, identity);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

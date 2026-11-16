import { test, expect } from "../fixtures/identity";
import { Client } from "pg";
test.setTimeout(90000);
test("development created through UI persists with audit history", async ({ page, identity }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: false }).fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  const response = page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email"));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
  await page.goto("/developments/new");
  const name = "Playwright " + identity.organizationId;
  await page.getByRole("textbox", { name: "Name *", exact: true }).fill(name);
  await page.getByRole("button", { name: "Save development" }).click();
  await expect(page).toHaveURL(/developments\/[0-9a-f-]+$/, { timeout: 20000 });
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      "select id,name,status from developments where organization_id=$1",
      [identity.organizationId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name, status: "planning" });
    const audit = await client.query(
      "select action from audit_logs where organization_id=$1 and entity_id=$2",
      [identity.organizationId, rows[0].id],
    );
    expect(audit.rows).toContainEqual({ action: "create" });
  } finally {
    await client.end();
  }
});

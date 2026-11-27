import { test, expect } from "../fixtures/identity";
import { seedStages, withDatabase } from "../helpers/database";
import { randomUUID } from "node:crypto";

test.use({ role: "super-administrator" });
test.setTimeout(180_000);

test.beforeEach(async () => {
  await withDatabase(async (client) => {
    const {
      rows: [schema],
    } = await client.query(
      "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='contacts' and column_name='expired_at') as ready",
    );
    expect(
      schema.ready,
      "Environment blocker: contacts.expired_at missing; provision main migration 0025_add_contact_expired_at.sql",
    ).toBe(true);
  });
});

test("manual contact intake creates its deal, detects duplicates and reassigns broker", async ({
  page,
  identity,
}) => {
  await seedStages(identity.organizationId);
  const agent = randomUUID(),
    broker = randomUUID(),
    agentRole = randomUUID(),
    brokerRole = randomUUID(),
    development = randomUUID();
  await withDatabase(async (c) => {
    for (const [id, first, role, slug] of [
      [agent, "Eligible", agentRole, "agent"],
      [broker, "Target", brokerRole, "broker"],
    ] as const) {
      await c.query(
        "insert into users(id,organization_id,email,first_name,last_name) values($1,$2,$3,$4,$5)",
        [id, identity.organizationId, `${id}@example.invalid`, first, "Tester"],
      );
      await c.query(
        "insert into roles(id,organization_id,name,slug,data_scope) values($1,$2,$3,$3,$4)",
        [role, identity.organizationId, slug, "own"],
      );
      await c.query("insert into user_roles(user_id,role_id) values($1,$2)", [id, role]);
    }
    await c.query("insert into developments(id,organization_id,code,name) values($1,$2,$3,$4)", [
      development,
      identity.organizationId,
      `manual-${development}`,
      "Manual development",
    ]);
  });
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        data: { email: identity.email, password: identity.password },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/contacts/new");
  const email = `manual-${identity.organizationId}@example.invalid`;
  await page.getByRole("main").locator("[name=firstName]").fill("Manual");
  await page.getByRole("main").locator("[name=lastName]").fill("Buyer");
  // The channel checkbox is visually hidden (sr-only) inside its pill label; click the pill like a user.
  await page.getByRole("main").getByText("Email", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Email", exact: true })).toBeChecked();
  await page.getByRole("main").locator("[name=email]").fill(email);
  await page.getByRole("main").locator("[name=email]").blur();
  await expect(page.getByRole("main").locator("select[name=currentProvince]")).toHaveCount(0);
  await page.getByRole("main").locator("select[name=agentUserId]").selectOption(agent);
  await expect(page.getByRole("combobox", { name: /Budget range/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Create contact", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  const contact = await withDatabase(async (c) => {
    const records = (
      await c.query(
        "select id,first_name,last_name,assigned_user_id from contacts where organization_id=$1 and email=$2",
        [identity.organizationId, email],
      )
    ).rows;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      first_name: "MANUAL",
      last_name: "BUYER",
      assigned_user_id: agent,
    });
    expect(
      (await c.query("select id from documents where contact_id=$1", [records[0].id])).rowCount,
    ).toBe(0);
    expect(
      (await c.query("select id from deals where organization_id=$1", [identity.organizationId]))
        .rowCount,
    ).toBe(1);
    return records[0].id as string;
  });
  await page
    .getByRole("main")
    .getByRole("button", { name: /Actions for BUYER, MANUAL/i })
    .click();
  await page.getByRole("menuitem", { name: "Reassign broker", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: /To Broker/ }).selectOption(broker);
  await dialog.getByLabel("Reason", { exact: false }).fill("Fixture broker handover");
  await dialog.getByRole("button", { name: "Reassign", exact: true }).click();
  await expect
    .poll(() =>
      withDatabase(
        async (c) =>
          (await c.query("select broker_user_id from contacts where id=$1", [contact])).rows[0]
            .broker_user_id,
      ),
    )
    .toBe(broker);
  await withDatabase(async (c) => {
    expect(
      (
        await c.query(
          "select to_broker_user_id,reason from contact_broker_history where contact_id=$1",
          [contact],
        )
      ).rows,
    ).toContainEqual(
      expect.objectContaining({ to_broker_user_id: broker, reason: "Fixture broker handover" }),
    );
  });
  await page.goto("/contacts/new");
  await page.getByRole("main").getByText("Email", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Email", exact: true })).toBeChecked();
  await page.getByRole("main").locator("[name=email]").fill(email);
  await page.getByRole("main").locator("[name=email]").blur();
  await expect(
    page.getByText("Another contact already uses this email address.", { exact: true }),
  ).toBeVisible();
  await withDatabase(async (c) => {
    expect(
      (await c.query("select id from contacts where organization_id=$1", [identity.organizationId]))
        .rowCount,
    ).toBe(1);
  });
});

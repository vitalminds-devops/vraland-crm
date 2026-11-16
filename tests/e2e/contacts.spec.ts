import { test, expect } from "../fixtures/identity";
import {
  seedOpportunityDetails,
  seedReservation,
  seedStages,
  withDatabase,
} from "../helpers/database";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
test.setTimeout(120_000);

test.beforeEach(async () => {
  const info = test.info();
  if (
    info.title.startsWith("CSV rejects ") ||
    info.title.includes("creation needs no identity documents")
  )
    return;
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

async function importCsv(page: Page, body: string, organizationId?: string) {
  if (organizationId) {
    const development = randomUUID(),
      agent = randomUUID(),
      role = randomUUID();
    await withDatabase(async (c) => {
      await c.query("insert into developments(id,organization_id,code,name) values($1,$2,$3,$4)", [
        development,
        organizationId,
        `csv-${development}`,
        "CSV development",
      ]);
      await c.query(
        "insert into users(id,organization_id,email,first_name,last_name) values($1,$2,$3,$4,$5)",
        [agent, organizationId, `${agent}@example.invalid`, "CSV", "Agent"],
      );
      await c.query(
        "insert into roles(id,organization_id,name,slug,data_scope) values($1,$2,$3,$3,'own')",
        [role, organizationId, `agent`],
      );
      await c.query("insert into user_roles(user_id,role_id) values($1,$2)", [agent, role]);
    });
    const [header, ...rows] = body.trimEnd().split("\n");
    body = `${header},preferred_development_id,assigned_agent_id\n${rows.map((row) => `${row},${development},${agent}`).join("\n")}\n`;
  }
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import contacts", exact: true })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose CSV file", exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from(body) });
}

test("successful CSV import keeps the import summary available to review", async ({
  page,
  identity,
}) => {
  await seedStages(identity.organizationId);
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        data: { email: identity.email, password: identity.password },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/contacts");
  await importCsv(
    page,
    `first_name,last_name,email\nSummary,Review,summary-${identity.organizationId}@example.invalid\n`,
    identity.organizationId,
  );
  await expect(page.getByRole("heading", { name: "Import finished" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel("Close import summary")).toBeVisible();
});

test("CSV intake opens one deal, duplicates skip, notes persist, archive and restore", async ({
  page,
  identity,
}) => {
  await seedStages(identity.organizationId);
  const login = await page.request.post("/api/auth/sign-in/email", {
    data: { email: identity.email, password: identity.password },
  });
  expect(login.status()).toBe(200);
  await page.goto("/contacts");
  const email = `contact-${identity.organizationId}@example.invalid`;
  await importCsv(
    page,
    `first_name,last_name,email\nPlaywright,Contact,${email}\nPlaywright,Contact,${email}\n`,
    identity.organizationId,
  );
  await expect
    .poll(
      () =>
        withDatabase(
          async (c) =>
            (
              await c.query("select id from contacts where organization_id=$1", [
                identity.organizationId,
              ])
            ).rowCount,
        ),
      { timeout: 30_000 },
    )
    .toBe(1);
  const records = await withDatabase(async (client) => {
    const contacts = await client.query("select id,email from contacts where organization_id=$1", [
      identity.organizationId,
    ]);
    expect(contacts.rows).toHaveLength(1);
    expect(contacts.rows[0].email).toBe(email);
    const deals = await client.query("select id from deals where organization_id=$1", [
      identity.organizationId,
    ]);
    expect(deals.rows).toHaveLength(1);
    return { contact: contacts.rows[0].id, deal: deals.rows[0].id };
  });
  const csv = await page.request.get("/api/contacts/export");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(email);
  await page.goto(`/contacts/${records.contact}`);
  const main = page.getByRole("main");
  await main.getByPlaceholder(/Add a note/).fill("Playwright persisted note");
  await main.getByRole("button", { name: "Add", exact: true }).click();
  await expect(main.getByText("Playwright persisted note", { exact: true })).toBeVisible();
  await page.reload();
  await expect(main.getByText("Playwright persisted note", { exact: true })).toBeVisible();
  await page.goto("/contacts");
  await main.getByRole("button", { name: /Actions for Contact, Playwright/i }).click();
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect
    .poll(() =>
      withDatabase(
        async (client) =>
          (await client.query("select deleted_at from contacts where id=$1", [records.contact]))
            .rows[0].deleted_at !== null,
      ),
    )
    .toBe(true);
  await page.goto("/contacts/archive");
  await page.getByRole("button", { name: "Restore contact" }).click();
  await expect
    .poll(() =>
      withDatabase(
        async (client) =>
          (await client.query("select deleted_at from contacts where id=$1", [records.contact]))
            .rows[0].deleted_at,
      ),
    )
    .toBeNull();
});

for (const scenario of [
  {
    name: "empty CSV",
    body: "first_name,last_name\n",
    message: "The CSV has no data rows to import.",
  },
  {
    name: "malformed CSV",
    body: 'first_name,last_name\n"unterminated',
    message: "Couldn't read the CSV.",
  },
  {
    name: "more than 1000 rows",
    body: "first_name,last_name\n" + "Bulk,Contact\n".repeat(1001),
    message: "Imports are limited to 1,000 rows.",
  },
  {
    name: "oversized upload",
    body: "first_name,last_name\n" + "A".repeat(2_000_001),
    message: "Choose a CSV file smaller than 2 MB.",
  },
])
  test(`CSV rejects ${scenario.name} without contacts`, async ({ page, identity }) => {
    expect(
      (
        await page.request.post("/api/auth/sign-in/email", {
          data: { email: identity.email, password: identity.password },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/contacts");
    await importCsv(page, scenario.body);
    await expect(page.getByText(scenario.message, { exact: false })).toBeVisible();
    await withDatabase(async (client) =>
      expect(
        (
          await client.query("select id from contacts where organization_id=$1", [
            identity.organizationId,
          ])
        ).rows,
      ).toHaveLength(0),
    );
  });

async function prepareContact(
  page: Page,
  identity: { email: string; password: string; organizationId: string },
) {
  const stages = await seedStages(identity.organizationId);
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        data: { email: identity.email, password: identity.password },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/contacts");
  await importCsv(
    page,
    `first_name,last_name,email\nWorkflow,Contact,workflow-${identity.organizationId}@example.invalid\n`,
    identity.organizationId,
  );
  await expect
    .poll(
      () =>
        withDatabase(
          async (c) =>
            (
              await c.query("select id from contacts where organization_id=$1", [
                identity.organizationId,
              ])
            ).rowCount,
        ),
      { timeout: 30_000 },
    )
    .toBe(1);
  const records = await withDatabase(async (c) => {
    const contact = (
      await c.query("select id from contacts where organization_id=$1", [identity.organizationId])
    ).rows[0].id as string;
    const deal = (
      await c.query("select id from deals where organization_id=$1", [identity.organizationId])
    ).rows[0].id as string;
    return { contact, deal };
  });
  return { ...records, stages };
}

test("requirements can be added, updated, reloaded and removed", async ({ page, identity }) => {
  const { contact } = await prepareContact(page, identity);
  // Intake already creates the default checklist; isolate the checklist seeding operation.
  await withDatabase(async (c) => {
    await c.query("delete from contact_document_requirements where contact_id=$1", [contact]);
  });
  await page.goto(`/contacts/${contact}/documents`);
  const requirements = page.getByRole("main");
  await requirements.getByRole("button", { name: "Add document", exact: true }).click();
  await requirements.getByLabel("Document type").selectOption("custom");
  await requirements.getByLabel("Document name").fill("Playwright evidence");
  await requirements.getByRole("button", { name: "Add", exact: true }).click();
  await requirements.getByLabel("Upload Playwright evidence").setInputFiles({
    name: "evidence.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
  });
  await expect
    .poll(() =>
      withDatabase(
        async (c) =>
          (
            await c.query(
              "select status from contact_document_requirements where contact_id=$1 and label=$2",
              [contact, "Playwright evidence"],
            )
          ).rows[0]?.status,
      ),
    )
    .toBe("submitted");
  await page.reload();
  await expect(requirements.getByText("1 of 1 submitted")).toBeVisible();
  await requirements.getByRole("button", { name: "Remove Playwright evidence" }).click();
  await expect(requirements.getByText("Playwright evidence", { exact: true })).toHaveCount(0);
  await requirements.getByRole("button", { name: "Add standard checklist" }).click();
  await expect(requirements.getByLabel(/^Upload /).first()).toBeAttached();
  await expect(requirements.getByText("Submitted", { exact: true })).toHaveCount(0);
});

test("CSV optional development and agent references can be omitted", async ({ page, identity }) => {
  await seedStages(identity.organizationId);
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        data: { email: identity.email, password: identity.password },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/contacts");
  await importCsv(
    page,
    `first_name,last_name,email\nOptional,References,optional-${identity.organizationId}@example.invalid\n`,
  );
  // csvRowSchema declares both UUID references optional. Empty strings must not reach PostgreSQL UUID columns.
  await expect(page.getByText(/^Imported \d+ contact/).first()).toContainText(
    "Imported 1 contact(s)",
  );
  await expect
    .poll(
      () =>
        withDatabase(
          async (c) =>
            (
              await c.query("select id from contacts where organization_id=$1", [
                identity.organizationId,
              ])
            ).rowCount,
        ),
      { timeout: 15_000 },
    )
    .toBe(1);
});

test("contact edit persists identity, required preferences and one existing deal", async ({
  page,
  identity,
}) => {
  const { contact } = await prepareContact(page, identity);
  const agent = randomUUID();
  // The form has no preferred development any more (it is chosen when the lead becomes an
  // opportunity), so an edit must keep the one the contact already has.
  const development = await withDatabase(
    async (c) =>
      (await c.query("select preferred_development_id from contacts where id=$1", [contact]))
        .rows[0].preferred_development_id as string,
  );
  expect(development).toBeTruthy();
  await withDatabase(async (c) => {
    await c.query(
      "insert into users(id,organization_id,email,first_name,last_name) values($1,$2,$3,$4,$5)",
      [agent, identity.organizationId, `agent-${agent}@example.invalid`, "Eligible", "Agent"],
    );
    await c.query(
      "insert into user_roles(user_id,role_id) select $1,id from roles where organization_id=$2 and slug='agent'",
      [agent, identity.organizationId],
    );
  });
  await page.goto(`/contacts/${contact}/edit`);
  const main = page.getByRole("main");
  await main.locator("[name=firstName]").fill("Edited");
  await main.locator("[name=lastName]").fill("Buyer");
  await main.locator("select[name=currentProvince]").selectOption({ index: 1 });
  await expect(main.locator("select[name=currentCity]")).toBeEnabled();
  await main.locator("select[name=currentCity]").selectOption({ index: 1 });
  await expect(main.locator("select[name=currentBarangay]")).toBeEnabled();
  await main.locator("select[name=currentBarangay]").selectOption({ index: 1 });
  await main.locator("select[name=assignedAgentId]").selectOption(agent);
  await page.getByRole("combobox", { name: /Budget range/ }).selectOption("below-2.3m");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await page.goto(`/contacts/${contact}`);
  await expect(page.getByRole("heading", { name: "BUYER, EDITED", exact: true })).toBeVisible();
  await withDatabase(async (c) => {
    const row = (
      await c.query(
        "select first_name,last_name,assigned_user_id,preferred_development_id,budget_max from contacts where id=$1",
        [contact],
      )
    ).rows[0];
    expect(row).toMatchObject({
      first_name: "EDITED",
      last_name: "BUYER",
      assigned_user_id: agent,
      preferred_development_id: development,
    });
    expect(Number(row.budget_max)).toBe(2299999);
    expect(
      (await c.query("select id from deals where organization_id=$1", [identity.organizationId]))
        .rowCount,
    ).toBe(1);
  });
});

test("contact creation needs no identity documents but still blocks an incomplete form", async ({
  page,
  identity,
}) => {
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        data: { email: identity.email, password: identity.password },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/contacts/new");
  // The valid ID and appointment form are now required when the lead moves to Opportunity.
  await expect(page.locator("[name=firstName]")).toBeEnabled();
  const create = page.getByRole("button", { name: "Create contact", exact: true });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByText("Select a province.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/contacts\/new$/);
  await withDatabase(async (c) => {
    expect(
      (await c.query("select id from contacts where organization_id=$1", [identity.organizationId]))
        .rowCount,
    ).toBe(0);
  });
});

test("CSV row matching an existing email is not imported and opens no duplicate deal", async ({
  page,
  identity,
}) => {
  const { contact } = await prepareContact(page, identity);
  await page.goto("/contacts");
  // Duplicates are always skipped now; there is no update strategy to choose.
  await importCsv(
    page,
    `first_name,last_name,email\nUpdated,Imported,workflow-${identity.organizationId}@example.invalid\n`,
  );
  // An all-duplicate import returns a failure, so only the toast reports it (no summary dialog).
  await expect(
    page.getByText(/Imported 0 contact\(s\); 1 duplicate\(s\) not imported/),
  ).toBeVisible({
    timeout: 30_000,
  });
  await withDatabase(async (c) => {
    expect(
      (await c.query("select first_name from contacts where id=$1", [contact])).rows[0].first_name,
    ).not.toBe("Updated");
    expect(
      (await c.query("select id from contacts where organization_id=$1", [identity.organizationId]))
        .rowCount,
    ).toBe(1);
    expect(
      (await c.query("select id from deals where organization_id=$1", [identity.organizationId]))
        .rowCount,
    ).toBe(1);
  });
});

test("pipeline stage transition persists and records stage history", async ({ page, identity }) => {
  const { deal, stages } = await prepareContact(page, identity);
  await seedReservation(identity.organizationId, deal);
  await seedOpportunityDetails(identity.organizationId, deal);
  await page.goto(`/deals/${deal}`);
  await page.getByRole("button", { name: "Change stage", exact: true }).click();
  await page
    .getByLabel("Move to", { exact: true })
    .selectOption(stages.find((s) => s.slug === "opportunity")!.id);
  await page.getByRole("button", { name: "Move opportunity", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Move to Opportunity", exact: true }).click();
  await expect
    .poll(() =>
      withDatabase(
        async (c) =>
          (await c.query("select stage_id from deals where id=$1", [deal])).rows[0].stage_id,
      ),
    )
    .toBe(stages.find((s) => s.slug === "opportunity")!.id);
  await withDatabase(async (c) => {
    const history = (
      await c.query(
        "select from_stage_id,to_stage_id,changed_by from deal_stage_history where deal_id=$1 order by changed_at desc limit 1",
        [deal],
      )
    ).rows[0];
    expect(history).toMatchObject({
      from_stage_id: stages.find((s) => s.slug === "leads")!.id,
      to_stage_id: stages.find((s) => s.slug === "opportunity")!.id,
      changed_by: identity.userId,
    });
  });
  await page.reload();
  await expect(page.getByText(/Opportunity/).first()).toBeVisible();
  await page.goto("/pipeline");
  await expect(page.getByRole("heading", { name: "Opportunity", exact: true })).toBeVisible();
});

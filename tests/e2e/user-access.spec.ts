import { randomUUID } from "node:crypto";
import { test, expect } from "../fixtures/identity";
import { query, signIn } from "../helpers/browser";
import {
  roleDataScopeDefaults,
  rolePermissionDefaults,
  type RoleSlug,
} from "../../src/lib/permissions/catalog";

test.setTimeout(120_000);

async function seedRole(organizationId: string, slug: RoleSlug) {
  const roleId = randomUUID();
  await query("insert into roles(id,organization_id,name,slug,data_scope) values($1,$2,$3,$3,$4)", [
    roleId,
    organizationId,
    slug,
    roleDataScopeDefaults[slug],
  ]);
  await query(
    "insert into role_permissions(role_id,permission_id) select $1,id from permissions where key=any($2::text[])",
    [roleId, rolePermissionDefaults[slug]],
  );
  return roleId;
}

test("administrator replaces user roles and confirms organization access before saving", async ({
  page,
  identity,
}) => {
  const agentRole = await seedRole(identity.organizationId, "agent");
  const viewerRole = await seedRole(identity.organizationId, "viewer");
  const userId = randomUUID();
  await query(
    "insert into users(id,organization_id,email,first_name,last_name) values($1,$2,$3,$4,$5)",
    [userId, identity.organizationId, `access-${userId}@example.invalid`, "Access", "Target"],
  );
  await query("insert into user_roles(user_id,role_id) values($1,$2)", [userId, agentRole]);
  await signIn(page, identity);
  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Actions for Access Target", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/settings/users/${userId}$`));
  const drawer = page.getByRole("main");
  await expect(drawer.getByRole("checkbox", { name: /^Agent / })).toBeChecked();
  await expect(drawer.getByRole("checkbox", { name: /^See all records/ })).not.toBeChecked();
  await drawer.getByRole("checkbox", { name: /^Viewer / }).click();
  await drawer.getByRole("checkbox", { name: /^Agent / }).click();
  // The Viewer role gives "See all records", so the swap widens access to the organization.
  await expect(drawer.getByRole("checkbox", { name: /^See all records/ })).toBeChecked();
  await drawer.getByRole("button", { name: "Save changes", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Grant organization-wide access?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  expect(await query("select role_id from user_roles where user_id=$1", [userId])).toEqual([
    { role_id: agentRole },
  ]);
  await confirmation.getByRole("button", { name: "Grant full access", exact: true }).click();
  await expect(page.getByText("Access Target saved.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/users$/);
  expect(await query("select role_id from user_roles where user_id=$1", [userId])).toEqual([
    { role_id: viewerRole },
  ]);
  expect(
    await query("select permission_key from user_permissions where user_id=$1", [userId]),
  ).toEqual([]);
  await page.reload();
  await page.getByRole("button", { name: "Actions for Access Target", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await expect(drawer.getByRole("checkbox", { name: /^Viewer / })).toBeChecked();
  await expect(drawer.getByRole("checkbox", { name: /^Agent / })).not.toBeChecked();
  await expect(drawer.getByRole("checkbox", { name: /^See all records/ })).toBeChecked();
});

test("administrator widens one user's data access through their own permissions", async ({
  page,
  identity,
}) => {
  const agentRole = await seedRole(identity.organizationId, "agent");
  const userId = randomUUID();
  await query(
    "insert into users(id,organization_id,email,first_name,last_name) values($1,$2,$3,$4,$5)",
    [userId, identity.organizationId, `widen-${userId}@example.invalid`, "Widen", "Target"],
  );
  await query("insert into user_roles(user_id,role_id) values($1,$2)", [userId, agentRole]);
  await signIn(page, identity);
  await page.goto(`/settings/users/${userId}`);
  const drawer = page.getByRole("main");
  await expect(drawer.getByRole("checkbox", { name: /^See own records/ })).toBeChecked();
  await drawer.getByRole("checkbox", { name: /^See all records/ }).click();
  await drawer.getByRole("button", { name: "Save changes", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Grant organization-wide access?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  expect(
    await query("select permission_key from user_permissions where user_id=$1", [userId]),
  ).toEqual([]);
  await confirmation.getByRole("button", { name: "Grant full access", exact: true }).click();
  await expect(page.getByText("Widen Target saved.", { exact: true })).toBeVisible();
  expect(
    await query("select permission_key,granted from user_permissions where user_id=$1", [userId]),
  ).toEqual([{ permission_key: "records.view_all", granted: true }]);
  expect(await query("select role_id from user_roles where user_id=$1", [userId])).toEqual([
    { role_id: agentRole },
  ]);
});

test("administrator creates a Master Broker with multiple selected brokers and preserves unselected users", async ({
  page,
  identity,
}) => {
  const masterRole = await seedRole(identity.organizationId, "master-broker");
  const brokerRole = await seedRole(identity.organizationId, "broker");
  const licensedRole = await seedRole(identity.organizationId, "license-broker");
  const members = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  for (const [index, id] of members.entries()) {
    await query(
      "insert into users(id,organization_id,email,first_name,last_name,status) values($1,$2,$3,$4,$5,$6)",
      [
        id,
        identity.organizationId,
        `member-${id}@example.invalid`,
        "Assignment",
        `Broker ${index + 1}`,
        index === 3 ? "inactive" : "active",
      ],
    );
    await query("insert into user_roles(user_id,role_id) values($1,$2)", [
      id,
      index === 1 ? licensedRole : brokerRole,
    ]);
  }
  await signIn(page, identity);
  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Create user", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Master Broker", exact: true }).click();
  const email = `master-${identity.organizationId}@example.invalid`;
  await dialog.getByRole("textbox", { name: /First name/ }).fill("Created");
  await dialog.getByRole("textbox", { name: /Last name/ }).fill("Master Broker");
  await dialog.getByRole("textbox", { name: /Email/ }).fill(email);
  await dialog.getByLabel(/^Password/).fill(randomUUID() + "Aa1!");
  await dialog.getByLabel(/^Broker documents/).setInputFiles({
    name: "broker-license.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic master broker credential"),
  });
  const picker = dialog.getByRole("group", { name: "Brokers (optional)", exact: true });
  await picker.getByText("Select brokers", { exact: true }).click();
  await expect(picker.getByRole("checkbox")).toHaveCount(3);
  await expect(picker.getByRole("checkbox", { name: /Assignment Broker 4/ })).toHaveCount(0);
  await picker.getByRole("checkbox", { name: /Assignment Broker 1/ }).check();
  await picker.getByRole("textbox", { name: "Search brokers", exact: true }).fill("Broker 2");
  await picker.getByRole("checkbox", { name: /Assignment Broker 2/ }).check();
  await picker.getByRole("button", { name: /^Remove Assignment Broker 1/ }).click();
  await picker.getByRole("textbox", { name: "Search brokers", exact: true }).fill("");
  await picker.getByRole("checkbox", { name: /Assignment Broker 1/ }).check();
  await expect(
    picker.getByRole("list", { name: "Selected brokers", exact: true }).getByRole("listitem"),
  ).toHaveCount(2);
  await picker.getByText("Add or change brokers (2 selected)", { exact: true }).click();
  await dialog.getByRole("button", { name: "Create user", exact: true }).click();
  await expect(dialog).toBeHidden();
  const [master] = await query("select id from users where organization_id=$1 and email=$2", [
    identity.organizationId,
    email,
  ]);
  expect(master).toBeTruthy();
  expect(await query("select role_id from user_roles where user_id=$1", [master.id])).toEqual([
    { role_id: masterRole },
  ]);
  const actual = await query(
    "select id,broker_id from users where organization_id=$1 and id=any($2::uuid[])",
    [identity.organizationId, members],
  );
  for (const [index, id] of members.entries())
    expect(actual.find((row) => row.id === id)?.broker_id).toBe(index < 2 ? master.id : null);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Actions for Created Master Broker", exact: true }),
  ).toBeVisible();
  expect(
    await query(
      "select count(*)::int as count from users where organization_id=$1 and broker_id=$2",
      [identity.organizationId, master.id],
    ),
  ).toEqual([{ count: 2 }]);
});

test("administrator onboards broker-linked and independent agents without a license field", async ({
  page,
  identity,
  browser,
}) => {
  const agentRole = await seedRole(identity.organizationId, "agent");
  const brokerRole = await seedRole(identity.organizationId, "broker");
  const brokerId = randomUUID();
  await query(
    "insert into users(id,organization_id,email,first_name,last_name,status) values($1,$2,$3,$4,$5,$6)",
    [
      brokerId,
      identity.organizationId,
      `broker-${brokerId}@example.invalid`,
      "Onboarding",
      "Broker",
      "active",
    ],
  );
  await query("insert into user_roles(user_id,role_id) values($1,$2)", [brokerId, brokerRole]);
  await signIn(page, identity);
  await page.goto("/settings/agents/new");
  const email = `agent-${identity.organizationId}@example.invalid`,
    password = randomUUID() + "Aa1!";
  const bytes = Buffer.from("Synthetic onboarding license document.");
  await page.getByRole("textbox", { name: /^First name/ }).fill("Onboarded");
  await page.getByRole("textbox", { name: /^Last name/ }).fill("Agent");
  await page.getByRole("textbox", { name: /^Email/ }).fill(email);
  await page.getByRole("textbox", { name: /^Phone/ }).fill("+639171234567");
  await expect(page.getByRole("textbox", { name: /^License/ })).toHaveCount(0);
  await page.getByRole("combobox", { name: /^Broker/ }).selectOption(brokerId);
  await page
    .getByLabel(/^Password/)
    .filter({ visible: true })
    .fill(password);
  await page
    .getByLabel(/^Agent documents/)
    .filter({ visible: true })
    .setInputFiles({ name: "agent-license.txt", mimeType: "text/plain", buffer: bytes });
  await page.getByRole("button", { name: "Create user", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/users$/);
  const users = await query(
    "select id,first_name,last_name,phone,broker_id,status from users where organization_id=$1 and email=$2",
    [identity.organizationId, email],
  );
  expect(users).toHaveLength(1);
  const userId = users[0].id;
  expect(users[0]).toMatchObject({
    first_name: "Onboarded",
    last_name: "Agent",
    phone: "+639171234567",
    broker_id: brokerId,
    status: "active",
  });
  expect(await query("select role_id from user_roles where user_id=$1", [userId])).toEqual([
    { role_id: agentRole },
  ]);
  expect(
    await query("select license from agents where organization_id=$1 and user_id=$2", [
      identity.organizationId,
      userId,
    ]),
  ).toEqual([{ license: "" }]);
  const documents = await query(
    "select id,name,mime_type,storage_key from documents where organization_id=$1 and user_id=$2",
    [identity.organizationId, userId],
  );
  expect(documents).toHaveLength(1);
  expect(documents[0]).toMatchObject({ name: "agent-license.txt", mime_type: "text/plain" });
  expect(documents[0].storage_key).toMatch(new RegExp("^" + identity.organizationId + "/"));
  const download = await page.request.get(
    `/api/settings/user-documents/${documents[0].id}/download`,
  );
  expect(download.status()).toBe(200);
  expect(await download.body()).toEqual(bytes);
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const agentPage = await context.newPage();
    await signIn(agentPage, { email, password });
    await agentPage.goto("/account");
    // /account shows the email read-only, as the "Email" entry of the profile card's dt/dd list.
    const shownEmail = agentPage
      .getByRole("term")
      .filter({ hasText: /^Email$/ })
      .locator("xpath=following-sibling::dd[1]");
    await expect(shownEmail).toHaveText(email);
  } finally {
    await context.close();
  }
  // New main also permits independent agents, without a broker or license field.
  await page.goto("/settings/agents/new");
  const independentEmail = `independent-${identity.organizationId}@example.invalid`;
  await page.getByRole("textbox", { name: /^First name/ }).fill("Independent");
  await page.getByRole("textbox", { name: /^Last name/ }).fill("Agent");
  await page.getByRole("textbox", { name: /^Email/ }).fill(independentEmail);
  await expect(page.getByRole("combobox", { name: /^Broker/ })).toHaveValue("");
  await page
    .getByLabel(/^Password/)
    .filter({ visible: true })
    .fill(randomUUID() + "Aa1!");
  await page
    .getByLabel(/^Agent documents/)
    .filter({ visible: true })
    .setInputFiles({ name: "independent.txt", mimeType: "text/plain", buffer: bytes });
  await page.getByRole("button", { name: "Create user", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/users$/);
  expect(
    await query(
      "select u.broker_id,a.license from users u join agents a on a.user_id=u.id where u.organization_id=$1 and u.email=$2",
      [identity.organizationId, independentEmail],
    ),
  ).toEqual([{ broker_id: null, license: "" }]);
});

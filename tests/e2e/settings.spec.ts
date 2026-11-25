import { test, expect } from "../fixtures/identity";
import type { Page } from "@playwright/test";
import { query, signIn } from "../helpers/browser";

/** Picks a day in the DatePicker popover labelled `field`. */
async function pickDate(page: Page, field: RegExp, year: string, month: string, day: string) {
  await page.getByRole("button", { name: field }).click();
  await page.getByRole("combobox", { name: "Year", exact: true }).selectOption(year);
  await page.getByRole("combobox", { name: "Month", exact: true }).selectOption(month);
  await page.getByRole("button", { name: day, exact: true }).click();
}

test.setTimeout(90_000);

test("administrator changes a custom role grant and the change survives reload", async ({
  page,
  identity,
}) => {
  const [role] = await query(
    "insert into roles(organization_id,name,slug,data_scope) values($1,'Review assistant','review-assistant','own') returning id",
    [identity.organizationId],
  );
  await signIn(page, identity);
  await page.goto("/settings/roles");
  await page.getByRole("button", { name: /Review assistant/ }).click();
  await page.getByRole("searchbox", { name: "Filter permissions" }).fill("tasks.view");
  await page.getByRole("checkbox", { name: /tasks.view/ }).check();
  await expect(page.getByText("1 unsaved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save all", exact: true }).click();
  await expect(page.getByText("Saved 1 role.", { exact: true })).toBeVisible();
  expect(
    await query(
      "select p.key from role_permissions rp join permissions p on p.id=rp.permission_id where rp.role_id=$1",
      [role.id],
    ),
  ).toEqual([{ key: "tasks.view" }]);
  await page.reload();
  await page.getByRole("button", { name: /Review assistant/ }).click();
  await expect(page.getByRole("checkbox", { name: /tasks.view/ })).toBeChecked();
});

test("administrator creates a custom-role user with usable credentials", async ({
  page,
  identity,
  browser,
}) => {
  const [role] = await query(
    "insert into roles(organization_id,name,slug,data_scope) values($1,'Review assistant','review-assistant','own') returning id",
    [identity.organizationId],
  );
  await query(
    "insert into role_permissions(role_id,permission_id) select $1,id from permissions where key='dashboard.view'",
    [role.id],
  );
  await signIn(page, identity);
  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Create user", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Review assistant/ }).click();
  const email = `created-${identity.organizationId}@example.invalid`;
  const password = "Playwright-Account-123!";
  await dialog.getByRole("textbox", { name: /First name/ }).fill("Created");
  await dialog.getByRole("textbox", { name: /Last name/ }).fill("Assistant");
  await dialog.getByRole("textbox", { name: /Email/ }).fill(email);
  await dialog.getByLabel(/^Password/).fill(password);
  await dialog.getByRole("button", { name: "Create user", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(
    await query("select email,first_name from users where organization_id=$1 and email=$2", [
      identity.organizationId,
      email,
    ]),
  ).toEqual([{ email, first_name: "Created" }]);
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const createdPage = await context.newPage();
    await signIn(createdPage, { email, password });
    await createdPage.goto("/account");
    // /account shows the email read-only, as the "Email" entry of the profile card's dt/dd list.
    const shownEmail = createdPage
      .getByRole("term")
      .filter({ hasText: /^Email$/ })
      .locator("xpath=following-sibling::dd[1]");
    await expect(shownEmail).toHaveText(email);
  } finally {
    await context.close();
  }
});

test("administrator deactivates, reactivates, deletes and restores a user", async ({
  page,
  identity,
}) => {
  const [user] = await query(
    "insert into users(organization_id,email,first_name,last_name) values($1,$2,'Lifecycle','User') returning id",
    [identity.organizationId, `lifecycle-${identity.organizationId}@example.invalid`],
  );
  await signIn(page, identity);
  await page.goto("/settings/users");
  const actions = page.getByRole("button", { name: "Actions for Lifecycle User", exact: true });
  await actions.click();
  await page.getByRole("menuitem", { name: "Deactivate", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(page.getByText("Lifecycle User deactivated", { exact: true })).toBeVisible();
  expect(await query("select status from users where id=$1", [user.id])).toEqual([
    { status: "inactive" },
  ]);
  await actions.click();
  await page.getByRole("menuitem", { name: "Reactivate", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect(page.getByText("Lifecycle User reactivated", { exact: true })).toBeVisible();
  await actions.click();
  await page.getByRole("menuitem", { name: "Archive user", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive", exact: true }).click();
  await expect(actions).toBeHidden();
  // While the confirm dialog is open the row is already hidden from role queries, so wait for the save.
  await expect
    .poll(() => query("select deleted_at is not null as deleted from users where id=$1", [user.id]))
    .toEqual([{ deleted: true }]);
  await page.goto("/settings/archived-users");
  await page
    .getByRole("row")
    .filter({ hasText: "Lifecycle User" })
    .getByRole("button", { name: "Restore", exact: true })
    .click();
  await expect(page.getByText("Lifecycle User restored.", { exact: true })).toBeVisible();
  expect(await query("select status,deleted_at from users where id=$1", [user.id])).toEqual([
    { status: "active", deleted_at: null },
  ]);
  await page.goto("/settings/users");
  await expect(actions).toBeVisible();
});

test("administrator uploads a user certificate and supporting document with preview and download", async ({
  page,
  identity,
}) => {
  const [user] = await query(
    "insert into users(organization_id,email,first_name,last_name) values($1,$2,'Document','Owner') returning id",
    [identity.organizationId, `documents-${identity.organizationId}@example.invalid`],
  );
  const [agentRole] = await query(
    "insert into roles(organization_id,name,slug,data_scope) values($1,'Agent','agent','own') returning id",
    [identity.organizationId],
  );
  await query("insert into user_roles(user_id,role_id) values($1,$2)", [user.id, agentRole.id]);
  await signIn(page, identity);
  await page.goto(`/settings/users/${user.id}/documents`);
  await page.getByRole("button", { name: "Add certificate", exact: true }).click();
  await page.getByRole("textbox", { name: "Certificate number", exact: true }).fill("PW-CERT-123");
  await pickDate(page, /^Valid from/, "2025", "January", "Wednesday, January 1, 2025");
  await pickDate(page, /^Valid until/, "2030", "December", "Tuesday, December 31, 2030");
  await page.getByLabel(/^Certificate file/).setInputFiles({
    name: "certificate.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Playwright accreditation certificate"),
  });
  await page.getByRole("button", { name: "Upload certificate", exact: true }).click();
  await expect(page.getByText("Certificate uploaded.", { exact: true })).toBeVisible();
  await expect(page.getByText("PW-CERT-123", { exact: true })).toBeVisible();
  await page.getByLabel("Upload document", { exact: true }).setInputFiles({
    name: "supporting.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Playwright supporting document content"),
  });
  // The certificate's notification can still be on top here, so wait for the document in the list.
  await expect(page.getByRole("heading", { name: "supporting.txt", exact: true })).toBeVisible();
  const [document] = await query(
    "select id from documents where organization_id=$1 and user_id=$2 and name='supporting.txt'",
    [identity.organizationId, user.id],
  );
  expect(document).toBeTruthy();
  await page.getByRole("button", { name: "Preview supporting.txt", exact: true }).click();
  await expect(page.getByTitle("Preview supporting.txt", { exact: true })).toBeVisible();
  const preview = await page.request.get(`/api/settings/user-documents/${document.id}/preview`);
  expect(preview.status()).toBe(200);
  expect(await preview.text()).toBe("Playwright supporting document content");
  // The preview dialog hides the page behind it; close it to use the document's own link.
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download supporting.txt", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("supporting.txt");
  expect(
    await query(
      "select certificate_number,valid_from::text,valid_until::text from documents where user_id=$1 and document_type=$2",
      [user.id, "accreditation_certificate"],
    ),
  ).toEqual([
    { certificate_number: "PW-CERT-123", valid_from: "2025-01-01", valid_until: "2030-12-31" },
  ]);
});

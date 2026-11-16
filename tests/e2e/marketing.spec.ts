import { test, expect } from "../fixtures/identity";
import { consentingContact, query, signIn } from "../helpers/browser";

test.setTimeout(90_000);

for (const channel of ["email", "sms"] as const) {
  test(`${channel} template can be created and turned off`, async ({ page, identity }) => {
    await signIn(page, identity);
    await page.goto(`/marketing/${channel}-templates/new`);
    await page.getByRole("textbox", { name: "Template name", exact: false }).fill("Buyer reminder");
    await page.getByLabel("Category", { exact: true }).fill("Reminders");
    if (channel === "email") {
      await page.getByRole("textbox", { name: "Subject", exact: false }).fill("Your viewing");
      await page.getByRole("textbox", { name: /^Message/ }).fill("Hello {{first_name}}");
    } else {
      await page
        .getByRole("textbox", { name: /^Message/ })
        .fill("Hello {{first_name}}, your viewing is tomorrow.");
    }
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page).toHaveURL(new RegExp(`/marketing/${channel}-templates/[0-9a-f-]+$`));
    await page.getByRole("button", { name: "Turn off Buyer reminder" }).click();
    await expect(page.getByRole("button", { name: "Turn on Buyer reminder" })).toBeVisible();
    expect(
      await query(`select name,is_active from ${channel}_templates where organization_id=$1`, [
        identity.organizationId,
      ]),
    ).toEqual([{ name: "Buyer reminder", is_active: false }]);
  });
}

test("campaign draft records the selected consenting recipient and SMS template", async ({
  page,
  identity,
}) => {
  const contact = await consentingContact(identity.organizationId);
  const [template] = await query(
    "insert into sms_templates(organization_id,name,body) values($1,'Campaign message','Hello {{first_name}}') returning id",
    [identity.organizationId],
  );
  await signIn(page, identity);
  await page.goto("/marketing/campaigns/new");
  await page
    .getByRole("textbox", { name: "Campaign name", exact: false })
    .fill("Viewing invitations");
  await page.getByRole("combobox", { name: "Channel", exact: false }).selectOption("sms");
  await page
    .getByRole("combobox", { name: "SMS template", exact: false })
    .selectOption(template.id);
  await page.getByRole("checkbox", { name: "Select Campaign Recipient" }).check();
  await expect(page.getByText("1 recipient selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create campaign", exact: true }).click();
  await expect(page).toHaveURL(/\/marketing\/campaigns\/[0-9a-f-]+$/);
  expect(
    await query(
      `select c.name,c.status,c.sms_template_id,r.contact_id,r.delivery_status from campaigns c join campaign_recipients r on r.campaign_id=c.id where c.organization_id=$1`,
      [identity.organizationId],
    ),
  ).toEqual([
    {
      name: "Viewing invitations",
      status: "draft",
      sms_template_id: template.id,
      contact_id: contact,
      delivery_status: "pending",
    },
  ]);
});

test("manual automation creates a task when its enrolled contact advances", async ({
  page,
  identity,
}) => {
  const contact = await consentingContact(identity.organizationId);
  await signIn(page, identity);
  await page.goto("/marketing/automations/new");
  await page.getByRole("textbox", { name: /^Name/ }).fill("Buyer follow up");
  await page.getByRole("button", { name: "Create follow-up", exact: true }).click();
  await expect(page).toHaveURL(/\/marketing\/automations\/[0-9a-f-]+$/);
  await page.getByRole("combobox", { name: /^What happens/ }).selectOption("create_task");
  await page.getByRole("textbox", { name: "Task title", exact: false }).fill("Call enrolled buyer");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await expect(page.getByText("Step added.", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: /^Contact/ }).selectOption(contact);
  await page.getByRole("button", { name: "Add to follow-up", exact: true }).click();
  await page.getByRole("button", { name: "Do next step", exact: true }).click();
  await expect
    .poll(async () =>
      query("select title,contact_id from tasks where organization_id=$1", [
        identity.organizationId,
      ]),
    )
    .toEqual([{ title: "Call enrolled buyer", contact_id: contact }]);
});

test("SMS campaign send reports missing provider, a draft offers no pause, and delete removes its audience", async ({
  page,
  identity,
}) => {
  const contact = await consentingContact(identity.organizationId);
  const [template] = await query(
    "insert into sms_templates(organization_id,name,body) values($1,'Send configuration','Hello') returning id",
    [identity.organizationId],
  );
  const [campaign] = await query(
    "insert into campaigns(organization_id,name,channel,sms_template_id) values($1,'Unconfigured send','sms',$2) returning id",
    [identity.organizationId, template.id],
  );
  await query("insert into campaign_recipients(campaign_id,contact_id) values($1,$2)", [
    campaign.id,
    contact,
  ]);
  await signIn(page, identity);
  await page.goto(`/marketing/campaigns/${campaign.id}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Send now", exact: true }).click();
  await expect(
    page.getByText("An SMS provider must be configured before sending SMS campaigns.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await query("select status from campaigns where id=$1", [campaign.id])).toEqual([
    { status: "draft" },
  ]);
  // A draft never sends by itself, so there is nothing to pause.
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/marketing\/campaigns$/);
  expect(await query("select id from campaigns where id=$1", [campaign.id])).toEqual([]);
  expect(
    await query("select contact_id from campaign_recipients where campaign_id=$1", [campaign.id]),
  ).toEqual([]);
});

test("template validation prevents empty content, and deletion honors confirm cancellation", async ({
  page,
  identity,
}) => {
  await signIn(page, identity);
  await page.goto("/marketing/sms-templates/new");
  await page.getByRole("button", { name: "Save template", exact: true }).click();
  await expect(page.getByText("Enter a template name.", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter the message body.", { exact: true })).toBeVisible();
  expect(
    await query("select id from sms_templates where organization_id=$1", [identity.organizationId]),
  ).toEqual([]);
  await page.getByRole("textbox", { name: /^Template name/ }).fill("Delete me");
  await page.getByRole("textbox", { name: /^Message/ }).fill("Hello");
  await page.getByRole("button", { name: "Save template", exact: true }).click();
  await expect(page).toHaveURL(/\/marketing\/sms-templates\/[0-9a-f-]+$/);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
  expect(
    await query("select name from sms_templates where organization_id=$1", [
      identity.organizationId,
    ]),
  ).toEqual([{ name: "Delete me" }]);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/marketing\/sms-templates$/);
  expect(
    await query("select id from sms_templates where organization_id=$1", [identity.organizationId]),
  ).toEqual([]);
});

test("sequence with enrolled contacts rejects deletion and preserves its history", async ({
  page,
  identity,
}) => {
  const contact = await consentingContact(identity.organizationId);
  const [sequence] = await query(
    "insert into automation_sequences(organization_id,name,trigger_type) values($1,'Disposable sequence','manual') returning id",
    [identity.organizationId],
  );
  await query(
    "insert into automation_steps(sequence_id,step_order,action_type,delay_minutes) values($1,1,'wait',10)",
    [sequence.id],
  );
  await query("insert into automation_enrollments(sequence_id,contact_id) values($1,$2)", [
    sequence.id,
    contact,
  ]);
  await signIn(page, identity);
  await page.goto(`/marketing/automations/${sequence.id}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByText("A follow-up with people in it can't be deleted.", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/marketing/automations/${sequence.id}$`));
  expect(await query("select id from automation_sequences where id=$1", [sequence.id])).toEqual([
    { id: sequence.id },
  ]);
  expect(
    await query("select action_type from automation_steps where sequence_id=$1", [sequence.id]),
  ).toEqual([{ action_type: "wait" }]);
  expect(
    await query("select contact_id from automation_enrollments where sequence_id=$1", [
      sequence.id,
    ]),
  ).toEqual([{ contact_id: contact }]);
});

test("unenrolled sequence deletion removes the sequence and its steps", async ({
  page,
  identity,
}) => {
  const [sequence] = await query(
    "insert into automation_sequences(organization_id,name,trigger_type) values($1,'Unenrolled sequence','manual') returning id",
    [identity.organizationId],
  );
  await query(
    "insert into automation_steps(sequence_id,step_order,action_type,delay_minutes) values($1,1,'wait',10)",
    [sequence.id],
  );
  await signIn(page, identity);
  await page.goto(`/marketing/automations/${sequence.id}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/marketing\/automations$/);
  expect(await query("select id from automation_sequences where id=$1", [sequence.id])).toEqual([]);
  expect(
    await query("select id from automation_steps where sequence_id=$1", [sequence.id]),
  ).toEqual([]);
  expect(
    await query("select id from automation_enrollments where sequence_id=$1", [sequence.id]),
  ).toEqual([]);
});

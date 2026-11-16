import { test, expect } from "../fixtures/identity";
import type { Locator, Page } from "@playwright/test";
import { consentingContact, query, signIn } from "../helpers/browser";

/** Picks Jan 1, 2030 at `hour` AM in the datetime DatePicker labelled `field` inside `scope`. */
async function pickJan1st2030(page: Page, scope: Locator, field: RegExp, hour: string) {
  const trigger = scope.getByRole("button", { name: field });
  await trigger.click();
  await page.getByRole("combobox", { name: "Year", exact: true }).selectOption("2030");
  await page.getByRole("combobox", { name: "Month", exact: true }).selectOption("January");
  await page.getByRole("button", { name: "Tuesday, January 1, 2030", exact: true }).click();
  await page.getByRole("combobox", { name: "Hour", exact: true }).selectOption(hour);
  await page.getByRole("combobox", { name: "AM or PM", exact: true }).selectOption("AM");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(trigger).toContainText(`Jan 1, 2030 · ${hour}:00 AM`);
}

test.setTimeout(90_000);

test("task creation and completion survive reload with the current user assigned", async ({
  page,
  identity,
}) => {
  await signIn(page, identity);
  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Follow up with buyer");
  await dialog.getByRole("combobox", { name: "Priority", exact: true }).selectOption("high");
  await dialog.getByLabel("Description", { exact: true }).fill("Confirm preferred viewing time.");
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "Follow up with buyer" });
  await expect(row).toBeVisible();
  await row.getByRole("combobox", { name: "Task status" }).selectOption("completed");
  await expect
    .poll(async () =>
      query("select status from tasks where organization_id=$1", [identity.organizationId]),
    )
    .toEqual([{ status: "completed" }]);
  await page.reload();
  await expect(row.getByRole("combobox", { name: "Task status" })).toHaveValue("completed");
  expect(
    await query("select title,priority,assigned_user_id from tasks where organization_id=$1", [
      identity.organizationId,
    ]),
  ).toEqual([
    { title: "Follow up with buyer", priority: "high", assigned_user_id: identity.userId },
  ]);
});

test("calendar event saves its location and attendee and appears after reload", async ({
  page,
  identity,
}) => {
  await signIn(page, identity);
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Event title", { exact: true }).fill("Buyer consultation");
  await dialog.getByRole("combobox", { name: "Type", exact: true }).selectOption("meeting");
  await dialog.getByLabel("Location").fill("Sales office");
  await dialog.getByRole("button", { name: "Save event" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByText("Buyer consultation", { exact: true }).first()).toBeVisible();
  expect(
    await query(
      `select e.title,e.event_type,e.location,u.user_id from calendar_events e join calendar_event_users u on u.event_id=e.id where e.organization_id=$1`,
      [identity.organizationId],
    ),
  ).toEqual([
    {
      title: "Buyer consultation",
      event_type: "meeting",
      location: "Sales office",
      user_id: identity.userId,
    },
  ]);
});

test("schedule a property viewing with linked client and agent", async ({ page, identity }) => {
  const contact = await consentingContact(identity.organizationId);
  const [property] = await query(
    "insert into properties(organization_id,property_code,title,property_type) values($1,'pw-viewing','Viewing property','house_and_lot') returning id",
    [identity.organizationId],
  );
  await signIn(page, identity);
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Schedule viewing", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Viewing title").fill("Client property tour");
  await dialog.getByRole("combobox", { name: "Property", exact: true }).selectOption(property.id);
  await dialog.getByRole("combobox", { name: "Contact", exact: true }).selectOption(contact);
  await pickJan1st2030(page, dialog, /^Starts/, "10");
  await pickJan1st2030(page, dialog, /^Ends/, "11");
  await dialog.getByRole("button", { name: "Schedule viewing", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () =>
      query(
        `select v.property_id,v.contact_id,v.status from property_viewings v join calendar_events e on e.id=v.event_id where e.organization_id=$1`,
        [identity.organizationId],
      ),
    )
    .toEqual([{ property_id: property.id, contact_id: contact, status: "scheduled" }]);
});

test("account profile updates persist across navigation", async ({ page, identity }) => {
  await signIn(page, identity);
  await page.goto("/account");
  // React Hook Form populates uncontrolled inputs when its refs hydrate.
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Playwright");
  await expect(page.getByLabel("Last name", { exact: true })).toHaveValue("Tester");
  await page.getByLabel("First name", { exact: true }).fill("Updated");
  await page.getByLabel("Last name", { exact: true }).fill("Profile");
  await page.getByLabel("Phone", { exact: true }).fill("+639171234567");
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Updated");
  await expect(page.getByLabel("Last name", { exact: true })).toHaveValue("Profile");
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("+639171234567");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Updated");
  await expect(page.getByText(identity.email, { exact: true })).toBeVisible();
  expect(
    await query("select first_name,last_name,phone from users where id=$1", [identity.userId]),
  ).toEqual([{ first_name: "Updated", last_name: "Profile", phone: "+639171234567" }]);
});

test("task reminder validation blocks writes and Escape closes the dialog", async ({
  page,
  identity,
}) => {
  await signIn(page, identity);
  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Invalid reminder");
  await pickJan1st2030(page, dialog, /^Due/, "10");
  await pickJan1st2030(page, dialog, /^Reminder/, "11");
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(
    dialog.getByText("Reminder must be before the due date.", { exact: true }),
  ).toBeVisible();
  expect(
    await query("select id from tasks where organization_id=$1", [identity.organizationId]),
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("password change rejects the wrong current password and accepts the correct one", async ({
  page,
  identity,
  browser,
}) => {
  await signIn(page, identity);
  await page.goto("/account");
  const nextPassword = "Playwright-Changed-123!";
  await page.getByLabel("Current password", { exact: true }).fill("incorrect-current-password");
  await page.getByLabel("New password", { exact: true }).fill(nextPassword);
  await page.getByLabel("Confirm new password", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByText("Current password is wrong.", { exact: true })).toBeVisible();
  await page.getByLabel("Current password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByText("Password changed.", { exact: true })).toBeVisible();
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const signedIn = await context.newPage();
    await signIn(signedIn, { email: identity.email, password: nextPassword });
    await signedIn.goto("/account");
    // Email is now read-only text in the profile card, not an input.
    await expect(signedIn.getByText(identity.email, { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("task search, status filter, pagination and clear preserve the isolated data set", async ({
  page,
  identity,
}) => {
  await query(
    `insert into tasks(organization_id,title,task_type,priority,status,assigned_user_id,created_by)
    select $1,'Search task ' || n,'follow_up','medium',case when n=1 then 'completed' else 'todo' end,$2,$2 from generate_series(1,31) n`,
    [identity.organizationId, identity.userId],
  );
  await signIn(page, identity);
  await page.goto("/tasks");
  await page.getByRole("combobox", { name: "Rows per page", exact: true }).selectOption("10");
  await expect(page).toHaveURL(/pageSize=10/);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole("textbox", { name: "Search tasks", exact: true }).fill("Search task 31");
  await expect(page.getByRole("row").filter({ hasText: "Search task 31" })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("page") ?? "1").toBe("1");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("completed");
  await expect(page).toHaveURL(/status=completed/);
  await expect(
    page.getByRole("row").filter({ has: page.getByText("Search task 1", { exact: true }) }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Task status", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("");
});

test("viewing outcome saves completed status, feedback and client interest", async ({
  page,
  identity,
}) => {
  const contact = await consentingContact(identity.organizationId);
  const [property] = await query(
    "insert into properties(organization_id,property_code,title,property_type) values($1,'pw-outcome','Outcome property','house_and_lot') returning id",
    [identity.organizationId],
  );
  const [event] = await query(
    "insert into calendar_events(organization_id,title,start_at,end_at,created_by) values($1,'Completed tour',now(),now()+interval '1 hour',$2) returning id",
    [identity.organizationId, identity.userId],
  );
  const [viewing] = await query(
    "insert into property_viewings(event_id,property_id,contact_id,agent_user_id) values($1,$2,$3,$4) returning id",
    [event.id, property.id, contact, identity.userId],
  );
  await signIn(page, identity);
  await page.goto("/calendar/viewings");
  const card = page.getByRole("article").filter({ hasText: "Outcome property" });
  await card.getByRole("button", { name: "Update", exact: true }).click();
  // This compact legacy form has no labels on its two native selects.
  await card.getByRole("combobox").nth(0).selectOption("completed");
  await card.getByRole("combobox").nth(1).selectOption("5");
  await card
    .getByPlaceholder("Outcome or feedback", { exact: true })
    .fill("Buyer requested a reservation quote.");
  await card.getByRole("button", { name: "Save update", exact: true }).click();
  // The submit label changes to Saving while the action is still running.
  // Wait for the form to close after success before reading persisted data.
  await expect(card.getByPlaceholder("Outcome or feedback", { exact: true })).toBeHidden();
  expect(
    await query("select status,feedback,interest_level from property_viewings where id=$1", [
      viewing.id,
    ]),
  ).toEqual([
    { status: "completed", feedback: "Buyer requested a reservation quote.", interest_level: 5 },
  ]);
  await page.reload();
  await expect(
    card.getByText("Buyer requested a reservation quote.", { exact: true }),
  ).toBeVisible();
  await expect(card.getByText("5 / 5", { exact: true })).toBeVisible();
});

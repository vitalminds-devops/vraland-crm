import { test, expect } from "../fixtures/identity";
import { query, signIn, consentingContact } from "../helpers/browser";
import { seedStages } from "../helpers/database";

test.setTimeout(120_000);

test("add a floor and unit, cancel removal, then remove the floor with its unit", async ({
  page,
  identity,
}) => {
  const [property] = await query(
    "insert into properties(organization_id,property_code,title,property_type) values($1,'pw-floor-edit','Editable inventory','condominium') returning id",
    [identity.organizationId],
  );
  await signIn(page, identity);
  await page.goto(`/properties/${property.id}`);
  // Add floor and Add unit ask how many first; the defaults add one floor with no units, then one unit.
  await page.getByRole("button", { name: "Add floor", exact: true }).click();
  const addFloors = page.getByRole("dialog", { name: "Add floors", exact: true });
  await expect(addFloors.getByRole("spinbutton", { name: "How many floors?" })).toHaveValue("1");
  await expect(addFloors.getByRole("spinbutton", { name: "Units on each floor" })).toHaveValue("0");
  await addFloors.getByRole("button", { name: "Add", exact: true }).click();
  await expect(addFloors).toBeHidden();
  await expect
    .poll(() => query("select level from floors where building_id=$1", [property.id]))
    .toEqual([{ level: 1 }]);
  const [floor] = await query("select id from floors where building_id=$1", [property.id]);
  await page.getByRole("button", { name: "Add unit", exact: true }).click();
  const addUnits = page.getByRole("dialog", { name: "Add units", exact: true });
  await expect(addUnits.getByRole("spinbutton", { name: "How many units?" })).toHaveValue("1");
  await addUnits.getByRole("button", { name: "Add", exact: true }).click();
  await expect(addUnits).toBeHidden();
  await expect
    .poll(() => query("select code from units where floor_id=$1", [floor.id]))
    .toEqual([{ code: "1A" }]);
  // Remove sits in the floor list as a bin icon named after the floor.
  const removeFloor = page.getByRole("button", { name: "Remove 1st Floor", exact: true });
  page.once("dialog", (dialog) => dialog.dismiss());
  await removeFloor.click();
  expect(await query("select id from floors where id=$1", [floor.id])).toHaveLength(1);
  page.once("dialog", (dialog) => dialog.accept());
  await removeFloor.click();
  await expect.poll(() => query("select id from floors where id=$1", [floor.id])).toEqual([]);
  expect(await query("select id from units where floor_id=$1", [floor.id])).toEqual([]);
  await page.reload();
  expect(await query("select floor_count from properties where id=$1", [property.id])).toEqual([
    { floor_count: null },
  ]);
});

test("create a property, edit it, and change a unit status", async ({ page, identity }) => {
  await signIn(page, identity);
  await page.goto("/properties/new");
  await page.getByRole("textbox", { name: /^Property name/ }).fill("Playwright condominium");
  await page.getByRole("combobox", { name: /^Property type/ }).selectOption("condominium");
  // Adding a property no longer asks for floors, units or parking.
  await expect(page.getByRole("spinbutton", { name: /^Number of floors/ })).toHaveCount(0);
  await expect(page.getByRole("spinbutton", { name: /^Parking spaces/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Create property", exact: true }).click();
  await expect(page).toHaveURL(/\/properties\/[0-9a-f-]+$/);
  const [property] = await query("select id,title from properties where organization_id=$1", [
    identity.organizationId,
  ]);
  expect(property.title).toBe("Playwright condominium");
  expect(
    await query("select count(*)::int as count from units where building_id=$1", [property.id]),
  ).toEqual([{ count: 0 }]);
  // Floors and units are added on the property page; seed them to exercise the edit below.
  const [floor] = await query(
    "insert into floors(building_id,level,label) values($1,1,'1st Floor') returning id",
    [property.id],
  );
  await query(
    "insert into units(building_id,floor_id,code) values($1,$2,'1A'),($1,$2,'1B'),($1,$2,'1C'),($1,$2,'1D')",
    [property.id, floor.id],
  );
  await page.goto(`/properties/${property.id}/edit`);
  await expect(page.getByRole("textbox", { name: /^Property name/ })).toHaveValue(
    "Playwright condominium",
  );
  await page.getByRole("textbox", { name: /^Property name/ }).fill("Updated condominium");
  await expect(page.getByRole("textbox", { name: /^Property name/ })).toHaveValue(
    "Updated condominium",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/properties/${property.id}$`));
  await expect(
    page.getByRole("heading", { name: "Updated condominium", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate floors & units", exact: true }),
  ).toHaveCount(0);
  // Editing preserves existing inventory.
  await expect
    .poll(async () =>
      query("select count(*)::int as count from units where building_id=$1", [property.id]),
    )
    .toEqual([{ count: 4 }]);
  const status = page.getByRole("combobox", { name: "Unit status", exact: true }).first();
  await status.selectOption("inactive");
  await expect
    .poll(async () =>
      query("select count(*)::int as count from units where building_id=$1 and status='inactive'", [
        property.id,
      ]),
    )
    .toEqual([{ count: 1 }]);
  await page.reload();
  await expect(status).toHaveValue("inactive");
});

test("save a multi-unit bill, record a reservation, advance the deal, refuse then remove the payment with audit retained", async ({
  page,
  identity,
}) => {
  const [schema] = await query("select to_regclass('public.bill_items')::text as bill_items");
  expect(
    schema.bill_items,
    "Environment blocker: provision main migration 0023_add_bill_items.sql in the approved test database before billing integration tests",
  ).toBe("bill_items");
  const stages = await seedStages(identity.organizationId);
  const opportunity = stages.find((stage) => stage.slug === "opportunity")!;
  const reservation = stages.find((stage) => stage.slug === "reservation")!;
  const [deal] = await query(
    "insert into deals(organization_id,deal_code,title,stage_id,primary_agent_user_id,created_by) values($1,'pw-billing','Billing opportunity',$2,$3,$3) returning id",
    [identity.organizationId, opportunity.id, identity.userId],
  );
  await signIn(page, identity);
  await page.goto(`/billing/${deal.id}`);
  await page.getByRole("textbox", { name: "Unit", exact: true }).fill("Unit 101 Tower One");
  await page.getByRole("textbox", { name: /^Unit price/ }).fill("100000");
  await page.getByRole("textbox", { name: /^Miscellaneous fee/ }).fill("5000");
  await page.getByRole("button", { name: "Add unit", exact: true }).click();
  const secondUnit = page.getByRole("group", { name: "Unit 2", exact: true });
  await secondUnit.getByRole("textbox", { name: "Unit 2", exact: true }).fill("Unit 102 Tower One");
  await secondUnit.getByRole("textbox", { name: /^Unit price/ }).fill("200000");
  await secondUnit.getByRole("textbox", { name: /^Miscellaneous fee/ }).fill("7000");
  await page.getByRole("button", { name: "Add unit", exact: true }).click();
  await page.getByRole("button", { name: "Remove unit 3", exact: true }).click();
  await expect(page.getByRole("group", { name: /^Unit \d+$/ })).toHaveCount(2);
  await page.getByRole("button", { name: "Save bill", exact: true }).click();
  await expect(page.getByText("Bill saved.", { exact: true })).toBeVisible();
  const [bill] = await query("select id,unit_price,miscellaneous_fee from bills where deal_id=$1", [
    deal.id,
  ]);
  expect(bill).toMatchObject({ unit_price: "300000.00", miscellaneous_fee: "12000.00" });
  expect(
    await query(
      "select position,unit_label,unit_price,miscellaneous_fee from bill_items where bill_id=$1 order by position",
      [bill.id],
    ),
  ).toEqual([
    {
      position: 0,
      unit_label: "Unit 101 Tower One",
      unit_price: "100000.00",
      miscellaneous_fee: "5000.00",
    },
    {
      position: 1,
      unit_label: "Unit 102 Tower One",
      unit_price: "200000.00",
      miscellaneous_fee: "7000.00",
    },
  ]);
  await page.reload();
  // A saved bill shows a read-only summary; both units reopen in the Edit bill form.
  await page.getByRole("button", { name: "Edit bill", exact: true }).click();
  const editBill = page.getByRole("dialog", { name: "Edit bill", exact: true });
  await expect(editBill.getByRole("group", { name: /^Unit \d+$/ })).toHaveCount(2);
  await expect(editBill.getByRole("textbox", { name: "Unit 1", exact: true })).toHaveValue(
    "Unit 101 Tower One",
  );
  await expect(
    editBill
      .getByRole("group", { name: "Unit 2", exact: true })
      .getByRole("textbox", { name: "Unit 2", exact: true }),
  ).toHaveValue("Unit 102 Tower One");
  await editBill.getByRole("button", { name: "Close", exact: true }).click();
  await expect(editBill).toBeHidden();
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: /^Payment for/ }).selectOption("reservation");
  await dialog.getByRole("textbox", { name: /^Amount/ }).fill("5000");
  await dialog.getByRole("button", { name: "Method", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Cash", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Invoice no.", exact: true }).fill("PW-RES-001");
  await dialog.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(dialog).toBeHidden();
  const [payment] = await query(
    "select id,amount,classification,reference_no from payments where bill_id=$1",
    [bill.id],
  );
  expect(payment).toMatchObject({
    amount: "5000.00",
    classification: "reservation",
    reference_no: "PW-RES-001",
  });
  // No reservation fee is set, so this payment moves the deal to Reservation on its own.
  expect(await query("select stage_id from deals where id=$1", [deal.id])).toEqual([
    { stage_id: reservation.id },
  ]);
  // The deal sits in Reservation on this payment, so voiding it is refused until the deal moves back.
  await page.goto(`/billing/${deal.id}`);
  await page.getByRole("button", { name: "Remove ₱5,000.00 payment", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove payment", exact: true })
    .click();
  await expect(
    page.getByText("The opportunity's stage depends on this payment. Move it back a stage first."),
  ).toBeVisible();
  expect(
    await query("select deleted_at is null as kept from payments where id=$1", [payment.id]),
  ).toEqual([{ kept: true }]);
  await query("update deals set stage_id=$1 where id=$2", [opportunity.id, deal.id]);
  await page.goto(`/billing/${deal.id}`);
  await page.getByRole("button", { name: "Remove ₱5,000.00 payment", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove payment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect
    .poll(async () =>
      query("select deleted_at is not null as removed from payments where id=$1", [payment.id]),
    )
    .toEqual([{ removed: true }]);
  const audit = await query(
    "select action from audit_logs where organization_id=$1 and entity_id=$2",
    [identity.organizationId, payment.id],
  );
  expect(audit.length).toBeGreaterThanOrEqual(2);
});

test("close the opportunity as lost with a reason", async ({ page, identity }) => {
  const stages = await seedStages(identity.organizationId);
  const contact = await consentingContact(identity.organizationId);
  const [reason] = await query(
    "insert into lost_reasons(organization_id,name) values($1,'Financing declined') returning id",
    [identity.organizationId],
  );
  const [deal] = await query(
    "insert into deals(organization_id,deal_code,title,stage_id,primary_agent_user_id,created_by) values($1,'pw-offer','Offer opportunity',$2,$3,$3) returning id",
    [identity.organizationId, stages[0].id, identity.userId],
  );
  await query(
    "insert into deal_contacts(deal_id,contact_id,role,is_primary) values($1,$2,'buyer',true)",
    [deal.id, contact],
  );
  await signIn(page, identity);
  await page.goto(`/deals/${deal.id}`);
  await expect(page.getByRole("button", { name: "Create offer", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Mark lost", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Loss reason", exact: true }).selectOption(reason.id);
  await dialog
    .getByRole("textbox", { name: "Notes (optional)", exact: true })
    .fill("The bank declined the application.");
  await dialog.getByRole("button", { name: "Mark lost", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(
    await query("select status,lost_reason_id,lost_notes,stage_id from deals where id=$1", [
      deal.id,
    ]),
  ).toEqual([
    {
      status: "lost",
      lost_reason_id: reason.id,
      lost_notes: "The bank declined the application.",
      stage_id: stages.find((stage) => stage.slug === "closed-lost")!.id,
    },
  ]);
});

test("administrator grants and revokes whole-property access for another user", async ({
  page,
  identity,
}) => {
  const [property] = await query(
    "insert into properties(organization_id,property_code,title,property_type) values($1,'pw-access','Access property','condominium') returning id",
    [identity.organizationId],
  );
  const [user] = await query(
    "insert into users(organization_id,email,first_name,last_name) values($1,$2,'Access','Recipient') returning id",
    [identity.organizationId, `access-${identity.organizationId}@example.invalid`],
  );
  await signIn(page, identity);
  // Next can stream a redirect with HTTP 200 and a meta redirect. Verify its
  // supported browser outcome, including the preserved selected person.
  await page.goto(`/properties/${property.id}/units?user=${user.id}`);
  await expect(page).toHaveURL(new RegExp(`/properties/${property.id}/access\\?user=${user.id}$`));
  await expect(page.getByRole("combobox", { name: "Person", exact: true })).toHaveValue(user.id);
  await page.getByRole("radio", { name: /^The whole property/ }).click();
  await page.getByRole("button", { name: "Give access", exact: true }).click();
  await expect
    .poll(async () =>
      query("select property_id,user_id from property_access_grants where property_id=$1", [
        property.id,
      ]),
    )
    .toEqual([{ property_id: property.id, user_id: user.id }]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Change", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Access removed.", { exact: true })).toBeVisible();
  expect(
    await query("select id from property_access_grants where property_id=$1", [property.id]),
  ).toEqual([]);
});

test("upload and remove unit photos, then remove the unit", async ({ page, identity }) => {
  const [property] = await query(
    "insert into properties(organization_id,property_code,title,property_type,floor_count,units_per_floor) values($1,'pw-images','Image property','condominium',1,1) returning id",
    [identity.organizationId],
  );
  const [floor] = await query(
    "insert into floors(building_id,level,label) values($1,1,'1st Floor') returning id",
    [property.id],
  );
  const [unit] = await query(
    "insert into units(building_id,floor_id,code) values($1,$2,'1A') returning id",
    [property.id, floor.id],
  );
  const png = {
    name: "property.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=",
      "base64",
    ),
  };
  await signIn(page, identity);
  await page.goto(`/properties/${property.id}`);
  await page.getByRole("button", { name: "Edit 1A picture", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const chooser = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Add picture", exact: true }).click();
  await (await chooser).setFiles(png);
  await expect
    .poll(async () => query("select image_mime_type from units where id=$1", [unit.id]))
    .toEqual([{ image_mime_type: "image/png" }]);
  await expect(dialog.getByRole("button", { name: "Remove picture", exact: true })).toBeEnabled();
  expect((await page.request.get(`/api/properties/units/${unit.id}/image`)).status()).toBe(200);
  await dialog.getByRole("button", { name: "Remove picture", exact: true }).click();
  await expect
    .poll(async () => query("select image_storage_key from units where id=$1", [unit.id]))
    .toEqual([{ image_storage_key: null }]);
  await expect(dialog.getByRole("button", { name: "Add picture", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove unit 1A", exact: true }).click();
  await expect.poll(async () => query("select id from units where id=$1", [unit.id])).toEqual([]);
  const audit = await query(
    "select action from audit_logs where organization_id=$1 and entity_id=$2 and entity_type='unit'",
    [identity.organizationId, unit.id],
  );
  expect(audit).toContainEqual({ action: "delete" });
});

test("bulk grant every property includes both existing properties for the chosen user", async ({
  page,
  identity,
}) => {
  const properties = await query(
    "insert into properties(organization_id,property_code,title,property_type) values($1,'pw-bulk-1','Bulk property one','condominium'),($1,'pw-bulk-2','Bulk property two','condominium') returning id",
    [identity.organizationId],
  );
  const [user] = await query(
    "insert into users(organization_id,email,first_name,last_name) values($1,$2,'Bulk','Recipient') returning id",
    [identity.organizationId, `bulk-${identity.organizationId}@example.invalid`],
  );
  await signIn(page, identity);
  await page.goto(`/properties/${properties[0].id}/access`);
  await page.getByRole("combobox", { name: "Person", exact: true }).selectOption(user.id);
  await page.getByRole("button", { name: "Give every property", exact: true }).click();
  await expect(page.getByText("Every property given to Bulk.", { exact: true })).toBeVisible();
  const grants = await query(
    "select property_id from property_access_grants where user_id=$1 order by property_id",
    [user.id],
  );
  expect(grants.map((grant) => grant.property_id).sort()).toEqual(
    properties.map((property) => property.id).sort(),
  );
});

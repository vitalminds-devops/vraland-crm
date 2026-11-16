import { test, expect } from "../fixtures/identity";
import { query, signIn } from "../helpers/browser";

test("present a property to a client and return to management", async ({ page, identity }) => {
  const [property] = await query(
    "insert into properties(organization_id,property_code,title,property_type,asking_price,address_line1,city) values($1,'pw-presentation','QA Tower 1','condominium',2300000,'Ortigas Avenue','Pasig City') returning id",
    [identity.organizationId],
  );
  const floors = await query(
    "insert into floors(building_id,level,label) values($1,1,'Floor 1'),($1,2,'Floor 2') returning id,level",
    [property.id],
  );
  for (const floor of floors) {
    await query("insert into units(building_id,floor_id,code) values($1,$2,$3)", [
      property.id,
      floor.id,
      `${floor.level}A`,
    ]);
  }
  await signIn(page, identity);
  await page.goto(`/properties/${property.id}`);
  await expect(page.getByRole("heading", { name: "QA Tower 1", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add floor", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Present to client" }).click();
  await expect(page).toHaveURL(/\?presentation=true$/);
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add floor", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Unit status", exact: true })).toHaveCount(0);
  await expect(page.getByText("₱2,300,000", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Floor 2/ }).click();
  // Scoped to the unit cards: the building sketch also has an SVG <title> "Unit 2A".
  await expect(page.getByRole("listitem").getByText("Unit 2A", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/property-presentation-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("link", { name: "Exit presentation" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/property-presentation-mobile.png", fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "Exit presentation" }).click();
  await expect(page).toHaveURL(new RegExp(`/properties/${property.id}$`));
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add floor", exact: true })).toBeVisible();
});

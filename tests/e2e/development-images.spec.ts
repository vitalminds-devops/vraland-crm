import { test, expect } from "../fixtures/identity";
import { query, signIn } from "../helpers/browser";

test.setTimeout(120_000);

test("edit a development and upload then remove its cover photo", async ({ page, identity }) => {
  const [development] = await query(
    "insert into developments(organization_id,code,name) values($1,'pw-cover','Original development') returning id",
    [identity.organizationId],
  );
  await signIn(page, identity);
  await page.goto(`/developments/${development.id}/edit`);
  const name = page.getByRole("textbox", { name: /^Name/ });
  await expect(name).toHaveValue("Original development");
  await name.fill("Updated development");
  await expect(name).toHaveValue("Updated development");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^Choose cover photo/ }).click();
  await (
    await chooser
  ).setFiles({
    name: "development.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByRole("img", { name: "Cover photo preview", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save development", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/developments/${development.id}$`));
  const [saved] = await query(
    "select name,cover_image_storage_key,cover_image_mime_type from developments where id=$1",
    [development.id],
  );
  expect(saved.name).toBe("Updated development");
  expect(saved.cover_image_storage_key).toBeTruthy();
  expect(saved.cover_image_mime_type).toBe("image/png");
  const image = await page.request.get(`/api/developments/${development.id}/cover`);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
  await page.goto(`/developments/${development.id}/edit`);
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect
    .poll(async () =>
      query("select cover_image_storage_key from developments where id=$1", [development.id]),
    )
    .toEqual([{ cover_image_storage_key: null }]);
  await expect(page.getByRole("button", { name: /^Choose cover photo/ })).toBeVisible();
  expect((await page.request.get(`/api/developments/${development.id}/cover`)).status()).toBe(404);
});

import { test, expect } from "../fixtures/identity";
import { signIn, query } from "../helpers/browser";
test.setTimeout(90_000);

test("upload, download and archive", async ({ page, identity }) => {
  await signIn(page, identity);
  await page.goto("/documents");
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("File name (optional)").fill("Playwright shared document");
  await expect(dialog.locator("select")).toHaveCount(0);
  const bytes = Buffer.from("%PDF-1.7\nSynthetic document for isolated tests.");
  await dialog
    .locator("input[type=file]")
    .setInputFiles({ name: "template.pdf", mimeType: "application/pdf", buffer: bytes });
  await dialog.getByRole("button", { name: "Upload securely" }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+$/, { timeout: 20_000 });
  const [record] = await query(
    "select id,name,status,file_size_bytes,category,contact_id,property_id,deal_id from documents where organization_id=$1",
    [identity.organizationId],
  );
  expect(record).toMatchObject({
    name: "Playwright shared document",
    category: "shared_file",
    contact_id: null,
    property_id: null,
    deal_id: null,
  });
  await expect(page.getByRole("link", { name: "Print / Save as PDF" })).toHaveAttribute(
    "href",
    `/api/documents/${record.id}/download?inline=1`,
  );
  const file = await page.request.get(`/api/documents/${record.id}/download`);
  expect(file.status()).toBe(200);
  expect(await file.body()).toEqual(bytes);
  expect(file.headers()["content-disposition"]).toContain("Playwright shared document.pdf");
  // Archiving is done from the list row.
  await page.goto("/documents");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("row")
    .filter({ hasText: "Playwright shared document" })
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expect
    .poll(
      async () => (await query("select status from documents where id=$1", [record.id]))[0].status,
    )
    .toBe("archived");
});

for (const invalid of [
  {
    name: "empty",
    bytes: Buffer.alloc(0),
    type: "application/pdf",
    message: /is empty/,
  },
  {
    name: "forged-pdf",
    bytes: Buffer.from("not a PDF"),
    type: "application/pdf",
    message: /contents do not match/,
  },
])
  test(`document upload rejects ${invalid.name} without metadata`, async ({ page, identity }) => {
    await signIn(page, identity);
    await page.goto("/documents");
    await page.getByRole("button", { name: "Upload file", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("File name (optional)").fill("Invalid file");
    await dialog.locator("input[type=file]").setInputFiles({
      name: invalid.name + ".pdf",
      mimeType: invalid.type,
      buffer: invalid.bytes,
    });
    await dialog.getByRole("button", { name: "Upload securely" }).click();
    await expect(page.getByText(invalid.message)).toBeVisible();
    expect(
      await query("select id from documents where organization_id=$1", [identity.organizationId]),
    ).toEqual([]);
  });

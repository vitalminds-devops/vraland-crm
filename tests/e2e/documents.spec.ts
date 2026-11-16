import { test, expect } from "../fixtures/identity";
import { signIn, query } from "../helpers/browser";
test.setTimeout(90_000);

test("upload, download and archive", async ({ page, identity }) => {
  await signIn(page, identity);
  await page.goto("/documents");
  await page.getByRole("button", { name: "Upload document", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Name (optional)").fill("Playwright client document");
  // Existing selects/file input have no accessible labels; scope to this dialog.
  await dialog.locator("select[name=documentType]").selectOption({ label: "Other" });
  const bytes = Buffer.from("Synthetic document for isolated tests.");
  await dialog
    .locator("input[type=file]")
    .setInputFiles({ name: "client.txt", mimeType: "text/plain", buffer: bytes });
  await dialog.getByRole("button", { name: "Upload securely" }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+$/, { timeout: 20_000 });
  const [record] = await query(
    "select id,name,status,file_size_bytes from documents where organization_id=$1",
    [identity.organizationId],
  );
  expect(record.name).toBe("Playwright client document");
  const file = await page.request.get(`/api/documents/${record.id}/download`);
  expect(file.status()).toBe(200);
  expect(await file.body()).toEqual(bytes);
  // Archiving is done from the list row.
  await page.goto("/documents");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("row")
    .filter({ hasText: "Playwright client document" })
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
    type: "text/plain",
    message: /Files must be between 1 byte and 15 MB/,
  },
  {
    name: "forged-pdf",
    bytes: Buffer.from("not a PDF"),
    type: "application/pdf",
    message: /Only PDF, DOCX, JPEG, PNG, and plain-text/,
  },
])
  test(`document upload rejects ${invalid.name} without metadata`, async ({ page, identity }) => {
    await signIn(page, identity);
    await page.goto("/documents");
    await page.getByRole("button", { name: "Upload document", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Name (optional)").fill("Invalid file");
    await dialog.locator("select[name=documentType]").selectOption({ label: "Other" });
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

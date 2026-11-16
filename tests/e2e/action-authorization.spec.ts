import { test, expect } from "../fixtures/identity";
import { query, signIn } from "../helpers/browser";
test.setTimeout(90_000);

test("revoked archive permission cannot be bypassed by replaying an observed Server Action", async ({
  page,
  identity,
}) => {
  const [contact] = await query(
    "insert into contacts(organization_id,contact_code,first_name,last_name) values($1,'pw-action','Boundary','Buyer') returning id",
    [identity.organizationId],
  );
  await signIn(page, identity);
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Actions for Buyer, Boundary", exact: true }).click();
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
  const observed = page.waitForRequest(
    (request) => request.method() === "POST" && Boolean(request.headers()["next-action"]),
  );
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  const original = await observed;
  await expect
    .poll(
      async () =>
        (await query("select deleted_at from contacts where id=$1", [contact.id]))[0].deleted_at !==
        null,
    )
    .toBe(true);
  await query("update contacts set deleted_at=null where id=$1", [contact.id]);
  await query(
    "delete from role_permissions where role_id in(select role_id from user_roles where user_id=$1) and permission_id in(select id from permissions where key='contacts.delete')",
    [identity.userId],
  );
  const captured = await original.allHeaders();
  const headers: Record<string, string> = {};
  for (const name of ["content-type", "next-action", "next-router-state-tree", "origin"])
    if (captured[name]) headers[name] = captured[name];
  // Use the action reference and payload observed from this build's real UI.
  // The browser context supplies its own session; no action IDs/cookies are hardcoded.
  const denied = await page.request.post(original.url(), {
    headers,
    data: original.postDataBuffer()!,
  });
  expect(denied.status()).toBe(200); // Structured ActionResult failure, not HTTP success alone.
  expect(await denied.text()).toContain("You can't archive contacts.");
  expect(
    (await query("select deleted_at from contacts where id=$1", [contact.id]))[0].deleted_at,
  ).toBeNull();
});

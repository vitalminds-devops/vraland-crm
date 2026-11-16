import { test, expect } from "../fixtures/identity";
import { query, signIn } from "../helpers/browser";

test.describe("broker team", () => {
  test.use({ role: "broker" });
  test("My team contains direct members and excludes unrelated and deleted users", async ({
    page,
    identity,
  }) => {
    await query(
      "insert into users(organization_id,email,first_name,last_name,broker_id) values($1,$2,'Direct','Member',$3),($1,$4,'Other','Member',null)",
      [
        identity.organizationId,
        `direct-${identity.userId}@example.invalid`,
        identity.userId,
        `other-${identity.userId}@example.invalid`,
      ],
    );
    await query(
      "insert into users(organization_id,email,first_name,last_name,broker_id,deleted_at) values($1,$2,'Deleted','Member',$3,now())",
      [identity.organizationId, `deleted-${identity.userId}@example.invalid`, identity.userId],
    );
    await signIn(page, identity);
    await page.goto("/my-team");
    await expect(page.getByRole("heading", { name: "My team", exact: true })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Direct Member" })).toHaveCount(1);
    await expect(
      page.getByRole("row").filter({ hasText: /Other Member|Deleted Member/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "My team", exact: true })).toBeVisible();
  });
});
test("administrator without a team-lead role cannot enter My team", async ({ page, identity }) => {
  await signIn(page, identity);
  await page.goto("/my-team");
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByText("Access denied", { exact: true })).toBeVisible();
});

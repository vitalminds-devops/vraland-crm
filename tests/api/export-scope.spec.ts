import { test, expect } from "../helpers/file-fixtures";
import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { dataScopePermissions } from "../../src/lib/permissions/catalog";
test.use({ role: "agent" });

test("CSV export enforces own, direct-team and organization scope without leaking foreign or archived rows", async ({
  request,
  identity,
  files,
}) => {
  const team = randomUUID(),
    peer = randomUUID();
  for (const [id, broker] of [
    [team, identity.userId],
    [peer, null],
  ]) {
    await files.client.query(
      "insert into users(id,organization_id,email,first_name,last_name,broker_id) values($1,$2,$3,$4,$5,$6)",
      [id, identity.organizationId, id + "@example.invalid", "Scope", "User", broker],
    );
  }
  await files.client.query(
    `insert into role_permissions(role_id,permission_id) select ur.role_id,p.id from user_roles ur cross join permissions p where ur.user_id=$1 and p.key='contacts.export'`,
    [identity.userId],
  );
  const foreign = await files.foreignOrganization();
  for (const [marker, org, owner, archived] of [
    ["own", identity.organizationId, identity.userId, false],
    ["team", identity.organizationId, team, false],
    ["peer", identity.organizationId, peer, false],
    ["archived", identity.organizationId, identity.userId, true],
    ["foreign", foreign.organizationId, foreign.userId, false],
  ] as const) {
    await files.client.query(
      `insert into contacts(organization_id,contact_code,first_name,last_name,email,assigned_user_id,deleted_at) values($1,$2,$2,'Scope',$3,$4,$5)`,
      [org, marker, marker + "@example.invalid", owner, archived ? new Date() : null],
    );
  }
  expect(
    (
      await request.post("/api/auth/sign-in/email", {
        data: { email: identity.email, password: identity.password },
      })
    ).status(),
  ).toBe(200);
  for (const [scope, emails] of [
    ["own", ["own@example.invalid"]],
    ["broker_team", ["own@example.invalid", "team@example.invalid"]],
    ["organization", ["own@example.invalid", "peer@example.invalid", "team@example.invalid"]],
  ] as const) {
    // The agent role gives own records; the user's own permission widens it for this step.
    await files.client.query("delete from user_permissions where user_id=$1", [identity.userId]);
    await files.client.query(
      "insert into user_permissions(user_id,permission_key,granted) values($1,$2,true)",
      [identity.userId, dataScopePermissions[scope]],
    );
    const response = await request.get("/api/contacts/export");
    expect(response.status()).toBe(200);
    const rows = parse(await response.text(), { columns: true }) as { email: string }[];
    expect(rows.map((row) => row.email).sort()).toEqual([...emails].sort());
  }
});

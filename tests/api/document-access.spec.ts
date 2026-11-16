import { test, expect, fileBytes } from "../helpers/file-fixtures";
import { randomUUID } from "node:crypto";
import { seedStages } from "../helpers/database";
test.use({ role: "agent" });

test("document sensitivity permission supplements rather than replaces ownership scope", async ({
  request,
  identity,
  files,
}) => {
  const ids = await files.seed();
  await files.client.query("update documents set created_by=$1 where id=$2", [
    identity.userId,
    ids.document,
  ]);
  expect(
    (
      await request.post("/api/auth/sign-in/email", {
        data: { email: identity.email, password: identity.password },
      })
    ).status(),
  ).toBe(200);
  const download = () => request.get(`/api/documents/${ids.document}/download`);
  expect((await download()).status()).toBe(200);
  await files.client.query("update documents set is_sensitive=true where id=$1", [ids.document]);
  expect((await download()).status()).toBe(404);
  await files.client.query(
    "insert into role_permissions(role_id,permission_id) select ur.role_id,p.id from user_roles ur cross join permissions p where ur.user_id=$1 and p.key='documents.view_sensitive'",
    [identity.userId],
  );
  const allowed = await download();
  expect(allowed.status()).toBe(200);
  expect(await allowed.body()).toEqual(fileBytes);
  await files.client.query("update documents set created_by=null where id=$1", [ids.document]);
  expect((await download()).status()).toBe(404);
});

test("deal participants can read their sensitive files but lose access when the record leaves their scope", async ({
  request,
  identity,
  files,
}) => {
  const ids = await files.seed();
  const [stage] = await seedStages(identity.organizationId);
  const deal = randomUUID();
  await files.client.query(
    "insert into deals(id,organization_id,deal_code,title,stage_id,primary_agent_user_id) values($1,$2,$3,$4,$5,$6)",
    [
      deal,
      identity.organizationId,
      "pw-sensitive",
      "Sensitive opportunity",
      stage.id,
      identity.userId,
    ],
  );
  await files.client.query("update documents set deal_id=$1,is_sensitive=true where id=$2", [
    deal,
    ids.document,
  ]);
  expect(
    (
      await request.post("/api/auth/sign-in/email", {
        data: { email: identity.email, password: identity.password },
      })
    ).status(),
  ).toBe(200);
  const allowed = await request.get(`/api/documents/${ids.document}/download`);
  expect(allowed.status()).toBe(200);
  expect(await allowed.body()).toEqual(fileBytes);
  await files.client.query("update deals set primary_agent_user_id=null where id=$1", [deal]);
  expect((await request.get(`/api/documents/${ids.document}/download`)).status()).toBe(404);
});

test("user documents follow users.manage, whatever the role", async ({
  request,
  identity,
  files,
}) => {
  const ids = await files.seed();
  expect(
    (
      await request.post("/api/auth/sign-in/email", {
        data: { email: identity.email, password: identity.password },
      })
    ).status(),
  ).toBe(200);
  for (const suffix of ["download", "preview"])
    expect(
      (await request.get(`/api/settings/user-documents/${ids.userDocument}/${suffix}`)).status(),
    ).toBe(403);
  await files.client.query(
    "insert into role_permissions(role_id,permission_id) select ur.role_id,p.id from user_roles ur cross join permissions p where ur.user_id=$1 and p.key='users.manage'",
    [identity.userId],
  );
  // Permissions alone decide access now, so the agent holding users.manage reaches the document.
  for (const suffix of ["download", "preview"])
    expect(
      (await request.get(`/api/settings/user-documents/${ids.userDocument}/${suffix}`)).status(),
    ).toBe(200);
});

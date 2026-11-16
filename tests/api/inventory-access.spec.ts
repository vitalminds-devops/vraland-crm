import { test, expect } from "../helpers/file-fixtures";
import { randomUUID } from "node:crypto";
test.use({ role: "agent" });

test("selectors enforce no grant, floor grant, exclusions, revocation and organization boundary", async ({
  request,
  identity,
  files,
}) => {
  const ids = await files.seed();
  const foreign = await files.foreignOrganization();
  const foreignIds = await files.seed(foreign.organizationId, foreign.userId);
  expect(
    (
      await request.post("/api/auth/sign-in/email", {
        data: { email: identity.email, password: identity.password },
      })
    ).status(),
  ).toBe(200);
  const properties = () =>
    request.get("/api/properties", { params: { developmentId: ids.development } });
  const floors = () =>
    request.get("/api/properties/floors", { params: { buildingId: ids.property } });
  const units = () => request.get("/api/properties/units", { params: { floorId: ids.floor } });
  expect(await (await properties()).json()).toEqual([]);
  expect(await (await floors()).json()).toEqual([]);
  expect(await (await units()).json()).toEqual({ units: [], omitted: 0 });
  const grant = randomUUID();
  await files.client.query(
    "insert into property_access_grants(id,user_id,property_id) values($1,$2,$3)",
    [grant, identity.userId, ids.property],
  );
  await files.client.query(
    "insert into property_access_grant_targets(grant_id,floor_id) values($1,$2)",
    [grant, ids.floor],
  );
  expect(await (await properties()).json()).toEqual([
    {
      id: ids.property,
      title: "File building",
      addressLine1: null,
      askingPrice: null,
      currency: "PHP",
      parkingPrice: null,
      parkingSpaces: null,
    },
  ]);
  expect(await (await floors()).json()).toEqual([
    {
      id: ids.floor,
      level: 1,
      label: "File floor",
      imageUrl: `/api/properties/floors/${ids.floor}/image`,
    },
  ]);
  expect(await (await units()).json()).toMatchObject({
    units: [{ id: ids.unit, code: "1A" }],
    omitted: 0,
  });
  await files.client.query(
    "insert into property_access_grant_targets(grant_id,unit_id,is_exclusion) values($1,$2,true)",
    [grant, ids.unit],
  );
  expect(await (await units()).json()).toEqual({ units: [], omitted: 1 });
  expect(
    await (
      await request.get("/api/properties", { params: { developmentId: foreignIds.development } })
    ).json(),
  ).toEqual([]);
  expect(
    await (
      await request.get("/api/properties/floors", { params: { buildingId: foreignIds.property } })
    ).json(),
  ).toEqual([]);
  expect(
    await (
      await request.get("/api/properties/units", { params: { floorId: foreignIds.floor } })
    ).json(),
  ).toEqual({ units: [], omitted: 0 });
  await files.client.query("delete from property_access_grants where id=$1", [grant]);
  expect(await (await properties()).json()).toEqual([]);
});

test("revoked properties.view denies all three selectors even when a grant exists", async ({
  request,
  identity,
  files,
}) => {
  const ids = await files.seed();
  await files.client.query(
    `delete from role_permissions where role_id in(select role_id from user_roles where user_id=$1) and permission_id in(select id from permissions where key='properties.view')`,
    [identity.userId],
  );
  expect(
    (
      await request.post("/api/auth/sign-in/email", {
        data: { email: identity.email, password: identity.password },
      })
    ).status(),
  ).toBe(200);
  for (const [path, name, id] of [
    ["/api/properties", "developmentId", ids.development],
    ["/api/properties/floors", "buildingId", ids.property],
    ["/api/properties/units", "floorId", ids.floor],
  ]) {
    const response = await request.get(path, { params: { [name]: id } });
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
  }
});

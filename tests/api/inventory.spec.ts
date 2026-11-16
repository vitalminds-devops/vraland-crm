import { test, expect } from "../fixtures/identity";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
test("property selectors return seeded hierarchy and return empty for nonexistent development", async ({
  request,
  identity,
}) => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const development = randomUUID(),
    building = randomUUID(),
    floor = randomUUID(),
    unit = randomUUID();
  try {
    await client.query(
      "insert into developments(id,organization_id,code,name) values($1::uuid,$2,$1::text,$3)",
      [development, identity.organizationId, "Test development"],
    );
    await client.query(
      "insert into properties(id,organization_id,development_id,property_code,title,property_type) values($1::uuid,$2,$3,$1::text,$4,$5)",
      [building, identity.organizationId, development, "Test building", "condominium"],
    );
    await client.query("insert into floors(id,building_id,level,label) values($1,$2,1,$3)", [
      floor,
      building,
      "First floor",
    ]);
    await client.query("insert into units(id,building_id,floor_id,code) values($1,$2,$3,$4)", [
      unit,
      building,
      floor,
      "1A",
    ]);
    expect(
      (
        await request.post("/api/auth/sign-in/email", {
          data: { email: identity.email, password: identity.password },
        })
      ).status(),
    ).toBe(200);
    const properties = await request.get("/api/properties", {
      params: { developmentId: development },
    });
    expect(properties.status()).toBe(200);
    expect(await properties.json()).toEqual([
      {
        id: building,
        title: "Test building",
        addressLine1: null,
        askingPrice: null,
        currency: "PHP",
        parkingPrice: null,
        parkingSpaces: null,
      },
    ]);
    const floors = await request.get("/api/properties/floors", {
      params: { buildingId: building },
    });
    expect(floors.status()).toBe(200);
    expect(await floors.json()).toEqual([
      { id: floor, level: 1, label: "First floor", imageUrl: null },
    ]);
    const units = await request.get("/api/properties/units", { params: { floorId: floor } });
    expect(units.status()).toBe(200);
    expect(await units.json()).toMatchObject({
      units: [{ id: unit, code: "1A", status: "available" }],
      omitted: 0,
    });
    const absent = await request.get("/api/properties", {
      params: { developmentId: randomUUID() },
    });
    expect(absent.status()).toBe(200);
    expect(await absent.json()).toEqual([]);
  } finally {
    await client.end();
  }
});

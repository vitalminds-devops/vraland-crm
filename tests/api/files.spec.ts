import { randomUUID } from "node:crypto";
import { test, expect, fileRoutes, fileBytes, fileName } from "../helpers/file-fixtures";

test.beforeEach(async ({ request, identity }) => {
  const login = await request.post("/api/auth/sign-in/email", {
    data: { email: identity.email, password: identity.password },
  });
  expect(login.status()).toBe(200);
});

for (const route of fileRoutes) {
  test(`${route.name}: exact bytes and secure response headers`, async ({ request, files }) => {
    const ids = await files.seed();
    const response = await request.get(route.path.replace("ID", ids[route.record]));
    expect(response.status()).toBe(200);
    expect(await response.body()).toEqual(fileBytes);
    const headers = response.headers();
    expect(headers["content-type"]).toBe(route.image ? "image/png" : "application/pdf");
    expect(headers["cache-control"]).toBe("private, no-store");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    if (route.image || route.path.endsWith("/preview")) {
      expect(headers["content-security-policy"]).toBe(
        "default-src 'none'; frame-ancestors 'self'; sandbox",
      );
    }
    if (!route.image) {
      const disposition = route.path.endsWith("/preview") ? "inline" : "attachment";
      expect(headers["content-disposition"]).toBe(
        `${disposition}; filename="Quarterly _report_ r_sum_.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );
    }
  });

  test(`${route.name}: nonexistent record is concealed`, async ({ request }) => {
    const response = await request.get(route.path.replace("ID", randomUUID()));
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  test(`${route.name}: missing stored bytes return 404`, async ({ request, files }) => {
    const ids = await files.seed(undefined, undefined, true);
    const response = await request.get(route.path.replace("ID", ids[route.record]));
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe(route.image ? "Picture unavailable" : "File unavailable");
  });

  test(`${route.name}: cross-organization record is concealed`, async ({ request, files }) => {
    const foreign = await files.foreignOrganization();
    const ids = await files.seed(foreign.organizationId, foreign.userId);
    const response = await request.get(route.path.replace("ID", ids[route.record]));
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe("Not found");
  });
}

for (const mime of ["application/zip", null]) {
  test(`user document preview: rejects ${mime ?? "absent"} MIME`, async ({ request, files }) => {
    const ids = await files.seed();
    await files.client.query("update documents set mime_type=$1 where id=$2", [
      mime,
      ids.userDocument,
    ]);
    const response = await request.get(`/api/settings/user-documents/${ids.userDocument}/preview`);
    expect(response.status()).toBe(415);
    expect(await response.text()).toBe("Preview unavailable for this file type");
  });
}

const imageTables = {
  development: ["developments", "cover_image_storage_key"],
  property: ["properties", "cover_image_storage_key"],
  floor: ["floors", "image_storage_key"],
  unit: ["units", "image_storage_key"],
} as const;
for (const route of fileRoutes.filter((route) => route.image)) {
  test(`${route.name}: absent storage metadata returns 404`, async ({ request, files }) => {
    const ids = await files.seed();
    const [table, column] = imageTables[route.record as keyof typeof imageTables];
    await files.client.query(`update ${table} set ${column}=null where id=$1`, [ids[route.record]]);
    const response = await request.get(route.path.replace("ID", ids[route.record]));
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe("Not found");
  });
}

test.describe("same-organization inventory grant enforcement", () => {
  test.use({ role: "agent" });
  for (const route of fileRoutes.filter((route) =>
    ["property", "floor", "unit"].includes(route.record),
  )) {
    test(`${route.name}: agent without a property grant cannot read bytes`, async ({
      request,
      files,
    }) => {
      const ids = await files.seed();
      // No grant exists: knowing an inventory UUID must not bypass its access policy.
      const response = await request.get(route.path.replace("ID", ids[route.record]));
      expect(response.status()).toBe(404);
      expect(await response.text()).toBe("Not found");
    });
  }

  test("unit image: a floor grant cannot expose an explicitly excluded unit", async ({
    request,
    identity,
    files,
  }) => {
    const ids = await files.seed(),
      grant = randomUUID();
    await files.client.query(
      "insert into property_access_grants(id,user_id,property_id) values($1,$2,$3)",
      [grant, identity.userId, ids.property],
    );
    await files.client.query(
      "insert into property_access_grant_targets(grant_id,floor_id) values($1,$2)",
      [grant, ids.floor],
    );
    await files.client.query(
      "insert into property_access_grant_targets(grant_id,unit_id,is_exclusion) values($1,$2,true)",
      [grant, ids.unit],
    );
    const response = await request.get(`/api/properties/units/${ids.unit}/image`);
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe("Not found");
  });
});

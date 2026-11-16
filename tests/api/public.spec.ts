import { test, expect } from "@playwright/test";
test("API-01 health contract", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({ status: "ok" });
  expect(r.headers()["cache-control"]).toContain("no-store");
});
for (const [route, param] of [
  ["/api/properties", "developmentId"],
  ["/api/properties/floors", "buildingId"],
  ["/api/properties/units", "floorId"],
]) {
  test(route + " rejects missing query", async ({ request }) => {
    const r = await request.get(route);
    expect(r.status()).toBe(400);
    expect(await r.json()).toEqual({ error: param + " is required" });
  });
  test(route + " requires authentication", async ({ request }) => {
    const r = await request.get(route, {
      params: { [param]: "00000000-0000-4000-8000-000000000001" },
    });
    expect(r.status()).toBe(401);
    expect(await r.json()).toEqual({ error: "Authentication is required" });
  });
}
const files = [
  "/api/developments/ID/cover",
  "/api/properties/floors/ID/image",
  "/api/properties/units/ID/image",
  "/api/documents/ID/download",
  "/api/settings/user-documents/ID/download",
  "/api/settings/user-documents/ID/preview",
];
for (const route of files) {
  test(route + " malformed identifier", async ({ request }) => {
    const r = await request.get(route.replace("ID", "invalid"));
    expect(r.status()).toBe(404);
    expect(await r.text()).toBe("Not found");
  });
  test(route + " requires authentication", async ({ request }) => {
    const r = await request.get(route.replace("ID", "00000000-0000-4000-8000-000000000001"));
    expect(r.status()).toBe(401);
    expect(await r.text()).toBe("Authentication is required");
  });
}
test("CSV export requires authentication", async ({ request }) => {
  const r = await request.get("/api/contacts/export");
  expect(r.status()).toBe(401);
  expect(await r.text()).toBe("Authentication is required");
});

test("removed property-cover endpoint is no longer exposed", async ({ request }) => {
  const response = await request.get("/api/properties/00000000-0000-4000-8000-000000000001/cover");
  expect(response.status()).toBe(404);
});

import { test, expect } from "../fixtures/identity";

for (const route of [
  "/api/health",
  "/api/contacts/export",
  "/api/properties",
  "/api/properties/floors",
  "/api/properties/units",
  "/api/documents/00000000-0000-4000-8000-000000000001/download",
]) {
  test(`${route} rejects unsupported POST`, async ({ request }) => {
    const result = await request.post(route, { data: {} });
    expect(result.status()).toBe(405);
  });
}

for (const [route, parameter] of [
  ["/api/properties", "developmentId"],
  ["/api/properties/floors", "buildingId"],
  ["/api/properties/units", "floorId"],
]) {
  test(`${route} malformed identifiers are client errors rather than server errors`, async ({
    request,
    identity,
  }) => {
    expect(
      (
        await request.post("/api/auth/sign-in/email", {
          data: { email: identity.email, password: identity.password },
        })
      ).status(),
    ).toBe(200);
    const result = await request.get(route, { params: { [parameter]: "not-a-uuid" } });
    // Requirement: invalid input must not surface an internal server error.
    // Do not accept the current database exception as successful validation.
    expect([400, 404]).toContain(result.status());
    expect(await result.json()).toHaveProperty("error");
  });
}

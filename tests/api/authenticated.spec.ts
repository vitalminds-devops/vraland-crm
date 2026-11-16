import { test, expect } from "../fixtures/identity";
import { rolePermissionDefaults, type RoleSlug } from "../../src/lib/permissions/catalog";
for (const role of Object.keys(rolePermissionDefaults) as RoleSlug[]) {
  test.describe(role, () => {
    test.use({ role, extraHTTPHeaders: { Origin: "http://127.0.0.1:3100" } });
    test("login, scoped export, session and logout", async ({ request, identity }) => {
      const login = await request.post("/api/auth/sign-in/email", {
        data: { email: identity.email, password: identity.password },
      });
      expect(login.status()).toBe(200);
      const session = await request.get("/api/auth/get-session");
      expect(session.status()).toBe(200);
      expect((await session.json()).user.email).toBe(identity.email);
      const csv = await request.get("/api/contacts/export");
      if ((rolePermissionDefaults[role] as readonly string[]).includes("contacts.export")) {
        expect(csv.status()).toBe(200);
        expect(csv.headers()["content-type"]).toContain("text/csv");
        expect(await csv.text()).not.toContain("@example.invalid");
      } else {
        expect(csv.status()).toBe(403);
      }
      const logout = await request.post("/api/auth/sign-out", { data: {} });
      expect(logout.status()).toBe(200);
      expect(await (await request.get("/api/auth/get-session")).json()).toBeNull();
    });
  });
}

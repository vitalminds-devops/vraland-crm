import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it, vi } from "vitest";
import { sensitiveDocumentCondition } from "./document-scope";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions/property-access", () => ({ grantedPropertyCondition: vi.fn() }));

const render = (roles: string[], permissions: string[]) =>
  new PgDialect().sqlToQuery(
    sensitiveDocumentCondition({
      authUserId: "auth",
      userId: "user",
      organizationId: "org",
      roles,
      permissions: new Set(permissions),
    }),
  ).sql;

it("lets the permission alone open sensitive documents, whatever the role", () => {
  expect(render(["agent"], ["documents.view_sensitive"])).toBe("true");
  // Unticked on a Sales Manager or Administrator, it now takes effect.
  for (const role of ["sales-manager", "administrator", "super-administrator"])
    expect(render([role], ["documents.view"])).toContain('"is_sensitive"');
});

import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { expect, it, vi } from "vitest";
import { properties } from "@/db/schema";
import { wholePropertyGrantCondition } from "./property-access";

vi.mock("server-only", () => ({}));
// Builds queries only; nothing connects.
vi.mock("@/db", () => ({ db: drizzle.mock() }));

const render = (roles: string[], permissions: string[] = []) =>
  new PgDialect().sqlToQuery(
    wholePropertyGrantCondition(
      {
        authUserId: "a",
        userId: "u",
        organizationId: "o",
        roles,
        permissions: new Set(permissions),
      },
      { propertyId: properties.id },
    ),
  ).sql;

it("needs a grant with no floors, units or slots picked to change a property", () => {
  const sql = render(["master-broker"]);
  expect(sql).toContain('from "property_access_grants"');
  // Any target at all (picked or left out) makes the grant partial.
  expect(sql).toMatch(/not exists \(select .* from "property_access_grant_targets"/);
  expect(sql).not.toContain('"is_exclusion"');
});

it("lets Access all properties change any property without a grant, not the role name", () => {
  expect(render(["agent"], ["properties.access_all"])).toBe("true");
  expect(render(["administrator"])).not.toBe("true");
});

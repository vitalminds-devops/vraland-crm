import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { roleDataScopeDefaults } from "@/lib/permissions/catalog";

const migration = readFileSync(resolve(__dirname, "0048_data_access_permissions.sql"), "utf8");

it("gives every built-in role the data access the catalog gave it", () => {
  const groups = [...migration.matchAll(/WHEN r\.slug IN \(([^)]*)\)\s*THEN '(\w+)'/g)];
  const scopeBySlug = Object.fromEntries(
    groups.flatMap(([, slugs, scope]) =>
      [...slugs.matchAll(/'([^']+)'/g)].map(([, slug]) => [slug, scope]),
    ),
  );
  expect(scopeBySlug).toEqual(roleDataScopeDefaults);
});

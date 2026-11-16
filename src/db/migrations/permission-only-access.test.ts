import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import {
  brokerAccessRoleSlugs,
  rolePermissionDefaults,
  type RoleSlug,
} from "@/lib/permissions/catalog";

const migration = readFileSync(resolve(__dirname, "0049_permission_only_access.sql"), "utf8");

/** The role slugs one `JOIN permissions p ON p.key = '<key>' WHERE r.slug IN (...)` block grants. */
function grantedTo(key: string) {
  const block = migration.match(
    new RegExp(`p\\.key = '${key.replace(".", "\\.")}'\\s*WHERE r\\.slug IN \\(([^)]*)\\)`),
  );
  return [...(block?.[1] ?? "").matchAll(/'([^']+)'/g)].map(([, slug]) => slug).sort();
}

it("gives Move opportunities back to every built-in role whose defaults have it", () => {
  const expected = (Object.keys(rolePermissionDefaults) as RoleSlug[])
    .filter((slug) =>
      (rolePermissionDefaults[slug] as readonly string[]).includes("deals.move_back"),
    )
    .sort();
  expect(grantedTo("deals.move_back")).toEqual(expected);
});

it("gives View billing to every broker-type role", () => {
  expect(grantedTo("billing.view")).toEqual([...brokerAccessRoleSlugs].sort());
});

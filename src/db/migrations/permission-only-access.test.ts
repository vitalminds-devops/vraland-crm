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

it("keeps sensitive documents readable for every built-in role whose defaults have the permission", () => {
  const sql = readFileSync(
    resolve(__dirname, "0073_sensitive_documents_by_permission.sql"),
    "utf8",
  );
  const granted = [...(sql.match(/r\.slug IN \(([^)]*)\)/)?.[1] ?? "").matchAll(/'([^']+)'/g)]
    .map(([, slug]) => slug)
    .sort();
  // The roles that used to read them by name all have it by default, so access is unchanged.
  for (const slug of granted)
    expect(rolePermissionDefaults[slug as RoleSlug]).toContain("documents.view_sensitive");
  expect(granted).toEqual(["administrator", "sales-manager", "super-administrator"]);
});

it("gives Invite others to events to every broker-type role, like the catalog", () => {
  const sql = readFileSync(resolve(__dirname, "0075_broker_roles_invite_to_events.sql"), "utf8");
  const granted = [...(sql.match(/r\.slug IN \(([^)]*)\)/)?.[1] ?? "").matchAll(/'([^']+)'/g)]
    .map(([, slug]) => slug)
    .sort();
  expect(granted).toEqual([...brokerAccessRoleSlugs].sort());
  for (const slug of granted)
    expect(rolePermissionDefaults[slug as RoleSlug]).toContain("calendar.assign");
});

it("gives Access all properties and Manage shared files only to the roles that had them by name", () => {
  const sql = readFileSync(resolve(__dirname, "0076_access_all_and_shared_files.sql"), "utf8");
  const granted = [...(sql.match(/r\.slug IN \(([^)]*)\)/)?.[1] ?? "").matchAll(/'([^']+)'/g)]
    .map(([, slug]) => slug)
    .sort();
  expect(granted).toEqual(["administrator", "super-administrator"]);
  for (const key of ["properties.access_all", "documents.manage_shared"] as const) {
    const holders = (Object.keys(rolePermissionDefaults) as RoleSlug[])
      .filter((slug) => (rolePermissionDefaults[slug] as readonly string[]).includes(key))
      .sort();
    expect(holders).toEqual(granted);
  }
});

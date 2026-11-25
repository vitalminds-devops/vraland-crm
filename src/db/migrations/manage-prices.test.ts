import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { rolePermissionDefaults, type RoleSlug } from "@/lib/permissions/catalog";

it("gives Manage prices to exactly the built-in roles that manage units", () => {
  for (const slug of Object.keys(rolePermissionDefaults) as RoleSlug[]) {
    const keys = rolePermissionDefaults[slug] as readonly string[];
    expect([slug, keys.includes("properties.manage_prices")]).toEqual([
      slug,
      keys.includes("properties.manage_units"),
    ]);
  }
});

it("copies Manage prices from manage units on existing roles and user changes", () => {
  const sql = readFileSync(resolve(__dirname, "0074_manage_prices_permission.sql"), "utf8");
  expect(sql).toContain(`units."key" = 'properties.manage_units'`);
  expect(sql).toContain(`WHERE up."permission_key" = 'properties.manage_units'`);
  expect(sql.match(/ON CONFLICT/g)).toHaveLength(3);
});

it("gives Export opportunities to exactly the built-in roles that view opportunities", () => {
  for (const slug of Object.keys(rolePermissionDefaults) as RoleSlug[]) {
    const keys = rolePermissionDefaults[slug] as readonly string[];
    expect([slug, keys.includes("deals.export")]).toEqual([slug, keys.includes("deals.view")]);
  }
  const sql = readFileSync(resolve(__dirname, "0077_export_opportunities.sql"), "utf8");
  expect(sql).toContain(`v."key" = 'deals.view'`);
  expect(sql.match(/ON CONFLICT/g)).toHaveLength(3);
});

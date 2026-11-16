import { expect, it } from "vitest";
import {
  brokerAccessRoleSlugs,
  roleDataScopeDefaults,
  rolePermissionDefaults,
  type RoleSlug,
} from "./catalog";
import { resolveDataScope } from "./policy";

const defaultScope = (slug: RoleSlug) =>
  resolveDataScope({ permissions: new Set(rolePermissionDefaults[slug]) });

it("lets every broker-type role see its agents' records, and agents only their own", () => {
  for (const slug of brokerAccessRoleSlugs) expect(defaultScope(slug)).toBe("broker_team");
  expect(defaultScope("agent")).toBe("own");
});

it("gives every role the data access it had before it became a permission", () => {
  for (const slug of Object.keys(rolePermissionDefaults) as RoleSlug[])
    expect([slug, defaultScope(slug)]).toEqual([slug, roleDataScopeDefaults[slug]]);
});

import { describe, expect, it } from "vitest";
import type { DataScope } from "./catalog";
import {
  canGrantPermissions,
  canManageBilling,
  canManageUsers,
  canViewBilling,
  canViewTeam,
  hasOrganizationWideAccess,
  resolveDataScope,
  type AuthorizationContext,
} from "./policy";

const as = (roles: string[], permissions: string[] = []): AuthorizationContext => ({
  authUserId: "auth",
  userId: "user",
  organizationId: "org",
  roles,
  permissions: new Set(permissions),
});

describe("resolveDataScope", () => {
  it.each<[string, AuthorizationContext, DataScope]>([
    [
      "an administrator follows their permissions like anyone else",
      as(["administrator"], ["records.view_own"]),
      "own",
    ],
    [
      "See all records reaches the organization",
      as(["agent"], ["records.view_all"]),
      "organization",
    ],
    [
      "the broadest permission wins",
      as(["agent", "broker"], ["records.view_own", "records.view_team"]),
      "broker_team",
    ],
    ["an agent stays on their own records", as(["agent"], ["records.view_own"]), "own"],
    ["no data access permission means own records only", as(["viewer"]), "own"],
  ])("%s", (_, context, scope) => expect(resolveDataScope(context)).toBe(scope));

  it("gives organization-wide access through See all records, not the role", () => {
    expect(hasOrganizationWideAccess(as(["administrator"], ["records.view_all"]))).toBe(true);
    expect(hasOrganizationWideAccess(as(["administrator"]))).toBe(false);
    expect(hasOrganizationWideAccess(as(["broker"], ["records.view_team"]))).toBe(false);
    expect(hasOrganizationWideAccess(as(["sales-manager"], ["records.view_all"]))).toBe(true);
  });
});

describe("billing and user checks", () => {
  it("lets anyone with both billing permissions record payments", () => {
    expect(canManageBilling(as(["administrator"], ["billing.view", "billing.manage"]))).toBe(true);
    expect(canManageBilling(as(["broker"], ["billing.view", "billing.manage"]))).toBe(true);
    expect(canManageBilling(as(["administrator"], ["billing.view"]))).toBe(false);
  });

  it("shows billing to whoever holds View billing", () => {
    expect(canViewBilling(as(["broker"], ["billing.view"]))).toBe(true);
    expect(canViewBilling(as(["broker"], ["deals.view"]))).toBe(false);
    expect(canViewBilling(as(["administrator"], ["deals.view"]))).toBe(false);
  });

  it("lets anyone with users.manage manage users", () => {
    expect(canManageUsers(as(["broker"], ["users.manage"]))).toBe(true);
    expect(canManageUsers(as(["administrator"]))).toBe(false);
  });

  it("only lets a user hand out access they hold, unless they are the Super Administrator", () => {
    expect(canGrantPermissions(as(["sales-manager"], ["users.manage"]), ["users.manage"])).toBe(
      true,
    );
    expect(canGrantPermissions(as(["sales-manager"], ["users.manage"]), ["roles.manage"])).toBe(
      false,
    );
    expect(canGrantPermissions(as(["super-administrator"]), ["roles.manage"])).toBe(true);
  });
});

describe("canViewTeam", () => {
  it("needs a team to lead and data access wider than own records", () => {
    expect(canViewTeam(as(["broker"], ["records.view_team"]))).toBe(true);
    expect(canViewTeam(as(["broker"], ["records.view_own"]))).toBe(false);
    expect(canViewTeam(as(["agent"], ["records.view_all"]))).toBe(false);
  });
});

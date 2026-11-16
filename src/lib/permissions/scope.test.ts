import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { deals } from "@/db/schema";
import { dataScopePermissions, type DataScope } from "./catalog";
import type { AuthorizationContext } from "./policy";
import { dataScopeCondition } from "./scope";

const render = (role: DataScope, roles = ["agent"]) => {
  const context: AuthorizationContext = {
    authUserId: "auth",
    userId: "me",
    organizationId: "org",
    roles,
    permissions: new Set([dataScopePermissions[role]]),
  };
  return new PgDialect().sqlToQuery(
    dataScopeCondition(context, {
      organizationId: deals.organizationId,
      ownerUserId: deals.primaryAgentUserId,
      brokerUserId: deals.brokerUserId,
    }),
  );
};

describe("dataScopeCondition", () => {
  it("filters only by organization for organization scope", () => {
    const { sql, params } = render("organization");
    expect(sql).toBe('"deals"."organization_id" = $1');
    expect(params).toEqual(["org"]);
  });

  it("adds the owner for own scope, and never the team", () => {
    const { sql, params } = render("own");
    expect(sql).toContain('"deals"."primary_agent_user_id" = $2');
    expect(sql).not.toContain("broker_id");
    expect(params).toEqual(["org", "me"]);
  });

  it("adds the owner, the team they lead and the broker for broker_team scope", () => {
    const { sql, params } = render("broker_team", ["broker"]);
    expect(sql).toContain('"deals"."primary_agent_user_id" = $2');
    expect(sql).toContain('"users"."broker_id" =');
    expect(sql).toContain('"deals"."broker_user_id" =');
    // Every comparison stays inside the caller's organization.
    expect(params.filter((p) => p === "org")).toHaveLength(2);
  });

  it("gives administrators no shortcut: their data access permission applies", () => {
    expect(render("own", ["administrator"]).sql).not.toBe('"deals"."organization_id" = $1');
  });
});

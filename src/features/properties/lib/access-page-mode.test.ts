import { describe, expect, it } from "vitest";

import { accessPageMode } from "./access-page-mode";

const context = (permissions: string[], roles: string[] = []) => ({
  authUserId: "a",
  userId: "u",
  organizationId: "o",
  roles,
  permissions: new Set(permissions),
});

describe("accessPageMode", () => {
  it("lets granters edit", () => {
    expect(accessPageMode(context(["properties.view", "properties.grant_unit_access"]))).toBe(
      "edit",
    );
    // The Administrator role name alone no longer gives it.
    expect(accessPageMode(context(["properties.view"], ["administrator"]))).toBeNull();
  });

  it("lets see-everyone's-access holders view only", () => {
    expect(accessPageMode(context(["properties.view", "properties.view_all_access"]))).toBe("view");
  });

  it("keeps everyone else out", () => {
    expect(accessPageMode(context(["properties.view"]))).toBeNull();
    expect(accessPageMode(context(["properties.view_all_access"]))).toBeNull();
    expect(accessPageMode(context(["properties.grant_unit_access"]))).toBeNull();
  });
});

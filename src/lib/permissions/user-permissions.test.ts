import { expect, it } from "vitest";
import { applyPermissionOverrides, overridesFor } from "./user-permissions";

it("adds and removes a user's own permissions on top of their roles", () => {
  const effective = applyPermissionOverrides(
    ["deals.view", "deals.change_stage"],
    [
      { key: "deals.move_back", granted: true },
      { key: "deals.change_stage", granted: false },
    ],
  );
  expect([...effective].sort()).toEqual(["deals.move_back", "deals.view"]);
});

it("can grant or revoke document archive access for an individual", () => {
  expect(
    applyPermissionOverrides(["documents.view"], [{ key: "documents.archive", granted: true }]).has(
      "documents.archive",
    ),
  ).toBe(true);
  expect(
    applyPermissionOverrides(
      ["documents.view", "documents.archive"],
      [{ key: "documents.archive", granted: false }],
    ).has("documents.archive"),
  ).toBe(false);
});

it("records only what differs from the roles", () => {
  const roles = ["deals.view", "deals.change_stage"];
  expect(overridesFor(roles, new Set(roles))).toEqual([]);
  expect(overridesFor(roles, new Set(["deals.view", "deals.move_back"]))).toEqual([
    { key: "deals.change_stage", granted: false },
    { key: "deals.move_back", granted: true },
  ]);
});

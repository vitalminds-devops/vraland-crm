import { expect, it } from "vitest";
import { permissionSyncPlan } from "./permission-sync-plan";

it("adds new keys, refreshes changed text, and reports keys the catalog dropped", () => {
  const plan = permissionSyncPlan(
    [
      { key: "deals.view", module: "deals", description: "Old text" },
      { key: "users.manage", module: "users", description: "Manage users." },
      { key: "legacy.gone", module: "legacy", description: null },
    ],
    [
      { key: "deals.view", module: "deals", description: "New text" },
      { key: "users.manage", module: "settings", description: "Manage users." },
      { key: "deals.export", module: "deals", description: "Export." },
    ],
  );
  expect(plan.added).toEqual(["deals.export"]);
  expect(plan.outdated.map((entry) => entry.key)).toEqual(["deals.view", "users.manage"]);
  expect(plan.retired).toEqual(["legacy.gone"]);
});

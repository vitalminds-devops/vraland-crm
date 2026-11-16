import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  inserted: [] as unknown[],
  roles: ["super-administrator"],
  heldRoleRows: [] as unknown[],
}));
vi.mock("@/db", () => ({
  db: {
    select: () => {
      const chain: Record<string, unknown> = {};
      chain.where = () => chain;
      let table: unknown;
      chain.from = (from: unknown) => ((table = from), chain);
      chain.limit = async () =>
        table === userRoles ? mocks.heldRoleRows : [{ id: "role", name: "Agent", slug: "agent" }];
      return chain;
    },
    transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async () => ({
    organizationId: "org",
    userId: "actor",
    roles: mocks.roles,
    permissions: new Set<string>(["contacts.view"]),
  })),
  requireAuthorizationContext: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
import { userRoles } from "@/db/schema";
import { updateRolePermissions } from "./settings.actions";

const roleId = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  mocks.inserted = [];
  mocks.roles = ["super-administrator"];
  mocks.heldRoleRows = [];
  mocks.transaction.mockClear();
  mocks.transaction.mockImplementation(async (work) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["from", "where", "onConflictDoNothing"]) chain[name] = () => chain;
    chain.then = (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve);
    return work({
      select: () => chain,
      delete: () => chain,
      insert: () => ({
        values: (values: unknown) => {
          mocks.inserted.push(values);
          return chain;
        },
      }),
    });
  });
});

it("drops retired permission keys instead of refusing the save", async () => {
  const result = await updateRolePermissions({
    roleId,
    permissionKeys: ["contacts.view", "legacy.removed_key"],
  });
  expect(result.success).toBe(true);
  expect(JSON.stringify(mocks.inserted)).toContain("contacts.view");
  expect(JSON.stringify(mocks.inserted)).not.toContain("legacy.removed_key");
});

it("returns a database failure instead of throwing when the save fails", async () => {
  mocks.transaction.mockRejectedValueOnce(new Error("connection lost"));
  const result = await updateRolePermissions({ roleId, permissionKeys: ["contacts.view"] });
  expect(result).toMatchObject({
    success: false,
    error: { message: "The role permissions could not be saved." },
  });
});

it("refuses to change a role the caller holds", async () => {
  mocks.roles = ["administrator"];
  mocks.heldRoleRows = [{ roleId }];
  const result = await updateRolePermissions({ roleId, permissionKeys: ["contacts.view"] });
  expect(result).toMatchObject({
    success: false,
    error: { message: "You can't change a role you hold. Ask another administrator." },
  });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("lets the caller change a role they don't hold", async () => {
  mocks.roles = ["administrator"];
  const result = await updateRolePermissions({ roleId, permissionKeys: ["contacts.view"] });
  expect(result.success).toBe(true);
});

it("lets a Super Administrator change a role they hold", async () => {
  mocks.heldRoleRows = [{ roleId }];
  const result = await updateRolePermissions({ roleId, permissionKeys: ["contacts.view"] });
  expect(result.success).toBe(true);
});

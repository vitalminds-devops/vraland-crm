import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  inserted: [] as unknown[],
  roles: ["super-administrator"],
  heldRoleRows: [] as unknown[],
  /** The permission keys the role has before the save. */
  currentKeys: [] as string[],
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
      chain.innerJoin = () => chain;
      chain.then = (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve(
          table === rolePermissions ? mocks.currentKeys.map((key) => ({ key })) : [],
        ).then(resolve);
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
import { auditLogs, rolePermissions, userRoles } from "@/db/schema";
import { updateRolePermissions } from "./settings.actions";

const roleId = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  mocks.inserted = [];
  mocks.roles = ["super-administrator"];
  mocks.heldRoleRows = [];
  mocks.currentKeys = [];
  mocks.transaction.mockClear();
  mocks.transaction.mockImplementation(async (work) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["from", "where", "onConflictDoNothing"]) chain[name] = () => chain;
    chain.then = (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve);
    return work({
      select: () => chain,
      delete: () => chain,
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          mocks.inserted.push(table === auditLogs ? { audit: values } : values);
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
    error: { message: "Couldn't save the role permissions." },
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

it("refuses to remove a permission the caller doesn't hold", async () => {
  mocks.roles = ["administrator"];
  mocks.currentKeys = ["contacts.view", "billing.manage"];
  const result = await updateRolePermissions({ roleId, permissionKeys: ["contacts.view"] });
  expect(result).toMatchObject({
    success: false,
    error: { message: "You cannot remove permissions you do not hold yourself." },
  });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("logs the keys before and after, and nothing when they didn't change", async () => {
  mocks.currentKeys = ["deals.view"];
  await updateRolePermissions({ roleId, permissionKeys: ["contacts.view"] });
  expect(mocks.inserted).toContainEqual({
    audit: expect.objectContaining({
      oldValues: { permissionKeys: ["deals.view"] },
      newValues: { permissionKeys: ["contacts.view"] },
    }),
  });
  mocks.inserted = [];
  mocks.currentKeys = ["contacts.view"];
  await updateRolePermissions({ roleId, permissionKeys: ["contacts.view"] });
  expect(mocks.inserted.some((row) => typeof row === "object" && row && "audit" in row)).toBe(
    false,
  );
});

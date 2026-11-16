import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reads: [] as unknown[][],
  inserted: [] as unknown[],
  actorRoles: ["sales-manager"],
  actorPermissions: new Set<string>(["roles.manage", "deals.view"]),
  target: { roles: ["agent"], permissions: new Set<string>(["deals.view"]) },
}));
vi.mock("@/db", () => {
  const chain = (rows: () => unknown[]) => {
    const c: Record<string, unknown> = {};
    for (const name of ["from", "where", "innerJoin", "for"]) c[name] = () => c;
    c.limit = async () => rows();
    c.then = (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows()).then(resolve);
    return c;
  };
  const read = () => chain(() => mocks.reads.shift() ?? []);
  return {
    db: {
      select: read,
      transaction: async (work: (tx: unknown) => Promise<void>) =>
        work({
          select: read,
          delete: () => chain(() => []),
          insert: () => ({
            values: (values: unknown) => {
              mocks.inserted.push(values);
              return chain(() => []);
            },
          }),
        }),
    },
  };
});
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async () => ({
    organizationId: "org",
    userId: "00000000-0000-4000-8000-000000000002",
    roles: mocks.actorRoles,
    permissions: mocks.actorPermissions,
  })),
  loadAccess: vi.fn(async () => mocks.target),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
import { updateUserPermissions } from "./user-permissions.actions";

const userId = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  mocks.inserted = [];
  mocks.actorRoles = ["sales-manager"];
  mocks.target = { roles: ["agent"], permissions: new Set(["deals.view"]) };
  // Target user, then their saved changes.
  mocks.reads = [[{ id: userId }], []];
});

it("lets anyone with Manage roles and permissions save a user's own changes", async () => {
  const result = await updateUserPermissions({
    userId,
    overrides: [
      { key: "deals.view", granted: true },
      { key: "deals.move_back", granted: false },
      { key: "legacy.removed_key", granted: true },
    ],
  });
  expect(result.success).toBe(true);
  const saved = JSON.stringify(mocks.inserted);
  expect(saved).toContain('"permissionKey":"deals.view","granted":true');
  expect(saved).toContain('"permissionKey":"deals.move_back","granted":false');
  expect(saved).not.toContain("legacy.removed_key");
});

it("refuses to grant a permission the caller does not hold", async () => {
  const result = await updateUserPermissions({
    userId,
    overrides: [{ key: "deals.move_back", granted: true }],
  });
  expect(result).toMatchObject({ success: false });
  expect(mocks.inserted).toEqual([]);
});

it("refuses to change a user who has access the caller lacks", async () => {
  mocks.target = { roles: ["administrator"], permissions: new Set(["users.manage"]) };
  expect((await updateUserPermissions({ userId, overrides: [] })).success).toBe(false);
  mocks.actorRoles = ["super-administrator"];
  mocks.reads = [[{ id: userId }], [{ key: "x", granted: true }]];
  expect((await updateUserPermissions({ userId, overrides: [] })).success).toBe(true);
});

it("never changes a Super Administrator, and never the caller's own permissions", async () => {
  mocks.target = { roles: ["super-administrator"], permissions: new Set() };
  expect((await updateUserPermissions({ userId, overrides: [] })).success).toBe(false);
  expect(
    (
      await updateUserPermissions({
        userId: "00000000-0000-4000-8000-000000000002",
        overrides: [],
      })
    ).success,
  ).toBe(false);
});

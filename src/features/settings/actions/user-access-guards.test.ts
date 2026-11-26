import { beforeEach, expect, it, vi } from "vitest";
import { userPermissions, users } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  reads: [] as unknown[][],
  transaction: vi.fn(),
  canChangeUser: true,
  canAssignRoles: true,
  canManageRoles: false,
}));
function query(rows: unknown) {
  const chain: Record<string, unknown> = {};
  for (const name of ["from", "where", "innerJoin", "limit", "for"]) chain[name] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}
vi.mock("@/db", () => ({
  db: { select: () => query(mocks.reads.shift() ?? []), transaction: mocks.transaction },
}));
vi.mock("@/lib/permissions/authorization", () => ({
  canAssignRoles: async () => mocks.canAssignRoles,
  canChangeUser: async () => mocks.canChangeUser,
  requirePermission: vi.fn(async () => ({ organizationId: "org", userId: "actor", roles: [] })),
  requireAuthorizationContext: vi.fn(),
  loadAccess: async () => ({ roles: ["agent"], permissions: new Set() }),
}));
vi.mock("@/lib/permissions/policy", () => ({
  canManageUsers: () => true,
  canGrantPermissions: () => true,
  hasPermission: (_: unknown, key: string) => key !== "roles.manage" || mocks.canManageRoles,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("better-auth/crypto", () => ({ hashPassword: async () => "hash" }));
import { setUserDeleted, setUserStatus, updateUserAccess } from "./settings.actions";

const target = "00000000-0000-4000-8000-000000000001";
const role = "00000000-0000-4000-8000-000000000003";
const outranks = {
  success: false,
  error: { message: "You can't change a user who has access you don't have." },
};

beforeEach(() => {
  mocks.transaction.mockReset();
  mocks.canChangeUser = true;
  mocks.canAssignRoles = true;
  mocks.canManageRoles = false;
});

it("refuses to deactivate or archive a user who has access the caller lacks", async () => {
  mocks.canChangeUser = false;
  // The user being changed, then "not a Super Administrator".
  mocks.reads = [[{ id: target, status: "active" }], []];
  expect(
    await setUserStatus({ id: target, status: "inactive", handoverToUserId: "" }),
  ).toMatchObject(outranks);
  mocks.reads = [[{ id: target, deletedAt: null }], []];
  expect(await setUserDeleted({ id: target, deleted: true, handoverToUserId: "" })).toMatchObject(
    outranks,
  );
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("refuses to change the access of a user who has access the caller lacks", async () => {
  mocks.canChangeUser = false;
  mocks.reads = [[{ id: target, status: "active", brokerId: null }], []];
  expect(
    await updateUserAccess({ id: target, status: "active", brokerId: "", roleIds: [role] }),
  ).toMatchObject(outranks);
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("refuses to give a role that has access the caller lacks", async () => {
  mocks.canAssignRoles = false;
  // The user, "not a Super Administrator", then their current roles (none).
  mocks.reads = [[{ id: target, status: "active", brokerId: null }], [], []];
  expect(
    await updateUserAccess({ id: target, status: "active", brokerId: "", roleIds: [role] }),
  ).toMatchObject({
    success: false,
    error: { message: "You can't assign a role with access you don't have." },
  });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

// The user, "not a Super Administrator", their current roles, then the role check
// (a valid role, not Super Administrator, no Agent profile).
const accessReads = () => [
  [{ id: target, status: "invited", brokerId: null }],
  [],
  [{ id: role }],
  [{ id: role, slug: "sales-manager" }],
  [],
  [],
];
const withOverrides = {
  id: target,
  status: "active",
  brokerId: "",
  roleIds: [role],
  permissionOverrides: [{ key: "deals.view", granted: true }],
};

it("refuses permission changes from a caller who can't manage roles", async () => {
  mocks.reads = accessReads();
  expect(await updateUserAccess(withOverrides)).toMatchObject({
    success: false,
    error: { message: "You don't have permission to change permissions." },
  });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("saves access and permission changes in one transaction, failing together", async () => {
  mocks.canManageRoles = true;
  mocks.reads = accessReads();
  const writes: unknown[] = [];
  const tx = {
    select: () => query([]),
    update: (table: unknown) => ({
      set: () => ({ where: async () => writes.push(table) }),
    }),
    delete: () => ({ where: async () => [] }),
    insert: (table: unknown) => ({
      values: async () => {
        if (table === userPermissions) throw new Error("write failed");
      },
    }),
  };
  mocks.transaction.mockImplementation(async (work: (t: unknown) => unknown) => work(tx));
  const result = await updateUserAccess(withOverrides);
  // The status change ran in the same transaction that failed, so it is rolled back.
  expect(writes).toContain(users);
  expect(mocks.transaction).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({
    success: false,
    error: { message: "Couldn't update the user access." },
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { users, documents } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock("@/lib/permissions/authorization", () => ({
  canAssignRoles: async () => true,
  canChangeUser: async () => true,
  requirePermission: vi.fn(async () => ({ organizationId: "org", userId: "actor" })),
  requireAuthorizationContext: vi.fn(),
}));
vi.mock("@/lib/permissions/policy", () => ({
  canManageUsers: () => true,
  hasPermission: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("better-auth/crypto", () => ({ hashPassword: async () => "hash" }));
vi.mock("@/lib/storage/file-signature", () => ({ matchesDeclaredType: async () => true }));
vi.mock("@/lib/storage/document-storage", () => ({
  getDocumentStorage: () => ({ put: mocks.put, remove: mocks.remove }),
}));
import { createUser } from "./settings.actions";

const roleId = "00000000-0000-4000-8000-000000000001";
const first = "00000000-0000-4000-8000-000000000002";
const second = "00000000-0000-4000-8000-000000000003";
const managerId = "00000000-0000-4000-8000-000000000004";
let managerRole: string;
let members: { id: string; brokerId: string | null; status: string; deletedAt: Date | null }[];
let memberRoles: { userId: string; slug: string }[];

function query(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const name of ["from", "where", "innerJoin", "limit"]) chain[name] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  chain.for = async () => result;
  return chain;
}
function form(ids: string[]) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    firstName: "Master",
    lastName: "Broker",
    email: "master@example.com",
    password: "safe-password-123",
    phone: "",
    roleIds: roleId,
    salesExecutivesPresent: "true",
  }))
    data.set(key, value);
  data.append("documents", new File(["credentials"], "credentials.txt", { type: "text/plain" }));
  ids.forEach((id) => data.append("brokerIds", id));
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.put.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  managerRole = "master-broker";
  members = [first, second, managerId].map((id) => ({
    id,
    brokerId: null,
    status: "active",
    deletedAt: null,
  }));
  memberRoles = [
    { userId: first, slug: "broker" },
    { userId: second, slug: "license-broker" },
  ];
  mocks.select.mockImplementation(() =>
    query([{ id: roleId, slug: managerRole, name: "Master Broker" }]),
  );
  mocks.insert.mockImplementation((table: unknown) => ({
    values: () => ({
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
      returning: async () =>
        table === users
          ? [{ id: managerId }]
          : table === documents
            ? [{ id: "doc", name: "credentials.txt" }]
            : [],
    }),
  }));
  mocks.update.mockImplementation(() => ({
    set: (value: unknown) => ({ where: async () => value }),
  }));
  mocks.transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => {
    const results = [members, memberRoles, [{ slug: managerRole }]];
    return run({
      select: () => query(results.shift()),
      insert: mocks.insert,
      update: mocks.update,
    });
  });
});
describe("Master Broker creation", () => {
  it("assigns multiple selected brokers in the creation transaction", async () => {
    expect((await createUser(form([first, second]))).success).toBe(true);
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });
  it.each(["inactive", "suspended"])("rejects %s brokers", async (status) => {
    members[0].status = status;
    expect((await createUser(form([first]))).success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects deleted brokers", async () => {
    members[0].deletedAt = new Date();
    expect((await createUser(form([first]))).success).toBe(false);
  });
  it("rejects brokers outside the organization", async () => {
    members = members.filter((member) => member.id !== first);
    expect((await createUser(form([first]))).success).toBe(false);
  });
  it("rejects non-broker roles", async () => {
    memberRoles[0].slug = "sales-executive";
    expect((await createUser(form([first]))).success).toBe(false);
  });
  it("rejects broker selections for other manager roles", async () => {
    managerRole = "broker";
    expect((await createUser(form([first]))).success).toBe(false);
  });
  it("deduplicates selected brokers", async () => {
    expect((await createUser(form([first, first]))).success).toBe(true);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it("allows creating a Master Broker without assigned brokers", async () => {
    expect((await createUser(form([]))).success).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

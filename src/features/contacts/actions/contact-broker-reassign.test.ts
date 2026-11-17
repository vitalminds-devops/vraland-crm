import { beforeEach, expect, it, vi } from "vitest";
import { contactBrokerHistory } from "@/db/schema";

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const broker = "33333333-3333-4333-8333-333333333333";
const mocks = vi.hoisted(() => ({
  reads: [] as unknown[][],
  locks: [] as string[],
  inserts: [] as unknown[],
  roles: ["administrator"],
}));
vi.mock("@/db", () => {
  const query = (rows: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["from", "where", "innerJoin", "limit", "orderBy"]) chain[name] = () => chain;
    chain.for = async (mode: string) => (mocks.locks.push(mode), rows);
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return chain;
  };
  const select = () => query(mocks.reads.shift() ?? []);
  return {
    db: {
      select,
      transaction: async (work: (tx: unknown) => unknown) =>
        work({
          select,
          update: () => ({ set: () => ({ where: async () => [] }) }),
          insert: (table: unknown) => ({ values: async () => void mocks.inserts.push(table) }),
        }),
    },
  };
});
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async () => ({
    organizationId: "org",
    userId: "actor",
    roles: mocks.roles,
    permissions: new Set(["records.view_all"]),
  })),
  canAccessResource: vi.fn(async () => true),
}));
vi.mock("@/features/deals/lib/move-open-deals", () => ({ moveOpenDeals: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { reassignContactBroker } from "./contact.actions";

const input = { contactIds: ids, toBrokerUserId: broker, reason: "Territory change" };

beforeEach(() => {
  mocks.locks = [];
  mocks.inserts = [];
  mocks.roles = ["administrator"];
});

it("refuses inside the transaction when a contact's deal is won, before touching any contact", async () => {
  // The target broker, its lock, then the locked deals: one already won.
  mocks.reads = [[{ id: broker }], [{ id: broker }], [{ contactId: ids[0], status: "won" }]];
  const result = await reassignContactBroker(input);
  expect(result.success).toBe(false);
  expect(mocks.locks).toEqual(["share", "share"]);
  expect(mocks.inserts).toEqual([]);
});

it("locks the contacts and moves each one not already on the broker", async () => {
  mocks.reads = [
    [{ id: broker }],
    [{ id: broker }],
    [{ contactId: ids[0], status: "open" }],
    [
      { id: ids[0], brokerUserId: "old-broker" },
      { id: ids[1], brokerUserId: broker },
    ],
  ];
  const result = await reassignContactBroker(input);
  expect(result).toMatchObject({ success: true, data: { reassignedCount: 1, skippedCount: 1 } });
  expect(mocks.locks).toEqual(["share", "share", "update"]);
  expect(mocks.inserts).toEqual([contactBrokerHistory]);
});

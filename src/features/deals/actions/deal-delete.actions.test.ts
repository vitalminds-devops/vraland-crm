import { beforeEach, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { deleteDeal } from "./deal-delete.actions";

const fixture = vi.hoisted(() => ({
  index: 0,
  roles: ["administrator"] as string[],
  access: true,
  deal: null as Record<string, unknown> | null,
  state: {} as Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
}));
const dealId = "12345678-5678-4234-8234-123456789abc";

vi.mock("@/db", () => ({
  db: {
    transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        select: () => {
          const rows =
            fixture.index++ === 0 ? (fixture.deal ? [fixture.deal] : []) : [fixture.state];
          const query = {
            from: () => query,
            where: () => query,
            limit: () => query,
            for: async () => rows,
            then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
          };
          return query;
        },
        update: () => ({
          set: (value: Record<string, unknown>) => {
            fixture.updates.push(value);
            return { where: async () => {} };
          },
        }),
        insert: () => ({
          values: async (value: Record<string, unknown>) => {
            fixture.inserts.push(value);
          },
        }),
      }),
  },
}));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({
    organizationId: "organization",
    userId: "actor",
    roles: fixture.roles,
    permissions: new Set(["deals.delete"]),
  }),
  canAccessResource: async () => fixture.access,
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  fixture.index = 0;
  fixture.roles = ["administrator"];
  fixture.access = true;
  fixture.deal = {
    title: "Example",
    dealCode: "D-1",
    status: "open",
    agentUserId: "agent",
    brokerUserId: "broker",
    deletedAt: null,
  };
  fixture.state = {
    hasLivePayment: false,
    holdsInventory: false,
    isLeadsOnlyDeal: false,
    contactId: "contact",
  };
  fixture.updates = [];
  fixture.inserts = [];
});

it("rejects an invalid id", async () => {
  expect((await deleteDeal({ dealId: "nope" })).success).toBe(false);
});

it("hides opportunities outside the data scope", async () => {
  fixture.access = false;
  expect(await deleteDeal({ dealId })).toMatchObject({ success: false });
  expect(fixture.index).toBe(0);
});

it("reports an already deleted opportunity as missing", async () => {
  fixture.deal = { ...fixture.deal, deletedAt: new Date() };
  expect((await deleteDeal({ dealId })).success).toBe(false);
  expect(fixture.updates).toEqual([]);
});

it.each([
  [["agent"], "agentUserId"],
  [["broker"], "brokerUserId"],
])("lets %s delete only their own opportunity", async (roles, ownerField) => {
  fixture.roles = roles;
  expect(await deleteDeal({ dealId })).toMatchObject({
    success: false,
    error: { message: "You can only delete your own opportunities." },
  });
  fixture.index = 0;
  fixture.deal = { ...fixture.deal, [ownerField]: "actor" };
  expect((await deleteDeal({ dealId })).success).toBe(true);
});

it("lets a sales manager delete another agent's opportunity", async () => {
  fixture.roles = ["sales-manager"];
  expect((await deleteDeal({ dealId })).success).toBe(true);
});

it("refuses a won opportunity", async () => {
  fixture.deal = { ...fixture.deal, status: "won" };
  expect(await deleteDeal({ dealId })).toMatchObject({
    success: false,
    error: { message: "Won opportunities can't be deleted." },
  });
  expect(fixture.updates).toEqual([]);
});

it.each([
  ["hasLivePayment", "This opportunity has payments. Remove them in Billing first."],
  ["holdsInventory", "This opportunity holds units or parking. Release them first."],
  ["isLeadsOnlyDeal", "This is the contact's only opportunity. Archive the contact instead."],
])("refuses when %s", async (flag, message) => {
  fixture.state = { ...fixture.state, [flag]: true };
  expect(await deleteDeal({ dealId })).toMatchObject({ success: false, error: { message } });
  expect(fixture.updates).toEqual([]);
  expect(fixture.inserts).toEqual([]);
});

it("soft-deletes, closes open work, logs and revalidates", async () => {
  expect(await deleteDeal({ dealId })).toMatchObject({ success: true, data: { id: dealId } });
  expect(fixture.updates[0]).toMatchObject({ deletedAt: expect.any(Date), updatedBy: "actor" });
  expect(fixture.updates.slice(1)).toEqual([
    expect.objectContaining({ status: "cancelled" }),
    expect.objectContaining({ status: "cancelled" }),
    expect.objectContaining({ status: "cancelled", decidedBy: "actor" }),
  ]);
  expect(fixture.inserts).toEqual([
    expect.objectContaining({ activityType: "deal.deleted", dealId, contactId: "contact" }),
    expect.objectContaining({ action: "delete", entityType: "deal", entityId: dealId }),
  ]);
  expect(revalidatePath).toHaveBeenCalledWith("/pipeline");
  expect(revalidatePath).toHaveBeenCalledWith(`/contacts/contact`);
});

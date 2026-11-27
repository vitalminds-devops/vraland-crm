import { beforeEach, expect, it, vi } from "vitest";
import { recalculateCommission } from "./deal-commission.actions";
import { recordDealCommissions } from "../lib/record-commissions";

const dealId = "12345678-1234-4234-8234-123456789abc";
const fixture = vi.hoisted(() => ({
  permissions: new Set<string>(["roles.manage"]),
  status: "won",
  /** Commission rows read before and after recalculating. */
  rows: [] as { userId: string; roleName: string; rate: string; amount: string }[][],
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
}));

function query(rows: () => unknown[]) {
  const q = {
    from: () => q,
    where: () => q,
    limit: () => q,
    for: async () => rows(),
    then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows()).then(resolve),
  };
  return q;
}

vi.mock("@/db", () => ({
  db: {
    transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      let reads = 0;
      return work({
        // First the locked deal, then the commission rows before and after.
        select: () =>
          query(() =>
            reads++ === 0
              ? [
                  {
                    title: "Doe, John",
                    status: fixture.status,
                    amount: "100100500.00",
                    agentUserId: "john",
                    brokerUserId: "broker",
                    expectedCommission: "3003015.00",
                  },
                ]
              : (fixture.rows.shift() ?? []),
          ),
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
      });
    },
  },
}));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async (permission: string) => {
    if (!fixture.permissions.has(permission)) throw new Error("Forbidden");
    return { organizationId: "organization", userId: "actor", permissions: fixture.permissions };
  },
  canAccessResource: async () => true,
}));
vi.mock("../lib/record-commissions", () => ({ recordDealCommissions: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

const old = { userId: "john", roleName: "Broker", rate: "3.00", amount: "3003015.00" };

beforeEach(() => {
  fixture.permissions = new Set(["roles.manage"]);
  fixture.status = "won";
  fixture.rows = [];
  fixture.updates = [];
  fixture.inserts = [];
  vi.mocked(recordDealCommissions).mockClear();
});

it("redoes a won opportunity's commission for its current agent and broker, and audits it", async () => {
  const shares = [
    { userId: "john", roleName: "Agent", rate: "2.00", amount: "2002010.00" },
    { userId: "broker", roleName: "Broker", rate: "1.00", amount: "1001005.00" },
  ];
  fixture.rows = [[old], shares];
  expect(await recalculateCommission({ dealId })).toEqual({
    success: true,
    data: { id: dealId, message: "Commission recalculated." },
  });
  expect(recordDealCommissions).toHaveBeenCalledWith(expect.anything(), {
    organizationId: "organization",
    dealId,
    amount: "100100500.00",
    sellerUserId: "john",
    brokerUserId: "broker",
  });
  expect(fixture.inserts[0]).toMatchObject({
    entityType: "deal",
    oldValues: { commissions: [old], expectedCommission: "3003015.00" },
    newValues: { commissions: shares, expectedCommission: "3003015.00" },
  });
});

it("zeroes the expected commission when no rule pays anyone", async () => {
  fixture.rows = [[old], []];
  const result = await recalculateCommission({ dealId });
  expect(result).toMatchObject({
    data: { message: "Commission recalculated. No commission rule applies." },
  });
  expect(fixture.updates).toEqual([{ expectedCommission: "0.00" }]);
});

it("refuses an opportunity that is not won, and users who can't manage commission rates", async () => {
  fixture.status = "open";
  expect(await recalculateCommission({ dealId })).toMatchObject({ success: false });
  expect(recordDealCommissions).not.toHaveBeenCalled();
  fixture.permissions = new Set(["deals.view"]);
  await expect(recalculateCommission({ dealId })).rejects.toThrow("Forbidden");
});

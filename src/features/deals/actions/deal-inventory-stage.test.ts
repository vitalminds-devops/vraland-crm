import { beforeEach, expect, it, vi } from "vitest";
import { changeDealStage } from "./deal.actions";
import { InventoryUnavailable, syncDealInventory } from "../lib/deal-inventory";

const fixture = vi.hoisted(() => ({
  index: 0,
  from: 0,
  approve: true,
  gated: false,
  updates: [] as Record<string, unknown>[],
  paid: 0,
}));
const ids = Array.from(
  { length: 6 },
  (_, index) => `${index + 1}2345678-1234-4234-8234-123456789abc`,
);
const dealId = "12345678-5678-4234-8234-123456789abc";
vi.mock("@/db", () => ({
  db: {
    transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        select: () => {
          const index = fixture.index++;
          const rows =
            index === 0
              ? [
                  {
                    stageId: ids[fixture.from],
                    title: "Example",
                    status: fixture.from === 3 ? "won" : "open",
                    actualCloseDate: null,
                    updatedAt: new Date("2026-11-09T00:00:00Z"),
                    amount: "1000",
                    propertyId: "property",
                    unitId: "unit-1",
                    unitIds: ["unit-1", "unit-2"],
                    parkingSlotIds: ["parking-1"],
                    primaryAgentUserId: "actor",
                    brokerUserId: "actor",
                    reservationPaid: true,
                    firstMonthPaid: true,
                  },
                ]
              : index === 1
                ? [
                    "leads",
                    "opportunity",
                    "reservation",
                    "closed-won",
                    "closed-lost",
                    "cancelled",
                  ].map((slug, i) => ({
                    id: ids[i],
                    slug,
                    name: slug,
                    position: i + 1,
                    isWonStage: i === 3,
                    isLostStage: i === 4,
                    isCancelledStage: i === 5,
                    requiresApproval: fixture.gated && i === 1,
                    defaultProbability: "50",
                  }))
                : [];
          const query = {
            from: () => query,
            where: () => query,
            orderBy: () => query,
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
        insert: () => ({ values: async () => {} }),
        delete: () => ({ where: async () => {} }),
      }),
  },
}));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({
    organizationId: "organization",
    userId: "actor",
    roles: ["administrator"],
    permissions: new Set([
      "deals.move_back",
      ...(fixture.approve ? ["deals.approve_stage_change"] : []),
    ]),
  }),
  canAccessResource: async () => true,
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../lib/opportunity-requirements", () => ({ missingOpportunityDetails: async () => null }));
vi.mock("../lib/record-commissions", () => ({ recordDealCommissions: async () => {} }));
vi.mock("@/features/billing/lib/billing-inventory", async (original) => ({
  ...(await original<typeof import("@/features/billing/lib/billing-inventory")>()),
  readDealPayments: vi.fn(async () => ({
    total: 1000,
    paid: fixture.paid,
    reservationPaid: fixture.paid > 0,
  })),
}));
vi.mock("../lib/deal-inventory", async (original) => ({
  ...(await original<typeof import("../lib/deal-inventory")>()),
  syncDealInventory: vi.fn(async () => ["property"]),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fixture.index = 0;
  fixture.from = 0;
  fixture.approve = true;
  fixture.gated = false;
  fixture.updates = [];
  fixture.paid = 0;
});

it("leaves selected units and parking available when moving an unpaid lead to Opportunity", async () => {
  expect((await changeDealStage({ dealId, stageId: ids[1] })).success).toBe(true);
  expect(syncDealInventory).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      dealId,
      unitIds: ["unit-1", "unit-2"],
      parkingSlotIds: ["parking-1"],
      status: "available",
    }),
  );
});
it.each([
  [2, 3, "sold"],
  [1, 0, "available"],
  [1, 4, "available"],
  [1, 5, "available"],
] as const)("synchronizes inventory when moving from %s to %s", async (from, to, status) => {
  fixture.from = from;
  expect(
    (
      await changeDealStage(
        { dealId, stageId: ids[to], note: "Confirmed stage change" },
        { allowTerminalOutcome: true },
      )
    ).success,
  ).toBe(true);
  expect(syncDealInventory).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status }),
  );
});
it("does not reserve anything for a pending approval", async () => {
  fixture.approve = false;
  fixture.gated = true;
  expect(await changeDealStage({ dealId, stageId: ids[1] })).toMatchObject({
    success: true,
    data: { approvalRequested: true },
  });
  expect(syncDealInventory).not.toHaveBeenCalled();
});

it("locks units and parking only when the move to Reservation succeeds", async () => {
  fixture.from = 1;
  fixture.paid = 100;
  expect((await changeDealStage({ dealId, stageId: ids[2] })).success).toBe(true);
  expect(syncDealInventory).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      status: "deposit_paid",
      unitIds: ["unit-1", "unit-2"],
      parkingSlotIds: ["parking-1"],
    }),
  );
});

it("releases paid inventory when moved back from Reservation to Opportunity", async () => {
  fixture.from = 2;
  fixture.paid = 100;
  expect(
    (await changeDealStage({ dealId, stageId: ids[1], note: "Review selection" })).success,
  ).toBe(true);
  expect(syncDealInventory).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: "available" }),
  );
});

it("keeps fully paid units sold when moving to Reservation", async () => {
  fixture.from = 1;
  fixture.paid = 1000;
  expect((await changeDealStage({ dealId, stageId: ids[2] })).success).toBe(true);
  expect(syncDealInventory).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: "sold" }),
  );
});

it("releases paid inventory when returning to Leads", async () => {
  fixture.from = 1;
  fixture.paid = 100;
  expect((await changeDealStage({ dealId, stageId: ids[0], note: "Review details" })).success).toBe(
    true,
  );
  expect(syncDealInventory).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: "available" }),
  );
});
it("rejects stale selection saves before updating the stage or inventory", async () => {
  expect(
    (await changeDealStage({ dealId, stageId: ids[1], expectedUpdatedAt: "2026-11-08T00:00:00Z" }))
      .success,
  ).toBe(false);
  expect(syncDealInventory).not.toHaveBeenCalled();
  expect(fixture.updates).toEqual([]);
});
it("returns an inventory conflict without updating the stage", async () => {
  vi.mocked(syncDealInventory).mockRejectedValueOnce(
    new InventoryUnavailable("Unit 1A is no longer available."),
  );
  expect(await changeDealStage({ dealId, stageId: ids[1] })).toMatchObject({
    success: false,
    error: { message: "Unit 1A is no longer available." },
  });
  expect(fixture.updates).toEqual([]);
});
it.each([4, 5])("refuses to close a fully paid deal into stage %s", async (to) => {
  fixture.from = 2;
  fixture.paid = 1000;
  expect(
    await changeDealStage(
      { dealId, stageId: ids[to], note: "Buyer withdrew" },
      { allowTerminalOutcome: true },
    ),
  ).toMatchObject({
    success: false,
    error: {
      message:
        "This opportunity is fully paid. To close it, move it back to Opportunity, remove its payments in Billing, then close it.",
    },
  });
  expect(syncDealInventory).not.toHaveBeenCalled();
  expect(fixture.updates).toEqual([]);
});

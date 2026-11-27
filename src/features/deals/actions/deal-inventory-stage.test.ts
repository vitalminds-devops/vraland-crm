import { beforeEach, expect, it, vi } from "vitest";
import { changeDealStage, markDealLost } from "./deal.actions";
import { InventoryUnavailable, syncDealInventory } from "../lib/deal-inventory";
import { missingOpportunityDetails } from "../lib/opportunity-requirements";
import { recordDealCommissions } from "../lib/record-commissions";

const fixture = vi.hoisted(() => ({
  index: 0,
  from: 0,
  approve: true,
  gated: false,
  updates: [] as Record<string, unknown>[],
  paid: 0,
  takenUnits: [] as { code: string }[],
  /** The commission kept from an earlier win; null when the deal was never won. */
  earned: null as string | null,
}));
const ids = Array.from(
  { length: 6 },
  (_, index) => `${index + 1}2345678-1234-4234-8234-123456789abc`,
);
const dealId = "12345678-5678-4234-8234-123456789abc";
/** Moves to a stage; Lost (index 4) goes through Mark lost with a reason, as the UI does. */
const moveTo = (to: number, note: string) =>
  to === 4
    ? markDealLost({ dealId, lostReasonId: ids[5], notes: note })
    : changeDealStage({ dealId, stageId: ids[to], note });
vi.mock("@/db", async () => {
  const { units: unitsTable, dealCommissions } = await import("@/db/schema");
  return {
    db: {
      // markDealLost looks up the Lost stage and the loss reason; any id stands in for both.
      select: () => {
        const query = {
          from: () => query,
          where: () => query,
          limit: async () => [{ id: ids[4] }],
        };
        return query;
      },
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
                      agentUserId: "actor",
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
            let answer: unknown[] = rows;
            const query = {
              // Units another opportunity holds, when a test sets them.
              from: (table: unknown) => (
                (answer =
                  table === unitsTable
                    ? fixture.takenUnits
                    : table === dealCommissions
                      ? [{ total: fixture.earned }]
                      : rows),
                query
              ),
              where: () => query,
              orderBy: () => query,
              limit: () => query,
              for: async () => answer,
              then: (resolve: (rows: unknown[]) => unknown) =>
                Promise.resolve(answer).then(resolve),
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
  };
});
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
vi.mock("../lib/opportunity-requirements", () => ({
  missingOpportunityDetails: vi.fn(async () => null),
}));
vi.mock("../lib/record-commissions", () => ({ recordDealCommissions: vi.fn(async () => {}) }));
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
  fixture.takenUnits = [];
  fixture.earned = null;
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
  expect((await moveTo(to, "Confirmed stage change")).success).toBe(true);
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

it("refuses to move an opportunity with payments back to Leads, holding its units", async () => {
  fixture.from = 1;
  fixture.paid = 100;
  const result = await changeDealStage({ dealId, stageId: ids[0], note: "Review details" });
  expect(!result.success && result.error.message).toBe(
    "This opportunity has payments. Remove its payments in Billing before moving it back to Leads.",
  );
  // Nothing is released or cleared: the units stay with the opportunity that paid for them.
  expect(syncDealInventory).not.toHaveBeenCalled();
  expect(fixture.updates).toEqual([]);
});

it("releases unpaid inventory when returning to Leads", async () => {
  fixture.from = 1;
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
  expect(await moveTo(to, "Buyer withdrew")).toMatchObject({
    success: false,
    error: {
      message:
        "This opportunity is fully paid. To close it, move it back to Opportunity, remove its payments in Billing, then close it.",
    },
  });
  expect(syncDealInventory).not.toHaveBeenCalled();
  expect(fixture.updates).toEqual([]);
});

it("lets go of units, parking and quoted fees when an opportunity moves back to Leads", async () => {
  fixture.from = 1;
  expect((await changeDealStage({ dealId, stageId: ids[0], note: "Contact paused" })).success).toBe(
    true,
  );
  expect(fixture.updates).toContainEqual(
    expect.objectContaining({
      stageId: ids[0],
      unitIds: [],
      parkingSlotIds: [],
      reservationFee: null,
      monthlyAmortization: null,
    }),
  );
});

it("keeps units when moving forward", async () => {
  fixture.from = 1;
  fixture.paid = 100;
  await changeDealStage({ dealId, stageId: ids[2] });
  expect(fixture.updates.some((update) => "unitIds" in update)).toBe(false);
});

it.each([1, 2, 3] as const)(
  "refuses to close an opportunity with payments (from stage %s: Opportunity, Reservation, Won)",
  async (from) => {
    fixture.from = from;
    fixture.paid = 100;
    const result = await moveTo(4, "Client walked away");
    expect(!result.success && result.error.message).toBe(
      "This opportunity has payments. Remove its payments in Billing before closing it.",
    );
    // The paid-for units stay held.
    expect(syncDealInventory).not.toHaveBeenCalled();
  },
);

it("reopens a lost opportunity straight to Opportunity with a reason", async () => {
  fixture.from = 4;
  expect((await changeDealStage({ dealId, stageId: ids[1], note: "Client is back" })).success).toBe(
    true,
  );
  // It is no longer lost: the old loss reason and notes are cleared.
  expect(fixture.updates).toContainEqual(
    expect.objectContaining({ lostReasonId: null, lostNotes: null }),
  );
});

it("sends a lead lost before Opportunity back through Leads", async () => {
  fixture.from = 4;
  vi.mocked(missingOpportunityDetails).mockResolvedValueOnce("Add the contact's TIN.");
  const result = await changeDealStage({ dealId, stageId: ids[1], note: "Client is back" });
  expect(!result.success && result.error.message).toBe(
    "This was lost while still a lead. Reopen it to Leads, then use Move to Opportunity.",
  );
});

it("refuses a plain stage change to Lost: a loss reason is always recorded", async () => {
  fixture.from = 1;
  expect((await changeDealStage({ dealId, stageId: ids[4], note: "Gone quiet" })).success).toBe(
    false,
  );
  expect(syncDealInventory).not.toHaveBeenCalled();
});

it("refuses Opportunity when a picked unit was reserved by another opportunity meanwhile", async () => {
  fixture.takenUnits = [{ code: "2A" }];
  const result = await changeDealStage({ dealId, stageId: ids[1] });
  expect(!result.success && result.error.message).toBe(
    "Unit 2A is already reserved by another opportunity. Pick again with Move to Opportunity.",
  );
  expect(syncDealInventory).not.toHaveBeenCalled();
});

it("clears the old amount when an opportunity goes back to Leads", async () => {
  fixture.from = 1;
  await changeDealStage({ dealId, stageId: ids[0], note: "Paused" });
  expect(fixture.updates).toContainEqual(expect.objectContaining({ amount: null }));
});

it("sets the commission on the first win and keeps it when won again after a reopen", async () => {
  fixture.from = 2;
  expect((await changeDealStage({ dealId, stageId: ids[3] })).success).toBe(true);
  expect(recordDealCommissions).toHaveBeenCalledTimes(1);

  // Reopened, repriced in Billing, then won again: the first win's shares stand.
  vi.clearAllMocks();
  fixture.index = 0;
  fixture.updates = [];
  fixture.earned = "150000.00";
  expect((await changeDealStage({ dealId, stageId: ids[3] })).success).toBe(true);
  expect(recordDealCommissions).not.toHaveBeenCalled();
  expect(fixture.updates).toContainEqual({ expectedCommission: "150000.00" });
});

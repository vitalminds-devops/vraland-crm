import { beforeEach, expect, it, vi } from "vitest";
import { activities, auditLogs, billItems, bills, deals } from "@/db/schema";
import { openDealForApprovedContact } from "../lib/open-deal";
import { addOpportunityForContact, changeOpportunityUnits } from "./opportunity.actions";
import { listParkingSlots } from "@/features/properties/queries/parking.queries";

const uuid = (n: number) => `12345678-1234-4234-8234-${String(n).padStart(12, "0")}`;
const dealId = uuid(1);
const developmentId = uuid(2);
const buildingId = uuid(3);
const unitA = uuid(4);
const unitB = uuid(5);
const heldSlot = uuid(6);
const freeSlot = uuid(7);
const takenSlot = uuid(8);

const mock = vi.hoisted(() => ({
  canUpdate: true,
  /** Rows returned by each top-level select, in call order. */
  selects: [] as unknown[][],
  /** The stage flags the locked deal reports. */
  deal: { isWonStage: false, isLostStage: false, isCancelledStage: false } as Record<
    string,
    unknown
  > | null,
  bill: null as Record<string, string> | null,
  paid: 0,
  writes: [] as { kind: string; table: unknown; values: unknown }[],
  billLines: [] as { unitLabel: string; unitPrice: string; miscellaneousFee: string }[],
}));

/** A select chain whose terminal call resolves to the next queued rows. */
function topLevelSelect() {
  const rows = async () => mock.selects.shift() ?? [];
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: rows,
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      rows().then(resolve, reject),
  };
  return chain;
}

vi.mock("@/db", () => ({
  db: {
    select: topLevelSelect,
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        select: () => {
          const chain = {
            from: () => chain,
            where: () => chain,
            for: async () => (mock.bill ? [mock.bill] : []),
            // The bill's current lines; none unless a test sets them.
            then: (resolve: (rows: unknown[]) => unknown) =>
              Promise.resolve(mock.billLines).then(resolve),
          };
          return chain;
        },
        update: (table: unknown) => ({
          set: (values: unknown) => {
            mock.writes.push({ kind: "update", table, values });
            return { where: async () => {} };
          },
        }),
        delete: (table: unknown) => ({
          where: async () => mock.writes.push({ kind: "delete", table, values: null }),
        }),
        insert: (table: unknown) => ({
          values: async (values: unknown) => mock.writes.push({ kind: "insert", table, values }),
        }),
      }),
  },
}));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({
    organizationId: "organization",
    userId: "agent",
    permissions: new Set([
      "properties.view",
      "deals.create",
      ...(mock.canUpdate ? ["deals.update"] : []),
    ]),
  }),
  canAccessResource: async () => true,
}));
vi.mock("@/features/billing/lib/billing-inventory", () => ({
  lockDealForInventory: async () => mock.deal,
  readDealPayments: async () => ({ total: 0, paid: mock.paid }),
  syncBillingInventory: vi.fn(async () => ["new-building"]),
}));
vi.mock("../lib/open-deal", () => ({
  openDealForApprovedContact: vi.fn(async () => ({
    success: true,
    data: { id: "new-deal", created: true },
  })),
}));
vi.mock("@/features/properties/queries/property-floor-unit.queries", () => ({
  getPropertiesForDevelopment: async () => [
    {
      id: buildingId,
      title: "Tower 2",
      parkingPrice: "500000",
      parkingSpaces: 10,
      currency: "PHP",
    },
  ],
}));
vi.mock("@/features/properties/queries/parking.queries", () => ({
  listParkingSlots: vi.fn(async () => [
    {
      id: heldSlot,
      code: "P1",
      status: "deposit_paid",
      floorId: null,
      price: "500000",
      reservedDealId: dealId,
    },
    {
      id: freeSlot,
      code: "P2",
      status: "available",
      floorId: null,
      price: "500000",
      reservedDealId: null,
    },
    {
      id: takenSlot,
      code: "P3",
      status: "sold",
      floorId: null,
      price: "500000",
      reservedDealId: "someone-else",
    },
  ]),
}));
vi.mock("@/lib/permissions/property-access", () => ({ grantedUnitsCondition: vi.fn() }));
vi.mock("../lib/apply-stage-change", () => ({ applyStageChange: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

const reserved = {
  dealId,
  stageSlug: "reservation",
  unitIds: [unitA],
  developmentId,
  buildingId,
  parkingSlotIds: [heldSlot],
  firstName: "Juan",
  lastName: "Dela Cruz",
};
const selection = {
  dealId,
  developmentId,
  buildingId,
  unitIds: [unitA, unitB],
  parkingSlotIds: [heldSlot],
};
/** Queues the three reads a change makes: the deal, the chosen units, the development. */
const queueChange = (
  deal = reserved,
  unitRows = [
    { id: unitB, code: "1B", price: "2500000" },
    { id: unitA, code: "1A", price: "2500000" },
  ],
) => {
  mock.selects = [[deal], unitRows, [{ name: "Fairfield" }]];
};
const written = (kind: string, table: unknown) =>
  mock.writes.filter((write) => write.kind === kind && write.table === table);

beforeEach(() => {
  vi.clearAllMocks();
  mock.selects = [];
  mock.deal = {
    isWonStage: false,
    isLostStage: false,
    isCancelledStage: false,
    propertyId: null,
    unitId: null,
    unitIds: [],
    parkingSlotIds: [],
  };
  mock.bill = null;
  mock.billLines = [];
  mock.paid = 0;
  mock.writes = [];
  mock.canUpdate = true;
});

it("moves an open opportunity to new units and reprices it", async () => {
  queueChange();
  const result = await changeOpportunityUnits(selection);
  expect(result).toEqual({ success: true, data: { id: dealId } });
  const update = written("update", deals)[0].values as Record<string, unknown>;
  expect(update).toMatchObject({
    developmentId,
    propertyId: buildingId,
    unitId: unitA,
    unitIds: [unitA, unitB],
    parkingSlots: 1,
    parkingSlotIds: [heldSlot],
    amount: "5500000.00",
    title: expect.stringContaining("Fairfield"),
  });
  expect(written("insert", activities)).toHaveLength(1);
  expect(written("insert", auditLogs)).toHaveLength(1);
});

it("keeps the slots the opportunity already holds selectable but refuses someone else's", async () => {
  queueChange();
  expect((await changeOpportunityUnits(selection)).success).toBe(true);
  queueChange();
  const result = await changeOpportunityUnits({ ...selection, parkingSlotIds: [takenSlot] });
  expect(result.success).toBe(false);
});

it("keeps hand-set bill prices when the same selection is saved again", async () => {
  mock.deal = {
    ...mock.deal,
    propertyId: buildingId,
    unitIds: [unitB, unitA],
    parkingSlotIds: [heldSlot],
  };
  mock.bill = { id: "bill", unitPrice: "1", miscellaneousFee: "0", reservationDiscount: "0" };
  queueChange();
  expect((await changeOpportunityUnits(selection)).success).toBe(true);
  expect(written("update", bills)).toEqual([]);
  expect(written("delete", billItems)).toEqual([]);
  // Nothing at all is saved: the quoted fees aren't re-quoted at today's amounts.
  expect(written("update", deals)).toEqual([]);
});

it("keeps a held unit's billed price when another is added", async () => {
  mock.deal = { ...mock.deal, propertyId: buildingId, unitIds: [unitA], parkingSlotIds: [] };
  mock.bill = {
    id: "bill",
    unitPrice: "3000000",
    miscellaneousFee: "150000",
    reservationDiscount: "0",
  };
  // 1A was billed at 3.0M; its list price has since risen to 3.3M.
  mock.billLines = [
    {
      unitLabel: "Unit 1A · Tower 2 · Fairfield",
      unitPrice: "3000000.00",
      miscellaneousFee: "150000.00",
    },
  ];
  queueChange(reserved, [
    { id: unitA, code: "1A", price: "3300000" },
    { id: unitB, code: "1B", price: "2500000" },
  ]);
  expect((await changeOpportunityUnits(selection)).success).toBe(true);
  const lines = written("insert", billItems)[0]?.values as {
    unitLabel: string;
    unitPrice: string;
  }[];
  expect(lines.find((line) => line.unitLabel.startsWith("Unit 1A"))?.unitPrice).toBe("3000000.00");
});

it("rebuilds the bill for the new units at their fee rate, with a line per parking slot", async () => {
  // A 5% fee on the old 2,000,000 bill.
  mock.bill = {
    id: "bill",
    unitPrice: "2000000",
    miscellaneousFee: "100000",
    reservationDiscount: "0",
  };
  queueChange();
  expect((await changeOpportunityUnits(selection)).success).toBe(true);
  expect(written("update", bills)[0].values).toMatchObject({
    unitPrice: "5500000.00",
    // 5% on the units only; parking carries no miscellaneous fee.
    miscellaneousFee: "250000.00",
  });
  expect(written("delete", billItems)).toHaveLength(1);
  const lines = written("insert", billItems)[0].values as { unitLabel: string }[];
  expect(lines.map((line) => line.unitLabel)).toEqual([
    "Unit 1A · Tower 2 · Fairfield",
    "Unit 1B · Tower 2 · Fairfield",
    "Parking P1 · Tower 2",
  ]);
});

it("prices each unit by its own price and refuses an unpriced unit", async () => {
  queueChange(reserved, [
    { id: unitA, code: "1A", price: "2000000" },
    { id: unitB, code: "1B", price: "3000000" },
  ]);
  expect((await changeOpportunityUnits(selection)).success).toBe(true);
  expect(written("update", deals)[0].values).toMatchObject({ amount: "5500000.00" });
  queueChange(reserved, [
    { id: unitA, code: "1A", price: "2000000" },
    { id: unitB, code: "1B", price: null as unknown as string },
  ]);
  const result = await changeOpportunityUnits(selection);
  expect(!result.success && result.error.message).toBe(
    "Unit 1B has no price yet. Set it on the property's Design page, then try again.",
  );
});

it("refuses a new total below what is already paid and writes nothing", async () => {
  mock.bill = { id: "bill", unitPrice: "2000000", miscellaneousFee: "0", reservationDiscount: "0" };
  mock.paid = 9_000_000;
  queueChange();
  const result = await changeOpportunityUnits(selection);
  expect(result.success).toBe(false);
  expect(!result.success && result.error.message).toBe(
    "The new total is less than the ₱9,000,000 already paid.",
  );
  expect(mock.writes).toEqual([]);
});

it("leaves leads to the Move to Opportunity dialog", async () => {
  mock.selects = [[{ ...reserved, stageSlug: "leads" }]];
  const result = await changeOpportunityUnits(selection);
  expect(!result.success && result.error.message).toBe(
    "Pick a lead's units when moving it to Opportunity.",
  );
});

it("refuses won, lost and cancelled opportunities", async () => {
  mock.deal = { isWonStage: true, isLostStage: false, isCancelledStage: false };
  queueChange();
  const result = await changeOpportunityUnits(selection);
  expect(!result.success && result.error.message).toBe(
    "Won, lost and cancelled opportunities cannot change units.",
  );
  expect(mock.writes).toEqual([]);
});

it("opens another opportunity for the same client, agent and deal type", async () => {
  mock.selects = [
    [
      {
        contactId: "contact",
        firstName: "Juan",
        middleName: null,
        lastName: "Dela Cruz",
        agentId: "agent-1",
        dealType: "sale",
      },
    ],
  ];
  expect(await addOpportunityForContact(dealId)).toEqual({
    success: true,
    data: { id: "new-deal" },
  });
  expect(openDealForApprovedContact).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.objectContaining({
      contactId: "contact",
      primaryAgentUserId: "agent-1",
      dealType: "sale",
      another: true,
    }),
  );
});

it("needs a client to copy from", async () => {
  mock.selects = [[]];
  const result = await addOpportunityForContact(dealId);
  expect(!result.success && result.error.message).toBe("This opportunity has no contact.");
  expect(openDealForApprovedContact).not.toHaveBeenCalled();
});

it("names a parking slot that has no price", async () => {
  vi.mocked(listParkingSlots).mockResolvedValueOnce([
    {
      id: heldSlot,
      code: "P1",
      status: "deposit_paid",
      floorId: null,
      price: null,
      reservedDealId: dealId,
    } as never,
  ]);
  queueChange();
  const result = await changeOpportunityUnits(selection);
  expect(!result.success && result.error.message).toBe(
    "Parking P1 has no price yet. Set it on the property's Design page, then try again.",
  );
});

it("needs Edit opportunities to change units, since that re-totals the bill", async () => {
  mock.canUpdate = false;
  queueChange();
  const result = await changeOpportunityUnits(selection);
  expect(result.success).toBe(false);
  expect(mock.writes).toEqual([]);
});

it("refuses to change units on an opportunity moved back to Leads meanwhile", async () => {
  mock.deal = { ...mock.deal, slug: "leads" };
  queueChange();
  const result = await changeOpportunityUnits(selection);
  expect(!result.success && result.error.message).toBe(
    "This is a lead now. Pick its units with Move to Opportunity.",
  );
  expect(mock.writes).toEqual([]);
});

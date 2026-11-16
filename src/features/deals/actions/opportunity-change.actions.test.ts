import { beforeEach, expect, it, vi } from "vitest";
import { activities, auditLogs, billItems, bills, deals } from "@/db/schema";
import { openDealForApprovedContact } from "../lib/open-deal";
import { addOpportunityForContact, changeOpportunityUnits } from "./opportunity.actions";

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
  /** Rows returned by each top-level select, in call order. */
  selects: [] as unknown[][],
  /** The stage flags the locked deal reports. */
  deal: { isWonStage: false, isLostStage: false, isCancelledStage: false } as Record<
    string,
    unknown
  > | null,
  bill: null as Record<string, string> | null,
  unitCodes: [] as string[],
  paid: 0,
  writes: [] as { kind: string; table: unknown; values: unknown }[],
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
            orderBy: async () => mock.unitCodes.map((code) => ({ code })),
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
    permissions: new Set(["properties.view", "deals.create"]),
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
      askingPrice: "2500000",
      parkingPrice: "500000",
      parkingSpaces: 10,
      currency: "PHP",
    },
  ],
}));
vi.mock("@/features/properties/queries/parking.queries", () => ({
  listParkingSlots: async () => [
    { id: heldSlot, code: "P1", status: "deposit_paid", floorId: null },
    { id: freeSlot, code: "P2", status: "available", floorId: null },
    { id: takenSlot, code: "P3", status: "sold", floorId: null },
  ],
}));
vi.mock("@/lib/permissions/property-access", () => ({ grantedUnitsCondition: vi.fn() }));
vi.mock("./deal.actions", () => ({ changeDealStage: vi.fn() }));
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
const queueChange = (deal = reserved, unitRows = [{ id: unitA }, { id: unitB }]) => {
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
  mock.unitCodes = ["1A", "1B"];
  mock.paid = 0;
  mock.writes = [];
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
});

it("rebuilds the bill for the new units, keeping its fee rate", async () => {
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
    miscellaneousFee: "275000.00",
  });
  expect(written("delete", billItems)).toHaveLength(1);
  const lines = written("insert", billItems)[0].values as { unitLabel: string }[];
  expect(lines.map((line) => line.unitLabel)).toEqual([
    "Unit 1A · Tower 2 · Fairfield",
    "Unit 1B · Tower 2 · Fairfield",
    "Parking (1 slot) · Tower 2",
  ]);
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
  expect(!result.success && result.error.message).toBe("This opportunity has no client.");
  expect(openDealForApprovedContact).not.toHaveBeenCalled();
});

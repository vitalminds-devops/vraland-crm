import { beforeEach, expect, it, vi } from "vitest";
import type { DealActionResult } from "./deal.actions";
import { paymentMethods } from "@/features/billing/schemas/billing.schema";
import {
  getOpportunityEstimate,
  getOpportunityParking,
  openOpportunity,
} from "./opportunity.actions";

const inventory = vi.hoisted(() => ({
  permissions: new Set(["properties.view", "contacts.update"]),
  buildings: [
    {
      id: "12345678-1234-4234-8234-123456789abc",
      title: "Tower 1",
      parkingPrice: "25000.50",
      parkingSpaces: 2,
      currency: "PHP",
    },
  ],
  units: [] as { id: string; code?: string; price?: string }[],
  parking: [
    {
      id: "12345678-1234-4234-8234-123456789abc",
      code: "P1",
      status: "available",
      price: "25000.50",
      floorId: null,
      accessible: true,
    },
  ],
  queryRows: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
  lockStage: "leads",
  /** The lead and stages the move pre-check sees; none means it leaves the check to the move. */
  moveDeal: [] as Record<string, unknown>[],
  contactArchived: false,
  moveStages: [] as Record<string, unknown>[],
  /** The lead's existing bill, when it was an opportunity before. */
  bill: null as Record<string, string> | null,
  billItems: [] as unknown[],
  stageResult: { success: true, data: { id: "deal" } } as DealActionResult,
  put: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/db", async () => {
  const { bills, billItems, contacts, deals, pipelineStages } = await import("@/db/schema");
  return {
    db: {
      select: () => {
        let table: unknown;
        let joined = false;
        const query = {
          from: (from: unknown) => ((table = from), query),
          leftJoin: () => ((joined = true), query),
          // The move pre-check reads the lead (no joins) and its two stages; other reads are queued.
          where: () =>
            table === deals && !joined
              ? { limit: async () => inventory.moveDeal }
              : table === pipelineStages
                ? Promise.resolve(inventory.moveStages)
                : Promise.resolve(inventory.queryRows.shift() ?? inventory.units),
        };
        return query;
      },
      transaction: async (run: (tx: unknown) => Promise<void>) =>
        run({
          select: () => {
            let table: unknown;
            const query = {
              from: (from: unknown) => ((table = from), query),
              innerJoin: () => query,
              where: () => query,
              limit: () => query,
              for: async () =>
                table === contacts
                  ? [{ deletedAt: inventory.contactArchived ? new Date() : null }]
                  : table === bills
                    ? inventory.bill
                      ? [inventory.bill]
                      : []
                    : [
                        {
                          stageSlug: inventory.lockStage,
                          updatedAt: new Date("2026-11-01T00:00:00Z"),
                        },
                      ],
              // The bill's current lines: none here.
              then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
            };
            return query;
          },
          update: () => ({
            set: (values: Record<string, unknown>) => {
              inventory.updates.push(values);
              return { where: async () => {} };
            },
          }),
          delete: () => ({ where: async () => {} }),
          insert: (table: unknown) => ({
            values: async (values: unknown) => {
              if (table === billItems) inventory.billItems.push(values);
            },
          }),
        }),
    },
  };
});
vi.mock("@/features/billing/lib/billing-inventory", async (original) => ({
  ...(await original<typeof import("@/features/billing/lib/billing-inventory")>()),
  readDealPayments: async () => ({ total: 0, paid: 0 }),
}));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({
    organizationId: "organization",
    userId: "agent",
    roles: ["agent"],
    permissions: inventory.permissions,
  }),
  canAccessResource: async () => true,
}));
vi.mock("../lib/apply-stage-change", () => ({
  applyStageChange: async () => inventory.stageResult,
}));
vi.mock("@/lib/storage/document-storage", () => ({
  getDocumentStorage: () => ({ put: inventory.put, remove: inventory.remove }),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../lib/opportunity-requirements", async (original) => ({
  ...(await original<typeof import("../lib/opportunity-requirements")>()),
  documentsOnFile: async () => ({ validId: true, appointmentForm: true }),
}));
vi.mock("@/features/properties/queries/parking.queries", () => ({
  listParkingSlots: async () => inventory.parking,
}));
vi.mock("@/lib/permissions/property-access", () => ({ grantedUnitsCondition: vi.fn() }));
vi.mock("@/features/properties/queries/property-floor-unit.queries", () => ({
  getPropertiesForDevelopment: async () => inventory.buildings,
}));

const id = "12345678-1234-4234-8234-123456789abc";
const selection = { developmentId: id, propertyId: id, unitIds: [id], parkingSlotIds: [id] };
beforeEach(() => {
  inventory.moveDeal = [];
  inventory.contactArchived = false;
  inventory.moveStages = [];
  inventory.bill = null;
  inventory.billItems = [];
  inventory.permissions = new Set(["properties.view", "contacts.update"]);
  inventory.units = [{ id, code: "101", price: "120000.25" }];
  inventory.parking = [
    { id, code: "P1", status: "available", price: "25000.50", floorId: null, accessible: true },
  ];
  inventory.queryRows = [];
  inventory.updates = [];
  inventory.lockStage = "leads";
  inventory.stageResult = { success: true, data: { id } };
  inventory.put.mockReset();
  inventory.remove.mockReset();
});

function leadForm() {
  inventory.queryRows = [
    [{ dealId: id, stageSlug: "leads", contactId: id, firstName: "Buyer", lastName: "Test" }],
    [{ id, code: "101", price: "120000.25" }],
    [{ name: "Development" }],
  ];
  const form = new FormData();
  for (const key of ["dealId", "stageId", "developmentId", "propertyId", "unitIds"])
    form.set(key, id);
  form.set("tinNumber", "123-456-789");
  form.set("financingPreference", "cash");
  form.set("parkingSlotIds", id);
  form.set("amount", "1");
  form.set("currentProvince", "Cebu");
  form.set("currentCity", "Cebu City");
  form.set("currentBarangay", "Lahug");
  form.set("currentAddressLine1", "Test street");
  form.set("budgetMin", "2300000");
  form.set("budgetMax", "2499999");
  return form;
}

it.each(paymentMethods)(
  "accepts Billing's %s method and saves it on the client",
  async (method) => {
    const form = leadForm();
    form.set("financingPreference", method);
    if (method === "bank_financing") form.set("bankName", "BDO Unibank");
    if (method === "other") form.set("financingPreferenceOther", "Custom financing");
    expect(await openOpportunity(form)).toMatchObject({ success: true });
    expect(inventory.updates).toContainEqual(
      expect.objectContaining({ financingPreference: method }),
    );
  },
);

it("saves the building, parking quantity, and authoritative total before moving", async () => {
  expect(await openOpportunity(leadForm())).toMatchObject({
    success: true,
    data: {
      message: "Selected units and parking slots remain available to others until Reservation.",
    },
  });
  expect(inventory.updates).toContainEqual(
    expect.objectContaining({
      propertyId: id,
      unitIds: [id],
      amount: "145000.75",
      parkingSlots: 1,
      parkingSlotIds: [id],
      parkingAmount: "25000.50",
      currency: "PHP",
    }),
  );
});

it("blocks a lead without a newly selected unit before saving files or changing stage", async () => {
  const form = leadForm();
  form.delete("unitIds");
  expect(await openOpportunity(form)).toMatchObject({
    success: false,
    error: { message: "Select at least one unit." },
  });
  expect(inventory.put).not.toHaveBeenCalled();
  expect(inventory.updates).toEqual([]);
});

it("reuses documents on the contact for another lead without empty replacement uploads", async () => {
  expect(await openOpportunity(leadForm())).toMatchObject({ success: true });
  expect(inventory.put).not.toHaveBeenCalled();
});

it("saves the address and property interest with the opportunity", async () => {
  const form = leadForm();
  form.set("purchaseType", "condominium");
  form.set("employmentType", "Self-Employed");
  form.set("annualIncome", "1000000");
  expect((await openOpportunity(form)).success).toBe(true);
  expect(inventory.updates).toContainEqual(
    expect.objectContaining({
      currentProvince: "Cebu",
      currentCity: "Cebu City",
      currentBarangay: "Lahug",
      currentAddressLine1: "Test street",
      budgetMin: "2300000",
      budgetMax: "2499999",
      purchaseType: "condominium",
      employmentType: "Self-Employed",
      annualIncome: "1000000",
    }),
  );
});

it.each(["currentProvince", "currentCity", "currentBarangay", "budgetMax"])(
  "requires %s before moving",
  async (field) => {
    const form = leadForm();
    form.delete(field);
    if (field === "budgetMax") form.delete("budgetMin");
    expect(await openOpportunity(form)).toMatchObject({
      success: false,
      error: { details: { fieldErrors: { [field]: expect.any(Array) } } },
    });
    expect(inventory.updates).toEqual([]);
  },
);

it("rejects units that are no longer available before uploading or saving", async () => {
  const form = leadForm();
  inventory.queryRows[1] = [];
  expect(await openOpportunity(form)).toMatchObject({
    success: false,
    error: { message: expect.stringContaining("1 selected unit is no longer available") },
  });
  expect(inventory.put).not.toHaveBeenCalled();
  expect(inventory.updates).toEqual([]);
});

it("explains that approval is still needed instead of claiming the lead moved", async () => {
  inventory.stageResult = { success: true, data: { id, approvalRequested: true } };
  expect(await openOpportunity(leadForm())).toMatchObject({
    success: true,
    data: {
      approvalRequested: true,
      message: "A manager must approve this move. The lead will stay in Leads until then.",
    },
  });
});

it("reports saved details separately from an inventory conflict during the move", async () => {
  inventory.stageResult = {
    success: false,
    error: { code: "CONFLICT", message: "Unit A1 is no longer available. Select another unit." },
  };
  expect(await openOpportunity(leadForm())).toMatchObject({
    success: false,
    error: {
      code: "CONFLICT",
      message:
        "Details and documents saved, but the lead was not moved to Opportunity. Unit A1 is no longer available. Select another unit.",
    },
  });
  expect(inventory.updates).not.toHaveLength(0);
});

it("returns an actionable upload error without saving details", async () => {
  const form = leadForm();
  form.set("validId", new File(["%PDF-1.7\n"], "id.pdf", { type: "application/pdf" }));
  inventory.put.mockRejectedValueOnce(new Error("Storage unavailable"));
  expect(await openOpportunity(form)).toMatchObject({
    success: false,
    error: {
      message: "Couldn't upload the documents. The lead has not moved to Opportunity. Try again.",
    },
  });
  expect(inventory.updates).toEqual([]);
});

it("names the missing bank in the toast message", async () => {
  const form = leadForm();
  form.set("financingPreference", "bank_financing");
  expect(await openOpportunity(form)).toMatchObject({
    success: false,
    error: { message: "Enter the bank name for bank financing." },
  });
  expect(inventory.updates).toEqual([]);
});

it("calculates the expected amount using authorized building prices", async () => {
  expect(await getOpportunityEstimate(selection)).toMatchObject({
    success: true,
    units: "120000.25",
    parking: "25000.50",
    total: "145000.75",
    currency: "PHP",
  });
});

it("rejects inaccessible buildings and unavailable units", async () => {
  expect(
    await getOpportunityEstimate({
      ...selection,
      propertyId: "22345678-1234-4234-8234-123456789abc",
    }),
  ).toMatchObject({ success: false });
  inventory.units = [];
  // Names exactly which picks to drop, so the window can remove just those.
  expect(await getOpportunityEstimate(selection)).toMatchObject({
    success: false,
    message: expect.stringContaining("no longer available"),
    unavailableUnitIds: selection.unitIds,
  });
});

it("rejects parking quantities beyond building capacity and missing property access", async () => {
  expect(
    await getOpportunityEstimate({
      ...selection,
      parkingSlotIds: [
        id,
        "22345678-1234-4234-8234-123456789abc",
        "32345678-1234-4234-8234-123456789abc",
      ],
    }),
  ).toMatchObject({
    success: false,
    message: expect.stringContaining("2 parking slots"),
  });
  inventory.permissions.delete("properties.view");
  expect(await getOpportunityEstimate(selection)).toMatchObject({ success: false });
});

it.each([null, "", "   ", "1".repeat(51)])(
  "rejects an invalid TIN before saving (%s)",
  async (tin) => {
    const form = new FormData();
    for (const key of ["dealId", "stageId", "developmentId", "propertyId"]) {
      form.set(key, "12345678-1234-4234-8234-123456789abc");
    }
    form.set("financingPreference", "cash");
    form.set("amount", "1000");
    form.set("unitIds", "12345678-1234-4234-8234-123456789abc");
    if (tin !== null) form.set("tinNumber", tin);
    const result = await openOpportunity(form);
    expect(result).toMatchObject({
      success: false,
      error: { details: { fieldErrors: { tinNumber: expect.any(Array) } } },
    });
  },
);

it.each(["sold", "deposit_paid", "inactive"])(
  "rejects unavailable parking (%s)",
  async (status) => {
    inventory.parking[0].status = status;
    expect(await getOpportunityEstimate(selection)).toMatchObject({
      success: false,
      message: expect.stringContaining("1 selected parking slot is no longer available"),
      unavailableParkingSlotIds: selection.parkingSlotIds,
    });
  },
);

it("rejects inaccessible parking IDs and parking from another building", async () => {
  inventory.parking = [];
  expect(await getOpportunityEstimate(selection)).toMatchObject({
    success: false,
    message: expect.stringContaining("no longer available or not shared with you"),
  });
});

it("limits the parking picker to an accessible building in the selected development", async () => {
  expect(await getOpportunityParking({ developmentId: id, propertyId: id })).toMatchObject({
    slots: [{ id, code: "P1" }],
    floors: [],
  });
  expect(
    await getOpportunityParking({
      developmentId: id,
      propertyId: "22345678-1234-4234-8234-123456789abc",
    }),
  ).toBeNull();
  inventory.permissions.delete("properties.view");
  expect(await getOpportunityParking({ developmentId: id, propertyId: id })).toBeNull();
});

it("rebuilds a lead's old bill when it re-enters Opportunity with another pick", async () => {
  // Moved back to Leads earlier: units released, bill kept from the old pick.
  inventory.bill = {
    id: "bill",
    itemsTotal: "90000",
    miscellaneousFee: "0",
    reservationDiscount: "0",
  };
  expect(await openOpportunity(leadForm())).toMatchObject({ success: true });
  expect(inventory.updates).toContainEqual(expect.objectContaining({ itemsTotal: "145000.75" }));
  expect(inventory.billItems).toHaveLength(1);
});

it("refuses a move the agent can't make before saving anything", async () => {
  // Another agent's lead.
  inventory.moveDeal = [{ stageId: "leads", agentUserId: "someone-else", brokerUserId: null }];
  inventory.moveStages = [
    {
      id: "leads",
      position: 1,
      isWonStage: false,
      isLostStage: false,
      isCancelledStage: false,
      slug: "leads",
    },
    {
      id: leadForm().get("stageId"),
      position: 2,
      isWonStage: false,
      isLostStage: false,
      isCancelledStage: false,
      slug: "opportunity",
    },
  ];
  const result = await openOpportunity(leadForm());
  expect(result.success).toBe(false);
  expect(inventory.put).not.toHaveBeenCalled();
  expect(inventory.updates).toEqual([]);
});

it("refuses to save a lead whose contact was archived meanwhile", async () => {
  inventory.contactArchived = true;
  const result = await openOpportunity(leadForm());
  expect(!result.success && result.error.message).toBe(
    "This contact was archived. Refresh the pipeline.",
  );
  expect(inventory.updates).toEqual([]);
});

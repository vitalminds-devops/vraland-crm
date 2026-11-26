import { beforeEach, expect, it, vi } from "vitest";
import { canWriteProperty } from "../queries/property-scope.queries";
import { saveSlotPrices } from "./prices.actions";

const slotId = "88f50ab3-567a-4a37-9271-eaa92a221995";

const db = vi.hoisted(() => ({
  slot: null as Record<string, unknown> | null,
  saved: null as Record<string, unknown> | null,
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ limit: async () => (db.slot ? [db.slot] : []) }) }),
      }),
    }),
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        update: () => ({
          set: (values: Record<string, unknown>) => ({
            where: async () => void (db.saved = values),
          }),
        }),
        insert: () => ({ values: async () => {} }),
      }),
  },
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({ organizationId: "org", userId: "user" }),
}));
vi.mock("../queries/property-scope.queries", () => ({ canWriteProperty: vi.fn(async () => true) }));
vi.mock("../lib/revalidate-property", () => ({ revalidateProperty: vi.fn() }));

beforeEach(() => {
  db.slot = { propertyId: "p1", code: "P1", price: "300000", reservationFee: null };
  db.saved = null;
});

it("sets a slot's price and clears a blank fee to none", async () => {
  expect((await saveSlotPrices({ slotId, price: "350000", reservationFee: "" })).success).toBe(
    true,
  );
  expect(db.saved).toMatchObject({ price: "350000", reservationFee: null });
});

it("refuses a slot out of reach or not found, writing nothing", async () => {
  vi.mocked(canWriteProperty).mockResolvedValueOnce(false);
  expect((await saveSlotPrices({ slotId, price: "1" })).success).toBe(false);
  db.slot = null;
  expect((await saveSlotPrices({ slotId, price: "1" })).success).toBe(false);
  expect((await saveSlotPrices({ slotId, price: -5 })).success).toBe(false);
  expect(db.saved).toBeNull();
});

it("keeps a reserved or sold slot's price, which changes only in Billing", async () => {
  db.slot = { ...db.slot, reservedDealId: "deal" };
  const refused = await saveSlotPrices({ slotId, price: "350000" });
  expect(!refused.success && refused.error.message).toBe(
    "Parking P1 is reserved or sold. Change its price in Billing.",
  );
  expect(db.saved).toBeNull();
  // Its reservation fee can still be set, and the same price saves.
  expect((await saveSlotPrices({ slotId, price: "300000", reservationFee: "5000" })).success).toBe(
    true,
  );
});

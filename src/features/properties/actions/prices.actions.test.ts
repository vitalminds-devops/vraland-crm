import { beforeEach, expect, it, vi } from "vitest";
import { canWriteProperty } from "../lib/property-scope";
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
vi.mock("../lib/property-scope", () => ({ canWriteProperty: vi.fn(async () => true) }));
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

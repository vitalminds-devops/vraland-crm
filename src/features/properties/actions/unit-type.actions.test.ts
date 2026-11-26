import { beforeEach, expect, it, vi } from "vitest";
import { saveUnitDetails, saveUnitType } from "./unit-type.actions";

const propertyId = "88f50ab3-567a-4a37-9271-eaa92a221995";
const layout = { width: 7, depth: 8, rooms: [] };

const db = vi.hoisted(() => ({
  inserted: null as Record<string, unknown> | null,
  /** The type's price before the save. */
  oldPrice: "3000000.00" as string | null,
  sets: [] as Record<string, unknown>[],
  /** What a plain read answers; the property when null. */
  rows: null as unknown[] | null,
}));
vi.mock("@/db", () => ({
  db: {
    select: () => {
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        limit: async () => db.rows ?? [{ id: propertyId }],
      };
      return chain;
    },
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        select: () => ({
          from: () => ({ where: () => ({ for: async () => [{ price: db.oldPrice }] }) }),
        }),
        insert: () => ({
          values: (values: Record<string, unknown>) => {
            if ("layout" in values) db.inserted = values;
            return { returning: async () => [{ id: "type-1" }] };
          },
        }),
        update: () => ({
          set: (values: Record<string, unknown>) => {
            db.sets.push(values);
            const done = Object.assign(Promise.resolve(), {
              returning: async () => [{ id: "type-1" }],
            });
            return { where: () => done };
          },
        }),
      }),
  },
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
const access = vi.hoisted(() => ({ prices: true }));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({
    organizationId: "org",
    userId: "user",
    permissions: new Set(access.prices ? ["properties.manage_prices"] : []),
  }),
}));
vi.mock("../queries/property-scope.queries", () => ({ canWriteProperty: async () => true }));
vi.mock("../lib/revalidate-property", () => ({ revalidateProperty: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  db.inserted = null;
  db.oldPrice = "3000000.00";
  db.sets = [];
  access.prices = true;
  db.rows = null;
});

it("saves a unit type's own reservation fee and monthly amortization", async () => {
  const result = await saveUnitType({
    propertyId,
    name: "2BR",
    price: "3000000",
    reservationFee: "15000",
    monthlyAmortization: "25000.5",
    layout,
  });
  expect(result.success).toBe(true);
  expect(db.inserted).toMatchObject({
    price: "3000000.00",
    reservationFee: "15000.00",
    monthlyAmortization: "25000.50",
  });
});

it("leaves blank fees as none", async () => {
  await saveUnitType({ propertyId, name: "Studio", price: "", reservationFee: "", layout });
  expect(db.inserted).toMatchObject({ reservationFee: null, monthlyAmortization: null });
});

it("needs Manage prices to set amounts, but not to design a type", async () => {
  access.prices = false;
  const priced = await saveUnitType({ propertyId, name: "2BR", price: "3000000", layout });
  expect(!priced.success && priced.error.message).toBe(
    "You can't change prices and fees on this property.",
  );
  expect(db.inserted).toBeNull();
  expect((await saveUnitType({ propertyId, name: "Studio", price: "", layout })).success).toBe(
    true,
  );
});

it("pins reserved and sold units to the old type price before a new price is saved", async () => {
  const id = "0b6f1d4e-2c41-4a8e-9b11-5d3e2f7a9c10";
  await saveUnitType({ id, propertyId, name: "2BR", price: "3300000", layout });
  // First the held units take the old price, then the type changes, then units on sale follow it.
  expect(db.sets[0]).toEqual({ price: "3000000.00" });
  expect(db.sets[1]).toMatchObject({ price: "3300000.00" });
  expect(db.sets[2]).toEqual({ price: null });

  // The same price, or a type that had none, pins nothing.
  db.sets = [];
  await saveUnitType({ id, propertyId, name: "2BR", price: "3000000", layout });
  db.oldPrice = null;
  await saveUnitType({ id, propertyId, name: "2BR", price: "3300000", layout });
  expect(db.sets.filter((set) => set.price === "3000000.00" && !("name" in set))).toEqual([]);
});

it("keeps a held unit's sold price when it changes type, and leaves units on sale alone", async () => {
  const unitId = "7d2a9e51-8c3b-4f60-a1d2-3e4b5c6d7e8f";
  const unitTypeId = "0b6f1d4e-2c41-4a8e-9b11-5d3e2f7a9c10";
  const unit = {
    id: unitId,
    propertyId,
    unitTypeId: "old-type",
    floorArea: null,
    price: null,
    code: "2A",
    typePrice: "3000000.00",
  };
  db.rows = [{ ...unit, reservedDealId: "deal" }];
  await saveUnitDetails({ unitId, unitTypeId, floorArea: "", price: "" });
  expect(db.sets[0]).toMatchObject({ unitTypeId, price: "3000000.00" });

  db.sets = [];
  db.rows = [{ ...unit, reservedDealId: null }];
  await saveUnitDetails({ unitId, unitTypeId, floorArea: "", price: "" });
  expect(db.sets[0]).toMatchObject({ unitTypeId, price: null });
});

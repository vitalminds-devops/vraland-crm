import { beforeEach, expect, it, vi } from "vitest";
import { saveUnitType } from "./unit-type.actions";

const propertyId = "88f50ab3-567a-4a37-9271-eaa92a221995";
const layout = { width: 7, depth: 8, rooms: [] };

const db = vi.hoisted(() => ({ inserted: null as Record<string, unknown> | null }));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ id: propertyId }] }) }),
    }),
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        insert: () => ({
          values: (values: Record<string, unknown>) => {
            if ("layout" in values) db.inserted = values;
            return { returning: async () => [{ id: "type-1" }] };
          },
        }),
        update: () => ({
          set: () => ({ where: () => ({ returning: async () => [] }) }),
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
  access.prices = true;
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

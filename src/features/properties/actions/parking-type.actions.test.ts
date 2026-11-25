import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { saveParkingType } from "./parking-type.actions";

const propertyId = "88f50ab3-567a-4a37-9271-eaa92a221995";
const standard = {
  id: "t1",
  name: "Standard",
  w: 2.5,
  h: 5,
  price: "300000",
  reservationFee: "5000",
};

const db = vi.hoisted(() => ({
  types: [] as unknown[],
  slotUpdates: [] as { set: Record<string, unknown>; where: string }[],
}));
vi.mock("@/db", () => ({
  db: {
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        select: () => ({
          from: () => ({ where: () => ({ for: async () => [{ parkingTypes: db.types }] }) }),
        }),
        update: (table: { _: unknown }) => ({
          set: (set: Record<string, unknown>) => ({
            where: async (where: SQL) => {
              if ("parkingTypeId" in (table as object))
                db.slotUpdates.push({ set, where: new PgDialect().sqlToQuery(where).sql });
            },
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
vi.mock("../lib/property-scope", () => ({ canWriteProperty: async () => true }));
vi.mock("../lib/revalidate-property", () => ({ revalidateProperty: vi.fn() }));

beforeEach(() => {
  db.types = [standard];
  db.slotUpdates = [];
});

it("moves only slots still on the type's old price, and leaves an unchanged fee alone", async () => {
  const result = await saveParkingType({
    propertyId,
    ...standard,
    price: "350000",
    reservationFee: "5000",
  });
  expect(result.success).toBe(true);
  expect(db.slotUpdates).toHaveLength(1);
  expect(db.slotUpdates[0]!.set).toMatchObject({ price: "350000" });
  // A slot priced on its own (anything but the old 300000) is not touched.
  expect(db.slotUpdates[0]!.where).toContain('"price" is not distinct from');
});

it("changes no slot when the price and fee stay the same", async () => {
  await saveParkingType({ propertyId, ...standard, name: "Standard bay" });
  expect(db.slotUpdates).toEqual([]);
});

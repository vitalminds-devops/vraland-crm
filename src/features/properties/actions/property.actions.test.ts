import { beforeEach, expect, it, vi } from "vitest";
import { floors, properties, parkingSlots, units } from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { propertySchema } from "../schemas/property.schema";
import { createProperty, updateProperty } from "./property.actions";

const mock = vi.hoisted(() => ({
  writes: [] as { table: unknown; rows: Record<string, unknown>[] }[],
  transaction: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: mock.transaction } }));
vi.mock("@/lib/record-codes", () => ({ nextRecordCode: async () => "PROP-0001" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async () => ({
    organizationId: "organization",
    userId: "creator",
    permissions: new Set(["properties.create"]),
  })),
}));
vi.mock("@/lib/permissions/policy", () => ({ hasUnrestrictedInventoryAccess: () => true }));
vi.mock("../queries/property-scope.queries", () => ({ canWriteProperty: vi.fn(async () => true) }));
vi.mock("../lib/parking-sync", () => ({
  syncParkingCount: vi.fn(),
}));

const base = {
  title: "Tower",
  propertyType: "condominium",
  listingType: "sale",
  status: "active",
  currency: "PHP",
  unitIdentifierStyle: "letter",
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.writes = [];
  mock.transaction.mockImplementation(async (work) =>
    work({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [{ status: "active" }] }) }),
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => {
          mock.writes.push({ table, rows: [values] });
          return { where: async () => {} };
        },
      }),
      delete: (table: unknown) => ({
        where: async () => void mock.writes.push({ table, rows: [] }),
      }),
      insert: (table: unknown) => ({
        values: (value: Record<string, unknown> | Record<string, unknown>[]) => {
          const rows = Array.isArray(value) ? value : [value];
          mock.writes.push({ table, rows });
          return {
            returning: async () =>
              table === properties
                ? [{ id: "property" }]
                : rows.map((row) => ({ ...row, id: `floor-${row.level}` })),
          };
        },
      }),
    }),
  );
});

it("preserves inventory counts when editing property details, including legacy partial configurations", async () => {
  const result = await updateProperty("property", {
    ...propertySchema.parse(base),
    floorCount: 2,
    unitsPerFloor: null,
  });
  expect(result.success).toBe(true);
  const update = mock.writes.find((write) => write.table === properties)!.rows[0];
  expect(update).not.toHaveProperty("floorCount");
  expect(update).not.toHaveProperty("unitsPerFloor");
  expect(mock.writes.some((write) => write.table === floors || write.table === units)).toBe(false);
});

it("never deletes parking slots when a lower parking count is saved", async () => {
  const result = await updateProperty("property", {
    ...propertySchema.parse(base),
    parkingSlotLimit: 0,
  });
  expect(result.success).toBe(true);
  expect(mock.writes.some((write) => write.table === parkingSlots)).toBe(false);
});

it("creates only the property; floors, units and parking are added on its page", async () => {
  const result = await createProperty(
    propertySchema.parse({ ...base, floorCount: 4, unitsPerFloor: 2, parkingSlotLimit: 3 }),
  );
  expect(result.success).toBe(true);
  expect(requirePermission).toHaveBeenCalledWith("properties.create");
  const created = mock.writes.find((write) => write.table === properties)!.rows[0];
  expect(created).not.toHaveProperty("floorCount");
  expect(created.parkingSlotLimit).toBe(0);
  expect(mock.writes.some((write) => write.table === floors || write.table === units)).toBe(false);
});

it("allows unconfigured properties and rejects partially configured inventories", async () => {
  expect((await createProperty(propertySchema.parse(base))).success).toBe(true);
  expect(mock.writes.some((write) => write.table === floors || write.table === units)).toBe(false);
  expect(propertySchema.safeParse({ ...base, floorCount: 2 }).success).toBe(false);
  expect(propertySchema.safeParse({ ...base, unitsPerFloor: 2 }).success).toBe(false);
});

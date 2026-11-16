import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { units, propertyParkingSlots } from "@/db/schema";
import { InventoryUnavailable, syncDealInventory } from "./deal-inventory";

vi.mock("@/db", () => ({ db: {} }));
type Row = {
  id: string;
  code: string;
  buildingId: string;
  status: string;
  reservedDealId: string | null;
  propertyDeletedAt: Date | null;
};
let unitRows: Row[],
  parkingRows: Row[],
  writes: { table: unknown; values: Record<string, unknown>; ids: unknown[] }[],
  locks: unknown[];
const input = {
  organizationId: "organization",
  actorUserId: "actor",
  dealId: "deal",
  buildingId: "building",
  unitIds: ["unit-1", "unit-2"],
  parkingSlotIds: ["parking-1"],
  status: "deposit_paid" as const,
};
const row = (id: string): Row => ({
  id,
  code: id,
  buildingId: "building",
  status: "available",
  reservedDealId: null,
  propertyDeletedAt: null,
});
function transaction() {
  return {
    select: () => {
      let selected: unknown;
      const query = {
        from: (table: unknown) => {
          selected = table;
          return query;
        },
        innerJoin: () => query,
        where: () => query,
        orderBy: () => query,
        for: async () => {
          locks.push(selected);
          return selected === units ? unitRows : parkingRows;
        },
      };
      return query;
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async (condition: SQL) => {
          writes.push({ table, values, ids: new PgDialect().sqlToQuery(condition).params });
        },
      }),
    }),
    insert: () => ({ values: async () => {} }),
  } as unknown as Parameters<typeof syncDealInventory>[0];
}
beforeEach(() => {
  unitRows = [row("unit-1"), row("unit-2")];
  parkingRows = [row("parking-1")];
  writes = [];
  locks = [];
});

it("reserves every selected unit and parking slot together and records the owning deal", async () => {
  expect(await syncDealInventory(transaction(), input)).toEqual(["building"]);
  expect(locks).toEqual([units, propertyParkingSlots]);
  expect(writes.find((write) => write.table === units)).toMatchObject({
    values: { status: "deposit_paid", reservedDealId: "deal" },
    ids: ["unit-1", "unit-2"],
  });
  expect(writes.find((write) => write.table === propertyParkingSlots)).toMatchObject({
    values: { status: "deposit_paid", reservedDealId: "deal" },
    ids: ["parking-1"],
  });
});
it("rejects a parking conflict before reserving any units", async () => {
  parkingRows[0].status = "deposit_paid";
  parkingRows[0].reservedDealId = "other-deal";
  await expect(syncDealInventory(transaction(), input)).rejects.toBeInstanceOf(
    InventoryUnavailable,
  );
  expect(writes).toEqual([]);
});
it.each(["sold", "inactive", "deposit_paid"])(
  "does not take manually unavailable inventory (%s)",
  async (status) => {
    unitRows[1].status = status;
    await expect(syncDealInventory(transaction(), input)).rejects.toBeInstanceOf(
      InventoryUnavailable,
    );
    expect(writes).toEqual([]);
  },
);
it("does not take a row owned by another deal even if its status was reset incorrectly", async () => {
  unitRows[0].reservedDealId = "other-deal";
  await expect(syncDealInventory(transaction(), input)).rejects.toBeInstanceOf(
    InventoryUnavailable,
  );
  expect(writes).toEqual([]);
});
it("is idempotent for reservations already owned by this deal", async () => {
  for (const item of [...unitRows, ...parkingRows]) {
    item.reservedDealId = "deal";
    item.status = "deposit_paid";
  }
  await syncDealInventory(transaction(), input);
  expect(writes).toEqual([]);
});
it("marks the deal's inventory sold on completion", async () => {
  for (const item of [...unitRows, ...parkingRows]) {
    item.reservedDealId = "deal";
    item.status = "deposit_paid";
  }
  await syncDealInventory(transaction(), { ...input, status: "sold" });
  expect(writes).toHaveLength(2);
  expect(
    writes.every(
      (write) => write.values.status === "sold" && write.values.reservedDealId === "deal",
    ),
  ).toBe(true);
});
it("releases only this deal's inventory when it returns to Leads or closes unsuccessfully", async () => {
  unitRows[0].reservedDealId = "deal";
  unitRows[0].status = "sold";
  unitRows[1].reservedDealId = "other-deal";
  unitRows[1].status = "deposit_paid";
  parkingRows[0].reservedDealId = "deal";
  parkingRows[0].status = "deposit_paid";
  await syncDealInventory(transaction(), { ...input, status: "available" });
  expect(writes.flatMap((write) => write.ids)).toEqual(["unit-1", "parking-1"]);
  expect(
    writes.every(
      (write) => write.values.status === "available" && write.values.reservedDealId === null,
    ),
  ).toBe(true);
});
it("checks missing, deleted and different-building selections before writing", async () => {
  for (const change of [
    () => {
      unitRows.pop();
    },
    () => {
      unitRows[0].propertyDeletedAt = new Date();
    },
    () => {
      unitRows[0].buildingId = "other-building";
    },
  ]) {
    unitRows = [row("unit-1"), row("unit-2")];
    change();
    await expect(syncDealInventory(transaction(), input)).rejects.toBeInstanceOf(
      InventoryUnavailable,
    );
    expect(writes).toEqual([]);
  }
});

it("recovers a missing legacy building link only when all selected inventory shares one building", async () => {
  await syncDealInventory(transaction(), { ...input, buildingId: null });
  expect(writes).toHaveLength(2);
});

it("rejects mixed-building legacy inventory without a building link", async () => {
  parkingRows[0].buildingId = "other-building";
  await expect(
    syncDealInventory(transaction(), { ...input, buildingId: null }),
  ).rejects.toBeInstanceOf(InventoryUnavailable);
  expect(writes).toEqual([]);
});

it("keeps syncing inventory a deal already owns after its building is archived", async () => {
  for (const item of [...unitRows, ...parkingRows]) {
    item.reservedDealId = "deal";
    item.status = "sold";
    item.propertyDeletedAt = new Date();
  }
  await expect(
    syncDealInventory(transaction(), { ...input, status: "sold" }),
  ).resolves.toBeDefined();
  expect(writes).toEqual([]);
});

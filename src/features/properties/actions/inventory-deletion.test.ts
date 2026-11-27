import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { deals, floors, propertyParkingSlots, units } from "@/db/schema";
import { deleteFloor, deleteUnit } from "./unit.actions";
import { deleteParkingSlot } from "./parking.actions";

const mock = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  status: "available",
  owner: null as string | null,
  dealCode: null as string | null,
  deleted: [] as unknown[],
  locks: [] as unknown[],
  joins: [] as SQL[],
  filters: [] as SQL[],
}));
vi.mock("@/db", () => ({ db: { select: mock.select, transaction: mock.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({ organizationId: "organization", userId: "user" }),
}));
vi.mock("../queries/property-scope.queries", () => ({ canWriteProperty: async () => true }));
vi.mock("../lib/parking-sync", () => ({ syncParkingCount: vi.fn() }));

const id = "10000000-0000-4000-8000-000000000001";
const loaded = { id, code: "1B", status: "available", propertyId: "building", label: "1st Floor" };
function query(transaction = false) {
  let table: unknown;
  const rows = () => {
    if (!transaction) return [loaded];
    if (table === deals) return mock.dealCode ? [{ dealCode: mock.dealCode }] : [];
    return [
      {
        ...loaded,
        total: 0,
        status: mock.status,
        reservedDealId: mock.owner,
        dealCode: mock.dealCode,
      },
    ];
  };
  const result = {
    from: (value: unknown) => {
      table = value;
      return result;
    },
    innerJoin: () => result,
    leftJoin: (_: unknown, condition: SQL) => {
      mock.joins.push(condition);
      return result;
    },
    where: (condition: SQL) => {
      if (transaction) mock.filters.push(condition);
      return result;
    },
    orderBy: () => result,
    limit: async () => rows(),
    for: async () => {
      mock.locks.push(table);
      return rows();
    },
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows()).then(resolve),
  };
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.status = "available";
  mock.owner = null;
  mock.dealCode = null;
  mock.deleted = [];
  mock.locks = [];
  mock.joins = [];
  mock.filters = [];
  mock.select.mockImplementation(() => query());
  mock.transaction.mockImplementation(async (work) =>
    work({
      select: () => query(true),
      delete: (table: unknown) => ({
        where: async () => {
          mock.deleted.push(table);
        },
      }),
      update: () => ({ set: () => ({ where: async () => {} }) }),
      insert: () => ({ values: async () => {} }),
    }),
  );
});

it.each([
  ["unit", deleteUnit, units],
  ["floor", deleteFloor, units],
  ["parking", deleteParkingSlot, propertyParkingSlots],
] as const)(
  "rechecks newly reserved %s inventory while locked before deleting",
  async (_, remove, table) => {
    // The initial load still says Available; the locked row reflects a concurrent reservation.
    mock.status = "deposit_paid";
    mock.owner = "deal";
    expect(await remove(id)).toMatchObject({
      success: false,
      message: expect.stringContaining("reserved"),
    });
    expect(mock.locks).toContain(table);
    expect(mock.deleted).toEqual([]);
  },
);

it("protects secondary selected units on open deals", async () => {
  mock.dealCode = "DEAL-1";
  expect(await deleteUnit(id)).toMatchObject({
    success: false,
    message: expect.stringContaining("DEAL-1"),
  });
  const join = new PgDialect().sqlToQuery(mock.joins[0]).sql;
  expect(join).toContain('"unit_ids"');
  expect(join).toContain("any(");
  expect(mock.deleted).toEqual([]);
});

it("protects parking selected on an open deal even before reservation", async () => {
  mock.dealCode = "DEAL-2";
  expect(await deleteParkingSlot(id)).toMatchObject({
    success: false,
    message: expect.stringContaining("DEAL-2"),
  });
  expect(
    mock.filters.some((filter) =>
      new PgDialect().sqlToQuery(filter).sql.includes('"parking_slot_ids"'),
    ),
  ).toBe(true);
  expect(mock.deleted).toEqual([]);
});

it("locks the floor before its units and removes unclaimed inventory", async () => {
  expect(await deleteFloor(id)).toMatchObject({ success: true });
  expect(mock.locks).toEqual([floors, units]);
  expect(mock.deleted).toEqual([floors]);
});

it.each([
  [deleteUnit, units],
  [deleteParkingSlot, propertyParkingSlots],
] as const)("still removes available unclaimed inventory", async (remove, table) => {
  expect(await remove(id)).toMatchObject({ success: true });
  expect(mock.deleted).toEqual([table]);
});

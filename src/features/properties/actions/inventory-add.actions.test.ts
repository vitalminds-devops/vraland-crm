import { beforeEach, expect, it, vi } from "vitest";
import { auditLogs, floors, propertyParkingSlots, units } from "@/db/schema";
import { syncParkingCount } from "../lib/parking-sync";
import { addParkingSlot } from "./parking.actions";
import { addFloor, addUnit } from "./unit.actions";

const id = "12345678-1234-4234-8234-123456789abc";

/** What each table holds before the action runs, and every row the action inserts. */
const mock = vi.hoisted(() => ({
  floorLevels: [] as number[],
  unitCodes: [] as string[],
  parkingCodes: [] as string[],
  inserted: [] as { table: unknown; rows: Record<string, unknown>[] }[],
}));

/** A select chain that answers by table; `{ total }` selects are the floor count. */
function select(fields: Record<string, unknown> | undefined) {
  let table: unknown;
  const rows = async () => {
    if (fields && "total" in fields) return [{ total: mock.floorLevels.length }];
    if (table === floors && fields && "level" in fields && !("label" in fields || "id" in fields))
      return mock.floorLevels.map((level) => ({ level }));
    if (table === floors)
      return [
        { id, level: 3, label: "3rd Floor", propertyId: "property", developmentId: "development" },
      ];
    if (table === units) return mock.unitCodes.map((code) => ({ code }));
    if (table === propertyParkingSlots) return mock.parkingCodes.map((code) => ({ code }));
    return [{ id, title: "Tower 2", developmentId: "development" }];
  };
  const chain = {
    from: (from: unknown) => ((table = from), chain),
    innerJoin: () => chain,
    where: () => chain,
    limit: rows,
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      rows().then(resolve, reject),
  };
  return chain;
}

function insert(table: unknown) {
  return {
    values: (value: Record<string, unknown> | Record<string, unknown>[]) => {
      const rows = Array.isArray(value) ? value : [value];
      mock.inserted.push({ table, rows });
      if (table === floors) mock.floorLevels.push(...rows.map((row) => row.level as number));
      const returned = rows.map((row, index) => ({
        ...row,
        id: `${String(row.level ?? row.code ?? index)}-id`,
      }));
      return Object.assign(Promise.resolve(), { returning: async () => returned });
    },
  };
}

vi.mock("@/db", () => ({
  db: {
    select,
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        select,
        insert,
        update: () => ({ set: () => ({ where: async () => {} }) }),
      }),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async () => ({ organizationId: "organization", userId: "admin" })),
}));
vi.mock("@/lib/storage/document-storage", () => ({ getDocumentStorage: vi.fn() }));
vi.mock("../queries/property-scope.queries", () => ({ canWriteProperty: vi.fn(async () => true) }));
vi.mock("../lib/parking-sync", () => ({
  syncParkingCount: vi.fn(),
  placeOnDesignedFloor: vi.fn(),
}));

const rowsIn = (table: unknown) =>
  mock.inserted.filter((write) => write.table === table).flatMap((write) => write.rows);

beforeEach(() => {
  vi.clearAllMocks();
  mock.floorLevels = [];
  mock.unitCodes = [];
  mock.parkingCodes = [];
  mock.inserted = [];
});

it("adds several floors above the top one, skipping level 4, each with its units", async () => {
  mock.floorLevels = [1, 2, 3];
  expect(await addFloor(id, 2, 3)).toEqual({ success: true, message: "2 floors added." });
  expect(rowsIn(floors).map((row) => [row.level, row.label])).toEqual([
    [5, "5th Floor"],
    [6, "6th Floor"],
  ]);
  expect(rowsIn(units).map((row) => row.code)).toEqual(["5A", "5B", "5C", "6A", "6B", "6C"]);
  expect(rowsIn(units).every((row) => row.developmentId === "development")).toBe(true);
  expect(rowsIn(auditLogs)).toHaveLength(2);
});

it("adds a single empty floor with the original message", async () => {
  expect(await addFloor(id)).toEqual({ success: true, message: "1st Floor added." });
  expect(rowsIn(units)).toEqual([]);
});

it.each([
  [0, 0],
  [101, 0],
  [1, 101],
  [1.5, 0],
])("refuses %s floors with %s units each", async (count, unitsEach) => {
  expect(await addFloor(id, count, unitsEach)).toEqual({
    success: false,
    message: "Enter between 1 and 100.",
  });
  expect(mock.inserted).toEqual([]);
});

it("fills the floor's free unit numbers first, using none twice", async () => {
  mock.unitCodes = ["3A", "3C"];
  expect(await addUnit(id, 3)).toEqual({ success: true, message: "3 units added to 3rd Floor." });
  expect(rowsIn(units).map((row) => row.code)).toEqual(["3B", "3D", "3E"]);
});

it("adds one unit with the original message", async () => {
  expect(await addUnit(id)).toEqual({ success: true, message: "Unit 3A added to 3rd Floor." });
});

it("adds several parking slots on the chosen floor and keeps the count in step", async () => {
  mock.parkingCodes = ["P1", "P2"];
  expect(await addParkingSlot(id, id, 3)).toEqual({
    success: true,
    message: "3 parking slots added.",
  });
  expect(rowsIn(propertyParkingSlots).map((row) => [row.code, row.floorId])).toEqual([
    ["P3", id],
    ["P4", id],
    ["P5", id],
  ]);
  expect(syncParkingCount).toHaveBeenCalledTimes(1);
});

it("refuses more than 100 parking slots at once", async () => {
  expect(await addParkingSlot(id, null, 101)).toEqual({
    success: false,
    message: "Enter between 1 and 100.",
  });
});

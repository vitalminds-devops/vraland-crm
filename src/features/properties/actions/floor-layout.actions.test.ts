import { beforeEach, expect, it, vi } from "vitest";
import { activities, floors, propertyParkingSlots, units } from "@/db/schema";
import { saveFloorLayout } from "./floor-layout.actions";

const floorId = "7a1d3e3c-0f43-4c39-9d3f-4f0d7d8b1a01";
const typeId = "88f50ab3-567a-4a37-9271-eaa92a221995";
const u1 = "11111111-1111-4111-8111-111111111111";
const u2 = "22222222-2222-4222-8222-222222222222";
const tandem = {
  id: "tandem",
  name: "Tandem",
  w: 2.5,
  h: 10,
  price: "500000",
  reservationFee: "10000",
};
const unit = (id: string, unitId: string | null, x: number, code?: string) => ({
  id,
  x,
  y: 0,
  w: 7,
  h: 8,
  rotation: 0,
  typeId,
  unitId,
  flip: false,
  ...(code && { code }),
});

/** Every write the action makes, in order, by table. */
const db = vi.hoisted(() => ({
  writes: [] as { op: string; table: unknown; values: unknown }[],
  floorUnits: [] as { id: string; code: string }[],
  /** A second floor, level 5, to copy the layout onto. */
  copyFloor: false,
  /** A database error the next insert throws, as `cause`. */
  failInsert: null as { code: string; table: string } | null,
}));
const floor5 = "5a1d3e3c-0f43-4c39-9d3f-4f0d7d8b1a05";

vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  // Rows each select returns, by the table it reads from.
  const rows = (table: unknown) => {
    if (table === schema.floors)
      return [
        { id: floorId, level: 1, label: "1st Floor", layout: null },
        ...(db.copyFloor ? [{ id: floor5, level: 5, label: "5th Floor", layout: null }] : []),
      ];
    if (table === schema.units) return db.floorUnits;
    if (table === schema.unitTypes) return [{ id: typeId }];
    if (table === schema.propertyParkingSlots) return [];
    return [
      {
        id: floorId,
        propertyId: "property",
        developmentId: null,
        numbering: { style: "number", unitsPerFloor: 0, endings: [], skipFloors: [] },
        parkingTypes: [tandem],
      },
    ];
  };
  /** A query whose every method chains, and which resolves to its table's rows when awaited. */
  const chain = (table: unknown, result: () => unknown): unknown =>
    new Proxy(
      {},
      {
        get: (_, key) =>
          key === "then"
            ? (resolve: (value: unknown) => void) => resolve(result())
            : (...args: unknown[]) =>
                // The joined table decides the rows: floors joined to properties is the source.
                key === "from" || key === "innerJoin"
                  ? chain(args[0], () => rows(args[0]))
                  : chain(table, result),
      },
    );
  const write = (op: string) => (table: unknown) => ({
    set: (values: unknown) => (db.writes.push({ op, table, values }), chain(table, () => [])),
    values: (values: unknown) => {
      if (op === "insert" && db.failInsert && table === schema.propertyParkingSlots)
        throw Object.assign(new Error("duplicate key"), { cause: db.failInsert });
      db.writes.push({ op, table, values });
      const list = Array.isArray(values) ? values : [values];
      return chain(table, () =>
        list.map((row: Record<string, unknown>, index) => ({ id: `new-${index}`, code: row.code })),
      );
    },
    where: async () => void db.writes.push({ op, table, values: null }),
  });
  const tx = {
    select: () => chain(null, () => []),
    insert: write("insert"),
    update: write("update"),
    delete: write("delete"),
  };
  return {
    db: { ...tx, transaction: async (work: (t: unknown) => unknown) => work(tx) },
  };
});
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({ organizationId: "org", userId: "user" }),
}));
vi.mock("../queries/property-scope.queries", () => ({ canWriteProperty: async () => true }));
vi.mock("../lib/revalidate-property", () => ({ revalidateProperty: vi.fn() }));
vi.mock("../lib/unit-removal", () => ({ removalBlocker: async () => null }));
vi.mock("../lib/parking-removal", () => ({ parkingRemovalBlocker: async () => null }));
vi.mock("../lib/parking-sync", () => ({ syncParkingCount: vi.fn() }));

const updatesTo = (table: unknown) =>
  db.writes.filter((write) => write.op === "update" && write.table === table);

beforeEach(() => {
  db.writes = [];
  db.copyFloor = false;
  db.failInsert = null;
  db.floorUnits = [
    { id: u1, code: "101" },
    { id: u2, code: "102" },
  ];
});

it("swaps two units' identifiers through temporary codes, so they never collide", async () => {
  const result = await saveFloorLayout({
    floorId,
    copyToFloorIds: [],
    layout: {
      width: 40,
      depth: 20,
      spaces: [],
      units: [unit("a", u1, 0, "102"), unit("b", u2, 10, "101")],
    },
  });
  expect(result.success).toBe(true);
  const codes = updatesTo(units)
    .map((write) => (write.values as { code?: string }).code)
    .filter(Boolean);
  // Both step aside first, then both take their new identifier.
  expect(codes).toEqual([`~${u1}`, `~${u2}`, "102", "101"]);
  // Each rename shows in the unit's history.
  const logged = db.writes
    .filter((write) => write.op === "insert" && write.table === activities)
    .flatMap((write) => write.values as { summary: string }[])
    .map((row) => row.summary);
  expect(logged).toEqual(["Unit 101 was renamed to 102.", "Unit 102 was renamed to 101."]);
});

it("gives a new slot dragged in as a parking type that type's price and fee", async () => {
  db.floorUnits = [];
  const result = await saveFloorLayout({
    floorId,
    copyToFloorIds: [],
    layout: {
      width: 40,
      depth: 20,
      spaces: [],
      units: [],
      parking: [
        { id: "s1", x: 0, y: 0, w: 2.5, h: 10, rotation: 0, slotId: null, typeId: "tandem" },
        { id: "s2", x: 5, y: 0, w: 2.5, h: 5, rotation: 0, slotId: null },
      ],
    },
  });
  expect(result.success).toBe(true);
  const inserted = db.writes.find(
    (write) => write.op === "insert" && write.table === propertyParkingSlots,
  )?.values as Record<string, unknown>[];
  expect(inserted[0]).toMatchObject({
    parkingTypeId: "tandem",
    price: "500000",
    reservationFee: "10000",
  });
  // A plain slot starts with no price.
  expect(inserted[1]).toMatchObject({ parkingTypeId: null, price: null });
  // The saved plan keeps each slot's type, but not typed names.
  const saved = updatesTo(floors)[0]?.values as { layout: { parking: { typeId?: string }[] } };
  expect(saved.layout.parking[0]?.typeId).toBe("tandem");
});

it("copies a floor with the identifiers typed in the same save", async () => {
  db.copyFloor = true;
  const result = await saveFloorLayout({
    floorId,
    copyToFloorIds: [floor5],
    layout: {
      width: 40,
      depth: 20,
      spaces: [],
      units: [unit("a", u1, 0, "110"), unit("b", u2, 10)],
    },
  });
  expect(result.success).toBe(true);
  const copied = db.writes
    .filter((write) => write.op === "insert" && write.table === units)
    .flatMap((write) => write.values as { code: string; floorId: string }[])
    .filter((row) => row.floorId === floor5)
    .map((row) => row.code);
  // 101 renamed to 110 on floor 1 becomes 510 on floor 5, not 501.
  expect(copied.sort()).toEqual(["502", "510"]);
});

it("names parking slots when two would share an identifier", async () => {
  db.failInsert = { code: "23505", table: "parking_slots" };
  const result = await saveFloorLayout({
    floorId,
    copyToFloorIds: [],
    layout: {
      width: 40,
      depth: 20,
      spaces: [],
      units: [],
      parking: [{ id: "s1", x: 0, y: 0, w: 2.5, h: 5, rotation: 0, slotId: null }],
    },
  });
  expect(!result.success && result.error.message).toBe(
    "Two parking slots would share an identifier. Rename one and try again.",
  );
});

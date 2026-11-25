import { beforeEach, expect, it, vi } from "vitest";
import { saveUnitNaming } from "./unit-naming.actions";

const propertyId = "88f50ab3-567a-4a37-9271-eaa92a221995";
const floorA = "7a1d3e3c-0f43-4c39-9d3f-4f0d7d8b1a01";
const floorGone = "7a1d3e3c-0f43-4c39-9d3f-4f0d7d8b1a02";
const numbering = { style: "letter", unitsPerFloor: 6, endings: [], skipFloors: [4] };
const sunrise = { id: "g1", name: "Sunrise", color: "orange", floorIds: [floorA], side: "even" };

const db = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
  ownFloors: [] as { id: string }[],
  saved: null as Record<string, unknown> | null,
}));
vi.mock("@/db", () => ({
  db: {
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        select: (columns: Record<string, unknown>) => ({
          from: () => ({
            where: () =>
              "unitNumbering" in columns
                ? { for: async () => (db.current ? [db.current] : []) }
                : Promise.resolve(db.ownFloors),
          }),
        }),
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
vi.mock("../lib/property-scope", () => ({ canWriteProperty: async () => true }));
vi.mock("../lib/revalidate-property", () => ({ revalidateProperty: vi.fn() }));

beforeEach(() => {
  db.current = { unitNumbering: numbering, floorGroups: [sunrise] };
  db.ownFloors = [{ id: floorA }];
  db.saved = null;
});

it("saves only the identifier style when no sections are sent", async () => {
  expect((await saveUnitNaming({ propertyId, style: "number" })).success).toBe(true);
  expect(db.saved).toMatchObject({
    unitNumbering: { style: "number", skipFloors: [4] },
    floorGroups: [sunrise],
  });
});

it("saves only sections when no style is sent, dropping a floor removed since", async () => {
  const both = { ...sunrise, floorIds: [floorA, floorGone] };
  const gone = { ...sunrise, id: "g2", name: "Old wing", side: "odd", floorIds: [floorGone] };
  expect((await saveUnitNaming({ propertyId, floorGroups: [both, gone] })).success).toBe(true);
  expect(db.saved?.unitNumbering).toBe(numbering);
  // The removed floor leaves its section, and a section left with no floors goes too.
  expect(db.saved?.floorGroups).toEqual([{ ...both, floorIds: [floorA], endings: [] }]);
});

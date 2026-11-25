import { expect, it } from "vitest";
import { defaultFloorLayout } from "./floor-layout";
import {
  floorWithParking,
  parkingBayPosition,
  parkingPlan,
  placeSlotsOnFloor,
} from "./parking-layout";

it("keeps slot meshes and controls aligned in two rows around the aisle", () => {
  expect(parkingBayPosition(0, 12)).toEqual([-5.5, 0, -2.7]);
  expect(parkingBayPosition(6, 12)).toEqual([-5.5, 0, 2.7]);
  expect(parkingBayPosition(11, 12)).toEqual([5.5, 0, 2.7]);
  expect(
    new Set(Array.from({ length: 12 }, (_, index) => parkingBayPosition(index, 12).join(","))).size,
  ).toBe(12);
});

it("centers a single slot and retains every slot in an odd-sized area", () => {
  expect(parkingBayPosition(0, 1)).toEqual([0, 0, -2.7]);
  expect(parkingBayPosition(6, 7)[2]).toBe(2.7);
});

it("puts slots into free spots, then a new row when the floor is full", () => {
  const empty = { width: 5, depth: 5, units: [], spaces: [], parking: [] };
  const placed = placeSlotsOnFloor(empty, ["a", "b", "c"]);
  expect(placed.parking?.map((slot) => [slot.slotId, slot.x, slot.y])).toEqual([
    ["a", 0, 0],
    ["b", 2.5, 0],
    ["c", 0, 5],
  ]);
  expect(placed.depth).toBe(10);
});

it("brings an old parking design in below the units, and places slots not on it", () => {
  const units = {
    width: 20,
    depth: 10,
    units: [
      {
        id: "u",
        typeId: "t",
        unitId: null,
        flip: false,
        x: 0,
        y: 0,
        w: 8,
        h: 6,
        rotation: 0 as const,
      },
    ],
    spaces: [],
  };
  const legacy = {
    width: 12,
    depth: 8,
    slots: [{ id: "s", slotId: "a", x: 1, y: 1, w: 2.5, h: 5, rotation: 0 as const }],
    pieces: [{ id: "d", kind: "driveway" as const, x: 0, y: 6, w: 12, h: 2, rotation: 0 as const }],
  };
  const merged = floorWithParking(units, legacy, ["a", "b"]);
  // Below the 6 m unit with a metre between, so the old design starts at y = 7.
  expect(merged.parking?.[0]).toMatchObject({ slotId: "a", x: 1, y: 8 });
  expect(merged.spaces[0]).toMatchObject({ kind: "driveway", y: 13 });
  expect(merged.depth).toBe(15);
  expect(merged.parking?.some((slot) => slot.slotId === "b")).toBe(true);
});

it("draws parking from the floor's design, or else from the old parking design", () => {
  const layout = placeSlotsOnFloor({ ...defaultFloorLayout, parking: [] }, ["a"]);
  expect(parkingPlan({ layout })?.slots).toHaveLength(1);
  expect(parkingPlan({ layout: defaultFloorLayout, parkingLayout: null })).toBeNull();
});

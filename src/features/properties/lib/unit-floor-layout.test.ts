import { expect, it } from "vitest";
import { UNIT_ROOM_WIDTH, unitFloorColumns, unitRoomPosition } from "./unit-floor-layout";

it("centers a single unit and spaces neighbouring rooms without overlap", () => {
  expect(unitRoomPosition(0, 1)).toEqual([0, 0, 0]);
  for (let count = 2; count <= 4; count++) {
    expect(unitRoomPosition(0, count)[0] + unitRoomPosition(count - 1, count)[0]).toBeCloseTo(0);
    for (let index = 1; index < count; index++)
      expect(unitRoomPosition(index, count)[0] - unitRoomPosition(index - 1, count)[0]).toBeCloseTo(
        UNIT_ROOM_WIDTH,
      );
  }
});

it("applies the chosen arrangement without changing the number of units", () => {
  for (const count of [1, 2, 5, 13]) {
    expect(unitFloorColumns(count, "single")).toBe(count);
    expect(unitFloorColumns(count, "double")).toBe(Math.ceil(count / 2));
    for (const arrangement of ["single", "double"] as const) {
      const positions = Array.from({ length: count }, (_, index) =>
        unitRoomPosition(index, count, arrangement),
      );
      expect(new Set(positions.map((position) => position.join(","))).size).toBe(count);
      if (arrangement === "single")
        expect(positions.every((position) => position[2] === 0)).toBe(true);
    }
  }
});

it.each([5, 6, 13, 24, 101])("lays out all %s units in two rows without overlap", (count) => {
  const positions = Array.from({ length: count }, (_, index) => unitRoomPosition(index, count));
  expect(new Set(positions.map((position) => position.join(","))).size).toBe(count);
  expect(unitFloorColumns(count)).toBe(Math.ceil(count / 2));
  for (let index = 0; index < count; index++) {
    expect(Math.abs(positions[index][2])).toBe(4.3);
    expect(Math.abs(positions[index][0])).toBeLessThan(
      (unitFloorColumns(count) * UNIT_ROOM_WIDTH) / 2,
    );
    if (index > 0 && positions[index][2] === positions[index - 1][2]) {
      expect(positions[index][0] - positions[index - 1][0]).toBeCloseTo(UNIT_ROOM_WIDTH);
    }
  }
});

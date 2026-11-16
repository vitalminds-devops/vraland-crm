import { expect, it } from "vitest";
import { parkingBayPosition } from "./parking-layout";

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

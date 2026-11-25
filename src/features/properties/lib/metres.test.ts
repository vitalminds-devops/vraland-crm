import { expect, it } from "vitest";
import { metresInRange, settleMetres } from "./metres";

it("lets a size be typed digit by digit without forcing it up", () => {
  // "1" on the way to "12" is below the minimum of 2: not applied yet, not changed.
  expect(metresInRange("1", 2, 60)).toBeNull();
  expect(metresInRange("12", 2, 60)).toBe(12);
  expect(metresInRange("7.5", 2, 60)).toBe(7.5);
  expect(metresInRange("", 2, 60)).toBeNull();
});

it("settles a size into range when leaving the field", () => {
  expect(settleMetres("1", 2, 60)).toBe(2);
  expect(settleMetres("900", 2, 60)).toBe(60);
  expect(settleMetres("abc", 2, 60)).toBeNull();
  expect(settleMetres("", 2, 60)).toBeNull();
});

import { expect, it } from "vitest";
import { isHeld } from "./unit-codes";

it("holds reserved and sold-out units only", () => {
  expect(isHeld("deposit_paid")).toBe(true);
  expect(isHeld("sold")).toBe(true);
  expect(isHeld("available")).toBe(false);
  expect(isHeld("inactive")).toBe(false);
  expect(isHeld(undefined)).toBe(false);
});

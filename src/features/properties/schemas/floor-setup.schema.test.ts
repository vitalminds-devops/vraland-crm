import { expect, it } from "vitest";
import { floorSetupSchema } from "./floor-setup.schema";

const base = {
  fromLevel: 2,
  toLevel: 10,
  skipFloors: [],
  style: "custom" as const,
  endings: ["01", "03", "05", "07", "09", "11", "15", "17"],
};

const message = (input: object) =>
  floorSetupSchema.safeParse({ ...base, ...input }).error?.issues[0]?.message;

it("accepts the sample tower: floors 2 to 10 with custom endings", () => {
  expect(floorSetupSchema.safeParse(base).success).toBe(true);
});

it("refuses setups that would create nothing or too much", () => {
  expect(message({ toLevel: 1 })).toBe("End at or above the starting floor.");
  expect(message({ fromLevel: 4, toLevel: 4, skipFloors: [4] })).toBe("Every floor is skipped.");
  expect(message({ fromLevel: 1, toLevel: 101 })).toBe("Set up at most 100 floors at once.");
  expect(message({ endings: [] })).toBe("Enter the unit endings.");
  // Letters and numbers need no count: units come from designing each floor.
  expect(message({ style: "number", endings: [] })).toBeUndefined();
});

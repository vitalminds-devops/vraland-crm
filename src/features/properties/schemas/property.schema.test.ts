import { expect, it } from "vitest";
import { propertySchema } from "./property.schema";

it("accepts an optional, nonnegative parking price", () => {
  const price = propertySchema.shape.parkingPrice;
  expect(price.parse(undefined)).toBeNull();
  expect(price.parse("350000.50")).toBe(350000.5);
  expect(price.parse(0)).toBe(0);
  expect(price.safeParse(-1).success).toBe(false);
  expect(price.safeParse("invalid").success).toBe(false);
});

import { expect, it } from "vitest";
import { slotPricesSchema } from "./property-prices.schema";

const id = "88f50ab3-567a-4a37-9271-eaa92a221995";

it("reads optional, nonnegative amounts; blank is none", () => {
  expect(slotPricesSchema.parse({ slotId: id, price: "350000.50" })).toEqual({
    slotId: id,
    price: 350000.5,
    reservationFee: null,
  });
  expect(slotPricesSchema.safeParse({ slotId: id, price: -1 }).success).toBe(false);
  expect(slotPricesSchema.safeParse({ slotId: id, price: "invalid" }).success).toBe(false);
});

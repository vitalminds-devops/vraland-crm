import { expect, it } from "vitest";
import { parkingTypeSchema } from "./parking-type.schema";

const propertyId = "88f50ab3-567a-4a37-9271-eaa92a221995";

it("reads a parking type from form text, blank amounts as none", () => {
  expect(
    parkingTypeSchema.parse({
      propertyId,
      name: " Tandem ",
      w: "2.5",
      h: "10",
      price: "800000",
      reservationFee: "",
    }),
  ).toEqual({ propertyId, name: "Tandem", w: 2.5, h: 10, price: 800000, reservationFee: null });
});

it("refuses a nameless type, an odd size or a negative price", () => {
  const base = { propertyId, name: "Standard", w: 2.5, h: 5, price: null, reservationFee: null };
  expect(parkingTypeSchema.safeParse({ ...base, name: " " }).success).toBe(false);
  expect(parkingTypeSchema.safeParse({ ...base, w: 0.5 }).success).toBe(false);
  expect(parkingTypeSchema.safeParse({ ...base, h: 30 }).success).toBe(false);
  expect(parkingTypeSchema.safeParse({ ...base, price: -1 }).success).toBe(false);
});

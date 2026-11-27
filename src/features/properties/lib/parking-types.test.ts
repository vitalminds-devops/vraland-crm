import { expect, it } from "vitest";
import { slotTypeChange, type ParkingType } from "./parking-types";

const tandem: ParkingType = {
  id: "t1",
  name: "Tandem",
  w: 2.5,
  h: 10,
  price: "500000",
  reservationFee: "10000",
  monthlyAmortization: "4500",
};

it("joins a slot to its picked type, taking its amounts only while available", () => {
  expect(slotTypeChange({ status: "available", parkingTypeId: null }, "t1", [tandem])).toEqual({
    parkingTypeId: "t1",
    price: "500000",
    reservationFee: "10000",
    monthlyAmortization: "4500",
  });
  // A type saved before parking had a monthly amortization gives none.
  const older: ParkingType = { ...tandem, monthlyAmortization: undefined };
  expect(
    slotTypeChange({ status: "available", parkingTypeId: null }, "t1", [older])
      ?.monthlyAmortization,
  ).toBeNull();
  expect(slotTypeChange({ status: "sold", parkingTypeId: null }, "t1", [tandem])).toEqual({
    parkingTypeId: "t1",
  });
});

it("leaves a slot alone when its type didn't change, and clears it for None", () => {
  expect(slotTypeChange({ status: "available", parkingTypeId: "t1" }, "t1", [tandem])).toBeNull();
  expect(slotTypeChange({ status: "available", parkingTypeId: "t1" }, undefined, [tandem])).toEqual(
    {
      parkingTypeId: null,
    },
  );
  // A type removed since counts as none.
  expect(slotTypeChange({ status: "available", parkingTypeId: null }, "gone", [tandem])).toBeNull();
});

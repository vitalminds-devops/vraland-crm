import { expect, it } from "vitest";
import { quotedTerms } from "./quoted-terms";

it("splits the quoted price and reservation fee into units, parking and total", () => {
  expect(
    quotedTerms({
      amount: "12100500",
      parkingAmount: "100500",
      reservationFee: "70000",
      parkingReservationFee: "10000",
    }),
  ).toEqual({
    hasParking: true,
    rows: [
      { label: "Units", price: "12000000.00", reservationFee: "60000.00" },
      { label: "Parking", price: "100500.00", reservationFee: "10000.00" },
      { label: "Total", price: "12100500.00", reservationFee: "70000.00" },
    ],
  });
});

it("shows only units when there is no parking, and no fee when none was set", () => {
  expect(
    quotedTerms({
      amount: "3000000",
      parkingAmount: null,
      reservationFee: null,
      parkingReservationFee: null,
    }),
  ).toEqual({
    hasParking: false,
    rows: [{ label: "Units", price: "3000000.00", reservationFee: null }],
  });
});

import { expect, it } from "vitest";
import { monthlyAmortizationLines, quotedTerms, unitsReservationFee } from "./quoted-terms";

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

it("shows no units fee when only parking sets one", () => {
  const { rows } = quotedTerms({
    amount: "5500000",
    parkingAmount: "500000",
    reservationFee: "10000",
    parkingReservationFee: "10000",
  });
  expect(rows[0]).toMatchObject({ label: "Units", reservationFee: null });
  expect(rows[1]).toMatchObject({ label: "Parking", reservationFee: "10000.00" });
});

it("leaves the units' fee empty when parking takes all of it", () => {
  expect(unitsReservationFee("30000", "10000")).toBe("20000.00");
  expect(unitsReservationFee("10000", "10000")).toBeNull();
  expect(unitsReservationFee(null, "10000")).toBeNull();
  expect(unitsReservationFee("20000", null)).toBe("20000.00");
});

it("shows the monthly amortization split only when parking has one", () => {
  expect(monthlyAmortizationLines("26500.50", "1500")).toEqual([
    ["Unit monthly amortization", "25000.50"],
    ["Parking monthly amortization", "1500.00"],
  ]);
  expect(monthlyAmortizationLines("25000", null)).toEqual([["Monthly amortization", "25000"]]);
  expect(monthlyAmortizationLines(null, "0")).toEqual([["Monthly amortization", null]]);
});

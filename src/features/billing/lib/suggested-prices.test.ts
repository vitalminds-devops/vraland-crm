import { expect, it } from "vitest";
import { suggestedUnitPrices } from "./suggested-prices";

it("keeps each unit's own price while they add up to the agreed amount", () => {
  expect(
    suggestedUnitPrices(["2000000", "3000000"], { amount: "5500000", parkingAmount: "500000" }),
  ).toEqual(["2000000", "3000000"]);
});

it("splits the agreed amount when unit prices changed since the opportunity", () => {
  expect(
    suggestedUnitPrices(["2100000", "3000000"], { amount: "5500000", parkingAmount: "500000" }),
  ).toEqual(["2500000.00", "2500000.00"]);
  expect(suggestedUnitPrices([null], { amount: "100", parkingAmount: "0" })).toEqual(["100.00"]);
});

it("keeps an older single-unit deal's entered amount, else the unit's price", () => {
  expect(suggestedUnitPrices(["900"], { amount: "1000", parkingAmount: null })).toEqual(["1000"]);
  expect(suggestedUnitPrices(["900", "800"], { amount: "1000", parkingAmount: null })).toEqual([
    "900",
    "800",
  ]);
  expect(suggestedUnitPrices(["900"], { amount: null, parkingAmount: null })).toEqual(["900"]);
});

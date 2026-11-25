import { expect, it } from "vitest";
import { suggestedParkingPrices, suggestedUnitPrices } from "./suggested-prices";

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

it("keeps slot prices that match the quoted parking amount, else splits the quote", () => {
  expect(suggestedParkingPrices(["300000", "200000"], "500000")).toEqual(["300000", "200000"]);
  // A parking type's price rose after the quote: the bill still adds up to what was quoted.
  expect(suggestedParkingPrices(["350000", "200000"], "500000")).toEqual([
    "250000.00",
    "250000.00",
  ]);
  expect(suggestedParkingPrices(["1", "1", "1"], "100")).toEqual(["33.33", "33.33", "33.34"]);
  expect(suggestedParkingPrices(["350000"], null)).toEqual(["350000"]);
});

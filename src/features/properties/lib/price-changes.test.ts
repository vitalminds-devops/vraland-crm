import { expect, it } from "vitest";
import { changesMoney } from "./price-changes";

it("sees a price change only when an amount really changes", () => {
  expect(changesMoney({ price: "100", fee: null }, { price: "100.00", fee: null })).toBe(false);
  expect(changesMoney({ price: "100", fee: null }, { price: "120", fee: null })).toBe(true);
  expect(changesMoney({ price: "100", fee: null }, { price: "100", fee: "10" })).toBe(true);
  // A new type with no amounts changes nothing; with any amount it does.
  expect(changesMoney(null, { price: null, fee: "" })).toBe(false);
  expect(changesMoney(null, { price: "1", fee: null })).toBe(true);
});

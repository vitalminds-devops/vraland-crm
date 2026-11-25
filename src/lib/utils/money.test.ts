import { expect, it } from "vitest";
import { formatMoney, formatMoneyShort } from "./money";

it("formats pesos, dropping centavos on whole amounts", () => {
  expect(formatMoney(6200000)).toBe("₱6,200,000");
  expect(formatMoney("6200000.5")).toBe("₱6,200,000.50");
  expect(formatMoney(null)).toBeNull();
  expect(formatMoney("")).toBeNull();
  expect(formatMoney("abc")).toBeNull();
});

it("shortens prices for tags", () => {
  expect(formatMoneyShort(30_000_000)).toBe("₱30M");
  expect(formatMoneyShort("2500000")).toBe("₱2.5M");
  expect(formatMoneyShort(850_000)).toBe("₱850K");
  expect(formatMoneyShort(null)).toBeNull();
});

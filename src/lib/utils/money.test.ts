import { expect, it } from "vitest";
import { formatAmount, formatMoney, formatMoneyShort, toAmount, toCents } from "./money";

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

it("formats bill amounts with centavos", () => {
  expect(formatAmount(1234)).toBe("₱1,234.00");
  expect(formatAmount("1234.5")).toBe("₱1,234.50");
  expect(formatAmount(null)).toBeNull();
});

it("compares amounts in whole centavos", () => {
  expect(toCents("100.004")).toBe(toCents(100));
  expect(toCents(0.1 + 0.2)).toBe(30);
  expect(toCents("")).toBeNull();
  expect(toAmount(1234.5)).toBe("1234.50");
  expect(toAmount(null)).toBeNull();
});

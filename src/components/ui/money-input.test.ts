import { describe, expect, it } from "vitest";

import { formatMoneyInput } from "./money-input";

describe("formatMoneyInput", () => {
  it("groups thousands", () => {
    expect(formatMoneyInput("2300000")).toBe("2,300,000");
    expect(formatMoneyInput("2300000.00")).toBe("2,300,000.00");
  });

  it("keeps a typed decimal point and at most two decimals", () => {
    expect(formatMoneyInput("1500.")).toBe("1,500.");
    expect(formatMoneyInput("1500.756")).toBe("1,500.75");
    expect(formatMoneyInput(".5")).toBe("0.5");
  });

  it("drops letters, extra points and leading zeros", () => {
    expect(formatMoneyInput("₱1,2a3.4.5")).toBe("123.45");
    expect(formatMoneyInput("000250")).toBe("250");
    expect(formatMoneyInput("")).toBe("");
  });
});

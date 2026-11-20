import { describe, expect, it } from "vitest";

import { ageOn, financingPreferences, financingPreferenceLabels } from "./contact-options";
import { paymentMethodLabels, paymentMethods } from "@/features/billing/schemas/billing.schema";

it.each(paymentMethods)("keeps the saved %s method compatible with Billing", (method) => {
  expect(financingPreferences).toContain(method);
  expect(financingPreferenceLabels[method]).toBe(paymentMethodLabels[method]);
});

it("continues to accept existing financing preferences", () => {
  for (const method of ["bank_financing", "pag_ibig", "in_house_financing", "other"]) {
    expect(financingPreferences).toContain(method);
  }
});

it("uses the same unique financing options in contacts, opportunities and Billing", () => {
  expect(financingPreferences).toEqual(paymentMethods);
  expect(new Set(paymentMethods).size).toBe(paymentMethods.length);
  expect(paymentMethods).toEqual(
    expect.arrayContaining([
      "cash",
      "bank_financing",
      "pag_ibig",
      "in_house_financing",
      "other",
      "online",
    ]),
  );
});

describe("ageOn", () => {
  it("counts whole years", () => {
    expect(ageOn("1980-05-06", "2026-11-07")).toBe(46);
  });

  it("waits for the birthday", () => {
    expect(ageOn("1980-12-25", "2026-11-07")).toBe(45);
    expect(ageOn("1980-11-07", "2026-11-07")).toBe(46);
  });

  it("is null for a missing, malformed or future date", () => {
    expect(ageOn(null, "2026-11-07")).toBeNull();
    expect(ageOn("06/05/1980", "2026-11-07")).toBeNull();
    expect(ageOn("2030-01-01", "2026-11-07")).toBeNull();
  });
});

import { expect, it } from "vitest";
import { billApplicantSchema } from "./bill-applicant.schema";
import { billSchema } from "./billing.schema";
import { applicantAge, applicantSectionApplies } from "../lib/bill-applicant";

it("validates applicant and representative dates and emails without requiring inapplicable fields", () => {
  expect(billApplicantSchema.parse({ firstName: " Ana " }).firstName).toBe("Ana");
  for (const value of [
    { birthDate: "2025-02-30" },
    { emailAddress: "invalid" },
    { representativeEmailAddress: "invalid" },
    { representativePrcExpirationDate: "tomorrow" },
    { completeAddress: "x".repeat(1001) },
  ]) {
    expect(billApplicantSchema.safeParse(value).success).toBe(false);
  }
  expect(billApplicantSchema.parse({}).applicantType).toBe("individual");
});

it("keeps applicant details omitted for older bill callers", () => {
  const value = billSchema.parse({
    dealId: "88f50ab3-567a-4a37-9271-eaa92a221995",
    items: [{ unitLabel: "1A", unitPrice: 1000, miscellaneousFee: 0 }],
  });
  expect(value.applicantDetails).toBeUndefined();
});

it("calculates age at billing, including the day before a birthday", () => {
  expect(applicantAge("1980-05-06", "2026-05-05")).toBe("45");
  expect(applicantAge("1980-05-06", "2026-05-06")).toBe("46");
  expect(applicantAge("", "2026-05-06")).toBe("");
  expect(applicantAge("2027-01-01", "2026-05-06")).toBe("");
});

it("shows company and representative details only for the applicable applicant types", () => {
  expect([0, 1, 2].map((index) => applicantSectionApplies(index, "individual"))).toEqual([
    true,
    false,
    false,
  ]);
  expect([0, 1, 2].map((index) => applicantSectionApplies(index, "sole_proprietorship"))).toEqual([
    true,
    true,
    false,
  ]);
  expect([0, 1, 2].map((index) => applicantSectionApplies(index, "corporation"))).toEqual([
    true,
    true,
    true,
  ]);
});

import { expect, it } from "vitest";
import { billApplicantSchema } from "./bill-applicant.schema";
import { billSchema } from "./billing.schema";
import { applicantAge } from "../lib/bill-applicant";

it("validates applicant dates and emails without requiring optional fields", () => {
  expect(billApplicantSchema.parse({ firstName: " Ana " }).firstName).toBe("Ana");
  for (const value of [
    { birthDate: "2025-02-30" },
    { emailAddress: "invalid" },
    { prcExpirationDate: "tomorrow" },
    { completeAddress: "x".repeat(1001) },
  ]) {
    expect(billApplicantSchema.safeParse(value).success).toBe(false);
  }
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

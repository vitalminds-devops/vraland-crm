import { z } from "zod";
import { contactSchema } from "./contact.schema";

export const opportunityAddressSchema = z
  .object({
    currentProvince: contactSchema.shape.currentProvince,
    currentCity: contactSchema.shape.currentCity,
    currentBarangay: contactSchema.shape.currentBarangay,
    currentAddressLine1: contactSchema.shape.currentAddressLine1,
    currentPostalCode: contactSchema.shape.currentPostalCode,
    currentCountry: contactSchema.shape.currentCountry,
  })
  .superRefine((value, ctx) => {
    for (const [field, label] of [
      ["currentProvince", "province"],
      ["currentCity", "city"],
      ["currentBarangay", "barangay"],
    ] as const) {
      if (!value[field])
        ctx.addIssue({ code: "custom", path: [field], message: `Select a ${label}.` });
    }
  });

export const opportunityInterestSchema = z
  .object({
    budgetMin: contactSchema.shape.budgetMin,
    budgetMax: contactSchema.shape.budgetMax,
    purchaseType: contactSchema.shape.purchaseType,
    employmentType: contactSchema.shape.employmentType,
    annualIncome: contactSchema.shape.annualIncome,
  })
  .superRefine((value, ctx) => {
    if (value.budgetMin === null && value.budgetMax === null)
      ctx.addIssue({ code: "custom", path: ["budgetMax"], message: "Select a budget range." });
    if (value.budgetMin !== null && value.budgetMax !== null && value.budgetMin > value.budgetMax)
      ctx.addIssue({
        code: "custom",
        path: ["budgetMax"],
        message: "Maximum budget must be at least the minimum.",
      });
  });

export type OpportunityAddress = z.output<typeof opportunityAddressSchema>;

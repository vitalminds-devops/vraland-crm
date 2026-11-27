import { z } from "zod";
import { financingPreferences } from "@/features/contacts/lib/contact-options";
import {
  opportunityAddressSchema,
  opportunityInterestSchema,
} from "@/features/contacts/schemas/opportunity-contact.schema";
import { opportunitySelectionSchema } from "../lib/opportunity-pricing";

/** Move to Opportunity: the contact's address and interest, the pick, financing and TIN. */
export const opportunityDetailsSchema = z
  .object({
    ...opportunityAddressSchema.shape,
    ...opportunityInterestSchema.shape,
    dealId: z.uuid({
      error: "Couldn't identify this lead. Refresh the pipeline and try again.",
    }),
    stageId: z.uuid({
      error: "Couldn't identify the Opportunity stage. Refresh the pipeline and try again.",
    }),
    tinNumber: z
      .string()
      .trim()
      .min(1, "Enter the contact's TIN.")
      .max(50, "TIN number must be 50 characters or fewer."),
    prcLicenseNumber: z
      .string()
      .trim()
      .max(50, "PRC license number must be 50 characters or fewer."),
    ...opportunitySelectionSchema.shape,
    financingPreference: z.enum(financingPreferences, { error: "Select how it will be paid." }),
    financingPreferenceOther: z
      .string()
      .trim()
      .max(180, "Other financing must be 180 characters or fewer."),
    bankName: z.string().trim().max(180, "Bank name must be 180 characters or fewer."),
  })
  .superRefine((v, ctx) => {
    for (const schema of [opportunityAddressSchema, opportunityInterestSchema]) {
      const checked = schema.safeParse(v);
      if (!checked.success)
        for (const issue of checked.error.issues)
          ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
    if (v.financingPreference === "bank_financing" && !v.bankName)
      ctx.addIssue({
        code: "custom",
        path: ["bankName"],
        message: "Enter the bank name for bank financing.",
      });
    if (v.financingPreference === "other" && !v.financingPreferenceOther)
      ctx.addIssue({
        code: "custom",
        path: ["financingPreferenceOther"],
        message: "Describe how the contact will pay under Other financing.",
      });
  });

/** Changing an open opportunity's units, tower or development. */
export const opportunityChangeSchema = opportunitySelectionSchema.extend({ dealId: z.uuid() });

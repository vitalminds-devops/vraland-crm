import { z } from "zod";
import {
  channelRequirementMessages,
  channelValueFields,
  civilStatusOptions,
  commercialPartyRoles,
  employmentTypes,
  financingPreferences,
  genderOptions,
  lifecycleOptions,
  preferredMethodOptions,
  purchaseTypes,
  type PreferredMethod,
} from "../lib/contact-options";
const optionalText = (maximum = 255) =>
  z
    .union([z.string().trim().max(maximum), z.null()])
    .optional()
    .transform((value) => value || null);
const nameText = (maximum = 120) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value.toUpperCase());
const optionalName = (maximum = 180) =>
  z
    .union([z.string().trim().max(maximum), z.null()])
    .optional()
    .transform((value) => (value ? value.toUpperCase() : null));
const requiredUuid = (message: string) =>
  z
    .union([z.uuid(), z.literal(""), z.null()])
    .optional()
    .refine((value) => Boolean(value), {
      message,
    })
    .transform((value) => value as string);
const optionalChoice = <T extends readonly [string, ...string[]]>(options: T) =>
  z
    .union([z.enum(options), z.literal(""), z.null()])
    .optional()
    .transform((value) => value || null);
const optionalMoney = z
  .union([z.literal(""), z.null(), z.coerce.number().nonnegative()])
  .optional()
  .transform((value) => (value === "" || value === undefined ? null : value));
export const contactSchema = z
  .object({
    firstName: nameText(120),
    middleName: optionalName(120),
    lastName: nameText(120),
    companyName: optionalName(180),
    birthDate: z
      .union([z.iso.date({ error: "Enter a valid date of birth." }), z.literal(""), z.null()])
      .optional()
      .refine((value) => !value || value <= new Date().toISOString().slice(0, 10), {
        message: "Date of birth cannot be in the future.",
      })
      .transform((value) => value || null),
    gender: optionalChoice(genderOptions),
    civilStatus: optionalChoice(civilStatusOptions),
    citizenship: optionalText(80),
    landline: optionalText(50),
    prcLicenseNumber: optionalText(50),
    currentAddressLine1: optionalText(255),
    currentBarangay: optionalText(120),
    currentCity: optionalText(120),
    currentProvince: optionalText(120),
    currentPostalCode: optionalText(20),
    currentCountry: optionalText(100),
    email: z
      .union([z.email(), z.literal(""), z.null()])
      .optional()
      .transform((v) => v || null),
    mobilePhone1: optionalText(50),
    mobilePhone2: optionalText(50),
    mobilePhone3: optionalText(50),
    whatsappNumber: optionalText(50),
    viberNumber: optionalText(50),
    instagramHandle: optionalText(120),
    facebookHandle: optionalText(120),
    preferredContactMethods: z
      .array(z.enum(preferredMethodOptions))
      .max(preferredMethodOptions.length)
      .default([]),
    lifecycleStage: z
      .union([z.enum(lifecycleOptions), z.literal(""), z.null()])
      .optional()
      .transform((v) => v || null),
    employmentType: z
      .union([z.enum(employmentTypes), z.literal(""), z.null()])
      .optional()
      .transform((v) => v || null),
    purchaseType: z
      .union([z.enum(purchaseTypes), z.literal(""), z.null()])
      .optional()
      .transform((v) => v || null),
    commercialPartyRole: z
      .union([z.enum(commercialPartyRoles), z.literal(""), z.null()])
      .optional()
      .transform((v) => v || null),
    businessOwnerName: optionalName(180),
    authorizedRepresentativeName: optionalName(180),
    annualIncome: optionalMoney,
    financingPreference: z
      .union([z.enum(financingPreferences), z.literal(""), z.null()])
      .optional()
      .transform((v) => v || null),
    financingPreferenceOther: optionalText(180),
    bankName: optionalText(180),
    assignedAgentId: requiredUuid("Select an agent to assign this contact."),
    budgetMin: optionalMoney,
    budgetMax: optionalMoney,
    leadSourceId: z
      .union([z.uuid(), z.literal(""), z.null()])
      .optional()
      .transform((value) => value || null),
    // Chosen when the lead becomes an opportunity.
    preferredDevelopmentId: z
      .union([z.uuid(), z.literal(""), z.null()])
      .optional()
      .transform((value) => value || null),
    preferredUnitIds: z
      .array(z.uuid())
      .max(50)
      .optional()
      .transform((units) => [...new Set(units ?? [])]),
    notes: optionalText(5000),
    marketingConsent: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    // Ensure province is selected
    if (!v.currentProvince) {
      ctx.addIssue({
        code: "custom",
        path: ["currentProvince"],
        message: "Select a province.",
      });
    }
    // Ensure city is selected when province is selected
    if (v.currentProvince && !v.currentCity) {
      ctx.addIssue({
        code: "custom",
        path: ["currentCity"],
        message: "Select a city.",
      });
    }
    // Ensure barangay is selected when city is selected
    if (v.currentCity && !v.currentBarangay) {
      ctx.addIssue({
        code: "custom",
        path: ["currentBarangay"],
        message: "Select a barangay.",
      });
    }
    // Ensure budget range is selected
    if (v.budgetMin === null && v.budgetMax === null) {
      ctx.addIssue({
        code: "custom",
        path: ["budgetMax"],
        message: "Select a budget range.",
      });
    }
    if (v.purchaseType === "commercial") {
      if (!v.commercialPartyRole)
        ctx.addIssue({
          code: "custom",
          path: ["commercialPartyRole"],
          message: "Select who is transacting for the business.",
        });
      if (["business_owner", "both"].includes(v.commercialPartyRole ?? "") && !v.businessOwnerName)
        ctx.addIssue({
          code: "custom",
          path: ["businessOwnerName"],
          message: "Enter the business owner's name.",
        });
      if (
        ["authorized_representative", "both"].includes(v.commercialPartyRole ?? "") &&
        !v.authorizedRepresentativeName
      )
        ctx.addIssue({
          code: "custom",
          path: ["authorizedRepresentativeName"],
          message: "Enter the authorized representative's name.",
        });
    }
    if (v.financingPreference === "other" && !v.financingPreferenceOther)
      ctx.addIssue({
        code: "custom",
        path: ["financingPreferenceOther"],
        message: "Specify the financing preference.",
      });
    if (v.financingPreference === "bank_financing" && !v.bankName)
      ctx.addIssue({
        code: "custom",
        path: ["bankName"],
        message: "Select or enter the financing bank.",
      });
    if (v.budgetMin !== null && v.budgetMax !== null && v.budgetMin > v.budgetMax)
      ctx.addIssue({
        code: "custom",
        path: ["budgetMax"],
        message: "Maximum budget must be at least the minimum.",
      });
    if (new Set(v.preferredContactMethods).size !== v.preferredContactMethods.length)
      ctx.addIssue({
        code: "custom",
        path: ["preferredContactMethods"],
        message: "Select each preferred method only once.",
      });
    const channelValues: Record<PreferredMethod, string | null> = {
      phone: v.mobilePhone1,
      landline: v.landline,
      email: v.email,
      whatsapp: v.whatsappNumber,
      viber: v.viberNumber,
      instagram: v.instagramHandle,
      facebook: v.facebookHandle,
    };
    for (const method of v.preferredContactMethods) {
      if (channelValues[method]) continue;
      ctx.addIssue({
        code: "custom",
        path: [channelValueFields[method]],
        message: channelRequirementMessages[method],
      });
    }
  });
export type ContactInput = z.output<typeof contactSchema>;
export const noteSchema = z.object({
  contactId: z.uuid(),
  note: z.string().trim().min(1).max(5000),
  isPinned: z.boolean().default(false),
});

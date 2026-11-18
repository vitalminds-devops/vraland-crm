import { z } from "zod";

const text = z.string().trim().max(255).default("");
const date = z.union([z.iso.date(), z.literal("")]).default("");
const email = z.union([z.email(), z.literal("")]).default("");

export const billApplicantSchema = z.object({
  lastName: text,
  firstName: text,
  middleName: text,
  completeAddress: z.string().trim().max(1000).default(""),
  prcLicenseNumber: text,
  prcExpirationDate: date,
  gender: text,
  landline: text,
  citizenship: text,
  birthDate: date,
  civilStatus: text,
  mobileNumber: text,
  emailAddress: email,
  tinNumber: text,
});

export type BillApplicant = z.output<typeof billApplicantSchema>;

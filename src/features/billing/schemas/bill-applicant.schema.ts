import { z } from "zod";

const text = z.string().trim().max(255).default("");
const date = z.union([z.iso.date(), z.literal("")]).default("");
const email = z.union([z.email(), z.literal("")]).default("");

export const billApplicantSchema = z.object({
  applicantType: z
    .enum(["individual", "sole_proprietorship", "partnership", "corporation", "institution"])
    .default("individual"),
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
  companyName: text,
  businessAddress: z.string().trim().max(1000).default(""),
  officeNumber: text,
  companyTinNumber: text,
  representativeLastName: text,
  representativeFirstName: text,
  representativeMiddleName: text,
  representativePrcLicenseNumber: text,
  representativePrcExpirationDate: date,
  representativeEmailAddress: email,
  representativeMobileNumber: text,
  representativeLandline: text,
});

export type BillApplicant = z.output<typeof billApplicantSchema>;

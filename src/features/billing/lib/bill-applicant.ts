import type { BillApplicant } from "../schemas/bill-applicant.schema";

type ApplicantField = {
  key: keyof BillApplicant;
  label: string;
  type?: "date" | "email" | "tel";
  wide?: boolean;
  /** Show digits in groups of four. */
  grouped?: boolean;
};
export const applicantFields: ApplicantField[] = [
  { key: "lastName", label: "Last name" },
  { key: "firstName", label: "First name" },
  { key: "middleName", label: "Middle name" },
  { key: "completeAddress", label: "Complete address", wide: true },
  { key: "prcLicenseNumber", label: "PRC license number (if applicable)" },
  { key: "prcExpirationDate", label: "PRC expiration date", type: "date" },
  { key: "gender", label: "Gender" },
  { key: "landline", label: "Landline number", type: "tel" },
  { key: "citizenship", label: "Citizenship" },
  { key: "birthDate", label: "Date of birth", type: "date" },
  { key: "civilStatus", label: "Civil status" },
  { key: "mobileNumber", label: "Mobile number", type: "tel" },
  { key: "emailAddress", label: "Email address", type: "email" },
  { key: "tinNumber", label: "TIN", grouped: true },
];

export function applicantAge(birthDate: string, asOf: string) {
  if (!birthDate || birthDate > asOf) return "";
  const age =
    Number(asOf.slice(0, 4)) -
    Number(birthDate.slice(0, 4)) -
    (asOf.slice(5) < birthDate.slice(5) ? 1 : 0);
  return String(age);
}

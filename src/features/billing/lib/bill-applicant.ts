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
  { key: "lastName", label: "Last Name" },
  { key: "firstName", label: "First Name" },
  { key: "middleName", label: "Middle Name" },
  { key: "completeAddress", label: "Complete Address", wide: true },
  { key: "prcLicenseNumber", label: "PRC License Number (If Applicable)" },
  { key: "prcExpirationDate", label: "PRC Expiration Date", type: "date" },
  { key: "gender", label: "Gender" },
  { key: "landline", label: "Landline Number", type: "tel" },
  { key: "citizenship", label: "Citizenship" },
  { key: "birthDate", label: "Date of Birth", type: "date" },
  { key: "civilStatus", label: "Civil Status" },
  { key: "mobileNumber", label: "Mobile Number", type: "tel" },
  { key: "emailAddress", label: "Email Address", type: "email" },
  { key: "tinNumber", label: "TIN Number", grouped: true },
];

export function applicantAge(birthDate: string, asOf: string) {
  if (!birthDate || birthDate > asOf) return "";
  const age =
    Number(asOf.slice(0, 4)) -
    Number(birthDate.slice(0, 4)) -
    (asOf.slice(5) < birthDate.slice(5) ? 1 : 0);
  return String(age);
}

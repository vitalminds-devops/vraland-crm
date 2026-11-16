import type { BillApplicant } from "../schemas/bill-applicant.schema";

export const applicantTypeLabels = {
  individual: "Individual",
  sole_proprietorship: "Sole Proprietorship",
  partnership: "Partnership",
  corporation: "Corporation",
  institution: "Institution",
} as const;

type ApplicantField = {
  key: Exclude<keyof BillApplicant, "applicantType">;
  label: string;
  type?: "date" | "email" | "tel";
  wide?: boolean;
  /** Show digits in groups of four. */
  grouped?: boolean;
};
export const applicantSections: { title: string; fields: ApplicantField[] }[] = [
  {
    title: "Applicant Information",
    fields: [
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
    ],
  },
  {
    title: "Business / Organization Details",
    fields: [
      { key: "companyName", label: "Business / Company Name", wide: true },
      { key: "businessAddress", label: "Business Address", wide: true },
      { key: "officeNumber", label: "Office Number", type: "tel" },
      { key: "companyTinNumber", label: "Company TIN Number", grouped: true },
    ],
  },
  {
    title: "Authorized Representative",
    fields: [
      { key: "representativeLastName", label: "Last Name" },
      { key: "representativeFirstName", label: "First Name" },
      { key: "representativeMiddleName", label: "Middle Name" },
      { key: "representativePrcLicenseNumber", label: "PRC License Number (If Applicable)" },
      { key: "representativePrcExpirationDate", label: "PRC Expiration Date", type: "date" },
      { key: "representativeEmailAddress", label: "Email Address", type: "email" },
      { key: "representativeMobileNumber", label: "Mobile Number", type: "tel" },
      { key: "representativeLandline", label: "Landline Number", type: "tel" },
    ],
  },
];

export function applicantSectionApplies(index: number, type: BillApplicant["applicantType"]) {
  return (
    index === 0 ||
    (index === 1 ? type !== "individual" : type !== "individual" && type !== "sole_proprietorship")
  );
}

export function applicantAge(birthDate: string, asOf: string) {
  if (!birthDate || birthDate > asOf) return "";
  const age =
    Number(asOf.slice(0, 4)) -
    Number(birthDate.slice(0, 4)) -
    (asOf.slice(5) < birthDate.slice(5) ? 1 : 0);
  return String(age);
}

import { brokerAccessRoleSlugs } from "@/lib/permissions/catalog";
import { propertyTypes } from "@/features/properties/lib/constants";

export const lifecycleOptions = ["active_client", "inactive"] as const;
export const lifecycleLabels: Record<(typeof lifecycleOptions)[number], string> = {
  active_client: "Active",
  inactive: "Inactive",
};
export const employmentTypes = [
  "Private Company Employee",
  "Government Employee",
  "OFW (Overseas Filipino Worker)",
  "Self-Employed",
  "Business Owner",
  "Freelancer",
  "Unemployed",
  "Retired",
  "Student",
  "Others",
] as const;
export const purchaseTypes = [...propertyTypes, "residential"] as const;
export const purchaseTypeLabels: Record<(typeof purchaseTypes)[number], string> = {
  residential: "Residential",
  commercial: "Commercial",
  lot: "Lot",
  house_and_lot: "House and lot",
  condominium: "Condominium",
  townhouse: "Townhouse",
  office: "Office",
  warehouse: "Warehouse",
  farm: "Farm",
  other: "Other",
};
export const financingPreferences = [
  "cash",
  "bank_financing",
  "pag_ibig",
  "in_house_financing",
  "other",
] as const;
export const financingPreferenceLabels: Record<(typeof financingPreferences)[number], string> = {
  cash: "Cash",
  bank_financing: "Bank financing",
  pag_ibig: "Pag-IBIG financing",
  in_house_financing: "In-house financing",
  other: "Other",
};
export const bankOptions = [
  "Asia United Bank (AUB)",
  "Bank of Commerce",
  "Bank of the Philippine Islands (BPI)",
  "BDO Unibank",
  "Chinabank",
  "China Banking Corporation",
  "Development Bank of the Philippines (DBP)",
  "EastWest Bank",
  "Land Bank of the Philippines",
  "Maybank Philippines",
  "Metrobank",
  "Philippine National Bank (PNB)",
  "Philippine Savings Bank (PSBank)",
  "RCBC",
  "Robinsons Bank",
  "Security Bank",
  "Sterling Bank of Asia",
  "UnionBank of the Philippines",
  "United Coconut Planters Bank (UCPB)",
] as const;
export const mobilePhoneFields = ["mobilePhone1", "mobilePhone2", "mobilePhone3"] as const;
export const agentRoleSlugs = ["agent", ...brokerAccessRoleSlugs, "master-broker"] as const;
export const agentRoleNames = ["agent", "agent / broker", "master broker"] as const;

export const preferredMethodOptions = [
  "phone",
  "landline",
  "email",
  "whatsapp",
  "viber",
  "instagram",
  "facebook",
] as const;
export type PreferredMethod = (typeof preferredMethodOptions)[number];
export const preferredMethodLabels: Record<PreferredMethod, string> = {
  phone: "Phone",
  landline: "Landline",
  email: "Email",
  whatsapp: "WhatsApp",
  viber: "Viber",
  instagram: "Instagram",
  facebook: "Facebook",
};
export const channelLabel = (method: string): string =>
  preferredMethodLabels[method as PreferredMethod] ?? method;

export const channelValueFields = {
  phone: "mobilePhone1",
  landline: "landline",
  email: "email",
  whatsapp: "whatsappNumber",
  viber: "viberNumber",
  instagram: "instagramHandle",
  facebook: "facebookHandle",
} as const;

/** The input a channel's value is captured with, plus its placeholder copy. */
export const channelInputMeta: Record<
  PreferredMethod,
  { input: "tel" | "email" | "handle"; placeholder: string }
> = {
  phone: { input: "tel", placeholder: "09XX XXX XXXX" },
  landline: { input: "tel", placeholder: "(02) XXXX XXXX" },
  email: { input: "email", placeholder: "email@example.com" },
  whatsapp: { input: "tel", placeholder: "09XX XXX XXXX" },
  viber: { input: "tel", placeholder: "09XX XXX XXXX" },
  instagram: { input: "handle", placeholder: "@username" },
  facebook: { input: "handle", placeholder: "@username or profile link" },
};

export const channelRequirementMessages: Record<PreferredMethod, string> = {
  phone: "Enter a mobile number, or untick the Phone channel.",
  landline: "Enter a landline number, or untick the Landline channel.",
  email: "Enter an email address, or untick the Email channel.",
  whatsapp: "Enter a WhatsApp number, or untick the WhatsApp channel.",
  viber: "Enter a Viber number, or untick the Viber channel.",
  instagram: "Enter an Instagram handle, or untick the Instagram channel.",
  facebook: "Enter a Facebook handle, or untick the Facebook channel.",
};
export const budgetRanges = [
  { value: "below-2.3m", label: "Below ₱2.3M", min: null, max: 2_299_999 },
  {
    value: "2.3m-2.5m",
    label: "₱2.3M – Below ₱2.5M",
    min: 2_300_000,
    max: 2_499_999,
  },
  {
    value: "2.5m-4m",
    label: "₱2.5M – Below ₱4M",
    min: 2_500_000,
    max: 3_999_999,
  },
  { value: "4m-6m", label: "₱4M – ₱6M", min: 4_000_000, max: 6_000_000 },
  { value: "above-6m", label: "Above ₱6M", min: 6_000_001, max: null },
] as const;
export type BudgetRange = (typeof budgetRanges)[number];
export type BudgetRangeValue = BudgetRange["value"];

const amountOrNull = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
};

export const budgetRangeFor = (
  min: string | number | null | undefined,
  max: string | number | null | undefined,
): BudgetRangeValue | null => {
  const from = amountOrNull(min);
  const to = amountOrNull(max);
  const band = budgetRanges.find((range) => range.min === from && range.max === to);
  return band?.value ?? null;
};

/** The band's label for a stored pair, or null when the pair is not a band. */
export const budgetRangeLabelFor = (
  min: string | number | null | undefined,
  max: string | number | null | undefined,
): string | null => {
  const value = budgetRangeFor(min, max);
  return budgetRanges.find((range) => range.value === value)?.label ?? null;
};

export const budgetForRange = (
  value: string,
): { budgetMin: number | null; budgetMax: number | null } => {
  const band = budgetRanges.find((range) => range.value === value);
  return { budgetMin: band?.min ?? null, budgetMax: band?.max ?? null };
};

export const requirementStatuses = ["submitted", "pending", "not_submitted"] as const;
export const defaultRequirementStatus = "not_submitted" as const;
export const requiredDocumentTypes = [
  { documentType: "valid_id", label: "Valid government-issued ID" },
  { documentType: "proof_of_income", label: "Proof of income" },
  { documentType: "tax_return", label: "Income tax return (ITR)" },
  { documentType: "proof_of_billing", label: "Proof of billing" },
  {
    documentType: "employment_certificate",
    label: "Certificate of employment",
  },
  { documentType: "bank_statement", label: "Bank statement" },
  { documentType: "reservation_agreement", label: "Reservation agreement" },
  { documentType: "contract_to_sell", label: "Contract to sell" },
  {
    documentType: "client_appointment_form",
    label: "Client appointment form",
  },
] as const;
/** Requirement types an extra upload can be filed under; the ID and appointment form have their own fields. */
export const extraDocumentTypes = requiredDocumentTypes.filter(
  (item) => item.documentType !== "valid_id" && item.documentType !== "client_appointment_form",
);
export const requiredDocumentLabel = (documentType: string) =>
  requiredDocumentTypes.find((item) => item.documentType === documentType)?.label ?? documentType;
/** Every type a document can be filed under: the requirement types, then "Other". */
export const documentTypeOptions = [
  ...requiredDocumentTypes,
  { documentType: "general", label: "Other" },
] as const;
export const documentTypeLabel = (documentType: string) =>
  requiredDocumentTypes.find((item) => item.documentType === documentType)?.label ?? "Other";

export type ContactApprovalStatus = "pending" | "approved" | "rejected";
// Every new contact is approved immediately, whoever creates it.
export const defaultAdminApprovalStatus = "approved" as const;

export const genderOptions = ["Female", "Male"] as const;
/** Filipino first; the rest are the nationalities clients most often hold. */
export const citizenshipOptions = [
  "Filipino",
  "American",
  "Australian",
  "British",
  "Canadian",
  "Chinese",
  "Dual citizen (Filipino)",
  "Indian",
  "Indonesian",
  "Japanese",
  "Korean",
  "Malaysian",
  "Singaporean",
  "Taiwanese",
  "Thai",
  "Vietnamese",
  "Other",
] as const;

export const civilStatusOptions = [
  "Single",
  "Married",
  "Widowed",
  "Separated",
  "Annulled",
] as const;

/** Whole years between a `yyyy-MM-dd` birth date and `today` (same format), or null. */
export function ageOn(birthDate: string | null | undefined, today: string): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
  return age >= 0 ? age : null;
}

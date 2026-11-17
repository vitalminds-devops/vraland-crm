import { z } from "zod";
import type { ContactInput } from "../schemas/contact.schema";
import { preferredMethodOptions, type PreferredMethod } from "./contact-options";

const approvalStatusOptions = ["pending", "approved", "rejected"] as const;

// Normalize phone number by removing spaces
function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null;
  return phone.replace(/\s+/g, "");
}

// Normalize employment type to match expected values
function normalizeEmploymentType(type: string | undefined): string | null {
  if (!type) return null;
  const normalized = type.toLowerCase().trim();
  const typeMap: Record<string, string> = {
    freelancer: "Freelancer",
    "self-employed": "Self-Employed",
    "business owner": "Business Owner",
    employed: "Private Company Employee",
    ofw: "OFW (Overseas Filipino Worker)",
    retired: "Retired",
    student: "Student",
    unemployed: "Unemployed",
    others: "Others",
  };
  return typeMap[normalized] || null;
}

// Normalize preferred contact methods (remove braces, split by comma or semicolon)
function normalizePreferredMethods(methods: string | undefined): PreferredMethod[] {
  if (!methods) return [];
  const cleaned = methods.replace(/[{}]/g, "").trim();
  if (!cleaned) return [];
  return cleaned
    .split(/[,;]/)
    .map((m) => m.trim().toLowerCase())
    .filter((m): m is PreferredMethod => preferredMethodOptions.includes(m as PreferredMethod));
}

const csvRowSchema = z.object({
  contact_code: z.string().optional(),
  first_name: z.string().min(1, "First name is required"),
  middle_name: z.string().optional(),
  last_name: z.string().min(1, "Last name is required"),
  company_name: z.string().optional(),
  email: z.string().email("Invalid email").optional().nullable(),
  mobile_phone_1: z.string().optional(),
  mobile_phone_2: z.string().optional(),
  mobile_phone_3: z.string().optional(),
  mobile_phone: z.string().optional(),
  whatsapp_number: z.string().optional(),
  viber_number: z.string().optional(),
  instagram_handle: z.string().optional(),
  facebook_handle: z.string().optional(),
  preferred_contact_methods: z.string().optional(),
  preferred_contact_method: z.string().optional(),
  employment_type: z.string().optional(),
  lifecycle_stage: z.string().optional(),
  preferred_development_id: z.string().uuid().optional(),
  preferred_unit_id: z.string().uuid().optional(),
  assigned_agent_id: z.string().uuid().optional(),
  marketing_consent: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  notes: z.string().optional(),
  // Address fields
  current_address_line_1: z.string().optional(),
  current_barangay: z.string().optional(),
  current_city: z.string().optional(),
  current_province: z.string().optional(),
  current_postal_code: z.string().optional(),
  current_country: z.string().optional(),
  // Purchase/Property fields
  purchase_type: z.string().optional(),
  financing_preference: z.string().optional(),
  financing_preference_other: z.string().optional(),
  // Additional fields from CSV
  annual_income: z.coerce.number().optional(),
  bank_name: z.string().optional(),
  budget_min: z.coerce.number().optional(),
  budget_max: z.coerce.number().optional(),
  // Approval status
  approval_status: z.enum(approvalStatusOptions).optional(),
});

export function parseContactCsvRow(row: Record<string, string>) {
  const result = csvRowSchema.safeParse(
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, unguardCell(value)])),
  );

  if (!result.success) {
    return result;
  }

  const data = result.data;

  // Handle legacy mobile_phone field and normalize
  const mobilePhone1 = normalizePhone(data.mobile_phone_1 || data.mobile_phone || undefined);

  // Normalize preferred contact methods
  let preferredContactMethods: string[] = [];
  if (data.preferred_contact_methods) {
    preferredContactMethods = normalizePreferredMethods(data.preferred_contact_methods);
  } else if (data.preferred_contact_method) {
    preferredContactMethods = normalizePreferredMethods(data.preferred_contact_method);
  }

  // Normalize employment type
  const employmentType = normalizeEmploymentType(data.employment_type);

  // Lifecycle is not chosen any more: every contact is Active.
  const lifecycleStage = "active_client" as const;

  // Validate approval status
  let approvalStatus: "pending" | "approved" | "rejected" | null = null;
  if (data.approval_status) {
    approvalStatus = data.approval_status;
  } else if (data.approval_status === "") {
    approvalStatus = null;
  }

  return {
    success: true as const,
    data: {
      code: data.contact_code || null,
      firstName: data.first_name,
      middleName: data.middle_name || null,
      lastName: data.last_name,
      email: data.email || null,
      mobilePhone1,
      mobilePhone2: normalizePhone(data.mobile_phone_2),
      mobilePhone3: normalizePhone(data.mobile_phone_3),
      whatsappNumber: normalizePhone(data.whatsapp_number),
      viberNumber: normalizePhone(data.viber_number),
      instagramHandle: data.instagram_handle?.trim() || null,
      facebookHandle: data.facebook_handle?.trim() || null,
      preferredContactMethods: preferredContactMethods as PreferredMethod[],
      employmentType: employmentType as
        | "Private Company Employee"
        | "Government Employee"
        | "OFW (Overseas Filipino Worker)"
        | "Self-Employed"
        | "Business Owner"
        | "Freelancer"
        | "Unemployed"
        | "Retired"
        | "Student"
        | "Others"
        | null,
      lifecycleStage,
      assignedAgentId: data.assigned_agent_id || "",
      marketingConsent: data.marketing_consent || false,
      notes: data.notes || null,
      // Address fields
      currentAddressLine1: data.current_address_line_1 || null,
      currentBarangay: data.current_barangay || null,
      currentCity: data.current_city || null,
      currentProvince: data.current_province || null,
      currentPostalCode: data.current_postal_code || null,
      currentCountry: data.current_country || null,
      // Purchase/Property fields
      purchaseType: (data.purchase_type || null) as ContactInput["purchaseType"],
      financingPreference: (data.financing_preference || null) as
        "cash" | "bank_financing" | "pag_ibig" | "in_house_financing" | "other" | null,
      financingPreferenceOther: data.financing_preference_other || null,
      // Additional fields (stored in notes or custom fields if needed)
      companyName: data.company_name || null,
      birthDate: null,
      gender: null,
      civilStatus: null,
      citizenship: null,
      landline: null,
      prcLicenseNumber: null,
      annualIncome: data.annual_income || null,
      bankName: data.bank_name || null,
      budgetMin: data.budget_min || null,
      budgetMax: data.budget_max || null,
      // Required fields with defaults for CSV import
      preferredDevelopmentId: data.preferred_development_id || "",
      preferredUnitIds: data.preferred_unit_id ? [data.preferred_unit_id] : [],
      // Approval status
      approvalStatus,
    },
    approvalStatus,
  };
}

export function serializeContactsCsv(
  contacts: Array<{
    code?: string;
    firstName?: string;
    middleName?: string | null;
    lastName?: string;
    companyName?: string | null;
    email?: string | null;
    mobilePhone1?: string | null;
    mobilePhone2?: string | null;
    mobilePhone3?: string | null;
    whatsappNumber?: string | null;
    viberNumber?: string | null;
    instagramHandle?: string | null;
    facebookHandle?: string | null;
    preferredContactMethods?: string[];
    employmentType?: string | null;
    lifecycleStage?: string | null;
    assignedAgentId?: string | null;
    brokerUserId?: string | null;
    brokerFirstName?: string | null;
    brokerLastName?: string | null;
    marketingConsent?: boolean;
    notes?: string | null;
    currentAddressLine1?: string | null;
    currentBarangay?: string | null;
    currentCity?: string | null;
    currentProvince?: string | null;
    currentPostalCode?: string | null;
    currentCountry?: string | null;
    purchaseType?: string | null;
    financingPreference?: string | null;
    financingPreferenceOther?: string | null;
    annualIncome?: string | null;
    bankName?: string | null;
    budgetMin?: string | null;
    budgetMax?: string | null;
    approvalStatus?: string;
  }>,
) {
  if (contacts.length === 0) return "";

  const headers = [
    "contact_code",
    "first_name",
    "middle_name",
    "last_name",
    "company_name",
    "email",
    "mobile_phone_1",
    "mobile_phone_2",
    "mobile_phone_3",
    "whatsapp_number",
    "viber_number",
    "instagram_handle",
    "facebook_handle",
    "preferred_contact_methods",
    "employment_type",
    "lifecycle_stage",
    "assigned_agent_id",
    "broker_user_id",
    "broker_first_name",
    "broker_last_name",
    "marketing_consent",
    "notes",
    "current_address_line_1",
    "current_barangay",
    "current_city",
    "current_province",
    "current_postal_code",
    "current_country",
    "purchase_type",
    "financing_preference",
    "financing_preference_other",
    "annual_income",
    "bank_name",
    "budget_min",
    "budget_max",
    "approval_status",
  ];

  const rows = contacts.map((contact) => [
    contact.code || "",
    contact.firstName || "",
    contact.middleName || "",
    contact.lastName || "",
    contact.companyName || "",
    contact.email || "",
    contact.mobilePhone1 || "",
    contact.mobilePhone2 || "",
    contact.mobilePhone3 || "",
    contact.whatsappNumber || "",
    contact.viberNumber || "",
    contact.instagramHandle || "",
    contact.facebookHandle || "",
    (contact.preferredContactMethods || []).join(";"),
    contact.employmentType || "",
    contact.lifecycleStage || "",
    contact.assignedAgentId || "",
    contact.brokerUserId || "",
    contact.brokerFirstName || "",
    contact.brokerLastName || "",
    contact.marketingConsent ? "true" : "false",
    contact.notes || "",
    contact.currentAddressLine1 || "",
    contact.currentBarangay || "",
    contact.currentCity || "",
    contact.currentProvince || "",
    contact.currentPostalCode || "",
    contact.currentCountry || "",
    contact.purchaseType || "",
    contact.financingPreference || "",
    contact.financingPreferenceOther || "",
    contact.annualIncome || "",
    contact.bankName || "",
    contact.budgetMin || "",
    contact.budgetMax || "",
    contact.approvalStatus || "",
  ]);

  const csv = [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
  return csv;
}

/** Undoes `csvCell`'s formula guard, so an exported file re-imports unchanged. */
export function unguardCell(value: string) {
  return typeof value === "string" ? value.replace(/^'(?=[=+\-@\t\r])/, "") : value;
}

export function csvCell(value: string | number) {
  let cell = String(value);
  if (/^[=@\t\r]/.test(cell) || (/^[+-]/.test(cell) && !/^[+-][\d\s().-]*$/.test(cell)))
    cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}

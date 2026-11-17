import { manilaToday } from "@/lib/utils/manila-time";
import { ageOn, budgetRangeLabelFor, channelLabel, purchaseTypeLabels } from "./contact-options";
import {
  facebookHref,
  formatPeso,
  formatPesoRange,
  formatPhone,
  instagramHref,
  phoneHref,
  socialHandle,
  viberHref,
  whatsappHref,
} from "./format";
import type { InfoFieldGroup } from "../components/info-card";
import type { InfoFieldSpec } from "../components/info-field";

export type ContactDetailView = {
  email: string | null;
  mobilePhone1: string | null;
  mobilePhone2: string | null;
  mobilePhone3: string | null;
  whatsappNumber: string | null;
  viberNumber: string | null;
  instagramHandle: string | null;
  facebookHandle: string | null;
  preferredContactMethods: readonly string[];
  companyName: string | null;
  birthDate: string | null;
  gender: string | null;
  civilStatus: string | null;
  citizenship: string | null;
  landline: string | null;
  prcLicenseNumber?: string | null;
  currentAddressLine1: string | null;
  currentBarangay: string | null;
  currentCity: string | null;
  currentProvince: string | null;
  currentPostalCode: string | null;
  currentCountry: string | null;
  purchaseType: string | null;
  budgetMin: string | null;
  budgetMax: string | null;
  employmentType: string | null;
  annualIncome: string | null;
};

function titleize(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
}

/** Composes the multi-line postal address, skipping blank parts. */
function formatAddress(c: ContactDetailView): string | null {
  const parts = [
    c.currentAddressLine1,
    c.currentBarangay,
    c.currentCity,
    c.currentProvince,
    c.currentPostalCode,
    c.currentCountry,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length ? parts.join(", ") : null;
}

/** Personal details, selected contact channels and address from the contact form. */
export function buildContactDetailGroups(c: ContactDetailView): InfoFieldGroup[] {
  const methods = c.preferredContactMethods.map(channelLabel);

  const phoneFields = [
    { label: "Mobile phone 1", value: c.mobilePhone1, variant: "phone" as const },
    { label: "Mobile phone 2", value: c.mobilePhone2, variant: "phone" as const },
    { label: "Mobile phone 3", value: c.mobilePhone3, variant: "phone" as const },
  ]
    .filter(
      (field, index) =>
        field.value?.trim() || (index === 0 && c.preferredContactMethods.includes("phone")),
    )
    .map((field) => ({
      ...field,
      href: phoneHref(field.value) ?? undefined,
      value: formatPhone(field.value) ?? field.value,
    }));

  const hasValue = (value: string | null) => Boolean(value && value.trim());
  const channelFields: InfoFieldSpec[] = [];
  if (hasValue(c.landline) || c.preferredContactMethods.includes("landline")) {
    channelFields.push({
      label: "Landline",
      value: c.landline,
      variant: "phone",
      href: phoneHref(c.landline) ?? undefined,
    });
  }
  if (hasValue(c.whatsappNumber) || c.preferredContactMethods.includes("whatsapp")) {
    channelFields.push({
      label: "WhatsApp",
      value: formatPhone(c.whatsappNumber) ?? c.whatsappNumber,
      variant: "phone",
      href: whatsappHref(c.whatsappNumber) ?? undefined,
    });
  }
  if (hasValue(c.viberNumber) || c.preferredContactMethods.includes("viber")) {
    channelFields.push({
      label: "Viber",
      value: formatPhone(c.viberNumber) ?? c.viberNumber,
      variant: "phone",
      href: viberHref(c.viberNumber) ?? undefined,
    });
  }
  if (hasValue(c.instagramHandle) || c.preferredContactMethods.includes("instagram")) {
    channelFields.push({
      label: "Instagram",
      value: socialHandle(c.instagramHandle) ? `@${socialHandle(c.instagramHandle)}` : null,
      variant: "link",
      href: instagramHref(c.instagramHandle) ?? undefined,
    });
  }
  if (hasValue(c.facebookHandle) || c.preferredContactMethods.includes("facebook")) {
    channelFields.push({
      label: "Facebook",
      value: socialHandle(c.facebookHandle) ?? c.facebookHandle,
      variant: "link",
      href: facebookHref(c.facebookHandle) ?? undefined,
    });
  }

  const age = ageOn(c.birthDate, manilaToday());
  return [
    {
      heading: "Personal",
      fields: [
        {
          label: "Date of birth",
          value: c.birthDate ? (age === null ? c.birthDate : `${c.birthDate} (age ${age})`) : null,
        },
        { label: "Gender", value: c.gender },
        { label: "Civil status", value: c.civilStatus },
        { label: "Citizenship", value: c.citizenship },
        { label: "PRC license", value: c.prcLicenseNumber ?? null },
        { label: "Company", value: c.companyName },
      ],
    },
    {
      heading: "Contact",
      fields: [
        ...(hasValue(c.email) || c.preferredContactMethods.includes("email")
          ? [
              {
                label: "Email",
                value: c.email,
                variant: "email" as const,
                href: c.email ? `mailto:${c.email}` : undefined,
              },
            ]
          : []),
        ...phoneFields,
        ...channelFields,
        {
          label: "Contact channels",
          value: methods.length ? methods.join(", ") : null,
          variant: "chips",
          items: methods,
        },
      ],
    },
    {
      heading: "Address",
      fields: [{ label: "Current address", value: formatAddress(c), variant: "long", wide: true }],
    },
  ];
}

/** Property interest, with business fields only for the selected commercial role. */
export function buildPurchasePreferenceGroups(c: ContactDetailView): InfoFieldGroup[] {
  return [
    {
      heading: "Buyer type",
      fields: [
        {
          label: "Budget range",
          value:
            budgetRangeLabelFor(c.budgetMin, c.budgetMax) ??
            formatPesoRange(c.budgetMin, c.budgetMax),
        },
        {
          label: "Property type",
          value: c.purchaseType
            ? (purchaseTypeLabels[c.purchaseType as keyof typeof purchaseTypeLabels] ??
              titleize(c.purchaseType))
            : null,
        },
      ],
    },
  ];
}

/** Employment & financial information card. */
export function buildEmploymentGroups(c: ContactDetailView): InfoFieldGroup[] {
  return [
    {
      fields: [
        { label: "Employment", value: c.employmentType },
        { label: "Annual income", value: formatPeso(c.annualIncome), variant: "stat" as const },
      ],
    },
  ];
}

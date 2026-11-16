import { expect, it } from "vitest";
import {
  buildContactDetailGroups,
  buildEmploymentGroups,
  buildPurchasePreferenceGroups,
  type ContactDetailView,
} from "./contact-detail-fields";

const contact: ContactDetailView = {
  email: null,
  mobilePhone1: null,
  mobilePhone2: null,
  mobilePhone3: null,
  whatsappNumber: null,
  viberNumber: null,
  instagramHandle: null,
  facebookHandle: null,
  preferredContactMethods: [],
  companyName: "COMPANY",
  birthDate: null,
  gender: null,
  civilStatus: null,
  citizenship: null,
  landline: null,
  currentAddressLine1: null,
  currentBarangay: null,
  currentCity: null,
  currentProvince: null,
  currentPostalCode: null,
  currentCountry: null,
  purchaseType: "residential",
  commercialPartyRole: null,
  businessOwnerName: null,
  authorizedRepresentativeName: null,
  budgetMin: null,
  budgetMax: "2300000",
  employmentType: "Private Company Employee",
  annualIncome: "0",
};

it("does not offer empty email and phone slots for unselected channels", () => {
  const groups = buildContactDetailGroups(contact);
  const fields = groups.find((group) => group.heading === "Contact")!.fields;
  expect(fields.map((field) => field.label)).toEqual(["Contact channels"]);
  expect(groups.find((group) => group.heading === "Personal")!.fields).toContainEqual({
    label: "Company",
    value: "COMPANY",
  });
});

it("shows selected channels and retains saved numbers from other channels", () => {
  const groups = buildContactDetailGroups({
    ...contact,
    preferredContactMethods: ["instagram", "email", "phone"],
    mobilePhone3: "09171234567",
  });
  const fields = groups.find((group) => group.heading === "Contact")!.fields;
  expect(fields.map((field) => field.label)).toEqual([
    "Email",
    "Mobile phone 1",
    "Mobile phone 3",
    "Instagram",
    "Contact channels",
  ]);
  expect(fields.find((field) => field.label === "Instagram")!.value).toBeNull();
  expect(fields.find((field) => field.label === "Mobile phone 3")!.value).toBe("+63 917 123 4567");
});

it("shows budget and purchase type without stale commercial fields for residential buyers", () => {
  const fields = buildPurchasePreferenceGroups({
    ...contact,
    commercialPartyRole: "both",
    businessOwnerName: "OLD OWNER",
  }).flatMap((group) => group.fields);
  expect(fields.map((field) => field.label)).toEqual(["Budget range", "Property type"]);
  expect(fields[0].value).toBeTruthy();
  expect(fields[1].value).toBe("Residential");
});

it.each([
  ["business_owner", ["Who is buying?", "Owner name"]],
  ["authorized_representative", ["Who is buying?", "Representative"]],
  ["both", ["Who is buying?", "Owner name", "Representative"]],
])("shows the current form's business fields for %s", (commercialPartyRole, labels) => {
  const groups = buildPurchasePreferenceGroups({
    ...contact,
    purchaseType: "commercial",
    commercialPartyRole: commercialPartyRole as string,
  });
  expect(
    groups
      .find((group) => group.heading === "Business details")!
      .fields.map((field) => field.label),
  ).toEqual(labels);
});

it("keeps employment and zero income visible using the current form labels", () => {
  const fields = buildEmploymentGroups(contact).flatMap((group) => group.fields);
  expect(fields[0]).toEqual({ label: "Employment", value: "Private Company Employee" });
  expect(fields[1].value).toBe("₱0");
});

import { expect, it } from "vitest";
import { contactSchema, contactCreateSchema } from "./contact.schema";
import { opportunityAddressSchema, opportunityInterestSchema } from "./opportunity-contact.schema";

const lead = {
  firstName: "Test",
  lastName: "Lead",
  agentUserId: "12345678-1234-4234-8234-123456789abc",
};
it("creates a lead without address or property interest", () => {
  expect(contactCreateSchema.safeParse(lead).success).toBe(true);
});
it("keeps address and budget validation when editing a contact", () => {
  const result = contactSchema.safeParse(lead);
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.error.flatten().fieldErrors).toMatchObject({
      currentProvince: expect.any(Array),
      budgetMax: expect.any(Array),
    });
});
it("requires the complete address when moving to Opportunity", () => {
  expect(opportunityAddressSchema.safeParse({}).success).toBe(false);
  expect(
    opportunityAddressSchema.safeParse({
      currentProvince: "Cebu",
      currentCity: "Cebu City",
      currentBarangay: "Lahug",
    }).success,
  ).toBe(true);
});
it("requires a budget and rejects an inverted range", () => {
  expect(opportunityInterestSchema.safeParse({}).success).toBe(false);
  expect(opportunityInterestSchema.safeParse({ budgetMin: 200, budgetMax: 100 }).success).toBe(
    false,
  );
  expect(opportunityInterestSchema.safeParse({ budgetMax: 2299999 }).success).toBe(true);
});

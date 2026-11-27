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
it("edits a contact without agent, address or budget", () => {
  const result = contactSchema.safeParse({ firstName: "Test", lastName: "Lead", agentUserId: "" });
  expect(result.success).toBe(true);
  // A blank agent reaches the action as null, which keeps the current agent.
  if (result.success) expect(result.data.agentUserId).toBeNull();
  // A partial address is fine when editing.
  expect(contactSchema.safeParse({ ...lead, currentProvince: "Cebu" }).success).toBe(true);
});
it("still asks a new contact for an agent and a complete address once started", () => {
  expect(contactCreateSchema.safeParse({ ...lead, agentUserId: "" }).success).toBe(false);
  expect(contactCreateSchema.safeParse({ ...lead, currentProvince: "Cebu" }).success).toBe(false);
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

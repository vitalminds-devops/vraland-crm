import { describe, expect, it } from "vitest";
import { maskEnrollment, maskRecipient } from "./recipient-privacy";

const recipient = {
  contactId: "c1",
  firstName: "Ana",
  lastName: "Reyes",
  email: "ana@example.com",
  mobilePhone: "09170000000",
  error: "Rejected: ana@example.com",
  status: "failed",
  sentAt: null,
};

describe("maskRecipient", () => {
  it("shows details for a contact in the viewer's access", () => {
    expect(maskRecipient({ ...recipient, inScope: true })).toEqual({
      ...recipient,
      masked: false,
    });
  });

  it("hides every personal field outside the viewer's access but keeps the result", () => {
    expect(maskRecipient({ ...recipient, inScope: false })).toEqual({
      contactId: null,
      firstName: null,
      lastName: null,
      email: null,
      mobilePhone: null,
      error: null,
      status: "failed",
      sentAt: null,
      masked: true,
    });
  });
});

describe("maskEnrollment", () => {
  const enrollment = { id: "e1", status: "active", contactName: "Ana Reyes", dealTitle: "Unit 5" };

  it("shows the person in access", () => {
    expect(maskEnrollment({ ...enrollment, inScope: true })).toEqual({
      ...enrollment,
      masked: false,
    });
  });

  it("hides the person and deal outside access", () => {
    expect(maskEnrollment({ ...enrollment, inScope: false })).toEqual({
      id: "e1",
      status: "active",
      contactName: null,
      dealTitle: null,
      masked: true,
    });
  });
});

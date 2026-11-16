import { describe, expect, it } from "vitest";
import { contactPageActions } from "./contact-page-actions";

const context = (permissions: string[], roles: string[] = []) => ({
  authUserId: "auth",
  userId: "user",
  organizationId: "org",
  roles,
  permissions: new Set(permissions),
});

describe("contactPageActions", () => {
  it("shows nothing beyond viewing without write permissions", () => {
    expect(contactPageActions(context(["contacts.view"]))).toEqual({
      canCreate: false,
      canEdit: false,
      canArchive: false,
      canImport: false,
      canExport: false,
      canViewDocuments: false,
      canReassign: false,
      canOverrideWonLock: false,
    });
  });

  it("follows each permission", () => {
    const actions = contactPageActions(
      context(["contacts.create", "contacts.update", "contacts.delete", "contacts.import"]),
    );
    expect(actions).toMatchObject({
      canCreate: true,
      canEdit: true,
      canArchive: true,
      canImport: true,
      canExport: false,
    });
  });

  it("needs organization-wide access to reassign brokers", () => {
    expect(contactPageActions(context(["contacts.reassign_broker"])).canReassign).toBe(false);
    expect(contactPageActions(context(["records.view_all"])).canReassign).toBe(false);
    expect(
      contactPageActions(context(["contacts.reassign_broker", "records.view_all"])).canReassign,
    ).toBe(true);
  });

  it("lets only a super administrator override the won-sale lock", () => {
    expect(contactPageActions(context([], ["administrator"])).canOverrideWonLock).toBe(false);
    expect(contactPageActions(context([], ["super-administrator"])).canOverrideWonLock).toBe(true);
  });
});

import { expect, it } from "vitest";
import { canManageSharedFiles } from "./shared-files";

it.each([
  ["administrator", true, true],
  ["super-administrator", true, true],
  ["administrator", false, false],
  ["agent", true, false],
  ["sales-manager", true, false],
])("limits shared file management for %s with manage permission %s", (role, manage, expected) => {
  expect(
    canManageSharedFiles({
      authUserId: "auth",
      userId: "user",
      organizationId: "org",
      roles: [role],
      permissions: new Set(manage ? ["documents.manage"] : []),
    }),
  ).toBe(expected);
});

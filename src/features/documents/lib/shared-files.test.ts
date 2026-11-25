import { expect, it } from "vitest";
import { canManageSharedFiles } from "./shared-files";

it.each([
  ["administrator", ["documents.manage_shared"], true],
  ["agent", ["documents.manage_shared"], true],
  // The role name alone, or Manage documents, no longer opens shared files.
  ["administrator", ["documents.manage"], false],
  ["super-administrator", [], false],
])("lets %s with %j manage shared files: %s", (role, permissions, expected) => {
  expect(
    canManageSharedFiles({
      authUserId: "auth",
      userId: "user",
      organizationId: "org",
      roles: [role],
      permissions: new Set(permissions),
    }),
  ).toBe(expected);
});

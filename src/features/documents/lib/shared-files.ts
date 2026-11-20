import type { AuthorizationContext } from "@/lib/permissions/policy";

export const sharedFileCategory = "shared_file";

export function canManageSharedFiles(context: AuthorizationContext) {
  return (
    context.permissions.has("documents.manage") &&
    context.roles.some((role) => role === "administrator" || role === "super-administrator")
  );
}

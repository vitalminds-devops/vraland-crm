import {
  canGrantUnitAccess,
  hasPermission,
  type AuthorizationContext,
} from "@/lib/permissions/policy";

/** The property Access page: granters edit, "See everyone's property access" reads, others stay out. */
export function accessPageMode(context: AuthorizationContext): "edit" | "view" | null {
  if (!hasPermission(context, "properties.view")) return null;
  if (canGrantUnitAccess(context)) return "edit";
  return hasPermission(context, "properties.view_all_access") ? "view" : null;
}

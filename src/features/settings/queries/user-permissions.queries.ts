import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { permissions, rolePermissions, roles, userPermissions, users } from "@/db/schema";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import type { PermissionOverride } from "@/lib/permissions/user-permissions";

/** Who may change a user's own permissions: anyone who manages roles, as on the Roles page. */
export function canEditUserPermissions(context: { permissions: ReadonlySet<string> }): boolean {
  return context.permissions.has("roles.manage");
}

/** Each role's permission keys and the user's own changes, or null when the viewer may not edit them. */
export async function getUserPermissionEditor(userId: string) {
  const context = await getAuthorizationContext();
  if (!context || !canEditUserPermissions(context)) return null;
  const [grants, overrides] = await Promise.all([
    db
      .select({ roleId: roles.id, key: permissions.key })
      .from(rolePermissions)
      .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(roles.organizationId, context.organizationId)),
    db
      .select({ key: userPermissions.permissionKey, granted: userPermissions.granted })
      .from(userPermissions)
      .innerJoin(users, eq(userPermissions.userId, users.id))
      .where(
        and(eq(userPermissions.userId, userId), eq(users.organizationId, context.organizationId)),
      ),
  ]);
  const roleKeys: Record<string, string[]> = {};
  for (const { roleId, key } of grants) (roleKeys[roleId] ??= []).push(key);
  // Sorted like overridesFor, so the form can tell an untouched list from an edited one.
  const sorted: PermissionOverride[] = overrides.sort((a, b) => a.key.localeCompare(b.key));
  return { roleKeys, overrides: sorted };
}

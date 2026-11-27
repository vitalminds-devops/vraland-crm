import "server-only";

import { eq } from "drizzle-orm";

import type { db } from "@/db";
import { auditLogs, userPermissions } from "@/db/schema";
import { permissionDenied } from "@/lib/errors";
import { loadAccess } from "@/lib/permissions/authorization";
import { isPermissionKey, superAdministratorRoleSlug } from "@/lib/permissions/catalog";
import {
  canGrantPermissions,
  hasPermission,
  type AuthorizationContext,
} from "@/lib/permissions/policy";
import { failure, success, validationFailure, type ActionResult } from "@/lib/types/action-result";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type PermissionOverride = { key: string; granted: boolean };

/**
 * Checks that the caller may set these overrides on a user of their organization, and returns
 * them cleaned: retired keys dropped, one entry per key. Run before the transaction.
 */
export async function checkPermissionOverrides(
  context: AuthorizationContext,
  userId: string,
  input: PermissionOverride[],
): Promise<ActionResult<PermissionOverride[]>> {
  if (!hasPermission(context, "roles.manage"))
    return failure(permissionDenied("You don't have permission to change permissions."));
  if (userId === context.userId)
    return validationFailure("Ask another administrator to change your permissions.");
  const overrides = [
    ...new Map(input.filter((o) => isPermissionKey(o.key)).map((o) => [o.key, o])).values(),
  ];
  const targetAccess = await loadAccess(userId, context.organizationId);
  if (targetAccess.roles.includes(superAdministratorRoleSlug))
    return failure(permissionDenied("A Super Administrator's permissions can't be changed."));
  if (!canGrantPermissions(context, targetAccess.permissions))
    return failure(permissionDenied("You can't change a user who has access you don't have."));
  const granted = overrides.filter((o) => o.granted).map((o) => o.key);
  if (!canGrantPermissions(context, granted))
    return failure(permissionDenied("You cannot grant permissions you do not hold yourself."));
  return success(overrides);
}

/** Replaces the user's overrides inside `tx`, with an audit row; does nothing when unchanged. */
export async function writePermissionOverrides(
  tx: Tx,
  context: AuthorizationContext,
  userId: string,
  overrides: PermissionOverride[],
) {
  const before = await tx
    .select({ key: userPermissions.permissionKey, granted: userPermissions.granted })
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId))
    .for("update");
  const sorted = (rows: PermissionOverride[]) =>
    JSON.stringify([...rows].sort((a, b) => a.key.localeCompare(b.key)));
  if (sorted(before) === sorted(overrides)) return;
  await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));
  if (overrides.length)
    await tx.insert(userPermissions).values(
      overrides.map((o) => ({
        userId,
        permissionKey: o.key,
        granted: o.granted,
        assignedBy: context.userId,
      })),
    );
  await tx.insert(auditLogs).values({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    action: "update",
    entityType: "user_permissions",
    entityId: userId,
    oldValues: { overrides: before },
    newValues: { overrides },
  });
}

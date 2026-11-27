"use server";

import { permissionOverridesSchema } from "../schemas/settings.schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { logError } from "@/lib/logger";
import { requirePermission } from "@/lib/permissions/authorization";
import {
  databaseFailure,
  notFoundFailure,
  success,
  validationFailure,
  validationFailureFromZod,
  type ActionResult,
} from "@/lib/types/action-result";

import { checkPermissionOverrides, writePermissionOverrides } from "./user-permission-writes";

const userPermissionsSchema = z.object({
  userId: z.uuid(),
  overrides: permissionOverridesSchema,
});

/** Replaces one user's own permission changes; their roles stay as they are. */
export async function updateUserPermissions(input: unknown): Promise<ActionResult<{ id: string }>> {
  const context = await requirePermission("roles.manage");
  const parsed = userPermissionsSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error, "Invalid permissions.");
  const { userId } = parsed.data;

  if (userId === context.userId)
    return validationFailure("Ask another administrator to change your permissions.");
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, context.organizationId)))
    .limit(1);
  if (!target) return notFoundFailure("User");

  const checked = await checkPermissionOverrides(context, userId, parsed.data.overrides);
  if (!checked.success) return checked;

  try {
    await db.transaction((tx) => writePermissionOverrides(tx, context, userId, checked.data));
  } catch (error) {
    logError("User permissions save failed", error, { operation: "user_permissions_save" });
    return databaseFailure("Couldn't save the permissions.");
  }
  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${userId}`);
  return success({ id: userId });
}

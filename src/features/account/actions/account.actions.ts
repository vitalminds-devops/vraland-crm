"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { auditLogs, authUser, users } from "@/db/schema";
import { requireAuthorizationContext } from "@/lib/permissions/authorization";
import { accountProfileSchema, type AccountProfileInput } from "../schemas/account.schema";
import { logError } from "@/lib/logger";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { checkImageUpload } from "@/lib/storage/image-uploads";
import {
  type ActionResult,
  databaseFailure,
  validationFailure,
  success,
  validationFailureFromZod,
} from "@/lib/types/action-result";

export type AccountActionResult = ActionResult<void>;

export async function updateOwnProfile(input: AccountProfileInput): Promise<AccountActionResult> {
  const context = await requireAuthorizationContext();
  const parsed = accountProfileSchema.safeParse(input);
  if (!parsed.success)
    return validationFailureFromZod(parsed.error, "Review the highlighted fields.");

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
        })
        .from(users)
        .where(and(eq(users.id, context.userId), eq(users.organizationId, context.organizationId)))
        .limit(1);
      if (!before) throw new Error("User not found");

      const profile = parsed.data;
      await tx
        .update(users)
        .set({
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone || null,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, context.userId), eq(users.organizationId, context.organizationId)));
      await tx
        .update(authUser)
        .set({
          name: `${profile.firstName} ${profile.lastName}`,
          updatedAt: new Date(),
        })
        .where(and(eq(authUser.id, context.authUserId), eq(authUser.crmUserId, context.userId)));
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "user_profile",
        entityId: context.userId,
        oldValues: before,
        newValues: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone || null,
        },
      });
    });
    revalidatePath("/account");
    return success();
  } catch (error) {
    logError("Profile update failed", error, { operation: "profile_update" });
    return databaseFailure("Your profile could not be updated.");
  }
}

/** Sets the signed-in user's photo, or removes it when `image` is missing and `remove` is set. */
export async function updateOwnAvatar(formData: FormData): Promise<AccountActionResult> {
  const context = await requireAuthorizationContext();
  const remove = formData.get("remove") === "true";
  const upload = remove ? null : await checkImageUpload(formData.get("image"));
  if (upload && !upload.ok) return validationFailure(upload.message);

  const storage = getDocumentStorage();
  const storageKey = upload
    ? `${context.organizationId}/avatars/${context.userId}/${randomUUID()}.${upload.extension}`
    : null;
  let previous: string | null = null;
  try {
    if (upload && storageKey)
      await storage.put(storageKey, Buffer.from(await upload.file.arrayBuffer()));
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ avatarUrl: users.avatarUrl })
        .from(users)
        .where(and(eq(users.id, context.userId), eq(users.organizationId, context.organizationId)))
        .limit(1);
      if (!before) throw new Error("User not found");
      previous = before.avatarUrl;
      await tx
        .update(users)
        .set({ avatarUrl: storageKey, updatedAt: new Date() })
        .where(and(eq(users.id, context.userId), eq(users.organizationId, context.organizationId)));
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "user_profile",
        entityId: context.userId,
        // Words, not the storage key: the log is read by people, and a replaced photo must read as a change.
        oldValues: { photo: before.avatarUrl ? "Had a photo" : "No photo" },
        newValues: { photo: storageKey ? "New photo uploaded" : "Removed" },
      });
    });
  } catch (error) {
    if (storageKey) await storage.remove(storageKey).catch(() => {});
    logError("Avatar update failed", error, { operation: "avatar_update" });
    return databaseFailure("Your photo could not be saved.");
  }
  if (previous)
    await storage
      .remove(previous)
      .catch((error) =>
        logError("Old avatar cleanup failed", error, { operation: "avatar_cleanup" }),
      );
  // The sidebar shows the photo on every page.
  revalidatePath("/", "layout");
  return success();
}

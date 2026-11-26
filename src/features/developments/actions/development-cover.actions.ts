"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { activities, auditLogs, developments } from "@/db/schema";
import { logError } from "@/lib/logger";
import { requirePermission } from "@/lib/permissions/authorization";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { checkImageUpload } from "@/lib/storage/image-uploads";

export type DevelopmentCoverActionResult =
  { success: true; message: string } | { success: false; message: string };

const developmentIdSchema = z.uuid();

type CoverTarget = {
  id: string;
  name: string;
  coverImageStorageKey: string | null;
};

async function loadCoverTarget(
  organizationId: string,
  developmentId: string,
): Promise<CoverTarget | null> {
  const [row] = await db
    .select({
      id: developments.id,
      name: developments.name,
      coverImageStorageKey: developments.coverImageStorageKey,
    })
    .from(developments)
    .where(and(eq(developments.id, developmentId), eq(developments.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

function writeFailure(error: unknown): DevelopmentCoverActionResult {
  logError("Development cover write failed", error, {
    operation: "development_cover_write",
  });
  return {
    success: false,
    message: "Couldn't save the cover photo.",
  };
}

export async function saveDevelopmentCoverImage(
  formData: FormData,
): Promise<DevelopmentCoverActionResult> {
  const context = await requirePermission("developments.update");

  const parsed = developmentIdSchema.safeParse(formData.get("developmentId"));
  if (!parsed.success) return { success: false, message: "Couldn't find that development." };

  const upload = await checkImageUpload(formData.get("image"));
  if (!upload.ok) return { success: false, message: upload.message };

  const development = await loadCoverTarget(context.organizationId, parsed.data);
  if (!development) return { success: false, message: "Couldn't find that development." };

  const storageKey = `${context.organizationId}/developments/${development.id}/cover/${randomUUID()}.${upload.extension}`;
  const body = Buffer.from(await upload.file.arrayBuffer());
  const storage = getDocumentStorage();

  try {
    await storage.put(storageKey, body);
  } catch (error) {
    return writeFailure(error);
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(developments)
        .set({
          coverImageStorageKey: storageKey,
          coverImageMimeType: upload.mimeType,
          updatedAt: new Date(),
        })
        .where(eq(developments.id, development.id));

      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: development.coverImageStorageKey
          ? "development.cover_image_replaced"
          : "development.cover_image_added",
        summary: `${development.name} ${
          development.coverImageStorageKey
            ? "was given a new cover photo"
            : "was given a cover photo"
        }.`,
        metadata: {
          developmentId: development.id,
          mimeType: upload.mimeType,
          size: upload.size,
        },
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "development",
        entityId: development.id,
        oldValues: { coverImageStorageKey: development.coverImageStorageKey },
        newValues: {
          coverImageStorageKey: storageKey,
          mimeType: upload.mimeType,
        },
      });
    });
  } catch (error) {
    await storage.remove(storageKey).catch((cleanupError) =>
      logError("Orphaned development cover cleanup failed", cleanupError, {
        operation: "development_cover_cleanup",
        developmentId: development.id,
      }),
    );
    return writeFailure(error);
  }

  if (development.coverImageStorageKey)
    await storage.remove(development.coverImageStorageKey).catch((error) =>
      logError("Replaced development cover cleanup failed", error, {
        operation: "development_cover_cleanup",
        developmentId: development.id,
      }),
    );

  revalidatePath("/developments");
  revalidatePath(`/developments/${development.id}`);
  return { success: true, message: "Cover photo saved." };
}

export async function removeDevelopmentCoverImage(
  developmentId: string,
): Promise<DevelopmentCoverActionResult> {
  const context = await requirePermission("developments.update");

  const parsed = developmentIdSchema.safeParse(developmentId);
  if (!parsed.success) return { success: false, message: "Couldn't find that development." };

  const development = await loadCoverTarget(context.organizationId, parsed.data);
  if (!development) return { success: false, message: "Couldn't find that development." };
  if (!development.coverImageStorageKey)
    return {
      success: false,
      message: "That development has no cover photo to remove.",
    };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(developments)
        .set({
          coverImageStorageKey: null,
          coverImageMimeType: null,
          updatedAt: new Date(),
        })
        .where(eq(developments.id, development.id));

      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "development",
        entityId: development.id,
        oldValues: { coverImageStorageKey: development.coverImageStorageKey },
        newValues: { coverImageStorageKey: null },
      });
    });
  } catch (error) {
    return writeFailure(error);
  }

  await getDocumentStorage()
    .remove(development.coverImageStorageKey)
    .catch((error) =>
      logError("Removed development cover cleanup failed", error, {
        operation: "development_cover_cleanup",
        developmentId: development.id,
      }),
    );

  revalidatePath("/developments");
  revalidatePath(`/developments/${development.id}`);
  return { success: true, message: "Cover photo removed." };
}

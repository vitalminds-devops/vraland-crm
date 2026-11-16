"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { auditLogs, deals, developments, properties, units } from "@/db/schema";
import { ActionErrorCode } from "@/lib/errors/action-error";
import { logError } from "@/lib/logger";
import { requirePermission } from "@/lib/permissions/authorization";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import {
  type ActionResult,
  databaseFailure,
  failureFrom,
  notFoundFailure,
  success,
  validationFailureFromZod,
} from "@/lib/types/action-result";

/**
 * Deletes a development only when nothing points at it. Properties (archived ones too), units
 * and opportunities block it, because their foreign keys would silently drop the link.
 * Contacts that merely prefer it are cleared by the database (ON DELETE SET NULL).
 */
export async function deleteDevelopment(developmentId: string): Promise<ActionResult> {
  const context = await requirePermission("developments.delete");
  const parsed = z.uuid().safeParse(developmentId);
  if (!parsed.success) return validationFailureFromZod(parsed.error, "Invalid development.");
  const id = parsed.data;

  let result: ActionResult | { deleted: { name: string; code: string; cover: string | null } };
  try {
    result = await db.transaction(async (tx) => {
      // Row lock: new properties, units or deals take a key-share lock on it, so they wait.
      const [development] = await tx
        .select({
          name: developments.name,
          code: developments.code,
          cover: developments.coverImageStorageKey,
        })
        .from(developments)
        .where(
          and(eq(developments.id, id), eq(developments.organizationId, context.organizationId)),
        )
        .for("update");
      if (!development) return notFoundFailure("Development");

      const blockers = [
        [properties, properties.developmentId, "Remove its properties first, archived ones too."],
        [units, units.developmentId, "Remove its units first."],
        [deals, deals.developmentId, "Opportunities still use it."],
      ] as const;
      for (const [table, column, message] of blockers) {
        const [used] = await tx.select({ id: column }).from(table).where(eq(column, id)).limit(1);
        if (used) return failureFrom(ActionErrorCode.CONFLICT, message);
      }

      await tx.delete(developments).where(eq(developments.id, id));
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "development",
        entityId: id,
        oldValues: { name: development.name, code: development.code },
      });
      return { deleted: development };
    });
  } catch (error) {
    logError("Development delete failed", error, {
      operation: "development_delete",
      developmentId: id,
    });
    return databaseFailure("Couldn't delete the development. Try again.");
  }
  if (!("deleted" in result)) return result;

  const cover = result.deleted.cover;
  if (cover)
    await getDocumentStorage()
      .remove(cover)
      .catch((error) =>
        logError("Deleted development cover cleanup failed", error, {
          operation: "development_cover_cleanup",
          developmentId: id,
        }),
      );

  revalidatePath("/developments");
  return success();
}

"use server";

import { and, eq } from "drizzle-orm";
import { nextRecordCode } from "@/lib/record-codes";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activities, auditLogs, developments } from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { buildChangeSet } from "@/lib/audit/redact";
import { logError } from "@/lib/logger";
import {
  type ActionResult,
  success,
  validationFailureFromZod,
  databaseFailure,
} from "@/lib/types/action-result";
import { developmentSchema, type DevelopmentInput } from "../schemas/development.schema";

export type DevelopmentActionResult = ActionResult<{ id: string }>;

function writeFailure(error: unknown): DevelopmentActionResult {
  logError("Development write failed", error, {
    operation: "development_write",
  });
  const cause = error instanceof Error && error.cause ? error.cause : error;
  const detail =
    (cause as { detail?: string; message?: string })?.detail ||
    (cause as { message?: string })?.message;
  return databaseFailure(
    process.env.NODE_ENV === "development" && detail
      ? `Couldn't save development: ${detail}`
      : "Couldn't save the development. Try again.",
  );
}

const valuesFor = (value: DevelopmentInput) => ({
  name: value.name,
  description: value.description,
  status: value.status,
  addressLine1: value.addressLine1,
  barangay: value.barangay,
  city: value.city,
  province: value.province,
  postalCode: value.postalCode,
  launchDate: value.launchDate,
  completionDate: value.completionDate,
  updatedAt: new Date(),
});

export async function createDevelopment(input: DevelopmentInput): Promise<DevelopmentActionResult> {
  const context = await requirePermission("developments.create");
  const parsed = developmentSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  try {
    const id = await db.transaction(async (tx) => {
      const [record] = await tx
        .insert(developments)
        .values({
          ...valuesFor(parsed.data),
          organizationId: context.organizationId,
          code: await nextRecordCode(tx, context.organizationId, "development"),
        })
        .returning({ id: developments.id });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "development.created",
        summary: `${parsed.data.name} was added as a development.`,
        metadata: { developmentId: record.id },
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "development",
        entityId: record.id,
        newValues: { name: parsed.data.name, status: parsed.data.status },
      });
      return record.id;
    });
    revalidatePath("/developments");
    return success({ id });
  } catch (error) {
    return writeFailure(error);
  }
}

export async function updateDevelopment(
  id: string,
  input: DevelopmentInput,
): Promise<DevelopmentActionResult> {
  const context = await requirePermission("developments.update");
  const parsed = developmentSchema.safeParse(input);
  if (!parsed.success) return validationFailureFromZod(parsed.error);
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          name: developments.name,
          status: developments.status,
          city: developments.city,
          launchDate: developments.launchDate,
          completionDate: developments.completionDate,
        })
        .from(developments)
        .where(
          and(eq(developments.id, id), eq(developments.organizationId, context.organizationId)),
        )
        .limit(1);
      if (!before) throw new Error("Development not found");
      await tx
        .update(developments)
        .set(valuesFor(parsed.data))
        .where(
          and(eq(developments.id, id), eq(developments.organizationId, context.organizationId)),
        );
      const changes = buildChangeSet(before, {
        name: parsed.data.name,
        status: parsed.data.status,
        city: parsed.data.city,
        launchDate: parsed.data.launchDate,
        completionDate: parsed.data.completionDate,
      });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "development.updated",
        summary: `${parsed.data.name} was updated.`,
        metadata: { developmentId: id },
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "development",
        entityId: id,
        oldValues: changes.oldValues,
        newValues: changes.newValues,
      });
    });
    revalidatePath("/developments");
    revalidatePath(`/developments/${id}`);
    return success({ id });
  } catch (error) {
    return writeFailure(error);
  }
}

"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activities, auditLogs, contactDocumentRequirements, documents } from "@/db/schema";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import { defaultRequirementStatus, requiredDocumentTypes } from "../lib/contact-options";
import { isSensitiveDocument } from "@/features/documents/lib/document-sensitivity";
import {
  requirementCreateSchema,
  requirementDeleteSchema,
  requirementSeedSchema,
} from "../schemas/requirement.schema";
import { logError } from "@/lib/logger";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { documentFileError, requirementFileTypes } from "@/lib/storage/document-validation";
import {
  databaseFailure,
  failure,
  notFoundFailure,
  success,
  validationFailure,
  type ActionResult,
} from "@/lib/types/action-result";
import { conflict } from "@/lib/errors";

export type RequirementActionResult = ActionResult<{ id: string }>;

export async function seedContactRequirements(input: {
  contactId: string;
}): Promise<ActionResult<{ id: string; created?: number }>> {
  const context = await requirePermission("requirements.manage");
  const parsed = requirementSeedSchema.safeParse(input);
  if (!parsed.success) return validationFailure("Choose a valid contact.");
  if (
    !(await canAccessResource(context, {
      type: "contact",
      id: parsed.data.contactId,
    }))
  )
    return notFoundFailure("Contact");
  const existing = await db
    .select({ documentType: contactDocumentRequirements.documentType })
    .from(contactDocumentRequirements)
    .where(eq(contactDocumentRequirements.contactId, parsed.data.contactId));
  const known = new Set(existing.map((row) => row.documentType));
  const missing = requiredDocumentTypes.filter((item) => !known.has(item.documentType));
  if (!missing.length) return failure(conflict("Every standard document is already listed."));
  await db.transaction(async (tx) => {
    await tx.insert(contactDocumentRequirements).values(
      missing.map((item) => ({
        organizationId: context.organizationId,
        contactId: parsed.data.contactId,
        documentType: item.documentType,
        label: item.label,
        status: defaultRequirementStatus,
      })),
    );
    await tx.insert(auditLogs).values({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "contact_document_requirement",
      entityId: parsed.data.contactId,
      newValues: {
        contactId: parsed.data.contactId,
        seeded: missing.length,
        documentTypes: missing.map((item) => item.documentType),
      },
    });
  });
  revalidatePath(`/contacts/${parsed.data.contactId}`);
  return success({ id: parsed.data.contactId, created: missing.length });
}

export async function addContactRequirement(input: {
  contactId: string;
  documentType: string;
  label: string;
  status?: string;
  notes?: string | null;
}): Promise<RequirementActionResult> {
  const context = await requirePermission("requirements.manage");
  const parsed = requirementCreateSchema.safeParse(input);
  if (!parsed.success) return validationFailure("Enter a name and type for the document.");
  if (
    !(await canAccessResource(context, {
      type: "contact",
      id: parsed.data.contactId,
    }))
  )
    return notFoundFailure("Contact");
  const value = parsed.data;
  try {
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(contactDocumentRequirements)
        .values({
          organizationId: context.organizationId,
          contactId: value.contactId,
          documentType: value.documentType,
          label: value.label,
          status: value.status,
          notes: value.notes,
        })
        .returning({ id: contactDocumentRequirements.id });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "contact_document_requirement",
        entityId: created.id,
        newValues: {
          contactId: value.contactId,
          documentType: value.documentType,
          label: value.label,
          status: value.status,
        },
      });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "contact.requirement_added",
        summary: `Document requirement "${value.label}" was added.`,
        contactId: value.contactId,
      });
      return created;
    });
    revalidatePath(`/contacts/${value.contactId}`);
    return success({ id: row.id });
  } catch (error) {
    logError("Requirement create failed", error, {
      operation: "requirement_create",
    });
    return databaseFailure("Couldn't save the document. It may already exist.");
  }
}

/** Stores a file for one requirement, attaches it to the contact and marks the requirement submitted. */
export async function uploadRequirementDocument(
  formData: FormData,
): Promise<RequirementActionResult> {
  const context = await requirePermission("requirements.manage");
  const id = requirementDeleteSchema.safeParse({ id: formData.get("id") });
  if (!id.success) return validationFailure("Choose a valid document.");
  const file = formData.get("file");
  if (!(file instanceof File)) return validationFailure("Choose a file.");
  const fileError = await documentFileError(file, requirementFileTypes);
  if (fileError) return validationFailure(fileError);
  const ext = requirementFileTypes[file.type];
  const [existing] = await db
    .select()
    .from(contactDocumentRequirements)
    .where(
      and(
        eq(contactDocumentRequirements.id, id.data.id),
        eq(contactDocumentRequirements.organizationId, context.organizationId),
      ),
    )
    .limit(1);
  if (!existing) return notFoundFailure("Document");
  if (!(await canAccessResource(context, { type: "contact", id: existing.contactId })))
    return notFoundFailure("Contact");

  const body = Buffer.from(await file.arrayBuffer());
  const key = `${context.organizationId}/contacts/${existing.contactId}/requirements/${randomUUID()}.${ext}`;
  const storage = getDocumentStorage();
  try {
    await storage.put(key, body);
    await db.transaction(async (tx) => {
      const [doc] = await tx
        .insert(documents)
        .values({
          organizationId: context.organizationId,
          contactId: existing.contactId,
          name: existing.label,
          category: existing.documentType === "valid_id" ? "id" : "other",
          documentType: existing.documentType,
          isSensitive: isSensitiveDocument(existing.documentType, null),
          status: "draft",
          storageKey: key,
          mimeType: file.type,
          fileSizeBytes: file.size,
          checksumSha256: createHash("sha256").update(body).digest("hex"),
          createdBy: context.userId,
        })
        .returning({ id: documents.id });
      await tx
        .update(contactDocumentRequirements)
        .set({
          status: "submitted",
          documentId: doc.id,
          satisfiedAt: new Date(),
          satisfiedBy: context.userId,
          updatedAt: new Date(),
        })
        .where(eq(contactDocumentRequirements.id, existing.id));
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "contact_document_requirement",
        entityId: existing.id,
        oldValues: { status: existing.status, documentId: existing.documentId },
        newValues: { status: "submitted", documentId: doc.id },
      });
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "contact.requirement_updated",
        summary: `Document uploaded for "${existing.label}".`,
        contactId: existing.contactId,
        documentId: doc.id,
      });
    });
    try {
      revalidatePath(`/contacts/${existing.contactId}`);
    } catch (error) {
      logError("Requirement document saved but refresh failed", error, {
        operation: "requirement_upload_refresh",
        requirementId: existing.id,
      });
    }
    return success({ id: existing.id });
  } catch (error) {
    await storage.remove(key).catch(() => undefined);
    logError("Requirement upload failed", error, { operation: "requirement_upload" });
    return databaseFailure("Couldn't upload the file. Try again.");
  }
}

export async function removeContactRequirement(input: {
  id: string;
}): Promise<RequirementActionResult> {
  const context = await requirePermission("requirements.manage");
  const parsed = requirementDeleteSchema.safeParse(input);
  if (!parsed.success) return notFoundFailure("Document");
  const [existing] = await db
    .select()
    .from(contactDocumentRequirements)
    .where(
      and(
        eq(contactDocumentRequirements.id, parsed.data.id),
        eq(contactDocumentRequirements.organizationId, context.organizationId),
      ),
    )
    .limit(1);
  if (!existing) return notFoundFailure("Document");
  if (
    !(await canAccessResource(context, {
      type: "contact",
      id: existing.contactId,
    }))
  )
    return notFoundFailure("Contact");
  await db.transaction(async (tx) => {
    await tx
      .delete(contactDocumentRequirements)
      .where(eq(contactDocumentRequirements.id, parsed.data.id));
    await tx.insert(auditLogs).values({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "contact_document_requirement",
      entityId: existing.id,
      oldValues: { label: existing.label, status: existing.status },
    });
  });
  revalidatePath(`/contacts/${existing.contactId}`);
  return success({ id: parsed.data.id });
}

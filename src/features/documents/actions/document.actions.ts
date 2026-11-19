"use server";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  activities,
  auditLogs,
  contactDocumentRequirements,
  contacts,
  deals,
  documents,
  properties,
} from "@/db/schema";
import { documentTypeLabel } from "@/features/contacts/lib/contact-options";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
import type { AuthorizationContext } from "@/lib/permissions/policy";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { documentFileError, documentFileTypes } from "@/lib/storage/document-validation";
import { documentMetadataSchema } from "../schemas/document.schema";
import { logError } from "@/lib/logger";
import {
  ActionResult,
  success,
  failureFrom,
  validationFailure,
  validationFailureFromZod,
  databaseFailure,
} from "@/lib/types/action-result";
import { ActionErrorCode } from "@/lib/errors";
import { isSensitiveDocument } from "../lib/document-sensitivity";
import { documentScope, sensitiveDocumentCondition } from "../lib/document-scope";

/** Result of a document action, carrying the id of the affected record. */
export type DocumentResult = ActionResult<{ id: string }>;
const refresh = (id?: string) => {
  revalidatePath("/documents");
  revalidatePath("/documents/archive");
  if (id) revalidatePath(`/documents/${id}`);
};
async function validRelation(
  context: AuthorizationContext,
  type: "contact" | "property" | "deal",
  id: string | null,
) {
  return !id || canAccessResource(context, { type, id });
}
/** The storage category each type is filed under; sensitivity rules key off it. */
const categoryForType: Record<string, string> = {
  valid_id: "id",
  proof_of_income: "proof_of_income",
  tax_return: "proof_of_income",
  bank_statement: "proof_of_income",
  employment_certificate: "proof_of_income",
  reservation_agreement: "reservation",
  contract_to_sell: "contract",
  client_appointment_form: "contract",
};

export async function uploadDocument(formData: FormData): Promise<DocumentResult> {
  const context = await requirePermission("documents.manage");
  const parsed = documentMetadataSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return validationFailureFromZod(parsed.error, "Enter valid document metadata.");
  const file = formData.get("file");
  if (!(file instanceof File)) return validationFailure("Select a file to upload.");
  const fileError = await documentFileError(file);
  if (fileError) return validationFailure(fileError);
  const v = parsed.data;
  const name = v.name || documentTypeLabel(v.documentType);
  const category = categoryForType[v.documentType] ?? "other";
  if (
    !(await validRelation(context, "contact", v.contactId)) ||
    !(await validRelation(context, "property", v.propertyId)) ||
    !(await validRelation(context, "deal", v.dealId))
  )
    return failureFrom(ActionErrorCode.NOT_FOUND, "One or more related records are unavailable.");
  const body = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(body).digest("hex");
  const key = `${context.organizationId}/${new Date().getUTCFullYear()}/${randomUUID()}.${documentFileTypes[file.type]}`;
  const storage = getDocumentStorage();
  try {
    await storage.put(key, body);
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(documents)
        .values({
          organizationId: context.organizationId,
          contactId: v.contactId,
          propertyId: v.propertyId,
          dealId: v.dealId,
          name,
          category,
          documentType: v.documentType,
          isSensitive: isSensitiveDocument(v.documentType, category),
          status: "draft",
          storageKey: key,
          mimeType: file.type,
          fileSizeBytes: file.size,
          checksumSha256: checksum,
          createdBy: context.userId,
        })
        .returning({ id: documents.id });
      // A typed upload for a client fills the matching open requirement.
      if (v.contactId && v.documentType !== "general")
        await tx
          .update(contactDocumentRequirements)
          .set({
            documentId: row.id,
            status: "submitted",
            satisfiedAt: new Date(),
            satisfiedBy: context.userId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(contactDocumentRequirements.contactId, v.contactId),
              eq(contactDocumentRequirements.organizationId, context.organizationId),
              eq(contactDocumentRequirements.documentType, v.documentType),
              isNull(contactDocumentRequirements.documentId),
            ),
          );
      await tx.insert(activities).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        activityType: "document.uploaded",
        summary: `Document uploaded: ${name}.`,
        documentId: row.id,
        contactId: v.contactId,
        propertyId: v.propertyId,
        dealId: v.dealId,
      });
      await tx.insert(auditLogs).values({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "document",
        entityId: row.id,
        newValues: {
          name,
          documentType: v.documentType,
          mimeType: file.type,
          fileSize: file.size,
          checksum,
        },
      });
      return row.id;
    });
    refresh(id);
    return success({ id });
  } catch (error) {
    await storage.remove(key).catch(() => undefined);
    logError("Document upload failed", error, { operation: "document_upload" });
    return databaseFailure("The document could not be uploaded.");
  }
}
/** Same reach as the download route: record scope, sensitivity, and no user onboarding files. */
async function canReachDocument(context: AuthorizationContext, id: string) {
  const [row] = await db
    .select({ id: documents.id })
    .from(documents)
    .leftJoin(contacts, eq(documents.contactId, contacts.id))
    .leftJoin(properties, eq(documents.propertyId, properties.id))
    .leftJoin(deals, eq(documents.dealId, deals.id))
    .where(
      and(
        eq(documents.id, id),
        eq(documents.organizationId, context.organizationId),
        isNull(documents.userId),
        documentScope(context),
        sensitiveDocumentCondition(context),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function archiveDocument(id: string): Promise<DocumentResult> {
  const context = await requirePermission("documents.manage");
  const [before] = await db
    .select({
      id: documents.id,
      status: documents.status,
      name: documents.name,
    })
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.organizationId, context.organizationId)))
    .limit(1);
  if (!before || !(await canReachDocument(context, id)))
    return failureFrom(ActionErrorCode.NOT_FOUND, "Document not found.");
  await db.transaction(async (tx) => {
    await tx
      .update(documents)
      .set({
        status: "archived",
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, id));
    // An archived file no longer counts toward the contact's checklist.
    await tx
      .update(contactDocumentRequirements)
      .set({
        documentId: null,
        status: "not_submitted",
        satisfiedAt: null,
        satisfiedBy: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contactDocumentRequirements.documentId, id),
          eq(contactDocumentRequirements.organizationId, context.organizationId),
        ),
      );
    await tx.insert(activities).values({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      activityType: "document.archived",
      summary: `Document archived: ${before.name}.`,
      documentId: id,
    });
    await tx.insert(auditLogs).values({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "document",
      entityId: id,
      oldValues: { status: before.status },
      newValues: { status: "archived" },
    });
  });
  refresh(id);
  return success({ id });
}

/** Brings an archived document back to the main list as a draft. */
export async function restoreDocument(id: string): Promise<DocumentResult> {
  const context = await requirePermission("documents.manage");
  const [before] = await db
    .select({
      id: documents.id,
      status: documents.status,
      name: documents.name,
      archivedAt: documents.archivedAt,
      contactId: documents.contactId,
      documentType: documents.documentType,
      contactExpired: sql<boolean>`exists (select 1 from "contacts" c where c."id" = ${documents.contactId} and c."expired_at" is not null)`,
    })
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.organizationId, context.organizationId)))
    .limit(1);
  if (!before || !(await canReachDocument(context, id)))
    return failureFrom(ActionErrorCode.NOT_FOUND, "Document not found.");
  // A live document must keep its status; restoring it would also log a false audit entry.
  if (!before.archivedAt) return validationFailure("This document is not archived.");
  // Lead expiry archived it with its contact, who cannot come back.
  if (before.contactExpired)
    return validationFailure("This document belongs to an expired lead and stays archived.");
  await db.transaction(async (tx) => {
    await tx
      .update(documents)
      .set({ status: "draft", archivedAt: null, updatedAt: new Date() })
      .where(eq(documents.id, id));
    // Archiving reopened its checklist item; restoring fills it again unless another file did.
    if (before.contactId && before.documentType && before.documentType !== "general")
      await tx
        .update(contactDocumentRequirements)
        .set({
          documentId: id,
          status: "submitted",
          satisfiedAt: new Date(),
          satisfiedBy: context.userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(contactDocumentRequirements.contactId, before.contactId),
            eq(contactDocumentRequirements.organizationId, context.organizationId),
            eq(contactDocumentRequirements.documentType, before.documentType),
            isNull(contactDocumentRequirements.documentId),
          ),
        );
    await tx.insert(activities).values({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      activityType: "document.restored",
      summary: `Document restored: ${before.name}.`,
      documentId: id,
    });
    await tx.insert(auditLogs).values({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "document",
      entityId: id,
      oldValues: { status: before.status },
      newValues: { status: "draft" },
    });
  });
  refresh(id);
  return success({ id });
}

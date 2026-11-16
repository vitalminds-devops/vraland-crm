import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contactDocumentRequirements, documents, users } from "@/db/schema";
import { canAccessResource, requirePermission } from "@/lib/permissions/authorization";
export type ContactRequirement = {
  id: string;
  documentType: string;
  label: string;
  status: string;
  notes: string | null;
  documentId: string | null;
  documentName: string | null;
  documentMimeType: string | null;
  satisfiedAt: Date | null;
  satisfiedByName: string | null;
  createdAt: Date;
};

export async function listContactRequirements(contactId: string): Promise<ContactRequirement[]> {
  const context = await requirePermission("requirements.view");
  if (!(await canAccessResource(context, { type: "contact", id: contactId }))) return [];
  return db
    .select({
      id: contactDocumentRequirements.id,
      documentType: contactDocumentRequirements.documentType,
      label: contactDocumentRequirements.label,
      status: contactDocumentRequirements.status,
      notes: contactDocumentRequirements.notes,
      documentId: contactDocumentRequirements.documentId,
      documentName: documents.name,
      documentMimeType: documents.mimeType,
      satisfiedAt: contactDocumentRequirements.satisfiedAt,
      satisfiedByName: users.firstName,
      createdAt: contactDocumentRequirements.createdAt,
    })
    .from(contactDocumentRequirements)
    .leftJoin(documents, eq(contactDocumentRequirements.documentId, documents.id))
    .leftJoin(users, eq(contactDocumentRequirements.satisfiedBy, users.id))
    .where(
      and(
        eq(contactDocumentRequirements.contactId, contactId),
        eq(contactDocumentRequirements.organizationId, context.organizationId),
      ),
    )
    .orderBy(asc(contactDocumentRequirements.createdAt));
}

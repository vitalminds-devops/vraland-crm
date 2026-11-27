import "server-only";
import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { contacts, deals, documents, properties, users } from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { grantedPropertyCondition } from "@/lib/permissions/property-access";
import { contactScopeCondition, dealScopeCondition } from "@/lib/permissions/scope";
import { documentScope, sensitiveDocumentCondition } from "../lib/document-scope";
import { canManageSharedFiles, sharedFileCategory } from "../lib/shared-files";
const documentOwner = alias(users, "document_owner");

export async function listDocuments(input: {
  page: number;
  search?: string;
  documentType?: string;
  archived?: boolean;
  shared?: boolean;
}) {
  const context = await requirePermission("documents.view");
  if (input.archived) await requirePermission("documents.archive");
  const limit = 20;
  const where = and(
    eq(documents.organizationId, context.organizationId),
    input.shared ? eq(documents.category, sharedFileCategory) : undefined,
    // Search the file name, the client's name and the deal title.
    input.search
      ? or(
          ilike(documents.name, `%${input.search}%`),
          ilike(
            sql`concat_ws(' ', ${contacts.firstName}, ${contacts.lastName})`,
            `%${input.search}%`,
          ),
          ilike(deals.title, `%${input.search}%`),
        )
      : undefined,
    input.documentType ? eq(documents.documentType, input.documentType) : undefined,
    input.archived ? isNotNull(documents.archivedAt) : isNull(documents.archivedAt),
    isNull(documents.userId),
    documentScope(context),
    sensitiveDocumentCondition(context),
  );
  const [rows, total] = await Promise.all([
    db
      .select({
        id: documents.id,
        name: documents.name,
        category: documents.category,
        documentType: documents.documentType,
        contactId: documents.contactId,
        isSensitive: documents.isSensitive,
        status: documents.status,
        mimeType: documents.mimeType,
        fileSizeBytes: documents.fileSizeBytes,
        signedAt: documents.signedAt,
        createdAt: documents.createdAt,
        contactFirstName: sql<
          string | null
        >`coalesce(${contacts.firstName}, ${documentOwner.firstName})`,
        contactMiddleName: contacts.middleName,
        contactLastName: sql<
          string | null
        >`coalesce(${contacts.lastName}, ${documentOwner.lastName})`,
        propertyTitle: properties.title,
        dealTitle: deals.title,
        creatorFirstName: users.firstName,
        creatorLastName: users.lastName,
      })
      .from(documents)
      .leftJoin(contacts, eq(documents.contactId, contacts.id))
      .leftJoin(documentOwner, eq(documents.userId, documentOwner.id))
      .leftJoin(properties, eq(documents.propertyId, properties.id))
      .leftJoin(deals, eq(documents.dealId, deals.id))
      .leftJoin(users, eq(documents.createdBy, users.id))
      .where(where)
      .orderBy(desc(documents.createdAt))
      .limit(limit)
      .offset((input.page - 1) * limit),
    db
      .select({ value: count() })
      .from(documents)
      .leftJoin(contacts, eq(documents.contactId, contacts.id))
      .leftJoin(properties, eq(documents.propertyId, properties.id))
      .leftJoin(deals, eq(documents.dealId, deals.id))
      .where(where),
  ]);
  return {
    rows,
    total: total[0]?.value ?? 0,
    pages: Math.max(1, Math.ceil((total[0]?.value ?? 0) / limit)),
    canManage: input.shared
      ? canManageSharedFiles(context)
      : context.permissions.has("documents.manage"),
    canArchive: context.permissions.has("documents.archive"),
  };
}
export async function getDocumentOptions() {
  const context = await requirePermission("documents.view");
  const [contactRows, propertyRows, dealRows] = await Promise.all([
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, context.organizationId),
          isNull(contacts.deletedAt),
          contactScopeCondition(context),
        ),
      )
      .orderBy(asc(contacts.lastName))
      .limit(500),
    db
      .select({ id: properties.id, title: properties.title })
      .from(properties)
      .where(
        and(
          eq(properties.organizationId, context.organizationId),
          isNull(properties.deletedAt),
          grantedPropertyCondition(context, { propertyId: properties.id }),
        ),
      )
      .orderBy(asc(properties.title))
      .limit(500),
    db
      .select({ id: deals.id, title: deals.title })
      .from(deals)
      .where(
        and(
          eq(deals.organizationId, context.organizationId),
          isNull(deals.deletedAt),
          dealScopeCondition(context),
        ),
      )
      .orderBy(asc(deals.title))
      .limit(500),
  ]);
  return {
    contacts: contactRows,
    properties: propertyRows,
    deals: dealRows,
  };
}
export async function getDocument(id: string) {
  const context = await requirePermission("documents.view");
  const [record] = await db
    .select({
      document: documents,
      contactFirstName: contacts.firstName,
      contactMiddleName: contacts.middleName,
      contactLastName: contacts.lastName,
      propertyTitle: properties.title,
      dealTitle: deals.title,
    })
    .from(documents)
    .leftJoin(contacts, eq(documents.contactId, contacts.id))
    .leftJoin(properties, eq(documents.propertyId, properties.id))
    .leftJoin(deals, eq(documents.dealId, deals.id))
    .where(
      and(
        eq(documents.id, id),
        eq(documents.organizationId, context.organizationId),
        context.permissions.has("documents.archive") ? undefined : isNull(documents.archivedAt),
        documentScope(context),
        // A non-participant cannot open a sensitive document even with its id.
        sensitiveDocumentCondition(context),
      ),
    )
    .limit(1);
  if (!record) return null;
  if (record.document.userId) return null;
  return {
    ...record,
    canManage: context.permissions.has("documents.manage"),
  };
}
export async function getDownloadRecord(id: string) {
  const context = await requirePermission("documents.view");
  const [row] = await db
    .select({
      id: documents.id,
      userId: documents.userId,
      name: documents.name,
      category: documents.category,
      storageKey: documents.storageKey,
      mimeType: documents.mimeType,
    })
    .from(documents)
    .leftJoin(contacts, eq(documents.contactId, contacts.id))
    .leftJoin(properties, eq(documents.propertyId, properties.id))
    .leftJoin(deals, eq(documents.dealId, deals.id))
    .where(
      and(
        eq(documents.id, id),
        eq(documents.organizationId, context.organizationId),
        context.permissions.has("documents.archive") ? undefined : isNull(documents.archivedAt),
        documentScope(context),
        sensitiveDocumentCondition(context),
      ),
    )
    .limit(1);
  if (!row || row.userId) return null;
  return row;
}

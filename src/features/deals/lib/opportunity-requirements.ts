import "server-only";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { contacts, dealContacts, deals, documents } from "@/db/schema";
import { requiredDocumentLabel } from "@/features/contacts/lib/contact-options";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const VALID_ID_TYPE = "valid_id";
export const APPOINTMENT_TYPE = "client_appointment_form";
const APPOINTMENT_NAME = "Client appointment form";

/** What the lead's primary contact already has on file, for the Opportunity details dialog. */
export async function documentsOnFile(tx: DbTransaction | typeof db, contactId: string) {
  const rows = await tx
    .select({
      id: documents.id,
      documentType: documents.documentType,
      name: documents.name,
      mimeType: documents.mimeType,
    })
    .from(documents)
    .where(
      and(
        eq(documents.contactId, contactId),
        isNull(documents.archivedAt),
        or(
          inArray(documents.documentType, [VALID_ID_TYPE, APPOINTMENT_TYPE]),
          // Appointment forms stored before they had their own type.
          eq(documents.name, APPOINTMENT_NAME),
        ),
      ),
    )
    .orderBy(desc(documents.createdAt));
  const validId = rows.find((row) => row.documentType === VALID_ID_TYPE);
  return {
    validId: Boolean(validId),
    /** The newest valid ID, for a preview. */
    validIdFile: validId ? { id: validId.id, mimeType: validId.mimeType } : null,
    appointmentForm: rows.some(
      (row) => row.documentType === APPOINTMENT_TYPE || row.name === APPOINTMENT_NAME,
    ),
  };
}

/** Why a lead cannot become an opportunity yet, or null when everything is in place. */
export async function missingOpportunityDetails(
  tx: DbTransaction,
  dealId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({
      amount: deals.amount,
      developmentId: deals.developmentId,
      buildingId: deals.propertyId,
      unitId: deals.unitId,
      contactId: contacts.id,
      financing: contacts.financingPreference,
      tinNumber: contacts.tinNumber,
    })
    .from(deals)
    .leftJoin(
      dealContacts,
      and(eq(dealContacts.dealId, deals.id), eq(dealContacts.isPrimary, true)),
    )
    .leftJoin(contacts, eq(dealContacts.contactId, contacts.id))
    .where(eq(deals.id, dealId));
  const missing: string[] = [];
  if (!row?.tinNumber?.trim()) missing.push("TIN number");
  if (!row?.developmentId) missing.push("development");
  if (!row?.buildingId) missing.push("building");
  if (!row?.unitId) missing.push("unit");
  if (!row?.financing) missing.push("financing");
  if (!(Number(row?.amount) > 0)) missing.push("amount");
  const files = row?.contactId
    ? await documentsOnFile(tx, row.contactId)
    : { validId: false, appointmentForm: false };
  if (!files.validId) missing.push(requiredDocumentLabel(VALID_ID_TYPE).toLowerCase());
  if (!files.appointmentForm) missing.push(requiredDocumentLabel(APPOINTMENT_TYPE).toLowerCase());
  return missing.length ? `Add the ${missing.join(", ")} first.` : null;
}

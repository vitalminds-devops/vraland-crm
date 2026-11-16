import { and, eq, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { contacts } from "@/db/schema";

import {
  normalizeContactEmail,
  normalizeFullName,
  normalizedMobileValues,
  type DuplicateCheckInput,
  type DuplicateMatch,
} from "./contact-duplicates";

/** Columns selected to build a duplicate summary. */
const duplicateContactColumns = {
  id: contacts.id,
  contactCode: contacts.contactCode,
  firstName: contacts.firstName,
  lastName: contacts.lastName,
} as const;

export async function findDuplicateMatch(
  organizationId: string,
  input: DuplicateCheckInput,
  options: { excludeContactId?: string } = {},
): Promise<DuplicateMatch | null> {
  const email = normalizeContactEmail(input.email);
  const mobiles = normalizedMobileValues(input);
  const conditions = [];

  if (email) conditions.push(eq(contacts.emailNormalized, email));
  for (const mobile of mobiles)
    conditions.push(
      or(
        eq(contacts.mobilePhoneNormalized1, mobile),
        eq(contacts.mobilePhoneNormalized2, mobile),
        eq(contacts.mobilePhoneNormalized3, mobile),
      ),
    );

  if (conditions.length) {
    const [exact] = await db
      .select({
        ...duplicateContactColumns,
        email: contacts.emailNormalized,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, organizationId),
          isNull(contacts.deletedAt),
          options.excludeContactId ? ne(contacts.id, options.excludeContactId) : undefined,
          or(...conditions),
        ),
      )
      .limit(1);
    if (exact)
      return {
        kind: "exact",
        reason: email && exact.email === email ? "email" : "mobile",
        contact: {
          id: exact.id,
          contactCode: exact.contactCode,
          firstName: exact.firstName,
          lastName: exact.lastName,
        },
      };
  }

  const nameKey = normalizeFullName(input.firstName, input.middleName, input.lastName);
  if (!nameKey) return null;
  const [nameMatch] = await db
    .select(duplicateContactColumns)
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, organizationId),
        isNull(contacts.deletedAt),
        options.excludeContactId ? ne(contacts.id, options.excludeContactId) : undefined,
        eq(
          sql`lower(trim(concat_ws(' ', ${contacts.firstName}, nullif(trim(coalesce(${contacts.middleName}, '')), ''), ${contacts.lastName})))`,
          nameKey,
        ),
      ),
    )
    .limit(1);
  return nameMatch ? { kind: "name", reason: "name", contact: nameMatch } : null;
}

import { sql } from "drizzle-orm";
import { contacts, deals } from "@/db/schema";

/**
 * True for the contact's oldest deal. Only that deal falls back to the contact's own property
 * choices; a lead's extra opportunities (another tower or development) keep their own selection.
 * Needs `deals` and `contacts` in the query, unaliased.
 */
export const isContactsFirstDeal = sql<boolean>`not exists (
  select 1 from deal_contacts dc2 join deals d2 on d2.id = dc2.deal_id
  where dc2.contact_id = ${contacts.id} and d2.deleted_at is null and d2.created_at < ${deals.createdAt})`;

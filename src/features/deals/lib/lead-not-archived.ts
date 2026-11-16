import { sql } from "drizzle-orm";

/**
 * True while the deal's lead (primary contact) is not archived: archiving a contact hides its
 * deals, and restoring the contact brings them back. Table names are explicit because drizzle
 * drops them in single-table selects, which would make `id` ambiguous.
 */
export const leadNotArchived = sql`not exists (
  select 1 from "deal_contacts" dc
  inner join "contacts" c on c."id" = dc."contact_id"
  where dc."deal_id" = "deals"."id" and dc."is_primary" and c."deleted_at" is not null
)`;

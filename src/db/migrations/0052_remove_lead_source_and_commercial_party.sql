-- Lead source and the commercial "Who is buying?" fields (role, owner name, representative) were removed
-- from the CRM. Drop their columns and the lead_sources table; the stored values are deleted.
-- Re-runnable: every drop uses IF EXISTS.
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "lead_source_id";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "commercial_party_role";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "business_owner_name";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "authorized_representative_name";--> statement-breakpoint
ALTER TABLE "deals" DROP COLUMN IF EXISTS "source_id";--> statement-breakpoint
DROP TABLE IF EXISTS "lead_sources";
